# Bài 2: Homomorphic Encryption - Demo và Phân Tích Code

## Giới thiệu

Bài này đi vào chi tiết kỹ thuật của demo IBM HElib: cách database được mã hóa, cấu trúc code C++, và cách thực hiện tìm kiếm trên encrypted data. Dù HE chưa production-ready, hiểu cơ chế sẽ giúp bạn nhận ra khi nào nó có thể áp dụng.

---

## 1. Chuẩn bị môi trường

### Yêu cầu

```bash
# Cài Docker (đây là cách duy nhất cần thiết!)
# Trên Mac: Docker Desktop
# Trên Linux: Docker Engine
# Trên Windows: Docker Desktop với WSL2

# Kiểm tra
docker run hello-world
# → "Hello from Docker!" = Sẵn sàng
```

### IBM FHE Toolkit

```bash
# Clone demo repository
git clone https://github.com/IBM/fhe-toolkit-linux
cd fhe-toolkit-linux

# Tải Docker image IBM HE toolkit (Ubuntu based)
docker pull ibmcom/ibm-fhe-toolkit-ubuntu

# Chạy toolkit với VS Code server
./RunToolkit.sh -p ubuntu
# → VS Code chạy trên https://localhost:8443
```

```
Tại sao dùng Docker?
  - Toolkit có nhiều dependencies phức tạp (HElib, GCC, Python)
  - Tránh conflict với local packages
  - "Works on my machine" guaranteed
  - Có thể xóa sạch sau khi done (docker rm)
```

---

## 2. Cấu Trúc Database Mẫu

### File CSV nguồn (plaintext)

```csv
# country-db.csv
France,Paris
Germany,Berlin
Spain,Madrid
Italy,Rome
United Kingdom,London
Netherlands,Amsterdam
Belgium,Brussels
Sweden,Stockholm
Norway,Oslo
Denmark,Copenhagen
Finland,Helsinki
Portugal,Lisbon
Austria,Vienna
Switzerland,Bern
Poland,Warsaw
Czech Republic,Prague
Hungary,Budapest
Romania,Bucharest
Bulgaria,Sofia
Croatia,Zagreb
Slovenia,Ljubljana
Slovakia,Bratislava
Serbia,Belgrade
Greece,Athens
Albania,Tirana
Montenegro,Podgorica
Bosnia Herzegovina,Sarajevo
North Macedonia,Skopje
Kosovo,Pristina
Moldova,Chisinau
Ukraine,Kyiv
Belarus,Minsk
Lithuania,Vilnius
Latvia,Riga
Estonia,Tallinn
Russia,Moscow
Turkey,Ankara
Georgia,Tbilisi
Armenia,Yerevan
Azerbaijan,Baku
Kazakhstan,Nur-Sultan
Cyprus,Nicosia
Malta,Valletta
Iceland,Reykjavik
Ireland,Dublin
Luxembourg,Luxembourg City
Liechtenstein,Vaduz
Monaco,Monaco City
```

### File encrypted (ciphertext)

```
# Sau khi encrypt: MỌI thứ trở thành gibberish
[BINARY: 0xF3 0xAA 0xC1 0x7E 0x2B ...]
[BINARY: 0x92 0x14 0x88 0x3F 0xD6 ...]
[BINARY: 0xB4 0x07 0x55 0x61 0x9A ...]
...

→ Không thể đọc được country hay capital nào
→ Cloud provider chỉ thấy bytes ngẫu nhiên
```

---

## 3. Phân Tích Code C++

### Flow tổng quan

```cpp
// Pseudocode của IBM HElib demo:

// 1. SETUP (một lần)
HEContext ctx = setupHEContext(securityLevel=128);
SecretKey sk = generateSecretKey(ctx);
PublicKey pk = generatePublicKey(sk);

// 2. ENCRYPT DATABASE (offline, một lần)
CountryDatabase plaintext_db = loadCSV("country-db.csv");
EncryptedDatabase enc_db = encrypt(plaintext_db, pk);
// enc_db saved to disk - KHÔNG AI đọc được!

// 3. SEARCH QUERY (online, mỗi lần)
string query = "France";
EncryptedQuery enc_query = encrypt(query, pk);

// 4. SEARCH TRÊN ENCRYPTED DATA (server không biết gì!)
EncryptedResult enc_result = searchEncrypted(enc_db, enc_query);
// Server chỉ thấy encrypted bytes cả 2 chiều!

// 5. DECRYPT RESULT (chỉ client có secret key)
string result = decrypt(enc_result, sk);
// result = "Paris"
```

