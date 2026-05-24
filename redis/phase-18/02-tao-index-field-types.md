# Bài 2: Tạo index + field types

Index là core của RediSearch. Bài này dạy cách tạo index với schema, các field type, options quan trọng (SORTABLE, NOINDEX, weight). Sau bài, bạn design được schema cho bất kỳ entity nào.

## Cú pháp FT.CREATE

```text
FT.CREATE <index_name>
  ON <HASH | JSON>
  PREFIX <count> <prefix1> [prefix2 ...]
  SCHEMA <field> <type> [options]
         <field> <type> [options]
         ...
```

Components:
- `index_name`: tên index (qua FT lệnh).
- `ON`: data type. HASH cho hash keys, JSON cho RedisJSON.
- `PREFIX`: list of key prefixes index sẽ cover.
- `SCHEMA`: field definitions.

## Ví dụ đầy đủ

```text
FT.CREATE idx:items
  ON HASH
  PREFIX 1 items#
  SCHEMA
    name        TEXT WEIGHT 5.0
    description TEXT
    price       NUMERIC SORTABLE
    views       NUMERIC SORTABLE
    tags        TAG SEPARATOR ","
    endingAt    NUMERIC SORTABLE
    location    GEO
```

→ Index `idx:items` cover mọi key `items#*`. 7 fields được indexed.

## Field types

### TEXT — full-text search

```text
name TEXT
```

- Tokenize, lowercase, stem (gốc từ).
- Support full-text query: prefix, fuzzy, phrase, boolean.

Options:
- `WEIGHT <num>`: trọng số khi scoring. Default 1.0. Higher = more important.
- `NOSTEM`: tắt stemming (vd "pianos" không match "piano").
- `PHONETIC <matcher>`: phonetic matching (vd "smith" match "smyth").
- `SORTABLE`: cho phép sort theo field này.
- `NOINDEX`: lưu trong index nhưng không searchable (chỉ để return).

```text
name TEXT WEIGHT 5.0 SORTABLE
```

→ Name có weight 5x → match name có score cao hơn match description.

### NUMERIC — range queries

```text
price NUMERIC SORTABLE
```

- Index số (integer hoặc float).
- Range query: `@price:[100 500]`.
- Sort by numeric.

Options:
- `SORTABLE`: support sort.
- `NOINDEX`: store-only.

### TAG — categorical / enum

```text
tags TAG SEPARATOR ","
```

- Exact match category.
- Multiple values separated bằng `SEPARATOR` (default ",").
- Query: `@tags:{vintage}` hoặc `@tags:{vintage|antique}`.

Options:
- `SEPARATOR <char>`: separator cho multi-value.
- `CASESENSITIVE`: case-sensitive match (default insensitive).
- `SORTABLE`.

Khi nào TAG vs TEXT?
- TAG: discrete values như category, status, country. Exact match.
- TEXT: free text, support fuzzy/prefix/phrase.

```text
status TAG          # active, pending, closed
title TEXT          # "Vintage Piano"
```

### GEO — geospatial

```text
location GEO
```

- Lưu lat/long.
- Query trong radius.
- Value format `<longitude>,<latitude>` trong hash field.

Use case: tìm shop trong 5km.

### VECTOR — similarity search (Redis 7.2+)

```text
embedding VECTOR FLAT 6 TYPE FLOAT32 DIM 768 DISTANCE_METRIC COSINE
```

- Vector embeddings (AI/ML).
- KNN similarity search.
- Use case: semantic search, recommendation, RAG.

Đây là chủ đề riêng — không cover trong khoá.

## Common options

### SORTABLE

```text
price NUMERIC SORTABLE
```

Cho phép sort kết quả theo field này:
```text
FT.SEARCH idx "*" SORTBY price ASC
```

Trade-off: tăng memory ~10-20% per field.

### NOINDEX

```text
imageUrl TEXT NOINDEX
```

Field được store + return trong result, nhưng **không searchable**. Hữu ích cho metadata.

### NOSTEM

```text
sku TEXT NOSTEM
```

Tắt stemming. Match exact word, không variant.

Use case: product SKU, ID, technical strings không có "gốc".

## PREFIX matching

```text
FT.CREATE idx:items PREFIX 1 items#
FT.CREATE idx:items PREFIX 2 items# products#
```

Multiple prefix OK. Index cover keys với bất kỳ prefix nào.

### PREFIX cẩn thận với patterns

```text
PREFIX 1 cache:item
```

