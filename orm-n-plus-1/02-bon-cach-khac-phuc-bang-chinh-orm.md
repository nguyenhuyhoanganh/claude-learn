# Bài 2: Bốn cách khắc phục bằng chính ORM

Bài 1 kết thúc ở con số **21 câu truy vấn** cho 20 tác giả. Câu hỏi tự nhiên tiếp theo: *sửa thế nào?*

Câu trả lời không phải một cách, mà là **bốn** — và chúng cho ra số lượng query khác nhau, chi phí khác nhau, giới hạn khác nhau. Người mới thường học đúng một cách (`JOIN FETCH`) rồi dùng nó cho mọi tình huống, và sau đó gặp `MultipleBagFetchException` lúc 2 giờ sáng mà không hiểu vì sao.

Bài này trình bày cả bốn cách, **so sánh số query bằng con số thật**. Bài 3 sẽ mổ xẻ cái giá của từng cách.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **JPQL** (*Java Persistence Query Language*) | jây-pi-kiu-eo | **Ngôn ngữ truy vấn của JPA** — giống SQL nhưng viết trên **entity** thay vì bảng |
| **`JOIN FETCH`** | join phét | Lệnh JPQL bảo Hibernate **nối bảng VÀ nạp luôn** dữ liệu vào entity |
| **`@EntityGraph`** | en-ti-ti gráp | **Đồ thị thực thể** — khai báo *"truy vấn này cần nạp sẵn những nhánh nào"* bằng annotation |
| **`@BatchSize`** | bát-si-zờ | **Kích thước lô** — gom N lần lazy load thành từng lô `IN (...)` |
| **`default_batch_fetch_size`** | | Cấu hình bật `@BatchSize` cho **toàn bộ** ứng dụng |
| **Fetch plan** | phét-plan | **Kế hoạch nạp** — danh sách các nhánh quan hệ sẽ nạp cùng truy vấn |
| **Fetch join** | | Tên gọi khác của `JOIN FETCH` |
| **`DISTINCT`** | đít-tinh | Loại bỏ **bản ghi trùng** — trong JPQL nó lọc ở tầng Java, không phải SQL |
| **Projection** | prồ-jếch-sần | **Phép chiếu** — chỉ lấy đúng vài cột cần, không nạp cả entity |
| **DTO** (*Data Transfer Object*) | đi-ti-âu | **Đối tượng truyền dữ liệu** — lớp phẳng chỉ chứa field cần trả ra |
| **`IN` clause** | in-clo | Mệnh đề `WHERE id IN (1,2,3,...)` |
| **Hydration** | hai-đrây-sần | **Quá trình đổ dữ liệu** từ dòng SQL vào đối tượng Java |

## Kiến trúc: bốn cách, bốn cơ chế hoàn toàn khác nhau

```text
   BÀI TOÁN: 20 tác giả, mỗi người ~30 cuốn sách. Cần cả tên tác giả lẫn tên sách.

   ┌─────────────────────────────────────────────────────────────────┐
   │ ❌ MẶC ĐỊNH (lazy)          →  1 + 20 = 21 QUERY               │
   │    SELECT * FROM authors                                        │
   │    SELECT * FROM books WHERE author_id = 1                      │
   │    SELECT * FROM books WHERE author_id = 2  ... (×20)          │
   ├─────────────────────────────────────────────────────────────────┤
   │ ① JOIN FETCH                →  1 QUERY (nhưng 600 DÒNG)        │
   │    SELECT a.*, b.* FROM authors a LEFT JOIN books b ...          │
   │                                                                  │
   │ ② @EntityGraph              →  1 QUERY (y hệt ①, khác cú pháp) │
   │    Cùng SQL, nhưng khai bằng annotation → tái dùng được         │
   │                                                                  │
   │ ③ @BatchSize                →  1 + 2 = 3 QUERY (KHÔNG nhân dòng)│
   │    SELECT * FROM authors                                        │
   │    SELECT * FROM books WHERE author_id IN (1..10)               │
   │    SELECT * FROM books WHERE author_id IN (11..20)              │
   │                                                                  │
   │ ④ QUERY TAY + MAP           →  2 QUERY (kiểm soát tuyệt đối)   │
   │    SELECT * FROM authors                                        │
   │    SELECT * FROM books WHERE author_id IN (1..20)               │
   │    rồi tự gom bằng Map<Long, List<Book>>                        │
   └─────────────────────────────────────────────────────────────────┘
```

Chú ý ngay: **ít query nhất không có nghĩa là nhanh nhất.** Cách ① chỉ 1 query nhưng kéo 600 dòng qua mạng. Cách ④ tốn 2 query nhưng chỉ kéo 620 dòng *không trùng lặp*. Bài 3 sẽ đo cụ thể.

