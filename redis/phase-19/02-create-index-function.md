# Bài 2: Implement createIndex function

Bài 1 đã plan. Giờ implement đầy đủ `createIndex` function với error handling, type safety, và logging.

## File structure

```text
src/services/queries/items/
  index-management.ts    # createIndex, dropIndex, ensureIndex
  search.ts              # searchItems
  search-parsing.ts      # sanitize, build query
```

## Full implementation

```ts
// src/services/queries/items/index-management.ts
import { client } from '../../redis/client';
import { SCHEMA_FIELD_TYPE } from 'redis';

export const INDEX_NAME = 'idx:items';
const PREFIX = 'items#';

export async function ensureItemsIndex(): Promise<void> {
  if (await indexExists()) {
    console.log(`Index ${INDEX_NAME} already exists`);
    return;
  }
  await createIndex();
}

export async function recreateItemsIndex(): Promise<void> {
  await dropIndex();
  await createIndex();
}

async function indexExists(): Promise<boolean> {
  try {
    await client.ft.info(INDEX_NAME);
    return true;
  } catch (err: any) {
    if (err.message?.includes('Unknown Index') || err.message?.includes('no such index')) {
      return false;
    }
    throw err;
  }
}

async function createIndex(): Promise<void> {
  console.log(`Creating index ${INDEX_NAME}...`);
  
  await client.ft.create(
    INDEX_NAME,
    {
      '$.name': {
        type: SCHEMA_FIELD_TYPE.TEXT,
        WEIGHT: 5.0,
        SORTABLE: true,
      },
      '$.description': {
        type: SCHEMA_FIELD_TYPE.TEXT,
        WEIGHT: 1.0,
      },
      '$.ownerId': {
        type: SCHEMA_FIELD_TYPE.TAG,
      },
      '$.price': {
        type: SCHEMA_FIELD_TYPE.NUMERIC,
        SORTABLE: true,
      },
      '$.views': {
        type: SCHEMA_FIELD_TYPE.NUMERIC,
        SORTABLE: true,
      },
      '$.likes': {
        type: SCHEMA_FIELD_TYPE.NUMERIC,
        SORTABLE: true,
      },
      '$.bids': {
        type: SCHEMA_FIELD_TYPE.NUMERIC,
        SORTABLE: true,
      },
      '$.createdAt': {
        type: SCHEMA_FIELD_TYPE.NUMERIC,
        SORTABLE: true,
      },
      '$.endingAt': {
        type: SCHEMA_FIELD_TYPE.NUMERIC,
        SORTABLE: true,
      },
    },
    {
      ON: 'HASH',
      PREFIX,
    }
  );
  
  console.log(`Index ${INDEX_NAME} created`);
}

async function dropIndex(): Promise<void> {
  try {
    await client.ft.dropIndex(INDEX_NAME);
    console.log(`Index ${INDEX_NAME} dropped`);
  } catch (err: any) {
    if (!err.message?.includes('Unknown Index') && !err.message?.includes('no such index')) {
      throw err;
    }
  }
}
```

## Gọi từ app startup

```ts
// src/lib/server/init.ts
import { ensureItemsIndex } from './queries/items/index-management';

export async function initialize() {
  console.log('Initializing app...');
  await client.connect();
  await ensureItemsIndex();
  console.log('App initialized');
}
```

Trong SvelteKit hooks:
```ts
// src/hooks.server.ts
import { initialize } from './lib/server/init';

await initialize();
```

→ Run mỗi lần server start. Idempotent.

## Migration helper

```ts
// scripts/migrate-indexes.ts
import { recreateItemsIndex } from '../src/services/queries/items/index-management';

(async () => {
  await client.connect();
  await recreateItemsIndex();
  await client.quit();
})();
```

```bash
npm run migrate:indexes
```

→ Run khi schema thay đổi, không phải mỗi deploy.

## Verify trong CLI

```text
> FT.INFO idx:items
 1) "index_name"
 2) "idx:items"
 3) "index_options"
 4) (empty array)
 5) "index_definition"
 6) 1) "key_type"
    2) "HASH"
    3) "prefixes"
    4) 1) "items#"
 7) "attributes"
 8) 1) 1) "identifier"  2) "name"  3) "attribute"  4) "name"  5) "type"  6) "TEXT"  ...
    2) 1) "identifier"  2) "description"  ...
 ...
 9) "num_docs"
10) "1247"
```

