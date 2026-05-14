# Bài 2: Sharding Thực hành với Node.js và PostgreSQL

## Demo: URL Shortener với 3 PostgreSQL Shards

Chúng ta sẽ xây dựng một URL shortener đơn giản với sharding:
- 3 PostgreSQL instances (shards) chạy trên các ports khác nhau
- Node.js application với consistent hashing để route đến đúng shard
- POST endpoint: rút gọn URL
- GET endpoint: mở rộng URL từ code ngắn

---

## Bước 1: Setup Schema

### Tạo file `init.sql`

```sql
-- Schema cho mỗi shard
CREATE TABLE url_table (
    id     SERIAL NOT NULL,
    url    TEXT NOT NULL,
    url_id CHAR(5) NOT NULL,
    PRIMARY KEY (id)
);
```

### Tạo Docker Image tùy chỉnh

```dockerfile
# Dockerfile
FROM postgres:13

# Copy script vào thư mục đặc biệt
# PostgreSQL tự động chạy các file .sql trong thư mục này khi khởi động
COPY init.sql /docker-entrypoint-initdb.d/

# Kết quả: Mỗi container khi spin up sẽ tự tạo url_table
```

```bash
# Build image
docker build -t pg-shard .
```

---

## Bước 2: Khởi động 3 Shard Instances

```bash
# Shard 1 - port 5432
docker run --name pg-shard-1 \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d pg-shard

# Shard 2 - port 5433
docker run --name pg-shard-2 \
  -e POSTGRES_PASSWORD=postgres \
  -p 5433:5432 \
  -d pg-shard

# Shard 3 - port 5434
docker run --name pg-shard-3 \
  -e POSTGRES_PASSWORD=postgres \
  -p 5434:5432 \
  -d pg-shard

# Kiểm tra 3 containers đang chạy
docker ps
```

```
Kết quả:
┌──────────────┬───────────────────────┐
│  Container   │  Port                 │
├──────────────┼───────────────────────┤
│  pg-shard-1  │  5432 → postgresql    │
│  pg-shard-2  │  5433 → postgresql    │
│  pg-shard-3  │  5434 → postgresql    │
└──────────────┴───────────────────────┘

Mỗi shard có:
  - Database: postgres
  - User: postgres
  - Bảng: url_table (empty)
```

---

## Bước 3: Node.js Project Setup

```bash
mkdir sharding-demo
cd sharding-demo
npm init -y
npm install express pg hashring crypto
```

### Thư viện sử dụng

```
express    - Web framework
pg         - PostgreSQL client cho Node.js
hashring   - Consistent hashing implementation
crypto     - SHA-256 hashing (built-in Node.js)
```

---

## Bước 4: Kết nối đến các Shards

```javascript
// index.js
const express = require('express');
const { Client } = require('pg');
const HashRing = require('hashring');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Cấu hình kết nối đến 3 shards
// Key = port string (dùng để identify shard)
const clients = {
    '5432': new Client({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'postgres'
    }),
    '5433': new Client({
        host: 'localhost',
        port: 5433,
        user: 'postgres',
        password: 'postgres',
        database: 'postgres'
    }),
    '5434': new Client({
        host: 'localhost',
        port: 5434,
        user: 'postgres',
        password: 'postgres',
        database: 'postgres'
    })
};

// Tạo Hash Ring với 3 nodes (dùng port string làm node name)
const hashRing = new HashRing(['5432', '5433', '5434']);

// Kết nối tất cả clients
async function connect() {
    try {
        await clients['5432'].connect();
        await clients['5433'].connect();
        await clients['5434'].connect();
        console.log('Connected to all 3 shards!');
    } catch (err) {
        console.error('Connection error:', err);
    }
}

connect();
```

---

## Bước 5: Hàm Hash để Tạo URL Code

