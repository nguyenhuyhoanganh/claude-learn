# Bài 5: Thiết kế REST API chịu tải

Bạn vừa đưa API lên mạng. **3 giờ sáng**, một con bot dội **10.000 request mỗi giây**. Dữ liệu người dùng bị lộ, và server thì sập.

Chào mừng đến Internet.

Một API công khai giống **cửa hàng mở 24/7**: ai cũng ghé được — cả khách lẫn kẻ trộm. Hôm nay ta dựng đủ các lớp bảo vệ để nó vừa an toàn, vừa chịu tải lớn.

Bài này là bài **tổng hợp** của cả phase 3: bốn trụ cột của một API tử tế, và cách chúng khớp với load balancer, gateway, cache, và hàng đợi đã học.

## Bốn trụ cột

```text
   ① XÁC THỰC     — biết AI đang gọi
   ② HẠN MỨC      — chặn kẻ spam
   ③ PHÂN TRANG   — trả dữ liệu từng phần
   ④ PHIÊN BẢN    — nâng cấp không làm vỡ app cũ

   Bám vào bốn chữ này. Chúng là toàn bộ phần còn lại của bài.
```

## Trụ cột 1: Xác thực — mọi request phải trả lời "bạn là ai"

Chi tiết đã học ở phase 2. Ở đây chỉ nhấn ba điểm liên quan tới **chịu tải**:

```text
① KIỂM TOKEN CỤC BỘ, đừng gọi auth-service mỗi request
   → tải khoá công khai JWKS một lần, tự xác minh chữ ký (~0,5 ms)
   → gọi auth-service mỗi request là +90 ms và tạo thêm một điểm chết

② CACHE KẾT QUẢ XÁC THỰC vài chục giây
   → key = hash của token; tiết kiệm cả việc kiểm chữ ký

③ KIỂM Ở GATEWAY, GẮN HEADER NỘI BỘ cho dịch vụ bên trong
   → 12 chỗ xác thực còn 1
   → NHƯNG gateway phải XOÁ SẠCH header X-* đến từ ngoài
```

**Và nhắc lại điều quan trọng nhất:** gateway lo **xác thực**, dịch vụ vẫn phải lo **phân quyền cấp bản ghi**. Có gateway không có nghĩa là hết IDOR.

## Trụ cột 2: Hạn mức — bốn thuật toán

### ① Fixed Window — cửa sổ cố định

```text
   Đếm request trong mỗi phút. Sang phút mới thì reset về 0.

   ✓ Đơn giản nhất, chỉ cần một bộ đếm
   ✗ BẪY BIÊN: giới hạn 100/phút nhưng client gửi
     100 request lúc 10:00:59 và 100 request lúc 10:01:00
     → 200 request trong 1 GIÂY, vẫn "đúng luật"
```

```python
def fixed_window(khoa, gioi_han=100, cua_so=60):
    k = f"rl:{khoa}:{int(time.time() // cua_so)}"
    n = r.incr(k)
    if n == 1:
        r.expire(k, cua_so)
    return n <= gioi_han
```

### ② Sliding Window Log — cửa sổ trượt chính xác

```python
def sliding_window(khoa, gioi_han=100, cua_so=60):
    now = time.time()
    k = f"rl:{khoa}"
    p = r.pipeline()
    p.zremrangebyscore(k, 0, now - cua_so)                  # bỏ dấu vết cũ
    p.zcard(k)                                               # đếm trong cửa sổ
    p.zadd(k, {f"{now}:{os.urandom(4).hex()}": now})
    p.expire(k, cua_so)
    _, so_luot, _, _ = p.execute()
    return so_luot < gioi_han
```

```text
   ✓ Chính xác tuyệt đối, không có bẫy biên
   ✗ Tốn bộ nhớ: lưu MỘT MỤC cho MỖI request
     → 10.000 client × 1.000 request = 10 triệu mục trong Redis
```

