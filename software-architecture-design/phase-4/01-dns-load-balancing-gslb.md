# Bài 1: DNS, Load Balancing và GSLB

## Vấn đề cần giải quyết

Khi áp dụng horizontal scaling (Phase 2 — chạy nhiều app instance trên nhiều server), ta gặp vấn đề:

- Client cần biết địa chỉ (IP) của **tất cả** server.
- Có sự gắn chặt (tight coupling) giữa client và hạ tầng nội bộ — client biết chi tiết về backend.
- Nếu một server chết (die) → client không biết phải chuyển request đến đâu khác.
- Client phải tự cài đặt logic phân phối tải → mỗi client làm khác nhau, không nhất quán.

**→ Cần một Load Balancer (bộ cân bằng tải): lớp trừu tượng đặt giữa client và nhóm server.**

## Load Balancer là gì?

> **Load Balancer** = Thành phần **phân phối traffic (lưu lượng)** đến nhiều server để đảm bảo không server nào bị quá tải, đồng thời ẩn cấu trúc bên trong khỏi client.

**Lợi ích cốt lõi:**
- Toàn bộ hệ thống trông như **một server duy nhất** có sức mạnh tính toán khổng lồ.
- Ẩn cách hiện thực (implementation) bên trong khỏi client — client chỉ thấy 1 endpoint.
- Giám sát (monitor) sức khoẻ (health) của các server, tự loại bỏ server lỗi khỏi pool.
- Thực hiện rolling update (cập nhật cuốn chiếu) mà không gián đoạn dịch vụ.

## Load Balancer đóng góp gì cho các Quality Attributes?

| Quality Attribute | Cơ chế |
|---|---|
| **Scalability** (mở rộng) | Horizontal scale dễ dàng — thêm/bớt server tự động |
| **Availability** (sẵn sàng) | Chỉ gửi traffic đến server còn khoẻ (healthy) |
| **Throughput** (thông lượng) | Phân phối tải → xử lý được nhiều request song song |
| **Maintainability** (bảo trì) | Rolling update không downtime |

→ Load Balancer là **building block (khối xây dựng cơ bản)** mà mọi hệ thống lớn đều có.

## 4 loại Load Balancing

Các loại này có thể kết hợp với nhau trong cùng 1 hệ thống — không phải chọn 1 loại bỏ các loại khác.

### Loại 1: DNS Load Balancing

Dùng DNS server để trả về nhiều IP cho cùng 1 tên miền.

```text
Client  → Truy vấn DNS cho example.com
        → DNS Server trả về [IP1, IP2, IP3]  (theo thứ tự round-robin)
        → Client thường chọn IP đầu tiên → kết nối Server 1

Lần sau client khác hỏi: thứ tự đảo → Server 2 được chọn.
```

**Ưu điểm:**
- Miễn phí (đã có khi đăng ký tên miền).
- Đơn giản, không cần hạ tầng thêm.

**Nhược điểm:**
- **Không monitor health server** → vẫn trả IP của server đã chết.
- **DNS bị cache** ở client/ISP → chậm cập nhật khi cấu hình server thay đổi (cache có thể giữ 1-24 giờ).
- Client nhận **trực tiếp IP của server thật** → kém bảo mật, attacker biết được IP backend.
- Chỉ hỗ trợ **round-robin đơn giản** — không thông minh dựa trên tải thực tế.

→ DNS Load Balancing **không đủ cho production** — phải kết hợp các loại sau.

### Loại 2: Hardware Load Balancer

Thiết bị vật lý chuyên dụng được tối ưu cho việc cân bằng tải.

**Ví dụ**: F5 BIG-IP, Citrix NetScaler.

**Ưu điểm:**
- Performance cực cao (xử lý hàng triệu request/giây).
- Tính năng phong phú (SSL offload, deep packet inspection).

**Nhược điểm:**
- **Đắt** (giá hàng chục đến hàng trăm nghìn USD mỗi thiết bị).
- Ít linh hoạt — config phức tạp, vendor lock-in.

→ Phù hợp cho ngân hàng, telecom, các hệ thống đặc biệt cần throughput cực cao.

### Loại 3: Software Load Balancer

Phần mềm cài trên server thông thường (general-purpose computer).

**Ví dụ phổ biến:**
- **Nginx** (open source, rất phổ biến).
- **HAProxy** (chuyên cho high availability).
- **AWS ALB / NLB** (managed bởi cloud).
- **Envoy** (modern, dùng nhiều trong service mesh như Istio).

**Đặc điểm:**
- Giá rẻ hơn nhiều so với hardware.
- Dễ cấu hình (file YAML, JSON).
- Có thể scale ngang chính load balancer.

**So với DNS Load Balancing:**
- ✅ Monitor health server (loại bỏ server lỗi khỏi pool tự động).
- ✅ Routing thông minh (theo CPU load, số connection, response time).
- ✅ **Ẩn IP nội bộ** của server (client chỉ thấy IP của LB).
- ✅ Dùng được cho cả internal service-to-service (giữa các microservice).

