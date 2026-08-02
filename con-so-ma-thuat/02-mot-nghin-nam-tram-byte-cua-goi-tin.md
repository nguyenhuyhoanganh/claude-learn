# Bài 2: 1500 byte — vì sao file lớn treo khi bạn bật VPN

File tải về đứng im ở 41%.

Bạn vừa bật VPN công ty, và **mọi thứ khác vẫn chạy**: trang web vào bình thường, chat nhắn được, `ssh` gõ lệnh vẫn ra kết quả. Chỉ có file lớn là đứng im. Không báo lỗi, không hiện gì hết, không timeout — nó chỉ đơn giản là **không nhúc nhích**.

Cái trần gây ra chuyện này được chốt vào năm nào?

```text
        1980          1987          1995
```

Giữ lấy con số bạn vừa chọn. Và trước khi biết đáp án, hãy nghe câu mà ai cũng buột miệng nói:

> *"1500 là con số ai đó chọn đại, rồi cả ngành gánh. 46 năm mà không ai dám sửa, chỉ vì ngại đụng vào."*

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **MTU** (*Maximum Transmission Unit*) | em-ti-iu | **Kích thước gói tin lớn nhất** một đường truyền chở được |
| **MSS** (*Maximum Segment Size*) | em-ét-ét | **Kích thước dữ liệu lớn nhất** trong một segment TCP = MTU − 40 |
| **Frame** | phrêm | **Khung** — đơn vị dữ liệu ở tầng Ethernet |
| **Packet** | pắc-kịt | **Gói tin** — đơn vị dữ liệu ở tầng IP |
| **Jumbo frame** | jăm-bô | **Khung khổng lồ** — gói 9.000 byte, chỉ chạy được trong mạng nội bộ |
| **Bus topology** | bát tô-pô-lô-ji | **Kiểu nối bus** — mọi máy cắm chung **một sợi cáp** |
| **Collision** | cô-li-sần | **Va chạm** — hai máy nói cùng lúc, tín hiệu chồng lên nhau |
| **CSMA/CD** | | **Nghe trước khi nói, phát hiện va chạm** — luật chia sẻ sợi cáp |
| **NIC** (*Network Interface Card*) | nic | **Card mạng** |
| **Fragmentation** | phrág-men-tây-sần | **Phân mảnh** — chẻ gói lớn thành nhiều gói nhỏ |
| **PMTUD** (*Path MTU Discovery*) | | **Dò MTU dọc đường** — tìm MTU nhỏ nhất trên toàn tuyến |
| **ICMP** | ai-xi-em-pi | **Giao thức báo lỗi mạng** — nơi thông báo "gói quá to" đi qua |
| **Black hole** | bléc-hôn | **Hố đen** — gói bị vứt **không báo lỗi**, bên gửi chờ mãi |
| **MSS clamping** | clem-ping | **Kẹp MSS** — router sửa giá trị MSS lúc bắt tay để ép gói nhỏ lại |
| **Encapsulation** | en-cáp-siu-lây-sần | **Đóng gói** — bọc gói tin trong một gói tin khác (VPN làm điều này) |
| **Tunnel** | tăn-nồ | **Đường hầm** — kênh chở gói tin của mạng này qua mạng khác |

## Tua ngược về năm 1980

**Năm 1980.** Ba công ty — Xerox, DEC và Intel — ngồi lại quanh một sợi cáp đồng và chốt một con số. Con số đó chưa đổi lấy một lần kể từ hôm ấy: **1500 byte**.

Bản án nghe rất chắc, và nó có bằng chứng:

```text
   NĂM 1980          →  mạng chạy 10 triệu bit/giây (10 Mbps)
   HÔM NAY           →  cáp mạng trên máy bạn chạy 10 tỷ bit/giây (10 Gbps)
                        NHANH GẤP 1.000 LẦN

   GÓI TIN NĂM 1980  →  1500 byte
   GÓI TIN HÔM NAY   →  1500 byte
                        KHÔNG ĐỔI MỘT BYTE NÀO

   Tệ hơn: cách làm gói to hơn ĐÃ CÓ SẴN từ lâu — jumbo frame 9.000 byte,
   chạy ngon lành trong mọi trung tâm dữ liệu.
   Chỉ là ra tới Internet thì nó không đi được.
```

Nghe rất có lý. Cho tới lúc nhìn xem năm đó họ có gì trong tay.

### Ràng buộc ① — cả toà nhà cắm chung **một sợi cáp**

```text
   MẠNG NỘI BỘ NĂM 1980 KHÔNG GIỐNG BÂY GIỜ:

   ═══════════════════════════════════════════════════  ← MỘT sợi cáp đồng
     │        │        │        │        │        │        dày như ngón tay,
    Máy1     Máy2     Máy3     Máy4     ...    Máy100      chạy trên trần nhà

   AI NÓI THÌ TẤT CẢ CÙNG NGHE.
   Sợi cáp đó chở 10 Mbps — không phải mỗi máy 10 Mbps,
   mà CẢ SỢI CÁP 10 Mbps chia cho tối đa 100 máy.
```

