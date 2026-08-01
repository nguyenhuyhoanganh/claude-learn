# Bài 2: API — hợp đồng giữa hai phần mềm xa lạ

3 giờ sáng, website bán vé của bạn sập. Không phải vì server yếu — mà vì **một API đối tác im lặng**. Chỉ một lá thư không hồi âm, cả hệ thống chết đứng.

Mỗi giây trôi qua là hàng nghìn đơn hàng bốc hơi. Đội kỹ thuật hoảng loạn tìm bug trong code của mình, nhưng code hoàn toàn sạch. **Kẻ gây án đang ở rất xa, bên ngoài công ty.**

Vấn đề là hầu hết chúng ta dùng API mỗi ngày mà không hiểu nó. Ta gọi nó, tin nó, phụ thuộc nó — nhưng khi nó im lặng, ta hoàn toàn bất lực.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt | Ví dụ |
|---|---|---|
| **API** (*Application Programming Interface*) | Giao diện lập trình ứng dụng — cách hai phần mềm nói chuyện | |
| **Endpoint** | **Điểm cuối** — địa chỉ nhận yêu cầu | `POST /api/v1/orders` |
| **HTTP method / verb** | **Động từ** — ý định của bạn | `GET`, `POST`, `PUT`, `DELETE` |
| **Header** | **Phần đầu thư** — thông tin đi kèm, không phải nội dung chính | `Authorization: Bearer ...` |
| **Body** | **Nội dung thư** | `{"product_id": 42}` |
| **Status code** | **Mã trạng thái** — kết quả bằng con số | `200`, `404`, `500` |
| **Payload** | **Tải trọng** — phần dữ liệu thật được gửi đi | |
| **JSON** | Định dạng dữ liệu dạng văn bản mà mọi ngôn ngữ đều đọc được | `{"ten": "An"}` |
| **Idempotent** | **Bất biến khi lặp** — gọi 1 lần hay 10 lần cho cùng kết quả | |
| **Rate limit** | **Giới hạn tần suất** — mỗi phút chỉ được gọi bấy nhiêu lần | |
| **Timeout** | **Thời gian chờ tối đa** trước khi bỏ cuộc | |
| **Latency** | **Độ trễ** — thời gian từ lúc gửi tới lúc nhận | |

## Kiến trúc và cách hoạt động: mổ xẻ một lá thư

```text
YÊU CẦU (Request) bay đi
┌─────────────────────────────────────────────────────────────┐
│ POST /api/v1/orders HTTP/1.1          ◄── ĐỘNG TỪ + ĐỊA CHỈ │
│ Host: api.shop.vn                     ◄── gửi tới đâu       │
│ Authorization: Bearer eyJhbGciOi...   ◄── "tôi là ai"       │
│ Content-Type: application/json        ◄── "thư viết bằng gì"│
│ Idempotency-Key: 9f3c-4a1e-...        ◄── "đây là lần thử   │
│ Accept-Language: vi-VN                     lại của cùng     │
│                                            một ý định"      │
│                                                             │
│ {"product_id": 42, "so_luong": 2}     ◄── NỘI DUNG THẬT     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
PHẢN HỒI (Response) bay về
┌─────────────────────────────────────────────────────────────┐
│ HTTP/1.1 201 Created                  ◄── MÃ KẾT QUẢ        │
│ Content-Type: application/json                              │
│ Location: /api/v1/orders/90210        ◄── tài nguyên vừa tạo│
│ X-RateLimit-Remaining: 97             ◄── còn gọi được 97 lần│
│                                                             │
│ {"order_id": 90210, "trang_thai": "da_dat"}                 │
└─────────────────────────────────────────────────────────────┘
```

**Người đưa thư không đọc nội dung** — nó chỉ mang đi đúng địa chỉ. Gửi sai phong bì thì thư bị trả lại ngay.

## Bốn động từ, và thứ phân biệt chúng

Nhiều người thuộc lòng bốn động từ nhưng không nói được **thứ thật sự phân biệt chúng**: tính an toàn và tính bất biến khi lặp.

