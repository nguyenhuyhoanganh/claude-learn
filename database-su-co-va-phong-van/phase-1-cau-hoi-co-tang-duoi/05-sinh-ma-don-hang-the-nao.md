# Bài 5: "Bạn sinh mã đơn hàng thế nào?"

Kế toán gọi xuống hỏi ba số đơn hàng biến đi đâu.

Sổ ghi 42, 43, rồi nhảy thẳng sang 47. Không ai xoá đơn nào. Hệ thống cũng không báo lỗi nào.

> *"Bạn sinh mã đơn hàng thế nào?"*

Bảy chữ, câu hỏi dễ nhất buổi hôm đó. Bạn trả lời được trong 3 giây — và đó đúng là chỗ bạn sắp trượt.

Vì câu hỏi tiếp theo sẽ **không nói về database nữa**. Nó nói về kế toán. Và đó là chỗ mọi thứ gãy, vì kế toán đếm số theo một luật khác hẳn.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **Sequence** (bộ đếm) | Đối tượng riêng trong database chuyên phát số tăng dần. PostgreSQL: `SEQUENCE`; MySQL: `AUTO_INCREMENT` | Máy phát số thứ tự ở ngân hàng: bấm là ra số, không quan tâm bạn có vào quầy hay không |
| **`nextval`** | Lệnh xin số tiếp theo từ bộ đếm | Bấm nút lấy phiếu |
| **Ngoài giao dịch** (non-transactional) | Bộ đếm **không bị rollback**. Đã phát số ra là mất luôn, kể cả giao dịch quay đầu | Phiếu đã in ra rồi thì không nhét ngược vào máy được |
| **Lỗ số / khoảng trống** (gap) | Những số đã bị phát ra nhưng không gắn với dòng dữ liệu nào | Số thứ tự 44 đã in nhưng người đó bỏ về |
| **Cache của sequence** | Mỗi kết nối xin sẵn một lô số (ví dụ 50 số) để khỏi phải hỏi lại | Lấy sẵn một xấp phiếu về bàn, dùng dần |
| **Bảng đếm** (counter table) | Một bảng bình thường có một dòng giữ số hiện tại, tự cộng bằng `UPDATE` | Cuốn sổ chỉ có một dòng: "số cuối cùng đã dùng là ..." |
| **Khoá dòng** (row lock) | Khi bạn sửa một dòng trong giao dịch, database khoá dòng đó tới lúc commit | Mượn cuốn sổ về bàn mình, ai cần cũng phải chờ |
| **Trần đồng thời** | Số việc tối đa hệ thống làm được mỗi giây khi mọi việc phải đi qua một chỗ chật | Một cửa duy nhất thì dòng người chỉ chảy nhanh bằng tốc độ cái cửa đó |
| **Serialize** (tuần tự hoá) | Ép các việc chạy nối đuôi nhau thay vì song song | Xếp hàng một |

## Tầng 1 — Định nghĩa: để database tự sinh số

Ứng viên trả lời:

> *"Em để database tự sinh số. Mỗi đơn một số tăng dần, không bao giờ trùng."*

Đúng. Đó là cách gần như mọi hệ thống đang chạy, và nó chạy tốt nhiều năm.

```sql
-- PostgreSQL
CREATE TABLE don_hang (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- cách hiện đại
    ...
);

-- MySQL
CREATE TABLE don_hang (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ...
);
```

Người phỏng vấn gật đầu, ghi một dòng vào sổ, rồi hỏi tiếp. Họ không nói đúng, cũng không nói sai. **Đó mới là lúc đáng lo.**

### Vì sao có lỗ số? Bộ đếm nhả số ra NGOÀI giao dịch

Đây là kiến thức nền phải nắm chắc trước khi lên tầng 2.

Bộ đếm của database **cố tình** không nằm trong giao dịch. Nó phải thế:

```text
   NẾU bộ đếm nằm trong giao dịch:

   Đơn A: BEGIN → xin số (43) → ... 40ms ... → COMMIT
   Đơn B: BEGIN → xin số      → PHẢI CHỜ A commit xong mới biết mình là 44
                                 ↑ Cả hệ thống xếp hàng ở đúng chỗ này.

   NÊN: bộ đếm nhả số NGAY, không chờ ai, và KHÔNG hoàn lại.
```

Hệ quả trực tiếp: khi một giao dịch quay đầu, **số đã lấy không quay về**. Nó mất luôn.

Bốn nguồn sinh lỗ số, xếp theo mức phổ biến:

| Nguồn | Cơ chế | Mức độ |
|---|---|---|
| **Giao dịch quay đầu** | Đơn bị huỷ giữa chừng, hết hàng, thanh toán trượt, validate fail | Thường xuyên nhất |
| **Cache của sequence** | PostgreSQL `CACHE 50`: mỗi kết nối giữ sẵn 50 số, kết nối chết thì số thừa mất hết | Lỗ **rất to** — cả chục số một lúc |
| **Ghi hàng loạt** | `INSERT ... SELECT` 1.000 dòng cấp phát cả khối số một lần, dòng nào lỗi thì số đó mất | Theo lô |
| **Khởi động lại máy chủ** | MySQL trước 8.0: `AUTO_INCREMENT` tính lại bằng `MAX(id)+1` sau khi khởi động lại → có thể **dùng lại số đã xoá**. Từ 8.0 thì giá trị được ghi bền vào redo log | Hiếm nhưng nguy hiểm |

Chi tiết về cache đáng nhớ, vì nó tạo ra lỗ số to nhất mà không ai giải thích được:

```sql
-- Kiểm tra cache của sequence trong PostgreSQL
SELECT seqcache FROM pg_sequence
 WHERE seqrelid = 'don_hang_id_seq'::regclass;

-- CACHE 1 (mặc định): mỗi lần xin một số → ít lỗ, nhưng mỗi lần đều
--                     phải ghi vào bộ đếm chung.
-- CACHE 50:           mỗi kết nối lấy sẵn 50 số → nhanh hơn, nhưng
--                     kết nối đóng lại là mất trắng số chưa dùng.
```

Với một pool 20 kết nối và `CACHE 50`, mỗi lần restart ứng dụng bạn mất tới **1.000 số**. Đây là lý do thật khiến ai đó nhìn thấy đơn nhảy từ 4.213 sang 5.198.

## Tầng 2 — Con số: bao nhiêu lỗ, và lỗ đó có phải lỗi không?

Người phỏng vấn hỏi, và **câu này không còn là câu hỏi kỹ thuật nữa**:

> *"Kế toán bảo mã đơn phải liên tục, không được nhảy số nào cả. Bạn nhận lời được không?"*

Câu trả lời là **KHÔNG** — nhưng phải nói được **vì sao không** và **cái lỗ đó lớn cỡ nào**.

```text
   Một sàn có 3% đơn rớt do không thanh toán
      → cứ 100 số phát ra thì có 3 cái lỗ.

   Mỗi ngày 2.000 đơn thành công
      → khoảng 62 số bị đốt mỗi ngày
      → ~22.600 số bị đốt mỗi năm.

   Cộng thêm mỗi lần deploy (pool 20 kết nối × CACHE 50 = 1.000 số)
      → deploy 3 lần/tuần = thêm 156.000 số/năm.
```

**Cái lỗ đó không phải lỗi.** Đây là câu đáng nhớ nhất bài:

> Cái lỗ đó là **hoá đơn bạn trả cho việc hai đơn không phải xếp hàng sau nhau**. Bỏ lỗ đi là phải trả lại đúng cái vừa mua.

Nói cách khác: bạn đã *mua* khả năng chạy song song, và *giá* của nó là những khoảng trống trong dãy số. Muốn không có lỗ thì phải hoàn lại món hàng đó.

## Tầng 3 — Đánh đổi: "sếp vẫn bắt mã phải liên tục"

Người phỏng vấn hỏi rất nhẹ nhàng:

> *"Sếp vẫn bắt mã phải liên tục, không nhân nhượng gì cả. Giờ bạn làm thế nào?"*

**Làm được.** Bạn tự nuôi một bảng đếm:

```sql
CREATE TABLE bo_dem (
    ten        TEXT PRIMARY KEY,
    gia_tri    BIGINT NOT NULL
);
INSERT INTO bo_dem VALUES ('ma_don_hang', 0);
```

```sql
BEGIN;
  -- Cộng 1 và lấy về số mới, TRONG CÙNG giao dịch với đơn hàng
  UPDATE bo_dem SET gia_tri = gia_tri + 1
   WHERE ten = 'ma_don_hang'
  RETURNING gia_tri;                      -- ví dụ trả về 44

  INSERT INTO don_hang (ma_don, ...) VALUES (44, ...);
COMMIT;
```

Bây giờ nếu đơn hàng hỏng, cả `UPDATE` bộ đếm cũng quay đầu — **số 44 được trả lại**, đơn sau vẫn lấy số 44. Không còn lỗ. Kế toán vui.

### Nhưng cái giá là gì? Đây là chỗ ăn điểm

Dòng `bo_dem` đó bị **khoá từ lúc `UPDATE` cho tới lúc `COMMIT`**. Mọi đơn hàng khác đứng chờ ngay sau nó.

```text
   Thời gian ────────────────────────────────────────────────────►

   Đơn A: [UPDATE bộ đếm]══════ 40ms xử lý ══════[COMMIT]
                 ↑ khoá dòng                          ↑ nhả khoá

   Đơn B:        └─────────── ĐỨNG CHỜ ──────────────┘[UPDATE][...]

   Đơn C:        └────────────── ĐỨNG CHỜ ────────────────────┘...

   Mọi đơn trong cả hệ thống phải đi qua đúng MỘT dòng này,
   và mỗi lượt chiếm 40ms.
```

Phép tính trần đồng thời rất đơn giản, và đây là con số cần nói ra:

```text
   Trần = 1 giây / thời gian giữ khoá
        = 1.000 ms / 40 ms
        = 25 đơn mỗi giây

   25 đơn/giây, DÙ BẠN THÊM BAO NHIÊU MÁY CHỦ ĐI NỮA.
```

Vế cuối mới là chỗ đau. Đây không phải giới hạn CPU hay RAM — thêm máy không giúp được gì, vì nút thắt là **một dòng trong database mà tất cả đều phải đi qua**.

> Đây là đánh đổi thật: **Mã liên tục** hoặc **bán được nhiều đơn cùng lúc** — chọn một, không có cả hai.

### Cách kéo trần lên mà vẫn giữ mã liên tục

Đây là phần tầng 4 mà rất ít người nói ra, và nói được là bạn vượt hẳn.

Thời gian giữ khoá không phải hằng số — nó bằng **khoảng cách từ lúc `UPDATE` bộ đếm tới lúc `COMMIT`**. Nên hãy đẩy lệnh cộng bộ đếm xuống **sát commit nhất có thể**:

```sql
BEGIN;
  -- ① Làm hết mọi việc nặng TRƯỚC: kiểm tồn kho, tính tiền,
  --    ghi chi tiết đơn, gọi validate... (35ms)
  INSERT INTO don_hang (...) VALUES (...) RETURNING id;
  INSERT INTO chi_tiet_don (...) VALUES (...);

  -- ② Cộng bộ đếm ở BƯỚC CUỐI CÙNG, ngay trước COMMIT (2ms)
  UPDATE bo_dem SET gia_tri = gia_tri + 1
   WHERE ten = 'ma_don_hang' RETURNING gia_tri;
  UPDATE don_hang SET ma_don = ? WHERE id = ?;
COMMIT;
```

```text
   Giữ khoá 40ms  →  trần  25 đơn/giây
   Giữ khoá  3ms  →  trần 333 đơn/giây     ← chỉ đổi THỨ TỰ hai câu lệnh
```

