# Bài 2: Vì sao là cây B chứ không phải cây nhị phân — quyết định năm 1970 vẫn nằm trong máy bạn sáng nay

Bốn năm đại học, bạn học cây nhị phân. Vẽ đi vẽ lại, thi cử, phỏng vấn. Rồi đi làm, mở database nào ra cũng **không thấy nó**. Cái nào cũng dùng thứ khác, tên là **cây B**.

Cây B ra đời năm nào? Chọn một trong ba mốc:

- **1995**, lúc web bùng nổ và dữ liệu bắt đầu lớn?
- **1983**, thời máy vi tính lên ngôi?
- **1970**, khi màn hình còn chưa có màu?

Đáp án là **mốc sớm nhất**. Nhưng đáng nói không phải con số năm. Đáng nói là: **ba ràng buộc** ép hai kỹ sư chọn như vậy thì hôm nay **hai cái đã chết hẳn** — mà cái quyết định vẫn nằm nguyên trong máy bạn sáng nay, và vẫn đang thắng.

## Nói cho công bằng: cái bản án mà gần như ai cũng tin

> *"Cây nhị phân đã nhanh theo logarit rồi. Cây B chỉ là một cú tối ưu vặt cho hợp với đĩa cứng."*

Bản án đó **không hề ngớ ngẩn**. Trên giấy, nó đúng từng chữ:

- Cả hai cây đều chia nhỏ không gian tìm kiếm sau mỗi bước.
- Cả hai đều là `O(log n)`.
- Và nếu bạn đo bằng **số phép so sánh**, cây nhị phân **thắng thật**.

```text
Tìm 1 khoá trong 1.000.000 khoá:

  Cây nhị phân:  log₂(1.000.000)  ≈ 20 phép so
  Cây B (nút chứa 800 khoá, 3 tầng):
                 3 tầng × log₂(800) ≈ 3 × 10 = 30 phép so

  → Cây nhị phân ÍT PHÉP SO HƠN. 20 < 30.
```

Cả ngành cũng đứng về phía bản án đó. Mọi giáo trình mở đầu bằng cây nhị phân. Mọi buổi phỏng vấn đều hỏi nó. Gần như không ai hỏi bạn *"cây B tách nút thế nào?"*.

Nên bản án nghe rất chắc: **nhanh bằng nhau về lý thuyết, mà cây nhị phân lại đơn giản hơn nhiều**. Vậy chọn cái phức tạp hơn để làm gì, ngoài lý do lịch sử?

Câu trả lời không nằm trong lý thuyết. Nó nằm trong một phòng thí nghiệm của hãng Boeing năm 1970, nơi hai kỹ sư đang nhìn vào **thứ mà giáo trình không bao giờ vẽ**.

> **Bối cảnh có thật.** Rudolf Bayer và Edward M. McCreight, làm tại Boeing Scientific Research Laboratories, viết báo cáo nội bộ năm **1970**, công bố chính thức trên *Acta Informatica* năm **1972** với tiêu đề *"Organization and Maintenance of Large Ordered Indexes"*. Chữ "B" nghĩa là gì thì chính McCreight về sau nói vui rằng càng nghĩ về nó bạn càng hiểu cây B — Boeing? Balanced? Bayer? Không ai chốt.

## Thứ giáo trình không bao giờ vẽ: cái đĩa cứng

Nó là một cỗ máy to cỡ cái tủ lạnh. Bên trong là những đĩa kim loại quay liên tục và một cần gạt mang đầu đọc trượt ra trượt vào.

```text
        ┌───────────────────────────────┐
        │   ● ● ● ●  đĩa quay 3.600 v/p │
        │  ═══════════════◄── cần gạt   │
        └───────────────────────────────┘

  Mỗi lần cần gạt nhích sang rãnh khác   : ~30 ms  (seek)
  Cộng thêm chờ đĩa quay tới đúng chỗ    : ~ 8 ms  (rotational latency)
  ─────────────────────────────────────────────────
  MỘT lần chạm dữ liệu                   : ~38 ms
```

38 mili giây nghe rất nhỏ. Nhưng máy thời đó chạy được **cả trăm nghìn lệnh** trong khoảng ấy. Nói cách khác:

> Một lần chạm đĩa **đắt bằng hàng trăm nghìn phép so sánh trong bộ nhớ**.

Nên nếu bạn định nói *"cứ chờ máy nhanh hơn là xong"*, hãy nhìn lại con số. Vấn đề không phải máy chậm. Vấn đề là:

```text
Cây nhị phân, 1 triệu khoá, nằm trên đĩa:

  20 tầng  →  20 lần chạm đĩa
  20 × 38 ms = 760 ms

  ba phần tư giây, để tra ĐÚNG MỘT khoá.
```

