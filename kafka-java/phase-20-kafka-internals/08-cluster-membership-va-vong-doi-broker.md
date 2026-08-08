# Bài 8: Vòng đời một broker — tham gia cụm, nhịp tim, rời cụm

Ba container Kafka khởi động trong `docker-compose up`. Vài giây sau chúng thành một cụm. Chuyện gì đã xảy ra giữa hai thời điểm đó?

Câu hỏi này nghe như chi tiết vụn vặt, nhưng nó là gốc rễ của ba nhóm sự cố hay gặp nhất khi vận hành: **broker khởi động lên nhưng không tham gia cụm**, **broker chết mà cụm không nhận ra trong nhiều phút**, và **khởi động lại lần lượt (rolling restart) làm gián đoạn dịch vụ**. Bài này đi qua toàn bộ vòng đời, có log thật.

## Trước khi khởi động: định dạng ổ lưu trữ

Ở chế độ KRaft có một bước bắt buộc mà chế độ ZooKeeper không có: **định dạng thư mục dữ liệu**.

```bash
# Bước 1 — sinh một mã định danh cụm, CHỈ MỘT LẦN cho cả cụm
/opt/kafka/bin/kafka-storage.sh random-uuid
```

```text
kR9xQmT2SbGvNp8wLzYd4A
```

```bash
# Bước 2 — định dạng thư mục dữ liệu của TỪNG broker bằng CÙNG mã đó
/opt/kafka/bin/kafka-storage.sh format \
  --config /opt/kafka/config/server.properties \
  --cluster-id kR9xQmT2SbGvNp8wLzYd4A
```

```text
Formatting metadata directory /var/lib/kafka/data with metadata.version 3.8-IV0.
```

Việc này tạo ra file `meta.properties`:

```bash
cat /var/lib/kafka/data/meta.properties
```

```text
#
#Fri Aug 08 09:12:44 UTC 2025
node.id=1
directory.id=xQ8vNmT2SbGvNp8wLzYd4A
version=1
cluster.id=kR9xQmT2SbGvNp8wLzYd4A
```

File này là **thẻ căn cước** của broker. Mỗi lần khởi động, broker đọc nó và kiểm tra:

```text
   ┌────────────────────────────────────────────────────────────┐
   │  cluster.id trong meta.properties                          │
   │           SO SÁNH VỚI                                      │
   │  cluster.id mà controller quorum đang dùng                 │
   ├────────────────────────────────────────────────────────────┤
   │  KHỚP    → cho phép tham gia                               │
   │  LỆCH    → TỪ CHỐI, broker tự tắt                          │
   └────────────────────────────────────────────────────────────┘
```

Lỗi khi lệch:

```text
ERROR Exiting Kafka due to fatal exception during startup.
kafka.common.InconsistentClusterIdException: The Cluster ID kR9xQmT2SbGvNp8wLzYd4A
doesn't match stored clusterId Some(pL3zXnR7TaHwQm2vKcBd9F) in meta.properties.
The broker is trying to join the wrong cluster. Configured zookeeper.connect may be wrong.
```

Cơ chế này tồn tại để chặn một tai nạn rất thật: **broker của cụm staging vô tình trỏ vào cụm production**, rồi ghi đè metadata và phá dữ liệu. Không có `cluster.id`, tai nạn đó im lặng và không cứu được.

> **Bẫy hay gặp nhất ở dev**: chạy `docker-compose down -v` (xoá volume) rồi `up` lại, nhưng một container còn giữ volume cũ với `cluster.id` khác → container đó không lên được. Cách xử lý: xoá sạch mọi volume, hoặc định dạng lại toàn bộ với cùng một mã.

## Broker khởi động — sáu bước, có log thật

