# Bài 7: Update index + tổng kết phase-19

Bài cuối phase-19. Cover scenario thực tế: thêm field, đổi schema, drop old data, plus tổng kết toàn bộ search workflow.

## Adding new field

App grow → cần thêm field. Vd thêm `category`:

### Option 1: FT.ALTER

```ts
await client.ft.alter('idx:items', {
  ADD: {
    '$.category': { type: 'TAG' },
  },
});
```

**Caveats**:
- Existing documents **không re-index** với field mới.
- Documents mới hoặc updated sẽ có category trong index.

Workaround: HSET lại để trigger re-index:
```ts
const ids = await client.scan(0, { MATCH: 'items#*' });
for (const id of ids) {
  // Touch each item — trigger re-index
  await client.hSet(id, 'lastTouched', Date.now().toString());
}
```

Hoặc:

### Option 2: Drop + recreate

```ts
await client.ft.dropIndex('idx:items');
await client.ft.create('idx:items', NEW_SCHEMA, options);
// Index rebuild từ tất cả documents
```

Pros: clean, all data indexed correctly.  
Cons: brief window không search được trong khi rebuild. Trên 1M+ items, 5-30s.

Production: schedule deploy window, hoặc dùng versioned indexes.

### Option 3: Versioned indexes

```ts
const NEW_INDEX = 'idx:items:v2';

// Create new index alongside old
await client.ft.create(NEW_INDEX, NEW_SCHEMA, { ON: 'HASH', PREFIX });

// App reads from new index
const result = await client.ft.search(NEW_INDEX, query, ...);

// Sau khi verify, drop old
await client.ft.dropIndex('idx:items');
```

Zero downtime. Memory overhead temporary.

## Deleting / renaming field

`FT.ALTER` không support drop field. Phải drop + recreate.

## Reindex strategy

Khi cần reindex full data:

```ts
async function reindexAll() {
  console.log('Reindex started');
  let cursor = 0;
  let count = 0;
  
  do {
    const result = await client.scan(cursor, { MATCH: 'items#*', COUNT: 100 });
    cursor = result.cursor;
    
    for (const key of result.keys) {
      const data = await client.hGetAll(key);
      await client.hSet(key, data);   // re-set → trigger index update
      count++;
    }
    
    if (count % 1000 === 0) {
      console.log(`Reindexed ${count} items`);
    }
  } while (cursor !== 0);
  
  console.log(`Reindex complete: ${count} items`);
}
```

→ Batch reindex. Doesn't block reads/writes.

## Maintenance windows

Production schema changes:

1. **Notify users**: planned maintenance.
2. **Deploy index changes**: drop+recreate or alter.
3. **Monitor**: indexing progress (`FT.INFO`).
4. **Verify**: sample queries return expected.
5. **Resume traffic**.

For zero-downtime: versioned indexes là approach standard.

## Index health monitoring

```ts
async function checkIndexHealth() {
  const info = await client.ft.info('idx:items');
  
  // Check num docs matches
  const totalItems = await countAllItems();
  if (info.numDocs < totalItems * 0.99) {
    console.warn(`Index missing items: ${info.numDocs} vs ${totalItems}`);
  }
  
  // Check indexing not stuck
  if (info.indexing === '1' && info.percentIndexed < 0.95) {
    console.warn(`Still indexing: ${info.percentIndexed * 100}%`);
  }
  
  // Check memory usage
  if (info.totalIndexingTime > someThreshold) {
    console.warn('Index slow');
  }
}
```

Run periodically, alert if anomaly.

## Disaster recovery

Index lost (corruption, accidental drop):

1. App detect: `FT.SEARCH` returns error.
2. Auto-recreate qua `ensureIndex()`:
   ```ts
   try {
     return await search(query);
   } catch (err) {
     if (err.message.includes('Unknown Index')) {
       await ensureItemsIndex();
       return await search(query);    // retry
     }
     throw err;
   }
   ```
