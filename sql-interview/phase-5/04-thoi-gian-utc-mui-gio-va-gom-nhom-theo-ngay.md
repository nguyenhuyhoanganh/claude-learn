# Bài 4: Thời gian — UTC, múi giờ và bẫy gom nhóm theo ngày

Hai bản báo cáo, cùng một ngày, cùng một bảng, chạy cách nhau ba phút. Hai con số khác nhau.

Người phỏng vấn xoay màn hình lại rồi hỏi đúng một câu: *"Lưu thời gian thì lưu UTC hay giờ địa phương?"*

Câu hỏi nghe như đã có sẵn đáp án ai cũng thuộc — *"lưu UTC hết cho chuẩn"*. Chính chỗ đó là cái bẫy. Vì đáp án đó **đúng** mà vẫn **thiếu**, và người phỏng vấn sẽ hỏi tiếp hai câu nữa để tìm ra chỗ thiếu.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **UTC** | iu-ti-si | **Giờ phối hợp quốc tế** — mốc chuẩn của cả hành tinh, không có mùa hè |
| **Timezone** | tai-zôn | **Múi giờ** — độ lệch so với UTC (Việt Nam là UTC+7) |
| **Offset** | óp-sét | **Độ lệch** cụ thể tại một thời điểm, ví dụ `+07:00` |
| **IANA timezone** | ai-a-na | **Tên vùng** như `Asia/Ho_Chi_Minh` — chứa cả lịch sử đổi luật giờ |
| **`TIMESTAMPTZ`** | | Kiểu lưu **một thời điểm tuyệt đối**; cái tên nói dối vì nó **không lưu múi giờ** |
| **`TIMESTAMP`** (trần) | | Ngày + giờ **không kèm múi giờ** — không biết giờ đó ở đâu |
| **Wall time** | oan taim | **Giờ treo tường** — con số hiện trên đồng hồ ở một nơi |
| **Instant** | in-sờ-tần | **Thời điểm** — một điểm duy nhất trên trục thời gian vũ trụ |
| **DST** (*Daylight Saving Time*) | | **Giờ mùa hè** — vặn đồng hồ lên/xuống một tiếng theo mùa |
| **ISO 8601** | ai-ét-ô | Chuẩn viết ngày giờ: `2026-08-01T09:00:00+07:00` |
| **Epoch** | i-pốc | Số **giây tính từ 1/1/1970 UTC** |

## Ba khái niệm phải tách bạch trước khi bàn tiếp

Hầu hết bug thời gian đến từ việc trộn lẫn ba thứ hoàn toàn khác nhau:

```text
① THỜI ĐIỂM (instant)     — một điểm duy nhất trên trục thời gian vũ trụ
                             "đơn hàng này được tạo lúc nào"
                             → lưu UTC. Chỉ có một đáp án đúng cho cả hành tinh.

② GIỜ TREO TƯỜNG (wall time) — con số hiện trên đồng hồ ở một nơi
                             "cuộc họp 9 giờ sáng thứ Hai tuần sau"
                             → lưu giờ địa phương + TÊN VÙNG. Không lưu UTC.

③ NGÀY LỊCH (date)         — không có giờ, không có múi giờ
                             "ngày sinh 15/03/2003", "hạn hợp đồng 31/12"
                             → lưu DATE. Không bao giờ đổi múi giờ.
```

Lẫn ① với ② là nguồn của gần như mọi sự cố lịch hẹn. Lẫn ① với ③ là nguồn của gần như mọi sự cố báo cáo.

## Các kiểu thời gian và cái tên gây hiểu lầm nhất trong SQL

