Dưới đây là transcript đầy đủ và chính xác 100% nội dung audio/video của bạn:

---

## Transcript Video: Bản Chất Độ Trễ (Latency) Giữa Hình Video & Chữ Bình Luận Trong Livestream

**[00:00 - 00:23] Đặt vấn đề: Lạc đề giữa Shop và Người xem**

2.100.000 người trong một phiên live. Bạn gõ câu hỏi về cái áo shop đang cầm trên tay, bấm gửi, chữ hiện lên màn hình bạn ngay lập tức.

20 giây sau shop mới đọc tới nó. Trên tay họ lúc đó đã là cái áo khác. Bạn thấy shop trả lời lạc đề, bạn gõ lại lần nữa, vẫn thế.

Shop không chậm, mạng nhà bạn cũng không yếu. Thứ bạn đang nhìn trên màn hình lúc này đã cũ 20 giây. Còn dòng chữ bạn vừa gõ thì bay tới nơi trong $1/5$ giây.

Cùng một phiên live, hai dòng dữ liệu có tốc độ lệch nhau gấp **100 lần**. Hôm nay tôi mổ chỗ lệch đó ra làm ba: **Mẫu**, **Đệm**, và **Chữ**.

---

**[00:43 - 01:11] Bản chất luồng Video: Không có sợi dây nào!**

Bạn hình dung live như một sợi dây: máy quay đầu này, màn hình bạn đầu kia, hình chảy thẳng qua dây, liên tục không đứt?

**Thật ra không có sợi dây nào cả.**

Đoạn hình đó bị cắt thành từng mẩu ngắn (`segment`). Mỗi mẩu đóng thành một tệp riêng có tên riêng (ví dụ: `seg-104.ts`). Máy bạn tải về từng tệp một, giống hệt lúc bạn tải một tấm ảnh.

Còn bình luận thì không bị cắt. Nó là một dòng chữ ngắn, đi bằng một đường riêng mở sẵn từ trước (`WebSocket/Socket`), lúc nào cũng thông. Gõ xong là đi.

Hai đường chạy song song trong cùng một phiên live, nhưng luật chơi của chúng khác hẳn nhau!

---

**[01:11 - 01:54] Khoản Nợ 1 (Mẫu - 4 giây): Vì sao không cắt 1 giây cho nhanh?**

Máy quay của shop đẩy ra hình liên tục: 30 khung/giây. Nhưng máy chủ không gửi từng khung một vì quá tốn (mỗi giây phải mở 30 lượt connection).

Nó gom lại, **gom đủ 4 giây hình mới đóng được 1 tệp**. Ghi tên tệp vào danh sách rồi mới đẩy tệp đó ra cho cả thế giới tải về.

Nghĩa là khoảnh khắc shop giơ cái áo lên, nó phải nằm chờ trong máy chủ đủ 4 giây tiếp theo mới có tệp.

> **Khoản Nợ 1:** **4 giây** (Tiền mua sự rẻ).

*Sao không cắt mỗi mẩu 1 giây cho nhanh?*
Cắt ngắn 4 lần thì số lượt hỏi xin tệp (`HTTP Request`) tăng gấp 4 lần. Nhân với 2.100.000 người:

* Cứ 4 giây: 2 triệu lượt hỏi xin.
* Rút xuống 1 giây: thành **8 triệu lượt/giây**!

Cái giá của độ trễ thấp không nằm ở 1 máy, nó nhân với số người đang xem.

---

**[01:54 - 02:37] Khoản Nợ 2 (Đệm - 12 giây): Tiền mua sự mượt**

Tệp về tới máy bạn rồi nhưng vẫn chưa được phát ngay.

Tệp đầu tiên đã nằm trong máy, trình phát có đủ hình để chiếu rồi nhưng nó không chiếu. Nó ngồi đợi tệp thứ hai, rồi đợi tiếp tệp thứ ba. **3 tệp $\times$ 4 giây = 12 giây hình** xếp hàng nằm chờ trong máy bạn mà chưa ai được xem.

Chỗ xếp hàng đó gọi là **Bộ đệm (Buffer)**.

*Vì sao phải đợi?* Vì mạng di động không chảy đều, nó giật cục, cứ vài phút lại hụt vài trăm miligiây.

Bộ đệm là cái bể chứa: Nguồn phía trên ngắt vài giây thì vòi phía dưới vẫn chảy đều vì trong bể còn hàng. Người xem không thấy gì bất thường. Bể càng dày càng an toàn.

> **Khoản Nợ 2:** **12 giây** (Tiền mua sự mượt).

#### Tổng cộng độ trễ hình:

$$\text{4s (Gom tệp)} + \text{12s (Bộ đệm)} + \text{4s (Đường truyền)} = \mathbf{20\text{ giây!}}$$

---

**[02:37 - 03:19] Khoản Nợ 3 (Chữ - 0 giây): Nhanh gấp 100 lần!**

Bình luận của bạn nặng chừng **40 byte** (bằng đúng một dòng chữ).

* Bản thân nó đã trọn vẹn ngay lúc bấm gửi, không cần chờ gom.
* Không cần bể chứa. Hình hụt 1 nhịp thì đứng khung thấy ngay, còn chữ tới trễ $0{,}5$ giây không ai nhận ra.
* Chữ đi bằng một đường mở sẵn giữa máy bạn và máy chủ, không đóng mở giữa chừng, không bắt tay lại từ đầu (`TCP Handshake`).

Đo thật: Một bình luận từ Hà Nội tới máy chủ mất khoảng **200 ms ($0{,}2$ giây)**.

$$\frac{20\text{s (Hình)}}{0{,}2\text{s (Chữ)}} = \mathbf{\text{Nhanh gấp 100 lần!}}$$

> **Thảm cảnh:** Shop đọc bình luận của bạn ngay tức thì, nhưng cái áo bạn đang hỏi thì họ đã cất đi từ 20 giây trước! Two người nói chuyện ở two mốc thời gian khác nhau!

---

**[03:19 - 03:47] Đánh đổi: Hạ 20 giây xuống 2 giây được không?**

Hạ xuống dưới 2 giây được chứ! (Dùng công nghệ Low-Latency HLS / WebRTC).

Cách làm:

* Cắt mẩu ngắn lại còn vài phần mười giây.
* Rút bể chứa (Bộ đệm) xuống còn 1 tệp.

20 giây co lại thành 2 giây, nghe rất ngon. **Nhưng bạn vừa tháo mất chính cái bể chống giật!**

Mạng di động hụt 400 ms (chuyện xảy ra liên tục ngoài đường), bể mỏng mới không nuốt nổi nữa. Người xem sẽ bị **đứng khung ngay giữa câu nói!**

Với 2,1 triệu người: $1\%$ mạng yếu là **21.000 người xem bị giật khung** để đổi lấy 18 giây cho những người còn lại!

---

**[03:47 - End] Kết luận**

Mượt (`Smoothness`) và Tức thì (`Low Latency`) không phải two mục tiêu cùng tiến. Chúng là two đầu của cùng một cái cân, và **Bộ đệm chính là quả cân**.Không có cấu hình nào cho cả hai, chỉ có lựa chọn đặt quả cân ở đâu.

Lần sau thấy độ trễ trong livestream, đừng hỏi *"Ai đang chậm?"*. Hãy hỏi: **"Bộ đệm đang dày bao nhiêu giây?"**

---

**Câu hỏi thảo luận:**
Bạn từng bị shop trả lời lạc đề khi xem livestream chưa? Kể cho mình nghe ở phần bình luận nhé!
Dưới đây là toàn bộ transcript của video (đã loại bỏ phần quảng cáo):

1.000 người, sập. Đây là trang nội bộ của một công ty, 1.000 nhân viên mở cùng lúc sáng thứ Hai. Vòng quay tải cứ quay hoài rồi lỗi hết giờ.

Cùng tối hôm đó, một phiên livestream có 2.100.000 người xem cùng lúc. Bình luận chạy như thác, quà tặng kín màn hình, bảng xếp hạng nhảy số không ngừng. Không giật một khung nào. Gấp 2.000 lần số người, một bên chết, một bên mượt.

"Nhiều máy chủ hơn thì đúng, nhưng không ai nhiều hơn gấp 2.000 lần. Không ai cả."

Câu trả lời không nằm ở số máy chủ. Nó nằm ở một phép đếm mà gần như không ai làm. Đếm sai chỗ này, thêm bao nhiêu máy cũng vô ích.

Máy chủ không nhìn thấy người, nó chỉ thấy lượt hỏi, chỉ vậy thôi. Và thứ quyết định nó sống hay chết không phải số lượt hỏi, mà là trong đống đó có bao nhiêu câu hỏi khác nhau.

Hình dung một lớp học có 1.000 học sinh. Mỗi em giơ tay hỏi một câu riêng, không em nào giống em nào. Thầy phải nghĩ đúng 1.000 lần, 1.000 lần suy nghĩ.

Giờ đổi lại, cả 1.000 em cùng hỏi đúng một câu. Thầy nghĩ một lần, viết ra một tờ, rồi đem đi photo 1.000 bản. Vẫn 1.000 em, mà khối lượng khác hẳn: 1 lần nghĩ.

Tôi gọi con số đó là **Tỷ lệ dùng lại**: Một câu trả lời phục vụ được bao nhiêu người. Trang nội bộ của bạn, tỷ lệ đó đúng bằng 1. Phiên live kia, 2.100.000. Cùng một tờ giấy, bên trái phục vụ được 1 người, bên phải 2.100.000.

Bắt đầu từ phía đau trước: 1.000 nhân viên mở trang nội bộ. Mỗi người nhìn thấy một màn hình khác nhau: đơn của tôi, giỏ của tôi, lương của tôi... 1.000 màn hình khác nhau. Không câu trả lời nào dùng lại được cho người ngồi bên cạnh. Nên mỗi lần mở trang là một lần máy phải xuống tận kho dữ liệu, tìm, ghép rồi tính lại từ đầu. Từ đầu, mỗi lần.

Một kho dữ liệu cỡ thường làm được chừng 2.000 lượt tìm nhỏ mỗi giây. 1.000 người, mỗi người bấm vài nhát là 4.000 lượt. Thế là bắt đầu xếp hàng, và hàng không ngắn lại. Xếp hàng thì mỗi lượt chờ lâu thêm một chút. Chờ lâu thì người ta bấm lại, bấm lại thì hàng dài thêm. Đó là toàn bộ câu chuyện lag của 1.000 người.

Giờ nhìn sang phiên live, 2,1 triệu người. Tất cả cùng xin đúng một thứ: mẩu hình mới nhất của giây đó. Cùng một cái tên, cùng một đống byte. Máy chủ không phải nghĩ gì cả, nó chỉ phải chép. Tính một câu hỏi mới tốn vài miligiây, còn chép một tệp nằm sẵn trong bộ nhớ thì tốn vài phần triệu giây. Chênh nhau cả nghìn lần!

