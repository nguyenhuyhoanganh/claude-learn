# Bài 3: Khi nào thật sự nên shard — và chín việc nên làm trước

Câu trả lời trung thực cho câu hỏi *"khi nào nên shard database?"* là:

> **Muộn hơn nhiều so với bạn nghĩ.**

Sau khi đọc [bài 1](01-database-sharding-la-gi.md) và tự tay dựng ba shard ở [bài 2](02-sharding-thuc-hanh-nodejs-postgres.md), bạn đã thấy cái giá. Bài này cho bạn **quy trình quyết định**: chính xác cần đo gì, thử gì trước, và tín hiệu nào cho biết đã thật sự đến lúc.

## Bước đầu tiên: xác định nút cổ chai thật

Đây là bước bị bỏ qua nhiều nhất. Người ta thấy hệ thống chậm và nhảy ngay tới kết luận "cần scale ra nhiều máy" — mà không biết **cái gì** đang là giới hạn.

```text
   BỐN NÚT CỔ CHAI, BỐN CÁCH CHỮA HOÀN TOÀN KHÁC NHAU

   ┌──────────────────┬─────────────────────┬────────────────────────────┐
   │ Nút cổ chai      │ Đo bằng             │ Sharding có giúp không?    │
   ├──────────────────┼─────────────────────┼────────────────────────────┤
   │ CPU của database │ %CPU, load average  │ CÓ — chia tải ra nhiều máy │
   │ RAM (cache miss) │ cache hit ratio     │ CÓ — mỗi máy cache phần nhỏ│
   │ Dung lượng đĩa   │ df, pg_database_size│ CÓ — chia dữ liệu ra       │
   │ QUERY VIẾT TỆ    │ pg_stat_statements  │ KHÔNG — vẫn tệ trên N máy  │
   │ THIẾU INDEX      │ EXPLAIN             │ KHÔNG — vẫn thiếu trên N   │
   │ TRANH CHẤP KHOÁ  │ pg_locks            │ KHÔNG — thường TỆ HƠN      │
   │ CẠN CONNECTION   │ pg_stat_activity    │ KHÔNG — pool sai vẫn sai   │
   └──────────────────┴─────────────────────┴────────────────────────────┘
```

Bốn dòng cuối là điểm mấu chốt: **sharding không sửa được query tệ, index thiếu, hay pool sai cấu hình.** Nó chỉ nhân chúng lên N lần và thêm độ phức tạp.

Câu lệnh chẩn đoán tối thiểu, chạy trước khi ra bất kỳ quyết định nào:

```sql
-- 1. Cache hit ratio (khoẻ mạnh: > 99%)
SELECT round(100.0 * sum(blks_hit) / NULLIF(sum(blks_hit + blks_read), 0), 2) AS pct_cache_hit
FROM pg_stat_database;

-- 2. Query tốn tổng thời gian nhiều nhất
SELECT left(query, 70), calls, round(total_exec_time::numeric) AS tong_ms
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;

-- 3. Đang chờ khoá?
SELECT count(*) FILTER (WHERE wait_event_type = 'Lock') AS dang_cho_khoa,
       count(*) FILTER (WHERE state = 'active')         AS dang_chay,
       count(*)                                          AS tong_ket_noi
FROM pg_stat_activity;

-- 4. Bảng nào to nhất
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS kich_thuoc
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
```

---

## Chín nấc thang trước sharding

Mỗi nấc kèm mức cải thiện **điển hình** và chi phí. Đọc theo thứ tự, và **đừng bỏ qua nấc nào**.

### Nấc 1 — Sửa query và thêm index

```text
   Chi phí   : vài giờ
   Cải thiện : 10× tới 1000× cho các query cụ thể
   Rủi ro    : rất thấp
```

Đây là nấc cho lợi ích lớn nhất trên mỗi giờ bỏ ra, và cũng là nấc bị bỏ qua nhiều nhất vì nó "không sang". Xem [phase-4](../phase-4/01-co-ban-ve-indexing.md).

