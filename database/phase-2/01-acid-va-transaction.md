# Bài 1: ACID và Transaction — 100 nghìn đồng bốc hơi thế nào

Một ngân hàng nhỏ. Khách chuyển 100.000đ từ tài khoản A sang tài khoản B. Code chạy hai câu lệnh:

```sql
UPDATE accounts SET balance = balance - 100000 WHERE id = 1;   -- trừ A
UPDATE accounts SET balance = balance + 100000 WHERE id = 2;   -- cộng B
```

Máy chủ mất điện đúng khe hở giữa hai câu. Bật lại, mở database lên xem:

```text
 id | balance
----+---------
  1 |  900000     ← đã bị trừ
  2 |  500000     ← chưa được cộng
```

100.000đ vừa **biến mất khỏi vũ trụ**. Không ai lấy, không log nào ghi, không có gì để đối soát. Tổng tiền trong hệ thống hụt đi đúng 100.000đ và sẽ hụt mãi mãi cho đến khi có người phát hiện bằng tay.

Toàn bộ chữ ACID sinh ra để tình huống trên **không thể xảy ra**. Bài này bắt đầu từ viên gạch đầu tiên: transaction.

## Transaction là gì — và vì sao nó phải tồn tại

**Transaction** (giao dịch) là một **nhóm câu lệnh SQL được đối xử như một đơn vị công việc duy nhất**.

Cụm "đơn vị công việc duy nhất" (*unit of work*) nghĩa là: hoặc **toàn bộ** nhóm có hiệu lực, hoặc **không câu nào** có hiệu lực. Không có trạng thái ở giữa.

Vì sao SQL cần khái niệm này trong khi các ngôn ngữ khác không cần? Vì dữ liệu quan hệ **bị chẻ ra nhiều bảng**. Một việc có ý nghĩa với con người ("chuyển tiền", "đặt hàng", "huỷ vé") gần như không bao giờ gói gọn trong một câu lệnh:

```text
   Ý ĐỊNH CỦA CON NGƯỜI              CÂU LỆNH DATABASE PHẢI CHẠY
   ─────────────────────             ────────────────────────────────────
   "Chuyển 100k từ A sang B"    →    SELECT  kiểm tra A còn đủ tiền
                                     UPDATE  trừ A
                                     UPDATE  cộng B

   "Đặt một đơn hàng"           →    INSERT  vào orders
                                     INSERT  vào order_items (nhiều dòng)
                                     UPDATE  trừ tồn kho
                                     UPDATE  trừ điểm khuyến mãi

   "Huỷ vé"                     →    UPDATE  đổi trạng thái vé
                                     UPDATE  trả ghế về kho
                                     INSERT  bản ghi hoàn tiền
```

Cột trái là **một** việc. Cột phải là **nhiều** câu lệnh. Transaction chính là cái cầu nối giữa hai cột đó: nó cho phép bạn nói với database *"mấy câu này là một việc, đừng tách chúng ra"*.

### Nhìn kỹ ví dụ chuyển tiền

```sql
BEGIN;                                                    -- (1)

SELECT balance FROM accounts WHERE id = 1;                -- (2) → 1000000
-- ứng dụng kiểm tra: 1000000 >= 100000 ? OK

UPDATE accounts SET balance = balance - 100000 WHERE id = 1;  -- (3)
UPDATE accounts SET balance = balance + 100000 WHERE id = 2;  -- (4)

COMMIT;                                                   -- (5)
```

Từng bước một, và điều gì xảy ra nếu chết ở đó:

| Bước | Làm gì | Chết ở đây thì sao |
|---|---|---|
| (1) `BEGIN` | Báo database: "tôi bắt đầu một đơn vị công việc" | Không sao — chưa làm gì |
| (2) `SELECT` | Đọc số dư để kiểm tra điều kiện nghiệp vụ | Không sao — chỉ đọc |
| (3) `UPDATE` trừ | Trừ tiền tài khoản nguồn | **Database tự hoàn tác** khi khởi động lại |
| (4) `UPDATE` cộng | Cộng tiền tài khoản đích | **Database tự hoàn tác cả (3) lẫn (4)** |
| (5) `COMMIT` | "Tôi hài lòng, lưu vĩnh viễn" | Xem mục *"Chết đúng lúc COMMIT"* bên dưới |

