# Bài 3: Maps — Hash table built-in mọi Go developer phải master

Map (= dict trong Python, HashMap trong Java, object trong JS) là **cấu trúc lookup O(1)** mà Go tích hợp sẵn. Nhưng map Go có vài quirk: không thread-safe, range không có thứ tự, không bao giờ nil-panic khi read, panic khi write nil. Hiểu sai = bug production. Bài này clear hết.

## Map là gì?

```text
[Map]
- Key → Value lookup O(1) trung bình
- Key type phải comparable (== được)
- Value type bất kỳ
- Zero value: nil
- Order khi range: KHÔNG xác định
- Thread-safe: KHÔNG (cần sync.Mutex hoặc sync.Map)
```

Cú pháp:
```go
var prices map[string]float64       // nil map
prices = map[string]float64{}        // empty map
prices := make(map[string]float64)   // empty map (preferred)
prices := map[string]float64{
    "tshirt": 20.0,
    "mug":    12.5,
}
```

## Thao tác cơ bản

```go
prices := map[string]float64{}

// Set
prices["tshirt"] = 20.0
prices["mug"] = 12.5

// Get
fmt.Println(prices["tshirt"])  // 20.0

// Update
prices["tshirt"] = 22.0

// Delete
delete(prices, "mug")

// Length
fmt.Println(len(prices))       // 1
```

## "Comma-ok" idiom — Check key tồn tại

Đây là pattern **bắt buộc thuộc** trong Go:

```go
prices := map[string]float64{"tshirt": 20}

// Sai: không phân biệt missing và zero value
price := prices["unknown"]   // 0.0 — nhưng không có key!
if price == 0 {
    // Là không có, hay là giá 0?
}

// Đúng: comma-ok
price, ok := prices["unknown"]
if !ok {
    fmt.Println("not in catalog")
} else {
    fmt.Printf("price: %.2f\n", price)
}
```

Pattern phổ biến:
```go
if v, ok := m[key]; ok {
    use(v)
}
```

## Key type — Phải comparable

Map key phải so sánh được bằng `==`. Cho phép:
- Primitive: `string`, `int`, `float`, `bool`.
- Struct (nếu mọi field comparable).
- Array (nếu element comparable).
- Pointer (so địa chỉ).
- Interface (so type + value).

**Không cho phép**: slice, map, function (không comparable).

```go
m := map[string]int{}             // OK
m := map[int]string{}             // OK
m := map[struct{x, y int}]bool{}  // OK

m := map[[]int]string{}           // COMPILE ERROR: slice not comparable
m := map[map[string]int]bool{}    // COMPILE ERROR
```

## Range map — Không có thứ tự

```go
m := map[string]int{
    "a": 1, "b": 2, "c": 3, "d": 4,
}

for k, v := range m {
    fmt.Println(k, v)
}
// Output có thể là:
// c 3
// a 1
// d 4
// b 2
// (mỗi lần chạy khác)
```

Go **cố tình** randomize order để tránh code phụ thuộc thứ tự (sẽ break khi nâng version). Trong Go 1.0 thì order ổn định, nhiều người tận dụng → khi nâng 1.x bug.

Cần order ổn định → sort key:
```go
import "sort"

keys := make([]string, 0, len(m))
for k := range m {
    keys = append(keys, k)
}
sort.Strings(keys)

for _, k := range keys {
    fmt.Println(k, m[k])
}
```

Hoặc Go 1.21+:
```go
import "slices"
import "maps"

keys := slices.Sorted(maps.Keys(m))
for _, k := range keys {
    fmt.Println(k, m[k])
}
```

## Nil map — Bẫy panic kinh điển

```go
var m map[string]int    // nil map

// Read OK (return zero value)
v := m["key"]            // 0, không panic
fmt.Println(len(m))      // 0

// Write PANIC
m["key"] = 1             // PANIC: assignment to entry in nil map
```

Quy tắc:
- **Read nil map** → OK, trả zero value của value type.
- **Write nil map** → PANIC.

Fix: luôn init trước khi write:
```go
m := make(map[string]int)
m["key"] = 1   // OK
```

## Map literal với struct value

