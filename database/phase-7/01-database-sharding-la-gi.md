# Bài 1: Database Sharding — chia dữ liệu ra nhiều máy và mất những gì

Sharding là từ nghe **sang** nhất trong toàn bộ ngành database. Nói "chúng tôi đang shard database" trong một cuộc họp thì nghe rất có trọng lượng.

Nhưng đây là câu nên nhớ trước khi đọc tiếp:

> **Sharding là thứ cuối cùng bạn nên làm, không phải thứ đầu tiên.**

Vì khi shard, bạn **mất** những thứ mà database quan hệ tồn tại để cung cấp: `JOIN`, transaction ACID, ràng buộc duy nhất toàn cục, khoá ngoại. Bạn đánh đổi chúng lấy khả năng vượt qua giới hạn của một máy chủ.

Bài này giải thích sharding hoạt động thế nào, và — quan trọng hơn — **chính xác bạn mất những gì**.

## Sharding là gì

Chia dữ liệu của **một bảng logic** ra **nhiều máy chủ database độc lập**.

```text
   TRƯỚC — MỘT MÁY                    SAU — BA MÁY ĐỘC LẬP
   ═══════════════                     ══════════════════════

   ┌─────────────────┐          ┌────────┐  ┌────────┐  ┌────────┐
   │  MÁY CHỦ DB     │          │ SHARD 1│  │ SHARD 2│  │ SHARD 3│
   │                 │          │ :5432  │  │ :5433  │  │ :5434  │
   │  users          │          │        │  │        │  │        │
   │  100 triệu dòng │          │ users  │  │ users  │  │ users  │
   │  2 TB           │          │ 33 tr. │  │ 33 tr. │  │ 34 tr. │
   │                 │          │ 700 GB │  │ 700 GB │  │ 700 GB │
   └─────────────────┘          └────────┘  └────────┘  └────────┘
                                     ▲           ▲           ▲
                                     └───────────┼───────────┘
                                                 │
                                    ỨNG DỤNG PHẢI BIẾT ĐI ĐÂU
```

Dòng cuối cùng là khác biệt cốt lõi so với partitioning: **không có gì tự động cả**. Không có database nào đứng ở giữa để định tuyến giúp bạn. Ứng dụng (hoặc một lớp proxy bạn tự dựng) phải tự tính ra dữ liệu nằm ở máy nào.

### Shard key — quyết định quan trọng nhất

**Shard key** (khoá phân tán) là cột dùng để quyết định một dòng thuộc về máy nào.

```text
   shard_key = user_id

   user_id = 42     →  hàm định tuyến  →  SHARD 2
   user_id = 88888  →  hàm định tuyến  →  SHARD 1
```

Đây là **quyết định gần như không thể đảo ngược**. Đổi shard key nghĩa là di chuyển toàn bộ dữ liệu giữa các máy. Chọn sai thì bạn sống chung với nó nhiều năm.

---

## Bốn chiến lược định tuyến

### 1. Theo khoảng (range)

```text
   user_id       1 ..  10.000.000  →  SHARD 1
   user_id 10.000.001 ..  20.000.000  →  SHARD 2
   user_id 20.000.001 ..  30.000.000  →  SHARD 3
```

| Ưu | Nhược |
|---|---|
| Đơn giản, dễ hiểu | **Điểm nóng**: người dùng mới luôn dồn vào shard cuối |
| Truy vấn khoảng hiệu quả | Phân bố không đều theo thời gian |
| Thêm shard dễ (thêm khoảng mới) | Shard cũ dần "nguội" trong khi shard mới quá tải |

Điểm nóng là vấn đề thật: nếu `user_id` tăng dần thì **100% lệnh ghi mới** đều vào shard cuối cùng, và ba shard kia chỉ để đọc dữ liệu cũ.

### 2. Theo hàm băm (hash)

