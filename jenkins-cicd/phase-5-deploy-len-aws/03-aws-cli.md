# Bài 3: AWS CLI

Jenkins không click chuột được trên S3 UI. Phải dùng **AWS CLI** (command line interface) để script. Bài này: AWS CLI là gì, v1 vs v2, dùng trong Docker.

## AWS CLI là gì?

**AWS CLI** = command-line tool tương tác với mọi AWS service. Cú pháp chung:

```bash
aws <service> <command> [options]
```

Ví dụ:

```bash
aws s3 ls                              # List bucket
aws s3 cp file.html s3://my-bucket/    # Upload file
aws ec2 describe-instances             # List EC2
aws iam list-users                     # List IAM users
aws lambda invoke ...                  # Gọi Lambda function
```

→ **1 tool, ~200 service**. Học cú pháp 1 lần, dùng cho mọi service.

## Cài AWS CLI

3 cách:

### 1. Cài trên máy local

- macOS: `brew install awscli`
- Linux: `curl awscli.zip` + install (như bài Phase 4 đã làm).
- Windows: download MSI.

### 2. Dùng Docker image

AWS phát hành official Docker image:

```bash
docker run --rm amazon/aws-cli --version
```

→ Tải image, chạy lệnh, exit, xoá container. Không cài gì local.

### 3. Dùng trong Jenkins pipeline (cách khoá học)

Image `amazon/aws-cli` đã có **entrypoint** mặc định = `aws`. Khi `docker run` không truyền lệnh → image tự chạy `aws help`.

→ Trong Jenkinsfile, **cần override entrypoint** để chạy lệnh bất kỳ.

## Demo: thêm stage AWS vào pipeline

```groovy
stage('AWS') {
    agent {
        docker {
            image 'amazon/aws-cli'
            args  '--entrypoint=""'                  // ← Override entrypoint
        }
    }
    steps {
        sh '''
            aws --version
        '''
    }
}
```

Quan trọng: **`args '--entrypoint=""'`** — bypass entrypoint default. Nếu thiếu, container chỉ chạy `aws` rồi exit, không exec lệnh trong `steps`.

Push + Build Now → log:

```text
+ aws --version
aws-cli/2.15.30 Python/3.11.7 Linux/...
```

✓ AWS CLI ready.

## Hoặc dùng image custom (Phase 4)

Bài Phase 4 đã cài AWS CLI vào image `my-playwright`. Stage giờ đơn giản:

```groovy
stage('AWS') {
    agent { docker { image 'my-playwright' } }
    steps { sh 'aws --version' }
}
```

→ Không cần override entrypoint. Image custom tốt vì 1 image dùng cho nhiều stage (Netlify + AWS + Playwright).

Khoá học từ đây sẽ dùng image custom.

## AWS CLI v1 vs v2

AWS CLI có 2 major version:

| Version | Ra mắt | Python ver | Status                                  |
|---------|--------|------------|-----------------------------------------|
| **v1**  | 2013   | Python 2/3 | Deprecated, vẫn maintain                 |
| **v2**  | 2020   | Self-contained (không cần Python) | **Recommended** |

**Khác biệt**:
- v2 cài qua binary installer (không cần Python).
- v2 có tính năng mới: SSO login, server-side pagination, auto prompt.
- v2 command syntax thường giống v1 (đa số script v1 chạy được v2).

**Document URL**:
- v1: `docs.aws.amazon.com/cli/latest/...` ← lẫn lộn vì cũng có "latest"
- v2: `docs.aws.amazon.com/cli/v2/...`

→ Khi đọc doc, **luôn check URL** để chắc bạn đang xem v2.

→ Khoá học dùng v2 (image `amazon/aws-cli` default = v2).

## Cú pháp lệnh chi tiết

```text
aws [global-options] <service> <subcommand> [parameters]
```

Ví dụ:

```bash
aws --region us-west-2 s3 ls --recursive
   ↑          ↑     ↑   ↑    ↑
   │          │     │   │    └─ subcommand parameter
   │          │     │   └─ subcommand
   │          │     └─ service
   │          └─ global option value
   └─ global option
```

### Global options phổ biến

| Option           | Mục đích                                   |
|------------------|--------------------------------------------|
| `--region <r>`   | Override region cho lệnh này               |
| `--profile <p>`  | Dùng named profile (multi-account)         |
| `--output json/text/table/yaml` | Format output             |
| `--query <jmespath>` | Filter output (như jq)                 |
| `--no-cli-pager` | Bỏ qua less, in trực tiếp                  |
| `--debug`        | Verbose log                                |

