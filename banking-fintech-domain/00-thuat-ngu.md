# Từ điển thuật ngữ — Ngân hàng & Fintech

Mọi thuật ngữ tiếng Anh xuất hiện trong khoá, kèm nghĩa tiếng Việt và chỉ dẫn tới bài học sâu. Cột **Đọc là** ghi phiên âm gần đúng.

---

## 1. Tiền và cách biểu diễn

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Minor unit** | mai-nơ | **Đơn vị nhỏ nhất** của một đồng tiền — xu với USD, đồng với VND | [1.1](phase-1-tien-va-so-cai/01-tien-trong-he-thong.md) |
| **Scale / exponent** | | **Số chữ số thập phân** của đồng tiền: USD = 2, VND = 0, KWD = 3 | [1.7](phase-1-tien-va-so-cai/07-tien-te-va-lam-tron.md) |
| **ISO 4217** | | **Chuẩn mã tiền tệ** ba chữ cái: `VND`, `USD`, `JPY` | [1.7](phase-1-tien-va-so-cai/07-tien-te-va-lam-tron.md) |
| **Money object** | | **Đối tượng tiền** — luôn gồm **số tiền + mã tiền tệ**, không bao giờ chỉ một con số | [1.1](phase-1-tien-va-so-cai/01-tien-trong-he-thong.md) |
| **Floating point** | phlốt-ting | **Số thực dấu chấm động** — `0.1 + 0.2 ≠ 0.3`; **tuyệt đối không dùng cho tiền** | [1.1](phase-1-tien-va-so-cai/01-tien-trong-he-thong.md) |
| **Banker's rounding** | ben-cơ | **Làm tròn ngân hàng** — số 5 làm tròn về phía chẵn, giảm sai lệch tích luỹ | [1.7](phase-1-tien-va-so-cai/07-tien-te-va-lam-tron.md) |
| **Penny shaving** | pen-ni | **Gọt đồng lẻ** — gian lận bằng cách gom phần làm tròn bị mất | [1.7](phase-1-tien-va-so-cai/07-tien-te-va-lam-tron.md) |
| **FX rate** | ép-ích | **Tỷ giá hối đoái**; cần phân biệt tỷ giá mua, bán và tỷ giá tham chiếu | [1.7](phase-1-tien-va-so-cai/07-tien-te-va-lam-tron.md) |

## 2. Sổ cái và hạch toán

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Ledger** | lét-jơ | **Sổ cái** — nơi ghi mọi biến động tiền, chỉ ghi thêm, không sửa | [1.2](phase-1-tien-va-so-cai/02-hach-toan-kep.md) |
| **Double-entry bookkeeping** | đắp-bồ en-tri | **Hạch toán kép** — mỗi giao dịch ghi vào **ít nhất hai** tài khoản, tổng nợ = tổng có | [1.2](phase-1-tien-va-so-cai/02-hach-toan-kep.md) |
| **Debit / Credit** | đét-bịt / cre-địt | **Nợ / Có** — hai vế của một bút toán; **không** đồng nghĩa "trừ tiền / cộng tiền" | [1.2](phase-1-tien-va-so-cai/02-hach-toan-kep.md) |
| **Journal entry** | jơ-nồ | **Bút toán** — một lần ghi sổ, gồm nhiều dòng nợ và có | [1.2](phase-1-tien-va-so-cai/02-hach-toan-kep.md) |
| **Chart of accounts** | | **Danh mục tài khoản** — cây tài khoản của cả hệ thống | [1.3](phase-1-tien-va-so-cai/03-he-thong-tai-khoan.md) |
| **Account type** | | **Loại tài khoản**: tài sản, nợ phải trả, vốn, doanh thu, chi phí | [1.3](phase-1-tien-va-so-cai/03-he-thong-tai-khoan.md) |
| **Immutability** | im-miu-ta-bi-li-ti | **Tính bất biến** — sổ cái không được sửa hay xoá, chỉ ghi bút toán đảo | [1.2](phase-1-tien-va-so-cai/02-hach-toan-kep.md) |
| **Reversal entry** | ri-vơ-sồ | **Bút toán đảo** — cách duy nhất để "sửa" một bút toán đã ghi | [1.2](phase-1-tien-va-so-cai/02-hach-toan-kep.md) |
| **Trial balance** | trai-ồ | **Bảng cân đối thử** — kiểm tra tổng nợ có bằng tổng có không | [1.2](phase-1-tien-va-so-cai/02-hach-toan-kep.md) |

