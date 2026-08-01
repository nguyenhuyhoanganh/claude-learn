# Bài 5: Excel cho dev — VLOOKUP, INDEX MATCH hay XLOOKUP

Một bảng lương 60.000 dòng. Một công thức tra cứu. Và một con số vừa nhảy sai.

Người phỏng vấn xoay màn hình lại rồi hỏi một câu rất ngắn:

> *"Em dùng VLOOKUP hay INDEX MATCH?"*

Nghe như câu hỏi cho người mới, ai cũng trả lời trong 3 giây. **Đó là chỗ họ bắt đầu đào.**

Bài này nằm trong khoá backend vì hai lý do. Thứ nhất: **vị trí data analyst, BI, và cả backend làm việc với đội tài chính đều bị hỏi câu này**. Thứ hai, và quan trọng hơn: nó là ví dụ hoàn hảo của **mô hình bốn tầng** — và những cái bẫy ở đây có bản chất **giống hệt** những cái bẫy bạn đã gặp trong SQL.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **Lookup** | **Tra cứu** — tìm một giá trị theo khoá |
| **VLOOKUP** | Tra cứu theo cột dọc (*Vertical Lookup*) |
| **INDEX** | Lấy giá trị tại **vị trí thứ n** trong một dải |
| **MATCH** | Trả về **vị trí thứ mấy** của giá trị trong dải |
| **XLOOKUP** | Hàm tra cứu mới (Excel 365 / 2021) thay cho cả hai |
| **Exact match** | **Khớp chính xác** |
| **Approximate match** | **Khớp gần đúng** — trả về giá trị lớn nhất còn nhỏ hơn |
| **Tham chiếu tuyệt đối** | `$A$1` — không đổi khi kéo công thức |
| **Volatile function** | Hàm tính lại **mỗi khi bảng thay đổi bất cứ đâu** |

## Tầng 1: Định nghĩa — ai cũng qua

**Bạn trả lời:**

> *"`VLOOKUP` tìm giá trị ở cột đầu tiên của bảng, rồi trả về giá trị ở cột thứ n."*

```excel
=VLOOKUP(A2, B:E, 4, FALSE)
         │    │   │   │
         │    │   │   └── FALSE = khớp chính xác
         │    │   └────── lấy cột thứ 4
         │    └────────── tìm trong dải B:E
         └─────────────── tìm giá trị này
```

Đúng, không có gì để bắt bẻ. Người phỏng vấn gật đầu, ghi một dòng vào sổ.

**Nhưng "cột thứ 4" là một con số bạn tự đếm bằng mắt.** Và đó là mầm mống của tầng 2.

## Tầng 2: "Tháng sau kế toán chèn thêm một cột. Công thức trả về gì?"

Giọng vẫn đều đều như cũ.

```text
   BẢNG BAN ĐẦU
   ┌───────┬─────────┬────────┬─────────┐
   │ Mã NV │ Họ tên  │ Phòng  │ Lương   │
   └───────┴─────────┴────────┴─────────┘
       1        2         3        4      ← bạn đếm bằng mắt: lương = cột 4

   =VLOOKUP(A2, B:E, 4, FALSE)  →  trả về LƯƠNG ✓


   KẾ TOÁN CHÈN THÊM "PHỤ CẤP" VÀO GIỮA
   ┌───────┬─────────┬────────┬──────────┬─────────┐
   │ Mã NV │ Họ tên  │ Phòng  │ Phụ cấp  │ Lương   │
   └───────┴─────────┴────────┴──────────┴─────────┘
       1        2         3         4         5

   Nhưng SỐ 4 TRONG CÔNG THỨC VẪN NẰM NGUYÊN ĐÓ. Không ai sửa nó.

   =VLOOKUP(A2, B:E, 4, FALSE)  →  giờ trả về PHỤ CẤP ❌
```

```text
   ⚠️ CÔNG THỨC VẪN CHẠY. KHÔNG Ô NÀO BÁO LỖI.
      Nó vẫn trả tiền — chỉ là TIỀN CỦA CỘT KHÁC.
      60.000 dòng. Không ai biết.
```

**Đây chính là bản chất của một lỗi bạn đã gặp trong SQL:**

```text
   VLOOKUP với số cột cứng   ≈   SELECT * rồi lấy cột theo VỊ TRÍ
   INDEX MATCH               ≈   SELECT ten_cot cụ thể

   Cả hai đều là: THAM CHIẾU THEO VỊ TRÍ vs THAM CHIẾU THEO TÊN.
   Và cả hai đều hỏng khi CẤU TRÚC THAY ĐỔI.
```

