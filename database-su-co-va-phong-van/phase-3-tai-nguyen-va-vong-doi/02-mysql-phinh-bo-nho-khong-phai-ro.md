# Bài 14: MySQL phình bộ nhớ mà không hề rò

Bộ diệt tiến trình của hệ điều hành (OOM killer) vừa bắn hạ MySQL. Máy chủ **187 GiB RAM**. Chạy êm suốt nhiều tiếng rồi chết.

Không ai deploy gì. Không ai sửa một dòng lệnh nào. Chỉ có một **bài đo hiệu năng** đang chạy suốt đêm. RSS của tiến trình bò từ khoảng **80 GB lên hơn 180 GB** trong 20 giờ.

Buồn cười nhất là **người chạy bài đo đó còn chẳng đi tìm lỗi**. Anh ấy đang ngồi so mấy bộ cấp phát bộ nhớ xem cái nào nhanh hơn. Đi tìm A, vấp phải B — và thứ anh ấy vấp phải nằm trong ruột MySQL đã mấy chục năm nay.

> **MySQL không hề rò bộ nhớ. Nó biết rõ mình đang giữ, và nó CHỌN KHÔNG TRẢ.**

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **RSS** (Resident Set Size) | Lượng RAM thật mà hệ điều hành ghi nhận một tiến trình đang chiếm | Con số bạn thấy ở cột MEM trong `top` |
| **OOM Killer** | Cơ chế của Linux: hết RAM thì bắn hạ tiến trình ngốn nhiều nhất | Hết chỗ, bảo vệ mời người to nhất ra ngoài |
| **Rò bộ nhớ** (memory leak) | Cấp phát rồi **mất con trỏ**, không ai còn cách nào giải phóng | Để quên chìa khoá tủ — tủ đó vĩnh viễn không mở được |
| **Bộ cấp phát** (allocator) | Thư viện quản lý việc xin/trả bộ nhớ: `malloc`, `jemalloc`, `tcmalloc` | Người thủ kho phát và thu hồi chỗ |
| **Arena / Pool allocator** | Xin **một khối to**, rồi cắt nhỏ phát dần bằng cách đẩy một con trỏ tiến lên | Mua nguyên cuộn giấy, cắt dần từng tờ |
| **`MEM_ROOT`** | Tên gọi của arena trong mã nguồn MySQL | Cái kho cấp phát dùng chung của MySQL |
| **Cursor** | Tay cầm để duyệt kết quả **theo từng phần** thay vì nuốt hết một lúc | Cái kẹp đánh dấu trang, đọc tới đâu nhớ tới đó |
| **Stored Procedure** | Thủ tục lưu sẵn trong máy chủ database, gọi bằng `CALL` | Công thức nấu ăn cất sẵn trong bếp |
| **Vòng đời** (lifetime) | Khoảng thời gian một vùng nhớ tồn tại trước khi bị dọn | Hạn dùng |
| **Bảng tạm** (temporary table) | Bảng máy chủ tự tạo để chứa kết quả trung gian | Tờ nháp |

## Nghi phạm đầu tiên ai cũng nghĩ tới — và vì sao nó sai

Thấy bộ nhớ chỉ đi một chiều lên, phản xạ đầu tiên là: **rò bộ nhớ**.

Nhưng không phải. Câu định nghĩa chuẩn nhất không nằm trên blog nào, nó nằm trong chính phiếu báo lỗi:

> *Máy chủ **biết rõ** vùng nhớ đó. Nó chỉ **chọn không trả lại**.*

Không con trỏ nào bị mất. Không ai quên dọn cả. Nghe vô lý đúng không?

Muốn hiểu câu đó thì phải **tách ba tầng mà mọi người hay gộp làm một**:

```text
   ┌─ TẦNG 1 ─ MÃ NGUỒN MySQL ────────────────────────────────────┐
   │  Code gọi lệnh giải phóng vùng nhớ.                           │
   │  "Tôi không cần chỗ này nữa."                                 │
   └───────────────────────────┬──────────────────────────────────┘
                               ▼
   ┌─ TẦNG 2 ─ BỘ CẤP PHÁT (malloc / jemalloc / tcmalloc) ────────┐
   │  Nhận lệnh, rồi CẤT CỤM NHỚ VÀO KHO RIÊNG CỦA NÓ             │
   │  để lần sau xài lại — thay vì trả về cho hệ điều hành.        │
   │  (Trả về rồi xin lại rất đắt.)                                │
   └───────────────────────────┬──────────────────────────────────┘
                               ▼
   ┌─ TẦNG 3 ─ NHÂN HỆ ĐIỀU HÀNH ─────────────────────────────────┐
   │  Con số RSS bạn nhìn thấy CHỈ TỤT XUỐNG khi tầng 2 chịu nhả.  │
   └──────────────────────────────────────────────────────────────┘
```

Dân vận hành MySQL gặp ca này thường **đổ ngay cho tầng 2**, nghi thư viện cấp phát của hệ thống, rồi khuyên đổi sang cái khác.

**Lời khuyên đó đúng ở rất nhiều ca.** Năm 2019, chính Percona xử một vụ y như vậy: vùng nhớ của phần tìm kiếm toàn văn phình tới 80 MB rồi vỡ vụn (phân mảnh). Điều tra xong họ kết luận không phải rò, và **đổi bộ cấp phát là ăn thật**.

**Lần này thì không.** Trong phiếu báo lỗi, tác giả **gạch thẳng tầng 2 ra khỏi danh sách nghi phạm**: đổi sang bộ cấp phát nào cũng vậy, tốc độ phình xấp xỉ nhau.

> Cái mẹo ai cũng rút ra đầu tiên lại là cái mẹo **chắc chắn vô dụng** ở đây.

## Xuống tầng 1: `MEM_ROOT` là gì

Ở tầng 1, MySQL có một thứ tên là **`MEM_ROOT`** — nói nôm na là **một cái kho cấp phát dùng chung**.

Cách nó làm rất đơn giản:

```text
   ① Xin hệ thống MỘT KHỐI BỘ NHỚ THẬT TO (ví dụ 64 KB).
   ② Cắt nhỏ khối đó, phát dần cho từng lần cần dùng.
      Phát bằng cách ĐẨY MỘT CON TRỎ TIẾN LÊN. Thế thôi.
   ③ Hết khối thì xin khối mới, nối vào danh sách.

   ┌──────────────────── khối 64 KB ─────────────────────┐
   │ [dùng][dùng][dùng][dùng]▓ còn trống ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
   │                        ↑                             │
   │                    con trỏ: lần sau phát từ đây      │
   └──────────────────────────────────────────────────────┘

   KHÔNG trả lại từng mảnh.
   Muốn dọn là DỌN CẢ CỤM MỘT LẦN.
```

### Vì sao MySQL chọn kiểu đó?

Chú thích ngay trong mã nguồn nêu đúng hai cái lợi:

```text
   ① Cấp phát chỉ tốn VÀI NHỊP của bộ xử lý.
      (So với malloc thường: tìm khối vừa, cập nhật sổ sách, có thể phải khoá)

   ② KHỎI PHẢI GHI SỔ xem đã phát ra những mảnh nào,
      vì huỷ cả kho là sạch hết.
```

Còn một lý do lịch sử nữa: kiểu này được dựng từ mấy chục năm trước, hồi thư viện cấp phát của hệ thống còn chậm và hay kẹt khoá khi nhiều luồng cùng chạy.

Và rồi chính chú thích đó **viết luôn mặt trái, thành thật đến mức đáng khen**:

> *Không một mảnh nào được giải phóng cho tới khi **cả cái kho** bị xoá.*

Nghe vẫn vô hại. Câu lệnh chạy xong thì kho chết theo, mọi thứ sạch sẽ.

