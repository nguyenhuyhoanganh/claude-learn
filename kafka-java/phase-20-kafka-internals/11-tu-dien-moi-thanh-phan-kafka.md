# Bài 11: Từ điển mọi thành phần Kafka — làm gì, giải quyết gì, hỏng ra sao

Bài này là **bảng tra cứu**, không phải bài đọc một mạch. Mỗi mục trả lời đúng bốn câu:

1. **Nó là gì** — định nghĩa gọn.
2. **Nó giải bài toán gì** — không có nó thì đau ở đâu.
3. **Trong thực tế** — con số, mặc định, hoặc chỗ nó lộ ra.
4. **Hỏng thì sao** — triệu chứng nhận biết.

Giữ bài này mở khi đọc log Kafka hoặc khi debug.

---

## Nhóm 1 — hạ tầng cụm

### Cluster (cụm)

- **Là gì**: tập các broker biết về nhau, phục vụ như một hệ thống duy nhất.
- **Giải bài toán**: một máy thì chết là mất tất, và không scale được.
- **Thực tế**: nhỏ nhất nên là 3 máy. Ứng dụng viết code y hệt cho cụm 1 hay 100 máy.
- **Hỏng**: xem [Bài 9](09-failover-thuc-hanh-va-so-lieu.md) — ba tầng hỏng độc lập nhau.

### Broker

- **Là gì**: **một tiến trình Kafka** giữ bản sao partition và phục vụ client. Nhận diện bằng `node.id`.
- **Giải bài toán**: chỗ chứa dữ liệu và năng lực xử lý (**dung lượng**).
- **Thực tế**: production một máy một broker. Mỗi broker nên giữ khoảng **2.000–4.000 bản sao partition**, không hơn.
- **Hỏng**: chỉ ảnh hưởng những partition **nó đang làm leader**. Phát hiện sau `broker.session.timeout.ms` (9 giây).

### Controller

- **Là gì**: broker được giao vai trò điều phối cụm. **Đúng một controller tại vị** tại mỗi thời điểm.
- **Giải bài toán**: phải có người quyết định "ai làm leader partition nào" — nếu mỗi broker tự quyết thì mâu thuẫn.
- **Thực tế**: đặt bằng `process.roles`. Cụm lớn nên tách 3 hoặc 5 máy chuyên dụng.
- **Hỏng**: bầu lại **dưới 1 giây** (KRaft). Client không bị ảnh hưởng vì client không nói chuyện với controller. Mất **quá bán** controller → cụm **đóng băng metadata**.

### Controller quorum

- **Là gì**: nhóm các node có role `controller`, bầu lẫn nhau bằng **Raft**.
- **Giải bài toán**: chống **split-brain** — không bao giờ có hai controller cùng ra lệnh.
- **Thực tế**: luôn **số lẻ 3 hoặc 5**. `controller.quorum.voters=1@h1:9093,2@h2:9093,3@h3:9093`.
- **Hỏng**: mất quá bán → không tạo được topic, không bầu được leader mới, broker mới không vào được cụm.

### `node.id` và `cluster.id`

- **Là gì**: `node.id` duy nhất cho từng broker; `cluster.id` giống nhau cho cả cụm.
- **Giải bài toán**: `cluster.id` ngăn broker của cụm staging vô tình tham gia cụm production.
- **Thực tế**: nằm trong `meta.properties`. Sinh bằng `kafka-storage.sh random-uuid`, dùng một lần cho cả cụm.
- **Hỏng**: lệch → `InconsistentClusterIdException`, broker tự tắt. Hay gặp khi volume Docker cũ còn sót.

### Listener và `advertised.listeners`

