# Bài 1: API Design - Giới thiệu

## API là gì?

Sau khi capture xong functional requirements, hệ thống có thể được coi là một **black box** với interface rõ ràng. Interface này được gọi là **Application Programming Interface (API)**.

> **API** = Hợp đồng (contract) định nghĩa cách các ứng dụng khác sử dụng hệ thống của ta — mà không cần biết internal design hay implementation.

## Ba loại API

| Loại | Đặc điểm |
|------|-----------|
| **Public API** | Mở cho bất kỳ developer nào, yêu cầu đăng ký |
| **Private/Internal API** | Chỉ dùng nội bộ trong công ty |
| **Partner API** | Dành cho companies/users có business relationship |

## Lợi ích của API rõ ràng

1. **Client tích hợp ngay** — không cần đợi implementation xong
2. **Dễ design internal system** — API định nghĩa các entry points
3. **Decoupling** — thay đổi internal mà không break contract với clients

## Best Practices & Patterns cho API tốt

### 1. Encapsulation hoàn toàn

Client **không cần biết** internal design hay business logic.

```
❌ Client biết: "Table users join orders WHERE..."
✅ Client biết: POST /orders → 201 Created
```

API phải **decoupled hoàn toàn** khỏi internal implementation.

### 2. Dễ dùng, dễ hiểu, không thể misuse

- Một cách duy nhất để làm mỗi việc
- Tên descriptive cho actions và resources
- Expose chỉ những gì client cần
- Consistent xuyên suốt toàn bộ API

### 3. Idempotency

> **Idempotent operation** = Thực hiện nhiều lần cho kết quả giống như một lần.

```
✅ Idempotent: PUT /users/1 {address: "123 Main St"}
   → Gọi 1 lần hay 10 lần: address vẫn là "123 Main St"

❌ Not idempotent: POST /accounts/1/balance {amount: +100}
   → Gọi 10 lần: balance tăng 10 lần!
```

**Tại sao cần idempotent?**
- Network request có thể bị lost (response lost, request lost, server crash)
- Client không biết phải retry hay không
- Nếu idempotent: retry an toàn → không sợ side effects

### 4. Pagination

Khi response chứa dataset lớn, PHẢI có pagination:

```
GET /emails?offset=0&limit=20    → Trang 1
GET /emails?offset=20&limit=20   → Trang 2
GET /emails?offset=40&limit=20   → Trang 3
```

Không có pagination → browser/app crash với hàng nghìn records.

### 5. Asynchronous API

Với operations lâu (report generation, video encoding, big data analysis):

```
POST /reports/generate
→ 202 Accepted
→ Response: {"job_id": "abc123", "status_url": "/jobs/abc123"}

GET /jobs/abc123
→ {"status": "processing", "progress": 45}

GET /jobs/abc123 (sau vài phút)
→ {"status": "completed", "result_url": "/reports/2024-01-01"}
```

Client không bị block — tiếp tục làm việc khác trong khi chờ.

### 6. Versioning

```
/api/v1/users    ← Old clients dùng version này
/api/v2/users    ← New clients với breaking changes
```

Cho phép maintain 2 versions song song và deprecate dần version cũ.

## Tóm tắt

```
API Design Best Practices:
① Encapsulation: Ẩn internal implementation
② Simplicity: Dễ dùng, consistent, không thể misuse
③ Idempotency: Safe to retry
④ Pagination: Handle large datasets
⑤ Async API: Non-blocking long operations
⑥ Versioning: Support breaking changes gracefully
```

---
**Tiếp theo:** Bài 2 - RPC →