```text
   shard = hash(user_id) % 3

   user_id = 42     →  hash = 7749382  →  7749382 % 3 = 1  →  SHARD 2
   user_id = 88888  →  hash = 2211558  →  2211558 % 3 = 0  →  SHARD 1
```

| Ưu | Nhược |
|---|---|
| **Phân bố rất đều** | Mất hoàn toàn khả năng truy vấn khoảng |
| Không có điểm nóng | **Thêm shard = phân bố lại gần hết dữ liệu** ← vấn đề lớn |

Nhược điểm thứ hai nghiêm trọng tới mức nó sinh ra cả một kỹ thuật riêng — mục kế tiếp.

### 3. Theo bảng tra (directory / lookup)

```text
   BẢNG TRA (nằm ở một nơi riêng)
   ┌──────────┬───────┐
   │ user_id  │ shard │
   ├──────────┼───────┤
   │    42    │   2   │
   │  88888   │   1   │
   │  ...     │  ...  │
   └──────────┴───────┘
```

| Ưu | Nhược |
|---|---|
| **Linh hoạt tối đa** — di chuyển từng người dùng được | Bảng tra thành **điểm chết đơn** |
| Xử lý được khách hàng lớn cần shard riêng | Thêm một lần tra cứu cho mọi truy vấn |
| Cân bằng lại dần dần, không cần dừng | Bảng tra phải được nhân bản và cache kỹ |

Đây là cách các hệ SaaS nhiều khách hàng (multi-tenant) hay dùng: mỗi khách hàng lớn có thể được đặt vào shard riêng.

### 4. Theo địa lý (geo)

```text
   Khách Việt Nam    →  SHARD Singapore
   Khách châu Âu     →  SHARD Frankfurt
   Khách Bắc Mỹ      →  SHARD Virginia
```

| Ưu | Nhược |
|---|---|
| **Độ trễ thấp** cho người dùng | Phân bố rất không đều theo thị trường |
| Đáp ứng yêu cầu chủ quyền dữ liệu (GDPR) | Người dùng chuyển vùng thì xử lý thế nào |

---

## Băm nhất quán — giải bài toán "thêm shard"

Đây là kỹ thuật đáng học kỹ nhất của bài, vì nó xuất hiện ở khắp nơi: Cassandra, DynamoDB, Redis Cluster, memcached, CDN, cân bằng tải.

### Vì sao `% N` gãy

```text
   3 SHARD:  shard = hash(key) % 3

   key='a' → hash=100 → 100 % 3 = 1  →  SHARD 1
   key='b' → hash=101 → 101 % 3 = 2  →  SHARD 2
   key='c' → hash=102 → 102 % 3 = 0  →  SHARD 0

   THÊM MỘT SHARD → shard = hash(key) % 4

   key='a' → 100 % 4 = 0  →  SHARD 0   ĐỔI CHỖ ✘
   key='b' → 101 % 4 = 1  →  SHARD 1   ĐỔI CHỖ ✘
   key='c' → 102 % 4 = 2  →  SHARD 2   ĐỔI CHỖ ✘
```

Tổng quát: đi từ `N` shard lên `N+1` shard thì **khoảng `N/(N+1)` lượng dữ liệu phải chuyển chỗ**.

```text
   3 →  4 shard:  75% dữ liệu phải di chuyển
   9 → 10 shard:  90% dữ liệu phải di chuyển
```

Với 2 TB dữ liệu, chuyển 90% nghĩa là **1,8 TB đi qua mạng** trong khi hệ thống vẫn phải phục vụ. Trong thực tế, điều này khiến việc thêm shard trở nên gần như bất khả thi.

### Ý tưởng của vòng băm

Thay vì băm khoá **thành số shard**, hãy băm cả khoá **lẫn shard** vào cùng một **vòng tròn**:

```text
                        0 / 2³²
                    ┌──────●──────┐
              ┌─────┘             └─────┐
         SHARD A                        │
           ●                            │
          ┌┘                            └┐
          │        VÒNG BĂM              │  ● SHARD B
          │      (0 → 2³² − 1)           │
          └┐                            ┌┘
           │                            │
           │        ● SHARD C           │
           └─────┐             ┌────────┘
                 └─────────────┘

   QUY TẮC ĐỊNH TUYẾN:
     Băm khoá → được một điểm trên vòng
     → Đi THEO CHIỀU KIM ĐỒNG HỒ tới shard đầu tiên gặp được
     → Khoá thuộc về shard đó
```

Bây giờ thêm một shard:

```text
   TRƯỚC                                SAU khi thêm SHARD D
   ───────────────────────              ──────────────────────────
        A                                    A
        ●                                    ●
                                                  ● D   ← chèn vào đây
        ● B                                  ● B
        ● C                                  ● C

   Chỉ những khoá nằm GIỮA C VÀ D phải chuyển sang D.
   Mọi khoá khác GIỮ NGUYÊN.

   → Chỉ ~1/N dữ liệu di chuyển, thay vì N/(N+1)
```

```text
   3 → 4 shard:   modulo:  75% di chuyển
                  vòng băm: ~25% di chuyển     → ÍT HƠN 3 LẦN

   9 → 10 shard:  modulo:  90% di chuyển
                  vòng băm: ~10% di chuyển     → ÍT HƠN 9 LẦN
```

### Nút ảo — chữa lỗi phân bố không đều

Vòng băm thuần có một vấn đề: với ít shard, chúng có thể rơi vào các vị trí lệch, khiến một shard gánh phần vòng lớn hơn nhiều.

```text
   PHÂN BỐ LỆCH                        CHỮA BẰNG NÚT ẢO
   ═════════════                       ══════════════════
        A ●●  B                        Mỗi shard xuất hiện 150 LẦN
             ↑                         trên vòng, ở các vị trí băm khác nhau:
        A và B rất gần nhau                A₁ B₃ C₂ A₇ C₉ B₁ A₄ C₅ B₈ ...
        → C phải gánh 80% vòng
                                       → phân bố xấp xỉ đều
        ● C                            → khi thêm/bớt shard, phần chuyển
                                         cũng được rải đều
```

Con số thực tế: **100-200 nút ảo mỗi shard vật lý** cho phân bố lệch dưới vài phần trăm. Cassandra mặc định 256, Redis Cluster dùng cơ chế tương tự với 16.384 khe.

Cài đặt tối giản:

```javascript
const crypto = require('crypto');

class VongBam {
    constructor(soNutAo = 150) {
        this.soNutAo = soNutAo;
        this.vong    = new Map();   // vị trí băm -> tên shard
        this.viTriSapXep = [];
    }

    bam(chuoi) {
        return parseInt(
            crypto.createHash('md5').update(chuoi).digest('hex').slice(0, 8),
            16
        );
    }

    themShard(tenShard) {
        for (let i = 0; i < this.soNutAo; i++) {
            this.vong.set(this.bam(`${tenShard}#${i}`), tenShard);
        }
        this.viTriSapXep = [...this.vong.keys()].sort((a, b) => a - b);
    }

    timShard(khoa) {
        const h = this.bam(khoa);
        // đi theo chiều kim đồng hồ: vị trí đầu tiên >= h
        for (const vt of this.viTriSapXep) {
            if (vt >= h) return this.vong.get(vt);
        }
        return this.vong.get(this.viTriSapXep[0]);   // vòng lại đầu
    }
}
```

Đo hiệu quả bằng chính đoạn code đó:

```javascript
const vong = new VongBam();
['shard-1', 'shard-2', 'shard-3'].forEach(s => vong.themShard(s));

const truoc = new Map();
for (let i = 0; i < 100000; i++) truoc.set(`user:${i}`, vong.timShard(`user:${i}`));

vong.themShard('shard-4');

