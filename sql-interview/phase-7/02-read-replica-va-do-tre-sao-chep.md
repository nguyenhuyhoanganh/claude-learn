# Bài 2: Read replica và độ trễ sao chép

21 giờ 30. Lan chuyển 2 triệu tiền nhà cho chủ trọ. Màn hình hiện chữ xanh: **giao dịch thành công**. Lan thở phào, kéo màn hình xuống làm mới lại cho chắc.

Số dư vẫn y nguyên. Như thể 2 triệu kia chưa từng rời khỏi tài khoản.

Lan kéo xuống lần nữa. Vẫn thế. Một ý nghĩ tồi tệ hiện ra: *chắc mạng lỗi*. Lan hít một hơi, bấm chuyển lần thứ hai.

Cả hai lần đều thành công. Chủ trọ nhận 4 triệu.

Không có giao dịch nào trượt. **Chỉ có màn hình của Lan là nói dối cô ấy** — và cái màn hình đó không hề bị lỗi. Nó đang làm đúng thứ bạn đã bảo nó làm.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Replication** | rép-li-kê-shân | **Sao chép** — nhân bản dữ liệu sang máy khác |
| **Primary** | prai-ma-ri | **Máy chính** — nơi duy nhất nhận lệnh ghi |
| **Replica / Standby** | rép-li-ka | **Bản sao** — chỉ đọc, chép lại từ máy chính |
| **WAL** (*Write-Ahead Log*) | oan | **Nhật ký ghi trước** — dòng thay đổi mà replica chép lại |
| **Replay** | ri-plây | **Áp dụng lại** — replica thực thi WAL để cập nhật dữ liệu thật |
| **Replication lag** | | **Độ trễ sao chép** — bản sao đang cũ hơn máy chính bao nhiêu |
| **LSN** (*Log Sequence Number*) | eo-ét-en | **Vị trí trong dòng WAL** — như số trang của cuốn nhật ký |
| **Read-after-write** | | Đọc lại ngay thứ **chính mình vừa ghi** — lệnh đọc nguy hiểm nhất |
| **Monotonic read** | mô-nô-tô-nịc | **Đọc đơn điệu** — không bao giờ thấy thời gian đi lùi |
| **`synchronous_commit`** | sin-cro-nớt | Núm chỉnh `COMMIT` chờ replica xác nhận tới mức nào |
| **Failover** | phêu-ô-vơ | **Chuyển vai** — replica lên làm máy chính khi máy chính chết |
| **p99** | pi-nai-nai | **Phân vị 99** — 99% request nhanh hơn con số này |

## Vì sao có replica, và cái giá kèm theo

Ban đầu ứng dụng chỉ có một database. Mọi lệnh ghi vào nó, mọi lệnh đọc ra từ nó. Không bao giờ sai.

Rồi người dùng đông lên. Một triệu lượt đọc mỗi phút đổ vào đúng một cái máy. CPU chạm trần. Bạn nâng RAM, nâng CPU, và vẫn không đủ.

Nên bạn làm cái ai cũng làm: **dựng thêm máy và chép dữ liệu sang**.

```text
                    ┌─────────────┐
      GHI ────────► │   PRIMARY   │  (máy chính, một mình gánh mọi lệnh ghi)
                    └──────┬──────┘
                           │ WAL stream (dòng nhật ký ghi)
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ REPLICA1 │ │ REPLICA2 │ │ REPLICA3 │   (bản sao, chỉ đọc)
        └──────────┘ └──────────┘ └──────────┘
              ▲            ▲            ▲
              └────────────┴────────────┘
                        ĐỌC
```

Ghi một chỗ, đọc trăm chỗ. Chi phí rẻ, mở rộng dễ. Nhưng có một chi tiết mà tài liệu quảng cáo không in đậm:

> **Việc chép dữ liệu từ máy chính sang bản sao không xảy ra tức thì. Và trong khoảng thời gian đó, hai cái máy nói hai sự thật khác nhau.**

