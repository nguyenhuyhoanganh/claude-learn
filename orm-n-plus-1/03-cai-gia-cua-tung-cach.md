# Bài 3: Cái giá của từng cách — vì sao chữa N+1 lại tạo ra sự cố tệ hơn

Có một mẫu sự cố lặp đi lặp lại ở mọi công ty:

```text
   Tuần 1:  Đội phát hiện N+1 trên API danh sách đơn hàng. 201 query. 3 giây.
   Tuần 1:  Thêm JOIN FETCH. Xuống 1 query. 180 ms. Ăn mừng.
   Tuần 6:  Dữ liệu tăng gấp 4. API tăng lên 9 giây.
   Tuần 7:  Thêm JOIN FETCH tầng thứ hai. Pod bắt đầu bị OOMKilled ngẫu nhiên.
   Tuần 8:  Thêm một @OneToMany mới. ỨNG DỤNG KHÔNG KHỞI ĐỘNG ĐƯỢC NỮA.
```

Không ai làm sai bước nào cả. Mỗi bước đều là cách chữa được dạy trong mọi bài hướng dẫn. Vấn đề là **không ai nói cho họ biết cái giá**.

Bài này là phần mà hầu hết tài liệu về N+1 bỏ qua.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Row multiplication** | rau-mun-ti-pli-cây-sần | **Nhân dòng** — JOIN làm một bản ghi cha lặp lại theo số con |
| **Cartesian product** | ca-tê-di-ần | **Tích Descartes** — mọi tổ hợp của hai tập; `m × n` dòng |
| **Fanout** | phen-aoát | **Độ toè** — một dòng cha nở ra bao nhiêu dòng kết quả |
| **Bag** | bắc | **Túi** — collection **cho phép trùng** và **không nhớ thứ tự**; `List` không `@OrderColumn` là bag |
| **`MultipleBagFetchException`** | | Lỗi khi fetch **hai bag** cùng lúc |
| **`OutOfMemoryError`** | | **Hết bộ nhớ heap** — JVM không cấp phát nổi nữa |
| **Heap** | híp | **Vùng nhớ động** của JVM, nơi chứa mọi đối tượng |
| **OOMKilled** | | Kubernetes **giết pod** vì vượt giới hạn RAM |
| **`HHH90003004`** | | **Mã cảnh báo Hibernate**: phân trang bị chuyển vào bộ nhớ |
| **In-memory pagination** | | **Phân trang trong bộ nhớ** — kéo hết về rồi mới cắt |
| **Dirty checking** | đơ-ti chếch-king | Hibernate **so sánh snapshot** để biết entity nào đã đổi |
| **Snapshot** | snáp-sốt | **Bản chụp** trạng thái entity lúc nạp, dùng để so sánh |
| **Plan cache** | plan-két | **Bộ nhớ đệm kế hoạch thực thi** của database |
| **TPS** (*Transactions Per Second*) | ti-pi-ét | **Số giao dịch mỗi giây** |

## Cái giá ①: nhân dòng — phép nhân âm thầm

Đây là cái giá của `JOIN FETCH` và `@EntityGraph`. Nó không phải bug — nó là **bản chất của SQL JOIN**.

```text
   BẢNG authors (20 dòng)          BẢNG books (600 dòng)
   ┌────┬──────────┐                ┌────┬───────────┬───────────┐
   │ id │ name     │                │ id │ title     │ author_id │
   ├────┼──────────┤                ├────┼───────────┼───────────┤
   │  1 │ Nam Cao  │                │  1 │ Chí Phèo  │     1     │
   │  2 │ Vũ T.P.  │                │  2 │ Lão Hạc   │     1     │
   └────┴──────────┘                │ .. │ ...       │     1     │  ← 30 cuốn
                                     └────┴───────────┴───────────┘

   SELECT a.*, b.* FROM authors a LEFT JOIN books b ON a.id = b.author_id

   ┌────┬──────────┬─────────┬───────────┐
   │ id │ name     │ country │ book      │
   ├────┼──────────┼─────────┼───────────┤
   │  1 │ Nam Cao  │ VN      │ Chí Phèo  │  ┐
   │  1 │ Nam Cao  │ VN      │ Lão Hạc   │  │  MỌI CỘT CỦA TÁC GIẢ
   │  1 │ Nam Cao  │ VN      │ Sống Mòn  │  ├─ ĐƯỢC GỬI LẠI 30 LẦN
   │  1 │ Nam Cao  │ VN      │ ...       │  │  QUA MẠNG
   │  1 │ Nam Cao  │ VN      │ (×30)     │  ┘
   │  2 │ Vũ T.P.  │ VN      │ Số Đỏ     │
   └────┴──────────┴─────────┴───────────┘

   20 tác giả × 30 sách = 600 DÒNG cho 620 bản ghi thật.
```

