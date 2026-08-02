# Bài 5: Cổng thanh toán — tích hợp thế nào cho không phải làm lại

## Sự cố mở đầu

Một sàn thương mại điện tử tích hợp cổng thanh toán trong ba tuần. Chạy tốt suốt tám tháng.

Tháng thứ chín, cổng thanh toán thông báo: *"Chúng tôi nâng cấp API, phiên bản cũ ngừng hỗ trợ sau 60 ngày."*

Đội kỹ thuật mở code ra. Và phát hiện lời gọi cổng thanh toán nằm ở **47 chỗ khác nhau**: trong controller, trong service, trong job chạy nền, trong cả một hàm tiện ích ai đó viết để test rồi quên xoá.

Không có lớp trừu tượng nào. Mỗi chỗ tự gọi HTTP, tự parse JSON, tự xử lý lỗi theo kiểu riêng.

Việc lẽ ra mất ba ngày kéo dài **hai tháng rưỡi**, và trong quá trình đó phát sinh bốn sự cố trên production.

Sự cố này không phải về cổng thanh toán. Nó là về **cách bạn để một phụ thuộc bên ngoài thấm vào hệ thống của mình**.

## Cổng thanh toán làm gì cho bạn

```text
   KHÔNG CÓ CỔNG THANH TOÁN:

   Hệ thống của bạn phải:
      · Ký hợp đồng với từng ngân hàng
      · Tích hợp API của từng ngân hàng (mỗi cái một kiểu)
      · CHẠM VÀO SỐ THẺ → phải tuân thủ PCI DSS
      · Tự đối soát với từng đối tác
      · Tự xử lý mọi loại lỗi khác nhau

   CÓ CỔNG THANH TOÁN:

      · Một hợp đồng
      · Một API
      · KHÔNG chạm số thẻ (khách nhập trên trang của cổng)
      · Một file đối soát
      · Một bộ mã lỗi
```

```text
   ⚠ ĐIỀU QUAN TRỌNG NHẤT: "KHÔNG CHẠM SỐ THẺ"

   Nếu số thẻ đi qua máy chủ của bạn — dù chỉ một mili giây, dù không lưu —
   bạn rơi vào phạm vi tuân thủ PCI DSS ở mức cao nhất:
      · Kiểm định độc lập hằng năm
      · Quét lỗ hổng định kỳ
      · Phân vùng mạng riêng
      · Chịu trách nhiệm nếu rò rỉ

   → Đây là lý do gần như mọi hệ thống đều chọn mô hình
     KHÁCH NHẬP THẺ TRÊN TRANG CỦA CỔNG, không phải trang của bạn.
```

## Ba mô hình tích hợp

```text
   ① CHUYỂN HƯỚNG (redirect)
      Khách bấm "Thanh toán" → chuyển sang trang của cổng
      → nhập thẻ ở đó → xong thì quay về trang bạn

      ✅ Đơn giản nhất, ngoài phạm vi PCI DSS hoàn toàn
      ❌ Khách rời khỏi trang của bạn → tỷ lệ bỏ giỏ tăng
      ❌ Giao diện không đồng nhất với thương hiệu

   ② KHUNG NHÚNG (iframe / hosted fields)
      Ô nhập thẻ là khung của cổng, nhúng vào trang của bạn
      → khách không rời trang, nhưng dữ liệu thẻ đi thẳng tới cổng

      ✅ Trải nghiệm liền mạch
      ✅ Vẫn ngoài phạm vi PCI DSS ở mức nặng nhất
      ⚠ Vẫn phải khai báo tuân thủ ở mức nhẹ hơn

   ③ GỌI API TRỰC TIẾP (server-to-server)
      Bạn nhận số thẻ rồi gọi API cổng

      ✅ Kiểm soát hoàn toàn
      ❌ RƠI VÀO PHẠM VI PCI DSS ĐẦY ĐỦ
      → Chỉ chọn khi bạn thật sự cần và có nguồn lực tuân thủ
```

> **Mặc định nên chọn ② khung nhúng.** Nó cân bằng giữa trải nghiệm và gánh nặng tuân thủ. Chọn ① khi cần ra sản phẩm nhanh. Chỉ chọn ③ khi có lý do rõ ràng và có đội chuyên trách tuân thủ.

## Kiến trúc chống việc phải làm lại

