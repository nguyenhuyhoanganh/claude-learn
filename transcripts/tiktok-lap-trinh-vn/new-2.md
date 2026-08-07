Dưới đây là transcript đầy đủ cho video của bạn, kèm theo câu trả lời mẫu 30 giây chuẩn Senior ở cuối:

---

## Transcript Nội Dung Video

**[00:00 - 00:26] Đặt vấn đề: "Cập nhật xong rồi, Cache xóa lúc nào?"**

Người dùng vừa sửa giá một sản phẩm xong. Trang chi tiết vẫn hiện giá cũ.

Người phỏng vấn xoay màn hình lại, rồi hỏi một câu rất ngắn, giọng bình thường:

> **"Cập nhật xong rồi, Cache xóa lúc nào?"**

Câu hỏi hiện đủ chữ trên bảng, rồi người phỏng vấn ngồi im, không gợi ý thêm chữ nào.

Bạn có 3 giây để trả lời trong đầu: **3... 2... 1...**

Giữ lấy câu bạn vừa nghĩ trong đầu. **Câu đó ĐÚNG, mà VẪN TRƯỢT**, vì thứ tự hai việc đó quyết định tất cả!

---

**[00:26 - 01:18] Tầng 1: Xóa trước hay Xóa sau khi ghi Database?**

Ứng viên trả lời ngay và trả lời ĐÚNG:

> *"Ghi vào Database xong thì xóa Cache đi, để lần đọc sau nó tự nạp lại giá mới từ đầu."*

Người phỏng vấn gật đầu, ghi một dòng vào sổ. Đây là đáp án mà 9/10 người sẽ nói khi bị hỏi câu này.

Nhưng ứng viên vừa nói hai việc mà không nói **việc nào làm trước**, và cũng không nói nếu **lệnh xóa Cache thất bại thì hệ thống ra sao!**

#### Bẫy 1: Xóa Cache TRƯỚC khi ghi Database (Sai lầm phổ biến)

1. Tiến trình A **xóa Cache**.
2. Trong lúc tiến trình A chưa kịp ghi Database, có tiến trình B nhảy vào đọc Cache $\rightarrow$ thấy trống $\rightarrow$ xuống DB đọc giá CŨ $\rightarrow$ **nạp lại giá CŨ đó vào Cache!**
3. Tiến trình A ghi giá MỚI vào DB xong.
4. **Hậu quả:** Cache bị dính giá CŨ suốt cả thời gian TTL (ví dụ 5 phút)!

> **Quy tắc Tầng 1:** **Ghi Database TRƯỚC, Xóa Cache SAU!** Tuyệt đối không làm ngược lại.

---

**[01:18 - 02:08] Tầng 2: Lệnh xóa Cache thất bại & Lưới an toàn TTL**

Người phỏng vấn hỏi tiếp: *"Thế còn lệnh xóa Cache đó bị thất bại thì sao?"*

#### Bẫy 2: Lỗi im lặng (Silent Failure)

* Database cập nhật giá mới (120.000đ) thành công.
* Đúng lúc đó Redis bị rớt mạng / chập chập $\rightarrow$ **Lệnh xóa Cache bị mất!**
* Không ai báo lỗi, giá CŨ (100.000đ) nằm trong Cache **vĩnh viễn** cho tới khi có ai vào sửa giá tiếp!
* Đây là loại lỗi mà **khách hàng phát hiện ra trước bạn**.

> **Giải pháp Tầng 2 (Lưới an toàn TTL):**
> * **TTL (Time-To-Live)** không phải cắm cho vui, nó là lưới an toàn cuối cùng!
> * Cài `TTL = 60s` nghĩa là chấp nhận tối đa 1 phút dữ liệu cũ nếu lệnh xóa Cache bị hỏng.
> 
> 

---

**[02:08 - End] Bản chất thực tế & Bảng điểm phỏng vấn**

Thực ra không có cách nào đúng $100\%$ tuyệt đối vì 2 Request đan vào nhau đúng nhịp vẫn có thể làm Cache lệch.

Thứ họ đo là **bạn dừng ở đâu khi hết chắc chắn**. Người giỏi nói ra chỗ hệ thống vẫn có thể vỡ và nói rõ mình chặn nó bằng cái gì (TTL)!

---

### 📋 Mẫu câu trả lời 30 giây chuẩn Senior (Chụp màn hình ngay):

```text
1. Ghi Database trước, xóa Cache sau (Cache Aside Pattern). Tuyệt đối không xóa trước vì dễ bị race condition nạp lại giá cũ.
2. Xóa trước sẽ để lại giá cũ trong Cache suốt cả thời gian TTL.
3. Lệnh xóa Cache có thể thất bại/mất mạng, nên LUÔN ĐẶT TTL cho Cache làm lưới an toàn.
4. Đặt TTL = 60s (chấp nhận tối đa 1 phút dữ liệu cũ) để đổi lấy việc lệnh xóa hỏng không gây thảm họa vĩnh viễn.

```

*(Trích xuất từ câu trả lời mẫu ở trong video)*
Dưới đây là transcript chính xác nội dung audio/video của bạn:

---

## Transcript Nội Dung Video

### **[00:00 - 00:26] Đặt vấn đề**

* Hai người cùng mở một đơn hàng, rồi cùng bấm lưu.
* Người phỏng vấn vẽ hai mũi tên chỉ vào cùng một dòng, rồi hỏi một câu rất ngắn:

> **"Hai người sửa cùng một dòng, ai thắng?"**

* Câu hỏi hiện đủ chữ trên bảng, rồi người phỏng vấn ngồi im, không cho thêm dữ kiện nào.
* Bạn có 3 giây... **3... 2... 1...**
* Giữ lấy câu bạn vừa nghĩ trong đầu. Câu đó ĐÚNG, mà VẪN TRƯỢT, vì câu hỏi này đang thiếu đúng một dữ kiện!

---

### **[00:26 - 00:48] Tầng 1: Lỗi mất cập nhật (Lost Update) & Người sau thắng**

* Ứng viên trả lời ngay và trả lời ĐÚNG:

> **"Người bấm lưu sau thắng!"**

* Vì lệnh ghi của họ chạy sau nên nó ghi đè lên giá trị của người trước.
* Người phỏng vấn gật đầu, ghi một dòng vào sổ: **[Người sau thắng - ĐÚNG]**.
* Đây là đáp án mà 9/10 người sẽ nói khi bị hỏi câu này.
* Nhưng câu trả lời nói được **ai thắng**, mà không nói **ai thua mất cái gì**, và cũng không hỏi lại **two người đó đang sửa cột nào!**

---

### **[00:48 - 01:18] Tầng 2: Người thua mất cái gì? (Lỗi tính toán dữ liệu)**

* Người phỏng vấn hỏi tiếp:

> **"Người thua thì mất gì?"**

* Nếu chỉ là sửa tên khách, thì mất một cái tên — chuyện nhỏ!
* Nhưng nếu đó là một phép tính (ví dụ: sửa số lượng kho), thì bạn **mất luôn cả phép tính, và tiền thì đi theo nó**:
* Two đơn cùng lúc, cùng đọc số lượng là `10`.
* Cùng trừ đi `1`, rồi cùng ghi lại `9`.
* Bán được 2 cái, mà kho chỉ trừ đúng 1 cái!


* Ngày 1.000 đơn thì kho lệch cả trăm, và tháng sau kiểm kho mới lộ ra!

---

### **[01:18 - 01:48] Tầng 3: Bọc Transaction có giải quyết được không?**

* Người phỏng vấn dồn tiếp:

> **"Thế bọc Transaction vào là xong chứ?"**

* **Không!** Ở mức cách ly mặc định (`Read Committed`), two giao dịch đó vẫn đọc được số `10` như nhau, rồi vẫn cùng ghi lại số `9` như nhau. **Vẫn mất cập nhật!**

---

### **[01:48 - 02:08] Các giải pháp kỹ thuật**

1. **Rẻ nhất (Dùng biểu thức trực tiếp):**
* Không đọc trước, để Database tự trừ:


```sql
UPDATE don_hang SET qty = qty - 1 WHERE id = 1 AND qty > 0;

```


2. **Chắc hơn (Pessimistic Locking / Optimistic Locking):**
* Dùng `SELECT ... FOR UPDATE` để xếp hàng chờ.
* Hoặc thêm một **cột phiên bản (Version Column)** rồi thử lại khi trượt.



---

### **[02:08 - 02:27] Bản chất câu hỏi ngược: Cùng cột hay Khác cột?**

* Hai người sửa cùng một dòng: **Cùng cột hay Khác cột?**
* **Khác cột:** Chỉ cần ghi đúng cột đã đổi. (Nếu ORM ghi lại cả dòng thì nó sẽ xóa luôn cột của người kia).
* **Cùng cột:** Bắt buộc dùng phép tính hoặc cơ chế khóa/phiên bản.

> **Người giỏi hỏi ngược ngay:** *"Two người đó sửa cùng cột hay khác cột?"* rồi mới bắt đầu trả lời!

---

### **[02:27 - End] Câu trả lời mẫu 30 giây**

```text
1. Tôi hỏi lại: Hai người sửa cùng cột hay khác cột?
2. Hai trường hợp, hai đường xử lý khác nhau hẳn:
   - Cùng cột (phép tính): SET qty = qty - 1
   - Khác cột: Chỉ ghi cột đã đổi (tránh ORM ghi đè cả dòng)

```
Dưới đây là transcript đầy đủ, chính xác toàn bộ nội dung audio/video của bạn:

---

## Transcript Nội Dung Video

**[00:00 - 00:23] Mở đầu: Sự cố PostgreSQL từ chối ghi vì Transaction ID Wraparound**

Nửa đêm, không ai deploy, không có traffic đột biến. Một database PostgreSQL đang chạy ngon lành, rồi mọi lệnh ghi bắt đầu phai.

Thêm dòng mới: phai! Sửa dòng cũ: phai! Mấy job vốn chạy trăm lần một ngày cũng đứng hình!

Log hiện đúng một dòng lạ hoắc:
`ERROR: database is not accepting commands to avoid wraparound data loss in database "prod"`

Không phải đầy đĩa, không ai xóa nhầm. PostgreSQL vừa tự khóa cửa ghi của chính nó để tự cứu mình!

---

**[00:23 - 01:10] Bản chất MVCC & Khái niệm Transaction ID (XID)**

Muốn hiểu thì phải nhìn cách PostgreSQL lưu dữ liệu.

Mỗi lần anh em sửa một dòng, nó không hề sửa đè lên chỗ cũ, mà đẻ hẳn một bản mới, còn bản cũ để nguyên tại chỗ. Nhờ vậy, người đang đọc không phải chờ người đang ghi.

Nhưng làm sao nó biết ai được thấy bản nào?

Mỗi giao dịch (Transaction) được phát một con số tăng dần. Mỗi dòng thì nhớ nó sinh ra bởi con số nào. Con số đó gọi là **Transaction ID (XID)**.

Và nó chỉ có **32 bit**, tức khoảng **4,29 tỷ giá trị**, rồi quay vòng về đầu!

---

**[01:10 - 01:54] Sự cố Wraparound & Vai trò của VACUUM (Freeze)**

PostgreSQL so hai con số này theo kiểu **vòng tròn** chứ không phải đường thẳng:

* Đứng ở một điểm bất kỳ: 2 tỷ số phía sau là **Quá quá**, 2 tỷ số phía trước là **Tương lai**.
* Không có "cũ hơn tuyệt đối", chỉ có nửa vòng bên này và nửa vòng bên kia!

Thế nên, nếu một dòng cũ cứ nằm yên không ai dọn, bộ đếm sẽ chạy qua 2 tỷ nhịp. Cái số từng sinh ra nó đột nhiên rơi sang **nửa tương lai**! Dòng đang hiển thị bình thường bỗng biến mất. Dữ liệu vẫn còn nguyên trên đĩa, nhưng không ai nhìn thấy nó nữa. Đó chính là **Wraparound**!

PostgreSQL chống bằng một tiến trình chạy nền tên **VACUUM**. Việc của nó là **đóng băng (Freeze)** những dòng đủ già, đánh dấu chúng là "cũ tuyệt đối". Đã đóng băng thì ai cũng thấy, miễn nhiễm với vòng quay!

---

**[01:54 - 02:45] Ngưỡng cảnh báo & Sự cố thực tế tại Sentry (2015)**

Nhưng nếu VACUUM tụt lại phía sau (dòng mới đến nhanh hơn tốc độ dọn):

* Còn **40 triệu** số nữa là cạn: Nó ghi cảnh báo vào Log (`WARNING: must be vacuumed within...`).
* Dưới **3 triệu**: Nó thôi cảnh báo mà **đóng luôn cửa ghi** (chỉ cho phép `read-only`)!

> *Thà đứng hình còn hơn để mất dữ liệu trong âm thầm!*

Mặc định, `autovacuum_freeze_max_age` bắt đầu đóng băng cưỡng bức khi một bảng già **200 triệu giao dịch**.

### Sự cố của Sentry (20/07/2015):

App write-heavy, bảng khổng lồ, VACUUM đuổi không kịp $\rightarrow$ Database ngừng nhận ghi. Ngay khi phát hiện, họ failover sang phần cứng mạnh hơn để VACUUM dọn cho kịp. Nó dọn xong mọi bảng, trừ một bảng ánh xạ quá lớn. Cuối cùng họ `TRUNCATE` bảng ánh xạ đó. 5 phút sau, hệ thống hồi phục.

**Con số đáng sợ nhất:**
Họ chạy thử lại VACUUM trên chính phần cứng cũ: **Gần 24 tiếng vẫn chưa xong!**

---

**[02:45 - 03:10] Đánh đổi của MVCC & Sự thật về XID 64-bit**

Cái giá của cách lưu này là vậy: Đọc không khóa ghi ngay thì sướng, nhưng đổi lại phải nuôi một ông lão công (`VACUUM`) chạy mãi mãi ở nền.

* **Tun nhẹ tay:** Bảng phình lên (Bloat) và tiến gần Wraparound.
* **Tun mạnh tay:** Ngốn I/O của Production.

### Kẻ thù nguy hiểm nhất (Vô hình):

* Một giao dịch mở quá lâu (`BEGIN` từ 3 tiếng trước).
* Một tiến trình sao chép (`Replication slot`) bị bỏ quên.

Chúng giữ khư khư một ảnh chụp cũ, khiến VACUUM **không được phép dọn gì**, và bảng cứ thế phình lên!

### Vì sao không dùng 64-bit XID?

Vì XID nằm ngay trong từng dòng trên đĩa (`xmin`, `xmax`). Đổi nó là đổi cả cách lưu trữ, cả Index, cả WAL. (XID 64-bit vẫn chưa vào bản Postgres chính thức).

---

**[03:10 - End] Đơn vị theo dõi sức khỏe DB & Chi tiết an ủi**

Một database đang chạy tốt (CPU, RAM, Disk ổn) không có nghĩa là nó an toàn. Có những quả bom hẹn giờ đang đếm ngược rất âm thầm!

Chùm đếm bằng thứ đơn vị mà Dashboard mặc định không có: **XID age**.

#### Tự soi bảng bằng một câu SQL:

```sql
SELECT relname, age(relfrozenxid) 
FROM pg_class 
ORDER BY 2 DESC;

```

*(So kết quả với ngưỡng 200 triệu của `autovacuum_freeze_max_age`)*

Hệ Postgres của các bạn, có ai đang theo dõi `age(relfrozenxid)` không? Hay vẫn tin Autovacuum lo hết rồi? Để lại comment cho mình biết nhé!

---

#### 💡 Chi tiết an ủi:

Giao dịch chỉ đọc (`Read-only`) không tiêu một con số XID thật nào! Nó chỉ mượn tạm một số ảo (`Virtual XID`) rồi trả lại. Nên một bản sao chỉ đọc (Replica) chạy báo cáo cả ngày cũng không đẩy anh em tới gần Wraparound nhịp nào.
Cùng một câu lệnh, không ai sửa một dòng code nào. Lúc chạy nhanh, nó hết 0,042 ms. Lúc chạy chậm, 71,971 ms.