- **Là gì**: `listeners` = broker mở cổng nào; `advertised.listeners` = broker **khai báo với client** cách kết nối tới mình.
- **Giải bài toán**: cùng một broker được nhìn thấy bằng địa chỉ khác nhau tuỳ người gọi ở đâu (trong Docker, ngoài host, cross-VPC).
- **Thực tế**: chi tiết ở [Phase 9 bài 1](../phase-9-kafka-cluster/01-replication-listeners.md).
- **Hỏng**: triệu chứng kinh điển — kết nối được `localhost:9092` nhưng gửi thì lỗi, vì broker khai báo tên nội bộ Docker mà máy host không phân giải được.

### `broker.rack`

- **Là gì**: khai báo broker này nằm ở rack hoặc AZ nào.
- **Giải bài toán**: ép controller **trải bản sao ra các rack khác nhau**.
- **Thực tế**: đặt bằng tên AZ (`ap-southeast-1a`). Một dòng cấu hình, khác biệt lớn.
- **Hỏng**: không đặt → các bản sao có thể dồn vào một AZ → mất AZ đó là mất partition dù RF=3.

---

## Nhóm 2 — dữ liệu

### Topic

- **Là gì**: **cái tên** gom các sự kiện cùng loại. Khái niệm **logic cấp cụm**.
- **Giải bài toán**: tổ chức — tách "đơn hàng" khỏi "thanh toán".
- **Thực tế**: **không** nằm trên broker nào. Trên đĩa chỉ có thư mục `order-events-0`, không có `order-events`.
- **Hỏng**: không có khái niệm "topic hỏng"; hỏng luôn ở mức partition.

### Partition

- **Là gì**: một dãy bản ghi **có thứ tự, chỉ ghi thêm**. Đơn vị song song của Kafka.
- **Giải bài toán**: **vừa song song vừa giữ thứ tự** — thứ tự trong một key, song song giữa các key.
- **Thực tế**: `murmur2(key) % số_partition`. **Tăng được, không giảm được**. Tăng thì phá ánh xạ key → partition.
- **Hỏng**: `Leader: none` nghĩa là partition không phục vụ được.

### Replica (bản sao)

- **Là gì**: bản vật lý của một partition trên một broker cụ thể.
- **Giải bài toán**: chịu lỗi — máy chết mà dữ liệu còn.
- **Thực tế**: RF=3 là chuẩn. RF ≤ số broker.
- **Hỏng**: RF=1 + máy chết = mất dữ liệu vĩnh viễn.

### Leader và Follower

- **Là gì**: **leader** nhận mọi lệnh đọc/ghi cho partition đó; **follower** kéo dữ liệu từ leader để dự phòng.
- **Giải bài toán**: một điểm ghi duy nhất cho mỗi partition → không cần đồng thuận cho từng message.
- **Thực tế**: **follower KÉO bằng FetchRequest**, leader không đẩy. Follower **không phục vụ đọc** (trừ khi bật `client.rack` cho follower fetching).
- **Hỏng**: leader chết → controller **chọn** (không bầu) từ ISR, mất ~9 giây để phát hiện.

### ISR — In-Sync Replicas

- **Là gì**: tập bản sao **đang bắt kịp** leader, kể cả leader.
- **Giải bài toán**: biết bản sao nào **an toàn để lên leader** mà không mất dữ liệu.
- **Thực tế**: đo bằng **thời gian** — `replica.lag.time.max.ms`, mặc định **30 giây**. Không đo bằng số message.
- **Hỏng**: ISR co lại gần như luôn là triệu chứng **hạ tầng** (đĩa chậm, GC dừng dài, mạng nghẽn), không phải lỗi Kafka.

### Offset

- **Là gì**: số thứ tự của một bản ghi **trong một partition**, bắt đầu từ 0, tăng đơn điệu.
- **Giải bài toán**: cho consumer tự nhớ vị trí đọc → broker không phải theo dõi ai đọc tới đâu.
- **Thực tế**: **không** duy nhất toàn topic. `(topic, partition, offset)` mới định danh được một bản ghi.
- **Hỏng**: offset đã commit trỏ vào chỗ không tồn tại (do `unclean` election hoặc retention xoá mất) → consumer bị đặt lại theo `auto.offset.reset`.

