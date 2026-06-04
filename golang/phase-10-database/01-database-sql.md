# Bài 1: Database SQL với database/sql + sqlx + pgx

Go có chủ trương khá strong về DB: **viết SQL trực tiếp, không ORM dày**. Stdlib `database/sql` cung cấp interface chung, driver cụ thể implement. Sau bài này bạn nắm: connect, query, exec, transaction, prepared statement, connection pool, pattern tránh SQL injection. Bài hai sẽ touch ORM (GORM, sqlc).

## Cài driver

```bash
# PostgreSQL (pgx — production tier)
go get github.com/jackc/pgx/v5
go get github.com/jackc/pgx/v5/stdlib

# MySQL
go get github.com/go-sql-driver/mysql

# SQLite (modernc.org — no CGo)
go get modernc.org/sqlite

# Helper: sqlx (sugar trên database/sql)
go get github.com/jmoiron/sqlx
```

## Connect

```go
import (
    "database/sql"
    _ "github.com/jackc/pgx/v5/stdlib"   // driver register
)

dsn := "postgres://user:pass@localhost:5432/mydb?sslmode=disable"
db, err := sql.Open("pgx", dsn)
if err != nil {
    log.Fatal(err)
}
defer db.Close()

// Test connection
if err := db.Ping(); err != nil {
    log.Fatal(err)
}
```

**Quan trọng**:
- `sql.Open` **không** thực sự connect — lazy. `Ping()` để verify.
- `*sql.DB` là **connection pool**, không phải 1 connection. Share cross goroutine OK.
- 1 application = 1 `*sql.DB`, không tạo nhiều.

## Connection pool config

```go
db.SetMaxOpenConns(25)       // max connection mở
db.SetMaxIdleConns(5)        // max idle
db.SetConnMaxLifetime(5 * time.Minute)
db.SetConnMaxIdleTime(1 * time.Minute)
```

Tune theo:
- DB max_connections.
- Latency operation.
- Number of app instances.

Default chưa tối ưu — production phải set.

## Query — Đọc nhiều row

```go
rows, err := db.Query("SELECT id, name FROM users WHERE active = $1", true)
if err != nil { return err }
defer rows.Close()       // BẮT BUỘC

for rows.Next() {
    var id int
    var name string
    if err := rows.Scan(&id, &name); err != nil { return err }
    fmt.Println(id, name)
}
if err := rows.Err(); err != nil { return err }
```

**Cảnh báo**:
- `rows.Close()` **bắt buộc** — không close = connection leak.
- `rows.Err()` check error sau loop.
- Scan field theo thứ tự SELECT.
- `$1, $2` placeholder PostgreSQL. MySQL dùng `?`.

## QueryRow — 1 row

```go
var name string
err := db.QueryRow("SELECT name FROM users WHERE id = $1", 42).Scan(&name)
if err == sql.ErrNoRows {
    return nil, fmt.Errorf("user 42 not found")
}
if err != nil { return nil, err }
```

`QueryRow` không cần `Close`. `Scan` trả `sql.ErrNoRows` nếu không match.

## Exec — Insert/Update/Delete

```go
result, err := db.Exec(
    "INSERT INTO users (name, email) VALUES ($1, $2)",
    "Alice", "alice@x.com")
if err != nil { return err }

id, _ := result.LastInsertId()       // MySQL — Postgres dùng RETURNING
n, _ := result.RowsAffected()
```

PostgreSQL pattern lấy ID:
```go
var id int
err := db.QueryRow(
    "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id",
    "Alice", "alice@x.com").Scan(&id)
```

## **CỰC KỲ QUAN TRỌNG**: SQL Injection prevention

```go
// SAI — SQL injection!
name := r.URL.Query().Get("name")
db.Query("SELECT * FROM users WHERE name = '" + name + "'")
// User truyền: name=Alice'; DROP TABLE users; --
// → DELETE TABLE!

// ĐÚNG — parameterized query
db.Query("SELECT * FROM users WHERE name = $1", name)
// Driver escape an toàn
```

