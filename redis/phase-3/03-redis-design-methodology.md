# Bài 3: Redis Design Methodology — bài học cốt lõi nhất khoá học

> **Nếu bạn chỉ đọc một bài duy nhất trong khoá Redis này, hãy đọc bài này.**

Đây là bài học làm nên sự khác biệt giữa "biết lệnh Redis" và "thiết kế hệ thống Redis tốt". Sai bài này — bạn sẽ "viết Redis như viết SQL" và gặp đủ loại vấn đề: chậm, tốn RAM, race condition, khó scale. Đúng bài này — bạn unlock được toàn bộ sức mạnh.

## Mẫu tư duy SQL — Schema-first

Khi học SQL, bạn quen thiết kế thế này:

```text
1. Chọn ENTITIES (User, Order, Product...)
2. Vẽ ER diagram, định nghĩa quan hệ (1-N, N-N).
3. Tạo BẢNG: User(id, name, email...), Order(id, user_id, total...).
4. Thêm INDEX trên cột hay query (user_id, created_at...).
5. Viết QUERY linh hoạt khi nào cần: 
   SELECT * FROM orders 
   WHERE user_id = ? AND status = 'paid' AND created_at > '2024-01-01';
6. DB tự lo execution plan, index lookup, optimization.
```

**Đặc tính**:
- **Declarative**: bạn nói "muốn gì", DB lo "lấy như nào".
- **Linh hoạt**: query mới chưa từng nghĩ vẫn chạy được (chậm thì optimize).
- **Mạnh ở JOIN**: nối nhiều bảng tự do.

Đây là tư duy **đúng cho SQL**. Bạn không cần biết trước truy vấn nào — DB sẵn sàng.

## Redis — Query-first design

Trong Redis, **đảo ngược 180°**:

```text
1. Liệt kê CÁC QUERY mà feature cần trả lời.
2. Với mỗi query, chọn DATA STRUCTURE phù hợp.
3. Thiết kế KEY NAME để map từ "what I'm looking up" → "where it's stored".
4. Xác định TTL, EXPIRATION strategy.
5. Tính SIZE & FOOTPRINT.
6. Plan CONSISTENCY, INVALIDATION.
7. Mới viết code.
```

**Đặc tính**:
- **Imperative / procedural**: bạn nói cụ thể "lấy key X dạng Y với index Z".
- **Cứng**: query không lường trước → phải thiết kế lại data structure.
- **Không có JOIN tự động** — bạn ghép ở app side.

Lý do: Redis không có **query planner**. Mỗi lệnh là một thao tác direct. Bạn quyết định **chính xác** cách truy cập data, không phải DB.

### Trực giác: Redis là một **tủ ngăn kéo có nhãn**

Imagine một tủ với hàng ngàn ngăn kéo. Mỗi ngăn có **nhãn (key)** và **đồ vật bên trong (value)**.

- SQL: "tìm tôi tất cả ngăn có đồ vật màu đỏ" — DB sẽ quét hoặc tra mục lục.
- Redis: bạn cần biết nhãn trước → mở ngăn → lấy. Không có "tra mục lục" mặc định.

→ Để tìm "tất cả đồ màu đỏ", **trước khi cất**, bạn phải tạo riêng một ngăn "đồ-màu-đỏ" chứa danh sách nhãn. Đây là **index thủ công**.

## Checklist 5 câu hỏi cho mọi feature

Mỗi khi thiết kế một feature mới với Redis, đi qua 5 câu hỏi này:

### Câu 1: Kiểu dữ liệu nào?
"Tôi sẽ lưu cái gì? String? Hash? Set? Sorted set? Stream?"

Mapping nhanh:

| Bạn lưu | Dùng |
|---|---|
| Plain text/blob/HTML | String |
| Object có nhiều field rời (user, product) | Hash |
| Tập không trùng (tag, follower) | Set |
| Ranking, top-K | Sorted Set |
| Inbox, queue, event recent | List |
| Event log có thứ tự, có ID | Stream |
| Boolean trên hàng triệu user | Bitmap |
| Đếm unique xấp xỉ | HyperLogLog |
| Vị trí địa lý | Geospatial |

### Câu 2: Có lo về kích thước data?

"Tổng số key × kích thước trung bình ≤ memory tôi có?"

