# Bài 6: Upload file lên S3 từ Jenkins

Bài 5 setup auth. Giờ thực sự upload file.

## Tìm command upload — `aws s3 cp`

AWS CLI Reference → S3 service → command `cp`:

```text
NAME
    cp -

DESCRIPTION
    Copies a local file or S3 object to another location locally or in S3.

SYNOPSIS
    aws s3 cp <LocalPath> <S3Uri> [--options]
    aws s3 cp <S3Uri> <LocalPath> [--options]
    aws s3 cp <S3Uri> <S3Uri> [--options]

EXAMPLES
    The following example copies a file to a bucket:
        aws s3 cp test.txt s3://mybucket/test.txt
```

→ Cú pháp clear: `cp <source> <destination>`. Source/destination có thể là local path hoặc S3 URI.

## Thêm command upload vào pipeline

Tạo file mẫu rồi upload:

```groovy
stage('AWS') {
    agent { docker { image 'my-playwright' } }
    steps {
        withCredentials([usernamePassword(
            credentialsId: 'my-aws',
            usernameVariable: 'AWS_ACCESS_KEY_ID',
            passwordVariable: 'AWS_SECRET_ACCESS_KEY'
        )]) {
            sh '''
                set -euo pipefail
                aws --version
                echo "Hello S3" > index.html
                aws s3 cp index.html s3://learn-jenkins-20260105/index.html
            '''
        }
    }
}
```

Push + Build Now → log:

```text
+ aws --version
aws-cli/2.15.30 ...

+ echo Hello S3
+ aws s3 cp index.html s3://learn-jenkins-20260105/index.html
upload: ./index.html to s3://learn-jenkins-20260105/index.html
```

✓ Upload thành công. Vào S3 console → bucket `learn-jenkins-20260105` → tab Objects → thấy `index.html`.

Click vào object → **Object URL** → mở browser:

```text
https://learn-jenkins-20260105.s3.us-east-1.amazonaws.com/index.html
```

→ Lúc này request bị deny 403 vì bucket vẫn private. Bài 7 sẽ mở public.

## Refactor: dùng env var cho bucket name

Hard-code `learn-jenkins-20260105` trong sh command → sửa nhiều chỗ khi đổi bucket. Dùng env var:

```groovy
environment {
    AWS_S3_BUCKET = 'learn-jenkins-20260105'
}
...
stage('AWS') {
    ...
    steps {
        withCredentials([...]) {
            sh '''
                echo "Hello S3" > index.html
                aws s3 cp index.html s3://$AWS_S3_BUCKET/index.html
            '''
        }
    }
}
```

→ Dùng `$AWS_S3_BUCKET` trong shell. Bucket name đổi → sửa 1 chỗ.

## `aws s3 cp` flags hữu ích

| Flag                       | Mục đích                                        |
|----------------------------|-------------------------------------------------|
| `--acl public-read`        | Object public ngay khi upload                   |
| `--cache-control max-age=3600` | Set HTTP Cache-Control header              |
| `--content-type text/html` | Force MIME type                                 |
| `--metadata key=value`     | Custom metadata                                  |
| `--recursive`              | Upload cả thư mục                               |
| `--exclude '*.log'`        | Loại file pattern                               |
| `--include '*.html'`       | Chỉ include pattern                             |
| `--dryrun`                 | Test, không upload thật                         |

Ví dụ:

```bash
aws s3 cp ./build s3://bucket/ \
    --recursive \
    --cache-control max-age=86400 \
    --exclude '*.map'
```

→ Upload toàn bộ `build/`, cache 1 ngày, bỏ source maps.

## Path-style vs Virtual-hosted-style URL

S3 hỗ trợ 2 URL format:

```text
# Virtual-hosted-style (recommended)
https://bucket-name.s3.us-east-1.amazonaws.com/key

# Path-style (legacy, deprecating)
https://s3.us-east-1.amazonaws.com/bucket-name/key
```

→ Khi dùng `s3://bucket/key` trong CLI, S3 tự chọn. Khi reference URL public, dùng virtual-hosted-style.

