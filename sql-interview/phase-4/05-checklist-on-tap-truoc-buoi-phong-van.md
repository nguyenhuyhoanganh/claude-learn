# Bài 5: Checklist ôn tập trước buổi phỏng vấn

Bài cuối của series không thêm kiến thức mới. Nó gói lại toàn bộ những gì đã học thành thứ bạn mở ra đọc trong ba mươi phút trước khi vào phòng phỏng vấn — cộng với phần quan trọng không kém: **cách trình bày** lời giải, và những sai lầm khiến ứng viên giỏi vẫn bị loại.

Một sự thật đáng nhớ: giữa hai ứng viên viết ra cùng một query, người được nhận là người **giải thích được vì sao mình viết như vậy** và **nêu được cái giá phải trả**. Kỹ thuật là điều kiện cần; cách trình bày là điều kiện đủ.

## Bản tra nhanh 30 phút

### Thứ tự xử lý logic — nền tảng của mọi câu hỏi mẹo

```text
FROM → JOIN/ON → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT
                                                        ▲
                                          alias và window function sinh ra ở đây
```

Giải thích được: vì sao `WHERE COUNT(*)` lỗi, vì sao alias dùng được ở `ORDER BY` mà không dùng được ở `WHERE`, vì sao window function phải bọc CTE mới lọc được, vì sao `ON` khác `WHERE` với `LEFT JOIN`.

### JOIN

```text
INNER      chỉ phần giao
LEFT       toàn bộ bảng trái + phần giao, không match thì cột phải = NULL
RIGHT      ngược lại (đừng dùng — đổi vị trí bảng rồi dùng LEFT)
FULL OUTER tất cả hai phía (MySQL không có)
CROSS      mọi cặp, không ON
```

- Anti-join (*"chưa từng..."*): `NOT EXISTS` là mặc định. `LEFT JOIN ... WHERE khoá_phải IS NULL` cũng được. **`NOT IN` thì tránh.**
- Điều kiện về bảng phải trong `LEFT JOIN` → đặt ở `ON`, không đặt ở `WHERE`.
- Join 1-N làm **nhân dòng** → mọi `SUM` sau đó sai → gom trước rồi join.
- Cần `DISTINCT` để "kết quả trông đúng" = dấu hiệu đang che fanout.

### Aggregate

```text
COUNT(*)            đếm dòng, kể cả dòng toàn NULL
COUNT(cột)          bỏ qua NULL          ← dùng cái này sau LEFT JOIN
COUNT(DISTINCT cột) giá trị phân biệt, bỏ NULL
SUM/AVG/MAX/MIN     bỏ qua NULL; SUM tập rỗng trả NULL (nhớ COALESCE)
```

- `WHERE` lọc dòng trước khi gom; `HAVING` lọc nhóm sau khi gom.
- Mọi NULL gom vào **một nhóm chung** khi `GROUP BY`.
- Pivot trong một lần quét: `COUNT(*) FILTER (WHERE ...)` hoặc `SUM(CASE WHEN ... THEN 1 ELSE 0 END)`.

### Window function

```text
hàm() OVER (PARTITION BY ... ORDER BY ... [ROWS/RANGE ...])

ROW_NUMBER  1,2,3,4   đánh số tuần tự (cần tiêu chí phá hoà để ổn định)
RANK        1,2,2,4   hoà cùng hạng, nhảy cóc
DENSE_RANK  1,2,2,3   hoà cùng hạng, đi đều   ← "cao thứ N" thường dùng cái này
```

- Không lọc được trong `WHERE` → bọc CTE.
- Frame mặc định khi có `ORDER BY` là `RANGE ... CURRENT ROW` → bẫy `LAST_VALUE` và bẫy luỹ kế khi có giá trị trùng. Luỹ kế nên viết rõ `ROWS UNBOUNDED PRECEDING`.
- `LAG`/`LEAD` cho tăng trưởng; luôn `NULLIF(mẫu, 0)` khi chia.

### NULL

```text
NULL = NULL        → UNKNOWN (không phải TRUE)
WHERE giữ TRUE; UNKNOWN bị loại như FALSE
WHERE col <> 'x'   → BỎ SÓT dòng NULL          ← nguyên nhân tổng phân khúc không khớp
NOT IN (tập có NULL) → luôn rỗng
UNIQUE             → cho phép NHIỀU dòng NULL
EXCEPT/INTERSECT   → coi NULL BẰNG NULL (ngoại lệ)
IS DISTINCT FROM   → so sánh an toàn với NULL (MySQL: <=>)
```

### Index

```text
Composite (a,b,c) dùng được cho: (a), (a,b), (a,b,c) — quy tắc TIỀN TỐ TRÁI
Thứ tự cột: cột "=" TRƯỚC, cột khoảng (>,<,BETWEEN) SAU CÙNG
Covering index / INCLUDE → Index Only Scan, khỏi chạm bảng

Giết index: LOWER(col)=… │ YEAR(col)=… │ col*2>… │ LIKE '%x%' │ ép kiểu ngầm │ OR khác cột
Không dùng index dù có: bảng nhỏ │ độ chọn lọc thấp │ thống kê lỗi thời
Production: luôn CREATE INDEX CONCURRENTLY
```

