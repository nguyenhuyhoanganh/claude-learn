# Bài 1: System Design — thiết kế database cho Twitter

Ba yêu cầu nghiệp vụ, nghe rất đơn giản:

1. Đăng một dòng trạng thái (tweet).
2. Theo dõi người khác.
3. Xem dòng thời gian — mọi tweet của những người mình theo dõi.

Yêu cầu thứ ba chứa toàn bộ độ khó. Nó là bài toán mà không có lời giải đúng tuyệt đối, và cách bạn giải nó quyết định hệ thống chịu được 10 nghìn hay 100 triệu người dùng.

Bài này đi từ thiết kế ngây thơ nhất, để nó gãy, rồi sửa — đúng cách một buổi phỏng vấn system design nên diễn ra.

## Từ yêu cầu nghiệp vụ ra yêu cầu kỹ thuật

Người dùng nói ba câu ở trên. Kỹ sư phải dịch chúng thành hàng chục yêu cầu kỹ thuật mà người dùng không bao giờ nhắc tới:

```text
   "Đăng tweet"        →  xác thực người dùng
                       →  lưu bền vững (không mất khi máy chết)
                       →  giới hạn độ dài
                       →  chống spam / giới hạn tần suất
                       →  phản hồi dưới 200 ms

   "Theo dõi người"    →  quan hệ nhiều-nhiều
                       →  không cho theo dõi trùng
                       →  đếm số người theo dõi (hiển thị ở hồ sơ)

   "Xem dòng thời gian"→  gộp tweet từ N người
                       →  sắp xếp theo thời gian
                       →  phân trang
                       →  phản hồi dưới 200 ms   ← ĐÂY LÀ CHỖ KHÓ
```

Và hai câu hỏi phải hỏi trước khi vẽ bất cứ thứ gì:

| Câu hỏi | Vì sao quyết định thiết kế |
|---|---|
| Tỉ lệ đọc/ghi bao nhiêu? | Twitter thực tế khoảng **100:1** — mọi tối ưu phải ưu tiên đọc |
| Dòng thời gian có cần thời gian thực không? | Nếu chấp nhận trễ vài giây, có rất nhiều lời giải rẻ hơn |

Giả định cho bài này: **đọc nhiều gấp 100 lần ghi**, và **trễ vài giây là chấp nhận được**.

---

## Kiến trúc ba tầng

```text
   ┌──────────┐   HTTP/REST   ┌──────────────┐   giao thức   ┌──────────┐
   │  CLIENT  │ ────────────▶ │  WEB SERVER  │ ────────────▶ │ DATABASE │
   │ (app/web)│ ◀──────────── │  (bất kỳ NN) │ ◀──────────── │(Postgres)│
   └──────────┘     JSON      └──────────────┘               └──────────┘
```

Vì sao client **không** nối thẳng vào database:

```text
   • Database không nói HTTP
   • Client không giữ được bí mật (chuỗi kết nối, mật khẩu)
   • Không có chỗ đặt logic nghiệp vụ, giới hạn tần suất, kiểm tra quyền
   • Hàng triệu client = hàng triệu kết nối → xem [phase-8 bài 3]
```

Vì sao chọn **REST trên HTTP** chứ không phải WebSocket hay gRPC: không có yêu cầu thời gian thực. HTTP đơn giản nhất, hoạt động với mọi client, và có thể đổi sau nếu cần.

> Nguyên tắc thiết kế: **chọn thứ đơn giản nhất thoả yêu cầu hiện tại**. Thêm phức tạp khi có bằng chứng là cần, không phải khi tưởng tượng ra là sẽ cần.

---

## Đường đi của một tweet

### Phiên bản 1 — ghi thẳng

```text
   Client ──POST /tweets──▶ Server ──INSERT──▶ Database
          ◀──── 201 ─────         ◀── OK ────
```

Chuyện gì xảy ra khi `INSERT` thất bại (database quá tải, mạng chập, hết kết nối)?

```text
   Client nhận 500. Tweet MẤT.
   Người dùng gõ lại từ đầu. Trải nghiệm tệ.
```

