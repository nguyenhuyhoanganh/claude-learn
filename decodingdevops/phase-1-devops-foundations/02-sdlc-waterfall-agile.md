# Bài 2: SDLC — Waterfall, Agile và cuộc cách mạng cách thức làm phần mềm

DevOps không tự nhiên xuất hiện. Nó là **phản ứng** của ngành phần mềm với một quy trình cũ đã hết phù hợp. Hiểu lịch sử SDLC = hiểu vì sao DevOps **bắt buộc** phải tồn tại.

## SDLC — khái niệm gốc

**SDLC** (Software Development Life Cycle) — vòng đời phát triển phần mềm — là một tập **giai đoạn (phase) chuẩn** mà mọi dự án phần mềm đi qua, dù dùng phương pháp nào:

| Giai đoạn | Ai làm | Output |
|---|---|---|
| **Requirement gathering** | Business analyst, PM, khách hàng | Tài liệu yêu cầu (BRD, FRS) |
| **Planning** | PM, kỹ sư trưởng | Lịch, ngân sách, risk register |
| **Design** | Kiến trúc sư, UX designer | Tài liệu kiến trúc, mockup |
| **Development** | Developer | Source code |
| **Testing** | QA engineer | Báo cáo test, bug report |
| **Deployment** | Sysadmin, DevOps | App chạy trên production |
| **Maintenance** | Cả team | Patch, hotfix, monitoring |

Mọi mô hình SDLC (Waterfall, Agile, Spiral, V-Model, Big Bang...) đều dùng **các giai đoạn này**. Khác nhau ở **trình tự, độ lặp, và mức cộng tác**.

## Waterfall — mô hình tuyến tính cổ điển

Cách làm cũ nhất, phổ biến từ 1970s-1990s. Triết lý: **giai đoạn này xong hoàn toàn mới làm giai đoạn kia**.

```text
Requirement  ──► Planning  ──► Design  ──► Development  ──► Testing  ──► Deployment  ──► Maintenance
   (3 tháng)    (1 tháng)    (2 tháng)    (4 tháng)        (2 tháng)    (1 tuần)         (mãi)
```

Tổng cộng: **12+ tháng** mới có release đầu tiên.

### Khi nào Waterfall hoạt động tốt

- **Yêu cầu rõ ràng, ổn định** — vd phần mềm điều khiển thiết bị y tế, hệ thống avionics. Đặc tả ngàn trang, không đổi giữa chừng.
- **Compliance nặng** — cần ký xác nhận từng phase trước khi qua phase tiếp.
- **Một lần deploy duy nhất** — ROM của thiết bị embedded, không update OTA.

### Vì sao Waterfall thất bại với web/mobile

- **Khách hàng không biết hết yêu cầu từ đầu**. Emma trong câu chuyện bài 1 muốn xem sản phẩm rồi mới biết mình muốn gì.
- **Thị trường thay đổi**. 12 tháng sau, đối thủ đã ra feature mới — của bạn lỗi thời.
- **Tốn kém khi sai**. Phát hiện lỗi requirement ở phase Testing → phải làm lại từ Design → mất nhiều tháng.
- **Working software** chỉ xuất hiện ở cuối — rủi ro cực cao.

### Bẫy tinh thần "mini Waterfall"

Một số team tự nhận "Agile" nhưng vẫn chia sprint kiểu: sprint 1 chỉ analysis, sprint 2 chỉ design, sprint 3 chỉ code... → đó vẫn là Waterfall, chỉ chia nhỏ. **Mỗi sprint phải có cả 6 giai đoạn**, kết thúc bằng một deliverable chạy được.

## Agile — chia để thắng

Agile Manifesto (2001) do 17 chuyên gia phần mềm viết, xác định 4 giá trị cốt lõi:

| Giá trị | Diễn giải DevOps-ese |
|---|---|
| Individuals and interactions over processes and tools | Cộng tác giữa team quan trọng hơn việc tuân thủ workflow cứng. |
| Working software over comprehensive documentation | Phần mềm chạy được > tài liệu nghìn trang. |
| Customer collaboration over contract negotiation | Hỏi khách hàng thường xuyên > đoán + bám hợp đồng. |
| Responding to change over following a plan | Đổi hướng khi cần > bám kế hoạch cũ. |

### Agile ở dạng thực tế

```text
Sprint 1 (2 tuần)
  ├─ Requirement (cho feature A)
  ├─ Design (A)
  ├─ Develop (A)
  ├─ Test (A)
  └─ Demo & Deploy ──► Feedback khách hàng
        │
        ▼
Sprint 2 (2 tuần)
  ├─ Requirement (feature B, kèm điều chỉnh A theo feedback)
  ├─ Design (B)
  ├─ Develop (B)
  ├─ Test (A+B)
  └─ Demo & Deploy ──► Feedback
        │
        ... (lặp lại)
```

Mỗi sprint = một **iteration hoàn chỉnh**. Sau mỗi sprint, sản phẩm chạy được. Mỗi sprint có **kết hợp đầy đủ** các phase của SDLC, chỉ phạm vi nhỏ hơn.

### Khung Agile phổ biến

| Framework | Đặc điểm | Hay dùng cho |
|---|---|---|
| **Scrum** | Sprint cố định 2-4 tuần, daily standup, sprint planning + retro | Team 5-9 người |
| **Kanban** | Không sprint, work-in-progress limit, flow liên tục | Team support, ops |
| **XP (eXtreme Programming)** | Pair programming, TDD, refactor liên tục | Team kỹ thuật cao |
| **SAFe (Scaled Agile)** | Gộp nhiều team Scrum ở scale enterprise | Tổ chức 100+ người |
| **LeSS** | "Large-Scale Scrum" — đơn giản hơn SAFe | Tổ chức 10-50 team |

