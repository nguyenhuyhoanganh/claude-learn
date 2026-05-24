# Bài 1: Continuous Integration là gì?

Phase 1 bạn đã viết pipeline tự build + test một file `laptop.txt`. Đó là bước đầu. Phase 2 nâng lên một bậc: thay file text bằng **website thật**, viết pipeline pull code từ **GitHub**, build trong **Docker container**, chạy **unit test** và **E2E test** (Playwright), publish **test report**. Đây là **CI thực sự** trong môi trường công ty.

## Vì sao có khái niệm Continuous Integration?

Trước khi có CI, software development thường diễn ra như sau:

```text
Tuần 1                                              Tuần 4 (release day)
──────────────────────────────────────────────────────────────────────►

Dev A:   [code feature X ────────────────────────►]    │
Dev B:        [code feature Y ─────────────────►]      │ MERGE ALL
Dev C:               [code feature Z ─────────►]       │ → conflicts
Dev D:           [refactor module W ─────────►]        │ → integration bugs
                                                       │ → release delayed
```

Mỗi developer làm độc lập 2-4 tuần, đến hạn release mới **merge tất cả vào main**. Đó là lúc địa ngục bắt đầu:

- **Merge conflicts** khổng lồ — code của 4 người chạm nhau ở 100 file.
- **Integration bugs** — feature X gọi function bị B đổi signature, feature Y dùng module bị D xoá…
- **"Works on my machine"** — code Dev A chạy local nhưng tích hợp với code Dev B thì crash.

Hậu quả: release delayed, team mất cuối tuần fix conflict, atmosphere độc hại.

## Giải pháp CI

**Continuous Integration** = mỗi khi có code thay đổi nhỏ → **merge ngay** vào nhánh chính → **tự động build + test** → biết liền có conflict hay regression hay không.

```text
Ngày 1                                              Ngày 30
──────────────────────────────────────────────────────────────────────►

Dev A:  [X1] → CI ✓  [X2] → CI ✓        [X3] → CI ✓
Dev B:    [Y1] → CI ✗     [Y1.fix] → CI ✓  [Y2] → CI ✓
Dev C:        [Z1] → CI ✓          [Z2] → CI ✗ [Z2.fix] → CI ✓
                                                  ↑
                                             Conflict bắt sớm,
                                             fix khi context còn fresh
```

3 đặc điểm cốt lõi của CI:

1. **Tích hợp liên tục** — nhiều lần mỗi ngày, không phải mỗi tuần / tháng.
2. **Tự động build** mỗi commit — không phụ thuộc dev tự nhớ chạy.
3. **Tự động test** — phát hiện regression ngay khi code mới đụng phải code cũ.

## "Continuous" tới mức nào?

Best practice: **mỗi developer push code ít nhất 1 lần/ngày**, thường là nhiều lần. Mỗi push → CI trigger → kết quả trong vài phút.

> Quy tắc bất thành văn: **không để CI red qua đêm**. Nếu pipeline fail cuối ngày, ngày sau cả team không deploy được. Người gây fail có trách nhiệm fix trước khi log off.

Có công ty cực đoan hơn: **trunk-based development** — không có feature branch, mọi commit thẳng vào `main`, có CI gác cổng.

## Ba khái niệm bị nhầm lẫn

- **CI (Continuous Integration)** — merge code + auto build + auto test. Bài này.
- **CD (Continuous Delivery)** — sau CI, code được **chuẩn bị sẵn** để deploy bất cứ lúc nào, nhưng deploy production cần **manual approval**.
- **CD (Continuous Deployment)** — sau CI, code **tự động đi thẳng** lên production, không cần approval.

→ Phase 3 sẽ chạm vào Delivery vs Deployment. Phase 2 chỉ tập trung **CI**.

## CI cần những công cụ gì?

```text
┌───────────────────────────────────────────────────────────────┐
│  1. Version Control System (VCS)                              │
│     → Git (thực hiện qua GitHub / GitLab / Bitbucket)         │
│     → Lưu mọi version code, biết ai đổi gì khi nào             │
└───────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│  2. CI Server                                                  │
│     → Jenkins, GitHub Actions, GitLab CI, CircleCI...          │
│     → Lắng nghe Git event → trigger pipeline                   │
└───────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│  3. Build/Test Tools                                           │
│     → Node.js + npm, Maven, pytest, Docker...                  │
│     → Compile, test, package code                              │
└───────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│  4. Artifact Storage / Container Registry                      │
│     → Jenkins archive, Nexus, Docker Hub, S3, ECR...           │
│     → Lưu output của build (binary, image, tar...)             │
└───────────────────────────────────────────────────────────────┘
```

