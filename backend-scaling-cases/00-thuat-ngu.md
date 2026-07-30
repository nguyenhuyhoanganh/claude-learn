# Từ điển thuật ngữ — mọi từ tiếng Anh trong khoá học

Tra cứu nhanh. Mỗi mục gồm: **thuật ngữ tiếng Anh — cách gọi tiếng Việt — định nghĩa dễ hiểu — nơi học sâu**.

Đọc lướt một lần trước khi vào khoá, rồi quay lại tra khi gặp từ lạ.

---

## A. Nền tảng mạng và HTTP

**HTTP (HyperText Transfer Protocol) — giao thức truyền siêu văn bản**
Quy ước về **định dạng tin nhắn** giữa client và server: câu hỏi (request) trông thế nào, câu trả lời (response) trông thế nào. Nó chỉ lo nội dung, không lo việc vận chuyển.
→ phase-1 bài 1

**TCP (Transmission Control Protocol) — giao thức điều khiển truyền vận**
Lo việc **vận chuyển**: đảm bảo dữ liệu tới nơi đúng thứ tự, không mất. HTTP chạy bên trên TCP.
→ phase-1 bài 1

**Connection — kết nối**
Một "đường ống" TCP đã được thiết lập giữa hai máy. Muốn có nó phải "bắt tay" trước.
→ phase-1 bài 1

**Three-way handshake — bắt tay ba bước**
Ba bước SYN → SYN-ACK → ACK để mở một kết nối TCP. Tốn một vòng đi-về mạng, nên **mở kết nối là việc đắt**. Đây là lý do tồn tại của connection pool.
→ phase-1 bài 1

**RTT (Round-Trip Time) — thời gian đi và về**
Thời gian một gói tin đi tới đích và quay lại. Cùng datacenter ~0,5 ms; Việt Nam → Singapore ~30-50 ms.
→ phase-1 bài 1

**Keep-alive — giữ kết nối sống**
Giữ kết nối TCP mở sau khi trả response, để request sau dùng lại mà khỏi bắt tay lần nữa.
→ phase-1 bài 1, phase-6 case 3

**DNS (Domain Name System) — hệ thống tên miền**
"Danh bạ" của Internet, đổi tên miền (`shop.vn`) thành địa chỉ IP (`203.0.113.10`).
→ phase-6 case 4

**TTL (Time To Live) — thời gian sống**
Một giá trị được coi là còn hiệu lực trong bao lâu. Dùng cho DNS, cache, khoá phân tán.
→ phase-4 case 2, phase-6 case 4

**FQDN (Fully Qualified Domain Name) — tên miền đầy đủ tuyệt đối**
Tên miền viết đầy đủ có dấu chấm ở cuối (`api.partner.com.`), báo cho hệ thống biết đừng ghép thêm hậu tố tìm kiếm nào.
→ phase-6 case 4

**Load balancer — bộ cân bằng tải**
Máy đứng trước nhiều server, nhận request rồi chia đều xuống. Ví dụ: Nginx, HAProxy, AWS ALB.
→ phase-1 bài 1

**Reverse proxy — proxy ngược**
Máy đứng *trước server* để nhận request thay server ("ngược" vì proxy thường đứng trước client). Load balancer là một dạng reverse proxy.
→ phase-1 bài 1

**Ephemeral port — cổng tạm thời**
Dải cổng (~28.000 cổng, thường 32768-60999) mà hệ điều hành tự chọn làm cổng nguồn khi ứng dụng **gọi ra ngoài**. Cạn dải này thì không mở được kết nối mới.
→ phase-6 case 3

**TIME_WAIT — trạng thái chờ dọn dẹp**
Sau khi đóng kết nối, bên đóng trước phải giữ cổng ở trạng thái này 60 giây để nuốt các gói tin đến muộn. Đây là thủ phạm chính gây cạn cổng.
→ phase-6 case 3

**File descriptor (fd) — mô tả tệp**
Một số nguyên hệ điều hành cấp cho mỗi thứ tiến trình mở: file, socket, pipe. Mỗi kết nối TCP tốn 1 fd. Mặc định giới hạn 1024 — quá thấp.
→ phase-6 case 3

**Conntrack — bảng theo dõi kết nối**
Bảng của nhân Linux ghi lại mọi kết nối đang mở (dùng bởi iptables/NAT, nghĩa là mọi cụm Kubernetes). Bảng đầy → gói tin bị **loại bỏ âm thầm**.
→ phase-6 case 3

---

## B. Luồng, hàng đợi và tài nguyên

**Thread — luồng**
Đơn vị thực thi của hệ điều hành. Một CPU core tại một thời điểm chỉ chạy được một thread.
→ phase-1 bài 1

**Context switch — chuyển ngữ cảnh**
Việc hệ điều hành đổi từ thread này sang thread khác. Mỗi lần tốn 1-10 micro-giây. Quá nhiều thread → tốn thời gian đổi hơn là làm việc.
→ phase-1 bài 1

**Thread pool — bể luồng**
Một tập thread được tạo sẵn và tái sử dụng, thay vì tạo mới mỗi lần cần.
→ phase-1 bài 2

**Thread-per-request — mỗi request một luồng**
Mô hình mà mỗi request được giao đúng một thread và thread đó bị **giữ** cho tới khi request xong. Đây là mô hình của Spring MVC.
→ phase-1 bài 1

**Worker thread — luồng làm việc**
Thread thực sự chạy code của bạn. Trong Tomcat có 3 loại thread; chỉ worker mới chạy code ứng dụng.
→ phase-1 bài 1

**Connection pool — bể kết nối**
Tập kết nối tới database được mở sẵn từ lúc khởi động và dùng đi dùng lại. Lý do: mở kết nối tới PostgreSQL tốn 20-50 ms.
→ phase-2 case 2

