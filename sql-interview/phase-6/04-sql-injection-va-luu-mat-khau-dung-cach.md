# Bài 4: SQL Injection và lưu mật khẩu đúng cách

2 giờ 47 phút sáng. Không một tiếng chuông báo động. Máy chủ vẫn xanh, tường lửa vẫn nguyên. Nhưng ngay lúc đó, 4 triệu tài khoản đang lặng lẽ chảy khỏi cơ sở dữ liệu.

Không có phần mềm gián điệp. Không có mật khẩu bị lộ. Kẻ tấn công chỉ **gõ một dòng chữ vào ô đăng nhập** — và cổng mở toang.

Làm sao một dòng chữ lại cướp được cả hệ thống? Bí mật nằm ở chỗ: với cơ sở dữ liệu, dòng chữ đó **không phải dữ liệu — nó là mệnh lệnh**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **SQL Injection** | in-giếc-shân | **Tiêm mã SQL** — dữ liệu người dùng trèo thành mệnh lệnh |
| **Prepared statement** | pri-pe-ơ | **Câu lệnh tham số hoá** — cấu trúc chốt trước, giá trị gửi sau |
| **Parameterized query** | | Tên gọi khác của prepared statement |
| **Allowlist** | a-lâu-lít | **Danh sách trắng** — chỉ chấp nhận giá trị nằm trong tập đã định |
| **Second-order injection** | | Payload lưu an toàn rồi **nổ ở query khác** |
| **Blind injection** | blain | Dò dữ liệu qua **đúng/sai** hoặc qua **thời gian phản hồi** |
| **Least privilege** | lít pri-vi-lịt | **Quyền tối thiểu** — chỉ cấp đúng quyền cần thiết |
| **Hash function** | hát | **Hàm băm** — một chiều, từ kết quả không tính ngược lại được |
| **Salt** | sôn | **Muối** — chuỗi ngẫu nhiên riêng từng người, trộn vào trước khi băm |
| **Pepper** | pép-pơ | **Tiêu** — khoá bí mật **chung**, lưu **ngoài** database |
| **Rainbow table** | rên-bâu | Bảng tra sẵn hàng tỷ cặp mật khẩu ↔ chuỗi băm |
| **Timing attack** | tai-ming | Dò bí mật qua **chênh lệch thời gian** phản hồi |

## Lỗ hổng nằm ở đúng một chỗ: chuỗi ghép chuỗi

```python
# ❌ Đoạn code đã giết 4 triệu tài khoản
sql = "SELECT * FROM users WHERE email = '" + email + "' AND password = '" + pw + "'"
cur.execute(sql)
```

Người dùng bình thường gõ `an@example.com`, câu lệnh thành:

```sql
SELECT * FROM users WHERE email = 'an@example.com' AND password = 'abc123'
```

Kẻ tấn công gõ `' OR '1'='1' --` vào ô email:

```sql
SELECT * FROM users WHERE email = '' OR '1'='1' --' AND password = 'abc123'
                              ▲──────────────▲ ▲───────────────────────────
                              phần chèn vào    bị biến thành chú thích
```

`'1'='1'` **luôn đúng**. Điều kiện không bao giờ sai. Mọi dòng trong bảng đều được coi là khớp, và server trả về người đầu tiên trong danh sách — thường là quản trị viên.

**Chỉ một dấu nháy đơn đủ để trèo từ ô dữ liệu ra ngoài, chạm tay vào phần điều khiển của câu lệnh.**

### Các dạng injection và mức nguy hiểm

| Dạng | Ví dụ payload | Kẻ tấn công lấy được gì |
|---|---|---|
| **Bypass xác thực** | `' OR '1'='1' --` | Đăng nhập thành admin |
| **UNION-based** | `' UNION SELECT username, password FROM users --` | Đọc bảng bất kỳ |
| **Error-based** | `' AND 1=CAST((SELECT version()) AS int) --` | Đọc dữ liệu qua thông báo lỗi |
| **Blind boolean** | `' AND substr(password,1,1)='a' --` | Dò từng ký tự qua đúng/sai |
| **Blind time-based** | `'; SELECT pg_sleep(5) --` | Dò từng ký tự qua thời gian phản hồi |
| **Stacked queries** | `'; DROP TABLE users; --` | Xoá/sửa dữ liệu (nếu driver cho phép nhiều lệnh) |
| **Out-of-band** | `'; COPY (SELECT ...) TO PROGRAM 'curl ...' --` | Tuồn dữ liệu ra ngoài |
| **Second-order** | Lưu payload vào DB, nổ ở query khác | Khó phát hiện nhất |

