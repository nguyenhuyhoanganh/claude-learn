# Bài 1: DNS, Load Balancing & GSLB

## Vấn đề cần giải quyết

Khi chạy nhiều app instances trên nhiều servers để scale horizontally:
- Client cần biết địa chỉ của **tất cả** servers
- Tight coupling giữa client và internal infrastructure
- Nếu một server die → client không biết phải chuyển đến đâu

**→ Cần Load Balancer: Abstraction layer giữa client và group of servers.**

## Load Balancer là gì?

> **Load Balancer** = Phân phối traffic đến nhiều servers để đảm bảo không server nào bị quá tải.

**Lợi ích:**
- Toàn bộ hệ thống trông như **một server duy nhất** với computing power khổng lồ
- Ẩn internal implementation khỏi client
- Monitor health của servers

## Quality Attributes từ Load Balancer

| Quality Attribute | Cơ chế |
|------------------|--------|
| **Scalability** | Horizontal scale: thêm/bớt servers tự động |
| **Availability** | Chỉ gửi traffic đến healthy servers |
| **Throughput** | Phân phối load → nhiều concurrent requests |
| **Maintainability** | Rolling updates không disruption |

## Bốn loại Load Balancing

### 1. DNS Load Balancing

```
Client → DNS Query → DNS Server → [IP1, IP2, IP3] (round-robin order)
Client → Picks first IP → Server 1
```

**Ưu điểm:** Miễn phí (theo tên miền), đơn giản

**Nhược điểm:**
- Không monitor server health (vẫn gửi traffic đến server down)
- Cache DNS → chậm update khi server thay đổi
- Client nhận trực tiếp IP servers → kém bảo mật
- Chỉ hỗ trợ round-robin đơn giản

### 2. Hardware Load Balancer

Thiết bị vật lý chuyên dụng, tối ưu cho load balancing.

**Ưu điểm:** Performance cao, features phong phú
**Nhược điểm:** Đắt tiền, ít linh hoạt

### 3. Software Load Balancer

Program chạy trên general-purpose computer:
- **Nginx**, **HAProxy**, **AWS ALB/NLB**
- Giá rẻ hơn hardware, dễ configure

**So với DNS:**
- ✅ Monitor health servers
- ✅ Intelligent routing (CPU load, connections, response time)
- ✅ Ẩn internal IPs
- ✅ Dùng được cả internal service-to-service

**Architecture:**
```
Client → Load Balancer → [Server 1]
                       → [Server 2]
                       → [Server 3]
```

### 4. GSLB - Global Server Load Balancer

Hybrid giữa DNS service và intelligent load balancer:

```
User ──(DNS query)──> GSLB
                       │
                       ├── Biết location của user (via IP)
                       ├── Monitor health của từng datacenter
                       └── Trả về IP của Load Balancer GẦN NHẤT
                           (hoặc load thấp nhất / best latency)

User ──────────────────> Regional LB → Server Pool (US-East)
                                  OR → Server Pool (EU-West)
                                  OR → Server Pool (APAC)
```

**GSLB routing strategies:**
- **Geographic**: Route về datacenter gần nhất
- **Load-based**: Route về datacenter có load thấp nhất
- **Latency-based**: Route về datacenter có RTT tốt nhất
- **Disaster recovery**: Failover sang datacenter khác khi một region down

## Kết hợp tất cả trong Production

```
Internet
    ↓
GSLB (DNS + Intelligence)
    ↓
Regional Load Balancer (US-East)   Regional LB (EU-West)
    ↓                                        ↓
[App 1] [App 2] [App 3]        [App A] [App B] [App C]
    ↓
Internal LB (between services)
    ↓
[Service A] [Service B]
```

**Tránh SPOF cho Load Balancer:**
```
Register nhiều LB IPs với GSLB
→ Client nhận list IPs
→ Một LB chết → Client dùng IP khác
```

## So sánh các giải pháp

| | DNS | Software/Hardware LB | GSLB |
|--|-----|---------------------|------|
| **Health monitoring** | ❌ | ✅ | ✅ |
| **Intelligent routing** | ❌ (round-robin only) | ✅ | ✅ |
| **Security (hide IPs)** | ❌ | ✅ | ✅ |
| **Multi-region** | ❌ | ❌ | ✅ |
| **Cost** | Free | Medium | High |

## Tóm tắt

```
Load Balancer = Phân phối traffic, ẩn internal complexity

4 loại (từ đơn giản đến phức tạp):
① DNS LB: Round-robin, free, không smart
② Hardware LB: Fast, đắt tiền
③ Software LB: Flexible, intelligent, internal use
④ GSLB: Multi-region, disaster recovery, geographic routing

Kết hợp: GSLB → Regional LB → App instances
```

---
**Tiếp theo:** Bài 2 - Message Brokers →