So sánh với ví dụ mở đầu bài: ở đó không có `BEGIN`/`COMMIT`, nên mỗi câu `UPDATE` là một transaction riêng, tự commit ngay khi chạy xong. Câu (3) commit thành công, câu (4) không kịp chạy — và tiền bốc hơi. Có `BEGIN` bao ngoài thì (3) chưa được coi là thật cho tới khi (5) chạy xong.

> **Một chi tiết dễ bỏ sót:** câu (2) đọc số dư ra rồi ứng dụng mới kiểm tra. Giữa lúc đọc và lúc trừ, một transaction khác có thể đã rút hết tiền. Transaction **không** tự động chống được chuyện này — cần thêm khoá hoặc isolation level cao. Đó là nội dung [bài 3](03-isolation-va-read-phenomena.md).

## Vòng đời của một transaction

```text
                          ┌─────────┐
                          │  BEGIN  │
                          └────┬────┘
                               │  database cấp một Transaction ID (XID)
                               │  và chụp một "snapshot" trạng thái hiện tại
                               ▼
                    ┌──────────────────────┐
              ┌────▶│  ĐANG CHẠY (active)  │◀────┐
              │     └──────────┬───────────┘     │
              │                │                 │
              │    câu lệnh    │                 │  câu lệnh tiếp theo
              └────  thành công┘                 └──────────────────┐
                               │                                    │
        ┌──────────────────────┼────────────────────────┬───────────┘
        │                      │                        │
   câu lệnh LỖI          người dùng gõ            người dùng gõ
   (vi phạm ràng buộc,      COMMIT                   ROLLBACK
    sai cú pháp,               │                        │
    trùng khoá chính)          │                        │
        │                      ▼                        ▼
        │            ┌──────────────────┐    ┌────────────────────┐
        │            │ ĐANG COMMIT      │    │  ĐANG ROLLBACK     │
        │            │ ghi WAL, fsync   │    │  hoàn tác thay đổi │
        │            └────────┬─────────┘    └─────────┬──────────┘
        │                     ▼                        │
        │            ┌──────────────────┐              │
        │            │ ĐÃ COMMIT ✔      │              │
        │            │ dữ liệu vĩnh viễn│              │
        │            └──────────────────┘              │
        │                                              │
        └──────────────────────────────────────────────┘
                             ▼
                   ┌────────────────────┐
                   │  ĐÃ HUỶ (aborted)  │
                   │  như chưa từng xảy │
                   └────────────────────┘

    ĐƯỜNG THỨ BA — không do người dùng gây ra:
        MẤT ĐIỆN / TIẾN TRÌNH BỊ GIẾT ở bất kỳ điểm nào phía trên
             → khi database khởi động lại, nó tự nhận ra transaction này
               chưa commit và tự đưa về trạng thái ĐÃ HUỶ.
```

Ba đường đi ra khỏi trạng thái "đang chạy" — và đường thứ ba là đường quan trọng nhất, vì nó là đường **không ai chủ động chọn**. Chất lượng của một database nằm ở chỗ nó xử lý đường thứ ba tốt đến đâu.

### `ROLLBACK` không miễn phí

Đây là điều gần như mọi tài liệu nhập môn bỏ qua: **rollback là công việc thật, và có thể rất nặng**.

Hình dung: transaction của bạn đã `UPDATE` 5 triệu dòng. Bạn gõ `ROLLBACK`. Database bây giờ phải đi tìm lại 5 triệu giá trị cũ và ghi đè chúng trở lại. Đó không phải thao tác tức thì.

Trong thực tế đã có những rollback chạy **hơn một tiếng đồng hồ**, đặc biệt trên SQL Server với transaction dài. Tệ hơn: có hệ không cho bạn dùng database cho đến khi rollback xong, vì nó phải dọn sạch "rác nửa vời" trước đã. Lúc đó CPU và bộ nhớ bị vắt kiệt cho một việc mà **không tạo ra giá trị nào cả** — chỉ để quay về chỗ cũ.

```text
   TRANSACTION NGẮN (100 dòng)          TRANSACTION DÀI (5 triệu dòng)
   ────────────────────────────         ──────────────────────────────────
   Rollback: vài mili-giây              Rollback: hàng phút tới hàng giờ
   Giữ khoá: vài mili-giây              Giữ khoá: suốt thời gian đó
   Ảnh hưởng người khác: ~0             Ảnh hưởng: mọi ai đụng vào dòng đó
   Rủi ro chết giữa chừng: thấp         Rủi ro: cao (thời gian phơi ra dài)
```

