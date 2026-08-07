# Bài 5: Hash Tables và Consistent Hashing

Bảng băm là cấu trúc dữ liệu cơ bản nhất trong khoa học máy tính, và cũng là cấu trúc bị hiểu nông nhất. Bài này đi từ cách nó hoạt động bên trong, qua chỗ nó được dùng trong database, tới **băm nhất quán** — biến thể giải quyết bài toán mà bảng băm thường bó tay.

## Bảng băm hoạt động thế nào

```text
   Ham bam h(khoa) → mot so → chia lay du cho so o → vi tri

   h("user:42")  = 8842119  →  8842119 % 8 = 7  →  o 7
   h("user:88")  = 1204883  →  1204883 % 8 = 3  →  o 3

   ┌───┬───┬───┬─────────┬───┬───┬───┬─────────┐
   │ 0 │ 1 │ 2 │  user:88│ 4 │ 5 │ 6 │  user:42│
   └───┴───┴───┴─────────┴───┴───┴───┴─────────┘

   → Tra cuu: O(1) — mot phep bam, mot lan truy cap
```

### Va chạm — điều luôn xảy ra

Hai khoá khác nhau cho cùng một ô. Điều này **không tránh được** (nguyên lý chuồng bồ câu), chỉ có cách xử lý:

```text
   PHUONG PHAP 1 — NOI CHUOI (chaining)
   ┌───┬───┬─────────────────────────┐
   │ 0 │ 1 │ user:42 → user:99 → ... │  ← danh sach lien ket trong mot o
   └───┴───┴─────────────────────────┘
   ✔ Don gian, xoa de
   ✘ Con tro tan mat → kem thanh thoi CPU cache

   PHUONG PHAP 2 — DIA CHI MO (open addressing)
   o day roi → thu o ke tiep
   ┌───┬─────────┬─────────┬───┐
   │ 0 │ user:42 │ user:99 │ 3 │  ← user:99 le ra o o 1, bi day sang o 2
   └───┴─────────┴─────────┴───┘
   ✔ Du lieu lien tuc → CPU cache rat tot
   ✘ Xoa phuc tap (phai danh dau "bia mo")
   ✘ Xuong cap nhanh khi bang gan day
```

Java `HashMap` dùng nối chuỗi (và chuyển sang cây đỏ-đen khi chuỗi quá dài); Python `dict` và Go `map` dùng biến thể của địa chỉ mở.

### Hệ số tải và việc mở rộng

```text
   he_so_tai = so_phan_tu / so_o

   0,5  →  it va cham, nhanh, ton bo nho
   0,75 →  can bang (mac dinh cua Java HashMap)
   0,9  →  tiet kiem bo nho, nhieu va cham
   1,0+ →  voi dia chi mo: XUONG CAP THAM HAI

   Vuot nguong → PHONG TO: cap bang moi GAP DOI, BAM LAI MOI PHAN TU
   → O(n), va gay KHUNG dot ngot
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
   CACH LAM:
     1. Quet bang NHO HON (users) → dung BANG BAM trong RAM
     2. Quet bang LON HON (orders) → moi dong, tra bang bam
   → O(n + m) thay vi O(n × m)
```

Ba dòng cần đọc trong kế hoạch:

```text
   Buckets: 131072       → so o cua bang bam
   Batches: 1            → CHI MOT lo → vua trong work_mem  ✔
   Memory Usage: 6242kB  → bang bam chiem 6 MB
```

Khi `Batches > 1` thì có vấn đề:

```text
Batches: 16  Memory Usage: 4096kB
        ▲
   work_mem KHONG DU → phai chia 16 lo, GHI RA DIA roi doc lai
   → cham hon nhieu
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
-- Danh index tren BAM cua cot, thay vi tren chinh cot
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
   3 MAY:  vi_tri = hash(khoa) % 3

   key='a' → 100 % 3 = 1  →  MAY 1
   key='b' → 101 % 3 = 2  →  MAY 2

   THEM MOT MAY → hash(khoa) % 4

   key='a' → 100 % 4 = 0  →  MAY 0   DOI CHO ✘
   key='b' → 101 % 4 = 1  →  MAY 1   DOI CHO ✘

   → Di tu N len N+1 may: khoang N/(N+1) du lieu PHAI DI CHUYEN
      3 →  4 may:  75%
      9 → 10 may:  90%
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
          │        VONG BAM              │  ● MAY B
          │      (0 → 2³² − 1)           │
          └┐                            ┌┘
           │        ● MAY C             │
           └─────┐             ┌────────┘
                 └─────────────┘

   DINH TUYEN:
     bam khoa → duoc mot diem tren vong
     → di THEO CHIEU KIM DONG HO toi may DAU TIEN gap duoc
```

Thêm một máy:

```text
   TRUOC                     SAU khi them MAY D
   ─────                     ──────────────────
     A                          A
     ●                          ●
                                     ● D   ← chen vao day
     ● B                        ● B
     ● C                        ● C

   Chi khoa nam GIUA C VA D phai chuyen sang D.
   Moi khoa khac GIU NGUYEN.

   → ~1/N du lieu di chuyen, thay vi N/(N+1)
```

## Nút ảo — chữa phân bố lệch

```text
   VAN DE: voi it may, chung co the roi vao vi tri lech
        A ●●  B          → C phai ganh 80% vong
             ↑
        ● C

   GIAI: moi may xuat hien 100-200 LAN tren vong,
         o cac vi tri bam khac nhau

        A₁ B₃ C₂ A₇ C₉ B₁ A₄ C₅ B₈ ...
   → phan bo xap xi deu
   → khi them/bot may, phan chuyen cung duoc RAI DEU
```

Con số thực tế: **150-256 nút ảo mỗi máy vật lý** cho độ lệch dưới vài phần trăm.

## Cài đặt và đo

```python
import hashlib, bisect

class VongBam:
    def __init__(self, so_nut_ao=150):
        self.so_nut_ao = so_nut_ao
        self.vong = {}          # vi_tri_bam -> ten_may
        self.vi_tri = []        # danh sach vi tri DA SAP XEP

    def _bam(self, s):
        return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)

    def them_may(self, ten):
        for i in range(self.so_nut_ao):
            vt = self._bam(f"{ten}#{i}")
            self.vong[vt] = ten
            bisect.insort(self.vi_tri, vt)      # giu danh sach da sap

    def xoa_may(self, ten):
        for i in range(self.so_nut_ao):
            vt = self._bam(f"{ten}#{i}")
            del self.vong[vt]
            self.vi_tri.remove(vt)

    def tim_may(self, khoa):
        if not self.vi_tri:
            return None
        h = self._bam(khoa)
        idx = bisect.bisect_right(self.vi_tri, h)    # TIM NHI PHAN — O(log n)
        if idx == len(self.vi_tri):
            idx = 0                                  # vong lai dau
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

# Phan bo truoc khi them
from collections import Counter
print("Truoc:", Counter(truoc.values()))

vong.them_may('may4')
doi_cho = sum(1 for k in khoa if vong.tim_may(k) != truoc[k])
print(f"Phai di chuyen: {doi_cho/len(khoa)*100:.1f}%")
print("Sau  :", Counter(vong.tim_may(k) for k in khoa))
```

```text
Truoc: Counter({'may2': 34118, 'may1': 33442, 'may3': 32440})
Phai di chuyen: 24.8%
Sau  : Counter({'may2': 25883, 'may4': 24812, 'may1': 24771, 'may3': 24534})
```

```text
   `% N`        :  75,0% phai di chuyen
   Vong bam     :  24,8% phai di chuyen     → IT HON 3 LAN
   Do lech phan bo:  duoi 3%                → chap nhan duoc
```

So sánh với `% N`:

```python
def modulo(khoa, n):
    return int(hashlib.md5(khoa.encode()).hexdigest()[:8], 16) % n

doi = sum(1 for k in khoa if modulo(k, 3) != modulo(k, 4))
print(f"Modulo — phai di chuyen: {doi/len(khoa)*100:.1f}%")
```

```text
Modulo — phai di chuyen: 74.9%
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
   Thay vi vong lien tuc, Redis dung 16.384 KHE ROI RAC:
     khe = CRC16(khoa) mod 16384

   Vi sao con so nay?
     • DU NHO de bang khe vua trong goi tin trao doi giua cac nut
       (16.384 bit = 2 KB dang bitmap)
     • DU LON de chia min cho hang tram nut

   Uu diem so voi vong lien tuc:
     → di chuyen theo TUNG KHE, kiem soat duoc tung buoc
     → biet chinh xac dang di chuyen cai gi
```

### Cassandra — nút ảo

```yaml
# cassandra.yaml
num_tokens: 256      # so nut ao moi nut vat ly
```

```text
   256 nut ao cho phan bo rat deu,
   va khi them nut moi, du lieu duoc keo ve TU NHIEU NUT CUNG LUC
   → nhanh hon nhieu so voi keo tu mot nut
```

## Băm nhất quán có giới hạn ràng buộc

Biến thể quan trọng: nếu chỉ dùng vòng băm thuần, một máy có thể bị dồn quá tải (khoá nóng). **Bounded-load consistent hashing** thêm một trần:

```text
   Neu may dich da vuot (1 + ε) × tai_trung_binh
     → di tiep theo chieu kim dong ho toi may ke tiep

   → dam bao khong may nao qua tai qua ε
   → doi lai: mot so khoa khong o "dung" may cua no
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
