# Bài 3: JavaScript Action — Logic phức tạp bằng Node.js

## Khi nào dùng JavaScript Action

- Cần logic xử lý phức tạp (gọi API, xử lý file, tính toán...)
- Cần dùng npm packages
- Biết JavaScript/Node.js

---

## Cấu trúc thư mục

```
.github/
  actions/
    my-js-action/
      action.yml            ← khai báo action
      main.js               ← code chạy khi action được dùng
      package.json          ← dependencies
      node_modules/         ← PHẢI commit lên git (xem lý do bên dưới)
```

---

## File `action.yml` cho JavaScript Action

```yaml
name: My JavaScript Action
description: Does something useful

inputs:
  bucket:
    description: S3 bucket name
    required: true
  region:
    description: AWS region
    required: false
    default: us-east-1

outputs:
  website-url:
    description: URL of deployed website

runs:
  using: node20             # ← hoặc node16 — version Node.js để chạy action
  main: main.js             # ← file JS sẽ được thực thi
```

Xác nhận phiên bản mới nhất được hỗ trợ tại [docs.github.com](https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions#runs-for-javascript-actions).

---

## Actions Toolkit — npm packages chính thức

GitHub cung cấp bộ packages để viết JavaScript actions:

```bash
npm install @actions/core @actions/github @actions/exec
```

| Package | Dùng cho |
|---|---|
| `@actions/core` | Đọc inputs, set outputs, log messages |
| `@actions/github` | Truy cập GitHub API, context của workflow |
| `@actions/exec` | Chạy shell commands từ JavaScript |

---

## File `main.js` — Ví dụ đơn giản

```javascript
const core = require('@actions/core');
const exec = require('@actions/exec');

async function run() {
  // Đọc input
  const bucket = core.getInput('bucket', { required: true });
  const region = core.getInput('region', { required: true });
  const distFolder = core.getInput('dist-folder', { required: true });

  // Tạo URL
  const websiteUrl = `http://${bucket}.s3-website-${region}.amazonaws.com`;

  // Chạy AWS CLI command
  await exec.exec(`aws s3 sync ${distFolder} s3://${bucket} --region ${region}`);

  // Set output
  core.setOutput('website-url', websiteUrl);

  // Log message
  core.notice('Deployment completed successfully!');
}

run();
```

### Các method quan trọng của `@actions/core`

| Method | Mô tả |
|---|---|
| `core.getInput('name')` | Đọc giá trị input |
| `core.setOutput('name', value)` | Set output value |
| `core.notice('msg')` | Log notice message |
| `core.warning('msg')` | Log warning |
| `core.setFailed('msg')` | Đánh dấu action thất bại với message |

---

## Dùng trong Workflow

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3      # ← bắt buộc với local action
      - uses: actions/download-artifact@v3
        with:
          name: dist-files
          path: dist
      
      - name: Deploy to S3
        id: deploy
        uses: ./.github/actions/my-js-action
        with:
          bucket: my-website-bucket
          region: us-east-1
          dist-folder: ./dist
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      
      - name: Print URL
        run: echo "Live at: ${{ steps.deploy.outputs.website-url }}"
```

---

## Quan trọng: Phải commit `node_modules`

JavaScript actions phải commit `node_modules` lên git. GitHub Actions **không tự chạy `npm install`** khi gặp JavaScript action — nó expect tất cả code đã sẵn sàng.

```gitignore
# .gitignore ở root project — okay
dist/
node_modules/

# Nhưng đây sẽ block node_modules trong action folder!
```

Nếu `.gitignore` có dòng `node_modules/` áp dụng cho cả action folder, dependencies sẽ không được commit. Cần thêm exception:

```gitignore
# .gitignore
node_modules/
!.github/actions/*/node_modules/    # ← cho phép node_modules trong action folders
```

Ngoài ra kiểm tra không có `dist/` nào bị ignore do wildcard — các packages trong `node_modules` thường có thư mục `dist/` bên trong.

---

## `pre` và `post` (nâng cao)

Ngoài `main`, có thể thêm file chạy **trước** và **sau** main:

```yaml
runs:
  using: node20
  pre: setup.js     # chạy trước main (setup)
  main: main.js     # logic chính
  post: cleanup.js  # chạy sau main (cleanup)
```

---

**Tiếp theo:** Docker Action — Dùng bất kỳ ngôn ngữ nào →
