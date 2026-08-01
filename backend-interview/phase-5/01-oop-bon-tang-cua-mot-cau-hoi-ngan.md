# Bài 1: OOP — bốn tầng của một câu hỏi ngắn

Bạn vừa ngồi xuống, ghế còn ấm. Người phỏng vấn gấp hồ sơ lại, ngẩng lên, hỏi đúng một câu:

> *"Lập trình hướng đối tượng là gì?"*

Không mẹo, không đánh đố, không có chữ nào lạ. Vậy mà nó vẫn loại người đều đặn ở mọi vòng phỏng vấn.

**Câu trả lời của bạn gần như chắc chắn đúng. Và bạn vẫn trượt.**

Vì thứ họ chấm nằm ở **tầng dưới** của câu hỏi. Bài này đi hết bốn tầng đó — và mô hình bốn tầng này áp dụng cho **mọi** câu hỏi phỏng vấn kỹ thuật, không riêng OOP.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **OOP** (*Object-Oriented Programming*) | **Lập trình hướng đối tượng** |
| **Class / Object** | **Lớp** (bản thiết kế) / **Đối tượng** (thứ tạo ra từ bản thiết kế) |
| **Encapsulation** | **Đóng gói** — giấu chi tiết bên trong |
| **Inheritance** | **Kế thừa** — lớp con lấy lại đặc điểm của lớp cha |
| **Polymorphism** | **Đa hình** — cùng một lời gọi, nhiều hành vi khác nhau |
| **Abstraction** | **Trừu tượng** — chỉ phơi ra thứ cần thiết |
| **Composition** | **Chứa** — đối tượng này giữ đối tượng kia bên trong |
| **Invariant** | **Bất biến** — quy tắc luôn phải đúng với đối tượng |
| **Coupling** | **Độ dính** — mức độ phụ thuộc lẫn nhau |
| **LSP** (*Liskov Substitution Principle*) | Lớp con phải thay thế được lớp cha ở mọi chỗ |

## Tầng 1: Định nghĩa — ai cũng qua được, không ai được điểm

**Bạn trả lời:**

> *"Hướng đối tượng là cách gom **dữ liệu** và **hành vi** vào một đối tượng, có bốn tính chất: đóng gói, kế thừa, đa hình, trừu tượng."*

Đúng. Sách nào cũng viết vậy, thầy nào cũng dạy vậy. Nếu là bài kiểm tra viết, bạn được điểm tối đa.

**Tiếc là đây không phải bài kiểm tra.**

```text
   Nhìn vào cuốn sổ của người phỏng vấn mà xem:
   cả câu trả lời vừa rồi chỉ đọng lại BA CHỮ "thuộc định nghĩa".

   Ba chữ đó chưa đủ để quyết định thuê ai.

   Định nghĩa trả lời câu:  "NÓ LÀ GÌ?"
   Người phỏng vấn cần biết: "BẠN ĐÃ LÀM ĐƯỢC GÌ VỚI NÓ?"

   Hai câu hỏi hoàn toàn khác nhau.
```

Nên họ không dừng ở đó. Họ đào tiếp — và mỗi tầng là một câu hỏi mà câu trả lời vừa rồi **không với tới**.

## Tầng 2: "Đóng gói là giấu cái gì?"

Người phỏng vấn đặt bút xuống, ngồi thẳng lên, hỏi câu thứ hai. **Ngắn hơn câu đầu, và không hỏi định nghĩa nữa.**

> *"Bạn vừa nói đóng gói là che dữ liệu. Vậy che khỏi ai? Và che cái gì trong đó?"*

**Bạn trả lời:** *"Để các thuộc tính ở chế độ `private`, rồi viết getter và setter."*

Đúng sách. Ai cũng học vậy. Và gần như ai cũng dừng lại ở đây.

```java
// Đây là cái lớp hay gặp nhất trong mọi dự án
public class TaiKhoan {
    private BigDecimal soDu;
    private String chuTaiKhoan;
    // ... 8 thuộc tính nữa

    public BigDecimal getSoDu()            { return soDu; }
    public void setSoDu(BigDecimal soDu)   { this.soDu = soDu; }
    public String getChuTaiKhoan()         { return chuTaiKhoan; }
    public void setChuTaiKhoan(String c)   { this.chuTaiKhoan = c; }
    // ... 16 hàm nữa
}
```

