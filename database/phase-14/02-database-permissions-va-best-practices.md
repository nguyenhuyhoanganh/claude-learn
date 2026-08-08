# Bài 2: Database Permissions — lớp phòng thủ cuối cùng

Một lỗ hổng SQL injection nhỏ trong một endpoint tìm kiếm ít người dùng. Kẻ tấn công gửi:

```sql
'; DROP TABLE users; --
```

```text
   NẾU ứng dụng kết nối bằng tài khoản `postgres` (siêu người dùng):
     → bảng users BIẾN MẤT
     → và kẻ tấn công còn đọc được MỌI bảng, đổi được MỌI thứ

   NẾU ứng dụng kết nối bằng tài khoản CHỈ CÓ SELECT/INSERT/UPDATE
   trên đúng 6 bảng cần thiết:
     → ERROR: permission denied for table users
     → thiệt hại: KHÔNG
```

Cùng một lỗ hổng, hai kết cục hoàn toàn khác nhau. Phân quyền là **lớp phòng thủ cuối cùng** — nó không ngăn được lỗi trong code, nhưng nó giới hạn thiệt hại khi lỗi xảy ra.

Bài này về cách dựng lớp đó.

## Nguyên tắc đặc quyền tối thiểu

```text
   Mỗi tài khoản chỉ được cấp ĐÚNG những quyền nó CẦN,
   không hơn MỘT quyền nào.
```

Nghe hiển nhiên, nhưng thực tế phổ biến là ngược lại:

```text
   ĐIỀU HAY GẶP                       ĐIỀU NÊN CÓ
   ════════════                       ═══════════
   Một tài khoản `postgres`           app_read      → chỉ SELECT
   dùng cho MỌI THỨ:                  app_write     → SELECT/INSERT/UPDATE
     • ứng dụng web                   app_migrate   → DDL, chỉ khi triển khai
     • công cụ di trú                 analytics     → SELECT trên replica
     • báo cáo                        backup        → chỉ đọc, cho pg_dump
     • sao lưu
     • kỹ sư vào xem
```

---

## Mô hình phân quyền của PostgreSQL

### Vai trò, không phải người dùng

```text
   Trong PostgreSQL, USER và GROUP đều là ROLE (vai trò).
     • ROLE có LOGIN  → dùng như tài khoản đăng nhập
     • ROLE không LOGIN → dùng như nhóm quyền
     • ROLE kế thừa được từ ROLE khác
```

```sql
-- Vai trò NHÓM (không đăng nhập được)
CREATE ROLE app_read;
CREATE ROLE app_write;

-- Tài khoản ĐĂNG NHẬP, kế thừa từ nhóm
CREATE ROLE api_service LOGIN PASSWORD 'xxx' IN ROLE app_write;
CREATE ROLE report_tool LOGIN PASSWORD 'yyy' IN ROLE app_read;
```

Lợi ích của cách này: cấp quyền **một lần cho nhóm**, và mọi tài khoản trong nhóm nhận được. Thêm một dịch vụ mới chỉ cần một dòng.

### Cấp quyền theo lớp

```sql
-- 1. Kết nối vào database
GRANT CONNECT ON DATABASE mydb TO app_read, app_write;

-- 2. Nhìn thấy schema
GRANT USAGE ON SCHEMA public TO app_read, app_write;

-- 3. Quyền trên bảng
GRANT SELECT                        ON ALL TABLES IN SCHEMA public TO app_read;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_write;

-- 4. Quyền trên sequence (CẦN cho INSERT vào bảng có SERIAL)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_write;
```

Bước 4 rất hay bị quên, và triệu chứng của nó rất khó hiểu:

```text
ERROR:  permission denied for sequence orders_id_seq
```

Người ta cấp `INSERT` rồi ngạc nhiên vì vẫn không chèn được — vì `SERIAL` cần quyền `USAGE` trên sequence.

### Bảng tạo sau thì sao — quyền mặc định

```sql
-- Bảng TƯƠNG LAI cũng tự động được cấp quyền
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO app_read;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_write;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO app_write;
```

