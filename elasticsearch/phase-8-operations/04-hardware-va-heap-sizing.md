# Bài 4: Hardware và Heap Sizing

ES chạy JVM → heap size + hardware spec quyết định performance. Bài này: best practices.

## Heap size — quan trọng nhất

ES = Java app → JVM heap.

### Rule 1: Heap = 50% RAM, max 30 GB

```text
RAM 16 GB → heap 8 GB
RAM 32 GB → heap 16 GB
RAM 64 GB → heap 30 GB     # Không hơn!
RAM 128 GB → heap 30 GB + chia nhiều node
```

**Why 50%?**
- Half cho heap (data structure ES).
- Half cho **OS file cache** — Lucene segment read từ disk, OS cache vào RAM → cực nhanh.

**Why 30 GB max?**

JVM dùng **compressed object pointers** (32-bit thay 64-bit) khi heap ≤ ~32 GB. Tiết kiệm memory 30%, faster.

Vượt 32 GB → switch sang full 64-bit pointer → mất hết tiết kiệm + có khi chậm hơn 30 GB heap.

→ **30.5 GB là max practical**. Higher = waste.

### Rule 2: Xms = Xmx

```text
ES_JAVA_OPTS="-Xms16g -Xmx16g"
```

→ Same initial + max → JVM không resize. Predictable performance, no GC churn.

### Rule 3: Multiple node thay vì heap lớn

RAM 128 GB → KHÔNG dùng 1 node heap 60 GB. **Sai**.

Chia 2 node:
- 2 ES instance trên cùng machine, mỗi node heap 30 GB.
- Hoặc 2 machine 64 GB, mỗi machine 1 node 30 GB heap.

→ Tận dụng compressed pointers. Tăng parallel.

## Memory layout production

```text
Machine 64 GB RAM:
├── ES JVM heap     30 GB     (Xms=30g, Xmx=30g)
├── OS file cache   30 GB     (auto)
└── OS + buffer      4 GB
```

→ Lucene cache (segment files) trong OS file cache → query super fast khi cache hit.

## Disk

### SSD strongly recommended

ES read pattern = random access nhỏ. HDD seek time = killer.

```text
HDD random IOPS: ~100
SSD random IOPS: ~10,000 - 100,000
NVMe IOPS: ~500,000+
```

→ SSD cho hot data **bắt buộc**. Cold tier OK với HDD.

### Size

Rule of thumb:

```text
Disk size = data size × 2 (overhead + replica) × headroom 30%
```

Vd: 1 TB data × 2 × 1.3 = ~2.6 TB disk per node.

### Watermarks

ES có disk-based shard allocation:

```text
Low watermark:    85%   ES không allocate shard mới vào node
High watermark:   90%   ES move shards ra
Flood stage:      95%   ES read-only mọi index trên node (!!)
```

→ Vượt flood = cluster effectively dead. Monitor disk usage, alert 80%.

Set thấp hơn cho production:

```text
"cluster.routing.allocation.disk.watermark.low":  "80%"
"cluster.routing.allocation.disk.watermark.high": "85%"
```

## CPU

ES không cực kỳ CPU-bound. Default ok cho most workload.

Cores giúp:
- Parallel search (mỗi shard 1 thread search).
- Parallel bulk index.
- Background merge.

Recommend: **8-16 cores per data node** cho production heavy.

## Network

Cluster nodes giao tiếp constant (gossip, shard sync, query coordinate).

Recommend:
- **1-10 Gbps** intra-cluster.
- Latency < 5ms (cùng datacenter).
- Cross-DC cluster = slow, anti-pattern.

→ Cluster ES **không nên span data centers** trừ khi specific setup (cross-cluster search).

## Node roles

```text
Master nodes:        Coordinate cluster state
                     RAM: 4-8 GB heap, disk: 50 GB SSD
                     CPU: 4 cores
                     Count: 3 (lẻ cho quorum)

Data nodes:          Lưu data
                     RAM: 32-64 GB (heap 30 GB)
                     Disk: 1-4 TB SSD
                     CPU: 8-16 cores
                     Count: scale theo data

Coordinator nodes:   Route + merge query
                     RAM: 16-32 GB (heap 16 GB)
                     Disk: 50 GB
                     CPU: 8 cores
                     Count: 2-3 (load balance)

Ingest nodes:        Pre-processing pipeline
                     Similar to coordinator
                     Optional (default node có role này)

ML nodes (paid):     Run anomaly detection
                     RAM heavy
```

→ Production: tách roles. Dev/POC: combined.

Set node role qua config:

```yaml
node.roles: ["data", "data_hot"]
```

## Heap GC tuning

Default G1GC OK 99% case. Tinker chỉ khi GC pause > 1 sec.

Monitor GC:

```text
GET /_nodes/stats/jvm
```

Field `gc.collectors.young.collection_time_in_millis` — total GC young pause.

→ Nếu spike → investigate (data hot spot, query heavy).

## Swap = anti-pattern

Linux swap pages out heap → ES freeze.

**Disable swap**:

```bash
sudo swapoff -a
```

Persist: comment out swap line in `/etc/fstab`.

Hoặc bootstrap memory lock:

```yaml
bootstrap.memory_lock: true
```

→ JVM lock heap pages, OS không thể swap.

## File descriptors

ES open nhiều file (mỗi segment 1+ file). Default Linux limit 1024 = quá ít.

```bash
# /etc/security/limits.conf
elasticsearch  soft  nofile  65535
elasticsearch  hard  nofile  65535
```

→ ES require min 65535.

## Virtual memory

ES mmap segment files → cần `vm.max_map_count` high:

```bash
sudo sysctl -w vm.max_map_count=262144
```

Default 65535 → ES fail start. Bài Phase 1 setup đã cover.

## Cost optimization

```text
Hot tier:    SSD, big RAM    $$$
Warm tier:   SSD, medium     $$
Cold tier:   HDD, small      $
Frozen:      S3 backed       $ (object storage rates)
```

→ ILM (bài 3) auto-tier. Tiết kiệm 70-80% so all-hot.

Cloud:
- AWS: EBS gp3 cho hot, S3 cho frozen.
- GCP: Persistent Disk SSD, Cloud Storage Coldline.
- Azure: Premium SSD, Blob Cool.

## Real-world sizing checklist

Production 100 GB/day ingestion:

```text
□ 3 master nodes (4 GB heap, 50 GB SSD)
□ 6 data nodes (32 GB heap, 2 TB SSD each)
□ 2 coordinator nodes (16 GB heap)
□ 1-2 ML nodes if paid features
□ Disk watermarks set 80/85/90
□ Heap = 50% RAM, ≤ 30 GB
□ swap off, mlockall on
□ vm.max_map_count = 262144
□ file descriptors = 65535
□ Network < 5ms intra-cluster
```

## Tóm tắt

- **Heap = 50% RAM, max 30 GB** (compressed pointer limit).
- Xms = Xmx. Multiple node nhỏ thay 1 node lớn.
- **OS file cache** (other 50% RAM) crucial cho Lucene performance.
- **SSD strongly recommend** cho hot tier. NVMe lý tưởng.
- Disk watermarks: low 85%, high 90%, flood 95% — monitor!
- Production tách **node roles** (master + data + coordinator + ML).
- Disable swap. `mlockall: true`.
- `vm.max_map_count = 262144`, file descriptors 65535.
- Cost: ILM tiering tiết kiệm 70-80%.

---

→ [Bài tiếp theo: Monitoring](05-monitoring.md)