Nên câu phải hỏi đầu tiên không phải là "Bao nhiêu người?", mà là "Bao nhiêu câu hỏi khác nhau?". Hỏi khác nhau thì phải tính, hỏi giống nhau thì chỉ phải chép.

Nhưng chép không nhẹ như nghe. Mỗi mẩu hình nặng chừng 1,5 MB. Nhân với 2.100.000 người là 3.000 GB. Tất cả phải xong trong 4 giây.

Một máy chủ mạnh có đường ra chừng 25 Gigabit/giây. Muốn tự tay đẩy hết chỗ đó, bạn cần hơn 250 máy — chỉ để bơm byte ra ngoài, chưa tính gì khác.

Nên không ai xếp máy nằm phẳng một hàng, người ta xếp thành cây: 1 gốc, vài trạm vùng, rồi hàng nghìn máy biên đặt ngay trong thành phố của người xem. Gốc chỉ gửi đi vài chục bản, mỗi trạm vùng chép cho vài chục máy biên, mỗi máy biên lo cho vài nghìn người quanh đó. Không tầng nào phải gánh cả 2.100.000.

Nhưng cái cây này có một kẽ hở, và nó mở ra đúng 4 giây một lần. Lúc mẩu mới vừa ra đời, chưa máy biên nào có nó. 2.100.000 lượt hỏi cùng trượt, cùng dồn ngược lên gốc cùng 1 giây.

Chỗ chặn lại nằm ở vài dòng lệnh, không nằm ở tiền mua máy. Máy biên thấy 50.000 người cùng hỏi một tệp, thì nó chỉ gửi lên trên 1 lượt. Số còn lại chờ chung câu trả lời đó, đúng 1 lượt! 1 lượt hỏi thật, 50.000 người được phục vụ. Cái cây không làm cho số byte ít đi, nó làm cho không ai phải gánh một mình.

Tới đây thì mọi thứ đều chép được. Nhưng trong phiên live còn một đường nữa, nó chạy ngược chiều, và đường đó không chép được — không một lượt nào! Là lúc bạn gõ bình luận, thả tim, bắn quà... không ai gõ hộ bạn. Nên mỗi lượt gõ là một việc thật, phải làm thật, không có bản sao nào dùng lại được.

Điều may là đường này nhỏ hơn nhiều. Trong 2,1 triệu người, phần lớn chỉ ngồi xem. Số người thật sự chạm tay vào bàn phím thấp hơn cả trăm lần. Đọc thì mênh mông, ghi thì bé.

Nhưng bé không có nghĩa là dễ. Đọc chỉ cần chép đúng, còn ghi thì phải đúng thứ tự, đúng người và không được mất. Nên hai đường này chạy trên hai hệ thống tách hẳn nhau.

Tách ra để làm gì? Để lúc đường ghi nghẽn, 2,1 triệu người vẫn xem được. Bạn mất ô bình luận trong 30 giây, còn phiên live thì không sập. Hỏng một phần, không hỏng cả cái.

Đó là cách chia đúng: Đường đọc thì chép cho thật rẻ, đường ghi thì làm cho thật chắc. Và hai đường không được phép kéo nhau xuống.

Giờ tôi lật lại: Vẫn 2,1 triệu người đó, vẫn tối hôm đó, vẫn đúng bộ hạ tầng đó... Tôi chỉ đổi một thứ duy nhất: Mỗi người xem một phiên live khác nhau. Chỉ một thứ!

Tỷ lệ dùng lại rơi thẳng về 1. Cái cây phát tán vỡ thành 2.100.000 nhánh riêng. Mỗi nhánh phục vụ đúng một người. Cùng bộ máy đó, sập trong vài giây. Nghĩa là họ chưa bao giờ gánh 2,1 triệu người. Họ gánh đúng 1, rồi đem photo 2,1 triệu bản. Con số 2,1 triệu nghe thì khủng khiếp, nhưng nó nằm ở đúng phần rẻ nhất.

Và trang nội bộ của bạn lag không phải vì 1.000 người. Nó lag vì 1.000 câu hỏi khác nhau. Đông không giết hệ thống, khác nhau mới giết.

Quay lại hai màn hình lúc đầu: Bên trái, 1.000 người và 1.000 câu hỏi. Bên phải, 2,1 triệu người và đúng 1 câu hỏi. Giờ bạn nhìn ra cái nào nặng hơn: Bên trái nặng hơn.

Nên trước khi đi thêm máy, hãy ngồi đếm trong tải của bạn: Câu hỏi nào đang bị hỏi đi hỏi lại? Trả lời nó một lần rồi chép! Thêm máy mua được vài lần, chép lại mua được cả nghìn lần.

Dưới đây là transcript chuẩn của video (đã loại bỏ đoạn quảng cáo):

---

4 năm đại học, bạn học cây nhị phân, vẽ đi vẽ lại, thi cử, phỏng vấn, rồi đi làm mở database nào ra cũng không thấy nó. Cái nào cũng dùng thứ khác, tên là cây B.

Cây B ra đời năm nào? Ba mốc:
1995, lúc web bùng nổ;
1983, thời máy vi tính;
hay 1970, khi chưa có màn hình màu?

Đáp án là mốc sớm nhất. Nhưng đáng nói không phải con số năm. Cuối video này, bạn sẽ tự nói ra được quyết định của họ, trước khi tôi kịp nói nó ra. Và bạn sẽ thấy một chuyện lạ hơn: 3 ràng buộc ép họ chọn như vậy thì 2 cái đã chết hẳn. Cái quyết định này vẫn nằm nguyên trong máy bạn sáng nay. Vì sao là cây B?

Trước khi đào, nói cho công bằng, cái bản án mà gần như ai cũng tin: "Cây nhị phân đã nhanh theo logarit rồi, cây B chỉ là một cú tối ưu vặt cho hợp với đĩa cứng" - nghe rất hợp lý. Và bản án đó không hề ngớ ngẩn. Trên giấy, nó đúng từng chữ. Cả hai cây đều chia nhỏ không gian sau mỗi bước, cả hai đều là logarit. Tôi cũng từng nghĩ vậy.

Trước hết, cả ngành đứng về phía bản án đó. Mọi giáo trình đều mở đầu bằng cây nhị phân. Mọi buổi phỏng vấn đều hỏi nó. Không ai hỏi bạn cây B tách nút thế nào. And nếu bạn đo bằng số phép so sánh, cây nhị phân thắng thật. Tìm 1 triệu khóa, nó so 20 lần. Cây B với nút to, so nhiều hơn hẳn tính riêng bên trong mỗi nút.

Nên bản án nghe rất chắc: nhanh bằng nhau về lý thuyết, mà cây nhị phân lại đơn giản hơn nhiều. Vậy chọn cái phức tạp hơn để làm gì, ngoài do lịch sử?

Trả lời: Không nằm trong lý thuyết. Nó nằm trong một phòng thí nghiệm của hãng Boeing năm 1970, nơi hai kỹ sư đang nhìn vào thứ mà giáo trình không bao giờ vẽ.

Thứ đó là cái đĩa cứng, một cỗ máy to cỡ cái tủ lạnh. Bên trong là những đĩa kim loại quay liên tục và một cần gạt mang đầu đọc trượt ra trượt vào. Mỗi lần cần gạt nhích sang rãnh khác, nó mất khoảng 30 ms, cộng thêm 8 ms chờ đĩa quay tới đúng chỗ. Tổng cộng một lần chạm dữ liệu: 38 ms.

38 ms nghe rất nhỏ. Nhưng máy thời đó chạy được cả trăm nghìn lệnh trong khoảng ấy. Nói cách khác, một lần chạm đĩa đắt bằng hàng trăm nghìn phép so sánh trong bộ nhớ.

Nên nếu bạn nghĩ cứ chờ máy nhanh hơn là xong, hãy nhìn lại con số. Vấn đề không phải máy chậm. Vấn đề là cây nhị phân trên 1 triệu khóa cần 20 lần chạm. 20 lần chạm, mỗi lần 38 ms = 760 ms cho một lần tra đúng một khóa. Dưới ràng buộc đó, bạn làm gì?

Bạn sẽ thôi đếm số phép so sánh. Bạn sẽ đếm số lần chạm đĩa, vì đó mới là thứ tốn tiền. Và cả bài toán đổi từ "làm ít phép so lại" thành "đi ít tầng lại".

Thẻ thứ nhất úp xuống: Một lần chạm đĩa 38 ms, nên thứ phải giảm là số tầng, không phải số phép so. Từ đây, cây càng thấp càng tốt.

Nhưng làm cây thấp lại bằng cách nào? Câu trả lời nằm ở một chi tiết mà không giáo trình nào nhắc tới: Cái đĩa đó không đọc được 1 byte. Nó chỉ đọc được nguyên một rãnh. Một rãnh của cỗ máy đó chứa 13.030 byte. Bạn cần lấy một khóa 8 byte, máy vẫn phải kéo về đủ 13.000 byte. Không có cách nào lấy ít hơn.

Nghĩa là đọc 1 khóa và đọc 800 khóa tốn thời gian y hệt nhau. Bạn đã trả tiền cho cả cái rãnh rồi, để trống 799 chỗ trong đó là vứt tiền đi.

Nên nếu bạn định nói: "Vậy dùng cây nhị phân cân bằng cho chuẩn", thì cân bằng không cứu được gì. Nút vẫn chỉ có 2 con, mỗi nút vẫn là một lần chạm, và lần chạm nào cũng kéo về cả rãnh gần rỗng.

Một lần chạm kéo về 13.000 byte mà bạn chỉ dùng có 8. Dưới ràng buộc đó, bạn sẽ nhét gì vào chỗ còn trống?

Bạn sẽ nhét thêm khóa, nhét cho tới khi đầy một rãnh. 1 nút thành ra mang được vài trăm khóa thay vì 1. Và cây 1 triệu khóa tụt từ 20 tầng xuống còn 3.

Thẻ thứ hai úp xuống: Đơn vị đọc nhỏ nhất là cả một rãnh, nên nút phải to bằng đúng đơn vị đó. Cây thấp và béo thay vì cao và gầy.

Còn một ràng buộc nữa, và nó trả lời câu: Vì sao không nạp hết cây vào bộ nhớ? Bộ nhớ chính của máy chỉ thời đó đo bằng vài trăm KB. Vài trăm KB, còn index của một bảng lớn đã hàng chục MB. Tỉ lệ giữa bộ nhớ và dữ liệu rơi vào cỡ 1/vài trăm.

Hình dung thế này: Bạn có một cái bàn và một nhà kho lớn gấp vài trăm lần cái bàn đó. Mọi thứ phải nằm trong kho. Bàn chỉ đủ chỗ cho vài trang đang mở. Nên phương án nạp hết vào bộ nhớ rồi dùng cây nhị phân là bất khả. Không phải vì chậm, mà vì không đủ chỗ. Cây bắt buộc phải sống trên đĩa và bị sửa ngay tại chỗ nó nằm.

