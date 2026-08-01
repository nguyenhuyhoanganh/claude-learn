# Bài 5: Vấn đề N+1 query và ORM

Trang web của bạn mất **8 giây** chỉ để hiện một danh sách 100 sản phẩm. Người dùng nhìn vòng xoay, chờ, rồi bực bội bỏ đi.

Nhìn vào hậu trường: database đang bị dội bom bởi **101 truy vấn** trong một lần tải trang.

Thủ phạm là một dòng code trông hoàn toàn vô tội:

```python
for post in posts:
    print(post.author.name)     # ← chính dòng này
```

N+1 là sát thủ thầm lặng nhất của hiệu năng backend. Nó ẩn trong code của hầu hết dự án, và gần như lập trình viên nào cũng từng dính ít nhất một lần.

Phase-3 bài 3 đã liệt kê nó là anti-pattern số 5. Bài này đi trọn vẹn: vì sao ORM tạo ra nó, cách phát hiện tự động, năm cách chữa, và **căn bệnh ngược lại** mà người mới sửa N+1 hay mắc phải.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **ORM** (*Object-Relational Mapping*) | o-a-em | **Ánh xạ đối tượng–quan hệ** — biến bảng thành đối tượng để viết code cho gọn |
| **N+1 query** | | 1 truy vấn lấy danh sách **+ N** truy vấn cho từng phần tử |
| **Lazy loading** | lê-di | **Nạp lười** — chỉ nạp quan hệ khi thật sự chạm vào nó |
| **Eager loading** | i-gơ | **Nạp sớm** — khai báo trước là sẽ cần, nạp luôn trong cùng truy vấn |
| **Round-trip** | rao-trịp | **Chuyến đi khứ hồi** qua mạng — thứ thật sự tốn thời gian |
| **Overfetching** | ô-vơ-phét | **Lấy thừa** — kéo về nhiều hơn màn hình cần |
| **Batching** | bát-ching | **Gom lô** — dồn nhiều yêu cầu lẻ thành một truy vấn |
| **DataLoader** | | Thư viện gom yêu cầu lẻ trong cùng một nhịp thành một truy vấn |
| **Counter cache** | | **Cột đếm sẵn** — lưu sẵn con số thay vì đếm lại mỗi lần |
| **Fanout** | phen-ao | **Nhân dòng** — JOIN một-nhiều làm dòng bên trái bị lặp |

## Cơ chế: một query cho danh sách, N query cho từng phần tử

```python
# Django
posts = Post.objects.all()[:100]      # ① 1 query: SELECT * FROM posts LIMIT 100

for post in posts:
    print(post.author.name)           # ② mỗi lần chạm .author = 1 query nữa
```

```sql
-- Trong log database:
SELECT * FROM posts LIMIT 100;                    -- 1 query
SELECT * FROM users WHERE id = 7;                 -- query 2
SELECT * FROM users WHERE id = 12;                -- query 3
SELECT * FROM users WHERE id = 7;                 -- query 4  ← LẶP LẠI!
SELECT * FROM users WHERE id = 3;                 -- query 5
...                                                -- ... đủ 100 lần
```

Đó là nguồn gốc cái tên: **1 truy vấn cho danh sách + N truy vấn cho từng phần tử**.

### Điều bất ngờ: vấn đề KHÔNG nằm ở database

Từng truy vấn đó chạy rất nhanh — `SELECT * FROM users WHERE id = 7` với index khoá chính mất khoảng **0,2 ms**. 101 query × 0,2 ms chỉ là 20 ms.

Vậy 8 giây từ đâu ra?

```text
Mỗi truy vấn tốn một CHUYẾN ĐI KHỨ HỒI qua mạng:

  App ──── request ────► DB     ┐
      ◄─── response ────        │  round-trip time (RTT)
                                ┘

  Cùng máy chủ:        ~0,1 ms   → 101 query = 10 ms      (không thấy gì)
  Cùng data center:    ~1 ms     → 101 query = 100 ms     (bắt đầu chậm)
  Khác availability zone: ~5 ms  → 101 query = 500 ms     (rõ ràng chậm)
  Khác vùng địa lý:    ~80 ms    → 101 query = 8 GIÂY     (chết)

Trăm lẻ một chuyến nối đuôi nhau — ĐÓ mới là thứ giết tốc độ.
```

