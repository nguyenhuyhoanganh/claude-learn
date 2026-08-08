# Bài 1: Bảo mật kết nối Database với TLS/SSL

Bật Wireshark, bắt gói tin giữa ứng dụng và PostgreSQL, rồi mở một gói ra xem:

```text
0000   50 00 00 00 3c 00 03 00  75 73 65 72 00 70 6f 73   P...<... user.pos
0010   74 67 72 65 73 00 64 61  74 61 62 61 73 65 00 6d   tgres.da tabase.m
0020   79 64 62 00 00                                     ydb..

0000   51 00 00 00 4a 53 45 4c  45 43 54 20 63 61 72 64   Q...JSEL ECT card
0010   5f 6e 75 6d 62 65 72 2c  20 63 76 76 20 46 52 4f   _number,  cvv FRO
0020   4d 20 70 61 79 6d 65 6e  74 73 20 57 48 45 52 45   M paymen ts WHERE
```

Tên người dùng, tên database, và **toàn bộ câu SQL kèm dữ liệu trả về** — tất cả đều là văn bản thuần. Bất kỳ ai đứng giữa đường truyền đều đọc được.

Bài này về cách đóng lỗ hổng đó, và về ba cấp độ bảo vệ mà nhiều người tưởng là một.

## Ba nơi dữ liệu cần được bảo vệ

```text
   ┌────────────────────────────────────────────────────────────────┐
   │ 1. KHI TRUYỀN (in transit)                                     │
   │    Giữa ứng dụng và database, hoặc giữa primary và replica     │
   │    → TLS/SSL                        ← bài này                  │
   ├────────────────────────────────────────────────────────────────┤
   │ 2. KHI LƯU (at rest)                                           │
   │    File dữ liệu trên đĩa, bản sao lưu, ổ đĩa bị vứt bỏ         │
   │    → mã hoá đĩa, mã hoá cột, TDE                               │
   ├────────────────────────────────────────────────────────────────┤
   │ 3. KHI DÙNG (in use)                                           │
   │    Dữ liệu đang nằm trong RAM khi database xử lý               │
   │    → mã hoá đồng cấu, vùng thực thi tin cậy   ← [phase-15]     │
   └────────────────────────────────────────────────────────────────┘
```

Ba lớp này **độc lập với nhau**. Mã hoá đĩa không bảo vệ gì khi dữ liệu đang truyền; TLS không bảo vệ gì khi ai đó lấy được ổ cứng.

---

## Giao thức dây của PostgreSQL

Trước khi mã hoá, cần biết chính xác cái gì đang truyền:

```text
   CLIENT                                   SERVER
     │                                         │
     │──── StartupMessage ────────────────────▶│  tên người dùng, tên database
     │◀─── AuthenticationRequest ──────────────│  yêu cầu xác thực
     │──── PasswordMessage ───────────────────▶│  chứng minh
     │◀─── AuthenticationOk, ParameterStatus ──│
     │◀─── ReadyForQuery ──────────────────────│
     │                                         │
     │──── Query: "SELECT ..." ───────────────▶│  ← VĂN BẢN THUẦN
     │◀─── RowDescription, DataRow... ─────────│  ← VĂN BẢN THUẦN
     │◀─── CommandComplete, ReadyForQuery ─────│
```

Mỗi thông điệp có dạng: **1 byte kiểu** + **4 byte độ dài** + nội dung.

```text
   'Q' = Query          'R' = Authentication
   'P' = Parse          'T' = RowDescription
   'B' = Bind           'D' = DataRow
   'E' = Execute        'C' = CommandComplete
   'S' = Sync           'Z' = ReadyForQuery
```

Bắt xem trực tiếp:

```bash
sudo tcpdump -i any -A 'port 5432' | grep -A2 SELECT
```

Đây là bài tập nên làm một lần: nhìn thấy câu SQL của chính mình chạy qua mạng dưới dạng chữ khiến việc bật TLS trở nên rất dễ thuyết phục.

### Câu SQL dài bao nhiêu thì gãy?

