# Bài 1: Load Balancer — chia đều dòng khách

Black Friday. Một sàn thương mại điện tử rất nổi tiếng sập hoàn toàn chỉ sau **ba giây** khi vừa mở đợt sale lớn nhất năm.

Điều kỳ lạ: họ **không hề thiếu máy chủ**. Trong cụm có tới 10 con server rất mạnh, và tất cả vẫn đang chạy bình thường.

Vậy tại sao vẫn sập?

Bởi vì **toàn bộ lượng truy cập khổng lồ đã dồn hết vào đúng một server duy nhất**, trong khi 9 con còn lại ngồi chơi xơi nước.

Thủ phạm nằm ở một lớp mà rất ít người để ý tới: **bộ cân bằng tải**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **Load Balancer** (LB) | **Bộ cân bằng tải** — chia request cho nhiều máy chủ |
| **Backend / Upstream** | **Máy chủ phía sau** — nơi thực sự xử lý request |
| **Health check** | **Kiểm tra sức khoẻ** — hỏi định kỳ xem máy còn sống không |
| **Sticky session** | **Phiên dính** — cùng một người luôn được đưa về cùng một máy |
| **Horizontal scaling** | **Mở rộng ngang** — thêm máy |
| **Vertical scaling** | **Mở rộng dọc** — nâng cấp máy hiện có |
| **L4 / L7** | Tầng 4 (TCP/UDP) và tầng 7 (HTTP) trong mô hình OSI |
| **SPOF** (*Single Point of Failure*) | **Điểm chết duy nhất** — hỏng cái đó là sập cả hệ thống |
| **Draining** | **Rút cạn** — ngừng đưa request mới vào máy sắp tắt |
| **Thundering herd** | **Bầy đàn** — nhiều client cùng làm một việc cùng lúc |

## Kiến trúc và cách hoạt động

```text
                         Người dùng
                              │
                              ▼
                   ┌──────────────────────┐
                   │  DNS: shop.vn        │  → trả về IP của load balancer
                   └──────────┬───────────┘
                              ▼
                   ┌──────────────────────┐
                   │    LOAD BALANCER     │  ← "nhân viên lễ tân thông minh"
                   │                      │
                   │  ① nhận request      │
                   │  ② chọn máy còn khoẻ │
                   │  ③ chuyển tiếp       │
                   │  ④ trả kết quả về    │
                   └───┬──────┬───────┬───┘
                       ▼      ▼       ▼
                  ┌──────┐┌──────┐┌──────┐
                  │Máy A ││Máy B ││Máy C │   ← các bản sao GIỐNG HỆT NHAU
                  └──────┘└──────┘└──────┘
                       ▲      ▲       ▲
                       └──────┴───────┘
                    HEALTH CHECK mỗi 5 giây:
                    GET /healthz → 200 OK?
                    Không trả lời → LOẠI khỏi vòng chia
```

**Điểm mấu chốt:** load balancer chỉ hoạt động được khi các máy phía sau là **bản sao thay thế được cho nhau**. Nếu máy A giữ thứ mà máy B không có, việc chia đều sẽ gây lỗi — đó chính là bài toán sticky session ở phần sau.

## Sáu thuật toán chia tải

### ① Round Robin — chia lần lượt

```text
   Request 1 → Máy A
   Request 2 → Máy B
   Request 3 → Máy C
   Request 4 → Máy A     ← quay vòng
```

Giống chia bài đều tay quanh bàn. **Đơn giản nhất, và là mặc định của gần như mọi load balancer.**

```text
✓ Đơn giản, không cần nhớ trạng thái gì
✗ MÙ TỊT VỀ TẢI THẬT: máy A đang xử lý một báo cáo nặng 30 giây
  vẫn nhận request đều như máy B đang rảnh
✗ Coi mọi máy như nhau, dù cấu hình khác nhau
```

### ② Weighted Round Robin — chia theo trọng số

```text
   Máy A (32 nhân) → trọng số 4
   Máy B (16 nhân) → trọng số 2
   Máy C (8 nhân)  → trọng số 1

   Cứ 7 request: 4 về A, 2 về B, 1 về C
```

Giải được vấn đề máy không đồng đều. Dùng nhiều khi cụm có nhiều thế hệ phần cứng.

### ③ Least Connections — chọn máy đang rảnh nhất

