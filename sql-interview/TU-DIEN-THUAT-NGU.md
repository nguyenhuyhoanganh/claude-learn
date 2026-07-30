# Từ điển thuật ngữ dùng trong series

Mọi thuật ngữ tiếng Anh xuất hiện trong series đều được giải thích tại đây, kèm nghĩa tiếng Việt và **một câu trả lời cho câu hỏi "vì sao mình cần biết cái này"**. Mở bài này ra tra bất cứ lúc nào gặp từ lạ.

Các mục xếp theo chủ đề, không theo bảng chữ cái — vì học theo cụm dễ nhớ hơn học rời rạc.

## 1. Khái niệm nền

**Database (cơ sở dữ liệu)** — Nơi lưu trữ dữ liệu có tổ chức. Trong một database có nhiều *bảng*.

**Table (bảng)** — Cấu trúc hai chiều gồm *dòng* và *cột*, giống một sheet Excel nhưng có kiểu dữ liệu chặt chẽ và ràng buộc.

**Row / Record / Tuple (dòng / bản ghi)** — Một mục dữ liệu hoàn chỉnh. Một dòng trong bảng `customers` là một khách hàng.

**Column / Field / Attribute (cột / trường / thuộc tính)** — Một loại thông tin. Cột `email` chứa email của mọi khách.

**Schema (lược đồ)** — Từ này có **hai nghĩa** tuỳ ngữ cảnh, hay gây nhầm:
1. *Cấu trúc* của database: có bảng nào, cột nào, kiểu gì, ràng buộc gì. ("Thiết kế schema").
2. Một *không gian tên* chứa nhóm bảng trong PostgreSQL. (`public.customers` — `public` là schema).

**RDBMS (hệ quản trị cơ sở dữ liệu quan hệ)** — Phần mềm quản lý database quan hệ: PostgreSQL, MySQL, SQL Server, Oracle. "Quan hệ" ở đây nghĩa là dữ liệu được tổ chức thành bảng và liên kết với nhau qua khoá.

**Dialect (phương ngữ)** — Mỗi RDBMS có biến thể SQL riêng. `LIMIT 10` chạy trên PostgreSQL/MySQL nhưng SQL Server dùng `TOP 10`. Chuẩn SQL là mẫu số chung, còn thực tế mỗi hệ thêm thắt riêng.

**OLTP** (*Online Transaction Processing*) — Hệ thống giao dịch: nhiều thao tác nhỏ, nhanh, ghi nhiều. Ví dụ: hệ thống đặt hàng. Cần ít index để ghi nhanh.

**OLAP** (*Online Analytical Processing*) — Hệ thống phân tích: ít truy vấn nhưng mỗi truy vấn quét lượng dữ liệu lớn. Ví dụ: báo cáo doanh thu năm. Chịu được nhiều index.

**ETL** (*Extract - Transform - Load*) — Quy trình rút dữ liệu từ nguồn, biến đổi, rồi nạp vào kho dữ liệu. Nơi phát sinh nhiều bài toán trùng lặp và NULL nhất.

## 2. Cấu trúc bảng và ràng buộc

**Primary key (khoá chính)** — Cột (hoặc nhóm cột) định danh duy nhất một dòng. Ngầm định là `NOT NULL` + `UNIQUE`. Mỗi bảng chỉ có một.

**Foreign key (khoá ngoại)** — Cột trỏ tới khoá chính của bảng khác. Đảm bảo *toàn vẹn tham chiếu*: không thể tạo đơn hàng cho khách không tồn tại.

**Composite key (khoá phức hợp)** — Khoá gồm nhiều cột gộp lại. Ví dụ `(order_id, product_id)` cùng nhau định danh một dòng chi tiết đơn.

**Natural key (khoá tự nhiên)** — Khoá đến từ dữ liệu nghiệp vụ thật: số CMND, mã SKU, email.

**Surrogate key (khoá thay thế)** — Khoá do hệ thống sinh, không mang nghĩa nghiệp vụ: `id` tự tăng, UUID. Được ưa dùng hơn vì dữ liệu nghiệp vụ có thể thay đổi.

**Constraint (ràng buộc)** — Luật mà dữ liệu bắt buộc phải thoả: `NOT NULL`, `UNIQUE`, `CHECK`, `FOREIGN KEY`. Database từ chối mọi thao tác vi phạm.

