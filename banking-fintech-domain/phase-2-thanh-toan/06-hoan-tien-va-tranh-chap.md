# Bài 6: Hoàn tiền, tranh chấp và đối soát với cổng thanh toán

## Sự cố mở đầu

Khách mua áo 800.000 đồng, không vừa, yêu cầu trả hàng. Nhân viên chăm sóc khách hàng bấm "Hoàn tiền" trong hệ thống quản trị. Hệ thống báo thành công.

Ba ngày sau khách chưa nhận được tiền, gọi lên khiếu nại. Nhân viên khác nhận cuộc gọi, mở hệ thống, thấy đơn ở trạng thái "Đã hoàn tiền" nhưng khách nói chưa nhận. Nhân viên bấm hoàn tiền **lần nữa** cho chắc.

Ngày thứ tư, khách nhận được **1.600.000 đồng**.

Khách im lặng. Sàn phát hiện sau ba tuần, khi đối soát tháng. Liên hệ khách để xin lại — khách không nghe máy.

Cùng tháng đó có 47 trường hợp tương tự. Tổng thiệt hại: **hơn 200 triệu đồng**.

Nguyên nhân: nút "Hoàn tiền" **không có mã chống trùng**, và hệ thống **không phân biệt** giữa "đã gửi lệnh hoàn" với "tiền đã về tới khách".

## Ba trạng thái của một khoản hoàn tiền

```text
   ĐÃ GỬI LỆNH ──────► CỔNG CHẤP NHẬN ──────► TIỀN VỀ TỚI KHÁCH
   (bạn biết ngay)     (vài giây)              (3–15 NGÀY LÀM VIỆC)
        │                    │                          │
        │                    │                          │
        └── nhân viên thấy   └── hệ thống thấy          └── KHÁCH thấy
            "thành công"         "thành công"

   ⚠ BA MỐC NÀY CÁCH NHAU RẤT XA, VÀ ĐÂY LÀ NGUỒN GỐC SỰ CỐ ĐẦU BÀI.

   Hệ thống hiện "Đã hoàn tiền" ngay ở mốc 2.
   Khách chưa thấy gì cho tới mốc 3.
   → Nhân viên tưởng lệnh thất bại → bấm lại.
```

**Cách hiển thị đúng:**

| Trạng thái nội bộ | Hiện cho nhân viên | Hiện cho khách |
|---|---|---|
| Đã gửi lệnh | `Đang gửi yêu cầu hoàn tiền` | `Đang xử lý` |
| Cổng chấp nhận | `Đã gửi thành công — tiền về sau 3–15 ngày làm việc` | `Đang xử lý, dự kiến trước [ngày]` |
| Đối soát xác nhận | `Hoàn tất` | `Đã hoàn tiền` |

```text
   ⚠ TUYỆT ĐỐI KHÔNG DÙNG CHỮ "ĐÃ HOÀN TIỀN" Ở MỐC 2.

   Một chữ sai làm nhân viên hiểu sai, và nhân viên hiểu sai
   thì bấm lại. 200 triệu ở đầu bài đến từ đúng một chữ này.
```

## Chống hoàn tiền trùng — bốn lớp

```text
   ① MÃ CHỐNG TRÙNG THEO ĐƠN HÀNG, KHÔNG THEO LẦN BẤM
      Mã = "refund:" + mã đơn + ":" + số tiền
      → Bấm hai lần cùng một khoản → cổng trả kết quả cũ, không tạo lệnh mới.

   ② RÀNG BUỘC Ở TẦNG DỮ LIỆU
      Không dựa vào tầng ứng dụng, vì nó bị vòng qua được (xem SQL phase 5 bài 7).

      CREATE UNIQUE INDEX uq_refund_don_hang
          ON refunds (order_id, amount_minor)
          WHERE status <> 'FAILED';

      → Hai lệnh hoàn cùng đơn cùng số tiền → database TỪ CHỐI.

   ③ KIỂM TRA TỔNG ĐÃ HOÀN
      Tổng mọi khoản hoàn của một đơn KHÔNG được vượt số đã thu.

      SELECT sum(amount_minor) FROM refunds
      WHERE order_id = :id AND status <> 'FAILED';
      -- phải <= số tiền đã ghi nhận của đơn đó

   ④ KHOÁ NÚT SAU KHI BẤM
      Vô hiệu hoá nút và hiện trạng thái ngay, không đợi phản hồi.
      Đây là lớp yếu nhất nhưng chặn được phần lớn thao tác vội.
```

