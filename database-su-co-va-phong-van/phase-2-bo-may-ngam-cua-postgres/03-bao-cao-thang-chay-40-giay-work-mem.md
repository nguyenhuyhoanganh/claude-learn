# Bài 10: Báo cáo tháng chạy 40 giây và ô cấu hình không ai để ý

9 giờ 05 sáng thứ Hai. Ai đó bấm nút xem **"Báo cáo tháng"**. Vòng quay chạy, chạy mãi. 40 giây sau, trang trả về lỗi hết giờ chờ.

Hôm qua, chính trang đó trả kết quả trong **200 mili-giây**.

Không ai sửa gì. Không ai triển khai gì. Dữ liệu vẫn đúng 10 triệu dòng như tuần trước.

Một bạn dev mở máy mình lên, chép y nguyên câu lệnh đó chạy thử: **0,2 giây**.

```text
   Cùng câu lệnh.
   Cùng chừng ấy dữ liệu.
   Chênh nhau 200 LẦN.
```

Đây là vụ án tôi thích nhất, vì **mọi bằng chứng đều nằm ngay trước mắt từ phút đầu tiên** — và gần như ai cũng đọc sai một mẩu trong số đó.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **`work_mem`** | Lượng RAM tối đa cho **MỘT thao tác sắp xếp hoặc băm**, trong **MỘT** câu lệnh, ở **MỘT** phiên | Kích thước mặt bàn bạn được dùng để xếp bài |
| **Sort** (sắp xếp) | Bước xếp dữ liệu theo thứ tự, sinh ra bởi `ORDER BY`, `GROUP BY`, `DISTINCT`, một số kiểu `JOIN` | Xếp một cỗ bài theo thứ tự |
| **Quicksort** | Thuật toán sắp xếp chạy **hoàn toàn trong RAM** | Xếp bài ngay trên mặt bàn |
| **External Merge Sort** | Sắp xếp khi dữ liệu **không vừa RAM**: cắt nhỏ, xếp từng phần, ghi ra đĩa, rồi trộn lại | Bàn quá nhỏ: xếp từng nắm, để tạm xuống sàn, rồi gộp dần |
| **File tạm** (temp file) | File database ghi ra đĩa khi RAM không đủ | Chồng bài để tạm dưới sàn |
| **`EXPLAIN`** | In ra **kế hoạch** — máy **định** đi đường nào. Không chạy thật | Xem trước lộ trình trên bản đồ |
| **`EXPLAIN ANALYZE`** | **Chạy thật** rồi in ra kế hoạch kèm **thời gian và số dòng thật** | Lái thật rồi ghi lại từng chặng mất bao lâu |
| **I/O** | Thao tác đọc/ghi đĩa hoặc mạng | Đi lấy đồ từ kho thay vì lấy trên bàn |
| **`SET LOCAL`** | Đặt một tham số **chỉ trong giao dịch hiện tại**, hết giao dịch là tự trả về cũ | Mượn cái bàn to, dùng xong trả lại |
| **OOM** (Out Of Memory) | Hệ điều hành hết RAM và **bắn hạ** tiến trình đang ngốn nhiều nhất | Hết chỗ, bảo vệ mời người to nhất ra ngoài |

## Bảng điều tra: thu bốn mẩu bằng chứng

Trước khi đoán, ta thu bằng chứng và ghim lên bảng. **Chưa suy luận gì cả.**

```text
   ┌─ BC1 ────────────────────────────────────────────────────────┐
   │ Cùng 10 triệu dòng.                                          │
   │   Máy dev:     0,2 s                                         │
   │   Production:  40 s                                          │
   │ → Đây là TRIỆU CHỨNG, không phải nguyên nhân.                │
   └──────────────────────────────────────────────────────────────┘

   ┌─ BC2 ────────────────────────────────────────────────────────┐
   │ Chạy EXPLAIN ở cả hai bên rồi đặt cạnh nhau:                 │
   │   GIỐNG HỆT NHAU.                                            │
   │   Cùng đọc index, cùng thứ tự ghép bảng, cùng ước lượng dòng.│
   └──────────────────────────────────────────────────────────────┘

   ┌─ BC3 ────────────────────────────────────────────────────────┐
   │ Lúc câu lệnh đang chạy trên production:                      │
   │   CPU chỉ 12%                                                │
   │   Đèn đĩa SÁNG LIÊN TỤC, lượng đọc/ghi vọt lên mấy chục lần  │
   └──────────────────────────────────────────────────────────────┘

   ┌─ BC4 ────────────────────────────────────────────────────────┐
   │ Trong cấu hình production có dòng:  work_mem = 4MB           │
   │ Cả đội nhìn thấy, gật gù, rồi BỎ QUA vì bảo: "Mặc định mà!"  │
   └──────────────────────────────────────────────────────────────┘
```

