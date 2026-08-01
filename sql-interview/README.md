# Series: Phá đảo vòng phỏng vấn SQL

> "8/10 ứng viên data bị loại ngay tại vòng SQL. Không phải vì họ kém, mà vì trượt đúng vài câu hỏi kinh điển."

Series này bắt đầu từ ba câu hỏi kinh điển nhất (JOIN, GROUP BY/HAVING, window function), rồi đi tiếp tới những thứ mà người phỏng vấn **thật sự** dùng để phân loại ứng viên: subquery, CTE, đọc execution plan, tối ưu query, thiết kế kiểu dữ liệu, an toàn dữ liệu, database trong hệ thống thật (replica, sharding, hàng đợi), và các case thực chiến bạn sẽ gặp mỗi ngày khi đi làm.

Phần cuối series (phase 9) dạy thứ ít tài liệu nào nói: **cách trả lời**. Vì đa số câu hỏi phỏng vấn là một cái thang bốn bậc, và đáp án đúng ở bậc một vẫn khiến bạn trượt.

Mỗi bài đều có: giải thích **từng câu lệnh làm gì**, dữ liệu mẫu chạy được, ASCII diagram, bảng so sánh, bẫy thường gặp, câu hỏi phỏng vấn kèm đáp án mẫu, và use case production.

## Cách dùng series

1. **Mới học SQL?** Bắt đầu từ [Bài 0](phase-1/00-tu-dien-tu-khoa-sql-cho-nguoi-moi.md) — giải thích từng từ khoá SQL làm gì, kèm bẫy của người mới.
2. Dựng schema mẫu ở [Bài 1 phase-1](phase-1/01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md) — **mọi query trong series đều chạy được trên schema này**.
3. Đọc tuần tự phase-1 → phase-4. Mỗi bài kết thúc bằng link "Bài kế tiếp".
4. Gặp thuật ngữ lạ → tra [Từ điển thuật ngữ](TU-DIEN-THUAT-NGU.md), đừng bỏ qua.
5. Gõ lại query, đừng chỉ đọc. SQL là kỹ năng vận động, không phải kiến thức.

Dialect chính: **PostgreSQL 14+**. Chỗ nào MySQL 8 khác biệt đều có ghi chú riêng.

> **[Từ điển thuật ngữ](TU-DIEN-THUAT-NGU.md)** — hơn 200 thuật ngữ dùng trong series (anti-join, fanout, SARGable, MVCC, cohort, idempotency, page split, partition pruning, shard key, LSN, crypto-shredding...), mỗi từ kèm nghĩa tiếng Việt và lý do cần biết. Tra bất cứ lúc nào gặp từ chưa quen.

## Mục lục

### Phase 1 — Ba câu hỏi kinh điển (và phần đào sâu người phỏng vấn thật sự muốn nghe)

| Bài | Nội dung |
|---|---|
| [00](phase-1/00-tu-dien-tu-khoa-sql-cho-nguoi-moi.md) | **Cho người mới**: từng từ khoá SQL làm gì, toán tử, kiểu dữ liệu, cách đọc một câu SQL lạ, 10 lỗi fresher hay gặp |
| [00b](phase-1/00b-mo-hinh-quan-he-khoa-chinh-khoa-ngoai-va-erd.md) | **Nền móng**: khoá chính, khoá ngoại, vì sao phải tách bảng, quan hệ 1-nhiều và nhiều-nhiều, bảng trung gian, đọc sơ đồ ERD bằng ký hiệu chân chim |
| [01](phase-1/01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md) | Vì sao ứng viên trượt vòng SQL; 4 tầng câu hỏi; query optimizer; thứ tự xử lý logic của SQL; schema mẫu |
| [02](phase-1/02-join-inner-vs-left-va-bai-toan-khach-chua-mua.md) | JOIN toàn tập: INNER/LEFT/RIGHT/FULL/CROSS; bài toán "khách chưa từng đặt hàng" và 3 cách giải |
| [03](phase-1/03-join-nang-cao-fanout-on-vs-where-va-thuat-toan-join.md) | Bẫy ON vs WHERE, nhân dòng (fanout) làm sai doanh thu, self join, thuật toán join |
| [04](phase-1/04-group-by-having-va-nghe-thuat-aggregate.md) | GROUP BY, HAVING vs WHERE, COUNT(*) vs COUNT(col), conditional aggregation, ROLLUP |
| [05](phase-1/05-window-function-tu-a-den-z.md) | Window function: RANK/DENSE_RANK/ROW_NUMBER, top N mỗi nhóm, frame, LAG/LEAD, running total |
| [06](phase-1/06-case-when-va-nghe-thuat-dan-nhan-du-lieu.md) | `CASE WHEN`: bẫy sai thứ tự điều kiện, quên `ELSE` nguy hiểm hơn quên `END`, dùng trong `ORDER BY`/`UPDATE`/pivot, ngưỡng nằm cứng vs bảng quy chế |

### Phase 2 — Subquery, CTE và tư duy tập hợp

