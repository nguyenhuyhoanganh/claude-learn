# Bài 6: Dấu vết kiểm toán và sẵn sàng cho thanh tra

## Sự cố mở đầu

Cơ quan quản lý thanh tra một công ty fintech. Yêu cầu rất cụ thể:

> *"Giải trình giao dịch mã GD-88231, thực hiện ngày 14 tháng 3 năm ngoái. Vì sao hệ thống cho phép giao dịch này đi qua trong khi khách hàng đang ở trạng thái hạn chế?"*

Đội kỹ thuật tra cứu và trả lời: *"Lúc đó khách chưa bị hạn chế. Trạng thái hạn chế được áp ngày 20 tháng 3."*

Thanh tra hỏi tiếp: *"Chứng minh đi."*

Và họ không chứng minh được.

Bảng khách hàng chỉ có **một cột trạng thái**, được `UPDATE` mỗi khi đổi. Không có lịch sử. Không ai biết ngày 14 tháng 3 trạng thái là gì — chỉ biết **hôm nay** nó là "hạn chế".

Log ứng dụng chỉ giữ 30 ngày. Bản sao lưu database có, nhưng khôi phục một bản sao lưu 11 tháng tuổi mất bốn ngày và cần một máy chủ riêng.

Kết luận thanh tra: **không có khả năng giải trình**. Đây là một lỗi nặng hơn cả việc thực sự làm sai — vì nó có nghĩa là công ty không kiểm soát được hệ thống của mình.

## Nguyên tắc gốc: dữ liệu tài chính không được ghi đè

```text
   ❌ MÔ HÌNH SAI — trạng thái hiện tại, ghi đè:

      customers
      ┌────┬──────────┬───────────┐
      │ id │ name     │ status    │
      ├────┼──────────┼───────────┤
      │ 42 │ Nguyễn A │ RESTRICTED│   ← UPDATE mỗi khi đổi
      └────┴──────────┴───────────┘

      → Không trả lời được: "ngày 14/3 trạng thái là gì?"

   ✅ MÔ HÌNH ĐÚNG — trạng thái hiện tại + lịch sử bất biến:

      customers                    customer_status_history
      ┌────┬──────────┬─────────┐  ┌────┬─────┬──────────┬────────────┬────────┐
      │ id │ name     │ status  │  │ id │ cid │ status   │ effective  │ reason │
      ├────┼──────────┼─────────┤  ├────┼─────┼──────────┼────────────┼────────┤
      │ 42 │ Nguyễn A │RESTRICT.│  │ 1  │ 42  │ ACTIVE   │ 2025-01-10 │ mở TK  │
      └────┴──────────┴─────────┘  │ 2  │ 42  │RESTRICTED│ 2026-03-20 │ AML-91 │
                                    └────┴─────┴──────────┴────────────┴────────┘
        ▲ để truy vấn nhanh            ▲ CHỈ GHI THÊM, không sửa, không xoá

      → Trả lời được mọi câu hỏi "tại thời điểm T thì thế nào".
```

```sql
-- Truy vấn trả lời được câu hỏi của thanh tra
SELECT status, effective_from, reason, changed_by
FROM customer_status_history
WHERE customer_id = 42
  AND effective_from <= TIMESTAMP '2026-03-14 00:00:00'
ORDER BY effective_from DESC
LIMIT 1;
--  ACTIVE | 2025-01-10 | mở tài khoản | system
--  → CHỨNG MINH ĐƯỢC: ngày 14/3 khách đang ACTIVE
```

```text
   ⚠ ÁP DỤNG MÔ HÌNH NÀY CHO MỌI THỨ CÓ THỂ BỊ HỎI LẠI:

      · trạng thái khách hàng          · hạn mức
      · nhóm nợ                        · lãi suất áp dụng
      · quyền của người dùng nội bộ    · cấu hình quy tắc rủi ro
      · phân loại rủi ro khách hàng    · phí

   → Quy tắc đơn giản: NẾU MỘT GIÁ TRỊ ẢNH HƯỞNG TỚI QUYẾT ĐỊNH
     LIÊN QUAN TỚI TIỀN, NÓ PHẢI CÓ LỊCH SỬ.
```