```text
   GIỜ TÍNH THỬ:

   Một gói 1500 byte = 12.000 bit
   Đẩy hết qua sợi cáp 10 Mbps  →  1,2 mili giây

   TRONG 1,2 ms ĐÓ, 99 MÁY CÒN LẠI PHẢI NGỒI IM CHỜ.

   Sao không cho gói to hẳn lên 9.000 byte?
      9.000 byte = 72.000 bit  →  7,2 mili giây một gói
      → MỘT NGƯỜI TẢI FILE, CẢ TẦNG ĐỨNG HÌNH.
```

Họ chọn 1500: **đủ to để khỏi chẻ nhỏ mọi thứ, đủ nhỏ để không ai giữ sợi cáp quá lâu.** 1,2 ms là mức mà cả phòng còn chịu đựng được.

> **Cửa 1 đã đóng:** cáp dùng chung 10 Mbps **loại bỏ** phương án gói 9.000 byte.

### Ràng buộc ② — 1 MB RAM giá **6.000 đô la**

```text
   MUỐN GỬI MỘT GÓI, CARD MẠNG PHẢI GIỮ TRỌN CẢ GÓI
   TRONG BỘ NHỚ CỦA CHÍNH NÓ RỒI MỚI BẮN RA CÁP.
   Bên nhận cũng y hệt.

   MÀ BỘ NHỚ NĂM 1980:

      1 MB RAM  ≈  6.000 USD

      Tấm ảnh bạn vừa chụp bằng điện thoại (3 MB)
      → năm 1980, riêng chỗ nhớ để chứa nó là 18.000 USD
      → hơn hai chiếc xe hơi mới.
```

```text
   BỘ ĐỆM TRÊN CARD MẠNG PHỔ BIẾN THỜI ĐÓ: 2 KB

   ┌────────────────────────────────────┐
   │  2048 byte                          │
   ├──────────────────────────┬─────────┤
   │  Dữ liệu 1500 byte       │ Header  │
   └──────────────────────────┴─────────┘
                                   ▲
                        VỪA ĐÚNG, KHÔNG DƯ MỘT BYTE NÀO
```

> **Cửa 2 đã đóng:** con số 1500 là **vừa vặn con chip rẻ nhất mua được ngoài chợ** thời đó.

### Ràng buộc ③ — không ai điều phối, nên mọi máy phải theo **cùng một luật**

```text
   TRÊN SỢI CÁP ĐÓ KHÔNG CÓ AI ĐIỀU PHỐI.
   Máy nào muốn nói thì cứ nói. Hai máy nói cùng lúc → tín hiệu
   chồng lên nhau → HỎNG CẢ HAI (collision).

   Nên mỗi máy VỪA NÓI VỪA NGHE LẠI CHÍNH MÌNH:

   Máy A ──────► ~~~~~~~~~~~~~~~~~~~~~~~ 2.500 m cáp ─────► Máy B
         ◄────── tín hiệu dội về mất 51,2 µs ──────────────

   Suốt 51,2 µs đó nó VẪN ĐANG NÓI.
   Vì nếu nói xong rồi va chạm mới dội về thì nó chẳng biết gì cả!

   → Đó là lý do gói tin có SÀN CỨNG tối thiểu 64 byte.
```

Vậy sao không cho hai máy tự thoả thuận một con số riêng?

```text
   VÌ TRÊN SỢI CÁP DÙNG CHUNG, MỌI CARD ĐỀU NGHE THẤY MỌI GÓI,
   VÀ PHẢI CẮT RANH GIỚI GÓI THEO CÙNG MỘT LUẬT.

   Máy A và máy B thoả thuận riêng 4.000 byte
   → 98 máy còn lại không biết, cắt gói sai chỗ → hỏng hết.

   Nên họ chốt MỘT con số duy nhất, ghi cứng vào chuẩn:
   MTU = 1500 byte. Không thoả thuận, không tuỳ chọn, không đàm phán.
```

> **Cửa 3 đã đóng:** vật lý của sợi cáp đồng **bắt mọi máy dùng chung một quy tắc**.

## Cả ba lý do đã hết hiệu lực — vậy sao 1500 vẫn còn?

```text
   ① Cáp dùng chung   →  HẾT HẠN 1995: switch ra đời, mỗi máy một
                          đường riêng, không còn ai phải chờ ai
   ② RAM đắt          →  HẾT HẠN 2001: RAM rẻ hơn 0,01 USD/MB
   ③ Phát hiện va chạm →  HẾT HẠN 2011: chuẩn bỏ hẳn CSMA/CD

   BA LÝ DO SINH RA CON SỐ 1500 ĐỀU KHÔNG CÒN.
   VẬY VÌ SAO MÁY BẠN HÔM NAY VẪN CHẠY 1500?
```