## Cơ chế: WAL đi qua bốn chặng, mỗi chặng là một nguồn trễ

```text
1. WRITE   — primary ghi WAL vào file cục bộ
2. FLUSH   — primary fsync xuống đĩa
3. SEND    — gửi WAL qua mạng tới replica
4. WRITE   — replica ghi WAL nhận được
5. FLUSH   — replica fsync
6. REPLAY  — replica ÁP DỤNG thay đổi vào dữ liệu thật  ◄── chỉ tới đây query mới thấy
```

Chặng cuối cùng là chặng quan trọng nhất và hay bị bỏ qua: **WAL đã tới replica không có nghĩa là query trên replica đã thấy dữ liệu**. Nó phải được *replay* xong.

Đo bằng câu này — nên đặt vào dashboard ngay hôm nay:

```sql
-- Chạy TRÊN REPLICA
SELECT
    CASE WHEN pg_is_in_recovery() THEN
        EXTRACT(epoch FROM (now() - pg_last_xact_replay_timestamp()))
    END AS do_tre_giay,
    pg_last_wal_receive_lsn()  AS da_nhan,
    pg_last_wal_replay_lsn()   AS da_ap_dung,
    pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) AS byte_ton_dong;
```

```sql
-- Chạy TRÊN PRIMARY: xem từng replica trễ bao nhiêu ở từng chặng
SELECT client_addr, state, sync_state,
       write_lag, flush_lag, replay_lag
FROM pg_stat_replication;
```

Hai đại lượng khác nhau, đừng lẫn:
- **Trễ theo byte** (`byte_ton_dong`): replica còn nợ bao nhiêu WAL.
- **Trễ theo thời gian** (`do_tre_giay`): dữ liệu trên replica cũ bao nhiêu giây.

Trễ theo byte lớn mà trễ theo thời gian nhỏ nghĩa là vừa có một đợt ghi lớn — không đáng lo. Trễ theo thời gian tăng đều mới là báo động.

## Độ trễ không phải hằng số — nó là một phân phối có đuôi rất dài

Đây là chỗ hầu hết người thiết kế sai.

```text
Đồ thị độ trễ replica của một hệ thống thật, 24 giờ:

  giây
  2.5 │                                              ╱▔▔╲
  2.0 │                                            ╱      ╲
  1.5 │                                          ╱          ╲
  1.0 │                                        ╱              ╲
  0.5 │                                     ╱                   ╲
  0.0 │▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁                       ╲▁▁▁
      └────────────────────────────────────────────────────────────────
       0h    4h    8h    12h   16h        20h  21h  22h  23h

  Trung bình cả ngày: 8 ms
  Đỉnh lúc 21h:       2.400 ms
```

Bạn thiết kế theo con số trung bình, rồi chết ở cái đuôi. **Và cái đuôi mới là chỗ có người dùng** — vì đuôi xuất hiện đúng giờ cao điểm.

Bốn thứ làm độ trễ phình lên, và chúng hay tới cùng lúc:

| Nguyên nhân | Cơ chế |
|---|---|
| Đợt ghi lớn đột ngột | WAL sinh ra nhanh hơn tốc độ replica replay |
| Query nặng chạy trên replica | Replay phải chờ, vì nó xung đột với query đang đọc |
| Mạng giữa hai vùng nghẽn | Chặng SEND chậm |
| `VACUUM`/`REINDEX` trên primary | Sinh lượng WAL khổng lồ |
| Replica chạy trên phần cứng yếu hơn | **Replay là đơn luồng** — CPU một nhân là nút thắt |

Điểm cuối rất quan trọng và ít người biết: **quá trình replay WAL trong PostgreSQL chạy đơn luồng**. Primary có 32 nhân ghi song song, replica chỉ có một nhân replay. Đây là lý do replica có thể không bao giờ đuổi kịp dù phần cứng "giống hệt".

## Vấn đề thật: đọc-sau-khi-ghi (read-after-write)

