# Video can lay tay

## A. 8 video KHONG TAI DUOC (chua co transcript)
- https://www.tiktok.com/@lap_trinh_vn/video/7662228673663077652
23 giờ 47 phút, suất chiếu lúc nửa đêm. Trên sơ đồ ghế của rạp, chỉ còn một ghế duy nhất: H7.

Hai người ở hai đầu thành phố không hề quen nhau, và cả hai đang cùng nhìn vào nó. Two ngón tay chạm vào cùng một ô, cách nhau 40 miligiây. Hai vòng tròn chờ cùng quay, rồi hai màn hình cùng hiện một dòng chữ y hệt nhau: "Đặt vé thành công".

Hai tấm vé được in ra, cùng một rạp, cùng một suất chiếu, và cùng một số ghế. Hệ thống trừ tiền của cả hai người không do dự lấy 1 miligiây, nó tin rằng nó vừa làm đúng.

0 giờ 5 phút, đèn rạp đã tắt. Hai người đứng cạnh nhau ở cuối hàng H, hai tấm vé giống hệt nhau trong tay. Trước mặt họ chỉ có một cái ghế.

Không ai hack, không ai gian lận, không có bug. Database vẫn chạy đúng từng chữ bạn ra lệnh. Vấn đề nằm gọn trong 1 giây — cái giây mà hai người cùng bấm. Đây là bài toán kinh điển nhất của lập trình web.
Tua chậm cái giây đó ra. Đoạn code đặt vé nhìn hiền như đất, ai đọc cũng thấy nó đúng. Nó chỉ làm hai việc: kiểm tra xem ghế còn trống không, nếu còn trống thì ghi là đã bán. Đọc rồi ghi, hết.

Nhưng giữa dòng đọc và dòng ghi luôn có một khe hở, vài miligiây thôi. Với bạn thì bằng 0, với database đủ để cả một người khác chen vào đọc xong, ghi xong và đi ra trước khi bạn kịp chớp mắt.

A đọc: ghế trống.

B đọc: cũng trống (vì A chưa kịp ghi).

A ghi: đã bán.

B ghi đè lên: cũng đã bán.

4 nhịp đúng thứ tự đó, không sai ly nào. Và cái ghế bị bán hai lần cho hai người. Lỗi này có tên riêng: Race Condition (điều kiện tranh đua). Hai tiến trình chạy đua trên cùng một dòng dữ liệu. Ở mọi cuộc đua khác chỉ có một người thắng, ở đây cay đắng thay, cả hai cùng về nhất.

[02:02 - 02:51] Giải pháp 1: Transaction (Giao dịch) & Khóa bi quan (Pessimistic Locking)

30 năm nay, database sinh ra chỉ để giết con quái vật này. Nó đưa cho bạn đúng 3 vũ khí: một cái bọc, một ổ khóa, và một chiếc đồng hồ đếm ngược. Lấy từng cái ra mổ xẻ cho kỹ.

Vũ khí thứ nhất: Transaction (Giao dịch)
Hình dung nó là một cái bọc. Mọi việc bạn nhét vào trong bọc: hoặc xong hết sạch, hoặc không có gì xảy ra cả. Không có nửa vời, không có chuyện làm được một nửa.

Vì đặt một tấm vé không phải một việc, nó là 4 việc dính chặt vào nhau:

Đổi trạng thái ghế

Tạo bản ghi booking mới

Trừ tiền trong ví

Bắn mail xác nhận cho khách

Giả sử bước 3 (trừ tiền) gãy, nhưng bước 1 đã kịp ghi ghế là "đã bán". Kết quả: cái ghế đó chết, không ai mua được nữa mà cũng chẳng ai trả cho bạn đồng nào, ghế treo lơ lửng. Đây là lúc cái bọc phát huy tác dụng: BEGIN... làm... gãy giữa chừng thì ROLLBACK, database tua ngược, xóa sạch mọi thứ bạn vừa ghi như chưa từng có chuyện gì. Ghế trống lại, tiền còn nguyên.

Và đây, chỗ mà 9/10 developer hiểu sai: Bọc code vào transaction, thấy chữ BEGIN / COMMIT là yên tâm. Nhưng transaction không chống được hai người cùng đặt một ghế. Không hề, một chữ cũng không! Hai transaction chạy song song vẫn cùng đọc thấy ghế trống. Transaction bảo vệ sự trọn vẹn của một chuỗi việc, nó chưa bao giờ hứa bảo vệ quyền độc chiếm một dòng dữ liệu. Hai chuyện hoàn toàn khác nhau, đừng lẫn lộn!

Ghi lại đi: Giao dịch cho bạn được ăn cả, ngã về 0. Nó là cái bọc giữ cho chuỗi việc không đứt gánh giữa đường, nhưng nó không phải hàng rào. Hàng rào là vũ khí tiếp theo.

Vũ khí thứ hai: Khóa bi quan (Pessimistic Locking)
Triết lý của nó đúng như tên: luôn giả định điều tệ nhất, kiểu gì cũng có thằng khác nhảy vào cướp, nên là khóa trước - hỏi sau. Cứ khóa đã, ai tới sau thì đợi.

Câu thần chú chỉ có 2 chữ: FOR UPDATE.

Bạn đọc ghế H7 mà kèm theo 2 chữ đó, database sẽ khóa đúng một dòng ấy lại. Không khóa cả bảng, không khóa cả rạp, chỉ đúng dòng H7 mà thôi.

40 miligiây sau, B tới. Câu lệnh của B đứng im, không văng lỗi, không trả về gì cả. Nó chỉ đợi. Đợi cho tới khi A nhả khóa ra. Đứng đó, im lặng, không kêu ca gì.

A ghi xong, gọi COMMIT, khóa nhả. Đúng lúc đó câu lệnh của B mới chạy tiếp và nó đọc lại được sự thật mới nhất: ghế H7 đã bán. B nhận thông báo và đi chọn ghế khác. Không ai mất gì.

Code thật thì đúng 5 dòng:

Mở giao dịch

Đọc ghế kèm FOR UPDATE

Kiểm tra

Ghi

Đóng giao dịch

Khóa tự nhả khi COMMIT, bạn không phải tự mở, cũng không phải nhớ dọn dẹp gì hết.

Nhưng khóa có giá của nó. Vé concert mở bán, 5.000 người cùng chen vào một dòng, người cuối hàng phải đợi gần 5.000 lượt. Hàng đợi dài ra, kết nối cạn, cả web treo.

Chốt chặng 1 & 2: Khóa bi quan đúng chắc chắn, đổi bằng thông lượng. Dùng khi va chạm thật sự nhiều — mà suất phim hot thì đúng là nhiều thật.

[02:51 - 03:36] Giải pháp 2: Khóa lạc quan (Optimistic Locking)

Còn nếu va chạm là chuyện hiếm, cả nghìn lượt mới đụng một lần?

Vũ khí thứ ba: Khóa lạc quan (Optimistic Locking)
Triết lý ngược hẳn: va chạm là chuyện hiếm, vậy thì đừng bắt ai xếp hàng cả. Cứ để tất cả cùng đọc thoải mái, kiểm tra lúc ghi mới kiểm. Ai chậm tay thì chịu.

Bí mật nằm ở một cột duy nhất thêm vào bảng ghế: cột version.

Ghế H7 đang ở version = 5.

A đọc: thấy 5.

B đọc: cũng thấy 5.

Chưa ai khóa, chưa ai đợi ai, cả hai đều đi tiếp.

A ghi trước, nhưng câu UPDATE của A có thêm một mệnh đề: chỉ ghi nếu version vẫn còn bằng 5. Đúng là còn 5! Ghi thành công, và version tự nhảy lên 6 ngay lập tức.

B ghi câu y hệt: điều kiện version = 5. Nhưng version giờ là 6 rồi! Database không báo lỗi, không văng Exception, nó lặng lẽ trả về một con số lạnh lùng: 0 dòng bị ảnh hưởng (0 rows affected).

Và đây là cái bẫy chết người: Nếu code của bạn không thèm đọc con số 0 đó, nó tưởng mọi thứ ổn, nó vẫn trừ tiền, vẫn gửi mail, vẫn in vé. Vé ma!

Còn nếu bạn chịu đọc con số đó thì mọi thứ dễ như ăn kẹo. 0 dòng bị ảnh hưởng nghĩa là có người nhanh tay hơn. Trả về màn hình một câu: "Ghế vừa có người chọn".

Chốt chặng 3: Lạc quan không khóa ai nên nhanh, nhưng bắt bạn phải tự kiểm số dòng bị ảnh hưởng. Bi quan thì database gánh hộ bạn việc đó. Chọn cái nào, thực chất là chọn ai gánh trách nhiệm.

[03:36 - 04:14] Xử lý trạng thái giữ ghế (Hold) & Lỗi Cron Job

Còn một chuyện chưa ai chạm tới: Bấm chọn ghế xong, người ta còn phải nhập số thẻ, chờ mã OTP, bấm xác nhận, có khi còn đi tìm cái ví mất 10 phút. Trong 10 phút đó, cái ghế H7 là cái gì?

Nó là trạng thái thứ ba: Đang giữ (HOLD). Không phải trống, cũng chưa phải đã bán. Nó lơ lửng ở giữa, kèm theo two cột mới: Ai đang giữ nó? và Giữ tới mấy giờ?

Điều kiện để cướp được một cái ghế viết ra chỉ một dòng:

Hoặc ghế đang trống, OR ghế đang bị giữ nhưng đã quá hạn.

Viết thẳng cái OR đó vào mệnh đề WHERE để chính database quyết định, không phải code của bạn.

Chỗ này 9/10 người làm sai: Viết một con Cron Job chạy mỗi phút, quét bảng giải phóng ghế hết hạn. Nghe rất hợp lý, ai cũng từng viết con Cron đó ít nhất một lần. Nhưng nó sai!

Vì Cron chạy mỗi phút. Ghế hết hạn lúc 23:57:01, thì tới 23:58 nó mới được thả. Gần 1 phút ghế bị treo oan, trong khi cả nghìn người đang tranh nhau nó.

Vậy đồng hồ nào? Đồng hồ của database! Không phải đồng hồ máy người dùng (chỉnh lùi một cái là giữ ghế vô hạn), không phải đồng hồ con server (mỗi con lệch một kiểu). Một cái đồng hồ, một sự thật.

Chốt chặng 4: Hết hạn là một điều kiện ngay tại khoảnh khắc bạn hỏi, chứ không phải một công việc chạy nền.

[04:14 - 05:00] Tránh Deadlock & Tổng kết

4 chặng, xong. Bạn nghĩ thế là an toàn rồi chứ? Chưa đâu!

Lớp phòng thủ cuối: Tránh Deadlock
Giao dịch, khóa, hết hạn... bạn nghĩ mình an toàn rồi, code sạch, ngủ ngon. Nhưng khóa là con dao hai lưỡi, và giờ tôi cho bạn xem lưỡi kia. Cái lưỡi quay ngược vào chính bạn.

Nhóm bạn đặt two ghế: H7 rồi H8.

Nhóm kia đặt cũng two ghế đó, nhưng ngược thứ tự: H8 rồi H7.

A giữ H7, đợi H8.

B giữ H8, đợi H7.

Cả hai cùng đợi... mãi mãi. Không ai nhường ai.

Cái này có tên: Deadlock (khóa chết). Database phát hiện được và nó xử lý rất phũ: bắn chết một bên.

Cách né thì rẻ đến bất ngờ: Luôn khóa theo một thứ tự cố định. Sắp xếp mã ghế trước khi khóa. Chỉ vậy thôi!

Khi quy mô quá lớn
Cả sự thật còn cay hơn: 5.000 người cùng bấm một suất thì không database nào chịu nổi. Dân trong nghề không đấu tay đôi với nó, họ đẩy cuộc đua ra ngoài: Redis, hàng đợi, phòng chờ... trước khi nó chạm được vào bảng.

[05:00 - End] Kết bài

Nhìn kỹ lại đi. Cái ghế H7 không phải cái ghế, nó là một dòng trong một cái bảng. Ai giữ được dòng đó, người đó có ghế. Cả cái rạp hàng nghìn chỗ ngồi, hàng nghìn con người, thu về một dòng dữ liệu.

Quay lại đêm hôm đó, 23 giờ 47 phút. Vẫn đúng đoạn code cũ, chỉ thêm two chữ FOR UPDATE. B vẫn bấm sau 40 miligiây. Nhưng lần này màn hình của B hiện một dòng chữ khác hẳn, không phải thành công.

Nhờ đúng 3 lớp này, theo đúng thứ tự:

Giao dịch: giữ cho chuỗi việc trọn vẹn.

Khóa: giữ cho cái ghế độc quyền.

Hết hạn: giữ cho hàng đợi công bằng.

Thiếu lớp nào, thủng lớp đó. Người dùng sẽ tìm ra trước bạn.

Nửa đêm, two người vẫn đứng cạnh nhau trong bóng tối. Nhưng two tấm vé giờ ghi two số ghế khác nhau: H7 và H8. Không ai mất tiền, không ai mất ghế, không ai cãi nhau ở cửa rạp. Đèn tắt, phim bắt đầu.

Còn hệ thống của bạn đang khóa bi quan hay lạc quan? Đã bao giờ bạn quên kiểm số dòng 0 bị ảnh hưởng chưa? Kể ở phần bình luận nhé! Thấy hay thì cho mình Like và Đăng ký. Video sau mình mổ tiếp cái phòng chờ!

- https://www.tiktok.com/@lap_trinh_vn/video/7663191208319077652
  381s | 2026-07-16 | SQL Cơ bản: Phần 7: LIKE - IN - BETWEEN - IS NULL #sql #database #bac.Dưới đây là transcript đầy đủ cho file của bạn (không có phần quảng cáo nào cần lọc trong file này):

---

## Transcript Nội Dung Video

**[00:00 - 00:54] Đặt vấn đề: Giới hạn của dấu `=` trong SQL**

Phòng đào tạo cần danh sách tất cả sinh viên họ Nguyễn — một việc tưởng dễ. Bạn tự tin gõ `WHERE ho_ten = 'Nguyễn'` rồi bấm chạy. Màn hình trả về đúng con số 0, không một dòng nào.

Nhưng khoan đã, cuộn bảng xuống, rõ ràng có Nguyễn An, có Nguyễn Bình, có cả một loạt người họ Nguyễn ngồi ngay đó. Vậy tại sao câu lệnh lại bảo là không có ai?

Đây là cái bẫy: dấu `=` đòi khớp chính xác từng ký tự. Nó đi tìm một người có tên đầy đủ chỉ vỏn vẹn là "Nguyễn", mà không ai tên như thế. "Nguyễn An" khác "Nguyễn", nên máy trả về rỗng.

Dấu `=` bó tay không chỉ ở đây, nó chịu thua khi:

* Bạn chỉ nhớ một phần cái tên
* Khi cần lọc theo cả một danh sách
* Khi cần một khoảng
* Khi ô dữ liệu bị bỏ trống

4 tình huống, và SQL có đúng 4 vũ khí cho chúng. Học xong 4 cái tên này, bạn lọc được gần như mọi thứ: bao gồm `LIKE`, `IN`, `BETWEEN`, và `IS NULL`.

Trước khi vào từng vũ khí, hiểu cho rõ kẻ vừa thua: Dấu `=` là phép so khớp tuyệt đối, hai vế phải giống nhau y hệt, đúng từng ký tự một (chuỗi `"Công nghệ thông tin"` = chuỗi `"Công nghệ thông tin"` thì đúng, nhưng `"Nguyễn"` không bằng `"Nguyễn An"`). Nhưng đời thực bạn hiếm khi biết chính xác: Bạn chỉ nhớ tên bắt đầu bằng "Nguyễn", bạn muốn vài khoa cùng lúc, bạn cần các bạn sinh trong khoảng 3 năm, hoặc bạn đi tìm những ô còn để trống.

Mỗi tình huống có một toán tử riêng. Điều hay là chúng lắp vào đúng chỗ của dấu `=` ngày hôm qua — `WHERE` vẫn là mệnh đề lọc hàng cũ, bạn chỉ đổi phép so sánh ở giữa, thế thôi!

---

**[00:54 - 01:54] Vũ khí 1: Toán tử `LIKE` (Tìm theo mẫu)**

4 toán tử, ta học lần lượt từng cái.

Đầu tiên là cái giải đúng bài toán họ Nguyễn ở đầu video: toán tử tìm theo mẫu — chính là mảnh ghép còn thiếu, tên nó là `LIKE`. Bắt đầu thôi!

`LIKE` nghĩa là "gần giống", là khớp theo một mẫu chứ không phải khớp cứng. Cú pháp y như cũ, chỉ thay dấu `=` thành chữ `LIKE`:

```sql
WHERE ho_ten LIKE 'Nguyễn%'

```

Bí mật nằm ở dấu `%` này. Dấu `%` là một dải cao su, nó khớp với 0, 1 hay bao nhiêu ký tự cũng được. `'Nguyễn%'` nghĩa là bắt đầu bằng "Nguyễn", còn phía sau dài ngắn gì cũng nhận (Nguyễn An, Nguyễn Bình dính hết).

* Đảo dấu `%` ra trước thì đổi nghĩa: `'%An'` là kết thúc bằng chữ "An".
* Đặt `%` cả hai bên: `'%Văn%'` là chứa chữ "Văn" ở bất kỳ đâu trong tên.

Còn một ký tự đại diện nữa: dấu gạch dưới `_`. Nó khớp đúng 1 ký tự, không hơn. Mã sinh viên `SV_1` sẽ bắt `SV01`, nhưng chê `SV001` vì chỗ đó chỉ cho đúng 1 ký tự.

Nhớ bài toán họ Nguyễn đầu video chứ? Trước nó trả về rỗng, giờ chỉ cần một dấu `%`: `LIKE 'Nguyễn%'`, và danh sách hiện ra đủ mặt. Không phải dữ liệu sai, chỉ là ta hỏi sai cách.

Vẫn còn một góc khuất: Đặt dấu `%` ở đầu chuỗi (kiểu `'%An'`) thì máy không đoán trước được, nó buộc phải rà từng dòng trong bảng. Với bảng nhỏ thì không sao, nhưng hãy nhớ điều này lại.

> **Chốt `LIKE`:** `%` khớp nhiều ký tự, `_` khớp đúng 1. Một lưu ý nhỏ: `%` ở đầu chuỗi khiến máy quét cả bảng, nên chậm hơn dấu `=`. Ta sẽ quay lại chuyện đó.

---

**[01:54 - 02:35] Vũ khí 2: Toán tử `IN` (Lọc theo danh sách)**

Vũ khí thứ hai: `IN`.

Giả sử phòng đào tạo cần sinh viên của 3 khoa: Công nghệ thông tin, Kinh tế, và Ngoại ngữ. Cách người thơ là viết 3 điều kiện nối bằng `OR` (khoa bằng cái này, OR bằng cái kia).