### LEO — Log End Offset

- **Là gì**: offset **kế tiếp sẽ được ghi** vào một bản sao. Mỗi bản sao có LEO riêng.
- **Giải bài toán**: biết bản sao nào đang tụt bao xa.
- **Thực tế**: xem bằng `kafka-log-dirs.sh --describe` (cột `offsetLag`).

### High Watermark (HW)

- **Là gì**: **LEO nhỏ nhất trong ISR**. Consumer chỉ đọc được tới đây.
- **Giải bài toán**: đảm bảo **mọi thứ consumer thấy đều đã nhân bản đủ** → không bao giờ đọc phải dữ liệu sẽ biến mất.
- **Thực tế**: là lý do độ trễ đầu-cuối luôn có thêm một vòng nhân bản (1–5 ms), kể cả với `acks=1`.
- **Hỏng**: HW không nhích (follower tụt) → producer `acks=all` treo, consumer không thấy dữ liệu mới.

### Log segment

- **Là gì**: một file `.log` chứa một đoạn liên tiếp của partition, kèm `.index` và `.timeindex`.
- **Giải bài toán**: **xoá dữ liệu cũ rẻ tiền** — chỉ cần `unlink()` một file thay vì viết lại cả partition.
- **Thực tế**: cắt segment mới khi đầy `log.segment.bytes` (1 GB) hoặc quá `log.roll.hours` (7 ngày).
- **Hỏng**: quá nhiều segment nhỏ → tốn file descriptor, khởi động broker chậm.

### `.index` và `.timeindex`

- **Là gì**: `.index` ánh xạ offset → vị trí byte; `.timeindex` ánh xạ timestamp → offset.
- **Giải bài toán**: nhảy tới offset bất kỳ mà không quét từ đầu file.
- **Thực tế**: **index thưa** — mỗi `index.interval.bytes` (4096) mới ghi một mục. Tra nhị phân rồi quét thêm tối đa 4 KB.

### Retention (thời hạn lưu)

- **Là gì**: quy tắc xoá dữ liệu cũ theo thời gian hoặc dung lượng.
- **Giải bài toán**: đĩa hữu hạn.
- **Thực tế**: `retention.ms` mặc định **7 ngày**; `retention.bytes` mặc định không giới hạn. Xoá theo **cả segment**, nên dữ liệu sống lâu hơn mốc một chút.
- **Hỏng**: đặt quá ngắn → consumer chậm bị mất dữ liệu chưa đọc, nhận `OFFSET_OUT_OF_RANGE`.

### Log compaction và tombstone

- **Là gì**: chế độ giữ lại **bản ghi mới nhất của mỗi key** thay vì xoá theo thời gian. **Tombstone** = bản ghi có key và value là `null`, đánh dấu "xoá key này".
- **Giải bài toán**: dùng topic như một **bảng trạng thái** (ảnh chụp mới nhất của mỗi thực thể), không phải dòng sự kiện.
- **Thực tế**: bật bằng `cleanup.policy=compact`. Đây là cách `__consumer_offsets` hoạt động. Cũng là cách duy nhất "xoá" dữ liệu cá nhân theo GDPR.
- **Hỏng**: dùng compaction cho topic không có key → mọi bản ghi bị coi là cùng key `null`.

---

## Nhóm 3 — phía producer

### Producer

- **Là gì**: thư viện client đẩy bản ghi vào topic.
- **Giải bài toán**: gom lô, chọn partition, thử lại, chống trùng — tất cả trong client, broker không phải lo.
- **Thực tế**: **an toàn với đa luồng**. Nên dùng **một instance dùng chung** cho cả ứng dụng, không tạo mới mỗi lần gửi.
- **Hỏng**: tạo producer mới mỗi request → cạn kết nối, hiệu năng sụp.

