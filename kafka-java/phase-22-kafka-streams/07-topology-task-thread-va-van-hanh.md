# Bài 7: Topology, task, thread và vận hành ứng dụng Streams

Sáu bài trước dạy **viết** ứng dụng Kafka Streams. Bài này dạy **chạy** nó: nó chia việc thế nào, scale ra sao, cấu hình gì cho production, và giám sát chỉ số nào.

Đây là phần quyết định ứng dụng sống được ở production hay không — và cũng là phần mà tài liệu hay bỏ qua nhất.

## Topology — bản thiết kế xử lý

Mọi ứng dụng Kafka Streams đều biên dịch thành một **topology**: đồ thị có hướng gồm các node xử lý.

```java
Topology topology = streamsBuilder.build();
System.out.println(topology.describe());
```

```text
Topologies:
   Sub-topology: 0
    Source: KSTREAM-SOURCE-0000000000 (topics: [orders])
      --> KSTREAM-FILTER-0000000001
    Processor: KSTREAM-FILTER-0000000001 (stores: [])
      --> KSTREAM-KEY-SELECT-0000000002
    Processor: KSTREAM-KEY-SELECT-0000000002 (stores: [])
      --> KSTREAM-SINK-0000000003
    Sink: KSTREAM-SINK-0000000003 (topic: counts-repartition)

   Sub-topology: 1
    Source: KSTREAM-SOURCE-0000000004 (topics: [counts-repartition])
      --> KSTREAM-AGGREGATE-0000000005
    Processor: KSTREAM-AGGREGATE-0000000005 (stores: [product-revenue])
      --> KTABLE-TOSTREAM-0000000006
    Sink: KSTREAM-SINK-0000000007 (topic: product-revenue-out)
```

Ba loại node:

| Loại | Vai trò |
|---|---|
| **Source** | Đọc từ topic Kafka |
| **Processor** | Biến đổi, gộp, join — có thể gắn state store |
| **Sink** | Ghi ra topic Kafka |

### Sub-topology — ranh giới đắt tiền

Topology bị chẻ thành nhiều **sub-topology** tại mỗi chỗ dữ liệu phải **đi vòng qua Kafka**:

```text
   Sub-topology 0  ──►  topic repartition  ──►  Sub-topology 1
                          ▲
                    một chặng Kafka ĐẦY ĐỦ:
                    ghi + nhân bản + đọc lại
```

Suy ra một quy tắc đọc rất hữu ích:

> **Số sub-topology - 1 = số lần dữ liệu đi vòng qua Kafka.** Càng nhiều sub-topology, độ trễ và chi phí càng cao.

In `topology.describe()` ra và đếm là cách nhanh nhất để đánh giá một ứng dụng Streams có được viết tốt hay không. Xem lại [bài 3](03-phep-bien-doi-khong-trang-thai.md) về cách giảm số lần này.

> **Mẹo**: dán output của `describe()` vào trang **kafka-streams-viz** để xem đồ thị trực quan. Rất hữu ích khi topology phức tạp.

## Task — đơn vị chia việc

```text
   Số task = SỐ PARTITION LỚN NHẤT trong các topic đầu vào
             của mỗi sub-topology

   Ví dụ:
     Sub-topology 0 đọc "orders" (6 partition)      → 6 task
     Sub-topology 1 đọc "counts-repartition" (6)    → 6 task
     ────────────────────────────────────────────────────────
     TỔNG                                            12 task
```

Task là đơn vị **không thể chia nhỏ hơn**. Đây là điều quan trọng nhất về scaling:

```text
   ┌─────────────────────────────────────────────────────────────┐
   │  Số instance × số thread MÀ VƯỢT số task                    │
   │  → phần dư NGỒI KHÔNG                                       │
   │                                                              │
   │  Trần song song của ứng dụng Streams = SỐ TASK              │
   │  Và số task do SỐ PARTITION quyết định.                     │
   └─────────────────────────────────────────────────────────────┘
```