Đây là lý do N+1 **không lộ ra trên máy dev** (database chạy localhost, RTT gần 0) và chỉ nổ khi lên production. Kèm theo đó là chi phí ẩn: mỗi query đều phải parse, plan, và chiếm một kết nối trong pool.

## Vì sao ORM tạo ra nó: lazy loading

**ORM** (*Object-Relational Mapping*) ánh xạ bảng thành đối tượng để bạn viết code như đang làm việc với đối tượng thường. Đó chính là vấn đề: **nó giấu SQL đi quá tốt**.

**Lazy loading** (nạp lười) nghĩa là quan hệ chỉ được nạp khi bạn thật sự chạm vào nó. Nghe rất hợp lý — đừng lấy thứ không dùng. Nhưng trong vòng lặp, nó biến thành thảm hoạ.

```text
post.author  trông như đọc một thuộc tính trong bộ nhớ
             thực chất là một chuyến đi mạng tới database
```

Vì SQL bị giấu sau lớp ORM, code review nhìn qua vẫn thấy sạch đẹp. Đó là lý do N+1 lọt qua mọi vòng kiểm tra và chỉ lộ mặt khi hệ thống bắt đầu chậm dần.

### Các dạng biến thể khó thấy hơn

```python
# ① N+1 trong template/serializer — không thấy vòng lặp trong code Python
{% for post in posts %}
    {{ post.author.name }}          {# vẫn là N+1, nhưng nằm trong HTML #}
{% endfor %}

# ② N+1 lồng nhau — 1 + N + N×M
for post in posts:                  # 1 query
    for comment in post.comments:   # N query
        print(comment.user.name)    # N×M query  → 100 bài × 20 bình luận = 2001 query

# ③ N+1 trong hàm tính toán
@property
def so_binh_luan(self):
    return self.comments.count()    # mỗi lần gọi = 1 query COUNT

# ④ N+1 qua GraphQL resolver — mỗi field một resolver, mỗi resolver một query
```

## Phát hiện: đừng đợi khách hàng báo

### Cách 1: đếm số query trên mỗi request

**Quy tắc vàng: nếu số truy vấn tăng theo số phần tử trên màn hình, bạn đã dính N+1.**

```python
# Django — middleware cảnh báo tự động
from django.db import connection

class DemQueryMiddleware:
    NGUONG = 20
    def __init__(self, get_response): self.get_response = get_response
    def __call__(self, request):
        so_truoc = len(connection.queries)
        response = self.get_response(request)
        so_query = len(connection.queries) - so_truoc
        if so_query > self.NGUONG:
            logger.warning(
                "N+1 nghi ngờ: %s dùng %d query", request.path, so_query
            )
        response["X-Query-Count"] = str(so_query)
        return response
```

Đặt header `X-Query-Count` vào mọi response là mẹo rất hiệu quả: bạn nhìn thấy con số ngay trong DevTools của trình duyệt, không cần mở log.

### Cách 2: phát hiện query lặp trong log

Dấu hiệu đặc trưng của N+1 là **hàng loạt truy vấn giống hệt nhau, chỉ khác đúng con số ID**.

```sql
-- PostgreSQL: pg_stat_statements gom các query cùng khuôn về một dòng
SELECT calls, mean_exec_time, calls * mean_exec_time AS tong_ms, query
FROM pg_stat_statements
WHERE query LIKE '%users%'
ORDER BY calls DESC
LIMIT 10;
```

```text
 calls  | mean_exec_time | tong_ms  | query
--------+----------------+----------+------------------------------------------
 984320 |           0.21 | 206707.2 | SELECT * FROM users WHERE id = $1
     42 |          12.30 |    516.6 | SELECT * FROM posts ORDER BY ...
        ▲
   Gần một triệu lượt gọi cùng một câu → gần như chắc chắn là N+1
```