```text
   BỐN LỚP NÀY THEO THỨ TỰ TỪ MẠNH TỚI YẾU.
   Lớp ② là lớp KHÔNG THỂ VÒNG QUA — nếu chỉ làm được một lớp, làm lớp đó.
```

## Hoàn tiền một phần và những phép tính hay sai

```text
   ĐƠN HÀNG:
      Áo         500.000
      Quần       300.000
      Phí ship    30.000
      Giảm giá   −80.000  (mã giảm 10% toàn đơn)
      ───────────────────
      Khách trả  750.000

   KHÁCH TRẢ LẠI CÁI ÁO. HOÀN BAO NHIÊU?
```

| Cách tính | Số tiền | Đúng hay sai |
|---|---|---|
| Hoàn nguyên giá áo | 500.000 | ❌ Khách chưa từng trả 500.000 cho cái áo |
| Hoàn theo tỷ lệ giảm giá | 450.000 | ✅ Đúng — áo chiếm 62,5% giá trị hàng, giảm giá phân bổ tương ứng |
| Hoàn cả phí ship | 480.000 | ⚠ Tuỳ chính sách — chỉ đúng nếu **trả toàn bộ đơn** |

```text
   CÔNG THỨC PHÂN BỔ GIẢM GIÁ:

      giảm giá cho món i = tổng giảm giá × (giá món i / tổng giá hàng)

      Áo:   80.000 × (500.000 / 800.000) = 50.000
      Quần: 80.000 × (300.000 / 800.000) = 30.000
                                            ───────
                                            80.000  ✅ khớp

   ⚠ VÀ ĐÂY LÀ CHỖ PHẢI CẨN THẬN (xem lại phase 1 bài 7):

   Nếu chia 3 món với giảm giá 100.000 mà mỗi phần ra 33.333,33
   → làm tròn thành 33.333 mỗi món → tổng 99.999 → LỆCH 1 ĐỒNG.

   → PHẢI PHÂN BỔ PHẦN DƯ cho món cuối cùng, và KIỂM TRA TỔNG
     sau khi chia. Thà từ chối còn hơn làm lệch sổ.
```

```text
   VÀ MỘT NGUYÊN TẮC QUAN TRỌNG:

   LƯU SỐ TIỀN ĐÃ PHÂN BỔ CHO TỪNG DÒNG HÀNG NGAY LÚC TẠO ĐƠN,
   đừng tính lại lúc hoàn tiền.

   Vì lúc hoàn tiền có thể mã giảm giá đã hết hạn, giá đã đổi,
   chính sách đã khác — tính lại sẽ ra số khác.
```

## Tranh chấp — khác hoàn tiền ở chỗ nào

```text
   HOÀN TIỀN                          TRANH CHẤP (chargeback)
   ─────────────                      ────────────────────────
   BẠN chủ động trả lại               KHÁCH khiếu nại với NGÂN HÀNG
   Bạn kiểm soát thời điểm            Ngân hàng CƯỠNG CHẾ lấy tiền
   Mất phí giao dịch                  Mất tiền hàng + phí phạt
   Không ảnh hưởng hồ sơ              TÍNH VÀO TỶ LỆ CHARGEBACK
                                       → vượt ngưỡng thì MẤT QUYỀN NHẬN THẺ
```

```text
   ⚠ HỆ QUẢ VẬN HÀNH RẤT RÕ RÀNG:

   HOÀN TIỀN CHO KHÁCH LUÔN RẺ HƠN ĐỂ HỌ ĐI KHIẾU NẠI.

   Một tranh chấp 800.000 đ có thể tốn:
      · 800.000 tiền hàng (nếu thua)
      · 300.000–500.000 phí xử lý tranh chấp
      · công sức chuẩn bị hồ sơ
      · một điểm vào tỷ lệ chargeback

   → Nhiều sàn có chính sách: dưới một ngưỡng nhất định thì
     hoàn tiền ngay không hỏi. Đó không phải hào phóng — đó là tính toán.
```

## Quy trình xử lý tranh chấp