### Phiên bản 2 — hàng đợi ở giữa

```text
   Client ──POST──▶ Server ──push──▶ HÀNG ĐỢI ──▶ Worker ──INSERT──▶ Database
          ◀─ 201 ──        (rất nhanh)              (thử lại được)
```

| Được gì | Mất gì |
|---|---|
| **Không bao giờ mất tweet** khi đã tới server | Thêm một thành phần phải vận hành |
| Phản hồi nhanh hơn nhiều | Tweet chưa xuất hiện ngay lập tức |
| Chịu được đỉnh tải (hàng đợi hấp thụ) | Phải xử lý trùng lặp khi thử lại |

Cái giá "tweet chưa xuất hiện ngay" giải bằng **giao diện lạc quan**: hiện tweet lên màn hình người đăng ngay lập tức, coi như đã thành công. Nếu sau đó thất bại thật thì báo lại.

Nhưng phải hỏi tiếp: **hàng đợi có thật sự cần không?**

```text
   Nếu database chịu được tải và INSERT hiếm khi lỗi:
     → hàng đợi chỉ thêm phức tạp
     → dùng cơ chế thử lại ở tầng server là đủ

   Hàng đợi đáng giá khi:
     → đỉnh tải gấp nhiều lần tải trung bình (sự kiện thể thao, tin nóng)
     → cần làm việc phụ sau khi đăng (gửi thông báo, phân tích, kiểm duyệt)
```

Đây là một câu trả lời tốt trong phỏng vấn: **nêu được cả hai phía**, và nói rõ điều kiện để chọn bên nào.

### Chống mất tweet ở chặng client → server

```text
   Client gửi POST, mạng đứt trước khi nhận được phản hồi.
   Client không biết tweet đã tới hay chưa.
   → Gửi lại → có thể tạo TWEET TRÙNG.
```

Lời giải: **khoá bất biến** (idempotency key) do client sinh:

```sql
CREATE TABLE tweets (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT      NOT NULL,
    content         TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    idempotency_key UUID        NOT NULL,
    CONSTRAINT uq_idem UNIQUE (user_id, idempotency_key)
);
```

Client sinh một UUID cho mỗi lần soạn tweet và gửi kèm. Gửi lại cùng khoá đó thì database từ chối, server trả về tweet đã tạo — an toàn khi gửi lại bao nhiêu lần cũng được.

---

## Mô hình dữ liệu

```sql
CREATE TABLE users (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    handle       TEXT        NOT NULL UNIQUE,
    display_name TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- cot phi chuan hoa, xem phan cuoi bai
    follower_count  INT NOT NULL DEFAULT 0,
    following_count INT NOT NULL DEFAULT 0
);

CREATE TABLE tweets (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT      NOT NULL REFERENCES users(id),
    content         TEXT        NOT NULL CHECK (length(content) <= 280),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    idempotency_key UUID        NOT NULL,
    CONSTRAINT uq_tweet_idem UNIQUE (user_id, idempotency_key)
);

CREATE TABLE follows (
    follower_id BIGINT      NOT NULL REFERENCES users(id),
    followee_id BIGINT      NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id),
    CHECK (follower_id <> followee_id)
);
```

Ba chi tiết đáng nói trong bảng `follows`:

```text
   1. KHOÁ CHÍNH PHỨC (follower_id, followee_id)
      → tự động chống theo dõi trùng
      → và tự động tạo index cho câu hỏi "A theo dõi những ai?"

   2. CẦN THÊM INDEX NGƯỢC
      CREATE INDEX idx_follows_followee ON follows (followee_id, follower_id);
      → cho câu hỏi "ai theo dõi A?"
      → nhớ quy tắc tiền tố trái ở [phase-4 bài 3]: khoá chính
        (follower_id, followee_id) KHÔNG dùng được cho WHERE followee_id = ?

   3. CHECK (follower_id <> followee_id)
      → chặn tự theo dõi chính mình ngay ở tầng database
```

Chi tiết số 2 là chỗ rất nhiều thiết kế bỏ sót, và nó biến một truy vấn 0,1 ms thành một lần quét toàn bảng.

