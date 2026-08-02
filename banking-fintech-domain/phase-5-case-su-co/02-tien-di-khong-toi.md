# Case 2: Tiền đi không tới

## Triệu chứng

```text
   09:14  Khách chuyển 50.000.000 đ sang ngân hàng khác.
   09:14  Tài khoản khách BỊ TRỪ. Ứng dụng hiện "Đang xử lý".
   11:30  Người nhận vẫn chưa thấy tiền.
   14:00  Vẫn "Đang xử lý".

   HỆ THỐNG: trạng thái PENDING, không có lỗi nào trong log.
   TIỀN     : đã rời tài khoản người gửi, chưa tới tài khoản người nhận.
              ĐANG NẰM Ở ĐÂU?
```

Đây là sự cố gây hoảng loạn nhất, vì tiền đang **ở trạng thái không xác định** và khách nhìn thấy điều đó.

## Chẩn đoán

```text
   BƯỚC 1: XÁC ĐỊNH TIỀN ĐANG Ở ĐÂU TRÊN SỔ CỦA MÌNH

   Đây là câu hỏi đầu tiên, và nó trả lời được ngay lập tức
   NẾU bạn ghi sổ đúng.

      Nợ  "Tài khoản khách hàng"        50.000.000
      Có  "Tiền đang chuyển" (treo)     50.000.000
                ▲
      Nếu có bút toán này → tiền đang ở tài khoản treo, sổ vẫn cân,
      chỉ là chưa kết thúc.

   ⚠ NẾU KHÔNG CÓ BÚT TOÁN NÀY — nếu bạn chỉ trừ tài khoản khách
     mà không ghi có vào đâu — thì SỔ ĐANG MẤT CÂN ĐỐI,
     và đó là vấn đề nghiêm trọng hơn nhiều so với giao dịch treo.
```

```sql
-- BƯỚC 2: xem lịch sử trạng thái của lệnh
SELECT status, changed_at, external_ref, error_code, note
FROM transfer_status_history
WHERE transfer_id = 'TR-77120'
ORDER BY changed_at;
```

```text
   status              | changed_at | external_ref | error_code
   --------------------+------------+--------------+------------
   CREATED             | 09:14:02   | (null)       | (null)
   SENT                | 09:14:03   | NAPAS-9931   | (null)
   UNKNOWN             | 09:14:33   | NAPAS-9931   | TIMEOUT
                          ▲
   Đã GỬI ĐI (có mã tham chiếu bên ngoài) rồi mới timeout.
   → Lệnh CÓ THỂ đã tới nơi. Không được coi là thất bại.
```

```text
   BƯỚC 3: TRUY VẤN TRẠNG THÁI Ở ĐỐI TÁC theo mã tham chiếu
      Nếu đối tác có API truy vấn → gọi ngay, đây là cách nhanh nhất.

   BƯỚC 4: NẾU VẪN KHÔNG RÕ → GỬI YÊU CẦU TRA SOÁT CHÍNH THỨC
      Có thời hạn cam kết trả lời từ đối tác.
```

## Ba trạng thái thật sự có thể xảy ra

```text
   ① LỆNH CHƯA ĐI  → hoàn tiền cho người gửi, ghi bút toán đảo
   ② LỆNH ĐÃ TỚI   → cập nhật thành công, đóng tài khoản treo
   ③ LỆNH ĐI RỒI NHƯNG BỊ TỪ CHỐI Ở ĐẦU NHẬN
      (sai số tài khoản, tài khoản đóng, vượt hạn mức bên nhận)
      → tiền quay về, nhưng có thể mất vài ngày

   ⚠ TRẠNG THÁI ③ HAY BỊ QUÊN, VÀ NÓ LÀ NGUYÊN NHÂN
     CỦA "TIỀN VỀ SAU 3 NGÀY MÀ KHÔNG AI BÁO".
```

## Sai lầm phổ biến nhất — và tốn kém nhất