## Ba loại dấu vết, ba mục đích

```text
   ① NHẬT KÝ NGHIỆP VỤ  (business audit trail)
      "Ai làm gì với dữ liệu gì, khi nào, vì sao"
      → Dùng để giải trình với thanh tra và điều tra nội bộ
      → Lưu nhiều năm

   ② SỔ CÁI  (ledger)
      "Tiền đi từ đâu tới đâu"
      → Bất biến theo thiết kế (phase 1 bài 2)
      → Lưu vĩnh viễn

   ③ LOG KỸ THUẬT  (application log)
      "Hệ thống đã chạy gì, lỗi gì"
      → Dùng để gỡ lỗi
      → Lưu 30–90 ngày là đủ

   ⚠ SỰ CỐ ĐẦU BÀI XẢY RA VÌ HỌ DÙNG LOẠI ③ ĐỂ LÀM VIỆC CỦA LOẠI ①.

   Log kỹ thuật không phải dấu vết kiểm toán:
      · Bị xoay vòng và xoá
      · Không có cấu trúc ổn định
      · Đội kỹ thuật sửa được
      · Không ai đảm bảo tính đầy đủ
```

## Bản ghi kiểm toán cần những trường gì

```sql
CREATE TABLE audit_events (
    id              BIGSERIAL PRIMARY KEY,
    occurred_at     TIMESTAMPTZ NOT NULL,      -- có múi giờ, không dùng local time
    actor_type      TEXT NOT NULL,             -- USER | SYSTEM | API_CLIENT
    actor_id        TEXT NOT NULL,             -- danh tính THẬT, không dùng tài khoản chung
    action          TEXT NOT NULL,             -- có cấu trúc: REFUND_APPROVE, LIMIT_CHANGE
    entity_type     TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    value_before    JSONB,                     -- BẮT BUỘC với thao tác sửa
    value_after     JSONB,
    reason_code     TEXT,                      -- chọn từ danh mục, không tự do
    reason_note     TEXT,
    request_id      TEXT NOT NULL,             -- lần ngược toàn bộ luồng
    ip_address      INET,
    user_agent      TEXT,
    result          TEXT NOT NULL              -- SUCCESS | DENIED | ERROR
);

-- Chỉ ghi thêm, cưỡng chế ở tầng database
REVOKE UPDATE, DELETE ON audit_events FROM ALL;
CREATE INDEX ON audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX ON audit_events (actor_id, occurred_at DESC);
CREATE INDEX ON audit_events (request_id);
```

```text
   ⚠ BA TRƯỜNG HAY BỊ BỎ QUÊN VÀ CẢ BA ĐỀU QUAN TRỌNG:

   value_before  → không có nó thì không biết đã đổi CÁI GÌ,
                   chỉ biết là "có ai đó đã sửa"

   request_id    → không có nó thì không lần ngược được:
                   một thao tác của người dùng sinh ra 15 sự kiện
                   ở 5 dịch vụ khác nhau, phải nối lại được

   result        → chỉ ghi thành công là MÙ trước hành vi dò tìm
                   (đã nói ở bài 4)
```

## Ghi nhật ký ở đâu trong code

```text
   ❌ CÁCH SAI 1 — ghi ở tầng controller
      Bỏ sót mọi thay đổi đến từ job nền, từ consumer hàng đợi,
      từ script vận hành.

   ❌ CÁCH SAI 2 — nhờ lập trình viên nhớ gọi hàm ghi log
      Sẽ quên. Không phải có thể quên — sẽ quên.

   ✅ CÁCH ĐÚNG — ghi ở tầng gần dữ liệu nhất, tự động

      · Interceptor/aspect trên các thao tác đã đánh dấu
      · Hoặc trigger ở database cho các bảng quan trọng
      · Hoặc đọc từ nhật ký thay đổi của database (CDC)

   → CÁCH DÙNG CDC LÀ MẠNH NHẤT: mọi thay đổi đều bị bắt,
     kể cả thay đổi do chạy SQL trực tiếp.
     Đây chính là lỗ hổng mà bài 4 đã nói tới.
```

