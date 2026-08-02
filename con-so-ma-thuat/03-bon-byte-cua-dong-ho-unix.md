# Bài 3: 4 byte — cái đồng hồ sẽ dừng vào năm 2038

Gói thuê bao 15 năm. Ngày đáo hạn rơi vào `2040-03-15`.

Bạn gõ vào bảng. Nó thành `0000-00-00`.

Không báo lỗi. Không cảnh báo. Cột bên cạnh vẫn nhận `1980-05-12` bình thường — chỉ riêng cái năm 2040 kia là không.

Cái trần đó được chốt vào năm nào?

```text
        1971          1985          1995
```

Giữ lấy con số bạn vừa chọn. Và câu mà ai cũng buột miệng nói khi lần đầu gặp con số 2038:

> *"Lười thật. 4 byte thì tiết kiệm được bao nhiêu? Sao không lấy số to hơn ngay từ đầu?"*

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Epoch** | i-póc | **Mốc gốc thời gian** — điểm 0 để đếm từ đó; Unix chọn `1970-01-01 00:00:00 UTC` |
| **Unix timestamp** | | **Số giây đã trôi qua** kể từ mốc gốc |
| **Y2K38** | oai-tu-kây-38 | **Sự cố năm 2038** — số nguyên 4 byte có dấu tràn vào `19/01/2038` |
| **Signed / unsigned** | sain-đờ | **Có dấu / không dấu** — có dấu dành 1 bit cho âm/dương |
| **Integer overflow** | óp-vơ-phlâu | **Tràn số** — vượt trần thì quay vòng về số âm |
| **PDP-11** | | Máy tính Unix đầu tiên chạy trên, có 24 KB RAM |
| **Word** | uợt | **Từ nhớ** — đơn vị ô nhớ của CPU; PDP-11 dùng 16 bit |
| **Inode** | ai-nôt | **Hồ sơ tệp** — bản ghi mô tả một tệp trên đĩa |
| **`TIMESTAMP`** | | Kiểu SQL lưu **số giây từ epoch**; MySQL dùng 4 byte |
| **`DATETIME`** | | Kiểu SQL lưu **thành phần ngày giờ**, không đổi theo múi giờ |
| **`TIMESTAMPTZ`** | | Kiểu PostgreSQL lưu **8 byte**, chạy tới năm 294276 |
| **`time_t`** | thai-em ti | Kiểu C biểu diễn thời gian; nhiều hệ cũ định nghĩa là 4 byte |
| **NTP** | en-ti-pi | **Giao thức đồng bộ giờ** qua mạng; nó có mốc tràn riêng vào 2036 |
| **Leap second** | líp | **Giây nhuận** — giây thêm vào để bù lệch vòng quay Trái Đất |

## Tua ngược về phòng thí nghiệm Bell, năm 1971

**1971.** Bản Unix đầu tiên chạy được, và nó cần biết giờ. Người ta cho nó một đồng hồ đếm bằng số nguyên, gốc đặt ở `01-01-1971`.

Nhưng nó **không đếm bằng giây**.

### Ràng buộc ① — cái đồng hồ đầu tiên chỉ sống được **828 ngày**

```text
   NÓ ĐẾM BẰNG 1/60 GIÂY.

   Vì sao? Vì màn hình và bàn phím thời đó đều chạy theo nhịp
   điện lưới 60 Hz. Mỗi nhịp điện là một tích.

   "Đếm mịn hơn thì đo chính xác hơn" — nghe rất hợp lý.

   VẬY CÁI ĐỒNG HỒ ĐÓ SỐNG ĐƯỢC BAO LÂU VỚI SỐ NGUYÊN 4 BYTE?

        2³¹ − 1  =  2.147.483.647 nhịp
        ÷ 60 nhịp/giây
        = 35.791.394 giây
        = 414 ngày                       ← CHƯA TỚI 14 THÁNG
```

```text
   MỊN GẤP 60 LẦN THÌ TUỔI THỌ CHIA CHO 60.

   Cái đồng hồ cạn TRƯỚC CẢ KHI bản Unix thứ ba kịp ra đời.

   → Năm 1973 họ đổi: bỏ nhịp điện, đếm thẳng bằng GIÂY.
     Cùng một con số 4 byte, tuổi thọ nhảy từ hơn một năm lên 68 NĂM.

   → Và họ lùi gốc về 01-01-1970 cho tròn thập niên.
     Mốc đó tới giờ vẫn là điểm 0 của gần như mọi cột thời gian
     bạn từng khai: created_at, updated_at, expires_at.
```

> **Cửa 1 đã đóng:** phương án *"đếm mịn hơn cho chính xác"* đã được thử và **bị loại năm 1973**, vì 4 byte đếm 1/60 giây chỉ chứa nổi hơn một năm.

### Ràng buộc ② — máy có **24 KB RAM** và ô nhớ **16 bit**

