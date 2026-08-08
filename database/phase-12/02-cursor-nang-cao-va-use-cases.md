# Bài 2: Cursor nâng cao — bốn mẫu thực chiến

[Bài 1](01-database-cursors.md) cho biết cursor là gì và cái giá của nó. Bài này là bốn tình huống thật, mỗi tình huống có một mẫu giải khác nhau — và cách chọn đúng mẫu.

```text
   MẪU 1 — Xuất dữ liệu lớn ra file
   MẪU 2 — Job ETL chạy nhiều giờ, có thể dừng và tiếp
   MẪU 3 — Cập nhật hàng loạt an toàn
   MẪU 4 — Truyền dữ liệu qua API dạng luồng
```

---

# Mẫu 1 — Xuất 500 triệu dòng ra file

## Cách sai

```python
cur.execute("SELECT * FROM events")
rows = cur.fetchall()                      # 200 GB vào RAM
with open('out.csv', 'w') as f:
    for r in rows:
        f.write(','.join(map(str, r)) + '\n')
```

## Cách đúng — `COPY`

```python
with open('/data/events.csv', 'w') as f:
    cur.copy_expert("""
        COPY (SELECT id, user_id, created_at, payload FROM events)
        TO STDOUT WITH (FORMAT csv, HEADER true)
    """, f)
```

```text
   500 triệu dòng:
     Cursor + ghi từng dòng :  ~94 phút
     COPY TO STDOUT         :  ~11 phút      → NHANH HƠN 8,5 LẦN
```

Vì sao nhanh hơn nhiều đến vậy:

```text
   CURSOR                              COPY
   ══════                              ════
   Mỗi dòng đi qua:                    Server tự định dạng CSV
     • đóng gói giao thức dòng-theo-dòng  và đẩy một LUỒNG BYTE
     • giải mã ở client
     • định dạng lại thành CSV          → không có bước đóng gói/giải mã
     • ghi ra file                      → không tạo đối tượng ở client
   → hàng trăm triệu đối tượng Python
```

## Nén ngay trong lúc xuất

```python
import gzip
with gzip.open('/data/events.csv.gz', 'wt') as f:
    cur.copy_expert("COPY (SELECT * FROM events) TO STDOUT WITH CSV", f)
```

```text
   CSV thường  : 187 GB
   CSV nén gzip:  22 GB     → NHỎ HƠN 8,5 LẦN
   Thời gian   : chậm hơn ~15% (CPU nén), nhưng tiết kiệm I/O nhiều hơn thế
```

## Xuất song song bằng cách chia khoảng

```python
from concurrent.futures import ThreadPoolExecutor

def xuat_mot_phan(phan, tong_so_phan):
    conn = psycopg2.connect(DSN)
    with open(f'/data/events_{phan}.csv', 'w') as f:
        conn.cursor().copy_expert(f"""
            COPY (SELECT * FROM events
                   WHERE id %% {tong_so_phan} = {phan})
            TO STDOUT WITH CSV
        """, f)
    conn.close()

with ThreadPoolExecutor(max_workers=8) as pool:
    pool.map(lambda p: xuat_mot_phan(p, 8), range(8))
```

```text
   1 luồng  : 11 phút
   8 luồng  :  2 phút      → NHANH HƠN 5,5 LẦN (không phải 8, do nghẽn I/O)
```

Chú ý: `id % 8 = p` khiến mỗi worker **quét toàn bảng** nhưng chỉ giữ 1/8. Nếu bảng có index trên `id`, chia theo **khoảng liên tục** sẽ tốt hơn nhiều:

```python
# Tốt hơn: mỗi worker quét một KHOẢNG liên tục, tận dụng index
"COPY (SELECT * FROM events WHERE id >= {lo} AND id < {hi}) TO STDOUT WITH CSV"
```

Và tốt nhất: nếu bảng đã **phân mảnh** ([phase-6](../phase-6/01-database-partitioning-la-gi.md)), xuất song song theo từng mảnh — mỗi worker đọc một bảng vật lý riêng.

---

# Mẫu 2 — Job ETL chạy nhiều giờ