```text
   Máy A: đang giữ 47 kết nối
   Máy B: đang giữ 12 kết nối   ◄── chọn máy này
   Máy C: đang giữ 33 kết nối
```

```text
✓ Cân tải THÔNG MINH — tự thích ứng khi request có thời lượng rất khác nhau
✓ Máy chậm tự nhiên nhận ít việc hơn
✗ Tốn thêm tính toán, LB phải theo dõi trạng thái từng máy
✗ Vẫn có thể lệch nếu request rất ngắn (kết nối đóng quá nhanh để đếm kịp)
```

**Đây là lựa chọn tốt nhất khi thời lượng request không đồng đều** — ví dụ API vừa có endpoint trả về trong 5 ms vừa có endpoint xuất báo cáo 30 giây.

### ④ Least Response Time — chọn máy trả lời nhanh nhất

Kết hợp số kết nối đang mở **và** độ trễ trung bình gần đây. Thông minh nhất, nhưng tốn chi phí đo đạc nhất.

### ⑤ IP Hash — băm địa chỉ IP

```text
   hash("203.0.113.45") % 3 = 1  →  luôn về Máy B

   Cùng một IP đi qua hàm băm thì LUÔN cho cùng kết quả
   → người dùng đó luôn rơi trúng server cũ quen thuộc
   → đúng cái nơi đang giữ phiên đăng nhập và giỏ hàng của họ
```

```text
✓ GIỮ ĐƯỢC PHIÊN — phù hợp cho hệ thống lưu trạng thái trong bộ nhớ máy
✗ THÊM/BỚT MÁY LÀ BĂM LẠI TỪ ĐẦU
  → người dùng bị văng sang máy mới toanh và MẤT SẠCH phiên làm việc
✗ Nhiều người dùng sau cùng một NAT (văn phòng, nhà mạng di động)
  → tất cả dồn vào một máy
```

Điểm yếu thứ hai đáng nói: ở Việt Nam, hàng nghìn người dùng 4G có thể chia sẻ chung một dải IP của nhà mạng — IP hash sẽ dồn hết họ vào một máy.

### ⑥ Consistent Hashing — băm nhất quán

Đây là lời giải cho điểm yếu "thêm máy là băm lại" của IP hash.

```text
        Máy A (0°)
      ╱             ╲
   key3            Máy B (90°)
   ╱                    ╲
Máy D (270°)          key1
   ╲                    ╱
   key2            Máy C (180°)

   Mỗi khoá đi theo chiều kim đồng hồ tới máy đầu tiên gặp được.

   Thêm Máy E vào 45°:
      → chỉ những khoá nằm giữa 0° và 45° phải chuyển
      → CHỈ ~1/N dữ liệu di chuyển, thay vì gần như toàn bộ
```

Đây là thuật toán đứng sau CDN, Memcached cluster, và mọi hệ thống cần "cùng khoá thì cùng máy" mà vẫn co giãn được.

### Bảng chọn

| Thuật toán | Chọn khi | Điểm yếu chính |
|---|---|---|
| **Round Robin** | Máy đồng đều, request đồng đều | Mù về tải thật |
| **Weighted RR** | Máy khác cấu hình | Vẫn mù về tải thật |
| **Least Connections** | **Request thời lượng rất khác nhau** | Tốn tính toán |
| **Least Response Time** | Cần tối ưu độ trễ p99 | Tốn nhất |
| **IP Hash** | Bắt buộc giữ phiên trong bộ nhớ | Vỡ khi đổi số máy |
| **Consistent Hashing** | Cần dính máy **và** co giãn được | Phức tạp hơn |

> **Thực tế: kỹ sư hiếm khi dùng đúng một thuật toán.** Họ kết hợp — ví dụ Least Connections cộng health check cộng trọng số theo cấu hình máy.

## Health check — lớp quan trọng hơn cả thuật toán

Thuật toán chia tải hay tới đâu cũng vô nghĩa nếu nó vẫn gửi request tới một máy đã chết.

```text
   LB hỏi mỗi 5 giây:  GET /healthz
      → 200 OK trong 2 giây  → máy còn sống, giữ trong vòng chia
      → timeout / 5xx         → đếm lỗi
      → lỗi 3 lần liên tiếp   → LOẠI khỏi vòng chia
      → sau đó vẫn hỏi tiếp; OK 2 lần liên tiếp → đưa trở lại
```