let doiCho = 0;
for (const [k, v] of truoc) if (vong.timShard(k) !== v) doiCho++;
console.log(`Doi cho: ${(doiCho / 1000).toFixed(1)}%`);
```

```text
Đổi chỗ: 24.8%
```

So với 75% của phép chia lấy dư. Trên 2 TB dữ liệu, đó là chênh lệch giữa **500 GB** và **1,5 TB** phải di chuyển.

---

## Bạn mất gì khi shard

Đây là phần quan trọng nhất của bài.

### Mất 1 — `JOIN` xuyên shard

```sql
-- Trên một database: bình thường
SELECT u.name, o.total
FROM users u JOIN orders o ON o.user_id = u.id
WHERE u.city = 'Ha Noi';
```

Nếu `users` và `orders` được shard theo `user_id`, và bạn cần join theo một cột **khác**, thì:

```text
   Database không thể tự join dữ liệu nằm ở hai tiến trình khác nhau.

   ỨNG DỤNG PHẢI TỰ LÀM:
      1. Truy vấn shard 1  → nhận về danh sách
      2. Truy vấn shard 2  → nhận về danh sách
      3. Truy vấn shard 3  → nhận về danh sách
      4. TỰ GỘP VÀ GHÉP TRONG BỘ NHỚ ỨNG DỤNG

   → Chậm, tốn RAM, phải tự viết, và không dùng được index để join.
```

Cách giảm nhẹ: **nhân đôi dữ liệu ít đổi**. Ví dụ chép bảng danh mục sản phẩm sang **mọi** shard, để join cục bộ được. Đổi lại phải giữ chúng đồng bộ.

### Mất 2 — Transaction ACID xuyên shard

```sql
-- Trên một database: nguyên tử, đảm bảo
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;   -- shard 1
UPDATE accounts SET balance = balance + 100 WHERE id = 2;   -- shard 3
COMMIT;
```

Hai câu này chạy trên **hai tiến trình database khác nhau**. Không có `COMMIT` chung. Nếu shard 1 thành công còn shard 3 chết, bạn có đúng tình huống **100 nghìn bốc hơi** ở [phase-2 bài 1](../phase-2/01-acid-va-transaction.md) — nhưng lần này database không cứu được.

Ba lối thoát, không lối nào miễn phí:

| Cách | Là gì | Cái giá |
|---|---|---|
| **2PC** (two-phase commit) | Điều phối viên hỏi "sẵn sàng chưa?" rồi mới ra lệnh commit | Chậm, và nếu điều phối viên chết giữa chừng thì kẹt khoá |
| **Saga** | Chuỗi transaction cục bộ, mỗi bước có một bước bù trừ | Không có cô lập; trạng thái trung gian nhìn thấy được |
| **Thiết kế để không cần** | Đặt mọi dữ liệu liên quan **vào cùng một shard** | Ràng buộc thiết kế mô hình dữ liệu từ đầu |

Cách thứ ba là cách tốt nhất, và nó dẫn tới nguyên tắc quan trọng nhất khi chọn shard key — mục sau.

### Mất 3 — Ràng buộc duy nhất toàn cục

```sql
CREATE TABLE users (email TEXT UNIQUE);
```

Ràng buộc này chỉ có hiệu lực **trong từng shard**. Hai người có thể đăng ký cùng một email trên hai shard khác nhau, và không gì ngăn được.

Cách xử lý:

```text
   • Shard THEO CHÍNH cột cần duy nhất (shard theo email)
     → nhưng khi đó không shard theo user_id được nữa

   • Dựng một dịch vụ riêng giữ bảng "email đã dùng"
     → thêm một điểm chết đơn và một lần gọi mạng cho mỗi lần đăng ký

   • Chấp nhận và dọn dẹp về sau
     → chỉ chấp nhận được với dữ liệu không quan trọng
