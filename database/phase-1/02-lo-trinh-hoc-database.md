# Bài 2: Lộ trình học Database Engineering

Mười tám phase là nhiều. Nếu đọc tuần tự từ đầu đến cuối, bạn sẽ mất động lực ở khoảng phase 7 — không phải vì khó, mà vì chưa thấy chúng nối vào nhau chỗ nào.

Bài này là **bản đồ**. Nó chỉ ra phase nào là nền móng, phase nào là nhánh phụ có thể bỏ qua, và ba lộ trình khác nhau tuỳ theo bạn đang cần gì.

## Cây phụ thuộc: cái gì phải học trước cái gì

```text
                        ┌──────────────────────────┐
                        │  PHASE 3 — LƯU TRỮ       │  ← RỄ CÂY
                        │  Page · Heap · I/O       │    Học sai chỗ này
                        │  Row vs Column           │    thì mọi phase sau
                        │  Primary vs Secondary key│    đều hiểu lệch
                        └────────────┬─────────────┘
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
    ┌──────────────────┐  ┌────────────────────┐  ┌──────────────────┐
    │ PHASE 4 — INDEX  │  │ PHASE 2 — ACID     │  │ PHASE 11 — ENGINE│
    │ Index scan       │  │ Transaction        │  │ InnoDB vs MyISAM │
    │ Covering index   │  │ Isolation          │  │ LSM vs B-Tree    │
    │ Optimizer        │  │ Read phenomena     │  │                  │
    └────────┬─────────┘  └─────────┬──────────┘  └──────────────────┘
             ▼                      ▼
    ┌──────────────────┐  ┌────────────────────┐
    │ PHASE 5 — B-TREE │  │ PHASE 8 — LOCK     │
    │ B-Tree → B+Tree  │  │ Shared/Exclusive   │
    │ Chi phí lưu trữ  │  │ Deadlock · 2PL     │
    └──────────────────┘  │ Double booking     │
                          │ Connection pooling │
                          └─────────┬──────────┘
                                    ▼
    ┌───────────────────────────────────────────────────────┐
    │  PHASE 6 PARTITION → PHASE 7 SHARDING → PHASE 9 REPL. │
    │  (chia trong máy)     (chia ra máy)      (nhân bản)   │
    └───────────────────────────┬───────────────────────────┘
                                ▼
                    ┌────────────────────────┐
                    │ PHASE 10 SYSTEM DESIGN │  ← ráp tất cả lại
                    └────────────────────────┘

    NHÁNH PHỤ (đọc lúc nào cũng được, không ai phụ thuộc):
      phase-12 Cursor   ·  phase-13 NoSQL  ·  phase-14 Bảo mật
      phase-15 Homomorphic encryption      ·  phase-16/17/18 Hỏi đáp & thảo luận
```

Ba điều đọc ra từ hình này:

1. **Phase 3 là rễ**, không phải phase 2. Dù ACID được đánh số trước, nếu chưa biết page và heap là gì thì đọc về durability sẽ chỉ là học thuộc chữ. Ai muốn học nhanh nhất nên đọc **phase 3 trước phase 2**.
2. **Phase 4 và phase 2 là hai nhánh song song** — không nhánh nào cần nhánh kia. Chọn nhánh nào trước là tuỳ mục tiêu của bạn.
3. **Sáu phase cuối là nhánh phụ.** Không ai phụ thuộc chúng, nên bỏ qua tạm cũng không gãy mạch.

## Toàn cảnh 18 phase trong một bảng

