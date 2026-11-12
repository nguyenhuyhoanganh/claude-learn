MÌNH ĐANG VIẾT MỘT HỆ ĐIỀU HÀNH BẰNG RUST. AI MUỐN THÌ VÀO LÀM CÙNG

Mình đang làm một dự án hơi liều: viết một hệ điều hành từ đầu, bằng Rust. Tên nó là ViFastOs.

Hiện tại kernel khoảng 16.700 dòng, boot được trên QEMU với ba kiến trúc (RISC-V, ARM64, x86_64), có 51 lệnh gọi hệ thống (syscall), chạy được chương trình ở chế độ người dùng (user mode), có IPC, capability, filesystem và shell riêng.

Bài này mình viết để kể dự án cho người mới, rủ mấy bạn đang muốn vibe coding mà chưa biết bắt đầu từ đâu, và kể chuyện Việt Nam vừa ra chip. Cuối bài có phần dành cho bạn nào dư token, muốn thả AI agent vào làm.

HỆ ĐIỀU HÀNH LÀ GÌ, NÓI GỌN

Hệ điều hành là lớp phần mềm nằm giữa app và phần cứng. Nó chia CPU, cấp RAM, quản lý file, nói chuyện với thiết bị.

Kernel là lõi của hệ điều hành, phần chạy với quyền cao nhất. App muốn đọc file hay gửi dữ liệu thì phải nhờ kernel qua syscall, không được tự đụng vào phần cứng.

Có hai trường phái làm kernel.

Một là nhét gần hết vào kernel như Linux. Cách này nhanh vì gọi hàm trực tiếp, nhưng kernel rất lớn và một driver lỗi có thể kéo cả máy xuống.

Hai là giữ kernel thật nhỏ: chỉ cấp quyền, chuyển tin nhắn giữa các tiến trình (IPC), chia CPU, quản lý bộ nhớ ảo. Driver, filesystem, mạng chạy ở user space như app bình thường. Đây là microkernel, và ViFastOs đi theo hướng này, học theo seL4.

Trong ViFastOs, các thành phần chính gồm: kernel (giữ object, capability, IPC, lập lịch, bộ nhớ ảo), root task (chương trình đầu tiên chạy sau kernel), vài server ở user space như filesystem và shell, rồi các app client. Driver cũng nằm ở user space chứ không nhét vào kernel.

Một khái niệm quan trọng nữa là capability. Cứ hiểu nó như tấm vé ghi rõ "được làm gì, trên tài nguyên nào". Không có vé thì không làm được gì. Linux thì dùng root (UID 0) làm chìa khóa vạn năng, nên chỉ cần một lỗi leo thang đặc quyền là mất cả máy.

"CÓ NGƯỜI NÓI MICROKERNEL CHẬM"

Mình hay đọc comment kiểu vậy. Câu đó không hoàn toàn sai, nhưng nó đúng với thế hệ microkernel đầu tiên (Mach) đo trên máy thập niên 1980 đến 1990.

Thời đó CPU rất chậm, mỗi chu kỳ máy đều quý. Người ta phải tiết kiệm từng lệnh, nên kernel gom mọi thứ vào một khối để gọi hàm cho nhanh, đổi an toàn lấy tốc độ. Đó là quyết định hợp lý ở thời điểm đó.

Nhưng đến 1997, nhóm phát triển L4 (Jochen Liedtke và cộng sự) công bố bài đo: chạy cả một nhân Linux ở user space mà hiệu năng chỉ thấp hơn Linux gốc khoảng 5%. Tức là "microkernel chậm" là câu chuyện của một thiết kế cụ thể, không phải bản chất của cả hướng đi.

Mình nghĩ câu đó sống lâu hơn số đo của nó, một phần vì lịch sử thường được kể bởi người thắng. Ai đọc một bài blog rồi tin luôn thì dễ lặp lại một kết luận đã hết thời.