**Câu query nhanh nhất nhưng gọi nhiều nhất thường tốn nhiều thời gian tổng hơn câu chậm nhất.** Đây là góc nhìn mà người mới hay bỏ qua khi tối ưu.

### Cách 3: công cụ chuyên dụng

| Ngôn ngữ / Framework | Công cụ |
|---|---|
| Django | `django-debug-toolbar`, `nplusone` |
| Rails | `bullet` gem (cảnh báo ngay trên trình duyệt) |
| Laravel | Telescope, `beyondcode/laravel-query-detector` |
| Spring / Hibernate | `spring.jpa.show-sql`, Hypersistence Utils |
| Node / Prisma | `log: ['query']`, middleware đếm |
| Bất kỳ | APM: Datadog, New Relic, Sentry Performance |

Tốt nhất là **để nó thất bại trong test**:

```python
# pytest — chặn N+1 lọt vào production ngay từ CI
def test_danh_sach_bai_viet_khong_bi_n_plus_1(client, django_assert_num_queries):
    tao_100_bai_viet()
    with django_assert_num_queries(3):      # cố định: 1 posts + 1 authors + 1 count
        client.get("/posts/")
```

## Năm cách chữa

### ① JOIN / eager loading — gộp vào một truy vấn

```python
# Django
posts = Post.objects.select_related("author")      # ForeignKey → JOIN
```

```sql
SELECT posts.*, users.*
FROM posts LEFT JOIN users ON users.id = posts.author_id
LIMIT 100;
-- MỘT chuyến đi, đầy đủ dữ liệu
```

Mỗi framework một cái tên, cùng một ý tưởng:

| Framework | Cú pháp |
|---|---|
| Django | `.select_related("author")` |
| Rails | `.includes(:author)` / `.eager_load(:author)` |
| Laravel | `->with('author')` |
| Hibernate/JPA | `JOIN FETCH` hoặc `@EntityGraph` |
| Sequelize | `{ include: [Author] }` |
| Prisma | `{ include: { author: true } }` |
| SQLAlchemy | `joinedload(Post.author)` |
| GORM (Go) | `.Preload("Author")` |

### ② Gom ID rồi bắn một truy vấn `IN`

Với quan hệ **một-nhiều**, JOIN gây nhân dòng (fanout — xem phase-1 bài 3): 100 bài viết × 20 bình luận = 2.000 dòng, mỗi bài viết bị lặp 20 lần qua mạng.

Cách tốt hơn: **hai truy vấn**.

```python
# Django: prefetch_related — 2 query, không nhân dòng
posts = Post.objects.prefetch_related("comments")
```

```sql
SELECT * FROM posts LIMIT 100;                                -- query 1
SELECT * FROM comments WHERE post_id IN (1,2,3,...,100);       -- query 2
-- ORM tự ghép lại trong bộ nhớ
```

**Kết quả: hai truy vấn, dù N là 100 hay 1 triệu.**

Bảng chọn:

| Loại quan hệ | Django | Rails | Vì sao |
|---|---|---|---|
| Nhiều-một (`ForeignKey`) | `select_related` | `eager_load` | JOIN, không nhân dòng |
| Một-nhiều / nhiều-nhiều | `prefetch_related` | `preload` | Tránh fanout |
| Cả hai, lồng nhau | `.select_related("a").prefetch_related("b__c")` | `includes` | Kết hợp |

### ③ DataLoader — gom tự động cho GraphQL

Với GraphQL, mỗi field có resolver riêng nên bạn không kiểm soát được vòng lặp. **DataLoader** âm thầm gom các yêu cầu lẻ tẻ trong cùng một "nhịp" (tick của event loop), bắn một truy vấn theo lô, và nhớ kết quả đã lấy để không hỏi lại.

```javascript
const DataLoader = require('dataloader');

const userLoader = new DataLoader(async (ids) => {
    const rows = await db.query('SELECT * FROM users WHERE id = ANY($1)', [ids]);
    const map = new Map(rows.map(r => [r.id, r]));
    return ids.map(id => map.get(id));     // PHẢI trả về đúng thứ tự ids
});

const resolvers = {
    Post: { author: (post) => userLoader.load(post.author_id) }
    //                        ▲ 100 lần gọi trong cùng tick → gom thành 1 query
};
```

