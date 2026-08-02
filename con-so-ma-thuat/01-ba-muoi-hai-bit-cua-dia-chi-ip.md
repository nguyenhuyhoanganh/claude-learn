# Bài 1: 32 bit — vì sao 4,29 tỷ địa chỉ IP lại không đủ

Mở máy lên xem địa chỉ IP của bạn. Nó ghi `192.168.1.7`.

Con số đó **chỉ có nghĩa trong nhà bạn**. Ra khỏi cửa là nó biến mất. Và địa chỉ thật mà Internet nhìn thấy thì bạn đang dùng chung với hàng nghìn người lạ.

Cái trần tạo ra tình cảnh này được chốt vào năm nào? Chọn nhanh một mốc trong đầu:

```text
        1981          1988          1995
```

Giữ lấy con số bạn vừa chọn. Nếu bạn chọn một trong hai mốc bên phải, bạn đang đứng đúng chỗ mà gần như tất cả mọi người đứng.

Và trước khi biết đáp án, hãy nghe câu mà gần như ai cũng buột miệng nói:

> *"4 tỷ địa chỉ mà vẫn không đủ à? Chọn kiểu gì mà thiển cận thế, để giờ cả ngành phải gánh!"*

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **IP** (*Internet Protocol*) | ai-pi | **Giao thức Internet** — luật đánh địa chỉ và chuyển gói tin |
| **IPv4 / IPv6** | ai-pi-vi-bốn | **Phiên bản 4** (32 bit) và **phiên bản 6** (128 bit) của giao thức IP |
| **RFC** (*Request For Comments*) | a-rờ-ép-xi | **Tài liệu chuẩn** của Internet; `RFC 791` định nghĩa IPv4 |
| **ARPANET** | ác-pa-nét | **Mạng tiền thân của Internet**, do Bộ Quốc phòng Mỹ tài trợ |
| **IMP** (*Interface Message Processor*) | im-pờ | **Máy xử lý gói tin** — ông tổ của router hiện đại |
| **Header** | héd-dơ | **Phần đầu gói tin** — chứa địa chỉ nguồn, đích và thông tin điều khiển |
| **Classful addressing** | clát-phun | **Chia lớp** — cách cấp địa chỉ theo lớp A/B/C cố định |
| **CIDR** (*Classless Inter-Domain Routing*) | xai-đơ | **Định tuyến không phân lớp** — cấp địa chỉ theo khối tuỳ ý |
| **Subnet mask / prefix** | sáp-nét | **Mặt nạ mạng** — phần nào của địa chỉ là "mạng", phần nào là "máy" |
| **NAT** (*Network Address Translation*) | nát | **Dịch địa chỉ mạng** — nhiều máy nội bộ nấp chung một IP công cộng |
| **CGNAT** (*Carrier-Grade NAT*) | | **NAT cấp nhà mạng** — cả nghìn thuê bao chung một IP công cộng |
| **Private IP** | | **IP nội bộ** — `10.x`, `172.16–31.x`, `192.168.x`; không đi ra Internet |
| **Public IP** | | **IP công cộng** — địa chỉ Internet nhìn thấy |
| **Dual-stack** | đu-ần stắc | **Chạy song song** cả IPv4 và IPv6 trên cùng một thiết bị |

## Tua ngược về căn phòng đó

**Tháng 9 năm 1981.** Một nhóm nhỏ ở California phát hành tài liệu **RFC 791** — nó định nghĩa chính cái địa chỉ IP bạn đang dùng hôm nay.

Sớm hơn mốc gần nhất bạn vừa chọn 14 năm. Và sớm hơn cả ngày ARPANET chính thức chạy giao thức này.

Trước khi gõ búa kết tội, hãy xem họ có gì trong tay.

### Ràng buộc ① — toàn mạng có **213 máy**

```text
   MẠNG ARPANET NĂM 1981 CÓ BAO NHIÊU MÁY?

   Con số này được ghi lại hẳn hoi: 213.

   Không phải 213.000. Càng không phải 213 triệu.
   Trung bình khoảng 20 ngày mới có thêm đúng MỘT máy nối vào.
```

