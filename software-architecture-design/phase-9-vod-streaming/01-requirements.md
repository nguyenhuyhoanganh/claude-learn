# Bài 1: VOD Streaming — Step 1+2 (Requirements)

Bài này design **Netflix-like VOD platform**: content creators upload long videos, users stream chúng trên mọi device, mọi network condition. Khác image sharing ở quy mô file (50GB/video thay vì 5MB/image), độ phức tạp processing (transcoding, packaging, DRM), và challenge "zero buffering". Đây là case study đầu tiên 2 actor types khác nhau (creators + viewers) với SLA khác nhau.

## Vấn đề

```text
"Design a VOD streaming platform"
```

Mơ hồ. Hỏi clarifying questions chia làm 2 nhóm: creator + viewer.

## Step 1: Functional requirements

### Creator-side questions

```text
- Có sửa video sau upload không? Hay chỉ delete?
- Metadata gì cho mỗi video? (title, description, ...)
- Chỉ VOD hay cả live stream?
- Format/codec nào? (one or any?)
- Báo creator khi nào video sẵn sàng?
```

### Viewer-side questions

```text
- Attribute nào search được?
- Free hay subscribed only?
- Device support gì? (web, mobile, smart TV?)
- Action gì khác besides search + watch?
- Comments/likes/playlist?
```

### Locked scope

```text
[Creator features]
✓ Upload any video format + any codec
✓ Live streaming OUT OF SCOPE (initial)
✓ Delete uploaded video (but cannot modify content itself)
✓ Update metadata: title, description, author, tags/categories
✓ Email notification when video ready for streaming

[Viewer features]
✓ Free-text search (matches title, description, tags, author)
✓ Watch video on any device (web browser + dedicated app)
✓ Adaptive playback for varying network conditions
✓ Payment process OUT OF SCOPE (assume already-paid users)
✓ Comments / likes / playlists OUT OF SCOPE (v2)
```

→ Clear separation: creator workflow vs viewer workflow.

## Step 2: Non-functional requirements

### Creators side

```text
[Scale]
- Few thousand creators globally
- Upload frequency: max 1 video/week per creator
- Total uploads: ~few hundred per day
- Each video: 50GB average (raw, high quality)

[Availability]
- SLA 99.9% (3 nines) for creator-facing UI
- Reasoning: creators not immediate consumers, can wait

[Performance]
- Page load: P99 < 500ms
- Video processing time: < few hours acceptable
- (Not real-time — creators understand transcoding takes time)

[Consistency]
- Prioritize C over A: creator sees correct metadata or none
- Wrong metadata worse than temporary 404
```

### Viewers side

```text
[Scale]
- Hundreds of millions of users browsing + watching
- Peak concurrent streams: millions
- Each stream consumes 2-10 Mbps bandwidth

[Availability]
- SLA 99.99% (4 nines) external
- Internally strive higher
- Crash during video = ruined UX = lost subscription

[Performance]
- Search results P99 < 500ms
- Zero buffering goal — adaptive quality always
- Time-to-first-frame (TTFF) < 2s ideally

[Consistency]
- Prioritize A over C for search
- Even stale results > no results during partition
```

### Why creators ≠ viewers SLA

```text
[Different stakeholders, different needs]
Creators:
- Few, high-touch, paid for service
- Need correctness more than uptime (3 nines OK)
- Will tolerate occasional delay
- C > A acceptable

Viewers:
- Millions, paying subscribers
- Need always-on (4+ nines)
- Won't tolerate buffering
- A > C for search (slightly stale ranking OK)
```

→ Two different sub-systems can be tuned independently. Senior insight: don't apply same SLA everywhere.

## Back-of-envelope numbers

### Storage scale

```text
[Input from creators]
~1000 videos/day × 50GB raw = 50TB/day raw

[After transcoding into 5-10 quality tiers]
Each tier:
- 4K @ 60fps: 15 Mbps × 2hr = 13 GB
- 1080p @ 60fps: 8 Mbps × 2hr = 7 GB
- 720p @ 30fps: 3 Mbps × 2hr = 2.7 GB
- 480p: 1 Mbps × 2hr = 0.9 GB
- 360p: 0.5 Mbps × 2hr = 0.45 GB
Total per video: ~25-30 GB across all tiers

[After segmentation + packaging multiple protocols]
HLS + DASH + Smooth × all bitrates
×2 = ~50-60 GB per video stored

[Daily storage growth]
1000 videos × 50GB packaged = 50TB/day
× 365 days = 18 PB/year
```

