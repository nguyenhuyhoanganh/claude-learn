# Bài 7: "Lưu số dư tiền kiểu gì?"

Buổi live đó thu về bao nhiêu? Sáng hôm sau cả mạng hỏi đúng câu này. 2,1 triệu người xem cùng lúc, quà bắn lên kín màn hình. Không ai nói được con số. Tôi không biết, bạn cũng không biết, nền tảng thì không nói.

Nhưng có **một chỗ bắt buộc phải biết** — chính xác tới từng đồng, và biết **ngay trong lúc phiên live còn đang chạy**.

Trên cùng một màn hình đó có hai con số nằm cạnh nhau:

```text
   ┌──────────────────────────────┐
   │  👁  2.148.302 người đang xem │  ← sai vài phần trăm: không ai nói gì
   │  🎁  842.500.000 đ           │  ← sai MỘT ĐỒNG: ra toà
   └──────────────────────────────┘
```

Hai con số, cùng một màn hình, cùng một hệ thống. Vậy mà **chuẩn đúng của chúng ngược hẳn nhau**. Bài này mổ ra vì sao, và vì sao câu trả lời cuối cùng là *"nuôi cả hai con số, đừng cố ép chúng thành một"*.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **Ô số dư** (balance column) | Một cột trong bảng giữ tổng tiền hiện tại của một người | Con số duy nhất viết bằng bút chì, mỗi lần đổi thì tẩy đi ghi lại |
| **Sổ cái** (ledger) | Bảng riêng, mỗi biến động tiền là **một dòng ghi thêm**, không bao giờ sửa | Cuốn sổ thu chi: mỗi lần thu/chi ghi một dòng mới, không tẩy xoá |
| **Append-only** (chỉ ghi thêm) | Chỉ có `INSERT`, không có `UPDATE`, không có `DELETE` | Sổ đóng gáy, viết bằng bút mực, không xé trang |
| **Hàng nóng** (hot row) | Một dòng bị rất nhiều giao dịch cùng sửa một lúc | Một cái cửa duy nhất cho cả nghìn người đi qua |
| **Khoá dòng** (row lock) | Sửa một dòng trong giao dịch thì dòng đó bị khoá tới lúc commit | Ai đang viết vào sổ thì người khác phải chờ |
| **Idempotency** (luỹ đẳng) | Gửi cùng một lệnh nhiều lần cho kết quả y như gửi một lần | Bấm nút thang máy 5 lần cũng chỉ gọi một chuyến |
| **Idempotency key** | Mã duy nhất do phía gửi sinh ra, kèm theo mỗi yêu cầu, dùng để nhận ra bản sao | Số phiếu: cùng số phiếu thì là cùng một việc |
| **Audit trail** (dấu vết kiểm toán) | Lịch sử đầy đủ, không sửa được, của mọi biến động | Cuốn sổ để đối chứng khi có tranh cãi |
| **Chốt sổ / snapshot** | Ghi một dòng "tới đây tổng = X" để khỏi phải cộng lại từ đầu | Kết sổ cuối tháng: từ tháng sau chỉ cộng tiếp từ số này |
| **Eventual consistency** | Con số sẽ đúng, nhưng không đúng ngay lập tức | Bảng tỷ số chạy chậm hơn trận đấu vài giây |
| **Đối soát** (reconciliation) | So hai nguồn số liệu với nhau để tìm chỗ lệch | Kiểm kê: đếm tiền trong két, so với sổ |

## Tầng 1 — Định nghĩa: cộng thẳng vào một ô

Bắt đầu từ thứ nhỏ nhất: một người bấm tặng một món quà. Phía sau, đó là một dòng lệnh chạy vào máy chủ, nói *ai vừa gửi cho ai món gì, đáng bao nhiêu*.

Cách đầu tiên ai cũng nghĩ ra — và cũng là cách được viết nhiều nhất trong thực tế:

```sql
UPDATE nguoi_dung SET so_du = so_du + 500 WHERE id = 42;
```

