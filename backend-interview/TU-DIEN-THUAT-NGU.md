# Từ điển thuật ngữ dùng trong series Backend

Tra bất cứ lúc nào gặp từ chưa quen. Mỗi từ kèm **nghĩa tiếng Việt** và **lý do cần biết**.

> Thuật ngữ thuần SQL (index, execution plan, MVCC, sharding, fanout, SARGable...) nằm ở [Từ điển của series SQL](../sql-interview/TU-DIEN-THUAT-NGU.md).

## 1. Nền tảng web

**Client / Server** — **Máy khách / Máy chủ**. Client là thiết bị của người dùng (trình duyệt, app); server là máy luôn bật phục vụ nhiều người.

**Frontend / Backend** — **Phần đầu / Phần sau**. Frontend chạy trên máy người dùng nên **ai cũng đọc và sửa được**; backend chạy trên máy chủ nên là nơi duy nhất giữ được bí mật và luật.

**Stateless / Stateful** — **Không trạng thái / Có trạng thái**. HTTP là stateless: mỗi request độc lập, server **quên bạn** sau mỗi lần bấm chuột. Mọi cơ chế xác thực đều sinh ra để giải quyết điều này.

**Request / Response** — **Yêu cầu / Phản hồi**. Một lượt hỏi và một lượt trả lời.

**Endpoint** — **Điểm cuối**. Địa chỉ nhận yêu cầu, ví dụ `POST /api/v1/orders`.

**Header / Body** — **Phần đầu thư / Nội dung thư**. Header mang thông tin đi kèm (ai gọi, định dạng gì); body mang dữ liệu thật.

**Payload** — **Tải trọng**. Phần dữ liệu thật được gửi đi.

**Status code** — **Mã trạng thái**. Kết quả bằng con số. Ranh giới **4xx** (lỗi của người gọi, đừng thử lại) và **5xx** (lỗi của bên nhận, nên thử lại) quyết định hành vi retry.

**RTT** (*Round-Trip Time*) — **Thời gian khứ hồi**. Cùng data center ~1 ms, khác vùng địa lý ~80–150 ms. Đây là lý do N+1 giết bạn.

**Idempotent** — **Bất biến khi lặp**. Gọi 1 lần hay 10 lần cho cùng **trạng thái cuối**. `GET`/`PUT`/`DELETE` có; `POST` **không** — đó là lý do cần idempotency key.

**Idempotency key** — **Khoá bất biến**. Chuỗi do client sinh một lần cho một ý định, gửi kèm **mọi** lần thử lại. Server `INSERT ... ON CONFLICT` khoá đó **trước** khi làm việc, trùng thì **trả lại kết quả cũ**.

**Rate limit** — **Giới hạn tần suất**. Mỗi khoá chỉ được gọi bấy nhiêu lần trong một khoảng.

**Timeout** — **Thời gian chờ tối đa**. Phải **nhỏ dần theo chiều sâu**: người dùng chờ 10s → API 8s → gọi đối tác 5s → query DB 2s.

**Circuit breaker** — **Cầu dao**. Sau N lần lỗi liên tiếp thì **ngắt hẳn**, trả giá trị mặc định ngay lập tức trong một khoảng, rồi mới cho một request đi thăm dò. Vì khi đối tác đã chết, thử lại chỉ làm cạn tài nguyên của chính bạn.

**Graceful degradation** — **Suy giảm êm**. Dịch vụ gợi ý chết thì trang vẫn hiện, chỉ thiếu phần gợi ý — thay vì trắng màn hình.

**Backoff + jitter** — **Giãn nhịp + nhiễu ngẫu nhiên**. Thử lại với khoảng cách tăng theo hàm mũ, cộng nhiễu để N client không cùng thức dậy và đè chết dịch vụ vừa hồi phục.

**Breaking change** — **Thay đổi phá vỡ**. Xoá/đổi tên/đổi kiểu trường, thêm trường bắt buộc. Nguy hiểm nhất là **đổi ý nghĩa trường** (giá gồm/không gồm thuế) vì nó **sai im lặng**.

