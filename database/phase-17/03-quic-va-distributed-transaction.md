# Bài 4: QUIC cho Database và Distributed Transaction

Hai chủ đề trong bài này đều là câu hỏi mở — loại câu hỏi không có đáp án đúng tuyệt đối, và chính vì thế chúng là câu hỏi phỏng vấn tốt.

---

# Phần I — QUIC có phù hợp làm giao thức database không?

## QUIC là gì

**QUIC** là giao thức truyền tải do Google phát triển, nay là chuẩn IETF và là nền của **HTTP/3**.

```text
   ┌─ NGAN XEP CU (HTTP/2) ────┐    ┌─ NGAN XEP MOI (HTTP/3) ───┐
   │  HTTP/2                   │    │  HTTP/3                   │
   │  TLS 1.3                  │    │  QUIC  (da bao gom TLS 1.3)│
   │  TCP                      │    │  UDP                      │
   │  IP                       │    │  IP                       │
   └───────────────────────────┘    └───────────────────────────┘
```

Bốn đặc tính chính:

```text
   1. CHAY TREN UDP, tu cai dat lai do tin cay
   2. TLS 1.3 GAN LIEN — khong tach roi duoc
   3. NHIEU LUONG DOC LAP trong mot ket noi
   4. DI CHUYEN KET NOI — doi mang van giu duoc ket noi
```

## Ba điểm mạnh

### Bắt tay nhanh hơn

```text
   TCP + TLS 1.3                     QUIC
   ═════════════                     ════
   SYN → SYN-ACK → ACK   (1 RTT)     ClientHello + du lieu  (1 RTT)
   ClientHello → ...     (1 RTT)     hoac 0-RTT neu da noi truoc do
   ────────────────────────────
   TONG: 2 RTT                       TONG: 1 RTT, hoac 0-RTT
```

Trong mạng LAN (~0,5 ms RTT) thì tiết kiệm 0,5 ms — không đáng kể. Xuyên lục địa (~150 ms RTT) thì tiết kiệm 150-300 ms — rất đáng kể.

### Không còn nghẽn đầu dòng

```text
   TCP: mot goi tin MAT → MOI luong phia sau PHAI CHO no duoc gui lai
        ┌─────────────────────────────────────────┐
        │ [truy van A] [MAT] [truy van B] [truy van C] │
        │                ▲                        │
        │        B va C BI CHAN du chung khong loi │
        └─────────────────────────────────────────┘

   QUIC: moi luong DOC LAP
        → chi luong co goi mat bi anh huong
        → B va C van di tiep
```

### Di chuyển kết nối

```text
   TCP: ket noi = (IP nguon, cong nguon, IP dich, cong dich)
        → doi WiFi sang 4G → doi IP → KET NOI DUT

   QUIC: ket noi = mot ID doc lap voi dia chi mang
        → doi mang → ket noi VAN SONG
```

## Bốn lý do database chưa dùng QUIC

### 1. Database thường ở trong mạng nội bộ

```text
   Uu the cua QUIC lon nhat khi:
     • do tre cao      → mang noi bo: 0,1-1 ms
     • mat goi nhieu   → mang noi bo: gan nhu 0%
     • doi mang        → may chu khong doi mang

   → BA uu the chinh deu KHONG AP DUNG cho ket noi ung dung ↔ database
```

### 2. Connection pool đã xoá bỏ chi phí bắt tay

```text
   QUIC tiet kiem 1 RTT khi MO ket noi.
   Nhung voi pool, ket noi duoc mo MOT LAN roi dung cho hang trieu truy van.
   → tiet kiem 1 ms mot lan, chia cho 1 trieu truy van → ~0
```

### 3. Nghẽn đầu dòng ít xảy ra

```text
   Giao thuc database thuong TUAN TU tren mot ket noi:
     gui truy van → cho ket qua → gui truy van tiep

   → khong co nhieu luong song song de bi chan
   → tru khi dung pipelining, ma it thu vien lam
```

### 4. UDP hay bị chặn và không được tối ưu

```text
   • Nhieu tuong lua doanh nghiep chan UDP tren cac cong khong chuan
   • NAT xu ly UDP kem hon TCP
   • Ngan xep TCP da duoc toi uu HANG CHUC NAM trong nhan he dieu hanh
   • QUIC chay o KHONG GIAN NGUOI DUNG → ton CPU hon dang ke
```

Điểm cuối đáng nói: các phép đo cho thấy QUIC tốn CPU **gấp 2-3 lần** TCP cho cùng lượng dữ liệu, vì xử lý gói tin diễn ra ở không gian người dùng thay vì trong nhân.

