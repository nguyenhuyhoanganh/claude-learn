Dưới đây là transcript toàn bộ nội dung của video:

---

## Transcript Nội Dung Video

**[00:00 - 00:26] Đặt vấn đề: Bài toán sập Session / Văng đăng nhập khi Deploy**

Vừa lên bản mới, 2.000 người bị đá ra khỏi tài khoản!

Người phỏng vấn xoay màn hình lại, kéo ghế ngồi xuống, rồi hỏi đúng một câu:

> *"Session lưu ở đâu?"*

Câu hỏi cũ tới mức nghe như một câu hỏi cho vui, hỏi để làm nóng trước khi vào phần khó. Nhưng không phải vậy đâu!

Bạn có 3 giây... Trả lời trong đầu đi: **3... 2... 1...**

Bạn vừa trả lời trong đầu rồi đúng không? Giữ lấy câu đó, cuối video ta soi lại xem nó còn thiếu mất cái gì.

---

**[00:26 - 00:40] Mức 1: "Lưu bộ nhớ máy chủ" (In-Memory Session)**

Ứng viên trả lời ngay, không nghĩ tới 1 giây:

> *"Lưu trong bộ nhớ của máy chủ, còn mã phiên (Session ID) thì để trong Cookie của trình duyệt người dùng."*

Nghe rất chuẩn! Người phỏng vấn gật đầu, ghi một dòng vào sổ: **[Biết Cookie - ĐÚNG]**.

Câu này đúng, khung (framework) nào cũng làm sẵn như vậy, nhưng nó **chưa đủ để qua vòng 2**.

---

**[00:40 - 01:18] Mức 2: Vấn đề Mất phiên khi mở rộng (Scaling - Sticky Session & Centralized Store)**

Rồi ông ấy vẽ thêm một máy chủ thứ hai lên bảng, nối cả hai máy vào một bộ cân bằng tải (Load Balancer), khoanh tròn cái máy vừa vẽ, rồi ngồi im nhìn thẳng vào bạn.

Hệ thống của bạn giờ chạy 2 máy y hệt nhau, cùng một bản mã nguồn. Vậy trong 100 lượt gọi tiếp theo, **bao nhiêu lượt sẽ bị mất đăng nhập?**

Đoán một con số trong đầu đi: **50%!**

Vì bộ nhớ của Máy 1 không có cái phiên mà Máy 2 vừa tạo ra. Người dùng đăng nhập rồi, tải lại trang rớt vào Máy 2 là bị văng ra!

Dán dính phiên vào một máy (Sticky Session) thì vá tạm được, nhưng lên bản mới nào cũng khởi động lại máy, và lúc đó thì **100% người dùng bị đá ra** (bộ nhớ máy bị xóa sạch).

Nên chỗ lưu phiên phải **nằm ngoài máy chủ** — một kho dùng chung (như Redis chẳng hạn), để máy nào đọc cũng thấy đúng cùng một phiên đó, không lệch nhau!

> **Tầng 1 - Mất phiên:** Bộ nhớ máy nào chỉ máy đó thấy. Thêm máy là mất đăng nhập. Đưa phiên ra kho dùng chung, đừng dán dính vào một máy.

---

**[01:18 - 01:48] Mức 3: Lỗi bảo mật Chiếm phiên (Session Fixation / Session Hijacking)**

Tốt! Giờ phiên đã nằm gọn trong kho dùng chung rồi.

Người dùng vừa gõ mật khẩu và đăng nhập thành công. **Mã phiên đó có đổi đi không?**

Ứng viên nói: *"Không, vẫn mã đó thôi!"*. Và đó chính là chỗ **mất tài khoản**!

Kẻ tấn công gửi trước cho nạn nhân một đường dẫn có sẵn mã phiên (Session Fixation):
`shop.vn/?sid=a91f7c`

Nạn nhân bấm vào rồi đăng nhập bình thường. Mã phiên không hề đổi, nên kẻ kia cầm đúng cái mã đó là vào thẳng tài khoản đã đăng nhập!

Sửa bằng đúng 1 dòng: **Đăng nhập xong thì hủy mã cũ và cấp mã mới** (`session.regenerate()`). Đổi quyền cũng cấp lại, cái mã cũ thành vô dụng ngay!

> **Tầng 2 - Cấp mã mới:** Mã phiên không đổi sau khi đăng nhập là mở cửa cho chiếm phiên. Hủy mã cũ và cấp lại ngay khi đăng nhập hoặc đổi quyền.

---

**[01:48 - 02:09] Đánh giá: Bạn dừng lại ở đâu?**

Nhìn lại 2 câu hỏi vừa rồi:

1. *Hai máy mất bao nhiêu?*
2. *Mã phiên có đổi không?*

Không câu nào hỏi lại chỗ lưu cả! Câu hỏi gốc chỉ hỏi *"Session lưu ở đâu?"*, nhưng thứ làm bạn mất tài khoản không phải là chỗ lưu, mà là **vòng đời của chính cái mã phiên đó**!

Thứ họ đo là **bạn dừng lại ở đâu**:

* ❌ Người dừng ở chỗ lưu: Trả lời xong trong 5 giây rồi dừng luôn.
* ✔️ Người đi hết vòng đời: Thêm 30 giây nữa giải thích trọn vẹn.

---

**[02:09 - End] Câu trả lời mẫu 30 giây & Checklist tổng kết**

Bốn dòng này là thứ đáng chụp màn hình nhất của cả video:

```text
- Mã phiên trong Cookie, dữ liệu ở kho dùng chung.
- Đừng lưu bộ nhớ máy, thêm máy là mất đăng nhập.
- Đăng nhập xong cấp mã mới, chống chiếm phiên.
- Đổi quyền cũng cấp lại, và đặt hạn cho phiên.

```

Hệ thống bạn đang làm, đăng nhập xong có cấp lại mã phiên không? Gõ xuống bình luận nhé!

---
Dưới đây là transcript toàn bộ nội dung của video về chủ đề **Xử lý Email trong Cơ sở Dữ liệu & Lập trình (Email Normalization / Lowercase)**, kèm theo checklist tổng kết ở cuối:

---

## Transcript Nội Dung Video

**[00:00 - 00:26] Đặt vấn đề: Hai tài khoản, một con người**

Hai dòng trong bảng người dùng, hai tài khoản mà cùng một con người:

* `An@shop.vn`
* `an@shop.vn`

Người phỏng vấn xoay màn hình lại, kéo ghế ngồi xuống, rồi hỏi đúng một câu:

> *"Email nên lưu nguyên hay hạ hết về chữ thường?"*

Nghe như câu hỏi dành cho người mới, ai cũng trả lời trong 3 giây. Nhưng đó chính là cái bẫy!

Bạn có 3 giây... Trả lời trong đầu đi: **3... 2... 1...**

Bạn vừa trả lời trong đầu rồi đúng không? Giữ lấy câu đó, cuối video ta soi lại xem nó còn thiếu mất cái gì.

---

**[00:26 - 00:40] Mức 1: "Hạ hết về chữ thường" (Lowercase Email)**

Ứng viên trả lời ngay, gọn gàng và tự tin:

> *"Hạ hết về chữ thường rồi mới lưu xuống, và đặt một ràng buộc duy nhất (`UNIQUE`) trên cột đó."*

```sql
email = lower(email)
-- UNIQUE (email)

```

Ai cũng làm thế!

Người phỏng vấn gật đầu, ghi một dòng vào sổ: **[Biết hạ chữ - ĐÚNG]**.

Câu này đúng, tài liệu nào cũng khuyên y như vậy, nhưng nó **vẫn chưa đủ để qua vòng 2**.

---

**[00:40 - 01:18] Mức 2: Cạm bẫy "Vào bằng cửa sau" (Lối ghi trực tiếp DB)**

Rồi ông ấy chỉ tay vào hai dòng đang nằm trên màn hình:

* Một dòng chữ `A` hoa (`An@shop.vn`)
* Một dòng chữ `a` thường (`an@shop.vn`)

Phần còn lại thì giống hệt nhau từng ký tự một.

Bạn hạ chữ ở tầng ứng dụng (Application), và ràng buộc duy nhất (`UNIQUE`) thì đã đặt sẵn từ đầu rồi. Vậy thì **two dòng y hệt nhau này chui được vào bảng bằng con đường nào?**

Trả lời đi... Bằng những đường **không đi qua hàm hạ chữ của bạn!**

* Một lần nhập dữ liệu hàng loạt (Bulk Import / Migration).
* Một trang quản trị cũ (Legacy Admin Panel).
* Hoặc một dịch vụ khác (Microservice) ghi trực tiếp vào Database.

Và ràng buộc duy nhất (`UNIQUE`) không kêu lấy một tiếng! Vì đối với CSDL, chữ `A` hoa và chữ `a` thường là **two chuỗi hoàn toàn khác nhau**.

> **Cách chữa (Cửa sau):** Đừng tin tầng ứng dụng nữa! Thêm một cột chuẩn hóa (ví dụ: `email_normalized`), rồi đặt ràng buộc `UNIQUE` trên chính cột đó để CSDL tự cưỡng chế.

---

**[01:18 - 01:48] Mức 3: Chuẩn RFC & Đặc thù của Nhà cung cấp (Gmail, Outlook)**

Tốt! Giờ mọi thứ đã hạ chữ thường hết rồi, sạch sẽ. Nhưng bạn có chắc là mọi nhà cung cấp thư (Email Provider) đều coi hai địa chỉ đó là một không?

Ứng viên ngập ngừng một nhịp...

Theo chuẩn RFC (RFC 5321):

* **Phần sau `@` (Domain):** Không phân biệt hoa thường.
* **Phần trước `@` (Local-part):** Do máy chủ nhận quyết định, và nó **ĐƯỢC PHÉP phân biệt hoa thường!**

