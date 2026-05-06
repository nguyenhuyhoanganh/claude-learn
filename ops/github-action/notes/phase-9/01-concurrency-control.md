# Bài 1: Concurrency Control — Tránh Deploy Song Song

## Vấn đề thực tế

Bạn push 3 commits liên tiếp trong vài giây. GitHub Actions kích hoạt 3 workflow runs. Cả 3 đều cố gắng deploy lên production **cùng lúc** — kết quả không thể đoán trước: tệp cũ có thể ghi đè tệp mới, database migration chạy nhiều lần, server bị restart giữa chừng.

---

## Giải pháp: `concurrency` key

```yaml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: production-deploy         # ← tên nhóm, tự đặt
  cancel-in-progress: true         # ← hủy run cũ khi có run mới hơn

jobs:
  deploy:
    ...
```

`group` định nghĩa "nhóm". Chỉ **một workflow run trong cùng nhóm** được phép chạy tại một thời điểm. Các runs còn lại sẽ:
- `cancel-in-progress: true` → hủy run đang chạy, chạy run mới nhất
- `cancel-in-progress: false` → xếp hàng chờ, không hủy

---

## Dùng expression trong `group`

Thường bạn muốn nhóm theo branch — PR khác nhau deploy lên môi trường khác nhau không cần chờ nhau:

```yaml
concurrency:
  group: deploy-${{ github.ref }}         # vd: deploy-refs/heads/main
  cancel-in-progress: true
```

Hoặc nhóm theo workflow + branch:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

---

## Concurrency trên Job level

Đôi khi chỉ một job cụ thể cần concurrency control, không cải toàn bộ workflow:

```yaml
jobs:
  deploy:
    concurrency:
      group: production
      cancel-in-progress: false    # deploy thì KHÔNG nên cancel giữa chừng
    ...
```

> **Lưu ý thiết kế:** Với deploy, `cancel-in-progress: false` (xếp hàng) thường an toàn hơn `true` (hủy đang chạy). Deployment bị cancel giữa chừng có thể để lại trạng thái inconsistent. Với lint/test thì ngược lại — cancel run cũ là okay.

---

## Case thực tế: PR Preview Deploy

Mỗi PR có preview environment riêng, không block nhau:

```yaml
name: PR Preview

on:
  pull_request:

concurrency:
  group: preview-${{ github.event.pull_request.number }}  # nhóm theo PR number
  cancel-in-progress: true                                 # PR mới push → deploy lại

jobs:
  preview:
    ...
```

Mỗi PR có `group` khác nhau (`preview-42`, `preview-43`...) → chạy độc lập, nhưng trong cùng một PR thì chỉ deploy run mới nhất.

---

## Cleanup khi PR đóng

Vấn đề: preview environment vẫn còn sau khi PR merge. Xử lý với activity type `closed`:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]   # ← thêm closed

jobs:
  deploy-preview:
    if: github.event.action != 'closed'
    ...

  cleanup-preview:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Teardown preview env for PR ${{ github.event.pull_request.number }}"
```

---

**Tiếp theo:** Debug Workflow — Tìm lỗi khi mọi thứ không hoạt động →
