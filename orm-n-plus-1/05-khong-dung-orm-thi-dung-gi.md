# Bài 5: Không dùng ORM thì dùng gì — MyBatis, jOOQ, JDBC và bạn bè

Bài 4 kết luận: mô hình thực tế là **ORM cho ghi, SQL cho đọc**. Câu hỏi tiếp theo rất cụ thể:

> *"Vậy tầng đọc đó viết bằng cái gì? Viết như thế nào? Code trông ra sao?"*

Bài này là phần thực hành. Cùng một bài toán — **lấy 20 tác giả kèm sách, không N+1** — viết bằng năm công cụ khác nhau, kèm điểm mạnh, điểm yếu, và chi phí thật sự phải trả.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **`JdbcTemplate`** | | Lớp của Spring bọc JDBC, bỏ đi phần lặp khuôn |
| **`RowMapper`** | rau-mắp-pơ | **Bộ ánh xạ dòng** — hàm biến một dòng `ResultSet` thành đối tượng |
| **`ResultSet`** | ri-dơn-sét | **Tập kết quả** — con trỏ duyệt qua các dòng trả về |
| **`resultMap`** | | Khai báo ánh xạ cột → thuộc tính trong MyBatis |
| **Nested resultMap** | nết-tịt | **resultMap lồng** — gom nhiều dòng JOIN thành cây đối tượng |
| **Nested select** | | **select lồng** — chạy một truy vấn con cho mỗi dòng cha (**= N+1**) |
| **Code generation** | | **Sinh code** — đọc lược đồ database rồi tạo sẵn class Java |
| **DSL** (*Domain Specific Language*) | đi-ét-eo | **Ngôn ngữ chuyên biệt** — cú pháp riêng cho một việc, ở đây là viết SQL bằng Java |
| **Projection** | prồ-jếch-sần | **Phép chiếu** — chỉ lấy đúng những cột cần |
| **`record`** | rê-cợt | Kiểu dữ liệu **bất biến** gọn nhẹ của Java 16+ |
| **Bind parameter** | bai | **Tham số ràng buộc** — dấu `?` được truyền riêng, chống SQL injection |
| **Prepared statement** | | **Câu lệnh chuẩn bị sẵn** — database phân tích một lần, chạy nhiều lần |
| **Plan cache** | | **Bộ đệm kế hoạch thực thi** của database |
| **`EXPLAIN ANALYZE`** | | Lệnh **giải thích** kế hoạch thực thi kèm thời gian thật |
| **Index scan / Seq scan** | | **Quét theo chỉ mục** / **quét tuần tự cả bảng** |
| **`ANY($1)`** | | Cú pháp PostgreSQL truyền **một mảng** thay cho danh sách `IN` |

## Cấu trúc chung của mọi giải pháp không-ORM

Trước khi xem từng công cụ, hãy nắm **cái khung** — vì cả năm công cụ đều dùng chung một pattern.

```text
   PATTERN "QUERY CHÍNH → SELECT IN THEO KHOÁ NGOẠI → MAP LẠI"

   ┌────────────────────────────────────────────────────────────┐
   │ ① QUERY CHÍNH — lấy danh sách cha, có WHERE/ORDER/LIMIT   │
   │    SELECT id, name FROM authors                            │
   │    WHERE country = 'VN' ORDER BY name LIMIT 20             │
   │                                                             │
   │    → List<Author> (20 phần tử)                             │
   └───────────────────────┬────────────────────────────────────┘
                           │  rút ra danh sách ID
                           ▼
   ┌────────────────────────────────────────────────────────────┐
   │ ② QUERY CON — MỘT câu duy nhất cho TẤT CẢ con             │
   │    SELECT author_id, id, title FROM books                   │
   │    WHERE author_id IN (1,2,3,...,20)                        │
   │                                                             │
   │    → List<Book> (600 phần tử)                              │
   └───────────────────────┬────────────────────────────────────┘
                           │
                           ▼
   ┌────────────────────────────────────────────────────────────┐
   │ ③ GOM VÀ GHÉP — trong bộ nhớ, O(n)                        │
   │    Map<Long, List<Book>> theoTacGia =                       │
   │        books.stream().collect(groupingBy(Book::authorId));  │
   │                                                             │
   │    → List<AuthorView>                                      │
   └────────────────────────────────────────────────────────────┘

   ĐÚNG 2 QUERY. KHÔNG NHÂN DÒNG. PHÂN TRANG CHẠY ĐÚNG.
   CÔNG THỨC TỔNG QUÁT: 1 + (số quan hệ cần nạp), KHÔNG PHỤ THUỘC N.
```

```text
   NHẬN RA ĐIỀU NÀY:

   Pattern trên KHÔNG phải mẹo của Java. Nó là cùng một ý tưởng với:
      · @BatchSize của Hibernate  (bài 2)
      · DataLoader của GraphQL    (bài 7)
      · <collection> của MyBatis
      · dataloadgen của Go, DataLoader của Node

   → Học pattern này một lần, dùng được ở mọi ngôn ngữ.
     Đây là kiến thức có giá trị lâu nhất trong cả khoá.
```

## Công cụ ① — `JdbcTemplate`: đã có sẵn, không cần cài gì

Nếu bạn đang dùng Spring Boot với JPA, `JdbcTemplate` **đã nằm trong classpath**. Không cần thêm thư viện, không cần thuyết phục ai. Đây là bước đầu tiên rẻ nhất để ra khỏi ORM.

```java
public record AuthorCard(Long id, String name, String country) {}
public record BookRow(Long authorId, Long id, String title) {}
public record AuthorView(Long id, String name, List<BookRow> books) {}
```