### `INDEX MATCH` — trỏ vào cột thật, không đếm

```excel
=INDEX(E:E, MATCH(A2, B:B, 0))
       │           │    │   │
       │           │    │   └── 0 = khớp CHÍNH XÁC
       │           │    └────── tìm trong cột B
       │           └─────────── tìm giá trị này
       └─────────────────────── LẤY TỪ CỘT E (trỏ thẳng, không đếm)
```

```text
   INDEX MATCH KHÔNG ĐẾM CỘT NÀO CẢ.
   Nó trỏ THẲNG vào cột lương.

   → Chèn thêm bao nhiêu cột đi nữa, Excel cũng TỰ DỜI THAM CHIẾU theo.
   → Công thức vẫn đúng.
```

**Ba ưu điểm nữa của `INDEX MATCH`:**

```text
① TRA CỨU NGƯỢC — VLOOKUP không làm được
   VLOOKUP chỉ tìm được sang PHẢI (khoá phải nằm ở cột đầu tiên).
   INDEX MATCH tra cứu được cả sang TRÁI.

② NHANH HƠN TRÊN BẢNG LỚN
   VLOOKUP nạp cả dải B:E vào bộ nhớ.
   INDEX MATCH chỉ đọc ĐÚNG HAI CỘT (B và E).
   → Trên 60.000 dòng × 20 cột, khác biệt rất rõ.

③ ĐỔI CỘT KẾT QUẢ CHỈ CẦN SỬA MỘT THAM CHIẾU
   Không phải đếm lại số thứ tự.
```

Người phỏng vấn ghi dòng thứ hai. Bạn vừa qua tầng 2.

## Tầng 3: "Đã đổi sang INDEX MATCH rồi mà vẫn ra sai người. Vì sao?"

Đây là chỗ đáp án tầng 2 chết.

```text
   Nhìn vào ĐUÔI công thức:

   =INDEX(E:E, MATCH(A2, B:B))
                            ▲ THIẾU SỐ 0

   MATCH mà KHÔNG đóng bằng 0 thì MẶC ĐỊNH LÀ KHỚP GẦN ĐÚNG (giá trị 1).
   VLOOKUP cũng vậy — thiếu FALSE là mặc định TRUE.
```

```text
   KHỚP GẦN ĐÚNG LÀM GÌ?
      Nó trả về GIÁ TRỊ LỚN NHẤT CÒN NHỎ HƠN HOẶC BẰNG thứ bạn tìm.
      VÀ NÓ ĐÒI BẢNG PHẢI ĐƯỢC SẮP XẾP SẴN TỪ NHỎ TỚI LỚN.

   Bảng lương của bạn thì KHÔNG SẮP XẾP.

   → Nó trả về NGƯỜI GẦN GIỐNG NHẤT.
   → VÀ VẪN KHÔNG BÁO LỖI.
```

```text
   ┌──────────────────────────────────────────────────────────┐
   │  TÌM MÃ NV = "NV0250"                                    │
   │                                                          │
   │  Bảng chưa sắp xếp:                                      │
   │     NV0100 → An                                          │
   │     NV0300 → Bình      ← khớp gần đúng trả về NGƯỜI NÀY  │
   │     NV0250 → Chi       ← đây mới là người ĐÚNG           │
   │     NV0180 → Dũng                                        │
   │                                                          │
   │  → Trả lương của Bình cho Chi. Không một ô nào màu đỏ.   │
   └──────────────────────────────────────────────────────────┘
```

**Luật:** `MATCH` luôn đóng bằng `0`, `VLOOKUP` luôn đóng bằng `FALSE`. Không có ngoại lệ khi tra theo **mã**.

### Nhưng đừng xoá kiểu dò gần đúng đi

Đây là chỗ ăn điểm — cho thấy bạn hiểu **khi nào nó đúng**:

```text
   BẢNG BẬC THUẾ hay BẬC CHIẾT KHẤU thì PHẢI dùng khớp gần đúng:

   ┌──────────────┬───────┐
   │ Từ mức       │ Thuế  │
   ├──────────────┼───────┤
   │          0   │  5%   │
   │  5.000.000   │ 10%   │
   │ 10.000.000   │ 15%   │
   │ 18.000.000   │ 20%   │
   └──────────────┴───────┘

   Thu nhập 12.000.000 → không có dòng nào KHỚP CHÍNH XÁC
   → khớp gần đúng trả về dòng 10.000.000 → thuế 15% ✓ ĐÚNG

   Vì bạn đang tra MỘT KHOẢNG, không tra một mã.
```

