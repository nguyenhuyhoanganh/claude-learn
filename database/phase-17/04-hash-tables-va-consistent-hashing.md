# Bài 5: Hash Tables và Consistent Hashing

Bảng băm là cấu trúc dữ liệu cơ bản nhất trong khoa học máy tính, và cũng là cấu trúc bị hiểu nông nhất. Bài này đi từ cách nó hoạt động bên trong, qua chỗ nó được dùng trong database, tới **băm nhất quán** — biến thể giải quyết bài toán mà bảng băm thường bó tay.

## Bảng băm hoạt động thế nào

```text
   Hàm băm h(khoá) → một số → chia lấy dư cho số ô → vị trí

   h("user:42")  = 8842119  →  8842119 % 8 = 7  →  o 7
   h("user:88")  = 1204883  →  1204883 % 8 = 3  →  o 3

   ┌───┬───┬───┬─────────┬───┬───┬───┬─────────┐
   │ 0 │ 1 │ 2 │  user:88│ 4 │ 5 │ 6 │  user:42│
   └───┴───┴───┴─────────┴───┴───┴───┴─────────┘

   → Tra cứu: O(1) — một phép băm, một lần truy cập
```

### Va chạm — điều luôn xảy ra

Hai khoá khác nhau cho cùng một ô. Điều này **không tránh được** (nguyên lý chuồng bồ câu), chỉ có cách xử lý:

```text
   PHƯƠNG PHÁP 1 — NỐI CHUỖI (chaining)
   ┌───┬───┬─────────────────────────┐
   │ 0 │ 1 │ user:42 → user:99 → ... │  ← danh sách liên kết trong một ô
   └───┴───┴─────────────────────────┘
   ✔ Đơn giản, xoá dễ
   ✘ Con trỏ tản mát → kém thân thiện với CPU cache

   PHƯƠNG PHÁP 2 — ĐỊA CHỈ MỞ (open addressing)
   ô đầy rồi → thử ô kế tiếp
   ┌───┬─────────┬─────────┬───┐
   │ 0 │ user:42 │ user:99 │ 3 │  ← user:99 lẽ ra ở ô 1, bị đẩy sang ô 2
   └───┴─────────┴─────────┴───┘
   ✔ Dữ liệu liên tục → CPU cache rất tốt
   ✘ Xoá phức tạp (phải đánh dấu "bia mộ")
   ✘ Xuống cấp nhanh khi bảng gần đầy
```

Java `HashMap` dùng nối chuỗi (và chuyển sang cây đỏ-đen khi chuỗi quá dài); Python `dict` và Go `map` dùng biến thể của địa chỉ mở.

### Hệ số tải và việc mở rộng

```text
   he_so_tai = so_phan_tu / so_o

   0,5  →  ít va chạm, nhanh, tốn bộ nhớ
   0,75 →  cân bằng (mặc định của Java HashMap)
   0,9  →  tiết kiệm bộ nhớ, nhiều va chạm
   1,0+ →  với địa chỉ mở: XUỐNG CẤP THẢM HẠI

   Vượt ngưỡng → PHÓNG TO: cấp bảng mới GẤP ĐÔI, BĂM LẠI MỌI PHẦN TỬ
   → O(n), và gây KHỰNG đột ngột
```

Đây là lý do các hệ nhạy cảm với độ trễ dùng **phóng to tăng dần** (rehash dần dần qua nhiều thao tác) thay vì phóng to một lần — Redis làm đúng như vậy.

## Bảng băm trong database

### Hash Join

```sql
EXPLAIN SELECT * FROM orders o JOIN users u ON u.id = o.user_id;
```

```text
Hash Join  (cost=3854.00..28471.11 rows=1000000 width=48)
  Hash Cond: (o.user_id = u.id)
  ->  Seq Scan on orders o
  ->  Hash  (cost=1834.00..1834.00 rows=100000 width=24)
        Buckets: 131072  Batches: 1  Memory Usage: 6242kB
        ->  Seq Scan on users u
```

```text
   CÁCH LÀM:
     1. Quét bảng NHỎ HƠN (users) → dựng BẢNG BĂM trong RAM
     2. Quét bảng LỚN HƠN (orders) → mỗi dòng, tra bảng băm
   → O(n + m) thay vì O(n × m)
```

Ba dòng cần đọc trong kế hoạch:

```text
   Buckets: 131072       → số ô của bảng băm
   Batches: 1            → CHỈ MỘT lô → vừa trong work_mem  ✔
   Memory Usage: 6242kB  → bảng băm chiếm 6 MB
```

