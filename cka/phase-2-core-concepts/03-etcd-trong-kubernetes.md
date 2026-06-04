# Bài 3: ETCD — Cơ sở dữ liệu của toàn bộ cluster

## Vì sao etcd quan trọng đến mức cần học riêng?

Mỗi lần bạn gõ `kubectl get pods` — dữ liệu **đến từ etcd**. Mỗi lần bạn `kubectl apply -f deployment.yaml` — thay đổi **được ghi vào etcd**. Mọi state của cluster (Pod, Service, ConfigMap, RBAC, Node info, ...) đều nằm trong etcd.

→ **etcd hỏng = cluster mất trí nhớ**. Recover bằng backup. Backup etcd hỏng = phải build lại cluster từ đầu.

Bài này dạy bạn:
- etcd là gì, hoạt động ra sao.
- Cách etcd lưu state K8s.
- Lệnh thao tác etcd (cho cả 2 trường hợp: cluster kubeadm và scratch).
- Vì sao etcd phải HA (sẽ deep-dive ở Phase 6).

## etcd là gì?

> **etcd** = distributed, reliable, key-value store, simple, secure, fast.

Phân tích từng từ:

| Đặc tính | Ý nghĩa |
|---|---|
| **Distributed** | Chạy nhiều node để HA (3, 5 hoặc 7) |
| **Reliable** | Dùng Raft consensus → đảm bảo strong consistency |
| **Key-value** | Lưu data dưới dạng `key → value`, không phải table/document |
| **Simple** | Cài 1 binary là chạy được |
| **Secure** | Hỗ trợ TLS (client + peer) + auth |
| **Fast** | > 10k write/s, low latency (single-digit ms) |

## Key-value store khác Relational DB như thế nào?

Bạn quen với MySQL/PostgreSQL → relational. Nhưng K8s không dùng RDBMS — vì sao?

### Relational DB (SQL)

```text
Table: users
┌─────┬───────┬──────────┬─────────┬────────┐
│ id  │ name  │ location │ salary  │ grade  │
├─────┼───────┼──────────┼─────────┼────────┤
│ 1   │ John  │ NY       │ 5000    │ NULL   │
│ 2   │ Alice │ LA       │ NULL    │ A      │  ← Empty cell
│ 3   │ Bob   │ Chicago  │ 6000    │ NULL   │  ← Empty cell
└─────┴───────┴──────────┴─────────┴────────┘
```

- **Schema cứng**: Mọi row có **cùng cột**.
- Thêm cột mới → ảnh hưởng toàn bảng, có cell trống.
- Tốt cho **complex query** (JOIN, GROUP BY, ...).
- Cứng nhắc — không phù hợp data đa dạng.

### Document store (MongoDB)

```text
Document 1 (John):           Document 2 (Alice):
{                            {
  "name": "John",              "name": "Alice",
  "location": "NY",            "location": "LA",
  "salary": 5000               "grade": "A"
}                            }
```

- **Mỗi document có schema riêng** — không cần đồng nhất.
- Linh hoạt — thêm field cho 1 doc không ảnh hưởng doc khác.
- Query phức tạp khó (so với SQL).

### Key-value store (etcd)

```text
key: name                         value: John
key: location                     value: NY
key: salary                       value: 5000
key: /users/john                  value: {name:"John", loc:"NY", salary:5000}
```

- Đơn giản nhất: **map key → value**.
- Value có thể là string, số, hoặc JSON đầy đủ.
- Query: chỉ get theo key hoặc prefix.
- **Fast** (O(1) lookup nếu hash, O(log n) nếu B-tree).

→ K8s chọn key-value vì cần **fast read/write + simple model + reliable consensus**, không cần SQL phức tạp.

## So sánh nhanh 3 mô hình storage

| | Relational (SQL) | Document (MongoDB) | Key-Value (etcd) |
|---|---|---|---|
| Schema | Strict | Optional | None |
| Complex query | ✓✓✓ | ✓ | ✗ |
| Performance | Good | Good | **Excellent** |
| Flexibility | Low | Medium | **High** |
| Use case | Structured data | Semi-structured | Fast lookup + config |

## Cài etcd standalone (để hiểu cơ bản)

Bạn có thể chạy etcd ngoài K8s để học:

```bash
# Tải binary từ GitHub release
ETCD_VER=v3.5.10
wget https://github.com/etcd-io/etcd/releases/download/${ETCD_VER}/etcd-${ETCD_VER}-linux-amd64.tar.gz
tar xzf etcd-*.tar.gz
cd etcd-*-linux-amd64

# Chạy server (mặc định listen 2379)
./etcd
# Server bind:
# - 2379: cho client
# - 2380: cho peer (giao tiếp giữa các etcd node)
```

Trong môi trường thực, etcd luôn chạy như **systemd service** hoặc **K8s static Pod** — không chạy bằng tay.

## Dùng etcdctl — Command line client

`etcdctl` là client mặc định để thao tác etcd:

```bash
# Set key
etcdctl put name "John"

# Get key
etcdctl get name
# OUTPUT:
# name
# John

# Get with prefix
etcdctl get --prefix /registry

# Delete
etcdctl del name

# Watch (theo dõi thay đổi)
etcdctl watch /registry/pods
```

### Cảnh báo về phiên bản API

**v2 và v3 dùng command khác nhau**:

| Mục đích | v2 (cũ, blog cũ) | v3 (hiện tại) |
|---|---|---|
| Set key | `etcdctl set key value` | `etcdctl put key value` |
| Get | `etcdctl get key` | `etcdctl get key` |
| Delete | `etcdctl rm key` | `etcdctl del key` |
| Transactions | Không support | Support |

Trong K8s hiện đại, **dùng v3**. Set env var bắt buộc:

```bash
export ETCDCTL_API=3
```

Nếu không set, lệnh `put`/`del` báo unknown command.

Check version:
```bash
etcdctl version
# etcdctl version: 3.5.10
# API version: 3.5
```

## etcd trong Kubernetes lưu gì?

Mọi K8s resource. Cấu trúc thư mục:

```text
/registry/
├── pods/
│   ├── default/
│   │   ├── nginx-7c5b...
│   │   └── redis-abc...
│   └── kube-system/
│       └── etcd-master
├── services/
│   ├── default/
│   │   ├── kubernetes
│   │   └── nginx
│   └── ...
├── deployments/
│   └── default/
│       └── nginx
├── replicasets/
├── configmaps/
├── secrets/
├── namespaces/
├── nodes/
├── apiregistration.k8s.io/apiservices/
├── rbac.authorization.k8s.io/clusterroles/
└── ... (mỗi resource type 1 thư mục)
```

Mọi `kubectl get` → đọc từ thư mục tương ứng. Mọi `kubectl apply` → ghi vào.

## Cách check etcd trong cluster kubeadm

Trong cluster cài bằng `kubeadm`, etcd chạy như **static Pod** trong `kube-system`:

```bash
kubectl get pods -n kube-system | grep etcd
# etcd-master   1/1   Running   2 (5d ago)   30d

# Thông tin chi tiết
kubectl describe pod etcd-master -n kube-system
# Image: registry.k8s.io/etcd:3.5.10-0
# Container ports: 2379, 2380, 2381
# Mount: /etc/kubernetes/pki/etcd → certs
```

Vì etcd chạy như Pod, để query nó:

```bash
# Exec vào etcd Pod
kubectl exec -it etcd-master -n kube-system -- sh

# Trong Pod, gõ:
ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  get / --prefix --keys-only
```

→ Liệt kê **mọi key** etcd đang lưu. Bạn sẽ thấy hàng nghìn key dạng `/registry/...`.

Lệnh dài quá → tạo alias:

```bash
alias etcd-ctl='ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key'

etcd-ctl get / --prefix --keys-only
```

## etcd trong cluster scratch (không kubeadm)

Nếu cluster cài tay (không kubeadm), etcd chạy như **systemd service** trên master node:

```bash
# Trên master node
systemctl status etcd
# ● etcd.service - etcd
#    Loaded: loaded (/etc/systemd/system/etcd.service; enabled)
#    Active: active (running)

# Config file
cat /etc/systemd/system/etcd.service
# [Unit]
# Description=etcd
#
# [Service]
# ExecStart=/usr/local/bin/etcd \
#   --name etcd-master \
#   --data-dir=/var/lib/etcd \
#   --listen-client-urls https://192.168.1.10:2379,https://127.0.0.1:2379 \
#   --advertise-client-urls https://192.168.1.10:2379 \
#   --listen-peer-urls https://192.168.1.10:2380 \
#   --initial-advertise-peer-urls https://192.168.1.10:2380 \
#   --initial-cluster etcd-master=https://192.168.1.10:2380 \
#   --cert-file=/etc/etcd/server.crt \
#   --key-file=/etc/etcd/server.key \
#   --client-cert-auth=true \
#   --trusted-ca-file=/etc/etcd/ca.crt \
#   --peer-cert-file=... \
#   ...
```

