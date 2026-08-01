# Bài 7: N+1 không chỉ ở database — nơi nó tệ hơn gấp trăm lần

Bạn đã chữa xong N+1 ở database. Số query từ 201 xuống 3. Bạn tự tin.

Rồi hệ thống được tách thành microservice. Và đoạn code này xuất hiện:

```java
List<Order> orders = orderService.findRecent();              // 1 lần gọi HTTP
for (Order o : orders) {
    User user = userClient.getUser(o.getUserId());           // ☠ N lần gọi HTTP
    o.setUserName(user.getName());
}
```

**Cùng một hình dạng. Cùng một lỗi. Nhưng hậu quả tệ hơn khoảng 100 lần.**

Bài này nói về N+1 ở tầng mạng — nơi nó nguy hiểm nhất, khó thấy nhất, và là nơi hầu hết sự cố sập dây chuyền bắt đầu.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **REST** | rét | Kiểu API dùng HTTP với tài nguyên và động từ chuẩn |
| **gRPC** | ji-a-pi-xi | Giao thức gọi hàm từ xa của Google, chạy trên HTTP/2 |
| **GraphQL** | gráp-kiu-eo | Ngôn ngữ truy vấn API — client tự khai cần gì |
| **Resolver** | ri-dôn-vơ | **Hàm giải quyết** — hàm trả về giá trị cho **một trường** trong GraphQL |
| **DataLoader** | đa-ta-lô-đơ | **Bộ nạp gom lô** — gom nhiều yêu cầu lẻ trong một tick thành một lời gọi |
| **Batching** | bát-ching | **Gom lô** — nhóm nhiều yêu cầu thành một |
| **Event loop tick** | tíc | **Nhịp vòng lặp sự kiện** — một chu kỳ xử lý của runtime |
| **Bulk endpoint** | bấch | **Điểm cuối gom** — API nhận nhiều ID một lần: `GET /users?ids=1,2,3` |
| **Fan-out** | phen-aoát | **Toè ra** — một request tạo ra nhiều request xuống dưới |
| **Connection pool** | | **Bể kết nối** — tập kết nối dùng lại, có số lượng giới hạn |
| **TLS handshake** | ti-eo-ét | **Bắt tay mã hoá** — thủ tục thiết lập kết nối an toàn, tốn nhiều vòng đi lại |
| **Head-of-line blocking** | | **Nghẽn đầu hàng** — một request chậm chặn cả hàng đợi phía sau |
| **Retry storm** | | **Bão thử lại** — thử lại hàng loạt làm dịch vụ đang yếu sập hẳn |
| **Circuit breaker** | | **Cầu dao** — tự ngắt gọi tới dịch vụ đang lỗi |
| **Cascading failure** | | **Sập dây chuyền** — một dịch vụ chết kéo theo cả hệ thống |
| **Tail latency** | teo | **Độ trễ đuôi** — p99, p999; phần chậm nhất của phân bố |

## Vì sao N+1 qua mạng tệ hơn N+1 qua database

```text
   MỘT LỜI GỌI DATABASE (cùng data center, kết nối đã mở sẵn trong pool)
   ┌────────────────────────────────────────────────────────┐
   │ · Kết nối: LẤY TỪ POOL, đã mở sẵn        →     0 ms   │
   │ · Gửi câu lệnh (giao thức nhị phân)      →   0,1 ms   │
   │ · Database thực thi (có index)           →  0,05 ms   │
   │ · Nhận kết quả                            →   0,1 ms   │
   │ ────────────────────────────────────────────────────── │
   │ TỔNG                                      ≈  0,5–1 ms  │
   └────────────────────────────────────────────────────────┘

   MỘT LỜI GỌI HTTP TỚI MICROSERVICE KHÁC
   ┌────────────────────────────────────────────────────────┐
   │ · Tra DNS (nếu chưa cache)               →   1–5 ms   │
   │ · Bắt tay TCP (3 bước)                   →     1 ms   │
   │ · Bắt tay TLS (1–2 vòng đi lại)          │              │
   │   → CHỈ khi chưa có kết nối trong pool    →   2–20 ms  │
   │ · Qua load balancer / service mesh sidecar→   1–3 ms   │
   │ · Tuần tự hoá JSON phía gọi              →   0,5 ms   │
   │ · Truyền qua mạng                         →   1–5 ms   │
   │ · Dịch vụ đích: xác thực, phân quyền,     │              │
   │   log, metrics, tracing                   →   2–10 ms  │
   │ · Dịch vụ đích TRUY VẤN DATABASE CỦA NÓ   →   1–50 ms  │
   │ · Giải tuần tự hoá JSON                   →   0,5 ms   │
   │ ────────────────────────────────────────────────────── │
   │ TỔNG                                      ≈  20–100 ms │
   └────────────────────────────────────────────────────────┘

                    CHÊNH LỆCH: 20–100 LẦN
```

