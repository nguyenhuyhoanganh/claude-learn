# Bài 3: Iterators và Algorithms

Bài này dạy:
- Iterator concept: `begin()`, `end()`, `++`, `*` — abstraction để traverse container.
- Iterator categories: input, output, forward, bidirectional, random-access.
- `<algorithm>`: `find`, `sort`, `transform`, `accumulate`, `for_each`, etc.
- `std::ranges` (C++20): range-based syntax, gọn hơn.
- Range-for + structured binding.

Kết thúc bài: bạn dùng STL algorithm thay vì raw loop, hiểu `begin/end` semantics, và biết khi nào dùng `std::ranges` vs traditional iterator API.

## Iterator là gì?

**Iterator** = đối tượng "pointer-like" cho phép traverse container. Mọi STL container đều cung cấp iterator qua `begin()` và `end()`.

```cpp
std::vector<int> v = {10, 20, 30};

auto it = v.begin();    // Iterator tới phần tử đầu
std::cout << *it;        // 10 — dereference
++it;                    // Next
std::cout << *it;        // 20
++it;
std::cout << *it;        // 30
++it;
// it == v.end() — past-the-end (KHÔNG dereference!)
```

| Operation | Ý nghĩa |
|---|---|
| `*it` | Dereference — get value |
| `++it` | Tiến tới next element |
| `it->member` | Access member (cho object) |
| `it == end()` | Check past-the-end |
| `c.begin()` | Iterator tới first |
| `c.end()` | Iterator tới **past-the-end** (NOT last) |

### `begin()` và `end()` — half-open range

```text
v = [10][20][30][?]
     ↑         ↑
   begin()    end()
```

`end()` trỏ tới **sau** phần tử cuối — gọi là "past-the-end". Loop kiểu `while (it != end())`.

**Vì sao half-open?**

- `end() == begin()` cho container empty — không cần special case.
- Range `[a, b)` dễ tính size: `b - a`.
- Loop natural: `for (auto it = begin(); it != end(); ++it)`.

### Cú pháp traditional

```cpp
for (auto it = v.begin(); it != v.end(); ++it) {
  std::cout << *it << " ";
}
```

### Range-for (preferred C++11+)

```cpp
for (int x : v) std::cout << x << " ";

for (auto& x : v) x *= 2;            // Mutate
for (const auto& x : v) std::cout << x;  // Read-only no copy
```

Range-for tự động dùng `begin()`/`end()` dưới capot — gọn hơn iterator manual.

## `const_iterator`

```cpp
std::vector<int> v = {1, 2, 3};
auto it = v.begin();              // iterator — can modify
*it = 10;                          // OK

auto cit = v.cbegin();             // const_iterator — read-only
// *cit = 10;                       // ERROR
```

`const` vector chỉ trả `const_iterator`:

```cpp
const std::vector<int>& cv = v;
auto it = cv.begin();   // Là const_iterator
// *it = 10;             // ERROR
```

## Reverse iterator

```cpp
std::vector<int> v = {1, 2, 3, 4, 5};

for (auto rit = v.rbegin(); rit != v.rend(); ++rit) {
  std::cout << *rit;   // 5 4 3 2 1
}

// Hoặc range-for với std::ranges::reverse_view (C++20)
for (int x : std::views::reverse(v)) {
  std::cout << x;   // 5 4 3 2 1
}
```

## Iterator categories

5 loại iterator, capability tăng dần:

1. **Input iterator**: read forward, single-pass (vd `std::istream_iterator`).
2. **Output iterator**: write forward, single-pass.
3. **Forward iterator**: read/write forward, multi-pass (`std::forward_list`).
4. **Bidirectional iterator**: forward + `--` (back) (`std::list`, `std::map`, `std::set`).
5. **Random-access iterator**: bidirectional + `+N`, `-N`, `[i]` (`std::vector`, `std::array`, `std::deque`).

```cpp
std::vector<int> v;
auto it = v.begin();
it + 5;        // OK — random access
it[3];          // OK
it - v.begin(); // OK — distance

std::list<int> l;
auto lit = l.begin();
// lit + 5;    // ERROR — list iterator chỉ bidirectional
std::advance(lit, 5);  // OK — algorithm helper
auto dist = std::distance(l.begin(), lit);  // O(N)
```

Algorithms require specific iterator category:

- `std::sort` cần random-access (vector OK, list không).
- `std::find` chỉ cần input.

## `<algorithm>` — STL algorithms

```cpp
#include <algorithm>
#include <numeric>
```

### `std::find` — tìm element

```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
auto it = std::find(v.begin(), v.end(), 3);
if (it != v.end()) {
  std::cout << "Found at index " << (it - v.begin());
}
```

