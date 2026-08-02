# Case 5: Đối soát lệch không giải thích được

## Triệu chứng

```text
   Đối soát ngày 15/07 với cổng thanh toán:

   Hệ thống của bạn : 8.412 giao dịch, tổng 2.104.300.000 đ
   File của cổng    : 8.409 giao dịch, tổng 2.098.750.000 đ
   ──────────────────────────────────────────────────────────
   Lệch             :     3 giao dịch,       5.550.000 đ

   Đội vận hành đã đối soát ba ngày, không tìm ra 3 giao dịch nào.
   Con số lệch thì khớp, nhưng không ghép được từng dòng.
```

Đối soát lệch là chuyện **bình thường**. Đối soát lệch mà **không giải thích được từng đồng** mới là sự cố.

## Chẩn đoán — bốn nhóm, xử lý theo thứ tự ưu tiên

```sql
-- Ghép hai bên theo mã giao dịch của cổng
SELECT
  coalesce(a.psp_txn_id, b.psp_txn_id) AS ma_gd,
  a.amount_minor  AS ben_minh,
  b.amount_minor  AS ben_cong,
  CASE
    WHEN b.psp_txn_id IS NULL THEN 'CHỈ MÌNH CÓ'
    WHEN a.psp_txn_id IS NULL THEN 'CHỈ CỔNG CÓ'
    WHEN a.amount_minor <> b.amount_minor THEN 'LỆCH SỐ TIỀN'
    ELSE 'KHỚP'
  END AS nhom
FROM our_transactions a
FULL OUTER JOIN psp_statement b ON a.psp_txn_id = b.psp_txn_id
WHERE coalesce(a.settled_date, b.settled_date) = DATE '2026-07-15';
```

```text
   ┌─────────────────┬──────────────────────────────────────────────────┐
   │ NHÓM            │ Ý NGHĨA VÀ MỨC ƯU TIÊN                            │
   ├─────────────────┼──────────────────────────────────────────────────┤
   │ CHỈ CỔNG CÓ     │ ⚠ ƯU TIÊN SỐ MỘT — XỬ LÝ TRONG NGÀY              │
   │                 │ KHÁCH ĐÃ TRẢ TIỀN MÀ KHÔNG NHẬN ĐƯỢC HÀNG        │
   │                 │ Để lâu → khiếu nại → tranh chấp → thua chắc      │
   ├─────────────────┼──────────────────────────────────────────────────┤
   │ CHỈ MÌNH CÓ     │ Ghi nhận nhầm, hoặc chưa tới ngày quyết toán     │
   │                 │ Quá 2 ngày vẫn không có → huỷ ghi nhận           │
   ├─────────────────┼──────────────────────────────────────────────────┤
   │ LỆCH SỐ TIỀN    │ Ghi nhận một phần, phí, hoặc lỗi thật            │
   ├─────────────────┼──────────────────────────────────────────────────┤
   │ KHỚP            │ Đánh dấu đã đối soát                             │
   └─────────────────┴──────────────────────────────────────────────────┘
```

## Vì sao không ghép được — sáu nguyên nhân kỹ thuật