### ③ Token Bucket — xô token (được dùng nhiều nhất)

```text
   Một cái xô chứa tối đa 100 token.
   Token được rót vào đều đặn: 10 token/giây.
   Mỗi request lấy ra 1 token. Xô cạn → từ chối.

   ✓ CHO PHÉP BÙNG NỔ NGẮN (burst) — xô đầy thì tiêu 100 request tức thì
     → đúng với hành vi thật của client (mở app là gọi 20 API cùng lúc)
   ✓ Tốn bộ nhớ ít: chỉ 2 số mỗi khoá (số token, thời điểm cập nhật cuối)
   ✓ Hai tham số điều chỉnh độc lập: TỐC ĐỘ và ĐỘ BÙNG NỔ
```

```lua
-- Redis Lua script — nguyên tử, chạy trọn vẹn không bị chen ngang
local key   = KEYS[1]
local toc_do  = tonumber(ARGV[1])    -- token mỗi giây
local suc_chua = tonumber(ARGV[2])   -- kích thước xô
local now   = tonumber(ARGV[3])

local d = redis.call('HMGET', key, 'token', 'ts')
local token = tonumber(d[1]) or suc_chua
local ts    = tonumber(d[2]) or now

token = math.min(suc_chua, token + (now - ts) * toc_do)   -- rót thêm
if token < 1 then
  redis.call('HMSET', key, 'token', token, 'ts', now)
  return 0                                                 -- từ chối
end
redis.call('HMSET', key, 'token', token - 1, 'ts', now)
redis.call('EXPIRE', key, math.ceil(suc_chua / toc_do) * 2)
return 1                                                   -- cho qua
```

### ④ Leaky Bucket — xô rỉ

```text
   Request đổ vào xô, chảy ra với TỐC ĐỘ CỐ ĐỊNH.
   Xô đầy → tràn → từ chối.

   ✓ Làm PHẲNG lưu lượng đầu ra — bảo vệ dịch vụ phía sau tuyệt đối
   ✗ KHÔNG cho bùng nổ, và request phải xếp hàng chờ → thêm độ trễ
   → Dùng khi dịch vụ phía sau có công suất cứng (gọi API đối tác có hạn mức)
```

### Bảng chọn

| Thuật toán | Bộ nhớ | Cho bùng nổ | Chính xác | Dùng khi |
|---|---|---|---|---|
| Fixed Window | Rất ít | ⚠️ Bẫy biên | Thấp | Nội bộ, không quan trọng |
| Sliding Window | **Nhiều** | Không | **Cao nhất** | Cần công bằng tuyệt đối |
| **Token Bucket** | Ít | ✅ **Có** | Cao | **Mặc định nên chọn** |
| Leaky Bucket | Ít | ❌ Không | Cao | Bảo vệ backend công suất cứng |

### Bốn nguyên tắc áp dụng

```text
① GIỚI HẠN THEO NHIỀU CHIỀU CÙNG LÚC
      theo API key    1.000/phút    ← đối tác
      theo user_id      300/phút    ← người dùng
      theo IP           100/phút    ← chống bot chưa đăng nhập
      theo endpoint      10/phút    ← /dang-nhap, /quen-mat-khau, /gui-otp
   → endpoint đắt tiền (tìm kiếm, xuất báo cáo) phải có hạn riêng, chặt hơn

② HẠN MỨC PHẢI DÙNG CHUNG GIỮA CÁC BẢN GATEWAY
   → giữ trong bộ nhớ mỗi bản = 10 bản × 1.000 = 10.000/phút thực tế

③ LUÔN TRẢ HEADER CHO CLIENT BIẾT ĐƯỜNG
      X-RateLimit-Limit: 1000
      X-RateLimit-Remaining: 3
      X-RateLimit-Reset: 1754035200
      Retry-After: 42              ← kèm khi trả 429
   → Đối tác tử tế sẽ tự điều tiết. Không có header thì họ chỉ biết thử lại mù.

④ CHIA KHOANG (bulkhead) — mỗi đối tác một hàng đợi riêng
   → một người quá tay không ăn hết tài nguyên của người khác
```