**Cùng một thiết kế, cùng một sự đảm bảo, trần cao hơn 13 lần.** Chỉ vì bạn để cái nút thắt ở cuối thay vì ở đầu.

Lưu ý một cái bẫy đi kèm: mọi lệnh gọi ra ngoài (gọi API cổng thanh toán, gửi mail, gọi service khác) **tuyệt đối không được nằm giữa `UPDATE` bộ đếm và `COMMIT`**. Một lệnh gọi mạng 300ms nằm ở đó kéo trần xuống còn 3 đơn/giây.

### Bốn cách khác để có mã liên tục

| Cách | Cơ chế | Trần | Khi nào dùng |
|---|---|---|---|
| **Bảng đếm trong cùng giao dịch** | Như trên | 25–333 đơn/s tuỳ vị trí lệnh | Đơn giản, đủ cho phần lớn hệ |
| **Tách mã kỹ thuật và mã nghiệp vụ** | `id` dùng sequence (có lỗ, dùng nội bộ); `ma_don` liên tục do một tiến trình đánh số sau | Rất cao | **Cách tốt nhất** — xem bên dưới |
| **Chỉ đánh số liên tục cho HOÁ ĐƠN** | Đơn hàng cứ có lỗ; hoá đơn thì liên tục | Rất cao | Khi yêu cầu pháp lý chỉ nhắm vào hoá đơn |
| **Đánh số theo kỳ** | Mỗi tháng/ngày một dãy riêng: `2026-08-0001` | Như bảng đếm | Giảm hoảng khi thấy số to; **không** làm tăng trần |

Cách thứ hai đáng nói kỹ, vì nó là thứ các hệ lớn thật sự làm:

```text
   ① Lúc tạo đơn: id = sequence (nhanh, có lỗ, KHÔNG ai nhìn thấy)
      → đơn ghi xong ngay, không xếp hàng, trần rất cao.

   ② Một tiến trình DUY NHẤT chạy mỗi vài giây:
      lấy các đơn đã COMMIT và chưa có mã nghiệp vụ,
      sắp theo thời gian tạo, gán mã liên tục 44, 45, 46...

   ③ Mã nghiệp vụ chỉ xuất hiện sau vài giây. Kế toán không quan tâm
      vài giây; họ quan tâm dãy số không đứt.
```

Điểm hay: bước ② không tranh chấp với ai vì nó là tiến trình **duy nhất**, chạy tuần tự, và nó chỉ xử lý những đơn **đã chắc chắn thành công** — nên không bao giờ phải trả lại số.

Điểm phải cẩn thận: bạn có một khoảng thời gian đơn hàng tồn tại mà chưa có mã nghiệp vụ. Giao diện phải xử lý được trạng thái đó (hiển thị "đang cấp mã" thay vì ô trống).

### Một cách SAI mà rất nhiều người viết

```sql
-- ĐỪNG BAO GIỜ VIẾT THẾ NÀY
INSERT INTO don_hang (ma_don, ...)
VALUES ((SELECT COALESCE(MAX(ma_don), 0) + 1 FROM don_hang), ...);
```

Ba lý do nó sai:

1. **Vẫn tranh chấp mà không hề khoá.** Hai giao dịch cùng đọc `MAX = 43`, cùng ghi 44. Bạn vừa tạo ra Lost Update ([Bài 2](02-hai-nguoi-sua-cung-mot-dong-ai-thang.md)) trên chính cột định danh.
2. **Chậm dần theo thời gian.** `MAX()` cần quét index mỗi lần; và nếu có điều kiện lọc kèm theo thì có thể quét cả bảng.
3. **Xoá một đơn là dùng lại số cũ.** Đơn 44 bị xoá → đơn tiếp theo lại là 44. Với hoá đơn thì đây là chuyện rất nghiêm trọng.

## Tầng 4 — Một chi tiết bảo mật hầu như không ai nhắc

Mã tăng dần **lộ quy mô kinh doanh của bạn ra ngoài**.