Yêu cầu: xử lý 200 triệu dòng, mỗi dòng gọi một API bên ngoài (~50 ms). Tổng thời gian ước tính **nhiều ngày**.

## Vì sao cursor là lựa chọn SAI ở đây

```text
   Cursor giữ transaction mở SUỐT NHIỀU NGÀY:
     ✘ Chặn VACUUM trên TOÀN BỘ database → bảng phình không ngừng
     ✘ Kết nối đứt → MẤT SẠCH tiến độ, làm lại từ đầu
     ✘ Không dừng lại và chạy tiếp được
     ✘ idle_in_transaction_session_timeout sẽ giết nó
```

## Mẫu đúng — điểm dừng bền vững

```python
import psycopg2, time

DSN = "dbname=lab"
KICH_THUOC_LO = 5000

def lay_moc(conn):
    with conn.cursor() as c:
        c.execute("SELECT last_id FROM etl_progress WHERE job = 'sync_events'")
        r = c.fetchone()
        return r[0] if r else 0

def luu_moc(conn, moc):
    with conn.cursor() as c:
        c.execute("""INSERT INTO etl_progress (job, last_id, updated_at)
                     VALUES ('sync_events', %s, now())
                     ON CONFLICT (job) DO UPDATE
                        SET last_id = EXCLUDED.last_id, updated_at = now()""",
                  (moc,))

def chay():
    conn = psycopg2.connect(DSN)
    moc = lay_moc(conn)
    print(f"Tiếp tục từ id = {moc}")

    while True:
        with conn.cursor() as c:
            c.execute("""SELECT id, user_id, payload FROM events
                          WHERE id > %s ORDER BY id LIMIT %s""",
                      (moc, KICH_THUOC_LO))
            rows = c.fetchall()

        if not rows:
            break

        for r in rows:
            goi_api_ben_ngoai(r)          # ← 50 ms mỗi dòng

        moc = rows[-1][0]
        luu_moc(conn, moc)
        conn.commit()                     # ← TRANSACTION NGẮN, đóng lại ngay
        print(f"Đã xử lý tới id = {moc}")
```

Bảng theo dõi tiến độ:

```sql
CREATE TABLE etl_progress (
    job        TEXT PRIMARY KEY,
    last_id    BIGINT      NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Năm lợi ích so với cursor:

```text
   ✔ Transaction chỉ mở vài mili-giây mỗi lô → không chặn VACUUM
   ✔ Đứt kết nối → chạy lại, tiếp từ `moc` đã lưu
   ✔ Triển khai phiên bản mới giữa chừng → vẫn tiếp tục được
   ✔ Theo dõi tiến độ bằng một câu SELECT
   ✔ Chạy song song được bằng cách chia khoảng id
```

## Chạy song song nhiều worker

```python
def chay_worker(worker_id, tong_worker):
    moc = lay_moc_worker(conn, worker_id)
    while True:
        c.execute("""SELECT id, user_id, payload FROM events
                      WHERE id > %s AND id %% %s = %s
                      ORDER BY id LIMIT %s""",
                  (moc, tong_worker, worker_id, KICH_THUOC_LO))
        ...
```

Hoặc — cách tốt hơn — dùng **hàng đợi công việc trong database** với `SKIP LOCKED`:

```sql
CREATE TABLE etl_tasks (
    id        BIGSERIAL PRIMARY KEY,
    id_tu     BIGINT NOT NULL,
    id_den    BIGINT NOT NULL,
    status    TEXT   NOT NULL DEFAULT 'pending',
    worker_id TEXT,
    nhan_luc  TIMESTAMPTZ
);
CREATE INDEX idx_tasks_pending ON etl_tasks (id) WHERE status = 'pending';

-- Chia bảng thành các lô 100.000 dòng
INSERT INTO etl_tasks (id_tu, id_den)
SELECT i, i + 100000
FROM generate_series(0, (SELECT max(id) FROM events), 100000) AS i;
```

```sql
-- Mỗi worker nhận một lô — không ai chờ ai, không ai lấy trùng
WITH da_chon AS (
    SELECT id FROM etl_tasks
     WHERE status = 'pending'
     ORDER BY id LIMIT 1
     FOR UPDATE SKIP LOCKED
)
UPDATE etl_tasks t SET status = 'running', worker_id = :worker, nhan_luc = now()
  FROM da_chon WHERE t.id = da_chon.id
