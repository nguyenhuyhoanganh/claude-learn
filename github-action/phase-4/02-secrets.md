# Bài 2: Secrets — Lưu Giá Trị Bí Mật

## Vấn đề với Environment Variables thông thường

Nếu bạn đặt password hoặc API key trực tiếp trong file workflow YAML và push lên GitHub, **toàn bộ người có quyền xem repo sẽ thấy giá trị đó**. Đây là rủi ro bảo mật nghiêm trọng, kể cả với database test.

```yaml
# ❌ KHÔNG NÊN làm thế này
env:
  MONGODB_PASSWORD: my-real-password-123
```

---

## Secrets là gì?

Secrets là **biến môi trường được lưu mã hoá** trên GitHub. Đặc điểm:
- Không ai xem được giá trị sau khi lưu (kể cả bạn)
- Chỉ update hoặc delete được, không đọc được
- Khi in ra trong log, GitHub **tự động ẩn** giá trị đó
- Chỉ có trong các jobs được chạy bởi repo đó

---

## Tạo Secret trên GitHub

1. Vào **Settings** của Repository
2. Mục **Security → Secrets and variables → Actions**
3. Click **New repository secret**
4. Nhập **Name** (ví dụ: `MONGODB_PASSWORD`) và **Value**
5. Click **Add secret**

Sau khi lưu, giá trị không thể xem lại — chỉ update hoặc delete.

---

## Dùng Secret trong Workflow

Dùng `secrets` context object với cú pháp `${{ secrets.TÊN_SECRET }}`:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    env:
      MONGODB_USERNAME: ${{ secrets.MONGODB_USERNAME }}
      MONGODB_PASSWORD: ${{ secrets.MONGODB_PASSWORD }}
    steps:
      - run: npm test
```

Hoặc dùng trực tiếp trong step cụ thể:

```yaml
steps:
  - name: Deploy
    env:
      API_KEY: ${{ secrets.API_KEY }}
    run: deploy-tool --key $API_KEY
```

---

## GitHub che giấu Secret trong log

Nếu bạn cố tình in ra một secret:

```yaml
- run: echo ${{ secrets.MONGODB_PASSWORD }}
```

GitHub sẽ thay thế giá trị thực bằng `***` trong log. Bạn sẽ thấy:

```
***
```

Điều này giúp bảo vệ bạn khỏi việc vô tình để lộ secret qua log.

---

## Ví dụ đầy đủ

```yaml
name: Test API

on: push

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      MONGODB_DB_NAME: gha-demo
      MONGODB_CLUSTER_ADDRESS: ${{ secrets.MONGODB_CLUSTER }}
      MONGODB_USERNAME: ${{ secrets.MONGODB_USERNAME }}
      MONGODB_PASSWORD: ${{ secrets.MONGODB_PASSWORD }}
      PORT: 8080
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: node server.js &
      - run: npm test
```

---

## Lưu ý quan trọng

- **Không commit secret** vào file `.env` hoặc bất kỳ file nào — dùng GitHub Secrets.
- Secret **không truyền** tự động sang fork của repo. Đây là bảo vệ thiết kế vì PRs từ fork có thể chứa code đọc trộm secrets.
- Khi dùng `secrets.TÊN` mà secret chưa được tạo, giá trị sẽ là chuỗi rỗng — job có thể fail theo cách không rõ ràng.

---

**Tiếp theo:** GitHub Environments — Quản lý secrets theo môi trường →
