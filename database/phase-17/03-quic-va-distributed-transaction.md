# Bài 4: QUIC cho Database và Distributed Transaction

Hai chủ đề trong bài này đều là câu hỏi mở — loại câu hỏi không có đáp án đúng tuyệt đối, và chính vì thế chúng là câu hỏi phỏng vấn tốt.

---

# Phần I — QUIC có phù hợp làm giao thức database không?

## QUIC là gì

**QUIC** là giao thức truyền tải do Google phát triển, nay là chuẩn IETF và là nền của **HTTP/3**.

```text
   ┌─ NGAN XEP CU (HTTP/2) ────┐    ┌─ NGAN XEP MOI (HTTP/3) ───┐
   │  HTTP/2                   │    │  HTTP/3                   │
   │  TLS 1.3                  │    │  QUIC  (đã bao gồm TLS 1.3)│
   │  TCP                      │    │  UDP                      │
   │  IP                       │    │  IP                       │
   └───────────────────────────┘    └───────────────────────────┘
```

Bốn đặc tính chính:

```text
   1. CHẠY TRÊN UDP, tự cài đặt lại độ tin cậy
   2. TLS 1.3 GẮN LIỀN — không tách rời được
   3. NHIỀU LUỒNG ĐỘC LẬP trong một kết nối
   4. DI CHUYỂN KẾT NỐI — đổi mạng vẫn giữ được kết nối
```

## Ba điểm mạnh

### Bắt tay nhanh hơn

```text
   TCP + TLS 1.3                     QUIC
   ═════════════                     ════
   SYN → SYN-ACK → ACK   (1 RTT)     ClientHello + dữ liệu  (1 RTT)
   ClientHello → ...     (1 RTT)     hoặc 0-RTT nếu đã nối trước đó
   ────────────────────────────
   TONG: 2 RTT                       TONG: 1 RTT, hoac 0-RTT
```

Trong mạng LAN (~0,5 ms RTT) thì tiết kiệm 0,5 ms — không đáng kể. Xuyên lục địa (~150 ms RTT) thì tiết kiệm 150-300 ms — rất đáng kể.

### Không còn nghẽn đầu dòng

```text
   TCP: một gói tin MẤT → MỌI luồng phía sau PHẢI CHỜ nó được gửi lại
        ┌─────────────────────────────────────────┐
        │ [truy vấn A] [MẤT] [truy vấn B] [truy vấn C] │
        │                ▲                        │
        │        B và C BỊ CHẶN dù chúng không lỗi │
        └─────────────────────────────────────────┘

   QUIC: mỗi luồng ĐỘC LẬP
        → chỉ luồng có gói mất bị ảnh hưởng
        → B và C vẫn đi tiếp
```

### Di chuyển kết nối

```text
   TCP: kết nối = (IP nguồn, cổng nguồn, IP đích, cổng đích)
        → doi WiFi sang 4G → doi IP → KET NOI DUT

   QUIC: kết nối = một ID độc lập với địa chỉ mạng
        → đổi mạng → kết nối VẪN SỐNG
```

## Bốn lý do database chưa dùng QUIC

### 1. Database thường ở trong mạng nội bộ

```text
   Ưu thế của QUIC lớn nhất khi:
     • độ trễ cao      → mạng nội bộ: 0,1-1 ms
     • mất gói nhiều   → mạng nội bộ: gần như 0%
     • đổi mạng        → máy chủ không đổi mạng

   → BA ưu thế chính đều KHÔNG ÁP DỤNG cho kết nối ứng dụng ↔ database
```

### 2. Connection pool đã xoá bỏ chi phí bắt tay

```text
   QUIC tiết kiệm 1 RTT khi MỞ kết nối.
   Nhưng với pool, kết nối được mở MỘT LẦN rồi dùng cho hàng triệu truy vấn.
   → tiết kiệm 1 ms một lần, chia cho 1 triệu truy vấn → ~0
```

### 3. Nghẽn đầu dòng ít xảy ra

```text
   Giao thức database thường TUẦN TỰ trên một kết nối:
     gửi truy vấn → chờ kết quả → gửi truy vấn tiếp

   → không có nhiều luồng song song để bị chặn
   → trừ khi dùng pipelining, mà ít thư viện làm
```

### 4. UDP hay bị chặn và không được tối ưu

