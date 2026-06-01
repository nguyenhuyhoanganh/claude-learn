# Bài 4: CAP Theorem (Định lý CAP — định lý vàng của distributed database)

## CAP Theorem là gì?

> **CAP Theorem** (do Eric Brewer đề xuất năm 1999, được Lynch & Gilbert chứng minh năm 2002): Trong một **distributed database** (cơ sở dữ liệu phân tán), khi xảy ra **network partition** (mất kết nối giữa các node), hệ thống **không thể đồng thời đảm bảo cả Consistency lẫn Availability** — bắt buộc phải chọn một trong hai.

Đây là **trade-off cơ bản nhất** mà mọi kiến trúc sư distributed system phải hiểu. Nó không phải lựa chọn "tốt — xấu" mà là lựa chọn về ưu tiên: bạn muốn data **đúng** hay muốn hệ thống **luôn trả lời**.

## Ba thuộc tính trong CAP

### C — Consistency (Tính nhất quán)

> Mọi read request đều nhận được **giá trị mới nhất** (most recent write), hoặc một error.

Tất cả client thấy cùng một dữ liệu tại cùng một thời điểm — không bao giờ có **stale data** (dữ liệu cũ).

### A — Availability (Tính sẵn sàng)

> Mọi request đều nhận được **non-error response** (phản hồi không phải lỗi), nhưng không đảm bảo đó là giá trị mới nhất.

Hệ thống luôn phản hồi, kể cả khi dữ liệu trả về có thể đã cũ.

### P — Partition Tolerance (Khả năng chịu phân vùng mạng)

> Hệ thống tiếp tục hoạt động dù có **network partition** — tức là các message giữa các node bị mất hoặc bị delay vô hạn.

Trong distributed system thực tế, network partition **không phải nếu mà là khi nào**. Cáp đứt, switch hỏng, packet drop... đều xảy ra. Vì vậy P là **bắt buộc** với mọi hệ thống phân tán.

## Trực quan hoá CAP qua ví dụ

**Setup ban đầu:** 3 replica database cùng lưu một counter `inventory = 1` (còn 1 sản phẩm trong kho).

```text
Trạng thái bình thường (không có partition):
Replica 1 ←──network──→ Replica 2 ←──network──→ Replica 3
  inventory=1              inventory=1              inventory=1
Tất cả sync với nhau → mọi thứ OK!

Network Partition xảy ra (cáp giữa Replica 3 và cluster bị đứt):
Replica 1 ←──network──→ Replica 2   ╳   Replica 3 (bị cô lập!)
```

**Tình huống:** Service A muốn tăng inventory từ 1 → 2 trên Replica 1 (vd: một sản phẩm được trả lại). Replica 1 và 2 sync được, nhưng Replica 3 bị cô lập:

```text
Sau update:
Replica 1: inventory = 2  ✅ (mới nhất)
Replica 2: inventory = 2  ✅ (mới nhất, đã sync)
Replica 3: inventory = 1  ❌ (cũ, vì không sync được)
```

**Bây giờ Service B query Replica 3 → Replica 3 phải chọn một trong hai cách trả lời:**

### Lựa chọn 1: Ưu tiên Availability (AP)

```text
Replica 3 nghĩ: "Tôi không biết có data mới hay không, nhưng tôi sẽ
                 trả lời bằng dữ liệu tôi có hiện tại"
→ Trả: inventory = 1
→ Service B nhận được giá trị cũ (stale)
→ Available: ✅ (có phản hồi) | Consistent: ❌ (sai dữ liệu)
```

### Lựa chọn 2: Ưu tiên Consistency (CP)

```text
Replica 3 nghĩ: "Tôi không thể đảm bảo data của tôi là mới nhất,
                 không trả lời còn hơn trả lời sai"
→ Trả: Error / không khả dụng (Service B phải thử lại sau)
→ Consistent: ✅ (không trả sai) | Available: ❌ (không có phản hồi)
```

**→ Kết luận CAP: Khi có partition, phải chọn C hoặc A — không thể cả hai.**

## Khi nào partition xảy ra?

**Rất thường xuyên!** Ngay cả 2 server kết nối qua mạng cũng thỉnh thoảng gặp vấn đề network — packet drop, switch reboot, cáp đứt, DDoS, kernel panic làm node mất responsive.

**Thực tế:**

- Không thể có distributed database mà **không** có Partition Tolerance — vì partition luôn xảy ra.
- DB chạy trên 1 máy duy nhất: không có partition giữa các node → có thể có cả C và A (nhưng không scale được).
- DB chạy trên nhiều máy: **bắt buộc phải có P** → chỉ còn lại lựa chọn giữa C và A.

```text
3 hệ thống lý thuyết:

CA (không có P): Database 1 máy → có C + A nhưng không scale, không HA
                                  → không dùng cho hệ thống lớn

CP: Distributed + consistent → hy sinh availability khi partition
    Ví dụ: Spanner, HBase, etcd, ZooKeeper, MongoDB (default)

AP: Distributed + available → hy sinh consistency khi partition
    Ví dụ: Cassandra, DynamoDB, Riak, CouchDB
```

## Khi nào chọn C, khi nào chọn A?

Câu hỏi quan trọng: **tổn thất nào lớn hơn?** — Trả sai data, hay không trả lời được?

### Chọn Consistency (CP) khi: Data critical, không được phép sai

