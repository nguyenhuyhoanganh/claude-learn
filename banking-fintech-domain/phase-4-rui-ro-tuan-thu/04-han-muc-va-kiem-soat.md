# Bài 4: Hạn mức và kiểm soát rủi ro vận hành

## Sự cố mở đầu

Một nhân viên vận hành được giao quyền hoàn tiền cho khách khiếu nại. Quyền này không có hạn mức, vì "hoàn tiền thì cũng chỉ hoàn đúng số khách đã trả thôi".

Trong tám tháng, người này thực hiện **1.847 lệnh hoàn tiền** về 6 tài khoản ngân hàng do người thân đứng tên. Mỗi lệnh từ 200 nghìn tới 3 triệu đồng, gắn với các đơn hàng có thật của khách hàng thật — nhưng khách chưa từng khiếu nại.

Tổng: **2,7 tỷ đồng**.

Phát hiện tình cờ, khi một khách gọi lên hỏi vì sao đơn hàng của mình bị đánh dấu "đã hoàn tiền" trong khi họ vẫn đang dùng sản phẩm bình thường.

Ba lớp kiểm soát lẽ ra phải chặn việc này, và cả ba đều không có:

- Không có **hạn mức** cho thao tác hoàn tiền
- Không có **người phê duyệt thứ hai**
- Không có **cảnh báo** khi nhiều khoản hoàn về cùng một tài khoản nhận

Bài này về lớp phòng thủ chống rủi ro đến **từ bên trong**.

## Ba loại hạn mức, ba mục đích khác nhau

```text
   ① HẠN MỨC KHÁCH HÀNG
      Mục đích: tuân thủ quy định, chống rửa tiền, bảo vệ khách
      Ví dụ: ví mức KYC cơ bản chỉ được giao dịch tối đa X/ngày

   ② HẠN MỨC NGHIỆP VỤ
      Mục đích: giới hạn thiệt hại khi có lỗi hệ thống
      Ví dụ: tổng chi tiền ra toàn hệ thống không vượt Y/giờ

   ③ HẠN MỨC NGƯỜI DÙNG NỘI BỘ   ← lớp bị bỏ quên ở đầu bài
      Mục đích: chống rủi ro từ bên trong và chống lỗi thao tác
      Ví dụ: nhân viên hỗ trợ hoàn tối đa Z/ngày, trên Z cần cấp trên duyệt

   ⚠ BA LOẠI NÀY ĐỘC LẬP VỚI NHAU VÀ PHẢI CÓ ĐỦ CẢ BA.
     Có ① mà thiếu ③ chính là sự cố ở đầu bài.
```

## Hạn mức nghiệp vụ — cầu dao của cả hệ thống

```text
   VÌ SAO CẦN HẠN MỨC Ở CẤP HỆ THỐNG:

   Một lỗi trong code tính hoa hồng, một job chạy hai lần,
   một API bị gọi lặp — đều có thể chi ra hàng tỷ đồng
   trong vài phút mà mọi hạn mức cá nhân đều hợp lệ.

   ┌──────────────────────────────────────────────────────────┐
   │  TỔNG CHI RA TOÀN HỆ THỐNG                                │
   │     · mỗi giờ    : không vượt X                           │
   │     · mỗi ngày   : không vượt Y                           │
   │     · số lệnh/phút: không vượt N                          │
   │                                                            │
   │  VƯỢT → DỪNG TOÀN BỘ CHI TIỀN, BÁO ĐỘNG NGAY             │
   │         (không tự động nới, phải có người quyết định)     │
   └──────────────────────────────────────────────────────────┘

   ⚠ NGƯỠNG PHẢI ĐẶT DỰA TRÊN SỐ LIỆU LỊCH SỬ, KHÔNG ĐẶT BỪA.
     Ví dụ: cao nhất từng ghi nhận × 1,5.
     Đặt quá cao thì vô dụng, quá thấp thì chặn nhầm ngày cao điểm.

   → VÀ PHẢI CÓ QUY TRÌNH NỚI KHẨN CẤP có kiểm soát,
     vì ngày khuyến mãi lớn sẽ vượt ngưỡng hợp lệ.
```

## Nguyên tắc bốn mắt — và khi nào áp dụng