## Khi nào QUIC sẽ có ý nghĩa cho database

```text
   ✔ Database o BIEN, client la thiet bi di dong
     → di chuyen ket noi rat co gia tri
   ✔ Nhan ban XUYEN LUC DIA
     → do tre cao, mat goi nhieu → chong nghen dau dong co ich
   ✔ Database-as-a-Service qua Internet cong khai
     → bat tay 0-RTT giup ket noi ngan
   ✔ Kien truc serverless (ket noi rat ngan, rat nhieu)
```

Một số hệ đã thử nghiệm: **MongoDB** đã thảo luận về QUIC, **Cloudflare** dùng QUIC cho một số dịch vụ dữ liệu ở biên.

## Bài học phương pháp

Đây mới là phần đáng giá nhất của phần I:

```text
   Khi danh gia mot cong nghe moi, hoi ba cau:

   1. NO GIAI QUYET VAN DE GI?
      QUIC: do tre cao, mat goi, doi mang

   2. TOI CO VAN DE DO KHONG?
      Ung dung ↔ database trong mang noi bo: KHONG

   3. NO DEM LAI VAN DE GI MOI?
      Ton CPU hon, UDP bi chan, ngan xep chua truong thanh

   → Neu cau 2 tra loi "khong" thi cau 1 va 3 khong con quan trong.
```

Rất nhiều quyết định công nghệ sai bắt đầu bằng việc bỏ qua câu hỏi số 2.

---

# Phần II — Distributed Transaction

## Vấn đề

```text
   Chuyen tien giua hai TAI KHOAN o HAI DATABASE KHAC NHAU:

   Database A:  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
   Database B:  UPDATE accounts SET balance = balance + 100 WHERE id = 2;

   Khong co COMMIT chung.
   ⚡ A thanh cong, B that bai → TIEN BOC HOI
```

Đây chính là tình huống "100 nghìn bốc hơi" ở [phase-2 bài 1](../phase-2/01-acid-va-transaction.md), nhưng lần này **database không cứu được** vì đó là hai tiến trình độc lập.

## Cách 1 — Two-Phase Commit (2PC)

```text
   PHA 1 — CHUAN BI
   ┌───────────────┐
   │ DIEU PHOI VIEN│ ──"san sang chua?"──▶ Database A  → "san sang" (KHOA)
   │               │ ──"san sang chua?"──▶ Database B  → "san sang" (KHOA)
   └───────────────┘

   PHA 2 — COMMIT
   ┌───────────────┐
   │ DIEU PHOI VIEN│ ──"commit"──────────▶ Database A  → xong (mo khoa)
   │               │ ──"commit"──────────▶ Database B  → xong (mo khoa)
   └───────────────┘

   Neu BAT KY ai tra loi "khong san sang" o pha 1
     → dieu phoi vien gui "huy" cho TAT CA
```

Trong PostgreSQL:

```sql
-- Tren MOI database
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
PREPARE TRANSACTION 'chuyen_tien_12345';    -- ← pha 1: san sang, GIU KHOA

-- Sau khi MOI database deu san sang:
COMMIT PREPARED 'chuyen_tien_12345';        -- ← pha 2
-- hoac
ROLLBACK PREPARED 'chuyen_tien_12345';
```

```sql
-- Xem cac transaction dang o trang thai "chuan bi"
SELECT gid, prepared, owner, database FROM pg_prepared_xacts;
```

Cần bật trước:

```sql
ALTER SYSTEM SET max_prepared_transactions = 100;   -- mac dinh 0 = TAT
-- can khoi dong lai
```

### Ba vấn đề nghiêm trọng của 2PC

```text
   1. GIAO THUC CHAN
      Neu DIEU PHOI VIEN CHET giua pha 1 va pha 2:
        → cac database VAN GIU KHOA
        → cho MAI MAI cho lenh khong bao gio toi
        → phai co nguoi vao go bang tay

   2. GIU KHOA LAU
      Khoa duoc giu suot CA HAI pha, cong do tre mang.
      → thong luong sup khi co tranh chap

   3. CHAN VACUUM
      Trong PostgreSQL, transaction "chuan bi" bi bo quen
      CHAN `VACUUM` don rac tren TOAN BO database — VO THOI HAN.
```

Vấn đề thứ ba là lý do PostgreSQL **tắt `max_prepared_transactions` theo mặc định**. Một transaction chuẩn bị sẵn bị bỏ quên là một quả bom hẹn giờ.

```sql
-- Canh bao BAT BUOC phai co neu dung 2PC
SELECT gid, prepared, age(now(), prepared) AS bao_lau
FROM pg_prepared_xacts WHERE age(now(), prepared) > interval '5 minutes';
```

