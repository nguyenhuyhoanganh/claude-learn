# Bài 1: Homomorphic Encryption — truy vấn trên dữ liệu đã mã hoá

Một câu hỏi nghe như bất khả thi:

> **Có thể tính toán trên dữ liệu mà không cần giải mã nó không?**

Trực giác nói không. Muốn cộng hai số thì phải biết hai số đó là gì.

Nhưng câu trả lời là **có** — và đó là **mã hoá đồng cấu** (*homomorphic encryption*, HE). Bài này giải thích nó hoạt động thế nào, nó giải quyết vấn đề gì mà mã hoá thông thường không giải được, và vì sao sau nửa thế kỷ nghiên cứu nó vẫn chưa thay thế được cách làm hiện tại.

## Vấn đề mà mã hoá thông thường không giải được

Nhắc lại ba lớp bảo vệ ở [phase-14 bài 1](../phase-14/01-bao-mat-ket-noi-database-tls.md):

```text
   1. KHI TRUYEN  →  TLS         ✔ da giai quyet
   2. KHI LUU     →  ma hoa dia  ✔ da giai quyet
   3. KHI DUNG    →  ???         ✘ CON HO
```

Lỗ hổng thứ ba:

```text
   Database PHAI GIAI MA du lieu de:
     • so sanh trong WHERE
     • sap xep trong ORDER BY
     • cong trong SUM()
     • ghep trong JOIN

   → Tai THOI DIEM DO, du lieu nam TRONG RAM duoi dang RO
   → Ai kiem soat may chu deu doc duoc:
       • nha cung cap dam may
       • quan tri vien he thong
       • ke tan cong da chiem duoc may
       • lenh cua co quan chuc nang
```

Đây là lý do nhiều ngành (y tế, tài chính, quốc phòng) không dám đưa dữ liệu lên đám mây công cộng, dù về mặt kỹ thuật nó rẻ hơn nhiều.

Mã hoá đồng cấu hứa: **máy chủ tính toán được mà không bao giờ nhìn thấy dữ liệu**.

---

## Ý tưởng cốt lõi

"Đồng cấu" (*homomorphic*) là thuật ngữ toán học, nghĩa là **giữ nguyên cấu trúc phép toán**:

```text
   Ma hoa E, giai ma D.  Dong cau voi phep cong nghia la:

        D( E(a) ⊕ E(b) )  =  a + b

   Nghia la: cong hai BAN MA lai voi nhau, giai ma ket qua,
             se ra dung tong cua hai gia tri goc.
             Ma may chu KHONG BAO GIO biet a hay b la gi.
```

Diễn bằng luồng dữ liệu:

```text
   CLIENT (co khoa)                  SERVER (khong co khoa)
   ════════════════                  ══════════════════════
   a = 5                             
   b = 3                             
   E(5) = 8x9f2a...  ──────────────▶ 
   E(3) = 3c1b7e...  ──────────────▶ 
                                     tinh: 8x9f2a... ⊕ 3c1b7e...
                                        = ff41c2...
                     ◀────────────── tra ve ff41c2...
   D(ff41c2...) = 8                  
        ▲                            SERVER khong he biet:
   ĐUNG bang 5 + 3                     - gia tri dau vao la 5 va 3
                                       - ket qua la 8
```

## Ví dụ đơn giản nhất: RSA đồng cấu với phép nhân

RSA có tính đồng cấu **tự nhiên** với phép nhân — và đây là cách hiểu trực quan nhất:

```text
   RSA:  E(m) = m^e mod n

   E(a) × E(b)  =  (a^e mod n) × (b^e mod n)
                =  (a × b)^e mod n
                =  E(a × b)

   → Nhan hai ban ma  ⟹  duoc ban ma cua TICH
```

Kiểm chứng bằng số nhỏ:

```python
# Tham so RSA do choi
p, q = 61, 53
n = p * q            # 3233
e = 17               # khoa cong khai
d = 413              # khoa bi mat

def ma_hoa(m):  return pow(m, e, n)
def giai_ma(c): return pow(c, d, n)

a, b = 7, 9
ca, cb = ma_hoa(a), ma_hoa(b)

print(f"E(7) = {ca}")
print(f"E(9) = {cb}")

tich_ban_ma = (ca * cb) % n
print(f"E(7) x E(9) mod n = {tich_ban_ma}")
print(f"Giai ma           = {giai_ma(tich_ban_ma)}")
print(f"7 x 9             = {a*b}")
```

```text
E(7) = 1667
E(9) = 3110
E(7) x E(9) mod n = 872
Giai ma           = 63
7 x 9             = 63          ← KHOP
```

Máy chủ nhân hai số **mà không biết chúng là 7 và 9**, và không biết kết quả là 63.

Nhưng RSA **chỉ** đồng cấu với phép nhân, không với phép cộng. Đó là hạn chế dẫn tới phân loại dưới đây.

---

## Ba mức mã hoá đồng cấu

```text
   ┌────────────────────────────────────────────────────────────────┐
   │ PHAN PHAN (Partially HE — PHE)                                 │
   │   Ho tro MOT phep toan, KHONG GIOI HAN so lan                  │
   │   RSA, ElGamal  → chi phep NHAN                                │
   │   Paillier      → chi phep CONG                                │
   │   → NHANH, dung duoc trong san pham that                       │
   ├────────────────────────────────────────────────────────────────┤
   │ CO PHAN (Somewhat HE — SHE)                                    │
   │   Ho tro CA HAI phep toan, nhung GIOI HAN so lan               │
   │   Moi phep toan lam "nhieu" tich tu; qua nguong → hong         │
   │   → dung duoc cho cong thuc don gian                           │
   ├────────────────────────────────────────────────────────────────┤
   │ TOAN PHAN (Fully HE — FHE)                                     │
   │   Ho tro MOI phep toan, KHONG GIOI HAN so lan                  │
   │   Craig Gentry, 2009 — dot pha ly thuyet lon                   │
   │   → CHAM HON HANG NGHIN LAN                                    │
   └────────────────────────────────────────────────────────────────┘
```

### Paillier — cộng được, dùng được ngay

```python
# pip install phe
from phe import paillier

khoa_cong, khoa_bi_mat = paillier.generate_paillier_keypair()

luong = [15_000_000, 22_000_000, 18_000_000, 30_000_000]
luong_ma_hoa = [khoa_cong.encrypt(x) for x in luong]

# SERVER lam viec nay — KHONG co khoa bi mat
tong_ma_hoa = sum(luong_ma_hoa)                # cong duoc!
tang_10_pt  = luong_ma_hoa[0] * 1.1            # nhan voi hang so cung duoc

# CLIENT giai ma
print(f"Tong luong  : {khoa_bi_mat.decrypt(tong_ma_hoa):,}")
print(f"Luong +10%  : {khoa_bi_mat.decrypt(tang_10_pt):,.0f}")
```

```text
Tong luong  : 85,000,000
Luong +10%  : 16,500,000
```

```text
   PAILLIER LAM DUOC:
     ✔ E(a) + E(b)        → cong hai gia tri ma hoa
     ✔ E(a) × hang_so     → nhan voi so RO
   PAILLIER KHONG LAM DUOC:
     ✘ E(a) × E(b)        → nhan hai gia tri ma hoa
     ✘ E(a) > E(b)        → SO SANH
```

Dòng cuối là hạn chế quan trọng nhất: **không so sánh được** nghĩa là không có `WHERE x > 100`, không có `ORDER BY`, không có `MAX()`.

### FHE — làm được mọi thứ, nhưng...

Đột phá của Gentry năm 2009 dựa trên một ý tưởng gọi là **bootstrapping**:

```text
   VAN DE: moi phep toan them "nhieu" (noise) vao ban ma.
           Nhieu tich tu qua nguong → giai ma ra RAC.

   GIAI PHAP CUA GENTRY:
     Dinh ky chay chinh THUAT TOAN GIAI MA — nhung o dang DA MA HOA.
     → duoc mot ban ma "sach" voi cung gia tri, nhieu ve muc thap
     → tu do tinh toan tiep VO HAN
```

