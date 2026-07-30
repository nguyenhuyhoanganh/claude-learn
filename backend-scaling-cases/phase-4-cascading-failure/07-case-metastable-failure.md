# Case 7: Metastable failure — vì sao hệ thống không tự hồi phục

Đây là khái niệm quan trọng nhất của phase-4, và cũng là thứ giải thích câu hỏi ám ảnh mọi kỹ sư trực sự cố:

> **"Nguyên nhân đã sửa xong 30 phút rồi, sao hệ thống vẫn chết?"**

## Định nghĩa

**Metastable failure (hỏng ở trạng thái giả ổn định)** — hệ thống mắc kẹt trong một trạng thái hỏng **tự duy trì**, ngay cả khi nguyên nhân ban đầu đã biến mất hoàn toàn.

```text
   Hệ thống có HAI trạng thái ổn định:

   ┌─────────────────────┐         ┌─────────────────────┐
   │  ỔN ĐỊNH TỐT        │  ───→   │  ỔN ĐỊNH XẤU        │
   │  (metastable good)  │  cú sốc │  (metastable bad)   │
   │                     │         │                     │
   │  Tải 60%            │  ←───   │  Tải 100%, mọi thứ  │
   │  Latency 100 ms     │  KHÔNG  │  timeout, retry loạn│
   │  Mọi thứ ổn         │  TỰ VỀ  │  Thông lượng ≈ 0    │
   └─────────────────────┘         └─────────────────────┘
```

Điểm mấu chốt: trạng thái xấu cũng **ổn định**. Nó không tự thoát ra. Hệ thống sẽ nằm ở đó mãi mãi cho tới khi có can thiệp từ bên ngoài.

## Ẩn dụ vật lý

Nước tinh khiết có thể được làm lạnh xuống dưới 0°C mà **vẫn ở thể lỏng** — trạng thái "quá lạnh" (supercooled). Nó ổn định, cho tới khi có một cú sốc nhỏ:

```text
   Nước -5°C, thể lỏng, hoàn toàn yên tĩnh
        ↓ gõ nhẹ vào bình
   ĐÓNG BĂNG TỨC THÌ toàn bộ

   Và nó KHÔNG tự tan ra khi bạn ngừng gõ.
   Phải nâng nhiệt độ lên trên 0°C — tức là thay đổi ĐIỀU KIỆN BÊN NGOÀI.
```

Hệ thống phần mềm hành xử y hệt: một cú sốc nhỏ (traffic tăng 20%, một deploy, một node chết) đẩy nó qua ngưỡng, và sau đó nó tự giữ mình ở trạng thái hỏng.

## Hai yếu tố: trigger và sustaining effect

Đây là mô hình phân tích quan trọng nhất:

```text
   TRIGGER (cú kích hoạt)          SUSTAINING EFFECT (hiệu ứng duy trì)
   ─────────────────────           ────────────────────────────────────
   Nguyên nhân ban đầu             Thứ giữ hệ thống ở trạng thái xấu
   Thường ngắn, nhỏ                Tự nuôi chính nó
   Ví dụ:                          Ví dụ:
   ├─ Traffic tăng 20%             ├─ Retry storm
   ├─ Một node chết                ├─ Hàng đợi đầy request đã timeout
   ├─ Deploy code mới              ├─ Cache trống → mọi request xuống DB
   ├─ Cache bị xoá                 ├─ Health check giết pod liên tục
   └─ Database chậm 30 giây        └─ Connection pool cạn vĩnh viễn
```

**Sửa trigger KHÔNG đủ.** Bạn phải phá vỡ sustaining effect.

Đây là lý do của mọi sự bối rối trong phòng chiến sự: đội vận hành sửa được database lúc 15:20, và không hiểu vì sao 15:50 hệ thống vẫn chết.

## Năm cơ chế duy trì phổ biến

### 1. Retry storm (case 1)

