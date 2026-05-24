# Bài 2: SORT command — phân tích step-by-step

SORT command là **lệnh phức tạp nhất** của Redis. Cú pháp ngắn nhưng làm nhiều việc. Bài này bóc tách qua diagram step-by-step để hiểu chính xác Redis làm gì khi gặp `SORT key BY pattern`.

## Sample data setup

Để học, tạo data thử:

```text
# 3 hashes - mỗi book có title và year
HSET books#bad  title "Bad Book"  year 1930
HSET books#ok   title "OK Book"   year 1940
HSET books#good title "Good Book" year 1950

# 1 sorted set - books theo số like
ZADD books:likes 0 bad 40 ok 999 good
```

Sorted set `books:likes` có members `bad`, `ok`, `good` với scores 0, 40, 999.

## Câu hỏi nhỏ — Sort theo nghĩa nào?

```text
SORT books:likes
(error) ERR One or more scores can't be converted into double
```

Lỗi! Vì sao? Đây là trap đầu tiên với SORT.

**Giải thích**: trong context của `SORT`, Redis cố sort **members** (không phải scores). Members `bad`, `ok`, `good` là string → không parse được thành double → error.

**Quirk terminology**: trong sorted set world, "score" = số gắn với member. Trong **SORT command world**, "score" = sorting value của member. Redis gọi members trong sort là "score-able values" — gây nhầm lẫn.

→ Để sort alphabetically, dùng `ALPHA`:

```text
SORT books:likes ALPHA
1) "bad"
2) "good"
3) "ok"
```

Sort theo alphabet → bad, good, ok.

## BY pattern — sort theo external value

Yêu cầu thực tế: **list IDs theo year publish**. Sort criteria là `year` field của hash khác.

```text
SORT books:likes BY books#*->year
1) "bad"
2) "ok"
3) "good"
```

Thứ tự bad(1930), ok(1940), good(1950) → đúng theo year.

### Cú pháp BY pattern

```text
BY <hash_key_pattern>-><field_name>
```

- `books#*` — pattern key, `*` thay bằng từng member.
- `->year` — field trong hash đó.

### Step-by-step Redis xử lý

**Step 1**: Extract members từ source (sorted set `books:likes`):
```text
members: [bad, ok, good]    (theo thứ tự trong sorted set)
```

**Step 2**: Cho mỗi member, expand BY pattern:
```text
bad   → books#bad->year   = HGET books#bad year   = "1930"
ok    → books#ok->year    = HGET books#ok year    = "1940"
good  → books#good->year  = HGET books#good year  = "1950"
```

**Step 3**: Sort members theo expanded values:
```text
[bad: 1930, ok: 1940, good: 1950]    (đã ascending)
```

**Step 4**: Trả về chỉ members (không return sort values):
```text
[bad, ok, good]
```

→ **Quan trọng**: `year` được dùng làm sort criteria nhưng **không trả về**. Đây là 1 quirk lớn.

## Diagram visual

```text
    Source                      External lookup
   ─────────                    ──────────────────
  sorted set                       books#bad ────── HASH:
  books:likes                      ├── books#ok      ├── title: "..."
   ┌─────────┐                     ├── books#good    ├── year: 1930
   │  bad    │ ──── BY ─────►     └──────────       └── ...
   │  ok     │      books#*->year
   │  good   │
   └─────────┘
                    Step 2: expand
                    bad → 1930
                    ok → 1940
                    good → 1950
                    
                    Step 3: sort by external value
                    
                    Step 4: return members only
                    → [bad, ok, good]
```

## GET pattern — lấy data thay vì member

Yêu cầu mở rộng: thay vì trả ID, **trả title của book**.

```text
SORT books:likes BY books#*->year GET books#*->title
1) "Bad Book"
2) "OK Book"
3) "Good Book"
```

Cú pháp `GET <pattern>` — sau khi sort xong, replace member bằng giá trị của pattern.

### Step-by-step với GET

**Step 1-3**: Như trên, sorted members [bad, ok, good].

**Step 4 (modified)**: Cho mỗi member sau khi sort, lookup GET pattern:
```text
bad   → books#bad->title  = "Bad Book"
ok    → books#ok->title   = "OK Book"
good  → books#good->title = "Good Book"
```

**Step 5**: Trả về kết quả của GET (drop members):
```text
["Bad Book", "OK Book", "Good Book"]
```

## Multiple GET

Có thể có **nhiều GET**:

```text
SORT books:likes BY books#*->year GET books#*->title GET books#*->year
1) "Bad Book"
2) "1930"
3) "OK Book"
4) "1940"
5) "Good Book"
6) "1950"
```

