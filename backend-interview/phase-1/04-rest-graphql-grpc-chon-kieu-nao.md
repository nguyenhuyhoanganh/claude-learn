# Bài 4: REST, GraphQL và gRPC — chọn kiểu giao tiếp nào

Một màn hình hồ sơ đơn giản: ảnh, tên, vài bài viết. Vậy mà app phải gọi tới **5 API khác nhau** để vẽ xong nó. Nghe sai sai đúng không?

Đây là cuộc tranh luận chia đôi giới backend cả thập kỷ. Một bên là **REST**, chuẩn mực lâu đời. Bên kia là **GraphQL**, kẻ thách thức hứa "lấy đúng thứ bạn cần". Và một bên thứ ba ít ồn ào hơn nhưng đang chiếm lĩnh giao tiếp nội bộ: **gRPC**.

Câu hỏi phỏng vấn không phải *"cái nào xịn hơn"* — mà là **bạn có biết cái giá của từng lựa chọn không**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **REST** (*Representational State Transfer*) | Kiểu kiến trúc API dựa trên tài nguyên và động từ HTTP |
| **GraphQL** | Ngôn ngữ truy vấn cho API, client mô tả chính xác dữ liệu mình muốn |
| **gRPC** (*Google Remote Procedure Call*) | Gọi hàm ở máy khác như gọi hàm cục bộ, dùng HTTP/2 + nhị phân |
| **Overfetching** | **Lấy thừa** — server trả nhiều hơn bạn cần |
| **Underfetching** | **Lấy thiếu** — một lần gọi không đủ, phải gọi thêm |
| **Waterfall** | **Thác nước** — chuỗi lời gọi nối tiếp, mỗi cái chờ cái trước |
| **Schema** | **Lược đồ** — bản mô tả cấu trúc dữ liệu, như hợp đồng |
| **Resolver** | **Hàm phân giải** — hàm lấy dữ liệu cho một trường trong GraphQL |
| **Cache** | **Bộ nhớ đệm** — lưu tạm kết quả để lần sau khỏi tính lại |
| **CDN** (*Content Delivery Network*) | **Mạng phân phối nội dung** — máy chủ đặt gần người dùng để phục vụ nhanh |
| **Serialization** | **Tuần tự hoá** — biến đối tượng trong bộ nhớ thành chuỗi byte để gửi đi |
| **Protobuf** (*Protocol Buffers*) | Định dạng nhị phân của Google, gọn và nhanh hơn JSON nhiều |
| **Streaming** | **Truyền dòng** — gửi dữ liệu liên tục thay vì một cục |

## REST: mỗi tài nguyên một địa chỉ

```text
   Client cần: tên người dùng + bài viết + bình luận

   GET /users/42            ──► {id, ten, email, dia_chi, ngay_sinh, avatar, ...}
   GET /users/42/posts      ──► [{id, tieu_de, noi_dung, ...}, ...]
   GET /posts/7/comments    ──► [{id, noi_dung, user_id}, ...]
   GET /posts/8/comments    ──► [...]
   GET /users/99            ──► (tên người bình luận)

   → 5 chuyến đi mạng, và mỗi chuyến trả về nhiều hơn cần thiết.
```

Giống một toà nhà nhiều phòng, mỗi phòng chứa một loại dữ liệu. Hoặc: **gọi combo có sẵn** — mỗi endpoint là một suất cố định, được gì lấy nấy.

### Hai điểm yếu của REST

```text
① OVERFETCHING (lấy thừa)
   Bạn chỉ cần TÊN người dùng.
   GET /users/42 trả về nguyên cục: id, email, địa chỉ, ngày sinh, avatar,
   thiết lập thông báo, ngày tạo... — 2 KB cho một trường bạn cần.
   → Lãng phí băng thông, nhất là trên mạng di động.

② UNDERFETCHING (lấy thiếu)
   Một endpoint không đủ nên bạn phải gọi thêm.
   Lấy user → rồi lấy post của user → rồi lấy comment của từng post.
   Mỗi lần phải CHỜ lần trước xong mới biết id để gọi tiếp.
   → Đây là WATERFALL, và nó nhân độ trễ mạng lên nhiều lần.
```

