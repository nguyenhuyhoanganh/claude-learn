# Bài 3: Thanh toán thẻ — cấp phép, ghi nhận và quyết toán

## Sự cố mở đầu

Một khách sạn nhận đặt phòng bằng thẻ. Quy trình của họ: khách đặt phòng thì **giữ tiền** 5 triệu, tới ngày nhận phòng mới **thu thật**.

Tháng 3, họ nhận 1.200 đơn đặt phòng. Giữ tiền đủ 1.200 lần.

Tháng 4, kế toán đối chiếu và phát hiện: **chỉ 890 khoản được thu thật**. 310 khoản còn lại — tổng 1,5 tỷ đồng — biến mất khỏi hệ thống. Không có bản ghi huỷ, không có bản ghi hoàn.

Điều tra ra: khách sạn giữ tiền nhưng **không thu trong vòng 7 ngày**. Sau 7 ngày, ngân hàng phát hành **tự động giải toả** khoản giữ đó. Tiền trả về cho khách, và khách sạn không thu được gì cả.

Không ai báo lỗi. Không có thông báo. Khoản giữ chỉ đơn giản là **hết hạn**.

Sự cố này đến từ việc không hiểu rằng thanh toán thẻ có **ba mốc riêng biệt**, mỗi mốc có luật riêng và thời hạn riêng.

## Ba mốc của một giao dịch thẻ

```text
   ① CẤP PHÉP (authorization)          ② GHI NHẬN (capture)         ③ QUYẾT TOÁN (settlement)
   ─────────────────────────           ────────────────────         ─────────────────────────
   "Khách có đủ tiền không,            "Tôi chốt thu đúng           "Tiền thật sự chuyển
    và có cho phép không?"              số tiền này"                 giữa các ngân hàng"

   Tiền: BỊ GIỮ, chưa trừ              Tiền: chốt số                Tiền: CHUYỂN THẬT
   Thời gian: vài giây                 Thời gian: bạn quyết định    Thời gian: T+1, T+2
   Kết quả: auth code                  Có thể thu ÍT HƠN cấp phép   Không đảo ngược được

           │                                    │                            │
           │◄────── hạn 7–30 ngày ─────────────►│                            │
           │        (tuỳ tổ chức thẻ)           │◄────── 1–2 ngày ──────────►│
           │                                    │
           └── HẾT HẠN THÌ TỰ GIẢI TOẢ ─────────┘
                  ▲
        ĐÂY LÀ CHỖ 1,5 TỶ CỦA KHÁCH SẠN BIẾN MẤT
```

> **Điều phải khắc cốt ghi tâm:** cấp phép thành công **không phải** là đã có tiền. Nó chỉ là một lời hứa có thời hạn. Không ghi nhận đúng hạn thì lời hứa đó tự huỷ.

## Cấp phép làm gì bên trong

```text
   ┌───────────┐                                   ┌──────────────┐
   │ ĐƠN VỊ    │  ①số thẻ, số tiền, mã đơn        │ NGÂN HÀNG    │
   │ BÁN HÀNG  │──────────────────────────────────►│ PHÁT HÀNH    │
   └───────────┘   (qua PSP, acquirer, scheme)     └──────┬───────┘
                                                           │
                                              ②KIỂM TRA:  │
                                              · thẻ còn hiệu lực?
                                              · đủ hạn mức khả dụng?
                                              · có dấu hiệu gian lận?
                                              · đúng mã CVV / 3-D Secure?
                                                           │
   ┌───────────┐  ③auth code + mã kết quả               │
   │ ĐƠN VỊ    │◄──────────────────────────────────────────┘
   │ BÁN HÀNG  │
   └───────────┘   VÀ QUAN TRỌNG: ngân hàng GIỮ số tiền đó
                   khỏi hạn mức khả dụng của khách
                   (xem lại phase 1 bài 4 — số dư khả dụng)
```

```text
   ⚠ HAI THỨ HAY BỊ NHẦM:

   ① "Cấp phép thành công" ≠ "đã trừ tiền"
      Tiền vẫn nằm trong tài khoản khách, chỉ bị GIỮ.
      Sao kê của khách hiện là "giao dịch chờ", không phải giao dịch thật.

   ② Từ chối cấp phép KHÔNG có nghĩa là khách không đủ tiền
      Mã từ chối có hàng chục loại: nghi gian lận, sai CVV, thẻ khoá,
      vượt hạn mức ngày, ngân hàng đang bảo trì...
      → ĐỌC ĐÚNG MÃ TỪ CHỐI mới biết có nên cho khách thử lại không.
```

