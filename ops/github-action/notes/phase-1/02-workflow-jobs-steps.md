# Bài 2: Ba khối cốt lõi — Workflow, Jobs, Steps

GitHub Actions được xây dựng trên 3 khái niệm lồng nhau. Hiểu rõ 3 cái này là hiểu được 80% GitHub Actions.

## Sơ đồ tổng quan

```
GitHub Repository
└── Workflow (file .yml)
    ├── Trigger (sự kiện kích hoạt)
    └── Job A
        ├── Runner (máy chủ thực thi)
        ├── Step 1
        ├── Step 2
        └── Step 3
    └── Job B
        └── ...
```

---

## 1. Workflow

- Là **một quy trình tự động** được gắn với repository
- Được định ngh�ã trong file `.yml` (YAML) đặt trong thư mục `.github/workflows/`
- Một repository có thể có **nhiều workflow** (nhiều file `.yml`)
- Mỗi workflow có một **tên** và một hoặc nhiều **trigger** (sự kiện kích hoạt)

**Ví dụ:** Bạn có thể có 2 workflow:
- `test.yml`: chạy khi push lên bất kỳ branch nào
- `deploy.yml`: chỉ chạy khi push lên branch `main`

---

## 2. Jobs

- Mỗi workflow chứa **một hoặc nhiều job**
- Mỗi job chạy trên một **runner** (máy chủ riêng biệt)
- Mặc định, các job **chạy song song** với nhau
- Bạn có thể cấu hình để chạy **tuần tự** (job này xong mới chạy job kia)

**Lưu ý quan trọng:** Mỗi job chạy trên một máy **hoàn toàn độc lập**. File tạo ra ở job này **không tự động có mặt** ở job kia.

---

## 3. Steps

- Mỗi job có **một hoặc nhiều step**
- Các step **chạy tuần tự**, step trước xong mới đến step sau
- Mỗi step là một trong hai loại:
  - **Lệnh shell**: chạy command trong terminal (dùng từ khoá `run`)
  - **Action**: dùng script có sẵn từ marketplace (dùng từ khoá `uses`)

---

## Runner là gì?

Runner là máy chủ (do GitHub cung cấp) nơi các step được thực thi. GitHub cung cấp sẵn:

| Runner | Hệ điều hành |
|---|---|
| `ubuntu-latest` | Linux (phổ biến nhất) |
| `windows-latest` | Windows |
| `macos-latest` | macOS |

> Trong hầu hết trường hợp, dùng `ubuntu-latest` là đủ và nhanh nhất.

---

## Tóm tắt mối quan hệ

```
Repository → có nhiều Workflow
Workflow   → có nhiều Job
Job        → chạy trên 1 Runner, có nhiều Step
Step       → là lệnh shell HOẶC Action có sẵn
```

---

**Tiếp theo:** Viết workflow đầu tiên bằng YAML →
