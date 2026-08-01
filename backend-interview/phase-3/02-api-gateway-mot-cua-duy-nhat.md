# Bài 2: API Gateway — một cửa duy nhất

23 giờ 47 phút. Một sàn thương mại điện tử đang chạy đợt giảm giá. Khách mở ứng dụng, bấm vào mục "Đơn hàng". Màn hình trắng, vòng xoay quay mãi không dừng. **Chín giây.**

Không phải server chết. Ứng dụng đang gọi **thẳng 12 dịch vụ khác nhau**, mỗi cái một địa chỉ. Chỉ cần một dịch vụ gợi ý trả lời chậm 4 giây, cả màn hình phải chờ.

Tệ hơn: mỗi dịch vụ **tự kiểm tra đăng nhập** — và có một dịch vụ **quên kiểm**. Đổi một con số trên đường dẫn, bạn thấy đơn hàng của người lạ.

Cả hai tai nạn đều chung một nguyên nhân: **hệ thống này không có ai đứng gác ở cửa.**

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **API Gateway** | **Cổng API** — cửa duy nhất mọi request từ ngoài phải đi qua |
| **Reverse proxy** | **Proxy ngược** — đứng trước máy chủ, nhận thay và chuyển tiếp |
| **Service discovery** | **Danh bạ dịch vụ** — nơi tra địa chỉ thật của một dịch vụ |
| **Circuit breaker** | **Cầu dao** — ngắt mạch khi dịch vụ phía sau hỏng liên tục |
| **Rate limiting** | **Giới hạn tần suất** — mỗi khoá chỉ được gọi bấy nhiêu lần |
| **Fan-out** | **Toả ra** — một request vào, gateway gọi nhiều dịch vụ |
| **BFF** (*Backend For Frontend*) | Tầng tổng hợp riêng cho từng loại client |
| **East-west / North-south** | Lưu lượng **giữa các dịch vụ** / **từ ngoài vào trong** |
| **Service mesh** | Lớp hạ tầng lo giao tiếp giữa các dịch vụ |
| **Canary release** | Thả 5% lưu lượng sang bản mới để thử |

## Gateway không phải load balancer

Đây là câu hỏi phỏng vấn hay gặp, và nhiều người trả lời lẫn lộn.

```text
   LOAD BALANCER
      Chia tải giữa các BẢN SAO GIỐNG HỆT NHAU.
      "Ba máy này đều chạy order-service, gửi vào máy nào cũng được."
      → Nó KHÔNG QUAN TÂM nội dung request.

   API GATEWAY
      ĐỌC từng đường dẫn, BIẾT ai đang gọi,
      và QUYẾT ĐỊNH request này được đi tiếp hay bị chặn.
      "/orders thì sang order-service, /users thì sang user-service,
       và token này hết hạn rồi nên chặn luôn."
      → Nó là REVERSE PROXY CÓ TRÍ TUỆ, đứng trước cả CỤM DỊCH VỤ.
```

## Kiến trúc và cách hoạt động

```text
   TRƯỚC — 12 cửa, mỗi cửa tự gác (và có cửa quên gác)

      App ──┬──► order-service.shop.vn      (tự kiểm token)
            ├──► user-service.shop.vn       (tự kiểm token)
            ├──► payment-service.shop.vn    (tự kiểm token)
            ├──► recommend-service.shop.vn  ← QUÊN KIỂM  ❌
            └──► ... 8 dịch vụ nữa
      → App phải biết 12 địa chỉ
      → 12 chỗ cài đặt xác thực = 12 chỗ có thể sai


   SAU — một cửa duy nhất

      App ──► api.shop.vn ──► ┌──────────── API GATEWAY ────────────┐
                              │ ① Kết thúc TLS                      │
                              │ ② Xác thực: kiểm chữ ký token       │
                              │ ③ Phân quyền thô: scope có đủ không │
                              │ ④ Rate limit: còn hạn mức không     │
                              │ ⑤ Định tuyến: đường dẫn → dịch vụ   │
                              │ ⑥ Circuit breaker                   │
                              │ ⑦ Ghi log + trace_id                │
                              └───┬────────┬────────┬───────────────┘
                                  ▼        ▼        ▼
                            ┌────────┐┌────────┐┌────────┐
                            │ order  ││  user  ││ payment│  ← MẠNG NỘI BỘ
                            └────────┘└────────┘└────────┘     người ngoài
                                                                KHÔNG gọi được

      → App chỉ biết ĐÚNG MỘT tên miền
      → 12 chỗ xác thực còn 1
```