```text
   Đối thủ đặt hai đơn cách nhau đúng 24 giờ:
      Ngày 1, 10:00  →  ma_don = 128.400
      Ngày 2, 10:00  →  ma_don = 130.850

   → Bạn bán 2.450 đơn mỗi ngày. Họ vừa biết doanh số của bạn,
     miễn phí, không cần hack gì cả.
```

Đây là bài toán cổ điển trong thống kê (bài toán *ước lượng số xe tăng* thời Thế chiến II). Nó áp dụng cho cả mã người dùng, mã hoá đơn, mã phiếu.

Cách xử lý:

```text
   MÃ NỘI BỘ (id):        tăng dần, dùng cho khoá chính, index, join.
                          Không bao giờ lộ ra ngoài.

   MÃ CÔNG KHAI (public): ngẫu nhiên hoặc mã hoá — ULID, UUIDv7,
                          hoặc mã ngắn sinh từ id qua một phép hoán vị.
                          Đây là thứ xuất hiện trên URL và trong email.
```

Chi tiết về việc chọn kiểu khoá chính (auto-increment vs UUIDv4 vs UUIDv7) nằm ở [Khoá chính: auto increment, UUID v4 hay v7](../../sql-interview/phase-5/05-khoa-chinh-auto-increment-uuid-v4-hay-v7.md).

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Hứa "mã sẽ liên tục" mà không nói trần | 3 tháng sau hệ không gánh nổi giờ cao điểm | Nói trần ngay lúc nhận yêu cầu |
| `MAX(ma_don) + 1` | Lost Update trên chính cột định danh; chậm dần; dùng lại số đã xoá | Sequence hoặc bảng đếm |
| Cộng bộ đếm ở **đầu** giao dịch | Giữ khoá suốt cả giao dịch → trần thấp 13 lần | Đẩy xuống sát `COMMIT` |
| Gọi API bên ngoài giữa bộ đếm và commit | Một lệnh gọi 300ms kéo trần xuống 3 đơn/giây | Không gọi mạng trong giao dịch có khoá |
| Đặt `CACHE` lớn rồi ngạc nhiên vì lỗ to | Restart mất trắng số chưa dùng của mọi kết nối | `CACHE 1` nếu sợ lỗ, hoặc chấp nhận và giải thích |
| Dùng mã tăng dần làm mã công khai | Lộ doanh số cho đối thủ | Tách mã nội bộ và mã công khai |
| Đánh số liên tục cho **đơn hàng** thay vì **hoá đơn** | Tự trói trần vào luồng nóng nhất mà pháp lý không đòi | Chỉ đánh số liên tục ở nơi thật sự cần |
| Nghĩ thêm máy chủ sẽ tăng trần | Nút thắt là một dòng dữ liệu, không phải CPU | Đổi thiết kế, không đổi phần cứng |
| Không xử lý trạng thái "chưa có mã" ở giao diện | Ô trống trên màn hình khách hàng | Hiển thị "đang cấp mã" |

## Bản chất câu hỏi: họ đo bạn có dám nói không

Nhìn lại hai câu vừa rồi:

```text
   ① "Kế toán bảo mã phải liên tục. Bạn nhận lời được không?"
   ② "Sếp vẫn bắt phải liên tục. Giờ bạn làm thế nào?"
```

**Không câu nào hỏi bạn biết làm gì.** Cả hai đều đưa cho bạn một **yêu cầu của người khác**, rồi xem bạn nhận hay từ chối — và nếu nhận thì có nói giá không.

```text
   Người trả lời "Dạ được ạ" ngay
      → là người sẽ gật đầu với mọi yêu cầu.
      → 3 tháng sau mới thấy hệ không gánh nổi.
      → Lúc đó thì muộn: đã có người đặt hàng theo lời hứa đó rồi.

   Người trả lời "Được, nhưng trần khoảng 25 đơn/giây, và em có
   cách kéo lên 300 nếu mình chấp nhận mã xuất hiện trễ vài giây"
      → là người đã từng phải chọn.
```