```text
   NGUYÊN TẮC: THAO TÁC RỦI RO CAO CẦN HAI NGƯỜI KHÁC NHAU
                — MỘT NGƯỜI THỰC HIỆN, MỘT NGƯỜI PHÊ DUYỆT.

   ÁP DỤNG CHO:
      · Hoàn tiền vượt hạn mức
      · Điều chỉnh số dư thủ công        ← rủi ro cao nhất
      · Thay đổi thông tin tài khoản nhận tiền của khách
      · Miễn giảm phí, lãi
      · Thay đổi hạn mức
      · Xoá nợ
      · Thay đổi cấu hình quy tắc rủi ro

   ⚠ VÀ HỆ THỐNG PHẢI CƯỠNG CHẾ:
      · Người phê duyệt KHÁC người thực hiện — kiểm ở tầng dữ liệu
      · Người phê duyệt phải có quyền cao hơn
      · Không được tự phê duyệt cho chính mình dù có đủ quyền
      · Ghi lại cả hai danh tính và thời điểm
```

```text
   ⚠ CÁCH VÒNG QUA PHỔ BIẾN NHẤT — VÀ CÁCH CHẶN:

   Hai nhân viên thông đồng, phê duyệt chéo cho nhau.

   → Chặn bằng: theo dõi CẶP người thực hiện – người phê duyệt.
     Nếu A luôn duyệt cho B và B luôn duyệt cho A thì đó là
     dấu hiệu cần kiểm tra, dù mỗi giao dịch đều đúng quy trình.

   → Và: lấy mẫu kiểm tra lại độc lập một tỷ lệ giao dịch đã duyệt.
```

## Điều chỉnh số dư thủ công — thao tác nguy hiểm nhất

```text
   ĐÂY LÀ THAO TÁC CÓ THỂ TẠO RA TIỀN TỪ HƯ KHÔNG.
   Nó phải được kiểm soát chặt hơn mọi thao tác khác.

   BẮT BUỘC CÓ:
      ① Lý do CÓ CẤU TRÚC (chọn từ danh mục), không phải văn bản tự do
      ② Chứng từ đính kèm
      ③ Phê duyệt bốn mắt, không có ngoại lệ
      ④ Bút toán đối ứng RÕ RÀNG — tiền này lấy từ tài khoản nào
      ⑤ Báo cáo hằng ngày gửi bộ phận tài chính, liệt kê từng khoản

   ⚠ ĐIỂM ④ LÀ ĐIỂM QUAN TRỌNG NHẤT VÀ HAY BỊ LÀM SAI:

   Nhiều hệ thống cho phép "cộng số dư" mà không ghi bút toán đối ứng.
   → Tiền xuất hiện từ hư không, sổ cái mất cân đối,
     và vi phạm nguyên tắc hạch toán kép (phase 1 bài 2).

   ĐÚNG: Nợ "Chi phí bồi thường khách hàng" / Có "Phải trả khách hàng"
   → Luôn có nguồn, luôn cân, luôn giải thích được.
```

## Phân quyền — bốn nguyên tắc

```text
   ① QUYỀN TỐI THIỂU
      Mặc định KHÔNG có quyền gì. Cấp thêm khi cần, không cấp trước.

   ② TÁCH BIỆT NHIỆM VỤ
      Người tạo ≠ người duyệt ≠ người đối soát.
      Một người nắm cả ba là có thể tạo giao dịch giả, tự duyệt,
      rồi tự làm sổ cho khớp.

   ③ QUYỀN CÓ THỜI HẠN
      Quyền cấp tạm cho một việc phải TỰ HẾT HẠN.
      → Nguồn tích tụ quyền phổ biến nhất là quyền tạm không bao giờ bị thu.

   ④ RÀ SOÁT ĐỊNH KỲ
      Mỗi quý, người quản lý xác nhận lại danh sách quyền của nhân viên.
      → Bắt được trường hợp chuyển bộ phận mà quyền cũ vẫn còn.
```

```sql
-- Truy vấn nên chạy hằng tháng: ai có quyền nhạy cảm mà không dùng
SELECT u.username, p.permission, max(a.created_at) AS lan_dung_gan_nhat
FROM user_permissions p
JOIN users u ON u.id = p.user_id
LEFT JOIN audit_log a
       ON a.user_id = p.user_id AND a.action = p.permission
WHERE p.permission IN ('BALANCE_ADJUST','REFUND_APPROVE','LIMIT_CHANGE')
GROUP BY 1, 2
HAVING max(a.created_at) < now() - interval '90 days'
    OR max(a.created_at) IS NULL;
-- → quyền nhạy cảm không dùng 90 ngày = nên thu hồi
```

## Nhật ký kiểm toán — yêu cầu và cạm bẫy