```text
   ❌ TỰ ĐỘNG HOÀN TIỀN CHO NGƯỜI GỬI KHI TIMEOUT

   Kịch bản: lệnh timeout → hệ thống hoàn tiền → nhưng lệnh vẫn tới nơi
   → NGƯỜI NHẬN CŨNG NHẬN ĐƯỢC TIỀN
   → CÔNG TY MẤT TRẮNG 50 TRIỆU

   ❌ CHO KHÁCH THỬ LẠI KHI LỆNH CŨ CHƯA KẾT LUẬN

   Khách sốt ruột, bấm chuyển lại → hai lệnh cùng đi
   → NGƯỜI NHẬN NHẬN HAI LẦN

   ✅ ĐÚNG: GIỮ NGUYÊN, KHOÁ THAO TÁC, TRA SOÁT
      · Tiền nằm ở tài khoản treo
      · Khoá không cho chuyển lại cùng nội dung tới cùng người nhận
      · Nói rõ với khách: "đang tra soát, kết quả trong X giờ"
```

## Xử lý ngay

```text
   ① VỚI GIAO DỊCH ĐANG TREO
      · Xác nhận tiền nằm ở tài khoản treo, sổ cân
      · Chạy truy vấn trạng thái theo lịch: 30s, 2m, 10m, 1h, 4h
      · Quá hạn tự động → chuyển sang hàng đợi tra soát thủ công

   ② VỚI KHÁCH
      · Nói rõ tiền đang được tra soát, KHÔNG mất
      · Cho mốc thời gian cụ thể
      · KHÔNG hứa hoàn tiền trước khi có kết luận

   ③ RÀ SOÁT TOÀN BỘ tìm giao dịch treo khác
```

```sql
SELECT transfer_id, amount_minor, created_at,
       now() - created_at AS treo_bao_lau
FROM transfers
WHERE status IN ('SENT','UNKNOWN')
  AND created_at < now() - interval '30 minutes'
ORDER BY created_at;
-- → mọi dòng ở đây là một khách đang lo lắng
```

## Chặn tái diễn

```text
   ① TÀI KHOẢN TREO PHẢI VỀ 0 CUỐI MỖI NGÀY

      Đây là chỉ số vận hành quan trọng nhất của luồng chuyển tiền.
      Số dư > 0 = còn lệnh chưa kết luận.
      → Cảnh báo tự động, có người chịu trách nhiệm xử lý mỗi ngày.

   ② TRẠNG THÁI "KHÔNG XÁC ĐỊNH" LÀ TRẠNG THÁI HỢP LỆ TRONG THIẾT KẾ
      Không được ép về thành công hay thất bại.

   ③ MÃ THAM CHIẾU SINH Ở PHÍA MÌNH, gửi kèm mọi lệnh
      Đây là thứ duy nhất tra soát được khi chưa có phản hồi.

   ④ KHOÁ CHỐNG CHUYỂN LẠI
      Khoá theo (tài khoản nguồn + tài khoản đích + số tiền)
      trong khi còn lệnh chưa kết luận.

   ⑤ ĐỐI SOÁT HAI CHIỀU VỚI SAO KÊ NGÂN HÀNG HẰNG NGÀY
      Sao kê có, sổ không có → tiền đi mà không ghi nhận
      Sổ có, sao kê không có → khách đang chờ mà không ai biết
```

## Bài học

```text
   ① TIMEOUT SAU KHI ĐÃ GỬI ĐI ≠ THẤT BẠI.
      Có mã tham chiếu bên ngoài nghĩa là lệnh đã rời khỏi bạn.

   ② TỰ ĐỘNG HOÀN TIỀN KHI TIMEOUT LÀ CÁCH MẤT TIỀN NHANH NHẤT.

   ③ SỔ PHẢI LUÔN CÂN, KỂ CẢ KHI GIAO DỊCH ĐANG TREO.
      Tài khoản treo tồn tại chính vì lý do này.

   ④ SỐ DƯ TÀI KHOẢN TREO CUỐI NGÀY LÀ CHỈ SỐ SỐNG CÒN.
      Nó phải bằng 0, và phải có người xem mỗi ngày.

   ⑤ NÓI THẬT VỚI KHÁCH LÀ CÁCH XỬ LÝ TỐT NHẤT.
      "Đang tra soát, tiền không mất, kết quả trong X giờ"
      tốt hơn nhiều so với "đang xử lý" vô thời hạn.
```

**Bài kế tiếp** → [Case 3: Số dư âm](03-so-du-am.md)

**Quay lại** → [Case 1: Trừ tiền hai lần](01-tru-tien-hai-lan.md)