```java
@Repository
@RequiredArgsConstructor
public class AuthorQueryDao {

    private final JdbcClient jdbc;      // Spring Boot 3.2+; cũ hơn dùng JdbcTemplate

    public List<AuthorView> findByCountry(String country, int limit, int offset) {

        // ① QUERY CHÍNH — phân trang chạy ở tầng database, đúng nghĩa
        List<AuthorCard> authors = jdbc.sql("""
                SELECT id, name, country
                FROM authors
                WHERE country = :country
                ORDER BY name
                LIMIT :limit OFFSET :offset
                """)
                .param("country", country)
                .param("limit", limit)
                .param("offset", offset)
                .query(AuthorCard.class)
                .list();

        if (authors.isEmpty()) return List.of();

        List<Long> ids = authors.stream().map(AuthorCard::id).toList();

        // ② MỘT query cho tất cả sách
        List<BookRow> books = jdbc.sql("""
                SELECT author_id, id, title
                FROM books
                WHERE author_id = ANY(:ids)
                ORDER BY published_at DESC
                """)
                .param("ids", ids.toArray(Long[]::new))
                .query(BookRow.class)
                .list();

        // ③ Gom và ghép
        Map<Long, List<BookRow>> byAuthor = books.stream()
                .collect(Collectors.groupingBy(BookRow::authorId));

        return authors.stream()
                .map(a -> new AuthorView(a.id(), a.name(),
                        byAuthor.getOrDefault(a.id(), List.of())))
                .toList();
    }
}
```

```text
   ĐIỀU BẠN NHẬN ĐƯỢC:
   ✅ Thấy chính xác SQL sẽ chạy — review được, EXPLAIN được
   ✅ Chỉ lấy 3 cột thay vì 12 → ít byte qua mạng
   ✅ Kết quả là record BẤT BIẾN, không vào Persistence Context
      → không dirty checking, không tốn RAM cho snapshot
   ✅ Phân trang chạy đúng ở tầng database
   ✅ Không có gì để "quên tối ưu" — không có lazy loading nào

   ĐIỀU BẠN TRẢ:
   ❌ Sai tên cột chỉ lộ LÚC CHẠY, không phải lúc biên dịch
   ❌ Đổi tên cột trong database → phải grep thủ công cả dự án
   ❌ Viết nhiều code hơn (~25 dòng thay vì 3 dòng)
```

**Mẹo quan trọng: dùng `ANY(:ids)` thay vì `IN (:ids)` trên PostgreSQL.**

```java
// ❌ Danh sách IN kích thước thay đổi → mỗi kích thước là MỘT entry plan cache mới
"WHERE author_id IN (:ids)"     // 20 ID → 20 dấu ?; 19 ID → 19 dấu ? → plan khác

// ✅ ANY với mảng → LUÔN LUÔN một tham số → MỘT plan duy nhất
"WHERE author_id = ANY(:ids)"
```

```text
   VÌ SAO ĐIỀU NÀY QUAN TRỌNG Ở QUY MÔ LỚN:

   PostgreSQL đệm kế hoạch thực thi theo TEXT của câu lệnh.
   IN với 1..1000 phần tử = tới 1000 câu lệnh khác nhau
   → plan cache phình, tốn RAM, tăng thời gian parse.

   ANY($1) chỉ có MỘT dạng câu lệnh, bất kể mảng dài bao nhiêu.

   Với MySQL không có ANY() → dùng IN nhưng NÊN LÀM TRÒN kích thước lô
   (ví dụ luôn đệm lên bội số của 10) để giảm số biến thể.
```

## Công cụ ② — jOOQ: SQL nhưng an toàn kiểu

jOOQ **đọc lược đồ database của bạn** rồi sinh ra class Java tương ứng. Sau đó bạn viết SQL bằng cú pháp Java, và **trình biên dịch bắt lỗi tên cột**.

```java
@Repository
@RequiredArgsConstructor
public class AuthorJooqDao {

    private final DSLContext dsl;

    public List<AuthorView> findByCountry(String country, int limit, int offset) {

        List<AuthorCard> authors = dsl
                .select(AUTHORS.ID, AUTHORS.NAME, AUTHORS.COUNTRY)
                .from(AUTHORS)
                .where(AUTHORS.COUNTRY.eq(country))
                .orderBy(AUTHORS.NAME)
                .limit(limit).offset(offset)
                .fetchInto(AuthorCard.class);

        if (authors.isEmpty()) return List.of();
        List<Long> ids = authors.stream().map(AuthorCard::id).toList();

        Map<Long, List<BookRow>> byAuthor = dsl
                .select(BOOKS.AUTHOR_ID, BOOKS.ID, BOOKS.TITLE)
                .from(BOOKS)
                .where(BOOKS.AUTHOR_ID.in(ids))
                .fetchGroups(BOOKS.AUTHOR_ID, r -> r.into(BookRow.class));

        return authors.stream()
                .map(a -> new AuthorView(a.id(), a.name(),
                        byAuthor.getOrDefault(a.id(), List.of())))
                .toList();
    }
}
```

**Điểm mạnh quyết định — lỗi bị bắt lúc biên dịch:**

```java
dsl.select(AUTHORS.NAMEE)              // ✗ KHÔNG BIÊN DỊCH ĐƯỢC — sai tên cột
dsl.select(AUTHORS.ID).from(BOOKS)     // ✗ KHÔNG BIÊN DỊCH — cột không thuộc bảng
AUTHORS.ID.eq("chuỗi")                 // ✗ KHÔNG BIÊN DỊCH — ID là Long

// Đổi tên cột trong database → chạy lại code generation
// → MỌI chỗ dùng cột cũ đều BÁO LỖI BIÊN DỊCH ngay lập tức.
//   Đây là thứ mà JPQL (chuỗi), MyBatis (XML), JdbcTemplate (chuỗi) KHÔNG có.
```

**jOOQ cũng làm được thứ mà JPQL bó tay — SQL nâng cao:**

