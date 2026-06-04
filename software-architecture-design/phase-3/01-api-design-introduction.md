# Bài 1: API Design — Giới thiệu

## API là gì?

Sau khi đã thu thập (capture) xong các functional requirements (yêu cầu chức năng), hệ thống có thể được nhìn như một **black box** (hộp đen) với giao diện rõ ràng cho bên ngoài. Giao diện này được gọi là **Application Programming Interface (API)** — Giao diện lập trình ứng dụng.

> **API** = Bản hợp đồng (contract) định nghĩa cách các ứng dụng khác **sử dụng hệ thống của ta** — mà không cần biết thiết kế bên trong (internal design) hay cách hiện thực (implementation).

API là điểm tiếp xúc duy nhất giữa hệ thống của bạn và thế giới bên ngoài. Mọi thứ phải đi qua API.

## 3 loại API chính

| Loại | Đặc điểm | Ví dụ |
|---|---|---|
| **Public API** | Mở cho bất kỳ developer nào, thường yêu cầu đăng ký (registration) lấy API key | Twitter API, Google Maps API |
| **Private / Internal API** | Chỉ dùng nội bộ trong công ty | Giao tiếp giữa các microservice trong công ty |
| **Partner API** | Dành cho công ty/người dùng có mối quan hệ kinh doanh (business relationship) | API thanh toán Stripe cấp cho đối tác tích hợp |

Ranh giới giữa 3 loại không cố định — 1 API có thể bắt đầu private, sau đó mở ra cho partner, rồi public dần.

## Lợi ích của API rõ ràng (well-defined)

Khi API được thiết kế rõ ràng từ đầu, ta được 3 lợi ích lớn:

1. **Client có thể tích hợp ngay** — không cần đợi backend hiện thực xong. Frontend và backend làm song song.
2. **Dễ thiết kế internal system** — API định nghĩa các entry points (cửa vào), team chỉ cần build module để thoả các entry này.
3. **Decoupling (tách rời)** — có thể thay đổi internal mà KHÔNG phá vỡ hợp đồng với clients. Refactor code thoải mái nếu input/output API giữ nguyên.

## 6 Best Practices cho API tốt

### Best practice 1: Encapsulation (đóng gói) hoàn toàn

Client **không cần biết** thiết kế bên trong hay business logic — chỉ cần biết input/output của API.

```text
❌ Sai (lộ implementation):
   Client biết: "Hệ thống join table users với orders WHERE ... GROUP BY ..."

✅ Đúng (encapsulation):
   Client chỉ biết: POST /orders với body như sau → trả về 201 Created
```

API phải **decoupled hoàn toàn** khỏi cách hiện thực. Ngày mai team backend đổi từ MySQL sang MongoDB, từ Java sang Go — client không cần biết, không cần đổi gì.

Đây là nguyên tắc gốc của mọi API design.

### Best practice 2: Dễ dùng, dễ hiểu, không thể dùng sai (misuse)

Một API tốt phải:
- Có **một cách duy nhất** để làm mỗi việc (không có 5 endpoint khác nhau làm cùng một thứ).
- Đặt tên (naming) **mô tả rõ ý** cho hành động và resource (`/users/123` chứ không phải `/u?id=123`).
- Chỉ expose những gì client thực sự cần — không expose internal field, ID kỹ thuật, debug info.
- **Nhất quán (consistent)** xuyên suốt toàn bộ API (cùng style đặt tên, cùng format date, cùng cách phân trang).

Nguyên tắc: nếu client dễ dùng sai → đó là lỗi của API designer, không phải của client.

### Best practice 3: Idempotency (tính bất biến khi gọi lặp)

> **Idempotent operation** = Operation thực hiện **nhiều lần** cho **kết quả giống hệt như thực hiện một lần**.

**Ví dụ minh hoạ:**

```text
✅ Idempotent:
   PUT /users/1 với body {address: "123 Main St"}
   → Gọi 1 lần hay 10 lần: address vẫn là "123 Main St"

❌ Không idempotent:
   POST /accounts/1/balance với body {amount: +100}
   → Gọi 10 lần: balance tăng lên 10 lần (cộng 100 mười lần)!
```

**Vì sao cần idempotent?**

- Network request có thể **mất** giữa chừng (response bị mất, request bị mất, server crash giữa lúc xử lý).
- Client **không biết** request có thành công hay không → phải quyết định retry hay không.
- Nếu API idempotent: **retry an toàn** → không sợ tác dụng phụ (side effects).