Mẩu BC3 đã nói gần hết rồi, nhưng ta cứ đi tuần tự — vì loại trừ từng nghi phạm mới là thứ dạy được cho lần sau.

## Loại trừ nghi phạm 1: phần cứng production yếu hơn?

**Giả thiết:** máy dev là máy trạm ổ SSD, production là máy ảo dùng chung. Chắc production yếu hơn.

**Thực nghiệm:** chạy bài đo tốc độ đĩa (`fio`) trên cả hai máy.

```text
   Đọc tuần tự:
      Production:  480 MB/s
      Máy dev:     150 MB/s

   → PRODUCTION NHANH HƠN GẤP 3 LẦN.
```

Và kiểm tra CPU: production chỉ dùng **12%**. Nếu máy yếu hoặc bị tranh chấp thì CPU phải kịch trần.

> **Gạch tên nghi phạm 1.** Chậm không đồng nghĩa với yếu. Một cỗ máy mạnh vẫn chậm nếu bạn bắt nó làm sai việc.

## Loại trừ nghi phạm 2: thống kê bị cũ?

**Giả thiết:** thống kê của bảng đã cũ nên bộ tối ưu chọn nhầm đường. Đây là lỗi kinh điển, và sau [Bài 9](02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) thì nó là nghi phạm số một trong đầu bạn.

**Thực nghiệm:**

```sql
SELECT relname, last_analyze, last_autoanalyze
  FROM pg_stat_user_tables WHERE relname = 'don_hang';
```

```text
   Máy dev:     09:12
   Production:  09:15

   → Cập nhật cách nhau 3 phút. Thống kê không hề cũ.
```

**Nhưng lý do loại trừ chắc chắn hơn nằm ở BC2.** Hãy nhìn lại:

```text
   Nếu bộ tối ưu chọn nhầm đường thì KẾ HOẠCH CHẠY PHẢI KHÁC NHAU.
   Ví dụ: một bên Seq Scan, một bên Index Scan.
   Hoặc: một bên Nested Loop, một bên Hash Join.

   Nhưng hai bản EXPLAIN GIỐNG HỆT NHAU TỪNG DÒNG.
```

> **Gạch tên nghi phạm 2.** Kế hoạch giống nhau thì không phải lỗi chọn đường.

## Loại trừ nghi phạm 3: có ai đang giữ khoá?

**Giả thiết:** 9 giờ sáng thứ Hai, cả công ty vào làm. Có ai đó đang giữ khoá bảng.

**Thực nghiệm 1:**

```sql
SELECT * FROM pg_locks WHERE NOT granted;
--  → 0 dòng. Không ai đang chờ khoá.
```

**Thực nghiệm 2 — cái này mới quyết định:** chạy lại câu lệnh lúc **3 giờ sáng**, không ai online, máy hoàn toàn rảnh rỗi.

```text
   → Vẫn tốn ĐÚNG 40 GIÂY.
```

Đây là bài học chẩn đoán đáng nhớ:

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  CHỜ KHOÁ  →  thời gian NHẢY LOẠN theo tải.                  │
   │               Lúc 3 giờ sáng phải nhanh hẳn.                 │
   │                                                              │
   │  Ở đây      →  40 giây, PHẲNG LÌ, bất kể giờ nào.            │
   │                                                              │
   │  PHẲNG LÌ NGHĨA LÀ KHÔNG PHẢI KHOÁ.                          │
   │  Nó là một chi phí CỐ ĐỊNH nằm trong chính câu lệnh.         │
   └──────────────────────────────────────────────────────────────┘
```

> **Gạch tên nghi phạm 3.**

## Lật lại mẩu BC2: chỗ ta đọc sai ngay từ đầu

Cả ba nghi phạm dễ đoán đã bị loại. Giờ quay lại mẩu bằng chứng thứ hai — mẩu mà ta đã **đọc sai ngay từ phút đầu**:

```text
   Ta đọc:     "EXPLAIN giống nhau"
   Ta hiểu:    "cách chạy giống nhau"
   → SAI.