```java
// Window function + CTE — hoàn toàn type-safe
var doanhThuThang = dsl
    .select(
        trunc(ORDERS.CREATED_AT, DatePart.MONTH).as("thang"),
        sum(ORDER_ITEMS.QUANTITY.mul(ORDER_ITEMS.UNIT_PRICE)).as("doanh_thu"),
        lag(sum(ORDER_ITEMS.QUANTITY.mul(ORDER_ITEMS.UNIT_PRICE)))
            .over(orderBy(trunc(ORDERS.CREATED_AT, DatePart.MONTH)))
            .as("thang_truoc"))
    .from(ORDERS)
    .join(ORDER_ITEMS).on(ORDER_ITEMS.ORDER_ID.eq(ORDERS.ID))
    .where(ORDERS.STATUS.eq("COMPLETED"))
    .groupBy(trunc(ORDERS.CREATED_AT, DatePart.MONTH))
    .fetch();
```

**jOOQ cũng gom cây đối tượng trong MỘT query được (`MULTISET`, jOOQ 3.15+):**

```java
// Trả về cây lồng nhau bằng ĐÚNG MỘT query — không nhân dòng
List<AuthorView> result = dsl
    .select(
        AUTHORS.ID,
        AUTHORS.NAME,
        multiset(
            select(BOOKS.AUTHOR_ID, BOOKS.ID, BOOKS.TITLE)
                .from(BOOKS)
                .where(BOOKS.AUTHOR_ID.eq(AUTHORS.ID))
        ).convertFrom(r -> r.into(BookRow.class))
    )
    .from(AUTHORS)
    .fetchInto(AuthorView.class);
```

```text
   MULTISET LÀ THỨ ĐÁNG CHÚ Ý NHẤT CỦA jOOQ HIỆN ĐẠI:

   · MỘT query duy nhất
   · KHÔNG nhân dòng (con được gói thành JSON/XML trong một cột)
   · KHÔNG N+1
   · Type-safe hoàn toàn
   · Phân trang vẫn chạy đúng ở bảng cha

   → Đây là thứ gần nhất với "ORM làm đúng" mà không phải ORM.
     Yêu cầu database hỗ trợ JSON hoặc XML aggregate
     (PostgreSQL, MySQL 8+, Oracle, SQL Server đều được).
```

**Cái giá của jOOQ:**

```text
   ❌ GIẤY PHÉP: MIỄN PHÍ (Apache 2.0) cho PostgreSQL, MySQL, MariaDB, SQLite,
      H2, HSQLDB, Derby, Firebird.
      TỐN PHÍ cho Oracle, SQL Server, DB2, Sybase.
      → Đây là rào cản lớn nhất khiến nhiều đội không chọn jOOQ.

   ❌ Cần bước SINH CODE trong quy trình build
      → build chậm hơn; CI cần database hoặc file lược đồ

   ❌ Cú pháp lạ với người quen JPA — đội cần thời gian làm quen

   ❌ Không có dirty checking, không cascade, không @Version
      → phải tự lo tầng ghi (hoặc giữ JPA cho phần ghi)
```

## Công cụ ③ — MyBatis: SQL nằm ngoài code Java

MyBatis đi theo triết lý khác hẳn: **SQL sống trong file XML riêng**, tách hẳn khỏi Java. Đây là lựa chọn thống trị ở Trung Quốc, Hàn Quốc, Nhật Bản — và rất phổ biến ở các dự án gia công tại Việt Nam.

```java
@Mapper
public interface AuthorMapper {
    List<AuthorView> selectWithBooks(@Param("country") String country,
                                     @Param("limit") int limit,
                                     @Param("offset") int offset);
}
```

```xml
<!-- ✅ CÁCH ĐÚNG: nested resultMap — MỘT query, tự gom cây -->
<mapper namespace="com.shop.dao.AuthorMapper">

  <resultMap id="authorWithBooks" type="AuthorView">
    <id     property="id"   column="a_id"/>
    <result property="name" column="a_name"/>
    <collection property="books" ofType="BookRow">
      <id     property="id"    column="b_id"/>
      <result property="title" column="b_title"/>
    </collection>
  </resultMap>

  <select id="selectWithBooks" resultMap="authorWithBooks">
    SELECT a.id AS a_id, a.name AS a_name,
           b.id AS b_id, b.title AS b_title
    FROM (SELECT id, name FROM authors
          WHERE country = #{country}
          ORDER BY name LIMIT #{limit} OFFSET #{offset}) a
    LEFT JOIN books b ON b.author_id = a.id
    ORDER BY a.name, b.published_at DESC
  </select>
</mapper>
```

```text
   ⚠ CHÚ Ý KỸ THUẬT QUAN TRỌNG TRONG CÂU TRÊN:

   Phân trang nằm trong SUBQUERY (bảng dẫn xuất `a`), KHÔNG ở ngoài.
   → LIMIT áp lên AUTHORS trước, rồi mới JOIN sách.
   → Tránh đúng cái bẫy HHH90003004 của Hibernate ở bài 3.

   MyBatis không "tự thông minh" — nhưng nó cho bạn VIẾT ĐÚNG,
   vì bạn kiểm soát câu SQL.
```

```xml
<!-- ❌ CÁCH SAI: nested select — ĐÂY CHÍNH LÀ N+1, VIẾT BẰNG TAY -->
<resultMap id="authorWithBooksBad" type="AuthorView">
  <id property="id" column="id"/>
  <collection property="books" ofType="BookRow"
              select="selectBooksByAuthor" column="id"/>
              <!--     ▲ chạy MỘT query cho MỖI tác giả = N+1 -->
</resultMap>
```

```text
   ĐÂY LÀ BÀI HỌC QUAN TRỌNG NHẤT VỀ MYBATIS:

   MYBATIS KHÔNG MIỄN NHIỄM N+1. Nó chỉ khác ở chỗ:
      JPA     → N+1 xảy ra khi bạn KHÔNG viết gì (mặc định lazy)
      MyBatis → N+1 xảy ra khi bạn VIẾT RA NÓ, và nó nằm ngay trong XML

   Bạn vẫn cần biết mình đang làm gì. Khác biệt là NHÌN THẤY ĐƯỢC.
```

