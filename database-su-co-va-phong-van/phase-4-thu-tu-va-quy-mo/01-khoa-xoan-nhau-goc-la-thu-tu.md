# Bài 16: Khoá xoắn vào nhau — gốc là thứ tự, không phải số lượng

Chiều thứ Sáu. Hai lệnh chuyển tiền chạy cùng lúc: **An chuyển cho Bình, Bình chuyển cho An**. Hai câu lệnh bình thường, chạy hàng nghìn lần mỗi ngày mà chưa hỏng bao giờ.

Rồi cả hai **đứng im**. Không báo lỗi, không chậm — chỉ là không nhúc nhích.

40 mili-giây sau, một trong hai bị huỷ, để lại một dòng trong log mà chưa ai đọc kỹ:

```text
ERROR 1213 (40001): Deadlock found when trying to get lock;
                    try restarting transaction
```

Người trực đọc xong nghĩ ngay: *"Mình vừa làm hỏng cái gì?"*

**Không. Bạn không làm hỏng gì cả.** Cái vừa xảy ra không phải lỗi — nó là **một cơ chế cứu hộ vừa chạy đúng như thiết kế**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **Khoá dòng** (row lock) | Khi bạn sửa một dòng trong giao dịch, database khoá **riêng dòng đó** tới lúc commit | Mượn đúng một cuốn hồ sơ về bàn mình |
| **Chờ khoá** (lock wait) | Ai đụng vào dòng đang bị khoá thì phải đứng đợi | Xếp hàng chờ người kia trả hồ sơ |
| **Deadlock** (kẹt khoá / khoá chết) | Hai bên **cùng chờ nhau**, không bên nào nhả — vòng chờ khép kín | Hai người mỗi người cầm một chiếc đũa, cùng xin chiếc còn lại |
| **Wait-for graph** (sơ đồ ai chờ ai) | Sơ đồ database tự vẽ: mỗi mũi tên là "A đang chờ B" | Sơ đồ ai đang đợi ai trong phòng |
| **Chu trình** (cycle) | Đường đi trong sơ đồ **quay về lại chỗ xuất phát** | Vòng tròn khép kín |
| **Victim** (bên bị chọn) | Giao dịch bị database huỷ để phá vỡ vòng chờ | Người được mời buông đũa ra |
| **Rollback** (cuộn ngược) | Huỷ toàn bộ thay đổi của một giao dịch, như chưa từng chạy | Ctrl+Z cho cả nhóm việc |
| **`deadlock_timeout`** | PostgreSQL: chờ bao lâu rồi mới **bắt đầu đi kiểm tra** có kẹt không. Mặc định **1 giây** | Đợi 1 giây rồi mới đứng dậy đi xem có tắc không |
| **`innodb_lock_wait_timeout`** | MySQL: chờ khoá tối đa bao lâu rồi bỏ cuộc. Mặc định **50 giây** | Chờ 50 giây rồi tự bỏ về |
| **Retry** (thử lại) | Chạy lại toàn bộ giao dịch từ đầu sau khi bị huỷ | Làm lại từ đầu |

## Bản chất của khoá dòng

Phải hiểu cái khoá trước.

Khi bạn sửa một dòng trong giao dịch, database **khoá dòng đó lại**. Không phải cả bảng — chỉ một dòng. Và giữ tới lúc bạn xác nhận (`COMMIT`).

Ai đụng vào dòng đang bị khoá thì **phải đứng đợi**.

**Chuyện đó hoàn toàn bình thường.** Nó xảy ra suốt ngày và không ai gọi đó là sự cố — đợi một chút rồi tới lượt mình.

### Điều kiện ngầm khiến hàng đợi hoạt động

Nhưng xếp hàng chỉ chạy được khi **hàng có điểm cuối**:

```text
   Phải có MỘT NGƯỜI Ở ĐẦU HÀNG đang THẬT SỰ LÀM VIỆC,
   xong rồi nhả khoá cho người sau.

   Đó là điều kiện ngầm KHÔNG AI NÓI RA và cũng KHÔNG AI KIỂM.
```

Còn nếu hàng **không có điểm cuối**? Nếu người đầu hàng **cũng đang đợi** một người khác, mà người đó lại đang đợi chính anh ta?

**Lúc đó cái hàng không còn là một cái hàng nữa.**

## Diễn biến va chạm giữa hai lệnh

Quay lại đúng hai lệnh chuyển tiền lúc nãy:

```text
   Thời gian ──────────────────────────────────────────────────────►

   LỆNH 1 (An → Bình)                LỆNH 2 (Bình → An)
   ──────────────────────────        ──────────────────────────
   BEGIN;                            BEGIN;

   t0  UPDATE tk SET sd = sd-100
         WHERE id = 'An';
       → KHOÁ dòng An  🔒

   t1                                UPDATE tk SET sd = sd-50
                                       WHERE id = 'Bình';
                                     → KHOÁ dòng Bình  🔒

       ┌──────────────────────────────────────────────────────┐
       │  Tới đây VẪN CHƯA CÓ GÌ SAI CẢ.                      │
       │  Hai lệnh đang chạy song song rất đẹp.               │
       └──────────────────────────────────────────────────────┘

   t2  UPDATE tk SET sd = sd+100
         WHERE id = 'Bình';
       → xin khoá Bình... ĐANG BỊ LỆNH 2 GIỮ
       → ĐỨNG CHỜ ⏳

   t3                                UPDATE tk SET sd = sd+50
                                       WHERE id = 'An';
                                     → xin khoá An... ĐANG BỊ LỆNH 1 GIỮ
                                     → ĐỨNG CHỜ ⏳

       ╔══════════════════════════════════════════════════════╗
       ║  MỖI BÊN XIN THỨ BÊN KIA ĐANG GIỮ.                   ║
       ║  Không bên nào chịu nhả ra cả.                       ║
       ╚══════════════════════════════════════════════════════╝
```

**Vì sao không bên nào nhả?** Vì nhả khoá nghĩa là **bỏ hết phần việc vừa làm** — mà không bên nào được phép làm thế giữa chừng. Nếu Lệnh 1 nhả khoá An, thì việc trừ 100 của nó có thể bị người khác ghi đè, và tính nguyên tử của giao dịch tan vỡ.

Nên cả hai cùng đợi, và cứ thế đợi mãi.

### Hình dễ hiểu nhất

```text
   Hai người ngồi ở hai đầu một cái bàn ăn.
   Giữa bàn chỉ có HAI chiếc đũa.

        🧑 ──── 🥢     🥢 ──── 🧑

   Mỗi người nhanh tay cầm lấy MỘT chiếc,
   rồi cùng xoè tay xin chiếc còn lại.

   Không ai chịu buông chiếc mình đang cầm — vì buông ra là mất phần.

   → Không ai ăn được miếng nào.
   → Và họ sẽ CỨ NGỒI ĐÓ TỚI SÁNG nếu không có ai bước vào can thiệp.
```

### Chỗ phải nói cho thật rõ

```text
   ┌────────────────────────────────────────────────────────────┐
   │  KẸT KHOÁ ≠ CHẬM.                                          │
   │                                                            │
   │  Chậm  →  tự nó qua. Đợi thì cũng xong.                    │
   │  Kẹt   →  KHÔNG BAO GIỜ TỰ QUA,                            │
   │           dù bạn có đợi tới sáng mai.                      │
   └────────────────────────────────────────────────────────────┘
```

Đây là khác biệt cốt lõi, và nó quyết định cách xử lý: với "chậm" thì bạn tăng tài nguyên; với "kẹt" thì tăng tài nguyên **không giúp gì cả**.

## Cơ chế tự gỡ của database

Vậy database làm gì với chuyện đó? Câu trả lời làm nhiều người bất ngờ lần đầu, vì **nó ngược hẳn với trực giác**:

> **Nó không hề cố ngăn cho chuyện này đừng xảy ra. Nó ĐỂ CHO chuyện đó xảy ra rồi mới gỡ.**

Bên trong máy có một **bộ dò**. Cứ mỗi lần có ai phải đứng đợi, nó vẽ lại một tấm sơ đồ: **ai đang đợi ai**.

```text
        ┌──────────┐   đang chờ khoá của   ┌──────────┐
        │ Lệnh 1   │ ────────────────────► │ Lệnh 2   │
        │          │ ◄──────────────────── │          │
        └──────────┘   đang chờ khoá của   └──────────┘

        Tấm sơ đồ đó chỉ cần trả lời ĐÚNG MỘT CÂU:

           "Có đường nào đi vòng về lại chỗ xuất phát không?"

        CÓ VÒNG TRÒN = CÓ KẸT.
        Không cần đợi thêm giây nào để chắc chắn.
```

Thấy vòng tròn là nó **chọn ngay một bên cho dừng lại**, rồi cuộn ngược bên đó về như chưa từng chạy.