## Cách 2 — Saga

Thay vì một transaction phân tán, dùng **chuỗi transaction cục bộ**, mỗi bước có một **bước bù trừ**:

```text
   THUAN LOI
   ─────────
   Buoc 1: tru tien tai khoan A     (transaction cuc bo, COMMIT)
   Buoc 2: cong tien tai khoan B    (transaction cuc bo, COMMIT)
   → xong

   CO LOI O BUOC 2
   ───────────────
   Buoc 1: tru tien A               ✔ da commit
   Buoc 2: cong tien B              ✘ that bai
   Buoc 1': BU TRU — cong tra tien cho A
```

```python
async def chuyen_tien_saga(tu_id, sang_id, so_tien):
    buoc_da_lam = []
    try:
        await db_a.execute("UPDATE accounts SET balance = balance - %s WHERE id = %s",
                           (so_tien, tu_id))
        buoc_da_lam.append(('hoan_tien_a', tu_id, so_tien))

        await db_b.execute("UPDATE accounts SET balance = balance + %s WHERE id = %s",
                           (so_tien, sang_id))
    except Exception:
        for buoc in reversed(buoc_da_lam):
            await day_vao_hang_doi_bu_tru(buoc)   # ← PHAI BEN VUNG
        raise
```

Dòng cuối rất quan trọng: **bước bù trừ cũng có thể thất bại**. Nếu chỉ gọi trực tiếp, một lỗi mạng ở bước bù trừ sẽ để lại dữ liệu nửa vời vĩnh viễn. Phải đẩy vào hàng đợi bền vững để thử lại.

### Cái giá của Saga

```text
   ✘ KHONG CO CO LAP
     Giua buoc 1 va buoc 2, nguoi khac NHIN THAY trang thai nua voi:
       tai khoan A da bi tru, tai khoan B chua duoc cong
       → tong tien trong he thong TAM THOI SAI

   ✘ Buoc bu tru KHONG PHAI LA ROLLBACK THAT
     "Da gui email xac nhan" → khong bu tru duoc
     → chi gui duoc email thu hai xin loi

   ✘ Do phuc tap chuyen sang UNG DUNG
     Phai tu viet moi buoc bu tru, hang doi thu lai, theo doi trang thai
```

Điểm "không có cô lập" đáng nhấn mạnh: Saga cho **tính nguyên tử cuối cùng** nhưng **không cho tính cô lập**. Với nghiệp vụ mà trạng thái trung gian nhìn thấy được là chấp nhận được (đặt vé, xử lý đơn hàng), nó ổn. Với nghiệp vụ kế toán, nó không ổn.

## Cách 3 — Thiết kế để không cần

Đây gần như luôn là câu trả lời đúng:

```text
   1. GOM DU LIEU LIEN QUAN VAO CUNG MOT DATABASE
      → transaction cuc bo, ACID day du, khong can gi them
      → chinh la "nhom cung vi tri" o [phase-7 bai 1]

   2. HOP THU DI (transactional outbox)
      Ghi du lieu VA su kien trong CUNG transaction cuc bo;
      mot tien trinh rieng doc bang su kien roi gui di.
      → dam bao "ghi du lieu" va "gui su kien" khong bao gio lech nhau

   3. CHAP NHAN NHAT QUAN CUOI CUNG
      Voi rat nhieu nghiep vu, tre vai giay la chap nhan duoc.
```

### Mẫu hộp thư đi — chi tiết

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  INSERT INTO outbox (loai, payload, created_at)
  VALUES ('chuyen_tien', '{"tu":1,"sang":2,"so_tien":100}', now());
COMMIT;    -- ← MOT transaction cuc bo, ACID day du
```

```python
# Tien trinh rieng doc outbox va gui di
while True:
    rows = db.query("""SELECT id, payload FROM outbox
                        WHERE sent_at IS NULL
                        ORDER BY id LIMIT 100
                        FOR UPDATE SKIP LOCKED""")
    for r in rows:
        gui_su_kien(r['payload'])       # phai BAT BIEN truoc lap lai
        db.execute("UPDATE outbox SET sent_at = now() WHERE id = %s", (r['id'],))
    db.commit()
```

```text
   VI SAO MAU NAY DUNG:
     • Ghi du lieu va ghi su kien nam trong CUNG transaction
       → khong the co "da tru tien nhung chua ghi su kien"
     • Tien trinh gui co the chay lai an toan (SKIP LOCKED + idempotent)
     • Khong can 2PC, khong can dieu phoi vien
