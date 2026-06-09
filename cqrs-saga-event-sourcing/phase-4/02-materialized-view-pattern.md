# Bài 2: Materialized View Pattern — lý thuyết và thiết kế

Thay vì gom data ở runtime mỗi lần đọc (bài 1), Materialized View **dựng sẵn** một bảng gom-sẵn, cập nhật nó bằng event mỗi khi nguồn đổi, và để client đọc thẳng. Bài này giải thích pattern, ba khái niệm cốt lõi, và thiết kế cụ thể `profile` table ta sẽ xây ở bài sau.

## Định nghĩa

> **Materialized View Pattern** = tối ưu **đọc** bằng cách duy trì một **bản sao denormalized, pre-computed** của dữ liệu (gom từ nhiều microservice) trong một bảng riêng, để mọi truy vấn chỉ cần đọc **một** bảng đó.

Khác biệt then chốt với API Composition: API Composition gom **lúc đọc**; Materialized View gom **sẵn từ trước** (mỗi khi nguồn đổi), nên lúc đọc chỉ là một query đơn.

## Kịch bản: dashboard ngân hàng

```text
Người dùng đăng nhập → Dashboard cần: profile, account balance, card, loan, transactions
   Data nằm rải ở 4 microservice (customer, accounts, cards, loans)

   Cách CŨ: API Composition gọi 4 service runtime  → chậm, phụ thuộc

   Cách MỚI: một microservice riêng "CustomerBankViewService"
             nghe event từ 4 service, dựng sẵn 1 bảng view
             → dashboard chỉ gọi 1 API, đọc 1 bảng
```

```text
   customer ─┐
   accounts ─┤  publish DATA-CHANGED event
   cards   ──┤────────────►  CustomerBankViewService
   loans   ──┘                 │ @EventHandler cập nhật
                               ▼
                        Materialized View (1 bảng gom sẵn)
                               ▲
        Dashboard ──1 API──────┘  (đọc thẳng, vài ms, KHÔNG gọi 4 service)
```

## Ba khái niệm cốt lõi

| Khái niệm | Ý nghĩa |
|---|---|
| **Denormalized View** (view phi-chuẩn-hóa) | Bảng materialized view lưu data ở dạng **tối ưu đọc** (gom sẵn, phẳng), không chuẩn hóa (chuẩn hóa tối ưu *lưu trữ*, không tối ưu *đọc*). Chứa data từ nhiều service |
| **Event-Driven Updates** (cập nhật theo event) | Mỗi service nguồn, khi data đổi (sửa profile, thêm giao dịch...), **publish event**; service giữ view **nghe** và cập nhật |
| **Optimized for Reads** (tối ưu đọc) | Vì kết quả đã pre-computed, đọc cực nhanh; không truy vấn từng service runtime |

## Lợi ích chính

- **Đọc nhanh, một lời gọi**: client gọi một API, đọc một bảng → vài ms.
- **Không phụ thuộc service nguồn lúc đọc**: service nguồn down/chậm → read **zero impact** (data đã nằm sẵn trong view).
- **Giảm tải service nguồn**: chúng không bị "quấy" bởi read runtime, chỉ lo write + phát event.

## Mặt trái — không phải viên đạn bạc

| Nhược điểm | Giải thích |
|---|---|
| **Eventual consistency** | View đồng bộ **không tức thì** — trễ vài ms/giây để xử lý event và cập nhật |
| **Thêm service + DB + handler logic** | Phải nuôi một microservice riêng + bảng view + code xử lý event → thêm phức tạp/chi phí |

> Không có pattern nào là silver bullet. Cân nhắc theo traffic, lượng data, yêu cầu real-time. **Luôn brainstorm** trước khi chọn. API Composition cho app nhỏ; Materialized View cho tải lớn.

## Thiết kế cụ thể: bảng `profile`

Ta sẽ xây microservice `profile` giữ materialized view. Bốn bảng nguồn đều có **cột chung `mobileNumber`**:

```text
customer:  customerId, mobileNumber, name, email, activeSw, audit...
account:   mobileNumber, accountNumber, accountType, branchAddress, activeSw, audit...
card:      mobileNumber, cardNumber, cardType, totalLimit, amountUsed, ..., audit...
loan:      mobileNumber, loanNumber, loanType, totalLoan, amountPaid, ..., audit...
                 │ cột chung
                 ▼
profile (materialized view):
   profileId (PK, auto)  ◄── khóa chính tự sinh
   mobileNumber          ◄── cột chung, dùng để định danh record
   name                  ◄── từ customer
   accountNumber         ◄── từ account   (nullable / mặc định 0)
   cardNumber            ◄── từ card       (nullable / mặc định 0)
   loanNumber            ◄── từ loan       (nullable / mặc định 0)
   activeSw, audit...
```

### Vòng đời một record profile

```text
1. Customer tạo  → customer service phát CustomerDataChangedEvent
                   → profile INSERT record mới (mobileNumber + name; account/card/loan = 0/null)
2. Customer tạo account → account service phát AccountDataChangedEvent
                   → profile UPDATE accountNumber theo mobileNumber
3. Tương tự cho card, loan
4. Xóa account   → profile set accountNumber = 0
```

> **Vì sao account/card/loan nullable?** Khách mới chỉ chắc chắn có customer; account/card/loan là **tùy chọn** (có người chỉ có account, có người có cả ba). Nên khi insert lần đầu, các cột này để null/0; cập nhật dần khi khách tạo thêm. Khi xóa → đưa về 0.

Bảng giữ đơn giản để dễ học; thực tế view có thể hàng trăm cột hoặc nhiều bảng, tùy nghiệp vụ.

## Materialized View vs API Composition

| Tiêu chí | API Composition | Materialized View |
|---|---|---|
| Gom data khi nào | Runtime, mỗi lần đọc | Pre-computed, mỗi khi nguồn đổi |
| Số lời gọi lúc đọc | N service | 1 (đọc 1 bảng) |
| Phụ thuộc service nguồn lúc đọc | Có | Không |
| Tải lên service nguồn | Cao (read runtime) | Thấp (chỉ phát event) |
| Hạ tầng thêm | Không | Service + DB view + handler |
| Hợp với | App nhỏ, traffic thấp | Tải lớn, dashboard nặng |

## Tóm tắt bài 2

- **Materialized View**: dựng sẵn bản **denormalized, pre-computed** gom từ nhiều service; đọc thẳng một bảng.
- Ba khái niệm: denormalized view, event-driven updates, optimized for reads.
- Lợi ích: đọc nhanh một lời gọi, không phụ thuộc service nguồn lúc đọc, giảm tải nguồn.
- Mặt trái: eventual consistency + thêm service/DB/handler.
- Thiết kế `profile` table: `mobileNumber` là cột chung định danh; `accountNumber/cardNumber/loanNumber` nullable (cập nhật dần qua event, về 0 khi xóa).

**Bài kế tiếp** → [Bài 3: Hiện thực Profile microservice và publish events](03-implement-profile-microservice.md)