Kiểm tra nhanh xem còn dư địa không:

```sql
SELECT schemaname, relname, seq_scan, seq_tup_read,
       seq_tup_read / NULLIF(seq_scan, 0) AS dong_moi_lan_quet
FROM pg_stat_user_tables
WHERE seq_scan > 1000
ORDER BY seq_tup_read DESC LIMIT 10;
```

Bảng nào có `seq_scan` cao **và** `dong_moi_lan_quet` lớn là ứng viên rõ ràng cho một index còn thiếu.

### Nấc 2 — Loại bỏ N+1 và query thừa

```text
   Chi phí   : vài ngày
   Cải thiện : 5× tới 100× cho các trang cụ thể
```

Một trang gọi 300 truy vấn thay vì 3 thì không có phần cứng nào cứu được. Xem [orm-n-plus-1](../../orm-n-plus-1/README.md).

### Nấc 3 — Chỉnh connection pool

```text
   Chi phí   : vài giờ
   Cải thiện : thường bất ngờ lớn khi pool đang sai
```

Pool quá lớn làm database **chậm đi** vì chuyển ngữ cảnh và tranh chấp khoá. Xem [phase-8 bài 3](../phase-8/03-connection-pooling.md).

### Nấc 4 — Chỉnh tham số database

```text
   Chi phí   : vài giờ
   Cải thiện : 20% tới 300%
```

Bốn tham số cho lợi ích lớn nhất:

| Tham số | Mặc định | Nên đặt |
|---|---|---|
| `shared_buffers` | 128 MB | **25% RAM** |
| `effective_cache_size` | 4 GB | **50-75% RAM** |
| `random_page_cost` | 4 | **1,1** trên SSD |
| `work_mem` | 4 MB | Tuỳ tải, thường 16-64 MB |

Riêng `random_page_cost` trên SSD có thể thay đổi hoàn toàn quyết định của optimizer — xem [phase-4 bài 3](../phase-4/03-composite-index-va-optimizer.md).

### Nấc 5 — Nâng cấp phần cứng theo chiều dọc

```text
   Chi phí   : tiền, và một lần khởi động lại
   Cải thiện : tuyến tính theo tài nguyên thêm vào
```

Nấc này bị chê là "không đúng cách" nhưng thường là lựa chọn **kinh tế nhất**:

```text
   Máy 8 vCPU / 32 GB   →   Máy 64 vCPU / 512 GB

   Chi phí thêm : vài nghìn đô mỗi tháng
   Công sức     : một lần khởi động lại
   So với       : sharding = nhiều tháng công sức của cả đội
                             + độ phức tạp vĩnh viễn
```

Máy chủ đám mây hiện nay lên tới **hàng trăm vCPU và hàng TB RAM**. Rất nhiều hệ thống tưởng cần sharding thực ra chỉ cần một máy lớn hơn.

### Nấc 6 — Cache tầng ứng dụng

```text
   Chi phí   : vài ngày tới vài tuần
   Cải thiện : 10× tới 100× cho dữ liệu đọc nhiều
   Rủi ro    : bài toán vô hiệu hoá cache
```

Xem [redis](../../redis/README.md) và bài về vô hiệu hoá cache trong [database-su-co-va-phong-van](../../database-su-co-va-phong-van/README.md).

### Nấc 7 — Replica đọc

```text
   Chi phí   : vài ngày
   Cải thiện : nhân khả năng ĐỌC lên N lần
   Rủi ro    : độ trễ nhân bản, bài toán read-your-own-writes
```

Đây là nấc quan trọng nhất nếu tải của bạn nghiêng về đọc — mà phần lớn hệ thống thì đúng như vậy (tỉ lệ đọc/ghi thường 10:1 tới 100:1). Xem [phase-9](../phase-9/01-database-replication-la-gi.md).

