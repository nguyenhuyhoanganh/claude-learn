# Bài 1: Homomorphic Encryption - Mã Hóa Đồng Cấu

## Giới thiệu

**Homomorphic Encryption (HE)** là một trong những công nghệ tiên phong nhất trong khoa học máy tính. Nó cho phép **thực hiện phép tính trên dữ liệu đã mã hóa mà không cần giải mã**. Bài này giải thích tại sao điều này quan trọng đến mức thay đổi cách chúng ta nghĩ về bảo mật dữ liệu.

---

## 1. Vấn Đề: Không Thể Luôn Luôn Mã Hóa

### Mã hóa thông thường hoạt động tốt ở đâu

```
✅ Mã hóa hoạt động tốt khi:
  - Lưu password trong database (hashed)
  - Truyền data qua network (HTTPS/TLS)
  - Lưu file nhạy cảm trên disk (at-rest encryption)
  - Backup database
```

### Vấn đề khi cần xử lý data

```
❌ Mã hóa KHÔNG giải quyết được khi:
  - Cần query database: SELECT * FROM users WHERE salary > 50000
    → salary phải là plaintext để so sánh!
    
  - Analytics: "Top trending hashtags trên Twitter"
    → Text phải readable để detect trends
    
  - Machine Learning: Train recommendation model
    → Data phải plaintext để tính toán
    
  - Load balancer layer 7:
    → Phải decrypt HTTPS để xem URL path
    → Sau đó route đến đúng backend
    
  - Database indexing:
    → Index chỉ hoạt động với plaintext values
```

### Vòng lặp Encrypt-Process-Encrypt

```
Giải pháp hiện tại (bất đắc dĩ):

  Encrypted data on disk
        ↓ Decrypt
  Agent (app server, database)
  ← Điểm yếu! Agent thấy plaintext
        ↓ Process
  Result
        ↓ Re-encrypt
  Encrypted result on disk

Vấn đề:
  1. Agent (app server) phải TRUSTED
  2. Nếu agent bị compromise → Data bị lộ
  3. Cloud provider có thể truy cập plaintext
  4. Database admin có thể xem data
```

---

## 2. Homomorphic Encryption - Giải Pháp

### Định nghĩa

**Homomorphic Encryption** cho phép thực hiện phép tính trên ciphertext (data đã mã hóa), và kết quả sau khi giải mã sẽ giống như thực hiện phép tính trên plaintext.

```
Ví dụ đơn giản:

Plaintext: x = 7
Encrypt(7) = Enc_7 (garbage bytes)

Thông thường:
  Muốn tính 7 + 3:
  Decrypt(Enc_7) = 7
  7 + 3 = 10
  Encrypt(10) = Enc_10

Homomorphic:
  HE_Add(Enc_7, 3) = Enc_10
  Decrypt(Enc_10) = 10

→ Cộng trực tiếp trên ciphertext mà không bao giờ decrypt!
```

### Các loại Homomorphic Encryption

```
1. Partially HE (PHE):
   - Chỉ hỗ trợ MỘT loại operation (chỉ + HOẶC chỉ ×)
   - Ví dụ: RSA hỗ trợ multiplication
   - Ví dụ: Paillier hỗ trợ addition
   - Thực tế: Có thể dùng cho một số use cases

2. Somewhat HE (SHE):
   - Hỗ trợ cả + và × nhưng có GIỚI HẠN số operations
   - Sau N operations → Noise tích lũy → Không decrypt được nữa
   - Cần bootstrapping để reset noise
   
3. Fully HE (FHE):
   - Hỗ trợ mọi operations không giới hạn
   - IBM HElib, Microsoft SEAL, Google's TFHE
   - Cực kỳ chậm (vì phải xử lý noise)
```

---

## 3. Tại Sao HE Quan Trọng?

### Use Case 1: Database Queries trên Encrypted Data

```
Hiện tại:
  Data trong database = PLAINTEXT
  DBA, cloud provider có thể đọc data

Với HE:
  Data trong database = ENCRYPTED
  Gửi encrypted query lên server
  Server tính toán trên encrypted data
  Server trả về encrypted result
  Client decrypt result với key của mình

  → Cloud provider / DBA chỉ thấy garbage bytes
  → Client có full privacy!
```

### Use Case 2: TLS Termination Không Cần Decrypt

```
Hiện tại (Layer 7 Load Balancer):
  Client → HTTPS → Load Balancer
  Load Balancer: Decrypt TLS → Xem URL path → Route
  
  Vấn đề: Load balancer thấy plaintext HTTP!
  Steve Gibson và nhiều security expert phản đối điều này
  
Với HE Load Balancer:
  Client → Encrypted request → Load Balancer
  Load Balancer: Tính routing decision trên encrypted headers
  Route đến backend mà không decrypt!
  
  → Zero knowledge routing
```

### Use Case 3: ML trên Private Data

```
Ứng dụng y tế:
  Bệnh viện A có data bệnh nhân
  Bệnh viện B muốn train chung model

  Hiện tại: Phải chia sẻ data (vi phạm privacy/HIPAA)
  
  Với HE:
  Bệnh viện A: Encrypt data → Gửi encrypted data
  Model training: Tính toán trên encrypted data
  Bệnh viện B: Nhận encrypted model gradients
  → Không ai thấy data của người khác!
  → Federated learning với HE
```

