# Case 1: Tỷ lệ dùng lại — 1.000 người làm sập hệ thống, 2.100.000 người thì không

Hai màn hình, cùng một tối.

**Bên trái:** trang nội bộ của một công ty. **1.000 nhân viên** mở cùng lúc sáng thứ Hai. Vòng quay tải cứ quay hoài rồi lỗi hết giờ chờ.

**Bên phải:** một phiên livestream **2.100.000 người xem cùng lúc**. Bình luận chạy như thác, quà tặng kín màn hình, bảng xếp hạng nhảy số không ngừng. **Không giật một khung nào.**

Gấp **2.100 lần** số người. Một bên chết, một bên mượt.

Câu trả lời phản xạ là *"họ có nhiều máy chủ hơn"*. Đúng — nhưng **không ai nhiều hơn gấp 2.100 lần. Không ai cả.**

Câu trả lời thật không nằm ở số máy chủ. Nó nằm ở **một phép đếm mà gần như không ai làm**. Đếm sai chỗ này thì thêm bao nhiêu máy cũng vô ích.

---

## Phần 1 — Máy chủ không nhìn thấy người

Nó chỉ thấy **lượt hỏi**. Chỉ vậy thôi.

Và thứ quyết định nó sống hay chết **không phải số lượt hỏi**, mà là: **trong đống đó có bao nhiêu câu hỏi KHÁC NHAU.**

```text
Lớp học 1.000 học sinh.

Trường hợp A — mỗi em hỏi một câu riêng, không em nào giống em nào:
    thầy phải nghĩ đúng 1.000 lần.        →  1.000 lần SUY NGHĨ

Trường hợp B — cả 1.000 em cùng hỏi đúng một câu:
    thầy nghĩ một lần, viết ra một tờ,
    rồi đem đi photo 1.000 bản.           →  1 lần SUY NGHĨ + 1.000 lần CHÉP

Vẫn 1.000 em. Khối lượng khác hẳn nhau.
```

Gọi con số đó là **tỷ lệ dùng lại** (*reuse ratio*): **một câu trả lời phục vụ được bao nhiêu người.**

```text
                  tổng số lượt hỏi
  tỷ lệ dùng lại = ─────────────────────────
                  số câu hỏi KHÁC NHAU

  Trang nội bộ  :  1.000 / 1.000     =        1
  Phiên live    :  2.100.000 / 1     = 2.100.000
```

Cùng một tờ giấy: bên trái phục vụ được **1 người**, bên phải **2,1 triệu người**.

---

## Phần 2 — Bắt đầu từ phía đau: vì sao 1.000 người làm sập

1.000 nhân viên mở trang nội bộ. Mỗi người nhìn thấy **một màn hình khác nhau**: đơn của tôi, giỏ của tôi, lương của tôi, task của tôi.

**1.000 màn hình khác nhau. Không câu trả lời nào dùng lại được cho người ngồi bên cạnh.**

Nên mỗi lần mở trang là một lần máy phải xuống tận kho dữ liệu, tìm, ghép, rồi tính lại **từ đầu**. Từ đầu, mỗi lần.

```text
Trang "Dashboard của tôi" — mỗi lần mở:

  SELECT ... FROM don_hang    WHERE nhan_vien_id = ?   -- 4 ms
  SELECT ... FROM cong_viec   WHERE nguoi_nhan  = ?    -- 6 ms
  SELECT ... FROM thong_bao   WHERE user_id     = ?    -- 3 ms
  SELECT count(*) FROM ...    WHERE ...                -- 18 ms  (không index)
  SELECT ... 8 truy vấn nữa cho các widget              -- 40 ms
  ──────────────────────────────────────────────────────────────
  ~13 lượt truy vấn, ~70 ms xử lý  — CHO MỘT NGƯỜI
```

Bây giờ nhân lên. Sáng thứ Hai, 1.000 người mở trong khoảng 3 phút, mỗi người bấm vài nhát:

```text
  1.000 người × 13 truy vấn × 3 lần bấm  =  39.000 lượt truy vấn
  dồn trong ~180 giây                    ≈  217 lượt/giây trung bình
  nhưng đỉnh dồn vào 30 giây đầu         ≈  1.300 lượt/giây
```

Và đây là chỗ nó gãy:

```text
  Sức chứa thật của database (tra một dòng qua index):

    HDD, dữ liệu không nằm RAM   :    200 –   2.000 lượt/giây
    SSD/NVMe, không nằm RAM      : 10.000 –  50.000 lượt/giây
    Dữ liệu nằm gọn trong RAM    : 50.000 – 200.000 lượt/giây

  NHƯNG truy vấn ở trên không phải "tra một dòng". Có cái quét bảng,
  có cái GROUP BY, có cái join ba bảng.
  Sức chứa thật cho loại đó: vài trăm tới vài nghìn lượt/giây.
```

Vượt sức chứa thì **bắt đầu xếp hàng**, và hàng **không ngắn lại**:

```text
  xếp hàng  →  mỗi lượt chờ lâu thêm một chút
  chờ lâu   →  người ta bấm lại  (hoặc client tự retry)
  bấm lại   →  hàng dài thêm
  ─────────────────────────────────────────── vòng lặp không tự thoát
```

Đó là toàn bộ câu chuyện lag của 1.000 người. Và nó là hình dạng kinh điển của **hỏng siêu bền** — xem [phase-4 case 7](../phase-4-cascading-failure/07-case-metastable-failure.md): hệ thống không quay lại bình thường kể cả khi tải đã giảm, vì chính việc chờ đã sinh ra thêm tải.

> **Ghi chú về con số.** Nhiều tài liệu vẫn trích *"database làm được khoảng 2.000 lượt tìm mỗi giây"*. Con số đó là của **thời đĩa quay**. Trên NVMe hôm nay, tra một dòng qua index đạt hàng chục nghìn lượt/giây. **Luận điểm không đổi** — 1.000 câu hỏi khác nhau vẫn đắt hơn 2,1 triệu câu hỏi giống nhau — chỉ là ngưỡng gãy nằm cao hơn nhiều so với con số cũ.

---

## Phần 3 — Nhìn sang phiên live: 2,1 triệu người xin cùng một thứ

Tất cả cùng xin đúng một thứ: **mẩu hình mới nhất của giây đó**. Cùng một cái tên tệp, cùng một đống byte.

**Máy chủ không phải nghĩ gì cả. Nó chỉ phải chép.**

```text
  Tính một câu hỏi mới      :  vài mili giây          (10⁻³ s)
  Chép một tệp nằm sẵn RAM  :  vài phần triệu giây    (10⁻⁶ s)
  ────────────────────────────────────────────────────────────
  Chênh nhau khoảng 1.000 lần.
```

> Nên **câu phải hỏi đầu tiên không phải "Bao nhiêu người?"**, mà là **"Bao nhiêu câu hỏi khác nhau?"**. Hỏi khác nhau thì phải **tính**; hỏi giống nhau thì chỉ phải **chép**.

### Nhưng "chép" không nhẹ như nghe

```text
  Mỗi mẩu hình      :  ~1,5 MB
  × 2.100.000 người :  3.150.000 MB  =  ~3.150 GB  =  ~3,1 TB
  Tất cả phải xong trong 4 giây.

  Quy ra băng thông:  3.150 GB × 8 = 25.200 Gbit  /  4 giây
                    =  6.300 Gbps  =  6,3 Tbps
```

Một máy chủ mạnh có đường ra chừng **25 Gbps**:

```text
  6.300 / 25 = 252 máy   ← chỉ để BƠM BYTE RA NGOÀI, chưa tính gì khác
```

Nên **không ai xếp máy nằm phẳng một hàng**. Người ta xếp thành **cây**.

---

## Phần 4 — Cái cây phát tán, và cái kẽ hở mở ra 4 giây một lần