```text
   1 primary + 3 replica đọc  →  khả năng đọc GẤP 4 LẦN
                                 khả năng ghi KHÔNG ĐỔI
```

### Nấc 8 — Partitioning

```text
   Chi phí   : vài tuần
   Cải thiện : bảo trì gọn lại, cắt tỉa mảnh, xoá dữ liệu cũ tức thì
   Rủi ro    : vừa, và quay đầu được
```

Xem [phase-6](../phase-6/01-database-partitioning-la-gi.md). Nếu vấn đề của bạn là "một bảng quá to" thì đây là nấc đúng, không phải sharding.

### Nấc 9 — Tách theo chức năng

```text
   Chi phí   : vài tuần tới vài tháng
   Cải thiện : chia tải ghi theo miền nghiệp vụ
```

Trước khi chia **một bảng** ra nhiều máy, hãy thử chia **các bảng khác nhau** ra các database khác nhau:

```text
   MỘT DATABASE                    BA DATABASE THEO CHỨC NĂNG
   ═════════════                    ═══════════════════════════
   users                            DB-1: users, sessions, auth
   orders                           DB-2: orders, order_items, payments
   products                         DB-3: products, categories, inventory
   sessions                              analytics_events → kho riêng
   analytics_events
```

Ưu điểm lớn: **mỗi database vẫn giữ nguyên `JOIN` và transaction bên trong miền của nó**. Bạn chỉ mất `JOIN` xuyên miền — mà xuyên miền thì thường vốn đã ít.

Đây gần như luôn là bước nên thử **ngay trước** sharding, và rất nhiều hệ thống dừng lại được ở đây.

---

## Bảng thang đầy đủ

| Nấc | Việc | Chi phí | Cải thiện điển hình | Quay đầu được? |
|---|---|---|---|---|
| 0 | **Đo đạc** | Vài giờ | — (nhưng quyết định mọi thứ) | — |
| 1 | Sửa query + index | Vài giờ | 10-1000× | ✔ |
| 2 | Bỏ N+1 | Vài ngày | 5-100× | ✔ |
| 3 | Chỉnh pool | Vài giờ | Thường lớn | ✔ |
| 4 | Chỉnh tham số DB | Vài giờ | 1,2-3× | ✔ |
| 5 | Máy lớn hơn | Tiền | Tuyến tính | ✔ |
| 6 | Cache | Vài tuần | 10-100× đọc | ✔ |
| 7 | Replica đọc | Vài ngày | N× đọc | ✔ |
| 8 | Partitioning | Vài tuần | Bảo trì + cắt tỉa | ✔ |
| 9 | Tách theo chức năng | Vài tháng | Chia tải ghi | Khó |
| **10** | **Sharding** | **Nhiều tháng** | **N× mọi thứ** | **✘** |

Đọc bảng này thành lời: *"Chín nấc đầu đều quay đầu được. Nấc thứ mười thì không."*

---

## Trục thứ hai: giảm việc, hay chia việc

Cái thang ở trên là một trục. Nhưng có một trục thứ hai vuông góc với nó, và nhìn ra được nó giúp chọn công cụ đúng nhanh hơn nhiều:

```text
   ┌─────────────────────────────────────────────────────────────────┐
   │  TRỤC 1 — GIẢM VIỆC PHẢI LÀM                                    │
   │                                                                 │
   │  Bảng 1 tỷ dòng, tìm một dòng:                                  │
   │    không index  →  quét 1 TỶ dòng                               │
   │    có index     →  quét ~4 PAGE          ← giảm 250 triệu lần   │
   │    + partition  →  index nhỏ hơn, chỉ đụng 1 mảnh               │
   │                                                                 │
   │  → Công cụ: INDEX, PARTITION, bảng tổng hợp, cache              │
   │  → Luôn thử trục này TRƯỚC                                      │
   ├─────────────────────────────────────────────────────────────────┤
   │  TRỤC 2 — CHIA VIỆC RA NHIỀU NƠI                                │
   │                                                                 │
   │  Bảng 1 tỷ dòng, phải quét HẾT (báo cáo, ETL, huấn luyện):      │
   │    một luồng    →  1 tỷ dòng tuần tự                            │
   │    8 luồng      →  mỗi luồng 125 triệu     ← nhanh ~6 lần       │
   │    8 máy        →  mỗi máy 125 triệu       ← nhanh ~8 lần       │
   │                                                                 │
   │  → Công cụ: truy vấn song song, worker chia khoảng, MapReduce,  │
   │             SHARDING                                            │
   │  → Chỉ cần khi KHÔNG THỂ giảm việc được nữa                     │
   └─────────────────────────────────────────────────────────────────┘
```

