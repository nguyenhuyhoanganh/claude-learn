# Bài 1: Image Sharing Platform — Step 1+2 (Requirements)

Đây là case study đầu tiên: thiết kế **Instagram-like social media** cho image sharing. Phase 7 đã giới thiệu 5-step process. Bài này áp dụng **Step 1 (Functional Requirements)** và **Step 2 (Non-Functional Requirements)**. Bạn sẽ thấy cách clarify scope từ một câu nói mơ hồ "design Instagram" thành spec rõ ràng để engineer triển khai.

## Vấn đề ban đầu

```text
Client / Interviewer: "Design an image sharing social media platform"
```

Đó là tất cả. Mơ hồ. Hàng triệu cách interpret.

→ Bước đầu **không phải vẽ architecture**. Bước đầu là **hỏi clarifying questions**.

## Step 1: Functional requirements

### Clarifying questions checklist

```text
[Users]
- Info nào lưu cho mỗi user?
- Auth flow như nào?
- Profile có những field gì?

[Content]
- Chỉ image hay cả text/video/music?
- File size limit?
- Format (JPEG, PNG, HEIC)?
- Có Stories / Reels không?

[Relationships]
- Bidirectional (friend) hay unidirectional (follow)?
- Public hay private accounts?
- Block / mute có không?

[Interactions]
- Post (upload, edit, delete)?
- Search users? Search posts?
- Follow / unfollow?
- Like, comment, share?
- Notifications?
- Direct messages?

[Feed]
- Chronological hay algorithmic?
- Bao nhiêu posts hiển thị mỗi lần?
- Cache pre-computed hay query realtime?
```

### Sample answers (lock scope)

```text
[User registration]
✓ Required: first_name, last_name, email, username, password, profile_image
✓ Optional: age, location, bio (mở rộng future)

[Content]
✓ Chỉ image (initial scope)
✗ Video, text, music (future — design must allow extending without major rewrite)

[Relationships]
✓ Unidirectional follow (user A follows B → B không tự follow A back)

[Operations]
✓ Post new image
✓ Search users (by name, last name, username)
✓ View user's public info + posts
✓ Follow / unfollow
✓ View personalized timeline (latest images from users followed)

[Out of scope]
✗ Like, comment, share
✗ Direct message
✗ Notifications
✗ Stories
✗ Algorithmic ranking (chronological only for v1)
```

→ **Output Step 1**: list 5 features + list 5 out-of-scope. Scope locked.

## Vì sao step 1 critical?

```text
[Without scope lock]
- Engineer A bắt đầu code Stories
- Engineer B code DM
- Engineer C code chronological feed
- 6 tháng sau: 3 half-built features, nothing ships

[With scope lock]
- Team đồng ý 5 features
- Out-of-scope written down
- v1 ships, get feedback, then expand
```

**Quy luật**: scope creep là killer #1 của projects. Lock scope ở step 1.

## Step 2: Non-functional requirements

3 quality attributes chính (đã học phase 2):
1. **Scalability** — bao nhiêu user, data, throughput
2. **Availability** — uptime SLA
3. **Performance** — latency SLA

### NFR.1: Scalability

```text
[Numbers assume]
- Total users: 5 billion (global scale)
- Daily Active Users (DAU): 500 million
- Average image upload per user per day: 1

[Compute]
- Daily new images: 500M × 1 = 500M images/day
- Average image size: 5 MB (raw from camera)
- Daily new data: 500M × 5MB = 2.5 PB/day !!!
- After compression: ~250 TB/day

[Read load]
- Average feed loads per user per day: 20
- Daily feed requests: 500M × 20 = 10B/day
- Peak QPS: ~200K feed requests/sec
- Read:Write ratio: ~20:1 (feed reads >> uploads)
```

→ Petabyte-scale storage. Hundred-thousand QPS. Cannot run on 1 server.

### NFR.2: Availability + Fault Tolerance

```text
[SLA target]
99.99% (4 nines) = max ~52 min downtime/year

[Reasoning]
- "Just image sharing, what's the big deal if down 1 hour?"
- Wrong: ads revenue depends on users present
- Wrong: paid creators (event coverage, brands) need real-time
- Lost trust = lost users

[Implications]
- Multi-region active-active
- Database replication
- Auto-failover
- Graceful degradation (feed slow, but never down)
```

### NFR.3: Performance

```text
[Latency SLAs]
- General page load: P99 < 500ms
- Feed load (heavy — multiple images): P99 < 1000ms
- Upload completion: P99 < 2s
- Search results: P99 < 300ms

[Reasoning]
- P50 misleading: 50% users happy ≠ all users happy
- P99 = worst 1% experience
- > 500ms feels "slow" to user
- > 3s = user abandons (drops 50%+ engagement)
```