**Cardinality (lực lượng)** — Từ này cũng có **hai nghĩa**:
1. *Quan hệ giữa hai bảng*: 1-1, 1-N (một khách nhiều đơn), N-N (một đơn nhiều sản phẩm, một sản phẩm ở nhiều đơn).
2. *Số giá trị phân biệt trong một cột*: cột `gender` có cardinality 2-3, cột `email` có cardinality gần bằng số dòng. Nghĩa này quan trọng khi quyết định đánh index.

**Grain (mức chi tiết)** — Một dòng của bảng đại diện cho cái gì. Bảng `orders` có grain là "một đơn hàng"; bảng `order_items` có grain là "một dòng sản phẩm trong một đơn". **Trộn hai grain khi join là nguyên nhân số một của số liệu sai.**

**Normalization (chuẩn hoá)** — Tách dữ liệu ra nhiều bảng để không lặp lại thông tin. Lợi: sửa một chỗ, đúng mọi nơi. Hại: phải join nhiều hơn khi đọc.

**Denormalization (phi chuẩn hoá)** — Cố ý lặp lại dữ liệu để đọc nhanh hơn. Ví dụ lưu sẵn `total_amount` trên `orders` thay vì cộng lại từ `order_items` mỗi lần.

**Soft delete (xoá mềm)** — Không xoá thật mà đánh dấu bằng cột `deleted_at` / `is_deleted`. Giữ được lịch sử, nhưng **mọi query phải nhớ lọc** — quên là ra số sai.

## 3. Truy vấn và JOIN

**Predicate (vị từ)** — Một biểu thức cho ra đúng/sai, dùng để lọc. `status = 'paid'` là một predicate.

**Cartesian product (tích Descartes)** — Ghép **mọi** dòng bảng A với **mọi** dòng bảng B. 1000 × 1000 = 1 triệu dòng. Xảy ra khi quên điều kiện `ON`.

**NULL padding (bù NULL)** — Khi `LEFT JOIN` giữ lại một dòng bảng trái không tìm được cặp, nó phải điền gì đó vào các cột bảng phải. Nó điền `NULL`. Các `NULL` này **không có trong bảng gốc** — chúng do phép join tạo ra, và mang nghĩa "không tìm thấy cặp nào".

**Orphan row (dòng mồ côi)** — Dòng bảng trái không match được với dòng nào bên phải.

**Anti-join** — Phép "lấy những dòng **không** có cặp". Là cách giải mọi bài toán "chưa từng...": khách chưa mua, sản phẩm chưa bán. Viết bằng `NOT EXISTS` hoặc `LEFT JOIN ... IS NULL`.

**Semi-join** — Phép "lấy những dòng **có** ít nhất một cặp", nhưng **không nhân dòng** và không lấy dữ liệu bên phải. Chính là `EXISTS` / `IN`.

**Fanout (nhân dòng)** — Khi join 1-N, mỗi dòng bảng "1" bị nhân lên theo số dòng khớp ở bảng "N". Đơn hàng có 3 sản phẩm sẽ xuất hiện 3 lần, và `SUM(total_amount)` sẽ cộng nhầm 3 lần.

**Self join (tự nối)** — Join một bảng với chính nó, dùng alias để phân biệt. Cần cho dữ liệu phân cấp (nhân viên - quản lý).

**Non-equi join** — Join dùng toán tử khác `=` (`>`, `BETWEEN`). Dùng khi ghép theo khoảng: bậc thuế, khung giá theo thời gian. Chậm hơn vì không dùng được hash join.

**Correlated subquery (subquery tương quan)** — Subquery tham chiếu tới bảng ở câu lệnh ngoài, nên về mặt logic phải chạy lại cho từng dòng ngoài. Nhận biết: bên trong có nhắc alias của bảng ngoài.

**Derived table (bảng dẫn xuất)** — Subquery đặt ở `FROM`, được dùng như một bảng tạm. Bắt buộc phải đặt alias.

**Scalar (vô hướng)** — "Một giá trị đơn lẻ", đối lập với một tập nhiều dòng. Scalar subquery phải trả về đúng một dòng một cột.

**CTE** (*Common Table Expression* — biểu thức bảng dùng chung) — Khối `WITH ten AS (...)` đặt tên cho một bước tính trung gian, giúp query nhiều tầng đọc từ trên xuống thay vì lồng vào nhau.