```

**`EXPLAIN` chỉ in ra KẾ HOẠCH — tức là máy ĐỊNH đi đường nào. Nó không in ra CÁI GIÁ THẬT.**

Muốn thấy cái giá, phải chạy `EXPLAIN ANALYZE` — chạy thật, đo thật.

Và kết quả chỉ khác nhau **đúng một dòng**, ở bước sắp xếp:

```text
   ═══ MÁY DEV ═══════════════════════════════════════════════════
   Sort  (cost=... rows=10000000 width=48)
         (actual time=180.2..195.4 rows=10000000 loops=1)
     Sort Key: doanh_thu DESC
     Sort Method: quicksort  Memory: 82MB          ← XẾP TRONG RAM
     ...
   Execution Time: 201.334 ms

   ═══ PRODUCTION ════════════════════════════════════════════════
   Sort  (cost=... rows=10000000 width=48)
         (actual time=38102.7..39880.1 rows=10000000 loops=1)
     Sort Key: doanh_thu DESC
     Sort Method: external merge  Disk: 340MB      ← TRÀN RA ĐĨA
     ...
   Execution Time: 40218.882 ms
```

Một dòng. `quicksort Memory: 82MB` so với `external merge Disk: 340MB`.

## Cơ chế vỡ trận: chuyện gì xảy ra khi RAM không đủ

Đây là phần cần hiểu cho kỹ, vì nó giải thích luôn cả BC3 (CPU rảnh mà đèn đĩa sáng).

```text
   ═══ KHI RAM ĐỦ (work_mem = 256MB, cần 82MB) ═══════════════════

   ┌────────────────────────────────────────┐
   │  Toàn bộ 10 triệu dòng nằm trong RAM   │
   │  → quicksort một phát                  │
   │  → CPU chạy 100%, đĩa im lặng          │
   └────────────────────────────────────────┘
        Thời gian: ~200 ms


   ═══ KHI RAM KHÔNG ĐỦ (work_mem = 4MB, cần 340MB) ══════════════

   ① CẮT NHỎ: chia dữ liệu thành ~85 mảnh, mỗi mảnh vừa 4MB.
   ② XẾP TỪNG MẢNH trong RAM rồi GHI RA ĐĨA thành file tạm.

      RAM  [mảnh 1] → xếp → ghi ra đĩa → file tạm 1
      RAM  [mảnh 2] → xếp → ghi ra đĩa → file tạm 2
      ...
      RAM  [mảnh 85]→ xếp → ghi ra đĩa → file tạm 85

   ③ TRỘN LẠI: đọc song song nhiều file tạm, mỗi lần lấy dòng
      nhỏ nhất trong các đầu file, ghi ra kết quả.
      Nếu quá nhiều file thì phải trộn NHIỀU LƯỢT.

      file 1 ──┐
      file 2 ──┼──► trộn ──► file trung gian ──┐
      file 3 ──┘                                ├──► trộn ──► kết quả
      file 4 ──┐                                │
      file 5 ──┼──► trộn ──► file trung gian ──┘
      ...

   → 340 MB được GHI XUỐNG ĐĨA rồi ĐỌC LÊN LẠI, có khi vài lượt.
   → CPU phần lớn thời gian NGỒI CHỜ ĐĨA.
```

Và đó chính là BC3:

```text
   CPU 12%          ← vì nó đang CHỜ, không phải đang TÍNH
   Đèn đĩa sáng     ← vì 340 MB đang bị đẩy qua đẩy lại
```

**Bằng chứng và cơ chế khớp nhau hoàn hảo.** Đây là lý do nên thu hết bằng chứng trước rồi mới suy luận: BC3 một mình đã chỉ đúng hướng, nhưng chỉ khi bạn biết nó có nghĩa gì.

### Vì sao máy dev nhanh?

Vì máy dev được cài `work_mem = 256MB` — ai đó đặt nó từ lâu để chạy thử cho nhanh, rồi quên. 82MB vừa thoải mái trong đó.

> **Toàn bộ vụ án gói trong một câu: hai máy có cùng dữ liệu, cùng kế hoạch, nhưng KHÁC NHAU MỘT Ô CẤU HÌNH.**

## Bản vá — và cạm bẫy chết người đi kèm

### Bản vá đúng

```sql
BEGIN;
  SET LOCAL work_mem = '512MB';       -- chỉ trong giao dịch NÀY
  SELECT ... ORDER BY doanh_thu DESC;