## 2. Đồng thời và bất đồng bộ

**Synchronous / Asynchronous** — **Đồng bộ / Bất đồng bộ**. Async **không làm việc chạy nhanh hơn** — nó chỉ giúp không lãng phí thời gian đứng chờ.

**Blocking / Non-blocking** — **Chặn / Không chặn**. Luồng đứng im chờ, hay trả về ngay và kết quả tới sau.

**Concurrency vs Parallelism** — **Đồng thời vs Song song**. Concurrency là **một** đầu bếp làm **ba** món xen kẽ (một lõi đủ); parallelism là **ba** đầu bếp làm cùng lúc (cần ba lõi).

**Event loop** — **Vòng lặp sự kiện**. Một luồng phục vụ vạn kết nối, vì phần lớn thời gian chỉ đang chờ. Cái giá: **một hàm chặn treo cả tiến trình**.

**I/O-bound vs CPU-bound** — **Nặng chờ đợi vs nặng tính toán**. Async chỉ giúp cho loại đầu; loại sau cần nhiều tiến trình hoặc worker thread.

**Thread / Process** — **Luồng / Tiến trình**. Mỗi luồng ~1 MB stack; 10.000 kết nối = 10 GB chỉ để ngồi chờ (vấn đề C10K).

**Waterfall** — **Thác nước**. Chuỗi lời gọi nối tiếp, mỗi cái chờ cái trước. Sửa bằng `Promise.all`/`gather`.

**`all` / `allSettled` / `race` / `any`** — Một hỏng là hỏng cả / được phép hỏng một phần / đua với timeout / nhiều nguồn dự phòng.

**Goroutine / Virtual thread** — Luồng nhẹ do runtime quản lý (~2 KB), cho bạn sự đơn giản của thread-per-request và hiệu năng của event loop.

## 3. Kiểu giao tiếp

**REST** — Kiểu kiến trúc dựa trên tài nguyên và động từ HTTP. Ưu thế lớn nhất: **cache HTTP/CDN miễn phí**.

**GraphQL** — Client mô tả chính xác dữ liệu muốn. Hết overfetching/underfetching/waterfall, nhưng **mất cache CDN** và cần DataLoader + depth limit.

**gRPC** — Gọi hàm ở máy khác như hàm cục bộ. Protobuf nhị phân (nhỏ hơn JSON 3–10 lần) + HTTP/2 ghép kênh. Trình duyệt không gọi thẳng được.

**Protobuf** — Định dạng nhị phân của Google, schema `.proto` sinh code cho mọi ngôn ngữ.

**Overfetching / Underfetching** — **Lấy thừa / Lấy thiếu**. Server trả nhiều hơn cần / một lần gọi không đủ nên phải gọi thêm.

**Resolver** — **Hàm phân giải**. Hàm lấy dữ liệu cho một trường GraphQL. Vì mỗi trường một resolver nên **N+1 rất dễ xảy ra**.

**DataLoader** — Gom yêu cầu lẻ trong cùng một nhịp event loop thành một truy vấn theo lô. **Phải tạo mới mỗi request**, nếu không cache rò dữ liệu giữa người dùng.

**BFF** (*Backend For Frontend*) — Tầng tổng hợp riêng cho từng loại client, gọi nhiều dịch vụ trong mạng nội bộ rồi trả về đúng cục dữ liệu màn hình cần.

**WebSocket / SSE / Webhook** — Kênh hai chiều luôn mở / server đẩy một chiều qua HTTP thường (nhẹ hơn nhiều) / **đảo ngược**: họ gọi bạn khi có sự kiện.

## 4. Xác thực và phân quyền

**Authentication (AuthN)** — **Xác thực**: *"bạn là ai?"* → mã lỗi **401**.

**Authorization (AuthZ)** — **Phân quyền**: *"bạn được làm gì?"* → mã lỗi **403**. Xác thực luôn đến trước.

