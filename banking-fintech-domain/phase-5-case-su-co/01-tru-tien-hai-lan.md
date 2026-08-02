# Case 1: Trừ tiền hai lần

## Triệu chứng

```text
   14:32  Khách quẹt thẻ mua hàng 2.000.000 đ. Máy báo thành công.
   14:32  Khách nhận HAI tin nhắn trừ tiền, cách nhau 4 giây.
   15:10  Khách gọi tổng đài.

   HỆ THỐNG CỦA BẠN: chỉ có MỘT đơn hàng, MỘT bản ghi thanh toán.
   SAO KÊ CỦA KHÁCH  : HAI dòng trừ tiền.
```

Đây là sự cố được báo nhiều nhất trong mọi hệ thống thanh toán, và cũng là sự cố dễ chẩn đoán sai nhất — vì **hệ thống của bạn trông hoàn toàn sạch**.

## Chẩn đoán — theo đúng thứ tự này

```text
   BƯỚC 1: KHÔNG NHÌN VÀO HỆ THỐNG CỦA MÌNH TRƯỚC.

   Hệ thống bạn chỉ ghi nhận kết quả cuối. Nó không thấy các lần
   gửi lại ở giữa. Nhìn vào đó sẽ kết luận sai là "không có gì bất thường".
```

```sql
-- BƯỚC 2: lấy MỌI lần thử của đơn hàng, kể cả thất bại
SELECT id, psp_transaction_id, auth_code, amount_minor,
       status, created_at, error_code
FROM payment_attempts
WHERE order_id = 'DH-1024'
ORDER BY created_at;
```

```text
   id | psp_transaction_id | auth_code | status    | created_at | error_code
   ---+--------------------+-----------+-----------+------------+-----------
    1 | PSP-aaa            | (null)    | TIMEOUT   | 14:32:11   | TIMEOUT
    2 | PSP-bbb            | 483920    | SUCCESS   | 14:32:15   | (null)
                                          ▲
   LẦN 1 TIMEOUT — KHÔNG BIẾT thành hay bại. Hệ thống coi là thất bại
   và cho thử lại. Nhưng lần 1 THỰC RA ĐÃ THÀNH CÔNG ở phía ngân hàng.
```

```text
   BƯỚC 3: HỎI PSP — bên duy nhất giữ nhật ký đầy đủ
      "Đơn DH-1024 có mấy giao dịch, mã cấp phép của từng cái là gì?"

   BƯỚC 4: XÁC ĐỊNH BẢN CHẤT bằng MÃ CẤP PHÉP, không bằng số tiền
      HAI mã cấp phép khác nhau  → ngân hàng ĐÃ giữ tiền hai lần (tiền thật)
      MỘT mã, hai bản ghi         → lỗi ghi sổ phía bạn (tiền không mất)

   ⚠ ĐỪNG ĐỐI CHIẾU BẰNG SỐ TIỀN VÀ THỜI GIAN.
     Hai giao dịch cùng số tiền cách nhau 4 giây trông y hệt nhau.
```

## Bốn nguyên nhân gốc, theo thứ tự phổ biến

```text
   ① TIMEOUT ĐƯỢC COI LÀ THẤT BẠI          ← phổ biến nhất
      Không nhận được phản hồi ≠ giao dịch thất bại.

   ② KHÔNG GỬI MÃ CHỐNG TRÙNG
      PSP không có cách nào biết hai lệnh là cùng một ý định.

   ③ PSP TỰ GỬI LẠI MÀ BẠN KHÔNG BIẾT
      Nhiều PSP tự thử lại khi không nhận được phản hồi từ bạn.
      → Phải hỏi rõ cơ chế này trước khi tích hợp.

   ④ NGƯỜI DÙNG BẤM HAI LẦN
      Nút không bị khoá, hoặc khoá ở giao diện nhưng API không chặn.
```

## Xử lý ngay