```text
   GIỜ BẠN ĐANG NGỒI Ở CHÍNH CÁI BÀN ĐÓ.
   Mạng có 213 máy. Bạn cấp bao nhiêu bit cho địa chỉ?

   Họ chốt 32 bit → 4.294.967.296 địa chỉ.

        4.294.967.296  ÷  213 máy  =  20.164.729

   HỌ KHÔNG CẤP "VỪA ĐỦ DÙNG".
   HỌ CẤP GẤP 20 TRIỆU LẦN CÁI HỌ ĐANG CÓ.
```

> **Cửa 1 đã đóng:** họ **có** lường trước, và lường **gấp 20 triệu lần**.

### Ràng buộc ② — 20 tháng trước đó, cả hành tinh chỉ có 256 mạng

Đã dám nghĩ tới hàng tỷ, sao không nghĩ nghìn tỷ luôn? Muốn hiểu, phải lật bản trước đó ra.

```text
   RFC 760 — tháng 1 năm 1980, chỉ 20 tháng trước:

   ┌────────────┬───────────────────────────────────┐
   │  8 bit     │            24 bit                 │
   │  SỐ MẠNG   │          SỐ MÁY                   │
   └────────────┴───────────────────────────────────┘
     2⁸ = 256 mạng CHO CẢ THẾ GIỚI

   RFC 791 — tháng 9 năm 1981:

     Số mạng: 256  →  2.097.152     (2²¹)
                       ▲
              GẤP 8.000 LẦN TRONG 20 THÁNG
```

Thử đặt mình vào chỗ họ ngồi: bạn vừa nhân sức chứa của cả hệ thống lên **8.000 lần trong chưa đầy hai năm**. Có ai đứng dậy bảo rằng như thế vẫn còn hẹp không?

> **Cửa 2 đã đóng:** cú nới từ 256 lên 2 triệu mạng là **cú nới rộng lớn nhất từng có** trong lịch sử giao thức này.

### Ràng buộc ③ — cái máy định tuyến có **24 KB RAM**

Sao không dùng luôn 64 bit cho chắc ăn?

```text
   MÁY IMP — ông tổ của cái router đang nằm trong nhà bạn:

      12.000 từ nhớ × 16 bit/từ  =  24 KB RAM

   24 KB đó là bộ nhớ của CẢ CÁI MÁY:
   hệ điều hành + bảng định tuyến + bộ đệm gói tin + mọi thứ.

   Để so sánh: một tin nhắn văn bản dài trên điện thoại bạn
   còn nặng hơn phần bộ nhớ mà máy đó dành cho một tính năng.
```

Và có một ràng buộc còn cứng hơn cả RAM:

```text
   PHẦN ĐẦU GÓI TIN (HEADER) BỊ KHOÁ CỨNG Ở 20 BYTE

   ┌──────────────────────────────────────────────────┐
   │  IP HEADER — 20 byte                             │
   ├────┬────┬──────┬──────────┬──────────┬──────────┤
   │ver │len │ ...  │   TTL    │ NGUỒN 4B │ ĐÍCH 4B  │
   └────┴────┴──────┴──────────┴──────────┴──────────┘
                                    ▲          ▲
                          Máy IMP tìm địa chỉ đích bằng cách
                          ĐẾM ĐÚNG SỐ Ô, không đọc hiểu.
                          Thêm 4 byte là đếm trượt hết.

   VÀ CÁI GIÁ 4 BYTE ĐÓ NHÂN VỚI MỌI GÓI TIN
   CỦA CẢ HÀNH TINH, MÃI MÃI.
```

> **Cửa 3 đã đóng:** phần cứng thời đó **không cõng nổi** header lớn hơn.

### Ràng buộc ④ — và đây mới là lý do thật sự nó cạn

Ba thẻ trên giải thích được con số 32. Chúng **không** giải thích được vì sao 4 tỷ lại hết.

Câu trả lời không nằm ở con số 32. Nó nằm ở **cách chia**.

