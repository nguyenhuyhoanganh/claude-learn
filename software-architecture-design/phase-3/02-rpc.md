# Bài 2: RPC — Remote Procedure Call (Gọi thủ tục từ xa)

## RPC là gì?

> **RPC** = Khả năng cho phép một ứng dụng client **thực thi một function trên remote server** (máy chủ ở xa) — sao cho code **trông và cảm giác như đang gọi method local thông thường**.

**Local Transparency** (tính trong suốt cục bộ): Đối với developer, một remote method call trông không khác gì local method call.

Ví dụ:
```java
User user = userService.getUser(userId);   // Trông như local method
// Thực tế: gọi method ở server cách 1000 km, qua mạng, 500ms!
```

→ Tư tưởng: che giấu hoàn toàn sự phức tạp của network để developer tập trung vào logic.

## Cách RPC hoạt động

RPC dựa trên 3 thành phần chính: IDL → Code Generation → Runtime.

### Bước 1: Interface Definition (Định nghĩa giao diện)

API và data types được định nghĩa trong một file đặc tả dùng **Interface Description Language (IDL — Ngôn ngữ mô tả giao diện)**:

```protobuf
// File .proto (chuẩn của gRPC)

service UserService {
    rpc GetUser(GetUserRequest) returns (User);
    rpc CreateUser(CreateUserRequest) returns (User);
}

message User {
    int64 id = 1;
    string name = 2;
    string email = 3;
}

message GetUserRequest {
    int64 user_id = 1;
}
```

IDL là **nguồn sự thật duy nhất (single source of truth)** cho cả client và server.

### Bước 2: Code Generation (Sinh code tự động)

Từ file IDL, một công cụ compiler tự động sinh ra code cho cả 2 phía:

```text
IDL Definition
    ↓ (compiler / code generator)
    
┌────────────────────────────────────────────┐
│  Client Stub (ở phía client)               │  ← Serialize + Send qua mạng
│  Server Stub / Skeleton (ở phía server)    │  ← Receive + Deserialize + Call impl
│  DTOs (Data Transfer Objects)              │  ← Các class generate từ message
└────────────────────────────────────────────┘
```

- **Stub** = lớp trung gian che giấu network details.
- **DTO** = class biểu diễn message khi truyền qua mạng (vd: class `User`, `GetUserRequest`).

Quy tắc đẹp: thay đổi IDL → regenerate code → cả client và server tự cập nhật.

### Bước 3: Runtime Flow (Luồng chạy thực tế)

```text
Phía Client:
   Client Code
       ↓ gọi userService.getUser(123)
   Client Stub
       ↓ serialize (đóng gói) request thành bytes
   Network (HTTP/2, TCP, ...)
       ↓
Phía Server:
   Server Stub
       ↓ deserialize (giải mã) bytes thành object
   Real Implementation
       ↓ chạy logic, query DB, trả kết quả
   Server Stub
       ↓ serialize response
   Network
       ↓
   Client Stub
       ↓ deserialize response
   Client Code nhận User object
```

**Toàn bộ chi tiết network bị ẩn đi** — developer chỉ thấy method call như bình thường. Đây chính là "local transparency".

## Các RPC Framework phổ biến

| Framework | Ngôn ngữ hỗ trợ | Protocol truyền dữ liệu |
|---|---|---|
| **gRPC** (Google) | Đa ngôn ngữ (Go, Java, Python, C++, ...) | Protocol Buffers (binary, rất compact) |
| **Apache Thrift** | Đa ngôn ngữ | Binary hoặc JSON |
| **JSON-RPC** | Đa ngôn ngữ | JSON over HTTP |
| **XML-RPC** | Đa ngôn ngữ | XML over HTTP (cũ, ít dùng) |

Trong các framework, **gRPC là phổ biến nhất hiện nay** cho internal service communication. Protocol Buffers + HTTP/2 cho hiệu năng cao và streaming tốt.

## Ưu điểm của RPC