Chưa hết, Gmail còn bỏ qua cả dấu chấm `.`. Một địa chỉ 10 ký tự có tới $2^9 = 512$ cách viết dấu chấm khác nhau (ví dụ: `a.n@gmail.com`, `an@gmail.com`, `a.n.g.m.a.i.l`), nhưng tất cả đều rơi vào đúng **một hộp thư duy nhất**!

> **Tầng 2 - Two cột:**
> * Cột `email` gốc: Giữ nguyên để gửi thư.
> * Cột `email_normalized`: Để so trùng.
> * Đừng tự chế luật riêng cho từng nhà cung cấp!
> 
> 

---

**[01:48 - 02:09] Đánh giá: Bạn đã trả giá chưa?**

Nhìn lại 2 câu hỏi vừa rồi:

1. *Vào bảng bằng đường nào?*
2. *Họ có coi là một không?*

Không câu nào hỏi tên hàm cả! Cả hai đều hỏi đúng một chuyện: **Bạn đang tự quyết định thay ai?** (Thay người dùng, thay CSDL, hay thay cả nhà cung cấp thư của họ?).

Thứ họ đo là **bạn đã trả giá chưa**:

* ❌ Người chỉ biết tên hàm (ai cũng biết).
* ✔️ Người đã từng ngồi gộp tay two tài khoản của cùng một người (đã trải nghiệm nỗi đau dữ liệu bẩn).

---

**[02:09 - End] Câu trả lời mẫu 30 giây & Checklist tổng kết**

Bốn dòng này là thứ đáng chụp màn hình nhất của cả video:

```text
- Hỏi trước: chuẩn hóa để so trùng hay để gửi thư?
- Lưu bản gốc để gửi, thêm cột chuẩn hóa để so.
- Ràng buộc duy nhất (UNIQUE) đặt trên cột chuẩn hóa.
- Đừng đoán luật riêng của từng nhà cung cấp.

```

Bảng người dùng của bạn, ràng buộc duy nhất (`UNIQUE`) đang nằm ở cột nào? Gõ xuống bình luận nhé!

---

Dưới đây là transcript toàn bộ nội dung audio/video của bạn:

---

## Transcript Nội Dung Video

**[00:00 - 00:28] Đặt vấn đề: IP bạn nhìn thấy không phải là IP thật**

IP của bạn không phải của bạn. Mở máy lên xem, nó ghi `192.168.1.7`. Con số đó chỉ có nghĩa trong nhà bạn, ra khỏi cửa là nó biến mất. Và bạn dùng chung địa chỉ thật với hàng nghìn người lạ.

Cái IP bạn nhìn thấy trong máy gần như không bao giờ là cái IP mà Internet nhìn thấy.

Trước khi tuyên án, ta chơi một ván nhỏ. 3 mốc trên màn hình (`1981`, `1988`, `1995`). Chọn một trong đầu.

Bạn vừa chọn một năm, giữ chặt lấy nó. Cuối video ta so lại. Và nếu bạn chọn một trong hai mốc bên phải, thì bạn đang đứng đúng chỗ mà gần như tất cả mọi người đứng, kể cả tôi.

1981, tháng 9 — sớm hơn cái mốc gần nhất bạn vừa nhìn thấy 14 năm, và sớm hơn cả cái ngày mà ARPANET chính thức chạy giao thức này. Nó có trước cả thứ mà nó phục vụ.

---

**[00:39 - 01:16] Lời buộc tội "Thiển cận" & Thực tế con số 4.29 tỷ**

Và đây là câu mà gần như ai cũng nói khi nghe tới chuyện này:

> *"4 tỷ địa chỉ mà vẫn không đủ à? Chọn kiểu gì mà thiển cận thế, để giờ cả ngành phải gánh!"*

Nghe rất hợp lý! Thật ra chính tôi cũng từng nói đúng câu đó, không sai một chữ. Vì 4,29 tỷ (`2^32`) là con số nghe như vô tận, kể cả bây giờ.

Hành tinh này có hơn 8 tỷ người, nghĩa là mỗi người chỉ cần đúng một thiết bị thôi, cái kho đó đã thiếu mất một nửa rồi. Mà một người bây giờ thì có tới mấy cái máy (điện thoại, máy tính, đồng hồ, TV). Con số thật còn xa hơn một thiết bị mỗi người.

Bản án đó còn có bằng chứng hẳn hoi: Hôm nay muốn có một địa chỉ IPv4 thật, bạn phải trả tiền thuê nó hàng tháng — một thứ đáng lẽ miễn phí thì nay đã có giá.

Nên trước khi gõ búa, ta làm đúng một việc: Tua ngược về cái căn phòng nơi con số 32 được chốt xuống, và xem thử họ có gì trong tay.

---

**[01:16 - 02:09] Thẻ 1: 213 máy trên toàn mạng ARPANET**

Tháng 9 năm 1981, một nhóm nhỏ ở California phát hành tài liệu tên **RFC 791** — nó định nghĩa địa chỉ IP bạn đang dùng.

Mạng lúc đó to cỡ nào? Câu trả lời có ghi lại hẳn hoi: **Toàn bộ mạng ARPANET năm đó có 213 cái máy!**

213 cái máy — không phải 213.000, càng không phải 213 triệu. Và trung bình phải khoảng 20 ngày mới có thêm được đúng một cái máy nối vào.

Giờ bạn đang ngồi ở chính cái bàn đó, mạng có 213 máy, bạn cấp bao nhiêu bit?

Nếu nãy giờ bạn đang nghĩ *"sao họ không lường trước sẽ có hàng tỷ thiết bị?"*, thì đây là chỗ cánh cửa đó đóng lại: Họ chốt **32 bit**. Và đây là lý do:

$$4,29 \text{ tỷ} / 213 \text{ máy} = 20.164.729$$

Họ không cấp "vừa đủ dùng", họ cấp **gấp 20 triệu lần** cái họ đang có trong tay lúc đó!

> **Cửa 1 đã đóng:** Họ có lường trước, và họ lường gấp 20 triệu lần!

---

**[02:09 - 03:02] Thẻ 2: Lần nới rộng gấp 8.000 lần (RFC 760 vs RFC 791)**

Đã dám nghĩ tới hàng tỷ, sao không nghĩ nghìn tỷ luôn? Muốn hiểu chỗ này thì phải lật bản trước đó ra.

20 tháng trước đó, tháng 1 năm 1980, có một tài liệu tên là **RFC 760** — cũng 32 bit, nhưng cách chia thì khác hẳn.

Bản đó dành đúng 8 bit đầu cho số hiệu mạng ($2^8 = 256$ mạng cho cả hành tinh).

Bản thiết kế trong tay bạn chỉ cho 256 mạng trên toàn thế giới, bạn nới nó ra bao nhiêu?

Bản 1981 nới số mạng từ 256 lên **hơn 2 triệu mạng** ($2.097.152$) — **gấp 8.000 lần trong 20 tháng!**

Thử đặt mình vào đúng chỗ họ ngồi: Bạn vừa nhân sức chứa của cả hệ thống lên 8.000 lần trong chưa đầy 2 năm. Có ai đứng dậy bảo rằng như thế vẫn còn hẹp không?

> **Cửa 2 đã đóng:** Cú nới từ 256 lên 2 triệu mạng là cú nới rộng lớn nhất từng có!

---

**[03:02 - 03:54] Thẻ 3: Giới hạn phần cứng — Máy IMP (24 KB RAM)**

Sao không dùng luôn **64 bit** cho chắc ăn?

Muốn trả lời được thì phải nhìn sang cái máy đứng giữa hai đầu đường truyền: Nó tên là **IMP (Interface Message Processor)** — ông tổ của cái Router đang nằm trong nhà bạn.

IMP đó có 12.000 từ nhớ (word), mỗi từ 16 bit $\rightarrow$ Quy ra **24 KB RAM**. Đó là bộ nhớ của **cả cái máy**, không phải phần cho một tính năng!

24 KB cho cả cái máy đó. Giờ bạn có dám cho địa chỉ dài gấp đôi lên không?

Phần đầu gói tin (Header) bị khóa cứng ở 20 byte. Máy tìm địa chỉ đích bằng cách đếm đúng số ô chứ không đọc hiểu. Thêm 4 byte là đếm trượt hết. Và cái giá 4 byte này nhân với mọi gói tin của cả hành tinh, mãi mãi!

> **Cửa 3 đã đóng:** Máy chuyển gói tin lúc đó không cõng nổi Header quá lớn.

---

**[03:54 - 04:45] Thẻ 4: Sự cạn kiệt đến từ cách chia Classful (A, B, C)**

3 thể giải thích con số 32 bit. Không thể giải thích vì sao nó cạn.

Bốn tỷ, vậy mà tại sao lại hết? Câu trả lời không nằm ở con số 32, nó nằm ở **cách chia**.

Bản 1981 cắt kho địa chỉ ra làm 3 lớp: **Lớp A, Lớp B, và Lớp C**.

* **Lớp C:** Cấp tối đa **254 máy**.
* **Lớp B:** Cấp tối đa **65.534 máy**.
* **Không có lựa chọn nào ở giữa!**

Công ty của bạn có 300 cái máy. Lớp C (254) không đủ, bạn buộc phải xin Lớp B ($65.534$). Thế là bạn vừa lấy $65.534$ địa chỉ về để dùng đúng 300 $\rightarrow$ **$65.234$ địa chỉ còn lại bị khóa tên bạn, không ai dùng được nữa!**

Nhân chuyện đó với vài nghìn công ty trong 10 năm... Kho địa chỉ không cạn vì hết chỗ, nó cạn vì **chỗ trống đã có chủ**!

> **Cửa 4 đã đóng:** Ngăn kéo chỉ có 2 cỡ (254 hoặc 65.534), không có ở giữa. 4 tỷ hết là vì 4 tỷ đó chưa từng được chia lẻ ra!

---

**[04:45 - 05:38] Lịch sử giải cứu & Lý do thật sự khiến IPv6 chưa bùng nổ**