Một thí nghiệm đáng làm, vì kết quả của nó giải thích một lỗi hiệu năng rất hay gặp: gửi câu `SELECT ... WHERE id IN (...)` với danh sách hàng nghìn giá trị.

```javascript
// Sinh câu SQL dài dần rồi gửi, xem Wireshark đếm được bao nhiêu gói TCP
let sql = 'SELECT * FROM t WHERE id = 1';
for (let i = 0; i < N; i++) sql += ` OR id = ${i}`;
await client.query(sql);
```

```text
   N          KÍCH THƯỚC     GÓI TCP PHẢI GHÉP     KẾT QUẢ
   ────────   ──────────     ─────────────────     ────────────────────
   1               ~60 B                 1         xong ngay
   100          ~1,0 KB                  1         xong ngay
   1.000         ~12 KB                  9         xong
   10.000       ~125 KB                 90         xong, bắt đầu chậm
   100.000      ~1,3 MB                960         xong, RẤT nhiều gói gửi lại
   1.000.000     ~14 MB                  —         SẬP SERVER
```

```text
FATAL:  terminating connection because of crash of another server process
DETAIL: The postmaster has commanded this server process to roll back the
        current transaction and exit...
```

Ba điều rút ra:

```text
   1. KHÔNG CÓ GIỚI HẠN CỨNG rõ ràng.
      PostgreSQL nhận được câu 1,3 MB. Nhưng "nhận được" ≠ "nên làm".

   2. MỖI GÓI TCP PHẢI ĐƯỢC XÁC NHẬN.
      960 gói = 960 lần chờ xác nhận, và nếu một gói mất thì
      PHẢI GỬI LẠI và chờ GHÉP LẠI đúng thứ tự.
      → độ trễ tăng PHI TUYẾN theo kích thước câu lệnh.

   3. Câu lệnh không lọt được trong MỘT gói thì không còn "gửi một phát".
      Đây là lý do thật sự khiến `IN (10.000 giá trị)` chậm,
      chứ không phải vì database xử lý chậm.
```

Cách viết đúng thay cho danh sách `IN` khổng lồ:

```sql
-- SAI: 10.000 giá trị nối thành chuỗi → ~125 KB, 90 gói TCP
SELECT * FROM t WHERE id IN (1, 2, 3, ..., 10000);

-- ĐÚNG 1: truyền một MẢNG làm THAM SỐ (một giá trị nhị phân gọn)
SELECT * FROM t WHERE id = ANY($1);          -- $1 = mảng int[]

-- ĐÚNG 2: đưa danh sách vào BẢNG TẠM rồi JOIN
CREATE TEMP TABLE ids (id BIGINT PRIMARY KEY);
COPY ids FROM STDIN;                          -- COPY, không phải INSERT
SELECT t.* FROM t JOIN ids USING (id);

-- ĐÚNG 3: nếu danh sách đến TỪ CHÍNH database, dùng subquery
SELECT * FROM t WHERE id IN (SELECT user_id FROM active_users);
```

Cách 1 là cách gọn nhất và nên là mặc định — mảng được truyền ở **dạng nhị phân**, không phải nối chuỗi, nên 10.000 số nguyên chỉ tốn ~40 KB thay vì 125 KB, và quan trọng hơn: **kế hoạch truy vấn được tái sử dụng** thay vì phải phân tích lại một câu SQL mới mỗi lần.

> **Ghi chú vận hành:** nếu bạn thấy trong log những câu SQL dài hàng trăm KB, đó gần như luôn là ORM đang nối chuỗi `IN` từ kết quả của một truy vấn trước — chính là mẫu N+1 biến tướng. Xem [orm-n-plus-1](../../orm-n-plus-1/README.md).

### Wire protocol của hệ khác — và cách xem khi đã mã hoá

MongoDB **luôn** mã hoá theo mặc định, nên `tcpdump` không đọc được gì. Muốn xem vẫn có cách — bằng cách để client tự nhả khoá phiên:

```bash
# NodeJS: xuất khoá phiên TLS ra file
SSLKEYLOGFILE=/tmp/keys.log node app.js
```

```text
Wireshark → Preferences → Protocols → TLS
          → (Pre)-Master-Secret log filename: /tmp/keys.log
→ Wireshark giải mã và HIỂN THỊ được giao thức MongoDB bên trong
```

```text
   ⚠ KỸ THUẬT NÀY LÀ CON DAO HAI LƯỠI
     • Rất hữu ích khi GỠ LỖI ở máy phát triển
     • Nhưng file khoá đó giải mã được TOÀN BỘ phiên
     → TUYỆT ĐỐI không bật SSLKEYLOGFILE trên sản phẩm thật
     → và không commit file khoá vào git
```

Điểm đáng nhớ chung: **mọi database đều có giao thức dây riêng**, và tất cả đều truyền câu lệnh cùng dữ liệu. Khác biệt duy nhất là hệ nào bật mã hoá theo mặc định:

| Hệ | Mã hoá mặc định | Ghi chú |
|---|---|---|
| PostgreSQL | **Không** (`prefer`) | Phải tự bắt buộc bằng `hostssl` |
| MySQL | Có từ 8.0 (`PREFERRED`) | Vẫn hạ cấp được — cần `VERIFY_IDENTITY` |
| MongoDB Atlas | **Có, bắt buộc** | Không tắt được |
| Redis | **Không** | Phải bật `tls-port` |

---

## Bật TLS cho PostgreSQL

### Tạo chứng chỉ

```bash
# CA tự ký (sản phẩm thật nên dùng CA nội bộ hoặc Let's Encrypt)
openssl req -new -x509 -days 3650 -nodes -out ca.crt -keyout ca.key \
  -subj "/CN=my-internal-ca"

# Khoá và yêu cầu ký cho server
openssl req -new -nodes -out server.csr -keyout server.key \
  -subj "/CN=db.example.com"

# CA ký chứng chỉ cho server
openssl x509 -req -in server.csr -days 825 -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out server.crt

chmod 600 server.key
chown postgres:postgres server.key server.crt
```

Trường `CN` phải khớp với **tên máy chủ mà client dùng để kết nối**. Sai chỗ này là nguyên nhân phổ biến nhất của lỗi xác minh chứng chỉ.

### Cấu hình server

```ini
# postgresql.conf
ssl = on
ssl_cert_file = '/etc/postgresql/certs/server.crt'
ssl_key_file  = '/etc/postgresql/certs/server.key'
ssl_ca_file   = '/etc/postgresql/certs/ca.crt'      # cần nếu xác thực client

ssl_min_protocol_version = 'TLSv1.2'                # KHÔNG cho TLS 1.0/1.1
ssl_prefer_server_ciphers = on
ssl_ciphers = 'HIGH:!aNULL:!MD5:!3DES'
```

```ini
# pg_hba.conf — BƯỚC QUAN TRỌNG NHẤT
# hostssl = CHỈ chấp nhận kết nối đã mã hoá
hostssl  all  all  0.0.0.0/0   scram-sha-256

# TUYỆT ĐỐI KHÔNG để dòng này tồn tại cho mạng ngoài:
# host   all  all  0.0.0.0/0   scram-sha-256      ← cho kết nối KHÔNG mã hoá
```

Điểm mấu chốt: **bật `ssl = on` chưa đủ**. Nó chỉ *cho phép* TLS. Phải dùng `hostssl` để **bắt buộc**.

```bash
sudo systemctl reload postgresql
```

### Kiểm tra

```bash
psql "host=db.example.com dbname=mydb user=app sslmode=require"
```

```sql
SELECT ssl, version, cipher, bits, client_dn
FROM pg_stat_ssl JOIN pg_stat_activity USING (pid)
WHERE pid = pg_backend_pid();
```

```text
 ssl | version |         cipher         | bits | client_dn
-----+---------+------------------------+------+-----------
 t   | TLSv1.3 | TLS_AES_256_GCM_SHA384 |  256 |
```