```text
   Trigger:    service chậm 30 giây
   Sustaining: retry nhân tải lên 27 lần → service không bao giờ khoẻ lại
   Phá vỡ:     tắt retry toàn cục (feature flag)
```

### 2. Hàng đợi chứa toàn request đã chết

```text
   Trigger:    tải đỉnh 60 giây
   Sustaining: hàng đợi tích 50.000 request, tất cả đã timeout ở client
               nhưng server vẫn cặm cụi xử lý chúng
               → request MỚI phải xếp sau 50.000 xác chết
   Phá vỡ:     xoá hàng đợi, hoặc bật deadline check
```

Đây là cơ chế tinh tế và phổ biến nhất. Server làm việc 100% công suất, hoàn toàn khoẻ mạnh, nhưng **thông lượng hữu ích bằng 0** vì mọi kết quả nó trả ra đều không còn ai nhận.

### 3. Cache trống

```text
   Trigger:    Redis restart
   Sustaining: 100% request xuống DB → DB quá tải → không ai ghi được cache
               → cache mãi trống → 100% request xuống DB → ...
   Phá vỡ:     giới hạn tốc độ nạp cache (case 2), warm-up cache trước
```

Vòng lặp này đặc biệt ác: **để cache đầy lại thì cần database khoẻ, nhưng để database khoẻ thì cần cache đầy.**

### 4. Health check giết pod (case 6)

```text
   Trigger:    latency tăng
   Sustaining: pod bị giết → ít pod hơn → tải cao hơn → pod bị giết
   Phá vỡ:     tắt liveness probe tạm thời, hoặc tăng failureThreshold
```

### 5. Connection pool cạn với transaction dài

```text
   Trigger:    một query chậm
   Sustaining: pool cạn → request xếp hàng 30 giây → timeout →
               nhưng transaction chưa rollback xong → pool vẫn cạn
   Phá vỡ:     huỷ các session đang treo ở DB, restart pool
```

## Nhận diện metastable failure

Ba dấu hiệu, cần đủ cả ba:

```text
   1. Nguyên nhân gốc đã được sửa   ✓
   2. Hệ thống vẫn không hồi phục   ✓
   3. Tải đầu vào KHÔNG cao bất thường (hoặc thậm chí thấp hơn bình thường
      vì người dùng đã bỏ đi)       ✓
```

Điểm số 3 là chìa khoá chẩn đoán: nếu hệ thống chết trong khi **tải đang thấp**, gần như chắc chắn bạn đang ở metastable failure.

```text
   Biểu đồ điển hình:

   Tải đến (RPS)
   1500 │      ╱╲
   1000 │─────╱  ╲──────────────────────
    500 │             ╲______________     ← người dùng bỏ đi, tải GIẢM
        └──────────────────────────────→

   Thông lượng thành công (RPS)
   1000 │─────╲
    500 │      ╲
      0 │       ╲______________________   ← vẫn bằng 0 dù tải đã giảm!
        └──────────────────────────────→
              ↑ trigger    ↑ trigger đã hết
```

Hai đường này tách nhau ra và không bao giờ gặp lại — đó là chữ ký của metastable failure.

## Thoát ra: giảm tải là con đường duy nhất

Nguyên tắc chung: **phải đưa tải xuống dưới ngưỡng hồi phục**, thấp hơn nhiều so với ngưỡng gây sập.

```text
   Ngưỡng gây sập    : 1.000 RPS  (vượt qua thì rơi vào trạng thái xấu)
   Ngưỡng hồi phục   :   400 RPS  (phải xuống dưới đây mới thoát ra được)

   ⇒ Khoảng cách này gọi là HYSTERESIS (độ trễ chuyển trạng thái).
     Nó luôn tồn tại, và thường lớn hơn nhiều so với trực giác.
```

Vì sao ngưỡng hồi phục thấp hơn nhiều? Vì lúc hồi phục hệ thống còn phải trả **nợ tích luỹ**: dọn hàng đợi, nạp lại cache, mở lại connection, JIT lại.

