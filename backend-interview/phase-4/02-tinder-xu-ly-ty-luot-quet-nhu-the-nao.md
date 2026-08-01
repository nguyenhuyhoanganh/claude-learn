# Bài 2: Tinder xử lý tỷ lượt quẹt như thế nào

**1 tỷ 600 triệu lượt quẹt mỗi ngày.** 75 triệu người dùng. Và chỉ vài chục mili giây để trả kết quả.

Bạn xây Tinder theo cách ngây thơ nhất, và chỉ sau vài giây, máy chủ đã bốc cháy nghi ngút. Vì mỗi lần bạn quẹt, hệ thống lại phải hỏi: *"người này có hợp với bạn không?"* — giữa cả **75 triệu người**.

Với dân kỹ sư, Tinder thật ra không phải một app hẹn hò lãng mạn. Nó là **một bài toán tìm kiếm khổng lồ chạy trên phạm vi toàn cầu**.

Bài này là bài **thiết kế hệ thống** đầu tiên của khoá — nơi mọi thứ đã học (load balancer, cache, hàng đợi, Big O, sharding) khớp lại thành một bức tranh.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **Geospatial** | **Không gian địa lý** — dữ liệu có toạ độ |
| **Geohash** | Mã hoá toạ độ thành chuỗi ký tự để tra cứu nhanh |
| **S2 Cell** | Thư viện Google chia bề mặt Trái Đất thành ô phân cấp |
| **Index** | **Chỉ mục** — cấu trúc giúp tìm nhanh mà không quét hết |
| **Shard** | **Mảnh** — một phần dữ liệu nằm trên một máy |
| **Fan-out** | **Toả ra** — ghi/đọc từ nhiều nơi cùng lúc |
| **Recommendation** | **Gợi ý** — danh sách hệ thống chọn cho bạn |
| **Double opt-in** | **Hai bên cùng đồng ý** mới thành |
| **Precompute** | **Tính sẵn** — làm trước, lúc cần chỉ đọc ra |
| **Write amplification** | **Khuếch đại ghi** — một hành động sinh ra nhiều lần ghi |
| **Elasticsearch** | Công cụ tìm kiếm phân tán, chuyên lọc và xếp hạng |

## Phiên bản ngây thơ và vì sao nó cháy

```text
   Người dùng mở app → "cho tôi người để quẹt"

   SELECT * FROM users
   WHERE gioi_tinh = 'nu'
     AND tuoi BETWEEN 22 AND 30
     AND khoang_cach(vi_tri_toi, vi_tri) < 10   -- ◄── TÍNH CHO TỪNG DÒNG
     AND user_id NOT IN (SELECT ... da_quet ...)
   ORDER BY diem_phu_hop DESC
   LIMIT 20;
```

**Ba vấn đề chết người:**

```text
① Hàm khoảng_cách CHẠY CHO TỪNG DÒNG trong 75 triệu dòng
   → index vô dụng (bọc hàm quanh cột — xem khoá SQL)
   → O(n) với n = 75.000.000, mỗi lần quẹt

② 1,6 tỷ lượt quẹt/ngày = ~18.500 truy vấn/giây, mỗi cái quét 75 triệu dòng
   → không có database quan hệ nào trên đời chịu nổi

③ NOT IN với danh sách đã quẹt có thể lên tới hàng nghìn phần tử mỗi người
```

## Bước 1: Đừng tìm trong cả hành tinh — chia Trái Đất thành ô

Ý tưởng cốt lõi: **bạn ở Hà Nội thì không cần biết ai đang ở Brazil.**

