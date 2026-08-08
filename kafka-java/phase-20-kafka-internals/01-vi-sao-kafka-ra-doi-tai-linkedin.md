# Bài 1: Vì sao Kafka ra đời — câu chuyện có thật ở LinkedIn

Hầu hết tài liệu Kafka mở đầu bằng một câu định nghĩa: *"Apache Kafka là một distributed event streaming platform"*. Câu đó đúng nhưng vô dụng — nó không cho bạn biết **tại sao** Kafka lại được thiết kế đúng như vậy: tại sao dữ liệu là một cái log chỉ ghi thêm, tại sao consumer phải tự nhớ vị trí đọc, tại sao message không bị xoá sau khi đọc.

Muốn hiểu những quyết định thiết kế đó, phải quay lại năm 2010 ở LinkedIn, xem chính xác họ đang đau ở đâu. Mỗi cơn đau trong bài này về sau đều biến thành một đặc điểm kiến trúc của Kafka.

## Hai bài toán LinkedIn không giải nổi bằng công cụ có sẵn

### Bài toán 1 — thu thập số liệu vận hành (operational metrics)

LinkedIn có hàng trăm máy chủ. Đội vận hành cần biết CPU, RAM, số request, độ trễ của từng máy theo thời gian.

Cách họ làm lúc đó:

```text
   ┌──────────────────────────────────────────────────────────┐
   │  Hệ thống giám sát (monitoring)                          │
   │                                                           │
   │   while (true) {                    ← vòng lặp bất tận    │
   │       for (mỗi máy chủ trong 500 máy) {                   │
   │           GET http://server-N/metrics   ← HTTP request     │
   │           parse XML trả về                                │
   │           ghi vào kho dữ liệu                             │
   │       }                                                   │
   │       sleep(interval)               ← ngủ rồi lặp lại     │
   │   }                                                       │
   └──────────────────────────────────────────────────────────┘
```

Kỹ thuật này gọi là **polling** (hỏi vòng): bên tiêu thụ chủ động đi hỏi từng nguồn theo chu kỳ. Nó sinh ra bốn vấn đề, và cả bốn đều nghiêm trọng:

| Vấn đề | Vì sao đau |
|---|---|
| **Độ trễ bằng đúng chu kỳ polling** | Chu kỳ 1 giờ nghĩa là sự cố xảy ra lúc 10:01 thì 11:00 mới biết. Không thể làm cảnh báo thời gian thực. |
| **Định dạng XML không có chuẩn tên** | Máy A gọi là `cpu_usage`, máy B gọi là `CPUUtilization`, máy C nhét vào thẻ lồng ba tầng. Không có **metric name** thống nhất. |
| **Schema đổi liên tục** | Team nào đó thêm một thẻ XML mới → parser phía sau vỡ. Data engineer phải sửa tay (**manual handling**) gần như hàng tuần. |
| **Tải tăng theo tích số** | 500 máy × 20 hệ thống tiêu thụ = 10.000 kết nối HTTP mỗi chu kỳ, chỉ để đọc vài con số. |

Điểm mấu chốt cần rút ra: **bên gửi và bên nhận bị dính chặt vào nhau**. Người sản sinh số liệu phải mở endpoint HTTP, phải chịu tải polling, phải giữ nguyên định dạng XML mãi mãi vì có kẻ khác đang parse nó.

### Bài toán 2 — theo dõi hành vi người dùng (user activity tracking)

LinkedIn là nền tảng tuyển dụng. Mỗi hành động của người dùng đều là dữ liệu quý:

```text
   "Người dùng #4471 xem hồ sơ của #9902"
   "Người dùng #4471 bấm vào tin tuyển dụng #331"
   "Người dùng #4471 tìm kiếm từ khoá 'java backend'"
   "Người dùng #4471 gửi lời mời kết nối tới #7781"
```

Ai cần những sự kiện này?

```text
                          ┌─────────────────────────┐
                          │  Sự kiện "xem hồ sơ"    │
                          └───────────┬─────────────┘
              ┌───────────┬───────────┼───────────┬───────────┐
              ▼           ▼           ▼           ▼           ▼
        ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
        │ Tính    │ │ Gợi ý   │ │ Báo cáo │ │ Chống   │ │ Kho dữ  │
        │ newsfeed│ │ việc làm│ │ kinh    │ │ gian lận│ │ liệu    │
        │         │ │         │ │ doanh   │ │         │ │ (Hadoop)│
        └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
           realtime    realtime    hàng giờ    realtime    hàng ngày
```