### Bandwidth scale

```text
[Average viewer]
3 hours/day × 5 Mbps = 6.75 GB/day per user

[Total]
500M viewers × 6.75GB = 3.4 EB/day (!!!)
= ~310 Tbps peak bandwidth
```

→ Bandwidth dominates everything. CDN is non-negotiable.

### Concurrent streams

```text
500M users × 30% peak concurrent = 150M simultaneous streams
Each stream = open HTTP connection
= 150M concurrent connections handled
```

→ Cannot have 1 origin server. Edge servers globally required.

## Critical concepts to understand

Before architecture, must understand 4 concepts (covered detail bài 2):

### 1. Container vs Codec

```text
Container = box format: .mp4, .mkv, .webm
- Holds video stream + audio stream + subtitles + metadata
- Different containers support different codecs

Codec = encoding algorithm: H.264, H.265 (HEVC), VP9, AV1
- Compression algorithm
- Trade efficiency for compute
```

### 2. Transcoding

```text
Convert from one encoding to another:
- Input: lossless (from camera) → 50GB
- Output: lossy compressed → 1-5GB per quality tier
- CPU-intensive (1hr video → minutes-to-hours processing)
```

### 3. Adaptive Bitrate Streaming (ABR)

```text
Don't pick 1 quality up-front. Switch dynamically:

User starts watching:
  - Player downloads "manifest" (.m3u8 or .mpd)
  - Manifest lists all available quality tiers + URLs
  - Player picks medium tier, buffers 2-3 segments
  - Monitors download time per segment
  - Network slow? → switch to lower tier next segment
  - Network fast? → upgrade to higher tier

Segments are short (5-10s) so switching responsive
```

### 4. Streaming protocols

```text
- HLS (HTTP Live Streaming): Apple, ubiquitous, .m3u8 manifests
- DASH (MPEG-DASH): open standard, .mpd manifests
- Smooth Streaming: Microsoft legacy
- WebRTC: real-time, used for live (not VOD)

We must support all major protocols (different devices prefer different).
```

## Trade-offs surfaced

### Eager vs lazy transcoding

```text
[Eager — chosen]
On upload → transcode to ALL quality tiers immediately
- Pro: instant playback when user requests
- Con: wastes storage on tiers nobody watches

[Lazy]
On first request → transcode that specific tier
- Pro: only popular videos transcoded
- Con: first viewer has huge latency
- Hybrid possible: pre-transcode top 3 tiers, lazy others
```

### Single vs multi-region storage

```text
[Single]
- Origin in 1 region
- CDN handles distribution
- Storage cost minimized

[Multi-region]
- Origin replicated to 3+ regions
- Reduced CDN miss penalty
- Storage cost × 3

→ Choose multi-region for popular content tier, single for long-tail.
```

### Adaptive bitrate vs progressive

```text
[Progressive — old YouTube]
Player downloads MP4 file sequentially.
Slow network → buffering with pauses.

[ABR — modern standard]
Player downloads segments, switches quality.
Slow network → quality drops smoothly, no buffer.

→ ABR is non-negotiable for VOD at scale.
```

## DRM — Digital Rights Management

```text
[Without DRM]
- Bad actor captures video URL
- Embeds in their own site
- Pirates content

[With DRM (Widevine, FairPlay, PlayReady)]
- Video encrypted with key
- Key delivered via license server only after auth check
- License binds to device fingerprint
- Different DRM per platform (FairPlay iOS, Widevine Android/Chrome, PlayReady Edge)
```

→ Phase 9 bài 2 design will include video packaging step that applies DRM.

## Tóm tắt bài 1

- **Two actor types**: creators (few, slow, C>A) and viewers (millions, fast, A>C).
- **Functional split**: creator features (upload, edit metadata, delete, notify) vs viewer features (search, watch).
- **Storage**: 50GB/video × 1000/day → 18 PB/year. CDN required.
- **Bandwidth**: 3.4 EB/day. Without CDN: bankrupting cost.
- **Concurrency**: 150M simultaneous streams.
- 4 critical concepts: container vs codec, transcoding, ABR, streaming protocols.
- Different SLAs per audience type. Different tech choices per access pattern.
- DRM required for paid content.

**Bài kế tiếp** → [Bài 2: VOD API + Pipes-and-Filters architecture](02-pipes-filters-architecture.md)
