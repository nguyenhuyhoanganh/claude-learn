# Bài 1: NoSQL vs SQL và kiến trúc MongoDB

"NoSQL" là một trong những từ gây hiểu lầm nhất trong ngành. Nó nghe như tên một công nghệ, nhưng thực ra nó chỉ có nghĩa **"không phải quan hệ"** — một định nghĩa theo phủ định, gộp chung những thứ khác nhau hoàn toàn:

```text
   NoSQL bao gồm:
     • Kho tài liệu    (MongoDB, CouchDB)
     • Kho khoá-giá trị (Redis, DynamoDB, Memcached)
     • Kho cột rộng     (Cassandra, HBase)
     • Cơ sở dữ liệu đồ thị (Neo4j, Neptune)
     • Chuỗi thời gian  (InfluxDB, TimescaleDB)

   → Bốn nhóm đầu khác nhau nhiều hơn so với khác PostgreSQL.
```

Bài này gạt bỏ khẩu hiệu tiếp thị và đi vào những khác biệt **thật sự** về mặt kỹ thuật.

## Hai điều "NoSQL nhanh hơn" thường có nghĩa

Câu "NoSQL nhanh hơn SQL" gần như luôn là một trong hai điều dưới đây — và cả hai đều không phải "công nghệ tốt hơn":

```text
   1. NÓ LÀM ÍT VIỆC HƠN
      Không kiểm tra khoá ngoại
      Không đảm bảo ACID xuyên nhiều bản ghi
      Không tối ưu truy vấn phức tạp
      → Nhanh hơn vì HỨA ÍT HƠN, không phải vì tài hơn

   2. MÔ HÌNH DỮ LIỆU KHỚP VỚI MẪU TRUY CẬP
      Đọc một hồ sơ người dùng đầy đủ:
        SQL   : JOIN 5 bảng → 5 lần tra index
        MongoDB: đọc MỘT tài liệu → 1 lần tra index
      → Nhanh hơn vì LƯU DỮ LIỆU THEO CÁCH BẠN ĐỌC NÓ
```

Điều thứ hai mới là lý do chính đáng để chọn NoSQL. Và nó **cũng làm được trong SQL** — bằng cách phi chuẩn hoá hoặc dùng `jsonb`.

---

## Khác biệt thật giữa hai mô hình

### Chuẩn hoá vs nhúng

```text
   SQL — CHUẨN HOÁ
   ═══════════════
   users        (id, name, email)
   addresses    (id, user_id, street, city)
   orders       (id, user_id, total)
   order_items  (id, order_id, product_id, qty)

   Lấy hồ sơ đầy đủ → JOIN 4 bảng


   MONGODB — NHÚNG
   ═══════════════
   {
     _id: 1,
     name: "An",
     email: "an@x.com",
     addresses: [ { street: "12 Ly Thuong Kiet", city: "Ha Noi" } ],
     orders: [
       { total: 500000, items: [ { product: "ao", qty: 2 } ] }
     ]
   }

   Lấy hồ sơ đầy đủ → đọc MỘT tài liệu
```

Đánh đổi hiện ra ngay:

| | Chuẩn hoá (SQL) | Nhúng (tài liệu) |
|---|---|---|
| Đọc cả cụm | `JOIN` nhiều bảng | **Một lần đọc** |
| Đọc một phần | Chỉ lấy bảng cần | Vẫn đọc cả tài liệu |
| Cập nhật dữ liệu lặp | **Một chỗ** | Phải sửa **mọi tài liệu** chứa nó |
| Truy vấn theo chiều khác | `JOIN` ngược lại, dễ dàng | Rất khó |
| Toàn vẹn tham chiếu | Database giữ giúp | **Ứng dụng tự lo** |
| Giới hạn kích thước | Không (bảng riêng) | **16 MB mỗi tài liệu** (MongoDB) |

Dòng "cập nhật dữ liệu lặp" là chỗ mô hình nhúng đau nhất:

```text
   Nhúng tên sản phẩm vào mọi đơn hàng.
   Sản phẩm đổi tên → phải cập nhật TRIỆU tài liệu đơn hàng.

   Và nếu job cập nhật chết giữa chừng → một nửa có tên cũ,
   một nửa có tên mới, KHÔNG CÓ CÁCH NÀO BIẾT.
```

### Khi nào nhúng, khi nào tham chiếu

```text
   NHÚNG khi:
     ✔ Dữ liệu con LUÔN được đọc cùng dữ liệu cha
     ✔ Quan hệ 1-1 hoặc 1-N với N NHỎ và CÓ GIỚI HẠN
     ✔ Dữ liệu con ít thay đổi
     ✔ Dữ liệu con không được truy vấn độc lập

   THAM CHIẾU khi:
     ✔ N lớn hoặc không giới hạn (bình luận của một bài viết)
     ✔ Dữ liệu con thay đổi thường xuyên
     ✔ Dữ liệu con được nhiều cha dùng chung
     ✔ Dữ liệu con được truy vấn độc lập
```

Ví dụ áp dụng:

```text
   Địa chỉ của người dùng        →  NHÚNG (ít, luôn đọc cùng, ít đổi)
   Bình luận của bài viết        →  THAM CHIẾU (không giới hạn)
   Danh mục sản phẩm             →  THAM CHIẾU (nhiều đơn hàng dùng chung)
   Ảnh chụp giá lúc đặt hàng     →  NHÚNG (có CHỦ ĐÍCH giữ giá LÚC ĐÓ)
```

Dòng cuối là một mẫu quan trọng: đôi khi bạn **cố ý** nhúng một bản sao vì bạn muốn giữ **giá trị tại thời điểm đó**, không phải giá trị hiện tại. Đơn hàng phải giữ giá lúc mua, kể cả khi sản phẩm đổi giá sau này.

---

## Kiến trúc MongoDB

### WiredTiger — engine bên dưới

Từ MongoDB 3.2, engine mặc định là **WiredTiger**:

```text
   • B+Tree (có thể cấu hình LSM, nhưng hiếm dùng)
   • MVCC — người đọc không chặn người ghi
   • Nén: Snappy (mặc định), zlib, zstd
   • Nén tiền tố cho index
   • Checkpoint mỗi 60 giây
   • Journal (WAL) fsync mỗi 100 ms
```

Dòng cuối đáng chú ý: mặc định MongoDB `fsync` journal **mỗi 100 mili-giây**, nghĩa là có thể mất tới 100 ms giao dịch cuối khi máy chết đột ngột — trừ khi bạn yêu cầu `j: true` cho từng lệnh ghi.

### Khoá và đồng thời

```text
   MongoDB 3.0+  →  khoá mức TÀI LIỆU (tương đương khoá dòng)
   Trước đó      →  khoá mức COLLECTION, rồi mức DATABASE
                    → đây là nguồn gốc của danh tiếng xấu về hiệu năng
```

### `writeConcern` — nút vặn độ bền

Đây là khái niệm quan trọng nhất khi dùng MongoDB nghiêm túc:

```javascript
db.orders.insertOne(doc, { writeConcern: { w: 1 } })
// → chỉ chờ PRIMARY xác nhận.  Primary chết → CÓ THỂ MẤT

db.orders.insertOne(doc, { writeConcern: { w: "majority" } })
// → chờ ĐA SỐ nút xác nhận.  An toàn trước failover

db.orders.insertOne(doc, { writeConcern: { w: "majority", j: true } })
// → chờ đa số nút GHI JOURNAL XUỐNG ĐĨA.  Bền nhất
```

| `writeConcern` | Mất dữ liệu khi | Tốc độ |
|---|---|---|
| `w: 0` | Gần như mọi sự cố | Nhanh nhất |
| `w: 1` | Primary chết trước khi nhân bản | Nhanh |
| `w: "majority"` | Gần như không | Vừa |
| `w: "majority", j: true` | Không | Chậm nhất |