## Cách ① — `JOIN FETCH`: khai ngay trong câu truy vấn

Đây là cách trực tiếp nhất: bạn nói thẳng với Hibernate *"nối bảng và nạp luôn vào entity"*.

```java
public interface AuthorRepository extends JpaRepository<Author, Long> {

    @Query("SELECT a FROM Author a LEFT JOIN FETCH a.books")
    List<Author> findAllWithBooks();
}
```

```sql
-- Hibernate sinh ra ĐÚNG MỘT câu:
select a1_0.id, a1_0.country, a1_0.name,
       b1_0.author_id, b1_0.id, b1_0.published_at, b1_0.title
from authors a1_0
left join books b1_0 on a1_0.id = b1_0.author_id
```

### `JOIN` và `JOIN FETCH` khác nhau thế nào — chỗ này 90% người mới nhầm

```text
   JOIN (thường)          → chỉ dùng để LỌC. Dữ liệu KHÔNG được nạp vào entity.
   JOIN FETCH             → vừa lọc, VỪA nạp dữ liệu vào entity.
```

```java
// ❌ SAI — tưởng đã sửa N+1 nhưng KHÔNG
@Query("SELECT a FROM Author a LEFT JOIN a.books")
List<Author> broken();
// → Hibernate JOIN thật, nhưng KHÔNG đổ books vào entity.
//   Vòng lặp sau đó vẫn lazy load → VẪN 21 QUERY.
//   Tệ hơn: JOIN làm nhân dòng nên bạn còn nhận về 600 Author trùng nhau!

// ✅ ĐÚNG
@Query("SELECT DISTINCT a FROM Author a LEFT JOIN FETCH a.books")
List<Author> fixed();
```

**Vì sao phải có `DISTINCT`?** Vì `LEFT JOIN` nhân dòng: một tác giả có 30 sách sẽ xuất hiện 30 lần trong kết quả SQL, và Hibernate sẽ trả về 30 tham chiếu tới **cùng một** đối tượng `Author`.

```text
   KẾT QUẢ SQL THÔ:
   author_id | author_name | book_title
   ----------+-------------+------------------
        1    | Nam Cao     | Chí Phèo
        1    | Nam Cao     | Lão Hạc            ← author_id 1 lặp 30 lần
        1    | Nam Cao     | Sống Mòn
        ...
        2    | Vũ Trọng Phụng | Số Đỏ

   KHÔNG DISTINCT → List<Author> có 600 phần tử (nhưng chỉ 20 đối tượng thật)
   CÓ DISTINCT    → List<Author> có 20 phần tử

   ⚠ QUAN TRỌNG: DISTINCT trong JPQL KHÔNG sinh ra SELECT DISTINCT trong SQL.
     Hibernate lọc trùng Ở TẦNG JAVA (dùng LinkedHashSet).
     → Database vẫn trả 600 dòng qua mạng. DISTINCT chỉ dọn dẹp phía Java.
```

> **Cập nhật cho Hibernate 6 / Spring Boot 3 trở lên:** Hibernate 6 **tự động** loại trùng entity ở tầng Java, nên `DISTINCT` không còn bắt buộc. Nhưng viết vào vẫn vô hại và giúp code tương thích ngược. Nếu bạn dùng Hibernate 5, `DISTINCT` là **bắt buộc**.

### Fetch nhiều tầng

```java
// Nạp cả 3 tầng: Author → Book → Publisher
@Query("""
    SELECT DISTINCT a FROM Author a
    LEFT JOIN FETCH a.books b
    LEFT JOIN FETCH b.publisher
    """)
List<Author> findAllDeep();
```

```text
   ⚠ Mỗi tầng JOIN FETCH nhân dòng thêm một lần:
      20 tác giả × 30 sách × 1 nhà XB = 600 dòng     (còn chịu được)
      20 tác giả × 30 sách × 5 phiên bản = 3.000 dòng (bắt đầu nguy hiểm)
   → Bài 3 sẽ giải thích vì sao đây là chỗ hệ thống nổ.
```

### Giới hạn cứng của `JOIN FETCH`

```java
// ❌ NỔ NGAY khi khởi động — MultipleBagFetchException
@Query("""
    SELECT a FROM Author a
    LEFT JOIN FETCH a.books
    LEFT JOIN FETCH a.awards
    """)
List<Author> boom();
```

```text
org.hibernate.loader.MultipleBagFetchException:
    cannot simultaneously fetch multiple bags: [Author.books, Author.awards]
```

Không thể `JOIN FETCH` **hai `List` cùng lúc**. Bài 3 giải thích lý do và ba cách vòng qua.