### `std::find_if` — tìm theo condition

```cpp
auto it = std::find_if(v.begin(), v.end(),
                       [](int x) { return x > 3; });
// it trỏ tới 4 (first element > 3)
```

### `std::sort` — sort

```cpp
std::vector<int> v = {5, 2, 8, 1, 9};
std::sort(v.begin(), v.end());
// v = {1, 2, 5, 8, 9}

std::sort(v.begin(), v.end(), std::greater<int>());
// Descending: v = {9, 8, 5, 2, 1}

// Custom comparator (lambda)
std::sort(v.begin(), v.end(), [](int a, int b) { return std::abs(a) < std::abs(b); });
```

`std::sort` cần random-access iterator. `std::list` có `l.sort()` member.

### `std::transform` — map (apply function)

```cpp
std::vector<int> v = {1, 2, 3};
std::vector<int> result(v.size());

std::transform(v.begin(), v.end(), result.begin(),
               [](int x) { return x * 2; });
// result = {2, 4, 6}
```

### `std::accumulate` — fold/reduce

```cpp
#include <numeric>

std::vector<int> v = {1, 2, 3, 4, 5};
int sum = std::accumulate(v.begin(), v.end(), 0);
// sum = 15

int product = std::accumulate(v.begin(), v.end(), 1, std::multiplies<int>());
// product = 120
```

### `std::for_each` — apply function to each

```cpp
std::for_each(v.begin(), v.end(), [](int x) {
  std::cout << x << " ";
});
```

(Thường range-for gọn hơn `std::for_each`.)

### `std::copy` — copy range

```cpp
std::vector<int> src = {1, 2, 3};
std::vector<int> dst(3);
std::copy(src.begin(), src.end(), dst.begin());
```

### `std::remove_if` — erase-remove idiom

```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
auto new_end = std::remove_if(v.begin(), v.end(),
                              [](int x) { return x % 2 == 0; });
v.erase(new_end, v.end());
// v = {1, 3, 5}

// Hoặc C++20:
std::erase_if(v, [](int x) { return x % 2 == 0; });
```

### `std::count`, `std::count_if`

```cpp
int n_zeros = std::count(v.begin(), v.end(), 0);
int n_positives = std::count_if(v.begin(), v.end(),
                                [](int x) { return x > 0; });
```

### `std::min_element`, `std::max_element`

```cpp
auto min_it = std::min_element(v.begin(), v.end());
auto max_it = std::max_element(v.begin(), v.end());
std::cout << "min=" << *min_it << ", max=" << *max_it;
```

### `std::any_of`, `std::all_of`, `std::none_of`

```cpp
bool has_negative = std::any_of(v.begin(), v.end(), [](int x) { return x < 0; });
bool all_positive = std::all_of(v.begin(), v.end(), [](int x) { return x > 0; });
bool no_zeros = std::none_of(v.begin(), v.end(), [](int x) { return x == 0; });
```

### `std::unique` — remove consecutive duplicates

```cpp
std::vector<int> v = {1, 1, 2, 2, 3, 1};
auto new_end = std::unique(v.begin(), v.end());
v.erase(new_end, v.end());
// v = {1, 2, 3, 1}  ← chỉ remove consecutive duplicate
```

Để remove all duplicates: sort trước.

### `std::reverse`

```cpp
std::reverse(v.begin(), v.end());
```

### Algorithms với container method

Một số container có method tương đương:

```cpp
std::vector<int> v = {1, 2, 3};
v.push_back(4);             // Built-in

std::list<int> l = {1, 2, 3};
l.sort();                    // Member — vì list không support std::sort
l.unique();                  // Member
l.reverse();                 // Member
```

## `std::ranges` (C++20)

C++20 ranges = "begin/end together as one range":

```cpp
#include <ranges>
#include <algorithm>

std::vector<int> v = {1, 2, 3, 4, 5};

// Traditional
std::sort(v.begin(), v.end());

// Ranges (C++20)
std::ranges::sort(v);    // Pass container directly

// Find
auto it = std::ranges::find(v, 3);

// Find_if
auto it2 = std::ranges::find_if(v, [](int x) { return x > 3; });
```

### Views — lazy transform

```cpp
auto squared = v | std::views::transform([](int x) { return x * x; });
for (int x : squared) std::cout << x;
// 1 4 9 16 25 — computed on the fly
```

### Composition

```cpp
auto result = v
            | std::views::filter([](int x) { return x % 2 == 0; })
            | std::views::transform([](int x) { return x * 10; });

for (int x : result) std::cout << x;
// Only even, then * 10: 20 40
```

Views không own data, không evaluate cho tới khi iterate.

### Chromium status