```text
Waterfall trên mạng 4G (RTT ~100ms):

  |──100ms──| GET /users/42
             |──100ms──| GET /users/42/posts     (phải chờ có user id)
                        |──100ms──| GET /posts/7/comments
                                   |──100ms──| GET /users/99

  Tổng: 400ms chỉ riêng độ trễ mạng, chưa tính thời gian xử lý.
```

## GraphQL: một địa chỉ, client tự chọn món

```text
   POST /graphql          ◄── DUY NHẤT một endpoint

   query {
     user(id: 42) {
       ten                          ← chỉ lấy tên, không lấy gì khác
       posts(limit: 5) {
         tieuDe
         comments(limit: 3) {
           noiDung
           tacGia { ten }           ← lồng bao nhiêu tầng cũng được
         }
       }
     }
   }
```

```json
// Server trả về ĐÚNG hình dạng bạn hỏi — không thừa một byte
{ "data": { "user": { "ten": "An", "posts": [ { "tieuDe": "...",
  "comments": [ { "noiDung": "...", "tacGia": { "ten": "Bình" } } ] } ] } } }
```

Giống **gọi món lẻ**: tự chọn từng thứ trên đĩa. Cùng một nhà bếp, hai cách gọi món.

Overfetching biến mất. Underfetching biến mất. Waterfall biến mất — **một chuyến đi duy nhất**.

### Kiến trúc và cách hoạt động: GraphQL chạy thế nào bên trong

Đây là phần quyết định bạn hiểu hay chỉ dùng theo mẫu.

```text
① Client gửi CHUỖI query  ──► POST /graphql

② PARSE — biến chuỗi thành cây cú pháp (AST)

③ VALIDATE — đối chiếu với SCHEMA
     Hỏi trường không tồn tại? → báo lỗi NGAY, chưa chạm database

④ EXECUTE — duyệt cây, gọi RESOLVER cho từng trường
     ┌─ user      → resolver: SELECT * FROM users WHERE id=42
     │   ├─ ten   → resolver mặc định: lấy field "ten" của kết quả trên
     │   └─ posts → resolver: SELECT * FROM posts WHERE user_id=42
     │       ├─ tieuDe    → mặc định
     │       └─ comments  → resolver: chạy CHO TỪNG POST  ◄── N+1 ở đây!
     │           └─ tacGia → resolver: chạy CHO TỪNG COMMENT ◄── N+1 nữa!

⑤ Gộp kết quả theo đúng hình dạng query rồi trả về
```

**Đây chính là điểm đau lớn nhất của GraphQL**: mỗi trường có resolver riêng, nên bạn **không kiểm soát được vòng lặp**. Một query trông vô hại có thể sinh ra hàng nghìn truy vấn database.

**Cách chữa: DataLoader** — gom các yêu cầu lẻ trong cùng một nhịp event loop thành một truy vấn theo lô:

```javascript
const DataLoader = require('dataloader');

// TẠO MỚI mỗi request — nếu dùng chung sẽ rò dữ liệu giữa người dùng
function taoContext() {
  return {
    userLoader: new DataLoader(async (ids) => {
      const rows = await db.query('SELECT * FROM users WHERE id = ANY($1)', [ids]);
      const map = new Map(rows.map(r => [r.id, r]));
      return ids.map(id => map.get(id));   // PHẢI đúng thứ tự và đúng độ dài
    }),
  };
}

const resolvers = {
  Comment: {
    tacGia: (comment, _, ctx) => ctx.userLoader.load(comment.user_id)
    //                            ▲ 500 lần gọi trong cùng nhịp → 1 query
  }
};
```

### Ba cái giá của GraphQL

**① Mất caching HTTP miễn phí.**

```text
REST:  GET /products/42
       → URL cố định, method GET
       → Trình duyệt cache được. CDN cache được. Proxy cache được.
       → Kết quả trả thẳng từ bộ nhớ đệm, KHÔNG chạm tới server.

GraphQL: POST /graphql, body khác nhau mỗi lần
       → CDN nhìn vào chẳng biết đường nào mà cache.
       → Bạn phải TỰ DỰNG cache ở tầng ứng dụng. Không còn miễn phí.
```

Cách giảm nhẹ: **persisted query** (client gửi mã băm của query đã đăng ký trước thay vì cả chuỗi) + `GET`, để CDN cache lại được. Nhưng đó là thêm hạ tầng, không phải mặc định.

**② Query độc hại — một client có thể làm sập server.**

