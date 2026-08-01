# Bài 4: Sự thật về ORM trong production — ai dùng, ai bỏ, và vì sao

Bạn sẽ nghe câu này rất nhiều, trên Reddit, Hacker News, trong nhóm chat công ty, và trong buổi phỏng vấn:

> *"ORM không được ưa chuộng đâu, ở công ty thật người ta viết SQL."*

Và bạn cũng sẽ thấy điều ngược lại: **Spring Data JPA là thư viện Java được tải nhiều nhất**, **Django ORM chạy Instagram**, **Rails Active Record chạy Shopify và GitHub**. Nếu ORM tệ đến vậy, sao những hệ thống lớn nhất thế giới vẫn chạy trên nó?

Cả hai đều đúng. Và hiểu **vì sao cả hai cùng đúng** là thứ phân biệt một lập trình viên 2 năm kinh nghiệm với một người 8 năm.

Bài này trả lời thẳng: **trong production người ta có dùng ORM không, dùng cái gì, và nên làm gì.**

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Active Record** | ắc-típ rê-cọt | **Mẫu bản ghi chủ động** — đối tượng **tự** biết lưu mình: `user.save()` |
| **Data Mapper** | đa-ta mắp-pơ | **Mẫu ánh xạ dữ liệu** — đối tượng "ngu", có tầng riêng lo lưu: `em.persist(user)` |
| **SQL Mapper** | | **Trình ánh xạ SQL** — bạn viết SQL, thư viện chỉ lo đổ kết quả vào đối tượng (MyBatis) |
| **Query Builder** | | **Trình dựng truy vấn** — viết SQL bằng cú pháp ngôn ngữ, kiểm tra được lúc biên dịch (jOOQ) |
| **Type-safe** | thai-xếp | **An toàn kiểu** — sai tên cột/kiểu dữ liệu bị bắt **lúc biên dịch**, không phải lúc chạy |
| **Impedance mismatch** | im-pi-đần | **Lệch trở kháng** — mô hình đối tượng và mô hình quan hệ vốn không khớp nhau |
| **Leaky abstraction** | li-ki | **Trừu tượng rò rỉ** — lớp che giấu vẫn để chi tiết bên dưới lộ ra |
| **CQRS** | | **Tách đọc khỏi ghi** (*Command Query Responsibility Segregation*) |
| **Dirty checking** | | Hibernate **tự phát hiện** entity nào đã đổi để sinh `UPDATE` |
| **Optimistic locking** | óp-ti-mít-tíc | **Khoá lạc quan** — dùng cột `version` chống ghi đè đồng thời |
| **Unit of Work** | | **Đơn vị công việc** — gom mọi thay đổi rồi ghi một lượt lúc commit |
| **Boilerplate** | boi-lơ-plết | **Code lặp khuôn** — code dài dòng, lặp lại, không mang logic nghiệp vụ |
| **Schema drift** | ski-ma đríp | **Lệch lược đồ** — code và database không còn khớp nhau |
| **DAO** (*Data Access Object*) | đi-ây-âu | **Đối tượng truy cập dữ liệu** — lớp chuyên đọc/ghi database |

## Phổ công nghệ: "ORM hay không ORM" là câu hỏi sai

Điều đầu tiên cần sửa: **đây không phải lựa chọn nhị phân**. Nó là một dải liên tục.

```text
KIỂM SOÁT SQL ◄───────────────────────────────────────────► TỐC ĐỘ VIẾT CODE
NHIỀU                                                              NHIỀU

├──────────┬─────────────┬──────────────┬─────────────┬───────────────┤
│ ① JDBC   │ ② SQL       │ ③ QUERY      │ ④ DATA      │ ⑤ ACTIVE      │
│   THUẦN  │   MAPPER    │   BUILDER    │   MAPPER    │   RECORD      │
│          │             │              │   ORM       │   ORM         │
├──────────┼─────────────┼──────────────┼─────────────┼───────────────┤
│ Java:    │ MyBatis     │ jOOQ         │ Hibernate/  │ (ít dùng      │
│ JdbcTemp │             │ QueryDSL     │ JPA         │  trong Java)  │
│          │             │              │             │               │
│ Go:      │ sqlc        │ Squirrel     │ ent, Bun    │ GORM          │
│ database/│ sqlx        │ goqu         │             │               │
│ sql      │             │              │             │               │
│          │             │              │             │               │
│ Node:    │ postgres.js │ Kysely       │ Prisma      │ Sequelize     │
│ pg       │             │ Drizzle      │ MikroORM    │ TypeORM       │
│          │             │ Knex         │             │               │
│          │             │              │             │               │
│ Python:  │ –           │ SQLAlchemy   │ SQLAlchemy  │ Django ORM    │
│ psycopg  │             │ Core         │ ORM         │ Peewee        │
│          │             │              │             │               │
│ .NET:    │ Dapper      │ SqlKata      │ EF Core     │ –             │
│          │             │              │             │               │
│ Rust:    │ sqlx        │ SeaQuery     │ Diesel      │ –             │
│          │             │              │ SeaORM      │               │
│          │             │              │             │               │
│ PHP:     │ PDO         │ –            │ Doctrine    │ Eloquent      │
│          │             │              │             │  (Laravel)    │
├──────────┼─────────────┼──────────────┼─────────────┼───────────────┤
│ SQL do   │ BẠN viết    │ BẠN viết,    │ THƯ VIỆN    │ THƯ VIỆN sinh │
│ bạn viết │ trong XML/  │ nhưng bằng   │ sinh SQL    │ SQL, và đối   │
│ hoàn     │ annotation  │ cú pháp Java │ từ mô hình  │ tượng TỰ lưu  │
│ toàn     │             │ (type-safe)  │ đối tượng   │ chính nó      │
└──────────┴─────────────┴──────────────┴─────────────┴───────────────┘
     ▲                                                          ▲
     │                                                          │
   N+1 KHÔNG TỒN TẠI                              N+1 XẢY RA MẶC ĐỊNH
   (vì bạn thấy mọi query)                        (vì SQL bị giấu đi)
```

