# Bài 3: Saga — điều phối luồng tiền qua nhiều dịch vụ

## Bài toán

```text
   MUA HÀNG TRẢ GÓP — MỘT GIAO DỊCH ĐI QUA BỐN DỊCH VỤ:

   ① Dịch vụ đơn hàng    : tạo đơn, giữ hàng
   ② Dịch vụ tín dụng    : thẩm định, phê duyệt khoản vay
   ③ Dịch vụ thanh toán  : giải ngân cho người bán
   ④ Dịch vụ kho         : xuất hàng, giao

   MỖI DỊCH VỤ CÓ DATABASE RIÊNG.
   → Không có transaction nào bao trùm được cả bốn.

   Nếu bước ④ lỗi sau khi ③ đã giải ngân thì sao?
   Tiền đã trả cho người bán, hàng không giao được, khoản vay đã tạo.
```

Transaction phân tán kiểu hai pha (2PC) về lý thuyết giải được bài toán này, nhưng thực tế **hầu như không ai dùng** cho hệ thống quy mô lớn: nó khoá tài nguyên ở mọi dịch vụ trong suốt giao dịch, và một dịch vụ chậm làm treo cả chuỗi.

**Saga** là cách làm thay thế: chia thành các bước cục bộ, mỗi bước có **hành động bù trừ** để đảo ngược khi cần.

## Nguyên tắc gốc: không đảo ngược, mà bù trừ

```text
   ❌ TƯ DUY TRANSACTION: rollback — như chưa từng xảy ra

   ✅ TƯ DUY SAGA: bù trừ — chuyện đã xảy ra, giờ làm một chuyện
                    ngược lại để cân bằng

   VÍ DỤ THỰC TẾ:
      Đã giải ngân 20 triệu cho người bán
      → KHÔNG "rollback" được, tiền đã đi
      → Phải yêu cầu hoàn lại, hoặc ghi nhận khoản phải thu

   → ĐÂY LÀ KHÁC BIỆT QUAN TRỌNG NHẤT VÀ HAY BỊ HIỂU SAI NHẤT.
     Hành động bù trừ để lại DẤU VẾT trong sổ sách, và đó là điều đúng —
     vì trong tài chính, mọi chuyện đã xảy ra đều phải ghi lại.
```

## Hai kiểu điều phối

```text
   ① VŨ ĐẠO  (choreography) — mỗi dịch vụ tự phản ứng với sự kiện

      Đơn hàng ──OrderCreated──► Tín dụng ──LoanApproved──► Thanh toán
                                                                │
                                              ──PaymentDone──► Kho

      ✅ Không có điểm tập trung
      ❌ KHÔNG AI BIẾT TOÀN BỘ LUỒNG ĐANG Ở ĐÂU
      ❌ Thêm một bước phải sửa nhiều dịch vụ
      ❌ Xử lý lỗi rải rác, rất khó lần

   ② NHẠC TRƯỞNG  (orchestration) — một bộ điều phối gọi từng bước

      ┌─────────────────────────────────┐
      │   BỘ ĐIỀU PHỐI (saga)           │
      │   biết TOÀN BỘ luồng và trạng thái│
      └───┬────────┬────────┬───────────┘
          ▼        ▼        ▼
        Đơn     Tín dụng  Thanh toán  ...

      ✅ Luồng nằm ở MỘT chỗ, đọc được, vẽ được
      ✅ Trạng thái tập trung → biết đang kẹt ở đâu
      ✅ Xử lý lỗi tập trung
      ❌ Bộ điều phối phải sẵn sàng cao

   → VỚI LUỒNG TIỀN, LUÔN CHỌN ②.
     Bạn cần biết chính xác một giao dịch đang ở bước nào,
     và cần một chỗ duy nhất để xử lý khi nó kẹt.
```

## Thiết kế các bước — mỗi bước hai nửa