COMMIT;                                -- tự trả về giá trị cũ
```

```text
   Kết quả: 40 giây  →  1,8 giây.
   Dòng "external merge Disk" biến mất, thay bằng "quicksort Memory".
```

### ⚠️ ĐỪNG nâng `work_mem` trong file cấu hình chung

Đây là chỗ giết chết nhiều database nhất, và nó xuất phát từ một hiểu lầm về **đơn vị**:

```text
   ✗ HIỂU SAI: "work_mem là hạn mức RAM cho cả máy chủ"
   ✓ SỰ THẬT: work_mem là hạn mức cho MỖI THAO TÁC SẮP XẾP/BĂM,
              trong MỖI câu lệnh, ở MỖI phiên.
```

Nghĩa là nó **nhân lên ba tầng**:

```text
   Một câu lệnh phức tạp có thể có NHIỀU thao tác cần bộ nhớ:
      • 2 lần sắp xếp (ORDER BY + DISTINCT)
      • 2 bảng băm (2 phép Hash Join)
      → 4 thao tác, mỗi thao tác được cấp TỚI work_mem.

   50 phiên chạy cùng lúc:

        4 thao tác × 50 phiên × 512 MB = 102.400 MB = 100 GB RAM
                                          ↑
                          Máy chủ có 64 GB. → OOM.
                          Hệ điều hành bắn hạ tiến trình Postgres.
                          → SẬP TOÀN BỘ DATABASE.
```

**Một dòng cấu hình "cho chắc ăn" có thể giết cả hệ thống vào đúng giờ cao điểm.**

### Chi tiết bổ sung: `hash_mem_multiplier`

Từ PostgreSQL 13 có thêm tham số này, và từ PostgreSQL 15 giá trị mặc định là **2.0**:

```text
   Thao tác SẮP XẾP  được cấp:  work_mem
   Thao tác BĂM      được cấp:  work_mem × hash_mem_multiplier

   Với work_mem = 512MB và hash_mem_multiplier = 2.0
      → mỗi bảng băm được cấp tới 1 GB.

   → Phép nhân ở trên còn tệ hơn bạn tưởng. Nhớ nhân thêm hệ số này
     cho các thao tác băm khi tính toán rủi ro.
```

Tham số này tồn tại vì tràn đĩa ở thao tác băm đắt hơn hẳn tràn đĩa ở sắp xếp — nên PostgreSQL ưu tiên cho băm nhiều RAM hơn.

### Quy tắc đặt `work_mem`

```text
   ① GIỮ MẶC ĐỊNH NHỎ trong postgresql.conf:  4MB – 16MB
      Đây là giá trị cho HÀNG NGHÌN câu lệnh nhỏ chạy suốt ngày.

   ② NÂNG CÓ CHỌN LỌC, ở ba mức, từ hẹp tới rộng:

      SET LOCAL work_mem = '512MB';          ← hẹp nhất, an toàn nhất
                                                (chỉ giao dịch này)

      ALTER ROLE bao_cao SET work_mem = '256MB';   ← cho user chạy báo cáo
      ALTER DATABASE dwh SET work_mem = '256MB';   ← cho DB phân tích riêng

   ③ CÔNG THỨC ƯỚC LƯỢNG CẬN TRÊN:

      work_mem_an_toàn ≈ (RAM_khả_dụng × 0.25)
                       ÷ (số_phiên_đồng_thời × số_thao_tác_mỗi_câu × hệ_số_băm)

      Ví dụ: 64GB RAM, 100 phiên, 4 thao tác/câu, hệ số băm 2
           ≈ (64 × 0.25) GB ÷ (100 × 4 × 2) = 16 GB ÷ 800 ≈ 20 MB
```

Con số ra rất nhỏ, và đó là điều đúng. **`work_mem` lớn không phải là cấu hình mặc định, nó là ngoại lệ có chủ đích.**

## Chi tiết đáng giá 30 giây để bắt bệnh lần sau

Bật một dòng cấu hình, dùng được mãi mãi:

```ini
# postgresql.conf
log_temp_files = 0
#               ↑ 0 = ghi log MỌI file tạm, bất kể kích thước
```

Từ đó, mỗi khi có câu lệnh nào hết RAM phải xả file tạm ra đĩa, PostgreSQL lập tức ghi một dòng log kèm số byte bị tràn:

```text
   LOG:  temporary file: path "base/pgsql_tmp/pgsql_tmp8123.0", size 356515840
   STATEMENT:  SELECT ... ORDER BY doanh_thu DESC
