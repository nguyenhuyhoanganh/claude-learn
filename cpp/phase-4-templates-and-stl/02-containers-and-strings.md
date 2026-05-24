# Bài 2: Containers và Strings

Bài này dạy:
- `std::string` và `std::string_view`: string class chuẩn, khi nào dùng view.
- `std::vector<T>`: dynamic array — container phổ biến nhất.
- `std::array<T, N>`: fixed-size, stack-allocated.
- `std::span<T>` (C++20): non-owning view của contiguous sequence.
- `std::map<K, V>` vs `std::unordered_map<K, V>`: ordered vs hash.
- `std::set<T>` vs `std::unordered_set<T>`.
- `std::deque<T>`, `std::list<T>`: khi nào dùng.

Kết thúc bài: bạn chọn được container đúng cho task, hiểu trade-off giữa các option, biết khi nào dùng owning vs non-owning string/sequence.

## Tại sao có nhiều container?

Mỗi container có **trade-off** về:

- Access time (random, sequential).
- Insertion / deletion cost.
- Memory layout (contiguous, linked).
- Ordering (none, by key, by insertion).

Không có "container tốt nhất". Chọn theo use case.

## `std::string`

```cpp
#include <string>

std::string s = "Hello";
std::string s2("World");
std::string s3 = s + " " + s2;     // s3 = "Hello World"
s3 += "!";                          // s3 = "Hello World!"

s.size();           // 5 (= length)
s.empty();          // false
s.front();          // 'H'
s.back();           // 'o'
s[0];                // 'H'
s.at(0);             // 'H' — có bound check (throw out_of_range)
s.substr(0, 3);      // "Hel"
s.find("ll");        // 2 — index of substring
s.replace(0, 5, "Bye");  // s = "Bye"
```

`std::string` là `std::basic_string<char>` — wraps dynamic char array với SSO (Small String Optimization — strings ngắn lưu inline trong object, không alloc heap).

### Conversion với C-string

```cpp
const char* c_str = s.c_str();   // Null-terminated, valid khi s không thay đổi
const char* data = s.data();     // C++17 trở lên: cùng `c_str()`

std::string s2 = "Hello";        // const char* → std::string OK (implicit ctor)
std::string s3(c_str);            // Explicit
```

### Format và conversion

```cpp
std::to_string(42);           // "42"
std::to_string(3.14);         // "3.140000"

std::stoi("42");              // 42 — string to int
std::stod("3.14");            // 3.14
std::stoll("9999999999999");  // long long
```

Trong Chromium dùng `base::NumberToString`, `base::StringToInt` thay (consistent behavior across platform).

## `std::string_view` (C++17)

**View** = không sở hữu data, chỉ tham chiếu (pointer + length).

```cpp
#include <string_view>

void Process(std::string_view sv) {   // Không copy!
  std::cout << sv;
}

Process("hello");                      // OK — const char* → string_view
std::string s = "world";
Process(s);                            // OK — string → string_view (implicit)
Process(std::string_view(s).substr(1, 3));   // "orl" — substr không copy
```

### Khi nào dùng `string_view`?

✅ **Function parameter** — input string read-only:

```cpp
// BAD: copy string khi gọi với "literal" hoặc khi caller có sẵn string
void Print(std::string s);

// GOOD: no copy, accept both
void Print(std::string_view s);
```

❌ **KHÔNG dùng để lưu lâu**:

```cpp
std::string_view sv = std::string("temp");   // DANGLING!
// sv pointer trỏ tới string đã destroy
std::cout << sv;  // UB
```

`string_view` chỉ borrow — phải đảm bảo source string sống lâu hơn view.

### Trade-off

- Function input → prefer `string_view` (no copy, work với literal).
- Storage → vẫn dùng `std::string` (own data).
- Container key → cẩn thận `string_view` (key dangling if source disappear).

## `std::vector<T>`

```cpp
#include <vector>

std::vector<int> v;
v.push_back(1);
v.push_back(2);
v.push_back(3);
// v = {1, 2, 3}

std::vector<int> v2 = {1, 2, 3, 4, 5};
v2[0];               // 1
v2.at(0);            // 1 — bound check
v2.front();           // 1
v2.back();            // 5
v2.size();            // 5
v2.empty();           // false

v2.pop_back();        // Remove last → {1, 2, 3, 4}
v2.erase(v2.begin()); // Remove first → {2, 3, 4}

v2.clear();           // Empty
v2.reserve(100);      // Preallocate capacity (không tăng size)
v2.resize(10);        // Resize to 10 elements (init mới = T{})
```