**Quy tắc**: **luôn** dùng placeholder. Không concat string vào query.

## Prepared statement

```go
stmt, err := db.Prepare("SELECT name FROM users WHERE id = $1")
if err != nil { return err }
defer stmt.Close()

for _, id := range ids {
    var name string
    stmt.QueryRow(id).Scan(&name)
    fmt.Println(id, name)
}
```

Prepared statement:
- Server compile 1 lần, exec nhiều lần.
- Faster cho hot query.
- Tự escape (SQL injection safe).

## Transaction

```go
tx, err := db.Begin()
if err != nil { return err }
defer tx.Rollback()    // safe nếu chưa commit

if _, err := tx.Exec("INSERT INTO orders ..."); err != nil {
    return err
}
if _, err := tx.Exec("UPDATE inventory ..."); err != nil {
    return err
}

return tx.Commit()
```

Pattern:
- `defer tx.Rollback()` ngay sau Begin.
- Khi error → return → Rollback chạy.
- Khi success → `Commit()` (Rollback sau Commit = no-op, OK).

## Context-aware operation

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

rows, err := db.QueryContext(ctx, "SELECT ...")
result, err := db.ExecContext(ctx, "INSERT ...")
tx, err := db.BeginTx(ctx, nil)
```

Mọi method có `Context` variant. Production phải dùng:
- HTTP request cancel → DB query cancel.
- Timeout per operation.
- Tracing/observability.

## Scan vào struct với sqlx

Stdlib scan từng field manual → verbose. `sqlx` magic:

```go
import "github.com/jmoiron/sqlx"

type User struct {
    ID    int    `db:"id"`
    Name  string `db:"name"`
    Email string `db:"email"`
}

db, _ := sqlx.Open("pgx", dsn)

// Get 1 row
var u User
db.Get(&u, "SELECT id, name, email FROM users WHERE id = $1", 42)

// Select nhiều row
var users []User
db.Select(&users, "SELECT id, name, email FROM users WHERE active = true")
```

`sqlx`:
- Map struct field qua `db:"..."` tag.
- API gọn hơn nhiều.
- Compatible với database/sql interface.

→ Production thường dùng sqlx hoặc sqlc/jet.

## Null value

SQL có NULL, Go zero value không phân biệt được:
```go
var name string
err := db.QueryRow("SELECT name FROM users WHERE id=$1", id).Scan(&name)
// Nếu name NULL → ERROR
```

Fix: dùng `sql.NullString`, `sql.NullInt64`, ...
```go
var name sql.NullString
db.QueryRow(...).Scan(&name)

if name.Valid {
    fmt.Println(name.String)
} else {
    fmt.Println("NULL")
}
```

Hoặc pointer:
```go
var name *string
db.QueryRow(...).Scan(&name)
if name != nil {
    fmt.Println(*name)
}
```

## Migration

Stdlib không có. Lib phổ biến:
- `golang-migrate/migrate` — CLI + lib.
- `pressly/goose` — Go embedded migration.
- `pop/soda` (Buffalo).

```bash
# golang-migrate
migrate create -ext sql -dir migrations -seq create_users_table
migrate -database postgres://... -path migrations up
```

## Pattern: Repository

```go
type UserRepo struct {
    db *sqlx.DB
}

func NewUserRepo(db *sqlx.DB) *UserRepo {
    return &UserRepo{db: db}
}

func (r *UserRepo) GetByID(ctx context.Context, id int) (*User, error) {
    var u User
    err := r.db.GetContext(ctx, &u,
        "SELECT id, name, email FROM users WHERE id = $1", id)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, ErrNotFound
    }
    return &u, err
}

func (r *UserRepo) Create(ctx context.Context, u *User) error {
    return r.db.QueryRowContext(ctx,
        "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id",
        u.Name, u.Email).Scan(&u.ID)
}