```text
   CÁCH NGÂY THƠ — lưới đều

      ┌───┬───┬───┬───┐
      │   │   │   │   │    Mỗi ô 10km × 10km
      ├───┼───┼───┼───┤
      │ ●●│●●●│   │   │    ✗ Ô ở Hà Nội: 500.000 người
      │●●●│●●●│   │   │    ✗ Ô ở sa mạc: 3 người
      ├───┼───┼───┼───┤    → TẢI CỰC KỲ LỆCH
      │   │   │   │   │
      └───┴───┴───┴───┘


   CÁCH CỦA TINDER — S2 Cell (thư viện của Google), Ô PHÂN CẤP

      Vùng ĐÔNG DÂN  → băm thành ô NHỎ XÍU
      Vùng VẮNG NGƯỜI → gộp thành ô TO

      ┌─┬─┬───┬───────┐
      ├─┼─┤   │       │    Hà Nội: nhiều ô nhỏ, mỗi ô ~10.000 người
      ├─┼─┤   │       │    Sa mạc: một ô to
      ├─┴─┼───┤       │
      │   │   │       │    → TẢI ĐƯỢC SAN ĐỀU TỰ NHIÊN
      └───┴───┴───────┘

   Theo chính Tinder, cách này xử lý được GẤP 20 LẦN khối lượng tính toán.
```

**Cách hoạt động khi bạn mở app:**

```text
   ① Lấy toạ độ của bạn → tính ra ô S2 chứa bạn
   ② Lấy các ô LÂN CẬN phủ bán kính tìm kiếm (ví dụ 10 km)
        → thường 5–9 ô
   ③ CHỈ hỏi những ô đó, gộp kết quả lại
        → thay vì 75 triệu người, ta chỉ đụng vào ~50.000 người
        → O(n) với n = 50.000 thay vì 75.000.000  → NHANH HƠN 1.500 LẦN
```

```python
import s2sphere as s2

def lay_o_lan_can(lat, lng, ban_kinh_m=10000, level=13):
    diem = s2.LatLng.from_degrees(lat, lng)
    vung = s2.Cap.from_axis_angle(
        diem.to_point(),
        s2.Angle.from_degrees(ban_kinh_m / 111320.0)
    )
    phu = s2.RegionCoverer()
    phu.min_level, phu.max_level, phu.max_cells = level, level, 9
    return [c.id() for c in phu.get_covering(vung)]

# Truy vấn giờ chỉ còn:
#   WHERE cell_id IN (...)  ← index bình thường dùng được, KHÔNG bọc hàm
```

**Điểm mấu chốt:** biến bài toán *"tính khoảng cách"* (không dùng được index) thành bài toán *"khớp giá trị trong danh sách"* (dùng index hoàn hảo). Đây là mẫu tư duy dùng lại được ở rất nhiều nơi.

> **Các lựa chọn khác:** PostGIS với `GIST` index, Redis `GEOADD`/`GEOSEARCH`, Elasticsearch `geo_point`, Uber H3 (ô lục giác — tốt hơn cho tính lân cận). Với dự án thường, **PostGIS là đủ**; S2 dành cho quy mô toàn cầu.

## Bước 2: Chia chỉ mục tìm kiếm theo vùng

Tinder dùng **Elasticsearch** cho việc lọc và xếp hạng. Phiên bản đầu chỉ có **một index chung cho toàn hành tinh**.

```text
   TRƯỚC — một tủ hồ sơ duy nhất chứa 75 triệu người
      → index phình thành cả một ngọn núi dữ liệu
      → mỗi truy vấn phải hỏi mọi shard rồi gộp (scatter-gather)
      → chậm dần theo thời gian, không có cách nào cứu

   SAU — chia index theo VÙNG ĐỊA LÝ
      index_vn_bac    index_vn_nam    index_us_west   ...
           ▲
      Bạn ở Hà Nội → CHỈ hỏi index_vn_bac
      → mỗi index nhỏ hơn hàng trăm lần
      → không phải scatter-gather nữa
```

Đây chính là **sharding theo shard key = vùng địa lý** (xem khoá SQL, phase-7 bài 4). Và nó có đủ bốn tiêu chí của một shard key tốt:

```text
   ✓ Phân bố tương đối đều (nhờ ô phân cấp S2)
   ✓ Có mặt trong hầu hết truy vấn (mọi tìm kiếm đều có vị trí)
   ✓ Gom được dữ liệu liên quan (người gần nhau nằm cùng shard)
   ⚠️ Bất biến? KHÔNG — người ta DI CHUYỂN.
```

Điểm cuối là vấn đề thật, và cách xử lý cho thấy sự trưởng thành của thiết kế:

```text
   Người dùng bay từ Hà Nội vào Sài Gòn:
      → hồ sơ phải chuyển từ index_vn_bac sang index_vn_nam
      → nhưng KHÔNG chuyển ngay, vì họ có thể chỉ đi công tác

   ✅ Cách xử lý:
      • Ngưỡng khoảng cách (di chuyển > 100 km) VÀ ngưỡng thời gian (> 24 giờ)
      • Trong lúc chuyển: ghi vào CẢ HAI index (dual write) một thời gian
      • Truy vấn có thể hỏi cả hai ô cũ và mới trong giai đoạn quá độ
```

## Bước 3: Bài toán "match" — và cái bẫy 75 triệu lần tra cứu

```text
   MATCH chỉ xảy ra khi CẢ HAI cùng thích nhau. Cả hai, không phải một.

   CÁCH NGÂY THƠ:
      Bạn quẹt phải người X
      → hệ thống hỏi: "X đã quẹt phải bạn chưa?"
      → SELECT * FROM swipes WHERE from_user = X AND to_user = ME
      → 1,6 tỷ lượt quẹt/ngày = 1,6 tỷ lần tra cứu thêm
      → cộng một vòng gọi mạng cho MỖI lượt quẹt
```

**Mẹo của Tinder rất gọn — và đây là ý tưởng đẹp nhất trong cả bài:**

```text
   Khi ai đó xuất hiện trong DANH SÁCH GỢI Ý cho bạn,
   hệ thống ĐÃ KỊP MANG THEO một mẩu tin:

      { user_id: 12345, ten: "...", anh: [...],
        ho_da_quet_phai_ban: true    ◄── TÍNH SẴN, nằm ngay trong danh sách }

   Thông tin nằm SẴN TRONG TAY BẠN.

   Vậy nên nếu người kia đã lỡ thích bạn từ trước,
   thì KHOẢNH KHẮC bạn quẹt phải, tấm thẻ "MATCH" bùng lên NGAY LẬP TỨC.

   KHÔNG cần thêm một vòng gọi mạng nào để đi hỏi máy chủ.
   Nó đã biết sẵn rồi.
```

Đây là mẫu thiết kế **tính sẵn lúc đọc thay vì tra cứu lúc ghi** — và nó là câu trả lời cho rất nhiều bài toán quy mô lớn:

```text
   ĐÁNH ĐỔI:
      + Lúc dựng danh sách gợi ý (20 người), ta tra cứu MỘT LẦN cho cả 20
      + Lúc quẹt (1,6 tỷ lần/ngày), ta KHÔNG tra cứu gì cả
      − Đổi lại: nếu người kia quẹt bạn SAU khi danh sách đã dựng,
        thì thông tin trong tay bạn hơi cũ
        → xử lý bằng một lần kiểm tra ở phía server khi ghi lượt quẹt
```

### Lưu lượt quẹt thế nào

```sql
-- Bảng swipes — 1,6 tỷ dòng MỖI NGÀY
CREATE TABLE swipes (
    from_user BIGINT      NOT NULL,
    to_user   BIGINT      NOT NULL,
    huong     SMALLINT    NOT NULL,     -- 1 = phải, 0 = trái
    swiped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (from_user, to_user)     -- ◄── shard theo from_user
) PARTITION BY HASH (from_user);
```

```text
   Vì sao khoá chính là (from_user, to_user)?
      → Mọi truy vấn đều là "user X đã quẹt những ai"
      → Ghi và đọc đều rơi vào cùng một shard theo from_user
      → Chống trùng: quẹt lại cùng một người không tạo dòng mới

   Vì sao dùng PARTITION BY HASH?
      → Phân bố đều tuyệt đối, không có hot shard
      → Không cần dọn dữ liệu cũ theo thời gian (quẹt là dữ liệu vĩnh viễn)
```

**Phát hiện match ở phía server** — vẫn phải có, nhưng chỉ chạy khi quẹt **phải**:

```sql
-- Chỉ ~50% lượt quẹt là "phải", và chỉ chúng mới cần kiểm
INSERT INTO swipes (from_user, to_user, huong) VALUES ($1, $2, 1)
ON CONFLICT DO NOTHING;

SELECT 1 FROM swipes
WHERE from_user = $2 AND to_user = $1 AND huong = 1;   -- ◄── tra 1 dòng theo PK
-- Có → tạo match, đẩy thông báo cho cả hai qua hàng đợi
```

Điểm quan trọng: đây là tra cứu **theo khoá chính**, O(1) trên shard đã biết trước — không phải quét gì cả.

## Bước 4: Danh sách "đã quẹt" — bài toán bộ lọc

```text
   Người dùng lâu năm có thể đã quẹt 50.000 người.
   Mỗi lần dựng danh sách gợi ý, phải LOẠI BỎ hết những người đó.

   ❌ NOT IN (50.000 giá trị) → truy vấn khổng lồ, chậm
   ❌ LEFT JOIN swipes → quét bảng 1,6 tỷ dòng/ngày
```

**Lời giải: Bloom filter** (đã gặp ở bài caching).

```python
# Mỗi user một Bloom filter chứa những ai họ đã quẹt
# 50.000 phần tử, tỉ lệ báo nhầm 1% → chỉ ~60 KB

def loc_goi_y(user_id, ung_vien):
    bf = redis.get(f"swiped_bf:{user_id}")     # nạp một lần
    return [u for u in ung_vien if not bf.might_contain(u)]
```

```text
   Bloom filter trả lời:
      "CHẮC CHẮN chưa quẹt"  → an toàn để gợi ý
      "CÓ THỂ đã quẹt"       → bỏ qua

   Nó KHÔNG BAO GIỜ báo nhầm kiểu "chưa quẹt" cho người đã quẹt.
   Chỉ có thể bỏ sót vài người chưa quẹt (~1%) — hoàn toàn chấp nhận được,
   vì còn hàng nghìn ứng viên khác.
```

Đây là ví dụ hoàn hảo của **đánh đổi độ chính xác lấy quy mô**: chấp nhận 1% sai sót vô hại để giảm bộ nhớ hàng trăm lần.

## Kiến trúc tổng thể

```text
   App ──► CDN / Edge (ảnh, tài nguyên tĩnh)
    │
    ▼
   API Gateway ──► xác thực, hạn mức, định tuyến
    │
    ├──► RECOMMENDATION SERVICE
    │       │
    │       ├─► ① Lấy vị trí → tính ô S2 lân cận
    │       ├─► ② Hỏi Elasticsearch của VÙNG đó
    │       │      lọc: giới tính, tuổi, khoảng cách, đang hoạt động
    │       │      xếp hạng: điểm phù hợp
    │       ├─► ③ Lọc bỏ người đã quẹt (Bloom filter từ Redis)
    │       ├─► ④ Đính kèm "họ_đã_quẹt_phải_bạn" cho từng người
    │       └─► ⑤ Cache danh sách 20 người vào Redis (TTL ~15 phút)
    │
    ├──► SWIPE SERVICE
    │       ├─► ghi vào bảng swipes (phân vùng theo from_user)
    │       ├─► nếu quẹt phải: tra 1 dòng theo khoá chính xem có match không
    │       └─► có match → đẩy sự kiện vào HÀNG ĐỢI
    │
    └──► NOTIFICATION WORKER (đọc từ hàng đợi)
            └─► gửi push cho cả hai bên

   Mọi lượt quẹt cũng được đẩy vào Kafka → kho phân tích → huấn luyện mô hình
```

**Đường đi của một lượt quẹt: chỉ chạm Redis và một dòng trong Postgres.** Đó là lý do nó chạy trong vài chục mili giây ở quy mô 18.500 lượt/giây.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Danh sách gợi ý được cache 15 phút. Người dùng quẹt hết 20 người trong 30 giây rồi vuốt tiếp — và thấy lại đúng những người vừa quẹt.

