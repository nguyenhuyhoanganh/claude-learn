# Bài 3: Isolation và bốn hiện tượng đọc bất thường

Sếp cầm tờ báo cáo doanh thu và hỏi một câu bạn không trả lời được:

```text
   BÁO CÁO DOANH THU THÁNG 8
   ─────────────────────────────
   Sản phẩm 1  ...........  50.000
   Sản phẩm 2  ...........  80.000
   ─────────────────────────────
   TỔNG CỘNG   ..........  155.000
```

50.000 cộng 80.000 bằng 130.000. Tờ báo cáo ghi 155.000. Không có dòng nào bị thiếu, không có phép tính nào sai, code không có bug. Chạy lại thì ra đúng. Chạy lại lần nữa lại ra sai kiểu khác.

Đây là loại lỗi khó chịu nhất trong nghề: **không tái hiện được, không nằm trong code, và chỉ xuất hiện khi hệ thống có người dùng thật**. Nguyên nhân nằm ở một chỗ không ai nghĩ tới — hai câu `SELECT` trong cùng một báo cáo đã nhìn thấy **hai thực tại khác nhau**.

Bài này là bài dài nhất và đáng giá nhất của phase 2. Đọc xong bạn sẽ gọi được tên chính xác của lỗi trên, biết nó thuộc loại nào trong bốn loại, và biết vặn nút nào để nó không xảy ra nữa.

## Câu hỏi mà isolation phải trả lời

Database không phục vụ một người. Nó có hàng trăm kết nối TCP, mỗi kết nối chạy transaction riêng, và chúng cùng đọc cùng ghi trên một tập dữ liệu.

```text
   Kết nối 1 ──▶ ┌─────────────┐
   Kết nối 2 ──▶ │             │
   Kết nối 3 ──▶ │  DATABASE   │  ← tất cả cùng đọc/ghi bảng `sales`
      ...        │             │
   Kết nối N ──▶ └─────────────┘
```

Từ đó nảy ra đúng một câu hỏi, và **isolation level chính là câu trả lời cho câu hỏi này**:

> **Transaction đang chạy của tôi được nhìn thấy những gì từ các transaction khác?**
>
> - Thấy cả thứ họ **chưa** commit?
> - Thấy thứ họ **vừa** commit trong lúc tôi đang chạy?
> - Hay chỉ thấy đúng những gì có tại **thời điểm tôi bắt đầu**?

Không có câu trả lời nào đúng tuyệt đối. Mỗi câu trả lời cho ra một mức đánh đổi khác nhau giữa **độ chính xác** và **tốc độ**. Và mỗi câu trả lời sai chỗ lại đẻ ra một *hiện tượng đọc bất thường* (**read phenomenon**) — tên gọi chung cho các kết quả kỳ quặc mà transaction có thể nhìn thấy.

Có bốn hiện tượng. Học chúng theo **câu chuyện**, đừng học theo định nghĩa.

## Bộ dữ liệu dùng xuyên suốt bài

Mọi ví dụ dưới đây chạy trên đúng một bảng này, để bạn so sánh được các hiện tượng với nhau:

```sql
CREATE TABLE sales (
    product_id INT PRIMARY KEY,
    quantity   INT,
    price      INT
);

INSERT INTO sales VALUES (1, 10, 5), (2, 20, 4);
```

```text
 product_id | quantity | price |  thành tiền
------------+----------+-------+-------------
          1 |       10 |     5 |          50
          2 |       20 |     4 |          80
                                  ─────────────
                          TỔNG:            130
```

Con số **130** là sự thật ban đầu. Bốn hiện tượng dưới đây đều làm cho ai đó nhìn thấy một con số **không phải 130** mà cũng không phải sự thật mới.

---

## Hiện tượng 1 — Dirty Read (đọc bẩn)

**Định nghĩa:** đọc phải dữ liệu mà transaction khác đã ghi nhưng **chưa commit**.

Từ "bẩn" (*dirty*) trong ngành này luôn có nghĩa: *"đã sửa nhưng chưa chốt, còn có thể thay đổi hoặc biến mất"*.

```text
   THỜI GIAN      TRANSACTION A (làm báo cáo)      TRANSACTION B (bán hàng)
   ──────────────────────────────────────────────────────────────────────────
   t1             BEGIN
   t2             SELECT product_id,
                         quantity * price
                    FROM sales;
                  → SP1: 50
                  → SP2: 80
                                                   BEGIN
   t3                                              UPDATE sales
                                                     SET quantity = 15
                                                    WHERE product_id = 1;
                                                   (CHƯA COMMIT)
   t4             SELECT SUM(quantity * price)
                    FROM sales;
                  → 155   ⚠ ĐỌC BẨN
                          (15 × 5) + (20 × 4) = 155
   t5                                              ROLLBACK  ← huỷ luôn!
   t6             COMMIT

   KẾT QUẢ IN RA:
      Sản phẩm 1 ....  50
      Sản phẩm 2 ....  80
      TỔNG      .... 155      ← đúng cái tờ báo cáo ở đầu bài
```