Chuyện bắt đầu từ thứ ai cũng từng viết: một API trả danh sách đơn hàng có bộ lọc thời gian nhưng không bắt buộc. Có thì lọc, không có thì trả hết.

Để khỏi viết hai câu lệnh, đa số gộp lại thành một điều kiện OR duy nhất. Tham số rỗng thì trả hết, có giá trị thì lọc theo mốc thời gian. Gọn sạch, chạy ngon trên máy dev.

Rồi lên Production, độ trễ dựng đứng. Không ai đổi một dòng code nào. Thủ phạm tên là "Kế hoạch dùng chung" (Generic Plan).

Cuối tháng 7 vừa rồi, Franck Pachot dựng một phép đo. Anh ép Postgres dùng kế hoạch dùng chung để chụp lại đúng khoảnh khắc xấu nhất.

Cùng một câu lệnh, 71,971 ms thay vì 0,042. Số trang dữ liệu phải chạm tới nhảy từ 4 lên 4.786.

Tức là đọc khoảng 37 MB dữ liệu chỉ để trả về đúng 10 dòng. Đó là cái giá của một điều kiện OR.

Khác hẳn anh em sẽ nghĩ Prepared Statement thì càng chạy càng nhanh, chuẩn bị sẵn một lần rồi dùng mãi. Vậy chuyện gì đã xảy ra?

Một câu lệnh đi qua 4 chặng: đọc cú pháp, tra tên bảng tên cột, viết lại nếu đụng View, rồi lập kế hoạch. Chặng cuối quyết định sẽ quét cả bảng hay dùng Index.

Lệnh Prepare chỉ cắt giúp anh em 3 chặng đầu. Tài liệu chính thức của Postgres nói thẳng rằng khi Execute chạy, câu lệnh vẫn được lập kế hoạch lại. Đây là chỗ đa số hiểu sai ngay từ đầu.

Mà lập lại kế hoạch mỗi lần thì tốn CPU. Nên Postgres có một mẹo: 5 lần chạy đầu, nó lập kế hoạch riêng cho từng lần, dùng đúng giá trị tham số của lần đó.

Sau 5 lần, nó tính chi phí ước tính trung bình rồi dựng thử một kế hoạch dùng chung cho mọi giá trị. Cái nào rẻ hơn trên giấy thì từ đó xài luôn.

Đây cũng là lý do trên máy dev không ai thấy gì. Prepared Statement sống theo kết nối. Anh em bấm chạy vài lần rồi tắt, kết nối chết trước khi chạm mốc 5.

Lên Production, một kết nối trong pool sống hàng giờ và phục vụ hàng nghìn lượt. Nó vượt mốc 5 chỉ trong vài giây. Mà không gõ chữ Prepare nào cũng không thoát, vì driver tự làm việc đó sau lưng.

Nghe vẫn hợp lý đấy, nhưng vấn đề nằm ở đúng 4 chữ: "cho mọi giá trị".

Khi lập kế hoạch riêng, bộ lập kế hoạch nhìn thấy tham số bằng đầu năm 2026, nên nó tính ra ngay vế kiểm tra rỗng là sai.

Điều kiện OR chỉ còn đúng một nhánh: so cột với một hằng số. Dạng này thì Index dùng được, Postgres nhảy thẳng tới đúng chỗ trong cây rồi đọc tiếp.

Kế hoạch dùng chung thì khác hẳn. Nó phải chạy đúng cho cả những lần tham số thật sự rỗng. Nên bộ lập kế hoạch bị cấm giả định giá trị tham số.

Vế kiểm tra rỗng không chứng minh được là sai, thế là cả điều kiện OR phải giữ nguyên. Mà điều kiện OR có nhánh không đụng tới cột được Index thì hết cửa dùng để nhảy. Nó tụt xuống thành bộ lọc (Filter).

Khoan! Thế kế hoạch vẫn ghi Index Scan mà sao vẫn chậm được?

Đấy chính là cái bẫy thứ hai. Index vẫn được dùng thật, nhưng nó tụt từ vai trò tìm kiếm xuống vai trò sắp xếp.

Postgres lê từ đầu Index, lôi từng dòng lên, rồi mới hỏi từng dòng xem có khớp không.

Muốn phân biệt thì soi 2 chữ: Kế hoạch tốt ghi điều kiện ở dòng `Index Cond`. Kế hoạch xấu đẩy nó xuống `Filter`, kèm một dòng `Rows Removed by Filter`.

Trong phép đo đó, dòng này ghi 525.600. Anh em thử nhân 365 với 24 rồi với 60 xem.

Đúng bằng số phút của một năm. Postgres đi bộ qua nguyên một năm dữ liệu rồi mới chạm dòng đầu tiên hợp lệ.

Nhưng có chi tiết còn đáng sợ hơn con số đó: Postgres chọn kế hoạch bằng cách so ước tính với ước tính, nó không bao giờ đo thời gian chạy thật.

Muốn đối chiếu thì phải chạy cả 2 kế hoạch rồi bấm giờ, tức trả giá gấp đôi cho mọi câu lệnh. Nên một kế hoạch chậm gấp nghìn lần vẫn thắng, miễn con số ước tính của nó nhỏ hơn.

Cú kịch báo lên mailing list chính thức của Postgres năm 2019: một người ở BMC Software chạy Postgres 9.6, câu lệnh của họ có 51 tham số với chuỗi OR dài dằng dặc. Bản đó chưa có công tắc nào để ép, nên đây đúng là chế độ mặc định tự lật.

Chi phí ước tính giảm từ 402 xuống 12,68 (rẻ đi 32 lần trên giấy). Còn thời gian chạy thật thì đi ngược hẳn, từ 3,497 ms lên 5.544.701 ms (đắt lên gấp nghìn khi chạy thật).

Người trả lời trong luồng đó là Tom Lane, chính người viết ra cơ chế này. Ông nói: về nguyên tắc, một generic plan không bao giờ có thể thực sự tốt hơn custom plan. Rẻ hơn trên giấy là dấu hiệu của lỗi ước lượng.

Đọc tới đây dễ nghĩ Postgres làm ẩu. Không phải vậy! Trước bản 9.2, Prepared Statement luôn dùng kế hoạch dùng chung và thường tệ hơn hẳn. Cơ chế 5 lần chính là bản vá cho chuyện đó.

Cửa Prefect cho thấy cả hai mặt. Database của họ hết bộ nhớ 2 lần trong 4 ngày vì generic plan không biết trước giá trị tham số nên không cắt bớt partition được, phải ôm hết. Họ dập bằng cách cấm Postgres lật sang kế hoạch dùng chung (`force_custom_plan`). Nhưng chính họ xác nhận, bật công tắc đó cho một database khác đơn giản hơn thì độ trễ lại xấu đi thấy rõ.

Riêng kiểu viết trong bài thì có cách chữa gọn hơn: bỏ hẳn `OR`, thay bằng hàm `COALESCE` với một mốc vô cực. Hết `OR` nên kế hoạch nào cũng nhảy được bằng Index. Nhưng cột cho phép rỗng thì mất dòng, còn kiểu số nguyên thì chẳng có vô cực nào để mà điền.

Điều đáng nhớ nhất là cái bẫy không nằm ở Prepared Statement. Franck Pachot thử lại bằng CTE với giá trị cứng, không tham số nào, mà vẫn dính 108.996 ms. Gốc rễ nằm ở chính điều kiện `OR` mà Postgres không nhìn thấy giá trị lúc lập kế hoạch.

Còn con số 5 trong luật 5 lần chạy đầu thì không dựa trên nghiên cứu nào hết. Ngay cạnh nó trong source code là ghi chú của người trong nhóm phát triển Postgres: vỏn vẹn một chữ "arbitrary" (chọn đại). Dòng ghi chú đó nằm in nguyên từ 2012 tới giờ không đổi một ký tự.

Còn hệ thống của anh em, có endpoint nào đang gộp bộ lọc tùy chọn kiểu này không? Anh em chọn hướng nào: gộp một câu cho code gọn hay chịu khó tách nhánh? Comment cho chúng mình biết nhé!
Dưới đây là transcript đầy đủ cho video, đã được ghi lại chính xác từng lời và không có thêm thắt nội dung:

---

## Transcript Nội Dung Video

**[00:00 - 00:28] Đặt vấn đề**
Cắt bớt kết nối thì database nhanh hơn. Nghe ngược đời đúng không?

Một đội đã cắt từ 2048 xuống 96. Thời gian phản hồi rớt từ khoảng 100 miligiây xuống còn khoảng 2.

Chuyện bắt đầu từ một câu hỏi phỏng vấn nghe rất ngon ăn: *"Hệ thống của em đang chậm, nghi là do database, em xử lý thế nào?"*

Ứng viên đáp ngay: *"Dạ dễ thôi anh, em tăng pool từ 100 lên hẳn 1000. Càng nhiều kết nối thì càng gánh được nhiều việc cùng lúc."*

Nghe xuôi tai, nhưng đó đúng là cái bẫy. Thêm kết nối không hề thêm sức mạnh.

---

**[00:28 - 01:07] Tầng 1: CPU Đổi ca (Context Switch)**
Người phỏng vấn hỏi ngược lại: *"Server database của em chỉ có 8 core thôi, 1000 truy vấn chạy cùng lúc thì kiểu gì cho vừa?"*

Thực ra "song song" ở đây là cú lừa. Một core tại một thời điểm chỉ chạy được đúng một việc.

Hệ điều hành phải xé nhỏ thời gian ra cho mỗi việc chạy vài miligiây rồi đổi ca. Nhìn từ ngoài thì tưởng chúng chạy song song.

Mà mỗi lần đổi ca, CPU phải cất trạng thái cũ đi, rồi nạp trạng thái mới vào. Việc đó không hề miễn phí.

Anh em thử tưởng tượng 1000 truy vấn tranh nhau 8 cái core xem. CPU tốn một phần đáng kể sức lực chỉ để đổi ca, thay vì chạy truy vấn thật. Chưa kể chúng còn tranh giành khóa của nhau, và đá văng dữ liệu của nhau ra khỏi bộ nhớ đệm ngay trên con chip.

Nên thêm kết nối không thêm sức mạnh, nó chỉ băm nhỏ cái sức đang có ra thôi.

---

**[01:07 - 01:29] Tầng 2: Công thức tính Pool Size chuẩn**
Thế đặt pool bằng đúng số core là xong chứ gì? Câu hỏi hay, nhưng vẫn sai nốt.

Vì truy vấn đâu chỉ ngốn CPU, nó còn ngồi chờ đọc đĩa, chờ mạng. Trong lúc một kết nối đang chờ thì core rảnh, phải nhét việc khác vào cho nó làm chứ.

Thế nên cộng đồng Postgres mới chốt một công thức:


$$\text{pool} \approx (\text{số core} \times 2) + \text{số đĩa quay}$$

Server 8 core thường chỉ cần pool tầm 16 đến 20 kết nối là đẹp, không phải 1000.

---

**[01:29 - 02:22] Tầng 3: Tác hại của kết nối Ngồi Không (Idle Connections)**
Nhưng cứ mở dư ra, cho 900 kết nối còn lại ngồi không thì có hại gì đâu?

Hại to đấy. Với Postgres, mỗi kết nối mở ra là nó đẻ hẳn một process riêng trên server.

Andres Freund, một trong những người viết code lõi của Postgres, đo thử đàng hoàng rồi: Trên Postgres 12, 10.000 kết nối ngồi không làm 48 kết nối đang è cổ làm việc mất gần một nửa thông lượng!

Lượng giao dịch tụt từ hơn 1 triệu xuống còn khoảng 520 nghìn mỗi giây. Mà đám kia có làm gì đâu, chúng chỉ ngồi đó thôi.

Lý do nằm ở chỗ này: Mỗi lần dựng ảnh chụp dữ liệu (tức là tính xem giao dịch này được thấy những gì), Postgres phải lướt qua toàn bộ danh sách kết nối. Bất kể kết nối đó đang bận hay đang ngồi chơi, nó vẫn nằm trong danh sách phải duyệt. Hệ thống tự vấp chân chính mình.

Chính Freund sau đó vá ít thắt này trong Postgres 14, kéo thông lượng về gần đúng mức chưa có kết nối nào ngồi không.

Nhưng đừng mừng vội, con số đẹp đó đo khi 10.000 kết nối nằm im hoàn toàn. Đo lại đúng kịch bản đời thật, bản đã vá vẫn mất khoảng 16% thông lượng.

---

**[02:22 - 02:43] Bằng chứng thực tế từ Oracle (2048 -> 96)**
Thế thực tế có đội nào làm ngược lại chưa? Cắt bớt kết nối đi để chạy nhanh hơn ấy?

Bản lật kèo thuyết phục nhất là của nhóm Real-World Performance bên Oracle. Họ cầm một hệ đang mở 2048 kết nối, thẳng tay cắt xuống còn đúng 96. Mọi thứ khác giữ nguyên.

Thời gian phản hồi rớt từ khoảng 100 miligiây xuống còn khoảng 2. Cắt hơn 20 lần số kết nối, đổi lại nhanh lên cỡ 50 lần.

---

**[02:43 - 03:23] Sự đánh đổi & Quy tắc quản lý Pool**
Vậy cứ để pool thật nhỏ là xong chứ gì? Không có gì miễn phí đâu.

Pool nhỏ thì đám request thừa phải xếp hàng chờ lấy kết nối ở phía ứng dụng, hàng đợi dài ra. Nhỏ quá so với tải thật thì chờ vượt 30 giây (mức mặc định của HikariCP) là lỗi ném hàng loạt đúng giờ cao điểm.

Và coi chừng bài toán nhân bản nữa: Anh em đặt pool 20, nhưng scale lên 50 bản sao service, thì database vẫn lãnh đủ 1000 kết nối. Lúc đó thứ cần thêm là một pooler như PgBouncer đứng giữa điều phối, không phải nới trần kết nối của database.

Wiki của HikariCP có một câu cực thấm:

> *"Pool nhỏ, và luôn bão hòa."*

Thà để request xếp hàng ngoan ngoãn bên ứng dụng, còn hơn thả chúng vào dẫm đạp lên nhau trong database.

Còn dùng toàn SSD thì sao? Chắc được mở thoáng tay hơn? Ngược 180 độ: SSD ít bắt truy vấn ngồi chờ hơn, core ít rảnh hơn, nên pool tối ưu còn phải nhỏ hơn nữa.

---

**[03:23 - End] Tổng kết**
Còn hệ thống của anh em, pool đang đặt bao nhiêu? Và con số đó sinh ra từ một phép đo đàng hoàng hay từ cảm giác? Comment cho chúng mình biết nhé!
Dưới đây là transcript chính xác toàn bộ nội dung audio/video của bạn:

---

## Transcript Nội Dung Video

### **[00:00 - 00:34] Đặt vấn đề: Nghịch lý B-Tree Index sau khi xóa dữ liệu**

* Index này gần như chỉ còn rác ($99,98\%$ là trang chết). Vậy mà nó trả khóa ít việc hơn hồi còn đầy dữ liệu!
* Chuyện bắt đầu bằng việc anh em làm hoài: Xóa một đống dữ liệu cũ, chạy VACUUM, rồi mở câu lệnh kiểm tra Index xem đã gọn lại chưa:
```sql
SELECT tree_level FROM pgstatindex(...);

```


* Con số chiều cao Index (`tree_level`) vẫn $2$ — không đổi. Thế là thở dài, xếp lịch dựng lại Index (`REINDEX`) vào cuối tuần.
* Nhưng cuối tháng 7 vừa rồi, Franck Pachot dựng một thí nghiệm cho kết quả ngược đời: Anh ấy xóa sạch 5 triệu dòng rồi chạy VACUUM. Gần như toàn bộ file Index thành rác, chiều cao vẫn báo $2$. Vậy mà một lần tra khóa chỉ còn đọc **1 lần**, thay vì **3 lần** hồi bảng còn đủ dữ liệu!
* Con số anh em nhìn không sai, nó chỉ không phải con số Postgres dùng!

---

### **[00:34 - 01:24] Chặng 1: Bản chất chiều cao B-Tree Index (Tree Level)**