Bắt gói lại sau khi bật:

```bash
sudo tcpdump -i any -A 'port 5432' | head -20
```

```text
....E....@.@..............P...\.....S.......
..&Y.....q.[!.zM..0..X..8.d..2....vG.q...
```

Không còn đọc được gì.

---

## Sáu chế độ `sslmode` — và ba chế độ vô dụng

Đây là phần quan trọng nhất của bài, và là chỗ hầu hết cấu hình sai.

| `sslmode` | Mã hoá | Xác minh chứng chỉ | Xác minh tên máy | Chống nghe lén | Chống người ở giữa |
|---|---|---|---|---|---|
| `disable` | Không | — | — | ✘ | ✘ |
| `allow` | Có thể | — | — | ✘ | ✘ |
| `prefer` **(mặc định)** | Có thể | — | — | ✘ | ✘ |
| `require` | **Có** | Không | Không | ✔ | **✘** |
| `verify-ca` | **Có** | **Có** | Không | ✔ | Một phần |
| `verify-full` | **Có** | **Có** | **Có** | ✔ | **✔** |

### Vì sao `prefer` (mặc định!) không bảo vệ gì

```text
   `prefer` có nghĩa: "thử TLS trước, không được thì dùng kết nối thường"

   KẺ TẤN CÔNG Ở GIỮA chỉ cần:
     1. Chặn gói thương lượng TLS
     2. Trả lời "server này không hỗ trợ TLS"
     3. Client NGOAN NGOÃN chuyển sang kết nối VĂN BẢN THUẦN
     4. Đọc toàn bộ lưu lượng

   → Gọi là tấn công HẠ CẤP (downgrade attack)
   → Và đây là MẶC ĐỊNH của libpq, psycopg2, và nhiều driver khác
```

### Vì sao `require` vẫn không đủ

```text
   `require` có nghĩa: "bắt buộc phải mã hoá"
   NHƯNG KHÔNG kiểm tra chứng chỉ của ai.

   KẺ TẤN CÔNG Ở GIỮA:
     1. Tự tạo một chứng chỉ bất kỳ
     2. Giả làm server
     3. Client thấy "có TLS" → CHẤP NHẬN
     4. Kẻ tấn công giải mã, đọc, rồi chuyển tiếp đến server thật

   → Vẫn bị nghe lén toàn bộ, chỉ là có thêm một lớp mã hoá VÔ NGHĨA.
```

```text
   ┌──────────┐        ┌──────────────┐        ┌──────────┐
   │  CLIENT  │──TLS──▶│ KẺ TẤN CÔNG  │──TLS──▶│  SERVER  │
   └──────────┘        │ đọc HẾT      │        └──────────┘
                       └──────────────┘
   Cả hai chặng đều mã hoá. Client vẫn bị lộ sạch.
```

### Cấu hình đúng

```bash
psql "host=db.example.com dbname=mydb user=app \
      sslmode=verify-full sslrootcert=/etc/ssl/ca.crt"
```

```python
# Python
conn = psycopg2.connect(
    host="db.example.com", dbname="mydb", user="app",
    sslmode="verify-full",
    sslrootcert="/etc/ssl/ca.crt",
)
```

```java
// Java JDBC
jdbc:postgresql://db.example.com:5432/mydb
    ?ssl=true&sslmode=verify-full&sslrootcert=/etc/ssl/ca.crt
```

```yaml
# Go pgx / connection string
postgres://app@db.example.com:5432/mydb?sslmode=verify-full&sslrootcert=/etc/ssl/ca.crt
```

> **Quy tắc:** trong sản phẩm thật, chỉ có **`verify-full`** là chấp nhận được. Mọi giá trị khác đều để hở một lỗ hổng.

MySQL có khái niệm tương đương:

```text
   --ssl-mode=DISABLED     ~  disable
   --ssl-mode=PREFERRED    ~  prefer     (mặc định)
   --ssl-mode=REQUIRED     ~  require
   --ssl-mode=VERIFY_CA    ~  verify-ca
   --ssl-mode=VERIFY_IDENTITY ~ verify-full   ← dùng cái này
```