`IN` nén 3 dòng đó lại thành 1:

```sql
WHERE khoa IN ('Công nghệ thông tin', 'Kinh tế', 'Ngoại ngữ')

```

Mở ngoặc, liệt kê các giá trị cách nhau bằng dấu phẩy. Ngắn hơn, dễ đọc hơn, và ít chỗ để gõ sai hơn hẳn 3 vế `OR`.

Hiểu đơn giản, `IN` là câu hỏi: *"Giá trị của hàng có nằm trong danh sách này không?"*. Có thì đi tiếp, không thì rớt. An khoa CNTT (có trong danh sách) -> đi tiếp; Kiên khoa Luật (không có tên) -> rớt lại.

Thêm chữ `NOT` ở trước thì lật ngược ý nghĩa: `NOT IN` là loại trừ.

```sql
WHERE khoa NOT IN ('Luật', 'Y')

```

Nghĩa là lấy tất cả trừ 2 khoa nằm trong danh sách. Ai có tên trong ngoặc thì lần này bị gạch đi.

> **Chốt `IN`:** Khi bạn thấy mình sắp viết nhiều vế `OR` trên cùng một cột, gần như chắc chắn `IN` sẽ gọn hơn. Và `NOT IN` cho bạn làm điều ngược lại: loại bỏ nguyên một nhóm.

---

**[02:35 - 03:13] Vũ khí 3: Toán tử `BETWEEN` (Lọc theo khoảng)**

Vũ khí thứ ba là `BETWEEN` — dùng cho một khoảng.

Cần sinh viên sinh từ 2006 đến 2008? Thay vì ghép `>=` với `<=`, ta viết gọn một dòng:

```sql
WHERE nam_sinh BETWEEN 2006 AND 2008

```

Hình dung một trục số: `BETWEEN` tô sáng cả đoạn từ mốc đầu tới mốc cuối. Điểm mấu chốt (và cũng là chỗ nhiều người quên): **Cả hai đầu mút đều được tính.** 2006 tính, 2008 cũng tính, không bị bỏ sót. Nói cách khác, `X BETWEEN A AND B` chính là `(X >= A) AND (X <= B)` gộp làm một.

Nhớ tính luôn hai đầu để khỏi vô tình bỏ mất mấy bạn sinh đúng năm 2008.

`BETWEEN` không chỉ cho số, nó chạy ngon với ngày tháng:

```sql
WHERE ngay_sinh BETWEEN '2006-01-01' AND '2008-12-31'

```

Chỉ cần viết ngày theo chuẩn `YYYY-MM-DD` (Năm - Tháng - Ngày) nối bằng dấu gạch.

> **Chốt `BETWEEN`:** Một khoảng, tính cả hai đầu, dùng được cho số lẫn ngày.

---

**[03:13 - 04:09] Vũ khí 4: Toán tử `IS NULL` (Xử lý ô trống)**

3 vũ khí đã nằm trong túi, nhưng cái thứ tư mới là nơi nhiều người gục ngã: nó liên quan tới những ô trống.

Nhìn lại bảng, cột Số điện thoại không phải ai cũng có. Vài bạn chưa cập nhật nên ô đó bị bỏ trống. Trong cơ sở dữ liệu, ô trống đó không phải chuỗi rỗng `""`, cũng không phải số `0`. Nó có một cái tên riêng: **`NULL`**.

Nhiệm vụ: tìm các bạn còn thiếu số điện thoại để nhắc cập nhật. Rất tự nhiên, bạn viết theo phản xạ cũ:

```sql
WHERE so_dien_thoai = NULL

```

Trông hợp lý quá còn gì! Bấm chạy đầy tự tin... và lịch sử lặp lại: 0 dòng nào!

I hệt cú sốc họ Nguyễn lúc đầu, dù bạn nhìn rõ ràng có mấy ô đang để trống ngay trước mắt, máy khăng khăng bảo "không tìm thấy ai". Chuyện gì đang xảy ra?

Và đây là mấu chốt: **`NULL` không phải một giá trị, nó nghĩa là "chưa biết".** Bạn không thể so sánh bằng `=` với một thứ chưa biết. Dấu `=` cứ trượt qua đám sương, chẳng tóm được gì.

Hỏi "mấy chưa biết" có bằng "chưa biết" không? Bạn tưởng là đúng, nhưng máy trả lời: "Cũng không biết!". Không phải đúng, không phải sai, mà là **không xác định** (UNKNOWN). Và `WHERE` chỉ giữ lại những hàng ĐÚNG HẲN, không xác định thì bị loại.

Nên `NULL` có bộ toán tử riêng và bạn phải dùng đúng nó:

* `WHERE so_dien_thoai IS NULL` (đọc là *is null*) mới thật sự tóm được những ô trống.
* Muốn ngược lại (tìm người đã có số): viết `IS NOT NULL`.

> **Chốt `NULL` và nhớ nằm lòng:** Đừng bao giờ so sánh `=` với `NULL`, luôn dùng `IS NULL` hoặc `IS NOT NULL`. Nhớ mỗi câu này thôi, bạn đã hơn rất nhiều người đi trước!

---

**[04:09 - 05:00] Những cái bẫy hiệu năng, lưu ý nâng cao & Tổng kết**

Giờ trả lại món nợ lúc nãy: 4 vũ khí này tiện nhưng không miễn phí!

* `LIKE` là ví dụ rõ nhất. Khi dấu `%` nằm ở đầu chuỗi, máy không dùng được chỉ mục (index), đành lật từng dòng một để kiểm tra. Bảng vài chục dòng thì chẳng sao, nhưng bảng vài triệu dòng, kiểu tìm kiếm quét sạch như vậy có thể biến một câu truy vấn tức thì thành một câu chờ mỏi mắt. Tiện tay không có nghĩa là miễn phí!
* Cái bẫy `NULL` còn âm thầm hơn bạn tưởng: Nó không chỉ phá dấu `=`, mà phá luôn `NOT IN`. Nếu danh sách lỡ chứa một giá trị `NULL`, cả câu có thể trả về rỗng dù dữ liệu vẫn còn nguyên đó.

Rút ra một câu để đời: **`NULL` không phải giá trị, nó là khoảng trống.** Hễ một cột có thể bị bỏ trống, thì trước khi so sánh hãy nghĩ ngay tới `IS NULL`. Thói quen nhỏ đó cứu bạn khỏi hàng giờ soi lỗi!

Cùng gom lại cả kho vũ khí:

1. **`LIKE`:** cho khớp theo mẫu
2. **`IN`:** cho lọc theo một danh sách
3. **`BETWEEN`:** cho một khoảng, tính cả hai đầu
4. **`IS NULL`:** cho những ô còn thiếu dữ liệu

4 toán tử, 4 tình huống. Quay về đúng nơi ta bắt đầu: Dấu `=` bó tay với họ Nguyễn, giờ đã có `LIKE` gánh. Dữ liệu chưa bao giờ sai, vấn đề chỉ là bạn có cầm đúng vũ khí để hỏi hay không.

Tới đây, bạn đã lọc gọn từng hàng theo ý mình. Nhưng bài sau sẽ nâng cấp: thay vì soi từng hàng, ta tính toán trên cả nghìn hàng cùng lúc — đếm, cộng, và tính trung bình.

Nếu video giúp bạn gỡ được nút thắt nào đó, cho mình một lượt thích và đăng ký nhé! Bạn từng dính cú lừa bằng `NULL` lần nào chưa? Kể ở phần bình luận nhé!
- https://www.tiktok.com/@lap_trinh_vn/video/7667425788060323079
  335s | 2026-07-28 | SQL cơ bản: Phần 16: CASE WHEN - XẾP LOẠI NGAY TRONG CÂU LỆNH  #sql #.Dưới đây là transcript đầy đủ cho file audio/video của bạn (không có nội dung quảng cáo trong file này):

---

## Transcript Nội Dung Video

**[00:00 - 00:54] Đặt vấn đề: Nhu cầu phân loại dữ liệu (Xếp loại điểm)**

300 dòng điểm, cột xếp loại vẫn trống trơn. Sếp muốn có ngay chiều nay: Giỏi, Khá, Trung bình, Yếu cho từng sinh viên. Mà trong bảng chỉ có mỗi con số, không có lấy một chữ nào.

Cách nhanh nhất ai cũng nghĩ ra: kéo giãn Excel, gõ tay từng ô. 300 ô, nửa buổi chiều. Tháng sau điểm cập nhật lại làm từ đầu, nghe thôi đã thấy mệt rồi.

Quy tắc thì đơn giản:

* Từ 8.0 trở lên là **Giỏi**
* 6.5 trở lên là **Khá**
* 5.0 trở lên là **Trung bình**
* Dưới nữa là **Yếu**

Trong đầu bạn, nó chỉ là 4 cái ngưỡng. Nhưng khoan! 4 cái ngưỡng đó sao không nói thẳng cho cơ sở dữ liệu nghe để chính nó dán nhãn ngay trong lúc lấy dữ liệu ra?

Cơ sở dữ liệu làm được chuyện đó, chỉ cần thêm vài dòng vào giữa câu lệnh, mỗi hàng sẽ tự nhận nhãn của mình. Hai từ khóa thôi: **`CASE WHEN`**.

---

**[00:54 - 01:54] Cú pháp & Cách hoạt động của `CASE WHEN**`

`CASE WHEN` là một cái máy dán nhãn đặt ngay trong câu lệnh. Nó đọc từng hàng so với điều kiện bạn đặt ra rồi trả về đúng một giá trị cho hàng đó.

Có một chuyện phải nói ngay: `CASE WHEN` **không hề sửa dữ liệu trong bảng**. Nó chỉ tạo thêm một cột ngay lúc bạn lấy dữ liệu ra, đóng câu lệnh lại là cột đó biến mất.

Cấu trúc đọc lên nghe như tiếng Việt: `WHEN` là *khi*, `THEN` là *thì*.

> *"Khi điểm từ 8 trở lên thì là Giỏi"*.

Cứ một cặp *khi - thì* là một mức. Hết các mức thì đóng lại bằng `END`.

**Ví dụ:**
Bạn Ngọc 8.7 điểm. Máy so với ngưỡng đầu tiên (8.0): đạt! Dán nhãn "Giỏi", xong hàng này, không cần đi tiếp xuống dưới nữa.

Nghe thì đơn giản, nhưng người mới hay vấp đúng 3 chỗ:

1. Viết sao cho đúng cú pháp
2. Sếp điều kiện theo thứ tự nào
3. Làm sao đếm được số sinh viên mỗi loại

---

**[01:54 - 02:51] Cách hoạt động chi tiết & Cấu trúc câu lệnh**

Đây là câu lệnh thật, không cắt xén: vẫn là `SELECT` quen thuộc lấy Họ tên và Điểm, chỉ chèn thêm khối `CASE` vào giữa, đặt tên cột mới bằng `AS` (ở đây là `XepLoai`):

```sql
SELECT ho_ten, diem,
    CASE 
        WHEN diem >= 8.0 THEN 'Giỏi'
        WHEN diem >= 6.5 THEN 'Khá'
        WHEN diem >= 5.0 THEN 'Trung bình'
        ELSE 'Yếu'
    END AS XepLoai
FROM bang_diem;

```

Khối `CASE` trông như một dãy cổng xếp dọc. Mỗi `WHEN` là một cổng có một điều kiện gác. Hàng dữ liệu đi từ cổng trên xuống, cổng nào cho qua trước thì nhận nhãn của cổng đó.

* **Ngọc (9.0):** Cổng đầu hỏi *"Có từ 8.0 trở lên không?"* -> Có! Ngọc nhận nhãn "Giỏi" rồi rẽ ra ngoài luôn, các cổng còn lại Ngọc không bao giờ nhìn thấy.
* **Hùng (6.9):** Cổng đầu không cho qua. Hùng đi tiếp xuống cổng thứ hai (*từ 6.5 trở lên*) -> Lọt! Hùng nhận nhãn "Khá".

Vẫn là một hàng, một nhãn, không ai nhận 2 lần. Nhiều người viết thêm `< 8.0` vào cổng thứ hai cho chắc là thừa, vì ai từ 8.0 trở lên đã bị cổng đầu giữ lại rồi, không xuống được tới đây. Điều kiện sau chỉ cần lo phần còn lại.

### 2 lỗi hay gặp:

1. **Quên `END`:** Máy đọc tới cuối khối mà không thấy chỗ đóng, báo lỗi cú pháp ngay, câu lệnh không chạy. (Lỗi này dễ thấy vì máy la lên liền).
2. **Quên `ELSE`:** Hàng nào không lọt cổng nào sẽ nhận giá trị rỗng (`NULL`). Câu lệnh vẫn chạy ngon lành không báo gì, bạn chỉ phát hiện ra khi nhìn thấy cột bị trống.

> **Chốt khối 1:** `CASE` đi từ trên xuống, gặp điều kiện đúng đầu tiên là dừng. `END` để đóng khối, `ELSE` để hứng phần còn lại.

---

**[02:51 - 03:36] Cái bẫy Sai thứ tự điều kiện**

Giờ thử phá một cái cho nhớ: vẫn 4 mức đó nhưng đảo thứ tự, đưa điều kiện rộng nhất (*từ 5.0 trở lên*) lên đứng đầu:

```sql
-- LỖI SAI THỨ TỰ ĐIỀU KIỆN
CASE 
    WHEN diem >= 5.0 THEN 'Trung bình'
    WHEN diem >= 6.5 THEN 'Khá'
    WHEN diem >= 8.0 THEN 'Giỏi'
    ELSE 'Yếu'
END

```

Câu lệnh vẫn chạy, không một lời cảnh báo, và đây mới là chỗ đau!

Ngọc (9.0) đi vào cổng đầu. Hỏi *"Có từ 5.0 trở lên không?"* -> 9.0 thì đương nhiên là có! Thế là Ngọc bị chộp ngay tại cổng đầu, nhận nhãn "Trung bình" đúng luật! Cổng "Giỏi" nằm ngay bên dưới chỉ cách một dòng, nhưng Ngọc đã rẽ ra mất rồi.

Chạy hết bảng, kết quả ra: Cả lớp Trung bình, không một ai Giỏi, không một ai Khá! Đọc lại câu lệnh 10 lần cũng không thấy lỗi vì nó không sai cú pháp, máy làm đúng y như những gì bạn viết, chỉ là bạn viết nhầm thứ tự.

### Quy tắc "Cái sàng":

Điều kiện `>= 5.0` là cái sàng lỗ to nhất, gần như ai cũng lọt. Đặt nó lên đầu thì nó hứng sạch, mấy cái sàng dưới còn gì để lọc?

> **Luật:** Xếp điều kiện khắt khe nhất lên trên, rồi nới rộng dần xuống dưới (Giỏi -> Khá -> Trung bình -> phần còn lại).

*Mẹo thử nhanh:* Lấy giá trị cao nhất trong bảng chạy thử một câu, nếu nó rơi vào mức thấp thì gần như chắc chắn bạn đã xếp ngược.

---

**[03:36 - 04:14] Kết hợp `CASE WHEN` với `GROUP BY` & `COUNT` (Tạo báo cáo)**

Sếp hỏi tiếp một câu rất thường gặp: *"Bao nhiêu bạn qua môn?"* lúc này sếp không cần danh sách 300 dòng nữa, sếp cần đúng 2 con số: **Đạt bao nhiêu? Không đạt bao nhiêu?**

Vẫn là `CASE WHEN`, nhưng gọn hơn (chỉ cần mốc 5.0):

```sql
SELECT 
    CASE 
        WHEN diem >= 5.0 THEN 'Đạt'
        ELSE 'Không đạt'
    END AS KetQua,
    COUNT(*) AS SoLuong
FROM bang_diem
GROUP BY 
    CASE 
        WHEN diem >= 5.0 THEN 'Đạt'
        ELSE 'Không đạt'
    END;

```

Cái hay nằm ở dòng `GROUP BY`: gom các hàng lại theo đúng cái nhãn vừa dán. Nhãn giống nhau thì về chung một nhóm.

* 2 cái giỏ đặt cạnh nhau: một giỏ ghi "Đạt", một giỏ ghi "Không đạt".
* Từng hàng chạy qua `CASE`, nhận nhãn, rồi rơi vào đúng giỏ của mình.
* `COUNT(*)` đếm xem mỗi giỏ có bao nhiêu hàng.

Chạy thật trên bảng điểm: **228 hàng Đạt**, **72 hàng Không đạt** (76% qua môn). 300 dòng gói gọn trong 2 con số đúng bằng câu hỏi của sếp.

> **Chốt khối 3:** Dán nhãn bằng `CASE`, gom nhóm bằng `GROUP BY`, đếm bằng `COUNT`. 3 bước biến một bảng dài thành một bản báo cáo!

---

**[04:14 - End] Lưu ý nâng cao & Mở rộng**

Cách này có một cái giá: 4 cái ngưỡng đang **nằm cứng** trong câu lệnh chứ không nằm trong dữ liệu. Sang năm nhà trường sửa quy chế (Giỏi phải từ 8.5), bạn phải mở lại từng câu lệnh có `CASE WHEN` để sửa tay.

*Cách bài bản:* Đưa ngưỡng vào một bảng quy chế riêng rồi `JOIN` vào khi cần.

Ngoài ra, tên cột tự đặt trong `SELECT` có được dùng thẳng ở `GROUP BY` hay không phụ thuộc vào hệ quản trị CSDL (MySQL cho phép, SQL Server bắt chép lại cả khối `CASE`).

**Tổng kết bài học:**

