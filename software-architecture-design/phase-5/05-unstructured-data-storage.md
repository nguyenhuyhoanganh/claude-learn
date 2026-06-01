# Bài 5: Unstructured Data Storage (Lưu trữ dữ liệu phi cấu trúc)

## Unstructured Data là gì?

> **Unstructured Data** (dữ liệu phi cấu trúc) = Dữ liệu không tuân theo schema hay model cụ thể — thường là **binary blob** (Binary Large Object — đối tượng nhị phân lớn).

**Ví dụ thực tế:**

- Video files (.mp4, .mkv, .mov)
- Hình ảnh (.jpg, .png, .webp, .avif)
- File audio (.mp3, .wav, .flac)
- Tài liệu PDF, Word, Excel
- Log dạng raw (chưa parse)
- Database backup (file .sql, .bak)
- Machine learning model files
- Container images (Docker)

**Vấn đề khi lưu loại data này vào relational/NoSQL database thông thường:**

- **Size limits** nghiêm ngặt — đa số DB giới hạn vài MB / record.
- Performance kém với binary objects lớn (DB không tối ưu cho streaming bytes).
- Tốn tài nguyên DB cho việc không cần dùng đến SQL.
- Khó scale (DB không sinh ra để chứa hàng petabyte file).

→ Cần **giải pháp chuyên dụng** cho loại dữ liệu này.

## Các Use Cases phổ biến

| Use Case | Ví dụ thực tế |
|----------|-------|
| **User uploads** | Photo, video user upload lên social media (Instagram, TikTok) |
| **Database backup / archiving** | Snapshot định kỳ phục vụ disaster recovery |
| **Web hosting** | Hình ảnh, JS, CSS cho website |
| **Big Data & ML** | Training dataset, dữ liệu IoT sensor, log analytics |
| **Content delivery** | Asset cho video streaming, OTT platform |

**Đặc điểm chung của các use case này:**
- Tổng dung lượng cực lớn (TB → PB).
- Mỗi object có thể rất lớn (vài GB / file).
- Truy cập theo dạng read-heavy (đọc nhiều hơn ghi nhiều lần).

## Hai giải pháp lớn cho Unstructured Data

### 1. Distributed File System (Hệ thống file phân tán)

> Cùng abstraction (cách nhìn) như local file system, nhưng dữ liệu được **phân tán trên nhiều storage node** trong cluster.

```text
Files được tổ chức trong folders / directories (như Linux filesystem):

/videos/2024/01/
    ├── user123_upload.mp4
    ├── user456_upload.mp4
    └── ...
/images/
    ├── profile/
    └── posts/
```

**Ưu điểm:**

- **API quen thuộc**: dùng như local filesystem (open, read, write, seek).
- Có thể **sửa file** (append, partial update, random write).
- **Performance tốt cho Big Data processing**: Hadoop, Spark có thể chạy trực tiếp trên HDFS — đọc theo block parallel.
- Hỗ trợ replication, consistency guarantee tuỳ implementation.

**Nhược điểm:**

- Giới hạn số lượng file (inodes — metadata về mỗi file chiếm RAM ở namenode).
- Khó expose qua web API (không có REST sẵn).
- Phải build thêm abstraction layer cho external access.
- Vận hành phức tạp.

**Các sản phẩm phổ biến:**
- **HDFS** (Hadoop Distributed File System) — nền tảng Big Data từ Hadoop ecosystem.
- **GlusterFS** — open-source distributed FS.
- **Ceph** — distributed storage hỗ trợ cả file, block, object.
- **Google Colossus** — successor của GFS, dùng nội bộ Google.

### 2. Object Store (Kho lưu trữ object)

> Storage service được thiết kế chuyên cho **unstructured data ở quy mô Internet**.

**Cấu trúc dữ liệu:**

```text
Bucket (Container — thùng chứa)
├── Object 1: {name: "video.mp4",        value: binary, metadata: {size, type, ...}}
├── Object 2: {name: "profile.jpg",      value: binary, metadata: {ACL, owner, ...}}
└── Object 3: {name: "backup_2024-01.sql", value: binary}

Cấu trúc PHẲNG (flat) — không có folder thực sự, chỉ có prefix trong tên object
                       để giả lập folder (vd: "videos/2024/01/file.mp4")
```

**Ưu điểm:**

- **HTTP REST API** → dễ tích hợp với web app, mobile app.
- **Số lượng object và size gần như không giới hạn** (S3 cho phép tới 5 TB / object).
- **Versioning** built-in → có thể rollback về version cũ của object.
- **Access Control List (ACL)** từng object → phân quyền chi tiết.
- **Managed replication** → S3 quảng cáo **11 nines** (99.999999999%) durability.
- **Storage tier** đa dạng (sẽ giải thích bên dưới) → tối ưu chi phí.

**Nhược điểm:**

- Object là **immutable** (bất biến) → không sửa được, chỉ replace toàn bộ.
- Không thể append vào file đã có.
- Cần dùng API đặc biệt (không dùng được như local filesystem trực tiếp).
- Throughput chậm hơn distributed FS cho big data processing (overhead của HTTP).

**Các sản phẩm phổ biến:**
- **AWS S3** (Simple Storage Service) — chuẩn de-facto của ngành.
- **Google Cloud Storage**.
- **Azure Blob Storage**.
- **MinIO** — self-hosted, S3-compatible.
- **Cloudflare R2** — không tính egress fee.

## Object Store Storage Tiers (ví dụ AWS S3)

