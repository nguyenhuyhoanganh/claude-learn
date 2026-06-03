# Bài 2: VOD Streaming — Step 3+4 (API + Pipes-and-Filters)

Phase 6 đã giới thiệu **pipes-and-filters** architecture pattern. VOD pipeline là **textbook use case**: video file flow qua chuỗi xử lý (validate → transcode → package → DRM → store), mỗi stage là filter, message broker là pipe. Bài này build full architecture, áp dụng pattern này cho video ingestion + delivery.

## Step 3: API Sequence Diagrams

### Creator flow

```text
Creator → System: POST /api/v1/auth/login
Creator → System: GET /api/v1/web/upload (upload page)

Creator → System: POST /api/v1/videos
                  body: {title, description, tags, file_size_bytes}
System → Creator: 201 Created
                  body: {video_id, upload_url (signed)}

Creator → ObjectStore: PUT <upload_url>
                       body: <50GB binary stream>
ObjectStore → System: notify "video.uploaded"

[Async processing]
Pipeline transcodes, packages, DRM-encrypts video
...

System → Creator (email): "Video 'My Vacation' is now ready!"
```

### Viewer flow

```text
Viewer → System: POST /api/v1/auth/login
Viewer → System: GET /api/v1/home (home page)

Viewer → System: GET /api/v1/search?q=vacation&cursor=X&limit=20
System → Viewer: 200 OK
                 body: {results: [{video_id, title, thumbnail_url}, ...]}

Viewer → System: GET /api/v1/videos/{video_id}/playback
                 query: device=ios, codec_support=h265
System → Viewer: 200 OK
                 body: {manifest_url: "https://cdn.example.com/.../master.m3u8",
                        license_url: "https://drm.example.com/..."}

Viewer → CDN: GET <manifest_url>
CDN → Viewer: HLS manifest (.m3u8)

Viewer → DRM: POST <license_url>
DRM → Viewer: license token

[Adaptive streaming begins]
Viewer → CDN: GET segment_0.ts
Viewer → CDN: GET segment_1.ts (decided by ABR algo based on bandwidth)
...
```

→ Notice **viewer bypasses API** for video bytes. Goes direct CDN.

## Step 4: High-level architecture

### Component map

```text
[Edge — for both creator + viewer]
- API Gateway
- Web Application Service
- CDN

[Creator path — upload + processing]
- Video Data Service + DB
- Object Store (raw + processed)
- Message Broker (Kafka)
- Transcoding Service
- Video Packaging Service
- Email Notification Service

[Viewer path — discovery + streaming]
- Search Service + DB
- DRM License Server
```

### The pipes-and-filters pipeline

```text
[Filter 1: Upload]
Creator → API Gateway → Web App Service
       → returns signed URL
Creator → Object Store: PUT raw video
                ↓
                publishes "video.raw.uploaded" event to Kafka
                {video_id, raw_url, format, codec, size}

[Filter 2: Transcoding]
Transcoding Service consumes "video.raw.uploaded"
- Probe container format (ffprobe)
- For each quality tier (240p, 480p, 720p, 1080p, 4K):
    - Transcode video stream to H.264/H.265
    - Segment into 6-second .ts chunks
    - Transcode audio stream to AAC
- Output: many .ts segments + per-tier playlist
- Store to Object Store: bucket/transcoded/{video_id}/{tier}/
                ↓
                publishes "video.transcoded" event
                {video_id, transcoded_url}

[Filter 3: Packaging + DRM]
Video Packaging Service consumes "video.transcoded"
- For each streaming protocol (HLS, DASH, Smooth):
    - Generate master manifest referencing all tiers
    - Apply DRM encryption (Widevine for Android, FairPlay for iOS, PlayReady for Edge)
    - Encrypt each segment with content key
- Store to Object Store: bucket/packaged/{video_id}/{protocol}/
                ↓
                publishes "video.packaged" event
                {video_id, manifests_urls: {hls, dash, smooth}}

[Filter 4: Metadata update]
Video Data Service consumes "video.packaged"
- Mark video as "ready"
- Store manifest URLs by protocol
- Update searchable fields

[Filter 5: Notification]
Email Notification Service ALSO consumes "video.packaged"
- Lookup creator's email from User Service
- Send "Your video is ready" email
```

### Why pipes-and-filters here?

```text
✓ Loose coupling — each filter independent, can scale separately
✓ Async — slow transcoding doesn't block fast metadata update
✓ Resilient — failure in one stage doesn't kill others (retry)
✓ Observable — events in Kafka = audit log
✓ Parallel — multiple videos processed simultaneously, different stages
✓ Extensible — add new stage (e.g. thumbnail generation) without changing others
```