**Áp vào ví dụ đầu bài — 50 đơn hàng:**

| | N+1 ở database | N+1 qua HTTP |
|---|---|---|
| Số lời gọi | 51 | 51 |
| Chi phí mỗi lời gọi | ~1 ms | ~30 ms |
| **Tổng độ trễ** | **51 ms** | **1.530 ms** |
| Tài nguyên chiếm | 1 kết nối DB | **51 kết nối HTTP** |
| Ảnh hưởng bên ngoài | không | **+50 request lên user-service** |
| Rủi ro lan rộng | thấp | ❌ **có thể làm sập dịch vụ khác** |

### Ba tác hại chỉ có ở N+1 qua mạng

```text
   ① BẠN LÀM HỎNG HỆ THỐNG CỦA NGƯỜI KHÁC

      API của bạn nhận 100 request/giây, mỗi request 50 đơn.
      → 100 × 50 = 5.000 request/giây đổ lên user-service.

      Đội user-service thấy lưu lượng tăng 50 lần mà KHÔNG hiểu vì sao.
      Họ scale lên. Chi phí của họ tăng. Vì lỗi trong code CỦA BẠN.

   ② KHUẾCH ĐẠI ĐỘ TRỄ ĐUÔI (TAIL LATENCY AMPLIFICATION)

      Giả sử user-service có p99 = 200 ms (chỉ 1% request chậm).
      Bạn gọi nó 50 lần TUẦN TỰ.
      Xác suất KHÔNG gặp lần chậm nào = 0,99^50 ≈ 60,5%
      → GẦN 40% REQUEST CỦA BẠN sẽ chạm ít nhất một lần chậm.

      p99 của họ trở thành p60 CỦA BẠN.
      → Đây là lý do toè ra nhiều lời gọi làm hỏng độ trễ đuôi
        NGAY CẢ KHI dịch vụ phía dưới hoàn toàn khoẻ mạnh.

   ③ SẬP DÂY CHUYỀN

      user-service chậm → 51 lời gọi của bạn đều chờ
      → luồng của bạn bị giữ → pool kết nối cạn
      → dịch vụ CỦA BẠN cũng ngừng phản hồi
      → dịch vụ gọi bạn cũng chờ...
      → CẢ HỆ THỐNG DỪNG vì MỘT dịch vụ chậm.
```

## Cách chữa ① — Bulk endpoint: nguyên tắc quan trọng nhất

```java
// ❌ N+1 QUA MẠNG
for (Order o : orders) {
    User u = userClient.getUser(o.getUserId());      // 50 lời gọi HTTP
}

// ✅ MỘT LỜI GỌI CHO TẤT CẢ
Set<Long> userIds = orders.stream().map(Order::getUserId).collect(toSet());
Map<Long, User> users = userClient.getUsers(userIds);     // 1 lời gọi HTTP

orders.forEach(o -> o.setUserName(users.get(o.getUserId()).getName()));
```

```java
// Phía user-service — cung cấp endpoint gom
@GetMapping("/users")
public List<UserDto> getUsers(@RequestParam Set<Long> ids) {
    if (ids.size() > MAX_BULK_SIZE) {                // ⚠ LUÔN có giới hạn
        throw new BadRequestException("Tối đa " + MAX_BULK_SIZE + " ID mỗi lần");
    }
    return userRepository.findAllById(ids).stream().map(UserDto::from).toList();
}
```

```text
   BỐN QUY TẮC THIẾT KẾ BULK ENDPOINT — bỏ qua là tự tạo lỗ hổng:

   ① LUÔN GIỚI HẠN SỐ ID (thường 100–500)
      Không giới hạn = ai đó gửi 100.000 ID = tự tạo lỗ hổng DoS.

   ② TRẢ VỀ MAP HOẶC KÈM ID, ĐỪNG TRẢ MẢNG THEO THỨ TỰ
      Nếu thiếu vài ID, mảng bị lệch và bạn ghép SAI NGƯỜI với SAI ĐƠN.
      → Trả {"1": {...}, "5": {...}} hoặc mỗi phần tử có trường id.

   ③ QUYẾT ĐỊNH RÕ HÀNH VI KHI THIẾU ID
      Bỏ qua lặng lẽ? Trả null? Báo lỗi cả lô?
      → Phải ghi trong tài liệu API, nếu không mỗi client hiểu một kiểu.

   ④ CẨN THẬN GIỚI HẠN ĐỘ DÀI URL (~2.000–8.000 ký tự)
      500 ID kiểu UUID đã vượt. → Dùng POST /users/batch với body JSON,
      hoặc chia lô ở phía client.
```