→ Idempotent là tính chất giúp **chống lỗi network**. Mọi API quan trọng nên là idempotent.

Cách làm idempotent cho operation tăng/giảm (vốn không idempotent):
- Thêm idempotency key trong header request: nếu thấy key đã xử lý → trả kết quả cũ, không xử lý lại.
- Stripe API có header `Idempotency-Key` là ví dụ kinh điển.

### Best practice 4: Pagination (phân trang)

Khi response chứa tập dữ liệu lớn (vd: danh sách hàng nghìn email), **BẮT BUỘC** phải có pagination:

```text
GET /emails?offset=0&limit=20     → Trang 1 (20 email đầu)
GET /emails?offset=20&limit=20    → Trang 2 (email 21-40)
GET /emails?offset=40&limit=20    → Trang 3 (email 41-60)
```

Hậu quả nếu không phân trang:
- Browser/app crash khi nhận hàng nghìn record.
- Network mất băng thông lớn không cần thiết.
- Server tốn memory render JSON khổng lồ.
- User chờ rất lâu mới thấy gì.

Các pattern phân trang phổ biến:
- **Offset-based**: `offset` + `limit` (đơn giản, không hiệu quả với dataset rất lớn).
- **Cursor-based**: `cursor` (con trỏ vào item cuối cùng) + `limit` (hiệu quả hơn cho big data).
- **Keyset pagination**: dùng key cuối cùng làm điểm bắt đầu trang sau.

### Best practice 5: Asynchronous API (API bất đồng bộ) cho long-running operation

Với các operation tốn thời gian (vd: tạo báo cáo, encode video, phân tích dữ liệu lớn), KHÔNG nên giữ kết nối HTTP chờ đến khi xong.

**Pattern async:**

```text
Bước 1: Client gửi yêu cầu, server nhận và bắt đầu xử lý
   POST /reports/generate
   → 202 Accepted (nhận yêu cầu rồi, đang làm)
   → Response body: {
       "job_id": "abc123",
       "status_url": "/jobs/abc123"
     }

Bước 2: Client poll (hỏi định kỳ) trạng thái
   GET /jobs/abc123
   → {"status": "processing", "progress": 45}

Bước 3: Sau vài phút, lại poll
   GET /jobs/abc123
   → {"status": "completed", "result_url": "/reports/2024-01-01"}

Bước 4: Client download kết quả khi xong
   GET /reports/2024-01-01
```

**Lợi ích:**
- Client **không bị block** — có thể làm việc khác trong khi chờ.
- Server không phải giữ connection mở quá lâu (tránh timeout, tránh tốn resource).
- User experience tốt hơn — không phải nhìn spinner xoay 5 phút.

Pattern thay thế poll: **WebHook** (server gọi ngược lại client khi xong) hoặc **Server-Sent Events / WebSocket** (push real-time).

### Best practice 6: Versioning (phân phiên bản)

Khi API có **breaking changes** (thay đổi gây vỡ tương thích), không thể bắt mọi client cập nhật ngay lập tức. Giải pháp: maintain nhiều version song song.

```text
/api/v1/users    ← Client cũ vẫn dùng được version này
/api/v2/users    ← Client mới dùng version mới với breaking changes
```

→ Cho phép duy trì 2 (hoặc nhiều) phiên bản song song, deprecate (xoá dần) phiên bản cũ theo lịch trình thông báo trước.

Cách versioning phổ biến:
- **URL versioning**: `/v1/`, `/v2/` (đơn giản nhất, dễ nhìn).
- **Header versioning**: `Accept: application/vnd.api+json;version=2`.
- **Query param**: `?version=2`.

URL versioning được dùng nhiều nhất vì rõ ràng và dễ debug.

## Tóm tắt bài 1

```text
API Design Best Practices (6 nguyên tắc):

① Encapsulation     — Ẩn implementation, lộ chỉ contract
② Simplicity        — Dễ dùng, consistent, không thể dùng sai
③ Idempotency       — An toàn khi retry, chống lỗi network
④ Pagination        — Xử lý dataset lớn không crash client
⑤ Async API         — Long operation không block client
⑥ Versioning        — Hỗ trợ breaking change một cách lịch sự
```

Các nguyên tắc này áp dụng cho mọi style API (REST, gRPC, GraphQL). Bài tiếp theo sẽ đi vào style cụ thể đầu tiên: RPC.

---
**Bài kế tiếp**: [Bài 2 - RPC (Remote Procedure Call)](02-rpc.md) →