**Recursive CTE (CTE đệ quy)** — CTE tự tham chiếu chính nó để lặp, dùng cho dữ liệu phân cấp (cây tổ chức, danh mục nhiều cấp).

**LATERAL** — Cho phép subquery ở `FROM` nhìn thấy các bảng đứng trước nó, hoạt động như một vòng lặp. SQL Server gọi là `CROSS APPLY`.

**Window function (hàm cửa sổ)** — Hàm tính toán trên một nhóm dòng nhưng **không gộp chúng lại**. Mỗi dòng gốc vẫn còn, chỉ được thêm cột.

**Partition (trong `PARTITION BY`)** — Nhóm dòng mà window function tính riêng biệt. **Hoàn toàn không liên quan** tới *table partitioning* (chia nhỏ bảng vật lý) — hai khái niệm trùng tên, đây là nguồn nhầm lẫn rất phổ biến.

**Frame (khung)** — Phạm vi dòng quanh dòng hiện tại mà window function thực sự tính. Có mặc định, và mặc định đó là nguồn của nhiều bug.

**Peer (dòng ngang hàng)** — Các dòng có cùng giá trị ở `ORDER BY` của window. `RANGE` xử lý cả cụm peer như một, `ROWS` thì đếm từng dòng.

**Aggregate function (hàm tổng hợp)** — Hàm gộp nhiều dòng thành một giá trị: `COUNT`, `SUM`, `AVG`, `MAX`, `MIN`.

**Pivot (xoay bảng)** — Biến giá trị ở các *dòng* thành các *cột*. Ví dụ mỗi trạng thái đơn thành một cột riêng. Làm bằng `SUM(CASE WHEN ...)` hoặc `FILTER (WHERE ...)`.

**Functional dependency (phụ thuộc hàm)** — Khi biết giá trị cột A là suy ra được cột B. Biết `customer_id` là biết `full_name`. PostgreSQL dựa vào đó để cho phép `GROUP BY` chỉ theo khoá chính.

## 4. NULL và logic ba trị

**NULL** — Nghĩa là "không biết" / "không có giá trị". **Không phải** số 0, **không phải** chuỗi rỗng.

**Three-valued logic (logic ba trị)** — SQL có ba giá trị chân lý: `TRUE`, `FALSE`, `UNKNOWN`. Mọi so sánh với `NULL` cho `UNKNOWN`.

**UNKNOWN** — Kết quả của phép so sánh khi có `NULL` tham gia. `WHERE` loại bỏ `UNKNOWN` y hệt như loại `FALSE` — đây là nguồn của rất nhiều dòng "biến mất bí ẩn".

**Null-safe comparison (so sánh an toàn với NULL)** — `IS DISTINCT FROM` (PostgreSQL) hoặc `<=>` (MySQL): coi `NULL` bằng `NULL`, dùng để phát hiện thay đổi dữ liệu chính xác.

**Sentinel value (giá trị canh chừng)** — Dùng một giá trị đặc biệt (`-1`, `'N/A'`, `'1970-01-01'`) thay cho `NULL`. Nên tránh: chúng lọt vào `AVG`, `MIN` và làm sai số liệu âm thầm.

## 5. Index và lưu trữ

**Index (chỉ mục)** — Cấu trúc dữ liệu phụ giúp tìm dòng nhanh mà không phải quét cả bảng, giống mục lục của sách. Đổi lại làm chậm thao tác ghi và tốn dung lượng.

**B-Tree / B+Tree** — Cấu trúc cây cân bằng đứng sau 95% index. Độ sâu chỉ 3-4 tầng dù có hàng trăm triệu dòng. Các nút lá được sắp thứ tự và nối với nhau, nên phục vụ được cả tra chính xác lẫn quét khoảng và `ORDER BY`.

**Page / Block (trang)** — Đơn vị đọc ghi nhỏ nhất của database, thường 8KB ở PostgreSQL. Database không đọc từng dòng, nó đọc **cả trang**. Đây là lý do bảng nhỏ (nằm gọn một trang) thì quét tuần tự nhanh hơn dùng index.

**Heap (đống)** — Vùng lưu dữ liệu dòng thật của bảng trong PostgreSQL, tách rời khỏi index.

**Heap fetch** — Bước nhảy từ index về heap để đọc dữ liệu đầy đủ của dòng. Tốn thêm I/O, và là lý do index không phải lúc nào cũng thắng.