Năm hệ thống, **năm nhịp độ khác nhau**, cùng cần một luồng dữ liệu. Cách làm cũ là chạy **hourly batch** — gom log cả tiếng rồi đẩy một cục sang Hadoop. Nghĩa là mọi tính năng thời gian thực đều không thể tồn tại: không có gợi ý tức thời, không có phát hiện gian lận tức thời.

Và nếu mỗi hệ thống tiêu thụ tự đi lấy dữ liệu theo cách riêng, ta có bài toán N×M kinh điển:

```text
   KHÔNG có lớp trung gian: mỗi nguồn phải nối tới mỗi đích
   ══════════════════════════════════════════════════════════

     Nguồn                              Đích tiêu thụ
   ┌────────┐ ─────────────────────────► ┌──────────┐
   │ Web    │ ──────────────┐   ┌──────► │ Newsfeed │
   └────────┘ ───────┐      │   │        └──────────┘
   ┌────────┐ ───────┼──────┼───┼──────► ┌──────────┐
   │ Mobile │ ───────┼──────┼───┤   ┌──► │ Gợi ý    │
   └────────┘ ───────┼──────┤   │   │    └──────────┘
   ┌────────┐        │      │   │   │    ┌──────────┐
   │ Search │ ───────┴──────┴───┴───┴──► │ Hadoop   │
   └────────┘                            └──────────┘

   4 nguồn × 5 đích = 20 đường ống phải viết, test, vận hành, sửa
   Thêm 1 nguồn → phải nối thêm 5 đường
   Thêm 1 đích  → phải sửa cả 4 nguồn
```

Đây chính là thứ mà về sau Kafka xoá sổ: chèn **một lớp giữa duy nhất**, biến 20 đường ống thành 4 + 5 = 9 đường.

## Vì sao ActiveMQ không cứu được

LinkedIn đã có sẵn một message broker: **ActiveMQ** — một hàng đợi tin nhắn (message queue) chuẩn JMS, rất phổ biến thời đó. Câu hỏi hợp lý: sao không dùng luôn?

Họ đã thử. Và nó gãy. Lý do nằm ở **mô hình dữ liệu**, không phải ở chất lượng phần mềm.

### Message queue truyền thống hoạt động thế nào

```text
   HÀNG ĐỢI TRUYỀN THỐNG (ActiveMQ, RabbitMQ cổ điển)
   ═══════════════════════════════════════════════════

   Producer ──► [ msg5 | msg4 | msg3 ] ──► Consumer
                          ▲
                   broker giữ message trong bộ nhớ / disk

   Consumer đọc msg3  →  broker GỬI msg3 đi
   Consumer báo ack   →  broker XOÁ msg3 khỏi hàng đợi

   Trạng thái "ai đã đọc tới đâu" nằm ở BROKER.
```

Ba hệ quả chí mạng với quy mô của LinkedIn:

**Một — broker phải nhớ trạng thái của từng consumer.** Mỗi message chưa được ack là một mục broker phải theo dõi. Với hàng tỉ message mỗi ngày, bảng theo dõi này phình ra và ngốn sạch bộ nhớ.

**Hai — consumer chậm làm sập broker.** Nếu Hadoop ingest tạm dừng, message dồn lại trong broker. Broker hết RAM, bắt đầu swap ra disk theo kiểu truy cập ngẫu nhiên, chậm dần, rồi kéo theo cả những consumer đang khoẻ. Một consumer ốm làm cả hệ thống ốm — transcript gốc gọi đây là "broker gây gián đoạn (**disruptions**) cho ứng dụng", và mô tả đó chính xác.

**Ba — message bị xoá sau khi đọc, nên không thể phát lại.** Đội data science muốn chạy lại mô hình trên dữ liệu 3 ngày trước? Không có. Dữ liệu đã bị xoá ngay khi consumer đầu tiên ack.

**Bốn — không scale ngang được cho một luồng.** Không có cơ chế chẻ một hàng đợi thành nhiều mảnh chạy song song trên nhiều máy mà vẫn giữ được thứ tự.

### Con số quy mô

| Mốc | Lượng message/ngày ở LinkedIn |
|---|---|
| Khoảng 2011, lúc Kafka mới ra đời | hàng tỉ (**billions**) |
| 2016 (LinkedIn công bố "Kafka Ecosystem at LinkedIn") | ~1,4 nghìn tỉ (**trillion**) |
| 2019 (LinkedIn công bố) | ~7 nghìn tỉ, trên 100+ cụm, 4.000+ broker |