func (r *UserRepo) Update(ctx context.Context, u *User) error {
    _, err := r.db.ExecContext(ctx,
        "UPDATE users SET name=$1, email=$2 WHERE id=$3",
        u.Name, u.Email, u.ID)
    return err
}

func (r *UserRepo) Delete(ctx context.Context, id int) error {
    _, err := r.db.ExecContext(ctx,
        "DELETE FROM users WHERE id=$1", id)
    return err
}
```

→ Pattern repository — separate business logic và DB.

## Pattern: Bulk insert

```go
// SAI — n query (slow)
for _, u := range users {
    db.Exec("INSERT INTO users (name) VALUES ($1)", u.Name)
}

// ĐÚNG — multi-value insert
query := "INSERT INTO users (name) VALUES "
values := []any{}
placeholders := []string{}
for i, u := range users {
    placeholders = append(placeholders, fmt.Sprintf("($%d)", i+1))
    values = append(values, u.Name)
}
query += strings.Join(placeholders, ",")
db.Exec(query, values...)
```

Hoặc PostgreSQL `COPY`:
```go
import "github.com/jackc/pgx/v5"
pgxConn := getRawPgxConn(db)
pgxConn.CopyFrom(ctx, ...)   // bulk
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên `rows.Close()` | Connection leak | `defer rows.Close()` |
| Concat SQL với input | SQL injection | Placeholder |
| Quên check `rows.Err()` | Miss error | `if err := rows.Err()` |
| Mở nhiều `*sql.DB` | Waste pool | 1 DB per app |
| Default pool config | Connection exhausted | Tune SetMax* |
| Quên `defer tx.Rollback()` | Lock leak | Pattern Begin → defer Rollback |
| Scan NULL vào primitive | Error | Dùng `sql.Null*` |
| Long-running query không context | Hang | `*Context` variant |
| N+1 query loop | Slow | Bulk hoặc JOIN |
| ORM mặc định cho DB Go | Slow, magic | sqlx hoặc raw SQL |

## Quick reference

```go
// Connect
db, _ := sql.Open(driver, dsn)
db.Ping()
db.SetMaxOpenConns(25)

// Query
rows, _ := db.Query(sql, args...)
defer rows.Close()
for rows.Next() { rows.Scan(&v1, &v2) }
rows.Err()

// Single row
db.QueryRow(sql, args...).Scan(&v)
// sql.ErrNoRows nếu không match

// Exec
res, _ := db.Exec(sql, args...)
res.LastInsertId(); res.RowsAffected()

// Transaction
tx, _ := db.Begin()
defer tx.Rollback()
tx.Exec(...); tx.QueryRow(...); tx.Commit()

// Context
db.QueryContext(ctx, sql, args...)
db.BeginTx(ctx, nil)

// Prepared
stmt, _ := db.Prepare(sql); defer stmt.Close()
stmt.Query(args...)

// sqlx
db, _ := sqlx.Open(...)
db.Get(&v, sql, args...)         // 1 row → struct
db.Select(&vs, sql, args...)     // nhiều row → []struct

// Null
sql.NullString{String, Valid}
sql.NullInt64
sql.NullTime
```

## Tóm tắt bài 1

- `*sql.DB` = pool, share cross goroutine. 1 per app.
- Driver register qua `_` import.
- Pool config: `SetMaxOpenConns`, `SetMaxIdleConns`, `SetConnMaxLifetime`.
- **Luôn** dùng placeholder, không concat — chống SQL injection.
- `rows.Close()` + `rows.Err()` bắt buộc.
- Transaction: `Begin` → `defer Rollback` → operations → `Commit`.
- `*Context` variant cho cancel/timeout.
- `sqlx` cho map struct gọn.
- NULL → `sql.Null*` hoặc pointer.
- Repository pattern tách business + DB.

**Bài kế tiếp** → [Phase 11 - Bài 1: net/http — Web server từ scratch](../phase-11-web/01-net-http.md)