**Khi ai đó nói "ORM không được ưa chuộng", họ hầu như luôn nói về cột ⑤ và ④.** Còn cột ② và ③ vẫn là "thư viện truy cập dữ liệu" và cực kỳ phổ biến — chỉ là chúng không giấu SQL đi.

## Câu hỏi thẳng: production có dùng ORM không?

**Có. Rất nhiều. Nhưng gần như không ai dùng nó cho mọi thứ.**

Đây là điều mà cả hai phe tranh cãi trên mạng đều bỏ sót. Thực tế ở các đội có quy mô không phải "dùng ORM" hay "không dùng ORM" — mà là:

```text
   MÔ HÌNH THỰC TẾ PHỔ BIẾN NHẤT: TÁCH ĐỌC KHỎI GHI

   ┌──────────────────────────────────────────────────────────────┐
   │                     TẦNG GHI (WRITE)                          │
   │  Tạo đơn, cập nhật hồ sơ, chuyển tiền, huỷ đơn                │
   │                                                                │
   │  → DÙNG ORM (JPA/Hibernate, EF Core, Django ORM)              │
   │                                                                │
   │  VÌ SAO:                                                       │
   │   · Dirty checking — sửa field, không cần viết UPDATE          │
   │   · Optimistic locking — cột @Version chống ghi đè đồng thời   │
   │   · Cascade — lưu đơn hàng thì lưu luôn dòng hàng              │
   │   · Unit of Work — gom mọi thay đổi, commit một lượt           │
   │   · Ghi thường CHẠM ÍT BẢN GHI → N+1 không phải vấn đề        │
   │   · Logic nghiệp vụ phức tạp → mô hình đối tượng có giá trị    │
   └──────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────┐
   │                     TẦNG ĐỌC (READ)                           │
   │  Danh sách, tìm kiếm, báo cáo, dashboard, export              │
   │                                                                │
   │  → DÙNG SQL TRỰC TIẾP (jOOQ, MyBatis, Dapper, sqlc, native)   │
   │                                                                │
   │  VÌ SAO:                                                       │
   │   · Đọc chiếm 90–99% lưu lượng → đây là chỗ hiệu năng quan trọng│
   │   · Cần JOIN nhiều bảng, GROUP BY, window function             │
   │   · Chỉ cần vài cột → DTO projection, không cần entity         │
   │   · Không cần dirty checking (không sửa gì)                    │
   │   · Muốn NHÌN THẤY SQL để tối ưu và review                     │
   │   · ĐÂY LÀ CHỖ N+1 SINH RA                                     │
   └──────────────────────────────────────────────────────────────┘
```

Cách chia này thường được gọi là **CQRS nhẹ** (*CQRS-lite*). Nó không đòi hai database, không đòi event sourcing, không đòi kiến trúc phức tạp — chỉ là **hai tầng truy cập dữ liệu trong cùng một ứng dụng**, mỗi tầng dùng công cụ phù hợp.

```text
   ┌──────────────────────────────────────────────────┐
   │                  Controller                       │
   └───────────┬──────────────────────┬───────────────┘
               │                      │
     ┌─────────▼────────┐   ┌─────────▼────────────┐
     │  CommandService  │   │    QueryService      │
     │  @Transactional  │   │  @Transactional(     │
     │                  │   │     readOnly = true) │
     └─────────┬────────┘   └─────────┬────────────┘
               │                      │
     ┌─────────▼────────┐   ┌─────────▼────────────┐
     │  JpaRepository   │   │  jOOQ / MyBatis /    │
     │  (entity)        │   │  JdbcTemplate        │
     │                  │   │  → trả DTO           │
     └─────────┬────────┘   └─────────┬────────────┘
               │                      │
               └──────────┬───────────┘
                          ▼
                    ┌──────────┐
                    │ Database │     ← MỘT database duy nhất
                    └──────────┘
```

> **Đây là câu trả lời cho câu hỏi "nên làm gì nhất".** Không phải bỏ ORM. Không phải dùng ORM cho tất cả. Mà là **dùng ORM cho ghi, SQL cho đọc**. Bài 6 sẽ hướng dẫn cách triển khai và cách chuyển đổi dần.

## Mổ xẻ câu "ORM không được ưa chuộng"

Câu này đúng **một phần**, và phần đúng đó rất cụ thể. Hãy tách nó ra.

### Phần ĐÚNG — bốn lý do thật, đã kiểm chứng qua nhiều dự án

**① SQL bị giấu đi khiến hiệu năng không thể review**

```java
// Đọc dòng này, KHÔNG AI biết nó sinh ra SQL gì:
List<Order> orders = orderRepository.findByStatusAndCreatedAtBetween(
        OrderStatus.PENDING, from, to);
```

```text
   Nó có dùng index không?  → không biết
   Nó JOIN mấy bảng?         → không biết
   Nó chạy mấy query?        → không biết
   Nó kéo bao nhiêu cột?     → TẤT CẢ, kể cả cột TEXT 4 KB không dùng

   → CODE REVIEW KHÔNG THỂ BẮT LỖI HIỆU NĂNG.
     Bạn chỉ biết khi production chậm.

   Với SQL viết tay, người review NHÌN THẤY câu lệnh và bắt được ngay.
```

**② Chi phí học không biến mất — nó chỉ chuyển chỗ**

```text
   LỜI HỨA CỦA ORM: "bạn không cần biết SQL".
   THỰC TẾ: bạn phải biết SQL, CỘNG THÊM:

      · vòng đời entity (transient/managed/detached/removed)
      · Persistence Context và bộ nhớ đệm cấp một
      · flush mode, cascade type, orphanRemoval
      · fetch strategy, @BatchSize, EntityGraph
      · dirty checking và khi nào nó KHÔNG chạy
      · LazyInitializationException và open-in-view
      · equals()/hashCode() trên entity
      · MultipleBagFetchException, HHH90003004

   → Bạn học SQL để hiểu chuyện gì đang xảy ra,
     rồi học thêm cả một hệ thống khái niệm để điều khiển ORM.

   Đây là lập luận mạnh nhất chống lại ORM, và nó ĐÚNG.
```