Nói cho công bằng: microkernel vẫn có giá. IPC tốn hơn gọi hàm, driver khó viết hơn, hệ sinh thái ít hơn Linux rất nhiều. Nhưng nếu tối ưu đường nhanh của IPC, giữ kernel nhỏ, tránh copy dữ liệu thừa, thì khoảng cách không còn là "chậm gấp nhiều lần" như nhiều người tưởng.

CÒN HIỆN TẠI THÌ SAO

Tháng 11 năm 2026, OpenAI công bố một thí nghiệm: cho agent tự trị chạy trên nhân Linux, nó tìm ra 948 lỗ hổng leo thang đặc quyền, tự viết được mã khai thác và bản vá, chi phí khoảng 1,2 triệu đô. Ba tháng trước đó, cùng quy trình chỉ ra được 166 lỗi. Cùng một nhân, chỉ khác là AI giỏi lên.

Con số đó không nói Linux dở. Nó nói một điều đơn giản hơn: nhân Linux hơn 43 triệu dòng code, bề mặt tấn công quá lớn, nên càng quét kỹ càng ra lỗi. Kernel càng to thì càng khó chứng minh nó không có lỗi.

Thêm một thống kê: Microsoft và đội Chromium đều nói khoảng 70% lỗ hổng nghiêm trọng của họ là lỗi bộ nhớ, kiểu tràn bộ đệm hay dùng biến sau khi đã giải phóng. Android chuyển dần code mới sang Rust thì tỉ lệ lỗi bộ nhớ giảm từ 76% năm 2019 xuống còn khoảng 20% năm 2025. Không phải lập trình viên giỏi hơn, mà là ngôn ngữ chặn lỗi ngay lúc biên dịch.

Xu hướng mười năm tới mình nghĩ là bảo mật chứ không phải tốc độ. Máy đã nhanh rồi, giờ cái đắt là một lỗ hổng.

VÌ SAO RUST VÀ KERNEL NHỎ

Rust bắt lỗi bộ nhớ ngay lúc biên dịch: không giữ hai con trỏ cùng sửa một vùng nhớ, không dùng biến đã giải phóng, không tràn mảng mà compiler không biết.

Kernel của ViFastOs còn cấm hẳn unsafe ở crate lõi. Chỗ nào buộc phải unsafe thì tách ra crate riêng, có tài liệu và test riêng.

Kernel nhỏ có lợi thế khác: một người đọc hết được. Dự án này khoảng 16.700 dòng kernel và 42.700 dòng cho cả workspace. RAM cho kernel cũng ít: metadata khoảng 80 KiB, data khoảng 304 KiB.

Mấy năm gần đây nhiều phần mềm nền được viết lại bằng Rust: sudo, bộ coreutils, một phần Android, một phần nhân Windows. Cả một hệ điều hành viết bằng Rust là Redox OS. Ngay Linux cũng nhận driver Rust từ bản 7.4.

HỆ ĐIỀU HÀNH CŨNG LÀ PHẦN MỀM

Nên nó cũng có test, cũng có cổng kiểm tra, cũng sửa được từng vòng, y như một app.

ViFastOs có 297 test chạy trên máy host, cộng self-test trong QEMU cho cả ba kiến trúc, mỗi kiến trúc chạy 5 lần, kèm test lưu dữ liệu xuống đĩa, filesystem và shell. Sai một chỗ là cổng test báo đỏ, không được gộp code vào.

Cái hay của làm OS là kết quả rất rõ: hoặc boot được, hoặc panic ngay dòng log đầu tiên.

VIỆT NAM ĐANG LÀM CHIP, PHẦN MỀM THÌ SAO?

Ngày 3 tháng 11 năm 2026, Việt Nam ra mắt chip bảo mật đầu tiên do người Việt thiết kế: VGC v1.0, 300 triệu bóng bán dẫn, sản xuất trên tiến trình 28nm, mã hoá nhanh gấp khoảng 15 lần so với làm bằng phần mềm.