**Nếu không sửa được dịch vụ đích thì gọi song song — nhưng phải có giới hạn:**

```java
// ⚠ PHƯƠNG ÁN HAI: song song có kiểm soát
private final Semaphore limiter = new Semaphore(10);   // tối đa 10 lời gọi đồng thời

public Map<Long, User> fetchUsers(Set<Long> ids) {
    List<CompletableFuture<User>> futures = ids.stream()
        .map(id -> CompletableFuture.supplyAsync(() -> {
            limiter.acquireUninterruptibly();
            try { return userClient.getUser(id); }
            finally { limiter.release(); }
        }, virtualThreadExecutor))
        .toList();

    return futures.stream().map(CompletableFuture::join)
                  .collect(toMap(User::id, u -> u));
}
```

```text
   ⚠ SONG SONG SỬA ĐƯỢC ĐỘ TRỄ, KHÔNG SỬA ĐƯỢC TẢI.

   50 lời gọi tuần tự (30 ms) = 1.500 ms, 50 request lên user-service
   50 lời gọi song song       =   ~90 ms, 50 request lên user-service
                                            ▲
                              TẢI LÊN DỊCH VỤ KIA KHÔNG ĐỔI.

   Và nếu KHÔNG giới hạn số luồng đồng thời, bạn còn tệ hơn:
   dồn 50 request cùng lúc = một cú đấm thay vì rải đều.
   → Bulk endpoint vẫn là cách ĐÚNG. Song song chỉ là chữa cháy.
```

## Cách chữa ② — DataLoader: gom lô tự động

Bulk endpoint đòi bạn **biết trước** mình cần gì. Nhưng trong GraphQL — và trong bất kỳ kiến trúc phân tầng nào — bạn thường **không biết trước**. Đó là chỗ DataLoader xuất hiện.

### Vì sao GraphQL sinh ra N+1 một cách tự nhiên

```graphql
query {
  orders(last: 50) {        # ① 1 lời gọi lấy 50 đơn
    id
    total
    user {                  # ② resolver `user` chạy 50 LẦN
      name
      email
    }
  }
}
```

```text
   CÁCH GRAPHQL THỰC THI — đây là gốc rễ vấn đề:

   ┌───────────────────────────────────────────────────────┐
   │ Resolver `orders`  → chạy 1 lần  → trả 50 đơn        │
   └───────────────────────────┬───────────────────────────┘
                               │
        ┌──────────┬───────────┼───────────┬──────────┐
        ▼          ▼           ▼           ▼          ▼
   user(order1) user(order2) user(order3) ...  user(order50)
        │          │           │           │          │
        ▼          ▼           ▼           ▼          ▼
     1 query    1 query     1 query      ...      1 query

   → 51 lời gọi.

   ⚠ VÀ ĐÂY LÀ ĐIỀU KHIẾN GRAPHQL ĐẶC BIỆT NGUY HIỂM:

   Resolver `user` được thiết kế để KHÔNG BIẾT nó đang chạy trong
   ngữ cảnh nào. Nó chỉ nhận MỘT order và trả MỘT user.
   Đó là điểm mạnh của GraphQL (kết hợp tuỳ ý), và cũng là
   lý do N+1 là MẶC ĐỊNH, không phải ngoại lệ.

   TỆ HƠN: người viết resolver KHÔNG kiểm soát được query của client.
   Client thêm một trường lồng → số lời gọi nhân lên mà server không hay.
```

### DataLoader hoạt động thế nào

```text
   Ý TƯỞNG CỐT LÕI: HOÃN LẠI MỘT NHỊP, GOM HẾT, GỌI MỘT LẦN.

   Nhịp 1 (event loop tick):
      resolver user(order1) → loader.load(7)   → xếp hàng, CHƯA gọi gì
      resolver user(order2) → loader.load(3)   → xếp hàng
      resolver user(order3) → loader.load(7)   → ĐÃ CÓ 7 → dùng lại
      ...
      resolver user(order50)→ loader.load(19)  → xếp hàng

   Cuối nhịp — DataLoader gom hàng đợi:
      batchLoadFn([7, 3, 19, 22, ...])   ← MỘT lời gọi duy nhất
      → SELECT * FROM users WHERE id IN (7,3,19,22,...)
      → hoặc GET /users?ids=7,3,19,22

   Rồi phân phát kết quả về từng promise đang chờ.

   TỔNG: 2 lời gọi thay vì 51.
```

