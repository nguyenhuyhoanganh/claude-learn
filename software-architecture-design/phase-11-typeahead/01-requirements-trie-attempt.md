# Bài 1: Typeahead — Requirements + Trie First Attempt

Google Search type-ahead = mỗi character typed → suggestion appears trong ~50ms. Đây là feature **deceptively simple** mà engineer hay design wrong. Bài này lock requirements, dùng trie data structure như "natural choice" — rồi show **why trie không scale** ở billion-query scale. Lesson quan trọng: **textbook data structure tốt cho small scale, fail ở Google scale**. Đây là setup cho CQRS solution bài 2.

## Lịch sử

```text
2004: Google engineer Kevin Gibbs builds "Google Suggest"
      as 20% time side project
2008: becomes default Google Search behavior
Today: every search box on web has it

Saves users millions of typing hours per year.
```

Variation of this problem comes up **constantly in system design interviews**. Mastering this = mastering CQRS + MapReduce + sharding.

## Step 1: Functional requirements

### Clarifying questions

```text
- Criteria for suggestions: trending? popular? personalized?
- Spell checking + typo correction?
- How many suggestions per query?
- Languages supported?
- Max prefix length we serve?
- Search engine itself in scope?
```

### Locked scope

```text
[Functional]
✓ Suggest 10 results as user types each character
✓ Based on most popular queries in last 24 hours
✓ Support English alphabet
✓ Max prefix length: 60 characters
✗ Spell check / typo correction (out of scope)
✗ Personalized suggestions (out of scope)
✗ Actual search engine (out of scope — assume exists)

[Behavior]
- Empty result OK if prefix has no popular queries (no spell suggest)
- Suggestions case-insensitive (treat "Olive" same as "olive")
- Results sorted by popularity descending
```

## Step 2: Non-functional requirements

### Scale

```text
- Billions of search queries daily
- Each search query: avg 30 chars
- Each user types ~5-10 characters before picking suggestion
- → 10B queries × 5 chars avg = 50B typeahead requests/day
- Peak QPS: ~1M typeahead requests/sec
```

### Latency — Critical

```text
[Why brutal target]
Average typing speed: 50 WPM (above average)
= 250 chars/min
= 4 chars/second
= one new character every 250ms

If typeahead response > 240ms:
- Late vs typing speed
- User finishes typing before suggestion shows
- Feature useless

[Target]
P99 < 240ms for typeahead response

[Comparison]
Page load: 500ms OK
Messaging: 1000ms OK
Typeahead: 240ms MAX → strictest budget in this course
```

### Consistency

```text
[Allowed staleness]
- Suggestions can be up to 1 hour out of date
- "Trending now" doesn't need to be real-time
- Today's #1 query might lag behind by an hour

[Cross-user consistency]
- Eventually consistent OK
- Two users typing same prefix can see slightly different order
- Trade for performance

[Why looser consistency works]
- Top-10 popular queries don't change fast
- Yesterday's top-10 likely overlaps with today's
- 1 hour lag = imperceptible to users
```

## Step 3: API

Simple REST.

### Endpoint 1: Autocomplete

```text
GET /api/v1/complete?q=ho

Response: 200 OK
[
  "how to open a jar",
  "how to tie a tie",
  "how old is the universe",
  ...
]
```

Notes:
- Plain GET, no body
- URL-encode special chars (spaces → %20)
- Lowercase normalize server-side
- No auth required (public)

### Endpoint 2: Search

```text
GET /api/v1/search?q=how%20to%20open%20a%20jar

Response: 200 OK
{
  results: [...],
  facets: [...]
}
```

Notes:
- This is the actual search (out of scope for our design)
- BUT this endpoint also **logs** the query for analytics
- Side effect: updates our autocomplete training data

## Step 4: First attempt — Trie

Whenever you see "prefix-based lookup", textbook answer is **trie** (lexical prefix tree).

### How trie works

```text
Insert words: bat, bad, better

           [root]
              │
              b
              │
        ┌─────┴─────┐
        a           e
        │           │
        t          tter
       (leaf)    ┌──┴──┐
                d      tter
              (leaf)  (leaf)

Each path = a stored word.
Each node = single character.
Branching factor: up to 26 (a-z).
```

### Lookup operation

```text
User types "be":
1. Start at root
2. Follow edge "b" → node B
3. Follow edge "e" → node BE
4. All descendants of BE = words starting with "be"
   → ["better", "bet", "behold", ...]

Time complexity: O(prefix_length) — very fast for lookup
```

### Augmented trie for popularity

```text
At each leaf node, store frequency count.

When lookup prefix:
1. Navigate to prefix node
2. DFS through all descendants
3. Collect (word, frequency) tuples
4. Sort by frequency desc
5. Return top 10
```

### Why trie is "natural" choice

```text
✓ Prefix lookup O(prefix_length)
✓ Shared storage for common prefixes (compression)
✓ Easy to update (increment counter)
✓ Textbook answer
```

## Why trie fails at Google scale

### Problem 1: Tree size