Khi `Batches > 1` thì có vấn đề:

```text
Batches: 16  Memory Usage: 4096kB
        ▲
   work_mem KHÔNG ĐỦ → phải chia 16 lô, GHI RA ĐĨA rồi đọc lại
   → chậm hơn nhiều
```

Chữa: tăng `work_mem` **cho truy vấn đó** (`SET LOCAL`), không phải toàn cục — nhớ bẫy ở [phase-17 bài 2](01-luu-tru-du-lieu-va-kien-truc-postgres.md).

### Hash Index

```sql
CREATE INDEX idx_hash ON users USING HASH (email);
```

| | Hash Index | B-Tree Index |
|---|---|---|
| `=` | **Nhanh, O(1)** | O(log n) |
| `<`, `>`, `BETWEEN` | **Không hỗ trợ** | Hỗ trợ |
| `ORDER BY` | **Không** | Hỗ trợ |
| `LIKE 'abc%'` | **Không** | Hỗ trợ |
| Kích thước | Nhỏ hơn với khoá dài | Chuẩn |
| Trước PG10 | **Không ghi WAL** — mất sau sự cố | An toàn |

Thực tế: **B-Tree gần như luôn là lựa chọn đúng**. Hash index chỉ hơn khi khoá rất dài (URL, chuỗi băm) và chỉ bao giờ dùng `=`.

Với khoá rất dài, có cách tốt hơn cả hai:

```sql
-- Đánh index trên BĂM của cột, thay vì trên chính cột
CREATE INDEX idx_url_hash ON pages (md5(url));
SELECT * FROM pages WHERE md5(url) = md5('https://rat/dai/...');
```

Index này nhỏ hơn nhiều (32 byte thay vì có thể hàng nghìn byte), và vẫn dùng được B-Tree.

### Hash Partitioning và Hash Aggregate

```sql
CREATE TABLE users (...) PARTITION BY HASH (user_id);
```

```sql
EXPLAIN SELECT status, count(*) FROM orders GROUP BY status;
```

```text
HashAggregate  (cost=22709.00..22709.03 rows=3 width=16)
  Group Key: status
```

`HashAggregate` gom nhóm bằng bảng băm — nhanh hơn `GroupAggregate` (phải sắp xếp trước) khi số nhóm nhỏ.

---

# Băm nhất quán

## Vấn đề mà `% N` gây ra

```text
   3 MÁY:  vi_tri = hash(khoa) % 3

   key='a' → 100 % 3 = 1  →  MAY 1
   key='b' → 101 % 3 = 2  →  MAY 2

   THÊM MỘT MÁY → hash(khoa) % 4

   key='a' → 100 % 4 = 0  →  MÁY 0   ĐỔI CHỖ ✘
   key='b' → 101 % 4 = 1  →  MÁY 1   ĐỔI CHỖ ✘

   → Đi từ N lên N+1 máy: khoảng N/(N+1) dữ liệu PHẢI DI CHUYỂN
      3 →  4 máy:  75%
      9 → 10 máy:  90%
```

Với 2 TB dữ liệu, chuyển 90% nghĩa là **1,8 TB đi qua mạng** trong khi hệ thống vẫn phải phục vụ. Với cache, nó nghĩa là **mất gần hết cache cùng lúc** — và database bên dưới lãnh trọn cú sốc.

## Vòng băm

```text
                        0 / 2³²
                    ┌──────●──────┐
              ┌─────┘             └─────┐
         MAY A                          │
           ●                            │
          ┌┘                            └┐
          │        VÒNG BĂM              │  ● MÁY B
          │      (0 → 2³² − 1)           │
          └┐                            ┌┘
           │        ● MAY C             │
           └─────┐             ┌────────┘
                 └─────────────┘

   ĐỊNH TUYẾN:
     băm khoá → được một điểm trên vòng
     → đi THEO CHIỀU KIM ĐỒNG HỒ tới máy ĐẦU TIÊN gặp được
```

Thêm một máy:

```text
   TRƯỚC                     SAU khi thêm MÁY D
   ─────                     ──────────────────
     A                          A
     ●                          ●
                                     ● D   ← chèn vào đây
     ● B                        ● B
     ● C                        ● C

   Chỉ khoá nằm GIỮA C VÀ D phải chuyển sang D.
   Mọi khoá khác GIỮ NGUYÊN.

   → ~1/N dữ liệu di chuyển, thay vì N/(N+1)
```

