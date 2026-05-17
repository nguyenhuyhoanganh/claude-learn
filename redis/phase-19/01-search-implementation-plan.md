# Bài 1: Plan implement search trong app RB

Phase 18 đã học RediSearch lý thuyết. Phase này áp dụng — wire up search bar trong app RB. Bài 1 lên plan + tạo index. Bài sau implement code.

## Goal

Search bar trong header. User gõ → autocomplete + full search page.

```text
User gõ "chair"
   ↓
Search bar suggest: "Vintage Chair", "Office Chair", ...
   ↓
Click "Search" → trang `/search?q=chair`
   ↓
Hiển thị 20 items match "chair" trong name/description.
```

## Process tạo index

Mỗi index mới, đi qua 7 step:

1. **Identify prefix**: index cover keys nào?
2. **Choose data type**: HASH hay JSON?
3. **Define schema**: fields + types.
4. **Choose options**: SORTABLE, WEIGHT, NOSTEM.
5. **Pick name**: index name (vd `idx:items`).
6. **When to create**: app startup, migration, hoặc on-demand?
7. **Handle conflicts**: index đã có thì sao?

Đi qua từng step cho app RB.

## Step 1: Prefix

Items lưu ở keys `items#<id>`. Prefix:
```text
PREFIX 1 items#
```

Vài design alternatives:
- Toàn bộ items: `items#`.
- Chỉ active items: dùng FILTER hoặc namespace riêng.

Default: index all items.

## Step 2: Data type

App dùng Hash → `ON HASH`.

Nếu dùng RedisJSON: `ON JSON`. (Phase 4 đã chọn Hash.)

## Step 3: Schema

Mỗi field cần xác định type + options:

| Field | Type | Options | Lý do |
|---|---|---|---|
| `name` | TEXT | WEIGHT 5.0 SORTABLE | Search chính, sort alphabet |
| `description` | TEXT | WEIGHT 1.0 | Search phụ |
| `ownerId` | TAG | — | Filter by seller |
| `price` | NUMERIC | SORTABLE | Range + sort |
| `views` | NUMERIC | SORTABLE | Sort by popularity |
| `likes` | NUMERIC | SORTABLE | Sort by liked |
| `bids` | NUMERIC | SORTABLE | Sort by activity |
| `createdAt` | NUMERIC | SORTABLE | Recency |
| `endingAt` | NUMERIC | SORTABLE | Filter active auctions |
| `highestBidUserId` | TAG | NOINDEX | Display only, không filter |

Total 10 fields. Đủ cho search + sort + filter.

## Step 4: Options

- **WEIGHT 5.0 cho name**: match name có score 5x. Critical cho search relevance.
- **SORTABLE cho NUMERIC**: support sort. Tốn memory ~10%/field, OK.
- **NOINDEX cho highestBidUserId**: chỉ return, không search.

## Step 5: Name

`idx:items` — descriptive, namespace với prefix `idx:`.

Convention: `idx:<entity>` cho indexes. Vd:
- `idx:items`
- `idx:users`
- `idx:posts`

## Step 6: When to create

3 options:

### Option A: App startup

```ts
async function ensureIndex() {
  try {
    await client.ft.info('idx:items');
    // Already exists, skip
  } catch (err) {
    if (err.message.includes('Unknown Index')) {
      await client.ft.create('idx:items', schema, options);
    } else {
      throw err;
    }
  }
}

// Call on app boot
await ensureIndex();
```

Pros: simple, always ready.  
Cons: chạy mỗi lần app start (multiple instances → multiple tries, idempotent).

### Option B: Migration script

```bash
# tools/create-indexes.ts
npm run migrate:indexes
```

Run khi deploy. App không cần code logic.

Pros: clean separation. Cons: forget run → app fail.

### Option C: On-demand

Tạo lần đầu user search.

Pros: lazy.  
Cons: first request chậm. Complex code.

Recommend: **Option A** (ensureIndex on startup). Idempotent, no DevOps overhead.

## Step 7: Conflict

Nếu index đã tồn tại với schema khác:
- `FT.CREATE` fail.
- Phải `FT.DROPINDEX` + recreate.

