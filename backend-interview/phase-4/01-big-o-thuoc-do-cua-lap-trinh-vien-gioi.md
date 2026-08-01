# Bài 1: Big O — thước đo của một lập trình viên giỏi

App của bạn chạy cực mượt với 10 người dùng thử. Nhưng khi 1 triệu người đổ vào cùng lúc, mọi thứ **đơ cứng, đứng hình, chết lặng hoàn toàn**.

Server không hỏng. Mạng không nghẽn. Máy chủ vẫn còn dư sức mạnh.

Thủ phạm thật sự nằm ngay trong đoạn code bạn viết: một thuật toán tệ hại tên là **O(n²)**.

Vòng quay tải trang cứ xoay mãi không dừng. Người dùng bực bội thoát ra hàng loạt. Đánh giá một sao tới tấp. Và sản phẩm bạn dày công xây dựng sụp đổ chỉ trong vài phút.

Nếu bạn từng thấy Big O đáng sợ và trừu tượng, hãy quên hết đi. Thắt dây an toàn, ta bắt đầu.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **Big O** | **Ký hiệu O lớn** — cách mô tả tốc độ tăng của chi phí khi dữ liệu lớn dần |
| **Complexity** | **Độ phức tạp** — chi phí tính theo kích thước đầu vào |
| **n** | Kích thước đầu vào (số phần tử, số dòng, số người dùng) |
| **Time complexity** | **Độ phức tạp thời gian** — tốn bao nhiêu bước |
| **Space complexity** | **Độ phức tạp không gian** — tốn bao nhiêu bộ nhớ |
| **Worst case** | **Trường hợp xấu nhất** — Big O mặc định nói về cái này |
| **Amortized** | **Khấu hao** — trung bình trên nhiều lần, dù có lần rất đắt |
| **Hash table** | **Bảng băm** — cấu trúc tra cứu theo khoá trong O(1) |
| **Cache locality** | **Tính cục bộ bộ nhớ** — dữ liệu gần nhau thì đọc nhanh hơn nhiều |

## Ý tưởng cốt lõi: tìm tên trong danh bạ

```text
   CÁCH 1 — lật từng trang từ đầu tới cuối
   CÁCH 2 — mở giữa cuốn, rồi loại bỏ một nửa sau mỗi lần

   Danh bạ mỏng 10 trang:
      cả hai cách đều nhanh như nhau. Bạn chẳng cảm nhận được khác biệt.

   Danh bạ 1 TRIỆU trang:
      Cách 1 → có thể ngốn cả TRIỆU lần lật
      Cách 2 → khoảng 20 bước là xong

   Một trời một vực.
   VÀ ĐÓ CHÍNH XÁC LÀ ĐIỀU BIG O MUỐN CẢNH BÁO BẠN.
```

**Big O không đo thời gian thật.** Nó đo **tốc độ tăng của chi phí khi dữ liệu lớn dần**. Nó trả lời câu hỏi: *"dữ liệu gấp đôi thì chi phí gấp mấy?"*

```text
   O(1)      → dữ liệu gấp đôi, chi phí KHÔNG ĐỔI
   O(log n)  → dữ liệu gấp đôi, chi phí +1 bước
   O(n)      → dữ liệu gấp đôi, chi phí GẤP ĐÔI
   O(n log n)→ dữ liệu gấp đôi, chi phí hơn gấp đôi một chút
   O(n²)     → dữ liệu gấp đôi, chi phí GẤP BỐN
   O(2ⁿ)     → dữ liệu THÊM MỘT phần tử, chi phí GẤP ĐÔI
```

## Hai quy tắc rút gọn

```text
   ① BỎ HẰNG SỐ
      O(2n)      → O(n)
      O(n/2)     → O(n)
      O(100)     → O(1)
      Vì khi n lớn, hằng số không còn quan trọng.

   ② GIỮ SỐ HẠNG LỚN NHẤT
      O(n² + n)      → O(n²)
      O(n + log n)   → O(n)
      Vì khi n = 1.000.000: n² = 10¹² còn n chỉ là 10⁶.
      Số hạng nhỏ biến mất trong so sánh.
```