**Servlet container — vùng chứa servlet**
Phần mềm nhận byte thô từ mạng, dịch thành đối tượng request, tìm đúng hàm controller để gọi, rồi dịch kết quả thành byte gửi về. Tomcat, Jetty, Undertow.
→ phase-1 bài 1

**NIO (Non-blocking I/O) — vào/ra không chặn**
Cơ chế cho phép một thread canh hàng nghìn kết nối cùng lúc, chỉ "thức dậy" khi kết nối nào đó có dữ liệu.
→ phase-1 bài 1

**Blocking / Non-blocking — chặn / không chặn**
Lời gọi *chặn* làm thread đứng chờ tới khi có kết quả. Lời gọi *không chặn* trả về ngay và báo kết quả sau qua callback.
→ phase-2 case 8

**Backlog / Accept queue — hàng đợi chấp nhận**
Hàng đợi của **hệ điều hành** chứa các kết nối đã bắt tay xong, đang chờ ứng dụng gọi `accept()`. Đầy thì kernel từ chối thẳng ("Connection refused").
→ phase-1 bài 2

**Bounded queue / Unbounded queue — hàng đợi có giới hạn / vô hạn**
Hàng đợi vô hạn nghe an toàn nhưng dẫn tới `OutOfMemoryError` và metastable failure. Luôn dùng hàng đợi có trần.
→ phase-2 case 7

**Backpressure — áp lực ngược**
Khả năng của bên nhận nói với bên gửi "chậm lại". TCP có cửa sổ nhận; Kafka có cơ chế kéo; thread pool có `CallerRunsPolicy`.
→ phase-2 case 7

**Semaphore — đèn hiệu / bộ đếm giấy phép**
Một bộ đếm giới hạn số việc được làm đồng thời: xin phép trước khi làm, trả lại sau khi xong, hết phép thì bị từ chối.
→ phase-2 case 5

**Virtual thread — luồng ảo**
Thread do JVM quản lý (Java 21+), rẻ như một object (~1 KB thay vì 1 MB). Cho phép hàng triệu "thread" cùng lúc.
→ phase-2 case 8

**Carrier thread — luồng mang**
Platform thread thật sự chạy các virtual thread. Khi virtual thread gặp lời gọi chặn, JVM "tháo" nó ra để carrier làm việc khác.
→ phase-2 case 8

**Pinning — ghim**
Tình trạng virtual thread **không tháo ra được** khỏi carrier thread (ví dụ khi ở trong khối `synchronized` trên JDK cũ hơn 24) — làm mất hết lợi ích của virtual thread.
→ phase-2 case 8

**Work-stealing — ăn cắp việc**
Cơ chế của `ForkJoinPool`: thread đang rảnh sẽ lấy việc từ hàng đợi của thread khác thay vì ngồi không.
→ phase-2 case 4

---

## C. Đo lường hiệu năng

**Latency — độ trễ**
Thời gian từ lúc gửi request đến lúc nhận đủ response.
→ phase-1 bài 3

**Throughput — thông lượng**
Số request xử lý xong trong một đơn vị thời gian. Đơn vị: RPS (requests per second), QPS, TPS.
→ phase-1 bài 3

**Concurrency — số việc đồng thời**
Số request **đang dở dang** tại một thời điểm. Khác throughput (số việc *xong* mỗi giây).
→ phase-1 bài 3

**Parallelism — tính song song**
Số việc thực sự chạy **cùng lúc** trên các core khác nhau. Concurrency là "nhiều việc đang mở"; parallelism là "nhiều việc đang chạy thật".
→ phase-1 bài 3

**Utilization — mức sử dụng**
Tỉ lệ thời gian một tài nguyên bận. CPU 70% = 70% thời gian CPU đang tính.
→ phase-1 bài 5

**Saturation — mức bão hoà**
Mức độ "quá tải" của tài nguyên: có hàng đợi không, dài bao nhiêu. Đây là chỉ số **báo trước** — nó tăng trước khi latency tăng.
→ phase-1 bài 4

**Percentile — phân vị**
Sắp xếp toàn bộ latency từ nhỏ tới lớn; p99 là giá trị ở vị trí 99%, nghĩa là 1 trong 100 request chậm hơn con số đó.
→ phase-1 bài 3

**p50 / median — trung vị**
Một nửa số request nhanh hơn con số này. Đại diện cho "trải nghiệm điển hình".
→ phase-1 bài 3

**Tail latency — độ trễ đuôi**
Nhóm request chậm nhất, phần "đuôi" của biểu đồ phân bố. Đây là nhóm quyết định trải nghiệm tệ nhất.
→ phase-1 bài 3

**Tail latency amplification — khuếch đại độ trễ đuôi**
Gọi 10 service mỗi cái p99 = 1 giây → 9,6% request bị chậm, không phải 1%. Đây là lý do microservice dễ chậm.
→ phase-1 bài 3

**Coordinated omission — bỏ sót có phối hợp**
Lỗi đo lường: công cụ benchmark đứng chờ response nên **không gửi** những request lẽ ra phải gửi trong lúc server khựng → các mẫu tệ nhất bị bỏ sót, báo cáo đẹp giả tạo.
→ phase-1 bài 3

**Open model / Closed model — mô hình mở / đóng**
*Mở*: request đến theo tốc độ cố định bất kể server (mô phỏng đúng người dùng Internet). *Đóng*: N người dùng ảo, mỗi người chờ response rồi mới gửi tiếp.
→ phase-1 bài 3

**Golden signals — bốn tín hiệu vàng**
Bốn chỉ số tối thiểu cần theo dõi: latency, traffic, errors, saturation.
→ phase-1 bài 3

**SLI / SLO / SLA**
*SLI (Service Level Indicator)*: chỉ số bạn đo. *SLO (Objective)*: mục tiêu nội bộ. *SLA (Agreement)*: cam kết hợp đồng, vi phạm thì đền tiền.
→ phase-1 bài 3

