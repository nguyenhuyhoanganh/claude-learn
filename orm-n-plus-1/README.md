# Series: N+1, ORM, và cách các công ty thật sự truy cập dữ liệu

> *"Bạn viết đúng ba dòng code. Code review thông qua. Test xanh. Và nó chạy 201 câu truy vấn."*

Đây là khoá về **một lỗi duy nhất** — nhưng là lỗi hiệu năng phổ biến nhất trong lập trình backend, và là cánh cửa dẫn tới câu hỏi lớn hơn nhiều: **trong production người ta có nên dùng ORM không, và nếu không thì dùng gì.**

Khoá này trả lời thẳng cả hai câu, bằng code chạy được và số liệu đo được.

## Khoá này khác gì các bài viết về N+1 khác

Hầu hết tài liệu về N+1 dừng ở *"dùng `JOIN FETCH` là xong"*. Đó là chỗ vấn đề **bắt đầu**, không phải chỗ nó kết thúc — vì `JOIN FETCH` gây nhân dòng, vỡ phân trang, và làm ứng dụng không khởi động được khi bạn thêm collection thứ hai.

**Mỗi bài trong khoá đều có:**

- **Giải nghĩa mọi thuật ngữ** tiếng Anh kèm phiên âm và nghĩa tiếng Việt — không giả định bạn đã biết gì.
- **Kiến trúc và cách hoạt động** — sơ đồ ASCII vẽ luồng từng bước, để hiểu *vì sao* chứ không học vẹt.
- **Con số thật**: byte qua mạng, mili giây, MB heap, `EXPLAIN ANALYZE` kèm output.
- **Tình huống thực tế và cách xử lý** — sự cố có thật, lệnh chẩn đoán, code sửa, và **cách chặn tái diễn**.
- Bảng so sánh, bảng bẫy thường gặp, câu hỏi phỏng vấn kèm **bản mẫu trả lời giọng ứng viên**.

## Mục lục

### Phần I — Hiểu vấn đề

| Bài | Nội dung |
|---|---|
| [01](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) | **N+1 là gì và vì sao nó giết hiệu năng** — lazy loading là thủ phạm, ví dụ Author/Book, 20 tác giả → 21 query, vì sao vấn đề **không nằm ở database** mà ở RTT mạng, `@ManyToOne` mặc định `EAGER` gây N+1 **không cần vòng lặp**, bốn biến thể khó thấy |

### Phần II — Chữa bằng chính ORM, và cái giá phải trả

| Bài | Nội dung |
|---|---|
| [02](02-bon-cach-khac-phuc-bang-chinh-orm.md) | **Bốn cách khắc phục bằng ORM** — `JOIN FETCH` vs `JOIN` (lỗi tệ nhất), `DISTINCT` lọc ở tầng Java chứ không phải SQL, `@EntityGraph` và `EntityGraphType.FETCH`, `@BatchSize` + `default_batch_fetch_size`, query tay + `Map`, bảng so sánh số query |
| [03](03-cai-gia-cua-tung-cach.md) | **Cái giá của từng cách** — nhân dòng lãng phí tới **27×**, tích Descartes `m × n` không phải `m + n`, vì sao `MultipleBagFetchException` là **ân huệ**, `HHH90003004` kéo cả bảng về RAM → OOM, `@BatchSize` là **tối ưu vô hình**, cây quyết định chọn cách |

### Phần III — Cách các công ty thật sự làm