### Cách mã hóa hoạt động

```cpp
// HElib sử dụng BGV (Brakerski-Gentry-Vaikuntanathan) scheme
// hoặc CKKS cho approximate arithmetic

// Setup context
long p = 2;     // Plaintext modulus (binary for boolean ops)
long r = 1;     // Lifting (Hensel lifting)
long L = 16;    // Levels (số phép toán cho phép trước bootstrapping)
long c = 3;     // Columns trong key-switching matrix
long k = 128;   // Security level (bits)
long w = 64;    // Hamming weight of secret key

helib::Context context(m, p, r);
helib::addSomePrimes(context, c, L);
helib::addFrbMatrices(context);

// Generate keys
helib::SecKey secretKey(context);
secretKey.GenSecKey(w);
helib::addSome1DMatrices(secretKey);
const helib::PubKey& publicKey = secretKey;
```

### Encrypt một character

```cpp
// Mỗi character được encode thành binary
// 'F' = 70 = 01000110 binary

// Encrypt từng bit
vector<helib::Ctxt> encryptChar(char c, const helib::PubKey& pk) {
    vector<helib::Ctxt> bits;
    for (int i = 0; i < 8; i++) {
        int bit = (c >> i) & 1;
        helib::Ctxt ctxt(pk);
        pk.Encrypt(ctxt, helib::ZZX(bit));
        bits.push_back(ctxt);
    }
    return bits;
}
// 'F' → 8 ciphertexts (1 per bit)
// Mỗi ciphertext ~ vài KB
// 'F' encrypted ≈ 8 x 4KB = 32KB
```

### Search logic (hoạt động trên encrypted data)

```cpp
// So sánh hai encrypted characters
// Dùng XNOR (NOT XOR): a XNOR b = 1 nếu a == b
helib::Ctxt compareEncryptedBits(helib::Ctxt& a, helib::Ctxt& b) {
    helib::Ctxt result = a;
    result ^= b;  // XOR
    result.addConstant(ZZX(1));  // NOT: flip 0↔1
    // result = 1 nếu a == b, 0 nếu a != b
    return result;
}

// So sánh hai encrypted characters (8 bits mỗi cái)
helib::Ctxt compareEncryptedChars(
    vector<helib::Ctxt>& enc_a,  // 8 bits của char A
    vector<helib::Ctxt>& enc_b   // 8 bits của char B
) {
    helib::Ctxt result(pk);
    pk.Encrypt(result, ZZX(1));  // Start with 1 (true)
    
    for (int i = 0; i < 8; i++) {
        helib::Ctxt bitMatch = compareEncryptedBits(enc_a[i], enc_b[i]);
        result *= bitMatch;  // AND: tất cả bits phải match
    }
    return result;
}
```

---

## 4. Phân Tích Performance

### Tại sao chậm

```
Tìm kiếm "France" trong 48 rows:

1. Encrypt query:
   "France" = 6 chars × 8 bits = 48 ciphertexts
   Time: ~0.1 seconds

2. So sánh với mỗi row:
   - Mỗi country name ≈ 15 chars = 120 ciphertexts
   - So sánh: 120 multiplications + 120 additions
   - Mỗi HE multiplication ≈ 100ms
   - 1 row comparison: 120 × 100ms = 12 seconds
   
3. 48 rows × 12 seconds = 576 seconds (!!!)
   Nhưng demo chạy 2 phút → Các tối ưu đã áp dụng

4. Overhead chính: Bootstrapping giữa các levels
```

### Đo lường thực tế

```
Từ demo IBM trên MacBook 2015:

Query: "France"
Rows: 48 countries
Method: Sequential search (no index)
Time: ~2 minutes

So sánh:
  Plaintext search: < 0.1ms
  HE search: ~120,000ms
  Overhead: 1,200,000x

Với parallelism (48 cores):
  Mỗi row trên 1 core: 2 min / 48 ≈ 2.5 seconds
  → 1,200x vẫn là một overhead lớn
```

---

