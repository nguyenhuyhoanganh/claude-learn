# Case 3: Số dư âm

## Triệu chứng

```text
   Báo cáo cuối ngày:

   ví_id   │ số_dư
   ────────┼──────────────
   88421   │  −3.450.000
   91002   │    −890.000
   77315   │ −12.000.000
   ...     │
   (47 ví có số dư âm, tổng −184.000.000)

   Sản phẩm KHÔNG có tính năng thấu chi.
   Số dư âm là điều KHÔNG ĐƯỢC PHÉP TỒN TẠI.
```

Số dư âm luôn có nghĩa: **khách đã tiêu tiền không có thật**, và số tiền đó công ty đang gánh.

## Chẩn đoán

```sql
-- BƯỚC 1: dựng lại lịch sử của một ví bị âm
SELECT created_at, entry_type, amount_minor,
       sum(amount_minor) OVER (ORDER BY created_at, id) AS so_du_chay,
       reference_id, description
FROM wallet_entries
WHERE wallet_id = 88421
ORDER BY created_at, id;
```

```text
   created_at | entry_type | amount     | so_du_chay | reference
   -----------+------------+------------+------------+-----------
   10:00:01   | TOPUP      | +5.000.000 |  5.000.000 | NAP-201
   14:22:07   | PAYMENT    | −4.800.000 |    200.000 | TT-9910
   14:22:07   | PAYMENT    | −3.650.000 | −3.450.000 | TT-9911
                                            ▲            ▲
                        SỐ DƯ ÂM Ở ĐÂY   HAI GIAO DỊCH CÙNG GIÂY

   → Hai lệnh thanh toán chạy ĐỒNG THỜI, cả hai cùng đọc số dư 5.000.000,
     cả hai cùng thấy "đủ tiền", cả hai cùng ghi.
```

```text
   BƯỚC 2: PHÂN LOẠI NGUYÊN NHÂN — bốn khả năng

   ① ĐUA ĐIỀU KIỆN (race condition)          ← trường hợp trên
      Hai giao dịch cùng đọc số dư rồi cùng ghi.

   ② KIỂM TRA SỐ DƯ SAI CHỖ
      Kiểm ở tầng ứng dụng, không kiểm trong cùng transaction với ghi.

   ③ THỨ TỰ GHI SAI
      Chi tiền trước, trừ số dư sau. Bước sau lỗi thì tiền đã ra.

   ④ HOÀN TIỀN/ĐIỀU CHỈNH ÂM VƯỢT SỐ DƯ
      Thu hồi một khoản khuyến mãi đã bị tiêu hết.
```

## Vì sao kiểm tra ở tầng ứng dụng không đủ

```text
   ❌ MÃ NGUỒN TRÔNG RẤT ĐÚNG NHƯNG SAI:

      var soDu = walletRepo.getBalance(viId);        // đọc: 5.000.000
      if (soDu < soTien) throw new KhongDuTien();    // 5tr >= 4,8tr → qua
      walletRepo.debit(viId, soTien);                // ghi

      LUỒNG A            LUỒNG B
      đọc 5.000.000
                         đọc 5.000.000     ← cùng thấy 5 triệu
      kiểm tra: đủ
                         kiểm tra: đủ
      ghi −4.800.000
                         ghi −3.650.000
      → SỐ DƯ ÂM

   ⚠ KHOẢNG THỜI GIAN GIỮA "ĐỌC" VÀ "GHI" LÀ CHỖ SỰ CỐ CHUI VÀO.
     Dù khoảng đó chỉ vài mili giây.
```

## Bốn cách sửa, từ yếu tới mạnh

```sql
-- ① RÀNG BUỘC Ở TẦNG DATABASE — LỚP KHÔNG THỂ VÒNG QUA
ALTER TABLE wallets ADD CONSTRAINT chk_balance_non_negative
    CHECK (balance_minor >= 0);
-- → Mọi đường ghi, kể cả SQL chạy tay, đều bị chặn.
```

```sql
-- ② TRỪ TIỀN CÓ ĐIỀU KIỆN — một câu lệnh, không có khoảng hở
UPDATE wallets
SET balance_minor = balance_minor - :so_tien
WHERE id = :vi_id
  AND balance_minor >= :so_tien;          -- ← điều kiện NẰM TRONG câu ghi

-- Kiểm số dòng bị ảnh hưởng:
--   1 → thành công
--   0 → không đủ tiền, KHÔNG có gì bị ghi
```

```sql
-- ③ KHOÁ DÒNG TRONG TRANSACTION khi cần đọc rồi mới quyết định
BEGIN;
SELECT balance_minor FROM wallets WHERE id = :vi_id FOR UPDATE;
-- ... logic phức tạp hơn ...
UPDATE wallets SET balance_minor = balance_minor - :so_tien WHERE id = :vi_id;
COMMIT;
-- ⚠ Giữ khoá càng ngắn càng tốt; không gọi API bên ngoài khi đang giữ khoá
```

```text
   ④ MÔ HÌNH SỔ CÁI CHỈ-GHI-THÊM
      Không lưu cột số dư. Số dư = tổng các bút toán.
      → Không có "đọc rồi ghi", nên không có đua điều kiện ở cột số dư.
      ⚠ Nhưng vẫn cần kiểm tra đủ tiền, và tính tổng mỗi lần thì chậm
        → thường kết hợp: sổ cái chỉ-ghi-thêm + cột số dư đệm có ràng buộc.
```