Đây là phần giải quyết sự cố ở đầu bài.

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  TẦNG NGHIỆP VỤ                                               │
   │                                                               │
   │    OrderService.thanhToan(don)                                │
   │         │                                                     │
   │         │  chỉ biết interface, KHÔNG biết cổng nào            │
   │         ▼                                                     │
   ├──────────────────────────────────────────────────────────────┤
   │  CỔNG TRỪU TƯỢNG  (interface do BẠN định nghĩa)              │
   │                                                               │
   │    interface CongThanhToan {                                  │
   │        KetQuaCapPhep  capPhep(YeuCauThanhToan yc);           │
   │        KetQuaGhiNhan  ghiNhan(String maGiaoDich, Tien soTien);│
   │        KetQuaHuy      huy(String maGiaoDich);                 │
   │        KetQuaHoanTien hoanTien(String maGiaoDich, Tien st);   │
   │        TrangThai      truyVanTrangThai(String maGiaoDich);    │
   │    }                                                          │
   ├──────────────────────────────────────────────────────────────┤
   │  BẢN CÀI ĐẶT  (mỗi cổng một lớp)                             │
   │                                                               │
   │    CongA_Adapter      CongB_Adapter      CongGiaLap_Adapter   │
   │         │                   │                    │            │
   └─────────┼───────────────────┼────────────────────┼────────────┘
             ▼                   ▼                    ▼
        API cổng A          API cổng B          dùng cho test

   ⚠ QUY TẮC: MÃ LỖI, TÊN TRƯỜNG, ĐỊNH DẠNG CỦA CỔNG
     KHÔNG ĐƯỢC RÒ RA KHỎI TẦNG ADAPTER.

   Nếu tầng nghiệp vụ của bạn có dòng nào kiểu
        if (response.getErrorCode().equals("E0042"))
   thì bạn đã thất bại — cổng đổi mã lỗi là bạn phải sửa nghiệp vụ.
```

```text
   LỢI ÍCH ĐO ĐƯỢC CỦA KIẾN TRÚC NÀY:

   · Cổng nâng cấp API      → sửa 1 file adapter, không sửa 47 chỗ
   · Thêm cổng thứ hai      → viết thêm 1 adapter
   · Cổng chính gặp sự cố   → chuyển sang cổng dự phòng bằng cấu hình
   · Viết test              → dùng adapter giả lập, không gọi mạng
   · Đàm phán phí           → có phương án thay thế nên có vị thế
```

## Sáu thứ phải chuẩn hoá trong adapter

```text
   ① MÃ LỖI
      Cổng A trả "E0042", cổng B trả "insufficient_funds"
      → adapter dịch cả hai thành LoiThanhToan.KHONG_DU_TIEN

   ② PHÂN LOẠI LỖI THÀNH "THỬ LẠI ĐƯỢC" HAY KHÔNG
      → tầng nghiệp vụ chỉ cần biết: có nên thử lại không
      → không cần biết mã cụ thể là gì

   ③ ĐƠN VỊ TIỀN
      Cổng A nhận đồng, cổng B nhận nghìn đồng, cổng C nhận chuỗi "45000.00"
      → adapter quy về ĐỐI TƯỢNG TIỀN chuẩn của bạn (phase 1 bài 1)

   ④ MỐC THỜI GIAN
      Cổng trả giờ địa phương không kèm múi giờ là chuyện thường gặp
      → adapter quy về UTC, kèm múi giờ đã giả định

   ⑤ TRẠNG THÁI
      Mỗi cổng có tập trạng thái riêng, đôi khi 12–15 giá trị
      → gom về tập trạng thái của BẠN: chờ / thành công / thất bại /
        không xác định

   ⑥ MÃ THAM CHIẾU
      Luôn gửi mã đơn hàng của bạn sang, và LƯU LẠI mã của cổng
      → không có cặp mã này thì không tra soát và không đối soát được
