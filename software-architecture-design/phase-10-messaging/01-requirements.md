# Bài 1: Real-Time Messaging — Step 1+2 (Requirements)

WhatsApp/Slack/Discord type platform: millions of users connected liên tục, message delivered millisecond-scale. Đây là case study đầu tiên có **bi-directional communication** challenge — server cần push xuống client, không phải chỉ respond request. Bài này lock scope (1-1, group, channel), set numbers (hundreds of thousands msg/sec), và introduce critical design decision sẽ shape entire architecture.

## Vấn đề

```text
"Design a real-time instant messaging platform"
```

Hỏi clarifying questions ngay.

## Step 1: Functional requirements

### Clarifying questions

```text
[Communication types]
- 1-1 direct message only? Or also group? Channel?
- Public channel (anyone join) vs private (invite only)?

[Media]
- Text only? Or also images, voice, video?
- Voice/video calls?
- File attachments?

[Persistence]
- Chat history saved? How long?
- Offline user catches up when reconnects?

[Status]
- Online/offline indicator?
- "Last seen"?
- "User is typing..."?
- Read receipts (blue ticks)?
- Edit/delete messages?

[Notifications]
- Push notification when offline?
- Mention/reply notifications?
```

### Locked scope

```text
[3 communication types]
✓ 1-1 direct messaging
✓ Group messaging (small group of specific users)
✓ Channel (named topic, anyone can join via URL)

[Media]
✓ Text only (10K char limit per message)
✗ Image, voice, video, file attachments (v2)
✗ Voice/video calls (v2)

[Persistence]
✓ All messages stored
✓ Offline users get history on reconnect

[Status]
✓ Online/offline visible
✗ Typing indicator (v2)
✗ Read receipts (v2)
✗ Edit/delete messages (v2)
✗ "Last seen" (v2)
```

→ Focus on **core message delivery**. Bells & whistles later.

### Why this scope?

```text
[Core problem to solve well first]
- Real-time delivery to online users (1ms-100ms range)
- Offline catch-up (sync 1000 missed messages quickly)
- Scaling group/channel fan-out

If we get core right, adding features later is straightforward.
If we mix in features (typing, read receipt) → distracts from core scalability.
```

## Step 2: Non-functional requirements

### Scalability

```text
[Users]
- 100M+ DAU
- 6-12 hours daily connection per user
- → many concurrent connections always open

[Throughput]
- Average 100 messages/user/day
- 100M × 100 = 10B messages/day
- Peak QPS: ~300K messages/sec
- (Peak factor 3x above average)

[Group size]
- 1-1: 2 participants
- Group: up to 1000
- Channel: hundreds of thousands

[Concurrent connections]
- ~50% of DAU connected at any time
- = 50M+ persistent connections
- Cannot fit on single server
```

### Availability

```text
[Target]
99.99% (4 nines) for paying customers
- ~52 min downtime/year acceptable
- Higher tier might guarantee 99.999%

[Why high]
- Business communication critical
- Many companies depend on Slack-like tool
- Outage = lost productivity at customer companies
- Their loss = our churn risk
```

### Performance

```text
[Latency targets]
- Online → online message delivery: P99 < 1s
- Offline user login + catch-up: P99 < 2s

[Why looser than web?]
- User B doesn't know A sent a message
- B continues working until notification arrives
- 100ms or 800ms barely perceptible to humans
- vs web page load: user actively waiting, every ms feels long

[But also not too loose]
- Real-time = under 1 second
- Else "instant" is misnomer
```

### Numbers driving architecture

| Metric | Value | Architecture implication |
|---|---|---|
| Concurrent connections | 50M+ | Cannot HTTP polling, need bi-directional protocol |
| Messages/sec peak | 300K | Sharded message handling |
| Channel size | 100K members | Fanout strategy critical (push vs pull) |
| Connection duration | 6-12hr | Stateful server resources matter |
| Offline catch-up | < 2s for thousands of msgs | Indexed history queries |

## Critical design decision: Centralized vs Peer-to-Peer?

This is **biggest architecture decision** that shapes everything.

### Option A: Peer-to-Peer (P2P)

```text
[Flow]
User A → System: "I want to chat with B, where is B?"
System → User A: "B is at IP 1.2.3.4"
User A → User B: direct connection, exchange messages
(System out of loop)

[Pros]
✓ System doesn't proxy every message → infinite scale
✓ Low latency (A and B local network → ms)
✓ Privacy: system doesn't see message content (E2E natural)

[Cons]
✗ Group/channel fanout impossible on mobile
  - 1000-member channel = 1000 connections from one phone
  - Battery dies in minutes
  - Mobile CPU can't keep up
✗ Offline storage impossible
  - If B offline when A sends, message lost
  - We need server to store
✗ NAT traversal hell (mobile networks)
✗ Can't moderate/audit content
```

### Option B: Centralized (chosen)

