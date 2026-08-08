# Bài 1: Homomorphic Encryption — truy vấn trên dữ liệu đã mã hoá

Một câu hỏi nghe như bất khả thi:

> **Có thể tính toán trên dữ liệu mà không cần giải mã nó không?**

Trực giác nói không. Muốn cộng hai số thì phải biết hai số đó là gì.

Nhưng câu trả lời là **có** — và đó là **mã hoá đồng cấu** (*homomorphic encryption*, HE). Bài này giải thích nó hoạt động thế nào, nó giải quyết vấn đề gì mà mã hoá thông thường không giải được, và vì sao sau nửa thế kỷ nghiên cứu nó vẫn chưa thay thế được cách làm hiện tại.

## Vấn đề mà mã hoá thông thường không giải được

Nhắc lại ba lớp bảo vệ ở [phase-14 bài 1](../phase-14/01-bao-mat-ket-noi-database-tls.md):

```text
   1. KHI TRUYỀN  →  TLS         ✔ đã giải quyết
   2. KHI LƯU     →  mã hoá đĩa  ✔ đã giải quyết
   3. KHI DÙNG    →  ???         ✘ CÒN HỞ
```

Lỗ hổng thứ ba:

```text
   Database PHẢI GIẢI MÃ dữ liệu để:
     • so sánh trong WHERE
     • sắp xếp trong ORDER BY
     • cộng trong SUM()
     • ghép trong JOIN

   → Tại THỜI ĐIỂM ĐÓ, dữ liệu nằm TRONG RAM dưới dạng RÕ
   → Ai kiểm soát máy chủ đều đọc được:
       • nhà cung cấp đám mây
       • quản trị viên hệ thống
       • kẻ tấn công đã chiếm được máy
       • lệnh của cơ quan chức năng
```

Đây là lý do nhiều ngành (y tế, tài chính, quốc phòng) không dám đưa dữ liệu lên đám mây công cộng, dù về mặt kỹ thuật nó rẻ hơn nhiều.

Mã hoá đồng cấu hứa: **máy chủ tính toán được mà không bao giờ nhìn thấy dữ liệu**.

---

## Ý tưởng cốt lõi

"Đồng cấu" (*homomorphic*) là thuật ngữ toán học, nghĩa là **giữ nguyên cấu trúc phép toán**:

```text
   Mã hoá E, giải mã D.  Đồng cấu với phép cộng nghĩa là:

        D( E(a) ⊕ E(b) )  =  a + b

   Nghĩa là: cộng hai BẢN MÃ lại với nhau, giải mã kết quả,
             sẽ ra đúng tổng của hai giá trị gốc.
             Mà máy chủ KHÔNG BAO GIỜ biết a hay b là gì.
```

Diễn bằng luồng dữ liệu:

```text
   CLIENT (có khoá)                  SERVER (không có khoá)
   ════════════════                  ══════════════════════
   a = 5                             
   b = 3                             
   E(5) = 8x9f2a...  ──────────────▶ 
   E(3) = 3c1b7e...  ──────────────▶ 
                                     tính: 8x9f2a... ⊕ 3c1b7e...
                                        = ff41c2...
                     ◀────────────── tra ve ff41c2...
   D(ff41c2...) = 8                  
        ▲                            SERVER không hề biết:
   ĐÚNG bằng 5 + 3                     - giá trị đầu vào là 5 và 3
                                       - kết quả là 8
```

## Ví dụ đơn giản nhất: RSA đồng cấu với phép nhân

RSA có tính đồng cấu **tự nhiên** với phép nhân — và đây là cách hiểu trực quan nhất:

```text
   RSA:  E(m) = m^e mod n

   E(a) × E(b)  =  (a^e mod n) × (b^e mod n)
                =  (a × b)^e mod n
                =  E(a × b)

   → Nhân hai bản mã  ⟹  được bản mã của TÍCH
```

Kiểm chứng bằng số nhỏ:

```python
# Tham số RSA đồ chơi
p, q = 61, 53
n = p * q            # 3233
e = 17               # khoá công khai
d = 413              # khoá bí mật

def ma_hoa(m):  return pow(m, e, n)
def giai_ma(c): return pow(c, d, n)

a, b = 7, 9
ca, cb = ma_hoa(a), ma_hoa(b)

print(f"E(7) = {ca}")
print(f"E(9) = {cb}")

tich_ban_ma = (ca * cb) % n
print(f"E(7) x E(9) mod n = {tich_ban_ma}")
print(f"Giải mã           = {giai_ma(tich_ban_ma)}")
print(f"7 x 9             = {a*b}")
```

```text
E(7) = 1667
E(9) = 3110
E(7) x E(9) mod n = 872
Giải mã           = 63
7 x 9             = 63          ← KHOP
```

Máy chủ nhân hai số **mà không biết chúng là 7 và 9**, và không biết kết quả là 63.