## Cách ② — `@EntityGraph`: cùng SQL, nhưng tách khỏi câu query

`@EntityGraph` sinh ra **đúng câu SQL như `JOIN FETCH`**, nhưng khai bằng annotation thay vì viết trong chuỗi JPQL.

```java
public interface AuthorRepository extends JpaRepository<Author, Long> {

    // ① Dùng ngay trên method có sẵn của Spring Data — KHÔNG cần viết @Query
    @EntityGraph(attributePaths = {"books"})
    List<Author> findAll();

    // ② Dùng với derived query method
    @EntityGraph(attributePaths = {"books"})
    List<Author> findByCountry(String country);

    // ③ Nhiều tầng — dùng dấu chấm
    @EntityGraph(attributePaths = {"books", "books.publisher"})
    Optional<Author> findById(Long id);
}
```

**Ưu điểm lớn nhất:** dùng được với **method sinh tự động** của Spring Data. Với `JOIN FETCH` bạn buộc phải tự viết JPQL cho mọi biến thể — thêm một bộ lọc là thêm một câu query.

```text
   SO SÁNH TRỰC TIẾP:

   JOIN FETCH                          @EntityGraph
   ─────────────────────────────       ──────────────────────────────
   Viết trong chuỗi @Query             Khai bằng annotation
   Phải tự viết cả câu JPQL            Gắn lên method có sẵn
   Chuỗi → lỗi chính tả chỉ lộ         Đường dẫn thuộc tính →
     lúc chạy                            IDE tự hoàn thành
   Muốn 3 bộ lọc → viết 3 câu          Muốn 3 bộ lọc → 3 method,
     JPQL gần giống nhau                 cùng một graph
   Kiểm soát chi tiết hơn              Ít linh hoạt hơn
     (WHERE, ORDER BY tuỳ ý)

   ⚠ CẢ HAI SINH RA CÙNG MỘT CÂU SQL → CÙNG MỘT CÁI GIÁ (nhân dòng, vỡ phân trang).
     @EntityGraph KHÔNG "tốt hơn" — nó chỉ SẠCH HƠN VỀ CÚ PHÁP.
```

### Named EntityGraph — khi cùng một fetch plan dùng ở nhiều nơi

```java
@Entity
@NamedEntityGraph(
    name = "Author.withBooksAndPublisher",
    attributeNodes = @NamedAttributeNode(value = "books", subgraph = "booksGraph"),
    subgraphs = @NamedSubgraph(
        name = "booksGraph",
        attributeNodes = @NamedAttributeNode("publisher"))
)
public class Author { ... }
```

```java
@EntityGraph("Author.withBooksAndPublisher")
List<Author> findByCountry(String country);
```

### Hai kiểu EntityGraph — `FETCH` và `LOAD`

```java
@EntityGraph(attributePaths = {"books"}, type = EntityGraphType.FETCH)  // mặc định
@EntityGraph(attributePaths = {"books"}, type = EntityGraphType.LOAD)
```

```text
   FETCH (mặc định — nên dùng):
      Nhánh trong graph  → nạp sớm
      Nhánh KHÔNG trong graph → ép thành LAZY, BẤT KỂ khai gì ở entity
      → Đây chính là công cụ VÔ HIỆU HOÁ @ManyToOne EAGER cứng đầu!

   LOAD:
      Nhánh trong graph  → nạp sớm
      Nhánh KHÔNG trong graph → giữ nguyên khai báo ở entity (EAGER vẫn EAGER)
      → Vẫn dính N+1 từ những @ManyToOne EAGER khác.
```

Đây là một mẹo ít người biết: nếu bạn **không thể sửa entity** (thư viện dùng chung, code cũ), `EntityGraphType.FETCH` cho phép bạn ép mọi thứ ngoài graph về `LAZY` ngay tại truy vấn đó.

## Cách ③ — `@BatchSize`: gom N lần lazy load thành vài lô

Đây là cách **thông minh nhất** mà cũng **ít người dùng nhất**. Nó không xoá bỏ lazy loading — nó làm cho lazy loading **rẻ đi**.

```java
@Entity
public class Author {
    @OneToMany(mappedBy = "author")
    @BatchSize(size = 10)          // ← thêm đúng một dòng
    private List<Book> books;
}
```

