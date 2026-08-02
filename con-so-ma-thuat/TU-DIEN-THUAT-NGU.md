# Từ điển thuật ngữ — Những con số ma thuật

Tra nhanh mọi thuật ngữ trong khoá. Cột **Đọc là** ghi phiên âm gần đúng để bạn nói được trong buổi phỏng vấn mà không ngại.

---

## 1. Địa chỉ IP và định tuyến

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **IP** (*Internet Protocol*) | ai-pi | **Giao thức Internet** — luật đánh địa chỉ và chuyển gói tin | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **IPv4 / IPv6** | ai-pi-vi-bốn | **Phiên bản 4** (32 bit, 4,29 tỷ địa chỉ) và **phiên bản 6** (128 bit) | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **RFC** (*Request For Comments*) | a-rờ-ép-xi | **Tài liệu chuẩn** của Internet; `RFC 791` (1981) định nghĩa IPv4 | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **ARPANET** | ác-pa-nét | **Mạng tiền thân của Internet**; năm 1981 chỉ có **213 máy** | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **IMP** (*Interface Message Processor*) | im-pờ | **Máy xử lý gói tin** — ông tổ của router; có **24 KB RAM cho cả máy** | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **Header** | héd-dơ | **Phần đầu gói tin** — chứa địa chỉ nguồn, đích; IPv4 khoá cứng 20 byte | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **Classful addressing** | clát-phun | **Chia lớp** A/B/C cố định — **nguyên nhân thật sự** làm cạn kho địa chỉ | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **CIDR** (*Classless Inter-Domain Routing*) | xai-đơ | **Định tuyến không phân lớp** (1993) — xoá bỏ việc chia lớp | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **Subnet mask / prefix** | sáp-nét | **Mặt nạ mạng** — phần nào là "mạng", phần nào là "máy" | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **NAT** (*Network Address Translation*) | nát | **Dịch địa chỉ mạng** (1994) — nhiều máy nội bộ nấp chung một IP công cộng | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **CGNAT** (*Carrier-Grade NAT*) | | **NAT cấp nhà mạng** — cả nghìn thuê bao chung một IP; dải `100.64.x` | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **Private IP** | | **IP nội bộ** — `10.x`, `172.16–31.x`, `192.168.x`; không đi ra Internet | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **Public IP** | | **IP công cộng** — địa chỉ mà Internet nhìn thấy | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **Dual-stack** | đu-ần stắc | **Chạy song song** cả IPv4 và IPv6 trên cùng thiết bị | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **`INET`** | ai-nét | Kiểu PostgreSQL lưu địa chỉ IP — 7 hoặc 19 byte, so sánh đúng theo giá trị | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |
| **`X-Forwarded-For`** | | Header ghi chuỗi IP đã đi qua; **client giả mạo được** → đếm ngược từ phải | [1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) |

## 2. Kích thước gói tin và đường truyền

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **MTU** (*Maximum Transmission Unit*) | em-ti-iu | **Kích thước gói tin lớn nhất** một đường truyền chở được; Ethernet = 1500 | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **MSS** (*Maximum Segment Size*) | em-ét-ét | **Kích thước dữ liệu lớn nhất** trong một segment TCP = MTU − 40 | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **Frame** | phrêm | **Khung** — đơn vị dữ liệu ở tầng Ethernet | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **Packet** | pắc-kịt | **Gói tin** — đơn vị dữ liệu ở tầng IP | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **Jumbo frame** | jăm-bô | **Khung khổng lồ** 9.000 byte — chỉ chạy được trong mạng nội bộ | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **Bus topology** | bát tô-pô-lô-ji | **Kiểu nối bus** — cả toà nhà cắm chung **một sợi cáp** | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **Collision** | cô-li-sần | **Va chạm** — hai máy nói cùng lúc, tín hiệu chồng lên nhau | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **CSMA/CD** | | **Nghe trước khi nói, phát hiện va chạm** — luật chia sẻ cáp; bỏ năm 2011 | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **NIC** (*Network Interface Card*) | nic | **Card mạng**; năm 1980 bộ đệm chỉ **2 KB** — vừa đúng một gói 1500 | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **Fragmentation** | phrág-men-tây-sần | **Phân mảnh** — chẻ gói lớn thành nhiều gói nhỏ | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **Don't Fragment (DF)** | | Cờ **"đừng chẻ nhỏ"** — bật mặc định trên gói IPv4 hiện đại | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **PMTUD** (*Path MTU Discovery*) | | **Dò MTU dọc đường** — tìm MTU nhỏ nhất trên toàn tuyến | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **ICMP** | ai-xi-em-pi | **Giao thức báo lỗi mạng**; Type 3 Code 4 là đường báo MTU **duy nhất** của IPv4 | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **ICMPv6 Type 2** | | **"Packet Too Big"** — chặn nó là **phá hỏng IPv6**, không phải giảm tính năng | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **Black hole** | bléc-hôn | **Hố đen** — gói bị vứt **không báo lỗi**, bên gửi chờ mãi | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **MSS clamping** | clem-ping | **Kẹp MSS** — router sửa MSS lúc bắt tay; **không phụ thuộc ICMP**, chỉ cứu TCP | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **Encapsulation** | en-cáp-siu-lây-sần | **Đóng gói** — bọc gói tin trong gói tin khác; VPN thêm 60–80 byte | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **Tunnel** | tăn-nồ | **Đường hầm** — kênh chở gói tin của mạng này qua mạng khác | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **VXLAN** | vi-ếch-lan | Mạng overlay của Kubernetes — bọc thêm **50 byte** → MTU phải hạ còn 1450 | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |
| **`tcp_mtu_probing`** | | Tham số Linux **tự dò MTU khi nghi hố đen**, không cần ICMP | [2](02-mot-nghin-nam-tram-byte-cua-goi-tin.md) |