Nguyên tắc rút ra:

> **Sharding nằm ở trục 2. Nó chia việc, nó không giảm việc.**
>
> Nếu vấn đề của bạn giải được bằng trục 1 — mà phần lớn là như vậy — thì sharding chỉ nhân độ phức tạp lên N lần mà không giải quyết gì.

### Trục 2 không nhất thiết phải sharding

Điểm quan trọng: **chia việc ra nhiều nơi không đồng nghĩa với chia dữ liệu ra nhiều máy**. Có ba mức, và sharding là mức đắt nhất:

```sql
-- MỨC 1: song song hoá TRONG MỘT MÁY — PostgreSQL làm sẵn
SET max_parallel_workers_per_gather = 8;
EXPLAIN ANALYZE SELECT count(*) FROM events WHERE created_at > '2026-01-01';
```

```text
Gather  (actual time=2418.882..2511.117 rows=1 loops=1)
  Workers Planned: 8
  Workers Launched: 8              ← 8 tiến trình cùng quét
  ->  Parallel Seq Scan on events
```

```python
# MỨC 2: worker của ỨNG DỤNG chia khoảng — không đổi gì ở database
def worker(phan, tong):
    lo, hi = phan * BUOC, (phan + 1) * BUOC
    cur.execute("SELECT ... FROM events WHERE id >= %s AND id < %s", (lo, hi))
    # ... xử lý ...

with ThreadPoolExecutor(8) as pool:
    pool.map(lambda p: worker(p, 8), range(8))
```

```text
   MỨC 3: SHARDING — chia dữ liệu ra nhiều MÁY
          → chỉ khi mức 1 và 2 đã chạm trần của MỘT MÁY
```

Mức 1 và mức 2 **không đòi hỏi thay đổi kiến trúc nào** và có thể triển khai trong một buổi chiều. Rất nhiều đội nhảy thẳng tới mức 3 mà chưa từng thử hai mức đầu.

> Nếu bảng đã được **phân mảnh** ([phase-6](../phase-6/01-database-partitioning-la-gi.md)), mức 2 còn tự nhiên hơn: mỗi worker xử lý một mảnh, và bật `enable_partitionwise_aggregate` để PostgreSQL tự gom nhóm trong từng mảnh trước khi hợp.

---

## Bốn tín hiệu cho biết đã đến lúc

Sharding trở nên hợp lý khi **cả bốn** điều sau cùng đúng:

### 1. Đã leo hết chín nấc

Không phải "đã nghĩ tới" — mà đã **làm và đo**.

### 2. Nút cổ chai là GHI, không phải đọc

```text
   Replica đọc giải quyết được tải ĐỌC.
   Chỉ có sharding giải quyết được tải GHI vượt quá một máy.

   Kiểm tra: primary có đang bão hoà bởi lệnh ghi không?
```

```sql
SELECT sum(xact_commit + xact_rollback) AS tps,
       sum(tup_inserted + tup_updated + tup_deleted) AS dong_ghi
FROM pg_stat_database;
```

Chạy hai lần cách nhau 60 giây rồi lấy hiệu để ra tốc độ thật.

### 3. Dữ liệu vượt quá máy lớn nhất mua được

