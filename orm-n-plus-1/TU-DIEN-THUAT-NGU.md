# Từ điển thuật ngữ — N+1, ORM và tầng truy cập dữ liệu

Tra nhanh mọi thuật ngữ xuất hiện trong khoá. Cột **Đọc là** ghi phiên âm gần đúng để bạn nói được trong buổi phỏng vấn mà không ngại.

---

## 1. Khái niệm nền tảng

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **N+1 query problem** | | **Vấn đề N+1** — 1 truy vấn lấy danh sách + N truy vấn cho từng phần tử | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **ORM** (*Object-Relational Mapping*) | o-a-em | **Ánh xạ đối tượng–quan hệ** — biến bảng thành đối tượng | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **JPA** (*Java Persistence API*) | jây-pi-ây | **Chuẩn Java** về lưu trữ đối tượng; Hibernate là bản cài đặt phổ biến nhất | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **Hibernate** | hai-bơ-nết | Thư viện ORM phổ biến nhất của Java, cài đặt chuẩn JPA | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **Entity** | en-ti-ti | **Thực thể** — lớp Java ánh xạ tới một bảng | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **Impedance mismatch** | im-pi-đần | **Lệch trở kháng** — mô hình đối tượng và quan hệ vốn không khớp nhau | [4](04-su-that-ve-orm-trong-production.md) |
| **Leaky abstraction** | li-ki áp-strắc-sần | **Trừu tượng rò rỉ** — lớp che giấu vẫn để chi tiết bên dưới lộ ra | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **Boilerplate** | boi-lơ-plết | **Code lặp khuôn** — dài dòng, lặp lại, không mang logic nghiệp vụ | [4](04-su-that-ve-orm-trong-production.md) |

## 2. Cơ chế nạp dữ liệu

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Lazy loading** | lê-di | **Nạp lười** — chỉ nạp quan hệ khi thật sự chạm vào | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **Eager loading** | i-gơ | **Nạp sớm** — nạp luôn quan hệ ngay từ đầu | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **`FetchType`** | phét-thai | Kiểu nạp: `LAZY` (lười) hoặc `EAGER` (sớm) | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **Proxy** | prốc-xi | **Đối tượng đại diện** — vỏ rỗng, chạm vào mới đi lấy dữ liệu thật | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **Fetch plan** | phét-plan | **Kế hoạch nạp** — danh sách nhánh quan hệ nạp cùng truy vấn | [2](02-bon-cach-khac-phuc-bang-chinh-orm.md) |
| **Hydration** | hai-đrây-sần | **Đổ dữ liệu** từ dòng SQL vào đối tượng Java | [2](02-bon-cach-khac-phuc-bang-chinh-orm.md) |
| **Persistence Context** | pơ-sít-tần | **Ngữ cảnh lưu trữ** — bộ nhớ đệm cấp một, nơi giữ entity đang quản lý | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **Session / `EntityManager`** | | Phiên làm việc với database; vòng đời của Persistence Context | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **`SessionFactory`** | | **Nhà máy phiên** — đối tượng gốc của Hibernate | [8](08-phat-hien-n-cong-1.md) |
| **Dirty checking** | đơ-ti chếch-king | Hibernate **so sánh snapshot** để tự phát hiện entity đã đổi | [4](04-su-that-ve-orm-trong-production.md) |
| **Snapshot** | snáp-sốt | **Bản chụp** trạng thái entity lúc nạp | [3](03-cai-gia-cua-tung-cach.md) |
| **Unit of Work** | | **Đơn vị công việc** — gom mọi thay đổi rồi ghi một lượt lúc commit | [4](04-su-that-ve-orm-trong-production.md) |
| **Optimistic locking** | óp-ti-mít-tíc | **Khoá lạc quan** — dùng cột `@Version` chống ghi đè đồng thời | [4](04-su-that-ve-orm-trong-production.md) |
| **Open Session In View** | | Giữ Persistence Context **mở tới lúc render** — Spring Boot **mặc định bật** | [8](08-phat-hien-n-cong-1.md) |
| **`LazyInitializationException`** | | Lỗi khi chạm quan hệ lazy **ngoài** phạm vi phiên | [8](08-phat-hien-n-cong-1.md) |

