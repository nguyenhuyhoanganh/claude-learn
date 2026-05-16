# Bài 4: Implement SORT trong app RB — getMostViewedItems

Áp dụng SORT cho 1 query thực trong app RB: `getMostViewedItems`. Đây là chance dùng SORT đúng cách, đồng thời so sánh trực tiếp với pipeline approach và quyết định pick which.

## Yêu cầu — recap

Carousel "Most viewed" trên landing page. Yêu cầu:
- Lấy top 20 items có views cao nhất.
- Hiển thị: name, image, price, views.
- Items có thể có 1M+ — phải scale.

## Approach 1: Pipeline (đã làm)

```ts
export async function getMostViewedItems(offset = 0, count = 20) {
  const ids = await client.zRange(itemsByViewsKey(), offset, offset + count - 1, { REV: true });
  if (ids.length === 0) return [];
  
  const items = await Promise.all(ids.map((id) => client.hGetAll(itemKey(id))));
  return items
    .map((raw, i) => Object.keys(raw).length === 0 ? null : deserialize(ids[i], raw))
    .filter(Boolean);
}
```

2 RTT. ~1.5ms. Recommended.

## Approach 2: SORT

```ts
export async function getMostViewedItemsWithSort(offset = 0, count = 20) {
  const flat = await client.sort(itemsByViewsKey(), {
    BY: 'NOSORT',                     // sorted set đã sort theo views
    GET: [
      '#',                            // id
      `${itemKey('*')}->name`,        // name
      `${itemKey('*')}->price`,       // price
      `${itemKey('*')}->views`,       // views
      `${itemKey('*')}->imageUrl`,    // image
    ],
    LIMIT: { offset, count },
    DIRECTION: 'DESC',
  });
  
  // Chunk flat array thành items
  const fieldsPerItem = 5;
  const items: PartialItem[] = [];
  for (let i = 0; i < flat.length; i += fieldsPerItem) {
    items.push({
      id:       flat[i],
      name:     flat[i + 1],
      price:    parseFloat(flat[i + 2]),
      views:    parseInt(flat[i + 3], 10),
      imageUrl: flat[i + 4],
    });
  }
  return items;
}
```

1 RTT. ~1.2ms.

## So sánh cú pháp

| | Pipeline | SORT |
|---|---|---|
| Dòng code | ~6 dòng | ~20 dòng (gồm chunk logic) |
| Đọc hiểu | Dễ — 2 step rõ | Khó — pattern template, GET position |
| Refactor | Đổi field thêm dễ | Đổi GET position → đổi chunk index |
| Type-safe | Type Item đầy đủ | Phải tự build object từ flat |
| Performance | 2 RTT | 1 RTT |

→ **Pipeline thắng về maintainability**. SORT thắng về RTT (~25% nhanh).

## Câu hỏi thực sự: latency có quan trọng?

- App standalone Redis trong cùng datacenter: 2 RTT = 1ms. 1 RTT = 0.5ms. Diff = 0.5ms.
- App + Redis Cloud (xuyên region): 2 RTT = 100ms. 1 RTT = 50ms. Diff = 50ms.

Trong case 2, **SORT đáng cân nhắc**. Trong case 1, **không đáng**.

→ Quyết định dựa trên **deployment topology**, không phải "best practice abstract".

## Limitation 1: Cluster

```text
SORT items:views BY items:* GET items:*->name
```

→ Trên cluster, không hoạt động nếu `items:views` và `items:<id>` ở các slot khác nhau.

Workaround: hash tag mọi key cùng namespace:
```text
SORT {items}:by-views BY {items}:* GET {items}:*->name
```

Mọi key trên 1 node → hot spot. Trade-off lớn.

**Recommend**: nếu Cluster, **không dùng SORT BY/GET**. Dùng pipeline.

## Limitation 2: Big collection

Sorted set `items:views` với 1M items. SORT phải:
1. Lấy tất cả 1M members.
2. Lookup HGET 1M lần cho GET pattern.
3. LIMIT 0 20 lấy 20 cuối.