**③ Có một trần hiệu năng mà ORM không vượt qua được**

```sql
-- Báo cáo doanh thu theo tháng, có xếp hạng và so sánh kỳ trước.
-- Viết bằng SQL: 25 dòng, chạy 80 ms.
SELECT
    date_trunc('month', o.created_at)                        AS thang,
    SUM(oi.quantity * oi.unit_price)                         AS doanh_thu,
    LAG(SUM(oi.quantity * oi.unit_price)) OVER (ORDER BY 1)  AS thang_truoc,
    RANK() OVER (ORDER BY SUM(oi.quantity * oi.unit_price) DESC) AS xep_hang
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status = 'COMPLETED'
GROUP BY 1;
```

```text
   VIẾT BẰNG JPQL/CRITERIA API:
      · Window function (LAG, RANK) → JPQL KHÔNG hỗ trợ
      · Phải dùng native query → mất hết lợi ích type-safe của ORM
      · Hoặc kéo dữ liệu về Java rồi tính → chậm hàng chục lần

   → Với BÁO CÁO và PHÂN TÍCH, ORM không chỉ bất tiện — nó BẤT LỰC.
```

**④ Mô hình đối tượng và mô hình quan hệ vốn không khớp**

```text
   ĐÂY LÀ "IMPEDANCE MISMATCH" — VẤN ĐỀ GỐC RỄ, KHÔNG THỂ SỬA:

   Đối tượng                    Bảng quan hệ
   ─────────────────            ────────────────
   Kế thừa (inheritance)   ↔    KHÔNG CÓ khái niệm này
   Tham chiếu, đồ thị      ↔    Khoá ngoại, tập hợp
   Định danh = địa chỉ     ↔    Định danh = khoá chính
   Duyệt bằng con trỏ      ↔    Duyệt bằng JOIN
   Đóng gói (private)      ↔    Mọi cột đều công khai

   → ORM là một CẦU NỐI giữa hai thế giới khác nhau.
     Mọi cầu nối đều có chỗ rung lắc. N+1 là một chỗ rung.
```

### Phần SAI hoặc bị phóng đại — bốn ngộ nhận

**① "Công ty lớn không dùng ORM"**

Sai rõ ràng. Một số hệ thống có lưu lượng lớn nhất thế giới chạy trên ORM:

```text
   · Instagram          → Django ORM (Python), hàng tỉ request/ngày
   · Shopify            → Rails Active Record, xử lý Black Friday
   · GitHub             → Rails Active Record
   · Basecamp / HEY     → Rails Active Record
   · Rất nhiều ngân hàng, bảo hiểm, ERP → Hibernate/JPA
   · Phần lớn hệ thống .NET doanh nghiệp → Entity Framework Core

   ĐIỀU HỌ CÙNG LÀM: dùng ORM cho phần lớn code,
   rồi TỤT XUỐNG SQL THUẦN ở những đường nóng nhất.

   → Không phải "bỏ ORM". Là "biết khi nào bước ra khỏi nó".
```

**② "ORM chậm"**

```text
   ORM KHÔNG chậm. SQL mà ORM SINH RA thường tốt.

   Cái chậm là CÁCH DÙNG:
      · N+1 do lazy loading (bài 1–3)
      · SELECT * khi chỉ cần 2 cột
      · Nạp cả entity khi chỉ cần đọc
      · Persistence Context phình to trong batch job

   Overhead thuần của Hibernate so với JDBC thuần thường ở mức
   vài phần trăm cho truy vấn đơn giản — nhỏ hơn NHIỀU so với
   một chuyến đi mạng thừa.

   → Vấn đề là ORM khiến việc dùng SAI trở nên DỄ DÀNG và VÔ HÌNH.
```

**③ "Dùng SQL thuần thì không bao giờ có N+1"**

```java
// SQL thuần, không ORM nào cả — và vẫn N+1
for (Order order : orderDao.findAll()) {
    List<OrderItem> items = itemDao.findByOrderId(order.getId());   // ☠ N query
    order.setItems(items);
}
```

```text
   N+1 KHÔNG PHẢI LỖI CỦA ORM. Nó là lỗi của MẪU TRUY CẬP.
   ORM chỉ làm nó DỄ XẢY RA VÀ KHÓ THẤY hơn.

   Khác biệt thật sự:
      ORM      → N+1 xảy ra khi bạn KHÔNG viết gì (lazy loading tự chạy)
      SQL thuần → N+1 xảy ra khi bạn CỐ TÌNH viết vòng lặp

   Cái thứ hai lộ ra trong code review. Cái thứ nhất thì không.
```

**④ "Phe chống ORM là số đông"**

```text
   Tiếng nói to nhất trên mạng đến từ:
      · Cộng đồng Go và Rust      → ưa viết tay, coi ORM là "phép thuật"
      · Kỹ sư hệ thống quy mô lớn → đã chạm trần hiệu năng của ORM
      · Người viết blog kỹ thuật  → bài "vì sao tôi bỏ ORM" có nhiều lượt đọc

   Trong khi ĐA SỐ THẦM LẶNG vẫn dùng ORM hằng ngày và không viết blog:
      · Đội sản phẩm 3–15 người
      · Công ty phần mềm doanh nghiệp
      · Outsourcing, gia công
      · Startup cần ra tính năng nhanh

   → THIÊN LỆCH LẤY MẪU. Người hài lòng không lên mạng nói mình hài lòng.
```

## Bức tranh theo từng hệ sinh thái — đây là chỗ khác biệt thật sự