Không phải mọi lệnh đọc đều nguy hiểm như nhau.

```text
Bạn của Lan xem số dư của Lan mà trễ 200 ms  → không ai chết cả.

Chính Lan xem số dư của CHÍNH LAN mà trễ    → đó là phản bội.
```

Chú ý cụm **"tự tay"**. Con người không tin server. Con người tin cái mắt mình nhìn thấy. Màn hình nói tiền chưa đi, thì tiền chưa đi — không có mã giao dịch nào cãi lại được điều đó. **Mắt thắng.**

Và người tin mắt mình sẽ làm việc hợp lý nhất: **họ bấm lại**. Đơn trùng, giao dịch trùng, bình luận trùng.

Một cú kéo màn hình làm mới của con người mất khoảng 100 ms. **Bạn nhanh hơn bản sao của chính mình** — và đó là toàn bộ vấn đề.

### Biến thể ác hơn: thời gian đi lùi (monotonic read)

```text
Lần đọc 1 → rơi vào replica NHANH  → thấy số dư 3.000.000 (tiền đã đi)
Lần đọc 2 → rơi vào replica CHẬM   → thấy số dư 5.000.000 (tiền quay về)
```

Với người dùng, **thời gian vừa đi lùi**. Đây gọi là vi phạm **monotonic read** (đọc đơn điệu), và nó xảy ra bất cứ khi nào bạn có nhiều replica sau một bộ cân tải mà không ghim phiên.

## Năm cách xử lý, xếp theo độ mạnh và chi phí

### ① Ghim phiên vào primary trong một khoảng thời gian

Đơn giản nhất, giải quyết 90% trường hợp.

```python
GHIM_GIAY = 5

def sau_khi_ghi(user_id):
    redis.setex(f"ghim_primary:{user_id}", GHIM_GIAY, "1")

def chon_ket_noi(user_id):
    if redis.exists(f"ghim_primary:{user_id}"):
        return primary          # đọc từ máy chính trong 5 giây sau khi ghi
    return replica_ngau_nhien()
```

**Đánh đổi:** 5 giây là con số đoán. Nếu độ trễ vọt lên 8 giây thì vẫn thủng. Và nếu nhiều người cùng ghi thì primary lại gánh nhiều đọc.

### ② Ghim theo LSN — chính xác, không đoán

Đây là cách đúng nhất và là câu trả lời làm bạn nổi bật.

**LSN** (*Log Sequence Number*) là vị trí trong dòng WAL — như số trang của cuốn nhật ký.

```python
def ghi_giao_dich(conn_primary, ...):
    with conn_primary.transaction():
        conn_primary.execute("UPDATE tai_khoan SET so_du = so_du - %s ...", ...)
    # Lấy vị trí WAL SAU KHI commit
    lsn = conn_primary.execute("SELECT pg_current_wal_lsn()").fetchone()[0]
    luu_vao_session(user_id, lsn)      # cookie / Redis / JWT claim
    return lsn

def doc(user_id):
    lsn_can = lay_tu_session(user_id)
    if lsn_can:
        for r in danh_sach_replica():
            da_ap_dung = r.execute("SELECT pg_last_wal_replay_lsn()").fetchone()[0]
            if da_ap_dung >= lsn_can:
                return r               # replica này ĐÃ CHẮC CHẮN có thay đổi của bạn
        return primary                 # chưa replica nào kịp → về primary
    return replica_ngau_nhien()
```

Không đoán, không hằng số ma thuật. Người dùng luôn thấy đúng ít nhất những gì chính họ vừa ghi.

MySQL có cơ chế tương đương với GTID:
```sql
SELECT WAIT_FOR_EXECUTED_GTID_SET('uuid:1-1234', 1);   -- chờ tối đa 1 giây
```

### ③ Sao chép đồng bộ cho một số giao dịch