```text
   ① NGÂN HÀNG BÁO CÓ TRANH CHẤP
      Kèm mã lý do — mã này quyết định bạn cần bằng chứng gì.

   ② TIỀN BỊ TẠM GIỮ NGAY
      Không đợi bạn phản hồi. Tiền rời khỏi tài khoản bạn trước.

   ③ BẠN CÓ HẠN NỘP BẰNG CHỨNG (thường 7–20 ngày)
      Quá hạn = tự động thua, không có ngoại lệ.

   ④ TỔ CHỨC THẺ PHÂN XỬ

   ⑤ THẮNG → tiền trả lại (nhưng phí xử lý thường không hoàn)
      THUA → mất luôn, và có thể bị khách khiếu nại tiếp lần hai
```

**Bằng chứng cần chuẩn bị, theo nhóm lý do:**

| Nhóm lý do | Bằng chứng cần có |
|---|---|
| "Tôi không thực hiện giao dịch này" | Nhật ký đăng nhập, địa chỉ IP, thiết bị, kết quả 3-D Secure |
| "Hàng không như mô tả" | Ảnh sản phẩm lúc bán, mô tả, tin nhắn trao đổi với khách |
| "Không nhận được hàng" | **Biên bản giao hàng có chữ ký**, mã vận đơn, ảnh giao hàng |
| "Đã huỷ mà vẫn bị trừ" | Nhật ký thao tác của khách, chính sách huỷ đã công bố |

```text
   ⚠ BA THỨ PHẢI LƯU TỪ ĐẦU, KHÔNG THỂ TẠO RA SAU:

   ① Nhật ký thao tác của khách (bấm gì, lúc nào, từ IP nào)
   ② Bản chụp mô tả sản phẩm TẠI THỜI ĐIỂM BÁN
      (mô tả đổi sau đó → bằng chứng vô giá trị)
   ③ Bằng chứng giao hàng có xác nhận của người nhận

   Không có ba thứ này thì gần như mọi tranh chấp đều thua.
```

## Đối soát với cổng thanh toán — nguồn sự thật cuối cùng

Webhook có thể mất. Trạng thái trong hệ thống bạn có thể sai. File đối soát cuối ngày là thứ duy nhất chốt lại.

```text
   QUY TRÌNH ĐỐI SOÁT HẰNG NGÀY:

   ① TẢI FILE ĐỐI SOÁT của ngày hôm trước
   ② GHÉP theo mã giao dịch của cổng
   ③ PHÂN LOẠI KẾT QUẢ thành bốn nhóm
   ④ XỬ LÝ từng nhóm theo quy tắc riêng
```

| Nhóm | Nghĩa là gì | Xử lý |
|---|---|---|
| **Khớp hoàn toàn** | Hai bên cùng có, cùng số tiền, cùng trạng thái | Đánh dấu đã đối soát |
| **Cổng có, bạn không có** | **Nguy hiểm nhất** — khách đã trả mà bạn không ghi nhận | Điều tra ngay: webhook mất? đơn bị xoá? → ghi nhận bổ sung |
| **Bạn có, cổng không có** | Bạn ghi nhận nhầm, hoặc giao dịch chưa quyết toán | Kiểm tra ngày; nếu quá 2 ngày mà vẫn không có → huỷ ghi nhận |
| **Khớp mã, lệch số tiền** | Ghi nhận một phần, phí, hoặc lỗi | Đối chiếu chi tiết, ghi bút toán chênh lệch |

```text
   ⚠ NHÓM "CỔNG CÓ, BẠN KHÔNG CÓ" PHẢI XỬ LÝ TRONG NGÀY.

   Nó có nghĩa là: KHÁCH ĐÃ TRẢ TIỀN NHƯNG KHÔNG NHẬN ĐƯỢC HÀNG.

   Để lâu thì khách khiếu nại → thành tranh chấp → bạn thua chắc
   (vì đúng là họ trả tiền mà không nhận được gì).

   → Đây là nhóm ưu tiên số một của quy trình đối soát.
```

## Ba con số phải khớp mỗi ngày

