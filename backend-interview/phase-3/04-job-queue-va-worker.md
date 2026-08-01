# Bài 4: Job Queue và Worker — đưa việc nặng ra khỏi request

23 giờ 47 phút. Một khách hàng bấm nút **xuất báo cáo tháng**: 40.000 dòng, kèm 200 tấm ảnh phải render lại từ đầu.

Trình duyệt bắt đầu quay. Và nó cứ quay. 30 giây sau, trình duyệt trả về một dòng chữ mà dev nào cũng sợ: **504 Gateway Timeout**.

Nhưng báo cáo thì **vẫn đang chạy ở phía sau** — không ai dừng nó lại.

Khách hàng làm đúng thứ mọi khách hàng đều làm: **bấm lại**. Rồi bấm lại. Năm lần.

Giờ có 5 tiến trình cùng render 200 tấm ảnh trên cùng một con server. 8 nhân CPU cháy hết trong 30 giây. Cả website sập — **kể cả trang đăng nhập**, nơi chẳng liên quan gì tới cái báo cáo kia.

Code không sai. **Cái sai nằm ở chỗ nó chạy ngay bên trong cái request đang bắt người dùng ngồi chờ.**

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **Job / Task** | **Công việc** — một đơn vị việc cần làm |
| **Queue** | **Hàng đợi** — nơi xếp hàng các job chờ xử lý |
| **Producer** | **Bên tạo việc** — thường là web server |
| **Consumer / Worker** | **Bên làm việc** — tiến trình lấy job ra và xử lý |
| **Broker** | **Bên trung gian** giữ hàng đợi (Redis, RabbitMQ, Kafka) |
| **Idempotent** | **Bất biến khi lặp** — chạy 2 lần ra đúng 1 kết quả |
| **DLQ** (*Dead Letter Queue*) | **Hàng đợi người chết** — nơi chứa job thất bại hết cách |
| **Backoff** | **Giãn nhịp** — chờ lâu dần giữa các lần thử lại |
| **Jitter** | **Nhiễu ngẫu nhiên** — để nhiều worker không cùng thức dậy |
| **At-least-once** | **Ít nhất một lần** — có thể xử lý trùng |
| **Exactly-once** | **Đúng một lần** — gần như không tồn tại thật |
| **Backpressure** | **Áp lực ngược** — tín hiệu báo "chậm lại, tôi không theo kịp" |
| **Visibility timeout** | Thời gian job bị "ẩn" khỏi hàng đợi trong lúc worker xử lý |

## Kiến trúc và cách hoạt động

```text
   TRƯỚC — làm việc ngay trong request

   Người dùng ──POST /bao-cao──► Web Server ──render 4 phút──► ...
              ◄──── 504 sau 30 giây ─────                    (vẫn chạy!)
              ──bấm lại×5──►  5 tiến trình cùng render → CPU cháy → SẬP


   SAU — tách nhận việc khỏi làm việc

   Người dùng ──POST /bao-cao──► Web Server
                                     │  ① ghi MỘT DÒNG vào hàng đợi (5 ms)
                                     ▼
              ◄── 202 Accepted ──────┘  ② trả về NGAY trong 200 ms
                 {"ma": "8412",
                  "thong_bao": "Đã nhận. Xong sẽ email cho bạn."}
                                     │
                              ┌──────▼──────┐
                              │  HÀNG ĐỢI   │  ← job xếp hàng ở đây
                              └──────┬──────┘
                       ┌─────────────┼─────────────┐
                       ▼             ▼             ▼
                  ┌─────────┐  ┌─────────┐  ┌─────────┐
                  │Worker 1 │  │Worker 2 │  │Worker 3 │
                  └────┬────┘  └─────────┘  └─────────┘
                       │ ③ render 4 phút (KHÔNG ai ngồi chờ)
                       ▼
                  ④ gửi email + cập nhật trạng thái

   Server thở. Website vẫn chạy. Cùng một công việc, cùng 4 phút,
   khác đúng một chỗ: NÓ KHÔNG CÒN CHẠY TRONG CÁI REQUEST NỮA.
```

## Bốn tính chất bắt buộc

Đây là khung để nhớ và để trả lời phỏng vấn. Bốn chữ: **T–A–S–V**.

### T — Tách nhận việc khỏi làm việc