```text
   VÌ GÓI TIN CỦA BẠN KHÔNG ĐI MỘT CHẶNG. NÓ ĐI MƯỜI MẤY CHẶNG,
   QUA MƯỜI MẤY NHÀ MẠNG KHÁC NHAU.

   Bạn ──► ISP nhà ──► IXP ──► ISP trung gian ──► ... ──► Server
           1500        9000     1500              1420

   MUỐN NÂNG TRẦN THÌ TẤT CẢ PHẢI ĐỒNG Ý HẾT.
   Chỉ cần MỘT trạm không chịu nâng là toàn tuyến kẹt lại ở mức đó.

   → KHÔNG AI GIỮ NÓ LẠI. CHỈ LÀ KHÔNG AI GỠ NÓ RA MỘT MÌNH ĐƯỢC.
```

Đây chính là dạng vấn đề bạn đã gặp ở [bài 1](01-ba-muoi-hai-bit-cua-dia-chi-ip.md) với IPv6: **giải pháp kỹ thuật có sẵn, nhưng đòi hỏi mọi bên cùng hành động, nên nó không xảy ra.**

## Kiến trúc: chuyện gì thật sự xảy ra với file đứng ở 41%

Đây là phần quan trọng nhất của bài, vì nó giải thích một sự cố mà bạn **chắc chắn sẽ gặp**.

```text
   BƯỚC 1 — BẠN BẬT VPN. GÓI TIN BỊ BỌC THÊM MỘT LỚP.

   Không có VPN:
   ┌──────────┬─────────────────────────────────────┐
   │ IP 20B   │  Dữ liệu  1480 byte                  │  = 1500 ✅
   └──────────┴─────────────────────────────────────┘

   Có VPN (WireGuard/IPsec/OpenVPN bọc thêm ~60–80 byte):
   ┌──────────┬──────────┬──────────────────────────┐
   │ IP ngoài │ VPN 60B  │  Gói gốc 1500 byte       │  = 1580 ❌
   └──────────┴──────────┴──────────────────────────┘
                                                        ▲
                                          VƯỢT TRẦN 1500 CỦA ĐƯỜNG TRUYỀN
```

```text
   BƯỚC 2 — TRẠM GIỮA ĐƯỜNG PHÁT HIỆN GÓI QUÁ TO.

   Gói IPv4 hiện đại đều bật cờ "Don't Fragment" (đừng chẻ nhỏ),
   vì chẻ nhỏ làm giảm hiệu năng và gây lỗi khó lần.

   → Router KHÔNG chẻ gói. Nó VỨT gói đi và gửi ngược lại một
     thông báo ICMP: "Fragmentation Needed, MTU tối đa là 1420".

   Server ◄──── ICMP Type 3 Code 4 ──── Router giữa đường
```

```text
   BƯỚC 3 — VÀ ĐÂY LÀ CHỖ MỌI THỨ HỎNG.

   ┌────────────────────────────────────────────────────────────┐
   │   TƯỜNG LỬA CÔNG TY CỦA BẠN CHẶN SẠCH ICMP                 │
   │   ("ICMP là để hacker dò mạng, chặn hết cho an toàn")      │
   └────────────────────────────────────────────────────────────┘

   → Thông báo "gói quá to" KHÔNG BAO GIỜ TỚI ĐƯỢC SERVER.
   → Server tưởng gói đã gửi thành công, ngồi chờ ACK.
   → ACK không bao giờ tới. Server gửi lại. Lại bị vứt. Lại chờ.

   ĐÂY GỌI LÀ "PMTUD BLACK HOLE" — HỐ ĐEN DÒ MTU.
```

```text
   BƯỚC 4 — VÌ SAO WEB VẪN CHẠY MÀ FILE LỚN THÌ TREO?

   ┌──────────────────────┬──────────────┬────────────────────┐
   │ Loại lưu lượng       │ Kích thước   │ Kết quả            │
   ├──────────────────────┼──────────────┼────────────────────┤
   │ Bắt tay TCP (SYN)    │  ~60 byte    │ ✅ qua được        │
   │ Gõ lệnh ssh          │  ~100 byte   │ ✅ qua được        │
   │ Tin nhắn chat        │  ~200 byte   │ ✅ qua được        │
   │ Trang HTML nhỏ       │  ~800 byte   │ ✅ qua được        │
   │ TẢI FILE / ẢNH LỚN   │  1500 byte   │ ❌ BỊ VỨT IM LẶNG  │
   └──────────────────────┴──────────────┴────────────────────┘

   → ĐÂY LÀ CHỮ KÝ ĐẶC TRƯNG:
     "MỌI THỨ NHỎ CHẠY ĐƯỢC, MỌI THỨ LỚN TREO, KHÔNG CÓ LỖI NÀO."

   Kết nối thiết lập được (gói SYN nhỏ), nên bạn thấy "đang tải".
   Rồi dữ liệu thật bắt đầu chảy với gói đầy 1500 byte → chết đứng.
   → THANH TIẾN TRÌNH DỪNG Ở 41%.
```