```java
// Java — graphql-java + DataLoader
@Component
public class UserDataLoader {

    private final UserClient userClient;

    public DataLoader<Long, User> create() {
        BatchLoader<Long, User> batchFn = ids -> CompletableFuture.supplyAsync(() -> {
            Map<Long, User> byId = userClient.getUsers(Set.copyOf(ids));

            // ⚠ BẮT BUỘC: trả về ĐÚNG THỨ TỰ và ĐÚNG SỐ LƯỢNG như `ids`
            return ids.stream().map(byId::get).toList();
        });

        return DataLoaderFactory.newDataLoader(batchFn,
                DataLoaderOptions.newOptions()
                        .setMaxBatchSize(100)          // chia lô nếu vượt
                        .setCachingEnabled(true));     // cache trong MỘT request
    }
}

@DgsData(parentType = "Order", field = "user")
public CompletableFuture<User> user(DgsDataFetchingEnvironment env) {
    Order order = env.getSource();
    return env.<Long, User>getDataLoader("userLoader").load(order.getUserId());
}
```

```javascript
// Node — thư viện dataloader gốc
const userLoader = new DataLoader(async (ids) => {
  const users = await userClient.getUsers(ids);
  const byId = new Map(users.map(u => [u.id, u]));
  return ids.map(id => byId.get(id) ?? null);   // ⚠ đúng thứ tự, đúng số lượng
}, { maxBatchSize: 100 });

const resolvers = {
  Order: { user: (order, _args, ctx) => ctx.loaders.user.load(order.userId) }
};
```

```text
   ⚠ HAI LUẬT SỐNG CÒN CỦA DATALOADER:

   ① HÀM BATCH PHẢI TRẢ VỀ MẢNG CÙNG ĐỘ DÀI VÀ CÙNG THỨ TỰ VỚI `ids`.
      Nếu một ID không tìm thấy → trả null Ở ĐÚNG VỊ TRÍ ĐÓ.
      Trả thiếu phần tử → DataLoader ghép SAI dữ liệu cho SAI người dùng.
      → Đây là lỗi bảo mật nghiêm trọng, không chỉ là bug hiển thị.

   ② TẠO DATALOADER MỚI CHO MỖI REQUEST, KHÔNG DÙNG CHUNG TOÀN CỤC.
      DataLoader có cache bên trong. Dùng chung giữa các request
      → người dùng A THẤY DỮ LIỆU CỦA NGƯỜI DÙNG B.
      → Vòng đời đúng: khởi tạo trong GraphQLContext của từng request.
```

### DataLoader không chỉ dành cho GraphQL

```java
// Dùng được ở REST, gRPC, hay bất kỳ đâu có nhiều lời gọi lẻ
@RequestScope                                     // ← vòng đời theo request
@Component
public class RequestScopedLoaders {
    public final DataLoader<Long, User> users;
    public final DataLoader<Long, Product> products;
}
```

**Ở các ngôn ngữ khác:** Go dùng `dataloadgen` hoặc `graph-gophers/dataloader`; Python có `aiodataloader`; .NET có `GreenDonut` (đi kèm HotChocolate).

## Cách chữa ③ — thay đổi hình dạng API

Đôi khi cách đúng nhất không phải tối ưu lời gọi, mà là **không cần gọi**.