| Kiểu | Lưu gì | Có lưu múi giờ không |
|---|---|---|
| `DATE` | Ngày lịch, không giờ | Không |
| `TIME` | Giờ trong ngày | Không |
| `TIMESTAMP` (= `TIMESTAMP WITHOUT TIME ZONE`) | Ngày + giờ **trần trụi** | **Không** |
| `TIMESTAMPTZ` (= `TIMESTAMP WITH TIME ZONE`) | Một **thời điểm** tuyệt đối | **Không** (xem giải thích) |
| `INTERVAL` | Khoảng thời gian (`3 days 04:00:00`) | — |

Đây là chỗ gây hiểu lầm nhiều nhất trong toàn bộ SQL:

> **`TIMESTAMPTZ` KHÔNG lưu múi giờ.**

Cái tên nói dối. Thực tế bên trong:

```text
Khi GHI TIMESTAMPTZ:
   Giá trị bạn đưa vào + múi giờ của phiên (session TimeZone)
   → quy đổi về UTC
   → lưu xuống đĩa đúng 8 byte, LÀ MỘT SỐ UTC. Múi giờ gốc bị VỨT ĐI.

Khi ĐỌC TIMESTAMPTZ:
   Số UTC trên đĩa
   → quy đổi sang múi giờ của phiên đang đọc
   → hiển thị
```

```sql
SET TimeZone = 'Asia/Ho_Chi_Minh';
CREATE TEMP TABLE t (a TIMESTAMP, b TIMESTAMPTZ);
INSERT INTO t VALUES ('2026-08-01 09:00', '2026-08-01 09:00');

SELECT * FROM t;
--          a          |           b
-- 2026-08-01 09:00:00 | 2026-08-01 09:00:00+07

SET TimeZone = 'UTC';
SELECT * FROM t;
--          a          |           b
-- 2026-08-01 09:00:00 | 2026-08-01 02:00:00+00
--        ▲ KHÔNG ĐỔI          ▲ tự quy đổi — đây là hành vi bạn muốn
```

Cột `a` (`TIMESTAMP`) là một chuỗi ký tự về mặt ý nghĩa: nó không biết `09:00` đó là ở đâu. Hai người ở hai nước đọc ra cùng con số nhưng hiểu hai thời điểm khác nhau.

> **Luật vàng cho PostgreSQL: mọi cột ghi lại "chuyện đã xảy ra" đều dùng `TIMESTAMPTZ`.** `TIMESTAMP` trần chỉ dùng cho giờ treo tường (mục ② ở trên).

MySQL đặt tên ngược lại và gây nhầm nghiêm trọng:

| MySQL | Hành vi | Tương đương Postgres |
|---|---|---|
| `DATETIME` | Không quy đổi múi giờ, 8 byte, năm 1000–9999 | `TIMESTAMP` (trần) |
| `TIMESTAMP` | **Có** quy đổi UTC ↔ `time_zone` của phiên, 4 byte | `TIMESTAMPTZ` |

MySQL `TIMESTAMP` chỉ 4 byte nên **chết vào năm 2038** (vấn đề Y2K38) trừ khi bạn dùng MySQL 8.0.28+ với kiểu mở rộng. Nhiều team MySQL chọn `DATETIME` + tự quy ước "mọi giá trị đều là UTC" và tự quy đổi ở tầng ứng dụng.

## Bẫy số một: gom nhóm theo ngày trên UTC

Đây là bug làm hai bản báo cáo lệch nhau, và nó xảy ra ở **mọi** công ty Việt Nam.

```text
Việt Nam = UTC+7

Một đơn đặt lúc 06:00 sáng ngày 02/08 (giờ VN)
   → lưu UTC là 2026-08-01 23:00

Gom nhóm thẳng trên cột UTC:
   date_trunc('day', ordered_at) → 2026-08-01
   → Đơn của ngày 02/08 bị đếm sang ngày 01/08 !
```

**7 tiếng đầu của mỗi ngày — gần 30% số giờ — bị đếm nhầm sang ngày hôm trước.** Và không ai nhìn ra cho tới lúc kế toán gọi điện.

