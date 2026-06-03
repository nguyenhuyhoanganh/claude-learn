# Bài 2: Real-Time Messaging — Step 3+4 (API + Architecture)

Bài 1 đã lock 2 decision: **centralized + WebSocket**. Bài này build full architecture. Key insight: **messaging service stateful** (giữ open connections), khác mọi service trước (stateless). Sequence diagram và service boundaries phản ánh điều này.

## Step 3: Sequence diagrams

### Flow 1: Sign up + login

```text
User A → System: POST /api/v1/auth/signup
                 {name, email, password, username, profile_image_url}
System → User A: 201 {user_id, auth_token}

[Mobile app]
User → System: POST /api/v1/auth/login
              {username, password}
System → User: 200 {user_id, auth_token}
```

### Flow 2: Open WebSocket connection (online status)

```text
User A → System: WS Upgrade GET wss://ws.example.com/connect
                  Authorization: Bearer <token>
System: validates token, accepts WebSocket upgrade
System: records User A is "online" + connected to server-X
User A ↔ System: persistent WebSocket connection

[User A now considered online by system]
```

### Flow 3: Send direct message

```text
User A → System (via WS): {type: "send", target_user_id: B, text: "hi"}

System:
  1. Look up: is there existing chat between A and B? If no, create one (chat_id)
  2. Persist message to chat history
  3. Lookup: is B online? If yes, which server?
  4. Forward message to B's server
  5. B's server pushes message via B's WebSocket

System (via WS) → User B: {type: "message", chat_id, sender_id: A, text: "hi", ts}
```

### Flow 4: Create group + send message

```text
User A → System: POST /api/v1/groups
                 {participants: [A, B, C, D]}
System → User A: 201 {group_id}

User A → System (WS): {type: "send", group_id, text: "hi all"}

System:
  1. Lookup group_id → participants [A, B, C, D]
  2. Persist message
  3. For each participant (except sender):
     - Lookup online status + server
     - Push to that server's WS connection

System (WS) → User B: {type: "message", group_id, sender_id: A, text: "hi all"}
System (WS) → User C: ditto
System (WS) → User D: ditto (if online)
(D offline → stored, delivered on next login)
```

### Flow 5: Create channel

```text
User A → System: POST /api/v1/channels
                 {name: "go-discuss", description: "Golang chat"}
System → User A: 201 {channel_id, invite_url: "https://app.com/join/abc123"}

[User shares URL externally]

User E → System: POST /api/v1/channels/join {invite_url: "..."}
System: adds E to channel subscribers
System → User E: 200 {channel_id}

User E → System (WS): {type: "send", channel_id, text: "hi golangers"}
System: fanout to ALL channel subscribers (could be 100K)
```

### Flow 6: Offline catch-up

```text
User D opens app after being offline:
User D → System: GET /api/v1/home
                 Authorization: Bearer <token>
System:
  1. Lookup D's groups + channels D subscribes to
  2. For each: fetch latest 50 unread messages
System → User D: 200 {chats: [...], unread_count}

User D → System: WS Upgrade GET wss://...
[Connection established. D goes back online for real-time.]
```

## Step 4: Architecture components

### Component overview

```text
[Edge layer]
- API Gateway
- Web Application Service
- Load Balancer (separate for WS vs HTTP)

[Stateless services (easy to scale)]
- User Service
- Groups & Channels Service
- Chat History Service

[Stateful service (harder)]
- Messaging Service (WebSocket handler)
- Connection Management Service (registry)

[Storage]
- User DB
- Groups/Channels DB
- Chat History DB
- Object Store (profile images)
- In-memory KV (online status, connection routing)

[Async pipeline]
- Message Broker
```

### Component 1: API Gateway

```text
Role: edge for HTTP REST APIs

Routes:
- /api/v1/auth/*       → User Service
- /api/v1/users/*      → User Service
- /api/v1/groups/*     → Groups & Channels Service
- /api/v1/channels/*   → Groups & Channels Service
- /api/v1/home         → Aggregator (combines multiple service calls)
- /api/v1/messages/*   → Chat History Service (for fetch history)

Features:
- Auth (verify JWT)
- Rate limiting (prevent abuse)
- CORS

NOT for WebSocket — WS has separate path through dedicated LB.
```

### Component 2: Messaging Service (THE stateful one)

