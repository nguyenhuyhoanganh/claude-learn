# Bài 2: Database Permissions và Best Practices cho REST API

## Nguyên tắc: Principle of Least Privilege

```
Vấn đề phổ biến:
  Web application kết nối database bằng user có FULL quyền
  (hoặc thậm chí là "postgres" / "root" / "sa")

  → SQL injection thành công = attacker có FULL quyền:
    DROP TABLE users;
    DELETE FROM orders;
    SELECT * FROM credit_cards;
  
Nguyên tắc đúng:
  Mỗi route/component chỉ có quyền TỐI THIỂU cần thiết
  → Route đọc dữ liệu: Chỉ SELECT
  → Route tạo mới: Chỉ INSERT
  → Route xóa: Chỉ DELETE + SELECT (để tìm record)
  → Schema migration: User riêng với đủ quyền DDL
```

---

## Phân tách Users: Schema Owner vs App User

```
Thiết kế 2-tier user:

┌──────────────────────────────────────────────────┐
│  schema_owner (chỉ dùng cho migrations)          │
│  → CREATE TABLE, ALTER TABLE, DROP TABLE         │
│  → Không bao giờ dùng cho application requests   │
└──────────────────────────────────────────────────┘
                     ↕ Tạo objects

┌──────────────────────────────────────────────────┐
│  app_read_user  → SELECT chỉ                     │
│  app_write_user → INSERT, UPDATE                 │
│  app_delete_user → DELETE + SELECT               │
└──────────────────────────────────────────────────┘
          ↕ Chỉ DML, KHÔNG DDL
  
┌──────────────────────────────────────────────────┐
│  Ứng dụng web (chạy dưới identity của app users) │
└──────────────────────────────────────────────────┘
```

---

## Demo: Tạo Users với Permissions cụ thể (PostgreSQL)

### Tạo database users

```sql
-- Tạo read-only user
CREATE USER app_read_user WITH PASSWORD 'strong_random_password_1';

-- Tạo insert-only user  
CREATE USER app_insert_user WITH PASSWORD 'strong_random_password_2';

-- Tạo delete user
CREATE USER app_delete_user WITH PASSWORD 'strong_random_password_3';

-- Tạo schema owner (cho migrations)
CREATE USER schema_owner WITH PASSWORD 'strong_random_password_4';
```

### Gán permissions cho table

```sql
-- Cấp SELECT cho read user
GRANT SELECT ON TABLE todos TO app_read_user;

-- Cấp INSERT cho insert user
GRANT INSERT ON TABLE todos TO app_insert_user;

-- Cấp SELECT + DELETE cho delete user (cần SELECT để tìm record)
GRANT SELECT, DELETE ON TABLE todos TO app_delete_user;

-- Cấp quyền sử dụng sequence (cần cho AUTO_INCREMENT columns)
GRANT USAGE, SELECT ON SEQUENCE todos_id_seq TO app_insert_user;
-- Chú ý: USAGE khác SELECT cho sequences!
```

```
Tại sao cần USAGE cho sequence?
  INSERT INTO todos (text) VALUES ('new todo')
  → Postgres tự động gọi nextval('todos_id_seq')
  → Nếu user không có USAGE permission → Permission denied!
  
  USAGE = Cho phép dùng sequence để generate next value
  SELECT = Cho phép đọc current value của sequence
  
  Thường cần cả hai cho INSERT operations.
```

### Node.js: Tạo Pool riêng cho mỗi route

```javascript
const { Pool } = require('pg');

// Mỗi user có connection pool riêng
const readPool = new Pool({
    host: process.env.DB_HOST,
    port: 5432,
    database: process.env.DB_NAME,
    user: 'app_read_user',
    password: process.env.READ_USER_PASSWORD,
    max: 10,          // Max 10 connections (nhiều nhất vì reads > writes)
    ssl: { mode: 'require' }
});

const insertPool = new Pool({
    host: process.env.DB_HOST,
    port: 5432,
    database: process.env.DB_NAME,
    user: 'app_insert_user',
    password: process.env.INSERT_USER_PASSWORD,
    max: 5,
    ssl: { mode: 'require' }
});

const deletePool = new Pool({
    host: process.env.DB_HOST,
    port: 5432,
    database: process.env.DB_NAME,
    user: 'app_delete_user',
    password: process.env.DELETE_USER_PASSWORD,
    max: 3,           // Ít nhất vì deletes ít hơn
    ssl: { mode: 'require' }
});

// Routes dùng đúng pool
app.get('/todos', async (req, res) => {
    // Chỉ SELECT → readPool
    const result = await readPool.query(
        'SELECT id, text FROM todos LIMIT 50'
        //                         ↑ LUÔN có LIMIT!
    );
    res.json(result.rows);
});

app.post('/todos', async (req, res) => {
    // INSERT → insertPool
    const { text } = req.body;
    const result = await insertPool.query(
        'INSERT INTO todos (text) VALUES ($1) RETURNING id',
        [text]  // Parameterized! Tránh SQL injection
    );
    res.json({ id: result.rows[0].id });
});

app.delete('/todos/:id', async (req, res) => {
    // DELETE → deletePool
    const { id } = req.params;
    await deletePool.query(
        'DELETE FROM todos WHERE id = $1',
        [id]
    );
    res.sendStatus(204);
});
```

---

## SQL Injection Prevention

### Cách tấn công SQL Injection

