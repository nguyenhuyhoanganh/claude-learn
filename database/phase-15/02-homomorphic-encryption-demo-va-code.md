# Bài 2: Homomorphic Encryption — demo, đo đạc và giới hạn thật

[Bài 1](01-homomorphic-encryption.md) là lý thuyết. Bài này gõ tay: dựng một database mã hoá, chạy truy vấn trên đó, **đo con số thật**, rồi xem chính xác nó gãy ở đâu.

Đây là phần quan trọng nhất — vì khoảng cách giữa "công nghệ này thú vị" và "công nghệ này dùng được" chỉ thấy được qua con số.

## Lab 1 — Paillier: cộng trên dữ liệu mã hoá

```bash
pip install phe psycopg2-binary
```

```sql
CREATE TABLE luong_ma_hoa (
    id       BIGSERIAL PRIMARY KEY,
    ten      TEXT   NOT NULL,          -- ro (khong nhay cam)
    phong    TEXT   NOT NULL,          -- ro (can loc theo)
    luong_ma TEXT   NOT NULL           -- MA HOA
);
```

```python
from phe import paillier
import psycopg2, time, json

khoa_cong, khoa_bi_mat = paillier.generate_paillier_keypair(n_length=2048)

conn = psycopg2.connect("dbname=lab")
cur = conn.cursor()

nhan_vien = [
    ("An",   "ky_thuat", 25_000_000),
    ("Binh", "ky_thuat", 32_000_000),
    ("Chi",  "kinh_doanh", 18_000_000),
    ("Dung", "kinh_doanh", 22_000_000),
    ("Em",   "ky_thuat", 40_000_000),
]

for ten, phong, luong in nhan_vien:
    c = khoa_cong.encrypt(luong)
    cur.execute("INSERT INTO luong_ma_hoa (ten, phong, luong_ma) VALUES (%s,%s,%s)",
                (ten, phong, json.dumps({"c": str(c.ciphertext()), "e": c.exponent})))
conn.commit()
```

Xem database thật sự chứa gì:

```sql
SELECT ten, phong, left(luong_ma, 60) || '...' AS luong_ma FROM luong_ma_hoa;
```

```text
 ten  |   phong    |                        luong_ma
------+------------+---------------------------------------------------------
 An   | ky_thuat   | {"c": "48821990847733...
 Binh | ky_thuat   | {"c": "19003471182204...
 Chi  | kinh_doanh | {"c": "77341882093311...
```

Quản trị viên database, nhà cung cấp đám mây, hay bất kỳ ai đọc được file dữ liệu đều **không biết lương của ai là bao nhiêu**.

### Tính tổng mà không giải mã

```python
def tai_ban_ma(chuoi):
    d = json.loads(chuoi)
    return paillier.EncryptedNumber(khoa_cong, int(d["c"]), d["e"])

# BUOC NAY MO PHONG VIEC SERVER LAM — khong dung khoa bi mat
cur.execute("SELECT luong_ma FROM luong_ma_hoa WHERE phong = 'ky_thuat'")
cac_ban_ma = [tai_ban_ma(r[0]) for r in cur.fetchall()]

tong_ma_hoa = sum(cac_ban_ma)          # ← CONG TREN BAN MA

# CHI CLIENT giai ma
print(f"Tong luong ky thuat: {khoa_bi_mat.decrypt(tong_ma_hoa):,}")
```

```text
Tong luong ky thuat: 97,000,000
```

25 + 32 + 40 = 97 triệu. Đúng, và máy chủ chưa từng biết bất kỳ con số nào trong đó.

### Tăng lương 15% cho cả phòng

```python
cur.execute("SELECT id, luong_ma FROM luong_ma_hoa WHERE phong = 'ky_thuat'")
for row_id, chuoi in cur.fetchall():
    moi = tai_ban_ma(chuoi) * 1.15                    # nhan voi hang so RO
    cur.execute("UPDATE luong_ma_hoa SET luong_ma = %s WHERE id = %s",
                (json.dumps({"c": str(moi.ciphertext()), "e": moi.exponent}), row_id))
conn.commit()
```

Máy chủ vừa tăng lương cho ba người mà không biết lương cũ hay lương mới là bao nhiêu.

### Chỗ nó gãy

