# Bài 1: Message broker, Queue và Topic — Kafka đứng ở đâu trong bức tranh chung

Câu hỏi phỏng vấn tưởng dễ mà rất nhiều người trả lời hỏng: **"Kafka khác RabbitMQ chỗ nào?"**

Câu trả lời hay gặp — *"Kafka nhanh hơn, chịu tải lớn hơn"* — vừa mơ hồ vừa không hoàn toàn đúng. RabbitMQ có những việc làm tốt hơn Kafka rõ rệt. Khác biệt thật không nằm ở tốc độ mà nằm ở **mô hình dữ liệu**, và từ mô hình đó suy ra được mọi khác biệt còn lại.

Bài này dựng bức tranh chung: từ lập trình bất đồng bộ, tới message broker, tới hai mẫu phân phối kinh điển, rồi mới đặt Kafka vào đúng ô của nó.

## Từ gọi trực tiếp tới bất đồng bộ tới message-driven

### Nấc 1 — gọi đồng bộ

```text
   Service A ──── request ────► Service B
             ◄─── response ────
             (A ĐỨNG CHỜ suốt thời gian này)
```

A bị khoá cho tới khi B trả lời. Mọi vấn đề của kiến trúc microservice đồng bộ đã bàn ở [Phase 1](../phase-1-intro/01-tai-sao-event-driven.md) đều bắt nguồn từ chữ **chờ** này.

### Nấc 2 — bất đồng bộ, nhưng vẫn gọi trực tiếp

```text
   Service A ──── request ────► Service B
             ◄─── "đã nhận" ───         (B xác nhận ngay, xử lý sau)

   A rảnh, làm việc khác...

             ◄─── kết quả ─────         (B gọi ngược lại A khi xong)
```

Đây là **asynchronous programming**: tách luồng request khỏi luồng response. Đã tốt hơn nhiều, nhưng vẫn còn hai lỗ hổng:

| Lỗ hổng | Tình huống cụ thể |
|---|---|
| **A vẫn phải biết B ở đâu và B phải đang sống** | B quá tải từ chối nhận, hoặc B chết → A phải tự viết cơ chế thử lại, tự lưu request chưa gửi được |
| **Muốn gửi cho nhiều bên là phải gọi nhiều lần** | Muốn đặt hàng ở **mọi** cửa hàng tại Hà Nội → A phải gọi lần lượt từng cửa hàng, và tự xử lý khi vài cửa hàng lỗi |

### Nấc 3 — message-driven, có bên thứ ba

```text
   Service A ──► ┌──────────────────┐ ──► Service B
                 │  MESSAGE BROKER  │ ──► Service C
   Service D ──► │  (bên thứ ba)    │ ──► Service E
                 └──────────────────┘
                 Hai nhiệm vụ:
                   1. Đảm bảo message tới nơi
                   2. Đưa tới ĐÚNG địa chỉ
```

A không còn biết B, C, E tồn tại. Nó chỉ nói chuyện với broker. Đây là bước nhảy về **kiến trúc**, không phải về hiệu năng.

## Message broker được và mất gì

Rất nhiều tài liệu chỉ liệt kê ưu điểm. Phần nhược điểm mới là phần quyết định có nên dùng hay không.

| Được | Mất |
|---|---|
| **Giảm tải** cho server nhờ bớt tương tác trực tiếp | **Phải vận hành thêm một hệ thống** — cài, giám sát, cảnh báo, nâng cấp |
| **Lưu trữ request** khi bên nhận gặp sự cố | **Broker chết thì cả hệ thống chết** — nó thành điểm phụ thuộc mới |
| **Phân phối** request tới nhiều server | **Tăng độ trễ**, giảm hiệu năng đường đi đơn lẻ |
| **Đơn giản hoá** giao tiếp trong môi trường nhiều dịch vụ | **Khó truy vết** — một luồng nghiệp vụ giờ nằm rải rác ở nhiều dịch vụ, phải có distributed tracing |
| Bên gửi và bên nhận **không cần cùng online** | **Khó debug** — lỗi xảy ra ở consumer, nhưng nguyên nhân nằm ở producer từ hôm trước |

Dòng cuối là cái giá thực tế lớn nhất mà không tài liệu nào nói. Trong hệ đồng bộ, lỗi nổ ra tại chỗ và bạn có stack trace. Trong hệ message-driven, message hỏng nằm im trong topic vài giờ rồi mới nổ, ở một dịch vụ khác, không có ngữ cảnh gì của bên gửi. Đó là lý do [Phase 13](../phase-13-error-handling/02-retryable-nonretryable-dlq.md) về Dead Letter Queue quan trọng đến vậy.

## Hai mẫu phân phối kinh điển

