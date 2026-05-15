# Bài 2: RPC - Remote Procedure Call

## RPC là gì?

> **RPC** = Khả năng của client application **thực thi một function trên remote server** — trông và cảm giác như gọi local method thông thường.

**Local Transparency**: Từ góc độ developer, gọi remote method trông giống hệt gọi local method.

## Cách RPC hoạt động

### 1. Interface Definition

Định nghĩa API và data types bằng **Interface Description Language (IDL)**:

```protobuf
// Proto file (gRPC)
service UserService {
    rpc GetUser(GetUserRequest) returns (User);
    rpc CreateUser(CreateUserRequest) returns (User);
}

message User {
    int64 id = 1;
    string name = 2;
    string email = 3;
}
```

### 2. Code Generation

Từ IDL, tool tự động generate:

```
IDL Definition
    ↓ (compiler/codegen)
┌──────────────────────────────────┐
│  Client Stub (ở phía client)     │  ← Serialize + Send
│  Server Stub (ở phía server)     │  ← Receive + Deserialize + Call
│  DTOs (Data Transfer Objects)    │  ← Generated classes
└──────────────────────────────────┘
```

### 3. Runtime Flow

```
Client Code → Client Stub → [Serialize + Network] → Server Stub → Real Implementation
                                                         ↓
Client Code ← Client Stub ← [Network + Deserialize] ← Server Stub ← Return value
```

**Tất cả network details được ẩn đi** — developer chỉ thấy method call bình thường.

## Popular RPC Frameworks

| Framework | Language | Protocol |
|-----------|----------|---------|
| **gRPC** | Multi-lang | Protocol Buffers (binary) |
| **Apache Thrift** | Multi-lang | Binary/JSON |
| **JSON-RPC** | Multi-lang | JSON over HTTP |
| **XML-RPC** | Multi-lang | XML over HTTP |

## Lợi ích của RPC

1. **Developer convenience**: Gọi remote service như local function
2. **Multi-language support**: Client và server có thể dùng ngôn ngữ khác nhau
3. **Full network abstraction**: Không cần biết HTTP, sockets, etc.
4. **Strong typing**: IDL define types rõ ràng → compile-time checks

## Nhược điểm của RPC

### 1. Slowness

Remote methods **chậm hơn rất nhiều** so với local methods — nhưng trông giống hệt nhau trong code:

```java
// Trông giống local method...
User user = userService.getUser(userId);  // ...nhưng có thể mất 500ms!
```

→ Cần explicit async versions cho slow operations.

### 2. Unreliability

```
Client gửi request → Không nhận response
                     ↑
              Server crash? Network lost? Response lost?
              Client KHÔNG BIẾT!
```

**Ví dụ nguy hiểm:**
```
Bank API: debitAccount(amount)

Nếu timeout:
- Retry → Có thể charge 2 lần!
- Không retry → Có thể không charge!
```

**Giải pháp**: Thiết kế operations idempotent khi có thể.

## Khi nào dùng RPC?

✅ **Phù hợp:**
- Backend-to-backend communication (B2B APIs)
- Internal service-to-service (microservices)
- Actions-oriented API (focus vào actions, không phải data)
- Khi muốn ẩn hoàn toàn network details

❌ **Không phù hợp:**
- Public API cho end-users (ít phổ biến ở frontend)
- Khi cần tận dụng HTTP features (cookies, caching headers)
- Data-centric API với CRUD đơn giản (dùng REST thay)

## RPC vs REST

| | RPC | REST |
|--|-----|------|
| **Abstraction** | Actions/Methods | Resources |
| **Protocol** | Custom/Binary | HTTP |
| **Use case** | Internal, B2B | Public, Web |
| **Flexibility** | Vô hạn methods | Giới hạn HTTP verbs |
| **Performance** | Thường nhanh hơn | Overhead của HTTP |

## Tóm tắt

```
RPC = Remote method call looks like local method call

Components:
├── IDL: Interface definition
├── Client Stub: Serialize + send
└── Server Stub: Receive + call real impl

Pros: Convenient, multi-lang, strong typing
Cons: Slow (hidden), unreliable (network)

Best for: Backend-to-backend, internal services
```

---
**Tiếp theo:** Bài 3 - REST API →