| Bài | Nội dung |
|---|---|
| [04](04-su-that-ve-orm-trong-production.md) | **Sự thật về ORM trong production** — mổ xẻ câu *"ORM không được ưa chuộng"*: đúng ở đâu, sai ở đâu; phổ 5 mức từ JDBC tới Active Record; **bức tranh từng hệ sinh thái** (Java, Go, Rust, Node, Python, Ruby, .NET, PHP); sáu thứ ORM làm mà SQL tay không; bảng quyết định theo bối cảnh |
| [05](05-khong-dung-orm-thi-dung-gi.md) | **Không dùng ORM thì dùng gì** — `JdbcClient`, **jOOQ** (+ `MULTISET`), **MyBatis** (và N+1 của chính nó), **Spring Data JDBC**, DTO projection giảm **11× RAM**; pattern *query chính → `SELECT IN` → map lại*; **`IN` có dùng index không** kèm `EXPLAIN` thật; cùng pattern ở Go/`.NET`/Node |
| [06](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) | **Kiến trúc thực tế và lộ trình chuyển đổi** — CQRS-lite: một database, hai đường đi; cấu trúc package `command/` vs `query/`; `@Transactional(readOnly=true)` làm 4 việc thật; **ArchUnit làm fitness function**; **Strangler Fig** — chuyển đổi không cần dừng phát triển; trình bày với quản lý bằng tiền |

### Phần IV — N+1 ngoài database, và cách chặn vĩnh viễn

| Bài | Nội dung |
|---|---|
| [07](07-n-cong-1-khong-chi-o-database.md) | **N+1 không chỉ ở database** — qua mạng tệ hơn **20–100 lần**, khuếch đại độ trễ đuôi (p99 của họ thành p60 của bạn), sập dây chuyền; **bulk endpoint** và 4 quy tắc thiết kế; **DataLoader** và 2 luật sống còn; vì sao GraphQL dính N+1 mặc định; 4 lớp bảo vệ GraphQL |
| [08](08-phat-hien-n-cong-1.md) | **Phát hiện N+1** — vì sao `show-sql` **không đủ**; Hibernate Statistics; **test đếm query** (`@AssertMaxQueries`); datasource-proxy/p6spy; **tắt `open-in-view`**; đọc `pg_stat_statements` đúng cách; **vì sao code AI sinh hay dính N+1**; danh sách kiểm tra dán vào dự án |

### Phần V — Bảy bài toán production làm end-to-end

Bảy bài trước dùng ví dụ Author/Book cho gọn. Hai bài này làm trên **nghiệp vụ thật**, đủ SQL, `EXPLAIN`, và con số đo được.

| Bài | Nội dung |
|---|---|
| [09](09-bon-bai-toan-doc-kinh-dien.md) | **Bốn bài toán đọc** — ① danh sách có **filter động + sort + phân trang sâu** (`OFFSET` chậm gấp **700 lần**, keyset pagination, `ORDER BY` thiếu mốc phá hoà gây **trùng/mất dòng**); ② **feed + trạng thái người xem** ("đã thích chưa" — N+1 tường minh mà ArchUnit không bắt được, `IN` vs `EXISTS`); ③ **badge/đếm số** (`COUNT` luôn phải quét, counter cache, Redis, materialized view); ④ **export triệu dòng** (5,4 GB heap, và bẫy cursor PostgreSQL cần đủ `autoCommit=false` + `fetchSize`) |
| [10](10-ba-bai-toan-ghi-va-van-hanh.md) | **Ba bài toán ghi và vận hành** — ⑤ **batch job hàng đêm** (dirty checking **O(n²)**, `flush`/`clear` đúng thứ tự, và **`IDENTITY` vô hiệu hoá batch insert** khiến chậm **52 lần**); ⑥ **consumer Kafka** (N+1 nhân với lưu lượng, batch listener giảm **500 lần**, pod > partition thì ngồi không); ⑦ **read replica + replication lag** (read-after-write — cái giá thật của định tuyến `readOnly` ở bài 6) |

## Ba cách dùng khoá này

**① Đang có sự cố hiệu năng, cần sửa ngay.**
Đọc [Bài 8](08-phat-hien-n-cong-1.md) để xác nhận đúng là N+1, rồi [Bài 2](02-bon-cach-khac-phuc-bang-chinh-orm.md) chọn cách chữa, rồi **bắt buộc đọc [Bài 3](03-cai-gia-cua-tung-cach.md)** trước khi áp dụng rộng — vì cách chữa sai còn tệ hơn bệnh.

**② Đang phân vân "có nên bỏ ORM không".**
Vào thẳng [Bài 4](04-su-that-ve-orm-trong-production.md) → [Bài 5](05-khong-dung-orm-thi-dung-gi.md) → [Bài 6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md). Ba bài này là phần trọng tâm của khoá.