```graphql
# Query lồng vô tận — hợp lệ về cú pháp!
query {
  user(id: 1) { friends { friends { friends { friends { friends {
    friends { friends { ten } } } } } } }
}
# Độ sâu 7 × mỗi người 100 bạn = 100^7 = 10^14 bản ghi
```

Ba lớp bảo vệ **bắt buộc** cho GraphQL công khai:

```javascript
const server = new ApolloServer({
  schema,
  validationRules: [
    depthLimit(7),                            // ① giới hạn độ sâu
    createComplexityLimitRule(1000),          // ② giới hạn "điểm phức tạp"
  ],
  persistedQueries: { ttl: 900 },             // ③ chỉ cho chạy query đã đăng ký
});
```

**③ Khó giám sát và tính hạn mức.**

```text
REST:   /orders chậm  → biết ngay endpoint nào có vấn đề
        rate limit: 100 request/phút — đơn giản

GraphQL: mọi thứ đi qua POST /graphql
        → phải phân tích query mới biết trường nào chậm
        → rate limit theo request VÔ NGHĨA: một request có thể nhẹ tênh
          hoặc kéo cả database. Phải tính theo ĐIỂM PHỨC TẠP.
```

## gRPC: dành cho giao tiếp giữa các dịch vụ

Ít được nhắc khi so REST/GraphQL, nhưng nó thống trị mảng **nội bộ giữa các microservice**.

```protobuf
// order.proto — SCHEMA là nguồn sự thật, sinh code cho mọi ngôn ngữ
syntax = "proto3";

service OrderService {
  rpc LayDon (LayDonRequest) returns (Don);
  rpc TheoDoiDon (LayDonRequest) returns (stream TrangThaiDon);  // truyền dòng
}

message LayDonRequest { int64 order_id = 1; }

message Don {
  int64  order_id  = 1;
  string trang_thai = 2;
  int64  tong_tien  = 3;      // số nguyên minor unit, không dùng float cho tiền
}
```

```bash
# Sinh code client + server cho Go, Python, Java, Node... từ cùng một file
protoc --go_out=. --go-grpc_out=. order.proto
```

```python
# Gọi hàm ở máy khác như gọi hàm cục bộ
don = stub.LayDon(LayDonRequest(order_id=90210))
print(don.trang_thai)
```

**Vì sao gRPC nhanh hơn REST/JSON:**

```text
① Protobuf là NHỊ PHÂN, không phải văn bản
   JSON:     {"order_id":90210,"trang_thai":"da_dat"}   → 42 byte
   Protobuf: [0x08 0xA2 0xC1 0x05 0x12 0x06 ...]        → ~14 byte
   → nhỏ hơn ~3-10 lần, và parse nhanh hơn nhiều vì không phải đọc chuỗi

② HTTP/2 với ghép kênh (multiplexing)
   Nhiều lời gọi chạy song song trên MỘT kết nối TCP,
   không bị chặn đầu dòng như HTTP/1.1

③ Nén header, kết nối giữ lâu (long-lived)
   → không phải bắt tay TLS lại mỗi lần gọi

④ Hỗ trợ TRUYỀN DÒNG hai chiều
   Server đẩy cập nhật liên tục mà không cần client hỏi lại
```

**Nhược điểm quyết định:** trình duyệt **không gọi thẳng gRPC được** (cần gRPC-Web + proxy), và định dạng nhị phân nghĩa là **không debug bằng mắt** — bạn không thể `curl` rồi đọc kết quả.

## Bảng so sánh đầy đủ

| Tiêu chí | REST | GraphQL | gRPC |
|---|---|---|---|
| Định dạng | JSON (văn bản) | JSON (văn bản) | **Protobuf (nhị phân)** |
| Giao thức | HTTP/1.1 hoặc 2 | HTTP (thường POST) | **HTTP/2 bắt buộc** |
| Số endpoint | Nhiều | **Một** | Một cho mỗi phương thức |
| Cache HTTP/CDN | ✅ **Miễn phí** | ❌ Phải tự dựng | ❌ Không |
| Overfetching | ❌ Có | ✅ Không | ⚠️ Có (nhưng payload nhỏ) |
| Waterfall | ❌ Có | ✅ Không | ⚠️ Giảm nhờ HTTP/2 |
| Hợp đồng chặt (type-safe) | ⚠️ Cần OpenAPI | ✅ Schema bắt buộc | ✅ **.proto bắt buộc** |
| Trình duyệt gọi trực tiếp | ✅ | ✅ | ❌ Cần proxy |
| Debug bằng `curl` | ✅ **Dễ nhất** | ⚠️ Được | ❌ Nhị phân |
| Truyền dòng | ⚠️ SSE/WebSocket | ⚠️ Subscription | ✅ **Gốc, hai chiều** |
| Tải file lớn | ✅ | ❌ Kém | ⚠️ Được nhưng vụng |
| Hiệu năng thô | Trung bình | Trung bình | ✅ **Cao nhất** |
| Đội ngũ biết dùng | ✅ **Ai cũng biết** | Phổ biến | Ít hơn |
| Rate limit | ✅ Đơn giản | ❌ Phải tính điểm | ⚠️ Trung bình |