Một dòng lệnh, chạy trong một phần nghìn giây. Bảng lúc nào cũng có sẵn con số cần hiển thị. Nghe không có gì sai.

**Nó chỉ sai khi đông người.** Và nó sai theo ba cách khác nhau.

### Vết nứt 1 — Hàng nóng: 2.000 lệnh lao vào đúng một dòng

Sân khấu đang có 2 triệu người, mỗi giây có 2.000 lượt tặng quà cho **cùng một chủ kênh**.

2.000 lệnh đó không xếp hàng lịch sự. Chúng lao vào **đúng một chỗ, cùng một dòng, cùng một ô**:

```text
   Thời gian ──────────────────────────────────────────────────►

   Lệnh 1  [khoá dòng 42]──cộng──[nhả]
   Lệnh 2               └─chờ──[khoá]──cộng──[nhả]
   Lệnh 3                          └─chờ────────[khoá]──cộng──[nhả]
   ...
   Lệnh 2000  └────────────── chờ gần 2.000 lượt trước nó ──────────┘

   Database KHÔNG THỂ cộng song song vào cùng một ô.
   Nó buộc phải xếp các lệnh nối đuôi nhau — nếu không thì
   chính là Lost Update ở Bài 2.
```

Phép tính trần, giống hệt [Bài 5](05-sinh-ma-don-hang-the-nao.md):

```text
   Mỗi lượt cộng giữ khoá khoảng 2ms (chỉ tính riêng lệnh UPDATE,
   chưa kể phần còn lại của giao dịch)

   Trần = 1.000ms / 2ms = 500 lượt/giây

   Nhu cầu: 2.000 lượt/giây.
   → Hàng đợi dài ra vô hạn. Độ trễ tăng dần.
   → Tới một mức, timeout hàng loạt, và CẢ SÂN KHẤU chậm theo.
```

Chú ý chỗ này: nút thắt **không phải CPU, không phải đĩa, không phải mạng**. Máy chủ database có thể đang rảnh 80%. Nút thắt là **một dòng dữ liệu** mà tất cả đều phải đi qua. Thêm máy chủ không giúp gì.

### Vết nứt 2 — Cộng trùng do thử lại

Người tặng đang dùng mạng di động. Lệnh gửi đi rồi, nhưng máy chủ trả lời chậm. Điện thoại thấy im lặng quá lâu, tự động **gửi lại lần nữa**.

```text
   Điện thoại  ──── "tặng 500" ────►  Máy chủ: nhận, cộng 500 ✓
                                              gửi trả lời...
                    (trả lời rơi mất trên đường)
   Điện thoại  ──── "tặng 500" ────►  Máy chủ: nhận, cộng 500 ✓ LẦN NỮA
               ◄─── "thành công" ───

   Kết quả: Người tặng bị trừ tiền 1 lần.
            Người nhận được cộng 2 lần.
```

**Không có lỗi nào hiện ra**, vì cả hai lệnh đều hợp lệ, đều đúng cú pháp, đều thành công. Ô số dư không có cách nào biết hai lệnh đó thực ra là **một việc**.

Đây không phải trường hợp hiếm. Trên mạng di động, tỷ lệ thử lại có thể lên tới vài phần trăm ở giờ cao điểm.

### Vết nứt 3 — Mất sạch dấu vết

Sáng hôm sau có người nhắn: *"Tôi tặng 5 lần mà chỉ thấy 4."*

Bạn mở bảng ra. Trong ô đó chỉ có **đúng một con số**.

```text
   so_du = 842.500.000

   Nó không nhớ nó đã cộng những gì.
   Không biết cộng bao nhiêu lần.
   Không biết cộng lúc nào.
   Không biết ai cộng.

   → KHÔNG CÓ GÌ ĐỂ ĐỐI SOÁT.
```

Bạn không thể trả lời khách hàng. Bạn không thể chứng minh mình đúng. Và nếu chuyện đi xa hơn, bạn cũng không thể chứng minh với cơ quan quản lý.

