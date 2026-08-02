# Case 10: Rò rỉ dữ liệu từ bên trong

## Triệu chứng

```text
   Khách hàng bắt đầu bị lừa đảo có mục tiêu. Kẻ gian gọi điện,
   xưng là nhân viên công ty, và đọc đúng:

      · họ tên, ngày sinh
      · số điện thoại, địa chỉ
      · BA GIAO DỊCH GẦN NHẤT, đúng số tiền và ngày

   Nhiều khách tin và cung cấp mã OTP.

   Hệ thống KHÔNG bị tấn công từ bên ngoài. Không có lỗ hổng nào.
   Không có bản sao lưu nào bị lấy.
```

Đây là loại sự cố khó chấp nhận nhất, vì **không có ai đột nhập**. Dữ liệu đi ra bằng **quyền truy cập hợp lệ**.

## Chẩn đoán

```text
   BƯỚC 1: XÁC ĐỊNH TẬP DỮ LIỆU BỊ RÒ

   Danh sách khách bị lừa có đặc điểm chung gì?
      · Cùng một nhóm sản phẩm?
      · Cùng một khoảng thời gian đăng ký?
      · Cùng một chi nhánh / kênh?
      · Cùng nằm trong một báo cáo nào đó?

   → Đặc điểm chung của tập nạn nhân chỉ ra NGUỒN rò rỉ.
```

```sql
-- BƯỚC 2: ai đã truy cập những khách hàng này?
SELECT actor_id,
       count(DISTINCT entity_id) AS so_khach_da_xem,
       min(occurred_at) AS lan_dau,
       max(occurred_at) AS lan_cuoi
FROM audit_events
WHERE entity_type = 'CUSTOMER'
  AND entity_id = ANY(:danh_sach_nan_nhan)
  AND occurred_at > now() - interval '90 days'
GROUP BY actor_id
ORDER BY 2 DESC;
```

```text
   actor_id      | so_khach_da_xem | lan_dau    | lan_cuoi
   --------------+-----------------+------------+------------
   nv_support_44 |             847 | 2026-05-02 | 2026-07-28
   nv_support_12 |              23 | 2026-06-11 | 2026-07-30
   nv_support_08 |              19 | 2026-07-02 | 2026-07-29
                          ▲
   MỘT NGƯỜI XEM 847 KHÁCH, trong khi đồng nghiệp cùng vai trò
   chỉ xem khoảng 20.
```

```sql
-- BƯỚC 3: mẫu truy cập của người đó có bất thường không?
SELECT date_trunc('day', occurred_at) AS ngay,
       count(*)                        AS so_lan_xem,
       count(DISTINCT entity_id)       AS so_khach,
       min(occurred_at::time)          AS som_nhat,
       max(occurred_at::time)          AS muon_nhat
FROM audit_events
WHERE actor_id = 'nv_support_44' AND entity_type = 'CUSTOMER'
GROUP BY 1 ORDER BY 1 DESC LIMIT 10;
```

```text
   ngay       | so_lan_xem | so_khach | som_nhat | muon_nhat
   -----------+------------+----------+----------+-----------
   2026-07-28 |        312 |      298 | 21:14:02 | 23:47:51
   2026-07-21 |        289 |      276 | 22:03:11 | 23:52:09
                    ▲                      ▲
        Xem 300 khách/ngày            NGOÀI GIỜ LÀM VIỆC

   → Không phải xử lý khiếu nại. Đây là tải dữ liệu về.
```

```text
   ⚠ NẾU KHÔNG CÓ BẢNG audit_events GHI CẢ HÀNH ĐỘNG ĐỌC
     THÌ TOÀN BỘ CUỘC ĐIỀU TRA NÀY LÀ BẤT KHẢ THI.

   Phần lớn hệ thống chỉ ghi log hành động GHI.
   → Rò rỉ dữ liệu là hành động ĐỌC. Không ghi log đọc
     nghĩa là bạn không bao giờ biết ai đã lấy gì.
```

## Bốn con đường dữ liệu đi ra từ bên trong

```text
   ① NHÂN VIÊN CÓ QUYỀN, DÙNG SAI MỤC ĐÍCH  ← trường hợp trên
      Quyền hợp lệ, thao tác hợp lệ, chỉ khác ở QUY MÔ và MỤC ĐÍCH.

   ② XUẤT BÁO CÁO
      Ai đó xuất file Excel danh sách khách rồi gửi ra ngoài.
      → Thường không bị coi là "truy cập dữ liệu" nên không log.

   ③ MÔI TRƯỜNG THỬ NGHIỆM CÓ DỮ LIỆU THẬT
      Bảo mật lỏng, nhiều người truy cập, dữ liệu thật (phase 4 bài 5).

   ④ QUYỀN CÒN SÓT LẠI
      Người đã chuyển bộ phận hoặc nghỉ việc mà quyền chưa thu hồi.
```

