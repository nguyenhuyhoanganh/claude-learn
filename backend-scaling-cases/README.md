# Backend Scaling Cases

> *"Hệ thống chạy tốt suốt sáu tháng. Rồi một chiều thứ Sáu, nó sập."*

**50 case sự cố hiệu năng có thật**, mỗi case một bài: triệu chứng → chẩn đoán → nguyên nhân gốc → cách sửa → cách chặn tái diễn. Phase 1 xây nền lý thuyết (định luật Little, lý thuyết hàng đợi, percentile) để bạn **tính** được thay vì đoán; năm phase sau là các case xếp theo tầng: thread/connection pool, database lock, sập dây chuyền, kiến trúc, runtime và hạ tầng.

**50 bài** trong 6 phần.

## Mục lục

| Tài liệu | Nội dung |
|---|---|
| [00-gioi-thieu.md](00-gioi-thieu.md) | Khoá học: Case thực chiến về Hiệu năng & Scaling Backend |
| [00-thuat-ngu.md](00-thuat-ngu.md) | Từ điển thuật ngữ — mọi từ tiếng Anh trong khoá học |

### Phase 1 — nen tang

| Bài | Nội dung |
|---|---|
| [01](phase-1-nen-tang/01-vong-doi-mot-http-request.md) | Bài 1: Một HTTP request thực sự đi qua những đâu? |
| [02](phase-1-nen-tang/02-tomcat-connection-vs-thread.md) | Bài 2: max-connections, accept-count, threads.max — ba con số hay bị hiểu nhầm nhất |
| [03](phase-1-nen-tang/03-latency-throughput-percentile.md) | Bài 3: Latency, throughput, p99 — đọc số liệu sao cho không bị lừa |
| [04](phase-1-nen-tang/04-dinh-luat-little-tinh-pool-size.md) | Bài 4: Định luật Little — tính chính xác cần bao nhiêu thread, bao nhiêu connection |
| [05](phase-1-nen-tang/05-ly-thuyet-hang-doi.md) | Bài 5: Lý thuyết hàng đợi — vì sao 80% tải làm latency gấp đôi, 95% làm gấp 20 lần |
| [06](phase-1-nen-tang/06-do-va-chan-doan.md) | Bài 6: Đo và chẩn đoán — bắt quả tang nút thắt trong 15 phút |

### Phase 2 — thread connection pool

| Bài | Nội dung |
|---|---|
| [01](phase-2-thread-connection-pool/01-case-downstream-cham-giam-thread.md) | Case 1: Một service chậm làm chết cả hệ thống (thread pool exhaustion) |
| [02](phase-2-thread-connection-pool/02-case-hikaricp-connection-timeout.md) | Case 2: "Connection is not available" — cạn connection pool database |
| [03](phase-2-thread-connection-pool/03-case-thieu-timeout.md) | Case 3: Timeout mặc định là vô hạn — cái bẫy im lặng ở mọi client |
| [04](phase-2-thread-connection-pool/04-case-pool-long-pool-deadlock.md) | Case 4: Pool lồng pool — deadlock tự tạo trong chính ứng dụng của bạn |
| [05](phase-2-thread-connection-pool/05-case-bulkhead-co-lap-tai-nguyen.md) | Case 5: Bulkhead — vách ngăn kín nước cho ứng dụng |
| [06](phase-2-thread-connection-pool/06-case-lock-trong-jvm.md) | Case 6: `synchronized` và lock trong JVM — khi thread chặn nhau ngay trong bộ nhớ |
| [07](phase-2-thread-connection-pool/07-case-queue-vo-han-oom.md) | Case 7: Hàng đợi vô hạn — con đường êm ái tới OutOfMemoryError |
| [08](phase-2-thread-connection-pool/08-case-async-webflux-virtual-thread.md) | Case 8: Async, WebFlux và virtual thread — giải pháp hiện đại và những cái bẫy mới |

### Phase 3 — database lock

| Bài | Nội dung |
|---|---|
| [01](phase-3-database-lock/01-case-row-lock-table-lock.md) | Case 1: Row lock, table lock — một câu UPDATE làm sập cả hệ thống |
| [02](phase-3-database-lock/02-case-transaction-dai.md) | Case 2: Transaction dài — kẻ giết người thầm lặng |
| [03](phase-3-database-lock/03-case-deadlock.md) | Case 3: Deadlock — hai giao dịch chờ nhau vĩnh viễn |
| [04](phase-3-database-lock/04-case-hot-row.md) | Case 4: Hot row — khi cả nghìn người tranh nhau một dòng dữ liệu |
| [05](phase-3-database-lock/05-case-optimistic-vs-pessimistic.md) | Case 5: Optimistic vs Pessimistic locking — chọn sai là hỏng cả hệ thống |
| [06](phase-3-database-lock/06-case-double-booking-race.md) | Case 6: Double booking — race condition kiểu "kiểm tra rồi hành động" |
| [07](phase-3-database-lock/07-case-isolation-gap-lock.md) | Case 7: Isolation level và gap lock — những cái khoá bạn không hề viết ra |
| [08](phase-3-database-lock/08-case-n-plus-1.md) | Case 8: N+1 query — một request sinh 500 câu SQL |
| [09](phase-3-database-lock/09-case-thieu-index.md) | Case 9: Thiếu index — khi một câu UPDATE khoá gần như cả bảng |

