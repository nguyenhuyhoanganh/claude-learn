# Case 7: Webhook mất — đơn hàng không được ghi nhận

## Triệu chứng

```text
   Đối soát cuối ngày phát hiện 312 giao dịch thuộc nhóm
   "cổng có, mình không có" (case 5).

   Kiểm tra ra: cả 312 đơn đều đã bị TỰ ĐỘNG HUỶ sau 15 phút
   vì "khách không thanh toán".

   Thực tế: khách ĐÃ thanh toán. Hàng đã được giải phóng cho người khác.
   Công ty đang giữ tiền của 312 khách mà không có hàng để giao.
```

## Chẩn đoán

```sql
-- BƯỚC 1: webhook có tới không?
SELECT received_at, psp_txn_id, http_status, processing_status, error_message
FROM webhook_events
WHERE psp_txn_id IN (SELECT psp_txn_id FROM missing_transactions)
ORDER BY received_at;
```

```text
   BA KẾT QUẢ CÓ THỂ, MỖI CÁI MỘT NGUYÊN NHÂN KHÁC HẲN:

   ① KHÔNG CÓ DÒNG NÀO        → webhook chưa bao giờ tới
   ② CÓ, http_status = 500     → tới nhưng bạn xử lý lỗi
   ③ CÓ, status = SUCCESS      → xử lý xong nhưng không cập nhật đơn
```

```text
   ⚠ NẾU BẢNG webhook_events KHÔNG TỒN TẠI thì bạn đang mù hoàn toàn.

   Rất nhiều hệ thống xử lý webhook trực tiếp trong controller
   mà không lưu lại request thô.
   → Khi có sự cố, không phân biệt được ① với ② với ③.

   → LƯU MỌI WEBHOOK NHẬN ĐƯỢC, DẠNG THÔ, TRƯỚC KHI XỬ LÝ.
     Đây là việc phải làm trước tiên, kể cả khi chưa có gì khác.
```

```bash
# BƯỚC 2: nếu webhook chưa tới — kiểm tra phía mạng
# Xem log của load balancer / gateway trong khoảng thời gian đó
#   · có request nào từ dải IP của cổng không?
#   · có bị chặn bởi tường lửa / WAF không?
#   · có trả 4xx/5xx ở tầng gateway không (chưa vào tới ứng dụng)?
```

## Bảy nguyên nhân webhook không tới hoặc không hiệu lực

```text
   ① MẠNG / TƯỜNG LỬA CHẶN
      WAF coi request từ cổng là đáng ngờ và chặn.
      → Ứng dụng không thấy gì, log ứng dụng sạch.

   ② ỨNG DỤNG ĐANG DEPLOY
      Trong 30 giây chuyển đổi, request bị từ chối.

   ③ XỬ LÝ QUÁ LÂU → CỔNG TIMEOUT
      Bạn xử lý 8 giây, cổng chờ 5 giây rồi bỏ.
      → Cổng coi là thất bại, có thể gửi lại, có thể không.

   ④ TRẢ VỀ MÃ LỖI DO LỖI NGHIỆP VỤ
      Đơn không tìm thấy → trả 404 → cổng coi là bạn không nhận.

   ⑤ XÁC THỰC CHỮ KÝ SAI
      Đổi khoá bí mật mà chưa cập nhật, hoặc tính chữ ký sai
      khi nội dung có ký tự đặc biệt.

   ⑥ CỔNG GỬI TỚI ĐỊA CHỈ CŨ
      Đổi tên miền, đổi đường dẫn mà chưa báo cổng.

   ⑦ CỔNG THẬT SỰ KHÔNG GỬI
      Hiếm, nhưng có. Nhất là với trạng thái ít gặp.
```

```text
   ⚠ NGUYÊN NHÂN ③ VÀ ④ LÀ LỖI PHÍA BẠN VÀ PHỔ BIẾN NHẤT.

   ③ xảy ra khi bạn xử lý nghiệp vụ nặng ngay trong request webhook.
   ④ xảy ra khi webhook tới TRƯỚC khi đơn hàng được ghi vào database
     (race condition giữa luồng tạo đơn và luồng nhận webhook).
```

## Cách xử lý webhook đúng — bốn bước