> **Kết luận tầng 3: khớp gần đúng không sai — nó chỉ bị đặt nhầm chỗ.** Tra **mã** thì khớp chính xác; tra **khoảng** thì khớp gần đúng (và bảng phải sắp xếp sẵn).

## Tầng 4: "Trong file thật của em, còn bao nhiêu công thức đếm cột bằng số?"

Câu cuối, và ngắn nhất. Nó không hỏi Excel — nó hỏi **file của bạn**.

```text
   Câu trả lời tốt là một CON SỐ và một QUY TRÌNH:

   "Em rà bằng Ctrl+F tìm 'VLOOKUP', thấy 43 công thức.
    Trong đó 12 cái vẫn dùng số cột cứng.
    Em đổi hết sang XLOOKUP, và đặt tên cho các dải
    để công thức đọc lên là hiểu ngay."
```

## `XLOOKUP` — hàm mới xoá cả hai cái bẫy

Excel 365 / 2021 và Google Sheets đều đã có.

```excel
=XLOOKUP(A2, B:B, E:E)
         │    │    │
         │    │    └── trả về từ cột này
         │    └─────── tìm trong cột này
         └──────────── tìm giá trị này

   ✓ KHÔNG đếm cột      → không dính bẫy tầng 2
   ✓ MẶC ĐỊNH khớp CHÍNH XÁC → không dính bẫy tầng 3
   ✓ Tra cứu được cả hai chiều
   ✓ Có tham số xử lý khi không tìm thấy — không cần bọc IFERROR
```

```excel
=XLOOKUP(A2, B:B, E:E, "Không tìm thấy")
                        ▲ giá trị trả về khi không khớp
```

```excel
-- Tra khoảng (bậc thuế) vẫn làm được, nhưng phải KHAI BÁO RÕ:
=XLOOKUP(C2, MucTu, ThueSuat, , -1)
                                 ▲ -1 = lấy giá trị nhỏ hơn gần nhất
```

Chú ý điểm cuối: `XLOOKUP` bắt bạn **nói rõ ý định** thay vì im lặng mặc định — đó chính là thứ làm nó an toàn hơn.

## Bảng so sánh

| | `VLOOKUP` | `INDEX MATCH` | `XLOOKUP` |
|---|---|---|---|
| Đếm cột bằng số | ❌ **Có** | ✅ Không | ✅ Không |
| Chèn cột làm hỏng | ❌ **Có** | ✅ Không | ✅ Không |
| Mặc định | ⚠️ **Gần đúng** | ⚠️ **Gần đúng** | ✅ **Chính xác** |
| Tra cứu sang trái | ❌ | ✅ | ✅ |
| Hiệu năng bảng lớn | Chậm | Nhanh | Nhanh |
| Xử lý không tìm thấy | Cần `IFERROR` | Cần `IFERROR` | ✅ Có sẵn |
| Dễ đọc | ✅ Dễ nhất | ⚠️ Rối hơn | ✅ Dễ |
| Có ở phiên bản cũ | ✅ Mọi phiên bản | ✅ Mọi phiên bản | ❌ 365/2021+ |

```text
   CHỌN THẾ NÀO:
      Có XLOOKUP           → dùng XLOOKUP. Hết bàn.
      Excel cũ / file chia sẻ với người dùng bản cũ → INDEX MATCH
      VLOOKUP              → chỉ khi bảng rất đơn giản và bạn chắc chắn
                             không ai chèn cột (thực tế: điều đó không tồn tại)
```

## Sáu bẫy khác của Excel mà dân kỹ thuật hay dính

### ① Số bị lưu thành chuỗi

```text
   Mã "00123" nhập vào Excel → thành số 123, mất số 0 đầu.
   Hoặc số nhập từ file CSV → lưu thành CHUỖI.

   → Tra cứu KHÔNG KHỚP dù nhìn bằng mắt thấy giống hệt nhau.

   ✅ Kiểm: =ISTEXT(A2) và =ISNUMBER(A2)
   ✅ Chữa: định dạng cột thành Text TRƯỚC khi dán,
            hoặc chuẩn hoá cả hai bên bằng TEXT()/VALUE()
```

**Đây chính là bẫy ép kiểu ngầm mà bạn đã gặp trong SQL** — cùng bản chất: hai giá trị trông giống nhau nhưng khác kiểu nên không khớp.