Nghe rất đẹp. Vấn đề nằm ở con số:

```text
   TOC DO (so voi tinh toan tren du lieu RO)

   Ban dau (2009)     :  ~1.000.000.000 lan cham hon
   Cai tien (2013)    :  ~1.000.000     lan cham hon
   Hien nay (2024-26) :  ~1.000-100.000 lan cham hon (tuy phep toan)

   KICH THUOC BAN MA
   Mot so nguyen 32 bit  →  ban ma tu 1 KB toi vai MB
                            → PHINH 250 - 100.000 LAN
```

```text
   Vi du cu the:
     Cong hai so tren du lieu ro       :  ~1 nanogiay
     Cong hai so bang FHE              :  ~1 mili-giay      → 1.000.000× cham
     Nhan hai so bang FHE              :  ~10-100 mili-giay
     So sanh hai so bang FHE           :  ~1 giay           ← rat dat
```

Dòng cuối giải thích vì sao FHE khó dùng cho database: **so sánh là phép toán cơ bản nhất của mọi truy vấn**, và nó lại là phép đắt nhất trong FHE.

---

## Các thư viện hiện nay

| Thư viện | Do ai | Lược đồ | Mạnh ở |
|---|---|---|---|
| **Microsoft SEAL** | Microsoft | BFV, CKKS | Trưởng thành, tài liệu tốt |
| **OpenFHE** | Cộng đồng | BGV, BFV, CKKS, TFHE | Nhiều lược đồ nhất |
| **HElib** | IBM | BGV, CKKS | Nghiên cứu, tối ưu sâu |
| **Concrete** | Zama | TFHE | Trình biên dịch từ Python |
| **TenSEAL** | OpenMined | CKKS | Học máy trên dữ liệu mã hoá |
| **python-paillier** | — | Paillier | Đơn giản, chỉ cộng |

Ba lược đồ chính và bài toán của chúng:

```text
   BFV / BGV  →  SO NGUYEN chinh xac      (dem, tong tien)
   CKKS       →  SO THUC XAP XI           (hoc may, thong ke)
   TFHE       →  PHEP TOAN BOOLEAN nhanh  (so sanh, dieu kien)
```

`CKKS` đáng chú ý: nó chấp nhận **sai số xấp xỉ** để đổi lấy tốc độ, và điều đó **hoàn toàn phù hợp** với học máy — nơi kết quả vốn đã là xấp xỉ.

---

## Dùng được ở đâu hôm nay

FHE toàn phần chưa dùng được cho database thông thường. Nhưng có những bài toán **hẹp** mà nó đã dùng được:

### 1. Tổng hợp thống kê riêng tư

```text
   Nhieu benh vien muon biet trung binh mot chi so tren TOAN BO
   benh nhan cua tat ca, nhung KHONG duoc chia se du lieu benh nhan.

   → Moi ben ma hoa du lieu cua minh
   → May chu trung gian CONG cac ban ma (Paillier — nhanh, du dung)
   → Chi ket qua tong hop duoc giai ma

   → Da duoc trien khai trong nghien cuu y te
```

### 2. Học máy bảo mật riêng tư

```text
   Mo hinh nam o may chu, du lieu nam o client.
   Client KHONG muon lo du lieu; may chu KHONG muon lo mo hinh.

   → Client ma hoa dau vao, gui len
   → May chu suy luan tren ban ma (CKKS)
   → Client giai ma ket qua

   → Da co san pham thuong mai, do tre tinh bang giay
```

### 3. Giao nhau tập riêng tư (PSI)

```text
   Hai ben muon biet HO CO CHUNG NHUNG KHACH HANG NAO,
   ma khong ai lo danh sach day du cua minh.

   → Duoc dung trong do luong quang cao
   → Signal dung ky thuat tuong tu cho tinh nang "tim ban be"
```