Nhưng RSA **chỉ** đồng cấu với phép nhân, không với phép cộng. Đó là hạn chế dẫn tới phân loại dưới đây.

---

## Ba mức mã hoá đồng cấu

```text
   ┌────────────────────────────────────────────────────────────────┐
   │ PHẦN PHẦN (Partially HE — PHE)                                 │
   │   Hỗ trợ MỘT phép toán, KHÔNG GIỚI HẠN số lần                  │
   │   RSA, ElGamal  → chỉ phép NHÂN                                │
   │   Paillier      → chỉ phép CỘNG                                │
   │   → NHANH, dùng được trong sản phẩm thật                       │
   ├────────────────────────────────────────────────────────────────┤
   │ CÓ PHẦN (Somewhat HE — SHE)                                    │
   │   Hỗ trợ CẢ HAI phép toán, nhưng GIỚI HẠN số lần               │
   │   Mỗi phép toán làm "nhiễu" tích tụ; quá ngưỡng → hỏng         │
   │   → dùng được cho công thức đơn giản                           │
   ├────────────────────────────────────────────────────────────────┤
   │ TOÀN PHẦN (Fully HE — FHE)                                     │
   │   Hỗ trợ MỌI phép toán, KHÔNG GIỚI HẠN số lần                  │
   │   Craig Gentry, 2009 — đột phá lý thuyết lớn                   │
   │   → CHẬM HƠN HÀNG NGHÌN LẦN                                    │
   └────────────────────────────────────────────────────────────────┘
```

### Paillier — cộng được, dùng được ngay

```python
# pip install phe
from phe import paillier

khoa_cong, khoa_bi_mat = paillier.generate_paillier_keypair()

luong = [15_000_000, 22_000_000, 18_000_000, 30_000_000]
luong_ma_hoa = [khoa_cong.encrypt(x) for x in luong]

# SERVER làm việc này — KHÔNG có khoá bí mật
tong_ma_hoa = sum(luong_ma_hoa)                # cộng được!
tang_10_pt  = luong_ma_hoa[0] * 1.1            # nhân với hằng số cũng được

# CLIENT giải mã
print(f"Tong luong  : {khoa_bi_mat.decrypt(tong_ma_hoa):,}")
print(f"Luong +10%  : {khoa_bi_mat.decrypt(tang_10_pt):,.0f}")
```

```text
Tổng lương  : 85,000,000
Lương +10%  : 16,500,000
```

```text
   PAILLIER LÀM ĐƯỢC:
     ✔ E(a) + E(b)        → cộng hai giá trị mã hoá
     ✔ E(a) × hằng_số     → nhân với số RÕ
   PAILLIER KHÔNG LÀM ĐƯỢC:
     ✘ E(a) × E(b)        → nhân hai giá trị mã hoá
     ✘ E(a) > E(b)        → SO SANH
```

Dòng cuối là hạn chế quan trọng nhất: **không so sánh được** nghĩa là không có `WHERE x > 100`, không có `ORDER BY`, không có `MAX()`.

### FHE — làm được mọi thứ, nhưng...

Đột phá của Gentry năm 2009 dựa trên một ý tưởng gọi là **bootstrapping**:

```text
   VẤN ĐỀ: mỗi phép toán thêm "nhiễu" (noise) vào bản mã.
           Nhiễu tích tụ quá ngưỡng → giải mã ra RÁC.

   GIẢI PHÁP CỦA GENTRY:
     Định kỳ chạy chính THUẬT TOÁN GIẢI MÃ — nhưng ở dạng ĐÃ MÃ HOÁ.
     → được một bản mã "sạch" với cùng giá trị, nhiễu về mức thấp
     → từ đó tính toán tiếp VÔ HẠN
```

Nghe rất đẹp. Vấn đề nằm ở con số:

```text
   TỐC ĐỘ (so với tính toán trên dữ liệu RÕ)

   Ban đầu (2009)     :  ~1.000.000.000 lần chậm hơn
   Cải tiến (2013)    :  ~1.000.000     lần chậm hơn
   Hiện nay (2024-26) :  ~1.000-100.000 lần chậm hơn (tuỳ phép toán)

   KÍCH THƯỚC BẢN MÃ
   Một số nguyên 32 bit  →  bản mã từ 1 KB tới vài MB
                            → PHÌNH 250 - 100.000 LẦN
```

```text
   Ví dụ cụ thể:
     Cộng hai số trên dữ liệu rõ       :  ~1 nano-giây
     Cộng hai số bằng FHE              :  ~1 mili-giây      → 1.000.000× chậm
     Nhân hai số bằng FHE              :  ~10-100 mili-giây
     So sánh hai số bằng FHE           :  ~1 giây           ← rất đắt
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
   BFV / BGV  →  SỐ NGUYÊN chính xác      (đếm, tổng tiền)
   CKKS       →  SỐ THỰC XẤP XỈ           (học máy, thống kê)
   TFHE       →  PHÉP TOÁN BOOLEAN nhanh  (so sánh, điều kiện)
```

