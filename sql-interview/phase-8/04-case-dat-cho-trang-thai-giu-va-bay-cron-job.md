# Bài 4: Case đặt chỗ — trạng thái giữ và bẫy cron job

23 giờ 47 phút, suất chiếu lúc nửa đêm. Trên sơ đồ ghế của rạp, chỉ còn **một ghế duy nhất: H7**.

Hai người ở hai đầu thành phố, không hề quen nhau, và cả hai đang cùng nhìn vào nó. Hai ngón tay chạm vào cùng một ô, cách nhau **40 mili giây**. Hai vòng tròn chờ cùng quay, rồi hai màn hình cùng hiện một dòng chữ y hệt nhau: **"Đặt vé thành công"**.

Hai tấm vé được in ra. Cùng một rạp, cùng một suất chiếu, và **cùng một số ghế**. Hệ thống trừ tiền của cả hai người, không do dự lấy một mili giây — nó tin rằng nó vừa làm đúng.

0 giờ 5 phút, đèn rạp đã tắt. Hai người đứng cạnh nhau ở cuối hàng H, hai tấm vé giống hệt nhau trong tay. Trước mặt họ chỉ có **một cái ghế**.

Không ai hack. Không ai gian lận. Không có bug. Database vẫn chạy đúng từng chữ bạn ra lệnh.

## Bài này khác gì bài flash sale?

[Bài 1](01-flash-sale-va-chong-ban-qua-hang.md) giải bài toán **N món hàng giống hệt nhau, hàng vạn người tranh**. Bài này khác ở ba điểm, và ba điểm đó tạo ra ba lớp vấn đề mới:

```text
   FLASH SALE                          ĐẶT CHỖ
   ─────────────────────────────       ─────────────────────────────
   10 chiếc iPhone GIỐNG HỆT NHAU      Ghế H7 là DUY NHẤT, có DANH TÍNH
   → ai cũng vui khi nhận được         → bạn muốn ĐÚNG ghế đó, không phải ghế khác

   Trừ kho là XONG                     Có TRẠNG THÁI TRUNG GIAN
                                        → chọn ghế → nhập thẻ → chờ OTP → 10 phút
                                        → trong 10 phút đó, ghế H7 là cái gì?

   Mua 1 món                            Đặt NHIỀU ghế cùng lúc
                                        → và đây là nơi DEADLOCK sinh ra
```

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **Race condition** | **Điều kiện tranh đua** — hai tiến trình chạy đua trên cùng một dòng dữ liệu |
| **Transaction** | **Giao dịch** — nhóm lệnh chạy trọn vẹn hoặc huỷ hết |
| **Pessimistic lock** | **Khoá bi quan** — khoá trước, hỏi sau |
| **Optimistic lock** | **Khoá lạc quan** — không khoá, kiểm tra lúc ghi |
| **Rows affected** | **Số dòng bị ảnh hưởng** — con số database trả về sau lệnh ghi |
| **HOLD** | **Đang giữ** — trạng thái trung gian giữa "trống" và "đã bán" |
| **TTL** (*Time To Live*) | **Thời hạn sống** — sau bấy nhiêu thì tự hết hiệu lực |
| **Deadlock** | **Khoá chết** — hai bên cùng chờ nhau, không ai nhường |
| **Cron job** | **Tác vụ định kỳ** — chương trình chạy theo lịch |

## Tua chậm cái giây đó ra

Đoạn code đặt vé nhìn **hiền như đất**. Ai đọc cũng thấy nó đúng. Nó chỉ làm hai việc: kiểm tra ghế còn trống không, nếu còn thì ghi là đã bán.

```python
# ❌ Đoạn code gây ra tất cả
ghe = db.query("SELECT trang_thai FROM ghe WHERE ma = 'H7'")   # ① ĐỌC
if ghe.trang_thai == 'trong':                                   # ② KIỂM TRA
    db.execute("UPDATE ghe SET trang_thai = 'da_ban' WHERE ma = 'H7'")  # ③ GHI
    tao_ve(user_id)
```

Đọc rồi ghi. Hết.

