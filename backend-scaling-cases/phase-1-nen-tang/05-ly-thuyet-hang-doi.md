# Bài 5: Lý thuyết hàng đợi — vì sao 80% tải làm latency gấp đôi, 95% làm gấp 20 lần

Có một câu hỏi khiến gần như mọi người mới trả lời sai:

> Server của bạn xử lý được tối đa 1000 RPS. Hiện tại đang chạy 500 RPS, latency 100 ms.
> Nếu tải tăng lên 900 RPS, latency sẽ là bao nhiêu?

Câu trả lời trực giác: "vẫn 100 ms, vì chưa chạm trần 1000". 

Câu trả lời đúng: **khoảng 1000 ms — chậm gấp 10 lần**.

Bài này giải thích vì sao, bằng toán đủ đơn giản để làm nhẩm, và rút ra vài quy tắc vận hành cực kỳ thực dụng.

## Trực giác trước: đường một làn xe

Một con đường một làn, xe chạy 60 km/h.

- Đường vắng (10% công suất): bạn chạy 60 km/h, không phải phanh lần nào.
- Đường 50% công suất: thỉnh thoảng phải giảm tốc, trung bình 55 km/h.
- Đường 90% công suất: liên tục phanh-ga, trung bình 25 km/h.
- Đường 100% công suất: **kẹt cứng**, 5 km/h.

Điều lạ: ở 90% công suất, đường vẫn "chưa đầy" — vẫn còn 10% chỗ trống. Nhưng tốc độ đã giảm hơn một nửa. Vì sao?

Vì xe **không tới đều đặn**. Chúng tới thành cụm. Khi đường còn trống nhiều, cụm xe tan nhanh. Khi đường gần đầy, cụm xe không kịp tan trước khi cụm tiếp theo tới → **hàng đợi tích luỹ**.

Server hoạt động y hệt.

## Công thức M/M/1

Mô hình đơn giản nhất trong lý thuyết hàng đợi: một quầy phục vụ, khách tới ngẫu nhiên. Ký hiệu **M/M/1** (M = Markov/ngẫu nhiên, 1 = một quầy).

```text
              Service time (thời gian phục vụ thuần)
   Response = ──────────────────────────────────────
                        1 − ρ (rho)

   ρ = utilization = tải hiện tại / công suất tối đa
```

Áp vào câu hỏi mở đầu: công suất 1000 RPS nghĩa là service time = 1/1000 giây... nhưng để dễ hình dung, ta dùng latency lúc rảnh làm chuẩn. Giả sử service time thuần = 100 ms:

| Utilization (ρ) | Hệ số nhân `1/(1−ρ)` | Latency thực tế |
|---|---|---|
| 10% | 1,11 | 111 ms |
| 50% | 2,0 | 200 ms |
| 70% | 3,3 | 333 ms |
| 80% | 5,0 | **500 ms** |
| 90% | 10,0 | **1.000 ms** |
| 95% | 20,0 | **2.000 ms** |
| 99% | 100,0 | **10.000 ms** |
| 100% | ∞ | **vô hạn — hàng đợi phình mãi** |

Vẽ ra thành hình:

```text
 Latency
   10x │                                                    ╱│
       │                                                  ╱  │
    5x │                                            ╱────    │
       │                                     ╱───           │
    3x │                              ╱────                 │
    2x │                    ╱─────                          │
    1x │──────────────                                      │
       └────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬──→ ρ
           10%  20%  30%  40%  50%  60%  70%  80%  90% 100%

                              ↑ vùng an toàn ↑  ↑ vùng nguy hiểm ↑
```

**Quy tắc rút ra**: vận hành ở **60-70% utilization**. Trên 80% là bạn đang đánh cược. Trên 90% thì mỗi biến động nhỏ đều thành sự cố.

Đây là lý do các đội SRE đặt ngưỡng autoscale ở 60-70% CPU chứ không phải 90% — nghe có vẻ "lãng phí 30% máy", nhưng 30% đó chính là thứ mua cho bạn latency ổn định.

## Công thức Kingman — biến động quan trọng ngang mức tải

M/M/1 giả định mọi thứ ngẫu nhiên "chuẩn". Thực tế, mức độ **biến động** của traffic và của thời gian xử lý ảnh hưởng rất mạnh. Công thức Kingman (xấp xỉ, dùng cho hàng đợi tổng quát):