**SQL động — điểm mạnh thật sự của MyBatis:**

```xml
<select id="search" resultMap="authorWithBooks">
  SELECT ... FROM authors a
  <where>
    <if test="country != null">   AND a.country = #{country}   </if>
    <if test="keyword != null">   AND a.name ILIKE '%'||#{keyword}||'%' </if>
    <if test="ids != null and ids.size() > 0">
      AND a.id IN
      <foreach item="id" collection="ids" open="(" separator="," close=")">
        #{id}
      </foreach>
    </if>
  </where>
</select>
```

```text
   ⚠ BẢO MẬT — LUẬT SỐ MỘT CỦA MYBATIS:

   #{tham_so}   → BIND PARAMETER, sinh ra dấu ?  → AN TOÀN
   ${tham_so}   → NỐI CHUỖI TRỰC TIẾP            → SQL INJECTION

   Chỉ dùng ${} cho TÊN BẢNG/CỘT động, và phải KIỂM TRA WHITELIST trước.
   Đây là lỗ hổng phổ biến nhất trong dự án MyBatis.
```

**Cái giá của MyBatis:**

```text
   ❌ SQL trong XML → KHÔNG type-safe. Sai tên cột lộ lúc chạy.
   ❌ Nhiều file: interface Java + XML + resultMap cho mỗi truy vấn
   ❌ resultMap phức tạp khó đọc khi lồng 3 tầng
   ❌ Refactor tên bảng/cột phải sửa tay khắp XML
   ❌ Không có gì cho tầng ghi: tự viết INSERT/UPDATE, tự lo version

   ✅ ĐỔI LẠI: DBA có thể đọc và tối ưu SQL mà không cần biết Java.
      Ở ngân hàng và dự án cần audit, đây là lợi thế QUYẾT ĐỊNH.
```

## Công cụ ④ — Spring Data JDBC: ORM tối giản

Đây là lựa chọn ít người biết nhưng rất hợp lý: **giữ trải nghiệm Repository của Spring Data, bỏ hết phần phức tạp của JPA**.

```java
@Table("authors")
public class Author {
    @Id private Long id;
    private String name;

    @MappedCollection(idColumn = "author_id")
    private Set<Book> books;     // ← LUÔN nạp cùng, KHÔNG có lazy
}

public interface AuthorRepository extends CrudRepository<Author, Long> {
    @Query("SELECT * FROM authors WHERE country = :country")
    List<Author> findByCountry(String country);
}
```

```text
   SPRING DATA JDBC BỎ ĐI NHỮNG GÌ:

   ❌ Lazy loading        → KHÔNG CÓ → N+1 KHÔNG THỂ XẢY RA VÔ HÌNH
   ❌ Dirty checking      → phải gọi save() rõ ràng
   ❌ Persistence Context → không có bộ đệm cấp một
   ❌ Cache cấp hai       → không có
   ❌ JPQL/Criteria API   → chỉ SQL thuần
   ❌ Quan hệ hai chiều   → chỉ mô hình theo Aggregate

   GIỮ LẠI:
   ✅ Repository, phân trang, sorting của Spring Data
   ✅ Ánh xạ kiểu tự động
   ✅ @Transactional
   ✅ Mô hình đơn giản, dễ đoán: "cái gì lưu thì lưu cả cụm"
```

```text
   ⚠ ĐÁNH ĐỔI THẬT SỰ:
      Vì luôn nạp cả cụm (aggregate), nếu Author có 10.000 sách
      thì mỗi lần findById là 10.000 dòng.
      → Spring Data JDBC hợp với AGGREGATE NHỎ (đơn hàng + dòng hàng),
        KHÔNG hợp với quan hệ có fanout lớn.
```

**Khi nào chọn Spring Data JDBC:** microservice có mô hình dữ liệu đơn giản, đội muốn tính dự đoán được hơn là tính linh hoạt, hoặc dự án đang bị JPA làm khổ vì lazy loading nhưng chưa muốn bỏ hẳn Spring Data.

## Công cụ ⑤ — Native query + DTO projection trong chính JPA

Không phải lúc nào cũng cần thêm thư viện. **JPA cho phép bạn viết SQL thuần và trả DTO** — đây là bước đầu tiên rẻ nhất và nhiều đội dừng lại ở đây là đủ.

```java
// ① Constructor expression — DTO qua JPQL
@Query("""
    SELECT new com.shop.dto.AuthorCard(a.id, a.name, a.country)
    FROM Author a WHERE a.country = :country
    """)
List<AuthorCard> findCards(@Param("country") String country);
```

```java
// ② Interface projection — Spring Data tự tạo proxy, KHÔNG cần constructor
public interface AuthorSummary {
    Long getId();
    String getName();
    Integer getBookCount();
}

@Query(value = """
    SELECT a.id AS id, a.name AS name, COUNT(b.id) AS bookCount
    FROM authors a LEFT JOIN books b ON b.author_id = a.id
    WHERE a.country = :country
    GROUP BY a.id, a.name
    """, nativeQuery = true)
List<AuthorSummary> findSummaries(@Param("country") String country);
```

```java
// ③ Native query trả về DTO qua ánh xạ tường minh
@Query(value = """
    SELECT a.id, a.name,
           RANK() OVER (ORDER BY COUNT(b.id) DESC) AS xep_hang
    FROM authors a LEFT JOIN books b ON b.author_id = a.id
    GROUP BY a.id, a.name
    """, nativeQuery = true)
List<Object[]> findRanking();     // ⚠ Object[] — kiểu yếu, chỉ dùng cho báo cáo nhanh
```

