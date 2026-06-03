# Bài 4: File upload S3, CDN, multipart, presigned URL

E-commerce cần lưu ảnh sản phẩm. Lưu vào DB = tệ (size lớn, slow). Lưu trên local disk = không scale. Industry standard: **S3 + CDN**. Bài này build pattern: multipart upload từ HTTP, store S3, serve qua CDN, presigned URL cho upload direct browser → S3.

## AWS SDK v2

```bash
go get github.com/aws/aws-sdk-go-v2
go get github.com/aws/aws-sdk-go-v2/config
go get github.com/aws/aws-sdk-go-v2/service/s3
```

## Storage interface

```go
// internal/storage/storage.go
package storage

import (
    "context"
    "io"
)

type Uploader interface {
    Upload(ctx context.Context, key string, body io.Reader, contentType string) (string, error)
    Delete(ctx context.Context, key string) error
    PresignUpload(ctx context.Context, key string, expires time.Duration) (string, error)
    URL(key string) string
}
```

→ Interface cho phép swap: S3 → MinIO → local filesystem cho dev.

## S3 implementation

```go
// internal/storage/s3.go
package storage

import (
    "github.com/aws/aws-sdk-go-v2/aws"
    "github.com/aws/aws-sdk-go-v2/config"
    "github.com/aws/aws-sdk-go-v2/credentials"
    "github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Uploader struct {
    client  *s3.Client
    presign *s3.PresignClient
    bucket  string
    cdnURL  string   // optional CDN
}

func NewS3Uploader(ctx context.Context, region, accessKey, secretKey, bucket, cdnURL string) (*S3Uploader, error) {
    cfg, err := config.LoadDefaultConfig(ctx,
        config.WithRegion(region),
        config.WithCredentialsProvider(
            credentials.NewStaticCredentialsProvider(accessKey, secretKey, ""),
        ),
    )
    if err != nil {
        return nil, fmt.Errorf("load aws config: %w", err)
    }
    
    client := s3.NewFromConfig(cfg)
    return &S3Uploader{
        client:  client,
        presign: s3.NewPresignClient(client),
        bucket:  bucket,
        cdnURL:  cdnURL,
    }, nil
}

func (s *S3Uploader) Upload(ctx context.Context, key string, body io.Reader, contentType string) (string, error) {
    _, err := s.client.PutObject(ctx, &s3.PutObjectInput{
        Bucket:      aws.String(s.bucket),
        Key:         aws.String(key),
        Body:        body,
        ContentType: aws.String(contentType),
        ACL:         "public-read",   // hoặc bỏ nếu private
    })
    if err != nil {
        return "", fmt.Errorf("s3 put: %w", err)
    }
    return s.URL(key), nil
}

func (s *S3Uploader) Delete(ctx context.Context, key string) error {
    _, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
        Bucket: aws.String(s.bucket),
        Key:    aws.String(key),
    })
    return err
}

func (s *S3Uploader) PresignUpload(ctx context.Context, key string, expires time.Duration) (string, error) {
    req, err := s.presign.PresignPutObject(ctx, &s3.PutObjectInput{
        Bucket: aws.String(s.bucket),
        Key:    aws.String(key),
    }, s3.WithPresignExpires(expires))
    if err != nil {
        return "", err
    }
    return req.URL, nil
}

func (s *S3Uploader) URL(key string) string {
    if s.cdnURL != "" {
        return strings.TrimRight(s.cdnURL, "/") + "/" + key
    }
    return fmt.Sprintf("https://%s.s3.amazonaws.com/%s", s.bucket, key)
}
```

## Multipart upload handler