**Điểm mấu chốt:** 12 dịch vụ phía sau nằm trong **mạng nội bộ**, không có đường nào khác đi vào. Đó là lý do gateway đáng tin — không phải vì nó kiểm kỹ, mà vì **không có cửa nào khác**.

## Ba việc gateway làm — không hơn

### ① Định tuyến

```yaml
# Bảng đường: đường dẫn nào thì đi tới dịch vụ nào
routes:
  - path: /api/v1/orders/**
    service: order-service.internal:8080
  - path: /api/v1/users/**
    service: user-service.internal:8080
  - path: /api/v1/products/**
    service: catalog-service.internal:8080
```

Cái hay là **client không cần biết địa chỉ thật**. Dịch vụ đổi máy chủ, thêm bản sao, đổi cổng — gateway hỏi lại **danh bạ dịch vụ** và tự cập nhật. Ứng dụng ngoài kia không phải sửa dòng nào.

Nó cũng là chỗ chạy hai phiên bản song song:

```yaml
# Canary: thả 5% lưu lượng sang bản mới
- path: /api/v1/orders/**
  destinations:
    - service: order-service-v1
      weight: 95
    - service: order-service-v2
      weight: 5           # ← tăng dần khi thấy chỉ số ổn
```

### ② Chốt chặn — xác thực và hạn mức

```text
   Gateway kiểm CHỮ KÝ của token:
      hết hạn → chặn, trả 401
      sai chữ ký → chặn
      → KHÔNG có request nào chưa được kiểm mà đi vào tới bên trong.

   Sau khi kiểm xong, nó GẮN THÊM HEADER NỘI BỘ:
      X-User-Id: 88
      X-User-Roles: admin,staff
      X-Tenant-Id: 42
      X-Trace-Id: abc-123-def

   → Dịch vụ bên trong chỉ việc ĐỌC dòng đó,
     không phải tự giải mã token, không phải giữ khoá công khai.
     12 chỗ xác thực còn 1.
```

**⚠️ Và đây là bẫy chết người:**

```text
   Nếu kẻ tấn công gọi THẲNG vào dịch vụ nội bộ và tự đặt header
   `X-User-Id: 1` thì sao?

   → Dịch vụ đó tin ngay, vì nó tưởng gateway đã kiểm.

   BA LỚP CHỐNG:
   ① Gateway phải XOÁ SẠCH mọi header X-* đến từ bên ngoài
      trước khi tự gắn header của mình.  ◄── quan trọng nhất
   ② Mạng: dịch vụ nội bộ CHỈ chấp nhận kết nối từ gateway
      (network policy, security group)
   ③ mTLS giữa gateway và dịch vụ — dịch vụ chỉ tin chứng thư của gateway
```

Cùng chỗ đó là **giới hạn tần suất**:

```yaml
rate_limits:
  - key: api_key          # theo khoá
    limit: 1000
    window: 60s
  - key: ip               # theo IP
    limit: 100
    window: 60s
  - key: user_id          # theo người dùng
    limit: 300
    window: 60s
    routes: ["/api/v1/orders/**"]
```

Con bot cào giá sẽ ăn mã **429** ngay tại cửa, **chưa chạm được vào dịch vụ nào**.

### ③ Tấm đệm — chịu đòn thay cho bên trong

```text
   ① THỜI HẠN (timeout)
      Không dịch vụ nào được để gateway chờ quá 5 giây.

   ② CẦU DAO (circuit breaker)
      Dịch vụ gợi ý lỗi 5 lần liên tiếp → gateway NGẮT HẲN cầu giao.
      Trong 30 giây sau đó nó KHÔNG GỌI NỮA, trả luôn dữ liệu mặc định.
      → Một dịch vụ chết KHÔNG kéo cả trang chết theo.

   ③ BỘ NHỚ ĐỆM (cache)
      Danh mục sản phẩm cả ngày không đổi, nhưng mỗi giây nghìn người hỏi.
      Gateway giữ sẵn câu trả lời và bắn ra ngay.
      → Dịch vụ phía sau ngủ yên.

   ④ CHỊU ĐÒN ĐẦU TIÊN
      Đợt tăng tải đột ngột, đợt tấn công — tất cả DỪNG Ở ĐÂY,
      không lan vào trong. Bên trong vẫn chạy như ngày thường.

   ⑤ MỌI CON SỐ ĐỀU ĐO ĐƯỢC Ở MỘT CHỖ
      Bạn không còn phải đoán. Bạn nhìn vào biểu đồ và chỉ đúng chỗ đau.
```