## 3. Quan hệ và ánh xạ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **`@OneToMany`** | | Quan hệ **một-nhiều** (một tác giả có nhiều sách). Mặc định **LAZY** | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **`@ManyToOne`** | | Quan hệ **nhiều-một**. ⚠ Mặc định **EAGER** — nguồn N+1 vô hình | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **`@OneToOne`** | | Quan hệ **một-một**. ⚠ Cũng mặc định **EAGER** | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **Bag** | bắc | **Túi** — collection **cho phép trùng** và **không nhớ thứ tự**; `List` không `@OrderColumn` là bag | [3](03-cai-gia-cua-tung-cach.md) |
| **Cascade** | cát-xkết | **Lan truyền** — lưu/xoá cha thì lưu/xoá luôn con | [6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) |
| **`orphanRemoval`** | óc-phần | **Xoá con mồ côi** — gỡ con khỏi collection thì xoá luôn khỏi database | [6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) |
| **Aggregate** | ắc-gri-gợt | **Cụm** — nhóm entity được lưu/đọc như một khối, có một gốc | [6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) |

## 4. Cách chữa N+1 trong ORM

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **JPQL** | jây-pi-kiu-eo | **Ngôn ngữ truy vấn của JPA** — giống SQL nhưng viết trên **entity** | [2](02-bon-cach-khac-phuc-bang-chinh-orm.md) |
| **`JOIN FETCH`** | join phét | Nối bảng **VÀ nạp luôn** vào entity. ⚠ `JOIN` không có `FETCH` = **vẫn N+1** | [2](02-bon-cach-khac-phuc-bang-chinh-orm.md) |
| **`@EntityGraph`** | | **Đồ thị thực thể** — khai fetch plan bằng annotation. Sinh **cùng SQL** với `JOIN FETCH` | [2](02-bon-cach-khac-phuc-bang-chinh-orm.md) |
| **`EntityGraphType.FETCH`** | | Ép mọi nhánh **ngoài** graph về `LAZY` — vô hiệu hoá `EAGER` cứng đầu | [2](02-bon-cach-khac-phuc-bang-chinh-orm.md) |
| **`@BatchSize`** | bát-si-zờ | **Kích thước lô** — gom N lần lazy load thành lô `IN (...)`. **Cách duy nhất không vỡ phân trang** | [2](02-bon-cach-khac-phuc-bang-chinh-orm.md) |
| **`default_batch_fetch_size`** | | Bật `@BatchSize` cho **toàn bộ** ứng dụng. Nên đặt 25–50 | [2](02-bon-cach-khac-phuc-bang-chinh-orm.md) |
| **`DISTINCT` (JPQL)** | đít-tinh | ⚠ Lọc trùng **ở tầng Java**, **không** sinh `SELECT DISTINCT` trong SQL | [2](02-bon-cach-khac-phuc-bang-chinh-orm.md) |

## 5. Cái giá và lỗi thường gặp

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Row multiplication** | rau mun-ti-pli-cây-sần | **Nhân dòng** — JOIN làm bản ghi cha lặp lại theo số con | [3](03-cai-gia-cua-tung-cach.md) |
| **Cartesian product** | ca-tê-di-ần | **Tích Descartes** — `m × n` dòng, không phải `m + n` | [3](03-cai-gia-cua-tung-cach.md) |
| **Fanout** | phen-aoát | **Độ toè** — một dòng cha nở ra bao nhiêu dòng kết quả | [3](03-cai-gia-cua-tung-cach.md) |
| **`MultipleBagFetchException`** | | Lỗi khi `JOIN FETCH` **hai bag** cùng lúc. Nổ **lúc khởi động** — là ân huệ, không phải rào cản | [3](03-cai-gia-cua-tung-cach.md) |
| **`HHH90003004`** | | Cảnh báo Hibernate: **phân trang bị chuyển vào bộ nhớ** — kéo cả bảng về RAM | [3](03-cai-gia-cua-tung-cach.md) |
| **In-memory pagination** | | **Phân trang trong bộ nhớ** — bỏ `LIMIT`, kéo hết về rồi mới cắt | [3](03-cai-gia-cua-tung-cach.md) |
| **`OutOfMemoryError`** | | **Hết heap** — JVM không cấp phát nổi nữa | [3](03-cai-gia-cua-tung-cach.md) |
| **Heap** | híp | **Vùng nhớ động** của JVM | [3](03-cai-gia-cua-tung-cach.md) |
| **OOMKilled** | | Kubernetes **giết pod** vì vượt giới hạn RAM (exit code 137) | [3](03-cai-gia-cua-tung-cach.md) |
| **Plan cache** | plan-két | **Bộ đệm kế hoạch thực thi** của database; `IN` đổi kích thước làm phình | [3](03-cai-gia-cua-tung-cach.md) |

