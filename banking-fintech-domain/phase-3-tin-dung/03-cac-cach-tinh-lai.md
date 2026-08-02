# Bài 3: Lãi suất — bốn cách tính cho ra bốn con số khác nhau

## Sự cố mở đầu

Một khách vay 100 triệu, kỳ hạn 12 tháng, lãi suất **12%/năm**. Nhân viên tư vấn nói: *"Mỗi tháng anh trả gốc hơn 8 triệu, lãi 1 triệu, tổng khoảng 9,3 triệu."*

Khách ký. Đến kỳ đầu, hệ thống báo số tiền phải trả: **9.333.333 đồng**. Đúng như tư vấn.

Kỳ thứ hai: **9.333.333 đồng**. Kỳ thứ ba: **9.333.333 đồng**.

Tháng thứ sáu, khách thắc mắc: *"Tôi đã trả gần một nửa gốc rồi, sao tiền lãi vẫn y nguyên?"*

Nhân viên kiểm tra và phát hiện: sản phẩm này tính lãi trên **dư nợ gốc ban đầu**, không phải trên **dư nợ còn lại**. Tổng lãi khách trả trong 12 tháng là 12 triệu, trong khi nếu tính trên dư nợ giảm dần thì chỉ khoảng 6,6 triệu.

Cùng con số "12%/năm", nhưng **số tiền lãi thật chênh nhau gần gấp đôi**.

Không ai nói dối. Nhưng cũng không ai giải thích rằng chữ "12%/năm" có ít nhất bốn cách hiểu.

## Bốn cách tính lãi — cùng một con số, bốn kết quả

Vay **100 triệu, 12 tháng, "12%/năm"**:

```text
   ① LÃI TRÊN DƯ NỢ BAN ĐẦU (lãi phẳng)
      Lãi mỗi tháng = 100.000.000 × 12% / 12 = 1.000.000  (CỐ ĐỊNH)
      Tổng lãi cả kỳ = 12.000.000
      → Lãi không đổi dù đã trả bao nhiêu gốc.

   ② LÃI TRÊN DƯ NỢ GIẢM DẦN
      Lãi tháng 1  = 100.000.000 × 1% = 1.000.000
      Lãi tháng 2  =  91.666.667 × 1% =   916.667
      Lãi tháng 12 =   8.333.333 × 1% =    83.333
      Tổng lãi cả kỳ ≈ 6.500.000
                        ▲
              CHỈ BẰNG MỘT NỬA CÁCH ①

   ③ TRẢ GÓP ĐỀU (annuity)
      Mỗi tháng trả CÙNG một số tiền: ≈ 8.884.879
      Trong đó tỷ lệ gốc/lãi thay đổi dần.
      Tổng lãi ≈ 6.618.548

   ④ LÃI KÉP
      Lãi chưa trả được cộng vào gốc rồi tính lãi tiếp.
      → Dùng cho tiền gửi và cho nợ quá hạn, hiếm dùng cho vay thông thường.
```

| Cách tính | Tổng lãi | Trả mỗi tháng | Hay gặp ở |
|---|---|---|---|
| ① Dư nợ ban đầu | **12.000.000** | 9.333.333 cố định | Vay tiêu dùng, trả góp hàng hoá |
| ② Dư nợ giảm dần | 6.500.000 | Giảm dần | Vay ngân hàng, vay thế chấp |
| ③ Trả góp đều | 6.618.548 | 8.884.879 cố định | Vay mua nhà, mua xe |
| ④ Lãi kép | tuỳ tần suất nhập lãi | — | Tiền gửi, nợ quá hạn |

```text
   ⚠ ĐIỀU QUAN TRỌNG NHẤT CỦA BÀI NÀY:

   "12%/NĂM" LÀ MỘT CON SỐ VÔ NGHĨA NẾU KHÔNG NÓI RÕ CÁCH TÍNH.

   Cách ① và cách ② chênh nhau GẦN GẤP ĐÔI tiền lãi.
   Và cả hai đều được phép ghi là "12%/năm".
```

## Con số duy nhất so sánh được: lãi suất thực

