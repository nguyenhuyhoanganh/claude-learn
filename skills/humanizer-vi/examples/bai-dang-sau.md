Mình đang viết một hệ điều hành bằng Rust, tên là ViFastOs, và đang tìm người làm cùng.

Kernel hiện khoảng 16.700 dòng, boot được trên QEMU cho cả RISC-V, ARM64 lẫn x86_64. Đã có 51 syscall, chạy được chương trình ở user mode, có IPC, capability, filesystem và shell riêng. ViFastOs là microkernel, học theo seL4, nên driver và filesystem chạy ở user space, kernel chỉ giữ phần cấp quyền, IPC, lập lịch và bộ nhớ ảo. Crate lõi cấm hẳn unsafe. Chỗ nào buộc phải unsafe thì nằm ở crate riêng, có tài liệu và test riêng.

Ngày 3 tháng 11 năm 2026, Việt Nam ra mắt chip bảo mật đầu tiên do người Việt thiết kế, VGC v1.0, dùng kiến trúc RISC-V. Nếu 5 đến 10 năm nữa Việt Nam làm CPU, mình muốn lúc đó đã có sẵn một bộ khung phần mềm chạy được trên chip đó, gõ và hiển thị được tiếng Việt từ đầu. Vì vậy mình chọn RISC-V làm kiến trúc đầu tiên, giữ kernel nhỏ để port sang chip mới cho nhanh.

Dự án hợp với bạn nào muốn vibe coding mà chưa biết làm gì, vì việc có sẵn và sai là biết ngay. Có 297 test chạy trên máy host, cộng self-test trong QEMU cho cả ba kiến trúc. Sai một chỗ là cổng test báo đỏ, code không được gộp vào. Mình làm với agent theo vòng: mình đưa việc, agent làm, mình kiểm. Đến giờ có 705 commit và 101 báo cáo.

Chưa biết gì về OS thì bạn đọc file docs viết cho sinh viên năm nhất trong repo rồi chạy QEMU xem kernel in log. Biết một chút thì chọn một mục nhỏ trong lộ trình, nhờ agent đọc code liên quan rồi viết issue. Có Claude Code, Codex hay Cursor đang rảnh thì thả agent vào sửa code, chạy cổng test, mở pull request, nhớ đọc kỹ diff.

Đây mới là dự án nghiên cứu, chưa dùng hằng ngày được như Linux. Repo và link chạy thử mình để trong ảnh. Ai làm OS rồi, hoặc đang làm chip ở Việt Nam, thì chỉ giúp mình chỗ nào mình đang hiểu sai với.

#OSDev #Rust #Microkernel #VibeCoding
