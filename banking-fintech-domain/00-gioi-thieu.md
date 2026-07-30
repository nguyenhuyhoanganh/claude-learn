# Khoá học: Nghiệp vụ Ngân hàng & Fintech

## Vì sao có khoá này?

Bạn viết được API, biết thiết kế database, hiểu về scaling. Rồi bạn vào làm một công ty fintech, và tuần đầu tiên nghe những câu như:

> "Giao dịch này đã **capture** chưa hay mới **authorize**?"
> "Sao **số dư khả dụng** lại khác **số dư thực**?"
> "Bút toán này **Nợ** tài khoản nào, **Có** tài khoản nào?"
> "File **đối soát** từ NAPAS về lệch 3 giao dịch, xử lý sao?"
> "Khoản vay này đang ở **nhóm 2** hay **nhóm 3**?"

Không có câu nào trong đó là vấn đề kỹ thuật. Chúng là **nghiệp vụ tài chính** — và nếu không hiểu, bạn sẽ viết ra một hệ thống chạy đúng về mặt code nhưng **sai về mặt tiền bạc**.

Trong tài chính, sai nghĩa là mất tiền thật của người thật.

## Khoá này viết cho ai?

- **Lập trình viên** sắp hoặc đang làm trong ngân hàng, ví điện tử, cổng thanh toán, công ty cho vay.
- **BA / PO / QA** cần hiểu bản chất nghiệp vụ để viết yêu cầu và kiểm thử cho đúng.
- Bất kỳ ai muốn hiểu **tiền thực sự di chuyển như thế nào** trong hệ thống.

Bạn **không cần** biết trước gì về kế toán hay tài chính. Mọi thuật ngữ đều được định nghĩa ngay lần đầu xuất hiện.

## Khoá này KHÔNG phải cái gì

- **Không phải khoá lập trình.** Rất ít code. Trọng tâm là *hiểu nghiệp vụ*; phần kỹ thuật chỉ xuất hiện khi nó quyết định tính đúng đắn của nghiệp vụ.
- **Không phải tài liệu pháp lý.** Các quy định được nêu để bạn biết chúng tồn tại và ảnh hưởng tới thiết kế ra sao, không thay thế tư vấn pháp lý.
- **Không phải khoá kế toán.** Chỉ lấy phần kế toán mà người xây hệ thống bắt buộc phải hiểu.

## Cách khoá này được xây dựng

Mỗi bài đi theo một mạch cố định:

```text
   1. MỘT SỰ CỐ CÓ THẬT      → để bạn thấy vì sao kiến thức này quan trọng
   2. NGHIỆP VỤ ĐẰNG SAU     → giải thích bản chất, định nghĩa mọi thuật ngữ
   3. LUỒNG TIỀN & CÁC BÊN   → sơ đồ ai chuyển gì cho ai, khi nào
   4. CÁCH LÀM ĐÚNG          → quy tắc nghiệp vụ, và hệ quả lên thiết kế hệ thống
   5. BẪY THƯỜNG GẶP         → những chỗ đội kỹ thuật hay làm sai
```

## Bản đồ khoá học

```text
   ┌─────────────────────────────────────────────────────────────┐
   │  phase-1: TIỀN VÀ SỔ CÁI                                    │
   │  Nền móng. Không hiểu phần này thì mọi phần sau đều mơ hồ.  │
   └──────────────────────────┬──────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐
   │  phase-2    │   │  phase-3    │   │   phase-4       │
   │ THANH TOÁN  │   │  TÍN DỤNG   │   │ RỦI RO & TUÂN   │
   │ Tiền di     │   │ Tiền cho    │   │ THỦ             │
   │ chuyển      │   │ vay & thu   │   │ Ai được làm gì  │
   └─────────────┘   └─────────────┘   └─────────────────┘
          └───────────────────┼───────────────────┘
                              ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  phase-5: CASE SỰ CỐ THỰC CHIẾN                             │
   │  10 sự cố tài chính kinh điển, mổ xẻ từ hiện tượng tới gốc  │
   └──────────────────────────┬──────────────────────────────────┘
                              ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  phase-6: THIẾT KẾ HỆ THỐNG TÀI CHÍNH                       │
   │  Biến toàn bộ hiểu biết trên thành mô hình dữ liệu & quy tắc│
   └─────────────────────────────────────────────────────────────┘
```