```text
[Math]
- 60-char max prefix
- 26 chars per node
- Theoretical tree size: 26^60 = absurdly large

[Practical]
- Billions of unique queries
- Each query has many prefixes
- "how to open a jar of olives" creates 28 prefix nodes
- Total trie: hundreds of GB or TB
- Doesn't fit in single computer's RAM
```

### Problem 2: DFS performance for popular prefixes

```text
[User types "a"]
- Navigate to node A
- All descendants of A = millions of words
- DFS to collect all of them
- Sort by frequency
- Return top 10

Time: seconds — way too slow for 240ms budget.
```

### Problem 3: Maintenance complexity

```text
[Every search query]
- Need to increment frequency counter at leaf
- Counter writes from 1M QPS searches
- Hot leaf nodes → write contention
- Rebalancing top-10 sort orderings → expensive
```

### When trie DOES work

```text
[Trie shines]
- IDE autocomplete: hundreds of keywords + variable names
- Email autocomplete: your contact list (few hundred)
- Recent searches: your last 100 queries
- File path completion: hundreds of files

→ Small dataset, fits in RAM, simple frequency.

[Trie fails]
- Internet-scale autocomplete
- Billions of queries
- Strict latency
- Trending updates
```

## Critical observations

These observations unlock the actual solution (bài 2):

### Observation 1: Read pattern ≠ Write pattern

```text
[Read: autocomplete request]
- User-facing
- ULTRA-strict latency (240ms)
- Frequent (1M QPS)
- Simple: prefix → top 10 list

[Write: update suggestion data]
- Background process
- NO latency constraint (1hr lag OK)
- Can batch: process all of yesterday's queries in 1 job
- Complex: aggregate billions of queries

→ Different patterns require different optimizations
→ CQRS pattern (Command Query Responsibility Segregation)
```

### Observation 2: Batch processing acceptable

```text
[1-hour staleness OK]
- Don't need real-time updates
- Can run heavy job every 30-60 min
- Batch process billions of queries efficiently

[MapReduce pattern natural fit]
- Map: extract prefixes from each query
- Reduce: aggregate counts per prefix
- Output: top-10 per prefix
```

## Insight summary

```text
Trie tells us:
✓ Concept of prefix-based lookup ✓
✗ Specific data structure doesn't scale ✗

CQRS tells us:
- Pre-compute top-10 per prefix in batch
- Store result in simple KV store (prefix → list)
- Read = single KV lookup = sub-ms

MapReduce tells us:
- HOW to compute top-10 per prefix at scale
- Distribute the work across thousands of machines
```

## Trade-offs surfaced

### Storage shape

```text
[Trie] — shared prefixes
- Compact for storage
- Complex for lookup at scale

[Flat KV: prefix → list]
- More storage (redundant)
- O(1) lookup
- → Storage cheaper than latency at this scale
```

### Real-time vs batch

```text
[Real-time]
- Sub-second update
- Complex state management
- Required for fraud detection, not for autocomplete

[Batch (chosen)]
- 1-hour update
- Simple MapReduce
- Acceptable trade-off
```

### Cache vs DB

```text
[Disk-backed DB]
- Cheap storage
- Latency: 10-50ms (won't make 240ms budget after network)

[In-memory store (Redis)]
- 100x more expensive per GB
- Latency: 1-5ms
- → Required for SLA
```

## What we need for bài 2

```text
[Autocomplete Service]
- Reads from in-memory KV store
- Key: prefix string
- Value: top-10 suggestions list
- Sharded by prefix hash
- Heavy replication for hot prefixes

[Autocomplete Updater Service]
- Receives every search query
- Stores tuples (query, timestamp) in distributed FS
- Triggers batch job every 30-60 min

[Batch processor]
- MapReduce pipeline
- Map: query → many (prefix, query) pairs
- Reduce: group by prefix → top-10
- Output to KV store via CDC
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Apply trie blindly | Doesn't scale | Recognize read/write asymmetry |
| Real-time everywhere | Over-engineered | Accept 1hr staleness |
| Strong consistency | Doesn't meet 240ms | Eventually consistent |
| Disk-backed DB for hot reads | Latency budget blown | Memory store |
| One implementation for both R+W | Compromise both | CQRS |
| Naive search engine integration | Coupling | Separate query path |

## Tóm tắt bài 1

- Typeahead: 240ms P99 — strictest latency in course.
- 10 suggestions per character, English, max 60 char prefix, no spell check.
- 1B+ daily queries, ~1M QPS typeahead requests.
- Eventually consistent, 1-hour staleness OK.
- **Trie is natural but fails** at Google scale (too big, DFS slow, write contention).
- **2 critical observations**: read ≠ write pattern, batch acceptable → CQRS + MapReduce.
- Trie still good for small-scale typeahead (IDE, email).
- Bài 2 builds CQRS architecture with MapReduce.

**Bài kế tiếp** → [Bài 2: CQRS Architecture + MapReduce Pipeline](02-cqrs-mapreduce.md)