* Cây B-Tree tìm một khóa bằng cách đi từ trên xuống (Tầng gốc $\rightarrow$ Tầng giữa $\rightarrow$ Tầng lá). Mỗi tầng tốn đúng 1 lần đọc.
* Mỗi lần đọc đó lấy lên một trang (8 KB). Cây 3 tầng thì tra khóa nào cũng mất 3 lần đọc. Khóa nằm ở đâu cũng vậy, đó chính là nghĩa của chữ "cân bằng" trong tên B-Tree.
* Thế xóa bớt dữ liệu đi thì cây có thấp lại không? **Không bao giờ!**
* Tài liệu thiết kế nằm ngay trong mã nguồn Postgres (`nbtree/README`) nói thẳng: Nó không xóa trang ngoài cùng bên phải của bất kỳ tầng nào, kể cả trang gốc. Nên chiều cao cây không thể giảm.
* Hệ quả là sau một đợt xóa lớn, cây thành hình cái que: Gốc vẫn ngồi ở tầng 2, nhưng dưới nó là mấy tầng chỉ còn đúng 1 trang. Mỗi tầng như vậy là một lần đọc hoàn toàn vô ích!

---

### **[01:24 - 02:25] Chặng 2: Mẹo Fast Root & Hai cặp con trỏ trong Metapage**

* Postgres gỡ chuyện này bằng một mẹo mượn của Lanin & Shasha (hai tác giả mà `nbtree` lấy phần logic xóa trang):
* Nó ghi nhớ tầng thấp nhất chỉ còn đúng 1 trang, rồi gọi đó là **Fast Root**.
* Từ đó, mọi thao tác bắt đầu tìm từ chỗ này thay vì từ gốc thật, nhảy cóc qua mấy tầng rỗng!


* Không sửa thẳng gốc thật cho gọn vì gốc thật chính là trang ngoài cùng bên phải của tầng nó — mà luật vừa nói là không bao giờ xóa!
* Postgres để nguyên con trỏ cũ, rồi đẻ thêm con trỏ thứ hai (Fast Root). Cả hai cùng ghi vào `Metapage` (trang đầu tiên của Index):
* `btm_root` & `btm_level` (Gốc thật)
* `btm_fastroot` & `btm_fastlevel` (Fast Root)


* **Sự thật vỡ ra:**
* Khi Postgres thực sự đi tìm một khóa hay ước tính chi phí, nó đọc con trỏ **Fast Root**.
* Còn hàm `pgstatindex` (câu lệnh chép trên mạng) lại trả về chiều cao của **Gốc thật** (`btm_level`)!
* Con số nằm trên Dashboard của anh em không nằm trên đường đi nào của Postgres lúc chạy câu lệnh!



---

### **[02:25 - 03:18] Chặng 3: Độ đầy của lá (Avg Leaf Density) & Bẫy số liệu**

* Chỉ số hay được đem ra quyết định cùng chiều cao còn chơi trớ hơn: đó là **Độ đầy của lá (`avg_leaf_density`)**.
* Nó loại hẳn trang chết ra khỏi cả tử số lẫn mẫu số, chỉ tính trên đám lá còn sống. Nó trả lời câu hỏi: *"Mấy cái lá còn sống đang đầy bao nhiêu phần?"* chứ không sinh ra để đo rác!
* Hệ quả rất ngược: Index càng nhiều trang chết thì mẫu càng sạch, con số báo cáo càng đẹp!
* **Vậy ngưỡng bao nhiêu mới đáng lo?**
* Tài liệu chính thức của Postgres **không đưa ra một ngưỡng nào**.
* Laurenz Albe (người trong nhóm phát triển Postgres) khẳng định trên mailing list: Độ đầy khoảng **$30\%$ là hoàn toàn bình thường** với một cây B-Tree.
* Trong khi các bài hướng dẫn trôi nổi trên mạng bảo nhau dưới $60\%$, $70\%$, thậm chí $80\%$ là phải `REINDEX` ngay! (Chênh nhau hơn 2 lần).
* Mức đầy mặc định khi vừa dựng xong Index đã là $90\%$ (`fillfactor = 90`).



---

### **[03:18 - 04:30] Chặng 4: Thí nghiệm thực tế & Bẫy khi REINDEX CONCURRENTLY**

* Thí nghiệm của Franck Pachot (23/07/2026):
* **Xóa sạch bảng:** 193 MiB rác vẫn nằm đó, `VACUUM` không trả trang nào về cho OS.
* **Xóa thưa (còn 19.500 dòng rải rác):** `fastroot` trùng với `root` thật $\rightarrow$ Vẫn phải đi đủ 3 tầng. Dữ liệu thực tế chỉ cần 96 lá, nhưng bị rải ra 13.202 lá (gấp 137 lần!).


* Đây đúng là kịch bản tài liệu Postgres cảnh báo (`routine-reindex`): Khóa bị xóa rải rác làm lãng phí không gian, và khuyến nghị `REINDEX` định kỳ.
* GitLab trên hệ thống thật cũng chạy tác vụ `REINDEX` mỗi giờ vào T7 & CN (chỉ làm tối đa 2 Index dưới 100 GB/lượt). Năm 2020, họ ước tính rác Index tích lại khoảng **500 GB** sau 3 tháng!

#### **Tác hại của REINDEX CONCURRENTLY (Không khóa ghi):**

* Phải quét bảng **2 lượt** cho mỗi Index.
* Phải chờ mọi giao dịch liên quan kết thúc.
* **Nếu hỏng giữa chừng:** Để lại một Index hỏng (`INVALID`) nằm đó, không phục vụ câu lệnh nào nhưng vẫn ăn chi phí CPU/Disk mỗi lần ghi!

---

### **[04:30 - End] Kết luận & Lời khuyên thực chiến**

Nếu chỉ giữ lại một thứ từ video này: **Đừng quyết định `REINDEX` bằng chiều cao (`tree_level`) hay ngưỡng chép trên mạng!**

#### **Cách làm đúng:**

1. Đo số trang thật sự đọc bằng `EXPLAIN (ANALYZE, BUFFERS)`.
2. Theo dõi kích thước Index theo thời gian xem nó đang xấu dần hay đã đứng lại.

> *Anh em đang lấy con số nào để quyết định có `REINDEX` hay không, và ngưỡng đó ở đâu ra? Kể cho chúng mình nghe ở phần bình luận nhé!*
**Transcript Video: Tối Ưu Bộ Nhớ Redis (100 GB $\rightarrow$ 60 GB)**

---

**[00:00 - 00:28] Đặt vấn đề**
100 GB. Sếp muốn kéo xuống còn 60, và cấm xóa dữ liệu.

Đây là câu hỏi cuối của một buổi phỏng vấn Backend. Anh em sẽ trả lời thế nào? Thử nghĩ 3 giây trước khi nghe tiếp.

Ba đáp án bật ra nhanh nhất đều trượt:

1. **Thêm máy**
2. **Bật nén**
3. **Tự xóa bớt**

Nghe rất hợp lý, và cả ba đều trượt vì cùng một lý do: Chúng đang đoán sai chỗ Redis thật sự tiêu bộ nhớ. Thứ quyết định không nằm ở lượng dữ liệu. Nó nằm ở một con số trong file cấu hình, và mặc định con số đó là **64**.

---

**[00:28 - 01:02] Vì sao 3 đáp án thông thường lại trượt?**

* **Đáp án 1 (Thêm máy):** Thêm máy chỉ chia nhỏ cùng lượng dữ liệu ra nhiều chỗ hơn thôi. Tổng bộ nhớ phải mua không giảm đi đâu cả, nó còn nhích lên vì mỗi máy cõng thêm phần sổ sách riêng của nó. Thêm bản sao còn tệ hơn nữa, bản sao giữ nguyên một bản đầy đủ nên nó nhân đôi chỗ tốn chứ không chia bớt.
* **Đáp án 2 (Bật nén):** Redis không có nút nén chung cho dữ liệu đang nằm trong bộ nhớ. Lục hết file cấu hình, mặc định thì mọi chỗ có chữ nén đều nằm ngoài chuyện này: Một chỗ nén file lúc ghi xuống đĩa, một chỗ nén phần giữa của danh sách (mặc định tắt), nhóm còn lại nén đường truyền giữa các máy (cũng tắt sẵn). Không cái nào chạm được vào bộ nhớ đang chạy.
* **Đáp án 3 (Tự xóa bớt):** Cái này trượt luôn đề bài, vì nó chính là xóa dữ liệu mà đề bài cấm xóa.

---

**[01:02 - 01:53] Tầng ẩn: Kiểu dữ liệu vs Cách lưu (Listpack / Hashtable)**
Đáp án thật nằm ở đâu? Ở một tầng mà phần lớn người dùng Redis chưa từng nhìn tới.

Anh em gõ lệnh tạo Hash, anh em nghĩ Redis dựng cho anh em một bảng băm. Không hẳn!

Phải tách hẳn hai thứ ra:

1. **Kiểu dữ liệu:** (Hash, List, Set...) quyết định anh em được gõ lệnh nào.
2. **Cách lưu:** Thứ thật sự trả tiền. Hai tầng tách rời nhau.

* **Với dữ liệu nhỏ:** Redis gói tất cả vào một **khối byte liền mạch (Listpack)**. Các phần tử nối đuôi nhau, 0 con trỏ!
* **Với dữ liệu lớn:** Nó mới bung ra thành **bảng băm thật (Hashtable)**. Lúc đó mỗi trường có một ô riêng, tên trường và giá trị cấp phát riêng, mỗi mảnh lại bị làm tròn lên.

Ranh giới giữa hai thế giới đó chỉ là một con số trong file cấu hình. Mặc định: Giá trị dài quá **64 byte** là đổi thế giới (`hash-max-listpack-value 64`).

Kiểu dữ liệu là thứ anh em thấy, Cách lưu mới là thứ trả tiền!

---

**[01:53 - 02:38] Bậc thang bộ nhớ: Thêm 1 byte, RAM tăng 76,67%**
Con số 64 đó cứng đến mức nào? Đội Valkey đo đúng 3 key, mỗi key một Hash chỉ có một trường:

* **63 byte giá trị:** Tốn 104 byte bộ nhớ.
* **64 byte giá trị:** Tốn 120 byte (vẫn khối liền mạch, tăng 15%).
* **65 byte giá trị:** Nhảy vọt lên **212 byte**!

Thêm đúng một ký tự, bộ nhớ của key đó **tăng hơn 3/4 (76,67%)**!

Ở đây có hai bậc nhảy khác loại nhau, trộn chúng vào là hiểu sai bài:

* **Bậc nhỏ (104 $\rightarrow$ 120):** Vẫn nằm trong khối liền mạch, chỗ ghi độ dài phình từ 1 byte lên 2, đẩy cả khối sang mức cấp phát toàn bộ to hơn.
* **Bậc lớn (120 $\rightarrow$ 212):** Mới là bậc đổi cách lưu (chuyển sang Hashtable), và đó mới là bậc đắt!

Bộ nhớ của Redis không phải đường thẳng đi lên, nó là **hàm bậc thang**.

---

**[02:38 - 03:20] Câu chuyện thực tế cứu Instagram năm 2011**
Mẹo dựa vào chính bậc thang này đã cứu Instagram thật gần 15 năm trước.

Hồi đó Instagram cần một bảng ánh xạ 300 triệu tấm ảnh về người đã đăng chúng. Làm kiểu mỗi ảnh một key: 1 triệu key ngốn $70\text{ MB} \times 300 = \mathbf{21\text{ GB}}$ (vượt cả cỡ máy họ thuê được).

Người viết lõi Redis gợi ý **gom lại thành Hash**: Họ chia 1 triệu key thành 1.000 nhóm, mỗi nhóm 1.000 phần tử. Cùng lượng dữ liệu đó tụt từ $70\text{ MB}$ xuống còn **$16\text{ MB}$**!

Toàn bộ 300 triệu ánh xạ gói gọn dưới **5 GB** (vừa một máy rẻ hơn 3 lần).

---

**[03:20 - 04:22] Cạm bẫy Một chiều (One-Way Conversion) & Cách thu hồi RAM**
Nhưng tài liệu Redis nói thẳng một câu: **Phần tiết kiệm bộ nhớ sẽ mất trắng nếu vượt ngưỡng!**

Không log, không cảnh báo, phần tử thứ 1.001 nhét thêm vào một nhóm sẽ âm thầm nuốt sạch lợi ích.

Người phỏng vấn sẽ hỏi câu hiểm nhất: *"Tôi sửa cấu hình xong rồi, sao bộ nhớ không giảm?"*

**Vì đường quay về chưa từng được viết!** Trong mã nguồn có hàm `hashTypeConvert()`, đường từ khối liền mạch $\rightarrow$ bảng băm có code đàng hoàng. **Chiều ngược lại dẫn thẳng vào dòng báo "Not implemented"!**

Xóa bớt phần tử không bao giờ đưa một Hash về lại khối liền mạch. Cấu hình chỉ áp cho lần ghi tiếp theo.

**Muốn thu hồi bộ nhớ thật:** Phải dựng lại key từ đầu (Khởi động lại / Nạp lại từ file Dump / Dựng máy phụ rồi chuyển vai).

---

**[04:22 - 04:52] Cái giá của việc tăng ngưỡng Listpack & Thay đổi hành vi API**
Thế đặt ngưỡng lên 100.000 cho chắc ăn? Đây là chỗ phải trả tiền:

* Khối liền mạch không có mục lục, không băm. Tìm một trường là **quét tuần tự từ đầu**.
* Ghi một trường vào giữa phải **cấp phát lại cả khối và dịch toàn bộ phần đuôi**.
* Ngưỡng càng cao, hai chi phí đó càng phình theo.

Tệp cấu hình Valkey cảnh báo: *"Chỉ chỉnh sau khi ĐÃ ĐO trên dữ liệu thật!"*.

**Đổi hành vi API:** Lệnh duyệt Hash (`HSCAN`) trên khối liền mạch trả hết trong một lần, còn trên bảng băm lại trả theo từng trang!

---

**[04:52 - End] Tổng kết**
Bộ nhớ của Redis là hàm của **Dữ liệu + Cấu hình**.

Trước khi ký đơn mua thêm máy, kiểm tra cách lưu trên vài key nóng: `OBJECT ENCODING hot:key`.

---

**Ngụm cafe cuối:**
Chính cái lệnh `OBJECT ENCODING` dùng để đo lại không đo cùng một kiểu ở 2 bên ngưỡng: Với khối liền mạch, nó đo thẳng cả khối ($104\text{ byte}$). Với bảng băm, nó chỉ lấy mẫu 5 phần tử rồi nhân ra ($\approx 212\text{ byte}$). Cùng một lệnh, hai loại số khác hẳn nhau về bản chất!
Câu hỏi này anh em nghe hoài: "Thời AI rồi thì nên học ngôn ngữ nào cho khỏi thất nghiệp?"

Câu trả lời có lẽ không phải một cái tên ngôn ngữ nào cả. Và SQL là ví dụ dễ thấy nhất.

Tháng 2 năm nay, một dịch vụ xác thực sập 90 phút, hơn 95% lưu lượng bị chặn thẳng. Không ai đổi một dòng code nào. Thủ phạm là một lệnh cập nhật thống kê tự chạy, bốc mẫu trượt đúng một cột.

Chắc hẳn anh em nghĩ AI viết SQL thì đúng cú pháp thôi, còn chạy thì chậm hơn người. Hai chuyện đó gặp nhau ở đúng một chỗ. Thứ quyết định câu lệnh chạy nhanh hay chậm hóa ra không nằm trong câu lệnh.

Nói chuyện AI trước. Có hẳn một bộ đo cho việc này, tên BIRD. Nó chấm cả tốc độ chứ không chỉ chấm đúng sai. Và số của nó nói ngược lại.

BIRD gồm 12.751 câu hỏi trải trên 95 database. Đề bài viết bằng tiếng người, model phải viết ra câu lệnh trả đúng kết quả.

Điểm hiệu năng của bộ đo đã trừ sẵn những câu trả sai. Nên muốn nhìn riêng phần hiệu năng thì phải chia nó cho điểm đúng. Chia ra thì mấy hệ đứng đầu bảng đều nhỉnh hơn người, 0,93 tới 0,94 so với 0,90.