> **Chốt tầng 1:** Ô số dư giữ **KẾT QUẢ**, nhưng vứt sạch **QUÁ TRÌNH**. Mà tiền thì không ai cãi nhau về kết quả — người ta cãi nhau về **quá trình**.

## Tầng 2 — Con số: sổ cái giải quyết cả ba vết nứt thế nào

Kế toán loài người giải xong bài này từ **hơn 500 năm trước** (Luca Pacioli hệ thống hoá năm 1494). Họ không giữ một con số tổng — họ giữ **một cuốn sổ**. Mỗi việc xảy ra là một dòng mới.

Đưa cách đó vào máy thì thành một bảng riêng:

```sql
CREATE TABLE so_cai (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tu_tai_khoan    BIGINT      NOT NULL,
    den_tai_khoan   BIGINT      NOT NULL,
    so_tien         BIGINT      NOT NULL CHECK (so_tien > 0),  -- đơn vị nhỏ nhất
    loai            TEXT        NOT NULL,
    idempotency_key TEXT        NOT NULL,
    luc             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_idem UNIQUE (idempotency_key)   -- ← chống cộng trùng
);

CREATE INDEX idx_so_cai_den ON so_cai (den_tai_khoan, id);
```

```sql
-- Mỗi lượt tặng là MỘT DÒNG GHI THÊM. Không có UPDATE.
INSERT INTO so_cai (tu_tai_khoan, den_tai_khoan, so_tien, loai, idempotency_key)
VALUES (842, 42, 500, 'TANG_QUA', 'gift-9f3a1c7e-...');
```

Ba vết nứt đóng lại cùng lúc:

| Vết nứt | Sổ cái giải thế nào |
|---|---|
| **Hàng nóng** | Không còn ai sửa chung một dòng. 2.000 lượt/giây là **2.000 dòng mới rơi vào 2.000 chỗ khác nhau** — mỗi lệnh chỉ ghi vào cuối bảng, không tranh khoá với ai |
| **Cộng trùng** | `idempotency_key` là ràng buộc **duy nhất**. Lệnh gửi lại lần hai bị database **chặn ngay ở cửa**, trả về lỗi trùng khoá, và ứng dụng dịch nó thành "đã xử lý rồi, thành công" |
| **Mất dấu vết** | Lọc theo người tặng: **5 dòng hiện ra kèm giây phút của từng lượt**. Bạn trả lời khách hàng bằng dữ liệu thật, không phải bằng lời hứa |

### Chi tiết quan trọng về khoá luỹ đẳng

Khoá đó phải do **phía gửi sinh ra**, không phải máy chủ:

```javascript
// Điện thoại sinh khoá MỘT LẦN, giữ nguyên qua mọi lần thử lại
const idemKey = crypto.randomUUID();

async function tangQua(soTien) {
  for (let lan = 0; lan < 3; lan++) {
    try {
      return await api.post('/qua', { soTien }, {
        headers: { 'Idempotency-Key': idemKey }   // ← KHÔNG sinh lại
      });
    } catch (e) {
      if (!laLoiTamThoi(e)) throw e;
      await ngu(100 * 2 ** lan + Math.random() * 100);
    }
  }
}
```

Nếu máy chủ tự sinh khoá thì mỗi lần thử lại là một khoá mới, và cơ chế chống trùng vô tác dụng hoàn toàn. Đây là lỗi thiết kế hay gặp.

Và phía máy chủ, xử lý lỗi trùng phải dịch thành **thành công**, không phải lỗi:

```java
try {
    soCaiRepository.insert(dong);
} catch (DuplicateKeyException e) {
    // Đây KHÔNG phải lỗi. Đây là lần thử lại của một việc đã xong.
    // Trả về đúng kết quả của lần đầu.
    return soCaiRepository.timTheoIdempotencyKey(dong.getIdempotencyKey());
}
```