## Đọc mã từ chối — chia làm hai nhóm

```text
   NHÓM "THỬ LẠI ĐƯỢC" (lỗi tạm thời)
      · Ngân hàng phát hành không phản hồi
      · Hệ thống đang bận
      · Timeout
      → Có thể thử lại sau vài giây, TỐI ĐA 2–3 lần, có giãn cách.

   NHÓM "KHÔNG ĐƯỢC THỬ LẠI" (lỗi cứng)
      · Thẻ bị khoá / báo mất
      · Nghi ngờ gian lận
      · Sai thông tin thẻ
      · Không đủ hạn mức
      → THỬ LẠI LÀ CÓ HẠI:
        - tăng điểm rủi ro của đơn vị bán hàng trong mắt tổ chức thẻ
        - có thể khiến thẻ khách bị khoá hẳn
        - một số ngân hàng tính phí cho mỗi lần bị từ chối

   ⚠ THỬ LẠI MÙ QUÁNG LÀ LỖI PHỔ BIẾN NHẤT KHI TÍCH HỢP THẺ.
     Nó biến một giao dịch hỏng thành một tài khoản bị khoá.
```

## Ghi nhận — và ba biến thể phải hỗ trợ

```text
   ① GHI NHẬN ĐỦ (full capture)
      Cấp phép 500.000 → ghi nhận 500.000
      Trường hợp phổ biến nhất.

   ② GHI NHẬN ÍT HƠN (partial capture)
      Cấp phép 500.000 → ghi nhận 380.000 (khách trả bớt một món)
      Phần chênh lệch được giải toả về cho khách.
      ⚠ Không phải tổ chức thẻ nào cũng cho phép — phải kiểm tra trước.

   ③ GHI NHẬN NHIỀU LẦN (multiple capture)
      Cấp phép 5.000.000 cho một đơn hàng nhiều kiện
      → giao kiện 1: ghi nhận 2.000.000
      → giao kiện 2: ghi nhận 3.000.000
      Dùng cho thương mại điện tử giao nhiều đợt.

   ⚠ GHI NHẬN NHIỀU HƠN CẤP PHÉP LÀ KHÔNG ĐƯỢC.
     Cần thu thêm → phải cấp phép mới cho phần chênh.
```

```text
   QUY TẮC VÀNG VỀ THỜI ĐIỂM GHI NHẬN:

   GHI NHẬN KHI BẠN ĐÃ GIAO HÀNG HOẶC CUNG CẤP DỊCH VỤ.

   Ghi nhận quá sớm  → khách khiếu nại "trả tiền mà chưa nhận hàng"
                       → chargeback, và bạn thường thua
   Ghi nhận quá muộn → khoản giữ hết hạn, mất tiền
                       (chính là sự cố ở đầu bài)
```

## Vòng đời đầy đủ, kèm mọi nhánh

```text
                        ┌─────────────┐
                        │  CẤP PHÉP   │
                        └──────┬──────┘
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌──────────┐    ┌────────────┐   ┌────────────┐
        │ TỪ CHỐI  │    │ ĐƯỢC DUYỆT │   │  TIMEOUT   │
        │          │    │            │   │(không biết)│
        └──────────┘    └─────┬──────┘   └─────┬──────┘
                              │                 │ truy vấn trạng thái
              ┌───────────────┼─────────┐       │
              ▼               ▼         ▼       ▼
        ┌──────────┐   ┌──────────┐  ┌────────────────┐
        │  HUỶ     │   │ GHI NHẬN │  │  HẾT HẠN       │
        │  (void)  │   │(capture) │  │  (tự giải toả) │
        └──────────┘   └────┬─────┘  └────────────────┘
         tiền giải toả      │              ▲
         ngay, không         ▼              │ KHÔNG AI BÁO
         để lại dấu    ┌──────────┐         │ CHO BẠN
         trên sao kê   │QUYẾT TOÁN│         │
                       └────┬─────┘         │
                            │               │
                    ┌───────┴────────┐      │
                    ▼                ▼      │
              ┌──────────┐   ┌────────────┐ │
              │ HOÀN TIỀN│   │ ĐÒI BỒI    │ │
              │ (refund) │   │ HOÀN       │ │
              └──────────┘   │(chargeback)│ │
                             └────────────┘ │
                                            │
              ĐƯỜNG NGUY HIỂM ──────────────┘
```