Khoan mừng. Mấy hệ đầu bảng đó là hệ nhiều tầng, chạy đi chạy lại rồi tự sửa, chứ không phải gõ một câu vào chatbot. Model cũng chỉ được tính điểm ở những câu nó làm đúng. Nên hai bên đang bị chấm trên hai tập câu khác nhau. Con số đó là điểm quy đổi, không phải tỷ lệ nhanh chậm.

Chỗ đáng đọc nằm ở cách bộ đo được dựng. 95 database cộng lại đúng 33,4 GB. Nhỏ tới mức trung bình mỗi database 351 MB. Ở cỡ đó thì cả database nằm gọn trong bộ nhớ. Quét cả bảng cũng chỉ mất một nhịp. Gần như không có đất cho một kế hoạch tồi.

Rồi chính nhóm làm bộ đo thử hai cách cho câu lệnh chạy nhanh hơn.

Cách thứ nhất là viết lại câu lệnh cho khéo. Trên 10 ví dụ họ đưa ra, tiết kiệm trung bình 77,75%.

Cách thứ hai là thêm index vào database, không sửa một chữ nào trong câu lệnh, tiết kiệm tới 87,3%.

Hóa ra thứ cắt được nhiều thời gian nhất lại nằm ngoài câu lệnh. Vậy nó nằm ở đâu?

Nó nằm ở bộ lập kế hoạch hay planner. Cái phần quyết định câu lệnh của anh em sẽ đi đường nào. Planner có một đặc điểm ít người để ý: nó không đọc dữ liệu của anh em. Nó đọc một bản tóm tắt dữ liệu.

Postgres không chạy thử rồi đo đâu. Vì muốn đo thật thì phải chạy hết mọi đường mới biết đường nào rẻ. Nên nó đoán trước.

Mở bảng thống kê ra thấy: bao nhiêu phần trăm dòng là NULL, cột có bao nhiêu giá trị khác nhau. Rồi danh sách những giá trị hay gặp nhất kèm tần suất từng cái. Và một bảng chia dữ liệu thành từng khoảng đều nhau. Gần như chừng đó thôi.

Tài liệu Postgres có sẵn một phép tính mẫu trên bảng 10.000 dòng với cùng một câu lọc theo một cột.

Nếu giá trị anh em truyền vào nằm trong danh sách hay gặp, planner tra thẳng bảng tần suất rồi ra 30 dòng.

Nếu không nằm trong đó, nó lấy phần còn lại chia đều rồi ra 15 dòng.

Cú pháp giống hệt nhau, hai công thức khác hẳn nhau. Cái quyết định là giá trị đó có lọt danh sách hay gặp của riêng bảng đó hay không.

Bảng tần suất ấy AI không thấy. Người mới học cũng không thấy. Nó không nằm trong câu lệnh, không nằm trong mô tả bảng, và mặc định thì không ai gửi nó cho model cả.

Rồi tới chỗ chết người: khi câu lệnh có nhiều điều kiện lọc cùng lúc, Postgres nhân xác suất của từng điều kiện lại với nhau. Tức là giả định các cột không dính dáng gì tới nhau.

Tài liệu có ví dụ trớ trêu: hai cột giá trị trùng nhau hoàn toàn. Lọc riêng một cột thì ước đúng 100 dòng. Lọc cả hai thì ước ra 1 dòng, trong khi sự thật vẫn là 100. Hụt 100 lần chỉ vì lấy 1% nhân với 1%.

Ước hụt thì đã sao? Chậm hơn tí là cùng chứ gì?

Không đâu. Vì con số ước tính quyết định luôn cách ghép hai bảng lại với nhau. Có một kiểu ghép tên là nested loop. Nó lấy từng dòng bên ngoài rồi loop lại cả bên trong, một dòng một lượt lục.

Planner tưởng vòng ngoài chỉ có 1 dòng thì nó thấy kiểu này rẻ nhất. Bảng đồ chơi 10.000 dòng đã lệch 100 lần. Bảng thật vài chục triệu dòng thì con số đó không dừng ở 100. Mỗi dòng lệch thêm là một lượt lục nữa.

Chuyện này không phải suy đoán. Một nhóm nghiên cứu bắn cả bộ truy vấn thật vào Postgres và 4 hệ khác, đo xem ước tính lệch bao nhiêu. Khi phí ước tính của nested loop là 1 triệu, còn kiểu ghép kia là 1.000.001, thì Postgres luôn chọn nested loop.

Họ gọi đó là quyết định cực kỳ mạo hiểm. Vì cái được thì bé tí, còn khi hai bảng cùng lớn lên thì nested loop dội theo bình phương. Cùng bài đó, đo tỷ lệ ước sai từ 10 lần trở lên: 16% với câu 1 phép ghép, 32% với 2, 52% với 3. Thêm một phép ghép là gần như gấp đôi mỗi lần, vì tầng sau lấy ước tính đã sai của tầng trước làm đầu vào.

Giờ tới câu hỏi ít ai hỏi: bản tóm tắt kia được làm từ đâu? Từ một mẫu. Lệnh ANALYZE không quét cả bảng, nó chỉ bốc mẫu. Cỡ mẫu bằng 300 nhân với một tham số mặc định là 100, ra đúng 30.000 dòng.

Con số 30.000 không nhân lên theo cỡ bảng. Bảng 10.000 dòng quét luôn cả bảng. Bảng 10 tỷ dòng cũng vẫn chỉ 30.000 dòng, tức là 0,0003%.

Đây là chủ ý chứ không phải sót. Dòng chú thích cạnh code dẫn một bài báo năm 1998, nói mẫu chừng đó vẫn cho sai số đủ nhỏ. Với bảng chia khoảng thì đúng, với những thứ khác thì không.

Cái thứ khác đó chính là vụ sập lúc đầu video. Clerk là dịch vụ xác thực người dùng cho ứng dụng web. Ngày 19/02/2026, họ sập 90 phút rồi tự viết bài mổ sự cố. Trong database của họ có một cột mà 99,99996% số dòng là NULL.

Bản cập nhật thống kê tự động chạy, bốc mẫu, và cả mẫu toàn NULL. Planner kết luận cột đó 100% là NULL. Từ kết luận sai đó, nó lập kế hoạch với giả định nhánh kia không có lấy một dòng nào khác NULL, thứ rẻ nhất trên giấy.

Thực tế nhánh ấy trả về hơn 17.000 dòng. Câu lệnh này lại chạy đủ thường xuyên nên chỗ đi bộ bất ngờ đó hút gần hết tài nguyên database. Hơn 95% lưu lượng bị chặn thẳng. Cơ chế tự đá sang máy dự phòng không kích hoạt vì database vẫn sống, chỉ là ngáp ngoái.

Mất 70 phút đội trực mới lần ra nguyên nhân thật. Nửa giờ đầu họ nghi một khách hàng tăng lưu lượng đột biến, chặn tay cũng không ăn thua. Thứ đưa kế hoạch về như cũ là gõ tay một lệnh ANALYZE.

Ngay sau sự cố thì Clerk nâng cỡ mẫu cho bảng ấy. Rồi tối hôm đó viết lại câu lệnh để planner khỏi phải đoán.

Nhẩm một phép là thấy ngay vì sao nâng mẫu lại đúng thuốc. Nếu bảng đó để mặc định thì mẫu là 30.000 dòng. Mà tỷ lệ không NULL chỉ 4 phần triệu. Nên kỳ vọng bắt được 0,12 dòng, nghĩa là phần lớn các lần chạy sẽ trượt sạch. Phép nhẩm này là của bài mổ sự cố, Clerk không công bố con số đó.

Vậy cứ nâng cỡ mẫu cho mọi bảng là xong? Không. Nâng lên thì lệnh ANALYZE chạy lâu hơn và chỗ lưu thống kê phình ra. Đổi lại nó chỉ giúp được ba việc: danh sách giá trị hay gặp dài hơn, bảng chia khoảng mịn hơn, và mẫu lớn hơn. Nó không giúp gì cho chuyện hai cột dính nhau.

Trước đó phải tạo tay bằng một loại thống kê mở rộng (`CREATE STATISTICS`). Mà tài liệu nói thẳng là loại thống kê đó hiện chưa được planner dùng khi ước tính cho phép ghép bảng.

Đọc kỹ chỗ này thấy hơi cay: công cụ duy nhất để vá chuyện hai cột dính nhau lại đúng là công cụ Postgres không chịu dùng ở nơi sai số nhân dồn mạnh nhất.

Còn con số đếm giá trị khác nhau, chính tài liệu thừa nhận vẫn sai trên bảng lớn, kể cả khi đã nâng mẫu lên mức lớn nhất.

Đọc tới đây kiểu gì cũng có anh em nghĩ: thế thì đưa bảng thống kê cho model xem là xong chứ gì?

Mấy hệ đầu bảng làm đúng thế thật: cho model chạy lệnh xem kế hoạch, mở thống kê ra đọc, bốc thử vài dòng. Cái giá là nhiều lượt gọi hơn, đắt hơn. Nhưng kể cả làm hết chừng đó, thứ nó đọc được vẫn là bản tóm tắt lấy mẫu kia, tức là nó thừa hưởng nguyên si chỗ sai mà planner đang mắc.

Nên học ngôn ngữ nào thì học, phần cú pháp AI viết hộ được thật và viết khá tốt. Thứ nó không viết hộ được là hiểu dữ liệu của chính anh em.

Cột nào lệch tới mức mẫu bốc trượt? Bảng nào to tới mức 30.000 dòng thành vô nghĩa? Hai cột nào dính nhau tới mức phép nhân kia sai bét?

Thử đoán xem bảng nào trong database của anh em đang lệch nhất? Họ định làm gì với nó: nâng cỡ mẫu, viết lại câu lệnh, hay là chưa từng mở bảng thống kê ra xem bao giờ? Comment cho anh em cùng nghe.

**Ngụm cafe cuối:** Nhóm nghiên cứu kia từng thay con số đếm giá trị khác nhau bằng giá trị đúng tuyệt đối, nghĩ ước tính sẽ chuẩn lên. Phương sai có tốt lên thật, nhưng xu hướng ước hụt lại nặng thêm. Vì con số cũ sai theo hướng đẩy ước tính cao lên, vô tình bù cho một sai số khác đang kéo xuống. Hai cái sai cộng lại thành một cái đúng. Họ than rằng vì vậy mà sửa lỗi bộ tối ưu rất nản, vá được câu này thì gây gãy câu kia.
Hàng đợi chạy thẳng trên Postgres. Một hãng đã đẩy nó lên tới $100.000$ event mỗi giây, không có Kafka nào hết.

Nhưng mất 6 năm họ mới tới được mức đó. Và chính họ kể ra những thứ đã phải vượt: bảng phình, truy vấn chậm dần, index thành nút thắt, bão retry.

Còn một máy Postgres bình thường thì gánh được bao nhiêu? Một máy 4 vCPU chạy được $2.885$ message mỗi giây, mỗi message 1 KB.

Nên câu hỏi đúng không phải là bao nhiêu thì cần Kafka, mà là hỏng ở đâu.

Nói cho sòng phẳng, phần xử lý trong phép đo đó không làm gì cả. Nên đây là trần của đường ống, chưa phải trần của công việc thật. Con số $2.885$ là trần đường ống, chưa phải trần của công việc thật.

Vậy Postgres làm hàng đợi thì hỏng ở đâu? Nó đụng ba cái trần, và mỗi cái một cơ chế khác hẳn nhau.

Trần thứ nhất là chuyện giành việc. Một bảng `jobs`, worker đi tìm việc cũ nhất chưa ai làm.

```sql
SELECT * FROM jobs 
WHERE status = 'pending' 
ORDER BY created_at 
LIMIT 1 
FOR UPDATE;

```

Khổ nỗi 200 worker cùng chạy, câu đó thì cả 200 cùng nhìn thấy đúng một hàng. Một đứa thắng, 199 đứa kia làm không công rồi thử lại.

DBOS, một hãng bán sản phẩm hàng đợi trên Postgres, đo được rằng không chống gì thì nghẽn quanh mức 100 việc mỗi giây. Nhưng họ không công bố phần cứng lẫn cách đo. Nên con số đó nên đọc như bậc độ lớn, đừng đọc như mốc chuẩn.

Postgres có thuốc từ bản 9.5 hồi đầu 2016: thêm `SKIP LOCKED` vào câu khóa. Worker thấy hàng đã bị đứa khác giữ thì bỏ qua luôn, nhảy xuống việc kế tiếp.

Trần thứ hai xuất hiện khi anh em cần giới hạn: toàn hệ thống chỉ chạy tối đa $N$ việc cùng lúc.
Muốn thế thì worker phải biết cả hệ thống đang chạy mấy việc, và con số đó phải đứng yên giữa lúc đếm với lúc lấy.
DBOS chọn cách nâng mức cô lập giao dịch lên `REPEATABLE READ`.

Mà `REPEATABLE READ` của Postgres không phải thứ trong sách giáo khoa. Nó là Snapshot Isolation, mỗi giao dịch chốt một ảnh chụp ngay lúc bắt đầu.
Hai đứa cùng sửa một hàng thì đứa sau bị hủy thẳng. Với hàng đợi thì đây là án tử, vì mọi worker đều nhắm đúng những hàng mà đứa khác cũng đang nhắm.

Chỗ này dễ vấp: đã có `SKIP LOCKED` rồi thì sao hai worker còn đụng nhau được?
Vì đứa trước `COMMIT` xong là hàng hết bị khóa, không còn gì để mà `SKIP`. Nhưng ảnh chụp của đứa sau vẫn thấy việc đó chưa ai nhận, nên nó cứ lao vào sửa rồi ăn lỗi `could not serialize`.
Khóa nhả theo thời gian thật, ảnh chụp thì dừng yên từ lúc bắt đầu.

Và nâng lên `SERIALIZABLE` chỉ tệ thêm, vì nó chính là Snapshot Isolation cộng phần dò bất thường, không phải một bản chặt tay hơn.

Trần thứ ba mới là cái ít người nói tới. Postgres sửa một hàng là đẻ ra bản sao mới, bản cũ thành rác chờ dọn.
Bình thường nó có một tối ưu tên là HOT để né việc cập nhật index mỗi lần sửa. Nhưng HOT có điều kiện: câu lệnh KHÔNG được đụng vào cột nào đang nằm trong index.

Cách làm hàng đợi phổ biến nhất vi phạm điều đó một cách có hệ thống. Vì thao tác lấy việc chính là sửa cột `status`, mà `status` thì lại nằm trong index tìm việc (`status`, `created_at`).

Postgres 14 có thêm cơ chế dọn rác index tại chỗ. Kết quả tưởng cứu được, đọc kỹ tài liệu thì nó chỉ áp dụng cho những index KHÔNG bị câu lệnh sửa tới.
Tức là đúng cái index tìm việc thì nó không đụng vào. Index cứ phình, còn Autovacuum thì đốt CPU đi dọn đống rác đó.

Tới một mức, máy dành cho việc dọn nhiều hơn dành cho việc chạy. Đấy mới là lúc nó thành cái trần.

Giờ nhìn sang phía bên kia: Kafka né được toàn bộ chuyện trên, và design doc của chính họ nói ra lý do.
Messaging kiểu cũ phải khóa từng message, rồi đánh dấu đã tiêu thụ. Kafka thì trạng thái đã tiêu thụ chỉ là một con số cho mỗi partition (`offset`).

Tiêu thụ 1 triệu message với Postgres là 1 triệu lượt sửa hàng, cộng sửa index, cộng 1 triệu bản rác.
Với Kafka, con số kia nhích từ $N \rightarrow N + 1.000.000$, không đẻ ra bản rác nào.

Không có rác thì không cần ai đi dọn. Nhưng cái giá là số consumer chạy song song bị chặn cứng bởi số partition.

Còn hai thứ nữa Kafka cho, phải nói cho đủ:

1. Một broker chết thì chỉ những partition nó đang cầm trịch bị ảnh hưởng. Còn Postgres primary chết là chết toàn bộ đường ghi.
2. Nhưng có một hiểu lầm cần gỡ: nhiều người tưởng Postgres không phục vụ được nhiều nhóm consumer độc lập. Sai! Cùng con máy 4 vCPU đó, phát cho 5 nhóm, đọc $25.183$ message mỗi giây. Cái giá không phải là không làm được, mà là ĐĨA.