```text
Role: handle WebSocket connections, push messages

Each instance:
- Accepts WebSocket upgrades
- Maintains in-memory map: user_id → WebSocket connection
- Receives outgoing messages from broker → pushes via WS

Scale: 1 instance = ~100K concurrent connections (depends on tuning)
At 50M concurrent users → need 500+ instances

Key challenge: SHARDING/ROUTING
- User A on server-1 sends to B
- B is on server-7
- Server-1 must route to server-7

→ Solution discussed below (Connection Management Service)
```

### Component 3: Connection Management Service (CMS)

```text
Role: track which user is on which server

Storage: Redis (in-memory KV)
Schema:
  KEY: online:{user_id}
  VAL: {server_addr, connection_id, last_heartbeat}
  TTL: 60s (refreshed by heartbeat)

Operations:
- User connects: CMS records mapping
- User disconnects: CMS removes mapping
- TTL expiry: mapping auto-cleaned if heartbeat misses

Queries (used by other services):
- "Is user X online?"
- "What server is user X on?"
- "Are these 1000 users online? (batch check)"
```

### Component 4: User Service

```text
Role: user CRUD, auth

DB: SQL (Postgres) or NoSQL
Schema:
  users:
    user_id, username (indexed unique), email, password_hash,
    name, profile_image_url, created_at

Indexes:
- username (for login + lookup)
- email (for password reset)
```

### Component 5: Groups & Channels Service

```text
Role: manage group + channel membership

DB: SQL
Schema:
  groups:
    group_id, created_at, created_by

  group_participants:    (many-to-many)
    user_id (idx), group_id (idx), joined_at

  channels:
    channel_id, name, owner_user_id, invite_url, created_at

  channel_subscribers:   (many-to-many)
    user_id (idx), channel_id (idx), subscribed_at

Indexes:
- (user_id, group_id) compound — "user's groups"
- (group_id, user_id) compound — "group members"
- Same for channels

Note: 1-1 chat = group with 2 members. Reuse group infra.
```

### Component 6: Chat History Service

```text
Role: store all messages

DB: NoSQL wide-column (Cassandra) ideal for time-series writes
   OR sharded Postgres if simpler

Schema:
  messages:
    message_id    (monotonic Snowflake-like ID)
    chat_id       (= group_id or channel_id)
    sender_id
    text
    timestamp_ms (server-assigned)

Indexes:
- (chat_id, message_id DESC) compound — "latest messages in this chat"

Why Cassandra:
- Write-optimized (300K msg/sec)
- Time-series natural fit (partition by chat_id, cluster by ts)
- Linear scaling
- Eventually consistent OK for messages
```

### Component 7: Message Broker

```text
Role: decouple Messaging Service from background processing

Tech: Kafka

Topics:
- incoming_messages: messages sent by users, need processing
- outgoing_messages: ready-to-deliver to users (per-server fanout)

Why:
- Smoothing traffic spikes
- Async durability writes
- Cross-server message routing
```

## How send message works end-to-end

```text
[User A on server-1 sends to group G (members: A, B, C)]

1. User A → server-1 (via WS):
   {type: "send", group_id: G, text: "hi"}

2. Server-1 receives, validates, assigns message_id
3. Server-1 publishes to Kafka topic "incoming_messages":
   {message_id, group_id: G, sender_id: A, text: "hi", ts}

4. Server-1 acks User A: {type: "ack", message_id, status: "received"}
   (Sub-50ms — user happy)

5. [Async] Background consumer reads incoming_messages:
   a. Write to Chat History (durable)
   b. Query Groups & Channels Service: "who's in G?" → [A, B, C]
   c. Query CMS: "are A, B, C online? what server?"
      → A: server-1 (skip self), B: server-7, C: offline
   d. Publish to outgoing_messages topic, partitioned by server:
      {target_user: B, server: server-7, payload: {...}}

6. Server-7 subscribes to outgoing_messages for its partition
7. Server-7 receives: target B on this server
8. Server-7 looks up B's WS connection (in-memory map)
9. Server-7 pushes: User B receives message via WS

10. User C is offline → message stored in history, fetched on reconnect
```

## Why this design works

```text
✓ User-facing latency: only 1 hop (user → server → ack)
✓ Async processing doesn't block user
✓ Cross-server routing via Kafka topic partitioning
✓ Stateless background workers (scale freely)
✓ Connection state isolated to messaging service
✓ CMS as single source of truth for online status
```

## Edge case: Same user multiple devices