Máy đám mây lớn nhất hiện nay có hàng TB RAM và hàng chục TB SSD. Nếu dữ liệu **nóng** của bạn vẫn vượt qua đó, sharding là bắt buộc.

Chú ý chữ **nóng**: 50 TB dữ liệu trong đó chỉ 200 GB được truy cập thường xuyên thì đó là bài toán **phân tầng lưu trữ**, không phải bài toán sharding.

### 4. Có shard key rõ ràng và tự nhiên

```text
   CÓ shard key tốt:
     • Hệ SaaS nhiều khách hàng  →  tenant_id
     • Mạng xã hội               →  user_id
     • Thương mại điện tử        →  seller_id hoặc buyer_id
     • Nhắn tin                  →  conversation_id

   KHÔNG có shard key tốt:
     • Dữ liệu mà mọi truy vấn đều cắt ngang nhiều chiều
     • Hệ phân tích với truy vấn tự do
     → Hai loại này shard xong sẽ khổ vĩnh viễn
```

Nếu thiếu tiêu chí 4, hãy dừng lại. Sharding không có shard key tốt là công thức cho một hệ thống chậm và khó bảo trì hơn hệ thống ban đầu.

---

## Ưu điểm thật sự của sharding

Để công bằng — sharding có những thứ **không cách nào khác đạt được**:

| Ưu điểm | Giải thích |
|---|---|
| **Vượt trần một máy** | Đây là ưu điểm duy nhất không thay thế được. CPU, RAM, đĩa, băng thông mạng — tất cả đều nhân lên |
| **Khả năng ghi mở rộng tuyến tính** | Replica không giúp được gì cho ghi; sharding thì có |
| **Bán kính sự cố nhỏ hơn** | Một shard chết chỉ ảnh hưởng 1/N người dùng, không phải tất cả |
| **Cách ly theo khách hàng** | Khách hàng lớn có thể được đặt vào shard riêng, không ảnh hưởng người khác |
| **Tuân thủ dữ liệu theo vùng** | Dữ liệu người dùng EU nằm vật lý trong EU |

Ưu điểm "bán kính sự cố" đáng chú ý: với một database duy nhất, một sự cố làm **100%** người dùng offline. Với 10 shard, nó làm 10% offline. Với một số ngành, đây là lý do đủ.

## Nhược điểm thật sự — thuế vận hành

Ngoài những mất mát kỹ thuật ở [bài 1](01-database-sharding-la-gi.md), có một khoản chi phí ít được nói: **thuế vận hành trả hàng ngày, mãi mãi**.

| Việc hàng ngày | Trước | Sau khi shard 10 máy |
|---|---|---|
| Đổi cấu trúc bảng | Một lệnh, vài giây | Điều phối 10 lệnh; xử lý khi 3 máy thành công, 7 máy lỗi |
| Sao lưu | Một job | 10 job, và phải nhất quán về thời điểm giữa chúng |
| Phục hồi | Một quy trình | 10 quy trình, và phải khớp thời điểm |
| Nâng cấp phiên bản | Một lần | 10 lần, hoặc chấp nhận chạy lẫn phiên bản |
| Theo dõi | Một bảng điều khiển | 10 bộ chỉ số + phát hiện shard nóng |
| Gỡ lỗi một sự cố | Xem một log | Tìm shard nào trước, rồi mới xem log |
| Thêm dung lượng | Gắn đĩa | Dự án di chuyển dữ liệu |
| Onboarding người mới | Vài ngày | Vài tuần |

Khoản cuối đáng suy nghĩ: sharding làm **mọi người trong đội** phải hiểu một mô hình phức tạp hơn, mãi mãi.

---

## Đừng tự viết — dùng thứ có sẵn

Nếu đã xác định cần sharding, gần như luôn nên dùng một hệ đã làm sẵn thay vì tự viết như [bài 2](02-sharding-thuc-hanh-nodejs-postgres.md).