## Ba việc bạn phải làm

### ① Đừng chặn sạch ICMP tại tường lửa

```text
   ICMP KHÔNG PHẢI MỘT KHỐI DUY NHẤT. Nó có nhiều loại,
   và chặn nhầm loại thì hỏng chính giao thức IP.

   ┌────────────────────────────┬──────────────────────────────┐
   │ BẮT BUỘC CHO QUA           │ Chặn được nếu muốn           │
   ├────────────────────────────┼──────────────────────────────┤
   │ Type 3 Code 4              │ Type 8 (Echo Request — ping) │
   │ "Fragmentation Needed"     │   → chặn để khỏi bị dò mạng  │
   │ ← ĐƯỜNG BÁO LỖI MTU DUY   │                              │
   │   NHẤT MÀ IPv4 CÓ          │ Type 13/14 (Timestamp)       │
   │                            │                              │
   │ IPv6 Type 2                │ Type 5 (Redirect)            │
   │ "Packet Too Big"           │   → nên chặn, có thể bị lạm  │
   │ ← IPv6 KHÔNG CHẺ GÓI CHÚT  │      dụng để đổi đường đi    │
   │   NÀO, nên thiếu cái này   │                              │
   │   là MẤT KẾT NỐI HOÀN TOÀN │                              │
   └────────────────────────────┴──────────────────────────────┘
```

```bash
# iptables — cho qua đúng loại cần thiết
iptables -A INPUT  -p icmp --icmp-type fragmentation-needed -j ACCEPT
iptables -A OUTPUT -p icmp --icmp-type fragmentation-needed -j ACCEPT

# IPv6 — bắt buộc, không có ngoại lệ
ip6tables -A INPUT  -p icmpv6 --icmpv6-type packet-too-big -j ACCEPT
ip6tables -A OUTPUT -p icmpv6 --icmpv6-type packet-too-big -j ACCEPT
```

```yaml
# AWS Security Group — lỗi cấu hình rất phổ biến
# ❌ Chỉ mở TCP 443 → ICMP bị chặn → PMTUD hỏng
# ✅ Thêm rule:
#    Type: Custom ICMP - IPv4
#    Protocol: Destination Unreachable
#    Port range: 4 (fragmentation required)
#    Source: 0.0.0.0/0
```

### ② Mọi đường hầm VPN/GRE phải kẹp MSS ngay ở đầu vào

**MSS clamping** là cách chữa **không phụ thuộc vào ICMP** — nó ép hai đầu thoả thuận gói nhỏ hơn ngay từ lúc bắt tay, nên không cần thông báo lỗi nào cả.

```text
   CƠ CHẾ:

   Lúc bắt tay TCP, hai bên trao đổi giá trị MSS trong gói SYN:
       Client ──SYN, MSS=1460──►  Server
       Client ◄─SYN-ACK, MSS=1460─ Server

   Router ở đầu đường hầm SỬA giá trị đó khi gói đi qua:
       Client ──SYN, MSS=1460──►[Router: sửa thành 1380]──► Server

   → Hai đầu tự động dùng gói nhỏ hơn, KHÔNG CẦN ICMP,
     KHÔNG CẦN dò MTU, KHÔNG THỂ rơi vào hố đen.
```

```bash
# Cách an toàn nhất: để router tự tính theo MTU thật của đường hầm
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \
         -j TCPMSS --clamp-mss-to-pmtu

# Hoặc đặt cứng nếu biết chính xác MTU đường hầm
# MSS = MTU − 40 (20 byte IP header + 20 byte TCP header)
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \
         -o wg0 -j TCPMSS --set-mss 1380
```

```conf
# WireGuard — đặt MTU đúng ngay trong cấu hình
[Interface]
MTU = 1420          # 1500 − 80 byte overhead của WireGuard
```

```text
   ⚠ MSS CLAMPING CHỈ CỨU ĐƯỢC TCP.
     UDP không có giai đoạn bắt tay nên không kẹp được.
     → QUIC/HTTP3, WireGuard, game online, VoIP vẫn cần ICMP hoạt động,
       hoặc phải tự dò MTU ở tầng ứng dụng (QUIC có làm điều này).
```

### ③ File lớn treo mà web vẫn chạy — soi MTU trước, đừng đổ lỗi đường truyền