### Các cách giảm tải, theo mức độ mạnh

| Cách | Mức độ | Khi nào dùng |
|---|---|---|
| Bật load shedding tích cực | Nhẹ | Thử đầu tiên |
| Tắt retry toàn cục | Nhẹ | Khi nghi ngờ retry storm |
| Bật circuit breaker thủ công | Trung bình | Cắt dependency đang hỏng |
| Xoá hàng đợi | Trung bình | Khi hàng đợi đầy request đã chết |
| Chặn traffic ở load balancer (giữ lại 10%) | Mạnh | Khi các cách trên không đủ |
| Khởi động lại theo thứ tự phụ thuộc | Mạnh nhất | Phương án cuối |

### Quy trình khôi phục có kiểm soát

```text
   Bước 1: DỪNG DÒNG CHẢY
   ├─ Chặn traffic ở tầng ngoài cùng (LB / CDN)
   ├─ Tắt retry
   └─ Tạm dừng consumer đọc từ hàng đợi

   Bước 2: DỌN NỢ
   ├─ Xoá hàng đợi chứa request đã hết hạn
   ├─ Huỷ các session/transaction đang treo ở database
   ├─ Khởi động lại connection pool
   └─ Nạp trước cache khoá nóng

   Bước 3: MỞ LẠI TỪ TỪ
   ├─ 10% traffic → theo dõi latency 2 phút
   ├─ 25% → theo dõi
   ├─ 50% → theo dõi
   └─ 100%

   TUYỆT ĐỐI KHÔNG mở 100% ngay — sẽ rơi lại trạng thái xấu ngay lập tức.
```

Bước 3 là chỗ nhiều đội mắc sai lầm: sau khi sửa xong, họ mở toàn bộ traffic và hệ thống sập lại trong 10 giây. Phải tăng **từ từ**, vì hệ thống cần thời gian nạp lại cache và làm nóng.

### Khởi động lại theo thứ tự phụ thuộc

Nếu phải restart toàn bộ, thứ tự rất quan trọng:

```text
   SAI — restart tất cả cùng lúc:
   → Mọi service khởi động cùng lúc, cùng mở connection tới database
   → Cơn bão connection giết database
   → Tất cả lại chết

   ĐÚNG — từ trong ra ngoài:
   1. Database, Redis, Kafka (tầng hạ tầng)
   2. Chờ ổn định, kiểm tra
   3. Service tầng dữ liệu
   4. Chờ ổn định
   5. Service nghiệp vụ
   6. API Gateway (mở traffic cuối cùng)
```

## Phòng ngừa — thiết kế để không rơi vào trạng thái xấu

Chữa thì khó, phòng thì dễ hơn nhiều. Bảy biện pháp, theo thứ tự hiệu quả:

### 1. Hàng đợi có giới hạn + deadline

```java
// Hai dòng này ngăn được cơ chế duy trì phổ biến nhất
if (queue.size() > MAX_QUEUE) throw new OverloadedException();
if (System.currentTimeMillis() - request.getQueuedAt() > DEADLINE) {
    metrics.increment("request.expired");
    return;                    // bỏ, không xử lý
}
```

Chỉ riêng deadline check đã đủ ngăn hệ thống làm việc cho những người đã bỏ đi — cơ chế duy trì số 2.

### 2. Retry budget (case 1)

Giới hạn cứng: retry không quá 10% tổng request. Cơ chế duy trì số 1 bị chặn từ gốc.

### 3. Circuit breaker (case 3)

Cắt nguồn nhiên liệu của nhiều vòng lặp cùng lúc.

### 4. Load shedding thích ứng (case 4)

Hệ thống tự động từ chối bớt khi tải vượt ngưỡng, không bao giờ để mình bị đẩy qua điểm sập.

### 5. Duy trì khoảng dự trữ đủ lớn