Nghĩa là: **muốn scale ứng dụng Streams thì phải tăng partition của topic đầu vào**, không phải chỉ tăng số pod.

Mỗi task gồm:

```text
   Task 0-1  (sub-topology 0, partition 1)
   ├── các node xử lý của sub-topology 0
   ├── consumer đọc orders-P1
   ├── producer ghi ra counts-repartition-P1
   └── state store riêng (nếu sub-topology này có)
```

## Thread — đơn vị thực thi

```properties
num.stream.threads=4        # mặc định 1
```

```text
   ┌──────────── Instance 1 ────────────┐  ┌──────────── Instance 2 ────────────┐
   │  Thread 1 → task 0-0, task 1-0     │  │  Thread 1 → task 0-3, task 1-3     │
   │  Thread 2 → task 0-1, task 1-1     │  │  Thread 2 → task 0-4, task 1-4     │
   │  Thread 3 → task 0-2, task 1-2     │  │  Thread 3 → task 0-5, task 1-5     │
   └────────────────────────────────────┘  └────────────────────────────────────┘

   12 task chia cho 2 instance × 3 thread = 6 luồng → mỗi luồng 2 task
```

Ba quy tắc:

| Quy tắc | Chi tiết |
|---|---|
| Một task **chỉ chạy trên một thread** tại một thời điểm | Không có chuyện hai thread cùng xử lý một partition |
| Một thread **chạy được nhiều task** tuần tự | Task được xử lý theo lượt |
| Kafka Streams tự cân bằng task giữa các thread và instance | Qua cơ chế consumer group |

### Chọn số thread

```text
   num.stream.threads ≈ số lõi CPU của container

   NHƯNG bị chặn trên bởi:
     tổng số thread trong cụm ≤ tổng số task
     (thừa thì ngồi không)
```

Ví dụ tính:

```text
   Topic 6 partition, topology có 2 sub-topology → 12 task
   Chạy 3 pod, mỗi pod 4 thread = 12 thread → khớp hoàn hảo

   Tăng lên 3 pod × 8 thread = 24 thread → 12 thread NGỒI KHÔNG
   Muốn dùng hết thì phải tăng partition lên 12.
```

### Hai cách scale — và cái nào tốt hơn

| | Tăng `num.stream.threads` (dọc) | Tăng số instance (ngang) |
|---|---|---|
| Cách làm | Sửa cấu hình, khởi động lại | Tăng số bản sao |
| Cách ly lỗi | **Kém** — một OOM giết cả pod, mất mọi thread | **Tốt** — mất một pod, các pod khác chạy tiếp |
| Chia lại state store | Không (cùng đĩa) | **Có** — mỗi pod đĩa riêng |
| Rebalance | Không xảy ra | **Có** |
| Hợp với | Tận dụng hết CPU của một máy | **Chịu lỗi và mở rộng thật** |

Thực dụng: **đặt `num.stream.threads` bằng số lõi container (thường 2–4), rồi scale bằng số instance.**

## Exactly-once trong Kafka Streams

Đây là chỗ Kafka Streams mạnh hơn hẳn việc tự viết consumer/producer:

```properties
processing.guarantee=exactly_once_v2
```

**Một dòng cấu hình.** Kafka Streams tự gói ba việc vào một transaction nguyên tử:

```text
   ┌────────────────────────────────────────────────────────┐
   │  MỘT TRANSACTION duy nhất bao gồm:                     │
   │    1. Ghi kết quả ra topic đầu ra                      │
   │    2. Ghi cập nhật state store vào changelog topic     │
   │    3. Commit offset của topic đầu vào                  │
   │                                                         │
   │  Cả ba cùng thành công, hoặc cả ba cùng bị huỷ.        │
   └────────────────────────────────────────────────────────┘
```

Đây chính là thứ mà [Phase 14](../phase-14-transactions/01-transactions-intro.md) phải viết bằng tay khá nhiều code.