**Tại sao điều này quan trọng — phép tính bằng byte thật:**

```text
   Giả sử bản ghi Author nặng 500 byte (name, bio, address, metadata...)
   và Book nặng 200 byte.

   ① QUERY TAY (2 query):
      authors: 20 × 500 byte  = 10 KB
      books  : 600 × 200 byte = 120 KB
      ─────────────────────────────────
      TỔNG QUA MẠNG            ≈ 130 KB

   ② JOIN FETCH (1 query):
      600 dòng × (500 + 200) byte = 420 KB
      ─────────────────────────────────
      TỔNG QUA MẠNG            ≈ 420 KB   ← GẤP 3,2 LẦN

   → 1 QUERY nhưng GẤP 3 LẦN DỮ LIỆU.
     "Ít query hơn" KHÔNG đồng nghĩa "nhanh hơn".
```

Và trường Author càng nặng thì tỉ lệ càng tệ:

| Kích thước bản ghi cha | Query tay (2 query) | `JOIN FETCH` (1 query) | Tỉ lệ lãng phí |
|---|---|---|---|
| Cha 100 B, con 200 B | 122 KB | 180 KB | 1,5× |
| Cha 500 B, con 200 B | 130 KB | 420 KB | **3,2×** |
| Cha 2 KB (có mô tả dài) | 160 KB | 1,3 MB | **8,1×** |
| Cha 50 KB (có ảnh base64) | 1,1 MB | 30 MB | **27×** |

> **Quy tắc rút ra:** `JOIN FETCH` càng tệ khi **bản ghi cha càng nặng** và **fanout càng lớn**. Nó tốt nhất khi lấy **một** bản ghi kèm quan hệ (`findById`), tệ nhất khi lấy **danh sách lớn**.

## Cái giá ②: tích Descartes — khi hai collection gặp nhau

Nhân dòng ở trên vẫn còn *tuyến tính*. Tích Descartes là *nhân*, và đó là chỗ hệ thống nổ thật.

```text
   MỘT tác giả:  30 sách,  5 giải thưởng

   ❌ NGƯỜI TA HAY NGHĨ:   30 + 5 = 35 dòng
   ✅ SỰ THẬT:             30 × 5 = 150 DÒNG

   Vì sao? Vì SQL JOIN không biết "books" và "awards" là hai nhánh riêng.
   Nó ghép MỌI tổ hợp:

   ┌──────────┬───────────┬──────────────┐
   │ author   │ book      │ award        │
   ├──────────┼───────────┼──────────────┤
   │ Nam Cao  │ Chí Phèo  │ Giải A       │  ┐
   │ Nam Cao  │ Chí Phèo  │ Giải B       │  │ CÙNG cuốn Chí Phèo
   │ Nam Cao  │ Chí Phèo  │ Giải C       │  ├ lặp 5 lần
   │ Nam Cao  │ Chí Phèo  │ Giải D       │  │
   │ Nam Cao  │ Chí Phèo  │ Giải E       │  ┘
   │ Nam Cao  │ Lão Hạc   │ Giải A       │  ← rồi lặp lại cho cuốn tiếp theo
   │ ...      │ ...       │ ...          │
   └──────────┴───────────┴──────────────┘
```

**Với danh sách 20 tác giả:**

```text
   20 × 30 × 5 = 3.000 DÒNG cho 20 tác giả + 600 sách + 100 giải thưởng.
                                  ▲
                   Dữ liệu THẬT chỉ có 720 bản ghi.
                   Bạn kéo về gấp HƠN 4 LẦN.
```

**Ba collection thì sao?**

```text
   20 tác giả × 30 sách × 5 giải × 10 bài phỏng vấn = 30.000 DÒNG

   Mỗi dòng 700 byte → 21 MB cho MỘT REQUEST.
   100 request đồng thời → 2,1 GB heap.
   → OOMKilled.
```

Đây chính xác là kịch bản ở đầu bài: mỗi tuần thêm một `JOIN FETCH` trông vô hại, nhưng chi phí **nhân lên**, không cộng vào.

### Vì sao Hibernate cấm — `MultipleBagFetchException` thật ra là ân huệ

```java
@Query("SELECT a FROM Author a LEFT JOIN FETCH a.books LEFT JOIN FETCH a.awards")
```

```text
org.hibernate.loader.MultipleBagFetchException:
    cannot simultaneously fetch multiple bags: [Author.books, Author.awards]
```

Nhiều người coi đây là "Hibernate làm khó". Thật ra nó đang **cứu bạn khỏi dữ liệu sai**.

