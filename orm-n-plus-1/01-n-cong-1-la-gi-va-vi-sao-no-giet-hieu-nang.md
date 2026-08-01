# Bài 1: N+1 là gì và vì sao nó giết hiệu năng

Bạn viết đúng **ba dòng code**. Không vòng lặp nào trông đáng ngờ, không có gì phức tạp:

```java
List<Author> authors = authorRepository.findAll();
for (Author a : authors) {
    System.out.println(a.getName() + ": " + a.getBooks().size());
}
```

Trên máy bạn, nó chạy trong **40 mili giây**. Code review thông qua. Test xanh.

Lên production, cùng đoạn code đó mất **4,2 giây**. Không ai sửa gì. Dữ liệu cũng chỉ có 20 tác giả.

Mở log SQL ra, và bạn đếm được **21 câu truy vấn**.

Đây là **N+1** — sát thủ thầm lặng nhất của hiệu năng backend. Nó ẩn trong code của hầu hết dự án, và gần như lập trình viên nào cũng từng dính ít nhất một lần mà không biết.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **ORM** (*Object-Relational Mapping*) | o-a-em | **Ánh xạ đối tượng–quan hệ** — biến bảng thành đối tượng để viết code cho gọn |
| **JPA** (*Java Persistence API*) | jây-pi-ây | **Chuẩn** của Java về lưu trữ đối tượng; Hibernate là bản cài đặt phổ biến nhất |
| **Entity** | en-ti-ti | **Thực thể** — một lớp Java ánh xạ tới một bảng |
| **Lazy loading** | lê-di | **Nạp lười** — chỉ nạp quan hệ khi thật sự chạm vào nó |
| **Eager loading** | i-gơ | **Nạp sớm** — nạp luôn quan hệ ngay từ đầu |
| **Proxy** | prốc-xi | **Đối tượng đại diện** — cái vỏ rỗng, chạm vào nó mới đi lấy dữ liệu thật |
| **Persistence Context** | pơ-sít-tần | **Ngữ cảnh lưu trữ** — bộ nhớ đệm cấp một, nơi Hibernate giữ entity đang quản lý |
| **Session / EntityManager** | | Phiên làm việc với database; vòng đời của Persistence Context |
| **`@OneToMany`** | | Quan hệ **một-nhiều** (một tác giả có nhiều sách) |
| **`@ManyToOne`** | | Quan hệ **nhiều-một** (nhiều sách thuộc một tác giả) |
| **`FetchType`** | phét-thai | Kiểu nạp: `LAZY` (lười) hay `EAGER` (sớm) |
| **Round-trip** | rao-trịp | **Chuyến đi khứ hồi** qua mạng — thứ thật sự tốn thời gian |
| **RTT** (*Round-Trip Time*) | | **Thời gian khứ hồi** của một chuyến đi mạng |
| **I/O-bound** | ai-âu | **Nặng chờ đợi** — nút thắt là chờ mạng/đĩa, không phải CPU |

> Bài này dùng Java + Spring Data JPA + Hibernate làm ví dụ chính vì đó là nơi N+1 gây đau nhất và có nhiều công cụ nhất. Nhưng **cơ chế giống hệt nhau** ở Django, Rails, Laravel, Sequelize, Prisma — chỉ khác tên gọi.

## Mô hình dữ liệu dùng suốt khoá

```text
   ┌──────────────┐                    ┌──────────────┐
   │   authors    │──┼──────────────< │    books     │
   ├──────────────┤                    ├──────────────┤
   │ id       (PK)│                    │ id       (PK)│
   │ name         │                    │ title        │
   │ country      │                    │ author_id(FK)│  ◄── khoá ngoại ở phía "nhiều"
   └──────────────┘                    │ published_at │
                                        └──────────────┘

   Một tác giả có NHIỀU sách.  Một cuốn sách thuộc MỘT tác giả.
```

```java
@Entity
@Table(name = "authors")
public class Author {
    @Id @GeneratedValue
    private Long id;
    private String name;
    private String country;

    @OneToMany(mappedBy = "author")          // mặc định là LAZY
    private List<Book> books = new ArrayList<>();
}

@Entity
@Table(name = "books")
public class Book {
    @Id @GeneratedValue
    private Long id;
    private String title;

    @ManyToOne                                // ⚠ mặc định là EAGER — nhớ kỹ điều này
    @JoinColumn(name = "author_id")
    private Author author;
}
```