| Động từ | Việc | An toàn? (không đổi dữ liệu) | Bất biến khi lặp? |
|---|---|---|---|
| `GET` | Xin xem | ✅ Có | ✅ Có |
| `POST` | Gửi mới | ❌ Không | ❌ **Không** |
| `PUT` | Thay thế toàn bộ | ❌ Không | ✅ Có |
| `PATCH` | Sửa một phần | ❌ Không | ⚠️ Tuỳ cách viết |
| `DELETE` | Xoá | ❌ Không | ✅ Có |

```text
BẤT BIẾN KHI LẶP (idempotent) nghĩa là gì?

  PUT /users/42  {"ten": "An"}
     Gọi 1 lần → tên thành "An"
     Gọi 10 lần → tên vẫn là "An". Trạng thái CUỐI CÙNG giống nhau.

  POST /orders  {"product_id": 42}
     Gọi 1 lần → tạo 1 đơn
     Gọi 10 lần → tạo 10 ĐƠN KHÁC NHAU.  ← đây là vấn đề

  DELETE /users/42
     Gọi 1 lần → xoá
     Gọi 10 lần → vẫn đã xoá (9 lần sau trả 404, nhưng TRẠNG THÁI như nhau)
```

Vì sao điều này quan trọng tới mức là câu hỏi phỏng vấn? Vì **mạng không đáng tin**.

### Tình huống thực tế và cách xử lý

> **Tình huống:** Khách bấm "Thanh toán". Mạng chập chờn, ứng dụng không nhận được phản hồi nên tự động thử lại. Kết quả: khách bị trừ tiền hai lần.

**Chuyện gì thực sự xảy ra:**

```text
Client ──POST /thanh-toan──► Server: nhận được, TRỪ TIỀN, tạo giao dịch
       ◄────── X ───────────         phản hồi bị mất trên đường về
       (client không biết gì)

Client: "Không có phản hồi → chắc thất bại → thử lại"
Client ──POST /thanh-toan──► Server: nhận được, TRỪ TIỀN LẦN HAI
```

Server không sai. Client không sai. **Giao thức thiếu một thứ.**

**Cách xử lý — khoá bất biến (idempotency key):**

```python
# Client sinh MỘT khoá cho MỘT ý định, gửi kèm MỌI lần thử lại
khoa = str(uuid.uuid4())          # sinh MỘT LẦN, trước vòng lặp retry

for lan_thu in range(3):
    try:
        r = requests.post(URL, json=payload,
                          headers={"Idempotency-Key": khoa},   # ◄── không đổi
                          timeout=10)
        if r.status_code < 500:
            break
    except requests.Timeout:
        time.sleep(2 ** lan_thu)
```

```python
# Server: hỏi trước khi làm
@app.post("/thanh-toan")
def thanh_toan(req, idempotency_key: str = Header(...)):
    with db.transaction():
        # Chèn khoá TRƯỚC — nếu trùng nghĩa là đã xử lý rồi
        row = db.execute(
            "INSERT INTO idempotency (khoa, trang_thai) VALUES (%s, 'dang_chay') "
            "ON CONFLICT (khoa) DO NOTHING RETURNING khoa",
            (idempotency_key,)
        ).fetchone()

        if row is None:                       # đã tồn tại
            cu = db.execute(
                "SELECT trang_thai, ket_qua FROM idempotency WHERE khoa = %s",
                (idempotency_key,)).fetchone()
            if cu.trang_thai == 'dang_chay':
                raise HTTPException(409, "Đang xử lý, vui lòng chờ")
            return cu.ket_qua                 # TRẢ LẠI kết quả cũ, không làm lại

        ket_qua = thuc_hien_tru_tien(req)     # chỉ chạy đúng một lần
        db.execute("UPDATE idempotency SET trang_thai='xong', ket_qua=%s "
                   "WHERE khoa=%s", (json.dumps(ket_qua), idempotency_key))
    return ket_qua
```

Hai chi tiết quyết định tính đúng đắn: **`INSERT ... ON CONFLICT` chạy trước khi làm việc thật** (không phải `SELECT` rồi `INSERT` — sẽ có race condition), và **trả lại kết quả cũ** thay vì báo lỗi (client thử lại cần nhận được đúng thứ nó đáng lẽ đã nhận).

Mọi cổng thanh toán nghiêm túc đều yêu cầu header này: Stripe, Adyen, VNPay đều có.

## Mã trạng thái: đọc con số là biết lỗi ở đâu