```text
   MỖI BƯỚC TRONG SAGA PHẢI CÓ:
      · HÀNH ĐỘNG TIẾN
      · HÀNH ĐỘNG BÙ TRỪ

   ┌────┬────────────────────┬──────────────────────────────────┐
   │ #  │ Tiến               │ Bù trừ                            │
   ├────┼────────────────────┼──────────────────────────────────┤
   │ 1  │ Giữ hàng           │ Thả hàng                          │
   │ 2  │ Phê duyệt khoản vay│ Huỷ khoản vay (chưa giải ngân)   │
   │ 3  │ Giải ngân          │ Yêu cầu hoàn tiền + ghi phải thu │
   │ 4  │ Xuất kho, giao hàng│ Thu hồi hàng                      │
   └────┴────────────────────┴──────────────────────────────────┘

   ⚠ CHÚ Ý MỨC ĐỘ "KHÓ BÙ TRỪ" TĂNG DẦN TỪ TRÊN XUỐNG:

      Thả hàng      → dễ, tức thì, không mất gì
      Huỷ khoản vay → dễ, chỉ là bút toán
      Hoàn tiền     → KHÓ, cần đối tác hợp tác, mất phí, mất thời gian
      Thu hồi hàng  → RẤT KHÓ, có thể không thu hồi được

   → NGUYÊN TẮC SẮP XẾP: BƯỚC KHÓ BÙ TRỪ NHẤT ĐẶT CÀNG MUỘN CÀNG TỐT.
     Đặt giải ngân trước khi kiểm tra kho là thiết kế sai.
```

## Trạng thái saga phải nằm trong database

```sql
CREATE TABLE saga_instances (
    id              UUID PRIMARY KEY,
    saga_type       TEXT NOT NULL,
    reference_id    TEXT NOT NULL,
    current_step    INT NOT NULL,
    status          TEXT NOT NULL,   -- RUNNING|COMPENSATING|COMPLETED|FAILED
    payload         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (saga_type, reference_id)        -- ← chống chạy trùng saga
);

CREATE TABLE saga_steps (
    saga_id          UUID NOT NULL REFERENCES saga_instances(id),
    step_index       INT NOT NULL,
    step_name        TEXT NOT NULL,
    status           TEXT NOT NULL,  -- PENDING|DONE|FAILED|COMPENSATED
    idempotency_key  TEXT NOT NULL,  -- ← mỗi bước một mã (bài 2)
    request          JSONB,
    response         JSONB,
    attempts         INT NOT NULL DEFAULT 0,
    last_error       TEXT,
    executed_at      TIMESTAMPTZ,
    PRIMARY KEY (saga_id, step_index)
);
```

```text
   ⚠ VÌ SAO TRẠNG THÁI PHẢI Ở DATABASE, KHÔNG Ở BỘ NHỚ:

   Saga chạy trong nhiều giây tới nhiều giờ. Trong khoảng đó,
   pod có thể bị khởi động lại, deploy có thể diễn ra (case 8 phase 5).

   → Trạng thái trong bộ nhớ là trạng thái sẽ mất.
   → Phải có một job quét saga đang RUNNING mà lâu không tiến triển,
     và tiếp tục chúng.
```

## Bù trừ chạy ngược, và phải bất biến khi lặp

```java
public void chayBuTru(SagaInstance saga) {
    sagaDao.capNhatTrangThai(saga.getId(), "COMPENSATING");

    // Ngược từ bước cuối đã DONE về bước đầu
    var cacBuocDaLam = sagaStepDao.findDone(saga.getId());
    for (var buoc : Lists.reverse(cacBuocDaLam)) {
        try {
            buocDinhNghia(buoc).buTru(saga.getPayload(), buoc.getIdempotencyKey());
            sagaStepDao.capNhat(buoc, "COMPENSATED");
        } catch (Exception e) {
            // ⚠ BÙ TRỪ LỖI LÀ TÌNH HUỐNG NGHIÊM TRỌNG
            sagaStepDao.ghiLoi(buoc, e);
            alerting.canThiepThuCong(saga, buoc, e);
            return;    // DỪNG, không bỏ qua, không chạy tiếp
        }
    }
    sagaDao.capNhatTrangThai(saga.getId(), "FAILED");
}
```

```text
   ⚠ BA QUY TẮC VỀ HÀNH ĐỘNG BÙ TRỪ:

   ① PHẢI BẤT BIẾN KHI LẶP
      Bù trừ có thể chạy nhiều lần do thử lại. Hoàn tiền hai lần
      là tạo ra sự cố mới.

   ② KHÔNG ĐƯỢC THẤT BẠI VÌ LÝ DO NGHIỆP VỤ
      "Không thả hàng được vì hàng đã bán cho người khác" là
      thiết kế sai — phải giữ hàng cho tới khi saga kết thúc.

   ③ THẤT BẠI KHI BÙ TRỪ PHẢI DỪNG VÀ BÁO NGƯỜI
      Đây là tình huống hệ thống KHÔNG tự giải quyết được.
      Bỏ qua và chạy tiếp sẽ để lại trạng thái không nhất quán
      mà không ai biết.
```