```sql
-- Cấu hình
synchronous_standby_names = 'ANY 1 (replica1, replica2)';

-- Mặc định cả hệ thống chạy bất đồng bộ (nhanh)
SET synchronous_commit = 'off';

-- Riêng giao dịch tiền thì chờ replica xác nhận
BEGIN;
SET LOCAL synchronous_commit = 'remote_apply';   -- chờ tới khi replica ĐÃ REPLAY
UPDATE tai_khoan SET so_du = so_du - 2000000 WHERE id = 1;
COMMIT;   -- chỉ trả về khi ít nhất 1 replica đã áp dụng xong
```

Các mức của `synchronous_commit`, từ nhanh tới an toàn:

| Mức | `COMMIT` trả về khi | Độ trễ thêm |
|---|---|---|
| `off` | WAL mới nằm trong bộ nhớ primary | 0 (có thể mất dữ liệu khi sập) |
| `local` | primary đã fsync | ~1 ms |
| `remote_write` | replica đã nhận và ghi (chưa fsync) | + RTT mạng |
| `on` (mặc định khi có sync standby) | replica đã fsync | + RTT + fsync |
| `remote_apply` | replica đã **replay xong** | + RTT + fsync + replay |

**Đánh đổi nghiêm trọng:** `remote_apply` khiến mỗi `COMMIT` phụ thuộc vào sức khoẻ của replica. Replica chậm thì primary chậm theo; replica chết mà không có replica thay thế thì **primary treo hoàn toàn**. Luôn cấu hình `ANY 1 (...)` với ít nhất hai ứng viên.

### ④ Định tuyến theo ngữ nghĩa của từng loại truy vấn

```python
DOC_TU_PRIMARY = {                  # phải luôn mới nhất
    "so_du_tai_khoan", "ton_kho_khi_dat_hang",
    "trang_thai_don_vua_tao", "gio_hang",
}
DOC_TU_REPLICA = {                  # trễ vài giây không sao
    "danh_sach_san_pham", "bao_cao", "lich_su_don_cu",
    "goi_y", "thong_ke_dashboard",
}
```

Đây là cách rẻ nhất và nên làm trước tiên: **phân loại truy vấn theo mức chịu đựng độ cũ**, không phải theo "đọc hay ghi".

### ⑤ Không đọc lại — trả kết quả ngay từ lệnh ghi

Cách rẻ nhất và thường bị bỏ qua:

```sql
-- Thay vì UPDATE rồi SELECT lại, lấy luôn kết quả từ lệnh ghi
UPDATE tai_khoan SET so_du = so_du - 2000000
WHERE id = 1 AND so_du >= 2000000
RETURNING so_du, updated_at;
```

Ứng dụng hiển thị thẳng giá trị `RETURNING` cho người dùng. Không có lần đọc nào, không có replica nào tham gia, không có cửa sổ nào để sai.

## Bảng chọn chiến lược

| Loại đọc | Chiến lược | Chi phí |
|---|---|---|
| Người dùng vừa tự tay ghi | Ghim LSN, hoặc `RETURNING` | Thấp |
| Số dư, tồn kho, trạng thái đơn | Luôn primary | Tải lên primary |
| Danh sách, tìm kiếm, gợi ý | Replica thoải mái | Không |
| Báo cáo, dashboard, ETL | Replica **riêng**, có thể trễ nhiều | Không |
| Giao dịch tiền quan trọng | `remote_apply` cho riêng nó | Độ trễ ghi tăng |
| Nhiều replica sau load balancer | Ghim phiên vào **một** replica (monotonic read) | Thấp |

## Ba vấn đề vận hành khác của replica

**① Query dài trên replica bị huỷ.** Replay WAL có thể xoá dòng mà query đang đọc:

```text
ERROR: canceling statement due to conflict with recovery
DETAIL: User query might have needed to see row versions that must be removed.
```

Hai cách chữa, mỗi cách một giá:
```sql
max_standby_streaming_delay = 30s   -- cho query 30 giây, đổi lại replay bị hoãn → trễ tăng
hot_standby_feedback = on           -- replica báo primary "đừng vacuum dòng này"
                                    -- → primary bị bloat vì giữ dòng chết
```