```text
   ┌────────────────────────────────────────────────────────────────┐
   │ 1. ĐỌC meta.properties → lấy node.id và cluster.id             │
   ├────────────────────────────────────────────────────────────────┤
   │ 2. QUÉT LẠI LOG trên đĩa                                       │
   │    Mở mọi thư mục partition, đọc phần đuôi segment cuối,        │
   │    khôi phục LEO của từng bản sao                              │
   │    ← BƯỚC NÀY LÂU NHẤT nếu broker có nhiều partition           │
   ├────────────────────────────────────────────────────────────────┤
   │ 3. NỐI TỚI CONTROLLER QUORUM (controller.quorum.voters)        │
   ├────────────────────────────────────────────────────────────────┤
   │ 4. ĐĂNG KÝ — gửi BrokerRegistrationRequest                     │
   │    kèm: node.id, danh sách listener, phiên bản, tính năng      │
   │    → controller cấp một BROKER EPOCH (số phiên đăng ký)        │
   ├────────────────────────────────────────────────────────────────┤
   │ 5. KÉO LOG METADATA từ offset 0 (hoặc từ snapshot)             │
   │    → dựng bản sao đầy đủ metadata cụm trong RAM                │
   │    → biết mình phải làm leader/follower cho partition nào      │
   ├────────────────────────────────────────────────────────────────┤
   │ 6. GỠ RÀO (unfence) — báo controller "tôi đã bắt kịp"          │
   │    → controller mới cho phép broker này nhận vai trò leader    │
   │    → broker mở cổng cho client                                 │
   └────────────────────────────────────────────────────────────────┘
```

Log thật khi khởi động (đã lược bớt):

```text
[2025-08-08 09:12:45,102] INFO [SharedServer id=1] Starting SharedServer (kafka.server.SharedServer)
[2025-08-08 09:12:45,340] INFO [LogLoader partition=order-events-0, dir=/var/lib/kafka/data]
        Loading producer state till offset 18437 with message format version 2
[2025-08-08 09:12:45,512] INFO [BrokerServer id=1] Transition from SHUTDOWN to STARTING
[2025-08-08 09:12:45,668] INFO [BrokerLifecycleManager id=1] Incarnation xQ8vNmT2... of broker 1
        in cluster kR9xQmT2SbGvNp8wLzYd4A is now STARTING.
[2025-08-08 09:12:45,904] INFO [BrokerLifecycleManager id=1] Successfully registered broker 1
        with broker epoch 27
[2025-08-08 09:12:46,201] INFO [BrokerServer id=1] Waiting for the broker to be unfenced
[2025-08-08 09:12:46,733] INFO [BrokerLifecycleManager id=1] The broker has been unfenced.
        Transitioning from RECOVERY to RUNNING.
[2025-08-08 09:12:46,801] INFO [BrokerServer id=1] Transition from STARTING to STARTED
[2025-08-08 09:12:46,845] INFO [KafkaServer id=1] started (kafka.server.KafkaServer)
```

### "Fenced" — khái niệm quan trọng nhất trong bài này

**Fenced** (bị rào) là trạng thái broker **đã đăng ký nhưng chưa được giao việc**.

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  BROKER ĐANG BỊ RÀO (fenced)                                 │
   ├──────────────────────────────────────────────────────────────┤
   │  ✓ Đã đăng ký với controller, có mặt trong metadata          │
   │  ✓ Đang kéo log metadata để bắt kịp                          │
   │  ✗ KHÔNG được làm leader cho partition nào                   │
   │  ✗ KHÔNG được tính vào ISR                                   │
   │  ✗ Client KHÔNG được định tuyến tới                          │
   └──────────────────────────────────────────────────────────────┘
```

Vì sao cần trạng thái này? Giả sử không có:

```text
   KHÔNG CÓ RÀO
   ════════════
   t=0   Broker 2 khởi động, đăng ký xong sau 200 ms
   t=0   Controller thấy broker 2 sống → giao ngay leader cho 500 partition
   t=0   Nhưng broker 2 CHƯA đọc xong metadata, CHƯA quét xong log trên đĩa
   t=0   Client được chỉ tới broker 2
   t=0   Broker 2 trả lỗi cho mọi request — nó chưa biết gì cả

   → Khởi động lại một broker gây ra một đợt lỗi cho client.