```javascript
// Tạo hash từ URL → lấy 5 ký tự đầu làm url_id
function hashUrl(url) {
    const hash = crypto
        .createHash('sha256')
        .update(url)
        .digest('base64');
    
    return hash.substring(0, 5);  // Lấy 5 ký tự đầu
}

// Ví dụ:
// hashUrl('https://wikipedia.org/wiki/Database_sharding')
//   → 'abc12' (5 chars, always same for same URL)
// hashUrl('https://google.com')
//   → 'xyz98' (different URL → different hash)
```

**Lưu ý:** Đây là implementation đơn giản cho mục đích demo. Production URL shortener cần xử lý collision (2 URL khác nhau có cùng 5 chars hash).

---

## Bước 6: Write - POST Endpoint

```javascript
// POST /  (body: { url: 'https://...' })
// Rút gọn URL và lưu vào đúng shard
app.post('/', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).send('URL is required');
    }
    
    // Bước 1: Tạo url_id bằng hash
    const urlId = hashUrl(url);
    
    // Bước 2: Consistent hashing → tìm shard
    // hashRing.get(key) trả về tên node (port string)
    const server = hashRing.get(urlId);
    
    console.log(`URL: ${url}`);
    console.log(`URL ID: ${urlId}`);
    console.log(`Target shard: ${server}`);
    
    // Bước 3: Insert vào đúng shard
    const client = clients[server];
    
    try {
        await client.query(
            'INSERT INTO url_table (url, url_id) VALUES ($1, $2)',
            [url, urlId]
        );
        
        res.json({
            urlId,
            server,
            message: 'URL shortened successfully'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error inserting URL');
    }
});
```

### Luồng hoạt động của Write

```
Client gửi POST với URL dài
         │
         ▼
   hashUrl(url) → urlId (5 chars)
         │
         ▼
   hashRing.get(urlId) → server port ('5432' | '5433' | '5434')
         │
         ▼
   clients[server].query(INSERT ...)
         │
         ▼
   Data vào đúng shard!
   
Key insight: Cùng URL → cùng urlId → cùng server!
```

---

## Bước 7: Read - GET Endpoint

```javascript
// GET /:urlId
// Tìm URL gốc từ url_id
app.get('/:urlId', async (req, res) => {
    const { urlId } = req.params;
    
    // Bước 1: Tìm shard bằng consistent hashing
    // Dùng urlId làm key → sẽ ra CÙNG server như lúc write!
    const server = hashRing.get(urlId);
    
    console.log(`Looking for urlId: ${urlId} on server: ${server}`);
    
    // Bước 2: Query đúng shard
    const client = clients[server];
    
    try {
        const result = await client.query(
            'SELECT url, url_id FROM url_table WHERE url_id = $1',
            [urlId]
        );
        
        if (result.rowCount > 0) {
            const row = result.rows[0];
            res.json({
                urlId: row.url_id,
                url: row.url,
                server  // Cho biết data đến từ shard nào
            });
        } else {
            res.status(404).send('URL not found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Error querying URL');
    }
});

app.listen(8081, () => console.log('Listening on port 8081'));
```

### Tại sao Read luôn tìm đúng shard?

```
Consistent Hashing là deterministic:
  Cùng key → Cùng node (luôn luôn!)

Khi Write:
  hashRing.get('abc12') → '5433'
  → Lưu vào shard 5433

Khi Read:
  hashRing.get('abc12') → '5433'  (same result!)
  → Query shard 5433
  → Tìm thấy!

Không cần lookup table hay metadata store.
Chỉ cần chạy cùng hash function với cùng input!
```

---

## Bước 8: Test Demo

```bash
# Khởi động server
node index.js
# → Listening on port 8081

# Write: Rút gọn Wikipedia URL
curl -X POST "http://localhost:8081/?url=https://wikipedia.org/wiki/Sharding"
# Response: { "urlId": "abc12", "server": "5433" }

# Write: Rút gọn Google URL
curl -X POST "http://localhost:8081/?url=https://google.com"
# Response: { "urlId": "xyz98", "server": "5432" }

# Read: Tìm lại Wikipedia URL
curl "http://localhost:8081/abc12"
# Response: { "urlId": "abc12", "url": "https://wikipedia.org/wiki/Sharding", "server": "5433" }

# Read: Tìm lại Google URL
curl "http://localhost:8081/xyz98"
# Response: { "urlId": "xyz98", "url": "https://google.com", "server": "5432" }

# Không tồn tại
curl "http://localhost:8081/zzzzz"
# Response: 404 URL not found
```