Đây chính là câu trả lời cho **màn hình trắng 9 giây** ở đầu bài: dịch vụ gợi ý chậm 4 giây, nhưng với cầu dao và timeout, gateway sẽ trả về danh sách gợi ý rỗng sau 500 ms — trang vẫn hiện, chỉ thiếu phần gợi ý. Đó là **suy giảm êm** (*graceful degradation*).

## Việc gateway KHÔNG nên làm

Đây là phần phân biệt người đã vận hành với người mới đọc tài liệu.

```text
❌ LOGIC NGHIỆP VỤ
   "Nếu khách VIP thì giảm 10%" — cái này thuộc về dịch vụ,
   không thuộc về gateway. Nhét vào đây là bạn đang xây một
   MONOLITH MỚI ở tầng hạ tầng, và mọi thay đổi nghiệp vụ
   đều phải deploy lại gateway.

❌ BIẾN ĐỔI DỮ LIỆU PHỨC TẠP
   Gộp, lọc, tính toán trên response — việc đó thuộc về BFF.

❌ PHÂN QUYỀN CHI TIẾT
   Gateway kiểm được "token hợp lệ" và "có scope orders:read".
   Nó KHÔNG kiểm được "đơn 1043 có phải của user 88 không"
   — vì nó không biết dữ liệu.
   → PHÂN QUYỀN CẤP BẢN GHI PHẢI Ở TRONG DỊCH VỤ.

   ▲ Đây là hiểu lầm nguy hiểm nhất về gateway:
     tưởng có gateway rồi thì dịch vụ khỏi kiểm quyền.
     Gateway lo XÁC THỰC. Dịch vụ vẫn phải lo PHÂN QUYỀN.
     (xem lại phase-2 bài 1 — lỗi IDOR)

❌ GIỮ TRẠNG THÁI
   Gateway phải không trạng thái để chạy được nhiều bản sao.
   Rate limit counter đẩy sang Redis, không giữ trong bộ nhớ.
```

## Gateway và BFF — hai lớp khác nhau

```text
   API GATEWAY — MỘT cửa cho MỌI client, lo việc HẠ TẦNG
        (xác thực, hạn mức, định tuyến, cầu dao)

   BFF — MỘT tầng cho MỖI LOẠI client, lo việc HÌNH DẠNG DỮ LIỆU
        (gộp nhiều dịch vụ thành đúng cục dữ liệu màn hình cần)


        Web ──┐                    ┌── BFF Web ──┐
              ├─► API Gateway ─────┼── BFF Mobile├──► [order][user][catalog]
       Mobile ┘                    └── BFF TV ───┘

   Vì sao cần BFF riêng?
      Màn hình web hiện 20 trường; màn hình đồng hồ hiện 3 trường.
      Nếu chỉ có gateway, app phải tự gọi 5 dịch vụ rồi tự gộp
      → waterfall trên mạng di động (xem phase-1 bài 4).
      BFF gọi 5 dịch vụ trong MẠNG NỘI BỘ (RTT 1ms thay vì 100ms)
      rồi trả về đúng một cục.
```

**Dự án nhỏ thì gộp làm một** — gateway kiêm luôn việc tổng hợp. Tách ra khi các loại client bắt đầu cần dữ liệu khác hẳn nhau.

## Điểm chết duy nhất — và cách sống chung

```text
   Mọi thứ đi qua nó. Nó ngã thì cả hệ thống ngã theo,
   dù 12 dịch vụ bên trong vẫn khoẻ.

   Nên KHÔNG AI CHẠY MỘT BẢN:
   ① Nhiều bản sao giống hệt nhau
   ② KHÔNG giữ trạng thái trong bộ nhớ (rate limit → Redis)
   ③ Có load balancer đứng trước
   ④ Một bản chết thì cái khác đỡ, và không ai nhận ra
```