```text
   CƠ CHẾ — điều Hibernate thật sự làm:

   ① SELECT * FROM authors                          → 20 Author, books là proxy

   ② Vòng lặp chạm authors.get(0).getBooks()
      │
      │  Hibernate KHÔNG chỉ nạp cho author #1.
      │  Nó nhìn vào Persistence Context, thấy còn 19 proxy CÙNG LOẠI
      │  đang chờ, và gom 10 cái đầu tiên lại:
      ▼
      SELECT * FROM books WHERE author_id IN (1,2,3,4,5,6,7,8,9,10)

   ③ Chạm authors.get(10).getBooks()
      → SELECT * FROM books WHERE author_id IN (11,...,20)

   TỔNG: 1 + 2 = 3 QUERY.  (thay vì 21)

   VÀ QUAN TRỌNG NHẤT: KHÔNG NHÂN DÒNG.
      Câu 1 trả 20 dòng, câu 2+3 trả 600 dòng sách — nhưng là
      600 dòng SÁCH THẬT, không phải 600 dòng tác giả lặp lại.
```

### Bật toàn cục — một dòng cấu hình, cả ứng dụng hưởng lợi

```properties
# application.properties
spring.jpa.properties.hibernate.default_batch_fetch_size=25
```

```text
   ĐÂY LÀ THỨ NÊN BẬT Ở MỌI DỰ ÁN SPRING BOOT DÙNG JPA.

   Nó không sửa được N+1 hoàn toàn, nhưng biến trường hợp XẤU NHẤT
   từ 201 query xuống 9 query — một lưới an toàn cho những chỗ bạn
   quên tối ưu.

   Giá trị nên chọn: 10–50.
      Quá nhỏ (5)   → vẫn nhiều query
      Quá lớn (1000)→ mệnh đề IN khổng lồ, plan cache của DB bị phá
      Khuyến nghị   → 25 hoặc 50
```

### `@BatchSize` cũng chữa được `@ManyToOne`

```java
@Entity
@BatchSize(size = 25)              // ← đặt trên CLASS, không phải field
public class Author { ... }

@Entity
public class Book {
    @ManyToOne(fetch = FetchType.LAZY)
    private Author author;          // → nạp theo lô nhờ @BatchSize trên class Author
}
```

```text
   ⚠ CHỖ NÀY DỄ NHẦM:

   @BatchSize trên FIELD  → áp dụng cho collection đó (@OneToMany)
   @BatchSize trên CLASS  → áp dụng khi entity đó bị nạp qua proxy (@ManyToOne)

   Đặt sai chỗ → annotation bị bỏ qua LẶNG LẼ, không có cảnh báo nào.
```

### Điểm mạnh quyết định: `@BatchSize` là cách DUY NHẤT không phá phân trang

```java
@BatchSize(size = 25)
private List<Book> books;

// Repository giữ nguyên, KHÔNG cần @Query
Page<Author> page = authorRepository.findAll(PageRequest.of(0, 20));
```

```sql
-- ✅ LIMIT chạy ĐÚNG ở tầng database
select ... from authors limit 20 offset 0;
select ... from books where author_id in (1,...,20);
```

So với `JOIN FETCH` + phân trang, thứ sẽ **kéo toàn bộ bảng về RAM rồi mới cắt** (bài 3 mổ xẻ chi tiết cảnh báo `HHH90003004`).

### Nhược điểm thật sự

```text
   ⚠ TỐI ƯU VÔ HÌNH:
      Đọc code service KHÔNG thấy dấu hiệu nào của tối ưu.
      Người sau xoá @BatchSize khi refactor entity → N+1 quay lại
      mà không ai biết, vì test vẫn xanh (chỉ chậm hơn).

   → Cách chặn: viết test ĐẾM SỐ QUERY (bài 8), không phải test chức năng.
```

## Cách ④ — Query tay rồi gom bằng `Map`: kiểm soát tuyệt đối

Đây là cách **không dùng ma thuật của ORM**. Bạn chạy hai truy vấn rõ ràng rồi tự ghép trong Java.

```java
@Service
@RequiredArgsConstructor
public class AuthorQueryService {

    private final AuthorRepository authorRepository;
    private final BookRepository bookRepository;

    public List<AuthorView> loadAuthorsWithBooks() {
        // ① Truy vấn chính — không kèm quan hệ nào
        List<Author> authors = authorRepository.findAll();
        if (authors.isEmpty()) return List.of();

        List<Long> authorIds = authors.stream().map(Author::getId).toList();

        // ② Một truy vấn duy nhất lấy TẤT CẢ sách của các tác giả đó
        List<Book> books = bookRepository.findByAuthorIdIn(authorIds);

        // ③ Gom về Map để tra cứu O(1)
        Map<Long, List<Book>> booksByAuthor = books.stream()
                .collect(Collectors.groupingBy(b -> b.getAuthorId()));

        // ④ Ghép lại trong bộ nhớ
        return authors.stream()
                .map(a -> new AuthorView(
                        a.getId(),
                        a.getName(),
                        booksByAuthor.getOrDefault(a.getId(), List.of())))
                .toList();
    }
}
```