```text
                    ┌──────────┐
                    │   GỐC    │  gửi đi vài chục bản
                    └────┬─────┘
          ┌──────────────┼──────────────┐
     ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
     │ vùng 1  │    │ vùng 2  │    │ vùng 3  │   mỗi trạm chép cho vài chục biên
     └────┬────┘    └─────────┘    └─────────┘
   ┌──────┼──────┬──────────┐
 ┌─▼──┐ ┌─▼──┐ ┌─▼──┐   ┌──▼─┐
 │biên│ │biên│ │biên│   │biên│   mỗi máy biên lo cho vài nghìn người quanh đó
 └────┘ └────┘ └────┘   └────┘

  Không tầng nào phải gánh cả 2.100.000.
  Cái cây KHÔNG làm cho số byte ít đi — nó làm cho KHÔNG AI PHẢI GÁNH MỘT MÌNH.
```

Nhưng cái cây này có **một kẽ hở, và nó mở ra đúng 4 giây một lần**.

Lúc mẩu mới vừa ra đời, **chưa máy biên nào có nó**. 2.100.000 lượt hỏi cùng trượt cache, cùng dồn ngược lên gốc, **trong cùng một giây**.

```text
  t = 0,00 s   mẩu seg-1042.ts ra đời ở gốc
  t = 0,01 s   50.000 người ở Hà Nội cùng hỏi máy biên Hà Nội
  t = 0,01 s   máy biên: MISS × 50.000
               → nếu nó chuyển tiếp cả 50.000 lượt lên trên
               → tầng vùng nhận 50.000 × số máy biên
               → gốc nhận hàng triệu lượt trong một giây → CHẾT
```

Đây chính là **cache stampede** ở quy mô hạ tầng — cùng cơ chế với [phase-4 case 2](../phase-4-cascading-failure/02-case-cache-stampede.md), chỉ khác là nạn nhân không phải database mà là máy chủ gốc.

### Chỗ chặn lại nằm ở vài dòng cấu hình, không nằm ở tiền mua máy

Máy biên thấy 50.000 người cùng hỏi một tệp thì nó **chỉ gửi lên trên 1 lượt**. Số còn lại **chờ chung câu trả lời đó**.

```text
  50.000 lượt hỏi  →  1 lượt hỏi thật lên tầng trên  →  50.000 người được phục vụ
```

Kỹ thuật này có tên ở mọi tầng — và đây là bảng cần thuộc:

| Nơi | Tên gọi | Cách bật |
|---|---|---|
| Nginx | Proxy cache lock | `proxy_cache_lock on; proxy_cache_lock_timeout 5s;` |
| Varnish | Request coalescing | Mặc định bật |
| CDN (Akamai/Fastly/Cloudflare) | Collapsed forwarding / Origin Shield | Bật trong cấu hình phân phối |
| Trong ứng dụng (Go) | `singleflight.Group` | `g.Do(key, fn)` |
| Trong ứng dụng (Java) | Caffeine `LoadingCache` | Tự khoá theo khoá |
| Redis | Khoá phân tán | `SET lock NX EX 10` |

```nginx
# Nginx làm máy biên: 50.000 request cùng miss → chỉ 1 request lên origin
proxy_cache_path /var/cache/hls levels=1:2 keys_zone=hls:100m max_size=50g;

location /live/ {
    proxy_cache            hls;
    proxy_cache_lock       on;         # ← DÒNG QUAN TRỌNG NHẤT
    proxy_cache_lock_age   5s;
    proxy_cache_lock_timeout 5s;
    proxy_cache_valid      200 10s;
    proxy_cache_use_stale  updating error timeout;   # ← phát bản cũ trong lúc nạp
    proxy_pass             http://origin;
}
```

Hai dòng `proxy_cache_lock` và `proxy_cache_use_stale updating` là chênh lệch giữa **1 lượt** và **50.000 lượt** lên tầng trên. Đây là ví dụ đẹp nhất cho câu: **chỗ chặn nằm ở vài dòng lệnh, không nằm ở tiền mua máy.**

---

## Phần 5 — Đường ngược chiều: thứ không chép được

Tới đây thì mọi thứ đều chép được. Nhưng trong phiên live còn **một đường nữa**, nó chạy **ngược chiều**, và đường đó **không chép được — không một lượt nào**.