### Memory layout

```text
vector<int> v with size = 3, capacity = 8:

heap:  [ 1 ][ 2 ][ 3 ][ ? ][ ? ][ ? ][ ? ][ ? ]
       ^                                       ^
       data()                                  capacity end
```

Contiguous trong heap → cache-friendly → fast iteration.

### Growth strategy

`push_back` khi capacity đầy → reallocate (thường 2x).

```cpp
std::vector<int> v;
for (int i = 0; i < 1000; ++i) {
  v.push_back(i);   // O(1) amortized, occasional O(N) reallocation
}
```

Để tránh reallocation: `reserve()` trước:

```cpp
std::vector<int> v;
v.reserve(1000);   // Now push_back is guaranteed O(1) for first 1000
for (int i = 0; i < 1000; ++i) {
  v.push_back(i);
}
```

### Iterate

```cpp
// Range-for (preferred)
for (int x : v) { std::cout << x; }
for (auto& x : v) { x *= 2; }              // Mutate
for (const auto& x : v) { std::cout << x; } // Read-only

// Index
for (size_t i = 0; i < v.size(); ++i) {
  std::cout << v[i];
}

// Iterator
for (auto it = v.begin(); it != v.end(); ++it) {
  std::cout << *it;
}
```

### Insert / remove

```cpp
v.insert(v.begin() + 2, 99);   // Insert 99 at index 2 — O(N) (shift elements)
v.erase(v.begin() + 1);         // Remove index 1 — O(N)

v.emplace_back(args...);         // Construct in-place (no copy)
v.emplace(it, args...);          // Insert in-place at iterator
```

`emplace_back` vs `push_back`: `emplace` construct object trực tiếp trong vector, không tạo temp. Hữu ích với type lớn.

## `std::array<T, N>` (C++11+)

Fixed-size array, stack-allocated:

```cpp
#include <array>

std::array<int, 5> arr = {1, 2, 3, 4, 5};
arr[0];             // 1
arr.size();         // 5 (constexpr)
arr.front();         // 1
arr.back();          // 5

for (int x : arr) { std::cout << x; }
```

Khác `std::vector`:

- Size cố định compile-time.
- Storage inline (stack), không heap.
- Không thể grow/shrink.

Khác C-style array `int arr[5]`:

- Có `size()`, iterator, fits container API.
- Pass by reference dễ (`std::array<int, 5>&`).

### Khi nào dùng `std::array`?

- Buffer kích thước biết compile-time, không grow.
- Performance-critical: tránh heap allocation.
- Function return small fixed array.

```cpp
std::array<int, 3> GetRgb() {
  return {255, 128, 0};
}
```

## `std::span<T>` (C++20)

View của contiguous sequence — pointer + size:

```cpp
#include <span>

void Process(std::span<const int> data) {
  for (int x : data) std::cout << x;
}

std::vector<int> v = {1, 2, 3};
std::array<int, 5> arr = {1, 2, 3, 4, 5};
int c_arr[] = {1, 2, 3};

Process(v);        // span of v
Process(arr);      // span of array
Process(c_arr);    // span of C array
```

`std::span` đơn giản hơn passing `pointer + size` cũ kỹ. Chromium dùng `base::span<T>` (precursor cho `std::span`).

→ Use case: function accept "any contiguous sequence" — vector, array, C-array, hoặc subspan.

## `std::map<K, V>` — ordered

```cpp
#include <map>

std::map<std::string, int> ages;
ages["Alice"] = 30;
ages["Bob"] = 25;
ages.insert({"Carol", 28});

ages["Alice"];              // 30
ages.at("Alice");           // 30 — throw if not exist
ages.find("Bob");            // iterator, end() if not found
ages.count("Bob");           // 1 if exist, else 0
ages.contains("Bob");        // C++20 — bool

ages.erase("Alice");
ages.size();                  // 2

// Iterate (sorted theo key)
for (const auto& [name, age] : ages) {   // Structured binding C++17
  std::cout << name << ": " << age << "\n";
}
```