| | `at_least_once` (mặc định) | `exactly_once_v2` |
|---|---|---|
| Kết quả trùng khi có sự cố | **Có** | **Không** |
| Trạng thái sai khi có sự cố | **Có thể** | Không |
| `commit.interval.ms` mặc định | 30000 | **100** |
| Độ trễ đầu-cuối | Thấp | **Cao hơn** (commit dày hơn) |
| Thông lượng | Cao | Thấp hơn khoảng 10–25% |
| Consumer hạ nguồn phải đặt | — | **`isolation.level=read_committed`** |

Dòng cuối là bẫy hay gặp: bật EOS ở ứng dụng Streams nhưng consumer hạ nguồn vẫn `read_uncommitted` (mặc định) → **vẫn đọc được cả dữ liệu đã bị huỷ**, và toàn bộ công sức thành vô nghĩa.

> **Giới hạn quan trọng**: `exactly_once_v2` chỉ đúng **trong phạm vi Kafka**. Nếu processor gọi API bên ngoài hay ghi vào database, transaction của Kafka **không bao trùm** được — lời gọi đó sẽ chạy lại khi transaction bị huỷ. Xem [Phase 14 bài 3](../phase-14-transactions/03-eos-myth-summary.md).

`exactly_once_v2` (Kafka 2.5+) hiệu quả hơn nhiều so với `exactly_once` cũ: nó dùng **một producer cho mỗi thread** thay vì một producer cho mỗi task, giảm mạnh chi phí khi có nhiều partition. Bản cũ đã bị đánh dấu lỗi thời.

## Cấu hình production

```yaml
spring:
  cloud:
    stream:
      kafka:
        streams:
          binder:
            brokers: kafka1:9092,kafka2:9092,kafka3:9092
            configuration:
              application.id: order-analytics
              state.dir: /var/lib/kafka-streams          # KHÔNG để /tmp

              num.stream.threads: 4                       # ≈ số lõi
              num.standby.replicas: 1                     # khôi phục nhanh

              processing.guarantee: exactly_once_v2
              replication.factor: 3                       # cho topic nội bộ
              # Từ Kafka 3.x có thể dùng -1 để lấy mặc định của broker

              # Chống rebalance khi khởi động lại có kế hoạch
              # (deploy, đổi cấu hình) — không chia lại task ngay
              session.timeout.ms: 45000

              # Rebalance tăng dần — không dừng cả nhóm
              # (mặc định từ Kafka 2.6 với Streams)
              upgrade.from: null

              # Chống OOM ngoài heap
              rocksdb.config.setter: com.acme.BoundedMemoryRocksDBConfig

              # Bộ đệm ghi
              cache.max.bytes.buffering: 10485760

              # Đừng để lỗi tuần tự hoá giết cả ứng dụng
              default.deserialization.exception.handler: >
                org.apache.kafka.streams.errors.LogAndContinueExceptionHandler
```

Ba dòng đáng nói riêng.

### `replication.factor` cho topic nội bộ

Kafka Streams tự tạo topic changelog và repartition. **Mặc định `replication.factor=1`** — nghĩa là changelog của bạn không có bản sao nào.

```text
   Broker chứa changelog partition đó chết
        → MẤT toàn bộ sao lưu state store
        → không khôi phục được trạng thái
```

Đây là cùng loại bẫy với `offsets.topic.replication.factor` đã cảnh báo ở [Phase 20 bài 9](../phase-20-kafka-internals/09-failover-thuc-hanh-va-so-lieu.md). Luôn đặt **3** ở production.

### Bộ xử lý lỗi giải tuần tự hoá

```text
   MẶC ĐỊNH: LogAndFailExceptionHandler
   → Một bản ghi JSON hỏng làm CHẾT TOÀN BỘ ứng dụng.
   → Khởi động lại → đọc đúng bản ghi đó → chết lại → vòng lặp chết
```

Đây là "message độc" (poison pill) kinh điển. Ba lựa chọn:

| Bộ xử lý | Hành vi | Dùng khi |
|---|---|---|
| `LogAndFailExceptionHandler` (mặc định) | Ghi log rồi **chết** | Không bao giờ được mất bản ghi nào |
| `LogAndContinueExceptionHandler` | Ghi log rồi **bỏ qua** | Phổ biến nhất ở production |
| Tự viết | Đẩy sang DLQ rồi đi tiếp | **Tốt nhất** — không mất dữ liệu, không chết |

```java
public class DlqExceptionHandler implements DeserializationExceptionHandler {

    private KafkaProducer<byte[], byte[]> dlqProducer;

    @Override
    public DeserializationHandlerResponse handle(ProcessorContext context,
                                                 ConsumerRecord<byte[], byte[]> record,
                                                 Exception exception) {
        log.error("Không giải tuần tự hoá được: topic={} partition={} offset={}",
                  record.topic(), record.partition(), record.offset(), exception);

        dlqProducer.send(new ProducerRecord<>(record.topic() + "-dlq",
                                              record.key(), record.value()));
        return DeserializationHandlerResponse.CONTINUE;
    }

    @Override public void configure(Map<String, ?> configs) { /* dựng producer */ }
}
```

Tương tự có `default.production.exception.handler` cho lỗi lúc ghi ra.

## Bắt lỗi không mong đợi

```java
@Bean
public StreamsBuilderFactoryBeanCustomizer customizer() {
    return factoryBean -> factoryBean.setStreamsUncaughtExceptionHandler(ex -> {
        log.error("Lỗi không mong đợi trong Kafka Streams", ex);

        if (ex instanceof TaskCorruptedException) {
            // Trạng thái hỏng — dựng lại task đó, không giết cả ứng dụng
            return StreamsUncaughtExceptionHandler
                    .StreamThreadExceptionResponse.REPLACE_THREAD;
        }
        // Lỗi khác: tắt sạch để Kubernetes khởi động lại pod
        return StreamsUncaughtExceptionHandler
                .StreamThreadExceptionResponse.SHUTDOWN_CLIENT;
    });
}
```

| Phản hồi | Hành vi |
|---|---|
| `REPLACE_THREAD` | Thay thread chết bằng thread mới, ứng dụng chạy tiếp |
| `SHUTDOWN_CLIENT` | Tắt instance này (các instance khác vẫn chạy) |
| `SHUTDOWN_APPLICATION` | Tắt **mọi** instance cùng `application.id` |

Mặc định từ Kafka 2.8 là `SHUTDOWN_CLIENT` — hợp lý với Kubernetes, vì pod chết sẽ được tạo lại.

## Giám sát — sáu chỉ số cần nhất

| Chỉ số JMX | Ngưỡng cảnh báo | Nghĩa là gì |
|---|---|---|
| **Consumer lag** (theo `application.id`) | Tăng đơn điệu | Không theo kịp — nút thắt số một |
| `process-latency-avg` / `-max` | Tăng bất thường | Logic xử lý chậm dần |
| **`dropped-records-total`** | **> 0** | **Mất dữ liệu** do quá grace period ([bài 5](05-cua-so-thoi-gian-windowing.md)) |
| `task-created` / `task-closed` rate | Nhảy liên tục | **Rebalance vòng lặp** |
| `commit-latency-avg` | Cao | Broker chậm, hoặc EOS gây tải |
| **Trạng thái RocksDB**: `block-cache-usage`, `total-sst-files-size` | Tăng không dừng | State store phình — sắp hết đĩa |

Riêng trạng thái ứng dụng thì nên đưa vào health check:

```java
@Component
@RequiredArgsConstructor
public class StreamsHealthIndicator implements HealthIndicator {

    private final StreamsBuilderFactoryBean factoryBean;

    @Override
    public Health health() {
        KafkaStreams streams = factoryBean.getKafkaStreams();
        if (streams == null) {
            return Health.down().withDetail("state", "CHUA_KHOI_TAO").build();
        }
        KafkaStreams.State state = streams.state();
        // REBALANCING là bình thường và tạm thời — đừng báo DOWN vì nó
        return (state == KafkaStreams.State.RUNNING || state == KafkaStreams.State.REBALANCING)
                ? Health.up().withDetail("state", state.name()).build()
                : Health.down().withDetail("state", state.name()).build();
    }
}
```

> **Bẫy Kubernetes**: nếu readiness probe báo DOWN trong lúc `REBALANCING`, Kubernetes sẽ gỡ pod khỏi service → gây thêm rebalance → càng rebalance lâu hơn. **Vòng xoáy chết.** Luôn coi `REBALANCING` là trạng thái khoẻ.

## Triển khai trên Kubernetes

```yaml
apiVersion: apps/v1
kind: StatefulSet          # KHÔNG dùng Deployment — ứng dụng có trạng thái
metadata:
  name: order-analytics
spec:
  replicas: 3
  serviceName: order-analytics
  template:
    spec:
      terminationGracePeriodSeconds: 300      # đủ để đóng sạch
      containers:
        - name: app
          resources:
            requests: { memory: "3Gi", cpu: "2" }
            limits:   { memory: "4Gi", cpu: "4" }
            # Heap 2Gi + RocksDB ngoài heap ~0.5Gi + dự phòng
          env:
            - name: JAVA_OPTS
              value: "-Xmx2g -Xms2g"
          volumeMounts:
            - name: state
              mountPath: /var/lib/kafka-streams
          readinessProbe:
            httpGet: { path: /actuator/health/readiness, port: 8080 }
            initialDelaySeconds: 60           # chờ khôi phục trạng thái
            failureThreshold: 30              # rất khoan dung
  volumeClaimTemplates:
    - metadata: { name: state }
      spec:
        accessModes: [ReadWriteOnce]
        resources: { requests: { storage: 50Gi } }
```

Bốn điểm bắt buộc:

| Điểm | Vì sao |
|---|---|
| **StatefulSet, không Deployment** | Pod cần **danh tính ổn định** và **đĩa bền vững** để giữ RocksDB qua các lần khởi động lại |
| **PersistentVolumeClaim** | Không có nó thì mỗi lần tạo pod là khôi phục toàn bộ changelog |
| `terminationGracePeriodSeconds: 300` | Đóng sạch: commit offset, đóng RocksDB. Mặc định 30 giây thường không đủ |
| `readinessProbe` khoan dung | Khôi phục trạng thái có thể mất nhiều phút |

Bộ nhớ container phải tính **heap + RocksDB ngoài heap + overhead JVM**. Đây là lý do `limits.memory` (4 Gi) lớn hơn hẳn `-Xmx` (2 Gi) — quên khoảng đệm này là `OOMKilled` ([bài 4](04-trang-thai-state-store-va-changelog.md)).

## Đặt lại ứng dụng

Khi cần chạy lại từ đầu hoặc dọn sạch trạng thái:

```bash
# 1. DỪNG MỌI instance trước — bắt buộc
kubectl scale statefulset order-analytics --replicas=0

# 2. Đặt lại offset và xoá topic nội bộ
kafka-streams-application-reset.sh \
  --bootstrap-server kafka1:9092 \
  --application-id order-analytics \
  --input-topics orders,payments \
  --intermediate-topics order-analytics-counts-repartition

# 3. Xoá state store cục bộ trên từng pod (hoặc xoá PVC)
kubectl delete pvc -l app=order-analytics

# 4. Chạy lại
kubectl scale statefulset order-analytics --replicas=3
```