```sql
-- ❌ SAI: gom nhóm trên UTC
SELECT date_trunc('day', ordered_at) AS ngay, sum(total_amount)
FROM orders
GROUP BY 1;

-- ✅ ĐÚNG: quy về múi giờ NGƯỜI XEM trước, rồi mới cắt ngày
SELECT date_trunc('day', ordered_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS ngay,
       sum(total_amount)
FROM orders
GROUP BY 1
ORDER BY 1;
```

Đọc `AT TIME ZONE` thế nào — đây là toán tử hai nghĩa gây rối:

```text
timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh'  →  timestamp (giờ treo tường ở VN)
timestamp   AT TIME ZONE 'Asia/Ho_Chi_Minh'  →  timestamptz (coi giá trị đó là giờ VN)

Quy tắc nhớ: nó ĐỔI KIỂU. Đưa vào tz thì ra trần, đưa vào trần thì ra tz.
```

### Lọc khoảng ngày cũng dính bẫy tương tự

```sql
-- ❌ SAI hai lần: sai múi giờ, VÀ giết index vì bọc hàm quanh cột
WHERE date_trunc('day', ordered_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = DATE '2026-08-01'

-- ✅ ĐÚNG: tính biên ở ngoài, so sánh nửa mở — cột giữ nguyên, index dùng được
WHERE ordered_at >= (DATE '2026-08-01')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
  AND ordered_at <  (DATE '2026-08-02')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
```

**Luôn dùng khoảng nửa mở `[đầu, cuối)`.** Đừng bao giờ viết `BETWEEN '2026-08-01' AND '2026-08-01 23:59:59'` — bạn vừa mất trọn dữ liệu trong giây cuối cùng, và với `timestamptz` có phần lẻ micro giây thì mất nhiều hơn thế.

### Nếu báo cáo phục vụ nhiều quốc gia

Đừng nhúng cứng tên múi giờ vào query. Lưu nó cùng dữ liệu:

```sql
-- Mỗi cửa hàng có múi giờ riêng
ALTER TABLE stores ADD COLUMN tz TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';

SELECT s.store_id,
       date_trunc('day', o.ordered_at AT TIME ZONE s.tz) AS ngay_dia_phuong,
       sum(o.total_amount)
FROM orders o
JOIN stores s USING (store_id)
GROUP BY 1, 2;
```

Nếu bảng quá lớn để tính lại mỗi lần, vật chất hoá sẵn cột ngày địa phương:

```sql
ALTER TABLE orders ADD COLUMN ngay_vn DATE
    GENERATED ALWAYS AS ((ordered_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) STORED;
CREATE INDEX orders_ngay_vn_idx ON orders(ngay_vn);
```

> Lưu ý: `GENERATED ... STORED` yêu cầu biểu thức **immutable**. `AT TIME ZONE` với tên vùng cố định là immutable trong PG 12+; với biến `TimeZone` của phiên thì không.

## Bẫy số hai: lưu lịch hẹn tương lai bằng UTC

Đây là chỗ đáp án *"lưu UTC hết"* chết hẳn.

```text
Hôm nay bạn đặt lịch: "9 giờ sáng thứ Hai tuần sau, giờ New York"
Quy đổi sang UTC lúc này → 14:00 UTC. Lưu xuống.

Cuối tuần đó, Mỹ chuyển sang giờ mùa đông (DST kết thúc).
Đọc lại 14:00 UTC → hiện ra 8 giờ sáng, không phải 9 giờ.

Cuộc hẹn của bạn vừa tự dịch đi một tiếng.
```

Và đây không phải chuyện hiếm: **mỗi năm vẫn có vài nước đổi luật giờ của họ**. Cơ sở dữ liệu múi giờ IANA phát hành nhiều bản mỗi năm (`2024a`, `2024b`, `2025a`...) chính vì thế.

