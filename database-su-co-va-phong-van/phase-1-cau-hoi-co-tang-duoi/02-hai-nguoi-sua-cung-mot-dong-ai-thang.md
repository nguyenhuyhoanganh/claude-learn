# Bài 2: "Hai người sửa cùng một dòng, ai thắng?"

Hai nhân viên cùng mở một đơn hàng trên màn hình quản trị. Cùng sửa. Cùng bấm lưu, cách nhau chưa tới một giây.

Người phỏng vấn vẽ hai mũi tên chỉ vào cùng một dòng trong bảng, rồi hỏi:

> *"Hai người sửa cùng một dòng, ai thắng?"*

Câu hỏi hiện đủ chữ, rồi họ ngồi im, không cho thêm dữ kiện nào.

Bạn vừa trả lời trong đầu rồi. Giữ nguyên câu đó. **Câu đó đúng, và nó vẫn trượt** — không phải vì bạn trả lời sai, mà vì câu hỏi này **cố tình thiếu đúng một dữ kiện**, và thứ họ đo là bạn có nhận ra chỗ thiếu đó không.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa trong bài này |
|---|---|
| **Lost Update** (mất cập nhật) | Hai giao dịch cùng đọc một giá trị, cùng tính toán trên nó, cùng ghi lại — kết quả của người trước **biến mất không dấu vết** |
| **Read-Modify-Write** | Ba bước: đọc giá trị → tính toán trong ứng dụng → ghi lại. Chính ba bước này sinh ra Lost Update |
| **Transaction** (giao dịch) | Một nhóm lệnh chạy trọn gói: hoặc thành công hết, hoặc quay đầu sạch |
| **Isolation Level** (mức cách ly) | Mức độ hai giao dịch chạy song song được phép "nhìn thấy" nhau |
| **Read Committed** | Mức cách ly mặc định của PostgreSQL, Oracle, SQL Server: chỉ đọc được dữ liệu đã commit |
| **Repeatable Read** | Mức cách ly mặc định của MySQL/InnoDB: trong một giao dịch, đọc lại vẫn thấy y như lần đầu |
| **Pessimistic Locking** (khoá bi quan) | Giả định sẽ có tranh chấp → **khoá trước**, ai tới sau xếp hàng chờ |
| **Optimistic Locking** (khoá lạc quan) | Giả định hiếm tranh chấp → **không khoá**, lúc ghi mới kiểm tra xem có ai chen ngang không, có thì làm lại |
| **Version Column** (cột phiên bản) | Một cột số tăng dần mỗi lần dòng bị sửa, dùng để phát hiện chen ngang |
| **Atomic Update** (cập nhật nguyên tử) | Để database tự tính (`SET qty = qty - 1`) thay vì ứng dụng đọc rồi tính rồi ghi |
| **Dirty Write** | Ghi đè lên dữ liệu của một giao dịch khác **chưa commit**. Mọi database đều chặn cái này |

Chú ý ngay chỗ này, vì nó là gốc của mọi hiểu lầm về sau: **Dirty Write bị mọi database chặn. Lost Update thì không.** Hai chuyện hoàn toàn khác nhau, và rất nhiều người gộp làm một rồi kết luận "có transaction là an toàn".

## Tầng 1 — Định nghĩa: "người bấm lưu sau thắng"

Ứng viên trả lời ngay, và trả lời **đúng**:

> *"Người bấm lưu sau thắng. Vì lệnh ghi của họ chạy sau nên nó ghi đè lên giá trị của người trước."*

Người phỏng vấn gật đầu, ghi một dòng vào sổ: **[Người sau thắng — ĐÚNG]**. Đây là đáp án 9/10 người sẽ nói.

Hãy nhìn kỹ chuyện gì thật sự xảy ra ở tầng database. Giả sử dòng đơn hàng ban đầu:

```text
id=1 | ten_khach = "An"  | so_luong = 10 | ghi_chu = "giao gấp"
```

Nhân viên A sửa tên khách, nhân viên B sửa ghi chú:

```text
Thời gian ─────────────────────────────────────────────────────────────►

Nhân viên A                          Nhân viên B
──────────────────────────           ──────────────────────────
t0  Mở đơn, màn hình tải về:
    {An, 10, "giao gấp"}

t1                                   Mở đơn, màn hình tải về:
                                     {An, 10, "giao gấp"}

t2  Sửa ô tên: "An" → "Anh"
t3                                   Sửa ô ghi chú: → "giao chậm"

t4  Bấm lưu.
    Gửi lên: {Anh, 10, "giao gấp"}
    DB: {Anh, 10, "giao gấp"}   ✓

t5                                   Bấm lưu.
                                     Gửi lên: {An, 10, "giao chậm"}
                                     DB: {An, 10, "giao chậm"}
                                          ↑ tên khách quay về "An"!
```

B "thắng" thật. Nhưng nhìn dòng cuối cùng: **sửa đổi của A đã bốc hơi**, dù A và B sửa **hai ô hoàn toàn khác nhau** và lẽ ra không đụng gì tới nhau.

Không có lỗi nào hiện ra. Không có exception. Cả hai đều thấy "Lưu thành công".

Nhưng câu trả lời của ứng viên nói được **ai thắng**, mà chưa nói **người thua mất cái gì**, và cũng chưa hỏi lại **hai người đó đang sửa cột nào**.

## Tầng 2 — Con số: người thua mất cái gì?

Người phỏng vấn hỏi tiếp, và đây mới là câu thật:

> *"Người thua thì mất gì?"*

Câu trả lời phụ thuộc hoàn toàn vào **cái bị ghi đè là một giá trị hay một phép tính**. Hai trường hợp này cách nhau rất xa.

### Trường hợp A — mất một giá trị

Đúng cảnh vừa vẽ ở trên: A sửa tên khách, bị B ghi đè. Mất một cái tên.

Thiệt hại: một người phải sửa lại. Khó chịu, nhưng đo được, phát hiện được, sửa được. **Chuyện nhỏ.**

### Trường hợp B — mất một phép tính, và tiền đi theo nó

Bây giờ đổi kịch bản: hai đơn hàng cùng trừ tồn kho.

```text
Tồn kho ban đầu: 10

Thời gian ─────────────────────────────────────────────────────────────►

Đơn hàng #1                          Đơn hàng #2
──────────────────────────           ──────────────────────────
t0  SELECT so_luong → đọc được 10
t1                                   SELECT so_luong → CŨNG đọc được 10
                                          ↑ cả hai đang cầm số 10 trong tay

t2  Tính trong code: 10 - 1 = 9
t3                                   Tính trong code: 10 - 1 = 9

t4  UPDATE SET so_luong = 9
    DB: 9                            ✓

t5                                   UPDATE SET so_luong = 9
                                     DB: 9
                                          ↑ vẫn là 9, KHÔNG phải 8
```

**Bán được 2 cái, mà kho chỉ trừ đúng 1 cái.**

Đây không còn là mất một cái tên. Đây là **mất luôn cả phép tính**, và số lượng trong kho vừa lệch một đơn vị so với thực tế mà không có bất kỳ dấu vết nào.

Con số để nói trong phỏng vấn — đây là chỗ ăn điểm tầng 2:

```text
Giả sử sàn chạy 1.000 đơn/ngày, tỷ lệ hai đơn rơi vào cùng một sản phẩm
trong cùng một cửa sổ đọc-ghi khoảng 1%:

  → ~10 đơn/ngày bị mất phép trừ
  → ~300 đơn vị lệch/tháng
  → Kiểm kho cuối tháng mới lộ ra, và lúc đó KHÔNG CÒN CÁCH NÀO
    biết đơn nào gây lệch, vì cột số lượng chỉ giữ KẾT QUẢ,
    không giữ QUÁ TRÌNH.
```

Vế cuối mới là chỗ đau nhất. Lỗi này không tự báo, không có log, và **không truy ngược được** — vì bạn đang lưu một con số tổng chứ không lưu lịch sử cộng trừ. (Đây chính là lý do hệ thống tiền không bao giờ được thiết kế bằng một ô số dư — xem [Bài 7: Lưu số dư tiền kiểu gì](07-luu-so-du-tien-kieu-gi.md).)