### Serializer / Deserializer

- **Là gì**: chuyển đổi đối tượng Java ↔ mảng byte.
- **Giải bài toán**: broker chỉ hiểu byte.
- **Thực tế**: JSON dễ debug nhưng tốn chỗ; Avro + Schema Registry gọn nhất và kiểm soát được tiến hoá schema.
- **Hỏng**: schema đổi → `RecordDeserializationException` ở consumer, và một bản ghi hỏng **chặn cả partition**. Chữa bằng `ErrorHandlingDeserializer` ([Phase 13](../phase-13-error-handling/03-deserialization-pause-resume.md)).

### Partitioner

- **Là gì**: bộ chọn partition cho mỗi bản ghi.
- **Giải bài toán**: quyết định **thứ tự** (cùng key = cùng partition) và **phân bố tải**.
- **Thực tế**: có key → `murmur2(key) % N`. Không key → **sticky** (không phải round-robin, từ Kafka 2.4).

### RecordAccumulator

- **Là gì**: bộ đệm trong bộ nhớ client, gom bản ghi thành lô theo từng partition.
- **Giải bài toán**: gửi từng bản ghi một thì tốn quá nhiều request mạng.
- **Thực tế**: `batch.size` (16 KB), `linger.ms` (0), `buffer.memory` (32 MB). **Nén áp dụng ở mức lô**, nên lô lớn thì nén tốt hơn.
- **Hỏng**: bộ đệm đầy → `send()` **chặn luồng gọi** tối đa `max.block.ms` (60 giây). Biểu hiện: "API tự nhiên treo một phút".

### `acks`

- **Là gì**: mức xác nhận producer yêu cầu — `0`, `1`, hoặc `all`.
- **Giải bài toán**: đánh đổi tường minh giữa độ trễ và độ bền.
- **Thực tế**: **mặc định `all` từ Kafka 3.0**. `acks=all` **phải đi cùng `min.insync.replicas`**, nếu không sẽ thoái hoá thành `acks=1` khi ISR co lại.

### `min.insync.replicas`

- **Là gì**: số bản sao tối thiểu phải đồng bộ thì mới cho ghi (khi `acks=all`).
- **Giải bài toán**: chặn việc ghi vào một cụm đang thiếu lớp bảo vệ — **báo lỗi rõ ràng thay vì âm thầm mất dữ liệu**.
- **Thực tế**: tham số **broker/topic**, không phải producer. Mặc định **1** — phải đổi. Quy tắc: `RF - 1`.
- **Hỏng**: không đủ → `NotEnoughReplicasException`. Đây là **hành vi đúng**, không phải bug.

### Idempotent producer

- **Là gì**: broker theo dõi `(producerId, sequence)` để loại bản ghi trùng do thử lại.
- **Giải bài toán**: thử lại mà không sinh bản ghi trùng, và **giữ nguyên thứ tự** dù có 5 request đang bay.
- **Thực tế**: `enable.idempotence=true`, **mặc định từ Kafka 3.0**. Gần như không tốn hiệu năng.
- **Hỏng**: tắt đi → mỗi lần mạng chập là một bản ghi trùng, và thứ tự có thể đảo.

### Transaction

- **Là gì**: gói nhiều lần ghi (có thể nhiều topic) thành một đơn vị commit/abort.
- **Giải bài toán**: mẫu **đọc – xử lý – ghi** nguyên tử trong phạm vi Kafka.
- **Thực tế**: cần `transactional.id`; consumer phải đặt `isolation.level=read_committed`. Chi tiết ở [Phase 14](../phase-14-transactions/01-transactions-intro.md).
- **Hỏng**: **không** mở rộng ra database bên ngoài. "Exactly-once" chỉ đúng trong phạm vi Kafka-tới-Kafka.

### `compression.type`

