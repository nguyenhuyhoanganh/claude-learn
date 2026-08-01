# Bài 1: Frontend, Backend, Database — ai làm gì và vì sao

Website của bạn đẹp lung linh. Nút "Mua hàng" bóng bẩy. Khách bấm mua, và màn hình quay vòng mãi mãi. **Một nghìn đơn hàng mất sạch.**

Đội thiết kế đổ lỗi cho đội máy chủ. Đội máy chủ chỉ ngược lại giao diện. Vậy rốt cuộc ai sai?

Muốn trả lời được, bạn phải hiểu **hai thế giới** — và ranh giới giữa chúng. Đây cũng là câu hỏi mở màn của gần như mọi buổi phỏng vấn backend, và cách bạn vẽ ra ranh giới đó nói lên rất nhiều điều.

## Giải nghĩa thuật ngữ trước khi bắt đầu

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Client** | clai-ơn | **Máy khách** — thiết bị của người dùng (trình duyệt, app điện thoại) |
| **Server** | sơ-vơ | **Máy chủ** — máy tính luôn bật, đặt ở trung tâm dữ liệu, phục vụ nhiều người |
| **Frontend** | phron-en | **Phần đầu** — phần chạy trên máy khách, người dùng nhìn thấy |
| **Backend** | bec-en | **Phần sau** — phần chạy trên máy chủ, người dùng không nhìn thấy |
| **Database** | đây-ta-beis | **Cơ sở dữ liệu** — chương trình chuyên lưu và bảo vệ dữ liệu |
| **API** | ây-pi-ai | **Giao diện lập trình ứng dụng** — cách hai phần mềm nói chuyện với nhau |
| **Request / Response** | | **Yêu cầu / Phản hồi** — một lượt hỏi và một lượt trả lời |
| **Render** | ren-đơ | **Kết xuất** — biến dữ liệu thành hình ảnh trên màn hình |
| **Deploy** | đi-ploi | **Triển khai** — đưa code lên máy chủ để chạy thật |

## Ẩn dụ nhà hàng — dùng suốt cả khoá

```text
   ┌──────────────────────────────────────────────────────────┐
   │                        NHÀ HÀNG                          │
   │                                                          │
   │   PHÒNG ĂN            NGƯỜI PHỤC VỤ         CĂN BẾP      │
   │   (khách ngồi)        (chạy qua lại)     (nấu, kho hàng) │
   │        │                    │                   │        │
   │   ═════▼════════       ═════▼══════        ═════▼══════  │
   │    FRONTEND              API                BACKEND      │
   │                                                │         │
   │                                          ┌─────▼──────┐  │
   │                                          │  KHO THỰC  │  │
   │                                          │   PHẨM     │  │
   │                                          │  DATABASE  │  │
   │                                          └────────────┘  │
   └──────────────────────────────────────────────────────────┘

   Khách KHÔNG được xông thẳng vào bếp.
   Khách gọi món qua người phục vụ, và chỉ gọi được món có trên thực đơn.
```

**Tờ thực đơn chính là tài liệu API**: nó ghi rõ bạn được gọi món gì, gọi bằng cách nào, và sẽ nhận lại thứ gì. Bạn không thể gọi món ngoài thực đơn — đó là **hợp đồng** giữa hai bên.

## Frontend: bộ mặt, và hai điểm yếu chí mạng

**Frontend** là toàn bộ phần chạy **trên máy của người dùng**: HTML (khung sườn), CSS (trang trí), JavaScript (hành vi).

```text
Người dùng bấm chuột phải → "Xem nguồn trang" (View Source)
→ Họ ĐỌC ĐƯỢC TOÀN BỘ code frontend của bạn.
```

Từ sự thật đó sinh ra **hai điểm yếu không thể khắc phục**:

### Điểm yếu 1: ai cũng đọc được code

```javascript
// ❌ THẢM HOẠ — hacker chỉ cần mở DevTools là thấy
const API_KEY = "sk_live_51HxYz...";        // khoá bí mật phơi ra
const GIA_GOC = 500000;
if (maGiamGia === "SALE50") giaCuoi = GIA_GOC * 0.5;   // logic tính tiền
```

Người dùng chỉ cần sửa biến trong DevTools là mua được hàng giá 0 đồng.

### Điểm yếu 2: không giữ được dữ liệu lâu dài và đáng tin

`localStorage` của trình duyệt xoá được, sửa được, và chỉ nằm trên đúng một máy. Đăng nhập ở điện thoại thì máy tính không biết gì.