```text
                     ρ         c²ₐ + c²ₛ
   Thời gian chờ ≈ ─────  ×  ───────────  ×  service time
                    1 − ρ          2

   c²ₐ = độ biến động của thời điểm request tới
   c²ₛ = độ biến động của thời gian xử lý
```

Ý nghĩa thực dụng, dịch sang tiếng người:

> Bạn có **ba** cách giảm thời gian chờ, không phải một:
> 1. Giảm ρ (thêm máy, giảm tải) — cách ai cũng nghĩ tới.
> 2. Giảm biến động của **đầu vào** — làm phẳng traffic.
> 3. Giảm biến động của **thời gian xử lý** — làm cho mọi request đều đều nhau.

Cách 2 và 3 gần như miễn phí và bị bỏ quên hoàn toàn. Ví dụ cụ thể:

| Nguồn biến động | Cách làm phẳng |
|---|---|
| Cron job chạy đúng phút 0 mỗi giờ ở 500 client | Thêm **jitter** — ngẫu nhiên hoá thời điểm chạy trong khoảng 0-5 phút |
| Retry đồng loạt sau sự cố | **Exponential backoff + jitter** (phase-4 bài 1) |
| Một endpoint xử lý 5 ms, một endpoint 5 giây, chung pool | **Bulkhead** — tách pool riêng (phase-2 bài 5) |
| Query lúc nhanh lúc chậm do thiếu index | Thêm index → thời gian xử lý ổn định |
| GC pause 2 giây thỉnh thoảng | Đổi thuật toán GC, giảm rác (phase-6 bài 1) |

**Việc tách endpoint nhanh/chậm ra hai pool không hề làm hệ thống tính toán nhanh hơn một chút nào — nhưng làm latency giảm mạnh**, chỉ nhờ giảm `c²ₛ`. Đây là một trong những "bữa trưa miễn phí" hiếm hoi của ngành.

## Vì sao thêm máy đôi khi làm chậm hơn: Universal Scalability Law

Trực giác: gấp đôi số server thì gấp đôi công suất. Thực tế hiếm khi vậy.

**Định luật Amdahl** nói: nếu p là phần việc song song hoá được, tốc độ tối đa khi có N máy là `1 / ((1−p) + p/N)`. Với p = 95%, dù có vô hạn máy bạn cũng chỉ nhanh được **20 lần**.

**Universal Scalability Law (USL)** của Neil Gunther bổ sung một yếu tố nữa mà Amdahl bỏ qua:

```text
                        N
   C(N) = ───────────────────────────────
           1 + α(N−1) + βN(N−1)

   N = số máy (hoặc số thread)
   α (alpha) = contention  — tranh chấp tài nguyên dùng chung (lock, DB)
   β (beta)  = coherency   — chi phí đồng bộ dữ liệu giữa các máy
```

Điểm khác biệt sống còn: số hạng `βN(N−1)` tăng theo **bình phương** N. Nghĩa là:

```text
   Công suất
      │           ╱─╲
      │        ╱      ╲___          ← ĐI XUỐNG!
      │      ╱             ╲___
      │    ╱                     ╲___
      │  ╱
      │╱
      └────────────────────────────────→ Số máy / số thread
          ↑ điểm tối ưu
```

**Có một điểm mà thêm máy làm hệ thống CHẬM ĐI.** Không phải "hết hiệu quả" — mà là tệ hơn thật sự.

Ví dụ dễ hiểu: 30 người cùng sửa một tài liệu. Đến một ngưỡng, thời gian họp để thống nhất với nhau nhiều hơn thời gian làm việc.

Ví dụ trong hệ thống của bạn:
- α (contention): 100 instance app cùng ghi vào một dòng `inventory` → chờ lock. Đây là phase-3.
- β (coherency): mỗi node cache phải thông báo cho mọi node khác khi dữ liệu đổi → `N(N−1)` lượt thông báo.

**Hệ quả thực tiễn quan trọng nhất**: nếu bạn thêm instance mà throughput không tăng tương ứng, **đừng thêm nữa**. Hãy đi tìm α và β — thường là một cái lock chung, một bảng chung, hoặc một service chung mà mọi instance đều gọi.

