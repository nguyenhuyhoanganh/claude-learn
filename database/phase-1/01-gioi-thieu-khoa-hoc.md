# Bài 1: Vì sao phải đi xuống dưới lớp SQL

Có một khoảnh khắc gần như ai làm backend cũng gặp. Query chạy tốt suốt sáu tháng, không ai sửa gì, rồi một sáng thứ Hai nó chạy 8 giây thay vì 8 mili-giây. Không có deploy nào. Không có thay đổi schema nào. Dữ liệu chỉ lớn thêm một chút.

Bạn thêm index. Không nhanh lên. Bạn thêm cache. Đỡ được ba ngày rồi lại y như cũ. Bạn tăng RAM cho máy chủ. Cũng vậy.

Vấn đề là bạn đang chữa bệnh mà **không biết cơ thể vận hành thế nào**. Mỗi cách chữa đều đúng trong một tình huống nào đó, nhưng bạn không biết tình huống của mình là tình huống nào. Khoá này lấp đúng khoảng trống ấy.

## Ba tầng hiểu database — bạn đang ở tầng nào

```text
┌──────────────────────────────────────────────────────────────────────┐
│ TẦNG 1 — DÙNG ĐƯỢC                                                   │
│   Viết SELECT, INSERT, JOIN. Kết nối được từ ứng dụng.               │
│   Câu hỏi tự đặt: "Làm sao lấy được dữ liệu này?"                    │
│   → Đây là điều kiện CẦN để học khoá này.                            │
├──────────────────────────────────────────────────────────────────────┤
│ TẦNG 2 — DÙNG THEO KINH NGHIỆM                                       │
│   Biết "cột trong WHERE thì nên đánh index". Biết "tránh SELECT *".  │
│   Câu hỏi tự đặt: "Cách nào thường nhanh hơn?"                       │
│   → Phần lớn người đi làm dừng ở đây. Đủ dùng cho đến khi không đủ.  │
├──────────────────────────────────────────────────────────────────────┤
│ TẦNG 3 — HIỂU CƠ CHẾ                                                 │
│   Biết vì sao index đôi khi bị bỏ qua. Biết vì sao thêm index lại    │
│   làm chậm hệ thống. Đoán được chi phí trước khi chạy.               │
│   Câu hỏi tự đặt: "Database sẽ phải đọc bao nhiêu page cho câu này?" │
│   → Đây là đích của khoá.                                            │
└──────────────────────────────────────────────────────────────────────┘
```

Khác biệt giữa tầng 2 và tầng 3 không phải là biết nhiều mẹo hơn. Nó là **đổi đơn vị suy nghĩ**: từ "dòng" sang "page", từ "câu lệnh" sang "số lần chạm ổ đĩa". Người ở tầng 3 nhìn một câu SQL là ước lượng được nó tốn bao nhiêu I/O, nên họ không cần đoán mò.

## Bảy câu hỏi tầng 2 không trả lời được

Đây là danh sách kiểm tra. Nếu bạn trả lời trôi chảy cả bảy, khoá này chỉ để ôn lại. Nếu không, mỗi câu tương ứng với một phase phía sau.