## 6. Công cụ ngoài ORM

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Active Record** | ắc-típ rê-cọt | **Mẫu bản ghi chủ động** — đối tượng **tự** lưu mình: `user.save()` | [4](04-su-that-ve-orm-trong-production.md) |
| **Data Mapper** | đa-ta mắp-pơ | **Mẫu ánh xạ dữ liệu** — có tầng riêng lo lưu: `em.persist(user)` | [4](04-su-that-ve-orm-trong-production.md) |
| **SQL Mapper** | | Bạn viết SQL, thư viện chỉ lo đổ kết quả vào đối tượng (MyBatis, Dapper) | [4](04-su-that-ve-orm-trong-production.md) |
| **Query Builder** | | Viết SQL bằng cú pháp ngôn ngữ, kiểm tra được lúc biên dịch (jOOQ, Kysely) | [4](04-su-that-ve-orm-trong-production.md) |
| **`JdbcTemplate` / `JdbcClient`** | | Lớp Spring bọc JDBC, bỏ phần lặp khuôn. **Đã có sẵn** trong Spring Boot | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **jOOQ** | júc | Query builder Java **type-safe**, sinh code từ lược đồ. Tốn phí với Oracle/SQL Server | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **`MULTISET`** (jOOQ) | mun-ti-sét | Trả về **cây lồng nhau bằng một query**, không nhân dòng | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **MyBatis** | mai-bây-tít | SQL Mapper — SQL sống trong XML riêng. Thống trị ở TQ/HQ/NB | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **`resultMap`** | | Khai báo ánh xạ cột → thuộc tính trong MyBatis | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **Nested resultMap** | nết-tịt | **resultMap lồng** — gom nhiều dòng JOIN thành cây. ✅ Cách đúng | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **Nested select** | | Chạy truy vấn con cho mỗi dòng cha. ❌ **Chính là N+1** | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **`#{}` vs `${}`** | | `#{}` = bind parameter, **an toàn**. `${}` = nối chuỗi, **SQL injection** | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **Spring Data JDBC** | | ORM tối giản — **không lazy loading**, không dirty checking | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **sqlc** | ét-kiu-eo-si | Go: viết `.sql`, sinh ra code Go type-safe. Đang thành mặc định của Go | [4](04-su-that-ve-orm-trong-production.md) |
| **Dapper** | đáp-pơ | .NET: SQL mapper siêu nhẹ. Mẫu "EF Core cho ghi + Dapper cho đọc" | [4](04-su-that-ve-orm-trong-production.md) |
| **Prisma / Drizzle / Kysely** | | Node/TS thế hệ mới — type-safe, ít phép thuật hơn Sequelize/TypeORM | [4](04-su-that-ve-orm-trong-production.md) |
| **Code generation** | | **Sinh code** — đọc lược đồ database rồi tạo sẵn class | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **Type-safe** | thai-xếp | **An toàn kiểu** — sai tên cột bị bắt **lúc biên dịch** | [5](05-khong-dung-orm-thi-dung-gi.md) |

## 7. Projection và DTO

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Projection** | prồ-jếch-sần | **Phép chiếu** — chỉ lấy đúng cột cần | [2](02-bon-cach-khac-phuc-bang-chinh-orm.md) |
| **DTO** (*Data Transfer Object*) | đi-ti-âu | **Đối tượng truyền dữ liệu** — lớp phẳng chỉ chứa field cần | [2](02-bon-cach-khac-phuc-bang-chinh-orm.md) |
| **`record`** | rê-cợt | Kiểu **bất biến** gọn nhẹ của Java 16+ | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **Interface projection** | | Spring Data tạo proxy từ interface getter, không cần constructor | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **`RowMapper`** | rau-mắp-pơ | **Bộ ánh xạ dòng** — hàm biến một dòng `ResultSet` thành đối tượng | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **DAO** (*Data Access Object*) | đi-ây-âu | **Đối tượng truy cập dữ liệu** — lớp chuyên đọc/ghi database | [4](04-su-that-ve-orm-trong-production.md) |

