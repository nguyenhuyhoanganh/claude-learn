# Bài 7: Host static website từ S3

File đã upload nhưng URL trả 403. Bài này cấu hình S3 thành **static website hosting** → ai cũng truy cập được.

## 3 bước biến S3 thành web server

```text
Bước 1: Enable Static Website Hosting (Properties)
Bước 2: Disable Block Public Access (Permissions)
Bước 3: Add Bucket Policy cho public read (Permissions)
```

Tất cả qua UI Console. Production có thể script qua CLI.

## Bước 1: Enable Static Website Hosting

1. S3 console → bucket → tab **Properties**.
2. Cuộn xuống cuối → **Static website hosting** → **Edit**.

```text
Static website hosting:    ● Enable     ○ Disable

Hosting type:              ● Host a static website
                            ○ Redirect requests for an object

Index document:            [index.html]        ← bắt buộc
Error document:            [error.html]        ← optional, fallback 404
```

→ Điền **`index.html`** cho Index document. Save.

Scroll xuống cuối page → thấy **Bucket website endpoint**:

```text
http://learn-jenkins-20260105.s3-website-us-east-1.amazonaws.com
```

→ URL website của bạn. Mở → vẫn **403 Forbidden** (vì 2 bước sau chưa làm).

> **Endpoint format khác** Object URL:
> - Object URL: `https://bucket.s3.region.amazonaws.com/key` (HTTPS, file cụ thể).
> - Website endpoint: `http://bucket.s3-website-region.amazonaws.com` (HTTP, root domain).

## Bước 2: Disable Block Public Access

1. Tab **Permissions**.
2. **Block public access (bucket settings)** → **Edit**.
3. **Uncheck** `Block all public access`.
4. Save → AWS confirm dialog (vì làm public là big deal) → gõ `confirm` → confirm.

```text
Block all public access:    ☐ (off)
└── ☐ Block public access via ACLs
└── ☐ Block public access via bucket policy
└── ☐ Block public ACLs
└── ☐ Block public bucket policies
```

→ Bucket giờ **có thể** public, nhưng **chưa public** (cần bucket policy bước 3).

> Đây là design 2 lớp của AWS: Block Public Access là **kill switch toàn account**. Off mới cho phép policy quyết định.

## Bước 3: Add Bucket Policy