Dưới ràng buộc đó, bạn làm gì?

Bạn sẽ **thôi đếm số phép so sánh**. Bạn sẽ đếm **số lần chạm đĩa**, vì đó mới là thứ tốn tiền. Và cả bài toán đổi từ *"làm ít phép so lại"* thành *"đi ít tầng lại"*.

> **Thẻ thứ nhất úp xuống.** Một lần chạm đĩa 38 ms, nên thứ phải giảm là **số tầng**, không phải số phép so. Từ đây: cây càng **thấp** càng tốt.

## Nhưng làm cây thấp lại bằng cách nào?

Câu trả lời nằm ở một chi tiết mà không giáo trình nào nhắc tới: **cái đĩa đó không đọc được 1 byte**.

Nó chỉ đọc được **nguyên một rãnh**. Một rãnh của cỗ máy đời đó chứa **13.030 byte**. Bạn cần lấy một khoá 8 byte, máy vẫn phải kéo về đủ 13.030 byte. Không có cách nào lấy ít hơn.

```text
Bạn xin  :  ▌ 8 byte
Máy đưa  :  ████████████████████████████████████ 13.030 byte
             ▲
             └── 13.022 byte còn lại: bạn đã TRẢ TIỀN rồi, và vứt đi.
```

Nghĩa là **đọc 1 khoá và đọc 800 khoá tốn thời gian y hệt nhau**. Bạn đã trả tiền cho cả cái rãnh; để trống 799 chỗ trong đó là vứt tiền đi.

Nên nếu bạn định nói *"vậy dùng cây nhị phân **cân bằng** cho chuẩn (AVL, đỏ-đen)"* — cân bằng **không cứu được gì**. Nút vẫn chỉ có 2 con, mỗi nút vẫn là một lần chạm, và lần chạm nào cũng kéo về cả rãnh gần rỗng.

Một lần chạm kéo về 13.000 byte mà bạn chỉ dùng có 8. Dưới ràng buộc đó, bạn sẽ nhét gì vào chỗ còn trống?

**Bạn sẽ nhét thêm khoá.** Nhét cho tới khi đầy một rãnh.

```text
Cây nhị phân               Cây B (nút = 1 rãnh)
──────────────             ──────────────────────
      ●                          ┌───────────────┐
     / \                         │ 800 khoá      │
    ●   ●                        └───┬───┬───┬───┘
   / \ / \                    ┌──────┘   │   └──────┐
  ● ● ● ●                  ┌──▼──┐   ┌───▼─┐   ┌───▼─┐
 ...20 tầng...             │800  │   │800  │   │800  │  ...3 tầng
                           └─────┘   └─────┘   └─────┘

  20 lần chạm × 38 ms       3 lần chạm × 38 ms
  = 760 ms                  = 114 ms        ← nhanh gấp ~6,7 lần
```

Toán học phía sau chỉ là đổi cơ số của logarit:

```text
Cây nhị phân:  log₂(1.000.000)   ≈ 20 tầng
Cây B (800):   log₈₀₀(1.000.000) ≈ 2,06 → 3 tầng (kể cả nút gốc)

Và nếu dữ liệu tăng gấp 800 lần (800 triệu khoá)?
  Cây nhị phân: 20 → 30 tầng  (thêm 10 lần chạm)
  Cây B:         3 →  4 tầng  (thêm ĐÚNG 1 lần chạm)
```

Đây mới là chỗ đáng sợ: **cây B không chỉ thấp hơn, nó còn cao lên chậm hơn rất nhiều**. Bảng của bạn to lên nghìn lần thì nó chỉ dày thêm một tầng.

> **Thẻ thứ hai úp xuống.** Đơn vị đọc nhỏ nhất là **cả một rãnh**, nên nút phải to bằng đúng đơn vị đó. Cây **thấp và béo** thay vì cao và gầy.

## Ràng buộc thứ ba: vì sao không nạp hết cây vào bộ nhớ?

Câu hỏi rất hợp lý. Nạp hết vào RAM thì chạm đĩa 0 lần, cây nhị phân lại thắng.

Vấn đề: **bộ nhớ chính của máy thời đó đo bằng vài trăm KB**. Còn index của một bảng lớn đã hàng chục MB. Tỷ lệ giữa bộ nhớ và dữ liệu rơi vào cỡ **1 phần vài trăm**.

```text
  ┌──────┐
  │ bàn  │  ← bộ nhớ: vài trăm KB, đủ chỗ cho vài trang đang mở
  └──────┘
  ┌──────────────────────────────────────────────────────┐
  │  NHÀ KHO — to gấp vài trăm lần cái bàn                │
  │  (index hàng chục MB, mọi thứ bắt buộc phải nằm đây)  │
  └──────────────────────────────────────────────────────┘
```