**② Replica không giảm tải ghi.** Đây là hiểu lầm phổ biến: replica chỉ giảm tải **đọc**. Mọi lệnh ghi vẫn dồn về một máy, và replica còn phải replay **toàn bộ** lượng ghi đó. Nếu nút thắt là ghi, replica không giúp gì — bạn cần **sharding** (bài 4).

**③ Failover làm mất dữ liệu đã commit.** Với sao chép bất đồng bộ, khi primary chết đột ngột, phần WAL chưa kịp gửi đi sẽ **mất vĩnh viễn** — kể cả giao dịch đã báo thành công cho người dùng. Đây là đánh đổi có ý thức: chấp nhận mất vài trăm mili giây dữ liệu để đổi lấy tốc độ ghi. Nếu không chấp nhận được thì phải dùng sao chép đồng bộ.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Bộ phận CSKH báo *"nhiều khách phản ánh chuyển tiền hai lần"*. Log giao dịch cho thấy hai giao dịch cách nhau **8 giây**, cùng số tiền, cùng người nhận.

**Chẩn đoán — ba câu lệnh chỉ đúng thủ phạm:**

```sql
-- ① Độ trễ replica lúc đó bao nhiêu? (chạy TRÊN REPLICA)
SELECT EXTRACT(epoch FROM (now() - pg_last_xact_replay_timestamp())) AS tre_giay;
-- 2.4  → đang trễ 2,4 GIÂY

-- ② Đỉnh trễ 30 ngày qua — con số này mới quan trọng
SELECT max(lag_seconds), date_trunc('hour', ts) AS gio
FROM replication_lag_history
WHERE ts > now() - INTERVAL '30 days'
GROUP BY 2 ORDER BY 1 DESC LIMIT 5;
--  9.2 | 21:00   ◄── giờ cao điểm chuyển tiền, trễ tới 9 GIÂY

-- ③ Giao dịch trùng có rơi vào cửa sổ đó không?
SELECT from_user, count(*), max(created_at) - min(created_at) AS cach_nhau
FROM transactions
WHERE created_at > now() - INTERVAL '7 days'
GROUP BY from_user, to_user, amount, date_trunc('minute', created_at)
HAVING count(*) > 1;
```

```text
   KẾT LUẬN: người dùng ghi vào PRIMARY, đọc lại từ REPLICA còn cũ 9 giây
   → màn hình vẫn hiện số dư cũ
   → họ tin mắt mình, bấm chuyển lần nữa.
```

**Cách xử lý — bốn lớp, xếp theo chi phí:**

```python
# ① RẺ NHẤT: không đọc lại. Lấy kết quả NGAY từ lệnh ghi.
row = db_primary.execute(
    "UPDATE tai_khoan SET so_du = so_du - %s "
    "WHERE id = %s AND so_du >= %s RETURNING so_du, updated_at",
    (tien, uid, tien)).fetchone()
if row is None:
    raise SoDuKhongDu()
return {"so_du_moi": row.so_du}      # hiển thị THẲNG, không query lại
```

```python
# ② CHÍNH XÁC NHẤT: ghim theo LSN
lsn = db_primary.execute("SELECT pg_current_wal_lsn()").fetchone()[0]
session["read_lsn"] = lsn

def chon_ket_noi(session):
    can = session.get("read_lsn")
    if not can:
        return replica_ngau_nhien()
    for r in danh_sach_replica():
        da = r.execute("SELECT pg_last_wal_replay_lsn()").fetchone()[0]
        if da >= can:
            return r                  # replica này CHẮC CHẮN đã có thay đổi của bạn
    return primary                    # chưa ai kịp → về primary
```

