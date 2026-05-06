# Bài 1: Environment Variables — Biến Môi Trường

## Environment Variable là gì?

Trong code ứng dụng, một số giá trị **thay đổi tuỳ theo môi trường** — ví dụ địa chỉ database, username, password kết nối. Trong môi trường test bạn dùng database test, trong production bạn dùng database thật. Thay vì hard-code từng giá trị vào code, bạn dùng **biến môi trường** để inject giá trị khi chạy.

Trong Node.js, biến môi trường được đọc qua `process.env.TÊN_BIẾN`.

---

## 3 cấp độ định nghĩa biến môi trường

### Cấp Workflow — áp dụng cho mọi jobs

```yaml
name: My Workflow
on: push

env:                              # ← cùng cấp với name và on
  MONGODB_DB_NAME: gha-demo       # biến này có mặt ở tất cả jobs

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo $MONGODB_DB_NAME   # → gha-demo
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: echo $MONGODB_DB_NAME   # → gha-demo (vẫn có)
```

### Cấp Job — chỉ áp dụng trong job đó

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    env:
      MONGODB_USERNAME: maximilian   # chỉ có trong job test
      MONGODB_PASSWORD: secret123
    steps:
      - run: echo $MONGODB_USERNAME  # → maximilian

  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: echo $MONGODB_USERNAME  # → (trống, không có giá trị)
```

### Cấp Step — chỉ áp dụng trong bước đó

```yaml
steps:
  - name: Deploy
    env:
      API_KEY: abc123               # chỉ có trong step này
    run: deploy-tool --key $API_KEY
```

---

## Dùng biến môi trường trong lệnh `run`

Trên Linux (bash), dùng `$TÊN_BIẾN`:

```yaml
- run: node server.js --port $PORT
```

Trên Windows (PowerShell), dùng `$env:TÊN_BIẾN`:

```yaml
- run: node server.js --port $env:PORT
  shell: pwsh
```

> **Lưu ý:** Key `shell` trên một step cho phép bạn chọn shell khác nhau: `bash`, `pwsh`, `python`, v.v.

---

## Dùng biến môi trường với `env` context object

Ngoài cách nội suy `$TÊN_BIẾN` trong shell, bạn cũng có thể dùng cú pháp expression của GitHub Actions:

```yaml
- run: echo "Username là ${{ env.MONGODB_USERNAME }}"
```

`env` ở đây là **context object** của GitHub Actions — tương tự như `github`, `steps`, `needs` mà bạn đã học.

Ưu điểm: dùng được ở mọi nơi trong file YAML, không chỉ trong `run`.

---

## Ví dụ đầy đủ

```yaml
name: Test App

on: push

env:
  MONGODB_DB_NAME: gha-demo     # workflow-level

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      MONGODB_CLUSTER_ADDRESS: cluster0.example.mongodb.net
      MONGODB_USERNAME: maximilian
      MONGODB_PASSWORD: secret123
      PORT: 8080
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: node server.js &    # & để chạy nền, dùng $PORT ở đây
      - run: npm test
      
      - name: Output env info
        run: |
          echo "DB: ${{ env.MONGODB_DB_NAME }}"
          echo "User: ${{ env.MONGODB_USERNAME }}"
```

---

## Biến môi trường mặc định của GitHub

GitHub Actions tự động cung cấp một số biến mặc định:

| Biến | Giá trị ví dụ |
|---|---|
| `GITHUB_REPOSITORY` | `myuser/myrepo` |
| `GITHUB_SHA` | Hash của commit hiện tại |
| `GITHUB_REF` | `refs/heads/main` |
| `GITHUB_WORKFLOW` | Tên workflow |
| `GITHUB_RUN_ID` | ID của lần chạy |

Xem đầy đủ tại: [docs.github.com — default environment variables](https://docs.github.com/en/actions/learn-github-actions/environment-variables#default-environment-variables)

---

## Tóm tắt

| Cấp độ | Key YAML | Phạm vi |
|---|---|---|
| Workflow | `env:` cùng cấp `name` | Tất cả jobs |
| Job | `env:` dưới job name | Chỉ job đó |
| Step | `env:` dưới step name | Chỉ step đó |

---

**Tiếp theo:** Secrets — Lưu trữ giá trị bí mật an toàn →