Dạng **blind time-based** đáng sợ vì nó không cần thấy kết quả. Kẻ tấn công hỏi *"ký tự đầu của mật khẩu admin có phải chữ 'a' không?"* — nếu đúng thì server trả lời chậm 5 giây, sai thì trả lời ngay. Lặp lại vài nghìn lần bằng script là dò hết cả bảng, và log của bạn chỉ thấy các request bình thường.

## Cách chữa duy nhất: **prepared statement** (câu lệnh tham số hoá)

```python
# ✅ ĐÚNG — dữ liệu và mệnh lệnh đi bằng hai đường khác nhau
cur.execute(
    "SELECT * FROM users WHERE email = %s AND password_hash = %s",
    (email, pw_hash)
)
```

Vì sao nó an toàn tuyệt đối — đây là phần cần hiểu, không phải học thuộc:

```text
Ghép chuỗi:
   [Câu lệnh + dữ liệu trộn lẫn]  →  database PHÂN TÍCH CÚ PHÁP cả cụm
   → dấu nháy trong dữ liệu được hiểu là dấu nháy của cú pháp
   → dữ liệu trèo thành mệnh lệnh

Prepared statement:
   Bước 1: [Câu lệnh có ô trống ?]  →  database phân tích cú pháp, LẬP KẾ HOẠCH
                                        Cấu trúc câu lệnh ĐÃ CHỐT tại đây.
   Bước 2: [Giá trị]                →  gửi RIÊNG, gắn vào ô trống
                                        Không bao giờ được phân tích cú pháp nữa.

   → Dù giá trị có chứa gì đi nữa, nó vẫn chỉ là MỘT CHUỖI.
   → ' OR '1'='1' -- trở thành: tìm người có email đúng bằng chuỗi
     "' OR '1'='1' --" → không có ai → đăng nhập thất bại.
```

Cú pháp theo ngôn ngữ:

```java
// Java JDBC
PreparedStatement ps = conn.prepareStatement(
    "SELECT * FROM users WHERE email = ? AND status = ?");
ps.setString(1, email);
ps.setString(2, status);
```

```javascript
// Node.js (pg)
await client.query('SELECT * FROM users WHERE email = $1', [email]);

// ❌ KHÔNG dùng template literal — nó chỉ là ghép chuỗi trá hình
await client.query(`SELECT * FROM users WHERE email = '${email}'`);
```

```go
// Go database/sql
db.QueryRow("SELECT * FROM users WHERE email = $1", email)
```

```php
// PHP PDO — nhớ TẮT emulation, nếu không PDO tự ghép chuỗi ở client
$pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
$stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
$stmt->execute([$email]);
```

Dòng `ATTR_EMULATE_PREPARES` rất quan trọng: mặc định PDO **giả lập** prepared statement bằng cách tự escape rồi ghép chuỗi ở phía client. Nó an toàn trong hầu hết trường hợp nhưng có lỗ hổng với một số bảng mã ký tự. Tắt nó đi để dùng prepared statement thật của server.

### Ba chỗ prepared statement **không** cứu được bạn

Đây là phần tách người đã đọc tài liệu với người đã làm.

**① Tên bảng, tên cột, `ORDER BY` — không tham số hoá được**

```python
# ❌ Sắp xếp động — không thể dùng %s cho tên cột
sql = f"SELECT * FROM orders ORDER BY {sort_col} {direction}"

# ✅ DANH SÁCH TRẮNG (allowlist) là cách duy nhất
COT_HOP_LE = {"ordered_at", "total_amount", "status"}
HUONG_HOP_LE = {"ASC", "DESC"}

if sort_col not in COT_HOP_LE or direction.upper() not in HUONG_HOP_LE:
    raise ValueError("Tham số sắp xếp không hợp lệ")
sql = f"SELECT * FROM orders ORDER BY {sort_col} {direction.upper()}"
```