Nên phương án "nạp hết vào bộ nhớ rồi dùng cây nhị phân" là **bất khả**. Không phải vì chậm, mà vì **không đủ chỗ**. Cây bắt buộc phải **sống trên đĩa** và bị sửa **ngay tại chỗ nó nằm**.

Cây nằm trên đĩa, bộ nhớ chỉ giữ nổi vài trang, mà dữ liệu thì thêm mới mỗi ngày. Dưới ràng buộc đó, bạn giữ cho cây cân bằng bằng cách nào?

Bạn **không dựng lại cả cây** — dựng lại nghĩa là đọc và ghi hàng chục MB, tức hàng nghìn lần chạm đĩa. Bạn để mỗi nút **tự tách đôi khi đầy**, và **tự gộp với hàng xóm khi vơi**. Cây giữ thăng bằng bằng những **sửa chữa cục bộ**, mỗi lần chỉ chạm vài trang.

```text
Nút đầy (800/800), thêm khoá mới:

   ┌──────────────────────┐         ┌──────┐  khoá giữa đẩy lên cha
   │ ..... 800 khoá ..... │   →     │ 400  │ ← ─ ─ ─ ─ ─ ─
   └──────────────────────┘         └──┬───┘
                              ┌────────┴────────┐
                        ┌─────▼─────┐     ┌─────▼─────┐
                        │ 400 khoá  │     │ 400 khoá  │
                        └───────────┘     └───────────┘

  Chỉ chạm 3 trang: nút cũ, nút mới, nút cha. Không phải cả cây.
  Cây cao thêm 1 tầng CHỈ KHI nút gốc bị tách — hiếm, và đó là lý do
  cây B luôn cân bằng hoàn hảo mà không cần xoay như AVL.
```

> **Thẻ thứ ba úp xuống.** Bộ nhớ nhỏ hơn dữ liệu vài trăm lần, nên cây phải **sống trên đĩa** và **tự cân bằng tại chỗ** bằng tách/gộp cục bộ.

Và cái quyết định đã tự hiện ra, không cần ai tuyên bố:

> **Một nút = Một lần đọc đĩa = Một trang đầy khoá.**

## Phần vui: ba ràng buộc đó, hôm nay còn lại bao nhiêu?

**Thẻ thứ nhất — 38 ms một lần chạm.** Từ khoảng 2015, máy chủ gần như hết đĩa quay. Ổ thể rắn tra một trang trong khoảng **100 micro giây**.

```text
38 ms  →  0,1 ms      nhanh hơn ~380 lần
```

**Đóng dấu hết hiệu lực.**

**Thẻ thứ ba — bộ nhớ bé hơn dữ liệu vài trăm lần.** Bộ nhớ máy chủ hôm nay hàng trăm GB, thừa sức ôm trọn index của phần lớn bảng nghiệp vụ. **Đóng dấu hết hiệu lực.**

**Thẻ thứ hai — cầm con dấu lên và không đóng xuống được.**

Vì ràng buộc đó **chưa bao giờ biến mất, nó chỉ đổi tên**:

```text
1970  rãnh đĩa            13.030 byte
1990  trang hệ điều hành   4.096 byte
2005  trang PostgreSQL     8.192 byte   (InnoDB: 16.384)
2010  trang SSD (NAND)     4.096 – 16.384 byte
nay   dòng bộ nhớ đệm CPU     64 byte
nay   trang NVMe                512 – 4.096 byte

  Từ rãnh → trang → dòng đệm:
  máy vẫn CHƯA BAO GIỜ đọc được 1 byte.
```

Ổ thể rắn vẫn đọc theo trang. Hệ điều hành vẫn phân trang. Con chip vẫn nạp bộ nhớ đệm theo dòng 64 byte. Và cây B là **cấu trúc duy nhất được dựng quanh đúng đơn vị đó**.

> **Lý do cũ hết hạn, cái quyết định thì không.**

Đây là bài học lớn hơn cả cây B: một quyết định kỹ thuật sống lâu không phải vì nó thông minh, mà vì nó **bám vào ràng buộc bền nhất** trong đống ràng buộc lúc đó. Hai kỹ sư năm 1970 vô tình cưới đúng cái ràng buộc chưa chết.

## Hôm nay chuyện này đổi cái gì trong code của bạn

Ba hệ quả trực tiếp, đo được ngay hôm nay.

### 1. Khoá index càng hẹp, cây càng thấp

Một trang 8 KB nhồi được bao nhiêu khoá phụ thuộc **kích thước khoá**:

```text
Trang 8 KB (trừ header còn ~8.000 byte dùng được):

  khoá BIGINT (8 byte + ~12 byte overhead)  → ~400 khoá/trang
  khoá UUID   (16 byte + overhead)          → ~285 khoá/trang
  khoá VARCHAR(100) trung bình 60 byte      → ~110 khoá/trang
  khoá VARCHAR(500) trung bình 300 byte     → ~26 khoá/trang
```