### Vì sao Read-Modify-Write luôn nguy hiểm

Gốc rễ nằm ở chỗ **khoảng trống giữa lúc đọc và lúc ghi**:

```text
   SELECT so_luong          ← đọc: 10
        │
        │   ◄─── KHOẢNG TRỐNG: từ vài ms tới vài phút (nếu có người ngồi
        │        nhìn màn hình rồi mới bấm lưu). Trong khoảng này, giá trị
        │        trong DB có thể đã đổi mà ứng dụng KHÔNG HỀ BIẾT.
        │
   UPDATE SET so_luong = 9  ← ghi: đè lên bất cứ thứ gì đang có
```

Câu `UPDATE ... SET so_luong = 9` là một lệnh **mù**. Nó không nói "trừ đi 1", nó nói "cho bằng 9". Nó không quan tâm giá trị hiện tại là bao nhiêu. Nó chỉ đè.

**Càng nhiều thời gian trôi qua giữa đọc và ghi, cửa sổ càng rộng.** Với màn hình có người ngồi sửa, cửa sổ đó có thể là mười lăm phút.

## Tầng 3 — Đánh đổi: "bọc transaction vào là xong chứ?"

Người phỏng vấn dồn tiếp, và đây là câu đánh trượt nhiều người nhất:

> *"Thế bọc transaction vào là xong chứ?"*

Câu trả lời là **KHÔNG**. Và hiểu vì sao "không" mới là thứ họ cần nghe.

```sql
-- Bọc transaction rồi, nhưng vẫn mất cập nhật y như cũ
BEGIN;
  SELECT so_luong FROM san_pham WHERE id = 1;   -- đọc 10
  -- ứng dụng tính: 10 - 1 = 9
  UPDATE san_pham SET so_luong = 9 WHERE id = 1;
COMMIT;
```

Ở mức cách ly mặc định (`Read Committed`), hai giao dịch chạy song song **vẫn đọc được số 10 như nhau**, rồi **vẫn cùng ghi lại số 9 như nhau**. Transaction đảm bảo *"hoặc xong hết hoặc quay đầu sạch"* — nó **không** đảm bảo *"không ai chen ngang giữa lúc tôi đọc và lúc tôi ghi"*.

Đây là hiểu lầm phổ biến nhất về transaction, nên hãy tách bạch cho rõ:

| Transaction đảm bảo | Transaction KHÔNG đảm bảo |
|---|---|
| Nguyên tử: xong hết hoặc quay đầu hết | Rằng dữ liệu bạn vừa đọc còn nguyên lúc bạn ghi |
| Không đọc phải dữ liệu chưa commit của người khác | Rằng không ai commit chen vào giữa hai lệnh của bạn |
| Ghi xong là bền, mất điện không mất | Rằng phép tính của bạn dựa trên số liệu còn tươi |

### Từng mức cách ly xử lý Lost Update thế nào

Đây là bảng đáng thuộc, vì hành vi **khác nhau giữa PostgreSQL và MySQL** và rất nhiều người trả lời sai chỗ này:

| Mức cách ly | PostgreSQL | MySQL / InnoDB |
|---|---|---|
| **Read Uncommitted** | Thực chất chạy như Read Committed | Đọc được cả dữ liệu chưa commit |
| **Read Committed** (mặc định PG) | **Vẫn mất cập nhật** | **Vẫn mất cập nhật** |
| **Repeatable Read** (mặc định MySQL) | Giao dịch thứ hai bị **huỷ** với lỗi `could not serialize access` — bạn buộc phải retry | **Vẫn mất cập nhật** với `SELECT` thường; chỉ an toàn nếu dùng `SELECT ... FOR UPDATE` |
| **Serializable** | Chặn được, nhưng đổi lại giao dịch bị huỷ nhiều hơn → phải có retry | Chặn được bằng cách khoá rất rộng → dễ nghẽn |

Hai điều đáng nhớ từ bảng này:

1. **Nâng mức cách ly không phải là "bật một công tắc an toàn"** — nó biến lỗi âm thầm thành lỗi ồn ào (giao dịch bị huỷ). Bạn *bắt buộc* phải viết vòng thử lại, nếu không bạn chỉ đổi từ "sai số liệu" sang "báo lỗi cho khách".
2. **MySQL ở Repeatable Read vẫn mất cập nhật.** Rất nhiều người nghĩ ngược lại vì cái tên nghe an toàn hơn. Nó "repeatable read" theo nghĩa đọc lại thấy y như cũ — mà đọc lại thấy y như cũ chính là thứ khiến bạn ghi đè lên thay đổi của người khác.

## Tầng 4 — Quy trình: bốn cách chữa, từ rẻ tới đắt

Người phỏng vấn đưa tình huống cụ thể: *"Bảng tồn kho, 200 đơn/giây vào giờ cao điểm. Làm gì?"*. Đây là lúc trả lời bằng **quy trình**, không phải ý kiến.

### Cách 1 — Rẻ nhất: đừng đọc, để database tự tính

Bỏ hẳn bước đọc. Viết phép tính thẳng vào câu lệnh:

```sql
UPDATE san_pham
   SET so_luong = so_luong - 1
 WHERE id = 1
   AND so_luong > 0;          -- điều kiện bảo vệ: không cho âm
```

Vì sao cách này an toàn? Vì database **tự khoá dòng đó trong lúc chạy lệnh**. Hai lệnh cùng chạy sẽ tự động xếp hàng ở tầng dưới, và mỗi lệnh đều đọc giá trị **mới nhất** ngay tại thời điểm nó chạy:

```text
Đơn #1: UPDATE ... = so_luong - 1   → khoá dòng, đọc 10, ghi 9, nhả khoá
Đơn #2: UPDATE ... = so_luong - 1   → chờ khoá, đọc 9,  ghi 8, nhả khoá
                                        ↑ đọc được số MỚI, không phải số cũ
```

**Nhưng phải kiểm tra số dòng bị ảnh hưởng.** Đây là chỗ hầu hết code bỏ sót:

```java
int soDongDoi = jdbc.update("""
        UPDATE san_pham SET so_luong = so_luong - ?
         WHERE id = ? AND so_luong >= ?
        """, soLuongMua, sanPhamId, soLuongMua);

if (soDongDoi == 0) {
    // KHÔNG phải lỗi hệ thống — đây là "hết hàng".
    // Nếu không kiểm, code sẽ chạy tiếp như thể đã trừ kho thành công.
    throw new HetHangException(sanPhamId);
}
```

| Ưu | Nhược |
|---|---|
| Không cần transaction, không cần retry | Chỉ dùng được khi giá trị mới **tính được từ giá trị cũ** bằng một biểu thức |
| Nhanh nhất, một vòng tới database | Không dùng được khi cần đọc ra để hiển thị/kiểm tra logic phức tạp rồi mới ghi |
| Không bao giờ mất cập nhật | Dòng nóng vẫn bị xếp hàng — 2.000 lượt/giây vào cùng một dòng là nghẽn |

**Đây là câu trả lời mặc định.** Nếu bài toán vừa với nó, đừng chọn cách phức tạp hơn.

### Cách 2 — Khoá bi quan: xếp hàng có trật tự

Khi bạn *bắt buộc* phải đọc ra, chạy logic, rồi mới ghi:

```sql
BEGIN;
  SELECT so_luong FROM san_pham WHERE id = 1 FOR UPDATE;
  --                                          ↑ khoá dòng này lại NGAY
  --  Ai đọc bằng FOR UPDATE sau đó phải ĐỨNG CHỜ tới khi mình COMMIT.

  -- ... chạy logic nghiệp vụ phức tạp ở đây ...

  UPDATE san_pham SET so_luong = 8 WHERE id = 1;
COMMIT;   -- nhả khoá
```

Hai biến thể quan trọng, gần như không ai nhắc tới trong phỏng vấn (nói ra là ghi điểm):

```sql
SELECT ... FOR UPDATE NOWAIT;      -- không chờ, báo lỗi ngay nếu dòng đang bị khoá
SELECT ... FOR UPDATE SKIP LOCKED; -- bỏ qua dòng đang bị khoá, lấy dòng khác
```