```text
   ① TỔNG THU
      Σ giao dịch thành công trong sổ bạn  =  Σ trong file cổng

   ② TỔNG HOÀN
      Σ khoản hoàn trong sổ bạn  =  Σ khoản hoàn trong file cổng

   ③ TIỀN VỀ TÀI KHOẢN
      Số dư tăng thật  =  tổng thu − tổng hoàn − tổng phí − phần giữ lại

   ⚠ CON SỐ ③ LÀ CON SỐ CUỐI CÙNG VÀ QUAN TRỌNG NHẤT.
     Hai con số đầu khớp mà số ba lệch nghĩa là bạn hiểu sai
     cấu trúc phí hoặc chính sách giữ lại của đối tác.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Hiện "Đã hoàn tiền" ngay khi gửi lệnh | Nhân viên tưởng lỗi → bấm lại → **hoàn hai lần** | Ba trạng thái riêng, dùng đúng từ ngữ |
| Không có mã chống trùng cho hoàn tiền | Hoàn trùng, và khách thường không báo lại | Mã theo **đơn hàng + số tiền** |
| Chỉ chặn trùng ở tầng ứng dụng | Bị vòng qua bởi công cụ quản trị, script | **Unique index** ở database |
| Không kiểm tổng đã hoàn | Hoàn nhiều hơn số đã thu | Ràng buộc tổng hoàn ≤ tổng thu |
| Hoàn nguyên giá món hàng | Hoàn nhiều hơn số khách thật sự trả | Phân bổ giảm giá theo tỷ lệ |
| Tính lại phân bổ lúc hoàn tiền | Giá và khuyến mãi đã đổi → ra số khác | **Lưu số đã phân bổ ngay lúc tạo đơn** |
| Không xử lý phần dư khi chia | Lệch một đồng, sổ không cân | Dồn phần dư vào món cuối, kiểm tổng |
| Để khách đi khiếu nại thay vì hoàn | Mất tiền hàng + phí phạt + điểm chargeback | Hoàn ngay dưới một ngưỡng |
| Không lưu bằng chứng từ đầu | **Thua gần như mọi tranh chấp** | Nhật ký thao tác, bản chụp mô tả, biên bản giao hàng |
| Bỏ lỡ hạn nộp bằng chứng | Tự động thua, không kháng nghị được | Cảnh báo tự động khi còn 3 ngày |
| Chỉ dựa vào webhook, không đối soát file | Giao dịch mất mà không ai biết | File đối soát là **nguồn sự thật cuối cùng** |
| Để nhóm "cổng có, bạn không có" qua ngày | Khách trả tiền không nhận hàng → tranh chấp thua chắc | Xử lý **trong ngày**, ưu tiên số một |

## Tóm tắt bài 6

- Hoàn tiền có **ba mốc**: gửi lệnh, cổng chấp nhận, tiền về tới khách (3–15 ngày). Hiện "Đã hoàn tiền" ở mốc hai là nguyên nhân hoàn trùng.
- Chống trùng **bốn lớp**, trong đó **unique index ở database là lớp duy nhất không thể vòng qua**.
- Hoàn tiền một phần phải **phân bổ giảm giá theo tỷ lệ**, và phải **lưu số đã phân bổ ngay lúc tạo đơn** thay vì tính lại.
- Chia tiền phải **dồn phần dư và kiểm tra tổng** — nếu không thì lệch từng đồng, ngày nào cũng lệch.
- **Tranh chấp đắt hơn hoàn tiền rất nhiều**: mất tiền hàng, mất phí phạt, và tính vào tỷ lệ chargeback có thể dẫn tới mất quyền nhận thẻ. Hoàn ngay dưới một ngưỡng là tính toán, không phải hào phóng.
- Ba bằng chứng **phải lưu từ đầu, không tạo được sau**: nhật ký thao tác của khách, bản chụp mô tả sản phẩm tại thời điểm bán, biên bản giao hàng có xác nhận.
- **Quá hạn nộp bằng chứng là tự động thua** — cần cảnh báo tự động.
- **File đối soát cuối ngày là nguồn sự thật cuối cùng**, không phải webhook.
- Nhóm **"cổng có, bạn không có" phải xử lý trong ngày** — nó nghĩa là khách đã trả tiền mà không nhận được hàng.
- Ba con số khớp mỗi ngày: tổng thu, tổng hoàn, và **tiền thật về tài khoản** — con số cuối lệch nghĩa là bạn hiểu sai cấu trúc phí.

**Hết phase 2.** Phase 3 (tín dụng và cho vay), phase 4 (rủi ro và tuân thủ), phase 5 (case sự cố) và phase 6 (thiết kế hệ thống) đang được viết.

**Quay lại** → [Bài 5: Cổng thanh toán](05-cong-thanh-toan.md) · **Mục lục** → [README](../README.md) · **Tra thuật ngữ** → [Từ điển](../00-thuat-ngu.md)