```text
   CHIẾC PDP-11 CAO BẰNG CÁI TỦ LẠNH. CẢ PHÒNG CHỈ CÓ MỘT CHIẾC.

      24 KB RAM cho CẢ hệ điều hành + chương trình + dữ liệu
      Ô nhớ rộng 16 bit

   NGHĨA LÀ MỘT CON SỐ 4 BYTE (32 bit) ĐÃ PHẢI GHÉP HAI Ô NHỚ:

      Phép cộng 32 bit  =  2 lệnh assembly (ADD rồi ADC)
                           thay vì 1 lệnh

   → 4 byte đã là KIỂU SỐ ĐẮT NHẤT HỌ DÁM DÙNG.
```

```text
   "SAO KHÔNG LẤY 8 BYTE CHO CHẮC?"

      8 byte = 4 ô nhớ  →  4 lệnh cho mỗi phép cộng
      PDP-11 thời đó CÒN KHÔNG CÓ LỆNH NHÂN/CHIA BẰNG PHẦN CỨNG

   → Đổi lấy tuổi thọ dài hơn bằng cách làm MỌI chương trình
     chậm đi gấp bốn ở phép tính thời gian — cái giá không thể trả.
```

> **Cửa 2 đã đóng:** phần cứng **loại bỏ** phương án 8 byte.

### Ràng buộc ③ — hồ sơ tệp chỉ rộng **32 byte**

```text
   MỖI TỆP TRÊN ĐĨA CÓ MỘT TẤM HỒ SƠ (INODE) RỘNG ĐÚNG 32 BYTE.
   Trong 32 byte đó, hai mốc giờ đã ăn hết 8 byte — MỘT PHẦN TƯ.

   ┌────────────────────────────────────────────────┐
   │ INODE — 32 byte                                 │
   ├──────┬──────┬────────┬────────┬────────────────┤
   │ mode │ links│ mtime  │ atime  │  block ptrs... │
   │      │      │  4B    │  4B    │                │
   └──────┴──────┴────────┴────────┴────────────────┘
                    └── 8 byte = 25% cả tấm hồ sơ ──┘

   "SAO KHÔNG GHI NGÀY THÁNG RA CHUỖI CHO DỄ ĐỌC?"

      "1971-11-03 14:22:05"  =  19 byte MỘT MỐC
      Hai mốc                =  38 byte
                                 ▲
                    VƯỢT QUÁ KÍCH THƯỚC CẢ TẤM HỒ SƠ 32 BYTE
```

```text
   VÀ CÒN MỘT LỢI ÍCH NỮA CỦA SỐ NGUYÊN MÀ CHUỖI KHÔNG CÓ:

   Khoảng cách giữa hai mốc giờ:
      · Số nguyên  →  TRỪ HAI SỐ, xong trong 1 lệnh CPU
      · Chuỗi      →  phải tra lịch, biết tháng nào 31 ngày,
                       năm nào nhuận, múi giờ nào lệch bao nhiêu

   → Đây là lý do CĂN BẢN vì sao thời gian được lưu bằng SỐ,
     và nó vẫn đúng cho tới hôm nay.
```

> **Cửa 3 đã đóng:** hồ sơ tệp 32 byte **loại bỏ** phương án ghi ngày tháng ra chuỗi.

## Ba lý do đã hết hiệu lực — vậy sao 4 byte vẫn còn?

```text
   ① Đếm 1/60 giây   →  ĐÃ SỬA TỪ NĂM 1973
   ② PDP-11 24 KB    →  điện thoại của bạn có RAM gấp 350.000 lần;
                         CPU 64 bit cộng số 64 bit trong ĐÚNG 1 LỆNH
   ③ Inode 32 byte   →  ext4/NTFS hiện đại rộng 256 byte,
                         chứa mốc thời gian tới tận năm 2446

   KHÔNG TẤM NÀO CÒN HIỆU LỰC.
   VẬY SAO CON SỐ 4 BYTE VẪN NẰM NGUYÊN CHỖ CŨ?
```

```text
   ┌────────────────────────────────────────────────────────────┐
   │                                                             │
   │  VÌ NÓ KHÔNG NẰM TRONG MÃ NGUỒN.                           │
   │  NÓ NẰM TRONG DỮ LIỆU ĐÃ GHI RA ĐĨA.                       │
   │                                                             │
   │  Hàng tỷ ổ đĩa, hàng tỷ cơ sở dữ liệu, hàng tỷ file nhị     │
   │  phân đã ghi theo cấu trúc 4 byte. Đổi mã nguồn thì dễ;     │
   │  đổi dữ liệu đã ghi thì phải đổi ĐỒNG THỜI với mọi thứ      │
   │  đang đọc nó.                                               │
   │                                                             │
   │  → KHÔNG AI GIỮ NÓ LẠI. CHỈ LÀ KHÔNG AI GỠ NÓ RA MỘT MÌNH  │
   │    ĐƯỢC.                                                    │
   └────────────────────────────────────────────────────────────┘
```

