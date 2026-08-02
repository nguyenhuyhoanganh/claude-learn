# Bài 2: Chuyển khoản liên ngân hàng — NAPAS, Citad và SWIFT

## Sự cố mở đầu

23 giờ 40 phút, ngày 30 tháng 6. Khách chuyển 800 triệu đồng để tất toán hợp đồng — hạn chót là hết ngày hôm nay.

Hệ thống báo **"Đang xử lý"**. Tiền đã trừ khỏi tài khoản người gửi. Bên nhận chưa thấy gì.

00 giờ 15 phút. Vẫn "Đang xử lý". Khách gọi tổng đài, nhân viên trả lời: *"Anh yên tâm, tiền đang trên đường."*

09 giờ sáng hôm sau, tiền vào tài khoản người nhận. Nhưng ngày ghi nhận là **mùng 1 tháng 7** — quá hạn hợp đồng. Khách mất khoản đặt cọc 200 triệu.

Nguyên nhân: khoản 800 triệu **vượt hạn mức của kênh nhanh 24/7**, nên hệ thống tự động chuyển sang **kênh bù trừ theo lô** — kênh này chỉ chạy trong giờ hành chính.

Không ai làm sai. Nhưng cũng không ai nói cho khách biết rằng **có hai đường ray khác nhau**, và số tiền quyết định họ đi đường nào.

Bài này là bản đồ các đường ray đó.

## Ba đường ray chuyển tiền ở Việt Nam

```text
   ┌──────────────────────────────────────────────────────────────┐
   │ ① NAPAS 24/7 — chuyển nhanh                                  │
   │                                                               │
   │   Thời gian  : vài giây                                       │
   │   Hoạt động  : 24/7, kể cả lễ tết                            │
   │   Hạn mức    : có trần mỗi giao dịch (thay đổi theo quy định) │
   │   Ghi có     : NGAY LẬP TỨC cho người nhận                   │
   │   Phù hợp    : giao dịch nhỏ và vừa, bán lẻ                  │
   ├──────────────────────────────────────────────────────────────┤
   │ ② Citad — hệ thống thanh toán điện tử liên ngân hàng         │
   │                                                               │
   │   Thời gian  : trong ngày làm việc, theo phiên                │
   │   Hoạt động  : giờ hành chính, NGHỈ CUỐI TUẦN VÀ LỄ          │
   │   Hạn mức    : giá trị lớn                                    │
   │   Ghi có     : sau khi phiên bù trừ chạy xong                │
   │   Phù hợp    : giao dịch giá trị lớn                          │
   ├──────────────────────────────────────────────────────────────┤
   │ ③ SWIFT — chuyển tiền quốc tế                                │
   │                                                               │
   │   Thời gian  : 1–5 ngày làm việc                             │
   │   Hoạt động  : theo giờ làm việc từng quốc gia                │
   │   Đặc điểm   : đi qua NGÂN HÀNG TRUNG GIAN, mỗi bên thu phí  │
   │   Phù hợp    : thanh toán quốc tế                             │
   └──────────────────────────────────────────────────────────────┘
```

> **Điểm quan trọng nhất:** khách hàng không chọn đường ray. **Hệ thống chọn thay họ**, dựa trên số tiền, thời điểm và ngân hàng đích. Nếu giao diện không nói rõ điều này, bạn sẽ gặp lại sự cố ở đầu bài.

## Chuyển nhanh 24/7 hoạt động thế nào bên trong

```text
   ┌───────────┐  ①lệnh chuyển  ┌──────────────┐
   │ NGƯỜI GỬI │───────────────►│ NGÂN HÀNG A  │
   └───────────┘                └──────┬───────┘
                                        │ ②trừ tiền người gửi
                                        │   + GIỮ tiền ở tài khoản trung gian
                                        ▼
                                 ┌──────────────┐
                                 │    NAPAS     │ ③định tuyến + ghi nhận
                                 └──────┬───────┘
                                        │ ④
                                        ▼
                                 ┌──────────────┐
                                 │ NGÂN HÀNG B  │ ⑤ghi có NGAY cho người nhận
                                 └──────┬───────┘
                                        ▼
                                 ┌──────────────┐
                                 │ NGƯỜI NHẬN   │  tiền đã dùng được
                                 └──────────────┘

   ⚠ VÀ ĐÂY LÀ ĐIỀU ÍT NGƯỜI BIẾT:

   Ở bước ⑤ ngân hàng B đã ghi có cho người nhận — nhưng NGÂN HÀNG B
   CHƯA NHẬN ĐƯỢC TIỀN THẬT từ ngân hàng A.

   Tiền thật chỉ chuyển giữa hai ngân hàng ở PHIÊN QUYẾT TOÁN cuối ngày.

   → Ngân hàng B đang ỨNG TIỀN cho người nhận.
     Đây gọi là tách rời giữa GHI CÓ và QUYẾT TOÁN.
```