| Phase | Chủ đề | Câu hỏi cốt lõi | Độ nặng | Bắt buộc? |
|---|---|---|---|---|
| 1 | Giới thiệu, từ điển | Thuật ngữ nghĩa là gì | Nhẹ | Nên |
| 2 | ACID | Điều gì đảm bảo dữ liệu không sai khi có sự cố | Vừa | **Bắt buộc** |
| 3 | Lưu trữ: page, heap, I/O | Dòng dữ liệu nằm ở đâu, đọc nó tốn gì | Vừa | **Bắt buộc — học đầu tiên** |
| 4 | Indexing | Khi nào index giúp, khi nào không | Nặng | **Bắt buộc** |
| 5 | B-Tree / B+Tree | Cấu trúc nào cho phép tìm nhanh trong hàng trăm triệu dòng | Vừa | Nên |
| 6 | Partitioning | Chia bảng trong một máy được gì | Vừa | Nên |
| 7 | Sharding | Chia ra nhiều máy mất gì | Nặng | Nên |
| 8 | Concurrency control | Ai chờ ai khi cùng ghi một dòng | Nặng | **Bắt buộc** |
| 9 | Replication | Nhân bản thế nào, vì sao luôn trễ | Vừa | Nên |
| 10 | System design | Ráp tất cả cho bài toán thật | Vừa | Nên |
| 11 | Database engines | Vì sao cùng SQL mà hành vi khác nhau | Nặng | Tuỳ |
| 12 | Cursor | Xử lý 100 triệu dòng không nổ RAM | Vừa | Tuỳ |
| 13 | NoSQL | Khi nào mô hình quan hệ không hợp | Vừa | Tuỳ |
| 14 | Bảo mật | Kết nối bị nghe lén ở đâu, phân quyền sao | Vừa | Tuỳ |
| 15 | Homomorphic encryption | Truy vấn trên dữ liệu đã mã hoá | Nhẹ | Tuỳ |
| 16 | Hỏi đáp | Câu hỏi thực chiến rời rạc | Vừa | Nên |
| 17 | Thảo luận sâu | WAL, UUID, write amplification, InnoDB locking | Nặng | Nên |
| 18 | Ôn tập ACID | Chi tiết triển khai | Nhẹ | Tuỳ |

## Ba lộ trình theo mục tiêu

### Lộ trình A — "Hệ thống của tôi đang chậm, cần chữa ngay"

Đây là lộ trình gấp. Mục tiêu là tìm ra thủ phạm trong vòng vài ngày.

```text
   Ngày 1  ├─ phase-3 bài 1 (Page, Heap, I/O)
           │    → đổi đơn vị suy nghĩ sang "số page phải đọc"
           │
   Ngày 2  ├─ phase-4 bài 1, 2 (Indexing cơ bản, Index-only scan)
           │    → biết đọc EXPLAIN, biết index nào đang bị bỏ qua
           │
   Ngày 3  ├─ phase-4 bài 3 (Composite index và Optimizer)
           │    → hiểu vì sao index có mà không được dùng
           │
   Ngày 4  ├─ phase-8 bài 3 (Connection pooling)
           │    → loại trừ khả năng nút cổ chai nằm ở kết nối chứ không ở query
           │
   Ngày 5  └─ phase-8 bài 2 (Double booking và Pagination)
                → nếu chậm ở trang danh sách, thủ phạm hay là OFFSET
```

Thứ tự này không ngẫu nhiên. Nó đi theo **tần suất thủ phạm thật** trong các hệ thống thực tế: thiếu index → query viết sai → cạn connection → phân trang bằng OFFSET → tranh chấp khoá.

### Lộ trình B — "Chuẩn bị phỏng vấn"

Phỏng vấn database hỏi theo bốn tầng: định nghĩa → con số → đánh đổi → quy trình. Lộ trình này bám theo các chủ đề bị hỏi nhiều nhất.

```text
   Tuần 1 │ phase-2 toàn bộ (ACID)
          │   Hỏi chắc chắn: "Isolation level nào chống được phenomenon nào?"
          │   Hỏi vặn: "Postgres REPEATABLE READ khác MySQL chỗ nào?"
          │
   Tuần 2 │ phase-3 + phase-4 + phase-5
          │   Hỏi chắc chắn: "Index hoạt động thế nào?"
          │   Hỏi vặn: "Vì sao B+Tree chứ không phải B-Tree?"
          │            "Index (a,b) có dùng được cho WHERE b=? không?"
          │
   Tuần 3 │ phase-8 (lock, deadlock) + phase-6/7 (partition vs shard)
          │   Hỏi chắc chắn: "Deadlock là gì, xử lý sao?"
          │   Hỏi vặn: "Partitioning khác sharding chỗ nào?" — câu này
          │            loại rất nhiều ứng viên vì hai từ nghe giống nhau.
          │
   Tuần 4 │ phase-9 (replication) + phase-10 (system design)
          │   Hỏi chắc chắn: "Sync và async replication khác gì?"
          │   Hỏi vặn: "Người dùng lưu xong đọc lại không thấy, vì sao?"
```

Bổ trợ: khoá [sql-interview](../../sql-interview/README.md) tập trung vào *viết* SQL, khoá [database-su-co-va-phong-van](../../database-su-co-va-phong-van/README.md) tập trung vào *câu hỏi sự cố*. Ba khoá ghép lại là phủ gần hết phạm vi phỏng vấn database.

