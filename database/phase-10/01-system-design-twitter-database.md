# Bài 1: System Design - Database Design cho Twitter

## Giới thiệu

System design là một **nghệ thuật**, không phải công thức. Không có thiết kế hoàn hảo — mỗi quyết định đều có trade-off. Bài này walk through quá trình tư duy thiết kế database cho một hệ thống giống Twitter.

**Features cần xây dựng:**
1. Post tweet (140-280 ký tự)
2. Follow người dùng khác
3. Xem Home Timeline (tweets từ những người mình follow)

---

## Tư duy thiết kế: Bắt đầu từ đâu?

```
Nguyên tắc:
  1. Bắt đầu từ yêu cầu nghiệp vụ (functional requirements)
  2. Suy ra yêu cầu kỹ thuật
  3. Thiết kế database schema trước
  4. Thiết kế API sau
  5. Scale khi thực sự cần

"Đừng dùng sharding ngay từ đầu. Bắt đầu đơn giản, 
scale khi thực sự cần."
```

---

## Feature 1: Post Tweet

### High-Level Architecture

```
Client (Mobile/Web)
     │ HTTP (REST API)
     ▼
Web Server
     │ PostgreSQL wire protocol
     ▼
Database (PostgreSQL)
```

### Database Schema - Tweets Table

```sql
CREATE TABLE tweets (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    content     VARCHAR(280) NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_tweets_user_created ON tweets(user_id, created_at DESC);
```

### API - POST /tweets

```
Client → POST /tweets
Body: { "content": "Hello Twitter!" }

Server:
  1. Authenticate user (lấy user_id từ token)
  2. Validate content (length, content policy)
  3. INSERT INTO tweets...
  4. Return success + tweet_id

Response: { "id": 12345, "content": "Hello Twitter!" }
```

### Vấn đề với POST trực tiếp vào DB

```
Vấn đề: Network failure giữa client và server
  → Client đang mất WiFi
  → TCP connection chết
  → Tweet CHƯA được ghi vào DB
  → User nhấn "Post" nhưng tweet biến mất!

Giải pháp 1: Client-side persistence (SQLite)
  → Lưu tweet vào SQLite local ngay khi user nhấn Post
  → Nếu gửi thành công: Xóa khỏi local
  → Nếu fail: Lưu vào Drafts, thông báo user "Đã lưu nháp"

Giải pháp 2: Message Queue (Kafka/RabbitMQ)
  → Client → Server → Message Queue (fast!)
  → Consumer → Database (async)
  → Benefit: Server respond "Success" ngay khi push vào queue
  → Cost: Complexity tăng, có lag nhỏ
```

### Scale: Load Balancer

```
                        ┌──────────────────┐
Client ─────────────→  │  Load Balancer   │
(HTTP/HTTPS)            │  (Layer 7)       │
                        └────────┬─────────┘
                                 │
                 ┌───────────────┼───────────────┐
                 ▼               ▼               ▼
           ┌──────────┐   ┌──────────┐   ┌──────────┐
           │ Server 1 │   │ Server 2 │   │ Server 3 │
           └──────────┘   └──────────┘   └──────────┘
                                 │
                                 ▼
                    ┌─────────────────────┐
                    │   Master Database   │
                    └─────────────────────┘
```

---

## Feature 2: Follow / Unfollow

### Database Schema - Relationships

```sql
-- Profile table
CREATE TABLE users (
    id          BIGSERIAL PRIMARY KEY,
    username    VARCHAR(50) UNIQUE NOT NULL,
    name        VARCHAR(100),
    bio         TEXT,
    picture_url TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Following/Followers table
-- Một row = "source_id đang follow destination_id"
CREATE TABLE follows (
    source_id       BIGINT NOT NULL,  -- Người follow
    destination_id  BIGINT NOT NULL,  -- Người được follow
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (source_id, destination_id),
    FOREIGN KEY (source_id) REFERENCES users(id),
    FOREIGN KEY (destination_id) REFERENCES users(id)
);

-- Index cho cả 2 chiều query
CREATE INDEX idx_follows_source ON follows(source_id);
CREATE INDEX idx_follows_destination ON follows(destination_id);
```

### Ví dụ Data

```
follows table:
  source_id | destination_id | created_at
  ──────────┼────────────────┼───────────
  1         | 2              | ...        ← Hussein follows Mary
  1         | 5              | ...        ← Hussein follows Taylor Swift
  2         | 1              | ...        ← Mary follows Hussein
  5         | 1              | ...        ← Taylor Swift follows Hussein

→ Bảng này tự nhiên cho cả "following" và "followers"!
```

### API - Followers & Following Count

```sql
-- Số người tôi đang follow (following count)
SELECT COUNT(*) FROM follows WHERE source_id = :my_id;

-- Số người đang follow tôi (followers count)
SELECT COUNT(*) FROM follows WHERE destination_id = :my_id;

-- Tôi có đang follow user X không?
SELECT COUNT(*) FROM follows 
WHERE source_id = :my_id AND destination_id = :target_id;
-- → 1: đang follow, 0: không follow
```

### Tối ưu: Async Loading cho Profile

