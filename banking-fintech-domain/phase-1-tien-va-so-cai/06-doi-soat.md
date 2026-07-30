# Bài 6: Đối soát — vì sao luôn lệch và xử lý thế nào

## Sự cố mở đầu

Một cổng thanh toán chạy được hai năm mà **chưa từng đối soát tự động**. Đội kỹ thuật lập luận hợp lý: *"Hệ thống ghi sổ đúng, đối tác cũng ghi đúng, sao phải so lại?"*

Rồi một hôm, đối tác gửi báo cáo quý:

```text
   Số tiền đối tác đã chuyển cho công ty trong quý : 412,3 tỷ
   Số tiền công ty ghi nhận đã nhận                : 415,1 tỷ
   ─────────────────────────────────────────────────────────
   LỆCH                                            :   2,8 tỷ
```

Điều tra kéo dài **bốn tháng**. Kết quả cuối cùng:

```text
   ├── 1,9 tỷ : giao dịch bị huỷ bởi ngân hàng phát hành nhưng công ty
   │            không nhận được thông báo (webhook thất bại, không retry)
   ├── 0,6 tỷ : phí đối tác trừ theo biểu phí mới từ tháng 4,
   │            hệ thống vẫn tính theo biểu phí cũ
   ├── 0,2 tỷ : giao dịch ghi hai lần do người dùng bấm hai lần
   └── 0,1 tỷ : chênh lệch làm tròn tích luỹ
```

Ba trong bốn nguyên nhân đã **âm thầm tồn tại từ tháng đầu tiên**. Nếu có đối soát hằng ngày, mỗi cái đã bị phát hiện trong vòng 24 giờ với mức lệch vài triệu, thay vì 2,8 tỷ sau hai năm.

Bài này giải thích vì sao **đối soát không phải việc kế toán làm cho vui — nó là chốt kiểm soát bắt buộc của mọi hệ thống tài chính**.

## Đối soát là gì

**Reconciliation — đối soát**: so sánh dữ liệu tài chính của bạn với dữ liệu của một bên khác (hoặc một nguồn khác), tìm ra chênh lệch, và xử lý từng chênh lệch cho tới khi hai bên khớp.

```text
   ┌─────────────────────┐         ┌─────────────────────┐
   │  SỔ CỦA BẠN         │  ←→     │  SỔ CỦA ĐỐI TÁC     │
   │  (hệ thống nội bộ)  │  so     │  (file đối soát)    │
   └─────────────────────┘  sánh   └─────────────────────┘
                     │                       │
                     └───────────┬───────────┘
                                 ▼
                     ┌───────────────────────┐
                     │  DANH SÁCH CHÊNH LỆCH │
                     │  → điều tra → xử lý   │
                     └───────────────────────┘
```

## Ba cấp độ đối soát

Nhiều người chỉ nghĩ tới cấp độ 2. Cả ba đều cần thiết.

### Cấp 1: Đối soát nội bộ (internal reconciliation)

So sánh các nguồn dữ liệu **bên trong hệ thống của bạn**:

```text
   ├── Tổng sổ phụ (số dư từng ví) = Số dư tài khoản kiểm soát? (bài 3)
   ├── Tổng Nợ = Tổng Có trên toàn sổ cái?
   ├── Bảng số dư tính sẵn (cache) = Tổng bút toán tính lại từ đầu?
   └── Tổng giao dịch trong bảng `transactions` = Tổng bút toán trong ledger?
```

Cấp này chạy được **liên tục** (mỗi giờ hoặc mỗi ngày), không cần chờ ai. Nó phát hiện lỗi trong chính code của bạn.

Đặc biệt quan trọng là phép kiểm tra thứ ba: nếu bạn lưu số dư tính sẵn để đọc nhanh, **phải định kỳ tính lại từ sổ cái để xác nhận nó không bị lệch**. Số dư cache lệch mà không ai biết là một trong những lỗi nguy hiểm nhất.

### Cấp 2: Đối soát với đối tác (external reconciliation)

So sánh với file đối soát từ ngân hàng, tổ chức chuyển mạch, cổng thanh toán, đối tác:

```text
   Đối tác gửi file (thường vào sáng hôm sau, cho ngày hôm trước):
   ┌────────────┬──────────────┬───────────┬──────────┬─────────┐
   │ Mã GD      │ Thời gian    │ Số tiền   │ Phí      │ TT      │
   ├────────────┼──────────────┼───────────┼──────────┼─────────┤
   │ TXN0012345 │ 2026-07-30.. │ 1.000.000 │   20.000 │ SUCCESS │
   │ TXN0012346 │ 2026-07-30.. │   500.000 │   10.000 │ SUCCESS │
   │ TXN0012347 │ 2026-07-30.. │ 2.000.000 │   40.000 │ REVERSED│
   └────────────┴──────────────┴───────────┴──────────┴─────────┘
```

### Cấp 3: Đối soát với ngân hàng (bank reconciliation)

So sánh sổ cái của bạn với **sao kê tài khoản ngân hàng thật**. Đây là cấp cuối cùng, xác nhận tiền thật sự tồn tại.

```text
   Số dư tài khoản đảm bảo theo sổ của bạn : 8.200.000.000
   Số dư theo sao kê ngân hàng             : 8.198.500.000
   ────────────────────────────────────────────────────────
   Lệch                                    :     1.500.000
   → Phải giải thích được từng đồng của khoản lệch này
```

Cấp 3 là cấp mà **cơ quan thanh tra sẽ kiểm tra**.

## Vì sao luôn có chênh lệch — 7 nguyên nhân

Đây là phần quan trọng nhất của bài. Chênh lệch **không phải lúc nào cũng là lỗi** — phần lớn là hiện tượng bình thường cần được giải thích.

### 1. Lệch thời gian (timing difference) — phổ biến nhất

```text
   Giao dịch lúc 23:58 ngày 30/7 theo giờ hệ thống của bạn
   → Đối tác ghi nhận lúc 00:02 ngày 31/7 theo giờ của họ

   ⇒ File đối soát ngày 30/7 của họ KHÔNG có giao dịch này
   ⇒ Sổ của bạn ngày 30/7 CÓ giao dịch này
   ⇒ Lệch — nhưng không ai sai
```

Nguyên nhân: khác múi giờ, khác thời điểm chốt sổ (cut-off time), độ trễ mạng.

**Cách xử lý**: đối chiếu theo **cửa sổ thời gian rộng hơn** (ví dụ ±1 ngày), và luôn kiểm tra xem giao dịch "thiếu" có xuất hiện trong file hôm sau không trước khi báo động.

**Thuật ngữ**: **cut-off time** — thời điểm chốt sổ trong ngày. Mọi giao dịch sau mốc này được tính vào ngày hôm sau. Bạn phải biết cut-off time của **từng đối tác**, và chúng thường khác nhau.

### 2. Giao dịch treo (in-flight transaction)

```text
   Giao dịch đã gửi đi nhưng chưa có kết quả cuối cùng.
   Sổ của bạn: PENDING
   Sổ đối tác: có thể đã SUCCESS, có thể chưa tồn tại
```

Đây không phải lỗi — đó là trạng thái tự nhiên của giao dịch đang xử lý. Nhưng nếu một giao dịch treo **quá lâu** (vài giờ trở lên), nó chuyển từ "bình thường" thành "cần điều tra".

### 3. Chênh lệch phí

```text
   Bạn tính phí : 1.000.000 × 2,0% = 20.000
   Đối tác trừ  : 20.500  (có phụ phí cho thẻ quốc tế mà bạn chưa cập nhật)
   Lệch         : 500 đ mỗi giao dịch × 100.000 giao dịch = 50 triệu
```

Đây chính là nguyên nhân 0,6 tỷ trong sự cố mở đầu. Biểu phí đối tác thay đổi, hệ thống không cập nhật.

**Cách phòng**: **đừng tự tính phí rồi giả định đúng**. Lấy phí từ file đối soát làm nguồn sự thật, và cảnh báo khi phí thực tế lệch với phí dự kiến quá một ngưỡng.

### 4. Giao dịch bị đảo mà không có thông báo

```text
   Ngân hàng phát hành huỷ giao dịch sau khi đã báo thành công
   (thẻ bị báo mất, nghi ngờ gian lận, khách khiếu nại)
   → Webhook thông báo bị thất bại, không retry
   → Bạn vẫn nghĩ giao dịch thành công
```

Đây là 1,9 tỷ trong sự cố mở đầu — và là loại lệch **nguy hiểm nhất**, vì bạn đã giao hàng/trả tiền cho merchant dựa trên thông tin sai.

