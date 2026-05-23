# Bài 3: Logstash + JDBC — Import từ MySQL

Pattern phổ biến: data ở RDBMS (MySQL/PostgreSQL/...), mirror sang ES để search/analytics. Logstash JDBC plugin làm điều này.

## Use case

```text
MySQL "users" table
└── 10 triệu records
    │
    │ Logstash JDBC pull
    ▼
ES "users" index
└── Search bằng name, email, location
└── Aggregation, dashboard
```

→ MySQL = source of truth (OLTP). ES = search layer (read-optimized).

## Cài JDBC driver

Logstash JDBC plugin có sẵn. Nhưng cần download **MySQL JDBC driver** riêng:

```bash
# Download
wget https://dev.mysql.com/get/Downloads/Connector-J/mysql-connector-java-8.0.33.jar

# Move to Logstash
sudo mv mysql-connector-java-8.0.33.jar /usr/share/logstash/logstash-core/lib/jars/
```

→ JDBC plugin tìm driver trong path đó.

(PostgreSQL có `postgresql-42.7.x.jar` tại <https://jdbc.postgresql.org>.)

## Pipeline JDBC cơ bản

`mysql-import.conf`:

```text
input {
    jdbc {
        jdbc_driver_library => ""        ← Để trống vì driver trong lib path
        jdbc_driver_class => "com.mysql.cj.jdbc.Driver"
        jdbc_connection_string => "jdbc:mysql://localhost:3306/myapp"
        jdbc_user => "root"
        jdbc_password => "secret"
        
        statement => "SELECT id, name, email, created_at FROM users"
        
        schedule => "*/5 * * * *"        ← Cron: chạy mỗi 5 phút
    }
}

filter {
    mutate {
        remove_field => ["@version", "@timestamp", "host"]
    }
}

output {
    elasticsearch {
        hosts => ["http://localhost:9200"]
        index => "users"
        document_id => "%{id}"            ← _id = users.id
    }
}
```

Giải nghĩa:

- **`jdbc_connection_string`** — JDBC URL chuẩn.
- **`statement`** — SQL query Logstash chạy mỗi lần schedule.
- **`schedule`** — cron syntax. Mỗi 5 phút query lại.
- **`document_id => "%{id}"`** — dùng PK MySQL làm `_id` ES → idempotent (re-run không tạo duplicate).

Run:

```bash
logstash -f mysql-import.conf
```

→ Mỗi 5 phút query toàn bảng → bulk upsert ES.

## Incremental import — chỉ pull data mới

Query full table mỗi 5 phút = tốn DB. Tốt hơn: pull chỉ record mới/updated.

### Pattern 1: dùng timestamp

Table có `updated_at`:

```text
input {
    jdbc {
        statement => "
            SELECT id, name, email, updated_at
            FROM users
            WHERE updated_at > :sql_last_value
            ORDER BY updated_at ASC
        "
        
        use_column_value => true
        tracking_column => "updated_at"
        tracking_column_type => "timestamp"
        last_run_metadata_path => "/var/lib/logstash/last_run_users.yml"
        
        schedule => "*/5 * * * *"
    }
}
```

- **`:sql_last_value`** — Logstash variable, lưu giá trị `updated_at` max của lần run trước.
- **`use_column_value: true`** — track theo column thay vì `@timestamp`.
- **`tracking_column`** — column nào track.
- **`last_run_metadata_path`** — file lưu state giữa runs.

→ Lần 1: `sql_last_value` = '1970-01-01' (default). Pull tất cả.
→ Lần 2: pull chỉ records `updated_at > '<max last run>'`.

### Pattern 2: dùng auto-increment ID

Table append-only (vd `events`):

```text
statement => "SELECT id, type, payload FROM events WHERE id > :sql_last_value ORDER BY id ASC"
use_column_value => true
tracking_column => "id"
tracking_column_type => "numeric"
```

→ Pull events mới (id lớn hơn last run).

## Pagination cho table lớn

Table 10M row → query 1 lần = OOM Logstash JVM. Dùng pagination:

```text
statement => "SELECT id, name FROM users WHERE id > :sql_last_value"
jdbc_paging_enabled => true
jdbc_page_size => 10000             ← Batch 10k row mỗi page
```

→ Logstash query 10k → process → query 10k tiếp.

## Join table

```text
statement => "
    SELECT
        u.id AS user_id,
        u.name,
        u.email,
        c.name AS country_name
    FROM users u
    LEFT JOIN countries c ON u.country_id = c.id
"
```

→ Result row thành document với fields `user_id`, `name`, `email`, `country_name`. ES không có concept "join" — denormalize ở SQL.

## Multiple JDBC inputs

Pull nhiều tables:

```text
input {
    jdbc {
        statement => "SELECT * FROM users"
        type => "user"
        ...
    }
    jdbc {
        statement => "SELECT * FROM products"
        type => "product"
        ...
    }
}

output {
    if [type] == "user" {
        elasticsearch { index => "users" ... }
    } else if [type] == "product" {
        elasticsearch { index => "products" ... }
    }
}
```

## Pitfall

### Pitfall 1: full table pull mỗi run

Bảng 100M row, schedule 5 phút → DB chết. **Bắt buộc incremental**.

### Pitfall 2: schema mismatch

MySQL `updated_at` (DATETIME) → ES auto detect... thường OK nhưng đôi khi timezone bug. Define mapping explicit:

```text
PUT /users
{
    "mappings": {
        "properties": {
            "id":         { "type": "integer" },
            "name":       { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
            "email":      { "type": "keyword" },
            "updated_at": { "type": "date" }
        }
    }
}
```

### Pitfall 3: deleted row không sync

JDBC chỉ pull NEW/UPDATED. Row deleted trong MySQL không tự xoá ES.

→ Fix: soft delete (column `deleted_at`), Logstash check, xoá ES bằng filter logic.

→ Hoặc: dùng **CDC** (Change Data Capture) tool như Debezium → Kafka → Logstash → ES. Phức tạp hơn nhưng đầy đủ events INSERT/UPDATE/DELETE.

### Pitfall 4: time zone

MySQL DATETIME không có timezone. Logstash assume server timezone → có thể lệch. Set explicit:

```text
jdbc_connection_string => "jdbc:mysql://localhost:3306/myapp?serverTimezone=UTC"
```

## Alternative: CDC pattern (production)

Cho real-time sync + delete handling:

```text
MySQL binlog ──► Debezium ──► Kafka ──► Logstash Kafka input ──► ES
                            (INSERT/UPDATE/DELETE events)
```

→ Stream tất cả change real-time. Setup phức tạp nhưng best-in-class.

## Tóm tắt

- Logstash **JDBC plugin** pull SQL → push ES.
- Cần JDBC driver `.jar` trong Logstash lib path.
- `statement` = SQL, `schedule` = cron.
- `document_id => "%{id}"` cho idempotent (upsert by PK).
- **Incremental** với `:sql_last_value` + `tracking_column` — tránh full pull.
- Table lớn dùng `jdbc_paging_enabled` batch.
- **JDBC không catch DELETE** — dùng soft-delete hoặc CDC tool (Debezium).

---

→ [Bài tiếp theo: FileBeat cho log shipping](04-filebeat-cho-logs.md)