Cả 4 ràng buộc đều đã hết hiệu lực theo thời gian:

1. **Tháng 9/1993:** CIDR ra đời, xóa sạch việc chia lớp (muốn xin bao nhiêu địa chỉ cũng được).
2. **Tháng 5/1994:** NAT ra đời (nhiều máy nấp chung một IP public).
3. **Phần cứng:** Router rẻ tiền nhất hôm nay đã có 128 MB RAM (gấp hàng chục nghìn lần IMP).
4. **IPv6:** Đã sẵn sàng từ 1998 (gần 30 năm).

Nhưng cái kim timeline thì không nhúc nhích! Vì sao?

Vì thứ sửa được chuyện này không nằm trong tay người đau:

* **Người đau:** Bạn (cuộc gọi qua mạng bị rớt, không có IP tĩnh).
* **Người sửa được:** Nhà mạng (ISP / Telco).

Chính họ cũng đang bị ràng buộc bởi chi phí đổi hạ tầng, thiết bị cũ không hiểu, khách không ai đòi...

> **Nó vẫn ở đây, vì người sửa được không phải là người đau vì nó.**

---

**[05:38 - End] Tổng kết & 3 điều sửa được ngay tuần này**

Nếu bạn đoán năm ở đầu video là những năm 90, bạn đã trễ hơn sự thật ít nhất 10 năm!

### 3 Thứ bạn sửa được ngay trong tuần này:

1. **Cột IP đừng khai 15 ký tự nữa (`VARCHAR(15)`):** Hãy đổi thành `VARCHAR(45)` để chứa vừa địa chỉ IPv6.
2. **Đừng chặn theo IP:** Vì sau NAT có thể là cả một tòa nhà (chặn nhầm người lành).
3. **Thử dịch vụ khi cả 2 đầu cùng nấp sau NAT:** Đừng chỉ thử trên Localhost!

Người của năm 1981 không hề thiển cận. Họ nới rộng gấp 20 triệu lần cái họ có. Chỉ là chúng ta đã lớn nhanh hơn cả trí tưởng tượng rộng nhất của họ!

> *Con số nào bạn chốt hôm nay sẽ vẫn nằm đó, sau khi lý do chọn nó biến mất?*

Kể cho mình nghe ở phần bình luận nhé! Thấy hay thì cho mình 1 Like và Đăng ký kênh!

Dưới đây là transcript đầy đủ toàn bộ nội dung audio/video của bạn:

---

## Transcript Nội Dung Video

**[00:00 - 00:27] Đặt vấn đề: Sự cố tải file đứng im khi bật VPN & Câu hỏi dự đoán**

File tải về treo giữa chừng. Bạn vừa bật VPN công ty, và mọi thứ vẫn chạy: trang web vào bình thường, chat nhắn được, gõ lệnh vẫn ra kết quả... Chỉ có file lớn là đứng im, không báo lỗi, không hiện gì hết!

Cái trần đó được chốt vào năm nào? Chọn nhanh một trong 3 mốc này:

* **1995**
* **1987**
* **1980**

Bạn vừa chọn một năm, giữ lấy nó, cuối video ta so lại. Còn bây giờ, trước khi biết đáp án, hãy nghe thử cái câu mà ai cũng bột miệng nói khi gặp con số này.

---

**[00:27 - 01:18] Lời buộc tội "Thiển cận" & Lần lùi thời gian thứ nhất**

**1980** — 46 năm trước. Ba công ty ngồi lại chốt một con số, và con số đó chưa đổi lấy một lần kể từ hôm ấy: nó tên là **1500 byte** (MTU - Maximum Transmission Unit).

Câu người ta hay nói thế này:

> *"1500 là con số ai đó chọn đại, rồi cả ngành gánh. 46 năm mà không ai dám sửa, chỉ vì ngại đụng vào."*

Bạn đã từng nói đúng câu này chưa? Và nói thật lòng, câu đó nghe rất có lý! Vì bạn cứ nhìn quanh mà xem: cái gì trong máy tính cũng đã lớn lên gấp cả nghìn lần, riêng đúng con số này thì đứng yên!

Năm đó, mạng chạy 10 triệu bit/giây ($10\text{ Mbps}$). Bây giờ cái cáp mạng trên máy bạn chạy 10 tỷ bit/giây ($10\text{ Gbps}$) — nhanh gấp đúng 1.000 lần, và gói tin thì vẫn nguyên 1500 byte!

Tệ hơn nữa, cách làm gói to hơn đã có sẵn từ lâu (Jumbo Frames - 9000 byte một gói), chạy ngon lành trong mọi trung tâm dữ liệu (Data Center), chỉ là ra tới Internet thì nó không đi được.

Nên bản án nghe rất chắc: *"Ai đó năm xưa chọn bừa, và ta thì kẹt!"*. Tôi cũng từng nghĩ y hệt vậy, cho tới lúc đi tìm xem thật ra năm đó có chuyện gì...

---

**[01:18 - 02:20] Thẻ 1: Cáp dùng chung (Ethernet Bus Topology - 10 Mbps)**

Lùi 46 năm về một căn phòng ở nước Mỹ, nơi 3 công ty lớn (Xerox, DEC, Intel) đang ngồi cãi nhau quanh đúng một sợi cáp đồng.

Năm 1980, mạng nội bộ không giống bây giờ. Cả tòa nhà cắm chung vào một sợi cáp đồng dày như ngón tay chạy trên trần (Bus Topology). Ai nói thì tất cả cùng nghe.

Sợi cáp đó chở được 10 triệu bit/giây ($10\text{ Mbps}$) — không phải mỗi máy 10 triệu, mà **cả sợi cáp 10 triệu chia cho tối đa 100 máy**.

Giờ tính thử: Một gói 1500 byte ($1500 \times 8 = 12.000\text{ bit}$) đẩy hết qua sợi cáp đó mất **$1,2\text{ ms}$**. Trong ngần ấy thời gian, **99 cái máy còn lại phải ngồi im chờ!**

Sao không cho gói to hẳn lên, 9000 byte chẳng hạn? Nghe rất hợp lý, nhưng thử nhân lên xem:

* $9000\text{ byte} = 7,2\text{ ms}$ một gói.
* Một người tải file, cả tầng đứng hình!

Họ chọn **1500 byte**: Đủ to để khỏi chẻ nhỏ mọi thứ, đủ nhỏ để không ai giữ sợi cáp quá lâu. $1,2\text{ ms}$ là mức mà cả phòng còn chịu đựng được!

> **Cửa 1 đã đóng:** Cáp dùng chung $10\text{ Mbps}$ loại phương án gói $9000\text{ byte}$.

---

**[02:20 - 03:15] Thẻ 2: Bộ nhớ RAM cực đắt trên Card mạng (NIC Buffer - 2 KB)**

Ràng buộc thứ hai nằm ngay trong cái Card mạng.

Muốn gửi một gói, Card phải giữ trọn cả gói trong bộ nhớ của chính nó rồi mới bắn ra sợi cáp. Bên nhận cũng y hệt.

Mà bộ nhớ năm đó thì kinh khủng: **$1\text{ MB RAM} \approx 6.000\text{ USD}$**!
Tấm ảnh bạn vừa chụp bằng điện thoại ($3\text{ MB}$) $\rightarrow$ Năm 1980 riêng chỗ nhớ để chứa nó đã là **$18.000\text{ USD}$** (hơn 2 cái xe hơi mới)!

Thì cho Card nhiều bộ nhớ hơn, đáng mấy đồng? Nhưng bộ đệm trên Card mạng phổ biến thời đó **chỉ có $2\text{ KB}$** — vừa đúng một gói $1500\text{ byte}$ + Header, không dư một byte nào!

Nên con số $1500\text{ byte}$ là vừa vặn con chip rẻ nhất mua được ngoài chợ thời đó.

> **Cửa 2 đã đóng:** Bộ nhớ RAM quá đắt ($6.000\text{ USD/MB}$), Card mạng rẻ tiền nhất chỉ có $2\text{ KB}$ bộ đệm.

---

**[03:15 - 04:08] Thẻ 3: Cùng một luật vật lý trên cáp đồng (CSMA/CD & Collision Detection)**

Ràng buộc thứ ba lạ nhất: Trên sợi cáp đó **không có ai điều phối**! Máy nào muốn nói thì cứ nói, 2 máy nói cùng lúc thì tín hiệu chồng lên nhau $\rightarrow$ Hỏng cả hai (Collision).

Mỗi máy vừa nói vừa nghe lại chính mình. Tín hiệu chạy hết $2.500\text{ m}$ cáp rồi dội về mất **$51,2\text{ }\mu\text{s}$**. Suốt ngần ấy thời gian nó vẫn đang nói.

Vì nếu nó nói xong rồi mà va chạm mới dội về thì nó chẳng biết gì cả! Đó là lý do gói tin có sàn cứng tối thiểu $64\text{ byte}$ (để kịp phát hiện va chạm).

Vậy sao không cho 2 máy tự thỏa thuận một con số riêng? Trên sợi cáp dùng chung, mọi Card cắm trên đó đều nghe thấy mọi gói và phải cắt ranh giới gói theo **cùng một luật**.

Nên họ chốt một con số duy nhất: **$\text{MTU} = 1500\text{ byte}$**, ghi cứng vào chuẩn. Không thỏa thuận, không tùy chọn, không đàm phán!

> **Cửa 3 đã đóng:** Tính vật lý của sợi cáp đồng bắt mọi máy dùng chung một quy tắc (không thỏa thuận riêng).

---

**[04:08 - 04:55] Sự hết hạn của các lý do & Lý do thật sự 1500 vẫn còn sống**

Giữa thập niên 90:

1. **Ràng buộc 1 hết hiệu lực (1995):** Switch (Bộ chuyển mạch) ra đời, mỗi máy một đường riêng, không còn cáp dùng chung.
2. **Ràng buộc 2 hết hiệu lực (2001):** RAM rẻ đến mức chưa tới $0,01\text{ USD/MB}$.
3. **Ràng buộc 3 hết hiệu lực (2011):** Bỏ cơ chế phát hiện va chạm (CSMA/CD).

