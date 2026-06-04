# Bài 2: Scalability (Khả năng mở rộng)

## Tại sao cần Scalability?

Tải (traffic) của hệ thống thực tế **không bao giờ cố định**, nó dao động theo nhiều quy luật:

- **Theo mùa (Seasonal)**: Website bán lẻ (retail) tăng vọt vào dịp lễ — Black Friday, Tết, Giáng sinh.
- **Theo sự kiện (Event-driven)**: Trang tin tức tăng vọt khi có tin lớn (bầu cử, thiên tai, sự kiện thể thao).
- **Theo ngày trong tuần (Daily pattern)**: Công cụ làm việc cho dân văn phòng — thấp vào cuối tuần, cao vào ngày làm việc.
- **Tăng trưởng dài hạn (Long-term growth)**: Khi business tốt, số user tăng → traffic tăng theo.

Hệ thống cần được thiết kế sao cho **có thể phục vụ được khi tải tăng** mà không cần viết lại từ đầu.

## Định nghĩa Scalability

> **Scalability** = Khả năng của hệ thống xử lý lượng công việc (workload) ngày càng tăng theo cách **dễ dàng và tiết kiệm chi phí**, bằng cách thêm tài nguyên (resources) — không phải bằng cách viết lại code.

**Linear Scalability (mở rộng tuyến tính — lý tưởng):**

```text
Gấp đôi tài nguyên (2x resources) → Gấp đôi thông lượng (2x throughput)
```

Trong thực tế: rất hiếm khi đạt được linear scalability do overhead (chi phí phụ) của việc đồng bộ, mạng, lock... Mục tiêu thực tế là **càng gần linear càng tốt**.

## 3 chiều của Scalability

Có 3 hướng để mở rộng hệ thống. Hệ thống tốt thường mở rộng được theo nhiều hướng cùng lúc.

### Chiều 1: Vertical Scalability (Scale Up — mở rộng dọc)

Ý tưởng: thay máy chủ hiện tại bằng máy mạnh hơn.

```text
Máy chủ nhỏ  →  Máy chủ to hơn
                (CPU mạnh hơn, RAM nhiều hơn, disk lớn hơn)
```

**Ưu điểm:**
- **Không phải đổi code** — app vẫn chạy y nguyên.
- Migration (di chuyển) đơn giản — chỉ cần restart trên máy mới.
- Dễ làm trong môi trường cloud — chỉ cần đổi instance type (vd: từ t3.medium → t3.xlarge).

**Nhược điểm:**
- **Có giới hạn vật lý của phần cứng** — không thể scale vô hạn được. CPU mạnh nhất, RAM nhiều nhất cũng có giới hạn.
- **Single Point of Failure** (điểm lỗi đơn lẻ) — toàn bộ hệ thống chạy trên 1 máy → máy đó chết = hệ thống chết.
- Không cung cấp High Availability (tính sẵn sàng cao) hay Fault Tolerance (khả năng chịu lỗi).
- Chi phí phần cứng cao cấp tăng theo cấp số nhân (server gấp đôi mạnh thường đắt gấp 4-10 lần).

### Chiều 2: Horizontal Scalability (Scale Out — mở rộng ngang)

Ý tưởng: chạy nhiều máy chủ song song, dùng load balancer để phân phối traffic.

```text
1 server  →  N servers chạy song song
              ↓
          Load Balancer phân phối request đến các server
```

**Ưu điểm:**
- **Không có giới hạn lý thuyết** — cần thêm tải thì thêm máy.
- Nếu thiết kế đúng → đạt được **High Availability + Fault Tolerance** (1-2 máy chết, hệ thống vẫn chạy).
- Cloud có sẵn cơ chế **auto-scaling** (tự động tăng/giảm số máy) theo policy.

**Nhược điểm:**
- **Không phải app nào cũng dễ chuyển sang multi-instance**. App có state (trạng thái) trong memory, dùng session local, file local... đều bị vỡ.
- Cần **thay đổi code đáng kể**: thiết kế stateless (không có trạng thái), session phải lưu ra ngoài (Redis), file phải lên object storage.
- Quản lý phức tạp hơn — phải giám sát N máy, log từ N máy gộp lại, debug khó hơn.

### Chiều 3: Team / Organizational Scalability (Mở rộng tổ chức)

Nhìn từ góc độ developer: "work" ở đây là thêm tính năng (features), sửa lỗi (bugs), deploy phiên bản mới (releases).

