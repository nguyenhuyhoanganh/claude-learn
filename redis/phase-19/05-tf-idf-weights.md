# Bài 5: TF-IDF + field weights — hiểu BM25 ranking

RediSearch dùng **TF-IDF** (variant BM25) để score relevance. Hiểu thuật toán → biết cách tune. Bài này giải thích, kèm example cụ thể app RB.

## TF-IDF — basics

**TF** (Term Frequency): từ search xuất hiện bao nhiêu lần trong document, divided by total words.

```text
Document 1: "good fruit excellent fruit something fruit"
TF("fruit") = 3 / 6 = 0.5
```

**IDF** (Inverse Document Frequency): độ "rare" của từ trong toàn collection.

```text
Total docs: 1000
Docs containing "fruit": 50
IDF = log(1 + 1000 / 50) = log(21) ≈ 3.04

Total docs: 1000
Docs containing "the": 1000  
IDF = log(1 + 1000 / 1000) = log(2) ≈ 0.69
```

→ Từ rare ("fruit") có IDF cao. Từ phổ biến ("the") có IDF thấp.

**Score** = TF × IDF, sum cho mọi term trong query.

## Example tính tay

Documents:
1. "Good fruit excellent fruit something fruit"
2. "Some good fruit"

Search: "fruit"

**Document 1**:
- TF: 3 / 6 = 0.5
- IDF: log(1 + 2/2) = log(2) ≈ 0.69
- Score = 0.5 × 0.69 ≈ 0.346

**Document 2**:
- TF: 1 / 3 = 0.33
- IDF: log(1 + 2/2) = log(2) ≈ 0.69
- Score = 0.33 × 0.69 ≈ 0.231

→ Document 1 score cao hơn, xếp trên.

## BM25 — modern variant

RediSearch dùng BM25, refinement của TF-IDF:

- **Saturate TF**: từ xuất hiện 10 lần vs 5 lần không gấp đôi importance. Saturate ở "diminishing returns".
- **Document length normalization**: short docs match weights more (concentrated info).
- **Tuning parameters** (k1, b): default values work well.

Algorithm:
```text
score = IDF × (TF × (k1 + 1)) / (TF + k1 × (1 - b + b × dl/avgdl))
```

Magic numbers — RediSearch tinh chỉnh. Bạn chỉ cần biết: **rare terms + concentrated matches = high score**.

## Field weights — adjust per field

App RB: muốn match trong name xếp trên match trong description.

```text
FT.CREATE idx SCHEMA
  name TEXT WEIGHT 5.0     # 5x importance
  description TEXT WEIGHT 1.0
```

→ Score khi match name = score nature × 5.

Without weight: items có "chair" trong description (lots of occurrences) score cao.  
With weight 5x: items có "chair" trong name (boosted) score cao hơn.

## Per-query weight

Có thể set weight per-query, override schema:

```text
FT.SEARCH idx "(@name:chair => {$weight: 10.0}) | (@description:chair)"
```

`=> {$weight: 10.0}` boost 10x cho `@name:chair` match. Override schema's WEIGHT 5.0.

Use case:
- Schema default cho generic search.
- Specific feature (vd "items by brand") boost mạnh hơn cho name.

## Multi-term query — score sum

Search "vintage piano":

```text
FT.SEARCH idx "vintage piano"
```

Internally:
- Match "vintage" → score_a.
- Match "piano" → score_b.
- Total score = score_a + score_b.

Items có cả 2 score cao hơn items chỉ có 1.

## TF-IDF với weighted multi-term

Search "(vintage piano) => {$weight: 2.0}":

```text
score = 2.0 × (score_vintage + score_piano)
```

Boost cả 2 terms cùng lúc.

## Apply cho app RB

Schema cuối cùng:
```text
name TEXT WEIGHT 5.0 SORTABLE
description TEXT WEIGHT 1.0
```

Query:
```ts
function buildQuery(words: string[]): string {
  const wordsStr = words.join(' ');
  return `(@name:(${wordsStr}) => { $weight: 5.0 }) | (@description:(${wordsStr}))`;
}
```

→ Cả schema-level weight (5x for name) và query-level weight (additional 5x). Total 25x boost cho name match.

Test:
- Item A: name="Vintage Chair", desc="Wooden".  
- Item B: name="Wooden Stuff", desc="Vintage chair vintage chair vintage chair".

Search "vintage chair":
- A: name match boosted 25x → high score.
- B: description match × 1x, frequency cao → moderate score.

→ A xếp trên B. Đúng expectation.

## Score visualization

`FT.SEARCH ... WITHSCORES` để xem score thực:

```text
FT.SEARCH idx:items "chair" WITHSCORES LIMIT 0 3

1) (integer) 47
2) "items#abc"
3) "12.45"            ← score
4) { name, description, ... }
5) "items#xyz"
6) "8.30"
7) { ... }
8) "items#qwe"
9) "5.12"
10) { ... }
```

→ Score from highest to lowest. Default sort. Có thể compare để debug.

## EXPLAIN — execution plan

```text
FT.EXPLAIN idx:items "(@name:chair => {$weight: 5.0}) | (@description:chair)"
```

Return parse tree + execution plan:
```text
UNION {
  INTERSECT WITH WEIGHT 5.0 {
    @name:UNION {
      chair
    }
  }
  INTERSECT {
    @description:UNION {
      chair
    }
  }
}
```

→ Hiểu Redis sẽ làm gì. Debug slow query.

## PROFILE — actual performance

```text
FT.PROFILE idx:items SEARCH QUERY "chair"
```

Return:
- Execution time per stage.
- Number of records examined.
- Bottleneck.

Hữu ích khi query slow — biết phần nào cần optimize.

## Common tune parameters

### Tăng weight cho name nếu thấy description dominate:
```text
WEIGHT 10.0
```

### Giảm weight cho description nếu noise:
```text
description TEXT WEIGHT 0.5
```

### Add NOSTEM cho exact match:
```text
name TEXT NOSTEM
```

Trade-off: lose plural/conjugation matching.

## A/B test ranking

Production: deploy 2 versions ranking, split traffic:

```ts
const useNewRanking = userId.endsWith('1') || userId.endsWith('2');
const query = useNewRanking
  ? buildQueryV2(words)
  : buildQueryV1(words);
```

Track:
- Click-through rate per ranking.
- Time-to-first-click.
- Conversion (user click → bid).

Pick ranking với metric tốt hơn.

## Edge case: rare query terms

Search "obscure_technical_term_xyz":
- TF cao trong doc match (rare).
- IDF cao (rare globally).
- Score cao → match đúng items.

→ TF-IDF tự nhiên handle rare terms tốt.

## Edge case: very common terms

Search "the chair":
- "the" có IDF rất thấp (everywhere).
- "chair" có IDF normal.

→ Score dominate by "chair". "the" gần như không count. Tốt.

Plus, "the" thường là stop word → loại trước search.

## Tóm tắt bài 5

- BM25 = improved TF-IDF với saturation + length normalization.
- Schema WEIGHT cho field bias permanent.
- Per-query weight `=> {$weight: N}` cho dynamic boost.
- App RB: name 5x cho relevance ưu tiên name.
- EXPLAIN cho execution plan. PROFILE cho performance.
- A/B test ranking với real metrics.

**Bài kế tiếp** → [Bài 6: Sorting + searching kết hợp](06-sorting-searching.md)
