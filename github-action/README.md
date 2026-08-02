# Github Action

> CI/CD ngay trong GitHub — từ workflow đầu tiên tới pipeline nhiều môi trường.

41 bài về GitHub Actions: cú pháp workflow, trigger, job và step, matrix, reusable workflow và composite action, secret và environment, self-hosted runner, cache và artifact, bảo mật pipeline, và các mẫu triển khai thật.

**41 bài** trong 9 phần.

## Mục lục

### Phase 1

| Bài | Nội dung |
|---|---|
| [01](phase-1/01-tai-sao-can-github-actions.md) | Bài 1: Tại sao cần GitHub Actions? |
| [02](phase-1/02-workflow-jobs-steps.md) | Bài 2: Ba khối cốt lõi — Workflow, Jobs, Steps |
| [03](phase-1/03-viet-workflow-dau-tien.md) | Bài 3: Viết Workflow đầu tiên |
| [04](phase-1/04-actions-marketplace.md) | Bài 4: Dùng Actions từ Marketplace |
| [05](phase-1/05-ci-workflow-thuc-te.md) | Bài 5: CI Workflow thực tế — Tự động test dự án Node.js |
| [06](phase-1/06-nhieu-jobs-song-song-tuan-tu.md) | Bài 6: Nhiều Jobs — Song song và Tuần tự |
| [07](phase-1/07-expressions-va-context.md) | Bài 7: Expressions và GitHub Context |

### Phase 2

| Bài | Nội dung |
|---|---|
| [01](phase-2/01-tong-quan-events.md) | Bài 1: Tổng quan về Events (Sự kiện kích hoạt) |
| [02](phase-2/02-activity-types.md) | Bài 2: Activity Types — Kiểm soát loại hành động |
| [03](phase-2/03-event-filters.md) | Bài 3: Event Filters — Lọc theo Branch và File Path |
| [04](phase-2/04-fork-pr-va-bao-mat.md) | Bài 4: Pull Request từ Fork — Điều cần biết |
| [05](phase-2/05-huy-va-bo-qua-workflow.md) | Bài 5: Huỷ và Bỏ qua Workflow |

### Phase 3

| Bài | Nội dung |
|---|---|
| [01](phase-3/01-job-artifacts.md) | Bài 1: Job Artifacts — File đầu ra của Jobs |
| [02](phase-3/02-upload-download-artifact.md) | Bài 2: Upload và Download Artifact thực tế |
| [03](phase-3/03-job-outputs.md) | Bài 3: Job Outputs — Truyền giá trị giữa các Jobs |
| [04](phase-3/04-dependency-caching.md) | Bài 4: Dependency Caching — Tăng tốc Workflow |

### Phase 4

| Bài | Nội dung |
|---|---|
| [01](phase-4/01-environment-variables.md) | Bài 1: Environment Variables — Biến Môi Trường |
| [02](phase-4/02-secrets.md) | Bài 2: Secrets — Lưu Giá Trị Bí Mật |
| [03](phase-4/03-github-environments.md) | Bài 3: GitHub Environments — Quản lý Secrets theo Môi trường |

### Phase 5

| Bài | Nội dung |
|---|---|
| [01](phase-5/01-if-condition-tren-step.md) | Bài 1: Điều kiện `if` trên Step |
| [02](phase-5/02-if-tren-job-va-continue-on-error.md) | Bài 2: `if` trên Job và `continue-on-error` |
| [03](phase-5/03-matrix-jobs.md) | Bài 3: Matrix Jobs — Chạy Job với Nhiều Cấu hình |
| [04](phase-5/04-reusable-workflows.md) | Bài 4: Reusable Workflows — Tái sử dụng Workflow |

### Phase 6

| Bài | Nội dung |
|---|---|
| [01](phase-6/01-gioi-thieu-containers.md) | Bài 1: Giới thiệu Docker Containers trong GitHub Actions |
| [02](phase-6/02-job-trong-container.md) | Bài 2: Chạy Job trong Container |
| [03](phase-6/03-service-containers.md) | Bài 3: Service Containers — Chạy Database trong Workflow |

### Phase 7

| Bài | Nội dung |
|---|---|
| [01](phase-7/01-tai-sao-custom-actions.md) | Bài 1: Tại sao cần Custom Actions? |
| [02](phase-7/02-composite-action.md) | Bài 2: Composite Action — Gom nhóm Steps |
| [03](phase-7/03-javascript-action.md) | Bài 3: JavaScript Action — Logic phức tạp bằng Node.js |
| [04](phase-7/04-docker-action.md) | Bài 4: Docker Action — Bất kỳ Ngôn ngữ nào |

### Phase 8

| Bài | Nội dung |
|---|---|
| [01](phase-8/01-script-injection.md) | Bài 1: Script Injection — Khi User Input Trở thành Code |
| [02](phase-8/02-actions-bao-mat.md) | Bài 2: Dùng Actions An toàn |
| [03](phase-8/03-permissions-github-token.md) | Bài 3: Permissions và GITHUB_TOKEN |
| [04](phase-8/04-openid-connect.md) | Bài 4: OpenID Connect — Xác thực với Dịch vụ Bên ngoài |

### Phase 9

| Bài | Nội dung |
|---|---|
| [01](phase-9/01-concurrency-control.md) | Bài 1: Concurrency Control — Tránh Deploy Song Song |
| [02](phase-9/02-debug-workflow.md) | Bài 2: Debug Workflow — Tìm lỗi khi mọi thứ không hoạt động |
| [03](phase-9/03-deployment-strategy.md) | Bài 3: Deployment Strategy — Quản lý nhiều môi trường |
| [04](phase-9/04-monorepo-va-dynamic-matrix.md) | Bài 4: Monorepo & Dynamic Matrix — Chỉ chạy đúng phần cần thiết |
| [05](phase-9/05-toi-uu-toc-do-va-chi-phi.md) | Bài 5: Tối ưu Tốc độ và Chi phí |
| [06](phase-9/06-deploy-nhieu-cum-may-chu.md) | Bài 6: Deploy lên nhiều cụm máy chủ riêng |
| [07](phase-9/07-github-noi-bo-enterprise.md) | Bài 7: GitHub Enterprise — Dùng GitHub trong Mạng Nội bộ |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Mới dùng Actions | đọc tuần tự từ phase đầu |
| Pipeline chạy chậm | phần cache và artifact |
| Cần triển khai nhiều môi trường | phần environment và reusable workflow |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*