**Implementation**: Red-Black Tree. Operations:

- Lookup/insert/delete: O(log N).
- Iterate: sorted by key.

### Khi nào dùng `map`?

- Cần sorted iteration.
- Need ordered range query (range from k1 to k2).
- Key type không có hash function.

## `std::unordered_map<K, V>` — hash

```cpp
#include <unordered_map>

std::unordered_map<std::string, int> scores;
scores["Alice"] = 95;
scores["Bob"] = 87;

scores["Alice"];        // 95 — O(1) average
scores.find("Bob");
```

**Implementation**: hash table. Operations:

- Lookup/insert/delete: O(1) average, O(N) worst.
- Iterate: NOT sorted.

### Khi nào dùng `unordered_map`?

- Performance critical, không cần sorting.
- Key có hash function tốt (string, int, pointer).

→ **Default modern C++**: prefer `unordered_map`. Dùng `map` khi cần sorting.

### Custom hash

```cpp
struct Point {
  int x, y;
};

struct PointHash {
  size_t operator()(const Point& p) const {
    return std::hash<int>()(p.x) ^ (std::hash<int>()(p.y) << 1);
  }
};

struct PointEq {
  bool operator()(const Point& a, const Point& b) const {
    return a.x == b.x && a.y == b.y;
  }
};

std::unordered_map<Point, std::string, PointHash, PointEq> m;
```

## `std::set` và `std::unordered_set`

Tương tự map nhưng chỉ key (không value):

```cpp
#include <set>
#include <unordered_set>

std::set<int> s;
s.insert(5);
s.insert(3);
s.insert(7);

for (int x : s) std::cout << x;   // 3 5 7 (sorted)

s.contains(5);    // C++20 — true
s.find(5);        // iterator
s.erase(3);

std::unordered_set<std::string> us;
us.insert("hello");
us.insert("world");
us.contains("hello");
```

## `std::deque<T>` — double-ended queue

```cpp
#include <deque>

std::deque<int> dq;
dq.push_back(1);
dq.push_front(0);
dq.push_back(2);
// dq = {0, 1, 2}

dq.pop_back();
dq.pop_front();
```

Operations O(1):

- push_back, push_front, pop_back, pop_front.

Random access O(1) nhưng cache-unfriendly (chia chunks).

**Khi nào**: queue 2 đầu, hoặc khi `vector::push_front` quá chậm.

## `std::list<T>` — linked list

```cpp
#include <list>

std::list<int> l = {1, 2, 3};
l.push_back(4);
l.push_front(0);
auto it = l.begin();
++it;
l.insert(it, 99);   // O(1) — không shift
```

Operations:

- Insert/delete giữa: O(1) nếu có iterator (so với vector O(N)).
- Random access: KHÔNG (no `l[i]`).
- Iterate: cache-unfriendly, slow.

**Hiếm dùng** — `vector` thường nhanh hơn trong thực tế dù big-O xấu hơn, do cache locality.

## Chromium-specific containers

Chromium có container riêng trong `base/`:

| Chromium | Lý do |
|---|---|
| `base::flat_map<K, V>` | Sorted vector — faster than std::map cho small map |
| `base::flat_set<T>` | Same |
| `base::small_map<K, V, N>` | Small map optimization |
| `base::span<T>` | Pre-C++20 span |
| `base::StringPiece` | Pre-C++17 string_view (deprecated, dùng std::string_view) |
| `base::Value` | JSON-like dynamic value (int/string/list/dict union) |

→ Khi viết code Chromium, prefer `base::flat_map` cho map nhỏ (< 100 elements thường). Sẽ deep ở `chromium-native/`.

## Bảng so sánh complexity

| Operation | vector | array | list | map | unordered_map | set | unordered_set |
|---|---|---|---|---|---|---|---|
| Random access | O(1) | O(1) | – | O(log N) | O(1) avg | O(log N) | O(1) avg |
| Insert end | O(1) amort | – | O(1) | O(log N) | O(1) avg | O(log N) | O(1) avg |
| Insert middle | O(N) | – | O(1) iter | O(log N) | O(1) avg | – | – |
| Erase middle | O(N) | – | O(1) iter | O(log N) | O(1) avg | – | – |
| Iterate cache | Best | Best | Worst | Bad | Bad | Bad | Bad |
| Sorted? | No (manual) | No | No | Yes | No | Yes | No |