### Đọc plan

```text
EXPLAIN (ANALYZE, BUFFERS) — đọc từ trong ra ngoài, thời gian là luỹ tích
actual rows là số dòng MỖI LẦN LẶP → tổng = rows × loops

Cờ đỏ: rows ước lượng lệch xa actual │ Seq Scan bảng lớn │ loops rất lớn
       Sort/Hash đổ đĩa │ Rows Removed by Filter khổng lồ │ SubPlan lặp nhiều
```

### Đồng thời

```text
Mặc định: PostgreSQL READ COMMITTED │ MySQL REPEATABLE READ
Lost update → ghi nguyên tử (SET x = x-1) │ FOR UPDATE │ cột version + retry
Double booking → ràng buộc UNIQUE (FOR UPDATE không khoá được dòng CHƯA tồn tại)
Hàng đợi công việc → FOR UPDATE SKIP LOCKED
Deadlock → khoá theo thứ tự nhất quán, transaction ngắn, retry có backoff
```

## Quy trình trả lời một đề bài SQL

```text
① LÀM RÕ (15-30 giây, gần như luôn ghi điểm)
   "Đơn huỷ/hoàn có tính không? Cột này có NULL không? Có soft delete không?
    Kết quả cần ở mức chi tiết nào — theo ngày hay theo tháng?"

② NÓI HƯỚNG GIẢI trước khi gõ
   "Em sẽ gom order_items về mức đơn hàng trước để tránh nhân dòng,
    rồi LEFT JOIN sang customers để giữ cả khách chưa mua."

③ VIẾT — format sạch, alias có nghĩa
   Mỗi mệnh đề một dòng. Alias c/o/oi chứ không phải t1/t2. Không SELECT *.

④ TỰ KIỂM bằng dữ liệu nhỏ
   "Với khách A có 2 đơn, kết quả phải là 2 dòng ở bước này và 1 dòng sau khi gom."

⑤ NÊU ĐÁNH ĐỔI — bước phân biệt ứng viên được nhận
   "Nếu orders có 50 triệu dòng, em cần index trên (customer_id, ordered_at).
    Cách dùng NOT EXISTS ở đây an toàn hơn NOT IN vì cột có thể NULL."
```

Bước ① và ⑤ là hai bước ứng viên hay bỏ qua nhất, và cũng là hai bước có tỉ lệ ăn điểm cao nhất so với công sức bỏ ra.

## Bảy sai lầm khi trả lời

| Sai lầm | Vì sao bị trừ điểm | Làm thay thế |
|---|---|---|
| Gõ ngay không hỏi lại | Người phỏng vấn cố tình để đề mơ hồ | Hỏi 2-3 câu về dữ liệu trước |
| Im lặng suy nghĩ vài phút | Người phỏng vấn không biết bạn đang nghĩ gì hay bí | Nói to hướng đi, kể cả khi chưa chắc |
| Viết một dòng dài không format | Trông như người chưa từng review code | Xuống dòng, thụt lề, alias có nghĩa |
| Trả lời cụt lủn theo định nghĩa | Nghe như học thuộc | Định nghĩa → ví dụ → đánh đổi |
| Nói "cái này luôn nhanh hơn" | Hiếm khi đúng tuyệt đối | "Tuỳ dữ liệu; em sẽ `EXPLAIN ANALYZE` để chắc" |
| Cố che khi không biết | Người phỏng vấn nhận ra ngay | "Em chưa làm cái này. Theo em hiểu thì… và em sẽ kiểm chứng bằng…" |
| Bỏ qua NULL và edge case | Đây chính là thứ đang bị kiểm tra | Chủ động nêu: "nếu cột này có NULL thì…" |

Về sai lầm thứ sáu: **thừa nhận không biết rồi suy luận tiếp** gần như luôn được chấm cao hơn đoán bừa. Người phỏng vấn tuyển đồng nghiệp, và đồng nghiệp đoán bừa về dữ liệu production là rủi ro.

## Với bài tập về nhà (take-home)

Nếu được giao bài tập mang về, phần lớn điểm nằm ngoài câu query:

```text
□ README ngắn: cách chạy, giả định đã đặt ra, những gì chưa làm và vì sao
□ Ghi rõ MỌI giả định về dữ liệu (đơn huỷ, múi giờ, soft delete)
□ Query format sạch, có comment cho phần logic nghiệp vụ khó hiểu
□ Kèm script tạo bảng + dữ liệu mẫu để người chấm chạy được ngay
□ Nêu ít nhất một cách tối ưu nếu dữ liệu lớn hơn 1000 lần
□ Nếu có phần chưa xong: nói rõ hướng làm tiếp, đừng giấu
```

Phần "giả định" là nơi ghi điểm nhiều nhất và ít người làm nhất. Đề bài thật luôn mơ hồ; người chấm muốn thấy bạn nhận ra chỗ mơ hồ và xử lý có ý thức.

## Kế hoạch ôn 7 ngày