**Nhìn rất đúng bài. Giờ đếm thử xem nó bảo vệ được bao nhiêu quy tắc.**

```text
   KHÔNG QUY TẮC NÀO CẢ.

   Vì có setter thì AI CŨNG GÁN ĐƯỢC:
      taiKhoan.setSoDu(new BigDecimal("-500000"));
   → Chương trình chạy ngon lành. Không một tiếng kêu.

   Cái lớp vừa "che dữ liệu" xong lại ĐỂ NGỎ CỬA SAU.
```

> **Đóng gói không phải là giấu BIẾN. Đóng gói là giấu QUY TẮC.**

```java
// ✅ Bỏ hàm gán đi. Chỉ để lại HÀNH VI có nghĩa.
public class TaiKhoan {
    private BigDecimal soDu;

    public void rutTien(BigDecimal soTien) {
        if (soTien.signum() <= 0)
            throw new IllegalArgumentException("Số tiền phải dương");
        if (soDu.compareTo(soTien) < 0)
            throw new SoDuKhongDuException(soDu, soTien);   // ◄── BIẾT TỪ CHỐI
        soDu = soDu.subtract(soTien);
    }

    public void napTien(BigDecimal soTien) { ... }
    public BigDecimal getSoDu()            { return soDu; }   // đọc thì được
}
```

```text
   Hàm rutTien BIẾT TỪ CHỐI khi không đủ tiền.
   Hàm setSoDu thì KHÔNG.

   Đó là toàn bộ khác biệt.
```

**Và đây là con số — thứ tầng 2 thật sự đòi hỏi:**

```text
   Trong một dự án cũ, số dư bị sửa ở 17 CHỖ khác nhau.
   Bỏ hàm gán đi → chỉ còn ĐÚNG MỘT CHỖ.

   Một chỗ để sửa. Một chỗ để tìm khi có lỗi.
   17 → 1.
```

Người phỏng vấn ghi dòng thứ hai: *"giấu quy tắc, không phải giấu biến. 17 chỗ còn 1."*

## Tầng 3: "Kế thừa hay chứa? Chọn đi, và nói vì sao."

Chú ý: câu này **không hỏi định nghĩa**. Nó bắt bạn **chọn**.

> *"Bạn có một lớp cần dùng lại phần đã viết ở lớp khác. Kế thừa hay chứa nó bên trong?"*

**Bạn chọn kế thừa.** Lý do ai cũng thuộc: *"kế thừa để dùng lại, khỏi viết hai lần."*

Nghe rất hợp lý. Và nó cũng là **cái bẫy quen thuộc nhất của hướng đối tượng**.

```text
   Cây kế thừa mọc lên rất nhanh:

              ThanhToan
                  │
        ┌─────────┼─────────┐
       The     ViDienTu   TienMat
        │         │          │
        └── dùng chung hàm hoanTien() của cha ──┘

   Một buổi chiều là xong. Ai cũng vui.
```

```text
   Rồi tới thứ Hai tuần sau:

   TIỀN MẶT KHÔNG HOÀN ĐƯỢC QUA HỆ THỐNG — phải ra quầy.

   Lớp TienMat buộc phải viết đè hàm hoanTien(),
   rồi ném ra một lỗi "không hỗ trợ".
```

```java
class TienMat extends ThanhToan {
    @Override
    public void hoanTien(BigDecimal soTien) {
        throw new UnsupportedOperationException("Tiền mặt phải hoàn tại quầy");
        //     ▲ ĐÂY LÀ BÁO ĐỘNG
    }
}
```

```text
   VÌ SAO ĐÂY LÀ BÁO ĐỘNG?

   Vì lớp con vừa NÓI DỐI.
   Nó nhận mình LÀ MỘT ThanhToan,
   nhưng lại KHÔNG LÀM ĐƯỢC việc của một ThanhToan.

   → Vi phạm nguyên tắc THAY THẾ (Liskov Substitution Principle):
     ở đâu dùng được lớp cha thì phải dùng được lớp con.

   Hệ quả thực tế: mọi đoạn code nhận ThanhToan giờ phải nhớ
   "à, trừ TienMat ra" — và chỗ nào quên là chỗ đó nổ.
```