- **Là gì**: nén lô trước khi gửi — `none`, `gzip`, `snappy`, `lz4`, `zstd`.
- **Giải bài toán**: băng thông mạng và dung lượng đĩa thường là nút thắt trước CPU.
- **Thực tế**: **`lz4`** cân bằng tốt nhất; **`zstd`** nén mạnh nhất, tốn CPU hơn. Broker lưu **nguyên lô đã nén** — không giải nén rồi nén lại (điều kiện: cùng codec).
- **Hỏng**: đổi codec giữa producer và broker → broker phải giải nén và nén lại, **mất zero-copy**, tốn CPU.

---

## Nhóm 4 — phía consumer

### Consumer

- **Là gì**: thư viện client đọc bản ghi từ partition.
- **Giải bài toán**: đọc dữ liệu, tự nhớ vị trí.
- **Thực tế**: **KHÔNG an toàn với đa luồng**. Mỗi luồng phải có consumer riêng.
- **Hỏng**: dùng chung một consumer giữa nhiều luồng → `ConcurrentModificationException`.

### Consumer Group

- **Là gì**: tập consumer cùng `group.id`, chia nhau các partition của topic.
- **Giải bài toán**: **scale bên đọc** + **failover tự động** khi một consumer chết.
- **Thực tế**: **một partition chỉ giao cho một consumer trong nhóm**. Nhiều consumer hơn partition thì phần dư **ngồi không**. Nhiều group đọc cùng topic thì độc lập hoàn toàn.
- **Hỏng**: quên đặt `group.id` → Spring sinh group ngẫu nhiên mỗi lần khởi động → đọc lại từ đầu mỗi lần deploy.

### Group Coordinator

- **Là gì**: broker chịu trách nhiệm quản một consumer group cụ thể.
- **Giải bài toán**: có chỗ tập trung để theo dõi thành viên và offset của nhóm.
- **Thực tế**: chọn bằng `|hash(group.id)| % 50` → leader của partition đó trong `__consumer_offsets`. Các group khác nhau do các broker khác nhau điều phối.

### Rebalance

- **Là gì**: quá trình chia lại partition cho các thành viên khi nhóm thay đổi.
- **Giải bài toán**: thêm/bớt consumer mà không cần cấu hình tay.
- **Thực tế**: kiểu **eager** thì dừng toàn bộ nhóm (stop-the-world); kiểu **cooperative** (`CooperativeStickyAssignor`) chỉ chuyển những partition cần chuyển. **Nên dùng cooperative.**
- **Hỏng**: rebalance liên tục — thủ phạm số một là quá hạn `max.poll.interval.ms`.

### `max.poll.interval.ms` và `max.poll.records`

- **Là gì**: khoảng thời gian tối đa giữa hai lần `poll()`; số bản ghi tối đa mỗi lần `poll()`.
- **Giải bài toán**: phát hiện consumer **treo trong lúc xử lý** — thứ mà nhịp tim không phát hiện được (nhịp tim do luồng nền gửi).
- **Thực tế**: 300000 ms (5 phút) và 500 bản ghi. **Nguồn gốc sự cố production số một.**
- **Hỏng**: xử lý 500 bản ghi lâu hơn 5 phút → bị đá khỏi nhóm → commit thất bại → xử lý lại → lặp vô tận. Chữa: **giảm `max.poll.records` trước tiên**.

### Offset commit

- **Là gì**: ghi lại "nhóm này đã xử lý tới đâu" vào `__consumer_offsets`.
- **Giải bài toán**: khởi động lại thì đọc tiếp, không đọc lại từ đầu.
- **Thực tế**: `enable.auto.commit=true` (mặc định) commit mỗi 5 giây — **tiện nhưng có thể mất message**. Production nên tắt và dùng `ack-mode` của Spring.
- **Hỏng**: commit trước khi xử lý → mất message. Commit sau khi xử lý → có thể trùng (**đây là mặc định và đúng**).

### `auto.offset.reset`

