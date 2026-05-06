# Bài 2: Composite Action — Gom nhóm Steps

## Composite Action là gì?

Composite action cho phép bạn gom nhiều steps lại thành một action tái sử dụng. Viết bằng YAML — không cần biết JavaScript hay Docker.

---

## Cấu trúc thư mục

```
.github/
  actions/
    cached-deps/
      action.yml          ← định nghĩa composite action
  workflows/
    main.yml              ← workflow dùng action
```

---

## File `action.yml` cho Composite Action

```yaml
# .github/actions/cached-deps/action.yml

name: Get & Cache Dependencies
description: Install npm dependencies with caching support

runs:
  using: composite        # ← bắt buộc cho composite action
  steps:
    - name: Cache dependencies
      id: cache
      uses: actions/cache@v3
      with:
        path: node_modules
        key: deps-node-${{ hashFiles('**/package-lock.json') }}
    
    - name: Install dependencies
      if: steps.cache.outputs.cache-hit != 'true'
      run: npm ci
      shell: bash         # ← BẮT BUỘC khi dùng `run` trong composite action
```

### Điểm khác biệt quan trọng so với workflow thông thường

- **`runs.using: composite`** thay vì `on:` và `jobs:`
- **`shell: bash`** bắt buộc khi có `run:` — trong workflow thông thường mặc định là bash nhưng trong composite action bạn phải khai báo rõ
- Không có `runs-on:` — composite action chạy trên runner của workflow sử dụng nó

---

## Dùng Composite Action trong Workflow

Dùng `uses:` với đường dẫn tương đối từ root của project:

```yaml
# .github/workflows/main.yml

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3               # ← phải checkout TRƯỚC khi dùng local action
      - uses: ./.github/actions/cached-deps     # ← dùng action (không cần chỉ action.yml)
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: ./.github/actions/cached-deps     # ← dùng lại
      - run: npm test
```

> **Quan trọng:** Khi dùng local action, bạn **phải checkout code trước** với `actions/checkout@v3`. Local action chỉ available sau khi code được tải về runner. Đây là yêu cầu không áp dụng với actions từ repository khác.

Đường dẫn `./` là tương đối từ **root của project**, không phải từ file workflow.

---

## Thêm Inputs

```yaml
# action.yml
name: Get & Cache Dependencies
description: Install npm dependencies with optional caching

inputs:
  caching:
    description: Whether to cache dependencies
    required: false
    default: 'true'               # default là string 'true'

runs:
  using: composite
  steps:
    - name: Cache dependencies
      id: cache
      if: inputs.caching == 'true'    # ← dùng inputs context
      uses: actions/cache@v3
      with:
        path: node_modules
        key: deps-node-${{ hashFiles('**/package-lock.json') }}
    
    - name: Install dependencies
      if: steps.cache.outputs.cache-hit != 'true' || inputs.caching != 'true'
      run: npm ci
      shell: bash
```

Dùng khi gọi:

```yaml
- uses: ./.github/actions/cached-deps
  with:
    caching: 'false'              # ← tắt caching cho job này
```

---

## Thêm Outputs

```yaml
# action.yml
outputs:
  used-cache:
    description: Whether the cache was used
    value: ${{ steps.install.outputs.cache }}    # ← giá trị từ step có id 'install'

runs:
  using: composite
  steps:
    - name: Install dependencies
      id: install                                 # ← phải có id
      run: |
        npm ci
        echo "cache=${{ inputs.caching }}" >> $GITHUB_OUTPUT
      shell: bash
```

Đọc output trong workflow:

```yaml
steps:
  - uses: ./.github/actions/cached-deps
    id: deps                        # ← đặt id cho step dùng action

  - run: echo "Cache used: ${{ steps.deps.outputs.used-cache }}"
```

---

## Tóm tắt

| Thành phần | Bắt buộc? | Mô tả |
|---|---|---|
| `name` | Có | Tên hiển thị của action |
| `description` | Có | Mô tả ngắn |
| `runs.using: composite` | Có | Đánh dấu đây là composite action |
| `runs.steps` | Có | Danh sách steps |
| `shell:` trên `run:` step | Có | Phải khai báo rõ (bash, sh, pwsh...) |
| `inputs` | Không | Tham số nhận vào |
| `outputs` | Không | Giá trị trả ra |

---

**Tiếp theo:** JavaScript Action — Viết logic phức tạp bằng JavaScript →