RETURNING t.id_tu, t.id_den;
```

Đây là kỹ thuật ở [phase-8 bài 1](../phase-8/01-shared-lock-va-exclusive-lock.md), áp cho ETL. Nó cho phép mở rộng số worker tuỳ ý mà không cần phối hợp gì thêm.

---

# Mẫu 3 — Cập nhật hàng loạt an toàn

Yêu cầu: chuẩn hoá cột `email` của 80 triệu dòng thành chữ thường.

## Cách sai

```sql
UPDATE users SET email = lower(email);
```

```text
   • Một transaction cập nhật 80 triệu dòng
   • Giữ khoá trên 80 triệu dòng → mọi truy vấn khác chờ
   • Sinh hàng chục GB WAL → replica tụt lại, đầy đĩa
   • Chạy 3 giờ; đứt giữa chừng → ROLLBACK 3 giờ nữa
   • Sinh 80 triệu tuple chết → autovacuum vật lộn nhiều giờ
```

## Cách đúng — cập nhật theo lô

```python
KICH_THUOC_LO = 10000

while True:
    with conn.cursor() as c:
        c.execute("""
            WITH lo AS (
                SELECT id FROM users
                 WHERE email <> lower(email)      -- ← ĐIỀU KIỆN TỰ DỪNG
                 ORDER BY id
                 LIMIT %s
                 FOR UPDATE SKIP LOCKED
            )
            UPDATE users u SET email = lower(u.email)
              FROM lo WHERE u.id = lo.id
            RETURNING u.id
        """, (KICH_THUOC_LO,))
        so_dong = c.rowcount
    conn.commit()

    if so_dong == 0:
        break
    print(f"Đã cập nhật {so_dong} dòng")
    time.sleep(0.1)          # ← nhường I/O cho tải thật
```

Bốn chi tiết trong đoạn code này đều quan trọng:

| Chi tiết | Vì sao |
|---|---|
| `WHERE email <> lower(email)` | Điều kiện **tự dừng**: dòng đã xử lý không khớp nữa. Job chạy lại bao nhiêu lần cũng an toàn |
| `FOR UPDATE SKIP LOCKED` | Nhiều worker chạy song song không giẫm nhau |
| `commit()` mỗi lô | Transaction ngắn, WAL được giải phóng, `VACUUM` chạy được |
| `time.sleep(0.1)` | Nhường I/O cho lưu lượng thật — đây là điều phân biệt job "chạy được" với job "làm sập production" |

Thêm một index tạm để tăng tốc rất nhiều:

```sql
CREATE INDEX CONCURRENTLY idx_users_need_fix
    ON users (id) WHERE email <> lower(email);
-- ... chạy job ...
DROP INDEX CONCURRENTLY idx_users_need_fix;
```

Index bộ phận này chỉ chứa các dòng **còn cần xử lý**, và nó **tự nhỏ dần** khi job tiến triển.

## Theo dõi trong lúc chạy

```sql
-- Còn bao nhiêu dòng chưa xử lý
SELECT count(*) FROM users WHERE email <> lower(email);

-- Độ trễ nhân bản có tăng không
SELECT application_name, replay_lag FROM pg_stat_replication;

-- Tuple chết có tích tụ không
SELECT relname, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables WHERE relname = 'users';
```

Nếu `replay_lag` tăng đều hoặc `n_dead_tup` tích tụ nhanh hơn autovacuum dọn, hãy **tăng `sleep`** hoặc **giảm kích thước lô**.

---

# Mẫu 4 — Truyền dữ liệu qua API dạng luồng

Yêu cầu: API xuất báo cáo 10 triệu dòng ra CSV cho người dùng tải về.

## Cách sai

```python
@app.route('/export')
def export():
    rows = db.query("SELECT * FROM events")     # 4 GB vào RAM
    return Response(to_csv(rows), mimetype='text/csv')
```

```text
   • Người dùng chờ 3 phút không thấy gì
   • 4 GB RAM cho MỖI người dùng gọi API
   • 3 người gọi cùng lúc → server chết
   • Trình duyệt timeout trước khi nhận được byte đầu tiên