```text
   HỆ QUẢ THỰC TẾ CHO HỆ THỐNG CỦA BẠN:

   ① Người nhận thấy tiền ngay ≠ tiền đã quyết toán xong
   ② Đối soát cuối ngày so số RÒNG giữa hai ngân hàng,
      không so từng giao dịch một
   ③ Nếu ngân hàng A sập trước phiên quyết toán, ngân hàng B chịu rủi ro
      → đây là lý do có HẠN MỨC cho kênh nhanh
```

## Trạng thái của một lệnh chuyển — và cái bẫy lớn nhất

```text
   KHỞI TẠO ──► ĐANG XỬ LÝ ──┬──► THÀNH CÔNG
                              │
                              ├──► THẤT BẠI (đã hoàn tiền người gửi)
                              │
                              └──► KHÔNG XÁC ĐỊNH  ◄── CHỖ NGUY HIỂM NHẤT
                                        │
                                        │ phải TRA SOÁT
                                        ▼
                                   THÀNH CÔNG hoặc THẤT BẠI
```

```text
   ⚠ "KHÔNG XÁC ĐỊNH" LÀ TRẠNG THÁI PHẢI CÓ TRONG THIẾT KẾ.

   Nhiều hệ thống chỉ có ba trạng thái: chờ, thành công, thất bại.
   Đó là thiết kế SAI, vì thực tế có tình huống thứ tư:

      Bạn gửi lệnh đi → mạng đứt → không nhận được phản hồi.
      Lệnh đó có tới NAPAS không? Bạn KHÔNG BIẾT.

   Nếu ép nó thành "thất bại" → hoàn tiền cho người gửi
   → nhưng lệnh vẫn đi tới nơi → NGƯỜI NHẬN CŨNG NHẬN ĐƯỢC TIỀN
   → mất tiền thật.

   Nếu ép thành "thành công" → người gửi bị trừ mà người nhận không nhận.

   → BẮT BUỘC phải có trạng thái thứ tư và quy trình TRA SOÁT.
```

## Tra soát — quy trình bắt buộc phải có

```text
   KHI MỘT LỆNH RƠI VÀO "KHÔNG XÁC ĐỊNH":

   ① TỰ ĐỘNG TRUY VẤN LẠI theo mã tham chiếu
      Lịch thử: sau 30 giây, 2 phút, 10 phút, 1 giờ
      → phần lớn tự giải quyết ở bước này

   ② NẾU VẪN KHÔNG RÕ: gửi yêu cầu tra soát chính thức
      Đối tác trả lời trong khung thời gian cam kết

   ③ TRONG LÚC CHỜ: tiền của người gửi phải nằm ở
      TÀI KHOẢN TREO, không trả về, không ghi nhận thành công

   ④ CÓ KẾT QUẢ: ghi bút toán tương ứng, đóng tài khoản treo

   ⚠ TUYỆT ĐỐI KHÔNG:
      · Không tự động hoàn tiền khi chưa có kết luận
      · Không cho người gửi thử lại khi lệnh cũ chưa kết luận
        → đây chính là cách tạo ra chuyển tiền hai lần
```

```text
   BẢNG TÀI KHOẢN TREO PHẢI VỀ 0 (xem lại phase 1 bài 6):

   Số dư tài khoản treo cuối ngày > 0 nghĩa là còn lệnh chưa kết luận.
   → Đây là chỉ số vận hành quan trọng nhất của luồng chuyển tiền.
   → Theo dõi nó hằng ngày, có ngưỡng cảnh báo.
```