```python
@app.post("/bao-cao", status_code=202)
def tao_bao_cao(req: BaoCaoRequest, user = Depends(dang_nhap)):
    ma = str(uuid7())
    db.execute(
        "INSERT INTO jobs (loai, payload, khoa_duy_nhat, user_id) "
        "VALUES (%s, %s, %s, %s) ON CONFLICT (khoa_duy_nhat) DO NOTHING",
        ("render_bao_cao", json.dumps(req.dict()), ma, user.id),
    )
    return {"ma": ma, "trang_thai": "da_nhan",
            "theo_doi": f"/bao-cao/{ma}/trang-thai"}
    # 200 ms thay vì 4 phút
```

Người dùng cần biết **tiến độ**, nên phải có đường theo dõi:

```python
@app.get("/bao-cao/{ma}/trang-thai")
def trang_thai(ma: str):
    j = db.lay_job(ma)
    return {"trang_thai": j.trang_thai,          # cho | dang_chay | xong | that_bai
            "tien_do": j.tien_do,                 # 0-100
            "ket_qua_url": j.ket_qua_url}
```

Ba cách báo kết quả cho người dùng, chọn theo hoàn cảnh:

```text
① Hỏi lại định kỳ (polling)  — đơn giản nhất, client gọi mỗi 2 giây
② SSE / WebSocket            — server đẩy khi xong, mượt hơn
③ Email / push notification  — cho job rất lâu (nhiều phút tới nhiều giờ)
```

### A — An toàn khi thất bại (thất bại là mặc định, không phải ngoại lệ)

**Job phải bất biến khi lặp.** Vì worker có thể chết **sau khi làm xong nhưng trước khi kịp đánh dấu hoàn thành**, và job sẽ được chạy lại.

```python
def render_bao_cao(job):
    ma = job["payload"]["ma"]

    if da_ton_tai_bao_cao(ma):          # ① HỎI TRƯỚC KHI LÀM
        return

    tam = f"/tmp/{ma}.pdf"
    render_ra_file(tam)
    os.rename(tam, f"/reports/{ma}.pdf")   # ② ĐỔI TÊN là thao tác NGUYÊN TỬ
    #  → không bao giờ có file dở dang bị coi là hoàn chỉnh
```

Hai kỹ thuật trong đoạn trên đáng nhớ: **hỏi trước khi làm** bằng khoá duy nhất, và **ghi ra file tạm rồi đổi tên** — vì đổi tên là thao tác nguyên tử ở tầng hệ thống file.

**Thử lại phải có nhịp:**

```sql
UPDATE jobs
SET trang_thai = 'cho',
    so_lan_thu = so_lan_thu + 1,
    chay_luc   = now() + (INTERVAL '1 second'
                          * pow(2, so_lan_thu)          -- backoff mũ
                          * (0.5 + random()))            -- jitter 50%-150%
WHERE job_id = $1 AND so_lan_thu < 5;
```

```text
   Vì sao cần JITTER?

   Không có jitter: 500 job cùng thất bại lúc 10:00:00
                    → cùng thử lại lúc 10:00:02
                    → cùng đè chết dịch vụ vừa hồi phục
                    → cùng thất bại → cùng thử lại lúc 10:00:06...

   Có jitter: chúng rải đều trong khoảng 1-3 giây → dịch vụ thở được.
```

**Thất bại hết cách thì vào nghĩa địa, không được im lặng vứt đi:**

```python
if job.so_lan_thu >= 5:
    db.execute(
        "INSERT INTO jobs_dlq (job_id, loai, payload, loi, so_lan_thu, vao_luc) "
        "SELECT job_id, loai, payload, %s, so_lan_thu, now() FROM jobs WHERE job_id=%s",
        (str(loi)[:2000], job.job_id))
    canh_bao_doi_truc(f"Job {job.job_id} chết sau 5 lần thử")
```

**Hàng đợi người chết** phải giữ: tên job, lỗi gì, **dữ liệu gốc còn nguyên vẹn** để chạy lại sau khi sửa bug, và có giao diện để bấm chạy lại.

### S — Song song bám theo máy thật, việc nặng có làn riêng

```text
   Một job gửi email     ≈ 0 CPU, vài mili giây
   Một job render video  ≈ 2 nhân CPU + 1,5 GB RAM, trong 20 phút

   HAI JOB ĐÓ KHÔNG THỂ CHUNG MỘT HÀNG ĐỢI.
```