Cả 3 lý do sinh ra con số 1500 đều đã **HẾT HIỆU LỰC**! Nhưng tại sao con số 1500 vẫn chạy trên máy bạn hôm nay?

Vì gói tin của bạn từ nhà tới server đi qua mười mấy chặng của mười mấy nhà mạng khác nhau. Muốn nâng trần thì **TẤT CẢ PHẢI ĐỒNG Ý HẾT**! Chỉ cần 1 trạm trung gian không chịu nâng là toàn bộ đường hầm bị nghẽn. Không ai giữ nó lại, chỉ là không ai gỡ được nó ra!

---

**[04:55 - End] Giải thích hiện tượng VPN đứng hình & 3 tắc ứng dụng**

Quay lại năm bạn đoán lúc đầu: Nếu chọn 1995 hay 2001, bạn nghĩ về thế giới đã có cáp riêng. Người chốt con số 1500 năm 1980 thì chưa!

Chỗ bạn vấp ở đầu video chính là đây:

* **Bật VPN:** Gói tin $1500\text{ byte}$ phải cõng thêm Header của VPN (khoảng $80\text{ byte}$) $\rightarrow$ Tổng kích thước vọt lên $1580\text{ byte}$.
* Qua đường hầm chỉ cho phép $1420\text{ byte}$, trạm giữa đường phải gào lên: *"Gói to quá, không qua được!"* (ICMP Need Frag / Packet Too Big).
* **Nhưng Tường lửa (Firewall) công ty bạn đã CHẶN sạch các gói báo lỗi ICMP này!**
* Server gửi gói tin đi mà không hề nhận được lời báo lỗi $\rightarrow$ Nó tưởng bạn nhận rồi và cứ im lặng chờ mãi $\rightarrow$ **Tải file đứng im ở 41%!**

### 3 Dòng sống chung với 1500 (áp dụng ngay):

1. **Đừng chặn sạch gói báo lỗi ICMP tại tường lửa** (đây là đường báo lỗi MTU duy nhất).
2. **Mọi đường hầm VPN / GRE đều phải kẹp kích thước gói (MSS Clamping) ngay ở đầu vào.**
3. **File lớn mà đứng hình trong khi Web vẫn chạy $\rightarrow$ Soi trần MTU / MSS trước tiên**, đừng đổ lỗi cho đường truyền!

> *Ràng buộc nào trong đoạn mã bạn viết hôm nay sẽ hết hiệu lực trước, mà mã thì vẫn còn đó?*

Hãy kể cho mình nghe ở phần bình luận và bấm Đăng ký kênh nhé!

---

Dưới đây là transcript đầy đủ toàn bộ nội dung audio/video của bạn:

---

## Transcript Nội Dung Video

**[00:00 - 00:39] Đặt vấn đề: Sự cố Y2K38 (Sự cố năm 2038) & Dữ liệu ngày tháng ra `0000-00-00**`

Cái ngày này không lưu được!

Gói thuê bao 15 năm, ngày đáo hạn rơi vào năm 2040 (`2040-03-15`). Gõ vào bảng thì nó thành số `0` hết (`0000-00-00`). Không báo lỗi, không cảnh báo gì! Cột bên cạnh vẫn nhận năm sinh `1980-05-12` bình thường, chỉ cái năm 2040 kia là không.

Cái trần đó được chốt vào năm nào? Chọn nhanh một trong 3 mốc dưới đây:

* **1995**
* **1985**
* **1971**

Bạn vừa chọn một năm, giữ lấy nó, cuối video ta so lại. Còn bây giờ, hãy nghe cái câu mà ai cũng bột miệng khi lần đầu gặp con số **2038**.

**1971** — Cái đồng hồ nằm trong cột thời gian của bạn bắt đầu tích tắc từ năm đó, trên một cái máy đặt ở Phòng thí nghiệm Bell bên kia bờ Đại Tây Dương. Và từ hôm ấy tới giờ, nó chưa được đặt lại lần nào.

---

**[00:39 - 02:21] Thẻ 1: Lần thử nghiệm đếm $1/60$ giây ($828$ ngày) & Lời buộc tội "Lười thật!"**

Câu đó nghe thế này:

> *"Lười thật, 4 byte thì tiết kiệm được bao nhiêu? Sao không lấy số to hơn ngay từ đầu?"*

Đúng y hệt lỗi năm 2000, chỉ là dời sang chỗ khác! Lời chỉ trích đó nghe rất hợp lý. Chuyện tiết kiệm vài chữ số rồi trả giá sau đã xảy ra thật (Cả ngành từng đổ hàng trăm tỷ đô đi sửa những năm viết có 2 chữ số — sự cố Y2K). Bằng chứng thứ hai khó cãi hơn: Cái trần đó chỉ còn cách mốc 2038 không xa, và kiểu cột phổ biến nhất trong MySQL vẫn là 4 byte (`TIMESTAMP` 4 byte tới ngày 19/01/2038). Ai cũng biết, chưa ai đổi!

Nên câu trách đó rất dễ hiểu. Nó đi kèm một hình dung quen thuộc: rằng năm đó có một người ngồi viết vội, chọn đại con số nhỏ nhất chạy được, rồi đứng dậy đi ăn trưa!

Thì có điều, cái máy hôm đó không hề giống cái máy trong đầu bạn.

### Phòng thí nghiệm Bell - Năm 1971

Bản Unix đầu tiên chạy được và nó cần biết giờ. Người ta cho nó một đồng hồ đếm bằng số nguyên, gốc đặt ở ngày **01-01-1971**.

Nhưng nó không đếm bằng giây! **Nó đếm bằng $1/60$ giây** (mỗi nhịp điện một tích), vì màn hình và bàn phím thời đó đều chạy theo nhịp điện lưới $60\text{ Hz}$.

Đếm mịn hơn thì đo chính xác hơn, ai chẳng muốn thế? Vậy cái đồng hồ $1/60$ giây đó chạy được bao lâu với số nguyên 32-bit có dấu ($2^{31}-1$ nhịp)?

$$\frac{2^{31}-1}{60 \text{ nhịp/giây}} \approx 35.791.394 \text{ giây} \approx 828 \text{ ngày} \approx 2 \text{ năm } 3 \text{ tháng!}$$

Mịn gấp 60 lần thì tuổi thọ chia cho 60. Cái đồng hồ cạn trước cả khi bản Unix thứ ba kịp ra đời!

Nên năm 1973 họ đổi: bỏ nhịp điện, đếm thẳng bằng giây ($1$ nhịp = $1$ giây). Cùng một con số 4 byte, **tuổi thọ nhảy từ 2 năm lên 68 năm!**

Và họ lùi cái gốc về **01-01-1970** (sớm hơn 1 năm) cho tròn thập niên — mốc đó tới giờ vẫn là điểm 0 (Epoch time) của gần như mọi cột thời gian bạn từng khai (`created_at`, `updated_at`, `expires_at`).

> **Cửa 1 đã đóng:** Đếm $1/60$ giây thì 4 byte chỉ chứa nổi 828 ngày. Loại phương án "đếm mịn hơn cho chính xác". Sửa năm 1973.

---

**[02:21 - 03:55] Thẻ 2 & 3: Giới hạn phần cứng PDP-11 (24 KB RAM) & Cấu trúc Inode (32 Byte)**

### Thẻ 2: Phần cứng PDP-11 & Kiến trúc 16-bit

Chiếc PDP-11 cao bằng cái tủ lạnh, cả phòng chỉ có một chiếc. Bộ nhớ của nó là **24 KB** cho cả hệ điều hành, chương trình và dữ liệu (nhỏ hơn vài trăm lần một tấm ảnh điện thoại hiện nay).

Một ô nhớ của nó rộng 16 bit. Nghĩa là con số 4 byte ($32\text{ bit}$) đã phải ghép 2 ô nhớ. Phép cộng/trừ $32\text{ bit}$ mất 2 lệnh assembly (`ADD`, `ADC`) thay vì 1 lệnh. Nó là kiểu số đắt nhất họ dám dùng!

Nếu bạn hỏi *"Sao không lấy 8 byte ($64\text{ bit}$) cho chắc?"*:

* 8 byte là 4 ô nhớ $\rightarrow$ Mất 4 lệnh cho mỗi phép cộng.
* Máy PDP-11 thời đó còn **không có sẵn lệnh nhân/chia bằng phần cứng**!
* Đổi lấy tuổi thọ dài hơn cho một tính năng mà khiến mọi chương trình chạy chậm đi là cái giá không thể trả.

> **Cửa 2 đã đóng:** Máy PDP-11 24 KB RAM, ô nhớ 16-bit, không có nhân chia phần cứng. Loại phương án "sao không dùng 8 byte cho chắc".

### Thẻ 3: Hồ sơ tệp (Inode) chỉ có 32 Byte trên đĩa

Mỗi tệp trên đĩa có một tấm hồ sơ (Inode) rộng đúng **32 byte**. Trong 32 byte đó, 2 mốc giờ (thời gian tạo, thời gian sửa) đã ăn hết **8 byte** ($1/4$ dung lượng tấm hồ sơ!).

Nếu ghi ngày tháng dạng chuỗi đọc được (`1971-11-03 14:22:05`):

* 1 mốc mất 19 byte.
* 2 mốc mất **38 byte** (vượt quá kích thước cả tấm hồ sơ 32 byte!).
* Lại còn phải tốn phép toán tra lịch để tính khoảng cách giữa 2 mốc giờ.

Ngược lại, dùng số nguyên 4 byte (Timestamp):

* Trừ 2 con số cho nhau là ra khoảng cách ngay trong **1 lệnh CPU**, không cần tra lịch, không cần biết tháng nào có 31 ngày.