- **Là gì**: làm gì khi nhóm **chưa có offset** hoặc offset đã cũ không còn tồn tại.
- **Giải bài toán**: xử lý trường hợp consumer mới hoàn toàn.
- **Thực tế**: `latest` (mặc định) = bỏ qua lịch sử; `earliest` = đọc từ đầu; `none` = ném lỗi.
- **Hỏng**: dùng `latest` cho consumer mới → **im lặng bỏ qua toàn bộ dữ liệu đã có**, và người ta thường tưởng là "Kafka không nhận được message".

### Consumer lag

- **Là gì**: khoảng cách giữa offset mới nhất của partition và offset consumer đã commit.
- **Giải bài toán**: chỉ số sức khoẻ số một của hệ thống tiêu thụ.
- **Thực tế**: `kafka-consumer-groups.sh --describe --group <tên>`.
- **Hỏng**: lag tăng đơn điệu → consumer không theo kịp. Chữa: thêm partition + thêm consumer, hoặc tăng `concurrency`, hoặc tối ưu code xử lý.

---

## Nhóm 5 — topic nội bộ

| Topic | Chứa gì | Cấu hình cần chú ý |
|---|---|---|
| `__consumer_offsets` | Offset đã commit của mọi consumer group | **`offsets.topic.replication.factor` mặc định 1 — PHẢI đổi thành 3**. Mặc định 50 partition, dùng log compaction |
| `__transaction_state` | Trạng thái các transaction đang mở | **`transaction.state.log.replication.factor` mặc định 1 — PHẢI đổi thành 3** |
| `__cluster_metadata` | Nhật ký metadata của KRaft | Đúng 1 partition, nhân bản trên controller quorum. Chỉ có ở chế độ KRaft |

Hai dòng đầu là **chỗ bị quên nhiều nhất** khi dựng cụm. Bạn đặt RF=3 cho mọi topic nghiệp vụ, rồi để `__consumer_offsets` chỉ có một bản sao. Máy chứa nó chết là **mọi consumer group mất vị trí đọc** cùng lúc.

---

## Nhóm 6 — hệ sinh thái xung quanh

### Kafka Connect

- **Là gì**: khung tích hợp để đưa dữ liệu vào/ra Kafka **không cần viết code**, chỉ cấu hình JSON.
- **Giải bài toán**: 80% việc tích hợp là "chép dữ liệu từ A sang B" — không đáng viết ứng dụng riêng.
- **Thực tế**: **Source connector** (nguồn → Kafka) và **Sink connector** (Kafka → đích). Chạy ở chế độ phân tán, tự chịu lỗi.

### Debezium

- **Là gì**: bộ source connector cho **CDC** — đọc nhật ký giao dịch của database và biến thành sự kiện Kafka.
- **Giải bài toán**: đồng bộ dữ liệu **không cần sửa ứng dụng** và **không cần polling** database.
- **Thực tế**: đọc **binlog** của MySQL, **WAL** của PostgreSQL (xem [Bài 3](03-doi-chieu-mysql-de-hieu-kafka.md) về khác biệt hai loại nhật ký này).

### Kafka Streams

- **Là gì**: thư viện Java xử lý luồng — lọc, biến đổi, gộp, join, cửa sổ thời gian.
- **Giải bài toán**: xử lý luồng mà **không cần cụm xử lý riêng** như Spark hay Flink. Chỉ là một ứng dụng Java thường.
- **Thực tế**: nhúng RocksDB làm kho trạng thái cục bộ, sao lưu trạng thái vào topic changelog.

### ksqlDB

- **Là gì**: viết xử lý luồng bằng cú pháp giống SQL.
- **Giải bài toán**: người biết SQL mà không biết Java vẫn làm được xử lý luồng.

### Schema Registry