## 3. Số dư và phong toả

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Ledger balance** | | **Số dư sổ cái** — tổng mọi bút toán đã ghi | [1.4](phase-1-tien-va-so-cai/04-so-du-kha-dung-va-phong-toa.md) |
| **Available balance** | | **Số dư khả dụng** = số dư sổ cái − tiền đang bị giữ | [1.4](phase-1-tien-va-so-cai/04-so-du-kha-dung-va-phong-toa.md) |
| **Hold / Authorization hold** | hôn | **Giữ chỗ / phong toả** — tạm giữ tiền chưa trừ hẳn | [1.4](phase-1-tien-va-so-cai/04-so-du-kha-dung-va-phong-toa.md) |
| **Pending transaction** | pen-đing | **Giao dịch chờ** — đã trừ khả dụng nhưng chưa ghi sổ chính thức | [1.4](phase-1-tien-va-so-cai/04-so-du-kha-dung-va-phong-toa.md) |
| **Overdraft** | ô-vơ-đráp | **Thấu chi** — cho phép số dư âm tới một hạn mức | [1.4](phase-1-tien-va-so-cai/04-so-du-kha-dung-va-phong-toa.md) |
| **Insufficient funds** | | **Không đủ số dư** — phải kiểm tra trên **khả dụng**, không phải sổ cái | [1.4](phase-1-tien-va-so-cai/04-so-du-kha-dung-va-phong-toa.md) |

## 4. Vòng đời giao dịch

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Authorization** | o-thơ-rai-dây-sần | **Cấp phép** — xác nhận có tiền và cho phép giao dịch, chưa chuyển tiền | [1.5](phase-1-tien-va-so-cai/05-vong-doi-giao-dich.md) |
| **Capture** | cáp-chơ | **Ghi nhận** — chốt số tiền thật sự thu, có thể nhỏ hơn số đã cấp phép | [1.5](phase-1-tien-va-so-cai/05-vong-doi-giao-dich.md) |
| **Settlement** | sét-tồ-mần | **Quyết toán** — tiền thật sự chuyển giữa các ngân hàng, thường T+1 hoặc T+2 | [1.5](phase-1-tien-va-so-cai/05-vong-doi-giao-dich.md) |
| **Clearing** | cli-ơ-ring | **Bù trừ** — đối chiếu và tính số ròng phải trả giữa các bên | [1.5](phase-1-tien-va-so-cai/05-vong-doi-giao-dich.md) |
| **Void** | vôi | **Huỷ** — bỏ giao dịch **trước** khi quyết toán | [1.5](phase-1-tien-va-so-cai/05-vong-doi-giao-dich.md) |
| **Refund** | ri-phân | **Hoàn tiền** — giao dịch ngược **sau** khi đã quyết toán | [1.5](phase-1-tien-va-so-cai/05-vong-doi-giao-dich.md) |
| **Chargeback** | chác-béc | **Đòi bồi hoàn** — chủ thẻ khiếu nại, ngân hàng cưỡng chế lấy tiền về | [1.5](phase-1-tien-va-so-cai/05-vong-doi-giao-dich.md) |
| **T+1 / T+2** | | **Ngày quyết toán** — 1 hoặc 2 ngày làm việc sau ngày giao dịch | [1.5](phase-1-tien-va-so-cai/05-vong-doi-giao-dich.md) |
| **Idempotency key** | ai-đêm-pô-tần-si | **Khoá chống trùng** — đảm bảo gọi lại không tạo giao dịch thứ hai | [1.5](phase-1-tien-va-so-cai/05-vong-doi-giao-dich.md) |
| **Cut-off time** | cắt-óp | **Giờ chốt sổ** — mốc phân định giao dịch thuộc ngày nào | [1.6](phase-1-tien-va-so-cai/06-doi-soat.md) |

