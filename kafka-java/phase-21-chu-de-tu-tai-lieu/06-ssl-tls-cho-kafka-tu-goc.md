# Bài 6: SSL/TLS cho Kafka từ gốc — CA, keystore, truststore

[Phase 16](../phase-16-security/01-sasl-plaintext-ssl.md) đã hướng dẫn cấu hình `SASL_SSL` cho Kafka, nhưng cố ý bỏ qua phần tạo chứng chỉ với ghi chú *"phức tạp, để đội quản trị lo"*.

Trong thực tế bạn sẽ **phải** làm phần đó — ít nhất là ở môi trường dev và staging, và thường là cả production ở công ty nhỏ. Quan trọng hơn: không hiểu keystore khác truststore chỗ nào thì mỗi lần lỗi bắt tay TLS là mò kim đáy bể.

Bài này dựng từ gốc: hai kiểu mã hoá, cách TLS ghép chúng lại, chứng chỉ và chuỗi tin cậy, rồi mới tới các bước tạo cho Kafka.

## Hai kiểu mã hoá — và vì sao TLS cần cả hai

### Mã hoá đối xứng (symmetric)

```text
   MỘT khoá duy nhất, dùng cho cả mã hoá và giải mã.

   "Xin chào" ──[khoá K]──► "8f3a2b..." ──[khoá K]──► "Xin chào"
                  mã hoá                    giải mã

   Ưu:    RẤT NHANH — mã hoá gigabyte dữ liệu không thành vấn đề
   Nhược: LÀM SAO đưa khoá K cho bên kia một cách an toàn?
          Gửi qua mạng thì kẻ nghe lén bắt được luôn.
```

### Mã hoá bất đối xứng (asymmetric)

```text
   MỘT CẶP khoá: Public Key (công khai) và Private Key (riêng tư).

   Public Key   → chia sẻ thoải mái cho bất kỳ ai
   Private Key  → giữ kín tuyệt đối trên máy chủ, KHÔNG BAO GIỜ gửi đi

   Mã hoá bằng Public Key  →  CHỈ Private Key tương ứng giải được
   Mã hoá bằng Private Key →  bất kỳ ai có Public Key đều giải được
                              (dùng để KÝ, chứng minh danh tính)

   Ưu:    Giải được bài toán trao khoá
   Nhược: CHẬM — chậm hơn đối xứng hàng trăm tới hàng nghìn lần
```

### TLS ghép hai kiểu lại

Đây là ý tưởng cốt lõi, và nó rất thanh lịch:

```text
   ┌─────────────────────────────────────────────────────────────┐
   │  GIAI ĐOẠN 1 — BẮT TAY (handshake)                          │
   │  Dùng BẤT ĐỐI XỨNG (chậm, nhưng chỉ vài gói tin)            │
   │  Mục tiêu: hai bên cùng thống nhất được một khoá phiên       │
   │            (session key) mà kẻ nghe lén không biết           │
   ├─────────────────────────────────────────────────────────────┤
   │  GIAI ĐOẠN 2 — TRUYỀN DỮ LIỆU                                │
   │  Dùng ĐỐI XỨNG với khoá phiên vừa thống nhất                 │
   │  (nhanh, và đây là phần chiếm 99,99% lưu lượng)              │
   └─────────────────────────────────────────────────────────────┘

   → Lấy được ưu điểm của cả hai: an toàn khi trao khoá + nhanh khi truyền.
```

Bắt tay TLS rút gọn:

```text
   CLIENT                                          SERVER
      │                                               │
      │──── ClientHello ─────────────────────────────►│
      │     (danh sách bộ mã hoá tôi hỗ trợ)          │
      │                                               │
      │◄─── ServerHello + CHỨNG CHỈ của server ───────│
      │     (chứng chỉ chứa PUBLIC KEY của server)    │
      │                                               │
      │ ┌──────────────────────────────────────┐      │
      │ │ Client KIỂM TRA chứng chỉ:           │      │
      │ │  1. Có do CA mình tin cậy ký không?  │      │
      │ │     (tra trong TRUSTSTORE)           │      │
      │ │  2. Còn hạn không?                   │      │
      │ │  3. Tên miền có khớp không?          │      │
      │ └──────────────────────────────────────┘      │
      │                                               │
      │──── vật liệu tạo khoá, mã hoá bằng ──────────►│
      │     PUBLIC KEY của server                     │
      │                                    ┌──────────────────────┐
      │                                    │ Server giải bằng     │
      │                                    │ PRIVATE KEY của mình │
      │                                    │ (lấy từ KEYSTORE)    │
      │                                    └──────────────────────┘
      │                                               │
      │  Hai bên cùng suy ra KHOÁ PHIÊN đối xứng      │
      │◄══════ dữ liệu mã hoá đối xứng ══════════════►│
```

