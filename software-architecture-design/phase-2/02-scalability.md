# Bài 2: Scalability (Khả năng mở rộng)

## Tại sao cần Scalability?

Traffic không bao giờ cố định:
- **Seasonal**: Retail website tăng vọt dịp lễ
- **Event-driven**: News site spike khi có sự kiện lớn
- **Daily pattern**: Tool cho dân văn phòng — thấp weekend, cao weekday
- **Long-term growth**: Business tốt → user tăng → traffic tăng

## Định nghĩa

> **Scalability** = Khả năng của hệ thống xử lý lượng công việc ngày càng tăng **một cách dễ dàng và tiết kiệm** bằng cách thêm resources.

**Linear Scalability (lý tưởng):**
```
2x Resources → 2x Throughput
```

Trong thực tế: thường không đạt linear, nhưng cố gắng gần với linear.

## Ba Chiều Scalability

### 1. Vertical Scalability (Scale Up)

```
Server nhỏ → Server to hơn (CPU mạnh hơn, RAM nhiều hơn, disk lớn hơn)
```

**Ưu điểm:**
- Không cần thay đổi code
- Migration đơn giản
- Dễ làm trong cloud (thay đổi instance type)

**Nhược điểm:**
- Có giới hạn phần cứng (không thể scale vô hạn)
- Single Point of Failure — một máy chết = hệ thống chết
- Không có High Availability hay Fault Tolerance

### 2. Horizontal Scalability (Scale Out)

```
1 Server → Nhiều servers chạy song song
         → Load Balancer phân phối traffic
```

**Ưu điểm:**
- Không có giới hạn lý thuyết (thêm máy là xong)
- Nếu thiết kế đúng → High Availability & Fault Tolerance
- Cloud: auto-scaling policies

**Nhược điểm:**
- Không phải app nào cũng dễ port sang multi-instance
- Cần thay đổi code đáng kể (stateless design, session handling)
- Phức tạp hơn để manage

### 3. Team/Organizational Scalability

Nhìn từ góc độ developer: "work" = thêm features, fix bugs, deploy releases.

**Vấn đề với monolithic codebase:**

```
Engineers tăng → Productivity tăng... rồi GIẢM
```

Nguyên nhân degradation khi team lớn:
- Meetings ngày càng nhiều và kém hiệu quả
- Code merge conflicts liên tục
- Testing chậm (không có isolation)
- Releases rủi ro cao → release ít lại → mỗi release chứa nhiều thay đổi → càng rủi ro hơn

**Giải pháp:**

```
Monolith → Modules/Libraries → Separate Services
                ↑                       ↑
       Giảm conflict           Fully decoupled,
       nhưng vẫn               độc lập deploy,
       coupled                 scale riêng
```

**→ Software Architecture ảnh hưởng đến cả Engineering Velocity!**

## So sánh Vertical vs Horizontal

| | Vertical (Scale Up) | Horizontal (Scale Out) |
|--|--------------------|-----------------------|
| **Limit** | Giới hạn phần cứng | Gần như vô hạn |
| **Code change** | Không cần | Cần thiết kế lại |
| **Availability** | Single point of failure | High availability |
| **Cost** | Tốn kém ở high end | Linh hoạt hơn |
| **Complexity** | Đơn giản | Phức tạp hơn |

## Scalability Dimensions là Orthogonal

```
Có thể scale theo 1, 2, hoặc cả 3 chiều:

Vertical   ────────────────────────────►
                    ╳
Horizontal ────────────────────────────►
                    ╳
Team       ────────────────────────────►
```

## Ví dụ thực tế

**AWS Auto Scaling + Load Balancer:**
```
Traffic cao  → Auto Scaling thêm EC2 instances → LB phân phối
Traffic thấp → Auto Scaling giảm instances → Tiết kiệm chi phí
```

**Microservices (Team Scalability):**
```
Team A → Owns Service A (deploy independently)
Team B → Owns Service B (deploy independently)
Team C → Owns Service C (deploy independently)
→ Không ai "step on each other's toes"
```

## Tóm tắt

```
Scalability = Handle growing work easily & cost-effectively

3 Dimensions:
├── Vertical (Scale Up): Upgrade hardware, có limit
├── Horizontal (Scale Out): Add instances, gần vô hạn
└── Team: Tách thành services, improve engineering velocity
```

---
**Tiếp theo:** Bài 3 - Availability →