**Nhưng giữa dòng đọc và dòng ghi luôn có một khe hở.** Vài mili giây thôi. Với bạn thì bằng 0 — với database thì đủ để cả một người khác chen vào, đọc xong, ghi xong, và đi ra trước khi bạn kịp chớp mắt.

```text
   thời gian ─────────────────────────────────────────────────►

   A đọc: ghế TRỐNG ──┐
                       │
   B đọc: cũng TRỐNG ──┤  (vì A chưa kịp ghi)
                       │
   A ghi: ĐÃ BÁN ──────┤
                       │
   B ghi ĐÈ LÊN: ĐÃ BÁN┘

   BỐN NHỊP, đúng thứ tự đó, không sai ly nào.
   Và cái ghế bị bán HAI LẦN cho HAI NGƯỜI.
```

Lỗi này có tên riêng: **race condition** (điều kiện tranh đua). Hai tiến trình chạy đua trên cùng một dòng dữ liệu.

> Ở mọi cuộc đua khác chỉ có **một** người thắng. Ở đây, cay đắng thay, **cả hai cùng về nhất**.

## Vũ khí thứ nhất: Transaction — và hiểu lầm của 9/10 developer

Hình dung transaction là **một cái bọc**. Mọi việc bạn nhét vào trong bọc: **hoặc xong hết sạch, hoặc không có gì xảy ra cả.** Không có nửa vời.

Vì đặt một tấm vé không phải một việc — nó là **bốn việc dính chặt vào nhau**:

```text
   ① Đổi trạng thái ghế
   ② Tạo bản ghi booking mới
   ③ Trừ tiền trong ví
   ④ Bắn mail xác nhận
```

Giả sử **bước ③ gãy**, nhưng bước ① đã kịp ghi ghế là "đã bán":

```text
   → Cái ghế đó CHẾT. Không ai mua được nữa,
     mà cũng chẳng ai trả cho bạn đồng nào.
   → Ghế treo lơ lửng.
```

Đây là lúc cái bọc phát huy tác dụng:

```sql
BEGIN;
  UPDATE ghe SET trang_thai = 'da_ban' WHERE ma = 'H7';
  INSERT INTO booking (...) VALUES (...);
  UPDATE vi SET so_du = so_du - 120000 WHERE user_id = 42;
COMMIT;
-- Gãy giữa chừng → ROLLBACK → database TUA NGƯỢC, xoá sạch mọi thứ vừa ghi
-- → Ghế trống lại, tiền còn nguyên.
```

### ⚠️ Và đây là chỗ 9/10 developer hiểu sai

```text
   Bọc code vào transaction, thấy chữ BEGIN / COMMIT là yên tâm.

   NHƯNG TRANSACTION KHÔNG CHỐNG ĐƯỢC HAI NGƯỜI CÙNG ĐẶT MỘT GHẾ.
   KHÔNG HỀ. MỘT CHỮ CŨNG KHÔNG.

   Hai transaction chạy song song VẪN CÙNG ĐỌC THẤY GHẾ TRỐNG.
```

```text
   T1: BEGIN                              T2: BEGIN
   T1: SELECT → 'trong'                   T2: SELECT → 'trong'   ◄── VẪN THẤY TRỐNG
   T1: UPDATE → 'da_ban'                  T2: UPDATE → 'da_ban'
   T1: COMMIT                             T2: COMMIT

   Cả hai đều thành công. Ghế vẫn bán hai lần.
```

> **Transaction bảo vệ SỰ TRỌN VẸN của một chuỗi việc.** Nó chưa bao giờ hứa bảo vệ **quyền độc chiếm một dòng dữ liệu**. Hai chuyện hoàn toàn khác nhau — đừng lẫn lộn.

**Ghi lại:** giao dịch cho bạn "được ăn cả, ngã về không". Nó là **cái bọc** giữ cho chuỗi việc không đứt gánh giữa đường — **nó không phải hàng rào**. Hàng rào là vũ khí tiếp theo.

## Vũ khí thứ hai: khoá bi quan — `FOR UPDATE`