`SKIP LOCKED` là nền tảng của mọi hàng đợi chạy trên database — xem [Bài 17: Hàng đợi trên Postgres hỏng ở đâu](../phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md).

| Ưu | Nhược |
|---|---|
| Đúng chắc chắn, dễ suy luận | **Giữ khoá suốt transaction** — transaction dài là cả hệ xếp hàng theo |
| Không cần retry | Có thể gây kẹt khoá nếu hai giao dịch gắp khoá ngược thứ tự ([Bài 16](../phase-4-thu-tu-va-quy-mo/01-khoa-xoan-nhau-goc-la-thu-tu.md)) |
| Phù hợp khi tranh chấp **nhiều** | Không dùng được khi người dùng ngồi nhìn màn hình giữa đọc và ghi (khoá 15 phút!) |

**Luật vàng:** không bao giờ giữ khoá qua một lượt tương tác với con người.

### Cách 3 — Khoá lạc quan: cột phiên bản + thử lại

Đây là cách đúng khi giữa đọc và ghi có **con người**, hoặc khi tranh chấp **hiếm**.

Thêm một cột `version` vào bảng:

```sql
ALTER TABLE san_pham ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
```

Rồi mỗi lần ghi, kèm điều kiện phiên bản phải khớp:

```sql
-- Đọc (không khoá gì cả)
SELECT so_luong, version FROM san_pham WHERE id = 1;
--     → so_luong = 10, version = 7

-- ... người dùng ngồi sửa trên màn hình 5 phút ...

-- Ghi, kèm điều kiện "version phải vẫn là 7"
UPDATE san_pham
   SET so_luong = 9,
       version  = version + 1
 WHERE id = 1
   AND version = 7;          -- ← chốt chặn
```

Nếu có ai chen ngang trong 5 phút đó, `version` đã thành 8, mệnh đề `WHERE` không khớp, lệnh cập nhật **0 dòng**. Bạn phát hiện được và xử lý:

```text
Số dòng bị ảnh hưởng = 1  →  Không ai chen ngang. Xong.
Số dòng bị ảnh hưởng = 0  →  Có người chen ngang.
                             Đọc lại → tính lại → thử lại,
                             HOẶC báo cho người dùng: "Dữ liệu vừa
                             được người khác sửa, mời xem lại."
```

Trong JPA/Hibernate, chỉ cần một annotation — framework tự thêm mệnh đề `AND version = ?` và tự ném lỗi:

```java
@Entity
public class SanPham {
    @Id private Long id;
    private int soLuong;

    @Version                      // Hibernate tự tăng và tự kiểm tra
    private long version;
}
```

Khi có người chen ngang, Hibernate ném `OptimisticLockException`. **Bắt được exception đó chưa đủ — phải có vòng thử lại:**

```java
@Retryable(
    retryFor = { OptimisticLockingFailureException.class },
    maxAttempts = 3,
    backoff = @Backoff(delay = 50, multiplier = 2, random = true)
)
@Transactional
public void giamTonKho(long sanPhamId, int soLuong) {
    SanPham sp = repository.findById(sanPhamId).orElseThrow();
    if (sp.getSoLuong() < soLuong) throw new HetHangException(sanPhamId);
    sp.setSoLuong(sp.getSoLuong() - soLuong);
    // Hibernate flush: UPDATE ... WHERE id = ? AND version = ?
}
```

Ba chi tiết trong đoạn trên là dấu hiệu của code đã chạy thật:

1. **`maxAttempts = 3`, không phải vô hạn.** Thử lại vô hạn dưới tranh chấp cao là tự tạo bão retry.
2. **`multiplier = 2` (backoff luỹ thừa).** Thử lại ngay lập tức thì hai bên lại đâm nhau đúng nhịp cũ.
3. **`random = true` (jitter).** Không có nó, các luồng bị đẩy lùi cùng một khoảng rồi cùng quay lại — đồng bộ hoá vô tình.