**Chuyện chỉ nổ khi có một cái kho sống lâu hơn thế rất nhiều.**

## Cursor bước vào

Cursor là **cái tay cầm để duyệt kết quả theo từng phần** thay vì nuốt hết một lúc. Ví dụ trong một thủ tục lưu sẵn:

```sql
DECLARE con_tro CURSOR FOR
    SELECT ho_ten, dia_chi, sdt, /* ...14 cột... */ FROM khach_hang WHERE id = p_id;

OPEN con_tro;
FETCH con_tro INTO v_ho_ten, v_dia_chi, v_sdt, /* ... */;
CLOSE con_tro;
```

**Cursor bắt buộc phải có kho riêng**, và mã nguồn giải thích rất rõ vì sao:

```text
   Cursor SỐNG VẮT QUA NHIỀU LẦN CHẠY.
   Bạn OPEN nó lần này, FETCH dữ liệu lần khác.

   → Gắn vào kho của một câu lệnh thì không xong,
     vì câu lệnh xong là kho chết mất, và cursor mất theo.
```

Kho riêng đó chỉ được dọn sạch **lúc cursor bị xoá**. Mà cursor thì sống bằng vòng đời của **câu lệnh sinh ra nó**. Và với thủ tục lưu sẵn, **câu lệnh bên trong được giữ lại theo kết nối** để lần gọi sau khỏi phải dịch lại.

Bạn thấy chuyện đã đi về đâu chưa:

```text
   Kết nối (sống hàng giờ / vĩnh viễn)
      └─ Thủ tục được cache theo kết nối
            └─ Câu lệnh bên trong được giữ lại
                  └─ Cursor
                        └─ MEM_ROOT của cursor  ← TÍCH LŨY Ở ĐÂY
```

## "Thế đóng cursor thì sao? Tôi đóng tử tế rồi mà!"

Đây là chỗ tinh vi nhất.

Cái kho `MEM_ROOT` có **hai hàm dọn**:

```text
   Hàm A:  trả SẠCH mọi khối về hệ thống.
   Hàm B:  GIỮ LẠI MỘT KHỐI — thường là khối lớn nhất — cho lần sau xài luôn.
```

**Lệnh đóng cursor gọi hàm B.**

Và chọn vậy **không phải vì ẩu**: cursor được mở/đóng liên tục trong thủ tục, giữ sẵn một khối thì lần sau khỏi đi xin lại từ đầu. Đây là tối ưu hợp lý — trong một vòng đời ngắn.

### Vậy thứ được nhét vào kho là gì?

Là **phần mô tả của bảng kết quả** (result set metadata).

Cursor kiểu này ghi kết quả vào một **bảng tạm**, nên tên cơ sở dữ liệu và tên bảng thật phải được **chép lại** — nếu không, khi bảng tạm bị dọn thì thông tin đó mất.

Phiếu báo lỗi tóm gọn trong đúng một câu:

> *Mỗi lần cấp phát lại **giữ nguyên cùng một mớ mô tả**, lặp đi lặp lại.*

Nói cho thật chuẩn — và đây là chỗ nhiều bài viết nói quá lên: **đóng cursor CÓ dọn thật, chỉ là dọn không sạch.** Thứ tích lại nằm ở chỗ khác:

```text
   Theo đo đạc của Percona, đống bộ nhớ này đọng trên MỘT CÁI KHO
   CÓ VÒNG ĐỜI BẰNG CẢ KẾT NỐI, và nó chỉ được trả về
   LÚC KẾT NỐI ĐÓNG LẠI.

   → Bạn đóng cursor thử cỡ nào cũng KHÔNG CHẠM TỚI đống đó.
   → Nó không nằm trong nhịp mở/đóng của cursor.
     Nó nằm trong VÒNG ĐỜI CỦA KẾT NỐI.
```

### Số liệu khớp đúng chỗ đó

