# Bài 3: GitHub Environments — Quản lý Secrets theo Môi trường

## Vấn đề: Repository Secrets là "one size fits all"

Giả sử bạn có hai jobs: `test` kết nối database test, `deploy` kết nối database production. Cả hai đều cần username và password, nhưng **giá trị khác nhau**.

Nếu chỉ dùng repository secrets, bạn phải đặt 4 secrets riêng biệt:
- `MONGODB_USERNAME_TEST` và `MONGODB_PASSWORD_TEST`
- `MONGODB_USERNAME_PROD` và `MONGODB_PASSWORD_PROD`

Khi có nhiều jobs và môi trường hơn, cách này trở nên lộn xộn. Đây là lý do tồn tại của **GitHub Environments**.

---

## GitHub Environments là gì?

Environments cho phép bạn tạo **ngữ cảnh triển khai** (testing, staging, production…) và:
- Gán secrets **riêng biệt** cho từng environment
- Thêm **protection rules** (ai được approve, branch nào được chạy…)
- Job trong workflow có thể **tham chiếu** đến environment đó

> **Điều kiện truy cập:** Environments có thể dùng miễn phí trên **public repositories**. Private repositories cần gói trả phí.

---

## Tạo Environment

1. Vào **Settings** của Repository
2. Click **Environments**
3. Click **New environment** → đặt tên (ví dụ: `testing`)
4. Trong environment vừa tạo, thêm secrets riêng cho environment đó

---

## Dùng Environment trong Job

Thêm key `environment` vào job (không phải `env` — đó là cho environment variables):

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    environment: testing        # ← tham chiếu environment có tên "testing"
    env:
      MONGODB_USERNAME: ${{ secrets.MONGODB_USERNAME }}   # secrets của environment "testing"
      MONGODB_PASSWORD: ${{ secrets.MONGODB_PASSWORD }}
    steps:
      - run: npm test
```

Khi job dùng environment `testing`, `secrets.MONGODB_USERNAME` sẽ lấy giá trị từ **environment secrets** của "testing", không phải repository secrets.

---

## Protection Rules

Trong settings của một environment, bạn có thể cấu hình:

### Required reviewers
Job sẽ dừng và chờ một người trong danh sách review và approve trước khi tiếp tục.

### Wait timer
Job sẽ đợi X phút trước khi thực sự bắt đầu chạy.

### Deployment branches
Chỉ cho phép job chạy nếu được trigger từ branch cụ thể.

**Ví dụ thực tế:** Bạn có thể cấu hình environment `testing` chỉ chạy khi push lên branch `main`:

```
Settings → Environments → testing
→ Deployment branches → Selected branches → main
```

Nếu workflow bị trigger từ branch `dev`, job tham chiếu environment `testing` sẽ **không chạy** và bị mark là skipped.

---

## Ví dụ đầy đủ

```yaml
name: Deploy App

on: push

jobs:
  test:
    runs-on: ubuntu-latest
    environment: testing       # dùng secrets của environment "testing"
    env:
      MONGODB_USERNAME: ${{ secrets.MONGODB_USERNAME }}
      MONGODB_PASSWORD: ${{ secrets.MONGODB_PASSWORD }}
      MONGODB_DB_NAME: gha-demo
      PORT: 8080
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: node server.js &
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: production    # dùng secrets của environment "production" (giá trị khác)
    env:
      MONGODB_USERNAME: ${{ secrets.MONGODB_USERNAME }}
      MONGODB_PASSWORD: ${{ secrets.MONGODB_PASSWORD }}
    steps:
      - run: echo "Deploying to production..."
```

---

## Tóm tắt so sánh

| | Repository Secrets | Environment Secrets |
|---|---|---|
| Phạm vi | Tất cả jobs trong repo | Chỉ jobs tham chiếu environment đó |
| Khi nào dùng | Giá trị dùng chung (API key, CDN token) | Giá trị khác nhau theo môi trường |
| Protection rules | Không có | Có (reviewers, branch filter, wait timer) |

---

## Tóm tắt Phase 4

✅ **Environment Variables**: Biến môi trường ở cấp workflow, job, step — inject giá trị vào code  
✅ **env context**: Dùng `${{ env.TÊN }}` để đọc biến trong file YAML  
✅ **Secrets**: Lưu giá trị nhạy cảm mã hoá — dùng `${{ secrets.TÊN }}`  
✅ **GitHub Environments**: Tổ chức secrets theo môi trường, thêm protection rules  

---

**Phase 5:** Kiểm soát luồng thực thi — Điều kiện, Matrix, Reusable Workflows →