```text
   ┌──────────────────────────────────────────────────────────┐
   │ ① NHẬN — xác thực chữ ký, LƯU THÔ, TRẢ 200 NGAY          │
   │    Mục tiêu: dưới 200ms. Không làm gì nặng ở đây.        │
   ├──────────────────────────────────────────────────────────┤
   │ ② XẾP HÀNG — đẩy vào hàng đợi để xử lý bất đồng bộ       │
   ├──────────────────────────────────────────────────────────┤
   │ ③ XỬ LÝ — có thể chậm, có thể thử lại, có thể lỗi        │
   │    Lỗi ở đây KHÔNG ảnh hưởng tới việc cổng coi là đã gửi │
   ├──────────────────────────────────────────────────────────┤
   │ ④ ĐỐI CHIẾU — job định kỳ tìm webhook chưa xử lý xong    │
   └──────────────────────────────────────────────────────────┘
```

```java
@PostMapping("/webhooks/psp")
public ResponseEntity<Void> nhan(@RequestBody byte[] raw,
                                 @RequestHeader("X-Signature") String sig) {
    // ① xác thực — so sánh thời gian cố định
    if (!chuKyHopLe(raw, sig)) {
        return ResponseEntity.status(401).build();
    }

    // ② lưu thô, chống trùng bằng khoá duy nhất trên psp_event_id
    webhookDao.luuNeuChuaCo(raw);       // ON CONFLICT DO NOTHING

    // ③ trả 200 NGAY — chưa xử lý gì cả
    return ResponseEntity.ok().build();
}
```

```text
   ⚠ TRẢ 200 CHO CẢ TRƯỜNG HỢP "ĐƠN KHÔNG TÌM THẤY".

   Trả 404 làm cổng nghĩ bạn không nhận được, và tuỳ cổng
   mà họ gửi lại hoặc bỏ luôn.
   → Nhận, lưu lại, rồi xử lý sau. Đơn chưa tồn tại thì
     job đối chiếu sẽ ghép lại khi đơn xuất hiện.
```

## Nguyên tắc quan trọng nhất: webhook không phải nguồn sự thật

```text
   WEBHOOK LÀ THÔNG BÁO TIỆN LỢI, KHÔNG PHẢI CƠ CHẾ ĐÁNG TIN CẬY.

   Nó có thể mất, tới muộn, tới trùng, tới sai thứ tự.

   → PHẢI CÓ HAI CƠ CHẾ BỔ SUNG:

   ① TRUY VẤN CHỦ ĐỘNG (polling)
      Với đơn đang chờ thanh toán, tự hỏi cổng trạng thái
      theo lịch: 30s, 2m, 5m, 15m.
      → Chặn được nguyên nhân ①②⑥⑦.

   ② ĐỐI SOÁT FILE CUỐI NGÀY
      Nguồn sự thật cuối cùng. Bắt được mọi thứ hai cơ chế trên bỏ sót.
```

```text
   ⚠ VỚI ĐƠN HÀNG CÓ THỜI HẠN (giữ chỗ, giữ hàng),
     TRUY VẤN CHỦ ĐỘNG LÀ BẮT BUỘC, KHÔNG PHẢI TUỲ CHỌN.

   Vì nếu chỉ dựa vào webhook mà webhook mất, đơn sẽ bị huỷ
   trong khi khách đã trả tiền — đúng sự cố ở đầu bài.
```

## Cái bẫy thời gian tự huỷ đơn

```text
   ĐƠN TỰ HUỶ SAU 15 PHÚT NẾU CHƯA THANH TOÁN.

   NHƯNG:
      · Webhook có thể tới muộn vài phút
      · Cổng có thể gửi lại sau 1, 5, 15, 30 phút
      · Khách thanh toán ở phút thứ 14, webhook tới phút thứ 16

   → 15 PHÚT LÀ QUÁ NGẮN NẾU CHỈ DỰA VÀO WEBHOOK.

   BA CÁCH SỬA:
      ① Trước khi huỷ, TRUY VẤN CỔNG một lần cuối
         → đây là cách rẻ nhất và hiệu quả nhất
      ② Kéo dài thời gian giữ, chấp nhận giữ hàng lâu hơn
      ③ Huỷ đơn nhưng KHÔNG giải phóng hàng ngay,
         đợi thêm một khoảng an toàn
```

```java
// Trước khi huỷ đơn, hỏi cổng lần cuối — bắt buộc
public void huyDonQuaHan(Long donId) {
    var trangThai = pspClient.truyVanTrangThai(donId);
    if (trangThai.daThanhToan()) {
        ghiNhanThanhToan(donId, trangThai);       // cứu được đơn
        return;
    }
    donService.huy(donId, "Quá hạn thanh toán");
}
```

