# Series: Phá đảo vòng phỏng vấn SQL

> "8/10 ứng viên data bị loại ngay tại vòng SQL. Không phải vì họ kém, mà vì trượt đúng vài câu hỏi kinh điển."

Series này bắt đầu từ ba câu hỏi kinh điển nhất (JOIN, GROUP BY/HAVING, window function), rồi đi tiếp tới những thứ mà người phỏng vấn **thật sự** dùng để phân loại ứng viên: subquery, CTE, đọc execution plan, tối ưu query, và các case thực chiến bạn sẽ gặp mỗi ngày khi đi làm.

Mỗi bài đều có: giải thích **từng câu lệnh làm gì**, dữ liệu mẫu chạy được, ASCII diagram, bảng so sánh, bẫy thường gặp, câu hỏi phỏng vấn kèm đáp án mẫu, và use case production.

## Cách dùng series

1. **Mới học SQL?** Bắt đầu từ [Bài 0](phase-1/00-tu-dien-tu-khoa-sql-cho-nguoi-moi.md) — giải thích từng từ khoá SQL làm gì, kèm bẫy của người mới.
2. Dựng schema mẫu ở [Bài 1 phase-1](phase-1/01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md) — **mọi query trong series đều chạy được trên schema này**.
3. Đọc tuần tự phase-1 → phase-4. Mỗi bài kết thúc bằng link "Bài kế tiếp".
4. Gặp thuật ngữ lạ → tra [Từ điển thuật ngữ](TU-DIEN-THUAT-NGU.md), đừng bỏ qua.
5. Gõ lại query, đừng chỉ đọc. SQL là kỹ năng vận động, không phải kiến thức.

Dialect chính: **PostgreSQL 14+**. Chỗ nào MySQL 8 khác biệt đều có ghi chú riêng.

> **[Từ điển thuật ngữ](TU-DIEN-THUAT-NGU.md)** — hơn 120 thuật ngữ dùng trong series (anti-join, fanout, SARGable, MVCC, cohort, idempotency...), mỗi từ kèm nghĩa tiếng Việt và lý do cần biết. Tra bất cứ lúc nào gặp từ chưa quen.

## Mục lục

### Phase 1 — Ba câu hỏi kinh điển (và phần đào sâu người phỏng vấn thật sự muốn nghe)

| Bài | Nội dung |
|---|---|
| [00](phase-1/00-tu-dien-tu-khoa-sql-cho-nguoi-moi.md) | **Cho người mới**: từng từ khoá SQL làm gì, toán tử, kiểu dữ liệu, cách đọc một câu SQL lạ, 10 lỗi fresher hay gặp |
| [01](phase-1/01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md) | Vì sao ứng viên trượt vòng SQL; 4 tầng câu hỏi; query optimizer; thứ tự xử lý logic của SQL; schema mẫu |
| [02](phase-1/02-join-inner-vs-left-va-bai-toan-khach-chua-mua.md) | JOIN toàn tập: INNER/LEFT/RIGHT/FULL/CROSS; bài toán "khách chưa từng đặt hàng" và 3 cách giải |
| [03](phase-1/03-join-nang-cao-fanout-on-vs-where-va-thuat-toan-join.md) | Bẫy ON vs WHERE, nhân dòng (fanout) làm sai doanh thu, self join, thuật toán join |
| [04](phase-1/04-group-by-having-va-nghe-thuat-aggregate.md) | GROUP BY, HAVING vs WHERE, COUNT(*) vs COUNT(col), conditional aggregation, ROLLUP |
| [05](phase-1/05-window-function-tu-a-den-z.md) | Window function: RANK/DENSE_RANK/ROW_NUMBER, top N mỗi nhóm, frame, LAG/LEAD, running total |

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

## Bắt đầu

- Mới học SQL → [Bài 0: Từ điển từ khoá SQL cho người mới](phase-1/00-tu-dien-tu-khoa-sql-cho-nguoi-moi.md)
- Đã viết SQL thành thạo → [Bài 1: Vì sao 8/10 ứng viên trượt vòng SQL](phase-1/01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md)