`CKKS` đáng chú ý: nó chấp nhận **sai số xấp xỉ** để đổi lấy tốc độ, và điều đó **hoàn toàn phù hợp** với học máy — nơi kết quả vốn đã là xấp xỉ.

---

## Dùng được ở đâu hôm nay

FHE toàn phần chưa dùng được cho database thông thường. Nhưng có những bài toán **hẹp** mà nó đã dùng được:

### 1. Tổng hợp thống kê riêng tư

```text
   Nhiều bệnh viện muốn biết trung bình một chỉ số trên TOÀN BỘ
   bệnh nhân của tất cả, nhưng KHÔNG được chia sẻ dữ liệu bệnh nhân.

   → Mỗi bên mã hoá dữ liệu của mình
   → Máy chủ trung gian CỘNG các bản mã (Paillier — nhanh, đủ dùng)
   → Chỉ kết quả tổng hợp được giải mã

   → Đã được triển khai trong nghiên cứu y tế
```

### 2. Học máy bảo mật riêng tư

```text
   Mô hình nằm ở máy chủ, dữ liệu nằm ở client.
   Client KHÔNG muốn lộ dữ liệu; máy chủ KHÔNG muốn lộ mô hình.

   → Client mã hoá đầu vào, gửi lên
   → Máy chủ suy luận trên bản mã (CKKS)
   → Client giải mã kết quả

   → Đã có sản phẩm thương mại, độ trễ tính bằng giây
```

### 3. Giao nhau tập riêng tư (PSI)

```text
   Hai bên muốn biết HỌ CÓ CHUNG NHỮNG KHÁCH HÀNG NÀO,
   mà không ai lộ danh sách đầy đủ của mình.

   → Được dùng trong đo lường quảng cáo
   → Signal dùng kỹ thuật tương tự cho tính năng "tìm bạn bè"
```

### 4. Bỏ phiếu điện tử

```text
   Mỗi lá phiếu được mã hoá.
   Cộng các lá phiếu mã hoá → được TỔNG đã mã hoá.
   Chỉ giải mã TỔNG, không bao giờ giải mã từng lá phiếu.

   → Paillier rất hợp, và đã được dùng trong hệ thống bầu cử thật
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

   Dữ liệu được giải mã và xử lý BÊN TRONG một vùng
   mà HỆ ĐIỀU HÀNH VÀ NHÀ CUNG CẤP ĐÁM MÂY KHÔNG ĐỌC ĐƯỢC.

   ✔ Nhanh gần bằng xử lý bình thường (~5-15% chi phí)
   ✔ Chạy được PHẦN MỀM CÓ SẴN, không phải viết lại
   ✘ Phải TIN vào nhà sản xuất chip
   ✘ Đã có nhiều lỗ hổng được công bố (Foreshadow, SGAxe, Plundervolt...)
```

Đây là hướng đang được triển khai thật: Azure Confidential Computing, AWS Nitro Enclaves, Google Confidential Space đều dựa trên TEE chứ không dựa trên FHE.

### Mã hoá giữ thứ tự — và vì sao nó nguy hiểm

Nghe rất hấp dẫn: mã hoá mà vẫn `ORDER BY` được. Nhưng:

```text
   Nếu bản mã GIỮ THỨ TỰ của bản rõ thì kẻ tấn công biết thứ tự.
   Với dữ liệu có phân bố đoán được (tuổi, lương, ngày sinh),
   biết thứ tự gần như là biết giá trị.

   Nghiên cứu trên dữ liệu bệnh viện đã mã hoá bằng OPE:
     → khôi phục được phần lớn giá trị chỉ bằng phân tích thống kê
```

Bài học: **mọi lược đồ cho phép truy vấn đều rò rỉ thông tin**. Câu hỏi không phải "có rò rỉ không" mà là "rò rỉ bao nhiêu, và có chấp nhận được không".

---

## Khi nào nên quan tâm tới HE

```text
   ✔ CÓ LÝ DO PHÁP LÝ hoặc HỢP ĐỒNG không được để nhà cung cấp
     đám mây nhìn thấy dữ liệu
   ✔ Bài toán là TỔNG HỢP trên nhiều bên không tin nhau
   ✔ Số phép toán RẤT ÍT (chủ yếu là cộng)
   ✔ Chấp nhận được độ trễ tính bằng giây hoặc phút

   ✘ Database nghiệp vụ thông thường  → dùng TLS + mã hoá đĩa + phân quyền
   ✘ Cần WHERE, ORDER BY, JOIN thường xuyên
   ✘ Cần độ trễ mili-giây
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