> **Lưu ý về con số**: đây là số LinkedIn tự công bố trên blog kỹ thuật của họ tại từng thời điểm, không phải hằng số của Kafka. Trích dẫn thì nên kèm năm.

## Quyết định thiết kế: đảo ngược mọi thứ

Nhóm ở LinkedIn kết luận: vấn đề không phải là ActiveMQ dở, mà là **mô hình hàng đợi sai bài toán**. Họ bỏ mô hình hàng đợi và lấy một thứ khác làm gốc — **cái log ghi thêm (append-only log)**, đúng thứ mà mọi cơ sở dữ liệu đã dùng trong 40 năm để đảm bảo bền vững.

Đối chiếu từng quyết định với cơn đau mà nó chữa:

| Cơn đau ở LinkedIn | Quyết định thiết kế của Kafka | Hệ quả trực tiếp |
|---|---|---|
| Consumer chậm làm sập broker | **Broker không theo dõi consumer.** Consumer tự giữ vị trí đọc (offset) | Broker chỉ ghi nối tiếp; consumer nhanh hay chậm không ảnh hưởng broker |
| Không phát lại được dữ liệu | **Đọc không xoá.** Message nằm lại tới khi hết hạn lưu trữ (retention) | Chạy lại mô hình 7 ngày trước chỉ là đặt lại offset |
| Nhiều đích tiêu thụ, nhiều nhịp độ | **Nhiều consumer group độc lập** đọc cùng một topic, mỗi group một offset riêng | Newsfeed đọc realtime, Hadoop đọc theo giờ, không đụng nhau |
| Không scale được một luồng | **Chẻ topic thành partition**, mỗi partition ở một máy | Muốn nhanh gấp 10 thì tăng partition |
| Polling HTTP, độ trễ 1 giờ | **Push từ producer, long-poll từ consumer** | Độ trễ tính bằng mili giây |
| Schema XML đổi liên tục | Message là **mảng byte thuần**, schema do ứng dụng quản (về sau có Schema Registry) | Broker không bao giờ vỡ vì schema đổi |
| Ghi đĩa quá chậm | **Chỉ ghi tuần tự + tận dụng page cache + zero-copy** | Ghi đĩa tuần tự nhanh hơn ghi RAM ngẫu nhiên |

Ba dòng cuối bảng là thứ khiến Kafka nhanh một cách phản trực giác. Sẽ đào sâu ở [Bài 4](04-giai-phau-broker-topic-partition-replica.md) và [Bài 5](05-leader-follower-isr-va-luong-ghi.md).

## Ai làm ra Kafka, và mốc thời gian thật

Ba người đồng sáng tạo, đều làm ở LinkedIn, sau này cùng lập công ty Confluent:

| Người | Vai trò trong dự án |
|---|---|
| **Jay Kreps** | Người khởi xướng, tác giả bài viết kinh điển *"The Log: What every software engineer should know about real-time data's unifying abstraction"* |
| **Neha Narkhede** | Đồng tác giả, phụ trách nhiều phần lõi và hệ sinh thái |
| **Jun Rao** | Đồng tác giả, phần lớn công việc về replication và độ bền dữ liệu |

Mốc thời gian:

```text
   2010      Bắt đầu phát triển nội bộ tại LinkedIn
   2011-01   Mã nguồn được mở (open source)
   2011      Bài báo khoa học "Kafka: a Distributed Messaging System
             for Log Processing" trình bày tại hội nghị NetDB
   2011-07   Vào Apache Incubator
   2012-10   Trở thành dự án cấp cao (top-level project) của Apache
   2014      Confluent được thành lập bởi ba người trên
   2021-04   Kafka 2.8 — KRaft ra mắt bản thử nghiệm (bỏ ZooKeeper)
   2022-10   Kafka 3.3 — KRaft sẵn sàng cho production (cụm mới)
   2025-03   Kafka 4.0 — ZooKeeper bị GỠ BỎ hoàn toàn
```

> **Đính chính transcript**: một số bản tóm tắt nói "Kafka ra đời năm 2011". Chính xác hơn: **phát triển từ 2010, mở mã nguồn đầu 2011**. Không phải sai lớn, nhưng nếu bạn nói trong phỏng vấn thì nên nói "đầu thập niên 2010, mở mã nguồn 2011".