```text
NGUYÊN TẮC VÀNG, không có ngoại lệ:

   Kiểm tra ở frontend  =  kiểm tra CHO VUI (để báo lỗi đẹp cho người dùng)
   Kiểm tra ở backend   =  kiểm tra THẬT   (để bảo vệ hệ thống)

   Mọi thứ liên quan tới TIỀN, QUYỀN, và BÍ MẬT
   → tuyệt đối không giao cho trình duyệt.
```

### Tình huống thực tế và cách xử lý

> **Tình huống:** Form đăng ký có kiểm tra `email` hợp lệ và `mật khẩu ≥ 8 ký tự` bằng JavaScript. Một tuần sau, database có 3.000 tài khoản email rác và mật khẩu 1 ký tự.

**Chuyện gì xảy ra:** Kẻ tấn công không dùng trình duyệt. Họ gọi thẳng API bằng `curl` hoặc Postman, bỏ qua toàn bộ JavaScript của bạn.

```bash
curl -X POST https://api.shop.vn/dang-ky \
  -H "Content-Type: application/json" \
  -d '{"email":"aaa","password":"1"}'
```

**Cách xử lý — kiểm ở cả hai tầng, với hai mục đích khác nhau:**

```javascript
// Frontend: báo lỗi NGAY, không cần chờ mạng → trải nghiệm tốt
if (password.length < 8) {
    hienLoi("Mật khẩu phải từ 8 ký tự");
    return;                       // chỉ để người dùng đỡ mất công gửi
}
```

```python
# Backend: KIỂM TRA THẬT — đây mới là hàng rào
from pydantic import BaseModel, EmailStr, constr

class DangKyRequest(BaseModel):
    email: EmailStr                          # thư viện tự kiểm định dạng
    password: constr(min_length=8, max_length=128)

@app.post("/dang-ky")
def dang_ky(req: DangKyRequest):             # sai định dạng → tự trả 422
    ...
```

```sql
-- Database: LỚP CUỐI CÙNG — kể cả script chạy tay cũng không lách được
ALTER TABLE users
  ADD CONSTRAINT ck_email CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$'),
  ADD CONSTRAINT uq_email UNIQUE (email);
```

**Ba tầng, ba mục đích:** frontend cho **trải nghiệm**, backend cho **bảo vệ**, database cho **đảm bảo**.

## Backend: bộ não, và ba việc sống còn

**Backend** chạy trên máy chủ — một máy tính luôn bật, đặt ở đâu đó trên thế giới, người dùng không bao giờ nhìn thấy.

Nó gánh ba việc mà **tuyệt đối không thể giao cho trình duyệt**:

```text
① XÁC THỰC (Authentication)   — "Bạn là ai?"
     So mật khẩu với bản băm trong database. Khớp thì mở cửa.

② PHÂN QUYỀN (Authorization)  — "Bạn được làm gì?"
     Người này có được xem đơn hàng của người kia không?

③ LOGIC NGHIỆP VỤ (Business logic) — luật của công ty
     Tính tiền, trừ kho, áp mã giảm giá, gửi email, tính hoa hồng.
```

### Tình huống thực tế và cách xử lý

> **Tình huống:** Trang chi tiết đơn hàng có URL `/don-hang/1042`. Một khách đổi thành `/don-hang/1043` và xem được đơn của người lạ — kèm địa chỉ và số điện thoại.

Lỗi này có tên: **IDOR** (*Insecure Direct Object Reference* — tham chiếu đối tượng trực tiếp không an toàn). Nó nằm trong top rủi ro của OWASP và cực kỳ phổ biến.

**Nguyên nhân:** backend đã **xác thực** đúng (biết bạn là ai) nhưng **quên phân quyền** (không kiểm bạn có được xem cái đó không).

```python
# ❌ SAI — chỉ kiểm đăng nhập, không kiểm quyền sở hữu
@app.get("/don-hang/{order_id}")
def xem_don(order_id: int, user = Depends(dang_nhap)):
    return db.query("SELECT * FROM orders WHERE order_id = %s", order_id)

# ✅ ĐÚNG — quyền sở hữu nằm ngay trong điều kiện WHERE
@app.get("/don-hang/{order_id}")
def xem_don(order_id: int, user = Depends(dang_nhap)):
    don = db.query(
        "SELECT * FROM orders WHERE order_id = %s AND customer_id = %s",
        order_id, user.id            # ◄── không tìm thấy = không có quyền
    )
    if not don:
        raise HTTPException(404)     # trả 404, KHÔNG trả 403
    return don
```

