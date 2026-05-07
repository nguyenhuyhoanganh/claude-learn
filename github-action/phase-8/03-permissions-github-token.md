# Bài 3: Permissions và GITHUB_TOKEN

## GITHUB_TOKEN là gì?

Mỗi lần workflow chạy, GitHub tự động tạo một **token tạm thời** gọi là `GITHUB_TOKEN`. Token này:
- Tự động có mặt trong mọi job (không cần tạo thủ công)
- Hợp lệ **chỉ trong lúc workflow đang chạy**, xóa ngay sau khi xong
- Dùng để **xác thực requests đến GitHub API**
- Phạm vi quyền được kiểm soát bởi `permissions` key

Bạn đã dùng nó mà không biết — `actions/checkout@v3` dùng nó để tải code về.

### Cách truy cập

```yaml
steps:
  - name: Call GitHub API
    run: |
      curl -H "Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}" \
        https://api.github.com/repos/${{ github.repository }}/issues
```

---

## Permissions mặc định — quá rộng

Mặc định, `GITHUB_TOKEN` có **read-write access** cho hầu hết mọi thứ trong repository:
- Contents (code), Issues, Pull Requests, Actions, Packages, Deployments...

Điều này tiện nhưng **không tuân theo nguyên tắc least privilege** — chỉ cấp quyền cần thiết.

---

## Key `permissions`

Thêm `permissions` vào workflow hoặc job cụ thể:

```yaml
# Cấp độ workflow — áp dụng cho tất cả jobs
permissions:
  contents: read
  issues: write

jobs:
  assign-label:
    runs-on: ubuntu-latest
    steps:
      ...
```

Hoặc trên từng job riêng:

```yaml
jobs:
  assign-label:
    runs-on: ubuntu-latest
    permissions:
      issues: write        # ← chỉ cần ghi issues
    steps:
      ...
```

### Quy tắc quan trọng

> **Khi bạn thêm bất kỳ `permissions` nào, tất cả permissions không được khai báo sẽ bị thu hồi về `none`.**

Ví dụ:

```yaml
permissions:
  issues: write
# ↑ contents, pull-requests, actions... tất cả đều bị set thành none
# Ngay cả actions/checkout@v3 cũng có thể fail vì thiếu contents: read!
```

Nếu cần checkout code, phải thêm:

```yaml
permissions:
  issues: write
  contents: read          # ← cần để checkout action hoạt động
```

---

## Các giá trị Permission

| Giá trị | Ý nghĩa |
|---|---|
| `read` | Chỉ đọc |
| `write` | Đọc và ghi |
| `none` | Không có quyền gì |

---

## Các Permission Areas phổ biến

| Area | Ví dụ cần khi |
|---|---|
| `contents` | Checkout code, tạo release, đọc code |
| `issues` | Tạo/cập nhật issues, thêm labels |
| `pull-requests` | Comment PR, merge PR |
| `packages` | Publish npm/Docker package |
| `deployments` | Tạo deployment |
| `id-token` | Dùng OpenID Connect (xem bài sau) |

---

## Đổi default permissions của repository

Vào **Settings → Actions → General → Workflow permissions**:

- **Read and write permissions** (mặc định rộng)
- **Read repository contents and packages permissions only** (an toàn hơn)

Chọn tùy chọn thứ hai để đảm bảo workflows không vô tình có quyền ghi.

---

## Ví dụ thực tế: Auto-label Issues

```yaml
name: Auto Label Issues

on:
  issues:
    types: [opened]

jobs:
  assign-label:
    runs-on: ubuntu-latest
    permissions:
      issues: write       # ← chỉ cần quyền này
    steps:
      - name: Add bug label
        env:
          ISSUE_TITLE: ${{ github.event.issue.title }}    # ← an toàn, qua env
        run: |
          if [[ "$ISSUE_TITLE" == *"bug"* ]]; then
            curl -X POST \
              -H "Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}" \
              -H "Content-Type: application/json" \
              -d '{"labels":["bug"]}' \
              "https://api.github.com/repos/${{ github.repository }}/issues/${{ github.event.issue.number }}/labels"
          fi
```

---

## Lý do tại sao permissions quan trọng

Giả sử workflow bị tấn công qua script injection hoặc action độc hại. Nếu token chỉ có `issues: write`, kẻ tấn công **không thể**:
- Đọc hoặc thay đổi code (`contents`)
- Xem secrets (`secrets` không bao giờ accessible qua token)
- Tạo package hay deployment

Permissions là **lớp bảo vệ thứ hai** — ngay cả khi code bị tấn công, thiệt hại bị giới hạn.

---

**Tiếp theo:** OpenID Connect — Xác thực an toàn với dịch vụ bên ngoài →