Bạn đã gặp đúng khuôn mẫu này ở [bài 1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) với IPv6 và [bài 2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) với MTU 1500. Ba con số, ba lĩnh vực khác nhau, **một lý do giống hệt nhau**.

```text
   ĐIỂM CÔNG BẰNG CẦN NÓI RÕ:

   Năm 1973, con số 68 năm tuổi thọ GẤP BA LẦN toàn bộ tuổi đời
   của ngành máy tính lúc bấy giờ.

   Không ai tin có dòng lệnh nào sống lâu tới thế.
   (Và họ đã sai — nhưng sai theo hướng mà không ai đoán được.)
```

## Kiến trúc: chuyện gì xảy ra lúc 03:14:07 UTC ngày 19/01/2038

```text
   SỐ NGUYÊN 4 BYTE CÓ DẤU — 1 bit dành cho dấu, 31 bit cho giá trị:

   TRẦN:  2³¹ − 1  =  2.147.483.647 giây
                    =  19/01/2038, 03:14:07 UTC

   THÊM MỘT GIÂY NỮA:

   01111111 11111111 11111111 11111111   =  +2.147.483.647
                                            (19/01/2038 03:14:07)
                    ↓  +1
   10000000 00000000 00000000 00000000   =  −2.147.483.648
                                            (13/12/1901 20:45:52)
   ▲
   BIT DẤU BỊ LẬT → THỜI GIAN NHẢY NGƯỢC VỀ NĂM 1901.
```

```text
   HỆ QUẢ THỰC TẾ, XẾP THEO MỨC ĐỘ:

   ┌─────────────────────────────────────────────────────────────┐
   │ ① Chứng chỉ TLS hết hạn ngay lập tức  →  mọi HTTPS đứt      │
   │ ② Token/phiên đăng nhập "đã hết hạn"  →  không ai vào được  │
   │ ③ Cache tính TTL âm                    →  hoặc mãi không hết│
   │    hạn, hoặc hết hạn ngay lập tức                            │
   │ ④ Job theo lịch chạy loạn hoặc không chạy                   │
   │ ⑤ Bản ghi mới có created_at = 1901     →  sắp xếp sai       │
   │ ⑥ Tính tuổi/thâm niên ra số âm                              │
   └─────────────────────────────────────────────────────────────┘
```

```text
   ⚠ VÀ ĐÂY LÀ ĐIỀU QUAN TRỌNG NHẤT:

   NĂM 2038 KHÔNG PHẢI LÀ LÚC BẠN GẶP VẤN ĐỀ.
   BẠN GẶP NÓ NGAY HÔM NAY, MỖI KHI LƯU MỘT NGÀY TRONG TƯƠNG LAI.

   · Hợp đồng thuê bao 15 năm     →  2041
   · Bảo hành trọn đời             →  ?
   · Ngày hết hạn thẻ tín dụng     →  2039
   · Lịch trả góp 20 năm           →  2046
   · Ngày nghỉ hưu của nhân viên   →  2055
   · Ngày hết hạn hộ chiếu         →  2040
```

## Hai nhánh sinh ra từ quyết định 1971

```text
   ┌──────────────────────────────────────────────────────────────┐
   │ NHÁNH ĐẾM GIÂY  →  TIMESTAMP                                 │
   │                                                               │
   │   Lưu: một số nguyên đếm giây từ epoch                       │
   │   MySQL: 4 byte  →  CHẾT NGÀY 19/01/2038                     │
   │   PostgreSQL TIMESTAMPTZ: 8 byte  →  tới năm 294276          │
   │                                                               │
   │   ✅ Là MỘT THỜI ĐIỂM VẬT LÝ duy nhất trên toàn cầu           │
   │   ✅ Tự quy đổi theo múi giờ người xem                        │
   │   ✅ Trừ hai số ra khoảng cách ngay                           │
   ├──────────────────────────────────────────────────────────────┤
   │ NHÁNH GHI THÀNH PHẦN  →  DATETIME                            │
   │                                                               │
   │   Lưu: năm, tháng, ngày, giờ, phút, giây rời nhau            │
   │   MySQL: 5–8 byte  →  chạy tới năm 9999                      │
   │                                                               │
   │   ✅ Không đổi theo múi giờ                                   │
   │   ❌ KHÔNG biết nó là thời điểm nào trên thực tế              │
   │      nếu không kèm múi giờ                                    │
   └──────────────────────────────────────────────────────────────┘
```

