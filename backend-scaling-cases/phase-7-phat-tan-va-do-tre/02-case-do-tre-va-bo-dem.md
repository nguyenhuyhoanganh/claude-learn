# Case 2: Độ trễ livestream — mượt và tức thì là hai đầu của cùng một cái cân

**2.100.000 người** trong một phiên live. Bạn gõ câu hỏi về cái áo shop đang cầm trên tay, bấm gửi, chữ hiện lên màn hình bạn **ngay lập tức**.

**20 giây sau** shop mới đọc tới nó. Trên tay họ lúc đó đã là cái áo khác. Bạn thấy shop trả lời lạc đề, bạn gõ lại lần nữa — vẫn thế.

Shop không chậm. Mạng nhà bạn cũng không yếu.

> **Thứ bạn đang nhìn trên màn hình lúc này đã cũ 20 giây. Còn dòng chữ bạn vừa gõ thì bay tới nơi trong 1/5 giây.**

Cùng một phiên live, hai dòng dữ liệu có tốc độ lệch nhau **gấp 100 lần**. Bài này mổ chỗ lệch đó ra làm ba khoản nợ: **Mẫu**, **Đệm**, và **Chữ** — rồi rút ra một định luật dùng được cho mọi hệ thống backend, không riêng gì video.

---

## Phần 1 — Không có sợi dây nào cả

Bạn hình dung live như một sợi dây: máy quay đầu này, màn hình bạn đầu kia, hình chảy thẳng qua dây, liên tục không đứt.

**Thật ra không có sợi dây nào cả.**

Đoạn hình đó bị **cắt thành từng mẩu ngắn** (*segment*). Mỗi mẩu đóng thành **một tệp riêng có tên riêng**. Máy bạn **tải về từng tệp một**, giống hệt lúc bạn tải một tấm ảnh.

```text
Cái bạn tưởng:
   [máy quay] ══════════════ dòng chảy liên tục ══════════════ [màn hình]

Thực tế:
   [máy quay] → seg-1041.ts → seg-1042.ts → seg-1043.ts → [màn hình]
                 1,5 MB        1,5 MB        1,5 MB
                 tệp riêng     tệp riêng     tệp riêng
                 tải bằng      tải bằng      tải bằng
                 HTTP GET      HTTP GET      HTTP GET
```

Kèm theo là một **danh sách phát** (playlist) mà trình phát tải lại vài giây một lần để biết có mẩu mới:

```text
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:1041
#EXTINF:4.000,
seg-1041.ts
#EXTINF:4.000,
seg-1042.ts
#EXTINF:4.000,
seg-1043.ts        ← mẩu mới nhất; muốn thấy mẩu 1044 phải tải lại playlist
```

Đây chính là lý do phiên live **chép được** và phục vụ được 2,1 triệu người bằng CDN thường ([case 1](01-case-ty-le-dung-lai.md)): nó không phải dòng chảy, **nó là một đống tệp tĩnh**.

Còn **bình luận thì không bị cắt**. Nó là một dòng chữ ngắn, đi bằng **một đường mở sẵn từ trước** (WebSocket), lúc nào cũng thông. Gõ xong là đi.

> Hai đường chạy song song trong cùng một phiên live, nhưng **luật chơi của chúng khác hẳn nhau**.

---

## Phần 2 — Khoản nợ 1: **4 giây** để gom một mẩu (tiền mua sự rẻ)

Máy quay của shop đẩy ra hình liên tục: **30 khung/giây**. Nhưng máy chủ **không gửi từng khung một** — vì mỗi khung là một tệp thì mỗi giây phải phục vụ 30 lượt tải cho mỗi người xem.

Nó **gom lại**: đủ **4 giây hình mới đóng được 1 tệp**. Ghi tên tệp vào playlist, rồi mới đẩy tệp đó ra cho cả thế giới tải về.

```text
  t=0s   shop giơ cái áo lên
         │
         │  ← nằm chờ trong máy chủ, chưa ai thấy được
         │
  t=4s   đủ 4 giây hình → đóng tệp seg-1042.ts → ghi vào playlist → phát đi
```

> **Khoản nợ 1: 4 giây.**