```sql
-- ✅ Lịch hẹn tương lai: lưu giờ TREO TƯỜNG + TÊN VÙNG
CREATE TABLE appointments (
    appointment_id BIGSERIAL PRIMARY KEY,
    local_time     TIMESTAMP NOT NULL,     -- 2026-08-10 09:00:00 (trần, không tz)
    tz             TEXT      NOT NULL,     -- 'America/New_York'
    -- Cột tiện dụng: quy đổi lúc ĐỌC, luôn theo luật giờ mới nhất
    instant        TIMESTAMPTZ GENERATED ALWAYS AS (local_time AT TIME ZONE tz) STORED
);
```

> **Tên vùng, không phải offset.** Lưu `'America/New_York'`, đừng lưu `'-05:00'`. Offset đúng hôm nay, sai sáu tháng sau. Tên vùng chứa toàn bộ lịch sử và tương lai luật giờ của nơi đó.

Bảng quyết định cuối cùng:

| Dữ liệu | Kiểu | Vì sao |
|---|---|---|
| `created_at`, `ordered_at`, `paid_at`, log | `TIMESTAMPTZ` | Chuyện đã xảy ra — một thời điểm duy nhất |
| Lịch hẹn, lịch phát sóng, giờ mở cửa | `TIMESTAMP` + cột `tz` | Ý định "9 giờ sáng ở đó" |
| Ngày sinh, ngày hết hạn hợp đồng | `DATE` | Không có giờ, không có múi giờ |
| Giờ mở cửa hằng ngày (08:00–22:00) | `TIME` + `tz` của cửa hàng | Lặp lại mỗi ngày |
| Thời lượng, TTL, SLA | `INTERVAL` hoặc `INT` (giây) | Không phải mốc |

## Đào sâu: DST và hai loại giờ không tồn tại / tồn tại hai lần

Việt Nam không có giờ mùa hè (DST), nên dev Việt hay bỏ qua phần này — cho tới khi hệ thống có khách ở châu Âu hoặc Mỹ.

```text
Mỹ, mùa xuân: 02:00 nhảy thẳng lên 03:00
   → 02:30 KHÔNG TỒN TẠI ngày hôm đó

Mỹ, mùa thu: 02:00 quay lại 01:00
   → 01:30 TỒN TẠI HAI LẦN, cách nhau một tiếng
```

```sql
SET TimeZone = 'America/New_York';
-- Giờ không tồn tại: Postgres tự đẩy sang
SELECT TIMESTAMP '2026-03-08 02:30' AT TIME ZONE 'America/New_York';
-- 2026-03-08 07:30:00+00   ← thành 03:30 giờ địa phương

-- Giờ tồn tại hai lần: Postgres chọn lần đầu, im lặng
SELECT TIMESTAMP '2026-11-01 01:30' AT TIME ZONE 'America/New_York';
```

Hệ quả thực tế:
- Cron chạy 02:30 hằng ngày sẽ **bị bỏ qua** một ngày trong năm và **chạy hai lần** một ngày khác.
- Báo cáo "doanh thu theo giờ" sẽ có một ngày 23 giờ và một ngày 25 giờ.
- Ca làm việc đêm bắc qua mốc DST sẽ tính thừa hoặc thiếu một tiếng lương.

**Cách phòng:** cron nghiệp vụ quan trọng đặt ở UTC, hoặc đặt ngoài khung 01:00–03:00. Với tính lương theo ca, tính bằng hiệu hai `TIMESTAMPTZ` (đúng tuyệt đối) chứ đừng trừ hai giờ treo tường.

## Bộ công cụ ngày giờ hay dùng