```sql
-- ③ Với riêng giao dịch tiền: chờ replica xác nhận
BEGIN;
SET LOCAL synchronous_commit = 'remote_apply';
UPDATE tai_khoan SET so_du = so_du - 2000000 WHERE id = 1;
COMMIT;   -- chỉ trả về khi ít nhất 1 replica ĐÃ REPLAY xong
```

```python
# ④ CHẶN TRIỆU CHỨNG: idempotency key — dù có bấm lại vẫn chỉ một giao dịch
db.execute(
    "INSERT INTO transactions (idem_key, ...) VALUES (%s, ...) "
    "ON CONFLICT (idem_key) DO NOTHING", (khoa_client_sinh,))
```

**Và đặt cảnh báo để không phải chờ khách hàng báo:**

```yaml
# Prometheus alert
- alert: ReplicationLagCao
  expr: pg_replication_lag_seconds > 1
  for: 30s
  annotations:
    summary: "Replica trễ {{ $value }}s — nguy cơ đọc-sau-khi-ghi sai"
```

> **Tình huống 2:** Đội phân tích chạy báo cáo nặng trên replica. Từ hôm đó, ứng dụng thỉnh thoảng báo lỗi lạ:

```text
ERROR: canceling statement due to conflict with recovery
DETAIL: User query might have needed to see row versions that must be removed.
```

**Chẩn đoán:** replay WAL cần xoá phiên bản dòng cũ mà query dài đang đọc → Postgres **huỷ query**.

```sql
-- Đếm xem bị huỷ bao nhiêu lần
SELECT confl_snapshot, confl_bufferpin, confl_deadlock
FROM pg_stat_database_conflicts WHERE datname = current_database();
```

**Ba cách chữa, mỗi cách một cái giá — phải nói ra được:**

```sql
-- ① Cho query nhiều thời gian hơn
ALTER SYSTEM SET max_standby_streaming_delay = '5min';
--    ✗ CÁI GIÁ: replay bị HOÃN → độ trễ replica tăng lên tới 5 phút

-- ② Replica báo primary "đừng vacuum dòng này"
ALTER SYSTEM SET hot_standby_feedback = on;
--    ✗ CÁI GIÁ: PRIMARY bị bloat vì phải giữ dòng chết
```