```go
type Product struct {
    Name  string
    Price float64
}

catalog := map[string]Product{
    "tshirt": {Name: "T-Shirt", Price: 20},
    "mug":    {Name: "Mug",     Price: 12.50},
}

// Truy cập field — KHÔNG được modify trực tiếp
fmt.Println(catalog["tshirt"].Price)   // 20 — OK đọc

catalog["tshirt"].Price = 25           // COMPILE ERROR
// "cannot assign to struct field catalog[\"tshirt\"].Price"
```

→ Map trả về **copy** struct, không phải reference. Modify cần:

```go
// Cách 1: copy out, modify, set back
p := catalog["tshirt"]
p.Price = 25
catalog["tshirt"] = p

// Cách 2: pointer value
catalog := map[string]*Product{
    "tshirt": {Name: "T-Shirt", Price: 20},
}
catalog["tshirt"].Price = 25   // OK — pointer
```

Cách 2 phổ biến cho object lớn cần update thường xuyên.

## Iterate + Modify trong loop — BẪY

```go
m := map[string]int{"a": 1, "b": 2, "c": 3}

// Delete trong range — OK (Go cho phép)
for k := range m {
    if k == "b" {
        delete(m, k)
    }
}
// m = {"a": 1, "c": 3}

// Add trong range — KHÔNG xác định
for k := range m {
    m[k+"_new"] = 0
}
// Có thể loop key mới (mới add) hoặc không. Undefined.
```

Spec Go: chỉ guarantee `delete` an toàn trong range. Add → behavior tuỳ runtime.

## Use case phổ biến

### Counter / Frequency count

```go
words := []string{"go", "is", "fun", "go", "is", "fast"}
counts := map[string]int{}

for _, w := range words {
    counts[w]++   // ++ với key mới tự khởi tạo 0
}
// {"go": 2, "is": 2, "fun": 1, "fast": 1}
```

`counts[w]++` magic: nếu `w` chưa có → tự init 0 → tăng lên 1.

### Set (set bằng map[T]struct{})

Go không có Set built-in, dùng `map[T]struct{}`:

```go
// Set chứa unique
visited := map[string]struct{}{}

visited["a"] = struct{}{}
visited["b"] = struct{}{}
visited["a"] = struct{}{}  // duplicate — OK, không tăng size

if _, ok := visited["a"]; ok {
    fmt.Println("visited")
}

fmt.Println(len(visited))  // 2
```

Vì sao `struct{}`? **Zero byte**. Không tốn memory cho value, chỉ cần key.

So với `map[string]bool`: bool = 1 byte. Nhỏ nhưng vẫn lớn hơn 0.

### Group by

```go
type User struct {
    Country string
    Name    string
}

users := []User{
    {"VN", "Alice"}, {"US", "Bob"}, {"VN", "Charlie"},
}

byCountry := map[string][]User{}
for _, u := range users {
    byCountry[u.Country] = append(byCountry[u.Country], u)
}
// {"VN": [Alice, Charlie], "US": [Bob]}
```

### Cache

```go
var cache = map[string]string{}

func getOrCompute(key string) string {
    if v, ok := cache[key]; ok {
        return v
    }
    v := expensiveCompute(key)
    cache[key] = v
    return v
}
```

→ Đây là pattern memoization cơ bản. Production cần thêm: mutex, TTL, max size. Phase 8 sẽ deep.

## Thread-safety — Map KHÔNG safe

```go
m := map[string]int{}

// Goroutine 1 + 2 cùng write → PANIC
go func() { m["a"] = 1 }()
go func() { m["b"] = 2 }()
// "fatal error: concurrent map writes"
```

3 cách fix:

### Cách 1: sync.Mutex

```go
type SafeMap struct {
    mu sync.Mutex
    m  map[string]int
}

func (s *SafeMap) Set(k string, v int) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.m[k] = v
}

func (s *SafeMap) Get(k string) (int, bool) {
    s.mu.Lock()
    defer s.mu.Unlock()
    v, ok := s.m[k]
    return v, ok
}
```

Đơn giản, hiểu được. Phù hợp khi read/write tỉ lệ tương đương.

### Cách 2: sync.RWMutex

```go
mu sync.RWMutex

// Read
mu.RLock()
v := m[k]
mu.RUnlock()

// Write
mu.Lock()
m[k] = v
mu.Unlock()
```

Cho phép nhiều reader cùng lúc, chỉ writer độc quyền. Phù hợp khi read nhiều hơn write.

### Cách 3: sync.Map

```go
var m sync.Map

m.Store("k", "v")
v, ok := m.Load("k")
m.Delete("k")
m.Range(func(k, v any) bool {
    fmt.Println(k, v)
    return true   // false để break
})
```