```python
def vi_du(arr):              # n phần tử
    print(arr[0])            # O(1)
    for x in arr:            # O(n)
        print(x)
    for x in arr:            # O(n²)
        for y in arr:
            print(x, y)
# Tổng: O(1) + O(n) + O(n²) = O(n²)
```

## Vườn thú các họ độ phức tạp

```text
   Số bước khi n = 1.000.000:

   O(1)         1                      ⚡ tức thì
   O(log n)     20                     ⚡ tức thì
   O(n)         1.000.000              ✅ ~1 giây
   O(n log n)   20.000.000             ✅ ~20 giây
   O(n²)        1.000.000.000.000      ❌ ~11 NGÀY
   O(2ⁿ)        con số dài hơn số nguyên tử trong vũ trụ
   O(n!)        đừng hỏi
```

| Ký hiệu | Tên | Ví dụ điển hình |
|---|---|---|
| **O(1)** | Hằng số | Tra bảng băm, truy cập mảng theo chỉ số |
| **O(log n)** | Logarit | Tìm nhị phân, tra B+Tree index |
| **O(n)** | Tuyến tính | Duyệt mảng một lần, quét toàn bảng |
| **O(n log n)** | Tuyến tính-log | Sắp xếp tốt nhất (merge sort, quicksort) |
| **O(n²)** | Bậc hai | Hai vòng lặp lồng nhau, bubble sort |
| **O(n³)** | Bậc ba | Ba vòng lồng, nhân ma trận ngây thơ |
| **O(2ⁿ)** | Mũ | Fibonacci đệ quy, duyệt mọi tập con |
| **O(n!)** | Giai thừa | Duyệt mọi hoán vị (bài toán người bán hàng) |

```text
   VÙNG XANH  (dùng thoải mái):     O(1), O(log n), O(n), O(n log n)
   VÙNG VÀNG  (cẩn thận với n lớn): O(n²)
   VÙNG ĐỎ    (chỉ với n rất nhỏ):  O(2ⁿ), O(n!)
```

## Kiến trúc và cách hoạt động: vì sao O(log n) nhanh đến vậy

```text
   TÌM TUYẾN TÍNH — O(n)
      [1][3][5][7][9][11][13][15]   tìm 13
       ✗  ✗  ✗  ✗  ✗   ✗  ✓
      → 7 bước

   TÌM NHỊ PHÂN — O(log n)   (yêu cầu: dữ liệu ĐÃ SẮP XẾP)
      [1][3][5][7][9][11][13][15]   tìm 13
                 ▲ giữa = 7, 13 > 7 → BỎ NỬA TRÁI
                    [9][11][13][15]
                        ▲ giữa = 11, 13 > 11 → BỎ NỬA TRÁI
                           [13][15]
                            ▲ tìm thấy
      → 3 bước

   MỖI BƯỚC LOẠI BỎ MỘT NỬA.
   1.000.000 → 500.000 → 250.000 → ... → 1
   Chỉ mất 20 bước, vì 2²⁰ ≈ 1.000.000.
```

Đây cũng chính là cơ chế của **B+Tree index** trong database (xem khoá SQL): mỗi lần xuống một tầng là loại bỏ phần lớn dữ liệu còn lại.

### Vì sao bảng băm là O(1)

```text
   hash("an@gmail.com") = 8472913
   8472913 % 16 = 9        ← nhảy THẲNG tới ô số 9

   Không duyệt, không so sánh gì cả → O(1)

   ⚠️ NHƯNG: khi nhiều khoá cùng rơi vào một ô (va chạm),
      trường hợp XẤU NHẤT là O(n).
      Với hàm băm tốt, trường hợp trung bình vẫn là O(1).
```

## Big O của các thao tác hay dùng