**Default choice**:

- Sequence → `std::vector`.
- Lookup by key, no sort → `std::unordered_map`.
- Lookup by key, sorted → `std::map` (hoặc `base::flat_map` nếu small).

## Pattern thực tế

### Cache với unordered_map

```cpp
class UserCache {
 public:
  const User* Find(int id) const {
    auto it = users_.find(id);
    return it != users_.end() ? &it->second : nullptr;
  }

  void Add(int id, User user) {
    users_[id] = std::move(user);
  }

 private:
  std::unordered_map<int, User> users_;
};
```

### Sorting + dedup với set

```cpp
std::vector<int> nums = {3, 1, 4, 1, 5, 9, 2, 6};
std::set<int> unique_sorted(nums.begin(), nums.end());
// unique_sorted = {1, 2, 3, 4, 5, 6, 9}
```

### Pass đa-container function

```cpp
double Average(std::span<const double> values) {
  double sum = 0;
  for (double v : values) sum += v;
  return sum / values.size();
}

std::vector<double> v = {1.0, 2.0, 3.0};
std::array<double, 3> arr = {4.0, 5.0, 6.0};
Average(v);          // OK
Average(arr);        // OK
Average({1.0, 2.0}); // OK — initializer list
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `string_view` lưu temporary | Dangling | Chỉ dùng làm parameter |
| `vector` reallocate khi push_back | Pointer/iterator invalidate | `reserve()` trước nếu biết size |
| Insert/erase vector giữa | O(N) — chậm với vector lớn | Dùng `list` hoặc redesign |
| Map[k] với k không tồn tại | INSERT default value! | Dùng `find()` hoặc `at()` |
| Iterate map mong sorted insert order | Map sorted by key, không insert order | Dùng vector<pair> nếu cần insert order |
| Custom struct làm key unordered_map | Compile error: no hash | Cung cấp `std::hash` specialization |
| `vector<bool>` | Special — store as bits, không phải bool | Dùng `vector<char>` hoặc `vector<int>` |
| `string + const char*` chain | Nhiều temp string | Dùng `+=` hoặc `absl::StrCat` |

## Tóm tắt

| Container | Khi nào dùng |
|---|---|
| `std::string` | Owned text |
| `std::string_view` | Function input read-only |
| `std::vector<T>` | Default sequence |
| `std::array<T, N>` | Fixed size, no heap |
| `std::span<T>` | Function input "any contiguous" |
| `std::map<K, V>` | Sorted by key |
| `std::unordered_map<K, V>` | Hash lookup (default cho map) |
| `std::set<T>` | Unique elements sorted |
| `std::unordered_set<T>` | Unique elements (hash) |
| `std::deque<T>` | Double-ended queue |
| `std::list<T>` | Hiếm dùng — frequent middle insert |

## Analogy với JS

| JS | C++ |
|---|---|
| `string` | `std::string` |
| `Array<T>` | `std::vector<T>` |
| `Map<K, V>` | `std::unordered_map<K, V>` (closer) hoặc `std::map<K, V>` |
| `Set<T>` | `std::unordered_set<T>` |
| Fixed-size array | `std::array<T, N>` |
| ArrayBuffer view | `std::span<T>` |

## Exercise (optional)

1. Tạo `std::vector<std::string>` 10 phần tử, sort, dedup. So sánh: dùng `std::sort` + `std::unique` vs dùng `std::set`.
2. Implement `WordCount(std::string_view text)` đếm số lần mỗi word xuất hiện. Trả về `std::unordered_map<std::string, int>`.
3. Tạo function `Average(std::span<const double>)`. Test với `std::vector<double>`, `std::array<double, 5>`, và C-array.
4. Benchmark: vector vs list cho 1000 phần tử, insert ở giữa, iterate. Vector thường vẫn thắng dù big-O xấu — vì sao?

---

**Bài kế tiếp** → [Bài 3: Iterators và Algorithms](03-iterators-and-algorithms.md)
