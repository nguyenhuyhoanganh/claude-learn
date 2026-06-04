# Bài 1: Message Acknowledgement — vì sao consumer phải xác nhận đã xử lý

Phase 3 bài 8 đã giới thiệu **offset tracking**: Kafka maintain ledger ghi nhận consumer group đã đọc đến đâu. Bài này đi sâu hơn: **khi nào** offset được update? **Ai** trigger update? Chuyện gì xảy ra nếu **không update**?

Trả lời ngắn: consumer phải **acknowledge** (xác nhận đã xử lý xong) thì Kafka mới update offset. **Message acknowledgement** = thuật ngữ application-level. **Offset commit** = thuật ngữ Kafka-level. Hai cái cùng nghĩa, chỉ dùng ở context khác.

## Recap: ledger của Kafka

Khi describe consumer group:

```bash
./kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group payment-service

# Output:
# GROUP             TOPIC          PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# payment-service   order-events   0          47               50              3
```

3 con số cốt lõi:
- **LOG-END-OFFSET (LEO)** = offset cuối cùng trong partition (next offset Kafka sẽ ghi). LEO = 50 nghĩa là có 50 message (offset 0-49).
- **CURRENT-OFFSET** = vị trí consumer group "đang đứng". CURRENT = 47 nghĩa là consumer đã xem qua offset 46, lần sau sẽ lấy offset 47.
- **LAG** = LEO - CURRENT. LAG = 3 → còn 3 message chưa được consume.

Khi LAG = 0 → consumer đã catch up, không còn message nào để deliver.

## Câu hỏi cốt lõi: khi nào CURRENT-OFFSET được update?

Có thể bạn nghĩ: "Khi Kafka deliver message cho consumer → offset update ngay luôn." **SAI**.

Kafka là **streaming platform**. Cần đảm bảo consumer **thực sự nhận + xử lý xong** message. Nếu Kafka update offset ngay khi gửi → consumer nhận xong nhưng crash trước khi xử lý → message **bị mất** (vì offset đã advance, consumer restart sẽ skip).

Vì vậy Kafka **đợi acknowledgement** từ consumer:

```text
Bước 1: Consumer ask broker: "give me messages"
Bước 2: Broker gửi 4 message (offset 47, 48, 49, 50)
Bước 3: Consumer xử lý từng message
Bước 4: Consumer gửi acknowledgement: "Tôi đã xong đến offset 50"
Bước 5: Broker update CURRENT-OFFSET = 50 (hoặc 51 = next offset)
```

Không có bước 4 → broker **không update** offset.

## Acknowledgement = application's job

Consumer **phải** acknowledge. Đây là **trách nhiệm của application**, không phải Kafka tự động.

| Thuật ngữ | Context |
|---|---|
| **Acknowledgement** | Developer dùng — góc nhìn application |
| **Offset commit** | Kafka official term — Kafka operation |

2 từ này dùng **interchangeable**, chỉ ngữ cảnh khác.

## Spring Cloud Stream làm gì cho ta?

Trong tất cả demo Phase 4-11, chúng ta **chưa bao giờ viết acknowledgement logic**. Vì sao vẫn chạy được?

→ **SCS framework auto-ack** dưới lớp.

### Pseudocode SCS internal

```text
SCS framework:
  handler = our @Bean Consumer<OrderEvent> bean
  
  while (running) {
      records = kafkaConsumer.poll(timeout)        // ask Kafka cho list message
      
      // records có thể: empty, 1 message, 500 messages (tuỳ max.poll.records)
      
      for (record in records) {
          handler.accept(record)                    // gọi handler của ta
      }
      
      // CHỈ KHI tất cả message trong batch xử lý thành công:
      kafkaConsumer.commitSync()                    // ack batch về Kafka
  }
```

Logic auto-ack:
- SCS gọi handler với từng message trong batch.
- Nếu **handler không throw exception** → ack thành công sau khi xử lý xong batch.
- Nếu handler throw → không ack (Spring sẽ retry).

## Pattern quan trọng: ack theo batch, không từng cái

Acknowledgement là **network call** (gửi request sang Kafka broker để update offset). 100 message ack 100 lần = quá tốn.

Vì vậy SCS **ack theo batch**: xử lý xong 100 message → 1 ack duy nhất commit offset 100.

```text
Kafka deliver: msg-47, msg-48, msg-49, msg-50

Consumer processing:
  msg-47 ✓ (không ack ngay)
  msg-48 ✓ (không ack ngay)
  msg-49 ✓ (không ack ngay)
  msg-50 ✓
  
SCS gửi 1 ack: "đã xử lý đến offset 50"
Kafka update CURRENT-OFFSET = 51 (next offset to read)
```

