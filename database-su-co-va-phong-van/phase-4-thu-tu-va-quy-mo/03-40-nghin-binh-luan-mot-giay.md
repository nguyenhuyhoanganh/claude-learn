# Bài 18: 40 nghìn bình luận một giây và ba cánh cửa

2,1 triệu người trong một phiên live. Cột bình luận bên phải màn hình chạy như thác. Chữ trôi nhanh tới mức mắt bạn **không bấm kịp một dòng nào**.

Bạn gõ hai chữ *"chốt đơn"*, bấm gửi. Dòng chữ của bạn **hiện lên ngay** giữa dòng thác đó. Bạn thấy nó. Nó có thật. Nó ở ngay đó.

Và bạn tin rằng 2,1 triệu người vừa nhìn thấy nó.

Đây là chỗ tôi phải nói thật: **rất có thể không một ai thấy dòng đó cả. Không một ai.**

Không phải lỗi. Không phải mạng. **Đó là thiết kế, và nó cố ý như vậy.**

Dòng chữ của bạn phải qua **ba cánh cửa** để sống hay chết: **Cửa Nhân → Cửa Phễu → Cửa Vọng**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **Fan-out** (nhân bản) | Một tin nhắn phải được nhân ra và gửi tới nhiều người nhận | Một lá thư phải photocopy ra hàng triệu bản |
| **Tỷ lệ fan-out** | Số bản sao phải tạo cho **mỗi** tin gửi lên | Một thư gửi đi cho bao nhiêu người |
| **WebSocket** | Kết nối hai chiều **giữ mở liên tục** giữa trình duyệt và máy chủ | Đường dây điện thoại luôn nhấc máy, không phải gọi lại mỗi lần |
| **Pub/Sub** | Mô hình phát tin: bên phát đẩy vào một kênh, mọi bên đăng ký đều nhận | Đài phát thanh |
| **Sampling** (bốc mẫu) | Chỉ giữ một phần dữ liệu, bỏ phần còn lại | Đọc 10 lá thư đại diện thay vì cả bao tải |
| **Backpressure** (đẩy ngược) | Cơ chế khi bên nhận chậm hơn bên gửi: chặn bớt hoặc bỏ bớt | Van an toàn khi nước vào nhanh hơn nước ra |
| **Optimistic UI** | Giao diện **vẽ trước** kết quả, giả định thao tác sẽ thành công | Đánh dấu "đã gửi" ngay khi bấm, chưa cần bưu điện xác nhận |
| **Edge server** | Máy chủ đặt gần người dùng, giữ kết nối và phát tin | Trạm phát lại đặt ở từng tỉnh |
| **Hot key / hot room** | Một khoá/phòng nóng tới mức một máy không gánh nổi | Một quầy có cả nghìn người xếp hàng, các quầy khác vắng |
| **Batching** (gom lô) | Gom nhiều tin thành một gói rồi gửi một lần | Gom thư cả ngày rồi giao một chuyến |

## Cửa 1 — Cửa Nhân: con số 84 tỷ vô nghĩa

Ta thử đi theo đúng một dòng chữ. Nó rời máy bạn, bay tới máy chủ. Đó là phần **dễ**.

Giờ máy chủ phải làm gì với nó? Đây mới là phần khó. Nó phải đưa dòng đó lên màn hình của **mọi người đang xem** — không phải gửi một lần, mà là:

```text
   2.100.000 BẢN SAO cho đúng MỘT dòng chữ.
```

Mà bạn không phải người duy nhất đang gõ. **Cả phòng cùng gõ.** Nên phép nhân này chạy cả hai chiều cùng lúc:

```text
   Lúc cao trào, mỗi giây có chừng 40.000 dòng bình luận gửi lên.

   Mỗi dòng, nếu muốn ai cũng thấy, phải nhân lên 2.100.000 lần.

        40.000 dòng/giây  ×  2.100.000 màn hình
        ═══════════════════════════════════════
        =  84.000.000.000 bản sao MỖI GIÂY
```