Người mới hay chỉnh số worker như chỉnh âm lượng — càng to càng tốt. **20 worker trên 8 nhân CPU không làm gì nhanh hơn.** Nó chỉ khiến cả 20 cùng chậm, rồi OOM killer gõ cửa và bắn bừa một đứa.

```text
   Con số đúng KHÔNG nằm trong tài liệu. Nó nằm ở máy của bạn:

      worker = min( số_nhân_CPU / CPU_mỗi_job ,
                    RAM_khả_dụng / RAM_mỗi_job )

   Với render video: có khi là 2. Có khi là 1.
   Với gửi email (chờ mạng, không tốn CPU): có thể là 50.
```

**Tách hàng đợi theo tính chất công việc:**

```text
   queue:nhanh   → email, thông báo, webhook        (20 worker)
   queue:media   → render ảnh, video                ( 2 worker)
   queue:bao_cao → export, ETL                      ( 4 worker)

   Đừng bắt email ĐẶT LẠI MẬT KHẨU xếp hàng sau một job render 20 phút.
```

Và **hàng đợi ưu tiên** cho việc gấp:

```python
# Worker lấy việc: ưu tiên cao trước, nhưng không để việc thường chết đói
def lay_viec():
    for q in ["queue:gap", "queue:thuong", "queue:thap"]:
        job = lay_tu(q)
        if job: return job
    # Chống chết đói: cứ 10 lần thì bỏ qua hàng ưu tiên một lần
```

### V — Việc không đo được thì không sửa được

**Hai con số phải treo lên dashboard, và chúng quan trọng hơn cả CPU:**

```sql
SELECT
    count(*) FILTER (WHERE trang_thai = 'cho')          AS hang_doi_sau,
    EXTRACT(epoch FROM (now() - min(chay_luc)))
        FILTER (WHERE trang_thai = 'cho')               AS phieu_gia_nhat_giay,
    count(*) FILTER (WHERE trang_thai = 'that_bai')     AS so_that_bai
FROM jobs;
```

```text
   ① Hàng đợi SÂU bao nhiêu?
   ② PHIẾU GIÀ NHẤT nằm đó bao lâu rồi?   ◄── con số KHÁCH HÀNG cảm nhận được

   Hàng đợi sâu mà đi NGANG → ổn, worker theo kịp.
   Hàng đợi sâu mà DỐC LÊN → hoặc thiếu worker,
                              hoặc CÓ MỘT JOB ĐANG CHẾT ĐI CHẾT LẠI
                              và kéo cả hàng theo nó.
```

**Và mọi job phải có thời hạn cứng:**

```sql
-- Job hết hạn mà chưa xong → thu hồi cho worker khác
UPDATE jobs SET trang_thai = 'cho', so_lan_thu = so_lan_thu + 1
WHERE trang_thai = 'dang_chay' AND het_han_luc < now();
```

Một job không có thời hạn là một job **chạy mãi mãi** — và nó giữ luôn cái worker đó khỏi nhận việc mới.

## Chọn công cụ: Redis, RabbitMQ, Kafka hay database?

### PostgreSQL làm hàng đợi — đủ cho đa số hệ thống

Bạn không cần Kafka ngay từ đầu.

```sql
CREATE TABLE jobs (
    job_id        BIGSERIAL PRIMARY KEY,
    loai          TEXT        NOT NULL,
    payload       JSONB       NOT NULL,
    khoa_duy_nhat TEXT        UNIQUE,        -- idempotency
    trang_thai    TEXT        NOT NULL DEFAULT 'cho',
    uu_tien       INT         NOT NULL DEFAULT 0,
    so_lan_thu    INT         NOT NULL DEFAULT 0,
    chay_luc      TIMESTAMPTZ NOT NULL DEFAULT now(),
    het_han_luc   TIMESTAMPTZ,
    loi           TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index CHỈ trên job đang chờ → nhỏ và nhanh dù bảng có triệu dòng
CREATE INDEX jobs_cho_idx ON jobs (uu_tien DESC, chay_luc)
    WHERE trang_thai = 'cho';
```

```sql
-- Worker lấy việc — CHÌA KHOÁ nằm ở SKIP LOCKED
BEGIN;
SELECT job_id, loai, payload
FROM jobs
WHERE trang_thai = 'cho' AND chay_luc <= now()
ORDER BY uu_tien DESC, chay_luc
LIMIT 1
FOR UPDATE SKIP LOCKED;          -- ◄── bỏ qua dòng worker khác đang giữ

UPDATE jobs SET trang_thai='dang_chay', het_han_luc = now() + INTERVAL '30 min'
WHERE job_id = $1;
COMMIT;
```

