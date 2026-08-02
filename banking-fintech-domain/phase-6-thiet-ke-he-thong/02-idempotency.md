# Bài 2: Idempotency — nền tảng của mọi luồng tiền

## Vì sao đây là khái niệm quan trọng nhất phase này

Nhìn lại 10 case ở phase 5:

```text
   Case 1  Trừ tiền hai lần        → thiếu mã chống trùng
   Case 2  Tiền đi không tới       → thử lại khi chưa kết luận
   Case 6  Job chạy hai lần        → job không bất biến khi lặp
   Case 7  Webhook mất             → webhook gửi lại gây xử lý trùng

   BỐN TRONG MƯỜI CASE CÓ CÙNG MỘT NGUYÊN NHÂN GỐC.
```

**Idempotency** — tính bất biến khi lặp — nghĩa là: **thực hiện một thao tác nhiều lần cho kết quả giống hệt như thực hiện một lần**.

Trong hệ thống phân tán, bạn **không thể đảm bảo mỗi thông điệp được xử lý đúng một lần**. Mạng đứt, tiến trình chết, đối tác gửi lại. Điều duy nhất làm được là **khiến việc lặp lại trở nên vô hại**.

## Ba mức đảm bảo và vì sao chỉ có một lựa chọn thật

```text
   ① NHIỀU NHẤT MỘT LẦN  (at-most-once)
      Gửi đi, không thử lại. Mất thì thôi.
      → Không chấp nhận được với tiền.

   ② ÍT NHẤT MỘT LẦN  (at-least-once)
      Thử lại tới khi chắc chắn tới nơi. Có thể tới nhiều lần.
      → Đây là thứ hệ thống thật cung cấp được.

   ③ ĐÚNG MỘT LẦN  (exactly-once)
      → KHÔNG TỒN TẠI ở tầng truyền tin trong hệ thống phân tán.

   ⚠ ĐIỀU MÀ NGƯỜI TA GỌI LÀ "EXACTLY-ONCE" THỰC RA LÀ:
        ÍT NHẤT MỘT LẦN  +  XỬ LÝ BẤT BIẾN KHI LẶP

   → Bạn không làm cho thông điệp đến đúng một lần.
     Bạn làm cho việc nó đến nhiều lần không gây hại.
```

## Ba cách đạt được tính bất biến khi lặp

### ① Khoá tự nhiên — mạnh nhất, dùng khi có thể

```text
   NẾU BẢN THÂN NGHIỆP VỤ ĐÃ CÓ MỘT KHOÁ DUY NHẤT,
   DÙNG NÓ LÀM RÀNG BUỘC.

   Ví dụ: mỗi tài khoản chỉ được trả lãi MỘT LẦN cho MỘT kỳ.

      CREATE UNIQUE INDEX uq_interest
          ON journal_entries (reference_type, reference_id, entry_type, business_date);

   → Không cần sinh mã gì cả. Nghiệp vụ tự nó đã chống trùng.
   → Đây là cách sạch nhất, dùng được thì luôn ưu tiên.
```

### ② Mã chống trùng do client sinh

```text
   DÙNG KHI KHÔNG CÓ KHOÁ TỰ NHIÊN — ví dụ khách bấm "Chuyển tiền"
   hai lần với cùng số tiền tới cùng người nhận, nhưng thật sự
   muốn chuyển hai lần.

   → Chỉ client biết đó là MỘT ý định hay HAI ý định.
```

```text
   LUỒNG ĐÚNG:

   ① Client sinh mã DUY NHẤT cho MỘT Ý ĐỊNH (không phải mỗi lần gửi)
      Ví dụ: sinh khi người dùng mở màn hình xác nhận

   ② Gửi kèm mã đó trong header hoặc body

   ③ Server:
        · Chưa thấy mã này  → xử lý, LƯU kết quả kèm mã
        · Đã thấy, đã xong  → TRẢ LẠI KẾT QUẢ CŨ, không xử lý lại
        · Đã thấy, đang xử lý → trả 409, bảo client chờ

   ④ Client thử lại → GỬI LẠI Y NGUYÊN MÃ CŨ

   ⚠ BƯỚC ④ LÀ CHỖ SAI PHỔ BIẾN NHẤT.
     Sinh mã mới cho mỗi lần thử lại = mã chống trùng vô tác dụng.
     Đây là lỗi triển khai gặp ở hầu hết dự án lần đầu làm.
```