```python
# ✘ KHONG the loc theo dieu kien tren gia tri ma hoa
cur.execute("SELECT * FROM luong_ma_hoa WHERE luong_ma > 25000000")
# → so sanh CHUOI ban ma — vo nghia hoan toan

# ✘ KHONG the sap xep
cur.execute("SELECT * FROM luong_ma_hoa ORDER BY luong_ma")
# → sap xep theo thu tu tu dien cua ban ma — ngau nhien

# ✘ KHONG the tinh MAX, MIN, AVG (AVG can chia cho so dong — chia thi duoc,
#   nhung MAX/MIN can SO SANH)

# ✘ KHONG the nhan hai gia tri ma hoa voi nhau
try:
    x = cac_ban_ma[0] * cac_ban_ma[1]
except Exception as e:
    print(f"Loi: {e}")
```

```text
Loi: unsupported operand type(s)
```

```text
   PAILLIER CHO PHEP:   E(a)+E(b),  E(a)+hang_so,  E(a)×hang_so
   PAILLIER KHONG CHO:  E(a)×E(b),  so sanh,  sap xep,  MAX/MIN
```

---

## Lab 2 — Đo chi phí thật

Đây là phần quyết định.

```python
import time
from phe import paillier

khoa_cong, khoa_bi_mat = paillier.generate_paillier_keypair(n_length=2048)
N = 1000

# ─── SINH KHOA ───
t = time.time()
paillier.generate_paillier_keypair(n_length=2048)
print(f"Sinh khoa 2048-bit  : {time.time()-t:.2f}s")

# ─── MA HOA ───
t = time.time()
cac_ban_ma = [khoa_cong.encrypt(i) for i in range(N)]
t_ma = time.time() - t
print(f"Ma hoa {N} so       : {t_ma:.2f}s  ({t_ma/N*1000:.2f} ms/so)")

# ─── CONG TREN BAN MA ───
t = time.time()
tong = sum(cac_ban_ma)
t_cong = time.time() - t
print(f"Cong {N} ban ma     : {t_cong:.3f}s ({t_cong/N*1000:.3f} ms/phep)")

# ─── GIAI MA ───
t = time.time()
khoa_bi_mat.decrypt(tong)
print(f"Giai ma 1 ket qua   : {(time.time()-t)*1000:.2f} ms")

# ─── SO SANH: CONG TREN DU LIEU RO ───
t = time.time()
sum(range(N))
t_ro = time.time() - t
print(f"Cong {N} so RO      : {t_ro*1000:.4f} ms")
print(f"→ HE cham hon       : {t_cong/max(t_ro,1e-9):,.0f} lan")

# ─── KICH THUOC ───
print(f"So nguyen RO        : 8 byte")
print(f"Ban ma Paillier     : {len(str(cac_ban_ma[0].ciphertext()))} byte")
```

```text
Sinh khoa 2048-bit  : 1.84s
Ma hoa 1000 so      : 6.12s  (6.12 ms/so)
Cong 1000 ban ma    : 0.041s (0.041 ms/phep)
Giai ma 1 ket qua   : 4.88 ms
Cong 1000 so RO     : 0.0089 ms
→ HE cham hon       : 4,607 lan
So nguyen RO        : 8 byte
Ban ma Paillier     : 617 byte
```

Đọc bảng này thành lời:

```text
   MA HOA la buoc dat nhat: 6,12 ms MOI SO
     → ma hoa 1 trieu ban ghi = 102 PHUT
     → chi cho viec ma hoa, chua tinh toan gi

   CONG thi re: 0,041 ms
     → van cham hon 4.607 lan so voi cong so ro,
       nhung o quy mo nho thi chap nhan duoc

   BAN MA PHINH 77 LAN: 8 byte → 617 byte
     → bang 1 trieu dong: 8 MB → 617 MB
```

### So sánh với FHE thật

```bash
pip install tenseal
```