```

## Cách đúng — luồng từ database thẳng ra HTTP

```python
from flask import Response, stream_with_context

@app.route('/export')
def export():
    def sinh_du_lieu():
        conn = psycopg2.connect(DSN)
        cur = conn.cursor(name='export_cur')      # server-side
        cur.itersize = 5000
        cur.execute("SELECT id, user_id, created_at FROM events")

        yield 'id,user_id,created_at\n'           # dòng tiêu đề
        for row in cur:
            yield f'{row[0]},{row[1]},{row[2]}\n'

        cur.close()
        conn.close()

    return Response(
        stream_with_context(sinh_du_lieu()),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=export.csv'}
    )
```

```text
   Byte đầu tiên tới trình duyệt : ~50 ms   (thay vì 3 phút)
   RAM mỗi request               : ~20 MB   (thay vì 4 GB)
```

## Ba vấn đề khi truyền luồng qua HTTP

### Vấn đề 1 — Không báo lỗi được sau khi đã gửi byte đầu

```text
   Đã gửi header 200 OK và một phần dữ liệu
   → giờ truy vấn lỗi → KHÔNG thể đổi thành 500 nữa
   → người dùng nhận một file CSV BỊ CẮT NGANG mà không biết
```

Cách giảm nhẹ — ghi một dòng đánh dấu kết thúc:

```python
def sinh_du_lieu():
    try:
        ...
        for row in cur:
            yield ...
        yield '# END_OF_EXPORT\n'        # ← người nhận kiểm tra dòng này
    except Exception as e:
        yield f'# ERROR: {e}\n'
        raise
```

### Vấn đề 2 — Kết nối bị giữ suốt thời gian truyền

```text
   Một lần xuất mất 10 phút = một kết nối database bị chiếm 10 phút.
   10 người cùng xuất = 10 kết nối bị chiếm.
   → với pool 20 kết nối ([phase-8 bài 3]), đây là nửa pool.
```

Giải pháp cho hệ thống lớn: **xuất bất đồng bộ**.

```text
   1. POST /exports        → tạo một job, trả về ngay job_id
   2. Worker nền chạy COPY ra file trên object storage
   3. GET /exports/{id}    → trả về trạng thái
   4. Xong → trả về URL có chữ ký, hết hạn sau 1 giờ