### Lộ trình C — "Học nền tảng dài hạn, không gấp"

Đọc tuần tự, nhưng **đảo hai phase đầu**: phase 3 trước, rồi phase 2, rồi tiếp tục 4 → 5 → 6 → 7 → 8 → 9 → 10, sau đó tuỳ hứng với các nhánh phụ.

Lý do đảo: phase 2 nói về durability (dữ liệu xuống đĩa an toàn), mà "xuống đĩa" chỉ có nghĩa khi đã biết đĩa chứa gì và chứa thế nào — tức là phải học phase 3 trước.

## Sáu cột mốc tự kiểm tra

Học internals dễ rơi vào ảo giác "đọc thấy hiểu rồi". Sáu câu hỏi dưới đây là bài kiểm tra thật. Tự trả lời **thành lời, không nhìn tài liệu** — nếu ấp úng thì quay lại đọc.

| Sau phase | Tự kiểm tra bằng câu hỏi | Trả lời được nghĩa là |
|---|---|---|
| 3 | "Bảng 1 triệu dòng, mỗi dòng 100 byte, quét toàn bảng phải đọc bao nhiêu page?" | Đã đổi được đơn vị suy nghĩ sang page |
| 2 | "`COMMIT` xong mà máy mất điện ngay lúc đó, dữ liệu còn không? Nhờ cái gì?" | Đã hiểu WAL và fsync, không chỉ thuộc chữ D |
| 4 | "Bảng có index trên `status`, `WHERE status='active'` khớp 80% số dòng — optimizer dùng index không? Vì sao?" | Đã hiểu selectivity, không còn tin "có index là dùng index" |
| 5 | "Vì sao mọi database dùng B+Tree mà không dùng B-Tree?" | Đã hiểu vai trò của danh sách liên kết ở tầng lá |
| 8 | "Hai transaction cùng `UPDATE` một dòng — cái thứ hai xảy ra chuyện gì?" | Đã hiểu khoá dòng và hàng đợi chờ |
| 9 | "Vì sao replica luôn trễ, kể cả khi mạng nhanh?" | Đã hiểu bản chất bất đồng bộ, không đổ lỗi cho mạng |

## Cách thực hành: dựng sân tập trong 5 phút

Đọc mà không gõ thì kiến thức bay rất nhanh. Đây là cách dựng môi trường tối thiểu để chạy mọi ví dụ trong khoá:

```bash
docker run --name db-lab \
  -e POSTGRES_PASSWORD=lab \
  -p 5432:5432 \
  -d postgres:16

docker exec -it db-lab psql -U postgres
```

Tạo một bảng đủ lớn để mọi hiệu ứng hiện ra. Bảng dưới 10.000 dòng thì database nhét hết vào RAM, mọi thứ đều nhanh, và bạn sẽ **không quan sát được gì cả** — đây là lỗi phổ biến nhất khi tự thực hành:

```sql
CREATE TABLE grades (
    id      SERIAL PRIMARY KEY,
    g       INT,
    name    TEXT
);

INSERT INTO grades (g, name)
SELECT (random() * 100)::INT,
       substr(md5(random()::TEXT), 1, 10)
FROM generate_series(1, 1000000);

ANALYZE grades;
```

```text
INSERT 0 1000000
Time: 4218.334 ms          ← khoảng 4 giây trên máy thường
```

Kiểm tra ngay xem bảng chiếm bao nhiêu đĩa và bao nhiêu page — đây là hai con số cần làm quen:

```sql
SELECT pg_size_pretty(pg_relation_size('grades')) AS kich_thuoc,
       pg_relation_size('grades') / 8192          AS so_page;
```

```text
 kich_thuoc | so_page
------------+---------
 65 MB      |    8334
```

Đọc con số này thành lời: *"Quét toàn bảng nghĩa là đọc 8.334 page. Nếu chúng nằm sẵn trong RAM thì khoảng 8 mili-giây; nếu phải xuống SSD thì khoảng 800 mili-giây."* Suy nghĩ được như vậy là bạn đã đứng ở tầng 3.

Ba lệnh nên thuộc nằm lòng, dùng suốt khoá:

```sql
EXPLAIN SELECT ...;              -- xem kế hoạch, KHÔNG chạy thật
EXPLAIN ANALYZE SELECT ...;      -- chạy thật, báo cả kế hoạch lẫn thời gian
EXPLAIN (ANALYZE, BUFFERS) ...;  -- thêm số page đọc từ cache và từ đĩa
```