Mảng flat: `[title1, year1, title2, year2, ...]`. Phải chunk client-side.

```ts
const flat = await client.sort('books:likes', {
  BY: 'books#*->year',
  GET: ['books#*->title', 'books#*->year'],
});

const fieldsPerItem = 2;
const items: Array<{ title: string; year: string }> = [];
for (let i = 0; i < flat.length; i += fieldsPerItem) {
  items.push({ title: flat[i], year: flat[i + 1] });
}
```

## GET # — giữ lại member gốc

`#` là pattern đặc biệt — trả về **member gốc**:

```text
SORT books:likes BY books#*->year GET # GET books#*->title GET books#*->year
1) "bad"
2) "Bad Book"
3) "1930"
4) "ok"
5) "OK Book"
6) "1940"
7) "good"
8) "Good Book"
9) "1950"
```

Bây giờ có ID + title + year. Đây là combo phổ biến — fetch entity với id.

## Tóm tắt cú pháp đến giờ

```text
SORT <source>
     [ALPHA]                          # sort string (mặc định numeric)
     [ASC|DESC]                       # hướng (default ASC)
     [BY <pattern>]                   # sort theo external value
     [GET <pattern> [GET <pattern>]]  # trả về field thay vì member
```

`pattern` = key template với `*` (vd `books#*->title`) hoặc `#` (member gốc).

## Quirk: BY non-pattern → no sort

```text
SORT books:likes BY some_key
```

Nếu `some_key` **không chứa `*`**, Redis không gọi expand → mỗi member có cùng "sort value" → giữ nguyên thứ tự original.

Trick: dùng `BY NOSORT` (NOSORT là tên đặc biệt) cho rõ ràng:

```text
SORT books:likes BY NOSORT
1) "bad"
2) "ok"
3) "good"
```

Không sort, chỉ lấy member. Cho phép áp dụng GET sau đó:

```text
SORT books:likes BY NOSORT GET books#*->title
```

→ Trả title theo thứ tự gốc của sorted set (= theo score, vì sorted set đã sort).

## Lệnh tương đương với pipeline

`SORT books:likes BY NOSORT GET # GET books#*->title GET books#*->year`

tương đương:

```ts
const members = await client.zRange('books:likes', 0, -1);    // [bad, ok, good]
const data = await Promise.all(
  members.map((m) => client.hmGet(`books#${m}`, ['title', 'year']))
);
```

SORT: 1 RTT.  
Pipeline: 2 RTT.

Tiết kiệm 1 RTT. Đáng giá nếu app cross-region (50ms RTT). Không đáng nếu local (0.5ms RTT).

## Bẫy chính

### 1. SORT trên LIST/SET với data string mà không có ALPHA

```text
SADD mySet alice bob charlie
SORT mySet
(error) — cố parse alice, bob, charlie thành double → fail
```

Fix: `ALPHA`:
```text
SORT mySet ALPHA
1) "alice"
2) "bob"
3) "charlie"
```

### 2. Sorted Set đã sort rồi — SORT lại có ý nghĩa?

```text
ZADD scores 100 alice 50 bob 200 charlie

SORT scores                # error vì members là string
SORT scores ALPHA          # alphabet: alice, bob, charlie
SORT scores BY NOSORT      # giữ nguyên thứ tự score: bob, alice, charlie
```

Pattern `BY NOSORT` cực hữu ích — giữ thứ tự original của sorted set, chỉ dùng GET.

### 3. GET không tồn tại → nil

```text
SORT books:likes BY NOSORT GET books#*->nonexistent
1) (nil)
2) (nil)
3) (nil)
```

Không lỗi, chỉ trả nil. Phải handle ở client.

### 4. Hash key không tồn tại

```text
SADD ids missing1 missing2
SORT ids BY books#*->year ALPHA
1) "missing1"
2) "missing2"
```

`books#missing1->year` không tồn tại → coi như `""` cho sorting → giữ thứ tự original. Không error.

## Tóm tắt bài 2

- SORT command trên Set/SortedSet/List members.
- **BY pattern** — sort criteria từ external hash lookup. `*` thay member.
- **GET pattern** — trả field thay vì member. `#` = member gốc.
- Multiple GET → flat array, chunk ở client.
- **BY NOSORT** giữ thứ tự original, hữu ích với Sorted Set đã sorted.
- ALPHA cho sort string (mặc định numeric).
- Quirk: GET fail → nil, không error.

**Bài kế tiếp** → [Bài 3: SORT options đầy đủ — LIMIT, STORE, BY external](03-sort-options-day-du.md)