```text
2xx — THÀNH CÔNG
   200 OK              việc xong
   201 Created         đã tạo mới (kèm header Location trỏ tới tài nguyên)
   202 Accepted        ĐÃ NHẬN, đang xử lý ngầm ← dùng cho việc chạy lâu
   204 No Content      xong, không có gì để trả

4xx — LỖI CỦA NGƯỜI GỌI (bạn sai, đừng thử lại y hệt)
   400 Bad Request     dữ liệu gửi lên sai định dạng
   401 Unauthorized    chưa đăng nhập / token hỏng  ← "bạn LÀ AI?"
   403 Forbidden       đã đăng nhập nhưng không đủ quyền ← "bạn KHÔNG ĐƯỢC"
   404 Not Found       không tìm thấy
   409 Conflict        xung đột (trùng dữ liệu, sửa đồng thời)
   422 Unprocessable   đúng định dạng nhưng sai nghiệp vụ
   429 Too Many Requests  gọi quá tay ← CÓ THỂ thử lại sau Retry-After

5xx — LỖI CỦA BÊN NHẬN (họ sai, NÊN thử lại)
   500 Internal Error  bếp cháy
   502 Bad Gateway     proxy không gọi được dịch vụ phía sau
   503 Unavailable     đang quá tải/bảo trì
   504 Gateway Timeout proxy chờ dịch vụ phía sau quá lâu
```

**Ranh giới 4xx/5xx quyết định hành vi retry của bạn:** 4xx thử lại y hệt là vô nghĩa (trừ 429), 5xx thì nên thử lại có nhịp.

Hai cặp hay bị nhầm, và người phỏng vấn rất hay hỏi:

```text
401 vs 403:   401 = "TÔI KHÔNG BIẾT BẠN LÀ AI"     (thiếu/hỏng token)
              403 = "TÔI BIẾT BẠN, NHƯNG KHÔNG CHO" (thiếu quyền)

400 vs 422:   400 = JSON hỏng, thiếu trường bắt buộc  (không parse nổi)
              422 = parse được nhưng vô lý về nghiệp vụ
                    (ngày kết thúc trước ngày bắt đầu)
```

## Ba cái bẫy khiến hệ thống sập lúc 3 giờ sáng

### Bẫy 1: không đặt thời gian chờ

Đây chính là thủ phạm của câu chuyện mở đầu.

```python
# ❌ Không có timeout — mặc định của nhiều thư viện là CHỜ VÔ TẬN
r = requests.get("https://api-doitac.com/gia")

# API đối tác treo → luồng của bạn treo theo
# → 200 request đồng thời = 200 luồng bị giữ
# → hết luồng, hết kết nối, website của BẠN sập
# → dù code của bạn hoàn toàn sạch
```

```python
# ✅ Luôn có timeout, và tách hai loại
r = requests.get(URL, timeout=(3, 10))
#                             │   └── đọc dữ liệu tối đa 10 giây
#                             └────── kết nối tối đa 3 giây
```

**Quy tắc: mọi lời gọi ra ngoài đều phải có thời gian chờ tối đa. Không có ngoại lệ.**

Và timeout phải **nhỏ dần theo chiều sâu** — nếu người dùng chỉ chờ được 5 giây, thì lời gọi bên trong không thể để 30 giây:

```text
   Người dùng chờ tối đa    10s
        └─ API của bạn       8s
             └─ gọi đối tác  5s
                  └─ query DB 2s
```

### Bẫy 2: thử lại không có nhịp (retry storm)

```python
# ❌ Đối tác vừa hồi phục yếu ớt, 10.000 client cùng thử lại một lúc
for i in range(5):
    r = goi_api()
    if r.ok: break
    time.sleep(1)          # ai cũng ngủ đúng 1 giây → cùng thức dậy → đè chết lại
```

```python
# ✅ Backoff mũ + jitter (nhiễu ngẫu nhiên để phân tán)
import random, time

def goi_co_nhip(func, so_lan=4, base=0.5, tran=8.0):
    for lan in range(so_lan):
        try:
            r = func()
            if r.status_code < 500 and r.status_code != 429:
                return r
            if r.status_code == 429:
                cho = float(r.headers.get("Retry-After", base * 2 ** lan))
            else:
                cho = min(base * 2 ** lan, tran)
        except (Timeout, ConnectionError):
            cho = min(base * 2 ** lan, tran)

        if lan == so_lan - 1:
            raise DoiTacKhongPhanHoi()
        time.sleep(cho * (0.5 + random.random()))   # ◄── jitter: 50%–150%
```