```text
   BẢN 1981 CẮT KHO ĐỊA CHỈ THÀNH BA LỚP CỐ ĐỊNH:

   ┌────────┬──────────────┬───────────────────────────┐
   │ Lớp A  │ 16.777.214   │ máy mỗi mạng              │
   │ Lớp B  │     65.534   │ máy mỗi mạng              │
   │ Lớp C  │        254   │ máy mỗi mạng              │
   └────────┴──────────────┴───────────────────────────┘
                    ▲
        KHÔNG CÓ LỰA CHỌN NÀO Ở GIỮA.

   CÔNG TY CỦA BẠN CÓ 300 MÁY:
      Lớp C cho 254  →  KHÔNG ĐỦ
      Lớp B cho 65.534 →  buộc phải xin lớp B

   Bạn vừa lấy 65.534 địa chỉ về để dùng đúng 300.
   → 65.234 ĐỊA CHỈ BỊ KHOÁ TÊN BẠN, KHÔNG AI DÙNG ĐƯỢC NỮA.
```

Nhân chuyện đó với vài nghìn công ty trong mười năm.

> **Cửa 4 đã đóng:** kho địa chỉ **không cạn vì hết chỗ** — nó cạn vì **chỗ trống đã có chủ**. Bốn tỷ hết là vì bốn tỷ đó chưa từng được chia lẻ ra.

## Lịch sử giải cứu — và vì sao IPv6 vẫn chưa thắng

```text
   CẢ BỐN RÀNG BUỘC ĐỀU ĐÃ HẾT HIỆU LỰC:

   ① 213 máy      →  hàng chục tỷ thiết bị
   ② 256 mạng     →  CIDR (9/1993) xoá sạch việc chia lớp,
                      muốn xin bao nhiêu địa chỉ cũng được
   ③ 24 KB RAM    →  router rẻ nhất hôm nay có 128 MB
                      (gấp hàng chục nghìn lần)
   ④ Chia lớp     →  NAT (5/1994) cho nhiều máy nấp chung một IP
                      IPv6 sẵn sàng từ 1998 — gần 30 năm rồi
```

**Nhưng cái kim đồng hồ thì không nhúc nhích.** Vì sao?

```text
   ┌────────────────────────────────────────────────────────────┐
   │                                                             │
   │   NGƯỜI ĐAU:        Bạn                                    │
   │                     · cuộc gọi qua mạng bị rớt              │
   │                     · không có IP tĩnh                      │
   │                     · không tự host được gì                 │
   │                     · bị chặn oan vì dùng chung IP          │
   │                                                             │
   │   NGƯỜI SỬA ĐƯỢC:   Nhà mạng (ISP)                         │
   │                     · chi phí đổi hạ tầng                   │
   │                     · thiết bị cũ không hiểu IPv6           │
   │                     · KHÁCH KHÔNG AI ĐÒI                    │
   │                                                             │
   └────────────────────────────────────────────────────────────┘

   → NÓ VẪN Ở ĐÂY, VÌ NGƯỜI SỬA ĐƯỢC KHÔNG PHẢI NGƯỜI ĐAU VÌ NÓ.
```

Đây là một dạng vấn đề rất phổ biến trong kỹ thuật, và bạn sẽ gặp lại nó ở [bài 2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) với con số 1500, và ở [bài 3](03-bon-byte-cua-dong-ho-unix.md) với con số 4 byte: **chi phí và lợi ích rơi vào hai bên khác nhau.**

## Kiến trúc: gói tin của bạn thật ra đi qua những đâu

```text
   ┌──────────────┐
   │ Máy bạn      │  192.168.1.7        ← IP NỘI BỘ, chỉ có nghĩa trong nhà
   └──────┬───────┘
          │
   ┌──────▼───────┐
   │ Router nhà   │  NAT lần 1
   └──────┬───────┘  192.168.1.7:51234  →  100.64.3.19:41022
          │
   ┌──────▼───────┐
   │ CGNAT nhà mạng│ NAT lần 2           ← HÀNG NGHÌN THUÊ BAO
   └──────┬───────┘  100.64.3.19:41022  →  113.161.42.7:9natport
          │                                        ▲
          │                          ĐÂY MỚI LÀ IP MÀ SERVER NHÌN THẤY
   ┌──────▼───────┐
   │  Internet    │
   └──────┬───────┘
   ┌──────▼───────┐
   │  Server      │  log ghi: 113.161.42.7
   └──────────────┘  ← và cả toà nhà hàng xóm cũng ghi y hệt
```