```text
   KHÔNG có SKIP LOCKED:             CÓ SKIP LOCKED:
     W1 → job 1 (khoá)                 W1 → job 1
     W2 → CHỜ job 1...                 W2 → bỏ qua 1, lấy job 2
     W3 → CHỜ job 1...                 W3 → bỏ qua 1,2, lấy job 3
     → thông lượng = 1 worker          → thông lượng = N worker
```

**Ưu điểm lớn nhất của cách này:** job và dữ liệu nghiệp vụ nằm **trong cùng một transaction** — không bao giờ có chuyện tạo đơn hàng thành công mà job gửi email biến mất.

### Bảng so sánh

| | PostgreSQL | Redis | RabbitMQ | Kafka |
|---|---|---|---|---|
| Thông lượng | ~1.000/s | ~50.000/s | ~20.000/s | **~1.000.000/s** |
| Bền vững | ✅ Mạnh nhất | ⚠️ Tuỳ cấu hình | ✅ | ✅ |
| Transaction chung với dữ liệu | ✅ **Có** | ❌ | ❌ | ❌ |
| Ưu tiên, lịch chạy sau | ✅ Dễ (SQL) | ⚠️ | ✅ | ❌ |
| Nhiều consumer đọc cùng dữ liệu | ❌ | ❌ | ⚠️ | ✅ **Fan-out** |
| Phát lại lịch sử | ❌ | ❌ | ❌ | ✅ **Có** |
| Vận hành | ✅ Đã có sẵn | Dễ | Trung bình | **Khó** |
| Phù hợp | **Mặc định** | Job nhẹ, nhanh | Định tuyến phức tạp | Luồng sự kiện lớn |

**Lời khuyên:** bắt đầu bằng **PostgreSQL + `SKIP LOCKED`**. Chuyển sang Kafka khi cần **fan-out nhiều consumer** hoặc **phát lại lịch sử** — đó mới là thứ Kafka giỏi, không phải chỉ vì nó nhanh hơn.

## Ba mẫu thiết kế quan trọng

### ① Outbox — ghi database và gửi message một cách nhất quán

```text
   VẤN ĐỀ: bạn cần ghi đơn hàng vào DB VÀ gửi message sang Kafka.
           Ghi xong mà gửi hỏng → hai hệ thống lệch nhau.
           Gửi xong mà ghi hỏng → còn tệ hơn.
           Không có transaction phân tán nào rẻ cả.
```

```sql
-- ✅ Ghi CẢ HAI trong CÙNG một transaction
BEGIN;
INSERT INTO orders (...) VALUES (...) RETURNING order_id;
INSERT INTO outbox (topic, payload)
VALUES ('order.created', jsonb_build_object('order_id', $1));
COMMIT;   -- ◄── nguyên tử: hoặc cả hai, hoặc không gì cả

-- Một tiến trình riêng đọc outbox và đẩy đi, rồi đánh dấu đã gửi
-- (hoặc dùng CDC/Debezium đọc thẳng WAL — không cần polling)
```

### ② Saga — thay thế cho transaction xuyên dịch vụ

```text
   Đặt hàng cần: trừ ví (dịch vụ A) + trừ kho (B) + tạo đơn (C)
   Ba dịch vụ, ba database. Không có transaction chung.

   SAGA = chuỗi bước cục bộ, mỗi bước có HÀNH ĐỘNG BÙ TRỪ:

      Bước 1: trừ ví      ↺ bù: hoàn tiền
      Bước 2: trừ kho     ↺ bù: hoàn kho
      Bước 3: tạo đơn     ↺ bù: huỷ đơn

   Bước 3 lỗi → chạy bù bước 2, rồi bù bước 1.

   ⚠️ Không có atomicity thật — chỉ có "nhất quán sau cùng có bù trừ".
      Ứng dụng phải tự lo idempotency và trạng thái trung gian.
```

### ③ Backpressure — biết nói "chậm lại"

```python
NGUONG_TU_CHOI = 10_000

@app.post("/bao-cao")
def tao_bao_cao(...):
    sau = queue.do_sau()
    if sau > NGUONG_TU_CHOI:
        raise HTTPException(503, "Hệ thống đang quá tải, vui lòng thử lại sau",
                            headers={"Retry-After": "300"})
    ...
```