### Sao không cắt mỗi mẩu 1 giây cho nhanh?

Cắt ngắn 4 lần thì **số lượt hỏi xin tệp tăng gấp 4 lần**. Và cái giá đó không nhân với 1 máy — **nó nhân với số người đang xem**.

```text
Với 2.100.000 người xem:

  mẩu 4 giây :  2.100.000 lượt mỗi 4 giây   =   525.000 lượt/giây
  mẩu 1 giây :  2.100.000 lượt mỗi 1 giây   = 2.100.000 lượt/giây

  Chưa kể playlist: trình phát tải lại playlist mỗi nửa chu kỳ mẩu
  → mẩu ngắn 4 lần thì lượt tải playlist cũng tăng 4 lần.
```

> **Đính chính con số.** Cách nói thường gặp là *"cứ 4 giây thì 2 triệu lượt, rút xuống 1 giây thì thành 8 triệu lượt/giây"*. Con số 8 triệu là **tổng lượt trong 4 giây**, không phải lượt **mỗi giây**. Nói cho chuẩn: **525.000 lượt/giây → 2.100.000 lượt/giây**, tức tăng đúng 4 lần. Kết luận không đổi, chỉ đơn vị bị lệch.

Và mỗi lượt hỏi không miễn phí:

```text
  Mỗi HTTP request tới máy biên tốn:
    - một chỗ trong bảng kết nối
    - một lượt tra cache + kiểm quyền
    - một dòng log
    ≈ vài chục microsecond CPU + vài KB RAM

  525.000 lượt/giây   → xử lý được với ~vài chục máy biên
  2.100.000 lượt/giây → cần gấp 4 số máy biên, cho CÙNG lượng byte
```

**Cái giá của độ trễ thấp không nằm ở một máy. Nó nhân với số người đang xem.**

---

## Phần 3 — Khoản nợ 2: **12 giây** bộ đệm (tiền mua sự mượt)

Tệp về tới máy bạn rồi, nhưng **vẫn chưa được phát ngay**.

Tệp đầu tiên đã nằm trong máy, trình phát có đủ hình để chiếu rồi — **nhưng nó không chiếu**. Nó ngồi đợi tệp thứ hai, rồi đợi tiếp tệp thứ ba.

```text
  3 tệp × 4 giây = 12 giây hình xếp hàng nằm chờ trong máy bạn
                   mà chưa ai được xem.
```

Chỗ xếp hàng đó gọi là **bộ đệm (buffer)**.

### Vì sao phải đợi?

Vì **mạng di động không chảy đều**. Nó giật cục — cứ vài phút lại hụt vài trăm mili giây.

```text
Bộ đệm là cái bể chứa:

    nguồn (mạng)
        │ ┈┈┈  ┈┈┈┈┈┈  ┈┈   ┈┈┈┈┈┈┈  ← chảy giật cục
        ▼
    ╔═══════════════╗
    ║   BỂ CHỨA     ║  12 giây hình
    ║   (buffer)    ║
    ╚═══════╤═══════╝
            │ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁  ← chảy đều
            ▼
      màn hình của bạn

  Nguồn phía trên ngắt vài giây → vòi phía dưới VẪN CHẢY ĐỀU vì trong bể còn hàng.
  Người xem không thấy gì bất thường.
  Bể càng dày càng an toàn.
```

> **Khoản nợ 2: 12 giây.**

### Cộng lại

```text
   4 giây  (gom mẩu ở máy chủ)
+ 12 giây  (bộ đệm ở máy bạn)
+  4 giây  (mã hoá + đẩy lên + lan qua CDN)
──────────────────────────────────────────
= 20 giây   ← đây là tuổi của hình bạn đang nhìn
```

---

## Phần 4 — Khoản nợ 3: **0 giây** cho chữ (nhanh gấp 100 lần)

Bình luận của bạn nặng chừng **40 byte** — bằng đúng một dòng chữ. Và nó khác hình ở **ba chỗ**, mỗi chỗ xoá đúng một khoản nợ ở trên:

```text
  Nợ 1 (gom mẩu)   : KHÔNG CÓ.
      Bình luận đã trọn vẹn ngay lúc bấm gửi. Không có gì để chờ gom.

  Nợ 2 (bộ đệm)    : KHÔNG CẦN.
      Hình hụt 1 nhịp → đứng khung, thấy ngay.
      Chữ tới trễ 0,5 giây → không ai nhận ra.
      → không cần bể chống giật.

  Nợ 3 (kết nối)   : ĐÃ TRẢ TRƯỚC.
      Chữ đi bằng một đường mở sẵn (WebSocket),
      không đóng mở giữa chừng, không bắt tay lại từ đầu.
```

Vế thứ ba đáng đào thêm, vì nó là chi phí ẩn của **mọi** giao thức:

```text
Nếu mỗi bình luận mở một kết nối HTTPS mới (Hà Nội → máy chủ Singapore, RTT ~40 ms):

   bắt tay TCP  (SYN, SYN-ACK, ACK)          :  1 RTT  =  40 ms
   bắt tay TLS 1.3                           :  1 RTT  =  40 ms
   gửi request + nhận response               :  1 RTT  =  40 ms
   ────────────────────────────────────────────────────────────
   tổng                                      :         120 ms  chỉ để gửi 40 byte

Với WebSocket đã mở sẵn:
   gửi khung dữ liệu                         :  1 RTT  =  40 ms
   → tiết kiệm 80 ms, và không tốn CPU cho bắt tay mã hoá
```

Đo thật: một bình luận từ Hà Nội tới máy chủ mất khoảng **200 ms**.

```text
        20 giây (hình)
       ───────────────  =  nhanh gấp 100 lần
        0,2 giây (chữ)
```

> **Thảm cảnh:** shop đọc bình luận của bạn **ngay tức thì**, nhưng cái áo bạn đang hỏi thì họ **đã cất đi từ 20 giây trước**. Hai người đang nói chuyện ở **hai mốc thời gian khác nhau**.

---

## Phần 5 — Đánh đổi: hạ 20 giây xuống 2 giây được không?

**Được chứ.** Công nghệ có sẵn: **LL-HLS** (Low-Latency HLS) và **WebRTC**.

Cách làm, đúng theo hai khoản nợ ở trên:

```text
  1. Cắt mẩu ngắn lại còn vài phần mười giây  (LL-HLS gọi là "partial segment")
  2. Rút bể chứa xuống còn 1 mẩu
```

20 giây co lại thành 2 giây. Nghe rất ngon.

**Nhưng bạn vừa tháo mất chính cái bể chống giật.**

```text
  Bể 12 giây:  mạng hụt 400 ms  →  bể còn 11,6 giây  →  người xem KHÔNG THẤY GÌ
  Bể 1 giây :  mạng hụt 400 ms  →  bể còn 0,6 giây   →  còn cầm cự được
  Bể 0,4 giây: mạng hụt 400 ms  →  bể CẠN            →  ĐỨNG KHUNG giữa câu nói
```

Mạng di động hụt 400 ms là chuyện **xảy ra liên tục ngoài đường** — chuyển trạm, thang máy, hầm chui, wifi yếu.

Và cái giá không nhân với 1 người:

```text
  2.100.000 người xem, 1% có mạng yếu:
  → 21.000 người bị đứng khung
     để đổi lấy 18 giây độ trễ thấp hơn cho những người còn lại.
```

Đây là một quyết định **kinh doanh**, không phải quyết định kỹ thuật. Và nó chỉ đúng khi 18 giây kia thật sự đáng tiền.

### Bảng ngân sách độ trễ theo giao thức

| Giao thức | Độ trễ điển hình | Cách nó đạt được | Cái giá |
|---|---|---|---|
| HLS/DASH thường (mẩu 6-10s) | **30-45 s** | Mẩu dài, bộ đệm dày | Rất rẻ, cực bền, CDN nào cũng chạy |
| HLS mẩu 2-4s | **10-20 s** | Mẩu ngắn hơn | Nhiều lượt hỏi hơn |
| **LL-HLS / LL-DASH** | **2-5 s** | Mẩu con 0,2-1 s, playlist **chặn** (server giữ request tới khi có mẩu mới), gợi ý nạp trước | CDN phải hỗ trợ; số lượt hỏi tăng mạnh; bộ đệm mỏng |
| **WebRTC** | **< 500 ms** | UDP, không đóng tệp, không CDN HTTP | **Không chép được bằng CDN thường**; phải dựng SFU; tốn máy theo số người xem |
| SRT/RIST (chặng đưa tín hiệu) | < 1 s | Dành cho chặng máy quay → máy chủ | Không dùng cho phát tới người xem |

