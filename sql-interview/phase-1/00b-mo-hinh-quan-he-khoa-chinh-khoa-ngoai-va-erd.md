# Bài 0b: Mô hình quan hệ — khoá chính, khoá ngoại và sơ đồ ERD

Hai sinh viên **cùng tên** Nguyễn Văn An, **cùng khoa** Công nghệ thông tin, **cùng năm sinh**.

Giờ bạn cầm bảng điểm, phải nhập con 8.5 cho bạn An. Nhưng là **An nào** trong hai người?

Bạn gõ tên "An" vào hệ thống để tìm. Kết quả: **hai dòng y hệt nhau**. Máy tính nhìn hai con người mà chỉ thấy đúng một cái tên. Nó chịu, không tài nào phân biệt được.

Đây mới là chỗ đau:

> **Cái tên không phải là danh tính.**

Bài này giải quyết đúng vấn đề đó, và nó là **nền móng** của mọi thứ bạn sẽ học sau: JOIN, quan hệ giữa các bảng, và cách đọc sơ đồ thiết kế của một hệ thống.

## Giải nghĩa thuật ngữ trước khi bắt đầu

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Key** | ki | **Khoá** — cột dùng để định danh một hàng |
| **Primary Key** (PK) | prai-ma-ri ki | **Khoá chính** — định danh duy nhất một hàng trong bảng của nó |
| **Foreign Key** (FK) | pho-rin ki | **Khoá ngoại** — cột trỏ sang khoá chính của bảng khác |
| **Row / Record** | rau | **Hàng / Bản ghi** — một dòng dữ liệu |
| **Column / Field** | co-lăm | **Cột / Trường** — một thuộc tính |
| **Relationship** | ri-lây-shân-ship | **Quan hệ** — mối liên kết giữa hai bảng |
| **One-to-Many** | oăn-tu-me-ni | **Một-nhiều** — một bên có nhiều bên kia |
| **Many-to-Many** | me-ni-tu-me-ni | **Nhiều-nhiều** — cả hai chiều đều "nhiều" |
| **Junction Table** | jăng-shân | **Bảng trung gian** — bảng thứ ba đứng giữa để gỡ quan hệ nhiều-nhiều |
| **ERD** (*Entity-Relationship Diagram*) | i-a-di | **Sơ đồ quan hệ thực thể** — bản đồ vẽ các bảng và đường nối |
| **Crow's foot** | cro-phút | **Chân chim** — ký hiệu ba nhánh xoè ra, đánh dấu đầu "nhiều" |
| **Normalization** | nor-ma-lai-zê-shân | **Chuẩn hoá** — tách dữ liệu ra để mỗi sự thật chỉ nằm một chỗ |

## Phần 1: Khoá chính — mỗi hàng một danh tính

### Khoá là gì?

**Khoá** (tiếng Anh: *Key*) là một cột trong bảng dùng để **chỉ đích danh một hàng**, không lẫn vào đâu được.

Những cái khoá như vậy ngoài đời bạn gặp suốt ngày:

```text
   • Số căn cước công dân   → mỗi công dân MỘT số
   • Mã số sinh viên        → mỗi sinh viên MỘT mã
   • Biển số xe             → mỗi chiếc xe MỘT biển
   • Mã đơn hàng            → mỗi đơn MỘT mã

   ĐIỂM CHUNG: mỗi giá trị chỉ thuộc về ĐÚNG MỘT đối tượng.
               Không ai xài trùng.
```

Quay lại hai bạn An. Ta thêm một cột `ma_sv`:

```text
   TRƯỚC — máy không phân biệt được
   ┌─────────────────┬──────────────┬──────────┐
   │ ho_ten          │ khoa         │ nam_sinh │
   ├─────────────────┼──────────────┼──────────┤
   │ Nguyễn Văn An   │ CNTT         │ 2005     │  ← ai?
   │ Nguyễn Văn An   │ CNTT         │ 2005     │  ← ai?
   └─────────────────┴──────────────┴──────────┘

   SAU — mỗi người một mã riêng
   ┌────────┬─────────────────┬──────────┬──────────┐
   │ ma_sv  │ ho_ten          │ khoa     │ nam_sinh │
   ├────────┼─────────────────┼──────────┼──────────┤
   │ SV001  │ Nguyễn Văn An   │ CNTT     │ 2005     │  ← rõ ràng
   │ SV002  │ Nguyễn Văn An   │ CNTT     │ 2005     │  ← rõ ràng
   └────────┴─────────────────┴──────────┴──────────┘

   Chỉ vậy thôi. Hai cái tên giống hệt lập tức tách thành hai người.
   Điểm nhập cho SV001 không tài nào lạc sang SV002.
```