```text
   ① NHÚNG SẴN TRƯỜNG HAY DÙNG (denormalize)

      GET /orders  trả về:
      { "id": 1, "total": 500000,
        "user": { "id": 7, "name": "Nam" } }     ← nhúng sẵn tên
                                                    KHÔNG cần gọi user-service

      ĐÁNH ĐỔI: tên người dùng đổi → dữ liệu trong orders bị cũ.
      → Chấp nhận được với dữ liệu ÍT ĐỔI (tên, mã, ảnh đại diện).
      → KHÔNG chấp nhận với dữ liệu nhạy cảm (quyền, số dư, trạng thái).

   ② API COMPOSITION Ở TẦNG GATEWAY (BFF)

      Client ──► BFF ──┬──► order-service   (1 lời gọi)
                       └──► user-service    (1 lời gọi gom)
                       → BFF ghép rồi trả về

      Client chỉ gọi 1 lần thay vì N+1 lần qua Internet.

   ③ SAO CHÉP DỮ LIỆU CHỈ-ĐỌC QUA SỰ KIỆN

      user-service phát UserUpdated → order-service lưu bản sao
      { user_id, user_name } trong database của mình.
      → KHÔNG gọi mạng lần nào khi hiển thị.

      ĐÁNH ĐỔI: nhất quán cuối cùng + phải xử lý sự kiện đến muộn/lặp.
      → Chỉ dùng khi lưu lượng đủ lớn để xứng đáng với độ phức tạp.

   ④ CACHE TRONG PHẠM VI MỘT REQUEST

      Nếu cùng một user xuất hiện nhiều lần trong một request,
      cache theo request đã loại bỏ phần lớn lời gọi trùng
      mà KHÔNG cần thay đổi kiến trúc.
      → DataLoader đã làm sẵn điều này.
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Đội user-service báo lưu lượng của họ tăng **40 lần** trong một đêm. Không có tính năng nào mới ra. Họ hỏi bạn có làm gì không.

**Chẩn đoán:**

```bash
# ① Xem lưu lượng đến user-service, nhóm theo dịch vụ gọi
# (từ service mesh, API gateway, hoặc header X-Caller)
sum by (caller) (rate(http_requests_total{service="user-service"}[5m]))
#   order-service   4820/s     ← thủ phạm
#   web-bff          120/s
#   admin-service     14/s
```

```bash
# ② Tìm endpoint nào của order-service gây ra
sum by (route) (rate(http_client_requests_total{
    service="order-service", target="user-service"}[5m]))
#   GET /api/orders          4790/s
#   GET /api/orders/{id}       30/s
```

```text
   ③ TÍNH TỈ LỆ TOÈ — đây là chỉ số cần theo dõi lâu dài:

      order-service nhận 96 req/s cho GET /api/orders
      order-service gửi 4.790 req/s tới user-service
      ──────────────────────────────────────────────
      TỈ LỆ TOÈ = 4790 / 96 ≈ 50

      50 = đúng bằng số đơn mỗi trang.  → XÁC NHẬN N+1.
```

**Cách xử lý:**

```java
// TRƯỚC
public List<OrderDto> list(Pageable p) {
    return orderRepository.findAll(p).map(o -> {
        User u = userClient.getUser(o.getUserId());       // ☠ 50 lời gọi
        return OrderDto.of(o, u);
    }).toList();
}

// SAU
public List<OrderDto> list(Pageable p) {
    List<Order> orders = orderRepository.findAll(p).getContent();

    Set<Long> userIds = orders.stream().map(Order::getUserId).collect(toSet());
    Map<Long, User> users = userClient.getUsers(userIds);   // ✅ 1 lời gọi

    return orders.stream()
            .map(o -> OrderDto.of(o, users.get(o.getUserId())))
            .toList();
}
```

**Chặn tái diễn — ba lớp, mỗi lớp bắt lỗi ở một giai đoạn khác nhau:**

```java
// ① TEST: đếm lời gọi HTTP bằng WireMock
@Test
void danh_sach_don_chi_goi_user_service_mot_lan() {
    wireMock.stubFor(get(urlPathEqualTo("/users")).willReturn(okJson("[]")));

    mockMvc.perform(get("/api/orders?size=50")).andExpect(status().isOk());

    wireMock.verify(1, getRequestedFor(urlPathEqualTo("/users")));
    wireMock.verify(0, getRequestedFor(urlPathMatching("/users/\\d+")));   // ← chặn gọi lẻ
}
```

```yaml
# ② ALERT: theo dõi tỉ lệ toè, không chỉ theo dõi độ trễ
- alert: FanoutRatioCao
  expr: |
    sum by (caller, target) (rate(http_client_requests_total[5m]))
      / on (caller) sum by (caller) (rate(http_server_requests_total[5m])) > 5
  for: 10m
  annotations:
    summary: "{{ $labels.caller }} gọi {{ $labels.target }} > 5 lần mỗi request"
```

```text
   ③ HỢP ĐỒNG GIỮA CÁC ĐỘI:
      Ghi vào tài liệu API của user-service:
      "GET /users/{id} chỉ dành cho lời gọi ĐƠN LẺ.
       Cần nhiều người dùng → BẮT BUỘC dùng GET /users?ids=.
       Vi phạm sẽ bị rate limit ở tầng gateway."

      Và THỰC THI nó bằng rate limit thật, không chỉ ghi trong tài liệu.
```

> **Tình huống 2:** API GraphQL chạy tốt suốt 6 tháng. Một sáng, đội mobile ra bản cập nhật và **cả cụm sập**. Không ai đổi code phía server.

**Chẩn đoán — client đổi truy vấn, server không kiểm soát được:**

```graphql
# Truy vấn CŨ của mobile
query { orders(last: 20) { id total } }