Ba điều đọc ra từ sơ đồ này:

**Một — private key không bao giờ rời khỏi server.** Nó chỉ dùng để giải mã tại chỗ. Đây là lý do việc bảo vệ keystore quan trọng đến vậy.

**Hai — client cần truststore để kiểm tra chứng chỉ.** Không có truststore thì client không biết nên tin ai.

**Ba — TLS mặc định chỉ xác thực SERVER.** Client biết chắc mình đang nói chuyện với đúng server, nhưng server **không biết** client là ai. Muốn hai chiều thì cần mutual TLS (nói ở cuối bài).

> **Về tên gọi**: SSL đã lỗi thời và không an toàn (SSLv3 bị vô hiệu hoá từ 2015). Thứ đang dùng thực tế là **TLS 1.2 / 1.3**. Nhưng cả ngành vẫn quen gọi là "SSL", và Kafka cũng đặt tên tham số là `ssl.*`. Đọc "SSL" thì hiểu là "TLS".

## Chứng chỉ và chuỗi tin cậy

### Vấn đề: public key không tự chứng minh được nó là của ai

```text
   Server gửi: "Đây là public key của kafka1.acme.com"

   Nhưng KẺ TẤN CÔNG ở giữa cũng gửi được:
   "Đây là public key của kafka1.acme.com"   ← thực ra là key của hắn

   → Client không phân biệt được. Đây là tấn công NGƯỜI ĐỨNG GIỮA
     (man-in-the-middle).
```

### Lời giải: bên thứ ba đáng tin ký xác nhận

**CA** (Certificate Authority — cơ quan cấp chứng chỉ) là một thực thể độc lập mà cả hai bên cùng tin. Nó xác minh danh tính rồi **ký** vào chứng chỉ.

```text
   ┌──────────────────────────────────────────────────────────┐
   │  CHỨNG CHỈ (certificate) chứa gì                         │
   ├──────────────────────────────────────────────────────────┤
   │  Chủ thể (Subject):    CN=kafka1.acme.com                │
   │  Public Key:           30820122300d06092a...             │
   │  Người cấp (Issuer):   CN=Acme Internal CA               │
   │  Hiệu lực từ / đến:    2025-08-08 → 2026-08-08           │
   │  SAN (tên thay thế):   kafka1.acme.com, 10.0.1.5         │
   │  ─────────────────────────────────────────────────────   │
   │  CHỮ KÝ của CA:        a3f2b8c1...                       │
   │  (CA ký bằng PRIVATE KEY của CA)                         │
   └──────────────────────────────────────────────────────────┘
```

Cách client kiểm tra:

```text
   1. Client có PUBLIC KEY của CA trong TRUSTSTORE của mình
   2. Dùng public key đó GIẢI chữ ký trong chứng chỉ
   3. Giải ra khớp với nội dung chứng chỉ → CA thật sự đã ký → TIN
      Không khớp → chứng chỉ giả hoặc bị sửa → TỪ CHỐI KẾT NỐI
```

Kẻ tấn công không thể giả mạo vì hắn **không có private key của CA**.

### Keystore và Truststore — phân biệt dứt điểm

Đây là chỗ gây nhầm lẫn nhiều nhất. Một câu để nhớ:

> **Keystore chứa danh tính CỦA TÔI. Truststore chứa danh sách những kẻ TÔI TIN.**