## Kiến trúc và cách hoạt động: chuyện gì xảy ra bên trong

```text
   ① authorRepository.findAll()
      │
      ▼
      SELECT * FROM authors;                          ← ĐÂY LÀ "1" TRONG N+1
      → trả về 20 dòng
      │
      ▼
   ② Hibernate tạo 20 đối tượng Author.
      Nhưng trường `books` KHÔNG chứa danh sách sách thật —
      nó chứa một PROXY (cái vỏ rỗng, chưa có dữ liệu).

      Author#1 { name: "Nam Cao",   books: PersistentBag[CHƯA NẠP] }
      Author#2 { name: "Vũ Trọng Phụng", books: PersistentBag[CHƯA NẠP] }
      ...
      │
      ▼
   ③ Vòng lặp chạm vào a.getBooks().size()
      │
      │  Lần 1 → proxy tỉnh dậy → SELECT * FROM books WHERE author_id = 1;
      │  Lần 2 → proxy tỉnh dậy → SELECT * FROM books WHERE author_id = 2;
      │  Lần 3 → proxy tỉnh dậy → SELECT * FROM books WHERE author_id = 3;
      │  ...
      │  Lần 20 → SELECT * FROM books WHERE author_id = 20;
      ▼
      20 CÂU TRUY VẤN NỮA                             ← ĐÂY LÀ "N" TRONG N+1

   TỔNG: 1 + 20 = 21 CÂU TRUY VẤN.
```

**Đó là nguồn gốc cái tên:** một truy vấn cho danh sách, **cộng N** truy vấn cho từng phần tử.

Nhìn vào log Hibernate, dấu hiệu đặc trưng rất dễ nhận:

```text
Hibernate: select a1_0.id, a1_0.country, a1_0.name from authors a1_0
Hibernate: select b1_0.author_id, b1_0.id, b1_0.published_at, b1_0.title
             from books b1_0 where b1_0.author_id=?
Hibernate: select b1_0.author_id, b1_0.id, b1_0.published_at, b1_0.title
             from books b1_0 where b1_0.author_id=?
Hibernate: select b1_0.author_id, b1_0.id, b1_0.published_at, b1_0.title
             from books b1_0 where b1_0.author_id=?
   ▲
   HÀNG LOẠT CÂU GIỐNG HỆT NHAU, CHỈ KHÁC THAM SỐ.
   Đây là chữ ký của N+1.
```

## Lazy loading — thủ phạm, và vì sao nó vẫn là mặc định đúng

**Lazy loading** nghĩa là: *"đừng lấy thứ tôi chưa cần"*.

```text
   Ý TƯỞNG BAN ĐẦU RẤT HỢP LÝ:

   Màn hình chỉ hiện danh sách TÊN tác giả
   → nạp luôn cả sách của 20 tác giả là LÃNG PHÍ
   → chỉ nạp khi nào thật sự chạm vào .getBooks()

   → Đây là quyết định ĐÚNG cho phần lớn trường hợp.
```

Vấn đề nằm ở chỗ khác:

```java
a.getBooks()   // trông như đọc một thuộc tính trong bộ nhớ
               // THỰC CHẤT là một chuyến đi mạng tới database
```

**Và vì SQL bị giấu sau lớp ORM, code review nhìn qua vẫn thấy sạch đẹp.** Đó là lý do N+1 lọt qua mọi vòng kiểm tra và chỉ lộ mặt khi hệ thống bắt đầu chậm dần.

```text
   ĐÂY LÀ NGHỊCH LÝ:
      ORM sinh ra để bạn KHỎI PHẢI NGHĨ về SQL.
      Và chính vì bạn không nghĩ về SQL, bạn không thấy 21 câu truy vấn.

      Người ta gọi đây là LEAKY ABSTRACTION —
      lớp trừu tượng che đi chi tiết, nhưng chi tiết đó vẫn rò ra
      dưới dạng hoá đơn hiệu năng.
```

