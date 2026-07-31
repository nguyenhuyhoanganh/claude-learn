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

**Support / Confidence / Lift** — Ba chỉ số của luật kết hợp. *Support* = tần suất cặp xuất hiện. *Confidence(A→B)* = trong số đơn có A, bao nhiêu % có B (**không đối xứng**). *Lift* = mua A làm xác suất mua B tăng bao nhiêu lần so với ngẫu nhiên; **lift > 1** mới là liên quan thật. Đếm thô luôn đưa sản phẩm phổ biến lên đầu, lift thì không.

**COGS** (*Cost of Goods Sold*, giá vốn hàng bán) — Số tiền thực sự bỏ ra để mua đúng những món vừa bán. Tính theo **FIFO** (nhập trước xuất trước), **bình quân gia quyền**, hoặc LIFO (VAS 02 và IFRS **không cho phép** LIFO).

**Khớp khoảng (interval matching)** — Mẫu giải bài toán FIFO/phân bổ: dùng window function tạo khoảng luỹ tiến hai bên, join theo điều kiện giao nhau `a.dau < b.het AND a.het > b.dau`, số lượng khớp là `LEAST(het) − GREATEST(dau)`.

## 10. Kiểu dữ liệu và thiết kế bảng

**IEEE 754 / floating point (dấu phẩy động)** — Chuẩn lưu số thực bằng nhị phân mà mọi CPU dùng. Vì `0.1` không biểu diễn hết được trong nhị phân, `FLOAT` chỉ hứa **gần đúng** — cấm dùng cho tiền.

**`NUMERIC(p, s)` / `DECIMAL`** — Số thập phân **chính xác tuyệt đối**, lưu từng chữ số. `p` là tổng chữ số, `s` là số chữ số sau dấu phẩy. Chậm hơn `FLOAT` 2–5 lần vì chạy bằng phần mềm, không phải lệnh CPU.

**Minor unit (đơn vị nhỏ nhất)** — Cách lưu tiền bằng số nguyên theo đơn vị nhỏ nhất (cent, đồng). Bắt buộc lưu kèm mã tiền tệ vì mỗi loại có `scale` riêng (VND: 0, USD: 2, KWD: 3).

**Integer overflow (tràn số nguyên)** — Giá trị vượt trần của kiểu. Trần cần thuộc: `SMALLINT` 32.767, `INT` 2.147.483.647, `BIGINT` 9,2 triệu tỷ. Postgres/MySQL-strict **báo lỗi**; MySQL non-strict **cắt im lặng** — kịch bản nguy hiểm nhất.

**`Number.MAX_SAFE_INTEGER`** — Trần 2⁵³−1 của JavaScript. ID `BIGINT` trả qua JSON bị làm tròn **im lặng** — phải serialize thành chuỗi.

**Collation (bảng đối chiếu)** — Bộ luật so sánh và sắp xếp chuỗi; quyết định `'a' = 'A'` đúng hay sai. **Gắn liền với index** — đổi collation hoặc nâng cấp glibc mà không `REINDEX` làm index sai âm thầm.

**Index key prefix limit** — Trần độ dài khoá index của InnoDB: 767 byte (row format cũ) hoặc 3.072 byte (`DYNAMIC`). Tính theo **con số khai báo × byte/ký tự** — lý do Laravel từng hạ mặc định xuống 191 (767 ÷ 4).

**Generated column (cột sinh)** — Cột giá trị được database tự tính từ cột khác. `STORED` lưu xuống đĩa, `VIRTUAL` tính lúc đọc. Dùng để ép chuẩn hoá dữ liệu ngay tại database.

**`TIMESTAMPTZ`** — Cái tên nói dối: nó **không lưu múi giờ**. Nó quy đổi đầu vào về UTC, lưu 8 byte UTC, vứt bỏ múi giờ gốc, rồi quy đổi ngược theo `TimeZone` của phiên khi đọc.

**Wall time (giờ treo tường)** — Con số hiện trên đồng hồ ở một nơi ("9 giờ sáng thứ Hai"). Là một *ý định*, không phải thời điểm — lưu giờ địa phương + **tên vùng IANA**, không lưu UTC, không lưu offset.

**DST** (*Daylight Saving Time*, giờ mùa hè) — Ở nước có DST, mỗi năm có một ngày 23 giờ và một ngày 25 giờ; có giờ **không tồn tại** và giờ **tồn tại hai lần**. Gây cron bỏ lượt/chạy hai lần và lệch lương theo ca.