```sql
-- Cắt về đầu kỳ
date_trunc('month', ordered_at AT TIME ZONE 'Asia/Ho_Chi_Minh')

-- Rút một thành phần
EXTRACT(dow  FROM ts)      -- 0 = Chủ nhật ... 6 = Thứ bảy
EXTRACT(isodow FROM ts)    -- 1 = Thứ hai ... 7 = Chủ nhật (chuẩn ISO, nên dùng)
EXTRACT(week FROM ts)      -- tuần ISO

-- Cộng trừ
ordered_at + INTERVAL '30 days'
ordered_at - INTERVAL '1 month'          -- lưu ý: '1 month' KHÔNG cố định số ngày

-- Khoảng cách
age(now(), created_at)                    -- ra INTERVAL đọc được: "2 years 3 mons"
EXTRACT(epoch FROM (paid_at - ordered_at))  -- ra số giây, dùng để tính trung bình

-- Sinh chuỗi ngày để lấp lỗ hổng báo cáo (xem thêm phase-4 bài 1)
SELECT generate_series(DATE '2026-01-01', DATE '2026-12-31', INTERVAL '1 day')::date;

-- Kiểm tra khoảng thời gian có chồng lấn (dùng cho đặt phòng, đặt lịch)
SELECT tstzrange(bat_dau, ket_thuc) && tstzrange($1, $2) AS bi_trung;
```

Bẫy `INTERVAL '1 month'`: cộng một tháng vào `31/01` ra `28/02` (hoặc `29/02`), và **phép cộng không giao hoán**:

```sql
SELECT DATE '2026-01-31' + INTERVAL '1 month' + INTERVAL '1 month';  -- 2026-03-28
SELECT DATE '2026-01-31' + INTERVAL '2 months';                       -- 2026-03-31
```

Với nghiệp vụ gia hạn thuê bao, phải quy định rõ luật (thường: giữ nguyên ngày, kẹp về ngày cuối tháng nếu tháng ngắn hơn) và viết ra thành hàm, đừng phó mặc cho `INTERVAL`.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Kế toán báo doanh thu ngày 01/08 trên dashboard **lệch** so với sổ của họ. Chạy lại vẫn lệch y như cũ.

**Chẩn đoán — đo đúng phần bị đếm nhầm:**

```sql
-- ① So hai cách gom nhóm trên CÙNG một ngày
SELECT
    sum(total_amount) FILTER (
        WHERE ordered_at >= '2026-08-01' AND ordered_at < '2026-08-02'
    ) AS gom_theo_utc,
    sum(total_amount) FILTER (
        WHERE ordered_at >= (DATE '2026-08-01')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
          AND ordered_at <  (DATE '2026-08-02')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ) AS gom_theo_gio_vn
FROM orders;
-- Hai con số khác nhau → ĐÃ TÌM RA NGUYÊN NHÂN

-- ② Xem chính xác những đơn bị đếm nhầm sang ngày hôm trước
SELECT count(*), min(ordered_at), max(ordered_at)
FROM orders
WHERE ordered_at >= '2026-07-31 17:00:00+00'    -- 0h ngày 01/08 giờ VN
  AND ordered_at <  '2026-08-01 00:00:00+00';   -- 7h sáng 01/08 giờ VN
-- Đây chính là 7 TIẾNG ĐẦU của ngày 01/08 bị đẩy sang 31/07
```

**Cách xử lý:**

```sql
-- ✅ Quy về múi giờ NGƯỜI XEM trước, rồi mới cắt ngày
SELECT date_trunc('day', ordered_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS ngay,
       sum(total_amount)
FROM orders
GROUP BY 1 ORDER BY 1;
```

**Chặn tái diễn:** viết một test so con số của báo cáo với một mốc đã biết chắc.

```sql
-- Đơn đặt lúc 6h sáng giờ VN PHẢI thuộc về ngày hôm đó
INSERT INTO orders (ordered_at, total_amount) VALUES ('2026-08-01 06:00+07', 100);
-- báo cáo ngày 2026-08-01 phải chứa đơn này
```

> **Tình huống 2:** Người dùng ở Mỹ đặt lịch hẹn "9 giờ sáng thứ Hai tuần sau". Tới ngày đó, hệ thống nhắc lúc **8 giờ sáng**.