Trong dev: drop + recreate OK. Trong production: cẩn thận.

```ts
async function ensureIndex(force = false) {
  if (force) {
    try {
      await client.ft.dropIndex('idx:items');
    } catch (err) { /* ignore */ }
  }
  
  try {
    await client.ft.create('idx:items', schema, options);
  } catch (err) {
    if (!err.message.includes('Index already exists')) {
      throw err;
    }
  }
}

// Migration: ensureIndex(force=true) khi schema thay đổi
// Normal: ensureIndex(force=false)
```

## File structure cho search code

```text
src/services/queries/items/
  search.ts              # search function
  index-management.ts    # createIndex, dropIndex
  search-parsing.ts      # parse user input, build query
```

Tách concern.

## Schema chi tiết cho code

```ts
// services/queries/items/index-management.ts
import { client } from '../../redis/client';
import { SCHEMA_FIELD_TYPE } from 'redis';

const SCHEMA = {
  '$.name':         { type: SCHEMA_FIELD_TYPE.TEXT, WEIGHT: 5.0, SORTABLE: true },
  '$.description':  { type: SCHEMA_FIELD_TYPE.TEXT, WEIGHT: 1.0 },
  '$.ownerId':      { type: SCHEMA_FIELD_TYPE.TAG },
  '$.price':        { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
  '$.views':        { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
  '$.likes':        { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
  '$.bids':         { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
  '$.createdAt':    { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
  '$.endingAt':     { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
};

const INDEX_NAME = 'idx:items';
const PREFIX = 'items#';

export async function ensureItemsIndex(): Promise<void> {
  try {
    await client.ft.info(INDEX_NAME);
    console.log(`Index ${INDEX_NAME} already exists`);
  } catch (err: any) {
    if (err.message.includes('Unknown Index')) {
      await createIndex();
    } else {
      throw err;
    }
  }
}

async function createIndex() {
  console.log(`Creating index ${INDEX_NAME}...`);
  await client.ft.create(INDEX_NAME, SCHEMA, {
    ON: 'HASH',
    PREFIX,
  });
  console.log(`Index ${INDEX_NAME} created`);
}

export async function dropItemsIndex(): Promise<void> {
  try {
    await client.ft.dropIndex(INDEX_NAME);
  } catch (err: any) {
    if (!err.message.includes('Unknown Index')) {
      throw err;
    }
  }
}
```

## Verify index

```text
redis-cli
> FT.INFO idx:items
1) "index_name"
2) "idx:items"
3) "num_docs"
4) "1247"
...
```

Hoặc programmatic:
```ts
const info = await client.ft.info('idx:items');
console.log(`Items indexed: ${info.numDocs}`);
```

## Test với seed data

```ts
// scripts/seed-items.ts
import { createItem } from '$lib/queries/items';

const FAKE_ITEMS = [
  { name: 'Vintage Wooden Chair', description: 'Beautiful old chair from 1920', price: 150 },
  { name: 'Office Chair', description: 'Ergonomic modern chair', price: 250 },
  { name: 'Antique Piano', description: 'Grand piano, perfect condition', price: 5000 },
  { name: 'Acoustic Guitar', description: 'Vintage Martin guitar', price: 800 },
  // ... 100 items
];

for (const item of FAKE_ITEMS) {
  await createItem({ ...item, ownerId: 'seller-1', endingAt: new Date(Date.now() + 86400000) });
}
```

Seed → test search ngay.

## Estimated metrics

Sau khi tạo index với 1000 items:
- Index memory: ~5 MB.
- Query latency: 1-3ms.
- Number unique terms: ~3000-5000.

Scale linearly. 1M items → ~5 GB index, query 5-20ms.

## Tóm tắt bài 1

- Plan index qua 7 step.
- App RB: index `idx:items` cover `items#*` với 10 fields.
- `ensureIndex` on startup — idempotent.
- Migration cho schema changes — force drop + recreate.
- Tách code: search.ts, index-management.ts, search-parsing.ts.

**Bài kế tiếp** → [Bài 2: Implement createIndex function](02-create-index-function.md)