```text
   BAG (túi) = List KHÔNG có @OrderColumn
             = collection cho phép TRÙNG và KHÔNG NHỚ THỨ TỰ

   Sau tích Descartes, Hibernate nhận 150 dòng cho một tác giả.
   Nó cần trả lời: "Nam Cao có bao nhiêu sách?"

   · Nếu là SET → dùng equals/hashCode loại trùng → biết chắc là 30.
   · Nếu là BAG → KHÔNG có cơ chế loại trùng → không thể biết
                  30 là số thật hay do lặp. Có thể ra 150.

   → Hibernate CHỌN NỔ LÚC KHỞI ĐỘNG thay vì trả về size() SAI lúc chạy.
     Đây là thiết kế fail-fast đúng đắn.
```

### Vì sao đổi `List` → `Set` là "giấu bệnh", không phải "chữa bệnh"

```java
@OneToMany(mappedBy = "author")
private Set<Book> books = new LinkedHashSet<>();     // hết exception
```

```text
   ✅ HẾT EXCEPTION.   ❌ TÍCH DESCARTES VẪN XẢY RA.

   Database vẫn trả 3.000 dòng qua mạng.
   Hibernate vẫn phải xử lý 3.000 dòng đó.
   Chỉ khác: sau khi xử lý xong, Set loại trùng nên size() ra đúng.

   Bạn trả TOÀN BỘ chi phí, chỉ được kết quả đúng.

   ⚠ VÀ CÓ CÁI GIÁ MỚI: Set cần equals()/hashCode().
     Viết sai equals() trên entity là một trong những lỗi
     khó gỡ nhất của JPA (id null trước khi persist → hashCode đổi
     sau khi lưu → phần tử "biến mất" khỏi HashSet).
```

**Cách chữa đúng vẫn là `@BatchSize`:**

```java
@OneToMany(mappedBy = "author") @BatchSize(size = 25)
private List<Book> books;

@OneToMany(mappedBy = "author") @BatchSize(size = 25)
private List<Award> awards;
```

```text
   3 query:
      SELECT * FROM authors                                  →   20 dòng
      SELECT * FROM books  WHERE author_id IN (1..20)        →  600 dòng
      SELECT * FROM awards WHERE author_id IN (1..20)        →  100 dòng
      ────────────────────────────────────────────────────────────────
      TỔNG                                                      720 dòng

   So với JOIN FETCH: 3.000 dòng.
   → NHIỀU QUERY HƠN, ÍT DỮ LIỆU HƠN 4 LẦN.
```

## Cái giá ③: vỡ phân trang — `HHH90003004`

Đây là cái giá **nguy hiểm nhất** vì nó không nổ ngay. Nó chỉ **âm thầm** làm hệ thống chậm dần rồi chết khi dữ liệu đủ lớn.

```java
@Query("SELECT DISTINCT p FROM Product p LEFT JOIN FETCH p.reviews")
Page<Product> findAllWithReviews(Pageable pageable);
```

```text
WARN o.h.h.internal.ast.QueryTranslatorImpl:
    HHH90003004: firstResult/maxResults specified with collection fetch;
    applying in memory
```

**Dịch nghĩa dòng cảnh báo này:** *"Bạn vừa yêu cầu phân trang trên một truy vấn có fetch collection. Tôi không dùng `LIMIT` được, nên tôi sẽ kéo **toàn bộ** kết quả về RAM rồi mới cắt trang."*

```text
   ĐIỀU HIBERNATE THẬT SỰ LÀM:

   Bạn viết:                     Hibernate chạy:
   ┌───────────────────┐         ┌────────────────────────────────────┐
   │ PageRequest       │         │ SELECT p.*, r.*                     │
   │   .of(0, 20)      │  ────►  │ FROM products p                     │
   │                   │         │ LEFT JOIN reviews r ON ...          │
   │ "cho tôi 20 dòng" │         │      ⚠ KHÔNG CÓ LIMIT ⚠            │
   └───────────────────┘         └────────────────────────────────────┘
                                              │
                                              ▼
                                  2.000.000 sản phẩm × 15 đánh giá
                                        = 30 TRIỆU DÒNG
                                              │
                                              ▼
                                  Đổ hết vào heap JVM
                                              │
                                              ▼
                                  Lọc trùng bằng LinkedHashSet
                                              │
                                              ▼
                                  Cắt lấy 20 phần tử đầu
                                              │
                                              ▼
                                  ☠ OutOfMemoryError: Java heap space
```

### Vì sao Hibernate buộc phải làm vậy?