Đây là gốc rễ của lời khuyên **"transaction dài là ý tưởng tồi"** — một lời khuyên hay bị nhắc lại như khẩu hiệu mà không nói lý do. Lý do có ba tầng: rollback đắt, khoá bị giữ lâu chặn người khác, và cửa sổ để sự cố ập vào rộng hơn.

## Hai triết lý ghi dữ liệu — và vì sao Postgres commit nhanh

Đây là câu hỏi thiết kế mà mọi người viết database phải trả lời, và nó giải thích rất nhiều hành vi bạn quan sát được.

> Trong lúc transaction đang chạy, các thay đổi được ghi **xuống đĩa ngay** hay **giữ trong bộ nhớ**?

```text
   TRIẾT LÝ A — "GHI NGAY, GIẢ ĐỊNH SẼ COMMIT"      (PostgreSQL)
   ══════════════════════════════════════════════════════════════
   BEGIN
     UPDATE 1  ──▶ ghi luôn vào WAL + sửa page trong bộ nhớ đệm
     UPDATE 2  ──▶ ghi luôn
     ...
     UPDATE N  ──▶ ghi luôn
   COMMIT      ──▶ chỉ cần ghi MỘT bản ghi nhỏ: "XID 12345 đã commit"
                   rồi fsync.  → COMMIT RẤT NHANH
   ROLLBACK    ──▶ ghi "XID 12345 đã huỷ". Dữ liệu rác để đó,
                   VACUUM dọn sau. → ROLLBACK CŨNG NHANH,
                   nhưng NỢ LẠI công việc dọn dẹp.

   TRIẾT LÝ B — "GIỮ TRONG BỘ NHỚ, ĐỔ XUỐNG KHI COMMIT"
   ══════════════════════════════════════════════════════════════
   BEGIN
     UPDATE 1  ──▶ chỉ đổi trong RAM
     UPDATE 2  ──▶ chỉ đổi trong RAM
     ...
   COMMIT      ──▶ bây giờ mới đổ TẤT CẢ xuống đĩa
                   → COMMIT CHẬM, tỉ lệ thuận với khối lượng đã sửa
   ROLLBACK    ──▶ vứt bộ nhớ đi. → ROLLBACK CỰC NHANH
```

Không có phương án nào đúng tuyệt đối. Đó là một **đánh đổi**, và mỗi hệ chọn theo giả định của mình về workload:

| | Triết lý A (ghi ngay) | Triết lý B (giữ bộ nhớ) |
|---|---|---|
| Tốc độ `COMMIT` | Nhanh, gần như không phụ thuộc kích thước transaction | Chậm dần theo kích thước transaction |
| Tốc độ `ROLLBACK` | Nhanh (nhưng nợ việc dọn) | Rất nhanh, không nợ gì |
| Lượng I/O tổng | Cao — ghi cả những thứ sau này bị huỷ | Thấp hơn |
| Rủi ro chết **trong lúc** commit | Thấp (cửa sổ commit hẹp) | Cao (cửa sổ commit rộng) |
| Giả định ngầm | "Đa số transaction sẽ commit" | "Rollback đủ thường xuyên để đáng tối ưu" |

PostgreSQL chọn triết lý A. Hệ quả quan sát được: commit của Postgres rất nhanh, nhưng nó tạo ra **nhiều I/O hơn** và cần `VACUUM` chạy nền để dọn phiên bản chết — kể cả phiên bản do transaction bị rollback sinh ra.

Đây là ví dụ mẫu mực cho câu hỏi *"vì sao công nghệ này tồn tại?"*: `VACUUM` không phải một khiếm khuyết của PostgreSQL, nó là **hoá đơn** của lựa chọn thiết kế "ghi ngay, commit nhanh".

### Chết đúng lúc `COMMIT` — tình huống đáng sợ nhất

```text
   Client                     Database                    Đĩa
     │                            │                        │
     │──── COMMIT ───────────────▶│                        │
     │                            │─── ghi WAL ───────────▶│
     │                            │                        │  ⚡ MẤT ĐIỆN
     │  (không nhận được gì)      │                        │
     │                            │                        │
     │  ??? Đã commit hay chưa ???                         │
```

Client không biết kết quả. Hai khả năng, và cả hai đều **đúng đắn**:

- Nếu bản ghi commit đã kịp xuống đĩa → khi khởi động lại, transaction được xem là **đã commit**.
- Nếu chưa kịp → transaction bị coi là **đã huỷ**.