```java
// Mẫu dùng annotation + aspect: lập trình viên chỉ cần đánh dấu
@Auditable(action = "REFUND_APPROVE", entity = "REFUND")
public RefundResult approveRefund(Long refundId, String reasonCode) {
    ...
}
```

```text
   ⚠ NHƯNG DÙ DÙNG CÁCH NÀO, PHẢI CÓ MỘT TEST KIỂM TRA ĐỘ PHỦ:

   Liệt kê mọi thao tác thay đổi dữ liệu nhạy cảm,
   khẳng định mỗi thao tác đều sinh bản ghi kiểm toán.
   → Không có test này thì độ phủ sẽ xói mòn theo thời gian.
```

## Tính toàn vẹn — chứng minh nhật ký không bị sửa

```text
   VẤN ĐỀ: NGƯỜI CÓ QUYỀN QUẢN TRỊ DATABASE CÓ THỂ SỬA NHẬT KÝ.
   Vậy nhật ký chứng minh được gì?

   BỐN LỚP, TỪ RẺ TỚI ĐẮT:

   ① TÁCH QUYỀN
      Người vận hành hệ thống chính không có quyền trên kho nhật ký.

   ② CHUYỂN RA NGOÀI NGAY
      Đẩy sang hệ thống lưu trữ chỉ-ghi-thêm ở nơi khác,
      trong vài giây sau khi phát sinh.

   ③ CHUỖI BĂM
      Mỗi bản ghi chứa mã băm của bản ghi trước.
      → Sửa một bản ghi làm gãy toàn bộ chuỗi phía sau.

      hash_n = SHA256(hash_{n-1} || nội_dung_bản_ghi_n)

   ④ NEO ĐỊNH KỲ
      Mỗi ngày, công bố mã băm cuối cùng ra một nơi bên thứ ba
      không sửa được.
      → Chứng minh được nhật ký tại thời điểm đó là gì.

   → PHẦN LỚN CÔNG TY CẦN ① VÀ ②. ③ VÀ ④ CHO HỆ THỐNG
     CÓ YÊU CẦU CAO HOẶC KHI CÓ TRANH CHẤP THƯỜNG XUYÊN.
```

## Bốn câu hỏi thanh tra luôn hỏi

Chuẩn bị sẵn câu trả lời cho bốn câu này là phần lớn công việc.

```text
   ① "TẠI THỜI ĐIỂM T, TRẠNG THÁI CỦA X LÀ GÌ?"
      → Cần: lịch sử có hiệu lực theo thời gian cho mọi giá trị quan trọng

   ② "AI ĐÃ LÀM VIỆC NÀY, VÀ AI PHÊ DUYỆT?"
      → Cần: nhật ký có danh tính thật, cả hai vai, ghi lý do

   ③ "VÌ SAO HỆ THỐNG QUYẾT ĐỊNH NHƯ VẬY?"
      → Cần: lưu đầu vào, phiên bản quy tắc/mô hình, và kết quả
        (đã nói ở phase 3 bài 2)
      → Phải TÁI DỰNG được quyết định: cùng đầu vào, cùng phiên bản
        → ra cùng kết quả

   ④ "CHO XEM TOÀN BỘ GIAO DỊCH CỦA KHÁCH HÀNG NÀY TRONG 3 NĂM"
      → Cần: xuất được dữ liệu dài hạn trong thời gian hợp lý
      → Dữ liệu cũ nằm ở kho lạnh vẫn phải truy xuất được,
        không phải khôi phục bản sao lưu bốn ngày như ở đầu bài
```