```

Cách này giải phóng cả kết nối database lẫn kết nối HTTP, và cho phép người dùng đóng trình duyệt rồi quay lại.

### Vấn đề 3 — Proxy có thể đệm toàn bộ

Nginx mặc định **đệm phản hồi**, làm mất hết lợi ích của việc truyền luồng:

```nginx
location /export {
    proxy_pass http://app;
    proxy_buffering off;              # ← BẮT BUỘC
    proxy_read_timeout 3600s;
    chunked_transfer_encoding on;
}
```

Đây là chi tiết hay bị bỏ sót: code ứng dụng truyền luồng đúng, nhưng proxy vẫn gom hết rồi mới gửi — và triệu chứng giống hệt như chưa làm gì.

---

## Bảng chọn mẫu

| Tình huống | Mẫu | Vì sao |
|---|---|---|
| Xuất toàn bộ bảng ra file | **`COPY TO`** | Nhanh nhất, ~8 lần so với cursor |
| Xuất song song | **`COPY` chia khoảng** | Tận dụng nhiều lõi và nhiều đĩa |
| ETL nhiều giờ, gọi API bên ngoài | **Keyset + điểm dừng bền vững** | Không giữ transaction, dừng và tiếp được |
| ETL nhiều worker | **Hàng đợi + `SKIP LOCKED`** | Không cần phối hợp giữa các worker |
| Cập nhật hàng loạt | **Lô + điều kiện tự dừng + `sleep`** | Không chặn hệ thống, chạy lại an toàn |
| API tải xuống, kết quả vừa | **Server-side cursor + luồng HTTP** | Byte đầu tiên nhanh, RAM thấp |
| API tải xuống, kết quả rất lớn | **Xuất bất đồng bộ + object storage** | Không chiếm kết nối |
| Đọc một lần, cần ảnh chụp nhất quán | **Server-side cursor** | Chỉ cursor cho ảnh chụp cố định |

Dòng cuối là lý do duy nhất **bắt buộc** phải dùng cursor: khi bạn cần mọi dòng đọc ra đều thuộc **cùng một thời điểm**. Mọi trường hợp khác đều có lựa chọn tốt hơn.

## Ba câu hỏi để chọn đúng

```text
   1. CÓ CẦN ẢNH CHỤP NHẤT QUÁN KHÔNG?
        Có     → CURSOR (chấp nhận giữ transaction)
        Không  → keyset (tốt hơn ở mọi mặt khác)

   2. XỬ LÝ MỖI DÒNG MẤT BAO LÂU?
        < 1 ms   → cursor on
        > 10 ms  → keyset + điểm dừng bền vững

   3. CÓ PHẢI CHỈ ĐỂ XUẤT RA FILE KHÔNG?
        Đúng   → COPY
        Không  → cursor hoặc keyset
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Cursor cho job chạy nhiều giờ | Transaction mở nhiều giờ chặn `VACUUM` toàn database | Keyset + điểm dừng bền vững |
| `UPDATE` toàn bảng một lệnh | Khoá hàng loạt, WAL khổng lồ, rollback rất lâu | Lô + điều kiện tự dừng + `sleep` |
| Job hàng loạt không có `sleep` | Chiếm hết I/O, làm sập lưu lượng thật | `sleep` giữa các lô; theo dõi `replay_lag` |
| Không có điều kiện tự dừng | Chạy lại sẽ xử lý lại từ đầu | `WHERE <chưa xử lý>` |
| Truyền luồng nhưng `proxy_buffering on` | Proxy gom hết, mất sạch lợi ích | `proxy_buffering off` |
| Báo lỗi sau khi đã gửi byte đầu | Người dùng nhận file cắt ngang không biết | Dòng đánh dấu kết thúc |
| Xuất đồng bộ qua API cho kết quả rất lớn | Chiếm kết nối database nhiều phút | Xuất bất đồng bộ ra object storage |
| Chia song song bằng `id % N` | Mỗi worker vẫn quét toàn bảng | Chia theo **khoảng liên tục**, hoặc theo mảnh |

## Tóm tắt bài 2

- **`COPY TO STDOUT`** nhanh hơn cursor **~8,5 lần** khi xuất file, vì nó bỏ hẳn tầng đóng gói dòng-theo-dòng. Nén ngay khi xuất giảm dung lượng ~8,5 lần với chi phí CPU ~15%.
- Với **job ETL nhiều giờ**, cursor là lựa chọn **sai** — dùng **keyset + bảng điểm dừng bền vững**: transaction ngắn, dừng và tiếp được, chạy song song được, theo dõi tiến độ bằng một câu `SELECT`.
- Nhiều worker ETL nên dùng **hàng đợi trong database với `FOR UPDATE SKIP LOCKED`** — mở rộng tuỳ ý mà không cần phối hợp.
- **Cập nhật hàng loạt** cần bốn thứ: điều kiện **tự dừng**, `SKIP LOCKED`, **commit mỗi lô**, và **`sleep`** để nhường I/O. Thêm **index bộ phận tạm** làm job nhanh lên nhiều lần và tự nhỏ dần.
- **Truyền luồng qua HTTP** đưa byte đầu tiên từ 3 phút xuống ~50 ms và RAM từ 4 GB xuống 20 MB — nhưng phải tắt `proxy_buffering` ở Nginx, nếu không mất sạch lợi ích.
- Với kết quả rất lớn, **xuất bất đồng bộ ra object storage** tốt hơn truyền luồng đồng bộ, vì nó không chiếm kết nối database.
- **Lý do duy nhất bắt buộc phải dùng cursor** là khi cần **ảnh chụp nhất quán** — mọi dòng đọc ra thuộc cùng một thời điểm. Mọi trường hợp khác đều có lựa chọn tốt hơn.

**Bài kế tiếp** → [Phase 13 — Bài 1: NoSQL vs SQL và kiến trúc MongoDB](../phase-13/01-nosql-vs-sql-va-mongodb.md)