Đây là phần trả lời chính xác nhất cho câu hỏi *"người ta thường dùng gì"*, vì câu trả lời **phụ thuộc mạnh vào ngôn ngữ**.

### Java — ORM thống trị, nhưng có hai dòng chảy ngược mạnh

```text
   ┌────────────────────────────────────────────────────────────────┐
   │ Spring Data JPA (Hibernate)                        THỐNG TRỊ   │
   │   → Mặc định của gần như mọi dự án Spring Boot mới             │
   │   → Là thứ được hỏi trong 90% buổi phỏng vấn Java ở VN         │
   │                                                                 │
   │ MyBatis                                           RẤT MẠNH     │
   │   → Cực kỳ phổ biến ở Trung Quốc, Hàn Quốc, Nhật Bản           │
   │   → Ở VN: phổ biến trong dự án gia công cho khách Nhật/Hàn     │
   │   → Ưa dùng trong fintech, ngân hàng lõi, hệ thống báo cáo     │
   │                                                                 │
   │ jOOQ                                              ĐANG LÊN     │
   │   → Lựa chọn của đội coi SQL là kỹ năng cốt lõi                │
   │   → Bản thương mại tốn phí cho DB đóng (Oracle, SQL Server);   │
   │      MIỄN PHÍ cho PostgreSQL, MySQL, MariaDB                   │
   │                                                                 │
   │ Spring Data JDBC                                  NGÁCH        │
   │   → ORM tối giản, không lazy loading, không dirty checking     │
   │   → "JPA nhưng bỏ hết phần phức tạp"                           │
   │                                                                 │
   │ JdbcTemplate                                      LUÔN CÓ MẶT  │
   │   → Gần như mọi dự án JPA đều có vài chỗ dùng nó               │
   └────────────────────────────────────────────────────────────────┘
```

**Điểm quan trọng cho người Việt đi phỏng vấn:** trong thị trường Việt Nam, **Spring Data JPA vẫn là thứ bạn bắt buộc phải biết**, còn MyBatis là điểm cộng lớn nếu công ty làm dự án Nhật/Hàn hoặc fintech. Nói "em không dùng ORM vì nó tệ" trong phỏng vấn là câu trả lời **trừ điểm** — nói "em dùng JPA cho ghi và jOOQ/MyBatis cho các màn hình đọc nặng" là câu trả lời **cộng điểm**.

### Go — hệ sinh thái thật sự KHÔNG chuộng ORM

Đây là nơi câu nói ở đầu bài đúng nhất.

```text
   TRIẾT LÝ CỦA GO: "rõ ràng hơn ngắn gọn" (explicit over implicit).

   · database/sql   → thư viện chuẩn, ai cũng dùng
   · sqlc           → ĐANG THÀNH MẶC ĐỊNH.
                      Bạn viết file .sql, nó SINH RA code Go type-safe.
                      Không phép thuật lúc chạy, thấy hết SQL.
   · sqlx           → mở rộng nhẹ của database/sql
   · pgx            → driver PostgreSQL hiệu năng cao
   · GORM           → ORM đầy đủ, phổ biến nhưng bị cộng đồng
                      phê phán nhiều nhất về hiệu năng và magic

   → Ở Go, "viết SQL tay" là MẶC ĐỊNH VĂN HOÁ, không phải lựa chọn nâng cao.
```

### Node/TypeScript — làn sóng rời bỏ ORM truyền thống

```text
   THẾ HỆ CŨ (đang thoái trào):
      Sequelize, TypeORM
      → nhiều phàn nàn về bảo trì, kiểu dữ liệu yếu, migration khó

   THẾ HỆ MỚI (đang lên nhanh):
      · Prisma  → schema riêng + sinh client type-safe.
                  Đáng chú ý: Prisma CỐ TÌNH KHÔNG có lazy loading
                  → N+1 khó xảy ra hơn về mặt thiết kế
      · Drizzle → "SQL nhưng viết bằng TypeScript", rất mỏng
      · Kysely  → query builder thuần type-safe

   → XU HƯỚNG RÕ: rời bỏ ORM-giấu-SQL, chuyển sang
     QUERY BUILDER TYPE-SAFE. Giữ an toàn kiểu, bỏ phép thuật.
```

### Python và Ruby — ORM vẫn là trung tâm

```text
   Python:
      Django ORM     → mặc định tuyệt đối trong Django
      SQLAlchemy     → mạnh và linh hoạt; có CẢ HAI tầng:
                        · ORM (cao cấp)
                        · Core (query builder, gần SQL)
                       → nhiều đội chỉ dùng Core cho phần đọc

   Ruby:
      Active Record  → không có đối thủ thực sự trong Rails
      → Rails coi ORM là một phần của framework, không tách rời được

   → Ở hai hệ sinh thái này, "bỏ ORM" gần như đồng nghĩa "bỏ framework".
     Nên câu trả lời của họ là: DÙNG ORM, và tụt xuống SQL thuần
     ở đúng những chỗ cần (Django có .raw(), SQLAlchemy có text()).
```

### .NET, PHP, Rust

```text
   .NET:  EF Core (ORM) chiếm đa số, NHƯNG Dapper (SQL mapper, siêu nhẹ)
          cực kỳ phổ biến cho phần đọc. Mẫu "EF Core cho ghi + Dapper cho đọc"
          là kiến trúc RẤT PHỔ BIẾN trong thế giới .NET — chính là CQRS-lite.

   PHP:   Eloquent (Laravel, Active Record) thống trị;
          Doctrine (Data Mapper) cho hệ thống doanh nghiệp lớn.

   Rust:  sqlx (SQL viết tay, KIỂM TRA LÚC BIÊN DỊCH bằng cách
          kết nối DB thật khi build) là lựa chọn phổ biến nhất.
          Diesel/SeaORM có nhưng ít hơn.
          → Rust cũng nghiêng về "viết SQL" như Go.
```

### Tổng kết bức tranh

