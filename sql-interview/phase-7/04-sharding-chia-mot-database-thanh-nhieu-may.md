# Bài 4: Sharding — chia một database thành nhiều máy

Năm 2020, Figma đang tăng trưởng bùng nổ. Từng file thiết kế, từng đường kẻ, từng cú click của hàng triệu người đều đổ dồn về **đúng một database PostgreSQL**.

Trong 4 năm, lượng dữ liệu phình lên gần 100 lần. CPU lúc cao điểm chạm ngưỡng nguy hiểm. Họ làm điều ai cũng làm: thuê máy mạnh hơn — cho tới khi họ thuê **con máy to nhất mà AWS có bán**, rồi đứng khựng lại.

Không còn nước nào cao hơn nữa.

Đây là câu chuyện về nước cờ cuối cùng, và về cái giá mà bạn phải trả **mãi mãi** sau khi đi nước đó.

## Bậc thang: bốn nước đi trước khi shard

Bài học lớn nhất của Figma không phải "hãy shard", mà là: **đừng shard khi các nước thang dễ hơn vẫn còn chỗ để leo.**

```text
NƯỚC 1 — NÂNG DỌC (vertical scaling)
   Thuê máy to hơn. Rẻ nhất về công sức, đắt nhất về tiền.
   Trần: con máy lớn nhất nhà cung cấp có bán.
   → Ngày nay một instance có thể có 128 vCPU / 4 TB RAM. Rất xa.

NƯỚC 2 — GOM KẾT NỐI + BẢN SAO ĐỌC
   • Connection pool (PgBouncer): mỗi kết nối tốn ~10 MB RAM ở Postgres,
     10.000 kết nối là 100 GB chỉ để ngồi không.
   • Read replica: chia tải ĐỌC (xem bài 2).
   → Mua được rất nhiều thời gian. Làm trước tiên.

NƯỚC 3 — TÁCH BẢNG SANG DATABASE KHÁC (vertical partitioning / functional sharding)
   "Khiêng cả một nhóm kệ sang kho khác."
   Bảng events, bảng logs, bảng analytics → database riêng.
   → Vẫn giữ được ACID trong từng nhóm. Rẻ hơn sharding nhiều.

NƯỚC 4 — PARTITIONING TRONG MỘT MÁY
   Chia bảng lớn thành mảnh, dọn dữ liệu cũ bằng DROP PARTITION (bài 3).
   → Giải được vấn đề bảo trì và query, chưa giải được vấn đề thông lượng ghi.

NƯỚC 5 — SHARDING
   Chỉ khi: MỘT BẢNG đã lớn hơn một cỗ máy, và ghi đã chạm trần.
   Đây là nước không quay lại được.
```

Figma đi đủ nước 1 tới 4 rồi mới shard. Đó là thứ khiến câu chuyện của họ đáng học.

## Sharding là gì: cắt ngang thay vì cắt dọc

```text
TÁCH BẢNG (nước 3) — cắt DỌC
   Kho A: [users][sessions]      Kho B: [events][logs]
   → Vẫn nguyên vẹn từng bảng. Nhưng một bảng vẫn phải nằm gọn một máy.

SHARDING — cắt NGANG
   Bảng users, 500 triệu dòng:
   Kho A: users id 1..125tr   Kho B: users id 125..250tr
   Kho C: users id 250..375tr Kho D: users id 375..500tr
   → CÙNG MỘT BẢNG nằm trên nhiều máy khác nhau.
```

Cắt theo hàng thì dựa vào đâu? Bạn chọn một cột làm **shard key** (khoá phân mảnh). Nó quyết định mỗi hàng đi về kho nào — nó chính là **địa chỉ** của dữ liệu.

## Ba cách ánh xạ shard key → shard

