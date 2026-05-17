# Bài 4: Execute search + parse results

Có query, execute và parse trả về Items. Bài này implement đầy đủ với deserialize, error handling, pagination.

## Implementation

```ts
// src/services/queries/items/search.ts
import { client } from '../../redis/client';
import { INDEX_NAME } from './index-management';
import { parseSearchInput } from './search-parsing';
import { deserialize } from './deserialize';
import type { Item } from '$lib/types';

export type SearchOptions = {
  page?: number;
  perPage?: number;
};

export type SearchResult = {
  items: Item[];
  total: number;
  hasMore: boolean;
};

export async function searchItems(
  rawInput: string,
  options: SearchOptions = {}
): Promise<SearchResult> {
  const page = options.page ?? 1;
  const perPage = options.perPage ?? 20;
  const offset = (page - 1) * perPage;
  
  const query = parseSearchInput(rawInput);
  if (!query) {
    return { items: [], total: 0, hasMore: false };
  }
  
  try {
    const result = await client.ft.search(INDEX_NAME, query, {
      LIMIT: { from: offset, size: perPage },
      RETURN: ['name', 'description', 'imageUrl', 'price', 'views', 'likes', 'bids', 'endingAt', 'ownerId', 'highestBidUserId'],
    });
    
    const items = result.documents.map((doc) => {
      // doc.id = "items#xyz"
      const id = doc.id.replace('items#', '');
      const raw = doc.value as Record<string, string>;
      return deserialize(id, raw);
    });
    
    return {
      items,
      total: result.total,
      hasMore: offset + items.length < result.total,
    };
  } catch (err: any) {
    console.error('Search error:', err.message, 'Query:', query);
    return { items: [], total: 0, hasMore: false };
  }
}
```

## Result format

`result` từ `ft.search`:
```ts
{
  total: 47,                   // total matches (across all pages)
  documents: [
    {
      id: 'items#abc',
      value: {
        name: 'Vintage Piano',
        description: '...',
        price: '150',
        views: '237',
        // ...
      }
    },
    ...
  ]
}
```

Parse:
- `id` = key Redis. Extract id từ prefix.
- `value` = hash fields (as strings).
- Pass qua `deserialize(id, value)` → Item object với typed fields.

## Pagination logic

```ts
const offset = (page - 1) * perPage;
const hasMore = offset + items.length < result.total;
```

- Page 1: items 0-19, hasMore nếu total > 20.
- Page 2: items 20-39, hasMore nếu total > 40.
- ...

Frontend show pagination controls dựa trên `hasMore`.

## Error handling

```ts
try {
  // search
} catch (err) {
  console.error('Search error:', err);
  return { items: [], total: 0, hasMore: false };
}
```

Cases có thể fail:
- Index không tồn tại (`Unknown Index`).
- Query syntax invalid (escape không đủ).
- Redis disconnect.

Return empty thay vì throw — UI graceful.

## Route handler

```ts
// src/routes/search/+page.server.ts
import { searchItems } from '$lib/services/queries/items/search';

export async function load({ url }) {
  const q = url.searchParams.get('q') ?? '';
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  
  if (!q) {
    return { items: [], total: 0, hasMore: false, query: '' };
  }
  
  const result = await searchItems(q, { page, perPage: 20 });
  return { ...result, query: q };
}
```

## Render search page

```svelte
<!-- src/routes/search/+page.svelte -->
<script>
  export let data;
</script>

<h1>Search: {data.query}</h1>
<p>{data.total} items found</p>

{#each data.items as item}
  <a href="/items/{item.id}">
    <h3>{item.name}</h3>
    <p>{item.description}</p>
    <p>${item.price}</p>
  </a>
{/each}

{#if data.hasMore}
  <a href="?q={data.query}&page={Number($page.url.searchParams.get('page') ?? 1) + 1}">
    Next page
  </a>
{/if}
```

## Test thực

1. Seed data:
   ```bash
   npm run seed
   ```
   
2. Search:
   ```text
   GET /search?q=chair
   ```

Verify:
- Top results: items có "chair" trong **name** (boosted 5x).
- Sau đó: items có "chair" trong description.
- Total count chính xác.

## Edge cases

### Empty query

```ts
await searchItems('');
// → { items: [], total: 0, hasMore: false }
```

UI hiển thị "Enter search term".

### No matches

```ts
await searchItems('xyz123nonexistent');
// → { items: [], total: 0, hasMore: false }
```

UI hiển thị "No results. Try different keywords."

### Special chars only

```ts
await searchItems('@#$%');
// sanitize → "" → query null → empty
```

Same as empty. Hoặc show "Invalid query".

### Deleted item appearing in index

Race: item bị xoá nhưng index chưa update.

```ts
const items = result.documents.map((doc) => {
  if (Object.keys(doc.value).length === 0) return null;
  return deserialize(...);
}).filter(Boolean);
```

→ Filter null nếu data empty.

## Auto-complete với search

Different endpoint cho instant suggestion:

```ts
// /api/autocomplete?q=pi
export async function GET({ url }) {
  const q = url.searchParams.get('q') ?? '';
  if (q.length < 2) return json([]);
  
  // Chỉ prefix, không fuzzy (autocomplete fast)
  const query = `@name:${q}*`;
  
  const result = await client.ft.search(INDEX_NAME, query, {
    LIMIT: { from: 0, size: 10 },
    RETURN: ['name'],
  });
  
  const suggestions = result.documents.map((d) => (d.value as any).name);
  return json(suggestions);
}
```

Frontend: debounce input 200ms, call `/api/autocomplete?q=...`, hiển thị dropdown.

## Recently viewed in search context

Combine search với personalization:

```ts
async function personalizedSearch(userId: string, query: string) {
  const [global, recent] = await Promise.all([
    searchItems(query),
    client.lRange(`viewed:user#${userId}`, 0, 99),
  ]);
  
  const recentSet = new Set(recent);
  
  // Boost results user đã view recently
  const items = global.items.sort((a, b) => {
    const aBoost = recentSet.has(a.id) ? 1 : 0;
    const bBoost = recentSet.has(b.id) ? 1 : 0;
    return bBoost - aBoost;
  });
  
  return { ...global, items };
}
```

→ Items recently viewed xếp trên trong cùng query.

## Performance metrics

Track:
- Search latency (p50, p99).
- Result count distribution.
- "No results" rate.
- Click-through rate (which result clicked).

```ts
const start = Date.now();
const result = await searchItems(q);
const duration = Date.now() - start;
metrics.searchLatency(duration);
metrics.searchCount(result.total);
if (result.total === 0) metrics.searchNoResults(q);
```

## Tóm tắt bài 4

- `searchItems(query, options)` return `{ items, total, hasMore }`.
- Parse `result.documents`: id từ doc.id, value qua deserialize.
- Pagination với offset + perPage.
- Error handling → empty result, không throw.
- Personalized boost qua user recent activity.
- Track metrics cho optimization.

**Bài kế tiếp** → [Bài 5: TF-IDF + field weights — relevance ranking](05-tf-idf-weights.md)