**Cách phòng**: đừng chỉ dựa vào webhook. **File đối soát là nguồn sự thật cuối cùng.** Mọi giao dịch trong sổ của bạn phải được xác nhận lại bằng file đối soát.

### 5. Giao dịch trùng

```text
   Người dùng bấm nút hai lần / client retry / mạng chập chờn
   → Hai giao dịch được tạo với cùng nội dung
   → Đối tác xử lý cả hai, hoặc chỉ một
```

Cách phòng ở tầng thiết kế: **idempotency key** (phase-6 bài 2). Nhưng đối soát vẫn phải phát hiện được nếu lọt.

### 6. Chênh lệch làm tròn

Tích luỹ từ hàng triệu giao dịch. Bài 7 nói kỹ.

### 7. Lỗi thật của một trong hai bên

Đây là loại duy nhất thực sự là "lỗi", và cũng là loại **ít gặp nhất**. Nhưng vì sáu loại trên tồn tại, nên nếu không có quy trình đối soát tốt, lỗi thật sẽ bị lẫn vào và không ai phát hiện.

## Quy trình đối soát chuẩn

```text
   ┌─────────────────────────────────────────────────────────────┐
   │ BƯỚC 1: THU THẬP                                            │
   │ Tải file đối soát từ đối tác (SFTP, API, email tự động)     │
   │ + Trích xuất dữ liệu tương ứng từ sổ của mình               │
   └───────────────────────────┬─────────────────────────────────┘
                               ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ BƯỚC 2: CHUẨN HOÁ                                           │
   │ Đưa hai nguồn về cùng định dạng: đơn vị tiền, múi giờ,      │
   │ mã trạng thái, cách làm tròn                                │
   └───────────────────────────┬─────────────────────────────────┘
                               ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ BƯỚC 3: GHÉP CẶP (matching)                                 │
   │ Ghép từng giao dịch của hai bên theo khoá chung             │
   └───────────────────────────┬─────────────────────────────────┘
                               ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ BƯỚC 4: PHÂN LOẠI CHÊNH LỆCH                                │
   │ ├── Khớp hoàn toàn          → xong                          │
   │ ├── Chỉ có ở sổ mình        → điều tra                      │
   │ ├── Chỉ có ở sổ đối tác     → điều tra                      │
   │ └── Có ở cả hai, khác số tiền/trạng thái → điều tra         │
   └───────────────────────────┬─────────────────────────────────┘
                               ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ BƯỚC 5: XỬ LÝ                                               │
   │ Tự động hoá các trường hợp đã biết,                         │
   │ đưa phần còn lại cho người xử lý thủ công                   │
   └───────────────────────────┬─────────────────────────────────┘
                               ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ BƯỚC 6: GHI SỔ ĐIỀU CHỈNH                                   │
   │ Mỗi khoản lệch được xử lý phải sinh bút toán tương ứng      │
   └─────────────────────────────────────────────────────────────┘
```

### Ghép cặp theo khoá gì?

Đây là quyết định thiết kế quan trọng:

| Khoá ghép | Ưu | Nhược |
|---|---|---|
| **Mã giao dịch của bạn** gửi kèm khi tạo | Chính xác tuyệt đối | Đối tác phải hỗ trợ trả lại mã này |
| Mã giao dịch của đối tác | Chính xác nếu bạn lưu lại | Chỉ có sau khi giao dịch tạo xong |
| Tổ hợp (số tiền + thời gian + tài khoản) | Không cần chuẩn bị gì | **Không tin cậy** — dễ ghép nhầm khi có giao dịch giống nhau |

**Nguyên tắc thiết kế**: ngay từ khi tích hợp đối tác, **bắt buộc phải có một trường tham chiếu do bạn sinh ra và đối tác trả lại nguyên vẹn** trong file đối soát. Không có nó, đối soát trở thành công việc đoán mò.

## Bốn nhóm kết quả và cách xử lý