```text
   ⚠ CÂU ③ LÀ CÂU KHÓ NHẤT VỚI HỆ THỐNG DÙNG MÔ HÌNH HỌC MÁY.

   "Mô hình quyết định vậy" không phải câu trả lời chấp nhận được.
   Phải nói được những yếu tố nào ảnh hưởng nhiều nhất tới quyết định đó.

   → Nếu không giải thích được thì đừng dùng mô hình cho quyết định
     ảnh hưởng trực tiếp tới khách hàng.
```

## Lưu trữ dài hạn — thiết kế từ đầu

```text
   YÊU CẦU MÂU THUẪN:
      · Truy vấn hằng ngày cần NHANH  → dữ liệu ít, index nhiều
      · Thanh tra cần dữ liệu 5–10 NĂM → dữ liệu khổng lồ

   GIẢI PHÁP BA TẦNG:

   ┌──────────────────────────────────────────────────────────┐
   │ NÓNG   — 3 tháng gần nhất, trong database chính           │
   │          truy vấn tức thời                                 │
   ├──────────────────────────────────────────────────────────┤
   │ ẤM     — 1–2 năm, bảng phân vùng theo tháng hoặc          │
   │          database riêng; truy vấn được, chậm hơn           │
   ├──────────────────────────────────────────────────────────┤
   │ LẠNH   — trên 2 năm, lưu dạng file nén trên kho đối tượng │
   │          ⚠ PHẢI TRUY VẤN ĐƯỢC, không chỉ lưu để đó        │
   └──────────────────────────────────────────────────────────┘

   ⚠ ĐIỀU KIỆN BẮT BUỘC CHO TẦNG LẠNH:

   ① Định dạng tự mô tả (kèm lược đồ), không phụ thuộc phiên bản code
   ② Có công cụ truy vấn trực tiếp, không cần khôi phục
   ③ KIỂM TRA ĐỊNH KỲ: thử truy xuất dữ liệu cũ mỗi quý
      → Kho lạnh chưa từng đọc thử là kho lạnh không dùng được.
```

## Chuẩn bị trước, không chuẩn bị lúc bị hỏi