Hai tầng sai ở đây, và tầng thứ hai mới đáng sợ:

1. **Số tổng không khớp với danh sách phía trên nó.** Bản thân điều này đã đủ làm mất niềm tin vào cả tờ báo cáo.
2. **Con số 155 dựa trên một đơn hàng chưa từng tồn tại.** Transaction B đã `ROLLBACK` ở t5 — nghĩa là 5 đơn hàng kia không có thật. Bạn đã in ra một con số được tính từ dữ liệu **chưa bao giờ tồn tại trong database**.

Đây là lý do dirty read được coi là hiện tượng tệ nhất trong bốn hiện tượng: các hiện tượng khác ít nhất còn dựa trên dữ liệu thật.

> **Tin tốt:** PostgreSQL **không bao giờ** cho dirty read xảy ra, kể cả khi bạn yêu cầu `READ UNCOMMITTED` — nó âm thầm nâng lên `READ COMMITTED`. MySQL InnoDB, Oracle mặc định cũng không. Chỉ SQL Server với `READ UNCOMMITTED` (hoặc gợi ý `WITH (NOLOCK)` — vẫn còn rất nhiều người dùng) là thật sự cho phép.

---

## Hiện tượng 2 — Non-Repeatable Read (đọc không lặp lại được)

**Định nghĩa:** trong cùng một transaction, đọc **cùng một dòng** hai lần nhưng ra **hai giá trị khác nhau**, vì transaction khác đã sửa và **đã commit** ở giữa.

Điểm khác dirty read: lần này dữ liệu là **thật**, đã được commit đàng hoàng. Nhưng nó vẫn phá vỡ báo cáo của bạn.

```text
   THỜI GIAN      TRANSACTION A (làm báo cáo)      TRANSACTION B (bán hàng)
   ──────────────────────────────────────────────────────────────────────────
   t1             BEGIN
   t2             SELECT product_id,
                         quantity * price FROM sales;
                  → SP1: 50
                  → SP2: 80
                                                   BEGIN
   t3                                              UPDATE sales
                                                     SET quantity = 15
                                                    WHERE product_id = 1;
   t4                                              COMMIT   ← thật sự chốt
   t5             SELECT SUM(quantity * price)
                    FROM sales;
                  → 155   ⚠ ĐỌC KHÔNG LẶP LẠI
   t6             COMMIT
```

Kết quả in ra **y hệt** dirty read. Nhưng lần này 155 là một con số *thật* — chỉ là nó thuộc về một thời điểm khác với danh sách phía trên.

### Cái bẫy hiểu sai lớn nhất về hiện tượng này

Phản ứng thường gặp: *"Ai lại đi `SELECT` cùng một câu hai lần trong một transaction? Ngu gì làm thế."*

Đúng, không ai chạy y nguyên một câu lệnh hai lần. Nhưng đó **không phải** điều kiện để hiện tượng này xảy ra. Điều kiện thật là: **hai câu lệnh khác nhau cùng đụng tới một dòng dữ liệu**.

```text
   HAI CÂU LỆNH RẤT KHÁC NHAU...              ...NHƯNG CÙNG ĐỌC DÒNG product_id = 1

   SELECT quantity * price FROM sales;   ────┐
                                             ├──▶  dòng (1, 10, 5)
   SELECT SUM(quantity * price) FROM sales; ─┘

   Các cặp câu lệnh khác cũng dính y như vậy:
     • SELECT chi tiết  +  SELECT COUNT(*)
     • SELECT số dư     +  UPDATE trừ tiền theo số dư đó
     • SELECT tồn kho   +  INSERT đơn hàng dựa trên tồn kho đó
     • SELECT danh sách +  SELECT tổng ở cuối trang
```

Nói cách khác: **gần như mọi báo cáo có nhiều truy vấn đều là ứng viên của non-repeatable read**, dù người viết không hề nghĩ mình "đọc hai lần".

### Cái giá để chống hiện tượng này

Muốn "đọc lại vẫn ra giá trị cũ" thì database phải **giữ lại giá trị cũ ở đâu đó**. Hai cách, hai kiến trúc:

```text
   POSTGRESQL — giữ ngay trong bảng           MYSQL / ORACLE — giữ ở undo log
   ══════════════════════════════════          ══════════════════════════════════
   Bảng sales:                                 Bảng sales:
   ┌────┬────┬───┬────────┬────────┐          ┌────┬────┬───┐
   │ 1  │ 10 │ 5 │xmin=50 │xmax=77 │ cũ       │ 1  │ 15 │ 5 │  ← chỉ có bản MỚI
   │ 1  │ 15 │ 5 │xmin=77 │xmax=—  │ mới      └────┴────┴───┘
   └────┴────┴───┴────────┴────────┘          UNDO LOG:
                                               ┌────────────────────────┐
   A đọc bản có xmin=50 → thấy 10              │XID 77: id=1 qty cũ = 10│
   Đọc thẳng trong bảng, rất nhanh.            └────────────────────────┘
                                               A phải MỞ undo log ra dựng lại.
   Cái giá: bảng phình, cần VACUUM.            Cái giá: đọc dữ liệu cũ chậm hơn,
                                               transaction dài → undo log phình.
```

Hai cột `xmin` và `xmax` trong PostgreSQL không phải khái niệm trừu tượng — chúng là **cột thật**, xem được:

```sql
SELECT xmin, xmax, product_id, quantity FROM sales;
```

```text
 xmin  | xmax | product_id | quantity
-------+------+------------+----------
 745901|    0 |          1 |       10
 745901|    0 |          2 |       20
```

`xmin` = transaction nào tạo ra phiên bản này. `xmax` = transaction nào đã xoá/thay nó (0 nghĩa là chưa ai). Chạy một `UPDATE` rồi xem lại, `xmin` sẽ đổi — vì đó là **một dòng vật lý hoàn toàn mới**.

---

## Hiện tượng 3 — Phantom Read (đọc bóng ma)

**Định nghĩa:** chạy lại một truy vấn có điều kiện khoảng (`WHERE`, `BETWEEN`, `>`...) thì thấy **những dòng mới chưa từng tồn tại** ở lần chạy trước.

```text
   THỜI GIAN      TRANSACTION A (làm báo cáo)      TRANSACTION B (bán hàng)
   ──────────────────────────────────────────────────────────────────────────
   t1             BEGIN
   t2             SELECT product_id,
                         quantity * price FROM sales;
                  → SP1: 50
                  → SP2: 80
                    (chỉ có 2 sản phẩm)
                                                   BEGIN
   t3                                              INSERT INTO sales
                                                     VALUES (3, 10, 1);
                                                     ← SẢN PHẨM MỚI TOANH
   t4                                              COMMIT
   t5             SELECT SUM(quantity * price)
                    FROM sales;
                  → 140   ⚠ PHANTOM
                          50 + 80 + 10 = 140
   t6             COMMIT
```

### Vì sao phải tách phantom ra khỏi non-repeatable read?

Nhìn bề ngoài hai hiện tượng giống nhau: đều là "chạy lại ra số khác". Nhưng **cách chống chúng khác nhau về bản chất**, và đó là toàn bộ lý do người ta đặt hai cái tên:

```text
   CHỐNG NON-REPEATABLE READ           CHỐNG PHANTOM READ
   ═════════════════════════           ══════════════════
   "Dòng nào tôi đã ĐỌC thì            "Đừng cho dòng MỚI nào lọt vào
    đừng đổi giá trị."                  khoảng tôi đang quan tâm."

   Làm được: khoá đúng dòng đó lại,     Làm thế nào?? Dòng đó CHƯA TỒN TẠI.
   hoặc giữ phiên bản của nó.           Không thể khoá một thứ chưa có.

        ┌───────────┐                        ┌ ─ ─ ─ ─ ─ ┐
        │ dòng id=1 │ ← khoá được            │   ???     │ ← khoá cái gì?
        └───────────┘                        └ ─ ─ ─ ─ ─ ┘
```

Đây chính là chỗ cái tên "bóng ma" đến từ: bạn **không nắm được nó** vì nó chưa tồn tại tại thời điểm bạn muốn nắm.

Hai lời giải thật sự tồn tại cho bài toán này:

1. **Khoá khoảng trống** (*gap lock* / *next-key lock*) — khoá cả những khe hở giữa các dòng, để không ai chèn vào được. MySQL InnoDB dùng cách này.
2. **Ảnh chụp** (*snapshot*) — không khoá gì cả, chỉ đơn giản là **lọc bỏ** mọi dòng sinh ra sau thời điểm transaction bắt đầu. PostgreSQL dùng cách này.

Cách 2 dẫn thẳng tới một sự thật rất hay bị trả lời sai khi phỏng vấn — mục kế tiếp.

