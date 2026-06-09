# Bài 4: Transactional Outbox Pattern — publish event đáng tin cậy

Khi một service vừa **ghi DB** vừa **phát event** ra Kafka, có một khe nứt chết người: nếu nó crash *giữa* hai việc, bạn được một nửa — DB đã ghi nhưng event chưa phát (hoặc ngược lại). **Transactional Outbox** đóng khe nứt đó. Pattern này trông giống Materialized View nhưng giải bài toán hoàn toàn khác — cuối bài sẽ phân biệt rõ.

## Bài toán: dual-write không nguyên tử

Tình huống: account service tạo account mới, rồi muốn data science team phân tích data đó. Account service phải làm **hai việc**:

```text
   Job 1: INSERT vào accounts DB
   Job 2: publish event lên Kafka cho data science team
```

Hai việc này **không** nằm trong cùng một transaction (DB và Kafka là hai hệ khác nhau). Nếu service crash giữa chừng:

```text
   Kịch bản A: ghi DB xong ──crash── chưa publish Kafka  → data có, event MẤT
   Kịch bản B: publish Kafka xong ──ghi DB fail──        → event có, data KHÔNG có
```

Cả hai đều để hệ thống ở trạng thái **nửa vời**. Ta cần đảm bảo **cả hai cùng xảy ra, hoặc cùng không**.

## Ba cách tiếp cận thường gặp (và vì sao chưa đủ)

### Cách 1: Cấp quyền truy cập DB trực tiếp cho data science

```text
   data science team  ──connect trực tiếp──►  accounts DB
```

| Vấn đề | Giải thích |
|---|---|
| Tight coupling | Đổi schema accounts phải phối hợp với data science team |
| Quá tải DB | Họ chạy nhiều analytics → accounts DB nhận tải lớn → ảnh hưởng nghiệp vụ |

→ Không nên.

### Cách 2: Two-Phase Commit (2PC)

```text
   code điều phối 2 DB: "cả hai sẵn sàng commit chưa?" → cùng commit / cùng rollback
```

> **2PC (Two-Phase Commit)**: một điều phối viên hỏi mọi DB "sẵn sàng chưa?"; nếu tất cả "yes" thì cùng ghi, một cái lỗi thì rollback tất cả. Nhưng 2PC **chậm và blocking** (phải đồng bộ giữa các node), khó hiện thực → rất ít người dùng. Thay thế thường là **Saga** (Phase 5-6).

### Cách 3: Đẩy thẳng lên Kafka

```text
   accounts INSERT DB  →  accounts publish Kafka  →  data science consume
```

Tốt hơn (decouple, async), nhưng **chính là** bài toán dual-write ở trên: crash giữa hai bước → mất đồng bộ. Đây là điểm Transactional Outbox vào cuộc.

## Lời giải: bảng Outbox trong cùng một transaction

> **Transactional Outbox Pattern**: service ghi data nghiệp vụ **và** một bản ghi "cần-phát-event" vào một **bảng outbox** — cả hai trong **cùng một database transaction**. Một tiến trình bất đồng bộ riêng đọc bảng outbox và phát event ra Kafka.

Mấu chốt: `accounts` table và `outbox` table nằm trong **cùng một DB** → ghi cả hai trong **một transaction nguyên tử**:

```text
   ┌──────────── accounts DB (1 transaction) ────────────┐
   │  INSERT accounts table   ✅                          │
   │  INSERT outbox table     ✅   ← cùng transaction     │
   └──────────────────────────────────────────────────────┘
        nếu một cái fail → ROLLBACK CẢ HAI
                 │
                 ▼  (tiến trình riêng, bất đồng bộ)
        Polling process đọc outbox → publish Kafka
                 │   nhận ACK từ Kafka?
                 ├─ CÓ  → xóa / đánh dấu "đã gửi" record outbox
                 └─ KHÔNG → giữ nguyên record → lần polling sau RETRY
                 ▼
        Kafka ──► data science team consume
```