```

Đây là mẫu được dùng rộng rãi nhất trong kiến trúc microservice hiện đại, và nó thay thế được phần lớn nhu cầu 2PC.

## So sánh ba cách

| | 2PC | Saga | Hộp thư đi |
|---|---|---|---|
| Tính nguyên tử | **Có, mạnh** | Cuối cùng | Cuối cùng |
| Tính cô lập | **Có** | **Không** | Không |
| Chặn khi điều phối viên chết | **Có** ⚠ | Không | Không |
| Giữ khoá | **Lâu** | Ngắn | **Ngắn** |
| Độ phức tạp ở ứng dụng | Thấp | **Rất cao** | Vừa |
| Mở rộng | Kém | **Tốt** | **Tốt** |
| Dùng khi | Bắt buộc phải nguyên tử mạnh | Quy trình dài nhiều bước | Phát sự kiện sau khi ghi |

## Ba hệ giải quyết sẵn

```text
   • Google Spanner   — dong ho nguyen tu (TrueTime) → transaction phan tan that
   • CockroachDB      — Raft + 2PC toi uu, tuong thich PostgreSQL
   • YugabyteDB       — tuong tu, tuong thich PostgreSQL cao hon
   • FoundationDB     — transaction phan tan lam nen cho cac he khac

   → Neu THAT SU can transaction phan tan manh,
     dung mot he DA GIAI QUYET no, dung tu viet 2PC.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng 2PC mà không cảnh báo transaction chuẩn bị bị bỏ quên | Chặn `VACUUM` **vô thời hạn** trên toàn database | Cảnh báo `pg_prepared_xacts` > 5 phút |
| Bật `max_prepared_transactions` mà không dùng | Mở ra một lớp sự cố không cần thiết | Để mặc định 0 nếu không dùng 2PC |
| Saga mà bước bù trừ chỉ gọi trực tiếp | Lỗi ở bước bù trừ để lại dữ liệu nửa vời vĩnh viễn | Hàng đợi bền vững + thử lại |
| Kỳ vọng Saga cho tính cô lập | Trạng thái trung gian **nhìn thấy được** | Chỉ dùng khi nghiệp vụ chấp nhận được |
| Chia dữ liệu liên quan ra nhiều database rồi mới lo transaction | Tự tạo ra vấn đề không cần có | **Nhóm cùng vị trí** ngay từ khi thiết kế |
| Tự viết 2PC cho hệ thống lớn | Rất nhiều trường hợp biên | Spanner/CockroachDB/YugabyteDB |
| Đánh giá QUIC mà bỏ qua "tôi có vấn đề đó không" | Thêm phức tạp cho vấn đề không tồn tại | Ba câu hỏi ở cuối phần I |

## Tóm tắt bài 4

- **QUIC** giải quyết ba vấn đề: bắt tay chậm, nghẽn đầu dòng, mất kết nối khi đổi mạng — nhưng **cả ba đều không xảy ra** với kết nối ứng dụng ↔ database trong mạng nội bộ.
- **Connection pool đã xoá bỏ lợi ích chính** của QUIC: tiết kiệm 1 RTT một lần rồi chia cho hàng triệu truy vấn thì bằng không. Và QUIC tốn CPU **gấp 2-3 lần** TCP vì chạy ở không gian người dùng.
- Bài học phương pháp: hỏi **ba câu** — nó giải quyết vấn đề gì · **tôi có vấn đề đó không** · nó đem lại vấn đề gì mới. Bỏ qua câu thứ hai là gốc của rất nhiều quyết định công nghệ sai.
- **2PC** cho tính nguyên tử mạnh nhưng là **giao thức chặn**: điều phối viên chết giữa hai pha thì các database **giữ khoá mãi mãi**. Và transaction chuẩn bị sẵn bị bỏ quên **chặn `VACUUM` vô thời hạn** — lý do PostgreSQL tắt nó theo mặc định.
- **Saga** cho tính nguyên tử cuối cùng nhưng **không cho tính cô lập** — trạng thái trung gian nhìn thấy được. Và **bước bù trừ cũng có thể thất bại**, nên phải có hàng đợi bền vững.
- **Cách đúng nhất là thiết kế để không cần**: nhóm dữ liệu liên quan vào cùng một database, hoặc dùng **mẫu hộp thư đi** — ghi dữ liệu và ghi sự kiện trong cùng một transaction cục bộ.
- Nếu thật sự cần transaction phân tán mạnh, **dùng hệ đã giải quyết nó** (Spanner, CockroachDB, YugabyteDB) thay vì tự viết 2PC.

**Bài kế tiếp** → [Bài 5: Hash Tables và Consistent Hashing](04-hash-tables-va-consistent-hashing.md)