## Định danh người nhận — nơi tiền đi lạc

```text
   MỘT LỆNH CHUYỂN CẦN BA THỨ:
      · Mã ngân hàng nhận
      · Số tài khoản
      · Tên người nhận

   VÀ ĐÂY LÀ ĐIỀU QUYẾT ĐỊNH: HỆ THỐNG ĐỐI CHIẾU THEO CÁI NÀO?
```

| Cách làm | Ưu | Nhược |
|---|---|---|
| **Chỉ theo số tài khoản** | Nhanh, đơn giản | Gõ nhầm một số → **tiền vào tài khoản người lạ** |
| **Số tài khoản + kiểm tra tên** | Chặn được phần lớn nhầm lẫn | Tên có dấu, viết tắt, thứ tự khác nhau → khớp khó |
| **Truy vấn tên trước khi chuyển** | Người gửi **nhìn thấy tên** trước khi xác nhận | Cần thêm một lượt gọi mạng |

```text
   CÁCH THỨ BA LÀ CHUẨN HIỆN NAY, VÀ NÓ CHẶN ĐƯỢC PHẦN LỚN SỰ CỐ:

   Người gửi nhập số tài khoản
        ↓
   Hệ thống truy vấn ngân hàng nhận → trả về TÊN CHỦ TÀI KHOẢN
        ↓
   Hiển thị tên cho người gửi XÁC NHẬN
        ↓
   Người gửi thấy tên lạ → tự dừng lại

   ⚠ NHƯNG NÓ TẠO RA MỘT RỦI RO MỚI:
     Kẻ xấu có thể dò số tài khoản để lấy tên chủ tài khoản hàng loạt.
     → Phải có giới hạn tần suất trên chức năng truy vấn tên.
     → Đây là đánh đổi thật, không có lựa chọn hoàn hảo.
```

## Chuyển tiền quốc tế — vì sao tiền nhận được luôn thiếu

```text
   CHUYỂN 1.000 USD TỪ VIỆT NAM SANG MỸ:

   Ngân hàng VN ──► Ngân hàng trung gian 1 ──► Ngân hàng trung gian 2 ──► Ngân hàng Mỹ
        −15 USD           −20 USD                    −25 USD                −15 USD

   Người nhận nhận được: 925 USD

   ⚠ NGƯỜI GỬI KHÔNG BIẾT TRƯỚC CON SỐ NÀY, vì không ai biết trước
     lệnh sẽ đi qua mấy ngân hàng trung gian.

   → Đây là lý do chuyển tiền quốc tế có ba kiểu chịu phí:
      · OUR   : người gửi chịu hết, người nhận nhận đủ 1.000
      · BEN   : người nhận chịu hết
      · SHA   : chia đôi — phổ biến nhất, và khó đoán nhất
```

```text
   HỆ QUẢ CHO HỆ THỐNG:

   Nếu bạn ghi sổ "đã chuyển 1.000 USD" và bên nhận ghi "nhận 925 USD",
   đối soát sẽ lệch 75 USD MỖI GIAO DỊCH.

   → Phải có bút toán riêng cho PHÍ NGÂN HÀNG TRUNG GIAN,
     và chấp nhận rằng con số này chỉ biết được SAU KHI giao dịch xong.
```

## Điều phải làm khi thiết kế luồng chuyển tiền