**IDOR** (*Insecure Direct Object Reference*) — Đổi ID trên URL là xem được dữ liệu người khác. Xảy ra khi **xác thực đúng nhưng quên phân quyền**. Chữa bằng cách đưa quyền sở hữu vào `WHERE` và trả **404 thay vì 403**.

**RBAC / ABAC / ReBAC** — Phân quyền theo **vai trò** / theo **thuộc tính và ngữ cảnh** / theo **quan hệ trong đồ thị** (Drive, Notion, Figma — Google giải bằng Zanzibar).

**Session** — **Phiên**. Server nhớ bạn. Mã phiên trong cookie, **dữ liệu phiên ở kho chung** (Redis) — không bao giờ trong bộ nhớ tiến trình.

**Session fixation** — Kẻ tấn công đưa trước một mã phiên cho nạn nhân rồi chờ họ đăng nhập. Chữa: **đăng nhập xong phải huỷ mã cũ, cấp mã mới**.

**JWT** (*JSON Web Token*) — Token tự chứa, có chữ ký. **Chữ ký chống SỬA, không chống ĐỌC** — Base64 ai cũng đọc được.

**Claim** — **Tuyên bố**. Một trường trong JWT: `sub` (ai), `iss` (ai cấp), `aud` (cấp cho ứng dụng nào), `exp` (hết hạn), `jti` (mã token).

**`alg=none`** — Lỗ hổng khi thư viện đọc thuật toán **từ chính header token**. Người anh em: **nhầm lẫn thuật toán** (đổi RS256 sang HS256 rồi ký bằng khoá công khai). Chữa cả hai: **chỉ định `algorithms` cứng trong code**.

**Cookie flags** — `HttpOnly` (JS không đọc được → chống XSS), `Secure` (chỉ gửi qua HTTPS), `SameSite=Lax` (chống CSRF).

**XSS / CSRF** — Kẻ tấn công chèn được JavaScript vào trang bạn / trang khác lừa trình duyệt gửi request thay bạn.

**Base64** — **Không phải mã hoá**. Mã hoá cần chìa; Base64 không có chìa nào. Nó là **cái phong bì trong suốt**.

**mTLS** — **TLS hai chiều**. Cả hai bên trình chứng thư. Khoá riêng **không bao giờ rời khỏi máy** — client chứng minh sở hữu bằng cách **ký**. Bẫy: chứng thư hết hạn đồng loạt.

**OAuth 2.0** — **Uỷ quyền có giới hạn**: thẻ phòng khách sạn thay chìa khoá nhà. Trả lời *"app được làm gì"*, **không** trả lời *"người dùng là ai"*.

**Scope** — **Phạm vi quyền**. Hợp đồng ba bên mà người dùng nhìn thấy trên màn hình đồng ý.

**Front channel / Back channel** — **Kênh trước** (qua trình duyệt, ai cũng thấy) / **kênh sau** (server gọi thẳng server). Mã một lần đi kênh trước; token đi kênh sau.

**PKCE** — Cho app không giấu được `client_secret`: gửi **bản băm** ở kênh công khai, gửi **bản gốc** ở kênh sau. OAuth 2.1 khuyến nghị dùng cho **mọi** client.

**`state` vs `nonce`** — `state` đi theo **trình duyệt**, chống **CSRF trên luồng đăng nhập**. `nonce` nằm **trong ID token**, chống **phát lại**. Phải có cả hai.

**OIDC** (*OpenID Connect*) — Lớp **xác thực** đứng trên OAuth, thêm **ID token**.

**Access token vs ID token** — Access token cho **API** (*được làm gì*); ID token cho **ứng dụng của bạn** (*là ai*). **Cầm nhầm là mở toang cửa.**

**`aud` (audience)** — **Dấu kiểm cứu mạng**: token này cấp cho ứng dụng nào. Thiếu nó là lỗ hổng chiếm tài khoản.

**JWKS** — Endpoint công khai chứa khoá để xác minh chữ ký. Cache có TTL, làm mới khi gặp `kid` lạ.