> **Chốt tầng 2:** Bảng không còn lưu *"bạn đang có bao nhiêu"*, nó lưu *"chuyện gì đã xảy ra"*. Số dư thôi làm **dữ liệu**, nó trở thành **kết quả của một phép cộng**:
>
> `so_du = SUM(các dòng liên quan)`

## Tầng 3 — Đánh đổi: được cái này thì mất cái kia

Đây là chỗ ăn điểm, vì rất nhiều người dừng lại ở "dùng sổ cái đi" mà không nói cái giá.

Trước đây muốn biết tổng thì **đọc một ô**. Bây giờ muốn biết tổng thì phải **cộng cả cuốn sổ lại từ dòng đầu tiên**.

```text
   Một phiên live đông để lại vài chục triệu dòng.

   SELECT SUM(so_tien) FROM so_cai WHERE den_tai_khoan = 42;
      → quét 30.000.000 dòng
      → mỗi lần chủ kênh mở ứng dụng ra xem
      → mở 10 lần là quét 10 lượt
```

Bạn vừa đổi một bài toán **ghi** lấy một bài toán **đọc**. Và bài toán đọc này còn tệ dần theo thời gian, vì cuốn sổ chỉ dài ra chứ không bao giờ ngắn lại.

### Lời giải: chốt sổ — cũng là thứ kế toán đã làm từ lâu

Kế toán ngoài đời gặp đúng bài này, và họ **chốt sổ**. Cuối kỳ ghi thêm một dòng: *"Tới đây tổng = 8.400"*. Từ dòng đó trở đi, phần sổ cũ không phải đọc lại nữa.

Máy làm y hệt:

```sql
CREATE TABLE chot_so (
    tai_khoan     BIGINT      NOT NULL,
    den_dong_id   BIGINT      NOT NULL,    -- đã cộng tới dòng sổ cái nào
    so_du         BIGINT      NOT NULL,
    luc           TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tai_khoan, den_dong_id)
);
```

```sql
-- Đọc số dư: dòng chốt gần nhất + phần đuôi mới phát sinh
WITH chot AS (
    SELECT den_dong_id, so_du
      FROM chot_so
     WHERE tai_khoan = 42
     ORDER BY den_dong_id DESC
     LIMIT 1
)
SELECT chot.so_du + COALESCE(SUM(s.so_tien), 0) AS so_du_hien_tai
  FROM chot
  LEFT JOIN so_cai s
    ON s.den_tai_khoan = 42
   AND s.id > chot.den_dong_id       -- ← chỉ cộng PHẦN ĐUÔI
 GROUP BY chot.so_du;
```

```text
   TRƯỚC:  cộng 30.000.000 dòng
   SAU:    cộng vài nghìn dòng (phần phát sinh từ lần chốt gần nhất)

   → Số dòng phải đọc giảm khoảng MỘT NGHÌN LẦN.
```

**Ba luật của dòng chốt sổ** — thiếu luật nào cũng biến nó từ đường tắt thành nguồn sai số:

```text
   ① Dòng chốt KHÔNG PHẢI bản gốc. Nghi ngờ nó thì cộng lại từ đầu sổ
      vẫn ra đúng con số cũ. Sự thật luôn nằm ở từng dòng sổ cái.

   ② Dòng chốt phải neo vào MỘT ĐIỂM XÁC ĐỊNH của sổ (id, không phải
      thời gian). Neo vào thời gian là hỏng: hai dòng cùng mốc thời gian
      nhưng commit lệch nhau sẽ bị đếm hai lần hoặc bỏ sót.

   ③ Phải có job ĐỐI SOÁT chạy định kỳ: cộng lại từ đầu sổ, so với
      dòng chốt. Lệch một đồng là báo động ngay, đừng đợi cuối tháng.
```

Luật ② đáng dừng lại. Đây là cái bẫy tinh vi nhất trong toàn bộ thiết kế này:

```text
   Giao dịch A: BEGIN lúc 10:00:00, ghi dòng (luc = 10:00:00), COMMIT lúc 10:00:03
   Giao dịch B: BEGIN lúc 10:00:02, ghi dòng (luc = 10:00:02), COMMIT lúc 10:00:02

   Job chốt sổ chạy lúc 10:00:02.5, lấy "mọi dòng có luc <= 10:00:02":
      → Thấy B. KHÔNG thấy A (A chưa commit).
      → Chốt sổ ghi: "đã cộng tới 10:00:02".

   Lúc 10:00:03, A commit. Dòng của A có luc = 10:00:00,
   tức NHỎ HƠN mốc đã chốt.
      → Nó nằm trong vùng "đã cộng rồi" nhưng chưa hề được cộng.
      → MẤT TIỀN VĨNH VIỄN, và không ai phát hiện được cho tới
        kỳ đối soát.
```

Neo vào `id` tăng dần cũng chưa đủ an toàn tuyệt đối (id cũng được cấp trước khi commit). Cách chắc chắn nhất: job chốt sổ chỉ xử lý các dòng **đã đủ già** (ví dụ cũ hơn 5 phút), dài hơn giao dịch dài nhất có thể có trong hệ.

## Tầng 4 — Bản chất: hai con số cho cùng một thứ

Bây giờ quay lại câu hỏi mở đầu. Con số tổng nhảy liên tục trên màn hình phiên live — nó đọc từ cuốn sổ cái đó ra à?

**KHÔNG.** Nó không chạm vào sổ cái, không một lần nào trong cả phiên live.

Nó là một **bộ đếm để riêng**, cộng tạm trong bộ nhớ (thường là một counter trong Redis), làm tròn, và trễ vài giây so với sự thật. Đúng cái kiểu ước lượng mà **con số người xem** đang dùng.

```text
   ┌─────────────────────────────────────────────────────────────┐
   │  ĐƯỜNG NHANH — cho mắt người xem                             │
   │                                                              │
   │  Mỗi lượt quà ──► INCRBY redis "live:9981:tong" 500          │
   │                    (thao tác nguyên tử, ~0,1ms, 100k lượt/s) │
   │                                                              │
   │  Màn hình đọc bộ đếm này, cập nhật mỗi 1–2 giây.             │
   │  Được phép sai. Được phép trễ. Được phép mất khi Redis restart│
   └─────────────────────────────────────────────────────────────┘
                              ║
                              ║  hai đường CHẠY SONG SONG,
                              ║  không đường nào chờ đường nào
                              ║
   ┌─────────────────────────────────────────────────────────────┐
   │  ĐƯỜNG CHẬM — cho sổ sách                                    │
   │                                                              │
   │  Mỗi lượt quà ──► INSERT INTO so_cai (...)                   │
   │                    (bền, có idempotency key, không bao giờ sửa)│
   │                                                              │
   │  Chốt sổ mỗi vài phút. Đối soát mỗi đêm.                     │
   │  KHÔNG được phép sai, dù một đồng.                           │
   └─────────────────────────────────────────────────────────────┘
```

**Và như thế mới là đúng, chứ không phải sai.** Bắt mỗi lượt quà phải cộng đúng con số đang hiển thị cho 2 triệu người thì thứ vỡ trước tiên chính là phiên live.

Nên cùng một hệ thống nuôi **hai con số cho cùng một thứ**:

| | Con số cho mắt người xem | Con số cho sổ cái |
|---|---|---|
| Nguồn | Bộ đếm trong bộ nhớ (Redis) | Bảng sổ cái trong database |
| Tốc độ | ~0,1 ms, hàng trăm nghìn lượt/giây | ~2 ms, hàng nghìn lượt/giây |
| Độ chính xác | Ước lượng, trễ vài giây, làm tròn | **Tuyệt đối** |
| Mất được không | Được — dựng lại từ sổ cái | **Không bao giờ** |
| Ai đọc | Người xem, chủ kênh (xem cho vui) | Kế toán, thanh toán, cơ quan quản lý, toà án |
| Sai thì sao | Không ai nói gì | Ra toà |