Các flag quan trọng:

| Flag | Ý nghĩa |
|---|---|
| `--data-dir` | Nơi lưu data trên disk |
| `--listen-client-urls` | Lắng nghe client (kube-apiserver) ở URL nào |
| `--advertise-client-urls` | URL etcd "quảng bá" cho client biết — apiserver dùng URL này |
| `--listen-peer-urls` | Lắng nghe etcd node khác (peer) |
| `--initial-cluster` | Danh sách các etcd node trong cluster |
| `--cert-file`, `--key-file` | TLS cert cho client connection |

## etcd HA — Vì sao 3, 5, 7 mà không phải 2, 4, 6?

etcd dùng **Raft consensus** — yêu cầu **quorum (đa số)** để commit write:

```text
3-node cluster: quorum = 2 (1 node chết → vẫn quorum)
5-node cluster: quorum = 3 (2 node chết → vẫn quorum)
7-node cluster: quorum = 4 (3 node chết → vẫn quorum)
```

**Số lẻ** vì sao? 4-node cũng cần quorum 3 → cũng chỉ chịu 1 node chết, không tốt hơn 3-node mà tốn thêm tài nguyên. → Luôn dùng **số lẻ**.

Khuyến nghị:
- **3 node**: Đa số cluster nhỏ-trung.
- **5 node**: Cluster lớn, nhu cầu HA cao.
- **7 node**: Hiếm dùng — write performance giảm.
- **Không bao giờ chạy 1 etcd cho production** (single point of failure).

Phase 6 sẽ chi tiết về backup/restore etcd — kỹ năng được test nặng trong CKA.

## Các operation thực tế bạn cần biết cho CKA

### 1. Đếm số resource

```bash
# Số Pod
etcd-ctl get /registry/pods --prefix --keys-only | wc -l

# Số ConfigMap
etcd-ctl get /registry/configmaps --prefix --keys-only | wc -l
```

### 2. Xem snapshot status

```bash
ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=... --cert=... --key=... \
  endpoint status --write-out=table
```

### 3. Backup snapshot

```bash
ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=... --cert=... --key=... \
  snapshot save /backup/etcd-snapshot-$(date +%F).db
```

### 4. Restore snapshot

```bash
ETCDCTL_API=3 etcdctl snapshot restore /backup/etcd-snapshot.db \
  --data-dir=/var/lib/etcd-restored
# Sau đó update etcd config trỏ --data-dir mới
# Restart etcd
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Không set `ETCDCTL_API=3` | `unknown command "put"` | Luôn set env trước hoặc dùng `--api-version=3` |
| Backup etcd không backup cert | Restore thành công nhưng apiserver không connect | Backup `/etc/kubernetes/pki/etcd/` cùng |
| Single etcd node production | Mất etcd = mất cluster | Tối thiểu 3 etcd node |
| Để etcd cùng host với app heavy | etcd lag → cluster bất ổn | Dedicate host cho etcd |
| Chỉ backup data-dir, không backup config | Khó reproduce setup | Backup cả `/etc/systemd/system/etcd.service` |
| Không kiểm tra disk I/O | etcd slow disk → cluster slow | etcd cần SSD, IOPS cao |

## Tóm tắt bài 3

- **etcd** = distributed key-value store, là **DB duy nhất** của K8s cluster.
- Mọi K8s resource lưu ở `/registry/<resource>/<namespace>/<name>`.
- Dùng **etcdctl** + **ETCDCTL_API=3** để query/backup.
- Trong cluster kubeadm: etcd là **static Pod** trong `kube-system`.
- Trong cluster scratch: etcd là **systemd service** trên master.
- HA: **3, 5, 7 node** (số lẻ vì Raft quorum). Không bao giờ chạy 1 node production.
- Backup/restore etcd là **kỹ năng bắt buộc** cho CKA — sẽ deep-dive ở Phase 6.

**Bài kế tiếp** → [Bài 4: Kube-API Server — cổng vào duy nhất của cluster](04-kube-api-server.md)