**`now()` vs `clock_timestamp()`** — `now()` trả giờ **bắt đầu transaction** và đứng yên suốt transaction; `clock_timestamp()` trả giờ thật. Dùng nhầm là lý do đo thời lượng batch ra 0.

**Page split (tách trang)** — Khi chèn vào một trang B+Tree đã đầy, trang bị tách đôi thành hai trang chỉ đầy ~50%. Nguyên nhân UUID v4 làm index phình 1,5–2 lần.

**UUID v7 / ULID / Snowflake** — Họ ID có **thứ tự thời gian**: timestamp ở đầu nên ghi vào trang cuối như auto increment, mà vẫn sinh được ở nhiều máy. Cái giá: **lộ thời điểm tạo** và gây hot shard.

**Surrogate key vs Natural key** — *Surrogate* là ID vô nghĩa do hệ thống sinh; *Natural* là dữ liệu nghiệp vụ có sẵn tính duy nhất (email, SKU). Dùng surrogate làm PK vì natural key **thay đổi được**, nhưng vẫn phải đặt `UNIQUE` cho natural key.

**Partial index (index một phần)** — Index chỉ đánh trên tập dòng thoả điều kiện: `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`. Lời giải cho soft delete và cho "chỉ một dòng mặc định".

**`EXCLUDE` constraint** — Ràng buộc chỉ PostgreSQL có, chặn hai bản ghi **chồng lấn** nhau: `EXCLUDE USING gist (room_id WITH =, khoang WITH &&)`. Giải sạch bài toán đặt phòng mà không có race condition.

**`NOT VALID` → `VALIDATE`** — Cách thêm ràng buộc vào bảng lớn mà không khoá lâu: thêm ở chế độ `NOT VALID` (chỉ áp cho dòng mới), dọn dữ liệu cũ theo lô, rồi `VALIDATE CONSTRAINT` với khoá nhẹ.

**`DEFERRABLE`** — Hoãn kiểm tra ràng buộc tới lúc `COMMIT`. Dùng cho tham chiếu vòng và hoán đổi giá trị trong cột `UNIQUE`.

## 11. An toàn dữ liệu và vận hành

**DML / DDL** — *Data Manipulation Language* (`INSERT`/`UPDATE`/`DELETE`, đụng vào **dòng**) và *Data Definition Language* (`CREATE`/`ALTER`/`DROP`/`TRUNCATE`, đụng vào **cấu trúc**). `TRUNCATE` mang họ DDL dù nghe như lệnh xoá dữ liệu.

**Autocommit** — Chế độ mặc định của gần như mọi client: mỗi lệnh được bọc trong transaction riêng và commit ngay. **Thủ phạm thật của mọi tai nạn xoá dữ liệu** — không phải lệnh xoá.

**PITR** (*Point-In-Time Recovery*) — Khôi phục database về đúng một thời điểm trong quá khứ, cần base backup + WAL archive liên tục. Đường về duy nhất sau khi đã commit.

**Bloat** — Phần đĩa bị chiếm bởi dòng chết mà `VACUUM` chưa thu hồi. `DELETE` không trả lại đĩa; muốn thu hồi thật cần `VACUUM FULL` (khoá bảng) hoặc `pg_repack` (không downtime).

**Transaction ID wraparound** — Postgres đánh số transaction bằng 32 bit; nếu autovacuum không kịp, database **tự dừng ghi** để tự bảo vệ. Giám sát `age(datfrozenxid)`, cảnh báo ở 1 tỷ.

**Prepared statement (câu lệnh tham số hoá)** — Cách chặn SQL injection **duy nhất** đáng tin: cấu trúc câu lệnh được phân tích và chốt **trước**, giá trị gửi **sau** theo đường riêng và không bao giờ được phân tích cú pháp nữa.

**Second-order injection** — Payload được lưu vào database một cách an toàn rồi **nổ ở một query khác** ghép chuỗi. Bài học: dữ liệu đọc từ chính database cũng là dữ liệu không tin cậy.

**Allowlist (danh sách trắng)** — Cách duy nhất xử lý phần không tham số hoá được (`ORDER BY`, tên cột): so với tập giá trị hợp lệ đã định nghĩa sẵn. Escape thủ công là con đường thua cuộc.