Giữ 7 ngày ở mức 10 MB/giây là 5,8 TB nằm ngay trên con database đang phục vụ khách. Kafka đẩy đống đó sang chỗ khác, đó mới là thứ nó bán.

Chuyện Kafka nặng vận hành cũng nhẹ đi thật rồi. Từ bản 4.0, nó bỏ hẳn ZooKeeper, anh em không phải nuôi hai cụm nữa.

Có một ca thật rất hay, nhưng phải kể cho đủ: Prequel bỏ RabbitMQ về hàng đợi Postgres, gỡ được 580 dòng code, làm xong trong nửa ngày.
Nghe như một chiến thắng của Postgres? Nhưng lý do thật của họ không phải thông lượng, mà là prefetch. Và quy mô của họ là vài nghìn job MỖI NGÀY, không phải mỗi giây.

Vậy chốt thế nào? Không nguồn nào đưa ra được một con số duy nhất.
Nhưng Aiven, một hãng bán dịch vụ Kafka, tự công bố mức ghi trung vị của 4.000 cụm Kafka họ đang quản lý là khoảng 9,81 MB/giây.

Nên câu hỏi đúng là còn bao lâu nữa hệ thống của anh em mới chạm trần? Tăng $50\%$ mỗi năm thì gần 6 năm lưu lượng mới gấp 10.

Còn hệ thống của anh em, hàng đợi đang chạy trên gì? Postgres, Kafka hay thứ khác? Comment cho chúng mình biết nhé!
Con OOM vừa bắn hạ MySQL, máy chủ 187 GiB RAM, chạy êm được 16 tiếng thì chết.

Không ai deploy gì. Không ai sửa một dòng lệnh nào. Chỉ có một bài đo hiệu năng đang chạy suốt đêm. RAM của tiến trình bò từ 145 GiB lên 183. Tác giả gọi mức phình đó là gần 40 GiB.

Buồn cười nhất là người chạy bài đo đó còn chẳng đi tìm lỗi. Anh ấy đang ngồi so mấy bộ cấp phát bộ nhớ xem cái nào nhanh hơn. Đi tìm A, vấp phải B, và thứ anh ấy vấp phải nằm trong ruột MySQL đã mấy chục năm nay. MySQL không hề rò bộ nhớ. Nó biết rõ mình đang giữ, và nó chọn không trả.

Nghi phạm đầu tiên ai cũng nghĩ tới là rò bộ nhớ, nhưng không phải. Câu định nghĩa chuẩn nhất không nằm trên blog, mà nằm trong phiếu báo lỗi: "Máy chủ biết rõ vùng nhớ đó, nó chỉ chọn không trả lại." Không con trỏ nào bị mất, không ai quên dọn cả. Nghe vô lý đúng không?

Muốn hiểu câu đó thì phải tách ba tầng mà anh em hay gộp làm một:

* **Tầng 1:** Code MySQL ra lệnh giải phóng.
* **Tầng 2:** Bộ cấp phát nhận lệnh rồi cất cùm nhớ vào kho riêng của nó để lần sau xài lại.
* **Tầng 3:** Nhân hệ điều hành. Lượng RAM nó ghi nhận chỉ tụt xuống khi tầng 2 chịu nhả ra.

Dân vận hành MySQL gặp ca này là đổ ngay cho tầng 2, nghi thư viện cấp phát của hệ thống, rồi khuyên đổi sang cái khác. Lời khuyên đó đúng ở rất nhiều ca. Năm 2019, chính Percona xử một vụ y như vậy: Vùng nhớ của phần tìm kiếm toàn văn phình tới 80 MB rồi vỡ vụn. Điều tra xong họ kết luận không phải rò, đổi bộ cấp phát là ăn thật.

Lần này thì không. Trong phiếu báo lỗi, tác giả gạch thẳng tầng 2 ra khỏi danh sách nghi phạm. Đổi sang bộ nào cũng vậy, tốc độ phình xấp xỉ nhau. Cái mẹo ai cũng rút ra đầu tiên lại là cái mẹo chắc chắn vô dụng.

Vậy là phải xuống tầng 1. Ở đó MySQL có một thứ tên là `MEM_ROOT`. Nó nói nôm na là một cái kho cấp phát dùng chung. Cách nó làm rất đơn giản: Xin một khối bộ nhớ thật to, rồi cắt nhỏ khối đó phát dần cho từng lần cần dùng. Phát bằng cách đẩy một con trỏ tiến lên, thế thôi, không trả lại từng mảnh, muốn dọn là dọn cả cụm một lần.

Vì sao MySQL chọn kiểu đó? Chú thích ngay trong mã nguồn nêu đúng hai cái lợi:

1. Cấp phát chỉ tốn vài nhịp của bộ xử lý.
2. Khỏi phải ghi sổ xem đã phát ra những mảnh nào, vì hủy cả kho là sạch hết.

Còn một lý do lịch sử nữa: Kiểu này dựng từ mấy chục năm trước, hồi thư viện cấp phát của hệ thống còn chậm và hay kẹt khóa khi nhiều luồng cùng chạy. Rồi chính chú thích đó viết luôn mặt trái, thành thật đến mức đáng khen: Không một mảnh nào được giải phóng cho tới khi cả cái kho bị xóa.

Nghe vẫn vô hại. Câu lệnh chạy xong thì kho chết theo, mọi thứ sạch sẽ. Chuyện chỉ nổ khi có một cái kho sống lâu hơn thế rất nhiều.

Đó chính là chỗ cursor bước vào. Cursor là cái tay cầm để duyệt kết quả theo từng phần thay vì nuốt hết một lúc. Cursor bắt buộc phải có kho riêng, và mã nguồn giải thích rất rõ vì sao: Nó sống vắt qua nhiều lần chạy. Anh em mở nó lần này, lấy dữ liệu lần khác, gắn vào kho của một câu lệnh thì không xong, vì câu lệnh xong là kho chết mất.

Kho riêng đó chỉ được dọn sạch lúc cursor bị xóa, mà cursor thì sống bằng vòng đời của câu lệnh sinh ra nó. Với thủ tục lưu sẵn trong máy chủ, câu lệnh bên trong được giữ lại theo kết nối. Anh em thấy chuyện đã đi về đâu chưa?

Thế đóng cursor thì sao? Anh em đóng tử tế rồi mà! Cái kho có hai hàm dọn: Một hàm trả sạch về hệ thống, còn hàm kia giữ lại một khối, thường là khối lớn nhất, cho lần sau xài luôn.

Lệnh đóng cursor gọi hàm thứ hai. Chọn vậy không phải vì ẩu. Cursor mở đóng liên tục, giữ sẵn một khối thì lần sau khỏi đi xin lại từ đầu. Còn thứ được nhét vào kho là gì? Là phần mô tả của bảng kết quả. Cursor kiểu này ghi kết quả vào một bảng tạm, nên tên cơ sở dữ liệu và tên bảng thật phải được chép lại, không thì mất.

Phiếu báo lỗi tóm gọn trong đúng một câu: Mỗi lần cấp phát lại giữ nguyên cùng một mớ mô tả, lặp đi lặp lại. Tới đây phải nói cho thật chuẩn: Đóng cursor có dọn thật, chỉ là dọn không sạch, thứ tích lại nằm ở chỗ khác.

Theo đo đạc của chính Percona, đống bộ nhớ này đọng trên một cái kho có vòng đời bằng cả kết nối, và nó chỉ được trả về lúc kết nối đóng lại. Nghĩa là anh em đóng cursor thử cỡ nào cũng không chạm tới đống đó. Nó không nằm trong nhịp mở đóng của cursor, nó nằm trong vòng đời của kết nối.

Số liệu khớp đúng chỗ đó. Ở một lần chạy với bộ đệm 8 GB, riêng khung hàm chép mô tả này ăn khoảng 8,7 GB. Con số đó là 94,3% toàn bộ phần phân bộ nhớ tăng thêm, mà lúc mới khởi động cả máy chủ chỉ xin khoảng 9 GB.

Nói cách khác, riêng đường chép mô tả đã gần bằng toàn bộ dấu chân ban đầu của máy chủ. Vì sao một bài đo hiệu năng bình thường lại chạm trúng chỗ này? Vì bộ công cụ đo chạy kịch bản cho MySQL bằng thủ tục lưu sẵn. Đó là mặc định ghi trong file cấu hình của nó. Và trong đám thủ tục đó có cursor thật: Giao dịch thanh toán khai một cursor kéo về 14 cột bảng customer.

Một tải mức thấp mở rồi đóng cursor liên tục suốt 16 tiếng trên một kết nối không bao giờ đóng. Tới đây phải nói rõ một chỗ, không thì thành điêu. Percona mới chỉ nói vấn đề nằm ở phần cursor không chịu giải phóng mô tả, chưa công bố chi tiết hơn. Phiếu báo lỗi còn chưa qua vòng phân loại đầu tiên, chưa một bình luận nào, ô phiên bản sửa vẫn để trống.

Và đừng ai vội đi nâng cấp. Bản mới hơn cũng phình, chỉ chậm hơn. Và tác giả nói thẳng là đồ thị chưa có dấu hiệu nằm ngang. Vậy chữa thế nào? Có ba đường người ta hay thử, và chỉ hai đường đi tới đâu đó.

* **Đường 1:** Cứ 1 triệu giao dịch thì đóng kết nối rồi nối lại. Bộ nhớ được trả về sạch, hiệu năng chỉ giảm nhẹ. Nhưng nếu anh em chọn bản rẻ hơn là đặt lại kết nối thay vì đóng hẳn, thì phải biết nó xóa những gì. Nó hủy giao dịch đang mở, xóa sạch bảng tạm, trả biến của phiên về giá trị chung, và nhả hết khóa đang giữ. Application nào đặt bảng mã một lần đầu phiên rồi quên đi sẽ hỏng âm thầm.
* **Đường 2:** Đổi bộ cấp phát, thì nói rồi, không ăn.
* **Đường 3:** Chèn nửa miligiây nghỉ sau vài giao dịch, hết sập.

Nửa miligiây, vì sao ít vậy mà ăn? Tác giả ghi rõ sập chỉ xảy ra đều đặn khi có đủ hai thứ cùng lúc: Kết nối không bao giờ đóng, và câu lệnh chạy hết tốc lực không một khoảng nghỉ. Thí nghiệm cho thấy phá vỡ vế nào cũng đủ. Rồi anh ấy viết thêm một câu đáng đọc hai lần: "Bình thường thì xử lý ở phía ứng dụng đã tự tạo ra những khoảng nghỉ đó rồi, chẳng cần ai cố ý chèn vào."

Nghĩa là thứ giết chết MySQL ở đây không phải một câu lệnh xấu. Nó là một tải quá hoàn hảo. Ứng dụng thật có tầng web, có đóng gói dữ liệu, có mạng, có người dùng bấm chuột. Chừng ấy thứ cộng lại thừa nửa miligiây. Nhưng đừng vội đọc thành "khỏi lo". Việc chạy nền, luồng nạp dữ liệu, hay thợ đọc hàng đợi rồi gọi thủ tục trong vòng lập chặt, mấy thứ đó giống bài đo hơn là giống ứng dụng web.

Công bằng mà nói, ý tưởng cái kho dùng chung không sai, và MySQL không phải kẻ ngốc duy nhất ở đây. Postgres cũng dùng kiểu kho y hệt và cũng giữ lại một khối mỗi lần dọn. Khác biệt nằm ở ba chỗ:

1. Kho của Postgres luôn có mức trần cho kích thước khối (mặc định 8 MB).
2. Postgres cho trả lại từng mảnh.
3. Các kho xếp thành cây cha con, xóa cha là sạch con.

Họ còn viết hẳn vào tài liệu thiết kế luật chỉ cho phép trỏ vào một cái kho sống lâu hơn giao dịch ở vài đoạn mã cực kỳ khoanh vùng. Vì làm bừa là chuốc lấy rò bộ nhớ vĩnh viễn. Họ không thông minh hơn đâu, họ đã trả giá đủ để phải viết luật đó ra bằng chữ.

Phía Postgres cũng có hóa đơn riêng. Mỗi kết nối của họ là một tiến trình riêng, nên ngắt kết nối là hệ điều hành thu hồi sạch. Đổi lại, tạo kết nối đắt hơn hẳn. MySQL chọn một luồng cho mỗi kết nối, rẻ hơn nhiều, rồi trả giá đúng ở chỗ này.

Chốt lại một câu cho anh em mang về: Khi bộ nhớ của MySQL chỉ có một chiều đi lên, câu hỏi đầu tiên không phải "ai quên dọn?" mà là **"kho nào đang bị buộc vào một vòng đời dài hơn nó đáng có?"**

---

**Câu hỏi thảo luận:**
Connection pool bên anh em đang cho một kết nối sống tối đa bao lâu? Và con số đó chọn dựa trên cái gì: 30 phút, không đặt, hay theo nhịp deploy?
Phút thứ 8 của buổi phỏng vấn. Người đối diện xoay tờ giấy, vẽ đúng hai cái hộp. Một hộp ghi là kho ảnh, một hộp ghi là bảng dữ liệu.

Rồi ông ấy hỏi: *"Ảnh người dùng tải lên, bạn lưu vào đâu?"*

Nghe nhẹ như một câu chào, nó là câu mở màn quen thuộc nhất khi người ta tuyển kỹ sư hệ thống.

Bạn vừa trả lời trong đầu rồi, giữ nguyên câu đó. Vì câu đó đúng, và nó vẫn chưa đủ để bạn được nhận.

---

Ứng viên trả lời gọn: *"Để ngoài, vào kho file riêng. Trong bảng chỉ giữ một đường dẫn."*

Đây là câu trả lời đúng, không có gì phải bàn.

Người phỏng vấn gật đầu, không nhìn cả cuốn sổ, ghi đúng một dòng ngắn: **"Giữ đường dẫn"**, rồi ông ấy không chuyển sang câu khác.

Vì cái ông ấy cần không phải chỗ bạn để ảnh. Cả internet đều khuyên để ra ngoài. Ông ấy cần biết bạn đã chạy thật cái mình vừa khuyên hay chỉ mới đọc được nó.

---

Ông ấy hỏi tiếp, giọng vẫn nhẹ: *"Nếu để thẳng ảnh vào trong bảng thì tốn cỡ nào?"*

Nghe như hỏi cho có. Nó là chỗ đo bạn đã vận hành thật hay chưa.

Giả sử có 1 triệu tấm ảnh, mỗi tấm 200 KB. Cộng lại là 200 GB nằm ngay trong bảng dữ liệu. Con số đó chưa làm ai sợ.

* **Chỗ đau tới lúc sao lưu:** Mỗi lần chạy bản đầy đủ, máy phải đọc lại trọn 200 GB đó, kể cả khi cả tuần không tấm ảnh nào đổi.
* **Chỗ đau kín hơn:** Vùng nhớ đệm của database vốn để giữ index giờ bị ảnh chiếm, truy vấn không dính tới ảnh cũng chậm theo.

---

Ứng viên gật, thấy mình ghi điểm. Rồi ông ấy hỏi câu thứ hai:

*"Ghi file xong mà transaction hỏng giữa chừng, quay đầu, thì file đó đi đâu?"*

Nó không đi đâu cả. Nó nằm lại. Vì ổ đĩa và database không chung một transaction. Bảng quay đầu sạch sẽ, còn file thì ở lại luôn.

Hai chiều lệch không bằng nhau:

* **File thừa (File mồ côi):** Chỉ tốn tiền lưu trữ.
* **Ảnh vỡ (Dòng trỏ vào file đã mất):** Người dùng mở lên thấy một ô vỡ giữa trang.

Hai loại rác không bằng nhau. Chọn loại rác rẻ hơn: **Ghi file TRƯỚC, ghi dòng SAU, không xóa trong luồng xin.**

$0{,}1\%$ lượt hỏng trên 100.000 lượt mỗi ngày là **36.500 file rác mỗi năm**.

---

Nhìn lại hai câu đã hỏi, đúng thứ tự:

1. Để trong bảng thì tốn cỡ nào?
2. Ghi file xong thì file đi đâu?

Thứ tự không ngẫu nhiên. Two câu đó không hỏi bạn biết gì, chúng hỏi bạn đi được tới đâu.

Câu đầu ai cũng trả lời được, và đúng. Nó không dùng để loại ai, nó dùng để xem bạn dừng lại đó hay bạn đi tiếp một bước nữa.

Không hỏi bạn để ảnh ở đâu. Hỏi bạn biết nó rò ở đâu.

Câu trả lời sai không làm bạn trượt, dừng quá sớm thì có.

---

### 📋 Câu trả lời 30 giây:

* **Ảnh để NGOÀI**, bảng chỉ giữ đường dẫn.
* **Trong bảng:** 1 triệu ảnh = 200 GB, sao lưu nào cũng đọc lại trọn.
* **Ngoài bảng:** Two kho KHÔNG chung transaction.
* **Ghi file trước, ghi dòng sau, không xóa trong luồng xin:** Chịu file mồ côi, đừng nhận ảnh vỡ.

---

Còn hệ thống của bạn đang dọn file mồ côi bằng cách nào? Viết xuống bình luận nhé!
**Transcript Video: Cơ chế Deadlock trong Database & Cách khắc phục**

---

**[00:00 - 00:28] Sự cố Deadlock**
Chiều thứ Sáu, hai lệnh chuyển tiền chạy cùng lúc. An chuyển cho Bình, Bình chuyển cho An. Hai câu lệnh bình thường, chạy hàng nghìn lần mỗi ngày mà chưa hỏng bao giờ.

Rồi cả hai đứng im, không báo lỗi, không chậm, chỉ là không nhúc nhích. 40 miligiây sau, một trong hai bị hủy, để lại một dòng trong log mà chưa ai đọc kỹ.

Dòng đó viết: *"Phát hiện khóa xoắn nhau, hãy chạy lại giao dịch."* Người trực đọc xong nghĩ ngay: *"Mình vừa làm hỏng cái gì?"*

Không, bạn không làm hỏng gì cả. Cái vừa xảy ra không phải lỗi, nó là một cơ chế cứu hộ vừa chạy đúng như thiết kế: **Deadlock!**

---

**[00:42 - 01:03] Bản chất của khóa dòng (Row Lock)**
Hôm nay tôi mổ nó ra. Vì sao hai câu lệnh hoàn toàn đúng lại kẹt cứng vào nhau, và vì sao cái cách sửa mà ai cũng nghĩ tới lại không sửa được gì.

Phải hiểu cái khóa trước. Khi bạn sửa một dòng trong giao dịch, Database khóa dòng đó lại. Không phải cả bảng, chỉ một dòng, giữ tới lúc bạn xác nhận. Ai đụng vào dòng đang bị khóa thì phải đứng đợi. Chuyện đó hoàn toàn bình thường, xảy ra suốt ngày và không ai gọi đó là sự cố, đợi một chút rồi tới lượt mình.

---

**[01:03 - 01:17] Điều kiện ngầm khiến hàng đợi bị kẹt**
Nhưng xếp hàng chỉ chạy được khi hàng có điểm cuối. Phải có một người ở đầu hàng đang thật sự làm việc, xong rồi nhả khóa cho người sau. Đó là điều kiện ngầm không ai nói ra và cũng không ai kiểm.

Còn nếu hàng không có điểm cuối? Nếu người đầu hàng cũng đang đợi một người khác, mà người đó lại đang đợi chính anh ta? Lúc đó cái hàng không còn là một cái hàng nữa.

---

**[01:17 - 02:08] Diễn biến va chạm giữa hai lệnh**
Quay lại đúng hai lệnh chuyển tiền lúc nãy. Lệnh thứ nhất sửa tài khoản của An trước, rồi mới sửa tài khoản của Bình, nó khóa dòng của An lại ngay khi vừa chạm vào. Lệnh thứ hai thì đi ngược lại, nó sửa tài khoản của Bình trước, nên nó khóa dòng của Bình lại. Tới đây vẫn chưa có gì sai cả, hai lệnh đang chạy song song rất đẹp.

Rồi cả hai đi tiếp một bước. Lệnh 1 xin khóa dòng của Bình, mà dòng đó đang nằm trong tay Lệnh 2. Lệnh 2 xin dòng của An, và dòng đó nằm trong tay Lệnh 1. Mỗi bên xin thứ bên kia đang giữ.

Không bên nào chịu nhả ra cả. Nhả khóa nghĩa là bỏ hết phần việc vừa làm, mà không bên nào được phép làm thế giữa chừng. Nên cả hai cùng đợi và cứ thế đợi mãi.

Hình dễ hiểu nhất là hai người ngồi ở hai đầu một cái bàn ăn, giữa bàn chỉ có hai chiếc đũa. Mỗi người nhanh tay cầm lấy một chiếc, rồi cùng xòe tay xin chiếc còn lại. Không ai chịu buông chiếc mình đang cầm, vì buông ra là mất phần. Thành ra không ai ăn được miếng nào, và họ sẽ cứ ngồi đó tới sáng nếu không có ai bước vào can thiệp.

Đây là chỗ phải nói cho rõ: Kẹt vừa xảy ra không phải là chậm. Chậm thì tự nó qua, còn cái này **không bao giờ tự qua**, dù bạn có đợi tới sáng mai.

---

**[02:08 - 02:59] Cơ chế tự gỡ Deadlock của Database**
Vậy Database làm gì với chuyện đó? Câu trả lời làm nhiều người bất ngờ lần đầu, vì nó ngược hẳn với trực giác: Nó không hề cố ngăn cho chuyện này đừng xảy ra.

Nó để cho chuyện đó xảy ra rồi mới gỡ. Bên trong máy có một bộ dò, cứ mỗi lần có ai phải đứng đợi là nó vẽ lại một tấm sơ đồ: Ai đang đợi ai. Tấm sơ đồ đó chỉ cần trả lời đúng một câu: *Có đường nào đi vòng về lại chỗ xuất phát không?* Có vòng tròn nghĩa là có kẹt, không cần đợi thêm giây nào để chắc chắn.

Thấy vòng tròn là nó chọn ngay một bên cho dừng lại, rồi cuộn ngược bên đó về như chưa từng chạy. Bên bị chọn thường là bên đã đổi ít dòng nhất, vì cuộn nó lại rẻ hơn.

Con số ở đây đáng nhớ: Nếu không có bộ dò, hai lệnh kia sẽ đứng nguyên **50 giây** (đúng bằng mức chờ mặc định của MySQL) rồi mới có bên bỏ cuộc.

50 giây một lệnh so với vài miligiây khi có bộ dò. Nghĩa là dòng lỗi bạn thấy trong log không phải chỗ hỏng, nó là chỗ máy vừa **tiết kiệm cho bạn 50 giây**.

Nên hãy đọc lại dòng log đó bằng một con mắt khác: Nó không nói hệ thống của bạn đang vỡ, nó nói hai việc vừa kẹt vào nhau và **máy thì đã tự gỡ xong rồi**.

---

**[02:59 - 03:50] Bản chất vấn đề: Số lượng vs Thứ tự khóa**
Vậy thì sửa thế nào cho hết chuyện này? Gần như ai cũng nghĩ tới cùng một câu: Khóa ít lại, giao dịch ngắn lại. Nghe rất hợp lý và thật ra nó không hề sai.

Chỉ có điều nó không chạm được vào cái gốc. Giao dịch ngắn lại thì khoảng thời gian hai bên va vào nhau hẹp đi, nên chuyện kẹt hiếm hơn hẳn. Nhưng hiếm hơn không phải là hết.

**Gốc của chuyện này nằm ở THỨ TỰ, chứ không nằm ở số lượng.** Hai lệnh kẹt vào nhau không phải vì chúng khóa quá nhiều dòng, mà vì chúng đi gắp khóa theo hai thứ tự ngược nhau.

Quay lại hai người ngồi ở bàn ăn lúc nãy. Bây giờ ra đúng một luật cho cả hai người: *Ai cũng phải cầm chiếc đũa bên trái trước, rồi mới được với sang chiếc bên phải.* Lập tức mọi thứ chạy được: Một người cầm được cả hai chiếc, ăn xong đặt xuống, người kia đợi một chút rồi tới lượt. Không ai kẹt mà cũng chẳng ai phải buông ra.

Áp vào code thì cũng vẫn đúng một luật đó: Trong một giao dịch chạm nhiều dòng, **hãy sắp xếp các dòng đó theo một thứ tự cố định trước khi sửa** (thường là theo mã/ID tăng dần). Nghe thì nhỏ mà đổi hẳn kết quả: Khóa bao nhiêu dòng cũng được, miễn là mọi người cùng gắp theo đúng một thứ tự. Còn ngược thứ tự thì khóa ít tới đâu vẫn cứ kẹt.

---

**[03:50 - 04:27] Kẹt khóa ngay cả trên một câu lệnh duy nhất (UPDATE IN)**
Tới đây bạn sẽ nghĩ: Vậy chỉ cần đừng mở giao dịch dài là xong? Một câu lệnh sửa duy nhất (`UPDATE ... WHERE id IN (...)`), chạy một phát là hết, thì làm sao kẹt được?

**Kẹt được!** Một câu sửa duy nhất, không mở giao dịch nào cả, vẫn kẹt vào nhau như thường! Và lý do thì nằm ở chỗ rất ít người nghĩ tới: One single query chạm nhiều dòng vẫn **khóa từng dòng một, lần lượt chứ không cùng lúc**. Thứ tự nó đi qua các dòng không phải thứ tự bạn viết trong câu lệnh!

Thứ tự đó do máy tự chọn lúc chạy, tùy nó dùng mục lục nào, quét xuôi hay ngược. Two câu giống hệt nhau vẫn có thể đi theo two đường khác nhau.

Nghĩa là trong hệ thống của bạn luôn có một thứ tự bạn không hề viết ra, không nhìn thấy, mà vẫn phải chịu trách nhiệm.

Quay lại two lệnh đầu video: Cho cả two sắp tài khoản theo mã tăng dần trước khi sửa, thì cả two chạy xong, không lệnh nào phải dừng.

---

**[04:27 - End] 3 Dòng đáng nhớ**

1. **Kẹt khóa không phải chậm, nó KHÔNG TỰ QUA.**
2. **Dòng lỗi trong log là MÁY GỠ XONG, không phải hệ thống vỡ.**
3. **Cách sửa là THỐNG NHẤT THỨ TỰ gắp khóa, không phải khóa ít đi.** Và sẵn sàng chạy lại (Retry) cả giao dịch, vì sẽ có một bên cho dừng.

Còn hệ thống của bạn thì đang kẹt khóa ở chỗ nào, và bạn đã sắp thứ tự chưa? Viết xuống phần bình luận, tôi đọc hết!
**Transcript Video: Chiến Lược Sao Lưu Database (RPO & Disaster Recovery)**

---

**[00:00 - 00:26] Đặt vấn đề**
Trong phòng vấn, người đối diện lật sang trang mới, hỏi một câu nghe rất hiền lành. Tôi đã xem câu này đánh trượt nhiều người giỏi, và lần nào cũng trượt ở đúng một chỗ:

> *"Bạn sao lưu database thế nào?"*

Năm chữ không có bẫy nào trong câu chữ cả. Bẫy nằm ở chỗ bạn dừng lại ngay sau khi trả lời xong.

---

**[00:38 - 01:26] Tầng 1: RPO (Recovery Point Objective) – Mất bao nhiêu dữ liệu?**
Câu trả lời quen thuộc nhất:

> *"Mỗi đêm 2 giờ sáng chạy một lệnh xuất cả database ra file, đẩy lên kho lưu trữ, giữ 7 bản gần nhất."*

Không sai một chữ nào cả. Đây đúng là thứ đang chạy ở phần lớn công ty và nó đã cứu rất nhiều người. Cây bút bên kia bàn ghi lại.

Rồi kết thúc dừng, người phỏng vấn không hỏi bạn dùng công cụ gì nữa. Họ hỏi một câu nghe như hỏi vu vơ, nhưng nó đo đúng thứ bạn chưa từng phải trả:

> *"Giả sử ổ đĩa chết lúc 1 giờ chiều thứ Ba, bạn phục hồi từ bản sao lưu gần nhất. Bạn vừa mất bao nhiêu dữ liệu?"*

Bản gần nhất chạy lúc 2 giờ sáng, từ 2 giờ sáng tới 1 giờ chiều là 11 tiếng. 11 tiếng đó không nằm ở đâu cả. Một sàn nhỏ chạy 2.000 đơn mỗi ngày thì 11 tiếng là khoảng 900 đơn. Đó không phải 900 dòng, mà là 900 khách đã trả tiền!

Khoảng trống đó có một cái tên, người ta gọi nó là **RPO (Recovery Point Objective)**, tức lượng dữ liệu chấp nhận mất. Bạn không chọn công cụ trước, bạn chọn con số này trước!

---

**[01:27 - 01:51] Tầng 2: Replica có thay thế được Backup không?**
Câu thứ hai:

> *"Hệ thống của bạn đã có một bản sao (Replica) chạy song song, đồng bộ liên tục. Vậy còn cần bản sao lưu (Backup) để làm gì nữa?"*

Đây là chỗ nhiều người gật đầu quá nhanh. Replica chép mọi thứ máy chính ghi xuống. Bạn gõ nhầm một câu xóa (`DELETE`), nó chép luôn câu xóa đó. Trong khoảng 200ms, nhanh hơn cả thời gian bạn kịp nhận ra mình vừa gõ gì, cả hai bản cùng sạch trơn cùng một lúc!

Nên hai thứ đó chống hai tai nạn khác nhau:

* **Bản sao song song (Replica):** Chống chết máy.
* **Bản sao lưu (Backup):** Chống hỏng / mất dữ liệu.

Cái này không thể thay thế được cái kia!

---

**[01:51 - 02:09] Bản chất câu hỏi phỏng vấn**
Nhìn lại hai câu đã hỏi, đúng thứ tự:

1. Mất bao nhiêu?
2. Replica đủ chưa?

Không câu nào hỏi tên công cụ. Cả hai đều hỏi bạn đã tính tới đâu. Họ không hỏi bạn biết gì, họ hỏi **bạn đã mất gì**. Người từng ngồi phục hồi lúc 3 giờ sáng luôn trả lời bằng một con số, vì họ đã bấm giờ thật!

---

**[02:09 - End] Câu trả lời 30 giây chuẩn Senior**

> 1. Mỗi đêm một bản đầy đủ, cộng nhật ký ghi (WAL/Binlog) liên tục.
> 2. Nên mất tối đa vài phút, không phải 11 tiếng.
> 3. Replica để máy chết vẫn chạy, không thay được sao lưu.
> 4. Mỗi quý phục hồi thử một lần, có bấm giờ.
> 
> 

**Lần gần nhất bạn phục hồi thử là bao giờ?**

Trong phòng phỏng vấn, người đối diện lật sang trang mới, hỏi một câu nghe rất hiền lành. Tôi đã xem câu này đánh trượt nhiều người giỏi, và lần nào cũng trượt ở cùng một chỗ:

> *"Dùng khoá ngoại có làm chậm không?"*

7 chữ, không từ nào khó. Bạn trả lời được ngay, tôi biết. Vấn đề là câu trả lời đúng vẫn chưa cứu được bạn.

Bạn vừa trả lời trong đầu rồi, giữ nguyên câu đó. Lát nữa ta quay lại chấm điểm chính câu đó bằng hai câu hỏi mà người phỏng vấn thật sẽ hỏi tiếp: **Khoá ngoại**.

---

Ứng viên trả lời: *"Có chậm, vì mỗi lần thêm một dòng con, database phải kiểm tra xem dòng cha có tồn tại thật không."*

Đúng, hoàn toàn đúng, không sai chữ nào.

Người phỏng vấn gật đầu, không khen, không chê, chỉ ghi một dòng vào sổ rồi hỏi tiếp. Đó là lúc bạn nên lo, chứ không phải lúc họ nói bạn sai.

Câu trả lời đó dừng ở mức định nghĩa. Nó đúng, nhưng chưa cho người phỏng vấn biết bạn đã chạm vào cái giá thật hay chưa. Nên họ hỏi tiếp, và câu tiếp mới là câu thật.

