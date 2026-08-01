# Bài 6: Connection pool, job queue và transaction dài

Người phỏng vấn hỏi: *"Transaction là gì?"* Bạn trả lời chuẩn sách giáo khoa: một nhóm lệnh, hoặc xong hết, hoặc huỷ hết. Đúng.

Anh ta gật đầu, ghi một dòng, rồi hỏi tiếp:

> *"Trang danh sách sản phẩm cũng đứng. Mà trang đó không đụng một dòng nào của bảng đơn hàng. Không có khoá nào liên quan tới nó. Vì sao?"*

Đây là chỗ đáp án về khoá hết tác dụng. Lý do nằm ở nơi khác: **mỗi transaction đang mở chiếm đúng một kết nối trong pool** — và pool thì có đáy.

Bài này nói về hai thứ mà transaction thật sự gây ra trong hệ thống production: **khoá** (đã học ở phase-4 bài 3) và **kết nối** (phần ít ai nói). Rồi tới cách đúng để đưa việc nặng ra khỏi request.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Connection** | cần-néc-shân | **Kết nối** — một đường dây từ ứng dụng tới database |
| **Connection pool** | pun | **Bể kết nối** — dùng chung, mượn rồi trả, thay vì mở mới mỗi lần |
| **PgBouncer** | pi-ji-bao-sơ | Lớp gom kết nối phổ biến nhất cho PostgreSQL |
| **Transaction pooling** | | Chế độ **trả kết nối về bể sau mỗi `COMMIT`** — gom được nhiều nhất |
| **`idle in transaction`** | ai-đồ | Đã `BEGIN` nhưng **không làm gì** và chưa `COMMIT` — kẻ giết người thầm lặng |
| **Context switch** | | **Chuyển ngữ cảnh** — chi phí hệ điều hành đổi từ tiến trình này sang tiến trình kia |
| **`SKIP LOCKED`** | skịp lốc | Bỏ qua dòng đang bị phiên khác giữ, thay vì xếp hàng chờ |
| **DLQ** (*Dead Letter Queue*) | | **Hàng đợi người chết** — nơi chứa job thất bại hết cách |
| **Backoff + jitter** | béc-óp | **Giãn nhịp + nhiễu ngẫu nhiên** khi thử lại |
| **Outbox pattern** | ao-bốc | Ghi bản ghi và message trong **cùng một transaction** để không lệch nhau |
| **Backpressure** | béc-pre-shơ | **Áp lực ngược** — tín hiệu báo "chậm lại, tôi không theo kịp" |

## Kết nối tới database là tài nguyên đắt

```text
PostgreSQL: mỗi kết nối = MỘT TIẾN TRÌNH HỆ ĐIỀU HÀNH riêng
   • ~5–10 MB RAM cho mỗi kết nối, kể cả khi ngồi không
   • Bộ lập lịch của OS phải quản lý từng tiến trình
   • 10.000 kết nối = 100 GB RAM chỉ để tồn tại

MySQL: mỗi kết nối = một luồng (thread), nhẹ hơn nhưng vẫn tốn

→ max_connections mặc định của Postgres chỉ là 100.
→ Con số tối ưu thường là 2–4 × số nhân CPU, hiếm khi vượt 200.
```

Nghịch lý quan trọng: **tăng `max_connections` thường làm hệ thống chậm đi**. Với 8 nhân CPU, 500 kết nối hoạt động cùng lúc chỉ khiến chúng tranh nhau CPU, tranh nhau khoá, và thời gian chuyển ngữ cảnh (context switch) áp đảo thời gian làm việc thật.

```text
Thông lượng theo số kết nối hoạt động (máy 8 nhân):

  TPS
  │        ╭─────╮
  │      ╱         ╲___
  │    ╱                ╲______
  │  ╱                          ╲_____
  │╱
  └────────────────────────────────────► kết nối
   4    8   16   32    64   128   256

  Đỉnh ở khoảng 2–4× số nhân. Sau đó TỤT vì tranh chấp.
```

## Connection pool: lớp gom kết nối