Và ba rủi ro nữa ít người nói:

```text
✗ NÚT THẮT HIỆU NĂNG
   Mọi request đều giải mã TLS + kiểm token tại đây.
   → Cache kết quả kiểm token vài giây; dùng thuật toán ký nhẹ.

✗ ĐỘ TRỄ CỘNG THÊM
   Thêm một chặng là thêm 1–5 ms. Với API độ trễ cực thấp,
   con số đó có thể đáng kể.

✗ NÚT THẮT TỔ CHỨC
   Mọi team muốn thêm route đều phải qua team hạ tầng.
   → Giải bằng cấu hình khai báo trong repo của từng team
     (Kubernetes Ingress/Gateway API), không phải mở ticket.
```

## Các lựa chọn công cụ

| Công cụ | Nền | Phù hợp |
|---|---|---|
| **Nginx / OpenResty** | C + Lua | Nhẹ, nhanh, cấu hình thủ công |
| **Kong** | Nginx + Lua | Nhiều plugin sẵn, có bản quản trị |
| **Envoy** | C++ | Nền của service mesh, cấu hình động, quan sát tốt nhất |
| **Traefik** | Go | Tự phát hiện dịch vụ, hợp với Docker/K8s |
| **AWS API Gateway** | Được quản lý | Không phải vận hành, trả tiền theo request |
| **Spring Cloud Gateway** | Java | Hệ sinh thái Java |
| **APISIX** | Nginx + Lua | Mã nguồn mở, hiệu năng cao |

## Gateway và Service Mesh — bổ sung, không thay thế

```text
   NORTH-SOUTH (bắc–nam): từ NGOÀI vào TRONG
        Internet → API Gateway → dịch vụ
        Lo: xác thực người dùng, hạn mức theo khách, TLS công khai

   EAST-WEST (đông–tây): GIỮA các dịch vụ bên trong
        order-service ↔ payment-service ↔ inventory-service
        Lo: mTLS tự động, retry, cầu dao, trace, chia lưu lượng
        → Đây là việc của SERVICE MESH (Istio, Linkerd)

   Hai lớp GIẢI HAI BÀI TOÁN KHÁC NHAU.
   Hệ thống lớn thường có cả hai.
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Sau khi dựng gateway, độ trễ p99 tăng từ 80 ms lên 250 ms. Team đòi bỏ gateway.

**Chẩn đoán trước khi kết luận** — đo xem thời gian đi đâu:

```text
   Phân tích:
      TLS handshake tại gateway          40 ms   ← kết nối mới mỗi lần
      Kiểm token (gọi auth-service)      90 ms   ← THỦ PHẠM CHÍNH
      Định tuyến + chuyển tiếp            3 ms
      Dịch vụ xử lý                      80 ms
      ─────────────────────────────────────────
      Tổng                              213 ms
```

**Ba cách chữa, không cần bỏ gateway:**

```text
① KIỂM TOKEN CỤC BỘ, đừng gọi auth-service mỗi request
   → Gateway tải khoá công khai (JWKS) và tự xác minh chữ ký.
   → 90 ms còn ~0,5 ms.

② CACHE KẾT QUẢ XÁC THỰC vài giây
   → cache theo hash của token, TTL 30–60 giây.

③ GIỮ KẾT NỐI (keep-alive) tới dịch vụ phía sau
   → không bắt tay TLS lại mỗi request; dùng HTTP/2 ghép kênh.
   → 40 ms còn gần 0.
```

Sau khi sửa: 213 ms → khoảng 85 ms. **Gateway chỉ cộng thêm ~5 ms** — đúng như nó nên là.

> **Tình huống 2:** Một đối tác gọi API 50.000 lần/phút và làm chậm mọi người khác, dù đã có rate limit 1.000/phút.

**Nguyên nhân:** rate limit đang giữ **trong bộ nhớ từng bản gateway**. Có 10 bản gateway → đối tác thực tế được gọi 10.000/phút. Và giữa các cửa sổ, họ dồn hết vào đầu phút.

```python
# ✅ Rate limit dùng chung + thuật toán cửa sổ trượt (sliding window)
import redis, time
r = redis.Redis()

