# Bài 1: Thiết kế mô hình sổ cái

## Vì sao đây là quyết định khó sửa nhất

```text
   MỌI QUYẾT ĐỊNH KHÁC TRONG HỆ THỐNG TÀI CHÍNH ĐỀU SỬA ĐƯỢC:
      · Đổi cổng thanh toán      → viết adapter mới
      · Đổi cách tính lãi        → sửa hàm, áp cho khoản vay mới
      · Đổi quy tắc rủi ro       → sửa cấu hình

   MÔ HÌNH SỔ CÁI THÌ KHÔNG.

   Vì mọi bút toán đã ghi đều theo cấu trúc cũ, và sổ cái là
   bất biến — bạn không được phép sửa chúng.
   → Đổi mô hình = phải chạy song song hai sổ, hoặc chấp nhận
     một điểm gãy trong lịch sử tài chính.

   → Đây là thứ phải làm đúng ngay từ đầu.
```

## Ba mô hình, và vì sao chỉ một mô hình đúng

```text
   ① CỘT SỐ DƯ ĐƠN THUẦN
      wallets (id, balance)
      → UPDATE balance mỗi giao dịch

      ❌ Không biết số dư đến từ đâu
      ❌ Không dựng lại được lịch sử
      ❌ Sửa nhầm là mất vĩnh viễn
      → CHỈ dùng cho hệ thống không phải tiền thật (điểm thưởng nội bộ)

   ② LỊCH SỬ GIAO DỊCH MỘT VẾ
      transactions (id, wallet_id, amount, type)
      → số dư = SUM(amount)

      ✅ Có lịch sử
      ❌ Tiền có thể xuất hiện từ hư không (case 4 phase 5)
      ❌ Không biết tiền đi từ đâu tới đâu
      ❌ Không lập được báo cáo tài chính

   ③ SỔ CÁI HẠCH TOÁN KÉP  ← MÔ HÌNH ĐÚNG
      Mỗi giao dịch là một BÚT TOÁN gồm nhiều VẾ, tổng nợ = tổng có

      ✅ Tiền luôn có nguồn
      ✅ Sổ tự kiểm tra được
      ✅ Lập được báo cáo tài chính chuẩn
      ✅ Giải trình được với thanh tra
```

## Cấu trúc bảng tối thiểu

```sql
-- TÀI KHOẢN — cây tài khoản (phase 1 bài 3)
CREATE TABLE accounts (
    id            BIGSERIAL PRIMARY KEY,
    code          TEXT NOT NULL UNIQUE,      -- 'CUSTOMER_WALLET:88421'
    account_type  TEXT NOT NULL,             -- ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE
    currency      CHAR(3) NOT NULL,
    owner_type    TEXT,                      -- CUSTOMER | INTERNAL | PARTNER
    owner_id      TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BÚT TOÁN — một sự kiện nghiệp vụ
CREATE TABLE journal_entries (
    id             BIGSERIAL PRIMARY KEY,
    business_date  DATE NOT NULL,            -- ngày NGHIỆP VỤ, không phải ngày ghi
    entry_type     TEXT NOT NULL,            -- TOPUP | PAYMENT | REFUND | FEE...
    reference_type TEXT NOT NULL,            -- ORDER | TRANSFER | LOAN...
    reference_id   TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,    -- ← chống ghi trùng
    description    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     TEXT NOT NULL
);

-- VẾ — từng dòng nợ/có
CREATE TABLE journal_lines (
    id                BIGSERIAL PRIMARY KEY,
    journal_entry_id  BIGINT NOT NULL REFERENCES journal_entries(id),
    account_id        BIGINT NOT NULL REFERENCES accounts(id),
    direction         CHAR(1) NOT NULL CHECK (direction IN ('D','C')),
    amount_minor      BIGINT NOT NULL CHECK (amount_minor > 0),
    currency          CHAR(3) NOT NULL
);

-- SỔ CÁI LÀ BẤT BIẾN — cưỡng chế ở tầng database
REVOKE UPDATE, DELETE ON journal_entries, journal_lines FROM PUBLIC;
```

