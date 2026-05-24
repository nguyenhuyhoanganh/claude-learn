# Bài 5: Text queries — full-text search

TEXT field là core của RediSearch. Hỗ trợ tokenize, stemming, phrase, boolean. Bài này cover full syntax + BM25 scoring.

## Tokenization

Khi index TEXT field:
```text
HSET items#42 name "Vintage Wooden Piano"
```

RediSearch tokenize:
1. Lowercase: "vintage wooden piano".
2. Split on whitespace/punctuation: ["vintage", "wooden", "piano"].
3. Stem (gốc từ): ["vintag", "wooden", "piano"].

Inverted index lưu:
```text
"vintag" → [items#42, items#88, ...]
"wooden" → [items#42, ...]
"piano"  → [items#42, items#5, ...]
```

→ Search "piano" lookup `posting list` của "piano" → O(1) hash + iterate.

## Single word query

```text
FT.SEARCH idx:items "piano"
```

→ Items có "piano" trong **bất kỳ TEXT field nào**. Default search all TEXT fields.

Limit field:
```text
FT.SEARCH idx:items "@name:piano"
```

→ Chỉ search trong `name` field.

## Multiple words

```text
FT.SEARCH idx:items "vintage piano"
```

→ Items có **cả** "vintage" AND "piano". Default AND.

## OR

```text
FT.SEARCH idx:items "vintage|piano"
```

→ Items có "vintage" OR "piano".

Trong field:
```text
FT.SEARCH idx:items "@name:(vintage|piano)"
```

## Phrase search

Exact phrase với quotes:

```text
FT.SEARCH idx:items '"vintage piano"'
```

→ "vintage piano" liên tiếp, không ngược thứ tự.

So với:
```text
FT.SEARCH idx:items "vintage piano"
```

→ Both words present, không quan tâm thứ tự.

Phrase search dùng position info trong index. Memory tốn hơn → bật khi cần.

## NOT (exclude)

```text
FT.SEARCH idx:items "vintage -damaged"
```

→ Items có "vintage" AND KHÔNG có "damaged".

`-` prefix cho NOT.

## Wildcards / Prefix

```text
FT.SEARCH idx:items "pian*"
```

→ Items có từ bắt đầu bằng "pian" (piano, pianos, pianist, ...).

`*` chỉ ở **cuối**. KHÔNG support `*piano` hoặc `pi*no`.

## Optional terms

```text
FT.SEARCH idx:items "piano ~vintage"
```

→ Match "piano" REQUIRED. "vintage" optional, **boost score** nếu match.

`~` prefix cho optional with score boost.

## Field-level query

```text
FT.SEARCH idx:items "@name:piano @description:wooden"
```

→ name có "piano" AND description có "wooden".

Per-field tách query cho tốt hơn vs global "piano wooden".

## Combining với numeric/tag

```text
FT.SEARCH idx:items "@name:piano @price:[100 500] @tags:{vintage}"
```

3 filter: name TEXT match, price NUMERIC range, tags TAG exact.

## Stemming

Default ON. Stem giúp variant match:

```text
HSET items#42 name "piano"
FT.SEARCH idx "pianos"      # match items#42 (cùng gốc "piano")

HSET items#88 name "running"
FT.SEARCH idx "run"         # match items#88
```

Tắt stem với `NOSTEM`:
```text
FT.CREATE idx SCHEMA name TEXT NOSTEM
```

Use case NOSTEM: technical strings, SKU, exact match yêu cầu.

## Stop words

Words like "a", "the", "of" được skip mặc định:

```text
HSET items#42 name "The Piano"
FT.SEARCH idx "the piano"
# Match (stop word "the" ignored, search "piano")
```

Config stop words:
```text
FT.CREATE idx STOPWORDS 3 a an the SCHEMA ...
FT.CREATE idx STOPWORDS 0 SCHEMA ...     # không stop word
```

## BM25 scoring

RediSearch tính **score** cho mỗi match, sort theo relevance:

```text
FT.SEARCH idx:items "piano" WITHSCORES
1) "47"                ← total
2) "items#42"
3) "12.45"             ← score
4) { ... fields }
5) "items#88"
6) "8.32"
...
```

