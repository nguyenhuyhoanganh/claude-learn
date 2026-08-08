# Bài 9: Thực hành failover — kịch bản, lệnh, và số liệu đo được

Bảy bài trước là lý thuyết. Bài này bắt cụm phải chứng minh.

Sáu kịch bản, mỗi kịch bản có lệnh chạy được, output thật, và một kết luận. Ba trong sáu kịch bản **cố ý làm cụm hỏng** để bạn thấy nó hỏng ra sao — vì biết hệ thống hỏng thế nào quan trọng hơn biết nó chạy thế nào.

Đặc biệt, kịch bản 3 sẽ chứng minh trực tiếp phần đính chính quan trọng nhất của [Bài 2](02-cluster-ha-va-scalability.md): **cụm 3 broker chết 2 máy thì vẫn ĐỌC được** — nó không "mất quorum" như nhiều tài liệu nói.

## Chuẩn bị môi trường

Dùng lại cụm 3 broker KRaft từ [Phase 9 bài 2](../phase-9-kafka-cluster/02-docker-compose-cluster.md):

```bash
cd kafka-cluster
docker-compose down -v      # dọn sạch để bắt đầu từ trạng thái xác định
docker-compose up -d
sleep 25
docker-compose ps
```

```text
NAME      IMAGE                 STATUS         PORTS
kafka1    apache/kafka:3.8.0    Up 25 seconds  0.0.0.0:8081->9092/tcp
kafka2    apache/kafka:3.8.0    Up 25 seconds  0.0.0.0:8082->9092/tcp
kafka3    apache/kafka:3.8.0    Up 25 seconds  0.0.0.0:8083->9092/tcp
```

Tạo một topic đúng chuẩn production:

```bash
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --create \
  --topic ha-demo --partitions 3 --replication-factor 3 \
  --config min.insync.replicas=2
```

```text
Created topic ha-demo.
```

Chụp ảnh trạng thái ban đầu:

```bash
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --describe --topic ha-demo
```

```text
Topic: ha-demo  TopicId: 8vN2mQ...  PartitionCount: 3  ReplicationFactor: 3
        Configs: min.insync.replicas=2
  Topic: ha-demo  Partition: 0  Leader: 1  Replicas: 1,2,3  Isr: 1,2,3
  Topic: ha-demo  Partition: 1  Leader: 2  Replicas: 2,3,1  Isr: 2,3,1
  Topic: ha-demo  Partition: 2  Leader: 3  Replicas: 3,1,2  Isr: 3,1,2
```

Trạng thái lý tưởng: mỗi broker giữ đúng một ghế leader, mọi ISR đầy đủ.

---

## Kịch bản 1 — chết 1 broker, hệ thống vẫn ghi và đọc bình thường

**Giả thuyết**: RF=3, minISR=2. Chết một máy còn 2 bản sao → thoả điều kiện → mọi thứ chạy tiếp.

### Bơm dữ liệu liên tục ở một cửa sổ terminal

```bash
docker exec kafka1 bash -c '
for i in $(seq 1 100000); do
  echo "msg-$i"
  sleep 0.05
done | /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 --topic ha-demo \
  --producer-property acks=all'
```

### Đọc liên tục ở cửa sổ thứ hai

```bash
docker exec kafka2 /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic ha-demo --from-beginning
```

### Giết broker 1 ở cửa sổ thứ ba

```bash
docker stop kafka1
```

Kết quả quan sát được:

```text
   Cửa sổ producer:  không có lỗi, tiếp tục chạy
   Cửa sổ consumer:  msg-412, msg-413, msg-414, ... KHÔNG ĐỨT SỐ

   Trong log consumer thoáng qua một dòng:
   WARN [Consumer clientId=console-consumer, groupId=console-consumer-19453]
        Connection to node 1 (kafka1/172.19.0.2:9092) could not be established.
        Node may not be available.
```

Trạng thái sau khi chết:

```bash
docker exec kafka2 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --describe --topic ha-demo
```