```

### Mất 4 — Khoá ngoại

Không có khoá ngoại nào trỏ được sang máy khác. Mọi toàn vẹn tham chiếu chuyển sang trách nhiệm của ứng dụng — và như [phase-2 bài 4](../phase-2/04-consistency-va-eventual-consistency.md) đã nói, dữ liệu mồ côi **không tự khỏi**.

### Mất 5 — Tổng hợp toàn cục

```sql
SELECT count(*) FROM users;                    -- phải hỏi MỌI shard rồi cộng
SELECT * FROM users ORDER BY created_at LIMIT 10;  -- khó hơn nhiều
```

Câu thứ hai đáng nói: để lấy 10 dòng mới nhất **toàn cục**, bạn phải lấy 10 dòng mới nhất **từ mỗi shard** (30 dòng), gộp lại, sắp xếp, rồi lấy 10. Với `OFFSET` thì còn tệ hơn nhiều — `LIMIT 10 OFFSET 1000` đòi lấy 1.010 dòng từ **mỗi** shard.

### Mất 6 — Truy vấn không có shard key

```sql
SELECT * FROM users WHERE email = 'a@b.com';   -- shard theo user_id
```

Không biết email này thuộc user nào → không biết shard nào → **phải hỏi tất cả**. Gọi là *scatter-gather* (rải rồi gom).

```text
   ĐỘ TRỄ = ĐỘ TRỄ CỦA SHARD CHẬM NHẤT, không phải trung bình.

   3 shard, mỗi cái trung bình 5 ms nhưng thỉnh thoảng 200 ms
   → xác suất ít nhất một shard chậm tăng theo số shard
   → 10 shard: gần như MỌI truy vấn đều gặp một shard chậm
```

Đây là hiện tượng "đuôi trễ" (*tail latency amplification*) — càng nhiều shard thì càng tệ.

---

## Bảng đối chiếu: một máy vs partitioning vs sharding

| | Một máy | Partitioning | Sharding |
|---|---|---|---|
| Số máy chủ | 1 | 1 | **N** |
| Ứng dụng phải biết | Không | Không | **Có** |
| `JOIN` | ✔ | ✔ | ✘ (phải tự làm) |
| Transaction ACID | ✔ | ✔ | ✘ (2PC hoặc Saga) |
| `UNIQUE` toàn cục | ✔ | ✔ (nếu chứa khoá) | ✘ |
| Khoá ngoại | ✔ | ✔ | ✘ |
| Vượt giới hạn CPU/RAM một máy | ✘ | ✘ | **✔** |
| Vượt giới hạn đĩa một máy | ✘ | Một phần | **✔** |
| Độ khó vận hành | Thấp | Vừa | **Rất cao** |
| Quay đầu được không | — | Được | **Gần như không** |

## Nguyên tắc chọn shard key

Ba tiêu chí, xếp theo mức độ quan trọng:

### 1. Xuất hiện trong hầu hết truy vấn

Nếu 90% truy vấn có `WHERE user_id = ?` thì shard theo `user_id`. Truy vấn nào không có shard key sẽ phải rải-gom, và đó là thứ bạn muốn hiếm.

### 2. Gom được dữ liệu liên quan vào cùng shard

Đây là cách **tránh được** phần lớn thiệt hại ở mục "bạn mất gì":

```text
   SHARD THEO user_id, VÀ ĐẶT MỌI BẢNG LIÊN QUAN CÙNG KHOÁ ĐÓ:

   users(user_id, ...)         →  shard theo user_id
   orders(user_id, ...)        →  shard theo user_id   ← cùng shard với user
   addresses(user_id, ...)     →  shard theo user_id
   payment_methods(user_id,...)→  shard theo user_id

   → JOIN giữa chúng: CỤC BỘ, chạy được bình thường  ✔
   → Transaction giữa chúng: CỤC BỘ, ACID đầy đủ    ✔