Không có phần này, mọi bảng tạo bởi migration mới sẽ **không cấp quyền cho ai** — và ứng dụng gãy ngay sau lần triển khai tiếp theo.

> **Lưu ý tinh vi:** `ALTER DEFAULT PRIVILEGES` chỉ áp dụng cho bảng tạo bởi **vai trò chạy lệnh đó**. Nếu migration chạy bằng vai trò `app_migrate` thì phải chạy `ALTER DEFAULT PRIVILEGES FOR ROLE app_migrate ...`.

### Chặn quyền mặc định của `PUBLIC`

Đây là lỗ hổng có sẵn mà ít người biết:

```sql
-- PostgreSQL cấp quyền CONNECT trên MỌI database cho PUBLIC theo mặc định
REVOKE CONNECT ON DATABASE mydb FROM PUBLIC;

-- Trước PG15, PUBLIC còn có quyền CREATE trên schema public
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Và quyền EXECUTE trên mọi hàm
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
```

Nghĩa là: mọi vai trò mới tạo ra, kể cả vai trò bạn định chỉ cho đọc một bảng, **theo mặc định vẫn kết nối được vào mọi database và tạo bảng được trong schema `public`** (trước PG15).

PostgreSQL 15 đã bỏ quyền `CREATE` mặc định của `PUBLIC` — một cải thiện an toàn quan trọng.

---

## Bốn vai trò nên có

```sql
-- ═══ 1. ỨNG DỤNG — quyền đọc/ghi thường ngày ═══
CREATE ROLE app_rw;
GRANT CONNECT ON DATABASE mydb TO app_rw;
GRANT USAGE ON SCHEMA public TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_rw;
-- KHÔNG có: CREATE, DROP, ALTER, TRUNCATE

-- ═══ 2. DI TRÚ — chỉ dùng khi triển khai ═══
CREATE ROLE app_migrate;
GRANT ALL ON SCHEMA public TO app_migrate;
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_migrate;
-- Mật khẩu này KHÔNG nằm trong cấu hình ứng dụng

-- ═══ 3. PHÂN TÍCH — chỉ đọc, trên replica ═══
CREATE ROLE analytics;
GRANT CONNECT ON DATABASE mydb TO analytics;
GRANT USAGE ON SCHEMA public TO analytics;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics;
ALTER ROLE analytics SET statement_timeout = '5min';       -- ← chặn truy vấn chạy mãi
ALTER ROLE analytics SET default_transaction_read_only = on;

-- ═══ 4. SAO LƯU ═══
CREATE ROLE backup_svc;
GRANT CONNECT ON DATABASE mydb TO backup_svc;
GRANT USAGE ON SCHEMA public TO backup_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_svc;
GRANT pg_read_all_data TO backup_svc;      -- PG14+, gọn hơn nhiều
```

Hai dòng `ALTER ROLE analytics SET ...` rất đáng giá: chúng đảm bảo một truy vấn phân tích viết ẩu không thể chạy mãi hay vô tình ghi dữ liệu.

Tương tự nên đặt cho vai trò ứng dụng:

```sql
ALTER ROLE app_rw SET statement_timeout = '30s';
ALTER ROLE app_rw SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE app_rw SET lock_timeout = '10s';
```

Ba dòng này chặn được ba loại sự cố phổ biến nhất: truy vấn treo mãi, transaction bị bỏ quên chặn `VACUUM`, và lệnh DDL kẹt hàng đợi khoá.

---

## Phân quyền theo cột và theo dòng

### Theo cột

```sql
-- Vai trò hỗ trợ khách hàng KHÔNG được xem số thẻ
GRANT SELECT (id, email, name, created_at) ON users TO support_role;
-- KHÔNG cấp cột card_number, ssn
```

```sql
-- Thử với vai trò đó
SELECT * FROM users;
```

```text
ERROR:  permission denied for column card_number of relation users
```

Chú ý: `SELECT *` bị từ chối hoàn toàn, không phải trả về cột rỗng. Ứng dụng phải liệt kê đúng cột được phép.

### Theo dòng — Row Level Security

Đây là tính năng mạnh nhất và ít được dùng nhất của PostgreSQL.