Triết lý của nó đúng như tên: **luôn giả định điều tệ nhất**. Kiểu gì cũng có người nhảy vào cướp, nên là **khoá trước, hỏi sau**.

Câu thần chú chỉ có hai chữ: **`FOR UPDATE`**.

```sql
BEGIN;

SELECT trang_thai FROM ghe
WHERE ma = 'H7'
FOR UPDATE;                    -- ◄── HAI CHỮ NÀY thay đổi cả cuộc chơi

-- database KHOÁ ĐÚNG MỘT DÒNG này lại
-- Không khoá cả bảng. Không khoá cả rạp. Chỉ đúng dòng H7.

UPDATE ghe SET trang_thai = 'da_ban' WHERE ma = 'H7';
INSERT INTO booking (...) VALUES (...);

COMMIT;                        -- ◄── khoá TỰ NHẢ tại đây
```

```text
   40 mili giây sau, B tới.

   Câu lệnh của B ĐỨNG IM.
   Không văng lỗi. Không trả về gì cả. Nó chỉ ĐỢI.
   Đợi cho tới khi A nhả khoá ra. Đứng đó, im lặng, không kêu ca gì.

   A ghi xong, gọi COMMIT, khoá nhả.
   ĐÚNG LÚC ĐÓ câu lệnh của B mới chạy tiếp,
   và nó đọc lại được SỰ THẬT MỚI NHẤT: ghế H7 đã bán.

   B nhận thông báo và đi chọn ghế khác. KHÔNG AI MẤT GÌ.
```

Code thật đúng năm dòng: mở giao dịch → đọc kèm `FOR UPDATE` → kiểm tra → ghi → đóng giao dịch. **Khoá tự nhả khi `COMMIT`** — bạn không phải tự mở, cũng không phải nhớ dọn dẹp gì.

### Nhưng khoá có giá của nó

```text
   Vé concert mở bán. 5.000 người cùng chen vào MỘT DÒNG.
   → Người cuối hàng phải đợi gần 5.000 lượt.
   → Hàng đợi dài ra, kết nối cạn, cả web treo.
```

> **Chốt:** khoá bi quan **đúng chắc chắn**, đổi bằng **thông lượng**. Dùng khi va chạm **thật sự nhiều** — mà suất phim hot thì đúng là nhiều thật.

Ba luật bắt buộc khi dùng:

```sql
SET lock_timeout = '3s';        -- ① thà báo lỗi còn hơn chờ vô tận
-- ② giữ transaction NGẮN NHẤT có thể, không gọi mạng ở giữa
-- ③ khoá theo THỨ TỰ CỐ ĐỊNH (xem phần deadlock ở dưới)
```

## Vũ khí thứ ba: khoá lạc quan — và cái bẫy "vé ma"

Triết lý ngược hẳn: **va chạm là chuyện hiếm**, vậy thì đừng bắt ai xếp hàng cả. Cứ để tất cả cùng đọc thoải mái, **kiểm tra lúc ghi mới kiểm**. Ai chậm tay thì chịu.

Bí mật nằm ở **một cột duy nhất** thêm vào bảng ghế: cột `version`.

```text
   Ghế H7 đang ở version = 5.

   A đọc: thấy 5.
   B đọc: cũng thấy 5.
   → Chưa ai khoá, chưa ai đợi ai, cả hai đều đi tiếp.
```

```sql
-- A ghi trước, câu UPDATE có thêm MỘT MỆNH ĐỀ
UPDATE ghe
SET trang_thai = 'da_ban', version = version + 1
WHERE ma = 'H7' AND version = 5;        -- ◄── "chỉ ghi nếu version VẪN CÒN 5"

-- Đúng là còn 5! Ghi thành công, version tự nhảy lên 6.
```

```sql
-- B ghi câu y hệt, điều kiện version = 5
UPDATE ghe
SET trang_thai = 'da_ban', version = version + 1
WHERE ma = 'H7' AND version = 5;

-- Nhưng version giờ là 6 rồi!
```