Object store thường có nhiều **tier (cấp)** lưu trữ với mức giá và độ truy cập khác nhau. Ý tưởng: data ít truy cập → lưu ở tier rẻ hơn.

| Tier | Availability | Truy cập | Use Case | Cost |
|------|-------------|--------|----------|------|
| **Standard** | 99.99% | Thường xuyên | Production data, user content | Cao |
| **Standard-IA** (Infrequent Access) | 99.9% | Ít, có phí retrieval | Backup truy cập hàng tháng | Trung bình |
| **Glacier Instant Retrieval** | 99.9% | Milliseconds, nhưng tính phí cao mỗi lần | Archive nhưng đôi khi cần | Thấp |
| **Glacier Flexible Retrieval** | 99.99% | Vài phút đến vài giờ | Archive ít cần | Rất thấp |
| **Glacier Deep Archive** | 99.99% | 12 giờ để retrieve | Lưu trữ compliance dài hạn (luật pháp) | Cực thấp |

**Lifecycle policy** trên S3 cho phép tự động chuyển object từ tier này sang tier khác sau N ngày — ví dụ: object > 30 ngày → Standard-IA, > 180 ngày → Glacier.

## Khi nào dùng gì?

### Distributed File System

✅ **Phù hợp khi:**
- Big Data processing với Spark, Hadoop, Hive, Presto.
- Phân tích dữ liệu IoT sensor (cần block-level access).
- Xây Data Lake cho analytics nội bộ.
- Cần sửa / append file (vd: append log file).
- Cần low-latency streaming access (đọc tuần tự cực nhanh).

### Object Store

✅ **Phù hợp khi:**
- Lưu web content (image, CSS, JS) — phục vụ qua HTTP/CDN.
- Asset cho video streaming (segment HLS, DASH).
- Database backup, application backup.
- User-uploaded content (avatar, post media).
- Static website hosting (S3 + CloudFront).
- Cross-region replication cho disaster recovery.
- Lưu trữ dài hạn (Glacier tiers).

## Ví dụ Architecture: Video Streaming Platform

Một ví dụ thực tế kết hợp Object Store với CDN và các service xử lý:

```text
User upload video
    │
    ▼
API Gateway → Upload Service
                   │
                   ▼
            Raw video → S3 (Standard tier)
                                │
                                ▼
                    Transcoding Service
                    (FFmpeg: tách thành nhiều resolution:
                     1080p, 720p, 480p, định dạng HLS / DASH)
                                │
                                ▼
                    Processed segments → S3 (Standard)
                                │
                                ▼
                    CDN Edge Servers (cache toàn cầu)
                                │
                                ▼
                    User streams video (cực nhanh, gần edge)
```

**Quy trình thumbnail tương tự:**

```text
User upload photo → S3 → Image Processing Service
                              │
                              ▼
                  Resize thành nhiều kích cỡ:
                  100x100, 300x300, 1024x1024
                              │
                              ▼
                  Lưu nhiều version vào S3 (key khác nhau)
                              │
                              ▼
                  CDN phục vụ thumbnail tương ứng theo
                  thiết bị / vị trí (responsive image)
```

## Hybrid: Database + Object Store — pattern phổ biến nhất

Trong thực tế, **không lưu** binary content trực tiếp vào database — pattern chuẩn là **lưu metadata trong DB, lưu binary trong Object Store**:

```text
PostgreSQL (structured metadata):
┌─────────────────────────────────────────────────┐
│ products: {                                     │
│   id, name, price, category,                    │
│   image_url:  "s3://bucket/products/123.jpg",   │ ─┐
│   video_url:  "s3://bucket/videos/123.mp4"      │ ─┤
│ }                                               │  │
└─────────────────────────────────────────────────┘  │
                                                     │
S3 Object Store (binary content):                    │
┌─────────────────────────────────────────────────┐  │
│ products/123.jpg (binary 2MB)  ◄─────────────────┘ (image_url trỏ về)
│ videos/123.mp4   (binary 500MB) ◄────────────────  (video_url trỏ về)
└─────────────────────────────────────────────────┘
```

Lợi ích:
- DB nhỏ gọn, query nhanh.
- Binary content tận dụng được CDN.
- Có thể scale 2 phần độc lập.
- Chi phí storage tối ưu (chỉ pay cho object store ở binary lớn).

## Tóm tắt bài 5

```text
Unstructured Data Storage — 2 lựa chọn:

Distributed File System (HDFS, Ceph, Colossus):
├── API filesystem quen thuộc (open, read, write)
├── Modifiable: append, partial update
├── Tốt cho Big Data processing (Spark, Hadoop)
└── ❌ Giới hạn số file, khó expose qua web

Object Store (AWS S3, GCS, Azure Blob):
├── HTTP REST API → dễ tích hợp web/mobile
├── Unlimited objects, lên đến vài TB/object
├── Built-in versioning, replication, ACL
├── Nhiều storage tier (tối ưu chi phí)
└── ❌ Immutable: không sửa được, chỉ replace

Pattern chuẩn: Database lưu metadata + Object Store lưu binary
              + CDN phục vụ binary cho user
```

Hoàn thành Phase 5. Bạn đã nắm được toàn bộ về data storage: SQL, NoSQL, các kỹ thuật scale, CAP, và unstructured data. Phase 6 sẽ tổng hợp tất cả thành **architecture patterns** — các kiến trúc mẫu để áp dụng vào hệ thống thực tế.

---
**Bài kế tiếp**: [Phase 6 - Software Architecture Patterns](../phase-6/01-architecture-patterns-gioi-thieu.md) →