```

Quy tắc chẩn đoán rút ra từ vụ này:

```text
   ┌────────────────────────────────────────────────────────────┐
   │  Log IM LẶNG        →  đi tìm chỗ khác                      │
   │                        (chờ khoá, CPU, index, kế hoạch)     │
   │                                                             │
   │  Log TRÀN FILE TẠM  →  đi thẳng tới work_mem                │
   └────────────────────────────────────────────────────────────┘
```

### Theo dõi ở mức toàn hệ

```sql
-- Bao nhiêu file tạm đã sinh ra, tổng bao nhiêu byte
SELECT datname,
       temp_files                              AS so_file_tam,
       pg_size_pretty(temp_bytes)              AS tong_byte_tam,
       pg_size_pretty(temp_bytes / NULLIF(temp_files,0)) AS trung_binh_moi_file
  FROM pg_stat_database
 WHERE temp_files > 0
 ORDER BY temp_bytes DESC;
```

Con số `temp_bytes` tăng đều đặn nghĩa là hệ của bạn đang **thường xuyên** tràn đĩa — không phải chuyện của riêng một câu lệnh.

```sql
-- Với pg_stat_statements: câu lệnh nào tràn nhiều nhất
SELECT substring(query, 1, 70) AS cau_lenh,
       calls,
       pg_size_pretty((temp_blks_written * 8192)::bigint) AS da_ghi_tam
  FROM pg_stat_statements
 WHERE temp_blks_written > 0
 ORDER BY temp_blks_written DESC
 LIMIT 20;