Chi tiết nhỏ nhưng quan trọng: trả **404 Not Found** thay vì **403 Forbidden**. Trả 403 là đang nói *"đơn này có tồn tại, nhưng bạn không được xem"* — kẻ tấn công dùng chính điều đó để dò xem đơn nào tồn tại.

## Database: kho, và vì sao không dùng file

**Database** không phải một cái bảng. Nó là **một chương trình đang chạy**, ngồi canh một đống dữ liệu, và không cho ai chạm vào trực tiếp. Đúng nghĩa đen: một phần mềm làm bảo vệ.

```text
FILE (Excel, JSON, CSV):
   Một cục dữ liệu nằm chết trên ổ đĩa.
   Ai mở được file, người đó làm chủ nó.
   Không ai đứng giữa cả.

DATABASE:
   Bạn KHÔNG chạm vào dữ liệu.
   Bạn gửi một yêu cầu bằng SQL rồi XIN PHÉP nó.
   Nó đọc yêu cầu, kiểm tra luật, rồi mới quyết định cho hay không.
```

Từ chỗ "phải xin phép" mọc ra ba quyền lực mà file không bao giờ có: **luật** (ràng buộc kiểu dữ liệu, không cho tồn kho âm), **khoá** (hai người cùng sửa thì xếp hàng, không đè lên nhau), và **mục lục** (index — tìm một dòng trong triệu dòng trong vài mili giây).

> Ba quyền lực này được giải thích chi tiết trong khoá SQL. Ở đây chỉ cần nhớ ranh giới: **database là nơi giữ sự thật, backend là nơi quyết định ai được chạm vào sự thật đó.**

## Kiến trúc và cách hoạt động: một lần bấm nút, chuyện gì xảy ra

Đây là phần quan trọng nhất của bài. Hãy theo dõi một lượt bấm "Mua hàng" đi qua từng chặng:

```text
①  NGƯỜI DÙNG bấm nút trên trình duyệt
    │
    │  JavaScript bắt sự kiện click, đóng gói dữ liệu thành JSON
    ▼
②  TRÌNH DUYỆT tra tên miền → địa chỉ IP        [DNS lookup, ~20ms]
    │
    ▼
③  BẮT TAY TLS — thiết lập kênh mã hoá           [TLS handshake, ~50ms]
    │  Từ giây này, người ngồi giữa không đọc được nội dung
    ▼
④  GÓI TIN HTTP bay đi
    │     POST /api/don-hang HTTP/1.1
    │     Host: shop.vn
    │     Authorization: Bearer eyJhbGci...      ◄── "tôi là ai"
    │     Content-Type: application/json
    │
    │     {"product_id": 42, "so_luong": 2}      ◄── nội dung thật
    ▼
⑤  LOAD BALANCER nhận, chọn một máy chủ còn khoẻ
    │
    ▼
⑥  API GATEWAY kiểm chữ ký token, kiểm hạn mức gọi
    │  Token hỏng → chặn tại đây, trả 401. Không vào tới bên trong.
    ▼
⑦  BACKEND xử lý
    │  a. Xác thực: token này của user nào?          → user_id = 88
    │  b. Phân quyền: user 88 có được đặt hàng không? → có
    │  c. Logic nghiệp vụ:
    │       - còn hàng không?
    │       - giá bao nhiêu? (TÍNH Ở ĐÂY, không tin giá từ client)
    │       - mã giảm giá còn hạn không?
    ▼
⑧  DATABASE — mở transaction
    │     BEGIN;
    │       UPDATE products SET ton_kho = ton_kho - 2
    │        WHERE id = 42 AND ton_kho >= 2;      ◄── nguyên tử, không ai chen
    │       INSERT INTO orders (...);
    │     COMMIT;                                  ◄── được ăn cả, ngã về không
    ▼
⑨  BACKEND đẩy việc nặng ra HÀNG ĐỢI
    │     (gửi email xác nhận, xuất hoá đơn — KHÔNG làm trong request này)
    ▼
⑩  PHẢN HỒI bay về
    │     HTTP/1.1 201 Created
    │     {"order_id": 90210, "trang_thai": "da_dat"}
    ▼
⑪  FRONTEND nhận JSON, render màn hình "Đặt hàng thành công"

    Tổng: khoảng 200–400 ms. Người dùng cảm thấy "ngay lập tức".
```

**Ba điều cần rút ra từ sơ đồ này:**