```text
   Máy chủ 187 GiB RAM, đo trong 20 giờ:

   RSS:  ~80 GB  →  hơn 180 GB     (tăng hơn 100 GB → OOM)

   Phân tích phần bộ nhớ TĂNG THÊM:
     Materialized_cursor::send_result_set_metadata   87.831 MB  →  94,3%
     Query_result_materialize::start_execution        5.311 MB  →   5,7%
                                                      ────────
     Gốc rễ: MEM_ROOT::Alloc / AllocBlock / ForceNewBlock
             tích luỹ trong thao tác cursor của thủ tục lưu sẵn.
```

**Riêng đường chép mô tả bảng kết quả đã chiếm 94,3% toàn bộ phần bộ nhớ tăng thêm.**

## Vì sao một bài đo hiệu năng bình thường lại chạm trúng chỗ này?

Vì bộ công cụ đo chạy kịch bản cho MySQL **bằng thủ tục lưu sẵn** — đó là mặc định ghi trong file cấu hình của nó. Và trong đám thủ tục đó **có cursor thật**: giao dịch thanh toán khai một cursor kéo về 14 cột của bảng khách hàng.

```text
   Một tải mức THẤP, mở rồi đóng cursor liên tục suốt 20 tiếng,
   trên một KẾT NỐI KHÔNG BAO GIỜ ĐÓNG.
```

Không có câu lệnh nào xấu. Không có index nào thiếu. Không có gì để "tối ưu".

### Trạng thái của phiếu báo lỗi — nói cho đủ

Tới đây phải nói rõ một chỗ, không thì thành điêu:

```text
   • Percona mới chỉ nói vấn đề nằm ở phần cursor không chịu giải phóng
     mô tả, CHƯA công bố chi tiết hơn.
   • Phiếu báo lỗi (PS-11472) còn chưa qua vòng phân loại đầu tiên.
   • Ô "phiên bản đã sửa" vẫn để trống.
   • Bản mới hơn CŨNG PHÌNH, chỉ chậm hơn.
   • Tác giả nói thẳng: đồ thị CHƯA CÓ DẤU HIỆU NẰM NGANG.
```

**Đừng ai vội đi nâng cấp để chữa cái này.**

## Ba đường chữa, và chỉ hai đường đi tới đâu đó

### Đường 1 — Giới hạn vòng đời kết nối ✓

```text
   Cứ 1 TRIỆU giao dịch thì ĐÓNG KẾT NỐI rồi nối lại.
   → Bộ nhớ được trả về sạch. Hiệu năng chỉ giảm nhẹ.
```

Đây là cách chữa hiệu quả nhất, và may mắn thay nó là thứ mọi connection pool đều làm sẵn:

```properties
# HikariCP — thay mới kết nối định kỳ
maxLifetime=1800000        # 30 phút

# Hoặc theo số lần dùng, nếu thư viện của bạn hỗ trợ
```

Nhưng nếu bạn chọn **bản rẻ hơn** là *đặt lại kết nối* (`COM_RESET_CONNECTION`) thay vì đóng hẳn, thì **phải biết nó xoá những gì**:

```text
   Lệnh đặt lại kết nối sẽ:
      ✗ HUỶ giao dịch đang mở
      ✗ XOÁ SẠCH bảng tạm
      ✗ TRẢ biến của phiên về giá trị chung
      ✗ NHẢ HẾT khoá đang giữ
      ✗ Xoá prepared statement

   → Ứng dụng nào đặt bảng mã (charset), múi giờ, hay search_path
     MỘT LẦN ĐẦU PHIÊN rồi quên đi sẽ HỎNG ÂM THẦM.
```

Đây đúng là họ lỗi mà PgBouncer chế độ transaction cũng gây ra ([Bài 13](01-cat-bot-ket-noi-de-chay-nhanh-hon.md)) — cùng một nguyên nhân gốc: **trạng thái gắn vào phiên mà phiên thì không bền như bạn tưởng.**

### Đường 2 — Đổi bộ cấp phát ✗