**84 tỷ bản sao chữ mỗi giây, cho đúng một phòng live.**

Con số này không phải **lớn** — nó **vô nghĩa**:

```text
   • Cả thế giới hiện có khoảng 8 tỷ người.
     → Con số kia gấp 10 LẦN DÂN SỐ TRÁI ĐẤT, và nó LẶP LẠI MỖI GIÂY,
       trong MỘT phòng live.

   • Quy ra băng thông: mỗi bình luận cả phần vỏ khoảng 100 byte
     → 84 tỷ × 100 byte = 8.400 GB/giây = 8,4 TB/giây.
     Trong khi tổng băng thông Internet quốc tế của cả Việt Nam
     tính bằng đơn vị Tbps — tức là chỉ một phòng live này
     đã ngốn hơn cả một quốc gia.
```

**Không hạ tầng nào trên đời gánh nổi phép nhân đó.**

Nhưng đây mới là chỗ hay: **cũng không ai cần nó cả.**

## Cửa 2 — Cửa Phễu: bỏ bớt để tồn tại

Phép nhân vỡ ngay trên giấy, nên máy chủ **không đi theo đường đó**.

Nó chọn: trong 40.000 dòng của một giây, nó **chỉ giữ lại vài chục dòng** để phát đi. Số còn lại bị **bỏ ngay tại chỗ, bỏ hẳn: không lưu, không phát.**

```text
                    40.000 dòng/giây
              ╲╲╲╲╲╲╲╲╲│╱╱╱╱╱╱╱╱╱
               ╲╲╲╲╲╲╲╲│╱╱╱╱╱╱╱╱
                ╲╲╲╲╲╲╲│╱╱╱╱╱╱╱
                 ╲╲╲╲╲╲│╱╱╱╱╱╱      ← miệng phễu hứng hết
                  ╲╲╲╲╲│╱╱╱╱╱
                   ╲╲╲╲│╱╱╱╱
                     ╲╲│╱╱
                      ╲│╱
                       │              ← cổ phễu: vài chục dòng lọt qua
                       ▼
                 40–60 dòng/giây

        Phần không lọt DỪNG Ở ĐÓ. Không lưu. Không phát. Không ai biết.
```

### Các luật ưu tiên qua phễu

Không phải bốc ngẫu nhiên hoàn toàn. Có thứ tự ưu tiên rất rõ ràng, và nó nói lên **hệ thống coi trọng cái gì**:

```text
   ① Người vừa TẶNG QUÀ            ← liên quan tới TIỀN, không bao giờ bỏ
   ② Người được chủ phòng NHẮC TÊN  ← chủ phòng là trung tâm nội dung
   ③ Người MỚI VÀO phòng            ← tạo cảm giác phòng đang sống
   ④ Người bạn ĐANG THEO DÕI        ← tăng cảm giác quen thuộc
   ⑤ Còn lại thì BỐC NGẪU NHIÊN
```

### Hệ quả gây sốc: có 2,1 triệu cột bình luận khác nhau

Vì tầng ⑤ là **bốc ngẫu nhiên**, và mỗi người xem được bốc **một mẻ riêng**:

```text
   ┌─────────────────────────────────────────────────────────────┐
   │  HAI NGƯỜI NGỒI CẠNH NHAU, CÙNG XEM MỘT PHIÊN LIVE,          │
   │  ĐANG ĐỌC HAI CỘT CHỮ KHÁC HẲN NHAU.                         │
   └─────────────────────────────────────────────────────────────┘

   → KHÔNG TỒN TẠI một "cột bình luận chính thức" nào của phiên live đó.
   → Có 2,1 TRIỆU cột khác nhau.
   → KHÔNG CỘT NÀO ĐẦY ĐỦ — kể cả cột trên máy của chủ phòng.
```

Điều này nghe khó chịu, nhưng nó là **hệ quả toán học bắt buộc**, không phải lựa chọn về đạo đức hay chất lượng sản phẩm.