---

## 4. Demo IBM HElib - Tìm kiếm trên Encrypted Database

IBM đã release toolkit HElib (C++) cho phép demo thực tế.

### Setup

```bash
# Clone IBM HElib demo
git clone https://github.com/IBM/fhe-toolkit-linux

# Chạy Docker container với IBM toolkit
docker pull ibmcom/ibm-fhe-toolkit-ubuntu
docker run --rm -p 8443:8443 \
  --name fhe-demo \
  ibmcom/ibm-fhe-toolkit-ubuntu

# Truy cập VS Code trong browser
https://localhost:8443
```

### Database: Countries CSV

```
# country-db.csv (plaintext)
France,Paris
Germany,Berlin
Italy,Rome
Spain,Madrid
United Kingdom,London
Poland,Warsaw
...48 countries...

# Sau khi encrypt: encrypted-country-db.csv
[ENCRYPTED GARBAGE]
[ENCRYPTED GARBAGE]
[ENCRYPTED GARBAGE]
...
```

### Kết quả Demo

```
Search query: "France" (encrypted)
Process: Tìm kiếm trong 48 encrypted rows

Time: ~2 minutes!

Output: "Paris" (decrypted by client)

So sánh:
  Plaintext search: 48 rows < 1ms
  HE search: 48 rows ≈ 2 minutes
  → 120,000x chậm hơn!
```

---

## 5. Tại Sao HE Chậm Đến Vậy?

```
Vấn đề: Noise Management

Trong HE, mỗi operation thêm "noise" vào ciphertext:

Enc(7) + Enc(3) = Enc(10) + noise_level_1
Enc(10) + Enc(5) = Enc(15) + noise_level_2
...
Enc(x) + ... = Enc(y) + noise_level_too_high → CORRUPT!

Giải pháp: Bootstrapping
  - Periodically "reset" noise level
  - Bootstrapping rất expensive (dominant cost)
  - Đây là lý do HE chậm

Ví dụ về chi phí:
  AES128 encryption: ~1ns
  FHE equivalent operation: ~1ms (1 triệu lần chậm hơn)
```

### Tối ưu hóa tiềm năng

```
1. Multi-threading:
   Mỗi row = independent → Parallelize!
   48 cores → 48 rows cùng lúc → 48x speedup
   
2. SIMD batching (CKKS/BFV schemes):
   Nhét nhiều plaintext values vào 1 ciphertext
   1 HE operation → xử lý nhiều values cùng lúc
   
3. Hardware acceleration:
   FPGA cho HE operations
   Tương lai: Dedicated HE ASICs
   
4. Better algorithms:
   TFHE scheme: Faster bootstrapping
   CKKS: Approximate arithmetic (chấp nhận small errors)
```

---

## 6. Trạng Thái Hiện Tại (2024)

```
Sẵn sàng cho production? Gần như không.
Tại sao?

  Performance: Vẫn quá chậm cho real-time operations
  
  Tooling: Còn non-trẻ, khó dùng
  
  Standardization: Chưa có chuẩn rộng rãi

Có thể dùng cho:
  ✅ Asynchronous batch processing
     (không ai chờ kết quả real-time)
  ✅ Offline analytics
     (Chạy qua đêm, sáng dậy có kết quả)
  ✅ Privacy-preserving ML
     (Train models không lộ data)

Không nên dùng cho:
  ❌ Real-time database queries
  ❌ TLS termination (quá chậm cho web)
  ❌ Interactive applications
```

---

## 7. Tương Lai của HE

```
Dự đoán (đầu 2020s → 2030s):

1. Hardware acceleration sẽ làm HE viable:
   Intel HEXL: 30-60x speedup trên AVX512
   FPGA: 1000x speedup
   ASIC: Potentially 1,000,000x (speculation)

2. Các use cases đầu tiên sẽ là:
   - Medical data analytics (offline)
   - Government surveillance prevention
   - Privacy-preserving machine learning
   - Secure multi-party computation

3. "Homomorphic Database Engine" đầu tiên:
   Có thể trong 5-10 năm
   Sẽ bắt đầu với simple queries (WHERE id = X)
   Dần mở rộng sang complex queries

4. Standardization:
   ISO/IEC đang làm việc trên HE standards
   NIST PQC standards có thể tích hợp HE
```

---

## Kết Luận

```
Homomorphic Encryption là:
  ✅ Công nghệ game-changing về lý thuyết
  ✅ Proof-of-concept đã hoạt động
  ✅ Cải thiện nhanh chóng (2000x trong 10 năm)
  
  ❌ Chưa production-ready cho hầu hết use cases
  ❌ Còn quá chậm
  ❌ Tooling chưa mature

Tương tự như:
  Machine Learning năm 1980: "Tuyệt nhưng không practical"
  Machine Learning 2012: Breakthrough với deep learning
  
  HE hiện tại ≈ ML năm 1990s
  Đang chờ "moment" breakthrough về performance
```

---

**Tiếp theo:** 02-homomorphic-encryption-demo-va-code.md →