## 5. Đối soát

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt | Bài |
|---|---|---|---|
| **Reconciliation** | re-cần-xi-li-ây-sần | **Đối soát** — so sổ của mình với sổ của đối tác, tìm và xử lý chênh lệch | [1.6](phase-1-tien-va-so-cai/06-doi-soat.md) |
| **Statement file** | stết-mần | **File sao kê** đối tác gửi sang để đối soát | [1.6](phase-1-tien-va-so-cai/06-doi-soat.md) |
| **Matching** | mát-ching | **Khớp lệnh** — ghép giao dịch hai bên theo mã tham chiếu, số tiền, thời gian | [1.6](phase-1-tien-va-so-cai/06-doi-soat.md) |
| **Break / Discrepancy** | brếch | **Chênh lệch** — dòng không khớp được, phải điều tra | [1.6](phase-1-tien-va-so-cai/06-doi-soat.md) |
| **Suspense account** | sát-pần | **Tài khoản treo** — nơi giữ tạm khoản chưa xác định được, **phải về 0** | [1.6](phase-1-tien-va-so-cai/06-doi-soat.md) |
| **Timing difference** | | **Lệch do thời điểm** — cùng giao dịch nhưng hai bên ghi khác ngày | [1.6](phase-1-tien-va-so-cai/06-doi-soat.md) |
| **Duplicate** | điu-pli-cệt | **Trùng** — cùng một giao dịch bị ghi hai lần | [1.6](phase-1-tien-va-so-cai/06-doi-soat.md) |

## 6. Hệ sinh thái thanh toán

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Issuer** | i-siu-ơ | **Ngân hàng phát hành** thẻ cho người mua |
| **Acquirer** | ơ-quai-rơ | **Ngân hàng thu hộ** cho đơn vị bán hàng |
| **PSP** (*Payment Service Provider*) | pi-ét-pi | **Đơn vị cung cấp dịch vụ thanh toán** — cổng thanh toán |
| **Merchant** | mơ-chần | **Đơn vị bán hàng** nhận thanh toán |
| **Card scheme** | | **Tổ chức thẻ** — Visa, Mastercard, JCB, NAPAS |
| **Interchange fee** | in-tơ-chênh | **Phí trao đổi** — phí acquirer trả cho issuer |
| **MDR** (*Merchant Discount Rate*) | em-đi-a | **Phí chiết khấu** đơn vị bán hàng phải chịu |
| **Payment rail** | rêl | **Đường thanh toán** — hạ tầng chuyển tiền: thẻ, chuyển khoản, ví |
| **Escrow** | ét-crâu | **Ký quỹ** — bên thứ ba giữ tiền tới khi điều kiện được thoả mãn |