```text
① HASH — băm khoá rồi chia lấy dư
   shard = hash(user_id) % 16

   ✓ Phân bố đều tự nhiên
   ✗ Không truy vấn theo khoảng được (mọi user 100..200 nằm rải khắp nơi)
   ✗ Đổi số shard = phải chuyển GẦN NHƯ TOÀN BỘ dữ liệu

② RANGE — theo khoảng giá trị
   user_id 1..1tr → shard 0;  1tr..2tr → shard 1; ...

   ✓ Truy vấn theo khoảng rất hiệu quả
   ✗ ĐIỂM NÓNG: user mới nhất luôn dồn vào shard cuối
   ✗ Phân bố lệch khi dữ liệu không đều

③ DIRECTORY (bảng tra cứu) — lưu bản đồ tường minh
   bảng shard_map: (tenant_id → shard_name)

   ✓ Linh hoạt nhất: chuyển từng tenant riêng lẻ, cân bằng thủ công
   ✓ Thêm shard không phải chuyển dữ liệu cũ
   ✗ Bảng tra cứu thành điểm chết duy nhất — phải cache mạnh
```

### Consistent hashing — giải bài toán "đổi số shard"

Với `hash % N`, đổi từ 16 shard lên 17 shard nghĩa là **~94% dữ liệu phải di chuyển**. Không chấp nhận được.

**Consistent hashing** đặt shard và dữ liệu lên một vòng tròn băm:

```text
        shard_A(0°)
      ╱             ╲
   key3            shard_B(90°)
   ╱                    ╲
shard_D(270°)         key1
   ╲                    ╱
   key2            shard_C(180°)
      ╲             ╱

Mỗi khoá đi theo chiều kim đồng hồ tới shard đầu tiên gặp được.
Thêm shard_E vào 45° → chỉ những khoá nằm giữa 0° và 45° phải chuyển.
→ Chỉ ~1/N dữ liệu di chuyển, thay vì gần như toàn bộ.
```

Cách thực dụng hơn và được dùng nhiều nhất: **virtual shard** (mảnh ảo).

```text
Chia sẵn thành 1024 mảnh LOGIC ngay từ đầu.
Ánh xạ 1024 mảnh logic → 4 máy VẬT LÝ (mỗi máy 256 mảnh).

Cần mở rộng lên 8 máy? → Chuyển 128 mảnh logic từ mỗi máy cũ sang máy mới.
   • Không tính lại hash
   • Chuyển được từng mảnh một, có thể dừng giữa chừng
   • Ứng dụng chỉ cần cập nhật bản đồ mảnh→máy
```

Đây chính là cách Figma làm: **tách phần logic ra khỏi phần vật lý**. Đầu tiên họ chỉ "chia trên giấy" — các mảnh vẫn nằm chung một máy nhưng đã được đánh số shard. Chạy ổn rồi mới dời từng mảnh sang máy thật. Nhờ vậy họ kiểm tra được kỹ trước khi động vào dữ liệu thật.

## Chọn shard key: quyết định gần như vĩnh viễn

> **Chọn nhầm shard key, muốn đổi sang cột khác, bạn gần như phải làm lại toàn bộ cuộc di cư từ đầu.**

Bốn tiêu chí, xếp theo độ quan trọng:

```text
① PHÂN BỐ ĐỀU
   Không có giá trị nào chiếm phần áp đảo.
   ❌ shard theo country_code: Việt Nam chiếm 80% → một shard gánh 80% tải
   ❌ shard theo created_at: mọi ghi mới dồn vào shard cuối (hot shard)

② XUẤT HIỆN TRONG HẦU HẾT QUERY
   Nếu query không có shard key, proxy phải hỏi TẤT CẢ shard rồi gộp
   → gọi là scatter-gather, đắt gấp N lần.

③ GOM ĐƯỢC DỮ LIỆU LIÊN QUAN
   Dữ liệu hay đi cùng nhau nên nằm cùng shard (colocation).

④ ỔN ĐỊNH — KHÔNG BAO GIỜ THAY ĐỔI
   Đổi giá trị shard key nghĩa là di chuyển hàng sang máy khác.
   ❌ shard theo status, theo region của user (user chuyển vùng được)
```