Ba điểm quan trọng: **tôn trọng `Retry-After`** khi nhận 429, **không thử lại lỗi 4xx** (trừ 429 — thử lại y hệt sẽ y hệt sai), và **jitter** để 10.000 client không cùng thức dậy.

### Bẫy 3: không có cầu dao (circuit breaker)

Khi đối tác đã chết hẳn, thử lại chỉ làm mọi thứ tệ hơn — bạn đang tự làm cạn tài nguyên của mình.

```text
        ĐÓNG (bình thường)
            │  đếm số lần lỗi liên tiếp
            │  vượt ngưỡng (ví dụ 5 lần)
            ▼
          MỞ (ngắt mạch)
            │  KHÔNG gọi nữa. Trả lỗi/giá trị mặc định NGAY LẬP TỨC.
            │  → không tốn luồng, không tốn thời gian chờ
            │  sau 30 giây
            ▼
        HÉ MỞ (thăm dò)
            │  cho ĐÚNG MỘT request đi thử
            ├── thành công → quay về ĐÓNG
            └── thất bại   → quay lại MỞ, đợi tiếp
```

```python
class CauDao:
    def __init__(self, nguong=5, nghi=30):
        self.nguong, self.nghi = nguong, nghi
        self.loi, self.mo_luc, self.trang_thai = 0, None, "DONG"

    def goi(self, func, mac_dinh=None):
        if self.trang_thai == "MO":
            if time.time() - self.mo_luc < self.nghi:
                return mac_dinh                  # trả ngay, KHÔNG gọi
            self.trang_thai = "HE_MO"
        try:
            kq = func()
            self.loi, self.trang_thai = 0, "DONG"
            return kq
        except Exception:
            self.loi += 1
            if self.loi >= self.nguong or self.trang_thai == "HE_MO":
                self.trang_thai, self.mo_luc = "MO", time.time()
            if mac_dinh is not None:
                return mac_dinh                  # suy giảm êm (graceful degradation)
            raise
```

**Suy giảm êm** (*graceful degradation*) là ý tưởng đi kèm: dịch vụ gợi ý sản phẩm chết thì trang vẫn hiện, chỉ thiếu phần gợi ý — thay vì trắng màn hình.

## Thiết kế API tốt: bảy nguyên tắc

```text
① DANH TỪ SỐ NHIỀU CHO TÀI NGUYÊN, ĐỘNG TỪ NẰM Ở HTTP METHOD
   ❌ POST /getUserById   ❌ POST /createOrder
   ✅ GET  /users/42      ✅ POST /orders

② LỒNG NHAU THEO QUAN HỆ, KHÔNG QUÁ 2 TẦNG
   ✅ GET /orders/90210/items
   ❌ GET /users/42/orders/90210/items/7/reviews    ← quá sâu, khó bảo trì

③ ĐÁNH PHIÊN BẢN TỪ NGÀY ĐẦU
   /api/v1/orders           ← đừng đợi tới lúc cần

④ PHÂN TRANG MỌI DANH SÁCH — KHÔNG NGOẠI LỆ
   GET /orders?limit=20&cursor=eyJpZCI6MTA0Mn0

⑤ LỖI CÓ MÃ RIÊNG, ĐỌC ĐƯỢC BẰNG MÁY
   {"error": {"code": "INSUFFICIENT_STOCK",
              "message": "Chỉ còn 3 sản phẩm",
              "field": "so_luong", "trace_id": "abc-123"}}
   → client bắt theo `code`, hiện `message`, báo lỗi kèm `trace_id`

⑥ TRẢ THỜI GIAN THEO CHUẨN ISO 8601 CÓ MÚI GIỜ
   "created_at": "2026-08-01T09:00:00+07:00"

⑦ ID LỚN VÀ TIỀN TRẢ VỀ DẠNG CHUỖI
   {"order_id": "9223372036854775807", "amount": "1500000.50"}
   → JavaScript chỉ giữ nguyên số nguyên tới 2^53, tiền thì không dùng float
```