**Error budget — ngân sách lỗi**
Nếu SLO là 99,9% thì bạn được phép hỏng 0,1% ≈ 43 phút/tháng. Còn ngân sách thì được deploy tính năng mới; hết thì tập trung sửa độ ổn định.
→ phase-1 bài 3

**Little's Law — định luật Little**
`L = λ × W`: số việc đồng thời = throughput × latency. Nền tảng của mọi phép tính pool size.
→ phase-1 bài 4

**USE method — phương pháp USE**
Với mỗi tài nguyên, kiểm tra ba thứ: **U**tilization (bận bao nhiêu %), **S**aturation (có hàng đợi không), **E**rrors (có lỗi không).
→ phase-1 bài 4

**Amdahl's Law — định luật Amdahl**
Phần code chạy tuần tự đặt trần cho tốc độ tối đa, bất kể có bao nhiêu CPU. p = 95% song song → dù vô hạn máy cũng chỉ nhanh được 20 lần.
→ phase-1 bài 5

**USL (Universal Scalability Law) — định luật khả năng mở rộng phổ quát**
Mở rộng Amdahl: ngoài phần tuần tự (α - contention), còn có chi phí đồng bộ giữa các node (β - coherency) tăng theo **bình phương** số node → có điểm mà thêm máy làm **chậm đi**.
→ phase-1 bài 5

**Queueing theory — lý thuyết hàng đợi**
Ngành toán mô tả hành vi hàng đợi. Công thức chính: `latency = service_time / (1 − utilization)` → ở 90% tải, latency gấp 10 lần lúc rảnh.
→ phase-1 bài 5

**Kingman's formula — công thức Kingman**
Thời gian chờ phụ thuộc cả vào **độ biến động** của luồng đến và của thời gian xử lý, không chỉ mức tải → giảm biến động (jitter, bulkhead, index) hiệu quả ngang giảm tải.
→ phase-1 bài 5

**Hockey stick — đường cong gậy khúc côn cầu**
Hình dạng của biểu đồ latency theo tải: phẳng rồi cong vọt lên. "Đầu gối" (knee) của đường cong là công suất thật sự.
→ phase-1 bài 5

**Hysteresis — độ trễ chuyển trạng thái**
Ngưỡng để **thoát khỏi** trạng thái xấu thấp hơn nhiều so với ngưỡng **rơi vào** nó. Đây là lý do phải giảm tải rất mạnh mới thoát metastable failure.
→ phase-4 case 7

---

## D. Cạn kiệt tài nguyên và cô lập

**Resource exhaustion — cạn kiệt tài nguyên**
Tình trạng một tài nguyên hữu hạn (thread, connection, fd, port, bộ nhớ) bị dùng hết.
→ toàn bộ phase-2

**Thread pool exhaustion — cạn kiệt bể luồng**
Mọi worker thread đều bị giam (thường vì chờ downstream chậm) → không còn thread nào phục vụ request mới.
→ phase-2 case 1

**Resource contention — tranh chấp tài nguyên**
Nhiều bên cùng muốn một tài nguyên dùng chung. Đây là hệ số α trong USL.
→ phase-2 case 1

**Cascading failure — sập dây chuyền**
Một thành phần hỏng kéo theo thành phần khác hỏng, lan ra toàn hệ thống như domino.
→ toàn bộ phase-4

**Bulkhead — vách ngăn kín nước**
Chia tài nguyên thành các khoang riêng để sự cố ở một khoang không lan sang khoang khác. Tên lấy từ vách ngăn trên tàu thuỷ.
→ phase-2 case 5

**Circuit breaker — cầu dao**
Khi phát hiện quá nhiều lỗi, "ngắt mạch": các lời gọi tiếp theo **thất bại ngay lập tức (0 ms)** thay vì chờ timeout. Ba trạng thái: CLOSED → OPEN → HALF_OPEN.
→ phase-4 case 3

**Fallback — phương án dự phòng**
Giá trị/hành vi thay thế khi lời gọi chính thất bại. Nên suy giảm theo bậc: dữ liệu tươi → dữ liệu cũ → dữ liệu chung → không có gì.
→ phase-4 case 3

**Graceful degradation — suy giảm có kiểm soát**
Mất một phần chức năng thay vì mất toàn bộ. Trang sản phẩm mất phần "gợi ý" nhưng vẫn mua được hàng.
→ phase-4 case 3

**Brownout — giảm chất lượng**
Chủ động cắt bớt tính năng phụ khi tải cao để phục vụ được nhiều người hơn. Mượn từ ngành điện (giảm điện áp thay vì cắt điện).
→ phase-4 case 4

**Load shedding — xả tải**
Chủ động **từ chối** một phần request để phần còn lại được phục vụ tử tế. Khi quá tải, đây là hành động đúng.
→ phase-4 case 4

**Rate limiting — giới hạn tần suất**
Giới hạn số request mỗi client được gửi trong một khoảng thời gian. Thuật toán: token bucket, leaky bucket, sliding window.
→ phase-4 case 4

**Token bucket — xô token**
Thuật toán rate limit: xô chứa N token, nạp thêm R token/giây, mỗi request lấy 1 token. Cho phép burst tới N nhưng tốc độ trung bình là R.
→ phase-4 case 4

**Concurrency limit — giới hạn số việc đồng thời**
Giới hạn số request **đang chạy** (khác rate limit đếm request/giây). Bảo vệ tốt hơn vì nó tự thích ứng khi latency tăng.
→ phase-4 case 4

**Adaptive concurrency limit — giới hạn thích ứng**
Hệ thống tự tìm giới hạn tối ưu bằng cách theo dõi latency (giống điều khiển tắc nghẽn của TCP), không cần chỉnh tay.
→ phase-4 case 4