```text
   Nguyên nhân: cache trả về danh sách cũ, chưa biết họ vừa quẹt.

   ✅ Ba lớp xử lý:

   ① Cache theo TRANG, không cache theo người dùng
        goi_y:{user_id}:{trang}  → mỗi trang 20 người, tính sẵn 5 trang
        Quẹt hết trang 1 → lấy trang 2 (đã có sẵn trong cache)

   ② XOÁ khỏi cache ngay khi quẹt (ghi vào Redis Set "vừa quẹt")
        Lọc danh sách qua Set này TRƯỚC khi trả về

   ③ Nạp trước: khi người dùng còn 5 người, âm thầm dựng trang tiếp theo
        → họ không bao giờ thấy màn hình chờ
```

> **Tình huống 2:** Một người nổi tiếng có 2 triệu lượt quẹt phải. Mỗi lần họ mở app, hệ thống phải xử lý danh sách khổng lồ.

**Đây là bài toán hot key** — và nó xuất hiện ở mọi mạng xã hội.

```text
   ❌ Cách ngây thơ: lưu "ai đã thích tôi" thành một danh sách, đọc hết ra
      → 2 triệu dòng cho một request

   ✅ Cách xử lý:

   ① KHÔNG BAO GIỜ đọc toàn bộ — chỉ lấy top N theo điểm phù hợp
        LIMIT 100 với ORDER BY diem DESC

   ② TÍNH SẴN theo lô: worker định kỳ dựng sẵn "top 100 người thích bạn"
        cho tài khoản có lượt thích lớn, lưu vào Redis

   ③ Với tài khoản siêu nổi tiếng: tách riêng đường xử lý (VIP path),
        thậm chí shard riêng để không ảnh hưởng người khác

   ④ Giới hạn ở tầng sản phẩm: chỉ hiện "99+" thay vì con số thật
        → đây là quyết định sản phẩm giải quyết vấn đề kỹ thuật, và nó hợp lệ
```

> **Tình huống 3:** Người phỏng vấn hỏi *"thiết kế hệ thống gợi ý cho 10 triệu người dùng"*.

**Khung trả lời sáu bước — dùng được cho mọi câu hỏi thiết kế hệ thống:**

```text
① LÀM RÕ YÊU CẦU (đừng vội vẽ)
   "Cho em hỏi: bao nhiêu người dùng hoạt động hằng ngày?
    Bao nhiêu lượt quẹt mỗi người mỗi ngày?
    Gợi ý cần thời gian thực hay tính sẵn được?
    Độ trễ mục tiêu là bao nhiêu?"
   → Người phỏng vấn ĐANG CHỜ bạn hỏi. Đây là điểm đầu tiên.

② ƯỚC LƯỢNG CON SỐ
   10 triệu DAU × 100 lượt/ngày = 1 tỷ lượt/ngày
   ÷ 86.400 giây ≈ 11.500 lượt/giây trung bình
   × 3 (giờ cao điểm) ≈ 35.000 lượt/giây đỉnh
   → Con số này quyết định MỌI thứ phía sau.

③ VẼ KIẾN TRÚC MỨC CAO
   Client → Gateway → Recommendation Service → ES + Redis + Postgres

④ ĐI SÂU VÀO ĐIỂM KHÓ NHẤT
   → ở đây là: làm sao không quét 10 triệu người mỗi lần
   → trả lời: chia theo ô địa lý + index theo vùng

⑤ NÊU NÚT THẮT VÀ CÁCH MỞ RỘNG
   → hot key (người nổi tiếng), lệch tải theo vùng,
     người dùng di chuyển giữa các shard

⑥ NÊU ĐÁNH ĐỔI
   "Em chọn tính sẵn danh sách gợi ý, đổi lại nó có thể cũ vài phút.
    Nếu cần thời gian thực tuyệt đối thì phải trả bằng độ trễ."
```

**Bước ⑥ là bước phân biệt ứng viên senior.** Người mới trình bày một giải pháp; người có kinh nghiệm trình bày một **lựa chọn có ý thức**.

## Những mẫu tư duy rút ra được

Đây là phần đáng mang theo nhất của bài:

```text
① BIẾN BÀI TOÁN "TÍNH TOÁN" THÀNH BÀI TOÁN "TRA CỨU"
   khoảng_cách(a, b) < 10km   →   cell_id IN (...)
   → hàm không dùng được index; khớp giá trị thì dùng được

② THU HẸP KHÔNG GIAN TÌM KIẾM TRƯỚC KHI XẾP HẠNG
   Đừng xếp hạng 75 triệu người rồi lấy 20.
   Hãy lọc còn 50.000 rồi mới xếp hạng.

③ TÍNH SẴN LÚC ĐỌC ÍT, THAY VÌ TRA CỨU LÚC GHI NHIỀU
   Dựng danh sách gợi ý 1 lần → dùng cho 20 lượt quẹt.
   1,6 tỷ lượt quẹt không cần thêm truy vấn nào.

④ CHẤP NHẬN SAI SÓT VÔ HẠI ĐỂ ĐỔI LẤY QUY MÔ
   Bloom filter sai 1% → bỏ sót vài ứng viên → không ai chết.
   Đổi lại tiết kiệm bộ nhớ hàng trăm lần.

⑤ CHIA NHỎ THEO CHIỀU MÀ TRUY VẤN LUÔN CÓ
   Mọi tìm kiếm đều có vị trí → shard theo vị trí.
   Mọi truy vấn quẹt đều có from_user → shard theo from_user.

⑥ ĐẨY VIỆC KHÔNG CẦN NGAY RA HÀNG ĐỢI
   Thông báo match, phân tích, huấn luyện mô hình — tất cả bất đồng bộ.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tính khoảng cách trong `WHERE` | Index vô dụng, quét toàn bảng | Đổi thành `cell_id IN (...)` |
| Lưới địa lý đều | Tải cực lệch giữa thành phố và nông thôn | Ô phân cấp (S2/H3) |
| Một index tìm kiếm cho toàn cầu | Scatter-gather mọi truy vấn | Chia index theo vùng |
| `NOT IN` danh sách đã quẹt | Truy vấn khổng lồ | Bloom filter |
| Tra cứu match mỗi lượt quẹt | +1 vòng mạng × 1,6 tỷ | Đính sẵn cờ vào danh sách gợi ý |
| Không xử lý người dùng di chuyển | Hồ sơ nằm sai shard | Ngưỡng khoảng cách + thời gian, dual write |
| Không xử lý hot key | Người nổi tiếng làm nghẽn một shard | Top N + tính sẵn + đường VIP riêng |
| Cache danh sách nhưng không lọc "vừa quẹt" | Hiện lại người vừa quẹt | Redis Set lọc trước khi trả |
| Gửi thông báo đồng bộ trong request | Chậm, và lỗi thông báo kéo lỗi quẹt | Đẩy ra hàng đợi |
| Vẽ kiến trúc trước khi hỏi yêu cầu | Mất điểm ngay câu đầu | Hỏi con số trước |
| Không nêu đánh đổi | Nghe như đọc thuộc | Luôn nói "đổi lại là..." |

## Câu hỏi phỏng vấn hay gặp

**H: Làm sao tìm người gần bạn trong 75 triệu người mà không quét hết?**
Không tính khoảng cách trong `WHERE` — hàm bọc quanh cột làm index vô dụng và biến nó thành O(n). Thay vào đó **chia bề mặt Trái Đất thành ô** và lưu sẵn `cell_id` cho mỗi người. Lúc tìm, tính ra các ô lân cận phủ bán kính rồi hỏi `WHERE cell_id IN (...)` — bài toán "tính toán" thành bài toán "tra cứu", và index dùng được hoàn hảo. Quan trọng là dùng **ô phân cấp** như S2 chứ không phải lưới đều: vùng đông dân băm thành ô nhỏ, vùng vắng gộp thành ô to, nên tải được san đều tự nhiên.

**H: Làm sao biết hai người match mà không tra cứu 1,6 tỷ lần mỗi ngày?**
Mẹo là **tính sẵn lúc dựng danh sách gợi ý**. Khi ai đó xuất hiện trong danh sách của bạn, hệ thống đã kịp đính kèm một cờ `họ_đã_quẹt_phải_bạn`. Nên khoảnh khắc bạn quẹt phải, thẻ match bùng lên ngay mà không cần thêm vòng gọi mạng nào. Đánh đổi: một lần tra cứu cho cả 20 người trong danh sách, thay vì một lần tra cứu cho mỗi lượt quẹt. Vẫn phải có bước kiểm ở server khi ghi lượt quẹt, nhưng đó là tra cứu theo khoá chính trên shard đã biết — O(1).

**H: Người dùng đã quẹt 50.000 người, làm sao lọc bỏ họ khỏi gợi ý?**
`NOT IN` với 50.000 giá trị là truy vấn khổng lồ, còn `LEFT JOIN` thì quét bảng tỷ dòng. Em dùng **Bloom filter**: 50.000 phần tử với tỉ lệ báo nhầm 1% chỉ tốn khoảng 60 KB. Nó trả lời *"chắc chắn chưa quẹt"* hoặc *"có thể đã quẹt"* — không bao giờ báo nhầm kiểu bỏ sót người đã quẹt. Cái giá là bỏ sót khoảng 1% ứng viên chưa quẹt, hoàn toàn vô hại vì còn hàng nghìn người khác. Đây là **đánh đổi độ chính xác lấy quy mô**.

**H: Người nổi tiếng có 2 triệu lượt thích, xử lý sao?**
Đây là hot key. Không bao giờ đọc toàn bộ — chỉ lấy **top N theo điểm phù hợp**. Với tài khoản có lượt thích lớn, worker định kỳ **tính sẵn** danh sách top 100 và lưu vào Redis. Tài khoản siêu nổi tiếng thì tách đường xử lý riêng, thậm chí shard riêng để không ảnh hưởng người khác. Và ở tầng sản phẩm, hiện "99+" thay vì con số thật — đó là quyết định sản phẩm giải quyết vấn đề kỹ thuật, và nó hoàn toàn hợp lệ.

**H: Bạn tiếp cận một câu hỏi thiết kế hệ thống thế nào?**
Sáu bước. **Làm rõ yêu cầu trước** — bao nhiêu người hoạt động hằng ngày, bao nhiêu thao tác mỗi người, độ trễ mục tiêu; người phỏng vấn đang chờ mình hỏi. **Ước lượng con số** để ra request/giây ở đỉnh, vì con số đó quyết định mọi thứ phía sau. **Vẽ kiến trúc mức cao**. **Đi sâu vào điểm khó nhất**. **Nêu nút thắt và cách mở rộng**. Và cuối cùng — bước phân biệt ứng viên có kinh nghiệm — **nêu đánh đổi**: "em chọn tính sẵn, đổi lại danh sách có thể cũ vài phút; muốn thời gian thực tuyệt đối thì phải trả bằng độ trễ".

## Tóm tắt bài 2

- Bài toán thật của Tinder không phải hẹn hò mà là **tìm kiếm quy mô toàn cầu**: đừng để mỗi lượt quẹt phải hỏi 75 triệu người.
- **Chia Trái Đất thành ô phân cấp** (S2/H3, không phải lưới đều) → biến bài toán *tính khoảng cách* (không dùng index) thành *khớp `cell_id`* (dùng index) → nhanh hơn ~1.500 lần.
- **Chia index tìm kiếm theo vùng** — đây chính là sharding, với shard key là vị trí; và phải xử lý việc **người dùng di chuyển** bằng ngưỡng khoảng cách + thời gian + dual write.
- Match giải bằng **tính sẵn cờ trong danh sách gợi ý** — 1,6 tỷ lượt quẹt không cần thêm truy vấn nào.
- Lọc "đã quẹt" bằng **Bloom filter** — chấp nhận 1% sai sót vô hại để đổi lấy quy mô.
- Sáu mẫu tư duy mang theo: **biến tính toán thành tra cứu**, **thu hẹp trước khi xếp hạng**, **tính sẵn lúc đọc ít**, **chấp nhận sai sót vô hại**, **shard theo chiều truy vấn luôn có**, **đẩy việc không cần ngay ra hàng đợi**.
- Khung trả lời thiết kế hệ thống: **hỏi yêu cầu → ước lượng số → kiến trúc → điểm khó → nút thắt → đánh đổi**.

**Bài kế tiếp** → [Bài 3: Từ thợ gõ code thành người duyệt code](03-tu-tho-go-code-thanh-nguoi-duyet-code.md)