## Trụ cột 3: Phân trang — không bao giờ trả tất cả

```text
   NGUYÊN TẮC KHÔNG CÓ NGOẠI LỆ:
   Mọi endpoint trả về danh sách đều PHẢI phân trang.

   GET /orders  → 2 triệu dòng → 500 MB → server hết RAM,
                  client treo, mạng nghẽn. Chỉ vì một câu gọi ngây thơ.
```

### Cách 1: Offset — dễ làm, có hai bẫy

```http
GET /orders?page=3&limit=20
```

```text
   ✗ BẪY 1 — TRANG SÂU CỰC CHẬM
      OFFSET KHÔNG NHẢY, NÓ ĐẾM.
      Muốn tới dòng thứ 100.000, database phải ĐỌC ĐỦ 100.000 dòng
      trước đó rồi VỨT ĐI.
      Đo thật: trang 1 mất 20 ms, trang 5.000 mất 480 ms — gấp 240 lần.

   ✗ BẪY 2 — DỮ LIỆU LỆCH (nguy hiểm hơn nhiều)
      Có người chèn dòng mới vào đầu danh sách
      → mọi dòng phía dưới TỤT XUỐNG một bậc
      → dòng cuối trang 1 nhảy sang trang 2 → NGƯỜI DÙNG THẤY NÓ HAI LẦN
      → hoặc job quét 500 trang XỬ LÝ TRÙNG và BỎ SÓT, không log nào báo.

      Trang chậm thì người dùng BIẾT mình đang chờ.
      Trang sai thì KHÔNG AI BIẾT GÌ HẾT. Kể cả bạn.
```

### Cách 2: Cursor / Keyset — chuẩn cho API chịu tải

```http
GET /orders?limit=20
→ { "data": [...], "next_cursor": "eyJpZCI6MTA0MiwidHMiOiIyMDI2LTA4LTAxIn0" }

GET /orders?limit=20&cursor=eyJpZCI6MTA0MiwidHMiOiIyMDI2LTA4LTAxIn0
```

```sql
-- Thay vì BỎ QUA 100.000 dòng, ta SO SÁNH
SELECT * FROM orders
WHERE (ordered_at, order_id) < ($1, $2)     -- ◄── so sánh bộ (tuple comparison)
ORDER BY ordered_at DESC, order_id DESC
LIMIT 20;
-- Máy nhảy thẳng vào index, đọc đúng 20 dòng.
-- Trang 5.000 cũng 20 ms như trang 1.
```

```text
   ⚠️ Phải có TIE-BREAKER (order_id) trong cả ORDER BY lẫn điều kiện.
      Nếu chỉ sắp theo ordered_at mà có hai đơn cùng thời điểm,
      con trỏ sẽ nhảy cóc hoặc lặp.

   CÁI GIÁ: không còn nhảy tới trang bất kỳ được nữa.
            Không có nút "trang 137", không có nút "trang cuối".
            Chỉ còn "tiếp" và "lùi".
```

```python
# Đóng gói con trỏ — mã hoá để client không tự chế
import base64, json, hmac

def tao_cursor(row):
    d = {"ts": row.ordered_at.isoformat(), "id": row.order_id}
    raw = json.dumps(d).encode()
    sig = hmac.new(SECRET, raw, hashlib.sha256).digest()[:8]
    return base64.urlsafe_b64encode(raw + sig).decode()
```

Ký con trỏ để client **không tự sửa** — nếu không, họ có thể chế con trỏ trỏ tới dữ liệu người khác.

### Bảng chọn

| | Offset | Cursor |
|---|---|---|
| Nhảy tới trang bất kỳ | ✅ | ❌ |
| Trang sâu | ❌ Rất chậm | ✅ Nhanh đều |
| Dữ liệu đổi liên tục | ❌ Lặp/sót | ✅ Ổn định |
| Tổng số trang | ✅ | ❌ Đắt |
| Dùng cho | Bảng quản trị, dữ liệu tĩnh | **Cuộn vô hạn, API công khai, job quét** |