```

Có rào thì broker chỉ được giao việc **sau khi đã sẵn sàng thật**. Đây là lý do khởi động lại lần lượt trong KRaft mượt hơn hẳn thời ZooKeeper.

Ba lý do một broker bị rào:

| Lý do | Cách nhận biết | Xử lý |
|---|---|---|
| Đang khởi động, chưa bắt kịp metadata | Log có `Waiting for the broker to be unfenced` | Bình thường, chờ vài giây |
| **Nhịp tim quá hạn** | Broker sống nhưng bị rào lại giữa chừng | Kiểm tra mạng tới controller, GC dừng dài |
| Chưa quét xong log trên đĩa | Bước 2 kéo dài rất lâu | Broker có quá nhiều partition, hoặc đĩa chậm |

Trường hợp thứ ba đáng nhấn: **broker có 10.000 bản sao partition có thể mất vài phút chỉ để quét lại log lúc khởi động.** Đây là chi phí ẩn của việc tạo quá nhiều partition mà [Bài 7](07-kraft-va-thuat-toan-raft.md) đã cảnh báo.

## Nhịp tim — cách cụm biết ai còn sống

```text
   KRAFT
   ═════
   ┌──────────┐  BrokerHeartbeatRequest mỗi 2 giây  ┌────────────┐
   │ Broker 1 │ ──────────────────────────────────► │ Controller │
   │          │ ◄────────────────────────────────── │  (active)  │
   └──────────┘   trả lời: có được gỡ rào không,    └────────────┘
                  metadata mới tới offset nào
```

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `broker.heartbeat.interval.ms` | 2000 (2 giây) | Broker gửi nhịp tim mỗi bao lâu |
| `broker.session.timeout.ms` | 9000 (9 giây) | Không nghe nhịp tim quá lâu này thì controller tuyên bố broker chết |

Tỉ lệ 2 giây / 9 giây nghĩa là **bỏ lỡ khoảng 4 nhịp liên tiếp** mới bị tuyên bố chết. Đây là đệm cố ý để chịu được một lần GC dừng dài hoặc một cú chập mạng ngắn.

So sánh với chế độ ZooKeeper:

| | ZooKeeper | KRaft |
|---|---|---|
| Cơ chế | Phiên (session) ZooKeeper + znode EPHEMERAL | Nhịp tim trực tiếp tới controller |
| Thời gian phát hiện chết | `zookeeper.session.timeout.ms`, mặc định **18 giây** | `broker.session.timeout.ms`, mặc định **9 giây** |
| Đường đi | Broker → ZooKeeper → controller theo dõi znode | Broker → controller (**thẳng**) |
| Số bước phải đúng | 3 | 1 |

KRaft phát hiện chết nhanh gấp đôi, và bớt một hệ thống trung gian có thể hỏng.

### Bẫy: đừng giảm timeout để "phát hiện nhanh hơn"

Suy nghĩ tự nhiên: giảm `broker.session.timeout.ms` từ 9 giây xuống 3 giây để failover nhanh hơn. Đây là bẫy kinh điển.

```text
   TIMEOUT 3 GIÂY
   ══════════════
   Broker khoẻ mạnh gặp một lần GC dừng 3,5 giây
   → bỏ lỡ nhịp tim
   → controller tuyên bố CHẾT
   → chuyển leader cho hàng trăm partition sang máy khác
   → broker "sống lại" 0,5 giây sau, đăng ký lại
   → controller chuyển leader NGƯỢC LẠI
   → client phải làm mới metadata HAI LẦN

   Hiện tượng này gọi là DAO ĐỘNG (flapping).
   Nó gây gián đoạn NHIỀU HƠN là để broker chết thật.