Nên thứ họ đo không phải bạn làm được gì. Họ đo **bạn có dám nói không**, và quan trọng hơn — **có biết quy đổi một yêu cầu nghiệp vụ thành một con số kỹ thuật** hay không.

> **Nói không đúng lúc cũng là một kỹ năng kỹ thuật.**

Quay lại câu bạn tự trả lời lúc đầu bài. Nếu câu đó dừng ở tên một cái hàm — *"em dùng auto increment"* — thì nó chưa sai, **nó chỉ chưa nói giá**.

## Bản mẫu 30 giây

> *"Cho em hỏi trước: **mã có cần liên tục không ạ**? Vì hai trường hợp này khác nhau hoàn toàn về kiến trúc.*
>
> ***Nếu không cần liên tục:*** *em để sequence của database làm. Nó nhả số ra ngoài giao dịch nên đơn nào rớt là số đó mất — sàn có 3% đơn rớt thì cứ 100 số có 3 lỗ, cộng thêm lỗ do cache của sequence mỗi lần deploy. Nhưng cái lỗ đó không phải lỗi, nó là hoá đơn mình trả cho việc các đơn không phải xếp hàng sau nhau.*
>
> ***Nếu bắt buộc liên tục:*** *em dùng một bảng đếm, cộng 1 trong cùng giao dịch với đơn hàng, đơn hỏng thì số trả lại. Nhưng em báo trước con số: dòng đếm đó bị khoá suốt giao dịch, nên với giao dịch 40 mili-giây thì trần là khoảng **25 đơn một giây**, và thêm bao nhiêu máy chủ cũng không tăng được, vì nút thắt là một dòng dữ liệu chứ không phải CPU.*
>
> *Em có hai cách kéo trần lên. Rẻ nhất là đẩy lệnh cộng bộ đếm xuống sát `COMMIT` — giữ khoá còn 3ms thì trần lên khoảng 300 đơn/giây, chỉ đổi thứ tự hai câu lệnh. Cách tốt hơn là tách mã kỹ thuật và mã nghiệp vụ: `id` cứ dùng sequence cho nhanh, còn mã liên tục thì một tiến trình duy nhất gán cho các đơn đã commit sau vài giây. Kế toán không quan tâm trễ vài giây, họ quan tâm dãy số không đứt.*
>
> *Và em cũng đề nghị xem lại phạm vi: thường pháp lý chỉ đòi **hoá đơn** liên tục chứ không đòi **đơn hàng** liên tục. Nếu đúng vậy thì mình không nên trói trần vào luồng nóng nhất."*

## Tóm tắt bài 5

- **Bộ đếm của database nhả số ra ngoài giao dịch** — bắt buộc phải thế, nếu không cả hệ xếp hàng. Hệ quả: số đã phát không bao giờ quay về.
- Bốn nguồn sinh lỗ: **giao dịch quay đầu, cache của sequence, ghi hàng loạt, khởi động lại**. Cache là nguồn tạo lỗ to nhất.
- **Cái lỗ không phải lỗi.** Nó là cái giá của việc chạy song song.
- Muốn mã liên tục thì phải **serialize qua một dòng**, và trần bằng **1 giây / thời gian giữ khoá**. Giao dịch 40ms → **25 đơn/giây**, thêm máy không cứu được.
- **Đẩy lệnh cộng bộ đếm xuống sát `COMMIT`** là cách rẻ nhất tăng trần hơn 10 lần. Tuyệt đối không gọi API bên ngoài trong khoảng đó.
- Cách tốt nhất: **tách mã kỹ thuật (sequence, có lỗ) và mã nghiệp vụ (liên tục, gán sau bởi một tiến trình duy nhất)**.
- Mã tăng dần **lộ quy mô kinh doanh**. Mã công khai phải khác mã nội bộ.
- Thứ họ đo trong phỏng vấn là **bạn có dám nói không**, và có biết quy đổi yêu cầu nghiệp vụ thành một con số kỹ thuật hay không.

**Bài kế tiếp** → [Bài 6: "Bạn sao lưu database thế nào?"](06-ban-sao-luu-database-the-nao.md)