→ Cover cả `cache:item#1`, `cache:items` (substring), nhưng KHÔNG cover `cache:items#1` nếu key chính là `cache:items#1` (prefix match đúng).

Tốt nhất: dùng prefix đầy đủ với separator.

## FILTER khi tạo index

Lọc keys không nên index:

```text
FT.CREATE idx:active_items
  ON HASH
  PREFIX 1 items#
  FILTER "@status=='active'"
  SCHEMA ...
```

Chỉ index items có `status = active`. Tiết kiệm memory cho items đã closed/archived.

## Verify index

```text
FT.INFO idx:items
```

Return: schema, num documents, memory usage, indexing state, etc.

```text
1) "index_name"
2) "idx:items"
3) "num_docs"
4) "1247"
5) "max_doc_id"
6) "1300"
7) "num_terms"
8) "5832"
9) ...
```

## Update index — FT.ALTER

```text
FT.ALTER idx:items SCHEMA ADD newField TEXT
```

Add field mới. Existing documents **không re-index** tự động — phải re-add hoặc rebuild.

```text
FT.ALTER idx:items SCHEMA ADD imageUrl TEXT NOINDEX
```

Drop field: không support direct. Phải drop index và create lại.

## Drop index

```text
FT.DROPINDEX idx:items
```

Xoá index. **Không xoá data** (hash keys vẫn còn). Chỉ remove index structure.

```text
FT.DROPINDEX idx:items DD     # DD = Delete Documents
```

`DD` xoá luôn hash keys. Cẩn thận.

## Index trên JSON với RedisJSON

```text
FT.CREATE idx:posts
  ON JSON
  PREFIX 1 post:
  SCHEMA
    $.title       AS title TEXT WEIGHT 5
    $.content     AS content TEXT
    $.tags[*]     AS tags TAG
    $.author.name AS author_name TEXT
```

Cú pháp `$.path` (JSONPath). `AS alias` để query với tên ngắn.

Cần Redis Stack hoặc cài cả RedisJSON + RediSearch.

## Indexing lifecycle

```text
FT.CREATE idx:items ...    # tạo
                            ↓
RediSearch scan keys items#* hiện có, index chúng.
Khi HSET items#new ..., RediSearch tự index.
Khi DEL items#42, RediSearch tự xoá khỏi index.
```

Background indexing không block writes. Có thể query trong khi đang index — kết quả không đầy đủ tạm thời.

Check status:
```text
FT.INFO idx:items
# ...
# "indexing"
# "1"        ← đang indexing
# "percent_indexed"
# "0.85"     ← 85% done
```

## Memory budget

Index thường ~30-50% size of indexed data.

Tính:
- 1M items × 500 byte avg = 500 MB hash data.
- Index: 150-250 MB.
- Total: 650-750 MB.

Plan memory: 2x data size cho safety.

## Best practices design schema

1. **Ít field tốt hơn**: chỉ index field bạn thực sự query/sort. NOINDEX cho fields chỉ return.
2. **Right type**: TAG cho category, TEXT cho free text, NUMERIC cho range.
3. **SORTABLE khi cần sort**: tốn memory nhưng query nhanh hơn.
4. **WEIGHT cho TEXT field quan trọng**: name > description > tags.
5. **NOSTEM cho technical strings**: SKU, code, ID.

## Schema cho app RB

```text
FT.CREATE idx:items
  ON HASH
  PREFIX 1 items#
  SCHEMA
    name             TEXT WEIGHT 5.0 SORTABLE
    description      TEXT WEIGHT 1.0
    ownerId          TAG
    price            NUMERIC SORTABLE
    views            NUMERIC SORTABLE
    likes            NUMERIC SORTABLE
    bids             NUMERIC SORTABLE
    createdAt        NUMERIC SORTABLE
    endingAt         NUMERIC SORTABLE
    highestBidUserId TAG
```

→ Search by name/description (full-text). Filter by price/views/etc (range). Filter owner/highestBid (exact tag).

## Tóm tắt bài 2

- `FT.CREATE` với schema = field + type.
- 4 type chính: TEXT, NUMERIC, TAG, GEO. Bonus: VECTOR.
- Options: SORTABLE, NOINDEX, NOSTEM, WEIGHT.
- PREFIX cover keys pattern.
- Index tự maintain. Background indexing.
- Memory ~30-50% data size.

**Bài kế tiếp** → [Bài 3: Numeric queries — range, comparison](03-numeric-queries.md)