---

## Hiện tượng 4 — Lost Update (mất cập nhật)

**Định nghĩa:** hai transaction cùng đọc một giá trị, cùng tính toán trên đó, rồi cùng ghi — và thay đổi của một bên **bị ghi đè mất hoàn toàn**.

Đây là hiện tượng duy nhất trong bốn cái làm **hỏng dữ liệu ghi**, chứ không chỉ làm sai kết quả đọc.

```text
   THỜI GIAN      TRANSACTION A                    TRANSACTION B
   ──────────────────────────────────────────────────────────────────────────
   t1             BEGIN                            BEGIN
   t2             SELECT quantity FROM sales
                   WHERE product_id = 1;
                  → 10
   t3                                              SELECT quantity FROM sales
                                                    WHERE product_id = 1;
                                                   → 10   ← CŨNG đọc ra 10
   t4             -- ứng dụng tính: 10 + 10 = 20
                  UPDATE sales SET quantity = 20
                   WHERE product_id = 1;
   t5                                              -- ứng dụng tính: 10 + 5 = 15
                                                   UPDATE sales SET quantity = 15
                                                    WHERE product_id = 1;
   t6             COMMIT
   t7                                              COMMIT

   ┌──────────────────────────────────────────────────────────────────┐
   │  KẾT QUẢ:  quantity = 15                                         │
   │  ĐÚNG RA:  10 + 10 + 5 = 25                                      │
   │  → 10 đơn hàng của A BIẾN MẤT KHÔNG DẤU VẾT                      │
   └──────────────────────────────────────────────────────────────────┘
```

Không có lỗi nào được báo. Không có log nào ghi lại. Chỉ đơn giản là mười đơn hàng không tồn tại nữa.

Đây chính là bộ khung của mọi sự cố "hai người đặt trùng một ghế", "trừ kho hai lần thành một lần", "điểm thưởng cộng thiếu". Toàn bộ [phase-8 bài 2](../phase-8/02-double-booking-va-pagination.md) dành cho việc chữa nó.

### Cách chữa gọn nhất — và vì sao nó hoạt động

```sql
-- SAI: đọc ra ứng dụng, tính, rồi ghi lại  → có khe hở giữa đọc và ghi
SELECT quantity FROM sales WHERE product_id = 1;   -- 10
UPDATE sales SET quantity = 20 WHERE product_id = 1;

-- ĐÚNG: để database tự đọc-tính-ghi trong một thao tác nguyên tử
UPDATE sales SET quantity = quantity + 10 WHERE product_id = 1;
```

Câu thứ hai không có khe hở, vì việc đọc `quantity` xảy ra **bên trong** câu `UPDATE`, và trong lúc đó dòng đã bị khoá. Transaction B chạy cùng lúc sẽ phải **ngồi chờ** rồi tính trên giá trị mới nhất.

```text
   BIỂU THỨC TỰ THAM CHIẾU — vì sao an toàn

   A:  UPDATE ... SET quantity = quantity + 10 ──┐
                                                 ├─ database khoá dòng
   B:  UPDATE ... SET quantity = quantity + 5  ──┘   → B CHỜ A xong
                                                     → B đọc 20, ghi 25 ✔
```

Không phải lúc nào cũng viết được thành một biểu thức như vậy (ví dụ khi cần kiểm tra điều kiện nghiệp vụ phức tạp). Khi đó dùng `SELECT ... FOR UPDATE` hoặc khoá lạc quan bằng cột phiên bản — chi tiết ở [phase-8](../phase-8/01-shared-lock-va-exclusive-lock.md) và [phase-17 bài 7](../phase-17/07-concurrency-control-va-innodb-locking.md).

---

## Bốn hiện tượng trong một bảng

| Hiện tượng | Chuyện gì xảy ra | Dữ liệu có thật không | Hỏng cái gì |
|---|---|---|---|
| **Dirty read** | Đọc thứ người khác chưa commit | **Không** — có thể bị rollback | Kết quả đọc |
| **Non-repeatable read** | Dòng đã đọc bị người khác **sửa** rồi commit | Có | Kết quả đọc |
| **Phantom read** | Có dòng **mới** lọt vào khoảng đang xét | Có | Kết quả đọc |
| **Lost update** | Ghi của mình bị người khác **đè mất** | Có | **Dữ liệu ghi** |

Mẹo nhớ bằng ba câu hỏi:

```text
   Dữ liệu đó đã commit chưa?     Chưa  → DIRTY READ
                                   Rồi  ↓
   Dòng đó có sẵn từ trước không?  Có   → NON-REPEATABLE READ
                                   Không→ PHANTOM READ

   Còn nếu MẤT thứ mình vừa ghi   → LOST UPDATE
```