**Bên bị chọn thường là bên đã đổi ít dòng nhất** — vì cuộn nó lại rẻ hơn. (InnoDB chọn theo lượng công việc đã làm, đo bằng số dòng đã sửa và kích thước nhật ký hoàn tác.)

### Con số đáng nhớ

```text
   KHÔNG có bộ dò:
      Hai lệnh kia đứng nguyên 50 GIÂY
      (đúng bằng innodb_lock_wait_timeout mặc định của MySQL)
      rồi mới có bên bỏ cuộc vì hết giờ.

   CÓ bộ dò:
      Vài mili-giây.
```

> **Dòng lỗi bạn thấy trong log không phải chỗ hỏng. Nó là chỗ máy vừa TIẾT KIỆM CHO BẠN 50 GIÂY.**

Hãy đọc lại dòng log đó bằng một con mắt khác: nó **không** nói hệ thống của bạn đang vỡ. Nó nói **hai việc vừa kẹt vào nhau, và máy thì đã tự gỡ xong rồi**.

### Một khác biệt quan trọng giữa MySQL và PostgreSQL

Hai hệ dò kẹt khoá theo hai triết lý khác nhau, và điều này ảnh hưởng trực tiếp tới độ trễ bạn quan sát được:

| | MySQL / InnoDB | PostgreSQL |
|---|---|---|
| Khi nào dò | **Ngay lập tức**, mỗi lần có ai phải chờ | **Sau `deadlock_timeout`** (mặc định **1 giây**) |
| Triết lý | Dò liên tục, phát hiện tức thì | Phần lớn chờ khoá là bình thường và sẽ tự qua → đừng tốn CPU dò vô ích |
| Hệ quả | Kẹt được gỡ trong vài ms | Kẹt khiến **cả hai bên đứng im ~1 giây** trước khi được gỡ |
| Chỉnh được không | `innodb_deadlock_detect` (có thể tắt) | `deadlock_timeout` |

Với PostgreSQL, nếu bạn thấy độ trễ p99 có những đỉnh nhọn đúng khoảng 1 giây, **hãy nghi kẹt khoá trước tiên** — đó là chữ ký rất đặc trưng của `deadlock_timeout`.

## Sửa thế nào cho hết chuyện này?

Gần như ai cũng nghĩ tới cùng một câu: **"Khoá ít lại, giao dịch ngắn lại."**

Nghe rất hợp lý, và thật ra **nó không hề sai**. Chỉ có điều **nó không chạm được vào cái gốc**.

```text
   Giao dịch ngắn lại  →  khoảng thời gian hai bên va vào nhau HẸP ĐI
                       →  chuyện kẹt HIẾM HƠN HẲN

   Nhưng HIẾM HƠN KHÔNG PHẢI LÀ HẾT.
```

### Gốc của chuyện này nằm ở THỨ TỰ, không nằm ở SỐ LƯỢNG

Hai lệnh kẹt vào nhau **không phải vì chúng khoá quá nhiều dòng**, mà vì chúng **đi gắp khoá theo hai thứ tự ngược nhau**.

Quay lại hai người ngồi ở bàn ăn. Bây giờ ra **đúng một luật** cho cả hai người:

```text
   "Ai cũng phải cầm chiếc đũa BÊN TRÁI trước,
    rồi mới được với sang chiếc bên phải."

   Lập tức mọi thứ chạy được:
      • Một người cầm được cả hai chiếc, ăn xong đặt xuống.
      • Người kia đợi một chút rồi tới lượt.
      • Không ai kẹt, mà cũng chẳng ai phải buông ra.
```

Áp vào code thì cũng vẫn **đúng một luật đó**:

> **Trong một giao dịch chạm nhiều dòng, hãy SẮP XẾP CÁC DÒNG ĐÓ THEO MỘT THỨ TỰ CỐ ĐỊNH trước khi sửa** — thường là theo mã/ID tăng dần.

