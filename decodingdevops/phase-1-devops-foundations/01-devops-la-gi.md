# Bài 1: DevOps là gì? Vấn đề thực sự DevOps giải quyết

## Một bức tường giữa hai phòng

Tưởng tượng một công ty phần mềm có **hai phòng làm việc** ngăn cách bằng tường gạch dày:

- **Phòng A — Development (Dev)**: lập trình viên, kiến trúc sư, tester. Họ chạy Agile, sprint 2 tuần ra một loạt code mới.
- **Phòng B — Operations (Ops)**: sysadmin, DBA, network admin. Họ giữ server chạy 24/7, tránh sự cố. Triết lý của họ là ITIL — quy trình chặt chẽ, thay đổi càng ít càng tốt.

Mỗi sprint, phòng Dev "ném code qua tường": một file zip + một email "deploy giúp". Phòng Ops nhận, không biết code đụng vào cái gì, không biết phụ thuộc nào mới được thêm, không biết environment cần config gì. Họ thử deploy → thất bại. Họ phàn nàn "tài liệu không rõ". Dev phàn nàn "Ops chậm". Khách hàng phàn nàn "feature đã promised tháng trước đâu rồi?".

Đây là **wall of confusion** — bức tường mơ hồ giữa Dev và Ops mà cả ngành CNTT loay hoay suốt thập kỷ 2000.

**DevOps không phải tool. DevOps là cách phá bức tường đó.**

## Định nghĩa DevOps

> **DevOps** = **Dev**elopment + **Op**eration**s** — một **văn hoá kỹ thuật** kết hợp lập trình và vận hành thành một quy trình **tự động, liên tục, có trách nhiệm chung**, giúp đưa code từ ý tưởng → production **nhanh, ổn định, lặp lại được**.

Phân tích định nghĩa:

| Từ khoá | Ý nghĩa thực tế |
|---|---|
| **Văn hoá** | Trước hết là cách hai team **làm việc cùng nhau**, không phải mua phần mềm. |
| **Kỹ thuật** | Yêu cầu kỹ năng cụ thể: scripting, automation, IaC, CI/CD pipeline. |
| **Tự động** | Mọi bước lặp đi lặp lại (build, test, deploy, provision) phải do máy làm. |
| **Liên tục** | Code chảy thành dòng (continuous), không gom thành lô lớn (batch). |
| **Trách nhiệm chung** | Dev hiểu vận hành, Ops hiểu code. Không còn "không phải việc của tôi". |
| **Lặp lại được** | Deploy lần thứ 100 phải giống lần đầu, ở mọi môi trường. |

## Câu chuyện Emma — vì sao DevOps cần thiết

Cùng đi qua một câu chuyện thực tế để hiểu vấn đề mà DevOps giải quyết.

**Emma** mở một gallery nghệ thuật, muốn bán tranh qua mobile app. Cô thuê một công ty phần mềm:

```text
Yêu cầu (Emma)
   │
   ▼
Requirement Analysis ──► Planning ──► Design
                                        │
                                        ▼
                                  Development ──► Testing
                                                    │
                                                    ▼
                                              Deployment ──► Maintenance
```

Đây là **SDLC** (Software Development Life Cycle). Đến đây mọi thứ vẫn ổn — trong lý thuyết.

### Áp dụng Waterfall — và vì sao thất bại

Cách cổ điển: làm xong giai đoạn này mới làm giai đoạn kia. Mỗi giai đoạn 1-2 tháng. Tổng cộng: **5-9 tháng** mới có sản phẩm đầu tiên cho Emma xem.

Vấn đề:
- Emma không biết yêu cầu chính xác từ đầu — cô muốn xem, sờ, góp ý, thay đổi.
- Khi Emma thấy app sau 7 tháng, cô bảo "tôi muốn khác" → phải làm lại từ design → vứt đi nhiều công sức.

→ Waterfall **thất bại với business hiện đại** vì giả định "biết hết yêu cầu từ đầu" hiếm khi đúng.

### Chuyển sang Agile — và vấn đề mới xuất hiện