```text
   ① GHÉP SAI KHOÁ
      Ghép theo mã đơn hàng thay vì mã giao dịch của cổng.
      Một đơn có nhiều lần thử → ghép ra nhiều-nhiều, số không khớp.
      → LUÔN ghép theo mã giao dịch của cổng, đó là khoá duy nhất.

   ② LỆCH MÚI GIỜ / GIỜ CHỐT SỔ
      Cổng chốt sổ 23:00 giờ của họ, bạn tính theo 00:00 giờ Việt Nam.
      → Giao dịch lúc 23:30 nằm ở ngày khác nhau giữa hai bên.
      → ĐÂY LÀ NGUYÊN NHÂN PHỔ BIẾN NHẤT của "lệch vài giao dịch".

   ③ SO SỐ RÒNG VỚI SỐ GỘP
      Cổng trả file theo số đã trừ phí, bạn so với số khách trả.
      → Lệch đúng bằng tổng phí, ngày nào cũng lệch.

   ④ ĐƠN VỊ TIỀN KHÁC NHAU
      File ghi "45000.00" (đồng), hệ thống lưu 45000 (đồng)
      hoặc 4500000 (xu). Đọc sai là lệch 100 lần.

   ⑤ GIAO DỊCH HOÀN TIỀN ĐỂ CÙNG BẢNG VỚI GIAO DỊCH THU
      Cổng để hoàn tiền là số âm, bạn để ở bảng riêng.
      → Tổng không bao giờ khớp.

   ⑥ FILE TẢI VỀ CHƯA ĐẦY ĐỦ
      Cổng phát hành file lúc 06:00 nhưng bổ sung lúc 09:00.
      Tải lúc 07:00 là thiếu dòng.
```

```text
   ⚠ LOẠI TRỪ ②③④⑤⑥ TRƯỚC KHI KẾT LUẬN "MẤT GIAO DỊCH".

   Ba ngày đối soát ở đầu bài rất có thể là do nguyên nhân ②:
   ba giao dịch lúc gần nửa đêm nằm ở file ngày hôm sau.
```

## Cách xác nhận nhanh nguyên nhân ②

```sql
-- Mở rộng cửa sổ ghép ra ±1 ngày rồi xem lệch còn không
SELECT count(*) AS con_lech
FROM our_transactions a
LEFT JOIN psp_statement b
       ON a.psp_txn_id = b.psp_txn_id
      AND b.settled_date BETWEEN DATE '2026-07-14' AND DATE '2026-07-16'
WHERE a.settled_date = DATE '2026-07-15'
  AND b.psp_txn_id IS NULL;
-- Nếu con_lech = 0 → chỉ là lệch ngày, KHÔNG mất giao dịch nào
```

```text
   → NẾU ĐÂY LÀ NGUYÊN NHÂN, CÁCH SỬA KHÔNG PHẢI LÀ MỞ RỘNG CỬA SỔ MÃI MÃI.

   Cách sửa đúng: ĐỐI SOÁT THEO GIỜ CHỐT SỔ CỦA CỔNG, không theo ngày lịch.
   Lưu giờ chốt sổ và múi giờ của từng đối tác vào cấu hình.
```

## Xử lý nhóm "chỉ cổng có" — nhóm nguy hiểm nhất

```text
   KHÁCH ĐÃ TRẢ TIỀN. HỆ THỐNG BẠN KHÔNG BIẾT. HÀNG CHƯA GIAO.

   ① TÌM ĐƠN HÀNG TƯƠNG ỨNG
      Dùng mã đơn trong file của cổng (nếu bạn có gửi sang).
      → Đây là lý do phải LUÔN gửi mã đơn của mình sang cổng.

   ② XÁC ĐỊNH VÌ SAO KHÔNG ĐƯỢC GHI NHẬN
      · Webhook mất?          → xem log nhận webhook
      · Webhook tới nhưng lỗi? → xem log xử lý
      · Đơn bị huỷ trước đó?   → xem lịch sử trạng thái đơn

   ③ GHI NHẬN BỔ SUNG và tiếp tục luồng đơn hàng bình thường

   ④ LIÊN HỆ KHÁCH nếu đã quá lâu — chủ động, đừng đợi họ gọi
```

```text
   ⚠ NẾU ĐƠN ĐÃ BỊ HUỶ VÌ "KHÔNG THANH TOÁN":

   Khách trả tiền, hệ thống không nhận được, tự huỷ đơn sau 15 phút,
   giải phóng hàng cho người khác mua.
   → Giờ bạn có tiền của khách mà không có hàng.

   → Phải HOÀN TIỀN chủ động và xin lỗi, không đợi khách phát hiện.
   → Và phải xem lại thời gian tự huỷ đơn: 15 phút là quá ngắn
     nếu webhook có thể tới muộn.
```