## Điều bất ngờ: vấn đề KHÔNG nằm ở database

Đây là phần quan trọng nhất của bài, và là chỗ nhiều người hiểu sai.

Từng câu truy vấn đó chạy **rất nhanh**:

```sql
EXPLAIN ANALYZE SELECT * FROM books WHERE author_id = 7;
--  Index Scan using books_author_id_idx  (actual time=0.018..0.024 rows=12)
--  Execution Time: 0.041 ms        ← BỐN PHẦN TRĂM MỘT MILI GIÂY
```

21 câu × 0,04 ms = **0,84 ms**. Vậy 4,2 giây từ đâu ra?

```text
   MỖI TRUY VẤN TỐN MỘT CHUYẾN ĐI KHỨ HỒI QUA MẠNG:

     App ──── câu lệnh ────► DB     ┐
         ◄─── kết quả ─────         │  RTT
                                     ┘

   Máy dev (database chạy localhost, Docker):
      RTT ≈ 0,1 ms  →  21 query = 2 ms        (KHÔNG THẤY GÌ)

   Production (app và DB khác máy, cùng data center):
      RTT ≈ 1 ms    →  21 query = 21 ms       (bắt đầu thấy)

   Production (khác availability zone):
      RTT ≈ 5 ms    →  21 query = 105 ms      (rõ ràng chậm)

   Production (200 tác giả, khác zone):
      RTT ≈ 5 ms    →  201 query = 1 GIÂY

   Cộng thêm: mỗi query đều phải PARSE, PLAN, và CHIẾM một kết nối trong pool.
```

**Đây là lý do N+1 không lộ ra trên máy dev.** Nó không phải bug của bạn — nó là bug của **khoảng cách**.

```text
   BẢNG ĐỘ TRỄ ĐÁNG THUỘC LÒNG:

      Đọc từ CPU cache             ~1 ns
      Truy cập RAM                 ~100 ns
      Đọc ngẫu nhiên từ SSD        ~100.000 ns   (0,1 ms)
      Round-trip trong data center ~500.000 ns   (0,5 ms)
      Round-trip Việt Nam → Mỹ     ~150.000.000 ns (150 ms)

   MỘT LẦN GỌI MẠNG ≈ MỘT TRIỆU PHÉP TÍNH CPU.

   → Nút thắt của backend hầu như KHÔNG BAO GIỜ là CPU.
     Nó là SỐ LẦN BẠN ĐI RA NGOÀI.
```

Vì thế, câu hỏi đúng khi tối ưu không phải *"code này chạy bao nhiêu phép tính"* mà là ***"request này đi ra ngoài mấy lần"***.

## Hai mặt của N+1 — và mặt thứ hai âm thầm hơn nhiều

### Mặt 1: phía collection (`@OneToMany`) — cái ai cũng biết

Đây chính là ví dụ Author/Book ở trên. Nó **dễ đoán** vì bạn thấy rõ vòng lặp.

```java
for (Author a : authors) {
    a.getBooks();          // ← nhìn là biết có thể có vấn đề
}
```

### Mặt 2: phía `@ManyToOne` — cái giết bạn mà không báo trước

**`@ManyToOne` và `@OneToOne` mặc định là `EAGER` trong JPA.** Đây là quyết định thiết kế gây tranh cãi nhất của chuẩn JPA, và nó tạo ra N+1 **ngay cả khi bạn không viết vòng lặp nào**.

```java
@Entity
public class Book {
    @ManyToOne                      // ⚠ KHÔNG ghi fetch → mặc định EAGER
    private Author author;
}
```

```java
// Bạn chỉ lấy danh sách sách. Không đụng gì tới author.
List<Book> books = bookRepository.findAll();
```

```text
Hibernate: select b1_0.id, b1_0.author_id, b1_0.published_at, b1_0.title from books b1_0
Hibernate: select a1_0.id, a1_0.country, a1_0.name from authors a1_0 where a1_0.id=?
Hibernate: select a1_0.id, a1_0.country, a1_0.name from authors a1_0 where a1_0.id=?
Hibernate: select a1_0.id, a1_0.country, a1_0.name from authors a1_0 where a1_0.id=?
   ...
   100 CUỐN SÁCH → 101 CÂU TRUY VẤN.
   VÀ BẠN KHÔNG VIẾT VÒNG LẶP NÀO CẢ.
```

