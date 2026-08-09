# Bài 1: Vấn Đề với Manual Deployment

## Nhắc Lại: Docker Deployment Trước Đây

Trong Phase 9, chúng ta đã deploy containers lên EC2 và ECS. Nhưng kể cả với ECS, vẫn còn những vấn đề tiềm ẩn khi scale lên production thực sự.

---

## 3 Vấn Đề Lớn của Manual Deployment

### Vấn đề 1: Container Crashes

```text
Scenario thực tế:
  3 giờ sáng → Container crash (bug, memory leak, v.v.)
  App không còn accessible
  Bạn đang ngủ
  → Ai restart container?

Manual approach:
  → Phải monitor 24/7
  → Phải manually restart khi crash
  → Không thực tế cho serious apps
```

**Cần:** Tự động detect + restart container khi crash.

### Vấn đề 2: Traffic Spikes — Scaling

```text
Bình thường:    1 container xử lý tốt
Traffic spike:  1 container overwhelmed → chậm hoặc crash

Giải pháp: Scale up → chạy nhiều containers cùng lúc

Container 1 ─┐
Container 2  ─┤→ Xử lý requests đồng thời
Container 3 ─┘

Khi traffic giảm: Scale down → chỉ cần 1-2 containers
```

**Vấn đề với manual scaling:**
- Phải tự theo dõi metrics
- Phải manually `docker run` thêm containers
- Phải manually stop containers khi không cần
- Không real-time, không responsive

### Vấn đề 3: Load Balancing

```text
Nếu có nhiều containers cùng chạy:
  Ai phân phối requests đến đúng container?
  
Không có load balancing:
  Container 1: 90% requests (bị overwhelm)
  Container 2: 10% requests (idle)
  Container 3: 0% requests (lãng phí)
  
Cần: Phân phối đều traffic
  Container 1: 33%
  Container 2: 33%
  Container 3: 33%
```

---

## Ví Dụ Thực Tế: Non-Web Use Case

Docker không chỉ cho web apps. Ví dụ:

```text
Image processing pipeline:
  Container nhận file upload
  → Transform/resize images
  → Lưu vào storage

Bình thường: 1 container OK
Nhiều uploads cùng lúc: Container xử lý tuần tự → chậm
Giải pháp: Nhiều containers xử lý song song
```

---

## ECS Giải Quyết Được Không?

**Có, nhưng với một cái giá:**

```text
ECS làm được:
  ✓ Auto-restart containers khi crash
  ✓ Auto-scaling (có cấu hình)
  ✓ Load balancing

Nhưng:
  ✗ Chỉ hoạt động với AWS ECS
  ✗ Cấu hình theo kiểu AWS (clusters, tasks, services)
  ✗ Không portable sang Azure, Google Cloud, v.v.
  ✗ Phải học lại từ đầu nếu đổi provider
```

---

## Giải Pháp: Kubernetes

```text
Kubernetes giải quyết tất cả vấn đề trên:
  ✓ Tự động restart containers khi crash
  ✓ Auto-scaling (lên và xuống)
  ✓ Load balancing built-in
  ✓ Cloud-agnostic: AWS, Azure, GCP, hoặc bất kỳ máy nào

Một configuration file → Deploy ở bất cứ đâu
```

---

## Ba vấn đề này thật sự đau ở đâu

Ba mục ở trên nghe hợp lý nhưng còn trừu tượng. Đây là chúng ở dạng cụ thể — mỗi cái kèm việc bạn phải tự làm nếu không có công cụ điều phối.

**Vấn đề 1 — container chết lúc 3 giờ sáng:**

```text
   02:47  Container backend hết bộ nhớ, bị nhân hệ điều hành giết
   02:47  Không có ai theo dõi → dịch vụ chết
   07:30  Người dùng đầu tiên báo lỗi
   08:15  Bạn thức dậy, SSH vào, docker start
   ────────────────────────────────────────
   Tổng thời gian gián đoạn: 5 tiếng 28 phút
```

Tự làm thì cần: một tiến trình giám sát, biết phân biệt "chết thật" với "đang khởi động chậm", biết dừng thử lại khi lỗi lặp mãi, và bản thân nó cũng phải không được chết.

**Vấn đề 2 — traffic tăng gấp mười trong 20 phút:**

```text
   Chiến dịch khuyến mãi bắt đầu lúc 20:00
   20:00  3 container, mỗi cái CPU 40%
   20:05  CPU 95%, độ trễ tăng từ 80ms lên 4 giây
   20:12  Bạn nhận ra, SSH vào chạy thêm 7 container
   20:18  Xong — nhưng đã mất 13 phút đơn hàng
   23:00  Chiến dịch kết thúc, 10 container ngồi không tới sáng
```

Tự làm thì cần: đo tải liên tục, quyết định khi nào scale, tìm máy còn chỗ, và scale ngược lại khi hết cao điểm.

**Vấn đề 3 — thêm container xong không ai gọi tới:**

```text
   Chạy thêm 7 container → nhưng nginx vẫn chỉ biết 3 địa chỉ cũ
   → phải sửa file cấu hình nginx, nạp lại
   → và sửa lại lần nữa khi scale xuống
   → container chết thì nginx vẫn gửi request vào đó → lỗi 502
```

Tự làm thì cần: một sổ đăng ký dịch vụ, cơ chế kiểm tra sức khoẻ, và cập nhật cấu hình cân tải tự động.

> **Điểm chung**: cả ba đều là **việc lặp đi lặp lại theo quy tắc rõ ràng** — đúng loại việc máy làm tốt hơn người. Kubernetes không phát minh ra khả năng nào mới; nó **tự động hoá ba vòng lặp này** và làm chúng chạy 24/7 mà không cần ai thức.

---

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| "Thêm `--restart always` là giải quyết được vấn đề 1" | Chỉ đúng khi **container** chết. **Máy chủ** chết thì không ai cứu |
| "Viết script tự động scale là xong" | Script phải biết máy nào còn chỗ, phải xử lý khi tạo thất bại, và bản thân script cũng cần giám sát |
| "Có load balancer là xong vấn đề 3" | Load balancer cần biết **danh sách địa chỉ hiện tại** — đó mới là phần khó |
| Nghĩ ba vấn đề này chỉ xuất hiện ở quy mô lớn | Vấn đề 1 xuất hiện ngay từ container đầu tiên ở production |
| Nghĩ Kubernetes xoá bỏ ba vấn đề | Nó **tự động hoá** cách xử lý. Bạn vẫn phải cấu hình đúng (probe, requests/limits) |

---

## Tóm tắt bài 1

- Ba vấn đề của triển khai thủ công: **container chết không ai biết**, **không scale kịp khi tải tăng**, và **cân tải không biết địa chỉ mới**.
- Điểm chung: cả ba là **việc lặp lại theo quy tắc rõ ràng**, chạy 24/7 — đúng loại việc nên giao cho máy.
- `--restart always` chỉ cứu được khi **container** chết, không cứu được khi **máy chủ** chết.
- Kubernetes không phát minh khả năng mới; nó **tự động hoá ba vòng lặp** giám sát, scale, và cập nhật đích cân tải.
- Nhưng nó **không tự đúng** — bạn vẫn phải cấu hình probe và giới hạn tài nguyên cho đúng, nếu không nó sẽ tự động hoá cả những quyết định sai.

---

**Bài kế tiếp** → [Bài 2: Kubernetes Là Gì?](02-kubernetes-la-gi.md)
