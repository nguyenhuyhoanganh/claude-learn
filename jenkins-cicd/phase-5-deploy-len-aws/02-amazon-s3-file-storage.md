# Bài 2: Amazon S3 — File storage cloud

**S3** (Simple Storage Service) là service đầu tiên của AWS, ra mắt 2006. Nó là **file storage trên cloud** — lưu file (HTML, ảnh, video, backup database…) với 99.999999999% (11 số 9) độ bền. Bài này tạo bucket S3 đầu tiên.

## S3 là gì?

Tưởng tượng **Dropbox**, nhưng:

- API-first (script được).
- Petabyte scale (Dropbox từng dùng S3).
- Pay per use, không subscription.
- Tích hợp với mọi AWS service khác.

S3 phù hợp:

- **Static website** (HTML/CSS/JS) — đúng use case khoá học.
- **Backup** database, log archive.
- **Big data** — analytics input/output.
- **Media storage** — ảnh, video user upload.
- **Software distribution** — release binary.

## Khái niệm chính

```text
AWS Account
  └── Bucket: my-website-bucket
       ├── Object: index.html         ← file
       ├── Object: about.html
       ├── Object: css/style.css      ← "folder" thật ra là prefix trong key
       └── Object: img/logo.png
```

- **Bucket** = container chứa file. Như "folder root" trong Dropbox. Tên bucket **global unique** (toàn thế giới).
- **Object** = file. Mỗi object có **key** (= path đầy đủ), data, và metadata.
- **Region** — bucket gắn với 1 region cụ thể (chọn khi tạo).
- **Key** = `"folder1/folder2/file.html"`. S3 **không có folder thật** — chỉ là string. UI hiển thị folder để dễ nhìn.

### Bucket name rules

- 3-63 ký tự, lowercase, số, dấu gạch ngang.
- Bắt đầu/kết thúc bằng chữ hoặc số.
- **Global unique** — không 2 account có cùng tên bucket.
- Không có dot (vì gây vấn đề HTTPS).

Ví dụ:
- ✅ `my-website-2026`
- ✅ `acme-corp-prod-logs`
- ❌ `My-Website` (có hoa)
- ❌ `s3` (đã có người dùng)

## Tạo bucket đầu tiên

1. Console → search bar gõ **`S3`** → click.
2. Lần đầu: trang giới thiệu. Click **Create bucket**.

```text
┌─────────────────────────────────────────────────┐
│  Create bucket                                  │
│                                                 │
│  Bucket name:    [learn-jenkins-20260105     ]  │
│  AWS Region:     [us-east-1 (N. Virginia)   ▼]  │
│                                                 │
│  Object Ownership                               │
│  ● ACLs disabled (recommended)                  │
│  ○ ACLs enabled                                 │
│                                                 │
│  Block Public Access settings                   │
│  ☑ Block all public access  ← default          │
│                                                 │
│  Bucket Versioning                              │
│  ○ Enable                                       │
│  ● Disable (default)                            │
│                                                 │
│  [Create bucket]                                │
└─────────────────────────────────────────────────┘
```

Điền:

- **Bucket name**: `learn-jenkins-YYYYMMDDHHmm` (global unique → thêm timestamp).
- **Region**: chọn region bạn quen (vd `us-east-1`).
- **Object Ownership**: giữ default (ACLs disabled).
- **Block Public Access**: **giữ tick** (bài 7 sẽ off cho website hosting).
- **Versioning**: disable (tốn storage).

Click **Create bucket**.

→ Bucket xuất hiện trong danh sách. Click vào để xem.

```text
learn-jenkins-20260105
├── Objects (0)
├── Properties
├── Permissions
├── Metrics
├── Management
└── Access Points
```

Empty bucket — chưa có object. Bài 6 sẽ upload qua CLI.

## Tabs quan trọng

### Objects

Liệt kê file trong bucket. Có nút **Upload** để upload qua UI (drag & drop). Nhưng khoá học dùng **CLI**.

### Properties

- **Static website hosting** (bài 7 dùng).
- **Server-side encryption** — encrypt file at rest. Default SSE-S3 (AWS managed key) free.
- **Versioning** — giữ mọi version object. Khi update → version cũ vẫn có.
- **Replication** — auto copy sang bucket region khác (DR).
- **Object Lock** — không cho xoá/sửa N ngày (compliance).

### Permissions

- **Block public access** (bài 7 sẽ chỉnh).
- **Bucket policy** — JSON định nghĩa ai làm gì với bucket.
- **CORS** — cho phép cross-origin requests.

### Metrics

Xem **request count**, **bytes transferred** theo thời gian. Dùng monitoring.

### Management