Ứng viên phổ biến theo loại hệ thống:

| Loại hệ thống | Shard key thường dùng | Lý do |
|---|---|---|
| SaaS B2B (nhiều công ty) | `tenant_id` / `org_id` | Query luôn có nó; dữ liệu tự nhiên tách biệt |
| Mạng xã hội, ứng dụng người dùng | `user_id` | Hầu hết query đều theo người dùng |
| Thương mại điện tử | `customer_id` hoặc `seller_id` | Chọn theo bên nào query nhiều hơn |
| Nhắn tin | `conversation_id` | Mọi tin trong một cuộc hội thoại nằm cùng chỗ |
| Figma | `file_id` / `org_id` | Cộng tác diễn ra trong phạm vi một file |
| IoT / metric | `device_id` (hash) | Đều tự nhiên |

**Colocation — chiêu tinh tế của Figma:** những bảng hay đi chung với nhau thì **dùng chung một shard key**.

```sql
-- Cùng shard theo org_id → mọi thứ của một tổ chức nằm cùng máy
files    (file_id, org_id, ...)      SHARD KEY: org_id
comments (comment_id, org_id, ...)   SHARD KEY: org_id
members  (user_id, org_id, ...)      SHARD KEY: org_id

-- Nhờ vậy câu này vẫn chạy TRONG MỘT MÁY:
SELECT f.name, count(c.comment_id)
FROM files f LEFT JOIN comments c ON c.file_id = f.file_id
WHERE f.org_id = 42
GROUP BY 1;
```

Đây là điều **cực kỳ quan trọng**: khi dữ liệu liên quan nằm chung một máy, JOIN và transaction vẫn gọn trong một chỗ, không phải với tay sang máy khác. Mất colocation là mất gần như mọi thứ.

## Lớp định tuyến: giấu độ phức tạp khỏi ứng dụng

Nếu mỗi hàng nằm ở một máy khác nhau, làm sao ứng dụng biết đường mà hỏi? Chẳng lẽ bắt hàng nghìn chỗ trong code tự tính địa chỉ shard?

Đây là mảnh ghép làm cho toàn bộ chuyện này khả thi:

```text
   ┌─────────────┐
   │  Ứng dụng   │  gửi SQL gần như bình thường, y như hồi một database
   └──────┬──────┘
          ▼
   ┌─────────────────────────────────────┐
   │            DB PROXY                 │
   │  ① phân tích câu SQL                │
   │  ② rút ra giá trị shard key         │
   │  ③ tính ra shard đích               │
   │  ④ bắn câu lệnh tới đúng máy đó     │
   │  ⑤ gộp kết quả nếu phải hỏi nhiều   │
   └──┬────────┬────────┬────────┬───────┘
      ▼        ▼        ▼        ▼
   shard0   shard1   shard2   shard3
```

Figma **tự viết lớp sharding này ngay trên PostgreSQL thường của AWS**, thay vì đổi sang một database phân tán lạ. Đó là quyết định giảm rủi ro xuống mức thấp nhất: hạ tầng bên dưới thay đổi long trời lở đất mà code ứng dụng gần như đứng yên.

Các lựa chọn có sẵn nếu bạn không muốn tự viết:

| Công cụ | Nền | Đặc điểm |
|---|---|---|
| **Citus** | PostgreSQL extension | Sharding + phân tán query, chín muồi, thuộc Microsoft |
| **Vitess** | MySQL | YouTube xây, cực trưởng thành, chạy Slack/GitHub |
| **CockroachDB** / **YugabyteDB** | Tương thích Postgres | Phân tán từ đầu, tự động rebalance, vẫn ACID |
| **PgBouncer + code định tuyến** | PostgreSQL | Tự viết, kiểm soát hoàn toàn (cách Figma) |
| **ShardingSphere** | MySQL/PG | Middleware Java |