```text
   ┌──────────────── KEYSTORE ─────────────────┐
   │  "Tôi là ai"                              │
   │                                            │
   │  • PRIVATE KEY của tôi   ← BÍ MẬT         │
   │  • Chứng chỉ của tôi (đã được CA ký)      │
   │                                            │
   │  Ai cần: bên nào phải CHỨNG MINH danh tính │
   │          → Kafka broker LUÔN cần           │
   │          → Client chỉ cần khi dùng mTLS    │
   │                                            │
   │  Rò rỉ file này = kẻ khác GIẢ MẠO được bạn │
   └────────────────────────────────────────────┘

   ┌──────────────── TRUSTSTORE ───────────────┐
   │  "Tôi tin ai"                             │
   │                                            │
   │  • Chứng chỉ của các CA mà tôi tin cậy    │
   │  • CHỈ có public key — không có bí mật     │
   │                                            │
   │  Ai cần: bên nào phải KIỂM TRA bên kia     │
   │          → Client LUÔN cần                 │
   │          → Broker cần khi dùng mTLS        │
   │                                            │
   │  Rò rỉ file này = không sao cả             │
   └────────────────────────────────────────────┘
```

Bảng tra ai cần gì:

| | Broker cần keystore | Broker cần truststore | Client cần keystore | Client cần truststore |
|---|---|---|---|---|
| **TLS một chiều** (mặc định) | **Có** | Không | Không | **Có** |
| **Mutual TLS (mTLS)** | **Có** | **Có** | **Có** | **Có** |

## Các bước tạo — làm được ngay

Ba bước: tạo CA, tạo keystore cho từng broker và nhờ CA ký, tạo truststore.

### Bước 1 — tạo CA nội bộ

```bash
# Sinh private key + chứng chỉ tự ký cho CA, hạn 10 năm
openssl req -new -x509 -keyout ca-key -out ca-cert -days 3650 \
  -subj "/CN=Acme Internal CA/OU=Platform/O=Acme/L=Hanoi/C=VN" \
  -passout pass:CaPassword123
```

Sinh ra hai file:

| File | Nội dung | Bảo mật |
|---|---|---|
| `ca-key` | Private key của CA | **BÍ MẬT TUYỆT ĐỐI**. Rò rỉ = kẻ khác ký được chứng chỉ giả cho mọi máy |
| `ca-cert` | Chứng chỉ công khai của CA | Chia sẻ thoải mái — nó sẽ vào truststore của mọi bên |

> Ở production, `ca-key` nên nằm trên máy offline hoặc trong HSM/Vault, **không** nằm trên máy Kafka.

### Bước 2 — keystore cho từng broker

```bash
BROKER=kafka1
STOREPASS=BrokerStorePass123

# 2a. Sinh cặp khoá cho broker, đưa vào keystore
#     SAN rất quan trọng: liệt kê MỌI tên/IP mà client sẽ dùng để gọi
keytool -keystore ${BROKER}.keystore.jks -alias ${BROKER} \
  -validity 365 -genkey -keyalg RSA -keysize 2048 \
  -storepass ${STOREPASS} -keypass ${STOREPASS} \
  -dname "CN=${BROKER}.acme.com, OU=Platform, O=Acme, L=Hanoi, C=VN" \
  -ext "SAN=DNS:${BROKER}.acme.com,DNS:${BROKER},DNS:localhost,IP:127.0.0.1"

# 2b. Tạo yêu cầu ký (CSR - Certificate Signing Request)
keytool -keystore ${BROKER}.keystore.jks -alias ${BROKER} \
  -certreq -file ${BROKER}.csr -storepass ${STOREPASS}

# 2c. CA ký vào CSR → sinh chứng chỉ đã ký
#     PHẢI giữ lại SAN, nếu không client sẽ báo lỗi không khớp tên
openssl x509 -req -CA ca-cert -CAkey ca-key -in ${BROKER}.csr \
  -out ${BROKER}-signed.crt -days 365 -CAcreateserial \
  -passin pass:CaPassword123 \
  -extfile <(printf "subjectAltName=DNS:${BROKER}.acme.com,DNS:${BROKER},DNS:localhost,IP:127.0.0.1")

# 2d. Nạp chứng chỉ CA vào keystore TRƯỚC (bắt buộc, nếu không bước 2e lỗi)
keytool -keystore ${BROKER}.keystore.jks -alias CARoot \
  -import -file ca-cert -storepass ${STOREPASS} -noprompt

# 2e. Nạp chứng chỉ đã ký vào keystore, thay cho chứng chỉ tự ký ban đầu
keytool -keystore ${BROKER}.keystore.jks -alias ${BROKER} \
  -import -file ${BROKER}-signed.crt -storepass ${STOREPASS} -noprompt
```