Hai điều quan trọng: DataLoader phải được **tạo mới cho mỗi request** (nếu không cache sẽ rò dữ liệu giữa các người dùng), và hàm batch **bắt buộc** trả về mảng đúng thứ tự và đúng độ dài với mảng khoá đầu vào.

### ④ Tính sẵn bằng subquery hoặc annotation

```python
# ❌ N+1 qua property
for post in posts:
    print(post.comments.count())         # 1 query mỗi bài

# ✅ Tính luôn trong một query
from django.db.models import Count
posts = Post.objects.annotate(so_binh_luan=Count("comments"))
```

```sql
SELECT p.*, count(c.id) AS so_binh_luan
FROM posts p LEFT JOIN comments c ON c.post_id = p.id
GROUP BY p.id;
```

### ⑤ Cột đếm sẵn (counter cache)

Khi số đếm được đọc rất nhiều và đổi rất ít, lưu sẵn nó:

```sql
ALTER TABLE posts ADD COLUMN so_binh_luan INT NOT NULL DEFAULT 0;

CREATE FUNCTION cap_nhat_so_binh_luan() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE posts SET so_binh_luan = so_binh_luan + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE posts SET so_binh_luan = so_binh_luan - 1 WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dem_binh_luan
AFTER INSERT OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION cap_nhat_so_binh_luan();
```

**Đánh đổi:** mỗi lần thêm/xoá bình luận đều `UPDATE` dòng bài viết → bài viết nóng trở thành điểm tranh chấp khoá. Với bài viết viral nhận 1.000 bình luận/giây, đây là nút thắt nghiêm trọng. Cách giảm: cộng dồn theo lô định kỳ thay vì trigger tức thời.

## Căn bệnh ngược lại: overfetching

Đây là phần mà người mới sửa xong N+1 hay mắc phải ngay.

```python
# ❌ "Eager load mọi thứ cho chắc"
posts = Post.objects.select_related("author", "category", "publisher") \
                    .prefetch_related("comments__user", "tags", "images",
                                      "likes", "revisions")
# Kéo cả kho dữ liệu về cho một màn hình danh sách chỉ hiện tiêu đề và tên tác giả
```

Bạn vừa đổi 101 query nhanh lấy 1 query khổng lồ kéo 500 MB về RAM.

```text
N+1                     ←→                    OVERFETCHING
101 chuyến đi nhỏ                      1 chuyến đi khổng lồ
Chết vì độ trễ mạng                    Chết vì băng thông và RAM

              Điểm cân bằng:
    NẠP ĐÚNG THỨ MÀN HÌNH NÀY CẦN, KHÔNG HƠN
```

Thêm hai bẫy đi kèm:

```python
# ① prefetch_related kéo TOÀN BỘ bình luận về RAM
Post.objects.prefetch_related("comments")     # bài viral có 50.000 bình luận
# ✅ Giới hạn phạm vi nạp trước
from django.db.models import Prefetch
Post.objects.prefetch_related(
    Prefetch("comments",
             queryset=Comment.objects.order_by("-created_at")[:5])
)

# ② select_related nhiều tầng → JOIN 8 bảng, plan phức tạp, kết quả rất rộng
Post.objects.select_related("author__profile__company__address")
```

**Quy tắc thực dụng:** viết truy vấn theo **màn hình**, không theo **model**. Màn hình danh sách và màn hình chi tiết nên có hai truy vấn khác nhau, kể cả khi chúng dùng chung một model.

## Khi nào N+1 lại là lựa chọn đúng

Để công bằng — không phải lúc nào cũng phải sửa:

- **N nhỏ và cố định.** 5 phần tử trên cùng một máy chủ: 5 query × 0,2 ms = 1 ms. Sửa nó là tối ưu hoá sớm.
- **Dữ liệu đã có trong cache.** Nếu `user` được cache ở Redis, N lần tra cache còn rẻ hơn một JOIN nặng.
- **JOIN gây fanout khổng lồ.** 100 đơn × 50 dòng × 10 thanh toán = 50.000 dòng qua mạng cho 100 đơn hàng. Lúc này nhiều truy vấn nhỏ lại rẻ hơn.
- **Dữ liệu nằm ở dịch vụ khác.** Sau khi tách microservice, JOIN không tồn tại — chỉ còn cách gom ID và gọi theo lô.

**Quy tắc:** đo trước, đừng đoán. Câu hỏi đúng không phải "có N+1 không" mà là **"tổng thời gian của request này là bao nhiêu, và phần nào chiếm nhiều nhất"**.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Trang danh sách sản phẩm chạy 80 ms trên máy dev, nhưng **8 giây** trên production. Cùng một code, cùng lượng dữ liệu.

**Chẩn đoán — quy trình bốn bước, mỗi bước một câu lệnh:**

```sql
-- ① Query nào bị gọi nhiều bất thường?
SELECT calls, round(mean_exec_time::numeric, 2) AS tb_ms,
       round((calls * mean_exec_time / 1000)::numeric) AS tong_giay,
       left(query, 70) AS cau_lenh
FROM pg_stat_statements
ORDER BY calls DESC LIMIT 5;
```

```text
  calls   | tb_ms | tong_giay | cau_lenh
----------+-------+-----------+--------------------------------------
  984320  |  0.21 |       207 | SELECT * FROM users WHERE id = $1
      42  | 12.30 |         1 | SELECT * FROM products ORDER BY ...
   ▲
   Gần MỘT TRIỆU lượt gọi cùng một câu → GẦN NHƯ CHẮC CHẮN LÀ N+1.

   VÀ CHÚ Ý: câu NHANH NHẤT (0.21ms) lại tốn TỔNG THỜI GIAN NHIỀU NHẤT (207s).
   Đây là góc nhìn người mới hay bỏ qua khi đi tối ưu.
```

```python
# ② Đếm số query trên MỘT request cụ thể
from django.db import connection, reset_queries
reset_queries()
client.get("/products/")
print(len(connection.queries))        # 101   ← 1 + 100
```

```python
# ③ Xác nhận đúng là N+1: các query CHỈ khác con số ID
for q in connection.queries[:5]:
    print(q['sql'])
# SELECT * FROM users WHERE id = 7
# SELECT * FROM users WHERE id = 12
# SELECT * FROM users WHERE id = 7     ← LẶP LẠI cùng một id!
```

```text
   ④ VÌ SAO MÁY DEV KHÔNG LỘ?
      RTT localhost      ~0,1 ms → 101 query = 10 ms   (không thấy gì)
      RTT production      ~80 ms → 101 query = 8 GIÂY  (chết)
      → Nút thắt là MẠNG, không phải database.
```

**Cách xử lý theo loại quan hệ — chọn sai vẫn chậm:**

```python
# Quan hệ NHIỀU-MỘT (mỗi post có 1 author) → JOIN
posts = Post.objects.select_related("author")
# → 1 query.  101 → 1

# Quan hệ MỘT-NHIỀU (mỗi post có N comments) → KHÔNG dùng select_related!
# ❌ select_related sẽ NHÂN DÒNG: 100 post × 20 comment = 2000 dòng qua mạng
posts = Post.objects.prefetch_related("comments")
# → 2 query, KHÔNG nhân dòng, dù N là 100 hay 1 triệu

# LỒNG NHAU
posts = Post.objects.select_related("author").prefetch_related("comments__user")
```

**Chặn tái diễn — để nó thất bại trong CI, đừng để khách hàng phát hiện:**

```python
def test_danh_sach_khong_bi_n_plus_1(client, django_assert_num_queries):
    tao_100_bai_viet()
    with django_assert_num_queries(3):     # CỐ ĐỊNH: 1 posts + 1 authors + 1 count
        client.get("/products/")
```