```text
   ĐÚNG 2 QUERY. KHÔNG NHÂN DÒNG. KHÔNG MA THUẬT.

   SELECT * FROM authors;                                  → 20 dòng
   SELECT * FROM books WHERE author_id IN (1,...,20);      → 600 dòng

   Tổng dữ liệu qua mạng: 620 dòng
   (so với JOIN FETCH: 600 dòng NHƯNG mỗi dòng lặp lại cả thông tin tác giả)
```

### Vì sao đây là pattern quan trọng nhất trong cả khoá

```text
   PATTERN NÀY CÓ TÊN: "query chính → SELECT IN theo khoá ngoại → map lại"

   Nó không phải mẹo vặt của Java. Nó là CÁCH LÀM CHUẨN ở:
      · MyBatis     (<collection> với column="id" select="...")
      · GraphQL     (DataLoader — chính xác cùng ý tưởng)
      · Go / sqlc   (viết tay, ai cũng làm thế)
      · Rust / sqlx (viết tay)
      · Node / Kysely, Drizzle

   → Khi bạn bỏ ORM (bài 5), đây LÀ thứ bạn sẽ viết.
     Học nó bây giờ, không phải để "thay thế ORM" mà để hiểu
     mọi thư viện khác đang làm gì bên dưới.
```

### Kết hợp với DTO projection để tiết kiệm hơn nữa

```java
public interface BookRepository extends JpaRepository<Book, Long> {

    // Chỉ lấy 3 cột cần, KHÔNG nạp entity Book đầy đủ
    @Query("""
        SELECT new com.shop.dto.BookSummary(b.author.id, b.id, b.title)
        FROM Book b WHERE b.author.id IN :ids
        """)
    List<BookSummary> findSummariesByAuthorIds(@Param("ids") List<Long> ids);
}

public record BookSummary(Long authorId, Long bookId, String title) {}
```

```text
   LỢI ÍCH KÉP:
   ① Chỉ 3 cột thay vì 12 cột → ít dữ liệu qua mạng
   ② Hibernate KHÔNG đưa record vào Persistence Context
      → không tốn RAM cho dirty checking
      → không có nguy cơ lazy load ngoài ý muốn về sau

   Bài 5 sẽ đi sâu vì sao DTO projection là mặc định ở phần lớn
   hệ thống production, chứ không phải entity.
```

## Bảng so sánh bốn cách — con số thật

Đo trên 20 tác giả × 30 sách, PostgreSQL, RTT 1 ms:

| Tiêu chí | Mặc định (lazy) | ① `JOIN FETCH` | ② `@EntityGraph` | ③ `@BatchSize(25)` | ④ Query tay + Map |
|---|---|---|---|---|---|
| **Số query** | 21 | **1** | **1** | 2 | 2 |
| **Số dòng qua mạng** | 620 | **600 (bị nhân)** | **600 (bị nhân)** | 620 | 620 |
| **Dữ liệu trùng lặp** | không | **có — tên tác giả lặp 30 lần** | **có** | không | không |
| **Phân trang hoạt động?** | ✅ | ❌ **vỡ, kéo hết về RAM** | ❌ **vỡ** | ✅ **đúng** | ✅ **đúng** |
| **Fetch 2 collection cùng lúc?** | ✅ | ❌ `MultipleBagFetchException` | ❌ | ✅ | ✅ |
| **Nhìn code thấy tối ưu?** | – | ✅ rõ ràng | ✅ rõ ràng | ❌ **vô hình** | ✅ rất rõ |
| **Dùng với method Spring Data sẵn?** | – | ❌ phải viết JPQL | ✅ | ✅ | ❌ |
| **Lượng code phải viết** | 0 | ít | ít | **1 dòng** | nhiều nhất |
| **Kiểm soát SQL** | không | vừa | ít | ít | **tuyệt đối** |

```text
   ĐỌC BẢNG NÀY THẾ NÀO:

   Không có cột nào thắng hết. Đó chính là thông điệp.

   · Cần MỘT bản ghi kèm đủ quan hệ  → JOIN FETCH / @EntityGraph
   · Cần DANH SÁCH CÓ PHÂN TRANG     → @BatchSize (cách duy nhất đúng)
   · Cần NHIỀU collection cùng lúc   → @BatchSize hoặc query tay
   · Màn hình đọc nặng, quan trọng   → query tay + DTO projection
   · Lưới an toàn toàn ứng dụng      → default_batch_fetch_size=25
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Bạn đã thêm `LEFT JOIN a.books` vào câu query nhưng log vẫn hiện 21 câu, và `List<Author>` trả về **600 phần tử** thay vì 20.

**Chẩn đoán:** thiếu chữ `FETCH`.

```java
// Câu đang có
@Query("SELECT a FROM Author a LEFT JOIN a.books")
```

```text
   HAI TRIỆU CHỨNG CÙNG LÚC = CHỮ KÝ CỦA LỖI NÀY:
   ① Vẫn N+1  → vì JOIN không nạp dữ liệu vào entity
   ② 600 phần tử → vì JOIN vẫn nhân dòng ở tầng SQL

   Bạn nhận đủ TÁC HẠI của JOIN mà không nhận được LỢI ÍCH nào.