Ứng dụng không mở kết nối mới cho mỗi request — nó **mượn** từ một bể có sẵn, dùng xong **trả lại**.

```text
   ┌── App 1 ──┐  ┌── App 2 ──┐  ┌── App 3 ──┐   (mỗi app 20 kết nối "ảo")
   └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
         └──────────────┼──────────────┘
                        ▼
                 ┌──────────────┐
                 │  PgBouncer   │   pool 25 kết nối THẬT
                 └──────┬───────┘
                        ▼
                 ┌──────────────┐
                 │  PostgreSQL  │   max_connections = 100
                 └──────────────┘
```

Ba chế độ pooling của PgBouncer — hiểu đúng chế độ là điều kiện để dùng đúng:

| Chế độ | Kết nối trả lại pool khi | Dùng được | Không dùng được |
|---|---|---|---|
| `session` | Client ngắt kết nối | Mọi tính năng | Gần như không gom được gì |
| **`transaction`** | **Mỗi `COMMIT`/`ROLLBACK`** | **Mặc định nên chọn** | Prepared statement kiểu cũ, `SET` toàn phiên, advisory lock, `LISTEN/NOTIFY`, temp table |
| `statement` | Sau mỗi câu lệnh | Chỉ query đơn lẻ | **Không có transaction nhiều lệnh** |

`transaction` mode là chế độ mang lại gần như toàn bộ lợi ích. Nhưng nó thay đổi một giả định ngầm: **hai câu lệnh liên tiếp của bạn có thể chạy trên hai kết nối vật lý khác nhau**. Nghĩa là:

```python
# ❌ Hỏng trong transaction mode
cur.execute("SET search_path TO tenant_42")   # chạy trên kết nối A
cur.execute("SELECT * FROM orders")            # có thể chạy trên kết nối B → sai schema!

# ✅ Dùng SET LOCAL bên trong transaction
with conn.transaction():
    cur.execute("SET LOCAL search_path TO tenant_42")
    cur.execute("SELECT * FROM orders")
```

Postgres 14+ hỗ trợ prepared statement trong transaction mode qua `max_prepared_statements` của PgBouncer; với driver cũ, tắt prepared statement server-side (`prepare_threshold=0` trong psycopg, `?prepareThreshold=0` trong JDBC).

### Tính kích thước pool

```text
Công thức thực dụng của HikariCP:
    pool_size = (số_nhân_CPU × 2) + số_đĩa_hiệu_dụng

Máy 8 nhân, SSD:  8×2 + 1 = 17  →  làm tròn 20

Với N instance ứng dụng:
    tổng kết nối = N × pool_size  ≤  max_connections − dự phòng cho admin

Ví dụ: max_connections = 100, giữ 10 cho admin/monitoring
       → 90 chia cho 10 instance = 9 kết nối mỗi instance
       → Nếu cần nhiều hơn, đặt PgBouncer ở giữa
```

**Pool nhỏ mà đủ tốt hơn pool lớn mà tranh chấp.** Đây là điều phản trực giác nhất về connection pool.

## Ba cách làm cạn pool

### ① Transaction giữ kết nối trong lúc gọi mạng

Đây là thủ phạm số một, và là câu trả lời cho câu hỏi mở đầu bài.

```python
# ❌ Kết nối bị giữ suốt 30 giây
with conn.transaction():
    don = tao_don_hang(conn, ...)              # 5 ms
    ket_qua = goi_cong_thanh_toan(don)          # 300 ms bình thường...
                                                # ...nhưng HÔM NAY: 30 GIÂY
    cap_nhat_trang_thai(conn, don, ket_qua)     # 3 ms
# Trong 30 giây đó: 1 kết nối + các khoá của nó bị giữ nguyên
```

Với 20 request đồng thời rơi vào tình huống này, **toàn bộ pool cạn sạch**. Và giờ trang danh sách sản phẩm cũng đứng — dù nó không đụng bảng đơn hàng, không liên quan tới khoá nào. Nó chỉ đơn giản là **không mượn được kết nối**.