| # | Câu hỏi | Vì sao tầng 2 bí | Trả lời ở |
|---|---|---|---|
| 1 | Tôi đã tạo index rồi, sao database vẫn quét toàn bảng? | Vì "có index thì dùng index" là niềm tin, không phải quy tắc. Optimizer so **chi phí**, và quét toàn bảng đôi khi rẻ hơn thật. | [phase-4 bài 3](../phase-4/03-composite-index-va-optimizer.md) |
| 2 | Vì sao index `(a, b)` giúp `WHERE a=1 AND b=2` nhưng vô dụng với `WHERE b=2`? | Vì index là một cây **được sắp xếp theo thứ tự cột**, không phải một cái túi chứa cả hai cột. | [phase-4 bài 3](../phase-4/03-composite-index-va-optimizer.md) |
| 3 | Tôi `DELETE` một triệu dòng rồi mà bảng vẫn chiếm y nguyên dung lượng? | Vì `DELETE` trong PostgreSQL chỉ **đánh dấu chết**, không thu hồi chỗ. | [phase-3 bài 1](../phase-3/01-page-heap-va-io.md) |
| 4 | Hai người bấm "Đặt vé" cùng lúc, vì sao cả hai đều thành công trên cùng một ghế? | Vì `SELECT` rồi `UPDATE` là hai thao tác rời nhau, và giữa chúng có một khe hở thời gian. | [phase-8 bài 2](../phase-8/02-double-booking-va-pagination.md) |
| 5 | `LIMIT 20 OFFSET 100000` chậm 30 giây trong khi `LIMIT 20 OFFSET 0` chỉ 2ms? | Vì `OFFSET` **không nhảy cóc** — database vẫn phải đọc và vứt bỏ 100.000 dòng đầu. | [phase-8 bài 2](../phase-8/02-double-booking-va-pagination.md) |
| 6 | Người dùng bấm Lưu, trang tải lại, dữ liệu vừa lưu biến mất, F5 lại thì hiện ra? | Vì lệnh ghi vào primary còn lệnh đọc rơi vào replica đang trễ vài trăm mili-giây. | [phase-9 bài 1](../phase-9/01-database-replication-la-gi.md) |
| 7 | Vì sao thêm một index lại làm cả hệ thống **chậm đi**? | Vì mỗi `INSERT` phải cập nhật **mọi** index, và index là ghi ngẫu nhiên xuống đĩa. | [phase-4 bài 1](../phase-4/01-co-ban-ve-indexing.md) |

Điểm chung của bảy câu: **không câu nào trả lời được bằng cách đọc thêm cú pháp SQL.** Chúng đều đòi biết database làm gì bên dưới.

## Câu hỏi duy nhất cần mang theo suốt khoá

Xuyên suốt tài liệu gốc mà khoá này dựa vào, tác giả lặp đi lặp lại một câu:

> **"Vì sao công nghệ này tồn tại?"**

Đây không phải khẩu hiệu. Nó là một **công cụ suy luận** rất mạnh, vì mọi thứ trong database đều sinh ra để giải quyết một cơn đau cụ thể. Biết cơn đau thì tự suy ra được cách dùng và giới hạn — khỏi cần học thuộc.

Thử áp dụng ngay cho ba thứ:

```text
WAL (Write-Ahead Log) tồn tại vì sao?
  Cơn đau: ghi dữ liệu thật xuống đĩa là ghi NGẪU NHIÊN → chậm.
           Nhưng không ghi thì mất điện là mất dữ liệu.
  Giải: ghi ý định vào một file NỐI TIẾP (nhanh) trước, sửa dữ liệu thật sau.
  Suy ra ngay:
     • Vì sao commit nhanh mà dữ liệu vẫn an toàn → vì chỉ cần WAL đã xuống đĩa.
     • Vì sao khởi động lại sau sự cố lại lâu     → vì phải đọc lại WAL.
     • Vì sao ổ đĩa chứa WAL nên tách riêng       → vì nó là ghi tuần tự liên tục.

Index tồn tại vì sao?
  Cơn đau: tìm một dòng trong bảng heap phải đọc mọi page.
  Giải: giữ thêm một bản sao ĐÃ SẮP XẾP của một vài cột.
  Suy ra ngay:
     • Vì sao index tốn đĩa            → vì nó là bản sao.
     • Vì sao index làm ghi chậm       → vì bản sao phải cập nhật theo.
     • Vì sao index vô dụng khi lấy 90% số dòng → vì "sắp xếp để nhảy tới"
       chẳng giúp gì khi bạn cần gần như tất cả.

Sharding tồn tại vì sao?
  Cơn đau: một máy chủ có trần cứng về đĩa, RAM, CPU.
  Giải: chẻ dữ liệu ra nhiều máy.
  Suy ra ngay:
     • Vì sao mất JOIN xuyên shard     → hai nửa dữ liệu nằm ở hai tiến trình khác nhau.
     • Vì sao mất UNIQUE toàn cục      → không máy nào nhìn thấy toàn bộ dữ liệu.
     • Vì sao là quyết định một chiều  → gộp lại đòi di chuyển toàn bộ dữ liệu.
```