```go
// internal/handlers/product_handler.go
const (
    maxUploadSize = 10 << 20    // 10 MB
)

var allowedTypes = map[string]string{
    "image/jpeg": ".jpg",
    "image/png":  ".png",
    "image/webp": ".webp",
}

func (h *ProductHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
    productID := chi.URLParam(r, "id")
    
    // Limit body size
    r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
    
    if err := r.ParseMultipartForm(maxUploadSize); err != nil {
        writeError(w, 400, "file too large")
        return
    }
    
    file, header, err := r.FormFile("image")
    if err != nil {
        writeError(w, 400, "missing 'image' field")
        return
    }
    defer file.Close()
    
    // Detect MIME — KHÔNG trust extension
    buf := make([]byte, 512)
    if _, err := file.Read(buf); err != nil {
        writeError(w, 400, "read file")
        return
    }
    contentType := http.DetectContentType(buf)
    
    ext, ok := allowedTypes[contentType]
    if !ok {
        writeError(w, 415, "unsupported type: "+contentType)
        return
    }
    
    // Seek back to start
    if _, err := file.Seek(0, 0); err != nil {
        writeError(w, 500, "seek file")
        return
    }
    
    // Unique key
    key := fmt.Sprintf("products/%s/%s%s",
        productID, uuid.NewString(), ext)
    
    url, err := h.svc.UploadImage(r.Context(), productID, file, contentType, key)
    if err != nil {
        h.log.Error("upload", "error", err)
        writeError(w, 500, "upload failed")
        return
    }
    
    h.log.Info("uploaded", "product", productID, "size", header.Size, "key", key)
    
    writeJSON(w, 201, map[string]string{"url": url})
}
```

Best practice:
- `MaxBytesReader` enforce size limit (DoS prevention).
- `DetectContentType` từ magic number, không trust filename.
- UUID trong path → ngừa collision + ngừa user predict.
- `defer file.Close()`.

## Service layer

```go
func (s *productService) UploadImage(ctx context.Context, productID string, file io.Reader, contentType, key string) (string, error) {
    // Validate product exists
    p, err := s.repo.GetByID(ctx, productID)
    if err != nil {
        return "", err
    }
    
    // Upload S3
    url, err := s.uploader.Upload(ctx, key, file, contentType)
    if err != nil {
        return "", fmt.Errorf("upload: %w", err)
    }
    
    // Update DB
    if err := s.repo.AddImage(ctx, p.ID, url, key); err != nil {
        // Rollback S3 (best effort)
        _ = s.uploader.Delete(context.Background(), key)
        return "", fmt.Errorf("save image: %w", err)
    }
    
    return url, nil
}
```

Pattern: nếu DB save fail sau upload S3 → cleanup S3 (best effort).

## Presigned URL — Direct upload

Server-mediated upload (như trên) chậm: client → server → S3. Cho file lớn dùng **presigned URL**: server tạo URL có chữ ký, client upload **direct** lên S3.

```go
type PresignRequest struct {
    Filename    string `json:"filename"`
    ContentType string `json:"content_type"`
}

type PresignResponse struct {
    UploadURL string `json:"upload_url"`
    Key       string `json:"key"`
    FinalURL  string `json:"final_url"`
}

func (h *ProductHandler) PresignUpload(w http.ResponseWriter, r *http.Request) {
    var req PresignRequest
    json.NewDecoder(r.Body).Decode(&req)
    
    if _, ok := allowedTypes[req.ContentType]; !ok {
        writeError(w, 415, "unsupported type")
        return
    }
    
    key := fmt.Sprintf("uploads/%s%s", uuid.NewString(),
        filepath.Ext(req.Filename))
    
    uploadURL, err := h.uploader.PresignUpload(r.Context(), key, 15*time.Minute)
    if err != nil {
        writeError(w, 500, "presign failed")
        return
    }
    
    writeJSON(w, 200, PresignResponse{
        UploadURL: uploadURL,
        Key:       key,
        FinalURL:  h.uploader.URL(key),
    })
}
```

Client flow:
```js
// 1. Get presigned URL
const { upload_url, final_url } = await fetch('/api/upload/presign', {...});

// 2. Upload direct to S3
await fetch(upload_url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type }
});

// 3. Notify backend (final_url đã ready)
await fetch('/api/products/123/images', {
    method: 'POST',
    body: JSON.stringify({ url: final_url })
});
```