Agile chia công việc thành **iteration ngắn (sprint) 2-4 tuần**. Mỗi sprint Dev đẩy ra một bản demo cho Emma xem.

```text
Sprint 1 (2 tuần) ──► Demo Emma ──► Feedback
        │                              │
        ▼                              ▼
Sprint 2 (2 tuần) ──► Demo Emma ──► Feedback
        │
        ... (tiếp diễn)
```

Tuyệt vời cho Emma. Nhưng **Ops bị quá tải**:

- Sprint 1 → Dev đẩy 1 build → Ops phải deploy lên server test.
- Sprint 1 thêm hotfix → deploy lại.
- Sprint 1 đổi config → deploy lại.
- Sprint 2 → bắt đầu lại từ đầu.

Một sprint có thể có **20-30 lần deploy**. Ops vẫn làm thủ công như thời Waterfall (1-2 deploy/tháng). Hệ quả:

- Deploy fail thường xuyên (cấu hình môi trường khác nhau).
- Ops dồn việc, deadline trễ.
- Dev đổ lỗi cho Ops chậm.
- Ops đổ lỗi cho Dev không rõ ràng.
- **Bức tường mơ hồ mọc lên**.

### DevOps phá bức tường

DevOps yêu cầu **automation** trên toàn bộ quy trình:

```text
Dev commit code
   │
   ▼ (auto)
Build ──► Run unit test ──► Build artifact
   │
   ▼ (auto)
Deploy lên test environment ──► Run integration test
   │
   ▼ (auto)
Deploy lên staging ──► Run smoke test, load test
   │
   ▼ (auto hoặc manual approval)
Deploy lên production ──► Monitor health, rollback nếu lỗi
```

Mỗi mũi tên (auto) là một **bước tự động hoá** — không cần email, không cần ticket, không cần ai click chuột.

## DevOps thực ra là 3 trụ cột

Không có một thứ duy nhất gọi là "DevOps". Nó là sự kết hợp của 3 thứ:

### Trụ cột 1 — Văn hoá (Culture)

- Dev và Ops thuộc cùng một team, ngồi cạnh nhau (hoặc cùng channel chat).
- Cùng on-call khi sự cố production (Dev không được "ném code rồi đi ngủ").
- Cùng review post-mortem khi có sự cố — không đổ lỗi, tìm root cause.
- "You build it, you run it" (Amazon) — team viết feature cũng vận hành nó.

### Trụ cột 2 — Tự động hoá (Automation)

Mọi tác vụ lặp đi lặp lại phải có script/tool:

| Tác vụ | Tool điển hình |
|---|---|
| Build source code | Maven, Gradle, npm, Make |
| Chạy test | JUnit, pytest, Jest |
| Build container | Docker |
| Deploy lên server | Ansible, Chef, Puppet |
| Provision infrastructure | Terraform, CloudFormation, Pulumi |
| Orchestrate workflow | Jenkins, GitHub Actions, GitLab CI, CircleCI |
| Run app trên cluster | Kubernetes |
| Theo dõi health | Prometheus, Grafana, ELK |

### Trụ cột 3 — Đo lường (Measurement)

DevOps không phải làm cho cảm giác. Phải đo:

- **Deployment frequency** — bao nhiêu deploy/ngày.
- **Lead time** — từ commit đến production mất bao lâu.
- **Mean Time To Recovery (MTTR)** — khi production hỏng, bao lâu khôi phục.
- **Change failure rate** — % deploy gây sự cố.

Đây là **4 DORA metrics** — chuẩn ngành để đánh giá DevOps maturity.

| Mức | Deploy frequency | Lead time | MTTR | Failure rate |
|---|---|---|---|---|
| Elite | Nhiều lần/ngày | < 1 giờ | < 1 giờ | 0-15% |
| High | 1/ngày – 1/tuần | 1 ngày – 1 tuần | < 1 ngày | 0-15% |
| Medium | 1/tuần – 1/tháng | 1 tuần – 1 tháng | < 1 ngày | 0-30% |
| Low | < 1/tháng | > 1 tháng | > 1 tuần | > 30% |