* `CASE WHEN` dán nhãn ngay trong câu lệnh.
* Đi từ trên xuống, dừng ở điều kiện đúng đầu tiên.
* Xếp điều kiện khắt khe lên trước, rộng xuống sau.
* Nhãn dán xong có thể dùng để gom nhóm (`GROUP BY`).
- https://www.tiktok.com/@lap_trinh_vn/video/7661610963107351828
  318s | 2026-07-12 | WebSockets: Xử Lý Kết Nối Thời Gian Thực #backend #frontend #laptrinh.Dưới đây là transcript toàn bộ nội dung audio/video của bạn:Transcript Nội Dung Video[00:00 - 00:36] Đặt vấn đề: Sự cố Server quá tải (EMFILE / Too many open files)20 giờ 03 phút, trọng tài thổi còi, trận chung kết bắt đầu. Và trong đúng 40 giây đó, 120.000 người cùng mở ứng dụng xem trực tiếp của bạn.Server chết! Nhưng nhìn vào biểu đồ:CPU chỉ 4%RAM còn trống một nửaKhông một request nào trả về lỗi 500Chỉ đơn giản là không ai kết nối vào được nữa.Bạn mở log, không stack trace, không exception, chỉ một dòng lặp đi lặp lại đến vô tận:EMFILE: too many open files (1024)1024 — đó không phải giới hạn của RAM hay CPU, đó là số "sợi dây" (File Descriptor) mà một tiến trình được phép cầm cùng lúc. Và bạn chưa bao giờ đếm chúng.[00:36 - 01:10] Bản chất của Kết nối Thời gian thực & Bài toán C10KĐây là câu chuyện về thứ khó nhất trong lập trình web hiện đại: không phải viết code, mà là giữ cho 100.000 sợi dây cùng sống — xử lý kết nối thời gian thực.Để hiểu vì sao, phải hiểu kết nối thật sự là gì:HTTP Request: Giống như gửi một lá thư. Bạn hỏi, server trả lời, rồi quên bạn ngay lập tức (Stateless), không giữ gì cả.WebSocket: Ngược lại! Nó bắt đầu bằng 1 request HTTP xin nâng cấp (HTTP 101 Switching Protocols), rồi không bao giờ cúp máy. Một đường dây mở, hai đầu nói bất cứ lúc nào.Và đây là chỗ trả giá: Mỗi kết nối đang mở (dù im lặng) vẫn chiếm:1 File Descriptor2 buffer trong kernel OS (rcv + snd)1 Object trong ứng dụng của bạn10.000 kết nối im lặng vẫn ăn RAM. 100.000 kết nối im lặng vẫn ăn RAM. Bài toán này cũ đến mức có tên riêng từ năm 1999: Bài toán C10K — Làm sao giữ 10.000 kết nối trên 1 máy?[01:10 - 02:27] Bức tường thứ 1: GIỮ (Một máy giữ được bao nhiêu dây?)1. Nâng trần File DescriptorLinux mặc định cho mỗi tiến trình cầm 1024 File Descriptor. Dùng một dòng lệnh nâng trần lên 1.000.000:Bashulimit -n 1048576
Tường 1 đổ trong 3 giây! Nhưng đừng mừng vội, nâng trần chỉ là giấy phép, không có nghĩa là RAM theo kịp.2. Tối ưu Bộ đệm (Tune Buffer)Mỗi kết nối ngốn vài chục KB vùng đệm:$$\text{100.000 kết nối} \times 40\text{ KB} = 4\text{ GB RAM}$$(Chưa gửi một tin nhắn nào!)3. Mô hình xử lý: Thread vs Event LoopKiểu cũ (1 kết nối = 1 thread): 10.000 kết nối = 10.000 threads. Cả stack lẫn context switch ngốn sạch tài nguyên.Lời giải (Event Loop + epoll): 1 thread duy nhất cầm cả trăm ngàn sợi dây, hỏi Kernel qua epoll_wait(): "Ai vừa nói?".4. Không được chặn Event LoopEvent Loop có một "luật máu": Không được chặn!Một tác vụ nặng (như JSON.parse 200ms) không chỉ làm 1 người chờ, mà làm tất cả 100.000 người cùng khựng lại 200ms (đóng băng). Việc nặng phải đẩy sang Worker Thread.5. Dọn dẹp kết nối chết (Ping / Pong)Kết nối chết không tự báo tử (ví dụ: người dùng chui vào thang mất mạng, TCP không hề biết). Cần cơ chế Ping/Pong định kỳ (mỗi 30s) để dọn dẹp và giải phóng File Descriptor.Chốt Bức tường 1 (GIỮ): Giới hạn của 1 máy nằm ở File Descriptor và RAM, không phải CPU. Nâng trần FD, không chặn Event Loop và tự dọn dẹp xác kết nối.[02:27 - 03:20] Bức tường thứ 2: CHIA (Nhiều máy nói chuyện với nhau)Một máy có trần (60.000 - 80.000 kết nối). Muốn mở rộng phải thêm máy và đặt Load Balancer phía trước.Với HTTP thì đơn giản, request rơi vào máy nào cũng được.Với WebSocket: Bắt tay ở đâu phải ở lại đó! (Sticky Session / ip_hash).Thách thức: Tin nhắn không biết bơi!Nếu User A (kết nối máy A) gửi tin cho User B (kết nối máy B), máy A không thể tự gửi tới B vì hai máy là hai hòn đảo độc lập.Lời giải: Backplane (Pub/Sub với Redis/Kafka)Máy A không gửi trực tiếp cho B mà Publish tin nhắn lên Redis. Tất cả các máy (kể cả máy A) cùng Subscribe chủ đề đó và đẩy xuống client thuộc quản lý của mình.Chốt Bức tường 2 (CHIA): Trạng thái không thuộc về máy chủ, nó thuộc về kết nối. Muốn nhân bản máy chủ phải làm 2 việc: dính đúng máy (Sticky) và bắc cầu giữa các máy (Backplane).[03:20 - 04:18] Bức tường thứ 3: PHÁT (1 tin nhắn gửi cho 100.000 người)Đây là bức tường toán học. 1 tin nhắn gửi vào phòng 100.000 người $\rightarrow$ Server phải ghi 100.000 lần xuống 100.000 socket ($O(N)$ Fan-out).3 Kỹ thuật tối ưu khi PHÁT:Mã hóa 1 lần (Pre-encode / Pre-framed): Đừng gọi JSON.stringify() 100.000 lần cho cùng một nội dung. Mã hóa thành mảng Bytes 1 lần rồi bắn đi khắp nơi.Đo áp lực ngược (Backpressure): Nếu client mạng chậm (3G), buffer trên RAM server sẽ phình to. Phải kiểm tra ws.bufferedAmount, nếu quá ngưỡng thì thẳng tay DROP tin hoặc ngắt kết nối. (Vứt tin cũ còn hơn chết cả server!)Gộp tin (Batching / Coalescing): Đừng bắn 50 tin/giây. Mắt người chỉ nhìn thấy 10-60 fps. Gộp 50 tin lại thành 10 khung/giây $\rightarrow$ Cắt bớt 80% số lần gọi System Call.Chốt Bức tường 3 (PHÁT): 1 tin vào, trăm nghìn tin ra. Mã hóa 1 lần, kiểm soát áp lực ngược và gộp tin.[04:18 - 04:53] Cơn bão Reconnect (Reconnect Storm) & Lựa chọn công nghệKhi bạn deploy bản vá và restart server, 100.000 kết nối đứt cùng 1 giây.Tất cả 100.000 client cùng tự động reconnect CÙNG LÚC $\rightarrow$ Tạo ra Reconnect Storm quật sập server vừa khởi động lại.Giải pháp: Client phải có cơ chế Exponential Backoff + Jitter (đợi ngẫu nhiên 1s, 2s, 4s... mới kết nối lại).Khi nào nên dùng WebSocket?WebSocket: 2 chiều, đắt nhất (dùng khi cần giao tiếp 2 chiều liên tục).SSE (Server-Sent Events): 1 chiều từ Server $\rightarrow$ Client, rẻ hơn nhiều.Polling (Hỏi lại mỗi 5s): Đủ dùng cho dữ liệu ít thay đổi.Realtime là một khoản nợ vận hành, đừng lạm dụng WebSocket khi không cần thiết![04:53 - End] Tổng kếtTới 20 giờ 03 phút, trận chung kết diễn ra mượt mà nhờ áp dụng đúng 3 nguyên tắc:GIỮ: Một máy giữ bao nhiêu dây (Nâng FD, tune buffer, Ping/Pong).CHIA: Nhiều máy nói chuyện với nhau (Sticky Session + Backplane).PHÁT: 1 tin nhân bản ra 100.000 lần mà không chết (Pre-encode, Backpressure, Batching).Nhớ 3 chữ GIỮ - CHIA - PHÁT là đủ!Hệ thống của bạn đang dính người dùng bằng Sticky Session hay bắc cầu bằng Backplane? Kể cho mình nghe ở phần bình luận nhé! Thấy hữu ích thì bấm Like và Đăng ký kênh nha!
- https://www.tiktok.com/@lap_trinh_vn/video/7662749968502902036
  295s | 2026-07-15 | SQL Cơ bản: Phần 3: Khóa chính và khóa ngoại #sql #database #backend .Dưới đây là transcript đầy đủ cho video của bạn (đã được định dạng rõ ràng theo từng phần nội dung):

---

## Transcript Nội Dung Video

**[00:00 - 01:10] Đặt vấn đề: Vì sao cần định danh & Khóa chính (Primary Key)**

Hai sinh viên cùng một cái tên là Nguyễn Văn An, cùng khoa Công nghệ thông tin, cùng năm sinh. Giờ bạn cầm bảng điểm phải nhập con 8.5 cho bạn An, nhưng là An nào trong hai người?

Bạn gõ tên "An" vào hệ thống để tìm: kết quả 2 dòng y hệt nhau. Máy tính nhìn hai con người mà chỉ thấy đúng một cái tên, nó chịu, không tài nào phân biệt. Đây mới là chỗ đau: **Cái tên không phải là danh tính.**

Hai người có thể trùng tên, trùng ngày sinh, trùng cả khoa. Muốn định danh một người, bạn cần một thứ không bao giờ trùng — một giá trị gắn riêng cho mỗi người và không bao giờ lặp lại với bất kỳ ai. Trong cơ sở dữ liệu, thứ quyền lực đó có một cái tên rất gọn: người ta gọi nó là **Khóa (Key)**.

Khóa (tiếng Anh là Key) là một cột trong bảng dùng để chỉ định danh một hàng, không lẫn vào đâu được. Nhìn bảng sinh viên này, ta thêm một cột mã số gọi là `MaSV`.

Những cái khóa như vậy ngoài đời bạn gặp suốt:

* Số căn cước công dân
* Mã số sinh viên
* Biển số xe

Điểm chung của chúng: Mỗi giá trị chỉ thuộc về đúng một người, một chiếc xe, không ai xài trùng.

Quay lại hai bạn An, giờ mỗi người nhận một mã riêng: một người `SV001`, người kia `SV002`. Chỉ vậy thôi, hai cái tên giống hệt lập tức tách thành hai người khác nhau. Điểm nhập cho `SV001` không tài nào lạc sang `SV002`.

Nhưng trong thế giới quan hệ, có tới hai loại khóa:

1. Một loại định danh ngay trong bảng của mình.
2. Một loại nối bảng này sang bảng khác.

Ta gọi chúng là **Khóa chính** và **Khóa ngoại**.

### Khóa chính (Primary Key)

Định nghĩa gọn trong một câu: đó là cột định danh duy nhất một hàng. "Duy nhất" nghĩa là 2 điều kiện: **không được trùng** và **không được để trống**.

* **Điều kiện 1: Không trùng.** Nhìn cột `MaSV`, mọi giá trị đều khác nhau (`SV001`, `SV002`, `SV003`), không có hai hàng nào chung một mã. Khóa vàng này gắn vào cột `MaSV`, canh cho luật đó không bao giờ bị phá. Thử phá luật xem: ta cố chèn một hàng mới nhưng xài lại mã `SV001` đã có, cơ sở dữ liệu chặn ngay! Hàng vừa chèn bị bật ngược trở ra kèm dấu báo lỗi: *trùng khóa chính, không nhận*.
* **Điều kiện 2: Không được trống.** Một hàng mà ô mã bỏ rỗng thì cũng bị loại. Lý do rất đời: cái khóa để trống thì mở được cửa nào? Không định danh nổi ai thì đâu còn là khóa.

Ngoài đời, những khóa chính tốt đều được thiết kế để không bao giờ đụng nhau: Số căn cước mỗi công dân một số, biển số mỗi xe một biển. Người ta cấp phát có kiểm soát chứ không để trùng ngẫu nhiên.

Vì sao khóa chính lại quan trọng đến vậy? Bởi vì lát nữa, các bảng khác sẽ trỏ về nó. Nó chính là địa chỉ của mỗi hàng. Có địa chỉ rồi thì bảng khác mới biết đường tìm đến.

> **Chốt khối 1:** Khóa chính — Mỗi hàng một danh tính, không trùng, không rỗng. Đây là mỏ neo của cả bảng. Nhớ kỹ nó vì khối tiếp theo sẽ dựa hết vào đây!

---

**[01:10 - 02:08] Khóa ngoại (Foreign Key) & Lý do tách bảng**

Sang chuyện điểm số. Mỗi sinh viên học mấy chục môn, mỗi môn một con điểm. Câu hỏi tưởng dễ mà hóa khó: Đống điểm đó ta lưu vào đâu?

Ý đầu tiên ai cũng nghĩ tới: Nhét thẳng vào bảng Sinh viên. Và đây là hậu quả:

* Muốn lưu điểm Toán: thêm một cột.
* Điểm Lý: thêm cột nữa.
* Hóa, Văn, Anh, Sử... mỗi môn một cột, 40 môn là 40 cột!
* Bảng phình ngang dài mãi, tràn khỏi màn hình.

Chưa hết chỗ dở: Sinh viên năm nhất chưa học mấy môn thì hàng loạt cột bỏ trống, nhìn nham nhở. Mà mở thêm một môn mới, bạn phải sửa lại cấu trúc cả cái bảng khổng lồ! Cách này sai sai từ gốc.

Giải pháp đúng thì ngược lại: **Tách điểm ra một bảng riêng**, đặt tên là bảng `Diem`. Bảng `Diem` gọn gàng chỉ có 3 cột: `MaSV`, `TenMon`, và `Diem`. Mỗi lần thi một môn, ta chỉ việc thêm đúng một hàng.

Nhưng khoan, bảng điểm tách riêng rồi, làm sao nó biết hàng điểm này là của ai?

Đây! Cột `MaSV` trong bảng `Diem` sẽ **trỏ ngược về** `MaSV` bên bảng `SinhVien`. Cột trỏ đi như vậy, tên nó là **Khóa ngoại (Foreign Key)**.

Hình sợi dây sáng nối hai bảng lại: một đầu cắm ở bảng `Diem`, đầu kia về đúng sinh viên `SV001`. Nằm ở hai bảng khác nhau mà dữ liệu vẫn thuộc về nhau, không hề đứt. Khóa ngoại chính là sợi chỉ khâu ấy!

Còn nhớ câu hỏi treo ở bài trước chứ: *"Vì sao phải tách nhiều bảng, không gộp một cục?"*

Đây là câu trả lời: Tách ra để mỗi sự thật chỉ nằm một nơi, rồi khóa ngoại khâu chúng lại.

> **Chốt khối 2:** Khóa ngoại — Một cột trỏ về khóa chính của bảng khác. Nó là sợi dây liên kết giữ cho dữ liệu ở các bảng vẫn luôn tìm được nhau.

---

**[02:08 - 02:37] Sơ đồ quan hệ (ERD) & Quan hệ 1 - Nhiều**

Giờ lùi ra xa nhìn toàn cảnh: Cả khóa học có 4 bảng (Sinh viên, Môn học, Lớp học phần, và Điểm). Nối chúng lại là các đường khóa ngoại. Bức tranh đó gọi là **Sơ đồ quan hệ**.

Cách đọc một đường nối rất tự nhiên, gần như đọc tiếng Việt. Kéo từ Sinh viên sang Điểm, ta đọc: *"Một sinh viên có nhiều điểm"* (Một người -> Nhiều dòng điểm). Quan hệ đó gọi là **1 - Nhiều**.

Trên sơ đồ, đầu "Nhiều" được vẽ bằng một ký hiệu rất dễ nhớ: 3 nhánh xòe ra như **chân con chim**. Thấy chân chim ở đầu nào thì đầu đó là "Nhiều", đầu "Một" chỉ là một gạch ngang.

Thử đọc cả sơ đồ một lượt:

* Một sinh viên có nhiều điểm.
* Một môn học cũng có nhiều điểm.

Chỉ nhìn đường nối và cái chân chim, bạn biết ngay ai gắn với ai, bên nào 1, bên nào nhiều.

> **Chốt khối 3:** Sơ đồ quan hệ chỉ gồm 2 thứ: đường nối và ký hiệu chân chim ở đầu "Nhiều". Nhìn vào là biết ngay bảng nào liên kết bảng nào, bên nào 1, bên nào nhiều.

---

**[02:37 - End] Ràng buộc dữ liệu & Tóm tắt**

Nhưng khoan đã! Sợi dây khóa ngoại nghe thì hay, mà nó có mặt trái. Cái dây khâu các bảng lại cũng chính là cái dây trói tay bạn: Liên kết càng chặt, bạn càng mất tự do khi muốn đổi.

**Ví dụ:**
Bạn xóa sinh viên `SV001` khỏi bảng Sinh viên, nhưng bên bảng Điểm vẫn còn mấy dòng mang mã `SV001`. Giờ chúng trỏ về một người không còn tồn tại! Mấy dòng đó bỗng thành mồ côi, treo lơ lửng.

Chính vì thế, cơ sở dữ liệu không cho xóa bừa. Nó ra điều kiện: hoặc chặn không cho xóa, hoặc xóa thì kéo cả đám điểm đi theo.

Khóa ngoại không chỉ nối, nó còn **ép bạn giữ dữ liệu nhất quán**. Cái giá là bạn phải thiết kế quan hệ cho đúng ngay từ đầu và nghĩ trước cả thứ tự xóa. Đổi lại, dữ liệu của bạn không bao giờ lạc mất nhau.

---

### Tua nhanh bài học:

1. **Khóa chính (Primary Key):** Định danh mỗi hàng, không trùng, không rỗng.
2. **Khóa ngoại (Foreign Key):** Nối bảng này sang bảng khác.
3. **Tách bảng:** Để chống trùng lặp.

Còn hai bạn An? Giờ là `SV001` với `SV002`, hết lẫn nhau!
- https://www.tiktok.com/@lap_trinh_vn/video/7658888034166787336
  132s | 2026-07-05 | 3 câu SQL mà 90% người mới viết dễ SAI và nhà tuyển dụng ghét nhất #s[00:00 - 00:27] Lỗi 1: Nhầm lẫn giữa WHERE và HAVING khi gom nhóm

Code của bạn chạy được, không báo lỗi, nhưng nó sai hoàn toàn! Và nhà tuyển dụng vừa lặng lẽ loại bạn chỉ vì 3 lỗi SQL này. 90% người mới đều mắc, và tệ nhất: họ không hề biết! Xem hết để không bao giờ là người đó.

Ba câu SQL sai kinh điển. Bắt đầu!

Lỗi số 1: Bạn có bảng nhân viên, và sếp hỏi: "Phòng nào có hơn 5 người?".
Theo bản năng, bạn viết ngay: WHERE COUNT(*) > 5. Nghe rất hợp lý đúng không? Nhưng SQL báo lỗi ngay! Vì WHERE lọc từng dòng trước khi gom nhóm, lúc đó COUNT còn chưa tồn tại.

Cú pháp đúng phải là: WHERE lọc dòng, GROUP BY gom nhóm, rồi HAVING mới lọc theo con số đã đếm. Chỉ cần đổi WHERE thành HAVING, chạy lại là ra đúng danh sách phòng đông người.

Nhớ nhé: WHERE lọc dòng, HAVING lọc nhóm. Câu này bị hỏi phỏng vấn suốt!