Hai chỗ hay sai nhất trong toàn bộ quy trình:

**SAN (Subject Alternative Name).** Từ Java 11 trở đi, việc kiểm tra tên miền **chỉ dựa vào SAN**, không dùng `CN` nữa. Thiếu SAN thì client báo:

```text
javax.net.ssl.SSLHandshakeException:
  No subject alternative names present
```

Và SAN phải liệt kê **mọi** tên client sẽ dùng: tên DNS đầy đủ, tên ngắn, `localhost`, IP.

**Thứ tự bước 2d và 2e.** Phải nạp `CARoot` **trước**. Đảo thứ tự thì lỗi:

```text
keytool error: java.lang.Exception: Failed to establish chain from reply
```

### Bước 3 — truststore

```bash
# Truststore chỉ chứa chứng chỉ CA. Cùng một file dùng chung cho mọi bên.
keytool -keystore kafka.truststore.jks -alias CARoot \
  -import -file ca-cert -storepass TrustStorePass123 -noprompt
```

### Bước 4 — cấu hình broker

```properties
listeners=INTERNAL://kafka1:9092,EXTERNAL://0.0.0.0:9093
advertised.listeners=INTERNAL://kafka1:9092,EXTERNAL://kafka1.acme.com:9093
listener.security.protocol.map=INTERNAL:PLAINTEXT,EXTERNAL:SSL
inter.broker.listener.name=INTERNAL

ssl.keystore.location=/etc/kafka/secrets/kafka1.keystore.jks
ssl.keystore.password=BrokerStorePass123
ssl.key.password=BrokerStorePass123

ssl.truststore.location=/etc/kafka/secrets/kafka.truststore.jks
ssl.truststore.password=TrustStorePass123

ssl.enabled.protocols=TLSv1.3,TLSv1.2
ssl.endpoint.identification.algorithm=https

# Không yêu cầu client xuất trình chứng chỉ (TLS một chiều).
# Đổi thành "required" để bật mutual TLS.
ssl.client.auth=none
```

### Bước 5 — cấu hình client

```yaml
spring:
  kafka:
    bootstrap-servers: kafka1.acme.com:9093
    properties:
      security.protocol: SSL
      ssl.truststore.location: /etc/app/secrets/kafka.truststore.jks
      ssl.truststore.password: ${KAFKA_TRUSTSTORE_PASSWORD}
      ssl.endpoint.identification.algorithm: https
```

### Bước 6 — kiểm chứng

```bash
# Xem chứng chỉ server thật sự trả về
openssl s_client -connect kafka1.acme.com:9093 -showcerts </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
```

```text
subject=CN = kafka1.acme.com, OU = Platform, O = Acme, L = Hanoi, C = VN
issuer=CN = Acme Internal CA, OU = Platform, O = Acme, L = Hanoi, C = VN
notBefore=Aug  8 09:00:00 2025 GMT
notAfter=Aug  8 09:00:00 2026 GMT
X509v3 Subject Alternative Name:
    DNS:kafka1.acme.com, DNS:kafka1, DNS:localhost, IP Address:127.0.0.1
```

```bash
# Thử một lệnh thật qua kênh SSL
kafka-topics.sh --bootstrap-server kafka1.acme.com:9093 \
  --command-config client-ssl.properties --list
```

## Mutual TLS — xác thực hai chiều

TLS một chiều chỉ chứng minh **server là thật**. Với hệ thống nội bộ, thường cần chứng minh **client cũng là thật**.

```properties
# Broker: bắt buộc client xuất trình chứng chỉ
ssl.client.auth=required
```

Ba giá trị:

| Giá trị | Ý nghĩa |
|---|---|
| `none` | Không hỏi chứng chỉ client (mặc định) |
| `requested` | Hỏi, nhưng client không có vẫn cho vào — **gần như vô dụng, đừng dùng** |
| `required` | Bắt buộc, không có thì từ chối |

Khi bật, mỗi client cũng cần keystore riêng, tạo theo đúng quy trình bước 2. Và Kafka lấy danh tính từ chính chứng chỉ đó để áp ACL:

```bash
kafka-acls.sh --bootstrap-server kafka1.acme.com:9093 \
  --add --allow-principal "User:CN=order-service.acme.com,OU=Apps,O=Acme,L=Hanoi,C=VN" \
  --operation Write --topic orders
```

Chuỗi principal phải **khớp chính xác** với `dname` lúc tạo keystore của client — sai một dấu cách là từ chối.

| | TLS một chiều | Mutual TLS |
|---|---|---|
| Mã hoá đường truyền | Có | Có |
| Client biết server là thật | Có | Có |
| Server biết client là ai | **Không** | **Có** |
| Phải phát hành chứng chỉ cho từng client | Không | **Có** — đây là gánh nặng vận hành thật |
| Xoay vòng chứng chỉ | Chỉ broker | **Mọi client** |

Gánh nặng của mTLS không nằm ở việc bật nó, mà ở việc **quản lý vòng đời hàng trăm chứng chỉ client**. Với 50 microservice, đó là 50 chứng chỉ phải theo dõi hạn và xoay vòng. Nhiều đội chọn **SASL/SCRAM + TLS một chiều** cho đơn giản — vẫn được mã hoá và xác thực, mà chỉ phải quản lý mật khẩu.

## Cái giá thật của việc bật TLS

Đây là phần hầu như không tài liệu nào nói rõ, và nó ảnh hưởng trực tiếp tới năng lực hệ thống.

```text
   KHÔNG có TLS — Kafka dùng ZERO-COPY
   ĐĨA → page cache ─────────────────────► card mạng
         (sendfile() của Linux, nhân HĐH làm hết)

   CÓ TLS — zero-copy KHÔNG DÙNG ĐƯỢC
   ĐĨA → page cache → vùng nhớ ứng dụng → MÃ HOÁ → bộ đệm socket → card mạng
                       (phải copy vào để mã hoá được)
```

Dữ liệu bắt buộc phải đi qua vùng nhớ tiến trình Kafka để mã hoá, nên **cơ chế zero-copy đã học ở [Phase 20 bài 4](../phase-20-kafka-internals/04-giai-phau-broker-topic-partition-replica.md) bị vô hiệu hoá**.

| Ảnh hưởng | Mức độ |
|---|---|
| Thông lượng | Giảm rõ rệt, thường **20–40%** tuỳ tải và phần cứng |
| CPU broker | Tăng đáng kể (mã hoá + copy bộ nhớ) |
| Độ trễ | Tăng thêm phần bắt tay ở mỗi kết nối mới |
| Áp lực rác (GC) | Tăng — dữ liệu đi qua heap |

Ba cách giảm thiệt hại:

| Cách | Hiệu quả |
|---|---|
| Chỉ bật TLS cho listener **EXTERNAL**, giữ inter-broker là PLAINTEXT trong VPC tin cậy | **Lớn nhất** — replication chiếm phần lớn lưu lượng |
| Bật nén (`compression.type=lz4`) | Ít byte hơn để mã hoá |
| Dùng CPU có tăng tốc AES (AES-NI) và chọn bộ mã hoá AES-GCM | Đáng kể |

Cách thứ nhất chính là kiến trúc nhiều listener đã trình bày ở [Phase 9 bài 1](../phase-9-kafka-cluster/01-replication-listeners.md) — và đây là lý do thực dụng nhất khiến nó tồn tại.

## Bảng bốn giao thức bảo mật của Kafka

| Giao thức | Mã hoá | Xác thực | Dùng khi |
|---|---|---|---|
| `PLAINTEXT` | Không | Không | Dev, hoặc inter-broker trong VPC tin cậy |
| `SSL` | **Có** | Chỉ khi bật mTLS | Cần mã hoá, danh tính lấy từ chứng chỉ |
| `SASL_PLAINTEXT` | Không | **Có** | Mạng nội bộ đã an toàn nhưng cần biết ai là ai |
| `SASL_SSL` | **Có** | **Có** | **Mặc định cho production** |

Kết hợp phổ biến nhất ở production: **`SASL_SSL` với cơ chế SCRAM-SHA-512** — TLS lo mã hoá, SCRAM lo xác thực bằng username/password. Đơn giản hơn mTLS nhiều mà vẫn đủ an toàn.