Nhờ đó account service làm **đúng một việc đơn giản**: ghi hai bảng trong một transaction (hoặc rollback cả hai). Nó **không** phải lo việc gửi Kafka — đó là việc của polling process. Vì hai bảng cùng một DB server, **không thể** xảy ra cảnh "chỉ ghi một bảng".

## Tiến trình đọc outbox: polling hoặc CDC

| Cách | Cơ chế |
|---|---|
| **Polling process** | Một batch/scheduler (Spring Scheduler...) quét outbox định kỳ (vd mỗi 30 phút), phát record mới lên Kafka, nhận ACK rồi mới xóa/đánh dấu |
| **CDC** (Debezium) | Theo dõi transaction log của DB; khi outbox có record mới → tự phát lên Kafka (xem Phase 3 bài 11) |

Điểm cốt lõi của độ tin cậy: **chỉ xóa/đánh dấu record outbox sau khi Kafka ACK**. Nếu 9h Kafka bận không ACK → polling **không** xóa record → 9h30 thử lại → cuối cùng cũng gửi được. Không mất event.

## Bốn lợi ích

| Lợi ích | Giải thích |
|---|---|
| **Decoupling** | Service chỉ lo ghi outbox; không bận tâm cách truyền message |
| **Reliability** (lợi ích chính) | Event lưu *transactionally* cùng data nghiệp vụ → đảm bảo giao ngay cả khi lỗi; lỗi thì rollback cả data |
| **Scalability** | Message nằm trong DB, broker consume theo nhịp riêng; bên đọc chạy theo tốc độ của họ |
| **Performance** | Tách "ghi nghiệp vụ" khỏi "gửi message" → xử lý bất đồng bộ, service nhanh hơn |

## Materialized View vs Transactional Outbox — đừng nhầm

Hai pattern trông giống (đều event-driven, đều có bảng phụ, đều async) nhưng **giải bài toán khác hẳn**:

| Tiêu chí | Materialized View | Transactional Outbox |
|---|---|---|
| Mục tiêu | **Tối ưu đọc** — dựng view gom-sẵn từ nhiều nguồn | **Phát event đáng tin cậy** giữa DB và message broker |
| Tập trung vào | Hiệu năng truy vấn | Nhất quán + độ tin cậy khi phát event |
| Bảng phụ | View table (data gom sẵn để đọc) | Outbox table (record chờ phát) |
| Đồng bộ data | Replicate async vào view để đọc nhanh | Ghi outbox trong transaction, phát async sau |
| Use case | Hệ query-heavy cần gom data đa nguồn | Hệ event-driven cần inter-service communication tin cậy |
| Thách thức | Đạt consistency + tốn storage | Quản lý outbox + overhead xử lý |

> Nói gọn: **Materialized View lo *đọc nhanh*; Transactional Outbox lo *phát event không mất*.** Chọn theo bài toán, không phải theo "trông giống nhau".

## Tóm tắt bài 4

- Bài toán **dual-write**: ghi DB + phát Kafka không nguyên tử → crash giữa chừng để lại trạng thái nửa vời.
- Ba cách chưa đủ: cấp DB trực tiếp (coupling/quá tải), 2PC (chậm/blocking), đẩy thẳng Kafka (vẫn dual-write).
- **Transactional Outbox**: ghi `business` + `outbox` trong **một transaction** (cùng DB → nguyên tử); polling/CDC đọc outbox phát Kafka, **chỉ xóa record sau ACK** → retry an toàn, không mất event.
- Lợi ích: decoupling, **reliability** (chính), scalability, performance.
- Khác Materialized View: Outbox lo **phát event tin cậy**, MV lo **đọc nhanh**.

**Bài kế tiếp** → [Phase 5 — Bài 1: Bài toán Saga giải quyết](../phase-5/01-saga-pattern-introduction.md)
