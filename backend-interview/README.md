# Series: Phá đảo vòng phỏng vấn Backend & System Design

> *"Câu trả lời của bạn đúng. Và bạn vẫn trượt."*
> Vì hầu hết câu hỏi phỏng vấn là một **cái thang bốn bậc**, còn đáp án trong sách chỉ nằm ở bậc một.

Khoá này đi từ nền tảng (web hoạt động thế nào) tới xác thực, kiến trúc chịu tải, tư duy thiết kế hệ thống, và các câu hỏi ngôn ngữ kinh điển.

**Mỗi bài đều có:**

- **Giải nghĩa mọi thuật ngữ** tiếng Anh kèm nghĩa tiếng Việt ngay lần đầu xuất hiện — không giả định bạn đã biết gì.
- **Kiến trúc và cách hoạt động** — sơ đồ ASCII vẽ luồng từng bước, để bạn hiểu *vì sao nó chạy như vậy*, không học vẹt.
- **Tình huống thực tế và cách xử lý** — sự cố có thật, chẩn đoán, rồi code sửa cụ thể.
- Bảng so sánh, bảng bẫy thường gặp, câu hỏi phỏng vấn kèm **bản mẫu trả lời 30 giây**.

## Cách dùng series

1. **Mới vào nghề?** Bắt đầu từ [Phase 1 Bài 1](phase-1/01-frontend-backend-database-ai-lam-gi.md) — frontend, backend, database làm gì và ranh giới ở đâu.
2. Đọc tuần tự phase 1 → phase 5. Mỗi bài kết thúc bằng link "Bài kế tiếp".
3. **Sắp phỏng vấn trong tuần này?** Đọc [Phase 5 Bài 1](phase-5/01-oop-bon-tang-cua-mot-cau-hoi-ngan.md) để nắm **mô hình bốn tầng**, rồi quét các mục "Câu hỏi phỏng vấn hay gặp".
4. Gặp thuật ngữ lạ → tra [Từ điển thuật ngữ](TU-DIEN-THUAT-NGU.md).

> **Khoá này KHÔNG lặp lại phần SQL.** Toàn bộ index, execution plan, transaction, sharding, replica, kiểu dữ liệu, và tối ưu truy vấn nằm ở [series SQL](../sql-interview/README.md). Chỗ nào liên quan đều có link chéo.

## Mục lục

### Phase 1 — Nền tảng: web hoạt động thế nào

| Bài | Nội dung |
|---|---|
| [01](phase-1/01-frontend-backend-database-ai-lam-gi.md) | Ranh giới ba tầng, vì sao bảo mật luôn ở backend, IDOR, luồng một request đi qua 11 chặng, monolith vs microservices |
| [02](phase-1/02-api-hop-dong-giua-hai-phan-mem-xa-la.md) | Mổ xẻ một request, bốn động từ và tính bất biến khi lặp, idempotency key, mã trạng thái, timeout/retry/circuit breaker, bảy nguyên tắc thiết kế |
| [03](phase-1/03-dong-bo-va-bat-dong-bo.md) | Blocking vs non-blocking, concurrency vs parallelism, event loop, waterfall và bẫy ngược lại, async là thuộc tính của cả tuyến |
| [04](phase-1/04-rest-graphql-grpc-chon-kieu-nao.md) | Overfetching/underfetching, GraphQL chạy thế nào bên trong, N+1 resolver, mất cache CDN, gRPC + Protobuf, WebSocket/SSE/Webhook |

### Phase 2 — Xác thực và phân quyền

| Bài | Nội dung |
|---|---|
| [01](phase-2/01-xac-thuc-va-phan-quyen.md) | AuthN vs AuthZ, **IDOR**, HTTP không có trí nhớ, RBAC/ABAC/ReBAC, multi-tenant, MFA và Passkey |
| [02](phase-2/02-session-hay-jwt.md) | Session + kho chung, cookie bốn thuộc tính, session fixation, JWT ký thế nào, ba lỗ hổng (`alg=none`), **JWT không thu hồi được** |
| [03](phase-2/03-basic-auth-api-key-va-mtls.md) | Base64 không phải mã hoá, sáu luật khi buộc dùng Basic, API key (băm/scope/hạn/giám sát), mTLS và cú đau chứng thư hết hạn |
| [04](phase-2/04-oauth-2-cho-muon-quyen-khong-dua-chia-khoa.md) | Thẻ phòng thay chìa khoá nhà, luồng Authorization Code từng bước, `state`/`redirect_uri`, **PKCE**, bốn luồng sống và hai luồng chết |
| [05](phase-2/05-openid-connect-nam-dau-kiem.md) | ID token vs access token, **năm dấu kiểm**, vì sao 12.000 tài khoản bị chiếm, khoá bằng `(iss, sub)`, gộp tài khoản có xác nhận |

### Phase 3 — Kiến trúc và khả năng mở rộng