**Không escape, không lọc ký tự — chỉ danh sách trắng.** Cố "làm sạch" đầu vào bằng regex hay `str.replace("'", "")` là con đường thua cuộc: luôn có một cách mã hoá bạn chưa nghĩ tới.

**② `LIKE` với ký tự đại diện**

```python
# Tham số hoá đúng, nhưng người dùng vẫn điều khiển được kết quả
cur.execute("SELECT * FROM products WHERE name LIKE %s", (f"%{tu_khoa}%",))
# Nhập "%" → khớp mọi dòng. Nhập "%%%%%%%%" trên bảng lớn → treo database.

# ✅ Escape ký tự đại diện trong chính giá trị
tu_khoa_an_toan = tu_khoa.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
cur.execute(
    "SELECT * FROM products WHERE name LIKE %s ESCAPE '\\' LIMIT 100",
    (f"%{tu_khoa_an_toan}%",)
)
```

Đây không phải injection, nhưng là **DoS qua truy vấn** — cùng một họ vấn đề: người dùng điều khiển được thứ họ không nên điều khiển.

**③ Second-order injection — payload ngủ đông**

```python
# Bước 1: lưu vào DB, hoàn toàn an toàn (có tham số hoá)
cur.execute("INSERT INTO users (username) VALUES (%s)", ("admin'--",))

# Bước 2: ở một chỗ khác, ai đó ĐỌC ra rồi ghép chuỗi
name = get_username(user_id)          # "admin'--"
cur.execute(f"SELECT * FROM logs WHERE user = '{name}'")   # 💥 nổ ở đây
```

Bài học: **mọi dữ liệu đều là dữ liệu không tin cậy, kể cả dữ liệu lấy từ chính database của bạn.** Không có khái niệm "đã được làm sạch một lần rồi thì mãi mãi sạch".

### ORM không miễn nhiễm

```python
# Django — an toàn
User.objects.filter(email=email)

# ❌ Django — .raw() và .extra() ghép chuỗi thì vẫn dính
User.objects.raw(f"SELECT * FROM users WHERE email = '{email}'")
User.objects.extra(where=[f"email = '{email}'"])
```

```java
// ❌ Hibernate HQL cũng bị injection y hệt SQL
String hql = "FROM User WHERE email = '" + email + "'";
session.createQuery(hql);

// ✅
session.createQuery("FROM User WHERE email = :email").setParameter("email", email);
```

```javascript
// ❌ Sequelize — sequelize.literal() và replacements sai cách
Model.findAll({ where: sequelize.literal(`email = '${email}'`) });

// ✅
Model.findAll({ where: { email } });
sequelize.query('SELECT * FROM users WHERE email = :email',
                { replacements: { email }, type: QueryTypes.SELECT });
```

## Lớp phòng thủ thứ hai: quyền tối thiểu

Prepared statement chặn injection. Nhưng nếu một chỗ nào đó vẫn thủng, **quyền hạn quyết định thiệt hại lớn tới đâu**.

```sql
-- ❌ Ứng dụng chạy bằng superuser — một lỗ hổng là mất tất cả
-- (đọc file hệ thống, chạy lệnh shell qua COPY TO PROGRAM, DROP mọi thứ)

-- ✅ Mỗi vai trò đúng quyền cần thiết
CREATE ROLE app_read  LOGIN PASSWORD '...';
CREATE ROLE app_write LOGIN PASSWORD '...';

GRANT CONNECT ON DATABASE shop TO app_read, app_write;
GRANT USAGE   ON SCHEMA public TO app_read, app_write;

GRANT SELECT                       ON ALL TABLES IN SCHEMA public TO app_read;
GRANT SELECT, INSERT, UPDATE       ON ALL TABLES IN SCHEMA public TO app_write;
-- Cố ý KHÔNG cấp DELETE, không cấp DDL

-- Chặn hẳn cột nhạy cảm khỏi vai trò đọc
REVOKE SELECT ON users FROM app_read;
GRANT  SELECT (user_id, full_name, city) ON users TO app_read;
```