```text
   ⚠ DÙNG ĐỒNG THỜI ① VÀ ②.

   ② xử lý đúng trường hợp bình thường (trả lỗi đẹp cho khách).
   ① là lưới an toàn cuối cùng cho mọi đường ghi khác:
      job nền, script vận hành, dịch vụ khác, công cụ quản trị.
```

## Thứ tự thao tác — nguyên tắc bất di bất dịch

```text
   ❌ SAI:  chi tiền ra → trừ số dư
            Bước hai lỗi = tiền đã ra mà số dư chưa trừ.

   ✅ ĐÚNG: trừ số dư (có ràng buộc) → chi tiền ra
            Bước hai lỗi = ghi bút toán đảo, hoàn lại số dư.

   NGUYÊN TẮC CHUNG:
      LUÔN LÀM THAO TÁC CÓ THỂ ĐẢO NGƯỢC TRƯỚC,
      THAO TÁC KHÔNG ĐẢO NGƯỢC ĐƯỢC SAU CÙNG.

   Trừ số dư đảo được. Chuyển tiền ra ngoài thì không.
```

## Xử lý ngay khi đã có số dư âm

```text
   ① DỪNG NGUỒN GÂY RA TRƯỚC
      Bật ràng buộc database ngay, kể cả khi chưa sửa xong code.
      → Ngăn thêm ca mới trong lúc điều tra.

   ② PHÂN LOẠI 47 VÍ ÂM
      · Do lỗi hệ thống  → công ty chịu, ghi vào chi phí
      · Do khách cố ý khai thác → thu hồi, có thể khoá tài khoản
      → Phân biệt bằng cách xem có mẫu lặp lại không:
        một khách tạo 30 giao dịch đồng thời là cố ý, không phải tình cờ.

   ③ GHI SỔ ĐÚNG
      Không được "đặt lại số dư về 0" bằng UPDATE.
      Phải ghi bút toán:
         Nợ  "Chi phí tổn thất vận hành"   184.000.000
         Có  "Ví khách hàng"               184.000.000
      → Sổ cân, và có dấu vết giải trình được.

   ④ LIÊN HỆ KHÁCH nếu quyết định thu hồi
```

```text
   ⚠ ĐIỂM ③ RẤT QUAN TRỌNG:

   Nhiều đội xử lý bằng cách chạy UPDATE đặt số dư về 0.
   → Tiền biến mất khỏi sổ mà không có nguồn.
   → Sổ cái mất cân đối, và thanh tra sẽ hỏi 184 triệu đó đi đâu.
```

## Chặn tái diễn

```text
   ① RÀNG BUỘC CHECK Ở DATABASE — bắt buộc, không có ngoại lệ

   ② TRỪ TIỀN LUÔN DÙNG UPDATE CÓ ĐIỀU KIỆN

   ③ TEST ĐỒNG THỜI TRONG CI
      Bắn 50 lệnh thanh toán song song trên cùng một ví có 100.000 đ,
      khẳng định đúng một lệnh thành công và số dư không âm.
      → Test này bắt được lỗi mà test tuần tự không bao giờ bắt được.

   ④ KIỂM TRA HẰNG NGÀY
      SELECT count(*) FROM wallets WHERE balance_minor < 0;
      → Phải bằng 0. Khác 0 là cảnh báo mức cao nhất.

   ⑤ KIỂM TRA TỔNG THỂ
      Σ số dư mọi ví = số dư tài khoản đảm bảo tại ngân hàng
      → Bắt được cả những lỗi mà kiểm tra từng ví bỏ sót.
```

```java
@Test
void năm_mươi_lệnh_đồng_thời_khong_lam_am_so_du() throws Exception {
    Long viId = taoVi(100_000);
    var pool = Executors.newFixedThreadPool(50);
    var latch = new CountDownLatch(1);
    var thanhCong = new AtomicInteger();

    for (int i = 0; i < 50; i++) {
        pool.submit(() -> {
            latch.await();                        // bắn cùng lúc
            if (viService.thanhToan(viId, 100_000)) thanhCong.incrementAndGet();
            return null;
        });
    }
    latch.countDown();
    pool.shutdown();
    pool.awaitTermination(30, SECONDS);

    assertThat(thanhCong.get()).isEqualTo(1);
    assertThat(laySoDu(viId)).isZero();
}
```

## Bài học

```text
   ① SỐ DƯ ÂM LUÔN CÓ NGHĨA LÀ TIỀN THẬT ĐÃ MẤT.
      Không phải lỗi hiển thị.

   ② KIỂM TRA Ở TẦNG ỨNG DỤNG KHÔNG BAO GIỜ ĐỦ.
      Khoảng hở giữa "đọc" và "ghi" là chỗ sự cố chui vào.

   ③ RÀNG BUỘC Ở DATABASE LÀ LỚP DUY NHẤT KHÔNG THỂ VÒNG QUA.
      Nó chặn được cả job nền, script vận hành và công cụ quản trị.

   ④ LÀM THAO TÁC ĐẢO NGƯỢC ĐƯỢC TRƯỚC, KHÔNG ĐẢO NGƯỢC ĐƯỢC SAU.

   ⑤ TEST TUẦN TỰ KHÔNG BAO GIỜ BẮT ĐƯỢC LỖI ĐUA ĐIỀU KIỆN.
      Phải có test đồng thời trong CI.

   ⑥ SỬA SỐ DƯ BẰNG UPDATE LÀ LÀM HỎNG SỔ CÁI.
      Luôn ghi bút toán có nguồn.
```

**Bài kế tiếp** → [Case 4: Lệch sổ cái](04-lech-so-cai.md)

**Quay lại** → [Case 2: Tiền đi không tới](02-tien-di-khong-toi.md)
