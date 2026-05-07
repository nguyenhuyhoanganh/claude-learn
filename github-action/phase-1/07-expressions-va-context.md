# Bài 7: Expressions và GitHub Context

## Context là gì?

Khi workflow chạy, GitHub Actions tự động tạo ra một bộ **context data** — dữ liệu về môi trường đang chạy: ai trigger, trên branch nào, repository nào, runner nào...

Bạn có thể truy cập dữ liệu này trong bất kỳ step nào.

---

## Cú pháp Expression

Để dùng dữ liệu động (không phải text cứng), dùng cú pháp:

```
${{ expression }}
```

Ví dụ:

```yaml
run: echo "Repository: ${{ github.repository }}"
```

Dấu `${{ }}` báo cho GitHub Actions biết: "đây không phải text thường, hãy evaluate nó".

---

## Context `github` — Thông tin về workflow và trigger

```yaml
steps:
  - name: Output GitHub context
    run: echo "${{ toJSON(github) }}"
```

Một số field hữu ích trong `github`:

| Field | Ý nghĩa | Ví dụ |
|---|---|---|
| `github.repository` | Tên repository | `username/my-repo` |
| `github.ref` | Branch/tag đang chạy | `refs/heads/main` |
| `github.sha` | Commit hash | `abc123...` |
| `github.actor` | Người trigger workflow | `username` |
| `github.event_name` | Tên sự kiện | `push`, `pull_request` |
| `github.event` | Toàn bộ dữ liệu của sự kiện | object phức tạp |

---

## Hàm `toJSON()`

Context thường là object phức tạp. Dùng `toJSON()` để chuyển sang text có thể in ra:

```yaml
run: echo "${{ toJSON(github.event) }}"
```

Rất hữu ích khi debug để xem GitHub truyền dữ liệu gì vào workflow.

---

## Ví dụ thực tế: Workflow xem thông tin event

```yaml
name: Output Information

on: workflow_dispatch

jobs:
  info:
    runs-on: ubuntu-latest
    steps:
      - name: Output event details
        run: echo "${{ toJSON(github.event) }}"
```

Khi chạy workflow này thủ công, bạn sẽ thấy toàn bộ thông tin về event trigger trong log.

---

## Ứng dụng phổ biến của context

```yaml
steps:
  # Dùng tên actor trong message
  - run: echo "Triggered by ${{ github.actor }}"

  # Chỉ deploy nếu branch là main (sẽ học sau)
  - if: github.ref == 'refs/heads/main'
    run: echo "Deploy to production"

  # Tạo tag với commit SHA
  - run: docker build -t myapp:${{ github.sha }} .
```

---

## Các context khác (sẽ gặp trong khoá học)

| Context | Dùng để |
|---|---|
| `github` | Thông tin về workflow, repo, trigger |
| `env` | Biến môi trường |
| `steps` | Output của các steps trước |
| `needs` | Output của jobs phụ thuộc |
| `runner` | Thông tin máy runner |
| `secrets` | Truy cập secrets (bảo mật) |

---

## Tóm tắt Phase 1

Đến đây bạn đã nắm được:

✅ GitHub Actions là gì và tại sao cần  
✅ 3 khái niệm cốt lõi: Workflow, Jobs, Steps  
✅ Cú pháp YAML và cách viết workflow  
✅ Dùng Actions từ Marketplace (`checkout`, `setup-node`)  
✅ Workflow CI thực tế cho dự án Node.js  
✅ Chạy nhiều jobs — song song và tuần tự với `needs`  
✅ Expressions và GitHub Context  

---

**Phase 2:** Điều khiển chi tiết khi nào workflow chạy — Events, Activity Types, Filters →