```text
   ⚠ BỐN QUYẾT ĐỊNH TRONG LƯỢC ĐỒ TRÊN, MỖI CÁI ĐỀU QUAN TRỌNG:

   ① amount_minor LÀ SỐ NGUYÊN, LUÔN DƯƠNG
      Chiều nợ/có nằm ở cột direction, không nằm ở dấu của số tiền.
      → Tránh mọi nhầm lẫn về dấu, và làm phép kiểm tra cân đối đơn giản.

   ② idempotency_key LÀ UNIQUE
      Ghi lại cùng một bút toán → database từ chối.
      → Đây là lớp chống ghi trùng ở tầng thấp nhất (case 6 phase 5).

   ③ business_date TÁCH KHỎI created_at
      Bút toán của ngày 31/07 có thể được ghi vào 01/08.
      Báo cáo tháng 7 phải dùng business_date.

   ④ KHÔNG CÓ CỘT SỐ DƯ Ở BẢNG accounts
      Số dư là kết quả tính, không phải dữ liệu gốc.
      (Xem phần sau về cách vẫn có số dư nhanh.)
```

## Ràng buộc cân đối — cưỡng chế ở database

```sql
-- Kiểm tra mỗi bút toán đều cân, chạy khi kết thúc transaction
CREATE OR REPLACE FUNCTION kiem_tra_can_doi() RETURNS TRIGGER AS $$
DECLARE tong_no BIGINT; tong_co BIGINT;
BEGIN
    SELECT
      coalesce(sum(amount_minor) FILTER (WHERE direction='D'), 0),
      coalesce(sum(amount_minor) FILTER (WHERE direction='C'), 0)
    INTO tong_no, tong_co
    FROM journal_lines WHERE journal_entry_id = NEW.journal_entry_id;

    IF tong_no <> tong_co THEN
        RAISE EXCEPTION 'Bút toán % không cân: nợ=% có=%',
            NEW.journal_entry_id, tong_no, tong_co;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_can_doi
    AFTER INSERT ON journal_lines
    DEFERRABLE INITIALLY DEFERRED       -- ← kiểm khi COMMIT, không kiểm từng dòng
    FOR EACH ROW EXECUTE FUNCTION kiem_tra_can_doi();
```

```text
   ⚠ DEFERRABLE INITIALLY DEFERRED LÀ CHI TIẾT QUYẾT ĐỊNH.

   Không có nó, trigger chạy ngay khi chèn dòng nợ đầu tiên
   và báo lỗi vì chưa có dòng có.
   → Phải hoãn kiểm tra tới lúc COMMIT, khi cả bút toán đã đầy đủ.
```

## API ghi sổ — không cho phép ghi một vế

```java
// ĐÂY LÀ API DUY NHẤT ĐƯỢC PHÉP GHI VÀO SỔ CÁI
public interface Ledger {
    JournalEntryId post(JournalEntry entry);
}

public record JournalEntry(
        LocalDate businessDate,
        String entryType,
        String referenceType,
        String referenceId,
        String idempotencyKey,
        List<Line> lines
) {
    public JournalEntry {
        long no = lines.stream().filter(l -> l.direction() == D)
                       .mapToLong(Line::amountMinor).sum();
        long co = lines.stream().filter(l -> l.direction() == C)
                       .mapToLong(Line::amountMinor).sum();
        if (no != co) {
            throw new IllegalArgumentException(
                "Bút toán không cân: nợ=%d có=%d".formatted(no, co));
        }
        if (lines.size() < 2) {
            throw new IllegalArgumentException("Bút toán phải có ít nhất hai vế");
        }
    }
}
```

```text
   ⚠ KHÔNG CUNG CẤP HÀM credit() HAY debit() RIÊNG LẺ.

   Chỉ cần một hàm như vậy tồn tại là sẽ có người gọi nó,
   và sổ sẽ lệch (case 4 phase 5).

   → Ràng buộc trong constructor + ràng buộc ở database = hai lớp,
     và lớp thứ hai chặn được cả đường ghi không qua ứng dụng.
```

## Vấn đề số dư: tính tổng thì đúng nhưng chậm

```text
   SỐ DƯ = Σ các vế của tài khoản đó.

   Với 10 triệu bút toán, mỗi lần đọc số dư phải quét hết → không dùng được.

   BA CÁCH GIẢI:

   ① CỘT SỐ DƯ ĐỆM
      Giữ cột balance ở bảng accounts, cập nhật trong cùng transaction.
      ✅ Đọc nhanh
      ⚠ Phải kiểm tra định kỳ khớp với tổng các vế

   ② ẢNH CHỤP SỐ DƯ ĐỊNH KỲ
      Lưu số dư cuối mỗi ngày. Số dư hiện tại = ảnh chụp gần nhất
      + các vế phát sinh sau đó.
      ✅ Vừa nhanh vừa không cần cột đệm
      ✅ Đồng thời phục vụ điều tra (case 4 phase 5)

   ③ KẾT HỢP CẢ HAI  ← khuyến nghị
      Cột đệm để đọc tức thời, ảnh chụp hằng ngày để đối chiếu.
```

