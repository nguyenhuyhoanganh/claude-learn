# Bài 6: Nhiều Jobs — Song song và Tuần tự

## Tại sao cần nhiều jobs?

Một workflow thường có nhiều giai đoạn:
- **Test**: kiểm tra code có lỗi không
- **Build**: build ra file production
- **Deploy**: đẩy file lên server

Tách thành jobs riêng biệt giúp:
- Chạy song song → tiết kiệm thời gian
- Dễ đọc log từng giai đoạn
- Kiểm soát thứ tự thực thi

---

## Workflow với nhiều jobs (chạy song song)

```yaml
name: Deploy Project

on: push

jobs:
  test:                          # Job 1
    runs-on: ubuntu-latest
    steps:
      - name: Get code
        uses: actions/checkout@v3
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test

  deploy:                        # Job 2 — chạy SONG SONG với test
    runs-on: ubuntu-latest
    steps:
      - name: Get code
        uses: actions/checkout@v3
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Deploy
        run: echo "Deploying..."
```

> **Lưu ý thụt đầu dòng:** `test:` và `deploy:` phải ở **cùng cấp độ thụt đầu dòng** (đều là con của `jobs:`).

Mặc định cả hai jobs **chạy cùng lúc**. Tổng thời gian = thời gian của job dài nhất (không phải tổng cộng).

---

## Chạy tuần tự với `needs`

Thực tế, bạn thường muốn: **chỉ deploy khi test thành công**.

Dùng từ khoá `needs`:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      # ... các steps test

  deploy:
    needs: test              # ← deploy CHỜ test xong mới chạy
    runs-on: ubuntu-latest
    steps:
      # ... các steps deploy
```

Với cấu hình này:
- Nếu `test` thành công → `deploy` mới bắt đầu
- Nếu `test` thất bại → `deploy` **không chạy** (bị skip)

---

## Chờ nhiều jobs hoàn thành

```yaml
jobs:
  lint:
    # ...

  test:
    # ...

  deploy:
    needs: [lint, test]    # ← chờ CẢ HAI lint và test xong
    # ...
```

---

## Workflow 3 jobs chạy tuần tự

```yaml
name: Lint, Test & Deploy

on: push

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run lint

  test:
    needs: lint              # chờ lint xong
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm test

  deploy:
    needs: test              # chờ test xong
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run build
      - run: echo "Deploying..."
```

Thứ tự: `lint` → `test` → `deploy`

---

## So sánh song song vs tuần tự

| | Song song (mặc định) | Tuần tự (`needs`) |
|---|---|---|
| Thời gian | Nhanh hơn | Chậm hơn |
| Phù hợp khi | Jobs độc lập nhau | Job sau phụ thuộc job trước |
| Ví dụ | Lint + Test cùng lúc | Test xong mới Deploy |

---

## Lưu ý: mỗi job có runner riêng

Dù dùng cùng `ubuntu-latest`, **mỗi job chạy trên một máy khác nhau**. Do đó:
- Phải `checkout` lại code ở mỗi job
- Phải `npm ci` lại ở mỗi job
- File tạo ra ở job này **không tự có mặt** ở job kia

(Cách chia sẻ file giữa các jobs sẽ học ở Phase 3 — Artifacts)

---

**Tiếp theo:** Expressions và GitHub Context →