Với 100 triệu dòng:

| Khoá | Fanout | Số tầng | Lần đọc trang |
|---|---|---|---|
| `BIGINT` | 400 | `log₄₀₀(1e8)` ≈ 3,1 → **4** | 4 |
| `UUID` | 285 | `log₂₈₅(1e8)` ≈ 3,3 → **4** | 4 |
| `VARCHAR(500)` | 26 | `log₂₆(1e8)` ≈ 5,7 → **6** | 6 |

Chênh 2 tầng nghe nhỏ, nhưng đó là **50% số lần đọc trang cho mọi truy vấn, mãi mãi** — cộng với index to gấp nhiều lần, ăn hết buffer pool.

```sql
-- Cột chuỗi rất dài mà chỉ tra bằng "=": đừng index thẳng cột đó
CREATE INDEX idx_docs_url ON docs (url);              -- khoá có thể vài trăm byte

-- Index trên băm của nó: khoá luôn 16 byte, cây thấp hơn hẳn
CREATE INDEX idx_docs_url_md5 ON docs (md5(url));
SELECT * FROM docs WHERE md5(url) = md5('https://...') AND url = 'https://...';
--                                                       ▲
--                       vẫn so lại bản gốc để loại trùng băm (hiếm, nhưng có)
```

MySQL/InnoDB còn có trần cứng: khoá index tối đa **3072 byte** (`DYNAMIC` row format) — vượt là báo lỗi thẳng. Chi tiết ở [phase-5 bài 3](../phase-5/03-chuoi-varchar-text-va-do-dai-khoa-index.md).

### 2. Khoá ngẫu nhiên làm bẩn đúng cái đơn vị trang

Đây là hệ quả trực tiếp thứ hai của "đơn vị là trang". Nếu khoá tăng dần, mọi dòng mới rơi vào **cùng một trang bên phải cây** — trang đó đang nằm sẵn trong RAM.

```text
Khoá tăng dần (BIGINT, UUID v7):
  ...  ghi ghi ghi ghi → [ trang cuối ]   ← luôn nóng trong RAM
                                             1 trang bẩn mỗi lần ghi

Khoá ngẫu nhiên (UUID v4):
  ghi → [trang 4.812]   ┐
  ghi → [trang    17]   │  mỗi lần một trang KHÁC, phải đọc từ đĩa lên,
  ghi → [trang 9.003]   │  sửa, rồi ghi xuống. Trang nào cũng bẩn.
  ghi → [trang 1.244]   ┘  → tách trang (page split) liên tục, index phình
```

Ngưỡng lật là lúc index không còn vừa RAM. Đầy đủ ở [phase-5 bài 5](../phase-5/05-khoa-chinh-auto-increment-uuid-v4-hay-v7.md).

### 3. Lần sau nghe ai nói "cấu trúc này là logarit", hãy hỏi tiếp hai câu

> **"Cơ số mấy?"** và **"Mỗi bậc chạm vào cái gì?"**

Vì `O(log n)` giấu mất đúng hai thứ quyết định tất cả. Cơ số 2 với cơ số 400 là hai thế giới. Và một bậc chạm vào RAM với một bậc chạm vào đĩa chênh nhau mười nghìn lần.

```text
"Cả hai đều O(log n)" — cùng một câu, hai thực tế:

  cây nhị phân trên đĩa : 20 bậc × 38 ms   = 760 ms
  cây B trên đĩa        :  3 bậc × 38 ms   = 114 ms
  cây B trên SSD        :  3 bậc × 0,1 ms  = 0,3 ms
  cây B trong RAM       :  3 bậc × 0,0001 ms ≈ 0,0003 ms
```

Big-O nói cho bạn **hình dạng của đường cong**, không nói **đơn vị của trục tung**. Bài [phase-3 bài 2](../phase-3/02-doc-hieu-execution-plan.md) là chỗ bạn nhìn thấy đơn vị đó bằng con số thật.

## B+Tree: bản nâng cấp mà database thật sự dùng

Một chi tiết hay bị hỏi vặn: thứ nằm trong PostgreSQL/InnoDB không phải cây B nguyên bản, mà là **B+Tree**.

| | Cây B (1970) | B+Tree (thứ database dùng) |
|---|---|---|
| Nút trong chứa dữ liệu? | Có | **Không**, chỉ chứa khoá dẫn đường |
| Dữ liệu nằm ở đâu | Rải khắp mọi tầng | **Chỉ ở tầng lá** |
| Lá nối nhau? | Không | **Có, nối đôi thành danh sách** |
| Quét khoảng (`BETWEEN`) | Phải đi lên đi xuống cây | Nhảy tới lá đầu rồi **đi ngang** |
| Fanout | Thấp hơn (nút chứa cả dữ liệu) | **Cao hơn** → cây thấp hơn |

