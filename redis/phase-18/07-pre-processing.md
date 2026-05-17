# Bài 7: Pre-processing search input — sanitize + escape

User input cho search bar luôn cần xử lý trước khi gửi tới RediSearch. Bài này cover: escape special chars, normalize whitespace, handle edge cases. Đây là **security + UX critical**.

## Tại sao cần pre-processing?

User input raw: `"piano @price[100"`.

Gửi thẳng tới `FT.SEARCH`:
```text
FT.SEARCH idx "piano @price[100"
(error) Syntax error
```

→ Special chars `@`, `[`, `:` của RediSearch syntax. Input chứa = parse error hoặc unexpected results.

Pre-processing đảm bảo:
1. **No syntax error**: app không crash với input lạ.
2. **No injection**: user không bypass filter bằng special chars.
3. **Better UX**: normalize cho match consistent.

## Special chars trong RediSearch

```text
@  →  field prefix
:  →  field separator
{  }  →  TAG marker
[  ]  →  NUMERIC range
|  →  OR
"  →  phrase
'  →  phrase alt
\  →  escape
(  )  →  grouping
*  →  wildcard
%  →  fuzzy marker
-  →  NOT prefix
~  →  optional
+  →  required (deprecated)
&  →  AND alt
=  →  filter
>  <  →  numeric comparison (Redis 7.4+)
```

Tất cả cần escape khi user gõ literal.

## Sanitize function cơ bản

```ts
function sanitizeSearchInput(input: string): string {
  // 1. Trim whitespace
  let cleaned = input.trim();
  
  // 2. Replace special chars with space (hoặc remove)
  cleaned = cleaned.replace(/[@:{}[\]|"'\\()\-+~&=<>*%]/g, ' ');
  
  // 3. Normalize multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // 4. Lowercase (optional, RediSearch tự lowercase)
  cleaned = cleaned.toLowerCase();
  
  return cleaned;
}
```

Cách dùng:
```ts
const userQuery = "piano @price[100";
const safe = sanitizeSearchInput(userQuery);
// "piano price 100"

await client.ft.search('idx', `@name:(${safe})`);
```

## Escape thay vì remove