**Vì sao lại thế?** Vì `EAGER` nghĩa là *"khi nạp Book thì phải có Author sẵn"*. Hibernate **không** tự động JOIN — với `findAll()` nó chạy câu chính trước, rồi phát hiện thiếu Author nên đi lấy từng cái một.

> **Luật số một khi làm việc với JPA:** **luôn khai `fetch = FetchType.LAZY` cho mọi `@ManyToOne` và `@OneToOne`.** Không có ngoại lệ. Nếu cần nạp sớm, hãy nói rõ ở **từng truy vấn** bằng `JOIN FETCH` hoặc `@EntityGraph` (bài 2) — chứ đừng ép ở tầng entity.

```java
// ✅ Cách khai đúng
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "author_id")
private Author author;

@OneToOne(fetch = FetchType.LAZY)
private Profile profile;
```

```text
   VÌ SAO EAGER Ở TẦNG ENTITY LUÔN SAI?

   Vì nó là quyết định TOÀN CỤC cho một nhu cầu CỤC BỘ.

   Màn hình A cần Author  → EAGER giúp ích
   Màn hình B không cần   → EAGER là lãng phí
   Job đếm số sách        → EAGER là thảm hoạ

   Một khai báo, ba hoàn cảnh, và bạn chỉ được chọn một lần.
   → Quyết định nạp gì THUỘC VỀ TRUY VẤN, không thuộc về entity.
```

### Ba biến thể khó thấy hơn

```java
// ① N+1 LỒNG NHAU — 1 + N + N×M
for (Author a : authors) {              // 1 query
    for (Book b : a.getBooks()) {       // N query
        b.getPublisher().getName();     // N×M query
    }
}
// 20 tác giả × 15 sách = 1 + 20 + 300 = 321 query

// ② N+1 TRONG TẦNG SERIALIZE — không thấy vòng lặp trong code Java
@GetMapping("/authors")
public List<Author> list() {
    return authorRepository.findAll();   // Jackson sẽ tự duyệt getBooks() khi serialize
}
// ⚠ Và đây còn là lỗ hổng lộ dữ liệu — đừng bao giờ trả Entity thẳng ra API

// ③ N+1 TRONG toString() hoặc equals()/hashCode()
@Override
public String toString() {
    return "Author{name=" + name + ", books=" + books + "}";   // ← chạm books
}
// Chỉ cần log.debug("{}", author) là nổ

// ④ N+1 TRONG TEMPLATE (Thymeleaf/JSP)
// <span th:text="${author.books.size()}">   ← lazy load trong lúc render HTML
```

Biến thể ④ đặc biệt nguy hiểm vì nó xảy ra **sau khi controller trả về**, và trong nhiều cấu hình thì Persistence Context đã đóng — dẫn tới `LazyInitializationException` thay vì N+1. Bài 6 sẽ nói kỹ về `open-in-view`.

## Đo thử để thấy con số thật

Đừng tin cảm giác. Hãy để Hibernate tự đếm:

```properties
# application.properties
spring.jpa.properties.hibernate.generate_statistics=true
logging.level.org.hibernate.stat=DEBUG
```

```text
Session Metrics {
    25123 nanoseconds spent acquiring 1 JDBC connections;
    0 nanoseconds spent releasing 0 JDBC connections;
    1284700 nanoseconds spent preparing 21 JDBC statements;   ◄── 21 CÂU
    4187293811 nanoseconds spent executing 21 JDBC statements; ◄── 4,18 GIÂY
    0 nanoseconds spent executing 0 JDBC batches;
}
```

Con số `21 JDBC statements` là bằng chứng. Bài 6 sẽ biến việc đếm này thành **test tự động** để nó không bao giờ quay lại.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** API `/api/authors` trả về trong 80 ms trên máy dev, nhưng **4,2 giây** trên production. Cùng code, cùng 20 bản ghi.

**Chẩn đoán — bốn bước, mỗi bước một câu lệnh:**