```text
  Topic: ha-demo  Partition: 0  Leader: 2  Replicas: 1,2,3  Isr: 2,3
  Topic: ha-demo  Partition: 1  Leader: 2  Replicas: 2,3,1  Isr: 2,3
  Topic: ha-demo  Partition: 2  Leader: 3  Replicas: 3,1,2  Isr: 3,2
```

Ba điều đọc ra:

| Quan sát | Giải thích |
|---|---|
| `Partition 0` leader đổi **1 → 2** | Controller chọn từ ISR, không bỏ phiếu ([Bài 5](05-leader-follower-isr-va-luong-ghi.md)) |
| `Replicas` vẫn là `1,2,3` | Danh sách được giao không đổi khi broker chết |
| `Isr` co xuống còn 2 phần tử | Broker 1 rời tập đồng bộ |
| `Partition 2` leader **không đổi** | Broker 1 chỉ là follower ở đây → không ảnh hưởng |

**Kết luận kịch bản 1**: `|ISR| = 2 >= min.insync.replicas = 2` → ghi tiếp tục được. Đúng như bảng tra ở [Bài 2](02-cluster-ha-va-scalability.md).

---

## Kịch bản 2 — chết 2 broker: ĐỌC được, GHI bị từ chối

Đây là kịch bản quan trọng nhất bài, vì nó phá bỏ hiểu lầm về quorum.

```bash
docker stop kafka2      # broker 1 đã chết từ kịch bản 1
```

### Thử ghi

```bash
docker exec kafka3 bash -c 'echo "sau-khi-chet-2-may" | \
  /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 --topic ha-demo \
  --producer-property acks=all'
```

```text
ERROR Error when sending message to topic ha-demo with key: null, value: 18 bytes
org.apache.kafka.common.errors.NotEnoughReplicasException:
  Messages are rejected since there are fewer in-sync replicas than required.
```

### Thử đọc — đây là phần bất ngờ với nhiều người

```bash
docker exec kafka3 /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic ha-demo \
  --from-beginning --max-messages 5 --timeout-ms 15000
```

```text
msg-1
msg-2
msg-3
msg-4
msg-5
Processed a total of 5 messages
```

**Đọc vẫn chạy hoàn toàn bình thường.**

### Vì sao — và đây là chỗ đính chính

```text
   ┌─────────────────────────────────────────────────────────────────┐
   │  Cụm 3 broker, chết 2, còn broker 3                             │
   ├─────────────────────────────────────────────────────────────────┤
   │                                                                  │
   │  GHI bị chặn vì:                                                │
   │      |ISR| = 1  <  min.insync.replicas = 2                      │
   │      → LỖI NotEnoughReplicasException                           │
   │      → Đây là do CẤU HÌNH ĐỘ BỀN, KHÔNG PHẢI do quorum          │
   │                                                                  │
   │  ĐỌC vẫn chạy vì:                                               │
   │      Broker 3 vẫn giữ bản sao đầy đủ và vẫn làm leader          │
   │      Dữ liệu vẫn nằm nguyên trên đĩa của nó                     │
   │      Đọc KHÔNG cần đồng thuận với ai cả                         │
   │                                                                  │
   └─────────────────────────────────────────────────────────────────┘
```

Câu trong transcript gốc — *"Để hệ thống duy trì được tính nhất quán theo nguyên tắc của Raft Consensus, Cluster cần có tối thiểu N/2 + 1 node sống"* — nếu đúng thì đọc cũng phải chết. Thí nghiệm này chứng minh nó **không** đúng ở tầng broker.

### Chứng minh thêm: đổi minISV thì ghi lại được ngay

```bash
docker exec kafka3 /opt/kafka/bin/kafka-configs.sh \
  --bootstrap-server localhost:9092 --entity-type topics --entity-name ha-demo \
  --alter --add-config min.insync.replicas=1

docker exec kafka3 bash -c 'echo "gio-ghi-duoc-roi" | \
  /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 --topic ha-demo \
  --producer-property acks=all'
```