```text
   Chạy ở 90% công suất  → cú sốc 15% là sập
   Chạy ở 60% công suất  → chịu được cú sốc 60%

   Chi phí: nhiều máy hơn.
   Lợi ích: không bao giờ tới gần vùng metastable.
```

Nhớ lại phase-1 bài 5: ở 90% utilization, latency đã gấp 10 lần. Chạy ở 60-70% không phải lãng phí — đó là mua bảo hiểm.

### 6. Công tắc khẩn cấp (kill switch)

```java
@Component
public class EmergencyControls {
    @Value("${emergency.retry.disabled:false}")     private volatile boolean noRetry;
    @Value("${emergency.shed.aggressive:false}")    private volatile boolean shedHard;
    @Value("${emergency.features.disabled:}")       private volatile Set<String> disabledFeatures;
    @Value("${emergency.cache.readonly:false}")     private volatile boolean cacheOnly;
}
```

Đọc từ config server (Spring Cloud Config, Consul) để đổi được **mà không cần deploy**. Trong sự cố, deploy mất 10-20 phút; đổi config mất 30 giây.

Danh sách công tắc nên có:

| Công tắc | Tác dụng |
|---|---|
| Tắt retry toàn cục | Phá vỡ retry storm |
| Load shedding tích cực | Giảm tải ngay |
| Tắt tính năng không thiết yếu | Giảm tải lên downstream |
| Chỉ đọc từ cache (không xuống DB) | Bảo vệ database |
| Tạm dừng consumer | Ngừng xử lý hàng đợi để dọn |
| Buộc circuit breaker mở | Cắt dependency đang hỏng |

### 7. Diễn tập — chaos engineering

Cách duy nhất biết chắc hệ thống có rơi vào metastable failure hay không là **thử**:

```text
   Kịch bản diễn tập cần có:
   ├─ Tăng tải đột ngột 3× trong 2 phút rồi hạ về bình thường
   │  → Hệ thống có tự về trạng thái tốt không?
   ├─ Xoá toàn bộ cache
   │  → Database có sống sót không?
   ├─ Làm một downstream chậm 10× trong 5 phút
   │  → Có lan sang service khác không?
   └─ Giết 50% pod cùng lúc
      → Số pod còn lại có bị giết theo không?
```

Chỉ số quan trọng nhất cần đo trong diễn tập: **thời gian hồi phục sau khi ngừng gây nhiễu**. Nếu nó lớn hơn 0 một cách đáng kể (ví dụ nhiễu dừng lúc t=5 phút mà tới t=20 phút mới khoẻ), bạn có vấn đề metastable.

## Trường hợp thực tế: sự cố 4 tiếng của một sàn thương mại điện tử

```text
   19:00  Chiến dịch khuyến mãi bắt đầu. Traffic 3×. Hệ thống chịu được.
   19:12  Một node Redis trong cụm bị lỗi mạng 40 GIÂY.
   19:13  Node hồi phục. Redis hoàn toàn bình thường trở lại.

   ⇒ TRIGGER chỉ kéo dài 40 giây và đã tự khỏi.

   19:13  Nhưng: trong 40 giây đó, cache miss 100%
          → 200.000 request xuống database
          → database quá tải
          → query chậm → timeout → retry
   19:15  Retry storm: tải database gấp 27 lần
   19:20  Connection pool của mọi service cạn
   19:25  Health check fail → pod bị giết → CrashLoopBackOff
   19:40  Đội vận hành xác nhận Redis khoẻ, database khoẻ (khi không có tải)
          NHƯNG hệ thống vẫn chết
   20:30  Thử restart tất cả cùng lúc → cơn bão connection → chết lại
   21:15  Thử tăng số pod lên gấp đôi → tệ hơn (nhiều connection hơn)
   22:40  Nhận ra vấn đề. Chặn 100% traffic ở CDN.
   22:45  Dọn: xoá hàng đợi, huỷ session treo, nạp trước cache khoá nóng
   22:50  Mở 10% traffic → ổn định
   22:55  25% → ổn định
   23:00  50% → ổn định
   23:10  100% → hệ thống hoàn toàn bình thường

   Tổng: 4 tiếng mất dịch vụ.
   Nguyên nhân gốc: 40 giây mất một node Redis.
```