Cây nằm trên đĩa, bộ nhớ chỉ giữ nổi vài trang, mà dữ liệu thì thêm mới mỗi ngày. Dưới ràng buộc đó, bạn giữ cho cây cân bằng bằng cách nào?

Bạn không dựng lại cả cây. Bạn để mỗi nút tự tách đôi khi nó đầy, và tự gộp với hàng xóm khi nó vơi. Cây giữ thăng bằng bằng những sửa chữa cục bộ, mỗi lần chỉ chạm vài trang.

Thẻ thứ ba úp xuống: Bộ nhớ nhỏ hơn dữ liệu vài trăm lần, nên cây phải sống trên đĩa và tự cân bằng tại chỗ.

Và cái quyết định đã tự hiện ra: Một nút = Một lần đọc đĩa = Một trang đầy khóa.

Giờ tới phần vui: 3 ràng buộc đó, hôm nay còn lại bao nhiêu?

Từ khoảng 2015, máy chủ gần như hết đĩa quay. Ổ thể rắn tra 1 trang trong khoảng 100 micro giây. 38 ms thành 0,1 ms — nhanh hơn gần 400 lần. Thẻ thứ nhất: Đóng dấu hết hiệu lực.

Bộ nhớ máy chủ hôm nay hàng trăm GB, thừa sức ôm trọn index của phần lớn bảng. Thẻ thứ ba: Cũng đóng dấu hết hiệu lực.

Còn thẻ thứ hai, cầm con dấu lên và không đóng xuống được. Vì cái ràng buộc đó chưa bao giờ biến mất, nó chỉ đổi tên. Ổ thể rắn vẫn đọc theo trang 4 KB, hệ điều hành vẫn phân trang 4 KB, con chip vẫn nạp bộ nhớ đệm theo dòng 64 byte. Từ rãnh sang trang sang dòng đệm, máy vẫn chưa bao giờ đọc được 1 byte.

Và cây B, cấu trúc duy nhất dựng quanh đúng đơn vị đó. Lý do cũ hết hạn, cái quyết định thì không.

Quay lại con số bạn đoán lúc đầu: 1970. Cái cây trong máy bạn sáng nay già hơn gần như mọi thứ khác nằm trong đó. Và nó vẫn đang thắng.

Ba dòng mang về:

1. Khóa index càng hẹp thì cây càng thấp, vì một trang nhồi được nhiều khóa hơn.
2. Khóa ngẫu nhiên, mỗi lần ghi một trang khác.
3. Lần sau nghe ai nói cấu trúc này là logarit, hãy hỏi tiếp 2 câu: "Cơ số mấy?" và "Mỗi bậc chạm vào cái gì?".

Cây B không thắng vì nó thông minh hơn. Nó thắng vì hỏi phần cứng trước khi hỏi lý thuyết.

Ràng buộc nào trong quyết định bạn viết hôm nay sẽ hết hiệu lực trước, mà đoạn mã thì vẫn còn đó?

Đây là tập 2 của loạt bài về các loại index. Tập sau, tôi mổ loại nhanh hơn cây B cho phép so bằng, mà gần như không ai nên dùng. Bạn đoán ra chưa? Viết xuống bình luận, tập sau tôi mổ nó.

Cùng một bảng, cũng mười hai triệu dòng, cả bốn cột đều được đánh index từ lâu. Vậy mà ba trong bốn câu vẫn quét sạch cả bảng. Không câu nào báo lỗi, không cảnh báo nào. Bạn mở kế hoạch chạy lên xem, và ba lần liền, nó ghi đúng một chữ quét tuần tự, index vẫn nằm đó, nguyên vẹn. Bạn xóa index đánh lại, bạn chạy phân tích lại bảng. Ba câu đó vẫn quét. Tới đây thì phần lớn chúng ta kết luận, chắc bảng còn nhỏ nên máy thấy quét nhanh hơn. Không phải, bảng đó mười hai triệu dòng, và câu thứ tư dùng index rất ngọt. Cùng một bảng, cùng một cái index, một câu dùng được, ba câu không. Khác biệt không nằm ở dữ liệu. Nó nằm ở chỗ không ai nhìn. Cái index bạn tạo ra, không sai. Nó chỉ không phải loại index trả lời được câu hỏi bạn đang hỏi. Gõ lệnh tạo index đi, bạn viết tên bảng, tên cột, rồi chấm hết. Ở đâu trong câu lệnh đó, bạn được chọn loại index? Không có chỗ nào cả. Bạn chưa bao giờ chọn, vì máy chưa bao giờ hỏi. Máy chọn hộ bạn, và luôn chọn cùng một thứ, một cấu trúc tên là PB. Postgres, MySQL, cả ba đều vậy. Đây là câu lệnh duy nhất trong SQL âm thầm chọn hộ bạn một cấu trúc dữ liệu. Khoan, chỉ 399k thôi. Cái animation bạn vừa xem ấy, lấy câu hỏi đúng. Không phải index của tôi có tốt không. Câu hỏi đúng là câu tôi đang hỏi có trả lời được bằng thứ tự không. Bốn câu lệnh đêm đó tách làm hai nhóm, đúng theo ranh giới này. Bắt đầu từ nhóm chạy được, câu thứ tư hỏi, cho tôi đơn hàng của khách số 42. Máy đi vào cây, sau một lần, rẽ trái, sau lần nữa rẽ phải. Bốn lần so, là tới nơi. Mười hai triệu dòng, bốn lần so, vì mỗi lần so bỏ đi một nửa số dòng còn lại. Đó là toàn bộ phép màu của PB, và nó chỉ chạy được vì hàng đã xếp sẵn. Cùng cái hàng đã xếp đó trả lời được ba câu hỏi nữa, gần như miễn phí. Lớn hơn một triệu, nằm giữa tháng 3 và tháng 6, và bắt đầu bằng chữ Nguyễn. Bốn câu hỏi khác nhau, một cấu trúc, vì cả bốn thật ra là cùng một câu, đi tới chỗ nào trong hàng rồi đọc tiếp từ đó. Máy không hiểu ngày tháng, nó chỉ biết cái nào đứng trước. Và đây là chỗ ranh giới lộ ra, sắp xếp cần một phép so. Với số thì so được, với ngày cũng so được, với chữ thì có bảng chữ cái. Hết, không còn gì so được nữa. Thử một phép so xem sao, giữa hai bài viết dài ba trang, bài nào lớn hơn? Câu hỏi đó không có nghĩa. Mà không có nghĩa thì không xếp được hàng, và không có hàng thì không có cây. Chốt cối 1, PB là cây sắp xếp, nên nó trả lời đúng những câu dài được bằng thứ tự. Bảng lớn hơn trong khoảng, bắt đầu bằng. Ngoài bốn cái đó, nó không có cửa. Giờ tới ba câu còn lại của đêm đó. Câu 1, tìm bài viết có chứa chữ bảo hành. Câu 2, tìm quán ăn gần chỗ tôi đứng. Câu 3, tìm sản phẩm giống với cái tôi vừa xem. Ba câu này nghe rất bình thường, ứng dụng nào cũng có cả ba, nhưng thử xếp hàng cho chúng xem, và bạn sẽ thấy cả ba đều gãy ở đúng một chỗ. Chứa chữ bảo hành ở giữa bài, PB xếp theo chữ cái đầu, nên nó biết chỗ nào bắt đầu bằng chữ B. Nhưng chữ đó nằm ở giữa. Ở giữa thì không có đầu nào để mà nhảy tới. Quán ăn gần chỗ tôi đứng, gần là hai con số đi với nhau, vĩ độ và kinh độ. Xếp theo vĩ độ thì mất kinh độ, xếp theo kinh độ thì mất vĩ độ. Một cái hàng chỉ có một chiều. Sản phẩm giống với cái tôi vừa xem, giống là gì? Không phải bằng, không phải lớn hơn. Không tồn tại phép so nào cho hai cái áo. Câu hỏi này, thậm chí không có một đáp án đúng. Ba câu, ba lý do khác nhau, cùng một kết cục. Không so được lớn nhỏ thì không xếp được hàng. Không có hàng thì không dựng được cây. Và không có cây, máy chỉ còn một cách, đi đọc hết. Chốt cối 2, cái quét tuần tự đó không phải lỗi của máy. Nó là câu trả lời trung thực nhất máy đưa ra được. Bạn giao cho nó một câu hỏi mà cấu trúc trong tay nó không mang hình dạng đó. Vậy ba câu là bó tay à? Không, mỗi câu đều có một cấu trúc sinh ra đúng để trả lời nó. Chỉ là bạn phải gọi tên nó ra, thì máy sẽ không tự chọn. Câu chứa chữ, dùng index đả. Nó không lưu bài viết của nó lưu từ, và mỗi từ cầm theo danh sách bài chứa nó. Bạn hỏi từ, nó trả về danh sách, lật ngược quan hệ là xong. Câu tìm quán gần, dùng cây R. Nó không xếp tọa độ thành hàng, nó bọc từng cụm điểm vào một ô chữ nhật, rồi bọc các ô vào ô lớn hơn. Tìm gần thành ra mở đúng vài cái ô. Câu tìm giống ý, dùng index vector. Mỗi sản phẩm thành một điểm trong không gian nghìn chiều, câu hỏi cũng thành một điểm, và giống ý nghĩa là nằm gần. Không so lớn nhỏ nữa, chỉ đo khoảng cách. Và đây là chỗ tôi muốn bạn nhìn kỹ. Trong Postgres, cả ba thứ vừa nói đều nằm sẵn trong máy bạn từ lâu. Sáu loại index dựng sẵn, không phải cài gì thêm. Phần lớn dev chưa gọi tên năm cái. Gọi tên chúng ra chỉ tốn hai chữ. Thêm USING GIN cho tìm chữ, thêm USING GIST cho tọa độ. Câu lệnh dài thêm đúng hai chữ, và cái quét tuần tự biến mất. Chốt cối 3, đừng hỏi cột này có nên đánh index không. Hỏi câu này có hình dạng gì, rồi mới chọn cấu trúc nào đúng hình dạng đó. Thứ tự hai câu hỏi mới là thứ quyết định. Tới đây, có một câu hỏi khó chịu. Nếu chuyện này đơn giản vậy, sao gần như không ai biết? Sáu loại index nằm ngay trong máy, tài liệu công khai, mà phần lớn dev đi hết sự nghiệp chỉ dùng một loại. Nghĩ PB chọn đúng chín trên mười lần. Cột số cột này, cột mã, cột tên. Chín phần mười công việc thật là mấy cột đó. Mặc định này tốt tới mức nó tự xóa mình khỏi tầm mắt bạn. Và đây là cú lật. Mặc định sai thì bạn phát hiện ngay hôm đầu. Mặc định đúng chín trên mười, bạn không bao giờ phát hiện, vì chín lần đầu nó đều đúng. Lần thứ mười, không tiêu tiếng nào. Nên bạn không hề chọn sai. Bạn chưa từng được hỏi. Và một lựa chọn không ai đưa ra cho bạn thì nó không nằm trong đầu bạn. Cho tới cái đêm ba câu lệnh cùng quét một bảng mười hai triệu dòng. Quay lại bốn câu lệnh đêm đó. Câu thứ tư nhanh, vì nó hỏi một câu có thứ tự. Ba câu kia chậm, vì chúng hỏi thứ khác, và trong tay máy chỉ có đúng một loại sổ. Ba dòng mang về. Một, thấy quét tuần tự mà index vẫn còn, thì hỏi câu này có thứ tự không? Hai, cột chữ dài và cột tọa độ mặc định là sai. Ba, đọc danh sách loại index của database bạn. Đây là tập 1 của loạt bài về các loại index. Tập sau tôi đào, vì sao mặc định lại là PB chứ không phải cây nhị phân. Bạn đang dùng loại nào ngoài PB? Kể tôi nghe ở bình luận.
Dưới đây là transcript chuẩn của video (đã loại bỏ đoạn quảng cáo):