Là lúc bạn **gõ bình luận, thả tim, bắn quà**. Không ai gõ hộ bạn. Nên mỗi lượt gõ là **một việc thật, phải làm thật**, không có bản sao nào dùng lại được.

Điều may là **đường này nhỏ hơn nhiều**:

```text
  Trong 2,1 triệu người xem:

    chỉ ngồi xem              : ~97 – 99%
    thật sự chạm bàn phím     : ~1 – 3%
                              ≈ 21.000 – 63.000 người

    và mỗi người không gõ liên tục — thực tế khoảng
    3.000 – 15.000 lượt ghi/giây ở đỉnh.

  Đọc thì mênh mông. Ghi thì bé.
```

**Nhưng bé không có nghĩa là dễ:**

```text
  Đường ĐỌC : chỉ cần chép ĐÚNG.
              Sai thì phát lại, người xem không chết ai.

  Đường GHI : phải ĐÚNG THỨ TỰ, ĐÚNG NGƯỜI, và KHÔNG ĐƯỢC MẤT.
              Quà 5 triệu bị mất là mất tiền thật.
```

Nên hai đường này **chạy trên hai hệ thống tách hẳn nhau**:

```text
  ĐƯỜNG ĐỌC                          ĐƯỜNG GHI
  ─────────────────────────          ──────────────────────────
  CDN + máy biên                     WebSocket gateway
  cache tầng tầng lớp lớp            hàng đợi (Kafka/Pulsar)
  không state                        có state, có thứ tự
  tối ưu cho RẺ                      tối ưu cho CHẮC
  hỏng → phát bản cũ                 hỏng → không được mất
```

**Tách ra để làm gì?** Để lúc đường ghi nghẽn, **2,1 triệu người vẫn xem được**. Bạn mất ô bình luận trong 30 giây, còn phiên live thì **không sập**.

> **Hỏng một phần, không hỏng cả cái.** Đây chính là nguyên lý vách ngăn — xem [phase-2 case 5](../phase-2-thread-connection-pool/05-case-bulkhead-co-lap-tai-nguyen.md).

Và hai đường **không được phép kéo nhau xuống**. Cụ thể:

```text
  ✗ SAI : trang xem live gọi API bình luận đồng bộ khi tải
          → API bình luận chậm  →  trang không hiện video
  ✓ ĐÚNG: trang tải video trước, bình luận nối sau, độc lập
          → API bình luận chết  →  video vẫn chạy, ô chat báo "đang kết nối lại"
```

---

## Phần 6 — Cú lật: đổi đúng một thứ

Vẫn 2,1 triệu người đó. Vẫn tối hôm đó. Vẫn **đúng bộ hạ tầng đó**. Tôi chỉ đổi **một thứ duy nhất**:

> **Mỗi người xem một phiên live khác nhau.**

```text
  Tỷ lệ dùng lại rơi thẳng về 1.
  Cái cây phát tán vỡ thành 2.100.000 nhánh riêng.
  Mỗi nhánh phục vụ đúng một người.
  Cache hit rate: từ 99,9999% xuống 0%.
  Máy biên: mỗi tệp chỉ được hỏi đúng 1 lần → cache vô nghĩa.

  Cùng bộ máy đó — SẬP TRONG VÀI GIÂY.
```

Nghĩa là **họ chưa bao giờ gánh 2,1 triệu người. Họ gánh đúng 1, rồi đem photo 2,1 triệu bản.**

Con số 2,1 triệu nghe thì khủng khiếp, nhưng **nó nằm ở đúng phần rẻ nhất**.

Và trang nội bộ của bạn lag **không phải vì 1.000 người**. Nó lag vì **1.000 câu hỏi khác nhau**.

> **Đông không giết hệ thống. Khác nhau mới giết.**

Quay lại hai màn hình lúc đầu — giờ bạn nhìn ra cái nào nặng hơn: **bên trái nặng hơn**.

---

## Phần 7 — Đo tỷ lệ dùng lại của chính hệ thống bạn