| Giải pháp | Nền | Ưu | Nhược |
|---|---|---|---|
| **Citus** | PostgreSQL (extension) | Vẫn là Postgres thật; `JOIN` và transaction phân tán được hỗ trợ; nhóm cùng vị trí là khái niệm hạng nhất | Cần chọn cột phân tán đúng; một số tính năng Postgres bị hạn chế |
| **Vitess** | MySQL | Đã chứng minh ở quy mô YouTube; ứng dụng gần như không cần đổi | Vận hành phức tạp; cần đội có kinh nghiệm |
| **CockroachDB** | Tự thân (giống Postgres) | Tự shard, tự cân bằng, transaction phân tán thật | Độ trễ ghi cao hơn; không phải Postgres 100% |
| **YugabyteDB** | Tự thân (giống Postgres) | Tương tự CockroachDB, tương thích Postgres cao hơn | Cộng đồng nhỏ hơn |
| **MongoDB sharding** | MongoDB | Tích hợp sẵn, tự cân bằng chunk | Chọn shard key sai vẫn khổ y hệt |
| **DynamoDB / Cassandra** | NoSQL | Sharding là mặc định, không phải lựa chọn | Mô hình dữ liệu phải thiết kế quanh mẫu truy vấn |

Với hệ đang chạy PostgreSQL, **Citus** thường là đường đi ít đau nhất:

```sql
-- Biến một bảng thành bảng phân tán
SELECT create_distributed_table('users', 'user_id');

-- Nhóm cùng vị trí — các bảng liên quan dùng CÙNG cột phân tán
SELECT create_distributed_table('orders', 'user_id', colocate_with => 'users');

-- Bảng tham chiếu — nhân bản sang MỌI shard để JOIN cục bộ
SELECT create_reference_table('countries');
```

Ba lệnh đó thay thế toàn bộ những gì bạn tự viết ở [bài 2](02-sharding-thuc-hanh-nodejs-postgres.md), và còn xử lý cả những trường hợp biên mà code tự viết sẽ bỏ sót.

Khái niệm **bảng tham chiếu** (nhân bản bảng nhỏ sang mọi shard) là lời giải chính thức cho vấn đề `JOIN` xuyên shard — đúng cách "nhân đôi dữ liệu ít đổi" đã nhắc ở [bài 1](01-database-sharding-la-gi.md).

---

## Danh sách kiểm tra trước khi quyết định

Trả lời trung thực. Bất kỳ câu "không" nào ở phần A đều là lý do dừng lại.

**Phần A — Đã làm hết chưa**

- [ ] Đã đo và biết chính xác nút cổ chai là CPU, RAM, đĩa hay ghi?
- [ ] Đã tối ưu 10 truy vấn tốn nhiều tổng thời gian nhất?
- [ ] Đã loại bỏ N+1 ở các đường dẫn nóng?
- [ ] Đã chỉnh `shared_buffers`, `effective_cache_size`, `random_page_cost`?
- [ ] Đã thử máy lớn hơn, và biết máy lớn nhất khả dụng là bao nhiêu?
- [ ] Đã có cache cho dữ liệu đọc nhiều?
- [ ] Đã có replica đọc và đã đẩy tải đọc sang đó?
- [ ] Đã partitioning các bảng lớn?
- [ ] Đã thử tách theo chức năng?

**Phần B — Có phù hợp không**

- [ ] Nút cổ chai là **ghi**, không phải đọc?
- [ ] Có shard key **xuất hiện trong đa số truy vấn**?
- [ ] Các bảng liên quan **nhóm được cùng vị trí** theo shard key đó?
- [ ] Shard key **phân bố đều**, không có giá trị siêu lớn?
- [ ] Đội có đủ người để gánh thuế vận hành **mãi mãi**?

**Phần C — Chọn cách làm**