```java
// ✗ SAI — thứ tự phụ thuộc vào ai gửi tiền cho ai
@Transactional
public void chuyenTien(long tuId, long denId, BigDecimal soTien) {
    taiKhoanRepo.tru(tuId, soTien);     // khoá theo thứ tự nghiệp vụ
    taiKhoanRepo.cong(denId, soTien);   // → hai lệnh ngược chiều = KẸT
}

// ✓ ĐÚNG — luôn gắp khoá theo ID tăng dần, bất kể chiều chuyển tiền
@Transactional
public void chuyenTien(long tuId, long denId, BigDecimal soTien) {
    long thu1 = Math.min(tuId, denId);
    long thu2 = Math.max(tuId, denId);

    // Khoá theo THỨ TỰ CỐ ĐỊNH trước, rồi mới làm việc
    taiKhoanRepo.khoaDeSua(thu1);       // SELECT ... FOR UPDATE
    taiKhoanRepo.khoaDeSua(thu2);

    taiKhoanRepo.tru(tuId, soTien);
    taiKhoanRepo.cong(denId, soTien);
}
```

Nghe thì nhỏ mà **đổi hẳn kết quả**:

```text
   Khoá BAO NHIÊU dòng cũng được,
   miễn là mọi người cùng gắp theo ĐÚNG MỘT THỨ TỰ.

   Còn NGƯỢC THỨ TỰ thì khoá ÍT TỚI ĐÂU VẪN CỨ KẸT.
```

## Kẹt khoá ngay cả trên MỘT câu lệnh duy nhất

Tới đây bạn sẽ nghĩ: *"Vậy chỉ cần đừng mở giao dịch dài là xong? Một câu lệnh sửa duy nhất, chạy một phát là hết, thì làm sao kẹt được?"*

**Kẹt được.** Một câu sửa duy nhất, không mở giao dịch nào cả, **vẫn kẹt vào nhau như thường**:

```sql
-- Phiên A
UPDATE tai_khoan SET so_du = so_du + 1 WHERE id IN (1, 2, 3);

-- Phiên B (chạy đồng thời)
UPDATE tai_khoan SET so_du = so_du + 1 WHERE id IN (3, 2, 1);
```

Lý do nằm ở chỗ rất ít người nghĩ tới:

```text
   MỘT câu lệnh chạm nhiều dòng vẫn KHOÁ TỪNG DÒNG MỘT,
   LẦN LƯỢT chứ không cùng lúc.

   Và THỨ TỰ NÓ ĐI QUA CÁC DÒNG
   KHÔNG PHẢI thứ tự bạn viết trong câu lệnh!
```

Thứ tự đó **do máy tự chọn lúc chạy**, tuỳ:

```text
   • nó dùng index nào để tìm dòng
   • quét xuôi hay quét ngược
   • có song song hoá không
   • thống kê lúc đó ra sao (xem Bài 9)

   → HAI CÂU GIỐNG HỆT NHAU vẫn có thể đi theo HAI ĐƯỜNG KHÁC NHAU.
```

> **Nghĩa là trong hệ thống của bạn luôn có một thứ tự bạn KHÔNG HỀ VIẾT RA, KHÔNG NHÌN THẤY, mà vẫn phải chịu trách nhiệm.**

Cách chữa cho trường hợp này:

```sql
-- Ép thứ tự bằng cách khoá tường minh theo thứ tự xác định TRƯỚC
BEGIN;
  SELECT id FROM tai_khoan WHERE id IN (1,2,3) ORDER BY id FOR UPDATE;
  --                                            ↑ ORDER BY quyết định thứ tự gắp khoá
  UPDATE tai_khoan SET so_du = so_du + 1 WHERE id IN (1,2,3);
COMMIT;
```

## Bốn nguồn kẹt khoá khác, ít người ngờ tới

### ① Khoá ngoại

Thêm một dòng con sẽ **khoá nhẹ dòng cha** (`FOR KEY SHARE`). Hai giao dịch cùng thêm dòng con rồi cùng cập nhật dòng cha là kẹt — dù trong code **không có lệnh khoá nào**. Xem [Bài 4](../phase-1-cau-hoi-co-tang-duoi/04-khoa-ngoai-co-lam-cham-khong.md).

### ② Chèn trùng khoá duy nhất

```text
   Phiên A: INSERT ... VALUES ('email@x.com')  → giữ khoá trên giá trị đó
   Phiên B: INSERT ... VALUES ('email@x.com')  → chờ xem A commit hay rollback

   Nếu cả hai cùng chèn nhiều giá trị theo thứ tự ngược nhau → KẸT.
```

### ③ Gap lock của MySQL ở mức Repeatable Read

MySQL ở mức cách ly mặc định khoá cả **khoảng trống giữa các dòng** để chống dòng ma. Hai giao dịch khoá hai khoảng chồng lấn nhau theo thứ tự ngược là kẹt — và điều này xảy ra **ngay cả khi chúng đụng tới những dòng khác nhau hoàn toàn**.