Index cho dòng thời gian:

```sql
CREATE INDEX idx_tweets_user_time ON tweets (user_id, created_at DESC);
```

Index này làm được cả ba việc trong một lần duyệt: lọc theo `user_id`, ra đúng thứ tự thời gian, và dừng sau `LIMIT` — đúng như phân tích ở [phase-4 bài 3](../phase-4/03-composite-index-va-optimizer.md).

---

## Bài toán dòng thời gian

Đây là trung tâm của bài.

### Cách 1 — Toè khi đọc (fan-out on read / pull)

Khi người dùng mở ứng dụng, đi hỏi database:

```sql
SELECT t.id, t.content, t.created_at, u.handle
FROM tweets t
JOIN follows f ON f.followee_id = t.user_id
JOIN users   u ON u.id = t.user_id
WHERE f.follower_id = :toi
ORDER BY t.created_at DESC
LIMIT 50;
```

```text
   ƯU:
     • Ghi cực rẻ — một dòng INSERT, xong
     • Không có dữ liệu thừa
     • Bỏ theo dõi ai thì kết quả đúng ngay lập tức

   NHƯỢC:
     • ĐỌC RẤT ĐẮT
```

Vì sao đọc đắt:

```text
   Người dùng theo dõi 500 người.
   → JOIN phải gộp tweet của 500 người
   → sắp xếp toàn bộ theo thời gian
   → lấy 50 dòng đầu

   Với 100 triệu người dùng mở app:
     100.000.000 × (gộp 500 nguồn + sắp xếp)  mỗi lần tải trang
   → không khả thi
```

`EXPLAIN` cho thấy vấn đề:

```text
Limit  (actual time=182.442..182.488 rows=50 loops=1)
  ->  Sort  (actual time=182.441..182.462 rows=50 loops=1)
        Sort Key: t.created_at DESC
        Sort Method: top-N heapsort  Memory: 41kB
        ->  Nested Loop  (actual time=0.088..168.112 rows=248113 loops=1)
              →  248.113 DONG duoc doc len chi de lay 50
```

### Cách 2 — Toè khi ghi (fan-out on write / push)

Đảo ngược: khi ai đó **đăng** tweet, chép nó vào hộp thư của **mọi người theo dõi** ngay lập tức.

```sql
CREATE TABLE timeline (
    user_id    BIGINT      NOT NULL,   -- chu hop thu
    tweet_id   BIGINT      NOT NULL,
    author_id  BIGINT      NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, created_at DESC, tweet_id)
);
```

```sql
-- Khi dang tweet: chep vao hop thu cua moi nguoi theo doi
INSERT INTO timeline (user_id, tweet_id, author_id, created_at)
SELECT f.follower_id, :tweet_id, :author_id, :created_at
FROM follows f
WHERE f.followee_id = :author_id;
```

Đọc trở thành:

```sql
SELECT * FROM timeline WHERE user_id = :toi ORDER BY created_at DESC LIMIT 50;
```

```text
   Mot lan tra index, doc 50 dong lien tiep.  → ~0,3 ms
```

```text
   ƯU:
     • ĐỌC CỰC RẺ — và đây là thao tác chiếm 99% lưu lượng
     • Độ trễ ổn định, không phụ thuộc số người mình theo dõi

   NHƯỢC:
     • GHI ĐẮT
     • Tốn dung lượng (mỗi tweet nhân lên N lần)
     • Bỏ theo dõi thì phải dọn hộp thư
```

### Bài toán người nổi tiếng

Đây là chỗ cách 2 sụp đổ:

```text
   Người dùng bình thường: 200 người theo dõi
     → đăng 1 tweet = 200 lần chèn.  Chấp nhận được.

   Một tài khoản có 100 TRIỆU người theo dõi:
     → đăng 1 tweet = 100.000.000 LẦN CHÈN

   Mỗi dòng ~40 byte  →  4 GB ghi cho MỘT tweet
   Ở tốc độ 100.000 dòng/giây  →  MẤT 1.000 GIÂY = ~17 PHÚT
   → tweet đó xuất hiện dần dần trong 17 phút
   → và trong lúc đó, database bị chiếm dụng hoàn toàn
```