## Xử lý ngay với 312 đơn

```text
   ① DỪNG JOB TỰ HUỶ ĐƠN cho tới khi thêm bước truy vấn cổng

   ② PHÂN LOẠI 312 ĐƠN
      · Hàng còn → khôi phục đơn, giao hàng, xin lỗi khách
      · Hàng hết → hoàn tiền chủ động + bồi thường theo chính sách

   ③ LIÊN HỆ TỪNG KHÁCH — CHỦ ĐỘNG
      Đây là 312 người đã trả tiền và không nhận được gì.
      Nhiều người chưa nhận ra. Chờ họ phát hiện sẽ tệ hơn nhiều.

   ④ TÌM NGUYÊN NHÂN GỐC trước khi bật lại job
      Nếu là do WAF chặn thì mở đơn hàng lại rồi vẫn mất tiếp.
```

## Chặn tái diễn

```text
   ① LƯU MỌI WEBHOOK DẠNG THÔ — việc phải làm đầu tiên
   ② TRẢ 200 NGAY, XỬ LÝ BẤT ĐỒNG BỘ
   ③ CHỐNG TRÙNG bằng khoá duy nhất trên mã sự kiện của cổng
   ④ TRUY VẤN CHỦ ĐỘNG cho mọi đơn đang chờ có thời hạn
   ⑤ TRUY VẤN LẦN CUỐI TRƯỚC KHI HUỶ ĐƠN
   ⑥ ĐỐI SOÁT FILE HẰNG NGÀY — nguồn sự thật cuối cùng
   ⑦ CHO PHÉP ĐƯỜNG DẪN WEBHOOK QUA WAF, kiểm tra sau mỗi lần
      đổi cấu hình bảo mật
   ⑧ CẢNH BÁO KHI KHÔNG NHẬN WEBHOOK
      → Đây là cảnh báo hay bị quên nhất
```

```sql
-- Cảnh báo: bình thường nhận ~500 webhook/giờ, giờ này chỉ có 3
SELECT date_trunc('hour', received_at) AS gio, count(*)
FROM webhook_events
WHERE received_at > now() - interval '6 hours'
GROUP BY 1 ORDER BY 1;
-- → Sụt đột ngột nghĩa là đường webhook đã đứt,
--   và bạn biết trong một giờ thay vì cuối ngày.
```

```sql
-- Job đối chiếu: webhook đã nhận nhưng chưa xử lý xong
SELECT psp_txn_id, received_at, processing_status
FROM webhook_events
WHERE processing_status <> 'DONE'
  AND received_at < now() - interval '10 minutes';
```

## Bài học

```text
   ① WEBHOOK KHÔNG PHẢI NGUỒN SỰ THẬT.
      Nó có thể mất, muộn, trùng, sai thứ tự.
      Luôn cần truy vấn chủ động + đối soát file.

   ② LƯU THÔ TRƯỚC, XỬ LÝ SAU.
      Không lưu thô thì khi có sự cố bạn mù hoàn toàn.

   ③ TRẢ 200 NGAY, KỂ CẢ KHI CHƯA XỬ LÝ ĐƯỢC.
      Trả 404 vì "không tìm thấy đơn" làm cổng bỏ luôn thông báo.

   ④ ĐƠN CÓ THỜI HẠN PHẢI TRUY VẤN CỔNG TRƯỚC KHI HUỶ.
      Một lời gọi API rẻ hơn nhiều so với 312 khách mất tiền.

   ⑤ CẢNH BÁO KHI KHÔNG NHẬN ĐƯỢC WEBHOOK, không chỉ khi lỗi.
      "Không có gì xảy ra" là dấu hiệu khó nhận ra nhất
      và cũng là dấu hiệu quan trọng nhất.

   ⑥ ĐỔI CẤU HÌNH BẢO MẬT PHẢI KIỂM TRA LẠI ĐƯỜNG WEBHOOK.
      WAF chặn là nguyên nhân im lặng nhất — log ứng dụng hoàn toàn sạch.
```

**Bài kế tiếp** → [Case 8: Deploy giữa chừng làm hỏng giao dịch](08-deploy-giua-chung.md)

**Quay lại** → [Case 6: Job chạy hai lần](06-job-chay-hai-lan.md)