```text
   Database KHÔNG BÁO LỖI. Không văng exception.
   Nó lặng lẽ trả về một con số lạnh lùng:

                    0 rows affected
                    (0 dòng bị ảnh hưởng)
```

### ⚠️ Và đây là cái bẫy chết người

```python
# ❌ Code không thèm đọc con số 0 đó
db.execute("UPDATE ghe SET ... WHERE ma='H7' AND version=5")
tru_tien(user_id, 120000)      # vẫn trừ tiền
gui_mail_xac_nhan(user_id)     # vẫn gửi mail
in_ve(user_id, 'H7')           # vẫn in vé

#                     → VÉ MA.
#   Khách có vé, có mail, bị trừ tiền — mà ghế không phải của họ.
```

```python
# ✅ Chịu đọc con số đó thì mọi thứ dễ như ăn kẹo
n = db.execute(
    "UPDATE ghe SET trang_thai='da_ban', version=version+1 "
    "WHERE ma=%s AND version=%s", (ma_ghe, version_da_doc)
).rowcount

if n == 0:
    raise GheDaCoNguoiChon("Ghế vừa có người chọn, mời bạn chọn ghế khác")
# chỉ khi n == 1 mới trừ tiền, mới gửi mail, mới in vé
```

> **Chốt:** lạc quan **không khoá ai nên nhanh**, nhưng **bắt bạn phải tự kiểm số dòng bị ảnh hưởng**. Bi quan thì database gánh hộ bạn việc đó.
>
> **Chọn cái nào, thực chất là chọn AI GÁNH TRÁCH NHIỆM.**

## Trạng thái thứ ba: HOLD — cái ghế trong 10 phút chờ

Còn một chuyện chưa ai chạm tới.

```text
   Bấm chọn ghế xong, người ta còn phải:
      nhập số thẻ → chờ mã OTP → bấm xác nhận
      → có khi còn đi tìm cái ví mất 10 phút.

   TRONG 10 PHÚT ĐÓ, CÁI GHẾ H7 LÀ CÁI GÌ?
```

Nó không phải "trống". Cũng chưa phải "đã bán". Nó lơ lửng ở giữa — và đó là **trạng thái thứ ba: HOLD (đang giữ)**.

```sql
ALTER TABLE ghe
    ADD COLUMN giu_boi     BIGINT,          -- AI đang giữ nó?
    ADD COLUMN giu_den_luc TIMESTAMPTZ;     -- Giữ TỚI MẤY GIỜ?
```

```text
   ┌─────────┐  chọn ghế   ┌──────────┐  thanh toán OK  ┌──────────┐
   │  TRỐNG  │ ──────────► │   HOLD   │ ──────────────► │ ĐÃ BÁN   │
   └─────────┘             └────┬─────┘                 └──────────┘
        ▲                       │
        │        huỷ / HẾT HẠN  │
        └───────────────────────┘
```

### Điều kiện để "cướp" được một ghế — viết ra chỉ một dòng

```text
   Hoặc ghế đang TRỐNG,
   HOẶC ghế đang bị giữ NHƯNG ĐÃ QUÁ HẠN.
```

Và đây là điểm mấu chốt: **viết thẳng cái `OR` đó vào mệnh đề `WHERE`**, để **chính database quyết định** — không phải code của bạn.

```sql
UPDATE ghe
SET trang_thai  = 'hold',
    giu_boi     = $1,
    giu_den_luc = now() + INTERVAL '10 minutes'
WHERE ma = $2
  AND (
        trang_thai = 'trong'                                    -- đang trống
     OR (trang_thai = 'hold' AND giu_den_luc < now())            -- HOẶC hết hạn giữ
      )
RETURNING ma, giu_den_luc;
```

Không trả về dòng nào → ghế đang có người giữ hợp lệ. Trả về một dòng → bạn vừa giữ được nó, kèm hạn cụ thể.

## ⚠️ Bẫy cron job — chỗ 9/10 người làm sai

Nghe tới "ghế hết hạn thì phải thả ra", phản xạ đầu tiên của ai cũng là:

```python
# ❌ Viết một con cron job chạy mỗi phút, quét bảng giải phóng ghế hết hạn
@cron("* * * * *")
def giai_phong_ghe_het_han():
    db.execute("""
        UPDATE ghe SET trang_thai='trong', giu_boi=NULL, giu_den_luc=NULL
        WHERE trang_thai='hold' AND giu_den_luc < now()
    """)
```

Nghe rất hợp lý. Ai cũng từng viết con cron đó ít nhất một lần. **Nhưng nó sai.**

```text
   VÌ CRON CHẠY MỖI PHÚT.

   Ghế hết hạn lúc 23:57:01
   → tới 23:58:00 nó mới được thả.

   → GẦN MỘT PHÚT GHẾ BỊ TREO OAN,
     trong khi cả nghìn người đang tranh nhau nó.

   Và nếu cron chạy mỗi 5 phút thì treo oan 5 phút.
   Nếu cron chết mà không ai biết thì treo oan MÃI MÃI.
```

**Cách đúng — và nó đơn giản đến bất ngờ:**

> **Hết hạn là một ĐIỀU KIỆN ngay tại khoảnh khắc bạn hỏi, chứ không phải một CÔNG VIỆC chạy nền.**

Tức là chính câu `UPDATE ... WHERE ... OR (giu_den_luc < now())` ở trên đã giải quyết xong. Ghế hết hạn lúc 23:57:01 thì **ngay 23:57:02** đã có người cướp được.

```text
   VẬY CÒN CẦN CRON KHÔNG?

   Có — nhưng với vai trò HOÀN TOÀN KHÁC:
   ① Dọn dữ liệu cũ cho gọn (không ảnh hưởng tính đúng đắn)
   ② Gửi thông báo "đơn của bạn đã hết hạn giữ chỗ"
   ③ Thu thập số liệu: bao nhiêu % người giữ chỗ rồi bỏ

   → Cron là công cụ DỌN DẸP và THỐNG KÊ,
     KHÔNG PHẢI công cụ đảm bảo TÍNH ĐÚNG ĐẮN.
```

Đây là mẫu tư duy dùng lại được ở rất nhiều nơi: **đừng để tính đúng đắn của hệ thống phụ thuộc vào một job chạy nền.** Nếu job chậm, job chết, hoặc job chạy trùng — hệ thống phải vẫn đúng.

## Đồng hồ nào là chân lý?

Câu hỏi tưởng nhỏ mà quyết định tính đúng đắn.

```text
   ❌ ĐỒNG HỒ MÁY NGƯỜI DÙNG
      Chỉnh lùi một cái là giữ ghế VÔ HẠN.
      Người dùng kiểm soát được nó → không bao giờ tin.

   ❌ ĐỒNG HỒ CỦA TỪNG CON SERVER
      Mỗi con lệch một kiểu, có con lệch vài giây.
      Server A tưởng còn hạn, server B tưởng hết hạn
      → cùng một ghế, hai câu trả lời khác nhau.

   ✅ ĐỒNG HỒ CỦA DATABASE
      MỘT CÁI ĐỒNG HỒ, MỘT SỰ THẬT.
```

```sql
-- ✅ Để database tự lấy giờ
SET giu_den_luc = now() + INTERVAL '10 minutes'
WHERE ... AND giu_den_luc < now()

-- ❌ Đừng truyền giờ từ ứng dụng xuống
SET giu_den_luc = $1      -- $1 = datetime.now() + 10 phút, tính ở tầng app
WHERE ... AND giu_den_luc < $2
```

> Đây cũng là lý do mọi cột `created_at` nên có `DEFAULT now()` ở database thay vì để ứng dụng gửi xuống. Nhiều máy chủ, nhiều múi giờ, nhiều đồng hồ lệch — nhưng database chỉ có một.

## Lớp phòng thủ cuối: tránh deadlock

Giao dịch, khoá, hết hạn… bạn nghĩ mình an toàn rồi, code sạch, ngủ ngon. Nhưng **khoá là con dao hai lưỡi**, và giờ ta xem cái lưỡi kia — cái lưỡi quay ngược vào chính bạn.

