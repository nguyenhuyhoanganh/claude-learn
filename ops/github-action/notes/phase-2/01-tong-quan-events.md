# Bài 1: Tổng quan về Events (Sự kiện kích hoạt)

## Vấn đề với trigger đơn giản

Ở Phase 1, ta dùng trigger đơn giản:

```yaml
on: push
```

Điều này có nghĩa: **bất kỳ ai push lên bất kỳ branch nào** cũng kích hoạt workflow. Đây thường không phải điều bạn muốn:

- Push lên branch `feature/xyz` không nên deploy
- Chỉ push lên `main` mới nên deploy production
- Pull request từ người lạ không nên tự chạy workflow

Phase 2 giải quyết những vấn đề này.

---

## Danh sách events phổ biến

### Liên quan đến repository

| Event | Kích hoạt khi |
|---|---|
| `push` | Có commit được push lên |
| `pull_request` | Có action liên quan đến Pull Request |
| `issues` | Có action liên quan đến Issue |
| `create` | Tạo branch hoặc tag mới |
| `delete` | Xoá branch hoặc tag |
| `fork` | Repository bị fork |
| `release` | Tạo/chỉnh sửa release |

### Không liên quan trực tiếp đến code

| Event | Kích hoạt khi |
|---|---|
| `workflow_dispatch` | Kích hoạt thủ công qua GitHub UI hoặc API |
| `repository_dispatch` | Gửi request đến GitHub REST API |
| `schedule` | Theo lịch định kỳ (cron) |
| `workflow_call` | Workflow này được gọi bởi workflow khác |

---

## Cú pháp khai báo events

### Một event đơn

```yaml
on: push
```

### Nhiều events

```yaml
on: [push, pull_request, workflow_dispatch]
```

### Event với cấu hình chi tiết

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, edited]
  workflow_dispatch:
```

---

## Schedule — Chạy theo lịch

```yaml
on:
  schedule:
    - cron: '0 8 * * *'    # Mỗi ngày lúc 8:00 AM UTC
```

Cú pháp cron: `phút giờ ngày tháng thứ`

```
0 8 * * *     → 8:00 AM mỗi ngày
0 */6 * * *   → Mỗi 6 tiếng
0 9 * * 1     → 9:00 AM thứ Hai hàng tuần
```

> Tài liệu đầy đủ tất cả events: **docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows**

---

## Một event quan trọng: `issues`

```yaml
on: issues
```

Workflow chạy khi bất kỳ hành động nào liên quan đến Issue xảy ra: tạo mới, chỉnh sửa, đóng, gán nhãn...

Dùng với expression để xem chi tiết:

```yaml
on: issues

jobs:
  handle:
    runs-on: ubuntu-latest
    steps:
      - name: Show issue details
        run: echo "${{ toJSON(github.event) }}"
```

Từ `github.event` bạn sẽ thấy đầy đủ thông tin: ai tạo issue, tiêu đề gì, body là gì...

---

**Tiếp theo:** Activity Types — Kiểm soát chính xác loại event nào kích hoạt →