```text
   NẾU nó dùng LIMIT 20 ở tầng SQL:

   ┌────┬─────────────┬────────────┐
   │ id │ product     │ review     │
   ├────┼─────────────┼────────────┤
   │  1 │ iPhone      │ review #1  │  ┐
   │  1 │ iPhone      │ review #2  │  │  iPhone có 15 đánh giá
   │  1 │ iPhone      │ review #3  │  ├  chiếm 15 trong 20 dòng
   │ .. │ iPhone      │ (×15)      │  ┘
   │  2 │ Galaxy      │ review #1  │  ┐
   │  2 │ Galaxy      │ review #2  │  ├ CẮT NGANG ở đây
   └────┴─────────────┴────────────┘  ┘

   KẾT QUẢ: trang 1 chỉ có 2 SẢN PHẨM (không phải 20),
            và Galaxy chỉ có 5/15 đánh giá → DỮ LIỆU SAI.

   → Hibernate chọn ĐÚNG-NHƯNG-CHẬM thay vì NHANH-NHƯNG-SAI.
     Nhưng nó chỉ WARN, không throw. Và không ai đọc log WARN.
```

### Ba cách xử lý, xếp theo thứ tự ưu tiên

```java
// ✅ CÁCH 1 (TỐT NHẤT) — @BatchSize, không đụng gì tới truy vấn chính
@OneToMany(mappedBy = "product") @BatchSize(size = 50)
private List<Review> reviews;

Page<Product> page = productRepository.findAll(pageable);
// SQL: SELECT ... FROM products LIMIT 20 OFFSET 0;     ← LIMIT chạy ĐÚNG
//      SELECT ... FROM reviews WHERE product_id IN (1..20);
```

```java
// ✅ CÁCH 2 — pattern hai bước (khi buộc phải giữ JOIN FETCH)
@Query("SELECT p.id FROM Product p WHERE p.active = true ORDER BY p.createdAt DESC")
Page<Long> findActiveIds(Pageable pageable);          // phân trang trên ID — LIMIT chạy đúng

@Query("SELECT DISTINCT p FROM Product p LEFT JOIN FETCH p.reviews WHERE p.id IN :ids")
List<Product> fetchByIds(@Param("ids") List<Long> ids);   // fetch cho đúng 20 ID

// ⚠ Bẫy: JOIN FETCH KHÔNG giữ ORDER BY của bước 1 → phải sắp lại trong Java
Map<Long, Product> byId = fetchByIds(idPage.getContent()).stream()
        .collect(Collectors.toMap(Product::getId, p -> p));
List<Product> ordered = idPage.getContent().stream().map(byId::get).toList();
```

```java
// ⚠ CÁCH 3 — chỉ khi fanout NHỎ và CỐ ĐỊNH (< 5 con mỗi cha)
// Chấp nhận in-memory pagination vì tổng dữ liệu vẫn nhỏ.
// Phải có giới hạn cứng ở tầng WHERE để không bao giờ quét cả bảng.
```

## Cái giá ④: `@BatchSize` — tối ưu vô hình

`@BatchSize` thắng gần hết các bảng so sánh ở bài 2. Nhưng nó có một điểm yếu thật sự, và nó thuộc về **con người**, không phải máy.

```java
// File: Author.java
@OneToMany(mappedBy = "author")
@BatchSize(size = 25)             // ← toàn bộ "tối ưu" nằm ở ĐÂY
private List<Book> books;
```

```java
// File: AuthorService.java — cách đó 4 thư mục, người đọc KHÔNG thấy gì
public List<AuthorDto> list() {
    return authorRepository.findAll().stream()
            .map(a -> new AuthorDto(a.getName(), a.getBooks().size()))
            .toList();
}
```

```text
   ĐỌC AuthorService.java, BẠN KHÔNG THỂ BIẾT ĐOẠN NÀY CHẠY 3 QUERY HAY 21 QUERY.

   Thông tin đó nằm ở:
      · annotation trên entity (file khác), HOẶC
      · application.properties (file khác nữa), HOẶC
      · cả hai, và cái nào thắng thì phải tra tài liệu

   HẬU QUẢ THỰC TẾ:
   ① Người mới refactor entity, xoá annotation "thừa" → N+1 quay lại
   ② Test chức năng VẪN XANH (kết quả đúng, chỉ chậm hơn)
   ③ Không ai biết cho tới khi production chậm 3 tháng sau
```

**Ba cái giá kỹ thuật khác của `@BatchSize`:**

```text
   ① MỆNH ĐỀ IN THAY ĐỔI KÍCH THƯỚC → PHÁ PLAN CACHE
      WHERE author_id IN (?,?,?, ... 25 dấu ?)   ← plan #1
      WHERE author_id IN (?,?,?, ... 7 dấu ?)    ← plan #2 (lô cuối)
      PostgreSQL/Oracle coi đây là HAI câu lệnh khác nhau.
      → mỗi kích thước lô là một entry mới trong plan cache.
      (Hibernate 6 đệm bằng padding nên đỡ hơn, nhưng vẫn có.)

   ② KHÔNG KIỂM SOÁT ĐƯỢC THỨ TỰ NẠP
      Không biết trước Hibernate gom lô nào với lô nào.
      Khó dự đoán khi debug.

   ③ CHỈ HOẠT ĐỘNG TRONG PERSISTENCE CONTEXT MỞ
      Ra ngoài @Transactional → LazyInitializationException.
      @BatchSize không cứu được điều đó (xem bài 8, phần open-in-view).
```