```python
# ✅ Chia làm ba, không giữ kết nối trong lúc chờ mạng
with conn.transaction():                        # transaction 1: ~5 ms
    don = tao_don_hang(conn, trang_thai="dang_cho")

ket_qua = goi_cong_thanh_toan(don, timeout=10)  # NGOÀI transaction

with conn.transaction():                        # transaction 2: ~3 ms
    cap_nhat_trang_thai(conn, don, ket_qua)
```

**Luật: không bao giờ gọi mạng bên trong transaction.** Không gọi API, không gửi email, không đọc file lớn, không chờ khoá phân tán.

### ② Idle in transaction — kẻ giết người thầm lặng

```sql
-- Tìm kết nối đang mở transaction mà KHÔNG làm gì
SELECT pid, usename, state, application_name,
       now() - xact_start  AS transaction_mo_bao_lau,
       now() - state_change AS ngoi_khong_bao_lau,
       left(query, 80)     AS lenh_cuoi
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY xact_start;
```

`idle in transaction` nghĩa là: ứng dụng gõ `BEGIN`, chạy vài lệnh, rồi **đi làm việc khác** mà chưa `COMMIT`. Nguyên nhân thường gặp: ORM tự mở transaction ở đầu request, code gọi API bên ngoài, ngoại lệ được bắt nhưng quên rollback.

Tác hại kép: giữ kết nối **và** chặn `VACUUM` dọn dòng chết (vì transaction cũ vẫn có thể cần đọc chúng) → bảng phình dần.

```sql
-- Chặn nó ở tầng database — mọi hệ thống production nên bật
ALTER ROLE app_user SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE app_user SET statement_timeout = '30s';
ALTER ROLE app_user SET lock_timeout = '5s';
```

### ③ Job nền dùng chung pool với web

```text
❌ Một pool cho tất cả:
   20 kết nối, worker nền chạy report 5 phút chiếm 15 kết nối
   → web chỉ còn 5 → người dùng chờ

✅ Pool riêng, kích thước riêng:
   web_pool     = 20   (nhiều, ngắn)
   worker_pool  = 5    (ít, dài)
   analytics    → đi thẳng vào READ REPLICA, không đụng primary
```

## Đưa việc nặng ra khỏi request: job queue

23h47, một khách hàng bấm nút xuất báo cáo tháng: 40.000 dòng kèm 200 tấm ảnh phải render lại. Trình duyệt quay, quay, rồi trả về `504 Gateway Timeout`.

Nhưng báo cáo vẫn đang chạy ở phía sau — không ai dừng nó lại. Khách hàng làm đúng thứ mọi khách hàng đều làm: **bấm lại**. Năm lần. Giờ có 5 tiến trình cùng render 200 tấm ảnh trên cùng một server. 8 nhân CPU cháy hết trong 30 giây, cả website sập, kể cả trang đăng nhập.

Code không sai. Cái sai nằm ở chỗ **nó chạy ngay bên trong cái request đang bắt người dùng ngồi chờ**.

### PostgreSQL làm hàng đợi được — với `SKIP LOCKED`

Bạn không cần RabbitMQ ngay từ đầu. Postgres có sẵn công cụ:

```sql
CREATE TABLE jobs (
    job_id       BIGSERIAL PRIMARY KEY,
    loai         TEXT        NOT NULL,
    payload      JSONB       NOT NULL,
    khoa_duy_nhat TEXT       UNIQUE,          -- idempotency key
    trang_thai   TEXT        NOT NULL DEFAULT 'cho',
    so_lan_thu   INT         NOT NULL DEFAULT 0,
    chay_luc     TIMESTAMPTZ NOT NULL DEFAULT now(),
    het_han_luc  TIMESTAMPTZ,
    loi          TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index chỉ trên job đang chờ — nhỏ và nhanh dù bảng có triệu dòng
CREATE INDEX jobs_cho_idx ON jobs (chay_luc)
    WHERE trang_thai = 'cho';
```