```

## Không phải lúc nào cũng nên nâng work_mem

Trước khi nâng, hãy hỏi: **có cách nào để không phải sắp xếp không?**

| Cách tránh sắp xếp | Cụ thể |
|---|---|
| **Index cung cấp sẵn thứ tự** | `CREATE INDEX ON bao_cao (doanh_thu DESC)` — máy đọc theo index là đã có thứ tự, khỏi sắp xếp |
| **`LIMIT` nhỏ** | Có `LIMIT`, PostgreSQL dùng *top-N heapsort* — chỉ giữ N dòng trong RAM, gần như không bao giờ tràn |
| **Incremental Sort** (PG 13+) | Nếu index đã sắp theo `(a)` và bạn cần `(a, b)`, máy chỉ sắp lại từng nhóm nhỏ |
| **Gộp trước, sắp sau** | `GROUP BY` giảm 10 triệu dòng còn 500 dòng rồi mới `ORDER BY` |
| **Đẩy sang bảng tổng hợp** | Báo cáo tháng nên đọc từ bảng đã tổng hợp sẵn, không tính lại từ dữ liệu thô mỗi lần |

Dòng cuối là cách đúng nhất cho bài toán "báo cáo tháng": **không có lý do gì để cộng 10 triệu dòng thô mỗi lần có người bấm nút.**

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Dùng `EXPLAIN` để so hai môi trường | Nó chỉ in kế hoạch, không in cái giá thật | `EXPLAIN (ANALYZE, BUFFERS)` |
| Nghĩ `work_mem` là hạn mức của cả máy chủ | Nó nhân theo thao tác × phiên | Giữ mặc định nhỏ, nâng có chọn lọc |
| Nâng `work_mem` trong `postgresql.conf` | 4 thao tác × 50 phiên × 512MB = 100GB → OOM | `SET LOCAL` hoặc `ALTER ROLE` |
| Quên `hash_mem_multiplier` khi tính | Thao tác băm được cấp gấp đôi | Nhân thêm hệ số vào phép tính rủi ro |
| Thấy CPU thấp rồi kết luận "máy khoẻ" | CPU thấp vì đang **chờ đĩa** | Nhìn cả I/O, không chỉ CPU |
| Đổ lỗi phần cứng production | Production thường mạnh hơn dev | Đo bằng `fio` trước khi kết luận |
| Không bật `log_temp_files` | Mất hoàn toàn khả năng phát hiện sớm | `log_temp_files = 0` |
| Nâng `work_mem` thay vì bỏ hẳn việc sắp xếp | Chữa triệu chứng | Index theo thứ tự, `LIMIT`, hoặc bảng tổng hợp |
| Máy dev có `work_mem` khác production | Cả một họ lỗi "chỉ chậm trên production" | Đồng bộ cấu hình dev với production |
| Nghĩ chậm ổn định = chậm do tải | Chậm **phẳng lì** là chi phí cố định, không phải tranh chấp | Test lúc 3h sáng để phân biệt |

## Bản mẫu 30 giây

> *"Đầu tiên em phân biệt: chậm này **phẳng lì hay nhảy loạn**? Phẳng lì bất kể giờ nào thì không phải chờ khoá, không phải tranh tài nguyên — nó là chi phí cố định nằm trong chính câu lệnh.*
>
> *Rồi em nhìn CPU và I/O cùng lúc. **CPU thấp mà đĩa sáng là dấu hiệu rất đặc trưng**: máy đang chờ đĩa chứ không đang tính. Với câu lệnh có `ORDER BY` hoặc `GROUP BY` thì nghi phạm số một là tràn file tạm.*
>
> *Chỗ nhiều người dừng sai là dùng `EXPLAIN` để so hai môi trường rồi thấy giống nhau nên loại trừ. `EXPLAIN` chỉ in kế hoạch, không in cái giá. Phải `EXPLAIN (ANALYZE, BUFFERS)` mới thấy dòng `Sort Method` — một bên `quicksort Memory: 82MB`, bên kia `external merge Disk: 340MB`. Đó là toàn bộ khác biệt.*
>
> *Nguyên nhân là `work_mem`. Em vá bằng `SET LOCAL work_mem` cho đúng phiên chạy báo cáo, 40 giây xuống 1,8 giây. Nhưng em **tuyệt đối không nâng nó trong cấu hình chung**, vì `work_mem` là hạn mức cho mỗi thao tác sắp xếp/băm trong mỗi phiên — một câu 4 thao tác nhân 50 phiên nhân 512MB là 100 GB, và từ Postgres 15 thì thao tác băm còn được cấp gấp đôi vì `hash_mem_multiplier` mặc định là 2.*
>
> *Để bắt bệnh lần sau, em bật `log_temp_files = 0` — từ đó mọi lần tràn đĩa đều có một dòng log kèm số byte. Và về lâu dài, báo cáo tháng thì em đẩy sang bảng tổng hợp sẵn chứ không cộng lại 10 triệu dòng thô mỗi lần có người bấm nút."*

## Tóm tắt bài 10

- **`EXPLAIN` in KẾ HOẠCH, `EXPLAIN ANALYZE` in CÁI GIÁ.** Hai bản `EXPLAIN` giống hệt nhau vẫn có thể chênh nhau 200 lần khi chạy.
- Dòng cần soi là **`Sort Method`**: `quicksort Memory` (tốt) hay `external merge Disk` (đang tràn đĩa).
- **CPU thấp + đĩa sáng = đang chờ I/O**, không phải máy yếu. Production trong vụ này còn nhanh gấp 3 lần máy dev.
- **Chậm phẳng lì bất kể giờ nào = chi phí cố định**, không phải chờ khoá. Chờ khoá thì thời gian nhảy loạn theo tải.
- **`work_mem` là hạn mức cho MỖI thao tác sắp xếp/băm, trong MỖI câu lệnh, ở MỖI phiên** — không phải cho cả máy chủ. Nó nhân lên ba tầng.
- Nâng `work_mem` trong cấu hình chung là cách phổ biến nhất để **giết cả database bằng OOM** vào giờ cao điểm.
- Từ PostgreSQL 15, thao tác **băm** được cấp `work_mem × 2` (`hash_mem_multiplier`) — nhớ tính vào.
- Bật **`log_temp_files = 0`** một lần, dùng mãi: log im lặng thì đi tìm chỗ khác, log tràn file tạm thì tới thẳng `work_mem`.
- Tốt hơn cả nâng RAM là **không phải sắp xếp**: index cung cấp thứ tự, `LIMIT`, gộp trước sắp sau, hoặc bảng tổng hợp sẵn.

**Bài kế tiếp** → [Bài 11: Chiều cao index và con số Postgres không dùng](04-chieu-cao-index-va-con-so-postgres-khong-dung.md)