**Ngưỡng để nói cho gọn:** danh sách cuộn vô hạn và API công khai → **con trỏ**; bảng quản trị cần nhảy trang → `OFFSET` nhưng **giới hạn độ sâu** (ví dụ tối đa trang 100).

### Ba chi tiết đi kèm

```text
① LUÔN CÓ limit MẶC ĐỊNH VÀ TRẦN CỨNG
      limit = min(request.limit or 20, 100)
   → không có trần thì client gõ ?limit=1000000 là xong đời server

② ĐẾM TỔNG SỐ LÀ THAO TÁC ĐẮT trên bảng lớn
   → đừng trả `total` mặc định; cho nó thành tuỳ chọn `?include_total=true`
   → hoặc trả ước lượng từ thống kê của database

③ SẮP XẾP PHẢI TẤT ĐỊNH
   → thiếu tie-breaker thì cùng một query chạy hai lần cho hai thứ tự khác nhau
```

## Trụ cột 4: Phiên bản — nâng cấp không làm vỡ app cũ

```text
   ĐÁNH PHIÊN BẢN TỪ NGÀY ĐẦU TIÊN. Đừng đợi tới lúc cần.
      /api/v1/orders

   Thêm sau thì phải sửa mọi client. Có sẵn thì không tốn gì.
```

### Thay đổi nào phá vỡ, thay đổi nào không?

| Thay đổi | Phá vỡ? |
|---|---|
| **Thêm** trường vào response | Thường không — nếu client bỏ qua trường lạ |
| **Thêm** trường **tuỳ chọn** vào request | Không |
| Thêm endpoint mới | Không |
| **Xoá** hoặc **đổi tên** trường | **Có** |
| **Đổi kiểu** (số → chuỗi) | **Có** |
| Thêm trường **bắt buộc** vào request | **Có** |
| Thu hẹp tập giá trị enum | **Có** |
| Đổi mã lỗi hoặc status code | **Có** |
| Đổi ý nghĩa của trường (giá gồm/không gồm thuế) | **Có — và tệ nhất vì im lặng** |

Dòng cuối đáng sợ nhất: **không có lỗi nào phát ra**, chỉ có con số sai.

### Quy trình khai tử một phiên bản

```text
① Ra /v2 song song, cả hai cùng sống
② Thêm header cảnh báo vào /v1:
      Deprecation: true
      Sunset: Wed, 31 Dec 2026 23:59:59 GMT
      Link: <https://docs.shop.vn/migrate-v2>; rel="deprecation"
③ ĐO xem CÒN AI GỌI /v1 — log theo client_id và phiên bản
④ Chủ động liên hệ những client còn dùng
⑤ Cho thời hạn tối thiểu 3–6 tháng
⑥ Chỉ tắt khi lưu lượng đã về gần 0
```

Bước ③ là bước hay bị bỏ qua nhất, và nó là bước quyết định — **bạn không tắt được thứ mình không đo**.

## Bốn lớp bảo vệ, xếp chồng lên nhau

```text
   Request từ Internet
        │
   ┌────▼──────────────────────────────────┐
   │ ① HTTPS/TLS — mã hoá đường truyền     │
   ├───────────────────────────────────────┤
   │ ② XÁC THỰC — kiểm chữ ký token        │  → 401 nếu hỏng
   ├───────────────────────────────────────┤
   │ ③ HẠN MỨC — kiểm còn lượt không       │  → 429 nếu vượt
   ├───────────────────────────────────────┤
   │ ④ ENDPOINT có phiên bản rõ ràng       │
   └────┬──────────────────────────────────┘
        ▼
   Trả về MỘT TRANG dữ liệu gọn gàng kèm con trỏ cho trang sau

   TỪNG LỚP MỘT. KHÔNG LỚP NÀO THAY ĐƯỢC LỚP NÀO.
```

