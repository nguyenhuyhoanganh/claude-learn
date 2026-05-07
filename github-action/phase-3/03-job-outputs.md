# Bài 3: Job Outputs — Truyền giá trị giữa các Jobs

## Artifact vs Output — Khi nào dùng cái nào?

| | Artifact | Output |
|---|---|---|
| Loại dữ liệu | File/thư mục | Giá trị đơn giản (string, số) |
| Ví dụ | `dist/`, `.apk`, log file | Tên file, version, hash, timestamp |
| Dùng khi | Cần chia sẻ file thực sự | Cần chia sẻ một giá trị nhỏ |

---

## Bài toán ví dụ

Sau khi `npm run build`, tên file JavaScript được tạo ra là **ngẫu nhiên** (ví dụ: `main.abc123.js`). Job `deploy` cần biết tên file này để upload đúng.

Giải pháp: Job `build` **publish tên file** như một output → Job `deploy` đọc output đó.

---

## 3 bước để dùng Job Output

### Bước 1: Set output trong step

```yaml
steps:
  - name: Get JS filename
    id: publish                  # ← phải có id
    run: |
      JSFILE=$(find dist/assets -name "*.js" | head -1)
      echo "script-file=$JSFILE" >> $GITHUB_OUTPUT
      #    ─────────────────────    ──────────────────
      #    key=value                ghi vào file output của GitHub
```

**Cú pháp:**
```bash
echo "key=value" >> $GITHUB_OUTPUT
```

- `key` = tên output (bạn tự đặt)
- `value` = giá trị cần lưu
- `$GITHUB_OUTPUT` = biến môi trường trỏ đến file output được quản lý bởi GitHub

> `$GITHUB_OUTPUT` là cách hiện tại (mới). Cách cũ dùng `::set-output name=key::value` đã **deprecated** và sẽ bị xoá — đừng dùng.

---

### Bước 2: Khai báo output ở cấp job

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      script-file: ${{ steps.publish.outputs.script-file }}
      #             ──────────────────────────────────────
      #             steps.<id>.outputs.<key>
    steps:
      - name: Get JS filename
        id: publish
        run: echo "script-file=main.abc123.js" >> $GITHUB_OUTPUT
```

**Cú pháp:**
```yaml
outputs:
  <tên-output-của-job>: ${{ steps.<id>.outputs.<key-trong-step> }}
```

- `<tên-output-của-job>`: tên output mà jobs khác sẽ dùng để đọc
- `steps.<id>`: trỏ đến step có `id` tương ứng
- `.outputs.<key>`: key bạn đã đặt trong `echo "key=value"`

---

### Bước 3: Đọc output ở job khác

```yaml
jobs:
  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Show JS filename
        run: echo "File: ${{ needs.build.outputs.script-file }}"
        #                   ────────────────────────────────
        #                   needs.<tên-job>.outputs.<tên-output-của-job>
```

**Cú pháp truy cập:**
```
${{ needs.<tên-job>.outputs.<tên-output> }}
```

---

## Workflow đầy đủ ví dụ

```yaml
name: Build and Deploy

on: push

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      script-file: ${{ steps.publish.outputs.script-file }}

    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run build

      - name: Get JS filename
        id: publish
        run: |
          JSFILE=$(find dist/assets -name "*.js" | head -1)
          echo "script-file=$JSFILE" >> $GITHUB_OUTPUT

      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: dist-files
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Get artifact
        uses: actions/download-artifact@v3
        with:
          name: dist-files

      - name: Show filename from output
        run: echo "JS file: ${{ needs.build.outputs.script-file }}"

      - name: Deploy
        run: echo "Deploying..."
```

---

## Sơ đồ luồng dữ liệu

```
Job build
  └─ Step (id: publish)
       └─ echo "script-file=main.js" >> $GITHUB_OUTPUT
  └─ outputs:
       script-file: ${{ steps.publish.outputs.script-file }}
                                          ↓
Job deploy (needs: build)
  └─ ${{ needs.build.outputs.script-file }}
```

---

## Lưu ý

- Output chỉ truyền được **giá trị text** (string). Muốn truyền file thì dùng Artifact.
- Job muốn đọc output phải khai báo `needs` trỏ đến job đó.
- `id` của step là bắt buộc khi bạn muốn tham chiếu đến output của step đó.

---

**Tiếp theo:** Dependency Caching — Tăng tốc workflow →