---

4 câu lệnh, cùng một bảng, cùng 12 triệu dòng. Cả 4 cột đều đã đánh index từ lâu, vậy mà 3 trong 4 câu vẫn quét sạch cả bảng.

Không câu nào báo lỗi, không cảnh báo nào. Bạn mở kế hoạch chạy lên xem và 3 lần liền nó ghi đúng một chữ: quét tuần tự (`Seq Scan`). Index vẫn nằm đó, nguyên vẹn.

Bạn xóa index đánh lại, bạn chạy phân tích lại bảng. 3 câu đó vẫn quét. Tới đây thì phần lớn chúng ta kết luận: chắc bảng còn nhỏ nên máy thấy quét nhanh hơn.

Không phải. Bảng đó 12 triệu dòng và câu thứ 4 dùng index rất ngọt. Cùng một bảng, cùng một cái index, một câu dùng được, ba câu không. Khác biệt không nằm ở dữ liệu.

Nó nằm ở chỗ không ai nhìn. Cái index bạn tạo ra không sai, nó chỉ không phải loại index trả lời được câu hỏi bạn đang hỏi.

Gõ lệnh tạo index đi, bạn viết tên bảng, tên cột rồi chấm hết. Ở đâu trong câu lệnh đó bạn được chọn loại index? Không có chỗ nào cả. Bạn chưa bao giờ chọn vì máy chưa bao giờ hỏi.

Máy chọn hộ bạn và luôn chọn cùng một thứ: một cấu trúc tên là cây B. Postgres, MySQL, cả 3 đều vậy. Đây là câu lệnh duy nhất trong SQL âm thầm chọn hộ bạn một cấu trúc dữ liệu.

Cây B là một cái cây sắp xếp. Máy xếp mọi giá trị trong cột thành một hàng từ nhỏ tới lớn, rồi chia tầng cho dễ nhảy. Nó nhanh vì nó biết thứ tự. Vừa là sức mạnh, vừa là cái trần.

Nên câu hỏi đúng không phải "Index của tôi có tốt không?". Câu hỏi đúng là "Câu tôi đang hỏi có thứ tự không?". 4 câu lệnh đêm đó tách làm 2 nhóm, đúng theo ranh giới này.

Bắt đầu từ nhóm chạy được. Câu thứ 4 hỏi: "Cho tôi đơn hàng của khách số 42". Máy đi vào cây, so 1 lần rẽ trái, so lần nữa rẽ phải. 4 lần so so là tới nơi.

12 triệu dòng, 4 lần so. Vì mỗi lần so bỏ đi một nửa số dòng còn lại. Đó là toàn bộ phép màu của cây B, và nó chỉ chạy được vì hàng đã xếp sẵn.

Cùng cái hàng đã xếp đó trả lời được 3 câu hỏi nữa, gần như miễn phí: lớn hơn 1 triệu, nằm giữa tháng 3 và tháng 6, và bắt đầu bằng chữ "Nguyễn".

4 câu hỏi khác nhau, 1 cấu trúc. Vì cả 4 thật ra là cùng một câu: "Đi tới chỗ nào trong hàng rồi đọc tiếp từ đó". Máy không hiểu ngày tháng, nó chỉ biết cái nào đứng trước, chỉ vậy thôi.

Và đây là chỗ ranh giới lộ ra: sắp xếp cần một phép so. Với số thì so được, với ngày cũng so được, với chữ thì có bảng chữ cái. Hết. Không còn gì so được nữa.

Thử một phép so xem sao: giữa 2 bài viết dài 3 trang, bài nào lớn hơn? Câu hỏi đó không có nghĩa. Mà không có nghĩa thì không xếp được hàng, và không có hàng thì không có cây.

Chốt khối 1: Cây B là cây sắp xếp, nên nó trả lời đúng những câu giải được bằng thứ tự: bằng, lớn hơn, trong khoảng, bắt đầu bằng. Ngoài 4 cái đó, nó không có cửa.

Giờ tới 3 câu còn lại của đêm đó. Câu 1: Bài viết có chứa chữ "bảo hành". Câu 2: Tìm quán ăn gần chỗ tôi. Câu 3: Tìm sản phẩm giống với cái tôi vừa xem.

3 câu này nghe rất bình thường, ứng dụng nào cũng có cả 3. Nhưng thử xếp hàng cho chúng xem, và bạn sẽ thấy cả 3 đều gãy ở đúng một chỗ.

Chữ "bảo hành" ở giữa bài. Cây B xếp theo chữ cái đầu, nên nó biết chỗ nào bắt đầu bằng chữ B. Nhưng chữ đó nằm ở giữa. Ở giữa thì không có đầu để nhảy tới.

Quán ăn gần chỗ tôi đứng: "gần" là 2 con số đi với nhau, vĩ độ và kinh độ. Xếp theo vĩ độ thì mất kinh độ, xếp theo kinh độ thì mất vĩ độ. Một cái hàng chỉ có một chiều.

Sản phẩm giống với cái tôi vừa xem: "giống" là gì? Không phải bằng, không phải lớn hơn. Không tồn tại phép so nào cho 2 cái áo. Câu hỏi này thậm chí không có một đáp án đúng duy nhất.

3 câu, 3 lý do khác nhau, cùng một kết cục. Không so được lớn nhỏ thì không xếp được hàng. Không có hàng thì không dựng được cây. Và không có cây, máy chỉ còn một cách: đi đọc hết.

Chốt khối 2: Cái quét tuần tự đó không phải lỗi của máy. Nó là câu trả lời trung thực nhất máy đưa ra được. Bạn giao cho nó một câu hỏi mà cấu trúc trong tay nó không mang hình dạng đó.

Vậy 3 câu đó bó tay à? Không. Mỗi câu đều có một cấu trúc sinh ra đúng để trả lời nó, chỉ là bạn phải gọi tên nó ra vì máy sẽ không tự chọn.

Câu chứa chữ: dùng index đảo (inverted index). Nó không lưu bài viết, nó lưu từ. Và mỗi từ cầm theo danh sách bài chứa nó. Bạn hỏi từ, nó trả về danh sách. Lật ngược quan hệ là xong.

Câu tìm quán gần: dùng cây R. Nó không xếp tọa độ thành hàng, nó bọc từng cụm điểm vào một ô chữ nhật, rồi bọc các ô vào ô lớn hơn. Tìm gần thành ra mở đúng vài cái ô.

Câu tìm giống ý: dùng index vector. Mỗi sản phẩm thành một điểm trong không gian nghìn chiều. Câu hỏi cũng thành một điểm. Và "giống ý" nghĩa là nằm gần. Không so lớn nhỏ nữa, chỉ đo khoảng cách.

Và đây là chỗ tôi muốn bạn nhìn kỹ: trong Postgres, cả 3 thứ vừa nói đều nằm sẵn trong máy bạn từ lâu. 6 loại index dựng sẵn, không phải cài gì thêm. Phần lớn dev chưa gõ tên 5 cái.

Gọi tên chúng ra chỉ tốn 2 chữ: thêm `USING GIN` cho tìm chữ, thêm `USING GIST` cho tọa độ. Câu lệnh dài thêm đúng 2 chữ, và cái quét tuần tự biến mất.

Chốt khối 3: Đừng hỏi "Cột này có nên đánh index không?". Hỏi "Câu này có hình dạng gì?", rồi mới chọn cấu trúc mang đúng hình dạng đó. Thứ tự 2 câu hỏi mới là thứ quyết định.

Tới đây có một câu hỏi khó chịu: Nếu chuyện này đơn giản vậy, sao gần như không ai biết? 6 loại index nằm ngay trong máy, tài liệu công khai, mà phần lớn dev đi hết sự nghiệp chỉ dùng 1 loại?

Vì cây B chọn đúng 9/10 lần. Cột số, cột ngày, cột mã, cột tên. 9/10 công việc thật đúng là mấy cột đó. Mặc định này tốt tới mức nó tự xóa mình khỏi tầm mắt bạn.

Và đây là cú lật: mặc định sai thì bạn phát hiện ngay hôm đầu. Mặc định đúng 9/10, bạn không bao giờ phát hiện vì 9 lần đầu nó đều đúng. Lần thứ 10 không kêu tiếng nào.

Nên bạn không hề chọn sai, bạn chưa từng được hỏi. Và một lựa chọn không ai đưa ra cho bạn thì nó không nằm trong đầu bạn. Cho tới cái đêm 3 câu lệnh cùng quét 1 bảng 12 triệu dòng.

Quay lại 4 câu lệnh đêm đó: Câu thứ 4 nhanh vì nó hỏi một câu có thứ tự. 3 câu kia chậm vì chúng hỏi thứ khác, và trong tay máy chỉ có đúng một loại sổ.

Ba dòng mang về:

1. `Seq Scan` mà index vẫn còn thì hỏi "Câu này có thứ tự không?".
2. Cột chữ dài và cột tọa độ thì B-tree là mặc định sai.
3. Đọc danh sách loại index của database bạn đang dùng.

Đây là tập 1 của loạt bài về các loại index. Tập sau tôi đào: Vì sao mặc định lại là cây B chứ không phải cây nhị phân? Bạn đang dùng loại nào ngoài cây B, kể tôi nghe ở bình luận.
Dưới đây là transcript chuẩn của video (đã loại bỏ đoạn quảng cáo):

---

Vòng phỏng vấn thứ hai, người đối diện mở sổ ra, chưa hỏi gì về thuật toán cả. Ông ấy hỏi một câu nghe như chuyện phiếm về một cột trong bảng:

"Cột email của bạn chỉ tra bằng dấu bằng thôi, không bao giờ tra khoảng. Vậy dùng index băm (Hash Index) cho nhanh chứ?"