Từ MongoDB 5.0, `w: "majority"` là **mặc định** — trước đó là `w: 1`, và đó là nguồn gốc của nhiều câu chuyện mất dữ liệu.

### `readConcern` và `readPreference`

```javascript
// Đọc từ đâu
db.orders.find().readPref("primary")            // luôn mới nhất
db.orders.find().readPref("secondary")          // có thể CŨ
db.orders.find().readPref("nearest")            // độ trễ thấp nhất

// Đọc mức đảm bảo nào
db.orders.find().readConcern("local")           // có thể đọc dữ liệu SẼ BỊ ROLLBACK
db.orders.find().readConcern("majority")        // chỉ đọc dữ liệu đã được đa số xác nhận
db.orders.find().readConcern("linearizable")    // mạnh nhất, chậm nhất
```

Dòng `readConcern("local")` chứa một cái bẫy tinh vi: nó có thể trả về dữ liệu mà **sau này bị rollback** khi có chuyển đổi primary. Với dữ liệu quan trọng, phải dùng `majority`.

### Transaction — có, nhưng đắt

MongoDB 4.0 thêm transaction nhiều tài liệu:

```javascript
const session = client.startSession();
session.startTransaction();
try {
    await accounts.updateOne({_id: 1}, {$inc: {balance: -100}}, {session});
    await accounts.updateOne({_id: 2}, {$inc: {balance: +100}}, {session});
    await session.commitTransaction();
} catch (e) {
    await session.abortTransaction();
    throw e;
}
```

Nhưng cần biết:

```text
   • CHẬM hơn đáng kể so với thao tác một tài liệu
   • Giới hạn thời gian mặc định: 60 GIÂY
   • Yêu cầu replica set (không chạy trên một nút đơn lẻ)
   • Tài liệu MongoDB KHUYẾN NGHỊ thiết kế để KHÔNG CẦN transaction
```

Dòng cuối là lời khuyên chân thành: nếu bạn thấy mình cần transaction nhiều tài liệu thường xuyên trên MongoDB, có thể mô hình dữ liệu đang sai — hoặc bạn nên dùng database quan hệ.

---

## Collection gom cụm — MongoDB mượn ý tưởng của InnoDB

Từ MongoDB 5.3, có **clustered collection**:

```javascript
db.createCollection("events", {
    clusteredIndex: { key: { _id: 1 }, unique: true }
})
```

```text
   COLLECTION THƯỜNG                  CLUSTERED COLLECTION
   ════════════════                   ════════════════════
   Index _id  →  RecordId  →  Tài liệu   Tài liệu nằm LUÔN ở lá của
     hai bước                             index _id
                                          → MỘT bước
```

Chính xác là ý tưởng clustered index của InnoDB ([phase-3 bài 3](../phase-3/03-primary-key-vs-secondary-key.md)), và nó mang theo **đúng những đánh đổi cũ**:

```text
   ✔ Tra theo _id nhanh hơn (một bước)
   ✔ Quét theo thứ tự _id tuần tự
   ✔ Ít tốn đĩa hơn (không lưu index _id riêng)
   ✘ Index PHỤ trở nên đắt hơn (phải qua _id)
   ✘ _id ngẫu nhiên → tách page liên tục
```

Hợp nhất với dữ liệu chuỗi thời gian, nơi `_id` tăng dần theo thời gian.

---

## Bảng so sánh thẳng thắn

