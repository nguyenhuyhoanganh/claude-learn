# Bài 1: NoSQL vs SQL và kiến trúc MongoDB

"NoSQL" là một trong những từ gây hiểu lầm nhất trong ngành. Nó nghe như tên một công nghệ, nhưng thực ra nó chỉ có nghĩa **"không phải quan hệ"** — một định nghĩa theo phủ định, gộp chung những thứ khác nhau hoàn toàn:

```text
   NoSQL bao gom:
     • Kho tai lieu    (MongoDB, CouchDB)
     • Kho khoa-gia tri (Redis, DynamoDB, Memcached)
     • Kho cot rong     (Cassandra, HBase)
     • Co so du lieu do thi (Neo4j, Neptune)
     • Chuoi thoi gian  (InfluxDB, TimescaleDB)

   → Bon nhom dau khac nhau nhieu hon so voi khac PostgreSQL.
```

Bài này gạt bỏ khẩu hiệu tiếp thị và đi vào những khác biệt **thật sự** về mặt kỹ thuật.

## Hai điều "NoSQL nhanh hơn" thường có nghĩa

Câu "NoSQL nhanh hơn SQL" gần như luôn là một trong hai điều dưới đây — và cả hai đều không phải "công nghệ tốt hơn":

```text
   1. NO LAM IT VIEC HON
      Khong kiem tra khoa ngoai
      Khong dam bao ACID xuyen nhieu ban ghi
      Khong toi uu truy van phuc tap
      → Nhanh hon vi HUA IT HON, khong phai vi tai hon

   2. MO HINH DU LIEU KHOP VOI MAU TRUY CAP
      Doc mot ho so nguoi dung day du:
        SQL   : JOIN 5 bang → 5 lan tra index
        MongoDB: doc MOT tai lieu → 1 lan tra index
      → Nhanh hon vi LUU DU LIEU THEO CACH BAN DOC NO
```

Điều thứ hai mới là lý do chính đáng để chọn NoSQL. Và nó **cũng làm được trong SQL** — bằng cách phi chuẩn hoá hoặc dùng `jsonb`.

---

## Khác biệt thật giữa hai mô hình

### Chuẩn hoá vs nhúng

```text
   SQL — CHUAN HOA
   ═══════════════
   users        (id, name, email)
   addresses    (id, user_id, street, city)
   orders       (id, user_id, total)
   order_items  (id, order_id, product_id, qty)

   Lay ho so day du → JOIN 4 bang


   MONGODB — NHUNG
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

   Lay ho so day du → doc MOT tai lieu
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
   Nhung ten san pham vao moi don hang.
   San pham doi ten → phai cap nhat TRIEU tai lieu don hang.

   Va neu job cap nhat chet giua chung → mot nua co ten cu,
   mot nua co ten moi, KHONG CO CACH NAO BIET.
```

### Khi nào nhúng, khi nào tham chiếu

```text
   NHUNG khi:
     ✔ Du lieu con LUON duoc doc cung du lieu cha
     ✔ Quan he 1-1 hoac 1-N voi N NHO va CO GIOI HAN
     ✔ Du lieu con it thay doi
     ✔ Du lieu con khong duoc truy van doc lap

   THAM CHIEU khi:
     ✔ N lon hoac khong gioi han (binh luan cua mot bai viet)
     ✔ Du lieu con thay doi thuong xuyen
     ✔ Du lieu con duoc nhieu cha dung chung
     ✔ Du lieu con duoc truy van doc lap
```

Ví dụ áp dụng:

```text
   Dia chi cua nguoi dung        →  NHUNG (it, luon doc cung, it doi)
   Binh luan cua bai viet        →  THAM CHIEU (khong gioi han)
   Danh muc san pham             →  THAM CHIEU (nhieu don hang dung chung)
   Anh chup gia luc dat hang     →  NHUNG (co CHU DICH giu gia LUC DO)
```

Dòng cuối là một mẫu quan trọng: đôi khi bạn **cố ý** nhúng một bản sao vì bạn muốn giữ **giá trị tại thời điểm đó**, không phải giá trị hiện tại. Đơn hàng phải giữ giá lúc mua, kể cả khi sản phẩm đổi giá sau này.

---

## Kiến trúc MongoDB

### WiredTiger — engine bên dưới

Từ MongoDB 3.2, engine mặc định là **WiredTiger**:

```text
   • B+Tree (co the cau hinh LSM, nhung hiem dung)
   • MVCC — nguoi doc khong chan nguoi ghi
   • Nen: Snappy (mac dinh), zlib, zstd
   • Nen tien to cho index
   • Checkpoint moi 60 giay
   • Journal (WAL) fsync moi 100 ms
```

Dòng cuối đáng chú ý: mặc định MongoDB `fsync` journal **mỗi 100 mili-giây**, nghĩa là có thể mất tới 100 ms giao dịch cuối khi máy chết đột ngột — trừ khi bạn yêu cầu `j: true` cho từng lệnh ghi.

### Khoá và đồng thời

```text
   MongoDB 3.0+  →  khoa muc TAI LIEU (tuong duong khoa dong)
   Truoc do      →  khoa muc COLLECTION, roi muc DATABASE
                    → day la nguon goc cua danh tieng xau ve hieu nang
```

### `writeConcern` — nút vặn độ bền

Đây là khái niệm quan trọng nhất khi dùng MongoDB nghiêm túc:

```javascript
db.orders.insertOne(doc, { writeConcern: { w: 1 } })
// → chi cho PRIMARY xac nhan.  Primary chet → CO THE MAT

db.orders.insertOne(doc, { writeConcern: { w: "majority" } })
// → cho DA SO nut xac nhan.  An toan truoc failover

db.orders.insertOne(doc, { writeConcern: { w: "majority", j: true } })
// → cho da so nut GHI JOURNAL XUONG DIA.  Ben nhat
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
// Doc tu dau
db.orders.find().readPref("primary")            // luon moi nhat
db.orders.find().readPref("secondary")          // co the CU
db.orders.find().readPref("nearest")            // do tre thap nhat

// Doc muc dam bao nao
db.orders.find().readConcern("local")           // co the doc du lieu SE BI ROLLBACK
db.orders.find().readConcern("majority")        // chi doc du lieu da duoc da so xac nhan
db.orders.find().readConcern("linearizable")    // manh nhat, cham nhat
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
   • CHAM hon dang ke so voi thao tac mot tai lieu
   • Gioi han thoi gian mac dinh: 60 GIAY
   • Yeu cau replica set (khong chay tren mot nut don le)
   • Tai liệu MongoDB KHUYEN NGHI thiet ke de KHONG CAN transaction
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
   COLLECTION THUONG                  CLUSTERED COLLECTION
   ════════════════                   ════════════════════
   Index _id  →  RecordId  →  Tai lieu   Tai lieu nam LUON o la cua
     hai buoc                             index _id
                                          → MOT buoc
```

Chính xác là ý tưởng clustered index của InnoDB ([phase-3 bài 3](../phase-3/03-primary-key-vs-secondary-key.md)), và nó mang theo **đúng những đánh đổi cũ**:

```text
   ✔ Tra theo _id nhanh hon (mot buoc)
   ✔ Quet theo thu tu _id tuan tu
   ✔ It ton dia hon (khong luu index _id rieng)
   ✘ Index PHU tro nen dat hon (phai qua _id)
   ✘ _id ngau nhien → tach page lien tuc
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
  ('{"name":"Ao thun","price":150000,"tags":["thoi trang","nam"]}');

-- Truy van theo truong ben trong
SELECT data->>'name' FROM products WHERE data @> '{"tags":["nam"]}';

-- Index cho mot truong cu the
CREATE INDEX idx_price ON products (((data->>'price')::INT));
```

```text
   → Duoc cau truc linh hoat cua tai lieu
   → VA giu duoc JOIN, transaction, khoa ngoai, SQL
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
// MongoDB: khong co khoa ngoai
db.orders.insertOne({ user_id: ObjectId("...") })   // user nay co ton tai khong?
db.users.deleteOne({ _id: ObjectId("...") })        // don hang tro vao hu vo
```

```text
   Bai toan KHONG BIEN MAT khi bo khoa ngoai.
   No chi CHUYEN CHO: tu database sang UNG DUNG.

   Va ung dung thi:
     • quen kiem tra o mot duong code nao do
     • chet giua chung khi dang xoa
     • co nhieu dich vu cung ghi, moi dich vu kiem tra khac nhau
```

Nếu dùng MongoDB, phải có **job đối soát** tìm dữ liệu mồ côi:

```javascript
db.orders.aggregate([
  { $lookup: { from: "users", localField: "user_id",
               foreignField: "_id", as: "u" } },
  { $match: { u: { $size: 0 } } },        // don hang tro toi user KHONG TON TAI
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