| Bài | Nội dung |
|---|---|
| [01](phase-2/01-subquery-toan-tap.md) | Scalar/row/table subquery, correlated vs uncorrelated, IN vs EXISTS vs JOIN, bẫy NOT IN + NULL |
| [02](phase-2/02-cte-va-recursive-cte.md) | CTE, chuỗi CTE, recursive CTE (cây tổ chức, chuỗi ngày, đồ thị), CTE vs subquery vs temp table |
| [03](phase-2/03-union-intersect-except-va-logic-3-tri.md) | UNION/UNION ALL/INTERSECT/EXCEPT, logic ba trị của NULL, COALESCE/NULLIF |

### Phase 3 — Tối ưu SQL: phần tách senior khỏi junior

| Bài | Nội dung |
|---|---|
| [01](phase-3/01-index-hoat-dong-the-nao-va-viet-query-dung-index.md) | B+Tree, composite index, leftmost prefix, covering index, viết điều kiện SARGable |
| [02](phase-3/02-doc-hieu-execution-plan.md) | EXPLAIN / EXPLAIN ANALYZE, các node scan & join, estimate lệch, statistics |
| [03](phase-3/03-muoi-lam-anti-pattern-lam-cham-query.md) | 15 anti-pattern kinh điển và cách sửa từng cái |
| [04](phase-3/04-phan-trang-va-xu-ly-bang-lon.md) | OFFSET vs keyset pagination, COUNT bảng lớn, batch update/delete, backfill an toàn |

### Phase 4 — Case thực chiến và bộ câu hỏi tổng hợp

| Bài | Nội dung |
|---|---|
| [01](phase-4/01-case-bao-cao-doanh-thu-cohort-va-retention.md) | Báo cáo doanh thu, tăng trưởng MoM, cohort retention, funnel, gaps & islands |
| [02](phase-4/02-case-du-lieu-trung-lap-dedup-va-upsert.md) | Tìm & xoá bản ghi trùng, UPSERT, idempotency, SCD type 2 |
| [03](phase-4/03-transaction-isolation-va-khoa-trong-phong-van.md) | ACID, isolation level, lost update, double booking, deadlock |
| [04](phase-4/04-bo-cau-hoi-phong-van-sql-kem-dap-an.md) | 60+ câu hỏi phỏng vấn theo cấp độ intern → senior, kèm đáp án mẫu |
| [05](phase-4/05-checklist-on-tap-truoc-buoi-phong-van.md) | Checklist ôn 30 phút, cách trình bày lời giải, sai lầm khi trả lời |

### Phase 5 — Kiểu dữ liệu và thiết kế bảng: nơi bug sống ba năm mới nổ

| Bài | Nội dung |
|---|---|
| [01](phase-5/01-tien-trong-database-float-hay-decimal.md) | Tiền: vì sao `FLOAT` giết hệ thống, `NUMERIC` vs số nguyên minor unit, làm tròn, ép kiểu ở tầng app, di trú cột |
| [02](phase-5/02-so-nguyen-va-cai-tran-tran-so.md) | Tràn số: trần `SMALLINT`/`INT`/`BIGINT`, giám sát % trần, di trú `BIGINT` không downtime, trần 2⁵³ của JavaScript |
| [03](phase-5/03-chuoi-varchar-text-va-do-dai-khoa-index.md) | `VARCHAR` vs `TEXT` vs `CHAR`, trần khoá index 767/3072 byte, collation, chuẩn hoá chuỗi bằng generated column |
| [04](phase-5/04-thoi-gian-utc-mui-gio-va-gom-nhom-theo-ngay.md) | `TIMESTAMPTZ` thật sự lưu gì, bẫy gom nhóm ngày trên UTC, lịch hẹn tương lai, DST, `now()` vs `clock_timestamp()` |
| [05](phase-5/05-khoa-chinh-auto-increment-uuid-v4-hay-v7.md) | Auto increment vs UUID v4 vs v7, page split, ngưỡng lật là RAM, ID hai lớp, surrogate vs natural key |
| [06](phase-5/06-rang-buoc-constraint-luat-nam-trong-du-lieu.md) | `NOT NULL`/`CHECK`/`UNIQUE`/`FK`/`EXCLUDE`, partial unique index, `NOT VALID` → `VALIDATE`, dịch lỗi cho người dùng |

### Phase 6 — Lệnh nguy hiểm và an toàn dữ liệu

| Bài | Nội dung |
|---|---|
| [01](phase-6/01-delete-truncate-drop-lenh-nao-khong-co-duong-quay-lai.md) | `DELETE` vs `TRUNCATE` vs `DROP`, DML/DDL, thủ phạm thật là autocommit, xoá bảng lớn an toàn, PITR |
| [02](phase-6/02-quen-where-thieu-on-va-quy-trinh-chay-lenh-tren-production.md) | Quên `WHERE`, thiếu `ON`, quy trình ba lớp, hai chỗ mẹo "SELECT trước" nói dối |
| [03](phase-6/03-soft-delete-hay-xoa-that.md) | Bốn tờ hoá đơn của soft delete, partial unique index, Nghị định 13 vs Luật Kế toán, ẩn danh hoá và crypto-shredding |
| [04](phase-6/04-sql-injection-va-luu-mat-khau-dung-cach.md) | Injection và prepared statement, ba chỗ nó không cứu được, quyền tối thiểu, muối + Argon2id, nâng cấp hash cũ |