```python
# Và cảnh báo ở runtime cho mọi endpoint
class DemQueryMiddleware:
    NGUONG = 20
    def __call__(self, request):
        truoc = len(connection.queries)
        resp = self.get_response(request)
        n = len(connection.queries) - truoc
        resp["X-Query-Count"] = str(n)      # ◄── nhìn thấy ngay trong DevTools
        if n > self.NGUONG:
            logger.warning("N+1 nghi ngờ: %s dùng %d query", request.path, n)
        return resp
```

> **Tình huống 2:** Sửa N+1 xong, trang nhanh lên thật. Nhưng hai tuần sau, server bắt đầu **hết RAM** và bị OOM killer giết.

**Chẩn đoán:** bạn vừa rơi vào **căn bệnh ngược lại**.

```python
# Xem code đã sửa
posts = Post.objects.select_related("author", "category", "publisher") \
                    .prefetch_related("comments__user", "tags", "images",
                                      "likes", "revisions")
# ← "eager load mọi thứ cho chắc"
```

```sql
-- Đo xem một request kéo về bao nhiêu dữ liệu
EXPLAIN (ANALYZE, BUFFERS)
SELECT ... ;
--  Buffers: shared hit=284192 read=18420
--  ◄── chạm 300.000 trang = ~2,4 GB cho MỘT request
```

**Ba cách chữa:**

```python
# ① NẠP THEO MÀN HÌNH, không theo model
# Màn hình danh sách chỉ hiện tiêu đề + tên tác giả:
posts = Post.objects.select_related("author").only(
    "id", "title", "author__id", "author__name")

# ② GIỚI HẠN PHẠM VI prefetch — bài viral có 50.000 bình luận
from django.db.models import Prefetch
posts = Post.objects.prefetch_related(
    Prefetch("comments", queryset=Comment.objects.order_by("-created_at")[:5])
)

# ③ Cho phần được phép hỏng thì tách riêng, đừng gộp vào query chính
```