```properties
# ① BẬT ĐẾM QUERY (đừng chỉ bật show-sql — xem bài 6 vì sao)
spring.jpa.properties.hibernate.generate_statistics=true
```

```text
   → 21 JDBC statements cho 20 bản ghi.
     Quy tắc vàng: SỐ QUERY TĂNG THEO SỐ PHẦN TỬ = CHẮC CHẮN N+1.
```

```sql
-- ② XÁC NHẬN Ở PHÍA DATABASE — câu nào bị gọi nhiều bất thường?
SELECT calls, round(mean_exec_time::numeric, 3) AS tb_ms,
       round((calls * mean_exec_time / 1000)::numeric) AS tong_giay,
       left(query, 70) AS cau_lenh
FROM pg_stat_statements
ORDER BY calls DESC LIMIT 3;
```

```text
  calls   | tb_ms | tong_giay | cau_lenh
----------+-------+-----------+------------------------------------------
  984320  | 0.041 |        40 | select ... from books where author_id=$1
      42  | 2.100 |         0 | select ... from authors
   ▲
   Gần MỘT TRIỆU lượt gọi cùng một câu.

   VÀ CHÚ Ý: câu NHANH NHẤT (0,041ms) lại tốn TỔNG THỜI GIAN NHIỀU NHẤT.
   Đây là góc nhìn người mới hay bỏ qua khi đi tối ưu — họ đi tìm câu CHẬM NHẤT.
```

```bash
# ③ ĐO RTT — chứng minh nút thắt là MẠNG, không phải database
# Trên máy production:
ping -c 5 db-host
#  rtt min/avg/max = 4.8/5.2/6.1 ms

# 21 query × 5,2 ms = 109 ms cho RIÊNG phần đi lại
# Nếu là 200 tác giả: 201 × 5,2 = 1,05 GIÂY
```

```java
// ④ TÌM ĐÚNG DÒNG CODE gây ra nó — bật log kèm stack trace
// application-dev.properties
logging.level.org.hibernate.SQL=DEBUG
logging.level.org.hibernate.orm.jdbc.bind=TRACE
```

**Cách xử lý tạm thời (hotfix trong 5 phút) và cách xử lý đúng:**

```java
// ⚡ HOTFIX: JOIN FETCH — chi tiết ở bài 2
@Query("SELECT DISTINCT a FROM Author a LEFT JOIN FETCH a.books")
List<Author> findAllWithBooks();
// 21 query → 1 query
```

```text
   ⚠ NHƯNG hotfix này CÓ CÁI GIÁ mà bài 3 sẽ mổ xẻ:
     - nhân dòng (20 tác giả × 30 sách = 600 dòng)
     - vỡ phân trang
     - không dùng được cho HAI collection cùng lúc
   → Đọc bài 2 và bài 3 trước khi áp dụng rộng.
```

> **Tình huống 2:** Bạn chỉ gọi `bookRepository.findAll()`, **không viết vòng lặp nào**, mà log vẫn hiện 101 câu truy vấn.

**Chẩn đoán — đây là N+1 do `EAGER` mặc định của `@ManyToOne`:**

```bash
# Quét toàn bộ dự án tìm quan hệ KHÔNG khai fetch type
grep -rn "@ManyToOne" --include=*.java src/ | grep -v "FetchType.LAZY"
grep -rn "@OneToOne"  --include=*.java src/ | grep -v "FetchType.LAZY"
```

```java
// Kết quả điển hình:
// src/main/java/com/shop/domain/Book.java:23:    @ManyToOne
// src/main/java/com/shop/domain/Order.java:31:   @ManyToOne
// src/main/java/com/shop/domain/User.java:45:    @OneToOne
//    ▲ Cả ba đều đang là EAGER
```

**Cách xử lý — đổi hết sang `LAZY`, rồi khai nhu cầu ở từng truy vấn:**

```java
// ① Đổi ở entity
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "author_id")
private Author author;

// ② Nơi nào THẬT SỰ cần author thì khai rõ tại truy vấn đó
@Query("SELECT b FROM Book b JOIN FETCH b.author")
List<Book> findAllWithAuthor();
```

**Chặn tái diễn — để máy canh, đừng để người nhớ:**

