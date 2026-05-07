# Bài 4: Reusable Workflows — Tái sử dụng Workflow

## Vấn đề

Bạn có nhiều workflows (test, build, deploy for staging, deploy for production...) và tất cả đều có bước deploy giống hệt nhau. Copy-paste dẫn đến code trùng lặp khó maintain.

**Giải pháp:** Tách bước deploy thành một workflow riêng và gọi nó từ các workflow khác.

---

## Tạo Reusable Workflow

Để một workflow có thể được gọi từ workflow khác, thêm event `workflow_call` vào trigger:

```yaml
# .github/workflows/reusable-deploy.yml
name: Reusable Deploy

on:
  workflow_call:          # ← event đặc biệt, cho phép workflow này được gọi từ nơi khác

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        run: echo "Deploying..."
```

Workflow này **không tự kích hoạt** khi push hay PR — nó chỉ chạy khi được gọi.

---

## Gọi Reusable Workflow từ Workflow khác

Trong job, thay vì dùng `runs-on` + `steps`, dùng `uses` để gọi workflow khác:

```yaml
# .github/workflows/main.yml
name: Main Pipeline

on: push

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test

  deploy:
    needs: test
    uses: ./.github/workflows/reusable-deploy.yml    # ← gọi workflow khác
```

Lưu ý: job dùng `uses` **không có** `runs-on` hay `steps` — chỉ có `uses` (và có thể thêm `with`, `secrets`).

---

## Truyền Input vào Reusable Workflow

Giống như việc gọi hàm với tham số:

### Khai báo input trong reusable workflow

```yaml
# reusable-deploy.yml
on:
  workflow_call:
    inputs:
      artifact-name:
        description: The name of the artifact to download
        required: true
        type: string           # kiểu: string, number, boolean
      environment:
        description: Target environment
        required: false
        type: string
        default: staging

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Get artifact
        uses: actions/download-artifact@v3
        with:
          name: ${{ inputs.artifact-name }}    # ← dùng inputs context object
      
      - run: echo "Deploying to ${{ inputs.environment }}"
```

### Cung cấp giá trị khi gọi

```yaml
# main.yml
jobs:
  deploy:
    needs: build
    uses: ./.github/workflows/reusable-deploy.yml
    with:
      artifact-name: dist-files      # ← truyền giá trị cho inputs
      environment: production
```

---

## Truyền Secrets vào Reusable Workflow

Secrets xử lý tương tự inputs nhưng dùng key `secrets`:

### Khai báo trong reusable workflow

```yaml
on:
  workflow_call:
    secrets:
      deploy-token:
        required: true
```

### Truyền khi gọi

```yaml
jobs:
  deploy:
    uses: ./.github/workflows/reusable-deploy.yml
    secrets:
      deploy-token: ${{ secrets.DEPLOY_TOKEN }}
```

---

## Nhận Output từ Reusable Workflow

Reusable workflow cũng có thể trả về giá trị, giống như job outputs:

### Khai báo output trong reusable workflow

```yaml
on:
  workflow_call:
    outputs:
      result:
        description: Deployment result
        value: ${{ jobs.deploy.outputs.outcome }}    # ← lấy từ job output

jobs:
  deploy:
    runs-on: ubuntu-latest
    outputs:
      outcome: ${{ steps.set-result.outputs.outcome }}
    steps:
      - name: Deploy
        run: echo "Done"
      
      - name: Set result
        id: set-result
        run: echo "outcome=success" >> $GITHUB_OUTPUT
```

### Đọc output trong workflow gọi

```yaml
jobs:
  deploy:
    uses: ./.github/workflows/reusable-deploy.yml

  print-result:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploy result: ${{ needs.deploy.outputs.result }}"
```

---

## Workflow trong repository khác

Nếu reusable workflow nằm ở repository khác:

```yaml
uses: my-org/shared-workflows/.github/workflows/deploy.yml@main
#     ──────────────────────  ───────────────────────────── ────
#     repo                    đường dẫn file                branch/tag
```

Đây là cách các tổ chức chia sẻ workflows chung cho nhiều dự án.

---

## Sơ đồ tổng quan

```
main.yml                    reusable-deploy.yml
─────────────────────       ───────────────────────
on: push                    on: workflow_call
                              inputs: artifact-name
jobs:                         outputs: result
  test: ...               
  deploy:                   jobs:
    needs: test               deploy:
    uses: ./...reusable         steps: ...
    with:
      artifact-name: dist
```

---

## Tóm tắt Phase 5

✅ **if trên step**: Chạy có điều kiện, cần kết hợp với `failure()` để chạy sau step fail  
✅ **4 hàm đặc biệt**: `failure()`, `success()`, `always()`, `cancelled()`  
✅ **if trên job**: Cần `needs` để job có đủ thông tin về kết quả các jobs khác  
✅ **continue-on-error**: Bỏ qua lỗi của step, workflow tiếp tục như thành công  
✅ **Matrix**: Chạy job nhiều lần với các tổ hợp cấu hình khác nhau song song  
✅ **Reusable Workflows**: Tách workflow thành module tái dùng, truyền inputs/outputs/secrets  

---

**Phase 6:** Containers — Chạy jobs trong Docker container →