Không ăn. Đã nói ở trên: mọi bộ cấp phát đều phình xấp xỉ nhau, vì vấn đề nằm ở tầng 1 chứ không phải tầng 2.

### Đường 3 — Chèn khoảng nghỉ nửa mili-giây ✓

```text
   Chèn 0,5 mili-giây nghỉ sau vài giao dịch  →  HẾT SẬP.
```

Nửa mili-giây, vì sao ít vậy mà ăn?

Tác giả ghi rõ: sập chỉ xảy ra **đều đặn** khi có **đủ hai thứ cùng lúc**:

```text
   ① Kết nối KHÔNG BAO GIỜ ĐÓNG
   ② Câu lệnh chạy HẾT TỐC LỰC, KHÔNG MỘT KHOẢNG NGHỈ

   Thí nghiệm cho thấy PHÁ VỠ VẾ NÀO CŨNG ĐỦ.
```

Rồi anh ấy viết thêm một câu đáng đọc hai lần:

> *"Bình thường thì xử lý ở phía ứng dụng đã tự tạo ra những khoảng nghỉ đó rồi, chẳng cần ai cố ý chèn vào."*

### Nghĩa là thứ giết chết MySQL ở đây không phải một câu lệnh xấu — nó là một tải QUÁ HOÀN HẢO

```text
   Ứng dụng THẬT có:
      • tầng web nhận request
      • đóng gói dữ liệu thành JSON
      • độ trễ mạng
      • người dùng bấm chuột

   Chừng ấy thứ cộng lại THỪA nửa mili-giây.
```

**Nhưng đừng vội đọc thành "khỏi lo".** Có ba loại tải trong hệ của bạn giống bài đo hơn là giống ứng dụng web:

```text
   ⚠ Việc chạy nền (batch job) gọi thủ tục trong vòng lặp chặt
   ⚠ Luồng nạp dữ liệu (data loader / ETL)
   ⚠ Thợ đọc hàng đợi rồi gọi thủ tục liên tục, không nghỉ

   Ba thứ này chạy trên kết nối sống mãi, không có người dùng
   nào bấm chuột để tạo khoảng nghỉ hộ bạn.
```

## Cách tự chẩn đoán trên hệ của bạn

MySQL có sẵn công cụ đo bộ nhớ theo từng loại, nhưng phần lớn phải **bật thủ công**:

```sql
-- ① Bật đo bộ nhớ (thường tắt mặc định cho phần lớn loại)
UPDATE performance_schema.setup_instruments
   SET ENABLED = 'YES'
 WHERE NAME LIKE 'memory/%';

-- ② Xem loại nào đang giữ nhiều nhất
SELECT EVENT_NAME,
       CURRENT_NUMBER_OF_BYTES_USED / 1024 / 1024 AS dang_giu_mb,
       HIGH_NUMBER_OF_BYTES_USED    / 1024 / 1024 AS dinh_cao_mb,
       CURRENT_COUNT_USED                          AS so_lan_cap_phat
  FROM performance_schema.memory_summary_global_by_event_name
 WHERE CURRENT_NUMBER_OF_BYTES_USED > 0
 ORDER BY CURRENT_NUMBER_OF_BYTES_USED DESC
 LIMIT 20;

-- ③ Xem KẾT NỐI nào đang giữ nhiều nhất — cột quan trọng nhất
SELECT t.PROCESSLIST_ID       AS ket_noi,
       t.PROCESSLIST_USER     AS nguoi_dung,
       t.PROCESSLIST_HOST     AS may,
       t.PROCESSLIST_TIME     AS song_bao_lau_giay,
       SUM(m.CURRENT_NUMBER_OF_BYTES_USED)/1024/1024 AS dang_giu_mb
  FROM performance_schema.memory_summary_by_thread_by_event_name m
  JOIN performance_schema.threads t USING (THREAD_ID)
 GROUP BY 1,2,3,4
 ORDER BY dang_giu_mb DESC
 LIMIT 20;
```