Đây là phần cần nắm thật chắc, vì nó là gốc của mọi khác biệt giữa các broker.

### Point-to-Point — mẫu Queue

```text
                    ┌─────────────────────────┐
   Producer ──────► │ QUEUE: [m3][m2][m1]     │
                    └───────────┬─────────────┘
                                │  MỖI message chỉ tới ĐÚNG MỘT nơi
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              Consumer A   Consumer B   Consumer C
              nhận m1      nhận m2      nhận m3

   Ví dụ đời thường: tin nhắn riêng giữa hai người trên Skype.
   Ví dụ kỹ thuật: hàng đợi công việc — mỗi việc chỉ nên có MỘT worker làm.
```

### Broadcast — mẫu Topic

```text
                    ┌─────────────────────────┐
   Producer ──────► │ TOPIC: m1               │
                    └───────────┬─────────────┘
                                │  MỘT message tới MỌI người đăng ký
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              Subscriber A  Subscriber B  Subscriber C
              nhận m1       nhận m1       nhận m1

   Ví dụ đời thường: theo dõi một kênh — mọi người theo dõi đều nhận thông báo.
   Ví dụ kỹ thuật: sự kiện "đơn hàng đã tạo" — kho, thanh toán, vận chuyển đều cần.
```

| | Queue (point-to-point) | Topic (broadcast) |
|---|---|---|
| Một message tới bao nhiêu nơi | **Đúng một** | **Mọi bên đăng ký** |
| Dùng cho | Chia việc, cân tải | Phát tán sự kiện |
| Thêm consumer thì | Việc được chia nhỏ ra, **nhanh hơn** | Mỗi người nhận **thêm một bản** |
| Bên gửi biết bên nhận không | Không | Không |

## Kafka làm được CẢ HAI — bằng consumer group

Đây là chỗ đẹp nhất trong thiết kế Kafka, và cũng là chỗ hay bị hiểu nhầm nhất. Kafka **không** có hai loại đối tượng "queue" và "topic". Nó chỉ có **topic**, rồi dùng **consumer group** để chọn hành vi.

```text
   Topic "order-events" có 3 partition
   ═══════════════════════════════════

   ┌── HÀNH VI QUEUE ──────────────────────────────────────────┐
   │  Đặt MỌI consumer vào CÙNG MỘT group                      │
   │                                                             │
   │   P0 ──► consumer-1  ┐                                     │
   │   P1 ──► consumer-2  ├── group "inventory-service"          │
   │   P2 ──► consumer-3  ┘                                     │
   │                                                             │
   │  → Mỗi message chỉ do MỘT consumer xử lý                   │
   │  → Thêm consumer = chia việc = NHANH HƠN                   │
   └─────────────────────────────────────────────────────────────┘

   ┌── HÀNH VI TOPIC ──────────────────────────────────────────┐
   │  Đặt mỗi consumer vào MỘT group RIÊNG                      │
   │                                                             │
   │   P0,P1,P2 ──► consumer-A   group "inventory-service"      │
   │   P0,P1,P2 ──► consumer-B   group "shipping-service"       │
   │   P0,P1,P2 ──► consumer-C   group "analytics-service"      │
   │                                                             │
   │  → MỌI group đều nhận ĐẦY ĐỦ mọi message                   │
   │  → Ba dịch vụ xử lý độc lập, không đụng nhau               │
   └─────────────────────────────────────────────────────────────┘
```

Quy tắc rút gọn — đáng thuộc:

> **Trong một group: chia nhau (queue). Giữa các group: ai cũng nhận đủ (topic).**

Và điều làm Kafka mạnh hơn hẳn broker truyền thống: **hai hành vi này tồn tại đồng thời trên cùng một topic**. Bạn không phải chọn lúc tạo topic. Thêm một group mới hôm nay là có ngay một luồng tiêu thụ độc lập trên toàn bộ dữ liệu đã có — mà không phải sửa producer, không phải tạo queue mới, không phải xin ai.

### Hệ quả: offset lưu theo bộ ba

```text
   Kafka lưu offset theo (consumer group, topic, partition)

   ("inventory-service", "order-events", 0)  →  offset 100
   ("shipping-service",  "order-events", 0)  →  offset  50
   ("analytics-service", "order-events", 0)  →  offset   3
```

Ba group đọc cùng partition 0, mỗi group một vị trí riêng, hoàn toàn không biết nhau. `analytics-service` chạy chậm hơn 97 message cũng không làm phiền ai.

> **Đính chính từ tài liệu nguồn**: có tài liệu ghi *"trước đây offset lưu trong ZooKeeper, nhưng từ Kafka 2.1.0 lưu trực tiếp trên broker trong `__consumer_offsets`"*. Con số **2.1.0 là sai**. Việc chuyển sang `__consumer_offsets` diễn ra ở **Kafka 0.9 (cuối năm 2015)**. Nếu bạn đọc tài liệu nào còn dùng `--zookeeper` trong lệnh consumer, đó là tài liệu đã lỗi thời cả chục năm.