```text
   Nhóm bạn đặt HAI ghế: H7 rồi H8.
   Nhóm kia đặt cũng hai ghế đó, nhưng NGƯỢC THỨ TỰ: H8 rồi H7.

        A giữ H7 ──── đợi H8 ────┐
                                  │  vòng chờ
        B giữ H8 ──── đợi H7 ────┘

   Cả hai cùng đợi... MÃI MÃI. Không ai nhường ai.
```

Cái này có tên: **deadlock** (khoá chết). Database phát hiện được, và nó xử lý rất phũ: **bắn chết một bên**.

```text
ERROR: deadlock detected
DETAIL: Process 1234 waits for ShareLock on transaction 5678;
        blocked by process 9012.
```

**Cách né thì rẻ đến bất ngờ: luôn khoá theo MỘT THỨ TỰ CỐ ĐỊNH.**

```sql
-- ✅ Sắp xếp mã ghế TRƯỚC khi khoá
SELECT * FROM ghe
WHERE ma = ANY($1)
ORDER BY ma                     -- ◄── DÒNG CỨU MẠNG
FOR UPDATE;
```

```python
# Ở tầng ứng dụng cũng vậy
ma_ghe = sorted(request.ma_ghe)     # ['H7', 'H8'] — luôn cùng thứ tự
```

Chỉ vậy thôi. Cả hai nhóm đều khoá H7 trước rồi mới tới H8 → nhóm nào tới sau chỉ việc **xếp hàng**, không có vòng chờ nào.

## Khi quy mô quá lớn

Còn một sự thật cay hơn:

```text
   5.000 người cùng bấm một suất
   → KHÔNG DATABASE NÀO CHỊU NỔI, dù bạn khoá đúng cách.

   Dân trong nghề KHÔNG ĐẤU TAY ĐÔI với nó.
   Họ ĐẨY CUỘC ĐUA RA NGOÀI, trước khi nó chạm được vào bảng:

   ① PHÒNG CHỜ ở tầng edge — cho vào từng đợt
   ② BỘ ĐẾM REDIS lọc trước — chỉ số ít request tới được database
   ③ HÀNG ĐỢI tuần tự hoá — một consumer xử lý, không có tranh chấp
```

Ba kỹ thuật này được mổ xẻ đầy đủ ở [bài 1](01-flash-sale-va-chong-ban-qua-hang.md).

## Ba lớp, theo đúng thứ tự

```text
   ① GIAO DỊCH  — giữ cho CHUỖI VIỆC trọn vẹn
   ② KHOÁ       — giữ cho CÁI GHẾ độc quyền
   ③ HẾT HẠN    — giữ cho HÀNG ĐỢI công bằng

   THIẾU LỚP NÀO, THỦNG LỚP ĐÓ.
   Và người dùng sẽ tìm ra trước bạn.
```

Ghép lại thành một luồng hoàn chỉnh:

```sql
-- BƯỚC 1: giữ chỗ (nhanh, không giữ khoá lâu)
UPDATE ghe
SET trang_thai='hold', giu_boi=$1, giu_den_luc = now() + INTERVAL '10 minutes'
WHERE ma = $2
  AND (trang_thai='trong' OR (trang_thai='hold' AND giu_den_luc < now()))
RETURNING ma, giu_den_luc;
-- 0 dòng → "Ghế vừa có người chọn"

-- ... người dùng nhập thẻ, chờ OTP — KHÔNG giữ transaction nào ở đây ...

-- BƯỚC 2: chốt vé (sau khi thanh toán thành công)
BEGIN;
UPDATE ghe SET trang_thai='da_ban'
WHERE ma = $2 AND giu_boi = $1 AND giu_den_luc > now();   -- ◄── vẫn còn hạn?
-- 0 dòng → hết hạn giữ mất rồi → HOÀN TIỀN, báo người dùng
INSERT INTO booking (...) VALUES (...);
COMMIT;
```