### ② Khoảng trắng vô hình

```text
   "Nguyễn Văn An " ≠ "Nguyễn Văn An"

   Dữ liệu dán từ web hay hệ thống khác rất hay có khoảng trắng thừa,
   thậm chí ký tự không ngắt dòng (non-breaking space, mã 160)
   mà TRIM() KHÔNG XOÁ ĐƯỢC.

   ✅ =TRIM(A2)                              — xoá khoảng trắng thường
   ✅ =TRIM(SUBSTITUTE(A2, CHAR(160), " "))  — xử lý cả ký tự 160
```

### ③ Tham chiếu tương đối khi kéo công thức

```excel
=VLOOKUP(A2, B2:E100, 4, FALSE)     ❌ kéo xuống → dải trượt thành B3:E101
=VLOOKUP(A2, $B$2:$E$100, 4, FALSE) ✅ khoá bằng $
=VLOOKUP(A2, BangLuong, 4, FALSE)   ✅ tốt nhất: đặt TÊN cho dải
```

Đặt tên dải (`Formulas → Define Name`) là thứ ít người dùng nhưng làm công thức **đọc lên là hiểu**, giống như đặt tên biến tử tế trong code.

### ④ Hàm volatile làm file chậm như rùa

```text
   NOW(), TODAY(), RAND(), OFFSET(), INDIRECT(), CELL(), INFO()

   → Chúng tính lại MỖI KHI bảng thay đổi ở BẤT CỨ ĐÂU.
   → 10.000 công thức OFFSET = file treo mỗi lần gõ một ô.

   ✅ Thay OFFSET bằng INDEX (INDEX KHÔNG volatile)
   ✅ Thay INDIRECT bằng cấu trúc bảng cố định
```

### ⑤ Excel không phải database

```text
   ⚠️ GIỚI HẠN CỨNG:
      • 1.048.576 dòng, 16.384 cột
      • Chỉ chính xác tới 15 CHỮ SỐ CÓ NGHĨA
        → Số CCCD 12 số thì OK, nhưng mã 18 số bị LÀM TRÒN IM LẶNG
      • Không có transaction, không có kiểm soát đồng thời thật sự
      • Hai người cùng sửa → LOST UPDATE, người lưu sau thắng
```

**Đây chính là câu chuyện "Excel vs database"** trong khoá SQL: Excel để bạn tự do, database bắt bạn xin phép. Cái giá của tự do là không ai gác cửa.

```text
   NGƯỠNG ĐỔI SANG DATABASE:
      • > 100.000 dòng, hoặc
      • > 1 người cùng ghi, hoặc
      • dữ liệu dính tới TIỀN
   → Từ đây thì hết cửa. Đừng cố.
```

### ⑥ Định dạng ngày tháng tự đoán và đoán sai

```text
   "13/01/2026" trên máy để định dạng Mỹ → Excel hiểu là 01/13 → LỖI
   "01/02/2026" → Việt: 1 tháng 2 | Mỹ: 2 tháng 1 → SAI IM LẶNG

   ✅ Khi nhập/xuất, dùng định dạng ISO: 2026-02-01
   ✅ Trong file dùng chung nhiều quốc gia, LUÔN dùng ISO
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Bạn là backend dev, đội tài chính gửi file Excel 200.000 dòng và nhờ "đối chiếu với database".

```python
# ✅ Đừng làm trong Excel — đưa vào công cụ đúng
import pandas as pd

df = pd.read_excel(
    "bang_luong.xlsx",
    dtype={"ma_nv": str},          # ◄── ÉP KIỂU CHUỖI, giữ số 0 đầu
)
df["ma_nv"] = df["ma_nv"].str.strip()      # xoá khoảng trắng

db = pd.read_sql("SELECT ma_nv, luong FROM employees", conn)
db["ma_nv"] = db["ma_nv"].str.strip()

# Đối chiếu — dùng outer join để thấy CẢ HAI phía lệch
kq = df.merge(db, on="ma_nv", how="outer", indicator=True,
              suffixes=("_excel", "_db"))

print("Chỉ có trong Excel:", (kq._merge == "left_only").sum())
print("Chỉ có trong DB:   ", (kq._merge == "right_only").sum())