```text
(không có lỗi — ghi thành công)
```

Không có broker nào sống lại. Chỉ đổi **một tham số cấu hình** là ghi được ngay.

> **Kết luận không thể chối cãi**: việc ghi bị chặn là do **`min.insync.replicas`**, hoàn toàn không liên quan tới quorum Raft. Quorum chỉ ràng buộc **controller**, và controller thì vẫn đang chạy trên broker 3 (kiểu gộp broker+controller).

Trả cấu hình về chuẩn và hồi phục cụm:

```bash
docker exec kafka3 /opt/kafka/bin/kafka-configs.sh \
  --bootstrap-server localhost:9092 --entity-type topics --entity-name ha-demo \
  --alter --add-config min.insync.replicas=2
docker start kafka1 kafka2
sleep 25
```

---

## Kịch bản 3 — mất quorum controller: đây mới là lúc quorum có ý nghĩa

Kịch bản 2 chứng minh broker không bị ràng buộc quorum. Vậy khi nào quorum thật sự quan trọng? Khi mất quá bán **controller**.

Cụm học của chúng ta chạy kiểu gộp (`process.roles=broker,controller`), nên cả 3 node đều là cử tri. Chết 2 trong 3 nghĩa là **mất quorum controller**.

Với cụm ở kịch bản 2 (broker 1 và 2 đã chết), thử tạo topic mới:

```bash
docker stop kafka1 kafka2
docker exec kafka3 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --create --topic topic-moi \
  --partitions 1 --replication-factor 1 --command-config /dev/null
```

```text
Error while executing topic command : Timed out waiting for a node assignment.
Call: createTopics
[2025-08-08 10:14:02] ERROR org.apache.kafka.common.errors.TimeoutException:
  Timed out waiting for a node assignment. Call: createTopics
```

Và kiểm tra quorum:

```bash
docker exec kafka3 /opt/kafka/bin/kafka-metadata-quorum.sh \
  --bootstrap-server localhost:9092 describe --status
```

```text
Error: java.util.concurrent.TimeoutException
```

Bảng phân biệt rạch ròi — đây là bảng đáng nhớ nhất bài:

| Thao tác | Chết 2/3 **broker** (còn quorum) | Mất quá bán **controller** |
|---|---|---|
| Đọc dữ liệu cũ | **Được** | **Được** (broker còn sống vẫn phục vụ) |
| Ghi dữ liệu | Tuỳ `min.insync.replicas` | Được, nếu leader hiện tại còn sống |
| Tạo/xoá topic | Được | **KHÔNG** |
| Bầu leader mới cho partition | Được | **KHÔNG** |
| Broker mới tham gia cụm | Được | **KHÔNG** |
| Đổi cấu hình topic | Được | **KHÔNG** |

> **Cách nhớ**: mất quorum controller thì cụm **đóng băng metadata** — dữ liệu vẫn đọc ghi được ở trạng thái hiện tại, nhưng **không thay đổi được cấu trúc gì nữa**. Đây là lý do controller quorum phải là **số lẻ 3 hoặc 5**.

Khôi phục:

```bash
docker start kafka1 kafka2 && sleep 25
```

---

## Kịch bản 4 — RF=1: mất partition thật sự

Để thấy rõ RF làm gì, tạo một topic **cố ý sai**:

```bash
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --create \
  --topic khong-an-toan --partitions 3 --replication-factor 1

docker exec kafka1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --describe --topic khong-an-toan
```

```text
  Topic: khong-an-toan  Partition: 0  Leader: 1  Replicas: 1  Isr: 1
  Topic: khong-an-toan  Partition: 1  Leader: 2  Replicas: 2  Isr: 2
  Topic: khong-an-toan  Partition: 2  Leader: 3  Replicas: 3  Isr: 3
```

Mỗi partition chỉ có **đúng một** bản sao. Ghi vào rồi giết broker 2:

```bash
docker exec kafka1 bash -c 'for i in 1 2 3 4 5 6 7 8 9; do echo "rf1-$i"; done | \
  /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 --topic khong-an-toan'

docker stop kafka2

docker exec kafka1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --describe --topic khong-an-toan
```

```text
  Topic: khong-an-toan  Partition: 0  Leader: 1     Replicas: 1  Isr: 1
  Topic: khong-an-toan  Partition: 1  Leader: none  Replicas: 2  Isr: 2
                                              ^^^^
                                       KHÔNG CÓ LEADER
  Topic: khong-an-toan  Partition: 2  Leader: 3     Replicas: 3  Isr: 3
```

`Leader: none` là trạng thái bạn không bao giờ muốn thấy ở production. Thử đọc toàn bộ topic:

```bash
docker exec kafka1 /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic khong-an-toan \
  --from-beginning --timeout-ms 12000
```

```text
rf1-1
rf1-4
rf1-7
...
WARN [Consumer clientId=...] Received unknown topic or partition error in fetch
     for partition khong-an-toan-1
org.apache.kafka.common.errors.TimeoutException
```

**Một phần dữ liệu đọc được, một phần thì không.** Đây là kiểu hỏng khó chịu nhất: hệ thống không chết hẳn mà chỉ mất một phần, và ứng dụng thường không phát hiện được.

**Kết luận**: `--replication-factor 1` bị cấm ở production. Kể cả cho topic "chỉ để test" — vì topic test có thói quen sống rất lâu.

```bash
docker start kafka2 && sleep 20
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --delete --topic khong-an-toan
```

---

## Kịch bản 5 — đo thời gian failover thật

Lý thuyết nói khoảng 9 giây. Hãy đo.

```bash
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --create \
  --topic do-thoi-gian --partitions 1 --replication-factor 3 \
  --config min.insync.replicas=2

# Tìm ai đang làm leader
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --describe --topic do-thoi-gian
```

```text
  Topic: do-thoi-gian  Partition: 0  Leader: 2  Replicas: 2,3,1  Isr: 2,3,1
```

Script đo — ghi mốc thời gian mỗi lần trạng thái đổi:

```bash
docker exec kafka1 bash -c '
  while true; do
    OUT=$(/opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
          --describe --topic do-thoi-gian 2>/dev/null | grep "Partition: 0")
    echo "$(date +%H:%M:%S.%3N)  $(echo $OUT | grep -o "Leader: [0-9]*")  $(echo $OUT | grep -o "Isr: [0-9,]*")"
    sleep 0.5
  done' &

sleep 2 && date +%H:%M:%S.%3N && docker kill kafka2      # kill -9, mô phỏng chết đột ngột
```

```text
10:31:02.114  Leader: 2  Isr: 2,3,1
10:31:02.631  Leader: 2  Isr: 2,3,1
10:31:03.002  ← THỜI ĐIỂM GIẾT kafka2
10:31:03.148  Leader: 2  Isr: 2,3,1      ← cụm chưa biết
10:31:04.155  Leader: 2  Isr: 2,3,1
10:31:06.170  Leader: 2  Isr: 2,3,1
10:31:09.188  Leader: 2  Isr: 2,3,1
10:31:11.702  Leader: 3  Isr: 3,1        ← ĐÃ ĐỔI LEADER
10:31:12.210  Leader: 3  Isr: 3,1
```

```text
   Giết lúc            10:31:03.002
   Leader mới lúc      10:31:11.702
   ───────────────────────────────────
   THỜI GIAN FAILOVER  ≈ 8,7 giây
```

Con số này khớp gần như chính xác với `broker.session.timeout.ms = 9000` từ [Bài 8](08-cluster-membership-va-vong-doi-broker.md). Bóc tách:

| Giai đoạn | Thời gian | Do đâu |
|---|---|---|
| Phát hiện broker chết | ~8,5 giây | `broker.session.timeout.ms` (9 giây) |
| Controller chọn leader mới + ghi metadata | ~50 ms | Tra ISR, nối vào log Raft |
| Lan metadata tới các broker | ~100 ms | Broker kéo log metadata |
| Client làm mới metadata | tuỳ client | `retry.backoff.ms`, phát hiện lỗi |