| Cấu trúc | Tra cứu | Chèn | Xoá | Tìm theo giá trị |
|---|---|---|---|---|
| **Mảng** | O(1) theo chỉ số | O(n) | O(n) | O(n) |
| **Mảng đã sắp** | O(1) | O(n) | O(n) | **O(log n)** |
| **Danh sách liên kết** | O(n) | **O(1)** ở đầu | O(1) nếu có con trỏ | O(n) |
| **Bảng băm** | **O(1)** | **O(1)** | **O(1)** | O(n) |
| **Cây cân bằng** | O(log n) | O(log n) | O(log n) | O(log n) |
| **Heap** | O(1) xem đỉnh | O(log n) | O(log n) | O(n) |

**Bảng này giải thích vì sao đổi cấu trúc dữ liệu thường là cách tối ưu mạnh nhất** — mạnh hơn nhiều so với vi chỉnh code.

```python
# ❌ O(n²) — với mỗi phần tử, duyệt cả danh sách kia
def tim_trung(a, b):
    kq = []
    for x in a:              # n lần
        if x in b:           # `in` trên LIST là O(n)
            kq.append(x)
    return kq
# 10.000 × 10.000 = 100.000.000 phép so sánh

# ✅ O(n) — đổi list thành set
def tim_trung_nhanh(a, b):
    tap_b = set(b)           # O(n) một lần
    return [x for x in a if x in tap_b]   # `in` trên SET là O(1)
# 20.000 phép → NHANH HƠN 5.000 LẦN
```

**Chỉ đổi một chữ `set()`, và thuật toán chuyển từ vùng vàng sang vùng xanh.**

## Cách phân tích code thực chiến

```text
   ① Đếm số VÒNG LẶP LỒNG NHAU trên cùng dữ liệu
        1 vòng → O(n),  2 vòng lồng → O(n²)

   ② Vòng lặp mà mỗi bước CHIA ĐÔI → O(log n)
        while (n > 1) { n = n / 2; }

   ③ Đệ quy: dùng công thức truy hồi
        chia đôi rồi gộp lại → O(n log n)   (merge sort)
        gọi 2 nhánh, không nhớ kết quả → O(2ⁿ)  (fibonacci ngây thơ)

   ④ CHÚ Ý CÁC LỆNH ẨN CHI PHÍ — chỗ này bẫy nhiều nhất:
        arr.sort()          → O(n log n)   KHÔNG phải O(1)
        `x in list`         → O(n)         KHÔNG phải O(1)
        list.insert(0, x)   → O(n)         phải dịch mọi phần tử
        chuoi += "a"        → O(n)         chuỗi bất biến, tạo bản mới
        arr.copy()          → O(n)
```

Điểm ④ là nơi hầu hết O(n²) ẩn nấp:

```python
# ❌ Trông như O(n), thực ra là O(n²)
def gop_chuoi(items):
    kq = ""
    for x in items:
        kq += str(x)         # mỗi lần TẠO CHUỖI MỚI, sao chép toàn bộ
    return kq

# ✅ O(n)
def gop_chuoi_nhanh(items):
    return "".join(str(x) for x in items)
```

```python
# ❌ O(n²) ẩn — insert(0) phải dịch mọi phần tử
for x in data:
    ket_qua.insert(0, x)

# ✅ O(n) — dùng deque hoặc append rồi đảo
from collections import deque
kq = deque()
for x in data:
    kq.appendleft(x)         # O(1)
```

## Sự thật ít ai nói cho bạn nghe

### ① Với n nhỏ, thuật toán "tệ" có thể nhanh hơn

```text
   O(n²) với hằng số nhỏ:  2n²
   O(n log n) với hằng số lớn: 100·n·log n

   n = 10:    2×100 = 200        vs   100×10×3.3 = 3.300
              ▲ thuật toán "tệ" NHANH HƠN 16 LẦN

   n = 10.000: 2×10⁸ = 200.000.000  vs  100×10.000×13 = 13.000.000
              ▲ giờ thì thuật toán "tốt" nhanh hơn 15 lần
```

Đó là lý do trong thực tế người ta **trộn nhiều thuật toán**: thư viện sắp xếp chuẩn (Timsort trong Python/Java) dùng **insertion sort** cho mảng con dưới 32–64 phần tử, rồi mới gộp bằng merge sort.

### ② Big O cố tình nhắm mắt trước rất nhiều thứ của đời thực