```text
   DANH SÁCH NÊN CÓ SẴN:

   ☐ Sơ đồ dòng dữ liệu — dữ liệu cá nhân và dữ liệu giao dịch đi đâu
   ☐ Danh mục các loại sự kiện kiểm toán đang ghi
   ☐ Bảng thời hạn lưu trữ từng loại dữ liệu, kèm căn cứ pháp lý
   ☐ Quy trình đã viết cho: KYC, giám sát giao dịch, xử lý cảnh báo,
     phê duyệt, xử lý sự cố
   ☐ Danh sách quyền theo vai trò, và biên bản rà soát quý gần nhất
   ☐ Công cụ tra cứu: nhập mã khách/mã giao dịch → ra toàn bộ dấu vết
   ☐ Báo cáo định kỳ đã gửi cơ quan quản lý

   ⚠ MỤC THỨ SÁU — CÔNG CỤ TRA CỨU — LÀ MỤC TIẾT KIỆM NHIỀU
     THỜI GIAN NHẤT KHI THANH TRA.

   Không có nó, mỗi câu hỏi tốn vài ngày viết truy vấn thủ công,
   và mỗi lần viết tay là một cơ hội trả lời sai.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `UPDATE` đè trạng thái, không lưu lịch sử | **Không giải trình được** — lỗi nặng hơn cả làm sai | Bảng lịch sử chỉ-ghi-thêm cho mọi giá trị ảnh hưởng tới tiền |
| Dùng log kỹ thuật làm dấu vết kiểm toán | Bị xoay vòng, sửa được, không đầy đủ | Ba loại dấu vết riêng, mục đích riêng, thời hạn riêng |
| Không ghi `value_before` | Biết có người sửa, không biết sửa **cái gì** | Bắt buộc với mọi thao tác sửa |
| Không có `request_id` | Không nối được 15 sự kiện ở 5 dịch vụ | Truyền mã yêu cầu xuyên suốt |
| Chỉ ghi hành động thành công | Mù trước hành vi dò tìm | Ghi cả `DENIED` và `ERROR` |
| Ghi nhật ký ở tầng controller | Bỏ sót job nền, consumer, script vận hành | Ghi ở tầng gần dữ liệu, hoặc dùng CDC |
| Nhờ lập trình viên nhớ gọi hàm ghi log | Sẽ quên | Aspect/trigger/CDC + **test kiểm tra độ phủ** |
| Người vận hành có quyền sửa nhật ký | Nhật ký mất giá trị chứng minh | Tách quyền, chuyển ra ngoài ngay |
| Không tái dựng được quyết định tự động | Không trả lời được câu hỏi "vì sao" | Lưu đầu vào + phiên bản quy tắc/mô hình |
| Dùng mô hình không giải thích được cho quyết định về khách | "Mô hình quyết định vậy" không được chấp nhận | Giải thích được yếu tố ảnh hưởng, hoặc đừng dùng |
| Dữ liệu cũ chỉ có trong bản sao lưu | Khôi phục mất nhiều ngày | Kho lạnh **truy vấn được**, kiểm tra mỗi quý |
| Không có công cụ tra cứu dấu vết | Mỗi câu hỏi tốn vài ngày, dễ trả lời sai | Dựng sẵn, đây là công cụ tiết kiệm nhất |

## Tóm tắt bài 6

- **Không giải trình được là lỗi nặng hơn cả việc thực sự làm sai** — nó có nghĩa là công ty không kiểm soát được hệ thống của mình.
- Nguyên tắc gốc: **dữ liệu tài chính không được ghi đè**. Giữ trạng thái hiện tại để truy vấn nhanh, cộng bảng **lịch sử chỉ-ghi-thêm** để trả lời câu hỏi "tại thời điểm T thì thế nào".
- Quy tắc đơn giản: **giá trị nào ảnh hưởng tới quyết định liên quan tới tiền thì phải có lịch sử**.
- **Ba loại dấu vết riêng biệt**: nhật ký nghiệp vụ (nhiều năm), sổ cái (vĩnh viễn), log kỹ thuật (30–90 ngày). **Dùng log kỹ thuật làm dấu vết kiểm toán là sai lầm ở đầu bài.**
- Ba trường hay bị bỏ quên: **`value_before`**, **`request_id`**, và **`result`** (ghi cả hành động bị từ chối).
- Ghi nhật ký ở **tầng gần dữ liệu**, tự động — **CDC là mạnh nhất** vì bắt được cả thay đổi do chạy SQL trực tiếp. Và phải có **test kiểm tra độ phủ**.
- Tính toàn vẹn: **tách quyền** và **chuyển ra ngoài ngay** là đủ cho phần lớn; chuỗi băm và neo định kỳ cho yêu cầu cao.
- Bốn câu thanh tra luôn hỏi: **trạng thái tại thời điểm T**, **ai làm và ai duyệt**, **vì sao hệ thống quyết định vậy**, **xuất dữ liệu nhiều năm**.
- **"Mô hình quyết định vậy" không phải câu trả lời chấp nhận được** — không giải thích được thì đừng dùng cho quyết định ảnh hưởng tới khách.
- Lưu trữ ba tầng nóng/ấm/lạnh, và **kho lạnh phải truy vấn được, kiểm tra thử mỗi quý** — kho lạnh chưa từng đọc thử là kho lạnh không dùng được.

**Bài kế tiếp** → [Phase 5, Bài 1: Trừ tiền hai lần](../phase-5-case-su-co/01-tru-tien-hai-lan.md)

**Quay lại** → [Bài 5: Bảo mật dữ liệu](05-bao-mat-du-lieu.md)