```sql
-- Kiểm tra hằng ngày: cột đệm có khớp tổng các vế không
SELECT a.id, a.code, a.balance_minor AS so_du_dem,
       coalesce(sum(CASE WHEN l.direction = a.normal_side
                         THEN l.amount_minor ELSE -l.amount_minor END), 0) AS tinh_lai
FROM accounts a
LEFT JOIN journal_lines l ON l.account_id = a.id
GROUP BY a.id, a.code, a.balance_minor, a.normal_side
HAVING a.balance_minor <> coalesce(sum(...), 0);
-- → phải trả về 0 dòng
```

## Chiều nợ/có của từng loại tài khoản

```text
   ĐÂY LÀ CHỖ NGƯỜI MỚI HAY NHẦM NHẤT (phase 1 bài 2):

   ┌──────────────┬────────────┬──────────────┬──────────────┐
   │ Loại         │ Chiều tăng │ Nợ nghĩa là  │ Có nghĩa là  │
   ├──────────────┼────────────┼──────────────┼──────────────┤
   │ TÀI SẢN      │ Nợ         │ TĂNG         │ GIẢM         │
   │ NỢ PHẢI TRẢ  │ Có         │ GIẢM         │ TĂNG         │
   │ VỐN          │ Có         │ GIẢM         │ TĂNG         │
   │ DOANH THU    │ Có         │ GIẢM         │ TĂNG         │
   │ CHI PHÍ      │ Nợ         │ TĂNG         │ GIẢM         │
   └──────────────┴────────────┴──────────────┴──────────────┘

   ⚠ VÍ TIỀN CỦA KHÁCH LÀ "NỢ PHẢI TRẢ" CỦA CÔNG TY, KHÔNG PHẢI TÀI SẢN.

   Công ty giữ tiền hộ khách → công ty NỢ khách số tiền đó.
   → Khách nạp tiền vào ví: GHI CÓ tài khoản ví (nợ phải trả TĂNG)
   → Khách tiêu tiền:        GHI NỢ tài khoản ví (nợ phải trả GIẢM)

   Hiểu ngược điều này làm mọi báo cáo tài chính sai dấu.
```

```java
// Lưu chiều tăng vào định nghĩa tài khoản, đừng để code tự suy
public enum AccountType {
    ASSET(DEBIT), LIABILITY(CREDIT), EQUITY(CREDIT),
    REVENUE(CREDIT), EXPENSE(DEBIT);

    private final Direction normalSide;
}
```

## Ví dụ: một giao dịch nạp tiền vào ví

```text
   KHÁCH NẠP 1.000.000 ĐỒNG QUA CỔNG THANH TOÁN, PHÍ CỔNG 15.000.

   BÚT TOÁN:
      Nợ  "Tài khoản ngân hàng của công ty"     985.000   (tài sản TĂNG)
      Nợ  "Chi phí cổng thanh toán"              15.000   (chi phí TĂNG)
      Có  "Ví khách hàng 88421"               1.000.000   (nợ phải trả TĂNG)
      ─────────────────────────────────────────────────
      Tổng nợ 1.000.000 = Tổng có 1.000.000  ✅

   → Khách thấy đủ 1.000.000 trong ví.
   → Công ty nhận về 985.000 tiền thật.
   → Chênh lệch 15.000 được ghi nhận đúng là CHI PHÍ, không biến mất.

   ⚠ NẾU CHỈ GHI "cộng ví 985.000" thì khách mất 15.000 vô cớ.
     Nếu chỉ ghi "cộng ví 1.000.000" mà không ghi chi phí
     thì sổ lệch 15.000.
```

## Đa tiền tệ

```text
   NGUYÊN TẮC: MỘT BÚT TOÁN CHỈ CÂN TRONG CÙNG MỘT ĐỒNG TIỀN.

   Giao dịch đổi tiền không phải một bút toán hai vế,
   mà là HAI bút toán nối với nhau qua tài khoản trung gian:

      Bút toán 1 (VND):
         Nợ  "Ví khách (VND)"           10.000.000 VND
         Có  "Tài khoản đổi tiền (VND)" 10.000.000 VND

      Bút toán 2 (USD):
         Nợ  "Tài khoản đổi tiền (USD)"     393,23 USD
         Có  "Ví khách (USD)"               393,23 USD

   → Mỗi bút toán cân trong đồng tiền của nó.
   → Tài khoản đổi tiền là nơi ghi nhận lãi/lỗ tỷ giá.

   ⚠ ĐỪNG BAO GIỜ TRỘN HAI ĐỒNG TIỀN TRONG MỘT BÚT TOÁN.
     "Tổng nợ = tổng có" không có nghĩa khi hai vế khác đơn vị.
```

