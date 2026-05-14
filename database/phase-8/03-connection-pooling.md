# Bài 3: Database Connection Pooling

## Vấn đề: Mỗi Request mở Connection mới

```javascript
// ❌ Cách cũ - Mỗi request tạo connection mới
app.get('/users', async (req, res) => {
    const client = new Client({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'mydb'
    });
    
    await client.connect();   // ← TCP 3-way handshake + PostgreSQL auth
    const result = await client.query('SELECT * FROM users');
    await client.end();       // ← Teardown connection
    
    res.json(result.rows);
});
```

### Tại sao Đây Là Vấn Đề?

```
Mỗi lần connect phải:
  1. TCP 3-way handshake (SYN → SYN-ACK → ACK)
  2. TLS handshake (nếu dùng SSL)
  3. PostgreSQL authentication protocol
  4. Session setup (encoding, timezone, search_path...)
  
→ Cộng lại: 5-50ms overhead cho mỗi request!
→ Với database remote (cloud): 50-200ms overhead

Và mỗi lần disconnect:
  1. Graceful connection teardown
  2. Cleanup session state
  3. Release file descriptors
  
→ Thêm overhead nữa!
```

```
1000 requests/giây × 20ms overhead = 20 giây overhead/giây
→ Không thể scale!
```

---

## Connection Pooling là gì?

**Connection Pool** = Tập hợp các database connections đã được tạo sẵn, được tái sử dụng cho nhiều requests.

```
Không có Pool:
  Request 1 → [Connect] → Query → [Disconnect]
  Request 2 → [Connect] → Query → [Disconnect]
  Request 3 → [Connect] → Query → [Disconnect]
  
Có Pool:
  Khởi động server → Tạo sẵn 10 connections
  
  Request 1 → Lấy conn từ pool → Query → Trả lại pool
  Request 2 → Lấy conn từ pool → Query → Trả lại pool
  Request 3 → Lấy conn từ pool → Query → Trả lại pool
  
  → Không cần tạo/destroy connection mỗi lần!
```

---

## Triển khai Connection Pool trong Node.js

### Cấu hình Pool

```javascript
// ✅ Cách tốt - Connection Pool
const { Pool } = require('pg');

// Tạo pool một lần khi server khởi động
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'mydb',
    
    // Pool configuration
    max: 20,               // Tối đa 20 connections
    idleTimeoutMillis: 10000,  // Idle connection bị destroy sau 10s
    connectionTimeoutMillis: 5000,  // Timeout khi chờ conn từ pool: 5s
});
```

### Sử dụng Pool cho Simple Queries

```javascript
// Simple query: Không cần quản lý connection thủ công
app.get('/users', async (req, res) => {
    try {
        // pool.query tự động:
        // 1. Lấy connection từ pool
        // 2. Execute query
        // 3. Trả connection về pool
        const result = await pool.query('SELECT * FROM users LIMIT 10');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
```

### Sử dụng Pool cho Transactions

```javascript
// Transactions cần giữ cùng một connection!
app.post('/transfer', async (req, res) => {
    const { fromId, toId, amount } = req.body;
    
    // Lấy dedicated client từ pool
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Debit
        await client.query(
            'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
            [amount, fromId]
        );
        
        // Credit
        await client.query(
            'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
            [amount, toId]
        );
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        // QUAN TRỌNG: Phải release client về pool!
        client.release();
    }
});
```

---

## Tham số Pool Explained

### max - Số connections tối đa

```javascript
const pool = new Pool({ max: 20 });

// max = 20 nghĩa là:
// - Pool tạo sẵn tối đa 20 connections
// - Request thứ 21 phải CHỜ có connection available
// - Chờ quá connectionTimeoutMillis → Error

// Chọn max như thế nào?
// PostgreSQL default max_connections = 100
// Nếu có 5 app servers, mỗi server max=20 → 5×20=100 → Full!
// Khuyến nghị: max ≤ (postgres_max_connections / số app servers) * 0.8
```

### idleTimeoutMillis - Timeout cho idle connections

```javascript
const pool = new Pool({ idleTimeoutMillis: 10000 });

// Nếu connection không được dùng trong 10 giây → Destroy
// Tránh giữ connections không cần thiết
// 0 = Giữ mãi mãi (không destroy idle connections)
```

### connectionTimeoutMillis - Timeout chờ connection

```javascript
const pool = new Pool({ connectionTimeoutMillis: 5000 });

// Nếu tất cả connections đang bận và request phải chờ quá 5 giây:
// → Throw error: "timeout exceeded when trying to connect"
// 0 = Chờ vô hạn
```

---

## Benchmark: Pooling vs No Pooling