Điều database **cam kết** không phải là "sẽ luôn commit thành công", mà là "sẽ không bao giờ rơi vào trạng thái nửa vời". Ứng dụng phải tự xử lý sự mập mờ này — và đó là lý do các thao tác quan trọng cần **khoá bất biến** (idempotency key): thử lại lần nữa, nếu lần trước đã thành công thì không bị làm hai lần.

Quan sát thú vị: hệ nào commit **càng nhanh** thì cửa sổ để mất điện rơi trúng lúc commit **càng hẹp**, nên xác suất rơi vào tình huống mập mờ này càng thấp. Tốc độ commit không chỉ là chuyện hiệu năng, nó còn là chuyện xác suất gặp rắc rối.

## Transaction ngầm — bạn luôn ở trong một transaction

Đây là điều làm nhiều người ngạc nhiên: **mọi câu SQL đều chạy trong một transaction**, kể cả khi bạn không gõ `BEGIN`.

```sql
-- Bạn viết:
UPDATE accounts SET balance = 100 WHERE id = 1;

-- Database thực tế chạy:
BEGIN;
UPDATE accounts SET balance = 100 WHERE id = 1;
COMMIT;
```

Cơ chế này gọi là **autocommit**. Kiểm chứng được ngay trong psql:

```sql
SELECT txid_current();
```

```text
 txid_current
--------------
       745821
```

```sql
SELECT txid_current();
```

```text
 txid_current
--------------
       745822      ← số khác! mỗi câu lệnh là một transaction riêng
```

Còn khi có `BEGIN` bao ngoài:

```sql
BEGIN;
SELECT txid_current();   -- 745823
SELECT txid_current();   -- 745823   ← CÙNG một số
COMMIT;
```

Hai lần gọi ra cùng một số chứng minh cả hai câu nằm trong **cùng một** transaction.

### Hệ quả thực tế: vòng lặp `INSERT` chậm khủng khiếp

Hiểu autocommit giải thích được một hiện tượng rất hay gặp:

```python
# CHẬM — mỗi vòng lặp là một transaction, mỗi transaction một lần fsync
for row in ten_thousand_rows:
    cursor.execute("INSERT INTO logs (msg) VALUES (%s)", (row,))
    conn.commit()

# NHANH HƠN ~50-100 LẦN — một transaction, một lần fsync
cursor.execute("BEGIN")
for row in ten_thousand_rows:
    cursor.execute("INSERT INTO logs (msg) VALUES (%s)", (row,))
conn.commit()
```

Con số đo thực tế trên PostgreSQL với 10.000 dòng:

```text
   Autocommit từng dòng :  ~18.000 ms   (10.000 lần fsync)
   Một transaction      :     ~230 ms   (1 lần fsync)
                                          → nhanh hơn ~78 lần
```

Nguyên nhân không nằm ở việc chèn dữ liệu — nó nằm ở `fsync`. Mỗi `COMMIT` bắt buộc phải chờ đĩa xác nhận đã ghi thật (chi tiết ở [bài 2](02-atomicity-va-durability.md)). Gộp 10.000 lần chờ thành 1 lần là toàn bộ nguồn gốc của khoảng chênh lệch trên.

> Cẩn thận đầu bên kia: gộp **quá** nhiều vào một transaction lại rơi vào bẫy "transaction dài" ở trên. Con số thực dụng thường dùng là **1.000-10.000 dòng mỗi transaction**.

## Transaction chỉ để đọc — nghe vô lý nhưng rất cần

Phản xạ đầu tiên: "chỉ đọc thôi thì cần transaction làm gì, có sửa gì đâu mà sợ mất?"

Transaction cho bạn **hai** thứ, và cái thứ hai mới là lý do transaction read-only tồn tại:

1. Tính nguyên tử — nhóm lệnh một mất một còn. *(Chỉ đọc thì không cần thật.)*
2. **Một ảnh chụp nhất quán tại một thời điểm.** ← đây

Xem chuyện gì xảy ra khi thiếu điều thứ hai:

```text
   BÁO CÁO DOANH THU — KHÔNG có transaction

   10:00:00.000  SELECT SUM(amount) FROM orders;         → 5.000.000.000
   10:00:00.100     ⟵ có đơn hàng mới 3.000.000 được ghi vào
   10:00:00.200  SELECT COUNT(*) FROM orders;            → 12.001
   10:00:00.300  SELECT AVG(amount) FROM orders;         → tính trên 12.001 đơn

   KẾT QUẢ IN RA BÁO CÁO:
     Tổng doanh thu : 5.000.000.000     (tính trên 12.000 đơn)
     Số đơn         : 12.001            (12.001 đơn)
     Trung bình/đơn : 416.632           (tính trên 12.001 đơn)

   Kiểm tra chéo:  5.000.000.000 / 12.001 = 416.632  ✔ khớp
                   nhưng TỔNG lại thiếu mất đơn 3.000.000  ✘

   → Ba con số trong cùng một tờ báo cáo KHÔNG khớp nhau.
     Người đọc sẽ mất niềm tin vào toàn bộ tờ báo cáo,
     và bạn sẽ không tài nào tái hiện được lỗi.
```