```text
   MỖI BẢN GHI PHẢI CÓ:
      · Ai (danh tính thật, không phải tài khoản dùng chung)
      · Làm gì (hành động có cấu trúc)
      · Trên đối tượng nào
      · Khi nào (kèm múi giờ)
      · Từ đâu (IP, thiết bị)
      · GIÁ TRỊ TRƯỚC và GIÁ TRỊ SAU
      · Lý do
      · Mã yêu cầu để lần ngược toàn bộ luồng

   ⚠ BỐN YÊU CẦU VỀ TÍNH TOÀN VẸN:

   ① CHỈ GHI THÊM, KHÔNG SỬA, KHÔNG XOÁ
      Kể cả quản trị viên hệ thống cũng không được sửa.

   ② TÀI KHOẢN DÙNG CHUNG LÀ CẤM
      "admin" thì không truy ra được ai làm.

   ③ LƯU RIÊNG, QUYỀN GHI TÁCH KHỎI QUYỀN ĐỌC
      Người có quyền trên hệ thống chính không được sửa nhật ký.

   ④ GHI CẢ HÀNH ĐỘNG ĐỌC với dữ liệu nhạy cảm
      Ai xem ảnh căn cước, ai xem số dư khách — cũng phải ghi.
```

```text
   VÀ MỘT ĐIỀU DỄ BỎ SÓT:

   NHẬT KÝ PHẢI GHI CẢ HÀNH ĐỘNG THẤT BẠI.

   Một người thử điều chỉnh số dư 40 lần và bị từ chối cả 40 lần
   là dấu hiệu quan trọng hơn nhiều so với một lần thành công.
   → Chỉ ghi thành công là mù trước hành vi dò tìm.
```

## Cảnh báo — điều gì đáng báo động

```text
   ĐẶT CẢNH BÁO TRÊN MẪU, KHÔNG PHẢI TRÊN TỪNG THAO TÁC ĐƠN LẺ:

   ① NHIỀU KHOẢN HOÀN VỀ CÙNG MỘT TÀI KHOẢN NHẬN
      ← chặn được chính sự cố ở đầu bài

   ② MỘT NGƯỜI DÙNG CÓ SỐ THAO TÁC BẤT THƯỜNG SO VỚI CHÍNH HỌ
      So với trung bình 30 ngày của người đó, không so với đội

   ③ THAO TÁC NGOÀI GIỜ LÀM VIỆC

   ④ CHUỖI THAO TÁC ĐÁNG NGỜ
      Đổi tài khoản nhận tiền của khách → ngay sau đó chi tiền
      → phải cảnh báo ngay lập tức, và nên có thời gian chờ bắt buộc

   ⑤ CẶP NGƯỜI THỰC HIỆN – PHÊ DUYỆT LẶP LẠI BẤT THƯỜNG

   ⑥ HÀNH ĐỘNG BỊ TỪ CHỐI NHIỀU LẦN
```

```sql
-- Cảnh báo ①: nhiều khoản hoàn về cùng tài khoản nhận trong 30 ngày
SELECT beneficiary_account,
       count(*)          AS so_lan,
       sum(amount_minor) AS tong_tien,
       count(DISTINCT created_by) AS so_nhan_vien,
       array_agg(DISTINCT created_by) AS danh_sach
FROM refunds
WHERE created_at > now() - interval '30 days'
GROUP BY 1
HAVING count(*) >= 5
ORDER BY 3 DESC;
```

```text
   ⚠ CHÚ Ý CỘT so_nhan_vien TRONG TRUY VẤN TRÊN:

   Nhiều khoản hoàn về một tài khoản do NHIỀU nhân viên thực hiện
   thì có thể là hợp lệ (một khách hay khiếu nại).

   Nhiều khoản về một tài khoản do CÙNG MỘT nhân viên thực hiện
   thì gần như chắc chắn có vấn đề.

   → Cảnh báo phải nhìn cả hai chiều, nếu không sẽ đầy báo động giả.
```

## Kiểm soát thay đổi hệ thống