| Ưu | Nhược |
|---|---|
| Không giữ khoá — chịu được khoảng trống có con người | Phải viết retry; quên retry là đổi lỗi âm thầm thành lỗi cho khách |
| Đọc không bị chặn, thông lượng đọc cao | Tranh chấp **cao** thì retry liên tục, tốn hơn khoá bi quan |
| Phát hiện được "ai đó vừa sửa" để báo người dùng | Thêm một cột và thêm luật vào mọi đường ghi |

### Cách 4 — Bỏ hẳn ô tổng, chuyển sang ghi nhật ký

Với dữ liệu tiền bạc, ba cách trên vẫn còn một điểm yếu chung: chúng đều lưu **kết quả** chứ không lưu **quá trình**. Cách thứ tư là không sửa dòng nào cả, chỉ ghi thêm dòng mới:

```sql
INSERT INTO so_cai (san_pham_id, thay_doi, ly_do, don_hang_id, luc)
VALUES (1, -1, 'BAN_HANG', 12345, NOW());

-- Tồn kho = tổng của cả sổ
SELECT SUM(thay_doi) FROM so_cai WHERE san_pham_id = 1;
```

Không còn ai sửa chung một dòng, nên **không còn Lost Update về mặt nguyên lý**. Đổi lại phải cộng sổ mỗi lần đọc — giải bằng dòng chốt sổ định kỳ. Toàn bộ mô hình này nằm ở [Bài 7](07-luu-so-du-tien-kieu-gi.md).

### Bảng chọn cách

```text
Giá trị mới tính được từ giá trị cũ bằng một biểu thức?
   │
   ├── CÓ ──► Có con người ngồi giữa đọc và ghi?
   │            ├── KHÔNG ──► ① UPDATE SET x = x - 1   ◄── mặc định, chọn cái này
   │            └── CÓ     ──► ③ Cột version + retry
   │
   └── KHÔNG (cần đọc ra, chạy logic phức tạp, rồi ghi)
                │
                ├── Tranh chấp CAO, transaction NGẮN ──► ② SELECT ... FOR UPDATE
                ├── Tranh chấp THẤP hoặc có con người ──► ③ Cột version + retry
                └── Là TIỀN / cần truy vết từng lượt ──► ④ Sổ cái ghi thêm
```

## Bản chất câu hỏi: cùng cột hay khác cột?

Bây giờ quay lại chỗ câu hỏi **cố tình thiếu dữ kiện**. *"Hai người sửa cùng một dòng"* — nhưng **cùng một cột hay khác cột?** Hai trường hợp này có hai đường xử lý khác hẳn nhau:

| | Khác cột | Cùng cột |
|---|---|---|
| Ví dụ | A sửa tên khách, B sửa ghi chú | Cả hai cùng trừ tồn kho |
| Về nguyên tắc | **Không hề xung đột** — lẽ ra cả hai đều nên thành công | **Xung đột thật** — phải có người thua hoặc phải cộng dồn |
| Vì sao vẫn hỏng | Vì lệnh `UPDATE` ghi lại **cả dòng**, kể cả cột không đổi | Vì Read-Modify-Write |
| Cách chữa | Chỉ ghi đúng cột đã đổi | Biểu thức nguyên tử, hoặc khoá, hoặc version |

### Cái bẫy ORM: ghi đè cả dòng

Đây là chỗ ăn điểm cao nhất của bài này, vì nó lý giải vì sao trường hợp "khác cột" vẫn hỏng.

JPA/Hibernate mặc định sinh câu `UPDATE` chứa **mọi cột** của entity, kể cả cột bạn không hề chạm vào:

```sql
-- Bạn chỉ sửa ghi_chu, nhưng Hibernate sinh ra:
UPDATE don_hang
   SET ten_khach = ?,      -- ← ghi đè bằng giá trị CŨ mà entity của bạn đang giữ
       so_luong  = ?,      -- ← ghi đè
       dia_chi   = ?,      -- ← ghi đè
       ghi_chu   = ?       -- ← cái bạn thật sự muốn sửa
 WHERE id = ?;
```

Entity của bạn được nạp lúc `t1`, mang theo `ten_khach = "An"`. Người khác đã đổi thành `"Anh"` lúc `t4`. Lúc bạn flush ở `t5`, Hibernate ghi đè `"An"` trở lại — **bạn xoá thay đổi của người khác dù chưa từng chạm vào ô đó**.