```text
Ví dụ: Inventory counter = 1 (còn 1 sản phẩm)

Nếu 2 user cùng thấy inventory = 1 và đặt hàng đồng thời
→ Cả 2 đều mua thành công
→ Oversell (bán quá số lượng tồn)!
→ Phải huỷ đơn 1 user → trải nghiệm tệ + uy tín giảm

→ Chọn Consistency: thà trả error cho 1 user trong vài giây
  còn hơn oversell và phải huỷ đơn
```

**Use cases CP điển hình:**
- **Inventory management** (quản lý tồn kho — không muốn oversell).
- **Financial transactions** (số dư, payment, chuyển khoản).
- **Booking systems** (đặt vé máy bay, đặt phòng — không muốn double-booking).
- **User authentication state** (đăng xuất user phải có hiệu lực ngay lập tức).

### Chọn Availability (AP) khi: UX quan trọng hơn độ chính xác tuyệt đối

```text
Ví dụ: Like count trên một post mạng xã hội

Nếu hệ thống hiển thị 9,999 likes thay vì 10,000 likes thực tế:
→ User hầu như không để ý
→ Vài giây sau số sẽ tự sync lại đúng (eventual consistency)

Nếu hệ thống trả error "không thể load số likes":
→ User cực kỳ khó chịu, có cảm giác "web đang lỗi"

→ Chọn Availability: trả data hơi cũ một chút còn hơn không trả lời
```

**Use cases AP điển hình:**
- **Like / view / share counts** trên social media.
- **Product recommendations** ("Sản phẩm bạn có thể thích").
- **Search results** (search xong vẫn ra kết quả, dù có thể chưa có item mới nhất).
- **User feeds** (timeline, news feed — có thể chậm vài giây so với real-time).
- **CDN / caching layer**.

## CAP không phải đen-trắng — Consistency có nhiều mức

Trong thực tế, **consistency là một dial** (núm điều chỉnh) — không chỉ có "có" hoặc "không":

```text
Strong Consistency ←──────────────────────────→ Eventual Consistency
          ↑                                                ↑
   Chậm hơn, khó scale                       Nhanh hơn, scale tốt hơn
   (Banking, inventory, booking)             (Social media, CDN, feed)
```

**Cấu hình phổ biến trong distributed database:**

```text
Tổng số replicas = N
Write quorum = W  (cần ghi thành công trên W replica mới coi là OK)
Read quorum  = R  (cần đọc từ R replica để xác định giá trị)

Strong consistency:    W + R > N   (đảm bảo write và read luôn overlap)
Eventual consistency:  W + R ≤ N   (có thể đọc được data cũ)

Ví dụ N=5:
- W=3, R=3 → W+R=6 > 5 → strong consistency (chậm hơn, đảm bảo đúng)
- W=1, R=1 → W+R=2 ≤ 5 → eventual consistency (nhanh hơn, có thể đọc cũ)
```

Cassandra, DynamoDB cho phép **điều chỉnh** quorum này per-query — bạn có thể chọn strong cho query critical, eventual cho query thông thường.

## CAP và các database phổ biến

| Database | CAP Choice | Use Case |
|----------|-----------|----------|
| **Cassandra** | AP (tunable) | High availability, eventual consistency |
| **DynamoDB** | AP (cấu hình được) | Quy mô AWS, tunable consistency |
| **MongoDB** | CP (mặc định, từ phiên bản 4.0+) | Document store ưu tiên consistency |
| **Redis** | AP | Cache, ưu tiên tốc độ trên consistency |
| **PostgreSQL** | CA (single node) hoặc CP (cluster) | Financial, strong consistency |
| **Google Spanner** | CP | Global consistency ở quy mô toàn cầu (có TrueTime API) |
| **HBase** | CP | Big data, strong consistency cho per-row |
| **Riak** | AP | Highly available key-value store |
| **etcd / ZooKeeper** | CP | Distributed coordination, consensus |

## PACELC — phần mở rộng của CAP

Một định lý mở rộng của CAP là **PACELC**: nói rằng kể cả khi **KHÔNG** có partition, distributed system vẫn phải đánh đổi giữa **Latency** và **Consistency**.

```text
P = Partition: nếu có partition → chọn A hoặc C (như CAP)
ELSE (no partition): chọn Latency hoặc Consistency

Ví dụ:
- Dynamo: PA / EL (chọn A khi partition, chọn L khi không)
- Spanner: PC / EC (chọn C cả khi partition và khi không)
```

PACELC giải thích vì sao ngay cả khi network ổn định, eventual consistency vẫn cho latency thấp hơn strong consistency.

## Tóm tắt bài 4

```text
CAP Theorem:
Khi có Network Partition trong distributed system
→ Bắt buộc phải chọn: Consistency HOẶC Availability

3 thuộc tính:
├── C = mọi read nhận giá trị mới nhất (hoặc error)
├── A = mọi request nhận response (có thể stale)
└── P = phải chịu được partition (distributed = phải có P)

Thực tế: chỉ chọn giữa CP và AP

Khi nào chọn Consistency (CP):
└── Data critical: inventory, finance, booking, authentication

Khi nào chọn Availability (AP):
└── UX trên accuracy: social media, recommendation, search, CDN

Mở rộng:
├── Consistency là dial: strong ↔ eventual (W+R > N hay không)
└── PACELC: cả khi không partition, vẫn trade-off Latency vs Consistency
```

CAP là trade-off **quan trọng nhất** trong distributed system. Hiểu nó giúp bạn chọn đúng database cho từng use case.

---
**Bài kế tiếp**: [Bài 5 - Unstructured Data Storage (Lưu trữ dữ liệu phi cấu trúc)](05-unstructured-data-storage.md) →