## Cây quyết định

```text
API của bạn phục vụ AI?
   │
   ├─ BÊN NGOÀI (đối tác, khách hàng, public)
   │     └──► REST
   │          Lý do: ai cũng biết dùng, curl được, cache được,
   │                 tài liệu đầy rẫy, không cần thư viện đặc biệt.
   │
   ├─ NHIỀU LOẠI CLIENT với nhu cầu dữ liệu KHÁC NHAU
   │  (web, iOS, Android, đồng hồ) VÀ dữ liệu lồng nhau nhiều tầng
   │     └──► GraphQL
   │          Lý do: mỗi client tự chọn phần mình cần,
   │                 backend không phải đẻ endpoint cho từng màn hình.
   │
   ├─ GIỮA CÁC DỊCH VỤ NỘI BỘ, cần độ trễ thấp và hợp đồng chặt
   │     └──► gRPC
   │          Lý do: nhị phân gọn, HTTP/2 ghép kênh, sinh code tự động,
   │                 và trình duyệt không cần gọi tới nó.
   │
   └─ DỰ ÁN CRUD BÌNH THƯỜNG, team nhỏ
         └──► REST. Mặc định hoàn hảo. Đừng phức tạp hoá.
```

**Và đây là điều ít ai nói: các công ty lớn không chọn một.**

```text
GitHub:   REST cho API công khai (v3) + GraphQL cho client linh hoạt (v4)
Shopify:  REST cho đối tác + GraphQL cho ứng dụng nội bộ
Netflix:  gRPC giữa các dịch vụ + GraphQL làm tầng tổng hợp cho client
Google:   gRPC nội bộ + REST/JSON ở rìa ngoài

Mẫu kiến trúc phổ biến nhất hiện nay:

   Client ──GraphQL/REST──► BFF ──gRPC──► [Dịch vụ][Dịch vụ][Dịch vụ]
                             ▲
              Backend For Frontend — tầng tổng hợp riêng cho từng loại client
```

### Tình huống thực tế và cách xử lý

> **Tình huống:** App mobile phàn nàn màn hình trang chủ tải 3 giây. Đo ra 6 lời gọi REST nối tiếp nhau, mỗi cái trả về gấp 5 lần dữ liệu cần dùng.

**Đây chính xác là bài toán GraphQL sinh ra để giải.** Nhưng đừng vội viết lại toàn hệ thống — có ba mức can thiệp, xếp theo chi phí:

```text
MỨC 1 — RẺ NHẤT: thêm tham số cho REST hiện có
   GET /users/42?fields=ten,avatar          ← giảm overfetching
   GET /users/42?include=posts,comments     ← giảm underfetching
   → Vài ngày công. Không đổi kiến trúc. Giải được 70% vấn đề.

MỨC 2 — TRUNG BÌNH: tạo endpoint tổng hợp riêng cho màn hình đó
   GET /screens/home?user_id=42
   → Trả về ĐÚNG cục dữ liệu màn hình trang chủ cần, một chuyến đi.
   → Đây chính là mẫu BFF thu nhỏ. Rất hiệu quả, rất ít người nghĩ tới.

MỨC 3 — ĐẮT NHẤT: dựng tầng GraphQL
   → Chỉ làm khi bạn có NHIỀU loại client với nhu cầu KHÁC NHAU,
     và số màn hình nhiều tới mức làm endpoint tổng hợp cho từng cái
     là không xuể.
   → Nhớ kèm DataLoader, depth limit, complexity limit ngay từ đầu.
```