```text
   ┌──────────────────────────────────────────────────────────────┐
   │ NHÓM 1: KHỚP (matched)                                       │
   │ Có ở cả hai, cùng số tiền, cùng trạng thái                   │
   │ → Đánh dấu RECONCILED, không cần làm gì                      │
   ├──────────────────────────────────────────────────────────────┤
   │ NHÓM 2: CHỈ CÓ Ở SỔ MÌNH (unmatched - ours)                  │
   │ Nguyên nhân thường gặp:                                      │
   │ ├── Lệch thời gian → chờ file hôm sau                        │
   │ ├── Giao dịch treo → truy vấn lại trạng thái từ đối tác      │
   │ └── Ghi nhận nhầm  → điều tra, có thể phải ghi bút toán đảo  │
   ├──────────────────────────────────────────────────────────────┤
   │ NHÓM 3: CHỈ CÓ Ở SỔ ĐỐI TÁC (unmatched - theirs)             │
   │ NGUY HIỂM NHẤT — nghĩa là có giao dịch xảy ra mà bạn không   │
   │ hề biết. Có thể là:                                          │
   │ ├── Webhook thất bại → phải ghi nhận bổ sung                 │
   │ ├── Giao dịch gian lận → điều tra ngay                       │
   │ └── Đối tác ghi nhầm → khiếu nại                             │
   ├──────────────────────────────────────────────────────────────┤
   │ NHÓM 4: KHỚP NHƯNG KHÁC GIÁ TRỊ (mismatched)                 │
   │ ├── Khác số tiền  → thường là phí hoặc làm tròn              │
   │ └── Khác trạng thái → thường là đảo giao dịch chưa nhận      │
   └──────────────────────────────────────────────────────────────┘
```

**Nhóm 3 phải được ưu tiên xử lý cao nhất.** Nó là dấu hiệu hệ thống của bạn đang "mù" với một phần luồng tiền.

## Ghi sổ cho khoản lệch

Đây là chỗ nhiều đội làm sai: họ tìm ra khoản lệch, ghi vào một file Excel, và... để đó.

**Mọi khoản lệch phải được ghi vào sổ cái**, nếu không sổ sẽ mất cân bằng.

```text
   Phát hiện: đối tác báo đã chuyển 500.000 mà sổ mình không có

   Bước 1 — Ghi nhận khoản lệch vào tài khoản chờ xử lý:
   ┌──────────────────────────────────────┬───────────┬───────────┐
   │ Tiền gửi ngân hàng (Tài sản)         │   500.000 │           │
   │ Chênh lệch đối soát chờ xử lý        │           │   500.000 │
   └──────────────────────────────────────┴───────────┴───────────┘

   Bước 2 — Sau khi điều tra ra là của khách A (webhook thất bại):
   ┌──────────────────────────────────────┬───────────┬───────────┐
   │ Chênh lệch đối soát chờ xử lý        │   500.000 │           │
   │ Ví khách hàng - A                    │           │   500.000 │
   └──────────────────────────────────────┴───────────┴───────────┘
```

Tài khoản `Chênh lệch đối soát chờ xử lý` (bài 3) chính là để phục vụ việc này. Số dư của nó là **thước đo sức khoẻ** của quy trình đối soát: số dư càng gần 0 và càng ít giao dịch tồn đọng thì quy trình càng tốt.

## Chỉ số cần theo dõi

| Chỉ số | Ý nghĩa | Ngưỡng tham khảo |
|---|---|---|
| **Tỉ lệ khớp tự động** (auto-match rate) | % giao dịch khớp mà không cần người xử lý | > 99% |
| **Số khoản chưa khớp tồn đọng** | Đang có bao nhiêu khoản chờ xử lý | Giảm về 0 trong 1-2 ngày |
| **Tuổi khoản chưa khớp lâu nhất** | Khoản cũ nhất chưa xử lý bao nhiêu ngày | < 5 ngày |
| **Số dư tài khoản chênh lệch chờ xử lý** | Giá trị đang treo | Tiến về 0 |
| **Thời gian hoàn thành đối soát** | Từ khi nhận file tới khi xong | < 2 giờ |

Chỉ số quan trọng nhất là **tuổi khoản chưa khớp lâu nhất**. Một khoản treo 60 ngày nghĩa là không ai thực sự xử lý đối soát — chỉ chạy cho có.

## Tần suất đối soát

```text
   Hằng ngày (bắt buộc)  : đối soát giao dịch với mọi đối tác
                           → phát hiện lệch trong 24 giờ
   Hằng ngày (nội bộ)    : cân bằng sổ cái, sổ phụ khớp tài khoản kiểm soát
   Hằng tháng            : đối soát tổng hợp, khớp với sao kê ngân hàng
   Hằng quý/năm          : đối soát phục vụ báo cáo tài chính, kiểm toán
```