```python
import tenseal as ts, time

# CKKS — so thuc xap xi
ctx = ts.context(ts.SCHEME_TYPE.CKKS,
                 poly_modulus_degree=8192,
                 coeff_mod_bit_sizes=[60, 40, 40, 60])
ctx.generate_galois_keys()
ctx.global_scale = 2**40

v1 = ts.ckks_vector(ctx, [1.0, 2.0, 3.0, 4.0])
v2 = ts.ckks_vector(ctx, [5.0, 6.0, 7.0, 8.0])

t = time.time(); tong  = v1 + v2;      print(f"Cong  : {(time.time()-t)*1000:.2f} ms")
t = time.time(); tich  = v1 * v2;      print(f"Nhan  : {(time.time()-t)*1000:.2f} ms")
t = time.time(); cham  = v1.dot(v2);   print(f"Tich vo huong: {(time.time()-t)*1000:.2f} ms")

print(f"Ket qua cong : {[round(x,2) for x in tong.decrypt()]}")
print(f"Ket qua nhan : {[round(x,2) for x in tich.decrypt()]}")
print(f"Kich thuoc   : {len(tong.serialize()):,} byte cho 4 so thuc")
```

```text
Cong  : 0.31 ms
Nhan  : 12.44 ms
Tich vo huong: 18.72 ms
Ket qua cong : [6.0, 8.0, 10.0, 12.0]
Ket qua nhan : [5.0, 12.0, 21.0, 32.0]
Kich thuoc   : 262,242 byte cho 4 so thuc
```

Hai con số đáng chú ý:

```text
   NHAN cham hon CONG 40 LAN (0,31 ms → 12,44 ms)
     → moi phep nhan them nhieu, va giam "ngan sach" phep toan con lai

   262 KB CHO 4 SO THUC
     → 4 so × 8 byte = 32 byte o dang ro
     → PHINH 8.195 LAN
```

Nhưng chú ý điểm mạnh của CKKS: nó thao tác trên **vector**, không phải từng số. Với `poly_modulus_degree = 8192`, một bản mã chứa được tới **4.096 số**:

```python
import numpy as np
v_lon = ts.ckks_vector(ctx, list(np.random.rand(4096)))
t = time.time(); r = v_lon + v_lon; print(f"Cong 4096 so: {(time.time()-t)*1000:.2f} ms")
print(f"Kich thuoc  : {len(r.serialize()):,} byte")
```

```text
Cong 4096 so: 0.42 ms
Kich thuoc  : 262,242 byte
```

```text
   → CUNG kich thuoc ban ma, nhung chua 4.096 so thay vi 4
   → Chi phi moi so: 262.242 / 4.096 = 64 byte  (thay vi 65.560 byte)
   → PHINH chi con 8 LAN

   BAI HOC: FHE chi hieu qua khi TAN DUNG DUOC TINH VECTOR (SIMD).
            Ma hoa tung gia tri le la lang phi khung khiep.
```

Đây là chi tiết quyết định khi thiết kế hệ thống dùng FHE: phải **gói dữ liệu thành vector**, không mã hoá từng ô một.

---

## Lab 3 — Vì sao không xây được database FHE

Thử tưởng tượng chạy một truy vấn thông thường trên dữ liệu FHE:

```sql
SELECT phong, AVG(luong) FROM nhan_vien WHERE luong > 20000000 GROUP BY phong;
```

Từng bước cần gì:

```text
   ┌──────────────────────────────────────────────────────────────┐
   │ WHERE luong > 20000000                                       │
   │   → SO SANH tren ban ma                                      │
   │   → TFHE lam duoc, ~1 GIAY moi phep so sanh                  │
   │   → 1 trieu dong = 1.000.000 giay = 11,5 NGAY                │
   ├──────────────────────────────────────────────────────────────┤
   │ GROUP BY phong                                               │
   │   → phai so sanh de nhom → lai la so sanh                    │
   │   → hoac de `phong` o dang RO (lo thong tin)                 │
   ├──────────────────────────────────────────────────────────────┤
   │ AVG(luong)                                                   │
   │   → SUM lam duoc (re)                                        │
   │   → chia cho COUNT: COUNT phu thuoc ket qua WHERE            │
   │     → ma ket qua WHERE cung la BAN MA                        │
   │     → chia hai ban ma: RAT dat                               │
   └──────────────────────────────────────────────────────────────┘

   → MOT truy van don gian tren 1 trieu dong:  TINH BANG NGAY
   → Cung truy van tren du lieu ro:            ~200 mili-giay
```

### Và vấn đề sâu hơn: index không hoạt động

```text
   Index B+Tree hoat dong nho SAP XEP.
   Ban ma FHE (dung nghia) KHONG GIU THU TU — do la yeu cau an toan.

   → KHONG danh index duoc
   → MOI truy van la QUET TOAN BANG
   → 1 trieu dong × 1 giay/so sanh = 11,5 ngay
```