**① Giá tiền được tính ở bước ⑦, không lấy từ client.** Nếu backend tin con số client gửi lên, kẻ tấn công sửa `{"gia": 0}` là mua hàng miễn phí. Client chỉ được gửi **ý định** (`product_id`, `so_luong`), backend tự tra giá.

**② Bước ⑧ phải là một transaction.** Nếu trừ kho xong mà tạo đơn hỏng, hàng biến mất khỏi kho mà không ai mua.

**③ Bước ⑨ tách việc nặng ra.** Gửi email mất 2 giây; nếu làm trong request, người dùng phải chờ thêm 2 giây, và nếu máy chủ email hỏng thì đơn hàng cũng hỏng theo — dù đơn đã tạo xong.

## Ba kiến trúc triển khai phổ biến

```text
① MONOLITH (khối liền) — tất cả trong một chương trình

   ┌────────────────────────────────┐
   │  [Người dùng][Đơn][Kho][Thanh  │──► một database
   │   toán][Thông báo]  — 1 tiến   │
   │   trình, 1 lần deploy          │
   └────────────────────────────────┘
   ✓ Đơn giản, dễ debug, transaction xuyên module dễ dàng
   ✓ ĐÂY LÀ LỰA CHỌN ĐÚNG cho 90% dự án khi mới bắt đầu
   ✗ Một module lỗi có thể kéo sập cả tiến trình
   ✗ Muốn scale phần đơn hàng, phải nhân bản cả khối


② MICROSERVICES (dịch vụ nhỏ) — mỗi việc một chương trình riêng

              ┌── API Gateway ──┐
        ┌─────┼────────┬────────┼─────┐
        ▼     ▼        ▼        ▼     ▼
      [User][Order][Inventory][Pay][Notify]
        │     │        │        │     │
       DB1   DB2      DB3      DB4   DB5   ◄── mỗi dịch vụ database RIÊNG
   ✓ Scale riêng từng phần, deploy độc lập, lỗi được cô lập
   ✗ MẤT TRANSACTION xuyên dịch vụ → phải dùng saga (bù trừ)
   ✗ Debug khó gấp bội: một request đi qua 6 dịch vụ
   ✗ Cần cả hạ tầng đi kèm: service discovery, tracing, retry


③ MODULAR MONOLITH — khối liền có ranh giới rõ

   ┌──────────────────────────────────┐
   │ [User] │ [Order] │ [Inventory]   │  ranh giới module ĐƯỢC ÉP
   │   ▲ chỉ gọi nhau qua interface   │  bằng code, không qua mạng
   └──────────────────────────────────┘
   ✓ Giữ được sự đơn giản của monolith
   ✓ Khi cần tách, ranh giới đã sẵn sàng
   → Đây là lời khuyên thực dụng nhất hiện nay
```

### Tình huống thực tế và cách xử lý

> **Tình huống:** Team 5 người, sản phẩm mới, sếp nghe hội thảo về microservices và yêu cầu chia hệ thống thành 8 dịch vụ.

**Vấn đề:** Với 5 người, bạn vừa mua về toàn bộ chi phí vận hành của hệ phân tán mà chưa có vấn đề nào cần nó giải. Một tính năng nhỏ giờ phải sửa 3 repo, deploy 3 lần, và bug bất đồng bộ không tái hiện được trên máy dev.

**Cách trả lời có tính xây dựng:**

> *"Em đề xuất modular monolith trước. Mình vẫn tách ranh giới module rõ ràng bằng code — mỗi module có interface riêng, không gọi thẳng vào bảng của module khác. Khi nào đo được rằng một module cần scale riêng, hoặc team đông tới mức deploy chung gây nghẽn, thì ranh giới đã sẵn để tách ra. Tách sớm thì mình trả chi phí phân tán ngay hôm nay để đổi lấy lợi ích của năm sau — mà chưa chắc năm sau còn sản phẩm này."*