```text
   ĐIỂM CÂN BẰNG:

   N+1                    ←────────────→          OVERFETCHING
   101 chuyến đi nhỏ                        1 chuyến đi khổng lồ
   chết vì ĐỘ TRỄ MẠNG                      chết vì BĂNG THÔNG và RAM

              → NẠP ĐÚNG THỨ MÀN HÌNH NÀY CẦN, KHÔNG HƠN.
              → Viết truy vấn theo MÀN HÌNH, không theo MODEL.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Lazy loading trong vòng lặp | N+1 kinh điển | `select_related` / `prefetch_related` |
| N+1 trong template / serializer | Không thấy vòng lặp trong code | Đếm query trên mỗi request |
| N+1 lồng nhau | 1 + N + N×M query | Prefetch nhiều tầng: `"comments__user"` |
| Chỉ test trên localhost | RTT ≈ 0 nên không lộ | Test có đếm số query, hoặc thêm độ trễ giả |
| `select_related` cho quan hệ một-nhiều | Nhân dòng, dữ liệu lặp qua mạng | `prefetch_related` |
| Eager load mọi thứ để "cho chắc" | Overfetching, hết RAM | Nạp theo màn hình |
| `prefetch_related` không giới hạn | Kéo 50.000 bình luận về RAM | `Prefetch` + queryset có `LIMIT` |
| Counter cache bằng trigger trên bảng nóng | Tranh chấp khoá trên dòng bài viết | Cộng dồn theo lô |
| DataLoader tạo một lần toàn cục | Rò dữ liệu giữa các người dùng | Tạo mới mỗi request |
| Sửa N+1 mà không đo lại | Có thể vừa tạo ra vấn đề khác | Đo tổng thời gian request trước/sau |

## Câu hỏi phỏng vấn hay gặp

**H: N+1 query là gì?**
Là khi bạn chạy một truy vấn lấy danh sách N phần tử, rồi chạy thêm một truy vấn cho **mỗi** phần tử — tổng cộng N+1 truy vấn. Điều bất ngờ là vấn đề không nằm ở database: từng truy vấn đó rất nhanh. Vấn đề là **mỗi truy vấn tốn một chuyến đi khứ hồi qua mạng**. Trên localhost RTT gần 0 nên không lộ; trên production với RTT 5–80 ms thì 101 query thành vài giây.

**H: Cách phát hiện?**
Dấu hiệu đặc trưng là hàng loạt truy vấn giống hệt nhau chỉ khác con số ID. Cách tự động: đếm số query trên mỗi request và cảnh báo khi vượt ngưỡng — quy tắc vàng là **nếu số truy vấn tăng theo số phần tử trên màn hình thì chắc chắn đã dính**. Ở tầng database, `pg_stat_statements` sắp theo `calls` sẽ lộ ngay. Và tốt nhất là để nó **thất bại trong CI** bằng test cố định số query.

**H: Cách chữa?**
Ba vũ khí. JOIN/eager loading cho quan hệ nhiều-một. Gom ID rồi bắn một `WHERE id IN (...)` cho quan hệ một-nhiều — hai truy vấn dù N là 100 hay 1 triệu, và tránh được nhân dòng. DataLoader cho GraphQL, gom tự động các yêu cầu lẻ trong cùng một nhịp. Ngoài ra có thể tính sẵn bằng `annotate` hoặc cột đếm sẵn.

**H: Sửa N+1 có rủi ro gì không?**
Có — căn bệnh ngược lại là **overfetching**: eager load mọi thứ cho chắc, và bạn đổi 101 query nhanh lấy một query khổng lồ kéo cả kho dữ liệu về cho một màn hình danh sách. Điểm cân bằng là nạp đúng thứ màn hình này cần. Nguyên tắc em dùng: viết truy vấn theo **màn hình**, không theo model — danh sách và chi tiết là hai truy vấn khác nhau.

**H: Có khi nào N+1 chấp nhận được không?**
Có. Khi N nhỏ và cố định, khi dữ liệu đã nằm trong cache nên N lần tra cache rẻ hơn một JOIN nặng, khi JOIN gây fanout khổng lồ, hoặc khi dữ liệu nằm ở dịch vụ khác nên không JOIN được. Câu hỏi đúng không phải "có N+1 không" mà là "tổng thời gian request là bao nhiêu và phần nào chiếm nhiều nhất".

## Tóm tắt bài 5

- N+1 = 1 truy vấn cho danh sách + N truy vấn cho từng phần tử; thủ phạm là **lazy loading của ORM** giấu SQL đi quá tốt.
- Vấn đề **không phải database** mà là **chuyến đi khứ hồi qua mạng** — đó là lý do nó không lộ trên localhost và chỉ nổ trên production.
- Quy tắc vàng phát hiện: **số truy vấn tăng theo số phần tử trên màn hình**. Đặt `X-Query-Count` vào response và cố định số query trong test CI.
- Chữa: **JOIN/eager loading** cho nhiều-một, **gom ID + `IN`** cho một-nhiều (2 query dù N bao nhiêu), **DataLoader** cho GraphQL, `annotate` hoặc counter cache cho phép đếm.
- Cẩn thận căn bệnh ngược lại — **overfetching**: viết truy vấn theo **màn hình**, không theo model.
- N+1 đôi khi đúng: N nhỏ, dữ liệu trong cache, JOIN gây fanout lớn, hoặc dữ liệu ở dịch vụ khác. **Đo trước, đừng đoán.**

> **Muốn đi sâu hơn?** Bài này là bản tổng quát, không phụ thuộc ngôn ngữ. Nếu bạn làm Java/Hibernate, hoặc đang phân vân **"production có nên dùng ORM không"**, hãy đọc khoá riêng: [N+1, ORM, và cách các công ty thật sự truy cập dữ liệu](../../orm-n-plus-1/README.md) — 10 bài về `JOIN FETCH` vs `@EntityGraph` vs `@BatchSize` và cái giá của từng cách, `MultipleBagFetchException`, `HHH90003004`, MyBatis/jOOQ/Spring Data JDBC, kiến trúc CQRS-lite, DataLoader, và cách dựng lưới chắn để N+1 không quay lại.

**Bài kế tiếp** → [Bài 6: Connection pool, job queue và transaction dài](06-connection-pool-job-queue-va-transaction-dai.md)