```javascript
// So sánh performance
const ITERATIONS = 1000;

// Test 1: Không pool
async function testNoPool() {
    const times = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const start = Date.now();
        const client = new Client(config);
        await client.connect();
        await client.query('SELECT * FROM employees');
        await client.end();
        times.push(Date.now() - start);
    }
    return average(times);
}

// Test 2: Có pool
async function testPool() {
    const pool = new Pool({ ...config, max: 20 });
    const times = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const start = Date.now();
        await pool.query('SELECT * FROM employees');
        times.push(Date.now() - start);
    }
    return average(times);
}
```

```
Kết quả thực tế (local database):
  Không Pool: ~40ms per request average
  Có Pool:    ~19ms per request average
  
  → Pool nhanh hơn ~50%!
  
Kết quả với remote database (cloud):
  Không Pool: ~150ms per request
  Có Pool:    ~15ms per request
  
  → Pool nhanh hơn ~10x!
  
Lý do: Network round-trips cho TCP/TLS handshake rất đắt!
```

---

## Connection Pool Architecture

```
┌────────────────────────────────────────────────────┐
│                  Application Server                  │
│                                                      │
│  Request 1 ──┐                                      │
│  Request 2 ──┤   ┌──────────────────────────────┐  │
│  Request 3 ──┼──→│       Connection Pool         │  │
│  Request 4 ──┤   │  ┌─────┐ ┌─────┐ ┌─────┐    │  │
│  ...         │   │  │Conn1│ │Conn2│ │Conn3│    │  │
│              │   │  │IDLE │ │BUSY │ │IDLE │    │  │
│              │   │  └──┬──┘ └──┬──┘ └──┬──┘    │  │
│              │   └─────┼───────┼───────┼────────┘  │
└─────────────────────────┼───────┼───────┼───────────┘
                          │       │       │
                          ▼       ▼       ▼
                     ┌────────────────────────┐
                     │    PostgreSQL Server    │
                     │   (max_connections=100) │
                     └────────────────────────┘
```

---

## Pool Events và Monitoring

```javascript
// Listen to pool events
pool.on('connect', (client) => {
    console.log('New connection established to database');
});

pool.on('acquire', (client) => {
    console.log('Client checked out from pool');
});

pool.on('remove', (client) => {
    console.log('Connection removed from pool');
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
});

// Pool stats
console.log('Total connections:', pool.totalCount);
console.log('Idle connections:', pool.idleCount);
console.log('Waiting requests:', pool.waitingCount);
```

---

## PgBouncer - External Connection Pooler

Ngoài pool ở application level, còn có **PgBouncer** - một proxy riêng biệt.

```
Không có PgBouncer:
  10 app servers × 20 connections = 200 connections tới PostgreSQL

Có PgBouncer:
  10 app servers → PgBouncer ← 20 connections → PostgreSQL
  
  → App servers: Nhiều connections tới PgBouncer (lightweight)
  → PgBouncer: Ít connections tới PostgreSQL (heavyweight)
  → PostgreSQL không bị quá tải!
```

```
Cài đặt PgBouncer (cơ bản):

# pgbouncer.ini
[databases]
mydb = host=localhost port=5432 dbname=mydb

[pgbouncer]
pool_mode = transaction    # Pool theo transaction (hiệu quả nhất)
max_client_conn = 1000     # 1000 app connections
default_pool_size = 20     # Nhưng chỉ 20 connections thật tới PG
listen_port = 6432
```

```
Pool modes của PgBouncer:
  session:     1 client = 1 PostgreSQL connection (trong cả session)
  transaction: 1 PostgreSQL connection chỉ được dùng trong 1 transaction
  statement:   1 PostgreSQL connection chỉ cho 1 statement (hạn chế nhất)
  
→ transaction mode: Phổ biến nhất, hiệu quả nhất cho web apps
```

---

## Tóm tắt Best Practices

```
✅ Luôn dùng Connection Pool trong production
✅ Đặt max phù hợp (không quá cao gây OOM PostgreSQL)
✅ Đặt connectionTimeoutMillis để tránh hang requests
✅ Luôn release() client trong finally block
✅ Dùng pool.query() cho stateless queries
✅ Dùng pool.connect() + client.release() cho transactions
✅ Monitor pool stats (totalCount, idleCount, waitingCount)
✅ Cân nhắc PgBouncer nếu có nhiều app servers

❌ Không tạo connection mới cho mỗi request
❌ Không đặt max quá cao (vượt postgres max_connections)
❌ Không quên release() sau transaction (connection leak!)
❌ Không dùng SELECT * không giới hạn
```

---

**Tiếp theo:** Phase 9 - Database Replication →