Ba loại health check, và phân biệt được chúng là ghi điểm:

```python
# ① LIVENESS — "tiến trình còn sống không?" → không thì KHỞI ĐỘNG LẠI
@app.get("/healthz/live")
def live():
    return {"ok": True}          # cực nhẹ, KHÔNG chạm database

# ② READINESS — "sẵn sàng NHẬN VIỆC chưa?" → không thì LOẠI khỏi vòng chia
@app.get("/healthz/ready")
def ready():
    try:
        db.execute("SELECT 1")               # có kết nối được database không
        redis.ping()
        if pool.so_ket_noi_ranh() == 0:      # pool cạn = chưa sẵn sàng
            raise Exception("pool cạn")
    except Exception as e:
        raise HTTPException(503, str(e))
    return {"ok": True}

# ③ STARTUP — "khởi động xong chưa?" → cho ứng dụng chậm khởi động thêm thời gian
```

**Vì sao phải tách liveness và readiness?** Đây là câu hỏi phỏng vấn rất hay:

```text
   Database chậm tạm thời:
      readiness FAIL  → LB ngừng gửi request tới. Đúng.  ✅
      liveness  FAIL  → Kubernetes KHỞI ĐỘNG LẠI pod.   ❌ SAI!

   → Khởi động lại không sửa được database chậm.
   → Tệ hơn: mọi pod cùng fail liveness, cùng bị restart,
     và bạn mất luôn cả cụm khi database vừa hồi phục.

   LUẬT: liveness phải CỰC KỲ ĐƠN GIẢN, không phụ thuộc bên ngoài.
         readiness mới là nơi kiểm phụ thuộc.
```

## Sticky session — và vì sao nên tránh nó

```text
   VẤN ĐỀ:
      Máy A giữ phiên đăng nhập của bạn trong BỘ NHỚ.
      Request tiếp theo rơi vào Máy B → "bạn là ai?" → đá ra.

   BA CÁCH XỬ LÝ:
```

```text
❌ Cách 1: IP Hash / Cookie dính
   LB đặt cookie riêng để luôn đưa bạn về đúng máy cũ.
   ✓ Không phải sửa code
   ✗ Máy đó chết → mất phiên của TẤT CẢ người dùng dính vào nó
   ✗ Tải lệch: máy nào lỡ nhận nhiều người dùng nặng thì gánh mãi
   ✗ Deploy = mất phiên
   ✗ Không auto-scale được êm

⚠️ Cách 2: Nhân bản phiên giữa các máy
   ✗ Tốn băng thông nội bộ, chậm, và vẫn có cửa sổ chưa đồng bộ

✅ Cách 3: TÁCH TRẠNG THÁI RA KHO CHUNG (Redis / database)
   → Mọi máy đều giống hệt nhau, thay thế được cho nhau
   → Thêm/bớt/restart máy nào cũng không ai mất phiên
   → ĐÂY LÀ LỜI GIẢI ĐÚNG
```

```text
   Nguyên tắc kiến trúc gọi là "12-Factor App":

      MÁY CHỦ PHẢI KHÔNG CÓ TRẠNG THÁI (stateless).
      Mọi trạng thái đẩy ra kho ngoài: Redis, database, S3.

   → Lúc đó thuật toán chia tải nào cũng dùng được,
     và bạn không cần sticky session nữa.
```

## L4 và L7 — hai tầng, hai năng lực

```text
   L4 (tầng vận chuyển) — chỉ nhìn thấy IP và CỔNG
      ┌────────────────────────────────────┐
      │ TCP: 203.0.113.5:54321 → :443      │  ← LB chỉ thấy tới đây
      │ [██ dữ liệu đã mã hoá, không đọc ██]│
      └────────────────────────────────────┘
      ✓ CỰC NHANH (hàng triệu kết nối/giây), độ trễ rất thấp
      ✓ Không cần giải mã TLS
      ✗ Không đọc được URL, header, cookie → không định tuyến theo nội dung


   L7 (tầng ứng dụng) — ĐỌC ĐƯỢC toàn bộ HTTP
      ┌────────────────────────────────────┐
      │ GET /api/orders HTTP/1.1            │  ← LB đọc được hết
      │ Host: shop.vn                       │
      │ Cookie: sid=abc123                  │
      │ Authorization: Bearer ...           │
      └────────────────────────────────────┘
      ✓ Định tuyến theo đường dẫn: /api → cụm API, /static → CDN
      ✓ Kết thúc TLS tại đây, nén, viết lại header, A/B testing
      ✓ Retry request lỗi sang máy khác
      ✗ Chậm hơn, phải giải mã TLS (tốn CPU)
```