## Cửa 3 — Cửa Vọng: mẹo "tiếng vọng tại chỗ"

Cổ phễu cắt bỏ gần hết. Vậy vì sao dòng chữ **của bạn** vẫn hiện lên?

Bấm gửi xong, dòng chữ hiện lên **tức thì, 0 giây chờ**. Nhanh hơn cả thời gian gói tin đi tới máy chủ và quay về.

**Vì nó chưa tới máy chủ.**

```text
   Cái bạn TƯỞNG đang xảy ra:
      [bấm gửi] ──► máy chủ ──► xử lý ──► phát về ──► [chữ hiện lên]
                  (ít nhất 60–200 ms khứ hồi)

   Cái THẬT SỰ xảy ra:
      [bấm gửi] ──► MÁY CỦA BẠN TỰ VẼ CHỮ LÊN MÀN HÌNH  (0 ms)
                 ╲
                  ╲──► rồi mới lo gửi đi sau
                        ╲──► máy chủ: có thể GIỮ, có thể BỎ.
                              Màn hình của bạn KHÔNG BIẾT và KHÔNG ĐỔI.
```

Người ta gọi đó là **Optimistic UI** — giao diện lạc quan. Máy của bạn **đoán trước** rằng dòng chữ sẽ được nhận, nên nó vẽ ra trước cho bạn xem. Nó đoán, và **phần lớn thời gian nó đoán đúng** (ít nhất là đúng ở chỗ tin nhắn có tới máy chủ).

```text
   Nếu cái phễu ở trên LOẠI dòng của bạn thì màn hình bạn có đổi gì không?

   KHÔNG. Không đổi một chút nào.

   Bạn vẫn thấy chữ mình nằm đó giữa dòng thác —
   nhưng nó chỉ nằm trên đúng 1 TRONG 2.100.000 MÀN HÌNH:
   màn hình của chính bạn.
```

## Nghe tới đây thấy bực? Thử gỡ hết mẹo ra xem

Giả sử ta làm **công bằng tuyệt đối**: ai gõ gì cũng tới tất cả mọi người. Và giả sử có một hạ tầng thần kỳ gánh nổi 84 tỷ bản sao mỗi giây, không bỏ dòng nào.

**Ta được gì?**

```text
   • Màn hình điện thoại chứa được chừng 12 DÒNG chữ.

   • 40.000 dòng/giây tràn vào 12 chỗ ngồi
     → cả màn hình bị THAY MỚI HOÀN TOÀN trong 12/40.000 giây
     = 0,0003 giây = 0,3 mili-giây.

   • Mắt người cần khoảng 200 MILI-GIÂY để đọc xong một dòng.

   • Tỷ lệ: 200 ms / 0,3 ms ≈ 667 LẦN.
     Màn hình bị thay mới nhanh hơn tốc độ đọc của bạn gần 700 lần.

   ═══ KẾT QUẢ: BẠN SẼ KHÔNG ĐỌC ĐƯỢC BẤT KỲ CHỮ NÀO CẢ. ═══
```

> **Con số làm sập hạ tầng (40.000 dòng/giây) cũng chính là con số làm màn hình thành vô dụng.**
>
> Bỏ bớt chữ không phải là cắt xén vì tiếc tiền. Nó là **điều kiện bắt buộc để con người còn đọc được**.

Đây là một trong những bài học thiết kế đẹp nhất trong hệ phân tán: **giới hạn của con người và giới hạn của hạ tầng gặp nhau ở cùng một chỗ.** Khi hai giới hạn đó trùng nhau, giải pháp đúng không phải là "cố gánh thêm" mà là "chấp nhận bỏ bớt".

## Bên dưới nắp capo: hệ thống đó thật sự chạy thế nào

Phần này đi sâu hơn câu chuyện, vì đây là thứ bạn sẽ phải tự dựng nếu làm hệ tương tác đông người.

### Kiến trúc phát tin theo tầng