[00:27 - 00:54] Lỗi 2: Nhầm lẫn giữa COUNT(cột) và COUNT(*) khi xử lý NULL

Nhưng lỗi tiếp theo mới khiến sếp bạn thật sự nổi giận.

Lỗi số 2: Sếp hỏi: "Cửa hàng mình có bao nhiêu khách hàng?".
Bạn tự tin gõ COUNT(email). Kết quả trả về 80, bạn nộp báo cáo luôn.

Nhưng thực tế có tới 100 khách! Vấn đề là: 20 người chưa điền email. COUNT(cột) sẽ bỏ qua mọi ô trống, mọi giá trị NULL — nó chỉ đếm ô có dữ liệu.

Muốn đếm tổng số khách, dùng COUNT(*) — sao đếm mọi dòng, không bỏ sót ai, ra đúng 100.

Ghi nhớ: Cả hai đều đúng, chỉ là trả lời hai câu hỏi khác nhau. Hiểu điều này, bạn hơn hẳn người mới!

[00:54 - End] Lỗi 3: Nhân đôi dữ liệu (Duplicate Rows) khi JOIN bảng

Và đây là lỗi nguy hiểm nhất, cái mà gần như không ai tự phát hiện ra.

Lỗi số 3: Nguy hiểm nhất vì nó không báo lỗi mà âm thầm cho kết quả sai.

Bạn có bảng DonHang và bảng ChiTietSanPham. Bạn JOIN hai bảng rồi tính tổng doanh thu... con số bỗng nhảy lên gấp đôi, gấp ba thực tế!

Đây là lý do: Một đơn có 3 sản phẩm, khi JOIN, dòng đơn hàng bị nhân lên thành 3 dòng. Số tiền 100.000đ bị cộng 3 lần thành 300.000đ.

Cách sửa an toàn: Gom nhóm ở bảng chi tiết trước, rồi mới JOIN với đơn hàng. Mỗi đơn chỉ còn 1 dòng. Chạy lại, doanh thu về đúng con số thật, không còn bị thổi phồng.

Lỗi này làm cả báo cáo tài chính sai lệch. Nhà tuyển dụng sợ nhất người mắc lỗi mà không biết mình mắc!

Tóm tắt 3 lỗi SQL kinh điển:
WHERE vs HAVING: WHERE lọc dòng trước gom nhóm, HAVING lọc nhóm sau gom nhóm.

COUNT(*) vs COUNT(cột): COUNT(*) đếm tất cả các dòng, COUNT(cột) bỏ qua giá trị NULL.

JOIN nhân dòng: Gom nhóm dữ liệu bảng phụ trước khi JOIN để tránh bị thổi phồng con số.

Bạn từng dính lỗi nào trong 3 lỗi trên chưa? Comment cho mình biết và theo dõi để xem tiếp những lỗi SQL tiềm ẩn khác nhé!.
.

## B. 13 video TRANSCRIPT NGAN BAT THUONG (duoi 5 ky tu/giay)
- https://www.tiktok.com/@lap_trinh_vn/video/7661300480982781205
  0.8 ky tu/giay | 149 ky tu / 187s | Đồng Bộ vs Bất Đồng Bộ (Ùn Tắc vs Thông Thoáng) #laptrinh #backend #f.Dưới đây là transcript đầy đủ cho video của bạn, kèm theo các mốc thời gian (timestamps) và tóm tắt checklist hữu ích ở cuối.

---

## Transcript Nội Dung Video

**[00:00 - 00:24] Bối cảnh: Thảm họa Server ngắt kết nối vì CHỜ**

6 giờ chiều. Một khách hàng bấm nút thanh toán. Server nhận đơn, rồi đứng im chờ ngân hàng trả lời.

30 giây trôi qua... Và phía sau, 10.000 người khác đang xếp hàng.

Toàn bộ luồng xử lý bị khóa cứng, bộ đệm kết nối cạn sạch, trang web trắng xóa, đơn hàng bay màu. Và cái server tội nghiệp kia — nó không hề quá tải. Nó chỉ đang chờ, chờ một cách rất ngoan ngoãn.

Khác biệt giữa sập tiệm và trơn tru đôi khi chỉ nằm ở một từ khóa. Từ khóa đó tên là **Bất đồng bộ (Async)**. Và hôm nay, ta sẽ mổ xẻ nó.

---

**[00:24 - 00:40] Lộ trình bài học**

Đồng bộ (Sync) và Bất đồng bộ (Async) — hai cái tên nghe rất hàn lâm, nhưng thực ra chúng chỉ mô tả một điều rất đời thường: **Bạn làm gì trong lúc phải CHỜ người khác?** Ngồi im hay làm việc khác?

Lộ trình hôm nay:

1. **Đồng bộ:** Ùn tắc.
2. **Bất đồng bộ:** Thông thoáng.
3. **Cú Twist:** Sự thật ít ai nói cho bạn nghe.
4. **Bảng so sánh.**

---

**[00:40 - 01:25] Chặng 1: Đồng bộ (Synchronous) — Quầy lễ tân 1 luồng**

Đồng bộ giống như một quầy lễ tân duy nhất: Nhân viên tiếp khách số 1, gọi điện xác minh và ngồi im chờ máy. Trong thời gian đó, khách số 2, số 3, số 4... chỉ biết đứng nhìn. Không ai được phục vụ.

Trong code, nó trông vô hại thế này:

```python
def checkout(order):
    result = db.query(order) # Luồng bị GHIM tại đây (Blocking call)
    return result

```

Dấu `=` là một cái phanh tay. Luồng xử lý bị ghim tại dòng này cho tới khi cơ sở dữ liệu trả kết quả về.

Mỗi yêu cầu chiếm 1 luồng (thread). Luồng đó không tính toán gì cả, nó chỉ ngồi chờ!

Máy chủ có 200 luồng. Yêu cầu thứ 201: *"Xin mời xếp hàng!"* — và hàng cứ dài mãi.

### Sập dây chuyền (Cascading Failure)

Chỉ cần một dịch vụ bên ngoài (API bên thứ 3) phản hồi chậm, toàn bộ luồng bị hút cạn theo. Người dùng bấm F5 tạo thêm yêu cầu mới, đám cháy lan rộng. Dân trong nghề gọi nó là **Sập dây chuyền**.

> **Sự đơn giản đáng giá:** Nhưng khoan! Đồng bộ không hề xấu. Code chạy từ trên xuống dưới, dễ đọc, dễ hiểu. Lỗi ở đâu, Stack Trace chỉ thẳng vào đó, debug nhàn tĩnh. Đây là sự đơn giản đáng giá, đừng vội chê nó!

---

**[01:25 - 02:00] Chặng 2: Bất đồng bộ (Asynchronous) — Phát phiếu rung & Event Loop**

Bất đồng bộ thì khác hẳn! Vẫn quầy lễ tân đó, nhưng giờ khách được phát một cái **phiếu rung** (Callback / Promise): *"Cứ đi uống cà phê đi, xong tôi gọi!"*. Nhân viên rảnh tay, quay sang phục vụ ngay người tiếp theo. Hàng chờ tan biến!

Trái tim của bất đồng bộ là **Vòng lập sự kiện (Event Loop)**. Hãy tưởng tượng một băng truyền xoay không ngừng:

1. Việc nào phải chờ ngoại vi (I/O) thì bị đẩy ra bên lề (Khu chờ I/O).
2. Khi có kết quả về, nó mới được đặt lại lên băng truyền để xử lý tiếp.

### Phép màu từ 1 từ khóa: `await`

In code, phép màu nằm ở từ khóa `await`:

```python
async def checkout(order):
    row = await db.query(order) # Nhường sân khấu cho việc khác
    return make_bill(row)

```

`await` **không có nghĩa là "dừng lại"**. Nó có nghĩa là: *"Tạm nhường sân khấu cho việc khác, xong hãy gọi tôi dậy!"*. Một chữ, đổi cả cuộc chơi!

**Kết quả:** Cùng 1 máy chủ, cùng 1 CPU, nhưng giờ nó ôm được hàng chục nghìn kết nối đang chờ mà chỉ tốn vài luồng. Đường thông, hè thoáng! Đó là lý do Node.js, Go, Asyncio được yêu đến vậy.

---

**[02:00 - 02:29] Chặng 3: Cú Twist — Sự thật ít ai nói cho bạn nghe**

1. **Async KHÔNG giúp code chạy nhanh hơn:**
Bất đồng bộ không làm code của bạn chạy nhanh hơn 1 miligiây nào (500ms đồng bộ vẫn là 500ms bất đồng bộ). Nó chỉ giúp bạn **chờ đợi giỏi hơn** mà thôi!


2. **Vô tác dụng với tác vụ nặng CPU:**
Nếu tác vụ ngốn CPU (như mã hóa video, hash mật khẩu), `async` không cứu được gì.


3. **Cạm bẫy 1 hàm chặn = Cả Server treo:**
Chỉ cần bạn lỡ tay gọi 1 hàm đồng bộ nặng bên trong Event Loop, cả băng truyền đứng hình! Không phải 1 người bị treo, mà là **TẤT CẢ CÙNG TREO**.


4. **Cái giá phải trả:**
Đó là độ phức tạp: luồng chạy nhảy loạn xạ, Stack Trace đứt đoạn, Race Condition rình rập, Callback lồng nhau... **Không có bữa trưa nào miễn phí!**


---

**[02:29 - 02:43] Bảng tỉ số tổng kết**

| Tình huống / Tiêu chí | Đồng bộ (Sync) | Bất đồng bộ (Async) |
| --- | --- | --- |
| **Chờ Mạng / Ô đĩa / API** | ❌ (Gây nghẽn) | ⭐ **Thắng tuyệt đối** |
| **Tác vụ ngốn CPU** | ✔️ *(kèm Đa tiến trình)* | ❌ (Làm nghẽn Event Loop) |
| **Dễ đọc, dễ Debug** | ⭐ **Ăn đứt** | ❌ (Phức tạp, nhảy loạn) |
| **Số kết nối đồng thời** | ~200 kết nối | **10.000+ kết nối** |
| **Script chạy 1 lần** | ✔️ (Cho lành) | ❌ (Thừa) |

---

**[02:43 - End] Kịch bản 6 giờ chiều (Khi áp dụng Async)**

Quay lại 6 giờ chiều hôm ấy: Đơn hàng đó, ngân hàng vẫn chậm 30 giây. Nhưng lần này server chỉ nhún vai, quăng việc chờ ra bên lề, rồi tiếp tục phục vụ 10.000 người kia. **0 người phải chờ!**

---

### 📋 Checklist bỏ túi khi lập trình

* [x] **Chờ mạng / Ô đĩa / API** $\rightarrow$ Dùng **Bất đồng bộ**.
* [x] **Nặng CPU** $\rightarrow$ Đẩy sang **Tiến trình riêng / Hàng đợi (Worker / Queue)**.
* [x] **KHÔNG** gọi hàm chặn (blocking call) trong Event Loop.
* [x] **Script nhỏ / Tool chạy 1 lần** $\rightarrow$ Dùng **Đồng bộ** cho gọn.
* [x] **Luôn đặt TIMEOUT** cho mọi lời gọi ra ngoài.
- https://www.tiktok.com/@lap_trinh_vn/video/7660557904071675157
  2.1 ky tu/giay | 505 ky tu / 244s | Đây là một trong những bài toán SQL kinh điển và khó nhất mà bạn phải.Dưới đây là transcript đầy đủ của video, đã được loại bỏ phần quảng cáo theo yêu cầu của bạn:

---

Cuối tháng, kế toán mở báo cáo lãi lỗ và tái mặt. Hệ thống báo lãi 30 triệu nhưng két tiền lại trống trơn, không khớp một đồng nào. Thủ phạm là một con số duy nhất tính sai: **Giá vốn hàng bán**.

Chỉ cần lấy sai giá lô hàng xuất kho, cả bảng cân đối kế toán sụp đổ. Giá vốn hàng bán (gọi tắt là **COGS**) là số tiền thực sự bạn bỏ ra để mua đúng những món hàng vừa bán đi. Tính đúng COGS thì lợi nhuận mới thật, tính sai mọi con số đều là ảo.

Hôm nay ta giải bài toán kinh điển: cơ chế **FIFO (Nhập trước – Xuất trước)**.

3 bước rõ ràng:

1. Dựng dữ liệu kho hàng.
2. Hiểu logic FIFO bằng tay.
3. Ép SQL tự tính chính xác bằng hàm cửa sổ (Window Function).

Kho của ta có 2 đợt nhập:

* **Đợt 1:** Nhập 10 chiếc áo, giá 50.000đ/chiếc.
* **Đợt 2 (nhập sau):** Nhập 20 chiếc áo, giá đã tăng lên 60.000đ/chiếc.
* **Tổng cộng:** 30 chiếc với 2 mức giá khác nhau.

Rồi một khách xộp bước vào cửa hàng chốt đơn **15 chiếc áo** cùng một lúc. Câu hỏi triệu đô: 15 chiếc này lấy ra từ đợt nào? Đợt 50.000đ, đợt 60.000đ, hay lấy từ cả hai?

Nhiều người lười lấy giá trung bình cộng lại chia đôi (55.000đ). Nhưng như thế là sai bản chất! Hàng nhập trước phải được bán trước. Trộn giá trung bình làm méo lợi nhuận và sai cả thuế.

Hãy tưởng tượng kho hàng như một đường ống hay hàng người xếp ở quầy vé: Ai vào trước thì ra trước. Món hàng nhập sớm nhất luôn nằm đầu hàng, phải được xuất đi đầu tiên. Đó chính là linh hồn của FIFO: Nhập trước – Xuất trước, không ngoại lệ.

Chia tay từng phần nhé: 15 chiếc cần xuất, lấy hết 10 chiếc từ đợt 1 (giá 50.000đ). Vẫn thiếu 5 chiếc, ta lấy tiếp 5 chiếc từ đợt 2 (giá 60.000đ), vừa đủ 15 chiếc.

Giờ tính tiền cho rõ ràng:

* $10 \text{ chiếc} \times 50.000\text{đ} = 500.000\text{đ}$
* $5 \text{ chiếc} \times 60.000\text{đ} = 300.000\text{đ}$
* **Tổng giá vốn chuẩn xác:** $800.000\text{đ}$

Đây mới chính là con số đúng để ghi sổ. Bằng tay thì dễ, nhưng kho có nghìn mặt hàng thì sao? Ta cần SQL tự động hóa. Bí quyết nằm ở hàm cửa sổ (**Window Function**). Nó giúp ta tính tổng lũy kế, cộng dồn số lượng qua từng dòng mà không gộp mất chi tiết.

* **Bước 1:** Với bảng nhập, ta tính tổng lũy kế số lượng.
* Đợt 1 cộng dồn tới 10 $\rightarrow$ tạo khoảng từ 0 đến 10.
* Đợt 2 cộng dồn tới 30 $\rightarrow$ tạo khoảng từ 10 đến 30.
* Mỗi lô giờ có một khoảng lũy kế riêng.


* **Bước 2:** Làm y hệt với hàng xuất. Đơn 15 chiếc cũng tạo một khoảng lũy kế từ số 0 đến 15. Ý tưởng cốt lõi: Biến mọi thứ thành các khoảng số trên cùng một trục lượng hàng.
* **Bước 3:** Đây là phần thần kỳ: JOIN 2 bảng lại với nhau, tìm chỗ 2 khoảng lũy kế giao nhau. Khoảng xuất từ 0 đến 15 cắt qua khoảng nhập của cả 2 đợt. Phần giao chính là số hàng mà mỗi đợt phải gánh.

Đây là bản thiết kế hoàn chỉnh:

* Câu lệnh dùng `SUM() OVER (ORDER BY ...)` để tạo lũy kế cho cả nhập và xuất.
* Điều kiện JOIN kiểm tra 2 khoảng chồng lấn: *Điểm bắt đầu của bên này nhỏ hơn điểm kết thúc của bên kia*.
* Với mỗi phần giao, ta nhân số lượng với đơn giá của đúng lô đó. Cuối cùng `SUM` tất cả lại, ra 800.000đ khớp từng đồng với tính tay.

Nhưng đây là sự thật ít ai nói: FIFO không phải luôn thắng. Khi giá cả leo thang, FIFO đẩy lợi nhuận lên cao, kéo theo thuế cao hơn. Nhiều doanh nghiệp lại chọn bình quân gia quyền hoặc LIFO. Không có công thức thắng tuyệt đối, chỉ có cái phù hợp với chiến lược thuế của bạn.

### Công thức vàng (chụp màn hình ngay):

1. Mỗi lô nhập cần một khoảng lũy kế.
2. Đơn xuất cũng cần một khoảng lũy kế.
3. JOIN theo phần chồng lấn của 2 khoảng.
4. Nhân lượng giao với đơn giá từng lô.
5. SUM lại ra giá vốn chuẩn.

Nhớ anh kế toán tái mặt đầu video chứ? Giờ anh chạy đúng câu lệnh FIFO, lợi nhuận hiện lên khớp từng đồng với két tiền, sổ sách sạch, thuế đúng, sếp gật gù, không còn lãi ảo, không còn hoảng loạn cuối tháng.

Bài học lớn nhất: **Đừng bao giờ trộn giá trung bình cho hàng tồn kho.** Hãy tư duy theo khoảng lũy kế để SQL ghép đúng dòng tiền với đúng lô hàng. Đó là sức mạnh thật của Window Function.

Nếu thấy hữu ích, nhớ nhấn đăng ký để không bỏ lỡ tập nào. Video sau sẽ xử lý bài toán tồn kho âm bằng SQL. Hẹn gặp lại và nhớ code thật sạch nhé!
- https://www.tiktok.com/@lap_trinh_vn/video/7666302799872871688
  2.8 ky tu/giay | 1010 ky tu / 357s | SQL cơ bản: Phần 9: GROUP BY: gom nhóm dữ liệu  #sql #database #backe.Dưới đây là phiên bản transcript chuẩn xác từ nội dung video của bạn:

---

## Transcript Nội Dung Video

**[00:00 - 00:54] Đặt vấn đề: Bài toán thống kê theo từng nhóm**

9 giờ tối, sếp nhắn một dòng: *"Trường mình có 12 khoa, gửi anh sĩ số từng khoa trong 10 phút nữa"*.

Bạn mở cửa sổ truy vấn lên. Bài trước, bạn vừa đếm được sĩ số của đúng một khoa. Cách nhanh nhất bạn nghĩ ra: viết một câu đếm cho khoa Công nghệ thông tin, copy dán, đổi tên khoa, dán, đổi tên... 12 lần y hệt nhau, chỉ khác cái tên trong dấu nháy. Đến câu thứ 7, bạn gõ nhầm `"Kinh tế"` thành `"Kinh té"`. Không báo lỗi, câu lệnh vẫn chạy, nó trả về số 0. Bạn không hề hay biết!