### Tình huống thực tế và cách xử lý

> **Tình huống:** Bạn cần thêm trường `discount` vào response. Deploy xong, app iOS phiên bản cũ crash hàng loạt.

**Nguyên nhân:** app cũ dùng bộ giải mã chặt chẽ (`Codable` của Swift với mô hình strict) — gặp trường lạ là ném lỗi.

**Cách xử lý — phân biệt thay đổi phá vỡ và không phá vỡ:**

| Thay đổi | Có phá vỡ không |
|---|---|
| **Thêm** trường vào response | Thường không — nhưng client phải bỏ qua trường lạ |
| **Thêm** trường **tuỳ chọn** vào request | Không |
| **Xoá** hoặc **đổi tên** trường | **Có** |
| **Đổi kiểu** (số → chuỗi) | **Có** |
| **Thêm** trường **bắt buộc** vào request | **Có** |
| Thu hẹp tập giá trị enum | **Có** |
| Đổi mã lỗi | **Có** |

Quy trình đúng khi buộc phải phá vỡ:

```text
① Ra /v2 song song với /v1, cả hai cùng sống
② Thêm header cảnh báo vào /v1:
     Deprecation: true
     Sunset: Wed, 31 Dec 2026 23:59:59 GMT
     Link: <https://docs.shop.vn/migrate-v2>; rel="deprecation"
③ ĐO xem còn ai gọi /v1 (log theo phiên bản client)
④ Thông báo, cho thời hạn tối thiểu 3–6 tháng
⑤ Chỉ tắt /v1 khi lưu lượng đã về gần 0
```

Và nguyên tắc **Postel** cho client: *"nghiêm khắc với thứ bạn gửi, khoan dung với thứ bạn nhận"* — luôn cấu hình bộ giải mã **bỏ qua trường lạ**.

## Bảo mật API: bốn thứ tối thiểu