```text
   RỦI RO VẬN HÀNH KHÔNG CHỈ ĐẾN TỪ THAO TÁC NGHIỆP VỤ.
   NÓ CÒN ĐẾN TỪ THAY ĐỔI KỸ THUẬT.

   NHỮNG THAY ĐỔI PHẢI KIỂM SOÁT NHƯ GIAO DỊCH TÀI CHÍNH:
      · Sửa cấu hình lãi suất, phí, hạn mức
      · Sửa quy tắc rủi ro
      · Chạy script trực tiếp trên database production
      · Thay đổi quyền

   ⚠ RIÊNG VIỆC CHẠY SCRIPT TRÊN DATABASE PRODUCTION:

   Đây là con đường vòng qua MỌI lớp kiểm soát ở trên.
   Một câu UPDATE có thể làm điều mà giao diện không cho phép.

   BẮT BUỘC:
      · Không ai có quyền ghi trực tiếp thường xuyên
      · Cấp quyền tạm thời, có hạn, cho từng lần
      · Script phải được review trước
      · Ghi lại toàn bộ câu lệnh đã chạy
      · Đối soát sau khi chạy
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Không có hạn mức cho người dùng nội bộ | **2,7 tỷ trong tám tháng** như ở đầu bài | Hạn mức theo vai trò, vượt thì cần phê duyệt |
| Cho rằng hoàn tiền là thao tác an toàn | Là thao tác chi tiền ra, rủi ro cao | Áp dụng đầy đủ hạn mức và bốn mắt |
| Không có hạn mức cấp hệ thống | Một lỗi code chi ra hàng tỷ trong vài phút | Trần chi tiền theo giờ/ngày, vượt thì dừng toàn bộ |
| Điều chỉnh số dư không có bút toán đối ứng | **Tiền từ hư không**, sổ mất cân đối | Luôn có nguồn, luôn cân |
| Lý do ghi văn bản tự do | Không thống kê, không phát hiện mẫu | Lý do có cấu trúc, chọn từ danh mục |
| Không theo dõi cặp thực hiện – phê duyệt | Thông đồng vòng qua nguyên tắc bốn mắt | Theo dõi cặp, lấy mẫu kiểm tra độc lập |
| Quyền tạm không tự hết hạn | Tích tụ quyền âm thầm qua nhiều năm | Quyền có thời hạn, rà soát định kỳ |
| Dùng tài khoản chung `admin` | **Không truy ra được ai làm** | Cấm tài khoản dùng chung, danh tính thật |
| Nhật ký chỉ ghi thành công | Mù trước hành vi dò tìm | Ghi cả hành động **bị từ chối** |
| Nhật ký sửa/xoá được | Mất giá trị pháp lý | Chỉ ghi thêm, lưu riêng, tách quyền |
| Không ghi hành động đọc dữ liệu nhạy cảm | Không phát hiện được rò rỉ dữ liệu nội bộ | Ghi cả truy cập đọc |
| Cảnh báo trên từng thao tác đơn lẻ | Đầy báo động giả, bỏ sót mẫu thật | Cảnh báo trên **mẫu**, nhìn cả số nhân viên liên quan |
| Cho phép chạy script tự do trên production | Vòng qua **mọi** lớp kiểm soát | Quyền tạm từng lần, review trước, ghi log, đối soát sau |

## Tóm tắt bài 4

- **Ba loại hạn mức độc lập**: khách hàng, nghiệp vụ (cấp hệ thống), và **người dùng nội bộ** — thiếu loại thứ ba là sự cố ở đầu bài.
- **Hoàn tiền là thao tác chi tiền ra**, không phải thao tác an toàn — phải kiểm soát như mọi thao tác rủi ro cao.
- **Hạn mức cấp hệ thống là cầu dao**: một lỗi code có thể chi ra hàng tỷ trong vài phút mà mọi hạn mức cá nhân đều hợp lệ. Ngưỡng đặt theo số liệu lịch sử, và phải có quy trình nới khẩn cấp có kiểm soát.
- **Nguyên tắc bốn mắt** phải được hệ thống cưỡng chế, và phải **theo dõi cặp người thực hiện – người phê duyệt** để bắt thông đồng.
- **Điều chỉnh số dư thủ công là thao tác nguy hiểm nhất** — bắt buộc có bút toán đối ứng rõ ràng, nếu không là tạo tiền từ hư không.
- Bốn nguyên tắc phân quyền: **quyền tối thiểu, tách biệt nhiệm vụ, quyền có thời hạn, rà soát định kỳ**. Quyền tạm không tự hết hạn là nguồn tích tụ quyền phổ biến nhất.
- Nhật ký kiểm toán: **chỉ ghi thêm**, cấm tài khoản dùng chung, lưu riêng và tách quyền, **ghi cả hành động thất bại** và **hành động đọc dữ liệu nhạy cảm**.
- Cảnh báo đặt trên **mẫu**, không trên thao tác đơn lẻ — và phải nhìn cả **số nhân viên liên quan** để phân biệt hợp lệ với bất thường.
- **Chạy script trực tiếp trên production vòng qua mọi lớp kiểm soát** — phải cấp quyền tạm từng lần, review trước, ghi log, đối soát sau.

**Bài kế tiếp** → [Bài 5: Bảo mật dữ liệu thẻ và dữ liệu cá nhân](05-bao-mat-du-lieu.md)

**Quay lại** → [Bài 3: Chống gian lận](03-chong-gian-lan.md)