```sql
-- Worker lấy việc: FOR UPDATE SKIP LOCKED
BEGIN;

SELECT job_id, loai, payload
FROM jobs
WHERE trang_thai = 'cho' AND chay_luc <= now()
ORDER BY chay_luc
LIMIT 1
FOR UPDATE SKIP LOCKED;      -- ◄── chìa khoá của toàn bộ mẫu thiết kế này

UPDATE jobs
SET trang_thai = 'dang_chay', het_han_luc = now() + INTERVAL '30 minutes'
WHERE job_id = $1;

COMMIT;
```

`SKIP LOCKED` nghĩa là: *"dòng nào đang bị worker khác khoá thì bỏ qua, lấy dòng tiếp theo."* Không có nó, 20 worker sẽ **xếp hàng chờ nhau** trên cùng một dòng — biến hàng đợi song song thành hàng đợi tuần tự.

```text
KHÔNG có SKIP LOCKED:              CÓ SKIP LOCKED:
  W1 → job 1 (khoá)                  W1 → job 1
  W2 → chờ job 1...                  W2 → bỏ qua job 1, lấy job 2
  W3 → chờ job 1...                  W3 → bỏ qua 1,2, lấy job 3
  → thông lượng = 1 worker           → thông lượng = N worker
```

### Bốn tính chất bắt buộc của một hệ thống hàng đợi

**① Tách nhận việc khỏi làm việc.** Request chỉ ghi một dòng vào bảng jobs rồi trả về ngay:

```python
@app.post("/bao-cao")
def tao_bao_cao(req):
    ma = str(uuid7())
    db.execute(
        "INSERT INTO jobs (loai, payload, khoa_duy_nhat) VALUES (%s, %s, %s)"
        " ON CONFLICT (khoa_duy_nhat) DO NOTHING",
        ("render_bao_cao", json.dumps(req.params), ma),
    )
    return {"ma": ma, "thong_bao": "Đã nhận. Xong sẽ email cho bạn."}, 202
# 200 ms thay vì 4 phút. Server thở.
```

**② Thất bại là mặc định, không phải ngoại lệ.**

Job **phải** idempotent — chạy hai lần phải ra đúng một kết quả. Vì worker có thể chết sau khi làm xong nhưng trước khi đánh dấu hoàn thành, và job sẽ được chạy lại.

```python
def render_bao_cao(job):
    ma = job["payload"]["ma"]
    if da_ton_tai_bao_cao(ma):        # hỏi trước khi làm
        return

    tam = f"/tmp/{ma}.pdf"
    render_ra_file(tam)
    os.rename(tam, f"/reports/{ma}.pdf")   # đổi tên là thao tác NGUYÊN TỬ
```

Thử lại phải **có nhịp** — exponential backoff kèm jitter, nếu không N worker cùng thử lại cùng lúc sẽ tạo ra một đợt sóng đè chết dịch vụ vừa hồi phục:

```sql
UPDATE jobs
SET trang_thai = 'cho',
    so_lan_thu = so_lan_thu + 1,
    chay_luc   = now() + (INTERVAL '1 second' * pow(2, so_lan_thu)
                          * (0.5 + random()))     -- jitter chống bầy đàn
WHERE job_id = $1 AND so_lan_thu < 5;
```

Thử 5 lần vẫn chết thì **tuyệt đối không được im lặng vứt đi** — đẩy vào **hàng đợi người chết** (*dead letter queue*), một cái nghĩa địa có tên job, lỗi gì, và dữ liệu gốc còn nguyên vẹn để chạy lại sau khi sửa bug.

**③ Song song bám theo máy thật, và việc nặng phải có làn riêng.**

```text
Một job gửi email  ≈ 0 CPU, vài ms
Một job render video 1080p ≈ 2 nhân CPU + 1,5 GB RAM, trong 20 phút

Hai job đó KHÔNG THỂ chung một hàng đợi.
```

Người mới hay chỉnh số worker như chỉnh âm lượng — càng to càng tốt. **20 worker trên 8 nhân CPU không làm gì nhanh hơn.** Nó chỉ khiến cả 20 cùng chậm, rồi OOM killer gõ cửa và bắn bừa một đứa.