```text
   HỆ QUẢ THỰC TẾ CHO CODE CỦA BẠN:

   ① IP TRONG LOG KHÔNG ĐỊNH DANH ĐƯỢC MỘT NGƯỜI
   ② CHẶN MỘT IP = CHẶN CẢ NGHÌN NGƯỜI VÔ TỘI
   ③ RATE LIMIT THEO IP = MỘT NGƯỜI XẤU LÀM CẢ TOÀ NHÀ BỊ KHOÁ
   ④ "IP HASH" ĐỂ CHIA TẢI = DỒN CẢ NGHÌN NGƯỜI VÀO MỘT MÁY CHỦ
```

## Ba thứ bạn sửa được ngay tuần này

### ① Cột IP đừng khai `VARCHAR(15)` nữa

```sql
-- ❌ Đủ cho IPv4, KHÔNG đủ cho IPv6
ip_address VARCHAR(15)      -- "255.255.255.255" = 15 ký tự

-- ✅ Đủ cho mọi trường hợp
ip_address VARCHAR(45)
```

```text
   VÌ SAO LÀ 45 KÝ TỰ?

   IPv6 đầy đủ:            8 nhóm × 4 ký tự + 7 dấu hai chấm  = 39
   IPv6 kèm IPv4 nhúng:    "::ffff:192.168.100.228"
   IPv6 kèm zone index:    "fe80::1%eth0"
   ─────────────────────────────────────────────────────────────
   TRẦN AN TOÀN                                              = 45
```

```sql
-- ✅ TỐT HƠN NỮA trên PostgreSQL — dùng kiểu chuyên dụng
ip_address INET        -- lưu 7 hoặc 19 byte, KHÔNG phải 45
                       -- so sánh, sắp xếp, kiểm tra dải mạng đều đúng

-- Và nó cho bạn những thứ VARCHAR không làm được:
SELECT * FROM access_log WHERE ip_address << '10.0.0.0/8';    -- nằm trong dải
SELECT * FROM access_log WHERE family(ip_address) = 6;         -- lọc IPv6
CREATE INDEX ON access_log USING gist (ip_address inet_ops);   -- index theo dải
```

```text
   ⚠ NẾU BẠN LƯU VARCHAR VÀ MUỐN SẮP XẾP:
      '9.0.0.1' > '10.0.0.1'  →  TRUE   (so sánh chuỗi, không phải số!)
   → Đây là lỗi im lặng: báo cáo sắp sai mà không ai báo lỗi.
```

### ② Đừng dùng IP làm định danh hay ranh giới bảo mật

```java
// ❌ Sau NAT có thể là cả một toà nhà
if (failedLoginsByIp.get(ip) > 5) {
    blockIp(ip);                      // vừa khoá cả công ty của khách hàng
}

// ✅ Khoá theo TÀI KHOẢN, dùng IP làm TÍN HIỆU PHỤ
if (failedLoginsByAccount.get(username) > 5) {
    lockAccount(username, Duration.ofMinutes(15));
}
if (distinctAccountsAttemptedFromIp(ip) > 50) {
    requireCaptcha(ip);               // làm chậm lại, KHÔNG chặn cứng
}
```

```text
   NGUYÊN TẮC:

   IP là TÍN HIỆU, không phải DANH TÍNH.
   · Dùng để tính điểm rủi ro, để yêu cầu captcha, để cảnh báo   ✅
   · Dùng để chặn cứng, để phân quyền, để định danh người dùng   ❌

   NGOẠI LỆ HỢP LỆ: allowlist IP cho kết nối máy-với-máy
   (dịch vụ nội bộ, đối tác có IP tĩnh cố định) — nhưng phải kèm
   xác thực thật, IP chỉ là lớp phòng thủ thứ hai.
```

### ③ Lấy IP thật cho đúng — và đừng tin nó một cách mù quáng