> **Cửa 3 đã đóng:** Hồ sơ tệp (Inode) chỉ có 32 byte, 2 mốc giờ đã chiếm $8\text{ byte}$. Loại phương án "ghi ngày tháng ra chuỗi".

---

**[03:55 - 05:05] Sự hết hạn của các lý do & Bản chất của vấn đề Y2K38**

Cả 3 ràng buộc đều đã lần lượt hết hiệu lực:

1. **Thẻ 1:** Đã sửa từ năm 1973 (chuyển sang đếm theo giây).
2. **Thẻ 2:** RAM điện thoại giờ gấp cái máy PDP-11 đó $350.000$ lần, CPU 64-bit cộng $64\text{ bit}$ trong đúng 1 lệnh.
3. **Thẻ 3:** Hồ sơ tệp trên đĩa hiện đại (ext4/NTFS) đã rộng $256\text{ byte}$, chứa mốc thời gian lên tới năm 2446.

**Không tấm nào còn hiệu lực, nhưng tại sao con số 4 byte vẫn nằm nguyên chỗ cũ?**

Vì con số đó không nằm trong mã nguồn, nó **nằm trong dữ liệu đã ghi ra đĩa**. Hàng tỷ ổ đĩa, hàng tỷ cơ sở dữ liệu đã ghi theo cấu trúc 4 byte. Không ai giữ nó lại, chỉ là không ai gỡ nó ra một mình được!

### Đáp án câu hỏi ở đầu video:

* Nếu bạn chọn **1971**: Xin chúc mừng, bạn đã hiểu lý do thực sự!
* Nếu chọn **1985** hay **1995**: Bạn vừa mắc đúng cái lỗi của "bản án vội" (đánh giá quyết định quá khứ bằng góc nhìn phần cứng hiện tại).

Năm 1973, con số 68 năm tuổi thọ gấp **3 lần** toàn bộ tuổi đời của ngành máy tính lúc bấy giờ. Không ai tin có dòng lệnh nào sống lâu tới thế!

---

**[05:05 - End] 2 Nhánh dữ liệu & Checklist sống chung với Y2K38**

Từ quyết định năm 1971/1973 sinh ra 2 kiểu cột thời gian mà bạn thấy hàng ngày trong SQL:

1. **`TIMESTAMP` (Nhánh đếm giây):**
* Tốn 4 byte.
* Tự động chuyển đổi theo múi giờ (Timezone).
* **Bị chạm trần và hết hạn vào ngày 19-01-2038.**


2. **`DATETIME` (Nhánh ghi ra chuỗi/con số tĩnh):**
* Tốn 5-8 byte.
* Không đổi theo múi giờ.
* Chạy tới tận năm **9999**.



### 📋 Checklist sống chung với Y2K38 (Áp dụng ngay):

* [x] **Cột nào có thể lưu ngày trong tương lai vượt qua năm 2038** (ngày đáo hạn hợp đồng, ngày hết hạn thẻ, bảo hành) $\rightarrow$ **Khai `DATETIME**`, tuyệt đối **KHÔNG dùng `TIMESTAMP` 4-byte**.
* [x] **Chỉ dùng `TIMESTAMP**` khi thật sự cần một mốc thời gian đồng bộ trên mọi múi giờ và thời gian nằm trước năm 2038 (`created_at`, `updated_at`).
* [x] **Ghi chú rõ trong Comment của cột** nếu dùng kiểu số đếm có ngày hết hạn.

> *Ràng buộc nào trong quyết định bạn viết hôm nay sẽ hết hiệu lực trước, mà đoạn mã thì vẫn còn đó?*

Hãy chia sẻ ý kiến của bạn ở phần bình luận và bấm Đăng ký kênh nhé!

---

Dưới đây là transcript đầy đủ toàn bộ nội dung audio/video của bạn:

---

## Transcript Nội Dung Video

**[00:00 - 00:39] Đặt vấn đề: Sự cố mất 4.000 dòng dữ liệu khi dùng toán tử so sánh (`<>`) với `NULL**`

Câu đếm này sót 4.000 dòng!

```sql
SELECT COUNT(*) FROM don
WHERE trang_thai <> 'huy'

```

Bảng có 10.000 đơn, bạn lọc ra những đơn khác trạng thái 'huy', máy trả về đúng 6.000. Đơn hủy cộng lại vẫn không ra đủ 10.000, không báo lỗi. 4.000 dòng kia đi đâu?

Cái luật làm mất 4.000 dòng đó có từ năm nào? Chọn nhanh một mốc dưới đây:

* **1996**
* **1987**
* **1979**

Bạn vừa chọn một năm, giữ lấy nó, cuối video ta so lại. Còn bây giờ thì nghe thử cái câu mà gần như ai cũng bột miệng nói ra khi lần đầu bị mất dòng như thế.

**1979** — Cái luật làm 4.000 dòng của bạn biến mất ra đời trong một bài báo dài gần 40 trang, viết bởi đúng người đã nghĩ ra cái bảng và cái cột mà bạn gõ mỗi ngày (Edgar F. Codd - cha đẻ của CSDL quan hệ). Ông ấy không thêm cái luật đó vào cho vui!

---

**[00:39 - 02:21] Thẻ 1: Sự tranh cãi về logic 3 giá trị (Three-Valued Logic - 3VL) & Lời chỉ trích "Thừa thãi"**

Câu đó nghe thế này:

> *"Trống thì là trống, sao lại đẻ thêm một giá trị thứ ba cho rối? Đúng/Sai là đủ rồi, ai lại làm ra cái thứ không đúng cũng không sai!"*

Nghe rất hợp lý, và đó chính là chỗ khó! Bản án đó có người đỡ lời, không phải người thường. Một trong những tác giả viết sách chuẩn về CSDL (C.J. Date) đã dành hẳn nhiều chương đòi bỏ `NULL` khỏi SQL suốt 40 năm.

Bằng chứng thứ hai nằm ngay trong cú pháp: Bạn không viết được `WHERE x = NULL` mà phải viết `WHERE x IS NULL`. Tức là chính ngôn ngữ đã thừa nhận dấu `=` của nó không dùng được ở chỗ này!

Nên câu trách rất dễ hiểu. Nó đi kèm hình dung rằng năm đó ai đó thích phức tạp hóa, thêm một giá trị nữa cho ra vẻ chặt chẽ, rồi để lại rắc rối cho chúng ta.

Thì có điều, cái bản làm việc năm đó không giống bản của bạn.

### Bài toán phòng máy năm 1979

Bài toán rất gọn thôi: Một cột lương khai kiểu số nguyên 4 byte, và bạn phải ghi vào đó một người mà công ty chưa biết lương bao nhiêu cả.

Một số nguyên 4 byte chứa được hơn $4,29\text{ tỷ}$ giá trị ($2^{32}$). Nghe thì thừa thãi, nhưng **tất cả đều là số có thật**, không cái nào có nghĩa là "chưa biết".

Phương án đầu ai cũng nghĩ tới là chọn đại một con số làm dấu: `-1`, `0`, hay `9999`. Cả ngành đã làm đúng thế suốt 20 năm!

Nhưng con số làm dấu thì vẫn là một con số, nó không biến mất khi máy tính toán:

* Tính lương trung bình của phòng: 3 người chưa biết lương ghi `-1`.
* Con số trung bình tụt xuống mà báo cáo vẫn xanh, không ai truy ra được lý do!

Nên ông Codd không lấy con số nào cả. Cái dấu bắt buộc phải nằm ngoài miền giá trị của chính cái cột đó — không phải một con số, cũng không phải chuỗi rỗng: **`NULL`**.

Vì nó không phải một giá trị, mọi phép so sánh với nó đều không trả về True hay False, mà trả về giá trị logic thứ ba: **UNKNOWN (Chưa biết)**. Và mệnh đề `WHERE` chỉ giữ lại những hàng `True` $\rightarrow$ 4.000 dòng bị rớt mất!

> **Cửa 1 đã đóng:** Một cột 4 byte có hơn 4 tỷ giá trị, không cái nào là "chưa biết". Loại phương án "chọn đại một con số làm dấu" vì số làm dấu vẫn bị tính vào `SUM`, `AVG`.

---

**[02:21 - 03:07] Thẻ 2: Thời đại phiếu đục lỗ (80 cột) & Chạy lô ban đêm**

Câu hỏi tiếp theo còn tự nhiên hơn nữa: *"Gặp ô trống thì hỏi lại người điền chứ, mất gì đâu?"*.

Hôm nay bạn làm thế mỗi ngày: một cái form và một dòng chữ đỏ *"Chưa điền mục này"* báo lỗi sau 200ms.

Nhưng dữ liệu năm đó không vào máy bằng bàn phím của bạn. **Nó vào bằng phiếu đục lỗ** (80 cột/phiếu). Gõ ở một phòng, chở sang phòng máy bằng xe đẩy tay, gom thành một lô (batch) rồi chạy vào ban đêm.

Lúc câu lệnh chạm tới ô trống thì đã là 2 giờ sáng. Người điền phiếu về nhà từ lâu, và tấm phiếu thì điền từ tuần trước. Không có ai ở đó để mà hỏi lại!

Thêm nữa, trên tấm phiếu 80 cột, **cột để trống là ký tự dấu cách (space - `0x40`)**, mà dấu cách là một ký tự có thật!

Nên cái trống bắt buộc phải được ghi lại thành một thứ khác hẳn (`NULL`) ngay lúc nạp dữ liệu, chứ không trông chờ vào chuyện quay lại hỏi được.

> **Cửa 2 đã đóng:** Phiếu đục lỗ 80 cột, chạy lô ban đêm, không có ai để hỏi lại. Loại phương án "gặp ô trống thì hỏi lại người điền".

---

**[03:07 - 04:02] Thẻ 3: Ổ đĩa $317\text{ MB}$ đáng giá bằng cả căn nhà & Chi phí cho cột cờ**