**Dấu hiệu chẩn đoán:** một vài kết nối có `PROCESSLIST_TIME` rất lớn (sống nhiều giờ) **và** `dang_giu_mb` tăng đều theo thời gian — đó chính là bệnh trong bài này.

Và luôn dựng một cảnh báo đơn giản:

```text
   Cảnh báo khi:  RSS của mysqld  >  (innodb_buffer_pool_size × 1,3)

   Vượt xa mức đó nghĩa là có thứ gì đó ngoài buffer pool đang phình.
```

## Công bằng mà nói: PostgreSQL cũng dùng đúng kiểu kho này

Ý tưởng cái kho dùng chung **không sai**, và MySQL không phải kẻ ngốc duy nhất ở đây. PostgreSQL cũng dùng kiểu kho y hệt (gọi là `MemoryContext`) và **cũng giữ lại một khối mỗi lần dọn**.

Khác biệt nằm ở **ba chỗ**, và ba chỗ này là bài học thiết kế đáng mang đi:

```text
   ① Kho của Postgres LUÔN CÓ TRẦN cho kích thước khối
      (mặc định 8 MB). Khối không phình vô hạn.

   ② Postgres CHO TRẢ LẠI TỪNG MẢNH (pfree), không bắt phải huỷ cả kho.

   ③ Các kho XẾP THÀNH CÂY CHA CON. Xoá cha là sạch con.
      → Không thể "quên" một kho con nào đó.
```

Và họ còn viết hẳn vào tài liệu thiết kế một **luật**: chỉ cho phép trỏ vào một cái kho sống lâu hơn giao dịch **ở vài đoạn mã cực kỳ khoanh vùng** — vì làm bừa là chuốc lấy rò bộ nhớ vĩnh viễn.

> Họ không thông minh hơn đâu. **Họ đã trả giá đủ để phải viết luật đó ra bằng chữ.**

### Phía PostgreSQL cũng có hoá đơn riêng

```text
   PostgreSQL: MỘT TIẾN TRÌNH cho mỗi kết nối
      ✓ Ngắt kết nối là hệ điều hành THU HỒI SẠCH, không cãi được.
      ✗ Nhưng TẠO kết nối ĐẮT HƠN HẲN
        → nên bắt buộc phải có connection pool (Bài 13).

   MySQL: MỘT LUỒNG cho mỗi kết nối
      ✓ Tạo kết nối RẺ HƠN NHIỀU.
      ✗ Và trả giá đúng ở chỗ này: bộ nhớ tích trên luồng
        không được hệ điều hành thu hồi cho tới khi luồng chết.
```

Đây là một đánh đổi kiến trúc, không phải một cái bug. Mỗi bên trả tiền ở một chỗ khác nhau.

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Thấy bộ nhớ tăng là kết luận "rò" | Rò là **mất con trỏ**; ở đây máy chủ biết rõ mình giữ gì | Phân biệt ba tầng trước khi kết luận |
| Đổi bộ cấp phát làm phản xạ đầu tiên | Đúng ở nhiều ca khác, **vô dụng ở ca này** | Xác định tầng gây ra trước khi chọn thuốc |
| Kết nối sống vĩnh viễn | Bộ nhớ tích trên kết nối không bao giờ được trả | `maxLifetime` 30 phút, hoặc thay kết nối theo số giao dịch |
| Dùng `COM_RESET_CONNECTION` mà không kiểm | Xoá bảng mã, múi giờ, bảng tạm, khoá → hỏng âm thầm | Đặt lại mọi biến phiên sau khi reset, hoặc đóng hẳn |
| Job nền gọi thủ tục trong vòng lặp chặt | Giống bài đo hơn là giống ứng dụng web — dính đủ hai điều kiện | Chèn khoảng nghỉ, hoặc thay kết nối định kỳ |
| Không bật đo bộ nhớ trong `performance_schema` | Không có cách nào biết ai đang giữ | Bật `memory/%`, theo dõi theo từng luồng |
| Chỉ cảnh báo khi RSS gần chạm trần | Lúc đó chỉ còn vài phút trước OOM | Cảnh báo ở mốc `buffer_pool × 1,3` |
| Nâng cấp MySQL để chữa | Bản mới cũng phình, chỉ chậm hơn | Giới hạn vòng đời kết nối |
| Đặt `innodb_buffer_pool_size` bằng gần hết RAM | Không chừa chỗ cho phần bộ nhớ ngoài buffer pool | Chừa biên đủ rộng cho phần theo kết nối |