### ④ Nâng cấp khoá

```text
   Đọc bằng SELECT thường (khoá chia sẻ) rồi sau đó UPDATE (khoá độc quyền)
   → hai bên cùng giữ khoá chia sẻ, cùng xin nâng lên độc quyền → KẸT.

   Chữa: dùng SELECT ... FOR UPDATE ngay từ đầu nếu bạn biết mình sẽ ghi.
```

## Retry là bắt buộc, không phải tuỳ chọn

Vì database **cố tình** để kẹt xảy ra rồi mới gỡ, nên **sẽ luôn có một bên bị huỷ**. Ứng dụng của bạn **bắt buộc** phải biết chạy lại.

```java
@Retryable(
    retryFor = {
        DeadlockLoserDataAccessException.class,          // Spring dịch từ SQLState 40001
        CannotAcquireLockException.class
    },
    maxAttempts = 3,
    backoff = @Backoff(delay = 50, multiplier = 2, random = true)
)
@Transactional
public void chuyenTien(long tuId, long denId, BigDecimal soTien) { ... }
```

Ba luật của vòng retry — thiếu luật nào cũng biến thuốc thành độc:

```text
   ① CÓ TRẦN SỐ LẦN (3 là hợp lý).
      Retry vô hạn dưới tranh chấp cao = tự tạo bão retry,
      biến một sự cố nhỏ thành sập dây chuyền.

   ② BACKOFF LUỸ THỪA.
      Thử lại ngay lập tức thì hai bên lại đâm nhau đúng nhịp cũ.

   ③ CÓ NGẪU NHIÊN (jitter).
      Không có nó, các luồng bị đẩy lùi cùng một khoảng
      rồi cùng quay lại — đồng bộ hoá vô tình.

   ④ RETRY PHẢI BAO CẢ GIAO DỊCH, không chỉ câu lệnh bị lỗi.
      Giao dịch đã bị cuộn ngược hoàn toàn — chạy lại một câu
      lẻ là ghi vào một trạng thái không còn tồn tại.
```

Luật ④ là chỗ hay sai nhất trong thực tế: đặt `@Retryable` **bên trong** `@Transactional` thì vô dụng, vì giao dịch đã chết. Phải đặt **bên ngoài**, hoặc dùng một lớp bọc riêng.

## Quan sát và đo trên hệ đang chạy

```sql
-- ═══ MySQL ═══
-- Xem lần kẹt gần nhất: ai chờ ai, câu lệnh nào, bên nào bị chọn
SHOW ENGINE INNODB STATUS\G
--   → tìm mục "LATEST DETECTED DEADLOCK"

-- Ghi MỌI lần kẹt vào error log, không chỉ lần gần nhất
SET GLOBAL innodb_print_all_deadlocks = ON;
```

```sql
-- ═══ PostgreSQL ═══
-- Đếm số lần kẹt theo database
SELECT datname, deadlocks, xact_commit, xact_rollback
  FROM pg_stat_database
 WHERE datname NOT LIKE 'template%';

-- Ghi log mọi lần CHỜ khoá lâu (không chỉ kẹt) — rất hữu ích để
-- thấy vấn đề TRƯỚC KHI nó thành kẹt
ALTER SYSTEM SET log_lock_waits = on;
ALTER SYSTEM SET deadlock_timeout = '1s';   -- chờ quá mức này thì ghi log
SELECT pg_reload_conf();

-- Đang kẹt ngay lúc này? Xem ai chặn ai
SELECT blocked.pid          AS pid_bi_chan,
       blocked.query        AS cau_lenh_bi_chan,
       blocking.pid         AS pid_dang_chan,
       blocking.query       AS cau_lenh_dang_chan,
       now() - blocked.query_start AS da_cho_bao_lau
  FROM pg_stat_activity blocked
  JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) AS bp(pid) ON TRUE
  JOIN pg_stat_activity blocking ON blocking.pid = bp.pid
 WHERE blocked.wait_event_type = 'Lock';
```

**Ngưỡng đáng lo:** vài lần kẹt mỗi ngày trên hệ có tranh chấp cao là bình thường và retry lo được. Vài trăm lần mỗi giờ nghĩa là bạn có một **thứ tự gắp khoá không nhất quán** ở đâu đó — hãy đi tìm nó thay vì tăng số lần retry.

