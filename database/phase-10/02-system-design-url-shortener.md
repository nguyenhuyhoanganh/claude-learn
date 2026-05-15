# Bài 2: System Design - URL Shortener

## Bài toán

Xây dựng hệ thống rút gọn URL:
- **Write**: Nhận URL dài → Tạo và lưu URL ngắn
- **Read**: Nhận URL ngắn → Trả về URL gốc (redirect)

Ví dụ: `https://wikipedia.org/wiki/Database_sharding` → `mydomain.com/abc12`

---

## Design 1: Sequential ID (Đơn giản nhất)

### Database Schema

```sql
CREATE TABLE urls (
    id   BIGSERIAL PRIMARY KEY,  -- Auto-increment 64-bit
    url  TEXT NOT NULL           -- Long URL
);

-- index trên id là tự động (PRIMARY KEY)
```

### Cách hoạt động

```
Write (Rút gọn URL):
  POST /shorten
  Body: { "url": "https://wikipedia.org/..." }
  
  → INSERT INTO urls (url) VALUES ($1) RETURNING id
  → Database tự tạo id = 12345
  → Short URL = domain.com/12345
  → Trả về { "shortUrl": "domain.com/12345" }

Read (Mở rộng URL):
  GET /12345
  
  → SELECT url FROM urls WHERE id = 12345
  → id là PRIMARY KEY → Index tự động
  → B+Tree lookup: O(log N) nhưng rất nhanh với integer key
  → 302 Redirect đến URL gốc
```

### Performance Analysis

```
Write performance:
  ✅ INSERT + auto-increment = KHÔNG cần check duplicate
  ✅ id luôn unique theo definition
  ✅ B+Tree insert: Vẫn nhanh nhưng chậm dần theo thời gian
  
  Nếu dùng B+Tree engine (PostgreSQL mặc định):
    → Rebalancing tree khi insert nhiều
    → Vẫn nhanh vì insert luôn ở cuối (sequential)
    
  Nếu dùng LSM-tree (Cassandra, RocksDB/MyRocks):
    → Writes cực nhanh (append-only)
    → Tốt hơn nếu write-heavy

Read performance:
  ✅ id là integer (64-bit) → Index nhỏ gọn
  ✅ Index lookup với integer: Cực kỳ nhanh
  ✅ B+Tree với integer key: ~512-2048 keys/page → Tree nông
  ✅ 1 tỷ rows → Chỉ cần 3-4 I/O hops!
```

### Nhược điểm

```
❌ Predictable (Dễ đoán):
  Domain.com/1, /2, /3, /4...
  → Attacker có thể scan toàn bộ database
  → Loop i = 1 to 1_000_000 → Thu thập tất cả URLs
  
❌ Không hỗ trợ Custom URL:
  User không thể chọn "domain.com/my-presentation"
```

---

## Design 2: Hash-based (Custom URL Support)

### Database Schema

```sql
CREATE TABLE urls (
    short_url  CHAR(8) PRIMARY KEY,  -- 8-char hash (custom or auto)
    long_url   TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- PRIMARY KEY tự tạo index trên short_url
-- Không cần index riêng
```

### Tạo Short URL ngẫu nhiên

```javascript
const crypto = require('crypto');

function generateShortUrl(longUrl) {
    // SHA-256 hash → Base64 encoding
    const hash = crypto
        .createHash('sha256')
        .update(longUrl + Date.now())  // Salt = timestamp để tránh collision
        .digest('base64url');          // base64url = safe cho URL
    
    return hash.substring(0, 8);  // Lấy 8 ký tự đầu
}

// Ví dụ output: 'aB3xY7mK'
// Base64url alphabet: A-Z, a-z, 0-9, -, _
// 8 ký tự: 64^8 = ~281 tỷ combinations
```

### Write với Collision Handling