**Lời giải: dùng CHỨA thay vì KẾ THỪA.**

```java
// ✅ Không nhận vơ là con của ai cả
class DonHang {
    private final MayTinhPhi mayTinhPhi;      // ◄── CHỨA một thứ nó cần

    public DonHang(MayTinhPhi mayTinhPhi) {
        this.mayTinhPhi = mayTinhPhi;
    }

    public BigDecimal tongTien() {
        return giaGoc.add(mayTinhPhi.tinh(giaGoc));   // chỉ GỌI đúng thứ cần
    }
}
```

```text
   ✓ Chỉ gọi đúng thứ nó cần, không nhận vơ là con của ai
   ✓ Lớp cha đổi gì cũng KHÔNG LÔI NÓ THEO
   ✓ Đổi cách tính phí lúc chạy được (truyền máy tính phí khác vào)
```

**Đánh đổi phải nói ra đủ hai vế:**

```text
   Kế thừa cho bạn DÙNG LẠI 40 dòng.
   Đổi lại nó KHOÁ 9 LỚP CON vào hình dạng của lớp cha.

   NGƯỠNG LẬT nằm ở đây:
      Nếu lớp con phải VIẾT ĐÈ để VÔ HIỆU HOÁ hàm của cha
      → chọn CHỨA.

   Nói gọn:  KẾ THỪA chỉ khi THAY THẾ ĐƯỢC.
             Còn DÙNG LẠI thì CHỨA.
```

Người phỏng vấn ghi dòng thứ ba: *"kế thừa chỉ khi thay thế được. 9 lớp con bị khoá."*

## Tầng 4: "Dự án bạn đang làm còn bao nhiêu chỗ rẽ nhánh theo loại?"

Câu cuối cùng, và ngắn nhất.

> *"Trong dự án bạn đang làm, còn bao nhiêu chỗ rẽ nhánh kiểu `if loại này thì làm thế này`? Đếm thật, đừng đoán."*

Bạn khựng lại. **Câu này không có trong sách** — vì nó hỏi **dự án của bạn**, không hỏi hướng đối tượng.

Cây bút bên kia cũng dừng. Không ai nói gì trong hai giây.

```java
// Chỗ hay gặp nhất — một rẽ nhánh theo 7 loại phí
// và cùng đoạn đó nằm ở 4 NƠI KHÁC NHAU:
//   DonHang.java, BaoCao.java, HoaDon.java, DoiSoat.java

if (loaiPhi == VAN_CHUYEN)      return tinhVanChuyen(...);
else if (loaiPhi == DICH_VU)    return tinhDichVu(...);
else if (loaiPhi == BAO_HIEM)   return tinhBaoHiem(...);
// ... 4 loại nữa
```

```text
   Sếp thêm LOẠI PHÍ THỨ 8.

   Bạn phải mở 4 chỗ đó ra sửa từng chỗ, và nhớ đủ cả 4.
   7 loại × 4 chỗ = 28 nhánh phải đọc.
   Quên MỘT chỗ là lỗi ra tới sản phẩm.
```

**Đây chính là bài toán mà ĐA HÌNH sinh ra để giải.**

```java
// ✅ Mỗi loại tự biết cách tính của mình
interface LoaiPhi {
    BigDecimal tinh(DonHang don);
}

class PhiVanChuyen implements LoaiPhi { public BigDecimal tinh(DonHang d) {...} }
class PhiDichVu    implements LoaiPhi { public BigDecimal tinh(DonHang d) {...} }
class PhiBaoHiem   implements LoaiPhi { public BigDecimal tinh(DonHang d) {...} }

// 4 chỗ rẽ nhánh giờ thành 4 dòng GIỐNG HỆT NHAU:
BigDecimal phi = loaiPhi.tinh(don);
```

```text
   Thêm loại phí thứ 8?
      → Viết MỘT lớp mới. KHÔNG ĐỘNG vào 4 chỗ cũ.

   28 nhánh → 0.

   Đây là nguyên tắc MỞ-ĐÓNG (Open-Closed):
      MỞ để mở rộng, ĐÓNG với sửa đổi.
```

