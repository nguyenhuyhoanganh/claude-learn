# Bài 3: Messaging — Step 5 (Scaling stateful + optimizations)

Stateful services khác stateless ở scaling. Messaging Service giữ 100K WebSocket connections mỗi instance — không thể balance random qua LB như Web App. Bài này dạy 2 patterns: **partition by tenant** (đơn giản) và **distribute + route** (phức tạp hơn nhưng cần cho consumer apps). Plus index strategy cho catch-up latency.

## Stateful scaling challenge

```text
[Stateless service — Web App, User Service]
Easy: place behind LB, add instances, traffic balances.

[Stateful service — Messaging with WebSocket]
Hard: User A's connection lives on server-1.
User B's on server-7.
A sends to B → server-1 must route to server-7.

→ Two solutions depending on use case.
```

## Pattern 1: Partition by tenant (simpler)

Use when: chat system serves **isolated tenants** (e.g. Slack workspaces).

```text
[Workspace boundary]
Slack: Company X users can only message Company X users.
Company X and Y completely isolated.

[Routing strategy]
At connection time:
- User authenticates → workspace_id known
- Route to messaging server assigned to that workspace
- Use consistent hashing: hash(workspace_id) % num_servers

[Result]
- All users in workspace X land on same server (or small cluster)
- Server has in-memory map for ALL users in workspace
- A → B: lookup in same server, push directly (no cross-server)

[Scaling within workspace]
- Big workspace (50K users) → vertical scale that server
- Or shard within workspace (consistent hashing on user_id)
```

### Math: connection capacity

```text
[Per server limits]
- Each connection = (source IP, source port) pair
- IPv4 source IP: 32 bits
- Source port: 16 bits
- Theoretical max: 2^48 connections per server

[Realistic limits]
- File descriptors (ulimit): default 1024, can raise to millions
- Memory: each WS ~few KB → 1GB serves ~100K connections
- CPU per active message: trivial

→ Single beefy server: easily 100K-1M connections
```

→ For tenant model, 1 big server per workspace usually enough.

## Pattern 2: Distribute + route (consumer apps)

Use when: **any user can message any other user** (WhatsApp, Discord public servers).

This is the architecture from bài 2 with CMS + Kafka routing.

```text
[Connection placement]
- Connections evenly distributed across messaging servers
- Hash by user_id → server (consistent hashing)
- New server added → minimal reshuffling

[Routing problem]
- Server-1 receives msg for user B
- B is on server-7 (unknown to server-1)
- Need routing mechanism

[Solution: CMS as registry]
CMS Redis:
  online:user_B → "server-7"

Server-1 logic:
  1. Receive msg for B
  2. Lookup CMS: B → server-7
  3. Publish to Kafka topic "messages.server-7"
  4. Server-7 consumes, pushes to B's WS

[Kafka partitioning]
Topic "outgoing_messages" partitioned by destination server.
Server-N subscribes only to partition-N.
Each server processes only its own destination messages.
```

### Why Kafka not direct TCP?

```text
[Direct server-to-server TCP]
- N servers × N targets = N² mesh
- Hard to manage
- Failures cascade

[Kafka pub/sub]
- N servers all publish to 1 logical topic
- Topic partitioned by destination
- Each server consumes 1 partition
- Easy to add/remove servers (rebalance consumers)
```

## Optimization 1: Service horizontal scaling

```text
[Stateless services — easy]
- Each behind load balancer
- Auto-scale by CPU/QPS
- Min 3 instances per region for HA

[Stateful messaging service — careful]
- LB does sticky session OR
- Client knows server via DNS / discovery service
- Connection draining on shutdown (let existing finish)
- New connections route to new servers
```

## Optimization 2: Database sharding

### User Service (Postgres)

```text
Shard by user_id hash
- 10M users / 100 shards = 100K users/shard
- Each shard: primary + 2 replicas
```

### Groups & Channels Service (Postgres)

```text
Shard by group_id / channel_id hash
- Groups + group_participants on same shard (co-located)
- Cross-shard rare (only when listing user's groups)

[user_groups query]
SELECT * FROM group_participants WHERE user_id = X

Without optimization: query all shards (slow)
With co-located inverted index: separate "by_user" shard
```

### Chat History (Cassandra)