Trong khoá: **1 = Git+GitHub**, **2 = Jenkins**, **3 = Node.js+Docker**, **4 = Jenkins archive trước, sau đó ECR ở Phase 6**.

## Lợi ích CI (chứng minh thực tế)

Nghiên cứu **State of DevOps Report** (DORA) hằng năm chỉ ra: tổ chức làm CI tốt có:

- **Deployment frequency** cao hơn 200× so với tổ chức không có CI.
- **Lead time** (từ commit đến production) thấp hơn 100×.
- **Change failure rate** thấp hơn 5×.
- **Mean Time To Recover** (MTTR) khi có incident: nhanh hơn 2000×.

→ Không phải tự nhiên các tech giant (Google, Amazon, Netflix, Microsoft) đều coi CI/CD là **đầu tư bắt buộc**.

## Trong Phase 2, bạn sẽ học gì?

```text
Pipeline cuối Phase 2 sẽ trông như sau:

┌──────────┐   ┌──────────┐   ┌─────────────────────┐
│ Checkout │ → │  Build   │ → │      Run Tests      │
│   (Git)  │   │ (Docker) │   │   ┌────────────┐    │
└──────────┘   └──────────┘   │   │ Unit Test  │    │
                              │   └────────────┘    │
                              │   ┌────────────┐    │  ← chạy parallel
                              │   │ E2E Test   │    │
                              │   │(Playwright)│    │
                              │   └────────────┘    │
                              └────────┬────────────┘
                                       │
                              ┌────────▼────────┐
                              │  Publish reports │
                              │  • JUnit XML     │
                              │  • Playwright HTML│
                              └─────────────────┘
```

Cụ thể từng bài:

- **Bài 2**: tạo GitHub account, fork project website mẫu, khám phá code local.
- **Bài 3**: dùng Docker image làm build environment trong Jenkins.
- **Bài 4**: lưu Jenkinsfile vào Git, Jenkins pull từ GitHub. Hiểu workspace sync giữa container và agent.
- **Bài 5**: stage Build (npm ci + npm run build) và stage Test (npm test).
- **Bài 6**: publish JUnit test report. Dùng comments để tạm disable stage cho develop nhanh hơn. Publish HTML report.
- **Bài 7**: E2E test với Playwright — chạy server + test ở chế độ headless.
- **Bài 8**: chạy stage parallel để giảm thời gian. Blue Ocean UI. Triết lý cấu trúc pipeline (fail fast, dependencies).
- **Bài 9**: nâng cấp Jenkins + plugin an toàn. Tổng kết Phase 2.

## Chuẩn bị tinh thần

Phase 2 **khó hơn Phase 1 đáng kể**. Lý do:

1. **Nhiều công cụ** đan xen: Git, GitHub, Docker, Node.js, Playwright.
2. **Lỗi nhiều hơn**: workspace mount sai, container không có quyền, port bị chiếm, server treo...
3. **Đọc log dày hơn**: cần kiên nhẫn scroll.

Lời khuyên:

- **Gõ tay** mọi Jenkinsfile, đừng copy paste blind.
- **Khi gặp lỗi**, đừng vội Google. Đọc log từ đầu, hiểu trước khi tra.
- **Mỗi bài làm xong, build pipeline thấy xanh mới qua bài**. Quy tắc Phase 1 nhắc, Phase 2 càng quan trọng.
- **Coffee break** mỗi 1-2 bài. Phase 2 dài (9 bài), cần não tỉnh.

## Tóm tắt

- **CI** = merge code thường xuyên + tự động build + tự động test → bắt lỗi sớm.
- Tránh "integration hell" do dồn merge cuối kỳ.
- Cần 4 thành phần: **VCS** (Git), **CI server** (Jenkins), **build/test tools**, **artifact storage**.
- Tổ chức làm CI tốt deploy nhiều, fail ít, recover nhanh (DORA report).
- Phase 2 sẽ dựng pipeline CI hoàn chỉnh cho 1 website Node.js: Checkout → Build → Test (parallel) → Publish report.

---

→ [Bài tiếp theo: Project website và GitHub](02-du-an-website-va-github.md)