> **Chi tiết lịch sử đáng biết:** chuẩn ANSI SQL-92 chỉ định nghĩa **ba** hiện tượng đầu. *Lost update* được bổ sung sau bởi bài phê bình nổi tiếng năm 1995 của Berenson và cộng sự (*"A Critique of ANSI SQL Isolation Levels"*), cùng với *write skew* và *read skew*. Đó là lý do bảng chuẩn trong nhiều tài liệu chỉ có ba cột — và cũng là lý do bảng đó **không đủ** để mô tả thực tế.

---

## Bốn mức isolation — và cơ chế thật bên dưới

### `READ UNCOMMITTED` — không có tường

Transaction thấy mọi thứ, kể cả thứ chưa commit.

```sql
BEGIN TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
```

Lý thuyết nói mức này nhanh nhất vì "không phải duy trì gì cả". Thực tế: **hầu như không hệ nào cài đặt nó thật**, vì với kiến trúc MVCC thì việc *giữ* phiên bản cũ còn rẻ hơn việc *bỏ* nó. PostgreSQL nhận lệnh này rồi âm thầm chạy ở `READ COMMITTED`.

### `READ COMMITTED` — chỉ thấy thứ đã chốt

Mặc định của PostgreSQL, Oracle, SQL Server.

```sql
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

Cơ chế: **mỗi câu lệnh lấy một ảnh chụp mới**.

```text
   BEGIN  ─── câu lệnh 1 ─── câu lệnh 2 ─── câu lệnh 3 ─── COMMIT
                  ▲              ▲              ▲
              ảnh chụp A     ảnh chụp B     ảnh chụp C
              (mỗi câu một ảnh khác nhau)
```

Chặn được dirty read. **Không** chặn được non-repeatable read và phantom — vì mỗi câu lệnh nhìn một ảnh khác nhau, nên câu sau thấy được thay đổi mà câu trước không thấy.

Đây là mức phù hợp với đại đa số nghiệp vụ OLTP: mỗi câu lệnh đứng độc lập, không ai cần "cả transaction cùng nhìn một thực tại".

### `REPEATABLE READ` — một ảnh chụp cho cả transaction

Mặc định của MySQL InnoDB.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
```

Cơ chế: **một ảnh chụp duy nhất, chụp lúc câu lệnh đầu tiên chạy, dùng cho toàn bộ transaction**.

```text
   BEGIN  ─── câu lệnh 1 ─── câu lệnh 2 ─── câu lệnh 3 ─── COMMIT
                  ▲
              ảnh chụp DUY NHẤT
              cả ba câu đều nhìn ảnh này
```

Chặn được dirty read và non-repeatable read. Còn phantom read thì — **tuỳ hệ**, và đây là chỗ mọi người trả lời sai.

### `SERIALIZABLE` — như thể chạy lần lượt

```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
```

Cam kết: kết quả cuối cùng phải **giống hệt** như thể các transaction chạy nối đuôi nhau, không hề song song.

Cách cài đặt thì không hề chạy nối đuôi thật (như thế sẽ chậm không dùng được). Có hai trường phái:

- **Bi quan** (*pessimistic*) — khoá thật, ai đụng thì chờ. SQL Server truyền thống theo hướng này.
- **Lạc quan** (*optimistic*) — cứ cho chạy song song, đến cuối mới kiểm tra xem có mâu thuẫn không. Nếu có thì **giết một transaction** và bắt thử lại. PostgreSQL dùng cách này, gọi là **SSI** (*Serializable Snapshot Isolation*), có từ phiên bản 9.1.

Với cách lạc quan, ứng dụng của bạn **bắt buộc** phải biết xử lý lỗi này:

```text
ERROR:  could not serialize access due to read/write dependencies
        among transactions
SQLSTATE: 40001
HINT:  The transaction might succeed if retried.
```

Đây không phải bug. Đó là thiết kế: database nói *"tôi không đảm bảo được tính tuần tự, bạn chạy lại giúp"*. Không có vòng lặp thử lại thì đừng dùng `SERIALIZABLE`.

---

## Bảng chuẩn — và bảng thực tế

Đây là bảng bạn thấy ở mọi nơi, trích từ chuẩn ANSI SQL:

| Mức | Dirty read | Non-repeatable read | Phantom read |
|---|---|---|---|
| `READ UNCOMMITTED` | Có thể | Có thể | Có thể |
| `READ COMMITTED` | Không | Có thể | Có thể |
| `REPEATABLE READ` | Không | Không | **Có thể** |
| `SERIALIZABLE` | Không | Không | Không |