Đây chính là câu trả lời cho câu hỏi mở đầu: hai con số cạnh nhau trên màn hình có **hai chuẩn đúng khác nhau** vì chúng **phục vụ hai người đọc khác nhau**.

### Khi hàng nóng vẫn còn: hai kỹ thuật nữa

Ngay cả với sổ cái, vẫn có chỗ phải cộng vào một ô — ví dụ khi bạn cần kiểm tra số dư trước khi cho tiêu. Hai kỹ thuật để giảm tranh chấp:

**① Bộ đếm chia mảnh (sharded counter):** thay vì một dòng, dùng N dòng rồi cộng lại khi đọc.

```sql
-- Ghi: chọn ngẫu nhiên một trong 16 mảnh → tranh chấp giảm 16 lần
UPDATE so_du_manh SET gia_tri = gia_tri + 500
 WHERE tai_khoan = 42 AND manh = floor(random() * 16);

-- Đọc: cộng 16 dòng lại
SELECT SUM(gia_tri) FROM so_du_manh WHERE tai_khoan = 42;
```

Đánh đổi: đọc đắt hơn 16 lần (nhưng vẫn rất rẻ), và bạn không thể đặt ràng buộc "số dư không được âm" trên từng mảnh.

**② Gom lô (batching):** một tiến trình gom 100 lượt quà rồi cộng một lần.

```text
   Không gom:  2.000 lệnh UPDATE/giây vào một dòng  → nghẽn
   Gom lô 100: 20 lệnh UPDATE/giây vào một dòng      → thoải mái

   Cái giá: số dư trễ thêm vài chục mili-giây, và phải xử lý
            trường hợp tiến trình gom chết giữa chừng
            (sổ cái vẫn là nguồn sự thật nên khôi phục được).
```

### Đọc thêm

Toàn bộ mô hình sổ cái, ghi kép, tính bất biến và quy trình đối soát được mổ kỹ trong khoá ngân hàng:

- [Thiết kế ledger](../../banking-fintech-domain/phase-6-thiet-ke-he-thong/01-thiet-ke-ledger.md)
- [Idempotency](../../banking-fintech-domain/phase-6-thiet-ke-he-thong/02-idempotency.md)
- [Đối soát tự động](../../banking-fintech-domain/phase-6-thiet-ke-he-thong/04-doi-soat-tu-dong.md)

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Dùng ô số dư cho tiền | Hàng nóng + cộng trùng + mất dấu vết | Sổ cái ghi thêm |
| Không có khoá luỹ đẳng | Mạng chập là cộng hai lần, không ai biết | `UNIQUE (idempotency_key)` |
| Máy chủ tự sinh khoá luỹ đẳng | Mỗi lần thử lại là một khoá mới → vô tác dụng | Phía gửi sinh khoá, giữ nguyên qua mọi lần thử |
| Lỗi trùng khoá trả về 500 | Client thấy lỗi lại thử tiếp, vòng lặp vô tận | Dịch thành "đã xử lý rồi", trả kết quả lần đầu |
| Lưu tiền bằng số thực (float) | `0.1 + 0.2 ≠ 0.3` — sai từ gốc | Số nguyên theo đơn vị nhỏ nhất, hoặc `NUMERIC` |
| Chốt sổ neo vào **thời gian** | Giao dịch commit muộn rơi vào vùng đã chốt → mất tiền | Neo vào `id` + chỉ xử lý dòng đã đủ già |
| Không có job đối soát | Sai số tích tụ tới cuối tháng mới lộ | Cộng lại từ đầu sổ mỗi đêm, so với dòng chốt |
| Cho phép `UPDATE`/`DELETE` trên sổ cái | Mất tính bất biến, mất giá trị pháp lý | Thu hồi quyền ở cấp database; sửa sai bằng **dòng bút toán ngược** |
| Ép một con số phục vụ cả UI lẫn kế toán | Hoặc UI vỡ, hoặc sổ sách sai | Nuôi hai con số, hai chuẩn đúng |
| Bộ đếm UI làm nguồn sự thật | Redis restart là mất | Sổ cái là nguồn duy nhất; bộ đếm dựng lại được từ sổ cái |