```text
Cassandra natural choice:
- Partition key: chat_id
- Clustering key: message_id DESC

All messages for a chat live together → fast "latest N messages" query

Partitioning:
- Chat with 1M messages → all in single Cassandra partition
- Cassandra handles partition splits internally
- Linear write scale (300K msg/sec achievable)
```

## Optimization 3: Indexes for catch-up latency

```text
[Catch-up flow]
User D logs in after 8hr offline.
Pull recent messages from all 50 chats D is part of.

[Without indexes]
50 chats × scan messages table for each → seconds

[With indexes]
messages:
  PRIMARY KEY ((chat_id), message_id DESC)
  
ZREVRANGE-like query per chat:
  SELECT * FROM messages 
  WHERE chat_id = X 
  ORDER BY message_id DESC 
  LIMIT 50

Cassandra: O(log N) seek + linear read = sub-ms per chat
Total: 50 × few ms = ~100-200ms for full catch-up
```

### Group participants index

```text
[Without index]
"Who's in group G?": scan entire group_participants table

[With index on (group_id)]
Fast lookup

[Also need reverse]
"What groups is user X in?": index on (user_id)

Both indexes in Postgres → maintain on insert/delete (acceptable cost).
```

### Channel subscribers index

```text
Same pattern as groups.
Channel can have 100K subscribers.
Index on (channel_id) → fast member lookup for fanout.
```

## Optimization 4: Caching

### Recent messages cache

```text
[Insight]
Last 50 messages per chat = hot data
- Frequently fetched (every user reconnect)
- Frequently appended (new messages)

[Cache layer]
Redis sorted set:
  KEY: chat:{chat_id}:recent
  VAL: sorted set of {message_id: full message JSON}
  Capped at 100 entries (LRU)

On new message:
  ZADD chat:X:recent {msg_id}: {json}
  ZREMRANGEBYRANK chat:X:recent 0 -101 (trim old)

On catch-up:
  ZREVRANGE chat:X:recent 0 49 → cached top 50
  Hit rate ~95%

Miss: fall back to Cassandra
```

### Group members cache

```text
Slot in CMS Redis:
  KEY: group:{group_id}:members
  VAL: set of user_ids

Faster than Postgres lookup during fanout.
Invalidate when membership changes.
```

## Optimization 5: High availability

### Database replication

```text
[Cassandra]
RF (replication factor) = 3
Each write goes to 3 nodes
QUORUM consistency: 2/3 acks for read+write
Tolerates 1 node failure transparently

[Postgres]
Sync replica same region (failover < 30s)
Async replica different region (DR)
```

### Multi-region

```text
[Active-active across 3 regions]
us-east, eu-west, ap-southeast

[Cross-region messaging challenge]
User A in US sends to user B in EU.
A connects to US server. B connects to EU server.
Message must cross regions.

[Solution]
- CMS replicated cross-region (Redis Enterprise)
- Kafka MirrorMaker replicates outgoing_messages topic
- Or: each region has full state, async sync

[Trade-off]
Cross-region latency: 100-200ms unavoidable
Within-region: sub-10ms
Acceptable for "instant messaging" semantic.
```

### Connection drain on deploy

```text
[Deploy new messaging service version]
- Drain: stop accepting new connections on old server
- LB removes old server from rotation
- Wait existing connections to close (max 30 min for impatient deploys)
- Or: send "reconnect" signal to clients → they reconnect to new server
- New server takes over

→ Zero downtime deploys possible for stateful service.
```

## Optimization 6: Rate limiting

```text
[Risk]
Malicious user / bot sends 1000 msg/sec → DoS

[API Gateway rate limit]
Per-user limits:
- 60 messages/min normal
- 600 messages/min for power users
- 5000 messages/min for verified bots

Burst tolerance: token bucket
Implemented at API Gateway + WS handler.
```

## Optimization 7: Channel fanout optimization

```text
[Problem]
Big channel: 100K subscribers, 10 msg/sec
Each message → 100K push operations
1 message takes 1M operations (with retry).
Hot keys, hot servers.

[Solution: tiered fanout]
1. Channel message arrives
2. Split into batches: 100 batches × 1000 subscribers
3. Publish 100 jobs to Kafka
4. 100 workers consume in parallel
5. Each worker does 1000 fanout operations

[Result]
Wall clock: ~10ms instead of 10s
Spreads load across cluster.
```

### Celebrity / large channel pattern