**MFA / Passkey** — Bằng chứng từ nhiều **loại** khác nhau. **WebAuthn/Passkey** là cơ chế duy nhất chống phishing **về nguyên lý**, vì chữ ký gắn với tên miền.

**Salt / Pepper** — **Muối** (riêng từng người, lưu công khai, làm rainbow table vô dụng) / **Tiêu** (chung, lưu **ngoài** database).

**Argon2id / bcrypt** — Hàm băm **cố tình chậm** cho mật khẩu. SHA-256 sai vì nhanh — một GPU thử 10 tỷ chuỗi/giây. Chỉnh tới ~0,2 giây mỗi lần kiểm.

## 5. Kiến trúc và mở rộng

**Load Balancer** — **Bộ cân bằng tải**. Chia request cho các **bản sao thay thế được cho nhau**.

**Round Robin / Least Connections / IP Hash / Consistent Hashing** — Chia lần lượt (mù về tải) / chọn máy rảnh nhất (tốt nhất khi request không đồng đều) / băm IP giữ phiên (vỡ khi đổi số máy) / vòng tròn băm (chỉ ~1/N dữ liệu di chuyển khi thêm máy).

**Liveness vs Readiness** — *"Tiến trình còn sống?"* → không thì **restart**; *"Sẵn sàng nhận việc?"* → không thì **loại khỏi vòng chia**. **Liveness phải cực đơn giản**, không phụ thuộc bên ngoài — nếu không, database chậm sẽ làm restart cả cụm.

**Graceful shutdown** — **Tắt êm**: SIGTERM → readiness fail → **chờ ~15 giây** cho LB cập nhật → xử lý nốt → thoát. Bước chờ hay bị quên nhất.

**Outlier detection** — LB tự loại máy có tỉ lệ lỗi cao bất thường. Cần `max_ejection_percent` vì **máy hỏng trông giống máy rảnh**.

**Sticky session** — **Phiên dính**. Chữa triệu chứng; lời giải đúng là **tách trạng thái ra kho chung** (12-Factor App).

**L4 / L7** — Tầng 4 chỉ thấy IP+cổng (rất nhanh, mù nội dung); tầng 7 đọc được HTTP (định tuyến theo đường dẫn, TLS, retry).

**SPOF** (*Single Point of Failure*) — **Điểm chết duy nhất**. LB và gateway đều là SPOF → nhiều bản, không trạng thái.

**API Gateway** — **Cổng API**. Ba việc: **định tuyến**, **chốt chặn** (xác thực + hạn mức), **tấm đệm** (timeout, cầu dao, cache). **Phải xoá sạch header `X-*` từ ngoài** trước khi tự gắn.

**Service mesh** — Lớp lo lưu lượng **giữa các dịch vụ** (east-west): mTLS tự động, retry, trace. Gateway lo **từ ngoài vào** (north-south).

**Cache-aside / Write-through / Write-behind / Refresh-ahead** — Ứng dụng tự quản (mặc định) / ghi cả hai cùng lúc / ghi cache trước DB sau (**có rủi ro mất dữ liệu**) / làm mới trước khi hết hạn.

**Cache invalidation** — **Vô hiệu hoá cache**. Sau khi ghi DB thì **xoá** chứ đừng cập nhật — vì xoá là thao tác **bất biến khi lặp**.

**Cache stampede / penetration / avalanche** — Khoá nóng hết hạn, hàng vạn request cùng lao vào DB (chữa: khoá + TTL nhiễu + làm mới sớm) / hỏi ID không tồn tại nên cache luôn trượt (chữa: cache `NULL` + Bloom filter) / hàng loạt khoá hết hạn cùng lúc (chữa: TTL nhiễu + stale fallback).

**Hot key** — **Khoá nóng**. Một khoá bị truy cập áp đảo. Chữa: **cache hai tầng** (local TTL ngắn) hoặc nhân bản khoá.

**Eviction policy** — Redis mặc định là **`noeviction`** (đầy thì **lỗi ghi**) — dùng làm cache thì **phải đổi sang `allkeys-lru`**.