**Salt (muối) / Pepper (tiêu)** — *Salt*: chuỗi ngẫu nhiên **riêng từng người**, lưu công khai cạnh hash, làm mỗi mật khẩu thành một bài toán riêng để rainbow table vô dụng. *Pepper*: khoá bí mật **chung**, lưu ngoài database, để kẻ chỉ lấy được database vẫn bó tay.

**Argon2id / bcrypt / scrypt** — Hàm băm **cố tình chậm** cho mật khẩu. SHA-256 sai vì nó nhanh — một GPU chơi game thử 10 tỷ chuỗi/giây. Chỉnh chi phí tới ~0,2 giây mỗi lần kiểm, đo lại sau 1–2 năm.

**Crypto-shredding** — Mã hoá dữ liệu cá nhân bằng khoá riêng từng người; xoá khoá thì dữ liệu trong **mọi backup cũ** vĩnh viễn không giải mã được. Câu trả lời cho vấn đề khó nhất của quyền được lãng quên.

**Row Level Security (RLS)** — Chính sách ở tầng database quyết định mỗi vai trò nhìn thấy dòng nào. Dùng để ép điều kiện "chưa xoá" hoặc cách ly tenant mà không tin vào trí nhớ lập trình viên.

## 12. Kiến trúc và quy mô

**Replication lag (độ trễ sao chép)** — Khoảng thời gian bản sao còn cũ hơn máy chính. **Không phải hằng số** mà là một phân phối có đuôi rất dài, và đuôi xuất hiện đúng giờ cao điểm.

**Read-after-write consistency** — Đảm bảo người dùng luôn đọc được thứ **chính họ vừa ghi**. Chỉ lệnh đọc này mới nguy hiểm; người khác đọc trễ 200 ms thì không sao.

**Monotonic read (đọc đơn điệu)** — Đảm bảo người dùng không bao giờ thấy thời gian đi lùi. Bị vi phạm khi nhiều replica sau load balancer mà không ghim phiên.

**LSN** (*Log Sequence Number*) — Vị trí trong dòng WAL, như số trang của cuốn nhật ký. Ghim theo LSN là cách **chính xác** để đảm bảo read-after-write, thay vì đoán một khoảng thời gian.

**`synchronous_commit`** — Núm điều chỉnh `COMMIT` chờ tới đâu: `off` → `local` → `remote_write` → `on` → `remote_apply`. Bật `remote_apply` cho riêng giao dịch tiền là cách thực dụng.

**Partition pruning (tỉa phân vùng)** — Bước optimizer **loại bỏ** các mảnh không cần nhìn tới. Đây là **toàn bộ giá trị** của partitioning — mất pruning thì partition chỉ còn là gánh nặng.

**Shard key (khoá phân mảnh)** — Cột quyết định mỗi hàng đi về máy nào. Bốn tiêu chí: phân bố đều, có trong hầu hết query, gom được dữ liệu liên quan, **bất biến**. Chọn nhầm gần như phải làm lại toàn bộ cuộc di cư.

**Hot shard (mảnh nóng)** — Một shard gánh phần áp đảo lưu lượng, xoá sạch lợi ích của sharding trong khi vẫn trả đủ chi phí phức tạp.

**Colocation** — Cho các bảng hay đi chung dùng **chung một shard key**, để JOIN và transaction vẫn gọn trong một máy. Mất colocation là mất gần như mọi thứ.

**Virtual shard (mảnh ảo)** — Chia sẵn thành N mảnh **logic** (thường 1024) rồi ánh xạ nhóm mảnh vào từng máy vật lý. Mở rộng chỉ là chuyển một phần mảnh logic, thay vì tính lại `hash % N` và chuyển ~94% dữ liệu.

**Consistent hashing** — Đặt shard và khoá lên một vòng tròn băm để thêm/bớt shard chỉ phải chuyển ~1/N dữ liệu.

**Saga** — Thay thế cho transaction xuyên shard: chia thành các bước cục bộ, mỗi bước có **hành động bù trừ**. Không có atomicity thật, chỉ có nhất quán sau cùng có bù trừ.

**Scatter-gather** — Khi query không có shard key, proxy phải hỏi **mọi** shard rồi gộp kết quả. Đắt gấp N lần.