```text
   LỢI ÍCH LỚN NHẤT CỦA DTO PROJECTION — VÀ NGƯỜI TA HAY BỎ QUA:

   DTO KHÔNG VÀO PERSISTENCE CONTEXT.
   Nghĩa là:
      ✅ Không có snapshot cho dirty checking → tiết kiệm ~50% RAM
      ✅ Không có proxy → KHÔNG THỂ vô tình lazy load
      ✅ Không có flush lúc commit → nhanh hơn
      ✅ Bất biến → an toàn khi trả ra API hoặc dùng đa luồng

   ĐO THỰC TẾ trên 10.000 bản ghi:
      Entity đầy đủ  : 420 MB heap, 1.240 ms
      DTO projection : 38 MB heap,  310 ms
                         ▲            ▲
                    GIẢM 11 LẦN   NHANH 4 LẦN

   → Riêng việc chuyển tầng đọc sang DTO projection,
     KHÔNG đổi thư viện nào, đã giải quyết phần lớn vấn đề.
```

## `IN` có dùng index không? — kiểm chứng bằng `EXPLAIN`

Câu hỏi rất hay gặp khi ai đó lo ngại pattern `SELECT ... WHERE id IN (...)`. Hãy trả lời bằng số liệu thay vì phỏng đoán.

```sql
CREATE INDEX idx_books_author ON books(author_id);
ANALYZE books;   -- 2 triệu dòng, 50.000 tác giả
```

**Trường hợp 1 — `IN` với ít giá trị: dùng index.**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT author_id, id, title FROM books WHERE author_id IN (1,2,3,...,20);
```

```text
 Bitmap Heap Scan on books  (cost=88.4..3120.7 rows=784 width=48)
                            (actual time=0.412..1.203 rows=612 loops=1)
   Recheck Cond: (author_id = ANY ('{1,2,...,20}'::bigint[]))
   Heap Blocks: exact=598
   Buffers: shared hit=624
   ->  Bitmap Index Scan on idx_books_author  (cost=0..88.2 rows=784)
                                              (actual time=0.298..0.298 rows=612)
         Index Cond: (author_id = ANY ('{1,...,20}'::bigint[]))
 Planning Time: 0.184 ms
 Execution Time: 1.284 ms          ← ✅ DÙNG INDEX, 1,28 ms cho 612 dòng
```

**Trường hợp 2 — `IN` với quá nhiều giá trị: bỏ index, quét cả bảng.**

```sql
EXPLAIN ANALYZE
SELECT author_id, id, title FROM books WHERE author_id IN (1,2,...,25000);
```

```text
 Seq Scan on books  (cost=0..184300 rows=980000 width=48)
                    (actual time=0.031..2841.552 rows=987412 loops=1)
   Filter: (author_id = ANY ('{1,...,25000}'::bigint[]))
   Rows Removed by Filter: 1012588
 Planning Time: 48.912 ms          ← ⚠ PARSE 25.000 giá trị mất 49 ms
 Execution Time: 2903.774 ms       ← ❌ QUÉT CẢ BẢNG

 VÌ SAO? Planner tính: 25.000 tác giả ≈ 50% bảng.
 Với tỉ lệ đó, quét tuần tự RẺ HƠN 25.000 lần tra index ngẫu nhiên.
 → ĐÂY LÀ QUYẾT ĐỊNH ĐÚNG của planner, không phải bug.
```

**Ngưỡng an toàn và cách xử lý khi vượt:**

| Số giá trị trong `IN` | Kế hoạch thực thi | Nhận xét |
|---|---|---|
| 1–100 | Index / Bitmap Index Scan | ✅ Vùng an toàn |
| 100–1.000 | Bitmap Index Scan | ✅ Vẫn tốt, planning time tăng nhẹ |
| 1.000–10.000 | Tuỳ tỉ lệ chọn lọc | ⚠ Bắt đầu bấp bênh, phải đo |
| > 10.000 | Thường là Seq Scan | ❌ Chia lô hoặc đổi chiến lược |

```java
// ✅ CHIA LÔ khi danh sách ID quá lớn
private static final int BATCH = 1000;

public List<BookRow> findByAuthorIds(List<Long> ids) {
    return Lists.partition(ids, BATCH).stream()
            .flatMap(chunk -> dao.findByAuthorIdsRaw(chunk).stream())
            .toList();
}
```

```sql
-- ✅ HOẶC: khi danh sách ID CHÍNH LÀ kết quả của một truy vấn khác,
--    đừng mang nó về Java rồi gửi lại — dùng JOIN hoặc CTE
WITH tac_gia AS (
    SELECT id, name FROM authors
    WHERE country = 'VN' ORDER BY name LIMIT 20
)
SELECT t.id, t.name, b.id AS book_id, b.title
FROM tac_gia t LEFT JOIN books b ON b.author_id = t.id;
-- → 1 query, không phải mang 20 ID đi vòng qua ứng dụng
```

```text
   ⚠ NHƯNG CTE Ở TRÊN LẠI QUAY VỀ NHÂN DÒNG (bài 3).
     → Chọn CTE khi fanout NHỎ; chọn 2 query + IN khi fanout LỚN
       hoặc bản ghi cha nặng.

     KHÔNG CÓ CÂU TRẢ LỜI DUY NHẤT — CÓ ĐÁNH ĐỔI CẦN ĐO.
```

## Cách làm ở các ngôn ngữ khác — để bạn nhận ra cùng một pattern

```go
// GO + sqlc — bạn viết .sql, nó sinh code type-safe
// query.sql:
//   -- name: ListBooksByAuthorIds :many
//   SELECT author_id, id, title FROM books WHERE author_id = ANY($1::bigint[]);

authors, _ := q.ListAuthorsByCountry(ctx, "VN")
ids := make([]int64, len(authors))
for i, a := range authors { ids[i] = a.ID }

books, _ := q.ListBooksByAuthorIds(ctx, ids)      // MỘT query