## Hàng đợi có giới hạn — vì sao "chờ mãi" tệ hơn "bị từ chối"

Trong mọi công thức trên, hàng đợi được giả định là vô hạn. Trong thực tế hàng đợi vô hạn là **thảm hoạ**:

```text
   Hàng đợi VÔ HẠN, tải vượt công suất trong 60 giây:

   t=0s   : hàng đợi 0
   t=60s  : hàng đợi 30.000 request, client đầu tiên đã chờ 60 giây
   t=61s  : tải trở lại bình thường
   t=61s+ : server VẪN đang xử lý 30.000 request cũ
            — mà tất cả đều đã timeout ở phía client từ lâu!

   ⇒ Server làm việc cật lực để trả kết quả cho những người đã bỏ đi.
   ⇒ Trong lúc đó, người dùng MỚI lại phải xếp sau 30.000 người đã chết.
   ⇒ Hệ thống không bao giờ hồi phục dù tải đã bình thường.
```

Hiện tượng này có tên: **metastable failure** (hỏng ở trạng thái giả ổn định) — hệ thống mắc kẹt ở trạng thái hỏng ngay cả khi nguyên nhân ban đầu đã biến mất. Phase-4 dành hẳn một bài cho nó.

Giải pháp là **hàng đợi có giới hạn (bounded queue)** kèm hai kỹ thuật:

1. **Load shedding** (xả tải): hàng đầy → trả `503 Service Unavailable` ngay lập tức. Từ chối nhanh tốt hơn chờ vô ích.
2. **Deadline propagation** (truyền hạn chót): mỗi request mang theo "tôi chỉ còn giá trị đến thời điểm T". Trước khi bắt đầu xử lý, kiểm tra — nếu đã quá hạn thì bỏ, đừng phí công.

```java
// Deadline propagation đơn giản mà cực kỳ hiệu quả
public Response handle(Request req) {
    long queuedAt = req.getQueuedAtMillis();
    if (System.currentTimeMillis() - queuedAt > 2000) {
        // Client đã timeout từ lâu. Làm tiếp là lãng phí.
        throw new RequestExpiredException();
    }
    return process(req);
}
```

Chỉ đoạn kiểm tra 3 dòng này thôi cũng đủ giúp hệ thống thoát khỏi metastable failure trong rất nhiều tình huống — vì nó dọn sạch hàng đợi rác với chi phí gần bằng 0.

Đây cũng là lý do **LIFO (vào sau ra trước) đôi khi tốt hơn FIFO** khi quá tải: với FIFO, mọi người đều chờ lâu và mọi người đều timeout. Với LIFO, người mới tới được phục vụ ngay (nhanh), chỉ những người cũ chịu thiệt — tổng số người được phục vụ thành công **cao hơn hẳn**. Nghe phản trực giác nhưng đúng, và một số hệ thống thực sự dùng.

## Tổng hợp: bốn quy tắc vận hành rút ra từ toán

| Quy tắc | Xuất phát từ | Áp dụng thế nào |
|---|---|---|
| Giữ utilization ≤ 70% | M/M/1 | Autoscale ở 60-70%, không phải 90% |
| Giảm biến động cũng tốt như giảm tải | Kingman | Jitter cho cron/retry, bulkhead tách endpoint |
| Thêm máy có điểm dừng | USL | Đo throughput/instance; ngừng khi không tăng |
| Hàng đợi phải có trần | metastable failure | Bounded queue + load shedding + deadline |

## Case thực tế: hệ thống "chỉ chạy 60% CPU mà vẫn chậm"

Một API gateway, dashboard hiển thị CPU trung bình 60%, RAM 50%, nhưng p99 = 4 giây. Đội vận hành thêm gấp đôi số pod. Không cải thiện gì.

Chẩn đoán theo bài này:

**Bước 1 — "60% CPU" là trung bình của cái gì?**

```text
   CPU theo từng giây trong 1 phút:
   20% 15% 18% 100% 100% 100% 22% 19% 100% 100% 17% ...

   Trung bình = 60%.  Nhưng thực tế: 40% thời gian ở mức 100%!
```

Trung bình 1 phút che mất các đợt bão 3-5 giây. Trong những đợt đó ρ = 100% và hàng đợi phình lên rất nhanh. Bài học: **luôn xem CPU ở độ phân giải nhỏ (10-15 giây), và xem cả max chứ không chỉ average** — đúng như bài 3 đã cảnh báo về trung bình.