lech = kq[(kq._merge == "both") & (kq.luong_excel != kq.luong_db)]
print("Lệch lương:", len(lech))
lech.to_excel("bao_cao_lech.xlsx", index=False)
```

**Ba điểm quan trọng:** ép `dtype=str` cho mã (giữ số 0 đầu), `strip()` cả hai phía, và dùng `how="outer"` với `indicator=True` để thấy **cả ba loại lệch** — chỉ Excel có, chỉ DB có, và có ở cả hai nhưng khác giá trị.

> **Tình huống 2:** File Excel dùng chung của team ngày càng chậm, mất 2 phút để mở.

```text
   ✅ Chẩn đoán theo thứ tự:

   ① Formulas → Calculation Options → xem có đang ở Automatic không
      → tạm chuyển sang Manual để làm việc, F9 khi cần tính lại

   ② Ctrl+F tìm "OFFSET", "INDIRECT", "TODAY", "NOW", "RAND"
      → mỗi cái là một hàm volatile

   ③ Ctrl+End — xem ô cuối cùng ở đâu
      → thường nhảy tới XFD1048576 vì có định dạng thừa
      → xoá hẳn hàng/cột trống rồi lưu lại

   ④ Kiểm tra công thức tham chiếu cả cột (A:A) trong bảng lớn
      → giới hạn về dải thật (A1:A50000)

   ⑤ Nếu vẫn chậm → dữ liệu đã vượt sức Excel.
      Đưa vào database hoặc Power Query.
```

> **Tình huống 3:** Người phỏng vấn hỏi câu này cho vị trí backend. Trả lời sao cho hợp?

```text
   ✅ Trả lời có, rồi BẮC CẦU sang thứ bạn mạnh:

   "Em dùng XLOOKUP nếu có, không thì INDEX MATCH — vì VLOOKUP
    đếm cột bằng số, và chèn thêm một cột là công thức trả nhầm cột
    mà không báo lỗi nào. Và luôn đóng bằng 0 hoặc FALSE, vì mặc định
    của cả VLOOKUP lẫn MATCH là dò gần đúng — nó trả về người
    gần giống nhất trên bảng chưa sắp xếp, cũng không báo lỗi.

    Nhưng thật ra hai cái bẫy đó có bản chất giống hệt những thứ
    em gặp trong SQL: tham chiếu theo VỊ TRÍ thay vì theo TÊN —
    đúng như SELECT * rồi lấy cột theo thứ tự; và ÉP KIỂU NGẦM
    khi mã lưu thành chuỗi ở bên này và số ở bên kia.

    Với dữ liệu trên 100.000 dòng hoặc có nhiều người cùng ghi
    thì em chuyển hẳn sang database — vì Excel không có transaction,
    hai người cùng sửa là mất bản cập nhật của người lưu trước."
```

**Câu cuối là câu ăn điểm:** nó cho thấy bạn biết **giới hạn của công cụ** và biết khi nào phải đổi công cụ.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `VLOOKUP` với số cột cứng | Chèn cột → trả nhầm cột, **không báo lỗi** | `XLOOKUP` / `INDEX MATCH` |
| Quên `0` trong `MATCH` | Dò gần đúng → trả nhầm người | Luôn đóng bằng `0` |
| Quên `FALSE` trong `VLOOKUP` | Như trên | Luôn đóng bằng `FALSE` |
| Dùng khớp chính xác cho bảng bậc thuế | Không tìm thấy → `#N/A` | Bậc thuế **phải** dùng gần đúng + bảng sắp xếp |
| Mã lưu thành chuỗi ở một bên | Không khớp dù nhìn giống nhau | Chuẩn hoá kiểu cả hai phía |
| Khoảng trắng vô hình | Không khớp | `TRIM` + xử lý `CHAR(160)` |
| Tham chiếu tương đối khi kéo | Dải trượt, kết quả sai dần | `$` hoặc **đặt tên dải** |
| Hàm volatile (`OFFSET`, `INDIRECT`) | File treo mỗi lần gõ | Dùng `INDEX` thay `OFFSET` |
| Mã trên 15 chữ số | **Làm tròn im lặng** | Lưu dạng Text |
| Định dạng ngày tự đoán | Sai im lặng giữa các máy | Dùng ISO `2026-02-01` |
| Nhiều người cùng sửa file | **Lost update** — người lưu sau thắng | Chuyển sang database |
| Dùng Excel cho dữ liệu tiền, nhiều người | Sai số, không đối soát được | Database |

## Câu hỏi phỏng vấn hay gặp