## DevOps ≠ một chức danh công việc

Cẩn thận với hiểu lầm phổ biến nhất: **"DevOps Engineer"** là một chức danh, nhưng DevOps bản thân nó **không phải một role riêng**.

| Hiểu lầm | Thực tế |
|---|---|
| "Thuê 1 DevOps Engineer là có DevOps" | Sai. Cần cả team thay đổi cách làm việc. |
| "DevOps Engineer là sysadmin thời mới" | Sai. DevOps yêu cầu code/script như Dev, không chỉ vận hành. |
| "DevOps Engineer làm cả Dev lẫn Ops" | Một phần đúng — nhưng vai trò chính là **xây platform/pipeline** để các team Dev khác dùng được. |
| "Có CI/CD pipeline = đã làm DevOps" | Sai. Đó là một phần. Văn hoá và measurement vẫn cần. |

## Trade-off — Khi nào KHÔNG cần DevOps?

DevOps có chi phí khởi tạo cao (setup tooling, đào tạo, đổi văn hoá). Không phải lúc nào cũng đáng.

**Có thể bỏ qua hoặc rút gọn DevOps khi:**

- Dự án nội bộ rất nhỏ, 1-2 dev, deploy 1 lần rồi để chạy mãi (vd: script chạy cron).
- Prototype/POC dùng 1-2 tuần rồi vứt.
- Sản phẩm shrink-wrapped không deploy continuous (vd: phần mềm bán theo CD-ROM — không còn phổ biến nhưng vẫn tồn tại).
- Đội ngũ < 5 người và deploy < 1 lần/tháng — pipeline phức tạp có thể tốn hơn lợi ích.

**Tuyệt đối nên có DevOps khi:**

- SaaS chạy 24/7, có user thật.
- Deploy thường xuyên (≥ vài lần/tuần).
- Nhiều môi trường (dev, test, staging, prod) phải đồng bộ.
- Tuân thủ pháp lý cần audit trail (banking, healthcare).

## Một mạch xuyên suốt khoá học

Trong khoá này, ta sẽ **build dần** từng mảnh ghép của một DevOps stack hoàn chỉnh:

```text
Foundations (bài này, CI/CD concept)
     │
     ▼
Linux + Git + Networking (kỹ năng nền tảng)
     │
     ▼
Virtualization + Vagrant (môi trường lab)
     │
     ▼
Scripting (Bash, Python) — vũ khí automation
     │
     ▼
Cloud (AWS, GCP) — nơi chạy hạ tầng
     │
     ▼
Build tools (Maven, npm) + Artifact repo (Nexus)
     │
     ▼
CI tools (Jenkins, GitHub Actions, GitLab)
     │
     ▼
IaC (Terraform) + Configuration mgmt (Ansible)
     │
     ▼
Containers (Docker) + Orchestration (Kubernetes)
     │
     ▼
Monitoring + Observability (Prometheus, Grafana)
     │
     ▼
Hoàn chỉnh — toàn bộ pipeline end-to-end
```

Mỗi bài là **một mảnh ghép**. Đừng skip — DevOps là một bộ kỹ năng tích lũy, không phải kiến thức rời rạc.

## Tóm tắt bài 1

- **DevOps = văn hoá + tự động hoá + đo lường** để Dev và Ops làm việc như một team.
- Vấn đề gốc: Agile dev nhanh nhưng Ops thủ công → bottleneck.
- 4 DORA metrics đo "DevOps tốt hay chưa": deploy frequency, lead time, MTTR, change failure rate.
- DevOps không phải chỉ là chức danh hay tool. Mua Jenkins không tự nhiên có DevOps.
- Không phải mọi dự án đều cần DevOps — phụ thuộc tần suất deploy + quy mô team.

**Bài kế tiếp** → [Bài 2: SDLC — Waterfall, Agile và cuộc cách mạng cách thức làm phần mềm](02-sdlc-waterfall-agile.md)