| | MySQL `TIMESTAMP` | MySQL `DATETIME` | PostgreSQL `TIMESTAMPTZ` |
|---|---|---|---|
| Dung lượng | 4 byte | 5–8 byte | 8 byte |
| Trần | **19/01/2038** ❌ | năm 9999 | năm 294276 |
| Đổi theo múi giờ | ✅ tự động | ❌ không | ✅ tự động |
| Lưu quá khứ (`created_at`) | ✅ được | ⚠️ phải tự quy ước UTC | ✅ **tốt nhất** |
| Lưu tương lai xa | ❌ **tràn** | ✅ được | ✅ được |
| Lưu lịch hẹn tương lai | ❌ | ⚠️ + cột tên vùng | ⚠️ + cột tên vùng |

## Quy tắc chọn kiểu — ba câu hỏi, không phải một

Đây là phần mà phần lớn tài liệu nói thiếu: **không có một kiểu đúng cho mọi cột thời gian.**

```text
   CÂU 1: MỐC NÀY LÀ QUÁ KHỨ HAY TƯƠNG LAI?

      QUÁ KHỨ (đã xảy ra rồi)
      → Nó là MỘT THỜI ĐIỂM VẬT LÝ DUY NHẤT.
      → TIMESTAMPTZ (Postgres) hoặc DATETIME + quy ước UTC (MySQL)

      TƯƠNG LAI (chưa xảy ra)
      → Đọc tiếp câu 2.

   CÂU 2: TƯƠNG LAI NÀY LÀ "THỜI ĐIỂM" HAY "Ý ĐỊNH"?

      THỜI ĐIỂM  ("token này hết hạn sau đúng 3600 giây")
      → vẫn là mốc vật lý → TIMESTAMPTZ / DATETIME
      → ⚠ NHƯNG PHẢI ĐỦ RỘNG. MySQL TIMESTAMP 4 byte là SAI Ở ĐÂY.

      Ý ĐỊNH  ("cuộc hẹn 9 giờ sáng thứ Hai tuần sau ở Hà Nội")
      → KHÔNG phải một thời điểm vật lý cố định!
      → Lưu GIỜ ĐỊA PHƯƠNG + TÊN VÙNG, quy đổi lúc đọc ra.

   CÂU 3: CỘT NÀY CÓ THỂ VƯỢT NĂM 2038 KHÔNG?

      CÓ  → tuyệt đối KHÔNG dùng MySQL TIMESTAMP 4 byte
      KHÔNG → dùng gì cũng được, nhưng vẫn nên tránh
```

```text
   VÌ SAO "Ý ĐỊNH" KHÔNG LƯU ĐƯỢC BẰNG MỐC TUYỆT ĐỐI:

   Bạn đặt lịch họp 9:00 sáng ngày 15/03/2027 tại Hà Nội.
   Quy đổi sang UTC: 02:00 ngày 15/03/2027.

   Nhưng mỗi năm vẫn có vài quốc gia ĐỔI LUẬT MÚI GIỜ của họ.
   Bảng múi giờ (tz database) ra vài bản mỗi năm.

   Nếu Việt Nam đổi múi giờ (giả sử), cuộc hẹn 02:00 UTC của bạn
   sẽ hiển thị thành 8:00 hoặc 10:00 — KHÔNG CÒN LÀ 9 GIỜ SÁNG NỮA.

   → Lưu "2027-03-15 09:00" + "Asia/Ho_Chi_Minh".
     Luật giờ có đổi thì cuộc hẹn VẪN ĐÚNG 9 GIỜ SÁNG.
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Khách hàng mua gói thuê bao 15 năm. Hoá đơn tạo thành công, nhưng cột `expires_at` trong database là `0000-00-00 00:00:00`. Không có lỗi nào trong log.

**Chẩn đoán:**

```sql
-- ① Kiểm tra kiểu cột
SHOW CREATE TABLE subscriptions\G
--  `expires_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
--   ▲ TIMESTAMP 4 byte → trần 19/01/2038
```

```sql
-- ② Xác nhận bằng cách thử trực tiếp
INSERT INTO subscriptions (user_id, expires_at) VALUES (1, '2040-03-15 00:00:00');
SELECT expires_at FROM subscriptions WHERE user_id = 1;
--  0000-00-00 00:00:00        ← CẮT ÂM THẦM, không exception
```

```sql
-- ③ Vì sao im lặng? Kiểm tra chế độ nghiêm ngặt
SELECT @@sql_mode;
--  NO_ENGINE_SUBSTITUTION
--  ▲ THIẾU STRICT_TRANS_TABLES → MySQL nuốt lỗi và ghi giá trị rác
```

```sql
-- ④ Quét toàn bộ lược đồ tìm các cột cùng rủi ro
SELECT table_name, column_name, column_type
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND data_type = 'timestamp'
  AND column_name RLIKE 'expir|end|due|until|valid|renew|maturity|retire';
```