**Bảng này mô tả mức tối thiểu mà chuẩn đòi hỏi, không mô tả hệ thật.** Dưới đây mới là thực tế — và đây là phần tạo ra khác biệt khi phỏng vấn:

| Hệ | Mặc định | `READ UNCOMMITTED` có thật? | `REPEATABLE READ` chặn phantom? |
|---|---|---|---|
| **PostgreSQL** | `READ COMMITTED` | Không — bị nâng thành `READ COMMITTED` | **CÓ** — vì cài đặt bằng snapshot |
| **MySQL InnoDB** | `REPEATABLE READ` | Có | **Có với `SELECT` thường** (đọc từ snapshot); nhưng đọc có khoá và câu lệnh ghi lại nhìn dữ liệu mới nhất → vẫn có bất thường |
| **Oracle** | `READ COMMITTED` | Không hỗ trợ | Không có mức này; chỉ có `READ COMMITTED` và `SERIALIZABLE` |
| **SQL Server** | `READ COMMITTED` (khoá) | **Có** — và bị lạm dụng qua `WITH (NOLOCK)` | Không, trừ khi bật `SNAPSHOT` isolation |

### Vì sao PostgreSQL `REPEATABLE READ` lại chặn được phantom

Đây là câu hỏi vặn kinh điển. Câu trả lời nằm ở **cách cài đặt**, không nằm ở tên gọi:

```text
   CÁCH 1 — DÙNG KHOÁ  (cách chuẩn ANSI hình dung)
   ════════════════════════════════════════════════
   "Repeatable read" = khoá lại những DÒNG mình đã đọc.
        dòng 1  🔒 khoá
        dòng 2  🔒 khoá
        (khe trống giữa chúng — KHÔNG khoá được)
   → ai đó INSERT vào khe trống → PHANTOM lọt vào ✘

   CÁCH 2 — DÙNG SNAPSHOT  (PostgreSQL)
   ════════════════════════════════════════════════
   "Repeatable read" = ghi nhớ mình bắt đầu ở thời điểm nào,
   rồi LỌC BỎ mọi dòng sinh ra sau thời điểm đó.
        dòng mới có xmin > snapshot của tôi → VÔ HÌNH
   → phantom không lọt được, vì không cần khoá gì cả ✔
```

Nói ngắn: PostgreSQL chặn phantom **không phải vì nó cố chặn**, mà vì cơ chế snapshot của nó **tình cờ chặn luôn**. Cùng một cái tên `REPEATABLE READ`, hai hệ cho hành vi khác nhau — vì chúng cài đặt bằng hai cách khác nhau.

Đây chính là ví dụ hoàn hảo cho nguyên tắc đã nói ở [phase-1 bài 2](../phase-1/02-lo-trinh-hoc-database.md): **học cơ chế thì suy ra được kết luận; học thuộc bảng kết luận thì sai ngay khi đổi hệ.**

### PostgreSQL `REPEATABLE READ` còn chặn cả lost update

Một điểm nữa ít người biết. Thử hai phiên:

```sql
-- Phiên A
BEGIN ISOLATION LEVEL REPEATABLE READ;
UPDATE sales SET quantity = 20 WHERE product_id = 1;

-- Phiên B (chạy khi A chưa commit)
BEGIN ISOLATION LEVEL REPEATABLE READ;
UPDATE sales SET quantity = 15 WHERE product_id = 1;
-- → B ngồi chờ

-- Phiên A
COMMIT;
```

Ngay khi A commit, phiên B nhận:

```text
ERROR:  could not serialize access due to concurrent update
SQLSTATE: 40001
```

PostgreSQL **từ chối** ghi đè thay vì âm thầm làm mất cập nhật của A. So sánh với `READ COMMITTED`: ở mức đó B sẽ chờ, rồi ghi đè thành công, và 10 đơn hàng của A biến mất không một tiếng động.

```text
   READ COMMITTED        →  B ghi đè, IM LẶNG mất dữ liệu   ✘
   REPEATABLE READ       →  B bị từ chối, ứng dụng biết mà thử lại  ✔
```

Bài học rút ra rất thực dụng: **lỗi 40001 là bạn, không phải kẻ thù.** Nó là database đang cứu dữ liệu của bạn. Cái giá phải trả là ứng dụng phải có vòng lặp thử lại.

---

## Thực hành: tái hiện từng hiện tượng bằng hai cửa sổ psql

Đây là phần nên làm tay. Mở hai terminal cạnh nhau.

```bash
docker run --name iso-lab -e POSTGRES_PASSWORD=lab -p 5434:5432 -d postgres:16
# Terminal 1
docker exec -it iso-lab psql -U postgres
# Terminal 2
docker exec -it iso-lab psql -U postgres
```