```java
// ❌ SAI HOÀN TOÀN: X-Forwarded-For do CLIENT gửi, giả mạo được
String ip = request.getHeader("X-Forwarded-For");

// ❌ VẪN SAI: kẻ tấn công gửi sẵn "X-Forwarded-For: 1.2.3.4"
//    proxy của bạn nối thêm vào ĐUÔI → phần tử ĐẦU là giá trị GIẢ
String ip = request.getHeader("X-Forwarded-For").split(",")[0];
```

```text
   X-Forwarded-For: 1.2.3.4, 203.0.113.9, 10.0.0.5
                    ▲          ▲            ▲
                    │          │            └── proxy nội bộ (tin được)
                    │          └─────────────── IP THẬT (tin được)
                    └────────────────────────── KẺ TẤN CÔNG TỰ GHI VÀO

   → PHẢI ĐẾM NGƯỢC TỪ PHẢI SANG, bỏ qua đúng số proxy tin cậy của bạn.
```

```yaml
# ✅ Để framework làm, và khai rõ proxy nào tin được
server:
  forward-headers-strategy: native
  tomcat:
    remoteip:
      remote-ip-header: X-Forwarded-For
      # CHỈ tin các proxy trong dải này; phần còn lại coi là client
      internal-proxies: "10\\.0\\.0\\.\\d{1,3}|172\\.16\\.\\d{1,3}\\.\\d{1,3}"
```

```text
   ⚠ VÀ NHỚ: API GATEWAY PHẢI XOÁ HEADER X-* DO CLIENT GỬI VÀO
     trước khi tự ghi lại. Không xoá = mọi biện pháp trên đều vô nghĩa.
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Hệ thống chặn đăng nhập sai quá 5 lần theo IP. Một buổi sáng, toàn bộ nhân viên của một khách hàng doanh nghiệp lớn không đăng nhập được. Không ai tấn công gì cả.

**Chẩn đoán:**

```sql
SELECT ip_address, count(DISTINCT username) AS so_tai_khoan, count(*) AS so_lan
FROM login_attempts
WHERE created_at > now() - interval '1 hour'
GROUP BY 1 ORDER BY 3 DESC LIMIT 5;
```

```text
   ip_address     | so_tai_khoan | so_lan
   ---------------+--------------+--------
   203.0.113.42   |          847 |   1204     ← 847 tài khoản khác nhau
   ...

   → 847 người dùng CÙNG một IP công cộng.
     Đây là NAT của một toà nhà văn phòng.
     Sáu người gõ sai mật khẩu là 841 người còn lại bị khoá theo.
```

**Cách xử lý:**

```java
// ① Khoá theo TÀI KHOẢN, không theo IP
rateLimiter.byKey("login:account:" + username).limit(5, Duration.ofMinutes(15));

// ② IP chỉ dùng cho tín hiệu "một IP dò nhiều tài khoản"
long soTaiKhoanKhacNhau = distinctAccountsFromIp(ip, Duration.ofMinutes(10));
if (soTaiKhoanKhacNhau > 50) {
    requireCaptcha();                     // làm chậm, không chặn
    alerting.notify("Nghi ngờ dò tài khoản từ " + ip);
}

// ③ Cho phép khách doanh nghiệp khai dải IP của họ → nới ngưỡng
if (tenantIpAllowlist.contains(ip)) {
    rateLimiter.multiplier(20);
}
```

**Chặn tái diễn:**

```java
@Test
void nhieu_nguoi_dung_chung_mot_ip_khong_khoa_lan_nhau() {
    for (int i = 0; i < 100; i++) {
        loginService.attempt("user" + i, "sai-mat-khau", "203.0.113.42");
    }
    // Người thứ 101 vẫn phải đăng nhập được bằng mật khẩu đúng
    assertThat(loginService.attempt("user101", "dung-mat-khau", "203.0.113.42"))
        .isEqualTo(LoginResult.SUCCESS);
}
```

> **Tình huống 2:** Bạn đưa dịch vụ lên một nhà cung cấp mới. Cột `ip_address VARCHAR(15)` bắt đầu báo lỗi `value too long`, và một số bản ghi lưu vào là chuỗi cụt.

**Chẩn đoán:**

```sql
SELECT ip_address, length(ip_address) FROM access_log
ORDER BY length(ip_address) DESC LIMIT 5;
--  2001:0db8:85a3:0 | 15         ← BỊ CẮT CỤT, dữ liệu SAI mà không lỗi
--  ::ffff:10.0.0.1  | 15
```

```text
   ⚠ NGUY HIỂM NHẤT: MySQL ở chế độ không nghiêm ngặt CẮT CỤT ÂM THẦM.
     Bạn không nhận exception, chỉ nhận dữ liệu sai.
     → Kiểm tra: SELECT @@sql_mode;  phải có STRICT_TRANS_TABLES