**Từ chối sớm còn tử tế hơn nhận vào rồi để họ chờ ba tiếng.** Đây là điểm nhiều người bỏ qua: hàng đợi vô hạn không phải tính năng, nó chỉ là cách giấu vấn đề cho tới lúc nó nổ.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Hàng đợi có 200.000 job tồn đọng. Thêm worker vào thì database sập vì quá tải kết nối.

**Chẩn đoán:** worker không phải nút thắt — **database mới là nút thắt**.

```text
   ① Đo trước: worker đang chờ ở đâu?
      → Nếu chờ DB thì thêm worker chỉ làm tệ hơn.

   ② Kiểm tra kết nối: 50 worker × 5 kết nối = 250 kết nối
      → vượt max_connections. Dùng PgBouncer, giảm pool mỗi worker.

   ③ Gộp thao tác theo lô thay vì từng cái:
```

```python
# ❌ 1.000 job = 1.000 lần round-trip
for j in jobs:
    db.execute("UPDATE ... WHERE id=%s", j.id)

# ✅ Gộp thành một lệnh
db.execute("UPDATE t SET x=v.x FROM (VALUES %s) AS v(id,x) WHERE t.id=v.id",
           [(j.id, j.x) for j in jobs])
```

```text
   ④ Nếu vẫn tồn đọng: XẢ TẢI CÓ CHỌN LỌC
      - Job đã quá hạn ý nghĩa (thông báo khuyến mãi hôm qua) → bỏ hẳn
      - Ưu tiên job liên quan tới tiền và trải nghiệm trực tiếp
      - Tạm dừng producer của loại job ít quan trọng
```

> **Tình huống 2:** Job gửi email thỉnh thoảng gửi **hai lần** cho cùng một người.

**Nguyên nhân:** hầu hết hệ thống hàng đợi đảm bảo **ít nhất một lần**, không phải **đúng một lần**.

```text
   Vì sao "đúng một lần" gần như không tồn tại?

   Worker làm xong việc → mạng đứt trước khi kịp báo "đã xong"
   → Broker tưởng job thất bại → giao cho worker khác.

   Không có cách nào phân biệt "làm xong rồi mất tín hiệu"
   với "chưa làm xong" từ phía broker.

   → LỜI GIẢI KHÔNG NẰM Ở BROKER, NÓ NẰM Ở JOB:
     làm cho job BẤT BIẾN KHI LẶP.
```

```python
def gui_email(job):
    khoa = f"{job['loai']}:{job['user_id']}:{job['ma_su_kien']}"
    # Chèn khoá TRƯỚC — trùng nghĩa là đã gửi rồi
    n = db.execute(
        "INSERT INTO email_da_gui (khoa, gui_luc) VALUES (%s, now()) "
        "ON CONFLICT (khoa) DO NOTHING", (khoa,)).rowcount
    if n == 0:
        return                      # đã gửi, bỏ qua lặng lẽ
    smtp.send(...)
```

**Lưu ý thứ tự:** chèn khoá **trước** khi gửi. Nếu gửi trước rồi mới chèn, worker chết ở giữa sẽ gửi lại lần nữa.

> **Tình huống 3:** Một job chạy được 3 tiếng thì bị kill. Không ai biết. Trên màn hình khách hàng cái vòng tròn vẫn quay.

**Đây là cái đắt nhất của hệ thống hàng đợi: job chết âm thầm.**

```text
   ✅ Ba lớp chống:

   ① THỜI HẠN CỨNG cho mọi job (het_han_luc)
      + job quét định kỳ thu hồi job quá hạn về trạng thái 'cho'

   ② HEARTBEAT cho job dài
      Worker cập nhật `het_han_luc` mỗi 30 giây trong lúc chạy
      → job treo thật sự sẽ hết hạn, job đang chạy thì không bị thu hồi nhầm

   ③ TRẠNG THÁI CUỐI PHẢI LUÔN CÓ
      Mọi job đều kết thúc ở 'xong' hoặc 'that_bai' — không có trạng thái
      'dang_chay' vĩnh viễn. Có alert cho job ở 'dang_chay' quá lâu.
```

```python
def chay_job_dai(job):
    def nhip_tim():
        while dang_chay:
            db.execute("UPDATE jobs SET het_han_luc = now() + INTERVAL '2 min' "
                       "WHERE job_id = %s", (job.id,))
            time.sleep(30)
    threading.Thread(target=nhip_tim, daemon=True).start()
    ...
```