```sql
-- Chạy ở một phiên bất kỳ
CREATE TABLE sales (product_id INT PRIMARY KEY, quantity INT, price INT);
INSERT INTO sales VALUES (1, 10, 5), (2, 20, 4);
```

### Thí nghiệm 1 — non-repeatable read ở `READ COMMITTED`

| Phiên A | Phiên B |
|---|---|
| `BEGIN;` | |
| `SELECT SUM(quantity*price) FROM sales;` → `130` | |
| | `UPDATE sales SET quantity=15 WHERE product_id=1;` |
| `SELECT SUM(quantity*price) FROM sales;` → **`155`** ⚠ | |
| `COMMIT;` | |

Cùng một câu lệnh, trong cùng một transaction, ra hai kết quả. Đó là non-repeatable read.

### Thí nghiệm 2 — chữa bằng `REPEATABLE READ`

Đặt lại dữ liệu (`UPDATE sales SET quantity=10 WHERE product_id=1;`) rồi làm lại:

| Phiên A | Phiên B |
|---|---|
| `BEGIN ISOLATION LEVEL REPEATABLE READ;` | |
| `SELECT SUM(quantity*price) FROM sales;` → `130` | |
| | `UPDATE sales SET quantity=15 WHERE product_id=1;` |
| `SELECT SUM(quantity*price) FROM sales;` → **`130`** ✔ | |
| `COMMIT;` | |
| `SELECT SUM(quantity*price) FROM sales;` → `155` | |

Trong suốt transaction, A nhìn thấy **một thực tại ổn định**. Chỉ sau khi commit nó mới thấy thế giới đã đổi.

### Thí nghiệm 3 — phantom read, và bằng chứng Postgres chặn được

| Phiên A | Phiên B |
|---|---|
| `BEGIN ISOLATION LEVEL REPEATABLE READ;` | |
| `SELECT COUNT(*) FROM sales;` → `2` | |
| | `INSERT INTO sales VALUES (3, 10, 1);` |
| `SELECT COUNT(*) FROM sales;` → **`2`** ✔ không thấy bóng ma | |
| `COMMIT;` | |
| `SELECT COUNT(*) FROM sales;` → `3` | |

Chạy đúng kịch bản này trên MySQL với `SELECT ... FOR UPDATE` thay cho `SELECT` thường sẽ cho kết quả khác — đó là điểm khác biệt "đọc nhất quán" và "đọc hiện tại" của InnoDB.

### Thí nghiệm 4 — lost update và cách chặn

| Phiên A | Phiên B |
|---|---|
| `BEGIN;` | `BEGIN;` |
| `SELECT quantity FROM sales WHERE product_id=1;` → `10` | |
| | `SELECT quantity FROM sales WHERE product_id=1;` → `10` |
| `UPDATE sales SET quantity=20 WHERE product_id=1;` | |
| | `UPDATE sales SET quantity=15 WHERE product_id=1;` *(chờ)* |
| `COMMIT;` | |
| | *(hết chờ, ghi đè thành công)* `COMMIT;` |
| `SELECT quantity ...` → **`15`** — mất 10 đơn của A ⚠ | |

Làm lại với biểu thức tự tham chiếu:

| Phiên A | Phiên B |
|---|---|
| `BEGIN;` `UPDATE sales SET quantity=quantity+10 WHERE product_id=1;` | |
| | `BEGIN;` `UPDATE sales SET quantity=quantity+5 WHERE product_id=1;` *(chờ)* |
| `COMMIT;` | |
| | *(hết chờ, đọc lại giá trị MỚI)* `COMMIT;` |
| `SELECT quantity ...` → **`25`** ✔ đúng | |

---

## Chọn isolation level thế nào

| Tình huống | Mức nên dùng | Vì sao |
|---|---|---|
| API CRUD thông thường | `READ COMMITTED` | Mỗi câu lệnh độc lập, không cần nhìn chung một thực tại |
| Báo cáo nhiều truy vấn | `REPEATABLE READ` | Mọi con số trong báo cáo phải nhất quán với nhau |
| Xuất dữ liệu, đối soát | `REPEATABLE READ` | Cần ảnh chụp ổn định trong suốt quá trình |
| Trừ kho, đặt chỗ, chuyển tiền | `READ COMMITTED` + `SELECT ... FOR UPDATE` | Khoá tường minh rõ ý đồ hơn và ít bị từ chối hơn |
| Nghiệp vụ có bất biến phức tạp giữa nhiều bảng | `SERIALIZABLE` | Chỉ mức này chặn được *write skew* |
| Chấp nhận số hơi lệch, cần nhanh tối đa | `READ COMMITTED` | Rẻ nhất |

