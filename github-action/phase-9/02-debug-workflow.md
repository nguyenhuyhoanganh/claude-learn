# Bài 2: Debug Workflow — Tìm lỗi khi mọi thứ không hoạt động

## Nguyên tắc debug cơ bản

Workflow chạy trên máy ảo xa, bạn không thể SSH vào như máy local. Debug phải qua **log** và **thông tin in ra**.

---

## 1. Xem log chi tiết

Mỗi step trong GitHub Actions UI có thể expand để xem log. Khi step fail, đọc:
- Dòng cuối cùng trước khi fail — thường là error message rõ nhất
- Exit code (nếu có)
- Stack trace

Scroll lên trên dòng fail để xem context — đôi khi lỗi thực sự nằm ở step trước.

---

## 2. In ra context để kiểm tra

Khi không chắc giá trị của context objects hoặc biến:

```yaml
steps:
  - name: Debug context
    run: |
      echo "Event: ${{ github.event_name }}"
      echo "Ref: ${{ github.ref }}"
      echo "Actor: ${{ github.actor }}"
      echo "SHA: ${{ github.sha }}"

  - name: Dump full github context
    run: echo '${{ toJSON(github) }}'

  - name: Dump all env vars
    run: env | sort
```

`toJSON(github)` in ra toàn bộ github context dưới dạng JSON — hữu ích để xem **tất cả** field available, đặc biệt khi xử lý events phức tạp.

---

## 3. Enable Debug Logging

GitHub cung cấp debug logging bổ sung. Kích hoạt bằng cách thêm **repository secret** (không phải environment secret):

| Secret Name | Value |
|---|---|
| `ACTIONS_RUNNER_DEBUG` | `true` |
| `ACTIONS_STEP_DEBUG` | `true` |

Sau khi thêm, rerun workflow để thấy log chi tiết hơn nhiều — bao gồm cả các bước nội bộ mà GitHub Actions thực hiện.

---

## 4. `workflow_dispatch` để test nhanh

Thay vì phải commit/push mỗi lần test, thêm `workflow_dispatch` để trigger thủ công:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:              # ← cho phép chạy từ Actions tab

jobs:
  ...
```

Vào tab Actions → chọn workflow → "Run workflow" → chọn branch → Run.

---

## 5. Tái tạo môi trường local với `act`

[`act`](https://github.com/nektos/act) là CLI tool chạy GitHub Actions trên máy local bằng Docker:

```bash
# Cài act
brew install act   # macOS

# Chạy workflow
act push

# Chạy job cụ thể
act push -j test

# Xem danh sách events
act --list
```

Không thay thế hoàn toàn (khác runner environment, không có GitHub Secrets thật), nhưng rất hữu ích để test YAML syntax và logic cơ bản trước khi push.

---

## 6. Lỗi thường gặp và cách sửa

### "Property 'X' does not exist on type 'Y'"

Expression `${{ ... }}` trỏ sai field. Dùng `toJSON()` để in toàn bộ context và xem field nào tồn tại.

### Step bị skip không rõ lý do

Kiểm tra:
- `if:` condition — thêm step debug để in giá trị condition
- `needs:` — job phụ thuộc có đang skipped không?

```yaml
- name: Debug condition
  run: |
    echo "outcome: ${{ steps.my-step.outcome }}"
    echo "conclusion: ${{ steps.my-step.conclusion }}"
```

### Action not found / Path error cho local action

Local action path phải bắt đầu bằng `./` và tính từ **root project**, không phải từ workflow file:

```yaml
# ✅ đúng
uses: ./.github/actions/my-action

# ❌ sai
uses: .github/actions/my-action
uses: ../actions/my-action
```

Và phải có `actions/checkout@v3` trước khi dùng local action.

### Cache không được restore

Cache key có thể không khớp. Thêm step debug để kiểm tra:

```yaml
- name: Cache deps
  id: cache
  uses: actions/cache@v3
  with:
    path: node_modules
    key: deps-${{ hashFiles('**/package-lock.json') }}

- name: Debug cache
  run: echo "Cache hit: ${{ steps.cache.outputs.cache-hit }}"
```

### Permissions error khi gọi GitHub API

```
Error: Resource not accessible by integration
```

Job thiếu permission. Thêm permission cần thiết:

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: write
```

### Secret trống / không nhận được

- Secret chưa được tạo (silent fail — không báo lỗi, chỉ trả về chuỗi rỗng)
- Secret trong environment nhưng job không có `environment:` key
- Trên fork PR — secrets không truyền từ upstream repo

---

## 7. Re-run jobs

Sau khi fix lỗi hoặc flaky test:
- **Re-run all jobs** — chạy lại từ đầu
- **Re-run failed jobs** — chỉ chạy lại jobs bị fail (nhanh hơn nếu có nhiều jobs pass trước đó)

Vào Actions tab → click vào workflow run → "Re-run jobs" dropdown.

---

**Tiếp theo:** Deployment Strategy — Quản lý nhiều môi trường thực tế →