---

## Bước 9: Bulk Insert để Kiểm tra Phân phối

```javascript
// Thêm nhiều URLs để xem sharding phân phối thế nào
async function bulkInsert() {
    const urls = [];
    for (let i = 0; i < 100; i++) {
        urls.push(`https://google.com/search?q=test${i}`);
    }
    
    const shardCounts = { '5432': 0, '5433': 0, '5434': 0 };
    
    for (const url of urls) {
        const urlId = hashUrl(url);
        const server = hashRing.get(urlId);
        shardCounts[server]++;
        
        await clients[server].query(
            'INSERT INTO url_table (url, url_id) VALUES ($1, $2)',
            [url, urlId]
        );
    }
    
    console.log('Distribution:', shardCounts);
}
```

```
Kết quả điển hình với consistent hashing:
  Shard 5432: 34 rows
  Shard 5433: 33 rows
  Shard 5434: 33 rows
  
→ Phân phối đều (không perfect nhưng tốt)
→ Consistent: URL nào vào shard nào được xác định bởi hash
```

---

## Resharding: Vấn đề khi Thêm Shard

```javascript
// TRƯỚC: 3 shards
const hashRing = new HashRing(['5432', '5433', '5434']);
hashRing.get('abc12')  // → '5433'

// SAU: Thêm shard 5435
const hashRing = new HashRing(['5432', '5433', '5434', '5435']);
hashRing.get('abc12')  // → '5432' ← KHÁC! Data move cần thiết!
```

**Đây là một trong những lý do sharding cần lên kế hoạch cẩn thận:**

```
Với Simple Hash (% N):
  3 → 4 shards: ~75% data phải di chuyển

Với Consistent Hash:
  3 → 4 shards: ~25% data phải di chuyển (1/N)
  Vẫn cần migrate, nhưng ít hơn!

Resharding process:
  1. Thêm shard mới vào hash ring
  2. Identify data cần move (key thuộc về shard nào theo ring mới)
  3. Copy data sang shard mới
  4. Verify data consistency
  5. Update hash ring trong application
  6. Remove data khỏi shard cũ
  
  → Downtime hoặc cần blue/green deployment!
```

---

## Giám sát Distribution (Kiểm tra pgAdmin)

Sau khi insert data, connect pgAdmin đến từng shard để kiểm tra:

```
Shard 1 (port 5432):
  → url_table: 34 rows
  → url_ids bắt đầu bằng: abc, def, mno...

Shard 2 (port 5433):
  → url_table: 33 rows
  → url_ids bắt đầu bằng: xyz, pqr...

Shard 3 (port 5434):
  → url_table: 33 rows
  → url_ids bắt đầu bằng: ghi, jkl...

→ Mỗi shard chứa subset data, cộng lại = toàn bộ data
```

---

## Tóm tắt kiến trúc

```
┌─────────────────────────────────────────────────┐
│                   Client                         │
└───────────────────────┬─────────────────────────┘
                        │ HTTP Request
                        ▼
┌─────────────────────────────────────────────────┐
│              Node.js Application                 │
│                                                   │
│  1. hashUrl(url) → urlId (5 chars)               │
│  2. hashRing.get(urlId) → port ('5432/3/4')      │
│  3. clients[port].query(...)                      │
└────────┬──────────────┬──────────────┬───────────┘
         │              │              │
         ▼              ▼              ▼
    ┌─────────┐    ┌─────────┐   ┌─────────┐
    │ Shard 1 │    │ Shard 2 │   │ Shard 3 │
    │  :5432  │    │  :5433  │   │  :5434  │
    │PostgreSQL│   │PostgreSQL│  │PostgreSQL│
    └─────────┘    └─────────┘   └─────────┘
```

---

**Tiếp theo:** 03-pros-cons-va-khi-nao-dung-sharding.md →