```text
[Flow]
User A → System: "Send message to user B / group G / channel C"
System: stores message
System: looks up online recipients
System: pushes to online recipients via persistent connection

[Pros]
✓ Server fanout to 100K channel members efficient
✓ Offline storage natural
✓ Mobile battery friendly
✓ Audit, moderation, search possible

[Cons]
✗ Server bandwidth + compute scales with traffic
✗ Latency includes server hop
✗ Higher infra cost
```

→ Choose centralized. Group + channel + offline make P2P impractical.

### Decision matrix

| Use case | P2P winner | Centralized winner |
|---|---|---|
| 1-1 only, both online | ✓ | |
| Group of 1000 | | ✓ |
| Channel of 100K | | ✓ |
| Offline user | | ✓ |
| Mobile primary | | ✓ |
| Need moderation | | ✓ |

**WhatsApp / Slack / Discord all chose centralized**. Reason above.

## Critical design decision: HTTP polling vs Bi-directional?

If centralized, how does server push to client?

### Option A: HTTP polling (naive)

```text
Client every 200ms: GET /api/messages?since=last_seen
Server: returns new messages

[Problems at scale]
- 50M clients × 5 requests/sec = 250M req/sec
- 99% return empty (no new messages)
- Massive waste of CPU + bandwidth
- Latency ≥ 200ms always (poll interval)

→ Doesn't scale.
```

### Option B: Long polling

```text
Client: GET /api/messages?since=X (server holds open if no msg)
Server: holds connection up to 30s waiting
Server: returns immediately when new message OR 30s timeout

[Better but still problems]
- Connection re-established every 30s
- TCP/TLS handshake overhead
- Server timer management
```

### Option C: Bi-directional protocol (chosen)

```text
Use WebSocket / gRPC streams / TCP

[Properties]
- Client initiates connection (firewall friendly)
- Once open, both client and server can push
- Idle connections cost ~little (TCP keepalive)
- Sub-millisecond latency once connected

[Tech choices]
- WebSocket: web standard, ubiquitous
- gRPC streams: better for microservice internal
- MQTT: IoT origin, very lightweight (Facebook Messenger uses)
- XMPP: legacy chat protocol, mature

Choose WebSocket for cross-platform (web + mobile).
```

### Why WebSocket scales

```text
[Idle connection cost]
- TCP socket: ~few KB kernel memory
- No CPU when idle
- Server can hold 100K+ connections per machine

[Active sending cost]
- Just send bytes on existing socket
- No TLS handshake
- No HTTP headers overhead per message
- Sub-ms latency

[Channel of 1M idle users]
- 1M open WebSockets across 10 messaging servers
- Total memory: ~10GB
- CPU: 0% when idle
- Manageable!
```

## Trade-offs preview

### Strong vs eventual consistency

```text
[Message delivery order]
- User expectation: messages appear in order sent
- Within 1-1: easy (single chat history)
- Within group: messages from different senders may arrive in different order on different recipients
- Acceptable: minor reordering OK

→ Eventually consistent. Don't require strict global ordering.
```

### Sync vs async DB write

```text
[Sync write before delivery]
Receive msg → write to DB → fan out to online users
- Pro: durability guaranteed
- Con: latency includes DB write

[Async write]
Receive msg → fan out immediately → DB write async
- Pro: lower delivery latency
- Con: small risk of msg loss on crash before DB write

→ Choose hybrid: write to in-memory queue sync (fast),
  flush to DB async (durable enough).
```

### Push vs pull for offline catch-up

```text
[Push approach]
Server notifies offline user app via APNs/FCM
App opens, pulls missed messages

[Pull approach (chosen)]
User app comes online → asks server "what did I miss?"
Server returns recent messages from history

→ Pull simpler. Push notifications used for OS-level wake.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| P2P for everything | Mobile battery death, no group/channel | Centralized |
| HTTP polling | Server CPU melts | WebSocket |
| Sync DB write on hot path | Latency budget blown | In-mem queue + async flush |
| Single instance handles all connections | Doesn't scale | Partition (next bài) |
| Strong global ordering | Performance impossible | Per-chat ordering only |
| Forget mobile network unreliability | Connection drops, msg loss | Idempotent message IDs + retry |
| Mix features in v1 | Scope creep | Lock core first |

## Tóm tắt bài 1

- Scope locked: 1-1 + group + channel, text only, no media, no typing/edit/delete v1.
- Scale: 100M+ DAU, 50M+ concurrent connections, 300K msg/sec peak.
- SLA: 99.99% availability, P99 < 1s online delivery, < 2s offline catch-up.
- **Critical decision 1**: Centralized > P2P (group + channel + offline force it).
- **Critical decision 2**: WebSocket > HTTP polling (50M idle connections cheap, push native).
- These 2 decisions shape entire architecture.
- Eventually consistent ordering, hybrid sync/async DB write.

**Bài kế tiếp** → [Bài 2: Architecture with Bi-Directional Connections](02-architecture.md)