```text
   ① CHỌN ĐƯỜNG RAY MỘT CÁCH TƯỜNG MINH VÀ NÓI CHO NGƯỜI DÙNG BIẾT
      "Giao dịch trên X đồng sẽ xử lý trong giờ làm việc, dự kiến nhận
       trước 16h ngày mai" — nói TRƯỚC khi họ bấm xác nhận.

   ② MỖI LỆNH MỘT MÃ THAM CHIẾU DUY NHẤT, sinh ở phía bạn
      Đây là thứ duy nhất tra soát được. Đừng dùng mã do đối tác sinh.

   ③ MÃ CHỐNG TRÙNG cho mọi lệnh gửi đi
      Gửi lại cùng mã → đối tác trả kết quả cũ, không tạo lệnh mới.

   ④ TRẠNG THÁI "KHÔNG XÁC ĐỊNH" + TÀI KHOẢN TREO + QUY TRÌNH TRA SOÁT

   ⑤ KHÔNG CHO THỬ LẠI KHI LỆNH CŨ CHƯA KẾT LUẬN
      Khoá theo tài khoản nguồn, không khoá theo phiên đăng nhập.

   ⑥ GHI LẠI ĐƯỜNG RAY ĐÃ DÙNG trong bản ghi giao dịch
      Không có thông tin này thì không giải thích được vì sao
      giao dịch A nhanh mà giao dịch B chậm.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chỉ có ba trạng thái (chờ / thành / bại) | Ép "không xác định" thành một trong hai → **mất tiền thật** | Bắt buộc có trạng thái thứ tư |
| Tự động hoàn tiền khi timeout | Lệnh vẫn tới nơi → cả hai bên đều nhận tiền | Tra soát trước, hoàn sau |
| Cho thử lại khi lệnh cũ chưa kết luận | **Chuyển tiền hai lần** | Khoá theo tài khoản nguồn tới khi có kết luận |
| Không nói rõ đường ray cho người dùng | Khách lỡ hạn như sự cố đầu bài | Báo thời gian dự kiến **trước** khi xác nhận |
| Dùng mã tham chiếu do đối tác sinh | Mất khả năng tra soát khi chưa nhận được phản hồi | Sinh mã ở phía mình, gửi kèm |
| Chỉ đối chiếu theo số tài khoản | Gõ nhầm → tiền vào tài khoản người lạ, **không lấy lại được** | Truy vấn và hiển thị tên trước khi xác nhận |
| Không giới hạn tần suất truy vấn tên | Kẻ xấu dò tên chủ tài khoản hàng loạt | Rate limit trên chức năng truy vấn |
| Coi ghi có là đã quyết toán | Hiểu sai rủi ro, đối soát sai | Ghi có và quyết toán là **hai mốc khác nhau** |
| Không tách phí ngân hàng trung gian | Chuyển quốc tế lệch **mỗi giao dịch** | Bút toán phí riêng, số phí biết **sau** |
| Không theo dõi số dư tài khoản treo | Lệnh chưa kết luận tồn đọng âm thầm | Tài khoản treo **phải về 0**, có cảnh báo |

## Tóm tắt bài 2

- Ba đường ray: **NAPAS 24/7** (vài giây, có hạn mức), **Citad** (giá trị lớn, giờ hành chính, nghỉ lễ), **SWIFT** (quốc tế, 1–5 ngày).
- **Khách không chọn đường ray — hệ thống chọn thay họ** theo số tiền và thời điểm. Không nói rõ điều này là nguyên nhân sự cố ở đầu bài.
- Ở kênh nhanh, **ghi có và quyết toán là hai mốc khác nhau**: người nhận thấy tiền ngay, nhưng tiền thật chỉ chuyển giữa hai ngân hàng ở phiên cuối ngày.
- **"Không xác định" là trạng thái bắt buộc phải có.** Ép nó thành thành công hay thất bại đều dẫn tới mất tiền thật.
- Quy trình **tra soát**: tự truy vấn theo lịch → yêu cầu chính thức → tiền nằm ở **tài khoản treo** trong lúc chờ → có kết luận mới ghi bút toán.
- **Không cho thử lại khi lệnh cũ chưa kết luận** — đây là cách phổ biến nhất tạo ra chuyển tiền hai lần.
- **Truy vấn và hiển thị tên người nhận trước khi xác nhận** chặn được phần lớn chuyển nhầm; đổi lại phải giới hạn tần suất để tránh bị dò tên.
- Chuyển quốc tế đi qua **ngân hàng trung gian**, mỗi bên thu phí, và **không ai biết trước có mấy bên** — phải có bút toán phí riêng.
- **Số dư tài khoản treo cuối ngày phải bằng 0.** Đây là chỉ số vận hành quan trọng nhất của luồng chuyển tiền.

**Bài kế tiếp** → [Bài 3: Thanh toán thẻ — cấp phép, ghi nhận và quyết toán](03-thanh-toan-the.md)

**Quay lại** → [Bài 1: Bản đồ hệ sinh thái thanh toán](01-ban-do-he-sinh-thai.md)