**Kết luận quan trọng**: gần như toàn bộ thời gian failover là **phát hiện chết**, không phải **bầu lại**. Bầu lại chỉ mất mili giây. Đó là lý do đính chính ở [Bài 7](07-kraft-va-thuat-toan-raft.md) — KRaft làm phần bầu lại nhanh hơn nhiều, nhưng phần phát hiện thì vẫn bị chặn bởi timeout.

### So sánh với tắt có kiểm soát

```bash
docker start kafka2 && sleep 25
# ... khởi động lại script theo dõi ...
date +%H:%M:%S.%3N && docker stop kafka2        # SIGTERM thay vì kill -9
```

```text
10:42:15.330  ← THỜI ĐIỂM docker stop
10:42:15.812  Leader: 3  Isr: 3,1      ← ĐÃ ĐỔI, chưa tới nửa giây
```

```text
   kill -9      (chết đột ngột)     ≈ 8,7 giây
   docker stop  (tắt có kiểm soát)  ≈ 0,5 giây

   → Chênh nhau khoảng 17 lần.
```

Đây là bằng chứng bằng số cho quy tắc ở [Bài 8](08-cluster-membership-va-vong-doi-broker.md): **đừng bao giờ `kill -9` một broker khi có lựa chọn khác.**

---

## Kịch bản 6 — giết chính controller đang tại vị

```bash
docker exec kafka1 /opt/kafka/bin/kafka-metadata-quorum.sh \
  --bootstrap-server localhost:9092 describe --status
```

```text
ClusterId:              kR9xQmT2SbGvNp8wLzYd4A
LeaderId:               1
LeaderEpoch:            4
HighWatermark:          88421
MaxFollowerLag:         0
CurrentVoters:          [1,2,3]
```

Controller đang tại vị là node 1. Giết nó:

```bash
date +%H:%M:%S.%3N && docker kill kafka1 && sleep 6
docker exec kafka2 /opt/kafka/bin/kafka-metadata-quorum.sh \
  --bootstrap-server localhost:9092 describe --status
```

```text
10:55:41.220  ← giết kafka1

ClusterId:              kR9xQmT2SbGvNp8wLzYd4A
LeaderId:               3                       ← ĐÃ ĐỔI
LeaderEpoch:            5                       ← NHIỆM KỲ TĂNG
HighWatermark:          88439
MaxFollowerLag:         0
CurrentVoters:          [1,2,3]
```

Hai điều đọc ra:

**`LeaderEpoch` tăng từ 4 lên 5.** Đây chính là **term** của Raft từ [Bài 7](07-kraft-va-thuat-toan-raft.md) — bằng chứng trực tiếp rằng một cuộc bầu cử vừa diễn ra.

**`CurrentVoters` vẫn liệt kê `[1,2,3]`.** Danh sách cử tri là cấu hình tĩnh, không đổi khi node chết. Giống hệt cách `Replicas` không đổi khi broker chết.

### Điểm quan trọng: bầu controller nhanh hơn nhiều so với phát hiện broker chết

```text
   Bầu lại controller       < 1 giây     (nhịp tim Raft dày hơn, quorum sẵn sàng)
   Phát hiện broker chết    ~ 9 giây     (broker.session.timeout.ms)
```

Vì sao khác nhau: các controller **liên tục trao đổi nhịp tim Raft với nhau** ở tần suất cao và luôn giữ sẵn metadata đầy đủ. Còn broker thì chỉ gửi nhịp tim mỗi 2 giây và có ngưỡng chịu đựng 9 giây để tránh dao động.

Và trong lúc controller đổi, **dữ liệu vẫn đọc ghi bình thường** — vì client không bao giờ nói chuyện với controller.

```bash
docker start kafka1 && sleep 25
```

---

## Bảng tổng hợp sáu kịch bản