Giờ nghĩ lớn hơn: Nếu trường có 50 khoa hay 200 ngành? Chẳng lẽ ngồi dán 200 câu gần như giống hệt, rồi cầu cho mình không gõ nhầm lần nào?

Chắc chắn phải có một cách để bảo máy tự chia cái bảng thành từng khoa rồi đếm giùm bạn mỗi khoa đúng một lần. Có thật, nó tên là **`GROUP BY`**.

`GROUP BY` làm một việc (bạn cần nhớ nó suốt video): **Nó chia các hàng thành từng cụm theo giá trị bạn chọn.** Rồi hàm tổng hợp (như `COUNT` hay `AVG`) chạy riêng trên từng cụm, thay vì trên cả bảng.

Bài trước, bạn gõ `COUNT(*)`, máy gom hết cả bảng lại, nén thành một con số: *"Cả trường có bao nhiêu sinh viên?"* — Một câu hỏi, một đáp án! Nhưng sếp đâu hỏi cả trường, sếp hỏi từng khoa một.

`GROUP BY` đảo ngược: Trước khi đếm, nó chia bảng thành từng cụm, mỗi khoa một cụm, rồi mới đếm trong mỗi cụm. Kết quả không còn một dòng, mà một dòng cho mỗi khoa (12 khoa ra 12 dòng) chỉ trong một câu lệnh!

---

**[00:54 - 01:45] Cơ chế hoạt động trực quan & Cú pháp cơ bản**

Chia thành cụm rồi tính trên từng cụm. Phần còn lại chỉ là 4 chặng:

1. Cách nó chia cụm
2. Cách viết câu lệnh
3. Một quy tắc vàng dễ vấp
4. Gom theo nhiều tầng

Xong 4 cái đó, bạn nắm trọn `GROUP BY`.

Đây là bảng sinh viên, tô màu theo khoa: xanh là Công nghệ thông tin, lục là Kinh tế, cam là Ngoại ngữ. 6 hàng, 3 màu trộn lẫn.

Giờ xem `GROUP BY khoa` làm gì. Bấm chạy!

* Việc đầu tiên `GROUP BY` làm là nhìn vào cột `khoa`.
* Nó gom những hàng cùng giá trị lại: hàng xanh trôi về một phía, hàng lục một phía, hàng cam một phía.
* Và đây: 3 cụm! Sinh viên CNTT nằm trong một cụm, Kinh tế một cụm, Ngoại ngữ một cụm. Bảng lộn xộn giờ thành 3 nhóm gọn gàng, không màu nào lẫn nữa.
* Bước cuối, hàm `COUNT` chạy vào từng cụm, đếm số hàng rồi ép cả cụm co lại thành một dòng: CNTT 2, Kinh tế 2, Ngoại ngữ 2. 3 cụm, 3 con số đặt cạnh nhau. Bảng gốc 6 hàng, kết quả 3 dòng, mỗi dòng một khoa.

> **Chốt chặng 1:** `GROUP BY` chia hàng thành cụm theo cột bạn chỉ, rồi hàm tổng hợp chạy trên từng cụm.

Giờ gõ ra so với câu `SELECT` thường. `GROUP BY` thêm đúng hai thứ:

* Cuối câu: dòng `GROUP BY khoa` (chính là cột để chia cụm).
* Trong `SELECT`: bên cạnh `khoa`, ta đặt `COUNT(*) AS si_so` (hàm chạy trên mỗi cụm).

```sql
SELECT khoa, COUNT(*) AS si_so
FROM sinh_vien
GROUP BY khoa;

```

Đọc từ dưới lên: `GROUP BY khoa` nghĩa là chia bảng thành từng khoa; rồi `SELECT khoa, COUNT(*)` nghĩa là với mỗi khoa, lấy tên khoa và đếm số hàng. `AS si_so` chỉ là đặt tên cho cột kết quả.

Chạy trên DBeaver, kết quả trả về một bảng nhỏ: mỗi khoa một dòng, con số sĩ số nằm bên cạnh, khớp hoàn toàn với minh họa. Đổi hàm tổng hợp thì đổi câu hỏi: Muốn điểm trung bình mỗi môn? Thay `COUNT(*)` bằng `ROUND(AVG(diem), 1)` và `GROUP BY ma_mon`.

> **Chốt chặng 2:** Công thức có 2 mảnh — `GROUP BY [cột]` ở cuối, và trong `SELECT` là `[cột đó] + [hàm tổng hợp]`.

---

**[01:45 - 02:27] Quy tắc vàng tránh lỗi cú pháp**

Đây là chỗ người mới vấp nhiều nhất. Trong câu `GROUP BY`: **Mỗi cột bạn viết ở `SELECT` phải thuộc một trong hai loại:**

1. Hoặc nó nằm trong danh sách `GROUP BY`.
2. Hoặc nó nằm trong hàm tổng hợp (như `COUNT` hay `AVG`).

Không có loại thứ ba!

Thử phá luật: Thêm `ho_ten` vào `SELECT`, nhưng `GROUP BY` vẫn chỉ có `khoa`:

```sql
-- LỖI SAI CÚ PHÁP
SELECT khoa, ho_ten, COUNT(*) AS si_so
FROM sinh_vien
GROUP BY khoa;

```

Chạy, máy báo lỗi đỏ ngay! Vì cụm Công nghệ thông tin có 120 người, mà bạn hỏi tên, thì lấy tên của ai? 120 hàng CNTT bị ép thành 1 dòng, `COUNT` đếm ra 120 rất dễ, nhưng `ho_ten` có 120 cái tên chen vào 1 ô, máy không biết chọn tên nào nên từ chối.

> **Chốt chặng 3:** Cột nào ở `SELECT` mà không nằm trong `GROUP BY` thì bắt buộc phải nằm trong hàm tổng hợp. Vi phạm là máy báo lỗi ngay!

---

**[02:27 - 03:09] Gom nhóm đa tầng & Thứ tự thực thi (`WHERE` vs `GROUP BY`)**

`GROUP BY` không dừng ở một cột. Liệt kê nhiều cột, máy gom theo tổ hợp.

Ví dụ: `GROUP BY khoa, gioi_tinh`. Mỗi cụm là một [Khoa + Giới tính]: CNTT Nam một cụm, CNTT Nữ một cụm khác. Hình dung như cây: tầng 1 chia theo Khoa ra 3 nhánh, mỗi nhánh Khoa chẻ tiếp thành Nam và Nữ ở tầng 2. 3 khoa $\times$ 2 giới tính = 6 cụm, mỗi cụm đếm riêng.

Thêm điều kiện: Ví dụ chỉ tính sinh viên nữ, thêm `WHERE gioi_tinh = 'Nữ'` đặt **trước** `GROUP BY`.

Mấu chốt: **`WHERE` chạy trước, lọc bỏ mọi hàng Nam từ đầu.** Khi `GROUP BY` gom cụm, trong bảng chỉ còn Nữ. Lọc trước, gom sau!

Thêm `ORDER BY si_so DESC` ở cuối: `GROUP BY` tạo bảng kết quả, rồi `ORDER BY` sắp xếp theo sĩ số, khoa đông nhất lên đầu.

> **Chốt chặng 4:** `GROUP BY` nhiều cột gom theo tổ hợp. Thứ tự thực thi: `WHERE` (lọc) $\rightarrow$ `GROUP BY` (gom) $\rightarrow$ `ORDER BY` (xếp).

---

**[03:09 - End] Dẫn dắt sang `HAVING` & Tổng kết**

Nhưng khoan, `GROUP BY` có một cái bẫy cuối. Sếp nói thêm: *"Chỉ hiện những khoa đông trên 100 sinh viên"*.

Dễ mà, bạn nghĩ: *"Đã có `WHERE` để lọc rồi, thêm `WHERE COUNT(*) > 100` là xong!"*. Bạn gõ thử:

```sql
-- LỖI SAI
SELECT khoa, COUNT(*) AS si_so
FROM sinh_vien
WHERE COUNT(*) > 100
GROUP BY khoa;

```

Bấm chạy... và LỖI ĐỎ! Máy nói nó không biết `COUNT(*)` là gì ở mệnh đề `WHERE`.

Đây là cú lật: `WHERE` chạy **trước** `GROUP BY`. Lúc `WHERE` làm việc, các cụm chưa hình thành, cột `si_so` chưa được tính! `WHERE` nhìn từng hàng gốc, nơi đó chưa có con số tổng hợp.

Muốn lọc theo con số đã tổng hợp (thứ vừa tính xong sau khi gom), ta cần một mệnh đề khác chạy **sau** khi gom: nó tên là **`HAVING`**.

* `WHERE`: Lọc hàng **trước** khi gom.
* `HAVING`: Lọc cụm **sau** khi gom.

---

### Tóm tắt bài học:

1. `GROUP BY` chia hàng thành các cụm nhỏ để tính toán.
2. Cột trong `SELECT` phải nằm trong `GROUP BY` hoặc nằm trong hàm tổng hợp.
3. Thứ tự chuẩn: `WHERE` $\rightarrow$ `GROUP BY` $\rightarrow$ `HAVING` $\rightarrow$ `ORDER BY`.

- https://www.tiktok.com/@lap_trinh_vn/video/7667209090333986055
  3.1 ky tu/giay | 1060 ky tu / 339s | SQL cơ bản: Phần 15: Hàm chuỗi, hàm số, hàm ngày tháng trong SQL  #sq.Dưới đây là transcript đầy đủ cho video của bạn, đã được làm sạch và chia theo từng phần nội dung logic kèm mốc thời gian (timestamps):

---

## Transcript Nội Dung Video

**[00:00 - 00:54] Đặt vấn đề: Dữ liệu bẩn & Khái niệm Hàm (Functions) trong SQL**

`7.6666667` — đó là điểm trung bình mà câu lệnh vừa trả về. Không ai in con số đó lên bảng điểm, nhưng máy thì cứ thản nhiên trả đúng như vậy!

Cùng bảng đó, cột họ tên còn tệ hơn: tên viết thường hết, đầu và cuối thừa mấy dấu cách vô hình, email thì người viết hoa người viết thường, không ai giống ai. Bạn ghép cái tên đó vào lời chào trong thư gửi khách: *"Kính gửi Nguyễn Văn An"* (chữ thường, thừa hẳn một dấu cách), khách đọc thư thấy ngay, máy thì không thấy gì.

Vậy sửa ở đâu? Mở từng dòng lên sửa tay thì 20.000 dòng bao giờ xong? Cũng không cần! Chỗ dọn nằm ngay trong chính câu lệnh bạn vừa gõ ra. SQL có sẵn một hộp công cụ nhỏ dùng được ngay trong câu lệnh: bạn đưa dữ liệu bẩn vào, nó trả ra bản đã dọn sạch. Tên gọi của chúng là **Hàm (Functions)**.

Hình dung một cái máy nhỏ: bên trái là phễu, bạn thả một giá trị vào, bên phải là cửa ra, giá trị đi ra đã được đổi khác. Máy đó chính là một hàm!

Viết ra thì gọn thôi: `Tên_hàm(thứ_cần_xử_lý)`. Cặp ngoặc chính là cái phễu bạn vừa thấy, cột nào nằm trong ngoặc, cột đó được đem đi dọn.

Một điều phải nắm ngay từ đầu: **Hàm không sửa gì trong bảng gốc!** Nó chỉ đổi cái bạn nhìn thấy ở kết quả trả về, dữ liệu trong ổ cứng vẫn y nguyên như cũ.

Hàm thì nhiều, nhưng nhớ theo nhóm là đủ:

* Nhóm làm việc với **chữ (Chuỗi)**
* Nhóm làm việc với **số**
* Nhóm làm việc với **ngày tháng**

Cộng thêm một mẹo cuối: lồng hàm nọ vào trong hàm kia.

---

**[00:54 - 01:46] Nhóm 1: Các hàm xử lý Chuỗi (String Functions)**

Bắt đầu ngay từ nhóm hay dùng nhất: nhóm làm việc với chữ (tức là hàm chuỗi).

* **`UPPER` / `LOWER`:** `UPPER` biến mọi chữ thành chữ in hoa, đối lại là `LOWER` biến hết thành chữ thường. Cùng một cột họ tên, hai máy ra hai kết quả khác nhau. Chỗ này mới là chỗ ăn tiền thật: Email người viết hoa người viết thường thì so sánh sẽ trượt. Cho cả cột chạy qua `LOWER` trước khi so, mọi thứ trở về cùng một dạng!
* **`LENGTH`:** Đếm xem một chuỗi dài bao nhiêu ký tự. Nghe vô dụng, nhưng nó là cái cân: cân cái tên bẩn kia ra 15 ký tự, mà mắt chỉ đếm được 13 -> 2 ký tự lẻ đó chính là dấu cách thừa.
* **`TRIM`:** Là cái kéo cắt sạch cả hai đầu. Cắt xong, chuỗi thẳng hàng lại và `LENGTH` tụt đúng về 13.
* **`CONCAT` (hoặc `||`):** Giờ đến việc ngược lại: dán hai cột lại thành một. Hai dấu gạch dọc `||` là phép ghép chuỗi: `ho_ten || '-' || ten_khoa` ra đúng một dòng gọn gàng cho báo cáo.
*(Lưu ý: SQLite và PostgreSQL dùng `||`, còn MySQL bắt bạn gọi hàm `CONCAT`. Cùng một việc, hai cách viết!)*
* **`SUBSTRING`:** Cắt chuỗi. Đưa vào chuỗi, vị trí bắt đầu, lấy mấy ký tự. Mã sinh viên 2 ký tự đầu là mã khóa học, cắt ra là biết ngay sinh viên đó khóa nào.

> **Chốt nhóm Chuỗi:** Đổi hoa/thường, đo độ dài, cắt khoảng trắng, dán hai cột, cắt lấy một khúc. 5 việc đó gánh gần hết mọi lần bạn phải đi dọn chữ!

---

**[01:46 - 02:20] Nhóm 2: Các hàm xử lý Số (Numeric Functions)**

Sang nhóm hàm số và món nợ ở đầu video:

* **`ROUND`:** Là hàm làm tròn. `ROUND(7.6666667, 1)` cho qua `ROUND` với số 1 ra `7.7` — đúng cái bạn cần in ra! Thường thì `ROUND` đứng ở ngoài cùng, bọc lấy một hàm khác: tính trung bình xong là làm tròn luôn. Ngay tại đó, một dòng lệnh ra luôn con số sạch, không cần ai sửa lại bằng tay.
* **`ABS`:** Trả về giá trị tuyệt đối. Điểm thi trừ điểm chuẩn ra số âm, `ABS` bỏ luôn dấu trừ. Bạn chỉ hỏi lệch bao nhiêu chứ không quan tâm lệch bên nào.
* **`MOD` (hoặc `%`):** Dấu `%` trong SQL không phải phần trăm, nó là phép chia lấy dư. Số nào chia hết cho 2 thì dư 0 (đó là số chẵn). Mẹo chia nhóm chẵn lẻ chỉ có thế thôi!

> **Chốt nhóm Số:** Làm tròn cho đẹp mắt, bỏ dấu âm khi chỉ cần độ lệch, chia lấy dư để phân nhóm. 3 hàm đều viết gọn trong đúng một dòng lệnh ngắn.

---

**[02:20 - 02:59] Nhóm 3: Các hàm Ngày tháng (Date/Time Functions)**

Nhóm thứ ba: hàm ngày tháng.

* **Lấy ngày hiện tại:** Muốn biết hôm nay là ngày mấy thì cứ hỏi thẳng cơ sở dữ liệu (`CURRENT_DATE`), đừng gõ tay ngày vào câu lệnh. Gõ tay thì mai chạy lại là sai ngay lập tức!
* **Cấu trúc ngày:** Một ngày trong bảng là 3 mảnh dán liền: `Năm - Tháng - Ngày`.
* **`STRFTIME` (hoặc `EXTRACT`):** Muốn lấy riêng đúng một mảnh thì dùng hàm `STRFTIME`, đưa vào kýTokens của mảnh cần lấy. Ký hiệu `%Y` (Y hoa) là lấy năm.
* **Tính tuổi:** Ứng dụng kinh điển nhất là tính tuổi: lấy năm nay đem trừ năm sinh. Cả hai đều là mảnh năm vừa tách ra, nên chỉ cần đúng một phép trừ là xong hết, không cần bảng tra cứu nào.

> **Lưu ý quan trọng:** Đây đúng là chỗ khác nhau nhiều nhất giữa các hệ cơ sở dữ liệu. Cùng một việc lấy năm, mỗi hệ một tên hàm, một cách viết! Kỹ năng cần có ở đây không phải là thuộc lòng, mà là biết mình đang dùng hệ nào rồi mở tài liệu của hệ đó ra tra.

> **Chốt nhóm Ngày tháng:** Đừng gõ ngày bằng tay (hỏi máy), tách năm/tháng/ngày ra rồi tính, và luôn kiểm lại cú pháp của hệ mình đang chạy.

---

**[02:59 - 03:29] Chặng cuối: Lồng hàm (Nested Functions)**

Chặng cuối và cũng là chỗ đẹp nhất của bài: **Hàm được phép lồng vào nhau!**

Đặt hai cái máy nối tiếp trên cùng một băng truyền. Chuỗi đi qua máy bên trong trước, máy bên ngoài sau. **Đọc thì phải đọc từ trong ra ngoài**, cái trong cùng luôn chạy trước!

```sql
-- Ví dụ lồng hàm:
UPPER(SUBSTRING(ho_ten, 1, 1))

```

1. `SUBSTRING` cắt lấy 1 chữ đầu tiên.
2. Xong rồi `UPPER` mới nhận cái chữ đó rồi viết hoa nó.

*(Đúng thứ tự đó, không đảo được!)*

Ghép thêm một tầng nữa là ra được đúng thứ ai cũng cần: **Chữ đầu viết hoa, phần còn lại viết thường, rồi dán hai mảnh lại.** Tên bẩn thành tên đẹp ngay trong chính câu lệnh đó thôi!

> **Lưu ý:** Đừng lồng tới 4-5 tầng! Người đọc sau không nổi và chính bạn tháng sau cũng không nhớ mình viết gì. 3 tầng là ngưỡng nên dừng, dài hơn nữa thì tách ra cho dễ đọc.

---

**[03:29 - End] Những sự thật ít ai nói & Tổng kết**

Nhưng bây giờ là phần không ai nói với bạn: Chạy lại đúng câu lệnh cũ (không có hàm bọc ngoài), tên vẫn viết thường, khoảng trắng vẫn còn nguyên ở đó!

Vì **hàm chưa bao giờ sửa vào bảng gốc**. Nó dọn trên bản sao đúng lúc bạn nhìn, rồi bản sao đó biến mất. Dữ liệu gốc thì vẫn bẩn y như cũ!