```text
   VỚI KHÁCH ĐÃ BỊ TRỪ HAI LẦN:

   ① XÁC ĐỊNH giao dịch thừa qua mã cấp phép
   ② CHƯA QUYẾT TOÁN → HUỶ (void)
      · tiền giải toả trong vài giờ
      · thường không mất phí
      · không để lại dòng khó hiểu trên sao kê khách
   ③ ĐÃ QUYẾT TOÁN  → HOÀN TIỀN (refund)
      · khách chờ 3–15 ngày làm việc
      · nói rõ mốc thời gian này cho khách ngay từ đầu

   ⚠ TUYỆT ĐỐI KHÔNG HOÀN TIỀN KHI CHƯA XÁC ĐỊNH ĐƯỢC BẢN CHẤT.
     Nếu chỉ là lỗi ghi sổ (một mã cấp phép, hai bản ghi) mà bạn hoàn tiền
     thì bạn vừa cho không khách hàng một khoản.
```

```sql
-- Rà soát toàn bộ để tìm các trường hợp khác cùng nguyên nhân
SELECT order_id, count(*) AS so_lan_thanh_cong,
       array_agg(auth_code) AS cac_ma_cap_phep
FROM payment_attempts
WHERE status = 'SUCCESS' AND created_at > now() - interval '30 days'
GROUP BY order_id
HAVING count(*) > 1;
-- → mỗi dòng là một khách có thể đang bị trừ hai lần mà chưa báo
```

## Chặn tái diễn — bốn lớp

```text
   ① MÃ CHỐNG TRÙNG CHO MỌI LỆNH TẠO GIAO DỊCH

      Mã = hàm băm của (mã đơn + số tiền + mã người dùng)
      Sinh MỘT LẦN ở phía bạn, gửi lại y nguyên khi thử lại.

      ⚠ Sinh mã mới cho mỗi lần thử = mã chống trùng vô tác dụng.
        Đây là lỗi triển khai phổ biến nhất.

   ② TIMEOUT → TRUY VẤN TRẠNG THÁI, KHÔNG THỬ LẠI MÙ

      catch (TimeoutException e) {
          // ❌ retry(request);
          // ✅ scheduleStatusInquiry(orderId, delays = [30s, 2m, 10m, 1h]);
      }

   ③ KHOÁ Ở TẦNG DỮ LIỆU, không chỉ ở giao diện

      CREATE UNIQUE INDEX uq_payment_success
          ON payment_attempts (order_id)
          WHERE status = 'SUCCESS';
      → Hai giao dịch thành công cho cùng một đơn: database TỪ CHỐI.

   ④ ĐỐI SOÁT HẰNG NGÀY tìm đơn có nhiều mã cấp phép
      → Bắt được trường hợp khách không báo.
```

## Bài học

```text
   ① "TIMEOUT" LÀ MỘT TRẠNG THÁI RIÊNG, KHÔNG PHẢI "THẤT BẠI".
      Hệ thống nào chỉ có thành công/thất bại đều sẽ gặp sự cố này.

   ② HỆ THỐNG CỦA BẠN SẠCH KHÔNG CHỨNG MINH ĐƯỢC GÌ.
      Phải hỏi bên giữ nhật ký đầy đủ — thường là PSP.

   ③ LƯU MỌI LẦN THỬ, KỂ CẢ THẤT BẠI.
      Chỉ lưu lần thành công là mất khả năng điều tra.

   ④ ĐỐI CHIẾU BẰNG MÃ CẤP PHÉP, KHÔNG BẰNG SỐ TIỀN VÀ THỜI GIAN.

   ⑤ PHẦN LỚN KHÁCH BỊ TRỪ HAI LẦN KHÔNG BÁO.
      Nên số ca bạn biết luôn nhỏ hơn số ca thật.
      → Phải chủ động rà soát, không đợi khách gọi.
```

**Bài kế tiếp** → [Case 2: Tiền đi không tới](02-tien-di-khong-toi.md)

**Quay lại** → [Phase 4, Bài 6: Dấu vết kiểm toán](../phase-4-rui-ro-tuan-thu/06-audit-trail-va-thanh-tra.md)