| | PostgreSQL | MongoDB |
|---|---|---|
| Mô hình | Bảng quan hệ | Tài liệu BSON |
| Cấu trúc cố định | **Có** (nhưng `jsonb` linh hoạt được) | Không |
| `JOIN` | **Mạnh, tối ưu tốt** | `$lookup` — có nhưng yếu hơn nhiều |
| Transaction | **Mặc định, rẻ** | Có nhưng đắt |
| Ràng buộc | Khoá ngoại, `CHECK`, `UNIQUE` | Chỉ `UNIQUE` và JSON Schema |
| Mở rộng ngang | Thủ công hoặc Citus | **Sharding tích hợp sẵn** |
| Truy vấn tự do | **SQL — rất mạnh** | Ngôn ngữ truy vấn riêng, yếu hơn |
| Tổng hợp | `GROUP BY`, window function | Aggregation pipeline (mạnh nhưng khó) |
| Nhất quán mặc định | **Mạnh** | Cấu hình được (mặc định mạnh từ 5.0) |
| Dữ liệu địa lý | PostGIS — tốt nhất ngành | Tốt |
| Toàn văn | Tốt | Tốt |
| Vận hành | Đơn giản hơn | Phức tạp hơn (replica set, config server) |

### PostgreSQL cũng làm được tài liệu

Điều nhiều người không biết: `jsonb` của PostgreSQL cho phép mô hình tài liệu **kèm** mọi thứ của quan hệ.

```sql
CREATE TABLE products (
    id   BIGSERIAL PRIMARY KEY,
    data JSONB NOT NULL
);

CREATE INDEX idx_products_data ON products USING GIN (data);

INSERT INTO products (data) VALUES
  ('{"name":"Áo thun","price":150000,"tags":["thời trang","nam"]}');

-- Truy vấn theo trường bên trong
SELECT data->>'name' FROM products WHERE data @> '{"tags":["nam"]}';

-- Index cho một trường cụ thể
CREATE INDEX idx_price ON products (((data->>'price')::INT));
```

```text
   → Được cấu trúc linh hoạt của tài liệu
   → VÀ giữ được JOIN, transaction, khoá ngoại, SQL
```

Đây là lý do câu hỏi "SQL hay NoSQL" thường là câu hỏi sai. Câu hỏi đúng: *"mẫu truy cập của tôi là gì?"*

---

## Chọn cái nào

| Tình huống | Nên chọn |
|---|---|
| Dữ liệu có quan hệ rõ ràng, cần `JOIN` | **Quan hệ** |
| Cần transaction xuyên nhiều thực thể | **Quan hệ** |
| Cấu trúc thay đổi liên tục, mỗi bản ghi khác nhau | **Tài liệu** (hoặc `jsonb`) |
| Đọc cả cụm dữ liệu như một khối | **Tài liệu** |
| Cần mở rộng ngang sẵn có, không muốn tự làm | **Tài liệu / kho khoá-giá trị** |
| Truy vấn phân tích tự do | **Quan hệ** (hoặc kho cột) |
| Cache, phiên, hàng đợi | **Kho khoá-giá trị** |
| Dữ liệu chuỗi thời gian, ghi cực nhiều | **Chuỗi thời gian / kho cột rộng** |
| Đội chưa có kinh nghiệm vận hành phân tán | **Quan hệ** |

Lời khuyên thực dụng nhất:

> **Bắt đầu bằng PostgreSQL.** Nó làm được quan hệ, tài liệu (`jsonb`), khoá-giá trị (`hstore`), địa lý (PostGIS), toàn văn, chuỗi thời gian (TimescaleDB) và hàng đợi. Chỉ chuyển sang hệ chuyên dụng khi đo được rằng PostgreSQL không đáp ứng được.

---

## Vấn đề toàn vẹn tham chiếu vẫn tồn tại

Đây là điều [phase-2 bài 4](../phase-2/04-consistency-va-eventual-consistency.md) đã cảnh báo, nhắc lại vì rất quan trọng:

```javascript
// MongoDB: không có khoá ngoại
db.orders.insertOne({ user_id: ObjectId("...") })   // user này có tồn tại không?
db.users.deleteOne({ _id: ObjectId("...") })        // đơn hàng trỏ vào hư vô
```