## Nút ảo — chữa phân bố lệch

```text
   VẤN ĐỀ: với ít máy, chúng có thể rơi vào vị trí lệch
        A ●●  B          → C phải gánh 80% vòng
             ↑
        ● C

   GIẢI: mỗi máy xuất hiện 100-200 LẦN trên vòng,
         ở các vị trí băm khác nhau

        A₁ B₃ C₂ A₇ C₉ B₁ A₄ C₅ B₈ ...
   → phân bố xấp xỉ đều
   → khi thêm/bớt máy, phần chuyển cũng được RẢI ĐỀU
```

Con số thực tế: **150-256 nút ảo mỗi máy vật lý** cho độ lệch dưới vài phần trăm.

## Cài đặt và đo

```python
import hashlib, bisect

class VongBam:
    def __init__(self, so_nut_ao=150):
        self.so_nut_ao = so_nut_ao
        self.vong = {}          # vi_tri_bam -> ten_may
        self.vi_tri = []        # danh sách vị trí ĐÃ SẮP XẾP

    def _bam(self, s):
        return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)

    def them_may(self, ten):
        for i in range(self.so_nut_ao):
            vt = self._bam(f"{ten}#{i}")
            self.vong[vt] = ten
            bisect.insort(self.vi_tri, vt)      # giữ danh sách đã sắp

    def xoa_may(self, ten):
        for i in range(self.so_nut_ao):
            vt = self._bam(f"{ten}#{i}")
            del self.vong[vt]
            self.vi_tri.remove(vt)

    def tim_may(self, khoa):
        if not self.vi_tri:
            return None
        h = self._bam(khoa)
        idx = bisect.bisect_right(self.vi_tri, h)    # TÌM NHỊ PHÂN — O(log n)
        if idx == len(self.vi_tri):
            idx = 0                                  # vòng lại đầu
        return self.vong[self.vi_tri[idx]]
```

Chú ý `bisect` — tìm nhị phân trên mảng đã sắp. Với 10 máy × 150 nút ảo = 1.500 vị trí, duyệt tuyến tính cho mỗi lần tra là lãng phí rõ ràng.

```python
# ĐO
vong = VongBam(so_nut_ao=150)
for m in ['may1', 'may2', 'may3']:
    vong.them_may(m)

khoa = [f"user:{i}" for i in range(100_000)]
truoc = {k: vong.tim_may(k) for k in khoa}

# Phân bố trước khi thêm
from collections import Counter
print("Trước:", Counter(truoc.values()))

vong.them_may('may4')
doi_cho = sum(1 for k in khoa if vong.tim_may(k) != truoc[k])
print(f"Phải di chuyển: {doi_cho/len(khoa)*100:.1f}%")
print("Sau  :", Counter(vong.tim_may(k) for k in khoa))
```

```text
Trước: Counter({'may2': 34118, 'may1': 33442, 'may3': 32440})
Phải di chuyển: 24.8%
Sau  : Counter({'may2': 25883, 'may4': 24812, 'may1': 24771, 'may3': 24534})
```

```text
   `% N`        :  75,0% phải di chuyển
   Vòng băm     :  24,8% phải di chuyển     → ÍT HƠN 3 LẦN
   Độ lệch phân bố:  dưới 3%                → chấp nhận được
```

So sánh với `% N`:

```python
def modulo(khoa, n):
    return int(hashlib.md5(khoa.encode()).hexdigest()[:8], 16) % n

doi = sum(1 for k in khoa if modulo(k, 3) != modulo(k, 4))
print(f"Modulo — phải di chuyển: {doi/len(khoa)*100:.1f}%")
```

```text
Modulo — phải di chuyển: 74.9%
```

## Nó được dùng ở đâu

| Hệ | Cách dùng |
|---|---|
| **Cassandra** | Vòng băm với 256 nút ảo mỗi nút (`num_tokens`) |
| **DynamoDB** | Vòng băm (nền tảng từ bài báo Dynamo 2007) |
| **Redis Cluster** | **16.384 khe** — biến thể rời rạc của cùng ý tưởng |
| **Memcached** | Ở tầng **client**, thư viện tự cài |
| **Nginx** | `hash $request_uri consistent;` |
| **HAProxy** | `balance hash` với `hash-type consistent` |
| **CDN** | Chọn máy chủ biên cho từng nội dung |

### Redis Cluster — vì sao 16.384 khe