Step 1-2 chặn event loop. KO acceptable.

`BY NOSORT` giúp một phần (không sort), nhưng vẫn lookup 1M HGET.

**Recommend**: với sorted set lớn, **dùng ZRANGE LIMIT** để chỉ lấy top N (O(log N + K)), rồi pipeline HGETALL.

## Limitation 3: HGETALL không thể qua SORT

SORT GET chỉ lấy được **một field một lần**. Để lấy 10 field, phải có 10 GET. Verbose.

Pipeline `HGETALL` lấy hết toàn bộ hash trong 1 lệnh — simpler khi cần đầy đủ.

→ SORT phù hợp khi **cần subset of fields**. Pipeline phù hợp khi cần **full hash**.

## Recommendation cho app RB

Cho mọi query "top N items" trong app:

```ts
// 1. Lấy IDs (sorted set với LIMIT — O(log N + K))
const ids = await client.zRange(/*...*/);

// 2. Pipeline HGETALL (parallel)
const items = await Promise.all(ids.map((id) => client.hGetAll(itemKey(id))));

// 3. Deserialize
return items.map((raw, i) => /*...*/);
```

Pattern này:
- ✓ Hoạt động với Cluster.
- ✓ Scale với 100M+ items.
- ✓ Lấy full hash, không cần liệt fields.
- ✓ Dễ refactor.
- ✗ 2 RTT (vs 1 với SORT).

Chấp nhận 2 RTT đổi lấy mọi advantage trên.

## Khi nào dùng SORT trong app RB?

1. **Single-page query với subset fields**, latency mạng cao, dataset nhỏ.
2. **Standalone Redis** + collection < 10k.
3. **Quick prototype** — ít code.

Trong khoá học, đa số dùng pipeline. SORT chỉ ở 1 nơi (most viewed) như **demo educational**.

## Code thực tế: kết hợp SORT với BY NOSORT cho join

Có một use case SORT thật sự đẹp: **fetch IDs từ Set + join fields**.

```text
SADD likes:user#alice item#5 item#12 item#88

SORT likes:user#alice BY NOSORT GET # GET items#*->name GET items#*->price
```

→ Lấy 3 items + name + price. 1 RTT.

Tương đương pipeline:
```ts
const ids = await client.sMembers('likes:user#alice');
const items = await Promise.all(ids.map((id) => client.hGetAll(itemKey(id))));
```

→ 2 RTT. Same result.

Trade-off:
- SORT: 1 RTT, code phức tạp.
- Pipeline: 2 RTT, code rõ.

Với Set < 100 items (likely cho per-user likes), latency local không khác biệt → pipeline tốt hơn về maintainability.

## Performance test thực

Trên Redis local, 100 items:

| Approach | Latency p50 | p99 |
|---|---|---|
| Pipeline (ZRANGE + Promise.all HGETALL) | 1.2ms | 2.1ms |
| SORT BY NOSORT GET fields | 0.8ms | 1.5ms |

Diff ~0.4ms p50. Trên 1000 RPS, tiết kiệm 400ms/s server time — không đáng kể.

Trên remote Redis (cloud, 30ms RTT):

| Approach | Latency |
|---|---|
| Pipeline | 60ms |
| SORT | 31ms |

Diff 29ms — đáng kể với user-facing latency. SORT đáng dùng ở deployment này.

## Tóm tắt bài 4

- SORT thay 2 RTT bằng 1 RTT.
- Pipeline maintainability tốt hơn, type-safe hơn.
- SORT có 3 limitations: cluster, big collection, full-hash.
- Recommendation: **pipeline mặc định, SORT khi remote Redis + small dataset + subset fields**.
- App RB chủ yếu dùng pipeline.

**Bài kế tiếp** → [Bài 5: Tổng kết phase-12 + Khi nào quay về RediSearch](05-tong-ket-redisearch-preview.md)