### Khoá chính có đúng hai điều kiện

**Khoá chính** (*Primary Key*) là cột định danh **duy nhất** một hàng. Chữ "duy nhất" gồm **hai điều kiện**, và cả hai đều bắt buộc:

```text
   ĐIỀU KIỆN 1 — KHÔNG ĐƯỢC TRÙNG

      Mọi giá trị trong cột phải khác nhau.
      SV001, SV002, SV003... không có hai hàng nào chung một mã.

   ĐIỀU KIỆN 2 — KHÔNG ĐƯỢC ĐỂ TRỐNG

      Lý do rất đời: cái khoá để trống thì mở được cửa nào?
      Không định danh nổi ai thì đâu còn là khoá.
```

Thử phá luật xem database phản ứng thế nào:

```sql
CREATE TABLE sinh_vien (
    ma_sv    TEXT PRIMARY KEY,      -- ◄── khai báo khoá chính ở đây
    ho_ten   TEXT NOT NULL,
    khoa     TEXT,
    nam_sinh INT
);

INSERT INTO sinh_vien VALUES ('SV001', 'Nguyễn Văn An', 'CNTT', 2005);   -- ✅ OK

-- Cố chèn lại mã SV001 đã có
INSERT INTO sinh_vien VALUES ('SV001', 'Trần Thị Bình', 'Kinh tế', 2006);
```

```text
ERROR:  duplicate key value violates unique constraint "sinh_vien_pkey"
DETAIL: Key (ma_sv)=(SV001) already exists.
```

**Database chặn ngay tại cửa.** Hàng vừa chèn bị bật ngược trở ra. Không phải code của bạn kiểm tra — mà chính database từ chối.

```sql
-- Thử để trống khoá chính
INSERT INTO sinh_vien VALUES (NULL, 'Lê Văn Cường', 'CNTT', 2005);
-- ERROR: null value in column "ma_sv" violates not-null constraint
```

> `PRIMARY KEY` là cách viết tắt của `NOT NULL` + `UNIQUE` gộp lại. Khai một từ, database tự áp cả hai luật.

### Vì sao khoá chính quan trọng đến vậy?

Bởi vì lát nữa, **các bảng khác sẽ trỏ về nó**.

```text
   Khoá chính chính là ĐỊA CHỈ của mỗi hàng.
   Có địa chỉ rồi thì bảng khác mới biết đường tìm đến.
```

Giữ ý này trong đầu — phần tiếp theo dựa hết vào đây.

## Phần 2: Vì sao phải tách bảng?

Sang chuyện điểm số. Mỗi sinh viên học mấy chục môn, mỗi môn một con điểm. Câu hỏi tưởng dễ mà hoá khó: **đống điểm đó lưu vào đâu?**

### Cách sai: nhét thẳng vào bảng sinh viên

```text
   ┌────────┬───────────┬──────────┬─────────┬────────┬────────┬─────┐
   │ ma_sv  │ ho_ten    │ diem_toan│ diem_ly │ diem_hoa│ diem_van│ ... │
   ├────────┼───────────┼──────────┼─────────┼────────┼────────┼─────┤
   │ SV001  │ Văn An    │   8.5    │   7.0   │        │        │     │
   │ SV002  │ Thị Bình  │   9.0    │         │   6.5  │        │     │
   └────────┴───────────┴──────────┴─────────┴────────┴────────┴─────┘

   HẬU QUẢ:
   ✗ 40 môn = 40 cột. Bảng phình ngang, tràn khỏi màn hình.
   ✗ Sinh viên năm nhất chưa học mấy môn → hàng loạt ô trống, nhìn nham nhở.
   ✗ Trường mở thêm MỘT môn mới → phải SỬA LẠI CẤU TRÚC cả bảng khổng lồ.
   ✗ Một sinh viên học lại môn đó lần hai thì lưu ở đâu?

   → Cách này sai từ gốc.
```