Phương án cuối cùng gọn nhất: Bên cạnh mỗi cột, thêm một cột cờ (flag) nữa chỉ để trả lời đúng một câu hỏi: *Có biết hay không biết?* (2 cột thành 4 cột).

Nghe rất sạch sẽ, không cần luật mới, không cần toán tử riêng. Nhưng trước khi gật đầu, hãy nhìn cái ổ đĩa của họ năm 1979: **Một ổ đĩa hạng nặng chứa được $317\text{ MB}$, giá bằng mấy căn nhà!**

Lấy một bảng 30 cột, 10 triệu dòng:

* Thêm 1 byte cờ cho mỗi cột $\rightarrow$ Thêm $300\text{ MB}$!
* Tức là mua thêm gần trọn một cái ổ đĩa chỉ để ghi "có biết hay không"!

Nên họ nhét cái dấu `NULL` vào đúng chỗ cũ, không thêm lấy một cột nào hết. Cái giá phải trả không nằm ở đĩa nữa, nó chuyển hẳn sang nằm ở phần logic.

> **Cửa 3 đã đóng:** Ổ đĩa chỉ có $317\text{ MB}$ giá hàng trăm ngàn USD. Loại phương án "thêm cột cờ cờ đánh dấu có biết hay không" vì tốn thêm $300\text{ MB}$.

---

**[04:02 - 04:49] Sự hết hạn của các lý do & Bản chất tồn tại của `NULL**`

Cả 3 ràng buộc đều đã hết hiệu lực:

1. **Thẻ 2 hết sớm nhất:** Form trên trình duyệt bắt lỗi trong $200\text{ ms}$, hỏi lại người dùng trong nháy mắt.
2. **Thẻ 3 cũng hết:** Ổ đĩa nhỏ bằng ngón tay hôm nay chứa $1000\text{ GB}$ (gấp 3.000 lần), cờ đánh dấu `NULL` giờ chỉ tốn 1 bit (Bitmap) chứ không tốn 1 byte.
3. **Thẻ 1 tinh hơn chút:** Ngôn ngữ hiện đại đã có kiểu dữ liệu nói được chuyện vắng mặt (`Option`/`Nullable`) mà không mượn giá trị nào.

**Cả 3 tấm thẻ đều hết hạn, nhưng tại sao `NULL` vẫn ở lại?**

Vì hóa ra quyết định đó **VẪN ĐÚNG về mặt logic**!
Ngày sinh chưa biết không lớn hơn 1990, mà cũng không nhỏ hơn 1990. Câu trả lời chính xác nhất của vũ trụ vẫn là: **CŨNG KHÔNG BIẾT!**

Lý do cũ hết hạn, quyết định thì không.

### Đáp án câu hỏi ở đầu video:

* Nếu bạn chọn **1979**: Xin chúc mừng, bạn đã chọn đúng năm bài báo gốc của Edgar F. Codd xuất bản!
* 4.000 dòng lúc đầu không bị hủy, cũng không phải không hủy $\rightarrow$ Trạng thái của chúng là **`NULL` (Chưa biết)**, nên cả hai câu lọc `=` và `<>` đều loại bỏ chúng.

---

**[05:05 - End] Checklist 3 dòng sống chung với `NULL**`

### 📋 Checklist sống chung với `NULL` (Áp dụng ngay):

* [x] **Cột nào không được phép trống** (mã đơn, trạng thái, khóa ngoại) $\rightarrow$ Khai **`NOT NULL`** ngay lúc tạo bảng, đừng để dọn sau.
* [x] **Cột có thể trống** $\rightarrow$ Mọi phép so sánh phải bọc bằng `COALESCE(x, 0)` hoặc hỏi thẳng bằng **`IS NULL` / `IS NOT NULL**`.
* [x] **Đừng dùng `NOT IN` với truy vấn con chưa lọc trống** (vì nếu subquery chứa 1 giá trị `NULL`, toàn bộ `NOT IN` sẽ trả về rỗng!) $\rightarrow$ Hãy dùng **`NOT EXISTS`**.

> *Ràng buộc nào trong quyết định bạn viết hôm nay sẽ hết hiệu lực trước, mà đoạn mã thì vẫn còn đó?*

Hãy kể cho mình nghe ở phần bình luận và bấm Đăng ký kênh nhé!

Dưới đây là transcript đầy đủ cho video của bạn, kèm theo câu trả lời mẫu 30 giây cực kỳ hữu ích ở cuối:

---

## Transcript Nội Dung Video

**[00:00 - 00:36] Đặt vấn đề: "Mỗi Request mở một kết nối Database: Sai ở đâu?"**

Phút thứ tư. Người phỏng vấn đặt bút xuống, hỏi một câu nghe như bài học vỡ lòng.

Ứng viên ngồi thẳng lên, nghĩ trong đầu rằng: *"Câu này mình học rồi, chắc chắn trả lời được!"*

> **"Mỗi Request mở một kết nối Database: Sai ở đâu?"**

Câu hỏi hiện đủ chữ trên bảng, rồi người phỏng vấn im hẳn, không gợi ý thêm chữ nào.

Bạn có 3 giây để trả lời trong đầu: **3... 2... 1...**

Bạn vừa trả lời trong đầu rồi đúng không? Giữ lấy câu đó, cuối video ta soi lại. **Câu trả lời của bạn ĐÚNG, mà bạn VẪN CÓ THỂ TRƯỢT.** Đó là lời hứa của video này!

3 tầng đào sâu, một con số làm chậm hệ thống 50 lần, và cái bẫy nằm đúng ở chỗ ai cũng tưởng mình đã biết rồi nên không ai đi đo lại.

---

**[00:36 - 01:21] Tầng 1: Giá mở (Connection Overhead - 5 đến 30ms)**

Ứng viên trả lời ngay và trả lời ĐÚNG:

> *"Mở kết nối thì tốn thời gian, nên đừng mở mới mỗi lần. Hãy giữ sẵn một bể kết nối (Connection Pool), lấy ra dùng rồi trả về chỗ cũ."*

Cái bể đó tên là **Pool**. Ứng viên vừa mua được một con số đo được chứ không phải một cảm giác chung chung.

**Cụ thể, tại sao mở kết nối lại tốn thời gian?**

1. **Lượt 1:** Bắt tay TCP (TCP Handshake - 3-way)
2. **Lượt 2:** Đăng nhập, kiểm tra mật khẩu (Authentication)
3. **Lượt 3:** Bật mã hóa TLS/SSL

3 lượt đi về (Round-trips) + Database phải dựng chỗ làm việc mới. Đo trên máy thật, cả gói đó rơi vào khoảng **5 đến 30ms mỗi lần mở**.

So sánh: Một API bình thường trả về trong **50ms**. Riêng cái bắt tay đã ăn hết **một nửa thời gian** đó! Người dùng chờ nửa thời gian chỉ để hệ thống tự giới thiệu lại từ đầu với Database!

> **Chốt Tầng 1 (Giá mở):** Mở kết nối tốn 3 lượt đi về ($5 - 30\text{ms}$), bằng một nửa thời gian của một API. Dùng Pool để dùng lại kết nối.

---

**[01:21 - 02:57] Tầng 2: Bể to? (Pool Size - Càng to càng chậm!)**

Người phỏng vấn hỏi tiếp: *"Vậy bể càng to càng khỏe chứ?"*

Ứng viên định gật đầu theo luôn... (Bạn có gật không đấy?)

Đây là chỗ trượt của nhiều người vì nó **ngược với trực giác**: **Bể to hơn KHÔNG khỏe hơn, mà làm hệ thống CHẬM ĐI!**

Lý do nằm ở phía Database:

* Với PostgreSQL, mỗi kết nối là 1 tiến trình (process) riêng, ăn $5 - 10\text{MB}$ RAM.
* **500 kết nối = 500 tiến trình!**
* Nhưng máy chủ chỉ có **4 lõi (4 Cores CPU)** $\rightarrow$ Tại một thời điểm chỉ xử lý được đúng 4 việc.
* 496 tiến trình còn lại phải chờ và làm CPU tốn công **Context Switch (đảo qua đảo lại)** liên tục mà không chạy thêm được truy vấn nào!

**Số liệu đo thật (HikariCP):**
Khi hạ Pool Size từ **2048 xuống 96 kết nối**, thời gian chờ tụt từ **$100\text{ms}$ xuống $2\text{ms}$** $\rightarrow$ **Nhanh hơn 50 lần!**

> **Công thức khởi điểm:** $\text{Pool Size} = (\text{Số lõi CPU} \times 2) + \text{Số ổ đĩa}$.
> Máy 4 lõi thì mở khoảng **8 - 10 kết nối** là đủ!

---

**[02:57 - 03:45] Tầng 3: Bể cạn? (Queue & Timeout - Xếp hàng ở đâu?)**

Người phỏng vấn dồn tiếp: *"Bể chỉ có 8 chỗ, Request thứ 9 tới thì sao?"*

Nó không lỗi ngay đâu! Nó sẽ **xếp hàng đứng chờ** trong ứng dụng (App Queue) cho tới khi có ai trả kết nối về Pool.

Và đây là chỗ các biểu đồ bắt đầu "nói dối":

* **Database vẫn rảnh** (CPU $< 30\%$).
* Nhưng **Request bị Timeout**, người dùng thấy trang lỗi!

**Sự đánh đổi:**

* **Bể nhỏ:** Hàng đợi nằm ở App $\rightarrow$ Bạn thấy được nó, đặt được Timeout cho nó.
* **Bể quá to:** Hàng đợi chui vào trong Database $\rightarrow$ Không ai thấy, làm tất cả truy vấn (dù chỉ $1\text{ms}$) bị chậm theo thành $40\text{ms}$.

> **Luật thép:** $\text{Timeout hàng đợi (Queue Timeout)} < \text{Timeout của HTTP}$ (ví dụ: Queue Timeout = 2s, HTTP Timeout = 30s). Để lỗi nổ ở App nơi bạn kiểm soát được, chứ đừng nổ trong Database!