```javascript
async function shortenUrl(longUrl, customUrl = null) {
    const pool = getDbPool();
    
    if (customUrl) {
        // Custom URL: User tự chọn
        try {
            await pool.query(
                'INSERT INTO urls (short_url, long_url) VALUES ($1, $2)',
                [customUrl, longUrl]
            );
            return customUrl;
        } catch (err) {
            if (err.code === '23505') {  // Unique constraint violation
                throw new Error('Custom URL already taken');
            }
            throw err;
        }
    }
    
    // Auto-generated URL
    let retries = 0;
    while (retries < 5) {
        const shortUrl = generateShortUrl(longUrl);
        
        try {
            await pool.query(
                'INSERT INTO urls (short_url, long_url) VALUES ($1, $2)',
                [shortUrl, longUrl]
            );
            return shortUrl;
        } catch (err) {
            if (err.code === '23505') {  // Collision: Try lại với hash khác
                retries++;
                continue;
            }
            throw err;
        }
    }
    
    throw new Error('Failed to generate unique short URL');
}
```

```
Collision Handling Logic:
  1. Hash URL → 8 chars
  2. INSERT (không SELECT trước!)
  3. Nếu succeed: Done!
  4. Nếu duplicate key error: Retry với salt mới
  5. Tối đa 5 retries
  
Tại sao không SELECT trước?
  → INSERT + check DB error: 1 round-trip
  → SELECT + INSERT: 2 round-trips
  → Collision rate với 8 chars: Cực kỳ thấp (< 0.001%)
  → Retries hầu như không xảy ra trong thực tế
```

### Read

```javascript
async function expandUrl(shortUrl) {
    const pool = getDbPool();
    
    // Sanitize input (tránh SQL injection)
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(shortUrl)) {
        return null;  // Invalid format
    }
    
    const result = await pool.query(
        'SELECT long_url FROM urls WHERE short_url = $1',
        [shortUrl]
    );
    
    if (result.rowCount === 0) return null;
    return result.rows[0].long_url;
}

// Express endpoint
app.get('/:shortUrl', async (req, res) => {
    const longUrl = await expandUrl(req.params.shortUrl);
    
    if (!longUrl) {
        return res.status(404).send('URL not found');
    }
    
    // 301: Permanent redirect (browser caches → Giảm load)
    // 302: Temporary redirect (không cache → Tốt cho analytics)
    res.redirect(302, longUrl);
});
```

### Performance Comparison

```
Design 1 (Sequential ID):   Design 2 (Hash-based):
Write: ✅✅✅ Very fast      Write: ✅✅ Fast (với retries hiếm gặp)
Read:  ✅✅✅ Very fast      Read:  ✅✅ Fast (string index lớn hơn)
Security: ❌ Predictable    Security: ✅ Unpredictable
Custom: ❌ Not supported    Custom: ✅ Supported

Index size comparison:
  BIGINT (8 bytes): ~1024 keys/page
  CHAR(8) (8 bytes): ~1024 keys/page  ← Tương đương!
  
→ Performance gần giống nhau cho reads!
```

---

## Scaling URL Shortener

### Phase 1: Single Server (0 → ~100M URLs)

```
Client → Web Server → PostgreSQL
```

### Phase 2: Read Replicas (100M → 1B URLs)

```
Reads >> Writes (99%+ workload là reads)
→ Scale reads với replicas!

Client → Load Balancer
              │
     ┌────────┴────────┐
     │                 │
 Web Server 1    Web Server 2
     │                 │
     └────────┬────────┘
              │
   ┌──────────┼──────────┐
   │          │          │
Master    Replica 1   Replica 2
(Writes)  (US Reads) (EU Reads)
```

### Phase 3: Caching (Khi I/O là bottleneck)