Đây là phép đếm mà gần như không ai làm. Nó rẻ, và nó chỉ thẳng vào chỗ cần sửa.

### Cách 1 — Từ log của reverse proxy

```bash
# Tỷ lệ dùng lại thô: tổng request / số URL khác nhau (trong 1 phút)
awk '{print $7}' access.log | wc -l                      # tổng lượt
awk '{print $7}' access.log | sort -u | wc -l            # số câu hỏi khác nhau

# Top URL bị hỏi lặp nhiều nhất → đây là mỏ vàng để cache
awk '{print $7}' access.log | sort | uniq -c | sort -rn | head -20
```

```text
  tổng lượt          : 480.000
  URL khác nhau      :   4.200
  ─────────────────────────────
  tỷ lệ dùng lại     :     114     ← mỗi câu trả lời phục vụ 114 lượt
```

### Cách 2 — Cache hit rate là cùng một con số nhìn từ phía khác

```text
  tỷ lệ dùng lại = 1 / (1 − cache hit rate)

    hit rate 0%    →  tỷ lệ dùng lại = 1       (không dùng lại được gì)
    hit rate 90%   →  10
    hit rate 99%   →  100
    hit rate 99,9% →  1.000
```

Đọc bảng này cho kỹ: **nâng hit rate từ 90% lên 99% không phải "tốt hơn 10%" — nó là giảm tải xuống một phần mười.**

### Cách 3 — Từ database, tìm truy vấn "khác nhau" nhiều nhất

```sql
SELECT calls,
       round(total_exec_time)::bigint AS tong_ms,
       round(mean_exec_time::numeric, 2) AS tb_ms,
       left(query, 80) AS cau_lenh
  FROM pg_stat_statements
 ORDER BY calls DESC
 LIMIT 20;
```

Truy vấn có `calls` cực lớn mà `mean_exec_time` không nhỏ chính là ứng viên số một: **nó đang bị hỏi đi hỏi lại, và mỗi lần đều tính lại từ đầu.**

---

## Phần 8 — Nâng tỷ lệ dùng lại: năm cách, xếp theo hiệu quả

### 1. Tách phần chung ra khỏi phần riêng

Đây là cách mạnh nhất, và nó đúng với **mọi** trang cá nhân hoá.

```text
  TRƯỚC: 1 trang = 100% cá nhân hoá  →  tỷ lệ dùng lại = 1

  SAU:   ┌──────────────────────────────────────┐
         │ Khung trang, menu, banner, tin công ty│  ← CHUNG, cache 5 phút
         │  (chiếm 80% chi phí render)           │     tỷ lệ dùng lại = 1.000
         ├──────────────────────────────────────┤
         │ "Xin chào Anh", 3 task của tôi        │  ← RIÊNG, không cache
         │  (chiếm 20% chi phí)                  │     tỷ lệ dùng lại = 1
         └──────────────────────────────────────┘

  Tải database giảm 80% mà không đổi một dòng nghiệp vụ nào.
```

Kỹ thuật: ESI (Edge Side Includes), lazy-load phần cá nhân bằng một lời gọi API riêng, hoặc tách hẳn thành hai endpoint.

### 2. Cache theo *nhóm*, không theo *người*

```text
  Khoá cache "dashboard:user:8842"        → tỷ lệ dùng lại = 1
  Khoá cache "dashboard:phongban:kinhdoanh" → tỷ lệ dùng lại = 60
  Khoá cache "bangxephang:toancongty"       → tỷ lệ dùng lại = 1.000
```

Rất nhiều thứ tưởng là cá nhân hoá thật ra chỉ phụ thuộc **vai trò** hoặc **phòng ban**.

### 3. Tính trước thay vì tính lúc hỏi

Bảng xếp hạng, số liệu tổng hợp, báo cáo — tính một lần mỗi phút vào một bảng/khoá Redis, thay vì tính lại cho từng lượt xem.

```text
  10.000 lượt xem/phút × 1 truy vấn nặng   =  10.000 lần tính
  1 job chạy mỗi phút + 10.000 lượt đọc cache =      1 lần tính
```