Bọc trong một transaction thì cả ba câu lệnh nhìn cùng một ảnh chụp:

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;

SELECT SUM(amount) FROM orders;      -- ảnh chụp lúc 10:00:00.000
SELECT COUNT(*)   FROM orders;       -- vẫn ảnh chụp đó
SELECT AVG(amount) FROM orders;      -- vẫn ảnh chụp đó

COMMIT;
```

Ba con số bây giờ **nhất quán với nhau**. Chúng có thể "cũ" vài trăm mili-giây, nhưng chúng mô tả **cùng một thực tại** — và với báo cáo, nhất quán quan trọng hơn là mới nhất.

Khai báo rõ là read-only còn cho database cơ hội tối ưu:

```sql
BEGIN TRANSACTION READ ONLY;
-- Postgres biết chắc không có gì để rollback, không cần cấp XID ghi
```

## Bốn chữ ACID và vì sao học theo thứ tự này

`ACID` là chữ viết tắt, nhưng thứ tự chữ cái **không** phải thứ tự nên học. Thứ tự hợp lý là **A → I → C → D**:

```text
   A — ATOMICITY (nguyên tử)
       "Tất cả hoặc không gì cả."
       ↓ nếu thiếu → dữ liệu nửa vời → chính là mất 100k ở đầu bài
       ↓
   I — ISOLATION (cô lập)
       "Transaction của tôi thấy gì từ transaction của người khác?"
       ↓ nếu thiếu → đọc phải dữ liệu nửa vời của người khác
       ↓
   C — CONSISTENCY (nhất quán)
       "Dữ liệu luôn thoả các quy tắc mình đặt ra."
       ← C là HỆ QUẢ của A và I, không phải một cơ chế riêng biệt
       ↓
   D — DURABILITY (bền vững)
       "Đã commit thì mất điện cũng còn."
       ← đây là chữ mà rất nhiều hệ NoSQL đem ra đánh đổi lấy tốc độ
```

Điểm mấu chốt hay bị hiểu sai: **C không có cơ chế thực thi riêng của nó**. Không có "bộ máy consistency" nào trong database cả. Nhất quán là *kết quả* của việc thực thi tốt A và I, cộng với các ràng buộc bạn khai báo (khoá ngoại, `CHECK`, `UNIQUE`). Đó là lý do nên học A và I trước rồi mới hiểu được C.

| Chữ | Câu hỏi nó trả lời | Không có nó thì | Học ở |
|---|---|---|---|
| **A**tomicity | Chết giữa chừng thì sao? | Dữ liệu nửa vời, tiền bốc hơi | [Bài 2](02-atomicity-va-durability.md) |
| **I**solation | Chạy song song thì thấy gì của nhau? | Báo cáo sai, đặt trùng ghế, mất cập nhật | [Bài 3](03-isolation-va-read-phenomena.md) |
| **C**onsistency | Dữ liệu có đúng quy tắc không? | Mồ côi, số đếm lệch, tham chiếu gãy | [Bài 4](04-consistency-va-eventual-consistency.md) |
| **D**urability | Mất điện thì còn không? | Mất dữ liệu đã hứa lưu | [Bài 2](02-atomicity-va-durability.md) |

## Thử ngay: thấy transaction hoạt động bằng mắt

Mở **hai** cửa sổ psql cạnh nhau. Đây là bài thực hành đáng giá nhất của cả phase.

```sql
-- Chuẩn bị (chạy ở phiên nào cũng được)
CREATE TABLE accounts (id INT PRIMARY KEY, balance BIGINT);
INSERT INTO accounts VALUES (1, 1000000), (2, 500000);
```

**Phiên A** — bắt đầu chuyển tiền nhưng cố tình chưa commit:

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100000 WHERE id = 1;
SELECT * FROM accounts;
```

```text
 id | balance
----+---------
  2 |  500000
  1 |  900000     ← A tự thấy thay đổi của chính mình
```

**Phiên B** — chạy ngay lúc phiên A còn đang mở:

```sql
SELECT * FROM accounts;
```

```text
 id | balance
----+---------
  1 | 1000000     ← B vẫn thấy giá trị CŨ
  2 |  500000
```

Hai phiên đang nhìn thấy **hai thực tại khác nhau** trên cùng một dòng dữ liệu. Đây chính là isolation đang làm việc, và cũng chính là lý do MVCC phải giữ nhiều phiên bản của một dòng.

**Phiên A** — bây giờ huỷ:

```sql
ROLLBACK;
SELECT * FROM accounts;
```

```text
 id | balance
----+---------
  1 | 1000000     ← quay về như chưa từng có chuyện gì
  2 |  500000
```

Chạy tay một lần sẽ nhớ lâu hơn đọc mười lần. Và hình dung này là nền cho toàn bộ [bài 3](03-isolation-va-read-phenomena.md).

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| Mở transaction rồi gọi API bên ngoài ở giữa | API chậm/treo → transaction giữ khoá hàng chục giây → chặn cả hệ thống | Gọi API **trước** hoặc **sau** transaction, không bao giờ ở trong |
| Bọc cả job xử lý 1 triệu dòng trong một transaction | Rollback hàng giờ, khoá giữ mãi, WAL phình to | Chia lô 1.000-10.000 dòng, commit từng lô |
| Tin rằng `BEGIN` tự chống được ghi đè | Transaction đảm bảo *tất cả hoặc không gì*, **không** đảm bảo *không ai chen ngang* | Cần thêm `SELECT ... FOR UPDATE` hoặc isolation cao hơn |
| Bắt lỗi rồi `COMMIT` như không có gì | Một câu lỗi làm cả transaction vào trạng thái huỷ; commit tiếp chỉ nhận thêm lỗi | Bắt lỗi thì `ROLLBACK`, hoặc dùng `SAVEPOINT` nếu muốn giữ phần trước |
| Nghĩ "chỉ đọc thì khỏi transaction" | Báo cáo nhiều truy vấn sẽ cho các con số không khớp nhau | Bọc báo cáo trong một transaction `REPEATABLE READ` |
| `autocommit` từng dòng khi nạp dữ liệu lớn | Mỗi dòng một `fsync` → chậm gấp hàng chục lần | Gộp lô, hoặc dùng `COPY` |
| Để transaction mở rồi quên đóng | Chặn `VACUUM` dọn rác trên toàn database, bảng phình vô hạn | Luôn dùng `try/finally` hoặc context manager; theo dõi `pg_stat_activity` |

Câu lệnh nên thuộc để bắt bẫy cuối cùng:

```sql
SELECT pid,
       now() - xact_start AS thoi_gian_mo,
       state,
       left(query, 60) AS cau_lenh
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start;
```

Thấy dòng nào `thoi_gian_mo` tính bằng giờ và `state = 'idle in transaction'` thì đó là một transaction bị bỏ quên — và nó đang âm thầm chặn việc dọn rác của cả database.

## Tóm tắt bài 1

- **Transaction** là nhóm câu lệnh được đối xử như một đơn vị công việc: hoặc tất cả có hiệu lực, hoặc không câu nào. Nó tồn tại vì dữ liệu quan hệ bị chẻ ra nhiều bảng, còn một việc của con người thì cần nhiều câu lệnh.
- **Mọi câu SQL đều nằm trong một transaction**, dù bạn có gõ `BEGIN` hay không (autocommit). Hiểu điều này giải thích vì sao vòng lặp `INSERT` từng dòng chậm gấp hàng chục lần.
- `ROLLBACK` **không miễn phí** — với transaction lớn nó có thể chạy hàng giờ. Đó là lý do thật đằng sau lời khuyên "tránh transaction dài".
- Hai triết lý ghi (ghi ngay vs giữ bộ nhớ) là một **đánh đổi**, không có bên đúng tuyệt đối. PostgreSQL chọn ghi ngay → commit nhanh, đổi lại nhiều I/O hơn và cần `VACUUM`.
- **Transaction chỉ đọc** rất đáng dùng: nó cho một ảnh chụp nhất quán, giúp các con số trong cùng một báo cáo khớp nhau.
- Thứ tự học ACID hợp lý là **A → I → C → D**, vì **C là hệ quả** của A và I chứ không phải một cơ chế riêng.

**Bài kế tiếp** → [Bài 2: Atomicity và Durability — cỗ máy chống mất dữ liệu](02-atomicity-va-durability.md)