**Kiến trúc cơ bản:**
```text
Client  →  Load Balancer  →  [Server 1]
                          →  [Server 2]
                          →  [Server 3]
                          
LB monitor health các server → nếu server 2 chết, LB chỉ route đến 1 và 3.
```

→ Software LB là **lựa chọn mặc định cho hầu hết hệ thống production hiện đại**.

### Loại 4: GSLB — Global Server Load Balancer (Cân bằng tải toàn cầu)

Sự kết hợp giữa DNS service và intelligent load balancer, hoạt động ở mức toàn cầu (multi-region).

```text
User  ── (truy vấn DNS) ──>  GSLB
                              │
                              ├── Biết vị trí địa lý của user (qua IP)
                              ├── Monitor health của từng data center
                              └── Trả về IP của Load Balancer GẦN USER NHẤT
                                   (hoặc tải thấp nhất / latency tốt nhất)

User  ────────────────────>  Regional LB  →  Server Pool (US-East)
                                          OR  Server Pool (EU-West)
                                          OR  Server Pool (APAC)
```

**Các chiến lược routing của GSLB:**

| Strategy | Cách hoạt động |
|---|---|
| **Geographic** (địa lý) | Route user về data center gần nhất theo vị trí |
| **Load-based** (theo tải) | Route về data center có tải hiện tại thấp nhất |
| **Latency-based** (theo độ trễ) | Route về data center có RTT (round-trip time) tốt nhất với user |
| **Disaster recovery** (phục hồi thảm hoạ) | Failover sang data center khác khi 1 region down hoàn toàn |

→ GSLB cho phép xây hệ thống **active-active multi-region** — user ở Việt Nam được phục vụ bởi data center Singapore, user ở Mỹ được phục vụ bởi data center Virginia, tất cả tự động.

Ví dụ dịch vụ GSLB:
- AWS Route 53 (geo routing, latency routing).
- Cloudflare Load Balancing.
- Google Cloud DNS Load Balancing.

## Kết hợp tất cả trong Production thực tế

Production system điển hình có nhiều tầng Load Balancer xếp chồng:

```text
                    Internet
                       ↓
            ┌─────────────────────┐
            │ GSLB (DNS + thông   │  ← Tầng toàn cầu
            │  minh + multi-region)│
            └────────┬────────────┘
                     ↓
        ┌────────────┴────────────┐
        ↓                          ↓
  Regional LB (US-East)     Regional LB (EU-West)  ← Tầng vùng
        ↓                          ↓
  ┌─────────────┐            ┌─────────────┐
  │ App 1, 2, 3 │            │ App A, B, C │       ← Pool ứng dụng
  └─────┬───────┘            └─────────────┘
        ↓
  Internal LB (giữa các service nội bộ)              ← Tầng nội bộ
        ↓
  ┌──────────────────────────┐
  │ Service A   Service B    │
  └──────────────────────────┘
```

## Tránh Single Point of Failure cho chính Load Balancer

Nếu chỉ có 1 LB → khi LB chết, toàn hệ thống chết. Vậy LB lại thành SPOF mới!

Giải pháp:

```text
Đăng ký nhiều IP của LB với GSLB
   → Client nhận về danh sách IP
   → Một LB chết → Client tự động dùng IP khác
```

Hoặc dùng DNS có TTL ngắn + multiple A records để khi 1 LB chết, DNS hướng client sang LB khác sau vài phút.

## So sánh 4 giải pháp

| Tiêu chí | DNS LB | Hardware LB | Software LB | GSLB |
|---|---|---|---|---|
| **Health monitoring** | ❌ Không | ✅ Có | ✅ Có | ✅ Có |
| **Intelligent routing** | ❌ Chỉ round-robin | ✅ Có | ✅ Có | ✅ Có |
| **Security (ẩn IP)** | ❌ Lộ IP backend | ✅ Có | ✅ Có | ✅ Có |
| **Multi-region** | ❌ Không | ❌ Single site | ❌ Single site | ✅ Có |
| **Chi phí** | Free (theo tên miền) | Rất cao | Trung bình | Cao |
| **Use case** | Setup nhỏ | Enterprise đặc biệt | Mặc định cho production | Multi-region |

## Tóm tắt bài 1

```text
Load Balancer = Phân phối traffic + ẩn cấu trúc nội bộ

4 loại (từ đơn giản đến phức tạp):

① DNS LB:        Round-robin, miễn phí, không thông minh
② Hardware LB:   Cực nhanh, đắt tiền, vendor lock-in
③ Software LB:   Linh hoạt, thông minh, mặc định production
                 (Nginx, HAProxy, AWS ALB)
④ GSLB:          Multi-region, geographic routing, disaster recovery
                 (Route 53, Cloudflare)

Pattern production:
   GSLB → Regional LB → App instances → Internal LB → Service pool

Quan trọng: Bản thân LB cũng không được là SPOF
```

Load Balancer là building block đầu tiên. Bài tiếp theo sẽ về **Message Brokers** — cách giao tiếp bất đồng bộ giữa các service.

---
**Bài kế tiếp**: [Bài 2 - Message Brokers (Hệ thống nhắn tin trung gian)](02-message-brokers.md) →