### Vì sao tên là "Kafka"

Jay Kreps giải thích: hệ thống này được tối ưu cho **việc ghi (writing)**, nên lấy tên một nhà văn thì hợp. Ông từng học nhiều môn văn học và thích Franz Kafka. Không có ẩn ý kỹ thuật nào — đừng cố tìm mối liên hệ với *Hoá thân* hay *Vụ án*.

## Kafka thật sự là cái gì — định nghĩa sau khi đã hiểu bối cảnh

Bây giờ câu định nghĩa mở đầu mới có nghĩa:

> **Apache Kafka** là một **kho lưu trữ sự kiện phân tán** (distributed event store) kiêm **nền tảng xử lý luồng** (stream-processing platform).

Bóc từng chữ:

| Cụm từ | Nghĩa cụ thể |
|---|---|
| **event store** (kho sự kiện) | Không phải hàng đợi. Nó là **kho lưu trữ**: dữ liệu nằm lại trên đĩa theo thời hạn bạn đặt, đọc bao nhiêu lần cũng được |
| **distributed** (phân tán) | Dữ liệu được chẻ ra và nhân bản trên nhiều máy. Một máy chết, hệ thống vẫn chạy |
| **stream-processing platform** | Ngoài lưu trữ còn có Kafka Streams / ksqlDB để lọc, gộp, join dữ liệu ngay trong luồng |
| **high-throughput** (thông lượng cao) | Đo bằng triệu message/giây trên một cụm vừa phải |
| **low-latency** (độ trễ thấp) | Từ lúc producer gửi tới lúc consumer nhận: đơn vị mili giây |

Ba trong bốn thuộc tính đó (event store, distributed, high-throughput) đều là câu trả lời trực tiếp cho một cơn đau cụ thể ở bảng phía trên.

## Kafka được dùng ở đâu trong thực tế

| Lĩnh vực | Bài toán cụ thể | Vì sao Kafka hợp |
|---|---|---|
| **Ngân hàng** | Ghi nhận mọi giao dịch, phát hiện gian lận theo thời gian thực | Không được mất một giao dịch nào (nhân bản + `acks=all`); cần phát lại để đối soát |
| **Viễn thông** | Bản ghi cước (CDR) từ hàng triệu thuê bao | Thông lượng cực lớn, ghi tuần tự |
| **Thương mại điện tử** | Đơn hàng, tồn kho, thanh toán, vận chuyển tách rời nhau | Một sự kiện `OrderPlaced`, năm dịch vụ tự phản ứng độc lập |
| **Microservices** | Giao tiếp bất đồng bộ thay cho chuỗi REST đồng bộ | Xem lại [Phase 1](../phase-1-intro/01-tai-sao-event-driven.md) |
| **Kỹ nghệ dữ liệu (data pipeline / ETL)** | Đưa thay đổi từ database sang kho dữ liệu | Ghép với **CDC** (Change Data Capture) qua Debezium |
| **Nhật ký và giám sát** | Gom log từ hàng nghìn máy | Đúng bài toán gốc của LinkedIn |

### CDC là gì — thuật ngữ hay gặp cùng Kafka

**CDC** (Change Data Capture — bắt thay đổi dữ liệu) là kỹ thuật đọc **nhật ký ghi trước** của database (binlog của MySQL, WAL của PostgreSQL) rồi biến mỗi thay đổi thành một sự kiện.

```text
   Ứng dụng ghi vào MySQL
        │
        ▼
   ┌──────────────┐    đọc binlog     ┌──────────┐   publish   ┌───────┐
   │    MySQL     │ ────────────────► │ Debezium │ ──────────► │ Kafka │
   └──────────────┘                   └──────────┘             └───────┘
                                                                    │
                                       ┌────────────────────────────┤
                                       ▼                            ▼
                              Elasticsearch                    Kho dữ liệu
                              (đồng bộ chỉ mục tìm kiếm)      (báo cáo)
```

Cái hay: ứng dụng **không phải sửa một dòng code nào**. Nó cứ ghi vào MySQL như cũ. Debezium đọc binlog và biến mọi `INSERT` / `UPDATE` / `DELETE` thành sự kiện Kafka. Sẽ đối chiếu binlog với WAL kỹ hơn ở [Bài 3](03-doi-chieu-mysql-de-hieu-kafka.md), vì đây là chỗ rất nhiều tài liệu nói sai.