### Cách đúng: tách điểm ra một bảng riêng

```text
   BẢNG sinh_vien                      BẢNG diem
   ┌────────┬───────────┐              ┌────────┬──────────┬──────┐
   │ ma_sv  │ ho_ten    │              │ ma_sv  │ ten_mon  │ diem │
   ├────────┼───────────┤              ├────────┼──────────┼──────┤
   │ SV001  │ Văn An    │              │ SV001  │ Toán     │ 8.5  │
   │ SV002  │ Thị Bình  │              │ SV001  │ Lý       │ 7.0  │
   └────────┴───────────┘              │ SV001  │ Hoá      │ 9.0  │
                                        │ SV002  │ Toán     │ 9.0  │
                                        └────────┴──────────┴──────┘

   Bảng điểm gọn gàng chỉ 3 cột.
   Mỗi lần thi một môn → thêm ĐÚNG MỘT HÀNG. Không đụng vào cấu trúc.
```

Việc tách bảng như thế này có tên riêng: **chuẩn hoá** (*normalization*). Nguyên tắc cốt lõi của nó chỉ một câu:

> **Mỗi sự thật chỉ nằm ở một chỗ.**

Tên "Nguyễn Văn An" chỉ được viết **một lần** trong bảng `sinh_vien`. Nếu bạn viết nó ở 40 dòng điểm, thì hôm đổi tên bạn phải sửa 40 chỗ — và chỗ nào quên thì dữ liệu mâu thuẫn.

## Phần 3: Khoá ngoại — sợi chỉ khâu hai bảng

Bảng điểm tách riêng rồi, **làm sao nó biết hàng điểm này là của ai?**

Nhìn kỹ: cột `ma_sv` xuất hiện ở **cả hai bảng**. Đó không phải trùng hợp — **đó là chỗ móc nối**.

```text
   BẢNG sinh_vien                       BẢNG diem
   ┌────────┬───────────┐               ┌────────┬──────────┬──────┐
   │ ma_sv  │ ho_ten    │               │ ma_sv  │ ten_mon  │ diem │
   ├────────┼───────────┤               ├────────┼──────────┼──────┤
   │ SV001  │ Văn An    │◄══════════════│ SV001  │ Toán     │ 8.5  │
   │ SV002  │ Thị Bình  │◄══╗           │ SV001  │ Lý       │ 7.0  │
   └────────┴───────────┘   ║           │ SV001  │ Hoá      │ 9.0  │
        ▲                    ╚═══════════│ SV002  │ Toán     │ 9.0  │
        │                                └────────┴──────────┴──────┘
   KHOÁ CHÍNH                                 ▲
   (định danh trong bảng mình)           KHOÁ NGOẠI
                                    (trỏ NGƯỢC về khoá chính bảng kia)
```

Cột trỏ đi như vậy tên là **khoá ngoại** (*Foreign Key*). Nó chính là **sợi chỉ khâu** giữ cho dữ liệu ở hai bảng khác nhau vẫn luôn tìm được nhau.

```sql
CREATE TABLE diem (
    diem_id  SERIAL PRIMARY KEY,
    ma_sv    TEXT NOT NULL REFERENCES sinh_vien(ma_sv),   -- ◄── KHOÁ NGOẠI
    ten_mon  TEXT NOT NULL,
    diem     NUMERIC(3,1)
);
```

Đọc dòng đó thành tiếng Việt: *"cột `ma_sv` trong bảng `diem` **phải tham chiếu tới** cột `ma_sv` của bảng `sinh_vien`"*.

### Khoá ngoại không chỉ nối — nó còn ÉP bạn giữ dữ liệu đúng

Thử chèn một dòng điểm cho sinh viên **không tồn tại**:

```sql
INSERT INTO diem (ma_sv, ten_mon, diem) VALUES ('SV999', 'Toán', 8.0);
```

```text
ERROR:  insert or update on table "diem" violates foreign key constraint
DETAIL: Key (ma_sv)=(SV999) is not present in table "sinh_vien".
```

**Database từ chối.** Không thể tồn tại một dòng điểm trỏ về một người không có thật.

### Mặt trái: sợi dây khâu cũng là sợi dây trói