Ba cách chữa, theo thứ tự nên dùng:

```java
// ① Tốt nhất: bật @Version — xung đột bị PHÁT HIỆN thay vì bị nuốt
@Entity
public class DonHang {
    @Version private long version;
}

// ② Chỉ sinh UPDATE cho cột thật sự đổi (Hibernate so sánh với ảnh chụp lúc nạp)
@Entity
@DynamicUpdate
public class DonHang { ... }

// ③ Với cột kiểu cộng dồn, viết thẳng câu lệnh — đừng đi qua entity
@Modifying
@Query("UPDATE SanPham s SET s.soLuong = s.soLuong - :n WHERE s.id = :id AND s.soLuong >= :n")
int giamTon(@Param("id") long id, @Param("n") int n);
```

Lưu ý về `@DynamicUpdate`: nó khiến Hibernate **sinh câu SQL khác nhau tuỳ theo cột nào đổi**, nghĩa là mất lợi ích của prepared statement được tái sử dụng. Trên bảng ghi rất nóng, hãy đo trước khi bật đại trà. Cơ chế Hibernate sinh SQL và cái giá của nó được mổ kỹ trong [khoá ORM và N+1](../../orm-n-plus-1/04-su-that-ve-orm-trong-production.md).

## Cách tự dựng lại lỗi này trong 3 phút

Bạn không cần production để có "vết sẹo". Mở hai cửa sổ `psql` cạnh nhau:

```sql
-- Chuẩn bị (chạy ở một cửa sổ bất kỳ)
CREATE TABLE kho (id INT PRIMARY KEY, so_luong INT);
INSERT INTO kho VALUES (1, 10);
```

```text
   Phiên A                                  Phiên B
   ───────────────────────────────          ───────────────────────────────
   BEGIN;                                   BEGIN;
   SELECT so_luong FROM kho WHERE id=1;     SELECT so_luong FROM kho WHERE id=1;
   -- thấy 10                               -- CŨNG thấy 10

   UPDATE kho SET so_luong=9 WHERE id=1;
   COMMIT;
                                            UPDATE kho SET so_luong=9 WHERE id=1;
                                            COMMIT;

   SELECT so_luong FROM kho WHERE id=1;  →  9
   ↑ Trừ hai lần, kho chỉ giảm một. BẠN VỪA TỰ TAY TẠO RA LOST UPDATE.
```

Rồi làm lại ba lần nữa để thấy từng cách chữa hoạt động:

```text
   Lần 2: đổi SELECT thành  SELECT ... FOR UPDATE
          → Phiên B ĐỨNG CHỜ ở câu SELECT tới khi A commit. Kết quả: 8 ✓

   Lần 3: đổi UPDATE thành  UPDATE kho SET so_luong = so_luong - 1
          → Không cần khoá tay. Kết quả: 8 ✓

   Lần 4: chạy cả hai phiên ở mức REPEATABLE READ trên PostgreSQL
          (BEGIN ISOLATION LEVEL REPEATABLE READ;)
          → Phiên B bị huỷ: "ERROR: could not serialize access due to
            concurrent update". Đây là lúc bạn thấy vì sao BẮT BUỘC
            phải có vòng retry khi nâng mức cách ly.
```