```xml
<!-- ArchUnit test hoặc Checkstyle rule -->
<module name="RegexpSinglelineJava">
    <property name="format" value="@(ManyToOne|OneToOne)\s*(\(\s*\)|$)"/>
    <property name="message" value="Phải khai fetch = FetchType.LAZY"/>
</module>
```

```java
// Hoặc ArchUnit — chạy như một test bình thường
@ArchTest
static final ArchRule manyToOne_phai_lazy = fields()
    .that().areAnnotatedWith(ManyToOne.class)
    .should(new ArchCondition<JavaField>("khai fetch = LAZY") {
        @Override public void check(JavaField f, ConditionEvents ev) {
            ManyToOne a = f.getAnnotationOfType(ManyToOne.class);
            if (a.fetch() != FetchType.LAZY) {
                ev.add(SimpleConditionEvent.violated(f,
                    f.getFullName() + " đang là EAGER — nguồn N+1"));
            }
        }
    });
```

## Khi nào N+1 lại KHÔNG đáng sửa

Để công bằng — không phải lúc nào cũng phải chữa:

```text
   ✅ CHẤP NHẬN ĐƯỢC khi:

   ① N NHỎ VÀ CỐ ĐỊNH
      5 phần tử, database cùng máy: 5 × 0,1 ms = 0,5 ms.
      Sửa nó là tối ưu hoá sớm.

   ② DỮ LIỆU ĐÃ NẰM TRONG PERSISTENCE CONTEXT
      Hibernate có bộ nhớ đệm cấp một — nếu Author#7 đã được nạp,
      lần sau chạm vào nó KHÔNG sinh query mới.

   ③ CÓ CACHE CẤP HAI (second-level cache)
      Bảng tra cứu ít đổi (danh mục, tỉnh thành) được cache
      → N lần tra cache còn rẻ hơn một JOIN nặng.

   ④ JOIN GÂY FANOUT KHỔNG LỒ
      100 đơn × 50 dòng × 10 thanh toán = 50.000 dòng qua mạng
      cho 100 đơn hàng. Lúc này nhiều query nhỏ lại RẺ HƠN.
```

> **Quy tắc:** đo trước, đừng đoán. Câu hỏi đúng không phải *"có N+1 không"* mà là ***"tổng thời gian request là bao nhiêu, và phần nào chiếm nhiều nhất"***.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `@ManyToOne` không khai `fetch` | **EAGER mặc định** → N+1 dù không viết vòng lặp | Luôn `fetch = FetchType.LAZY` |
| `@OneToOne` không khai `fetch` | Như trên, và khó chữa hơn | Luôn `LAZY` |
| Chỉ test trên máy dev | RTT ≈ 0 nên N+1 **không lộ** | Đếm số query, không đo thời gian |
| Trả Entity thẳng ra API | N+1 lúc serialize + **lộ dữ liệu** | Dùng DTO projection (bài 4) |
| `toString()` in cả collection | Chỉ cần `log.debug` là nổ | Không đưa collection vào `toString()` |
| Lazy load trong template | `LazyInitializationException` hoặc N+1 khi render | Nạp đủ trong service (bài 6) |
| Đi tìm câu query **chậm nhất** | Thủ phạm là câu **nhanh nhất nhưng gọi triệu lần** | Sắp `pg_stat_statements` theo `calls` |
| Nghĩ vấn đề ở database | Database chỉ tốn 0,04 ms/câu — nút thắt là **RTT mạng** | Đo `ping` tới DB host |
| Đọc code thấy "sạch" là yên tâm | ORM **giấu SQL** — code sạch vẫn có 201 query | Đếm query, đừng đọc code |
| Sửa N+1 bằng `JOIN FETCH` khắp nơi | Gây nhân dòng, vỡ phân trang | Đọc bài 3 trước |

## Câu hỏi phỏng vấn hay gặp

**H: N+1 query là gì?**
Là khi bạn chạy một truy vấn lấy danh sách N phần tử, rồi chạy thêm một truy vấn cho **mỗi** phần tử — tổng cộng N+1. Với 20 tác giả thì đó là 21 câu. Nguyên nhân trực tiếp là **lazy loading**: `a.getBooks()` trông như đọc một thuộc tính trong bộ nhớ, nhưng thực chất là một chuyến đi mạng tới database.