## Vài gia vị chuyên nghiệp

```text
① STATUS CODE ĐÚNG CHUẨN
   202 cho việc chạy ngầm, 409 cho xung đột, 422 cho sai nghiệp vụ

② LỖI CÓ MÃ RIÊNG, ĐỌC ĐƯỢC BẰNG MÁY
   {"error": {"code": "INSUFFICIENT_STOCK",
              "message": "Chỉ còn 3 sản phẩm",
              "field": "so_luong",
              "trace_id": "abc-123"}}
   → client bắt theo `code`, hiện `message`, báo lỗi kèm `trace_id`

③ IDEMPOTENCY CHO MỌI THAO TÁC GHI
   Header Idempotency-Key; server INSERT ... ON CONFLICT TRƯỚC khi làm việc,
   trùng thì TRẢ LẠI KẾT QUẢ CŨ (xem phase-1 bài 2)

④ TÀI LIỆU OpenAPI LUÔN CẬP NHẬT
   → sinh từ code, không viết tay; nếu viết tay thì nó sẽ lệch

⑤ TRACE ID XUYÊN SUỐT
   → một request đi qua 6 dịch vụ vẫn tra được bằng một mã
```

Ba gia vị này nhỏ thôi, nhưng là thứ **phân biệt API nghiệp dư với API đáng tin**.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** API `/search` chiếm 80% tải database. Nó chậm, và mỗi khi có người tìm kiếm phức tạp thì mọi endpoint khác cũng chậm theo.

```text
   ✅ Năm lớp xử lý, xếp theo chi phí:

   ① HẠN MỨC RIÊNG cho endpoint đắt tiền
        /search → 10 request/phút mỗi user (thay vì 300 chung)

   ② CACHE kết quả tìm kiếm phổ biến (TTL 60s)
        → 20 từ khoá hot chiếm phần lớn lưu lượng

   ③ TÁCH DATABASE — search đọc từ replica riêng, không đụng primary
        → truy vấn nặng không làm chậm luồng đặt hàng

   ④ CHIA KHOANG — pool kết nối riêng cho search
        → search cạn pool của nó thì luồng thanh toán vẫn còn pool

   ⑤ TÁCH HẲN HỆ TÌM KIẾM (Elasticsearch/Meilisearch)
        → khi cần xếp hạng liên quan và full-text thật sự
```

Lớp ④ là lớp ít người nghĩ tới nhưng cứu được nhiều nhất: **chia khoang như tàu thuỷ** — một khoang ngập không làm chìm cả tàu.

> **Tình huống 2:** Đối tác báo API trả `429` liên tục dù họ nói chỉ gọi 500 lần/phút, còn hạn mức là 1.000.

```text
   Ba nguyên nhân cần kiểm theo thứ tự:

   ① HẠN MỨC GIỮ TRONG BỘ NHỚ MỖI BẢN GATEWAY
      → 10 bản, mỗi bản đếm riêng, nhưng mỗi bản chỉ cho 100
      ✅ Chuyển sang Redis dùng chung

   ② BẪY BIÊN của fixed window
      → họ gửi 500 lúc 10:00:59 và 500 lúc 10:01:00
      ✅ Chuyển sang token bucket hoặc sliding window

   ③ HỌ ĐANG THỬ LẠI MÙ vì bạn không trả header
      → nhận 429 rồi thử lại ngay → càng làm tệ hơn
      ✅ Trả X-RateLimit-* và Retry-After
```

> **Tình huống 3:** Job đồng bộ dữ liệu quét 500 trang bằng `OFFSET`. Kết quả: một số bản ghi bị xử lý **hai lần**, một số **bị bỏ sót**.

**Nguyên nhân:** dữ liệu thay đổi trong lúc quét, và `OFFSET` đếm theo **vị trí** chứ không theo **dữ liệu**.