```text
   table_name      | column_name  | column_type
   ----------------+--------------+-------------
   subscriptions   | expires_at   | timestamp      ← rủi ro
   contracts       | valid_until  | timestamp      ← rủi ro
   warranties      | ends_at      | timestamp      ← rủi ro
   cards           | expires_at   | timestamp      ← rủi ro
   employees       | retire_date  | timestamp      ← rủi ro
```

**Cách xử lý — di chuyển an toàn trên bảng lớn:**

```sql
-- BƯỚC 1: bật chế độ nghiêm ngặt để lỗi KÊU LÊN thay vì nuốt im
SET GLOBAL sql_mode = CONCAT(@@sql_mode, ',STRICT_TRANS_TABLES');
-- và ghi vào my.cnf để không mất khi khởi động lại

-- BƯỚC 2: thêm cột mới, KHÔNG đụng cột cũ
ALTER TABLE subscriptions ADD COLUMN expires_at_new DATETIME NULL;

-- BƯỚC 3: chép dữ liệu theo lô, tránh khoá bảng lâu
--    (chạy lặp cho tới khi hết dòng)
UPDATE subscriptions SET expires_at_new = expires_at
WHERE expires_at_new IS NULL AND id > :last_id
ORDER BY id LIMIT 5000;

-- BƯỚC 4: ghi song song cả hai cột ở tầng ứng dụng, chạy vài ngày
-- BƯỚC 5: đối chiếu
SELECT count(*) FROM subscriptions
WHERE expires_at_new <> expires_at OR (expires_at_new IS NULL) <> (expires_at IS NULL);
--  0    ← phải bằng 0 mới đi tiếp

-- BƯỚC 6: đổi tên, giữ cột cũ thêm một thời gian
ALTER TABLE subscriptions
    RENAME COLUMN expires_at     TO expires_at_old,
    RENAME COLUMN expires_at_new TO expires_at;

-- BƯỚC 7: sau 30 ngày yên ổn mới xoá cột cũ
```

```text
   ⚠ VÌ SAO KHÔNG DÙNG "ALTER TABLE ... MODIFY COLUMN" MỘT PHÁT:

   · Khoá bảng và viết lại toàn bộ dữ liệu — bảng lớn là downtime dài
   · KHÔNG CÓ ĐƯỜNG LÙI nếu phát hiện sai
   · Những dòng đã bị hỏng thành 0000-00-00 sẽ chuyển thành
     giá trị rác hoặc gây lỗi giữa chừng

   → Với bảng lớn, dùng pt-online-schema-change hoặc gh-ost.
```

**Chặn tái diễn:**

```sql
-- Kiểm tra tự động trong CI: cấm TIMESTAMP cho cột có thể lưu tương lai
SELECT concat(table_name, '.', column_name) AS vi_pham
FROM information_schema.columns
WHERE table_schema = DATABASE() AND data_type = 'timestamp'
  AND column_name RLIKE 'expir|end|due|until|valid|renew|maturity|retire';
-- Trả về dòng nào → CI ĐỎ
```

```java
@Test
void khong_cot_nao_dung_timestamp_4_byte_cho_ngay_tuong_lai() {
    List<String> viPham = jdbc.queryForList(SQL_TREN, String.class);
    assertThat(viPham)
        .as("Cột lưu ngày tương lai dùng TIMESTAMP sẽ tràn năm 2038")
        .isEmpty();
}
```

> **Tình huống 2:** Ứng dụng chạy tốt trên máy dev nhưng trên một máy chủ cũ (32 bit), mọi tính toán liên quan tới ngày sau 2038 đều sai. Cùng một mã nguồn.

**Chẩn đoán — vấn đề ở `time_t` của hệ điều hành, không ở database:**

```c
// Kiểm tra kích thước time_t trên máy đó
#include <stdio.h>
#include <time.h>
int main() { printf("sizeof(time_t) = %zu byte\n", sizeof(time_t)); }
```

```text
   Máy 64 bit hiện đại:  sizeof(time_t) = 8 byte   ✅
   Máy 32 bit / hệ cũ:   sizeof(time_t) = 4 byte   ❌
```

```bash
# Thử trực tiếp
date -d "@2147483648"
#   Máy 64 bit:  Tue Jan 19 03:14:08 UTC 2038      ✅
#   Máy 32 bit:  date: invalid date                 ❌
```

```text
   ⚠ CHỖ NÀY DỄ BỎ SÓT — Y2K38 KHÔNG CHỈ Ở DATABASE:

   · time_t 32 bit trên hệ điều hành cũ
   · Thiết bị nhúng, IoT, router, thiết bị công nghiệp
   · Định dạng file nhị phân tự chế lưu timestamp 4 byte
   · Giao thức mạng có trường timestamp 4 byte
   · NTP có mốc tràn RIÊNG vào năm 2036 — SỚM HƠN 2038
   · Cookie/JWT với trường exp là số nguyên 4 byte
   · Filesystem cũ: ext3 chỉ tới 2038
```