**`Vary` / `private`** — Header cache HTTP. Quên `private` cho dữ liệu cá nhân → **CDN phục vụ dữ liệu người này cho người khác**.

**Bloom filter** — Cấu trúc xác suất trả lời *"chắc chắn không có"* hoặc *"có thể có"*. Vài MB lọc được hàng chục triệu ID.

## 6. Hàng đợi và xử lý nền

**Producer / Consumer / Broker** — Bên tạo việc / bên làm việc / bên trung gian giữ hàng đợi.

**`FOR UPDATE SKIP LOCKED`** — Bỏ qua dòng worker khác đang giữ thay vì xếp hàng chờ. **Chìa khoá** để làm hàng đợi bằng PostgreSQL — không có nó thì N worker biến thành 1 worker.

**At-least-once vs Exactly-once** — **Ít nhất một lần** (thực tế) vs **đúng một lần** (gần như không tồn tại). Broker không phân biệt được "làm xong mà mất tín hiệu" với "chưa làm xong" → **lời giải nằm ở job**: làm nó bất biến khi lặp.

**DLQ** (*Dead Letter Queue*) — **Hàng đợi người chết**. Giữ job thất bại kèm lỗi và **payload gốc nguyên vẹn**. Tuyệt đối không im lặng vứt đi.

**Visibility timeout / Heartbeat** — Thời gian job bị ẩn khi worker đang xử lý / worker cập nhật hạn định kỳ để job dài không bị thu hồi nhầm.

**Backpressure** — **Áp lực ngược**. Từ chối sớm (503 + `Retry-After`) còn tử tế hơn nhận vào rồi để chờ ba tiếng.

**Outbox pattern** — Ghi bản ghi nghiệp vụ và message vào **cùng một transaction**, rồi tiến trình riêng đẩy đi. Giải bài toán ghi kép mà không cần transaction phân tán.

**Saga** — Chuỗi bước cục bộ, mỗi bước có **hành động bù trừ**. Thay cho transaction xuyên dịch vụ. Không có atomicity thật.

**Bulkhead** — **Chia khoang** như tàu thuỷ. Pool/hàng đợi riêng cho từng loại việc để một khoang ngập không làm chìm cả tàu.

**File Descriptor (FD)** — **Mô tả tệp**. Con số hệ điều hành cấp cho mỗi socket/file đang mở. Linux mặc định cho mỗi tiến trình **1024** — hết là lỗi `EMFILE: too many open files`, và server chết trong khi **CPU chỉ 4%**.

**`EMFILE`** — Lỗi hết file descriptor. Dấu hiệu: không request nào lỗi 500, chỉ đơn giản là **không ai kết nối vào được nữa**.

**`epoll` / `kqueue`** — Cơ chế kernel cho phép **một luồng** theo dõi hàng vạn socket cùng lúc: thay vì hỏi từng socket, nó hỏi kernel một câu *"ai vừa nói?"*.

**Backplane** — **Cầu nối** giữa các máy chủ WebSocket. Máy A không gửi thẳng cho client của máy B (hai máy là hai hòn đảo) — nó **publish** lên Redis, mọi máy **subscribe** rồi đẩy xuống client của mình.

**Pre-encode / Pre-framed** — **Mã hoá trước**. Chuẩn bị sẵn gói byte **một lần** rồi bắn cho cả trăm nghìn client, thay vì gọi `JSON.stringify` cho từng người.

**`bufferedAmount`** — Số byte đang chờ gửi tới một client. Vượt ngưỡng nghĩa là client **nhận không kịp** — phải ngắt hoặc bỏ tin, vì **vài client 3G có thể làm hết RAM server**.

**Batching / Coalescing** — **Gộp tin**. Dồn 50 tin/giây thành 10 khung/giây — mắt người chỉ thấy 10–60 khung/giây, mà cắt được 80% số lần gọi hệ thống.