## Bước không bù trừ được — thiết kế lại thay vì chấp nhận

```text
   MỘT SỐ HÀNH ĐỘNG KHÔNG THỂ ĐẢO NGƯỢC:
      · Đã gửi email/tin nhắn cho khách
      · Đã chuyển tiền qua kênh không thu hồi được (phase 2 bài 2)
      · Đã giao hàng tận tay

   BỐN CÁCH XỬ LÝ:

   ① ĐẶT Ở BƯỚC CUỐI CÙNG
      Nếu nó là bước cuối thì không bao giờ cần bù trừ.
      → Cách đơn giản và hiệu quả nhất.

   ② TÁCH THÀNH HAI PHA: GIỮ CHỖ RỒI XÁC NHẬN
      Thay vì "chuyển tiền" → "giữ tiền" rồi "xác nhận chuyển"
      Giữ tiền thì thả được; chuyển rồi thì không.
      → Đây chính là mô hình cấp phép/ghi nhận của thẻ (phase 2 bài 3).

   ③ HOÃN LẠI TỚI KHI CHẮC CHẮN
      Gửi thông báo cho khách chỉ sau khi saga đã COMPLETED.

   ④ CHẤP NHẬN VÀ BÙ BẰNG CÁCH KHÁC
      Ghi nhận khoản phải thu, xử lý bằng quy trình thủ công.
      → Chỉ dùng khi ba cách trên không áp dụng được.
```

## Xử lý thất bại giữa chừng — bốn tình huống

```text
   ① BƯỚC LỖI RÕ RÀNG (từ chối, không đủ điều kiện)
      → Chạy bù trừ ngay.

   ② BƯỚC TIMEOUT — KHÔNG BIẾT THÀNH HAY BẠI  ← khó nhất
      → KHÔNG được coi là thất bại (case 2 phase 5)
      → Truy vấn trạng thái theo lịch
      → Chỉ khi xác định được mới quyết định tiến hay bù

   ③ BỘ ĐIỀU PHỐI CHẾT GIỮA CHỪNG
      → Job quét saga treo, đọc trạng thái từ database, tiếp tục

   ④ BÙ TRỪ THẤT BẠI
      → Dừng, báo người, KHÔNG tự động xử lý tiếp
```

```sql
-- Job quét saga treo, chạy mỗi phút
SELECT id, saga_type, reference_id, current_step, status,
       now() - updated_at AS treo_bao_lau
FROM saga_instances
WHERE status IN ('RUNNING','COMPENSATING')
  AND updated_at < now() - interval '5 minutes'
ORDER BY updated_at;
```

```text
   ⚠ TÌNH HUỐNG ② LÀ LÝ DO SAGA CẦN TRẠNG THÁI "KHÔNG XÁC ĐỊNH"
     Ở CẤP BƯỚC, giống hệt luồng chuyển tiền.

   Không có nó, bộ điều phối phải đoán, và đoán sai theo chiều nào
   cũng dẫn tới mất tiền.
```

## Nhất quán cuối cùng — phải nói rõ với nghiệp vụ

```text
   SAGA KHÔNG CHO NHẤT QUÁN TỨC THỜI.

   Trong khoảng thời gian saga đang chạy, hệ thống ở trạng thái
   TẠM THỜI KHÔNG NHẤT QUÁN:
      · Khoản vay đã tạo nhưng chưa giải ngân
      · Hàng đã giữ nhưng đơn chưa hoàn tất
      · Tiền đã trừ nhưng chưa tới người bán

   → PHẢI THIẾT KẾ GIAO DIỆN VÀ BÁO CÁO CHO TRẠNG THÁI TRUNG GIAN NÀY.

   ❌ Hiện "Thành công" khi saga mới ở bước 2/4
   ❌ Báo cáo doanh thu đếm cả đơn đang xử lý dở
   ✅ Trạng thái "Đang xử lý" rõ ràng, có mốc thời gian dự kiến
   ✅ Báo cáo tách riêng phần đang xử lý
```

## Kiểm chứng saga