```python
# ✅ Dùng con trỏ theo khoá chính — miễn nhiễm với chèn/xoá
cursor = 0
while True:
    rows = db.query(
        "SELECT * FROM orders WHERE order_id > %s ORDER BY order_id LIMIT 1000",
        cursor)
    if not rows:
        break
    xu_ly(rows)
    cursor = rows[-1].order_id      # ◄── theo DỮ LIỆU, không theo vị trí
```

**Đây là mẫu chuẩn cho mọi job quét bảng lớn** — và cũng là câu trả lời hoàn chỉnh cho câu hỏi phỏng vấn *"OFFSET có vấn đề gì?"*: chậm là vấn đề nhỏ, **sai mới là vấn đề lớn**.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Không phân trang | Một request kéo 500 MB, hết RAM | Phân trang mọi danh sách |
| Không có trần cho `limit` | `?limit=1000000` | `min(limit, 100)` |
| `OFFSET` cho job quét | **Xử lý trùng và bỏ sót âm thầm** | Con trỏ theo khoá chính |
| Cursor thiếu tie-breaker | Nhảy cóc hoặc lặp bản ghi | `(ts, id)` trong cả `ORDER BY` lẫn điều kiện |
| Cursor không ký | Client chế con trỏ trỏ dữ liệu người khác | HMAC vào con trỏ |
| Hạn mức trong bộ nhớ mỗi bản | ×N bản = sai N lần | Redis dùng chung |
| Fixed window | Bẫy biên → 2× tải trong 1 giây | Token bucket |
| Không trả header rate limit | Đối tác thử lại mù, làm tệ hơn | `X-RateLimit-*` + `Retry-After` |
| Endpoint đắt chung hạn mức với endpoint rẻ | `/search` ăn hết tài nguyên | Hạn mức riêng + chia khoang |
| Không đánh phiên bản | Không sửa được gì mà không phá client | `/v1` từ ngày đầu |
| Tắt `/v1` mà không đo ai còn dùng | Phá đối tác không báo trước | Log theo client + phiên bản |
| Đổi ý nghĩa trường (giá gồm thuế) | Sai số **im lặng**, không lỗi nào | Coi như thay đổi phá vỡ |
| Lỗi chỉ có `message` tiếng Việt | Client không bắt lỗi bằng máy được | `code` + `trace_id` |
| Không có idempotency cho `POST` | Trừ tiền hai lần khi retry | `Idempotency-Key` |
| Trả `total` mặc định trên bảng lớn | `COUNT(*)` đắt ở mọi request | Tuỳ chọn hoặc ước lượng |

## Câu hỏi phỏng vấn hay gặp

**H: Thiết kế một REST API an toàn và chịu tải cần gì?**
Bốn trụ cột. **Xác thực** — mọi request phải trả lời "bạn là ai", và kiểm token cục bộ bằng JWKS chứ đừng gọi auth-service mỗi lần. **Hạn mức** theo nhiều chiều (khoá, user, IP, endpoint), dùng chung giữa các bản gateway, và luôn trả header cho client biết đường. **Phân trang** mọi danh sách, ưu tiên con trỏ. **Phiên bản** từ ngày đầu. Bốn lớp đó xếp chồng lên nhau, không lớp nào thay được lớp nào.

**H: `LIMIT`/`OFFSET` có vấn đề gì?**
Trên bảng vài trăm dòng thì nó là lựa chọn đúng. Vấn đề là **`OFFSET` không nhảy, nó đếm** — muốn tới dòng thứ 100.000 thì database phải đọc đủ 100.000 dòng rồi vứt đi; đo thật là trang 1 mất 20 ms còn trang 5.000 mất 480 ms. Nhưng chậm thì người dùng còn chờ được; thứ giết người là **dữ liệu lệch**: có người chèn dòng mới vào đầu thì dòng cuối trang 1 nhảy sang trang 2, người dùng thấy nó hai lần, hoặc job quét xử lý trùng và bỏ sót mà không log nào báo. Em đổi sang **con trỏ**: so sánh theo dữ liệu thay vì bỏ qua theo vị trí — trang 5.000 cũng 20 ms. Cái giá là mất nút nhảy tới trang bất kỳ.

