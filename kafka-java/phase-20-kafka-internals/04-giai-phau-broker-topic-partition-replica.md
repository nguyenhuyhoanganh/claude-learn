# Bài 4: Giải phẫu broker, topic, partition, replica — cái gì nằm ở đâu trên đĩa

Có một câu mô tả Kafka nghe rất hợp lý mà lại sai:

> *"Trong mỗi Broker chứa các Topic. Trong Topic lại được phân chia thành nhiều Partition."*

Câu này xuất hiện trong hầu hết bài giảng nhập môn, kể cả transcript gốc. Nó tạo ra một mô hình tư duy lồng nhau kiểu thư mục: broker chứa topic, topic chứa partition. Mô hình đó **sai**, và cái sai này khiến bạn không giải thích nổi những chuyện xảy ra ngay sau đó — vì sao một broker chết mà topic vẫn còn, vì sao `--describe` lại in ra thông tin trải khắp nhiều máy, vì sao thêm broker mà topic cũ không tự chuyển sang.

Bài này dựng lại mô hình đúng, rồi mở nắp xem chính xác Kafka đặt cái gì ở đâu trên đĩa cứng.

## Đính chính: quan hệ thật giữa bốn khái niệm

```text
   MÔ HÌNH SAI (lồng nhau kiểu thư mục)
   ════════════════════════════════════

   Broker 1                 Broker 2                Broker 3
   ├── Topic A              ├── Topic A             ├── Topic A
   │   ├── Partition 0      │   ├── Partition 0     │   ├── ...
   │   └── Partition 1      │   └── ...
   └── Topic B              └── ...

   Hỏi lại: nếu Broker 1 chết thì "Topic A của Broker 1" đi đâu?
   Mô hình này không trả lời được.
```

```text
   MÔ HÌNH ĐÚNG (hai tầng: logic và vật lý)
   ═══════════════════════════════════════

   ┌─── TẦNG LOGIC — chỉ tồn tại trong metadata của cụm ──────────┐
   │                                                                │
   │   Topic "order-events"                                        │
   │        = một CÁI TÊN + một tập hợp partition                  │
   │        = KHÔNG nằm trên máy nào cả                            │
   │                                                                │
   │        ├── Partition 0   (một dãy bản ghi có thứ tự)         │
   │        ├── Partition 1                                        │
   │        └── Partition 2                                        │
   └────────────────────────────────────────────────────────────────┘
                              │
                 mỗi partition được NHÂN thành RF bản
                 và các bản đó mới được ĐẶT lên máy
                              │
   ┌─── TẦNG VẬT LÝ — thư mục thật trên đĩa ───────────────────────┐
   │                                                                │
   │   Broker 1              Broker 2             Broker 3         │
   │   ├─ order-events-0 L   ├─ order-events-0 f  ├─ order-events-0 f│
   │   ├─ order-events-1 f   ├─ order-events-1 L  ├─ order-events-1 f│
   │   └─ order-events-2 f   └─ order-events-2 f  └─ order-events-2 L│
   │                                                                │
   │      L = bản sao đang làm leader,  f = bản sao follower        │
   └────────────────────────────────────────────────────────────────┘
```

Ba khẳng định thay thế cho câu sai:

| Khẳng định đúng | Hệ quả |
|---|---|
| **Topic là khái niệm logic cấp cụm**, không thuộc broker nào | Broker chết, topic không mất. Chỉ những bản sao trên máy đó biến mất |
| **Broker chứa bản sao của partition (partition replica)**, không chứa topic | Trên đĩa bạn thấy thư mục `order-events-0`, không có thư mục `order-events` |
| **Một partition được nhân thành RF bản sao**, mỗi bản trên một broker khác nhau | Nói "partition 0 nằm ở broker 1" là nói tắt; đúng ra là "một bản sao của partition 0 nằm ở broker 1, và bản đó đang làm leader" |

Cách diễn đạt một câu cho chuẩn:

> Topic là cái tên. Partition là đơn vị dữ liệu. **Replica** là bản vật lý của partition trên một broker cụ thể. Broker chứa replica, không chứa topic.

### Đính chính đi kèm: broker là tiến trình, không phải máy