**H: VLOOKUP hay INDEX MATCH?**
`XLOOKUP` nếu phiên bản có; không thì `INDEX MATCH`. Lý do: `VLOOKUP` **đếm cột bằng số thứ tự bạn tự đếm bằng mắt** — kế toán chèn thêm một cột vào giữa là công thức trả về cột khác, mà **không ô nào báo lỗi**, nó vẫn trả tiền, chỉ là tiền của cột khác. `INDEX MATCH` trỏ thẳng vào cột thật nên Excel tự dời tham chiếu theo. Nó còn tra cứu được sang trái và nhanh hơn trên bảng lớn vì chỉ đọc đúng hai cột.

**H: Đổi sang INDEX MATCH rồi mà vẫn ra sai người, vì đâu?**
Thiếu số `0` ở cuối `MATCH`. Mặc định của cả `MATCH` lẫn `VLOOKUP` là **dò gần đúng** — nó trả về giá trị lớn nhất còn nhỏ hơn hoặc bằng thứ bạn tìm, và nó đòi bảng phải sắp xếp sẵn. Bảng lương thì không sắp xếp, nên nó trả về **người gần giống nhất** và vẫn không báo lỗi. Luôn đóng bằng `0` (hoặc `FALSE`) khi tra theo mã.

**H: Vậy dò gần đúng là sai à?**
Không — nó chỉ **bị đặt nhầm chỗ**. Bảng bậc thuế hay bậc chiết khấu thì **bắt buộc** phải dùng dò gần đúng, vì bạn đang tra một **khoảng** chứ không tra một mã: thu nhập 12 triệu không khớp chính xác dòng nào, nhưng phải rơi vào bậc 10 triệu. Điều kiện là bảng phải được sắp xếp tăng dần. Nguyên tắc: **tra mã thì khớp chính xác, tra khoảng thì khớp gần đúng**.

**H: Excel dùng được tới đâu?**
Giới hạn cứng là 1.048.576 dòng và **chỉ chính xác tới 15 chữ số có nghĩa** — mã 18 số bị làm tròn im lặng. Nhưng ngưỡng thật đến sớm hơn nhiều: trên 100.000 dòng, hoặc có **hơn một người cùng ghi**, hoặc dữ liệu **dính tới tiền** thì phải chuyển sang database. Vì Excel không có transaction và không có kiểm soát đồng thời — hai người cùng mở file, cùng sửa, cùng lưu thì người lưu sau thắng và bản cập nhật của người kia **bốc hơi mà không có cảnh báo nào**.

**H: Hai cái bẫy này có liên quan gì tới lập trình không?**
Rất giống. `VLOOKUP` với số cột cứng chính là **tham chiếu theo vị trí thay vì theo tên** — đúng như `SELECT *` rồi lấy cột theo thứ tự, và cả hai đều hỏng khi cấu trúc thay đổi. Còn mã lưu thành chuỗi ở bên này và số ở bên kia thì chính là **ép kiểu ngầm** — hai giá trị trông giống hệt nhau nhưng không khớp. Bài học chung: **tham chiếu bằng tên, và chuẩn hoá kiểu ở cả hai phía trước khi so sánh.**

## Tóm tắt bài 5

- `VLOOKUP` **đếm cột bằng số** → chèn cột là trả nhầm cột, **không báo lỗi nào**.
- `INDEX MATCH` **trỏ thẳng vào cột thật** → miễn nhiễm với chèn cột; còn tra được sang trái và nhanh hơn trên bảng lớn.
- Cả `VLOOKUP` lẫn `MATCH` đều **mặc định dò gần đúng** → phải đóng bằng `FALSE`/`0` khi tra theo mã.
- **Dò gần đúng không sai, nó chỉ bị đặt nhầm chỗ** — bảng bậc thuế thì bắt buộc dùng nó (và bảng phải sắp xếp).
- `XLOOKUP` xoá cả hai bẫy: không đếm cột, **mặc định khớp chính xác**, và bắt bạn nói rõ ý định khi muốn dò khoảng.
- Sáu bẫy khác: **kiểu chuỗi vs số**, **khoảng trắng vô hình**, **tham chiếu tương đối**, **hàm volatile**, **giới hạn 15 chữ số**, **định dạng ngày tự đoán**.
- Hai cái bẫy chính có bản chất **giống hệt trong SQL**: tham chiếu theo **vị trí** thay vì theo **tên**, và **ép kiểu ngầm**.
- Ngưỡng đổi sang database: **>100.000 dòng, >1 người cùng ghi, hoặc dữ liệu dính tới tiền**.

**Quay lại** → [Mục lục khoá học](../README.md)