**Cách xử lý:**

```bash
# ① Trên Linux 32 bit, biên dịch lại với time_t 64 bit (glibc 2.34+)
gcc -D_TIME_BITS=64 -D_FILE_OFFSET_BITS=64 app.c
```

```java
// ② Trong Java, dùng kiểu có sẵn 64 bit — Java không có vấn đề này
Instant.ofEpochSecond(2_147_483_648L);   // chạy bình thường
// ⚠ NHƯNG cẩn thận khi ép sang int:
int sai = (int) Instant.now().plus(365*20, DAYS).getEpochSecond();  // TRÀN
```

```javascript
// ③ JavaScript: Date dùng mili giây 64 bit float → an toàn tới năm 275760
// NHƯNG nếu bạn tự chuyển sang giây và dùng bitwise thì tràn:
const sai = Date.now() / 1000 | 0;    // | 0 ép về int32 → TRÀN NĂM 2038
const dung = Math.floor(Date.now() / 1000);
```

**Chặn tái diễn:**

```bash
# Test hạ tầng: mọi môi trường phải xử lý được mốc sau 2038
#!/usr/bin/env bash
MOC=2147483648        # 19/01/2038 03:14:08
date -d "@$MOC" >/dev/null 2>&1 \
  || { echo "FAIL: hệ thống không xử lý được mốc sau 2038"; exit 1; }
```

> **Tình huống 3:** Báo cáo doanh thu "ngày mùng 1" ra hai con số khác nhau tuỳ người chạy. Không ai đổi code.

**Chẩn đoán — đây là vấn đề múi giờ, họ hàng gần của bài này:**

```sql
-- Bản báo cáo A (đúng): gom theo giờ Việt Nam
SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS ngay,
       sum(total) FROM orders GROUP BY 1;

-- Bản báo cáo B (sai): gom thẳng trên UTC
SELECT date_trunc('day', created_at) AS ngay, sum(total) FROM orders GROUP BY 1;
```

```text
   MỘT ĐƠN ĐẶT LÚC 6 GIỜ SÁNG GIỜ VIỆT NAM
   → LƯU LÀ 23:00 NGÀY HÔM TRƯỚC THEO UTC

   → 7 tiếng đầu của mỗi ngày (gần 30% số giờ) BỊ ĐẾM SANG NGÀY HÔM TRƯỚC.
   → Không ai nhìn ra cho tới lúc kế toán đối chiếu.
```

**Cách xử lý:**

```sql
-- Lưu vẫn cứ lưu UTC. Nhưng ĐỔI MÚI GIỜ TRƯỚC RỒI MỚI CẮT NGÀY.
SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS ngay,
       sum(total_amount) AS doanh_thu
FROM orders
WHERE created_at >= (DATE '2026-08-01' AT TIME ZONE 'Asia/Ho_Chi_Minh')
  AND created_at <  (DATE '2026-09-01' AT TIME ZONE 'Asia/Ho_Chi_Minh')
GROUP BY 1 ORDER BY 1;
```

```text
   ⚠ CHÚ Ý MỆNH ĐỀ WHERE: điều kiện lọc cũng phải quy đổi,
     và phải viết dạng ">= đầu kỳ AND < đầu kỳ sau" chứ KHÔNG
     dùng BETWEEN với '23:59:59' — sẽ mất dữ liệu trong giây cuối.
```

**Chặn tái diễn:**