# Truy vấn MỚI — thêm hai tầng lồng nhau
query {
  orders(last: 20) {
    id
    total
    user { name                       # 20 lời gọi
      recentOrders(last: 5) {         # 20 lời gọi
        items { product { name } }    # 20 × 5 × 3 = 300 lời gọi
      }
    }
  }
}
# → 1 + 20 + 20 + 300 + ... ≈ 400+ lời gọi cho MỘT truy vấn
```

```text
   ĐÂY LÀ RỦI RO ĐẶC TRƯNG CỦA GRAPHQL:
   CLIENT QUYẾT ĐỊNH TẢI CỦA SERVER.

   Với REST, server định nghĩa endpoint nên biết trước chi phí.
   Với GraphQL, một truy vấn hợp lệ có thể tốn gấp 1.000 lần truy vấn khác.
```

**Cách xử lý — bốn lớp bảo vệ, nên có đủ cả bốn:**

```java
// ① DATALOADER cho MỌI resolver có quan hệ (bắt buộc, không phải tuỳ chọn)
```

```java
// ② GIỚI HẠN ĐỘ SÂU TRUY VẤN
@Bean
public MaxQueryDepthInstrumentation depthLimit() {
    return new MaxQueryDepthInstrumentation(8);
}
```

```java
// ③ TÍNH ĐỘ PHỨC TẠP — chặn trước khi chạy
@Bean
public MaxQueryComplexityInstrumentation complexityLimit() {
    return new MaxQueryComplexityInstrumentation(1000);
}
```

```java
// ④ PERSISTED QUERY — chỉ cho phép truy vấn đã đăng ký trước
//    Client gửi hash thay vì cả câu truy vấn.
//    → Truy vấn mới phải qua review và đo TRƯỚC khi lên production.
//    → Đây là lớp bảo vệ MẠNH NHẤT cho GraphQL công khai.
```

**Chặn tái diễn:**

```java
@Test
void truy_van_long_nhau_khong_duoc_vuot_qua_5_loi_goi() {
    wireMock.resetRequests();

    graphQlTester.document("""
        query { orders(last: 20) { id user { name } } }
        """).execute();

    assertThat(wireMock.getAllServeEvents())
        .as("N+1 trong resolver — kiểm tra DataLoader còn hoạt động không")
        .hasSizeLessThanOrEqualTo(5);
}
```

> **Tình huống 3:** Bạn đã dùng DataLoader nhưng log vẫn thấy 50 lời gọi lẻ.

**Chẩn đoán — ba nguyên nhân phổ biến, kiểm tra theo thứ tự:**

```java
// ① RESOLVER TRẢ VỀ GIÁ TRỊ TRỰC TIẾP, KHÔNG TRẢ CompletableFuture
//    → DataLoader không có cơ hội gom vì mỗi lần đã chạy xong ngay
@DgsData(parentType = "Order", field = "user")
public User user(DgsDataFetchingEnvironment env) {      // ❌ trả User
    return loader.load(id).join();                       // ❌ .join() ép chạy NGAY
}

// ✅ ĐÚNG — trả CompletableFuture, để runtime quyết định lúc nào gom
public CompletableFuture<User> user(DgsDataFetchingEnvironment env) {
    return env.<Long, User>getDataLoader("userLoader").load(id);
}
```

```java
// ② TẠO DATALOADER MỚI BÊN TRONG RESOLVER
public CompletableFuture<User> user(...) {
    DataLoader<Long, User> loader = createLoader();   // ❌ mỗi lần một loader mới
    return loader.load(id);                            // → không có gì để gom
}
// ✅ Lấy từ context của request
```

```java
// ③ CÓ await/join Ở GIỮA CHUỖI — cắt đứt nhịp gom
List<User> users = new ArrayList<>();
for (Order o : orders) {
    users.add(loader.load(o.getUserId()).join());     // ❌ join TRONG vòng lặp
}
// ✅ Xếp hàng hết rồi mới chờ
List<CompletableFuture<User>> fs = orders.stream()
        .map(o -> loader.load(o.getUserId())).toList();
CompletableFuture.allOf(fs.toArray(new CompletableFuture[0])).join();
```

**Chặn tái diễn:**

```java
// Bật thống kê của DataLoader và khẳng định có gom lô thật
DataLoaderOptions.newOptions().setStatisticsCollector(SimpleStatisticsCollector::new);