## Khi nào KHÔNG nên dùng Kafka

Phần này gần như không tài liệu giới thiệu nào viết, nhưng nó quan trọng ngang phần "khi nào nên dùng".

| Tình huống | Vì sao Kafka không hợp | Nên dùng gì |
|---|---|---|
| Cần trả lời **request/response** đồng bộ | Kafka là một chiều, không có khái niệm "trả lời". Ghép request/reply lên Kafka được nhưng gượng ép | REST, gRPC |
| Hàng đợi tác vụ có **ưu tiên** hoặc cần xoá/hoãn từng message | Log là bất biến, không sửa được một message ở giữa. Không có priority queue | RabbitMQ, SQS, Redis Streams |
| Chỉ có **vài trăm message mỗi ngày** | Chi phí vận hành (cụm 3 máy, giám sát, tuning) lớn hơn giá trị nhận về | Gọi HTTP trực tiếp, hoặc bảng trong database |
| Cần **truy vấn theo điều kiện** ("tìm mọi đơn hàng của khách X") | Kafka không có chỉ mục theo nội dung, chỉ đọc tuần tự theo offset | Database |
| Message rất lớn (video, ảnh gốc) | Mặc định `message.max.bytes` khoảng 1 MB; nhồi file lớn làm sập hiệu năng | Lưu ở S3/MinIO, đẩy **đường dẫn** vào Kafka |
| Team chưa có ai vận hành hệ phân tán | Kafka đổ vỡ theo kiểu khó chẩn đoán (ISR co lại, rebalance liên tục, lag phình) | Dùng bản quản lý sẵn (MSK, Confluent Cloud) trước |

Quy tắc ngón tay cái: **Kafka giải bài toán "một nguồn, nhiều đích, cần phát lại, cần thông lượng cao"**. Nếu bài toán của bạn không có ít nhất hai trong bốn yếu tố đó, hãy cân nhắc lại.

## Bẫy nhận thức thường gặp ở người mới

| Hiểu sai | Sự thật |
|---|---|
| "Kafka là message queue giống RabbitMQ" | Kafka là **log lưu trữ**. Đọc không xoá. Nhiều group đọc cùng dữ liệu độc lập |
| "Consumer đọc xong thì message biến mất" | Message ở lại tới khi hết `retention.ms` (mặc định 7 ngày) hoặc bị nén log |
| "Kafka đảm bảo thứ tự toàn cục" | Chỉ đảm bảo thứ tự **trong một partition**. Toàn topic thì không |
| "Kafka nhanh vì giữ trong RAM" | Kafka ghi thẳng ra đĩa. Nhanh nhờ **ghi tuần tự + page cache của hệ điều hành + zero-copy** |
| "Thêm broker là tự động nhanh hơn" | Broker cho **dung lượng**. Muốn nhanh hơn cho một topic phải tăng **partition** |
| "Kafka đảm bảo exactly-once mọi lúc" | Chỉ đúng trong phạm vi Kafka-tới-Kafka có transaction. Xem [Phase 14](../phase-14-transactions/03-eos-myth-summary.md) |

## Tóm tắt bài 1

- Kafka sinh ra từ **hai bài toán thật** ở LinkedIn: thu thập số liệu vận hành bằng polling XML (chậm, schema loạn) và theo dõi hành vi người dùng theo batch hàng giờ (không realtime).
- **ActiveMQ không cứu được** vì mô hình hàng đợi bắt broker phải nhớ trạng thái từng consumer, xoá message sau khi đọc, và không chẻ nhỏ một luồng ra nhiều máy được.
- Quyết định thiết kế cốt lõi: **đảo ngược trách nhiệm** — broker chỉ ghi log tuần tự, consumer tự nhớ offset, message không bị xoá khi đọc.
- Điều đó trực tiếp sinh ra bốn đặc tính: phát lại được, nhiều consumer group độc lập, scale bằng partition, thông lượng rất cao.
- Ba đồng tác giả: **Jay Kreps, Neha Narkhede, Jun Rao**. Phát triển từ 2010, mở mã 2011, thành dự án Apache cấp cao 2012.
- Kafka **không** thay thế được: request/response đồng bộ, hàng đợi có ưu tiên, truy vấn theo điều kiện, hay tải quá nhỏ.

**Bài kế tiếp** → [Bài 2: Cluster là gì — High Availability và Scalability giải nghĩa tận gốc](02-cluster-ha-va-scalability.md)