**Cách bù đắp — biến cái vô hình thành cái kiểm chứng được:**

```java
@Test
void danh_sach_tac_gia_khong_duoc_vuot_qua_5_query() {
    statistics.clear();

    authorService.list();

    assertThat(statistics.getPrepareStatementCount())
        .as("N+1 quay lại — kiểm tra @BatchSize còn không")
        .isLessThanOrEqualTo(5);
}
```

Đây là lý do bài 8 tồn tại: với `@BatchSize`, **test đếm query không phải tuỳ chọn, nó là bắt buộc**.

## Bảng cái giá — nhìn một lần thấy hết

| | `JOIN FETCH` / `@EntityGraph` | `@BatchSize` | Query tay + `Map` |
|---|---|---|---|
| **Số query** | 1 | 1 + ⌈N/size⌉ | 2 |
| **Nhân dòng** | ❌ **có** | ✅ không | ✅ không |
| **Tích Descartes (2 collection)** | ❌ **m × n** | ✅ không | ✅ không |
| **Dữ liệu qua mạng (ví dụ trên)** | 420 KB | 130 KB | 130 KB |
| **Phân trang** | ❌ **vỡ — `HHH90003004`** | ✅ đúng | ✅ đúng |
| **Fetch 2 collection** | ❌ **`MultipleBagFetchException`** | ✅ được | ✅ được |
| **Rủi ro OOM** | ❌ **cao** | thấp | thấp |
| **Đọc code thấy được?** | ✅ có | ❌ **vô hình** | ✅ rất rõ |
| **Ảnh hưởng plan cache** | không | ⚠ có | không |
| **Lượng code** | ít | **1 dòng** | nhiều |
| **Rủi ro người sau phá vỡ** | thấp | ❌ **cao** | thấp |

## Cây quyết định: khi nào chọn cách nào

```text
   BẠN ĐANG LẤY BAO NHIÊU BẢN GHI CHA?
   │
   ├─ MỘT (findById, trang chi tiết)
   │  └─► JOIN FETCH / @EntityGraph
   │      Không nhân dòng đáng kể (1 cha × n con = n dòng).
   │      Đây là chỗ JOIN FETCH ĐÚNG NHẤT.
   │
   └─ DANH SÁCH
      │
      ├─ CÓ PHÂN TRANG?
      │  │
      │  ├─ CÓ ─► @BatchSize   (BẮT BUỘC — cách duy nhất không vỡ)
      │  │        + test đếm query
      │  │
      │  └─ KHÔNG
      │     │
      │     ├─ CẦN ≥ 2 COLLECTION? ─► @BatchSize hoặc query tay
      │     │
      │     ├─ BẢN GHI CHA NẶNG (> 1 KB)? ─► query tay + DTO projection
      │     │
      │     ├─ FANOUT LỚN (> 20 con/cha)? ─► @BatchSize
      │     │
      │     └─ Cha nhẹ, fanout nhỏ, không phân trang
      │        └─► JOIN FETCH (chấp nhận được)
      │
      └─ ĐÂY LÀ MÀN HÌNH ĐỌC QUAN TRỌNG NHẤT CỦA SẢN PHẨM?
         └─► BỎ ENTITY, viết SQL + DTO projection  (bài 5, bài 6)
             Đây là chỗ mọi đội có quy mô đều đi tới.

   ▸ VÀ DÙ CHỌN GÌ: bật hibernate.default_batch_fetch_size=25 làm lưới an toàn.
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Pod Kubernetes bị `OOMKilled` ngẫu nhiên 2–3 lần mỗi ngày, luôn vào giờ cao điểm. Heap 2 GB. Không có memory leak — heap dump cho thấy toàn `Object[]` và entity.

**Chẩn đoán:**

```bash
# ① Xác nhận nguyên nhân là OOM chứ không phải crash khác
kubectl describe pod api-7d9f | grep -A3 "Last State"
#   Last State:  Terminated
#     Reason:    OOMKilled
#     Exit Code: 137
```

```bash
# ② Chụp heap dump lúc RAM cao rồi phân tích
jcmd 1 GC.heap_dump /tmp/dump.hprof
# Mở bằng Eclipse MAT → Dominator Tree
```

```text
   KẾT QUẢ MAT:
   Class Name                                    | Retained Heap
   ----------------------------------------------|---------------
   org.hibernate.engine.internal.StatefulPersistenceContext | 1.4 GB
     └ java.util.HashMap  (entityEntries)         | 1.3 GB
        └ com.shop.domain.Order                   | 890 MB   ← 340.000 đối tượng
                                                                cho MỘT request
   ▲
   Persistence Context giữ 340.000 entity → đây là in-memory pagination.