Ví dụ feature `cache:page:*`:
- 6 trang × 57 KB ≈ 342 KB/user.
- 1 triệu user × 342 KB = **342 GB** → không khả thi nếu cache mỗi page per user.
- Nhưng nếu chỉ cache 4 trang static **chung cho mọi user** → 4 × 57 KB = **228 KB tổng cộng** → vừa vặn.

**Kết luận từ math**: cache trang static, KHÔNG cache trang per-user. Đây là **design decision** rút ra từ tính toán, không phải đoán.

### Câu 3: Cần expiration không?

Cache: chắc chắn cần (TTL). Lock: cần (phòng deadlock). Session: cần. Object master (vd user profile chính): có thể không cần TTL.

Cũng cân nhắc:
- TTL nên là bao nhiêu? (giữa "stale data" vs "hit ratio")
- Có nhiều key expire cùng lúc → TTL cliff?
- Update value có giữ TTL không? (`KEEPTTL`)

### Câu 4: Tên key thế nào?

Tên key là **interface** của data. Câu hỏi:
- Có unique không? (key trùng = ghi đè)
- Engineer khác đọc tên hiểu không?
- Có namespace tránh va chạm với feature khác?
- Có cần hash tag cho Cluster?
- Pattern có giúp filter sau (`SCAN MATCH`) không?

Chi tiết ở [Bài 4](04-key-naming-convention.md).

### Câu 5: Business logic có ràng buộc gì?

- Có cần atomic không? (vd "decrease stock chỉ khi > 0")
- Có concurrent write từ nhiều client? (lock, INCR, transaction)
- Có audit log không?
- Có quan hệ với data feature khác? (vd khi user xoá thì phải xoá session)

## Áp dụng vào feature page caching (case study)

Đây là feature đầu tiên ta sẽ implement. Đi qua 5 câu hỏi:

### Câu 1: Kiểu dữ liệu nào?
**String**. Mỗi value là một blob HTML lớn (50-100 KB).

### Câu 2: Có lo về kích thước data?

Các trang trong app:

| Trang | Per user? | Đổi thường xuyên? | Cache không? |
|---|---|---|---|
| `/` (landing) | Có thể custom hoá | Có | KHÔNG |
| `/dashboard` | **Có**, mỗi user khác | Có | KHÔNG |
| `/auctions/create` | Form, có thể custom | Vừa | KHÔNG |
| `/auctions/{id}` (xem) | Khác nhau, bid real-time | **Rất** | KHÔNG |
| `/auctions/search` | Per query | Có | Tuỳ |
| `/users/{id}` | Per user | Vừa | KHÔNG |
| `/about` | Như nhau cho mọi user | **Hiếm** | **CÓ** |
| `/privacy` | Như nhau | **Hiếm** | **CÓ** |
| `/auth/signin` | Như nhau | **Hiếm** | **CÓ** |
| `/auth/signup` | Như nhau | **Hiếm** | **CÓ** |

→ Chỉ cache 4 trang static: about, privacy, signin, signup.

Memory: 4 × ~57 KB = **228 KB** tổng cộng (không phải per user). Hoàn toàn ổn.

### Câu 3: Cần expiration không?

**Có**. Lý do:
- Có thể bạn update HTML của `/about` mà không invalidate cache → user thấy phiên bản cũ.
- TTL ngắn (dev): 2 giây — dễ test.
- TTL prod: 2 phút đến vài giờ — tuỳ tần suất update.

### Câu 4: Key name?

Sẽ học chi tiết bài 4. Quyết định: `pageCache#/about`, `pageCache#/privacy`, ... — thuật ngữ rõ ràng, có "primary key" là route.

### Câu 5: Business logic?

- Đọc cache → không có → render → set cache. Đơn giản, không cần lock.
- Invalidation khi deploy mới: chấp nhận chờ TTL hết, hoặc gọi `DEL` thủ công khi deploy.
- Không có race condition đáng kể: nếu 2 request cùng miss cùng lúc, cả hai cùng render và set — overwrite chính nó.

→ Thiết kế xong. Code sẽ ngắn (sẽ làm ở [Bài 5](05-implement-page-caching.md)).

## Áp dụng vào feature khó hơn: leaderboard

Để thấy sức mạnh của methodology, hãy thử với feature phức tạp hơn:

> "Hiển thị top 100 user theo tổng số bid thắng, cập nhật real-time."

### Câu 1: Kiểu dữ liệu nào?