## 5. HE trong Python với TenSEAL

Dễ hơn C++, dùng cho learning và prototyping:

```python
# pip install tenseal

import tenseal as ts
import numpy as np

# Setup context với CKKS scheme (for approximate arithmetic)
context = ts.context(
    ts.SCHEME_TYPE.CKKS,
    poly_modulus_degree=8192,
    coeff_mod_bit_sizes=[60, 40, 40, 60]
)
context.generate_galois_keys()
context.global_scale = 2**40

# Encrypt vectors (CKKS batch encodes multiple values)
salary_data = [50000, 75000, 120000, 45000, 89000]
enc_salaries = ts.ckks_vector(context, salary_data)

# Tính toán trên encrypted data!
enc_result = enc_salaries + 10000  # Tăng lương 10k (encrypted)
enc_result2 = enc_salaries * 1.1   # Tăng lương 10% (encrypted)

# Decrypt (chỉ người có secret key mới làm được)
result = enc_result.decrypt()
print(result)  # [60000, 85000, 130000, 55000, 99000]

# Privacy-preserving average
enc_sum = enc_salaries.sum()
enc_avg = enc_sum / len(salary_data)
avg = enc_avg.decrypt()[0]
print(f"Average salary (encrypted compute): {avg:.2f}")
```

```python
# Use case: Medical data analysis
import tenseal as ts

# Hospital A: Encrypt patient data
context = ts.context(ts.SCHEME_TYPE.CKKS, poly_modulus_degree=8192,
                     coeff_mod_bit_sizes=[60, 40, 40, 60])
context.generate_galois_keys()
context.global_scale = 2**40

# Patient blood pressure readings
bp_readings = [120, 135, 118, 145, 128]
enc_bp = ts.ckks_vector(context, bp_readings)

# Cloud server computes statistics WITHOUT seeing actual data
enc_mean = enc_bp.sum() / len(bp_readings)
enc_variance = ((enc_bp - enc_mean) ** 2).sum() / len(bp_readings)

# Only Hospital A can decrypt with their private key
mean_bp = enc_mean.decrypt()[0]
print(f"Mean BP (privately computed): {mean_bp:.1f}")
```

---

## 6. Practical Applications Today

### Partial HE đang được dùng

```
1. Google's Private Join and Compute:
   - PHE-based protocol
   - Hai bên tìm intersection của datasets
   - Không lộ data của nhau
   - Use case: Conversion measurement trong ads
   
2. Apple Private Set Intersection (CSAM detection):
   - PHE + PSI protocol
   - So sánh hashes với database
   - Không gửi photos lên server
   
3. Microsoft SEAL trong Azure:
   - BFV/CKKS scheme
   - Healthcare analytics
   - Financial fraud detection
   
4. Federated Learning + HE:
   - Google's Federated Learning (FL) trên mobile
   - FL training trên device
   - HE để bảo vệ gradients khi gửi về server
```

### Khi nào HE có thể áp dụng ngay hôm nay

```
✅ Phù hợp:
  - Batch analytics (chạy qua đêm)
  - Approximate ML (CKKS, chấp nhận ~1% error)
  - Private set intersection
  - Secure computation với ít operations
  - Low-frequency heavy queries

❌ Chưa phù hợp:
  - Real-time queries (< 100ms requirement)
  - Complex queries với nhiều JOINs
  - High-frequency operations
  - Tight latency requirements
```

---

## Tổng Kết

```
Homomorphic Encryption trong 2 cột:

Hiện tại:
  - IBM HElib: mature C++ library
  - Microsoft SEAL: production-quality
  - TenSEAL: Python wrapper cho SEAL
  - Google TFHE: fast bootstrapping
  - Intel HEXL: hardware acceleration

Demo results:
  - 48 rows, 2 minutes → Clearly not production-ready
  - Nhưng: 2x faster mỗi năm (like ML 1980s-2000s)

Khi nào dùng:
  - Async batch processing
  - Privacy-critical analytics
  - Medical/financial compliance requirements
  - Khi privacy > performance

Tương lai:
  - Hardware ASICs cho HE: 10-100x faster
  - HE Database Engine: 5-10 năm
  - HE Load Balancer: 10+ năm
```

---

**Tiếp theo:** Phase 16 - Answering Your Questions →