```text
① HTTPS — bắt buộc, không có chế độ thử nghiệm.
   HTTP thường = mọi thứ (kể cả token) đọc được bởi người ngồi giữa.

② API KEY / TOKEN không bao giờ nằm trong code công khai.
   Lỗi kinh điển: đẩy file .env lên GitHub.
   → Dùng biến môi trường + secret manager, và QUÉT repo (git-secrets, trufflehog).

③ RATE LIMIT theo khoá và theo IP.
   Không có nó, một script có thể gọi 10.000 lần/giây và làm cạn hạn mức của bạn.

④ KHÔNG BAO GIỜ LOG header Authorization và body chứa mật khẩu.
   Đây là cách 12.000 mật khẩu nằm sẵn trong file log (xem phase-2 bài 3).
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Không đặt timeout | Đối tác treo → hệ thống bạn treo theo | Luôn có timeout, nhỏ dần theo chiều sâu |
| Thử lại không có jitter | Sóng retry đè chết dịch vụ vừa hồi phục | Backoff mũ + jitter, tôn trọng `Retry-After` |
| Thử lại lỗi 4xx | Vô nghĩa, chỉ tốn tài nguyên | Chỉ retry 5xx và 429 |
| `POST` không có idempotency key | Trừ tiền hai lần khi retry | Khoá bất biến + `ON CONFLICT` |
| `SELECT` rồi `INSERT` cho idempotency | Race condition | `INSERT ... ON CONFLICT` trước khi làm việc |
| Không có circuit breaker | Tự làm cạn tài nguyên khi đối tác chết | Cầu dao + suy giảm êm |
| Không phiên bản hoá API | Không sửa được gì mà không phá client cũ | `/v1` từ ngày đầu |
| Trả về cả danh sách không phân trang | Một request kéo 500 MB | Phân trang mọi danh sách |
| Lỗi chỉ có `message` tiếng Việt | Client không bắt lỗi theo máy được | Thêm `code` + `trace_id` |
| Trả `BIGINT` id qua JSON cho JS | Làm tròn im lặng ở 2⁵³ | Serialize thành chuỗi |
| Client giải mã strict, gặp trường lạ là crash | Thêm trường = phá client cũ | Bỏ qua trường lạ |
| Log header `Authorization` | Token/mật khẩu nằm trong file log | Che trường nhạy cảm |

## Câu hỏi phỏng vấn hay gặp

**H: API là gì?**
Là **hợp đồng** giữa hai phần mềm: bên cung cấp cam kết nhận yêu cầu theo đúng khuôn và trả về đúng hình dạng đã hứa. Nó giấu toàn bộ độ phức tạp phía sau — bạn không cần biết bếp dùng lò gì, mua thịt ở đâu, chỉ cần biết cách gọi món cho đúng.

**H: Idempotent nghĩa là gì, vì sao quan trọng?**
Là gọi một lần hay nhiều lần đều cho cùng **trạng thái cuối**. `GET`, `PUT`, `DELETE` bất biến; `POST` thì không. Nó quan trọng vì **mạng không đáng tin** — phản hồi có thể mất trên đường về, client tưởng thất bại nên thử lại, và khách bị trừ tiền hai lần. Cách chữa là **khoá bất biến** do client sinh và gửi kèm mọi lần thử lại; server `INSERT ... ON CONFLICT` khoá đó **trước** khi làm việc thật, và nếu trùng thì **trả lại kết quả cũ** chứ không báo lỗi.

**H: 401 và 403 khác gì? 400 và 422?**
401 là *"tôi không biết bạn là ai"* — thiếu hoặc hỏng token. 403 là *"tôi biết bạn, nhưng bạn không được phép"*. 400 là dữ liệu **không parse nổi** — JSON hỏng, thiếu trường bắt buộc. 422 là parse được nhưng **vô lý về nghiệp vụ** — ví dụ ngày kết thúc trước ngày bắt đầu.

**H: API đối tác treo thì hệ thống bạn có sập không?**
Sập, nếu không có ba lớp bảo vệ. **Timeout** cho mọi lời gọi ra ngoài, và timeout phải nhỏ dần theo chiều sâu. **Retry có backoff mũ và jitter**, chỉ retry 5xx và 429. Và **circuit breaker**: sau N lần lỗi liên tiếp thì ngắt hẳn, trả giá trị mặc định ngay lập tức trong 30 giây rồi mới cho một request đi thăm dò — vì khi đối tác đã chết, thử lại chỉ làm cạn tài nguyên của chính mình.

**H: Làm sao thêm tính năng vào API mà không phá client cũ?**
Phân biệt thay đổi phá vỡ và không phá vỡ: thêm trường vào response hoặc thêm trường tuỳ chọn vào request thì an toàn; xoá trường, đổi tên, đổi kiểu, thêm trường bắt buộc thì phá vỡ. Khi buộc phải phá vỡ, ra `/v2` song song, thêm header `Deprecation` và `Sunset` vào `/v1`, **đo xem còn ai gọi**, cho thời hạn 3–6 tháng, rồi mới tắt.

## Tóm tắt bài 2

- API là **hợp đồng**: endpoint (địa chỉ) + động từ (ý định) + header (thông tin đi kèm) + body (nội dung) → status code + payload.
- Thứ phân biệt bốn động từ không phải tên gọi mà là **tính an toàn** và **tính bất biến khi lặp**.
- Mạng không đáng tin → `POST` cần **khoá bất biến**: `INSERT ... ON CONFLICT` **trước** khi làm việc, và **trả lại kết quả cũ** khi trùng.
- Ranh giới **4xx/5xx quyết định có nên thử lại**: 4xx thử lại vô nghĩa (trừ 429), 5xx thì nên.
- Ba lớp chống sập dây chuyền: **timeout** (nhỏ dần theo chiều sâu) → **retry có backoff + jitter** → **circuit breaker + suy giảm êm**.
- Thiết kế tốt: danh từ số nhiều, phiên bản từ ngày đầu, phân trang mọi danh sách, lỗi có `code` và `trace_id`, thời gian ISO 8601 có múi giờ, **ID lớn và tiền trả về dạng chuỗi**.
- Bốn thứ bảo mật tối thiểu: **HTTPS**, khoá không nằm trong code, **rate limit**, và **không log header `Authorization`**.

**Bài kế tiếp** → [Bài 3: Đồng bộ và bất đồng bộ — ùn tắc hay thông thoáng](03-dong-bo-va-bat-dong-bo.md)