**CoDel (Controlled Delay) — trễ có kiểm soát**
Thuật toán giới hạn **thời gian nằm trong hàng đợi** thay vì kích thước hàng đợi — phân biệt được burst ngắn (chấp nhận được) với quá tải kéo dài (phải bỏ bớt).
→ phase-4 case 4

**Deadline propagation — truyền hạn chót**
Request mang theo "tôi chỉ còn giá trị đến thời điểm T"; mỗi tầng kiểm tra trước khi làm, quá hạn thì bỏ.
→ phase-1 bài 5, phase-2 case 3

**Retry storm — bão thử lại**
Retry ở nhiều tầng nhân tải lên theo cấp số nhân (`r^n`), biến sự cố nhỏ thành sự cố toàn diện.
→ phase-4 case 1

**Retry budget — ngân sách thử lại**
Giới hạn cứng: retry không được vượt quá X% (thường 10%) tổng số request, dù mọi thứ đang hỏng.
→ phase-4 case 1

**Exponential backoff — lùi theo cấp số nhân**
Chờ lâu dần giữa các lần thử lại: 100 ms → 200 ms → 400 ms.
→ phase-4 case 1

**Jitter — nhiễu ngẫu nhiên**
Cộng một lượng ngẫu nhiên vào thời điểm thực hiện, để nhiều bên không cùng làm một việc tại một thời điểm.
→ phase-4 case 1, phase-6 case 8

**Full jitter — nhiễu toàn phần**
Công thức backoff được khuyến nghị: `delay = random(0, base × 2^n)` thay vì `base × 2^n` cố định.
→ phase-4 case 1

**Thundering herd — đàn thú giẫm đạp**
Nhiều tiến trình cùng "thức dậy" và cùng làm một việc tại một thời điểm.
→ phase-4 case 2, phase-6 case 8

**Metastable failure — hỏng ở trạng thái giả ổn định**
Hệ thống mắc kẹt ở trạng thái hỏng **tự duy trì**, không thoát ra dù nguyên nhân gốc đã biến mất.
→ phase-4 case 7

**Trigger / Sustaining effect — cú kích hoạt / hiệu ứng duy trì**
*Trigger*: nguyên nhân ban đầu, thường rất ngắn. *Sustaining effect*: thứ giữ hệ thống ở trạng thái xấu (retry storm, hàng đợi rác, cache trống). **Sửa trigger không đủ.**
→ phase-4 case 7

**Noisy neighbor — hàng xóm ồn ào**
Một khách hàng/tenant dùng quá nhiều tài nguyên làm ảnh hưởng những người khác dùng chung hạ tầng.
→ phase-2 case 5

**Kill switch / Feature flag — công tắc khẩn cấp / cờ tính năng**
Cơ chế bật/tắt tính năng **mà không cần deploy** (đọc từ config server). Trong sự cố, deploy mất 20 phút; đổi cờ mất 30 giây.
→ phase-4 case 8

---

## E. Database và đồng thời

**Transaction — giao dịch**
Một nhóm thao tác được thực hiện "tất cả hoặc không gì cả".
→ phase-3 case 1

**ACID**
Bốn tính chất của transaction: **A**tomicity (nguyên tử), **C**onsistency (nhất quán), **I**solation (cô lập), **D**urability (bền vững).
→ phase-3

**Lock — khoá**
Cơ chế database giữ chỗ trên một tài nguyên (dòng, bảng, khoảng giá trị) để giao dịch khác phải chờ.
→ phase-3 case 1

**Row lock / Table lock — khoá dòng / khoá bảng**
Khoá một dòng dữ liệu vs khoá cả bảng. InnoDB và PostgreSQL mặc định dùng row lock cho thao tác ghi thông thường.
→ phase-3 case 1

**Shared lock (S) / Exclusive lock (X) — khoá chia sẻ / khoá độc quyền**
*Shared*: nhiều giao dịch cùng giữ được (dùng khi đọc). *Exclusive*: chỉ một giao dịch giữ được (dùng khi ghi).
→ phase-3 case 1

**MVCC (Multi-Version Concurrency Control) — điều khiển đồng thời đa phiên bản**
Database giữ **nhiều phiên bản** của mỗi dòng: người đọc thấy bản cũ, người ghi tạo bản mới. Hệ quả: **đọc không chặn ghi, ghi không chặn đọc, chỉ ghi chặn ghi**.
→ phase-3 case 1

**Bloat — phình**
Các phiên bản dữ liệu cũ chưa được dọn làm bảng/index phình to. Nguyên nhân chính: transaction chạy quá lâu.
→ phase-3 case 2

**VACUUM — dọn dẹp (PostgreSQL)**
Tiến trình thu hồi không gian của các phiên bản dữ liệu cũ. Bị chặn bởi transaction dài.
→ phase-3 case 2

**Idle in transaction — mở transaction rồi ngồi không**
Trạng thái nguy hiểm nhất trong PostgreSQL: giao dịch đã mở, đang giữ lock, nhưng ứng dụng đang làm việc khác (gọi HTTP, chờ thread).
→ phase-3 case 2

**Deadlock — bế tắc**
Hai giao dịch chờ lẫn nhau thành vòng tròn, không ai đi tiếp được. Database phát hiện và hy sinh một giao dịch.
→ phase-3 case 3

**Lock ordering — thứ tự khoá**
Kỹ thuật chống deadlock: mọi giao dịch luôn khoá theo cùng một thứ tự (ví dụ ID tăng dần) → vòng tròn chờ không thể hình thành.
→ phase-3 case 3

**Lost update — mất cập nhật**
Hai giao dịch cùng đọc-sửa-ghi, thay đổi của người trước bị ghi đè âm thầm.
→ phase-3 case 5

**Optimistic locking — khoá lạc quan**
Không khoá gì; khi ghi thì kiểm tra cột `version` có đổi không. Tốt khi xung đột hiếm (< 20%).
→ phase-3 case 5