Một máy chủ **không thể** giữ 2,1 triệu kết nối WebSocket. Trần thực tế của một máy được tinh chỉnh tốt là khoảng **100.000 kết nối** — bị giới hạn bởi số file descriptor, bộ nhớ mỗi kết nối (~10–50 KB), và khả năng của vòng lặp sự kiện.

Nên fan-out được làm **theo tầng**:

```text
   ┌──────────────┐
   │  Người gõ    │  40.000 dòng/giây từ khắp nơi
   └──────┬───────┘
          ▼
   ┌──────────────────────────────────────────┐
   │  TẦNG THU NHẬN (ingest)                  │
   │  • kiểm tra quyền, chặn spam, lọc từ cấm │
   │  • ghi các sự kiện CÓ TIỀN vào sổ cái    │
   └──────┬───────────────────────────────────┘
          ▼
   ┌──────────────────────────────────────────┐
   │  BỘ GOM THEO PHÒNG (một bộ cho mỗi phòng)│
   │  • MỘT nơi duy nhất quyết định            │
   │    "giây này phát những dòng nào"         │
   │  • áp luật ưu tiên + bốc mẫu ngẫu nhiên   │
   │  • gom thành LÔ theo cửa sổ ~200 ms       │
   └──────┬───────────────────────────────────┘
          ▼  phát 1 gói / 200ms  (không phải 40.000 gói/giây)
   ┌──────────────────────────────────────────┐
   │  KÊNH PUB/SUB                             │
   └──────┬───────────────────────────────────┘
          ├────────┬────────┬────────┬────────┐
          ▼        ▼        ▼        ▼        ▼
      ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
      │edge 1│ │edge 2│ │edge 3│ │ ...  │ │edge N│   ~21 máy × 100k kết nối
      └───┬──┘ └───┬──┘ └───┬──┘ └───┬──┘ └───┬──┘
          ▼        ▼        ▼        ▼        ▼
      100k người xem mỗi máy
```

### Bốn kỹ thuật giữ cho nó không sập

**① Gom lô theo cửa sổ thời gian**

```text
   Không gom:  mỗi bình luận một gói tin đẩy tới mỗi client
               → 40 gói/giây/client (sau khi qua phễu)
               → mỗi gói có phần vỏ TCP/TLS/WebSocket riêng

   Gom 200ms:  5 gói/giây/client, mỗi gói chứa ~8 bình luận
               → giảm 8 lần số gói, giảm mạnh chi phí CPU và vỏ gói tin
               → và 200ms trễ thì mắt người KHÔNG CẢM NHẬN ĐƯỢC
```

**② Đẩy ngược (backpressure): bỏ, đừng đệm**

Đây là luật sống còn:

```text
   Một client mạng yếu không nhận kịp.

   ✗ SAI:  đệm dồn lại chờ nó nhận
           → hàng đợi phình vô hạn → máy chủ OOM → SẬP CẢ EDGE
             (kéo theo 100.000 người xem khác)

   ✓ ĐÚNG: hàng đợi mỗi client có TRẦN CỨNG (ví dụ 50 tin).
           Đầy thì BỎ TIN CŨ NHẤT.
           Người mạng yếu xem được ít bình luận hơn — chấp nhận được.
```

> Cùng một nguyên lý với [Case hàng đợi vô hạn gây OOM](../../backend-scaling-cases/phase-2-thread-connection-pool/07-case-queue-vo-han-oom.md).

**③ Phòng nóng là bài toán khoá nóng**

Một phòng 2,1 triệu người và một phòng 10 người **không thể** đối xử như nhau. Nếu bạn băm phòng ra các máy theo `room_id`, thì cái máy trúng phòng lớn sẽ chết trong khi các máy khác ngồi chơi.

```text
   Cách xử lý: TÁCH RIÊNG phòng lớn ra cụm chuyên dụng,
               và tự động phát hiện phòng đang phình để chuyển sang cụm đó.
```

> Cùng bài toán với [Case hot key / celebrity](../../backend-scaling-cases/phase-4-cascading-failure/05-case-hot-key-celebrity.md).