Dòng WebRTC đáng đọc kỹ, vì nó nối thẳng vào [case 1](01-case-ty-le-dung-lai.md): WebRTC **không phải tệp tĩnh**, nên **tỷ lệ dùng lại tụt về gần 1**. Bạn phải dựng một tầng máy chủ chuyển tiếp (SFU) và số máy tăng **tuyến tính theo số người xem** — đúng cái mà cây CDN sinh ra để tránh. Đó là lý do không ai phát WebRTC cho 2,1 triệu người xem.

### Khi nào chọn cái nào

```text
  Độ trễ CÓ ý nghĩa nghiệp vụ?
        │
   ┌────┴────┐
  Không     Có
   │         │
   │    ┌────┴────────────────────────────┐
   │   Tương tác hai chiều thật sự?       │
   │    │                                 │
   │   Có (đấu giá, dạy học,             Không (bán hàng,
   │       chơi game, gọi video)          thể thao, hội thảo)
   │    │                                 │
   ▼    ▼                                 ▼
 HLS   WebRTC                           LL-HLS
 rẻ,   < 500 ms,                        2-5 s,
 bền   đắt, không CDN được              vẫn chép được bằng CDN
```

Với livestream bán hàng, câu trả lời thường là **LL-HLS** — đủ để shop trả lời đúng câu hỏi, mà vẫn giữ được cây CDN.

---

## Phần 6 — LL-HLS bên trong: rút 18 giây mà vẫn giữ được cây CDN

Phần 5 nói *"cắt mẩu ngắn lại và rút bể chứa"*. Nghe thì đơn giản, nhưng nếu chỉ làm đúng vậy thì bạn sẽ đâm vào hai bức tường. LL-HLS giải quyết chúng bằng ba cơ chế đáng học, vì **cùng ba ý tưởng đó dùng được cho mọi API gần thời gian thực**.

### Bức tường 1 — Hỏi liên tục để biết có mẩu mới

Với HLS thường, trình phát **hỏi thăm** (poll) playlist vài giây một lần. Mẩu càng ngắn thì phải hỏi càng dày:

```text
  mẩu 4 giây   → hỏi playlist mỗi ~2 giây
  mẩu 0,3 giây → hỏi playlist mỗi ~0,15 giây

  × 2.100.000 người = 14.000.000 lượt hỏi playlist mỗi giây
                      → và phần lớn trả về "chưa có gì mới"
```

**Cách LL-HLS chữa: playlist chặn (blocking playlist reload).**

```text
Trình phát hỏi:  GET /live.m3u8?_HLS_msn=1043&_HLS_part=2
                 "cho tôi playlist KHI nào có mẩu con 1043.2"

Máy chủ KHÔNG trả lời ngay. Nó GIỮ request lại tới khi mẩu đó ra đời.

  → 1 request phục vụ đúng 1 lần cập nhật, không có lượt hỏi rỗng nào
  → tỷ lệ dùng lại giữ nguyên, vì mọi người chờ CÙNG một câu trả lời
    (và máy biên gộp chúng lại đúng như case 1)
```

Đây chính là **long polling** — cùng kỹ thuật với **purgatory** của Kafka và `fetch.max.wait.ms`, cùng ý tưởng với `LISTEN/NOTIFY` của PostgreSQL. Nguyên tắc chung đáng mang đi:

> **Khi dữ liệu tới thưa hơn nhịp bạn hỏi, đừng hỏi dày hơn — hãy giữ request lại và để máy chủ trả lời khi có.**

### Bức tường 2 — Mẩu chưa đóng xong thì chưa tải được

Với HLS thường, một mẩu chỉ tồn tại **sau khi đóng file**. LL-HLS tách nó ra:

```text
  seg-1043.ts  =  part-1043.0  +  part-1043.1  +  ...  +  part-1043.9
                  (0,3 giây)      (0,3 giây)           (0,3 giây)

  Mẩu con được phát đi NGAY khi đóng, không đợi mẩu đầy đủ.
  Khi đủ 10 mẩu con, máy chủ công bố luôn tệp đầy đủ seg-1043.ts
  → người xem mạng yếu vẫn tải bản 4 giây như cũ, KHÔNG cần đổi gì.
```

```text
#EXT-X-PART-INF:PART-TARGET=0.334
#EXT-X-PART:DURATION=0.334,URI="part-1043.0.mp4"
#EXT-X-PART:DURATION=0.334,URI="part-1043.1.mp4"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part-1043.2.mp4"
                    ▲
      "mẩu con tiếp theo sẽ tên thế này" — trình phát xin TRƯỚC khi nó tồn tại,
      máy chủ giữ request lại rồi đẩy ngay khi có → tiết kiệm trọn 1 vòng RTT
```

Hai thứ đáng mang đi: **phát dần từng phần** (giống HTTP chunked / streaming response) và **gợi ý nạp trước** (giống `Link: rel=preload`, HTTP/2 push, prefetch của trình duyệt).

### Cái giá thật của LL-HLS

| Vấn đề | HLS thường | LL-HLS |
|---|---|---|
| Số lượt hỏi tệp | 525.000/giây | **~1,7 triệu/giây** (mẩu con nhiều hơn) |
| Số kết nối **đang mở** ở máy biên | Ngắn, đóng ngay | **Giữ lâu** → mỗi máy biên phải ôm hàng trăm nghìn kết nối chờ |
| Yêu cầu với CDN | CDN nào cũng chạy | Phải hỗ trợ blocking reload + phát dần; **không phải CDN nào cũng có** |
| Bộ đệm người xem | 12 giây | 1-2 giây → nhạy với mạng hụt |
| Chi phí máy biên | Chuẩn | Cao hơn ~2-4 lần |

Dòng thứ hai là chỗ hay bị bỏ sót: **giữ request lại** nghĩa là mỗi máy biên phải ôm hàng trăm nghìn kết nối đang chờ. Đó là bài toán C10K/C1M — cùng họ với [phase-6 case 3](../phase-6-runtime-ha-tang/03-case-can-port-fd.md) về cạn file descriptor. Bạn không xoá được chi phí, **bạn chuyển nó từ "nhiều lượt hỏi ngắn" sang "ít lượt hỏi nhưng giữ lâu"**.

### Đo cái gì để biết mình đặt quả cân đúng chỗ

Đây là bốn chỉ số của ngành video, và cả bốn đều có bản tương đương ở backend:

| Chỉ số | Nghĩa | Ngưỡng thường dùng | Bản tương đương ở backend |
|---|---|---|---|
| **Rebuffering ratio** | % thời gian xem bị đứng khung | < 0,5% là tốt, > 2% là hỏng | Tỷ lệ lỗi / timeout |
| **Startup time** | Từ lúc bấm play tới khung hình đầu | < 2 giây | p50 độ trễ |
| **Glass-to-glass latency** | Từ ống kính tới màn hình người xem | tuỳ mục tiêu | Độ trễ đầu-cuối |
| **Exit-before-start** | % người bỏ đi trước khi hình lên | < 3% | Tỷ lệ bỏ giỏ hàng |

```text
Nguyên tắc đọc bốn chỉ số này:

  Hạ độ trễ mà rebuffering ratio TĂNG  → bạn vừa dời chi phí sang người mạng yếu
  Hạ độ trễ mà rebuffering ratio GIỮ   → bạn vừa cải thiện thật

  Chỉ đo cột thứ ba mà không đo cột thứ nhất = tự lừa mình.
```

Và cách làm đúng của các nền tảng lớn không phải chọn một con số cho tất cả, mà là **để quả cân trượt theo từng người xem**:

```text
  mạng khoẻ, ổn định  →  bộ đệm mỏng, độ trễ 2-3 giây
  mạng yếu, hay hụt   →  bộ đệm dày, độ trễ 10-20 giây

  Cùng một phiên live, hai người xem, hai chỗ đặt quả cân khác nhau.
  Đây là ABR (adaptive bitrate) áp dụng cho ĐỘ TRỄ, không chỉ cho chất lượng hình.
```

