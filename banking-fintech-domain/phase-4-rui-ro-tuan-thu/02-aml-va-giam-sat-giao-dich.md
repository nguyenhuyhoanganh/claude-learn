# Bài 2: Phòng chống rửa tiền — giám sát giao dịch và báo cáo

## Sự cố mở đầu

Một ví điện tử cài luật giám sát: cảnh báo mọi giao dịch **trên 300 triệu đồng**. Luật này chạy đúng, không bỏ sót giao dịch nào vượt ngưỡng.

Một năm sau, cơ quan điều tra liên hệ. Có một đường dây đã chuyển **hơn 40 tỷ đồng** qua hệ thống trong sáu tháng.

Hệ thống **không sinh ra một cảnh báo nào**.

Cách họ làm: mỗi giao dịch **28–35 triệu đồng**, chia qua **170 tài khoản**, mỗi tài khoản 3–4 giao dịch mỗi tuần. Không giao dịch nào chạm ngưỡng 300 triệu.

Đây là kỹ thuật kinh điển, có tên riêng: **chia nhỏ giao dịch để né ngưỡng**. Và nó vô hiệu hoá hoàn toàn mọi hệ thống giám sát chỉ nhìn **từng giao dịch một**.

Bài này nói về việc giám sát cái gì, và vì sao ngưỡng đơn lẻ không bao giờ đủ.

## Ba giai đoạn của rửa tiền

```text
   ① SẮP XẾP  (placement)
      Đưa tiền bẩn vào hệ thống tài chính.
      → Nộp tiền mặt, mua thẻ trả trước, nạp ví.
      → Đây là giai đoạn DỄ PHÁT HIỆN NHẤT.

   ② PHÂN TÁN  (layering)
      Chuyển qua nhiều tài khoản, nhiều lớp, nhiều quốc gia
      để cắt đứt dấu vết nguồn gốc.
      → Giao dịch nhiều, giá trị vừa phải, tần suất cao.
      → ĐÂY LÀ GIAI ĐOẠN SỰ CỐ Ở ĐẦU BÀI THUỘC VỀ.

   ③ HỢP NHẤT  (integration)
      Đưa tiền trở lại nền kinh tế dưới vỏ bọc hợp pháp:
      mua bất động sản, đầu tư kinh doanh, hoá đơn khống.

   → HỆ THỐNG CỦA BẠN THƯỜNG NẰM Ở GIAI ĐOẠN ① VÀ ②.
     Luật giám sát phải thiết kế cho hai giai đoạn đó.
```

## Vì sao ngưỡng đơn lẻ không đủ — và bốn nhóm luật cần có

```text
   ① LUẬT THEO NGƯỠNG ĐƠN LẺ
      "Giao dịch trên X" → dễ né, nhưng vẫn cần vì đơn giản và bắt buộc.

   ② LUẬT THEO TÍCH LUỸ  ← chặn được sự cố ở đầu bài
      "Tổng giao dịch trong 7 ngày trên X"
      "Số giao dịch trong 24 giờ trên N"
      "Tổng nhận từ nhiều nguồn khác nhau trong 30 ngày"

   ③ LUẬT THEO MẪU HÀNH VI
      "Nhận tiền rồi chuyển đi hết trong vòng 1 giờ"       ← tài khoản trung chuyển
      "Nhiều giao dịch sát dưới ngưỡng báo cáo"            ← né ngưỡng có chủ đích
      "Tài khoản mới mở đã có giao dịch lớn ngay"
      "Giao dịch vào giờ bất thường so với lịch sử khách"

   ④ LUẬT THEO MẠNG LƯỚI  ← mạnh nhất, khó làm nhất
      "Nhiều tài khoản cùng chuyển về một tài khoản"
      "Các tài khoản dùng chung thiết bị / số điện thoại / địa chỉ IP"
      "Chuỗi chuyển tiền A → B → C → D trong thời gian ngắn"
```

```text
   ⚠ NHÓM ③ CÓ MỘT LUẬT ĐẶC BIỆT QUAN TRỌNG:

   PHÁT HIỆN HÀNH VI CỐ Ý Ở SÁT DƯỚI NGƯỠNG.

   Nếu ngưỡng báo cáo là 300 triệu mà một khách có 20 giao dịch
   trong khoảng 280–299 triệu, thì bản thân MẪU ĐÓ là dấu hiệu —
   vì người bình thường không giao dịch với con số sát ngưỡng như vậy.

   → Luật này bắt được chính hành vi né luật.
```

## Kiến trúc hệ thống giám sát