**③ Chuẩn bị phỏng vấn.**
Đọc tuần tự 1 → 10. Mỗi bài có mục **Câu hỏi phỏng vấn hay gặp** với đáp án mẫu viết theo giọng ứng viên, dùng được nguyên văn.

**④ Đang phải làm một màn hình/job cụ thể.**
Vào thẳng [Bài 9](09-bon-bai-toan-doc-kinh-dien.md) (danh sách có lọc, feed, badge, export) hoặc [Bài 10](10-ba-bai-toan-ghi-va-van-hanh.md) (batch job, consumer Kafka, read replica) — mỗi bài toán là một mục độc lập, đọc riêng được.

## Ba câu trả lời ngắn gọn cho ba câu hỏi lớn

> **"Production có nên dùng ORM không?"**
> **Có** — nhưng gần như không ai dùng nó cho mọi thứ. Mô hình phổ biến nhất ở các đội có quy mô là **ORM cho tầng ghi, SQL cho tầng đọc**. Lý do rất logic: mọi lợi ích lớn của ORM (dirty checking, `@Version`, cascade, Unit of Work) đều nằm ở **tầng ghi**, còn mọi vấn đề hiệu năng — kể cả N+1 — đều nằm ở **tầng đọc**. → [Bài 4](04-su-that-ve-orm-trong-production.md)

> **"Nghe nói ORM không được ưa chuộng, đúng không?"**
> **Đúng ở Go và Rust** (viết SQL tay là mặc định văn hoá), **nửa đúng ở Node và .NET**, và **sai ở Java, Python, Ruby, PHP** — Instagram chạy Django ORM, Shopify và GitHub chạy Active Record. Nghe câu đó mà không hỏi *"trong hệ sinh thái nào"* là nghe một nửa sự thật. → [Bài 4](04-su-that-ve-orm-trong-production.md)

> **"Bỏ ORM thì hết N+1 chứ?"**
> **Không.** N+1 là lỗi của **mẫu truy cập dữ liệu**, không phải lỗi của ORM — MyBatis cũng có N+1, và viết vòng lặp gọi DAO bằng JDBC thuần thì vẫn N+1 y hệt. Khác biệt là **mức độ nhìn thấy**: với ORM nó xảy ra khi bạn *không viết gì*, với SQL tay nó chỉ xảy ra khi bạn *cố tình viết vòng lặp*. → [Bài 5](05-khong-dung-orm-thi-dung-gi.md)

## Ba dòng cấu hình nên bật ngay hôm nay

```properties
spring.jpa.properties.hibernate.default_batch_fetch_size=25   # lưới an toàn: 201 query → 9
spring.jpa.open-in-view=false                                  # biến N+1 im lặng thành lỗi ồn ào
spring.jpa.properties.hibernate.generate_statistics=true       # đếm query thay vì in query
```

Ba dòng này thường giảm 30–60% thời gian database **mà không sửa một dòng code nào**. Chi tiết ở [Bài 6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) và [Bài 8](08-phat-hien-n-cong-1.md).

## Liên hệ với các khoá khác

- **N+1 ở mức tổng quát** (Django/Rails/Node, không đi sâu Hibernate): [SQL — Phase 7 Bài 5](../sql-interview/phase-7/05-van-de-n-cong-1-query-va-orm.md)
- **Index, execution plan, transaction, sharding, replica**: [series SQL](../sql-interview/README.md)
- **REST/GraphQL/gRPC và overfetching**: [Backend — Phase 1 Bài 4](../backend-interview/phase-1/04-rest-graphql-grpc-chon-kieu-nao.md)
- **Caching, connection pool, rate limiting**: [series Backend & System Design](../backend-interview/README.md)

Gặp thuật ngữ lạ → tra [Từ điển thuật ngữ](TU-DIEN-THUAT-NGU.md).

---

**Bắt đầu** → [Bài 1: N+1 là gì và vì sao nó giết hiệu năng](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md)