| Phase | Chủ đề | Bạn học được gì |
|---|---|---|
| **phase-1** | Tiền, tài khoản và sổ cái | Hạch toán kép, bút toán, số dư khả dụng vs thực, vòng đời giao dịch, đối soát, làm tròn tiền tệ |
| **phase-2** | Thanh toán và chuyển tiền | Ai là ai trong hệ sinh thái, chuyển khoản liên ngân hàng, thẻ, QR, ví điện tử, cổng thanh toán, hoàn tiền & tranh chấp |
| **phase-3** | Tín dụng và cho vay | Vòng đời khoản vay, chấm điểm tín dụng, các cách tính lãi, lịch trả nợ, nhóm nợ và dự phòng |
| **phase-4** | Rủi ro và tuân thủ | KYC/eKYC, AML, hạn mức, chống gian lận, audit trail, bảo mật dữ liệu thẻ |
| **phase-5** | Case sự cố thực chiến | 10 sự cố kinh điển: trừ tiền hai lần, tiền đi không tới, lệch sổ, số dư âm, đối soát lệch... |
| **phase-6** | Thiết kế hệ thống tài chính | Mô hình ledger, idempotency, saga cho luồng tiền, đối soát tự động, đóng sổ |

## Bối cảnh: quốc tế và Việt Nam

Khoá học dạy **chuẩn quốc tế làm nền** (vì nó là ngôn ngữ chung của ngành), và **nêu rõ đặc thù Việt Nam** ở mỗi chỗ có khác biệt:

```text
   Chuẩn quốc tế             Đặc thù Việt Nam
   ─────────────             ────────────────
   ISO 20022, ISO 8583   →   Citad/IBPS, NAPAS 24/7
   ACH, SEPA, SWIFT      →   Chuyển khoản nhanh 24/7
   EMV QR                →   VietQR
   Credit bureau         →   CIC (Trung tâm Thông tin Tín dụng)
   IFRS 9                →   Thông tư của NHNN về phân loại nợ
   PCI DSS               →   PCI DSS (áp dụng như nhau)
```

Các đặc thù Việt Nam được đánh dấu bằng khối ghi chú riêng, dễ nhận ra.

## Nguyên tắc xuyên suốt

Ba nguyên tắc này xuất hiện lại ở gần như mọi bài. Đọc trước để có khung tư duy:

**1. Tiền không bao giờ biến mất — nó chỉ chuyển chỗ.**
Mọi đồng tiền rời khỏi một nơi phải xuất hiện ở một nơi khác. Nếu hệ thống của bạn cho phép tiền "bốc hơi", thiết kế đã sai.

**2. Trạng thái quan trọng hơn số dư.**
Một giao dịch không chỉ có "thành công" và "thất bại". Nó có *đang chờ*, *đã ghi nhận*, *đã quyết toán*, *đã đối soát*, *đang tranh chấp*. Nhầm lẫn giữa các trạng thái này là nguồn của phần lớn sự cố tài chính.

**3. Mọi thứ phải giải thích được.**
Với bất kỳ số dư nào tại bất kỳ thời điểm nào, bạn phải trả lời được: *nó đến từ đâu, qua những bút toán nào, ai thực hiện, lúc nào*. Không giải thích được nghĩa là không kiểm toán được.

## Tài liệu đi kèm

- **[Từ điển thuật ngữ](00-thuat-ngu.md)** — mọi thuật ngữ tiếng Anh trong ngành tài chính, định nghĩa tiếng Việt, kèm chỉ dẫn tới bài học sâu.

## Một câu chuyện để bắt đầu

> Một ví điện tử triển khai tính năng "chuyển tiền cho bạn bè". Code rất đơn giản: trừ số dư người gửi, cộng số dư người nhận, xong.
>
> Chạy tốt ba tháng. Rồi một ngày, đội kế toán phát hiện: **tổng số dư của tất cả người dùng không khớp với số tiền thực có trong tài khoản ngân hàng của công ty**. Lệch 340 triệu đồng.
>
> Không ai biết tiền đi đâu. Không có bút toán nào để lần theo. Không biết lệch từ ngày nào. Không biết bao nhiêu giao dịch bị ảnh hưởng.
>
> Họ mất **sáu tuần** để dựng lại lịch sử từ log, và cuối cùng phải viết lại toàn bộ tầng lưu trữ tiền theo mô hình **hạch toán kép**.

Nếu ngay từ đầu họ hiểu bài 2 của phase-1, sự cố này đã không xảy ra. Đó là lý do khoá học bắt đầu từ chỗ đó.

**Bài kế tiếp** → [Phase 1 - Bài 1: Tiền trong hệ thống là gì?](phase-1-tien-va-so-cai/01-tien-trong-he-thong.md)
