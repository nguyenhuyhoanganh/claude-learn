# Bài 2: Event Sourcing — lưu lịch sử thay vì trạng thái

Mở app ngân hàng, bạn thấy gì? Không phải một con số "số dư = 2.150$" trơ trọi, mà **một danh sách giao dịch**: +2.000$, −120$, +500$... và số dư hiện tại được tính ra từ chuỗi đó. Đây chính là tinh thần của **Event Sourcing**: đừng lưu *kết quả cuối*, hãy lưu *toàn bộ các thay đổi đã dẫn tới kết quả đó*. Bài này giải thích kỹ lý thuyết — vì hiểu chắc ở đây thì Phase 3 (code) sẽ nhẹ nhàng.

## Hai cách lưu dữ liệu — bước ngoặt tư duy

Cách CRUD truyền thống chỉ lưu **trạng thái hiện tại (current state)**: mỗi lần đổi là **ghi đè** giá trị cũ. Lịch sử biến mất.

```text
CRUD truyền thống — chỉ thấy hiện tại:
┌────┬──────────────┬───────────┐
│ id │ name         │ balance   │
├────┼──────────────┼───────────┤
│ 1  │ Nguyen Van A │  2,150    │   ← đổi balance = ghi đè, không biết trước đó là bao nhiêu
└────┴──────────────┴───────────┘
```

Event Sourcing lưu **mọi thay đổi như một event**, **nối tiếp (append)** vào một kho gọi là **event store**. Trạng thái hiện tại không được lưu trực tiếp — nó được **tính lại** bằng cách "chạy lại" toàn bộ event theo thứ tự.

```text
Event Sourcing — lưu toàn bộ lịch sử:
┌────┬──────────────────┬──────────────────┬──────────────────────┐
│ #  │ event_type       │ payload          │ timestamp            │
├────┼──────────────────┼──────────────────┼──────────────────────┤
│ 1  │ AccountCreated   │ {balance: 0}     │ 2024-01-01 10:00:00  │
│ 2  │ MoneyCredited    │ {amount: 2000}   │ 2024-01-05 09:15:00  │
│ 3  │ MoneyDebited     │ {amount: 120}    │ 2024-01-10 14:30:00  │
│ 4  │ MoneyCredited    │ {amount: 500}    │ 2024-01-15 11:00:00  │
│ 5  │ MoneyDebited     │ {amount: 80}     │ 2024-01-20 16:45:00  │
│ 6  │ MoneyCredited    │ {amount: 450}    │ 2024-01-25 08:20:00  │
└────┴──────────────────┴──────────────────┴──────────────────────┘

Số dư hiện tại = 0 + 2000 − 120 + 500 − 80 + 450 = 2,750
                 └──────────── "phát lại" (replay) toàn bộ event ───────┘
```

Khác biệt nằm ở chỗ: với CRUD bạn **mất** thông tin "đã từng có gì"; với Event Sourcing, **mỗi sự thật đều được giữ vĩnh viễn** và trạng thái chỉ là *kết quả phái sinh*.

## Năm khái niệm cốt lõi (đọc kỹ phần này)

Đây là từ vựng nền tảng. Phase 3 sẽ ánh xạ trực tiếp 5 khái niệm này vào 5 nhóm class trong Axon.

### 1. Command — ý định (intent)

> **Command** = một *ý định* muốn hệ thống làm gì đó. Nó là **lời yêu cầu**, chưa phải sự thật. Command **có thể bị từ chối** (vd validation thất bại, không đủ tiền).

Quy ước đặt tên: **thì hiện tại / mệnh lệnh** — vì nó là việc "hãy làm".

```text
DebitMoneyCommand     { accountId, amount }     ← "hãy trừ tiền"
CreditMoneyCommand    { accountId, amount }     ← "hãy cộng tiền"
CreateCustomerCommand { name, email }
```

### 2. Event — sự thật đã xảy ra (fact)

> **Event** = một *thay đổi trạng thái đã xảy ra*. Nó là **bản ghi bất biến (immutable)** của điều đã diễn ra trong quá khứ; không bao giờ sửa, không bao giờ xóa.

Quy ước đặt tên: **thì quá khứ** — vì khi event tồn tại, việc đã hoàn tất rồi.

```text
MoneyDebited   { accountId, amount, timestamp }   ← "tiền ĐÃ bị trừ"
MoneyCredited  { accountId, amount, timestamp }
CustomerCreated{ customerId, name, email, timestamp }
```

**Quy tắc vàng cần nhớ — "một command luôn dẫn tới một event"**:

```text
Command (hiện tại: "DebitMoney")  ──xử lý & validate──►  Event (quá khứ: "MoneyDebited")
                                  └── nếu validate fail ──►  Exception (không sinh event)
```

So sánh thì của tên gọi không phải để cho đẹp — nó phản ánh đúng vòng đời: *yêu cầu (hiện tại)* → *được chấp nhận* → *trở thành sự thật bất biến (quá khứ)*.