**Chẩn đoán:** cuối tuần đó nước Mỹ **kết thúc giờ mùa hè**.

```sql
-- Xác nhận: cùng một giờ treo tường, hai offset khác nhau
SELECT
  (TIMESTAMP '2026-10-25 09:00' AT TIME ZONE 'America/New_York') AS truoc_doi_gio,
  (TIMESTAMP '2026-11-05 09:00' AT TIME ZONE 'America/New_York') AS sau_doi_gio;
-- 2026-10-25 13:00+00   |   2026-11-05 14:00+00
--        ▲ lệch đúng MỘT TIẾNG
```

**Nguyên nhân:** bạn quy đổi cuộc hẹn sang UTC **tại lúc đặt**, nhưng luật giờ đã đổi giữa lúc đặt và lúc diễn ra.

```sql
-- ❌ Cách sai: chốt cứng thành một thời điểm
INSERT INTO appointments (thoi_diem) VALUES ('2026-11-05 14:00+00');

-- ✅ Cách đúng: lưu Ý ĐỊNH, quy đổi lúc đọc
CREATE TABLE appointments (
    local_time TIMESTAMP NOT NULL,       -- 2026-11-05 09:00 (giờ treo tường)
    tz         TEXT      NOT NULL,       -- 'America/New_York' (TÊN VÙNG)
    instant    TIMESTAMPTZ GENERATED ALWAYS AS (local_time AT TIME ZONE tz) STORED
);
-- Luật giờ có đổi thì `instant` tự tính lại đúng — cuộc hẹn vẫn 9 giờ sáng
```

> **Lưu ý:** phải lưu **tên vùng** (`America/New_York`) chứ không lưu **offset** (`-05:00`). Offset đúng hôm nay, sai sáu tháng sau.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `TIMESTAMP` trần cho `created_at` | Không biết giờ đó ở đâu; server đổi TZ là loạn | `TIMESTAMPTZ` |
| Gom nhóm ngày trên UTC | 7 tiếng đầu mỗi ngày đếm sang hôm trước | `AT TIME ZONE` trước, `date_trunc` sau |
| `BETWEEN '...00:00' AND '...23:59:59'` | Mất dữ liệu giây/micro giây cuối | Khoảng nửa mở `>= đầu AND < cuối` |
| Bọc `date_trunc()` quanh cột trong `WHERE` | Mất index | Tính biên ngoài, so sánh trực tiếp cột |
| Lưu lịch hẹn tương lai bằng UTC | Lệch giờ khi nước đó đổi luật DST | Lưu giờ địa phương + tên vùng |
| Lưu offset `'+07:00'` thay vì tên vùng | Sai khi qua mốc DST | Luôn lưu `'Asia/Ho_Chi_Minh'` |
| `now()` vs `clock_timestamp()` | `now()` **đứng yên** suốt transaction | Dùng `clock_timestamp()` nếu cần giờ thật |
| MySQL `TIMESTAMP` 4 byte | Chết năm 2038 | `DATETIME` + quy ước UTC, hoặc MySQL 8.0.28+ |
| Cron 02:30 ở múi giờ có DST | Bỏ qua 1 ngày, chạy 2 lần 1 ngày | Đặt cron ở UTC |
| So sánh `timestamptz` với chuỗi không có tz | Postgres tự gán TZ của phiên → kết quả đổi theo client | Luôn ghi rõ tz trong literal |

Đặc biệt lưu ý `now()`:

```sql
BEGIN;
SELECT now();              -- 09:00:00
SELECT pg_sleep(3), now(); -- 09:00:00  ← VẪN THẾ, now() là giờ bắt đầu transaction
SELECT clock_timestamp();  -- 09:00:03  ← giờ thật
COMMIT;
```