Trong DevOps thường gặp Scrum nhất ở team product, Kanban ở team platform/SRE.

## Mô hình khác — biết để không nhầm

### Spiral

Kết hợp Waterfall + tập trung **rủi ro**. Mỗi vòng xoắn ốc: requirement → risk analysis → development → review. Phù hợp dự án lớn, rủi ro cao (vd quốc phòng).

### V-Model

Waterfall nhưng vẽ thành chữ V — mỗi phase phát triển có một phase test tương ứng (vd Design ↔ System Test). Hay gặp trong embedded, automotive.

### Big Bang

Không có kế hoạch — code, code, code, ai cần gì làm nấy. Chỉ chạy được với team 1-2 người, dự án siêu nhỏ. Đừng dùng ở môi trường professional.

### Iterative & Incremental

Tiền thân của Agile. Tương tự sprint nhưng chu kỳ dài hơn (1-3 tháng), feedback ít chặt chẽ hơn.

## Bảng so sánh nhanh

| Tiêu chí | Waterfall | Agile | Spiral |
|---|---|---|---|
| Độ linh hoạt khi đổi yêu cầu | Rất thấp | Cao | Trung bình |
| Khi nào có sản phẩm chạy | Cuối cùng | Mỗi sprint | Mỗi vòng xoắn |
| Tài liệu | Nặng | Vừa phải | Nặng |
| Phù hợp khi yêu cầu | Rõ, ổn định | Mơ hồ, đổi nhanh | Rủi ro cao, cần phân tích |
| Tần suất release | 1-2 lần/dự án | Liên tục | Vài lần |
| Chi phí khi sai sót cuối | Khủng khiếp | Thấp (phát hiện sớm) | Trung bình |
| Khả năng làm DevOps | Khó | Tự nhiên | Trung bình |

## Vì sao Agile **đẻ ra** nhu cầu DevOps

Đây là nút thắt của bài học. Agile giải quyết được vấn đề **Dev và khách hàng**, nhưng tạo ra vấn đề mới giữa **Dev và Ops**:

```text
Trước Agile (Waterfall):
  Dev release 1 lần/năm ──► Ops deploy 1 lần ──► Mọi người vui

Sau Agile (Scrum 2 tuần):
  Dev release 26 lần/năm ──► Ops vẫn deploy thủ công 26 lần
                              │
                              ▼
                       Quá tải, deploy fail, đổ lỗi
                              │
                              ▼
                       Cần CÁCH MỚI: DevOps
```

DevOps là **đáp ứng kỹ thuật và văn hoá** cho áp lực Agile tạo ra ở phía Ops. Đây là lý do **bạn không nên học DevOps mà không hiểu Agile** — nếu công ty bạn vẫn Waterfall, DevOps sẽ chỉ là cosplay.

## Lifecycle của một feature trong môi trường DevOps trưởng thành

Để thấy SDLC + Agile + DevOps kết hợp ra sao, đây là vòng đời một feature ở team SaaS trưởng thành:

```text
Day 1   - PM viết user story trong Jira
Day 2   - Tech lead, dev, QA refine — chia thành 3 sub-task
Day 3   - Dev tạo branch feature/abc-123, commit code
Day 3   - CI tự build, chạy unit test, integration test
Day 3   - Code review → merge vào main
Day 3   - CD pipeline tự deploy lên staging
Day 4   - QA test trên staging, approve
Day 4   - CD pipeline tự deploy lên production (canary 5% user)
Day 4   - Metric ổn → tự ramp lên 100%
Day 5   - PM verify, đóng story
```

**5 ngày từ ý tưởng đến production**. Không có handoff thủ công. Không có ticket "deploy giúp". Đây là **mục tiêu** của DevOps. Khoá này sẽ giúp bạn xây dựng từng mảnh ghép để đạt được nó.

## Bẫy thường gặp khi áp dụng Agile

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Sprint dài (8+ tuần) | Mất tính iteration, gần Waterfall | Giữ 2-3 tuần |
| Sprint không có demo chạy được | Không có feedback thực | Mỗi sprint phải deploy được lên ít nhất staging |
| Standup biến thành báo cáo cho sếp | Lãng phí, mất tinh thần | Standup là cho team — sếp dự thính, không can thiệp |
| Backlog quá to, không bao giờ làm hết | Demoralize | Cắt mạnh, chấp nhận "won't do" |
| Estimate giờ thay vì story point | Cãi nhau về độ chính xác | Dùng story point (relative) cho velocity |
| Không có Definition of Done | Cãi nhau "xong hay chưa" | Viết DoD: code reviewed + test pass + deployed staging |

## Tóm tắt bài 2

- **SDLC** là bộ phase chuẩn của phát triển phần mềm; mô hình khác nhau ở trình tự và độ lặp.
- **Waterfall** tuyến tính, phù hợp yêu cầu rõ và ổn định; thất bại với web/mobile vì không thích ứng đổi.
- **Agile** lặp 2-4 tuần, ưu tiên working software + feedback nhanh; trở thành chuẩn cho SaaS.
- Agile gây áp lực cho Ops → **đẻ ra nhu cầu DevOps**.
- DevOps không thay thế Agile mà **bổ sung** ở mảng deploy + vận hành.

**Bài kế tiếp** → [Bài 3: Continuous Integration — đào sâu pipeline tự động đầu tiên](03-continuous-integration.md)
