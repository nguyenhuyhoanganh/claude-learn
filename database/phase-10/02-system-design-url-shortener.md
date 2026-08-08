# Bài 2: System Design — URL Shortener

Bài toán nghe đơn giản nhất trong mọi bài system design:

```text
   POST /shorten   { "url": "https://example.com/rat/dai/..." }
   →  { "short": "https://sho.rt/9aX3kP" }

   GET  /9aX3kP    →  chuyển hướng 301/302 tới URL dài
```

Chính vì đơn giản nên nó là bài kiểm tra tốt: mọi quyết định đều lộ ra rõ ràng, và mỗi lựa chọn đều có đánh đổi đo được.

## Đặc điểm quyết định toàn bộ thiết kế

```text
   TỈ LỆ ĐỌC/GHI ≈ 100:1 tới 1000:1

   Một URL được rút gọn MỘT LẦN, nhưng được bấm HÀNG NGHÌN LẦN.
   → Mọi tối ưu phải dồn cho ĐƯỜNG ĐỌC.
   → Đường ghi có chậm hơn chút cũng không sao.
```

Ước lượng để có con số cụ thể:

```text
   100 triệu URL mới mỗi tháng
     →  100.000.000 / (30 × 86.400)  ≈  39 lần ghi/giây

   Tỉ lệ đọc/ghi 100:1
     →  ≈ 3.900 lần đọc/giây  (đỉnh ×3 ≈ 12.000)

   Dung lượng: mỗi bản ghi ~500 byte (URL dài + metadata)
     →  100 triệu × 500 byte     =  50 GB/tháng
     →  giữ 5 năm                =  3 TB
```

3 TB là con số quan trọng: nó nằm trong tầm **một máy chủ**. Bài này không cần sharding — và nói được điều đó là một điểm cộng.

---

## Thiết kế 1 — ID tự tăng chuyển sang base62

```sql
CREATE TABLE urls (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    long_url TEXT        NOT NULL,
    created  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```text
   GHI:  INSERT ... RETURNING id     →  id = 125
         ma_ngan = base62(125)       →  "27"
         tra ve  https://sho.rt/27

   ĐỌC:  GET /27
         id = base62_nguoc("27")     →  125
         SELECT long_url WHERE id = 125
         → 301 Redirect
```

Chuyển đổi base62 (dùng `0-9a-zA-Z`):

```python
BANG = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

def sang_base62(n):
    if n == 0:
        return BANG[0]
    s = []
    while n:
        n, du = divmod(n, 62)
        s.append(BANG[du])
    return ''.join(reversed(s))

def tu_base62(s):
    n = 0
    for c in s:
        n = n * 62 + BANG.index(c)
    return n
```

### Vì sao base62 và cần bao nhiêu ký tự

```text
   HỆ CƠ SỐ         KÝ TỰ DÙNG              7 KÝ TỰ CHỨA ĐƯỢC
   ────────         ──────────              ─────────────────
   base10           0-9                     10⁷  = 10 triệu
   base16           0-9a-f                  16⁷  = 268 triệu
   base62           0-9a-zA-Z               62⁷  = 3.521 TỶ
   base64           thêm + /                cần mã hoá URL → tránh

   → 7 KÝ TỰ BASE62 = 3,5 NGHÌN TỶ URL.
     Với 100 triệu URL/tháng thì đủ dùng ~2.900 NĂM.
```

Nếu chỉ cần 10 năm (12 tỷ URL) thì **6 ký tự** (`62⁶ ≈ 56 tỷ`) đã đủ.

### Ưu điểm

```text
   • Ghi CỰC nhanh: chỉ INSERT, KHÔNG cần kiểm tra trùng
     → database tự đảm bảo id duy nhất
     → không có vòng lặp "thử lại nếu trùng"
   • Đọc CỰC nhanh: tra khoá chính, index nhỏ (chỉ số nguyên 8 byte)
   • Không lãng phí: mã ngắn nhất có thể