---

**[03:45 - End] Tổng kết & Bảng điểm phỏng vấn**

Họ không hỏi bạn biết gì, họ hỏi **bạn đã mất gì** (đã từng thức đêm vì sự cố nghẽn Pool chưa).

### 📋 Mẫu câu trả lời 30 giây chuẩn Senior (Chụp màn hình ngay):

```text
1. Mở kết nối tốn 3 lượt đi về, mất 5 - 30ms (bằng nửa thời gian 1 API), nên phải dùng POOL.
2. Bể nhỏ mới nhanh: Máy 4 lõi thì đặt Pool khoảng 8 - 10 kết nối rồi đo lại (đừng đặt to gây Context Switch).
3. Khi bể cạn: Cho xếp hàng ở App với Queue Timeout ngắn hơn HTTP Timeout (ví dụ 2s), tránh để nghẽn trong Database.

```

Bể Connection Pool của bạn đang mở bao nhiêu chỗ? Bạn đã bao giờ đo lại chưa? Viết con số xuống bình luận nhé!

---

Dưới đây là transcript đầy đủ toàn bộ nội dung audio/video của bạn:

---

## Transcript Nội Dung Video

**[00:00 - 00:36] Đặt vấn đề: "Vì sao không nên gọi truy vấn trong vòng lập?"**

Trên màn hình là đoạn mã ai cũng từng viết: một vòng lập, bên trong có một câu truy vấn.

```javascript
for (don of don_hang) {
    chi_tiet = query(don.id)
}

```

Người phỏng vấn xoay màn hình lại, rồi hỏi một câu ngắn bằng giọng rất bình thường:

> *"Vì sao không nên gọi truy vấn trong vòng lập?"*

Câu hỏi hiện đủ chữ trên bảng, rồi người phỏng vấn ngồi im, không cho thêm một dữ kiện nào nữa!

Bạn có 3 giây để trả lời trong đầu: **3... 2... 1...**

Bạn vừa trả lời trong đầu rồi đúng không? Giữ lấy câu đó, cuối video ta so lại. **Câu trả lời của bạn ĐÚNG, mà bạn VẪN CÓ THỂ TRƯỢT.** Đó là lời hứa của video này!

3 tầng đào sâu, một cái bẫy nằm ngay trong cách sửa mà ai cũng nghĩ tới đầu tiên, và một câu hỏi ngược thứ làm người phỏng vấn ghi ngay một dòng vào sổ!

---

**[00:36 - 02:09] Tầng 1: Lỗi N+1 Query & Độ trễ mạng (Network Latency)**

Ứng viên trả lời ngay và trả lời ĐÚNG:

> *"Mỗi vòng lập là một lần gọi xuống Database. Chạy 100 vòng thì gọi 100 lần, mà gọi nhiều lần thì chậm, ai cũng biết!"*

Lấy danh sách đơn hàng là **1 câu**.
Rồi với mỗi đơn, lại thêm **N câu** nữa để lấy chi tiết.

Người ta gọi cái này là **Lỗi 1+N Query**, và nó nằm trong mọi dự án!

Người phỏng vấn gật đầu, ghi một dòng vào sổ: **[Gọi nhiều là chậm - ĐÚNG]**.

Đáp án này đúng thật, nó có tên hẳn hoi trong sách, và 9/10 người sẽ trả lời y như vậy. Nhưng cả câu trả lời không có một con số nào! Chậm là chậm bao nhiêu? 100 vòng thì tệ tới mức nào?

#### Tính toán số liệu thực tế:

* **Tại Database:** Mỗi câu SQL chỉ mất **$0.1\text{ms}$**.
* **Độ trễ đường truyền (Network RTT):** Mỗi lượt đi - về trên mạng mất khoảng **$1\text{ms}$** (nếu cùng máy/cùng mạng nội bộ) hoặc **$10\text{ms}$** (nếu khác máy/cloud).

Với 100 đơn hàng ($1 + 100 = 101$ lượt gọi):

* **Cùng máy:** $101 \times 1\text{ms} = \mathbf{101\text{ms}}$ *(trong đó $95\%$ thời gian chỉ để đi lại trên mạng chứ không phải để làm việc!)*.
* **Khác máy (Cloud DB):** $101 \times 10\text{ms} = \mathbf{1.01\text{ giây}}$ cho đúng một trang danh sách!

> **Chốt Tầng 1:** Lỗi 1+N chậm không phải vì Database bận, mà $95\%$ thời gian bị lãng phí do **Network Latency (độ trễ đi lại trên mạng)** của 101 lượt gọi.

---

**[02:09 - 02:57] Tầng 2: Cái bẫy "Gộp thành 1 câu JOIN" (Duplicate Data Overhead)**

Người phỏng vấn hỏi tiếp: *"Vậy gộp hết vào 1 câu `JOIN` là xong đúng không?"*

Ứng viên định gật đầu... (Bạn có gật không đấy?)

Đây là chỗ trượt vì nó **gần đúng**. Gộp lại là đúng hướng, nhưng gộp thành ĐÚNG 1 CÂU `JOIN` lại sinh ra một cái giá khác: **Số dòng trả về bị nhân phình lên!**

#### Bài toán nhân dòng:

* 1 đơn hàng có 10 sản phẩm chi tiết.
* `JOIN` 2 bảng lại: 100 đơn hàng $\rightarrow$ Trả về **1.000 dòng** (vì thông tin đơn hàng bị chép lặp lại 10 lần!).
* Tên khách, địa chỉ, ngày đặt... bị lặp lại 10 lần qua mạng, làm phình bộ nhớ App.

#### Lời giải chuẩn: Gộp thành 2 câu (Batching with `IN`)

1. **Câu 1:** `SELECT * FROM don_hang LIMIT 100;` (Lấy 100 đơn)
2. **Câu 2:** `SELECT * FROM chi_tiet WHERE don_id IN (101, 102, ...);` (Lấy chi tiết 1 lần)

Từ **101 lượt gọi giảm xuống còn 2 lượt**, và không có dòng nào bị nhân lặp!

> **Chốt Tầng 2:** Đừng cố ép về 1 câu `JOIN` gây nhân đôi/nhân mười dữ liệu. Hãy giảm 101 lượt xuống **2 câu lệnh** (1 câu lấy cha + 1 câu `IN` lấy con).

---

**[02:57 - 04:30] Tầng 3: Kích thước lô (Batch Size) & Câu hỏi ngược làm nên đẳng cấp**

Người phỏng vấn dồn tiếp: *"Danh sách có 10.000 đơn, bạn nhét cả 10.000 mã vào mệnh đề `IN` trong 1 câu chứ?"*

Nếu nhét 10.000 mã vào `IN (...)`:

* Mệnh đề `IN` quá dài sẽ vượt trần tham số (PostgreSQL chặn ở 65.535 tham số).
* Mỗi câu `IN` có danh sách khác nhau làm Database không tái sử dụng được Execution Plan (phải Re-parse liên tục).

**Giải pháp:** **Chia lô (Batching / Chunking)**. Chia 10.000 đơn thành các lô 500 - 1.000 mã $\rightarrow$ Chỉ tốn 10 - 20 lượt gọi (thay vì 10.000 lượt).

### Cú lật ngửa: Cạm bẫy "Thiếu dữ kiện"

Câu hỏi ban đầu: *"Vì sao không nên gọi truy vấn trong vòng lập?"* là một câu hỏi **cố ý thiếu dữ kiện**!

* Nếu vòng lập chỉ chạy 10 lần và DB nằm cùng máy $\rightarrow$ Mất $10\text{ms}$, **hoàn toàn ổn, không cần sửa gì cả!**

Người phỏng vấn không đo kiến thức học thuộc, họ đo xem **bạn có biết hỏi ngược lại hay không**:

> *"Vòng lập chạy mấy lần? Database nằm gần hay xa máy chạy mã?"*

* Đoán bừa một con số rồi phán như thật $\rightarrow$ **Trượt!**
* Biết hỏi ngược lại để xác định bối cảnh $\rightarrow$ **Đậu!**

---

**[04:30 - End] Tổng kết & Bảng điểm phỏng vấn**

### 📋 Mẫu câu trả lời 30 giây chuẩn Senior (Chụp màn hình ngay):

```text
1. Trước tiên tôi hỏi lại: Vòng lập chạy mấy lần và Database nằm gần hay xa?
2. Với 100 vòng = 101 lượt gọi: Cùng máy mất ~0.1s, qua mạng mất >1s (95% thời gian lãng phí do đễ trễ mạng).
3. Tôi sẽ gộp từ 101 lượt xuống còn 2 CÂU LỆNH (1 câu lấy cha + 1 câu IN lấy con), tránh dùng 1 câu JOIN gây nhân dòng lặp dữ liệu.
4. Nếu danh sách lớn (>1.000): Tôi sẽ chia lô (Batch size 500 - 1.000) để tránh quá tải tham số.

```

Trang chậm nhất trong hệ thống của bạn đang gọi bao nhiêu lượt xuống Database? Bạn đã đếm thử bao giờ chưa? Viết con số xuống bình luận nhé!

---
 
 Dưới đây là transcript đầy đủ cho video của bạn, kèm theo câu trả lời mẫu 30 giây chuẩn Senior ở cuối:

---

## Transcript Nội Dung Video

**[00:00 - 00:36] Đặt vấn đề: "API trả lỗi 500. Bạn có gọi lại không?"**

Trên màn hình là một dòng lỗi 500 màu đỏ (`500 Internal Server Error`).

Ứng viên vừa kể xong cách mình xử lý, thì người phỏng vấn ngắt lời bằng một câu ngắn, giọng bình thường:

> **"API trả lỗi 500. Bạn có gọi lại (Retry) không?"**

Câu hỏi hiện đủ chữ trên bảng, rồi người phỏng vấn ngồi im, không cho thêm dữ kiện nào (gọi lại thao tác nào, sau bao lâu...).