> Xem thêm góc nhìn vận hành và các ca kẹt khoá khác ở [Case deadlock](../../backend-scaling-cases/phase-3-database-lock/03-case-deadlock.md).

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Coi dòng log kẹt khoá là "hệ thống vỡ" | Đó là cơ chế cứu hộ đã chạy xong | Đọc lại là "máy vừa tiết kiệm 50 giây" |
| Chữa bằng cách "khoá ít lại" | Làm hiếm hơn, **không làm hết** | Thống nhất **thứ tự** gắp khoá |
| Không có vòng retry | Sẽ luôn có một bên bị huỷ — đó là thiết kế | `@Retryable` + backoff + jitter |
| Đặt retry **bên trong** `@Transactional` | Giao dịch đã chết, chạy lại một câu lẻ là vô nghĩa | Retry bọc **ngoài** giao dịch |
| Retry không có jitter | Hai bên đẩy lùi cùng nhịp rồi lại đâm nhau | `random = true` |
| Retry vô hạn | Bão retry, sập dây chuyền | Trần 3 lần |
| Nghĩ một câu `UPDATE` đơn thì không kẹt được | Nó vẫn khoá **từng dòng một**, theo thứ tự **máy tự chọn** | `SELECT ... ORDER BY id FOR UPDATE` trước |
| Tăng `innodb_lock_wait_timeout` để "đỡ lỗi" | Kẹt **không bao giờ tự qua** — chỉ kéo dài thời gian chết | Sửa thứ tự |
| Tắt `innodb_deadlock_detect` | Kẹt sẽ phải chờ hết 50 giây mới thoát | Chỉ tắt khi đã chắc chắn không thể có kẹt |
| Thấy đỉnh trễ đúng ~1 giây trên Postgres mà không nghi kẹt | Đó là chữ ký của `deadlock_timeout` | Bật `log_lock_waits`, xem `pg_stat_database.deadlocks` |
| Gọi API bên ngoài giữa hai lệnh khoá | Kéo dài cửa sổ va chạm gấp trăm lần | Không gọi mạng trong giao dịch có khoá |

## Ba dòng đáng nhớ

```text
   ① KẸT KHOÁ KHÔNG PHẢI CHẬM. Nó KHÔNG TỰ QUA.

   ② DÒNG LỖI TRONG LOG LÀ "MÁY GỠ XONG", không phải "hệ thống vỡ".

   ③ CÁCH SỬA LÀ THỐNG NHẤT THỨ TỰ GẮP KHOÁ, không phải khoá ít đi.
      Và luôn sẵn sàng CHẠY LẠI cả giao dịch, vì sẽ có một bên bị dừng.
```

## Tóm tắt bài 16

- Khoá dòng và **chờ khoá là chuyện bình thường**, xảy ra suốt ngày. Nó chỉ hỏng khi **hàng đợi không có điểm cuối**.
- **Kẹt khoá ≠ chậm.** Chậm thì tự qua; kẹt thì **không bao giờ tự qua**, và tăng tài nguyên không giúp gì.
- Database **không ngăn kẹt** — nó để kẹt xảy ra rồi **dò vòng tròn trong sơ đồ ai-chờ-ai** và huỷ một bên. Bên bị chọn thường là bên đã làm ít việc nhất.
- Không có bộ dò thì hai lệnh đứng im **50 giây** (mặc định MySQL). **Dòng lỗi trong log là chỗ máy vừa tiết kiệm cho bạn 50 giây.**
- **MySQL dò ngay lập tức; PostgreSQL đợi `deadlock_timeout` = 1 giây rồi mới dò.** Đỉnh trễ đúng ~1 giây trên Postgres là chữ ký của kẹt khoá.
- **Gốc là THỨ TỰ, không phải SỐ LƯỢNG.** Giao dịch ngắn làm kẹt hiếm hơn nhưng không hết. Sắp các dòng theo ID tăng dần trước khi sửa mới là cách chữa.
- **Một câu `UPDATE` duy nhất vẫn kẹt được**, vì nó khoá từng dòng một theo thứ tự **máy tự chọn** — thứ tự bạn không viết ra và không nhìn thấy.
- Bốn nguồn kẹt ít ngờ: **khoá ngoại, chèn trùng khoá duy nhất, gap lock của MySQL, và nâng cấp khoá**.
- **Retry là bắt buộc**, phải bọc **cả giao dịch**, có trần số lần, backoff luỹ thừa và jitter.

**Bài kế tiếp** → [Bài 17: Hàng đợi chạy trên Postgres hỏng ở đâu](02-hang-doi-tren-postgres-hong-o-dau.md)