```sql
CREATE TABLE documents (
    id        BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    title     TEXT,
    body      TEXT
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Chính sách: chỉ thấy dòng của tenant hiện tại
CREATE POLICY tenant_isolation ON documents
    USING (tenant_id = current_setting('app.tenant_id')::BIGINT);

GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO app_rw;
```

```python
# Ứng dụng đặt tenant cho MỖI request
cur.execute("SET LOCAL app.tenant_id = %s", (tenant_id,))
cur.execute("SELECT * FROM documents")     # TỰ ĐỘNG chỉ thấy tenant đó
```

```text
   → Ngay cả khi một đoạn code QUÊN thêm `WHERE tenant_id = ?`,
     database VẪN không trả về dữ liệu của tenant khác.
   → Đây là lớp phòng thủ mà không thể quên được.
```

Bốn điều phải biết khi dùng RLS:

| Điều | Chi tiết |
|---|---|
| **Chủ bảng bỏ qua RLS** | Trừ khi `ALTER TABLE ... FORCE ROW LEVEL SECURITY` |
| **Superuser luôn bỏ qua** | Không có cách nào bắt superuser tuân theo |
| **`USING` vs `WITH CHECK`** | `USING` lọc khi **đọc**; `WITH CHECK` kiểm tra khi **ghi** |
| **Có chi phí hiệu năng** | Điều kiện chính sách được thêm vào **mọi** truy vấn |

Chính sách đầy đủ cho cả đọc lẫn ghi:

```sql
CREATE POLICY tenant_isolation ON documents
    USING      (tenant_id = current_setting('app.tenant_id')::BIGINT)   -- đọc
    WITH CHECK (tenant_id = current_setting('app.tenant_id')::BIGINT);  -- ghi
```

Không có `WITH CHECK`, một tenant vẫn có thể **chèn** dòng mang `tenant_id` của tenant khác.

> **Cảnh báo với PgBouncer transaction mode**: `SET LOCAL` là bắt buộc (không phải `SET`), vì kết nối được trả về pool sau mỗi transaction — xem [phase-8 bài 3](../phase-8/03-connection-pooling.md).

---

## Kiến trúc REST API và database

### Không bao giờ để client nói chuyện thẳng với database

```text
   ❌ TRÌNH DUYỆT ──────────────▶ DATABASE
      → chuỗi kết nối nằm trong mã JavaScript → ai cũng đọc được
      → không kiểm soát được truy vấn
      → không giới hạn tần suất

   ✔  TRÌNH DUYỆT ──HTTP──▶ API ──▶ DATABASE
      → bí mật nằm ở server
      → kiểm tra quyền, giới hạn tần suất, ghi nhật ký
```

### Bốn quy tắc cho tầng API

**Quy tắc 1 — Luôn dùng tham số hoá**

```python
# SAI — SQL injection
cur.execute(f"SELECT * FROM users WHERE email = '{email}'")

# ĐÚNG — driver tự thoát
cur.execute("SELECT * FROM users WHERE email = %s", (email,))
```

Điểm quan trọng: tham số hoá **không phải là "thoát ký tự"**. Câu lệnh và dữ liệu được gửi **riêng biệt** trong giao thức, nên dữ liệu không bao giờ được phân tích như mã.

Với tên bảng/cột động (không tham số hoá được), phải dùng danh sách trắng:

```python
COT_CHO_PHEP = {'created_at', 'name', 'total'}
if sap_xep_theo not in COT_CHO_PHEP:
    raise ValueError("Cột không hợp lệ")
cur.execute(f"SELECT * FROM orders ORDER BY {sap_xep_theo} LIMIT %s", (limit,))
```

**Quy tắc 2 — Luôn giới hạn kết quả**

```python
# SAI — người dùng gửi limit=999999999
cur.execute("SELECT * FROM events LIMIT %s", (request.args['limit'],))

# ĐÚNG — áp trần
limit = min(int(request.args.get('limit', 50)), 200)
cur.execute("SELECT * FROM events LIMIT %s", (limit,))
```

**Quy tắc 3 — Không bao giờ trả lỗi database ra ngoài**

```python
# SAI
except Exception as e:
    return {"error": str(e)}, 500
```