- **Là gì**: dịch vụ lưu và kiểm tra schema (Avro / Protobuf / JSON Schema).
- **Giải bài toán**: **kiểm soát tiến hoá schema** — chặn thay đổi phá vỡ tương thích ngay tại phía producer.
- **Thực tế**: message chỉ mang **ID schema** (vài byte) thay vì cả tên trường → tiết kiệm băng thông rất nhiều.
- **Hỏng**: không có nó thì đổi tên một trường là làm vỡ mọi consumer, giữa đêm, không báo trước.

### MirrorMaker 2

- **Là gì**: công cụ chính thức sao chép topic **giữa hai cụm Kafka**.
- **Giải bài toán**: khôi phục thảm hoạ, gom dữ liệu nhiều vùng, di chuyển cụm.
- **Thực tế**: sao chép **bất đồng bộ** — nên dùng nó thay vì trải một cụm qua nhiều region ([Bài 2](02-cluster-ha-va-scalability.md)).

### Cruise Control

- **Là gì**: công cụ tự động cân bằng lại partition trong cụm (LinkedIn phát triển).
- **Giải bài toán**: thêm broker xong thì phải cân bằng lại thủ công bằng `kafka-reassign-partitions.sh` — rất cực với cụm lớn.
- **Thực tế**: theo dõi tải rồi tự sinh và chạy kế hoạch dịch chuyển.

### Kafka UI / AKHQ / Redpanda Console

- **Là gì**: giao diện web xem topic, message, consumer group, lag.
- **Giải bài toán**: dùng CLI để tìm một message thì rất cực.
- **Thực tế**: dev thì gần như bắt buộc. Production phải **hạn chế quyền** — công cụ này thường cho phép xoá topic.

### Spring Cloud Stream

- **Là gì**: lớp trừu tượng của Spring cho hệ thống nhắn tin, dùng **Binder** để tách code nghiệp vụ khỏi Kafka.
- **Giải bài toán**: viết consumer bằng `Function`/`Consumer` của Java thay vì API Kafka thô; đổi sang RabbitMQ chỉ cần đổi dependency.
- **Thực tế**: đây là thứ [Phase 4](../phase-4-spring-cloud-stream-consumer/01-scs-intro-binders-bindings.md) tới [Phase 8](../phase-8-event-routing/01-content-based-routing.md) dạy.

---

## Nhóm 7 — công cụ dòng lệnh cần thuộc

| Lệnh | Dùng để | Khi nào cần |
|---|---|---|
| `kafka-topics.sh --create/--describe/--alter` | Quản lý topic | Hằng ngày |
| `kafka-topics.sh --describe --under-replicated-partitions` | Tìm partition thiếu bản sao | **Trước và sau mọi lần bảo trì** |
| `kafka-topics.sh --describe --under-min-isr-partitions` | Tìm partition **không ghi được** | Khi có báo động |
| `kafka-topics.sh --describe --unavailable-partitions` | Tìm partition **không có leader** | Sự cố nghiêm trọng |
| `kafka-consumer-groups.sh --describe --group X` | Xem lag và phân bổ partition | Khi consumer chậm |
| `kafka-consumer-groups.sh --reset-offsets` | Tua lại hoặc nhảy tới vị trí khác | Phát lại dữ liệu, bỏ qua message hỏng |
| `kafka-configs.sh --alter --add-config` | Đổi cấu hình topic khi đang chạy | Đặt `min.insync.replicas`, `retention.ms` |
| `kafka-log-dirs.sh --describe` | Xem dung lượng từng bản sao | Tìm partition phình bất thường |
| `kafka-dump-log.sh --files ... --print-data-log` | Đọc thẳng file log ra chữ | Điều tra sâu, xem batch và producerId |
| `kafka-reassign-partitions.sh` | Chuyển bản sao sang broker khác | Sau khi thêm broker |
| `kafka-leader-election.sh --election-type PREFERRED` | Cân bằng lại leader | Sau khi khởi động lại broker |
| `kafka-metadata-quorum.sh --status` | Xem trạng thái quorum KRaft | Kiểm tra sức khoẻ controller |
| `kafka-metadata-shell.sh` | Duyệt nhật ký metadata | Thay cho `zkCli.sh` thời ZooKeeper |
| `kafka-storage.sh format` | Định dạng ổ lưu trữ KRaft | Trước lần khởi động đầu tiên |
| `kafka-broker-api-versions.sh` | Liệt kê broker và phiên bản API | Kiểm tra cụm đã thành hình chưa |