Người phỏng vấn ghi dòng cuối: *"28 nhánh còn 0."*

## Nhìn lại cái thang

```text
   Đọc lại BA CÂU theo đúng thứ tự đã hỏi:

      ① "Đóng gói giấu cái gì?"
      ② "Kế thừa hay chứa, chọn đi."
      ③ "Còn mấy chỗ rẽ nhánh theo loại trong dự án của bạn?"

   Đọc dọc từ trên xuống:
      KHÔNG CÂU NÀO HỎI ĐỊNH NGHĨA.
      Cả ba đều hỏi cùng một kiểu: CÁI GÌ HỎNG, VÀ BẠN PHẢI SỬA MẤY CHỖ.

   Và ba câu trả lời được tính điểm đều là CON SỐ, không phải chữ:
      17 chỗ còn 1
      9 lớp con bị khoá
      28 nhánh còn 0

   → Thứ họ đo KHÔNG PHẢI "bạn biết gì về hướng đối tượng",
     mà là "BẠN ĐÃ TRẢ GIÁ CHO NÓ BAO GIỜ CHƯA".

   Đã từng sửa một cây kế thừa sai, hay mới chỉ ĐỌC về nó?

   Định nghĩa thì tra 10 giây là có. VẾT SẸO THÌ KHÔNG TRA ĐƯỢC.
```

**Nghe cách trả lời là biết:**

| Người chưa trả giá | Người đã trả giá |
|---|---|
| "Tuỳ dự án, tuỳ trường hợp" | "Ngưỡng lật là ở đây" |
| "Kế thừa để dùng lại code" | "Kế thừa chỉ khi thay thế được" |
| "Đóng gói là để private" | "Đóng gói là giấu quy tắc — 17 chỗ còn 1" |
| "Đa hình là nhiều hình dạng" | "Nó xoá 28 nhánh rẽ trong dự án của em" |

## Bốn tính chất — nhìn lại theo góc "nó giải bài toán gì"

| Tính chất | Định nghĩa sách | **Bài toán thật nó giải** |
|---|---|---|
| **Đóng gói** | Che dữ liệu | Số dư bị sửa ở 17 chỗ → còn 1 chỗ có kiểm tra |
| **Kế thừa** | Lớp con lấy lại của cha | Dùng lại code — **nhưng đổi lấy việc bị khoá vào hình dạng cha** |
| **Đa hình** | Nhiều hình dạng | 28 nhánh `if theo loại` rải rác → 0 |
| **Trừu tượng** | Chỉ phơi thứ cần | Đổi từ MySQL sang Postgres mà tầng nghiệp vụ không đổi dòng nào |

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Bạn có một lớp `User` với 15 thuộc tính, đủ getter/setter, và mọi logic nghiệp vụ nằm ở lớp `UserService`.

Đây là **anemic domain model** (mô hình thiếu máu) — đối tượng chỉ là túi đựng dữ liệu, không có hành vi nào.

```java
// ❌ Đối tượng không biết bảo vệ chính nó
class User {
    private String email;
    private String trangThai;
    // getter/setter đầy đủ
}

class UserService {
    void kichHoat(User u) {
        if (u.getTrangThai().equals("cho_duyet")) {     // quy tắc nằm Ở ĐÂY
            u.setTrangThai("hoat_dong");                 // và ở 5 service khác nữa
        }
    }
}
```

```java
// ✅ Đưa quy tắc VỀ chỗ dữ liệu sống
class User {
    private TrangThai trangThai;

    void kichHoat() {
        if (trangThai != TrangThai.CHO_DUYET)
            throw new ChuyenTrangThaiKhongHopLe(trangThai, TrangThai.HOAT_DONG);
        this.trangThai = TrangThai.HOAT_DONG;
    }
}
```

```text
   NHƯNG — và đây là phần trung thực:

   Anemic model KHÔNG PHẢI LÚC NÀO CŨNG SAI.
   Với ứng dụng CRUD đơn giản, nó gọn và dễ đọc hơn nhiều.

   NGƯỠNG LẬT:
      Khi cùng một quy tắc bắt đầu xuất hiện ở BA CHỖ trở lên
      → đưa nó vào đối tượng.
```