```text
   • Nhiều tường lửa doanh nghiệp chặn UDP trên các cổng không chuẩn
   • NAT xử lý UDP kém hơn TCP
   • Ngăn xếp TCP đã được tối ưu HÀNG CHỤC NĂM trong nhân hệ điều hành
   • QUIC chạy ở KHÔNG GIAN NGƯỜI DÙNG → tốn CPU hơn đáng kể
```

Điểm cuối đáng nói: các phép đo cho thấy QUIC tốn CPU **gấp 2-3 lần** TCP cho cùng lượng dữ liệu, vì xử lý gói tin diễn ra ở không gian người dùng thay vì trong nhân.

## Khi nào QUIC sẽ có ý nghĩa cho database

```text
   ✔ Database ở BIÊN, client là thiết bị di động
     → di chuyển kết nối rất có giá trị
   ✔ Nhân bản XUYÊN LỤC ĐỊA
     → độ trễ cao, mất gói nhiều → chống nghẽn đầu dòng có ích
   ✔ Database-as-a-Service qua Internet công khai
     → bắt tay 0-RTT giúp kết nối ngắn
   ✔ Kiến trúc serverless (kết nối rất ngắn, rất nhiều)
```

Một số hệ đã thử nghiệm: **MongoDB** đã thảo luận về QUIC, **Cloudflare** dùng QUIC cho một số dịch vụ dữ liệu ở biên.

## Bài học phương pháp

Đây mới là phần đáng giá nhất của phần I:

```text
   Khi đánh giá một công nghệ mới, hỏi ba câu:

   1. NO GIAI QUYET VAN DE GI?
      QUIC: độ trễ cao, mất gói, đổi mạng

   2. TOI CO VAN DE DO KHONG?
      Ứng dụng ↔ database trong mạng nội bộ: KHÔNG

   3. NO DEM LAI VAN DE GI MOI?
      Tốn CPU hơn, UDP bị chặn, ngăn xếp chưa trưởng thành

   → Nếu câu 2 trả lời "không" thì câu 1 và 3 không còn quan trọng.
```

Rất nhiều quyết định công nghệ sai bắt đầu bằng việc bỏ qua câu hỏi số 2.

---

# Phần II — Distributed Transaction

## Vấn đề

```text
   Chuyen tien giua hai TAI KHOAN o HAI DATABASE KHAC NHAU:

   Database A:  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
   Database B:  UPDATE accounts SET balance = balance + 100 WHERE id = 2;

   Không có COMMIT chung.
   ⚡ A thành công, B thất bại → TIỀN BỐC HƠI
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
   │ ĐIỀU PHỐI VIÊN│ ──"commit"──────────▶ Database A  → xong (mở khoá)
   │               │ ──"commit"──────────▶ Database B  → xong (mở khoá)
   └───────────────┘

   Nếu BẤT KỲ ai trả lời "không sẵn sàng" ở pha 1
     → điều phối viên gửi "huỷ" cho TẤT CẢ
```

Trong PostgreSQL:

```sql
-- Tren MOI database
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
PREPARE TRANSACTION 'chuyen_tien_12345';    -- ← pha 1: san sang, GIU KHOA

-- Sau khi MỌI database đều sẵn sàng:
COMMIT PREPARED 'chuyen_tien_12345';        -- ← pha 2
-- hoac
ROLLBACK PREPARED 'chuyen_tien_12345';
```

```sql
-- Xem các transaction đang ở trạng thái "chuẩn bị"
SELECT gid, prepared, owner, database FROM pg_prepared_xacts;
```

Cần bật trước:

```sql
ALTER SYSTEM SET max_prepared_transactions = 100;   -- mac dinh 0 = TAT
-- cần khởi động lại
```

### Ba vấn đề nghiêm trọng của 2PC

```text
   1. GIAO THUC CHAN
      Nếu ĐIỀU PHỐI VIÊN CHẾT giữa pha 1 và pha 2:
        → các database VẪN GIỮ KHOÁ
        → chờ MÃI MÃI cho lệnh không bao giờ tới
        → phải có người vào gỡ bằng tay

   2. GIU KHOA LAU
      Khoá được giữ suốt CẢ HAI pha, cộng độ trễ mạng.
      → thông lượng sụp khi có tranh chấp

   3. CHAN VACUUM
      Trong PostgreSQL, transaction "chuẩn bị" bị bỏ quên
      CHẶN `VACUUM` dọn rác trên TOÀN BỘ database — VÔ THỜI HẠN.
```

Vấn đề thứ ba là lý do PostgreSQL **tắt `max_prepared_transactions` theo mặc định**. Một transaction chuẩn bị sẵn bị bỏ quên là một quả bom hẹn giờ.

