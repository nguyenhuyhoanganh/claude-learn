# Bài 3: Event Filters — Lọc theo Branch và File Path

## Vấn đề

```yaml
on: push
```

Cái này trigger khi push vào **bất kỳ branch nào**. Nhưng bạn chỉ muốn deploy khi push vào `main`. Event Filters giúp bạn kiểm soát điều này.

---

## Filter `branches`

Chỉ trigger khi push/PR target vào các branch được liệt kê:

```yaml
on:
  push:
    branches:
      - main              # chỉ khi push vào main
```

### Nhiều branch

```yaml
on:
  push:
    branches:
      - main
      - production
      - release/*         # release/v1, release/v2, ...
```

### Pattern matching

```yaml
branches:
  - main
  - 'feat/**'       # feat/login, feat/login/oauth, feat/new-button
  - 'dev-*'         # dev-1, dev-new, dev-this (không có slash)
```

**Khác nhau giữa `*` và `**`:**
- `*` = bất kỳ ký tự nào **trừ** dấu `/`
- `**` = bất kỳ ký tự nào **kể cả** dấu `/`

```
'feat/*'   → khớp: feat/login     | không khớp: feat/login/oauth
'feat/**'  → khớp: feat/login/oauth và feat/login
```

---

## Filter `branches-ignore`

Trigger cho **tất cả branches trừ** những branch được liệt kê:

```yaml
on:
  push:
    branches-ignore:
      - 'docs/**'        # bỏ qua mọi branch docs/*
```

> Không dùng `branches` và `branches-ignore` cùng nhau trong một event.

---

## Filter `paths`

Chỉ trigger khi push **có thay đổi file** trong các path được chỉ định:

```yaml
on:
  push:
    branches:
      - main
    paths:
      - 'src/**'         # chỉ khi file trong src/ thay đổi
      - 'package.json'
```

Hữu ích khi: chỉ muốn chạy test khi code thay đổi, không cần chạy khi chỉ sửa docs.

---

## Filter `paths-ignore`

Trigger khi push **trừ khi** chỉ có file trong path được liệt kê thay đổi:

```yaml
on:
  push:
    paths-ignore:
      - '.github/workflows/**'   # push thay đổi workflow file → không trigger
      - '**.md'                  # push chỉ sửa file markdown → không trigger
```

---

## Kết hợp branches và paths

```yaml
on:
  push:
    branches:
      - main
    paths-ignore:
      - '.github/workflows/**'
```

Logic: "Push vào `main` AND không phải chỉ sửa file workflow → trigger"

---

## Filters áp dụng cho events nào?

| Filter | push | pull_request | Khác |
|---|---|---|---|
| `branches` | ✅ | ✅ | ❌ |
| `branches-ignore` | ✅ | ✅ | ❌ |
| `paths` | ✅ | ✅ | ❌ |
| `paths-ignore` | ✅ | ✅ | ❌ |
| `tags` | ✅ | ❌ | ❌ |

---

## Ví dụ đầy đủ: Deploy chỉ khi push main có thay đổi code

```yaml
name: Deploy to Production

on:
  push:
    branches:
      - main
    paths-ignore:
      - '.github/**'
      - '**.md'
      - 'docs/**'
  workflow_dispatch:   # vẫn cho phép trigger thủ công

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run build
      - run: echo "Deploying..."
```

---

## Filter kết hợp với Activity Types

Bạn có thể dùng cả hai:

```yaml
on:
  pull_request:
    types: [opened, synchronize]   # chỉ khi PR mở hoặc có commit mới
    branches:
      - main                        # và PR target vào main
```

---

**Tiếp theo:** Pull Request từ fork — Vấn đề bảo mật cần biết →