```sql
-- Đưa múi giờ báo cáo thành hằng số dùng chung, đừng rải khắp nơi
CREATE OR REPLACE VIEW v_orders_local AS
SELECT o.*, (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS ngay_dia_phuong
FROM orders o;
-- Mọi báo cáo dùng ngay_dia_phuong, không ai tự quy đổi lại
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| MySQL `TIMESTAMP` cho ngày tương lai | **Tràn năm 2038** → `0000-00-00`, im lặng | `DATETIME`, hoặc PostgreSQL `TIMESTAMPTZ` |
| MySQL không bật `STRICT_TRANS_TABLES` | Giá trị **bị nuốt im lặng**, không exception | Bật chế độ nghiêm ngặt |
| Nghĩ Y2K38 là chuyện của năm 2038 | Gặp **ngay hôm nay** với hợp đồng, bảo hành, thẻ | Quét lược đồ tìm cột lưu tương lai |
| Chỉ kiểm tra database | `time_t` 32 bit, **NTP tràn năm 2036**, ext3, IoT | Kiểm tra cả hệ điều hành và giao thức |
| `ALTER TABLE MODIFY` một phát trên bảng lớn | Khoá bảng lâu, **không có đường lùi** | Cột mới → ghi song song → đổi tên |
| Lưu lịch hẹn tương lai bằng mốc UTC | Luật múi giờ đổi → **cuộc hẹn dịch một tiếng** | Giờ địa phương + **tên vùng** |
| Gom nhóm báo cáo thẳng trên UTC | **30% số giờ bị đếm sang ngày hôm trước** | `AT TIME ZONE` **trước** khi cắt ngày |
| `BETWEEN ... AND '23:59:59'` | Mất dữ liệu trong giây cuối cùng | `>= đầu kỳ AND < đầu kỳ sau` |
| JavaScript `Date.now()/1000 \| 0` | `\| 0` ép về **int32** → tràn năm 2038 | `Math.floor(Date.now()/1000)` |
| Java ép `long` epoch sang `int` | Tràn im lặng | Giữ nguyên `long`/`Instant` |
| Lưu offset (`+07:00`) thay vì tên vùng | Không xử lý được giờ mùa hè và đổi luật | Lưu `Asia/Ho_Chi_Minh` |

## Câu hỏi phỏng vấn hay gặp

**H: Y2K38 là gì và vì sao nó tồn tại?**
Unix đếm thời gian bằng số giây từ mốc `1970-01-01`, lưu trong số nguyên 4 byte có dấu. Trần là 2.147.483.647 giây, tức **03:14:07 UTC ngày 19/01/2038**, và thêm một giây nữa thì bit dấu lật, thời gian nhảy ngược về năm 1901. Lý do chọn 4 byte năm đó rất cụ thể: máy PDP-11 có **24 KB RAM cho cả máy** và ô nhớ chỉ 16 bit, nên số 4 byte đã phải ghép hai ô và mất hai lệnh assembly cho mỗi phép cộng — dùng 8 byte là bốn lệnh, mà máy đó **còn không có lệnh nhân chia bằng phần cứng**. Thêm nữa, hồ sơ tệp trên đĩa chỉ rộng 32 byte mà hai mốc giờ đã ăn 8 byte; ghi ngày tháng ra chuỗi thì hai mốc mất 38 byte, **vượt cả tấm hồ sơ**.

**H: Điều thú vị nhất về mốc epoch là gì?**
Đồng hồ đầu tiên năm 1971 **không đếm bằng giây mà đếm bằng 1/60 giây**, theo nhịp điện lưới 60 Hz. Mịn gấp 60 lần thì tuổi thọ chia cho 60 — cái đồng hồ đó chỉ sống được **hơn một năm**, cạn trước cả khi bản Unix thứ ba ra đời. Năm 1973 họ bỏ nhịp điện, đếm thẳng bằng giây, và cùng con số 4 byte đó tuổi thọ nhảy lên 68 năm. Họ cũng lùi mốc gốc về `1970-01-01` cho tròn thập niên — và mốc đó tới giờ vẫn là điểm 0 của gần như mọi cột thời gian. Nói cách khác, phương án "đếm mịn hơn cho chính xác" **đã được thử và bị loại từ 1973**.

**H: Vấn đề 2038 có phải chuyện của năm 2038 không?**
Không, nó là chuyện của **hôm nay**. Bạn gặp nó mỗi khi lưu một ngày trong tương lai: hợp đồng thuê bao 15 năm ra 2041, ngày hết hạn thẻ ra 2039, lịch trả góp 20 năm ra 2046, ngày nghỉ hưu ra 2055. Và điều nguy hiểm nhất là **MySQL không bật chế độ nghiêm ngặt sẽ nuốt lỗi im lặng** — bạn nhận `0000-00-00` chứ không nhận exception nào. Nên việc đầu tiên em làm là quét `information_schema.columns` tìm mọi cột `TIMESTAMP` có tên gợi ý tương lai như `expir`, `until`, `valid`, `due`, `retire`, rồi biến câu quét đó thành một test trong CI.

**H: `TIMESTAMP` và `DATETIME` khác nhau thế nào, khi nào dùng cái nào?**
`TIMESTAMP` lưu số giây từ epoch nên nó là **một thời điểm vật lý duy nhất** và tự quy đổi theo múi giờ người xem, nhưng MySQL chỉ dành 4 byte nên **chết năm 2038**. `DATETIME` lưu các thành phần ngày giờ rời nhau, tốn 5–8 byte, chạy tới năm 9999, nhưng **không đổi theo múi giờ** nên tự nó không biết là thời điểm nào nếu không kèm quy ước. Em chọn theo ba câu hỏi: mốc này là **quá khứ hay tương lai**; nếu tương lai thì nó là **thời điểm hay ý định**; và **có thể vượt 2038 không**. Trên PostgreSQL thì `TIMESTAMPTZ` 8 byte giải quyết gần hết, chạy tới năm 294276.

**H: Lịch hẹn tương lai thì lưu thế nào?**
Đây là chỗ mà "cứ lưu UTC hết cho chuẩn" **sai**. Lưu UTC là chốt cứng một thời điểm vật lý, nhưng một cuộc hẹn không phải thời điểm — nó là một **ý định**: "9 giờ sáng thứ Hai tuần sau ở Hà Nội". Mỗi năm vẫn có vài quốc gia đổi luật múi giờ, và bảng múi giờ ra vài bản mỗi năm; nếu bạn đã quy đổi cứng sang UTC thì cuộc hẹn sẽ **tự dịch đi một tiếng** khi luật đổi. Nên với sự kiện tương lai em lưu **giờ địa phương kèm tên vùng** như `Asia/Ho_Chi_Minh`, và quy đổi lúc đọc ra — lưu tên vùng chứ không lưu offset `+07:00`, vì offset không xử lý được giờ mùa hè và không xử lý được việc đổi luật.

**H: Y2K38 chỉ ở database thôi phải không?**
Không, và đây là chỗ hay bị bỏ sót. `time_t` trên hệ điều hành 32 bit vẫn là 4 byte, nên cùng một mã nguồn chạy đúng trên máy dev 64 bit mà sai trên máy chủ cũ. Ngoài ra còn thiết bị nhúng và IoT, định dạng file nhị phân tự chế, filesystem ext3, trường `exp` trong JWT, và đáng chú ý là **NTP có mốc tràn riêng vào năm 2036 — sớm hơn 2038 hai năm**. Ngay cả trong JavaScript, `Date` dùng mili giây 64 bit nên an toàn, nhưng viết `Date.now() / 1000 | 0` thì toán tử `| 0` ép về int32 và vẫn tràn năm 2038.

**H: Ba con số 32 bit, 1500 byte và 4 byte có điểm gì chung?**
Cả ba đều là quyết định **hợp lý với ràng buộc lúc đó**: 32 bit là gấp 20 triệu lần số máy đang có, 1500 byte vừa đúng bộ đệm card mạng rẻ nhất, 4 byte là kiểu số đắt nhất mà PDP-11 dám dùng. Cả ba ràng buộc đó **đều đã hết hiệu lực**. Và cả ba con số **vẫn còn nguyên**, vì cùng một lý do: **thay đổi chúng đòi hỏi mọi bên cùng hành động**. IPv6 cần mọi nhà mạng đồng ý, MTU cần mọi trạm trên tuyến đồng ý, và 4 byte thì **nằm trong dữ liệu đã ghi ra đĩa** chứ không nằm trong mã nguồn. Không ai giữ chúng lại — chỉ là không ai gỡ ra một mình được. Bài học em rút ra là khi chốt một con số hôm nay, nên tự hỏi *ràng buộc nào ở đây sẽ hết hiệu lực trước, mà con số thì vẫn nằm đó*.

## Tóm tắt bài 3

- **Epoch bắt đầu năm 1971**, sớm hơn phần lớn người đoán — và đồng hồ đầu tiên đếm **1/60 giây**, chỉ sống được hơn một năm.
- Năm 1973 đổi sang đếm giây: cùng 4 byte, tuổi thọ từ hơn 1 năm lên **68 năm**, và mốc gốc lùi về `1970-01-01`.
- Ba ràng buộc: đếm mịn thì tuổi thọ chia 60; **PDP-11 24 KB RAM, ô nhớ 16 bit, không có lệnh nhân chia**; **inode 32 byte** khiến ghi ngày ra chuỗi là bất khả thi.
- Cả ba đã hết hiệu lực, nhưng 4 byte vẫn còn vì nó **nằm trong dữ liệu đã ghi ra đĩa**, không nằm trong mã nguồn.
- **Y2K38 là vấn đề của hôm nay**, không phải của năm 2038 — mọi hợp đồng, bảo hành, ngày hết hạn thẻ đều chạm trần.
- MySQL không bật `STRICT_TRANS_TABLES` sẽ **nuốt lỗi im lặng** và ghi `0000-00-00`.
- Chọn kiểu theo **ba câu hỏi**: quá khứ hay tương lai; thời điểm hay ý định; có vượt 2038 không.
- **Lịch hẹn tương lai lưu giờ địa phương + tên vùng**, không lưu UTC — vì luật múi giờ đổi thì cuộc hẹn tự dịch.
- Y2K38 **không chỉ ở database**: `time_t` 32 bit, IoT, ext3, JWT, và **NTP tràn năm 2036 — sớm hơn**.
- Di chuyển an toàn: **cột mới → ghi song song → đối chiếu → đổi tên → xoá sau 30 ngày**, đừng `ALTER MODIFY` một phát.

> *Ràng buộc nào trong con số bạn chốt hôm nay sẽ hết hiệu lực trước, mà con số thì vẫn nằm đó?*

**Quay lại** → [Bài 2: 1500 byte của gói tin](02-mot-nghin-nam-tram-byte-cua-goi-tin.md)

**Về mục lục** → [README khoá học](README.md)
