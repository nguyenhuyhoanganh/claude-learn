# Bài 3: Viết Workflow đầu tiên

## Cấu trúc thư mục bắt buộc

GitHub chỉ nhận dạng workflow khi file được đặt **đúng chỗ**:

```
your-repo/
└── .github/
    └── workflows/
        └── ten-file-tuy-y.yml   ← workflow của bạn
```

> Tên thư mục `.github` và `workflows` là **bắt buộc, không được đổi**. Tên file `.yml` thì tuỳ ý.

---

## Cú pháp YAML cơ bản

YAML dùng **thụt đầu dòng** (indentation) để thể hiện cấu trúc lồng nhau. Dùng **dấu cách (space)**, không dùng tab.

```yaml
# Dấu thụt = quan hệ cha-con
jobs:
  ten-job:      # thuộc về jobs
    runs-on: ubuntu-latest  # thuộc về ten-job
```

---

## Workflow tối giản

```yaml
name: First Workflow          # Tên workflow (hiển thị trên GitHub)

on: workflow_dispatch         # Trigger: kích hoạt thủ công

jobs:
  first-job:                  # Tên job (tự đặt)
    runs-on: ubuntu-latest    # Chạy trên máy Linux

    steps:
      - name: Print greeting  # Tên step (tự đặt)
        run: echo "Hello World"

      - name: Print goodbye
        run: echo "Done - Bye!"
```

### Giải thích từng phần

| Khoá | Bắt buộc? | Ý nghĩa |
|---|---|---|
| `name` | Không (nhưng nên có) | Tên hiển thị trên GitHub Actions UI |
| `on` | **Có** | Sự kiện kích hoạt workflow |
| `jobs` | **Có** | Danh sách các jobs |
| `runs-on` | **Có** | Loại runner |
| `steps` | **Có** | Danh sách các steps |
| `run` | Một trong hai | Chạy lệnh shell |
| `uses` | Một trong hai | Dùng Action có sẵn |

---

## Trigger phổ biến

```yaml
# Kích hoạt thủ công trên GitHub UI
on: workflow_dispatch

# Kích hoạt khi push code
on: push

# Kích hoạt khi có pull request
on: pull_request

# Nhiều trigger cùng lúc
on: [push, workflow_dispatch]
```

---

## Chạy nhiều lệnh trong một step

Dùng ký tự `|` (pipe) để viết nhiều dòng lệnh:

```yaml
steps:
  - name: Multiple commands
    run: |
      echo "Dòng lệnh 1"
      echo "Dòng lệnh 2"
      npm install
```

---

## Thực hành: Tạo workflow trên GitHub

1. Vào repository của bạn trên GitHub
2. Click tab **Actions**
3. Chọn **"Simple workflow"** → **Configure**
4. Đặt tên file (ví dụ: `first-action.yml`)
5. Xoá nội dung mẫu, dán workflow trên vào
6. Click **Commit changes**

Sau khi commit, vào tab **Actions**, click vào workflow vừa tạo → **Run workflow** để chạy thủ công.

---

## Đọc kết quả chạy

Sau khi workflow chạy xong:
- ✅ Dấu xanh = thành công
- ❌ Dấu đỏ = thất bại
- 🟡 Dấu vàng = đang chạy

Click vào workflow run → click vào job → click vào từng step để xem log chi tiết.

---

**Tiếp theo:** Dùng Actions từ Marketplace →