### Phase 7 — Database trong hệ thống thật

| Bài | Nội dung |
|---|---|
| [01](phase-7/01-sql-vs-nosql-chon-dung-loai-database.md) | Bốn họ NoSQL, nơi đặt độ phức tạp, CAP/PACELC, Postgres hôm nay thay được gì, một nguồn sự thật |
| [02](phase-7/02-read-replica-va-do-tre-sao-chep.md) | Sáu chặng WAL, độ trễ là phân phối có đuôi dài, read-after-write, ghim LSN, `synchronous_commit` |
| [03](phase-7/03-partitioning-chia-bang-lon.md) | Partition pruning, `RANGE`/`LIST`/`HASH`, mất `UNIQUE` toàn cục, `DROP PARTITION`, khi nào KHÔNG nên partition |
| [04](phase-7/04-sharding-chia-mot-database-thanh-nhieu-may.md) | Bậc thang trước khi shard, chọn shard key, virtual shard, colocation, bốn cái giá, cách di trú của Figma |
| [05](phase-7/05-van-de-n-cong-1-query-va-orm.md) | N+1 và lazy loading, phát hiện tự động trong CI, năm cách chữa, căn bệnh ngược lại là overfetching |
| [06](phase-7/06-connection-pool-job-queue-va-transaction-dai.md) | Kết nối là tài nguyên đắt, `idle in transaction`, hàng đợi bằng `SKIP LOCKED`, idempotency, DLQ, outbox |

### Phase 8 — Case thực chiến bổ sung

| Bài | Nội dung |
|---|---|
| [01](phase-8/01-flash-sale-va-chong-ban-qua-hang.md) | Oversell ở quy mô 50k request, ghi nguyên tử vs khoá bi quan vs lạc quan, bộ đếm Redis, reservation, sharded counter |
| [02](phase-8/02-market-basket-va-gia-von-hang-ban-fifo.md) | Cặp sản phẩm mua chung bằng self join, support/confidence/lift, và COGS FIFO bằng khớp khoảng |
| [03](phase-8/03-dung-ai-viet-sql-ma-khong-bi-no-lua.md) | Bẫy fanout AI hay mắc, ba prompt chuẩn, checklist tám điểm kiểm chứng, tối ưu query bằng AI |
| [04](phase-8/04-case-dat-cho-trang-thai-giu-va-bay-cron-job.md) | Đặt vé xem phim: vì sao transaction **không** chống được tranh chấp, vé ma khi quên kiểm `rowcount`, trạng thái HOLD, **bẫy cron job**, đồng hồ database, deadlock nhiều ghế |

### Phase 9 — Nghệ thuật trả lời phỏng vấn

| Bài | Nội dung |
|---|---|
| [01](phase-9/01-mo-hinh-4-tang-cua-cau-hoi-phong-van.md) | Định nghĩa → con số → đánh đổi → quy trình; hỏi ngược khi thiếu dữ kiện; cách nói "em chưa đo" |
| [02](phase-9/02-muoi-hai-cau-hoi-ngan-va-dap-an-30-giay.md) | 12 câu hỏi ngắn nhất kèm bản mẫu 30 giây và bảng tra con số neo |

## Bắt đầu

- Mới học SQL → [Bài 0: Từ điển từ khoá SQL cho người mới](phase-1/00-tu-dien-tu-khoa-sql-cho-nguoi-moi.md)
- Đã viết SQL thành thạo → [Bài 1: Vì sao 8/10 ứng viên trượt vòng SQL](phase-1/01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md)
- Sắp đi phỏng vấn trong tuần này → [Phase 9 bài 2: 12 câu hỏi ngắn và đáp án 30 giây](phase-9/02-muoi-hai-cau-hoi-ngan-va-dap-an-30-giay.md)

## Khoá liên quan

> **[Phá đảo vòng phỏng vấn Backend & System Design](../backend-interview/README.md)** — phần backend nằm ngoài phạm vi SQL: API và idempotency, đồng bộ/bất đồng bộ, REST vs GraphQL vs gRPC, xác thực và phân quyền (Session/JWT/OAuth/OIDC), load balancer, API gateway, caching, job queue, Big O, thiết kế hệ thống, và các câu hỏi ngôn ngữ (OOP, con trỏ, Git). Hai khoá bổ sung cho nhau, không lặp lại.

> **[N+1, ORM, và cách các công ty thật sự truy cập dữ liệu](../orm-n-plus-1/README.md)** — khoá chuyên sâu 8 bài về lỗi hiệu năng phổ biến nhất của backend, và câu hỏi lớn phía sau nó: **production có nên dùng ORM không, hay dùng gì thay thế**. Đi sâu Java/Hibernate (`JOIN FETCH`, `@EntityGraph`, `@BatchSize`, `MultipleBagFetchException`, `HHH90003004`), rồi mở sang MyBatis/jOOQ/Spring Data JDBC, kiến trúc CQRS-lite, N+1 qua mạng và GraphQL, và cách dựng lưới chắn tự động.