## Bốn cái giá phải trả — trả mãi mãi

### ① JOIN xuyên shard

```sql
-- Nếu users và orders shard theo hai khoá khác nhau
SELECT u.full_name, o.total_amount
FROM users u JOIN orders o ON o.user_id = u.user_id;
-- → Proxy phải kéo dữ liệu từ MỌI shard về rồi tự join trong bộ nhớ
-- → Chậm, tốn RAM, và không mở rộng được
```

Ba cách xử lý:

```text
① COLOCATION — dùng chung shard key. Cách tốt nhất.
② BẢNG THAM CHIẾU — bảng nhỏ ít đổi (danh mục, tỉnh thành, cấu hình)
   được NHÂN BẢN lên MỌI shard → join cục bộ.
③ PHI CHUẨN HOÁ — chép sẵn cột hay cần (denormalize).
   Đổi lấy: phải cập nhật nhiều chỗ khi giá trị gốc đổi.
```

### ② Transaction xuyên shard

ACID trong một shard vẫn còn. Xuyên shard thì không, trừ khi bạn cài **two-phase commit (2PC)** — vốn chậm và có kịch bản treo khi coordinator chết giữa chừng.

Cách thực tế: thiết kế để **không cần** transaction xuyên shard.

```text
Nếu buộc phải: dùng SAGA
   Chia giao dịch thành các bước cục bộ, mỗi bước có hành động BÙ TRỪ.
   Bước 1: trừ tiền ví (shard A)        ↺ bù: hoàn tiền
   Bước 2: trừ tồn kho (shard B)        ↺ bù: hoàn kho
   Bước 3: tạo đơn (shard C)            ↺ bù: huỷ đơn
   → Không có atomicity thật, chỉ có "nhất quán sau cùng có bù trừ".
   → Ứng dụng phải tự lo idempotency và trạng thái trung gian.
```

### ③ Các đảm bảo hiển nhiên bỗng biến mất

| Thứ bạn coi là hiển nhiên | Sau khi shard |
|---|---|
| `AUTO_INCREMENT` toàn cục | Trùng ID giữa các shard → cần UUID v7 / Snowflake |
| `UNIQUE (email)` | Chỉ duy nhất **trong một shard** → cần dịch vụ kiểm tra riêng |
| Khoá ngoại | Không thi hành được xuyên shard |
| `ORDER BY ... LIMIT 10` toàn cục | Phải lấy top 10 từ **mỗi** shard rồi gộp lại |
| `COUNT(*)` toàn bảng | Phải hỏi mọi shard rồi cộng |
| `OFFSET 1000` | Cực đắt — mỗi shard phải trả về 1010 dòng |

Bài toán `ORDER BY ... LIMIT` xuyên shard đáng nói riêng: để lấy đúng 10 đơn mới nhất toàn hệ thống, proxy phải hỏi **mỗi** shard lấy 10 dòng đầu, rồi gộp 10×N dòng và sắp lại. Với phân trang sâu, chi phí bùng nổ — đây là lý do hệ thống đã shard gần như luôn dùng **keyset pagination** (phase-3 bài 4) thay vì `OFFSET`.

### ④ Hot shard — kẻ phá hoại thầm lặng

```text
Shard theo tenant_id, và một khách hàng doanh nghiệp lớn
chiếm 40% toàn bộ lưu lượng.

→ Shard chứa họ cháy, các shard khác ngồi chơi.
→ Bạn vừa mất toàn bộ lợi ích của sharding, mà vẫn trả đủ chi phí phức tạp.
```

Cách xử lý:
- **Tách riêng tenant lớn** ra shard dành riêng cho họ (dùng directory mapping).
- **Sub-shard**: với tenant lớn, shard thêm một tầng theo `user_id` bên trong.
- **Giám sát phân bố** liên tục, đừng chờ tới lúc cháy.

