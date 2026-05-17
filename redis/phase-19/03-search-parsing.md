# Bài 3: Search parsing — từ raw input tới RediSearch query

User gõ "Vintage Piano!" → app phải tạo query RediSearch hợp lệ. Bài này implement pipeline: sanitize → tokenize → build query với field weights.

## Pipeline

```text
Raw input "Vintage Piano!"
   │
   ▼ sanitize (remove special chars)
"vintage piano"
   │
   ▼ tokenize
["vintage", "piano"]
   │
   ▼ remove stop words
["vintage", "piano"]
   │
   ▼ build query với field weight
"(@name:(vintage piano) => {$weight: 5.0}) | (@description:(vintage piano))"
   │
   ▼ FT.SEARCH
Results
```

## Sanitize function

```ts
// src/services/queries/items/search-parsing.ts

const SPECIAL_CHARS_REGEX = /[@:{}[\]|"'\\()\-+~&=<>*%]/g;
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'and', 'or',
  'is', 'are', 'was', 'were', 'be', 'been',
]);

export function sanitizeInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(SPECIAL_CHARS_REGEX, ' ')
    .replace(/\s+/g, ' ');
}

export function tokenize(cleaned: string): string[] {
  if (!cleaned) return [];
  return cleaned.split(' ').filter((w) => w.length > 0 && !STOP_WORDS.has(w));
}
```

Test:
```ts
sanitizeInput("Vintage Piano! @price[100");
// "vintage piano price 100"

tokenize("vintage piano");
// ["vintage", "piano"]

tokenize("the vintage piano");
// ["vintage", "piano"]   ← "the" removed
```

## Build query with field weights

```ts
export function buildQuery(words: string[]): string {
  if (words.length === 0) return '';
  
  // Each word: match exact + prefix
  const wordParts = words.map((w) => {
    if (w.length >= 4) {
      return `(${w} | %${w}%)`;     // exact OR fuzzy
    }
    return w;
  });
  
  const wordsQuery = wordParts.join(' ');
  
  // Apply 5x weight to name match
  return `(@name:(${wordsQuery}) => { $weight: 5.0 }) | (@description:(${wordsQuery}))`;
}
```

Output:
```text
(@name:((vintage | %vintage%) (piano | %piano%)) => { $weight: 5.0 }) | (@description:((vintage | %vintage%) (piano | %piano%)))
```

Đọc trái sang phải:
1. `@name:(...)` — search trong name.
2. `=> { $weight: 5.0 }` — weight x5 nếu match name.
3. `|` — OR.
4. `@description:(...)` — fallback search description.

→ Items có "vintage piano" trong name xếp cao hơn items có "vintage piano" trong description.

## Why field weight is important

Without weight:
```text
@name|description:(piano)
```

Item A: name="Vintage Piano", description="Made of wood".  
Item B: name="Wooden Stuff", description="Piano accessories piano".

BM25 score:
- A: "piano" in name (1 match in 2 words).
- B: "piano" in description (2 matches in 3 words).

→ B có thể score cao hơn A vì frequency cao trong description.

With weight 5x cho name:
- A: 5x boost vì match in name.
- A xếp cao hơn B.

→ Match user expectation ("piano" search nên ưu tiên item piano).

## Full pipeline function

```ts
export function parseSearchInput(rawInput: string): string | null {
  const cleaned = sanitizeInput(rawInput);
  const words = tokenize(cleaned);
  
  if (words.length === 0) return null;     // không có gì để search
  if (words.length > 20) return null;       // quá nhiều words
  
  return buildQuery(words);
}
```

Caller:
```ts
const query = parseSearchInput(rawInput);
if (!query) return [];

const results = await client.ft.search('idx:items', query, {
  LIMIT: { from: 0, size: 20 },
});
```

## Edge case: special chars trong tên item

User search literal `"O'Reilly"`. Sanitize:
```text
"O'Reilly" → "o reilly" → ["o", "reilly"]
```

→ Match "Reilly" (item có "reilly" trong name). Lost `'`.

Trade-off: chấp nhận. Hoặc dùng `escape` thay vì remove (đã đề cập phase 18 bài 7). Phức tạp hơn.

## Edge case: search by exact name

User muốn tìm chính xác "Piano Steinway":

```ts
function parseExactPhrase(rawInput: string): string | null {
  const cleaned = sanitizeInput(rawInput);
  if (!cleaned) return null;
  
  return `@name:"${cleaned}"`;    // phrase search
}
```

→ Match exactly "piano steinway" liên tiếp. Khác phrase tự nhiên.

UI: user click "Exact match" checkbox → dùng phrase mode.

## Multi-language input

App có user Vietnam gõ "phở":

```ts
const cleaned = sanitizeInput("phở");
// "phở" (giữ nguyên, chỉ remove special chars)
```

RediSearch language=english stem "phở" — không hiểu Vietnamese.

Workarounds:
1. **Diacritic strip** (như phase 18 bài 7) — index "pho", search "pho".
2. **Multiple indexes** per language.
3. **Disable stem** (NOSTEM trong schema) — pure exact match.

App RB chấp nhận English-first cho khoá học.

## Recent searches tracking

```ts
async function trackSearch(userId: string, query: string) {
  await client.lPush(`recent_searches:${userId}`, query);
  await client.lTrim(`recent_searches:${userId}`, 0, 9);    // 10 gần nhất
}

async function getRecentSearches(userId: string): Promise<string[]> {
  return await client.lRange(`recent_searches:${userId}`, 0, -1);
}
```

UI: dropdown gợi ý "recent searches" khi focus.

## Popular searches (global)

```ts
async function trackSearchGlobal(query: string) {
  await client.zIncrBy('popular_searches', 1, query);
}

async function getPopularSearches(limit = 10): Promise<string[]> {
  return await client.zRange('popular_searches', 0, limit - 1, { REV: true });
}
```

Sorted set với score = count. Top N most searched.

UI: "Trending searches" tab.

## Tóm tắt bài 3

- Pipeline: sanitize → tokenize → remove stop words → build query.
- Build query với 5x weight cho name → relevance đúng.
- Pattern `(@name:... => {$weight: 5.0}) | (@description:...)` cho field bias.
- Edge cases: special chars trong name, multi-language, exact phrase.
- Track recent + popular searches qua List + Sorted Set.

**Bài kế tiếp** → [Bài 4: Execute search + parse results](04-execute-search.md)