| | L4 | L7 |
|---|---|---|
| Nhìn thấy | IP + cổng | Toàn bộ HTTP |
| Tốc độ | Rất nhanh | Chậm hơn |
| Định tuyến theo đường dẫn | ❌ | ✅ |
| Kết thúc TLS | ❌ | ✅ |
| Retry thông minh | ❌ | ✅ |
| Ví dụ | AWS NLB, LVS | Nginx, HAProxy, AWS ALB, Envoy |

**Kiến trúc phổ biến: dùng cả hai.**

```text
   Internet → [L4: AWS NLB]  → chịu tải khổng lồ, chống DDoS tầng mạng
                    ↓
              [L7: Nginx/Envoy] → định tuyến theo đường dẫn, TLS, rate limit
                    ↓
              [Ứng dụng]
```

## Load balancer là điểm chết duy nhất — và cách chữa

```text
   Mọi thứ đi qua nó. Nó ngã thì cả hệ thống ngã theo,
   dù 10 máy phía sau vẫn khoẻ mạnh.
```

Ba lớp giải quyết:

```text
① NHIỀU LOAD BALANCER + IP NỔI (floating IP / VRRP)
      LB chính ─┐
                ├── cùng giữ một IP ảo
      LB dự phòng┘
      LB chính chết → LB dự phòng nhận IP đó trong vài giây (keepalived)

② DNS ROUND ROBIN — trả về nhiều IP cho cùng một tên miền
      shop.vn → 203.0.113.1, 203.0.113.2, 203.0.113.3
      ✗ Nhược điểm lớn: DNS được CACHE, client không biết IP nào đã chết
      → chỉ dùng làm lớp phụ, không dùng một mình

③ ANYCAST — nhiều trung tâm dữ liệu cùng quảng bá MỘT địa chỉ IP
      Mạng tự định tuyến người dùng tới nơi GẦN NHẤT còn sống
      → đây là cách CDN và Cloudflare hoạt động
```

Trong thực tế với cloud, bạn dùng load balancer **được quản lý** (ALB/NLB, Cloud Load Balancing) — nhà cung cấp đã lo phần dự phòng, và bạn trả tiền cho việc đó.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Bạn deploy phiên bản mới. LB vẫn gửi request tới máy đang tắt, người dùng nhận lỗi 502.

**Nguyên nhân:** máy bị tắt **trước khi** LB kịp nhận ra nó đã chết (health check chạy mỗi 5 giây).

```text
   ✅ QUY TRÌNH TẮT ÊM (graceful shutdown):

   ① Nhận tín hiệu SIGTERM
   ② ĐÁNH DẤU readiness = FAIL           ← LB thấy và ngừng gửi request mới
   ③ CHỜ (~15 giây) để LB kịp cập nhật    ← bước hay bị quên nhất
   ④ Xử lý nốt các request ĐANG chạy
   ⑤ Đóng kết nối database, flush log
   ⑥ Thoát
```

```python
import signal, time
dang_tat = False

def xu_ly_sigterm(*_):
    global dang_tat
    dang_tat = True                    # ② readiness sẽ trả 503 từ giờ

signal.signal(signal.SIGTERM, xu_ly_sigterm)

@app.get("/healthz/ready")
def ready():
    if dang_tat:
        raise HTTPException(503, "đang tắt")
    ...
```

```yaml
# Kubernetes — preStop hook để chờ LB cập nhật
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 15"]     # ③ bước quan trọng
terminationGracePeriodSeconds: 45           # ④ đủ dài cho request đang chạy
```

> **Tình huống 2:** Một máy chủ bị lỗi và trả 500 rất nhanh. Least Connections thấy nó "rảnh nhất" nên **dồn hết request vào đó**.

Đây là nghịch lý kinh điển: **máy hỏng trông giống máy rảnh.**