| Hệ sinh thái | Mặc định thực tế | Xu hướng | "Không dùng ORM" đúng tới đâu? |
|---|---|---|---|
| **Java** | Spring Data JPA | Thêm jOOQ/MyBatis cho tầng đọc | ❌ ORM vẫn thống trị |
| **Go** | `database/sql`, sqlc | Rời xa GORM | ✅ **Đúng — văn hoá viết SQL** |
| **Rust** | sqlx | Ổn định | ✅ **Đúng** |
| **Node/TS** | Đang chuyển | Prisma, Drizzle, Kysely | ⚠ Đúng với ORM **cũ** |
| **Python** | Django ORM / SQLAlchemy | Ổn định | ❌ Sai |
| **Ruby** | Active Record | Ổn định | ❌ Sai |
| **.NET** | EF Core + Dapper | CQRS-lite phổ biến | ⚠ Nửa đúng |
| **PHP** | Eloquent / Doctrine | Ổn định | ❌ Sai |

> **Kết luận thẳng:** câu *"ORM không được ưa chuộng"* **đúng ở Go và Rust**, **đúng một nửa ở Node và .NET**, và **sai ở Java, Python, Ruby, PHP**. Nếu bạn nghe câu đó mà không hỏi *"trong hệ sinh thái nào?"* thì bạn đang nghe một nửa sự thật.

## Vì sao ORM vẫn tồn tại — sáu thứ nó làm mà SQL tay không làm

Để công bằng với ORM, đây là những thứ bạn **mất** khi bỏ nó:

```java
// ① DIRTY CHECKING — không phải viết UPDATE
@Transactional
public void doiTen(Long id, String ten) {
    Author a = repo.findById(id).orElseThrow();
    a.setName(ten);
    // KHÔNG có repo.save(). Hibernate tự so sánh snapshot và sinh:
    // UPDATE authors SET name=? WHERE id=?
    // VÀ nó chỉ update ĐÚNG CỘT ĐÃ ĐỔI (nếu bật @DynamicUpdate)
}
```

```java
// ② OPTIMISTIC LOCKING — chống ghi đè đồng thời, gần như miễn phí
@Entity
public class Account {
    @Version
    private Long version;     // ← một dòng
}
// UPDATE accounts SET balance=?, version=version+1 WHERE id=? AND version=?
// Nếu affected rows = 0 → OptimisticLockException → người kia đã sửa trước
// Viết tay điều này ĐÚNG ở mọi đường code là việc rất dễ sai.
```

```java
// ③ CASCADE + UNIT OF WORK — lưu đồ thị đối tượng trong một transaction
@Transactional
public void taoDon(OrderRequest req) {
    Order order = new Order(req.customerId());
    req.items().forEach(i -> order.addItem(new OrderItem(i.sku(), i.qty())));
    orderRepository.save(order);
    // → 1 INSERT orders + N INSERT order_items, gom thành BATCH,
    //   đúng thứ tự khoá ngoại, rollback trọn vẹn nếu lỗi.
}
```

```text
   ④ THAM SỐ HOÁ TỰ ĐỘNG → CHỐNG SQL INJECTION MẶC ĐỊNH
      Mọi truy vấn ORM đều dùng prepared statement.
      Với SQL viết tay, nối chuỗi một lần là thủng.

   ⑤ ÁNH XẠ KIỂU DỮ LIỆU
      enum, JSON, UUID, timestamp có múi giờ, kiểu tự định nghĩa
      → ORM lo hết. Viết tay là hàng trăm dòng chuyển đổi lặp đi lặp lại.

   ⑥ TÍCH HỢP HỆ SINH THÁI
      Spring Data: phân trang, sorting, auditing (@CreatedBy, @LastModifiedDate),
      soft delete, multi-tenancy, second-level cache, event listener.
      Bỏ ORM là tự viết lại từng thứ.
```

```text
   ⚠ ĐIỀU QUAN TRỌNG NHẤT CẦN NHẬN RA:

   SÁU THỨ TRÊN ĐỀU THUỘC VỀ TẦNG GHI.
   KHÔNG CÓ THỨ NÀO THUỘC VỀ TẦNG ĐỌC.

   → Đó chính là lý do mô hình "ORM cho ghi, SQL cho đọc"
     không phải thoả hiệp — nó là KẾT LUẬN LOGIC.
```

## Bảng quyết định: đội của bạn nên dùng gì

| Bối cảnh | Nên dùng | Vì sao |
|---|---|---|
| Startup < 10 người, đang tìm product-market fit | **ORM đầy đủ** + `default_batch_fetch_size` | Tốc độ ra tính năng quan trọng hơn hiệu năng. Tối ưu sau. |
| Sản phẩm ổn định, 10–50 kỹ sư | **ORM cho ghi + SQL cho đọc** | Đã biết màn hình nào nóng. Đây là điểm ngọt. |
| Hệ thống báo cáo / BI / phân tích | **SQL thuần, KHÔNG entity** | Window function, CTE, GROUP BY phức tạp — ORM bất lực. |
| Fintech, ngân hàng lõi, thanh toán | **SQL rõ ràng (MyBatis/jOOQ)** cho hầu hết | Cần audit từng câu lệnh, cần kiểm soát khoá và thứ tự. |
| CRUD nội bộ, admin panel | **ORM đầy đủ** | Lưu lượng thấp, tốc độ phát triển là tất cả. |
| Microservice lưu lượng rất cao, ít bảng | **sqlc / jOOQ / SQL tay** | Mô hình dữ liệu đơn giản, ORM chỉ thêm gánh nặng. |
| Nghiệp vụ phức tạp, nhiều quy tắc (bảo hiểm, ERP) | **ORM (Data Mapper)** | Mô hình đối tượng phong phú thật sự có giá trị ở đây. |
| Đội mới, ít kinh nghiệm SQL | **ORM + code review nghiêm** | Với SQL tay, đội thiếu kinh nghiệm sẽ tạo lỗ hổng tệ hơn N+1. |
| Batch job xử lý hàng triệu bản ghi | **JDBC batch / SQL thuần** | Persistence Context phình to → OOM. ORM sai chỗ này. |

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Trong buổi phỏng vấn, người phỏng vấn hỏi: *"Em nghĩ sao về ý kiến ORM không nên dùng trong production?"*