- [ ] Đã cân nhắc Citus / Vitess / CockroachDB thay vì tự viết?
- [ ] Có kế hoạch di chuyển dữ liệu không dừng dịch vụ?
- [ ] Có công cụ chạy migration trên mọi shard?
- [ ] Có cách phát hiện shard nóng?

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Shard vì "hệ thống lớn thì phải shard" | Trả giá khổng lồ cho vấn đề không tồn tại | Đo trước; phần lớn hệ thống không cần |
| Shard trong khi thủ phạm là query tệ | Query tệ vẫn tệ trên N máy, cộng thêm độ phức tạp | Leo hết nấc 1-2 trước |
| Shard trong khi nút cổ chai là đọc | Replica đọc rẻ hơn nhiều lần | Xác định đọc hay ghi trước |
| Tự viết lớp sharding | Nhiều tháng công sức để làm lại thứ đã có | Citus / Vitess / CockroachDB |
| Chọn shard key theo trực giác | Đa số truy vấn phải rải-gom | Chọn theo `pg_stat_statements` |
| Không nhóm cùng vị trí | Mất `JOIN` và transaction không cần thiết | Mọi bảng liên quan dùng cùng shard key |
| Quên thuế vận hành | Đội kiệt sức vì việc thường ngày nhân lên N lần | Tính chi phí vận hành vào quyết định |
| Shard xong mới nghĩ tới migration | Không đổi được cấu trúc bảng nữa | Chuẩn bị công cụ migration đa shard trước |

## Tóm tắt bài 3

- Bước đầu tiên **luôn là đo**: sharding chỉ giúp khi nút cổ chai là **CPU, RAM, đĩa hoặc tải ghi**. Nó **không** sửa được query tệ, index thiếu, pool sai, hay tranh chấp khoá.
- Có **chín nấc thang** trước sharding, và **cả chín đều quay đầu được**. Nấc thứ mười thì không.
- Có **trục thứ hai** vuông góc với cái thang: **giảm việc** (index, partition, cache) và **chia việc** (song song hoá, sharding). **Sharding nằm ở trục 2 — nó chia việc chứ không giảm việc.** Và trục 2 có ba mức: song song trong một máy (`max_parallel_workers_per_gather`) → worker ứng dụng chia khoảng → sharding. Hai mức đầu triển khai trong một buổi chiều.
- Nấc bị bỏ qua nhiều nhất là nấc 5 — **mua máy lớn hơn**. Máy đám mây hiện nay có hàng trăm vCPU và hàng TB RAM; rất nhiều hệ tưởng cần sharding chỉ cần một máy lớn hơn.
- Nấc nên thử **ngay trước** sharding là **tách theo chức năng** — vì nó giữ nguyên `JOIN` và transaction bên trong từng miền.
- Bốn tín hiệu để shard, phải đúng **cả bốn**: đã leo hết thang · nút cổ chai là **ghi** · dữ liệu **nóng** vượt máy lớn nhất · có **shard key tự nhiên**.
- Ưu điểm không thay thế được: **vượt trần một máy**, **khả năng ghi mở rộng tuyến tính**, **bán kính sự cố nhỏ hơn**, **cách ly khách hàng**, **tuân thủ dữ liệu theo vùng**.
- Nhược điểm ít được nói nhất là **thuế vận hành trả hàng ngày mãi mãi**: migration, sao lưu, phục hồi, nâng cấp, theo dõi, gỡ lỗi — tất cả nhân lên N lần.
- Nếu đã quyết shard: **đừng tự viết**. Citus cho PostgreSQL, Vitess cho MySQL, hoặc chuyển sang CockroachDB/YugabyteDB — ba lệnh của Citus thay thế toàn bộ những gì tự viết ở [bài 2](02-sharding-thuc-hanh-nodejs-postgres.md).

**Bài kế tiếp** → [Phase 8 — Bài 1: Shared Lock và Exclusive Lock](../phase-8/01-shared-lock-va-exclusive-lock.md)