**Pessimistic locking — khoá bi quan**
Khoá dòng ngay khi đọc (`SELECT ... FOR UPDATE`). Tốt khi xung đột thường xuyên (> 30%).
→ phase-3 case 5

**SKIP LOCKED — bỏ qua dòng đang bị khoá**
Biến thể của `FOR UPDATE`: gặp dòng đang bị khoá thì bỏ qua, lấy dòng tiếp theo. Công cụ tuyệt vời để làm hàng đợi công việc bằng database.
→ phase-3 case 5

**Hot row / Hot key — dòng nóng / khoá nóng**
Một bản ghi bị rất nhiều giao dịch cùng muốn ghi. **Không giải được bằng cách thêm máy** — phải đổi cách ghi.
→ phase-3 case 4, phase-4 case 5

**Race condition — tình trạng tranh đua**
Kết quả phụ thuộc vào thứ tự tình cờ của các thao tác đồng thời.
→ phase-3 case 6

**TOCTOU (Time-Of-Check to Time-Of-Use) — khe hở giữa kiểm tra và sử dụng**
Mẫu code `if (điều_kiện) { hành_động }` luôn có khe hở để request khác chen vào giữa hai bước.
→ phase-3 case 6

**Isolation level — mức cô lập**
Mức độ các transaction "nhìn thấy" nhau: READ UNCOMMITTED → READ COMMITTED → REPEATABLE READ → SERIALIZABLE.
→ phase-3 case 7

**Dirty read — đọc bẩn**
Đọc được dữ liệu mà giao dịch khác **chưa commit** — và có thể sẽ rollback.
→ phase-3 case 7

**Non-repeatable read — đọc lặp không nhất quán**
Đọc cùng một dòng hai lần trong cùng transaction, ra hai kết quả khác nhau.
→ phase-3 case 7

**Phantom read — đọc bóng ma**
Chạy lại cùng một truy vấn theo điều kiện, xuất hiện **dòng mới**.
→ phase-3 case 7

**Write skew — lệch ghi**
Hai transaction đều đọc, đều thấy điều kiện hợp lệ, đều ghi vào **hai dòng khác nhau** — và kết quả tổng hợp vi phạm quy tắc nghiệp vụ. Chỉ `SERIALIZABLE` ngăn được.
→ phase-3 case 7

**Gap lock — khoá khoảng trống**
Đặc sản của MySQL InnoDB ở mức REPEATABLE READ: khoá cả **khoảng trống giữa các giá trị index**, nên hai INSERT vào giá trị khác nhau vẫn có thể chặn nhau.
→ phase-3 case 7

**Next-key lock — khoá bản ghi kèm khoảng trống**
Record lock + gap lock phía trước nó. Kiểu khoá mặc định của InnoDB ở REPEATABLE READ.
→ phase-3 case 7

**SSI (Serializable Snapshot Isolation) — cô lập ảnh chụp tuần tự hoá**
Cách PostgreSQL cài đặt SERIALIZABLE: không khoá, mà theo dõi phụ thuộc đọc-ghi và huỷ giao dịch khi phát hiện mẫu nguy hiểm. **Bắt buộc phải có retry.**
→ phase-3 case 7

**Materializing conflicts — vật chất hoá xung đột**
Kỹ thuật: tạo một dòng "đại diện" để khoá, biến bài toán cần SERIALIZABLE thành bài toán lock thông thường (rẻ hơn nhiều).
→ phase-3 case 7

**N+1 query — truy vấn N+1**
1 truy vấn lấy danh sách cha + N truy vấn lấy dữ liệu con cho từng phần tử → hàng trăm câu SQL cho một request.
→ phase-3 case 8

**Lazy loading / Eager loading — nạp lười / nạp sớm**
*Lười*: chỉ nạp dữ liệu liên quan khi thật sự truy cập. *Sớm*: nạp ngay. `@ManyToOne` mặc định là **EAGER** — nguồn N+1 hay bị bỏ sót.
→ phase-3 case 8

**Keyset pagination / Cursor pagination — phân trang theo khoá**
Thay `OFFSET 100000` (phải đọc bỏ 100.000 dòng) bằng `WHERE (created_at, id) < (...)` → thời gian không đổi dù ở trang nào.
→ phase-3 case 8

**EXPLAIN — giải thích kế hoạch thực thi**
Lệnh cho biết database dự định thực thi truy vấn thế nào. Công cụ số một khi tối ưu query.
→ phase-3 case 9

**Full table scan / Seq Scan — quét toàn bảng**
Database đọc mọi dòng để tìm kết quả. Trên bảng lớn là dấu hiệu thiếu index.
→ phase-3 case 9

**Covering index — index bao phủ**
Index chứa **mọi cột** truy vấn cần → database không phải đọc bảng chính. Nhanh hơn 2-10 lần.
→ phase-3 case 9

**Leftmost prefix — tiền tố trái nhất**
Quy tắc: composite index `(a, b, c)` chỉ dùng được cho truy vấn có điều kiện trên `a`, hoặc `a+b`, hoặc `a+b+c` — không dùng được nếu chỉ có `b`.
→ phase-3 case 9

**Partitioning — phân vùng**
Chia một bảng lớn thành nhiều phần **trong cùng một database**. Database tự quản lý, vẫn JOIN được, vẫn có transaction.
→ phase-5 case 6

**Sharding — phân mảnh**
Chia dữ liệu ra **nhiều database/server khác nhau**. Ứng dụng phải tự quản lý; mất JOIN và transaction xuyên mảnh.
→ phase-5 case 6

**Shard key — khoá phân mảnh**
Cột quyết định dữ liệu nằm ở shard nào. Quyết định khó đảo ngược nhất khi sharding.
→ phase-5 case 6

**Consistent hashing — băm nhất quán**
Kỹ thuật ánh xạ khoá vào node sao cho khi thêm/bớt node, chỉ ~1/N dữ liệu phải di chuyển (thay vì gần hết).
→ phase-5 case 6