**Bước 2 — vì sao có bão?**

Truy ra: 200 client đều gọi API đồng bộ dữ liệu vào **đúng phút thứ 0** của mỗi giờ. Đây là `c²ₐ` — biến động đầu vào — cực cao.

**Bước 3 — vì sao thêm pod không giúp?**

Vì tất cả pod đều gọi chung một PostgreSQL, và bảng đó đang bị tranh chấp lock. Đây là α trong USL. Thêm pod chỉ làm tăng số bên tranh nhau cùng một cái lock — đúng nhánh đi xuống của đường cong USL.

**Bước 4 — giải pháp, theo thứ tự hiệu quả**

| Việc làm | Nguyên lý | Kết quả đo được |
|---|---|---|
| Thêm jitter 0-300 giây cho client đồng bộ | giảm `c²ₐ` (Kingman) | đỉnh CPU 100% → 65%, p99 4s → 900 ms |
| Bounded queue + trả 503 khi đầy | chống metastable | không còn "chậm kéo dài sau đỉnh" |
| Thêm index, bỏ lock nóng | giảm α (USL) | thêm pod bắt đầu có tác dụng trở lại |
| Giảm số pod từ 20 về 12 | đang ở nhánh đi xuống của USL | throughput **tăng** 15% |

Bước cuối cùng là điều làm mọi người ngạc nhiên nhất: **bớt máy đi thì nhanh hơn**. Đó chính là USL trong đời thực.

## Bẫy thường gặp

| Bẫy | Thực tế |
|---|---|
| "CPU 60% nghĩa là còn dư 40% công suất" | Utilization trung bình che giấu các đợt 100%. Xem độ phân giải nhỏ |
| "Chưa chạm trần thì latency không đổi" | Latency tăng theo `1/(1−ρ)` ngay từ đầu, tăng dốc từ 70% |
| "Cứ thêm máy là nhanh hơn" | USL: có điểm mà thêm máy làm chậm đi |
| "Hàng đợi dài thì tốt, đỡ mất request" | Hàng đợi dài = mọi người đều timeout = metastable failure |
| "Traffic đều nên không cần lo biến động" | Cron, retry, client đồng loạt luôn tạo cụm |
| Chỉ nhìn throughput trung bình khi benchmark | Phải nhìn cả latency ở từng mức tải để tìm "đầu gối" |

## Khi nào KHÔNG cần đến bài này

Nếu hệ thống của bạn chạy ổn định dưới 30% utilization và không có đỉnh, toàn bộ toán ở trên chỉ là kiến thức nền — đừng vội tối ưu. Lý thuyết hàng đợi trở nên quan trọng khi:

- Có sự kiện tải cao định kỳ (sale, tựu trường, cuối tháng).
- Bạn phải cam kết SLO chặt về p99.
- Chi phí hạ tầng lớn và bạn muốn chạy sát hơn mà vẫn an toàn.

Và một cảnh báo: các công thức này là **mô hình xấp xỉ**, không phải quy luật vật lý. Chúng dùng để **định hướng suy nghĩ** và ước lượng bậc độ lớn, không dùng để tính chính xác đến từng mili-giây. Số liệu đo thật luôn thắng công thức.

## Tóm tắt bài 5

- `Latency = service_time / (1 − ρ)`. Ở 90% tải, latency gấp **10 lần** lúc rảnh.
- Vận hành ở **60-70% utilization**. Phần "lãng phí" chính là thứ mua latency ổn định.
- Công thức Kingman: **giảm biến động cũng hiệu quả như giảm tải** — jitter, bulkhead, index đều là công cụ giảm biến động.
- **USL**: thêm máy có điểm dừng, vượt qua thì chậm đi. Thủ phạm là contention (α) và coherency (β).
- Hàng đợi vô hạn dẫn tới **metastable failure** — hệ thống không hồi phục dù tải đã bình thường.
- Cứu cánh: **bounded queue + load shedding + deadline propagation**.

**Bài kế tiếp** → [Bài 6: Đo và chẩn đoán — thread dump, metric, và cách bắt quả tang nút thắt](06-do-va-chan-doan.md)