Ba cấu hình nữa nên bật:

```sql
-- ① Chặn stacked queries ở tầng driver (tuỳ driver)
--    psycopg mặc định cho phép nhiều lệnh; MySQL cần multiStatements=false

-- ② Giới hạn thời gian và tài nguyên mỗi phiên
ALTER ROLE app_read SET statement_timeout = '10s';
ALTER ROLE app_read SET idle_in_transaction_session_timeout = '30s';

-- ③ Row Level Security cho hệ thống nhiều khách hàng (multi-tenant)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
    USING (tenant_id = current_setting('app.tenant_id')::bigint);
-- Ngay cả khi injection thành công, kẻ tấn công vẫn chỉ thấy dữ liệu tenant của mình
```

## Nửa sau: mật khẩu lưu vào database thế nào

Người phỏng vấn xoay màn hình lại và hỏi câu ngắn nhất trong buổi: *"Mật khẩu lưu vào cơ sở dữ liệu thế nào?"*

### Tầng 1: không lưu mật khẩu thô, lưu chuỗi băm

Ai cũng trả lời được. Đúng, và chưa đủ.

**Hàm băm** (*hash function*) là hàm một chiều: từ mật khẩu ra được chuỗi băm, nhưng từ chuỗi băm không tính ngược lại được.

```text
"matkhau123"  ──SHA-256──►  ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f
                    ▲
              không có đường ngược
```

### Tầng 2: hai người cùng mật khẩu thì hai ô băm trông thế nào?

**Giống hệt nhau, từng ký tự.** Hàm băm không có trí nhớ: cùng đầu vào luôn ra cùng đầu ra.

Và đây là chỗ lạnh gáy. Kẻ trộm **không bẻ từng người**. Nó đếm chuỗi nào lặp nhiều nhất:

```text
10 triệu tài khoản, cứ ~100 người có 1 người đặt "123456"
→ Bẻ MỘT chuỗi băm là mở được 100.000 tài khoản.

Tệ hơn: rainbow table — bảng tra cứu dựng sẵn hàng tỷ cặp
        (mật khẩu phổ biến ↔ chuỗi băm). Tra một phát ra ngay.
```

**Cách chặn rẻ thôi: muối (salt).** Mỗi người một chuỗi ngẫu nhiên riêng, trộn vào trước khi băm, lưu ngay cạnh chuỗi băm.

```text
người A: hash("matkhau123" + "x7f2a9b1...")  →  e3b0c442...
người B: hash("matkhau123" + "k91mZq4p...")  →  9f86d081...
                                                    ▲
                              Cùng mật khẩu, hai chuỗi băm khác nhau hoàn toàn.
                              → Rainbow table vô dụng.
                              → Không đếm được ai trùng mật khẩu với ai.
```

Muối **không cần bí mật** — nó nằm công khai cạnh chuỗi băm. Mục đích của nó không phải giấu, mà là **làm mỗi mật khẩu trở thành một bài toán riêng**.

### Tầng 3: bẻ một mật khẩu 8 ký tự mất bao lâu?

Đây là chỗ đáp án tầng 2 chết. Muối chặn được kiểu bẻ hàng loạt, nhưng **tốc độ mỗi lượt thử** mới quyết định tất cả.

```text
Một card đồ hoạ chơi game (RTX 4090):
   SHA-256    ~ 10.000.000.000 lượt/giây   (10 tỷ)
   MD5        ~ 60.000.000.000 lượt/giây

Mật khẩu 8 ký tự chữ + số (62^8 ≈ 2,2×10^14 tổ hợp):
   Với SHA-256 trên 1 GPU  →  vài giờ
   Với 8 GPU               →  chưa tới 1 giờ

→ SHA-256 SINH RA ĐỂ CHẠY NHANH. Đó chính là lý do nó SAI cho mật khẩu.
```

Cách chữa: dùng hàm **cố tình chậm**, và chỉnh tham số chi phí cho tới khi mỗi lần kiểm mất khoảng **0,2 giây**.