### Bẫy: group không có consumer nào thì message "treo"

```text
   Group "analytics-service" được tạo, đọc tới offset 3,
   rồi TOÀN BỘ consumer của group đó bị tắt vĩnh viễn.

   → Kafka VẪN GIỮ offset của group đó trong __consumer_offsets
   → Lag của group tăng vô hạn theo thời gian
   → Dashboard giám sát báo động đỏ mãi mãi
   → Không ai xử lý, vì dịch vụ đó đã bị khai tử
```

Hai thứ chữa:

```bash
# Xoá hẳn group không dùng nữa
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --delete --group analytics-service
```

Và biết về `offsets.retention.minutes` (mặc định **10080** phút = 7 ngày): group không hoạt động quá thời gian này sẽ bị Kafka tự xoá offset. Đây là con dao hai lưỡi — nó dọn rác giúp bạn, nhưng cũng nghĩa là **một consumer nghỉ lễ 10 ngày rồi bật lại sẽ mất vị trí đọc** và nhảy theo `auto.offset.reset`.

## Phân loại broker: Message base và Data pipeline

Đây là cách phân loại gọn nhất để trả lời câu hỏi "Kafka khác RabbitMQ chỗ nào".

```text
   ┌──────────────────────────┬──────────────────────────────────┐
   │  MESSAGE BASE            │  DATA PIPELINE                   │
   │  ActiveMQ, RabbitMQ,     │  Kafka, RocketMQ, Pulsar         │
   │  ZeroMQ, SQS             │                                  │
   ├──────────────────────────┼──────────────────────────────────┤
   │ Broker LƯU trạng thái    │ Broker KHÔNG lưu trạng thái      │
   │ của từng consumer        │ consumer. Consumer tự giữ offset │
   ├──────────────────────────┼──────────────────────────────────┤
   │ Message BỊ XOÁ sau khi   │ Message VẪN CÒN sau khi consumer │
   │ consumer nhận (và ack)   │ đọc, tới khi hết retention       │
   ├──────────────────────────┼──────────────────────────────────┤
   │ Consumer chỉ lấy được    │ Consumer tuỳ ý đọc một DẢI       │
   │ ĐÚNG message mới đó      │ message, kể cả message CŨ        │
   ├──────────────────────────┼──────────────────────────────────┤
   │ Ưu: đảm bảo mỗi consumer │ Ưu: thông lượng rất cao,         │
   │ nhận đúng một lần dễ hơn │ phát lại được, nhiều bên tiêu thụ│
   └──────────────────────────┴──────────────────────────────────┘
```

Mọi khác biệt khác đều **suy ra được** từ ba dòng giữa:

| Câu hỏi | Message base | Data pipeline (Kafka) | Suy ra từ |
|---|---|---|---|
| Phát lại dữ liệu 3 ngày trước? | Không — đã xoá | **Được** | "Message vẫn còn" |
| Thêm một hệ tiêu thụ mới trên dữ liệu cũ? | Không | **Được** | "Message vẫn còn" |
| Hàng đợi có độ ưu tiên? | **Được** — RabbitMQ có sẵn | Không có sẵn (xem [bài 2](02-uu-tien-message-trong-kafka.md)) | Log bất biến, không sắp xếp lại được |
| Xoá / hoãn một message cụ thể? | **Được** | Không | Log chỉ ghi thêm |
| Định tuyến phức tạp theo nội dung? | **Được** — exchange, binding key | Phải tự viết (xem [Phase 8](../phase-8-event-routing/01-content-based-routing.md)) | Kafka cố ý giữ broker ngu, logic ở client |
| Thông lượng hàng triệu message/giây? | Khó | **Được** | Ghi tuần tự, không theo dõi consumer |
| Consumer chậm làm sập broker? | **Có nguy cơ** | Không | Broker không giữ trạng thái consumer |

Dòng cuối là lý do gốc khiến LinkedIn phải viết Kafka thay vì dùng ActiveMQ ([Phase 20 bài 1](../phase-20-kafka-internals/01-vi-sao-kafka-ra-doi-tai-linkedin.md)).

### Chọn cái nào