```

```bash
# ③ Tìm cảnh báo bị bỏ qua trong log
kubectl logs api-7d9f --since=24h | grep -c HHH90003004
#   4127          ← đã cảnh báo 4127 lần trong 24 giờ, không ai đọc
```

```java
// ④ Tìm đúng truy vấn thủ phạm
// grep -rn "JOIN FETCH" --include=*.java src/ | grep -i "page\|pageable"
// → OrderRepository.java:  Page<Order> findAllWithItems(Pageable p)
```

**Cách xử lý:**

```java
// Trước
@Query("SELECT DISTINCT o FROM Order o LEFT JOIN FETCH o.items")
Page<Order> findAllWithItems(Pageable pageable);       // ☠

// Sau — bỏ hẳn @Query, chuyển sang @BatchSize
@OneToMany(mappedBy = "order") @BatchSize(size = 50)
private List<OrderItem> items;

Page<Order> page = orderRepository.findAll(pageable);   // ✅ LIMIT chạy đúng
```

**Kết quả đo được:** heap đỉnh từ 1,9 GB xuống 240 MB; p99 từ 8,4 s xuống 190 ms; số query từ 1 lên 3.

**Chặn tái diễn:**

```java
// Biến HHH90003004 thành lỗi test, không để nó trôi trong log
@Test
void khong_duoc_phan_trang_trong_bo_nho() {
    ListAppender<ILoggingEvent> appender = attachTo("org.hibernate");

    orderRepository.findAll(PageRequest.of(0, 20));

    assertThat(appender.list)
        .as("Có truy vấn JOIN FETCH kèm Pageable")
        .noneMatch(e -> e.getFormattedMessage().contains("HHH90003004"));
}
```

```yaml
# Và bắn cảnh báo ngay trên production
- alert: HibernateInMemoryPagination
  expr: sum(rate(log_messages_total{msg=~".*HHH90003004.*"}[5m])) > 0
  for: 1m
  annotations:
    summary: "JOIN FETCH kèm Pageable — nguy cơ OOM"
```

> **Tình huống 2:** Chữa N+1 xong, số query từ 201 xuống 1, nhưng thời gian phản hồi **tăng** từ 2,1 s lên 3,4 s.

**Chẩn đoán — nhân dòng đã ăn hết phần lợi:**

```sql
-- Đo lượng dữ liệu thật sự truyền đi
EXPLAIN (ANALYZE, BUFFERS)
SELECT a.*, b.* FROM authors a LEFT JOIN books b ON a.id = b.author_id;

--  Hash Left Join  (actual rows=18400 loops=1)
--  Buffers: shared hit=4820 read=1130
--  Execution Time: 2840.221 ms
--             ▲
--   18.400 dòng cho 200 tác giả — mỗi tác giả lặp 92 lần.
```

```java
// Kiểm tra bản ghi cha nặng bao nhiêu
// → Author có trường `bio` kiểu TEXT, trung bình 4 KB
// → 18.400 dòng × 4 KB = 73 MB chỉ riêng cột bio, lặp đi lặp lại
```

**Cách xử lý — vấn đề không phải số query mà là cột nặng bị lặp:**

```java
// ✅ Cách A: query tay — cột nặng chỉ truyền 1 lần mỗi tác giả
List<Author> authors = authorRepository.findAll();                    // 200 × 4 KB = 800 KB
List<Book> books = bookRepository.findByAuthorIdIn(ids);              // 18.400 × 200 B = 3,7 MB
// Tổng 4,5 MB thay vì 73 MB

// ✅ Cách B (tốt hơn nữa): DTO projection — không lấy cột bio nếu màn hình không hiện
@Query("""
    SELECT new com.shop.dto.AuthorCard(a.id, a.name, a.country)
    FROM Author a
    """)
List<AuthorCard> findCards();
```

**Bài học:** đo **byte qua mạng**, đừng chỉ đếm query. Đây là lý do bài 5 và 6 tồn tại.

> **Tình huống 3:** Trang chi tiết đơn hàng cần hiện đồng thời: các dòng hàng, lịch sử thanh toán, và các lần vận chuyển. Ba `@OneToMany`.

**Chẩn đoán — nếu `JOIN FETCH` cả ba:**

```text
   1 đơn × 12 dòng hàng × 3 thanh toán × 4 lần giao = 144 DÒNG
   cho 20 bản ghi thật.

   Và nếu đây là DANH SÁCH 50 đơn: 50 × 144 = 7.200 dòng.
   → MultipleBagFetchException chặn bạn lại (may mắn).