Câu này nghe như một câu hỏi về tốc độ. Nó không phải. Nó là câu hỏi về thứ bạn đang mua mà không biết mình đang mua.

Ứng viên trả lời ngay và trả lời rất đúng sách: "Index băm tra một phát ra ngay, còn cây B (B-Tree) phải đi xuống từng tầng. Một bên là hằng số, một bên là logarit. Mà cột này chỉ so bằng, không bao giờ hỏi lớn hơn hay nằm giữa. Vậy thì cái phần thứ tự của cây B là thừa. Bỏ nó đi, lấy cái nhanh hơn."

Nghe rất hợp lý, và đó là chỗ người phỏng vấn dừng lại. Người phỏng vấn gật đầu, không nói đúng cũng không nói sai gì. Ông ghi một dòng vào sổ, rồi hỏi tiếp một câu nghe rất bình thường:

"Được, vậy màn hình danh sách của bạn, cái sắp theo ngày tạo mới nhất rồi lấy 20 dòng đầu (`ORDER BY ngay_tao DESC LIMIT 20`), nó chạy thế nào trên index băm?"

Nó không chạy. Index băm không giữ thứ tự nào cả, vì hàm băm cố tình đánh tan thứ tự đi, và đó chính là việc của nó. Hai giá trị kề nhau ra hai chỗ cách xa nhau.

Và đây là chỗ đáng nhớ: Một index cây B bán cho bạn hai món chứ không phải một:

* Món thứ nhất là: Dòng nằm ở đâu?
* Món thứ hai là: Các dòng xếp theo thứ tự nào?

Món thứ hai đắt hơn bạn tưởng. Bảng 10 triệu dòng, có thứ tự thì máy đọc đúng 20 dòng rồi dừng. Không có thứ tự, phải đọc hết 10 triệu, sắp lại, rồi vứt đi 9.999.000 dòng.

"Được, vậy bỏ hẳn cái màn hình đó đi. Câu tra bằng email mà lấy về cả tên và cả ngày tạo (`SELECT ten, ngay_tao WHERE email = ?`), hai bên chạy khác nhau chỗ nào?"

Cây B chứa được cả cột phụ đi kèm. Nên nó tra xong là có đủ, trả lời thẳng, không phải quay lại bảng một lần nào. Người ta gọi đó là index phủ (Covering Index). Index băm thì không, nó chỉ giữ mã băm và một con trỏ. Muốn lấy tên với ngày tạo, nó luôn phải cầm con trỏ đó quay về bảng cho từng dòng một.

Đây là một đánh đổi đủ hai vế: Băm tiết kiệm được vài phần trăm ở bước tra, rồi trả lại toàn bộ bằng một lần đọc bảng thêm cho mọi dòng, mọi lần chạy.

Nhìn lại hai câu vừa rồi, cả hai đều không hỏi cái nào nhanh hơn. Cả hai đều hỏi cùng một thứ: Bạn có biết mình vừa bỏ đi cái gì không?

Thứ họ đo không phải bạn thuộc hai cấu trúc. Họ đo xem bạn có nhìn một index như một món hàng nhiều phần hay không. Bạn đã bỏ hai phần và bạn không hề biết chúng tồn tại.

Người phỏng vấn ghi dòng cuối vào sổ rồi gấp lại. Ông không nói bạn sai. Lần nào ông cũng chỉ hỏi hai câu mà đáp án đầu tiên không đỡ nổi.

Nếu gặp lại câu này, đừng trả lời nhanh hay chậm. Trả lời bằng cái bạn phải bỏ đi, nói ra thứ tự trước rồi mới nói tới tốc độ sau.

Băm chỉ thắng khi truy vấn:

* KHÔNG cần thứ tự
* KHÔNG cần khoảng
* KHÔNG cần index phủ

Ba chữ KHÔNG đó hiếm hơn bạn nghĩ, và cây B thua chưa tới 1%.

Đây là tập 3 của loạt bài về các loại index. Tập sau tôi mổ loại mà ai cũng bảo đừng đánh, nhưng kho dữ liệu thì đánh chính nó. Bạn đoán ra chưa? Viết xuống bình luận, tập sau tôi mổ nó.

Cột trạng thái đơn hàng có đúng 4 giá trị, bảng 80.000.000 dòng. Bạn đánh index lên nó, chạy lại câu lệnh và máy vẫn quét sạch cả bảng như chưa có gì.

Bạn tra tài liệu và tài liệu trả lời rất rõ: Cột ít giá trị thì đừng đánh index vì nó không lọc được bao nhiêu. Đúng, bộ tối ưu cũng nghĩ y hệt nên nó bỏ qua.

Nhưng cùng công ty đó, tầng dưới, đội kho dữ liệu đánh index chính trên mấy cột 4 giá trị ấy. Báo cáo của họ chạy nhanh hơn gấp cả trăm lần.

Hai đội, cùng một cột, hai kết luận ngược hẳn nhau và không đội nào sai cả. Thứ khác nhau giữa họ không phải cái cột mà là cái cấu trúc nằm dưới chữ index.

Vì có một loại index sinh ra đúng cho cột ít giá trị. Nó không đi cây gì cả, nó chỉ đếm bằng bit.

---

Trước hết phải hiểu vì sao bộ tối ưu bỏ qua đã. Cây B trên cột 4 giá trị vẫn chạy được, nó tra ra rất nhanh. Vấn đề nằm ở thứ nó trả về.

Bạn hỏi đơn nào đang hủy, và cây B trả lời: 20.000.000 dòng, không phải 20 dòng. 1/4 cả bảng, và mỗi dòng là một con trỏ tới một chỗ khác nhau trên đĩa.

Cầm 20 triệu con trỏ rồi nhảy lung tung khắp bảng đắt hơn hẳn việc đọc thẳng một lượt từ đầu tới cuối. Nên bộ tối ưu chọn quét, nó tính đúng.

Vậy câu hỏi thật không phải "Cột này có đáng đánh index không?". Câu hỏi thật là: "Có cách lưu nào khác không để 1/4 cả bảng vẫn trả lời được nhanh?".

Có, và ý tưởng của nó đơn giản tới mức hơi bất ngờ. Thay vì lưu danh sách con trỏ, ta lưu một dãy bit thôi. Mỗi giá trị của cột thành một dãy bit. Dãy đó dài đúng bằng số dòng của bảng. Bit thứ i trả lời một câu duy nhất: "Dòng thứ i có mang giá trị này không?". Có thì 1, không thì 0.

Bảng 8 dòng, cột có 4 trạng thái thì thành 4 dãy 8 bit. Nhìn vào dãy hủy là biết ngay dòng nào hủy, không cần đọc bảng, không cần con trỏ nào.

Phóng lên cỡ thật: 80 triệu dòng x 4 giá trị ra 320 triệu bit. Nghe to nhưng quy ra chỉ khoảng 40 MB. Và 40 MB đó còn nén được rất mạnh. Cột ít giá trị thì các bit giống nhau nằm thành từng cụm dài nên chỉ cần ghi cụm này dài bao nhiêu. 40 MB tụt xuống vài trăm KB.

Chốt khối 1: Càng ít giá trị thì dãy bit càng lặp, càng lặp thì càng nén tốt. Chính cái làm cây B vô dụng lại là chính cái làm Bitmap nhỏ đi.

Nhưng nhỏ chưa phải là nhanh. Chỗ Bitmap thắng nằm ở câu hỏi thật, mà câu hỏi thật thì gần như không bao giờ chỉ có một điều kiện.

Báo cáo thật nghe thế này: "Đơn đang hủy, đặt từ ứng dụng, ở miền Bắc". Ba điều kiện trên ba cột, và cột nào cũng chỉ vài giá trị.

Với cây B, đó là ba lần đi cây riêng, ra ba tập con trỏ khổng lồ, rồi máy phải gộp ba tập đó lại với nhau. Bước gộp mới là bước đắt.

Với Bitmap thì khác hẳn: ba dãy bit chồng lên nhau, lấy phép AND từng bit một. Bit nào cả ba cùng bằng 1 thì dòng đó lọt, chấm hết.

Và phép AND trên bit là thứ rẻ nhất mà một con chip biết làm. Nó xử 64 bit trong một nhịp. Nên 80 triệu dòng gói lại thành khoảng 1,25 triệu nhịp máy.

Chốt khối 2: Cây B lọc từng cột rồi mới gộp. Còn Bitmap gộp luôn trong lúc lọc. Càng nhiều điều kiện, khoảng cách càng giãn ra.

Tới đây nghe như Bitmap thắng mọi mặt? Nó không. Và cái giá của nó nằm đúng ở chỗ vừa làm nó nhỏ: là phép nén.

Một khách bấm hủy đơn, đúng một dòng đổi trạng thái. Với cây B, máy sửa một lá là xong. Với Bitmap, chuyện dài hơn nhiều. Vì bit của dòng đó không nằm riêng, nó nằm trong một cụm đã nén chung với hàng nghìn dòng hàng xóm. Muốn sửa nó phải giải nén cả cụm, sửa, rồi nén lại từ đầu.

Mà trong lúc làm chuyện đó thì cả cụm bị khóa. Nghĩa là một người sửa một đơn, vô tình chặn luôn hàng nghìn đơn khác nằm cạnh nó trong dãy bit.

Nên thứ quyết định Bitmap dùng được hay không không phải kiểu dữ liệu, cũng không phải số giá trị của cột. Là số người ghi cùng lúc vào cái bảng đó.

Chốt khối 3: Kho dữ liệu nạp 1 lần mỗi đêm rồi chỉ đọc, nên với họ Bitmap là món quà. Bảng đơn hàng có nghìn người ghi mỗi giây thì nó là cái bẫy.

Giờ tới chỗ khó chịu nhất: Bạn vừa nghe xong 3 khối về Bitmap và rất có thể bạn đang định về mở Postgres lên gõ thử, ĐỪNG!

Postgres không có Bitmap Index, không hề có, câu lệnh tạo nó không tồn tại và chưa bao giờ tồn tại.

Thứ Postgres có tên là Bitmap Index Scan, và nó là một thứ khác hẳn. Nó không lưu dãy bit nào lên đĩa cả. Nó dựng một dãy bit tạm trong bộ nhớ ngay lúc chạy câu lệnh, dùng xong thì vứt.

Hai cái tên chỉ khác nhau một chữ, mà một cái là cách LƯU, còn một cái là cách CHẠY. Nửa số câu trả lời bạn đọc trên mạng nhầm đúng chỗ này, và cái nhầm đó không bao giờ tự lộ ra.

Quay lại hai đội ở đầu video. Đội ứng dụng đúng vì bảng của họ có người ghi liên tục. Đội kho dữ liệu cũng đúng vì bảng của họ chỉ đọc. Cùng một cột, hai câu trả lời.

Ba dòng mang về:

1. Cột ít giá trị không dở, chỉ cần cấu trúc khác.
2. Hỏi bảng này AI GHI trước khi hỏi cột mấy giá trị.
3. Tra tên CHÍNH XÁC thứ database bạn có.

Đây là tập 4 của loạt bài về các loại index. Tập sau tôi mổ loại index chỉ nặng 20 KB thay cho 8 GB, rồi một sáng chậm 400 lần mà không ai đụng gì. Hẹn gặp lại!

8 giờ 5 phút sáng thứ Ba, giám đốc mở trang báo cáo doanh thu. Vòng quay chạy, chạy mãi. 30 giây sau, trang trả về lỗi hết giờ chờ.

Hôm qua, chính trang đó ra kết quả trong 0,9 giây. Không ai triển khai gì, không ai sửa một dòng cấu hình nào. Cùng câu lệnh, cùng bảng, hôm nay 6 phút. Chậm hơn 400 lần.

Không có ai đổi gì cả. Index vẫn nằm nguyên đó, đúng cái tên đó. Và nó chỉ nặng 700 KB thay cho 8 GB của một index thường. Nhỏ hơn 11.000 lần, nhanh hơn mọi thứ. Và trong đúng một đêm, nó thành vô dụng mà không có một dòng lỗi nào.

Trước khi đoán, ta đi thu bằng chứng. 4 mẩu ghim lên bảng đánh số. Chưa suy luận gì cả, ai suy luận trước khi thu đủ thì chỉ đi tìm thứ mình đã tin sẵn.

Mẩu thứ nhất: Chạy `EXPLAIN ANALYZE` trên đúng câu lệnh đó. Kế hoạch không đổi một chữ, máy vẫn đi qua index BRIN đúng như hôm qua. Nên ai xem cũng kết luận: index vẫn đang được dùng.

Mẩu thứ hai: 7 ngày vừa qua, bảng nhận thêm 3,1 triệu dòng mới, nhưng nó nhận tới 41 triệu lượt sửa. Còn cỡ bảng thì chỉ to thêm 1,5%.

Mẩu thứ ba: Nó chậm đều mọi lúc. 3 giờ sáng không còn ai dùng hệ thống, chạy lại vẫn đúng 6 phút. Không một phiên nào đang chờ khóa, không ai tranh gì với nó.

Mẩu thứ tư, và mẩu này quan trọng nhất: Nhật ký bảo trì đêm mùng 4. Đội trực chạy một lệnh dọn bảng. Sáng mùng 5, báo cáo nhanh lại đúng 0,9 giây. 3 ngày sau, chậm y hệt, 6 phút trở lại.

4 mẩu trên một tấm bảng, 4 nghi phạm, sẽ lần lượt đi qua, tôi nói trước một câu: Mọi thứ cần để giải vụ này đều đã nằm trên bảng ngay lúc này.

Nghi phạm thứ nhất, và gần như ai cũng chỉ vào nó trước: Phình bảng. Dữ liệu tăng, bảng phình ra. Mẩu số 2 chống lưng rất mạnh cho nó: 41 triệu lượt sửa trong 7 ngày.

Cơ chế nghe cực kỳ hợp lý: Postgres không sửa dòng tại chỗ. Mỗi lần sửa, nó bỏ bản cũ lại đó rồi ghi một bản mới. 41 triệu lượt sửa là 41 triệu bản bỏ lại.

Bản cũ nằm lại thì bảng to ra, bảng to ra thì đọc lâu hơn. Nếu đây là thủ phạm, cỡ bảng hôm nay phải nhảy vọt so với tuần trước. Đó là thứ đo được trong 3 giây.

Đo đi: Tuần trước bảng 33,6 GB, hôm nay 34,1 GB. Cộng thêm 1,5%, đúng 1,5%. Tỷ lệ bản bỏ lại chỉ còn 2,4% vì máy tự dọn mỗi đêm. Một cái bảng to thêm 1,5% không làm gì chậm đi 400 lần. Gạch tên nghi phạm A. Nhưng giữ lại con số 41 triệu, nó sẽ quay lại ở cuối phim mang một nghĩa khác hẳn.

Nghi phạm thứ hai, kinh điển hơn nhiều: Thống kê cũ. Thống kê của bảng đã cũ nên bộ tối ưu tính sai, rồi chọn cho bạn một kế hoạch tệ. Ai làm database lâu cũng đã ăn cú này.

Cơ chế cũng rất thật: Bộ tối ưu không đọc dữ liệu, nó đọc một bản tóm tắc. Bản tóm tắt lệch thì nó ước sai số dòng, rồi bỏ index để đi quét sạch cả bảng.

Và nó khớp đúng cái mốc một đêm: thống kê được cập nhật ban đêm. Nếu đây là thủ phạm, kế hoạch hôm nay phải khác kế hoạch hôm qua, chỉ cần so 2 bảng.

So diff 2 bản: Kế hoạch giống nhau từng dòng. Vẫn đi qua đúng cái index BRIN đó, vẫn cùng một kiểu quét, vẫn cùng một thứ tự, không có chữ nào đổi. Vẫn chưa chịu, ta chạy `ANALYZE` cho bảng rồi chạy lại câu lệnh: 6 phút, y nguyên. Mà bản thống kê thì đã được cập nhật từ 2h15 sáng nay.

Gạch tên nghi phạm B. Kế hoạch không đổi thì đây không phải chuyện của bộ tối ưu. Nó vẫn đang chọn đúng thứ nó chọn hôm qua.

Nghi phạm thứ ba: Khóa chờ. Có ai đó đang giữ khóa trên bảng, và câu lệnh của ta thì chỉ đứng xếp hàng, không hề chạy.

Đây là nghi phạm dễ tin nhất trong 3 cái đầu, vì nó giải thích được đúng cái cảm giác: Câu lệnh không chậm, nó đứng chờ. 6 phút đó có thể là 6 phút xếp hàng.

Và nghi phạm này có một dấu hiệu rất riêng: Nếu là khóa chờ thì lúc vắng người nó phải nhanh trở lại. Mẩu số 3 đã đo đúng vào chỗ đó.

3 giờ sáng, trong bảng phiên đang chạy có đúng 1 dòng là câu lệnh của ta. Cột lý do chờ rỗng, không có ai để tranh và nó vẫn 6 phút.

Và đây là phép đo chốt: `EXPLAIN ANALYZE` tách 6 phút đó ra từng bước. Toàn bộ nằm trong bước đọc bảng, không 1 giây nào nằm ở chỗ chờ. Gạch tên nghi phạm C, nó không chờ ai cả. Nó đang thật sự làm việc liên tục suốt 6 phút.

Nghi phạm thứ tư, và đây là cái mà gần như mọi đội đều tin, vì mẩu số 4 nói thẳng vào tai họ: Một lệnh dọn bảng đêm đó đã chữa được, vậy thì thứ hỏng phải là cái index. Index phình, index rác, index lệch, dựng lại nó là xong.

Cơ chế này đúng thật với nhiều loại index khác, và cách kiểm thì rẻ tới mức không có cớ gì để không làm: đúng một lệnh `REINDEX`.

Chạy 3,2 giây, xong. Cỡ index sau khi dựng lại: 0,72 MB. Trước khi dựng lại: cũng 0,72 MB. Không phình 1 byte nào.

Chạy lại câu lệnh: 6 phút. Index không hỏng và dựng lại nó không chữa được gì. Nhưng đêm mùng 4 thì có thứ gì đó đã chữa được thật.

Gạch tên nghi phạm D, 4 cái tên gạch hết. Và đây đúng là chỗ phần lớn các đội dừng lại, rồi đi xin thêm máy chủ.

Quay lại tấm bảng, 4 mẩu vẫn nằm đó và không có mẩu nào mới. Nghĩa là ta không thiếu bằng chứng, ta đã đọc sai một mẩu.

Mẩu số 4: Nhật ký ghi là một lệnh dọn bảng và cả đội đọc nó thành "dựng lại index". Giờ đọc chính xác cái lệnh đó: Nó là `CLUSTER`.

`CLUSTER` không chạm vào index, nó ghi lại toàn bộ bảng theo thứ tự. Nên thứ đã chữa được 3 ngày không phải cái index, là cái bảng.

Và đó là chỗ mọi thứ mở ra: Vì BRIN không lưu từng dòng. Nó cắt bảng thành từng dải, mỗi dải 128 trang, rồi mỗi dải nó ghi đúng 2 con số: nhỏ nhất và lớn nhất. Hết, không con trỏ nào. Đó là lý do nó chỉ nặng 700 KB. Nó không lưu dữ liệu, nó lưu một bản mô tả.

Và cách nó nhanh nằm ở phép loại trừ. Bạn hỏi 7 ngày gần nhất, nó bỏ qua mọi dải mà 2 con số kia không chạm tới. Bình thường, nó bỏ được 99,5% số dải.

Nhưng phép đó đứng trên một điều kiện ngầm: Thứ tự nằm trên đĩa phải trùng thứ tự thời gian. Không ai viết điều kiện đó ra và không ai đi kiểm nó.

41 triệu lượt sửa! Postgres không sửa tại chỗ, mỗi lượt là một dòng mới và nó ghi vào cuối bảng. Nên ngày của 4 năm trước đáp xuống ngay cạnh ngày hôm nay.

Mỗi dải ở đuôi bảng giờ phủ trọn 4 năm, không dải nào bị loại nữa. Đọc lại mẩu số 1: Số khối phải đọc bằng đúng số trang của cả bảng. 0 dải bị loại.

Hệ số tương quan giữa cột ngày và thứ tự trên đĩa tụt từ 0,99 xuống 0,07. Đó là con số duy nhất kể được vụ này và nó không có mặt trong kế hoạch.

Đây là chỗ khó chịu nhất: Loại index này không bao giờ báo lỗi khi nó thành vô dụng. Nó không sai, nó không trả thiếu một dòng nào. Nó chỉ thôi loại bớt và im lặng.

Bản vá 3 đường, không đường nào miễn phí:

1. Chặn ở nguồn: Cái job đêm đó đừng sửa hàng loạt dòng cũ nữa, đổi sang một bảng phụ.
2. Sắp lại định kỳ: Chạy `CLUSTER` cho bảng về đúng thứ tự. Chính là thứ đội trực đã tình cờ làm đêm mùng 4 mà không biết mình làm gì.
3. Chia bảng theo tháng: Mỗi phần tự giữ thứ tự của nó và job đêm chỉ làm bẩn đúng phần của tháng nó chạm tới.

Giá phải trả: `CLUSTER` khóa bảng, 34 GB mất khoảng 11 phút không ai đọc được. Đổi thẳng sang index cây B thì miễn nhiễm, nhưng 700 KB thành 8 GB.

Cách bắt lần sau trong 30 giây: Một câu truy vấn đọc hệ số tương quan của đúng cột đó (`SELECT attname, correlation FROM pg_stats ...`). Dưới 0,9 là báo động. Bảng nào có BRIN thì dựng luôn cảnh báo trên con số này.