```bash
# ① Tìm MTU thật của tuyến — gửi gói lớn dần với cờ "đừng chẻ nhỏ"
#    Linux/macOS:
ping -M do -s 1472 8.8.8.8      # 1472 + 28 byte header = 1500
#   ping: local error: message too long, mtu=1420   ← TÌM RA NGAY

ping -M do -s 1392 8.8.8.8      # 1392 + 28 = 1420
#   64 bytes from 8.8.8.8: icmp_seq=1 ttl=115 time=12.4 ms   ✅

# macOS dùng cú pháp khác:
ping -D -s 1472 8.8.8.8

# Windows:
ping -f -l 1472 8.8.8.8
```

```bash
# ② Dò nhị phân nhanh để tìm trần chính xác
for s in 1472 1440 1412 1392 1372; do
  ping -M do -s $s -c1 -W1 8.8.8.8 >/dev/null 2>&1 \
    && { echo "MTU = $((s+28))"; break; }
done
```

```bash
# ③ tracepath cho biết MTU đổi ở CHẶNG NÀO
tracepath 8.8.8.8
#  1?: [LOCALHOST]      pmtu 1500
#  1:  192.168.1.1      0.412ms
#  2:  10.64.0.1        asymm 3   pmtu 1420      ← TRẦN TỤT Ở ĐÂY
#  ...
#      Resume: pmtu 1420
```

```bash
# ④ Xác nhận ICMP có bị chặn không
#    Nếu tracepath treo ở một chặng rồi im luôn → ICMP bị chặn ở đó
mtr --report --report-cycles 10 8.8.8.8
```

```text
   BẢNG CHẨN ĐOÁN NHANH:

   ┌────────────────────────────────────┬────────────────────────────┐
   │ Triệu chứng                        │ Nghi ngờ                   │
   ├────────────────────────────────────┼────────────────────────────┤
   │ Web nhỏ chạy, file lớn treo        │ MTU / hố đen PMTUD         │
   │ Chỉ xảy ra khi bật VPN             │ MTU đường hầm              │
   │ ssh gõ được, `cat file-lớn` treo   │ MTU (chữ ký kinh điển)     │
   │ Bắt tay TLS xong rồi treo          │ MTU (ClientHello ~1500B)   │
   │ `curl` treo sau khi in header      │ MTU                        │
   │ Chậm ĐỀU tất cả mọi thứ            │ KHÔNG phải MTU — băng thông│
   │ Lỗi ngay lập tức, có báo lỗi       │ KHÔNG phải MTU             │
   └────────────────────────────────────┴────────────────────────────┘
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Sau khi chuyển ứng dụng lên Kubernetes với mạng overlay, một số API trả về bình thường nhưng API upload ảnh thì **treo vô hạn**. Chỉ xảy ra với một số pod.

**Chẩn đoán:**

```bash
# ① Xem MTU của interface trong pod
kubectl exec -it api-7d9f -- ip link show eth0
#  eth0: <BROADCAST,MULTICAST,UP> mtu 1500       ← pod nghĩ nó có 1500

# ② Nhưng mạng overlay (VXLAN/Flannel/Calico) bọc thêm 50 byte
kubectl exec -it api-7d9f -- ping -M do -s 1472 10.96.0.1
#  ping: local error: message too long, mtu=1450  ← THỰC TẾ chỉ 1450
```

```text
   → Pod gửi gói 1500 byte, VXLAN bọc thêm 50 byte thành 1550,
     vượt MTU 1500 của mạng vật lý → bị vứt.

   VÌ SAO CHỈ MỘT SỐ POD: pod cùng node giao tiếp qua bridge nội bộ,
   KHÔNG qua VXLAN → không bị. Chỉ pod KHÁC NODE mới đi qua overlay.
   → Đây là lý do lỗi trông "ngẫu nhiên" và không tái hiện được.
```

**Cách xử lý:**

```yaml
# ✅ Đặt MTU đúng cho CNI plugin
# Flannel:
apiVersion: v1
kind: ConfigMap
metadata: { name: kube-flannel-cfg, namespace: kube-system }
data:
  net-conf.json: |
    { "Network": "10.244.0.0/16", "Backend": { "Type": "vxlan", "MTU": 1450 } }
```

```yaml
# Calico:
kind: ConfigMap
metadata: { name: calico-config }
data:
  veth_mtu: "1440"      # VXLAN: 1500−50=1450; IPIP: 1500−20=1480
                        # WireGuard: 1500−60=1440
```

**Chặn tái diễn:**

```yaml
# DaemonSet kiểm tra MTU thật, chạy sau mỗi lần nâng cấp cụm
- name: mtu-check
  image: nicolaka/netshoot
  command:
    - sh
    - -c
    - |
      MTU=$(ip link show eth0 | grep -o 'mtu [0-9]*' | cut -d' ' -f2)
      PROBE=$((MTU - 28))
      ping -M do -s $PROBE -c1 $TARGET_POD_IP || {
        echo "MTU KHÔNG KHỚP: interface khai $MTU nhưng không gửi nổi"; exit 1; }