```text
   Bạn xoá sinh viên SV001 khỏi bảng sinh_vien.
   Nhưng bên bảng diem vẫn còn 3 dòng mang mã SV001.

   → Ba dòng đó bỗng thành MỒ CÔI, trỏ về một người không còn tồn tại.
```

Database không cho chuyện đó xảy ra. Nó bắt bạn **chọn trước** sẽ xử lý thế nào:

| Cách xử lý | Nghĩa là | Nên dùng khi |
|---|---|---|
| `ON DELETE RESTRICT` | **Chặn**, không cho xoá sinh viên nếu còn điểm | **Mặc định nên chọn** — dữ liệu nghiệp vụ |
| `ON DELETE CASCADE` | Xoá sinh viên thì **xoá luôn** mọi dòng điểm | Quan hệ sở hữu chặt (đơn hàng → dòng đơn hàng) |
| `ON DELETE SET NULL` | Đặt `ma_sv` về `NULL`, giữ dòng điểm lại | Quan hệ lỏng (nhân viên → phòng ban đã giải thể) |

```sql
ma_sv TEXT NOT NULL REFERENCES sinh_vien(ma_sv) ON DELETE RESTRICT
```

> **Cẩn thận với `CASCADE`.** Xoá một khách hàng có thể kéo theo hàng nghìn đơn hàng, và bạn **không thấy con số đó trước khi bấm Enter**. Mặc định nên là `RESTRICT`.

Cái giá của khoá ngoại: bạn phải thiết kế quan hệ cho đúng **ngay từ đầu** và nghĩ trước cả thứ tự xoá. Đổi lại, **dữ liệu của bạn không bao giờ lạc mất nhau**.

## Phần 4: Đọc sơ đồ quan hệ (ERD)

Lùi ra xa nhìn toàn cảnh. Bốn bảng, nối với nhau bằng các đường khoá ngoại. Bức tranh đó gọi là **sơ đồ quan hệ thực thể** (*Entity-Relationship Diagram*, viết tắt **ERD**).

### Ký hiệu chân chim — chỉ cần nhớ hai hình

```text
   ĐẦU "MỘT"                        ĐẦU "NHIỀU"
   một gạch đứng cắt ngang          ba nhánh xoè ra như CHÂN CON CHIM

        ──┼──                             ──<
                                       (crow's foot)
```

Chỉ hai ký hiệu đó thôi. Và cách đọc thì gần như đọc tiếng Việt:

```text
   ┌───────────┐                    ┌─────────┐
   │ sinh_vien │──┼──────────────< │  diem   │
   └───────────┘                    └─────────┘
        ▲                                ▲
      đầu MỘT                        đầu NHIỀU
      (gạch đứng)                    (chân chim)

   QUY TẮC ĐỌC MỌI SƠ ĐỒ ERD TRÊN ĐỜI:

      Đặt ngón tay ở đầu GẠCH ĐỨNG, nói: "MỘT sinh viên..."
      Trượt sang đầu CHÂN CHIM,     nói: "...có NHIỀU dòng điểm."

   Chỉ vậy thôi!
```

Đọc ngược lại cũng đúng: *"mỗi dòng điểm thuộc về **một** sinh viên"*.

### Mẹo nhớ đời

```text
   KHOÁ NGOẠI LUÔN NẰM Ở PHÍA "NHIỀU".

   Tìm được cột khoá ngoại là tìm ra đầu chân chim.
   Và ngược lại: thấy chân chim ở đâu, biết ngay khoá ngoại nằm ở bảng đó.
```

Thử với vài ví dụ khác cho quen:

| Quan hệ | Đọc là | Khoá ngoại nằm ở |
|---|---|---|
| Khoa — Sinh viên | Một khoa có nhiều sinh viên | Bảng `sinh_vien` (cột `ma_khoa`) |
| Khách hàng — Đơn hàng | Một khách có nhiều đơn | Bảng `orders` (cột `customer_id`) |
| Đơn hàng — Dòng đơn hàng | Một đơn có nhiều dòng | Bảng `order_items` (cột `order_id`) |
| Môn học — Điểm | Một môn có nhiều dòng điểm | Bảng `diem` (cột `ma_mon`) |

