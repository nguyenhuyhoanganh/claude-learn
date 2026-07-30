# Bài 5: Vòng đời một giao dịch — từ khởi tạo tới đối soát

## Sự cố mở đầu

Một sàn thương mại điện tử thiết kế trạng thái đơn hàng như sau:

```text
   PENDING → SUCCESS
           → FAILED
```

Ba trạng thái. Đủ dùng. Cho tới ngày này:

```text
   09:15  Khách thanh toán 2.500.000đ qua cổng thanh toán
   09:15  Cổng trả về SUCCESS → hệ thống đánh dấu đơn SUCCESS → giao hàng
   09:16  Ngân hàng của khách từ chối giao dịch (thẻ hết hạn mức)
   09:16  Cổng gửi webhook báo giao dịch bị huỷ
   09:16  Hệ thống không xử lý được vì đơn đã ở trạng thái cuối SUCCESS

   Kết quả: hàng đã giao, tiền không thu được.
```

Vấn đề: hệ thống coi **"đối tác báo thành công"** đồng nghĩa với **"tiền đã về tài khoản"**. Hai việc này cách nhau nhiều bước, và mỗi bước đều có thể thất bại.

Bài này mô tả **vòng đời đầy đủ** của một giao dịch tài chính, và vì sao ba trạng thái là không đủ.

## Bốn giai đoạn của mọi giao dịch tiền

Mọi giao dịch tài chính, dù là chuyển khoản, quẹt thẻ hay quét QR, đều đi qua bốn giai đoạn:

```text
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │ 1. KHỞI TẠO  │ → │ 2. CHO PHÉP  │ → │ 3. GHI NHẬN  │ → │ 4. QUYẾT TOÁN│
   │ (Initiation) │   │(Authorization)│  │  (Clearing)  │   │ (Settlement) │
   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
        Khách           Ngân hàng           Ghi vào sổ         Tiền THẬT
        bấm nút         xác nhận có         của các bên        chuyển giữa
                        tiền & cho phép                        các ngân hàng
```

Và một giai đoạn thứ năm, thường bị quên:

```text
   ┌──────────────┐
   │ 5. ĐỐI SOÁT  │  So sánh sổ của bạn với sổ của đối tác,
   │(Reconciliation)│ xác nhận hai bên khớp nhau
   └──────────────┘
```

**Điểm mấu chốt: bốn giai đoạn này xảy ra ở những thời điểm khác nhau, có thể cách nhau nhiều ngày.** Nhầm lẫn giữa chúng là nguồn của phần lớn sự cố tài chính.

## Giai đoạn 1: Khởi tạo (Initiation)

Khách hàng bày tỏ ý định giao dịch.

```text
   Đầu vào : ai trả, trả cho ai, bao nhiêu, bằng phương tiện gì
   Đầu ra  : một bản ghi giao dịch với mã duy nhất
   Trạng thái: INITIATED / PENDING
```

Việc quan trọng nhất ở giai đoạn này: **sinh mã giao dịch duy nhất và lưu lại ngay**, trước khi gọi bất kỳ hệ thống bên ngoài nào.

```text
   SAI:  gọi cổng thanh toán → nhận kết quả → mới lưu vào database
         → Nếu hệ thống chết giữa chừng: tiền đã trừ mà không có bản ghi nào

   ĐÚNG: lưu bản ghi PENDING → gọi cổng thanh toán → cập nhật kết quả
         → Nếu chết giữa chừng: có bản ghi PENDING để đối chiếu và xử lý sau
```

Nguyên tắc này gọi là **write-ahead**: ghi ý định trước khi hành động. Nó là lý do vì sao khi mở app ngân hàng sau một sự cố, bạn thấy giao dịch "đang xử lý" thay vì không thấy gì.

## Giai đoạn 2: Cho phép (Authorization)

Bên nắm tiền (ngân hàng phát hành thẻ, hoặc hệ thống ví) kiểm tra và cho phép:

```text
   Kiểm tra gì?
   ├── Tài khoản có tồn tại và còn hoạt động không?
   ├── Số dư khả dụng có đủ không? (bài 4)
   ├── Có vượt hạn mức không? (phase-4 bài 3)
   ├── Có dấu hiệu gian lận không? (phase-4 bài 4)
   ├── Xác thực có hợp lệ không? (PIN, OTP, sinh trắc học)
   └── Có bị chặn theo danh sách đen không? (phase-4 bài 2)

   Kết quả: APPROVED (kèm mã cho phép) hoặc DECLINED (kèm mã lý do)
```

Nếu được cho phép, thường kèm theo **giữ chỗ số tiền** (bài 4).