**Huỷ (void) và hoàn tiền (refund) khác nhau ở đâu:**

| | Huỷ | Hoàn tiền |
|---|---|---|
| Thời điểm | **Trước** quyết toán | **Sau** quyết toán |
| Tiền đã chuyển chưa | Chưa | Rồi |
| Dấu vết trên sao kê khách | Thường **không để lại** | Có hai dòng: trừ rồi hoàn |
| Phí | Thường miễn phí | **Thường mất phí, không hoàn lại** |
| Thời gian khách nhận lại | Ngay hoặc vài giờ | 3–15 ngày làm việc |

```text
   → LUÔN ƯU TIÊN HUỶ NẾU CÒN KỊP.
     Rẻ hơn, nhanh hơn cho khách, và không để lại dòng khó hiểu
     trên sao kê của họ.

   → Hệ thống phải biết giao dịch ĐÃ QUYẾT TOÁN CHƯA để chọn đúng lệnh.
     Không biết → gọi nhầm lệnh → lỗi, và khách chờ vô ích.
```

## Vì sao tiền về chậm hơn bạn nghĩ

```text
   NGÀY 1, 14:00   khách quẹt thẻ, cấp phép thành công
   NGÀY 1, 23:00   đơn vị bán hàng gửi lô ghi nhận trong ngày
   NGÀY 2          acquirer gửi lô lên tổ chức thẻ, bù trừ
   NGÀY 3          tiền về tài khoản đơn vị bán hàng (T+2)

   ⚠ VÀ MỘT SỐ ĐỐI TÁC CÒN GIỮ LẠI MỘT PHẦN (rolling reserve):
     Giữ 5–10% doanh thu trong 90–180 ngày để phòng chargeback.

   → NẾU BẠN LÀM BÁO CÁO DÒNG TIỀN, ĐỪNG DÙNG NGÀY GIAO DỊCH.
     Doanh thu ghi nhận ngày 1, nhưng tiền vào ngày 3,
     và một phần chỉ vào sau 90 ngày.
     Nhầm hai con số này là nguyên nhân kinh điển của việc
     "sổ sách có lãi mà tài khoản không có tiền".
```

## Chống sự cố như ở đầu bài

```text
   ① THEO DÕI KHOẢN GIỮ SẮP HẾT HẠN — bắt buộc

      Bảng cần có: mã giao dịch, thời điểm cấp phép, hạn giải toả,
                   trạng thái ghi nhận
      Cảnh báo khi: còn 48 giờ mà chưa ghi nhận

      SELECT * FROM card_authorizations
      WHERE captured_at IS NULL
        AND voided_at IS NULL
        AND expires_at < now() + interval '48 hours';

   ② LƯU HẠN GIẢI TOẢ NGAY LÚC CẤP PHÉP
      Hạn này khác nhau theo tổ chức thẻ và loại giao dịch.
      Đừng hardcode 7 ngày — hỏi đối tác và lưu theo từng giao dịch.

   ③ ĐỐI CHIẾU BA CON SỐ MỖI NGÀY
      số cấp phép − số ghi nhận − số huỷ = số đang chờ
      Con số cuối phải giải thích được từng khoản.

   ④ CÓ QUY TRÌNH CHO KHOẢN SẮP HẾT HẠN
      Hoặc ghi nhận, hoặc huỷ tường minh — không để nó tự hết hạn.
      Tự hết hạn là mất tiền im lặng, không có bản ghi nào.
```

## Ba con số phải theo dõi hằng ngày

| Chỉ số | Ý nghĩa | Ngưỡng đáng lo |
|---|---|---|
| **Tỷ lệ cấp phép thành công** | Bao nhiêu phần trăm giao dịch được duyệt | Giảm đột ngột → ngân hàng đổi luật, hoặc bạn bị đánh dấu rủi ro |
| **Khoản giữ chưa ghi nhận** | Tiền đang treo, có hạn | Tăng dần → quy trình ghi nhận có vấn đề |
| **Tỷ lệ chargeback** | Tỷ lệ bị đòi bồi hoàn | Vượt ngưỡng của tổ chức thẻ → **bị phạt hoặc ngừng dịch vụ** |