```text
   VÌ CÁC CÁCH TÍNH KHÁC NHAU, PHÁP LUẬT NHIỀU NƯỚC YÊU CẦU
   CÔNG BỐ MỘT CON SỐ CHUẨN HOÁ: LÃI SUẤT THỰC (APR).

   Nó quy mọi khoản phí và mọi cách tính về cùng một thước đo.

   Khoản vay ở đầu bài:
      Lãi danh nghĩa công bố : 12%/năm
      Lãi suất thực          : ≈ 21,5%/năm
                                 ▲
                   VÌ THỰC TẾ KHÁCH KHÔNG DÙNG 100 TRIỆU SUỐT 12 THÁNG —
                   họ trả dần, dư nợ trung bình chỉ khoảng một nửa.

   → Cùng trả 12 triệu tiền lãi, nhưng trên dư nợ trung bình 54 triệu
     thì lãi suất thực gần gấp đôi con số công bố.
```

```text
   VÀ LÃI SUẤT THỰC PHẢI GỒM CẢ PHÍ:

      Phí thẩm định, phí bảo hiểm bắt buộc, phí quản lý khoản vay
      → nếu là điều kiện bắt buộc để được vay thì phải tính vào.

   ⚠ MẸO PHỔ BIẾN: chuyển một phần lãi thành "phí" để con số
     lãi suất công bố trông thấp hơn.
     → Đây chính là lý do quy định bắt công bố lãi suất thực.
```

## Quy ước đếm ngày — chi tiết nhỏ, sai số lớn

```text
   LÃI MỘT NGÀY = DƯ NỢ × LÃI SUẤT NĂM × (SỐ NGÀY / SỐ NGÀY TRONG NĂM)

   NHƯNG "SỐ NGÀY TRONG NĂM" LÀ BAO NHIÊU?

   ┌──────────────┬────────────────────────────────────────────┐
   │ 30/360       │ Mỗi tháng coi là 30 ngày, năm 360 ngày     │
   │              │ → đơn giản, dùng nhiều trong trái phiếu     │
   ├──────────────┼────────────────────────────────────────────┤
   │ thực tế/365  │ Ngày thật, năm luôn 365                    │
   ├──────────────┼────────────────────────────────────────────┤
   │ thực tế/360  │ Ngày thật, năm 360                         │
   │              │ ⚠ CHO RA LÃI CAO HƠN ~1,4% so với /365     │
   ├──────────────┼────────────────────────────────────────────┤
   │ thực tế/thực │ Ngày thật, năm nhuận thì 366               │
   └──────────────┴────────────────────────────────────────────┘

   VÍ DỤ: dư nợ 100 triệu, 12%/năm, tính lãi 31 ngày

      thực tế/365 : 100tr × 12% × 31/365 = 1.019.178
      thực tế/360 : 100tr × 12% × 31/360 = 1.033.333
                                            ─────────
                                   chênh      14.155 đồng/tháng

   Nhỏ. Nhưng nhân với 500.000 khoản vay là 7 tỷ đồng mỗi tháng.
```

```text
   → QUY ƯỚC ĐẾM NGÀY PHẢI LƯU TRONG SẢN PHẨM VAY,
     KHÔNG ĐƯỢC HARDCODE TRONG CODE.

   Mỗi sản phẩm có thể dùng quy ước khác nhau, và quy ước này
   nằm trong hợp đồng.
```

## Ba câu hỏi phải trả lời trước khi viết một dòng code tính lãi

```text
   ① TÍNH TRÊN DƯ NỢ NÀO?
      Gốc ban đầu / gốc còn lại / gốc trung bình?

   ② QUY ƯỚC ĐẾM NGÀY LÀ GÌ?
      30/360, thực tế/365, thực tế/360, thực tế/thực?

   ③ LÀM TRÒN Ở ĐÂU VÀ THEO CHIỀU NÀO?
      Làm tròn từng kỳ hay chỉ làm tròn tổng?
      Làm tròn lên, xuống, hay theo quy tắc ngân hàng?

   ⚠ BA CÂU NÀY PHẢI LẤY TỪ HỢP ĐỒNG VÀ QUY ĐỊNH, KHÔNG PHẢI TỰ QUYẾT.
     Và câu ③ chính là chỗ tạo ra lệch một đồng dai dẳng.
```

## Làm tròn — nơi mọi hệ thống tính lãi đều lệch