**ctid** — Định danh vật lý của một dòng trong PostgreSQL (trang số mấy, vị trí thứ mấy). Hữu ích khi cần xoá trùng ở bảng không có khoá chính.

**Clustered index (index gom cụm)** — Index mà dữ liệu dòng nằm **ngay trong** nút lá. InnoDB (MySQL) tổ chức bảng theo cách này quanh khoá chính; PostgreSQL thì không.

**Composite index (index phức hợp)** — Index trên nhiều cột, sắp theo thứ tự cột được khai báo.

**Leftmost prefix rule (quy tắc tiền tố trái)** — Index `(a, b, c)` chỉ dùng được khi query cung cấp điều kiện từ trái sang liên tục: `(a)`, `(a,b)`, `(a,b,c)`. Lọc chỉ theo `b` thì index gần như vô dụng — giống tra danh bạ khi chỉ biết tên đệm.

**Covering index (index bao phủ)** — Index chứa đủ mọi cột query cần, nên không phải quay về bảng. Cho ra *index-only scan*.

**Index-only scan** — Đọc dữ liệu hoàn toàn từ index, không chạm heap. Nhanh nhất.

**Partial index (index một phần)** — Index chỉ bao một phần dữ liệu (`WHERE status = 'pending'`). Nhỏ hơn hàng nghìn lần trên bảng lớn khi bộ lọc cố định.

**Expression index (index biểu thức)** — Index trên kết quả của một hàm: `CREATE INDEX ON t (LOWER(email))`. Cách cứu khi buộc phải biến đổi cột trong điều kiện lọc.

**SARGable** (*Search-ARGument-able*) — Điều kiện viết theo cách cho phép dùng index: **cột đứng trần một vế, hằng số ở vế kia**. `WHERE YEAR(d) = 2024` không SARGable; `WHERE d >= '2024-01-01' AND d < '2025-01-01'` thì có.

**Selectivity (độ chọn lọc)** — Tỉ lệ dòng khớp điều kiện. Chọn lọc cao (khớp 0.01%) thì index thắng lớn; chọn lọc thấp (khớp 40%) thì quét tuần tự lại rẻ hơn.

**Implicit conversion / type coercion (ép kiểu ngầm)** — Database tự đổi kiểu khi hai vế khác kiểu. Nguy hiểm vì nó có thể ép cả **cột**, làm index mất tác dụng mà không hề báo lỗi.

**GIN / GiST / BRIN** — Các loại index chuyên biệt: GIN cho JSONB, mảng và tìm kiếm văn bản; GiST cho dữ liệu không gian và khoảng; BRIN cho bảng cực lớn có dữ liệu sắp sẵn theo thời gian.

**Trigram** — Kỹ thuật cắt chuỗi thành các cụm 3 ký tự để index. Cho phép `LIKE '%abc%'` dùng được index — thứ mà B-Tree không làm được.

**CONCURRENTLY** — Tuỳ chọn cho phép tạo/xoá index **không khoá ghi** cả bảng. Bắt buộc dùng trên production.

**Write amplification (khuếch đại ghi)** — Một `INSERT` phải ghi vào bảng **và** vào mọi index liên quan. Bảng có 10 index thì mỗi lần chèn là 11 thao tác ghi.

## 6. Optimizer và execution plan

**Query optimizer / planner (bộ tối ưu truy vấn)** — Thành phần quyết định **cách** thực hiện câu lệnh: dùng index nào, join theo thuật toán gì, thứ tự bảng ra sao. Bạn không ra lệnh trực tiếp cho nó, chỉ tác động gián tiếp.

**Execution plan (kế hoạch thực thi)** — Cây các bước mà database sẽ làm. Xem bằng `EXPLAIN`.

**EXPLAIN / EXPLAIN ANALYZE** — `EXPLAIN` chỉ *ước lượng*, không chạy. `EXPLAIN ANALYZE` *chạy thật* rồi báo cáo số liệu thực tế. Với `UPDATE`/`DELETE` phải bọc `BEGIN ... ROLLBACK`.

**Cost (chi phí)** — Con số **không có đơn vị** do optimizer tự quy ước (mốc 1.0 = đọc tuần tự một trang). Chỉ dùng để so sánh các phương án với nhau, **không** quy đổi ra mili giây được.

