# Bài 1: Vấn Đề với Manual Deployment

## Nhắc Lại: Docker Deployment Trước Đây

Trong Phase 9, chúng ta đã deploy containers lên EC2 và ECS. Nhưng kể cả với ECS, vẫn còn những vấn đề tiềm ẩn khi scale lên production thực sự.

---

## 3 Vấn Đề Lớn của Manual Deployment

### Vấn đề 1: Container Crashes

```
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

```
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

```
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

```
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

```
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

```
Kubernetes giải quyết tất cả vấn đề trên:
  ✓ Tự động restart containers khi crash
  ✓ Auto-scaling (lên và xuống)
  ✓ Load balancing built-in
  ✓ Cloud-agnostic: AWS, Azure, GCP, hoặc bất kỳ máy nào

Một configuration file → Deploy ở bất cứ đâu
```

---

**Tiếp theo:** Kubernetes là gì và tại sao dùng nó →