`BUFFERS` là tuỳ chọn bị bỏ quên nhiều nhất, dù nó cho biết chính xác **đọc bao nhiêu page, bao nhiêu cái trúng cache** — tức là đúng con số quyết định query nhanh hay chậm.

## Ba sai lầm khi tự học internals

### Sai lầm 1 — Thử nghiệm trên bảng quá nhỏ

```text
   Bảng 1.000 dòng:                    Bảng 1.000.000 dòng:
     Seq Scan    : 0,3 ms                Seq Scan    : 180 ms
     Index Scan  : 0,3 ms                Index Scan  : 0,8 ms
     → "index chẳng giúp gì!"            → chênh 225 lần
```

Với bảng nhỏ, toàn bộ dữ liệu nằm trong RAM và mọi phương án đều nhanh như nhau. Muốn thấy hiệu ứng thật thì cần **tối thiểu một triệu dòng**.

### Sai lầm 2 — Đo một lần rồi kết luận

Lần chạy đầu tiên phải nạp page từ đĩa lên (cache lạnh); lần thứ hai đã có sẵn trong buffer pool (cache nóng). Chênh nhau chục lần là bình thường.

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM grades WHERE g = 50;
```

```text
Lần 1:  Buffers: shared hit=12 read=8320     ← read = đọc từ đĩa
        Execution Time: 412.883 ms

Lần 2:  Buffers: shared hit=8332 read=0      ← đã nóng, không chạm đĩa
        Execution Time: 91.204 ms
```

Quy tắc: **chạy ba lần, lấy lần ổn định**, và luôn nhìn dòng `Buffers` chứ không chỉ nhìn thời gian.

### Sai lầm 3 — Học thuộc kết luận thay vì học cơ chế

"REPEATABLE READ chống được non-repeatable read nhưng không chống phantom read" là một câu đúng — trong sách. Nhưng PostgreSQL **chống luôn cả phantom read** ở mức đó, vì nó hiện thực REPEATABLE READ bằng snapshot.

Ai thuộc bảng sẽ trả lời sai khi được hỏi cụ thể về PostgreSQL. Ai hiểu cơ chế (snapshot so với khoá dòng) thì tự suy ra được. Đây chính xác là lý do khoá này luôn giải thích *cách nó hoạt động* trước khi đưa ra *bảng kết luận*.

## Kiến thức này nối với các khoá khác thế nào

| Khoá | Quan hệ với khoá này |
|---|---|
| [sql-interview](../../sql-interview/README.md) | Tầng trên: **viết** SQL cho đúng và nhanh. Khoá này là tầng dưới: SQL đó chạy ra sao. |
| [database-su-co-va-phong-van](../../database-su-co-va-phong-van/README.md) | Cùng tầng, khác góc: đi từ **sự cố thật** ngược về nguyên nhân. |
| [orm-n-plus-1](../../orm-n-plus-1/README.md) | Áp dụng: vì sao ORM sinh ra N+1 và mỗi query thừa tốn đúng bao nhiêu page. |
| [backend-scaling-cases](../../backend-scaling-cases/README.md) | Áp dụng ở tầng hệ thống: pool size, khoá, hàng đợi. |
| [redis](../../redis/README.md) | Đối chiếu: một hệ lưu trữ **trong RAM** đánh đổi khác hẳn với hệ lưu trên đĩa. |

## Tóm tắt bài 2

- **Phase 3 (page, heap, I/O) là rễ cây**, không phải phase 2 — ai muốn học nhanh nhất nên bắt đầu từ đó.
- Sáu phase cuối là **nhánh phụ**, bỏ qua tạm không gãy mạch kiến thức.
- Ba lộ trình theo mục tiêu: **chữa hệ thống chậm** (5 ngày), **luyện phỏng vấn** (4 tuần), **học nền tảng** (tuần tự, đảo phase 3 lên trước).
- Sáu cột mốc tự kiểm tra giúp phân biệt "đọc thấy hiểu" với "hiểu thật".
- Thực hành phải trên bảng **tối thiểu một triệu dòng**, chạy **ba lần lấy lần ổn định**, và luôn xem `EXPLAIN (ANALYZE, BUFFERS)` chứ không chỉ xem thời gian.
- Học **cơ chế** rồi mới học bảng kết luận — vì bảng kết luận sai ngay khi đổi hệ quản trị.

**Bài kế tiếp** → [Phase 2 — Bài 1: ACID và Transaction là gì](../phase-2/01-acid-va-transaction.md)