```json
{"error": "relation \"users\" does not exist ... LINE 1: SELECT card_number, ssn FROM users WHERE id = 5"}
```

Thông báo này tiết lộ tên bảng, tên cột, và cả câu SQL — món quà cho kẻ tấn công.

```python
# ĐÚNG
except Exception as e:
    log.exception("query failed", extra={"request_id": rid})
    return {"error": "Loi he thong", "request_id": rid}, 500
```

**Quy tắc 4 — Kiểm tra quyền ở tầng ứng dụng, KHÔNG chỉ dựa vào tham số**

```python
# SAI — người dùng đổi order_id thành của người khác
@app.route('/orders/<int:order_id>')
def get_order(order_id):
    return db.query("SELECT * FROM orders WHERE id = %s", (order_id,))

# ĐÚNG — ràng buộc theo người dùng đang đăng nhập
@app.route('/orders/<int:order_id>')
def get_order(order_id):
    return db.query("SELECT * FROM orders WHERE id = %s AND user_id = %s",
                    (order_id, current_user.id))
```

Lỗ hổng ở phiên bản sai gọi là **IDOR** (*Insecure Direct Object Reference*), và nó là một trong những lỗ hổng phổ biến nhất trong API thực tế.

---

## Ghi nhật ký kiểm toán

```sql
CREATE TABLE audit_log (
    id         BIGSERIAL PRIMARY KEY,
    bang       TEXT        NOT NULL,
    ban_ghi_id BIGINT,
    hanh_dong  TEXT        NOT NULL,
    du_lieu_cu JSONB,
    du_lieu_moi JSONB,
    nguoi_dung TEXT        NOT NULL DEFAULT current_user,
    thoi_diem  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION ghi_audit() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_log (bang, ban_ghi_id, hanh_dong, du_lieu_cu, du_lieu_moi)
    VALUES (TG_TABLE_NAME,
            COALESCE(NEW.id, OLD.id),
            TG_OP,
            CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
            CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_users
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION ghi_audit();
```

Bốn điều cần biết trước khi bật:

| Điều | Chi tiết |
|---|---|
| **Chi phí** | Mỗi thao tác ghi thành **hai** thao tác → chậm khoảng 2 lần |
| **Dung lượng** | Bảng audit thường lớn hơn bảng gốc → **phân mảnh theo tháng** |
| **Dữ liệu nhạy cảm** | `to_jsonb(NEW)` chép **cả mật khẩu băm và số thẻ** vào audit |
| **Ai xoá được** | Nếu ứng dụng xoá được audit thì audit vô nghĩa |

Xử lý ba vấn đề sau:

```sql
-- Loại cột nhạy cảm
to_jsonb(NEW) - 'password_hash' - 'card_number'

-- Phân mảnh theo tháng
CREATE TABLE audit_log (...) PARTITION BY RANGE (thoi_diem);

-- Ứng dụng KHÔNG được xoá audit
REVOKE DELETE, UPDATE, TRUNCATE ON audit_log FROM app_rw;
GRANT INSERT ON audit_log TO app_rw;
```

Ngoài trigger, PostgreSQL còn có extension **`pgaudit`** ghi ở tầng câu lệnh — nhẹ hơn và khó bỏ qua hơn, nhưng không lưu được giá trị cũ/mới.

---

## Rà soát quyền

```sql
-- Ai có quyền gì trên bảng nào
SELECT grantee, table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type)
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee <> 'postgres'
GROUP BY grantee, table_name
ORDER BY grantee, table_name;
```

```sql
-- Vai trò nào là SIÊU NGƯỜI DÙNG  ← kiểm tra định kỳ
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolcanlogin
FROM pg_roles
WHERE rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls
ORDER BY rolname;
```

```sql
-- Bảng nào CHƯA bật RLS trong hệ nhiều khách hàng
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
```

```sql
-- Tài khoản lâu ngày không dùng
SELECT usename, valuntil FROM pg_user
WHERE usename NOT IN (SELECT DISTINCT usename FROM pg_stat_activity WHERE usename IS NOT NULL);
```