```text
   ⚠ ĐƯỜNG ② LÀ ĐƯỜNG BỊ ĐÁNH GIÁ THẤP NHẤT.

   Một nút "Xuất Excel" trên màn hình quản trị có thể lấy ra
   toàn bộ cơ sở dữ liệu khách hàng trong một lần bấm —
   và thường không có giới hạn, không log, không cảnh báo.
```

## Xử lý ngay — thứ tự rất quan trọng

```text
   ① THU HỒI QUYỀN NGAY, TRƯỚC KHI LÀM BẤT KỲ VIỆC GÌ KHÁC
      Nhưng KHÔNG thông báo cho người đó biết lý do.
      → Nếu họ biết đang bị điều tra, họ sẽ xoá dấu vết.

   ② BẢO TOÀN BẰNG CHỨNG
      Sao lưu nhật ký, máy làm việc, lịch sử truy cập —
      trước khi có bất kỳ thao tác nào có thể làm thay đổi chúng.

   ③ XÁC ĐỊNH PHẠM VI THẬT
      847 khách bị xem, nhưng bao nhiêu người thật sự bị ảnh hưởng?
      Dữ liệu nào bị lấy?

   ④ THÔNG BÁO
      · Nội bộ: ban lãnh đạo, bộ phận pháp chế
      · Cơ quan quản lý: theo thời hạn quy định
      · KHÁCH HÀNG BỊ ẢNH HƯỞNG: bắt buộc, và phải chủ động

   ⑤ CẢNH BÁO KHÁCH VỀ HÌNH THỨC LỪA ĐẢO CỤ THỂ
      "Chúng tôi không bao giờ hỏi mã OTP qua điện thoại"
      → Đây là việc cứu được nhiều khách nhất, làm sớm nhất có thể.

   ⑥ XỬ LÝ NHÂN SỰ VÀ PHÁP LÝ
```

```text
   ⚠ ĐIỂM ④ — THÔNG BÁO KHÁCH — HAY BỊ TRÌ HOÃN VÌ SỢ MẤT UY TÍN.

   Nhưng khách không được cảnh báo sẽ tiếp tục bị lừa,
   và khi họ biết công ty đã giấu thì thiệt hại uy tín lớn hơn nhiều.
   Ở nhiều nơi, chậm thông báo còn là vi phạm quy định.
```

## Chặn tái diễn — sáu biện pháp theo hiệu quả

```text
   ① GIỚI HẠN TRUY XUẤT HÀNG LOẠT  ← hiệu quả nhất

      · Số hồ sơ xem được mỗi giờ / mỗi ngày, theo vai trò
      · Vượt ngưỡng → khoá tạm và cảnh báo, không tự nới
      · Kết quả tìm kiếm giới hạn số dòng

      → Không có biện pháp này thì mọi phân quyền đều không ngăn
        được việc tải toàn bộ dữ liệu.
```

```sql
-- ② CẢNH BÁO TRÊN MẪU BẤT THƯỜNG — so với chính người đó, không so với đội
WITH tb AS (
    SELECT actor_id, avg(so_khach) AS tb_ngay, stddev(so_khach) AS do_lech
    FROM (SELECT actor_id, occurred_at::date AS d,
                 count(DISTINCT entity_id) AS so_khach
          FROM audit_events
          WHERE entity_type='CUSTOMER'
            AND occurred_at BETWEEN now()-interval '60 days' AND now()-interval '1 day'
          GROUP BY 1,2) t
    GROUP BY actor_id
)
SELECT h.actor_id, h.so_khach_hom_nay, tb.tb_ngay
FROM hom_nay h JOIN tb USING (actor_id)
WHERE h.so_khach_hom_nay > tb.tb_ngay + 3 * coalesce(tb.do_lech, 1);
```