**Câu trả lời phỏng vấn tốt:** *"Em hỏi trước: có bao nhiêu loại client, và nhu cầu dữ liệu của chúng khác nhau tới mức nào? Nếu chỉ có một app mobile thì em làm endpoint tổng hợp cho màn hình đó — rẻ hơn nhiều và giải được vấn đề. GraphQL đáng giá khi có nhiều client với nhu cầu khác hẳn nhau, vì lúc đó chi phí đẻ endpoint cho từng màn hình × từng client mới vượt chi phí dựng GraphQL."*

## Ba lựa chọn khác nên biết tên

```text
① WebSocket    — kênh hai chiều luôn mở. Dùng cho chat, game, bảng giá realtime.
                 Cái giá: server phải giữ trạng thái kết nối → khó scale ngang.

② SSE (Server-Sent Events) — server đẩy một chiều qua HTTP thường.
                 Nhẹ hơn WebSocket nhiều, tự động kết nối lại.
                 Dùng cho: thông báo, tiến độ job, cập nhật trạng thái đơn.

③ Webhook      — ĐẢO NGƯỢC: họ gọi BẠN khi có sự kiện.
                 Dùng cho: cổng thanh toán báo kết quả, GitHub báo push.
                 BẮT BUỘC: xác thực chữ ký, xử lý idempotent (họ sẽ gửi lại),
                 và trả 200 NGAY rồi xử lý ngầm (nếu không họ sẽ timeout + gửi lại).
```

Webhook đáng nói riêng vì rất hay bị làm sai:

```python
@app.post("/webhook/thanh-toan")
async def nhan_webhook(req: Request, x_signature: str = Header(...)):
    body = await req.body()

    # ① XÁC THỰC CHỮ KÝ — so sánh hằng thời gian, không dùng ==
    mong_doi = hmac.new(SECRET, body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(mong_doi, x_signature):
        raise HTTPException(401)

    # ② TRẢ 200 NGAY, đẩy việc thật ra hàng đợi
    #    Nếu xử lý tại đây mà lâu → họ timeout → họ GỬI LẠI → xử lý hai lần
    await queue.push("xu_ly_thanh_toan", body)
    return {"ok": True}         # ← trong vòng vài trăm ms
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chọn GraphQL vì "nghe hiện đại" | Mất cache CDN, thêm hạ tầng, không giải vấn đề nào | Chọn theo số loại client |
| GraphQL không có DataLoader | N+1 hàng nghìn query cho một request | DataLoader, tạo mới mỗi request |
| DataLoader dùng chung toàn cục | **Rò dữ liệu giữa người dùng** | Tạo trong context mỗi request |
| GraphQL công khai không giới hạn độ sâu | Một query làm sập server | `depthLimit` + `complexityLimit` |
| Rate limit GraphQL theo số request | Vô nghĩa — một request có thể kéo cả DB | Tính theo điểm phức tạp |
| Dùng gRPC cho API công khai | Trình duyệt không gọi được, đối tác không debug được | REST ở rìa ngoài |
| REST trả `SELECT *` toàn bộ bảng | Overfetching nặng trên mạng di động | `?fields=` hoặc endpoint tổng hợp |
| Waterfall trên mạng di động | RTT 100 ms × 6 lời gọi = 600 ms | Gộp thành một endpoint màn hình |
| Webhook không xác thực chữ ký | Ai cũng giả được thông báo "đã thanh toán" | HMAC + `compare_digest` |
| Webhook xử lý đồng bộ rồi mới trả 200 | Timeout → họ gửi lại → xử lý nhiều lần | Trả 200 ngay, đẩy ra hàng đợi |
| WebSocket cho thông báo một chiều | Phức tạp không cần thiết, khó scale | SSE nhẹ hơn nhiều |
| Không phiên bản hoá | Không sửa được gì mà không phá client | `/v1` từ ngày đầu |

## Câu hỏi phỏng vấn hay gặp

**H: REST và GraphQL khác gì nhau?**
REST là **nhiều endpoint, mỗi cái một suất cố định** — dẫn tới lấy thừa (trả nhiều hơn cần) và lấy thiếu (phải gọi thêm, tạo waterfall). GraphQL là **một endpoint, client mô tả chính xác dữ liệu mình muốn** — một chuyến đi, không thừa không thiếu. Nhưng cái giá lớn nhất là **mất caching HTTP miễn phí**: REST dùng `GET` với URL cố định nên trình duyệt, CDN, proxy đều cache được; GraphQL dùng `POST` với body khác nhau mỗi lần nên CDN bó tay, bạn phải tự dựng cache ở tầng ứng dụng.

**H: Vấn đề lớn nhất khi triển khai GraphQL là gì?**
**N+1 query**, vì mỗi trường có resolver riêng nên bạn không kiểm soát được vòng lặp — một query trông vô hại có thể sinh hàng nghìn truy vấn database. Cách chữa là **DataLoader**, gom yêu cầu lẻ trong cùng một nhịp event loop thành một truy vấn theo lô; và nó **phải được tạo mới cho mỗi request**, nếu dùng chung toàn cục thì cache sẽ rò dữ liệu giữa các người dùng. Vấn đề thứ hai là **query độc hại**: query lồng sâu hợp lệ về cú pháp nhưng có thể kéo 10¹⁴ bản ghi — nên GraphQL công khai bắt buộc phải có giới hạn độ sâu và điểm phức tạp.

**H: Khi nào dùng gRPC?**
Cho giao tiếp **giữa các dịch vụ nội bộ**, khi cần độ trễ thấp và hợp đồng chặt. Nó nhanh hơn vì Protobuf là nhị phân (nhỏ hơn JSON 3–10 lần, parse nhanh hơn), HTTP/2 ghép kênh nhiều lời gọi trên một kết nối, và schema `.proto` sinh code tự động cho mọi ngôn ngữ. Không dùng cho API công khai vì trình duyệt không gọi thẳng được và định dạng nhị phân thì không `curl` để debug được.

**H: App mobile phàn nàn màn hình tải chậm vì 6 lời gọi API, làm gì?**
Em hỏi trước: **có bao nhiêu loại client và nhu cầu khác nhau tới mức nào?** Nếu chỉ một app thì cách rẻ nhất là làm **endpoint tổng hợp cho màn hình đó** — trả đúng cục dữ liệu màn hình cần trong một chuyến đi. Đó là mẫu BFF thu nhỏ, vài ngày công, không đổi kiến trúc. GraphQL chỉ đáng giá khi có nhiều loại client với nhu cầu khác hẳn nhau, tới mức chi phí đẻ endpoint cho từng màn hình nhân từng client vượt chi phí dựng và vận hành GraphQL.

**H: Webhook cần lưu ý gì?**
Ba thứ. **Xác thực chữ ký** bằng HMAC và so sánh **hằng thời gian** (`compare_digest`), nếu không ai cũng giả được thông báo "đã thanh toán". **Xử lý idempotent**, vì họ chắc chắn sẽ gửi lại. Và **trả 200 ngay rồi đẩy việc thật ra hàng đợi** — nếu xử lý đồng bộ mà lâu, họ sẽ timeout và gửi lại, và bạn xử lý cùng một sự kiện nhiều lần.

## Tóm tắt bài 4

- REST là **nhiều endpoint, suất cố định** → lấy thừa + lấy thiếu + waterfall. GraphQL là **một endpoint, client tự chọn** → hết cả ba.
- Cái giá lớn nhất của GraphQL: **mất caching HTTP/CDN miễn phí**, khó giám sát, và rate limit phải tính theo **điểm phức tạp** chứ không theo số request.
- GraphQL bắt buộc phải có **DataLoader** (chống N+1, tạo mới mỗi request) + **depth limit** + **complexity limit**.
- gRPC thắng ở **giao tiếp nội bộ**: Protobuf nhị phân, HTTP/2 ghép kênh, schema sinh code — nhưng trình duyệt không gọi thẳng được và không debug bằng mắt được.
- **Không ai chọn một**: mẫu phổ biến là `Client → GraphQL/REST → BFF → gRPC → dịch vụ`.
- Trước khi dựng GraphQL, thử hai mức rẻ hơn: **`?fields=`/`?include=`** và **endpoint tổng hợp theo màn hình**.
- Biết thêm ba lựa chọn: **WebSocket** (hai chiều, khó scale), **SSE** (một chiều, nhẹ), **Webhook** (đảo ngược — bắt buộc xác thực chữ ký, idempotent, trả 200 ngay).

**Bài kế tiếp** → [Phase 2, Bài 1: Xác thực và phân quyền — hai câu hỏi khác nhau](../phase-2/01-xac-thuc-va-phan-quyen.md)