**Statistics (thống kê)** — Thông tin optimizer thu thập về dữ liệu: bảng có bao nhiêu dòng, cột có bao nhiêu giá trị phân biệt, phân bố ra sao. Thống kê cũ → ước lượng sai → chọn plan tệ. Cập nhật bằng `ANALYZE`.

**Sequential scan (quét tuần tự)** — Đọc toàn bộ bảng từ đầu tới cuối. Không phải lúc nào cũng xấu: với bảng nhỏ hoặc khi lấy phần lớn dòng, đây là lựa chọn đúng.

**Nested loop join** — Với mỗi dòng bảng ngoài, tìm dòng khớp ở bảng trong. Tốt khi bảng ngoài nhỏ và bảng trong có index.

**Hash join** — Dựng bảng băm từ bảng nhỏ trong RAM, rồi quét bảng lớn tra vào. Chỉ dùng được với điều kiện `=`. Tốt cho hai bảng lớn không index.

**Merge join** — Sắp cả hai bảng theo cột join rồi chạy song song hai con trỏ. Tốt khi dữ liệu đã sẵn thứ tự.

**loops (số vòng lặp)** — Trong `EXPLAIN ANALYZE`, cho biết một node chạy bao nhiêu lần. **`actual rows` là số dòng mỗi lần lặp**, tổng thật = `rows × loops`. Đây là chỗ hiểu nhầm phổ biến nhất khi đọc plan.

**work_mem** — Lượng RAM mỗi thao tác sort/hash được dùng trước khi phải đổ ra đĩa. Đổ ra đĩa (`external merge Disk`) làm chậm hàng chục lần. Giới hạn này áp cho **mỗi thao tác**, không phải mỗi phiên — nên đặt quá cao có thể làm cạn RAM máy chủ.

**Decorrelate (khử tương quan)** — Optimizer viết lại subquery tương quan thành phép join, biến "chạy N lần" thành "chạy một lần". Khi nó **không** làm được, bạn sẽ thấy `SubPlan` với `loops` rất lớn — và đó là lúc phải tự tay viết lại query.

**pg_stat_statements** — Tiện ích mở rộng của PostgreSQL thống kê query nào tốn tổng thời gian nhiều nhất. Là nơi nên bắt đầu khi tối ưu.

## 7. Transaction và đồng thời

**Transaction (giao dịch)** — Nhóm thao tác được coi là **một đơn vị nguyên vẹn**: hoặc tất cả thành công, hoặc tất cả bị huỷ. Mở bằng `BEGIN`, chốt bằng `COMMIT`, huỷ bằng `ROLLBACK`.

**ACID** — Bốn đảm bảo của transaction: **A**tomicity (nguyên tử), **C**onsistency (nhất quán), **I**solation (cô lập), **D**urability (bền vững).

**Isolation level (mức cô lập)** — Mức độ transaction này nhìn thấy thay đổi dở dang của transaction khác. Càng cao càng an toàn, càng chậm.

**Dirty read (đọc bẩn)** — Đọc được dữ liệu chưa `COMMIT`, mà dữ liệu đó có thể bị rollback.

**Non-repeatable read (đọc không lặp lại được)** — Đọc **cùng một dòng** hai lần trong một transaction, ra hai giá trị khác nhau.

**Phantom read (đọc bóng ma)** — Đọc **cùng một điều kiện** hai lần, số dòng thay đổi vì có dòng mới được chèn.

**Lost update (mất cập nhật)** — Hai transaction cùng đọc rồi cùng ghi, một bản cập nhật bị đè mất. Không nằm trong bảng chuẩn SQL nhưng gây thiệt hại thực tế nhiều nhất.

**Race condition (đua tranh)** — Kết quả phụ thuộc vào việc hai tiến trình chạy nhanh chậm ra sao. Kinh điển: mẫu "kiểm tra rồi hành động" (`SELECT` xem đã tồn tại chưa, rồi `INSERT`).

**Pessimistic locking (khoá bi quan)** — Khoá trước rồi mới làm: `SELECT ... FOR UPDATE`. Người khác phải chờ. Phù hợp khi tranh chấp nhiều.

**Optimistic locking (khoá lạc quan)** — Không khoá, nhưng khi ghi thì kiểm tra dữ liệu có bị đổi chưa (qua cột `version`). Nếu bị đổi thì thử lại. Phù hợp khi tranh chấp ít.