def cho_phep(khoa: str, gioi_han: int, cua_so: int = 60) -> bool:
    now = time.time()
    p = r.pipeline()
    key = f"rl:{khoa}"
    p.zremrangebyscore(key, 0, now - cua_so)   # bỏ dấu vết cũ
    p.zcard(key)                                # đếm trong cửa sổ
    p.zadd(key, {f"{now}:{os.urandom(4).hex()}": now})
    p.expire(key, cua_so)
    _, so_luot, _, _ = p.execute()
    return so_luot < gioi_han
```

Và thêm hai lớp nữa:

```text
② HÀNG ĐỢI CÔNG BẰNG: mỗi đối tác một hàng đợi riêng,
   một người quá tay không ăn hết tài nguyên của người khác
   (bulkhead pattern — chia khoang như tàu thuỷ).

③ TRẢ HEADER CHO ĐỐI TÁC BIẾT ĐƯỜNG:
   X-RateLimit-Limit: 1000
   X-RateLimit-Remaining: 3
   X-RateLimit-Reset: 1754035200
   Retry-After: 42
   → Đối tác tử tế sẽ tự điều tiết. Không có header thì họ chỉ biết thử lại mù.
```

> **Tình huống 3:** Gateway kiểm token rồi, nhưng vẫn phát hiện lỗi người dùng xem được đơn hàng của người khác.

**Đây là hiểu lầm nguy hiểm nhất về gateway.**

```text
   Gateway trả lời được: "token này hợp lệ, đây là user 88,
                          và họ có scope orders:read"
   Gateway KHÔNG trả lời được: "đơn 1043 có phải của user 88 không?"
                          → vì nó KHÔNG BIẾT DỮ LIỆU.

   ✅ Gateway lo XÁC THỰC (authentication).
      Dịch vụ vẫn PHẢI lo PHÂN QUYỀN CẤP BẢN GHI (authorization).
```

```python
# Trong order-service — vẫn phải kiểm, dù gateway đã xác thực
@app.get("/orders/{order_id}")
def xem_don(order_id: int, x_user_id: int = Header(...)):
    don = db.query(
        "SELECT * FROM orders WHERE order_id=%s AND customer_id=%s",
        order_id, x_user_id)            # ◄── quyền sở hữu trong WHERE
    if not don:
        raise HTTPException(404)
    return don
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chạy một bản gateway | **Điểm chết duy nhất** | Nhiều bản + LB đứng trước |
| Giữ rate limit trong bộ nhớ | ×N bản = hạn mức sai N lần | Redis dùng chung |
| Không xoá header `X-*` từ ngoài | Kẻ tấn công tự đặt `X-User-Id` | Xoá sạch rồi mới tự gắn |
| Dịch vụ nội bộ mở ra internet | Đi vòng qua gateway | Network policy + mTLS |
| Tưởng gateway lo hết phân quyền | **IDOR vẫn xảy ra** | Dịch vụ vẫn kiểm quyền sở hữu |
| Nhét logic nghiệp vụ vào gateway | Monolith mới ở tầng hạ tầng | Chỉ để việc hạ tầng |
| Gọi auth-service mỗi request | +90 ms mỗi request | Kiểm chữ ký cục bộ bằng JWKS |
| Không giữ kết nối tới backend | Bắt tay TLS mỗi lần | Keep-alive + HTTP/2 |
| Không trả header rate limit | Đối tác thử lại mù, làm tệ hơn | `X-RateLimit-*` + `Retry-After` |
| Không có cầu dao | Một dịch vụ chậm kéo cả trang chết | Circuit breaker + suy giảm êm |
| Timeout gateway > timeout client | Client bỏ đi mà gateway vẫn chờ | Timeout nhỏ dần theo chiều sâu |
| Mọi route phải qua team hạ tầng | Nút thắt tổ chức | Cấu hình khai báo trong repo từng team |

## Câu hỏi phỏng vấn hay gặp

**H: API Gateway là gì, khác load balancer thế nào?**
Load balancer chia tải giữa các **bản sao giống hệt nhau** và không quan tâm nội dung request. API Gateway **đọc từng đường dẫn, biết ai đang gọi, và quyết định request được đi tiếp hay bị chặn** — nó là một reverse proxy có trí tuệ đứng trước cả cụm dịch vụ. Nó làm ba việc: **định tuyến**, **chốt chặn** (xác thực + hạn mức), và **tấm đệm** (timeout, cầu dao, cache).

