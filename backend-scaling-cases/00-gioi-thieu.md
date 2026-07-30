# Khoá học: Case thực chiến về Hiệu năng & Scaling Backend

## Vì sao có khoá này?

Hầu hết tài liệu backend dạy bạn **viết code chạy được**. Rất ít tài liệu dạy bạn điều xảy ra lúc 9 giờ tối ngày sale: 10.000 người bấm "Đặt hàng" cùng lúc, app treo, log đầy `Connection is not available, request timed out after 30000ms`, và sếp hỏi "sao lại thế?".

Khoá này chỉ làm một việc: **mổ xẻ từng case hỏng thật**, theo đúng thứ tự mà một request đi qua hệ thống, và với mỗi case trả lời 4 câu:

1. **Hiện tượng** — người dùng và log nhìn thấy gì?
2. **Cơ chế** — bên trong máy chuyện gì đang xảy ra, ở tầng nào?
3. **Cách chẩn đoán** — đo cái gì để chắc chắn đúng là nguyên nhân này, không phải đoán mò?
4. **Giải pháp** — sửa thế nào, và giải pháp đó đánh đổi cái gì?

## Khoá này viết cho ai?

Viết cho **người mới**. Cụ thể:

- Bạn biết viết một REST API bằng Spring Boot / Node.js / Go, biết gọi database.
- Bạn **chưa** cần biết trước thuật ngữ nào. Mọi từ tiếng Anh chuyên ngành (thread pool, connection pool, backpressure, tail latency, deadlock, lock escalation...) đều được định nghĩa ngay lần đầu xuất hiện, kèm ví dụ đời thường.
- Bạn chưa từng đọc thread dump, chưa từng nhìn biểu đồ p99 — không sao, sẽ có bài hướng dẫn.

Ví dụ code chủ yếu dùng **Java/Spring Boot** vì đây là stack mà mô hình "thread-per-request" (mỗi request một luồng) thể hiện rõ nhất — dễ nhìn thấy chuyện gì đang hỏng. Nhưng mỗi bài đều có phần đối chiếu sang **Node.js, Go, Python** vì cơ chế nền tảng giống nhau.

## Bản đồ khoá học

```text
             MỘT REQUEST ĐI QUA ĐÂU?  →  MỖI CHỖ HỎNG KIỂU GÌ?

  [Client] → [Load Balancer] → [Web Server: Tomcat] → [App code] → [DB]
                                      │                   │          │
                                 phase-1,2            phase-2,4   phase-3
                                 (hàng đợi +        (gọi service   (lock,
                                  thread pool)       khác, cache)   transaction)

  Khi tất cả cùng hỏng dây chuyền  →  phase-4 (cascading failure)
  Sửa tận gốc bằng kiến trúc       →  phase-5 (scaling)
```

| Phase | Chủ đề | Bạn học được gì |
|---|---|---|
| **phase-1** | Nền tảng: đường đi của một request | Hiểu chính xác `max-connections`, `accept-count`, `max-threads` là gì; latency/throughput; định luật Little; vì sao hệ thống "đang ổn" bỗng sập trong 30 giây |
| **phase-2** | Case cạn kiệt thread pool & connection pool | 7 case kinh điển làm treo toàn bộ service, từ downstream chậm đến pool lồng pool gây deadlock |
| **phase-3** | Case khoá database (lock) | Row lock, table lock, deadlock, hot row, transaction dài, optimistic vs pessimistic |
| **phase-4** | Case sập dây chuyền (cascading failure) | Retry storm, cache stampede, thiếu timeout, circuit breaker, bulkhead, load shedding |
| **phase-5** | Case scaling kiến trúc | Scale dọc/ngang, tách service theo nút thắt, async hoá bằng queue, read replica, idempotency |

## Cách đọc hiệu quả

- **Đọc tuần tự phase-1 trước.** Từ phase-2 trở đi mọi case đều dùng lại từ vựng của phase-1. Bỏ qua phase-1 sẽ thấy các bài sau như đọc tiếng nước ngoài.
- **Mỗi bài đều tự đứng được.** Đọc xong một bài là có một mảnh kiến thức trọn vẹn, dùng được ngay.
- **Các con số trong bài là số mặc định thật** của Tomcat 10 / Spring Boot 3, HikariCP, PostgreSQL 16, MySQL 8. Hãy tự kiểm chứng trên hệ thống của bạn — mỗi phiên bản có thể lệch chút ít.

## Câu chuyện mở đầu — case gốc của cả khoá

Đây là tình huống mà toàn bộ phase-1 và phase-2 sẽ giải thích từng chi tiết. Đọc lướt bây giờ, chưa hiểu cũng không sao:

> Một hệ thống bán hàng viết bằng Spring Boot, kiểu **monolith** (một khối duy nhất — toàn bộ chức năng đặt hàng, kho, thanh toán nằm chung một ứng dụng). Ngày sale, 10.000 người cùng bấm đặt hàng.
>
> Tomcat — web server nhúng sẵn trong Spring Boot — chấp nhận tối đa **8.192 kết nối** cùng lúc (`max-connections`). Nhưng số request được **xử lý thật sự song song** chỉ là **200** (`threads.max`). 9.800 request còn lại nằm chờ.
>
> Trong 200 request đang chạy, mỗi request trừ kho bằng một câu `UPDATE inventory ...`. Database khoá dòng dữ liệu đó lại (**row lock**). Request thứ hai đụng đúng dòng đó phải chờ. Request thứ ba, thứ tư... cũng chờ.
>
> Chỉ vài giây sau, cả 200 thread đều đang "đứng hình" chờ database. Không còn thread nào rảnh. Mọi request mới — kể cả `GET /health` hay xem trang chủ, những việc chẳng liên quan gì đến đặt hàng — đều xếp hàng và timeout.
>
> **Một câu UPDATE làm chết cả hệ thống.**

Nếu bạn hiểu được vì sao chuyện trên xảy ra, hiểu từng con số 8192 / 200 / 9800 ở đâu ra, và biết ít nhất 5 cách sửa cùng đánh đổi của chúng — bạn đã đi được nửa chặng đường trở thành backend engineer làm được hệ thống chịu tải.

Bắt đầu thôi.

**Bài kế tiếp** → [Phase 1 - Bài 1: Một HTTP request thực sự đi qua những đâu?](phase-1-nen-tang/01-vong-doi-mot-http-request.md)
