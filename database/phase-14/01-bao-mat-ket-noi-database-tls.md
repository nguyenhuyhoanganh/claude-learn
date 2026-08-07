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
     │──── StartupMessage ────────────────────▶│  ten nguoi dung, ten database
     │◀─── AuthenticationRequest ──────────────│  yeu cau xac thuc
     │──── PasswordMessage ───────────────────▶│  chung minh
     │◀─── AuthenticationOk, ParameterStatus ──│
     │◀─── ReadyForQuery ──────────────────────│
     │                                         │
     │──── Query: "SELECT ..." ───────────────▶│  ← VAN BAN THUAN
     │◀─── RowDescription, DataRow... ─────────│  ← VAN BAN THUAN
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

---

## Bật TLS cho PostgreSQL

### Tạo chứng chỉ

```bash
# CA tu ky (san pham that nen dung CA noi bo hoac Let's Encrypt)
openssl req -new -x509 -days 3650 -nodes -out ca.crt -keyout ca.key \
  -subj "/CN=my-internal-ca"

# Khoa va yeu cau ky cho server
openssl req -new -nodes -out server.csr -keyout server.key \
  -subj "/CN=db.example.com"

# CA ky chung chi cho server
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
ssl_ca_file   = '/etc/postgresql/certs/ca.crt'      # can neu xac thuc client

ssl_min_protocol_version = 'TLSv1.2'                # KHONG cho TLS 1.0/1.1
ssl_prefer_server_ciphers = on
ssl_ciphers = 'HIGH:!aNULL:!MD5:!3DES'
```

```ini
# pg_hba.conf — BUOC QUAN TRONG NHAT
# hostssl = CHI chap nhan ket noi da ma hoa
hostssl  all  all  0.0.0.0/0   scram-sha-256

# TUYET DOI KHONG de dong nay ton tai cho mang ngoai:
# host   all  all  0.0.0.0/0   scram-sha-256      ← cho ket noi KHONG ma hoa
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
   `prefer` co nghia: "thu TLS truoc, khong duoc thi dung ket noi thuong"

   KE TAN CONG O GIUA chi can:
     1. Chan goi thuong luong TLS
     2. Tra loi "server nay khong ho tro TLS"
     3. Client NGOAN NGOAN chuyen sang ket noi VAN BAN THUAN
     4. Doc toan bo luu luong

   → Goi la tan cong HA CAP (downgrade attack)
   → Va day la MAC DINH cua libpq, psycopg2, va nhieu driver khac
```

### Vì sao `require` vẫn không đủ

```text
   `require` co nghia: "bat buoc phai ma hoa"
   NHUNG KHONG kiem tra chung chi cua ai.

   KE TAN CONG O GIUA:
     1. Tu tao mot chung chi bat ky
     2. Gia lam server
     3. Client thay "co TLS" → CHAP NHAN
     4. Ke tan cong giai ma, doc, roi chuyen tiep den server that

   → Van bi nghe len toan bo, chi la co them mot lop ma hoa VO NGHIA.
```

```text
   ┌──────────┐        ┌──────────────┐        ┌──────────┐
   │  CLIENT  │──TLS──▶│ KE TAN CONG  │──TLS──▶│  SERVER  │
   └──────────┘        │ doc HET      │        └──────────┘
                       └──────────────┘
   Ca hai chang deu ma hoa. Client van bi lo sach.
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
   --ssl-mode=PREFERRED    ~  prefer     (mac dinh)
   --ssl-mode=REQUIRED     ~  require
   --ssl-mode=VERIFY_CA    ~  verify-ca
   --ssl-mode=VERIFY_IDENTITY ~ verify-full   ← dung cai nay
```

---

## Chi phí của TLS

Lo ngại thường gặp: "TLS làm chậm database". Đo thử:

```text
   BAT TAY TLS (mot lan moi ket noi)
     TLS 1.2: 2 vong mang  → ~2-4 ms trong LAN
     TLS 1.3: 1 vong mang  → ~1-2 ms
     Noi lai phien (session resumption): 0 vong  → ~0 ms

   MA HOA DU LIEU (moi goi tin)
     AES-NI (moi CPU tu 2010 deu co): ~1-3% CPU
     Khong co AES-NI: ~10-15% CPU
```

```text
   → Voi CONNECTION POOL, chi phi bat tay duoc CHIA CHO hang nghin truy van
   → Chi phi thuc te: gan nhu KHONG DO DUOC
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
  -subj "/CN=app_user"                  # ← CN PHAI khop TEN VAI TRO trong Postgres

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
   ƯU:  khong con mat khau de bi lo hay bi doan
        chung chi CO HAN → tu het hieu luc
        thu hoi duoc bang CRL
   NHUOC: phai van hanh mot ha tang chung chi (PKI)
          chung chi het han → SU CO MAT DIEN
```

Nhược điểm thứ hai là vấn đề thật: rất nhiều sự cố sản xuất bắt nguồn từ chứng chỉ hết hạn mà không ai để ý. Bắt buộc phải có cảnh báo trước 30 ngày.

---

## Mã hoá khi lưu

TLS bảo vệ dữ liệu **khi truyền**. Còn khi nó nằm trên đĩa?

### Ba mức, ba phạm vi bảo vệ