Lệnh `application-reset.sh` làm ba việc: đặt lại offset của topic đầu vào về đầu, **xoá** các topic trung gian, và **đánh dấu xoá** các topic nội bộ. Nó **không** xoá state store cục bộ — bước 3 phải làm tay.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dùng **Deployment** thay StatefulSet | Mỗi lần tạo pod là khôi phục toàn bộ trạng thái |
| Để `replication.factor=1` cho topic nội bộ | Broker chết → **mất sạch sao lưu state store** |
| Giữ `LogAndFailExceptionHandler` mặc định | Một bản ghi hỏng gây **vòng lặp chết** |
| Bật EOS nhưng consumer hạ nguồn `read_uncommitted` | Đọc cả dữ liệu đã bị huỷ — EOS thành vô nghĩa |
| Readiness probe báo DOWN khi `REBALANCING` | Kubernetes gỡ pod → **vòng xoáy rebalance** |
| `terminationGracePeriodSeconds` mặc định 30 | Bị `kill -9` giữa lúc đóng → khôi phục chậm lần sau |
| Tăng thread vượt số task | Thread **ngồi không** |
| Tưởng tăng pod là scale được | Trần là **số task**, do **số partition** quyết định |
| Không tính RocksDB vào giới hạn bộ nhớ | **OOMKilled** với heap dump bình thường |
| Chạy `application-reset.sh` khi app đang chạy | Kết quả khó lường |
| Không giám sát `dropped-records` | Mất dữ liệu im lặng |
| Dùng `exactly_once` cũ thay `exactly_once_v2` | Tốn tài nguyên hơn nhiều khi có nhiều partition |

## Tóm tắt bài 7

- **Topology** là đồ thị xử lý gồm Source, Processor, Sink. Nó bị chẻ thành **sub-topology** tại mỗi chỗ dữ liệu đi vòng qua Kafka — **số sub-topology - 1 = số lần đi vòng**, và đó là chi phí lớn nhất.
- **Task** là đơn vị chia việc, và **số task = số partition lớn nhất của topic đầu vào** mỗi sub-topology. Task là **trần song song** — thêm pod hay thread vượt quá số task thì phần dư ngồi không. **Muốn scale phải tăng partition.**
- **Thread**: đặt `num.stream.threads` ≈ số lõi container, rồi **scale bằng số instance** — vì instance cho cách ly lỗi và chia lại state store, còn thread thì không.
- **`processing.guarantee=exactly_once_v2`** gói ba việc (ghi kết quả, ghi changelog, commit offset) vào **một transaction** — đây là thứ Kafka Streams làm bằng một dòng mà tự viết thì tốn rất nhiều code. Nhưng consumer hạ nguồn **phải đặt `isolation.level=read_committed`**, và EOS chỉ đúng **trong phạm vi Kafka**.
- **`replication.factor` cho topic nội bộ mặc định là 1** — phải đổi thành **3**, nếu không broker chết là mất sạch sao lưu state store.
- **Bộ xử lý lỗi giải tuần tự hoá mặc định làm chết cả ứng dụng** khi gặp một bản ghi hỏng, và khởi động lại sẽ gặp lại chính nó → **vòng lặp chết**. Dùng `LogAndContinue`, hoặc tốt nhất là tự viết đẩy sang DLQ.
- Trên Kubernetes: **StatefulSet + PVC** (không phải Deployment), `terminationGracePeriodSeconds` 300, readiness probe **khoan dung và coi `REBALANCING` là khoẻ** — nếu không sẽ tạo **vòng xoáy rebalance**.
- Giới hạn bộ nhớ container phải là **heap + RocksDB ngoài heap + overhead**, thường gấp đôi `-Xmx`.
- Sáu chỉ số cần giám sát: **consumer lag**, `process-latency`, **`dropped-records`**, tần suất `task-created/closed`, `commit-latency`, dung lượng RocksDB.
- `kafka-streams-application-reset.sh` để chạy lại từ đầu — **phải dừng mọi instance trước**, và nó **không xoá state store cục bộ**, phải xoá tay.

**Bài kế tiếp** → [Bài 8: ksqlDB và khi nào không nên dùng Kafka Streams](08-ksqldb-va-khi-nao-khong-dung.md)