**SKIP LOCKED** — Tuỳ chọn cho phép bỏ qua dòng đang bị khoá thay vì chờ. Nền tảng để biến một bảng thường thành hàng đợi công việc cho nhiều worker.

**Deadlock (khoá chết)** — Hai transaction chờ nhau vòng tròn, không ai đi tiếp được. Database phát hiện và huỷ một "nạn nhân". Phòng bằng cách luôn khoá tài nguyên theo cùng một thứ tự.

**MVCC** (*Multi-Version Concurrency Control*) — Cơ chế tạo **phiên bản mới** của dòng mỗi khi `UPDATE`, thay vì sửa tại chỗ. Nhờ đó *đọc không chặn ghi, ghi không chặn đọc*.

**Snapshot (ảnh chụp)** — Trạng thái dữ liệu mà một transaction nhìn thấy, cố định tại một thời điểm.

**Dead tuple (dòng chết)** — Phiên bản cũ của dòng, không còn transaction nào cần, chờ được dọn.

**VACUUM** — Tiến trình dọn dòng chết của PostgreSQL. **Transaction mở lâu sẽ chặn `VACUUM`**, khiến bảng phình to và mọi query chậm dần.

**Bloat (phình bảng)** — Bảng/index chiếm dung lượng lớn hơn nhiều so với dữ liệu thật, do dòng chết chưa được dọn.

**WAL** (*Write-Ahead Log*) — Nhật ký ghi trước, đảm bảo tính bền vững và là nguồn dữ liệu cho replica. `UPDATE` hàng chục triệu dòng một lần sẽ làm WAL phình hàng chục GB.

**Replica (bản sao)** — Máy chủ sao chép dữ liệu từ máy chính, thường dùng để chia tải đọc.

**Replication lag (độ trễ sao chép)** — Khoảng thời gian replica chậm hơn máy chính. Thao tác ghi hàng loạt làm độ trễ tăng vọt.

**Idempotency (tính bất biến khi lặp)** — Thực hiện một thao tác nhiều lần cho kết quả giống hệt thực hiện một lần. Thiết yếu cho webhook, thanh toán, và job ETL chạy lại.

**Idempotency key (khoá bất biến)** — Mã do **client** sinh, gửi kèm mọi lần thử lại, giúp server nhận ra "đây vẫn là yêu cầu cũ" và không xử lý hai lần.

**UPSERT** — Ghép của *update* và *insert*: có thì cập nhật, chưa có thì chèn mới. PostgreSQL dùng `ON CONFLICT`, MySQL dùng `ON DUPLICATE KEY UPDATE`.

**Backoff (giãn thời gian thử lại)** — Chờ lâu dần giữa các lần thử lại (1s, 2s, 4s...) để không dồn tải khi hệ thống đang quá tải.

## 8. Vận hành và quy mô

**DDL / DML / DQL / DCL / TCL** — Năm nhóm lệnh SQL: định nghĩa cấu trúc / thao tác dữ liệu / truy vấn / phân quyền / quản lý giao dịch. Chi tiết ở [phase-1 bài 0](phase-1/00-tu-dien-tu-khoa-sql-cho-nguoi-moi.md).

**Migration (di trú)** — Thay đổi cấu trúc database theo phiên bản, thường bằng script được quản lý trong Git.

**Downtime (thời gian ngừng)** — Khoảng thời gian hệ thống không phục vụ được. Mục tiêu của các kỹ thuật DDL an toàn là **không có downtime**.

**Table partitioning (phân vùng bảng)** — Chia một bảng lớn thành nhiều bảng con theo khoảng giá trị (thường theo thời gian). Cho phép xoá dữ liệu cũ bằng `DROP TABLE` tức thời. **Không liên quan tới `PARTITION BY` của window function.**

**Partition pruning (cắt bớt phân vùng)** — Optimizer nhận ra query chỉ cần chạm một vài phân vùng nên bỏ qua phần còn lại.

**Batch / chunk (lô)** — Chia một thao tác lớn thành nhiều phần nhỏ, mỗi phần một transaction riêng. Cách duy nhất an toàn để cập nhật hàng chục triệu dòng.

**Backfill (nạp bù)** — Điền dữ liệu cho cột mới thêm vào bảng đã có sẵn dữ liệu cũ.

**Keyset pagination / seek method (phân trang theo khoá)** — Thay vì `OFFSET`, nhớ giá trị dòng cuối trang trước và lấy các dòng đứng sau nó. Thời gian không đổi dù ở trang thứ mấy.

