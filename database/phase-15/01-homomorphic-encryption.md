# Bài 1: Homomorphic Encryption - Mã Hóa Đồng Cấu

## Vấn đề: Tại sao không thể luôn mã hóa?

### Mã hóa bình thường hoạt động tốt cho:

```
Mã hóa khi truyền (Encryption in transit):
  Client ─[HTTPS/TLS]─► Server
  → Data được mã hóa khi di chuyển qua mạng ✅

Mã hóa khi lưu (Encryption at rest):
  Database files ─[AES-256]─► Disk
  → Files được mã hóa trên đĩa cứng ✅
```

### Vấn đề: Cần xử lý dữ liệu

```
Để query database, data PHẢI được giải mã trước:

  Encrypted DB → Decrypt → Process → Re-encrypt → Store
  
  SELECT * FROM users WHERE age > 25;
  
  → Số 25 và tuổi của mỗi user phải so sánh được
  → Nếu tuổi bị encrypt thì KHÔNG thể so sánh!
  → Database phải decrypt toàn bộ trước khi query
```

### Các tình huống buộc phải giải mã:

```
1. Database queries:
   → WHERE age > 25 → Cần số thực để so sánh
   → WHERE name LIKE 'Ali%' → Cần string thực để tìm kiếm
   → Indexing → Index trên data đã decrypt

2. Analytics và recommendations:
   → Machine learning models cần data thực
   → Trend analysis, recommendation engines
   → Twitter cannot run "Top Trending" trên encrypted data

3. Load balancer / Reverse proxy (Layer 7):
   → L7 load balancer cần đọc HTTP headers, URL path
   → "Nếu path = /api/users → Route đến server A"
   → Phải terminate TLS để đọc content
   → → Decrypt traffic = Security risk!

4. Application processing:
   → Mọi backend application đều phải decrypt để xử lý
   → NodeJS, Python, Java đọc data → Plain text trong memory
```

---

## Homomorphic Encryption: Giải pháp

### Định nghĩa

```
Homomorphic Encryption (HE) = 
  Khả năng thực hiện phép toán trên DỮ LIỆU ĐÃ MÃ HÓA
  mà KHÔNG CẦN giải mã.

  Encrypt(7) + Encrypt(3) = Encrypt(10)
  
  → Bạn không bao giờ thấy số 7 hay số 3
  → Chỉ thấy ciphertext, nhưng phép cộng vẫn hoạt động!
  → Kết quả giải mã = 10 (đúng)
```

### So sánh: Traditional vs Homomorphic

```
Traditional (hiện tại):
  Client                     Database Server
    │                              │
    │── Encrypted Query ──────────►│
    │                              │ Decrypt(key)
    │                              │ Run query on PLAINTEXT
    │                              │ Encrypt(key)
    │◄── Encrypted Result ─────────│
    
  Vấn đề: Database server THẤY data khi decrypt!

Homomorphic (tương lai):
  Client                     Database Server
    │                              │
    │── Encrypted Query ──────────►│
    │                              │ Run query on CIPHERTEXT
    │                              │ (không cần decrypt!)
    │◄── Encrypted Result ─────────│
    │ Decrypt(key)
    │ Đọc result
    
  Database server KHÔNG BAO GIỜ thấy data thực!
```

---

## Cơ chế hoạt động

### Phép toán trên ciphertext

```
Mathematical foundation:

Symmetric encryption thông thường:
  E(a) = encrypted_a
  E(b) = encrypted_b
  
  E(a) + E(b) ≠ E(a + b)   ← Không thể cộng ciphertext!

Homomorphic encryption:
  E(a) ⊕ E(b) = E(a + b)   ← Phép toán đặc biệt ⊕ trên ciphertext
                               cho kết quả = encrypt của tổng!

Ví dụ:
  E(7) ⊕ E(3) = E(10)       ← Tính trực tiếp trên ciphertext
  Decrypt(E(10)) = 10        ← Giải mã cho đúng kết quả
```

### Các loại Homomorphic Encryption

```
1. Partially Homomorphic Encryption (PHE):
   → Chỉ hỗ trợ 1 loại phép toán (hoặc +, hoặc ×)
   → Ví dụ: RSA (hỗ trợ nhân)
   → Nhanh hơn, thực tế hơn

2. Somewhat Homomorphic Encryption (SHE):
   → Hỗ trợ cả + và × nhưng giới hạn số lần thực hiện
   → Sau quá nhiều phép toán → noise tích lũy → cần bootstrap

3. Fully Homomorphic Encryption (FHE):
   → Hỗ trợ tất cả phép toán không giới hạn
   → IBM FHE Toolkit là FHE
   → Rất chậm (hiện tại)
```

---

## Demo: IBM FHE Toolkit

### Setup

```bash
# IBM cung cấp Docker image với FHE toolkit
docker pull ibmcom/fhe-toolkit-ubuntu

# Chạy container
docker run -it ibmcom/fhe-toolkit-ubuntu bash

# Compile C++ code
cd /opt/IBM/FHE-Toolkit-Linux
make
```