## 8. SQL và database

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **`IN` clause** | in-clo | Mệnh đề `WHERE id IN (1,2,3,...)`. Dùng index tới ~1.000 giá trị | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **`ANY($1)`** | | PostgreSQL: truyền **một mảng** thay danh sách `IN` → **một plan duy nhất** | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **Bind parameter** | bai | **Tham số ràng buộc** — dấu `?` truyền riêng, chống SQL injection | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **Prepared statement** | | **Câu lệnh chuẩn bị sẵn** — phân tích một lần, chạy nhiều lần | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **`EXPLAIN ANALYZE`** | | Lệnh **giải thích kế hoạch thực thi** kèm thời gian thật | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **Index Scan / Seq Scan** | | **Quét theo chỉ mục** / **quét tuần tự cả bảng** | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **Bitmap Index Scan** | | Quét chỉ mục gom thành bitmap rồi mới đọc bảng — kế hoạch của `IN` nhiều giá trị | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **CTE** (*Common Table Expression*) | | **Bảng tạm trong câu lệnh** — `WITH ... AS (...)` | [5](05-khong-dung-orm-thi-dung-gi.md) |
| **Window function** | | **Hàm cửa sổ** — `RANK()`, `LAG()`; **JPQL không hỗ trợ** | [4](04-su-that-ve-orm-trong-production.md) |
| **`pg_stat_statements`** | | Extension PostgreSQL **thống kê mọi câu lệnh**. Sắp theo `total_exec_time` | [8](08-phat-hien-n-cong-1.md) |

## 9. Kiến trúc và quy trình

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **CQRS-lite** | xi-kiu-a-ét-ét | **Tách đọc–ghi nhẹ** — hai tầng truy cập, **một** database. Không phải CQRS đầy đủ | [6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) |
| **Command** | com-mần | **Lệnh** — thao tác **thay đổi** dữ liệu | [6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) |
| **Query** | qua-ri | **Truy vấn** — thao tác **chỉ đọc** | [6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) |
| **`@Transactional(readOnly=true)`** | | Bỏ dirty checking + `SET TRANSACTION READ ONLY` + định tuyến replica | [6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) |
| **Strangler Fig** | strang-lơ | **Mẫu cây bóp nghẹt** — thay thế hệ cũ **từng phần**, không viết lại một lần | [6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) |
| **ADR** (*Architecture Decision Record*) | ây-đi-a | **Bản ghi quyết định kiến trúc** — ghi lại *vì sao* chọn cách này | [6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) |
| **ArchUnit** | ác-kiu-nít | Thư viện viết **test cho kiến trúc** (ai được gọi ai) | [6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) |
| **Fitness function** | phít-nít | **Hàm đo sức khoẻ kiến trúc** — test tự động chống xói mòn | [6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) |
| **Anti-corruption layer** | | **Lớp chống nhiễm** — ngăn mô hình tầng này rò sang tầng khác | [6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) |
| **Bounded context** | bao-nhịt | **Ngữ cảnh giới hạn** — một vùng nghiệp vụ có mô hình riêng | [6](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md) |
| **Schema drift** | ski-ma đríp | **Lệch lược đồ** — code và database không còn khớp nhau | [4](04-su-that-ve-orm-trong-production.md) |