```

**Cách xử lý:**

```java
@Query("SELECT DISTINCT a FROM Author a LEFT JOIN FETCH a.books")
List<Author> findAllWithBooks();
```

**Chặn tái diễn:**

```java
@Test
void findAllWithBooks_chi_chay_dung_mot_query() {
    statistics.clear();
    List<Author> result = authorRepository.findAllWithBooks();
    result.forEach(a -> a.getBooks().size());   // ép chạm collection

    assertThat(result).hasSize(20);                       // ← bắt lỗi nhân dòng
    assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);  // ← bắt N+1
}
```

> **Tình huống 2:** Ứng dụng chạy tốt 8 tháng. Một hôm bạn thêm `@OneToMany List<Award> awards` và **cả ứng dụng không khởi động được**.

```text
org.hibernate.loader.MultipleBagFetchException:
    cannot simultaneously fetch multiple bags: [Author.books, Author.awards]
```

**Chẩn đoán:** có một truy vấn đang `JOIN FETCH` hai `List` cùng lúc. Hibernate từ chối vì không thể phân biệt dòng nào thuộc collection nào sau khi tích Descartes xảy ra (bài 3 giải thích cặn kẽ).

**Ba cách xử lý, xếp theo thứ tự nên thử:**

```java
// ✅ CÁCH 1 (KHUYẾN NGHỊ) — bỏ JOIN FETCH, dùng @BatchSize
@OneToMany(mappedBy = "author") @BatchSize(size = 25)
private List<Book> books;

@OneToMany(mappedBy = "author") @BatchSize(size = 25)
private List<Award> awards;
// → 1 + 1 + 1 = 3 query, không nhân dòng, phân trang vẫn chạy

// ⚠ CÁCH 2 — đổi List thành Set
@OneToMany(mappedBy = "author")
private Set<Book> books = new LinkedHashSet<>();
// → Hết exception, NHƯNG tích Descartes VẪN XẢY RA ở tầng SQL.
//   30 sách × 5 giải thưởng = 150 dòng cho MỘT tác giả.
//   Đây là "chữa triệu chứng, giấu bệnh".

// ✅ CÁCH 3 — tách thành hai truy vấn, tận dụng Persistence Context
@Transactional(readOnly = true)
public List<Author> loadFull() {
    List<Author> authors = repo.findAllWithBooks();   // JOIN FETCH books
    repo.findAllWithAwards();                          // JOIN FETCH awards
    return authors;   // ← cùng Persistence Context nên authors đã có ĐỦ CẢ HAI
}
```

**Cách 3 hoạt động nhờ đâu?** Vì trong cùng một transaction, Hibernate giữ **một** đối tượng `Author#1` duy nhất trong Persistence Context. Truy vấn thứ hai không tạo đối tượng mới — nó **đổ thêm** dữ liệu `awards` vào chính đối tượng đó. Đây là mẹo hữu ích nhưng cần hiểu rõ mới dùng an toàn.

> **Tình huống 3:** Bạn thêm `@BatchSize(size = 25)` nhưng log không đổi — vẫn 101 query.

**Chẩn đoán:** đặt annotation **sai vị trí**.

```java
// ❌ SAI — muốn tối ưu Book.author (@ManyToOne) mà lại đặt trên field
@Entity
public class Book {
    @ManyToOne(fetch = FetchType.LAZY)
    @BatchSize(size = 25)              // ← Hibernate BỎ QUA, không cảnh báo
    private Author author;
}

// ✅ ĐÚNG — với @ManyToOne, @BatchSize phải đặt trên CLASS bên nhận
@Entity
@BatchSize(size = 25)                  // ← đặt trên class Author
public class Author { ... }
```

**Chặn tái diễn — đơn giản nhất là bỏ hẳn việc rải annotation:**

```properties
spring.jpa.properties.hibernate.default_batch_fetch_size=25
# Một dòng, áp dụng toàn ứng dụng, không có chỗ nào để đặt sai.
```