## Cái giá của hàng đợi — thứ chưa ai nói với bạn

> **Hàng đợi KHÔNG làm công việc chạy nhanh hơn.** Báo cáo vẫn mất 4 phút. Bạn chỉ vừa **dời chỗ ngồi chờ, từ trước mặt ra sau lưng**.

Và bạn vừa mua về một **hệ thống phân tán**:

```text
   ✗ Trạng thái job phải tự lưu và tự quản lý
   ✗ Worker phải deploy, giám sát, scale riêng
   ✗ Một loại bug mới: BUG BẤT ĐỒNG BỘ — thứ không tái hiện được trên máy bạn
   ✗ Debug khó hơn: một luồng nghiệp vụ giờ nằm ở hai nơi
   ✗ Và đắt nhất: JOB CHẾT ÂM THẦM
```

**Nên đừng ném mọi thứ vào hàng đợi.**

```text
   Việc chạy DƯỚI MỘT GIÂY và không ai chết nếu nó thất bại
   → ĐỂ YÊN ĐÓ, trong request.

   Đưa ra hàng đợi khi:
   ✅ Chạy lâu hơn ~2 giây
   ✅ Gọi dịch vụ bên ngoài có thể chậm hoặc hỏng
   ✅ Có thể thử lại được
   ✅ Người dùng không cần kết quả ngay lập tức
   ✅ Tốn nhiều CPU/RAM (render, nén, ML)
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Làm việc nặng trong request | 504, người dùng bấm lại, CPU cháy, sập cả site | Trả `202` + đẩy ra hàng đợi |
| Job không bất biến khi lặp | Gửi email 2 lần, trừ tiền 2 lần | Khoá duy nhất, chèn **trước** khi làm |
| Không có `SKIP LOCKED` | N worker xếp hàng chờ nhau = 1 worker | `FOR UPDATE SKIP LOCKED` |
| Thử lại không có backoff/jitter | Sóng retry đè chết dịch vụ vừa hồi phục | Backoff mũ + jitter 50–150% |
| Thất bại rồi vứt im lặng | Mất dữ liệu, không ai biết | **DLQ** giữ nguyên payload gốc |
| Job không có thời hạn | Treo worker vĩnh viễn | `het_han_luc` + job thu hồi + heartbeat |
| Tăng worker để chạy nhanh hơn | OOM, mọi job cùng chậm | Tính theo CPU/RAM mỗi job |
| Job nặng và nhẹ chung hàng đợi | Email đặt lại mật khẩu chờ sau render 20 phút | Tách hàng đợi theo tính chất |
| Chỉ giám sát độ sâu hàng đợi | Không thấy job già nhất chờ bao lâu | Giám sát **cả hai** |
| Hàng đợi vô hạn | Giấu vấn đề tới lúc nó nổ | **Backpressure** — từ chối sớm |
| Ghi DB và gửi message riêng lẻ | Hai hệ thống lệch nhau | **Outbox pattern** |
| Trông chờ "đúng một lần" từ broker | Không tồn tại | Làm job bất biến khi lặp |
| Ném mọi thứ vào hàng đợi | Mua về hệ phân tán không cần thiết | Việc < 1 giây thì để nguyên |

## Câu hỏi phỏng vấn hay gặp

**H: Vì sao phải đưa việc nặng ra khỏi request?**
Vì request có thời hạn — trình duyệt hoặc gateway sẽ timeout, nhưng công việc **vẫn chạy tiếp ở phía sau**. Người dùng thấy lỗi nên bấm lại, và giờ bạn có N tiến trình cùng làm một việc nặng trên cùng một máy. CPU cháy, và cả website sập kể cả những trang không liên quan. Cách chữa là **tách nhận việc khỏi làm việc**: trả `202 Accepted` kèm mã theo dõi trong 200 ms, còn worker xử lý ở phía sau.

**H: Bốn tính chất bắt buộc của hệ thống hàng đợi là gì?**
**Tách** nhận việc khỏi làm việc và có đường theo dõi tiến độ. **An toàn khi thất bại**: job bất biến khi lặp, thử lại có backoff mũ và jitter, thất bại hết cách thì vào DLQ chứ không vứt im lặng. **Song song bám theo máy thật** — con số worker tính từ CPU và RAM mỗi job, không phải càng nhiều càng tốt — và việc nặng phải có làn riêng. **Việc đo được**: độ sâu hàng đợi và **tuổi của phiếu già nhất**, con số thứ hai mới là thứ khách hàng cảm nhận.

**H: Làm hàng đợi bằng PostgreSQL được không?**
Được, và với đa số hệ thống là đủ. Chìa khoá là **`SELECT ... FOR UPDATE SKIP LOCKED`** — nó cho worker bỏ qua dòng đang bị worker khác giữ thay vì xếp hàng chờ; không có nó thì N worker biến thành 1 worker. Ưu điểm lớn nhất là **job và dữ liệu nghiệp vụ nằm trong cùng một transaction**, nên không bao giờ có chuyện tạo đơn thành công mà job gửi email biến mất. Chỉ chuyển sang Kafka khi cần **fan-out nhiều consumer** hoặc **phát lại lịch sử** — đó mới là thứ Kafka giỏi.

**H: Vì sao email bị gửi hai lần?**
Vì hầu hết hệ thống hàng đợi đảm bảo **ít nhất một lần**, không phải đúng một lần. Worker làm xong rồi mạng đứt trước khi kịp báo — broker không phân biệt được "làm xong mà mất tín hiệu" với "chưa làm xong", nên nó giao lại. **Lời giải không nằm ở broker mà nằm ở job**: dùng khoá duy nhất, chèn khoá **trước** khi gửi, trùng thì bỏ qua. Nếu gửi trước rồi mới chèn thì worker chết ở giữa vẫn gửi lại.

**H: Hàng đợi có nhược điểm gì?**
Nó **không làm công việc chạy nhanh hơn** — chỉ dời chỗ ngồi chờ. Đổi lại bạn mua về một hệ phân tán: trạng thái job phải tự quản lý, worker phải deploy và giám sát riêng, và một loại bug mới không tái hiện được trên máy dev. Đắt nhất là **job chết âm thầm** — chạy ba tiếng rồi bị kill, không ai biết, và vòng tròn trên màn hình khách hàng vẫn quay. Chống bằng thời hạn cứng, heartbeat cho job dài, và alert cho job ở trạng thái đang chạy quá lâu.

**H: Khi nào KHÔNG nên dùng hàng đợi?**
Việc chạy dưới một giây và không ai chết nếu nó thất bại thì để nguyên trong request — đưa ra hàng đợi chỉ thêm độ phức tạp mà không được gì. Đưa ra hàng đợi khi việc chạy lâu hơn vài giây, gọi dịch vụ bên ngoài có thể hỏng, thử lại được, người dùng không cần kết quả ngay, hoặc tốn nhiều CPU/RAM.

## Tóm tắt bài 4

- Việc nặng chạy trong request sẽ gây **504 → người dùng bấm lại → N tiến trình cùng chạy → sập cả site**. Trả `202` và đẩy ra hàng đợi.
- Bốn tính chất **T–A–S–V**: **Tách** nhận việc khỏi làm việc, **An toàn khi thất bại**, **Song song bám máy thật**, **Việc đo được**.
- Job phải **bất biến khi lặp** — chèn khoá duy nhất **trước** khi làm; và ghi file tạm rồi **đổi tên** vì đổi tên là thao tác nguyên tử.
- Thử lại phải có **backoff mũ + jitter**; thất bại hết cách thì vào **DLQ** giữ nguyên payload gốc.
- **Số worker = min(CPU khả dụng / CPU mỗi job, RAM khả dụng / RAM mỗi job)** — không phải càng nhiều càng tốt. Việc nặng có **làn riêng**.
- Đo **độ sâu hàng đợi** và **tuổi phiếu già nhất**; hàng đợi dốc lên nghĩa là thiếu worker hoặc có job đang chết đi chết lại.
- **PostgreSQL + `SKIP LOCKED`** là mặc định đủ tốt; Kafka khi cần **fan-out** hoặc **phát lại lịch sử**.
- Ba mẫu quan trọng: **Outbox** (ghi DB và message nguyên tử), **Saga** (bù trừ thay transaction xuyên dịch vụ), **Backpressure** (từ chối sớm còn tử tế hơn để chờ ba tiếng).

**Bài kế tiếp** → [Bài 5: Thiết kế REST API chịu tải](05-thiet-ke-rest-api-chiu-tai.md)