**H: Chọn thuật toán rate limit nào?**
**Token bucket** là mặc định, vì nó cho phép **bùng nổ ngắn** — đúng với hành vi thật của client, mở app là gọi 20 API cùng lúc — mà chỉ tốn hai con số mỗi khoá, và có hai tham số điều chỉnh độc lập là tốc độ và độ bùng nổ. Fixed window có **bẫy biên**: giới hạn 100/phút nhưng client gửi 100 lúc 10:00:59 và 100 lúc 10:01:00 là 200 request trong một giây mà vẫn đúng luật. Sliding window chính xác nhất nhưng tốn bộ nhớ vì lưu một mục cho mỗi request.

**H: Làm sao thêm tính năng mà không phá client cũ?**
Phân biệt thay đổi phá vỡ và không phá vỡ: thêm trường vào response hoặc thêm trường tuỳ chọn vào request thì an toàn; xoá, đổi tên, đổi kiểu, thêm trường bắt buộc thì phá vỡ. Nguy hiểm nhất là **đổi ý nghĩa của trường** — ví dụ giá từ chưa gồm thuế thành đã gồm thuế — vì nó không phát ra lỗi nào, chỉ có con số sai. Khi buộc phải phá vỡ: ra `/v2` song song, thêm header `Deprecation` và `Sunset`, **đo xem còn ai gọi `/v1`**, cho thời hạn 3–6 tháng rồi mới tắt. Bước đo là bước hay bị bỏ qua nhất — bạn không tắt được thứ mình không đo.

**H: Một endpoint nặng làm chậm cả hệ thống, xử lý sao?**
Năm lớp theo chi phí tăng dần: **hạn mức riêng** cho endpoint đắt; **cache** kết quả phổ biến; **tách database** cho nó đọc từ replica riêng; **chia khoang** — pool kết nối riêng để nó cạn pool của nó thì luồng thanh toán vẫn còn; và cuối cùng là **tách hẳn hệ chuyên dụng** như Elasticsearch. Lớp chia khoang ít người nghĩ tới nhưng cứu được nhiều nhất — như khoang tàu thuỷ, một khoang ngập không làm chìm cả tàu.

## Tóm tắt bài 5

- Bốn trụ cột: **xác thực**, **hạn mức**, **phân trang**, **phiên bản** — xếp chồng, không lớp nào thay được lớp nào.
- Kiểm token **cục bộ bằng JWKS** + cache vài chục giây, đừng gọi auth-service mỗi request.
- **Token bucket** là mặc định cho rate limit (cho bùng nổ, tốn ít bộ nhớ); hạn mức phải **dùng chung giữa các bản gateway** và luôn trả **`X-RateLimit-*` + `Retry-After`**.
- Giới hạn theo **nhiều chiều**: khoá, user, IP, và **endpoint đắt tiền có hạn riêng** + chia khoang.
- `OFFSET` **không nhảy, nó đếm** — chậm ở trang sâu, và **sai âm thầm** khi dữ liệu đổi. Con trỏ so sánh theo **dữ liệu**, phải có **tie-breaker** và nên **ký HMAC**.
- Luôn có **trần cứng cho `limit`**, và `total` là **tuỳ chọn** chứ không mặc định.
- Đánh **phiên bản từ ngày đầu**; nguy hiểm nhất là **đổi ý nghĩa trường** vì nó sai im lặng; và **đo trước khi tắt** `/v1`.

**Bài kế tiếp** → [Phase 4, Bài 1: Big O — thước đo của một lập trình viên giỏi](../phase-4/01-big-o-thuoc-do-cua-lap-trinh-vien-gioi.md)