### 4. Bỏ phiếu điện tử

```text
   Moi la phieu duoc ma hoa.
   Cong cac la phieu ma hoa → duoc TONG da ma hoa.
   Chi giai ma TONG, khong bao gio giai ma tung la phieu.

   → Paillier rat hop, va da duoc dung trong he thong bau cu that
```

Điểm chung của bốn ứng dụng: chúng đều cần **rất ít phép toán** (chủ yếu là cộng), và **không cần so sánh hay sắp xếp**.

---

## Các lựa chọn thực dụng hơn

Nếu bài toán là "bảo vệ dữ liệu khi đang xử lý", FHE không phải lựa chọn duy nhất — và thường không phải lựa chọn tốt nhất:

| Kỹ thuật | Cách làm | Ưu | Nhược |
|---|---|---|---|
| **Mã hoá phía client** | Ứng dụng mã hoá trước khi gửi | Đơn giản, nhanh | Mất khả năng truy vấn |
| **Mã hoá xác định** | Cùng giá trị → cùng bản mã | Tra cứu chính xác được | Lộ **mẫu tần suất** |
| **Mã hoá giữ thứ tự (OPE)** | Bản mã giữ thứ tự của bản rõ | So sánh và sắp xếp được | Lộ **thứ tự** — rò rỉ nhiều |
| **Vùng thực thi tin cậy (TEE)** | Xử lý trong vùng phần cứng cách ly | Nhanh gần bằng bình thường | Tin vào phần cứng; đã có nhiều lỗ hổng |
| **Mã thông báo (tokenization)** | Thay giá trị nhạy cảm bằng mã tham chiếu | Đơn giản, đã chuẩn hoá | Cần một dịch vụ giữ ánh xạ |
| **Riêng tư vi phân** | Thêm nhiễu có kiểm soát vào kết quả | Đảm bảo toán học rõ ràng | Kết quả có sai số |

### TEE — lựa chọn thực dụng nhất hiện nay

```text
   Intel SGX, AMD SEV, ARM CVE, AWS Nitro Enclaves

   Du lieu duoc giai ma va xu ly BEN TRONG mot vung
   ma HE DIEU HANH VA NHA CUNG CAP DAM MAY KHONG DOC DUOC.

   ✔ Nhanh gan bang xu ly binh thuong (~5-15% chi phi)
   ✔ Chay duoc PHAN MEM CO SAN, khong phai viet lai
   ✘ Phai TIN vao nha san xuat chip
   ✘ Da co nhieu lo hong duoc cong bo (Foreshadow, SGAxe, Plundervolt...)
```

Đây là hướng đang được triển khai thật: Azure Confidential Computing, AWS Nitro Enclaves, Google Confidential Space đều dựa trên TEE chứ không dựa trên FHE.

### Mã hoá giữ thứ tự — và vì sao nó nguy hiểm

Nghe rất hấp dẫn: mã hoá mà vẫn `ORDER BY` được. Nhưng:

```text
   Neu ban ma GIU THU TU cua ban ro thi ke tan cong biet thu tu.
   Voi du lieu co phan bo doan duoc (tuoi, luong, ngay sinh),
   biet thu tu gan nhu la biet gia tri.

   Nghien cuu tren du lieu benh vien da ma hoa bang OPE:
     → khoi phuc duoc phan lon gia tri chi bang phan tich thong ke
```

Bài học: **mọi lược đồ cho phép truy vấn đều rò rỉ thông tin**. Câu hỏi không phải "có rò rỉ không" mà là "rò rỉ bao nhiêu, và có chấp nhận được không".

---

## Khi nào nên quan tâm tới HE

```text
   ✔ CO LY DO PHAP LY hoac HOP DONG khong duoc de nha cung cap
     dam may nhin thay du lieu
   ✔ Bai toan la TONG HOP tren nhieu ben khong tin nhau
   ✔ So phep toan RAT IT (chu yeu la cong)
   ✔ Chap nhan duoc do tre tinh bang giay hoac phut

   ✘ Database nghiep vu thong thuong  → dung TLS + ma hoa dia + phan quyen
   ✘ Can WHERE, ORDER BY, JOIN thuong xuyen
   ✘ Can do tre mili-giay
   ✘ Chi vi "nghe hay"
```

