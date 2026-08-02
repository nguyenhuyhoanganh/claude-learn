# Series: Những con số ma thuật — vì sao hệ thống vẫn chạy theo luật của 45 năm trước

> *"Ràng buộc nào trong con số bạn chốt hôm nay sẽ hết hiệu lực trước, mà con số thì vẫn nằm đó?"*

Có ba con số nằm im trong mọi hệ thống bạn từng viết. Bạn không chọn chúng, nhưng bạn trả giá cho chúng mỗi ngày:

```text
   32 bit    →  IP của bạn không phải của bạn; chặn một IP là chặn cả toà nhà
   1500 byte →  file tải về đứng im ở 41% khi bạn bật VPN
   4 byte    →  ngày đáo hạn năm 2040 lưu vào thành 0000-00-00
```

Với mỗi con số, phản ứng đầu tiên của gần như tất cả mọi người đều giống nhau: *"chọn kiểu gì mà thiển cận thế, để giờ cả ngành phải gánh."*

Khoá này tua ngược về căn phòng nơi từng con số được chốt xuống, xem người ở đó **có gì trong tay**, rồi quay lại hiện tại với những thứ **bạn sửa được ngay tuần này**.

## Vì sao đáng học

Đây không phải khoá lịch sử. Ba bài này giải thích ba nhóm sự cố mà bạn **chắc chắn sẽ gặp**, và cả ba đều thuộc loại khó chẩn đoán nhất: **không có thông báo lỗi nào**.