```java
@Test
void buoc_ba_loi_thi_hai_buoc_dau_phai_duoc_bu_tru() {
    when(paymentService.giaiNgan(any(), any()))
        .thenThrow(new PaymentDeclined("Tài khoản người bán bị khoá"));

    var ketQua = sagaOrchestrator.chay(taoDonTraGop());

    assertThat(ketQua.status()).isEqualTo(FAILED);
    verify(inventoryService).thaHang(any(), any());      // bù trừ bước 1
    verify(creditService).huyKhoanVay(any(), any());     // bù trừ bước 2
    verify(warehouseService, never()).xuatKho(any());    // bước 4 chưa chạy
    assertThat(soDuNguoiBan()).isEqualTo(soDuBanDau);    // tiền không đổi
}

@Test
void bo_dieu_phoi_chet_giua_chung_thi_saga_duoc_tiep_tuc() {
    var sagaId = sagaOrchestrator.batDau(taoDonTraGop());
    moPhongPodChet(sauBuoc = 2);

    sagaRecoveryJob.chay();                              // job quét saga treo

    assertThat(laySaga(sagaId).status()).isIn(COMPLETED, FAILED);
    assertThat(laySaga(sagaId).status()).isNotEqualTo(RUNNING);
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng kiểu vũ đạo cho luồng tiền | **Không ai biết giao dịch đang ở đâu** | Kiểu nhạc trưởng, trạng thái tập trung |
| Trạng thái saga trong bộ nhớ | Pod chết là mất, saga treo vĩnh viễn | Trạng thái ở database + job quét |
| Đặt bước khó bù trừ ở đầu luồng | Phải hoàn tiền, thu hồi hàng thường xuyên | Bước khó bù trừ đặt **càng muộn càng tốt** |
| Bù trừ không bất biến khi lặp | **Hoàn tiền hai lần** | Mã chống trùng cho cả hành động bù trừ |
| Bù trừ thất bại thì bỏ qua chạy tiếp | Trạng thái không nhất quán mà không ai biết | **Dừng và báo người** |
| Bù trừ có thể thất bại vì nghiệp vụ | "Không thả hàng được vì đã bán" | Giữ tài nguyên tới khi saga kết thúc |
| Coi timeout của một bước là thất bại | Bù trừ nhầm trong khi bước đó đã thành công | Trạng thái "không xác định" ở cấp bước |
| Không có job quét saga treo | Saga kẹt vĩnh viễn không ai biết | Job chạy mỗi phút, cảnh báo theo tuổi |
| Hiện "Thành công" khi saga chưa xong | Khách hiểu sai, báo cáo sai | Trạng thái trung gian rõ ràng |
| Không giới hạn số lần thử lại một bước | Thử lại vô hạn với lỗi vĩnh viễn | Giới hạn số lần, sau đó chuyển sang bù trừ |
| Không có `UNIQUE (saga_type, reference_id)` | Hai saga cùng chạy cho một đơn | Ràng buộc ở database |

## Tóm tắt bài 3

- Saga thay cho transaction phân tán: chia thành **các bước cục bộ, mỗi bước có hành động bù trừ**.
- **Không đảo ngược, mà bù trừ** — chuyện đã xảy ra thì làm chuyện ngược lại để cân bằng, và dấu vết đó là đúng trong tài chính.
- **Luôn dùng kiểu nhạc trưởng cho luồng tiền** — bạn cần biết giao dịch đang ở bước nào và cần một chỗ duy nhất để xử lý khi kẹt.
- **Sắp xếp bước khó bù trừ nhất về cuối.** Đặt giải ngân trước khi kiểm tra kho là thiết kế sai.
- **Trạng thái saga phải ở database**, kèm **job quét saga treo** — pod chết giữa chừng là chuyện bình thường.
- Ba quy tắc bù trừ: **bất biến khi lặp**, **không được thất bại vì lý do nghiệp vụ**, và **thất bại thì dừng lại báo người**.
- Bước không bù trừ được: **đặt ở cuối**, hoặc **tách thành giữ chỗ rồi xác nhận**, hoặc **hoãn tới khi chắc chắn**.
- **Timeout của một bước không phải thất bại** — cần trạng thái "không xác định" ở cấp bước, giống luồng chuyển tiền.
- Saga cho **nhất quán cuối cùng**, nên phải thiết kế giao diện và báo cáo cho **trạng thái trung gian**, không hiện "thành công" quá sớm.

**Bài kế tiếp** → [Bài 4: Đối soát tự động](04-doi-soat-tu-dong.md)

**Quay lại** → [Bài 2: Idempotency](02-idempotency.md)