Câu *"mỗi Broker tương ứng với một máy chủ ảo (VM) hoặc máy vật lý"* cũng chỉ đúng ở production, không đúng về bản chất.

> **Broker** = **một tiến trình Kafka đang chạy**, được nhận diện bởi `node.id` duy nhất trong cụm.

Bằng chứng ngay trong môi trường học của bạn: file `docker-compose.yml` ở [Phase 9](../phase-9-kafka-cluster/02-docker-compose-cluster.md) chạy **3 broker trên đúng một máy tính** của bạn. Ba tiến trình, ba `node.id`, ba thư mục dữ liệu riêng, một máy vật lý.

| Môi trường | Bao nhiêu broker trên một máy | Vì sao |
|---|---|---|
| Máy học / dev | 3 (Docker) | Chỉ cần mô phỏng hành vi cụm |
| Production | **Đúng 1** | Nhiều broker chung máy thì máy chết là mất nhiều bản sao cùng lúc — vô hiệu hoá RF |

Điều đó dẫn tới một quy tắc production cần nhớ: **đừng bao giờ đặt hai bản sao của cùng một partition lên hai broker chạy chung một máy vật lý.** Đây cũng chính là lý do `broker.rack` tồn tại (xem [Bài 2](02-cluster-ha-va-scalability.md)).

## Bốn khái niệm, mỗi khái niệm giải một bài toán

Đây là bảng cốt lõi của cả bài:

| Khái niệm | Nó là cái gì | Nó giải bài toán gì | Nếu không có nó |
|---|---|---|---|
| **Broker** | Tiến trình Kafka giữ dữ liệu và phục vụ client | **Dung lượng** — tổng CPU/RAM/đĩa | Không có chỗ chứa dữ liệu |
| **Topic** | Cái tên gom các sự kiện cùng loại | **Tổ chức** — tách "đơn hàng" khỏi "thanh toán" | Mọi sự kiện lẫn vào một dòng, consumer phải tự lọc |
| **Partition** | Một dãy bản ghi có thứ tự, chỉ ghi thêm | **Song song + thứ tự** | Một topic chỉ chạy được trên một máy, một consumer |
| **Replica** | Bản sao vật lý của một partition trên một broker | **Chịu lỗi** | Máy chết là mất dữ liệu |

Bốn thứ này **vuông góc nhau**. Đây là bảng trả lời cho câu hỏi "khi nào chỉnh cái nào":

```text
   Cần thêm chỗ chứa       →  thêm BROKER
   Cần chạy nhanh hơn      →  thêm PARTITION
   Cần an toàn hơn         →  tăng REPLICA (RF)
   Cần tách luồng dữ liệu  →  thêm TOPIC
```

### Vì sao partition vừa cho song song vừa cho thứ tự

Đây là thiết kế thông minh nhất của Kafka, đáng dừng lại kỹ:

```text
   Topic "order-events", 3 partition
   ═════════════════════════════════

   Partition 0:  [ off0 ][ off1 ][ off2 ][ off3 ]  ──► thứ tự ĐẢM BẢO
   Partition 1:  [ off0 ][ off1 ][ off2 ]          ──► thứ tự ĐẢM BẢO
   Partition 2:  [ off0 ][ off1 ][ off2 ][ off3 ][ off4 ] ──► thứ tự ĐẢM BẢO

   Giữa các partition với nhau: KHÔNG có thứ tự nào cả.
   P1.off0 có thể xảy ra trước hay sau P0.off3 — Kafka không biết, không hứa.
```

Cách Kafka biến điều đó thành thứ tự **có ý nghĩa nghiệp vụ**: dùng **key**.

```text
   producer.send("order-events", key="KH-042", value=<đơn hàng>)
                                      │
                                      ▼
                     murmur2("KH-042") % 3  =  1
                                      │
                                      ▼
                            luôn luôn vào Partition 1
```

Hệ quả: **mọi sự kiện của khách hàng KH-042 luôn nằm cùng một partition, do đó luôn đúng thứ tự.** Trong khi các khách hàng khác nhau vẫn được xử lý song song trên các partition khác nhau.