---

## Chi phí của TLS

Lo ngại thường gặp: "TLS làm chậm database". Đo thử:

```text
   BẮT TAY TLS (một lần mỗi kết nối)
     TLS 1.2: 2 vòng mạng  → ~2-4 ms trong LAN
     TLS 1.3: 1 vòng mạng  → ~1-2 ms
     Nối lại phiên (session resumption): 0 vòng  → ~0 ms

   MÃ HOÁ DỮ LIỆU (mỗi gói tin)
     AES-NI (mọi CPU từ 2010 đều có): ~1-3% CPU
     Không có AES-NI: ~10-15% CPU
```

```text
   → Với CONNECTION POOL, chi phí bắt tay được CHIA CHO hàng nghìn truy vấn
   → Chi phí thực tế: gần như KHÔNG ĐO ĐƯỢC
```

Kiểm tra CPU có AES-NI:

```bash
grep -o aes /proc/cpuinfo | head -1
```

```text
aes
```

Kết luận: **không có lý do hiệu năng nào để không bật TLS**. Lý do duy nhất thường gặp là "chưa ai làm" — và đó không phải lý do.

---

## Xác thực client bằng chứng chỉ

Mạnh hơn mật khẩu: client cũng phải trình chứng chỉ hợp lệ.

```bash
openssl req -new -nodes -out client.csr -keyout client.key \
  -subj "/CN=app_user"                  # ← CN PHẢI khớp TÊN VAI TRÒ trong Postgres

openssl x509 -req -in client.csr -days 365 -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out client.crt
```

```ini
# pg_hba.conf
hostssl  all  all  0.0.0.0/0  cert clientcert=verify-full
```

```bash
psql "host=db.example.com dbname=mydb user=app_user \
      sslmode=verify-full \
      sslrootcert=/etc/ssl/ca.crt \
      sslcert=/etc/ssl/client.crt \
      sslkey=/etc/ssl/client.key"
```

```text
   ƯU:  không còn mật khẩu để bị lộ hay bị đoán
        chứng chỉ CÓ HẠN → tự hết hiệu lực
        thu hồi được bằng CRL
   NHƯỢC: phải vận hành một hạ tầng chứng chỉ (PKI)
          chứng chỉ hết hạn → SỰ CỐ MẤT ĐIỆN
```

Nhược điểm thứ hai là vấn đề thật: rất nhiều sự cố sản xuất bắt nguồn từ chứng chỉ hết hạn mà không ai để ý. Bắt buộc phải có cảnh báo trước 30 ngày.

---

## Mã hoá khi lưu

TLS bảo vệ dữ liệu **khi truyền**. Còn khi nó nằm trên đĩa?

### Ba mức, ba phạm vi bảo vệ

```text
   1. MÃ HOÁ CẢ ĐĨA (LUKS, dm-crypt, EBS encryption)
      Bảo vệ: ai đó LẤY được ổ đĩa vật lý
      KHÔNG bảo vệ: ai đó vào được máy đang chạy (đĩa đã giải mã rồi)
      Chi phí: ~2-5% CPU
      → NÊN BẬT MẶC ĐỊNH, gần như không tốn gì

   2. MÃ HOÁ TRONG SUỐT CẤP DATABASE (TDE)
      Oracle, SQL Server, MySQL Enterprise có sẵn
      PostgreSQL: KHÔNG có sẵn trong bản cộng đồng
      Bảo vệ: gần giống mã hoá đĩa
      → Ít thêm giá trị nếu đã mã hoá đĩa

   3. MÃ HOÁ TỪNG CỘT
      Ứng dụng tự mã hoá TRƯỚC KHI gửi vào database
      Bảo vệ: KỂ CẢ khi database bị chiếm hoàn toàn
      → Mạnh nhất, nhưng MẤT khả năng truy vấn
```

### Mã hoá cột — và cái giá thật