> **Chốt phần 4:** quan hệ **một-nhiều** là quan hệ phổ biến nhất, và cũng dễ nhất — chỉ cần thêm **đúng một cột khoá ngoại đặt bên phía "nhiều"** là xong.

## Phần 5: Quan hệ nhiều-nhiều và bảng trung gian

Và đây là chỗ người mới hay vấp nhất.

```text
   • Một sinh viên học NHIỀU môn.
   • Lật ngược lại: một môn học cũng có RẤT NHIỀU sinh viên theo học!

   CẢ HAI CHIỀU ĐỀU LÀ "NHIỀU".
   → Quan hệ NHIỀU - NHIỀU (Many-to-Many).
```

### Thử nối thẳng hai bảng xem sao

```text
   sinh_vien                              mon_hoc
   ┌────────┐   ╱────────────────────►  ┌────────┐
   │ SV001  │──┼──╲──────────────────►  │ Toán   │
   ├────────┤   ╲  ╲─────────────────►  ├────────┤
   │ SV002  │────╲──╲────────────────►  │ Lý     │
   ├────────┤     ╲──╲───────────────►  ├────────┤
   │ SV003  │──────╲──╲──────────────►  │ Hoá    │
   └────────┘                            └────────┘

   → MỘT BÚI DÂY RỐI. Không quản lý nổi.
```

Thử đặt khoá ngoại vào một trong hai bảng:

```text
   Đặt cột ma_mon vào bảng sinh_vien?
      → Một ô chỉ chứa được MỘT mã môn. Mà An học 40 môn!

   Đặt cột ma_sv vào bảng mon_hoc?
      → Cũng vậy. Môn Toán có 500 sinh viên, nhét sao vào một ô?

   ĐẶT Ở ĐÂU CŨNG SAI — vì MỘT Ô KHÔNG NHÉT NỔI NHIỀU GIÁ TRỊ.
```

### Lời giải: bảng thứ ba đứng chen vào giữa

```text
                    ┌──────────────────┐
   ┌───────────┐    │ BẢNG TRUNG GIAN  │    ┌──────────┐
   │ sinh_vien │──┼─┤      diem        ├─<──┼│ mon_hoc  │
   └───────────┘  ▲ │ ma_sv  │ ma_mon  │  ▲ └──────────┘
                  │ │ SV001  │ Toán    │  │
              đầu MỘT│ SV001  │ Lý      │ đầu MỘT
                    │ SV002  │ Toán    │
                    └──────────────────┘
                            ▲▲
                    HAI đầu chân chim cùng trỏ vào đây
                    → DẤU HIỆU CHUẨN của bảng trung gian!

   Mỗi dòng của bảng trung gian ghi ĐÚNG MỘT CẶP: [một sinh viên, một môn].
   Búi dây tự gỡ ra!
```

**Quan hệ nhiều-nhiều biến mất**, thay vào đó là **hai quan hệ một-nhiều nối tiếp nhau**:

```text
   sinh_vien (1) ──────< (nhiều) diem (nhiều) >────── (1) mon_hoc
```

```sql
CREATE TABLE diem (
    ma_sv   TEXT NOT NULL REFERENCES sinh_vien(ma_sv),
    ma_mon  TEXT NOT NULL REFERENCES mon_hoc(ma_mon),
    diem    NUMERIC(3,1),
    PRIMARY KEY (ma_sv, ma_mon)      -- ◄── khoá chính GHÉP từ hai khoá ngoại
);
```

Dòng `PRIMARY KEY (ma_sv, ma_mon)` gọi là **khoá chính ghép** (*composite key*). Nó đảm bảo: **một sinh viên chỉ có đúng một dòng cho một môn** — không thể chèn hai lần điểm Toán cho cùng một người.

> **Bất ngờ:** bảng `diem` mà bạn dùng suốt từ đầu bài **chính là bảng trung gian đó**! Nó giữ hai cột khoá ngoại, cộng thêm một cột dữ liệu riêng là `diem`.

Điều đó cho thấy một điểm hay: **bảng trung gian được phép mang thêm dữ liệu của chính nó** — điểm số, ngày đăng ký, số lượng, đơn giá.