```text
   ┌──────────────────────────────────────────────────────────┐
   │ GIAO DỊCH                                                 │
   └────────────────────────┬─────────────────────────────────┘
              ┌─────────────┴─────────────┐
              ▼                           ▼
   ┌────────────────────┐      ┌──────────────────────┐
   │ KIỂM TRA TỨC THỜI  │      │ KIỂM TRA THEO LÔ     │
   │ (chặn được)        │      │ (phát hiện sau)      │
   │                    │      │                      │
   │ · danh sách cấm vận│      │ · luật tích luỹ      │
   │ · hạn mức          │      │ · mẫu hành vi        │
   │ · tài khoản bị khoá│      │ · phân tích mạng lưới│
   │                    │      │                      │
   │ PHẢI NHANH (<100ms)│      │ Chạy hằng ngày/giờ   │
   └─────────┬──────────┘      └──────────┬───────────┘
             │                             │
             ▼                             ▼
        CHẶN / CHO QUA            ┌──────────────────┐
                                   │ HÀNG ĐỢI CẢNH BÁO│
                                   └────────┬─────────┘
                                            ▼
                                   ┌──────────────────┐
                                   │ ĐIỀU TRA VIÊN    │
                                   └────────┬─────────┘
                                    ┌───────┴────────┐
                                    ▼                ▼
                              ĐÓNG (giải trình)  BÁO CÁO CƠ QUAN
```

```text
   ⚠ PHÂN BIỆT HAI ĐƯỜNG NÀY LÀ QUYẾT ĐỊNH KIẾN TRÚC QUAN TRỌNG NHẤT:

   KIỂM TRA TỨC THỜI phải nhanh, nên chỉ làm được luật ĐƠN GIẢN.
   Nhồi luật tích luỹ vào đây sẽ làm chậm mọi giao dịch.

   KIỂM TRA THEO LÔ làm được luật phức tạp, nhưng PHÁT HIỆN SAU KHI
   TIỀN ĐÃ ĐI. Nó không ngăn được, chỉ để báo cáo và điều tra.

   → Đừng cố chặn mọi thứ ở thời gian thực. Không khả thi.
```

## Xử lý cảnh báo — nơi hệ thống thường sụp

```text
   BÀI TOÁN THẬT: 95–99% CẢNH BÁO LÀ BÁO ĐỘNG GIẢ.

   Một hệ thống 500.000 giao dịch/ngày với luật đặt lỏng
   có thể sinh 2.000 cảnh báo mỗi ngày.

   Đội điều tra 5 người xử lý được khoảng 150 cảnh báo/ngày.

   → HÀNG ĐỢI PHÌNH VÔ HẠN. Sau ba tháng có 150.000 cảnh báo
     chưa ai xem. Và đó là tình trạng VI PHẠM, vì quy định
     yêu cầu xem xét trong thời hạn nhất định.
```

**Bốn cách giải quyết, dùng đồng thời:**

```text
   ① CHẤM ĐIỂM VÀ XẾP ƯU TIÊN
      Không xử lý theo thứ tự thời gian. Xử lý theo mức rủi ro.
      Kết hợp nhiều luật cùng kích hoạt → điểm cao hơn nhiều
      so với một luật đơn lẻ.

   ② GOM CẢNH BÁO THEO KHÁCH HÀNG
      20 cảnh báo của cùng một người trong một tuần
      = MỘT hồ sơ điều tra, không phải 20.
      → Giảm khối lượng rất nhiều mà không mất thông tin.

   ③ TỰ ĐỘNG ĐÓNG CÁC MẪU ĐÃ BIẾT
      Khách đã giải trình nguồn tiền, mẫu giao dịch ổn định
      → tự đóng cảnh báo cùng loại trong X tháng, có ghi lý do.
      ⚠ Phải xem lại định kỳ, không đóng vĩnh viễn.

   ④ ĐO VÀ TINH CHỈNH TỪNG LUẬT
      Mỗi luật phải có chỉ số: sinh bao nhiêu cảnh báo,
      bao nhiêu phần trăm dẫn tới báo cáo thật.
      → Luật sinh 3.000 cảnh báo mà chưa từng có báo cáo nào
        là luật cần sửa hoặc bỏ.
```

```text
   ⚠ NHƯNG KHÔNG ĐƯỢC GIẢM CẢNH BÁO BẰNG CÁCH SIẾT NGƯỠNG MÙ QUÁNG.

   Siết ngưỡng để hàng đợi đẹp = bỏ sót = vi phạm.
   Cơ quan quản lý sẽ hỏi VÌ SAO bạn đặt ngưỡng đó,
   và câu trả lời "để giảm khối lượng công việc" là không chấp nhận được.

   → Mọi thay đổi ngưỡng phải có PHÂN TÍCH TÁC ĐỘNG
     và được phê duyệt bởi bộ phận tuân thủ, có lưu hồ sơ.
```