**Virtual shard / Virtual node — mảnh ảo / node ảo**
Tạo sẵn nhiều mảnh ảo (ví dụ 1024) ánh xạ vào ít máy vật lý → thêm máy chỉ cần chuyển vài mảnh ảo.
→ phase-5 case 6

**Colocation — đặt cùng chỗ**
Thiết kế để dữ liệu liên quan (của cùng người dùng/tenant) nằm trên cùng một shard → phần lớn truy vấn vẫn chạy trong một shard.
→ phase-5 case 6

**Scatter-gather — rải và gom**
Truy vấn phải hỏi **mọi** shard rồi gộp kết quả. Chậm bằng shard chậm nhất.
→ phase-5 case 6

**Replication — nhân bản**
Sao chép dữ liệu từ node chính (primary) sang các node phụ (replica).
→ phase-5 case 5

**Replication lag — độ trễ nhân bản**
Khoảng thời gian dữ liệu mới chưa xuất hiện trên replica. Bình thường vài ms, nhưng có thể lên hàng phút.
→ phase-5 case 5

**Read-your-own-writes — đọc được thứ mình vừa ghi**
Đảm bảo người dùng luôn thấy được thay đổi của **chính họ**, dù hệ thống có nhất quán cuối cùng.
→ phase-5 case 5

**Monotonic reads — đọc đơn điệu**
Đảm bảo lần đọc sau không bao giờ trả về dữ liệu **cũ hơn** lần đọc trước.
→ phase-5 case 5

**Eventual consistency — nhất quán cuối cùng**
Cuối cùng mọi bản sao sẽ giống nhau, nhưng trong thời gian ngắn có thể lệch.
→ phase-5 case 5

**Split-brain — não chia đôi**
Hai node cùng tưởng mình là primary và cùng nhận ghi → dữ liệu phân kỳ.
→ phase-5 case 5

**Fencing — rào chặn**
Cơ chế chặn node cũ tiếp tục ghi sau khi đã bị thay thế. Cần thiết để tránh split-brain.
→ phase-5 case 5, phase-3 case 6

---

## F. Cache

**Cache — bộ nhớ đệm**
Lưu tạm kết quả để lần sau khỏi tính lại.
→ phase-4 case 2

**Cache hit / miss — trúng / trượt cache**
*Hit*: tìm thấy trong cache. *Miss*: không có, phải lấy từ nguồn gốc.
→ phase-4 case 2

**Cache stampede / Dog-piling — giẫm đạp cache**
Một khoá nóng hết hạn → hàng nghìn request cùng thấy miss và cùng lao xuống database.
→ phase-4 case 2

**Cache penetration — xuyên thủng cache**
Request hỏi những khoá **không tồn tại** → không bao giờ cache được → mọi request đều xuống database.
→ phase-4 case 2

**Cache avalanche — tuyết lở cache**
Rất nhiều khoá hết hạn cùng lúc, hoặc cả cụm cache chết.
→ phase-4 case 2

**Stale-while-revalidate — trả dữ liệu cũ trong lúc làm mới**
Trả về giá trị cũ **ngay lập tức**, đồng thời làm mới ở nền. Giải pháp tốt nhất cho cache stampede.
→ phase-4 case 2

**Cache-aside — cache bên cạnh**
Mẫu phổ biến nhất: ứng dụng tự đọc cache, miss thì đọc DB rồi ghi vào cache. Khi cập nhật thì **xoá** cache (không ghi đè).
→ phase-4 case 2

**Bloom filter — bộ lọc Bloom**
Cấu trúc dữ liệu xác suất trả lời "phần tử này CÓ THỂ tồn tại không?" với bộ nhớ cực nhỏ. Trả lời "không" thì chắc chắn không tồn tại.
→ phase-4 case 2

**Warm-up — làm nóng**
Chạy trước các đường dẫn code và nạp trước cache/pool để hệ thống sẵn sàng trước khi nhận traffic thật.
→ phase-6 case 7

**Cold start — khởi động lạnh**
Trạng thái chậm của một tiến trình vừa khởi động: JIT chưa biên dịch, class chưa nạp, cache và pool còn trống.
→ phase-6 case 7

---

## G. Kiến trúc và bất đồng bộ

**Monolith — khối đơn**
Toàn bộ chức năng nằm trong một ứng dụng duy nhất, deploy như một khối.
→ phase-5 case 1

**Modular monolith — khối đơn có module**
Monolith với ranh giới module rõ ràng, module chỉ gọi nhau qua API công khai. Có lợi ích ranh giới mà không có chi phí phân tán.
→ phase-5 case 3

**Distributed monolith — khối đơn phân tán**
Nhiều service nhưng dùng chung database và phải deploy đồng bộ. **Kiến trúc tệ nhất** — mọi nhược điểm, không ưu điểm nào.
→ phase-5 case 3

**Stateless / Stateful — không trạng thái / có trạng thái**
*Stateless*: instance không giữ thông tin cần cho request sau → request nào cũng xử lý được bởi instance nào. Điều kiện tiên quyết của scale ngang.
→ phase-5 case 2

**Sticky session — phiên dính**
Load balancer luôn gửi cùng một người dùng tới cùng một instance. Giải pháp tệ nhất cho vấn đề session.
→ phase-5 case 2

**Scale up / Scale vertically — mở rộng dọc**
Làm máy hiện tại mạnh hơn (thêm CPU, RAM). Không đổi code, nhưng có trần cứng.
→ phase-5 case 1

**Scale out / Scale horizontally — mở rộng ngang**
Thêm nhiều máy, chia tải. Cần stateless, và cũng có trần do USL.
→ phase-5 case 1

**Strangler Fig — cây si bóp nghẹt**
Mẫu chuyển đổi: đặt proxy trước hệ thống cũ, dần chuyển từng phần sang hệ thống mới theo trọng số → quay lại được bất cứ lúc nào.
→ phase-5 case 3