```

> **Tình huống 2:** Đội bảo mật vừa siết tường lửa "chặn hết ICMP cho an toàn". Hôm sau, khách hàng dùng IPv6 **mất kết nối hoàn toàn**, khách IPv4 thì báo tải file chậm bất thường.

**Chẩn đoán:**

```bash
# IPv6 nghiêm trọng hơn IPv4 rất nhiều
ping6 -M do -s 1452 2001:4860:4860::8888
#   (không phản hồi gì cả)
```

```text
   ⚠ VÌ SAO IPv6 CHẾT HẲN CÒN IPv4 CHỈ CHẬM:

   IPv4  →  router GIỮA ĐƯỜNG được phép chẻ nhỏ gói (fragment)
            → chặn ICMP thì vẫn còn cơ chế dự phòng, chỉ chậm

   IPv6  →  router giữa đường TUYỆT ĐỐI KHÔNG chẻ gói.
            Chỉ có bên GỬI mới được chẻ, và nó chỉ biết cần chẻ
            khi nhận được ICMPv6 "Packet Too Big".

   → CHẶN ICMPv6 = PHÁ HỎNG GIAO THỨC IPv6.
     Đây không phải "giảm tính năng", đây là "làm hỏng".
     RFC 4890 nói rõ điều này.
```

**Cách xử lý:**

```bash
# Mở lại đúng những loại bắt buộc, giữ nguyên phần chặn dò mạng
ip6tables -I INPUT  -p icmpv6 --icmpv6-type packet-too-big       -j ACCEPT
ip6tables -I INPUT  -p icmpv6 --icmpv6-type destination-unreachable -j ACCEPT
ip6tables -I INPUT  -p icmpv6 --icmpv6-type time-exceeded        -j ACCEPT
ip6tables -I INPUT  -p icmpv6 --icmpv6-type parameter-problem    -j ACCEPT
# Vẫn chặn được echo-request nếu không muốn bị ping
```

**Chặn tái diễn:**

```bash
# Test hạ tầng, chạy trong CI sau mỗi thay đổi tường lửa
#!/usr/bin/env bash
set -e
echo "Kiểm tra ICMP fragmentation-needed đi qua được..."
ping -M do -s 1472 "$PUBLIC_ENDPOINT" 2>&1 | grep -q "mtu=" \
  || { echo "FAIL: không nhận được thông báo MTU — ICMP đang bị chặn"; exit 1; }

echo "Kiểm tra IPv6 Packet Too Big..."
ping6 -M do -s 1452 "$PUBLIC_ENDPOINT_V6" 2>&1 | grep -q "mtu=" \
  || { echo "FAIL: ICMPv6 bị chặn — IPv6 sẽ hỏng"; exit 1; }
```

> **Tình huống 3:** Một khách hàng doanh nghiệp báo *"gọi API của các anh từ mạng công ty tôi thì treo, từ 4G điện thoại thì chạy"*. Bạn kiểm tra server thì mọi chỉ số đều bình thường.

**Chẩn đoán — vấn đề nằm ở tuyến đường, không ở server:**

```bash
# Nhờ khách chạy từ mạng của họ
ping -M do -s 1472 api.shop.vn
#   ping: local error: message too long, mtu=1400
#   → Mạng công ty họ có đường hầm MPLS/VPN, MTU chỉ 1400
```

```bash
# Kiểm tra phía server có nhận được ICMP không
sudo tcpdump -ni any 'icmp[icmptype] == 3 and icmp[icmpcode] == 4'
#   (không có gói nào)  → ICMP không tới được server
```

**Cách xử lý — sửa ở phía bạn, đừng bắt khách sửa:**

```bash
# ① MSS clamping tại load balancer / edge
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \
         -j TCPMSS --clamp-mss-to-pmtu
```

```nginx
# ② Nginx: hạ MSS cho listener nếu không kẹp được ở tầng mạng
# (đặt qua sysctl vì nginx không có directive MSS)
```

```bash
# ③ Bật PMTUD "dò mò" của Linux — tự hạ MTU khi nghi có hố đen,
#    không cần ICMP
sysctl -w net.ipv4.tcp_mtu_probing=1     # bật khi nghi ngờ hố đen
sysctl -w net.ipv4.tcp_base_mss=1024     # mốc an toàn để dò xuống
```

```text
   tcp_mtu_probing = 1 LÀM GÌ:
   Khi TCP thấy gửi lại nhiều lần mà không có ACK, nó TỰ HẠ kích thước
   gói xuống tcp_base_mss rồi dò tăng dần lên.
   → Cứu được hố đen PMTUD MÀ KHÔNG CẦN ICMP.
   → Đây là thứ nên bật mặc định trên mọi server công khai.
```

**Chặn tái diễn:**

```yaml
# Đưa vào cấu hình hạ tầng, không để ai đó sửa tay rồi quên
- name: net.ipv4.tcp_mtu_probing
  value: "1"