@Test
void dataloader_phai_gom_lo() {
    // ... chạy truy vấn ...
    Statistics s = registry.getStatistics();
    assertThat(s.getBatchLoadCount()).isEqualTo(1);       // 1 lần gọi batch
    assertThat(s.getLoadCount()).isGreaterThan(10);       // nhưng nhận > 10 yêu cầu
    // → tỉ lệ gom = 10:1, DataLoader đang hoạt động
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Vòng lặp gọi REST/gRPC | Chậm gấp 20–100 lần N+1 database | Bulk endpoint |
| Bulk endpoint không giới hạn số ID | Ai đó gửi 100.000 ID → **lỗ hổng DoS** | Giới hạn 100–500, trả 400 nếu vượt |
| Bulk trả mảng theo thứ tự, thiếu ID | Mảng lệch → **ghép sai người với sai đơn** | Trả `Map` hoặc kèm `id` mỗi phần tử |
| Danh sách ID quá dài trong URL | Vượt giới hạn ~2.000–8.000 ký tự | `POST /users/batch` với body |
| Song song thay vì gom lô | Sửa độ trễ, **không sửa tải** cho dịch vụ kia | Bulk endpoint là cách đúng |
| Song song không giới hạn luồng | Dồn 50 request cùng lúc như một cú đấm | `Semaphore` giới hạn đồng thời |
| DataLoader dùng chung toàn cục | Cache rò giữa request → **lộ dữ liệu người khác** | Vòng đời theo request |
| Hàm batch trả sai thứ tự/số lượng | **Ghép sai dữ liệu** — lỗi bảo mật, không chỉ hiển thị | Luôn `ids.map(id => byId.get(id) ?? null)` |
| `.join()` trong resolver hoặc vòng lặp | Cắt nhịp gom → DataLoader vô tác dụng | Trả `CompletableFuture`, join sau cùng |
| GraphQL không giới hạn độ sâu | Client đổi truy vấn → **sập cụm** | Depth + complexity + persisted query |
| Nhúng dữ liệu nhạy cảm để tránh gọi | Quyền/số dư bị cũ → **lỗ hổng phân quyền** | Chỉ nhúng dữ liệu ít đổi, không nhạy cảm |
| Chỉ giám sát độ trễ, không giám sát tỉ lệ toè | N+1 mạng lộ ra khi đội khác kêu | Alert trên **tỉ lệ toè** |

## Câu hỏi phỏng vấn hay gặp

**H: N+1 qua mạng khác gì N+1 qua database?**
Cùng hình dạng nhưng hậu quả tệ hơn 20–100 lần. Một lời gọi database qua kết nối có sẵn tốn khoảng 0,5–1 ms; một lời gọi HTTP tới microservice khác tốn 20–100 ms vì phải qua DNS, bắt tay TCP/TLS nếu chưa có kết nối, load balancer, sidecar, tuần tự hoá JSON hai chiều, rồi dịch vụ đích còn phải truy vấn database của nó. Nhưng ba tác hại **riêng** của N+1 mạng mới đáng sợ hơn: bạn **tăng tải lên hệ thống của đội khác** mà họ không hiểu vì sao; bạn **khuếch đại độ trễ đuôi**; và bạn tạo nguy cơ **sập dây chuyền** khi pool kết nối cạn.

**H: Giải thích khuếch đại độ trễ đuôi.**
Giả sử dịch vụ phía dưới có p99 là 200 ms, tức chỉ 1% request chậm. Nếu bạn gọi nó 50 lần tuần tự trong một request thì xác suất **không** gặp lần chậm nào là 0,99 mũ 50, khoảng 60,5% — nghĩa là gần **40% request của bạn** sẽ chạm ít nhất một lần chậm. p99 của họ trở thành p60 của bạn. Điều đáng nói là nó xảy ra **ngay cả khi dịch vụ phía dưới hoàn toàn khoẻ mạnh** — đây là lý do toè ra nhiều lời gọi là vấn đề kiến trúc, không phải vấn đề hiệu năng của một dịch vụ nào cả.

**H: DataLoader hoạt động thế nào?**
Nó **hoãn lại một nhịp**. Khi các resolver gọi `load(id)`, DataLoader không đi lấy dữ liệu ngay mà xếp ID vào hàng đợi và trả về một promise. Đến cuối nhịp event loop, nó gom toàn bộ hàng đợi — đã loại trùng — thành **một** lời gọi batch, rồi phân phát kết quả về từng promise. 51 lời gọi thành 2. Hai luật sống còn khi dùng: hàm batch **phải trả về mảng cùng độ dài và cùng thứ tự với danh sách ID đầu vào**, thiếu thì trả `null` đúng vị trí — trả thiếu phần tử sẽ ghép sai dữ liệu cho sai người dùng, đó là lỗi bảo mật; và **phải tạo DataLoader mới cho mỗi request** vì nó có cache bên trong, dùng chung toàn cục thì người dùng A sẽ thấy dữ liệu của người dùng B.

**H: Vì sao GraphQL đặc biệt dễ dính N+1?**
Vì resolver được thiết kế để **không biết ngữ cảnh** — nó nhận một đối tượng cha và trả về một giá trị con, đó chính là điểm mạnh cho phép client kết hợp trường tuỳ ý. Nhưng hệ quả là với 50 đơn hàng thì resolver `user` chạy 50 lần độc lập. Nguy hiểm hơn cả là **client quyết định tải của server**: với REST, server định nghĩa endpoint nên biết trước chi phí; với GraphQL, một truy vấn hợp lệ có thể tốn gấp nghìn lần truy vấn khác, và đội mobile ra bản cập nhật thêm hai tầng lồng nhau là đủ làm sập cụm mà server không đổi dòng code nào.

**H: Bảo vệ một API GraphQL công khai thế nào?**
Bốn lớp, và em nghĩ nên có đủ cả bốn. DataLoader cho **mọi** resolver có quan hệ — đây là bắt buộc chứ không phải tuỳ chọn. Giới hạn độ sâu truy vấn, thường 7–10 tầng. Tính điểm độ phức tạp và từ chối trước khi chạy. Và mạnh nhất là **persisted query**: client gửi hash của truy vấn đã đăng ký thay vì gửi cả câu, nghĩa là mọi truy vấn mới phải qua review và đo trước khi lên production.

**H: Thiết kế bulk endpoint cần lưu ý gì?**
Bốn điều. Luôn **giới hạn số ID**, thường 100–500 — không giới hạn là tự tạo lỗ hổng DoS. **Trả về map hoặc kèm `id` trong mỗi phần tử**, đừng trả mảng theo thứ tự, vì nếu vài ID không tồn tại thì mảng bị lệch và bạn ghép sai người với sai đơn. **Ghi rõ hành vi khi thiếu ID** — bỏ qua, trả null, hay lỗi cả lô — nếu không mỗi client hiểu một kiểu. Và để ý **giới hạn độ dài URL**: 500 ID kiểu UUID đã vượt ngưỡng, nên dùng `POST /batch` với body hoặc chia lô ở client.

**H: Gọi song song có thay thế được bulk endpoint không?**
Không. Song song sửa được **độ trễ** nhưng không sửa được **tải**: 50 lời gọi song song vẫn là 50 request đổ lên dịch vụ kia, chỉ khác là dồn cùng lúc — thành một cú đấm thay vì rải đều, đôi khi còn tệ hơn. Nếu không giới hạn số luồng đồng thời thì bạn còn có thể làm sập dịch vụ đó. Song song chỉ là chữa cháy khi **không sửa được** dịch vụ đích; giải pháp đúng vẫn là bulk endpoint hoặc DataLoader.

## Tóm tắt bài 7

- N+1 qua mạng **cùng hình dạng nhưng tệ hơn 20–100 lần** N+1 qua database.
- Ba tác hại **riêng** của N+1 mạng: làm tăng tải hệ thống đội khác, **khuếch đại độ trễ đuôi**, và nguy cơ **sập dây chuyền**.
- Khuếch đại đuôi: gọi 50 lần một dịch vụ có p99 = 200 ms → **gần 40% request của bạn** chạm lần chậm.
- Cách chữa số một là **bulk endpoint**: giới hạn số ID, trả map, ghi rõ hành vi khi thiếu, để ý độ dài URL.
- **Song song sửa độ trễ, không sửa tải** — chỉ là chữa cháy, không thay được bulk.
- **DataLoader hoãn một nhịp, gom hàng đợi, gọi một lần.** Hai luật: batch phải **đúng thứ tự và độ dài**; loader phải **theo vòng đời request**.
- GraphQL dễ dính N+1 vì resolver **không biết ngữ cảnh** và **client quyết định tải của server**.
- Bảo vệ GraphQL bằng bốn lớp: DataLoader, giới hạn độ sâu, giới hạn độ phức tạp, **persisted query**.
- Giám sát **tỉ lệ toè** (request gửi đi / request nhận vào), không chỉ giám sát độ trễ.
- Cách chữa triệt để nhất đôi khi là **đổi hình dạng API**: nhúng trường ít đổi, ghép ở BFF, hoặc sao chép dữ liệu chỉ-đọc qua sự kiện.

**Bài kế tiếp** → [Bài 8: Phát hiện N+1 trước khi khách hàng phát hiện](08-phat-hien-n-cong-1.md)

**Quay lại** → [Bài 6: Kiến trúc thực tế và lộ trình chuyển đổi](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md)