**Đây là câu hỏi bẫy phổ biến.** Nó không kiểm tra bạn thuộc phe nào — nó kiểm tra bạn có **suy nghĩ theo bối cảnh** hay chỉ nhắc lại ý kiến trên mạng.

```text
   ❌ TRẢ LỜI TRỪ ĐIỂM:
      "Đúng ạ, ORM chậm và tạo N+1 nên em luôn viết SQL tay."
      → Lộ ra: học vẹt, chưa từng chịu trách nhiệm bảo trì hệ thống lớn,
        không biết ORM giải quyết gì ở tầng ghi.

   ❌ TRẢ LỜI TRỪ ĐIỂM (chiều ngược lại):
      "Không, ORM tốt mà, Hibernate lo hết rồi ạ."
      → Lộ ra: chưa từng gặp sự cố hiệu năng thật.

   ✅ TRẢ LỜI CỘNG ĐIỂM: (xem phần Câu hỏi phỏng vấn bên dưới)
```

> **Tình huống 2:** Đội bạn đang tranh cãi: một nửa muốn bỏ JPA chuyển sang jOOQ vì "JPA gây N+1 suốt", nửa kia phản đối vì "viết lại hết thì mất 6 tháng".

**Chẩn đoán — cả hai bên đang tranh luận sai vấn đề. Hãy lấy số liệu trước:**

```sql
-- ① Vấn đề thật sự lớn tới đâu? Đo bằng dữ liệu, không bằng cảm giác.
SELECT calls,
       round((total_exec_time/1000)::numeric)          AS tong_giay,
       round(mean_exec_time::numeric, 2)               AS tb_ms,
       round(100 * total_exec_time
             / sum(total_exec_time) OVER ()::numeric, 1) AS phan_tram,
       left(query, 60)                                  AS cau_lenh
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

```text
   KẾT QUẢ THỰC TẾ Ở ĐA SỐ HỆ THỐNG:

   phan_tram | cau_lenh
   ----------+------------------------------------------
      41.2   | select ... from order_items where order_id = $1   ← N+1
      18.7   | select ... from products where category_id = $1   ← N+1
       9.1   | select ... from orders where status = $1
       ...

   → 60% thời gian database đến từ CHƯA TỚI 5 TRUY VẤN.

   Bạn KHÔNG cần viết lại 400 repository.
   Bạn cần sửa 5 chỗ.
```

**Cách xử lý — đề xuất trung dung, đo được, không phải cãi nhau:**

```text
   BƯỚC 1 (1 ngày): bật lưới an toàn toàn cục
      hibernate.default_batch_fetch_size=25
      → Đo lại. Thường giảm 30–60% thời gian database ngay lập tức,
        KHÔNG sửa một dòng code nào.

   BƯỚC 2 (1 tuần): thêm test đếm query cho 10 API nóng nhất (bài 8)
      → Chặn N+1 mới, không cần đổi công nghệ.

   BƯỚC 3 (2 tuần): viết lại ĐÚNG 5 truy vấn nóng nhất bằng jOOQ/JdbcTemplate
      → Giữ nguyên JPA cho 395 chỗ còn lại.
      → Đây là nơi đội học jOOQ với rủi ro thấp.

   BƯỚC 4 (liên tục): mọi màn hình đọc MỚI viết bằng tầng query riêng.
      → Codebase tự chuyển dịch dần, không cần dự án "viết lại 6 tháng".

   → SAU 3 THÁNG bạn có kiến trúc CQRS-lite mà không có
     một sprint nào dành riêng cho việc "chuyển công nghệ".
```

**Chặn tái diễn — biến quyết định thành quy tắc viết ra:**

```markdown
<!-- docs/adr/007-chien-luoc-truy-cap-du-lieu.md -->
# ADR-007: Chiến lược truy cập dữ liệu

## Quyết định
- Tầng GHI: Spring Data JPA (entity, @Transactional, @Version).
- Tầng ĐỌC đơn giản (CRUD, form): Spring Data JPA + DTO projection.
- Tầng ĐỌC phức tạp (danh sách, báo cáo, dashboard): jOOQ trả DTO.
- Batch > 10.000 bản ghi: JdbcTemplate batch update.

## Quy tắc bắt buộc
- Mọi @ManyToOne/@OneToOne phải khai fetch = LAZY (ArchUnit kiểm tra).
- default_batch_fetch_size = 25.
- Mọi API danh sách phải có test đếm query.
- Không trả entity ra khỏi tầng service.
```

> **Tình huống 3:** Bạn vào công ty mới, codebase dùng MyBatis, và bạn chỉ biết JPA. Bạn thấy khó chịu vì "phải viết SQL tay cho cả CRUD".

**Chẩn đoán:** đây không phải vấn đề kỹ thuật mà là vấn đề **hiểu bối cảnh quyết định**. Hãy tìm hiểu vì sao trước khi đề xuất đổi.

```text
   NHỮNG LÝ DO CHÍNH ĐÁNG KHIẾN MỘT ĐỘI CHỌN MYBATIS:

   ① Khách hàng Nhật/Hàn yêu cầu — đây là chuẩn ở thị trường đó
   ② Database có sẵn, thiết kế không theo chuẩn ORM
      (khoá chính tổ hợp, tên cột lạ, không có FK, view phức tạp)
   ③ Yêu cầu audit: mọi câu SQL phải review được bởi DBA
   ④ Đội có DBA mạnh, muốn kiểm soát mọi truy vấn
   ⑤ Hệ thống chủ yếu là BÁO CÁO → ORM không phù hợp từ đầu

   → Nếu là lý do ②③④⑤, việc đổi sang JPA sẽ LÀM TỆ ĐI, không tốt lên.