| Triệu chứng bạn sẽ gặp | Bài |
|---|---|
| Cả công ty khách hàng bị khoá đăng nhập vì sáu người gõ sai mật khẩu | [Bài 1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| Cột `VARCHAR(15)` cắt cụt IPv6 âm thầm, báo cáo sắp xếp sai | [Bài 1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| Web chạy, `ssh` chạy, nhưng tải file treo vô hạn — không lỗi | [Bài 2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| Pod Kubernetes upload lỗi, nhưng chỉ một số pod, "ngẫu nhiên" | [Bài 2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| Siết tường lửa xong, khách IPv6 mất kết nối hoàn toàn | [Bài 2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| Hợp đồng 15 năm lưu vào thành `0000-00-00`, không exception | [Bài 3](03-bon-byte-cua-dong-ho-unix.md) |
| Báo cáo cùng một ngày ra hai con số khác nhau | [Bài 3](03-bon-byte-cua-dong-ho-unix.md) |

**Mỗi bài đều có:** giải nghĩa mọi thuật ngữ kèm phiên âm · sơ đồ ASCII vẽ luồng từng bước · con số đo được · **tình huống thực tế kèm lệnh chẩn đoán, code sửa, và cách chặn tái diễn** · bảng bẫy thường gặp · câu hỏi phỏng vấn kèm đáp án mẫu.

## Mục lục

| Bài | Nội dung |
|---|---|
| [01](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) | **32 bit — vì sao 4,29 tỷ địa chỉ IP lại không đủ**<br>RFC 791 năm 1981 khi ARPANET có **213 máy** · 32 bit là **gấp 20 triệu lần** cái họ đang có · máy định tuyến IMP có **24 KB RAM cho cả máy** · kho địa chỉ **không cạn vì hết chỗ mà vì chỗ trống đã có chủ** · CIDR, NAT, CGNAT, vì sao IPv6 gần 30 năm vẫn chưa thắng<br>**Sửa ngay:** `VARCHAR(45)`/`INET` thay `VARCHAR(15)` · đừng chặn cứng theo IP · lấy `X-Forwarded-For` đếm ngược từ phải |
| [02](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) | **1500 byte — vì sao file lớn treo khi bạn bật VPN**<br>Ethernet 1980, cả toà nhà chung **một sợi cáp 10 Mbps** · **RAM 6.000 USD/MB**, card mạng có 2 KB bộ đệm · CSMA/CD buộc mọi máy theo cùng một luật · **hố đen PMTUD**: VPN bọc thêm 80 byte, router báo ICMP, tường lửa chặn ICMP, bên gửi chờ mãi<br>**Sửa ngay:** cho qua ICMP Type 3 Code 4 và ICMPv6 Type 2 · MSS clamping ở đầu đường hầm · bật `tcp_mtu_probing=1` |
| [03](03-bon-byte-cua-dong-ho-unix.md) | **4 byte — cái đồng hồ sẽ dừng vào năm 2038**<br>Epoch bắt đầu **1971**, và đồng hồ đầu tiên **đếm 1/60 giây** nên chỉ sống hơn một năm · PDP-11 **24 KB RAM, ô nhớ 16 bit, không có lệnh nhân chia** · **inode 32 byte** khiến ghi ngày ra chuỗi là bất khả thi · **Y2K38 là vấn đề của hôm nay**, không phải của 2038<br>**Sửa ngay:** quét lược đồ tìm `TIMESTAMP` lưu ngày tương lai · bật `STRICT_TRANS_TABLES` · lịch hẹn lưu giờ địa phương + tên vùng |

## Khuôn mẫu chung của cả ba bài

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  ① MỘT CON SỐ TRÔNG NHƯ CHỌN BỪA                            │
   │     32 bit · 1500 byte · 4 byte                              │
   │                          ↓                                    │
   │  ② BẢN ÁN "THIỂN CẬN" — nghe rất có lý, có bằng chứng       │
   │                          ↓                                    │
   │  ③ TUA NGƯỢC VỀ CĂN PHÒNG ĐÓ                                │
   │     Họ có 213 máy · RAM 6.000 USD/MB · 24 KB cho cả máy      │
   │     → Mỗi ràng buộc LOẠI BỎ một phương án "tốt hơn"          │
   │                          ↓                                    │
   │  ④ MỌI RÀNG BUỘC ĐỀU ĐÃ HẾT HIỆU LỰC                        │
   │     CIDR 1993 · switch 1995 · RAM rẻ 2001 · CPU 64 bit       │
   │                          ↓                                    │
   │  ⑤ NHƯNG CON SỐ VẪN CÒN — VÌ CÙNG MỘT LÝ DO                 │
   │     Thay đổi nó đòi hỏi MỌI BÊN CÙNG HÀNH ĐỘNG.             │
   │     Người sửa được không phải người đau vì nó.               │
   │                          ↓                                    │
   │  ⑥ VẬY THÌ SỐNG CHUNG THẾ NÀO — 3 việc làm được tuần này   │
   └──────────────────────────────────────────────────────────────┘
```

Ba lĩnh vực khác nhau — mạng, phần cứng, hệ điều hành — **một lý do giống hệt nhau**. Nhận ra khuôn mẫu này có giá trị hơn nhớ ba con số, vì bạn sẽ gặp lại nó ở mọi quyết định kỹ thuật cần sự đồng thuận của nhiều bên.

## Ba dòng đáng chép ra ngay

```sql
-- ① Cột IP: đủ chỗ cho IPv6 (bài 1)
ALTER TABLE access_log ALTER COLUMN ip_address TYPE INET;   -- hoặc VARCHAR(45)
```

```bash
# ② Lưới an toàn chống hố đen MTU, không phụ thuộc tường lửa của khách (bài 2)
sysctl -w net.ipv4.tcp_mtu_probing=1
```

```sql
-- ③ Tìm mọi cột sẽ tràn năm 2038 (bài 3) — biến câu này thành test CI
SELECT concat(table_name,'.',column_name) FROM information_schema.columns
WHERE table_schema = DATABASE() AND data_type = 'timestamp'
  AND column_name RLIKE 'expir|end|due|until|valid|renew|maturity|retire';
```

## Liên hệ với các khoá khác

- **Kiểu dữ liệu, tràn số, thời gian và múi giờ ở tầng SQL**: [SQL — Phase 5](../sql-interview/README.md) — đặc biệt [bài 2 về tràn số nguyên](../sql-interview/phase-5/02-so-nguyen-va-cai-tran-tran-so.md) và [bài 4 về UTC và múi giờ](../sql-interview/phase-5/04-thoi-gian-utc-mui-gio-va-gom-nhom-theo-ngay.md)
- **Chuẩn hoá dữ liệu trước khi so trùng** (cùng tinh thần "đừng tin tầng ứng dụng"): [SQL — Phase 5 Bài 7](../sql-interview/phase-5/07-email-va-chuan-hoa-du-lieu-truoc-khi-so-trung.md)
- **Load balancer, sticky session, IP hash, rate limiting**: [Backend — Phase 3](../backend-interview/README.md)
- **API key, mTLS, tường lửa và phân quyền**: [Backend — Phase 2](../backend-interview/phase-2/03-basic-auth-api-key-va-mtls.md)
- **N+1 và tầng truy cập dữ liệu**: [khoá ORM & N+1](../orm-n-plus-1/README.md)

---

**Bắt đầu** → [Bài 1: 32 bit — vì sao 4,29 tỷ địa chỉ IP lại không đủ](01-ba-muoi-hai-bit-cua-dia-chi-ip.md)