**Điểm cực kỳ quan trọng**: authorization **không** có nghĩa là tiền đã chuyển. Nó chỉ có nghĩa là *"ngân hàng đồng ý và đã giữ chỗ"*. Giữa authorization và việc tiền thực sự về tay bạn có thể là **vài ngày**.

```text
   Sự cố ở đầu bài chính là nhầm lẫn này:
   "Cổng trả về SUCCESS" = authorization thành công
   ≠ "tiền đã về tài khoản công ty"
```

**Thuật ngữ**:
- **Authorization code / Approval code** — mã cho phép: mã ngân hàng cấp khi chấp thuận, dùng để tham chiếu ở các bước sau.
- **Decline code / Response code** — mã từ chối: cho biết *vì sao* bị từ chối (không đủ tiền, thẻ hết hạn, nghi ngờ gian lận...). Mã này quan trọng vì quyết định có nên thử lại hay không.

## Giai đoạn 3: Ghi nhận (Clearing)

Các bên trao đổi thông tin chi tiết giao dịch và ghi vào sổ của mình.

```text
   Với thẻ: merchant gửi yêu cầu thu tiền (capture) kèm số tiền thực tế
            → mạng thẻ chuyển thông tin về ngân hàng phát hành
            → ngân hàng ghi nhận khoản nợ vào tài khoản khách

   Với chuyển khoản: hệ thống chuyển mạch gom các giao dịch trong ngày
                     và tính ra ai nợ ai bao nhiêu
```

Ở giai đoạn này, số dư sổ sách của khách hàng mới thực sự thay đổi.

**Thuật ngữ**: **capture** (thu tiền) là hành động merchant yêu cầu chuyển khoản giữ chỗ thành khoản thu thật. **Void** (huỷ) là huỷ authorization trước khi capture.

## Giai đoạn 4: Quyết toán (Settlement)

Tiền **thật sự** chuyển giữa các ngân hàng.

```text
   Trong một ngày, giữa Ngân hàng A và Ngân hàng B có:
   ├── 15.000 giao dịch từ A sang B, tổng 8 tỷ
   └── 12.000 giao dịch từ B sang A, tổng 6,5 tỷ

   Quyết toán KHÔNG chuyển 27.000 lần.
   Nó tính RÒNG: A chuyển cho B 1,5 tỷ (8 − 6,5). Một lần duy nhất.
```

**Thuật ngữ**:
- **Net settlement** — quyết toán ròng: bù trừ các khoản đối ứng, chỉ chuyển phần chênh lệch. Tiết kiệm nhưng có rủi ro nếu một bên vỡ nợ giữa chừng.
- **Gross settlement** — quyết toán toàn phần: chuyển từng giao dịch một. An toàn hơn, tốn kém hơn.
- **RTGS (Real-Time Gross Settlement)** — quyết toán toàn phần thời gian thực: dùng cho giao dịch giá trị lớn.
- **T+n** — quy ước thời gian: `T` là ngày giao dịch, `T+1` là ngày làm việc kế tiếp. "Quyết toán T+2" nghĩa là tiền về sau 2 ngày làm việc.

> **Đặc thù Việt Nam**: hệ thống thanh toán điện tử liên ngân hàng của Ngân hàng Nhà nước xử lý các khoản giá trị cao theo cơ chế **quyết toán tổng tức thời**, còn các khoản giá trị thấp được xử lý theo lô và **quyết toán ròng**. Song song đó, hệ thống chuyển mạch của NAPAS xử lý chuyển khoản nhanh 24/7 — người nhận thấy tiền **ngay lập tức**, nhưng việc quyết toán giữa các ngân hàng vẫn diễn ra sau đó theo chu kỳ. Đây chính là lý do có sự khác biệt giữa "khách hàng thấy tiền về" và "ngân hàng đã nhận tiền thật".

## Giai đoạn 5: Đối soát (Reconciliation)

So sánh sổ của bạn với sổ của đối tác. Bài 6 dành trọn cho việc này.

## Máy trạng thái đầy đủ

Đây là mô hình trạng thái tối thiểu cho một giao dịch thanh toán nghiêm túc:

```text
                    ┌───────────┐
                    │ INITIATED │  vừa tạo, chưa gọi ai
                    └─────┬─────┘
                          ▼
                    ┌───────────┐
              ┌─────│  PENDING  │─────┐  đã gửi đi, chờ phản hồi
              │     └───────────┘     │
              ▼                       ▼
      ┌───────────────┐        ┌──────────┐
      │  AUTHORIZED   │        │ DECLINED │  bị từ chối (trạng thái cuối)
      │ (đã giữ chỗ)  │        └──────────┘
      └───────┬───────┘
              │
      ┌───────┼────────┬─────────────┐
      ▼       ▼        ▼             ▼
 ┌─────────┐ ┌──────┐ ┌──────────┐ ┌─────────┐
 │CAPTURED │ │VOIDED│ │ EXPIRED  │ │ PARTIAL │
 │(đã thu) │ │(huỷ) │ │(hết hạn) │ │(thu 1 phần)│
 └────┬────┘ └──────┘ └──────────┘ └────┬────┘
      │                                  │
      ▼                                  ▼
 ┌─────────┐                       ┌──────────┐
 │ SETTLED │  tiền đã thật sự về   │ SETTLED  │
 └────┬────┘                       └──────────┘
      │
      ├──────────────┬──────────────────┐
      ▼              ▼                  ▼
 ┌──────────┐  ┌──────────┐      ┌────────────┐
 │RECONCILED│  │ REFUNDED │      │ CHARGEBACK │
 │(đã đối   │  │(đã hoàn) │      │(khách khiếu│
 │ soát)    │  │          │      │ nại, đòi   │
 └──────────┘  └──────────┘      │ lại tiền)  │
                                  └────────────┘
```

Vài quy tắc về máy trạng thái này:

**1. Không có trạng thái nào tên "SUCCESS".**
Từ này quá mơ hồ. Thành công ở giai đoạn nào? Authorized? Captured? Settled? Mỗi từ có nghĩa khác nhau và hệ quả khác nhau.

**2. `SETTLED` không phải trạng thái cuối.**
Sau khi tiền đã về, vẫn có thể có hoàn tiền hoặc tranh chấp — có khi vài tháng sau.

**3. Mọi chuyển trạng thái phải hợp lệ và được ghi lại.**
Không cho phép nhảy từ `PENDING` thẳng sang `SETTLED`. Mỗi lần chuyển ghi lại: từ đâu sang đâu, lúc nào, do sự kiện gì, ai/hệ thống nào kích hoạt.

**4. Trạng thái không xác định là trạng thái hợp lệ.**
Khi gọi đối tác mà timeout, bạn **không biết** giao dịch đã xảy ra hay chưa. Đừng đoán. Giữ ở `PENDING` và có quy trình truy vấn lại (phase-5 bài 6).

## Vì sao "3 trạng thái" luôn không đủ

```text
   Câu hỏi mà mô hình PENDING/SUCCESS/FAILED không trả lời được:

   "Tiền đã về tài khoản công ty chưa?"
     → SUCCESS có thể chỉ mới là authorized

   "Giao dịch này đã đối soát với NAPAS chưa?"
     → Không có trạng thái nào thể hiện

   "Khách đã khiếu nại giao dịch này chưa?"
     → Không có chỗ ghi

   "Đã hoàn tiền một phần hay toàn bộ?"
     → Không phân biệt được

   "Timeout khi gọi đối tác — coi là thành công hay thất bại?"
     → Không có chỗ cho "chưa biết"
```

## Ghi sổ ở giai đoạn nào?

Câu hỏi kế toán quan trọng: **bút toán được ghi khi nào?**

```text
   Nguyên tắc: ghi sổ khi NGHĨA VỤ phát sinh, không phải khi tiền chuyển.
   (Đây là nguyên tắc "kế toán dồn tích" — accrual accounting)
```

Áp dụng cụ thể:

| Giai đoạn | Ghi bút toán gì |
|---|---|
| **Khởi tạo** | Chưa ghi gì (mới chỉ là ý định) |
| **Cho phép** | Chuyển tiền sang tài khoản phong toả (bài 4) |
| **Ghi nhận** | Ghi bút toán chính: trừ ví khách, ghi nhận doanh thu/phải trả |
| **Quyết toán** | Chuyển từ "phải thu từ đối tác" sang "tiền gửi ngân hàng" |
| **Đối soát** | Không ghi bút toán mới, trừ khi phát hiện lệch |

Ví dụ đầy đủ — khách thanh toán 1.000.000đ cho merchant qua cổng của bạn, phí 2%:

```text
   [Cho phép] Giữ chỗ tiền của khách:
   ┌──────────────────────────────────────┬───────────┬───────────┐
   │ Ví khách - khả dụng                  │ 1.000.000 │           │
   │ Ví khách - phong toả                 │           │ 1.000.000 │
   └──────────────────────────────────────┴───────────┴───────────┘

   [Ghi nhận] Thu tiền thật:
   ┌──────────────────────────────────────┬───────────┬───────────┐
   │ Ví khách - phong toả                 │ 1.000.000 │           │
   │ Phải trả merchant                    │           │   980.000 │
   │ Doanh thu phí giao dịch              │           │    20.000 │
   └──────────────────────────────────────┴───────────┴───────────┘

   [Quyết toán] Chuyển tiền cho merchant (T+1):
   ┌──────────────────────────────────────┬───────────┬───────────┐
   │ Phải trả merchant                    │   980.000 │           │
   │ Tiền chờ chuyển đi (bù trừ)          │           │   980.000 │
   └──────────────────────────────────────┴───────────┴───────────┘

   [Quyết toán] Ngân hàng xác nhận đã chuyển:
   ┌──────────────────────────────────────┬───────────┬───────────┐
   │ Tiền chờ chuyển đi (bù trừ)          │   980.000 │           │
   │ Tiền gửi ngân hàng                   │           │   980.000 │
   └──────────────────────────────────────┴───────────┴───────────┘
```

Bốn bút toán cho một giao dịch. Nghe nhiều, nhưng nhờ vậy tại **bất kỳ thời điểm nào** bạn cũng biết chính xác tiền đang ở đâu.

## Thời gian: ba mốc khác nhau

Mỗi giao dịch có ít nhất ba mốc thời gian, và chúng khác nhau:

| Mốc | Tiếng Anh | Nghĩa | Dùng để |
|---|---|---|---|
| Thời điểm giao dịch | Transaction date | Khi khách bấm nút | Hiển thị cho khách, tính hạn mức ngày |
| Thời điểm ghi sổ | Posting date / Booking date | Khi bút toán được ghi | Báo cáo kế toán, đóng sổ |
| Thời điểm quyết toán | Value date / Settlement date | Khi tiền thật chuyển | Tính lãi, đối soát với ngân hàng |

```text
   Ví dụ: khách quẹt thẻ lúc 23:50 ngày 31/7 (thứ Sáu)
   ├── Transaction date : 31/7 23:50
   ├── Posting date     : 01/8 (đã qua giờ đóng sổ ngày 31/7)
   └── Value date       : 04/8 (thứ Hai, ngày làm việc kế tiếp + T+1)
```

Nhầm ba mốc này gây ra: báo cáo doanh thu sai kỳ, tính lãi sai, đối soát không khớp. Hệ thống phải lưu **cả ba**, không phải một cột `created_at` duy nhất.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Chỉ có 3 trạng thái PENDING/SUCCESS/FAILED | Không phân biệt được authorized và settled → giao hàng khi chưa có tiền |
| Gọi đối tác trước, ghi database sau | Mất dấu giao dịch khi hệ thống chết giữa chừng |
| Coi timeout là thất bại | Tiền đã trừ thật mà hệ thống nghĩ là chưa → lệch sổ |
| Coi `SETTLED` là trạng thái cuối | Không xử lý được hoàn tiền, tranh chấp về sau |
| Cho phép nhảy trạng thái tuỳ ý | Trạng thái không nhất quán, không tin được |
| Chỉ lưu một mốc thời gian | Báo cáo sai kỳ, đối soát không khớp |
| Ghi nhận doanh thu ngay khi authorized | Doanh thu ảo, phải điều chỉnh khi giao dịch bị huỷ |
| Không có bút toán cho giai đoạn "tiền đang trên đường" | Tiền như biến mất giữa hai giai đoạn |

## Tóm tắt bài 5

- Mọi giao dịch đi qua **5 giai đoạn**: khởi tạo → cho phép → ghi nhận → quyết toán → đối soát. Chúng cách nhau về thời gian, có khi nhiều ngày.
- **Authorization ≠ tiền đã về.** Nhầm lẫn này là nguồn của sự cố "giao hàng mà không thu được tiền".
- **Ghi database trước, gọi đối tác sau** (write-ahead) — để không mất dấu giao dịch khi có sự cố.
- Mô hình **3 trạng thái là không đủ**. Cần phân biệt authorized / captured / settled / reconciled / refunded / chargeback.
- Tránh dùng từ **"SUCCESS"** — nó không nói rõ thành công ở giai đoạn nào.
- **Trạng thái "chưa biết" là hợp lệ**: timeout không đồng nghĩa với thất bại.
- Ghi sổ theo **nguyên tắc dồn tích** — khi nghĩa vụ phát sinh, không phải khi tiền chuyển. Mỗi giai đoạn một bút toán.
- Lưu **ba mốc thời gian**: giao dịch, ghi sổ, quyết toán. Chúng khác nhau và dùng cho những mục đích khác nhau.

**Bài kế tiếp** → [Bài 6: Đối soát — vì sao luôn lệch và xử lý thế nào](06-doi-soat.md)