Lời khuyên thực dụng:

> **Với 99% hệ thống, ba lớp ở [phase-14](../phase-14/01-bao-mat-ket-noi-database-tls.md) — TLS, mã hoá đĩa, phân quyền tối thiểu — đã đủ và đúng.** HE dành cho 1% còn lại, nơi mô hình đe doạ bao gồm cả chính nhà cung cấp hạ tầng.

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách nghĩ đúng |
|---|---|---|
| Nghĩ FHE sắp thay thế database thường | Còn chậm hơn 1.000-100.000 lần, bản mã phình hàng trăm lần | Dùng cho bài toán hẹp, ít phép toán |
| Dùng mã hoá giữ thứ tự vì tiện | Lộ thứ tự → thường lộ luôn giá trị | Chấp nhận mất khả năng sắp xếp, hoặc dùng TEE |
| Dùng mã hoá xác định cho cột ít giá trị | Lộ mẫu tần suất — đếm là suy ra được | Chỉ dùng cho cột có nhiều giá trị khác nhau |
| Tin TEE là an toàn tuyệt đối | Đã có nhiều lỗ hổng được công bố | Coi là **một lớp**, không phải giải pháp duy nhất |
| Dùng HE khi mô hình đe doạ không cần | Trả giá khổng lồ cho vấn đề không tồn tại | Xác định rõ **ai** là kẻ bạn phòng chống |
| Quên rằng khoá phải nằm ngoài | Khoá nằm cùng chỗ với dữ liệu = mã hoá vô nghĩa | KMS, HSM, hoặc giữ ở phía client |

## Tóm tắt bài 1

- **Mã hoá đồng cấu** cho phép tính toán trên bản mã: `D(E(a) ⊕ E(b)) = a + b`, và máy chủ **không bao giờ nhìn thấy dữ liệu**.
- Nó lấp lỗ hổng thứ ba mà TLS và mã hoá đĩa không giải được: **dữ liệu khi đang được xử lý trong RAM**.
- **RSA đồng cấu tự nhiên với phép nhân** — nhân hai bản mã ra bản mã của tích. Đây là cách hiểu trực quan nhất.
- Ba mức: **PHE** (một phép toán, nhanh, dùng được thật) · **SHE** (cả hai nhưng giới hạn số lần) · **FHE** (mọi phép toán, nhưng chậm hơn **1.000-100.000 lần**).
- **Paillier cộng được nhưng không so sánh được** — nghĩa là không có `WHERE x > 100`, không `ORDER BY`, không `MAX()`. Đó là hạn chế lớn nhất cho ứng dụng database.
- Trong FHE, **so sánh là phép toán đắt nhất** (~1 giây) — mà so sánh lại là phép cơ bản nhất của mọi truy vấn.
- Bốn ứng dụng đã dùng được thật: **thống kê riêng tư nhiều bên**, **học máy bảo mật**, **giao nhau tập riêng tư**, **bỏ phiếu điện tử** — tất cả đều cần rất ít phép toán và không cần so sánh.
- Lựa chọn thực dụng hơn hiện nay là **TEE** (SGX, SEV, Nitro Enclaves): chỉ chậm 5-15%, chạy được phần mềm có sẵn — đổi lại phải tin vào phần cứng.
- **Mã hoá giữ thứ tự nguy hiểm**: lộ thứ tự thường đồng nghĩa với lộ giá trị. Mọi lược đồ cho phép truy vấn đều rò rỉ thông tin; câu hỏi là **rò rỉ bao nhiêu**.

**Bài kế tiếp** → [Bài 2: Homomorphic Encryption - Demo và phân tích code](02-homomorphic-encryption-demo-va-code.md)
