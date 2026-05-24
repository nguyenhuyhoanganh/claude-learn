# Bài 4: SCRIPT LOAD + EVALSHA — caching và performance

`EVAL <script>` gửi full source mỗi lần — wasteful nếu cùng script chạy 1000 lần/s. **SCRIPT LOAD + EVALSHA** cache script trên server, chỉ gửi SHA1 hash. Bài này về caching pattern, retry on miss, deployment workflow.

## EVAL — naive approach

```text
EVAL "return redis.call('GET', KEYS[1])" 1 mykey
```

- Mỗi request: client gửi **full script source** + KEYS + ARGS.
- Script 500 byte × 1k req/s = 500 KB/s bandwidth.
- Server parse script mỗi lần (cached internally sau lần đầu, nhưng vẫn overhead).

OK cho **prototyping**. Production cần better.

## SCRIPT LOAD

```text
SCRIPT LOAD "return redis.call('GET', KEYS[1])"
"f72adc1bbbe2e85049e10dab69e8f4c4ce97c4d7"
```

Server:
1. Parse script.
2. Tính SHA1 hash của source.
3. Lưu script vào script cache (trong memory).
4. Return SHA1 hash.

SHA1 hash là **identifier ổn định** — cùng source → cùng hash.

## EVALSHA

```text
EVALSHA f72adc1bbbe2e85049e10dab69e8f4c4ce97c4d7 1 mykey
"value"
```

- Client gửi SHA1 (40 bytes hex) + KEYS + ARGS.
- Server lookup script trong cache (O(1)).
- Execute.

So EVAL: bandwidth giảm ~10-100x cho big script.

## Pattern: load on app startup

```ts
// app initialization
const VIEW_SCRIPT = `
local isNew = redis.call('SADD', KEYS[1], ARGV[1])
if isNew == 1 then
  redis.call('HINCRBY', KEYS[2], 'views', 1)
  redis.call('ZINCRBY', KEYS[3], 1, ARGV[2])
end
return isNew
`;

let viewScriptSha: string;

async function init() {
  viewScriptSha = await client.scriptLoad(VIEW_SCRIPT);
  console.log('View script SHA:', viewScriptSha);
}
```

Sau init, app dùng SHA cho mọi invocation:

```ts
async function viewItem(userId: string, itemId: string) {
  await client.evalSha(viewScriptSha, {
    keys: [itemViewersKey(itemId), itemKey(itemId), itemsByViewsKey()],
    arguments: [userId, itemId],
  });
}
```

## Bẫy: script cache không persistent

Script cache trong **memory**. **Mất khi**:
- Redis restart.
- `SCRIPT FLUSH` được gọi.
- Failover trong Sentinel/Cluster (master mới không có cache).

→ EVALSHA fail với error `NOSCRIPT`.

```text
EVALSHA f72adc... 1 mykey
(error) NOSCRIPT No matching script. Please use EVAL.
```

Phải handle: **auto-fallback to EVAL**.

## Pattern: auto-fallback

```ts
async function callScript(sha: string, source: string, keys: string[], args: string[]) {
  try {
    return await client.evalSha(sha, { keys, arguments: args });
  } catch (err) {
    if (err.message.includes('NOSCRIPT')) {
      // Cache miss — fallback to EVAL, which auto-loads
      return await client.eval(source, { keys, arguments: args });
    }
    throw err;
  }
}
```

Khi NOSCRIPT, gọi EVAL với full source. Redis tự cache lại + execute. Subsequent calls EVALSHA work tiếp.

**Trade-off**: lần fallback có overhead 1 RTT extra. Acceptable cho rare event.

## node-redis built-in helper

node-redis v4+ có `defineScript`:

```ts
import { defineScript } from 'redis';

const viewScript = defineScript({
  NUMBER_OF_KEYS: 3,
  SCRIPT: `
    local isNew = redis.call('SADD', KEYS[1], ARGV[1])
    if isNew == 1 then
      redis.call('HINCRBY', KEYS[2], 'views', 1)
      redis.call('ZINCRBY', KEYS[3], 1, ARGV[2])
    end
    return isNew
  `,
  transformArguments(viewersKey: string, itemKey: string, sortKey: string, userId: string, itemId: string) {
    return [viewersKey, itemKey, sortKey, userId, itemId];
  },
  transformReply(reply: number) {
    return reply === 1;
  },
});

const client = createClient({ scripts: { viewItem: viewScript } });
await client.connect();

// Sử dụng:
const isNew = await (client as any).viewItem(
  viewersKey, itemKey, sortKey,
  userId, itemId
);
```

Built-in handle SCRIPT LOAD + EVALSHA + fallback. Cleaner code.

## SCRIPT EXISTS — check cache

```text
SCRIPT EXISTS f72adc... abc123...
1) (integer) 1     # cached
2) (integer) 0     # not cached
```

Multi-arg check. Hữu ích để pre-warm cache after restart:

```ts
const expectedShas = [viewSha, likeSha, bidSha];
const exists = await client.scriptExists(...expectedShas);
const missing = expectedShas.filter((_, i) => !exists[i]);
for (const sha of missing) {
  // Re-load
  await client.scriptLoad(/* corresponding source */);
}
```

## SCRIPT FLUSH — xoá cache

```text
SCRIPT FLUSH
OK
```

Xoá toàn bộ script cache. Use case:
- Deploy với script đổi → flush + reload.
- Memory pressure (script cache có thể lớn).

Default trong Redis 7+: `SCRIPT FLUSH ASYNC` — non-blocking.

## Memory overhead

Mỗi script cached chiếm ~vài KB. Với 100 script khác nhau: ~vài trăm KB. Nhỏ.

Memory cache không infinite tăng vì script SHA cố định — duplicate calls dùng cùng entry.

## Cluster considerations

Trong Cluster:
- **Mỗi node có cache riêng**.
- SCRIPT LOAD chỉ load trên node bạn connect. Phải load trên **mọi node** nếu script chạy trên mọi shard.

Pattern:
```ts
// Load script lên tất cả master nodes
for (const node of cluster.masterNodes) {
  await node.scriptLoad(SOURCE);
}
```

Hoặc dùng fallback EVAL — auto load on demand.

## Versioning script khi deploy

Khi đổi script:
- Source thay đổi → SHA1 thay đổi.
- App có sha cũ → EVALSHA fail → fallback EVAL → load script mới.

→ No coordination needed. Roll out app phiên bản mới, script auto-load.

## Best practice tổng kết

1. **Load on startup**: SCRIPT LOAD mọi script app dùng.
2. **Cache SHA**: store trong constant/config.
3. **Auto-fallback**: catch NOSCRIPT → EVAL.
4. **Library helper**: dùng `defineScript` của node-redis hoặc tương đương ngôn ngữ khác.
5. **Test script độc lập**: viết test cho từng script trong dev.

## Hiệu năng so sánh

Trên Redis local, script ngắn:

| Approach | Latency | Bandwidth/call |
|---|---|---|
| `EVAL` mỗi lần | ~0.5ms | full source |
| `EVALSHA` | ~0.3ms | SHA1 (40 bytes) |

Diff ~0.2ms. Quan trọng khi script lớn (1KB+) hoặc network slow.

## Khi nào EVAL OK?

- Script chạy 1 lần / vòng đời app (init, migration).
- Script ngắn (< 100 bytes).
- Prototyping, không lo bandwidth.

Default: dùng EVALSHA cho production code.

## Tóm tắt bài 4

- `EVAL` gửi source mỗi lần — wasteful.
- `SCRIPT LOAD` cache server-side, trả SHA1.
- `EVALSHA` chạy script đã cache với SHA1 + KEYS/ARGS.
- Script cache không persistent — handle `NOSCRIPT` với fallback.
- node-redis `defineScript` cho boilerplate-free.
- Cluster: load trên mọi node hoặc fallback EVAL.

**Bài kế tiếp** → [Bài 5: KEYS và ARGV — passing data into script](05-keys-va-argv.md)