### Cách 3 — Lai (hybrid) — cách các hệ thật dùng

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  NGƯỜI BÌNH THƯỜNG  (< 10.000 người theo dõi)                │
   │    → TOÈ KHI GHI: chép vào hộp thư người theo dõi            │
   │    → chiếm ~99,9% số tài khoản                               │
   ├──────────────────────────────────────────────────────────────┤
   │  NGƯỜI NỔI TIẾNG  (> 10.000 người theo dõi)                  │
   │    → KHÔNG toè. Tweet chỉ nằm ở bảng `tweets`                │
   │    → chiếm ~0,1% số tài khoản                                │
   └──────────────────────────────────────────────────────────────┘

   KHI ĐỌC DÒNG THỜI GIAN:
     1. Lấy 50 dòng từ hộp thư (rẻ)                    ← người thường
     2. Lấy tweet mới của những người NỔI TIẾNG mình theo dõi
        (thường chỉ vài chục người → truy vấn nhỏ)    ← người nổi tiếng
     3. Trộn hai danh sách theo thời gian, lấy 50 dòng đầu
```

```sql
-- Buoc 1
SELECT tweet_id, author_id, created_at
FROM timeline WHERE user_id = :toi
ORDER BY created_at DESC LIMIT 50;

-- Buoc 2 — chi voi nhung nguoi noi tieng minh theo doi
SELECT t.id, t.user_id, t.created_at
FROM tweets t
WHERE t.user_id = ANY(:danh_sach_noi_tieng_toi_theo_doi)
  AND t.created_at > :moc_thoi_gian
ORDER BY t.created_at DESC LIMIT 50;

-- Buoc 3: tron trong ung dung
```

Vì sao bước 2 rẻ: một người theo dõi 500 tài khoản thì thường chỉ **20-50 tài khoản** trong đó là nổi tiếng. Gộp 30 nguồn rẻ hơn gộp 500 nguồn rất nhiều.

### Bảng so sánh ba cách

| | Toè khi đọc | Toè khi ghi | Lai |
|---|---|---|---|
| Chi phí ghi | **Rất thấp** | Rất cao với người nổi tiếng | Thấp |
| Chi phí đọc | Rất cao | **Rất thấp** | Thấp |
| Dung lượng thêm | Không | Cao (nhân N lần) | Vừa |
| Độ phức tạp | **Thấp nhất** | Vừa | **Cao nhất** |
| Xử lý người nổi tiếng | Tự nhiên | **Gãy** | Tốt |
| Nên dùng khi | Dưới ~100 nghìn người dùng | Không có tài khoản khổng lồ | Quy mô lớn |

Câu trả lời tốt trong phỏng vấn không phải "dùng cách 3" mà là: **"bắt đầu bằng cách 1 vì nó đơn giản nhất; chuyển sang cách 3 khi đo được rằng đọc đã thành nút cổ chai."**

---

## Bộ đếm người theo dõi

Hiển thị "1,2 triệu người theo dõi" ở mỗi hồ sơ. Đếm trực tiếp thì sao?

```sql
SELECT count(*) FROM follows WHERE followee_id = 42;
```

```text
   Voi tai khoan 100 trieu nguoi theo doi:
     → dem 100 trieu dong  →  vai giay
     → moi lan co ai mo ho so
   → khong dung duoc
```

Vì thế cột `follower_count` tồn tại. Nhưng như [phase-2 bài 4](../phase-2/04-consistency-va-eventual-consistency.md) đã cảnh báo: **đó là quy tắc database không giữ giúp**.

```sql
-- Cap nhat trong CUNG transaction, va dung bieu thuc tu tham chieu
BEGIN;
  INSERT INTO follows (follower_id, followee_id) VALUES (:toi, :ho);
  UPDATE users SET follower_count  = follower_count  + 1 WHERE id = :ho;
  UPDATE users SET following_count = following_count + 1 WHERE id = :toi;