```sql
-- Đặt câu này vào dashboard: phân bố tải giữa các shard
SELECT shard_id, count(*) AS so_dong,
       round(100.0 * count(*) / sum(count(*)) OVER (), 2) AS phan_tram
FROM shard_map GROUP BY shard_id ORDER BY 2 DESC;
```

## Di trú không downtime: cách Figma làm

```text
GIAI ĐOẠN 1 — Chia trên giấy (logical sharding)
   • Thêm cột shard key vào mọi bảng liên quan
   • Đánh số shard cho từng hàng — nhưng TẤT CẢ vẫn nằm chung một máy
   • Ứng dụng bắt đầu đi qua proxy, proxy tính shard nhưng luôn trỏ về máy cũ
   → Kiểm chứng toàn bộ logic định tuyến mà KHÔNG động vào dữ liệu thật

GIAI ĐOẠN 2 — Chuẩn bị máy mới
   • Dựng shard vật lý mới
   • Bật sao chép logic (logical replication) chỉ cho các mảnh sắp chuyển
   • Chờ replica bắt kịp

GIAI ĐOẠN 3 — Chuyển từng mảnh
   • Khoá ghi cho ĐÚNG mảnh đó (vài trăm mili giây)
   • Chờ replica đồng bộ hoàn toàn
   • Cập nhật bản đồ trong proxy → mảnh này giờ trỏ về máy mới
   • Mở khoá
   → Chỉ người dùng thuộc mảnh đó thấy độ trễ dưới một giây

GIAI ĐOẠN 4 — Dọn dẹp
   • Xoá dữ liệu mảnh đã chuyển khỏi máy cũ
   • Lặp lại cho mảnh tiếp theo
```

Điểm mấu chốt: **giai đoạn 1 tách phần logic ra khỏi phần vật lý**. Bạn kiểm tra được mọi thứ trước khi có bất kỳ dữ liệu nào rời khỏi máy cũ. Đây là bài học vận hành đáng giá nhất của cả câu chuyện.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Shard khi chưa hết nước thang dễ hơn | Gánh độ phức tạp vĩnh viễn mà không cần | Nâng dọc → pool → replica → tách bảng → partition |
| Chọn shard key phân bố lệch | Hot shard, mất toàn bộ lợi ích | Giám sát phân bố ngay từ đầu |
| Chọn shard key không có trong query | Scatter-gather mọi lần đọc | Chọn theo query phổ biến nhất |
| Shard key thay đổi được | Phải di chuyển hàng giữa các máy | Chọn cột bất biến |
| Không colocate bảng liên quan | JOIN xuyên shard, chậm và tốn RAM | Dùng chung shard key |
| Dùng `hash % N` cố định | Đổi số shard = chuyển 94% dữ liệu | Virtual shard hoặc consistent hashing |
| Vẫn dùng auto-increment | Trùng ID giữa các shard | UUID v7 / Snowflake |
| Vẫn dùng `OFFSET` phân trang | Mỗi shard phải trả offset+limit dòng | Keyset pagination |
| Cần transaction xuyên shard thường xuyên | Mô hình dữ liệu sai từ đầu | Thiết kế lại ranh giới shard |
| Không có kế hoạch rebalance | Shard đầy mà không mở rộng được | Virtual shard từ ngày đầu |
| Không nhân bản bảng tham chiếu | Mọi JOIN với bảng danh mục đều xuyên shard | Nhân bản bảng nhỏ lên mọi shard |

## Câu hỏi phỏng vấn hay gặp

**H: Khi nào cần sharding?**
Khi **một bảng đã lớn hơn một cỗ máy** và thông lượng ghi đã chạm trần. Trước đó còn bốn nước thang rẻ hơn nhiều: nâng dọc, connection pool + read replica, tách bảng sang database khác, và partitioning trong một máy. Bài học của Figma không phải "hãy shard" mà là "đừng shard khi các nước dễ hơn vẫn còn chỗ để leo" — vì sharding là nước không quay lại được.

