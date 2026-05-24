# Bài 6: Fuzzy + prefix search

Bài 5 đã đề cập prefix (`pian*`) sơ. Bài này đi sâu vào fuzzy (typo tolerance) và prefix matching cho autocomplete UX.

## Fuzzy search

User gõ "piamo" (typo cho "piano"). Match được không?

```text
FT.SEARCH idx:items "%piamo%"
```

`%word%` = fuzzy match với edit distance 1.

`%%word%%` = edit distance 2.

`%%%word%%%` = edit distance 3 (max).

### Edit distance là gì?

Số character transformations (insert, delete, substitute) để biến A thành B.

```text
"piano" ↔ "piamo": substitute 1 char (n→m) = distance 1.
"piano" ↔ "pian":  delete 1 char = distance 1.
"piano" ↔ "pianno": insert 1 char = distance 1.
"piano" ↔ "pano":  delete 1 char = distance 1.
```

Distance 1 cover most typos. Distance 2 cover bigger typos. Distance 3 risky (false positives).

### Trade-off fuzzy

- ✓ Tolerance user typo.
- ✗ Slower hơn exact (~3-5x).
- ✗ False positives với short words ("a" match nhiều thứ).
- ✗ Less relevant ranking.

Best practice:
- **Distance 1** cho words ≥ 4 char.
- **Skip fuzzy** cho words < 4 char (high false positive).
- Cache common fuzzy results.

### Combine fuzzy với regular

```text
FT.SEARCH idx '"%piamo%" %vintag%'
```

→ Fuzzy "piamo" AND fuzzy "vintag". Match items có piano + vintage (cả 2 với typo).

## Prefix search

```text
FT.SEARCH idx "pian*"
```

→ Match words bắt đầu bằng "pian" (piano, pianist, pianos).

### Cú pháp

```text
prefix*
```

Wildcard `*` chỉ ở **cuối**, không giữa hay đầu.

KHÔNG support:
- `*piano` (suffix search).
- `pi*no` (middle wildcard).
- `pi?no` (single char wildcard).

→ Limitation. Cho suffix search, dùng reverse index trick (lưu reverse string) hoặc external solution.

### Use case: autocomplete

User gõ "pi" → suggest items có "piano", "pianist", "pickup", ...

```ts
async function autocomplete(prefix: string, limit = 10) {
  if (prefix.length < 2) return [];     // skip 1-char
  
  const result = await client.ft.search(
    'idx:items',
    `@name:${prefix}*`,
    {
      LIMIT: { from: 0, size: limit },
      RETURN: ['name'],
    }
  );
  return result.documents.map((d) => d.value.name);
}
```

→ Type-ahead suggestion. Sub-ms latency.

### Prefix với MINPREFIX

Default min prefix length = 2 chars. Để cho phép 1-char prefix:

```text
FT.CONFIG SET MINPREFIX 1
```

Trade-off: 1-char prefix match nhiều (vd "a*" match "alice", "apple", ..., 1000s items) → slow.

### Prefix với MAXEXPANSIONS

Default = 200. Prefix expand thành max 200 unique tokens.

```text
FT.SEARCH idx "pian*"
# RediSearch tìm 200 unique words bắt đầu "pian"
# Vd: piano, pianos, pianist, pianoforte, pianissimo, ...
```

Nếu hơn 200, chỉ search 200 đầu. Tăng:

```text
FT.CONFIG SET MAXEXPANSIONS 500
```

Tốn CPU. Default thường đủ.

## Suffix wildcard với reverse trick

Cần "*piano" → use case không phổ biến, có workaround:

```text
# Lưu reverse string trong field riêng
HSET items#42 name "Piano" nameReverse "onaip"

# Search "*piano" tương đương "onaip*" trên nameReverse
FT.SEARCH idx "@nameReverse:onaip*"
```

Hack hơi xấu. Đa số case không cần.

## Levenshtein distance vs Phonetic

| | Fuzzy (Levenshtein) | Phonetic (Double Metaphone) |
|---|---|---|
| Match | Edit distance | Phát âm giống |
| "piano"/"piamo" | Match (dist 1) | Match (P-N-O ≈ P-M-O không match) |
| "smith"/"smyth" | Match | Match |
| "blue"/"glue" | Match (dist 1) | KHÔNG (phát âm khác) |

→ Fuzzy cho typo. Phonetic cho name/sound. Có thể combine.

```text
FT.CREATE idx SCHEMA name TEXT PHONETIC dm:en

FT.SEARCH idx "smyth"      # phonetic match "smith"
FT.SEARCH idx "%smyth%"    # fuzzy + phonetic combined
```

## Practical: search bar implementation

App RB search bar handle: typo, prefix, multiple words.

```ts
async function searchItems(rawQuery: string, limit = 20) {
  const cleaned = sanitize(rawQuery);    // remove special chars (bài 7)
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  
  if (words.length === 0) return [];
  
  // Build query: each word with fuzzy + prefix
  const parts = words.map((w) => {
    if (w.length >= 4) {
      return `(%${w}% | ${w}*)`;    // fuzzy OR prefix
    } else if (w.length >= 2) {
      return `${w}*`;                 // chỉ prefix cho short
    } else {
      return w;                       // 1 char: exact
    }
  });
  const query = `@name|description:(${parts.join(' ')})`;
  
  return await client.ft.search('idx:items', query, {
    LIMIT: { from: 0, size: limit },
    RETURN: ['name', 'price', 'imageUrl'],
  });
}
```

→ Search robust: typo + autocomplete + multi-word.

## Performance gotchas

### Fuzzy slow

Fuzzy traverses index nhiều hơn exact. P99 có thể 3-5x p50.

Mitigation:
- Cache common queries (LRU cache 5 phút).
- Limit query length (≤ 50 chars).
- Skip fuzzy cho short words (< 4 chars).

### Prefix với common prefix

```text
FT.SEARCH idx "a*"     # match thousands of words
```

→ Expand thousands tokens, OR all. Slow.

Mitigation: increase MINPREFIX hoặc reject prefix < N chars trong app.

### Combine cả 2

```text
FT.SEARCH idx "%pian% pian*"
```

Vừa fuzzy vừa prefix → slower. Cẩn thận với traffic cao.

## So với search engines khác

| | RediSearch | Elasticsearch | Algolia |
|---|---|---|---|
| Fuzzy | Distance 1-3 | Configurable + AND/OR | Aggressive default |
| Prefix | Suffix `*` only | Wildcards full | Yes |
| Phonetic | Double Metaphone | Multiple algos | Yes |
| Typo tolerance UX | Manual config | Automatic suggestions | Automatic |

→ RediSearch đủ cho 80% case. Algolia/ES tốt hơn cho search UX cực mượt nhưng phức tạp + tốn $$.

## Best practices

1. **Length-based strategy**: fuzzy chỉ khi ≥ 4 chars, prefix ≥ 2 chars.
2. **Combine intelligently**: short → prefix only, long → fuzzy + prefix.
3. **Cache popular queries**: search "iphone" có thể là 10% traffic.
4. **Test with real queries**: dùng analytics để hiểu user behavior.
5. **A/B test** với fuzzy vs không — đo conversion rate.

## Tóm tắt bài 6

- `%word%` fuzzy distance 1. `%%` distance 2. `%%%` distance 3.
- `word*` prefix match. Wildcard ở cuối only.
- Fuzzy slow hơn exact ~3-5x.
- Combine `%word%* | word*` cho robust search.
- Phonetic match phát âm. Useful cho name.
- Cache popular queries cho performance.

**Bài kế tiếp** → [Bài 7: Pre-processing search input — sanitize + escape](07-pre-processing.md)