Chú ý bước 2: điều kiện `giu_boi = $1 AND giu_den_luc > now()` đảm bảo **đúng người, và còn hạn**. Nếu hết hạn giữa lúc họ nhập thẻ, hệ thống phát hiện và hoàn tiền — thay vì bán cho hai người.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `SELECT` rồi `UPDATE` ở tầng ứng dụng | Race condition, bán trùng ghế | `FOR UPDATE` hoặc điều kiện trong `WHERE` |
| **Tưởng transaction chống được tranh chấp** | Hai transaction vẫn cùng đọc thấy trống | Transaction là **cái bọc**, không phải **hàng rào** |
| Không kiểm số dòng bị ảnh hưởng | **Vé ma** — trừ tiền, gửi mail, in vé cho ghế không phải của họ | Luôn đọc `rowcount`, `0` thì dừng |
| **Cron job giải phóng ghế hết hạn** | Ghế treo oan tới một phút; cron chết thì treo mãi | Đưa `OR (giu_den_luc < now())` vào `WHERE` |
| Dùng đồng hồ máy người dùng | Chỉnh lùi = giữ ghế vô hạn | **Đồng hồ database** |
| Dùng đồng hồ từng server | Mỗi con lệch một kiểu, hai câu trả lời | `now()` của database |
| Không có trạng thái HOLD | Trừ kho ngay khi bấm chọn → khách bỏ đi, ghế chết | Ba trạng thái + `giu_den_luc` |
| Đặt nhiều ghế không sắp thứ tự | **Deadlock** | `ORDER BY ma FOR UPDATE` |
| Không đặt `lock_timeout` | Chờ vô tận, cạn kết nối | `SET lock_timeout = '3s'` |
| Giữ transaction trong lúc chờ OTP | Khoá 10 phút, cả web treo | Tách hai bước, không giữ khoá qua thao tác người dùng |
| Chốt vé mà không kiểm còn hạn | Hết hạn rồi vẫn bán → hai người một ghế | `AND giu_den_luc > now()` ở bước chốt |
| Đấu tay đôi với 5.000 request | Database không chịu nổi dù khoá đúng | Đẩy cuộc đua ra ngoài (phòng chờ, Redis, hàng đợi) |

## Câu hỏi phỏng vấn hay gặp

**H: Hai người cùng đặt một ghế trong 40 mili giây, xử lý thế nào?**
Gốc vấn đề là **khe hở giữa lúc đọc và lúc ghi** — cả hai cùng đọc thấy ghế trống. Em dùng `SELECT ... FOR UPDATE` để khoá đúng dòng ghế đó: người tới sau sẽ **đứng đợi im lặng** cho tới khi người trước `COMMIT`, rồi đọc lại được sự thật mới nhất. Hoặc gọn hơn, đưa luôn điều kiện vào `WHERE` của câu `UPDATE` để đọc-kiểm-ghi thành **một thao tác nguyên tử** — và bắt buộc phải **kiểm số dòng bị ảnh hưởng**.

**H: Bọc vào transaction là chống được rồi phải không?**
**Không — và đây là chỗ 9/10 developer hiểu sai.** Transaction bảo vệ **sự trọn vẹn của một chuỗi việc**: trừ tiền gãy thì tua ngược, ghế trống lại, tiền còn nguyên. Nhưng nó **chưa bao giờ hứa bảo vệ quyền độc chiếm một dòng dữ liệu** — hai transaction chạy song song vẫn cùng đọc thấy ghế trống rồi cùng ghi. Transaction là **cái bọc**, không phải **hàng rào**. Hàng rào là khoá.

**H: Khoá lạc quan có bẫy gì?**
Khi ghi trượt, database **không báo lỗi, không văng exception** — nó chỉ lặng lẽ trả về **`0 rows affected`**. Nếu code không thèm đọc con số đó, nó tưởng mọi thứ ổn: **vẫn trừ tiền, vẫn gửi mail, vẫn in vé** — và khách có một tấm **vé ma** cho cái ghế không phải của họ. Nên chọn giữa lạc quan và bi quan thực chất là **chọn ai gánh trách nhiệm**: bi quan thì database gánh hộ, lạc quan thì bạn phải tự kiểm.