```text
   VÍ DỤ TRONG THƯƠNG MẠI ĐIỆN TỬ — cùng một khuôn:

   orders (1) ──< order_items >── (1) products
                      ▲
              bảng trung gian, mang thêm:
              quantity (số lượng), unit_price (đơn giá lúc mua)

   Vì sao lưu unit_price ở đây mà không lấy từ products?
   → Vì giá sản phẩm THAY ĐỔI theo thời gian, còn hoá đơn cũ
     phải giữ đúng giá LÚC MUA. Đây là dữ liệu riêng của quan hệ.
```

> **Chốt phần 5:** **không có quan hệ nhiều-nhiều nào sống trực tiếp trong database quan hệ.** Nó luôn bị tách làm đôi bằng một **bảng trung gian**.

## Phần 6: Mỗi cạnh trên sơ đồ là một mệnh đề `ON`

Đây là phần đáng giá nhất, và là lý do bạn phải học đọc ERD.

```text
   SƠ ĐỒ ERD KHÔNG PHẢI HÌNH TRANG TRÍ TRONG TÀI LIỆU DỰ ÁN.
   NÓ LÀ BẢN ĐỒ ĐƯỜNG ĐI.

   Mỗi cạnh vẽ trên đó chính là MỘT CÂU JOIN mà bạn được phép viết.
```

```text
   ┌───────────┐        ┌─────────┐        ┌──────────┐
   │ sinh_vien │──┼───< │  diem   │ >───┼──│ mon_hoc  │
   └───────────┘        └─────────┘        └──────────┘
        cạnh 1                cạnh 2
```

Cạnh 1 → viết ra thành:

```sql
FROM diem d
JOIN sinh_vien s ON s.ma_sv = d.ma_sv
--                  ▲ chính là cạnh 1 trên sơ đồ
```

Cả hai cạnh → câu trả lời cho câu hỏi của sếp *"ai được 8.5?"*:

```sql
SELECT s.ho_ten, m.ten_mon, d.diem
FROM diem d
JOIN sinh_vien s ON s.ma_sv  = d.ma_sv      -- cạnh 1
JOIN mon_hoc   m ON m.ma_mon = d.ma_mon     -- cạnh 2
WHERE d.diem = 8.5;
```

```text
 ho_ten          | ten_mon          | diem
-----------------+------------------+------
 Trần Minh An    | Cơ sở dữ liệu    |  8.5
```

Thay vì `SV001 | CSDL01 | 8.5` — ba mã số khô khốc mà sếp không đọc được.

## Cạm bẫy: sợi dây có tác dụng phụ — nhân dòng

Đọc được sơ đồ **vẫn không cứu được một câu lệnh sai**. Vì sợi dây bạn vừa học có một tác dụng phụ mà gần như không ai nói với bạn ở buổi đầu tiên.

```text
   Mã SV001 có 3 dòng điểm.

   Khi JOIN sinh_vien với diem:

   ┌────────────────┬──────────┬──────┐
   │ Trần Minh An   │ Toán     │ 8.5  │  ← tên bị lặp
   │ Trần Minh An   │ Lý       │ 7.0  │  ← tên bị lặp
   │ Trần Minh An   │ Hoá      │ 9.0  │  ← tên bị lặp
   └────────────────┴──────────┴──────┘

   Đếm số dòng → được 3.
   Nhưng ngoài đời chỉ có 1 SINH VIÊN.
```

Hiện tượng này gọi là **nhân dòng** (*fanout*), và nó làm sai mọi phép `COUNT`, `SUM`, `AVG` chạy sau đó:

```sql
-- ❌ SAI: đếm ra 3, tưởng có 3 sinh viên
SELECT COUNT(*) FROM sinh_vien s JOIN diem d ON s.ma_sv = d.ma_sv;

-- ✅ ĐÚNG: đếm số sinh viên DUY NHẤT
SELECT COUNT(DISTINCT s.ma_sv) FROM sinh_vien s JOIN diem d ON s.ma_sv = d.ma_sv;
```

Và nếu **quên bảng trung gian** mà JOIN bừa hai bảng nhiều-nhiều:

```sql
-- ❌ THẢM HOẠ: không có điều kiện nối đúng
SELECT * FROM sinh_vien, mon_hoc;
-- 500 sinh viên × 40 môn = 20.000 dòng RÁC
-- và không có lấy một dòng nào có nghĩa
```