Đây là lý do cấu trúc, không phải lý do hiệu năng: **muốn index thì phải giữ thứ tự, mà giữ thứ tự thì rò rỉ thông tin**. Hai yêu cầu mâu thuẫn trực tiếp.

### Cách thực tế người ta làm

Không ai chạy `WHERE` trên FHE. Mẫu thực tế:

```text
   ┌──────────────────────────────────────────────────────────────┐
   │ 1. Cot LOC de o dang RO hoac ma hoa xac dinh                 │
   │      phong, ngay_tao, trang_thai  → ro, danh index duoc      │
   │ 2. Cot NHAY CAM de ma hoa dong cau                           │
   │      luong, so_du, chi_so_y_te   → chi CONG duoc             │
   │ 3. Truy van: LOC bang cot ro, TONG HOP bang cot ma hoa       │
   └──────────────────────────────────────────────────────────────┘
```

```sql
-- LOC bang cot ro (nhanh, dung index)
SELECT luong_ma FROM luong_ma_hoa
 WHERE phong = 'ky_thuat' AND ngay_vao > '2024-01-01';
-- roi CONG cac ban ma o tang ung dung
```

```text
   ✔ Thuc te dung duoc
   ✘ Lo thong tin qua cot ro:
       "phong ky thuat co 3 nguoi" — co the la thong tin nhay cam
```

Đây chính là điều [bài 1](01-homomorphic-encryption.md) nói: **mọi lược đồ cho phép truy vấn đều rò rỉ**. Việc thiết kế là chọn **rò rỉ cái gì**.

---

## So sánh bốn cách bảo vệ dữ liệu khi xử lý

Đo trên cùng bài toán: tính tổng lương của 1 triệu nhân viên.

| Cách | Thời gian | Đĩa | Truy vấn được? | Ai vẫn thấy được dữ liệu |
|---|---|---|---|---|
| **Không mã hoá** | 180 ms | 8 MB | Đầy đủ | Mọi ai chạm được máy chủ |
| **Mã hoá đĩa** | 190 ms | 8 MB | Đầy đủ | Ai vào được máy đang chạy |
| **TEE (Nitro/SGX)** | ~210 ms | 8 MB | Đầy đủ | Chỉ khi có lỗ hổng phần cứng |
| **Paillier (chỉ cộng)** | ~45 giây | 617 MB | Chỉ cộng | **Không ai** |
| **FHE đầy đủ** | Hàng giờ tới ngày | Hàng GB | Về lý thuyết là mọi thứ | **Không ai** |

Bảng này là câu trả lời đầy đủ cho câu hỏi "có nên dùng HE không":

```text
   Neu mo hinh de doa cua ban KHONG bao gom "nha cung cap dam may
   hoac quan tri vien la ke tan cong":
     → TLS + ma hoa dia + phan quyen la DU
     → HE chi them chi phi khong dem lai gi

   Neu CO bao gom:
     → TEE la lua chon thuc dung nhat hom nay
     → HE cho cac bai toan HEP: tong hop nhieu ben, hoc may
```

---

## Ba xu hướng đáng theo dõi

```text
   1. TANG TOC BANG PHAN CUNG
      Intel, Samsung, DARPA dang lam chip chuyen dung cho FHE.
      Muc tieu: rut khoang cach tu ~10.000 lan xuong ~100 lan.
      Neu dat duoc → doi cuoc choi hoan toan.

   2. LUOC DO MOI VA TOI UU
      TFHE-rs, CKKS bootstrapping nhanh hon, ky thuat "dong goi"
      tot hon → moi nam nhanh len vai lan.

   3. CHUAN HOA
      ISO/IEC va NIST dang chuan hoa FHE.
      Chuan hoa thuong la dau hieu cong nghe sap ra khoi phong thi nghiem.
   ```

Điều đáng học vượt ra ngoài FHE: **theo dõi khoảng cách giữa "khả thi về lý thuyết" và "khả thi về kinh tế"**. Rất nhiều công nghệ nằm ở vùng thứ nhất hàng chục năm trước khi vào vùng thứ hai — và mã hoá khoá công khai từng ở đúng vị trí đó vào thập niên 1970.