## 3. Thời gian và mốc gốc

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Epoch** | i-póc | **Mốc gốc thời gian** — Unix chọn `1970-01-01 00:00:00 UTC` | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **Unix timestamp** | | **Số giây đã trôi qua** kể từ mốc gốc | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **Y2K38** | oai-tu-kây-38 | **Sự cố năm 2038** — số nguyên 4 byte có dấu tràn vào **19/01/2038 03:14:07** | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **Signed / unsigned** | sain-đờ | **Có dấu / không dấu** — có dấu dành 1 bit cho âm/dương | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **Integer overflow** | óp-vơ-phlâu | **Tràn số** — vượt trần thì bit dấu lật, nhảy về năm 1901 | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **PDP-11** | | Máy Unix đầu tiên chạy trên — **24 KB RAM**, ô nhớ 16 bit, không có lệnh nhân chia | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **Word** | uợt | **Từ nhớ** — đơn vị ô nhớ của CPU; PDP-11 dùng 16 bit | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **Inode** | ai-nôt | **Hồ sơ tệp** — năm 1971 rộng đúng **32 byte**, hai mốc giờ đã ăn 8 byte | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **`TIMESTAMP`** | | Kiểu SQL lưu **số giây từ epoch**; MySQL 4 byte → **chết 2038** | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **`DATETIME`** | | Kiểu SQL lưu **thành phần ngày giờ**; 5–8 byte, tới năm 9999, không đổi theo múi giờ | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **`TIMESTAMPTZ`** | | Kiểu PostgreSQL **8 byte**, chạy tới năm 294276 | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **`time_t`** | thai-em ti | Kiểu C biểu diễn thời gian; hệ 32 bit vẫn là **4 byte** → vẫn tràn | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **`STRICT_TRANS_TABLES`** | | Chế độ MySQL **báo lỗi thay vì nuốt im** — thiếu nó thì nhận `0000-00-00` | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **NTP** | en-ti-pi | **Giao thức đồng bộ giờ**; có mốc tràn **riêng vào 2036 — sớm hơn 2038** | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **tz database** | | **Bảng luật múi giờ** — ra vài bản mỗi năm vì các nước đổi luật | [3](03-bon-byte-cua-dong-ho-unix.md) |
| **Leap second** | líp | **Giây nhuận** — giây thêm vào để bù lệch vòng quay Trái Đất | [3](03-bon-byte-cua-dong-ho-unix.md) |

## 4. Khuôn mẫu chung của cả ba bài

| Khái niệm | Nghĩa | Ví dụ trong khoá |
|---|---|---|
| **Ràng buộc hết hiệu lực** | Lý do sinh ra một quyết định biến mất, nhưng **quyết định thì ở lại** | CIDR 1993, switch 1995, RAM rẻ 2001, CPU 64 bit — mà 32 bit / 1500 / 4 byte vẫn còn |
| **Người sửa được ≠ người đau** | Chi phí và lợi ích rơi vào **hai bên khác nhau**, nên không ai hành động | Người dùng đau vì CGNAT, nhưng chỉ nhà mạng triển khai được IPv6 |
| **Cần mọi bên đồng ý** | Thay đổi chỉ có tác dụng khi **toàn bộ** chuỗi cùng đổi | Nâng MTU cần mọi trạm trên tuyến đồng ý; một trạm không đổi là kẹt cả tuyến |
| **Nằm trong dữ liệu, không nằm trong mã** | Sửa mã thì dễ, sửa **dữ liệu đã ghi ra đĩa** thì phải đổi đồng thời mọi thứ đang đọc nó | 4 byte timestamp nằm trong hàng tỷ ổ đĩa và cơ sở dữ liệu |
| **Lỗi im lặng** | Hỏng mà **không có thông báo nào** — loại khó chẩn đoán nhất | `VARCHAR(15)` cắt cụt IPv6; hố đen PMTUD; `0000-00-00` |

---

## Bảy điều dễ nhầm nhất — đọc lại trước khi phỏng vấn

| Nhiều người nghĩ | Sự thật |
|---|---|
| Người thiết kế IPv4 thiển cận | ❌ Họ cấp **gấp 20 triệu lần** số máy đang có (213 máy năm 1981) |
| IPv4 cạn vì 4 tỷ là quá ít | ❌ Cạn vì **chia lớp A/B/C không có mức ở giữa** — chỗ trống đã có chủ |
| `VARCHAR(15)` đủ cho cột IP | ❌ IPv6 cần **45**; MySQL không strict sẽ **cắt cụt âm thầm** |
| Chặn IP là biện pháp bảo mật tốt | ❌ Sau NAT là **cả toà nhà** — IP là tín hiệu, không phải danh tính |
| Lấy phần tử đầu của `X-Forwarded-For` | ❌ Đó chính là giá trị **kẻ tấn công tự ghi** — phải đếm ngược từ phải |
| Chặn hết ICMP thì an toàn hơn | ❌ Tạo **hố đen PMTUD**; với IPv6 là **phá hỏng giao thức** |
| File tải treo là do đường truyền chậm | ❌ **Treo hẳn = MTU. Chậm đều = băng thông.** Hai chuyện khác nhau |
| MSS clamping thay được ICMP | ❌ Chỉ cứu **TCP** — UDP/QUIC vẫn cần ICMP |
| Y2K38 là chuyện của năm 2038 | ❌ Gặp **ngay hôm nay** với hợp đồng, bảo hành, hạn thẻ |
| Cứ lưu UTC hết cho chuẩn | ❌ Đúng với **quá khứ**; lịch hẹn tương lai phải lưu **giờ địa phương + tên vùng** |

---

**Về mục lục** → [README khoá học](README.md)