**Reconnect storm** — **Bão kết nối lại**. Deploy xong, 100.000 client cùng nối lại một giây và quật sập chính server vừa lên. Chữa: client **backoff mũ + jitter**, server **rolling deploy** + mã đóng `1012`.

**Connection pool** — Mỗi kết nối Postgres là một **tiến trình OS** (5–10 MB). Tăng `max_connections` thường làm thông lượng **tụt**; tối ưu ~2–4× số nhân CPU.

## 7. Phân trang và giới hạn

**Offset pagination** — **`OFFSET` không nhảy, nó đếm**: muốn tới dòng 100.000 phải đọc đủ 100.000 dòng rồi vứt đi. Và nguy hiểm hơn là **dữ liệu lệch** khi có người chèn dòng — job quét sẽ **xử lý trùng và bỏ sót âm thầm**.

**Cursor / Keyset pagination** — So sánh theo **dữ liệu** thay vì bỏ qua theo **vị trí**. Trang 5.000 cũng nhanh như trang 1. Cần **tie-breaker** và nên **ký HMAC** để client không tự chế con trỏ.

**Token bucket / Leaky bucket / Fixed window / Sliding window** — Xô token cho phép **bùng nổ ngắn** (mặc định nên chọn) / xô rỉ làm phẳng đầu ra / cửa sổ cố định có **bẫy biên** / cửa sổ trượt chính xác nhất nhưng tốn bộ nhớ.

**`X-RateLimit-*` / `Retry-After`** — Header cho client biết đường tự điều tiết. Không có nó thì họ chỉ biết thử lại mù.

## 8. Thuật toán và tư duy

**Big O** — Đo **tốc độ tăng của chi phí**, không đo thời gian thật: *"dữ liệu gấp đôi thì chi phí gấp mấy?"*

**O(n²) ẩn** — Nằm trong `x in list`, `chuoi += x`, `list.insert(0,x)`, `sort()` trong vòng lặp. Chữa bằng **đánh chỉ mục trước khi tra cứu** (`dict`/`set`).

**Amortized** — **Khấu hao**. Trung bình trên nhiều lần dù có lần rất đắt (ví dụ mảng động nở gấp đôi).

**Cache locality** — **Tính cục bộ bộ nhớ**. Mảng nhanh hơn danh sách liên kết dù cùng O(n), vì CPU đọc theo khối. Đây là thứ Big O **bỏ qua**.

**Bảng độ trễ** — RAM ~100 ns, SSD ~0,1 ms, round-trip data center ~0,5 ms, VN→Mỹ ~150 ms. **Một lần gọi mạng ≈ một triệu phép tính CPU.**

**Geohash / S2 Cell / H3** — Chia bề mặt Trái Đất thành ô để biến bài toán *"tính khoảng cách"* (không dùng index) thành *"khớp `cell_id`"* (dùng index). Ô **phân cấp** tốt hơn lưới đều vì tải san đều tự nhiên.

**Scatter-gather** — Hỏi **mọi** shard rồi gộp kết quả. Xảy ra khi truy vấn thiếu shard key.

## 9. Bộ nhớ và ngôn ngữ

**Stack vs Heap** — **Ngăn xếp** tự dọn khi hàm xong (nhanh, nhỏ 1–8 MB, cố định) / **vùng cấp phát động** bạn xin thì phải trả (tuỳ ý, sống lâu, **không ai dọn hộ**).

**Memory leak** — **Rò rỉ**. Nó **không sập ngay** mà phình dần suốt đêm và **không ghi lỗi nào**. Chẩn đoán: xem **đáy heap sau mỗi lần GC có cao dần không**.

**Dangling pointer** — **Con trỏ treo**. `delete` dọn ô nhớ chứ **không dọn con trỏ** → vẫn đọc ra giá trị cũ nên chương trình chạy đúng cho tới lúc ô đó được cấp lại cho thứ khác.

**RAII** — Tài nguyên gắn với vòng đời đối tượng: xin lúc tạo, trả lúc huỷ — **kể cả khi ném ngoại lệ**.