Đây là câu trả lời cho thấy bạn hiểu **đánh đổi**, không phải chạy theo xu hướng.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Để khoá bí mật trong code frontend | Hacker mở DevTools là thấy | Khoá chỉ nằm ở backend, biến môi trường |
| Chỉ kiểm dữ liệu ở frontend | Gọi thẳng API bằng `curl` là qua | Kiểm ở cả 3 tầng |
| Tin giá tiền client gửi lên | Mua hàng 0 đồng | Backend tự tra giá từ database |
| Xác thực xong quên phân quyền | IDOR — xem được dữ liệu người khác | Quyền sở hữu nằm trong `WHERE` |
| Trả 403 thay vì 404 cho tài nguyên không thuộc về mình | Lộ sự tồn tại của tài nguyên | Trả 404 |
| Gửi email/xuất PDF ngay trong request | Người dùng chờ lâu, email hỏng kéo đơn hỏng | Đẩy ra hàng đợi |
| Chọn microservices khi team 5 người | Chi phí phân tán không có lợi ích | Modular monolith |
| Frontend gọi thẳng database | Ai cũng đọc được thông tin kết nối | Luôn qua backend |
| Trả về cả bảng cho client rồi lọc bằng JS | Lộ dữ liệu người khác + chậm | Lọc ở database |

## Câu hỏi phỏng vấn hay gặp

**H: Frontend và backend khác nhau thế nào?**
Frontend chạy trên máy người dùng nên **ai cũng đọc được code và sửa được dữ liệu** — vì thế nó chỉ dùng để hiển thị và báo lỗi cho đẹp. Backend chạy trên máy chủ, người dùng không chạm tới, nên nó gánh ba việc: xác thực, phân quyền, và logic nghiệp vụ. Nguyên tắc em luôn giữ: kiểm ở frontend là kiểm cho vui, kiểm ở backend mới là kiểm thật, và ràng buộc ở database là lớp đảm bảo cuối cùng — vì script import và lệnh chạy tay đều đi vòng qua backend được.

**H: Vì sao không cho frontend gọi thẳng database?**
Vì thông tin kết nối sẽ nằm trong code mà ai cũng đọc được, và vì database không biết "người dùng" là ai — nó chỉ biết tài khoản kết nối. Không có backend thì không có chỗ nào kiểm phân quyền, không có chỗ nào chứa logic nghiệp vụ, và mọi câu SQL đều do client viết. (Có ngoại lệ: các nền tảng như Supabase cho phép gọi thẳng, nhưng chúng đặt Row Level Security ở database làm lớp phân quyền — tức là vẫn có tầng kiểm, chỉ là nó nằm chỗ khác.)

**H: Một request từ lúc bấm nút tới lúc hiện kết quả đi qua những gì?**
DNS tra tên miền, bắt tay TLS, gói HTTP mang header xác thực bay tới load balancer, gateway kiểm token và hạn mức, backend xác thực rồi phân quyền rồi chạy logic nghiệp vụ, database xử lý trong một transaction, việc nặng được đẩy ra hàng đợi, rồi phản hồi JSON bay về cho frontend render. Hai chi tiết quan trọng: **giá tiền phải tính ở backend chứ không lấy từ client**, và **thao tác nhiều bước phải nằm trong transaction**.

**H: Monolith hay microservices?**
Mặc định là **modular monolith** — tách ranh giới module rõ bằng code nhưng vẫn một tiến trình, một database, giữ được transaction và dễ debug. Microservices giải quyết vấn đề **tổ chức** (nhiều team deploy độc lập) và vấn đề **scale không đều** (một phần cần nhiều tài nguyên hơn hẳn). Nếu chưa có hai vấn đề đó thì tách sớm là trả chi phí phân tán hôm nay để đổi lấy lợi ích chưa chắc cần tới.

## Tóm tắt bài 1

- **Frontend** chạy trên máy người dùng → ai cũng đọc và sửa được → chỉ dùng để hiển thị, không giữ bí mật, không tính tiền.
- **Backend** chạy trên máy chủ → gánh ba việc sống còn: **xác thực** (bạn là ai), **phân quyền** (bạn được làm gì), **logic nghiệp vụ**.
- **Database** không phải file — nó là một chương trình làm bảo vệ, cho bạn **luật**, **khoá**, và **mục lục**.
- Kiểm dữ liệu ở **cả ba tầng** với ba mục đích khác nhau: trải nghiệm / bảo vệ / đảm bảo.
- **IDOR** là lỗi phổ biến nhất khi có xác thực mà quên phân quyền — đưa quyền sở hữu vào `WHERE` và trả 404 thay vì 403.
- Trong luồng một request: **giá tính ở backend**, **nhiều bước nằm trong transaction**, **việc nặng đẩy ra hàng đợi**.
- Mặc định kiến trúc là **modular monolith**; microservices giải quyết vấn đề tổ chức và scale không đều, không phải vấn đề kỹ thuật thuần.

**Bài kế tiếp** → [Bài 2: API — hợp đồng giữa hai phần mềm xa lạ](02-api-hop-dong-giua-hai-phan-mem-xa-la.md)