Chi tiết mình thấy quan trọng nhất: nền tảng bán dẫn bảo mật đó được xây trên RISC-V, một tập lệnh mở, cho phép kỹ sư tự tùy biến thiết kế vi xử lý. Tức là Việt Nam không đi theo lối mua chip về dùng, mà bắt đầu từ nền móng thiết kế.

Trước đó, tháng 1 năm 2026, nhà máy chế tạo chip đầu tiên khởi công ở Hòa Lạc, tiến trình 32nm, dự kiến sản xuất thử từ 2028. FPT đã đưa nhà máy kiểm thử và đóng gói công suất 300 triệu chip một năm vào chạy thử. Chiến lược bán dẫn của Việt Nam đặt mục tiêu doanh thu 100 tỷ đô một năm vào năm 2050.

Nói cho thật: tiến độ không dễ. Có báo nước ngoài nói nhà máy đang chậm so với mốc đề ra và chưa chốt được thiết bị từ ASML. Nhưng hướng đi thì đã rõ, và tiền đã đổ vào.

Mà chip chỉ là phần cứng. Một con CPU mới cần hệ điều hành, trình biên dịch, driver, bộ gõ, font, cách hiển thị dấu tiếng Việt. Mỹ có Windows và Linux, Trung Quốc có HarmonyOS, Nga có Astra Linux. Việt Nam chưa có hệ điều hành của mình.

Nếu 5 đến 10 năm nữa Việt Nam làm CPU, mình muốn lúc đó đã có sẵn một bộ khung phần mềm chạy được trên chip đó, tối ưu cho chip đó, và hiểu tiếng Việt từ đầu: gõ tiếng Việt, hiển thị dấu, đọc chữ Việt.

Đó là lý do dự án chọn RISC-V làm kiến trúc đầu tiên và giữ kernel nhỏ để port sang chip mới cho nhanh. Đi tắt đón đầu không phải là làm chip trước người ta, mà là làm phần mềm trong lúc phần cứng còn đang xây.

DÀNH CHO BẠN MUỐN VIBE CODING MÀ CHƯA BIẾT LÀM GÌ

Vibe coding, hiểu đơn giản là ngồi nói chuyện với AI, để nó viết code, còn mình kiểm tra. Khó nhất không phải là code, mà là chọn việc gì để làm. Một dự án OS hợp vì nó có sẵn việc, có sẵn test, sai là biết ngay.

Ba kiểu vào, tùy bạn đang ở đâu:

1. Chưa biết gì về OS: đọc file docs giải thích cho sinh viên năm nhất trong repo, rồi nhờ AI giải thích từng khái niệm. Chạy QEMU xem kernel tự in log.

2. Biết một chút: chọn một mục nhỏ trong lộ trình, nhờ agent đọc code liên quan rồi viết issue mô tả việc cần làm.

3. Có token dư: thả agent vào đọc issue, sửa code, chạy cổng test, mở pull request. Việc của bạn là đọc kỹ diff và không tin agent mù quáng.

Dự án này mình đang làm đúng kiểu đó: mỗi vòng, agent đọc issue, sửa, chạy test, ghi báo cáo. Đến giờ có 101 báo cáo và 705 commit. Không phải agent tự lái cả dự án, mà là mình đưa việc, agent làm, mình kiểm.

Nếu bạn có Claude Code, Codex hay Cursor đang rảnh, đây là chỗ để dùng. Nếu chưa có, đọc log thôi cũng học được nhiều.

KẾT

Mình không cần bạn giỏi kernel. Mình cần bạn kiên nhẫn đọc log và chịu sửa khi test đỏ.

Nói rõ để bạn khỏi kỳ vọng sai: đây là dự án nghiên cứu, chưa phải hệ điều hành dùng hằng ngày như Linux.

Repo và link chạy thử mình để trong ảnh. Ai làm OS rồi, hoặc ai đang làm chip ở Việt Nam, cho mình xin góp ý với. Nhất là chỗ nào mình đang hiểu sai.

#OSDev #Rust #Microkernel #VibeCoding #HeDieuHanh #MaNguonMo