**H: Người dùng chọn ghế rồi đi nhập thẻ mất 10 phút, ghế đó là gì?**
Nó là trạng thái thứ ba — **HOLD**, kèm hai cột: **ai đang giữ** và **giữ tới mấy giờ**. Điều kiện để cướp được một ghế viết ra chỉ một dòng: *hoặc ghế đang trống, hoặc đang bị giữ nhưng đã quá hạn* — và phải **viết thẳng cái `OR` đó vào `WHERE`** để chính database quyết định. Và bước chốt vé phải kiểm lại `giu_boi = tôi AND giu_den_luc > now()`, nếu hết hạn giữa chừng thì hoàn tiền thay vì bán cho hai người.

**H: Sao không dùng cron job quét bảng giải phóng ghế hết hạn?**
Vì cron chạy mỗi phút, nên ghế hết hạn lúc 23:57:01 phải tới 23:58 mới được thả — **gần một phút treo oan** trong khi cả nghìn người đang tranh nhau. Cron chạy 5 phút thì treo 5 phút; cron chết mà không ai biết thì treo mãi mãi. Nguyên tắc: **hết hạn là một điều kiện ngay tại khoảnh khắc bạn hỏi, không phải một công việc chạy nền.** Cron vẫn cần, nhưng để **dọn dữ liệu và gửi thông báo** — không phải để đảm bảo tính đúng đắn.

**H: Dùng đồng hồ nào để tính hết hạn?**
**Đồng hồ của database.** Không dùng đồng hồ máy người dùng — chỉnh lùi một cái là giữ ghế vô hạn. Không dùng đồng hồ từng server — mỗi con lệch một kiểu, cùng một ghế mà server A nói còn hạn, server B nói hết hạn. Một cái đồng hồ, một sự thật.

**H: Đặt hai ghế cùng lúc thì có vấn đề gì?**
**Deadlock.** Nhóm A đặt H7 rồi H8, nhóm B đặt H8 rồi H7 — A giữ H7 đợi H8, B giữ H8 đợi H7, cả hai đợi mãi mãi. Database phát hiện được và xử lý rất phũ: bắn chết một bên. Cách né rẻ đến bất ngờ: **luôn khoá theo một thứ tự cố định** — `ORDER BY ma` trước khi `FOR UPDATE`, và `sorted()` ở tầng ứng dụng.

## Tóm tắt bài 4

- Gốc vấn đề là **khe hở giữa lúc đọc và lúc ghi** — bốn nhịp đúng thứ tự và một ghế bán hai lần.
- **Transaction là cái bọc, không phải hàng rào.** Nó giữ chuỗi việc trọn vẹn nhưng **không chống được hai người cùng đặt một ghế** — đây là hiểu lầm phổ biến nhất.
- **Khoá bi quan** (`FOR UPDATE`) đúng chắc chắn, đổi bằng thông lượng; **khoá lạc quan** (`version`) nhanh nhưng bắt bạn **tự kiểm `rowcount`** — không kiểm là **vé ma**.
- Cần **trạng thái thứ ba HOLD** kèm *ai giữ* và *giữ tới mấy giờ*, vì người dùng cần thời gian nhập thẻ.
- **Bẫy cron job:** hết hạn là **điều kiện lúc hỏi** (`OR giu_den_luc < now()` trong `WHERE`), **không phải job chạy nền** — cron chỉ để dọn dẹp và thống kê.
- **Một cái đồng hồ, một sự thật** — luôn dùng `now()` của database.
- Đặt nhiều ghế phải **khoá theo thứ tự cố định** (`ORDER BY`) để tránh deadlock.
- Ba lớp theo đúng thứ tự: **giao dịch** (chuỗi việc trọn vẹn) → **khoá** (ghế độc quyền) → **hết hạn** (hàng đợi công bằng). Thiếu lớp nào, thủng lớp đó.

**Bài kế tiếp** → [Phase 9, Bài 1: Mô hình bốn tầng của câu hỏi phỏng vấn](../phase-9/01-mo-hinh-4-tang-cua-cau-hoi-phong-van.md)