## 10. N+1 qua mạng

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Round-trip / RTT** | rao-trịp | **Chuyến đi khứ hồi** qua mạng — thứ thật sự tốn thời gian | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **I/O-bound** | ai-âu | **Nặng chờ đợi** — nút thắt là chờ mạng/đĩa, không phải CPU | [1](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md) |
| **Resolver** | ri-dôn-vơ | **Hàm giải quyết** — trả giá trị cho **một trường** trong GraphQL | [7](07-n-cong-1-khong-chi-o-database.md) |
| **DataLoader** | đa-ta-lô-đơ | **Bộ nạp gom lô** — hoãn một nhịp, gom hàng đợi, gọi một lần | [7](07-n-cong-1-khong-chi-o-database.md) |
| **Batching** | bát-ching | **Gom lô** — nhóm nhiều yêu cầu thành một | [7](07-n-cong-1-khong-chi-o-database.md) |
| **Bulk endpoint** | bấch | **Điểm cuối gom** — `GET /users?ids=1,2,3`. Phải có giới hạn số ID | [7](07-n-cong-1-khong-chi-o-database.md) |
| **Fan-out** | phen-aoát | **Toè ra** — một request tạo ra nhiều request xuống dưới | [7](07-n-cong-1-khong-chi-o-database.md) |
| **Tail latency** | teo | **Độ trễ đuôi** — p99, p999; phần chậm nhất của phân bố | [7](07-n-cong-1-khong-chi-o-database.md) |
| **Tail latency amplification** | | **Khuếch đại độ trễ đuôi** — gọi 50 lần một dịch vụ p99=200ms → 40% request chậm | [7](07-n-cong-1-khong-chi-o-database.md) |
| **Cascading failure** | | **Sập dây chuyền** — một dịch vụ chết kéo theo cả hệ thống | [7](07-n-cong-1-khong-chi-o-database.md) |
| **Circuit breaker** | | **Cầu dao** — tự ngắt gọi tới dịch vụ đang lỗi | [7](07-n-cong-1-khong-chi-o-database.md) |
| **Retry storm** | | **Bão thử lại** — thử lại hàng loạt làm dịch vụ đang yếu sập hẳn | [7](07-n-cong-1-khong-chi-o-database.md) |
| **Persisted query** | | **Truy vấn đăng ký trước** — client gửi hash; lớp bảo vệ mạnh nhất cho GraphQL | [7](07-n-cong-1-khong-chi-o-database.md) |
| **TLS handshake** | ti-eo-ét | **Bắt tay mã hoá** — tốn nhiều vòng đi lại, lý do lời gọi HTTP đắt | [7](07-n-cong-1-khong-chi-o-database.md) |
| **Connection pool** | | **Bể kết nối** — tập kết nối dùng lại, có số lượng giới hạn | [7](07-n-cong-1-khong-chi-o-database.md) |

## 11. Phát hiện và giám sát

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **`show-sql`** | | Cờ Hibernate **in** SQL. ⚠ In chứ không đếm — không phải công cụ phát hiện | [8](08-phat-hien-n-cong-1.md) |
| **`generate_statistics`** | | Bật **bộ đếm** của Hibernate — đây mới là công cụ phát hiện | [8](08-phat-hien-n-cong-1.md) |
| **`Statistics`** | sờ-tơ-tít-tíc | Bộ thống kê Hibernate: `getPrepareStatementCount()` | [8](08-phat-hien-n-cong-1.md) |
| **datasource-proxy** | | Bọc `DataSource` để **đếm mọi câu lệnh JDBC** — hoạt động với mọi thư viện | [8](08-phat-hien-n-cong-1.md) |
| **p6spy** | pi-síc-spai | Thay driver JDBC để log mọi câu lệnh | [8](08-phat-hien-n-cong-1.md) |
| **Testcontainers** | | Chạy **database thật trong Docker** khi test — thay cho H2 | [8](08-phat-hien-n-cong-1.md) |
| **APM** | ây-pi-em | **Giám sát hiệu năng ứng dụng** (Datadog, New Relic, Elastic APM) | [8](08-phat-hien-n-cong-1.md) |
| **Span** | span | **Đoạn** — một đơn vị công việc trong distributed tracing. 201 span DB = N+1 | [8](08-phat-hien-n-cong-1.md) |
| **Regression test** | ri-gre-sần | **Test hồi quy** — chặn lỗi cũ quay lại | [8](08-phat-hien-n-cong-1.md) |
| **WireMock** | | Giả lập HTTP server trong test — dùng để **đếm số lời gọi mạng** | [7](07-n-cong-1-khong-chi-o-database.md) |