```sql
CREATE TABLE idempotency_records (
    idempotency_key  TEXT PRIMARY KEY,
    request_hash     TEXT NOT NULL,        -- băm của nội dung yêu cầu
    status           TEXT NOT NULL,        -- IN_PROGRESS | COMPLETED | FAILED
    response_body    JSONB,
    response_status  INT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ NOT NULL
);
```

```java
public <T> T thucHien(String key, String requestHash, Supplier<T> xuLy) {
    // Giành quyền xử lý — chỉ một luồng thắng
    int giành = jdbc.update("""
        INSERT INTO idempotency_records (idempotency_key, request_hash, status, expires_at)
        VALUES (?, ?, 'IN_PROGRESS', now() + interval '24 hours')
        ON CONFLICT (idempotency_key) DO NOTHING
        """, key, requestHash);

    if (giành == 0) {
        var cu = layBanGhi(key);

        // ⚠ KIỂM TRA NỘI DUNG CÓ GIỐNG KHÔNG
        if (!cu.requestHash().equals(requestHash)) {
            throw new IdempotencyConflict(
                "Cùng mã nhưng khác nội dung — client đang dùng lại mã sai");
        }
        if ("IN_PROGRESS".equals(cu.status())) {
            throw new DangXuLy("Yêu cầu đang được xử lý, thử lại sau");
        }
        return deserialize(cu.responseBody());     // trả kết quả cũ
    }

    try {
        T ketQua = xuLy.get();
        luuKetQua(key, ketQua, "COMPLETED");
        return ketQua;
    } catch (LoiNghiepVu e) {
        luuKetQua(key, e.toResponse(), "FAILED");   // lỗi nghiệp vụ cũng lưu
        throw e;
    } catch (LoiHeThong e) {
        xoaBanGhi(key);            // lỗi hệ thống → cho phép thử lại thật
        throw e;
    }
}
```

```text
   ⚠ BA CHI TIẾT QUAN TRỌNG TRONG ĐOẠN CODE TRÊN:

   ① KIỂM TRA request_hash
      Cùng mã nhưng khác nội dung nghĩa là client dùng lại mã cho
      yêu cầu khác. Phải BÁO LỖI, không được trả kết quả cũ —
      nếu không, khách chuyển 1 triệu lại nhận kết quả của lệnh 100 nghìn.

   ② PHÂN BIỆT LỖI NGHIỆP VỤ VÀ LỖI HỆ THỐNG
      Lỗi nghiệp vụ ("không đủ tiền") → LƯU lại, thử lại vẫn ra lỗi đó
      Lỗi hệ thống (mất kết nối)      → XOÁ bản ghi, cho thử lại thật

      Nhầm hai loại này: hoặc khách không bao giờ thử lại được,
      hoặc thử lại tạo giao dịch trùng.

   ③ CÓ HẠN SỬ DỤNG
      Không có expires_at thì bảng phình vô hạn.
      24 giờ là mức phổ biến, phải dài hơn thời gian thử lại tối đa.
```

### ③ Kiểm tra trạng thái trước khi hành động

```text
   DÙNG KHI KHÔNG THỂ ĐẶT MÃ CHỐNG TRÙNG — ví dụ khi gọi ra
   hệ thống bên ngoài không hỗ trợ.

      var trangThai = doiTac.truyVanTrangThai(maThamChieu);
      if (trangThai.daXuLy()) return trangThai.ketQua();
      return doiTac.thucHien(lenh);

   ⚠ CÁCH NÀY CÓ KHOẢNG HỞ giữa truy vấn và thực hiện.
     Nó GIẢM xác suất trùng, không LOẠI BỎ.
     → Chỉ dùng khi không còn cách nào khác.
```

## Chọn phạm vi của mã — quyết định thiết kế quan trọng nhất