| | Command | Event |
|---|---|---|
| Bản chất | Ý định, lời yêu cầu | Sự thật đã xảy ra |
| Có thể từ chối? | **Có** (validation) | **Không** — đã xảy ra rồi |
| Thì đặt tên | Hiện tại (`DebitMoney`) | Quá khứ (`MoneyDebited`) |
| Tính bất biến | Không quan trọng | **Immutable**, append-only |

### 3. Event Store — kho sự kiện

> **Event Store** = database chuyên dụng chỉ để **append (nối thêm)** event. Không update, không delete.

Bốn tính chất:
- **Append-only**: chỉ thêm vào cuối, không sửa/xóa cái cũ.
- **Ordered**: event có thứ tự (số thứ tự / sequence) — thứ tự là tất cả, vì replay sai thứ tự = state sai.
- **Immutable**: đã ghi là cố định mãi mãi.
- **Replayable**: phát lại toàn bộ event bất kỳ lúc nào để dựng lại trạng thái.

### 4. Aggregate — bộ não của write side

> **Aggregate** = đối tượng *gói gọn state và hành vi (business logic)* của một thực thể. Trong ví dụ ngân hàng, một `Transaction`/`Account` aggregate chịu trách nhiệm xử lý các event như money debited / credited.

Aggregate làm **hai chiều việc** — đây là điểm hay nhầm:

```text
        Command
           │  (1) NHẬN command, validate business rule
           ▼
   ┌──────────────────┐
   │    Aggregate     │  (2) Nếu hợp lệ → SINH RA (produce) event
   │  state + logic   │      → event được ghi vào Event Store
   └────────┬─────────┘
            │  (3) PHÁT (publish) event ra ngoài
            ▼
   read side / query side nghe để cập nhật current state
```

1. **Xử lý** command đến: kiểm tra rule (vd "đủ tiền không?").
2. **Sinh** event và ghi vào Event Store (nếu hợp lệ).
3. **Phát** event ra ngoài để read side cập nhật.

> **Ghi nhớ**: **Aggregate = command side / write side của CQRS.** Nó vừa *xử lý* event để đổi state nội bộ, vừa *phát* event cho read side.

### 5. Projection — read side

> **Projection** = một *view chỉ-đọc (read-only)* được dựng từ chuỗi event. Nó lắng nghe event và cập nhật **Read Database** để phục vụ truy vấn.

Vì sao cần projection? Vì có lúc ta **không** muốn đọc cả lịch sử event — ta chỉ muốn "số dư hiện tại = 2.750$". Projection xử lý sẵn, lưu giá trị hiện tại, để UI đọc một phát là xong, khỏi replay.

> **Ghi nhớ**: **Projection = query side / read side của CQRS.** Aggregate ghi event vào store; projection cập nhật current state vào read DB.

### Ghép 5 khái niệm — bản đồ tổng

```text
              WRITE SIDE (Event Sourcing)              READ SIDE
   Command ──►┌───────────────┐   event   ┌────────────────────────┐
              │   Aggregate   ├──────────►│      Projection        │
              │ validate +    │           │  cập nhật current state │
              │ produce event │           └───────────┬────────────┘
              └──────┬────────┘                       ▼
                     ▼                          Read Database
              Event Store                      (vd: balance = 2,750)
              (toàn bộ lịch sử,                (đọc nhanh, không replay)
               append-only)
```

## Vì sao kết hợp Event Sourcing với CQRS? — "lấy cái hay của cả hai"

Nếu **không** ghép hai pattern, bạn buộc phải chọn **một** trong hai điều — và mất điều kia:

| Bạn chỉ lưu... | Được gì | Mất gì |
|---|---|---|
| Chỉ current state (CRUD) | Đọc nhanh số dư hiện tại | Mất sạch lịch sử; không biết quá khứ |
| Chỉ history of events | Có đủ lịch sử/audit | Muốn biết số dư phải replay mỗi lần → chậm |

Ghép **Event Sourcing (write side)** + **CQRS (read side)** cho bạn **cả hai**:
- **Write side** giữ toàn bộ event → audit trail đầy đủ.
- **Read side** giữ current state dựng sẵn → đọc tức thì, khỏi replay.

> Dùng Event Sourcing cùng CQRS **không bắt buộc**. Nếu không dùng Event Sourcing, write side chỉ giữ một bản ghi current state (ghi đè như CRUD). Nhưng **phần lớn** tổ chức ghép cả hai, vì audit trail + replay quá giá trị.

## Bốn lợi ích lớn — giải thích kỹ

### 1. Auditability (truy vết / kiểm toán)

Mỗi thay đổi là một event bất biến → có **dấu vết đầy đủ**, không ai "xóa lịch sử" được.

```text
Khách hỏi: "Vì sao hôm qua số dư tôi giảm 500$?"
→ tra event store: MoneyDebited { amount: 500, merchant: "Amazon", at: 15:30 }
```

Cực kỳ quan trọng cho ngân hàng, y tế, pháp lý — nơi luật yêu cầu lưu vết mọi thay đổi.

### 2. Replayability (phát lại — "cỗ máy thời gian")

Đây là siêu năng lực. Nếu read side bị bug làm current state sai, bạn **sửa logic rồi replay toàn bộ event từ đầu** để dựng lại state đúng — **không mất data**.