**H: Chọn shard key thế nào?**
Bốn tiêu chí: phân bố đều (không có giá trị nào áp đảo), xuất hiện trong hầu hết query (nếu không thì mọi lần đọc đều scatter-gather), gom được dữ liệu liên quan vào cùng shard, và bất biến. Với SaaS B2B thường là `tenant_id`, với ứng dụng người dùng là `user_id`, với nhắn tin là `conversation_id`. Và quan trọng: chọn nhầm thì đổi gần như phải làm lại toàn bộ cuộc di cư.

**H: Mất gì sau khi shard?**
Bốn thứ. JOIN xuyên shard trở nên rất đắt — giải bằng colocation, nhân bản bảng tham chiếu, hoặc phi chuẩn hoá. Transaction xuyên shard không còn ACID — phải dùng saga với hành động bù trừ. Các đảm bảo hiển nhiên biến mất: auto-increment, `UNIQUE` toàn cục, khoá ngoại, `COUNT(*)` toàn bảng, `OFFSET`. Và hot shard có thể xoá sạch lợi ích trong khi bạn vẫn trả đủ chi phí phức tạp.

**H: Làm sao thêm shard mà không phải chuyển gần hết dữ liệu?**
Đừng dùng `hash % N` cố định — đổi từ 16 lên 17 shard là chuyển ~94% dữ liệu. Dùng **virtual shard**: chia sẵn thành 1024 mảnh logic ngay từ đầu rồi ánh xạ nhóm mảnh vào từng máy vật lý. Mở rộng chỉ là chuyển một phần mảnh logic sang máy mới, chuyển được từng mảnh một và dừng giữa chừng được. Consistent hashing là cách khác cùng mục đích.

**H: Di trú sang sharding mà không downtime thế nào?**
Tách phần logic khỏi phần vật lý. Giai đoạn một: thêm shard key, đánh số mảnh, cho ứng dụng đi qua proxy — nhưng mọi mảnh vẫn nằm chung máy cũ, nên bạn kiểm chứng được toàn bộ logic định tuyến mà chưa động vào dữ liệu. Giai đoạn hai: dựng máy mới, bật sao chép logic cho mảnh sắp chuyển. Giai đoạn ba: khoá ghi cho đúng mảnh đó vài trăm mili giây, chờ đồng bộ, cập nhật bản đồ, mở khoá. Chỉ người dùng thuộc mảnh đó thấy độ trễ dưới một giây.

## Tóm tắt bài 4

- Sharding là **cắt ngang** một bảng ra nhiều máy — nước cờ cuối, sau nâng dọc, pool + replica, tách bảng, và partitioning.
- **Shard key là quyết định gần như vĩnh viễn**: phải phân bố đều, có trong hầu hết query, gom được dữ liệu liên quan, và bất biến.
- Dùng **virtual shard** (1024 mảnh logic → N máy vật lý) thay vì `hash % N`, để mở rộng không phải chuyển gần hết dữ liệu.
- **Colocation** là chìa khoá: bảng hay đi chung dùng chung shard key, để JOIN và transaction vẫn gọn trong một máy.
- Bốn cái giá trả mãi mãi: JOIN xuyên shard, mất ACID xuyên shard (phải dùng saga), mất `UNIQUE`/auto-increment/`COUNT(*)`/`OFFSET` toàn cục, và **hot shard**.
- Bài học vận hành của Figma: **tách phần logic khỏi phần vật lý** — chia trên giấy trước, kiểm chứng xong mới dời dữ liệu thật, và giấu tất cả sau một lớp proxy để code ứng dụng gần như đứng yên.

**Bài kế tiếp** → [Bài 5: Vấn đề N+1 query và ORM](05-van-de-n-cong-1-query-va-orm.md)