### Phase 4 — cascading failure

| Bài | Nội dung |
|---|---|
| [01](phase-4-cascading-failure/01-case-retry-storm.md) | Case 1: Retry storm — khi cơ chế thử lại tự giết hệ thống |
| [02](phase-4-cascading-failure/02-case-cache-stampede.md) | Case 2: Cache stampede — khi cache hết hạn làm sập database |
| [03](phase-4-cascading-failure/03-case-circuit-breaker.md) | Case 3: Circuit breaker — cầu dao và nghệ thuật chỉnh ngưỡng |
| [04](phase-4-cascading-failure/04-case-load-shedding.md) | Case 4: Load shedding và backpressure — nghệ thuật từ chối đúng lúc |
| [05](phase-4-cascading-failure/05-case-hot-key-celebrity.md) | Case 5: Hot key và bài toán người nổi tiếng |
| [06](phase-4-cascading-failure/06-case-health-check-death-spiral.md) | Case 6: Health check giết pod — vòng xoáy tử thần tự tạo |
| [07](phase-4-cascading-failure/07-case-metastable-failure.md) | Case 7: Metastable failure — vì sao hệ thống không tự hồi phục |
| [08](phase-4-cascading-failure/08-case-phu-thuoc-ben-thu-ba.md) | Case 8: Phụ thuộc bên thứ ba — khi bạn không kiểm soát được nguyên nhân |

### Phase 5 — scaling kien truc

| Bài | Nội dung |
|---|---|
| [01](phase-5-scaling-kien-truc/01-case-scale-doc-ngang.md) | Case 1: Scale dọc hay scale ngang — và vì sao monolith khó scale |
| [02](phase-5-scaling-kien-truc/02-case-stateful-can-scale.md) | Case 2: Trạng thái trong bộ nhớ — thứ chặn đường scale ngang |
| [03](phase-5-scaling-kien-truc/03-case-tach-service.md) | Case 3: Tách service theo nút thắt — không phải theo sơ đồ đẹp |
| [04](phase-5-scaling-kien-truc/04-case-async-hoa-queue.md) | Case 4: Async hoá bằng hàng đợi — đổi tính tức thời lấy khả năng chịu tải |
| [05](phase-5-scaling-kien-truc/05-case-read-replica-lag.md) | Case 5: Read replica và replication lag — đọc phải dữ liệu vừa ghi |
| [06](phase-5-scaling-kien-truc/06-case-sharding.md) | Case 6: Sharding — chia database và những gì bạn mất |
| [07](phase-5-scaling-kien-truc/07-case-idempotency.md) | Case 7: Idempotency — nền tảng của mọi hệ thống phân tán đáng tin |

### Phase 6 — runtime ha tang

| Bài | Nội dung |
|---|---|
| [01](phase-6-runtime-ha-tang/01-case-gc-pause.md) | Case 1: GC pause — khi JVM dừng cả thế giới |
| [02](phase-6-runtime-ha-tang/02-case-cpu-throttling.md) | Case 2: CPU throttling trên Kubernetes — bị bóp cổ mà không biết |
| [03](phase-6-runtime-ha-tang/03-case-can-port-fd.md) | Case 3: Cạn port và file descriptor — giới hạn không ai nghĩ tới |
| [04](phase-6-runtime-ha-tang/04-case-dns.md) | Case 4: DNS — 5 phút gián đoạn kéo dài thành 5 giờ |
| [05](phase-6-runtime-ha-tang/05-case-logging-chan-thread.md) | Case 5: Logging chặn thread — khi việc ghi log giết hệ thống |
| [06](phase-6-runtime-ha-tang/06-case-head-of-line-blocking.md) | Case 6: Head-of-line blocking — một phần tử chặn cả hàng |
| [07](phase-6-runtime-ha-tang/07-case-jit-warmup-cold-start.md) | Case 7: JIT warmup và cold start — vì sao pod mới luôn chậm |
| [08](phase-6-runtime-ha-tang/08-case-dong-bo-hoa-vo-tinh.md) | Case 8: Đồng bộ hoá vô tình — cron, restart và những cơn sóng tự tạo |
| [09](phase-6-runtime-ha-tang/09-case-thoi-gian-dong-ho.md) | Case 9: Thời gian — đồng hồ lệch, múi giờ và những lỗi khó tin |
| [10](phase-6-runtime-ha-tang/10-tong-ket-playbook.md) | Bài tổng kết: Playbook chẩn đoán và cấu hình tham chiếu |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Đang có sự cố, cần tra nhanh | phase-2 → phase-6 theo triệu chứng |
| Muốn hiểu nền tảng trước | phase-1, đọc tuần tự 6 bài |
| Chuẩn bị phỏng vấn system design | phase-4 và phase-5 |
| Cần playbook chẩn đoán | phase-6 bài 10 |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*