## Hồ sơ điều tra — phải ghi những gì

```text
   MỘT HỒ SƠ ĐIỀU TRA CẦN:

      · Cảnh báo nào, luật nào kích hoạt, lúc nào
      · Toàn bộ giao dịch liên quan trong kỳ xem xét
      · Thông tin KYC của khách
      · Lịch sử cảnh báo trước đó của khách này
      · Người điều tra, thời gian bắt đầu và kết thúc
      · KẾT LUẬN kèm lý do, có cấu trúc
      · Nếu báo cáo: mã báo cáo đã gửi, ngày gửi

   ⚠ HỒ SƠ NÀY LÀ BẰNG CHỨNG PHÁP LÝ.

   Khi thanh tra hỏi "vì sao các anh không báo cáo trường hợp này",
   hồ sơ điều tra ghi rõ lý do đóng là thứ bảo vệ công ty.
   Không có hồ sơ = không giải trình được = coi như không làm.
```

## Báo cáo giao dịch đáng ngờ

```text
   KHI ĐIỀU TRA VIÊN KẾT LUẬN CÓ DẤU HIỆU ĐÁNG NGỜ:

   ① LẬP BÁO CÁO gửi cơ quan quản lý trong thời hạn quy định
   ② KHÔNG ĐƯỢC BÁO CHO KHÁCH HÀNG BIẾT
```

```text
   ⚠ ĐIỂM ② LÀ QUY ĐỊNH TUYỆT ĐỐI, VÀ NÓ CÓ HỆ QUẢ KỸ THUẬT THẬT:

   · Không được hiển thị trạng thái "đang bị điều tra" trên giao diện khách
   · Nhân viên hỗ trợ KHÔNG được thấy thông tin này
   · Nếu khoá tài khoản, lý do hiển thị phải chung chung
   · Log truy cập hồ sơ điều tra phải chặt — ai xem cũng phải ghi lại

   → Nhiều hệ thống làm lộ điều này qua thiết kế giao diện
     mà không nhận ra: một dòng trạng thái, một thông báo lỗi
     khác thường cũng đủ để khách biết.
```

```text
   VÀ MỘT ĐIỂM VỀ NGHIỆP VỤ:

   BÁO CÁO ĐÁNG NGỜ KHÔNG PHẢI LÀ CÁO BUỘC.

   Bạn không cần chứng minh khách phạm tội. Bạn chỉ cần thấy
   dấu hiệu bất thường không giải thích được.
   → Ngưỡng để báo cáo THẤP hơn nhiều so với ngưỡng để kết tội.
   → Không báo cáo vì "chưa chắc chắn" là hiểu sai nghĩa vụ.
```

## Giám sát phải nhìn cả mạng lưới

```text
   VÍ DỤ THẬT VỀ SỨC MẠNH CỦA PHÂN TÍCH MẠNG LƯỚI:

   170 tài khoản ở sự cố đầu bài, xét riêng lẻ thì tài khoản nào
   cũng bình thường.

   NHƯNG:
      · 170 tài khoản dùng chung 12 thiết bị
      · Cùng đăng ký trong 3 tuần
      · Cùng chuyển tiền về 4 tài khoản đích
      · Số dư luôn về gần 0 sau mỗi lần nhận

   → Bốn dấu hiệu này, nhìn ở cấp MẠNG LƯỚI, lộ ra ngay.
     Nhìn ở cấp GIAO DỊCH thì không thấy gì.
```

```sql
-- Ví dụ đơn giản: tìm cụm tài khoản dùng chung thiết bị
SELECT device_id,
       count(DISTINCT customer_id) AS so_tai_khoan,
       array_agg(DISTINCT customer_id) AS danh_sach
FROM login_events
WHERE created_at > now() - interval '30 days'
GROUP BY device_id
HAVING count(DISTINCT customer_id) >= 10
ORDER BY 2 DESC;
```