| Hàm | Năm | Chống được gì | Tham số cần chỉnh |
|---|---|---|---|
| MD5, SHA-1, SHA-256 | — | **Không gì cả** — quá nhanh | (đừng dùng) |
| **bcrypt** | 1999 | CPU brute force | `cost` (10–12) |
| **scrypt** | 2009 | + tấn công bằng GPU (tốn RAM) | `N`, `r`, `p` |
| **Argon2id** | 2015 | + GPU + ASIC + side-channel | `memory`, `iterations`, `parallelism` |
| PBKDF2 | 2000 | CPU brute force (yếu hơn) | `iterations` (≥600.000) |

**Argon2id là lựa chọn mặc định hôm nay** (thắng Password Hashing Competition 2015, được OWASP khuyến nghị). bcrypt vẫn hoàn toàn chấp nhận được và có thư viện ở mọi ngôn ngữ.

```text
Với Argon2id chỉnh để mỗi lần kiểm mất 0,2 giây:
   Tốc độ bẻ tụt từ 10 TỶ lượt/giây xuống còn ~5 lượt/giây trên mỗi lõi.
   → Nhanh hơn 2 tỷ lần thành chậm hơn 2 tỷ lần.
```

```python
# Python — argon2-cffi
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError

ph = PasswordHasher(
    time_cost=3,        # số vòng lặp
    memory_cost=65536,  # 64 MB RAM mỗi lần băm — đây là thứ chặn GPU
    parallelism=4,
)

# Đăng ký
hash_luu = ph.hash(mat_khau)   # muối được sinh và nhúng SẴN trong chuỗi kết quả
# $argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG

# Đăng nhập
try:
    ph.verify(hash_luu, mat_khau_nhap)
    if ph.check_needs_rehash(hash_luu):        # tham số đã cũ → nâng cấp tại chỗ
        luu_hash_moi(ph.hash(mat_khau_nhap))
except VerifyMismatchError:
    raise LoiDangNhap("Email hoặc mật khẩu không đúng")
```

Chú ý: chuỗi kết quả của Argon2/bcrypt **đã chứa sẵn muối và tham số** ngay bên trong. Bạn chỉ cần một cột:

```sql
CREATE TABLE users (
    user_id       BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,   -- không cần cột salt riêng
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Ba chi tiết ghi điểm

**① So sánh phải hằng thời gian.** Nếu bạn so bằng `==` thường, hàm dừng ngay ở ký tự sai đầu tiên, và thời gian trả lời rò rỉ manh mối. Chênh vài micro giây, nhưng đủ để dò từng ký tự. Thư viện băm mật khẩu đã lo việc này; nhưng nếu bạn tự so sánh token thì phải dùng `hmac.compare_digest` (Python) / `crypto.timingSafeEqual` (Node).

**② Không tiết lộ email có tồn tại hay không.** Trả cùng một thông báo `"Email hoặc mật khẩu không đúng"` cho cả hai trường hợp, **và** phải mất cùng một khoảng thời gian — nghĩa là khi email không tồn tại, vẫn phải chạy một phép băm giả để không lộ qua thời gian phản hồi.

**③ Pepper (tiêu) — lớp bổ sung.** Một khoá bí mật **chung**, lưu ngoài database (biến môi trường / HSM / KMS), trộn thêm vào trước khi băm. Nếu kẻ trộm chỉ lấy được database mà không lấy được server, chúng vẫn bó tay hoàn toàn.

```python
import hmac, hashlib, os
PEPPER = os.environ["PASSWORD_PEPPER"]     # KHÔNG nằm trong database

def bam(mat_khau: str) -> str:
    tron = hmac.new(PEPPER.encode(), mat_khau.encode(), hashlib.sha256).hexdigest()
    return ph.hash(tron)