```text
User A on phone AND laptop:
- Each opens own WebSocket
- CMS records: online:A → [server-1/conn-X, server-3/conn-Y]
- Both connections receive same messages

Implementation: CMS value is set/list, not single entry.
```

## Edge case: User reconnects while pending message

```text
Server-7 receives "deliver to B", but B's WS just closed:
- Server-7 detects: B not in local map
- Server-7 publishes to "missed_messages" queue OR
  Server-7 doesn't ack; Kafka retries later

Better: persist delivery state per recipient.
On next CMS heartbeat, if B online elsewhere, re-deliver.
```

## Architecture diagram

```text
            [Client web/mobile apps]
                  │
        ┌─────────┴─────────┐
        │                   │
        ▼ HTTP REST         ▼ WebSocket
   [API Gateway]      [WS Load Balancer]
        │                   │
   ┌────┴────┬────┬────┐    │
   ▼         ▼    ▼    ▼    ▼
[User]  [Groups [Chat [Web]  [Messaging Service fleet]
[Svc]    Svc]  Hist]                │
   │       │     │                  │ 1. Publish incoming
   │       │     │                  ▼
   │       │     │            [Kafka incoming_messages]
   │       │     │                  │
   │       │     │                  ▼ 2. Process
   │       │     │            [Message Processor workers]
   │       │     │                  │
   │       │     │      ┌───────────┼───────────┐
   │       │     │      ▼           ▼           ▼
   │       │     │  3a. Write   3b. Lookup  3c. Lookup
   │       │     │              members    online users
   │       │     │      │           │           │
   │       │     ▼      ▼           ▼           ▼
   │       │  [Cassandra  ]    [Postgres]  [Redis CMS]
   │       ▼
   ▼   [Postgres]
[Postgres + S3]                          ┌── 4. Publish
                                         ▼   outgoing
                                  [Kafka outgoing_messages]
                                         │ (partitioned by server)
                                         ▼ 5. Each msg svr
                                  [Messaging Service]
                                         │
                                         ▼ 6. Push via WS
                                    [Online users]
```

## API summary

```text
[HTTP REST — via API Gateway]
POST /api/v1/auth/signup
POST /api/v1/auth/login
GET  /api/v1/users/search?q=&limit=
GET  /api/v1/users/{user_id}/profile     → includes online status

POST /api/v1/groups
GET  /api/v1/groups/me                   → my groups
POST /api/v1/channels
POST /api/v1/channels/join
GET  /api/v1/channels/me                 → my channels

GET  /api/v1/home                        → all chats + recent msg per chat
GET  /api/v1/chats/{chat_id}/messages?cursor=&limit=  → history

[WebSocket — via WS LB]
GET  wss://ws.example.com/connect (Authorization: Bearer)

Messages over WS (JSON):
- {type: "send", target_user_id|group_id|channel_id, text}
- {type: "ack", message_id, status}
- {type: "message", chat_id, sender_id, text, ts}
- {type: "presence", user_id, online: bool}
- {type: "heartbeat"}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Single stateful service no sharding | Doesn't scale beyond 1 server | CMS + routing |
| Tight coupling msg svc ↔ DB | Slow user-facing latency | Async via Kafka |
| No heartbeat | Phantom online users | TTL + heartbeat in CMS |
| Forget multi-device | Only 1 device gets msg | List in CMS, not single value |
| Send to channel = N-way fan-out blocking | Channel msg lag | Async fan-out via Kafka partitioning |
| 1-1 different code path than group | Code complexity | Treat 1-1 as 2-member group |
| Synchronous history write before ack | High delivery latency | Hybrid: in-mem queue + async DB |

## Tóm tắt bài 2

- Sequence diagrams identify 6 API flows: signup, connect, send 1-1, send group, channel create, offline catch-up.
- **2 LB**: HTTP (REST) and WebSocket (separate due to long-lived connections).
- **Messaging Service is stateful** — holds WS connections.
- **Connection Management Service (Redis)** maps user_id → server.
- **Kafka 2 topics**: incoming_messages (smoothing), outgoing_messages (partitioned by server for routing).
- **1-1 = 2-member group**: code reuse.
- Cassandra for chat history (write-optimized time-series).
- User-facing latency: 1 hop ack. Async pipeline for processing.

**Bài kế tiếp** → [Bài 3: Scaling stateful services + optimization](03-optimization.md)