## Content-Type tự detect

AWS CLI tự detect content-type qua extension:

```text
index.html       → text/html
style.css        → text/css
app.js           → application/javascript
logo.png         → image/png
data.json        → application/json
```

→ Browser load đúng. Nếu sai (vd `aws s3 cp file.html s3://b/file` thiếu extension), browser có thể download thay vì render.

Override:

```bash
aws s3 cp index s3://b/index --content-type text/html
```

## Recursive upload

Upload nguyên thư mục `build/`:

```bash
aws s3 cp build/ s3://bucket/ --recursive
```

→ Copy mọi file trong `build/` (cả subdirectory) vào bucket. Cấu trúc thư mục preserved.

Ví dụ build folder:

```text
build/
├── index.html
├── static/
│   ├── js/main.abc.js
│   └── css/main.xyz.css
└── favicon.ico
```

Sau `cp --recursive`:

```text
s3://bucket/
├── index.html
├── static/
│   ├── js/main.abc.js
│   └── css/main.xyz.css
└── favicon.ico
```

→ Pipeline có thể `cp --recursive` thay `cp` riêng từng file.

## Test với `aws s3 ls`

Check upload thành công:

```bash
aws s3 ls s3://learn-jenkins-20260105/
# 2026-01-05 10:15:00          9 index.html
```

→ List objects trong bucket.

Recursive:

```bash
aws s3 ls s3://learn-jenkins-20260105/ --recursive
```

## Pipeline với upload

```groovy
stage('Deploy to AWS') {
    agent { docker { image 'my-playwright' } }
    steps {
        withCredentials([usernamePassword(
            credentialsId: 'my-aws',
            usernameVariable: 'AWS_ACCESS_KEY_ID',
            passwordVariable: 'AWS_SECRET_ACCESS_KEY'
        )]) {
            sh '''
                set -euo pipefail
                aws s3 cp build/ s3://$AWS_S3_BUCKET/ --recursive
                aws s3 ls s3://$AWS_S3_BUCKET/ --recursive
            '''
        }
    }
}
```

→ Upload toàn bộ `build/`, list lại để verify.

## Cảnh báo: `cp --recursive` không xoá file thừa

`cp --recursive` copy **chỉ thêm**, không xoá. Nếu commit cũ có file `old.html`, commit mới bỏ → S3 vẫn còn `old.html` (orphan).

→ Giải pháp: dùng `aws s3 sync` (bài 8). Sync = copy mới + xoá cũ.

## Performance khi nhiều file

`aws s3 cp --recursive` upload **tuần tự**. 1000 file = 1000 lượt. Chậm.

→ AWS CLI v2 có `--cli-write-timeout` và auto-multipart. Cải thiện đáng kể.

Alternative tools nhanh hơn cho production:
- **s5cmd** — Go-based, parallel.
- **rclone** — multi-cloud sync.

→ Khoá học stick với `aws s3` (đủ tốt cho ~100 file).

## Cost cho upload

Mỗi PUT request tốn ~$0.005/1000 (Standard tier). Free tier 2000 PUT/tháng đầu năm.

→ Pipeline 5 file/build × 100 build/ngày = 500 PUT/ngày = 15,000/tháng. Vượt free → ~$0.075/tháng (vẫn rẻ).

Storage: 5 MB build/build × 30 build/tháng giữ = 150 MB. < 5 GB free → $0.

## Tóm tắt

- **`aws s3 cp <src> <dst>`** upload/download file.
- `s3://bucket/key` là S3 URI (CLI), khác HTTPS URL (HTTP access).
- `--recursive` upload cả thư mục. Nhưng **không xoá file thừa** (bài 8 dùng sync).
- AWS CLI tự detect content-type qua extension.
- Verify bằng `aws s3 ls s3://bucket/ --recursive`.
- Pipeline mẫu: `aws s3 cp build/ s3://$AWS_S3_BUCKET/ --recursive`.
- Cost upload thấp, đa số trong free tier.

---

→ [Bài tiếp theo: Host static website từ S3](07-host-website-tren-s3.md)