3. Background reindex (vài giây - phút).
4. App resume.

## Backup strategy

Index không backup separately — rebuild từ data.

Backup:
- **Data**: RDB/AOF persistence.
- **Index schema**: source code (FT.CREATE definition).
- **Restore**: load data → run ensureIndex → background reindex.

## Tổng kết phase-19

Đã hoàn thành full search implementation cho app RB:

| Bài | Topic |
|---|---|
| 1 | Plan + 7 step design index |
| 2 | createIndex function với error handling |
| 3 | Search parsing: sanitize → tokenize → build query |
| 4 | Execute search + parse results + pagination |
| 5 | TF-IDF + field weights + BM25 |
| 6 | Sorting + EXPLAIN + PROFILE |
| 7 | Update index + maintenance |

## Search architecture

```text
User Input "Vintage Piano!"
   │
   ▼
sanitizeInput      → "vintage piano"
   │
   ▼
tokenize           → ["vintage", "piano"]
   │
   ▼
buildQuery         → "(@name:(vintage piano) => {$weight: 5.0}) | (@description:(vintage piano))"
   │
   ▼
FT.SEARCH          → result.documents
   │
   ▼
deserialize        → Item[]
   │
   ▼
return { items, total, hasMore }
```

## Files cuối cùng

```text
src/services/queries/items/
├── index-management.ts    # ensure/create/drop index
├── search.ts              # main searchItems function
├── search-parsing.ts      # sanitize, tokenize, buildQuery
├── search-suggestions.ts  # autocomplete
└── items.ts               # core CRUD (create, get, etc)

scripts/
├── seed-items.ts
└── migrate-indexes.ts
```

## Performance achieved

App RB với 10k items:

| Query | Latency p50 | p99 |
|---|---|---|
| Simple search ("chair") | 2ms | 8ms |
| Filtered search ("@price:[100 500] chair") | 3ms | 10ms |
| Sort by price | 4ms | 12ms |
| Faceted (tag + price + text) | 5ms | 15ms |
| Aggregate (count by category) | 10ms | 30ms |

So với SQL `LIKE %chair%`: 200-2000ms range.

## Best practices summary

1. **Plan schema kỹ**: 1 lần create, hard to change.
2. **SORTABLE cho fields** dự định sort.
3. **WEIGHT cho relevance bias**.
4. **NOINDEX cho display-only fields**.
5. **NOINDEX cho high-write fields** không cần search.
6. **Index versioning** cho zero-downtime schema change.
7. **Monitor index health** thường xuyên.
8. **Pre-process input**: sanitize, tokenize, stop words.
9. **Cache popular queries**: 10% queries = 80% traffic.
10. **Track metrics**: latency, CTR, no-result rate.

## When NOT to use RediSearch

- < 10k items, simple LIKE query → Hash + LIKE-equivalent enough.
- Real-time analytics → ClickHouse, Druid.
- Logs/traces → Elasticsearch.
- Hybrid search (vector + keyword) → Redis Stack + vector index, hoặc Pinecone, Weaviate.

App RB scope → RediSearch sweet spot.

## Phase tiếp theo

Phase 20 (Section 21 transcript) là **Streams** — event-driven messaging trong Redis. Use case:
- Event log: lưu mọi action user.
- Activity feed real-time.
- Job queue với consumer group (replace List queue).
- Microservices messaging.

→ [Phase-20 — Bài 1: Streams là gì?](../phase-20/01-streams-la-gi.md)

## Tóm tắt phase-19

App RB giờ có:
- ✓ Search bar full-featured.
- ✓ Faceted filter (price, tags, owner).
- ✓ Sort options.
- ✓ Auto-indexed on writes.
- ✓ Pagination.
- ✓ Auto-complete suggestion.
- ✓ Production-grade error handling.

Search là feature lớn nhất phase này. Tiếp theo: real-time messaging với Streams.