> **Đọc được sơ đồ mới chỉ là điều kiện CẦN.** Điều kiện **đủ** là luôn tự hỏi *"một hàng bên trái có thể khớp với mấy hàng bên phải?"* — **ngay trước khi bấm nút chạy**.

Bẫy này được mổ xẻ đầy đủ ở [bài 3](03-join-nang-cao-fanout-on-vs-where-va-thuat-toan-join.md).

## Chọn khoá chính thế nào cho tốt

| Kiểu khoá | Ví dụ | Ưu | Nhược |
|---|---|---|---|
| **Số tự tăng** | `1, 2, 3...` | Gọn, ghi nhanh, dễ đọc | Đoán được ID kế tiếp; không sinh được ở nhiều máy |
| **Mã nghiệp vụ** | `SV001`, `SKU-A12` | Con người đọc hiểu | **Có thể phải đổi** khi quy tắc đánh mã thay đổi |
| **UUID** | `f47ac10b-58cc-...` | Sinh được ở bất kỳ đâu, không đoán được | Tốn chỗ hơn, ghi chậm hơn nếu chọn sai loại |

**Lời khuyên thực dụng:** dùng một **khoá kỹ thuật** (số tự tăng hoặc UUID) làm khoá chính, và đặt `UNIQUE` cho mã nghiệp vụ.

```sql
CREATE TABLE sinh_vien (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- khoá kỹ thuật
    ma_sv    TEXT NOT NULL UNIQUE,                             -- mã nghiệp vụ
    ho_ten   TEXT NOT NULL
);
```

**Vì sao?** Vì mã nghiệp vụ **thay đổi được** — trường đổi quy tắc đánh mã, công ty đổi định dạng SKU. Nếu nó là khoá chính thì mọi khoá ngoại trỏ tới nó đều phải cập nhật theo. Còn khoá kỹ thuật thì **không bao giờ đổi**.

> Chủ đề này được đào sâu ở [phase-5 bài 5](../phase-5/05-khoa-chinh-auto-increment-uuid-v4-hay-v7.md).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Không có khoá chính | Không phân biệt được hàng trùng, không xoá/sửa chính xác được | Mọi bảng đều phải có PK |
| Dùng tên người làm khoá chính | Trùng tên là hỏng | Dùng mã hoặc ID kỹ thuật |
| Dùng mã nghiệp vụ làm PK | Đổi quy tắc mã → mọi FK phải sửa theo | PK kỹ thuật + `UNIQUE` cho mã |
| Nhét nhiều môn vào một cột (`"Toán,Lý,Hoá"`) | Không lọc, không đếm, không JOIN được | Tách bảng trung gian |
| Quên khoá ngoại | Dữ liệu mồ côi, đơn trỏ về khách không tồn tại | Khai `REFERENCES` |
| `ON DELETE CASCADE` mặc định | Xoá một dòng kéo theo hàng nghìn dòng | Mặc định `RESTRICT` |
| Nối thẳng hai bảng nhiều-nhiều | Búi dây rối, đặt FK ở đâu cũng sai | **Bảng trung gian** |
| Bảng trung gian không có khoá ghép | Chèn trùng cặp (hai dòng điểm Toán cho một người) | `PRIMARY KEY (a, b)` |
| JOIN xong `COUNT(*)` | Đếm sai vì **nhân dòng** | `COUNT(DISTINCT khoá)` |
| JOIN thiếu điều kiện `ON` | Tích Descartes, hàng chục nghìn dòng rác | Luôn viết `JOIN ... ON` |
| Coi ERD là hình trang trí | Không biết được phép JOIN theo đường nào | **Mỗi cạnh là một mệnh đề `ON`** |

## Câu hỏi phỏng vấn hay gặp

**H: Khoá chính là gì? Nó khác khoá ngoại thế nào?**
**Khoá chính** định danh duy nhất một hàng **trong bảng của nó** — hai điều kiện: không trùng và không để trống. **Khoá ngoại** là cột **trỏ sang** khoá chính của bảng khác, nó là sợi chỉ khâu hai bảng lại. Mẹo nhớ: khoá ngoại **luôn nằm ở phía "nhiều"** của quan hệ.