## Auto-indexing on writes

Sau khi index tạo:
```text
HSET items#abc name "New Item" price 100 ...
```

→ RediSearch tự index. Không cần làm gì thêm trong app code.

```text
> FT.SEARCH idx:items "new"
1) (integer) 1
2) "items#abc"
3) 1) "name"  2) "New Item"  3) "price"  4) "100"  ...
```

## Background indexing for existing data

Khi tạo index trên data đã có:

```ts
await client.ft.create('idx:items', schema, options);
```

RediSearch background scan all `items#*` keys, index chúng. Có thể mất vài giây cho 1M+ items.

Check progress:
```ts
const info = await client.ft.info(INDEX_NAME);
if (info.indexing === '1') {
  console.log(`Still indexing... ${info.percentIndexed * 100}%`);
}
```

App có thể query trong khi indexing — results không đầy đủ tạm thời.

## Schema versioning

Khi sau này thêm field mới (vd `category`):

```ts
async function migrateToV2() {
  await dropIndex();
  // Schema mới với category
  await createIndex();
}
```

Hoặc dùng `FT.ALTER`:
```ts
await client.ft.alter(INDEX_NAME, 'SCHEMA', 'ADD', 'category', 'TAG');
```

Trade-off `ALTER`: existing docs **không re-index** với field mới. Phải HSET lại để index.

→ Phổ biến: drop + recreate khi schema changes (acceptable cho dev/staging). Production: dùng ALTER + rolling update.

## Index name convention

```text
idx:<entity>          # main index
idx:<entity>:active   # filtered index (chỉ active)
idx:<entity>:v2       # versioned
```

App lớn có thể có nhiều index cho cùng entity với filter/aggregate khác nhau.

## Performance cost của index

Mỗi HSET trên `items#*` trigger index update. Overhead:
- Tokenize TEXT field.
- Parse NUMERIC, TAG.
- Update inverted index, sorted index.

Cost: ~50-200μs per HSET. Cho HSET high-frequency (vd view counter), index có thể slow down writes 2-5x.

Mitigation:
- **Separate hot data**: counter không index trong hash chính.
- **NOINDEX cho high-write fields**: store nhưng không index.
- **Batch updates**: pipeline để amortize cost.

App RB: views/likes update thường → cân nhắc NOINDEX (chỉ dùng cho sort, không search).

## NOINDEX cho high-write field

```ts
{
  '$.views': { type: NUMERIC, SORTABLE: true, NOINDEX: true },
}
```

Wait — NOINDEX + SORTABLE conflict? Không. NOINDEX = không trong inverted index (không search query), SORTABLE = có trong sort index (sort fast).

```text
FT.SEARCH idx "@views:[100 +inf]"     # KHÔNG match (NOINDEX → không filterable)
FT.SEARCH idx "*" SORTBY views        # OK (SORTABLE → sort được)
```

→ Chọn carefully dựa trên use case.

## Test indexing

```ts
// scripts/test-indexing.ts
import { createItem } from '../src/services/queries/items';

await createItem({
  name: 'Vintage Wooden Chair',
  description: 'Beautiful old chair',
  price: 150,
  // ...
});

// Check ngay
const result = await client.ft.search(INDEX_NAME, 'chair');
console.log(result);
// Phải có item vừa tạo
```

→ Verify auto-indexing hoạt động.

## Drop tất cả + reseed for clean state

Dev workflow:
```bash
npm run flush-data && npm run seed && npm run migrate:indexes
```

→ Reset Redis, load fake data, recreate index.

## Tóm tắt bài 2

- `ensureItemsIndex`: idempotent, run on startup.
- `recreateItemsIndex`: cho schema changes.
- `indexExists` check error message để distinguish.
- Auto-indexing on HSET — không cần code khi data thay đổi.
- Background indexing existing data có thể mất thời gian.
- NOINDEX cho high-write fields (counter) — avoid slow writes.

**Bài kế tiếp** → [Bài 3: Search parsing — từ raw input tới query](03-search-parsing.md)