**Đối soát hằng ngày là không thương lượng.** Sự cố mở đầu bài xảy ra chính vì đội kỹ thuật nghĩ đối soát là việc "làm cuối quý".

Quy tắc kinh nghiệm: **chi phí xử lý một khoản lệch tăng theo cấp số nhân với thời gian**. Lệch phát hiện sau 1 ngày thì tra log ra ngay; sau 6 tháng thì log đã bị xoá, người liên quan đã nghỉ việc, và đối tác cũng không còn dữ liệu chi tiết.

## Đối soát là bài toán dữ liệu, không phải bài toán kế toán

Về mặt kỹ thuật, đối soát là bài toán ghép hai tập dữ liệu lớn:

```text
   Với 10 triệu giao dịch/ngày:
   ├── Không thể làm bằng Excel
   ├── Không nên làm bằng vòng lặp lồng nhau (O(n²))
   └── Nên: đưa cả hai nguồn vào cùng một nơi, ghép bằng phép JOIN
             trên khoá đã chuẩn hoá, có index
```

Kiến trúc tối thiểu:

```text
   [File đối tác] ─┐
                   ├→ [Bảng staging đã chuẩn hoá] ─→ [JOIN] ─→ [Bảng kết quả]
   [Sổ cái nội bộ]─┘                                              │
                                                                  ▼
                                                    [Hàng đợi xử lý thủ công]
                                                    [Cảnh báo tự động]
                                                    [Bút toán điều chỉnh]
```

Điểm cần lưu ý: **giữ lại file gốc của đối tác, không sửa**. Khi có tranh chấp, file gốc là bằng chứng.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Không đối soát, hoặc chỉ đối soát cuối quý | Lệch tích luỹ tới mức không thể điều tra |
| Ghép cặp bằng (số tiền + thời gian) | Ghép nhầm khi có giao dịch giống nhau |
| Không có mã tham chiếu do mình sinh | Đối soát trở thành đoán mò |
| Tin webhook là nguồn sự thật | Bỏ sót giao dịch bị đảo mà không được thông báo |
| Tự tính phí và giả định đối tác tính giống | Lệch phí tích luỹ âm thầm |
| Tìm ra khoản lệch nhưng không ghi bút toán | Sổ mất cân bằng, lệch không bao giờ được đóng |
| Không theo dõi tuổi khoản chưa khớp | Khoản treo hàng tháng mà không ai biết |
| Bỏ qua nhóm "chỉ có ở sổ đối tác" | Đây là nhóm nguy hiểm nhất |
| Sửa file gốc của đối tác cho "dễ xử lý" | Mất bằng chứng khi tranh chấp |
| Không biết cut-off time của từng đối tác | Báo động giả mỗi ngày, rồi bỏ qua cả báo động thật |

## Tóm tắt bài 6

- **Đối soát là chốt kiểm soát bắt buộc**, không phải việc kế toán làm cho vui.
- Ba cấp độ: **nội bộ** (tự kiểm tra), **với đối tác** (file đối soát), **với ngân hàng** (sao kê thật).
- **Chênh lệch luôn tồn tại** — 7 nguyên nhân, trong đó chỉ 1 là "lỗi thật". Việc của bạn là giải thích được từng khoản.
- Nhóm **"chỉ có ở sổ đối tác" là nguy hiểm nhất** — nghĩa là có tiền chuyển động mà bạn không biết.
- **File đối soát là nguồn sự thật cuối cùng**, không phải webhook.
- **Đừng tự tính phí rồi giả định đúng** — lấy phí từ file đối soát.
- Ghép cặp phải dựa trên **mã tham chiếu do bạn sinh và đối tác trả lại**, không dựa vào số tiền + thời gian.
- **Mọi khoản lệch phải sinh bút toán** vào tài khoản chênh lệch chờ xử lý, và được đóng lại khi điều tra xong.
- **Đối soát hằng ngày là không thương lượng.** Chi phí xử lý một khoản lệch tăng theo cấp số nhân với thời gian.

**Bài kế tiếp** → [Bài 7: Tiền tệ, làm tròn và những đồng lẻ biến mất](07-tien-te-va-lam-tron.md)