| Ngày | Nội dung | Nguồn |
|---|---|---|
| 1 | Thứ tự xử lý logic + JOIN toàn tập; dựng schema mẫu và chạy thử | [phase-1 bài 1-2](../phase-1/01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md) |
| 2 | Bẫy ON vs WHERE, fanout, self join | [phase-1 bài 3](../phase-1/03-join-nang-cao-fanout-on-vs-where-va-thuat-toan-join.md) |
| 3 | GROUP BY / HAVING / conditional aggregation | [phase-1 bài 4](../phase-1/04-group-by-having-va-nghe-thuat-aggregate.md) |
| 4 | Window function — luyện tới khi viết được không cần tra | [phase-1 bài 5](../phase-1/05-window-function-tu-a-den-z.md) |
| 5 | Subquery, CTE, recursive CTE, NULL | [phase-2](../phase-2/01-subquery-toan-tap.md) |
| 6 | Index, đọc plan, anti-pattern | [phase-3](../phase-3/01-index-hoat-dong-the-nao-va-viet-query-dung-index.md) |
| 7 | Case thực chiến + chạy bộ câu hỏi, **nói thành tiếng** | [phase-4 bài 1, 4](01-case-bao-cao-doanh-thu-cohort-va-retention.md) |

Nếu chỉ còn một ngày: đọc bản tra nhanh ở đầu bài này, làm lại ba bài toán kinh điển (khách chưa mua, phòng ban đông người, lương cao thứ hai mỗi phòng), và luyện quy trình năm bước ở trên với hai đề bất kỳ.

## Mười bài toán phải viết được không cần tra cứu

Đây là danh sách tối thiểu. Nếu viết trôi chảy cả mười, bạn đã vượt phần lớn ứng viên:

```text
1.  Khách chưa từng đặt hàng                    → NOT EXISTS
2.  Mọi khách kèm số đơn (chưa mua hiện 0)      → LEFT JOIN + COUNT(cột)
3.  Phòng ban có hơn N nhân viên                → GROUP BY + HAVING
4.  Lương cao thứ hai mỗi phòng ban             → DENSE_RANK trong CTE
5.  Top N sản phẩm mỗi danh mục                 → DENSE_RANK + PARTITION BY
6.  Doanh thu theo tháng + tăng trưởng + luỹ kế → LAG + SUM OVER
7.  Tìm và xoá bản ghi trùng, giữ bản mới nhất  → ROW_NUMBER + DELETE USING
8.  Nhân viên lương cao hơn quản lý             → self join
9.  Cây tổ chức nhiều tầng                      → recursive CTE
10. Chuỗi ngày hoạt động liên tiếp              → gaps and islands
```

## Trước giờ phỏng vấn

```text
□ Chuẩn bị sẵn 1 câu chuyện tối ưu query có SỐ LIỆU cụ thể (từ Xs xuống Yms)
□ Chuẩn bị 1 câu chuyện về lần bạn phát hiện dữ liệu sai và cách truy ra nguyên nhân
□ Biết rõ hệ quản trị công ty đang dùng, ôn phần khác biệt (Postgres vs MySQL)
□ Chuẩn bị 3 câu hỏi ngược cho người phỏng vấn
□ Nếu phỏng vấn online: thử trước công cụ chia sẻ màn hình / trình soạn SQL họ dùng
□ Đọc lại bản tra nhanh ở đầu bài này
```

Câu chuyện có số liệu là thứ được nhớ lâu nhất sau buổi phỏng vấn. *"Em từng sửa một báo cáo chạy 40 giây xuống 300ms bằng cách bỏ correlated subquery và thêm composite index"* mạnh hơn nhiều so với *"em có kinh nghiệm tối ưu query"*.

## Tóm tắt series

Nhìn lại toàn bộ hành trình:

- **Phase 1** — ba câu hỏi kinh điển và phần đào sâu: JOIN và anti-join, bẫy `ON` vs `WHERE`, nhân dòng, `GROUP BY`/`HAVING`, window function.
- **Phase 2** — tư duy tập hợp: subquery ba vị trí, CTE và đệ quy, phép toán tập hợp, logic ba trị của NULL.
- **Phase 3** — phần tách senior khỏi junior: index và SARGable, đọc execution plan, 15 anti-pattern, phân trang và xử lý bảng lớn.
- **Phase 4** — thực chiến: báo cáo và cohort, dedup và upsert, transaction và khoá, bộ câu hỏi tổng hợp.

Ba điều đáng mang theo hơn cả cú pháp:

1. **Hỏi lại trước khi viết.** Đề bài thật luôn mơ hồ, và người nhận ra điều đó là người làm được việc.
2. **Luôn nghĩ tới NULL và tới quy mô dữ liệu.** Hai thứ này chiếm phần lớn khoảng cách giữa "query chạy được" và "query đúng".
3. **Đo trước, sửa sau.** Với mọi câu hỏi về performance, `EXPLAIN ANALYZE` là câu trả lời đầu tiên.

**Bài kế tiếp** → [Phase 5, Bài 1: Tiền trong database — `FLOAT` hay `DECIMAL`?](../phase-5/01-tien-trong-database-float-hay-decimal.md)

**Quay lại** → [Mục lục series](../README.md)