```javascript
// Redis cache cho popular URLs
const redis = require('redis');
const redisClient = redis.createClient();

async function expandUrlWithCache(shortUrl) {
    // Check cache first
    const cached = await redisClient.get(`url:${shortUrl}`);
    if (cached) {
        return cached;  // Cache hit!
    }
    
    // Cache miss: Query DB
    const longUrl = await expandUrlFromDB(shortUrl);
    
    if (longUrl) {
        // Cache for 1 hour
        await redisClient.setEx(`url:${shortUrl}`, 3600, longUrl);
    }
    
    return longUrl;
}
```

```
Cache strategy:
  - TTL: 1 hour (URLs không thường xuyên thay đổi)
  - Eviction: LRU (Least Recently Used)
  - Cache hit rate ~90%: → 90% requests không cần DB!
```

### Phase 4: Database Partitioning

```sql
-- Partition theo short_url prefix (Hash partitioning)
CREATE TABLE urls PARTITION BY HASH(short_url);

CREATE TABLE urls_p0 PARTITION OF urls
    FOR VALUES WITH (MODULUS 4, REMAINDER 0);
    
CREATE TABLE urls_p1 PARTITION OF urls
    FOR VALUES WITH (MODULUS 4, REMAINDER 1);
    
-- ... etc
```

---

## So sánh hai Design

```
┌──────────────────┬───────────────────┬──────────────────────┐
│ Tiêu chí         │ Design 1 (ID)     │ Design 2 (Hash)      │
├──────────────────┼───────────────────┼──────────────────────┤
│ URL format       │ /12345 (numbers)  │ /aB3xY7mK (chars)   │
│ Predictability   │ ❌ Dễ scan        │ ✅ Khó đoán          │
│ Custom URL       │ ❌ Không          │ ✅ Có                 │
│ Write speed      │ ✅✅✅ Nhanh nhất │ ✅✅ Nhanh (ít retry) │
│ Read speed       │ ✅✅✅ Nhanh nhất │ ✅✅ Nhanh            │
│ Collision risk   │ ❌ 0%             │ ~0.001% (OK)         │
│ Index size       │ Small (8 bytes)   │ Small (8 bytes)      │
│ Use case         │ Internal systems  │ Public URL shorteners│
└──────────────────┴───────────────────┴──────────────────────┘

Chọn Design 1 nếu:
  - Internal system (Twitter tự động shorten links)
  - User không bao giờ thấy short URL trực tiếp
  - Maximun write performance cần thiết

Chọn Design 2 nếu:
  - Public URL shortener (Bitly, TinyURL)
  - User cần custom URL
  - Security/privacy quan trọng
```

---

## SQL Injection Prevention

```javascript
// ❌ NGUY HIỂM: String interpolation
const query = `SELECT * FROM urls WHERE short_url = '${userInput}'`;
// Input: "'; DROP TABLE urls; --"
// → Xóa toàn bộ bảng!

// ✅ AN TOÀN: Parameterized query
const query = 'SELECT * FROM urls WHERE short_url = $1';
const result = await pool.query(query, [userInput]);
// → userInput luôn được escape, không thể inject SQL

// ✅ AN TOÀN: Input validation
const SHORT_URL_REGEX = /^[A-Za-z0-9_-]{1,50}$/;
if (!SHORT_URL_REGEX.test(userInput)) {
    return res.status(400).send('Invalid URL format');
}
```

---

## HTTP 301 vs 302 Redirect

```
301 Permanent Redirect:
  → Browser cache: "URL này luôn redirect đến X"
  → Subsequent requests: Browser không gọi server nữa
  ✅ Giảm load trên server
  ❌ Analytics không chính xác (không đếm được clicks)
  ❌ Nếu target URL thay đổi: Users đã cache sẽ không biết

302 Temporary Redirect:
  → Browser KHÔNG cache
  → Mỗi click đều gọi server
  ✅ Analytics chính xác (đếm được mỗi click)
  ✅ Có thể thay đổi target URL bất cứ lúc nào
  ❌ More server load

Bitly và TinyURL dùng: 301 (tiết kiệm bandwidth)
Nếu cần analytics: 302
```

---

**Tiếp theo:** Phase 11 - Database Engines →