```

Điểm "không cần kiểm tra trùng" đáng nhấn mạnh: nó nghĩa là đường ghi chỉ có **một** lần chạm database, không có vòng lặp, không có điều kiện tranh chấp.

### Ba vấn đề

**Vấn đề 1 — đoán được và duyệt được**

```text
   /27 tồn tại  →  thử /28, /29, /2a ...
   → duyệt được TOÀN BỘ URL trong hệ thống
   → lộ dữ liệu riêng tư của người dùng khác
```

**Vấn đề 2 — lộ quy mô kinh doanh**

```text
   Tạo hai URL cách nhau một ngày:
     hôm nay   →  /4Xj9k  →  giải mã = 1.245.883.221
     hôm qua   →  /4Xh2p  →  giải mã = 1.242.118.004
     hiệu      =  3.765.217

   → Đối thủ biết chính xác bạn xử lý 3,7 triệu URL/ngày.
   → Đây là "bài toán xe tăng Đức" áp dụng cho kinh doanh.
```

**Vấn đề 3 — điểm nghẽn khi có nhiều máy sinh ID**

Nếu sau này shard, `BIGSERIAL` của các shard sẽ đụng nhau.

---

## Thiết kế 2 — Mã ngẫu nhiên

```sql
CREATE TABLE urls (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code     TEXT        NOT NULL UNIQUE,       -- ← mã ngắn ngẫu nhiên
    long_url TEXT        NOT NULL,
    created  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_urls_code ON urls (code);
```

```python
import secrets

BANG = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

def sinh_ma(do_dai=7):
    return ''.join(secrets.choice(BANG) for _ in range(do_dai))

def rut_gon(long_url, so_lan_thu=5):
    for _ in range(so_lan_thu):
        ma = sinh_ma()
        try:
            cur.execute("INSERT INTO urls (code, long_url) VALUES (%s, %s)",
                        (ma, long_url))
            return ma
        except errors.UniqueViolation:
            continue                     # trùng → sinh mã khác
    raise RuntimeError("Không sinh được mã sau 5 lần thử")
```

Chú ý: dùng `secrets` chứ không phải `random`. `random` dùng bộ sinh giả ngẫu nhiên **đoán được** — quan sát vài mã là suy ra được trạng thái nội bộ và dự đoán mã tiếp theo.

### Xác suất trùng — nghịch lý ngày sinh

```text
   Không gian 7 ký tự base62 = 62⁷ ≈ 3,52 × 10¹²

   Xác suất có ÍT NHẤT MỘT lần trùng khi đã có n mã:
      P ≈ 1 − e^(−n²/2N)

   n = 1 triệu       →  P ≈ 0,000014%   (gần như không)
   n = 100 trieu     →  P ≈ 0,14%
   n = 1 ty          →  P ≈ 13%
   n = 2,2 ty        →  P ≈ 50%
```

Điểm quan trọng: xác suất trên là **có ít nhất một lần trùng trong toàn bộ lịch sử**, và mỗi lần trùng chỉ khiến **một** lần chèn phải thử lại. Với `UNIQUE` bảo vệ, trùng **không bao giờ gây sai dữ liệu**.

Nhưng khi bảng gần đầy, tỉ lệ phải thử lại tăng dần và đường ghi chậm đi.

### Ưu và nhược

| Ưu | Nhược |
|---|---|
| **Không đoán được** — không duyệt được | Ghi cần **kiểm tra trùng** → thêm một lần chạm database |
| **Không lộ quy mô** | Có thể phải thử lại nhiều lần khi gần đầy |
| Sinh được ở nhiều máy không cần phối hợp | Index trên chuỗi lớn hơn index trên số nguyên |

---

## Thiết kế 3 — Băm URL dài

```python
import hashlib, base64

def sinh_ma(long_url):
    h = hashlib.sha256(long_url.encode()).digest()
    return base64.urlsafe_b64encode(h)[:7].decode()
```

```text
   ƯU:
     • CÙNG một URL luôn cho CÙNG một mã → tự khử trùng lặp
     • Không cần bảng tra để kiểm tra "URL này đã rút gọn chưa"

   NHƯỢC:
     • Vẫn phải xử lý va chạm băm (hai URL khác nhau ra cùng mã)
     • KHÔNG tạo được hai mã khác nhau cho cùng một URL
       → nếu hai người dùng muốn thống kê riêng thì bó tay
     • Vẫn đoán được: biết URL dài là tính ra được mã ngắn
```

Nhược điểm thứ hai là lý do thiết kế này ít được dùng trong sản phẩm thật: người dùng thường muốn **theo dõi riêng** chiến dịch của mình, và cần các mã khác nhau cho cùng một đích đến.

---

## Thiết kế 4 — Kho mã sinh sẵn

Cách các hệ lớn dùng, vì nó gộp được ưu điểm của cả hai:

```text
   ┌──────────────────────────────────────────────────────────┐
   │  TIẾN TRÌNH NỀN                                          │
   │  Sinh sẵn hàng triệu mã ngẫu nhiên, đã kiểm tra duy nhất │
   │  Đổ vào bảng `code_pool` (status = 'free')               │
   └────────────────────────┬─────────────────────────────────┘
                            ▼
   ┌──────────────────────────────────────────────────────────┐
   │  KHI CÓ YÊU CẦU RÚT GỌN                                  │
   │  Lấy MỘT mã từ kho, đánh dấu đã dùng                     │
   │  → KHÔNG cần sinh, KHÔNG cần kiểm tra trùng              │
   │  → một thao tác database duy nhất                        │
   └──────────────────────────────────────────────────────────┘
```

```sql
CREATE TABLE code_pool (
    code   TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'free'
);
CREATE INDEX idx_pool_free ON code_pool (code) WHERE status = 'free';
```

```sql
-- Lấy một mã, an toàn với nhiều worker chạy song song
WITH lay AS (
    SELECT code FROM code_pool
     WHERE status = 'free'
     LIMIT 1
     FOR UPDATE SKIP LOCKED           -- ← chìa khoá của cả thiết kế này
)
UPDATE code_pool p SET status = 'used'
  FROM lay WHERE p.code = lay.code
RETURNING p.code;
```

`FOR UPDATE SKIP LOCKED` ([phase-8 bài 1](../phase-8/01-shared-lock-va-exclusive-lock.md)) cho phép hàng chục worker cùng lấy mã mà **không ai chờ ai và không ai lấy trùng**.

Index bộ phận `WHERE status = 'free'` giữ cho việc tìm mã rảnh luôn nhanh, kể cả khi bảng có hàng tỷ mã đã dùng — kỹ thuật ở [phase-4 bài 1](../phase-4/01-co-ban-ve-indexing.md).

Cảnh báo cần đặt:

```sql
SELECT count(*) FROM code_pool WHERE status = 'free';
-- Dưới 1 triệu → chạy tiến trình sinh thêm
```

---

## So sánh bốn thiết kế

| | ID tự tăng | Ngẫu nhiên | Băm URL | Kho sinh sẵn |
|---|---|---|---|---|
| Ghi | **1 lần chạm DB** | 1-N lần (thử lại) | 1-N lần | **1 lần chạm DB** |
| Đoán được | **Có** ✘ | Không ✔ | Có ✘ | Không ✔ |
| Lộ quy mô | **Có** ✘ | Không ✔ | Không ✔ | Không ✔ |
| Khử trùng URL | Không | Không | **Có** | Không |
| Nhiều mã cho một URL | Có | Có | **Không** ✘ | Có |
| Độ phức tạp | **Thấp nhất** | Thấp | Thấp | Cao |
| Sinh được ở nhiều máy | Khó | **Dễ** | Dễ | Dễ |

Khuyến nghị thực dụng:

```text
   Dự án nhỏ, nội bộ         →  ID tự tăng (đơn giản nhất)
   Sản phẩm công khai        →  Ngẫu nhiên (cân bằng tốt nhất)
   Quy mô rất lớn            →  Kho sinh sẵn
```

---

## Đường đọc — nơi 99% lưu lượng đi qua

### Truy vấn cơ bản

```sql
SELECT long_url FROM urls WHERE code = '9aX3kP';
```

Với index duy nhất trên `code`, đây là **index scan trả về 1 dòng**: khoảng 0,1-0,3 ms. Nhưng với 12.000 lượt/giây thì vẫn nên có cache.

### Cache

```python
def mo_rong(ma):
    url = redis.get(f"u:{ma}")
    if url:
        return url                            # ~0,2 ms

    cur.execute("SELECT long_url FROM urls WHERE code = %s", (ma,))
    row = cur.fetchone()
    if not row:
        redis.setex(f"u:{ma}", 60, "__KHONG_TON_TAI__")   # cache cả kết quả RỖNG
        return None

    redis.setex(f"u:{ma}", 86400, row[0])     # TTL 1 ngay
    return row[0]
```

Hai chi tiết quan trọng:

| Chi tiết | Vì sao |
|---|---|
| **Cache cả kết quả rỗng** | Không có nó, kẻ tấn công gửi hàng loạt mã không tồn tại sẽ dồn hết vào database (*cache penetration*) |
| **TTL dài (1 ngày)** | Ánh xạ mã → URL gần như không bao giờ đổi. TTL dài cho tỉ lệ trúng rất cao |

Dữ liệu này gần như **bất biến**, nên cache ở đây hiệu quả bất thường:

```text
   Tỉ lệ trúng cache thực tế: > 98%
   → chỉ ~240 truy vấn/giây xuống database thay vì 12.000
   → một máy Postgres bình thường thừa sức
```

### 301 hay 302 — quyết định ảnh hưởng tới thống kê

```text
   301 MOVED PERMANENTLY              302 FOUND (tạm thời)
   ═════════════════════              ════════════════════
   Trình duyệt CACHE VĨNH VIỄN        Trình duyệt KHÔNG cache
   → lần sau KHÔNG gọi server nữa     → mỗi lần đều gọi server

   ✔ giảm tải server rất nhiều        ✔ đếm được MỌI lần bấm
   ✘ MẤT hoàn toàn thống kê           ✘ server chịu tải đầy đủ
   ✘ KHÔNG đổi được đích đến          ✔ đổi được đích đến bất cứ lúc nào
```

Gần như mọi dịch vụ rút gọn URL thương mại dùng **302**, vì thống kê lượt bấm chính là sản phẩm của họ.

Nếu không cần thống kê chi tiết, dùng **301 kèm `Cache-Control: max-age=86400`** cho phép trình duyệt cache có thời hạn — gộp được cả hai lợi ích.

### Ghi thống kê mà không làm chậm chuyển hướng

```text
   ❌ SAI: ghi thẳng vào database trước khi chuyển hướng
      → thêm 5-20 ms vào MỌI lần bấm
      → và bảng click_events sẽ là điểm nóng ghi

   ✔ ĐÚNG: chuyển hướng NGAY, đẩy sự kiện vào hàng đợi
```

```python
def xu_ly_chuyen_huong(ma):
    url = mo_rong(ma)
    if not url:
        return 404

    # Không chờ — đẩy vào hàng đợi rồi trả về ngay
    hang_doi.push({"ma": ma, "luc": time.time(), "ip": request.ip,
                   "ua": request.user_agent})
    return redirect(url, code=302)
```

Worker gộp lô rồi ghi:

```sql
-- Ghi theo lô 1000 sự kiện thay vì từng cái
INSERT INTO click_events (code, clicked_at, ip, user_agent)
SELECT * FROM unnest(:codes, :times, :ips, :uas);

-- Và cập nhật bộ đếm tổng hợp theo lô
INSERT INTO click_counts (code, ngay, cnt)
SELECT code, date(clicked_at), count(*)
FROM ... GROUP BY 1, 2
ON CONFLICT (code, ngay) DO UPDATE SET cnt = click_counts.cnt + EXCLUDED.cnt;
```

---

## Các tính năng phát sinh

### Bí danh tuỳ chọn

```sql
ALTER TABLE urls ADD COLUMN is_custom BOOLEAN NOT NULL DEFAULT false;
```

```text
   Người dùng muốn:  sho.rt/my-brand

   Phải xử lý:
     • Va chạm với mã tự sinh
       → giải: mã tự sinh luôn ĐÚNG 7 ký tự,
               bí danh tuỳ chọn phải ≠ 7 ký tự (hoặc dùng tiền tố riêng)
     • Danh sách từ cấm (tên thương hiệu, từ tục)
     • Có cho đổi/xoá bí danh không → nếu có thì link cũ gãy
```

Mẹo "mã tự sinh luôn đúng 7 ký tự" rất gọn: nó biến bài toán va chạm thành **không thể xảy ra** thay vì phải kiểm tra.

### Hết hạn

```sql
ALTER TABLE urls ADD COLUMN expires_at TIMESTAMPTZ;
CREATE INDEX idx_urls_expires ON urls (expires_at) WHERE expires_at IS NOT NULL;
```

```sql
SELECT long_url FROM urls
 WHERE code = :ma AND (expires_at IS NULL OR expires_at > now());
```

Chú ý điều kiện hết hạn nằm **trong chính truy vấn** — link hết hạn tự động ngừng hoạt động mà không cần job dọn dẹp chạy đúng giờ. Job dọn vẫn nên có, nhưng chỉ để thu hồi dung lượng.

### Chống lạm dụng

```text
   • Giới hạn tần suất theo IP và theo tài khoản
   • Kiểm tra URL đích với danh sách đen (Google Safe Browsing)
   • Chặn tự trỏ về chính miền của mình (vòng lặp chuyển hướng)
   • Chặn giao thức không phải http/https (javascript:, data:)
```

Mục cuối là lỗ hổng bảo mật thật: cho phép `javascript:...` biến dịch vụ rút gọn URL thành công cụ tấn công XSS.

---

## Mô hình dữ liệu cuối cùng

```sql
CREATE TABLE urls (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       TEXT        NOT NULL,
    long_url   TEXT        NOT NULL,
    user_id    BIGINT      REFERENCES users(id),
    is_custom  BOOLEAN     NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_urls_code ON urls (code);
CREATE INDEX idx_urls_user ON urls (user_id, created_at DESC);
CREATE INDEX idx_urls_expires ON urls (expires_at) WHERE expires_at IS NOT NULL;

-- Sự kiện bấm: PHÂN MẢNH theo tháng, chỉ giữ 90 ngày
CREATE TABLE click_events (
    code       TEXT        NOT NULL,
    clicked_at TIMESTAMPTZ NOT NULL,
    ip         INET,
    user_agent TEXT,
    referer    TEXT
) PARTITION BY RANGE (clicked_at);

-- Bảng tổng hợp sẵn cho báo cáo
CREATE TABLE click_counts (
    code TEXT   NOT NULL,
    ngay DATE   NOT NULL,
    cnt  BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (code, ngay)
);
```

Ba quyết định trong mô hình này:

| Quyết định | Vì sao |
|---|---|
| `click_events` **phân mảnh theo tháng** | Xoá dữ liệu quá 90 ngày bằng `DROP` mảnh — mili-giây thay vì hàng giờ ([phase-6](../phase-6/01-database-partitioning-la-gi.md)) |
| Có bảng `click_counts` tổng hợp | Báo cáo đọc bảng nhỏ này, không quét bảng sự kiện hàng tỷ dòng |
| `idx_urls_expires` là **index bộ phận** | Chỉ đánh index các dòng thật sự có hạn — thường là thiểu số |

---

## Kiến trúc đầy đủ

```text
                       ┌──────────────┐
                       │     CDN      │  ← chặn phần lớn lưu lượng đọc
                       └──────┬───────┘
                              ▼
                       ┌──────────────┐
                       │ CÂN BẰNG TẢI │
                       └──────┬───────┘
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │ APP 1    │    │ APP 2    │    │ APP N    │  (không trạng thái)
        └────┬─────┘    └────┬─────┘    └────┬─────┘
             └───────────────┼───────────────┘
                  ┌──────────┴──────────┐
                  ▼                     ▼
          ┌──────────────┐      ┌──────────────┐
          │    REDIS     │      │  HÀNG ĐỢI    │
          │  (98% trúng) │      │ (sự kiện bấm)│
          └──────┬───────┘      └──────┬───────┘
                 │ 2% truot            │
                 ▼                     ▼
          ┌──────────────┐      ┌──────────────┐
          │  POSTGRES    │      │   WORKER     │
          │  primary     │◀─────┤ (ghi theo lô)│
          └──────┬───────┘      └──────────────┘
                 │
          ┌──────▼───────┐
          │   REPLICA    │  ← truy vấn phân tích, sao lưu
          └──────────────┘
```

Điểm đáng nói: **không có sharding**. Với 3 TB dữ liệu và 98% trúng cache, một máy PostgreSQL với vài replica là đủ. Nhận ra điều này là một điểm cộng lớn trong phỏng vấn — nhiều ứng viên vẽ ngay sharding vì tưởng "hệ thống lớn thì phải shard".

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng ID tự tăng cho dịch vụ công khai | Duyệt được toàn bộ URL, lộ quy mô kinh doanh | Mã ngẫu nhiên hoặc kho sinh sẵn |
| Dùng `random` thay vì `secrets` | Mã đoán được từ vài mẫu quan sát | Luôn dùng bộ sinh an toàn mật mã |
| Không cache kết quả rỗng | Kẻ tấn công gửi mã giả dồn hết vào database | Cache cả `__KHONG_TON_TAI__` với TTL ngắn |
| Dùng 301 rồi muốn thống kê | Trình duyệt cache vĩnh viễn, mất hoàn toàn thống kê | 302, hoặc 301 kèm `Cache-Control` có hạn |
| Ghi sự kiện bấm đồng bộ | Thêm 5-20 ms vào mọi lần chuyển hướng | Hàng đợi + ghi theo lô |
| Bảng sự kiện bấm không phân mảnh | Xoá dữ liệu cũ mất hàng giờ và làm phình bảng | Phân mảnh theo tháng, `DROP` mảnh |
| Không chặn giao thức `javascript:` | Lỗ hổng XSS qua dịch vụ của bạn | Chỉ cho phép `http`/`https` |
| Vẽ sharding ngay từ đầu | Phức tạp không cần thiết cho 3 TB | Tính dung lượng trước; một máy thường là đủ |
| Bí danh tuỳ chọn va chạm mã tự sinh | Ghi đè link của người khác | Mã tự sinh cố định 7 ký tự, bí danh phải khác độ dài |

## Tóm tắt bài 2

- Đặc điểm quyết định mọi thứ: **tỉ lệ đọc/ghi 100:1 tới 1000:1** — dồn toàn bộ tối ưu cho đường đọc.
- **7 ký tự base62 = 3,5 nghìn tỷ mã**, đủ dùng ~2.900 năm với tốc độ 100 triệu URL/tháng.
- Bốn thiết kế sinh mã: **ID tự tăng** (đơn giản nhất nhưng đoán được và lộ quy mô) · **ngẫu nhiên** (cân bằng tốt nhất) · **băm URL** (khử trùng nhưng không tạo được hai mã cho một URL) · **kho sinh sẵn** (dùng `FOR UPDATE SKIP LOCKED`, một lần chạm database).
- Xác suất trùng theo nghịch lý ngày sinh: **1 tỷ mã → 13%** khả năng có ít nhất một lần trùng — nhưng `UNIQUE` khiến nó chỉ tốn một lần thử lại, không bao giờ gây sai dữ liệu.
- **Cache cả kết quả rỗng** để chặn tấn công xuyên cache. Với TTL dài, tỉ lệ trúng > 98% — chỉ ~240 truy vấn/giây xuống database thay vì 12.000.
- **301 làm mất thống kê vĩnh viễn** vì trình duyệt cache; dịch vụ thương mại dùng **302**.
- Ghi sự kiện bấm phải **bất đồng bộ qua hàng đợi và theo lô** — không bao giờ chèn thêm độ trễ vào đường chuyển hướng.
- Bảng sự kiện bấm phải **phân mảnh theo tháng**, và phải có bảng tổng hợp sẵn cho báo cáo.
- Với 3 TB và 98% trúng cache, **một máy PostgreSQL với vài replica là đủ** — nhận ra rằng không cần sharding là một điểm cộng, không phải thiếu sót.

**Bài kế tiếp** → [Phase 11 — Bài 1: Database Engine là gì](../phase-11/01-database-engine-la-gi.md)