---

**Câu hỏi thứ nhất, rất ngắn:** *"Chậm bao nhiêu?"*

Không phải chậm hay không, mà là bao nhiêu phần trăm. Không có con số thì bạn chưa từng đo.

Thêm một dòng vào bảng con, database làm thêm đúng một việc: Nó tra khoá chính của bảng cha xem dòng đó có thật không. Một lần đi cây 3 đến 4 bước nhảy.

Tra khoá chính là thao tác rẻ nhất mà database có. Đo trên bảng vài triệu dòng, thêm khoá ngoại làm lệnh ghi chậm thêm khoảng 5 tới 10%. Rẻ hơn bạn tưởng nhiều.

Nên nếu chỉ xét lệnh thêm dòng, câu trả lời là có chậm, chậm không đáng kể. Người phỏng vấn ghi con số đó vào sổ.

---

**Rồi hỏi câu thứ hai, và đây là chỗ mọi thứ đổi chiều:**

> *"Thế còn xoá một dòng ở bảng cha thì sao?"*

Vẫn 5% chứ? Người phỏng vấn dừng bút.

Đây là chỗ gần như ai cũng trượt.

Postgres tự tạo index cho khoá chính, tự tạo cho ràng buộc duy nhất, nhưng cho khoá ngoại thì không, không một cái nào.

Nên khi bạn xoá một dòng cha, database phải chắc chắn không còn dòng con nào trỏ tới nó. Không có index thì nó chỉ còn một cách: **quét sạch bảng con**.

Bảng con 10 triệu dòng, xoá một dòng cha mất 4 giây thay vì 3 miligiây.

Đánh một index lên cột khoá ngoại là xong, và gần như không ai nhớ làm việc đó.

---

Nhìn lại hai câu vừa rồi: *"Chậm bao nhiêu?"* và *"Xoá dòng cha thì sao?"*. Two câu đó không phải hai câu hỏi, nó là một câu hỏi bị tách làm đôi:

> *"Dùng khoá ngoại có làm chậm không, chậm ở thao tác nào?"*

Thêm dòng con và xoá dòng cha chênh nhau hơn 1.000 lần, và câu hỏi không hề nói rõ.

Họ không đo bạn biết bao nhiêu, họ đo xem bạn có hỏi lại không. Câu hỏi thiếu dữ kiện, người giỏi nhận ra và hỏi ngược lại trước khi trả lời một chữ nào.

---

Quay lại câu bạn tự trả lời lúc nãy. Nếu câu đó là Có hoặc Không, thì nó chưa sai, nó chỉ chưa hỏi lại.

### 📋 Mẫu câu trả lời 30 giây:

1. Chậm ở thao tác nào ạ?
2. Nếu là thêm dòng con thì tốn thêm một lần tra khoá chính, khoảng 5 đến 10%, tôi chấp nhận cái giá đó.
3. Xoá dòng cha mà thiếu index là quét cả bảng.
4. Nên tôi kiểm cột khoá ngoại có index chưa.

Bạn từng bị dính chưa? Kể tôi nghe ở phần bình luận.
Kế toán gọi xuống hỏi ba số đơn hàng biến đi đâu.
Sổ ghi 42, 43 rồi nhảy thẳng sang 47.
Không ai xóa đơn nào, hệ thống cũng không báo lỗi.

**"Bạn sinh mã đơn hàng thế nào?"**
7 chữ, câu hỏi dễ nhất buổi hôm đó.
Bạn trả lời được trong 3 giây, tôi biết, và đó đúng là chỗ bạn sắp trượt.

---

Bạn vừa trả lời trong đầu rồi, giữ nguyên câu đó.
Lát nữa ta chấm lại, chấm bằng hai câu hỏi mà người phỏng vấn thật sẽ hỏi tiếp: **Mã đơn hàng**.

Ứng viên trả lời: *"Em để database tự sinh số. Mỗi đơn một số tăng dần, không bao giờ trùng."*
Đúng, đó là cách gần như mọi hệ thống đang chạy, và nó chạy tốt nhiều năm.

Người phỏng vấn gật đầu, ghi một dòng vào sổ, rồi hỏi tiếp.
Họ không nói đúng, cũng không nói sai.
Đó mới là lúc đáng lo, chứ không phải lúc bị chê.

Nhưng câu hỏi tiếp theo không nói về database nữa.
Nó nói về kế toán, và đó là chỗ mọi thứ gãy, vì kế toán đếm số theo một luật khác hẳn.

---

**Câu hỏi thứ nhất, và nó không còn là câu hỏi kỹ thuật nữa:**

> *"Kế toán bảo mã đơn phải liên tục, không được nhảy số nào cả. Bạn nhận lời được không?"*

Câu trả lời là **KHÔNG**. Bộ đếm của database nhả số ra ngoài giao dịch.
Nó phải thế, vì bắt hai người xin số cùng lúc chờ nhau thì cả hệ thống đứng lại.
Nên khi một đơn bị hủy giữa chừng, số đã lấy không quay về, nó mất luôn.

Một sàn có 3% đơn rớt do không thanh toán, tức mỗi 100 số, 3 cái lỗ.
Cái lỗ đó không phải lỗi, nó là hóa đơn bạn trả cho việc hai đơn không phải xếp hàng sau nhau.
Bỏ lỗ đi là phải trả lại đúng cái vừa mua.

---

**Câu hỏi thứ hai, lần này người phỏng vấn hỏi rất nhẹ nhàng:**

> *"Sếp vẫn bắt mã phải liên tục, không nhân nhượng gì cả. Giờ bạn làm thế nào?"*

Làm được. Bạn tự nuôi một bảng đếm.
Mỗi lần tạo đơn thì cộng 1 vào đúng dòng đó, trong cùng một giao dịch với đơn hàng.
Hủy đơn, số cũng lùi về.

Nhưng dòng đó bị khóa từ lúc cộng cho tới lúc đơn hàng ghi xong.
Mọi đơn khác đứng chờ ngay sau nó.
Một đơn ghi hết 40 miligiây, **trần là 25 đơn một giây**.

25 đơn một giây, dù bạn thêm bao nhiêu máy chủ đi nữa.
Đó là đánh đổi thật: **Mã liên tục hoặc Bán được nhiều đơn cùng lúc - chọn một, không có cả hai.**

---

Giờ nhìn lại hai câu vừa rồi.
Không câu nào hỏi bạn biết làm gì.
Cả hai đều đưa cho bạn một yêu cầu của người khác, rồi xem bạn nhận hay từ chối.

Người trả lời *"Dạ được"* ngay là người sẽ gật đầu với mọi yêu cầu.
Rồi 3 tháng sau mới thấy hệ thống không gánh nổi.
Lúc đó thì muộn, đã có người đặt hàng rồi.

Nên thứ họ đo không phải bạn làm được gì.
Họ đo bạn có dám nói không — **Yêu cầu nghiệp vụ vs Trần đồng thời**.
Nói không đúng lúc cũng là một kỹ năng kỹ thuật.

---

Quay lại câu bạn tự trả lời lúc nãy.
Nếu câu đó dừng ở tên một cái hàm, thì nó chưa sai, nó chỉ chưa nói giá.

### 📋 Câu trả lời 30 giây chuẩn Senior:

1. Mã có cần liên tục không ạ?
2. Nếu không, em để bộ đếm sẵn có làm, chịu số có lỗ, đổi lại không đơn nào phải chờ đơn nào.
3. Nếu có, em dùng bảng đếm trong cùng giao dịch.
4. Và em báo trước, trần khoảng 25 đơn một giây.
Transcript Video: Vụ Án Truy Vấn Báo Cáo Tháng Chạy 40 Giây (work_mem)[00:00 - 00:38] Hiện trường vụ án: 0.2 giây trên Dev vs 40 giây trên Prod9:05 sáng thứ Hai, ai đó bấm nút xem "Báo cáo tháng". Vòng quay chạy, chạy mãi. 40 giây sau, trang trả về lỗi hết giờ chờ.Hôm qua, chính trang đó trả kết quả trong 200 ms. Không ai sửa gì, không ai triển khai gì. Dữ liệu vẫn đúng 10 triệu dòng như tuần trước.Một bạn dev mở máy mình lên, chép y nguyên câu lệnh đó chạy thử: 0,2 giây. Cùng câu lệnh, cùng chừng ấy dữ liệu, chênh nhau 200 lần!Đây là vụ án tôi thích nhất. Vì mọi bằng chứng đều nằm ngay trước mắt từ phút đầu tiên, và gần như ai cũng đọc sai một mẩu trong số đó.[00:38 - 01:30] Bảng điều tra: Thu thập 4 mẩu bằng chứngTrước khi đoán, ta thu bằng chứng (4 mẩu) ghim lên bảng, chưa suy luận gì cả:Mẩu 1 (BC1): Cùng 10 triệu dòng $\rightarrow$ Máy Dev: 0,2s | Production: 40s (Triệu chứng, không phải nguyên nhân).Mẩu 2 (BC2): Chạy EXPLAIN ở cả hai bên rồi đặt cạnh nhau $\rightarrow$ Giống hệt nhau (Cùng đọc Index, cùng thứ tự ghép bảng, cùng ước lượng số dòng).Mẩu 3 (BC3): Lúc câu lệnh đang chạy, CPU của Production chỉ 12%, nhưng đèn đĩa thì sáng liên tục, lượng đọc/ghi vọt lên gấp mấy chục lần.Mẩu 4 (BC4): Trong bảng cấu hình của Production có dòng work_mem = 4MB. Cả đội nhìn thấy gật gù rồi bỏ qua vì bảo: "Mặc định mà!".[01:30 - 02:23] Loại trừ Nghi phạm 1: Phần cứng Production bị yếu?Giả thiết A: Phần cứng Production yếu hơn? Máy Dev là máy trạm ổ SSD, Production là máy ảo dùng chung.Thực nghiệm: Chạy bài đo tốc độ đĩa (fio) trên cả hai máy:Production: Đọc tuần tự 480 MB/s.Dev: 150 MB/s.$\rightarrow$ Production nhanh hơn gấp 3 lần!Kiểm tra CPU: CPU Prod chỉ 12%. Nếu máy yếu thì CPU phải kịch trần hoặc bị tranh chấp.$\rightarrow$ Gạch tên Nghi phạm 1 (Phần cứng yếu). Chậm không đồng nghĩa với yếu![02:23 - 03:16] Loại trừ Nghi phạm 2: Thống kê bị cũ (Stale Statistics)?Giả thiết B: Thống kê của bảng đã cũ nên bộ tối ưu chọn nhầm đường (Lỗi kinh điển).Thực nghiệm: Kiểm tra last_analyze trong pg_stat_user_tables:Dev: 09:12 | Prod: 09:15 (Cập nhật cách nhau 3 phút, thống kê không hề cũ).Lý do loại trừ chắc chắn: Nhìn lại Mẩu 2 (BC2): Hai bản EXPLAIN giống hệt nhau từng dòng! Nếu bộ tối ưu chọn nhầm đường thì kế hoạch chạy (EXPLAIN) phải khác nhau (ví dụ: một bên Seq Scan, một bên Index Scan).$\rightarrow$ Gạch tên Nghi phạm 2 (Thống kê cũ).[03:16 - 04:08] Loại trừ Nghi phạm 3: Có ai đang giữ khóa (Lock Conflict)?Giả thiết C: 9:00 sáng thứ Hai cả công ty vào làm, có ai đó đang giữ khóa bảng?Thực nghiệm:Soi bảng pg_locks: SELECT * FROM pg_locks WHERE NOT granted; $\rightarrow$ Kết quả bằng 0 (Không ai chờ khóa).Test lúc 3:00 sáng: Không ai online, máy rảnh rỗi $\rightarrow$ Chạy lại câu lệnh vẫn tốn đúng 40 giây!Bài học: Chờ khóa thì thời gian sẽ nhảy loạn theo tải, còn ở đây nó đứng im phăng phắc ở 40 giây. Phẳng lì nghĩa là không phải khóa!$\rightarrow$ Gạch tên Nghi phạm 3 (Chờ khóa).[04:08 - 05:04] Lật lại Mẩu 2 & Mẩu 4: Tìm ra thủ phạm thực sự (work_mem)Cả 3 nghi phạm dễ đoán đã bị loại. Giờ nhìn lại mẩu thứ 2 mà ta đọc sai ngay từ đầu:Ta đọc EXPLAIN giống nhau $\rightarrow$ tưởng cách chạy giống nhau $\rightarrow$ SAI!EXPLAIN chỉ in ra Kế hoạch (định đi đường nào), không in ra Cái giá / Chi phí thực tế. Muốn thấy cái giá, phải chạy EXPLAIN ANALYZE (Chạy thật, đo thật).Kết quả EXPLAIN ANALYZE:Chỉ có ĐÚNG MỘT DÒNG khác nhau ở bước Sắp xếp (ORDER BY):Máy Dev: Sort Method: quicksort Memory: 82MB (Sắp xếp hoàn toàn trong RAM).Production: Sort Method: external merge Disk: 340MB (Sắp xếp tràn ra đĩa!).Cơ chế vỡ trận:Câu lệnh cần 340 MB RAM để sắp xếp 10 triệu dòng.Cấu hình Production (Mẩu BC4): work_mem = 4MB.Database không báo lỗi, nó lặng lẽ xé nhỏ 340 MB dữ liệu, ghi ra các File tạm trên đĩa rồi gộp/trộn lại (External Merge Sort).Đèn đĩa sáng liên tục, CPU ngồi chơi (12%) vì mải chờ đĩa I/O chép file!Vì sao máy Dev chạy 0.2s? Vì máy Dev được cài work_mem = 256MB nên xếp thẳng trong RAM![05:04 - 05:55] Bản vá & Cạm bẫy khi tăng work_memBản vá chuẩn (Chỉ nâng trong phiên chạy báo cáo):SQLSET LOCAL work_mem = '512MB';
SELECT ... ORDER BY doanh_thu;
Kết quả: Thời gian rớt từ 40 giây xuống còn 1,8 giây! Dòng "trộn ngoài đĩa" biến mất.⚠️ CẠM BẪY NGUY HIỂM:Đừng dại nâng work_mem = 512MB trong file cấu hình chung (postgresql.conf)!work_mem không phải hạn mức chung cho cả máy chủ, mà là hạn mức cho MỖI THAO TÁC SẮP XẾP / HASH trong MỖI PHIÊN.Một câu lệnh có 4 chỗ sắp xếp, 50 phiên chạy cùng lúc:$$4 \times 50 \times 512\text{ MB} = \mathbf{100\text{ GB RAM}!}$$Cả server sẽ ăn quả OOM (Out Of Memory) Sập toàn bộ Database!Quy tắc: Giữ work_mem mặc định nhỏ (4MB - 16MB), chỉ nâng SET LOCAL work_mem ở đúng phiên/role chạy báo cáo nặng.[05:55 - End] Chi tiết đáng giá 30 giây để bắt bệnh lần sauBật tính năng ghi nhật ký file tạm trong Postgres (Bật 1 lần dùng mãi):Ini, TOMLlog_temp_files = 0
Mỗi khi có câu lệnh nào hết RAM phải xả file tạm ra đĩa, Postgres sẽ lập tức ghi 1 dòng log kèm số byte bị tràn.Log im lặng: Đi tìm chỗ khác (Chờ khóa, CPU, Index...).Log tràn file tạm: Đi tìm chỗ sắp xếp (work_mem) ngay lập tức!

Dưới đây là transcript đầy đủ và chính xác 100% toàn bộ nội dung audio/video của bạn:

---

## Transcript Video: Kiến Trúc Thiết Kế Hệ Thống Lưu Trữ Số Dư / Tiền Trong Mạng Xã Hội & Livestream

**[00:00 - 00:30] Đặt vấn đề: Hai con số đứng cạnh nhau, hai tiêu chuẩn hoàn toàn ngược lại**

Buổi live đó thu về bao nhiêu? Sáng nay cả mạng hỏi đúng câu này. 2,1 triệu người xem cùng lúc, quà bắn lên kín màn hình. Nhưng không ai nói được con số. Tôi không biết, bạn cũng không biết, nền tảng thì không nói.