**CAP / PACELC** — CAP không phải "chọn 2 trong 3": P là bắt buộc, lựa chọn thật là **khi mạng đứt thì chọn C hay A**. PACELC bổ sung: bình thường (Else) thì chọn Latency hay Consistency — đánh đổi xảy ra mỗi giây.

**Eventual consistency (nhất quán sau cùng)** — Nếu ngừng ghi, sau một lúc mọi bản sao sẽ giống nhau. "Một lúc" có thể là 5 ms hoặc 5 giây — và người dùng sống ở *ngay bây giờ*.

**CDC** (*Change Data Capture*) — Đọc WAL của database rồi phát thay đổi sang hệ thống khác (Debezium → Kafka). Cách đúng để đồng bộ nhiều kho, thay cho ghi kép ở tầng ứng dụng.

**N+1 query** — 1 truy vấn cho danh sách + N truy vấn cho từng phần tử, do **lazy loading** của ORM. Vấn đề không phải database mà là **chuyến đi khứ hồi qua mạng** — nên nó không lộ trên localhost.

**Eager loading** — Nạp trước quan hệ trong cùng truy vấn. `select_related` (Django), `includes` (Rails), `with` (Laravel), `JOIN FETCH` (Hibernate).

**Overfetching** — Căn bệnh **ngược lại** của N+1: eager load mọi thứ, đổi 101 query nhanh lấy một query khổng lồ. Quy tắc: viết truy vấn theo **màn hình**, không theo model.

**DataLoader** — Gom các yêu cầu lẻ trong cùng một nhịp event loop thành một truy vấn theo lô. Phải **tạo mới mỗi request**, nếu không cache rò dữ liệu giữa người dùng.

**Connection pool** — Bể kết nối dùng chung. Mỗi kết nối Postgres là một **tiến trình OS** tốn 5–10 MB; tăng `max_connections` thường làm thông lượng **tụt**. Kích thước tối ưu ~2–4× số nhân CPU.

**`FOR UPDATE SKIP LOCKED`** — Bỏ qua dòng đang bị phiên khác khoá thay vì xếp hàng chờ. Chìa khoá để làm hàng đợi bằng PostgreSQL — không có nó thì N worker biến thành 1 worker.

**Dead letter queue (hàng đợi người chết)** — Nơi chứa job thất bại sau N lần thử, kèm tên job, lỗi, và dữ liệu gốc. Tuyệt đối không được im lặng vứt job đi.

**Exponential backoff + jitter** — Thử lại với khoảng cách tăng theo hàm mũ, cộng nhiễu ngẫu nhiên để N worker không cùng thử lại một lúc và đè chết dịch vụ vừa hồi phục.

**Outbox pattern** — Ghi bản ghi nghiệp vụ và message vào **cùng một transaction**, rồi một tiến trình riêng đọc bảng outbox đẩy đi. Giải bài toán ghi kép mà không cần transaction phân tán.

**Livelock** — Ai cũng bận rộn mà không ai tiến được. Xảy ra với khoá lạc quan khi tranh chấp cực cao: hầu hết lần ghi thất bại rồi tất cả cùng thử lại.

**Reservation (giữ chỗ)** — Không trừ kho ngay mà giữ chỗ có **thời hạn**; tồn kho khả dụng = tồn kho vật lý trừ số đang giữ chưa hết hạn. Giải bài toán khách bấm mua rồi bỏ đi.

**Sharded counter (bộ đếm chia mảnh)** — Tách một dòng đếm thành N dòng để giảm tranh chấp N lần. Đánh đổi: đọc tổng phải cộng N dòng, và có thể báo hết hàng khi thực ra vẫn còn.

## Cách dùng từ điển này

- Gặp từ lạ trong bài nào, quay về đây tra rồi đọc tiếp — đừng bỏ qua.
- Trước buổi phỏng vấn, đọc lướt mục 3, 5, 6, 7 — đó là bốn mục có mật độ câu hỏi cao nhất. Nếu ứng tuyển vị trí backend/nền tảng, đọc thêm mục 10, 11, 12.
- Khi trả lời phỏng vấn, dùng **cả thuật ngữ tiếng Anh lẫn giải thích tiếng Việt**: *"Đây là anti-join, tức là lấy những dòng không tìm được cặp bên bảng kia"*. Nói được cả hai cho thấy bạn hiểu chứ không phải học thuộc.

**Quay lại** → [Mục lục series](README.md)