> **Tình huống 4:** API danh sách sản phẩm có phân trang. Sau khi thêm `JOIN FETCH` để chữa N+1, request chuyển từ 3 giây sang **hết RAM** (`OutOfMemoryError`) trên production.

**Chẩn đoán — đây là cái bẫy nguy hiểm nhất trong bài:**

```text
WARN o.h.h.i.a.QueryTranslatorImpl:
    HHH90003004: firstResult/maxResults specified with collection fetch;
    applying in memory
                                    ▲
    "applying in memory" = TÔI SẼ KÉO TOÀN BỘ BẢNG VỀ RAM RỒI MỚI CẮT TRANG.

    Bảng 2 triệu sản phẩm → Hibernate cố nạp cả 2 triệu để trả về 20 dòng.
```

**Cách xử lý — dùng `@BatchSize`, cách duy nhất phân trang đúng:**

```java
@OneToMany(mappedBy = "product") @BatchSize(size = 50)
private List<Review> reviews;

// Repository giữ nguyên method mặc định
Page<Product> page = productRepository.findAll(pageable);
// → LIMIT 20 chạy ĐÚNG ở tầng database
```

**Hoặc pattern hai bước (dùng khi buộc phải giữ `JOIN FETCH`):**

```java
// Bước 1 — phân trang trên ID, KHÔNG fetch gì cả
@Query("SELECT p.id FROM Product p ORDER BY p.createdAt DESC")
Page<Long> findIdsPage(Pageable pageable);

// Bước 2 — fetch đầy đủ cho đúng 20 ID đó
@Query("SELECT DISTINCT p FROM Product p LEFT JOIN FETCH p.reviews WHERE p.id IN :ids")
List<Product> findWithReviews(@Param("ids") List<Long> ids);
```

**Chặn tái diễn — biến cảnh báo thành lỗi:**

```properties
# Bắt HHH90003004 làm CI đỏ thay vì trôi qua trong log production
logging.level.org.hibernate.orm.query=WARN
```

