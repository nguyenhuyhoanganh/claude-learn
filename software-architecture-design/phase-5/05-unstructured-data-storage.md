# Bài 5: Unstructured Data Storage

## Unstructured Data là gì?

> **Unstructured Data** = Data không theo schema hoặc model cụ thể — thường là **binary blobs** (BLOB - Binary Large Object).

**Ví dụ:**
- Video files (.mp4, .mkv)
- Images (.jpg, .png)
- Audio files (.mp3, .wav)
- PDF documents
- Raw logs
- Database backups

**Vấn đề khi lưu vào traditional databases:**
- Size limits nghiêm ngặt (thường MBs)
- Performance và scalability kém với large binary objects
- Databases không được tối ưu cho loại data này

## Use Cases phổ biến

| Use Case | Ví dụ |
|----------|-------|
| **User uploads** | Photos, videos lên social media |
| **Database backup/archiving** | Periodic snapshots cho disaster recovery |
| **Web hosting** | Images, JS, CSS cho website |
| **Big Data & ML** | Training datasets, IoT sensor data |

**Đặc điểm chung:** Data volumes rất lớn (TBs → PBs), objects lớn (GBs mỗi file).

## Hai giải pháp

### 1. Distributed File System

> Cùng abstraction như local file system nhưng data phân tán trên nhiều storage nodes.

```
Files organized trong folders/directories:
/videos/2024/01/
    ├── user123_upload.mp4
    ├── user456_upload.mp4
    └── ...
/images/
    ├── profile/
    └── posts/
```

**Ưu điểm:**
- Familiar API (same as local filesystem)
- Có thể **modify files** (append, partial update)
- Performance cho Big Data processing (Hadoop, Spark chạy trực tiếp trên HDFS)
- Replication, consistency guarantees tùy loại

**Nhược điểm:**
- Giới hạn số lượng files (inodes)
- Khó expose qua web API
- Phải build thêm abstraction cho external access

**Popular:** HDFS (Hadoop), GlusterFS, Ceph, Google Colossus

### 2. Object Store

> Storage service thiết kế cho **unstructured data ở internet scale**.

**Cấu trúc:**
```
Bucket (Container)
├── Object 1: {name: "video.mp4", value: binary, metadata: {size, type, ...}}
├── Object 2: {name: "profile.jpg", value: binary, metadata: {ACL, ...}}
└── Object 3: {name: "backup_2024-01.sql", value: binary}

(Flat structure — không có folders thực sự, dùng prefix để simulate)
```

**Ưu điểm:**
- **HTTP REST API** → dễ integrate với web apps
- Virtually **unlimited objects** và sizes (đến TB/object)
- **Built-in versioning** → dễ rollback
- **Access Control Lists** mỗi object
- **Managed replication** → high durability (11 nines!)

**Nhược điểm:**
- Objects **immutable** → không modify, chỉ replace
- Không append vào file
- Cần special API (không dùng như local filesystem)
- Slower throughput so với distributed filesystem cho big data processing

**Popular:** AWS S3, Google Cloud Storage, Azure Blob, MinIO (self-hosted)

## Object Store Storage Tiers (AWS S3 example)

| Tier | Availability | Access | Use Case | Cost |
|------|-------------|--------|----------|------|
| **Standard** | 99.99% | Frequent | Production data, user content | Cao |
| **Standard-IA** | 99.9% | Infrequent | Backups accessed monthly | Medium |
| **Glacier Instant** | 99.9% | Milliseconds | Archives, rarely accessed | Thấp |
| **Glacier Deep Archive** | 99.99% | 12 hours | Long-term compliance | Rất thấp |

## Khi nào dùng gì?

### Distributed File System

✅ Best for:
- Big Data processing (Spark, Hadoop workloads)
- IoT sensor data analysis
- Data lakes
- Khi cần modify/append files
- Khi cần low-latency streaming access

### Object Store

✅ Best for:
- Web content (images, CSS, JS) → HTTP API
- Video streaming assets
- Database backups
- User-uploaded content
- Static website hosting
- Cross-region replication
- Long-term archiving

## Ví dụ Architecture: Video Streaming Platform

```
User uploads video
    ↓
API Gateway → Upload Service
                   ↓
              Raw video → S3 (Standard tier)
                               ↓
                      Transcoding Service
                      (FFmpeg: HLS 1080p, 720p, 480p)
                               ↓
                      Processed segments → S3 (Standard)
                               ↓
                      CDN Edge Servers (globally cached)
                               ↓
                      User streams video (fast!)
```

**Thumbnail storage:**
```
User uploads photo → S3 → Image Processing Service
                               ↓
                       Resize (100x100, 300x300, 1024x1024)
                               ↓
                       Multiple sizes → S3
                               ↓
                       CDN serves thumbnails
```

## Hybrid: Database + Object Store

```
PostgreSQL (structured metadata):
products: {id, name, price, category, image_url, video_url}
                                              ↓
                                    image_url → S3 Object
                                    video_url → S3 Object

→ DB lưu metadata + reference
→ Object Store lưu binary content
```

## Tóm tắt

```
Unstructured Data Storage:

Distributed File System:
├── Familiar filesystem API
├── Good for Big Data processing
└── Limited number of files

Object Store (AWS S3, GCS):
├── HTTP REST API
├── Unlimited objects, up to TBs each
├── Built-in versioning, replication, ACL
├── Multiple storage tiers (cost optimization)
└── Best for web content, backups, user uploads

Key difference: File System → mutable; Object Store → immutable
```

---
**Tiếp theo:** Phase 6 - Software Architecture Patterns →