Một bất thường chưa nhắc tới, chỉ `SERIALIZABLE` mới chặn được — **write skew** (lệch ghi):

```text
   Quy định: ca trực phải có ít nhất 1 bác sĩ.
   Hiện có 2 bác sĩ: An và Bình.

   An:   đếm bác sĩ đang trực → 2 → "còn Bình, mình xin nghỉ được"
   Bình: đếm bác sĩ đang trực → 2 → "còn An, mình xin nghỉ được"
   An:   UPDATE ... An nghỉ      COMMIT
   Bình: UPDATE ... Bình nghỉ    COMMIT

   → 0 bác sĩ trực. Cả hai đều đọc đúng, ghi đúng dòng CỦA MÌNH,
     không hề ghi đè nhau — nên KHÔNG phải lost update.
     Nhưng quy tắc nghiệp vụ đã bị phá.
```

Không có khoá dòng nào chặn được chuyện này, vì hai người sửa **hai dòng khác nhau**. Chỉ `SERIALIZABLE` (hoặc một khoá tường minh trên "cả ca trực") mới xử lý được.

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| Học thuộc bảng chuẩn ANSI rồi áp cho mọi hệ | Bảng đó là mức **tối thiểu**, hệ thật thường mạnh hơn | Kiểm tra hành vi thật của hệ bạn dùng, bằng hai phiên psql |
| Dùng `SERIALIZABLE` mà không có vòng lặp thử lại | Ứng dụng sẽ ném lỗi 40001 vào mặt người dùng | Bọc transaction trong retry có backoff, tối đa 3-5 lần |
| Nâng isolation level để chữa lost update | Ở `READ COMMITTED` thì không chữa được; ở mức cao hơn thì đổi lỗi im lặng thành lỗi ồn ào | Dùng biểu thức tự tham chiếu hoặc `FOR UPDATE` |
| Dùng `WITH (NOLOCK)` trên SQL Server cho mọi truy vấn | Đó chính là bật dirty read — đọc phải dữ liệu sẽ bị rollback | Chỉ dùng cho thống kê thô chấp nhận sai số |
| Nghĩ isolation cao thì luôn an toàn hơn | Isolation cao làm tăng tỉ lệ chờ và tỉ lệ bị huỷ, có thể làm sập thông lượng | Chọn mức thấp nhất **đủ** cho nghiệp vụ |
| Thử nghiệm bằng một phiên psql | Không có tranh chấp thì không hiện tượng nào xảy ra | Bắt buộc phải mở hai phiên trở lên |
| Giữ `REPEATABLE READ` trong transaction dài | Ảnh chụp cũ chặn `VACUUM` dọn rác toàn database | Giữ transaction ngắn, đặt `idle_in_transaction_session_timeout` |

## Tóm tắt bài 3

- Isolation trả lời đúng một câu: **transaction của tôi nhìn thấy gì từ transaction khác**. Mỗi câu trả lời sai chỗ đẻ ra một hiện tượng đọc bất thường.
- **Bốn hiện tượng**: dirty read (đọc thứ chưa commit) → non-repeatable read (dòng đã đọc bị sửa) → phantom read (dòng mới lọt vào) → lost update (ghi bị đè mất). Ba cái đầu hỏng kết quả *đọc*, cái cuối hỏng dữ liệu *ghi*.
- Non-repeatable read **không** đòi bạn chạy lại y nguyên một câu lệnh — chỉ cần hai câu lệnh khác nhau cùng đụng một dòng. Vì thế gần như mọi báo cáo nhiều truy vấn đều là ứng viên.
- Phantom tách riêng khỏi non-repeatable vì **không thể khoá thứ chưa tồn tại** — phải dùng gap lock hoặc snapshot.
- **Bảng chuẩn ANSI mô tả mức tối thiểu, không mô tả hệ thật.** PostgreSQL `REPEATABLE READ` chặn luôn cả phantom và cả lost update — vì nó cài đặt bằng snapshot chứ không bằng khoá dòng.
- **Lỗi 40001 là bạn**: nó là database từ chối làm mất dữ liệu của bạn. Đổi lại, ứng dụng phải có vòng lặp thử lại.
- Chọn mức **thấp nhất đủ dùng**; nâng mức không miễn phí — nó đổi lỗi im lặng lấy lỗi ồn ào và lấy thêm thời gian chờ.

**Bài kế tiếp** → [Bài 4: Consistency và Eventual Consistency](04-consistency-va-eventual-consistency.md)
