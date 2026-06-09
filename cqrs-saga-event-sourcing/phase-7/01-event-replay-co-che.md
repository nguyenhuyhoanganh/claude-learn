# Bài 1: Cơ chế replay — vì sao Event Sourcing có vấn đề hiệu năng

Event Sourcing + CQRS là combo mạnh, nhưng có một cái bẫy hiệu năng ẩn ở write side. Mỗi lần lưu một event mới, aggregate phải **phát lại (replay) toàn bộ event cũ** để dựng lại trạng thái hiện tại. Với một tài khoản 10 năm tuổi có 100.000 giao dịch, đó là 100.000 event replay cho **mỗi** lần ghi mới. Bài này giải thích cơ chế đó và khi nào nó thành thảm họa — chuẩn bị cho lời giải Snapshot.

## Điều gì xảy ra khi lưu một event mới?

Nhớ lại (Phase 2): Event Store chỉ lưu event, current state được **tính lại** bằng replay. Vậy khi ghi event thứ N+1:

```text
   Lưu event mới → Aggregate phải:
   1. LOAD toàn bộ event cũ (1..N) của aggregate đó
   2. REPLAY (chạy lại @EventSourcingHandler) từng cái để dựng current state
   3. (áp business logic, vd tính số dư)
   4. RỒI mới lưu event N+1
```

```text
   Ghi event mới cho account "abc":
   seq 0  AccountCreated   ┐
   seq 1  MoneyCredited    │ Aggregate LOAD + REPLAY tất cả
   seq 2  MoneyDebited     │ để biết current state TRƯỚC khi
   ...                     │ ghi event mới
   seq N  MoneyCredited    ┘
   ─────────────────────────
   seq N+1  (event mới)  ← chỉ lưu được SAU khi replay xong 0..N
```

## Vì sao aggregate phải replay tất cả?

Đây không phải lãng phí vô cớ — có ba lý do chính:

| Lý do | Giải thích |
|---|---|
| **Ensure consistency** | Dựng lại đúng current state từ nguồn sự thật (event), không tin một bản cache có thể bị tamper |
| **Complex calculations** | Vd "số dư hiện tại" phải cộng/trừ qua *mọi* giao dịch để chính xác |
| **Full audit log** | Mỗi state đều truy được về chuỗi event → debug, audit, ra quyết định đúng dù logic thay đổi theo thời gian |

> Đây vừa là **sức mạnh** (replay = consistency + audit + time-travel, Phase 2) vừa là **gánh nặng** (replay tốn thời gian khi event nhiều). Snapshot sẽ giữ sức mạnh mà giảm gánh nặng.

## Khi nào replay KHÔNG thành vấn đề

Số event mỗi aggregate **nhỏ và có giới hạn** → replay rẻ. Ví dụ đơn hàng e-commerce:

```text
   Order events (tối đa ~4-5):
   OrderPlaced → OrderConfirmed → OrderShipped → OrderDelivered
                 (hoặc OrderCancelled thay Confirmed)
```

Một order chỉ có ~4 event suốt vòng đời. Replay 4 event mỗi lần ghi → không đáng kể. **Không cần** snapshot.

## Khi nào replay thành thảm họa

Số event mỗi aggregate **tăng vô hạn theo thời gian**. Ví dụ tài khoản ngân hàng:

```text
   Một người dùng 10 năm, giao dịch nhiều:
   → 1.000? 10.000? 100.000 event?

   Mỗi giao dịch MỚI để tính currentBalance:
   → REPLAY cả 100.000 event cũ + áp logic tính số dư
   → CHẬM. Càng dùng lâu càng chậm.
```

Đây là kịch bản kinh điển sinh **performance problem**: aggregate có lịch sử dài, mỗi ghi mới phải replay toàn bộ. Lời giải là **Snapshot** (bài sau).

| | Order (e-commerce) | Account (bank) |
|---|---|---|
| Số event/aggregate | ~4-5, có giới hạn | Tăng vô hạn (100K+ sau 10 năm) |
| Chi phí replay mỗi ghi | Không đáng kể | Rất lớn, tăng dần |
| Cần snapshot? | Không | **Có** |

## Chứng minh bằng debug — replay thật sự xảy ra

Có thể quan sát replay tận mắt: đặt breakpoint trong `@EventSourcingHandler` của `CustomerCreatedEvent` và `CustomerUpdatedEvent`, rồi trigger một update.

> **Mẹo IntelliJ — "Evaluate and log"**: chuột phải breakpoint → More → tick "Evaluate and log", nhập tên object (vd `customerUpdatedEvent`) để **in object ra console** mỗi khi dừng — đỡ phải thêm `log`/`System.out` thủ công.

Giả sử customer đã có 2 event (created seq 0, updated seq 1). Khi ta gửi update **thứ 3** (event mới):

```text
   Breakpoint dừng 3 LẦN cho MỘT lần ghi:
   lần 1: CustomerCreatedEvent  (seq 0)  ← replay
   lần 2: CustomerUpdatedEvent  (seq 1)  ← replay (email vẫn giá trị CŨ)
   lần 3: CustomerUpdatedEvent  (seq 2)  ← event MỚI đang lưu (email mới)
```

Aggregate dựng lại state bằng cách chạy event 0, rồi 1 (state trung gian, email còn cũ), rồi mới tới event mới. Nếu trước đó có 4 event, breakpoint dừng **4 lần** cho một lần ghi. Đó chính là replay — và là gốc của vấn đề hiệu năng khi event nhiều.

## Tóm tắt bài 1

- Mỗi lần lưu event mới, aggregate **load + replay toàn bộ event cũ** để dựng current state trước khi ghi.
- Replay là cần thiết: **consistency, complex calculations, full audit** — vừa là sức mạnh vừa là gánh nặng.
- Event ít/có giới hạn (order e-commerce ~4) → replay rẻ, không cần snapshot.
- Event tăng vô hạn (account 100K sau 10 năm) → replay **chậm dần** → performance problem.
- Quan sát replay bằng breakpoint trong `@EventSourcingHandler` (dừng N lần cho một lần ghi); "Evaluate and log" của IntelliJ giúp in object.
- Lời giải: **Snapshot** (bài sau).

**Bài kế tiếp** → [Bài 2: Snapshot — lý thuyết](02-snapshots-theory.md)