```text
   Nó BỎ QUA:
      • Bộ nhớ đệm CPU (cache locality)
      • Tốc độ ổ cứng vs RAM (chênh nhau 100.000 lần)
      • Cách dữ liệu nằm trong bộ nhớ
      • Chi phí cấp phát bộ nhớ, thu gom rác
      • Độ trễ mạng

   VÀ CHÍNH NHỮNG CHI TIẾT BỊ LÀM NGƠ ĐÓ
   LẠI THƯỜNG QUYẾT ĐỊNH CODE CỦA BẠN NHANH HAY CHẬM NGOÀI ĐỜI THẬT.
```

Ví dụ kinh điển: duyệt **mảng** nhanh hơn duyệt **danh sách liên kết** rất nhiều dù cả hai đều là O(n) — vì mảng nằm liền nhau trong bộ nhớ nên CPU đọc theo khối rất hiệu quả, còn danh sách liên kết nhảy lung tung nên **mỗi bước là một lần cache miss**.

### ③ Trong backend, nút thắt hiếm khi là CPU

```text
   Bảng độ trễ mà mọi kỹ sư backend nên thuộc:

      Đọc 1 dòng từ CPU cache        ~1 ns
      Truy cập RAM                   ~100 ns
      Đọc ngẫu nhiên từ SSD          ~100.000 ns  (0,1 ms)
      Round-trip trong data center   ~500.000 ns  (0,5 ms)
      Đọc ngẫu nhiên từ ổ cứng quay  ~10.000.000 ns (10 ms)
      Round-trip Việt Nam → Mỹ       ~150.000.000 ns (150 ms)

   MỘT LẦN GỌI MẠNG ≈ 1.000.000 PHÉP TÍNH CPU.
```

Đây là lý do **N+1 query giết bạn còn nhanh hơn O(n²)**: một vòng lặp 100 lần gọi database tốn nhiều thời gian hơn một triệu phép tính trong bộ nhớ.

```python
# O(n) về mặt thuật toán, nhưng CHẬM KINH KHỦNG trong thực tế
for user_id in user_ids:                 # 100 lần
    user = db.query("SELECT * FROM users WHERE id=%s", user_id)   # 5 ms mỗi lần
# → 500 ms

# ✅ Vẫn O(n), nhưng MỘT lần gọi mạng
users = db.query("SELECT * FROM users WHERE id = ANY(%s)", user_ids)
# → 8 ms. NHANH HƠN 60 LẦN, và Big O KHÔNG ĐỔI.
```

**Bài học: Big O là công cụ để loại bỏ thuật toán thảm hoạ, không phải để tối ưu vi mô.**

## Độ phức tạp không gian — thứ hay bị bỏ quên

```python
# O(n) thời gian, O(1) không gian
def tong(arr):
    s = 0
    for x in arr:
        s += x
    return s

# O(n) thời gian, O(n) KHÔNG GIAN
def nhan_doi(arr):
    return [x * 2 for x in arr]      # tạo mảng mới cùng kích thước

# ❌ O(n) không gian — nạp 10 triệu dòng vào RAM
rows = db.query("SELECT * FROM events").fetchall()

# ✅ O(1) không gian — xử lý theo luồng
for row in db.query_stream("SELECT * FROM events"):
    xu_ly(row)
```

Đây là đánh đổi kinh điển **thời gian ↔ không gian**: cache và bảng băm mua tốc độ bằng bộ nhớ.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** API danh sách sản phẩm chạy 200 ms với 100 sản phẩm, nhưng 45 giây với 3.000 sản phẩm.

**Phân tích:** 30 lần dữ liệu → 225 lần thời gian. Tỉ lệ ≈ n². Có vòng lặp lồng nhau ở đâu đó.

```python
# ❌ Thủ phạm: với mỗi sản phẩm, duyệt cả danh sách khuyến mãi
for sp in san_pham:                          # n = 3.000
    for km in khuyen_mai:                    # m = 500
        if km.product_id == sp.id:
            sp.gia_km = km.gia
# 3.000 × 500 = 1.500.000 phép so sánh

# ✅ Đánh chỉ mục bằng dict trước — O(n + m)
chi_muc = {km.product_id: km.gia for km in khuyen_mai}    # O(m)
for sp in san_pham:                                        # O(n)
    sp.gia_km = chi_muc.get(sp.id)
# 3.500 phép → 45 giây còn ~150 ms
```