## Phần 7 — Định luật rút ra: bộ đệm là quả cân

Mượt (*smoothness*) và tức thì (*low latency*) **không phải hai mục tiêu cùng tiến**. Chúng là **hai đầu của cùng một cái cân**, và **bộ đệm chính là quả cân**.

```text
        MƯỢT ◄──────────────┬──────────────► TỨC THÌ
                         quả cân
                     (độ dày bộ đệm)

  Đẩy quả cân sang trái  : bộ đệm dày → không giật, nhưng trễ
  Đẩy quả cân sang phải  : bộ đệm mỏng → tức thì, nhưng giật khi mạng hụt

  KHÔNG CÓ cấu hình nào cho cả hai.
  Chỉ có lựa chọn ĐẶT QUẢ CÂN Ở ĐÂU.
```

Và định luật này **không riêng gì video**. Nó là cùng một cái cân ở khắp nơi trong backend:

| Nơi | Bộ đệm là gì | Dày lên thì | Mỏng đi thì |
|---|---|---|---|
| Hàng đợi tin nhắn | Độ sâu hàng đợi | Chịu được đỉnh tải | Mất tin khi đỉnh, nhưng phản hồi nhanh |
| Kafka producer | `linger.ms`, `batch.size` | Thông lượng cao, nén tốt | Độ trễ thấp, nhiều request nhỏ |
| Ghi database | Nhóm ghi theo lô (batch) | Ít lượt ghi, đĩa nhàn | Dữ liệu thấy được ngay |
| TCP | Thuật toán Nagle | Ít gói nhỏ, mạng hiệu quả | Tương tác nhạy (nên tắt bằng `TCP_NODELAY`) |
| Connection pool | Kích thước pool + hàng chờ | Chịu được đợt dồn | Fail nhanh, không xếp hàng ([phase-1 bài 5](../phase-1-nen-tang/05-ly-thuyet-hang-doi.md)) |
| Cache | TTL | Tải nguồn thấp | Dữ liệu tươi |
| Log/metric | Vùng đệm ghi | Không chặn thread ([phase-6 case 5](../phase-6-runtime-ha-tang/05-case-logging-chan-thread.md)) | Log không mất khi crash |
| Retry | Backoff | Không dồn tải lên hệ thống ốm | Phục hồi nhanh |

Nhìn bảng này rồi quay lại câu hỏi mở đầu: **cứ chỗ nào có bộ đệm, chỗ đó có một cái cân, và ai đó đã đặt quả cân ở một chỗ — thường là mặc định của thư viện, và thường không ai kiểm lại.**

---

## Phần 8 — Áp dụng ngay: bốn thứ đo được tuần này

**1. Liệt kê mọi bộ đệm trong hệ thống của bạn, kèm giá trị hiện tại.**

```text
  linger.ms của Kafka producer            = ?     (mặc định 0 → nhiều request nhỏ)
  batch.size                              = ?
  kích thước hàng đợi của thread pool     = ?     (vô hạn? → xem phase-2 case 7)
  TTL của từng nhóm cache                 = ?
  buffer của thư viện log                 = ?
  TCP_NODELAY đã bật chưa                 = ?
```

Phần lớn các con số này chưa bao giờ được ai chọn — chúng là mặc định.

**2. Với mỗi cái, trả lời: "quả cân này đang nghiêng về phía nào, và có đúng ý mình không?"**

**3. Đo cả hai vế, đừng chỉ đo một.** Hạ độ trễ mà không đo tỷ lệ giật là tự lừa mình:

```text
  Trước khi đổi: p50 / p99 độ trễ = ?   tỷ lệ lỗi/giật = ?
  Sau khi đổi  : p50 / p99 độ trễ = ?   tỷ lệ lỗi/giật = ?
                                        ▲
                        ĐÂY là cột người ta hay quên đo
```

**4. Đặt câu hỏi đúng khi gặp sự cố.** Lần sau thấy độ trễ ở bất kỳ đâu, đừng hỏi *"ai đang chậm?"*. Hãy hỏi:

> **"Bộ đệm đang dày bao nhiêu, và ai đã chọn con số đó?"**

---

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| Nghĩ livestream là một dòng chảy liên tục | Nó là **một đống tệp tĩnh** — và đó là lý do nó phục vụ được 2,1 triệu người |
| Đổ lỗi độ trễ cho "mạng yếu" | 20 giây đó **là thiết kế**, không phải sự cố |
| Hạ độ trễ mà không đo tỷ lệ giật | Bạn vừa chuyển chi phí sang 1% người dùng mạng yếu |
| Nghĩ mượt và tức thì cùng cải thiện được | Chúng là hai đầu của một cái cân. Chỉ chọn được chỗ đặt quả cân |
| Dùng WebRTC cho hàng triệu người xem | Không chép được bằng CDN → số máy tăng tuyến tính theo người xem |
| Cắt mẩu ngắn mà quên nhân với số người xem | Số lượt hỏi tăng cùng bội số, và nhân với 2,1 triệu |
| Để mặc định của thư viện quyết định bộ đệm | Mặc định là một lựa chọn — chỉ là **không phải lựa chọn của bạn** |
| So sánh "độ trễ chat" với "độ trễ video" rồi kết luận video hỏng | Hai đường có luật chơi khác hẳn: một cái phải gom và đệm, một cái thì không |

---

## Tóm tắt case 2

- **Không có sợi dây nào cả.** Video live bị cắt thành từng tệp riêng và tải bằng HTTP — chính vì thế nó chép được bằng CDN và phục vụ nổi 2,1 triệu người.
- Ba khoản nợ tạo ra 20 giây: **4 giây gom mẩu** (tiền mua sự rẻ), **12 giây bộ đệm** (tiền mua sự mượt), **4 giây đường truyền**.
- Cắt mẩu ngắn 4 lần thì **số lượt hỏi tăng 4 lần — nhân với số người xem**. Cái giá của độ trễ thấp không nằm ở một máy.
- Bình luận nhanh gấp 100 lần vì nó xoá cả ba khoản nợ: **đã trọn vẹn lúc bấm gửi**, **không cần bể chống giật**, và **đi bằng kết nối đã mở sẵn** (tiết kiệm ~80 ms bắt tay TCP+TLS mỗi lượt).
- Hạ 20 giây xuống 2 giây **làm được**, bằng LL-HLS/WebRTC — nhưng đó là **tháo mất bể chống giật**. Với 2,1 triệu người, 1% mạng yếu là **21.000 người bị đứng khung**.
- LL-HLS làm được nhờ ba cơ chế dùng lại được ở mọi API gần thời gian thực: **playlist chặn** (long polling — máy chủ giữ request tới khi có dữ liệu), **phát dần từng mẩu con**, và **gợi ý nạp trước**. Chi phí không mất đi — nó **chuyển từ "nhiều lượt hỏi ngắn" sang "ít lượt hỏi nhưng giữ kết nối lâu"**, tức bài toán ôm hàng trăm nghìn kết nối chờ.
- Bốn chỉ số phải đo cùng lúc: **rebuffering ratio**, startup time, glass-to-glass latency, exit-before-start. **Hạ độ trễ mà rebuffering tăng là dời chi phí sang người mạng yếu, không phải cải thiện.**
- **Mượt và tức thì là hai đầu của cùng một cái cân, và bộ đệm chính là quả cân.** Không có cấu hình nào cho cả hai — chỉ có lựa chọn đặt quả cân ở đâu.
- Cái cân đó có ở khắp backend: `linger.ms`, độ sâu hàng đợi, TTL cache, Nagle, batch ghi, buffer log, backoff. **Phần lớn đang để mặc định — tức là ai đó khác đã chọn hộ bạn.**
- Lần sau gặp độ trễ, đừng hỏi *"ai đang chậm?"*. Hãy hỏi **"bộ đệm đang dày bao nhiêu, và ai chọn con số đó?"**.

**Quay lại** → [Mục lục khoá học](../README.md) · [Từ điển thuật ngữ](../00-thuat-ngu.md)