**`unique_ptr` / `shared_ptr` / `weak_ptr`** — Một chủ (mặc định) / nhiều chủ (tốn bộ đếm, có **vòng tham chiếu**) / quan sát mà không sở hữu (**phá vòng**).

**GC pause** — Bộ thu gom rác **dừng chương trình** để dọn. **Độ trễ p99 có thể bị GC chi phối chứ không phải bởi code** — p99 xấu mà p50 đẹp thì xem GC log trước.

**Encapsulation** — **Đóng gói**: giấu **quy tắc**, không phải giấu **biến**. Getter/setter đầy đủ = không bảo vệ gì.

**LSP** (*Liskov Substitution*) — Lớp con phải thay thế được lớp cha. Dấu hiệu vi phạm: lớp con viết đè để **vô hiệu hoá** hàm của cha.

**Composition over Inheritance** — **Kế thừa chỉ khi thay thế được; dùng lại thì chứa.**

**Open-Closed** — **Mở** để mở rộng, **đóng** với sửa đổi. Đa hình xoá các nhánh `if theo loại` rải rác.

**Anemic domain model** — Đối tượng chỉ là túi đựng dữ liệu, logic nằm ở service. Không phải lúc nào cũng sai — ngưỡng lật là khi cùng một quy tắc xuất hiện ở **ba chỗ trở lên**.

## 10. Công cụ và AI

**MCP** (*Model Context Protocol*) — Chuẩn để mô hình **tự khám phá và gọi công cụ lúc chạy**. Biến **M×N thành M+N**. Khác biệt căn bản: API mô tả cho **người lúc viết code**, MCP mô tả cho **máy lúc đang chạy**.

**Tools / Resources / Prompts** — Ba loại thứ trong MCP: hàm **gọi được** / dữ liệu **đọc được** / mẫu lời nhắc dựng sẵn.

**Prompt injection** — Kẻ tấn công nhét lệnh vào dữ liệu (ticket, email) để điều khiển mô hình. → Coi **mọi dữ liệu vào AI là không tin cậy**, và giới hạn quyền của công cụ.

**Slopsquatting** — AI bịa ra tên gói không tồn tại; kẻ tấn công đăng ký đúng tên đó với mã độc. → Luôn kiểm lượt tải và người bảo trì.

**Blast radius** — **Bán kính vụ nổ**. *"Nếu cái này sai thì ai chịu ảnh hưởng và mất bao lâu để phát hiện?"* **Độ kỹ của việc duyệt code phải tỉ lệ với nó.**

**Reflog** — **Nhật ký di chuyển** của HEAD trong Git, giữ 30–90 ngày. **Khi hoảng loạn, gõ `git reflog` trước tiên.**

**`reset` vs `revert`** — `reset` **dời con trỏ** (viết lại lịch sử, chỉ an toàn trên nhánh riêng) / `revert` **tạo commit mới làm ngược lại** (an toàn trên nhánh chung).

**`--force-with-lease`** — Từ chối push nếu remote đã đổi kể từ lần fetch cuối. **Luôn dùng thay cho `--force`.**

**`git bisect`** — Tìm nhị phân trên lịch sử: 300 commit chỉ cần ~9 lần thử. Tự động hoá bằng `git bisect run`.

**Trunk-based development** — Nhánh sống ngắn (2–3 ngày) + feature flag. Vì chi phí merge tăng **theo cấp số nhân** theo tuổi nhánh.

## Cách dùng từ điển này

- Gặp từ lạ trong bài nào, quay về đây tra rồi đọc tiếp — đừng bỏ qua.
- Trước buổi phỏng vấn, đọc lướt mục **4, 5, 6** — ba mục có mật độ câu hỏi cao nhất cho vị trí backend.
- Khi trả lời, dùng **cả thuật ngữ tiếng Anh lẫn giải thích tiếng Việt**: *"Đây là idempotency key, tức là khoá để gọi lại nhiều lần vẫn ra một kết quả"*. Nói được cả hai cho thấy bạn hiểu chứ không học thuộc.

**Quay lại** → [Mục lục series](README.md)