Bốn câu này nên chạy định kỳ. Câu thứ hai đặc biệt quan trọng: **số lượng vai trò có `rolsuper` phải rất nhỏ và phải giải thích được từng cái**.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Ứng dụng dùng tài khoản superuser | Một lỗ hổng SQL injection = mất toàn bộ database | Vai trò riêng, chỉ quyền cần thiết |
| Quên `ALTER DEFAULT PRIVILEGES` | Bảng mới từ migration không cấp quyền cho ai → ứng dụng gãy sau khi triển khai | Đặt quyền mặc định ngay khi tạo vai trò |
| Quên `GRANT USAGE ON SEQUENCES` | `INSERT` báo `permission denied for sequence` khó hiểu | Cấp cùng lúc với quyền bảng |
| Không thu hồi quyền của `PUBLIC` | Mọi vai trò mới đều kết nối được và (trước PG15) tạo bảng được | `REVOKE ... FROM PUBLIC` |
| RLS không có `WITH CHECK` | Tenant chèn được dòng mang `tenant_id` của tenant khác | Luôn khai cả `USING` và `WITH CHECK` |
| Chủ bảng bỏ qua RLS | Chính sách không có tác dụng với vai trò sở hữu bảng | `FORCE ROW LEVEL SECURITY` |
| Trả lỗi database ra client | Lộ tên bảng, tên cột, câu SQL | Trả mã lỗi chung + `request_id` |
| Nối chuỗi cho tên bảng/cột động | SQL injection qua đường không ngờ tới | Danh sách trắng |
| Không ràng buộc `user_id` khi truy vấn theo id | IDOR — xem được dữ liệu người khác | Luôn thêm `AND user_id = :current_user` |
| Ứng dụng xoá được bảng audit | Audit trở nên vô nghĩa | `REVOKE DELETE, UPDATE, TRUNCATE ON audit_log` |
| Audit chép cả cột nhạy cảm | Nhân bản dữ liệu nhạy cảm sang bảng ít được bảo vệ hơn | `to_jsonb(NEW) - 'password_hash'` |

## Tóm tắt bài 2

- Phân quyền là **lớp phòng thủ cuối cùng**: nó không ngăn được lỗ hổng trong code, nhưng nó quyết định lỗ hổng đó gây thiệt hại bao nhiêu.
- Trong PostgreSQL, **`USER` và `GROUP` đều là `ROLE`** — cấp quyền cho vai trò nhóm rồi cho tài khoản kế thừa.
- Hai bước hay bị quên nhất: **`GRANT USAGE ON SEQUENCES`** (thiếu nó thì `INSERT` lỗi khó hiểu) và **`ALTER DEFAULT PRIVILEGES`** (thiếu nó thì bảng mới từ migration không cấp quyền cho ai).
- Cần **`REVOKE` quyền mặc định của `PUBLIC`** — mọi vai trò mới theo mặc định vẫn kết nối được vào database, và trước PG15 còn tạo bảng được trong `public`.
- Bốn vai trò nên có: **`app_rw`** · **`app_migrate`** (mật khẩu không nằm trong cấu hình ứng dụng) · **`analytics`** (chỉ đọc, có `statement_timeout`) · **`backup_svc`**.
- Đặt `statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout` **theo vai trò** chặn được ba loại sự cố phổ biến nhất.
- **Row Level Security** là lớp cách ly tenant **không thể quên** — nhưng phải khai cả `WITH CHECK` (nếu không tenant vẫn chèn chéo được) và `FORCE ROW LEVEL SECURITY` (nếu không chủ bảng bỏ qua nó).
- Bốn quy tắc cho API: **tham số hoá** (danh sách trắng cho tên cột động) · **áp trần `LIMIT`** · **không trả lỗi database ra ngoài** · **luôn ràng buộc theo người dùng đang đăng nhập** để chống IDOR.
- Bảng audit phải: loại cột nhạy cảm, phân mảnh theo tháng, và **ứng dụng không được `DELETE`/`UPDATE` nó**.

**Bài kế tiếp** → [Phase 15 — Bài 1: Homomorphic Encryption](../phase-15/01-homomorphic-encryption.md)