Ba dòng mang về:

1. Index nhỏ luôn kèm một điều kiện ngầm.
2. Điều kiện đó vỡ thì không có lỗi nào.
3. Đo TƯƠNG QUAN, đừng đo cỡ index.

Đây là tập 5 của loạt bài về các loại index. Tập sau tôi mổ một loại index tìm được một từ trong 4 triệu bài viết chỉ mất 8 ms, mà lại không tìm nổi từ nằm giữa một từ khác. Hẹn gặp lại!
Bảng 4 triệu bài viết, khách gõ vào ô tìm kiếm hai chữ "bảo hành". Máy trả về 12.400 kết quả trong 8 mili giây. Đúng như bạn đã đặt hàng.

Vì tuần trước bạn đã đánh index toàn văn cho cột nội dung. Trước đó, chính câu lệnh này quét sạch 4 triệu dòng, mất 26 giây. Giờ nó 8 mili giây, 3.000 lần nhanh hơn.

Rồi một khách khác gõ nhanh, thiếu đúng một chữ cái ở cuối: "bảo hàn". Máy trả về 0 có kết quả nào. Đúng một chữ cái. Không phải ít kết quả, là không. Trong khi cái cách chậm 26 giây kia thì tìm ra đủ 12.400 bài.

Bạn không làm gì sai, bạn chỉ vừa chuyển sang một cấu trúc không trả lời được câu hỏi đó. Không bao giờ trả lời được.

---

Trước hết phải thấy rõ nó đang lưu cái gì. Vì nó không lưu bài viết của bạn, nó cũng không lưu chuỗi chữ của bạn, không một chữ nào.

Cây B lưu giá trị của cột, xếp theo thứ tự một dòng một mục. Index đảo thì làm đúng cái tên của nó: nó đảo ngược quan hệ lại. Thay vì hỏi bài này chứa những từ nào, nó lưu ngược lại: Từ này nằm trong những bài nào. Mỗi từ một mục, mỗi mục mang một danh sách số hiệu bài. Hết, chỉ có vậy.

Nghe đơn giản, và chính chỗ đơn giản đó quyết định cả 3 khối tiếp theo. Đơn vị nhỏ nhất mà nó biết là một từ.

Khối 1: Vì sao nó nhanh tới mức đó? 4 triệu bài viết cộng lại khoảng 12 GB chữ, và nó chạm vào đúng 0 byte nào. Nghe vô lý mà đúng. Lúc bạn tạo index, máy đọc từng bài đúng một lần, cắt ra thành từng từ, rồi bỏ trùng. 4 triệu bài đó rút lại còn khoảng 600.000 từ khác nhau.

600.000, không phải 4 triệu, vì người ta viết rất nhiều bài bằng rất ít từ. Danh sách đó lại xếp theo thứ tự, nên tra một từ trong đó là chuyện nhỏ.

Tra ra rồi, nó không mở bài nào cả. Cái mục đó đã mang sẵn danh sách số hiệu của 12.400 bài chứa từ ấy. Nó đọc đúng một dòng. Còn tìm hai từ cùng lúc thì lấy hai danh sách, giao nhau. Hai phép đó gọn tới mức 8 mili giây là dư sức.

Chốt khối 1: Nó nhanh không phải vì đọc nhanh hơn. Nó nhanh vì nó không đọc bài viết nào. Nó chỉ tra một cái mục lục dựng sẵn từ trước.

Khối 2: Đây là chỗ trả lời cho người khách ở đầu video. Cái mục lục đó có 600.000 mục, và mỗi mục là một từ hoàn chỉnh. "Bảo hành" là một mục, "hành" cũng là một mục. Còn "bảo hàn" thì không phải một từ, nên trong mục lục không có nó, không có mục nào cả.

Không có mục thì không có gì để tra. Máy cũng không quay lại quét 4 triệu bài để kiểm cho chắc. Nó tra mục lục rồi trả về rỗng.

Đây là chỗ khó chịu nhất, vì nó không giống một lỗi. Không thông báo, không cảnh báo, chỉ là không có kết quả nào. Mà mọi câu hỏi nhỏ hơn một từ đều rơi vào đúng cái lỗ này: một nửa mã sản phẩm, 4 số đầu của số điện thoại, một tiền tố người ta gõ dở.

Chốt khối 2: Index đảo trả lời được câu hỏi "Bài nào chứa từ này?". Nó chưa bao giờ trả lời câu hỏi "Bài nào chứa chuỗi này?". Hai câu hỏi khác nhau.

Khối 3, và khối này mới là chỗ đắt: Nếu đơn vị của nó là một từ, thì phải có ai đó quyết định thế nào là một từ, ai đó phải chọn. Người quyết định là một bộ tách từ cộng một quyển từ điển. Cả hai được chọn ngay lúc bạn gõ câu lệnh tạo index, rồi đông cứng lại trong đó.

Bộ tách từ mặc định cắt theo khoảng trắng và dấu câu. Với tiếng Anh thì tạm ổn. Với tiếng Việt thì nó cắt "Hà Nội" thành hai từ rời hẳn: "Hà" một mục, "Nội" một mục. Và cái index không hề biết hai từ đó đi với nhau, không biết một chút nào.

Nên tìm "Hà Nội" thật ra là tìm bài nào có chữ "Hà" và có chữ "Nội". Một bài viết về "Hà Tĩnh" và "nội thất" khớp hoàn hảo, không lỗi nào cả.

Còn quyển từ điển thì làm việc thứ hai: Nó bỏ bớt những từ nó cho là vô nghĩa, và nó cắt gốc từ. Từ nào bị bỏ lúc dựng index thì vĩnh viễn không tìm lại được.

Chốt khối 3: Đổi bộ tách từ hay đổi quyển từ điển là phải dựng lại toàn bộ index, 2,4 GB, và mọi kết quả tìm kiếm đổi theo.

---

Giờ tới chỗ khó chịu nhất, bạn tự nhìn thấy được thứ nó thật sự lưu chỉ bằng một câu lệnh, không cần tin lời tôi. Đưa cho nó một câu "bảo hành 12 tháng", nó không trả về câu đó, nó trả về một danh sách gốc từ kèm số thứ tự, và câu của bạn đã biến mất.

Nghĩa là thứ bạn đang tra không phải dữ liệu của bạn, là một bản ghi lại quyết định về dữ liệu của bạn, chốt vào đúng cái ngày bạn tạo index.

Hai hệ thống, cùng 4 triệu bài viết y hệt nhau, hai quyển từ điển khác nhau, chúng trả về hai kết quả khác nhau cho cùng một câu tìm, và cả hai đều đúng.

Quay lại người khách gõ thiếu một chữ ở đầu video: Không ai sai cả. Câu hỏi của họ nhỏ hơn cái đơn vị mà index biết đếm: nhỏ hơn một từ.

Ba dòng mang về:

1. Index đảo trả lời "chứa TỪ này", không phải "chứa CHUỖI này".
2. Ranh giới một từ là quyết định đông cứng lúc tạo index.
3. Chạy thử `to_tsvector` trên chính dữ liệu của bạn trước khi tin nó.

Đây là tập 6 của loạt bài về các loại index. Tập sau là tập cuối, tôi mổ một loại index cố tình trả lời sai. Hẹn gặp lại!
Dưới đây là transcript chuẩn của video (đã loại bỏ đoạn quảng cáo):

---

23 giờ 47 phút đêm, bạn vừa deploy xong tính năng đặt hàng, mở console lên kiểm tra lần cuối cho yên tâm. Và rồi bạn khựng lại khi thấy nó: 2 dòng log giống hệt nhau. 2 request POST bay thẳng tới server mặc dù bạn chỉ mới bấm chuột đúng một lần duy nhất.

Bạn hớt hải soi lại code, rõ ràng không có vòng lặp nào cả. Code cũng không hề gọi 2 lần. Bạn thử xóa cache rồi restart server nhưng kết quả vẫn là 2 dòng log đó.

Phải mất đến 3 tiếng sau bạn mới tìm ra thủ phạm. Thật bất ngờ là nó không nằm trong component mà lại nằm lù lù ở file `main.jsx`. Thủ phạm chính là StrictMode.

Đó là 4 dòng code bọc quanh App mà Create React App hay Vite đều tự động thêm sẵn cho bạn. Thực chất, nó không render ra gì cả và cũng không làm thay đổi giao diện. Thế nhưng, khi ở chế độ development, nó lại âm thầm làm một việc rất kỳ lạ, và chính cái việc kỳ lạ đó đã cướp đi của bạn 3 tiếng đồng hồ.

Cụ thể là nó cố tình mount component của bạn lên đến 2 lần. Đầu tiên nó gọi effect, sau đó chạy cleanup, rồi lại lập tức gọi effect thêm một lần nữa. 3 nhịp này diễn ra liên tiếp trong cùng một khoảnh khắc.

Và điểm quan trọng nhất ở đây là chuyện này chỉ xảy ra ở môi trường dev. Còn khi build ra production thì nó vẫn chạy chuẩn xác một lần.

---

Bây giờ chúng ta hãy tua chậm lại và nhìn kỹ từng nhịp một nhé.

Đầu tiên, React mount component lên cây DOM. Effect chạy lần đầu tiên để thực hiện các việc như subscribe, fetch data, hoặc set timer. Theo lẽ bình thường thì tới đây là xong chuyện. Nhưng trong StrictMode, React chưa chịu dừng lại ở đó mà tiếp tục làm luôn nhịp thứ hai.

Nó lập tức gọi hàm cleanup, chính là cái hàm mà bạn đã return ra trong `useEffect`. Nó tiến hành unsubscribe hoặc clear timer, làm y hệt như thể component vừa mới bị gỡ khỏi màn hình vậy. Tuy nhiên, thực tế là component chưa hề bị gỡ và cũng không có gì biến mất cả.

Đến nhịp thứ ba, React lại gọi effect lần thứ hai trên cùng một component, cùng một instance, với state vẫn còn giữ nguyên. Lúc này, nếu effect của bạn tạo ra một thứ gì đó như một kết nối, một listener hay một request, thì bây giờ bạn đã có đến 2 cái. Điều này chỉ không xảy ra trừ khi hàm cleanup của bạn đã dọn thật sạch cái đầu tiên.

Đó chính là toàn bộ cơ chế, hoàn toàn không có phép thuật nào ở đây cả. Setup, cleanup, rồi lại setup. 3 lời gọi này tạo thành một chu kỳ chỉ tồn tại trong môi trường development. Bạn hãy ghi nhớ kỹ 3 nhịp này nhé, vì toàn bộ phần sau của video sẽ dựa vào nó đấy.

Đến đây, câu hỏi thật sự không phải là StrictMode làm gì, mà là tại sao đội ngũ React lại cố tình phá code của bạn ở môi trường dev như vậy?