## Bẫy thường gặp

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| `No subject alternative names present` | Thiếu SAN trong chứng chỉ | Thêm `-ext SAN=...` khi tạo **và** `-extfile` khi ký |
| `No name matching kafka1 found` | SAN thiếu tên client đang dùng | Liệt kê đủ mọi tên/IP vào SAN |
| `Failed to establish chain from reply` | Nạp chứng chỉ đã ký **trước** khi nạp CA | Nạp `CARoot` trước, rồi mới nạp chứng chỉ broker |
| `unable to find valid certification path` | Truststore của client không có CA | Nạp `ca-cert` vào truststore |
| `Keystore was tampered with, or password was incorrect` | Sai mật khẩu keystore | Kiểm tra `ssl.keystore.password` và `ssl.key.password` |
| Kết nối được nhưng treo, không có lỗi | Trỏ client SSL vào cổng PLAINTEXT (hoặc ngược lại) | Kiểm tra `listener.security.protocol.map` |
| Đang chạy tốt rồi đột nhiên toàn bộ client không nối được | **Chứng chỉ hết hạn** | Đặt cảnh báo trước hạn 30 ngày. Đây là sự cố kinh điển |
| `ssl.endpoint.identification.algorithm=` để rỗng | Tắt kiểm tra tên miền → **mở cửa cho tấn công người đứng giữa** | Giữ giá trị `https` |
| Bật TLS xong thông lượng tụt mà không hiểu vì sao | Mất zero-copy | Đây là hành vi đúng. Chỉ bật TLS cho listener external |
| Bật `ssl.client.auth=requested` | Client không có chứng chỉ vẫn vào được → **tưởng an toàn mà không** | Dùng `required` |

Dòng "chứng chỉ hết hạn" đáng nhấn: đây là sự cố production kinh điển nhất liên quan tới TLS. Hệ thống chạy êm 364 ngày rồi **toàn bộ client mất kết nối cùng lúc**, thường vào lúc nửa đêm. Bắt buộc phải có cảnh báo tự động:

```bash
# Kiểm tra hạn chứng chỉ trong keystore
keytool -list -v -keystore kafka1.keystore.jks -storepass "$STOREPASS" \
  | grep -A1 "Valid from"
```

## Tóm tắt bài 6

- TLS **ghép hai kiểu mã hoá**: bất đối xứng (chậm, an toàn) để **bắt tay và trao khoá phiên**, rồi đối xứng (nhanh) để **truyền dữ liệu**. Lấy ưu điểm của cả hai.
- **Private key không bao giờ rời khỏi server.** Nó chỉ dùng để giải mã tại chỗ.
- **CA** giải bài toán "public key này thật sự của ai" bằng cách ký xác nhận. Client kiểm tra chữ ký đó bằng public key của CA nằm trong truststore.
- Câu để nhớ: **Keystore chứa danh tính CỦA TÔI (private key + chứng chỉ). Truststore chứa danh sách những kẻ TÔI TIN (chứng chỉ CA).** Rò rỉ keystore là thảm hoạ; rò rỉ truststore thì không sao.
- TLS một chiều: **broker cần keystore, client cần truststore**. mTLS thì **cả hai bên cần cả hai**.
- Hai lỗi hay gặp nhất khi tạo chứng chỉ: **thiếu SAN** (từ Java 11, `CN` không còn được dùng để kiểm tra tên) và **sai thứ tự nạp CARoot** trước chứng chỉ đã ký.
- **mTLS** cho xác thực hai chiều nhưng gánh nặng thật là **quản lý vòng đời hàng trăm chứng chỉ client**. Nhiều đội chọn **SASL/SCRAM + TLS một chiều** cho đơn giản.
- **Bật TLS làm mất zero-copy** → thông lượng giảm khoảng **20–40%**, CPU tăng. Giảm thiệt hại bằng cách chỉ bật TLS cho **listener external**, giữ inter-broker là PLAINTEXT trong VPC tin cậy.
- Kết hợp mặc định cho production: **`SASL_SSL` + SCRAM-SHA-512**.
- Sự cố TLS kinh điển nhất: **chứng chỉ hết hạn** làm mọi client mất kết nối cùng lúc. Bắt buộc có cảnh báo trước hạn.

**Bài kế tiếp** → [Bài 7: Ba tầng test cho Kafka — Test Binder, EmbeddedKafka, Testcontainers](07-ba-tang-test-cho-kafka.md)