```text
   MÃ CHỐNG TRÙNG PHẢI ĐẠI DIỆN CHO MỘT Ý ĐỊNH NGHIỆP VỤ,
   KHÔNG PHẢI CHO MỘT LẦN GỌI HTTP.

   ❌ SAI: UUID sinh mỗi lần gọi API
           → mỗi lần thử lại là một mã mới → vô tác dụng

   ❌ SAI: băm của (userId + amount + timestamp)
           → timestamp đổi mỗi lần → vô tác dụng

   ❌ SAI: băm của (userId + amount)
           → khách muốn chuyển hai lần cùng số tiền thì bị chặn oan

   ✅ ĐÚNG: mã sinh MỘT LẦN khi người dùng bắt đầu một ý định,
            giữ nguyên qua mọi lần thử lại

      Ví dụ: sinh UUID khi mở màn hình xác nhận chuyển tiền,
             giữ trong state của màn hình đó
```

```text
   VÀ VỚI CÁC LOẠI NGHIỆP VỤ KHÁC:

   ┌────────────────────┬──────────────────────────────────────┐
   │ Nghiệp vụ          │ Phạm vi mã                            │
   ├────────────────────┼──────────────────────────────────────┤
   │ Thanh toán đơn hàng│ mã đơn + lần thử thanh toán           │
   │ Trả lãi định kỳ    │ tài khoản + kỳ (khoá tự nhiên)        │
   │ Xử lý webhook      │ mã sự kiện của đối tác                │
   │ Hoàn tiền          │ mã đơn + số tiền hoàn                 │
   │ Giải ngân khoản vay│ mã khoản vay (khoá tự nhiên)          │
   └────────────────────┴──────────────────────────────────────┘
```

## Idempotency ở từng tầng

```text
   ┌──────────────────────────────────────────────────────────┐
   │ TẦNG API                                                  │
   │   Header Idempotency-Key, bảng idempotency_records        │
   ├──────────────────────────────────────────────────────────┤
   │ TẦNG NGHIỆP VỤ                                            │
   │   Kiểm tra trạng thái trước khi chuyển: đơn đã thanh toán │
   │   thì không xử lý thanh toán lần nữa                      │
   ├──────────────────────────────────────────────────────────┤
   │ TẦNG SỔ CÁI                                               │
   │   idempotency_key UNIQUE trên journal_entries (bài 1)     │
   │   ← LỚP CUỐI CÙNG, KHÔNG THỂ VÒNG QUA                    │
   ├──────────────────────────────────────────────────────────┤
   │ TẦNG GỌI RA NGOÀI                                         │
   │   Gửi mã chống trùng cho đối tác, giữ nguyên khi thử lại  │
   └──────────────────────────────────────────────────────────┘

   ⚠ PHẢI CÓ ĐỦ CẢ BỐN TẦNG.

   Chỉ có tầng API thì job nền và consumer hàng đợi vẫn ghi trùng.
   Chỉ có tầng sổ cái thì client nhận lỗi khó hiểu thay vì
   nhận lại kết quả cũ một cách êm ái.
```

## Consumer hàng đợi

```java
@KafkaListener(topics = "payment-events")
public void xuLy(PaymentEvent event) {
    // Mã sự kiện của producer chính là mã chống trùng tự nhiên
    if (!processedEventDao.danhDauNeuChuaXuLy(event.eventId())) {
        log.debug("Sự kiện {} đã xử lý, bỏ qua", event.eventId());
        return;
    }
    xuLyThat(event);
}
```

```sql
CREATE TABLE processed_events (
    event_id     TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Dọn định kỳ các bản ghi cũ hơn thời gian giữ message của hàng đợi
```

```text
   ⚠ VIỆC ĐÁNH DẤU VÀ VIỆC XỬ LÝ PHẢI NẰM TRONG CÙNG MỘT TRANSACTION.

   Đánh dấu trước, xử lý sau, xử lý lỗi → sự kiện bị đánh dấu
   là đã xử lý nhưng thực ra chưa → MẤT SỰ KIỆN.

   Xử lý trước, đánh dấu sau, đánh dấu lỗi → xử lý trùng.

   → Cùng transaction là cách duy nhất đúng.
     Nếu xử lý có gọi ra ngoài không thể nằm trong transaction,
     phải dùng outbox hoặc kiểm tra trạng thái ở tầng nghiệp vụ.
```

## Kiểm chứng