```sql
-- Cảnh báo BẮT BUỘC phải có nếu dùng 2PC
SELECT gid, prepared, age(now(), prepared) AS bao_lau
FROM pg_prepared_xacts WHERE age(now(), prepared) > interval '5 minutes';
```

## Cách 2 — Saga

Thay vì một transaction phân tán, dùng **chuỗi transaction cục bộ**, mỗi bước có một **bước bù trừ**:

```text
   THUAN LOI
   ─────────
   Buoc 1: tru tien tai khoan A     (transaction cuc bo, COMMIT)
   Bước 2: cộng tiền tài khoản B    (transaction cục bộ, COMMIT)
   → xong

   CO LOI O BUOC 2
   ───────────────
   Bước 1: trừ tiền A               ✔ đã commit
   Bước 2: cộng tiền B              ✘ thất bại
   Bước 1': BÙ TRỪ — cộng trả tiền cho A
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
     Giữa bước 1 và bước 2, người khác NHÌN THẤY trạng thái nửa vời:
       tài khoản A đã bị trừ, tài khoản B chưa được cộng
       → tổng tiền trong hệ thống TẠM THỜI SAI

   ✘ Buoc bu tru KHONG PHAI LA ROLLBACK THAT
     "Đã gửi email xác nhận" → không bù trừ được
     → chỉ gửi được email thứ hai xin lỗi

   ✘ Do phuc tap chuyen sang UNG DUNG
     Phải tự viết mọi bước bù trừ, hàng đợi thử lại, theo dõi trạng thái
```

Điểm "không có cô lập" đáng nhấn mạnh: Saga cho **tính nguyên tử cuối cùng** nhưng **không cho tính cô lập**. Với nghiệp vụ mà trạng thái trung gian nhìn thấy được là chấp nhận được (đặt vé, xử lý đơn hàng), nó ổn. Với nghiệp vụ kế toán, nó không ổn.

## Cách 3 — Thiết kế để không cần

Đây gần như luôn là câu trả lời đúng:

```text
   1. GOM DU LIEU LIEN QUAN VAO CUNG MOT DATABASE
      → transaction cục bộ, ACID đầy đủ, không cần gì thêm
      → chính là "nhóm cùng vị trí" ở [phase-7 bài 1]

   2. HOP THU DI (transactional outbox)
      Ghi dữ liệu VÀ sự kiện trong CÙNG transaction cục bộ;
      một tiến trình riêng đọc bảng sự kiện rồi gửi đi.
      → đảm bảo "ghi dữ liệu" và "gửi sự kiện" không bao giờ lệch nhau

   3. CHAP NHAN NHAT QUAN CUOI CUNG
      Với rất nhiều nghiệp vụ, trễ vài giây là chấp nhận được.
```

### Mẫu hộp thư đi — chi tiết

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  INSERT INTO outbox (loai, payload, created_at)
  VALUES ('chuyen_tien', '{"tu":1,"sang":2,"so_tien":100}', now());
COMMIT;    -- ← MỘT transaction cục bộ, ACID đầy đủ
```

```python
# Tiến trình riêng đọc outbox và gửi đi
while True:
    rows = db.query("""SELECT id, payload FROM outbox
                        WHERE sent_at IS NULL
                        ORDER BY id LIMIT 100
                        FOR UPDATE SKIP LOCKED""")
    for r in rows:
        gui_su_kien(r['payload'])       # phải BẤT BIẾN trước lặp lại
        db.execute("UPDATE outbox SET sent_at = now() WHERE id = %s", (r['id'],))
    db.commit()
```

```text
   VI SAO MAU NAY DUNG:
     • Ghi dữ liệu và ghi sự kiện nằm trong CÙNG transaction
       → không thể có "đã trừ tiền nhưng chưa ghi sự kiện"
     • Tiến trình gửi có thể chạy lại an toàn (SKIP LOCKED + idempotent)
     • Không cần 2PC, không cần điều phối viên
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
   • Google Spanner   — đồng hồ nguyên tử (TrueTime) → transaction phân tán thật
   • CockroachDB      — Raft + 2PC tối ưu, tương thích PostgreSQL
   • YugabyteDB       — tương tự, tương thích PostgreSQL cao hơn
   • FoundationDB     — transaction phân tán làm nền cho các hệ khác

   → Nếu THẬT SỰ cần transaction phân tán mạnh,
     dùng một hệ ĐÃ GIẢI QUYẾT nó, đừng tự viết 2PC.
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