Câu trả lời thực ra nằm ở một tính năng chưa chính thức ra mắt vào thời điểm React 18 được phát hành. Mục tiêu của React là tiến tới khả năng giữ lại state ngay cả khi component bị gỡ đi rồi gắn lại.

Giả sử khi bạn chuyển sang tab khác, cây component sẽ bị tháo ra. Nhưng khi bạn quay lại, nó sẽ được gắn trở lại cùng với nguyên vẹn state cũ. Tính năng tuyệt vời đó ngày nay được gọi là Activity.

Điều này có nghĩa là effect của bạn sẽ bị chạy lại rất nhiều lần trên cùng một component. Đây không phải là chuyện giả định mà là chuyện chắc chắn sẽ xảy ra. Và nếu hàm cleanup của bạn viết sai, bộ nhớ sẽ bị rò rỉ ngay lập tức.

Vậy nên, StrictMode vốn không hề phá code của bạn. Thực chất, nó đang giúp bạn diễn tập trước cho tương lai đó ngay trên máy tính của bạn và hoàn toàn miễn phí. Effect nào sống sót qua đợt diễn tập này thì chắc chắn sẽ chạy ổn định ngoài production. Còn nếu không chịu nổi nhiệt, bạn sẽ phát hiện ra lỗi ngay.

Vậy chúng ta phải sửa lỗi này như thế nào? Cách giải quyết chắc chắn không phải là xóa bỏ StrictMode, mà là bạn phải viết hàm cleanup cho thật tử tế. Nếu gọi fetch thì hãy hủy bằng AbortController. Nếu có subscribe thì nhớ unsubscribe. Còn dùng `setInterval` thì phải `clearInterval`.

Tóm lại, mọi thứ mà effect tạo ra thì cleanup đều phải dọn dẹp thật sạch sẽ.

Thế còn cái effect gọi POST để tạo đơn hàng ở đầu video thì sao? Thực ra, ngay từ đầu nó đã không nên nằm trong effect rồi. Đó là một hành động chủ động của người dùng, cho nên nó thuộc về event handler. Một nơi mà React không bao giờ tự ý gọi đến lần thứ hai. Và đây cũng chính là cái bẫy lớn nhất mà nhiều người mắc phải.

Chúng ta có một quy tắc ngắn gọn thế này: Effect được sinh ra là để đồng bộ với các hệ thống bên ngoài, chứ không phải để thực hiện một việc gì đó chỉ một lần duy nhất. Nếu bạn thấy mình phải dùng đến ref để chặn lần chạy thứ hai của code, thì đó là dấu hiệu rõ ràng cho thấy bạn đang đặt code sai chỗ rồi.

Nghe qua thì rất hợp lý đúng không? Nhưng đây lại là lúc mà thực tế vả thẳng vào mặt lý thuyết. Rất nhiều người ngoài kia lại chọn cách sửa khác. Họ dùng một cái `useRef` làm cờ báo trạng thái `didRun` để chặn luôn lần chạy thứ hai. Sau đó console trông có vẻ sạch bong, mang lại cảm giác cực kỳ thỏa mãn, nhưng thật ra đó chính là một cái bẫy.

Bởi vì cái cờ đó chỉ giống như việc bạn dán băng dính che đi cái đèn báo cháy vậy. StrictMode có thể bị tắt tiếng, nhưng bản thân con bug thì vẫn còn nằm nguyên ở đó. Nó chỉ đang chờ tới lúc người dùng thật sự bấm nút back, đổi tab, hoặc khi mạng bị chập chờn để phát tác. Và đến lúc đó thì chẳng có ai mở console lên để nhìn cả.

Quay trở lại với thời điểm 23 giờ 47 phút, 2 dòng log lúc đó thực ra không phải là lỗi. Nó giống như một bản báo cáo miễn phí, cảnh báo cho bạn biết rằng effect của bạn chưa đủ sức chịu đựng được việc bị chạy lại. Thật may là bạn đã nhận được báo cáo đó trước khi người dùng thực sự gặp rắc rối.

Vì vậy, hãy luôn nhớ kỹ 3 nhịp này: Setup, cleanup, rồi lại setup. Hãy viết hàm cleanup như thể component của bạn có thể bị gỡ bỏ bất cứ lúc nào, bởi vì điều đó chắc chắn sẽ xảy ra.

Còn bạn, bạn đã từng mất bao lâu để giải quyết 2 dòng log ám ảnh này? Hãy kể lại câu chuyện của bạn ở dưới phần bình luận cho mình biết nhé.
Khách gõ vào ô tìm kiếm 5 chữ "áo khoác chống nước đi phượt", trang trả về 0 có sản phẩm nào. Mà trong kho có 200 cái đúng ý họ.

Không sản phẩm nào chứa đủ 5 chữ đó. Cái thì ghi jacket chống thấm, cái thì ghi áo gió leo núi, cái thì ghi áo mưa du lịch. Mục lục từ của tập trước không có mục nào khớp 5 chữ, không khớp nổi. Vì người mua không gõ từ khóa, họ gõ một ý. Và không có mục lục từ nào chứa nổi một cái ý, không một mục nào.

Đây đúng là câu hỏi thứ 3 mà tập 1 đã kê ra: chứa từ này, gần chỗ này, giống ý này. Hai câu đầu đã xong rồi, còn đúng một câu. Câu thứ 3 này khác hẳn, vì cấu trúc trả lời nó không hề cố gắng trả lời đúng.

Máy không hiểu ý, nên cách duy nhất để nó so hai ý với nhau là biến mỗi ý thành một chỗ đứng: một tọa độ. Một mô hình đọc câu của bạn rồi trả về một dãy số: 1.536 con số. Đó là một điểm trong không gian 1.536 chiều, một điểm, không phải một chuỗi. Luật duy nhất của cái không gian đó là: ý gần nhau thì điểm gần nhau. Nên tìm sản phẩm giống ý thành tìm điểm gần nhất. Hết, chỉ có một luật đó.

Nghe như xong rồi, chưa xong. Cả video này nằm ở chỗ: gần nhất trong 1.536 chiều là một bài toán khác hẳn.

Khối 1: Giá của câu trả lời đúng tuyệt đối. Nó luôn có sẵn, và nó không hề rẻ. 4 triệu sản phẩm, mỗi cái 1.536 con số, mỗi số 4 byte, nhân lại: 24 GB chỉ để đựng tọa độ. Chưa tính gì cả. Muốn đúng tuyệt đối thì không có đường tắt nào. Phải đo khoảng cách từ câu tìm tới cả 4 triệu điểm. Không được bỏ một điểm nào. Mà mỗi phép đo là 1.536 phép nhân. Nhân với 4 triệu, ra 6,1 tỷ phép nhân cho đúng một lượt tra. Đo thật trên một máy chủ thường: 2,8 giây một câu tìm. 50 người cùng tìm là trang đứng hẳn. Chốt khối 1: Câu trả lời đúng luôn có, và giá của nó đúng bằng đọc hết 24 GB, không hơn không kém.

Khối 2: Vậy thì đánh index đi như 6 tập trước? Đây là chỗ mọi thứ vỡ, và nó vỡ ngay. Trong 2 chiều thì chuyện rất dễ: chia mặt phẳng thành ô, câu tìm rơi vào một ô, và mọi ô nằm xa hơn đó thì bỏ qua hết. Đúng cái phép loại trừ của mọi loại index, rất gọn, rất đúng. Cách đó chỉ đúng khi số chiều còn nhỏ. Lên vài chục chiều là nó bắt đầu yếu, lên 1.536 chiều thì nó hết tác dụng hẳn. Vì trong không gian nhiều chiều, mọi điểm gần như cách nhau như nhau. Điểm gần nhất và điểm xa nhất chỉ chênh nhau vài phần trăm. Chênh vài phần trăm thì không có vùng nào đủ xa để bỏ qua. Phép loại trừ loại được 0 vùng nào. Cây tụt về đúng quét toàn bộ. Chốt khối 2: Không phải chưa ai nghĩ ra cái cây tốt hơn. Là trong nhiều chiều thì không tồn tại cái cây nào. Đó là một định lý, không phải một thiếu sót.

Khối 3: Vậy là còn đúng một đường: Bỏ hẳn chữ "đúng" đi, chỉ còn đường đó. Cấu trúc tên là HNSW, dựng một mạng lưới nhiều tầng. Tầng trên rất ít điểm, mỗi bước nhảy rất xa. Tầng dưới đông điểm, mỗi bước nhảy ngắn. 3 tầng, 4 tầng. Lúc tra, nó vào tầng trên cùng, rồi mỗi bước nhảy sang cái điểm gần câu tìm hơn. Hết tầng thì tụt xuống tầng dưới, cứ thế tới tầng cuối, như đi cầu thang. Cả đường đi đó chỉ chạm khoảng vài nghìn điểm trên 4 triệu. 3 ms, nhanh hơn 900 lần. Cái giá thì nằm ở chỗ này: nó không bảo đảm tìm ra điểm gần nhất thật. Nó chỉ tìm ra một điểm rất gần. Đo được khoảng 95%, không phải 100%. Nghĩa là cứ 20 kết quả đáng ra phải có, nó bỏ sót 1. Chốt khối 3 nằm ở đây: Không ai chỉ được ra nó bỏ sót cái nào.

Giờ tới chỗ khó chịu nhất, và nó không chỉ chốt tập này, nó chốt luôn cả loạt bài 7 tập. Suốt 6 tập trước, tôi kể như thể ta đang đi tìm một cấu trúc vừa nhanh vừa đúng. Tập này bỏ hẳn vế "đúng", nghe như một bước lùi. Nhưng không phải. Đọc lại 6 tập đó đi: Cây B chỉ giải bằng thứ tự, Bitmap khóa cả cụm hàng nghìn dòng, BRIN thôi loại bớt mà không báo, Index đảo mất từ từ điển đã bỏ. Không tập nào trong số đó đòi index phải đúng. Yêu cầu duy nhất từ tập 1 tới giờ chỉ có một câu: Rẻ hơn đọc hết. Cây B tình cờ đúng luôn, nên không ai để ý là vế "đúng" chưa bao giờ được đòi. HNSW chỉ là cái đầu tiên nói thẳng ra điều đó.

Quay lại người khách gõ 5 chữ ở đầu video: Không phải index sai, câu hỏi của họ có một hình dạng khác, không phải một lỗi.

Ba dòng mang về:

1. Biến ý thành tọa độ là cách duy nhất máy so được.
2. Nhiều chiều thì không cây nào loại bớt được.
3. Cấu trúc này đổi độ đúng lấy tốc độ, và bạn phải tự chọn tỷ giá đó.

7 tập, 7 hình dạng câu hỏi, 7 cấu trúc. Câu duy nhất đá mang theo là: Một câu hỏi có hình dạng nào thì cần cấu trúc có hình dạng đó. Hẹn gặp lại ở loạt bài sau!