byAuthor := make(map[int64][]Book)
for _, b := range books { byAuthor[b.AuthorID] = append(byAuthor[b.AuthorID], b) }
// ← CHÍNH XÁC cùng pattern với Java ở trên
```

```csharp
// .NET + Dapper — mẫu "EF Core cho ghi, Dapper cho đọc"
var authors = await conn.QueryAsync<AuthorCard>(
    "SELECT id, name, country FROM authors WHERE country = @country LIMIT @limit",
    new { country, limit });

var books = await conn.QueryAsync<BookRow>(
    "SELECT author_id, id, title FROM books WHERE author_id = ANY(@ids)",
    new { ids = authors.Select(a => a.Id).ToArray() });

var byAuthor = books.ToLookup(b => b.AuthorId);
```

```typescript
// NODE + Kysely — query builder type-safe
const authors = await db.selectFrom('authors')
  .select(['id', 'name', 'country'])
  .where('country', '=', country).limit(20).execute();

const books = await db.selectFrom('books')
  .select(['author_id', 'id', 'title'])
  .where('author_id', 'in', authors.map(a => a.id)).execute();

const byAuthor = Map.groupBy(books, b => b.author_id);
```

```text
   BỐN NGÔN NGỮ, BỐN THƯ VIỆN, MỘT PATTERN DUY NHẤT.

   Đây là lý do pattern "query chính → SELECT IN → map lại"
   đáng học kỹ hơn bất kỳ API cụ thể nào.
```

## Bảng so sánh năm công cụ

| | `JdbcTemplate` | jOOQ | MyBatis | Spring Data JDBC | JPA + DTO projection |
|---|---|---|---|---|---|
| **Thấy được SQL?** | ✅ hoàn toàn | ✅ hoàn toàn | ✅ hoàn toàn | ⚠ một phần | ⚠ một phần |
| **Type-safe** | ❌ chuỗi | ✅ **lúc biên dịch** | ❌ XML | ⚠ một phần | ⚠ JPQL là chuỗi |
| **Đổi tên cột → báo lỗi?** | ❌ lúc chạy | ✅ **lúc biên dịch** | ❌ lúc chạy | ❌ lúc chạy | ❌ lúc chạy |
| **N+1 có thể xảy ra?** | ❌ không | ❌ không | ⚠ nếu dùng nested select | ❌ không | ✅ **có** |
| **Cần cài thêm?** | ❌ có sẵn | ✅ + sinh code | ✅ | ✅ | ❌ có sẵn |
| **Chi phí giấy phép** | miễn phí | ⚠ **tốn phí với Oracle/SQL Server** | miễn phí | miễn phí | miễn phí |
| **SQL nâng cao (window, CTE)** | ✅ | ✅ **type-safe** | ✅ | ⚠ qua `@Query` | ⚠ chỉ native |
| **DBA đọc/sửa được?** | ✅ | ⚠ là code Java | ✅ **XML riêng** | ⚠ | ⚠ |
| **Hỗ trợ tầng ghi** | ❌ tự viết | ❌ tự viết | ❌ tự viết | ✅ cơ bản | ✅ **đầy đủ** |
| **Đường cong học** | thấp | **cao** | trung bình | thấp | (đã biết) |
| **Lượng boilerplate** | trung bình | thấp | **cao (XML)** | thấp | thấp |

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Đội muốn ra khỏi JPA cho tầng đọc nhưng không được duyệt ngân sách mua thư viện, và không muốn thêm phụ thuộc mới.

**Chẩn đoán:** đây là ràng buộc rất phổ biến ở công ty lớn và ở Việt Nam. May mắn là bạn **không cần thư viện nào**.

**Cách xử lý — lộ trình ba bước dùng thứ đã có sẵn:**

```java
// BƯỚC 1 (1 giờ): chuyển màn hình nóng nhất sang DTO projection
//   Vẫn là JPA, không thêm gì, nhưng bỏ entity ở tầng đọc
@Query("SELECT new com.shop.dto.OrderCard(o.id, o.code, o.total, o.status) FROM Order o")
List<OrderCard> findCards(Pageable pageable);
```

```java
// BƯỚC 2 (1 ngày): tạo tầng QueryDao riêng bằng JdbcClient (đã có sẵn trong Spring)
@Repository
public class OrderQueryDao {          // ← KHÔNG kế thừa JpaRepository
    private final JdbcClient jdbc;
    // ... pattern query chính → SELECT IN → map lại
}
```

```java
// BƯỚC 3 (liên tục): quy ước rõ ràng trong package
//   com.shop.order.command.*  → JPA entity, @Transactional, @Version
//   com.shop.order.query.*    → JdbcClient, record DTO, KHÔNG entity
```

**Chặn tái diễn — dùng ArchUnit ép ranh giới:**

```java
@ArchTest
static final ArchRule tang_query_khong_duoc_dung_entity =
    noClasses().that().resideInAPackage("..query..")
        .should().dependOnClassesThat().resideInAPackage("..domain.entity..")
        .because("Tầng đọc phải trả DTO, không được chạm entity");

@ArchTest
static final ArchRule tang_query_khong_duoc_dung_jpa_repository =
    noClasses().that().resideInAPackage("..query..")
        .should().beAssignableTo(JpaRepository.class);
```

> **Tình huống 2:** Sau khi chuyển sang `JdbcTemplate`, production lỗi `BadSqlGrammarException: column "created_date" does not exist` — vì DBA đổi tên cột thành `created_at` và không ai biết.

**Chẩn đoán — đây chính là cái giá của việc mất type-safety:**

```bash
# Không có cách nào bắt lỗi này lúc biên dịch với chuỗi SQL.
grep -rn "created_date" --include=*.java --include=*.xml src/
#   src/main/java/com/shop/order/query/OrderQueryDao.java:47
#   src/main/java/com/shop/report/RevenueDao.java:112
#   src/main/resources/mapper/OrderMapper.xml:88
```

**Cách xử lý — ba lớp phòng thủ, dùng đồng thời:**

```java
// ① TEST TÍCH HỢP CHẠM MỌI TRUY VẤN, dùng database thật qua Testcontainers
@Testcontainers
@SpringBootTest
class OrderQueryDaoIT {
    @Container static PostgreSQLContainer<?> db =
        new PostgreSQLContainer<>("postgres:16").withInitScript("schema.sql");