## Bản mẫu 30 giây

> *"Lần tới khi có người hỏi câu này, em không trả lời ngay mà hỏi ngược một câu đã: **Ai sẽ đọc con số này, và sai bao nhiêu thì họ kiện?** Vì hai câu trả lời sẽ đi hai hướng hoàn toàn khác nhau.*
>
> ***Nếu đọc cho giao diện/livestream:*** *em dùng một bộ đếm ước lượng trong Redis, `INCRBY`, chấp nhận trễ vài giây và làm tròn. Nó phải nhanh, và nó được phép sai.*
>
> ***Nếu là tiền thật:*** *em không lưu số dư trong một ô. Em dùng sổ cái chỉ ghi thêm — mỗi biến động là một dòng, không bao giờ `UPDATE`. Ba lý do: thứ nhất, ô số dư tạo hàng nóng, 2.000 lượt/giây lao vào một dòng thì trần chỉ khoảng 500 lượt và thêm máy không cứu được vì nút thắt là một dòng dữ liệu; thứ hai, ô số dư không chống được cộng trùng khi client thử lại, còn sổ cái thì em đặt `UNIQUE` trên khoá luỹ đẳng do client sinh nên lệnh gửi lại bị chặn ngay ở cửa; thứ ba, ô số dư giữ kết quả mà vứt quá trình — khách khiếu nại thì em không có gì để đối soát.*
>
> *Cái giá của sổ cái là đọc số dư phải cộng cả sổ, nên em thêm dòng chốt sổ định kỳ: số dư = dòng chốt gần nhất cộng phần đuôi. Số dòng phải đọc giảm khoảng nghìn lần. Nhưng em neo dòng chốt vào `id` chứ không vào thời gian, và chỉ chốt những dòng đã đủ già — vì giao dịch commit muộn có thể mang mốc thời gian cũ và rơi vào vùng đã chốt, đó là kiểu mất tiền âm thầm không ai phát hiện được.*
>
> *Và dòng chốt không phải bản gốc — nghi ngờ thì cộng lại từ đầu sổ vẫn ra đúng. Em có job đối soát chạy mỗi đêm làm đúng việc đó."*

## Tóm tắt bài 7

- **Ô số dư giữ KẾT QUẢ và vứt QUÁ TRÌNH.** Tiền thì người ta cãi nhau về quá trình.
- Ba vết nứt của ô số dư: **hàng nóng** (trần ~500 lượt/giây, thêm máy vô ích), **cộng trùng khi client thử lại**, **mất sạch dấu vết đối soát**.
- **Sổ cái chỉ ghi thêm** đóng cả ba: ghi vào 2.000 chỗ khác nhau thay vì tranh một dòng, `UNIQUE` trên khoá luỹ đẳng chặn bản sao ngay ở cửa, và mỗi lượt đều có dòng riêng để đối chứng.
- Khoá luỹ đẳng phải do **phía gửi** sinh và **giữ nguyên qua mọi lần thử lại**. Lỗi trùng khoá phải dịch thành **thành công**.
- Cái giá của sổ cái là đọc chậm → giải bằng **chốt sổ**. Số dư = dòng chốt gần nhất + phần đuôi, giảm khoảng **nghìn lần** số dòng phải đọc.
- **Neo dòng chốt vào `id` chứ không vào thời gian**, và chỉ chốt dòng đã đủ già — nếu không, giao dịch commit muộn sẽ rơi vào vùng đã chốt và mất tiền âm thầm.
- **Một hệ thống nuôi hai con số cho cùng một thứ**: con số cho mắt người xem (nhanh, được phép sai) và con số cho sổ cái (chậm, không được sai). Ép chúng thành một là hỏng cả hai.

**Bài kế tiếp** → [Bài 8: Kế hoạch dùng chung và cái bẫy của một điều kiện OR](../phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md)