Cao score = relevant hơn. BM25 considers:
- Term frequency trong document.
- Document length (shorter > longer).
- Term rarity (rare term > common).
- Field weight (WEIGHT trong schema).

Default sort: score DESC.

## Field weight cho relevance

```text
FT.CREATE idx SCHEMA
  name        TEXT WEIGHT 5.0
  description TEXT WEIGHT 1.0
```

Match trong name có score 5x cao hơn match description. → "piano" trong name xếp trên "piano" trong description.

## Phonetic matching

```text
FT.CREATE idx SCHEMA name TEXT PHONETIC dm:en
```

`dm:en` = Double Metaphone English. Match từ phát âm giống:

```text
"smith" matches "smyth"
"piano" matches "piamo"
```

Use case: user name search, music titles.

## Slop — phrase với tolerance

```text
FT.SEARCH idx '"vintage piano"=>{$slop:2}'
```

`$slop:2` = phrase với 2 từ ở giữa OK.

→ Match "vintage wooden italian piano" (2 từ giữa).

Phrase tolerance cho natural language flexibility.

## SUMMARIZE — highlight match

```text
FT.SEARCH idx "piano" SUMMARIZE FIELDS 1 description
```

Return snippet xung quanh match thay vì full description.

```text
"...vintage wooden <b>piano</b> in excellent..."
```

`HIGHLIGHT` để wrap match với HTML tag:
```text
FT.SEARCH idx "piano" HIGHLIGHT TAGS "<b>" "</b>"
```

## INKEYS / INFIELDS — scope search

```text
FT.SEARCH idx "piano" INKEYS 2 items#42 items#88
```

Chỉ search trong specific keys. Hiếm dùng.

```text
FT.SEARCH idx "piano" INFIELDS 1 name
```

Chỉ search trong field name. Tương đương `@name:piano`.

## LANGUAGE — stemmer per language

```text
FT.CREATE idx LANGUAGE french SCHEMA name TEXT
```

Default English. Hỗ trợ Arabic, Chinese (jieba), Spanish, German, ...

Cho Vietnamese: hỗ trợ partial. Có thể disable stem hoặc dùng phonetic.

## Performance tips

1. **Limit fields trong query**: `@name:piano` nhanh hơn `piano` (search all fields).
2. **Add WEIGHT cho field quan trọng**: ranking tốt hơn.
3. **NOSTEM khi không cần**: tiết kiệm index.
4. **STOPWORDS 0** chỉ khi cần exact match common words.

## Complex example

App RB search bar:

User gõ "vintage piano":

```ts
const query = '@name|description:(vintage piano)';
const results = await client.ft.search('idx:items', query, {
  SORTBY: { BY: 'score', DIRECTION: 'DESC' },
  LIMIT: { from: 0, size: 20 },
  RETURN: ['name', 'price', 'imageUrl'],
});
```

→ Search "vintage piano" trong name OR description. Top 20 theo relevance.

Latency: ~5ms cho 1M items.

## So với LIKE SQL

```sql
SELECT * FROM items WHERE name LIKE '%piano%' OR description LIKE '%piano%';
```

vs

```text
FT.SEARCH idx:items "piano"
```

| | SQL LIKE | RediSearch |
|---|---|---|
| Latency 1M rows | 1-10s (sequential scan) | 5-20ms |
| Stemming | KHÔNG | CÓ |
| Phrase | LIKE '%vintage piano%' | "vintage piano" |
| Fuzzy | KHÔNG | CÓ (bài 6) |
| Ranking | KHÔNG | BM25 |

→ RediSearch tốt hơn cho search use case.

## Tóm tắt bài 5

- TEXT tokenized, stemmed, lowercased.
- `word` AND, `|` OR, `-` NOT, `"phrase"`, `prefix*`, `~optional`.
- `@field:term` cho field-specific.
- BM25 scoring + WEIGHT per field.
- Phonetic, slop, summarize cho UX search.
- Sub-ms cho 1M+ items.

**Bài kế tiếp** → [Bài 6: Fuzzy + prefix search](06-fuzzy-prefix.md)