| Bài toán của bạn | Chọn |
|---|---|
| Hàng đợi công việc, có ưu tiên, có hoãn, có xoá từng việc | **RabbitMQ / SQS** |
| Định tuyến phức tạp theo nội dung, nhiều quy tắc | **RabbitMQ** |
| Yêu cầu tuyệt đối "mỗi consumer nhận đúng một lần" và tải nhỏ | **Message base** |
| Một nguồn, nhiều đích tiêu thụ độc lập | **Kafka** |
| Cần phát lại lịch sử để đối soát hoặc huấn luyện mô hình | **Kafka** |
| Thông lượng rất cao, tăng trưởng liên tục | **Kafka** |
| Ghi nhận sự kiện làm nguồn sự thật (event sourcing) | **Kafka** |

Và câu quan trọng nhất: **dùng cả hai cũng hoàn toàn hợp lý.** Nhiều hệ thống dùng Kafka làm xương sống sự kiện và RabbitMQ cho hàng đợi tác vụ có ưu tiên. Đây không phải cuộc chiến một mất một còn.

## Đính chính hai chỗ trong tài liệu nguồn

### "Kafka cluster là một set các server, mỗi một set này được gọi là 1 broker"

Câu này bị đảo. Đúng là:

> **Cluster** = một tập nhiều broker. **Một broker = một tiến trình Kafka**, không phải một "set".

Chi tiết ở [Phase 20 bài 4](../phase-20-kafka-internals/04-giai-phau-broker-topic-partition-replica.md).

### "ZooKeeper được dùng để quản lý và bố trí các broker"

Đúng với Kafka cũ, nhưng **đã lỗi thời**. Từ Kafka 3.3 KRaft là mặc định cho cụm mới, và **Kafka 4.0 (3/2025) đã gỡ bỏ ZooKeeper hoàn toàn**. Chi tiết ở [Phase 20 bài 6](../phase-20-kafka-internals/06-zookeeper-tu-a-den-z.md) và [bài 7](../phase-20-kafka-internals/07-kraft-va-thuat-toan-raft.md).

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| "Kafka là message queue" | Kafka là **kho log**. Đọc không xoá. Nó *mô phỏng* queue bằng consumer group |
| "Thêm consumer vào group thì mỗi consumer nhận thêm bản sao" | Ngược lại — **chia nhau ra**. Muốn ai cũng nhận đủ thì phải khác group |
| "Nhiều consumer hơn partition thì nhanh hơn" | Phần dư **ngồi không**. Trần là số partition |
| "Kafka thay được RabbitMQ trong mọi trường hợp" | Không có hàng đợi ưu tiên, không hoãn được, không xoá từng message, định tuyến phải tự viết |
| Quên đặt `group.id` | Spring sinh group ngẫu nhiên mỗi lần khởi động → đọc lại từ đầu mỗi lần deploy |
| Tạo group thử nghiệm rồi bỏ quên | Lag báo động đỏ vĩnh viễn. Nhớ `--delete --group` |
| Tin rằng offset tồn tại mãi mãi | `offsets.retention.minutes` mặc định **7 ngày** cho group không hoạt động |

## Tóm tắt bài 1

- Ba nấc tiến hoá: **gọi đồng bộ** → **bất đồng bộ nhưng vẫn gọi trực tiếp** → **message-driven qua bên thứ ba**. Nấc ba mới xoá được ràng buộc "bên gửi phải biết bên nhận và bên nhận phải đang sống".
- Message broker **được** giảm tải, lưu trữ khi sự cố, tách rời dịch vụ; **mất** thêm một hệ thống phải vận hành, độ trễ tăng, và **khó truy vết lỗi** — đây là cái giá thực tế lớn nhất.
- Hai mẫu phân phối: **Queue** (một message → đúng một nơi) và **Topic** (một message → mọi bên đăng ký).
- **Kafka làm được cả hai cùng lúc trên một topic** nhờ consumer group: *trong một group thì chia nhau, giữa các group thì ai cũng nhận đủ*. Không phải chọn lúc tạo topic.
- Offset lưu theo bộ ba **(group, topic, partition)** → các group hoàn toàn độc lập.
- Phân loại gốc: **Message base** (RabbitMQ, ActiveMQ — broker giữ trạng thái consumer, message bị xoá sau khi đọc) và **Data pipeline** (Kafka — broker không giữ trạng thái, message ở lại). Mọi khác biệt còn lại đều suy ra từ đây.
- Kafka **không** thay được RabbitMQ ở: hàng đợi ưu tiên, hoãn message, xoá từng message, định tuyến phức tạp có sẵn. **Dùng cả hai là lựa chọn hợp lý.**
- **Đính chính**: offset chuyển từ ZooKeeper sang `__consumer_offsets` ở **Kafka 0.9 (2015)**, không phải 2.1.0. Và **một broker là một tiến trình**, không phải "một set server".

**Bài kế tiếp** → [Bài 2: Ưu tiên message trong Kafka — ba mẫu thiết kế và cái giá của từng mẫu](02-uu-tien-message-trong-kafka.md)