Điều này là **tính năng**, không phải bug: nó đảm bảo mọi dòng ghi trong cùng một transaction có cùng dấu thời gian. Nhưng nếu bạn dùng `now()` để đo thời lượng trong một batch dài, bạn sẽ luôn ra `0`.

## Câu hỏi phỏng vấn hay gặp

**H: Lưu UTC hay giờ địa phương?**
Em hỏi lại một câu trước: **mốc này là quá khứ hay tương lai?** Chuyện đã xảy ra rồi thì lưu UTC bằng `TIMESTAMPTZ`, vì đó là một thời điểm duy nhất trên đời. Lịch hẹn tương lai thì lưu giờ địa phương kèm tên vùng IANA, vì đó là một *ý định* — luật giờ có đổi thì cuộc hẹn vẫn phải đúng 9 giờ sáng. Và khi gom nhóm theo ngày thì phải quy về múi giờ người xem trước rồi mới cắt ngày.

**H: `TIMESTAMPTZ` có lưu múi giờ không?**
Không. Cái tên gây hiểu lầm. Nó quy đổi giá trị đầu vào về UTC, lưu 8 byte UTC, vứt bỏ múi giờ gốc, rồi quy đổi ngược khi đọc theo `TimeZone` của phiên. Nếu bạn cần biết người dùng ở múi giờ nào lúc tạo bản ghi, phải lưu thêm một cột riêng.

**H: Vì sao hai bản báo cáo cùng ngày lại lệch nhau?**
Gần như chắc chắn là một bản gom nhóm trên cột UTC, bản kia quy về giờ Việt Nam trước. Việt Nam là UTC+7, nên 7 tiếng đầu mỗi ngày bị đẩy sang ngày hôm trước — khoảng 30% số giờ.

**H: DST ảnh hưởng gì tới database?**
Ở nước có DST, mỗi năm có một ngày 23 giờ và một ngày 25 giờ. Giờ 02:30 mùa xuân không tồn tại, giờ 01:30 mùa thu tồn tại hai lần. Hậu quả: cron bỏ lượt hoặc chạy hai lần, báo cáo theo giờ có lỗ hổng, tính lương theo ca lệch một tiếng. Cách phòng là chạy cron ở UTC và tính thời lượng bằng hiệu hai `TIMESTAMPTZ`.

**H: `now()` và `clock_timestamp()` khác gì?**
`now()` (và `CURRENT_TIMESTAMP`) trả về giờ **bắt đầu transaction** và đứng yên suốt transaction đó — để mọi dòng ghi cùng lô có cùng dấu thời gian. `clock_timestamp()` trả giờ thật tại thời điểm gọi. Dùng nhầm là lý do bạn đo thời lượng batch ra 0 giây.

## Tóm tắt bài 4

- Tách bạch ba thứ: **thời điểm** (UTC), **giờ treo tường** (địa phương + tên vùng), **ngày lịch** (`DATE`).
- `TIMESTAMPTZ` **không lưu múi giờ** — nó quy đổi về UTC khi ghi và quy đổi ngược khi đọc. Đây là kiểu mặc định cho mọi cột "chuyện đã xảy ra".
- Gom nhóm theo ngày phải `AT TIME ZONE` trước rồi mới `date_trunc` — nếu không, 7 tiếng đầu mỗi ngày bị đếm sang hôm trước.
- Lọc khoảng ngày dùng **khoảng nửa mở** và giữ cột trần trong `WHERE` để không mất index.
- Lịch hẹn tương lai **không lưu UTC** — lưu giờ địa phương + **tên vùng IANA**, không lưu offset.
- Cẩn thận DST (giờ không tồn tại / tồn tại hai lần), `INTERVAL '1 month'` không cố định số ngày, và `now()` đứng yên trong transaction.

**Bài kế tiếp** → [Bài 5: Khoá chính — auto increment, UUID v4 hay v7?](05-khoa-chinh-auto-increment-uuid-v4-hay-v7.md)