Lợi:
- Backend không stream file.
- Scale tốt (S3 handle bandwidth).
- Phù hợp video, file lớn.

## CDN — CloudFront

S3 + CloudFront:
```text
[Browser] → [CloudFront edge] → [S3 origin]
              ↓ cache 24h
              return từ edge
```

Lợi:
- Latency thấp (edge gần user).
- Giảm cost S3 GET request.
- HTTPS + custom domain.

Setup:
```text
1. Create CloudFront distribution với origin = S3 bucket.
2. Set CNAME: cdn.mysite.com → CloudFront domain.
3. App return CDN URL thay S3 direct.
```

App config:
```go
cfg.CDNURL = "https://cdn.mysite.com"
uploader.URL("products/123/abc.jpg")
// "https://cdn.mysite.com/products/123/abc.jpg"
```

## Image resize (peek)

Production thường resize:
```go
import "github.com/disintegration/imaging"

img, _ := imaging.Decode(file)
thumb := imaging.Resize(img, 200, 0, imaging.Lanczos)

var buf bytes.Buffer
imaging.Encode(&buf, thumb, imaging.JPEG)

s.uploader.Upload(ctx, key+"-thumb.jpg", &buf, "image/jpeg")
```

Hoặc dùng dịch vụ:
- AWS Lambda + S3 trigger.
- Cloudinary, imgix (serverless image API).
- Sharp (Node.js worker).

## LocalStack — Test S3 local

```yaml
# docker-compose.yml
localstack:
  image: localstack/localstack
  environment:
    SERVICES: s3
  ports: ["4566:4566"]
```

```go
// Dev config
cfg, _ := config.LoadDefaultConfig(ctx,
    config.WithRegion("us-east-1"),
    config.WithEndpointResolverWithOptions(
        aws.EndpointResolverWithOptionsFunc(
            func(service, region string, opts ...interface{}) (aws.Endpoint, error) {
                return aws.Endpoint{
                    URL: "http://localhost:4566",
                }, nil
            },
        ),
    ),
)

// Sử dụng path-style cho LocalStack
client := s3.NewFromConfig(cfg, func(o *s3.Options) {
    o.UsePathStyle = true
})
```

→ Dev không cần AWS account.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Trust filename extension | Upload malicious file | DetectContentType |
| Không limit size | DoS | MaxBytesReader |
| Filename collision | Overwrite | UUID prefix |
| S3 upload OK nhưng DB fail | Orphan file | Cleanup S3 best effort |
| Bucket public mọi file | Leak private data | Bucket private + presigned GET |
| Hardcode AWS credentials | Leak khi commit | IAM role hoặc env var |
| CORS thiếu | Browser block | S3 CORS config |
| Path /tmp/upload | Disk full | Stream straight to S3 |
| Quên `defer Close()` | Leak goroutine | Defer close |
| Presigned không expire | Token vĩnh viễn | Set Expires |

## S3 CORS config

```json
[
  {
    "AllowedOrigins": ["https://mysite.com"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

Required cho frontend direct upload qua presigned URL.

## Tóm tắt bài 4

- Storage interface → swap S3 / MinIO / local.
- AWS SDK v2: `s3.Client` + `s3.PresignClient`.
- Multipart upload: `MaxBytesReader` + `ParseMultipartForm` + `DetectContentType`.
- Path UUID + ext extension validated.
- Service rollback S3 nếu DB save fail.
- Presigned URL: direct client → S3, scale tốt cho file lớn.
- CDN (CloudFront) → cache edge, custom domain.
- LocalStack cho dev không cần AWS.
- Security: bucket private mặc định, public chỉ ảnh public, HTTPS only.

**Bài kế tiếp** → [Bài 5: Event-driven với SQS, Watermill, email worker](05-event-driven.md)
