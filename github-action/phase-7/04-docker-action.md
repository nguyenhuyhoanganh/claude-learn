# Bài 4: Docker Action — Bất kỳ Ngôn ngữ nào

## Khi nào dùng Docker Action

- Không biết JavaScript nhưng biết Python/Go/Ruby/...
- Cần môi trường đặc biệt (cụ thể hơn bare Node.js)
- Muốn kiểm soát hoàn toàn execution environment

---

## Cấu trúc thư mục

```
.github/
  actions/
    my-docker-action/
      action.yml          ← khai báo action
      Dockerfile          ← định nghĩa container
      requirements.txt    ← (Python) dependencies
      deployment.py       ← logic code (Python ví dụ)
```

---

## File `action.yml` cho Docker Action

```yaml
name: Deploy to S3 (Docker)
description: Deploy static website to AWS S3

inputs:
  bucket:
    description: S3 bucket name
    required: true
  region:
    description: AWS region
    required: false
    default: us-east-1
  dist-folder:
    description: Folder with deployable files
    required: true

outputs:
  website-url:
    description: URL of deployed website

runs:
  using: docker           # ← phân biệt với 'composite' và 'node16'
  image: Dockerfile       # ← đường dẫn đến Dockerfile (relative từ action folder)
```

Thay vì trỏ đến Dockerfile, cũng có thể dùng image từ Docker Hub:
```yaml
runs:
  using: docker
  image: docker://python:3.11
```

---

## Dockerfile

```dockerfile
FROM python:3.11-slim

COPY requirements.txt /requirements.txt
RUN pip install -r /requirements.txt

COPY deployment.py /deployment.py

ENTRYPOINT ["python", "/deployment.py"]
```

---

## Nhận Inputs trong code Docker Action

GitHub Actions **tự động** tạo environment variables từ inputs, theo quy tắc:

```
INPUT_<TÊN_INPUT_IN_HOA>
```

Ví dụ:
- Input `bucket` → biến môi trường `INPUT_BUCKET`
- Input `dist-folder` → biến môi trường `INPUT_DIST-FOLDER`
- Input `bucket-region` → biến môi trường `INPUT_BUCKET-REGION`

Đọc trong Python:

```python
import os

bucket = os.environ['INPUT_BUCKET']
region = os.environ.get('INPUT_REGION', 'us-east-1')
dist_folder = os.environ['INPUT_DIST-FOLDER']
```

---

## Set Output trong code Docker Action

Dùng cú pháp `::set-output` qua `print()`:

```python
website_url = f"http://{bucket}.s3-website-{region}.amazonaws.com"
print(f"::set-output name=website-url::{website_url}")
```

> **Lưu ý:** Đây là cú pháp cũ `::set-output` hiện đã deprecated cho workflow YAML, nhưng **vẫn là cách duy nhất** cho Docker actions tại thời điểm viết bài này. Trong composite và JS actions, dùng `$GITHUB_OUTPUT` thay thế.

---

## Ví dụ deployment.py

```python
import os
import boto3

def deploy():
    bucket = os.environ['INPUT_BUCKET']
    region = os.environ.get('INPUT_REGION', 'us-east-1')
    dist_folder = os.environ['INPUT_DIST-FOLDER']

    # Upload files to S3
    s3 = boto3.client('s3', region_name=region)
    
    for root, dirs, files in os.walk(dist_folder):
        for filename in files:
            local_path = os.path.join(root, filename)
            s3_key = os.path.relpath(local_path, dist_folder)
            s3.upload_file(local_path, bucket, s3_key)
    
    # Set output
    website_url = f"http://{bucket}.s3-website-{region}.amazonaws.com"
    print(f"::set-output name=website-url::{website_url}")

deploy()
```

---

## Dùng trong Workflow

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/download-artifact@v3
        with:
          name: dist-files
          path: dist
      
      - name: Deploy
        id: deploy
        uses: ./.github/actions/my-docker-action
        with:
          bucket: my-website-bucket
          dist-folder: ./dist
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      
      - run: echo "Live at: ${{ steps.deploy.outputs.website-url }}"
```

---

## So sánh 3 loại Custom Actions

| | Composite | JavaScript | Docker |
|---|---|---|---|
| Ngôn ngữ | YAML | JavaScript | Bất kỳ |
| Kiến thức cần | YAML (đã học) | JavaScript + Node.js | Docker + ngôn ngữ chọn |
| File chính | `action.yml` | `action.yml` + `.js` | `action.yml` + `Dockerfile` + code |
| Tốc độ | Nhanh | Nhanh | Chậm hơn (build container) |
| Phù hợp | Gom nhóm steps | Logic JS phức tạp | Logic ngôn ngữ khác |

---

## Chia sẻ Action lên Marketplace

1. Tạo repository riêng với `action.yml` ở root (không nằm trong `.github/`)
2. Thêm git tag: `git tag -a v1 -m "First release" && git push --follow-tags`
3. Dùng từ bất kỳ repo nào: `uses: my-org/my-action@v1`
4. Publish lên Marketplace qua trang GitHub repository

---

## Tóm tắt Phase 7

✅ **Composite Action**: Gom steps YAML tái dùng — đơn giản nhất  
✅ **JavaScript Action**: Logic Node.js + `@actions/core` cho getInput/setOutput  
✅ **Docker Action**: Bất kỳ ngôn ngữ, inputs qua `INPUT_*` env vars  
✅ **action.yml**: File bắt buộc cho mọi loại action  
✅ **node_modules**: Phải commit với JS actions  
✅ **Local vs Standalone**: Local trong `.github/actions/`, standalone trong repo riêng  

---

**Phase 8:** Bảo mật — Security cho GitHub Actions Workflows →