```

## Sáu thứ phải xử lý ngay từ ngày đầu

Bỏ qua bất kỳ điểm nào dưới đây đều dẫn tới việc phải sửa gấp trên production sau này.

```text
   ① MÃ CHỐNG TRÙNG cho mọi lệnh tạo giao dịch
      Không có → mạng chập chờn là tạo giao dịch trùng.

   ② TIMEOUT VÀ THỬ LẠI CÓ GIỚI HẠN
      Timeout kết nối và timeout đọc phải đặt riêng, và phải NGẮN.
      Không đặt = mặc định vô hạn ở nhiều thư viện.
      Thử lại phải giãn cách tăng dần và chỉ với lỗi tạm thời (bài 3).

   ③ TRUY VẤN TRẠNG THÁI khi không nhận được phản hồi
      Đây là hàm quan trọng nhất của adapter và hay bị viết sau cùng.
      Không có nó thì mọi timeout đều thành "không biết" vĩnh viễn.

   ④ NHẬN THÔNG BÁO (webhook) — có chữ ký, chống trùng, trả 200 ngay
      Chi tiết ở bài 4.

   ⑤ ĐỐI SOÁT TỰ ĐỘNG bằng file cuối ngày
      Webhook có thể mất. File đối soát là NGUỒN SỰ THẬT CUỐI CÙNG.
      Chi tiết ở bài 6.

   ⑥ MÔI TRƯỜNG THỬ NGHIỆM tách hoàn toàn
      Khoá của môi trường thử và môi trường thật KHÔNG được nằm
      cùng một nơi, và tên biến phải khác nhau rõ ràng.
```

```text
   ⚠ SỰ CỐ KINH ĐIỂN VỚI ĐIỂM ⑥:

   Ai đó cấu hình nhầm khoá môi trường thử lên production.
   Kết quả: khách "thanh toán thành công", hệ thống ghi nhận đơn,
   giao hàng — nhưng KHÔNG CÓ ĐỒNG NÀO ĐƯỢC THU.

   Phát hiện ra sau vài ngày, khi đối soát thấy số giao dịch
   ở cổng thật bằng 0.

   → Chặn bằng cách: khi khởi động, gọi một API kiểm tra danh tính
     của cổng và ĐỐI CHIẾU với môi trường đang chạy. Sai thì
     KHÔNG CHO ỨNG DỤNG KHỞI ĐỘNG.
```

## Cổng dự phòng — khi nào đáng làm

```text
   CÓ HAI CỔNG LÀ MỘT QUYẾT ĐỊNH ĐẮT ĐỎ:
      · Hai hợp đồng, hai lần đối soát mỗi ngày
      · Hai bộ mã lỗi phải theo dõi
      · Định tuyến giữa hai cổng là logic phức tạp thêm

   ĐÁNG LÀM KHI:
      ✅ Thanh toán là đường sống của sản phẩm (cổng sập = doanh thu 0)
      ✅ Doanh số đủ lớn để đàm phán phí — có phương án thay thế
         là có vị thế đàm phán
      ✅ Một cổng không phủ hết phương thức khách cần

   CHƯA ĐÁNG KHI:
      ❌ Còn đang tìm sản phẩm phù hợp thị trường
      ❌ Đội nhỏ, chưa vận hành nổi một cổng cho tốt

   → NHƯNG DÙ CHƯA LÀM CỔNG THỨ HAI, VẪN NÊN CÓ LỚP TRỪU TƯỢNG.
     Chi phí tạo interface gần bằng 0. Chi phí không có nó là
     hai tháng rưỡi như ở đầu bài.
```

## Chọn cổng — hỏi gì trước khi ký

```text
   VỀ TIỀN
      · MDR là bao nhiêu, có phân biệt theo loại thẻ không?
      · Có phí cố định mỗi giao dịch không?
      · Phí hoàn tiền bao nhiêu, có hoàn lại phí gốc không?
      · Có giữ lại phần trăm doanh thu (rolling reserve) không,
        bao nhiêu và trong bao lâu?

   VỀ THỜI GIAN
      · Quyết toán T+mấy?
      · Trả số gộp hay số ròng? (quyết định mô hình sổ sách — bài 1)
      · Giờ chốt sổ là mấy giờ, múi giờ nào?

   VỀ KỸ THUẬT
      · Có mã chống trùng không, tên trường là gì?
      · Cơ chế gửi lại webhook: mấy lần, giãn cách bao lâu?
      · Có API truy vấn trạng thái không?
      · Có hỗ trợ ghi nhận một phần và ghi nhận nhiều lần không?
      · File đối soát định dạng gì, phát hành lúc mấy giờ?

   VỀ RỦI RO
      · Ai chịu chargeback?
      · Ngưỡng tỷ lệ chargeback là bao nhiêu?
      · Điều kiện nào thì họ ngừng dịch vụ với mình?