```

**Cách xử lý:**

```sql
-- PostgreSQL: chuyển hẳn sang kiểu chuyên dụng
ALTER TABLE access_log ALTER COLUMN ip_address TYPE INET USING ip_address::inet;
-- ⚠ Sẽ lỗi ở những dòng đã bị cắt cụt → phải dọn trước:
--   UPDATE access_log SET ip_address = NULL WHERE ip_address !~ '^[0-9a-fA-F:.]+$';

-- MySQL: VARCHAR(45), hoặc VARBINARY(16) + INET6_ATON/INET6_NTOA
ALTER TABLE access_log MODIFY ip_address VARCHAR(45);
```

**Chặn tái diễn:**

```java
@Test
void cot_ip_phai_chua_duoc_ipv6_dai_nhat() {
    String ipv6DaiNhat = "2001:0db8:85a3:0000:0000:8a2e:0370:7334%eth0";
    assertThatNoException().isThrownBy(() -> accessLogDao.insert(ipv6DaiNhat));
    assertThat(accessLogDao.findLast().ip()).isEqualTo(ipv6DaiNhat);  // không bị cắt
}
```

> **Tình huống 3:** Bạn thêm rate limit theo IP. Một người dùng phàn nàn bị chặn oan; kiểm tra log thì IP của họ là `1.2.3.4` — một địa chỉ trông rất lạ và không khớp với nhà mạng của họ.

**Chẩn đoán — kẻ tấn công đang giả mạo header:**

```bash
curl -H "X-Forwarded-For: 1.2.3.4" https://api.shop.vn/orders
# Ứng dụng ghi log IP = 1.2.3.4 → tin vào giá trị do client tự đặt
```

```text
   VÀ ĐÂY LÀ HAI HẬU QUẢ, HẬU QUẢ THỨ HAI TỆ HƠN NHIỀU:

   ① Kẻ tấn công VƯỢT rate limit bằng cách đổi X-Forwarded-For mỗi lần
   ② Kẻ tấn công KHOÁ NGƯỜI KHÁC bằng cách giả IP của họ rồi cố tình
      gửi request vi phạm → nạn nhân bị chặn oan
      (Đây gọi là "đầu độc rate limit")
```

**Cách xử lý:**

```java
// ① Xoá sạch header X-* do client gửi, ngay tại gateway
// Nginx:
//   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
//   (KHÔNG dùng $http_x_forwarded_for — cái đó là giá trị của client)