```
Khi user click vào profile X:

  Instant (Step 1): Gửi query lấy thông tin cơ bản
    SELECT id, name, bio, picture_url FROM users WHERE id = :id
    → Hiện profile ngay cho user thấy

  Async (Step 2): Sau đó load followers/following count
    → Gửi request riêng
    → Update UI khi có data

  → User thấy content ngay, counts load sau
  → Better UX: Instagram và Twitter làm tương tự!
```

---

## Feature 3: Home Timeline

### Thách thức

Home Timeline = "Tất cả tweets từ những người tôi đang follow, theo thứ tự thời gian"

```sql
-- Naive approach: Join 2 bảng lớn
SELECT t.*
FROM tweets t
JOIN follows f ON t.user_id = f.destination_id
WHERE f.source_id = :my_id
ORDER BY t.created_at DESC
LIMIT 20;
```

```
Vấn đề:
  - follows table: Hàng tỷ rows (người nổi tiếng có 50M followers)
  - tweets table: Hàng tỷ rows
  - JOIN trên cả 2 bảng = Chậm!
  - Taylor Swift tweet 1 tweet → 50M followers phải query
```

### Giải pháp 1: Fan-out on Write (Twitter cũ)

```
Khi User A post tweet:
  1. Insert tweet vào tweets table
  2. Lấy tất cả followers của A
  3. Insert tweet_id vào "timeline" của MỖI follower

home_timelines table:
  user_id | tweet_id | created_at
  ────────┼──────────┼───────────
  1       | 9999     | ...   ← User 1 nhận tweet 9999
  2       | 9999     | ...   ← User 2 nhận tweet 9999
  5       | 9999     | ...   ← User 5 nhận tweet 9999

SELECT tweet_id FROM home_timelines WHERE user_id = :my_id ORDER BY created_at DESC LIMIT 20;
→ Đọc nhanh vì không cần JOIN!
```

```
Trade-off:
  ✅ Read: Rất nhanh (direct lookup)
  ❌ Write: Chậm khi celebrity post (50M inserts!)
  ❌ Storage: Tốn nhiều space (duplicate data)
  
Twitter dùng Redis để lưu timeline (in-memory, không persist)
```

### Giải pháp 2: Fan-out on Read (Hybrid)

```
Hybrid approach (Twitter hiện tại):
  - Users bình thường: Fan-out on Write (precompute timeline)
  - Celebrities (>X followers): Fan-out on Read (query khi cần)

Khi đọc timeline:
  1. Lấy precomputed timeline từ Redis
  2. Merge với tweets của celebrities mà mình follow
  3. Sort và return

→ Cân bằng giữa read và write performance
```

### Index Design cho Timeline Queries

```sql
-- Composite index cho follows table
CREATE INDEX idx_follows_source_dest ON follows(source_id, destination_id);
-- → Tìm "ai đang follow tôi" nhanh

-- Composite index cho tweets table
CREATE INDEX idx_tweets_user_time ON tweets(user_id, created_at DESC);
-- → Tìm "tweets của user X, mới nhất trước" nhanh

-- Nếu dùng timeline table
CREATE INDEX idx_timeline_user_time ON home_timelines(user_id, created_at DESC);
-- → Direct timeline lookup
```

---

## Scaling Strategy

### Phase 1: Single Database (0 → 10M users)

```
Tất cả đều đọc/ghi vào 1 PostgreSQL server.
Optimize queries, đúng indexes.
```

### Phase 2: Read Replicas (10M → 100M users)

```
Master ← Writes
  │
  ├── Replica 1 (US) ← Reads từ US users
  ├── Replica 2 (EU) ← Reads từ EU users
  └── Replica 3 (Asia) ← Reads từ Asia users

80% workload là reads → Replicas giảm tải đáng kể!
```

### Phase 3: Partitioning + Caching (100M+ users)

```
Tweets table: Partition theo created_at (monthly)
Follows table: Partition theo user_id hash

Redis Cache:
  - Home timelines (in-memory, read nhanh)
  - Trending topics
  - User profiles (ít thay đổi)
```

### Phase 4: Sharding (Twitter-scale, billions of users)

```
Shard key: user_id
  Shard 1: users 0 → 333M
  Shard 2: users 333M → 666M
  Shard 3: users 666M → 1B

Chỉ shard khi các phương pháp trước không còn đủ!
Twitter sử dụng Vitess (MySQL sharding middleware)
```

---

## Tổng kết Design Principles

```
1. Bắt đầu đơn giản, scale khi cần
   → Don't over-engineer từ đầu

2. Reads nhiều hơn Writes → Optimize cho Reads
   → Denormalize nếu cần (home_timelines table)

3. Index đúng chỗ, đúng thứ tự
   → Composite index (source_id, destination_id)
   → Không index mọi thứ

4. Eventual consistency có thể chấp nhận với social media
   → Counts trễ vài giây: OK
   → Timeline trễ vài giây: OK

5. Không có thiết kế hoàn hảo
   → Mọi quyết định đều có trade-off
   → Document rõ lý do đưa ra quyết định
```

---

**Tiếp theo:** 02-system-design-url-shortener.md →