```

Quy tắc: **timeout phải lớn hơn khoảng dừng GC tệ nhất của bạn, có dư.** Nếu p99.9 của GC là 2 giây, để 9 giây là hợp lý. Muốn failover nhanh hơn thì hãy đi giảm GC, đừng giảm timeout.

## Xem ba broker tham gia cụm — thực hành

```bash
cd kafka-cluster && docker-compose up -d
docker-compose logs kafka1 kafka2 kafka3 | grep -E "Successfully registered|unfenced" 
```

```text
kafka3 | [09:12:44,261] INFO [BrokerLifecycleManager id=3] Successfully registered broker 3 with broker epoch 25
kafka1 | [09:12:44,277] INFO [BrokerLifecycleManager id=1] Successfully registered broker 1 with broker epoch 26
kafka2 | [09:12:44,300] INFO [BrokerLifecycleManager id=2] Successfully registered broker 2 with broker epoch 27
kafka3 | [09:12:44,912] INFO [BrokerLifecycleManager id=3] The broker has been unfenced.
kafka1 | [09:12:44,934] INFO [BrokerLifecycleManager id=1] The broker has been unfenced.
kafka2 | [09:12:44,981] INFO [BrokerLifecycleManager id=2] The broker has been unfenced.
```

Ba điều đọc ra:

**Thứ tự đăng ký là ngẫu nhiên.** Ở đây broker 3 đăng ký trước, rồi 1, rồi 2 — lệch nhau vài chục mili giây. Thứ tự này **không có ý nghĩa gì**, nó chỉ phản ánh container nào khởi động xong trước. Đừng suy diễn "broker 3 quan trọng hơn".

**Đăng ký và gỡ rào là hai mốc khác nhau**, cách nhau khoảng 600 ms ở đây. Khoảng giữa là lúc broker kéo metadata và quét log.

**Broker epoch tăng dần** (25, 26, 27). Đây là số phiên đăng ký, tăng mỗi lần **bất kỳ** broker nào đăng ký. Nó cho controller phân biệt "broker 1 của lần khởi động này" với "broker 1 của lần khởi động trước" — quan trọng khi một broker chết rồi sống lại nhanh.

### Xác nhận cụm đã thành hình

```bash
/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 \
  | grep -E "^kafka[0-9]"