**Anti-corruption layer — lớp chống ăn mòn**
Đặt mọi phụ thuộc bên ngoài sau một interface của riêng mình, để mô hình dữ liệu của họ không rò rỉ vào miền nghiệp vụ của bạn.
→ phase-4 case 8

**Outbox pattern — mẫu hộp thư đi**
Ghi sự kiện vào **cùng database, cùng transaction** với dữ liệu nghiệp vụ; một tiến trình riêng đọc và đẩy sang message broker. Giải pháp cho vấn đề dual write.
→ phase-5 case 4

**Dual write — ghi kép**
Ghi vào hai hệ thống khác nhau trong một luồng logic. **Luôn có khe hở** — không có transaction nguyên tử xuyên hai hệ thống.
→ phase-5 case 4

**CDC (Change Data Capture) — bắt thay đổi dữ liệu**
Đọc trực tiếp nhật ký ghi của database (WAL/binlog) để phát hiện thay đổi và đẩy đi. Chắc chắn hơn dual write.
→ phase-5 case 4

**Saga — chuỗi giao dịch bù trừ**
Thay cho transaction phân tán: chuỗi các bước, nếu bước sau thất bại thì chạy **hành động bù trừ** để hoàn tác các bước trước.
→ phase-5 case 4

**Compensating action — hành động bù trừ**
Hành động **mới** để bù lại việc đã làm (gửi email xin lỗi, hoàn tiền) — không phải rollback, vì bạn không xoá được email đã gửi.
→ phase-5 case 4

**DLQ (Dead Letter Queue) — hàng đợi thư chết**
Nơi chứa message không xử lý được sau mọi lần thử. **Không có cảnh báo thì DLQ vô dụng.**
→ phase-5 case 4

**Poison message — tin nhắn độc**
Message gây lỗi vĩnh viễn, retry mãi mãi và chặn cả partition.
→ phase-5 case 4, phase-6 case 6

**Consumer lag — độ trễ tiêu thụ**
Số message đã được gửi vào topic nhưng chưa được consumer xử lý. Chỉ số sống còn của hệ thống bất đồng bộ.
→ phase-5 case 4

**Idempotent — bất biến khi lặp**
Thực hiện nhiều lần cho kết quả **giống hệt** thực hiện một lần.
→ phase-5 case 7

**At-most-once / At-least-once / Exactly-once**
*Nhiều nhất một lần* (có thể mất) / *ít nhất một lần* (có thể trùng) / *đúng một lần*. **Exactly-once delivery không tồn tại** — chỉ có at-least-once + xử lý idempotent.
→ phase-5 case 7

**Idempotency key — khoá bất biến**
Mã duy nhất do **client** sinh cho mỗi ý định thao tác, gửi kèm request để server nhận ra request trùng.
→ phase-5 case 7

**Fan-out on write / on read — toả khi ghi / khi đọc**
*Khi ghi*: đăng bài xong đẩy ngay vào feed của mọi follower (đọc nhanh, ghi chậm). *Khi đọc*: chỉ lưu bài, lúc đọc mới kéo về (ghi nhanh, đọc chậm).
→ phase-4 case 5

**Celebrity problem — bài toán người nổi tiếng**
Người có 50 triệu follower làm hỏng mọi giả định về fan-out. Giải pháp lai: đẩy cho người thường, kéo cho người nổi tiếng.
→ phase-4 case 5

**Head-of-line blocking (HOL) — chặn ở đầu hàng**
Phần tử đầu hàng bị chặn làm mọi phần tử phía sau chặn theo, kể cả những cái xử lý được ngay. **Không phải vấn đề công suất mà là vấn đề thứ tự.**
→ phase-6 case 6

---

## H. JVM và hạ tầng

**GC (Garbage Collection) — thu gom rác**
Cơ chế tự động thu hồi bộ nhớ của các object không còn dùng.
→ phase-6 case 1

**Stop-the-world (STW) — dừng cả thế giới**
Giai đoạn GC phải **dừng toàn bộ thread ứng dụng**. Phá vỡ mọi giả định về thời gian trong code.
→ phase-6 case 1

**Young / Old generation — thế hệ trẻ / già**
Heap chia theo tuổi object: object mới sinh ở Young, sống lâu thì chuyển sang Old. Dựa trên quan sát "phần lớn object chết trẻ".
→ phase-6 case 1

**Minor GC / Full GC**
*Minor*: dọn Young, nhanh (1-20 ms), thường xuyên. *Full*: dọn Old, chậm (100 ms - vài giây), ít xảy ra.
→ phase-6 case 1

**Allocation rate — tốc độ cấp phát**
Lượng bộ nhớ được cấp phát mỗi giây. Chỉ số quan trọng nhất về GC — **giảm rác hiệu quả hơn chỉnh tham số GC**.
→ phase-6 case 1

**GC thrashing — GC quay cuồng**
JVM dành gần hết CPU cho GC nhưng thu hồi được rất ít. Ứng dụng vẫn chạy nhưng chậm gấp 50 lần.
→ phase-2 case 7

**Humongous object — object khổng lồ**
Với G1 GC, object lớn hơn nửa kích thước một vùng (region) → cấp phát rất kém hiệu quả.
→ phase-6 case 1

**Compressed oops — con trỏ nén**
Dưới heap 32 GB, JVM dùng con trỏ 32-bit thay vì 64-bit → tiết kiệm bộ nhớ đáng kể. Vượt ngưỡng này, cùng lượng dữ liệu chiếm nhiều bộ nhớ hơn.
→ phase-6 case 1

**JIT (Just-In-Time compiler) — trình biên dịch tức thời**
JVM chạy thông dịch trước, đếm số lần thực thi, chỉ biên dịch sang mã máy những phần "nóng". Cần ~10.000 lần gọi để đạt mức tối ưu nhất (C2).
→ phase-6 case 7