## 7. Rủi ro, tuân thủ và chống gian lận

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **KYC** (*Know Your Customer*) | kây-oai-si | **Định danh khách hàng** — xác minh người dùng là ai |
| **AML** (*Anti-Money Laundering*) | ây-em-eo | **Phòng chống rửa tiền** |
| **CTF** (*Counter-Terrorist Financing*) | | **Chống tài trợ khủng bố** |
| **Sanction screening** | sanh-sần | **Rà soát danh sách cấm vận** |
| **PEP** (*Politically Exposed Person*) | pép | **Người có ảnh hưởng chính trị** — nhóm cần giám sát chặt hơn |
| **Transaction monitoring** | | **Giám sát giao dịch** — phát hiện mẫu bất thường |
| **STR / SAR** | | **Báo cáo giao dịch đáng ngờ** gửi cơ quan quản lý |
| **PCI DSS** | pi-si-ai | **Chuẩn bảo mật dữ liệu thẻ** — quy định cách lưu và truyền dữ liệu thẻ |
| **Tokenization** | tô-cần-nai-dây-sần | **Mã hoá thay thế** — thay số thẻ bằng token vô nghĩa |
| **3-D Secure** | | Lớp **xác thực bổ sung** cho giao dịch thẻ trực tuyến |
| **Velocity check** | vơ-lo-si-ti | **Kiểm tra tần suất** — chặn nhiều giao dịch bất thường trong thời gian ngắn |
| **False positive** | | **Báo động giả** — chặn nhầm giao dịch hợp lệ |

## 8. Tín dụng

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Principal** | prin-si-pồ | **Nợ gốc** |
| **Interest** | in-tơ-rét | **Lãi** |
| **APR** (*Annual Percentage Rate*) | ây-pi-a | **Lãi suất năm** đã gồm phí — con số so sánh được giữa các sản phẩm |
| **Amortization** | ơ-moọc-tai-dây-sần | **Lịch trả nợ** — chia đều gốc và lãi theo kỳ |
| **Credit limit** | | **Hạn mức tín dụng** |
| **Utilization** | | **Tỷ lệ sử dụng hạn mức** |
| **Delinquency** | đi-lin-quần-si | **Chậm trả** — quá hạn nhưng chưa xử lý nợ xấu |
| **Default** | đi-phôn | **Vỡ nợ** |
| **NPL** (*Non-Performing Loan*) | | **Nợ xấu** |
| **Provision** | prồ-vi-sần | **Trích lập dự phòng** rủi ro tín dụng |
| **Credit scoring** | | **Chấm điểm tín dụng** |
| **BNPL** (*Buy Now Pay Later*) | | **Mua trước trả sau** |

---

## Mười điều dễ nhầm nhất

| Nhiều người nghĩ | Sự thật |
|---|---|
| Lưu tiền bằng `float`/`double` cho tiện | ❌ `0.1 + 0.2 ≠ 0.3` — dùng **số nguyên đơn vị nhỏ nhất** hoặc `DECIMAL` |
| Số tiền là một con số | ❌ Luôn là **số tiền + mã tiền tệ**; thiếu mã tiền tệ là bug chờ nổ |
| Mọi đồng tiền có 2 chữ số thập phân | ❌ VND và JPY có **0**, KWD và BHD có **3** |
| Debit là trừ tiền, Credit là cộng tiền | ❌ Tuỳ **loại tài khoản** — với tài khoản nợ phải trả thì ngược lại |
| Sửa sai thì `UPDATE` lại bản ghi | ❌ Sổ cái **bất biến** — chỉ được ghi **bút toán đảo** |
| Kiểm tra đủ tiền trên số dư sổ cái | ❌ Phải kiểm trên **số dư khả dụng** (đã trừ tiền đang giữ) |
| Cấp phép xong là tiền đã chuyển | ❌ Cấp phép ≠ ghi nhận ≠ quyết toán — ba mốc khác nhau, cách nhau nhiều ngày |
| Đối soát lệch là do có bug | ❌ Lệch do **thời điểm** là bình thường; cái đáng lo là lệch **không giải thích được** |
| Tài khoản treo để đó rồi tính sau | ❌ Tài khoản treo **phải về 0**, nếu không nó thành nơi giấu lỗi |
| Chia tiền xong là xong | ❌ Phải **kiểm tra tổng sau khi chia** — thà từ chối còn hơn làm lệch sổ |

---

**Về mục lục** → [README khoá học](README.md) · **Giới thiệu** → [00-gioi-thieu.md](00-gioi-thieu.md)