```

```text
kafka1:9092 (id: 1 rack: null) -> (
kafka2:9092 (id: 2 rack: null) -> (
kafka3:9092 (id: 3 rack: null) -> (
```

Ba broker, nhìn thấy từ **một** điểm kết nối duy nhất. Đây là bằng chứng của cơ chế bootstrap đã học ở [Phase 3](../phase-3-kafka-fundamentals/01-core-concepts-cluster.md): bạn hỏi một broker, nó trả về bản đồ toàn cụm.

`rack: null` — chưa đặt `broker.rack`. Ở dev thì không sao; ở production nhiều AZ thì đây là thiếu sót cần sửa (xem [Bài 2](02-cluster-ha-va-scalability.md)).

## Broker rời cụm — hai kiểu, khác nhau rất nhiều

### Kiểu 1 — tắt có kiểm soát (controlled shutdown)

Xảy ra khi bạn gửi tín hiệu `SIGTERM`: `docker stop`, `systemctl stop kafka`, `kill` thường.

```text
   1. Broker nhận SIGTERM
   2. Broker BÁO TRƯỚC cho controller: "tôi sắp tắt"
   3. Controller CHUYỂN TRƯỚC mọi vai trò leader của broker này
      sang các bản sao khác trong ISR
   4. Controller báo lại: "xong, anh tắt được rồi"
   5. Broker đẩy dữ liệu xuống đĩa, đóng file, thoát

   Thời gian client bị ảnh hưởng: gần như bằng 0
   (leader đã chuyển XONG trước khi broker thật sự tắt)
```

### Kiểu 2 — chết đột ngột

Xảy ra khi `kill -9`, mất điện, hết bộ nhớ, đứt mạng.

```text
   t=0     Broker chết. Không kịp báo ai.
   t=0..9  Controller vẫn tưởng broker sống. Client vẫn được chỉ tới đó.
           → MỌI REQUEST TỚI BROKER NÀY ĐỀU LỖI
   t=9s    Hết broker.session.timeout.ms → controller tuyên bố chết
   t=9s    Controller chọn leader mới cho mọi partition broker đó đang giữ
   t=9s+   Client nhận NOT_LEADER_OR_FOLLOWER → làm mới metadata → thử lại

   Thời gian client bị ảnh hưởng: khoảng 9 giây + thời gian bầu lại
```

Bảng so sánh:

| | Tắt có kiểm soát | Chết đột ngột |
|---|---|---|
| Leader chuyển khi nào | **Trước** khi tắt | **Sau** khi hết timeout |
| Client bị ảnh hưởng | Gần như không | Khoảng 9 giây trở lên |
| Log có mất không | Không (đã flush) | Có thể mất phần chưa flush khỏi page cache |
| Khởi động lại | Nhanh | Chậm hơn (phải khôi phục log) |
| Dùng khi nào | **Mọi thao tác có kế hoạch** | Chỉ khi máy thật sự hỏng |

> **Quy tắc vận hành**: đừng bao giờ `kill -9` một Kafka broker khi có lựa chọn khác. Và phải đặt thời gian chờ tắt đủ dài — Kubernetes mặc định `terminationGracePeriodSeconds=30`, thường **không đủ** cho broker nhiều partition. Đặt 120–300 giây.

### Xem điều đó xảy ra

```bash
docker stop kafka1
docker exec kafka2 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --describe --topic order-events
```

Ngay sau khi tắt:

```text
Topic: order-events  Partition: 0  Leader: 2  Replicas: 1,2,3  Isr: 2,3
Topic: order-events  Partition: 1  Leader: 2  Replicas: 2,3,1  Isr: 2,3
Topic: order-events  Partition: 2  Leader: 3  Replicas: 3,1,2  Isr: 3,2
```

Đọc kỹ ba dòng:

- `Partition: 0` đổi leader từ **1** sang **2**. Broker 1 đã tắt.
- `Replicas` vẫn liệt kê đủ `1,2,3` — danh sách được giao **không đổi**.
- `Isr` co từ `1,2,3` xuống `2,3` — broker 1 rời tập đồng bộ.
- `Partition: 2` vẫn do broker 3 làm leader, **không đổi gì** — vì broker 1 chỉ là follower của partition này.

Chi tiết cuối cùng đó là điểm mấu chốt của kiến trúc: **một broker chết chỉ ảnh hưởng những partition mà nó đang làm leader**, không ảnh hưởng toàn cụm.

### Bật lại và xem cụm tự lành

```bash
docker start kafka1
sleep 20
docker exec kafka2 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --describe --topic order-events
```

```text
Topic: order-events  Partition: 0  Leader: 2  Replicas: 1,2,3  Isr: 2,3,1
Topic: order-events  Partition: 1  Leader: 2  Replicas: 2,3,1  Isr: 2,3,1
Topic: order-events  Partition: 2  Leader: 3  Replicas: 3,1,2  Isr: 3,2,1
```

ISR đã đầy lại: broker 1 quay về. Nhưng chú ý điều này:

```text
   Partition 0:  Replicas: 1,2,3   Leader: 2
                           ▲                ▲
                    leader ƯU TIÊN     leader THỰC TẾ
                    là broker 1        vẫn là broker 2
```

Broker 1 **không tự lấy lại ghế leader** ngay. Cụm đang lệch tải — broker 2 giữ 2 leader, broker 1 giữ 0. Xử lý:

```bash
/opt/kafka/bin/kafka-leader-election.sh --bootstrap-server localhost:9092 \
  --election-type PREFERRED --all-topic-partitions
```

Hoặc để Kafka tự làm — mặc định `auto.leader.rebalance.enable=true` sẽ cân bằng lại sau khoảng `leader.imbalance.check.interval.seconds` (mặc định 300 giây).

> **Vì sao không cân bằng ngay lập tức**: chuyển leader làm client phải làm mới metadata. Nếu một broker chập chờn lên xuống, cân bằng ngay mỗi lần sẽ gây một chuỗi gián đoạn. Chờ một lúc là cố ý.

## Khởi động lại lần lượt — quy trình chuẩn

Đây là thao tác bạn sẽ làm thường xuyên nhất ở production (nâng cấp, đổi cấu hình, vá bảo mật):

```text
   VỚI MỖI BROKER, THEO THỨ TỰ, MỘT MÁY MỘT LÚC:

   1. KIỂM TRA TRƯỚC:  UnderReplicatedPartitions == 0
      → Nếu khác 0, DỪNG LẠI. Cụm đang ốm, đừng làm nó ốm thêm.

   2. Tắt CÓ KIỂM SOÁT (SIGTERM, chờ tắt hẳn)

   3. Làm việc cần làm (đổi cấu hình, nâng phiên bản)

   4. Khởi động lại

   5. CHỜ tới khi:
      - Broker đã unfenced (xem log)
      - UnderReplicatedPartitions về lại 0
      ← BƯỚC NÀY CÓ THỂ MẤT NHIỀU PHÚT nếu broker phải kéo lại nhiều dữ liệu

   6. Cân bằng lại leader (hoặc chờ tự động)

   7. Chỉ khi đó mới sang broker kế tiếp
```

Sai lầm phổ biến nhất là **bỏ qua bước 5**. Khởi động lại broker 2 trong khi broker 1 chưa nhân bản xong nghĩa là có partition chỉ còn một bản sao đồng bộ — và nếu broker 3 gặp sự cố lúc đó thì mất dữ liệu.

```bash
# Kiểm tra bước 1 và bước 5
/opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --under-replicated-partitions
```

Cụm khoẻ thì lệnh này **không in ra gì cả**. Có dòng nào là chưa được khởi động lại tiếp.

## Điều gì xảy ra ở phía client

Đây là phần hay bị bỏ qua, mà lại là thứ ứng dụng của bạn thật sự cảm nhận:

```text
   t=0     Broker 1 chết. Client vẫn giữ metadata cũ: "P0 leader = broker 1"
   t=0     Client gửi ProduceRequest tới broker 1 → kết nối lỗi
   t=0     Client đánh dấu metadata là cũ, lên lịch làm mới
   t=+     Client hỏi một broker khác trong bootstrap → nhận metadata mới
   t=+     Metadata mới có thể VẪN nói leader là broker 1
           (nếu controller chưa kịp phát hiện chết)
           → client thử lại, lại lỗi, lại làm mới
   t=9s    Controller tuyên bố broker 1 chết, chọn broker 2 làm leader
   t=9s+   Client nhận metadata mới đúng → gửi tới broker 2 → THÀNH CÔNG
```

Các tham số client quyết định trải nghiệm này:

| Tham số | Mặc định | Vai trò |
|---|---|---|
| `retries` | `Integer.MAX_VALUE` | Số lần thử lại. Mặc định gần như vô hạn |
| `delivery.timeout.ms` | 120000 (2 phút) | **Trần thật sự** — quá thời gian này thì bỏ cuộc dù `retries` còn |
| `retry.backoff.ms` | 100 | Chờ giữa hai lần thử |
| `metadata.max.age.ms` | 300000 (5 phút) | Làm mới metadata định kỳ dù không có lỗi |
| `reconnect.backoff.max.ms` | 1000 | Trần thời gian chờ nối lại, có tăng dần |

Nhìn vào bảng này thì rõ vì sao demo failover thường "không thấy gì xảy ra": `delivery.timeout.ms` mặc định là **2 phút**, trong khi failover chỉ mất khoảng 9–15 giây. Producer tự thử lại và thành công **trước khi** hết giờ. Ứng dụng không hề nhận exception.

> Đây chính là điều được chứng minh trong demo của khoá gốc ([Phase 9 bài 2](../phase-9-kafka-cluster/02-docker-compose-cluster.md)): tắt lần lượt từng broker mà producer/consumer vẫn chạy, không mất message nào. Cơ chế nằm ở đây — **thử lại tự động cộng với làm mới metadata**, không phải phép màu.

Điều kiện để nó hoạt động:

| Điều kiện | Nếu thiếu |
|---|---|
| RF ≥ 2 | Không có bản sao nào để lên leader → mất partition |
| `delivery.timeout.ms` > thời gian failover | Producer bỏ cuộc giữa chừng và ném lỗi |
| `enable.idempotence=true` | Thử lại có thể sinh **bản ghi trùng** |
| Consumer commit offset đúng cách | Có thể xử lý lại hoặc bỏ sót message |

Dòng thứ ba đáng nhấn: **thử lại mà không có idempotence thì sinh dữ liệu trùng.** Producer gửi, broker ghi xong nhưng phản hồi bị mất, producer tưởng lỗi nên gửi lại → hai bản ghi giống nhau. Từ Kafka 3.0, `enable.idempotence=true` là mặc định và chặn chuyện này bằng cặp `(producerId, sequence)` đã thấy ở [Bài 4](04-giai-phau-broker-topic-partition-replica.md).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| `kill -9` broker | Mất phần chưa flush, client lỗi ~9 giây | Luôn dùng tắt có kiểm soát |
| `terminationGracePeriodSeconds=30` trên Kubernetes | Kubernetes `kill -9` giữa lúc tắt có kiểm soát | Đặt 120–300 giây |
| Giảm `broker.session.timeout.ms` để failover nhanh | Broker khoẻ bị đá ra khi GC dừng → dao động | Giữ mặc định, đi tối ưu GC |
| Khởi động lại broker kế tiếp khi chưa hết under-replicated | Có lúc chỉ còn một bản sao đồng bộ → nguy cơ mất dữ liệu | Chờ `--under-replicated-partitions` trả về rỗng |
| Volume cũ có `cluster.id` khác | Broker từ chối khởi động | Xoá volume hoặc định dạng lại đúng mã |
| Nghĩ broker khởi động lại là lấy lại leader ngay | Cụm lệch tải âm thầm | Chạy `kafka-leader-election.sh` hoặc chờ tự động |
| Không đặt `broker.rack` | Bản sao có thể dồn vào một AZ | Đặt bằng tên AZ |
| Tắt `enable.idempotence` | Thử lại sinh bản ghi trùng | Để mặc định `true` |
| Broker có 10.000+ partition | Khởi động mất nhiều phút để quét log | Giảm số partition, hoặc chấp nhận và tính vào cửa sổ bảo trì |

## Tóm tắt bài 8

- Ở KRaft phải **định dạng ổ lưu trữ** trước lần khởi động đầu tiên. `meta.properties` chứa `node.id` và `cluster.id` — **thẻ căn cước** ngăn broker tham gia nhầm cụm.
- Khởi động gồm sáu bước, trong đó **quét lại log trên đĩa** thường là bước lâu nhất và tỉ lệ thuận với số partition trên máy đó.
- **Fenced** (bị rào) = đã đăng ký nhưng chưa được giao việc. Nhờ nó, khởi động lại một broker **không** gây đợt lỗi cho client.
- Nhịp tim KRaft: gửi mỗi **2 giây**, tuyên bố chết sau **9 giây** (bỏ lỡ khoảng 4 nhịp). ZooKeeper thì 18 giây và đi vòng qua một hệ thống trung gian.
- **Đừng giảm `broker.session.timeout.ms`** để failover nhanh — một cú GC dừng dài sẽ gây **dao động**, gián đoạn nhiều hơn là để broker chết thật.
- **Tắt có kiểm soát chuyển leader TRƯỚC khi tắt** → client gần như không bị ảnh hưởng. **Chết đột ngột** thì client lỗi khoảng 9 giây trở lên. Đừng `kill -9`.
- Broker chết chỉ ảnh hưởng những partition **nó đang làm leader**, không ảnh hưởng toàn cụm.
- Broker khởi động lại **không tự lấy lại ghế leader ngay** — cụm lệch tải cho tới khi cân bằng lại (`kafka-leader-election.sh` hoặc tự động sau ~300 giây).
- Quy trình khởi động lại lần lượt: kiểm tra `--under-replicated-partitions` rỗng **trước và sau** mỗi máy. Bỏ qua bước chờ này là nguồn gốc của sự cố mất dữ liệu khi bảo trì.
- Lý do demo failover "không thấy gì xảy ra": `delivery.timeout.ms` mặc định **2 phút**, dài hơn nhiều so với ~9–15 giây failover. Producer tự thử lại và thành công. Cần **RF ≥ 2** và **`enable.idempotence=true`** để không sinh bản trùng.

**Bài kế tiếp** → [Bài 9: Thực hành failover — kịch bản, lệnh, và số liệu đo được](09-failover-thuc-hanh-va-so-lieu.md)