```text
B+Tree:
                  ┌──────────────┐
                  │  50  │  100  │        ← chỉ khoá dẫn đường
                  └──┬───┴───┬───┘
          ┌──────────┘       └────────┐
    ┌─────▼─────┐              ┌──────▼─────┐
    │ 10 │ 25   │              │ 120 │ 160  │
    └──┬─┴──┬───┘              └────────────┘
   ┌───▼──┐ ┌▼─────┐
   │10→ptr│→│25→ptr│→ ... ← LÁ NỐI ĐÔI (đây là chữ "+")
   └──────┘ └──────┘
```

Chữ "+" chính là thứ khiến `BETWEEN`, `>`, `ORDER BY ... LIMIT 20` gần như miễn phí: nhảy tới lá đầu tiên rồi **đi ngang theo dây chuyền**, không quay lên cây lần nào. Đó cũng là lý do bài 3 sẽ cho thấy hash index mất trắng nhóm truy vấn này.

## Bốn thứ PostgreSQL đã thêm vào cây B mà bạn đang hưởng miễn phí

Cây B năm 1970 và cây B trong máy bạn không giống hệt nhau. Bốn cải tiến sau đều **âm thầm**, đều đo được, và đều là câu trả lời tốt cho *"bạn có đọc release note không?"*.

### 1. Tách trang chệch phải (rightmost split) — từ rất sớm

Tách nút "công bằng" là chia 50/50. Nhưng khi khoá **tăng dần** (`BIGSERIAL`, `created_at`), mọi lần chèn đều rơi vào lá ngoài cùng bên phải. Chia 50/50 ở đó là lãng phí: nửa trái sẽ **không bao giờ** nhận thêm dòng nào nữa.

```text
Chia 50/50 ở lá phải cùng:        Chia chệch (90/10):
  [400][400]                        [720][80]
   ▲ nửa này chết cứng ở 50%         ▲ lấp gần đầy rồi mới bỏ lại

  → index phình gần gấp đôi          → index gọn, ít trang hơn ~40%
```

Đây là một lý do nữa (ngoài lý do "bẩn nhiều trang" ở phần trước) khiến **khoá tăng dần thắng khoá ngẫu nhiên**.

### 2. Cắt đuôi khoá dẫn đường (suffix truncation) — PostgreSQL 12

Nút trong **không cần khoá đầy đủ**, nó chỉ cần đủ để **phân biệt hai nhánh**.

```text
Hai lá cạnh nhau:
   lá trái  cuối cùng: 'nguyen_van_an_hanoi_2024'
   lá phải  đầu tiên : 'nguyen_van_binh_hue_2023'

Khoá dẫn đường ở nút cha:
   TRƯỚC PG12: 'nguyen_van_binh_hue_2023'   (24 byte, chép nguyên)
   TỪ  PG12  : 'nguyen_van_b'               (12 byte, cắt ngay khi đủ phân biệt)

  → khoá dẫn đường hẹp đi → FANOUT CAO HƠN → cây thấp hơn
```

Với index trên cột chuỗi dài, cải tiến này một mình đã giảm cỡ index **10-30%**.

### 3. Khử trùng lặp (deduplication) — PostgreSQL 13

Cột có nhiều giá trị lặp — `trang_thai`, `khach_id` trên bảng đơn hàng — thì lá cũ lưu giá trị đó **lặp đi lặp lại**:

```text
TRƯỚC PG13:  ('paid', ctid1) ('paid', ctid2) ('paid', ctid3) ... × 20.000
TỪ  PG13  :  ('paid', [ctid1, ctid2, ctid3, ... ])   ← một mục, danh sách ctid nén

  → index trên cột lặp nhiều nhỏ đi 2-5 lần.
```

```sql
-- Bật/tắt cho từng index (mặc định BẬT với btree không unique)
CREATE INDEX ... WITH (deduplicate_items = on);
```

Đây cũng là lý do lời khuyên *"đừng index cột ít giá trị"* đã **mềm đi** so với mười năm trước: index đó giờ rẻ hơn nhiều về dung lượng — dù vấn đề độ chọn lọc ở [bài 4](04-bitmap-index-va-cot-it-gia-tri.md) thì vẫn nguyên.

### 4. Đường tắt chèn cuối (fastpath) — PostgreSQL 11

Khi khoá tăng dần, PostgreSQL **nhớ lá ngoài cùng bên phải** và chèn thẳng vào đó, bỏ qua việc đi cây từ gốc.