**Đây là kỹ thuật quan trọng nhất trong bài: đánh chỉ mục trước khi tra cứu.** Bất cứ khi nào bạn thấy hai vòng lặp lồng nhau tìm sự khớp nối, hãy đổi vòng trong thành một `dict`/`set`.

> **Tình huống 2:** Sếp hỏi *"code này có tối ưu chưa?"*

**Cách trả lời có tính kỹ thuật, không đoán mò:**

```text
① ĐO TRƯỚC, ĐỪNG ĐOÁN
   → dùng profiler (cProfile, py-spy, pprof) tìm ra chỗ TỐN NHẤT

② KIỂM TRA n THẬT SỰ LÀ BAO NHIÊU
   → n = 50 thì O(n²) hoàn toàn ổn, tối ưu là lãng phí công sức
   → n = 1.000.000 thì phải xử lý

③ NHÌN VÀO NÚT THẮT THẬT
   → 90% trường hợp backend, nút thắt là I/O (database, mạng),
     không phải CPU. Sửa N+1 query thắng lớn hơn tối ưu vòng lặp nhiều.

④ CHỈ TỐI ƯU KHI CÓ SỐ ĐO
   "Trước 45 giây, sau 150 ms" là bằng chứng.
   "Tôi nghĩ nó nhanh hơn" thì không.
```

> **Tình huống 3:** Phỏng vấn hỏi *"tìm hai số trong mảng có tổng bằng target"*.

```python
# ❌ O(n²) — đáp án đầu tiên ai cũng nghĩ ra
def hai_so(arr, target):
    for i in range(len(arr)):
        for j in range(i+1, len(arr)):
            if arr[i] + arr[j] == target:
                return i, j

# ✅ O(n) — đánh đổi không gian lấy thời gian
def hai_so_nhanh(arr, target):
    da_thay = {}                       # giá trị → chỉ số
    for i, x in enumerate(arr):
        if target - x in da_thay:      # tra bảng băm O(1)
            return da_thay[target - x], i
        da_thay[x] = i
```

**Điều người phỏng vấn thật sự chấm:** bạn có nhận ra **đánh đổi thời gian ↔ không gian** không, và bạn có nói ra được rằng cách hai tốn thêm O(n) bộ nhớ không.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `x in list` trong vòng lặp | O(n²) ẩn | Đổi sang `set`/`dict` |
| `chuoi += x` trong vòng lặp | O(n²) vì chuỗi bất biến | `"".join(...)` |
| `list.insert(0, x)` trong vòng lặp | O(n²) vì phải dịch phần tử | `deque.appendleft` |
| `arr.sort()` bên trong vòng lặp | O(n² log n) | Sắp một lần ngoài vòng |
| Quên `sort()` là O(n log n) | Ước lượng sai độ phức tạp | Nhớ chi phí các lệnh thư viện |
| Gọi database trong vòng lặp | N+1 — chậm hơn O(n²) nhiều | Gom thành một query `IN` |
| Tối ưu khi n nhỏ | Lãng phí công sức, code khó đọc | Kiểm n thật trước |
| Chỉ nhìn Big O, bỏ qua I/O | Tối ưu sai chỗ | Nút thắt backend thường là I/O |
| Quên độ phức tạp **không gian** | Hết RAM khi n lớn | Xử lý theo luồng |
| Đoán thay vì đo | Sửa nhầm chỗ | Profiler trước |
| Nghĩ Big O đo thời gian thật | Hiểu sai bản chất | Nó đo **tốc độ tăng** |

## Câu hỏi phỏng vấn hay gặp

**H: Big O là gì?**
Là cách mô tả **tốc độ tăng của chi phí khi dữ liệu lớn dần** — nó trả lời câu *"dữ liệu gấp đôi thì chi phí gấp mấy"*. Nó **không đo thời gian thật**, và nó cố tình bỏ qua hằng số vì khi n lớn thì hằng số không còn quan trọng. Với n = 1 triệu: O(log n) là 20 bước, O(n) là 1 triệu bước, còn O(n²) là 10¹² bước — khoảng 11 ngày.