```

**Cách xử lý — học điểm mạnh của MyBatis thay vì chống lại nó:**

```xml
<!-- MyBatis giải quyết N+1 bằng đúng pattern ở bài 2 cách ④ -->
<resultMap id="authorWithBooks" type="Author">
    <id property="id" column="id"/>
    <result property="name" column="name"/>
    <!-- fetchType="lazy" + select riêng → nhưng CÓ THỂ dính N+1 -->
    <collection property="books" ofType="Book"
                select="selectBooksByAuthorId" column="id"/>
</resultMap>
```

```text
   ⚠ QUAN TRỌNG: MYBATIS CŨNG CÓ N+1!

   <collection select="..."> chạy MỘT query cho MỖI tác giả
   → chính xác là N+1, chỉ khác là BẠN NHÌN THẤY NÓ TRONG XML.

   Đây là điểm khác biệt cốt lõi giữa hai triết lý:
      JPA     → N+1 xảy ra VÔ HÌNH
      MyBatis → N+1 xảy ra KHI BẠN VIẾT RA NÓ, và nó nằm ngay trước mắt
```

**Cách chữa N+1 trong MyBatis — dùng nested resultMap thay vì nested select:**

```xml
<!-- ✅ MỘT query, tự gom nhóm bằng resultMap lồng nhau -->
<select id="selectAuthorsWithBooks" resultMap="authorWithBooks">
    SELECT a.id, a.name, b.id AS b_id, b.title AS b_title
    FROM authors a LEFT JOIN books b ON b.author_id = a.id
</select>

<resultMap id="authorWithBooks" type="Author">
    <id property="id" column="id"/>
    <result property="name" column="name"/>
    <collection property="books" ofType="Book">   <!-- KHÔNG có select= -->
        <id property="id" column="b_id"/>
        <result property="title" column="b_title"/>
    </collection>