```text
Chèn thường  : gốc → tầng 2 → tầng 3 → lá     (4 lần đọc trang)
Chèn fastpath: → lá đã ghim sẵn               (1 lần đọc trang)
```

Nghĩa là **khoá tăng dần rẻ hơn khoá ngẫu nhiên ở cả ba mặt**: ít trang bẩn hơn, tách trang gọn hơn, và ít lần đọc trang hơn khi chèn. Ba lý do độc lập cho cùng một lời khuyên.

---

## Phần mở rộng: khi phần cứng đổi câu hỏi thì câu trả lời cũng đổi — LSM-tree

Bài này khép lại bằng một câu: *"ràng buộc nào trong quyết định bạn viết hôm nay sẽ hết hiệu lực trước?"*. Có một câu trả lời rất cụ thể cho chính cây B — và nó đã xảy ra rồi.

Cây B tối ưu cho một giả định: **đọc và ghi đắt như nhau**. Đúng với đĩa quay, vì cả hai đều là một lần dịch cần gạt.

Với SSD, giả định đó **vỡ**:

```text
SSD (NAND flash):
  đọc  một trang 4 KB   :  ~100 µs
  ghi  một trang 4 KB   :  ~300 µs  (chậm hơn 3 lần)
  XOÁ  một khối 256 KB  : ~2.000 µs (phải xoá CẢ KHỐI mới ghi đè được)

  → GHI NGẪU NHIÊN đắt hơn ĐỌC ngẫu nhiên rất nhiều,
    và mỗi ô nhớ chỉ chịu được vài nghìn lần ghi rồi hỏng.
```

Dưới ràng buộc mới đó, cây B lộ ra một cái giá mà năm 1970 không ai quan tâm: **khuếch đại ghi (write amplification)**.

```text
Ghi MỘT dòng 100 byte vào bảng có cây B:

  1. sửa lá của index          → làm bẩn cả trang 8 KB
  2. có thể tách trang         → làm bẩn thêm 2-3 trang nữa
  3. WAL ghi "full page write" → chép NGUYÊN trang 8 KB vào WAL
                                  (bắt buộc, để chống rách trang khi mất điện)
  4. checkpoint ghi trang đó xuống đĩa

  100 byte dữ liệu  →  16-40 KB thật sự ghi xuống đĩa
                       khuếch đại ~200-400 lần
```

### LSM-tree: đổi hẳn chiến lược

**LSM-tree** (*Log-Structured Merge-tree*) trả lời câu hỏi ngược lại: *"nếu ghi ngẫu nhiên đắt, thì đừng ghi ngẫu nhiên nữa."*

```text
1. GHI vào bảng trong RAM (memtable — thường là skip list)     ← 0 lần chạm đĩa
   kèm một dòng nối vào WAL để không mất khi cúp điện           ← ghi TUẦN TỰ

2. Memtable đầy → đổ nguyên khối xuống đĩa thành một tệp
   ĐÃ SẮP SẴN, CHỈ ĐỌC, không bao giờ sửa lại (SSTable)         ← ghi TUẦN TỰ

3. Các tệp tích lại nhiều thì trộn dần thành tệp lớn hơn
   (compaction) — chạy nền, cũng ghi tuần tự

   ┌──────────────┐
   │ memtable RAM │
   └──────┬───────┘  đổ xuống
   L0     ├── [ss] [ss] [ss] [ss]      ← nhiều tệp nhỏ, khoảng khoá chồng nhau
   L1     ├── [────ss────][────ss────] ← đã trộn, khoảng khoá rời nhau
   L2     ├── [──────────ss──────────]
   L3     └── ...                       mỗi tầng to gấp ~10 tầng trên
```

**Ghi thì rẻ tuyệt đối.** Nhưng **đọc thì phải trả tiền**:

```text
Tìm khoá X: có thể nằm ở memtable, hoặc bất kỳ tệp nào trong L0..L6
  → phải hỏi lần lượt từ mới nhất tới cũ nhất
  → "khuếch đại đọc" (read amplification)

Cứu bằng BỘ LỌC BLOOM: mỗi tệp mang một bộ lọc trả lời
  "khoá này CHẮC CHẮN KHÔNG có" hoặc "CÓ THỂ có"
  → bỏ qua ~99% số tệp mà không mở tệp nào.
  (Cùng ý tưởng với BRIN bloom opclass ở bài 5 — và cũng chấp nhận sai dương.)
```

### Bảng đối chiếu — và đây mới là phần đáng thuộc