**H: Vì sao phải tách bảng thay vì gộp tất cả vào một?**
Vì **mỗi sự thật chỉ nên nằm ở một chỗ**. Nhét điểm vào bảng sinh viên thì 40 môn là 40 cột, thêm môn mới phải sửa cấu trúc cả bảng, và sinh viên năm nhất để trống hàng loạt ô. Quan trọng hơn: nếu tên sinh viên bị chép ở 40 dòng điểm thì hôm đổi tên bạn phải sửa 40 chỗ, và chỗ nào quên thì dữ liệu mâu thuẫn.

**H: Quan hệ nhiều-nhiều lưu thế nào?**
Không lưu trực tiếp được — vì đặt khoá ngoại ở bên nào cũng sai, một ô không nhét nổi nhiều giá trị. Phải tách bằng **bảng trung gian**: mỗi dòng ghi đúng một cặp, và quan hệ nhiều-nhiều biến thành **hai quan hệ một-nhiều nối tiếp**. Dấu hiệu nhận ra bảng trung gian trên sơ đồ là **hai đầu chân chim cùng trỏ vào nó**. Và bảng trung gian được phép mang dữ liệu riêng — như điểm số, hoặc `quantity` và `unit_price` trong `order_items`.

**H: Đọc sơ đồ ERD thế nào?**
Chỉ cần hai ký hiệu: **gạch đứng** là đầu "một", **chân chim** (ba nhánh xoè) là đầu "nhiều". Đặt ngón tay ở đầu gạch đứng nói *"một..."*, trượt sang đầu chân chim nói *"...có nhiều"*. Và điều quan trọng nhất: **mỗi cạnh trên sơ đồ chính là một mệnh đề `ON`** trong câu JOIN — ERD không phải hình trang trí, nó là bản đồ đường đi.

**H: Khoá ngoại có nhược điểm gì không?**
Có. Sợi dây khâu các bảng lại cũng là sợi dây trói tay bạn: bạn phải nghĩ trước **thứ tự xoá**, và phải thiết kế quan hệ đúng ngay từ đầu. Ngoài ra khoá ngoại có chi phí thật ở quy mô lớn — cột FK phải tự tạo index, và mỗi lần chèn bản ghi con đều phải kiểm tra bản ghi cha tồn tại. Đổi lại, **dữ liệu không bao giờ lạc mất nhau**.

**H: Nên dùng số tự tăng hay mã nghiệp vụ làm khoá chính?**
Em dùng **khoá kỹ thuật** (số tự tăng hoặc UUID) làm khoá chính, và đặt `UNIQUE` cho mã nghiệp vụ. Lý do: mã nghiệp vụ **thay đổi được** — trường đổi quy tắc đánh mã, công ty đổi định dạng SKU — và nếu nó là khoá chính thì mọi khoá ngoại trỏ tới đều phải cập nhật theo. Khoá kỹ thuật thì không bao giờ đổi.

## Tóm tắt bài 0b

- **Cái tên không phải là danh tính** — cần một **khoá** để chỉ đích danh một hàng.
- **Khoá chính** = **không trùng** + **không để trống**. Nó chính là **địa chỉ** để bảng khác tìm tới.
- **Tách bảng** để **mỗi sự thật chỉ nằm một chỗ**; **khoá ngoại** là sợi chỉ khâu chúng lại.
- Khoá ngoại không chỉ nối — nó **ép dữ liệu nhất quán**, chặn bản ghi mồ côi. Mặc định `ON DELETE RESTRICT`, cẩn thận với `CASCADE`.
- Đọc ERD chỉ cần hai ký hiệu: **gạch đứng = một**, **chân chim = nhiều**. **Khoá ngoại luôn nằm phía "nhiều"**.
- **Nhiều-nhiều không sống trực tiếp được** — luôn tách bằng **bảng trung gian**, và bảng đó được phép mang dữ liệu riêng.
- **Mỗi cạnh trên ERD là một mệnh đề `ON`** — sơ đồ là bản đồ đường đi, không phải hình trang trí.
- Đọc được sơ đồ mới là điều kiện **cần**; điều kiện **đủ** là luôn hỏi *"một hàng trái khớp mấy hàng phải?"* để không bị **nhân dòng**.

**Bài kế tiếp** → [Bài 1: Vì sao 8/10 ứng viên trượt vòng SQL](01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md)