---

## Bảng tra nhanh: mặc định nào phải đổi trước khi lên production

| Tham số | Mặc định | Đổi thành | Vì sao |
|---|---|---|---|
| `offsets.topic.replication.factor` | **1** | **3** | Mất là toàn bộ consumer group mất vị trí đọc |
| `transaction.state.log.replication.factor` | **1** | **3** | Tương tự, cho transaction |
| `min.insync.replicas` | **1** | **2** | Không có thì `acks=all` vô nghĩa |
| `auto.create.topics.enable` | **true** | **false** | Gõ sai tên topic → sinh topic RF=1 âm thầm |
| `default.replication.factor` | **1** | **3** | Topic tạo tự động có bảo vệ |
| `num.partitions` | **1** | 3–6 | Topic mới có chỗ để scale |
| `broker.rack` | không đặt | tên AZ | Trải bản sao ra nhiều AZ |
| `max.poll.records` (consumer) | **500** | 50–100 | Chống quá hạn `max.poll.interval.ms` |
| `enable.auto.commit` (consumer) | **true** | **false** | Tránh commit trước khi xử lý xong |
| `partition.assignment.strategy` | `RangeAssignor` | `CooperativeStickyAssignor` | Rebalance không dừng cả nhóm |
| `terminationGracePeriodSeconds` (K8s) | **30** | 120–300 | Đủ cho tắt có kiểm soát |

Chín trong mười một dòng này là các mặc định **an toàn cho việc chạy thử trên một máy**, và **không an toàn cho production**. Đây là điều đáng nhớ nhất: mặc định của Kafka được chọn để `docker run` là chạy được ngay, không phải để chịu tải thật.

## Tóm tắt bài 11

- **Broker** là tiến trình, **topic** là cái tên, **partition** là đơn vị dữ liệu, **replica** là bản vật lý. Bốn thứ giải bốn bài toán vuông góc: dung lượng, tổ chức, song song, chịu lỗi.
- **HW chặn consumer** ở phần đã nhân bản đủ; **ISR đo bằng thời gian** (30 giây); **`min.insync.replicas` là tham số broker/topic**, không phải producer.
- Ba mặc định nguy hiểm nhất: **`offsets.topic.replication.factor=1`**, **`transaction.state.log.replication.factor=1`**, **`min.insync.replicas=1`**.
- Bẫy consumer số một: **`max.poll.interval.ms`** — nhịp tim do luồng nền gửi nên consumer "trông khoẻ" trong khi `poll()` đã quá hạn.
- Bẫy producer số một: **bộ đệm đầy** làm `send()` chặn luồng gọi tới 60 giây, biểu hiện thành "API tự nhiên treo".
- **Consumer không an toàn với đa luồng; producer thì có** — dùng chung một producer, mỗi luồng một consumer.
- Hệ sinh thái: **Connect + Debezium** (đưa dữ liệu vào ra), **Streams + ksqlDB** (xử lý), **Schema Registry** (kiểm soát schema), **MirrorMaker 2** (giữa các cụm), **Cruise Control** (cân bằng lại).
- Bốn lệnh cần thuộc cho vận hành: `--under-replicated-partitions`, `--under-min-isr-partitions`, `--unavailable-partitions`, và `kafka-consumer-groups.sh --describe`.

**Bài kế tiếp** → [Bài 12: Bảng đính chính transcript và tổng kết Phase 20](12-dinh-chinh-transcript-va-tong-ket.md)