```text
   Cái ta CẦN:     "đơn hàng của MỘT khách phải xử lý đúng thứ tự"
   Cái ta KHÔNG cần: "đơn của khách A phải xử lý trước đơn của khách B"

   → Kafka cho đúng cái cần, và đổi lại được toàn bộ khả năng song song.
```

Đây là ví dụ mẫu mực của việc **nới lỏng một đảm bảo không ai cần để đổi lấy hiệu năng**. Chi tiết ở [Phase 3 bài 6](../phase-3-kafka-fundamentals/06-partitions-keys.md).

## Mở nắp: dữ liệu thật sự nằm ở đâu trên đĩa

Phần này là thứ hầu như không tài liệu nhập môn nào cho xem, mà lại làm mọi thứ trở nên cụ thể.

### Bước 1 — tìm thư mục dữ liệu

```bash
docker exec -it kafka1 bash
grep "^log.dirs" /opt/kafka/config/server.properties
```

```text
log.dirs=/var/lib/kafka/data
```

### Bước 2 — xem có gì trong đó

```bash
ls -1 /var/lib/kafka/data | head -20
```

```text
__cluster_metadata-0            ← nhật ký metadata của KRaft
__consumer_offsets-0            ← nơi lưu offset của consumer group
__consumer_offsets-1
__consumer_offsets-2
...
__consumer_offsets-49           ← mặc định 50 partition
cleaner-offset-checkpoint
demo-topic-0
demo-topic-1
demo-topic-2
meta.properties
order-events-0
order-events-2
recovery-point-offset-checkpoint
replication-offset-checkpoint
```

Ba điều đọc ra được ngay từ danh sách này:

**Một — không hề có thư mục nào tên là `order-events`.** Chỉ có `order-events-0` và `order-events-2`. Đây là bằng chứng vật lý cho phần đính chính ở đầu bài: **đơn vị lưu trữ là partition, không phải topic**.

**Hai — broker này chỉ có `order-events-0` và `order-events-2`, thiếu `-1`.** Nghĩa là bản sao của partition 1 nằm ở broker khác. Một broker **không** giữ toàn bộ topic.

**Ba — các topic có tiền tố hai gạch dưới là topic nội bộ của Kafka**, ta không tạo chúng. Sẽ liệt kê đủ ở [Bài 8](11-tu-dien-moi-thanh-phan-kafka.md).

### Bước 3 — bên trong một thư mục partition

```bash
ls -l /var/lib/kafka/data/order-events-0/
```

```text
-rw-r--r-- 1 kafka  10485760  00000000000000000000.index
-rw-r--r-- 1 kafka     73842  00000000000000000000.log
-rw-r--r-- 1 kafka  10485756  00000000000000000000.timeindex
-rw-r--r-- 1 kafka  10485760  00000000000000018437.index
-rw-r--r-- 1 kafka       924  00000000000000018437.log
-rw-r--r-- 1 kafka  10485756  00000000000000018437.timeindex
-rw-r--r-- 1 kafka        10  00000000000000018437.snapshot
-rw-r--r-- 1 kafka         8  leader-epoch-checkpoint
-rw-r--r-- 1 kafka        43  partition.metadata
```

Giải nghĩa từng loại file — đây là toàn bộ "ruột" của Kafka:

| File | Chứa gì | Vai trò |
|---|---|---|
| `*.log` | **Bản ghi thật**, nối tiếp nhau theo đúng thứ tự ghi | Đây chính là dữ liệu. Tên file = offset đầu tiên trong file đó |
| `*.index` | Ánh xạ **offset → vị trí byte** trong file `.log` | Nhảy tới offset bất kỳ mà không phải quét từ đầu |
| `*.timeindex` | Ánh xạ **timestamp → offset** | Phục vụ `--from-timestamp`, và để xoá theo thời gian |
| `*.snapshot` | Trạng thái producer (dùng cho idempotent + transaction) | Khôi phục nhanh sau khi khởi động lại |
| `leader-epoch-checkpoint` | Lịch sử "ai làm leader từ offset nào" | Chống mất/lệch dữ liệu khi đổi leader |
| `partition.metadata` | Topic ID | Phân biệt topic cũ và topic mới cùng tên |

### Bước 4 — segment: vì sao lại chia nhỏ ra nhiều file