```java
@Test
void khong_duoc_co_canh_bao_phan_trang_in_memory() {
    // dùng ListAppender của Logback bắt log trong lúc chạy test
    assertThat(logs.list)
        .noneMatch(e -> e.getMessage().contains("HHH90003004"));
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Viết `JOIN` thay vì `JOIN FETCH` | Vẫn N+1 **và** nhân dòng — tệ nhất cả hai | Luôn có chữ `FETCH` |
| Quên `DISTINCT` (Hibernate 5) | `List` có 600 phần tử thay vì 20 | Thêm `DISTINCT`; Hibernate 6 tự xử lý |
| Tưởng `DISTINCT` giảm dữ liệu qua mạng | Không — nó lọc **ở tầng Java**, DB vẫn trả 600 dòng | Muốn giảm thật thì dùng `@BatchSize` |
| `JOIN FETCH` + `Pageable` | `HHH90003004` → kéo cả bảng về RAM → OOM | `@BatchSize` hoặc pattern hai bước |
| `JOIN FETCH` hai `List` | `MultipleBagFetchException` **lúc khởi động** | `@BatchSize` cho cả hai |
| Đổi `List` → `Set` để hết exception | Hết lỗi nhưng tích Descartes vẫn xảy ra | Hiểu rằng đó là giấu bệnh, không phải chữa |
| `@BatchSize` trên field của `@ManyToOne` | Bị **bỏ qua lặng lẽ**, không cảnh báo | Đặt trên **class** bên nhận |
| `default_batch_fetch_size` quá lớn (1000) | Mệnh đề `IN` khổng lồ, phá plan cache của DB | Dùng 25–50 |
| Chỉ dựa vào `@BatchSize` | Tối ưu **vô hình** — người sau xoá mất | Viết test **đếm query** |
| `@EntityGraph` type `LOAD` | Vẫn dính N+1 từ `@ManyToOne EAGER` khác | Dùng `FETCH` (mặc định) |
| Dùng `JOIN FETCH` cho mọi thứ | Nhân dòng, tốn RAM, vỡ phân trang | Chọn cách theo bảng so sánh |

## Câu hỏi phỏng vấn hay gặp

**H: `JOIN` và `JOIN FETCH` khác nhau chỗ nào?**
`JOIN` chỉ dùng để **lọc** — nó nối bảng ở tầng SQL nhưng **không đổ dữ liệu vào entity**, nên sau đó bạn vẫn lazy load và vẫn N+1. `JOIN FETCH` vừa nối vừa nạp. Nhầm hai cái này là lỗi tệ nhất vì bạn nhận đủ tác hại của JOIN — nhân dòng, `List` phình lên 600 phần tử — mà không được lợi ích nào.

**H: `DISTINCT` trong JPQL có sinh ra `SELECT DISTINCT` trong SQL không?**
Không, và đây là điểm nhiều người hiểu sai. Hibernate lọc trùng **ở tầng Java** bằng `LinkedHashSet`, database vẫn trả về đủ 600 dòng qua mạng. Nên `DISTINCT` chỉ dọn dẹp kết quả phía ứng dụng chứ **không** giảm chi phí truyền dữ liệu. Từ Hibernate 6 thì việc lọc này là tự động nên `DISTINCT` không còn bắt buộc.

**H: `JOIN FETCH` và `@EntityGraph` — cái nào tốt hơn?**
Chúng sinh ra **cùng một câu SQL**, nên cùng một cái giá: nhân dòng, vỡ phân trang, không fetch được hai `List`. Khác biệt chỉ ở cú pháp: `@EntityGraph` gắn được lên method sinh tự động của Spring Data nên không phải viết lại JPQL cho mỗi bộ lọc, còn `JOIN FETCH` linh hoạt hơn khi cần `WHERE`/`ORDER BY` phức tạp. Em thường dùng `@EntityGraph` cho truy vấn đơn giản, `JOIN FETCH` khi cần điều kiện riêng.

**H: Vì sao `@BatchSize` là cách duy nhất phân trang đúng?**
Vì nó **không đụng vào câu truy vấn chính**. `LIMIT` vẫn chạy ở tầng database như bình thường, rồi Hibernate mới nạp collection theo lô `IN (...)`. Còn `JOIN FETCH` làm nhân dòng nên `LIMIT 20` sẽ cắt nhầm — Hibernate biết điều đó nên nó **bỏ `LIMIT` đi, kéo cả bảng về RAM rồi mới cắt trang**, và in cảnh báo `HHH90003004`. Với bảng vài triệu dòng thì đó là `OutOfMemoryError`.

**H: Nếu chỉ được chọn một thứ để bật ở mọi dự án JPA thì là gì?**
`hibernate.default_batch_fetch_size=25`. Một dòng cấu hình, không sửa code nào, và nó biến trường hợp xấu nhất từ 201 query xuống 9 query. Nó không thay thế việc tối ưu từng truy vấn, nhưng nó là **lưới an toàn** cho những chỗ đội chưa kịp xử lý — mà chỗ như vậy thì dự án nào cũng có.

**H: Vì sao lại có `MultipleBagFetchException`?**
Vì `List` trong Hibernate là **bag** — tập hợp có thể trùng và **không có thứ tự định danh**. Khi fetch hai bag cùng lúc, SQL tạo tích Descartes và Hibernate không có cách nào phân biệt dòng nào thuộc collection nào, nên nó **từ chối ngay lúc khởi động** thay vì trả về dữ liệu sai. Cách chữa đúng là dùng `@BatchSize` cho cả hai; đổi `List` sang `Set` chỉ làm hết exception chứ tích Descartes vẫn xảy ra ở tầng SQL.

## Tóm tắt bài 2

- Bốn cách chữa N+1 bằng ORM: **`JOIN FETCH`**, **`@EntityGraph`**, **`@BatchSize`**, **query tay + `Map`**.
- `JOIN` ≠ `JOIN FETCH`. Thiếu chữ `FETCH` = vẫn N+1 **và** thêm nhân dòng.
- `JOIN FETCH` và `@EntityGraph` sinh **cùng một SQL** → cùng một cái giá. `@EntityGraph` chỉ sạch hơn về cú pháp.
- `DISTINCT` trong JPQL lọc **ở tầng Java**, không giảm dữ liệu qua mạng.
- **`@BatchSize` là cách DUY NHẤT vừa chữa N+1 vừa giữ phân trang chạy đúng** — và là cách duy nhất không nhân dòng.
- Bật `hibernate.default_batch_fetch_size=25` ở mọi dự án làm lưới an toàn.
- `@BatchSize` trên **field** → cho `@OneToMany`; trên **class** → cho `@ManyToOne`. Đặt sai bị bỏ qua lặng lẽ.
- Pattern **"query chính → `SELECT IN` theo FK → map lại"** là nền tảng của mọi cách làm không-ORM (bài 5).
- Ít query nhất **không** đồng nghĩa nhanh nhất — `JOIN FETCH` 1 query nhưng kéo 600 dòng trùng lặp.

**Bài kế tiếp** → [Bài 3: Cái giá của từng cách](03-cai-gia-cua-tung-cach.md)

**Quay lại** → [Bài 1: N+1 là gì và vì sao nó giết hiệu năng](01-n-cong-1-la-gi-va-vi-sao-no-giet-hieu-nang.md)