**Vấn đề phổ biến với monolithic codebase (mã nguồn đơn khối):**

```text
Số kỹ sư tăng lên → Năng suất (productivity) tăng... rồi GIẢM
                                                       ↑
                                                    đỉnh ở khoảng 10-20 người
```

**Nguyên nhân năng suất giảm khi team lớn:**
- Họp hành (meetings) ngày càng nhiều và kém hiệu quả (cần đồng bộ nhiều người).
- Code merge conflict (xung đột khi gộp code) xảy ra liên tục giữa các dev.
- Testing chậm vì không có isolation (mỗi thay đổi phải test cả hệ thống lớn).
- Release rủi ro cao → team chọn release ít lại → mỗi lần release chứa rất nhiều thay đổi → càng rủi ro hơn → vòng luẩn quẩn.

**Giải pháp — chia nhỏ codebase theo trục kiến trúc:**

```text
Monolith  →  Modules / Libraries  →  Separate Services
                  ↑                          ↑
            Giảm conflict             Tách rời hoàn toàn,
            nhưng các module           deploy độc lập,
            vẫn coupled               scale độc lập
```

→ Microservices không chỉ giải quyết vấn đề kỹ thuật mà còn **giải quyết vấn đề tổ chức**.

→ **Software Architecture ảnh hưởng đến cả tốc độ phát triển của đội ngũ (Engineering Velocity)!**

## So sánh Vertical vs Horizontal

| Tiêu chí | Vertical (Scale Up) | Horizontal (Scale Out) |
|---|---|---|
| **Giới hạn** | Giới hạn vật lý phần cứng | Gần như vô hạn |
| **Thay đổi code** | Không cần | Cần thiết kế lại (stateless, sticky session) |
| **Tính sẵn sàng** | Single point of failure | High availability |
| **Chi phí** | Tốn kém ở high-end (giá hàng tăng theo cấp số) | Linh hoạt hơn, có thể dùng máy thường |
| **Độ phức tạp** | Đơn giản | Phức tạp hơn nhiều |
| **Khi nào dùng** | App legacy chưa tách được, DB master single-writer | App mới, microservices |

## 3 chiều này là Orthogonal (độc lập với nhau)

```text
Có thể chọn scale theo 1, 2, hoặc cả 3 chiều cùng lúc — chúng độc lập:

Vertical   ────────────────────────────►  (mạnh hơn từng máy)
                    ✕
Horizontal ────────────────────────────►  (thêm nhiều máy)
                    ✕
Team       ────────────────────────────►  (tách thành nhiều service/team)
```

Ví dụ: dùng máy mạnh (vertical) + cluster nhiều máy (horizontal) + chia thành microservices cho nhiều team (team).

## Ví dụ thực tế

### AWS Auto Scaling + Load Balancer (Horizontal)

```text
Traffic tăng  →  Auto Scaling tự thêm EC2 instances
              →  Load Balancer phân phối request
              
Traffic giảm  →  Auto Scaling tự giảm số instances
              →  Tiết kiệm chi phí
```

Cấu hình policy theo CPU utilization (vd: thêm máy khi CPU > 70%, giảm khi < 30%).

### Microservices (Team Scalability)

```text
Team A  →  Sở hữu Service A (đăng nhập)        →  Deploy độc lập
Team B  →  Sở hữu Service B (đặt hàng)         →  Deploy độc lập
Team C  →  Sở hữu Service C (thanh toán)       →  Deploy độc lập

→ Không ai "step on each other's toes" (giẫm chân nhau)
→ Mỗi team có lịch release riêng, tech stack riêng nếu muốn
```

## Tóm tắt bài 2

```text
Scalability = Khả năng xử lý lượng công việc ngày càng tăng,
              dễ dàng và tiết kiệm

3 chiều mở rộng:
├── Vertical (Scale Up):   Nâng cấp phần cứng — có giới hạn
├── Horizontal (Scale Out): Thêm máy chạy song song — gần như vô hạn  
└── Team:                  Tách thành nhiều service — tăng engineering velocity

3 chiều này độc lập (orthogonal) — có thể áp dụng đồng thời
```

Scalability + Performance là cặp đôi kinh điển. Khi Performance là "nhanh", Scalability là "vẫn nhanh khi tải tăng". Bài tiếp theo sẽ về Availability — "luôn sẵn sàng phục vụ".

---
**Bài kế tiếp**: [Bài 3 - Availability (Tính sẵn sàng)](03-availability.md) →