COMMIT;
```

Và bắt buộc phải có job đối soát:

```sql
SELECT u.id, u.follower_count AS ghi_trong_bang,
       count(f.follower_id)   AS dem_that
FROM users u
LEFT JOIN follows f ON f.followee_id = u.id
GROUP BY u.id, u.follower_count
HAVING u.follower_count <> count(f.follower_id);
```

### Điểm nóng khi tài khoản khổng lồ được theo dõi

```text
   Một tài khoản nổi tiếng được 5.000 người theo dõi mỗi giây.
   → 5.000 lệnh UPDATE cùng một dòng `users` mỗi giây
   → mọi lệnh phải xếp hàng chờ khoá dòng đó
   → điểm nóng, thông lượng sụp
```

Lời giải là **bộ đếm chia mảnh**:

```sql
CREATE TABLE follower_counts (
    user_id BIGINT NOT NULL,
    shard   SMALLINT NOT NULL,           -- 0..99
    cnt     BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, shard)
);

-- Tang: chon ngau nhien 1 trong 100 manh → tranh chap giam 100 lan
UPDATE follower_counts SET cnt = cnt + 1
 WHERE user_id = :ho AND shard = (random()*100)::INT;

-- Doc: cong lai
SELECT sum(cnt) FROM follower_counts WHERE user_id = :ho;
```

Đánh đổi: ghi nhanh hơn 100 lần, đọc chậm hơn (phải cộng 100 dòng). Với bộ đếm hiển thị thì đọc vẫn có thể cache lại vài giây.

---

## Mở rộng khi lớn lên

Theo đúng thang ở [phase-7 bài 3](../phase-7/03-pros-cons-va-khi-nao-dung-sharding.md):

```text
   1. INDEX ĐÚNG
        idx_tweets_user_time, idx_follows_followee
        → thường đủ cho vài triệu người dùng

   2. CACHE
        dòng thời gian của người dùng đang hoạt động → Redis, TTL 60s
        hồ sơ người dùng                              → Redis, TTL 300s
        → tỉ lệ trúng cache thường > 95%

   3. REPLICA ĐỌC
        đọc dòng thời gian → replica
        ghi tweet, theo dõi → primary
        → chú ý read-your-own-writes: tweet của CHÍNH MÌNH phải đọc từ primary

   4. PARTITIONING
        bảng `tweets` phân mảnh theo tháng
        → cắt tỉa cho truy vấn theo thời gian, xoá dữ liệu cũ tức thì

   5. SHARDING
        `tweets` và `timeline` shard theo user_id
        → nhóm cùng vị trí: mọi thứ của một người ở cùng một shard
        → nhưng `follows` thì khó: nó vốn là quan hệ xuyên người dùng
```

Điểm mấu chốt ở bước 3: người dùng **phải luôn thấy tweet của chính mình ngay lập tức**. Đọc dòng thời gian của người khác trễ 2 giây thì không ai nhận ra; tweet của mình không hiện ra thì ai cũng nhận ra.

Và ở bước 5, bảng `follows` là chỗ khó: quan hệ theo dõi vốn cắt ngang người dùng. Cách thường dùng là **lưu hai bản**: một bản shard theo `follower_id` (để trả lời "tôi theo dõi ai"), một bản shard theo `followee_id` (để trả lời "ai theo dõi tôi").

---

## Ước lượng quy mô

Con số làm cho thiết kế trở nên cụ thể:

```text
   GIẢ ĐỊNH
     • 300 triệu người dùng hoạt động hàng tháng
     • 50 triệu hoạt động hàng ngày
     • mỗi người đăng 2 tweet/ngày  →  100 triệu tweet/ngày
     • mỗi người mở app 10 lần/ngày →  500 triệu lượt đọc dòng thời gian/ngày

   TỐC ĐỘ
     Ghi : 100.000.000 / 86.400  ≈  1.160 tweet/giây  (đỉnh ×3 ≈ 3.500)
     Đọc : 500.000.000 / 86.400  ≈  5.800 lượt/giây   (đỉnh ×3 ≈ 17.400)
     → TỈ LỆ ĐỌC/GHI ≈ 5:1 ở tầng yêu cầu,
       nhưng ~500:1 ở tầng SỐ DÒNG được đọc

   DUNG LƯỢNG
     tweet: 100 triệu/ngày × ~300 byte  ≈  30 GB/ngày  ≈  11 TB/năm
     timeline (toè khi ghi, trung bình 200 người theo dõi):
        100 triệu × 200 × 40 byte      ≈  800 GB/NGÀY   ⚠

   → Con số cuối giải thích vì sao bảng `timeline` phải có TTL:
     chỉ giữ 800 dòng gần nhất mỗi người, xoá phần cũ.