- name: net.ipv4.tcp_base_mss
  value: "1024"
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chặn sạch ICMP "cho an toàn" | **Hố đen PMTUD** — file lớn treo, không báo lỗi | Cho qua Type 3 Code 4 và ICMPv6 Type 2 |
| Chặn ICMPv6 | **IPv6 hỏng hoàn toàn**, không chỉ chậm | ICMPv6 là bắt buộc (RFC 4890) |
| Dựng VPN/GRE mà không kẹp MSS | TCP treo khi truyền dữ liệu lớn | `--clamp-mss-to-pmtu` ở đầu hầm |
| Kubernetes overlay giữ MTU 1500 | Pod **khác node** treo, cùng node thì chạy → trông "ngẫu nhiên" | Đặt MTU của CNI: VXLAN 1450, WireGuard 1440 |
| Bật jumbo frame trên một số máy | Máy 9000 nói với máy 1500 → **treo một chiều** | Bật đồng bộ **toàn bộ** miền L2 |
| Thấy "web chạy" nên loại trừ mạng | Gói nhỏ qua được, gói lớn thì không | Test bằng `ping -M do -s 1472` |
| Đổ lỗi cho băng thông | MTU làm treo, **không phải chậm** | Chậm đều = băng thông; treo hẳn = MTU |
| Chỉ dựa vào MSS clamping | **Không cứu được UDP** — QUIC, game, VoIP vẫn hỏng | Vẫn phải cho ICMP qua |
| Không bật `tcp_mtu_probing` | Không có lưới an toàn khi khách chặn ICMP | `tcp_mtu_probing=1` trên server công khai |
| Đặt MTU quá thấp cho chắc | Tăng số gói, giảm thông lượng, tốn CPU | Đo đúng bằng `tracepath` |
| Test chỉ trên localhost | MTU nội bộ 65536 — **không bao giờ gặp lỗi** | Test qua mạng thật, qua VPN thật |

## Câu hỏi phỏng vấn hay gặp

**H: MTU 1500 byte từ đâu ra?**
Từ năm 1980, khi Xerox, DEC và Intel chốt chuẩn Ethernet. Ba ràng buộc quyết định con số đó. Thứ nhất, cả toà nhà cắm chung **một sợi cáp 10 Mbps** — gói 1500 byte chiếm sợi cáp 1,2 ms, còn gói 9.000 byte chiếm 7,2 ms, nghĩa là một người tải file thì cả tầng đứng hình. Thứ hai, **RAM giá 6.000 đô một megabyte**, và card mạng phổ biến chỉ có bộ đệm 2 KB — vừa đúng một gói 1500 cộng header, không dư byte nào. Thứ ba, trên cáp dùng chung thì mọi card đều nghe mọi gói và phải cắt ranh giới theo cùng một luật, nên không thể cho hai máy tự thoả thuận số riêng. Cả ba lý do nay đã hết hiệu lực — switch từ 1995, RAM rẻ từ 2001, bỏ CSMA/CD từ 2011 — nhưng con số vẫn còn vì gói tin đi qua mười mấy nhà mạng và **muốn nâng trần thì tất cả phải đồng ý hết**.

**H: Bật VPN thì web chạy bình thường nhưng tải file lớn bị treo, vì sao?**
Đây là **hố đen PMTUD**. VPN bọc thêm khoảng 60–80 byte vào mỗi gói, nên gói 1500 byte thành 1580 và vượt trần của đường truyền. Router giữa đường lẽ ra phải gửi ngược một thông báo ICMP "gói quá to, MTU là 1420", nhưng **tường lửa công ty chặn sạch ICMP** nên thông báo đó không bao giờ tới. Bên gửi tưởng gói đã đi thành công, ngồi chờ ACK mãi mãi. Chữ ký đặc trưng là **mọi thứ nhỏ chạy được, mọi thứ lớn treo, và không có thông báo lỗi nào**: bắt tay TCP 60 byte qua được nên kết nối thiết lập thành công, gõ `ssh` 100 byte qua được, nhưng dữ liệu file với gói đầy 1500 byte thì chết đứng — nên thanh tiến trình dừng ở 41%.

**H: MSS clamping là gì và vì sao nó tốt hơn dựa vào ICMP?**
MSS clamping là việc router ở đầu đường hầm **sửa giá trị MSS trong gói SYN** lúc hai bên bắt tay TCP, ép chúng thoả thuận gói nhỏ hơn ngay từ đầu. Ưu điểm là nó **không phụ thuộc vào ICMP** — không cần thông báo lỗi nào, nên không thể rơi vào hố đen. Cấu hình an toàn nhất là `--clamp-mss-to-pmtu` để router tự tính theo MTU thật của đường hầm thay vì đặt số cứng. Nhưng nó có giới hạn quan trọng: **chỉ cứu được TCP**, vì UDP không có giai đoạn bắt tay để mà sửa. Nên QUIC/HTTP3, WireGuard, game online và VoIP vẫn cần ICMP hoạt động — đó là lý do không thể coi MSS clamping là lý do để chặn ICMP.