Cần "score → user", "rank theo score", "lấy top N".  
→ **Sorted Set**: `ZADD leaderboard:wins score member` + `ZREVRANGE leaderboard:wins 0 99`.

### Câu 2: Size?

10 triệu user × ~50 byte/entry ≈ 500 MB. Đắt nhưng khả thi với 1 node 1 GB RAM, hoặc shard nhỏ.

### Câu 3: Expiration?

Không (leaderboard là data master).

### Câu 4: Key name?

`leaderboard:wins:all-time` (tổng từ ngày đầu).  
Thêm `leaderboard:wins:2025-01` cho leaderboard theo tháng (reset).

### Câu 5: Business?

- Mỗi khi user thắng bid: `ZINCRBY leaderboard:wins 1 user:{id}` — atomic.
- Cách xếp tie (hoà điểm): mặc định Redis sort theo member name (lexicographic). Nếu cần "ai thắng trước thì xếp trên", thêm timestamp vào score.
- Có cần track top N "real-time" cho UI (vd notification "bạn vừa vào top 10")? Cần thêm logic so sánh trước/sau.

→ Design có **chỉ cần một sorted set**, một lệnh `ZINCRBY`, một lệnh `ZREVRANGE`. Cực gọn so với SQL phải `GROUP BY` + `ORDER BY` + `LIMIT`.

## Khi nào không cần methodology này?

Câu trả lời: **không khi nào không cần**. Nhưng với feature siêu đơn giản (vd cache, counter cơ bản), bạn có thể đi qua 5 câu trong 30 giây trong đầu. Với feature lớn (search, leaderboard, real-time messaging), nên viết ra giấy, review với team.

## Lỗi phổ biến khi mới dùng Redis

### Lỗi 1: "Đặt mọi thứ vào string JSON"

```text
SET user:1 '{"name":"Alice","age":30,"email":"a@b.com",...}'
```

Mỗi lần update 1 field → `GET` → parse → modify → `SET` → race condition + 2 RTT.  
→ Dùng **Hash** với `HSET user:1 age 31` (atomic, 1 RTT).

### Lỗi 2: "Dùng `KEYS user:*` để liệt user"

→ Chặn server. Phải duy trì **secondary index** (vd `SADD users:all <id>`).

### Lỗi 3: "Cần JOIN nên bỏ Redis"

Sai. Redis không có JOIN nhưng có thể:
- Lookup nhiều key cùng lúc với MGET / pipeline.
- Lưu denormalized (sao chép field cần ở chỗ truy vấn).
- Reverse index thủ công.

### Lỗi 4: "Cache mọi thứ"

Cache có chi phí: invalidation, stale data, memory. Cache **chỉ những gì** read-heavy + tương đối ổn định + tốn để compute. Không cache những thứ thay đổi mỗi giây cho mỗi user.

### Lỗi 5: "Thiết kế xong rồi mới nghĩ query"

→ Phát hiện query mới khó implement → refactor data structure → tốn thời gian. Luôn liệt query trước.

## Tổng kết workflow thực tế

```text
Feature mới
    │
    ▼
1. Liệt kê các QUERY/MUTATION cần
    │
    ▼
2. Đi qua CHECKLIST 5 CÂU HỎI
    │   (kiểu data | size | expiration | key name | business logic)
    │
    ▼
3. Vẽ ra DATA LAYOUT (key pattern, kiểu, ví dụ value)
    │
    ▼
4. Viết MAPPING từ query → lệnh Redis cụ thể
    │
    ▼
5. Tính MEMORY FOOTPRINT, latency dự kiến
    │
    ▼
6. Code (giờ rất nhanh, vì đã rõ ràng từ trước)
    │
    ▼
7. Test với data thật (xem hit ratio, evict, slow log)
```

## Tóm tắt bài 3

- **Tư duy SQL = schema-first**: lưu rồi truy vấn tự do.
- **Tư duy Redis = query-first**: biết trước cách truy vấn, mới chọn data structure.
- Checklist 5 câu hỏi: kiểu data | size | expiration | key name | business logic.
- Đi qua checklist cho feature mới — giúp tránh design xấu từ gốc.
- Lỗi phổ biến: JSON blob, KEYS, cache mọi thứ, JOIN trong app — đều xuất phát từ "nghĩ như SQL".

**Bài kế tiếp** → [Bài 4: Key naming convention — quy tắc đặt tên key chuyên nghiệp](04-key-naming-convention.md)