### 4. Gộp lượt hỏi trùng nhau (request coalescing)

Đã nói ở phần 4. Nó không nâng tỷ lệ dùng lại, nhưng nó **chặn đúng cái khoảnh khắc tỷ lệ đó tụt về 1** — lúc cache vừa hết hạn.

### 5. Đừng để cache hết hạn cùng lúc

```text
  TTL cố định 300 giây  →  mọi khoá tạo cùng lúc sẽ hết hạn cùng lúc
  TTL = 300 + rand(0..60) → trải ra, không có đỉnh
```

Cùng gia đình với **đồng bộ hoá vô tình** — [phase-6 case 8](../phase-6-runtime-ha-tang/08-case-dong-bo-hoa-vo-tinh.md).

---

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| Đo tải bằng **số người dùng** | Máy chủ không thấy người. Đếm **số câu hỏi khác nhau** |
| "Thêm máy chủ là xong" | Thêm máy mua được vài lần; **chép lại mua được cả nghìn lần** |
| Cache mọi thứ theo `user_id` | Tỷ lệ dùng lại = 1, cache chỉ tốn RAM chứ không giảm tải |
| Nghĩ hit rate 90% đã tốt | 90% → 99% là **giảm tải xuống một phần mười**, không phải "tốt hơn 10%" |
| Quên cái kẽ hở lúc cache hết hạn | Toàn bộ tải dồn lên nguồn gốc trong một giây |
| Để đường đọc và đường ghi dùng chung tài nguyên | Ô chat nghẽn kéo sập cả trang xem |
| Retry mù khi hệ thống đang chậm | Bấm lại làm hàng dài thêm → vòng lặp không tự thoát |
| Cá nhân hoá toàn bộ trang "cho tiện" | Vứt bỏ 100% khả năng dùng lại của phần chung |

---

## Tóm tắt case 1

- **Máy chủ không nhìn thấy người, nó chỉ thấy lượt hỏi.** Thứ quyết định nó sống hay chết là **có bao nhiêu câu hỏi KHÁC NHAU** trong đống đó.
- **Tỷ lệ dùng lại** = tổng lượt hỏi / số câu hỏi khác nhau. Trang nội bộ: **1**. Phiên live: **2.100.000**.
- Câu hỏi khác nhau thì phải **tính** (mili giây); câu hỏi giống nhau thì chỉ phải **chép** (phần triệu giây). Chênh nhau ~1.000 lần.
- Chép cũng không nhẹ: 2,1 triệu × 1,5 MB / 4 giây = **6,3 Tbps**, tức hơn 250 máy chỉ để bơm byte. Nên người ta xếp máy thành **cây** — cây không làm số byte ít đi, nó làm **không ai phải gánh một mình**.
- Cây có **một kẽ hở mở ra 4 giây một lần**: lúc nội dung mới ra đời, mọi máy biên cùng miss. Chặn bằng **gộp lượt hỏi trùng** — `proxy_cache_lock`, `singleflight`, Origin Shield. **Vài dòng cấu hình, không phải tiền mua máy.**
- Đường **ghi** không chép được lượt nào, nhưng nó nhỏ hơn cả trăm lần. **Đọc thì chép cho thật rẻ, ghi thì làm cho thật chắc**, và hai đường phải **tách hẳn** để hỏng một phần không hỏng cả cái.
- Cú lật: cho mỗi người xem một phiên khác nhau thì **cùng bộ hạ tầng đó sập trong vài giây**. Họ chưa bao giờ gánh 2,1 triệu người — họ gánh **đúng 1**, rồi photo 2,1 triệu bản.
- **Đông không giết hệ thống. Khác nhau mới giết.** Trước khi đi thêm máy, hãy ngồi đếm: **câu hỏi nào đang bị hỏi đi hỏi lại?** Trả lời nó một lần rồi chép.

**Bài kế tiếp** → [Case 2: Độ trễ livestream — bộ đệm là quả cân](02-case-do-tre-va-bo-dem.md)