**Phân tích**:

| Yếu tố | Là gì | Kéo dài |
|---|---|---|
| Trigger | Node Redis lỗi mạng | **40 giây** |
| Sustaining #1 | Cache trống → DB quá tải | 4 tiếng |
| Sustaining #2 | Retry storm | 4 tiếng |
| Sustaining #3 | Health check giết pod | 3 tiếng |

Ba giờ trong bốn giờ sự cố là **thời gian tìm cách thoát ra**, không phải thời gian sửa lỗi. Lỗi đã tự sửa từ phút thứ nhất.

**Bài học và hành động sau sự cố**:

| Bài học | Hành động |
|---|---|
| Không có công tắc khẩn cấp | Xây bảng điều khiển với 6 công tắc, đổi nóng qua config server |
| Không ai biết khái niệm metastable | Đào tạo đội; thêm vào runbook mục "nếu đã sửa gốc mà vẫn chết" |
| Thêm pod làm tệ hơn | Ghi rõ trong runbook: **không scale ngang khi đang metastable** |
| Không có quy trình mở traffic từ từ | Viết script tăng dần 10/25/50/100% |
| Chưa từng diễn tập | Chaos test hàng tháng, đo thời gian hồi phục |
| Cache không có cơ chế bảo vệ DB | Thêm rate limit trên cache miss (case 2) |

Hành động thứ ba đáng nhấn mạnh: **phản xạ tự nhiên khi hệ thống chết là thêm máy — và trong metastable failure, điều đó làm mọi thứ tệ hơn**, vì mỗi instance mới lại mở thêm connection, thêm retry, thêm tải lên tầng dưới vốn đang là nút thắt.

## Bảng phân biệt các loại sự cố

| Loại | Sửa gốc thì hết? | Tải cao? | Cách xử lý |
|---|---|---|---|
| Lỗi thông thường | **Có** | Không | Sửa lỗi, xong |
| Quá tải đơn thuần | Có (khi tải giảm) | **Có** | Scale ngang, load shedding |
| **Metastable failure** | **KHÔNG** | Không (thậm chí thấp) | **Giảm tải mạnh, dọn nợ, mở lại từ từ** |

Bảng này đáng in ra và dán trong phòng trực. Nhận diện đúng loại quyết định 90% thời gian khôi phục.

## Tóm tắt case 7

- **Metastable failure**: hệ thống mắc kẹt ở trạng thái hỏng **tự duy trì**, không thoát ra dù nguyên nhân gốc đã hết.
- Phân biệt **trigger** (ngắn, đã hết) và **sustaining effect** (tự nuôi mình). **Sửa trigger không đủ.**
- Chữ ký nhận diện: **nguyên nhân đã sửa + hệ thống vẫn chết + tải đang thấp**.
- Năm cơ chế duy trì: retry storm, hàng đợi chứa xác chết, cache trống, health check giết pod, pool cạn.
- Thoát ra: **giảm tải xuống dưới ngưỡng hồi phục** (thấp hơn nhiều ngưỡng sập — hysteresis), **dọn nợ**, rồi **mở lại từ từ** 10/25/50/100%.
- **Không bao giờ scale ngang khi đang metastable** — nó làm tệ hơn.
- Phòng ngừa: hàng đợi có giới hạn + deadline, retry budget, circuit breaker, load shedding, **chạy ở 60-70% công suất**, và **công tắc khẩn cấp đổi nóng**.
- Chỉ số quan trọng nhất trong chaos test: **thời gian hồi phục sau khi ngừng gây nhiễu**.

**Bài kế tiếp** → [Case 8: Phụ thuộc bên thứ ba — khi bạn không kiểm soát được nguyên nhân](08-case-phu-thuoc-ben-thu-ba.md)