## Detailed components

### API Gateway

```text
Role:
- Single entry point for both creators + viewers
- Auth + rate limit
- Route to internal services

Routes:
- /api/v1/auth/*       → Auth Service (out of scope)
- /api/v1/users/*      → User Service
- /api/v1/videos/*     → Video Data Service
- /api/v1/search/*     → Search Service
- /api/v1/web/*        → Web Application Service
```

### Web Application Service

```text
Role:
- Serve creator dashboard HTML/CSS/JS
- Serve viewer home page HTML
- Generate signed URLs for direct upload

Why signed URL critical:
[Without signed URL]
Creator → API Gateway → Web App → reads 50GB → writes to S3 → 201
- API GW + Web App each handle 50GB per upload
- Bandwidth × 2 wasted
- Memory pressure huge

[With signed URL]
Creator → API Gateway → Web App: generate signed URL (signed by service IAM)
Web App → Creator: signed_url
Creator → S3 directly: PUT 50GB (uses S3 SDK multipart upload)
- API GW only sees auth check + 200 response
- 50GB bypasses API entirely
- S3 handles multipart upload natively
```

### Video Data Service

```text
Role: source of truth for video metadata

Database: SQL (Postgres) — chosen for consistency

Schema:
videos:
  video_id              UUID PK
  creator_user_id       UUID FK
  title                 string indexed
  description           text
  tags                  text[]
  status                enum ('uploading', 'processing', 'ready', 'failed')
  raw_object_url        string
  manifest_urls         JSONB {hls: ..., dash: ..., smooth: ...}
  duration_seconds      int
  created_at            timestamptz
  ready_at              timestamptz nullable

Indexes:
- (creator_user_id, created_at DESC) — creator's videos list
- (status, created_at) — admin queries

Choice rationale:
- Schema well-defined and stable
- Creator C > A: stronger consistency natural in Postgres
- Joins useful for analytics queries later
```

### Object Store (S3)

```text
Three bucket prefixes:
1. /raw/{video_id}              — original upload (deleted after processing)
2. /transcoded/{video_id}/{tier}/  — segmented + transcoded
3. /packaged/{video_id}/{protocol}/ — DRM-encrypted final output

Lifecycle policies:
- /raw/: delete after 7 days (already transcoded)
- /transcoded/: delete after 30 days (regenerable from raw if needed)
- /packaged/: keep forever (served to users)

Storage tier:
- /packaged/{video_id}/ for top 1000 videos: Standard (hot)
- /packaged/{video_id}/ for old/cold videos: Glacier Instant Retrieval

Cost optimization saves millions.
```

### Transcoding Service

```text
Role: CPU-intensive video conversion

Tech choice:
- AWS MediaConvert (managed) — pay per minute of video
- Or custom: FFmpeg workers on GPU instances

Workflow per video:
1. Download raw from /raw/{video_id}
2. Probe with ffprobe → get duration, original codec, etc.
3. For each output tier (240p, 480p, 720p, 1080p, 4K):
     ffmpeg -i raw.mp4 \
       -c:v libx264 -preset slow -crf 23 \
       -b:v 1500k -maxrate 2000k -bufsize 3000k \
       -vf scale=1280:720 -r 30 \
       -c:a aac -b:a 128k \
       -f hls -hls_time 6 -hls_playlist_type vod \
       output_720p.m3u8
4. Upload chunks to /transcoded/{video_id}/720p/
5. Publish "video.transcoded" event

Scale: tier per video × ~5 tiers × 100 videos/hr = 500 transcoding jobs/hr
- Worker fleet auto-scales by queue depth
```

### Video Packaging Service

```text
Role: package transcoded video into streaming protocols + apply DRM

For each protocol (HLS, DASH, Smooth):
1. Generate master manifest referencing all tier playlists
2. Encrypt each segment with content encryption key
3. Generate license response template (license server uses this)

Per-protocol output:
/packaged/{video_id}/hls/master.m3u8
/packaged/{video_id}/hls/720p/playlist.m3u8
/packaged/{video_id}/hls/720p/segment_0.ts
/packaged/{video_id}/hls/720p/segment_1.ts
...

/packaged/{video_id}/dash/manifest.mpd
/packaged/{video_id}/dash/720p/init.mp4
/packaged/{video_id}/dash/720p/chunk_0.m4s
...
```

### DRM License Server

```text
Role: deliver decryption keys to authorized players

Flow:
1. Player downloads manifest, sees DRM marker
2. Player extracts content_id from manifest
3. Player POST to license_url with content_id + device fingerprint
4. License Server:
   - Verify user JWT
   - Verify user subscription active
   - Verify device limit not exceeded
   - Return license response (signed, includes key)
5. Player decrypts segments using key

Tech: AWS KMS for key management + custom license logic
```

