# Bài 5: CI Workflow thực tế — Tự động test dự án Node.js

## Mục tiêu

Mỗi khi có `git push`, workflow sẽ tự động:
1. Lấy code từ repository về runner
2. Cài Node.js phiên bản mong muốn
3. Cài dependencies (`npm ci`)
4. Chạy automated tests (`npm test`)

---

## Workflow hoàn chỉnh

Tạo file `.github/workflows/test.yml`:

```yaml
name: Test Project

on: push   # Chạy mỗi khi có push

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - name: Get code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
```

---

## Giải thích từng step

### Step 1: Get code
```yaml
uses: actions/checkout@v3
```
Runner là máy trắng. Step này download code từ repository về thư mục làm việc của runner. **Phải là step đầu tiên** trong hầu hết mọi workflow.

### Step 2: Setup Node.js
```yaml
uses: actions/setup-node@v3
with:
  node-version: 18
```
Đảm bảo dùng đúng phiên bản Node.js. Runner đã có sẵn Node.js nhưng việc khai báo rõ version giúp workflow nhất quán theo thời gian.

### Step 3: Install dependencies
```yaml
run: npm ci
```
`npm ci` khác với `npm install`:
- Dùng chính xác các phiên bản được lock trong `package-lock.json`
- Nhanh hơn và ổn định hơn cho CI/CD
- Đảm bảo môi trường runner giống môi trường dev của bạn

### Step 4: Run tests
```yaml
run: npm test
```
Chạy test suite. Nếu test fail → step này exit với code khác 0 → GitHub Actions đánh dấu workflow thất bại.

---

## Khi workflow thất bại

Khi test fail, GitHub Actions sẽ:
- Hiển thị ❌ đỏ trên repository
- Gửi email thông báo cho bạn
- Cho phép xem log chi tiết để debug

Để xem nguyên nhân:
1. Vào tab **Actions**
2. Click vào workflow run bị fail
3. Click vào job
4. Mở rộng step bị fail → đọc log lỗi

---

## Lưu ý quan trọng

> Workflow file cũng là code trong repository của bạn. Khi bạn tạo file `.github/workflows/test.yml` và commit, đó cũng là một commit thông thường. GitHub Actions sẽ tự phát hiện file YAML trong thư mục `.github/workflows/` và đăng ký workflow đó.

---

## Personal Access Token khi push workflow

Lần đầu push file trong thư mục `.github/workflows/`, GitHub yêu cầu token có quyền `workflow`. Nếu bị lỗi permission:

1. Vào **GitHub Settings** → **Developer settings** → **Personal access tokens**
2. Tạo token mới, tick thêm quyền **workflow**
3. Dùng token mới để push

---

**Tiếp theo:** Thêm nhiều jobs — chạy song song và tuần tự →