| | B-Tree | LSM-Tree |
|---|---|---|
| Ghi | Sửa **tại chỗ**, ngẫu nhiên | **Chỉ nối thêm**, tuần tự |
| Khuếch đại ghi | Cao (~200-400× ở mức trang) | Thấp lúc ghi, nhưng compaction ghi lại 10-30× tổng cộng |
| Đọc một khoá | **3-4 lần đọc trang, ổn định** | Nhiều tệp phải hỏi; bloom filter cứu phần lớn |
| Đọc theo khoảng | **Rất tốt** (lá nối đôi) | Kém hơn: phải trộn kết quả từ nhiều tầng |
| Dung lượng | Có chỗ trống trong trang (~30% lãng phí) | **Nén rất tốt**, tệp chỉ đọc nên nén cả khối |
| Đỉnh trễ | Đều | **Gai** khi compaction chạy |
| Xoá | Xoá thật (rồi `VACUUM`) | Ghi một **bia mộ** (tombstone), dọn sau |
| Ai dùng | PostgreSQL, MySQL, Oracle, SQL Server | RocksDB, Cassandra, ScyllaDB, HBase, LevelDB, TiKV, ClickHouse (một phần) |

### Khi nào cái nào thắng

```text
  Tỷ lệ ghi/đọc cao, khoá ghi rải khắp không gian   → LSM
  (log sự kiện, chuỗi thời gian, hàng đợi, đếm lượt)

  Đọc nhiều, cần độ trễ ổn định, nhiều truy vấn khoảng
  và giao dịch phức tạp                              → B-Tree

  Muốn cả hai?  → PostgreSQL + phân vùng theo thời gian,
                  hoặc tách phần ghi nặng sang một hệ LSM riêng
```

Một chi tiết đáng nhớ cho phỏng vấn: **MySQL có thể chạy LSM** bằng engine **MyRocks** (Facebook đưa RocksDB vào MySQL) — họ dùng nó cho tầng lưu trữ chính vì tiết kiệm dung lượng và tuổi thọ SSD, đổi lại đọc theo khoảng chậm hơn InnoDB.

### Và đây là chỗ nối lại với đầu bài

Cây B thắng năm 1970 vì nó **hỏi phần cứng trước khi hỏi lý thuyết**. LSM-tree thắng ở chỗ nó làm **đúng như vậy, với phần cứng khác**.

```text
1970 : "chạm đĩa 38 ms, đọc và ghi đắt như nhau"   →  cây B
2010 : "SSD ghi ngẫu nhiên đắt và làm mòn ô nhớ"   →  LSM-tree
20xx : "ràng buộc nào tiếp theo?"                   →  câu trả lời tiếp theo
```

Cả hai đều không phải "cấu trúc đúng". Cả hai đều là **câu trả lời đúng cho một bộ ràng buộc**. Khi bộ ràng buộc đổi, câu trả lời phải đổi theo — còn đoạn mã thì thường vẫn nằm đó.

## Câu hỏi phỏng vấn

**"Vì sao database dùng B-Tree mà không dùng cây nhị phân cân bằng?"**
Đừng trả lời *"vì nó nhanh hơn"* — sai, cây nhị phân ít phép so hơn. Trả lời bằng **đơn vị đo**: chi phí thật không phải phép so mà là **số lần đọc trang**; đơn vị đọc nhỏ nhất của mọi tầng lưu trữ là một trang (4-16 KB), nên nút phải to bằng một trang; fanout vài trăm kéo cây từ 20 tầng xuống 3-4 tầng. Nói thêm được câu *"và ràng buộc trang vẫn còn nguyên hôm nay dù đĩa quay đã chết"* là điểm cộng lớn.

**"Có index rồi, thêm dữ liệu gấp 1000 lần thì query chậm đi bao nhiêu?"**
Gần như không đổi: cây chỉ dày thêm 1-2 tầng (`log₄₀₀(1000) ≈ 1,15`). Thứ chậm đi là **ghi** (nhiều tách trang hơn) và **cache hit** (index không còn vừa RAM). Đây là câu trả lời phân biệt người đã đo với người đọc lý thuyết.

**"Bảng nhỏ vài trăm dòng có nên đánh index không?"**
Thường không. Vài trăm dòng nằm gọn trong 1-2 trang; quét tuần tự tốn 1-2 lần đọc, còn đi cây tốn 3 lần đọc index cộng heap fetch. Optimizer bỏ index ở đây là **đúng**, không phải lỗi.

**"Vì sao khoá chính nên nhỏ?"**
Hai lý do, nói cả hai mới đủ. (1) Khoá hẹp → fanout cao → cây thấp → ít lần đọc trang. (2) Với InnoDB, **mọi secondary index đều mang theo giá trị khoá chính**, nên khoá chính 36 byte (`UUID` dạng chuỗi) làm phình *tất cả* các index khác của bảng.