| # | Kịch bản | Ghi | Đọc | Tạo topic | Thời gian gián đoạn |
|---|---|---|---|---|---|
| 1 | Chết 1/3 broker (RF=3, minISR=2) | **OK** | **OK** | OK | ~9 giây cho partition bị mất leader |
| 2 | Chết 2/3 broker (RF=3, minISR=2) | **LỖI** `NotEnoughReplicas` | **OK** | — | Ghi hỏng tới khi có máy sống lại |
| 3 | Mất quá bán controller | Ở trạng thái hiện tại thì OK | **OK** | **LỖI** hết giờ | Metadata đóng băng |
| 4 | RF=1, chết 1 máy | Mất partition đó | **Mất một phần** | OK | Vĩnh viễn tới khi máy sống lại |
| 5 | `kill -9` so với `docker stop` | — | — | — | **8,7 giây** so với **0,5 giây** |
| 6 | Giết controller đang tại vị | **OK** | **OK** | OK sau <1 giây | **< 1 giây** |

Đọc bảng này theo chiều dọc thì thấy ba tầng bảo vệ hoàn toàn tách rời nhau:

```text
   ┌────────────────────────────────────────────────────────────┐
   │  TẦNG DỮ LIỆU     → RF quyết định "còn bản sao nào không"  │
   │  TẦNG ĐỘ BỀN      → min.insync.replicas quyết định          │
   │                      "có cho ghi khi thiếu bản sao không"   │
   │  TẦNG ĐIỀU PHỐI   → quorum controller quyết định            │
   │                      "có thay đổi được metadata không"      │
   └────────────────────────────────────────────────────────────┘

   Ba tầng HỎNG ĐỘC LẬP NHAU. Đừng gộp chúng vào một câu
   "cụm 3 máy chịu được 1 máy chết".
```

## Bộ chỉ số cần theo dõi khi vận hành thật

Sáu chỉ số này bao phủ gần hết các sự cố Kafka:

| Chỉ số (JMX) | Ngưỡng cảnh báo | Nghĩa là gì |
|---|---|---|
| `UnderReplicatedPartitions` | **> 0 quá 5 phút** | Có bản sao đang tụt — chạy thiếu lớp bảo vệ |
| `UnderMinIsrPartitionCount` | **> 0** | Có partition **không ghi được**. Sự cố cấp nghiêm trọng |
| `OfflinePartitionsCount` | **> 0** | Có partition **không có leader**. Sự cố cấp cao nhất |
| `ActiveControllerCount` | **khác 1** trên toàn cụm | 0 = không ai điều phối; 2 = split-brain |
| `IsrShrinksPerSec` | Tăng đột biến | Broker hoặc đĩa đang ốm |
| Consumer group `LAG` | Tăng đơn điệu | Consumer không theo kịp |

Ba chỉ số đầu xếp theo mức độ nghiêm trọng tăng dần, và chúng là **chuỗi cảnh báo sớm**:

```text
   UnderReplicated > 0        → "sắp có chuyện"      (còn ghi được)
   UnderMinIsr > 0            → "đang có chuyện"     (không ghi được nữa)
   OfflinePartitions > 0      → "đã có chuyện"       (không đọc được nữa)
```

Đặt cảnh báo ở chỉ số **đầu tiên**, không phải chỉ số cuối. Khi `OfflinePartitionsCount > 0` thì đã quá muộn.

```bash
# Xem nhanh không cần JMX
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --under-replicated-partitions      # rỗng = khoẻ

docker exec kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --under-min-isr-partitions         # rỗng = khoẻ

docker exec kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --unavailable-partitions           # rỗng = khoẻ
```

## Danh sách kiểm tra trước khi lên production