Nhưng có một chỗ bắt buộc phải biết, chính xác tới từng đồng, biết ngay trong lúc phiên live còn đang chạy.

Cạnh con số tiền đó còn một con số khác: số người đang xem. Con số người xem sai vài phần trăm thì không ai nói gì. Còn con số tiền, sai một đồng là ra tòa.

Hai con số nằm cạnh nhau, cùng một màn hình, cùng một hệ thống. Vậy mà chuẩn đúng của chúng ngược hẳn nhau. Vì sao?

---

**[00:30 - 01:21] Tầng 1: "Ô Số Dư" (Balance Column) – Thiết kế ngây thơ và 3 vết nứt**

Con số tiền không được phép sai, không bao giờ. Và cách hệ thống giữ cho số đúng khác hẳn cách nó đếm người xem.

Bắt đầu từ thứ nhỏ nhất: một người bấm tặng một món quà. Phía sau, đó là một dòng chữ chạy vào máy chủ. Nó nói ai vừa gửi cho ai món gì, đáng bao nhiêu. Bây giờ máy chủ phải nhớ chuyện đó.

Cách đầu tiên ai cũng nghĩ ra là cộng thẳng vào một ô tổng của người nhận. Đây cũng là cách được viết nhiều nhất. Trong bảng người dùng có một cột tên là `so_du`. Mỗi lượt quà chạy vào, máy mở đúng dòng của người nhận, lấy số cũ cộng thêm, rồi ghi đè lại là xong:

```sql
UPDATE users SET so_du = so_du + 500 WHERE id = 42;

```

Một dòng lệnh chạy trong một phần nghìn giây, bảng lúc nào cũng có sẵn con số cần hiển thị, nghe không có gì sai. **Nó chỉ sai khi đông người.**

#### 3 vết nứt tử huyệt của Ô Số Dư:

1. **Hàng Nóng (Row Locking / Contention):** Giả sử sân khấu đang có 2 triệu người, mỗi giây có 2.000 lượt tặng. 2.000 lệnh đó không xếp hàng lịch sự, chúng lao vào đúng một chỗ, cùng một dòng, cùng một ô. Máy phải khóa dòng đó lại cho từng lệnh, cộng xong mới nhả ra. Lệnh cuối cùng đứng chờ gần 2.000 lệnh trước nó. Ô đó nóng lên, và cả sân khấu chậm theo.
2. **Cộng trùng do Retry (Idempotency Violation):** Người tặng đang dùng mạng di động, lệnh gửi đi rồi mà máy chủ không kịp trả lời, điện thoại thấy im liền gửi lại lần nữa. Máy chủ nhận hai lệnh giống hệt nhau và cộng hai lần. Người tặng mất tiền 1 lần, người nhận được cộng 2 lần. Không có lỗi nào hiện ra vì cả hai lệnh đều hợp lệ.
3. **Mất Dấu Vết (Audit Trail Loss):** Sáng hôm sau có người nhắn: *"Tôi tặng 5 lần mà chỉ thấy 4."* Bạn mở bảng ra, trong ô đó chỉ có đúng một con số. Nó không nhớ nó đã cộng những gì, không có gì để đối soát.

> **Chốt Tầng 1:** Ô số dư giữ KẾT QUẢ, nhưng vứt sạch QUÁ TRÌNH. Mà tiền thì không ai cãi nhau về kết quả, người ta cãi nhau về quá trình!

---

**[01:21 - 02:58] Tầng 2: "Sổ Cái" (Ledger / Immutable Append-Only Log)**

Kế toán loài người giải xong bài này từ 600 năm trước. Họ không giữ một con số tổng, họ giữ một cuốn sổ. Mỗi việc xảy ra là một dòng mới.

Đưa cách đó vào máy thì thành một bảng riêng (`so_cai`). Mỗi lượt tặng là một dòng ghi thêm vào cuối:

```sql
INSERT INTO so_cai (tu, den, so_tien, luc) 
VALUES (user_842, kenh_A, 500, NOW());

```

Dòng đã ghi thì không bao giờ sửa. **Không còn `UPDATE`, chỉ có `INSERT`.**

#### Sổ Cái giải quyết triệt để 3 vấn đề:

* **Không còn chờ nhau:** Không còn ai sửa chung một dòng nữa. 2.000 lượt một giây là 2.000 dòng mới rơi vào 2.000 chỗ khác nhau.
* **Chống cộng trùng (Idempotence):** Mỗi lượt tặng mang sẵn một mã riêng (`idempotency_key`) do máy của người tặng sinh ra. Mã đó là khóa duy nhất của bảng. Lệnh gửi lại lần hai bị chặn ngay từ cửa.
* **Truy nguyên từng lượt:** Lọc theo người tặng, 5 dòng hiện ra kèm giây phút của từng lượt. Bạn trả lời khách hàng bằng dữ liệu thật chứ không phải bằng lời hứa.

> **Chốt Tầng 2:** Bảng không còn lưu *"bạn đang có bao nhiêu"*, nó lưu *"chuyện gì đã xảy ra"*. Số dư thôi làm dữ liệu, nó thành KẾT QUẢ của một phép cộng:
> $\text{so\_du} = \sum(\text{dong})$

---

**[02:58 - 03:44] Tầng 3: "Chốt Sổ" (Checkpointing / Snapshotting)**

Nhưng đổi được thứ này thì mất thứ kia. Trước đây muốn biết tổng thì đọc một ô. Bây giờ muốn biết tổng thì phải cộng cả cuốn sổ lại từ dòng đầu tiên!

Một phiên live đông có thể để lại vài chục triệu dòng. Mỗi lần chủ kênh mở ứng dụng ra xem, máy quét từng đó dòng rồi cộng. Mở 10 lần là quét 10 lượt.

Kế toán ngoài đời cũng gặp đúng bài này, và họ **Chốt Sổ**.

Cuối kỳ ghi thêm một dòng: *"Tới đây tổng = 8.400"*. Từ dòng đó trở đi, phần sổ cũ không phải đọc lại nữa.

Máy làm y hệt: cứ vài phút nó ghi một dòng chốt, giữ tổng tiền tới thời điểm ấy.

* **Tổng bây giờ = Dòng chốt gần nhất + Phần đuôi mới phát sinh.**

Phần đuôi đó thường chỉ vài nghìn dòng thay vì vài chục triệu dòng. Cùng một cuốn sổ, cùng một phép cộng, nhưng số dòng phải đọc rớt xuống **cả nghìn lần**!

Dòng chốt không phải bản gốc. Nghi ngờ nó thì cộng lại từ đầu sổ vẫn ra đúng con số cũ. Chốt sổ chỉ là đường tắt, sự thật vẫn nằm ở từng dòng!

---

**[03:44 - End] Bản chất hệ thống: Hai con số, một sự thật**

Vậy con số tổng nhảy liên tục trên màn hình phiên live, nó đọc từ cuốn sổ đó ra à?

**KHÔNG!** Nó không chạm vào cuốn sổ cái, không một lần nào trong cả phiên live.

Nó là một bộ đếm để riêng, cộng tạm trong bộ nhớ, làm tròn và trễ vài giây so với sự thật. Đúng cái kiểu ước lượng mà con số người xem đang dùng.

Và như thế mới là đúng chứ không phải sai. Bắt mỗi lượt quà phải cộng đúng con số đang hiển thị cho 2 triệu người thì thứ vỡ trước tiên chính là phiên live!

Nên cùng một hệ thống nuôi **hai con số cho cùng một thứ**:

1. **Con số cho mắt người xem:** Nhanh, được phép sai (Ước lượng).
2. **Con số cho sổ cái:** Chậm, không được sai (Chính xác tuyệt đối).

---

### 📋 Mẫu câu trả lời chuẩn Senior khi đi phỏng vấn:

Lần tới khi có người hỏi *"Lưu số dư kiểu gì?"*, đừng trả lời ngay. Hỏi ngược lại một câu đã:

> **"Ai sẽ đọc con số này? Sai bao nhiêu thì họ kiện?"**

* **Nếu đọc cho UI/Livestream:** Dùng bộ đếm ước lượng (Cache / In-memory counter).
* **Nếu đọc cho ví/tiền/kế toán:** Dùng **Sổ Cái (Ghi thêm) + Chốt Sổ định kỳ**.

Nếu hệ thống của bạn đang giữ tiền trong một ô số dư, kể tôi nghe bạn đối soát bằng gì ở phần bình luận nhé!
Dưới đây là transcript đầy đủ và chính xác 100% nội dung audio/video của bạn:

---

## Transcript Video: Kiến Trúc Xử Lý 40.000 Bình Luận/Giây Trong Phiên Livestream 2,1 Triệu Người Xem

**[00:00 - 00:30] Đặt vấn đề: Sự thật về dòng bình luận "Chốt đơn" của bạn**
2,1 triệu người trong một phiên live. Cột bình luận bên phải màn hình chạy như thác. Chữ trôi nhanh tới mức mắt bạn không bấm kịp một dòng nào, không một dòng.

Bạn gõ hai chữ *"chốt đơn"*, bấm gửi. Dòng chữ của bạn hiện lên ngay giữa dòng thác đó. Bạn thấy nó, nó có thật, nó ở ngay đó. Và bạn tin rằng 2,1 triệu người vừa nhìn thấy nó.

Đây là chỗ tôi phải nói thật với bạn: **Rất có thể không một ai thấy dòng đó cả, không một ai!**

Không phải lỗi, không phải mạng, đó là thiết kế và nó cố ý như vậy. Hôm nay tôi mở cái thiết kế đó ra. 40.000 bình luận một giây, bạn thấy bao nhiêu: **Nhân $\rightarrow$ Phễu $\rightarrow$ Vọng**.

---

**[00:30 - 01:00] Hành trình của một dòng chữ: Mơ hồ từ Máy chủ**
Ta thử đi theo đúng một dòng chữ: Nó rời máy bạn, bay tới máy chủ $\rightarrow$ xong phần dễ.

Giờ máy chủ phải làm gì với nó? Đây mới là phần khó. It phải đưa dòng đó lên màn hình của mọi người đang xem, không phải gửi một lần. Là **2.100.000 bản sao** cho đúng một dòng chữ (một dòng, 2,1 triệu lần).

Mà bạn không phải người duy nhất đang gõ, cả phòng cùng gõ. Nên phép nhân này chạy cả hai chiều cùng lúc: Nhiều người gửi, nhiều người nhận.

Ba cửa dòng chữ của bạn phải qua để sống hay chết: **Cửa Nhân**, **Cửa Phễu**, và **Cửa Vọng**.

---

**[01:00 - 01:43] Cửa 1: Cửa Nhân – Con số 84 tỷ bản sao vô nghĩa**
Một phiên live cỡ này, lúc cao trào, mỗi giây có chừng **40.000 dòng bình luận** được gửi lên. 40.000 trong 1 giây!

Mỗi dòng trong số đó, nếu muốn ai cũng thấy, phải nhân lên 2.100.000 lần. Giờ nhân hai con số đó với nhau, bạn thử nhẩm xem:


$$\text{40.000 dòng/s} \times \text{2.100.000 màn hình} = \mathbf{84.000.000.000\text{ bản sao/s}!}$$

84 tỷ bản sao chữ mỗi giây cho đúng một phòng live. Con số này không phải lớn, nó **vô nghĩa**, không đọc nổi!

Để bạn dễ hình dung: Cả thế giới hiện có 8 tỷ người. Con số kia gấp 10 lần dân số Trái Đất, và nó lặp lại mỗi giây trong một phòng live! Không hạ tầng nào trên đời gánh nổi phép nhân đó.

Nhưng đây mới là chỗ hay: **Cũng không ai cần nó cả.**

---

**[01:43 - 02:24] Cửa 2: Cửa Phễu – Bỏ bớt để tồn tại & 2,1 triệu cột bình luận khác nhau**
Phép nhân vỡ ngay trên giấy, nên máy chủ không đi theo đường đó. Nó chọn: Trong 40.000 dòng của 1 giây, nó **chỉ giữ lại vài chục dòng** để phát đi. Số còn lại bị bỏ ngay tại chỗ, bỏ hẳn: không lưu, không phát!

Hình dung một cái phễu: Miệng phễu hứng 40.000 dòng, cổ phễu chỉ cho lọt qua vài chục. Phần không lọt dừng ở đó.

#### Các luật ưu tiên qua phễu:

* Người vừa tặng quà được ưu tiên.
* Người được chủ phòng nhắc tên.
* Người mới vào room.
* Còn lại thì **bốc ngẫu nhiên**.

Vì bốc ngẫu nhiên, mỗi người xem được bốc một mẻ riêng. **Two người ngồi cạnh nhau đang đọc hai cột chữ khác hẳn nhau.**

> **Sự thật:** Không tồn tại một "cột bình luận chính thức" nào của phiên live đó. Có 2,1 triệu cột khác nhau, không cột nào đầy đủ, kể cả cột trên máy của chủ phòng!

---

**[02:24 - 03:05] Cửa 3: Cửa Vọng – Mẹo UI "Tiếng vọng tại chỗ" (Optimistic UI)**
Cổ phễu cắt bỏ gần hết, vậy vì sao dòng chữ của bạn vẫn hiện lên? Đó là **Cửa Vọng**.

Bấm gửi xong, dòng chữ hiện lên tức thì, 0 giây chờ. Nhanh hơn cả tốc độ tới máy chủ, nhanh hơn cả ánh sáng đi hết quãng đường đó.

Vì nó **chưa tới máy chủ**! Máy của bạn tự vẽ nó lên màn hình ngay lúc ngón tay rời nút gửi, rồi mới lo gửi đi sau (Vẽ trước, gửi sau).

Người ta gọi đó là **Tiếng vọng tại chỗ (Optimistic UI Updates)**. Máy bạn đoán trước rằng dòng chữ sẽ được nhận, nên nó vẽ ra trước cho bạn xem. Nó đoán, và phần lớn thời gian nó đoán đúng.

Nếu cái phễu ở trên loại dòng của bạn thì màn hình của bạn có đổi gì không? **Không, không đổi một chút nào!** Bạn vẫn thấy chữ mình nằm đó giữa dòng thác, nhưng nó chỉ nằm trên đúng **1 trong 2.100.000 màn hình** — màn hình của chính bạn!

---

**[03:05 - 03:41] Trải nghiệm người dùng: Sinh lý học Mắt người vs Hạ tầng**
Nghe tới đây thấy bực, cứ như bị lừa? Vậy ta thử gỡ hết mấy mẹo đó ra, làm công bằng tuyệt đối: Ai gõ gì cũng tới tất cả mọi người.

Giả sử hạ tầng vô địch gánh nổi 84 tỷ bản sao/s, không bỏ dòng nào. Ta được gì?

* Màn hình điện thoại chứa được chừng **12 dòng chữ**.
* 40.000 dòng/s $\rightarrow$ Cả màn hình bị thay mới trong **0,0003 giây**!
* Mắt người cần khoảng **200 ms** để đọc xong 1 dòng (chậm hơn tốc độ kia 1.000 lần).
* Kết quả: Bạn sẽ **không đọc được bất kỳ chữ nào cả!**

Con số làm sập hạ tầng (40.000 dòng/s) cũng chính là con số làm màn hình thành vô dụng. Bỏ bớt chữ không phải là cắt xém, đó là **điều kiện bắt buộc để con người còn đọc được**.

---

**[03:41 - End] Lời khuyên cho bài toán thiết kế Room tương tác lớn**

Dòng "chốt đơn" của bạn có thật, tới máy chủ thật, chỉ là nó phải xếp hàng với 40.000 dòng khác qua một cổ phễu hẹp.

Want chắc chắn được thấy trong các phòng live/chat đông?

* **Đừng làm phòng to hơn.**
* **Hãy làm phòng nhỏ lại!**

Phễu hẹp vì phòng quá đông chứ không phải vì bạn gõ dở. Trong một phòng nhỏ, ai nói cũng có người nghe!

---

**Câu hỏi tương tác:**
Bạn từng bình luận trong phiên live cả triệu người chưa? Có ai từng trả lời bình luận của bạn không? Kể cho mình nghe ở phần bình luận nhé!