Ba khối trên minh hoạ đúng phương pháp của cả khoá: **không học thuộc kết luận, học cơn đau rồi tự suy ra kết luận.**

## Phá bỏ quan niệm "database quan hệ không scale được"

Đây là câu nói phổ biến nhất, và cũng sai nhiều nhất. Nó thường được thốt ra ở đúng thời điểm nguy hiểm: khi hệ thống bắt đầu chậm và ai đó đề xuất "chuyển sang NoSQL đi".

Sự thật là database quan hệ có **một cái thang rất dài** để leo, và phần lớn hệ thống chết ở nấc thứ hai vì không biết còn tám nấc nữa.

```text
   NẤC THANG SCALE MỘT DATABASE QUAN HỆ
   (leo từ dưới lên, mỗi nấc rẻ hơn và ít rủi ro hơn nấc trên)

   10 │ Sharding                         Rất đắt, một chiều, mất JOIN + ACID
      │
    9 │ Đổi sang hệ khác (NoSQL...)      Viết lại ứng dụng, đổi mô hình dữ liệu
      │
    8 │ Partitioning                     Vừa, trong suốt với ứng dụng
      │
    7 │ Replica đọc                      Vừa, nhưng phải xử lý replication lag
      │
    6 │ Materialized view / bảng tổng    Nhẹ, hiệu quả cao cho báo cáo
      │
    5 │ Cache tầng ứng dụng              Nhẹ, nhưng đẻ ra bài toán invalidation
      │
    4 │ Connection pooling               Rất rẻ, thường tăng tốc bất ngờ
      │
    3 │ Sửa lại query / bỏ N+1           Rẻ, thường là thủ phạm thật sự
      │
    2 │ Đánh index đúng chỗ              Rẻ, hiệu quả lớn nhất trên mỗi đồng bỏ ra
      │
    1 │ Đo đạc: query nào chậm, chậm ở đâu   ← ĐA SỐ BỎ QUA NẤC NÀY
      └────────────────────────────────────────────────────────────────
```

Quy tắc thực dụng: **chưa leo hết nấc 1 đến 8 thì đừng nói tới nấc 9 và 10.** Và nấc 1 — đo đạc — là nấc bị bỏ qua nhiều nhất, dù nó rẻ nhất.

Vì sao lời khuyên này quan trọng: mỗi nấc thang càng lên cao thì **chi phí quay đầu càng lớn**. Bỏ một index đi mất 5 giây. Bỏ sharding đi có thể mất sáu tháng.

## Khoá này dạy gì và không dạy gì

**Không dạy:**

- Cú pháp SQL. Nếu chưa viết được `JOIN`, hãy học [sql-interview/phase-1](../../sql-interview/phase-1/00-tu-dien-tu-khoa-sql-cho-nguoi-moi.md) trước rồi quay lại.
- Cách quản trị một hệ cụ thể (cấu hình `postgresql.conf`, tinh chỉnh `my.cnf`). Đó là việc của DBA.
- Cách dùng ORM. Ngược lại — khoá này cố ý **không dùng ORM** để bạn nhìn thấy chính xác câu SQL nào được gửi đi.

**Dạy:**