```java
@Test
void goi_muoi_lan_cung_ma_chi_tao_mot_giao_dich() {
    String key = UUID.randomUUID().toString();
    var yeuCau = new ChuyenTienRequest(tuVi, denVi, 500_000);

    var ketQua = IntStream.range(0, 10)
        .mapToObj(i -> service.chuyenTien(key, yeuCau))
        .toList();

    // Mọi lần gọi trả về cùng một kết quả
    assertThat(ketQua).allMatch(r -> r.equals(ketQua.get(0)));

    // Và chỉ có MỘT bút toán được ghi
    assertThat(demButToan(yeuCau)).isEqualTo(1);
    assertThat(laySoDu(tuVi)).isEqualTo(soDuBanDau - 500_000);
}

@Test
void cung_ma_khac_noi_dung_phai_bao_loi() {
    String key = UUID.randomUUID().toString();
    service.chuyenTien(key, new ChuyenTienRequest(tuVi, denVi, 500_000));

    assertThatThrownBy(() ->
        service.chuyenTien(key, new ChuyenTienRequest(tuVi, denVi, 9_000_000)))
        .isInstanceOf(IdempotencyConflict.class);
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Sinh mã mới cho mỗi lần thử lại | **Mã chống trùng vô tác dụng** — lỗi phổ biến nhất | Sinh một lần cho một ý định, giữ nguyên khi thử lại |
| Đưa timestamp vào mã | Mã đổi mỗi lần → vô tác dụng | Mã không được chứa yếu tố thay đổi |
| Không kiểm `request_hash` | Cùng mã khác nội dung → **trả kết quả sai cho khách** | So sánh băm nội dung, khác thì báo lỗi |
| Không phân biệt lỗi nghiệp vụ và lỗi hệ thống | Hoặc kẹt vĩnh viễn, hoặc tạo giao dịch trùng | Lỗi nghiệp vụ thì lưu, lỗi hệ thống thì xoá bản ghi |
| Bảng mã chống trùng không có hạn | Phình vô hạn | `expires_at`, dọn định kỳ |
| Chỉ làm ở tầng API | Job nền và consumer vẫn ghi trùng | Đủ **bốn tầng**, và sổ cái là lớp cuối |
| Đánh dấu đã xử lý ngoài transaction | Mất sự kiện hoặc xử lý trùng | Cùng transaction với việc xử lý |
| Tin vào "exactly-once" của hàng đợi | Vẫn xử lý trùng trong một số tình huống | Luôn tự làm bất biến khi lặp |
| Băm (user + amount) làm mã | Chặn oan khi khách thật sự muốn chuyển hai lần | Mã đại diện cho **ý định**, do client sinh |
| Chỉ kiểm tra trạng thái rồi hành động | Còn khoảng hở giữa hai bước | Chỉ dùng khi không còn cách nào khác |

## Tóm tắt bài 2

- **Bốn trong mười case ở phase 5 có cùng nguyên nhân gốc là thiếu tính bất biến khi lặp.**
- **"Đúng một lần" không tồn tại** ở tầng truyền tin. Thứ người ta gọi là exactly-once thực ra là **ít nhất một lần + xử lý bất biến khi lặp**.
- Ba cách đạt được: **khoá tự nhiên** (mạnh nhất, ưu tiên), **mã do client sinh**, **kiểm tra trạng thái trước** (yếu nhất, còn khoảng hở).
- **Mã phải đại diện cho một ý định nghiệp vụ, không phải một lần gọi HTTP** — sinh mã mới khi thử lại là lỗi triển khai phổ biến nhất.
- **Phải kiểm `request_hash`**: cùng mã khác nội dung nghĩa là client dùng sai, phải báo lỗi chứ không trả kết quả cũ.
- **Phân biệt lỗi nghiệp vụ và lỗi hệ thống**: lỗi nghiệp vụ thì lưu kết quả, lỗi hệ thống thì xoá bản ghi để cho thử lại thật.
- Cần đủ **bốn tầng**: API, nghiệp vụ, sổ cái, gọi ra ngoài. **Sổ cái là lớp cuối không thể vòng qua.**
- Với consumer hàng đợi, **việc đánh dấu và việc xử lý phải nằm trong cùng một transaction**.
- Bảng mã chống trùng phải có **hạn sử dụng**, dài hơn thời gian thử lại tối đa.

**Bài kế tiếp** → [Bài 3: Saga — điều phối luồng tiền qua nhiều dịch vụ](03-saga-cho-luong-tien.md)

**Quay lại** → [Bài 1: Thiết kế mô hình sổ cái](01-thiet-ke-ledger.md)