> **Tình huống 2:** Người phỏng vấn hỏi *"OOP có nhược điểm gì không?"* — câu hỏi kiểm tra bạn có tư duy phản biện hay chỉ học thuộc.

```text
   ✅ Câu trả lời cân bằng:

   "Có ba chỗ em thấy nó không phải lựa chọn tốt nhất.

    Một là CÂY KẾ THỪA SÂU — quá ba tầng thì để tìm xem một hàm
    thực sự chạy ở đâu, phải leo lên xuống cả cây. Đây là lý do
    lời khuyên hiện đại là 'ưu tiên chứa hơn kế thừa'.

    Hai là DỮ LIỆU VÀ HÀNH VI KHÔNG PHẢI LÚC NÀO CŨNG ĐI CÙNG NHAU.
    Với xử lý dữ liệu theo lô hay tính toán khoa học, kiểu hàm
    hoặc kiểu dữ liệu-hướng thường gọn hơn — dữ liệu là dữ liệu,
    hàm là hàm.

    Ba là TRẠNG THÁI CÓ THỂ THAY ĐỔI. Đối tượng giữ trạng thái bên trong
    thì trong môi trường nhiều luồng, nó là nguồn của rất nhiều lỗi
    khó tái hiện. Đó là lý do nhiều ngôn ngữ hiện đại đẩy mạnh
    đối tượng bất biến.

    Nên em không coi hướng đối tượng là chân lý. Em dùng nó khi có
    NHIỀU BIẾN THỂ CỦA CÙNG MỘT KHÁI NIỆM cần thay thế cho nhau —
    đó là lúc đa hình thật sự trả công."
```

> **Tình huống 3:** Team tranh cãi có nên tạo interface cho mọi service không.