| Chủ đề | Câu hỏi cốt lõi được trả lời |
|---|---|
| ACID (phase 2) | Điều gì đảm bảo tiền không bốc hơi giữa hai lệnh `UPDATE`? |
| Lưu trữ (phase 3) | Một dòng dữ liệu nằm chính xác ở đâu trên ổ đĩa, và đọc nó tốn gì? |
| Indexing (phase 4) | Vì sao tra mục lục nhanh, và khi nào tra mục lục lại chậm hơn đọc thẳng? |
| B-Tree (phase 5) | Cấu trúc nào cho phép tìm 1 dòng trong 100 triệu dòng bằng 4 lần đọc? |
| Partitioning (phase 6) | Chia bảng trong cùng một máy đem lại gì? |
| Sharding (phase 7) | Chia dữ liệu ra nhiều máy phải trả giá gì? |
| Concurrency (phase 8) | Nhiều người ghi cùng lúc thì ai thắng, và ai chờ? |
| Replication (phase 9) | Nhân bản dữ liệu ra sao, và vì sao replica luôn trễ? |
| System design (phase 10) | Ráp tất cả lại để thiết kế database cho một hệ thống thật. |
| Engines (phase 11) | Vì sao InnoDB, MyISAM, RocksDB cho hành vi khác nhau với cùng câu SQL? |
| Cursors (phase 12) | Xử lý 100 triệu dòng mà không làm sập RAM ứng dụng. |
| NoSQL (phase 13) | Khi nào mô hình quan hệ thật sự không phù hợp? |
| Bảo mật (phase 14) | Kết nối database bị nghe lén ở đâu, và phân quyền thế nào cho đúng? |
| Homomorphic (phase 15) | Truy vấn trên dữ liệu đã mã hoá — công nghệ mới, đọc để mở tầm nhìn. |
| Hỏi đáp + thảo luận (phase 16-18) | Những câu hỏi thực chiến không nằm gọn trong phase nào. |

## Cách đọc khoá này cho hiệu quả

### Đừng đọc kiểu marathon

Nội dung này không hợp để nuốt trong một buổi. Không phải vì dài, mà vì **mỗi bài đều đòi bạn đổi cách hình dung một thứ bạn tưởng đã biết**. Đổi mô hình tư duy cần thời gian lắng, không cần thời gian đọc.

Nhịp đọc gợi ý:

```text
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │ 1. Đọc 1 bài │──▶│ 2. Mở psql   │──▶│ 3. Tự hỏi:   │──▶│ 4. Sang bài  │
  │              │   │  gõ lại ví dụ│   │  "chỗ nào    │   │    tiếp      │
  │              │   │  cho ra số   │   │   trong code │   │              │
  │              │   │  của MÁY BẠN │   │   mình dính?"│   │              │
  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
```

Bước 2 là bước bị bỏ nhiều nhất và cũng đắt giá nhất. Con số trong tài liệu là con số của máy người khác; con số bạn tự chạy ra mới là con số bạn nhớ được.

### Ba câu hỏi tự đặt sau mỗi bài

1. *"Điều này ảnh hưởng gì tới code tôi đang viết hôm nay?"* — nếu không nghĩ ra, kiến thức sẽ bay đi trong hai tuần.
2. *"Nếu tôi phớt lờ điều này thì hỏng ở đâu, và hỏng lúc nào?"* — hầu hết đều hỏng ở lúc dữ liệu lớn lên, không phải lúc viết code.
3. *"Hệ tôi đang dùng làm giống hay khác cái tả ở đây?"* — PostgreSQL và MySQL khác nhau ở rất nhiều điểm cốt lõi, và khoá này chỉ rõ từng chỗ.

### Bốn chủ đề bị đánh giá thấp nhất

Ai cũng nói về index và sharding. Bốn thứ này thì ít ai nhắc, và đó chính là chỗ lấy được lợi thế:

| Chủ đề | Vì sao bị bỏ qua | Vì sao đáng giá |
|---|---|---|
| **Partitioning** | Nghe giống sharding nên tưởng phức tạp tương đương | Rẻ hơn sharding hàng chục lần, trong suốt với ứng dụng, và giải quyết được phần lớn bài toán "bảng quá to" |
| **Cursor** | Tưởng là thứ cổ lỗ của thập niên 90 | Là cách duy nhất xử lý 100 triệu dòng mà không nổ RAM ứng dụng |
| **Replication** | Nghĩ là việc của DevOps | Là cách rẻ nhất để nhân đôi khả năng đọc mà không đụng vào kiến trúc |
| **Phân quyền database** | Luôn bị đẩy sang "làm sau" | Là lớp phòng thủ cuối cùng khi ứng dụng đã bị chiếm quyền |

### Nếu bạn chỉ có một buổi tối

Đọc theo đúng thứ tự này, bỏ qua phần còn lại:

1. [Bài 0 — Từ điển thuật ngữ](00-tu-dien-thuat-ngu-database-cho-nguoi-moi.md), riêng phần *"Đường đi của một câu SELECT"*.
2. [phase-3 bài 1 — Page, Heap và I/O](../phase-3/01-page-heap-va-io.md). Đây là bài đổi đơn vị suy nghĩ từ "dòng" sang "page".
3. [phase-4 bài 1 — Cơ bản về Indexing](../phase-4/01-co-ban-ve-indexing.md).

Ba bài đó là bộ xương. Mọi thứ khác treo lên chúng.

## Một điều nên biết trước khi bắt đầu

Nhiều câu trong khoá này kết thúc bằng *"còn tuỳ"*. Đó không phải né tránh — đó là bản chất của lĩnh vực này.

```text
   "Nên dùng index không?"           → tuỳ tỉ lệ đọc/ghi và độ chọn lọc.
   "Nên dùng isolation level nào?"   → tuỳ bạn chịu được hiện tượng đọc nào.
   "Nên sharding không?"             → tuỳ bạn đã leo hết thang chưa.
   "Postgres hay MySQL?"             → tuỳ workload và tuỳ đội của bạn.
```

Điều khoá này dạy không phải là **câu trả lời**, mà là **bộ tiêu chí để tự trả lời**: biết cái gì đánh đổi với cái gì, biết con số nào cần đo, biết ngưỡng nào là ngưỡng lật. Ai thuộc câu trả lời sẽ bí ngay khi tình huống đổi. Ai nắm tiêu chí thì tự suy được.

## Bẫy thường gặp khi mới học internals

| Bẫy | Vì sao sai | Cách nghĩ đúng |
|---|---|---|
| "Cứ đánh index hết cột trong `WHERE`" | Mỗi index bắt mọi lệnh ghi trả thêm phí | Đánh index theo **query thật đang chậm**, đo trước và sau |
| "Cost trong `EXPLAIN` là mili-giây" | Cost là đơn vị quy ước, không có đơn vị thời gian | Cost chỉ dùng để **so hai kế hoạch**, muốn biết thời gian thì `EXPLAIN ANALYZE` |
| "Query chậm thì thêm RAM" | Nếu nút cổ chai là khoá hoặc là kế hoạch sai thì RAM vô ích | Đo trước: chậm vì I/O, vì CPU, hay vì chờ khoá? |
| "NoSQL nhanh hơn SQL" | Nhanh hơn ở **một loại truy cập cụ thể**, chậm hơn ở loại khác | So theo từng mẫu truy cập, đừng so chung chung |
| "Transaction là thứ chỉ ngân hàng cần" | Mọi thao tác đụng từ hai bảng trở lên đều cần | Hỏi: nếu chết giữa chừng thì dữ liệu có sai không? |
| "Đọc thì không cần transaction" | Báo cáo đọc nhiều lệnh không cùng snapshot sẽ ra số không khớp nhau | Báo cáo nhiều truy vấn nên nằm trong một transaction |

## Tóm tắt bài 1

- Mục tiêu của khoá là đưa bạn từ **tầng 2 (kinh nghiệm)** lên **tầng 3 (cơ chế)** — tức đổi đơn vị suy nghĩ từ *dòng* sang *page* và *lần chạm ổ đĩa*.
- Công cụ suy luận mang theo suốt khoá là câu hỏi **"vì sao công nghệ này tồn tại?"** — biết cơn đau thì tự suy ra được cách dùng và giới hạn.
- "Database quan hệ không scale" là quan niệm sai: có **mười nấc thang** để leo, và phần lớn hệ thống chết ở nấc thứ hai vì tưởng chỉ còn mỗi sharding.
- Bảy câu hỏi ở đầu bài là bài kiểm tra đầu vào; mỗi câu ứng với một phase.
- Nhiều câu trả lời sẽ là *"còn tuỳ"* — vì thứ cần học là **bộ tiêu chí đánh đổi**, không phải danh sách kết luận thuộc lòng.

**Bài kế tiếp** → [Bài 2: Lộ trình học Database Engineering](02-lo-trinh-hoc-database.md)