```text
   VAY 100 TRIỆU, TRẢ GÓP ĐỀU 12 THÁNG:

   Số tiền lý thuyết mỗi kỳ: 8.884.878,67 đồng

   LÀM TRÒN XUỐNG 8.884.878 CHO CẢ 12 KỲ:
      12 × 8.884.878 = 106.618.536
      Số đúng phải là 106.618.544
                       ──────────
                 THIẾU        8 đồng

   → 8 đồng đó đi đâu? Nếu không xử lý, nó nằm lại thành
     dư nợ lẻ không bao giờ tất toán được.
     Khách trả đủ 12 kỳ mà hệ thống vẫn báo "còn nợ 8 đồng".
```

**Cách xử lý chuẩn:**

```text
   DỒN TOÀN BỘ PHẦN LẺ VÀO KỲ CUỐI CÙNG.

      Kỳ 1–11 : 8.884.878 đồng
      Kỳ 12   : 8.884.886 đồng   ← gánh phần lẻ

   VÀ SAU KHI TẠO XONG LỊCH, KIỂM TRA BẮT BUỘC:

      Σ gốc mọi kỳ  =  số tiền vay        ← phải bằng ĐÚNG
      Σ (gốc + lãi) mọi kỳ = tổng phải trả

   → Không khớp thì KHÔNG cho tạo khoản vay.
     Thà từ chối còn hơn tạo một khoản vay không bao giờ tất toán được.
     (Cùng nguyên tắc với phase 1 bài 7 về làm tròn tiền tệ.)
```

## Lãi quá hạn — tính khác lãi trong hạn

```text
   KHI KHÁCH CHẬM TRẢ, THƯỜNG CÓ HAI KHOẢN CỘNG THÊM:

   ① LÃI QUÁ HẠN
      Áp trên phần GỐC ĐẾN HẠN CHƯA TRẢ, với lãi suất cao hơn
      (thường 150% lãi suất trong hạn, tuỳ quy định).

   ② PHẠT CHẬM TRẢ
      Có thể là số cố định hoặc phần trăm.

   ⚠ HAI CÁI BẪY PHÁP LÝ:

   · KHÔNG ĐƯỢC TÍNH LÃI QUÁ HẠN TRÊN TIỀN LÃI CHƯA TRẢ
     (đó là lãi chồng lãi — bị hạn chế hoặc cấm ở nhiều nơi)

   · TỔNG LÃI + PHẠT THƯỜNG CÓ TRẦN theo quy định pháp luật
     → phải kiểm tra trần này khi tính, không tính vô hạn
```

```text
   VÀ MỘT ĐIỀU VỀ VẬN HÀNH:

   NGÀY BẮT ĐẦU TÍNH QUÁ HẠN PHẢI RÕ RÀNG.

   Đến hạn ngày 15, khách trả ngày 16 lúc 23:50 — có tính quá hạn không?
   Nếu ngày 15 rơi vào chủ nhật thì sao?

   → Quy định "ngày làm việc kế tiếp" phải được ghi rõ và code đúng.
     Đây là nguồn khiếu nại phổ biến, và khách thường đúng.
```

## Cấu trúc dữ liệu nên có