→ Built-in concurrent. Nhưng:
- API generic (`any`, `any`) → không type-safe.
- Chậm hơn `map + mutex` khi key set ổn định.
- Tối ưu cho: **read nhiều, key thay đổi liên tục**.

Phase 8 (Concurrency) đào sâu.

## Performance

Map hash table:
- Lookup: O(1) trung bình, O(n) worst case (hash collision).
- Insert: O(1) amortized.
- Memory: ~50 byte per entry overhead (Go runtime).

Khi key ít (< 10): slice + linear search có thể nhanh hơn (cache friendly).

```go
// Slice nhanh hơn map khi N nhỏ
var pairs []struct{ Key, Value string }
// ...
for _, p := range pairs {
    if p.Key == target {
        return p.Value
    }
}
```

Bench để chắc chắn. Mặc định dùng map cho đến khi đo thấy chậm.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Write nil map | Panic | `make` hoặc literal trước |
| Read nil map mong panic | Nhận zero value | Dùng comma-ok |
| Modify struct trong map trực tiếp | Compile error | Copy-out hoặc pointer value |
| Phụ thuộc thứ tự range | Bug khi update Go | Sort keys nếu cần |
| Map slice/map làm key | Compile error | Convert sang string key |
| Concurrent write | Panic runtime | Mutex hoặc sync.Map |
| Map nhỏ < 5 entry | Memory waste | Slice + linear |
| Quên `delete` khi loop add | Memory leak | Cẩn thận lifecycle |
| Map làm receiver value | Modify lost (nếu re-assign) | Pointer receiver |

### Bẫy: zero value vs missing key

```go
ages := map[string]int{"alice": 0}

if ages["alice"] == 0 {
    // Alice tồn tại với age 0, hay không tồn tại?
}

// Đúng: comma-ok
if age, ok := ages["alice"]; ok {
    fmt.Printf("Alice is %d\n", age)
} else {
    fmt.Println("Alice not in map")
}
```

→ Quy tắc: **bao giờ value type có ý nghĩa zero value, luôn dùng comma-ok**.

## Pattern production: TTL cache

```go
type entry struct {
    value     string
    expiresAt time.Time
}

type Cache struct {
    mu sync.RWMutex
    m  map[string]entry
}

func New() *Cache {
    return &Cache{m: make(map[string]entry)}
}

func (c *Cache) Set(k, v string, ttl time.Duration) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.m[k] = entry{v, time.Now().Add(ttl)}
}

func (c *Cache) Get(k string) (string, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    e, ok := c.m[k]
    if !ok || time.Now().After(e.expiresAt) {
        return "", false
    }
    return e.value, true
}
```

Production-ready cache đơn giản. Cải tiến tiếp: background eviction, max size, LRU.

## Quick reference

```go
// Tạo
m := map[K]V{}
m := make(map[K]V)
m := make(map[K]V, hint)    // hint capacity
m := map[K]V{k1: v1, k2: v2}

// Thao tác
m[k] = v                     // set
v := m[k]                    // get (zero nếu missing)
v, ok := m[k]                // comma-ok
delete(m, k)
len(m)

// Range
for k, v := range m { }
for k := range m { }
for _, v := range m { }

// Pattern phổ biến
counts[w]++                  // counter
set[k] = struct{}{}          // set
group[k] = append(group[k], v)  // group by

// Thread-safe
var mu sync.RWMutex
// ... lock + map

var sm sync.Map
sm.Store, sm.Load, sm.Delete, sm.Range
```

## Tóm tắt bài 3

- Map = `map[K]V` với key comparable.
- 4 cách tạo: literal, `make`, `make` với hint, nil-then-init.
- **Comma-ok** `v, ok := m[k]` phân biệt zero value với missing.
- Range **không** có thứ tự — sort keys nếu cần.
- Nil map: read OK, write PANIC.
- Struct value trong map → không modify trực tiếp được. Dùng pointer hoặc copy-modify-set.
- KHÔNG thread-safe — concurrent write panic. Dùng `sync.RWMutex` hoặc `sync.Map`.
- `map[K]struct{}` = set zero-byte.
- Patterns: counter, group, cache, memoization.

**Bài kế tiếp** → [Bài 4: Pointers — Đăng nhập trực tiếp vào memory](04-pointers.md)