```javascript
// Ứng dụng lỗi bảo mật:
app.get('/users', async (req, res) => {
    const name = req.query.name;
    
    // NGUY HIỂM! String concatenation:
    const result = await pool.query(
        `SELECT * FROM users WHERE name = '${name}'`
    );
    res.json(result.rows);
});
```

```
Attacker gửi request:
GET /users?name=' OR 1=1; DROP TABLE users; --

Query trở thành:
SELECT * FROM users WHERE name = '' OR 1=1; DROP TABLE users; --'

Kết quả:
  1. OR 1=1 → WHERE luôn true → Trả về TẤT CẢ users
  2. DROP TABLE users → XÓA toàn bộ bảng users!
  3. -- → Comment hết phần còn lại
```

### Parameterized Queries - Cách đúng

```javascript
// AN TOÀN: Parameterized query
app.get('/users', async (req, res) => {
    const name = req.query.name;
    
    const result = await pool.query(
        'SELECT * FROM users WHERE name = $1',
        [name]  // Database xử lý escape tự động
    );
    res.json(result.rows);
});
```

```
Cách parameterized query hoạt động:
  1. SQL string được compile trước (execution plan)
  2. Parameters được truyền riêng biệt (KHÔNG concat vào SQL)
  3. Database tự escape/sanitize parameters
  
  Input: "' OR 1=1; DROP TABLE users; --"
  → Được treat như literal string, không phải SQL!
  → WHERE name = "' OR 1=1; DROP TABLE users; --"
  → Không match user nào → Empty result (an toàn)
```

---

## Schema Migration Best Practices

### Không nên: Create table trong application startup

```javascript
// BAD: Application tự tạo table khi start
async function startApp() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    `);
    
    app.listen(3000);
}
```

```
Vấn đề:
  - App user cần quyền CREATE TABLE (DDL)
  - Nếu app user có CREATE quyền, cũng có thể DROP!
  - SQL injection với app user → Attacker có thể DROP table
  - Race condition nếu multiple instances start cùng lúc
```

### Nên: Migration scripts riêng biệt

```javascript
// GOOD: Migrations chạy riêng, TRƯỚC khi app start
// migrations/001_create_users.js
const { Pool } = require('pg');

const migrationPool = new Pool({
    user: 'schema_owner',  // User có DDL quyền
    password: process.env.SCHEMA_OWNER_PASSWORD,
    // ...
});

async function migrate() {
    await migrationPool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    
    // Track migration trong bảng riêng
    await migrationPool.query(`
        INSERT INTO schema_migrations (version, applied_at)
        VALUES ('001_create_users', NOW())
        ON CONFLICT DO NOTHING
    `);
    
    console.log('Migration 001 applied');
    await migrationPool.end();
}

migrate();
```

```bash
# CI/CD pipeline:
# 1. Run migrations (với schema_owner)
node migrations/run_all.js

# 2. Start application (với app users có limited permissions)
node server.js
```

---

## Error Handling: Không lộ thông tin nhạy cảm

```javascript
// BAD: Trả về lỗi database cho client
app.post('/login', async (req, res) => {
    try {
        const user = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [req.body.email]
        );
        // ...
    } catch (err) {
        // NGUY HIỂM! Lộ stack trace, file paths, query...
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

// GOOD: Log riêng, trả về lỗi generic
app.post('/login', async (req, res) => {
    try {
        const user = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [req.body.email]
        );
        // ...
    } catch (err) {
        // Log chi tiết ở server-side (cho debugging)
        console.error('Login error:', {
            email: req.body.email,
            error: err.message,
            // Không log password!
        });
        
        // Trả về generic error cho client
        res.status(500).json({ error: 'Internal server error' });
    }
});
```

```
Security quy tắc: Ambiguous errors
  ❌ "User not found"   → Lộ thông tin user có tồn tại không
  ❌ "Wrong password"   → Lộ thông tin user có tồn tại
  ✅ "Invalid credentials" → Không lộ thông tin gì
  
  (Tuy nhiên cần balance với UX - tùy context)
```

---

## Tổng hợp Security Checklist

```
Database Security Checklist:

Connection:
  ☐ TLS/SSL enabled (ssl = on trong postgresql.conf)
  ☐ TLS version tối thiểu 1.2
  ☐ Strong cipher suites
  ☐ Certificate từ trusted CA trong production
  ☐ Client SSL mode = require hoặc verify-full

Authentication:
  ☐ Không dùng default/admin user cho application
  ☐ Separate user cho mỗi role (read/write/delete)
  ☐ Mật khẩu mạnh, random, dài (32+ chars)
  ☐ Passwords trong environment variables, không trong code
  ☐ Passwords không commit vào git!

Permissions (Principle of Least Privilege):
  ☐ Read routes → SELECT only
  ☐ Create routes → INSERT only (+ USAGE on sequences)
  ☐ Update routes → UPDATE only
  ☐ Delete routes → DELETE + SELECT
  ☐ Schema migration → Separate user với DDL quyền
  ☐ Application user KHÔNG có DROP TABLE quyền

Code:
  ☐ Parameterized queries (KHÔNG string concat)
  ☐ LIMIT trên mọi SELECT queries
  ☐ Input validation trước khi query
  ☐ Error messages generic (không lộ DB internals)
  ☐ Không log sensitive data (passwords, tokens)

Network:
  ☐ Database không public-facing (chỉ accessible từ app servers)
  ☐ Firewall rules restrict DB port access
  ☐ VPC/private subnet cho database
```

---

**Tiếp theo:** Phase 15 - Homomorphic Encryption →