```text
Production bug: projection tính sai balance
  1. sửa lại logic projection
  2. replay Event 1 → 2 → ... → N với logic mới
  3. read DB được rebuild đúng
```

Event Sourcing cho developer một "cỗ máy thời gian": du hành về quá khứ, chạy lại nghiệp vụ trên mọi event đã xảy ra. CRUD không có khả năng này — ghi đè là mất.

### 3. Scalability (khả năng scale)

Vì write và read tách rời (nhờ CQRS), hai bên scale độc lập theo nhu cầu.

### 4. Flexibility (linh hoạt — tạo report/projection mới từ quá khứ)

Lợi ích "tủ" của Event Sourcing: **tạo projection mới bất kỳ lúc nào** từ event đã có, **không đụng** core data model.

```text
Hôm nay:        projection "current_balance"
6 tháng sau:    team product cần "chi tiêu theo danh mục 90 ngày qua"
                → tạo projection MỚI, replay event cũ → xong
                → không sửa Event Store, không mất gì
```

Vì *mọi* event đều được lưu, sau này bạn có thể chạy analytics bất kỳ: "ngày nào nhiều giao dịch nhất?", phát hiện gian lận, phân tích hành vi người dùng — những thứ bạn **không hỏi được** nếu chỉ lưu current state.

## Mặt trái và thách thức

| Thách thức | Giải thích | Cách giảm nhẹ |
|---|---|---|
| **Replay chậm khi nhiều event** | Dựng current state phải chạy lại toàn bộ event | **Snapshot** (Phase 7): lưu state tại một mốc, chỉ replay từ đó |
| **Tiến hóa schema event (schema evolution)** | Event cũ vẫn phải đọc được khi format mới ra đời | Versioning event (`MoneyDebitedV1` → `V2`) cẩn thận |
| **Learning curve** | Tư duy ngược hẳn CRUD | Dùng framework (Axon) để bớt code tay |

```text
EventV1: { amount: 100 }
EventV2: { amount: 100, currency: "USD" }   ← thêm field, vẫn phải đọc được V1 cũ
```

## Use case thực tế: lịch sử đơn hàng e-commerce

Event Sourcing tỏa sáng khi nghiệp vụ *vốn dĩ* là một chuỗi sự kiện:

```text
Command: PlaceOrder { items, userId }
   → Aggregate validate (đủ hàng? user hợp lệ?)
   → sinh chuỗi event theo thời gian:
        OrderPlaced     { orderId, items, userId }
        PaymentProcessed{ orderId, amount }
        OrderShipped    { orderId, trackingNumber }
        OrderDelivered  { orderId, deliveredAt }

   → các projection khác nhau cho các màn hình khác nhau:
        order_status_view   : { orderId, status: "DELIVERED" }
        user_order_history  : [ {orderId, date, amount}, ... ]
        shipping_dashboard  : { trackingNumber, location }
```

Màn hình "theo dõi đơn hàng" hiển thị đúng chuỗi event này cho người dùng — điều gần như miễn phí với Event Sourcing, nhưng phải tự dựng bảng audit thủ công nếu dùng CRUD.

## CRUD vs Event Sourcing — bảng quyết định

| Khía cạnh | CRUD truyền thống | Event Sourcing |
|---|---|---|
| Lưu cái gì | Current state | Toàn bộ event |
| Lịch sử | Không có (ghi đè) | Đầy đủ, bất biến |
| Dung lượng | Ít hơn | Nhiều hơn |
| Đọc current state | Trực tiếp | Replay (hoặc qua projection) |
| Audit trail | Khó / không có | Có sẵn |
| Replay / time travel | Không | Có |
| Độ phức tạp | Thấp | Cao |

> **Khi nào nên dùng Event Sourcing?** Cần audit trail (bank, healthcare, legal); cần lịch sử thay đổi (order history); cần debug bằng time-travel; cần analytics từ data quá khứ; hệ phức tạp, high-traffic. Ngược lại, app CRUD đơn giản thì Event Sourcing là gánh nặng thừa.

## Tóm tắt bài 2

- **Event Sourcing**: lưu **mọi thay đổi như event bất biến** vào **Event Store** (append-only, ordered, replayable); current state được **tính lại** bằng replay.
- Năm khái niệm: **Command** (ý định, thì hiện tại, có thể bị từ chối) → **Event** (sự thật, thì quá khứ, bất biến) → **Event Store** (kho append-only) → **Aggregate** (write side: validate + sinh + phát event) → **Projection** (read side: dựng current state).
- "Một command luôn dẫn tới một event" (hoặc một exception).
- Ghép với CQRS để có **cả** audit trail (write) **lẫn** đọc nhanh (read).
- Bốn lợi ích: auditability, replayability (cỗ máy thời gian), scalability, flexibility (projection/report mới từ event cũ).
- Mặt trái: replay chậm (→ snapshot), schema evolution, learning curve.

**Bài kế tiếp** → [Phase 3 — Bài 1: Giới thiệu Axon Framework](../phase-3/01-gioi-thieu-axon-framework.md)