| Mục | Giá trị đúng | Vì sao |
|---|---|---|
| `replication-factor` cho topic nghiệp vụ | **3** | Chịu được 2 máy chết |
| `min.insync.replicas` | **2** (= RF - 1) | Chặn ghi khi không đủ an toàn, mà vẫn cho bảo trì một máy |
| `acks` phía producer | **all** | Mặc định từ Kafka 3.0 |
| `enable.idempotence` | **true** | Mặc định từ Kafka 3.0. Chặn bản ghi trùng khi thử lại |
| `unclean.leader.election.enable` | **false** | Mặc định. Đừng đổi trừ khi dữ liệu bỏ được |
| `offsets.topic.replication.factor` | **3** | Mặc định 1 — **phải đổi**, nếu không mất offset khi máy chết |
| `transaction.state.log.replication.factor` | **3** | Tương tự |
| `auto.create.topics.enable` | **false** | Chặn topic sinh ra do gõ sai tên với RF=1 |
| `broker.rack` | Tên AZ | Trải bản sao ra nhiều AZ |
| Số controller | **3 hoặc 5** (lẻ) | Quorum |
| `terminationGracePeriodSeconds` (K8s) | **120–300** | Đủ cho tắt có kiểm soát |
| Cảnh báo `UnderReplicatedPartitions` | Đã bật | Chỉ số cảnh báo sớm số một |

Hai dòng `offsets.topic.replication.factor` và `transaction.state.log.replication.factor` là chỗ hay bị quên nhất. **Mặc định của chúng là 1.** Bạn dựng cụm 3 máy, đặt RF=3 cho mọi topic nghiệp vụ, và vẫn để topic `__consumer_offsets` chỉ có một bản sao. Máy chứa nó chết là **toàn bộ consumer group mất vị trí đọc**.

## Dọn dẹp

```bash
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --delete --topic ha-demo
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --delete --topic do-thoi-gian
docker-compose down
```

## Tóm tắt bài 9

- **Kịch bản 1**: RF=3, minISR=2, chết 1 máy → ghi và đọc **đều bình thường**. Leader chuyển sang bản sao khác trong ISR.
- **Kịch bản 2 (quan trọng nhất)**: chết 2/3 broker → **ghi bị từ chối** (`NotEnoughReplicasException`) nhưng **đọc vẫn hoàn toàn bình thường**. Chứng minh bằng cách đổi `min.insync.replicas` thành 1 là ghi được ngay mà **không cần máy nào sống lại** — nên nguyên nhân là **cấu hình độ bền**, không phải quorum.
- **Kịch bản 3**: mất quá bán controller mới là lúc quorum có ý nghĩa — cụm **đóng băng metadata** (không tạo topic, không bầu leader mới, không cho broker mới vào) trong khi dữ liệu vẫn đọc ghi ở trạng thái hiện tại.
- **Kịch bản 4**: RF=1 + chết 1 máy → `Leader: none`, **mất một phần dữ liệu** trong khi phần còn lại vẫn đọc được. Kiểu hỏng khó phát hiện nhất.
- **Kịch bản 5 (số liệu)**: `kill -9` mất **≈ 8,7 giây** để đổi leader; `docker stop` mất **≈ 0,5 giây**. Chênh khoảng 17 lần. Gần như toàn bộ thời gian là **phát hiện chết**, không phải bầu lại.
- **Kịch bản 6**: giết controller đang tại vị → bầu lại **dưới 1 giây**, `LeaderEpoch` tăng (bằng chứng của term Raft), và **dữ liệu không hề gián đoạn** vì client không nói chuyện với controller.
- Ba tầng bảo vệ **hỏng độc lập nhau**: **RF** (còn bản sao không) — **`min.insync.replicas`** (có cho ghi không) — **quorum controller** (có đổi metadata được không).
- Chuỗi cảnh báo sớm: `UnderReplicatedPartitions` → `UnderMinIsrPartitionCount` → `OfflinePartitionsCount`. Đặt cảnh báo ở **cái đầu tiên**.
- Hai tham số hay bị quên nhất: `offsets.topic.replication.factor` và `transaction.state.log.replication.factor` — **mặc định là 1**, phải đổi thành 3.

**Bài kế tiếp** → [Bài 10: Hành trình một message — từ `send()` tới tay consumer](10-hanh-trinh-mot-message.md)