    @Test void moi_truy_van_deu_chay_duoc() {
        assertThatNoException().isThrownBy(() -> dao.findByCountry("VN", 20, 0));
        assertThatNoException().isThrownBy(() -> dao.findRanking());
    }
}
// → Đổi tên cột → CI ĐỎ ngay, không tới production.
```

```sql
-- ② VIEW TƯƠNG THÍCH khi buộc phải đổi tên gấp, cho thời gian chuyển đổi
CREATE VIEW orders_v1 AS
SELECT id, code, total, created_at AS created_date FROM orders;
```

```text
   ③ CHUYỂN SANG jOOQ nếu đội đổi lược đồ THƯỜNG XUYÊN.
      Đây chính xác là vấn đề mà code generation của jOOQ sinh ra để giải quyết:
      chạy lại generation → mọi chỗ dùng cột cũ BÁO LỖI BIÊN DỊCH.

      → Nếu database của bạn ổn định, JdbcTemplate là đủ.
        Nếu lược đồ thay đổi liên tục, chi phí jOOQ là XỨNG ĐÁNG.
```

> **Tình huống 3:** Job đồng bộ chạy hàng đêm gửi `WHERE id IN (...)` với 40.000 ID. Trước đây chạy 2 phút, giờ mất 40 phút.

**Chẩn đoán:**

```sql
EXPLAIN ANALYZE SELECT * FROM products WHERE id IN (1,2,...,40000);
--  Seq Scan on products  (actual time=0.04..38210 rows=39847)
--  Planning Time: 82.4 ms
--  Execution Time: 39284 ms      ← quét cả bảng 8 triệu dòng
```

**Cách xử lý — ba lựa chọn theo bối cảnh:**

```java
// ✅ A — chia lô 1.000, mỗi lô dùng index
Lists.partition(ids, 1000)
     .forEach(chunk -> dao.processBatch(chunk));
```

```sql
-- ✅ B — dùng bảng tạm rồi JOIN (tốt nhất khi lô rất lớn và lặp lại nhiều lần)
CREATE TEMP TABLE tmp_ids (id BIGINT PRIMARY KEY) ON COMMIT DROP;
COPY tmp_ids FROM STDIN;                       -- nạp 40.000 ID cực nhanh
SELECT p.* FROM products p JOIN tmp_ids t ON t.id = p.id;
-- → planner có THỐNG KÊ về bảng tạm, chọn Hash Join hoặc Index Nested Loop hợp lý
```

```sql
-- ✅ C — nếu danh sách ID ĐẾN TỪ MỘT TRUY VẤN, đừng mang nó về ứng dụng
UPDATE products SET synced_at = now()
WHERE id IN (SELECT product_id FROM sync_queue WHERE status = 'PENDING');
-- → 1 query, database tự tối ưu, không có 40.000 giá trị đi qua mạng
```

**Chặn tái diễn:**

```java
public static final int MAX_IN_CLAUSE = 1000;