```text
   BẢNG SẢN PHẨM VAY — mọi tham số tính lãi nằm ở đây, KHÔNG trong code:

      ma_san_pham
      phuong_phap_tinh_lai     -- DU_NO_BAN_DAU | DU_NO_GIAM_DAN | TRA_GOP_DEU
      quy_uoc_dem_ngay         -- 30/360 | ACT/365 | ACT/360 | ACT/ACT
      lai_suat_nam
      he_so_lai_qua_han        -- ví dụ 1.5
      quy_tac_lam_tron         -- XUONG | LEN | NGAN_HANG
      don_vi_lam_tron          -- 1 đồng, 1000 đồng...
      ky_an_han_ngay
      quy_tac_ngay_lam_viec    -- ngày đến hạn rơi vào ngày nghỉ thì sao

   BẢNG KHOẢN VAY — CHÉP LẠI các tham số này tại thời điểm giải ngân:

   ⚠ VÌ SAO PHẢI CHÉP CHỨ KHÔNG THAM CHIẾU:

   Sản phẩm đổi lãi suất ngày mai → khoản vay ký hôm nay
   VẪN PHẢI tính theo lãi suất hôm nay, suốt đời khoản vay.

   Nếu chỉ lưu khoá ngoại tới bảng sản phẩm, đổi sản phẩm sẽ
   làm sai lịch trả nợ của MỌI khoản vay cũ.
   → Đây là lỗi thiết kế nghiêm trọng và rất khó sửa sau khi đã chạy.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Nói "12%/năm" mà không nói cách tính | Lãi thật chênh **gần gấp đôi** — khách khiếu nại đúng | Luôn kèm phương pháp tính và **lãi suất thực** |
| Không công bố lãi suất thực | Vi phạm quy định, mất niềm tin | Tính APR gồm mọi phí bắt buộc |
| Hardcode quy ước đếm ngày | Mỗi sản phẩm một quy ước; sai 1,4% × triệu khoản vay | Lưu trong bảng sản phẩm |
| Nhầm thực tế/360 với thực tế/365 | Lệch ~1,4% tiền lãi | Kiểm tra kỹ, viết test cho từng quy ước |
| Làm tròn từng kỳ rồi không xử lý phần lẻ | Khoản vay **không bao giờ tất toán được** | Dồn phần lẻ vào kỳ cuối, kiểm tổng |
| Không kiểm tra tổng sau khi tạo lịch | Tạo ra khoản vay lệch từ đầu | Σ gốc = số tiền vay, không khớp thì từ chối |
| Tính lãi quá hạn trên cả tiền lãi | **Lãi chồng lãi** — bị hạn chế hoặc cấm | Chỉ tính trên gốc đến hạn chưa trả |
| Không áp trần tổng lãi và phạt | Vượt trần luật định | Kiểm tra trần mỗi lần tính |
| Không quy định ngày đến hạn rơi vào ngày nghỉ | Tính quá hạn oan → khiếu nại, và khách thường đúng | Quy tắc ngày làm việc, ghi rõ trong hợp đồng |
| Khoản vay tham chiếu tới bảng sản phẩm | Đổi sản phẩm làm **sai lịch trả nợ của mọi khoản vay cũ** | **Chép** tham số vào khoản vay lúc giải ngân |

## Tóm tắt bài 3

- **"12%/năm" là con số vô nghĩa nếu không nói rõ cách tính.** Lãi trên dư nợ ban đầu và lãi trên dư nợ giảm dần chênh nhau **gần gấp đôi**.
- Bốn cách tính: **dư nợ ban đầu**, **dư nợ giảm dần**, **trả góp đều**, **lãi kép** — cùng một con số công bố, bốn kết quả.
- Con số duy nhất so sánh được là **lãi suất thực (APR)**, và nó **phải gồm mọi phí bắt buộc** — vì mẹo phổ biến là chuyển lãi thành phí để con số công bố trông thấp.
- **Quy ước đếm ngày** tưởng nhỏ nhưng thực tế/360 cho lãi cao hơn thực tế/365 khoảng **1,4%** — nhân với số lượng khoản vay là con số lớn.
- Ba câu hỏi trước khi code: **tính trên dư nợ nào, quy ước đếm ngày gì, làm tròn ở đâu** — cả ba lấy từ hợp đồng, không tự quyết.
- **Dồn phần lẻ làm tròn vào kỳ cuối**, và **kiểm tra Σ gốc = số tiền vay** trước khi cho tạo khoản vay — nếu không sẽ có khoản vay không bao giờ tất toán được.
- Lãi quá hạn chỉ tính trên **gốc đến hạn chưa trả**, không tính trên tiền lãi (lãi chồng lãi bị hạn chế), và có **trần luật định**.
- Ngày đến hạn rơi vào ngày nghỉ phải có **quy tắc ngày làm việc** rõ ràng — đây là nguồn khiếu nại phổ biến và khách thường đúng.
- **Chép tham số sản phẩm vào khoản vay lúc giải ngân**, đừng tham chiếu — đổi sản phẩm không được làm sai lịch trả nợ của khoản vay cũ.

**Bài kế tiếp** → [Bài 4: Lịch trả nợ — dựng, sửa và những phép tính không được sai](04-lich-tra-no.md)

**Quay lại** → [Bài 2: Chấm điểm tín dụng](02-cham-diem-tin-dung.md)
