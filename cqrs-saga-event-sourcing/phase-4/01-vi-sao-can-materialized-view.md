# Bài 1: Vì sao cần Materialized View Pattern

Phase 1 đã giải cross-service queries bằng API Composition (Gateway Aggregator). Nó chạy được — nhưng có cái giá. Khi dashboard ngân hàng cần gom data từ 4 service và mỗi service mất 200ms, người dùng có thể phải chờ **cả giây** cho mỗi lần load. Bài này phân tích vì sao API Composition không đủ cho hệ tải lớn, mở đường cho một cách tốt hơn: **Materialized View**.

## Nhắc lại: API Composition làm gì

```text
Client ──► Spring Cloud Gateway (API Composer)
                │
                ├──► Customer Service ──► Customer DB
                ├──► Accounts Service ──► Account DB
                ├──► Loans Service    ──► Loans DB
                └──► Cards Service    ──► Cards DB
                │
                ▼ gom data → trả về client
```

Từ phía client là **một** lời gọi. Nhưng *bên trong*, gateway gọi **bốn** service ở **thời điểm chạy (runtime)**. Đó là gốc của vấn đề.

## Ba nhược điểm khiến API Composition không đủ

### 1. Hiệu năng — latency cộng dồn

Giả sử mỗi service mất 200ms để xử lý và trả data. Gọi **tuần tự**:

```text
Customer 200ms → Accounts 200ms → Loans 200ms → Cards 200ms = 800ms
+ aggregation tại gateway                                   = 200ms
                                                  TỔNG       = 1.000ms (1 giây!)
```

Càng nhiều service → người dùng chờ càng lâu. Gọi **song song** (reactive) đỡ hơn, nhưng vẫn còn **network latency** cộng vào tổng thời gian. Và mỗi lần đọc dashboard lại lặp lại toàn bộ chi phí này.

### 2. Logic transform phức tạp tại gateway

Service lưu data theo logic nghiệp vụ của nó. Nếu client cần **định dạng khác**, gateway phải gánh logic transform/format — code phức tạp, tốn thời gian chạy, khó bảo trì.

### 3. Phụ thuộc tính sẵn sàng của service

Mỗi lần đọc, gateway phụ thuộc **cả bốn** service đang sống. Một service down/chậm → client nhận data null/rỗng cho phần đó. Read path **gắn chặt** vào write path.

## Cốt lõi vấn đề: trộn đọc và ghi cùng một nguồn

```text
              ┌─────────── Microservice ───────────┐
   ghi  ────► │  bận xử lý WRITE...                 │
   đọc  ────► │  ...lại còn phải phục vụ READ runtime│
              └────────────────────────────────────┘
                   → service luôn bận, latency cao
```

Service vốn đã bận với write. Bắt nó phục vụ thêm read runtime cho dashboard → càng quá tải. Với ngân hàng có **hàng triệu** khách cùng đăng nhập xem dashboard, đây là thảm họa hiệu năng.

## Khi nào API Composition vẫn ổn, khi nào không

| API Composition ổn | Cần cách tốt hơn (Materialized View) |
|---|---|
| App nhỏ, ít microservice | Nhiều service cần gom |
| Traffic thấp | Traffic rất cao (triệu user) |
| Vài kịch bản cross-service query | Dashboard đọc liên tục, nặng |
| Chấp nhận latency cộng dồn | Cần đọc trong vài ms, ổn định |

> **Cách tốt hơn = Materialized View Pattern**: thay vì gom data ở *runtime mỗi lần đọc*, ta **dựng sẵn** một bản sao gom-sẵn (pre-computed) và đọc thẳng từ đó. Bài sau đào sâu.

## Tóm tắt bài 1

- API Composition gọi N service ở **runtime mỗi lần đọc** → ba nhược điểm: **latency cộng dồn** (4×200ms + gom = ~1s), **logic transform phức tạp** ở gateway, **phụ thuộc availability** của mọi service.
- Gốc vấn đề: trộn read và write cùng nguồn → service luôn bận, read path gắn chặt write path.
- Ổn cho app nhỏ/traffic thấp; **không** đủ cho hệ tải lớn (dashboard ngân hàng triệu user).
- Lời giải: **Materialized View** — dựng sẵn bản gom, đọc thẳng.

**Bài kế tiếp** → [Bài 2: Materialized View Pattern — lý thuyết và thiết kế](02-materialized-view-pattern.md)