## Phân vùng và lưu trữ dài hạn

```sql
-- Sổ cái chỉ lớn thêm, không bao giờ nhỏ đi → phân vùng theo tháng
CREATE TABLE journal_lines (
    ...
) PARTITION BY RANGE (created_at);

CREATE TABLE journal_lines_2026_08 PARTITION OF journal_lines
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
```

```text
   ⚠ ĐỪNG XOÁ PHÂN VÙNG CŨ. Sổ cái phải giữ vĩnh viễn.
     Chuyển sang lưu trữ lạnh nhưng PHẢI TRUY VẤN ĐƯỢC
     (phase 4 bài 6).
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng cột số dư làm dữ liệu gốc | Không dựng lại được lịch sử, sửa nhầm là mất | Sổ cái là gốc, số dư là kết quả tính |
| Có API ghi một vế | Tiền từ hư không, sổ lệch âm thầm | Chỉ có `post(JournalEntry)`, kiểm cân trong constructor |
| Không có ràng buộc cân ở database | Đường ghi khác vòng qua được | Constraint trigger `DEFERRABLE` |
| Trigger không `DEFERRABLE` | Báo lỗi ngay ở dòng nợ đầu tiên | `DEFERRABLE INITIALLY DEFERRED` |
| Dùng dấu âm cho chiều có | Nhầm dấu ở mọi phép tính | Số tiền luôn dương, chiều ở cột riêng |
| Không tách `business_date` | Báo cáo tháng sai khi bút toán ghi muộn | Hai cột riêng biệt |
| Coi ví khách là tài sản | **Mọi báo cáo tài chính sai dấu** | Ví khách là **nợ phải trả** |
| Trộn hai đồng tiền trong một bút toán | "Cân" mất ý nghĩa | Mỗi bút toán một đồng tiền, nối qua tài khoản trung gian |
| Cho phép `UPDATE`/`DELETE` trên sổ cái | Mất tính bất biến, mất giá trị pháp lý | `REVOKE` ở database, sửa bằng bút toán đảo |
| Không có `idempotency_key` unique | Ghi trùng khi job chạy lại | Cột unique ở bảng bút toán |
| Xoá phân vùng sổ cái cũ | Mất lịch sử tài chính vĩnh viễn | Chuyển lạnh, giữ khả năng truy vấn |

## Tóm tắt bài 1

- **Mô hình sổ cái là quyết định khó sửa nhất** vì sổ cái bất biến — mọi bút toán đã ghi đều theo cấu trúc cũ.
- Chỉ **hạch toán kép** là mô hình đúng cho tiền thật: tiền luôn có nguồn, sổ tự kiểm tra được, lập được báo cáo tài chính.
- **Số tiền luôn dương, chiều nợ/có ở cột riêng** — tránh mọi nhầm lẫn về dấu.
- **`business_date` tách khỏi `created_at`**; báo cáo dùng ngày nghiệp vụ.
- **`idempotency_key` unique** là lớp chống ghi trùng ở tầng thấp nhất.
- Ràng buộc cân đối phải cưỡng chế ở database bằng **constraint trigger `DEFERRABLE INITIALLY DEFERRED`** — không hoãn thì báo lỗi ngay ở dòng đầu.
- **Không cung cấp API ghi một vế.** Chỉ cần hàm đó tồn tại là sẽ có người gọi.
- **Ví khách hàng là nợ phải trả, không phải tài sản** — hiểu ngược làm mọi báo cáo sai dấu.
- Số dư: **cột đệm để đọc nhanh + ảnh chụp hằng ngày để đối chiếu**, và kiểm tra khớp mỗi ngày.
- Đa tiền tệ: **mỗi bút toán chỉ cân trong một đồng tiền**, nối nhau qua tài khoản trung gian.

**Bài kế tiếp** → [Bài 2: Idempotency — nền tảng của mọi luồng tiền](02-idempotency.md)

**Quay lại** → [Phase 5, Case 10: Rò rỉ dữ liệu từ bên trong](../phase-5-case-su-co/10-ro-ri-du-lieu-noi-bo.md)
