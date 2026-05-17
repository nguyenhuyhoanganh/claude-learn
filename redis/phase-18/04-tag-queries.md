# Bài 4: Tag queries — categorical filter

TAG field cho exact match trên category. Khác TEXT (full-text), TAG match **token nguyên**. Bài này cover syntax, multi-value, combining với NUMERIC/TEXT.

## TAG vs TEXT

| | TAG | TEXT |
|---|---|---|
| Use case | category, status, ID | free text, name, description |
| Match | exact token | tokenized, stemmed |
| Case | configurable | mặc định lowercase |
| Separator | có (default `,`) | space |
| Fuzzy/prefix | KHÔNG | CÓ |

Ví dụ:
- `tags: vintage, music` → TAG.
- `description: "Vintage piano in good condition"` → TEXT.

## Cú pháp query

```text
@field:{value}
```

Chú ý dấu `{}` cho TAG, khác `[]` của NUMERIC.

```text
FT.SEARCH idx:items "@tags:{vintage}"
```

→ Items có `vintage` trong tags.

## Multi-value field

Store với separator:
```text
HSET items#42 tags "vintage,music,piano"
```

Query single tag:
```text
FT.SEARCH idx:items "@tags:{vintage}"
```

Query multi-tag (OR):
```text
FT.SEARCH idx:items "@tags:{vintage|music}"
```

`|` trong `{}` = OR.

Multi-tag AND:
```text
FT.SEARCH idx:items "@tags:{vintage} @tags:{music}"
```

2 filter, space giữa → AND.

## Schema cho multi-value

```text
FT.CREATE idx:items SCHEMA tags TAG SEPARATOR ","
```

Default separator `,`. Có thể đổi:
```text
tags TAG SEPARATOR "|"
```

Khi separator là `|`:
```text
HSET items#42 tags "vintage|music|piano"
```

## Multiple TAG fields

Item có nhiều category dimensions:

```text
HSET items#42 \
  category "music" \
  color "brown" \
  brand "yamaha"

FT.CREATE idx:items SCHEMA
  category TAG
  color TAG
  brand TAG
```

Filter:
```text
FT.SEARCH idx:items "@category:{music} @color:{brown}"
```

## Case sensitivity

Mặc định TAG **case-insensitive**:

```text
HSET items#42 tags "Vintage"
FT.SEARCH idx "@tags:{vintage}"     # match
FT.SEARCH idx "@tags:{VINTAGE}"     # cũng match
```

Để case-sensitive:
```text
FT.CREATE idx:items SCHEMA tags TAG CASESENSITIVE
```

Use case: SKU code, identifiers.

## Tag với special characters

Một số ký tự cần escape trong query:

```text
HSET items#42 tags "high-end,re-furbished"
FT.SEARCH idx "@tags:{high-end}"     # có thể fail nếu - là special
```

Escape `\`:
```text
FT.SEARCH idx "@tags:{high\\-end}"
```

→ Best practice: avoid special chars trong tag value. Dùng underscore hoặc camelCase.

## Tag wildcards

KHÔNG support wildcard cơ bản (`vintage*`). Nếu cần prefix match → dùng TEXT type.

## Use case: faceted search

E-commerce filter UI:

```text
User chọn:
☑ Category: music
☑ Color: brown
☑ Brand: yamaha
Price range: 100-500

→ FT.SEARCH idx:items 
    "@category:{music} @color:{brown} @brand:{yamaha} @price:[100 500]"
    SORTBY price ASC
    LIMIT 0 20
```

1 query, sub-ms response.

## Combine với NUMERIC

```text
FT.SEARCH idx:items
  "@category:{music|art} @price:[100 500] @views:[100 +inf]"