```

Cái giá của pepper: **xoay khoá rất khó** (phải bắt mọi người đổi mật khẩu), và mất khoá là mất toàn bộ mật khẩu. Chỉ dùng khi đã có quy trình quản lý khoá tử tế.

### Nâng cấp hàm băm cũ mà không bắt người dùng đổi mật khẩu

```python
def dang_nhap(email, mat_khau):
    u = tim_user(email)
    if not u:
        ph.hash("dummy")                  # tốn cùng thời gian → không lộ
        raise LoiDangNhap()

    if u.password_hash.startswith("$argon2"):
        ph.verify(u.password_hash, mat_khau)
    elif u.password_hash.startswith("$2b$"):          # bcrypt cũ
        if not bcrypt.checkpw(mat_khau.encode(), u.password_hash.encode()):
            raise LoiDangNhap()
        cap_nhat_hash(u.user_id, ph.hash(mat_khau))   # nâng cấp NGAY tại lần đăng nhập này
    else:                                              # SHA-256 thời tiền sử
        if hashlib.sha256(mat_khau.encode()).hexdigest() != u.password_hash:
            raise LoiDangNhap()
        cap_nhat_hash(u.user_id, ph.hash(mat_khau))
```

Sau vài tháng, phần lớn tài khoản đã nâng cấp. Số còn lại (người không đăng nhập) thì buộc đặt lại mật khẩu.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Bạn tiếp quản một dự án cũ. Sếp hỏi *"code này có bị SQL injection không?"* Có 340 file.

**Đừng đọc tay. Quét theo bốn mẫu này:**

```bash
# ① Ghép chuỗi trực tiếp — thủ phạm số 1
grep -rn --include=*.py -E "execute\(.*[\"'].*\+|execute\(f[\"']" .

# ② f-string / template literal trong câu lệnh
grep -rn --include=*.js -E "query\(\`.*\\\$\{"
grep -rn --include=*.py -E "(SELECT|INSERT|UPDATE|DELETE).*\{.*\}" .

# ③ ORM có đường thoát — nơi ORM KHÔNG cứu được
grep -rn -E "\.raw\(|\.extra\(|createQuery\(\"|sequelize\.literal\(" .

# ④ ORDER BY / tên cột động — không tham số hoá được
grep -rn -E "ORDER BY.*(\+|\$\{|%s|f\")" .
```

**Rồi phân loại theo mức nguy hiểm để sửa có thứ tự:**

```text
   ĐỎ   — ghép chuỗi với dữ liệu từ request        → sửa NGAY
   CAM  — ORDER BY/tên cột từ input                → danh sách trắng
   VÀNG — ghép chuỗi với dữ liệu từ DATABASE        → second-order, vẫn phải sửa
   XANH — ghép chuỗi với hằng số trong code         → an toàn, để sau
```

**Sửa mẫu:**

```python
# ❌ ĐỎ
cur.execute(f"SELECT * FROM users WHERE email = '{email}'")
# ✅
cur.execute("SELECT * FROM users WHERE email = %s", (email,))

# ❌ CAM — không tham số hoá được tên cột
sql = f"SELECT * FROM orders ORDER BY {sort} {dir}"
# ✅ DANH SÁCH TRẮNG là cách DUY NHẤT
COT = {"ordered_at", "total_amount", "status"}
HUONG = {"ASC", "DESC"}
if sort not in COT or dir.upper() not in HUONG:
    raise ValueError("Tham số sắp xếp không hợp lệ")
sql = f"SELECT * FROM orders ORDER BY {sort} {dir.upper()}"
```

**Chặn tái diễn — để máy canh, đừng để người nhớ:**

```yaml
# .pre-commit-config.yaml — chặn ngay trước khi commit
- repo: https://github.com/PyCQA/bandit
  hooks: [{ id: bandit, args: ["-s", "B608"] }]   # B608 = hardcoded_sql_expressions
```

> **Tình huống 2:** Database bị rò. Bảng `users` có cột `password` chứa chuỗi 64 ký tự hex. Sếp hỏi *"khách hàng có nguy hiểm không?"*

**Chẩn đoán trong 3 câu lệnh — trả lời được chính xác mức độ:**

```sql
-- ① Đang dùng hàm băm nào? (nhìn tiền tố là biết)
SELECT left(password, 8), count(*) FROM users GROUP BY 1 ORDER BY 2 DESC;
--  $argon2i |  12000     → Argon2 — AN TOÀN
--  $2b$12$  |   3000     → bcrypt — AN TOÀN
--  (64 hex) | 850000     → SHA-256 KHÔNG MUỐI — NGUY HIỂM