```sql
CREATE EXTENSION pgcrypto;

INSERT INTO users (email, ssn_encrypted)
VALUES ('an@x.com', pgp_sym_encrypt('123-45-6789', :khoa));

SELECT pgp_sym_decrypt(ssn_encrypted, :khoa) FROM users WHERE id = 1;
```

```text
   CÁI GIÁ:
     ✘ KHÔNG truy vấn được:  WHERE ssn = '123-45-6789'  → không thể
     ✘ KHÔNG đánh index được theo giá trị
     ✘ KHÔNG sắp xếp, không so sánh khoảng
     ✘ Quản lý khoá trở thành bài toán mới (khoá lưu ở đâu?)
```

Dòng cuối quan trọng nhất: **nếu khoá nằm trong cùng database thì mã hoá gần như vô nghĩa**. Khoá phải nằm ở nơi khác — biến môi trường, dịch vụ quản lý khoá (KMS, Vault, HSM).

Mẫu thực dụng: **mã hoá xác định** cho cột cần tra cứu chính xác:

```sql
-- Băm có "muối" bí mật để tra cứu, cộng với bản mã hoá để lấy lại giá trị
ALTER TABLE users
  ADD COLUMN ssn_hash TEXT,          -- HMAC(ssn, muối) → tra cứu được, đánh index được
  ADD COLUMN ssn_enc  BYTEA;         -- mã hoá thật → lấy lại giá trị được

CREATE INDEX idx_users_ssn_hash ON users (ssn_hash);
```

```python
ssn_hash = hmac.new(MUOI_BI_MAT, ssn.encode(), 'sha256').hexdigest()
# Tra cứu:  WHERE ssn_hash = %s
# Lấy giá trị: pgp_sym_decrypt(ssn_enc, khoa)
```

Đánh đổi: tra cứu chính xác vẫn được, nhưng khoảng và sắp xếp thì không — và nếu "muối" bị lộ thì tấn công từ điển trở nên khả thi.

---

## Danh sách kiểm tra bảo mật kết nối

```text
   ┌─ MẠNG ────────────────────────────────────────────────────┐
   │ □ Database KHÔNG mở ra Internet công khai                 │
   │ □ Nhóm bảo mật / tường lửa chỉ cho phép IP của ứng dụng   │
   │ □ Database ở mạng riêng, không có IP công khai            │
   └───────────────────────────────────────────────────────────┘
   ┌─ TLS ─────────────────────────────────────────────────────┐
   │ □ ssl = on                                                │
   │ □ pg_hba.conf dùng `hostssl`, KHÔNG dùng `host` cho ngoài │
   │ □ ssl_min_protocol_version = TLSv1.2 trở lên              │
   │ □ MỌI client dùng sslmode = verify-full                   │
   │ □ Chứng chỉ có cảnh báo trước khi hết hạn 30 ngày         │
   └───────────────────────────────────────────────────────────┘
   ┌─ XÁC THỰC ────────────────────────────────────────────────┐
   │ □ scram-sha-256, KHÔNG dùng md5 (đã yếu)                  │
   │ □ Không có mật khẩu trong mã nguồn                        │
   │ □ Mật khẩu đổi định kỳ, hoặc dùng xác thực IAM/chứng chỉ  │
   └───────────────────────────────────────────────────────────┘
   ┌─ Ổ ĐĨA ───────────────────────────────────────────────────┐
   │ □ Mã hoá cả đĩa bật                                       │
   │ □ BẢN SAO LƯU CŨNG ĐƯỢC MÃ HOÁ       ← rất hay bị quên   │
   │ □ Khoá mã hoá KHÔNG nằm trong database                    │
   └───────────────────────────────────────────────────────────┘
```

Dòng "bản sao lưu cũng được mã hoá" đáng nhấn mạnh: rất nhiều vụ lộ dữ liệu không đến từ database mà từ **một file sao lưu bị bỏ quên trên một bucket công khai**.

### Kiểm tra `pg_hba.conf` có lỗ hổng không