### Search Service

```text
Role: free-text search across video metadata

Tech: Elasticsearch

Indexed fields: title, description, tags, creator_name

Sync from Video Data Service:
- "video.packaged" event also consumed by Search Service
- Update ES index with full video metadata
- A > C: search returns stale results during partition acceptable
```

### Email Notification Service

```text
Role: send email when video ready

Sub of "video.packaged"
- Lookup creator email
- Compose email with video URL
- Send via SES/SendGrid

Async, durable: if email fails, retry from event log.
```

## End-to-end architecture diagram

```text
                       [Web/Mobile/TV Apps]
                              │
                              ▼
                       [API Gateway]
                              │
        ┌───────┬─────────────┼─────────┬───────────┐
        ▼       ▼             ▼         ▼           ▼
   [Web App] [Video    [User Svc]   [Search    [DRM
              Data Svc]              Svc]     License Svc]
                │                      │
                ▼                      ▼
            [Postgres]            [Elasticsearch]
                │                      ▲
                │                      │
                └──"video.packaged"───┤
                                       │
        ┌──────────────────────────────┘
        │
[Object Store] ── publishes ── [Kafka] ──→ [Transcoding Svc]
   /raw/                          │              │
                                  │              ▼
                                  │      ┌──[Object Store]
                                  │      │  /transcoded/
                                  │      │
                                  └──"video.transcoded"
                                  │
                                  ▼
                       [Video Packaging Svc + DRM]
                                  │
                                  ▼
                          [Object Store]
                          /packaged/  ← CDN origin
                                  │
                                  ▼
                              [CDN]
                                  │
                                  ▼
                            [Viewers]
```

## API summary

```text
[Creator API]
POST /api/v1/auth/login
POST /api/v1/videos                     → returns signed upload URL
PUT  /api/v1/videos/{id}                → update metadata
DELETE /api/v1/videos/{id}              → remove
GET  /api/v1/videos/me                  → my uploaded videos

[Viewer API]
GET  /api/v1/search?q=&cursor=&limit=   → search results
GET  /api/v1/videos/{id}/playback       → returns manifest_url + license_url

[Direct]
PUT  <signed_url_to_S3>                 → upload raw video
GET  <CDN_url>/master.m3u8              → fetch manifest
GET  <CDN_url>/segment_X.ts             → fetch segments
POST <license_server_url>               → fetch DRM license
```

## Trade-offs in this architecture

### Push vs pull CDN

```text
[Pull CDN — chosen later]
CDN caches on first request, serves cached for subsequent
- Pro: simple
- Con: first viewer in region has cold cache penalty

[Push CDN — better for known content]
Video Packaging Service explicitly pushes to CDN edges
- Pro: zero cold start for viewers
- Con: storage cost × N edges, slower first-publish

→ Phase 9 bài 3 uses push for top content tier.
```

### Single bucket vs per-content-type

```text
[Single bucket]
- Easier mental model
- Lifecycle policies per prefix

[Per-content-type]
- /raw, /transcoded, /packaged as separate buckets
- Different IAM policies (raw private, packaged public read via CDN signed URLs)

→ Either works. Recommend separate for clearer IAM.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Upload 50GB through API GW | Bandwidth cost + memory pressure | Signed URL direct to S3 |
| Sync transcoding | Timeout (1hr+ jobs) | Async via message broker |
| Single quality tier | Bad UX low bandwidth | Multiple tiers + ABR |
| Custom streaming protocol | Device incompat | Standard HLS + DASH |
| No DRM | Piracy | Widevine + FairPlay + PlayReady |
| Manifest direct from origin | Latency | Cache manifest in CDN too |
| Forget probing | Wrong assumed codec | ffprobe first |
| Transcoding on app servers | CPU bottleneck | Dedicated GPU fleet or managed |

## Tóm tắt bài 2

- **Sequence diagrams** map both creator + viewer flows.
- **Pipes-and-filters pattern**: upload → transcode → package+DRM → ready.
- Pipeline async via Kafka events.
- **Signed URL** for direct upload bypasses API gateway 50GB.
- Per-service database: Postgres (Video Data), ES (Search), S3 (Object Store).
- 5 events flow: video.raw.uploaded, video.transcoded, video.packaged.
- Search + Email both subscribe to "video.packaged" (multicast).
- Manifest URLs served from API, video segments served from CDN.
- DRM key delivery via separate license server.

**Bài kế tiếp** → [Bài 3: Optimization for NFRs (Step 5)](03-optimization.md)