```text
   ⚠ VÀ MỘT ĐIỀU KIỆN TIÊN QUYẾT ĐỂ LÀM ĐƯỢC VIỆC NÀY:

   PHẢI THU THẬP VÀ LƯU DỮ LIỆU THIẾT BỊ, IP, PHIÊN ĐĂNG NHẬP
   NGAY TỪ ĐẦU.

   Không có dữ liệu này thì phân tích mạng lưới là bất khả thi,
   và bạn chỉ phát hiện được khi cơ quan điều tra gọi tới.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chỉ có luật ngưỡng đơn lẻ | **Chia nhỏ giao dịch né được hoàn toàn** — 40 tỷ không cảnh báo nào | Thêm luật tích luỹ, mẫu hành vi, mạng lưới |
| Không có luật bắt hành vi sát dưới ngưỡng | Bỏ sót chính hành vi né luật | Luật riêng cho mẫu "nhiều giao dịch sát ngưỡng" |
| Nhồi luật phức tạp vào kiểm tra thời gian thực | Chậm mọi giao dịch, vẫn không đủ | Tách hai đường: tức thời (đơn giản) và theo lô (phức tạp) |
| Xử lý cảnh báo theo thứ tự thời gian | Hàng đợi phình vô hạn, việc quan trọng bị chôn | Chấm điểm và xếp ưu tiên theo rủi ro |
| Mỗi cảnh báo một hồ sơ | Khối lượng gấp nhiều lần cần thiết | Gom cảnh báo theo khách hàng |
| Siết ngưỡng để hàng đợi đẹp | **Bỏ sót = vi phạm**, và không giải trình được | Thay đổi ngưỡng phải có phân tích tác động, được phê duyệt |
| Không đo hiệu quả từng luật | Luật vô dụng vẫn sinh nghìn cảnh báo mỗi ngày | Đo tỷ lệ cảnh báo dẫn tới báo cáo thật |
| Không lưu hồ sơ điều tra đầy đủ | **Không giải trình được** = coi như không làm | Hồ sơ có cấu trúc, lưu kết luận và lý do |
| Để lộ việc đang bị điều tra qua giao diện | **Vi phạm quy định tuyệt đối** | Trạng thái ẩn hoàn toàn, log mọi truy cập |
| Không báo cáo vì "chưa chắc chắn" | Hiểu sai nghĩa vụ — ngưỡng báo cáo thấp hơn ngưỡng kết tội | Báo cáo khi có dấu hiệu bất thường không giải thích được |
| Không lưu dữ liệu thiết bị và IP | **Phân tích mạng lưới bất khả thi** | Thu thập ngay từ đầu, lưu đủ lâu |
| Tự động đóng cảnh báo vĩnh viễn | Mẫu hành vi thay đổi, bỏ sót về sau | Đóng có thời hạn, xem lại định kỳ |

## Tóm tắt bài 2

- **Ngưỡng đơn lẻ không bao giờ đủ** — chia nhỏ giao dịch né được hoàn toàn, và đó là kỹ thuật kinh điển.
- Bốn nhóm luật cần có: **ngưỡng đơn lẻ**, **tích luỹ**, **mẫu hành vi**, **mạng lưới**. Nhóm cuối mạnh nhất và khó làm nhất.
- Cần một luật riêng bắt **hành vi cố ý giao dịch sát dưới ngưỡng** — chính mẫu đó là dấu hiệu.
- Tách hai đường: **kiểm tra tức thời** (đơn giản, chặn được) và **kiểm tra theo lô** (phức tạp, phát hiện sau). Không cố chặn mọi thứ ở thời gian thực.
- **95–99% cảnh báo là báo động giả** — hàng đợi phình vô hạn là tình trạng vi phạm. Giải quyết bằng **chấm điểm ưu tiên, gom theo khách hàng, tự đóng mẫu đã biết, và đo hiệu quả từng luật**.
- **Không được siết ngưỡng để giảm khối lượng công việc** — mọi thay đổi ngưỡng phải có phân tích tác động và được bộ phận tuân thủ phê duyệt.
- **Hồ sơ điều tra là bằng chứng pháp lý.** Không có hồ sơ = không giải trình được = coi như không làm.
- **Tuyệt đối không để khách biết mình đang bị điều tra** — điều này có hệ quả kỹ thuật thật lên thiết kế giao diện, phân quyền và thông báo lỗi.
- **Báo cáo đáng ngờ không phải cáo buộc** — ngưỡng báo cáo thấp hơn nhiều so với ngưỡng kết tội.
- Phân tích mạng lưới đòi hỏi **thu thập dữ liệu thiết bị, IP, phiên đăng nhập ngay từ đầu** — không có dữ liệu thì không làm được.

**Bài kế tiếp** → [Bài 3: Chống gian lận — phát hiện và phản ứng theo thời gian thực](03-chong-gian-lan.md)

**Quay lại** → [Bài 1: KYC và định danh khách hàng](01-kyc-va-dinh-danh.md)