Nhìn lại danh sách: có hai bộ file, một bộ bắt đầu từ offset `0`, một bộ từ `18437`. Đó là hai **segment** (đoạn log).

```text
   Partition = nhiều SEGMENT nối tiếp
   ═════════════════════════════════

   00000000000000000000.log      00000000000000018437.log
   ┌────────────────────────┐    ┌────────────────────────┐
   │ offset 0 ... 18436     │    │ offset 18437 ... nay   │
   │ ĐÃ ĐÓNG (chỉ đọc)      │    │ ĐANG MỞ (đang ghi)     │
   └────────────────────────┘    └────────────────────────┘
             ▲                              ▲
      xoá cả file này khi         mọi lệnh ghi mới
      hết hạn lưu trữ             đều nối vào cuối đây
```

Segment mới được cắt ra khi thoả một trong hai điều kiện:

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `log.segment.bytes` | 1 GB | Segment đầy 1 GB thì đóng, mở segment mới |
| `log.roll.hours` (hoặc `.ms`) | 168 giờ (7 ngày) | Segment mở quá lâu cũng bị đóng |

**Vì sao phải chia segment** — ba lý do, và lý do thứ nhất là quan trọng nhất:

**Một — để xoá được dữ liệu cũ.** Retention nghĩa là "xoá dữ liệu quá N ngày". Nếu partition chỉ là **một** file khổng lồ, muốn xoá phần đầu thì phải viết lại cả file — cực kỳ tốn kém. Chia segment thì xoá chỉ là **`unlink()` một file**, tức thời, gần như không tốn gì.

**Hai — để giữ file mở ở mức hợp lý.** Hệ điều hành có giới hạn số file descriptor mở đồng thời.

**Ba — để index nhỏ và nằm gọn trong bộ nhớ.** Mỗi segment có index riêng, kích thước có hạn.

> **Điểm cần nhớ**: Kafka **không bao giờ xoá từng message**. Nó chỉ xoá **cả segment**. Đó là lý do dữ liệu có thể sống lâu hơn `retention.ms` một chút — segment đang mở thì không bị đụng tới, dù message trong đó đã quá hạn.

### Bước 5 — index thưa, không phải index đầy đủ

Nhìn cột kích thước: file `.index` chiếm 10 MB trong khi `.log` chỉ có 73 KB. Trông vô lý. Thực ra 10 MB là **kích thước cấp trước** (`log.index.size.max.bytes`), phần lớn còn trống.

Điểm thú vị là Kafka **không** đánh chỉ mục mọi message:

```text
   .log  (mọi bản ghi)              .index (chỉ mỗi ~4 KB một mục)
   ┌──────────────────────┐         ┌────────────────────────┐
   │ off 0    vị trí 0    │◄────────│ offset 0   → byte 0     │
   │ off 1    vị trí 128  │         │                         │
   │ off 2    vị trí 260  │         │                         │
   │ ...                  │         │                         │
   │ off 31   vị trí 4098 │◄────────│ offset 31  → byte 4098  │
   │ ...                  │         │                         │
   │ off 63   vị trí 8200 │◄────────│ offset 63  → byte 8200  │
   └──────────────────────┘         └────────────────────────┘

   Tham số: index.interval.bytes = 4096 (mặc định)
```

Cách tìm offset 45:

```text
   1. Tìm nhị phân trong .index  → mục gần nhất KHÔNG vượt quá 45 là offset 31
   2. Nhảy thẳng tới byte 4098 trong file .log
   3. Đọc tuần tự về phía trước tới khi gặp offset 45   ← quét rất ngắn
```

Đây là đánh đổi cổ điển: **index thưa (sparse index)** tốn ít bộ nhớ hơn hàng chục lần so với index đầy đủ, đổi lại phải quét thêm tối đa 4 KB. Vì đọc tuần tự 4 KB từ page cache gần như miễn phí, đánh đổi này luôn có lãi.

### Bước 6 — đọc nội dung file .log ra chữ

Kafka có công cụ đọc trực tiếp file log ra dạng người đọc được:

```bash
/opt/kafka/bin/kafka-dump-log.sh \
  --files /var/lib/kafka/data/order-events-0/00000000000000000000.log \
  --print-data-log | head -12
```