**"Cassandra/RocksDB dùng LSM-tree thay vì B-Tree, vì sao?"**
Vì bộ ràng buộc phần cứng đã đổi: trên SSD, **ghi ngẫu nhiên đắt hơn đọc ngẫu nhiên** và còn làm mòn ô nhớ. B-Tree sửa **tại chỗ** nên mỗi lần ghi 100 byte có thể kéo theo 16-40 KB xuống đĩa (trang bẩn + full page write vào WAL). LSM chỉ **nối thêm** và ghi tuần tự, đổi lại phải hỏi nhiều tệp lúc đọc — cứu bằng bộ lọc Bloom — và có gai độ trễ khi compaction chạy. Nói được câu chốt là ăn điểm: **cả hai đều không phải "cấu trúc đúng", chúng là câu trả lời đúng cho hai bộ ràng buộc khác nhau.**

**"Vì sao khoá tăng dần tốt hơn khoá ngẫu nhiên?"**
Ba lý do độc lập, nói được cả ba là hiếm: (1) mọi lần chèn rơi vào **một trang đang nóng trong RAM** thay vì rải khắp; (2) PostgreSQL **tách trang chệch phải** (90/10 thay vì 50/50) ở lá ngoài cùng nên index gọn hơn ~40%; (3) từ PG 11 có **fastpath** ghim sẵn lá phải cùng, chèn chỉ tốn 1 lần đọc trang thay vì 4.

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| Đo hiệu năng index bằng số phép so sánh | Chi phí thật là **số lần đọc trang**; phép so gần như miễn phí |
| "SSD nhanh rồi, cấu trúc không còn quan trọng" | SSD giết thẻ 1, không giết thẻ 2. Đơn vị trang vẫn còn, dòng đệm CPU 64 byte cũng vậy |
| "RAM lớn rồi, nạp hết vào bộ nhớ là xong" | Trong RAM vẫn có phân cấp bộ nhớ đệm; cấu trúc thân thiện với dòng đệm vẫn thắng |
| Nghĩ B-Tree và B+Tree là một | B+Tree mới là thứ database dùng; chữ "+" là lý do quét khoảng rẻ |
| Index cột `TEXT` dài rồi thắc mắc sao index to hơn bảng | Khoá rộng → fanout thấp → nhiều tầng, nhiều trang |
| Nghĩ cây B "tự cân bằng" giống AVL | AVL xoay nút; cây B **tách và gộp**, không xoay — vì xoay trên đĩa quá đắt |

## Tóm tắt bài 2

- Cây B ra đời **1970** tại Boeing (Bayer & McCreight), dưới ba ràng buộc phần cứng: chạm đĩa 38 ms, đơn vị đọc là **cả một rãnh 13.030 byte**, và bộ nhớ nhỏ hơn dữ liệu vài trăm lần.
- Cây nhị phân **ít phép so hơn** nhưng **nhiều tầng hơn**, mà tầng mới là thứ tốn tiền. Đổi đơn vị đo là đổi cả câu trả lời.
- Quyết định gói trong một dòng: **một nút = một lần đọc đĩa = một trang đầy khoá**. Fanout vài trăm kéo 20 tầng xuống 3 tầng.
- Hôm nay **hai trong ba ràng buộc đã chết** (đĩa quay, RAM bé). Ràng buộc còn lại — **máy không đọc được 1 byte** — chưa bao giờ mất, chỉ đổi tên từ rãnh sang trang sang dòng đệm 64 byte.
- Ba hệ quả cho code hôm nay: **khoá hẹp → cây thấp**; **khoá ngẫu nhiên → bẩn nhiều trang**; và nghe "logarit" thì hỏi tiếp **"cơ số mấy, mỗi bậc chạm cái gì"**.
- Bốn cải tiến âm thầm bạn đang hưởng: **tách chệch phải**, **cắt đuôi khoá dẫn đường** (PG 12), **khử trùng lặp** (PG 13), **fastpath chèn cuối** (PG 11) — ba trong bốn cái đều thưởng cho **khoá tăng dần**.
- **LSM-tree** là câu trả lời cho cùng câu hỏi với phần cứng khác: SSD làm ghi ngẫu nhiên đắt hơn đọc, nên đổi từ *sửa tại chỗ* sang *chỉ nối thêm*. Trả giá bằng khuếch đại đọc (cứu bằng bloom filter), đọc khoảng kém hơn, và gai độ trễ lúc compaction.
- Cây B không thắng vì nó thông minh hơn. Nó thắng vì **hỏi phần cứng trước khi hỏi lý thuyết** — và LSM-tree thắng vì làm **đúng như vậy, với bộ ràng buộc mới**.

> Câu để lại: **ràng buộc nào trong quyết định bạn viết hôm nay sẽ hết hiệu lực trước, mà đoạn mã thì vẫn còn đó?**

**Bài kế tiếp** → [Bài 3: Hash index và cái giá của việc bỏ thứ tự](03-hash-index-va-cai-gia-cua-viec-bo-thu-tu.md)