**H: Chặn ICMP có an toàn hơn không?**
Chặn **một số loại** thì được, chặn sạch thì làm hỏng giao thức. `Echo Request` chặn được nếu không muốn bị dò mạng, `Redirect` thì nên chặn. Nhưng **ICMP Type 3 Code 4 "Fragmentation Needed" là đường báo lỗi MTU duy nhất mà IPv4 có** — chặn nó là tự tạo hố đen. Với IPv6 thì nghiêm trọng hơn nhiều: router giữa đường **tuyệt đối không được chẻ gói**, chỉ bên gửi mới được, và nó chỉ biết cần chẻ khi nhận ICMPv6 "Packet Too Big". Nên chặn ICMPv6 không phải là "giảm tính năng" mà là **phá hỏng IPv6** — RFC 4890 nói rõ điều này.

**H: Ứng dụng trên Kubernetes bị treo lúc upload, nhưng chỉ một số pod, chẩn đoán thế nào?**
"Chỉ một số pod" chính là manh mối. Pod **cùng node** giao tiếp qua bridge nội bộ nên không đi qua mạng overlay; pod **khác node** thì phải qua VXLAN, mà VXLAN bọc thêm 50 byte. Nếu interface trong pod vẫn khai MTU 1500 thì gói thành 1550 và bị vứt. Em kiểm tra bằng `ip link show eth0` xem pod khai bao nhiêu, rồi `ping -M do -s 1472` tới pod khác node xem thực tế được bao nhiêu. Cách sửa là đặt MTU đúng cho CNI: VXLAN thì 1450, IPIP thì 1480, WireGuard thì 1440. Và em thêm một DaemonSet kiểm tra MTU thật sau mỗi lần nâng cấp cụm, vì nâng cấp CNI hay đổi backend rất hay làm lệch giá trị này.

**H: Có cách nào chống hố đen PMTUD mà không phụ thuộc vào khách hàng không?**
Có — bật `net.ipv4.tcp_mtu_probing=1` trên server. Khi TCP thấy gửi lại nhiều lần mà không có ACK, nó tự hạ kích thước gói xuống `tcp_base_mss` rồi dò tăng dần lên, tức là **tự tìm MTU đúng mà không cần ICMP**. Đây là thứ em bật mặc định trên mọi server công khai, vì bạn không kiểm soát được tường lửa của khách hàng — họ chặn ICMP thì bạn vẫn phải phục vụ được họ. Nó không thay thế việc cấu hình đúng, nhưng nó là lưới an toàn hiệu quả nhất mà bạn tự làm được một mình.

## Tóm tắt bài 2

- **MTU 1500 chốt năm 1980** bởi Xerox, DEC, Intel — sớm hơn phần lớn người đoán.
- Ba ràng buộc: **cáp dùng chung 10 Mbps** (gói 9.000 byte làm cả tầng chờ 7,2 ms), **RAM 6.000 USD/MB** (card mạng chỉ có bộ đệm 2 KB), và **vật lý cáp đồng buộc mọi máy theo cùng một luật**.
- Cả ba đã hết hiệu lực (1995, 2001, 2011) nhưng 1500 vẫn còn, vì gói đi qua mười mấy nhà mạng và **muốn nâng thì tất cả phải đồng ý**.
- **Hố đen PMTUD**: VPN bọc thêm 60–80 byte → gói vượt trần → router gửi ICMP báo lỗi → **tường lửa chặn ICMP** → bên gửi chờ mãi.
- Chữ ký đặc trưng: **nhỏ chạy, lớn treo, không có lỗi nào**. Bắt tay TCP xong, thanh tiến trình đứng ở 41%.
- **Chặn ICMPv6 = phá hỏng IPv6**, vì router IPv6 tuyệt đối không chẻ gói.
- **MSS clamping** không phụ thuộc ICMP nhưng **chỉ cứu TCP** — UDP/QUIC vẫn cần ICMP.
- Kubernetes overlay: pod **khác node** mới treo → lỗi trông "ngẫu nhiên". Đặt MTU CNI đúng.
- Chẩn đoán: `ping -M do -s 1472`, `tracepath`, và bật **`tcp_mtu_probing=1`** làm lưới an toàn.
- **Treo hẳn = MTU. Chậm đều = băng thông.** Đừng nhầm hai cái.

> *Ràng buộc nào trong con số bạn chốt hôm nay sẽ hết hiệu lực trước, mà con số thì vẫn nằm đó?*

**Bài kế tiếp** → [Bài 3: 4 byte — cái đồng hồ sẽ dừng vào năm 2038](03-bon-byte-cua-dong-ho-unix.md)

**Quay lại** → [Bài 1: 32 bit của địa chỉ IP](01-ba-muoi-hai-bit-cua-dia-chi-ip.md)