```text
   CHỈ SỐ THỨ BA LÀ CHỈ SỐ SỐNG CÒN.

   Các tổ chức thẻ đặt ngưỡng tỷ lệ chargeback cho từng đơn vị bán hàng.
   Vượt ngưỡng nhiều tháng liên tiếp → vào chương trình giám sát,
   phải nộp phạt, và có thể bị NGỪNG NHẬN THẺ HOÀN TOÀN.

   → Với đơn vị bán hàng, đây là rủi ro tồn tại, không phải rủi ro tài chính.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tưởng cấp phép là đã có tiền | Khoản giữ hết hạn → **mất tiền im lặng** | Theo dõi hạn giải toả, cảnh báo trước 48 giờ |
| Không lưu hạn giải toả | Không biết khoản nào sắp hết hạn | Lưu ngay lúc cấp phép, theo từng giao dịch |
| Thử lại mọi mã từ chối | Thẻ khách bị khoá, điểm rủi ro tăng | Chia hai nhóm: tạm thời (thử lại) và cứng (dừng) |
| Ghi nhận trước khi giao hàng | Khách khiếu nại → chargeback và thường thua | Ghi nhận **sau** khi giao hàng |
| Ghi nhận quá muộn | Khoản giữ hết hạn | Có quy trình cho khoản sắp hết hạn |
| Gọi hoàn tiền khi còn huỷ được | Mất phí, khách chờ 3–15 ngày thay vì vài giờ | Kiểm tra đã quyết toán chưa rồi mới chọn lệnh |
| Dùng ngày giao dịch cho báo cáo dòng tiền | "Sổ có lãi mà tài khoản không có tiền" | Tách ngày ghi nhận doanh thu và ngày tiền về |
| Quên khoản giữ lại (rolling reserve) | Thiếu hụt dòng tiền ngoài dự kiến | Đưa vào kế hoạch dòng tiền ngay từ đầu |
| Không theo dõi tỷ lệ chargeback | Bị đưa vào diện giám sát, có thể **mất quyền nhận thẻ** | Theo dõi hằng ngày, có ngưỡng cảnh báo sớm |
| Ghi nhận nhiều hơn số cấp phép | Bị từ chối, đơn hàng treo | Cần thu thêm → cấp phép mới cho phần chênh |

## Tóm tắt bài 3

- Thanh toán thẻ có **ba mốc riêng biệt**: cấp phép, ghi nhận, quyết toán — mỗi mốc có luật và thời hạn riêng.
- **Cấp phép không phải là đã có tiền.** Nó là lời hứa có thời hạn 7–30 ngày; không ghi nhận đúng hạn thì **tự giải toả**, mất tiền mà không có thông báo nào.
- Mã từ chối chia **hai nhóm**: tạm thời (thử lại tối đa 2–3 lần) và cứng (**thử lại là có hại** — có thể khiến thẻ khách bị khoá).
- Ba biến thể ghi nhận: **đủ**, **ít hơn**, **nhiều lần**. Không bao giờ ghi nhận nhiều hơn cấp phép.
- **Ghi nhận khi đã giao hàng** — sớm quá thì chargeback, muộn quá thì hết hạn.
- **Huỷ trước quyết toán, hoàn tiền sau quyết toán.** Luôn ưu tiên huỷ: rẻ hơn, nhanh hơn, không để lại dòng khó hiểu trên sao kê khách.
- Tiền về **T+2**, và một phần có thể bị **giữ lại 90–180 ngày**. Đừng dùng ngày giao dịch cho báo cáo dòng tiền.
- Ba chỉ số theo dõi hằng ngày: tỷ lệ cấp phép, khoản giữ chưa ghi nhận, và **tỷ lệ chargeback** — chỉ số cuối vượt ngưỡng có thể khiến **mất quyền nhận thẻ**.

**Bài kế tiếp** → [Bài 4: QR code và ví điện tử — mô hình thanh toán phổ biến nhất Việt Nam](04-qr-va-vi-dien-tu.md)

**Quay lại** → [Bài 2: Chuyển khoản liên ngân hàng](02-chuyen-khoan-lien-ngan-hang.md)