-- ② CÓ MUỐI KHÔNG? Đếm chuỗi băm trùng nhau
SELECT count(*) - count(DISTINCT password) AS so_ban_ghi_trung FROM users;
--  47.320  → CÓ TRÙNG → KHÔNG CÓ MUỐI
--       0  → có muối riêng từng người

-- ③ Chuỗi băm nào lặp nhiều nhất? (đây là mật khẩu phổ biến)
SELECT password, count(*) FROM users GROUP BY 1 ORDER BY 2 DESC LIMIT 5;
--  8d969ee... | 9840    ← chính là SHA-256 của "123456"
```

**Đánh giá thiệt hại — nói được con số:**

```text
   SHA-256 không muối:
      Một GPU chơi game thử ~10 tỷ chuỗi/giây.
      → mật khẩu 8 ký tự chữ+số: dò cạn trong VÀI GIỜ
      → và không có muối nên bẻ MỘT chuỗi mở được TẤT CẢ người dùng cùng mật khẩu

   → PHẢI coi như TOÀN BỘ mật khẩu đã lộ.
```

**Cách xử lý — theo thứ tự khẩn cấp:**

```text
   ① BẮT BUỘC ĐẶT LẠI MẬT KHẨU cho mọi tài khoản — không có lựa chọn khác
   ② HUỶ MỌI PHIÊN đang hoạt động (nếu không, kẻ trộm vẫn đang ở trong)
   ③ Thông báo cho người dùng — và nhắc họ đổi mật khẩu ở nơi khác nếu dùng chung
   ④ Chuyển sang Argon2id, nâng cấp NGAY tại lần đăng nhập
```

```sql
-- ② Huỷ mọi phiên: đặt mốc thu hồi cho toàn hệ thống
UPDATE users SET tokens_invalid_before = now();
DELETE FROM sessions;
```

```python
# ④ Nâng cấp dần, không bắt ai chờ
def dang_nhap(email, mat_khau):
    u = tim_user(email)
    if not u:
        ph.hash("dummy"); raise LoiDangNhap()      # tốn cùng thời gian → không lộ

    if u.password.startswith("$argon2"):
        ph.verify(u.password, mat_khau)
    else:                                           # SHA-256 cũ
        if hashlib.sha256(mat_khau.encode()).hexdigest() != u.password:
            raise LoiDangNhap()
        cap_nhat_hash(u.id, ph.hash(mat_khau))      # NÂNG CẤP ngay tại đây
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Ghép chuỗi để tạo SQL | Injection | Prepared statement, không ngoại lệ |
| Template literal trong JS/Python f-string | Ghép chuỗi trá hình | Dùng `$1` / `%s` với tham số |
| Escape thủ công thay vì tham số hoá | Luôn có cách mã hoá bạn chưa nghĩ tới | Tham số hoá |
| `ORDER BY` từ input người dùng | Không tham số hoá được | **Danh sách trắng** |
| Tin dữ liệu đọc từ chính database | Second-order injection | Mọi dữ liệu đều không tin cậy |
| ORM `.raw()` / HQL ghép chuỗi | ORM không cứu được | Tham số hoá kể cả trong ORM |
| PDO không tắt `EMULATE_PREPARES` | Ghép chuỗi ở client | `setAttribute(..., false)` |
| Ứng dụng chạy bằng superuser | Một lỗ hổng = mất tất cả | Vai trò quyền tối thiểu |
| Lưu mật khẩu bằng MD5/SHA-256 | Bẻ 8 ký tự trong vài giờ | Argon2id / bcrypt |
| Không có muối riêng từng người | Bẻ một chuỗi mở hàng trăm nghìn tài khoản | Muối ngẫu nhiên mỗi người |
| Muối chung cho cả hệ thống | Rainbow table dựng riêng vẫn được | Muối phải riêng từng dòng |
| Thông báo "email không tồn tại" | Lộ danh sách người dùng | Cùng thông báo, cùng thời gian |
| Không bao giờ đo lại chi phí băm | Phần cứng nhanh dần, tham số cũ thành yếu | Đo lại mỗi 1–2 năm |
| Log câu lệnh SQL kèm tham số | Mật khẩu/token nằm trong log | Che tham số nhạy cảm |

## Câu hỏi phỏng vấn hay gặp