Cuộn xuống section **Bucket policy** → **Edit** → paste JSON:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::learn-jenkins-20260105/*"
        }
    ]
}
```

Phân tích:

- **`Effect: Allow`** — cho phép.
- **`Principal: "*"`** — bất kỳ ai (anonymous).
- **`Action: s3:GetObject`** — chỉ cho download object. Không cho upload, delete.
- **`Resource: "arn:aws:s3:::learn-jenkins-20260105/*"`** — apply cho **mọi object** trong bucket (do `/*`).

→ Save. Bucket policy active.

> Quan trọng: thay `learn-jenkins-20260105` bằng **tên bucket của bạn**.

## Verify

Mở Website endpoint:

```text
http://learn-jenkins-20260105.s3-website-us-east-1.amazonaws.com
```

→ Thấy `Hello S3` (content của `index.html` đã upload bài 6). ✅

## Cách tạo policy qua wizard (UI)

Cho người không biết JSON, UI Console có wizard:

1. **Bucket policy** → **Edit** → click **Policy generator** (nút bên cạnh).
2. Form:
   - **Effect**: Allow.
   - **Principal**: `*`.
   - **Service**: S3.
   - **Actions**: `GetObject`.
   - **ARN**: paste bucket ARN (có ở Properties) + `/*`.
3. **Add Statement** → **Generate Policy**.

→ Copy JSON sinh ra → paste vào policy editor.

## Sao kết quả khi pipeline upload lần sau?

Sau khi config xong 3 bước, **mỗi lần Jenkins upload file mới**, file tự động public (vì bucket policy apply cho mọi object trong bucket).

→ Pipeline:
```text
Build → Upload to S3 → User truy cập website endpoint
```

→ Đúng tinh thần Continuous Deployment.

## Lưu ý security

**Bucket public = cẩn thận!**

- Mọi object trong bucket **public read** — bao gồm file nhạy cảm bạn vô tình upload.
- Đừng upload `.env`, database backup, log có PII.
- Audit định kỳ bằng AWS Trusted Advisor (free tier check).

→ Best practice production: dùng **CloudFront** (CDN) đứng trước S3 → có WAF, signed URLs, không expose bucket trực tiếp.

## Vài giới hạn của S3 Static Website

| Tính năng                  | S3 Website     | CloudFront + S3 |
|----------------------------|----------------|-----------------|
| HTTPS                      | ❌ (chỉ HTTP)   | ✅              |
| Custom domain              | ✅ (need DNS)   | ✅              |
| WAF (web firewall)         | ❌              | ✅              |
| CDN edge caching           | ❌              | ✅              |
| Signed URL                 | Limited        | Full            |
| Cost                       | Cheaper        | Slightly more   |

→ Production thường dùng **CloudFront** đứng trước S3. Free tier CloudFront 1 TB egress/tháng đầu năm.

→ Khoá học dùng S3 trực tiếp cho đơn giản.

## Custom domain (optional)

Muốn URL đẹp `https://www.yoursite.com` thay vì `bucket.s3-website-...`?

1. **Buy domain** (Route 53, Namecheap, GoDaddy).
2. **CNAME record**: `www.yoursite.com → bucket.s3-website-us-east-1.amazonaws.com`.
3. (Optional) CloudFront + ACM cert cho HTTPS.

→ Setup ~1 giờ, ngoài scope khoá.

## Pitfall

### Pitfall 1: 403 Forbidden sau khi config

→ Check 3 bước:
1. Static website hosting enabled?
2. Block public access OFF?
3. Bucket policy có `s3:GetObject` cho `*`?

Lỗi 1 trong 3 → 403.

### Pitfall 2: Bucket policy sai ARN

```json
"Resource": "arn:aws:s3:::wrong-bucket-name/*"
```

→ Policy không apply. **Copy đúng ARN** từ Properties bucket.

### Pitfall 3: 404 khi truy cập subpath

```text
http://bucket.s3-website.../about
→ 404 NoSuchKey
```

→ S3 không tìm `about` (không có extension). React Router → cần config index document làm error document:

```text
Index document: index.html
Error document: index.html   ← redirect 404 về index.html → React Router handle
```

→ "SPA fallback" pattern.

### Pitfall 4: Cache aggressive

Sau upload bản mới, browser vẫn thấy bản cũ. S3 không set Cache-Control mặc định, nhưng CDN/browser default cache.

→ Hard refresh (`Ctrl+Shift+R`). Hoặc set `Cache-Control: no-cache` khi upload:

```bash
aws s3 cp index.html s3://bucket/ --cache-control 'no-cache'
```

### Pitfall 5: HTTPS required

User browser modern có thể warn về HTTP. Mixed content (HTTPS page load HTTP resource) bị block.

→ Production: dùng CloudFront + ACM (free SSL).

## Tóm tắt

- 3 bước biến S3 thành web server:
  1. **Enable Static Website Hosting** (Properties → bottom).
  2. **Disable Block Public Access** (Permissions).
  3. **Add Bucket Policy** cho `s3:GetObject` cho `*`.
- Website endpoint khác Object URL: `http://bucket.s3-website-region.amazonaws.com`.
- Endpoint chỉ HTTP, không HTTPS — production dùng CloudFront.
- Mỗi file upload sau đó tự public.
- SPA app: set error document = index document cho route fallback.
- Audit bucket public định kỳ, đừng upload secret.

---

→ [Bài tiếp theo: aws s3 sync và pipeline hoàn chỉnh](08-sync-files-s3.md)