C++20 ranges yêu cầu stdlib mới. Chromium build với C++20 — ranges có available. Tuy nhiên phần lớn code Chromium chưa migrate, vẫn dùng traditional `std::find/sort/etc`.

## Structured binding (C++17)

```cpp
std::map<std::string, int> ages = {{"Alice", 30}, {"Bob", 25}};

for (const auto& [name, age] : ages) {
  std::cout << name << ": " << age << "\n";
}

std::pair<int, std::string> p = {1, "hello"};
auto [num, str] = p;

std::tuple<int, double, std::string> t = {1, 3.14, "test"};
auto [i, d, s] = t;
```

Structured binding = destructuring assignment. Tương tự JS:

```javascript
const { name, age } = person;
const [a, b, c] = array;
```

Make range-for với pair/tuple gọn hơn.

## Pattern thực tế

### Find or default

```cpp
const User* FindUserById(const std::vector<User>& users, int id) {
  auto it = std::find_if(users.begin(), users.end(),
                         [id](const User& u) { return u.id == id; });
  return it != users.end() ? &(*it) : nullptr;
}
```

### Filter + transform

```cpp
std::vector<int> nums = {1, 2, 3, 4, 5, 6};

// Filter even, then square — traditional
std::vector<int> result;
for (int n : nums) {
  if (n % 2 == 0) {
    result.push_back(n * n);
  }
}

// Ranges (C++20)
auto result_view = nums
                 | std::views::filter([](int n) { return n % 2 == 0; })
                 | std::views::transform([](int n) { return n * n; });
std::vector<int> result(result_view.begin(), result_view.end());
```

### Sort by member

```cpp
std::vector<User> users;
// ...
std::sort(users.begin(), users.end(),
          [](const User& a, const User& b) { return a.age < b.age; });
```

### Group by

```cpp
std::map<std::string, std::vector<User>> grouped;
for (const auto& user : users) {
  grouped[user.country].push_back(user);
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Iterator invalidation sau `vector.push_back` | UB (use after realloc) | Không hold iterator qua push_back; reserve trước |
| `vector.erase(it)` rồi dùng `it` | UB | Capture return của `erase()`: `it = v.erase(it)` |
| `end()` dereference | UB | Always check `it != end()` |
| `std::find` không tìm thấy → ignore | Bug | Check `it != end()` |
| `std::remove_if` không erase! | Element tận đoạn end vẫn còn (garbage) | Dùng erase-remove idiom hoặc `std::erase_if` (C++20) |
| Custom comparator không satisfy strict weak ordering | sort UB | Đảm bảo: a<b implies !(b<a); transitivity |
| `std::sort` cho list | Compile error — list không random access | Dùng `l.sort()` |
| Forget include `<algorithm>` | "std::find not found" | `#include <algorithm>` |

## Tóm tắt

| Concept | Take-away |
|---|---|
| Iterator | "Pointer-like" trỏ tới element; `++`, `*`, `==` |
| Half-open range | `[begin, end)` — `end` past-the-end |
| Categories | input/output/forward/bidirectional/random-access |
| Range-for | Idiom modern thay loop iterator manual |
| `<algorithm>` | find, sort, transform, accumulate, count, ... |
| Lambda với algorithm | Predicate/transform inline |
| Ranges (C++20) | Pass container thay begin/end; lazy views |
| Structured binding | Destructure pair/tuple/struct |
| Erase-remove idiom | `v.erase(std::remove_if(...), v.end())` |

## Analogy với JS

| JS | C++ |
|---|---|
| `arr.find(...)` | `std::find_if(begin, end, ...)` |
| `arr.indexOf(x)` | `std::find(begin, end, x)` — returns iterator |
| `arr.filter(...)` | `std::copy_if(...)` hoặc `views::filter` |
| `arr.map(...)` | `std::transform(...)` hoặc `views::transform` |
| `arr.reduce(fn, init)` | `std::accumulate(begin, end, init, fn)` |
| `arr.sort(...)` | `std::sort(begin, end, comp)` |
| `arr.some(...)` | `std::any_of(...)` |
| `arr.every(...)` | `std::all_of(...)` |
| `for...of` | `for (auto& x : container)` |

## Exercise (optional)

1. Đếm số word trong `std::string` text bằng `std::count`.
2. Sort `std::vector<std::pair<std::string, int>>` theo int.
3. Implement `Median(std::vector<int>)`: copy, sort, take middle (handle even/odd).
4. Pipeline `vector<int>` → filter (>0) → square → sum dùng ranges (C++20). So sánh với traditional loop.

---

**Bài kế tiếp** → [Bài 4: Lambdas và Callables](04-lambdas-and-callables.md)