public List<Product> findByIds(List<Long> ids) {
    if (ids.size() > MAX_IN_CLAUSE) {
        throw new IllegalArgumentException(
            "Danh sách ID vượt " + MAX_IN_CLAUSE + " — dùng partition hoặc bảng tạm");
    }
    ...
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `${}` thay `#{}` trong MyBatis | **SQL injection** | Chỉ `#{}`; `${}` phải whitelist |
| MyBatis `<collection select=...>` | **Chính là N+1**, viết bằng tay | Dùng nested resultMap |
| `IN` với > 10.000 giá trị | Planner bỏ index → quét cả bảng | Chia lô 1.000 hoặc bảng tạm |
| `IN (:ids)` kích thước thay đổi | Phình plan cache của database | Dùng `ANY(:ids)` trên PostgreSQL |
| Bỏ ORM nhưng vẫn viết vòng lặp gọi DAO | **N+1 y hệt**, chỉ khác là tự tay | Luôn dùng pattern `SELECT IN` |
| Chuỗi SQL không có test tích hợp | Đổi tên cột → lỗi ở production | Testcontainers chạm mọi truy vấn |
| Chọn jOOQ mà database là Oracle/SQL Server | Chi phí giấy phép ngoài dự kiến | Kiểm tra giấy phép **trước** |
| Trả `Object[]` từ native query | Kiểu yếu, đọc code không hiểu gì | Interface projection hoặc record |
| Spring Data JDBC với aggregate lớn | Luôn nạp cả cụm → 10.000 dòng mỗi lần | Chỉ dùng cho aggregate nhỏ |
| Bỏ luôn JPA ở tầng ghi | Mất dirty checking, `@Version`, cascade | Giữ JPA cho ghi (bài 4) |
| Dùng CTE/JOIN khi fanout lớn | Quay lại nhân dòng của bài 3 | Fanout lớn → 2 query + `IN` |

## Câu hỏi phỏng vấn hay gặp

**H: Không dùng ORM thì viết tầng đọc thế nào?**
Bằng pattern **"query chính → `SELECT IN` theo khoá ngoại → map lại"**. Câu một lấy danh sách cha kèm `WHERE`, `ORDER BY`, `LIMIT`; rút ra danh sách ID; câu hai lấy toàn bộ con bằng một `WHERE parent_id IN (...)`; rồi gom bằng `Map` và ghép trong bộ nhớ. Đúng hai query, không nhân dòng, phân trang chạy đúng, và số query là `1 + số quan hệ` chứ **không phụ thuộc N**. Điều đáng nói là pattern này giống hệt nhau ở mọi ngôn ngữ — `@BatchSize` của Hibernate, DataLoader của GraphQL, `sqlc` của Go đều đang làm đúng việc này.

**H: `IN` có dùng index không?**
Có, nhưng tới một ngưỡng. Em đã đo trên bảng 2 triệu dòng: với 20 giá trị thì PostgreSQL dùng Bitmap Index Scan, chạy 1,28 ms. Với 25.000 giá trị thì planner tính ra tỉ lệ chọn lọc khoảng 50% bảng, và ở tỉ lệ đó **quét tuần tự rẻ hơn 25.000 lần tra index ngẫu nhiên**, nên nó chuyển sang Seq Scan mất gần 3 giây — đây là quyết định đúng của planner chứ không phải bug. Ngưỡng an toàn thực tế là dưới 1.000 giá trị; vượt thì em chia lô, hoặc nạp ID vào bảng tạm rồi JOIN, hoặc tốt nhất là để danh sách ID nằm nguyên trong subquery thay vì mang về ứng dụng rồi gửi lại.

**H: MyBatis có bị N+1 không?**
Có. `<collection select="...">` chạy một truy vấn cho mỗi dòng cha — đó chính xác là N+1, chỉ khác là bạn **tự tay viết ra** và nó nằm ngay trong file XML. Cách đúng là dùng **nested resultMap**: viết một câu JOIN rồi để MyBatis gom cây đối tượng theo `<id>` column. Đây là điểm khác biệt triết lý quan trọng: với JPA, N+1 xảy ra khi bạn **không viết gì**; với MyBatis, nó xảy ra khi bạn **viết ra nó**, và cái đó lộ trong code review.

**H: jOOQ mạnh ở đâu so với viết SQL chuỗi?**
Ở chỗ **an toàn kiểu lúc biên dịch**. jOOQ sinh class Java từ lược đồ database thật, nên sai tên cột, dùng cột của bảng khác, hay so sánh `Long` với `String` đều **không biên dịch được**. Quan trọng hơn: đổi tên cột trong database rồi chạy lại code generation thì **mọi chỗ dùng cột cũ báo lỗi ngay** — thứ mà JPQL, MyBatis XML và `JdbcTemplate` đều không có vì chúng đều là chuỗi. Nó cũng có `MULTISET` cho phép trả về cây lồng nhau bằng một query mà không nhân dòng. Cái giá là bước sinh code trong build và **giấy phép tốn phí với Oracle, SQL Server, DB2** — với PostgreSQL và MySQL thì miễn phí.

**H: DTO projection lợi thế nào so với nạp entity?**
Ngoài việc lấy ít cột hơn, lợi ích lớn nhất mà nhiều người bỏ qua là **DTO không vào Persistence Context**. Nghĩa là không có snapshot cho dirty checking nên tiết kiệm khoảng một nửa RAM, không có proxy nên **không thể vô tình lazy load**, không phải flush lúc commit, và kết quả bất biến nên an toàn khi trả ra API. Em đo trên 10.000 bản ghi thì entity đầy đủ tốn 420 MB heap và 1.240 ms, còn DTO projection chỉ 38 MB và 310 ms. Nên riêng việc chuyển tầng đọc sang DTO — **không đổi thư viện nào cả** — đã giải quyết phần lớn vấn đề.

**H: Nếu chỉ được chọn một công cụ để thêm vào dự án Spring Boot hiện có?**
Không thêm gì cả. `JdbcClient` đã có sẵn trong Spring Boot 3.2 trở lên, và DTO projection đã có sẵn trong JPA. Em sẽ tạo một package `query` riêng dùng `JdbcClient` trả `record`, tách khỏi package `command` dùng JPA entity, rồi dùng ArchUnit ép ranh giới để tầng query không được chạm entity. Chỉ khi lược đồ database thay đổi thường xuyên và đội đã đau vì lỗi tên cột ở production thì việc thêm jOOQ mới xứng đáng — và lúc đó lý do là **type-safety**, không phải hiệu năng.

## Tóm tắt bài 5

- Mọi giải pháp không-ORM đều dùng chung **một pattern**: query chính → `SELECT IN` theo FK → map lại. Số query là `1 + số quan hệ`, **không phụ thuộc N**.
- Pattern đó giống hệt nhau ở Java, Go, .NET, Node — **học một lần, dùng mọi nơi**.
- **`JdbcTemplate`/`JdbcClient` đã có sẵn** trong Spring Boot — bước ra khỏi ORM rẻ nhất, không cần cài gì.
- **jOOQ** = an toàn kiểu lúc biên dịch + `MULTISET` trả cây không nhân dòng; giá phải trả là sinh code và **giấy phép tốn phí với Oracle/SQL Server**.
- **MyBatis** cũng có N+1 nếu dùng `<collection select=...>`. Dùng **nested resultMap**. Nhớ `#{}` an toàn, `${}` là lỗ hổng injection.
- **Spring Data JDBC** bỏ hẳn lazy loading nên N+1 không thể xảy ra vô hình; đổi lại luôn nạp cả aggregate → chỉ hợp aggregate nhỏ.
- **DTO projection ngay trong JPA** đã giúp giảm 11 lần RAM và 4 lần thời gian, vì DTO **không vào Persistence Context**.
- **`IN` dùng index tới khoảng 1.000 giá trị**; vượt xa ngưỡng thì planner chuyển sang Seq Scan. Chia lô, dùng bảng tạm, hoặc giữ ID trong subquery.
- Dùng `ANY(:ids)` thay `IN (:ids)` trên PostgreSQL để tránh phình plan cache.
- **Bỏ ORM không tự động hết N+1** — viết vòng lặp gọi DAO vẫn N+1 y hệt.

**Bài kế tiếp** → [Bài 6: Kiến trúc thực tế — triển khai và chuyển đổi dần](06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md)

**Quay lại** → [Bài 4: Sự thật về ORM trong production](04-su-that-ve-orm-trong-production.md)