```text
   ③ ✅ CÁCH SẠCH NHẤT: TÁCH REPLICA RIÊNG

      replica-app       → phục vụ ứng dụng, max_standby_streaming_delay THẤP
                          (ưu tiên độ trễ thấp)
      replica-analytics → phục vụ báo cáo, delay CAO + hot_standby_feedback on
                          (ưu tiên query chạy xong)

      → Hai nhu cầu ngược nhau thì đừng ép chung một máy.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Cho toàn bộ `SELECT` đi replica | Người dùng không thấy thứ mình vừa ghi | Phân loại theo mức chịu độ cũ |
| Thiết kế theo độ trễ **trung bình** | Chết ở cái đuôi, đúng giờ cao điểm | Giám sát p99, cảnh báo theo đỉnh 30 ngày |
| Nhiều replica không ghim phiên | Thời gian đi lùi (monotonic read) | Ghim user vào một replica |
| Nghĩ replica giảm tải ghi | Ghi vẫn dồn một máy | Cần sharding |
| Chỉ đo trễ theo byte | Byte lớn có thể vô hại; giây mới là thứ người dùng cảm nhận | Đo cả hai |
| Chạy báo cáo nặng trên replica phục vụ app | Replay bị chặn → độ trễ vọt | Replica riêng cho analytics |
| Bật `hot_standby_feedback` mà không giám sát | Primary bloat vì không vacuum được | Giám sát dead tuples |
| Bật `synchronous_commit=on` cho mọi giao dịch | Độ trễ ghi tăng gấp nhiều lần | Chỉ bật cho giao dịch quan trọng |
| `synchronous_standby_names` chỉ một replica | Replica chết → primary treo | `ANY 1 (r1, r2)` |
| Không kiểm thử failover | Ngày cần dùng mới biết nó không chạy | Diễn tập định kỳ |

## Câu hỏi phỏng vấn hay gặp

**H: Vì sao người dùng chuyển tiền xong, load lại vẫn thấy số dư cũ?**
Vì lệnh ghi vào primary còn lệnh đọc đi ra replica, mà việc sao chép cần thời gian. Trong cửa sổ đó hai máy nói hai sự thật khác nhau. Cửa sổ này bình thường vài mili giây nhưng vọt lên hàng giây vào giờ cao điểm — đúng lúc đông người nhất. Và người dùng sẽ làm việc hợp lý nhất: bấm lại. Đó là cách bạn có giao dịch trùng.

**H: Sửa thế nào?**
Rẻ nhất là không đọc lại — dùng `RETURNING` để lấy kết quả ngay từ lệnh ghi. Nếu buộc phải đọc lại, cách chính xác nhất là **ghim theo LSN**: sau khi commit lấy `pg_current_wal_lsn()`, lưu vào session, rồi chỉ đọc từ replica nào có `pg_last_wal_replay_lsn()` lớn hơn hoặc bằng nó. Không đoán, không hằng số ma thuật. Cách đơn giản hơn là ghim phiên vào primary vài giây sau khi ghi.

**H: Sao chép đồng bộ và bất đồng bộ khác gì?**
Bất đồng bộ: `COMMIT` trả về ngay khi primary ghi xong — nhanh, nhưng nếu primary chết đột ngột thì phần WAL chưa gửi đi mất vĩnh viễn, kể cả giao dịch đã báo thành công. Đồng bộ: `COMMIT` chờ replica xác nhận — không mất dữ liệu, nhưng mỗi lần ghi cộng thêm một vòng mạng, và nếu replica chết mà không có ứng viên thay thế thì primary treo hoàn toàn. Cách thực dụng là bật đồng bộ **chỉ cho giao dịch tiền**, bằng `SET LOCAL synchronous_commit`.

**H: Replica giúp giảm tải ghi không?**
Không. Nó chỉ giảm tải đọc, và bản thân nó còn phải replay toàn bộ lượng ghi của primary. Ngoài ra replay trong Postgres là **đơn luồng**, nên replica có thể không đuổi kịp dù phần cứng giống hệt. Nếu nút thắt là ghi thì phải sharding.

**H: Query trên replica bị huỷ với lỗi "conflict with recovery" là gì?**
Replay WAL cần xoá phiên bản dòng cũ mà query đang đọc, nên Postgres huỷ query. Hai cách chữa đều có giá: nới `max_standby_streaming_delay` thì replay bị hoãn nên độ trễ tăng; bật `hot_standby_feedback` thì primary phải giữ dòng chết nên bị bloat. Cách sạch hơn là tách replica riêng cho báo cáo nặng.

## Tóm tắt bài 2

- Replica giảm tải **đọc**, không giảm tải ghi — và replay WAL là **đơn luồng**, nên replica có thể không bao giờ đuổi kịp.
- Độ trễ sao chép **không phải hằng số** mà là một phân phối có đuôi dài; đuôi xuất hiện đúng giờ cao điểm, nơi có người dùng.
- Nguy hiểm chỉ nằm ở **lệnh đọc mà chính người đó vừa tự tay ghi ra** — vì con người tin mắt mình và sẽ bấm lại.
- Xếp theo độ mạnh: `RETURNING` (không đọc lại) → ghim LSN → ghim phiên vào primary → `synchronous_commit = remote_apply` cho riêng giao dịch quan trọng.
- Nhiều replica sau load balancer phải **ghim phiên** để tránh thời gian đi lùi (monotonic read).
- Sao chép bất đồng bộ **mất dữ liệu đã commit** khi failover đột ngột — đó là đánh đổi phải nói ra, không phải bug.

**Bài kế tiếp** → [Bài 3: Partitioning — chia bảng lớn thành nhiều mảnh](03-partitioning-chia-bang-lon.md)