```text
Con số đúng nằm ở máy của bạn, không nằm trong tài liệu:
   worker = min( số_nhân_CPU / CPU_mỗi_job ,  RAM_khả_dụng / RAM_mỗi_job )

Với render video: có khi là 2. Có khi là 1.
```

Và tách hàng đợi theo tính chất công việc:

```text
queue:nhanh   → email, thông báo, webhook       (20 worker)
queue:media   → render ảnh, video               (2 worker)
queue:bao_cao → export, ETL                     (4 worker)

Đừng bắt email đặt lại mật khẩu xếp hàng sau một job render 20 phút.
```

**④ Không đo được thì không sửa được.**

Hai con số phải treo lên dashboard, và chúng quan trọng hơn cả CPU:

```sql
SELECT
    count(*) FILTER (WHERE trang_thai = 'cho')            AS hang_doi_sau,
    EXTRACT(epoch FROM (now() - min(chay_luc)))
        FILTER (WHERE trang_thai = 'cho')                 AS phieu_gia_nhat_giay,
    count(*) FILTER (WHERE trang_thai = 'that_bai')       AS so_that_bai
FROM jobs;
```

```text
① Hàng đợi SÂU bao nhiêu?
② Phiếu GIÀ NHẤT nằm đó bao lâu rồi?   ◄── con số khách hàng thật sự cảm nhận

Hàng đợi sâu mà đi NGANG  → ổn, worker theo kịp.
Hàng đợi sâu mà DỐC LÊN   → hoặc thiếu worker, hoặc có một job đang chết
                              đi chết lại và kéo cả hàng theo nó.
```

Ngoài ra phải có **timeout cứng** cho mỗi job: một job không có thời hạn là một job chạy mãi mãi, và nó giữ luôn cái worker đó khỏi nhận việc mới.

```sql
-- Job hết hạn mà chưa xong → thu hồi cho worker khác
UPDATE jobs SET trang_thai = 'cho', so_lan_thu = so_lan_thu + 1
WHERE trang_thai = 'dang_chay' AND het_han_luc < now();
```

### Outbox pattern: ghi database và gửi message một cách nhất quán

Bài toán kinh điển: bạn cần ghi đơn hàng vào database **và** gửi message sang Kafka. Nếu ghi xong mà gửi hỏng, hai hệ thống lệch nhau.

```sql
-- Ghi đơn hàng và message trong CÙNG MỘT transaction
BEGIN;
INSERT INTO orders (...) VALUES (...);
INSERT INTO outbox (topic, payload)
VALUES ('order.created', jsonb_build_object('order_id', currval('orders_order_id_seq')));
COMMIT;
-- Nguyên tử: hoặc cả hai, hoặc không gì cả

-- Một tiến trình riêng đọc outbox và đẩy sang Kafka, đánh dấu đã gửi
-- (hoặc dùng CDC/Debezium đọc thẳng WAL)
```

Đây là cách chuẩn để giải bài toán "ghi kép" mà không cần transaction phân tán.

## Cái giá của hàng đợi — thứ chưa ai nói với bạn

> **Hàng đợi không làm công việc chạy nhanh hơn.** Báo cáo vẫn mất 4 phút. Bạn chỉ vừa dời chỗ ngồi chờ, từ trước mặt ra sau lưng.

Và bạn vừa mua về một **hệ thống phân tán**:

- Trạng thái job phải tự lưu và tự quản lý.
- Worker phải deploy, giám sát, scale riêng.
- Một loại bug mới: **bug bất đồng bộ** — thứ không tái hiện được trên máy bạn.
- Và đắt nhất: **job chết âm thầm**. Chạy được 3 tiếng, bị kill, không ai biết. Trên màn hình khách hàng cái vòng tròn vẫn quay, và nó sẽ quay như thế cho tới ngày bạn tự tay đi tìm.

**Nên đừng ném mọi thứ vào hàng đợi.** Việc chạy dưới một giây và không ai chết nếu nó fail thì để yên đó.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Trang danh sách sản phẩm **đứng hình**, dù nó không đụng vào bảng đơn hàng và không có khoá nào liên quan. Cùng lúc đó, cổng thanh toán của đối tác đang chậm.