Bạn có 3 giây để trả lời trong đầu: **3... 2... 1...**

Giữ lấy câu bạn vừa nghĩ trong đầu. **Câu đó ĐÚNG, mà bạn VẪN TRƯỢT**, vì nó còn thiếu đúng 2 con số quan trọng nhất!

---

**[00:36 - 01:18] Tầng 1: Thời gian chờ tăng dần (Exponential Backoff + Jitter)**

Ứng viên trả lời ngay và trả lời ĐÚNG:

> *"Lỗi 500 thường là lỗi tạm thời, nên cứ gọi lại 3 lần, chắc chắn lần sau sẽ chạy."*

Người phỏng vấn gật đầu, ghi một dòng vào sổ: **[Gọi lại 3 lần - ĐÚNG]**.

Đây là đáp án mà 9/10 người sẽ nói. Nhưng cả câu trả lời không có một con số nào:

* *Gọi lại sau bao lâu?*
* *Thao tác nào thì được gọi lại?*

#### Cạm bẫy "Thảm họa tự tấn công" (Retry Storm):

Hệ thống bị lỗi 500 tức là nó **đang yếu/quá tải**. 1.000 máy khách cùng gọi lại ngay lập tức, mỗi máy gọi 3 lần $\rightarrow$ **Tải tăng gấp 4 lần**!
Hệ thống chưa kịp "thở" đã bị đập tiếp, biến sự cố nhỏ thành thảm họa lớn. Và thứ đánh sập hệ thống lúc này không phải người dùng, mà chính là đoạn mã Retry do bạn viết ra!

> **Giải pháp Tầng 1:**
> * Phải **chờ tăng dần (Exponential Backoff)**: 1s, 2s, 4s...
> * Cộng thêm một chút **ngẫu nhiên (Jitter)** để tránh 1.000 máy cùng Retry đúng một thời điểm.
> 
> 

---

**[01:18 - 02:08] Tầng 2: Mã chống trùng (Idempotency Key)**

Người phỏng vấn hỏi tiếp: *"Nếu đó là lệnh tạo đơn hàng, gọi lại có thành 2 đơn không?"*

#### Tình huống trớ trêu:

Hết thời gian chờ (Timeout) **không có nghĩa là máy chủ chưa chạy**. Nó có thể đã tạo xong đơn hàng trong DB rồi, nhưng lượt trả về (Response) bị chậm/mất mạng. Bạn gọi lại lần hai $\rightarrow$ **Tạo thêm 2 đơn giống nhau, khách bị trừ tiền 2 lần!**

> **Giải pháp Tầng 2:**
> * Với thao tác Ghi (POST/PUT/DELETE), client phải gửi kèm một **Mã chống trùng (Idempotency Key)**.
> * Máy chủ nhớ mã đó. Nếu gặp lại mã cũ, máy chủ chỉ trả về kết quả đơn cũ chứ không tạo đơn mới.
> * **Không có mã chống trùng thì TUYỆT ĐỐI KHÔNG RETRY tự động!**
> 
> 

---

**[02:08 - End] Tổng kết & Bảng điểm phỏng vấn**

Họ không hỏi bạn định nghĩa Retry là gì. Họ hỏi **bạn đã từng làm trùng đơn và bị đền tiền chưa**!

---

### 📋 Mẫu câu trả lời 30 giây chuẩn Senior (Chụp màn hình ngay):

```text
1. Chỉ gọi lại (Retry) với các lỗi tạm thời: 500, 502, 503, 504 và Timeout.
2. Thời gian chờ phải TĂNG DẦN (1s, 2s, 4s...) cộng thêm chút NGẪU NHIÊN (Jitter) để tránh Retry Storm.
3. Thao tác ghi (Tạo đơn/Thanh toán) phải gửi kèm MÃ CHỐNG TRÙNG (Idempotency Key).
4. KHÔNG có mã chống trùng thì TUYỆT ĐỐI KHÔNG gọi lại tự động.

```

*(Trích xuất từ câu trả lời mẫu trong video)*

---

Dưới đây là transcript đầy đủ cho video của bạn, kèm theo các mốc thời gian (timestamps) và tóm tắt checklist quan trọng:

---

## Transcript Nội Dung Video

**[00:00 - 00:25] Mở đầu: Tình huống vô lý – Đã đổi mật khẩu nhưng Hacker vẫn trong tài khoản**

Bạn vừa đổi mật khẩu và đăng xuất khỏi mọi thiết bị. Nhưng ngay lúc này, hacker vẫn ung dung ở trong tài khoản như chưa hề có gì xảy ra.

Sao lại vô lý vậy? Đổi mật khẩu đáng lẽ phải cắt đứt mọi kẻ xâm nhập chứ?

Vấn đề không nằm ở mật khẩu, mà ở thứ khác. Kẻ tấn công đã chôm mất "tấm vé thông hành" của bạn — cái Access Token. Và Token đó vẫn còn hiệu lực, bất kể bạn làm gì với mật khẩu!

---

**[00:25 - 01:12] Chặng 1: Phân biệt Xác thực (Authentication) & Ủy quyền (Authorization)**

Tấm vé đó chính là trái tim của Xác thực (AuthN) và Ủy quyền (AuthZ). Mọi bảo mật đều xoay quanh 2 câu hỏi: **Bạn là AI?** và **Bạn được phép LÀM GÌ?**

Ví dụ hình dung khách sạn:

* **Quầy lễ tân:** Bạn đưa CMND/CCCD để chứng minh bạn là ai $\rightarrow$ Đây là **Xác thực (Authentication - AuthN)**.
* **Thẻ phòng:** Lễ tân đưa bạn thẻ phòng để mở đúng phòng 301 của bạn (không mở được phòng khác hay kho bạc) $\rightarrow$ Đây là **Ủy quyền (Authorization - AuthZ)**.

> **Lỗi bảo mật phổ biến (IDOR):** Lập trình viên xác thực đúng người, nhưng lại cho phép sai việc. Ví dụ: Bạn đăng nhập đúng tài khoản, nhưng chỉ cần đổi số ID trên đường link (`/api/user/1025`) là xem được hồ sơ của người khác.

---

**[01:12 - 01:53] Chặng 2: HTTP Stateless & Cơ chế Session**

Giao thức HTTP là **Stateless (không trạng thái)** — nó có "trí nhớ cá vàng", mỗi request là một lần gặp người lạ.

**Giải pháp Session (Stateful):**

* Khi đăng nhập, Server tạo một hồ sơ cất vào tủ và trả về một mã `session_id` cất trong Cookie của trình duyệt.
* Mỗi request sau đó, trình duyệt tự gửi kèm `session_id`, Server tra tủ hồ sơ để biết là bạn.
* **Nhược điểm:** Khó mở rộng (Scale) khi có hàng triệu người dùng vì các Server phải dùng chung 1 tủ hồ sơ.

---

**[01:53 - 02:46] Chặng 3: JWT (JSON Web Token) & Điểm yếu chí mạng**

**JWT (Stateless):** Đảo ngược tư tưởng — Server không lưu gì cả, bạn tự mang theo bằng chứng đã đóng dấu.

JWT gồm 3 phần (ngăn cách bằng dấu chấm): `Header.Payload.Signature`.

* `Header`: Loại Token & thuật toán.
* `Payload`: Thông tin về bạn (User ID, Role...).
* `Signature`: Chữ ký bảo vệ bằng khóa bí mật (Secret Key).

> **Sự thật ít ai nói về JWT:**
> 1. **Encode $\neq$ Encrypt:** `Payload` chỉ mã hóa dạng Base64URL chứ **không được ẩn mật**. Bất kỳ ai chặn được Token đều đọc vách vạch thông tin bên trong!
> 2. **Khó thu hồi (Revoke):** Vì Server không lưu Session, nên khi bạn bấm Đăng xuất hoặc Đổi mật khẩu, Token đã bị lộ của Hacker **vẫn sống cho đến khi HẾT HẠN**!
> 
> 

---

**[02:46 - 03:37] Chặng 4: OAuth 2.0 & OpenID Connect (OIDC)**

Khi bấm *"Đăng nhập bằng Google"*, đó là **OAuth 2.0**.

* **Tương tự chìa Valet của xe hơi:** Bạn đưa chìa Valet cho nhân viên đỗ xe, họ lái được xe nhưng không mở được cốp hay hộp đồ.
* **OAuth 2.0 dùng để ỦY QUYỀN (AuthZ), không phải Xác thực (AuthN)**.
* Muốn dùng để **Xác thực (AuthN)** chuẩn, người ta phủ thêm một lớp là **OpenID Connect (OIDC)**.

---

**[03:37 - End] Chặng 5: Cất Token ở đâu? (Local Connection vs HttpOnly Cookie)**

| Phương pháp | Ưu điểm | Nhược điểm / Nguy cơ |
| --- | --- | --- |
| **`LocalStorage`** | JavaScript đọc/ghi thoải mái, rất tiện. | **Tử huyệt XSS:** Nếu web bị dính lỗi XSS, mã độc sẽ đọc sạch Token gửi cho Hacker. |
| **`HttpOnly Cookie`** | JavaScript **không thể đọc được** $\rightarrow$ **Chống XSS** hoàn toàn. | Cần cẩn thận phòng chống đòn đánh **CSRF**. |

### 📋 Checklist phòng thủ nhiều lớp (Chụp lại):

* [x] Xác thực TRƯỚC, ủy quyền SAU.
* [x] Luôn dùng HTTPS & đặt thời hạn Token NGẮN.
* [x] **Ưu tiên cất Token trong `HttpOnly Cookie` + `SameSite**`.
* [x] KHÔNG để Token nhạy cảm ở `LocalStorage`.
* [x] Luôn có cơ chế THU HỒI Token (Blacklist/Refresh Token) khi đăng xuất hoặc đổi mật khẩu.

---