* Muốn sạch thật thì phải ghi đè hẳn bằng lệnh `UPDATE`, hoặc chặn dữ liệu bẩn ngay từ lúc nhập vào. Hàm chỉ là cái khẩu trang, nó không phải bác sĩ.
* Còn một cái giá nữa ít ai nhắc tới: Bọc hàm quanh cột ngay trong điều kiện lọc (`WHERE LOWER(email) = ...`) thì máy phải tính lại từng dòng, không dùng được chỉ mục (index). Bảng to là thấy chậm liền!

---

### 📋 Checklist tổng kết bài học:

* **Chuỗi:** `UPPER`, `LOWER` (in hoa/thường), `LENGTH` (đo độ dài), `TRIM` (cắt khoảng trắng), `CONCAT` / `||` (dán chuỗi), `SUBSTRING` (cắt khúc).
* **Số:** `ROUND` (làm tròn), `ABS` (giá trị tuyệt đối), `%` / `MOD` (chia lấy dư).
* **Ngày tháng:** Tách 3 mảnh (Năm/Tháng/Ngày) để tính toán, tra cứu cú pháp theo đúng hệ CSDL.
* **Lồng hàm:** Đọc từ trong ra ngoài, tối đa 3 tầng.
- https://www.tiktok.com/@lap_trinh_vn/video/7658632978330995986
  3.5 ky tu/giay | 442 ky tu / 125s | Đố bạn: khách rơi nhiều nhất ở bước Xem→Giỏ hay Giỏ→Thanh toán? 👇 #sq.Dưới đây là transcript toàn bộ nội dung của video (đã loại bỏ phần quảng cáo ở giữa):

---

## Transcript Nội Dung Video

**[00:00 - 00:23] Đặt vấn đề: Vấn đề "rò rỉ" doanh thu trong phễu bán hàng**

Cứ 100 người thêm sản phẩm vào giỏ hàng, thì gần 70 người biến mất không mua gì cả!

~70% doanh thu tiềm năng bốc hơi, và hầu hết chủ shop không hề biết khách rơi ở đâu.

Hôm nay, ta sẽ dùng dữ liệu để tìm chính xác chỗ khách rơi nhiều nhất.

Hành trình mua hàng thường đi qua 3 bước:

1. Xem sản phẩm
2. Thêm vào giỏ
3. Thanh toán

Xếp chồng lại, ta được hình cái phễu: trên rộng, dưới hẹp — đó là lý do nó có tên là **Phễu chuyển đổi (Conversion Funnel)**.

---

**[00:38 - 01:31] Cách phân tích Phễu chuyển đổi bằng SQL (Conditional Aggregation)**

Mỗi bước, một số người rơi ra. Nhiệm vụ của ta: đo xem bước nào rò rỉ nặng nhất!

Dữ liệu của ta là **bảng log sự kiện (`events`)**, mỗi dòng ghi lại ai đã làm gì (xem, thêm giỏ hay thanh toán).

Để đếm người ở mỗi bước, ta dùng một mẹo gọi là **Conditional Aggregation** (Đếm có điều kiện). Ý tưởng rất đơn giản: ở mỗi bước, chỉ đếm những dòng khớp điều kiện, bỏ qua phần còn lại.

```sql
COUNT(DISTINCT CASE WHEN event = 'view' THEN user_id END)

```

Đếm `user_id` khi sự kiện là `view` -> ra số người xem.

Lặp lại cho *Thêm giỏ* (`add_to_cart`) và *Thanh toán* (`checkout`), gọn trong 1 câu truy vấn!

**Kết quả:**

* **Xem:** 10.000 người
* **Thêm giỏ:** 4.000 người
* **Thanh toán:** 1.200 người

Nhưng con số thô chưa nói lên điều gì, cái ta cần là **tỷ lệ chuyển đổi** giữa các bước:

* **Xem -> Giỏ:** $\frac{4.000}{10.000} = 40\%$
* **Giỏ -> Thanh toán:** $\frac{1.200}{4.000} = 30\%$

Thấy chưa? Bước từ **Giỏ hàng -> Thanh toán** mới là chỗ rò rỉ nặng nhất: **70% bỏ cuộc ngay đây!**

Đây chính là **nút thắt cổ chai** — sửa được bước này, doanh thu bật tăng ngay!

---

**[01:31 - 01:51] So sánh phễu theo từng kênh Traffic (`GROUP BY channel`)**

Nhưng khoan! Khách không giống nhau, họ đến từ nhiều kênh khác nhau.

Chỉ cần thêm `GROUP BY channel`, ta tách 1 phễu chung thành nhiều phễu riêng cho từng kênh. Và bất ngờ lộ ra:

* **Facebook Ads:** Mang về nhiều người xem nhất, nhưng tỷ lệ mua lại thấp nhất (~6%).
* **Email:** Ít khách hơn, nhưng phễu gần như thẳng đứng (~18%) — người vào là mua!

> **Bài học:** Kênh đông khách nhất chưa chắc là kênh sinh lời nhất!

---

**[01:51 - End] Tổng kết**

Vậy là chỉ với 3 kỹ năng:

1. Đếm có điều kiện (`COUNT + CASE WHEN`)
2. Tính tỷ lệ chuyển đổi
3. So sánh theo kênh (`GROUP BY`)

Bạn đã thấy rõ tiền đang rơi ở đâu. Đừng đoán mò nữa, hãy để dữ liệu chỉ đường cho từng đồng ngân sách!

Nếu thích kiểu phân tích này, nhấn theo dõi để không bỏ lỡ tập sau nhé!

---

- https://www.tiktok.com/@lap_trinh_vn/video/7666782879912840456
  4.0 ky tu/giay | 1108 ky tu / 280s | SQL cơ bản: Phần 11: Vì sao cần JOIN? Quan hệ 1-nhiều và nhiều-nhiều .Dưới đây là transcript đầy đủ, chi tiết từ video của bạn (đã làm sạch văn phong để dễ đọc hơn nhưng giữ nguyên từng ý và cấu trúc nội dung):

---

## Transcript Nội Dung Video

**[00:00 - 00:36] Đặt vấn đề: Vì sao cần JOIN & Sơ đồ quan hệ**

Sếp hỏi: *"Ai được 8.5?"*.

Bạn chạy đúng câu lệnh quen thuộc, màn hình trả về 3 cột toàn mã số khô khốc: `SV001`, `CSDL01`, `8.5`.

Bạn đọc to lên: *"Dạ, SV001 ạ!"*. Sếp nhìn bạn. Không ai gọi nhau bằng mã, thứ sếp cần là **họ tên**. Mà họ tên thì không nằm trong bảng điểm, nó nằm ở một bảng khác!

Hai bảng nằm cạnh nhau, một bên là họ tên, một bên là điểm số. Chúng chỉ cách nhau vài chục pixel trên màn hình, mà dữ liệu thì không tự bước sang nhau được. Vì sao lại thế? Bởi vì chưa có ai ra lệnh cho chúng nối lại! Câu lệnh đó tên là **`JOIN`**.

Nhưng trước khi viết được `JOIN`, bạn phải đọc được tấm bản đồ quan hệ giữa các bảng.

Nhớ lại **khóa ngoại** ở bài trước:

* Bảng `SinhVien` có cột mã `MaSV`
* Bảng `Diem` cũng có cột mã `MaSV` đó

Một cột lặp lại ở hai nơi không phải trùng hợp, đó là **chỗ móc nối**. Nối hai cột đó lại, bạn được một sợi dây. Khóa ngoại chính là sợi dây đó. Dữ liệu chạy dọc theo nó, từ mã `SV001` bên bảng `Diem` sang đúng dòng "Trần Minh An" bên bảng `SinhVien`.

Và `JOIN` chỉ là một hành động đơn giản: kéo hai bảng lại theo đúng sợi dây đó, rồi ghép chúng thành một bảng kết quả có Họ tên, Tên môn, Điểm số nằm chung trên một dòng.

---

**[00:36 - 01:21] Chặng 1: Quan hệ 1 - Nhiều (One-to-Many)**

Nhưng sợi dây không phải lúc nào cũng ngoan ngoãn như vậy. Có 3 thứ bạn phải đọc được trước khi viết câu `JOIN` đầu tiên: 1 - Nhiều, Nhiều - Nhiều, và cả tấm sơ đồ.

Looking kỹ bảng `Diem`: mã `SV001` xuất hiện tới 3 lần (3 môn khác nhau). Còn bên bảng `SinhVien`, `SV001` chỉ có đúng 1 dòng (1 người).

$$\text{1 người} \rightarrow \text{Nhiều điểm}$$

Thử đi ngược lại xem sao: Lấy một dòng điểm bất kỳ, nó thuộc về mấy sinh viên? Đúng 1. Không bao giờ có chuyện một dòng điểm chia đôi cho hai người. Đó chính là ý nghĩa của quan hệ **1 - Nhiều**.

Người ta vẽ nó bằng hai ký hiệu:

* **Đầu 1:** Cột gạch đứng cắt ngang đường nối.
* **Đầu Nhiều:** 3 nhánh xòe ra như chân con chim (dân trong nghề gọi là **chân chim / Crow's foot**).

Giờ bạn đọc được sơ đồ: đi từ đầu gạch sang đầu chân chim, đọc là *"Một sinh viên có nhiều dòng điểm"*. Đi ngược lại thì đọc là *"Mỗi dòng điểm thuộc về một sinh viên"*.

**Thử các ví dụ khác:**

1. **Khoa và Sinh viên:** Một khoa có nhiều sinh viên, một sinh viên chỉ thuộc một khoa -> Quan hệ 1 - Nhiều. Chân chim quay về phía `SinhVien`.
2. **Môn học và Điểm:** Một môn học có nhiều dòng điểm -> Quan hệ 1 - Nhiều. Chân chim quay về phía `Diem`.

> **Mẹo nhớ đời:** Khóa ngoại luôn nằm ở phía "Nhiều". Tìm cột khóa ngoại là tìm ra đầu chân chim!

> **Chốt chặng 1:** 1 - Nhiều là quan hệ phổ biến nhất trong mọi CSDL quan hệ và nó dễ nhất, vì chỉ cần thêm đúng một cột khóa ngoại đặt bên phía "Nhiều" là xong.

---

**[01:21 - 02:08] Chặng 2: Quan hệ Nhiều - Nhiều (Many-to-Many) & Bảng trung gian**

Và đây là chỗ hay vấp:

* Một sinh viên học nhiều môn.
* Lật ngược lại: Một môn học cũng có rất nhiều sinh viên theo học!

Cả hai chiều đều là "Nhiều". Người ta gọi đó là quan hệ **Nhiều - Nhiều**.

Vậy cứ nối thẳng hai bảng lại có được không? Thử xem: Mỗi sinh viên phải kéo dây sang mọi môn mình học, mỗi môn lại kéo dây ngược về mọi sinh viên. Và đây là thứ bạn nhận được: một bùi dây rối mớ!

Thử đặt khóa ngoại vào bảng `SinhVien` xem: một ô chỉ chứa được một mã môn. Chuyển sang bảng `MonHoc` cũng vậy. Đặt ở đâu cũng sai vì một ô không nhét nổi nhiều giá trị!

**Lời giải:** Bảng thứ ba — gọi là **Bảng trung gian (Junction Table)** đứng chen vào giữa.

Mỗi dòng của bảng trung gian ghi đúng một cặp: `[Một sinh viên, Một môn]`. Búi dây tự gỡ ra! Quan hệ Nhiều - Nhiều biến mất, thay vào đó là hai quan hệ 1 - Nhiều nối tiếp nhau:

* `SinhVien` (1) $\rightarrow$ (Nhiều) `Bảng trung gian`
* `Bảng trung gian` (Nhiều) $\leftarrow$ (1) `MonHoc`

Và bất ngờ chưa? Bảng `Diem` mà bạn dùng suốt từ đầu video chính là bảng trung gian đó! Nó giữ hai cột khóa ngoại (`MaSV` và `MaMon`) cộng thêm một cột dữ liệu riêng là `Diem`.

> **Chốt chặng 2:** Không có quan hệ Nhiều - Nhiều nào sống trực tiếp trong CSDL quan hệ. Nó luôn bị tách làm đôi bằng một **bảng trung gian** đứng chen vào giữa.

---

**[02:08 - 03:03] Chặng 3: Đọc Sơ đồ quan hệ ERD (Entity-Relationship Diagram)**

Ghép tất cả lại, ta được sơ đồ của cả bộ dữ liệu khóa học: 4 bảng, 3 đường nối. Nhìn lần đầu thì rối, nhưng bạn đã có đủ chữ để đọc nó:

1. **Từ `SinhVien` $\rightarrow$ `Diem`:** Gạch đứng bên `SinhVien`, chân chim bên `Diem` -> *Một sinh viên có nhiều dòng điểm.*
2. **Từ `MonHoc` $\rightarrow$ `Diem`:** Gạch đứng bên `MonHoc`, chân chim bên `Diem` -> *Một môn học có nhiều dòng điểm.*
*(Hai chân chim cùng trỏ vào `Diem` -> Dấu hiệu chuẩn của Bảng trung gian!)*
3. **Từ `MonHoc` $\rightarrow$ `LopHocPhan`:** Một môn học có thể mở nhiều lớp qua nhiều học kỳ -> *Một môn có nhiều lớp học phần.*

**Quy tắc đọc mọi sơ đồ ERD trên đời:**

> Đặt ngón tay ở đầu gạch đứng, nói chữ **"Một..."**, trượt sang đầu chân chim, nói **"...có Nhiều"**. Chỉ vậy thôi!

Và giờ đến phần đáng giá nhất: **Mỗi đường nối trên sơ đồ chính là một mệnh đề `ON` trong câu `JOIN`!**
Muốn lấy tên môn cho một dòng điểm? Bạn đi theo cạnh đó và viết ra đúng điều kiện nối.

> **Chốt chặng 3:** Sơ đồ ERD không phải hình trang trí trong tài liệu dự án, nó là bản đồ đường đi. Mỗi cạnh vẽ trên đó chính là một câu `JOIN` mà bạn được phép viết.

---

**[03:03 - End] Cạm bẫy nhân dòng dữ liệu & Tổng kết**

Nhưng đây mới là chỗ đau: Sơ đồ đọc đúng vẫn không cứu được một câu lệnh sai, vì sợi dây mà bạn vừa học có một tác dụng phụ gần như không ai nói với bạn ở buổi đầu tiên.

Ví dụ: Mã `SV001` có 3 dòng điểm. Khi `JOIN` bảng `SinhVien` với bảng `Diem`, cái tên "Trần Minh An" bị **nhân lên 3 lần**! Đếm số dòng, bạn được 3 (trong khi ngoài đời chỉ có 1 sinh viên).

Và nếu quên bảng trung gian mà `JOIN` bừa hai bảng Nhiều - Nhiều:


$$\text{500 sinh viên} \times \text{40 môn} = \text{20.000 dòng rác}$$


...và không có lấy một dòng nào có nghĩa!

Nên đọc được sơ đồ mới chỉ là **điều kiện cần**. Điều kiện đủ là luôn biết mình đang nhân dữ liệu lên theo chiều nào ngay trước khi bấm nút chạy câu lệnh.

Quay lại câu hỏi của sếp ở đầu video: Giờ cùng một dòng dữ liệu đó, đi qua đúng một sợi dây, nó đọc lên thành: **Trần Minh An — Môn Cơ sở dữ liệu — 8.5**.

### 3 Thứ nhớ mang về:

1. **1 - Nhiều:** Khóa ngoại luôn nằm phía "Nhiều" (phía chân chim).
2. **Nhiều - Nhiều:** Luôn tách bằng một **bảng trung gian**.
3. **Sơ đồ ERD:** Mỗi cạnh nối là một mệnh đề `ON` trong câu lệnh `JOIN`.

---
- https://www.tiktok.com/@lap_trinh_vn/video/7660496832740494613
  4.1 ky tu/giay | 921 ky tu / 227s | Cơ chế hoạt động của B-Tree/Hash Index? Tại sao Index giúp tìm kiếm n.Dưới đây là transcript toàn bộ nội dung của video về **Database Indexing**, được chia theo từng phần chủ đề kèm mốc thời gian rõ ràng:

---

## Transcript Nội Dung Video

**[00:00 - 00:24] Đặt vấn đề: Sự cố chậm trễ & Khái niệm Index**

Bạn gõ tìm kiếm một sản phẩm... 1 giây, 5 giây, 30 giây trôi qua. Database vẫn đang quay cuồng, khách hàng bực bội bỏ đi, server quá tải sập luôn. Vấn đề không phải server yếu, cũng chẳng phải mạng chậm. Thủ phạm chính là cách database đi tìm dữ liệu, và giải pháp gói gọn trong đúng một từ: **Index**.

Index là gì? Hãy tưởng tượng một cuốn sách dày cả nghìn trang. Bạn cần tìm đúng từ khóa "Indexing". Nếu không có mục lục, bạn buộc phải lật từng trang một cách mệt mỏi. Nhưng mục lục ở cuối sách thay đổi tất cả: từ khóa được sắp xếp sẵn theo bảng chữ cái kèm số trang, bạn tra trong vài giây thay vì vài giờ. Index chính là mục lục đó!

Hôm nay chúng ta khám phá 3 điều:

1. **B-Tree** và **Hash Index** hoạt động ra sao.
2. Vì sao chúng tìm kiếm nhanh đến vậy.
3. Cái giá ẩn: vì sao Index làm chậm thao tác ghi dữ liệu.

---

**[00:24 - 00:46] Khi không có Index: Full Table Scan**

Vậy khi không có Index, database làm gì? Nó buộc phải thực hiện **Full Table Scan**.

Nghĩa là đọc từng dòng từ trên xuống dưới, kiểm tra lần lượt từng bản ghi để tìm ra thứ bạn cần. Với 1.000 dòng, chuyện này hoàn toàn ổn. Nhưng với 1 triệu, 10 triệu, hay cả trăm triệu dòng thì sao? Database phải quét sạch mọi thứ, kết quả: chậm khủng khiếp và ngốn sạch tài nguyên.

Giống như tìm một hồ sơ trong tủ tài liệu khổng lồ nơi giấy tờ nhét lộn xộn, không thứ tự, bạn chỉ còn cách mở từng ngăn, lục từng tờ. Rõ ràng, cứ quét bừa như vậy là không ổn. Chúng ta cần một cấu trúc thông minh hơn, một cách sắp xếp dữ liệu để tìm kiếm cực nhanh. Và đó là lúc B-Tree xuất hiện!

---

**[00:46 - 01:14] Cấu trúc B-Tree Index**

**B-Tree** (Cây cân bằng) là cấu trúc Index phổ biến bậc nhất. Nó tổ chức dữ liệu thành nhiều tầng, giống như một cây thư mục lộn ngược: gốc nằm trên, còn lá nằm dưới cùng.

Điểm mấu chốt: **Mọi giá trị trong B-Tree đều được sắp xếp sẵn theo thứ tự.** Mỗi nút chứa vài khóa và những con trỏ chỉ đường dẫn ta xuống đúng nút con phía dưới.

*Ví dụ:* Tìm số 42: Bắt đầu từ gốc ($> 30$) $\rightarrow$ rẽ sang phải, ($< 50$) $\rightarrow$ rẽ sang trái. Chỉ sau vài bước, ta chạm đúng lá. Mỗi bước loại bỏ hẳn một nửa dữ liệu còn lại!

Đây chính là sức mạnh của độ phức tạp $O(\log N)$: Với 1 triệu dòng, Full Table Scan cần tới cả triệu bước, nhưng B-Tree chỉ cần khoảng 20 bước — nhanh gấp 50.000 lần!

B-Tree còn một siêu năng lực: **Truy vấn khoảng (Range Query)**. Vì dữ liệu đã sắp xếp, câu hỏi kiểu *"giá từ 10 đến 50"* được trả lời cực nhanh, chỉ việc đọc dọc theo các lá liền kề. Vì thế, B-Tree là "con dao Thụy Sĩ" của Index: xử tốt tìm chính xác, tìm khoảng, sắp xếp, và cả tìm theo tiền tố. Mặc định gần như mọi database đều dùng nó.

---

**[01:14 - 01:33] Cấu trúc Hash Index**

Nhưng còn một loại Index khác nhanh hơn nữa cho đúng một việc, đó là **Hash Index**.

Nó không dùng cây, thay vào đó nó dùng một **hàm băm (Hash Function)** để biến khóa thành địa chỉ trực tiếp. Hãy hình dung quầy gửi áo khoác: đưa áo, bạn nhận một thẻ số. Lần sau chỉ cần đưa thẻ, nhân viên lấy đúng áo ngay lập tức, không cần lục tìm cả kho.

Hàm băm cho ta địa chỉ trong đúng **1 bước** ($O(1)$) — không duyệt cây, không so sánh nhiều lần. Tìm chính xác thì Hash là "vua tốc độ"!

Nhưng Hash có điểm yếu chí mạng: nó băm khóa thành vị trí ngẫu nhiên nên **hoàn toàn mất thứ tự**. Muốn tìm khoảng (kiểu $> 100$), Hash chịu thua! Đây là lúc phải chọn đúng công cụ.

---

**[01:33 - 01:58] Cái giá ẩn của Index (Trade-off)**

Nhưng khoan đã! Nếu Index thần thánh vậy, sao ta không đánh Index cho mọi cột?

Đây là sự thật ít ai nói: **Index không hề miễn phí, nó có một cái giá rất đắt!**

Vấn đề nằm ở thao tác GHI. Index là một bản sao dữ liệu được sắp xếp, nên mỗi lần bạn `INSERT`, `UPDATE` hay `DELETE`, database không chỉ sửa bảng gốc mà còn phải **cập nhật từng Index liên quan**.

Với B-Tree, việc này còn nặng hơn: thêm một khóa mới có thể làm một nút bị đầy tràn. Nút đó phải tách đôi, rồi cây tự sắp xếp lại để giữ cân bằng. Chỉ ghi 1 dòng nhưng phải sửa cả cấu trúc!

Vậy nên càng nhiều Index, thao tác ghi càng chậm. 5 Index nghĩa là mỗi lần `INSERT` phải cập nhật 5 cấu trúc riêng biệt. Đọc thì bay, nhưng ghi thì ạch lê từng bước!

Đây là bài học cốt lõi: **Không có kẻ thắng tuyệt đối.** Index đánh đổi tốc độ ghi để lấy tốc độ đọc. Với hệ thống đọc nhiều thì tuyệt vời, nhưng ghi liên tục thì phải cân nhắc thật kỹ.

---

**[01:58 - End] Tổng kết & Checklist**

Cùng chốt lại toàn bộ:

* **B-Tree:** Tìm chính xác nhanh, tìm khoảng tuyệt vời, sắp xếp tốt, chi phí ghi ở mức vừa phải.
* **Hash:** Tìm chính xác cực nhanh ($O(1)$), nhưng chịu thua ở truy vấn khoảng.
* **Full Table Scan:** Đọc rất chậm, bù lại ghi rẻ nhất.

### 📋 Checklist chọn Index bỏ túi:

* [x] Cột dùng để lọc (`WHERE`) hoặc `JOIN` $\rightarrow$ **Nên đánh Index**.
* [x] Cần truy vấn khoảng $\rightarrow$ **Chọn B-Tree**.
* [x] Chỉ tìm chính xác $\rightarrow$ **Cân nhắc Hash Index**.
* [x] **Đừng lạm dụng Index** trên bảng có thao tác ghi nhiều (`INSERT`/`UPDATE` liên tục).

Quay lại tình huống ban đầu: Giờ ta thêm một Index đúng chỗ, bạn gõ tìm kiếm và kết quả hiện ra chỉ trong 10 miligiây! Không còn chờ đợi, không còn server sập nữa.
- https://www.tiktok.com/@lap_trinh_vn/video/7660938148297428244
  4.2 ky tu/giay | 2343 ky tu / 553s | Big O Notation - Thước Đo Của Một Lập Trình Viên Giỏi  #data #bigo #t.Dưới đây là transcript đầy đủ cho toàn bộ nội dung video về **Độ phức tạp thuật toán (Big O Notation)**, được trình bày chi tiết theo từng mốc thời gian và cấu trúc logic của bài học:

---

## Transcript Nội Dung Video

### [00:00 - 01:10] Đặt vấn đề: Thảm họa Scale & Big O là gì?

App của bạn chạy cực mượt với 10 người dùng thử, nhưng khi 1 triệu người đổ vào cùng lúc, mọi thứ bỗng đơ cứng, đứng hình, chết, lặng hoàn toàn. Server không hỏng, mạng không nghẽn, máy chủ vẫn còn dư sức mạnh. Thủ phạm thật sự nằm ngay trong đoạn code bạn viết: một thuật toán tệ hại có độ phức tạp $O(N^2)$. Vòng quay tải trang cứ xoay mãi không dừng, người dùng bực bội thoát ra hàng loạt, đánh giá 1 sao tới tấp, và sản phẩm bạn dày công xây dựng sụp đổ chỉ trong vài phút.

Ở một buổi phỏng vấn khác, ứng viên tự tin viết code chạy đúng kết quả, nhưng người phỏng vấn chỉ hỏi đúng một câu: *"Độ phức tạp Big O của bạn là bao nhiêu?"*. Ứng viên ngớ người, và cơ hội tan biến.

Vậy điều gì thật sự tách biệt một lập trình viên giỏi với phần còn lại? Câu trả lời gói gọn trong 2 chữ cái mà ít ai thật sự nắm vững: **Big O**.

Nói thật đơn giản: Big O là cách chúng ta mô tả một thuật toán sẽ chậm đi nhanh đến mức nào khi lượng dữ liệu đầu vào ($N$) cứ ngày một phình to khổng lồ.

**Điểm mấu chốt:** Big O không quan tâm code chạy hết bao nhiêu giây trên máy của bạn. Nó chỉ quan tâm một điều duy nhất: khi dữ liệu tăng gấp đôi, gấp 10, thì công sức xử lý sẽ tăng theo tỷ lệ ra sao.

Hãy tưởng tượng một biểu đồ: trục ngang là lượng dữ liệu ($N$), trục dọc là thời gian xử lý ($T$). Mỗi thuật toán vẽ nên một đường cong riêng, và hình dạng đường cong đó chính là số phận của nó.

**Lộ trình bài học:**

1. Ý tưởng cốt lõi
2. "Vườn thú" các họ độ phức tạp thường gặp
3. Phân tích code thực chiến
4. Sự thật ít ai nói về Big O

---

### [01:10 - 02:40] Chặng 1: Bản chất Big O & Quy tắc rút gọn

Bắt đầu bằng một bài toán quen thuộc: Tìm tên một người trong danh bạ điện thoại.

Thay vì bấm đồng hồ đo giây, chúng ta đếm số thao tác:

* **Cách 1 (Tuyến tính):** Lật từng trang từ đầu tới cuối.
* **Cách 2 (Tìm kiếm nhị phân):** Lật mở giữa cuốn, rồi loại bỏ một nửa danh bạ sau mỗi lần lật.

Với cuốn danh bạ mỏng 10 trang, hai cách nhanh như nhau. Nhưng khi danh bạ dày 1 triệu trang:

* Cách 1 tốn tới **1.000.000 thao tác** ($O(N)$).
* Cách 2 chỉ tốn khoảng **20 thao tác** ($O(\log N)$).

#### 2 Quy tắc vàng khi rút gọn Big O:

1. **Bỏ qua mọi hằng số:** $O(2N)$ hay $O(500N)$ đều rút gọn thành $O(N)$. Vì khi $N$ tiến ra vô cực, hằng số multiplier không làm đổi dạng đường cong.
2. **Chỉ giữ lại số hạng lớn nhất (phần trội nhất):** Nếu code tốn $N^2 + N + 100$ thao tác, khi $N$ đủ lớn, $N^2$ sẽ "nuốt chửng" toàn bộ các phần còn lại. Ta gọi gọn là $O(N^2)$.

> **Lưu ý:** Mặc định khi nói về Big O, chúng ta luôn nói về **trường hợp xấu nhất (Worst-case Scenario)** để chuẩn bị hệ thống cho tình huống xui xẻo nhất.

---

### [02:40 - 04:30] Chặng 2: "Vườn thú" các độ phức tạp thường gặp

Sắp xếp từ nhanh nhất (tốt nhất) đến chậm nhất (nguy hiểm nhất):

| Độ phức tạp | Tên gọi | Mô tả & Ví dụ thực tế |
| --- | --- | --- |
| **$O(1)$** | Hằng số (Constant) | **Cực nhanh.** Tốn đúng 1 thao tác dù $N=1$ hay $N=1.000.000$. *Ví dụ:* Truy cập phần tử mảng theo chỉ số (`arr[5]`), lấy giá trị từ Hash Table. |
| **$O(\log N)$** | Logarit (Logarithmic) | **Rất nhanh.** Mỗi bước loại bỏ $1/2$ dữ liệu còn lại. *Ví dụ:* Tìm kiếm nhị phân (Binary Search). |
| **$O(N)$** | Tuyến tính (Linear) | **Chấp nhận được.** Dữ liệu tăng gấp đôi, thời gian tăng gấp đôi. *Ví dụ:* Duyệt qua mảng bằng 1 vòng lập `for`. |
| **$O(N \log N)$** | Tuyến tính Logarit | **Tốc độ chuẩn của Sắp xếp.** *Ví dụ:* Các thuật toán sắp xếp tối ưu như Merge Sort, QuickSort, Heap Sort. |
| **$O(N^2)$** | Bình phương (Quadratic) | **Nguy hiểm (Kẻ gây sập app).** *Ví dụ:* 2 vòng lập `for` lồng nhau (Bubble Sort, Selection Sort). $N=1.000 \rightarrow 1.000.000$ thao tác! |
| **$O(2^N)$ & $O(N!)$** | Cấp số nhân / Giai thừa | **Thảm họa (Quái vật ăn thịt máy tính).** Chỉ cần $N \approx 30-40$ là máy tính sẽ chạy đến khi "mặt trời tắt nắng" vẫn chưa xong. *Ví dụ:* Bài toán Mã đi tuần, Đệ quy Fibonacci không tối ưu, Bài toán Người du lịch (TSP). |

---

### [04:30 - 05:40] Chặng 3: Phân tích Code Thực chiến & Độ phức tạp Không gian

#### Mẹo soi Big O từ đoạn code:

* **Không có vòng lập nào phụ thuộc $N$** $\rightarrow$ $O(1)$.
* **1 vòng lập duyệt qua $N$ phần tử** $\rightarrow$ $O(N)$.
* **2 vòng lập lồng nhau cùng chạy theo $N$** $\rightarrow$ $O(N^2)$.
* **Vòng lập có biến bị chia đôi liên tục (`i = i / 2`)** $\rightarrow$ $O(\log N)$.
* **2 vòng lập nối tiếp nhau:** Tốn $N + N = 2N$ thao tác $\rightarrow$ Nối tiếp thì **CỘNG** $\rightarrow$ Rút gọn thành $O(N)$.
* **2 vòng lập lồng vào nhau:** Tốn $N \times N$ thao tác $\rightarrow$ Lồng nhau thì **NHÂN** $\rightarrow$ $O(N^2)$.

#### Cạm bẫy ẩn trong Code:

Đôi khi bạn chỉ viết 1 vòng lập `for`, tưởng là $O(N)$, nhưng bên trong vòng lập bạn gọi một hàm dựng sẵn của ngôn ngữ (như `.indexOf()`, `.contains()`, `splice()`, hay `includes()`) — bản thân các hàm này lại chạy tốn $O(N)$. Vô tình bạn đã tạo ra một thuật toán $O(N^2)$ mà không hề hay biết!

#### Độ phức tạp không gian (Space Complexity):

Big O không chỉ đo **Thời gian (Time)** mà còn đo **Bộ nhớ (Space)**.

* Nếu bạn tạo thêm một mảng mới có kích thước đúng bằng $N$ để lưu trữ dữ liệu $\rightarrow$ Độ phức tạp không gian là $O(N)$.
* **Sự đánh đổi kinh điển (Time-Space Trade-off):** Muốn thuật toán chạy nhanh hơn, thường ta phải chấp nhận tốn nhiều RAM hơn để lưu bộ đệm (Caching, Hash Map).

---

### [05:40 - 06:40] Chặng 4: Sự thật ít ai nói về Big O trong đời thực

Big O là một mô hình lý thuyết tuyệt vời, nhưng trong thực tế:

1. **Big O bỏ qua hằng số ($C$):** Đôi khi thuật toán $O(1)$ có hằng số $C = 10.000$ sẽ chạy chậm hơn thuật toán $O(N)$ có $N = 100$.
2. **Kích thước $N$ trong thực tế:** Với $N$ nhỏ (ví dụ $N < 50$), thuật toán $O(N^2)$ đôi khi chạy nhanh hơn $O(N \log N)$ do chi phí khởi tạo và bộ nhớ đệm CPU (CPU Cache) của $O(N^2)$ thấp hơn.
3. **Phần cứng đời thực:** CPU Cache, RAM speed, và cơ chế JIT Compiler của ngôn ngữ ảnh hưởng rất lớn đến tốc độ thực tế mà Big O không đo đạc được.

> **Kết luận:** Dùng Big O để định hướng kiến trúc, nhưng luôn luôn phải **đo đạc thực tế (Benchmark/Profiling)** trước khi đưa ra kết luận cuối cùng.

---

### [06:40 - End] Tổng kết & Checklist bỏ túi

#### 📋 Checklist phân tích Big O nhanh:

* [x] **Trường hợp xấu nhất:** Luôn giả định dữ liệu vào gây bất lợi nhất.
* [x] **Đếm vòng lập:** Lồng nhau = NHÂN ($N \times N$), Nối tiếp = CỘNG ($N + N$).
* [x] **Cắt giảm:** Bỏ hằng số, bỏ số hạng nhỏ, chỉ giữ lại bậc cao nhất.
* [x] **Cạm bẫy hàm ẩn:** Chú ý các hàm built-in chạy bên trong vòng lập.
* [x] **Cân bằng bộ nhớ:** Luôn đánh giá cả Time Complexity lẫn Space Complexity.

**Lời nhắn:** Viết code chạy được chỉ là khởi đầu, viết code vẫn chạy tốt khi dữ liệu phình to gấp ngàn lần mới là đẳng cấp của một kỹ sư thực thụ!

---
- https://www.tiktok.com/@lap_trinh_vn/video/7660874736951446804
  4.3 ky tu/giay | 1706 ky tu / 394s | Khi AI có thể viết mọi thứ trong vài giây, thì tư duy thiết kế hệ thố.Dưới đây là transcript đầy đủ nội dung video của bạn (đã loại bỏ đoạn quảng cáo ở giữa):

---

## Transcript Nội Dung Video

**[00:00 - 00:43] Mở đầu: Thảm họa "Scale" khi lạm dụng AI viết code**

3 giờ sáng, hệ thống sập hoàn toàn. Cả đội mở code ra và chết lặng, vì không một ai hiểu nổi nó đang chạy thế nào nữa.

Chỉ trong đúng một tháng, dự án đã phình từ vài file lên tới hàng nghìn cái hàm, mọc chằng chịt khắp nơi mà chẳng theo một trật tự nào cả.

Ban đầu ai cũng vui, vì AI viết mỗi cái hàm chỉ mất vài giây, tính năng đẻ ra ầm ầm, tốc độ nhanh gấp cả chục lần so với trước. Nhưng càng nhồi thêm tính năng, hệ thống càng rối như tơ vò. Mỗi lần sửa một chỗ thì ba chỗ khác lại hỏng theo. Chẳng còn ai nhìn ra nổi bức tranh tổng thể của cả hệ thống nữa.

Thứ mà họ tạo ra không còn là phần mềm nữa, mà là một con quái vật gồm hàng nghìn mảnh ghép rời rạc, đến mức chẳng ai dám động tay vào!

Nếu AI viết code nhanh đến vậy, thì tại sao dự án vẫn sụp đổ? Bởi vì viết được từng cái hàm chưa bao giờ là phần khó nhất cả. Phần khó thật sự nằm ở một chỗ hoàn toàn khác!

---

**[01:21 - 02:20] Chặng 1: Khi việc viết code trở nên "rẻ mạt"**

Xin chào! Và chào mừng đến với cuộc chuyển dịch lớn nhất trong lịch sử ngành lập trình.

Khi máy móc đã viết được code, giá trị của một kỹ sư không còn nằm ở việc gõ phím nhanh nữa. Viết ra một cái hàm giờ đây rẻ gần như cho không. AI làm được việc đó chỉ trong vài giây, và nó thì mỗi ngày lại càng giỏi thêm nữa.

Vậy thứ **vũ khí tối thượng** còn lại là gì?

> Đó chính là **tư duy thiết kế hệ thống (System Design)**: khả năng nhìn ra bức tranh lớn và ghép tất cả các mảnh nhỏ lại thành một khối thống nhất, vững chắc.

Trong video này, ta sẽ đi qua 3 câu hỏi lớn:

1. Vì sao viết code không còn quý?
2. Thiết kế hệ thống thật ra là gì?
3. Làm sao kết nối các module cho khéo?

Dù bạn là Junior mới vào nghề hay Senior nhiều năm kinh nghiệm, thì đây chính là kỹ năng sẽ quyết định bạn đứng ở đâu trong vài năm tới.

#### Vì sao kỹ năng viết code lại mất giá?

Ngày xưa, viết cho được một cái hàm chạy đúng là cả một kỳ công: ta phải nhớ cú pháp, lật tài liệu, rồi ngồi sửa lỗi lặt vặt hàng giờ đồng hồ liền. Còn bây giờ, bạn chỉ cần gõ vài câu mô tả bằng tiếng người bình thường, thế là AI trả về ngay một cái hàm hoàn chỉnh, có sẵn cả bài kiểm thử (test case) và chạy ngon lành trong chưa đầy một phút!

Khi thứ gì đó trở nên rẻ và sẵn có, giá trị sẽ dịch chuyển lên một tầng cao hơn. Cái quý không còn là viên gạch, mà là người biết sắp xếp các viên gạch để thành tòa nhà!

Hãy hình dung phần mềm giống như một ngôi nhà: AI chính là cái máy in gạch siêu tốc, in ra bao nhiêu viên gạch tùy bạn muốn. Nhưng khi ai cũng có sẵn cả núi gạch miễn phí, việc có gạch chẳng còn là lợi thế nữa. Thứ quyết định giờ đây là **bản thiết kế**: Ai biết ngôi nhà cần mấy tầng, phòng óc đặt ở đâu, ống nước và dây điện chạy thế nào — người đó mới thật sự cầm quyền!

> **Bài học 1:** Khi việc viết code thành ra rẻ mạt, thì kỹ năng đắt giá nhất chính là biết **nên xây cái gì và ghép chúng lại với nhau ra sao**.

---

**[02:20 - 02:58] Chặng 2: Bản chất của Thiết kế Hệ thống (System Design)**

Nghe tới thiết kế hệ thống, nhiều người cứ tưởng đó là mấy cái sơ đồ với hộp và mũi tên vẽ cho đẹp mắt. Nhưng không hề, nó thực dụng hơn thế rất nhiều!

Thiết kế tốt là vẽ ra ranh giới rõ ràng:

* **Cohesion cao (Tính gắn kết):** Mỗi module lo đúng một việc, mọi thứ liên quan thì gom lại một chỗ.
* **Coupling thấp (Tính phụ thuộc):** Các phần càng ít dính chặt vào nhau càng tốt, chỉ nói chuyện qua một cửa chung gọi là Interface.
* **Luồng dữ liệu (Data Flow):** Dữ liệu đi vào từ đâu, được biến đổi thế nào, chảy qua những trạm nào rồi đi ra ở đâu? Một hệ thống tốt có luồng dữ liệu rõ ràng như dòng nước.
* **Sự đánh đổi (Trade-off):** Không có thiết kế nào hoàn hảo! Nhanh hơn thì tốn tiền hơn, đơn giản hơn thì kém linh hoạt. Giỏi là biết chọn đúng thứ cần chọn.

Hãy nghĩ về nó như quy hoạch một thành phố: Bạn không tự tay xây từng ngôi nhà, mà bạn quyết định đường xá, khu dân cư, hệ thống điện nước để cả thành phố vận hành trơn tru.

> **Bài học 2:** Thiết kế hệ thống là những quyết định về **ranh giới, luồng chảy và sự đánh đổi** — những thứ mà AI chưa quyết thay bạn được.

---

**[02:58 - 03:40] Chặng 3: Sự thật về AI & Nút thắt cổ chai mới**

Sự thật là thế này: **AI không hề xóa bỏ được độ phức tạp của hệ thống.** Nó chỉ đơn giản là dời cục phức tạp ấy từ chỗ này sang một chỗ khác mà thôi!

Trước đây, nút thắt cổ chai nằm ở khâu viết code. Giờ AI gỡ được khâu đó, thì nút thắt mới lập tức **nhảy lên tầng thiết kế và tầng kết nối** các phần lại với nhau!

Và đây mới là chỗ trớ trêu: AI viết code càng nhanh, thì đống code hỗn loạn cũng phình ra càng nhanh! Nếu không có thiết kế dẫn đường, bạn chỉ đang lao xuống vực với tốc độ cao hơn mà thôi.

Đừng tin lời ai nói AI sẽ thay thế hoàn toàn lập trình viên, mà cũng đừng tin AI chỉ là đồ chơi vô dụng. Sự thật nằm ở giữa: **AI đổi luật chơi, và ai hiểu luật mới thì thắng!**

---

**[03:40 - 04:36] Chặng 4: Khâu kết nối (Integration) & Mô hình chuẩn**

Vậy phần khó thật sự nằm ở đâu? Không phải bên trong từng module, mà nằm ở những **chỗ nối giữa chúng** — nơi các phần phải "bắt tay" và làm việc ăn ý với nhau.

Mỗi khi hai module nói chuyện, chúng cần một bản hợp đồng: *"Tôi gửi cho anh dữ liệu kiểu này, anh phải trả về đúng kiểu kia"*. Chỉ cần một bên phá vỡ hợp đồng là cả dây chuyền đổ sập!

Nghĩ tới cảng biển với những thùng container: mọi thùng đều cùng một kích cỡ chuẩn, nên tàu nào, cần cẩu nào, xe tải nào cũng ghép vào nhau được. **Chuẩn chung chính là sức mạnh!**

#### Bản thiết kế tổng hợp của một hệ thống gọn gàng:

1. **API Gateway:** Người dùng đi vào qua cổng API chung.
2. **Microservices:** Cổng gọi tới các dịch vụ nhỏ, mỗi dịch vụ lo một việc và có kho dữ liệu riêng.
3. **Message Queue:** Các dịch vụ trao đổi qua hàng đợi tin nhắn (Message Queue), nên một phần chậm thì cả hệ thống vẫn không sập.

AI viết được ruột từng hộp, còn bạn mới là người vẽ ra cách chúng nối với nhau. Cách làm việc mới là: **Bạn cầm bản thiết kế và ra quyết định lớn, còn AI thì lấp đầy các chi tiết bên trong.** Bạn làm nhạc trưởng, AI là dàn nhạc!

---

**[04:36 - End] Tổng kết & Checklist bỏ túi**

Túm lại, giá trị lớn nhất của bạn không nằm ở từng dòng code, mà nằm ở **tấm bản đồ tổng thể** — bạn biết các mảnh ghép vào nhau ở đâu và vì sao lại ghép như thế.

### 📋 Checklist thiết kế hệ thống bỏ túi:

* [x] **Vẽ ranh giới rõ ràng** giữa các module.
* [x] **Luôn giữ Coupling thấp & Cohesion cao.**
* [x] **Định nghĩa hợp đồng (Interface/Contract) chặt chẽ** giữa các phần.
* [x] **Vẽ luồng dữ liệu** trước khi bắt tay vào viết code.
* [x] **Thấu hiểu sự đánh đổi (Trade-off):** Nhanh vs Rẻ, Đơn giản vs Linh hoạt.
* [x] **Đề AI viết chi tiết, bạn giữ bức tranh lớn.**

---

### Kịch bản 3 giờ sáng (Khi có tư duy Kiến trúc):

Cũng là sự cố sập server lúc 3 giờ sáng, nhưng lần này đội ngũ mở bản thiết kế ra, nhìn đúng một cái là biết ngay module nào hỏng, tách nó ra và sửa gọn trong 10 phút.

Sự khác biệt không nằm ở chỗ họ viết code nhanh hơn, mà nằm ở chỗ **họ hiểu rõ hệ thống của mình như lòng bàn tay!**

> **Câu thần chú mang về:** *Viết code chạy được chỉ là khởi đầu. Viết code vẫn chạy tốt khi hệ thống phình to mới là đẳng cấp!*
- https://www.tiktok.com/@lap_trinh_vn/video/7667457619010833672
  4.6 ky tu/giay | 1659 ky tu / 360s | Kiến trúc bảo mật API: API KEY và MUTUAL SSL  #security #baomat #back.Dưới đây là transcript toàn bộ nội dung audio/video của bạn:

---

## Transcript Nội Dung Video

**[00:00 - 00:36] Đặt vấn đề: Sự cố lộ API Key & Hóa đơn 3 tỷ**

2 giờ 14 phút sáng, một API nội bộ bị gọi 4 triệu lượt chỉ trong 4 tiếng đồng hồ. Không ai phá gì cả, kẻ lạ chỉ đang cầm đúng chìa khóa của công ty.

Chìa khóa đó nằm ở đâu? Trong một dòng cấu hình một bạn đẩy nhầm lên kho mã nguồn công khai 320 ngày trước, không cảnh báo nào!

Máy chủ không từ chối lần nào. Nó chỉ hỏi đúng một câu: *"Chìa khóa đâu?"*. Đưa đúng chuỗi ký tự là cửa mở toang. Hóa đơn hạ tầng tháng đó nhảy lên 3 tỷ đồng.

Câu hỏi là: Vì sao cánh cửa chỉ hỏi chìa khóa mà không bao giờ hỏi bạn là ai? Và có cách nào bắt cả hai bên cùng trình căn cước ra không? Hai câu hỏi rất khác nhau!

Hôm nay ta mở hai cánh cửa đó ra xem:

* Một bên là tấm thẻ ai cầm cũng vào được (**API Key**).
* Bên kia là cái bắt tay mà hai phía đều phải trình căn cước (**mTLS**).

---

**[00:36 - 01:45] Cơ chế xác thực & Bản chất của API Key**

Trước hết, mọi API đều phải trả lời 2 câu hỏi:

1. **Ai đang gõ cửa?** (Authentication - Xác thực)
2. **Người đó được phép làm gì?** (Authorization - Phân quyền)

Hôm nay ta chỉ bàn câu thứ nhất: **Xác thực** — cái cửa đầu tiên.

Có 2 kiểu bằng chứng để qua cửa:

* **Kiểu 1 (Cầm chuỗi bí mật):** Bạn đưa ra một thứ bạn đang giữ, như tấm vé hay chuỗi bí mật. Ai cầm cái đó thì được vào, cửa không cần biết mặt bạn là ai.
* **Kiểu 2 (Trình chứng thư):** Bạn trình một tấm căn cước có dấu của một bên mà cả hai cùng tin. Tấm này khó sao chép vì phần ruột không bao giờ rời khỏi máy bạn, kể cả lúc đang bắt tay.

Kiểu cầm chuỗi bí mật người ta gọi là **API Key**. Kiểu hai bên cùng trình căn cước gọi là **Mutual TLS (mTLS)**. Video xoay quanh 2 cái tên này!

Sân khấu thì luôn giống nhau: Một ứng dụng gọi tới, một cái cổng (API Gateway) đứng chặn ở giữa, và dịch vụ thật nằm sau lưng cổng. Mọi tranh cãi hôm nay đều diễn ra ngay tại cái cổng đó.

### API Key hoạt động như thế nào?

API Key chỉ là một chuỗi ký tự dài do máy chủ phát cho bạn. Mỗi lần gọi, bạn gắn nó vào phần Header của yêu cầu. Máy chủ đọc chuỗi đó rồi tra vào bảng của mình. Bảng đó cho máy chủ biết 4 điểm:

* Chuỗi này của ai?
* Còn hạn không?
* Được gọi những đường nào?
* Mỗi phút được gọi bao nhiêu lần?

Hết! Xác thực bằng chìa khóa đơn giản đúng như vậy.

Cái hay là rẻ và nhanh, lắp trong một buổi chiều ai cũng hiểu, lại đếm được lượt gọi để tính tiền, nên hầu hết API công khai đều bắt đầu từ đây.

### Mối nguy hiểm chết người của API Key

Nhưng nó có một tính chất chết người: **Ai cầm nấy dùng!** Chuỗi đó không gắn với người, không gắn với máy, nó chỉ là một dãy chữ — mà dãy chữ thì chép được!

Nó lộ ở những chỗ rất đời thường:

* Đẩy nhầm lên kho mã nguồn (GitHub).
* Nhúng cứng trong ứng dụng điện thoại.
* Nằm trong nhật ký (log) của máy chủ.
* Chụp màn hình gửi cho đồng nghiệp.

> **Số liệu:** Riêng năm 2024, một báo cáo đếm được hơn **23 triệu chìa khóa** bị đẩy công khai lên kho mã nguồn! Chỉ trong 12 tháng!

**Phát được không?** Được, nhưng chỉ là vá:

* Bắt buộc chạy trên kênh mã hóa (HTTPS).
* Đừng nhét chìa khóa vào URL (vì log sẽ lưu lại hết).
* Giới hạn quyền cho từng chìa.
* Đổi chìa định kỳ.

Làm hết chừng đó vẫn còn một lỗ: Trong lúc chìa khóa còn hiệu lực, bất kỳ ai cầm được nó đều là bạn trong mắt máy chủ. Không có cách nào phân biệt!

> **Chốt khối 1:** API Key trả lời câu hỏi *"Ứng dụng nào đang gọi?"* chứ không trả lời *"Máy nào đang gọi?"*. Muốn hỏi câu thứ hai, ta cần một thứ khác!

---

**[01:45 - 02:28] Giải pháp Nâng cao: Mutual TLS (mTLS)**

Mỗi lần bạn vào một trang web có ổ khóa nhỏ trên trình duyệt, đã có một cuộc bắt tay (TLS Handshake) diễn ra. Nhưng chỉ một bên trình giấy tờ: đó là **Máy chủ**. Còn bạn thì không ai hỏi.

**Mutual TLS (mTLS)** nghĩa là 2 chiều: Máy chủ vẫn trình giấy như cũ, nhưng lần này nó quay sang đòi: *"Bạn cũng phải trình!"*. Không có giấy, cuộc bắt tay đứt ngay lập tức, chưa kịp chạm tới ứng dụng.

Tấm giấy đó gọi là **Chứng thư số (Certificate)**. Bên trong ghi tên chủ nhân, ngày hết hạn, và chữ ký của một cơ quan cấp phát (CA) mà cả hai bên cùng tin.

### Điểm kỹ thuật cốt lõi

Máy chủ gửi một mẫu dữ liệu ngẫu nhiên và bảo: *"Ký cái này đi!"*. Bạn ký bằng **Khóa riêng (Private Key)** nằm trong máy mình. Khóa riêng đó **không bao giờ đi ra đường truyền**!

Vậy nên chép trộm tấm chứng thư cũng vô ích, nó chỉ là phần vỏ. Không có khóa riêng thì không ký được, mà không ký được thì cửa không mở.

Nhận được chữ ký rồi, máy chủ còn soi tiếp 3 thứ:

1. Chứng thư này có đúng do CA của mình cấp không?
2. Còn hạn không?
3. Có nằm trong danh sách thu hồi (CRL/OCSP) không?

Đủ cả 3 mới mở!

> **Khác biệt cốt lõi:** Chìa khóa (API Key) chứng minh bạn đang *giữ một bí mật*. Chứng thư (mTLS) chứng minh *bạn là ai*.

### mTLS được dùng ở đâu?

* Cổng thanh toán ngân hàng.
* Đường nối giữa các Microservices bên trong một công ty.
* Thiết bị IoT ngoài hiện trường gửi số liệu về trung tâm.

> **Chốt khối 2:** mTLS kiểm danh tính 2 đầu dây trước khi có đường truyền. Chưa đủ giấy là chưa có kết nối!

---

**[02:28 - 03:07] Mô hình Kết hợp & Quản lý vòng đời Chứng thư**

So sánh hai bên:

* **API Key:** Lắp 1 buổi, mở cho cả thế giới dùng, hợp với API công khai.
* **mTLS:** Lắp cả tuần, chỉ hợp với bên bạn biết mặt (đối tác/nội bộ).

Nhưng hai thứ này **không thay thế nhau**! Thực tế người ta xếp chồng cả hai:

* **Lớp ngoài (mTLS):** Cổng đòi chứng thư. Máy lạ không vào tới cửa!
* **Lớp trong (API Key):** Ứng dụng vẫn kiểm chìa khóa để biết ai gọi và gọi bao nhiêu.

### Cách triển khai thực tế

Đừng bắt từng dịch vụ tự kiểm chứng thư! Cho **API Gateway** làm việc đó 1 lần, rồi nó ghi tên bên gọi vào Header (`X-Client-Cert`) truyền vào trong.

> **Lưu ý:** Phải khóa cửa sau! Nếu dịch vụ bên trong nhận được Request đi thẳng không qua Gateway, cái Header kia ai cũng tự ghi được.

### Cái giá của mTLS: Quản lý vòng đời (Lifecycle)

Cái giá thật sự của chứng thư nằm ở vòng đời: Mỗi tấm đều có ngày hết hạn. Và mỗi lần hết hạn là một lần hệ thống có thể chết — thường vào lúc 3 giờ sáng!

> **Luật thép:** Đừng để con người nhớ ngày hết hạn! Máy phải tự xin, tự đổi, tự nạp lại chứng thư (sử dụng các công cụ như Cert-Manager / Vault) và cảnh báo trước ít nhất 1 tháng.

> **Chốt khối 3:** mTLS ở lớp Cổng, API Key ở lớp Ứng dụng. Một cái hỏi máy nào, một cái hỏi ứng dụng nào. Two lớp cửa!

---

**[03:07 - End] Sự thật về Bảo mật & Tổng kết**

Nhưng chứng thư có cái giá, và cái giá lớn nhất không phải là tiền.

Chứng thư chỉ trả lời câu hỏi *"Ai đang gõ cửa?"*, nó **không trả lời câu hỏi *"Người đó được làm gì bên trong?"***. Một máy có chứng thư hợp lệ mà mã nguồn có lỗ hổng thì vẫn toang như thường!

Cửa đã mở đúng người, nhưng người đó lấy nhầm dữ liệu của khách khác — mTLS không cứu được chuyện đó.

Ngoài ra:

* Khóa riêng nằm trên đĩa của một máy, máy đó bị chiếm thì khóa cũng đi theo.
* Một tấm chứng thư 1 năm hết hạn, đúng 3 giờ sáng hết hạn $\rightarrow$ Mọi dịch vụ dừng nói chuyện với nhau cùng lúc!

Chính vì thế, đừng coi xác thực là cả ngôi nhà, **nó chỉ là cánh cửa**. Sau cánh cửa vẫn phải có:

1. Phân quyền (Authorization)
2. Giới hạn lượt gọi (Rate Limiting)
3. Nhật ký theo dõi (Audit Log)
4. Thời hạn thật ngắn cho mọi thứ

Quay lại 2 giờ 14 phút sáng: Chìa khóa lộ vẫn còn nguyên tác dụng, nhưng nếu cổng đòi thêm một tấm chứng thư (mTLS), đêm đó đã là một đêm yên tĩnh!

### 3 Cần nhớ:

1. **API Key:** Thứ bạn *có* (ai cầm cũng dùng được).
2. **mTLS:** Thứ bạn *là* (hai bên cùng trình chứng thư).
3. **Cái đắt nhất của mTLS:** Quản lý ngày hết hạn.

---

### Bảng Nấc Thăng Bảo Mật API:

* **Nấc 1:** Chưa có gì (Ai gọi cũng được).
* **Nấc 2:** Có API Key.
* **Nấc 3:** mTLS (Hai bên cùng trình căn cước).

Hệ thống của bạn đang ở nấc mấy? Kể cho mình nghe ở phần bình luận nhé! Thấy hữu ích thì bấm Like và Đăng ký kênh nha!

---