```text
Dumping /var/lib/kafka/data/order-events-0/00000000000000000000.log
Starting offset: 0
baseOffset: 0 lastOffset: 4 count: 5 baseSequence: 0 lastSequence: 4
  producerId: 1001 producerEpoch: 0 partitionLeaderEpoch: 0 isTransactional: false
  isControl: false position: 0 CreateTime: 1754630400123 size: 412
  magic: 2 compresscodec: none crc: 2847193021 isvalid: true
| offset: 0 CreateTime: 1754630400123 keySize: 6 valueSize: 58 sequence: 0
    key: KH-042 payload: {"orderId":"OD-1","amount":250000,"status":"NEW"}
| offset: 1 CreateTime: 1754630400175 keySize: 6 valueSize: 58 sequence: 1
    key: KH-042 payload: {"orderId":"OD-2","amount":180000,"status":"NEW"}
| offset: 2 CreateTime: 1754630400228 keySize: 6 valueSize: 61 sequence: 2
    key: KH-107 payload: {"orderId":"OD-3","amount":1200000,"status":"NEW"}
```

Vài điều rất đáng chú ý trong output này:

**`baseOffset: 0 lastOffset: 4 count: 5`** — năm message được gói chung trong **một record batch**. Kafka không ghi từng message riêng lẻ; nó gom thành lô rồi ghi một lần. Đây chính là tác dụng của `linger.ms` và `batch.size` mà bạn đã gặp ở [Phase 3 bài 3](../phase-3-kafka-fundamentals/03-producer-consumer-tuning.md).

**`producerId` và `sequence`** — dấu vết của **idempotent producer**. Broker dùng cặp `(producerId, sequence)` để phát hiện và loại bỏ message trùng khi producer thử lại. Từ Kafka 3.0, `enable.idempotence=true` là mặc định.

**`crc`** — mã kiểm tra toàn vẹn cho cả lô. Broker và consumer đều kiểm tra; nếu đĩa hỏng bit thì phát hiện được.

**`compresscodec: none`** — nén được áp dụng ở **mức lô**, không phải mức từng message. Nén cả lô cho tỉ lệ nén tốt hơn nhiều vì các message cùng loại có nhiều phần lặp.

## Vì sao ghi đĩa lại nhanh — cơ chế Kafka dựa vào

Câu hỏi tự nhiên: Kafka ghi thẳng ra đĩa, sao lại nhanh hơn nhiều hệ thống giữ dữ liệu trong RAM? Ba cơ chế cộng lại.

### Cơ chế 1 — chỉ ghi tuần tự

```text
   GHI NGẪU NHIÊN (database cập nhật tại chỗ)
   Đầu đọc phải nhảy: ...trang 8123 → trang 44 → trang 90211 → trang 7...
   Đĩa quay (HDD): mỗi lần nhảy tốn ~5-10 ms
   → khoảng 100-200 thao tác mỗi giây

   GHI TUẦN TỰ (Kafka luôn nối vào cuối file)
   Đầu đọc đi thẳng một mạch: ────────────────────►
   → hàng trăm MB mỗi giây, kể cả trên HDD
```

Chênh lệch giữa hai kiểu ghi này lên tới **ba bậc độ lớn**. Đây là lý do gốc rễ khiến Kafka nhanh, và cũng là lý do Kafka **không cho phép sửa message đã ghi** — cho phép sửa là phá vỡ tính tuần tự.

### Cơ chế 2 — không tự quản bộ nhớ đệm, giao cho hệ điều hành

Kafka **không** xây cache riêng trong heap của JVM. Nó ghi qua lời gọi hệ thống bình thường và để **page cache của hệ điều hành** làm việc đó.

```text
   Producer ──► Kafka ──► write() ──► PAGE CACHE (RAM do OS quản lý)
                                            │
                                            │ OS tự flush xuống đĩa
                                            ▼
                                          ĐĨA

   Consumer đọc dữ liệu vừa ghi
        └──► gần như luôn trúng PAGE CACHE, KHÔNG chạm đĩa
```

Ba cái lợi mà cách này mang lại:

| Lợi ích | Vì sao |
|---|---|
| Không có áp lực rác (GC) | Dữ liệu không nằm trong heap JVM, nên bộ thu gom rác không phải quét |
| Khởi động lại vẫn nóng | Kafka restart, page cache của OS **vẫn còn** — không phải nạp lại từ đầu |
| Tận dụng hết RAM rảnh | OS tự động dùng mọi RAM chưa ai dùng làm cache |

Hệ quả thực dụng khi vận hành: **đừng cấp heap lớn cho Kafka.** Khuyến nghị phổ biến là 6 GB heap, phần RAM còn lại để nguyên cho page cache. Cấp heap 48 GB trên máy 64 GB là tự bóp chết cơ chế chính khiến Kafka nhanh.

### Cơ chế 3 — zero-copy khi gửi cho consumer

Đường đi thông thường của dữ liệu từ đĩa ra mạng phải qua bốn lần sao chép:

```text
   KHÔNG có zero-copy
   ĐĨA → page cache → bộ đệm ứng dụng → bộ đệm socket → card mạng
         (sao chép 1)   (sao chép 2)     (sao chép 3)

   CÓ zero-copy (lời gọi sendfile của Linux)
   ĐĨA → page cache ─────────────────────► card mạng
         (chỉ một lần, do nhân hệ điều hành làm)
```

Kafka dùng `FileChannel.transferTo()` của Java, ánh xạ xuống `sendfile()` của Linux. Dữ liệu đi thẳng từ page cache ra card mạng, **không hề đi qua vùng nhớ của tiến trình Kafka**.

> **Bẫy vận hành cần biết**: zero-copy **chỉ hoạt động khi không phải biến đổi dữ liệu**. Bật mã hoá **SSL/TLS** thì dữ liệu bắt buộc phải đi qua vùng nhớ ứng dụng để mã hoá → **mất zero-copy** → thông lượng giảm rõ rệt (thường 20–40% tuỳ tải). Đây là chi phí thật của việc bật TLS mà nhiều người không lường trước. Xem thêm [Phase 16](../phase-16-security/01-sasl-plaintext-ssl.md).

## Lệnh kiểm tra thực tế

### Xem một topic nằm ở đâu

```bash
/opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --topic order-events
```

```text
Topic: order-events  TopicId: kR9x...  PartitionCount: 3  ReplicationFactor: 3
  Topic: order-events  Partition: 0  Leader: 1  Replicas: 1,2,3  Isr: 1,2,3
  Topic: order-events  Partition: 1  Leader: 2  Replicas: 2,3,1  Isr: 2,3,1
  Topic: order-events  Partition: 2  Leader: 3  Replicas: 3,1,2  Isr: 3,1,2
```

Đọc từng cột:

| Cột | Nghĩa |
|---|---|
| `Partition` | Số thứ tự partition, đếm từ 0 |
| `Leader` | `node.id` của broker đang giữ bản sao **leader** — mọi lệnh đọc/ghi đi vào đây |
| `Replicas` | Danh sách mọi broker có bản sao. **Phần tử đầu tiên là "leader ưu tiên"** (preferred leader) |
| `Isr` | In-Sync Replicas — các bản sao **đang bắt kịp** leader. Chi tiết ở [Bài 5](05-leader-follower-isr-va-luong-ghi.md) |

Chi tiết đáng để ý: `Replicas` của P0 là `1,2,3`, của P1 là `2,3,1`, của P2 là `3,1,2` — **xoay vòng có chủ đích**. Kafka cố ý làm vậy để phần tử đầu tiên (leader ưu tiên) trải đều ra ba broker, không dồn vào một máy.

> Khi một broker vừa khởi động lại, nó thường **chưa** lấy lại vai trò leader ngay. Cụm sẽ lệch tải cho tới khi chạy cân bằng lại. Lệnh: `kafka-leader-election.sh --election-type PREFERRED --all-topic-partitions`. Hoặc để Kafka tự làm với `auto.leader.rebalance.enable=true` (mặc định bật).

### Xem dung lượng từng bản sao chiếm bao nhiêu đĩa

```bash
/opt/kafka/bin/kafka-log-dirs.sh --bootstrap-server localhost:9092 \
  --describe --topic-list order-events | tail -1 | python3 -m json.tool | head -25
```