### Output format

Default = JSON:

```bash
$ aws s3api list-buckets
{
    "Buckets": [
        {
            "Name": "learn-jenkins-20260105",
            "CreationDate": "2026-01-05T10:00:00+00:00"
        }
    ],
    "Owner": { ... }
}
```

Table format:

```bash
$ aws s3api list-buckets --output table
-----------------------------------------
|             ListBuckets                |
+----------------------------------------+
||              Buckets                 ||
|+----------------+---------------------+|
||  CreationDate  |        Name         ||
|+----------------+---------------------+|
||  2026-01-05... | learn-jenkins-...   ||
|+----------------+---------------------+|
```

→ Table dễ đọc, JSON dễ parse với `jq`.

## Tìm command đúng: documentation

URL: <https://docs.aws.amazon.com/cli/latest/reference/index.html>

Cấu trúc:

```text
Available Services
├── ec2
├── iam
├── s3
├── s3api  (low-level S3 API)
├── lambda
└── ... (~200 service)
```

→ Click vào service → list **available commands** → click command → docs chi tiết với examples.

### Tip đọc docs nhanh

Đọc 5 phần này, bỏ qua mọi thứ khác:

1. **Description** — command làm gì.
2. **Synopsis** — syntax.
3. **Options** — flag thường dùng (đa số chỉ cần 2-3).
4. **Examples** — ⭐ quan trọng nhất. Copy paste.
5. **Output** — format response.

Phần khác (Limits, Errors, See Also) → đọc khi cần.

### Pattern dùng `--help`

CLI có built-in help:

```bash
aws help                    # List all services
aws s3 help                 # List commands of s3
aws s3 cp help              # Help for s3 cp command
```

→ Không cần internet, nhanh hơn search Google.

## Hai loại S3 command: `s3` vs `s3api`

AWS CLI có 2 nhóm command cho S3:

| Group           | Use case                                      |
|-----------------|-----------------------------------------------|
| **`aws s3`**     | High-level. Like `cp`, `mv`, `ls`, `sync`. Đơn giản. |
| **`aws s3api`**  | Low-level. Map 1:1 với REST API. Granular.   |

Ví dụ:

```bash
# High-level (s3)
aws s3 cp file.html s3://bucket/
aws s3 sync ./build s3://bucket/
aws s3 ls

# Low-level (s3api)
aws s3api put-object --bucket bucket --key file.html --body file.html
aws s3api put-bucket-policy --bucket bucket --policy file://policy.json
```

→ Pipeline khoá học dùng **`aws s3`** (đơn giản hơn).

## List bucket — thử ngay

Cập nhật pipeline:

```groovy
stage('AWS') {
    agent { docker { image 'my-playwright' } }
    steps {
        sh '''
            aws --version
            aws s3 ls
        '''
    }
}
```

Push + Build Now → log:

```text
+ aws --version
aws-cli/2.15.30 ...

+ aws s3 ls
Unable to locate credentials. You can configure credentials by running "aws configure".
script returned exit code 255
```

❌ **Fail**. Vì sao? AWS CLI **không biết bạn là ai** — chưa cấu hình credentials. Đây là tin tốt — nếu không thì ai cũng list được bucket của bạn.

→ Bài 4 (IAM) tạo user + credentials. Bài 5 lưu vào Jenkins.

## Anatomy của S3 URI

```text
s3://learn-jenkins-20260105/build/index.html
 ↑    ↑                       ↑
 │    │                       └─ key (path trong bucket)
 │    └─ bucket name
 └─ S3 protocol scheme
```

→ S3 URI dùng cho command như `cp`, `sync`. Không phải HTTPS URL.

## Tóm tắt

- **AWS CLI** = tool command-line cho mọi AWS service. 1 tool, 200+ service.
- 3 cách cài: local, `docker run amazon/aws-cli`, build vào image custom.
- Trong Jenkins: cần `args '--entrypoint=""'` khi dùng image `amazon/aws-cli`.
- **CLI v2 recommended** (vs v1 legacy).
- Cú pháp: `aws <service> <command> [options]`.
- 2 nhóm S3: **`s3`** (high-level, đơn giản) vs **`s3api`** (low-level, granular).
- **`aws help`** built-in, nhanh hơn Google.
- Cần **credentials** (bài 4-5) mới gọi được command thật.

---

→ [Bài tiếp theo: IAM — Quản lý quyền AWS](04-iam-quan-ly-quyen.md)