```text
   Thay vì vòng liên tục, Redis dùng 16.384 KHE RỜI RẠC:
     khe = CRC16(khoá) mod 16384

   Vì sao con số này?
     • ĐỦ NHỎ để bảng khe vừa trong gói tin trao đổi giữa các nút
       (16.384 bit = 2 KB dạng bitmap)
     • ĐỦ LỚN để chia mịn cho hàng trăm nút

   Ưu điểm so với vòng liên tục:
     → di chuyển theo TỪNG KHE, kiểm soát được từng bước
     → biết chính xác đang di chuyển cái gì
```

### Cassandra — nút ảo

```yaml
# cassandra.yaml
num_tokens: 256      # số nút ảo mỗi nút vật lý
```

```text
   256 nút ảo cho phân bố rất đều,
   và khi thêm nút mới, dữ liệu được kéo về TỪ NHIỀU NÚT CÙNG LÚC
   → nhanh hơn nhiều so với kéo từ một nút
```

## Băm nhất quán có giới hạn ràng buộc

Biến thể quan trọng: nếu chỉ dùng vòng băm thuần, một máy có thể bị dồn quá tải (khoá nóng). **Bounded-load consistent hashing** thêm một trần:

```text
   Nếu máy đích đã vượt (1 + ε) × tai_trung_binh
     → đi tiếp theo chiều kim đồng hồ tới máy kế tiếp

   → đảm bảo không máy nào quá tải quá ε
   → đổi lại: một số khoá không ở "đúng" máy của nó
```

Google dùng biến thể này trong hạ tầng cân bằng tải của họ.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `hash % N` cho cache/shard | Thêm một máy = mất 75-90% cache cùng lúc → database lãnh cú sốc | Băm nhất quán |
| Không dùng nút ảo | Phân bố lệch nghiêm trọng với ít máy | 150-256 nút ảo mỗi máy |
| Duyệt tuyến tính vòng băm | Chậm với hàng nghìn nút ảo | Tìm nhị phân (`bisect`) trên mảng đã sắp |
| Dùng hàm băm không đều (như `hash()` của Python) | Phân bố lệch; và Python còn ngẫu nhiên hoá theo phiên | MD5/SHA1/xxHash — nhất quán giữa các tiến trình |
| Hash index cho truy vấn khoảng | Hash không hỗ trợ `<`, `>`, `ORDER BY` | B-Tree |
| Bỏ qua `Batches > 1` trong Hash Join | Bảng băm tràn ra đĩa, chậm hơn nhiều | Tăng `work_mem` bằng `SET LOCAL` |
| Không tính khoá nóng | Một máy quá tải dù phân bố khoá đều | Bounded-load, hoặc tách riêng khoá nóng |

## Tóm tắt bài 5

- Bảng băm cho tra cứu **O(1)** nhưng **va chạm luôn xảy ra**; hai cách xử lý là **nối chuỗi** (đơn giản, kém thân thiện với cache CPU) và **địa chỉ mở** (cache tốt, xoá phức tạp).
- Vượt hệ số tải thì phải **phóng to và băm lại mọi phần tử** — O(n) và gây khựng đột ngột. Redis dùng **phóng to tăng dần** để tránh.
- Trong database, bảng băm xuất hiện ở **Hash Join**, **Hash Index**, **Hash Partitioning**, **HashAggregate**. Dòng **`Batches > 1`** trong `EXPLAIN` là dấu hiệu `work_mem` không đủ.
- **Hash index gần như luôn thua B-Tree.** Với khoá rất dài, cách tốt hơn cả hai là **index B-Tree trên `md5(cột)`**.
- **`hash % N` gãy** vì đi từ N lên N+1 máy làm **75-90% dữ liệu phải di chuyển** — với cache, đó là mất gần hết cache cùng lúc.
- **Vòng băm** giảm xuống còn **~1/N**, và **nút ảo** (150-256 mỗi máy) làm phân bố đều. Đo thật: 74,9% → **24,8%**, độ lệch dưới 3%.
- **Redis Cluster dùng 16.384 khe rời rạc** thay vì vòng liên tục — đủ nhỏ để bảng khe vừa trong gói tin trao đổi, đủ lớn để chia mịn, và cho phép di chuyển từng khe có kiểm soát.
- **Bounded-load consistent hashing** thêm trần tải để không máy nào quá tải vì khoá nóng.

**Bài kế tiếp** → [Bài 6: Indexing - PostgreSQL vs MySQL](05-indexing-postgres-vs-mysql.md)