**AppCDS (Class Data Sharing) — chia sẻ dữ liệu class**
Lưu trạng thái đã phân tích của class vào file, JVM nạp trực tiếp thay vì phân tích lại → giảm 20-40% thời gian khởi động.
→ phase-6 case 7

**CRaC (Coordinated Restore at Checkpoint) — khôi phục từ điểm chụp**
Chụp toàn bộ trạng thái JVM đã warm-up và khôi phục lại trong ~100 ms.
→ phase-6 case 7

**Native image — ảnh biên dịch sẵn**
Biên dịch Java sang mã máy trước khi chạy (GraalVM): khởi động 50 ms, RAM giảm 5-7 lần, nhưng **thông lượng đỉnh thấp hơn JIT 10-30%**.
→ phase-6 case 7

**Thread dump — ảnh chụp luồng**
Ảnh chụp tức thời trạng thái mọi thread trong JVM: đang chạy hàm nào, đang chờ gì. Công cụ chẩn đoán mạnh nhất.
→ phase-1 bài 6

**Heap dump — ảnh chụp vùng nhớ**
Ảnh chụp toàn bộ object trong heap, dùng để tìm cái gì chiếm bộ nhớ.
→ phase-2 case 7

**Flame graph — biểu đồ ngọn lửa**
Cách trực quan hoá kết quả lấy mẫu: trục ngang là tỉ lệ thời gian, trục dọc là độ sâu ngăn xếp gọi hàm.
→ phase-1 bài 6

**JFR (Java Flight Recorder) — hộp đen của JVM**
Công cụ ghi lại sự kiện bên trong JVM với chi phí rất thấp (~1% CPU), dùng được trên production.
→ phase-2 case 6

**CAS (Compare-And-Swap) — so sánh và hoán đổi**
Lệnh CPU nguyên tử cho phép cập nhật giá trị mà không cần lock. Nền tảng của `AtomicLong`.
→ phase-2 case 6

**False sharing — chia sẻ giả**
Hai biến độc lập nằm cùng một cache line (64 byte) → hai core cùng ghi làm vô hiệu hoá cache của nhau, chậm 5-10 lần dù chẳng liên quan gì.
→ phase-2 case 6

**Cache line — dòng bộ nhớ đệm**
CPU đọc bộ nhớ theo khối 64 byte chứ không theo từng byte.
→ phase-2 case 6

**CFS (Completely Fair Scheduler) — bộ lập lịch công bằng**
Cơ chế của nhân Linux mà Kubernetes dùng để giới hạn CPU. Hoạt động theo **chu kỳ 100 ms**, hết quota thì đóng băng container.
→ phase-6 case 2

**CPU throttling — bóp CPU**
Container bị **đóng băng** phần còn lại của chu kỳ khi dùng hết quota. Chỉ số "CPU usage" thông thường **không phát hiện được**.
→ phase-6 case 2

**Requests / Limits — yêu cầu / giới hạn (Kubernetes)**
*Requests*: lượng tài nguyên được **đảm bảo**. *Limits*: trần cứng. Vượt limit CPU → bị throttle (chậm). Vượt limit bộ nhớ → **bị giết**.
→ phase-6 case 2

**OOMKilled — bị giết vì hết bộ nhớ**
Hệ điều hành giết tiến trình vì vượt giới hạn bộ nhớ container. Exit code **137**. Khác hẳn `OutOfMemoryError` của Java — không có heap dump.
→ phase-6 case 2

**Liveness / Readiness / Startup probe — thăm dò sống / sẵn sàng / khởi động**
*Liveness* fail → pod bị **GIẾT**. *Readiness* fail → chỉ **rút khỏi load balancer**. *Startup* → cho thời gian khởi động. **Liveness tuyệt đối không kiểm tra dependency.**
→ phase-4 case 6

**Graceful shutdown — tắt êm**
Khi nhận tín hiệu dừng, ngừng nhận request mới nhưng xử lý nốt request đang chạy.
→ phase-4 case 6

**preStop hook — móc trước khi dừng**
Lệnh chạy trước khi Kubernetes gửi tín hiệu dừng. `sleep 10` ở đây giúp load balancer kịp cập nhật → không mất request khi deploy.
→ phase-4 case 6

**Wall clock / Monotonic clock — đồng hồ treo tường / đơn điệu**
*Wall clock*: thời gian theo lịch, **có thể nhảy lùi**. *Monotonic*: bộ đếm chỉ tăng. **Đo thời lượng phải dùng monotonic.**
→ phase-6 case 9

**Clock skew / Clock drift — lệch đồng hồ / trôi đồng hồ**
*Skew*: chênh lệch thời gian giữa hai máy. *Drift*: đồng hồ máy chạy nhanh/chậm hơn thực tế.
→ phase-6 case 9

**NTP (Network Time Protocol) — giao thức đồng bộ thời gian**
Cơ chế các máy đồng bộ đồng hồ với máy chủ thời gian.
→ phase-6 case 9

**DST (Daylight Saving Time) — giờ mùa hè**
Quy ước chỉnh đồng hồ theo mùa. Gây ra việc cron job chạy hai lần hoặc không chạy, mỗi năm hai lần.
→ phase-6 case 9

**Leap second — giây nhuận**
Giây được chèn thêm vào UTC để đồng bộ với vòng quay Trái Đất. Đã gây nhiều sự cố lớn trong ngành.
→ phase-6 case 9

---

## Cách dùng từ điển này

- Gặp từ lạ trong bài → tra ở đây → đọc định nghĩa → quay lại bài.
- Trước khi phỏng vấn hoặc thảo luận thiết kế → đọc lướt toàn bộ để nhớ lại.
- Khi viết tài liệu cho đội → dùng cách gọi tiếng Việt ở đây cho nhất quán.

**Quay lại** → [Mục lục khoá học](00-gioi-thieu.md)