**Chẩn đoán — ba câu lệnh chỉ đúng thủ phạm:**

```sql
-- ① Bể kết nối còn chỗ không?
SELECT count(*) AS dang_dung, current_setting('max_connections') AS tran
FROM pg_stat_activity;
--  98 / 100    ◄── CẠN RỒI

-- ② Chúng đang làm gì? Đây là câu quan trọng nhất
SELECT state, count(*), max(now() - state_change) AS lau_nhat
FROM pg_stat_activity GROUP BY state ORDER BY 2 DESC;
--  idle in transaction | 87 | 00:00:29    ◄── 87 KẾT NỐI ĐANG NGỒI KHÔNG
--  active              |  6 | 00:00:00
--  idle                |  5 | 00:12:04

-- ③ Câu lệnh cuối chúng chạy là gì? → chỉ ra ĐÚNG dòng code
SELECT pid, now() - xact_start AS mo_bao_lau, left(query, 80) AS lenh_cuoi
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY xact_start LIMIT 3;
--  INSERT INTO orders (...)    ← mở transaction, ghi xong, RỒI ĐI GỌI API
```

```text
   KẾT LUẬN: transaction được mở, ghi đơn hàng, rồi ỨNG DỤNG ĐI GỌI
   CỔNG THANH TOÁN và ngồi chờ 30 giây — trong khi VẪN GIỮ KẾT NỐI.

   87 request như vậy = bể cạn = MỌI TRANG đều đứng,
   kể cả trang không liên quan gì. Nó chỉ đơn giản KHÔNG MƯỢN ĐƯỢC KẾT NỐI.
```

**Cách xử lý — cứu hoả trước, sửa gốc sau:**

```sql
-- ═══ CỨU HOẢ (làm ngay) ═══
-- Cắt các transaction ngồi không quá 60 giây
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE state = 'idle in transaction' AND now() - state_change > INTERVAL '60 seconds';
```

```sql
-- ═══ CHẶN Ở TẦNG DATABASE (làm trong 5 phút, ngăn tái diễn) ═══
ALTER ROLE app_user SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE app_user SET statement_timeout                    = '30s';
ALTER ROLE app_user SET lock_timeout                         = '5s';
```

```python
# ═══ SỬA GỐC: KHÔNG GỌI MẠNG TRONG TRANSACTION ═══

# ❌ TRƯỚC — giữ kết nối suốt 30 giây
with conn.transaction():
    don = tao_don_hang(conn, ...)                # 5 ms
    kq  = goi_cong_thanh_toan(don)               # 30 GIÂY hôm nay
    cap_nhat_trang_thai(conn, don, kq)           # 3 ms

# ✅ SAU — ba bước, không giữ kết nối lúc chờ
with conn.transaction():                          # transaction 1: ~5 ms
    don = tao_don_hang(conn, trang_thai="dang_cho")

kq = goi_cong_thanh_toan(don, timeout=10)         # NGOÀI transaction

with conn.transaction():                          # transaction 2: ~3 ms
    cap_nhat_trang_thai(conn, don, kq)
```

**Và thêm cảnh báo để lần sau biết trước khi khách biết:**

```yaml
- alert: IdleInTransactionCao
  expr: pg_stat_activity_count{state="idle in transaction"} > 10
  for: 1m
  annotations:
    summary: "{{ $value }} kết nối đang idle in transaction — sắp cạn bể"
```

> **Tình huống 2:** Hàng đợi có **200.000 job tồn đọng**. Bạn tăng worker từ 10 lên 50, và database **sập**.

**Chẩn đoán: worker không phải nút thắt — database mới là.**

```sql
-- ① Worker đang CHỜ ở đâu?
SELECT wait_event_type, wait_event, count(*)
FROM pg_stat_activity WHERE backend_type = 'client backend'
GROUP BY 1,2 ORDER BY 3 DESC;
--  Client | ClientRead | 42     → worker đang chờ ứng dụng, không phải DB
--  LWLock | BufferPin  | 8      → đang tranh chấp trong DB
--  IO     | DataFileRead | 31   ◄── ĐANG CHỜ ĐỌC ĐĨA → DB là nút thắt

-- ② 50 worker × 5 kết nối = 250 > max_connections = 100
SELECT count(*) FROM pg_stat_activity;    -- 100 (đã kịch trần)
```