### NFR summary table

| Attribute | Target | Justification |
|---|---|---|
| Users | 5B total, 500M DAU | Global Instagram-like scale |
| Storage | 250 TB/day post-compression | Math: 500M × 0.5MB |
| Read QPS | 200K peak feed loads/sec | DAU × 20 / 86400 / peak factor |
| Write QPS | 6K image uploads/sec peak | DAU × 1 / 86400 / peak factor |
| Availability | 99.99% | Revenue + trust |
| Latency feed | P99 < 1000ms | UX threshold |
| Latency search | P99 < 300ms | Type-ahead instant feel |
| Consistency | Eventually consistent | OK 5-min feed lag |

## Trade-offs already visible

### Strong vs eventual consistency

```text
[User follow → see posts immediately?]
Option A: Strong consistency
- Follow → next feed load includes their posts instantly
- Need synchronous database update + cache invalidation
- High latency, hard to scale

Option B: Eventual consistency
- Follow → posts appear in feed within 5 min
- Asynchronous update via message broker
- Low latency, scales horizontally

→ Choose B. Acceptable UX trade-off for massive scalability gain.
```

### Compress on upload vs CDN

```text
Option A: Store raw, compress on read (in CDN)
- Pro: original quality preserved
- Con: 10x storage cost, slower read

Option B: Compress on upload, store compressed
- Pro: 10x storage savings
- Con: lose original quality
- Mitigation: store multiple resolutions

→ Choose B. Storage cost dominates at petabyte scale.
```

### SQL vs NoSQL for user data

```text
Users table:
- user_id, username, first_name, last_name, email, password_hash, profile_url
- + optional age, location, bio, interests, theme...

Option A: SQL (Postgres)
- Pro: ACID, joins, mature
- Con: schema migrations painful with optional fields growing

Option B: NoSQL document (MongoDB, DynamoDB)
- Pro: flexible schema (just add optional fields)
- Con: no joins, weaker transactions

→ Choose B for users. Flexible schema = win for evolving product.
```

## Back-of-envelope: bandwidth

```text
[Upload bandwidth]
6K uploads/sec × 5MB raw = 30 GB/sec inbound

[Read bandwidth]
200K feed loads × ~10 images/feed × 200KB/image = 400 GB/sec outbound

[Network cost AWS]
$0.09/GB outbound
400 GB/sec × 86400s × $0.09 = $3.1M/day !!!

→ CDN absolutely required. Without CDN, network cost alone bankrupts company.
```

Numbers like này drive architecture decisions ở step 5.

## Common interview mistakes

```text
❌ Skip clarifying questions
   → "I'll just design Instagram"
   → Interviewer: "Did you ask if we have video?"

❌ Numbers without back-of-envelope
   → "500M users, sounds big"
   → Interviewer: "How many storage TB/day?"

❌ Forget read:write ratio
   → Design for write-heavy when actually read-heavy
   → Cache layer missed

❌ Pick fancy tech without justify
   → "I'll use Cassandra for everything"
   → Why? Because cool ≠ because requirements drive

❌ Set SLA without context
   → "Availability 99.999%"
   → Cost 10x more. Worth it for image sharing? No.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Skip Step 1, jump to architecture | Build wrong system | 10 min clarifying always |
| Forget out-of-scope list | Scope creep | Write down explicit |
| Use percentile only P50 | Miss tail latency | P99 + P999 |
| Ignore read:write ratio | Wrong optimization | Compute both |
| No back-of-envelope numbers | Surprise at scale | Math first |
| Eventually consistent everything | UX bugs | Pick per feature |
| Strong consistency everything | Won't scale | Trade-off per feature |

## Tóm tắt bài 1

- Step 1 = **functional requirements**: clarifying questions → lock scope, include + exclude.
- Image sharing v1: register, post image, search users, follow/unfollow, view feed.
- Out-of-scope: likes, comments, DM, Stories, algorithmic feed.
- Step 2 = **non-functional requirements**: numbers drive architecture.
- NFR: 500M DAU, 250 TB/day, 200K read QPS, 99.99% availability, P99 < 1000ms feed.
- Trade-offs visible: strong vs eventual, compress when, SQL vs NoSQL.
- Back-of-envelope: bandwidth $3.1M/day without CDN → CDN required.
- Common mistakes: skip clarifying, no numbers, fancy tech without justify.

**Bài kế tiếp** → [Bài 2: API + High-Level Architecture (Step 3+4)](02-api-architecture.md)