```text
   1. MA HOA CA DIA (LUKS, dm-crypt, EBS encryption)
      Bao ve: ai do LAY duoc o dia vat ly
      KHONG bao ve: ai do vao duoc may dang chay (dia da giai ma roi)
      Chi phi: ~2-5% CPU
      → NEN BAT MAC DINH, gan nhu khong ton gi

   2. MA HOA TRONG SUOT CAP DATABASE (TDE)
      Oracle, SQL Server, MySQL Enterprise co san
      PostgreSQL: KHONG co san trong ban cong dong
      Bao ve: gan giong ma hoa dia
      → It them gia tri neu da ma hoa dia

   3. MA HOA TUNG COT
      Ung dung tu ma hoa TRUOC KHI gui vao database
      Bao ve: KE CA khi database bi chiem hoan toan
      → Manh nhat, nhung MAT kha nang truy van
```

### Mã hoá cột — và cái giá thật

```sql
CREATE EXTENSION pgcrypto;

INSERT INTO users (email, ssn_encrypted)
VALUES ('an@x.com', pgp_sym_encrypt('123-45-6789', :khoa));

SELECT pgp_sym_decrypt(ssn_encrypted, :khoa) FROM users WHERE id = 1;
```

```text
   CAI GIA:
     ✘ KHONG truy van duoc:  WHERE ssn = '123-45-6789'  → khong the
     ✘ KHONG danh index duoc theo gia tri
     ✘ KHONG sap xep, khong so sanh khoang
     ✘ Quan ly khoa tro thanh bai toan moi (khoa luu o dau?)
```

Dòng cuối quan trọng nhất: **nếu khoá nằm trong cùng database thì mã hoá gần như vô nghĩa**. Khoá phải nằm ở nơi khác — biến môi trường, dịch vụ quản lý khoá (KMS, Vault, HSM).

Mẫu thực dụng: **mã hoá xác định** cho cột cần tra cứu chính xác:

```sql
-- Bam co "muoi" bi mat de tra cuu, cong voi ban ma hoa de lay lai gia tri
ALTER TABLE users
  ADD COLUMN ssn_hash TEXT,          -- HMAC(ssn, muoi) → tra cuu duoc, danh index duoc
  ADD COLUMN ssn_enc  BYTEA;         -- ma hoa that → lay lai gia tri duoc

CREATE INDEX idx_users_ssn_hash ON users (ssn_hash);
```

```python
ssn_hash = hmac.new(MUOI_BI_MAT, ssn.encode(), 'sha256').hexdigest()
# Tra cuu:  WHERE ssn_hash = %s
# Lay gia tri: pgp_sym_decrypt(ssn_enc, khoa)
```

Đánh đổi: tra cứu chính xác vẫn được, nhưng khoảng và sắp xếp thì không — và nếu "muối" bị lộ thì tấn công từ điển trở nên khả thi.

---

## Danh sách kiểm tra bảo mật kết nối

```text
   ┌─ MẠNG ────────────────────────────────────────────────────┐
   │ □ Database KHONG mo ra Internet cong khai                 │
   │ □ Nhom bao mat / tuong lua chi cho phep IP cua ung dung   │
   │ □ Database o mang rieng, khong co IP cong khai            │
   └───────────────────────────────────────────────────────────┘
   ┌─ TLS ─────────────────────────────────────────────────────┐
   │ □ ssl = on                                                │
   │ □ pg_hba.conf dung `hostssl`, KHONG dung `host` cho ngoai │
   │ □ ssl_min_protocol_version = TLSv1.2 tro len              │
   │ □ MOI client dung sslmode = verify-full                   │
   │ □ Chung chi co canh bao truoc khi het han 30 ngay         │
   └───────────────────────────────────────────────────────────┘
   ┌─ XÁC THỰC ────────────────────────────────────────────────┐
   │ □ scram-sha-256, KHONG dung md5 (da yeu)                  │
   │ □ Khong co mat khau trong ma nguon                        │
   │ □ Mat khau doi dinh ky, hoac dung xac thuc IAM/chung chi  │
   └───────────────────────────────────────────────────────────┘
   ┌─ Ổ ĐĨA ───────────────────────────────────────────────────┐
   │ □ Ma hoa ca dia bat                                       │
   │ □ BAN SAO LUU CUNG DUOC MA HOA        ← rat hay bi quen   │
   │ □ Khoa ma hoa KHONG nam trong database                    │
   └───────────────────────────────────────────────────────────┘
```

Dòng "bản sao lưu cũng được mã hoá" đáng nhấn mạnh: rất nhiều vụ lộ dữ liệu không đến từ database mà từ **một file sao lưu bị bỏ quên trên một bucket công khai**.

### Kiểm tra `pg_hba.conf` có lỗ hổng không

```bash
grep -E '^(host|hostnossl)\s' /etc/postgresql/16/main/pg_hba.conf | grep -v '127.0.0.1\|::1'
```

Bất kỳ dòng nào hiện ra đều cho phép kết nối **không mã hoá** từ mạng ngoài.

```bash
# Kiem tra xac thuc yeu
grep -E '\s(trust|password|md5)\s*$' /etc/postgresql/16/main/pg_hba.conf
```

```text
   trust    → KHONG hoi mat khau — tham hoa neu o mang ngoai
   password → gui mat khau VAN BAN THUAN
   md5      → thuat toan da yeu, nen chuyen sang scram-sha-256
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