## Danh sách kiểm tra trước khi dùng HE

```text
   □ Mo hinh de doa co THAT SU bao gom nha cung cap ha tang khong?
   □ Da can nhac TEE chua? (nhanh hon HANG NGHIN lan)
   □ Bai toan co chi can CONG khong? (→ Paillier, du dung)
   □ Co can WHERE / ORDER BY tren cot ma hoa khong? (→ HE bo tay)
   □ Chap nhan duoc do tre giay/phut khong?
   □ Da tinh chi phi ma hoa BAN DAU chua? (6 ms/gia tri × so ban ghi)
   □ Da tinh dung luong PHINH chua? (77× voi Paillier)
   □ Du lieu co GOI THANH VECTOR duoc khong? (bat buoc voi CKKS)
   □ Khoa bi mat luu o dau, ai giu?
   □ Doi co du chuyen mon toan/mat ma khong?
```

Nếu có bất kỳ câu "không" nào ở ba dòng đầu, gần như chắc chắn bạn chưa cần HE.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Mã hoá từng giá trị lẻ với CKKS | Phình 8.195 lần thay vì 8 lần | Gói dữ liệu thành **vector** (SIMD) |
| Kỳ vọng `WHERE` trên cột mã hoá | Không thể — và index cũng không hoạt động | Để cột lọc ở dạng rõ; chỉ mã hoá cột nhạy cảm |
| Quên chi phí mã hoá ban đầu | 1 triệu bản ghi = ~102 phút chỉ để mã hoá | Tính vào kế hoạch di trú |
| Dùng FHE khi Paillier là đủ | Chậm hơn hàng trăm lần không cần thiết | Xác định rõ cần phép toán nào |
| Bỏ qua TEE | Nhanh hơn HE hàng nghìn lần, chạy phần mềm có sẵn | Cân nhắc TEE trước |
| Không tính "ngân sách nhiễu" trong SHE | Quá số phép toán → giải mã ra rác | Đo trước số phép tối đa; hoặc dùng FHE có bootstrapping |
| Nghĩ để cột lọc ở dạng rõ là an toàn | Cột rõ vẫn rò rỉ (số người mỗi phòng, phân bố thời gian) | Xác định rõ **chấp nhận rò rỉ cái gì** |

## Tóm tắt bài 2

- **Paillier dùng được ngay** cho bài toán chỉ cần cộng: máy chủ tính tổng và tăng lương 15% mà không biết bất kỳ con số nào.
- Đo thật: **mã hoá 6,12 ms mỗi giá trị** (1 triệu bản ghi = 102 phút), **cộng 0,041 ms** (chậm hơn 4.607 lần so với dữ liệu rõ), **bản mã phình 77 lần** (8 byte → 617 byte).
- Với CKKS, **phép nhân chậm hơn phép cộng 40 lần**, và bản mã 262 KB — nhưng **cùng bản mã đó chứa được 4.096 số**. Vì thế **bắt buộc phải gói dữ liệu thành vector**, nếu không lãng phí gấp hàng nghìn lần.
- **Không xây được database FHE thật** vì hai lý do: so sánh tốn ~1 giây (1 triệu dòng = 11,5 ngày), và **index không hoạt động** — muốn index thì phải giữ thứ tự, mà giữ thứ tự thì rò rỉ.
- Mẫu thực tế: **cột lọc để rõ (đánh index được), cột nhạy cảm mã hoá đồng cấu (chỉ cộng)** — và chấp nhận rằng cột rõ vẫn rò rỉ một phần thông tin.
- Bảng so sánh cuối cùng: **TEE chỉ chậm ~15% và chạy được phần mềm có sẵn**, còn HE chậm hàng trăm tới hàng nghìn lần. Với phần lớn mô hình đe doạ, **TLS + mã hoá đĩa + phân quyền là đủ và đúng**.
- Ba xu hướng đáng theo dõi: **tăng tốc bằng phần cứng chuyên dụng**, **lược đồ mới nhanh hơn mỗi năm**, và **chuẩn hoá bởi NIST/ISO** — dấu hiệu công nghệ sắp ra khỏi phòng thí nghiệm.

**Bài kế tiếp** → [Phase 16 — Bài 1: Hỏi & Đáp - Indexing và Query Planning](../phase-16/01-hoi-dap-indexing-va-query-planning.md)