**④ Hai đường riêng cho hai loại dữ liệu**

Đây là chỗ nối lại với [Bài 7](../phase-1-cau-hoi-co-tang-duoi/07-luu-so-du-tien-kieu-gi.md), và là bài học lớn nhất của cả khoá:

```text
   ┌─ ĐƯỜNG ĐƯỢC PHÉP BỎ ────────────────────────────────────────┐
   │  Bình luận thường                                            │
   │  → qua phễu, bốc mẫu, mất cũng không sao                     │
   │  → không lưu, hoặc chỉ lưu một phần mẫu                      │
   └──────────────────────────────────────────────────────────────┘

   ┌─ ĐƯỜNG TUYỆT ĐỐI KHÔNG ĐƯỢC BỎ ─────────────────────────────┐
   │  • Lượt tặng quà        (TIỀN → sổ cái, có khoá luỹ đẳng)   │
   │  • Thao tác kiểm duyệt  (cấm chat, xoá nội dung)             │
   │  • Tin của chủ phòng    (thông báo giá, chốt đơn)            │
   │  → đi đường riêng, ghi bền, không qua phễu bốc mẫu           │
   └──────────────────────────────────────────────────────────────┘
```

Trộn hai đường này vào nhau là lỗi thiết kế nghiêm trọng nhất trong loại hệ này: hoặc bạn bỏ mất một lượt tặng quà (mất tiền, mất uy tín), hoặc bạn buộc mọi bình luận vặt phải đi qua đường ghi bền (sập hạ tầng).

**Cùng một hệ thống, hai chuẩn đúng — đúng như hai con số ở Bài 7.**

### Còn chuyện lưu trữ thì sao?

```text
   Lưu HẾT 40.000 bình luận/giây:
      40.000 × 86.400 giây = 3,45 TỶ dòng MỖI NGÀY cho một phòng.
      Với 200 byte/dòng ≈ 690 GB/ngày.

   → Gần như không nền tảng nào lưu hết.

   Thường lưu:
      ✓ 100% sự kiện có tiền
      ✓ 100% thao tác kiểm duyệt (yêu cầu pháp lý)
      ✓ Một MẪU bình luận thường (ví dụ 1%) để phân tích
      ✓ Toàn bộ bình luận trong N phút gần nhất (để người mới vào có ngữ cảnh)
      ✗ Phần còn lại: bỏ
```

## Lời khuyên cho bài toán thiết kế phòng tương tác lớn

Dòng *"chốt đơn"* của bạn **có thật**, tới máy chủ **thật** — chỉ là nó phải xếp hàng với 40.000 dòng khác qua một cổ phễu hẹp.

> **Muốn chắc chắn được thấy trong các phòng live/chat đông?**
>
> **Đừng làm phòng to hơn. Hãy làm phòng NHỎ LẠI.**

```text
   Phễu hẹp vì PHÒNG QUÁ ĐÔNG, chứ không phải vì bạn gõ dở.

   Trong một phòng nhỏ, ai nói cũng có người nghe.
```

Và đây cũng là lời khuyên kiến trúc thật sự, không phải chỉ là một câu kết đẹp:

| Thay vì | Hãy làm |
|---|---|
| Một phòng 2,1 triệu người | Chia thành các **phòng con** vài nghìn người, mỗi phòng có luồng chat riêng |
| Cho mọi người thấy mọi thứ | Cho mọi người thấy **một tập nhất quán trong phòng con của họ** |
| Cố tăng thông lượng fan-out | Giảm **tỷ lệ fan-out** bằng cách chia nhỏ nhóm nhận |
| Đo thành công bằng "số tin đã phát" | Đo bằng **"tỷ lệ tin nhận được phản hồi"** |