## 12. Phân trang và truy vấn danh sách

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Offset pagination** | óp-sét | **Phân trang theo vị trí** — `LIMIT 20 OFFSET 9740`. Chi phí tăng **tuyến tính** theo số trang | [9](09-bon-bai-toan-doc-kinh-dien.md) |
| **Deep offset** | | **Offset sâu** — trang thứ vài trăm; database vẫn **đọc rồi vứt** hết dòng trước | [9](09-bon-bai-toan-doc-kinh-dien.md) |
| **Keyset pagination / Seek method** | ki-sét / sịc | **Phân trang theo mốc** — `WHERE (created_at, id) < (?, ?)`. Chi phí **hằng số** | [9](09-bon-bai-toan-doc-kinh-dien.md) |
| **Mốc phá hoà** (*tie-breaker*) | | Cột duy nhất thêm vào `ORDER BY`; thiếu nó gây **trùng/mất dòng** giữa các trang | [9](09-bon-bai-toan-doc-kinh-dien.md) |
| **`Specification`** | | API Spring Data dựng **điều kiện động** bằng Java | [9](09-bon-bai-toan-doc-kinh-dien.md) |
| **`EXISTS`** | ếch-dít | Kiểm tra *"có tồn tại dòng nào không"* — **dừng ngay ở dòng đầu** | [9](09-bon-bai-toan-doc-kinh-dien.md) |
| **Semi join** | xê-mi | **Nối một nửa** — kế hoạch tối ưu planner chọn cho `EXISTS`/`IN` | [9](09-bon-bai-toan-doc-kinh-dien.md) |
| **Counter cache** | | **Cột đếm sẵn** trên bảng cha thay cho `COUNT` mỗi lần | [9](09-bon-bai-toan-doc-kinh-dien.md) |
| **Denormalization** | đi-noọc-ma-lai | **Phi chuẩn hoá** — cố ý lặp dữ liệu để đọc nhanh hơn | [9](09-bon-bai-toan-doc-kinh-dien.md) |
| **Materialized view** | ma-tê-ri-ơ-lai | **Khung nhìn vật chất hoá** — kết quả lưu sẵn; `REFRESH CONCURRENTLY` không khoá bảng | [9](09-bon-bai-toan-doc-kinh-dien.md) |

## 13. Export, batch job và consumer

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Cursor** | cơ-xơ | **Con trỏ** — đọc kết quả từng phần. PostgreSQL cần đủ `autoCommit=false` **và** `fetchSize>0` | [9](09-bon-bai-toan-doc-kinh-dien.md) |
| **`fetchSize`** | phét-sai | Số dòng driver JDBC lấy về **mỗi lượt** | [9](09-bon-bai-toan-doc-kinh-dien.md) |
| **Streaming** | strim-ming | **Đọc dòng chảy** — xử lý từng dòng, bộ nhớ hằng số | [9](09-bon-bai-toan-doc-kinh-dien.md) |
| **`RowCallbackHandler`** | | Xử lý **từng dòng** `ResultSet`, không tích luỹ kết quả | [9](09-bon-bai-toan-doc-kinh-dien.md) |
| **Batch job** | bắch | **Tác vụ theo lô** — chạy định kỳ, khối lượng lớn | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **`flush()`** | phờ-lát | **Đẩy** — buộc Hibernate sinh SQL cho thay đổi đang chờ | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **`clear()`** | | **Dọn** Persistence Context. ⚠ Phải gọi **sau** `flush()` | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **`StatelessSession`** | | Phiên Hibernate **không Persistence Context** — không cache, không dirty checking | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **JDBC batch** | | Gửi **nhiều câu lệnh trong một chuyến đi mạng** | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **`hibernate.jdbc.batch_size`** | | Số câu lệnh gom mỗi lô | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **`order_inserts` / `order_updates`** | | Sắp lại câu lệnh **theo bảng** để gom lô được | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **`GenerationType.IDENTITY`** | ai-đen-ti-ti | ID từ cột tự tăng. ⚠ **Vô hiệu hoá batch insert một cách lặng lẽ** | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **`GenerationType.SEQUENCE`** | si-quần | ID từ bộ sinh số — **cấp phát trước được** nên batch insert hoạt động | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **`allocationSize`** | | Số ID lấy trước mỗi lần. ⚠ Phải **khớp `INCREMENT BY`** của sequence | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **Checkpoint** | chéc-poi | **Mốc tiến độ** — lưu `lastProcessedId` để job chạy tiếp khi bị ngắt | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **Consumer lag** | | **Độ tụt hậu** — consumer chậm hơn producer bao nhiêu message | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **`max-poll-records`** | | Số message consumer lấy **mỗi lượt** | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **DLQ** (*Dead Letter Queue*) | | **Hàng đợi thư chết** — nơi chứa message xử lý lỗi | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **Idempotent** | ai-đêm-pô-tần | **Bất biến khi lặp** — bắt buộc vì Kafka giao "ít nhất một lần" | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |

## 14. Nhân bản và độ trễ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Read replica** | rép-li-ca | **Bản sao chỉ đọc** của database | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **Replication lag** | ré-pli-cây-sần | **Độ trễ nhân bản** — replica chậm hơn primary bao lâu | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **Read-after-write** | | **Đọc sau khi ghi** — vừa lưu xong đã đọc lại và thấy dữ liệu cũ | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **Read-your-own-writes** | | Đảm bảo **người ghi luôn thấy thay đổi của chính mình** | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **WAL** (*Write-Ahead Log*) | oa-eo | **Nhật ký ghi trước** — nguồn dữ liệu để replica bắt kịp | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **LSN** (*Log Sequence Number*) | eo-ét-en | **Số thứ tự bản ghi WAL** — dùng để biết replica đã bắt kịp chưa | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |
| **Write affinity** | | **Ghim primary** một khoảng sau khi ghi, để tránh read-after-write | [10](10-ba-bai-toan-ghi-va-van-hanh.md) |

---

## Mười điều dễ nhầm nhất — đọc lại trước khi phỏng vấn

| Nhiều người nghĩ | Sự thật |
|---|---|
| `@ManyToOne` mặc định `LAZY` | ❌ **Mặc định `EAGER`** — gây N+1 không cần vòng lặp |
| `DISTINCT` trong JPQL sinh `SELECT DISTINCT` | ❌ Lọc **ở tầng Java**, DB vẫn trả đủ dòng |
| `JOIN` và `JOIN FETCH` như nhau | ❌ `JOIN` **không nạp dữ liệu** → vẫn N+1 **và** thêm nhân dòng |
| Fetch 2 collection = `m + n` dòng | ❌ Là **`m × n`** — tích Descartes |
| Đổi `List` → `Set` chữa được `MultipleBagFetchException` | ❌ Hết exception nhưng **tích Descartes vẫn xảy ra** |
| Ít query hơn = nhanh hơn | ❌ 1 query kéo 420 KB thua 2 query kéo 130 KB |
| Bỏ ORM là hết N+1 | ❌ MyBatis cũng có N+1; vòng lặp gọi DAO cũng N+1 |
| "ORM không được ưa chuộng" | ⚠ **Đúng ở Go/Rust, sai ở Java/Python/Ruby/PHP** |
| Tìm query **chậm nhất** để tối ưu | ❌ Thủ phạm là câu **nhanh nhất nhưng gọi triệu lần** |
| `show-sql` đủ để phát hiện N+1 | ❌ Nó **in** chứ không **đếm** — dùng test đếm query |
| `OFFSET 9740` là "nhảy tới dòng 9740" | ❌ Là **"đọc 9.760 dòng rồi vứt 9.740"** — chậm gấp 700 lần |
| `COUNT(*)` đọc số đếm lưu sẵn | ❌ PostgreSQL **luôn phải quét** (khác MyISAM của MySQL) |
| `Stream<T>` là đủ để export không OOM | ❌ Persistence Context **vẫn tích luỹ** — phải `clear()`, hoặc bỏ hẳn entity |
| Bật `batch_size` là có batch insert | ❌ **`GenerationType.IDENTITY` vô hiệu hoá nó lặng lẽ** |
| Scale thêm pod thì consumer hết lag | ❌ Pod **vượt số partition** thì ngồi không; nút thắt thường là query/message |
| Định tuyến `readOnly` sang replica là miễn phí | ❌ Gây **read-after-write** — người dùng thấy dữ liệu cũ sau khi lưu |

---

**Về mục lục** → [README khoá học](README.md)