```text
   ❌ "Tạo interface cho mọi thứ để dễ test và dễ thay thế"
      → 200 interface, mỗi cái đúng MỘT lớp cài đặt
      → mỗi lần đọc code phải nhảy qua một tầng vô nghĩa
      → đây gọi là "speculative generality" — trừu tượng cho tương lai
        chưa bao giờ tới

   ✅ Nguyên tắc thực dụng:
      Tạo interface khi CÓ THẬT hai cài đặt trở lên,
      hoặc khi ranh giới đó là ranh giới với THẾ GIỚI BÊN NGOÀI
      (database, cổng thanh toán, dịch vụ gửi mail) —
      vì bạn cần thay được nó khi test.

      Còn lại: thêm interface khi CẦN, không phải PHÒNG KHI CẦN.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Getter/setter cho mọi thuộc tính | Đóng gói chỉ là hình thức, không bảo vệ gì | Phơi ra **hành vi**, không phơi ra biến |
| Kế thừa để dùng lại code | Lớp con bị khoá vào hình dạng cha | Kế thừa chỉ khi **thay thế được** |
| Lớp con ném `UnsupportedOperation` | Vi phạm nguyên tắc thay thế | Đổi sang **chứa** |
| Cây kế thừa sâu quá 3 tầng | Không biết hàm thực sự chạy ở đâu | Ưu tiên chứa hơn kế thừa |
| `if theo loại` rải rác nhiều chỗ | Thêm loại mới phải sửa N chỗ, quên một là lỗi | **Đa hình** |
| Interface cho mọi service | 200 tầng trung gian vô nghĩa | Chỉ khi có ≥2 cài đặt hoặc là ranh giới ngoài |
| Anemic model cho nghiệp vụ phức tạp | Quy tắc lặp ở nhiều service | Đưa quy tắc vào đối tượng khi lặp ≥3 chỗ |
| Đối tượng có trạng thái đổi được, dùng đa luồng | Lỗi khó tái hiện | Ưu tiên đối tượng bất biến |
| Trả lời phỏng vấn bằng định nghĩa | Dừng ở tầng 1 | Kèm **con số** và **đánh đổi** |

## Câu hỏi phỏng vấn hay gặp

**H: Lập trình hướng đối tượng là gì?**
Là cách gom dữ liệu và hành vi vào một đối tượng, với bốn tính chất: đóng gói, kế thừa, đa hình, trừu tượng. Nhưng khi làm thật thì em nghĩ về chúng theo **bài toán chúng giải**: đóng gói để một quy tắc chỉ nằm ở một chỗ, đa hình để xoá các nhánh `if theo loại` rải rác, và kế thừa thì em rất dè dặt vì nó khoá lớp con vào hình dạng lớp cha.

**H: Đóng gói là giấu cái gì?**
**Giấu quy tắc, không phải giấu biến.** Một lớp có đủ getter/setter thì thực ra không bảo vệ được quy tắc nào — vì có setter thì ai cũng gán được số dư âm, và chương trình chạy ngon lành không một tiếng kêu. Cách đúng là bỏ hàm gán đi và chỉ phơi ra **hành vi có nghĩa** như `rutTien()` — vì `rutTien` biết từ chối khi không đủ tiền, còn `setSoDu` thì không. Trong một dự án cũ em từng có số dư bị sửa ở 17 chỗ; bỏ setter đi thì còn đúng một chỗ để sửa và một chỗ để tìm khi có lỗi.

**H: Kế thừa hay chứa?**
**Kế thừa chỉ khi thay thế được; còn dùng lại thì chứa.** Dấu hiệu để nhận ra mình chọn sai rất rõ: khi lớp con phải viết đè một hàm chỉ để **vô hiệu hoá** nó — ném ra `UnsupportedOperationException` chẳng hạn — thì lớp con đó đang nói dối, nó nhận là con của lớp cha mà không làm được việc của lớp cha. Đánh đổi đủ hai vế: kế thừa cho bạn dùng lại 40 dòng, đổi lại nó khoá mọi lớp con vào hình dạng của lớp cha.

**H: Đa hình giải quyết vấn đề gì?**
Nó xoá các nhánh **rẽ theo loại rải rác nhiều nơi**. Ví dụ thật: một hệ thống có 7 loại phí, và cùng đoạn `if` đó nằm ở 4 file khác nhau — thêm loại thứ 8 là phải mở đủ 4 chỗ và nhớ hết, quên một chỗ là lỗi ra tới sản phẩm. Với đa hình, mỗi loại tự biết cách tính của mình, và thêm loại mới chỉ là viết một lớp mới mà **không động vào chỗ nào cũ**. 28 nhánh còn 0. Đây chính là nguyên tắc mở-đóng.

**H: OOP có nhược điểm gì?**
Ba chỗ. **Cây kế thừa sâu** — quá ba tầng thì phải leo cả cây mới biết hàm nào thực sự chạy, và đó là lý do lời khuyên hiện đại là ưu tiên chứa hơn kế thừa. **Dữ liệu và hành vi không phải lúc nào cũng đi cùng nhau** — với xử lý theo lô hay tính toán khoa học thì kiểu hàm gọn hơn. **Trạng thái thay đổi được** là nguồn lỗi khó tái hiện trong môi trường nhiều luồng. Em dùng hướng đối tượng khi có **nhiều biến thể của cùng một khái niệm cần thay thế cho nhau** — đó là lúc đa hình thật sự trả công.

## Tóm tắt bài 1

- Mỗi câu hỏi ngắn là một **cái thang bốn bậc**; **tầng 1 không ai được điểm** — nó chỉ để loại người không biết gì.
- **Đóng gói là giấu QUY TẮC, không phải giấu biến.** Getter/setter đầy đủ = không bảo vệ gì. Phơi ra **hành vi biết từ chối**.
- **Kế thừa chỉ khi thay thế được; dùng lại thì chứa.** Dấu hiệu chọn sai: lớp con viết đè để **vô hiệu hoá** hàm của cha.
- **Đa hình** xoá các nhánh `if theo loại` rải rác — thêm loại mới không động vào code cũ (nguyên tắc mở-đóng).
- Interface chỉ tạo khi **có thật ≥2 cài đặt** hoặc là **ranh giới với thế giới bên ngoài** — không tạo phòng khi cần.
- Ba câu trả lời được tính điểm đều là **con số**: 17→1, 9 lớp bị khoá, 28→0.
- **Họ không hỏi bạn biết gì. Họ hỏi bạn đã mất gì.** Định nghĩa tra 10 giây là có; **vết sẹo thì không tra được**.

**Bài kế tiếp** → [Bài 2: Con trỏ và quản lý bộ nhớ](02-con-tro-va-quan-ly-bo-nho.md)