**H: SQL Injection là gì và chặn thế nào?**
Là khi dữ liệu người dùng được ghép vào câu lệnh rồi database phân tích cú pháp cả cụm, nên một dấu nháy đơn đủ để trèo từ ô dữ liệu ra phần điều khiển. Cách chặn duy nhất là **prepared statement**: câu lệnh được phân tích và lập kế hoạch **trước**, giá trị gửi **sau** theo đường riêng và không bao giờ được phân tích cú pháp nữa. Escape thủ công không phải giải pháp.

**H: Prepared statement có chỗ nào không cứu được không?**
Ba chỗ: tên bảng/cột và `ORDER BY` không tham số hoá được — phải dùng danh sách trắng; `LIKE` vẫn cho người dùng nhập `%` gây quét toàn bảng — phải escape ký tự đại diện và đặt `LIMIT`; và second-order injection, khi payload được lưu an toàn rồi nổ ở một query khác ghép chuỗi. Nguyên tắc: dữ liệu đọc từ chính database cũng là dữ liệu không tin cậy.

**H: Mật khẩu lưu vào database thế nào?**
Không lưu mật khẩu thô, chỉ lưu chuỗi băm. Mỗi người một chuỗi **muối riêng** — vì hàm băm không có trí nhớ, hai người cùng mật khẩu sẽ ra hai ô giống hệt nhau, và kẻ trộm chỉ cần đếm chuỗi nào lặp nhiều nhất. Băm bằng hàm **cố tình chậm** — Argon2id hoặc bcrypt, đừng dùng SHA-256. Chỉnh chi phí tới khi một lần kiểm mất khoảng 0,2 giây, và **đo lại sau vài năm** vì phần cứng nhanh dần.

**H: Vì sao SHA-256 sai cho mật khẩu?**
Vì nó được thiết kế để chạy nhanh. Một card đồ hoạ chơi game thử được khoảng 10 tỷ chuỗi SHA-256 mỗi giây, nên mật khẩu 8 ký tự chữ và số bị dò cạn trong vài giờ. Argon2id chỉnh ở mức 0,2 giây mỗi lần kiểm sẽ đưa tốc độ đó về vài lượt mỗi giây — và nó còn tốn RAM, nên GPU mất luôn lợi thế song song.

**H: Muối có cần giữ bí mật không?**
Không. Muối nằm công khai ngay cạnh chuỗi băm — Argon2 và bcrypt còn nhúng nó thẳng vào chuỗi kết quả. Mục đích của muối không phải giấu, mà là làm mỗi mật khẩu thành một bài toán riêng để rainbow table vô dụng. Thứ **cần** giữ bí mật là **pepper** — khoá chung lưu ngoài database, để kẻ chỉ lấy được database vẫn bó tay.

## Tóm tắt bài 4

- Injection xảy ra vì dữ liệu và mệnh lệnh **đi chung một đường**; prepared statement tách chúng ra hai đường — cấu trúc câu lệnh chốt trước, giá trị gắn sau.
- Ba chỗ prepared statement không cứu: **`ORDER BY`/tên cột** (dùng danh sách trắng), **`LIKE` với `%`** (escape + `LIMIT`), **second-order** (dữ liệu từ DB cũng không tin cậy).
- ORM **không** miễn nhiễm — `.raw()`, HQL, `sequelize.literal()` đều ghép chuỗi.
- Lớp phòng thủ thứ hai là **quyền tối thiểu**: vai trò riêng, không superuser, `statement_timeout`, Row Level Security cho multi-tenant.
- Mật khẩu: **băm + muối riêng từng người + hàm cố tình chậm** (Argon2id / bcrypt). SHA-256 sai vì nó nhanh — 10 tỷ lượt/giây trên một GPU.
- Chỉnh chi phí băm tới ~**0,2 giây/lần kiểm**, đo lại mỗi 1–2 năm, và nâng cấp hash cũ **ngay tại lần đăng nhập** thay vì bắt người dùng đổi mật khẩu.

**Bài kế tiếp** → [Phase 7, Bài 1: SQL vs NoSQL — chọn đúng loại database](../phase-7/01-sql-vs-nosql-chon-dung-loai-database.md)