```text
{
    "brokers": [
        {
            "broker": 1,
            "logDirs": [
                {
                    "logDir": "/var/lib/kafka/data",
                    "partitions": [
                        { "partition": "order-events-0", "size": 74122, "offsetLag": 0, "isFuture": false },
                        { "partition": "order-events-1", "size": 68930, "offsetLag": 0, "isFuture": false },
                        { "partition": "order-events-2", "size": 71455, "offsetLag": 0, "isFuture": false }
                    ]
                }
            ]
        }
    ]
}
```

Đây là lệnh cực kỳ hữu ích khi vận hành mà ít người biết:

- `size` — số byte bản sao đó đang chiếm. Dùng để tìm partition phình bất thường.
- `offsetLag` — bản sao này đang tụt sau leader bao nhiêu offset. Với leader thì luôn là 0.

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| "Broker chứa topic" | Broker chứa **bản sao của partition**. Topic chỉ là tên trong metadata |
| "Broker = một máy" | Broker = **một tiến trình**. Docker compose chạy 3 broker trên 1 máy |
| "Thêm broker thì topic cũ tự trải sang" | **Không**. Broker mới rỗng cho tới khi chạy `kafka-reassign-partitions.sh` |
| "Kafka xoá message quá hạn" | Kafka xoá **cả segment**. Segment đang mở không bị đụng, nên dữ liệu sống lâu hơn `retention.ms` một chút |
| "File .index 10 MB nghĩa là index rất nặng" | Đó là kích thước **cấp trước**, phần lớn còn trống. Index là **thưa** |
| Cấp heap JVM thật lớn cho Kafka | Phản tác dụng. Kafka dựa vào **page cache của OS**. Heap ~6 GB, còn lại để cho OS |
| "Bật TLS không ảnh hưởng hiệu năng" | Bật TLS làm **mất zero-copy**, thông lượng giảm rõ rệt |
| "Leader phân bố tự cân bằng mãi mãi" | Sau khi broker khởi động lại, leader có thể lệch. Cần cân bằng lại |
| "Nén giúp từng message nhỏ đi" | Nén ở **mức lô**. Lô càng lớn tỉ lệ nén càng tốt — thêm một lý do để tăng `linger.ms` |

## Tóm tắt bài 4

- **Đính chính lớn**: broker **không chứa topic**. Topic là khái niệm **logic cấp cụm**; broker chứa **bản sao của partition**. Bằng chứng: trên đĩa chỉ có thư mục `order-events-0`, không có `order-events`.
- **Broker là một tiến trình** có `node.id` riêng, không nhất thiết là một máy. Production thì một máy một broker; dev thì 3 broker chung một máy là bình thường.
- Bốn khái niệm giải bốn bài toán vuông góc: **broker → dung lượng, topic → tổ chức, partition → song song + thứ tự, replica → chịu lỗi**.
- Partition cho **thứ tự trong phạm vi key** và **song song giữa các key** cùng lúc — nhờ `murmur2(key) % N`.
- Trên đĩa, mỗi partition là một thư mục gồm nhiều **segment**: `.log` (dữ liệu), `.index` (offset → byte), `.timeindex` (thời gian → offset), cộng `leader-epoch-checkpoint`.
- Kafka **xoá cả segment**, không xoá từng message. Đó là lý do retention nhanh và rẻ.
- `.index` là **index thưa** (mỗi ~4 KB một mục) — tốn ít bộ nhớ, đổi lại quét thêm tối đa 4 KB.
- Nhanh nhờ ba thứ cộng lại: **ghi tuần tự** (nhanh hơn ghi ngẫu nhiên ba bậc độ lớn), **page cache của hệ điều hành** (đừng cấp heap lớn), và **zero-copy** (mất khi bật TLS).
- Lệnh cần thuộc: `kafka-topics.sh --describe` (xem leader/ISR), `kafka-log-dirs.sh --describe` (xem dung lượng), `kafka-dump-log.sh` (đọc thẳng file log).

**Bài kế tiếp** → [Bài 5: Leader, Follower, ISR và đường đi thật của một lệnh ghi](05-leader-follower-isr-va-luong-ghi.md)