## Nguồn và kiểm chứng

- Percona, *"Stored Procedures memory consumption in Percona Server for MySQL"* — máy chủ **187 GiB DDR4**, đo trong **20 giờ** (sau 15 phút khởi động), RSS từ **~80 GB lên hơn 180 GB**.
- Phân tích phần bộ nhớ tăng thêm: `Materialized_cursor::send_result_set_metadata` **87.831 MB = 94,3%**; `Query_result_materialize::start_execution` **5.311 MB = 5,7%**. Gốc rễ là tích luỹ trong `MEM_ROOT::Alloc / AllocBlock / ForceNewBlock`.
- Phiếu lỗi: **PS-11472** (Percona Server). Hai điều kiện tái hiện: kết nối không bao giờ đóng, và câu lệnh chạy hết tốc lực không nghỉ.
- Ba cách đã thử: đóng+nối lại sau 1 triệu giao dịch (ăn, hiệu năng giảm nhẹ), chèn nghỉ **0,5 ms** (ăn), đổi bộ cấp phát (**không ăn**).

## Tóm tắt bài 14

- **Bộ nhớ tăng một chiều ≠ rò bộ nhớ.** Rò là mất con trỏ; ở đây máy chủ biết rõ mình giữ gì và **chọn không trả**.
- Phải tách **ba tầng**: mã MySQL gọi giải phóng → bộ cấp phát giữ lại trong kho riêng → nhân hệ điều hành chỉ thấy giảm khi tầng 2 nhả.
- **Đổi bộ cấp phát là phản xạ đầu tiên của mọi người, và ở ca này nó chắc chắn vô dụng** — vấn đề nằm ở tầng 1.
- **`MEM_ROOT`** là arena: xin khối to, cắt nhỏ phát dần bằng cách đẩy con trỏ. Nhanh, không phải ghi sổ — nhưng **không giải phóng mảnh nào cho tới khi cả kho bị xoá**.
- **Cursor bắt buộc có kho riêng** vì nó sống vắt qua nhiều lần chạy. Lệnh đóng cursor gọi hàm dọn **giữ lại một khối** — hợp lý cho vòng đời ngắn, thảm hoạ cho kết nối sống mãi.
- Thứ tích lại là **phần mô tả bảng kết quả**, chiếm **94,3%** phần bộ nhớ tăng thêm.
- Cần **đủ hai điều kiện** mới sập: kết nối không bao giờ đóng **và** chạy hết tốc lực không nghỉ. **Phá vế nào cũng đủ** — nửa mili-giây nghỉ là hết sập.
- Ứng dụng web tự có khoảng nghỉ. **Job nền, ETL, và thợ đọc hàng đợi thì không** — chúng giống bài đo hơn là giống web.
- PostgreSQL dùng đúng kiểu kho này nhưng có **trần kích thước khối, cho trả từng mảnh, và xếp kho thành cây cha con** — ba chỗ khác biệt đó là bài học thiết kế.
- Câu hỏi mang về: khi bộ nhớ chỉ có một chiều đi lên, đừng hỏi *"ai quên dọn?"* mà hỏi **"kho nào đang bị buộc vào một vòng đời dài hơn nó đáng có?"**

**Bài kế tiếp** → [Bài 15: Redis 100 GB xuống 60 GB mà không xoá một dòng dữ liệu](03-redis-100gb-xuong-60gb.md)