**H: Gateway giải quyết vấn đề gì?**
Hai vấn đề. **Client phải biết 12 địa chỉ** → giờ chỉ biết một tên miền, dịch vụ đổi máy chủ cũng không phải sửa gì. Và **12 chỗ cài đặt xác thực = 12 chỗ có thể sai** → giờ còn một chỗ, và không request nào chưa được kiểm mà vào tới bên trong. Cộng thêm: một dịch vụ chậm không kéo cả trang chết nhờ cầu dao, và mọi con số đo được ở một chỗ.

**H: Có gateway rồi thì dịch vụ khỏi kiểm quyền phải không?**
Không — đây là hiểu lầm nguy hiểm nhất. Gateway trả lời được *"token hợp lệ, đây là user 88, có scope orders:read"*, nhưng **không** trả lời được *"đơn 1043 có phải của user 88 không"* vì nó không biết dữ liệu. **Gateway lo xác thực, dịch vụ vẫn phải lo phân quyền cấp bản ghi** — nếu không thì IDOR vẫn xảy ra như thường.

**H: Làm sao chặn kẻ tấn công gọi thẳng vào dịch vụ nội bộ và tự đặt header `X-User-Id`?**
Ba lớp. Quan trọng nhất là **gateway phải xoá sạch mọi header `X-*` đến từ bên ngoài** trước khi tự gắn header của mình. Thứ hai là **mạng**: dịch vụ nội bộ chỉ chấp nhận kết nối từ gateway, bằng network policy hoặc security group. Thứ ba là **mTLS** giữa gateway và dịch vụ, để dịch vụ chỉ tin chứng thư của gateway.

**H: Gateway làm tăng độ trễ, xử lý sao?**
Đo trước đã. Thủ phạm phổ biến nhất không phải bản thân gateway mà là **gọi auth-service để kiểm token mỗi request** — cái đó cộng cả trăm mili giây. Chữa bằng cách để gateway **tự kiểm chữ ký cục bộ** bằng khoá công khai tải từ JWKS, cộng cache kết quả vài chục giây, cộng **giữ kết nối keep-alive** tới dịch vụ phía sau để không bắt tay TLS lại. Sau đó gateway chỉ còn cộng khoảng 5 ms — đúng như nó nên là.

**H: Gateway và service mesh khác gì?**
Chúng giải hai bài toán khác nhau và thường có cả hai. Gateway lo lưu lượng **từ ngoài vào trong** (north-south): xác thực người dùng, hạn mức theo khách, TLS công khai. Service mesh lo lưu lượng **giữa các dịch vụ bên trong** (east-west): mTLS tự động giữa mọi pod, retry, cầu dao, tracing, chia lưu lượng cho canary.

## Tóm tắt bài 2

- Gateway **không phải load balancer**: LB chia tải giữa bản sao giống nhau, gateway **đọc nội dung và quyết định** cho đi tiếp hay chặn.
- Ba việc: **định tuyến** (client chỉ biết một tên miền), **chốt chặn** (12 chỗ xác thực còn 1), **tấm đệm** (timeout, cầu dao, cache, chịu đòn đầu tiên).
- Bẫy chết người: **phải xoá sạch header `X-*` từ ngoài** trước khi tự gắn, cộng network policy và mTLS.
- **Gateway lo xác thực, dịch vụ vẫn phải lo phân quyền cấp bản ghi** — có gateway không có nghĩa là hết IDOR.
- Không nhét vào gateway: **logic nghiệp vụ**, biến đổi dữ liệu phức tạp, phân quyền chi tiết, và **trạng thái** (rate limit phải ở Redis).
- **BFF là lớp khác**: gateway một cửa cho mọi client lo hạ tầng; BFF một tầng cho mỗi loại client lo hình dạng dữ liệu.
- Gateway là **điểm chết duy nhất** → nhiều bản, không trạng thái, có LB đứng trước; và cẩn thận ba rủi ro: nút thắt hiệu năng, độ trễ cộng thêm, **nút thắt tổ chức**.

**Bài kế tiếp** → [Bài 3: Caching — tầng nhanh nhất và nguy hiểm nhất](03-caching-tang-nhanh-nhat-va-nguy-hiem-nhat.md)