// ② Trong ứng dụng: đếm ngược từ phải, bỏ qua đúng N proxy tin cậy
public String clientIp(HttpServletRequest req, int soProxyTinCay) {
    String[] chain = req.getHeader("X-Forwarded-For").split("\\s*,\\s*");
    int idx = chain.length - 1 - soProxyTinCay;
    return idx >= 0 ? chain[idx] : chain[0];
}
```

**Chặn tái diễn:**

```java
@Test
void khong_tin_x_forwarded_for_do_client_gui() throws Exception {
    mockMvc.perform(get("/api/orders").header("X-Forwarded-For", "1.2.3.4"))
           .andExpect(status().isOk());
    assertThat(lastLoggedIp()).isNotEqualTo("1.2.3.4");   // phải là IP thật của proxy
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Cột IP khai `VARCHAR(15)` | IPv6 bị **cắt cụt âm thầm** trên MySQL không strict | `VARCHAR(45)` hoặc kiểu `INET` |
| Lưu IP dạng chuỗi rồi `ORDER BY` | `'9.0.0.1' > '10.0.0.1'` — sắp sai, không báo lỗi | Kiểu `INET`, hoặc `INET6_ATON` |
| Chặn cứng theo IP | Sau NAT là cả toà nhà → **chặn oan hàng trăm người** | Khoá theo **tài khoản**; IP chỉ là tín hiệu |
| Rate limit theo IP không có bảo vệ header | Kẻ tấn công **vượt giới hạn** hoặc **khoá oan người khác** | Xoá header X-* tại gateway |
| Lấy `X-Forwarded-For` phần tử **đầu** | Đó là giá trị **client tự ghi** | Đếm ngược từ phải theo số proxy tin cậy |
| Dùng IP hash để chia tải | Cả nghìn người sau NAT dồn vào **một máy chủ** | Cookie affinity hoặc consistent hashing |
| Coi IP là danh tính người dùng | Sai cả về kỹ thuật lẫn về quyền riêng tư | IP là tín hiệu, không phải danh tính |
| Test dịch vụ chỉ trên `localhost` | Không bao giờ gặp trường hợp **hai đầu cùng sau NAT** | Test với client thật sau NAT |
| Quên IP là **dữ liệu cá nhân** | Vi phạm quy định bảo vệ dữ liệu | Có chính sách lưu trữ và xoá |
| Hardcode dải IP nội bộ `192.168.x` | Môi trường mới dùng `10.x` hoặc `100.64.x` (CGNAT) | Đọc từ cấu hình |

## Câu hỏi phỏng vấn hay gặp

**H: Vì sao IPv4 chỉ có 32 bit — người thiết kế thiển cận à?**
Ngược lại. Năm 1981 khi RFC 791 được phát hành, toàn bộ mạng ARPANET có **213 máy**, và trung bình 20 ngày mới thêm được một máy. 32 bit cho 4,29 tỷ địa chỉ, tức là **gấp 20 triệu lần** cái họ đang có. Họ cũng vừa nới số mạng từ 256 lên hơn 2 triệu chỉ trong 20 tháng trước đó — gấp 8.000 lần. Còn lý do không dùng 64 bit là phần cứng: máy định tuyến IMP thời đó có **24 KB RAM cho cả cái máy**, và header bị khoá cứng ở 20 byte vì nó tìm địa chỉ đích bằng cách **đếm số ô** chứ không đọc hiểu — thêm 4 byte là đếm trượt hết, và cái giá đó nhân với mọi gói tin của cả hành tinh, mãi mãi.

**H: Vậy vì sao 4 tỷ địa chỉ lại hết?**
Không phải vì con số 32, mà vì **cách chia**. Bản 1981 cắt kho địa chỉ thành ba lớp cố định: lớp C cho 254 máy, lớp B cho 65.534 máy, và **không có gì ở giữa**. Công ty có 300 máy thì lớp C không đủ, buộc phải xin lớp B — lấy về 65.534 địa chỉ để dùng đúng 300, và 65.234 địa chỉ còn lại bị khoá tên công ty đó, không ai dùng được nữa. Nhân với vài nghìn công ty trong mười năm. Kho địa chỉ **không cạn vì hết chỗ, nó cạn vì chỗ trống đã có chủ**. CIDR năm 1993 xoá bỏ việc chia lớp chính là để chữa đúng chuyện này.

**H: IPv6 sẵn sàng từ 1998, sao gần 30 năm rồi vẫn chưa thay thế được IPv4?**
Vì **người sửa được không phải là người đau vì nó**. Người đau là người dùng cuối: cuộc gọi qua mạng bị rớt, không có IP tĩnh, bị chặn oan vì dùng chung IP sau CGNAT. Người sửa được là nhà mạng, mà họ thì đối mặt với chi phí đổi hạ tầng, thiết bị cũ không hiểu IPv6, và quan trọng nhất là **khách không ai đòi**. Đây là dạng vấn đề mà chi phí và lợi ích rơi vào hai bên khác nhau, nên nó tồn tại rất lâu dù về kỹ thuật đã có lời giải từ lâu.

**H: Cột lưu địa chỉ IP nên khai kiểu gì?**
Trên PostgreSQL em dùng kiểu `INET` — nó chỉ tốn 7 hoặc 19 byte, so sánh và sắp xếp đúng theo giá trị số, và cho phép truy vấn theo dải bằng toán tử `<<`. Nếu buộc phải dùng chuỗi thì **`VARCHAR(45)`**, không phải 15: IPv6 đầy đủ đã 39 ký tự, cộng thêm dạng nhúng IPv4 hoặc zone index thì lên tới 45. Đây không chỉ là chuyện tràn cột — trên MySQL không bật chế độ nghiêm ngặt, giá trị bị **cắt cụt âm thầm** nên bạn nhận dữ liệu sai mà không có exception nào. Và nếu lưu chuỗi thì nhớ là `ORDER BY` sẽ so sánh theo chuỗi: `'9.0.0.1'` lớn hơn `'10.0.0.1'`, báo cáo sắp sai mà không ai biết.

**H: Có nên chặn theo IP không?**
Em coi IP là **tín hiệu, không phải danh tính**. Sau NAT của một toà nhà văn phòng có thể là hàng trăm người, nên chặn một IP là chặn oan hàng trăm người — em đã gặp trường hợp sáu người gõ sai mật khẩu làm 841 người còn lại bị khoá theo. Cách em làm là khoá theo **tài khoản**, còn IP dùng để tính điểm rủi ro: nếu một IP thử trên 50 tài khoản khác nhau trong 10 phút thì yêu cầu captcha và bắn cảnh báo, chứ không chặn cứng. Ngoại lệ hợp lệ là allowlist IP cho kết nối máy-với-máy, nhưng vẫn phải có xác thực thật, IP chỉ là lớp phòng thủ thứ hai.

**H: Lấy IP thật của client thế nào cho đúng?**
Không bao giờ tin `X-Forwarded-For` một cách trực tiếp, vì client gửi được. Và lấy **phần tử đầu tiên cũng sai** — kẻ tấn công gửi sẵn `X-Forwarded-For: 1.2.3.4` thì proxy của bạn nối IP thật vào **đuôi**, nên phần tử đầu chính là giá trị giả. Phải **đếm ngược từ phải sang**, bỏ qua đúng số proxy tin cậy của mình, và API gateway phải **xoá sạch header X-\* do client gửi** trước khi tự ghi lại. Nếu không thì kẻ tấn công vừa vượt được rate limit bằng cách đổi header mỗi lần, vừa **khoá oan người khác** bằng cách giả IP của họ rồi cố tình vi phạm.

## Tóm tắt bài 1

- **RFC 791, tháng 9/1981** — sớm hơn phần lớn người đoán ít nhất 10 năm.
- Mạng lúc đó có **213 máy**; 32 bit là **gấp 20 triệu lần** cái họ đang có. Họ **có** lường trước.
- Không dùng 64 bit vì máy định tuyến IMP chỉ có **24 KB RAM cho cả máy**, và header khoá cứng 20 byte vì nó **đếm ô** chứ không đọc hiểu.
- **Kho địa chỉ không cạn vì hết chỗ — nó cạn vì chỗ trống đã có chủ.** Chia lớp A/B/C không có mức ở giữa, công ty 300 máy phải lấy 65.534 địa chỉ.
- Cả bốn ràng buộc đã hết hiệu lực (CIDR 1993, NAT 1994, RAM rẻ, IPv6 sẵn từ 1998) nhưng IPv4 vẫn ở đây — vì **người sửa được không phải người đau vì nó**.
- Ba việc sửa được ngay: **`VARCHAR(45)` hoặc `INET`** thay `VARCHAR(15)`; **đừng chặn cứng theo IP**; **lấy `X-Forwarded-For` đếm ngược từ phải** và xoá header client tại gateway.
- **IP là tín hiệu, không phải danh tính** — sau NAT là cả toà nhà.
- Lưu IP dạng chuỗi thì `ORDER BY` sắp sai: `'9.0.0.1' > '10.0.0.1'`.

> *Ràng buộc nào trong con số bạn chốt hôm nay sẽ hết hiệu lực trước, mà con số thì vẫn nằm đó?*

**Bài kế tiếp** → [Bài 2: 1500 byte — vì sao file lớn treo khi bạn bật VPN](02-mot-nghin-nam-tram-byte-cua-goi-tin.md)