**Cách xử lý — bốn bước theo thứ tự:**

```text
① ĐO TRƯỚC KHI THÊM WORKER
   Nếu worker đang chờ DB thì thêm worker chỉ làm TỆ HƠN.
   Con số đúng: min(CPU_khả_dụng / CPU_mỗi_job, RAM_khả_dụng / RAM_mỗi_job)

② ĐẶT PgBouncer Ở GIỮA + giảm pool mỗi worker xuống 1–2

③ GỘP THAO TÁC THEO LÔ thay vì từng cái
```

```python
# ❌ 1.000 job = 1.000 chuyến đi mạng
for j in jobs:
    db.execute("UPDATE t SET x = %s WHERE id = %s", (j.x, j.id))

# ✅ Một lệnh
db.execute(
    "UPDATE t SET x = v.x FROM (VALUES %s) AS v(id, x) WHERE t.id = v.id",
    [(j.id, j.x) for j in jobs])
```

```sql
-- ④ XẢ TẢI CÓ CHỌN LỌC nếu vẫn tồn đọng
-- Bỏ hẳn job đã quá hạn ý nghĩa (thông báo khuyến mãi hôm qua)
DELETE FROM jobs
WHERE loai = 'thong_bao_khuyen_mai' AND chay_luc < now() - INTERVAL '1 day';

-- Ưu tiên job liên quan tới tiền
UPDATE jobs SET uu_tien = 100 WHERE loai IN ('thanh_toan', 'hoan_tien');
```

> **Nguyên tắc:** *"tăng worker"* là phản xạ đầu tiên và **thường sai**. Đo xem worker đang chờ ai trước đã.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Gọi API bên ngoài trong transaction | Giữ kết nối + khoá suốt thời gian chờ | Chia làm nhiều transaction ngắn |
| `idle in transaction` không giới hạn | Cạn pool + chặn `VACUUM` → bảng phình | `idle_in_transaction_session_timeout` |
| Tăng `max_connections` để "chịu tải hơn" | Tranh chấp CPU, thông lượng **tụt** | Pool nhỏ + PgBouncer |
| Job nền dùng chung pool với web | Người dùng chờ vì worker chiếm hết | Pool riêng, analytics đi replica |
| `SET` (không `LOCAL`) trong transaction mode | Ảnh hưởng sang request khác | Luôn `SET LOCAL` |
| Prepared statement server-side + PgBouncer transaction mode | Lỗi khó hiểu | Tắt hoặc dùng PgBouncer 1.21+ |
| Hàng đợi không có `SKIP LOCKED` | N worker xếp hàng chờ nhau | `FOR UPDATE SKIP LOCKED` |
| Job không idempotent | Gửi email 2 lần, trừ tiền 2 lần | Khoá duy nhất + hỏi trước khi làm |
| Thử lại không có backoff/jitter | Sóng đè chết dịch vụ vừa hồi phục | Backoff mũ + jitter |
| Thất bại rồi vứt im lặng | Mất dữ liệu, không ai biết | Dead letter queue |
| Job không có timeout | Treo worker vĩnh viễn | `het_han_luc` + job thu hồi |
| Tăng worker để chạy nhanh hơn | OOM, mọi job cùng chậm | Tính theo CPU/RAM mỗi job |
| Chỉ giám sát độ sâu hàng đợi | Không thấy job già nhất đang chờ bao lâu | Giám sát cả hai |
| Ném mọi thứ vào hàng đợi | Mua về hệ phân tán không cần thiết | Việc < 1 giây thì để nguyên |

## Câu hỏi phỏng vấn hay gặp