1. **Developer convenience (tiện cho lập trình viên)**: Gọi remote service như local function — code đẹp, dễ đọc.
2. **Multi-language support (đa ngôn ngữ)**: Client viết Python, server viết Java — vẫn giao tiếp được qua cùng IDL.
3. **Full network abstraction (ẩn network hoàn toàn)**: Không cần biết HTTP, sockets, port, JSON parsing.
4. **Strong typing (kiểu chặt chẽ)**: IDL define types rõ ràng → compile-time check, không lo sai field name lúc runtime.

## Nhược điểm của RPC

### Nhược điểm 1: Slowness (chậm vô hình)

Remote methods **chậm hơn rất nhiều** so với local methods (do qua mạng) — nhưng **trông giống hệt nhau** trong code:

```java
// Trông như local method (1 microsecond)...
User user = userService.getUser(userId);  // ...nhưng thực tế có thể mất 500ms!
```

→ Developer dễ quên rằng đây là remote call và **lạm dụng** (gọi nhiều lần trong loop chẳng hạn).

**Giải pháp**: Cung cấp các bản async tường minh cho operation chậm, để developer phải nhận biết "đây là remote".

### Nhược điểm 2: Unreliability (không tin cậy)

```text
Client gửi request  →  Không nhận response
                                ↑
              Server crash giữa chừng?
              Network mất gói?
              Response bị mất?
              → Client KHÔNG BIẾT chuyện gì xảy ra!
```

**Ví dụ nguy hiểm:**

```text
Bank API: debitAccount(amount: 100)  ← rút 100 từ tài khoản

Nếu request timeout (không có response trong 5 giây):
- Retry? → Có thể server đã rút rồi, retry sẽ rút 2 lần!
- Không retry? → Có thể server chưa rút, user không bị trừ!

→ Cả 2 lựa chọn đều rủi ro.
```

**Giải pháp**: Thiết kế operations **idempotent** khi có thể (xem bài 1). Với operation không thể idempotent tự nhiên (như rút tiền), dùng **idempotency key** để client gắn vào request → server biết retry hay lần đầu.

## Khi nào nên dùng RPC?

✅ **Phù hợp:**
- **Backend-to-backend communication** (giao tiếp giữa các backend service).
- **Internal service-to-service** trong kiến trúc microservices nội bộ.
- **Action-oriented API** (API tập trung vào hành động, không phải data).
- Khi muốn ẩn hoàn toàn network details khỏi developer.

❌ **Không phù hợp:**
- **Public API cho end-users** (frontend ít dùng RPC, REST/GraphQL phổ biến hơn).
- Khi cần tận dụng HTTP features sẵn có (cookies, caching headers, CDN).
- **Data-centric API với CRUD đơn giản** (nên dùng REST sẽ tự nhiên hơn).

## So sánh RPC với REST

| Tiêu chí | RPC | REST |
|---|---|---|
| **Abstraction (trừu tượng theo)** | Actions / Methods (hành động) | Resources (tài nguyên) |
| **Protocol** | Custom hoặc binary (Protobuf) | HTTP chuẩn |
| **Use case chính** | Internal, B2B (backend-to-backend) | Public, Web |
| **Linh hoạt method** | Vô hạn — đặt tên method tuỳ ý | Bị giới hạn bởi HTTP verbs (GET, POST, PUT, DELETE) |
| **Performance** | Thường nhanh hơn (binary protocol) | Có overhead của HTTP, JSON |
| **Tooling browser** | Cần SDK | Test trực tiếp với browser, curl |

Bài tiếp theo (Bài 3) sẽ đi sâu vào REST — cách tiếp cận khác.

## Tóm tắt bài 2

```text
RPC = Remote method call ẩn đi đặc tính "remote"
      → Code trông như gọi local method

Cấu trúc RPC gồm 3 thành phần:
├── IDL                — Định nghĩa interface, là single source of truth
├── Client Stub        — Serialize + send request qua network
└── Server Stub        — Receive + deserialize + gọi implementation

Ưu điểm: Tiện cho dev, đa ngôn ngữ, strong typing
Nhược điểm: Chậm "ẩn", không tin cậy do network (cần idempotent)

Phù hợp với: Backend-to-backend, internal microservice
Không phù hợp: Public web API, data-centric CRUD
```

---
**Bài kế tiếp**: [Bài 3 - REST API](03-rest-api.md) →