- **Lifecycle rules** — tự xoá object sau N ngày, hoặc chuyển sang storage class rẻ hơn (Glacier).
- **Replication rules** — config replication chi tiết.

## Storage classes

S3 không chỉ 1 loại — có nhiều **storage class** với giá khác nhau:

| Class                       | Use case                              | Giá/GB/tháng |
|-----------------------------|---------------------------------------|--------------|
| **S3 Standard**             | Truy cập thường xuyên                  | ~$0.023      |
| **S3 Standard-IA**          | Infrequent access (backup hằng tháng) | ~$0.0125     |
| **S3 One Zone-IA**          | Như IA nhưng 1 AZ → rẻ hơn, ít durable | ~$0.01      |
| **S3 Glacier Instant**      | Archive, truy cập ms                  | ~$0.004      |
| **S3 Glacier Flexible**     | Archive, retrieve vài phút - giờ      | ~$0.0036     |
| **S3 Glacier Deep Archive** | Archive 10+ năm, retrieve 12h         | ~$0.00099    |

→ Khoá học dùng **Standard** (default). Production large-scale có thể dùng Lifecycle để tự chuyển object cũ sang Glacier → tiết kiệm 90%.

## Pricing (đơn giản)

S3 tính tiền 3 thứ:

1. **Storage** — $/GB/tháng. Free tier: 5 GB Standard.
2. **Requests** — $/1000 request (PUT, GET, DELETE...). Free tier: 20,000 GET + 2,000 PUT.
3. **Data transfer out** — $/GB ra internet. Free tier: 100 GB/tháng (toàn AWS).

→ Pipeline khoá học deploy vài MB build/ngày + vài request. **Hoàn toàn free tier**.

> ⚠️ Cẩn thận: nếu bucket public + bị scanner bot DDoS → request count tăng → bill bất ngờ. Bài 7 sẽ học cách hạn chế.

## Action với object qua UI

Click vào object:

- **Download** — tải về local.
- **Copy URL** — link cố định (cần permission).
- **Object URL** — public link (nếu public).
- **Delete** — xoá.
- **Properties** — xem metadata (Content-Type, size, last modified).

Object URL có format:

```text
https://<bucket>.s3.<region>.amazonaws.com/<key>
```

Ví dụ:

```text
https://learn-jenkins-20260105.s3.us-east-1.amazonaws.com/index.html
```

→ Đây là URL truy cập object **trực tiếp**. Cần permission (object phải public, hoặc request có signed URL).

## Permission model

Đây là chỗ AWS phức tạp nhất. 4 cách kiểm soát access:

1. **IAM policy** — gán cho user/role. Bài 4 dùng.
2. **Bucket policy** — JSON gắn vào bucket, áp dụng cho mọi object trong bucket. Bài 7 dùng.
3. **Object ACL** — gán cho từng object (legacy, deprecated).
4. **Presigned URL** — URL có hạn (vd 1 giờ), không cần auth. Cho download tạm.

→ Khoá học dùng **IAM policy** + **Bucket policy**. ACL bỏ qua.

## Pitfall thường gặp

### Pitfall 1: bucket name đã bị dùng

```text
Error: Bucket name already exists.
```

→ Tên global. Thêm timestamp hoặc random suffix.

### Pitfall 2: tạo bucket nhầm region

Quên check region góc phải → tạo ở `eu-west-1` thay vì `us-east-1` → tốn data transfer khi access từ region khác.

### Pitfall 3: upload xong URL không truy cập được

→ Default Block Public Access là ON. URL có nhưng request bị deny 403. Bài 7 sẽ off cho static website.

### Pitfall 4: xoá bucket không xoá được

```text
Error: Bucket is not empty.
```

→ Phải **empty bucket** (xoá tất cả object + version) trước khi xoá bucket. UI có nút Empty + Delete.

### Pitfall 5: data transfer hidden cost

Upload free, **download tính tiền** (sau free tier 100 GB/tháng).

→ Cẩn thận nếu serve video/file lớn cho nhiều user → CloudFront CDN rẻ hơn S3 trực tiếp.

## Tóm tắt

- **S3** = object storage cloud, 99.999999999% durability, API-first.
- **Bucket** = container. **Object** = file. **Key** = path.
- Bucket name **global unique**, lowercase, 3-63 ký tự.
- **Region**: chọn gần user / theo compliance.
- **Storage class**: Standard (frequent), Glacier (archive). Dùng Lifecycle tự chuyển.
- **Free tier**: 5 GB storage, 20K GET, 2K PUT, 100 GB egress/tháng.
- Khoá học dùng S3 làm **static website hosting** (bài 7).

---

→ [Bài tiếp theo: AWS CLI](03-aws-cli.md)