Chia nhỏ phòng làm giảm tỷ lệ fan-out theo cấp số nhân, và **đồng thời** làm trải nghiệm tốt hơn — vì trong phòng nhỏ, tin của bạn thật sự có người đọc và trả lời.

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Thiết kế fan-out đầy đủ cho phòng lớn | 40k × 2,1tr = 84 tỷ bản sao/giây — bất khả thi | Bốc mẫu có ưu tiên ngay từ đầu |
| Đệm tin cho client chậm | Hàng đợi phình vô hạn → OOM → sập cả edge, kéo theo 100k người | Trần cứng mỗi client, đầy thì bỏ tin cũ nhất |
| Gửi từng tin một | Chi phí vỏ gói tin và CPU nhân lên nhiều lần | Gom lô cửa sổ ~200 ms — mắt người không nhận ra |
| Băm phòng ra máy theo `room_id` | Máy trúng phòng lớn chết, máy khác ngồi chơi | Tách phòng lớn ra cụm riêng, tự phát hiện |
| Trộn tin có tiền vào chung luồng bốc mẫu | Mất một lượt tặng quà = mất tiền thật | Hai đường riêng, hai chuẩn đúng |
| Lưu 100% bình luận | 3,45 tỷ dòng/ngày cho một phòng | Lưu đủ: tiền + kiểm duyệt + mẫu + N phút gần nhất |
| Optimistic UI không có cơ chế xác nhận | Người dùng không bao giờ biết tin của mình bị chặn/bỏ | Với tin **quan trọng** (chốt đơn, tặng quà) phải có xác nhận thật từ máy chủ |
| Dùng một máy chủ giữ tất cả kết nối | Trần thực tế ~100k kết nối/máy | Fan-out theo tầng |
| Coi phòng nhỏ và phòng lớn như nhau | Chênh nhau nhiều bậc độ lớn về cơ chế | Hai chế độ vận hành khác nhau |
| Đo thành công bằng số tin đã phát | Con số đẹp mà không ai đọc được | Đo tỷ lệ tin có người phản hồi |

## Tóm tắt bài 18

- **Cửa Nhân:** 40.000 dòng/giây × 2,1 triệu màn hình = **84 tỷ bản sao mỗi giây** — gấp 10 lần dân số Trái Đất, mỗi giây, cho một phòng. Không hạ tầng nào gánh nổi, và **cũng không ai cần nó**.
- **Cửa Phễu:** máy chủ chỉ giữ **vài chục dòng mỗi giây** để phát. Ưu tiên: người tặng quà → được nhắc tên → mới vào → còn lại **bốc ngẫu nhiên**.
- Vì bốc ngẫu nhiên, **có 2,1 triệu cột bình luận khác nhau**. Không tồn tại một cột "chính thức" — kể cả cột của chủ phòng.
- **Cửa Vọng:** chữ của bạn hiện lên tức thì vì **máy của bạn tự vẽ trước khi gửi** (Optimistic UI). Phễu có bỏ tin của bạn thì màn hình bạn cũng **không đổi gì** — bạn thấy nó trên đúng **1 trong 2,1 triệu** màn hình.
- Kể cả có hạ tầng thần kỳ, màn hình 12 dòng bị thay mới trong **0,3 ms**, còn mắt người cần **200 ms** để đọc một dòng — **nhanh hơn khả năng đọc gần 700 lần**. **Bỏ bớt là điều kiện để con người còn đọc được.**
- Kiến trúc thật: fan-out **theo tầng** (~100k kết nối/máy), **gom lô 200 ms**, **backpressure bỏ chứ không đệm**, và **tách riêng cụm cho phòng nóng**.
- **Hai đường riêng cho hai loại dữ liệu:** bình luận thường được phép bỏ; tiền, kiểm duyệt và tin chủ phòng thì tuyệt đối không.
- Muốn tin của mình được nghe: **đừng làm phòng to hơn, hãy làm phòng nhỏ lại.**

---

Đây là bài cuối của khoá. Quay lại [mục lục khoá học](../README.md) để xem toàn bộ 18 bài, hoặc mở [từ điển thuật ngữ](../TU-DIEN-THUAT-NGU.md) để tra nhanh.