**H: Transaction dài gây hại thế nào?**
Hai thứ, và thứ thứ hai ít người nói. Một: nó **giữ khoá** trên những dòng đã sửa cho tới tận lúc `COMMIT` — nên thứ phải canh không phải thời gian chạy câu lệnh mà là khoảng cách từ `BEGIN` tới `COMMIT`. Hai: nó **giữ một kết nối trong pool** suốt thời gian đó. Đây là lý do trang danh sách sản phẩm cũng đứng dù nó không đụng bảng đơn hàng — nó chỉ đơn giản không mượn được kết nối. Và nó còn chặn `VACUUM` dọn dòng chết nên bảng phình dần.

**H: Vì sao không tăng `max_connections` lên 1000?**
Vì mỗi kết nối Postgres là một tiến trình OS tốn 5–10 MB, và quan trọng hơn: với 8 nhân CPU thì 500 kết nối hoạt động chỉ tranh nhau CPU và khoá, khiến thông lượng **tụt** chứ không tăng. Con số tối ưu thường là 2–4 lần số nhân. Muốn phục vụ nhiều client hơn thì đặt PgBouncer ở chế độ transaction pooling.

**H: Làm hàng đợi bằng PostgreSQL được không?**
Được, và với đa số hệ thống là đủ. Chìa khoá là `SELECT ... FOR UPDATE SKIP LOCKED` — nó cho worker bỏ qua dòng đang bị worker khác khoá thay vì xếp hàng chờ. Không có nó, N worker biến thành 1 worker. Cộng thêm partial index trên trạng thái `cho`, khoá duy nhất cho idempotency, cột `chay_luc` cho backoff, và `het_han_luc` cho timeout. Chỉ chuyển sang Kafka/RabbitMQ khi cần fan-out nhiều consumer hoặc thông lượng vượt sức Postgres.

**H: Job queue có nhược điểm gì?**
Nó **không làm công việc chạy nhanh hơn** — chỉ dời chỗ ngồi chờ. Đổi lại bạn mua về một hệ thống phân tán: trạng thái job phải tự quản lý, worker phải deploy và giám sát riêng, và một loại bug mới không tái hiện được trên máy bạn. Đắt nhất là job chết âm thầm — vòng tròn trên màn hình khách hàng vẫn quay cho tới ngày bạn tự tay đi tìm. Nên việc chạy dưới một giây và không ai chết nếu fail thì để nguyên trong request.

**H: Hai con số nào phải giám sát cho hàng đợi?**
Độ sâu hàng đợi, và **tuổi của phiếu già nhất đang chờ**. Con số thứ hai mới là thứ khách hàng cảm nhận được. Hàng đợi sâu mà đi ngang thì ổn — worker theo kịp. Hàng đợi sâu mà dốc lên thì hoặc thiếu worker, hoặc có một job đang chết đi chết lại và kéo cả hàng theo nó.

## Tóm tắt bài 6

- Mỗi kết nối Postgres là một **tiến trình OS** tốn 5–10 MB; tăng `max_connections` thường làm thông lượng **tụt**, không tăng.
- Transaction dài gây hại theo **hai** đường: giữ khoá **và giữ kết nối** — đường thứ hai làm sập cả những trang không liên quan.
- **Không bao giờ gọi mạng bên trong transaction.** Đặt `idle_in_transaction_session_timeout`, `statement_timeout`, `lock_timeout` cho mọi vai trò.
- Pool nhỏ mà đủ (~2–4× số nhân) tốt hơn pool lớn mà tranh chấp; tách pool riêng cho web / worker / analytics.
- PostgreSQL làm hàng đợi rất tốt nhờ **`FOR UPDATE SKIP LOCKED`** — không có nó thì N worker biến thành 1 worker.
- Bốn tính chất bắt buộc: **tách nhận việc khỏi làm việc**, **idempotent + backoff có jitter + DLQ**, **song song bám theo máy thật và tách làn cho việc nặng**, **đo độ sâu và tuổi phiếu già nhất**.
- Hàng đợi **không làm việc nhanh hơn** — nó đổi lấy độ phức tạp của hệ phân tán. Việc dưới một giây thì để nguyên.

**Bài kế tiếp** → [Phase 8, Bài 1: Flash sale và bài toán chống bán quá hàng](../phase-8/01-flash-sale-va-chong-ban-qua-hang.md)