```text
[Mirror of Instagram celebrity problem]
1M-subscriber channel posts → 1M push needed

[Approach 1: Fan-out (chosen for moderate scale)]
As above, parallel batches

[Approach 2: Pull on read]
Channel messages stored centrally.
Subscribers pull periodically OR get notification.
Trade: latency higher but no fanout cost.

[Hybrid for ultra-large]
Push to "active subscribers" (recently online)
Long-tail pulls on next login
```

## Final architecture

```text
              [Client apps]
                │           │
       HTTP REST│           │WebSocket
                ▼           ▼
        [API Gateway]   [WS Load Balancer]
                │           │
                ▼           ▼ Routes by user_id hash
   ┌────┬────┬─┴─┬─────┐   ▼
   ▼    ▼    ▼   ▼     ▼ [Messaging Service x N instances]
[User][Grp][Hist][Web]      │ (stateful, ~100K conn each)
   │    │    │             │ ack to user
   ▼    ▼    ▼             ▼
[PG  [PG  [Cass]      [Kafka incoming_messages]
shard sharded]              │
 ed]                        ▼
                    [Message Processor workers]
                            │
              ┌─────────────┼────────────┐
              ▼             ▼            ▼
        [Cass write]  [PG read]    [Redis CMS]
                            │
                            ▼
                   [Kafka outgoing_messages]
                   (partitioned by target server)
                            │
                            ▼
                    [Messaging Service]
                            │
                            ▼
                    [Push to user WS]
```

## NFR verification

| Requirement | Solution | Status |
|---|---|---|
| 100M DAU, 50M concurrent | 500+ msg svr instances + CMS routing | ✓ |
| 300K msg/sec peak | Kafka + Cassandra writes | ✓ |
| 99.99% availability | Multi-region + replication | ✓ |
| P99 < 1s online delivery | In-mem ack + async processing | ✓ |
| P99 < 2s offline catch-up | Indexed Cassandra + recent cache | ✓ |
| Channel 100K members | Batched parallel fanout | ✓ |
| Persistent history | Cassandra durability | ✓ |
| Online status accuracy | CMS TTL + heartbeat | ✓ |

## Lessons from messaging design

```text
1. P2P doesn't work for group/channel at scale → centralized
2. WebSocket > polling for push-heavy systems
3. Stateful services need explicit routing strategy
4. Tenant partitioning simplifies if tenants isolated
5. CMS registry for global user → server lookup
6. Kafka partitioning enables cross-server routing
7. Per-chat ordering OK; global ordering not needed
8. Cassandra time-series ideal for messages
9. Catch-up latency = index design problem
10. Channel fanout = batched parallel work
```

## Bẫy thường gặp khi optimize

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Round-robin LB stateful svc | Cross-server every msg | Hash routing |
| No connection drain on deploy | Mass disconnect | Drain + reconnect signal |
| CMS no TTL | Phantom online users | TTL + heartbeat |
| Single Kafka partition | Cannot parallel fanout | Partition by target |
| Sync DB write before ack | Latency hit | Async pipeline |
| Index missing on group_id | Slow fanout member lookup | Index always |
| No rate limit | DoS open door | Token bucket per user |
| Channel fanout serial | Tail latency | Batched parallel |
| Same shard strategy mọi DB | Wrong access pattern | Per-table tuning |

## Tóm tắt bài 3

- **Stateful service** scaling: tenant partition (Slack-like) or distribute+route (WhatsApp-like).
- **CMS Redis**: user_id → server registry with TTL heartbeat.
- **Kafka outgoing_messages** partitioned by destination server.
- **Cassandra chat history**: partition by chat_id, query top-N latest by message_id.
- **Indexes critical** for: catch-up latency, group member lookup, channel subscribers.
- **Recent messages cache** (Redis sorted set): 95% hit rate, sub-ms.
- **Channel fanout**: batched parallel for 100K-member channels.
- **Connection drain** on deploy = zero downtime stateful.
- Rate limiting at API GW + WS handler.

🎉 **Phase 10 complete** — WhatsApp/Slack-scale real-time messaging. Phase 11 vào typeahead autocomplete với latency budgets cực ngắn (< 50ms target).

**Bài kế tiếp** → [Phase 11 - Bài 1: Typeahead Autocomplete Requirements](../phase-11-typeahead/01-requirements.md)