| Bài | Nội dung |
|---|---|
| [01](phase-3/01-load-balancer-chia-deu-dong-khach.md) | Sáu thuật toán chia tải, **liveness vs readiness**, sticky session và vì sao nên tránh, L4 vs L7, graceful shutdown, máy hỏng trông giống máy rảnh |
| [02](phase-3/02-api-gateway-mot-cua-duy-nhat.md) | Gateway ≠ load balancer, ba việc nó làm, **phải xoá header `X-*` từ ngoài**, việc KHÔNG nên nhét vào, BFF, gateway vs service mesh |
| [03](phase-3/03-caching-tang-nhanh-nhat-va-nguy-hiem-nhat.md) | Bảy tầng cache, bốn chiến lược, **xoá chứ đừng cập nhật**, stampede/penetration/avalanche, cache HTTP và bẫy `private` |
| [04](phase-3/04-job-queue-va-worker.md) | Bốn tính chất **T–A–S–V**, hàng đợi bằng `SKIP LOCKED`, idempotency, backoff + jitter, DLQ, Outbox, Saga, backpressure |
| [05](phase-3/05-thiet-ke-rest-api-chiu-tai.md) | Bốn trụ cột, bốn thuật toán rate limit, **`OFFSET` không nhảy nó đếm**, cursor pagination, phiên bản hoá và khai tử |
| [06](phase-3/06-websocket-va-ket-noi-thoi-gian-thuc.md) | Ba bức tường **GIỮ–CHIA–PHÁT**: file descriptor và C10K, event loop, Ping/Pong dọn xác kết nối, sticky session + backplane Redis, pre-encode/backpressure/batching, bão reconnect, WebSocket vs SSE |

### Phase 4 — Tư duy kỹ thuật

| Bài | Nội dung |
|---|---|
| [01](phase-4/01-big-o-thuoc-do-cua-lap-trinh-vien-gioi.md) | Big O đo gì, vườn thú độ phức tạp, **O(n²) ẩn**, bảng độ trễ, một lần gọi mạng ≈ một triệu phép tính CPU |
| [02](phase-4/02-tinder-xu-ly-ty-luot-quet-nhu-the-nao.md) | Chia Trái Đất thành ô S2, chia index theo vùng, tính sẵn cờ match, Bloom filter, **khung sáu bước trả lời thiết kế hệ thống** |
| [03](phase-4/03-tu-tho-go-code-thanh-nguoi-duyet-code.md) | Bốn thứ phải soi khi duyệt code AI, **nhìn ra cái thiếu**, bán kính vụ nổ, prompt injection, slopsquatting, giao gì cho AI |

### Phase 5 — Câu hỏi ngôn ngữ và công cụ

| Bài | Nội dung |
|---|---|
| [01](phase-5/01-oop-bon-tang-cua-mot-cau-hoi-ngan.md) | **Mô hình bốn tầng**, đóng gói giấu *quy tắc* không giấu *biến*, kế thừa vs chứa (LSP), đa hình xoá 28 nhánh |
| [02](phase-5/02-con-tro-va-quan-ly-bo-nho.md) | Stack vs heap, rò rỉ không sập mà phình, **con trỏ treo vẫn đọc ra giá trị cũ**, RAII, và rò rỉ trong ngôn ngữ có GC |
| [03](phase-5/03-mcp-vi-sao-can-them-mot-lop-tren-api.md) | M×N → M+N, **mô tả cho máy lúc chạy** vs cho người lúc viết code, ba loại (Tools/Resources/Prompts), prompt injection |
| [04](phase-5/04-git-xu-ly-su-co-thuong-gap.md) | Bốn vùng, **`git reflog` cứu mạng**, ba mức `reset`, merge vs rebase, lộ khoá thì xoay khoá trước, `git bisect` |
| [05](phase-5/05-excel-cho-dev-vlookup-index-match-xlookup.md) | Bẫy đếm cột, bẫy dò gần đúng, `XLOOKUP`, và vì sao hai bẫy đó **giống hệt** bẫy trong SQL |

## Bắt đầu

- Mới vào nghề → [Phase 1 Bài 1: Frontend, Backend, Database](phase-1/01-frontend-backend-database-ai-lam-gi.md)
- Đã đi làm, ôn phỏng vấn → [Phase 2 Bài 1: Xác thực và phân quyền](phase-2/01-xac-thuc-va-phan-quyen.md)
- Sắp phỏng vấn trong tuần này → [Phase 5 Bài 1: Mô hình bốn tầng](phase-5/01-oop-bon-tang-cua-mot-cau-hoi-ngan.md)
- Cần ôn SQL → [Series SQL](../sql-interview/README.md)

## Ba câu chốt dùng được cho mọi câu hỏi

Khi bí, ba câu này luôn ghi điểm:

```text
① "Cho em hỏi lại: quy mô khoảng bao nhiêu, và tỉ lệ đọc/ghi thế nào?"
   → Nhận ra mình thiếu dữ kiện là điểm cao nhất trong bài.

② "Em chưa đo cái này trên hệ đang dùng. Em sẽ đo thế này: ..."
   → Câu này ĐƯỢC điểm. Đoán bừa mới mất điểm.

③ "Được X, mất Y, và ngưỡng lật là ở Z."
   → Thay cho "còn tuỳ" — câu của người chưa từng phải chọn.
```

> **Họ không hỏi bạn biết gì. Họ hỏi bạn đã mất gì.**
> Định nghĩa tra 10 giây là có. Vết sẹo thì không tra được.