## Quirk quan trọng: ack offset 50 = đã xem từ 47 đến 50

Scenario:
- Topic partition có 8 message (offset 0-7).
- Consumer xin 4 message → broker gửi `msg-0, msg-1, msg-2, msg-3`.
- Consumer xử lý tất cả 4.
- Consumer **CHỈ ack offset 3** (offset cuối cùng).

Khi consumer crash + restart → ask broker 4 message tiếp theo. Broker gửi gì?

**Trả lời**: `msg-4, msg-5, msg-6, msg-7`. KHÔNG phải `msg-0` đến `msg-3` (đã ack), cũng KHÔNG phải `msg-0, 1, 2, 4` (nghĩ rằng chỉ ack offset 3 nên 0,1,2 vẫn chưa được ack).

**Lý do**: ack offset 3 mang nghĩa **"đã xem qua tất cả đến và bao gồm offset 3"**. Không phải "chỉ xem offset 3". Đây là chỗ **nhiều người hiểu nhầm**.

Quy tắc nhớ: **offset ack là offset cuối cùng đã xử lý**. Mọi offset trước đó coi như đã ack ngầm.

## Vì sao Kafka thiết kế vậy?

Hiệu quả. Nếu Kafka phải track "ack offset 0, ack offset 1, ..." từng cái → tốn nhiều storage trong `__consumer_offsets`. Track **last committed offset** đủ rồi — vì message phải xử lý **theo thứ tự** trong partition.

## Chuyện gì xảy ra nếu KHÔNG ack?

Đây là vấn đề quan trọng cần hiểu.

### Scenario: PaymentProcessor crash giữa lúc ack

```text
Bước 1: PaymentProcessor xin 4 message từ Kafka
Bước 2: Kafka gửi msg-100, 101, 102, 103
Bước 3: PaymentProcessor xử lý:
   - msg-100: charge $50 cho customer A ✓
   - msg-101: charge $75 cho customer B ✓
   - msg-102: charge $30 cho customer C ✓
   - msg-103: charge $100 cho customer D ✓
Bước 4: PaymentProcessor chuẩn bị gửi ack...
Bước 5: 💥 PROCESS CRASH (OOM, hardware fail, k8s kill)

Kafka KHÔNG nhận được ack.
```

PaymentProcessor restart, rejoin group, ask 4 message. Kafka gửi gì?

**Trả lời**: msg-100, 101, 102, 103 — **redeliver lại**.

PaymentProcessor sẽ **charge lại 4 customer này**. Customer A bị charge 2 lần $50. **Bug nghiêm trọng**.

### Đây là challenge cốt lõi của EDA

Vấn đề này **KHÔNG phải lỗi Kafka**. Kafka đúng — message đã gửi nhưng không có ack → retry. Đó là behavior **at-least-once** (ít nhất 1 lần) — đảm bảo không mất message.

**Vấn đề là ở application design**. Consumer phải được thiết kế **idempotent** (xử lý cùng 1 message 2 lần không gây hậu quả khác lần 1).

Cách giải quyết:
1. **Idempotency key**: track UUID đã xử lý trong DB, gặp UUID đã có → skip.
2. **Database constraint**: unique index trên `(orderId, paymentAttempt)` → INSERT lần 2 fail.
3. **Idempotent business logic**: vd "set status = paid" thay vì "increment payment_count".
4. **Transactional outbox**: pattern Phase 13 sẽ học.

Phase 18 (Best Practices) sẽ đi sâu hơn idempotency patterns.

## Tóm tắt bài 1

- **Offset tracking**: Kafka maintain CURRENT-OFFSET cho mỗi (group, partition). LAG = LEO - CURRENT.
- Kafka **KHÔNG tự update** offset khi gửi message. Phải đợi consumer **acknowledge** (gửi ack về).
- 2 thuật ngữ tương đương: **Message Acknowledgement** (góc nhìn app) = **Offset Commit** (Kafka term).
- Spring Cloud Stream **auto-ack** sau mỗi batch: xử lý xong batch không lỗi → ack batch.
- Ack là **network call** → ack theo batch (cuối batch 1 ack), không từng message.
- **Ack offset N = đã xử lý đến (và bao gồm) offset N**. Offset trước N coi như ack ngầm.
- Nếu app crash **trước khi ack** → Kafka redeliver message → có thể gây **duplicate processing**.
- Đây là challenge của EDA, không phải lỗi Kafka. Fix: thiết kế consumer **idempotent**.

**Bài kế tiếp** → [Bài 2: Manual ack + Negative ack (NACK)](02-manual-ack-nack.md)