```text
   ✅ Ba lớp chữa:

   ① Health check phải kiểm THẬT, không chỉ kiểm tiến trình còn sống
   ② PHÁT HIỆN NGOẠI LỆ (outlier detection): LB tự loại máy có
      tỉ lệ lỗi cao bất thường so với các máy khác
   ③ CIRCUIT BREAKER ở tầng LB (Envoy có sẵn)
```

```yaml
# Envoy — tự loại máy lỗi
outlier_detection:
  consecutive_5xx: 5              # 5 lần 5xx liên tiếp
  base_ejection_time: 30s         # loại ra 30 giây
  max_ejection_percent: 50        # nhưng KHÔNG loại quá 50% cụm
```

Dòng cuối rất quan trọng: nếu database chết thì **mọi** máy đều lỗi — không giới hạn thì LB sẽ loại sạch cụm và bạn mất hẳn dịch vụ thay vì chỉ suy giảm.

> **Tình huống 3:** Bật auto-scaling, nhưng lúc tăng tải đột ngột hệ thống vẫn sập trước khi máy mới kịp lên.

```text
   Máy mới cần thời gian:  khởi tạo VM/container  30–60s
                            + khởi động ứng dụng   10–30s
                            + làm nóng cache/JIT   10–60s
                            = tối thiểu 1–2 PHÚT

   Đợt tăng tải Black Friday đến trong 3 GIÂY.

   ✅ Cách xử lý:
   ① Scale theo chỉ báo SỚM (độ sâu hàng đợi, tỉ lệ tăng request),
      không theo CPU — CPU tăng là đã muộn
   ② Giữ sẵn công suất dự phòng (headroom) 30–40% trong sự kiện đã biết trước
   ③ Pre-scale THỦ CÔNG trước giờ sale — sự kiện có lịch thì đừng dựa vào tự động
   ④ Hàng đợi ảo / phòng chờ ở tầng edge để làm phẳng đỉnh
   ⑤ Xả tải có chọn lọc: ưu tiên request thanh toán, hoãn request gợi ý
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chỉ có một load balancer | **Điểm chết duy nhất** | Cặp LB + IP nổi, hoặc LB được quản lý |
| Không có health check | Gửi request tới máy đã chết | Readiness probe kiểm phụ thuộc thật |
| Liveness kiểm cả database | Database chậm → restart hết pod | Liveness cực đơn giản, không phụ thuộc ngoài |
| Không có graceful shutdown | 502 mỗi lần deploy | SIGTERM → readiness fail → **chờ** → thoát |
| Quên `preStop sleep` | LB chưa kịp cập nhật đã tắt máy | Chờ ~15 giây |
| Dùng sticky session | Máy chết = mất phiên hàng loạt, không scale êm | Tách trạng thái ra Redis |
| IP hash với người dùng sau NAT | Hàng nghìn người dồn một máy | Consistent hashing, hoặc bỏ dính hẳn |
| Least Connections gặp máy lỗi nhanh | **Dồn hết vào máy hỏng** | Outlier detection + health check thật |
| Không giới hạn `max_ejection_percent` | Database chết → loại sạch cụm | Giới hạn 50% |
| DNS round robin làm HA duy nhất | Client cache DNS, không biết IP đã chết | Chỉ dùng làm lớp phụ |
| Auto-scale theo CPU | Phản ứng quá chậm cho đỉnh đột ngột | Chỉ báo sớm + pre-scale thủ công |
| Timeout LB ngắn hơn timeout ứng dụng | LB ngắt giữa chừng, request vẫn chạy tiếp | LB timeout > app timeout |

## Câu hỏi phỏng vấn hay gặp

**H: Load balancer chia tải bằng cách nào?**
Phổ biến nhất là **Round Robin** (chia lần lượt, đơn giản nhưng mù về tải thật), **Least Connections** (chọn máy đang rảnh nhất — tốt nhất khi request có thời lượng rất khác nhau), và **IP Hash** (giữ phiên, nhưng vỡ khi thêm/bớt máy). Thực tế kỹ sư hiếm khi dùng đúng một thuật toán — họ kết hợp, và quan trọng hơn cả thuật toán là lớp **health check** liên tục loại máy chết ra khỏi vòng chia.

**H: Vì sao phải tách liveness và readiness probe?**
Vì hai câu hỏi khác nhau dẫn tới hai hành động khác nhau. Readiness hỏi *"sẵn sàng nhận việc chưa"* — không thì LB ngừng gửi request. Liveness hỏi *"tiến trình còn sống không"* — không thì **khởi động lại**. Nếu liveness kiểm cả database thì khi database chậm, **mọi pod cùng bị restart** — mà restart không sửa được database chậm, và bạn mất luôn cả cụm đúng lúc database vừa hồi phục. Nên liveness phải cực đơn giản, không phụ thuộc bên ngoài.

**H: Sticky session có nên dùng không?**
Nên tránh. Nó giải được triệu chứng nhưng không giải được nguyên nhân: máy chủ đang **giữ trạng thái**. Cái giá là máy đó chết thì mất phiên của tất cả người dùng dính vào nó, tải bị lệch, deploy mất phiên, và không auto-scale êm được. Lời giải đúng là **tách trạng thái ra kho chung** như Redis — lúc đó mọi máy giống hệt nhau, thay thế được cho nhau, và bạn dùng thuật toán chia tải nào cũng được.

**H: L4 và L7 khác gì?**
L4 chỉ thấy **IP và cổng** — cực nhanh, không cần giải mã TLS, nhưng không định tuyến theo nội dung được. L7 **đọc được toàn bộ HTTP** — định tuyến theo đường dẫn, kết thúc TLS, viết lại header, retry thông minh, A/B testing — đổi lại chậm hơn và tốn CPU giải mã. Kiến trúc phổ biến là dùng cả hai: L4 ở ngoài cùng chịu tải và chống DDoS tầng mạng, L7 phía sau lo định tuyến.

**H: Deploy mà không có lỗi 502, làm thế nào?**
**Tắt êm**: nhận SIGTERM → đánh dấu readiness fail → **chờ khoảng 15 giây** để LB kịp cập nhật → xử lý nốt request đang chạy → đóng kết nối → thoát. Bước hay bị quên nhất là **bước chờ** — vì health check chạy mỗi 5 giây nên có một cửa sổ mà LB vẫn nghĩ máy còn sống. Trong Kubernetes thì đó là `preStop` hook với `sleep`, cộng `terminationGracePeriodSeconds` đủ dài.

**H: Máy chủ bị lỗi trả 500 rất nhanh, Least Connections xử lý thế nào?**
Đây là nghịch lý kinh điển: **máy hỏng trông giống máy rảnh**, nên Least Connections sẽ dồn hết request vào nó. Chữa bằng ba lớp: health check phải kiểm phụ thuộc thật chứ không chỉ kiểm tiến trình còn sống; **outlier detection** để LB tự loại máy có tỉ lệ lỗi cao bất thường; và giới hạn `max_ejection_percent` khoảng 50% — vì nếu database chết thì mọi máy đều lỗi, không giới hạn thì LB loại sạch cụm và bạn mất hẳn dịch vụ thay vì chỉ suy giảm.

## Tóm tắt bài 1

- Load balancer chỉ hoạt động khi các máy phía sau là **bản sao thay thế được cho nhau** — nên trạng thái phải nằm ở kho ngoài.
- Sáu thuật toán: **Round Robin** (mặc định, mù về tải), **Weighted RR**, **Least Connections** (tốt nhất khi request không đồng đều), **Least Response Time**, **IP Hash** (giữ phiên nhưng vỡ khi đổi số máy), **Consistent Hashing**.
- **Health check quan trọng hơn thuật toán.** Tách **liveness** (đơn giản, không phụ thuộc ngoài → restart) khỏi **readiness** (kiểm phụ thuộc thật → loại khỏi vòng chia).
- **Sticky session là chữa triệu chứng** — lời giải đúng là tách trạng thái ra Redis theo nguyên tắc 12-Factor.
- **L4** nhanh nhưng mù nội dung; **L7** đọc được HTTP nên định tuyến/TLS/retry được. Thực tế dùng cả hai chồng lên nhau.
- LB là **điểm chết duy nhất** → cặp LB + IP nổi, hoặc dùng LB được quản lý của cloud.
- Deploy không lỗi 502 cần **tắt êm có bước chờ**; và cẩn thận nghịch lý **máy hỏng trông giống máy rảnh** → outlier detection có giới hạn phần trăm.

**Bài kế tiếp** → [Bài 2: API Gateway — một cửa duy nhất](02-api-gateway-mot-cua-duy-nhat.md)