```text
   ③ CHE DỮ LIỆU THEO NHU CẦU THẬT
      Nhân viên hỗ trợ cần xác minh danh tính khách:
         · KHÔNG cần thấy số căn cước đầy đủ → hiện 4 số cuối
         · KHÔNG cần thấy toàn bộ lịch sử giao dịch → hiện 3 giao dịch gần nhất
         · KHÔNG cần thấy số tiền chính xác → hiện khoảng

      → Che ở TẦNG API, không ở giao diện (phase 4 bài 5).

   ④ KIỂM SOÁT CHỨC NĂNG XUẤT DỮ LIỆU
      · Xuất là một hành động cần phê duyệt, không phải một nút bấm
      · Ghi log: ai xuất, bao nhiêu dòng, cột gì, lý do
      · Gắn dấu chìm vào file xuất để truy được nguồn nếu rò rỉ
      · Giới hạn số dòng mỗi lần xuất

   ⑤ RÀ SOÁT QUYỀN ĐỊNH KỲ + THU HỒI TỰ ĐỘNG
      · Quyền không dùng 90 ngày → tự thu hồi
      · Chuyển bộ phận → thu hồi toàn bộ, cấp lại theo vai trò mới
      · Nghỉ việc → thu hồi trong ngày, có quy trình kiểm tra

   ⑥ GHI LOG HÀNH ĐỘNG ĐỌC với dữ liệu cá nhân
      → Không có nó thì không điều tra được, như đã nói ở trên.
```

## Cân bằng với công việc thật của đội hỗ trợ

```text
   ⚠ SIẾT QUÁ TAY LÀM ĐỘI HỖ TRỢ KHÔNG LÀM VIỆC ĐƯỢC.

   Nhân viên cần xem thông tin khách để giúp họ. Chặn hết
   thì thời gian xử lý tăng, khách phàn nàn, và nhân viên
   sẽ tìm cách lách (chụp màn hình, ghi ra giấy, dùng tài khoản người khác).

   → NGUYÊN TẮC: KHÔNG CHẶN, MÀ RÀNG BUỘC THEO NGỮ CẢNH.

   ✅ Cho xem đầy đủ khi CÓ PHIẾU HỖ TRỢ ĐANG MỞ với khách đó
   ✅ Cho xem hạn chế khi tra cứu tự do
   ✅ Yêu cầu ghi lý do khi xem ngoài ngữ cảnh phiếu
   ✅ Cảnh báo khi tỷ lệ "xem không có phiếu" của một người tăng cao

   → Cách này vừa giữ được năng suất vừa tạo dấu vết,
     và quan trọng nhất là nó KHÔNG KHUYẾN KHÍCH LÁCH LUẬT.
```

## Bài học

```text
   ① RÒ RỈ TỪ BÊN TRONG KHÔNG CẦN LỖ HỔNG NÀO.
      Quyền hợp lệ + quy mô bất thường = mất dữ liệu.

   ② KHÔNG GHI LOG HÀNH ĐỘNG ĐỌC = KHÔNG BAO GIỜ ĐIỀU TRA ĐƯỢC.
      Đây là điều kiện tiên quyết, phải có trước mọi biện pháp khác.

   ③ GIỚI HẠN TRUY XUẤT HÀNG LOẠT LÀ BIỆN PHÁP HIỆU QUẢ NHẤT.
      Phân quyền trả lời "được xem gì"; giới hạn trả lời "được xem bao nhiêu".
      Thiếu vế thứ hai thì vế thứ nhất gần như vô nghĩa.

   ④ SO SÁNH VỚI CHÍNH NGƯỜI ĐÓ, KHÔNG SO VỚI TRUNG BÌNH ĐỘI.
      Mỗi vai trò có mức bình thường khác nhau.

   ⑤ CHỨC NĂNG XUẤT DỮ LIỆU LÀ ĐƯỜNG RÒ RỈ BỊ ĐÁNH GIÁ THẤP NHẤT.
      Một nút bấm có thể lấy cả cơ sở dữ liệu.

   ⑥ THU HỒI QUYỀN TRƯỚC, ĐIỀU TRA SAU, VÀ KHÔNG BÁO LÝ DO.

   ⑦ THÔNG BÁO CHO KHÁCH SỚM CỨU ĐƯỢC NHIỀU NGƯỜI NHẤT.
      Trì hoãn vì sợ mất uy tín làm thiệt hại lớn hơn.

   ⑧ SIẾT QUÁ TAY KHIẾN NGƯỜI TA LÁCH LUẬT.
      Ràng buộc theo ngữ cảnh tốt hơn chặn cứng.
```

---

**Hết phase 5.**

**Bài kế tiếp** → [Phase 6, Bài 1: Thiết kế mô hình sổ cái](../phase-6-thiet-ke-he-thong/01-thiet-ke-ledger.md)

**Quay lại** → [Case 9: Sai tỷ giá và làm tròn](09-sai-ty-gia-lam-tron.md)
