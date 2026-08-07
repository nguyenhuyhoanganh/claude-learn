# Từ điển thuật ngữ — Database: sự cố thật và câu hỏi phỏng vấn

Tra nhanh mọi thuật ngữ xuất hiện trong khoá. Mỗi mục có **ba cột**: nghĩa kỹ thuật, một cách **hình dung đời thường**, và **bài** giải thích kỹ.

Nếu bạn mới bắt đầu, hãy đọc theo nhóm chứ đừng đọc từ trên xuống — các nhóm được xếp theo tầng, từ thứ bạn gõ hằng ngày tới thứ nằm sâu trong ruột máy.

---

## 1. Giao dịch và mức cách ly

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ | Bài |
|---|---|---|---|
| **Transaction** (giao dịch) | Nhóm thao tác chạy trọn gói: hoặc thành công hết, hoặc quay đầu sạch | Chuyển khoản: trừ bên này và cộng bên kia phải cùng thành công | [2](phase-1-cau-hoi-co-tang-duoi/02-hai-nguoi-sua-cung-mot-dong-ai-thang.md) |
| **Commit** | Xác nhận: mọi thay đổi trong giao dịch trở nên chính thức và bền | Ký tên vào cuối biên bản | [1](phase-1-cau-hoi-co-tang-duoi/01-cap-nhat-xong-xoa-cache-luc-nao.md) |
| **Rollback** (quay đầu / cuộn ngược) | Huỷ toàn bộ thay đổi của giao dịch, như chưa từng chạy | Ctrl+Z cho cả nhóm thao tác | [2](phase-1-cau-hoi-co-tang-duoi/02-hai-nguoi-sua-cung-mot-dong-ai-thang.md) |
| **Isolation Level** (mức cách ly) | Mức độ hai giao dịch chạy song song được "nhìn thấy" nhau | Vách ngăn giữa hai bàn làm việc: cao hay thấp | [2](phase-1-cau-hoi-co-tang-duoi/02-hai-nguoi-sua-cung-mot-dong-ai-thang.md) |
| **Read Committed** | Mặc định của PostgreSQL: chỉ đọc được dữ liệu đã commit | Chỉ được xem giấy tờ đã ký | [2](phase-1-cau-hoi-co-tang-duoi/02-hai-nguoi-sua-cung-mot-dong-ai-thang.md) |
| **Repeatable Read** | Mặc định của MySQL. **Ở PostgreSQL nó chính là Snapshot Isolation** — không giống định nghĩa sách giáo khoa | Chụp ảnh cái tủ lúc bước vào rồi làm theo ảnh đó | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| **Serializable** | Mức cao nhất. Ở Postgres = Snapshot Isolation **cộng phần dò bất thường**, không phải khoá chặt hơn | Có thêm giám sát viên phát hiện mâu thuẫn, không phải thêm ổ khoá | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| **Snapshot Isolation** | Mỗi giao dịch chốt một **ảnh chụp** lúc bắt đầu và chỉ nhìn ảnh đó | Danh sách những gì đã có lúc bạn bước vào phòng | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| **Serialization failure** | Lỗi khi hai giao dịch cùng sửa một dòng ở mức cách ly cao — bên sau bị huỷ | Hai người cùng sửa một phiếu, người sau bị bảo "làm lại" | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| **Lost Update** (mất cập nhật) | Hai giao dịch cùng đọc, cùng tính, cùng ghi — kết quả người trước **biến mất không dấu vết** | Hai người cùng chép lại sổ từ bản cũ, người sau xoá công của người trước | [2](phase-1-cau-hoi-co-tang-duoi/02-hai-nguoi-sua-cung-mot-dong-ai-thang.md) |
| **Dirty Write** | Ghi đè lên dữ liệu của giao dịch **chưa commit**. **Mọi database đều chặn** | Sửa vào biên bản người khác đang viết dở | [2](phase-1-cau-hoi-co-tang-duoi/02-hai-nguoi-sua-cung-mot-dong-ai-thang.md) |
| **Read-Modify-Write** | Ba bước đọc → tính → ghi. Chính ba bước này sinh ra Lost Update | Chép số ra giấy, tính, rồi ghi đè lại — trong lúc đó ai đó đã đổi số gốc | [2](phase-1-cau-hoi-co-tang-duoi/02-hai-nguoi-sua-cung-mot-dong-ai-thang.md) |
| **Prepared transaction** (giao dịch hai pha) | Giao dịch đã `PREPARE` nhưng chưa `COMMIT PREPARED` — **sống sót qua cả khởi động lại** | Hợp đồng đã ký một bên, treo vô thời hạn | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |

## 2. Khoá và kẹt khoá

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ | Bài |
|---|---|---|---|
| **Row lock** (khoá dòng) | Sửa một dòng trong giao dịch thì dòng đó bị khoá tới lúc commit | Mượn đúng một cuốn hồ sơ về bàn mình | [16](phase-4-thu-tu-va-quy-mo/01-khoa-xoan-nhau-goc-la-thu-tu.md) |
| **Pessimistic Locking** (khoá bi quan) | Giả định sẽ có tranh chấp → **khoá trước**, ai tới sau xếp hàng | Giữ chỗ trước bằng cách ngồi vào ghế | [2](phase-1-cau-hoi-co-tang-duoi/02-hai-nguoi-sua-cung-mot-dong-ai-thang.md) |
| **Optimistic Locking** (khoá lạc quan) | Không khoá; lúc ghi mới kiểm tra có ai chen ngang không, có thì làm lại | Cứ làm, cuối cùng đối chiếu xem có ai sửa không | [2](phase-1-cau-hoi-co-tang-duoi/02-hai-nguoi-sua-cung-mot-dong-ai-thang.md) |
| **Version Column** (cột phiên bản) | Cột số tăng mỗi lần dòng bị sửa, dùng để phát hiện chen ngang | Số lần cuốn sổ đã bị sửa | [2](phase-1-cau-hoi-co-tang-duoi/02-hai-nguoi-sua-cung-mot-dong-ai-thang.md) |
| **`FOR UPDATE`** | Khoá dòng vừa đọc; ai đọc kiểu này sau phải chờ | Cầm phiếu lên, ai muốn cùng phiếu phải đợi | [2](phase-1-cau-hoi-co-tang-duoi/02-hai-nguoi-sua-cung-mot-dong-ai-thang.md) |
| **`SKIP LOCKED`** | Thấy dòng đang bị khoá thì **bỏ qua**, lấy dòng khác | Phiếu này có người cầm rồi thì lấy phiếu kế tiếp | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| **`FOR KEY SHARE`** | Khoá nhẹ trên dòng cha khi thêm dòng con — **nguồn kẹt khoá bí ẩn** | Đánh dấu "đang có người tham chiếu, đừng xoá" | [4](phase-1-cau-hoi-co-tang-duoi/04-khoa-ngoai-co-lam-cham-khong.md) |
| **Deadlock** (kẹt khoá) | Hai bên **cùng chờ nhau**, vòng chờ khép kín. **Không bao giờ tự qua** | Hai người mỗi người cầm một chiếc đũa, cùng xin chiếc còn lại | [16](phase-4-thu-tu-va-quy-mo/01-khoa-xoan-nhau-goc-la-thu-tu.md) |
| **Wait-for graph** | Sơ đồ database tự vẽ: mỗi mũi tên là "A đang chờ B" | Sơ đồ ai đang đợi ai trong phòng | [16](phase-4-thu-tu-va-quy-mo/01-khoa-xoan-nhau-goc-la-thu-tu.md) |
| **Victim** | Giao dịch bị huỷ để phá vỡ vòng chờ — thường là bên đã làm ít việc nhất | Người được mời buông đũa ra | [16](phase-4-thu-tu-va-quy-mo/01-khoa-xoan-nhau-goc-la-thu-tu.md) |
| **`deadlock_timeout`** | PostgreSQL: chờ bao lâu rồi **mới bắt đầu đi kiểm tra**. Mặc định **1 giây** | Đợi 1 giây rồi mới đứng dậy đi xem có tắc không | [16](phase-4-thu-tu-va-quy-mo/01-khoa-xoan-nhau-goc-la-thu-tu.md) |
| **`innodb_lock_wait_timeout`** | MySQL: chờ khoá tối đa bao lâu rồi bỏ cuộc. Mặc định **50 giây** | Chờ 50 giây rồi tự bỏ về | [16](phase-4-thu-tu-va-quy-mo/01-khoa-xoan-nhau-goc-la-thu-tu.md) |
| **Gap lock** | MySQL khoá cả **khoảng trống giữa các dòng** để chống dòng ma | Giữ chỗ cả những ghế còn trống ở giữa | [16](phase-4-thu-tu-va-quy-mo/01-khoa-xoan-nhau-goc-la-thu-tu.md) |
| **Hàng nóng** (hot row) | Một dòng bị rất nhiều giao dịch cùng sửa | Một cái cửa duy nhất cho cả nghìn người đi qua | [7](phase-1-cau-hoi-co-tang-duoi/07-luu-so-du-tien-kieu-gi.md) |
| **Trần đồng thời** | Số việc tối đa mỗi giây khi mọi việc phải đi qua một chỗ chật. **= 1 giây / thời gian giữ khoá** | Dòng người chỉ chảy nhanh bằng tốc độ cái cửa | [5](phase-1-cau-hoi-co-tang-duoi/05-sinh-ma-don-hang-the-nao.md) |
| **Advisory lock** | Khoá tự đặt tên, không gắn với dòng nào — dùng để điều phối ứng dụng | Tự quy ước "ai cầm thẻ số 3 thì được làm việc này" | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |

## 3. Bộ lập kế hoạch và thống kê

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ | Bài |
|---|---|---|---|
| **Planner / Optimizer** | Phần database quyết định câu lệnh đi đường nào | Ứng dụng bản đồ chọn lộ trình | [8](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md) |
| **Execution Plan** | Cây các bước máy sẽ thực hiện | Lộ trình cụ thể: rẽ trái, đi 2km, vào cao tốc | [8](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md) |
| **`EXPLAIN`** | In ra **kế hoạch** — máy **định** đi đường nào. Không chạy thật | Xem trước lộ trình trên bản đồ | [10](phase-2-bo-may-ngam-cua-postgres/03-bao-cao-thang-chay-40-giay-work-mem.md) |
| **`EXPLAIN ANALYZE`** | **Chạy thật** rồi in kế hoạch kèm thời gian và số dòng thật | Lái thật rồi ghi lại từng chặng mất bao lâu | [10](phase-2-bo-may-ngam-cua-postgres/03-bao-cao-thang-chay-40-giay-work-mem.md) |
| **`BUFFERS`** | Tuỳ chọn của `EXPLAIN`: in ra **số trang thật sự đọc** | Đếm số tờ giấy đã lật | [11](phase-2-bo-may-ngam-cua-postgres/04-chieu-cao-index-va-con-so-postgres-khong-dung.md) |
| **Cost** (chi phí ước tính) | Con số **không có đơn vị** để so sánh các đường đi. Là **ước tính**, không phải thời gian | Điểm số trên giấy, không phải kết quả chạy thử | [8](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md) |
| **Prepared Statement** | Câu lệnh chuẩn bị sẵn với tham số để trống, thực thi nhiều lần | Tờ đơn in sẵn, mỗi lần chỉ điền chỗ trống | [8](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md) |
| **Custom Plan** (kế hoạch riêng) | Lập cho **đúng giá trị tham số của lần chạy này** | Xem đúng tình hình giao thông hôm nay rồi mới chọn đường | [8](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md) |
| **Generic Plan** (kế hoạch dùng chung) | Lập **một lần cho mọi giá trị tham số** → bị cấm giả định giá trị | Một lộ trình cố định, không cần biết hôm nay đường nào tắc | [8](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md) |
| **`plan_cache_mode`** | Tham số chọn giữa `auto` / `force_custom_plan` / `force_generic_plan` (PG12+) | Công tắc chọn kiểu lập lộ trình | [8](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md) |
| **`Index Cond`** | Điều kiện dùng để **nhảy thẳng tới đúng chỗ** trong cây index | Tra từ điển: mở thẳng tới vần "M" | [8](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md) |
| **`Filter`** | Điều kiện chỉ dùng để **loại bỏ dòng sau khi đã lấy lên** | Đọc từng trang rồi mới xem có phải cần tìm không | [8](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md) |
| **`Rows Removed by Filter`** | Số dòng bị lấy lên rồi vứt đi — **dấu hiệu đang đi bộ** | Số trang đã lật qua mà không dùng được | [8](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md) |
| **`ANALYZE`** (lệnh) | Bốc mẫu dữ liệu và dựng lại bảng thống kê | Đi khảo sát mẫu để cập nhật bản tóm tắt | [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |
| **`null_frac`** | Tỷ lệ dòng có giá trị rỗng ở cột đó | "99% người không khai nghề nghiệp" | [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |
| **`n_distinct`** | Số giá trị **khác nhau** ước tính. **Vẫn sai trên bảng lớn kể cả mẫu tối đa** | "Có khoảng 400 nghề khác nhau" | [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |
| **MCV** (Most Common Values) | Danh sách giá trị **hay gặp nhất** kèm tần suất. Mặc định 100 giá trị | "Top 100 nghề phổ biến và tỷ lệ mỗi nghề" | [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |
| **Histogram** | Chia dữ liệu còn lại thành 100 khoảng có số dòng xấp xỉ bằng nhau | Chia dân số thành 100 nhóm tuổi bằng nhau | [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |
| **Selectivity** (độ chọn lọc) | Ước tính **tỷ lệ dòng** thoả một điều kiện | "Điều kiện này chắc lọc ra khoảng 3% số dòng" | [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |
| **Cardinality** | Số dòng ước tính một bước sẽ trả về | "Bước này chắc ra khoảng 30 dòng" | [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |
| **`default_statistics_target`** | Quyết định cỡ mẫu: **300 × giá trị này** = 30.000 dòng mặc định | Số người được hỏi trong cuộc khảo sát | [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |
| **`CREATE STATISTICS`** | Khai báo các cột **không độc lập**. **Chưa được dùng cho ước tính ghép bảng** | Ghi chú: "hai cột này luôn đi cùng nhau" | [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |
| **Nested Loop Join** | Lấy từng dòng bảng ngoài rồi lục cả bảng trong. **Dội theo bình phương khi ước tính sai** | Cầm từng tên trong danh sách A rồi tra danh bạ B, từng cái một | [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |
| **Hash Join** | Dựng bảng băm từ một bên rồi quét bên kia. Ổn định, ít sợ ước tính sai | Chép danh bạ B ra giấy có mục lục rồi tra một lượt | [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |
| **Merge Join** | Sắp xếp cả hai bên rồi đi song song một lượt | Hai danh sách đã xếp theo tên, đi từ trên xuống | [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |
| **`autovacuum_analyze_scale_factor`** | Ngưỡng kích hoạt cập nhật thống kê. Mặc định **0,1** → bảng càng to càng lâu mới cập nhật | Càng đông dân càng lâu mới khảo sát lại | [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |

## 4. Bộ nhớ, sắp xếp và kết nối

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ | Bài |
|---|---|---|---|
| **`work_mem`** | RAM tối đa cho **MỘT thao tác sắp xếp/băm**, trong **MỘT** câu lệnh, ở **MỘT** phiên | Kích thước mặt bàn để xếp bài | [10](phase-2-bo-may-ngam-cua-postgres/03-bao-cao-thang-chay-40-giay-work-mem.md) |
| **`hash_mem_multiplier`** | Thao tác băm được cấp `work_mem × hệ số`. Mặc định **2.0** từ PG15 | Người xếp bài kiểu này được bàn to gấp đôi | [10](phase-2-bo-may-ngam-cua-postgres/03-bao-cao-thang-chay-40-giay-work-mem.md) |
| **Quicksort** | Sắp xếp **hoàn toàn trong RAM** | Xếp bài ngay trên mặt bàn | [10](phase-2-bo-may-ngam-cua-postgres/03-bao-cao-thang-chay-40-giay-work-mem.md) |
| **External Merge Sort** | Sắp xếp khi không vừa RAM: cắt nhỏ, ghi ra đĩa, trộn lại | Bàn quá nhỏ: xếp từng nắm, để tạm xuống sàn, rồi gộp dần | [10](phase-2-bo-may-ngam-cua-postgres/03-bao-cao-thang-chay-40-giay-work-mem.md) |
| **`log_temp_files`** | Ghi log mỗi khi có câu lệnh phải xả file tạm ra đĩa | Chuông báo mỗi lần phải để đồ xuống sàn | [10](phase-2-bo-may-ngam-cua-postgres/03-bao-cao-thang-chay-40-giay-work-mem.md) |
| **`SET LOCAL`** | Đặt tham số **chỉ trong giao dịch hiện tại** | Mượn cái bàn to, dùng xong trả lại | [10](phase-2-bo-may-ngam-cua-postgres/03-bao-cao-thang-chay-40-giay-work-mem.md) |
| **Buffer Pool / Shared Buffers** | Vùng RAM giữ các trang dữ liệu vừa đọc | Mặt bàn làm việc: thứ hay dùng để trên bàn | [3](phase-1-cau-hoi-co-tang-duoi/03-anh-nguoi-dung-luu-o-dau.md) |
| **Trang** (page) | Đơn vị đọc/ghi nhỏ nhất: 8 KB (PG) / 16 KB (InnoDB) | Một tờ giấy | [3](phase-1-cau-hoi-co-tang-duoi/03-anh-nguoi-dung-luu-o-dau.md) |
| **Connection Pool** | Tập kết nối giữ sẵn và tái sử dụng | Kho quầy dựng sẵn, ai cần thì mượn rồi trả | [13](phase-3-tai-nguyen-va-vong-doi/01-cat-bot-ket-noi-de-chay-nhanh-hon.md) |
| **Context Switch** (đổi ca) | Hệ điều hành dừng việc A, cất trạng thái, nạp việc B. **Đắt nhất ở chỗ đá cache của nhau** | Thợ bỏ dở việc này, cất đồ, lấy đồ việc khác ra | [13](phase-3-tai-nguyen-va-vong-doi/01-cat-bot-ket-noi-de-chay-nhanh-hon.md) |
| **Idle connection** | Kết nối đang mở nhưng không chạy gì. **Vẫn phá thông lượng** | Quầy mở đèn nhưng không có khách | [13](phase-3-tai-nguyen-va-vong-doi/01-cat-bot-ket-noi-de-chay-nhanh-hon.md) |
| **`GetSnapshotData()`** | Hàm dựng ảnh chụp — phải **lướt toàn bộ danh sách kết nối** | Điểm danh cả phòng mỗi lần có việc | [13](phase-3-tai-nguyen-va-vong-doi/01-cat-bot-ket-noi-de-chay-nhanh-hon.md) |
| **PgBouncer** | Trung gian gom nhiều kết nối ứng dụng thành ít kết nối database | Lễ tân điều phối: nhận 1000 khách, đưa vào 20 quầy | [13](phase-3-tai-nguyen-va-vong-doi/01-cat-bot-ket-noi-de-chay-nhanh-hon.md) |
| **RSS** (Resident Set Size) | Lượng RAM thật hệ điều hành ghi nhận một tiến trình đang chiếm | Cột MEM trong `top` | [14](phase-3-tai-nguyen-va-vong-doi/02-mysql-phinh-bo-nho-khong-phai-ro.md) |
| **OOM Killer** | Hết RAM thì Linux bắn hạ tiến trình ngốn nhiều nhất | Hết chỗ, bảo vệ mời người to nhất ra ngoài | [14](phase-3-tai-nguyen-va-vong-doi/02-mysql-phinh-bo-nho-khong-phai-ro.md) |
| **Rò bộ nhớ** (memory leak) | Cấp phát rồi **mất con trỏ** — khác hẳn "giữ lại có chủ ý" | Để quên chìa khoá tủ | [14](phase-3-tai-nguyen-va-vong-doi/02-mysql-phinh-bo-nho-khong-phai-ro.md) |
| **Arena / Pool allocator** | Xin **một khối to** rồi cắt nhỏ phát dần bằng cách đẩy con trỏ | Mua nguyên cuộn giấy, cắt dần từng tờ | [14](phase-3-tai-nguyen-va-vong-doi/02-mysql-phinh-bo-nho-khong-phai-ro.md) |
| **`MEM_ROOT`** | Tên gọi của arena trong mã nguồn MySQL | Cái kho cấp phát dùng chung của MySQL | [14](phase-3-tai-nguyen-va-vong-doi/02-mysql-phinh-bo-nho-khong-phai-ro.md) |
| **`MemoryContext`** | Arena của PostgreSQL. Có **trần khối, cho trả từng mảnh, xếp thành cây cha con** | Kho có quy củ: có trần, có mục lục, có cấp trên | [14](phase-3-tai-nguyen-va-vong-doi/02-mysql-phinh-bo-nho-khong-phai-ro.md) |
| **Cursor** | Tay cầm để duyệt kết quả **theo từng phần**. **Bắt buộc có kho riêng** | Cái kẹp đánh dấu trang | [14](phase-3-tai-nguyen-va-vong-doi/02-mysql-phinh-bo-nho-khong-phai-ro.md) |

## 5. Index và cách lưu trữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ | Bài |
|---|---|---|---|
| **B-Tree** | Cây mà index dùng: mọi lá cách gốc đúng số bước như nhau | Mục lục nhiều tầng | [11](phase-2-bo-may-ngam-cua-postgres/04-chieu-cao-index-va-con-so-postgres-khong-dung.md) |
| **`tree_level`** | Chiều cao cây tính từ **gốc thật** — **không phải con số Postgres dùng** | Số tầng ghi trên bản vẽ, không phải lối đi thật | [11](phase-2-bo-may-ngam-cua-postgres/04-chieu-cao-index-va-con-so-postgres-khong-dung.md) |
| **Fast Root** | Con trỏ tới tầng thấp nhất chỉ còn một trang — **nơi thao tác thật bắt đầu** | Lối tắt: "khỏi đi qua ba tầng rỗng, vào thẳng đây" | [11](phase-2-bo-may-ngam-cua-postgres/04-chieu-cao-index-va-con-so-postgres-khong-dung.md) |
| **Metapage** | Trang **đầu tiên** của mọi index B-Tree, chứa `btm_root` và `btm_fastroot` | Trang bìa lót ghi "mục lục bắt đầu ở trang mấy" | [11](phase-2-bo-may-ngam-cua-postgres/04-chieu-cao-index-va-con-so-postgres-khong-dung.md) |
| **`avg_leaf_density`** | Tỷ lệ lấp đầy của **các lá còn sống** — **loại trang chết ra khỏi phép tính** | Chỉ đo các trang còn nội dung, bỏ qua trang trắng | [11](phase-2-bo-may-ngam-cua-postgres/04-chieu-cao-index-va-con-so-postgres-khong-dung.md) |
| **`fillfactor`** | Phần trăm trang được lấp đầy khi dựng index. Mặc định **90** | Chép mục lục nhưng chừa 10% mỗi trang | [11](phase-2-bo-may-ngam-cua-postgres/04-chieu-cao-index-va-con-so-postgres-khong-dung.md) |
| **Bloat** (phình rác) | Dung lượng bị chiếm bởi trang chết và chỗ trống | Cuốn sổ dày lên vì trang trắng xen giữa | [11](phase-2-bo-may-ngam-cua-postgres/04-chieu-cao-index-va-con-so-postgres-khong-dung.md) |
| **`REINDEX CONCURRENTLY`** | Dựng lại index không khoá ghi. **Hỏng giữa chừng để lại index INVALID** | Chép mục lục sang sổ mới trong lúc vẫn phục vụ | [11](phase-2-bo-may-ngam-cua-postgres/04-chieu-cao-index-va-con-so-postgres-khong-dung.md) |
| **Index từng phần** (partial index) | Index **chỉ chứa các dòng thoả một điều kiện** | Mục lục chỉ liệt kê chương đang đọc dở | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| **HOT update** | Nếu **không sửa cột nào trong index** và còn chỗ trong cùng trang → khỏi cập nhật index | Sửa tại chỗ, khỏi phải sửa mục lục | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| **Bottom-up index deletion** | PG14: dọn rác index tại chỗ. **Chỉ áp dụng cho index KHÔNG bị câu lệnh sửa** | Người dọn chỉ dọn những kệ không ai đang bày | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| **B-Tree deduplication** | PG13: gom nhiều dòng cùng giá trị khoá vào một mục | Ghi "trang 5, 8, 12" thay vì ba dòng riêng | [11](phase-2-bo-may-ngam-cua-postgres/04-chieu-cao-index-va-con-so-postgres-khong-dung.md) |
| **TOAST** | Giá trị > ~2 KB bị **nén, cắt mảnh, đẩy sang bảng phụ** | Đồ quá to thì tháo ra, bọc lại, cất sang kho bên | [3](phase-1-cau-hoi-co-tang-duoi/03-anh-nguoi-dung-luu-o-dau.md) |
| **Listpack** | Redis: **khối byte liền mạch**, không con trỏ nào | Xếp đồ khít nhau trong một hộp duy nhất | [15](phase-3-tai-nguyen-va-vong-doi/03-redis-100gb-xuong-60gb.md) |
| **Hashtable** (Redis) | Mỗi trường một ô riêng, cấp phát riêng, làm tròn riêng | Mỗi món một hộp riêng, có nhãn, có mục lục | [15](phase-3-tai-nguyen-va-vong-doi/03-redis-100gb-xuong-60gb.md) |
| **Mức cấp phát** (size class) | Bộ cấp phát chỉ có sẵn vài cỡ khối cố định | Cửa hàng chỉ bán hộp cỡ S, M, L | [15](phase-3-tai-nguyen-va-vong-doi/03-redis-100gb-xuong-60gb.md) |
| **`OBJECT ENCODING`** | Trả về **TÊN cách lưu** (`listpack` / `hashtable`). **Không trả byte** | Hỏi: "hộp này xếp kiểu nào?" | [15](phase-3-tai-nguyen-va-vong-doi/03-redis-100gb-xuong-60gb.md) |
| **`MEMORY USAGE`** | Trả về **SỐ BYTE**. Mặc định **lấy mẫu 5 phần tử** rồi nhân ra | Hỏi: "hộp này nặng bao nhiêu?" (cân ước lượng) | [15](phase-3-tai-nguyen-va-vong-doi/03-redis-100gb-xuong-60gb.md) |
| **embstr / raw** | Chuỗi ≤ **44 byte** dùng một lần cấp phát; dài hơn thì hai | Ghi chú ngắn viết ngay trên bìa; dài thì phải kẹp thêm tờ | [15](phase-3-tai-nguyen-va-vong-doi/03-redis-100gb-xuong-60gb.md) |

## 6. MVCC, VACUUM và wraparound

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ | Bài |
|---|---|---|---|
| **MVCC** | Sửa một dòng thì **đẻ bản mới, giữ bản cũ** → đọc không chặn ghi | Không tẩy xoá, viết dòng mới và ghi chú dòng cũ hết hiệu lực | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **XID** (Transaction ID) | Số thứ tự tăng dần cấp cho mỗi giao dịch **có ghi**. **Chỉ 32 bit** | Số thứ tự cấp cho từng lượt vào quầy | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **`xmin` / `xmax`** | Hai cột ẩn trong **mọi dòng**: ai tạo, ai xoá | Ghi chú bên lề: "viết bởi lượt 128, xoá bởi lượt 340" | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **Virtual XID** | Số ảo cấp cho giao dịch **chỉ đọc** — **không tiêu XID thật** | Vé vào cửa cho người chỉ tới xem | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **Wraparound** | Bộ đếm 32 bit chạy hết vòng rồi quay về đầu → **dòng cũ rơi sang "tương lai" và biến mất** | Đồng hồ đo quãng đường chạy hết số rồi về 000000 | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **Freeze** (đóng băng) | Đánh dấu dòng là **"cũ tuyệt đối"** — miễn nhiễm với vòng quay | Đóng dấu "vĩnh viễn có hiệu lực" | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **`relfrozenxid`** | Mốc XID mà mọi dòng cũ hơn nó đều đã đóng băng | Vạch mốc "từ đây trở về trước đã dọn xong" | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **`age()`** | Khoảng cách từ mốc đó tới XID hiện tại — **tuổi tính bằng số giao dịch** | Bao nhiêu lượt đã trôi qua kể từ lần dọn cuối | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **`autovacuum_freeze_max_age`** | Mốc **200 triệu**: tự khởi động vacuum cưỡng bức | Tới hạn là phải dọn, không xin hoãn | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **`vacuum_failsafe_age`** | Mốc **1,6 tỷ** (PG14+): chế độ cứu hoả, bỏ qua dọn index | Báo động cháy: bỏ hết thủ tục, chạy hết tốc | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **MultiXact** | **Bộ đếm 32 bit thứ hai**, cho nhiều giao dịch cùng khoá một dòng. Cũng wraparound được | Danh sách nhiều người cùng mượn một hồ sơ | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **`xid8`** | Kiểu dữ liệu 64 bit có epoch cho **người dùng**. **Không thay thế `xid` bên trong** | Số hiệu dài hơn ghi trên giấy tờ, không đổi máy phát số | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **Replication slot** | Giữ nhật ký ghi lại cho bản sao chưa đọc kịp. **Bỏ quên là chặn VACUUM** | Giữ báo cũ lại vì có người chưa đọc | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **`idle in transaction`** | Kết nối đã `BEGIN` nhưng không làm gì. **Kẻ thù số 1 của VACUUM** | Mượn hồ sơ rồi đi ăn trưa | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| **Dead tuple** (rác) | Bản cũ của một dòng sau khi bị sửa, chờ dọn | Bản nháp hết hiệu lực còn nằm trong tủ | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |

## 7. Sao lưu, cache và tính đúng đắn của dữ liệu

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ | Bài |
|---|---|---|---|
| **RPO** (Recovery Point Objective) | **Lượng dữ liệu chấp nhận mất**, tính bằng thời gian | "Mất tối đa 5 phút giao dịch gần nhất" | [6](phase-1-cau-hoi-co-tang-duoi/06-ban-sao-luu-database-the-nao.md) |
| **RTO** (Recovery Time Objective) | **Thời gian chấp nhận hệ thống chết** | "Phải sống lại trong 30 phút" | [6](phase-1-cau-hoi-co-tang-duoi/06-ban-sao-luu-database-the-nao.md) |
| **WAL / Binlog** | Sổ ghi trước mọi thay đổi, trước khi ghi vào bảng | Ghi vào sổ tay trước, chép vào sổ cái sau | [6](phase-1-cau-hoi-co-tang-duoi/06-ban-sao-luu-database-the-nao.md) |
| **PITR** (Point-In-Time Recovery) | Phục hồi về **đúng một thời điểm bất kỳ** | Tua ngược cuốn phim tới đúng giây 14:32:07 | [6](phase-1-cau-hoi-co-tang-duoi/06-ban-sao-luu-database-the-nao.md) |
| **Logical backup** | Xuất ra câu lệnh SQL (`pg_dump`). Phục hồi **rất chậm** | Chép nội dung sổ bằng tay ra một file chữ | [6](phase-1-cau-hoi-co-tang-duoi/06-ban-sao-luu-database-the-nao.md) |
| **Physical backup** | Sao chép thẳng file dữ liệu | Photocopy nguyên cuốn sổ, từng trang | [6](phase-1-cau-hoi-co-tang-duoi/06-ban-sao-luu-database-the-nao.md) |
| **Replica** | Máy chủ thứ hai liên tục chép mọi thay đổi. **Chép cả lệnh xoá nhầm** | Thư ký ngồi cạnh, chép y hệt từng dòng | [6](phase-1-cau-hoi-co-tang-duoi/06-ban-sao-luu-database-the-nao.md) |
| **Replica trễ** | Replica cố tình chậm lại N giờ — cửa sổ cứu dữ liệu bị xoá nhầm | Thư ký chép chậm một tiếng, còn giữ bản cũ | [6](phase-1-cau-hoi-co-tang-duoi/06-ban-sao-luu-database-the-nao.md) |
| **Immutable / Object Lock** | Bản sao lưu **không thể xoá hay sửa** trong N ngày | Két sắt hẹn giờ | [6](phase-1-cau-hoi-co-tang-duoi/06-ban-sao-luu-database-the-nao.md) |
| **Restore drill** | Chạy thử toàn bộ quy trình phục hồi, **có bấm giờ** | Diễn tập chữa cháy | [6](phase-1-cau-hoi-co-tang-duoi/06-ban-sao-luu-database-the-nao.md) |
| **Cache-Aside** | Ứng dụng tự quản: đọc thì tra cache trước, trượt thì xuống DB rồi nạp lên | Tra sổ tay trước, không có thì mở tủ hồ sơ | [1](phase-1-cau-hoi-co-tang-duoi/01-cap-nhat-xong-xoa-cache-luc-nao.md) |
| **Invalidation** | Làm bản sao trong cache không còn được dùng — bằng cách **xoá** (nên) hoặc ghi đè | Xé tờ ghi chú cũ đi | [1](phase-1-cau-hoi-co-tang-duoi/01-cap-nhat-xong-xoa-cache-luc-nao.md) |
| **TTL** | Hạn dùng của một key. **Cận trên của thiệt hại khi mọi cơ chế khác hỏng** | Hạn sử dụng ghi trên hộp sữa | [1](phase-1-cau-hoi-co-tang-duoi/01-cap-nhat-xong-xoa-cache-luc-nao.md) |
| **Jitter** | Cộng ngẫu nhiên vào TTL/thời gian chờ để không đồng loạt | Không cho cả lớp tan học cùng một giây | [1](phase-1-cau-hoi-co-tang-duoi/01-cap-nhat-xong-xoa-cache-luc-nao.md) |
| **CDC** (Change Data Capture) | Đọc thẳng nhật ký ghi của database làm nguồn sự kiện | Nghe từ chính cuốn sổ gốc, không nghe kể lại | [1](phase-1-cau-hoi-co-tang-duoi/01-cap-nhat-xong-xoa-cache-luc-nao.md) |
| **Silent failure** (lỗi im lặng) | Lỗi không ai thấy — **khách hàng phát hiện trước bạn** | Rò rỉ dưới sàn, chỉ biết khi hoá đơn nước về | [1](phase-1-cau-hoi-co-tang-duoi/01-cap-nhat-xong-xoa-cache-luc-nao.md) |
| **Sổ cái** (ledger) | Bảng riêng, mỗi biến động là **một dòng ghi thêm**, không bao giờ sửa | Sổ thu chi đóng gáy, viết bút mực | [7](phase-1-cau-hoi-co-tang-duoi/07-luu-so-du-tien-kieu-gi.md) |
| **Append-only** | Chỉ có `INSERT`. Không `UPDATE`, không `DELETE` | Sổ không xé trang, không tẩy xoá | [7](phase-1-cau-hoi-co-tang-duoi/07-luu-so-du-tien-kieu-gi.md) |
| **Idempotency** (luỹ đẳng) | Gửi cùng một lệnh nhiều lần cho kết quả y như gửi một lần | Bấm nút thang máy 5 lần cũng chỉ gọi một chuyến | [7](phase-1-cau-hoi-co-tang-duoi/07-luu-so-du-tien-kieu-gi.md) |
| **Idempotency key** | Mã duy nhất **do phía gửi sinh**, giữ nguyên qua mọi lần thử lại | Số phiếu: cùng số phiếu thì là cùng một việc | [7](phase-1-cau-hoi-co-tang-duoi/07-luu-so-du-tien-kieu-gi.md) |
| **Chốt sổ / snapshot** | Ghi một dòng "tới đây tổng = X" để khỏi cộng lại từ đầu | Kết sổ cuối tháng | [7](phase-1-cau-hoi-co-tang-duoi/07-luu-so-du-tien-kieu-gi.md) |
| **Đối soát** (reconciliation) | So hai nguồn số liệu để tìm chỗ lệch | Kiểm kê: đếm tiền trong két, so với sổ | [7](phase-1-cau-hoi-co-tang-duoi/07-luu-so-du-tien-kieu-gi.md) |
| **Sequence / AUTO_INCREMENT** | Bộ đếm phát số tăng dần. **Nhả số ngoài giao dịch nên có lỗ** | Máy phát số thứ tự ở ngân hàng | [5](phase-1-cau-hoi-co-tang-duoi/05-sinh-ma-don-hang-the-nao.md) |
| **File mồ côi** (orphan file) | File còn trong kho nhưng không dòng nào trỏ tới | Hộp trong kho mà không ai giữ phiếu | [3](phase-1-cau-hoi-co-tang-duoi/03-anh-nguoi-dung-luu-o-dau.md) |
| **Presigned URL** | Đường dẫn có chữ ký, có hạn giờ, dùng để tải lên/xuống trực tiếp kho | Vé vào cửa có hạn giờ, dùng một lần | [3](phase-1-cau-hoi-co-tang-duoi/03-anh-nguoi-dung-luu-o-dau.md) |

## 8. Hàng đợi, phát tin và quy mô

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ | Bài |
|---|---|---|---|
| **Worker** | Tiến trình lấy việc từ hàng đợi và xử lý | Người thợ | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| **Partition** (Kafka) | Một dòng dữ liệu con trong topic; đơn vị của thứ tự và song song | Một làn đường trong xa lộ | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| **Offset** | Con số đánh dấu consumer đã đọc tới đâu. **Không đẻ ra rác** | Cái kẹp đánh dấu trang | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| **Consumer group** | Nhóm consumer chia nhau đọc một topic, mỗi nhóm có offset riêng | Nhiều lớp cùng đọc một cuốn sách, mỗi lớp có kẹp riêng | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| **`LISTEN` / `NOTIFY`** | Cơ chế báo hiệu của Postgres. **Tín hiệu không bền, không qua PgBouncer transaction mode** | Chuông báo: nghe được thì tốt, không nghe thì thôi | [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| **Fan-out** | Một tin phải nhân ra và gửi tới nhiều người nhận | Một lá thư photocopy ra hàng triệu bản | [18](phase-4-thu-tu-va-quy-mo/03-40-nghin-binh-luan-mot-giay.md) |
| **Tỷ lệ fan-out** | Số bản sao phải tạo cho **mỗi** tin gửi lên | Một thư gửi cho bao nhiêu người | [18](phase-4-thu-tu-va-quy-mo/03-40-nghin-binh-luan-mot-giay.md) |
| **WebSocket** | Kết nối hai chiều **giữ mở liên tục**. Trần thực tế ~100k/máy | Đường dây điện thoại luôn nhấc máy | [18](phase-4-thu-tu-va-quy-mo/03-40-nghin-binh-luan-mot-giay.md) |
| **Pub/Sub** | Bên phát đẩy vào một kênh, mọi bên đăng ký đều nhận | Đài phát thanh | [18](phase-4-thu-tu-va-quy-mo/03-40-nghin-binh-luan-mot-giay.md) |
| **Sampling** (bốc mẫu) | Chỉ giữ một phần, bỏ phần còn lại | Đọc 10 lá thư đại diện thay vì cả bao tải | [18](phase-4-thu-tu-va-quy-mo/03-40-nghin-binh-luan-mot-giay.md) |
| **Backpressure** | Bên nhận chậm hơn bên gửi: **bỏ bớt, đừng đệm** | Van an toàn khi nước vào nhanh hơn nước ra | [18](phase-4-thu-tu-va-quy-mo/03-40-nghin-binh-luan-mot-giay.md) |
| **Optimistic UI** | Giao diện **vẽ trước** kết quả, giả định thao tác sẽ thành công | Đánh dấu "đã gửi" ngay khi bấm | [18](phase-4-thu-tu-va-quy-mo/03-40-nghin-binh-luan-mot-giay.md) |
| **Edge server** | Máy chủ đặt gần người dùng, giữ kết nối và phát tin | Trạm phát lại đặt ở từng tỉnh | [18](phase-4-thu-tu-va-quy-mo/03-40-nghin-binh-luan-mot-giay.md) |
| **Hot key / hot room** | Một khoá/phòng nóng tới mức một máy không gánh nổi | Một quầy có cả nghìn người, các quầy khác vắng | [18](phase-4-thu-tu-va-quy-mo/03-40-nghin-binh-luan-mot-giay.md) |
| **Batching** (gom lô) | Gom nhiều tin thành một gói rồi gửi một lần | Gom thư cả ngày rồi giao một chuyến | [18](phase-4-thu-tu-va-quy-mo/03-40-nghin-binh-luan-mot-giay.md) |
| **Throughput / Latency** | Số việc xong mỗi giây / thời gian một việc hoàn thành | Số khách phục vụ mỗi giờ / mỗi khách chờ bao lâu | [13](phase-3-tai-nguyen-va-vong-doi/01-cat-bot-ket-noi-de-chay-nhanh-hon.md) |

---

**Quay lại** → [Mục lục khoá học](README.md)