```

Con số 800 GB/ngày là lý do không hệ nào giữ dòng thời gian vô hạn. Cuộn xuống đủ sâu thì hệ thống chuyển sang truy vấn trực tiếp bảng `tweets` — chấp nhận chậm hơn cho một thao tác hiếm.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chỉ tạo khoá chính `(follower_id, followee_id)` | Câu hỏi "ai theo dõi tôi" phải quét toàn bảng | Thêm index ngược `(followee_id, follower_id)` |
| Toè khi ghi mà không xử lý người nổi tiếng | Một tweet = 100 triệu lần chèn = 17 phút | Mô hình lai, ngưỡng ~10.000 người theo dõi |
| `count(*)` cho số người theo dõi | Vài giây mỗi lần mở hồ sơ | Cột phi chuẩn hoá + job đối soát |
| Cột đếm không chia mảnh cho tài khoản khổng lồ | Điểm nóng khoá dòng, thông lượng sụp | Bộ đếm chia mảnh |
| Đọc tweet của chính mình từ replica | Người dùng không thấy tweet vừa đăng | Đọc từ primary trong vài giây sau khi ghi |
| Không có khoá bất biến khi đăng tweet | Gửi lại tạo tweet trùng | `UNIQUE (user_id, idempotency_key)` |
| Giữ bảng `timeline` vô hạn | 800 GB/ngày | Chỉ giữ ~800 dòng gần nhất mỗi người |
| Nhảy thẳng vào mô hình lai từ đầu | Phức tạp không cần thiết ở quy mô nhỏ | Bắt đầu bằng toè khi đọc; đổi khi đo được nút cổ chai |

## Tóm tắt bài 1

- Ba yêu cầu nghiệp vụ đơn giản đẻ ra hàng chục yêu cầu kỹ thuật; hai câu hỏi phải hỏi trước là **tỉ lệ đọc/ghi** và **có cần thời gian thực không**.
- Hàng đợi trước database giúp **không mất tweet** và hấp thụ đỉnh tải — nhưng chỉ đáng thêm khi có bằng chứng cần, không phải mặc định.
- **Khoá bất biến** (`UNIQUE (user_id, idempotency_key)`) là cách chặn tweet trùng khi client gửi lại.
- Bảng `follows` cần **hai index ngược nhau** — khoá chính `(follower_id, followee_id)` không trả lời được câu hỏi "ai theo dõi tôi" vì quy tắc tiền tố trái.
- Ba mô hình dòng thời gian: **toè khi đọc** (ghi rẻ, đọc đắt) · **toè khi ghi** (đọc rẻ, gãy với người nổi tiếng — một tweet có thể thành 100 triệu lần chèn) · **lai** (cách các hệ thật dùng).
- Trả lời phỏng vấn tốt: **bắt đầu bằng cách đơn giản nhất, chuyển sang mô hình lai khi đo được rằng đọc là nút cổ chai** — không phải chọn ngay cách phức tạp nhất.
- Bộ đếm người theo dõi phải phi chuẩn hoá, phải có **job đối soát**, và với tài khoản khổng lồ phải **chia mảnh** để tránh điểm nóng khoá dòng.
- Ước lượng cho thấy bảng `timeline` sinh ~**800 GB/ngày** — đó là lý do mọi hệ đều giới hạn dòng thời gian ở vài trăm mục gần nhất.

**Bài kế tiếp** → [Bài 2: System Design - URL Shortener](02-system-design-url-shortener.md)