```

Khái niệm này gọi là **nhóm cùng vị trí** (*colocation*), và nó là kỹ thuật quan trọng nhất để sharding sống được. Citus gọi nó là *distribution column*, MongoDB gọi là *shard key* trong cùng chunk.

### 3. Phân bố đều, không có giá trị siêu lớn

```text
   SHARD THEO tenant_id trong hệ SaaS:

   tenant A: 50 người dùng        →  shard 1
   tenant B: 30 người dùng        →  shard 2
   tenant C: 8.000.000 người dùng →  shard 3   ← SHARD NÓNG
                                                 gánh 99% tải
```

Đây là **shard nóng** (*hot shard*), và nó khiến toàn bộ công sức sharding trở nên vô nghĩa: bạn vẫn bị giới hạn bởi một máy, chỉ là bây giờ phức tạp hơn.

Cách xử lý: dùng **khoá phức** (`tenant_id + user_id`) cho các tenant lớn, hoặc dùng chiến lược bảng tra để tách riêng tenant khổng lồ ra cụm riêng.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Shard khi chưa leo hết thang scale | Trả giá cực lớn cho vấn đề lẽ ra giải rẻ hơn nhiều | Xem [bài 3](03-pros-cons-va-khi-nao-dung-sharding.md) |
| Dùng `hash % N` để định tuyến | Thêm shard = di chuyển 75-90% dữ liệu | **Băm nhất quán** có nút ảo |
| Chọn shard key ít xuất hiện trong truy vấn | Hầu hết truy vấn phải rải-gom | Chọn theo `pg_stat_statements` |
| Không nhóm cùng vị trí các bảng liên quan | Mất `JOIN` và transaction ngay cả khi lẽ ra giữ được | Mọi bảng liên quan dùng **cùng** shard key |
| Shard key có giá trị siêu lớn (tenant khổng lồ) | Shard nóng gánh gần hết tải | Khoá phức, hoặc tách tenant lớn ra cụm riêng |
| Quên rằng độ trễ = shard chậm nhất | Đuôi trễ tệ đi theo số shard | Giảm tối đa số truy vấn rải-gom |
| Nghĩ có thể đổi shard key về sau | Đổi = di chuyển toàn bộ dữ liệu | Coi như quyết định vĩnh viễn, thiết kế kỹ từ đầu |

## Tóm tắt bài 1

- **Sharding chia dữ liệu ra nhiều máy chủ độc lập**, và khác partitioning ở chỗ **ứng dụng phải tự biết đi đâu**.
- Bốn chiến lược định tuyến: **khoảng** (dễ nhưng có điểm nóng), **băm** (đều nhưng khó thêm shard), **bảng tra** (linh hoạt nhất, có điểm chết đơn), **địa lý** (độ trễ thấp, phân bố lệch).
- `hash % N` gãy vì thêm một shard làm **75-90% dữ liệu phải di chuyển**. **Băm nhất quán** giảm xuống còn **~1/N**, và **nút ảo** (100-200 mỗi shard) làm phân bố đều.
- **Bạn mất sáu thứ**: `JOIN` xuyên shard, transaction ACID, `UNIQUE` toàn cục, khoá ngoại, tổng hợp toàn cục, và truy vấn không có shard key (phải rải-gom).
- **Độ trễ của truy vấn rải-gom bằng độ trễ của shard chậm nhất** — càng nhiều shard thì đuôi trễ càng tệ.
- Chọn shard key theo ba tiêu chí: **xuất hiện trong hầu hết truy vấn** → **gom được dữ liệu liên quan cùng chỗ** → **phân bố đều**.
- **Nhóm cùng vị trí** (đặt mọi bảng liên quan cùng shard key) là kỹ thuật quan trọng nhất để giữ lại `JOIN` và transaction — nó biến phần lớn "mất mát" ở trên thành không xảy ra.

**Bài kế tiếp** → [Bài 2: Sharding thực hành với Node.js và PostgreSQL](02-sharding-thuc-hanh-nodejs-postgres.md)
