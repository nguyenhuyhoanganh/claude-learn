# Bài 4: Monorepo & Dynamic Matrix — Chỉ chạy đúng phần cần thiết

## Vấn đề với Monorepo

Monorepo chứa nhiều dự án trong cùng một repository:

```
apps/
  frontend/
  backend/
  mobile/
packages/
  shared-utils/
  ui-components/
```

Nếu bạn chỉ thay đổi file trong `apps/frontend/`, bạn không muốn:
- Chạy lại tests của `apps/backend/`
- Build lại `apps/mobile/`
- Tốn thêm thời gian và tiền không cần thiết

---

## Giải pháp 1: `paths` filter (đơn giản)

Tạo workflow riêng cho từng service, dùng `paths` filter:

```yaml
# .github/workflows/frontend.yml
name: Frontend CI

on:
  push:
    paths:
      - 'apps/frontend/**'      # ← chỉ trigger khi frontend thay đổi
      - 'packages/ui-components/**'  # ← hoặc khi UI package thay đổi

jobs:
  test-frontend:
    ...
```

```yaml
# .github/workflows/backend.yml
name: Backend CI

on:
  push:
    paths:
      - 'apps/backend/**'
      - 'packages/shared-utils/**'
```

**Nhược điểm:** Phải tạo nhiều workflow files, khó maintain khi monorepo lớn.

---

## Giải pháp 2: Dynamic Matrix từ changed files

Detect file thay đổi → tự động build matrix → chỉ chạy jobs cần thiết:

```yaml
name: Monorepo CI

on: push

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      changed-apps: ${{ steps.detect.outputs.apps }}    # JSON array
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 2                  # ← cần 2 commits để so sánh diff

      - name: Detect changed apps
        id: detect
        run: |
          CHANGED_APPS=()
          
          # Kiểm tra từng app có file thay đổi không
          for APP in frontend backend mobile; do
            if git diff --name-only HEAD~1 HEAD | grep -q "^apps/$APP/"; then
              CHANGED_APPS+=("\"$APP\"")
            fi
          done
          
          # Output JSON array
          echo "apps=[$(IFS=,; echo "${CHANGED_APPS[*]}")]" >> $GITHUB_OUTPUT

  build:
    needs: detect-changes
    if: needs.detect-changes.outputs.changed-apps != '[]'   # ← skip nếu không có gì đổi
    strategy:
      matrix:
        app: ${{ fromJSON(needs.detect-changes.outputs.changed-apps) }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build ${{ matrix.app }}
        run: cd apps/${{ matrix.app }} && npm ci && npm run build
```

`fromJSON()` — hàm built-in của GitHub Actions chuyển JSON string thành object để dùng trong matrix.

---

## Giải pháp 3: Dùng Action `dorny/paths-filter`

Action này đơn giản hóa việc detect changes:

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.filter.outputs.frontend }}
      backend: ${{ steps.filter.outputs.backend }}
    steps:
      - uses: dorny/paths-filter@v2
        id: filter
        with:
          filters: |
            frontend:
              - 'apps/frontend/**'
              - 'packages/ui-components/**'
            backend:
              - 'apps/backend/**'
              - 'packages/shared-utils/**'

  test-frontend:
    needs: changes
    if: needs.changes.outputs.frontend == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Test frontend"

  test-backend:
    needs: changes
    if: needs.changes.outputs.backend == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Test backend"
```

---

## `fetch-depth` — Quan trọng khi diff commits

Mặc định `actions/checkout@v3` chỉ fetch 1 commit (shallow clone) để nhanh. Khi cần so sánh với commit trước, phải fetch thêm:

```yaml
- uses: actions/checkout@v3
  with:
    fetch-depth: 2        # fetch 2 commits: current + previous
    # hoặc
    fetch-depth: 0        # fetch tất cả history (chậm, dùng khi cần git log)
```

---

## Dynamic Matrix từ file JSON

Nếu danh sách services lưu trong file config, đọc từ đó:

```json
// .github/matrix.json
["frontend", "backend", "mobile", "admin"]
```

```yaml
jobs:
  load-matrix:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.load.outputs.matrix }}
    steps:
      - uses: actions/checkout@v3
      - id: load
        run: echo "matrix=$(cat .github/matrix.json)" >> $GITHUB_OUTPUT

  build:
    needs: load-matrix
    strategy:
      matrix:
        app: ${{ fromJSON(needs.load-matrix.outputs.matrix) }}
    ...
```

---

## Lưu ý về `paths` và `branches` kết hợp

Khi dùng cả `paths` và `branches`, chúng kết hợp bằng **AND**:

```yaml
on:
  push:
    branches: [main]        # VÀ
    paths: ['apps/**']      # → chỉ trigger khi push lên main VÀ có file trong apps/ thay đổi
```

Nếu push lên main nhưng chỉ đổi `README.md` → workflow **không** trigger.

---

**Tiếp theo:** Tối ưu tốc độ và chi phí →