```bash
grep -E '^(host|hostnossl)\s' /etc/postgresql/16/main/pg_hba.conf | grep -v '127.0.0.1\|::1'
```

Bất kỳ dòng nào hiện ra đều cho phép kết nối **không mã hoá** từ mạng ngoài.

```bash
# Kiểm tra xác thực yếu
grep -E '\s(trust|password|md5)\s*$' /etc/postgresql/16/main/pg_hba.conf
```

```text
   trust    → KHÔNG hỏi mật khẩu — thảm hoạ nếu ở mạng ngoài
   password → gửi mật khẩu VĂN BẢN THUẦN
   md5      → thuật toán đã yếu, nên chuyển sang scram-sha-256
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Để `sslmode` mặc định (`prefer`) | Tấn công hạ cấp — kẻ tấn công ép về kết nối thường | `verify-full` ở **mọi** client |
| Dùng `sslmode=require` và nghĩ là an toàn | Không xác minh chứng chỉ → người ở giữa vẫn đọc được | `verify-full` |
| Bật `ssl = on` nhưng vẫn để `host` trong `pg_hba.conf` | Kết nối không mã hoá vẫn được chấp nhận | Chỉ dùng `hostssl` cho mạng ngoài |
| `CN` của chứng chỉ không khớp tên máy | `verify-full` thất bại, và người ta gỡ xuống `require` | Đặt `CN`/SAN đúng tên máy client dùng |
| Không theo dõi hạn chứng chỉ | Sự cố mất điện toàn hệ thống lúc hết hạn | Cảnh báo trước 30 ngày |
| Mã hoá database nhưng quên sao lưu | Bản sao lưu là điểm lộ dữ liệu phổ biến nhất | Mã hoá cả bản sao lưu |
| Lưu khoá mã hoá trong chính database | Mã hoá trở nên vô nghĩa | KMS, Vault, HSM, hoặc biến môi trường |
| Dùng `md5` hoặc `trust` trong `pg_hba.conf` | Xác thực yếu hoặc không có | `scram-sha-256` |
| Mở database ra Internet công khai | Bị quét và tấn công trong vài phút | Mạng riêng, danh sách IP cho phép |

## Tóm tắt bài 1

- Không có TLS, **toàn bộ câu SQL và dữ liệu trả về đi qua mạng dưới dạng văn bản thuần** — bắt bằng `tcpdump` là đọc được ngay.
- Ba lớp bảo vệ **độc lập**: khi truyền (TLS), khi lưu (mã hoá đĩa/cột), khi dùng ([phase-15](../phase-15/01-homomorphic-encryption.md)). Lớp này không thay thế lớp kia.
- **`sslmode=prefer` là mặc định và nó không bảo vệ gì** — kẻ tấn công chỉ cần chặn thương lượng TLS để ép về kết nối thường (tấn công hạ cấp).
- **`sslmode=require` cũng chưa đủ** — nó mã hoá nhưng không xác minh danh tính, nên người ở giữa vẫn đọc được toàn bộ.
- **Chỉ `verify-full` là chấp nhận được trong sản phẩm thật.** MySQL tương đương là `VERIFY_IDENTITY`.
- Bật `ssl = on` **chưa đủ** — phải dùng **`hostssl`** trong `pg_hba.conf` để bắt buộc.
- Chi phí TLS: ~1-3% CPU với AES-NI, và chi phí bắt tay được **chia cho hàng nghìn truy vấn** nhờ connection pool. **Không có lý do hiệu năng nào để không bật.**
- Mã hoá cột bảo vệ ngay cả khi database bị chiếm, nhưng **mất khả năng truy vấn** — mẫu thực dụng là **cột băm HMAC để tra cứu** cộng **cột mã hoá để lấy giá trị**.
- Lỗ hổng bị quên nhiều nhất: **bản sao lưu không được mã hoá**, và **khoá mã hoá nằm trong chính database**.

**Bài kế tiếp** → [Bài 2: Database Permissions và Best Practices cho REST API](02-database-permissions-va-best-practices.md)