</resultMap>
```

Bài 5 sẽ đi sâu vào MyBatis, jOOQ và các công cụ còn lại.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Coi "ORM hay không ORM" là câu hỏi nhị phân | Bỏ lỡ đáp án đúng: **dùng cả hai, đúng chỗ** | Nghĩ theo phổ 5 mức |
| Nghe "ORM không được ưa chuộng" không hỏi hệ sinh thái nào | Áp kết luận của Go vào dự án Java | Đúng ở Go/Rust, sai ở Java/Python/Ruby |
| Bỏ ORM để "hết N+1" | N+1 **vẫn xảy ra** với SQL tay nếu viết vòng lặp | N+1 là lỗi **mẫu truy cập**, không phải lỗi ORM |
| Dùng ORM cho báo cáo, dashboard | Window function, CTE → ORM bất lực | Tầng đọc dùng SQL thuần |
| Dùng SQL tay cho tầng ghi phức tạp | Mất dirty checking, `@Version`, cascade, Unit of Work | Giữ ORM cho ghi |
| Đề xuất "viết lại toàn bộ sang jOOQ" | 6 tháng không ra tính năng, rủi ro cao | Chuyển dần từ 5 truy vấn nóng nhất |
| Chê ORM trong phỏng vấn | Bị đánh giá học vẹt | Trả lời theo bối cảnh |
| Nghĩ MyBatis miễn nhiễm N+1 | `<collection select=...>` chính là N+1 | Dùng nested resultMap |
| Dùng ORM cho batch triệu bản ghi | Persistence Context phình → OOM | JDBC batch |
| Bỏ ORM khi đội yếu SQL | Lỗ hổng injection và query tệ còn nguy hiểm hơn N+1 | Nâng năng lực trước, đổi công nghệ sau |

## Câu hỏi phỏng vấn hay gặp

**H: Trong production có nên dùng ORM không?**
Có, nhưng gần như không ai dùng nó cho mọi thứ. Mô hình em thấy hiệu quả nhất và cũng phổ biến nhất ở các đội có quy mô là **tách đọc khỏi ghi**: dùng ORM cho tầng ghi vì nó cho dirty checking, optimistic locking bằng `@Version`, cascade và Unit of Work — những thứ viết tay rất dễ sai; còn tầng đọc, nhất là danh sách và báo cáo, thì viết SQL trực tiếp trả về DTO. Lý do rất rõ ràng: mọi lợi ích lớn của ORM đều nằm ở tầng ghi, còn mọi vấn đề hiệu năng — kể cả N+1 — đều nằm ở tầng đọc.

**H: Em nghĩ sao về ý kiến "ORM không được ưa chuộng"?**
Em nghĩ câu đó đúng nhưng cần hỏi lại là **trong hệ sinh thái nào**. Ở Go và Rust thì đúng — viết SQL tay là mặc định văn hoá, `sqlc` và `sqlx` phổ biến hơn ORM nhiều. Ở Node thì đúng một nửa: Sequelize và TypeORM đang thoái trào, nhưng thay thế chúng là Prisma và Drizzle — vẫn là công cụ type-safe chứ không phải quay về SQL thuần. Còn ở Java, Python, Ruby, PHP thì ORM vẫn thống trị: Instagram chạy Django ORM, Shopify và GitHub chạy Active Record. Điều những hệ thống lớn đó cùng làm không phải "bỏ ORM" mà là **biết khi nào bước ra khỏi nó**. Em cũng nghĩ có thiên lệch lấy mẫu ở đây: bài "vì sao tôi bỏ ORM" có nhiều lượt đọc, còn người dùng ORM hài lòng thì không viết blog.

**H: Bỏ ORM có hết N+1 không?**
Không. N+1 là lỗi của **mẫu truy cập dữ liệu**, không phải lỗi của ORM — viết vòng lặp gọi `itemDao.findByOrderId()` bằng JDBC thuần thì vẫn N+1 y hệt. Khác biệt thật sự là **mức độ nhìn thấy**: với ORM, N+1 xảy ra khi bạn **không viết gì cả**, vì lazy loading tự chạy; với SQL tay, nó chỉ xảy ra khi bạn **cố tình viết vòng lặp**, và cái đó lộ ra trong code review. Nên bỏ ORM không xoá được vấn đề, nó chỉ làm vấn đề dễ thấy hơn.

**H: ORM có chậm không?**
Bản thân ORM không chậm — overhead của Hibernate so với JDBC thuần chỉ vài phần trăm cho truy vấn đơn giản, nhỏ hơn nhiều so với một chuyến đi mạng thừa. Cái chậm là **cách dùng**: N+1 do lazy loading, `SELECT *` khi chỉ cần hai cột, nạp entity đầy đủ khi chỉ để đọc, Persistence Context phình to trong batch job. Vấn đề thật của ORM không phải hiệu năng mà là **nó khiến việc dùng sai trở nên dễ dàng và vô hình** — code review nhìn qua vẫn thấy sạch trong khi đang chạy 201 query.

**H: Lập luận mạnh nhất chống lại ORM là gì?**
Không phải hiệu năng, mà là **chi phí học không biến mất, nó chỉ chuyển chỗ**. ORM hứa "bạn không cần biết SQL", nhưng thực tế bạn vẫn phải biết SQL để hiểu chuyện gì đang xảy ra, **cộng thêm** cả một hệ thống khái niệm mới: vòng đời entity, Persistence Context, flush mode, cascade, orphanRemoval, fetch strategy, dirty checking, `LazyInitializationException`, `MultipleBagFetchException`. Lập luận thứ hai cũng mạnh là **SQL bị giấu đi khiến code review không thể bắt lỗi hiệu năng** — nhìn một lời gọi repository, bạn không biết nó dùng index không, JOIN mấy bảng, chạy mấy query.

**H: Nếu được quyết định kiến trúc cho dự án mới thì em chọn gì?**
Em sẽ hỏi ba câu trước: hệ thống này **đọc nhiều hay ghi nhiều**, nghiệp vụ **phức tạp hay chủ yếu CRUD**, và **đội mạnh SQL tới đâu**. Với sản phẩm SaaS thông thường ở Java, em chọn Spring Data JPA làm nền, bật `default_batch_fetch_size=25` ngay từ ngày đầu, bắt buộc mọi `@ManyToOne` khai `LAZY` bằng luật ArchUnit, và tách sẵn một `QueryService` dùng jOOQ hoặc `JdbcTemplate` cho các màn hình danh sách. Quan trọng nhất là **có test đếm query cho mọi API danh sách** — vì với ORM, thứ giết bạn không phải quyết định kiến trúc sai mà là sự xói mòn dần dần mà không ai nhận ra.

**H: Đội muốn viết lại toàn bộ từ JPA sang jOOQ, em xử lý sao?**
Em sẽ lấy số liệu trước khi bàn công nghệ. Chạy `pg_stat_statements` sắp theo `total_exec_time` thì thường thấy **60% thời gian database đến từ chưa tới 5 truy vấn**. Nghĩa là không cần viết lại 400 repository, chỉ cần sửa 5 chỗ. Lộ trình em đề xuất là: ngày đầu bật `default_batch_fetch_size` — thường giảm ngay 30–60% mà không sửa dòng code nào; tuần đầu thêm test đếm query cho 10 API nóng nhất; hai tuần sau viết lại đúng 5 truy vấn nóng nhất bằng jOOQ để đội học với rủi ro thấp; rồi quy định mọi màn hình đọc **mới** viết ở tầng query riêng. Sau ba tháng codebase tự chuyển sang CQRS-lite mà không cần một sprint nào dành riêng cho việc đổi công nghệ.

## Tóm tắt bài 4

- **"ORM hay không ORM" là câu hỏi sai.** Có một phổ 5 mức: JDBC thuần → SQL mapper → query builder → Data Mapper ORM → Active Record.
- Câu *"ORM không được ưa chuộng"* **đúng ở Go và Rust**, **nửa đúng ở Node và .NET**, **sai ở Java, Python, Ruby, PHP**.
- Mô hình thực tế phổ biến nhất là **CQRS nhẹ: ORM cho GHI, SQL cho ĐỌC** — vì mọi lợi ích của ORM nằm ở tầng ghi, mọi vấn đề hiệu năng nằm ở tầng đọc.
- Bốn phê phán **đúng**: SQL bị giấu nên không review được hiệu năng; chi phí học chỉ chuyển chỗ chứ không mất; trần hiệu năng với báo cáo; impedance mismatch là vấn đề gốc.
- Bốn ngộ nhận **sai**: công ty lớn không dùng ORM (Instagram, Shopify, GitHub đều dùng); ORM chậm (cách dùng mới chậm); bỏ ORM là hết N+1 (**không** — MyBatis cũng có N+1); phe chống ORM là số đông (thiên lệch lấy mẫu).
- Sáu thứ ORM làm mà SQL tay không: **dirty checking, `@Version`, cascade + Unit of Work, chống injection mặc định, ánh xạ kiểu, hệ sinh thái** — tất cả đều thuộc **tầng ghi**.
- Ở thị trường Việt Nam: **Spring Data JPA bắt buộc phải biết**, MyBatis là điểm cộng lớn cho dự án Nhật/Hàn và fintech.
- Chuyển đổi đúng cách: **đo `pg_stat_statements` trước** — thường 60% thời gian đến từ dưới 5 truy vấn. Sửa 5 chỗ, đừng viết lại 400.

**Bài kế tiếp** → [Bài 5: Không dùng ORM thì dùng gì — MyBatis, jOOQ, JDBC, sqlc](05-khong-dung-orm-thi-dung-gi.md)

**Quay lại** → [Bài 3: Cái giá của từng cách](03-cai-gia-cua-tung-cach.md)