Một buổi tối làm hết bốn lần này cho bạn đúng thứ mà tầng 2 và tầng 3 đòi hỏi: **con số và trải nghiệm thật**, không phải định nghĩa thuộc lòng.

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Tin rằng "có transaction là an toàn" | Transaction chống Dirty Write, **không** chống Lost Update | Dùng biểu thức nguyên tử / khoá / version |
| `SELECT` rồi tính trong code rồi `UPDATE` giá trị tuyệt đối | Read-Modify-Write kinh điển | `SET x = x - 1` |
| Không kiểm số dòng bị ảnh hưởng | Lệnh cập nhật 0 dòng nhưng code chạy tiếp như đã thành công | Luôn kiểm `rowsAffected` |
| Bật `@Version` mà không viết retry | Đổi lỗi âm thầm thành lỗi 500 cho khách | `@Retryable` + backoff + jitter |
| Retry không có jitter | Các luồng bị đẩy lùi cùng nhịp rồi lại đâm nhau | `random = true` |
| Giữ `FOR UPDATE` qua màn hình người dùng | Khoá dòng suốt 15 phút, cả hệ xếp hàng | Khoá lạc quan cho mọi luồng có con người |
| Nghĩ MySQL Repeatable Read chống được Lost Update | Không — `SELECT` thường vẫn mất cập nhật | `FOR UPDATE`, hoặc biểu thức nguyên tử |
| Để ORM ghi đè cả dòng | Xoá thay đổi của người khác ở cột mình không chạm | `@Version` + `@DynamicUpdate` |
| Nâng thẳng lên `SERIALIZABLE` cho "chắc" | Giao dịch bị huỷ nhiều hơn hẳn, thông lượng tụt | Chỉ nâng cho đúng luồng cần, kèm retry |

## Bản mẫu 30 giây

> *"Trước khi trả lời em xin hỏi lại một câu: hai người đó sửa **cùng cột hay khác cột**? Vì hai trường hợp này xử lý khác hẳn nhau.*
>
> *Nếu **khác cột** thì về nguyên tắc không ai phải thua — vấn đề chỉ là câu `UPDATE` đang ghi lại cả dòng. Em bật `@DynamicUpdate` để chỉ ghi cột đã đổi, và bật `@Version` để nếu có xung đột thật thì nó lộ ra chứ không bị nuốt.*
>
> *Nếu **cùng cột** và là một phép tính thì mặc định em để database tự tính: `SET so_luong = so_luong - 1 WHERE so_luong >= 1`, rồi kiểm số dòng bị ảnh hưởng — bằng 0 nghĩa là hết hàng chứ không phải lỗi hệ thống. Cách này không cần khoá tay và không bao giờ mất cập nhật.*
>
> *Còn nếu buộc phải đọc ra, chạy logic rồi mới ghi thì em chọn theo mức tranh chấp: tranh chấp cao và transaction ngắn thì `SELECT ... FOR UPDATE`; có con người ngồi giữa đọc và ghi thì bắt buộc dùng cột version kèm retry có backoff, vì không được giữ khoá qua một lượt tương tác người dùng.*
>
> *Và em nói thêm: bọc transaction không chữa được cái này. Ở `Read Committed` cả hai vẫn đọc ra 10 rồi cùng ghi 9."*

Ba mươi giây đó có: **một câu hỏi ngược**, hai đường xử lý tách bạch, một quy tắc chọn kèm ngưỡng, và một chỗ đính chính hiểu lầm phổ biến. Đó là bốn tầng gói trong một câu trả lời.

## Tóm tắt bài 2

- **"Người sau thắng" là đúng nhưng chưa trả lời câu hỏi.** Câu hỏi thật là *người thua mất cái gì*.
- Mất một **giá trị** là chuyện nhỏ. Mất một **phép tính** là mất tiền, và không truy ngược được vì ô tổng chỉ giữ kết quả.
- **Transaction không chống được Lost Update.** Nó chống Dirty Write. Ở `Read Committed`, hai giao dịch vẫn cùng đọc 10 rồi cùng ghi 9.
- **MySQL ở `Repeatable Read` vẫn mất cập nhật** với `SELECT` thường. PostgreSQL ở `Repeatable Read` thì huỷ giao dịch thứ hai — nên bắt buộc phải retry.
- Bốn cách chữa theo thứ tự nên chọn: **biểu thức nguyên tử → khoá bi quan → khoá lạc quan + retry → sổ cái ghi thêm**.
- **Không bao giờ giữ khoá qua một lượt tương tác với con người.** Ở đó chỉ có khoá lạc quan.
- **Câu hỏi cố tình thiếu dữ kiện.** Người giỏi hỏi ngược *"cùng cột hay khác cột?"* trước khi trả lời chữ nào.

**Bài kế tiếp** → [Bài 3: "Ảnh người dùng tải lên, bạn lưu vào đâu?"](03-anh-nguoi-dung-luu-o-dau.md)