**H: Làm sao biết code có O(n²) không?**
Đếm vòng lặp lồng nhau trên cùng dữ liệu. Nhưng nguy hiểm hơn là **O(n²) ẩn** trong các lệnh trông vô hại: `x in list` là O(n), `chuoi += x` tạo chuỗi mới mỗi lần, `list.insert(0, x)` phải dịch mọi phần tử, và `arr.sort()` là O(n log n) chứ không phải O(1). Cách chữa gần như luôn giống nhau: **đánh chỉ mục bằng `dict`/`set` trước rồi mới tra cứu** — đổi O(n²) thành O(n + m).

**H: Thuật toán O(n log n) có luôn tốt hơn O(n²) không?**
Không, với n nhỏ. Hằng số có thể áp đảo: `2n²` với n = 10 là 200 bước, còn `100·n·log n` là 3.300 bước — thuật toán "tệ" nhanh hơn 16 lần. Đó là lý do thư viện sắp xếp chuẩn như Timsort dùng **insertion sort** cho mảng con dưới 32–64 phần tử rồi mới gộp bằng merge sort. Big O chỉ nói về **hành vi khi n lớn**.

**H: Trong backend, tối ưu Big O có quan trọng không?**
Quan trọng để **loại bỏ thuật toán thảm hoạ**, nhưng nút thắt thật hiếm khi là CPU. Một lần gọi mạng khoảng 0,5 ms trong data center, tương đương cả **triệu phép tính CPU** — nên một vòng lặp gọi database 100 lần tốn nhiều thời gian hơn một triệu phép tính trong bộ nhớ. Sửa N+1 query gần như luôn thắng lớn hơn tối ưu vòng lặp, dù cả hai đều là O(n) về mặt thuật toán.

**H: Big O bỏ qua những gì?**
Bộ nhớ đệm CPU, chênh lệch tốc độ RAM và đĩa (100.000 lần), cách dữ liệu nằm trong bộ nhớ, chi phí cấp phát và thu gom rác, và độ trễ mạng. Ví dụ điển hình: duyệt mảng nhanh hơn duyệt danh sách liên kết rất nhiều dù cả hai đều O(n), vì mảng nằm liền nhau nên CPU đọc theo khối, còn danh sách liên kết nhảy lung tung nên mỗi bước là một cache miss. **Chính những chi tiết bị làm ngơ đó thường quyết định code nhanh hay chậm ngoài đời thật.**

## Tóm tắt bài 1

- Big O đo **tốc độ tăng của chi phí**, không đo thời gian thật: *"dữ liệu gấp đôi thì chi phí gấp mấy?"*
- Hai quy tắc rút gọn: **bỏ hằng số** và **giữ số hạng lớn nhất**.
- Vùng xanh O(1)/O(log n)/O(n)/O(n log n); vùng vàng O(n²); vùng đỏ O(2ⁿ)/O(n!).
- **O(n²) ẩn** nằm trong `x in list`, `chuoi += x`, `insert(0, x)`, `sort()` trong vòng lặp — chữa bằng **đánh chỉ mục trước khi tra cứu**.
- Với **n nhỏ**, thuật toán "tệ" có thể nhanh hơn — đó là lý do Timsort trộn insertion sort với merge sort.
- Big O **bỏ qua cache, đĩa, mạng** — và chính những thứ đó thường quyết định tốc độ thật.
- Trong backend, **một lần gọi mạng ≈ một triệu phép tính CPU** — nên sửa N+1 thắng lớn hơn tối ưu vòng lặp.
- Quy trình đúng: **đo trước, kiểm n thật, nhìn nút thắt thật, chỉ tối ưu khi có số đo**.

**Bài kế tiếp** → [Bài 2: Tinder xử lý tỷ lượt quẹt như thế nào](02-tinder-xu-ly-ty-luot-quet-nhu-the-nao.md)