Thay vì xoá, escape với `\`:

```ts
function escapeSearchInput(input: string): string {
  return input.replace(/([@:{}[\]|"'\\()\-+~&=<>*%])/g, '\\$1');
}
```

```ts
escapeSearchInput("piano @price[100")
// "piano \\@price\\[100"
```

→ Match literal `@` và `[`. Hữu ích khi user tìm tên chứa special chars (vd email).

Trade-off: complex hơn, nhưng giữ user intent.

## Tokenize input thành words

```ts
function tokenize(input: string): string[] {
  const cleaned = sanitizeSearchInput(input);
  return cleaned.split(' ').filter((w) => w.length > 0);
}
```

Sau đó build query từ tokens:

```ts
function buildQuery(words: string[]): string {
  if (words.length === 0) return '';
  
  // Mỗi word: fuzzy + prefix nếu đủ dài
  const parts = words.map((w) => {
    if (w.length >= 4) return `(%${w}% | ${w}*)`;
    if (w.length >= 2) return `${w}*`;
    return w;
  });
  
  return parts.join(' ');
}

const query = buildQuery(tokenize(userInput));
await client.ft.search('idx', `@name|description:(${query})`);
```

## Stop words handling

User có thể gõ "the piano":

```ts
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'and', 'or',
  'is', 'are', 'was', 'were', 'be', 'been',
]);

function removeStopWords(words: string[]): string[] {
  return words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
}
```

→ "the piano" → ["piano"]. Tránh search "the" match all documents.

Note: RediSearch có built-in stop words. Nhưng xử lý ở app side cho consistent.

## Min/Max length

```ts
function isValidQuery(input: string): boolean {
  const cleaned = sanitizeSearchInput(input);
  if (cleaned.length < 2) return false;       // quá ngắn
  if (cleaned.length > 200) return false;     // quá dài
  
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length === 0) return false;
  if (words.length > 20) return false;        // quá nhiều words
  
  return true;
}
```

→ Reject input invalid early. Trả empty results hoặc UX error message.

## Locale-specific normalization

### Unicode normalization

```ts
function normalize(input: string): string {
  return input.normalize('NFKC');     // decompose + canonical
}
```

→ "Café" và "Café" (e + combining acute) → cùng form.

### Diacritics handling

User search "cafe" → match "café"?

```ts
function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
```

→ "café" → "cafe". Cho diacritic-insensitive search.

Recommend: lưu cả 2 version trong hash → index both → match either.

### Vietnamese

Vietnamese có tone marks. Search "phở" có match "pho"?

```ts
const VI_MAP = {
  'à á ả ã ạ â ầ ấ ẩ ẫ ậ ă ằ ắ ẳ ẵ ặ': 'a',
  'đ': 'd',
  'è é ẻ ẽ ẹ ê ề ế ể ễ ệ': 'e',
  // ... full map
};
function deAccent(input: string): string {
  // Replace mỗi char Vietnamese với base ASCII
  // ...
}
```

Lib: `unidecode` (npm).

Pattern: store cả 2 (`name` original, `nameAscii` no-diacritic). User input → ascii → search `nameAscii`. Cho UX search "pho" match "phở".

## Full pipeline

```ts
async function searchItems(rawInput: string, limit = 20) {
  // 1. Validate
  if (!isValidQuery(rawInput)) return [];
  
  // 2. Sanitize
  const cleaned = sanitizeSearchInput(rawInput);
  
  // 3. Normalize
  const normalized = stripDiacritics(normalize(cleaned));
  
  // 4. Tokenize
  let words = normalized.split(/\s+/).filter(Boolean);
  
  // 5. Remove stop words
  words = removeStopWords(words);
  if (words.length === 0) return [];
  
  // 6. Build query
  const parts = words.map((w) => {
    if (w.length >= 4) return `(%${w}% | ${w}*)`;
    return `${w}*`;
  });
  const query = `@name|description:(${parts.join(' ')})`;
  
  // 7. Execute
  try {
    return await client.ft.search('idx:items', query, {
      LIMIT: { from: 0, size: limit },
      RETURN: ['name', 'price', 'imageUrl'],
    });
  } catch (err) {
    console.error('Search error:', err, 'Query:', query);
    return [];
  }
}
```

→ Robust search pipeline. Handle mọi input.

## Logging + analytics

Track:
- Input raw, sanitized, final query.
- Response time.
- Number of results.
- Click-through rate (which result user clicked).

→ Optimize search relevance dựa trên data thực.

## Security: prevent abuse

```ts
function rateLimitSearch(userId: string): boolean {
  // Allow 100 searches per minute per user
  const key = `rate:search:${userId}:${Math.floor(Date.now() / 60000)}`;
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, 60);
  return count <= 100;
}
```

→ Tránh DOS bằng search spam.

## Cache popular queries

```ts
async function cachedSearch(query: string) {
  const cacheKey = `cache:search:${createHash('md5').update(query).digest('hex')}`;
  
  const cached = await client.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  const result = await client.ft.search(/* ... */);
  await client.set(cacheKey, JSON.stringify(result), { EX: 300 });    // 5min
  
  return result;
}
```

→ Top 10% queries account 80% traffic. Cache giảm load.

## Suggestion với typo tolerance

User gõ "pianoo" → suggest "Did you mean: piano?"

```ts
async function suggest(input: string): Promise<string | null> {
  // 1. Search exact, count
  const exact = await client.ft.search('idx:items', input, { LIMIT: { from: 0, size: 1 } });
  if (exact.total > 0) return null;    // có results, không suggest
  
  // 2. Search fuzzy
  const fuzzy = await client.ft.search('idx:items', `%${input}%`, { LIMIT: { from: 0, size: 1 } });
  if (fuzzy.total === 0) return null;
  
  // 3. Get top fuzzy result's name → suggest
  const topName = (fuzzy.documents[0]?.value as any)?.name;
  return topName?.split(' ')[0] || null;
}
```

→ UX search "Did you mean..." như Google.

## Tóm tắt bài 7

- Special chars (`@`, `:`, `[`, `|`, ...) cần sanitize hoặc escape.
- Sanitize: remove/replace, normalize whitespace, lowercase.
- Tokenize → build query per word với fuzzy/prefix.
- Stop words removal cho relevance.
- Min/max length validation.
- Locale: Unicode normalization, diacritic handling.
- Cache + rate limit cho performance + security.

## Tóm tắt phase-18

Đã học toàn bộ RediSearch:
- **Modules + overview** (Bài 1).
- **Tạo index + field types** (Bài 2).
- **Numeric queries** (Bài 3).
- **Tag queries** (Bài 4).
- **Text queries + BM25** (Bài 5).
- **Fuzzy + prefix** (Bài 6).
- **Pre-processing input** (Bài 7).

Đủ knowledge để build full search bar cho app. Phase 19 sẽ implement thực vào app RB.

**Phase tiếp theo** → [Phase-19 — Bài 1: Implement search trong app RB](../phase-19/01-search-implementation.md)