```

→ Category music OR art, price 100-500, views ≥ 100. AND giữa các field, OR trong tag value.

## TAG cho status / state

```text
HSET items#42 status "active"     # active, paused, sold, expired
FT.SEARCH idx "@status:{active}"
```

Filter chỉ active items. Trade-off vs Set `active_items` (manually maintained):
- TAG: tự update khi HSET status thay đổi.
- Set: manual SADD/SREM.

TAG win cho dynamic data.

## Sort theo TAG

Cần `SORTABLE`:

```text
FT.CREATE idx:items SCHEMA category TAG SORTABLE

FT.SEARCH idx "*" SORTBY category ASC
```

Sort alphabetically theo tag value đầu tiên. Hơi khó dùng với multi-value.

→ Hiếm sort theo TAG. Thường sort theo NUMERIC.

## TAG cho exact-match ID

Khi cần "items của user X":

```text
HSET items#42 ownerId "user-abc-123"
FT.CREATE idx:items SCHEMA ownerId TAG

FT.SEARCH idx "@ownerId:{user-abc-123}"
```

Tương đương `SMEMBERS items:by-owner#user-abc-123` (Set manual index), nhưng:
- ✓ Không cần maintain Set.
- ✓ Combine với filter khác trong 1 query.

## TAG với underscore-replacement

Nếu tag có space:

```text
HSET items#42 brand "yamaha music"
```

Search:
```text
FT.SEARCH idx "@brand:{yamaha music}"
```

→ Có thể fail vì space được parse khác. Solution: replace space với underscore:

```text
HSET items#42 brand "yamaha_music"
FT.SEARCH idx "@brand:{yamaha_music}"
```

Phía UI: hiển thị "yamaha music", phía storage: "yamaha_music".

## Aggregate trên TAG

Count items per category:

```text
FT.AGGREGATE idx:items "*"
  GROUPBY 1 @category
  REDUCE COUNT 0 AS total
  SORTBY 2 @total DESC
```

Result: list of (category, count) sorted by count.

```text
1) "music"        2) 1234
3) "art"          4) 987
5) "books"        6) 543
```

→ Tabulate ngang SQL `GROUP BY`. Fast.

## Pattern: Multi-tag intersection

Trước có RediSearch, multi-tag intersection dùng SINTER:

```text
SADD items:tag:vintage items#1 items#5 items#7
SADD items:tag:music items#5 items#7 items#9
SINTER items:tag:vintage items:tag:music    → items#5, items#7
```

RediSearch đơn giản hơn:
```text
FT.SEARCH idx "@tags:{vintage} @tags:{music}"
```

→ Cùng kết quả. Plus support sort + limit + return fields.

## Filter cho không-tag

Items KHÔNG có tag specific:

```text
FT.SEARCH idx "-@tags:{archived}"
```

→ NOT archived. `-` cho NOT.

Items không có tags nào (NULL):
```text
FT.SEARCH idx "-@tags:{*}"
```

`{*}` = any tag value. NOT any = no tag.

## Performance

TAG queries cực nhanh:
- Index TAG dùng inverted index per value.
- Lookup: O(1) hash + iterate posting list.
- 1M items × 5 tags avg → search 1 tag ~1ms.

→ TAG efficient cho exact match. Tuyệt vời cho facet filter.

## Best practice

1. **TAG cho discrete values** (< 1000 unique values). Nhiều unique → TEXT hoặc khác.
2. **Lowercase normalize** trước HSET, trừ khi CASESENSITIVE.
3. **Avoid special chars** trong tag value.
4. **Combine với NUMERIC** cho faceted search.
5. **SORTABLE nếu cần sort** (hiếm).

## Tóm tắt bài 4

- TAG cho exact match category. Cú pháp `@field:{value}`.
- Multi-value với separator (default ","). OR với `|`.
- Multiple TAG fields = faceted search.
- Default case-insensitive. CASESENSITIVE để strict.
- Aggregate qua TAG cho count per category.
- Nhanh, tuyệt vời cho filter UI.

**Bài kế tiếp** → [Bài 5: Text queries — full-text search](05-text-queries.md)