```

```text
   BỐN CÂU HỎI TRONG NHÓM "KỸ THUẬT" QUYẾT ĐỊNH KHỐI LƯỢNG CODE BẠN PHẢI VIẾT.
   Hỏi TRƯỚC khi ký hợp đồng, không phải trong lúc tích hợp.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Gọi thẳng API cổng khắp nơi trong code | Cổng đổi API → sửa hàng chục chỗ, mất hàng tháng | Interface của bạn + adapter cho từng cổng |
| Để mã lỗi của cổng rò vào tầng nghiệp vụ | Đổi cổng phải sửa cả logic nghiệp vụ | Adapter dịch sang mã lỗi của bạn |
| Nhận số thẻ trên máy chủ của mình | Rơi vào **phạm vi PCI DSS đầy đủ** | Dùng khung nhúng hoặc chuyển hướng |
| Không đặt timeout | Mặc định vô hạn → thread treo, cạn pool | Đặt riêng timeout kết nối và timeout đọc |
| Không có mã chống trùng | Mạng chập chờn → giao dịch trùng | Gửi mã chống trùng cho mọi lệnh tạo |
| Viết hàm truy vấn trạng thái sau cùng | Mọi timeout thành "không biết" vĩnh viễn | Viết nó **đầu tiên**, cùng lúc với hàm cấp phép |
| Chỉ dựa vào webhook | Webhook mất → giao dịch không được ghi nhận | File đối soát cuối ngày là nguồn sự thật |
| Khoá môi trường thử lên production | "Thanh toán thành công" mà **không thu được đồng nào** | Kiểm tra danh tính cổng lúc khởi động, sai thì không cho chạy |
| Không hỏi trả gộp hay ròng trước khi ký | Viết lại toàn bộ logic đối soát | Đưa vào danh sách câu hỏi trước hợp đồng |
| Bỏ qua rolling reserve khi tính dòng tiền | Thiếu hụt dòng tiền ngoài dự kiến | Hỏi tỷ lệ và thời gian giữ, đưa vào kế hoạch |
| Làm cổng thứ hai quá sớm | Gấp đôi công vận hành khi chưa cần | Làm **lớp trừu tượng** sớm, làm **cổng thứ hai** muộn |

## Tóm tắt bài 5

- Cổng thanh toán tồn tại để bạn có **một hợp đồng, một API, một file đối soát** — và quan trọng nhất là **không phải chạm vào số thẻ**.
- Số thẻ đi qua máy chủ bạn dù chỉ một mili giây cũng đưa bạn vào **phạm vi PCI DSS đầy đủ**.
- Ba mô hình tích hợp: **chuyển hướng** (đơn giản nhất), **khung nhúng** (mặc định nên chọn), **gọi API trực tiếp** (chỉ khi có đội tuân thủ).
- **Lớp trừu tượng là thứ quan trọng nhất của bài này.** Interface do bạn định nghĩa, adapter cho từng cổng, và **mã lỗi của cổng không được rò ra khỏi adapter**.
- Adapter phải chuẩn hoá sáu thứ: **mã lỗi, phân loại thử-lại-được, đơn vị tiền, mốc thời gian, trạng thái, mã tham chiếu**.
- Sáu thứ làm ngay từ ngày đầu: mã chống trùng, timeout và thử lại có giới hạn, **truy vấn trạng thái**, webhook có chữ ký, **đối soát bằng file**, và tách hoàn toàn môi trường thử.
- Hàm **truy vấn trạng thái phải viết đầu tiên**, không phải sau cùng — thiếu nó thì mọi timeout thành "không biết" vĩnh viễn.
- **Kiểm tra danh tính cổng lúc khởi động** để chặn sự cố dùng nhầm khoá môi trường thử trên production.
- Làm **lớp trừu tượng sớm**, làm **cổng thứ hai muộn** — chi phí tạo interface gần bằng 0, chi phí không có nó là hàng tháng.

**Bài kế tiếp** → [Bài 6: Hoàn tiền, tranh chấp và đối soát với cổng thanh toán](06-hoan-tien-va-tranh-chap.md)

**Quay lại** → [Bài 4: QR code và ví điện tử](04-qr-va-vi-dien-tu.md)