```text
   Bài toán KHÔNG BIẾN MẤT khi bỏ khoá ngoại.
   Nó chỉ CHUYỂN CHỖ: từ database sang ỨNG DỤNG.

   Và ứng dụng thì:
     • quên kiểm tra ở một đường code nào đó
     • chết giữa chừng khi đang xoá
     • có nhiều dịch vụ cùng ghi, mỗi dịch vụ kiểm tra khác nhau
```

Nếu dùng MongoDB, phải có **job đối soát** tìm dữ liệu mồ côi:

```javascript
db.orders.aggregate([
  { $lookup: { from: "users", localField: "user_id",
               foreignField: "_id", as: "u" } },
  { $match: { u: { $size: 0 } } },        // đơn hàng trỏ tới user KHÔNG TỒN TẠI
  { $count: "so_don_mo_coi" }
])
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chọn NoSQL vì "nhanh hơn" | Nhanh hơn vì hứa ít hơn, không phải vì tài hơn | Đối chiếu mẫu truy cập, không nghe khẩu hiệu |
| Nhúng dữ liệu không giới hạn | Tài liệu vượt 16 MB → không ghi được nữa | Tham chiếu khi N không giới hạn |
| Nhúng dữ liệu hay thay đổi | Sửa một chỗ phải cập nhật hàng triệu tài liệu | Tham chiếu; hoặc nhúng có chủ đích để giữ ảnh chụp |
| Dùng `w: 1` cho dữ liệu quan trọng | Mất dữ liệu khi chuyển đổi primary | `w: "majority"` |
| Dùng `readConcern: "local"` cho dữ liệu quan trọng | Đọc phải dữ liệu sau này bị rollback | `readConcern: "majority"` |
| Dùng transaction MongoDB thường xuyên | Chậm, giới hạn 60 giây | Thiết kế lại mô hình, hoặc dùng database quan hệ |
| Bỏ khoá ngoại rồi quên đối soát | Dữ liệu mồ côi tích tụ âm thầm | Job đối soát định kỳ |
| Nghĩ phải chọn giữa SQL và tài liệu | `jsonb` cho cả hai | Bắt đầu bằng PostgreSQL |

## Tóm tắt bài 1

- **"NoSQL" là định nghĩa theo phủ định** — nó gộp bốn nhóm công nghệ khác nhau nhiều hơn cả khác PostgreSQL.
- "NoSQL nhanh hơn" luôn có nghĩa một trong hai: **nó làm ít việc hơn**, hoặc **mô hình dữ liệu khớp với mẫu truy cập**. Chỉ điều thứ hai là lý do chính đáng — và SQL cũng làm được.
- **Nhúng** khi dữ liệu con luôn đọc cùng cha, số lượng có giới hạn, và ít thay đổi. **Tham chiếu** khi ngược lại. Ngoại lệ: nhúng **có chủ đích** để giữ ảnh chụp giá trị tại thời điểm.
- **`writeConcern`** là nút vặn quan trọng nhất của MongoDB. `w: 1` có thể mất dữ liệu khi chuyển đổi primary; `w: "majority"` là mặc định từ 5.0.
- **`readConcern: "local"`** có thể trả về dữ liệu **sau này bị rollback** — dùng `majority` cho dữ liệu quan trọng.
- MongoDB **có** transaction từ 4.0 nhưng đắt, giới hạn 60 giây, và chính tài liệu MongoDB khuyến nghị thiết kế để **không cần** nó.
- **Clustered collection** (5.3+) chính là clustered index của InnoDB — kèm đúng những đánh đổi cũ.
- **`jsonb` của PostgreSQL cho mô hình tài liệu kèm `JOIN`, transaction và khoá ngoại** — nên câu hỏi "SQL hay NoSQL" thường là câu hỏi sai.
- **Bài toán toàn vẹn tham chiếu không biến mất khi bỏ khoá ngoại** — nó chỉ chuyển từ database sang ứng dụng, và bạn phải tự viết job đối soát.

**Bài kế tiếp** → [Bài 2: Kiến trúc Memcached](02-memcached-architecture.md)