### Database ví dụ (CSV - chưa mã hóa)

```
countries_eu.csv:
  Country,Capital
  France,Paris
  Germany,Berlin
  Italy,Rome
  Spain,Madrid
  ...
  (48 rows tổng cộng)
```

### Quy trình mã hóa và query

```
1. Load database từ CSV:
   plaintext_db = load_csv("countries_eu.csv")

2. Mã hóa toàn bộ database:
   encrypted_db = HE_Encrypt(plaintext_db, key)
   → Mỗi row trở thành ciphertext
   → Không thể đọc được!

3. Client muốn tìm capital của France:
   query = HE_Encrypt("France", key)
   
4. Tìm kiếm trên encrypted database:
   for encrypted_row in encrypted_db:
       match = HE_Compare(encrypted_row.country, query)
       if match:
           return encrypted_row.capital
   
   → KHÔNG có gì được decrypt trong quá trình này!

5. Client nhận kết quả và decrypt:
   result = HE_Decrypt(encrypted_result, key)
   → "Paris"
```

### Kết quả thực tế

```
Tìm kiếm "France" trong 48 rows:
  → Thời gian: ~2 phút (trên MacBook 2015)!

So sánh:
  Traditional SQL:  SELECT capital FROM countries WHERE name = 'France'
  → ~1ms

  Homomorphic:      HE search qua 48 records
  → ~120,000ms (120 giây!)

→ Chậm hơn 120,000,000x (!)
```

---

## Ứng dụng tiềm năng (khi đủ nhanh)

### Use cases phù hợp

```
1. Cloud database privacy:
   → Upload encrypted data lên cloud
   → Cloud provider KHÔNG bao giờ thấy data thực
   → Run queries từ client với key riêng
   
   Use case: Medical records, financial data trên cloud

2. Secure analytics:
   → Data analyst chạy analytics trên encrypted patient data
   → Hospital giữ key, analyst không thấy data cá nhân
   
3. Asynchronous recommendations:
   → Twitter/Facebook chạy recommendation engine trên encrypted data
   → User data không bao giờ bị giải mã tại server
   → Latency cao nhưng batch processing: Chấp nhận được!

4. Secure load balancing:
   → L7 load balancer route traffic DỰA TRÊN encrypted headers
   → Load balancer KHÔNG thể đọc content
   → Giải quyết vấn đề "TLS termination" controversy
   
5. Privacy-preserving ML:
   → Train ML model trên encrypted training data
   → Model owner không biết training data là gì
```

### Không phù hợp cho

```
❌ Real-time interactive queries (quá chậm)
❌ Write-heavy workloads (mỗi insert cần encrypt)
❌ Complex queries (JOINs, aggregations khó implement)
❌ Thay thế cho standard database hiện tại
```

---

## Trạng thái hiện tại (2024)

```
Is it production ready? NO.

Challenges:
  1. Performance: Chậm hơn 100,000x so với plaintext operations
  2. Complexity: Implement rất phức tạp
  3. Limited operations: Không hỗ trợ mọi phép toán
  4. Noise accumulation: FHE cần bootstrap để làm mới ciphertext
  5. Key management: Client phải giữ key

Research progress:
  - IBM: FHE Toolkit (C++)
  - Microsoft: SEAL library
  - Google: FHE transpiler
  - Academic: CKKS, BFV, BGV schemes
  
  → Mỗi năm performance tăng ~10x
  → Có thể practical cho một số use cases trong 5-10 năm
```

---

## Timeline và Kỳ vọng

```
2009: Craig Gentry (IBM) chứng minh FHE khả thi về lý thuyết
      → ~1 tỷ phép toán/bit → Không thể dùng thực tế
      
2011-2020: CKKS, BGV schemes → Cải thiện đáng kể

2021: IBM FHE Toolkit → Demo thực tế đầu tiên
      → Vẫn quá chậm cho production

~2030 (dự đoán): Có thể đủ nhanh cho một số use cases

"Throwing more CPU cores helps a lot"
  → Parallelizable: Mỗi row có thể encrypt/process độc lập
  → GPU acceleration đang được nghiên cứu
```

---

## Key Takeaways

```
1. Homomorphic Encryption = Phép toán trên ciphertext
   → Không cần decrypt để process!
   
2. Vấn đề lớn nhất: Performance (chậm ~100,000x)

3. Phù hợp nhất cho:
   → Asynchronous, latency-insensitive workloads
   → Healthcare, financial, privacy-critical applications
   → Cloud storage với data sovereignty requirements

4. KHÔNG thay thế traditional encryption, mà bổ sung:
   → Traditional: Mã hóa khi không cần xử lý
   → Homomorphic: Mã hóa khi cần xử lý

5. Đây là future technology:
   → Không dùng cho production hiện tại
   → Theo dõi: IBM FHE, Microsoft SEAL, Google FHE
```

---

**Tiếp theo:** Phase 16 - Answering Your Questions (Q&A Summary) →