**Cursor (con trỏ)** — Trong ngữ cảnh phân trang: token đánh dấu vị trí đang đọc tới. (Từ này còn có nghĩa khác trong SQL — con trỏ duyệt kết quả từng dòng.)

**N+1 problem** — Chạy 1 query lấy danh sách rồi N query lấy chi tiết cho từng phần tử. 1000 query × 1ms độ trễ mạng = 1 giây lãng phí.

**Lazy loading (nạp lười)** — Hành vi mặc định của nhiều ORM: chỉ nạp dữ liệu liên quan khi được truy cập. Là nguyên nhân trực tiếp của N+1.

**ORM** (*Object-Relational Mapping*) — Thư viện ánh xạ bảng thành lớp đối tượng: Django ORM, SQLAlchemy, Hibernate, Prisma.

**lock_timeout** — Giới hạn thời gian chờ lấy khoá. Đặt trước khi chạy DDL để "thà thất bại nhanh còn hơn chặn cả hệ thống".

**idle in transaction** — Trạng thái của phiên đã `BEGIN` nhưng chưa `COMMIT` và đang không làm gì. Thường do ứng dụng quên đóng — nguyên nhân sự cố production rất phổ biến.

## 9. Phân tích dữ liệu

**Cohort (nhóm đồng hành)** — Nhóm người dùng có chung mốc bắt đầu, thường là tháng đăng ký hoặc tháng mua đầu tiên.

**Retention (tỉ lệ giữ chân)** — Phần trăm người dùng của một cohort còn quay lại sau N kỳ.

**Churn (tỉ lệ rời bỏ)** — Ngược lại của retention: phần trăm rời đi.

**Funnel (phễu)** — Chuỗi bước người dùng đi qua (xem → thêm giỏ → thanh toán) và tỉ lệ rơi rụng ở mỗi bước.

**Conversion rate (tỉ lệ chuyển đổi)** — Phần trăm đi được từ bước này sang bước kế tiếp.

**MoM / YoY** — *Month over Month* (so tháng trước) và *Year over Year* (so cùng kỳ năm trước).

**Running total (luỹ kế)** — Tổng cộng dồn từ đầu tới dòng hiện tại.

**Moving average (trung bình trượt)** — Trung bình của N kỳ gần nhất, dùng để làm mượt biểu đồ nhiễu.

**Gaps and islands** — Họ bài toán tìm các đoạn giá trị liên tiếp ("chuỗi ngày đăng nhập liên tục") và các khoảng trống giữa chúng. Mẹo giải: `giá_trị - ROW_NUMBER()` là hằng số trong mỗi đoạn liên tiếp.

**Sessionization (chia phiên)** — Gom các sự kiện rời rạc thành phiên làm việc, cắt phiên mới khi khoảng cách vượt ngưỡng.

**RFM** — Phân khúc khách theo *Recency* (mua gần đây không), *Frequency* (mua thường xuyên không), *Monetary* (chi nhiều không).

**Percentile / median (phân vị / trung vị)** — Trung vị là giá trị đứng giữa khi sắp xếp. Dùng thay trung bình khi dữ liệu có giá trị cực đoan, vì trung bình bị kéo lệch còn trung vị thì không.

**SCD Type 2** (*Slowly Changing Dimension*) — Cách lưu lịch sử thay đổi: mỗi lần đổi thì đóng bản ghi cũ (`valid_to`) và mở bản ghi mới, thay vì ghi đè.

**Data quality check (kiểm tra chất lượng dữ liệu)** — Bộ query chạy định kỳ để phát hiện trùng lặp, khoá ngoại mồ côi, sai lệch số học giữa bảng tổng và bảng chi tiết.

## Cách dùng từ điển này

- Gặp từ lạ trong bài nào, quay về đây tra rồi đọc tiếp — đừng bỏ qua.
- Trước buổi phỏng vấn, đọc lướt mục 3, 5, 6, 7 — đó là bốn mục có mật độ câu hỏi cao nhất.
- Khi trả lời phỏng vấn, dùng **cả thuật ngữ tiếng Anh lẫn giải thích tiếng Việt**: *"Đây là anti-join, tức là lấy những dòng không tìm được cặp bên bảng kia"*. Nói được cả hai cho thấy bạn hiểu chứ không phải học thuộc.

**Quay lại** → [Mục lục series](README.md)