**H: Vì sao nó không lộ trên máy dev?**
Vì vấn đề **không nằm ở database** mà nằm ở **chuyến đi khứ hồi qua mạng**. Từng câu truy vấn chỉ tốn khoảng 0,04 ms — 21 câu là chưa tới 1 ms xử lý. Nhưng trên localhost RTT gần bằng 0, còn production RTT là 5 ms nên 21 câu thành 105 ms, và 200 phần tử thành hơn một giây. Một lần gọi mạng tương đương khoảng **một triệu phép tính CPU**, nên câu hỏi đúng khi tối ưu backend là *"request này đi ra ngoài mấy lần"*, không phải *"chạy bao nhiêu phép tính"*.

**H: N+1 chỉ xảy ra khi có vòng lặp phải không?**
Không — và đây là phần nguy hiểm hơn. `@ManyToOne` và `@OneToOne` **mặc định là `EAGER`** trong JPA, nên chỉ cần gọi `bookRepository.findAll()` là đã có 101 câu truy vấn mà **không viết vòng lặp nào**. Luật của em là luôn khai `fetch = FetchType.LAZY` cho mọi `@ManyToOne`/`@OneToOne`, vì quyết định nạp gì **thuộc về truy vấn, không thuộc về entity** — một khai báo toàn cục không thể đúng cho ba màn hình có nhu cầu khác nhau.

**H: Làm sao phát hiện N+1?**
Dấu hiệu đặc trưng trong log là **hàng loạt câu giống hệt nhau chỉ khác tham số**. Nhưng đọc log bằng mắt không đủ — em bật `hibernate.generate_statistics` để nó đếm giúp, và quy tắc vàng là **nếu số query tăng theo số phần tử thì chắc chắn dính**. Ở phía database thì `pg_stat_statements` sắp theo `calls` sẽ lộ ngay: thủ phạm thường là câu **nhanh nhất** nhưng bị gọi cả triệu lần, chứ không phải câu chậm nhất.

**H: Vì sao ORM lại tạo ra vấn đề này?**
Vì nó **giấu SQL đi quá tốt**. Lazy loading bản thân là quyết định đúng — đừng lấy thứ chưa cần. Nhưng khi SQL bị giấu sau lớp đối tượng, `a.getBooks()` trông như truy cập bộ nhớ, và code review nhìn qua vẫn thấy sạch đẹp. Đây là ví dụ kinh điển của **leaky abstraction**: lớp trừu tượng che đi chi tiết, nhưng chi tiết vẫn rò ra dưới dạng hoá đơn hiệu năng.

## Tóm tắt bài 1

- N+1 = **1 truy vấn cho danh sách + N truy vấn cho từng phần tử**; thủ phạm trực tiếp là **lazy loading**.
- Vấn đề **không phải database** (0,04 ms/câu) mà là **chuyến đi khứ hồi qua mạng** — đó là lý do nó **không lộ trên máy dev**.
- **Một lần gọi mạng ≈ một triệu phép tính CPU.** Câu hỏi đúng: *"request này đi ra ngoài mấy lần?"*
- **`@ManyToOne` và `@OneToOne` mặc định là `EAGER`** → N+1 xảy ra **ngay cả khi không viết vòng lặp**. Luôn khai `LAZY`.
- **Quyết định nạp gì thuộc về TRUY VẤN, không thuộc về ENTITY** — một khai báo toàn cục không đúng cho mọi màn hình.
- Bốn biến thể khó thấy: **lồng nhau**, **lúc serialize**, **trong `toString()`**, **trong template**.
- Thủ phạm thường là câu **nhanh nhất nhưng gọi nhiều nhất** — sắp `pg_stat_statements` theo `calls`, đừng đi tìm câu chậm nhất.
- N+1 đôi khi chấp nhận được: N nhỏ, đã có trong Persistence Context, có cache cấp hai, hoặc JOIN gây fanout khổng lồ.

**Bài kế tiếp** → [Bài 2: Bốn cách khắc phục bằng chính ORM](02-bon-cach-khac-phuc-bang-chinh-orm.md)