```

**Cách xử lý — với trang chi tiết (một bản ghi), có ba lựa chọn hợp lệ:**

```java
// ✅ A — @BatchSize cho cả ba (đơn giản nhất, 4 query)
@OneToMany(mappedBy="order") @BatchSize(size=25) private List<OrderItem> items;
@OneToMany(mappedBy="order") @BatchSize(size=25) private List<Payment> payments;
@OneToMany(mappedBy="order") @BatchSize(size=25) private List<Shipment> shipments;

// ✅ B — ba truy vấn tuần tự, tận dụng Persistence Context (4 query, rõ ràng hơn)
@Transactional(readOnly = true)
public Order loadDetail(Long id) {
    Order order = repo.findByIdWithItems(id).orElseThrow();
    repo.findByIdWithPayments(id);      // đổ thêm vào CÙNG đối tượng
    repo.findByIdWithShipments(id);
    return order;
}

// ✅ C — ba truy vấn SONG SONG với DTO (nhanh nhất, không cần entity)
public OrderDetail loadDetail(Long id) {
    var items     = CompletableFuture.supplyAsync(() -> itemDao.findByOrderId(id), pool);
    var payments  = CompletableFuture.supplyAsync(() -> paymentDao.findByOrderId(id), pool);
    var shipments = CompletableFuture.supplyAsync(() -> shipmentDao.findByOrderId(id), pool);
    Order order = orderDao.findById(id);
    return new OrderDetail(order, items.join(), payments.join(), shipments.join());
}
// → 4 query nhưng 3 câu chạy SONG SONG → độ trễ ≈ 2 chuyến đi thay vì 4
```

**Chọn cách nào?** A cho code nội bộ, B khi cần rõ ràng, **C khi đây là màn hình quan trọng và bạn cần độ trễ thấp nhất**. Cách C chính là cầu nối sang bài 5 — nó đã bỏ entity và dùng DAO trả DTO.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Coi "ít query = nhanh hơn" | 1 query kéo 420 KB thua 2 query kéo 130 KB | Đo **byte**, không chỉ đếm query |
| Nghĩ 2 collection = `m + n` dòng | Thực tế là `m × n` | Nhớ: JOIN **nhân**, không **cộng** |
| Đổi `List` → `Set` để hết exception | Tích Descartes **vẫn xảy ra**, thêm rủi ro `equals()` | Dùng `@BatchSize` |
| Bỏ qua `HHH90003004` trong log | OOM sau vài tháng khi dữ liệu tăng | Biến nó thành **test đỏ** + alert |
| `JOIN FETCH` + `Pageable` | Kéo cả bảng về RAM | `@BatchSize` hoặc pattern hai bước |
| Pattern hai bước quên sắp lại thứ tự | `ORDER BY` bước 1 bị mất ở bước 2 | Sắp lại trong Java theo thứ tự ID |
| `JOIN FETCH` khi bản ghi cha có cột `TEXT` | Cột nặng lặp lại hàng chục lần | DTO projection, bỏ hẳn cột nặng |
| Chỉ dựa vào `@BatchSize`, không có test | Người sau xoá → N+1 quay lại lặng lẽ | Test **đếm query** là bắt buộc |
| Viết `equals()` trên entity dùng `id` | `id` null trước persist → phần tử "mất" khỏi `HashSet` | Dùng business key hoặc bỏ `Set` |
| Tưởng `@BatchSize` cứu `LazyInitializationException` | Không — vẫn cần Persistence Context mở | Nạp đủ trong `@Transactional` |

## Câu hỏi phỏng vấn hay gặp

**H: Vì sao `JOIN FETCH` có thể **chậm hơn** cách gây ra N+1?**
Vì nhân dòng. Với 20 tác giả × 30 sách, JOIN trả về 600 dòng mà **mọi cột của tác giả bị gửi lại 30 lần**. Nếu bản ghi cha nặng — ví dụ có cột `bio` kiểu `TEXT` 4 KB — thì 1 query đó kéo 73 MB trong khi hai query riêng chỉ kéo 4,5 MB. Ít query hơn nhưng gấp 16 lần dữ liệu. Nên khi tối ưu em đo **byte qua mạng**, không chỉ đếm số query.

**H: `MultipleBagFetchException` là gì và vì sao Hibernate lại cấm?**
`List` không có `@OrderColumn` là một **bag** — collection cho phép trùng và không nhớ thứ tự. Khi fetch hai bag cùng lúc, SQL tạo tích Descartes: 30 sách × 5 giải thưởng ra **150 dòng** cho một tác giả. Vì bag không có cơ chế loại trùng, Hibernate không thể biết `books.size()` là 30 hay 150. Nó chọn **nổ lúc khởi động** thay vì trả về số sai lúc chạy — đây là thiết kế fail-fast đúng đắn, không phải Hibernate làm khó.

**H: Đổi `List` sang `Set` để hết lỗi đó có được không?**
Hết exception nhưng **không chữa được gì**. Tích Descartes vẫn xảy ra ở tầng SQL, database vẫn trả về 3.000 dòng, Hibernate vẫn xử lý cả 3.000 dòng — chỉ khác là `Set` loại trùng sau cùng nên `size()` ra đúng. Bạn trả toàn bộ chi phí để lấy kết quả đúng. Thêm nữa, `Set` bắt buộc phải có `equals()`/`hashCode()` đúng trên entity, mà viết sai cái đó là một trong những lỗi khó gỡ nhất của JPA. Cách chữa thật sự là `@BatchSize` cho cả hai collection.

**H: `HHH90003004` nghĩa là gì?**
Đó là cảnh báo *"bạn phân trang trên truy vấn có fetch collection, tôi sẽ áp dụng phân trang trong bộ nhớ"*. Nghĩa thật là Hibernate **bỏ `LIMIT` đi, kéo toàn bộ bảng về heap, rồi mới cắt 20 dòng**. Nó buộc phải làm vậy vì nhân dòng khiến `LIMIT 20` cắt nhầm giữa chừng một sản phẩm và trả về dữ liệu sai. Trên bảng 2 triệu dòng thì đây là `OutOfMemoryError`. Nguy hiểm nhất là nó chỉ `WARN` chứ không `throw`, nên trôi qua hàng nghìn lần mà không ai đọc — em luôn biến nó thành test đỏ và alert.

**H: `@BatchSize` tốt hơn hết ở mọi mặt, sao không dùng nó cho tất cả?**
Vì nó là **tối ưu vô hình**. Đọc file service bạn không thể biết đoạn code chạy 3 query hay 21 query — thông tin nằm ở annotation trên entity hoặc trong `application.properties`. Người sau refactor entity, thấy annotation "thừa" nên xoá đi, và test chức năng **vẫn xanh** vì kết quả đúng, chỉ chậm hơn. N+1 quay lại mà không ai biết cho tới ba tháng sau. Nên khi dùng `@BatchSize`, test đếm query không phải tuỳ chọn mà là bắt buộc. Ngoài ra `IN` thay đổi kích thước cũng làm phình plan cache của database.

**H: Vậy cuối cùng nên chọn cách nào?**
Theo hình dạng truy vấn, không theo sở thích. **Một bản ghi kèm quan hệ** → `JOIN FETCH`, đây là chỗ nó đúng nhất. **Danh sách có phân trang** → `@BatchSize`, cách duy nhất không vỡ. **Nhiều collection cùng lúc** → `@BatchSize` hoặc query tay. **Bản ghi cha nặng hoặc fanout lớn** → query tay + DTO projection. Và dù chọn gì cũng bật `default_batch_fetch_size=25` làm lưới an toàn. Còn với màn hình đọc quan trọng nhất của sản phẩm thì phần lớn đội có quy mô đều đi tới cùng một kết luận: **bỏ entity, viết SQL** — đó là nội dung ba bài tiếp theo.

## Tóm tắt bài 3

- `JOIN FETCH` gây **nhân dòng**: cột của bản ghi cha bị gửi lại theo số con. Cha càng nặng, lãng phí càng lớn (tới **27×**).
- Hai collection → **tích Descartes `m × n`**, không phải `m + n`. Ba collection → 30.000 dòng cho 20 bản ghi.
- **`MultipleBagFetchException` là ân huệ**, không phải rào cản — nó chặn dữ liệu sai. Đổi `List`→`Set` chỉ **giấu bệnh**.
- **`HHH90003004` = kéo cả bảng về RAM.** Chỉ `WARN`, không `throw` → âm thầm dẫn tới OOM. Phải biến thành test đỏ + alert.
- `@BatchSize` mạnh nhất về kỹ thuật nhưng là **tối ưu vô hình** → bắt buộc kèm **test đếm query**.
- **Đo byte qua mạng, đừng chỉ đếm query.** 1 query 420 KB thua 2 query 130 KB.
- Chọn cách theo **hình dạng truy vấn**: một bản ghi → `JOIN FETCH`; danh sách phân trang → `@BatchSize`; cha nặng / fanout lớn → query tay + DTO.
- Với màn hình đọc quan trọng, mọi đội có quy mô đều đi tới cùng một kết luận: **bỏ entity, viết SQL**.

**Bài kế tiếp** → [Bài 4: Sự thật về ORM trong production — ai dùng, ai bỏ, và vì sao](04-su-that-ve-orm-trong-production.md)

**Quay lại** → [Bài 2: Bốn cách khắc phục bằng chính ORM](02-bon-cach-khac-phuc-bang-chinh-orm.md)