## Ba con số phải khớp, không phải một

```text
   ① TỔNG THU
      Σ giao dịch thành công bên mình = Σ bên cổng

   ② TỔNG HOÀN
      Σ khoản hoàn bên mình = Σ bên cổng

   ③ TIỀN THẬT VỀ TÀI KHOẢN NGÂN HÀNG
      Số dư tăng thật = ① − ② − phí − phần giữ lại

   ⚠ CON SỐ ③ LÀ CON SỐ CUỐI CÙNG VÀ QUAN TRỌNG NHẤT.

   ① và ② khớp mà ③ lệch nghĩa là bạn hiểu sai cấu trúc phí
   hoặc chính sách giữ lại của đối tác.
   → Đây là loại lệch tồn tại nhiều tháng mà không ai để ý,
     vì hai con số đầu vẫn "xanh".
```

## Chặn tái diễn

```text
   ① ĐỐI SOÁT TỰ ĐỘNG HẰNG NGÀY, KHÔNG PHẢI HẰNG THÁNG
      Lệch một ngày dễ tìm. Lệch của 30 ngày gộp lại thì gần như không.

   ② GHÉP THEO MÃ GIAO DỊCH CỦA CỔNG, ghép theo giờ chốt sổ của họ

   ③ LƯU CẢ HAI MÃ trong mọi bản ghi: mã của mình và mã của cổng

   ④ MÀN HÌNH ĐỐI SOÁT cho đội vận hành
      Hiện bốn nhóm, cho phép đánh dấu đã xử lý, ghi lý do.
      → Không có màn hình này thì mọi cuộc đối soát đều làm trên Excel,
        và không lưu lại được kết luận.

   ⑤ CHỈ SỐ THEO DÕI
      · Số dòng chưa đối soát được, theo tuổi
      · Số ngày liên tiếp đối soát khớp hoàn toàn
      · Thời gian trung bình từ lúc phát hiện tới lúc đóng

   ⑥ NGƯỠNG CHẤP NHẬN PHẢI CÓ CƠ SỞ
      "Lệch dưới 0,01% thì bỏ qua" chỉ được phép nếu đã hiểu
      nguyên nhân của phần lệch đó (ví dụ làm tròn).
      → Bỏ qua lệch không hiểu nguyên nhân là cách để lệch lớn dần.
```

## Bài học

```text
   ① ĐỐI SOÁT LỆCH LÀ BÌNH THƯỜNG.
      LỆCH KHÔNG GIẢI THÍCH ĐƯỢC MỚI LÀ SỰ CỐ.

   ② PHẦN LỚN "LỆCH" LÀ VẤN ĐỀ GHÉP DỮ LIỆU, KHÔNG PHẢI MẤT TIỀN.
      Loại trừ múi giờ, số gộp/ròng, đơn vị tiền trước khi báo động.

   ③ LỆCH MÚI GIỜ VÀ GIỜ CHỐT SỔ LÀ NGUYÊN NHÂN PHỔ BIẾN NHẤT.
      Đối soát theo giờ chốt sổ của đối tác, không theo ngày lịch.

   ④ NHÓM "CỔNG CÓ, MÌNH KHÔNG CÓ" PHẢI XỬ LÝ TRONG NGÀY.
      Đó là khách đã trả tiền mà chưa nhận được hàng.

   ⑤ BA CON SỐ PHẢI KHỚP, VÀ CON SỐ THỨ BA HAY BỊ BỎ QUA NHẤT.

   ⑥ ĐỐI SOÁT HẰNG NGÀY. Lệch một ngày tìm được; lệch một tháng thì không.
```

**Bài kế tiếp** → [Case 6: Job chạy hai lần](06-job-chay-hai-lan.md)

**Quay lại** → [Case 4: Lệch sổ cái](04-lech-so-cai.md)
