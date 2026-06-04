# Bài 5: Slicing nâng cao — sub-slice, copy, package slices

Bạn đã biết slice cơ bản từ bài 2. Bài này đào sâu chỗ slice **dễ gây bug** và **chỗ Go 1.21+ thêm rất nhiều helper** mà nhiều người viết Go vẫn chưa biết. Sau bài này bạn dùng slice không sợ leak, không sợ share data ngầm, biết khi nào dùng `slices.Insert` thay vì viết tay.

## Recap: 3 field của slice

```text
slice header = { ptr, len, cap }

s := []int{10, 20, 30, 40, 50}

           ptr ────────┐
                       ▼
underlying array:  [10][20][30][40][50]
                    0   1   2   3   4
                   
len = 5
cap = 5
```

Mọi thao tác slice đều thao tác **3 field** này + array underlying.

## Sub-slice expression: `s[low:high]`

```go
s := []int{10, 20, 30, 40, 50}

s[1:4]   // [20 30 40]
s[:3]    // [10 20 30]
s[2:]    // [30 40 50]
s[:]     // [10 20 30 40 50]
```

Quy tắc:
- **`low` included, `high` excluded** (giống Python).
- Default `low = 0`, `high = len(s)`.
- `0 <= low <= high <= cap(s)`.

Cảnh báo: `high` có thể vượt `len` nhưng phải ≤ `cap`:
```go
s := []int{10, 20, 30}  // len=3, cap=3
s[:5]                    // PANIC: out of range

s := make([]int, 3, 10)  // len=3, cap=10
s[:5]                    // OK — [0 0 0 0 0]
```

## `len` và `cap` của sub-slice

```go
s := make([]int, 5, 10)   // [0 0 0 0 0], cap=10
fmt.Println(len(s), cap(s))   // 5 10

sub := s[2:4]
fmt.Println(len(sub), cap(sub))   // 2 8
//                                   ↑  ↑
//                                  4-2  cap(s)-low = 10-2
```

Quy luật: 
- `len(sub) = high - low`.
- `cap(sub) = cap(s) - low`.

→ Sub-slice "thấy" toàn bộ array từ low đến hết.

## Sub-slice SHARE data — Bẫy lớn nhất

```go
original := []int{1, 2, 3, 4, 5}
sub := original[1:4]   // [2 3 4]

sub[0] = 99
fmt.Println(original)  // [1 99 3 4 5] ← bị đổi!
```

Cả `original` và `sub` trỏ vào **cùng underlying array**. Modify cái nào cũng ảnh hưởng cái kia (trong phần overlap).

## Append vào sub-slice có cap dư

```go
s := []int{1, 2, 3, 4, 5}     // len=5, cap=5
sub := s[1:3]                  // len=2, cap=4

sub = append(sub, 99)
fmt.Println(s)                 // [1 2 3 99 5] ← s[3] bị ghi đè
fmt.Println(sub)               // [2 3 99]
```

→ Vì sub có cap dư, `append` ghi vào slot index 3 của underlying = `s[3]`.

Đây là một trong những bug **rất khó debug** trong Go production.

## Full slice expression: `s[low:high:max]` — Fix bẫy

```go
s := []int{1, 2, 3, 4, 5}
sub := s[1:3:3]               // len=2, cap=2 ← cap giới hạn

sub = append(sub, 99)
fmt.Println(s)                // [1 2 3 4 5] ← không đổi!
fmt.Println(sub)              // [2 3 99] — đã alloc array mới
```

Cú pháp `s[low:high:max]`:
- `low` đầu sub-slice (như cũ).
- `high` đến đâu hiển thị (như cũ).
- `max` đặt `cap = max - low`.

→ Pattern bảo vệ data khi return sub-slice.

## Khi nào dùng full slice expression

```go
// Hàm public trả về sub-slice cho user
func GetHeader(data []byte) []byte {
    return data[:8:8]      // bảo vệ caller không vô tình ghi đè
}
```

Hoặc khi muốn slice "đóng băng":
```go
snapshot := s[:len(s):len(s)]
// snapshot không thể grow vào underlying của s nữa
```

## `copy` — Tách hoàn toàn

Khi cần slice độc lập:
```go
src := []int{1, 2, 3}
dst := make([]int, len(src))
n := copy(dst, src)

fmt.Println(n)    // 3 — số element copied
dst[0] = 99
fmt.Println(src)  // [1 2 3] — không ảnh hưởng
```

`copy(dst, src)` return `min(len(dst), len(src))`.

```go
// Copy partial
dst := make([]int, 2)
copy(dst, src)  // chỉ copy 2 phần tử đầu
```

## `slices.Clone` — Idiom

Go 1.21+:
```go
import "slices"

s := []int{1, 2, 3}
clone := slices.Clone(s)
```

Tương đương:
```go
clone := make([]int, len(s))
copy(clone, s)
```

→ Nhưng `slices.Clone` đọc rõ intent hơn.

## Delete element giữa slice

```go
s := []int{10, 20, 30, 40, 50}
i := 2   // delete index 2 (giá trị 30)

s = append(s[:i], s[i+1:]...)
fmt.Println(s)   // [10 20 40 50]
```

Cách hoạt động:
- `s[:i]` = `[10 20]`.
- `s[i+1:]` = `[40 50]`.
- Append concat.

Hoặc Go 1.21+:
```go
s = slices.Delete(s, i, i+1)   // delete range [i, i+1)
```

`slices.Delete(s, i, j)` xoá range `[i, j)`:
```go
s := []int{10, 20, 30, 40, 50}
s = slices.Delete(s, 1, 3)   // xoá index 1, 2 → [10 40 50]
```

## Insert element

```go
s := []int{10, 20, 40, 50}
i := 2

// Insert 30 tại index 2
s = append(s[:i], append([]int{30}, s[i:]...)...)
// [10 20 30 40 50]
```

Hoặc Go 1.21+:
```go
s = slices.Insert(s, 2, 30)
// hoặc nhiều giá trị
s = slices.Insert(s, 2, 25, 30, 35)
```

## `slices` package — Mọi thứ Go 1.21+

```go
import "slices"

s := []int{3, 1, 4, 1, 5, 9, 2, 6, 5, 3}

// Sort
slices.Sort(s)               // [1 1 2 3 3 4 5 5 6 9]
slices.SortFunc(s, func(a, b int) int {
    return b - a              // descending
})

// Find
slices.Contains(s, 5)        // true
slices.Index(s, 9)           // 9
slices.BinarySearch(sorted, 5)

// Min / Max
slices.Min(s); slices.Max(s)

// Compare
slices.Equal(a, b)
slices.Compare(a, b)

// Modify (return slice mới)
slices.Reverse(s)
clone := slices.Clone(s)
s = slices.Delete(s, 2, 5)
s = slices.Insert(s, 0, 100)
s = slices.Replace(s, 0, 2, 999)

// Combine
all := slices.Concat(a, b, c)

// Compact (remove duplicate liền kề)
s = slices.Compact(s)        // [1 2 3 4 5 6 9]

// Check sorted
slices.IsSorted(s)
```

→ Đọc doc `pkg.go.dev/slices` để biết hết.

## Pattern: Filter slice

Go không có `.filter()` built-in. Pattern:

```go
nums := []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}

var evens []int
for _, n := range nums {
    if n%2 == 0 {
        evens = append(evens, n)
    }
}
// [2 4 6 8 10]
```

Hoặc in-place (filter without alloc):
```go
n := 0
for _, x := range nums {
    if x%2 == 0 {
        nums[n] = x
        n++
    }
}
nums = nums[:n]
// nums = [2 4 6 8 10]
```

→ Pattern "in-place filter" tiết kiệm alloc khi không cần slice gốc.

## Pattern: Map slice (transform)

```go
nums := []int{1, 2, 3}
doubled := make([]int, len(nums))
for i, n := range nums {
    doubled[i] = n * 2
}
// [2 4 6]
```

Go không có `.map()`. Generic Go 1.18+ cho phép helper:
```go
func Map[T, U any](s []T, f func(T) U) []U {
    out := make([]U, len(s))
    for i, v := range s {
        out[i] = f(v)
    }
    return out
}

doubled := Map(nums, func(n int) int { return n * 2 })
```

## Pattern: Reduce / Fold

```go
nums := []int{1, 2, 3, 4, 5}
sum := 0
for _, n := range nums {
    sum += n
}
// 15
```

## 3 thao tác stack với slice

```go
// Push
stack = append(stack, x)

// Pop
top := stack[len(stack)-1]
stack = stack[:len(stack)-1]

// Peek
top := stack[len(stack)-1]
```

## 3 thao tác queue với slice

```go
// Enqueue
queue = append(queue, x)

// Dequeue (O(n) vì shift)
front := queue[0]
queue = queue[1:]
```

Queue dequeue O(n) — slice không tối ưu cho queue lớn. Dùng `container/list` (linked list) hoặc ring buffer cho production.

## Slice as buffer — Reset không alloc

```go
buf := make([]byte, 0, 4096)

for {
    buf = buf[:0]                 // reset len=0, giữ cap
    // ... fill buf
    process(buf)
}
```

→ Pattern hiệu năng cho HTTP handler, parser. `buf[:0]` giữ array, không alloc lại.

## Memory leak với slice giữ ref

```go
// SAI
func extractFirst10(data []byte) []byte {
    return data[:10]   // giữ underlying 100MB
}

// ĐÚNG
func extractFirst10(data []byte) []byte {
    result := make([]byte, 10)
    copy(result, data)
    return result
}
```

Caller chỉ thấy 10 byte, nhưng GC không thể free 100MB underlying nếu return sub-slice.

## `slices.Clip` — Free cap dư

```go
s := make([]int, 5, 1000)
// s dùng 5 slot, dư 995 slot

s = slices.Clip(s)
// Bây giờ cap = 5, GC có thể reclaim 995 slot
```

Tương đương `s[:len(s):len(s)]`.

## Bẫy advanced

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Return sub-slice giữ array lớn | Memory leak | `copy()` hoặc `slices.Clip` |
| Append vào sub có cap dư | Ghi đè original | Full expression `[i:j:j]` |
| Reuse buffer trong goroutine | Race | Mỗi goroutine buffer riêng |
| `copy` không check return value | Copy thiếu | `copy()` return số byte |
| Slice của slice (matrix) reuse row | Row share | Init mỗi row riêng |
| Insert vào index 0 thường xuyên | O(n²) | `container/list` hoặc reverse logic |
| Sort slice rồi assume order ổn định | Unstable sort | `slices.SortStableFunc` |
| `slices.Sort` với struct chứa pointer | So sánh address | Custom compare |

## Pattern production: ring buffer

```go
type RingBuffer struct {
    data []int
    head int
    size int
    cap  int
}

func New(n int) *RingBuffer {
    return &RingBuffer{data: make([]int, n), cap: n}
}

func (r *RingBuffer) Push(v int) {
    r.data[r.head] = v
    r.head = (r.head + 1) % r.cap
    if r.size < r.cap {
        r.size++
    }
}

func (r *RingBuffer) Latest(n int) []int {
    if n > r.size {
        n = r.size
    }
    out := make([]int, n)
    for i := 0; i < n; i++ {
        idx := (r.head - 1 - i + r.cap) % r.cap
        out[i] = r.data[idx]
    }
    return out
}
```

→ Pattern cho metrics latest-N, rate limiter, recent events.

## Quick reference

```go
// Sub-slice
s[i:j]                   // [i, j)
s[i:]                    // [i, len)
s[:j]                    // [0, j)
s[i:j:k]                 // cap = k - i (full expression)

// Copy
dst := make([]T, len(src))
copy(dst, src)
slices.Clone(s)

// Delete
s = append(s[:i], s[i+1:]...)
s = slices.Delete(s, i, j)

// Insert
s = append(s[:i], append([]T{v}, s[i:]...)...)
s = slices.Insert(s, i, v1, v2)

// Stack
push: s = append(s, v)
pop:  v, s = s[len(s)-1], s[:len(s)-1]

// Queue (slow dequeue)
enqueue: s = append(s, v)
dequeue: v, s = s[0], s[1:]

// Reset
buf = buf[:0]            // keep cap

// Clip
s = slices.Clip(s)       // free unused cap

// slices stdlib
slices.Sort, SortFunc, IsSorted
slices.Contains, Index, BinarySearch
slices.Min, Max, Equal, Compare
slices.Reverse, Concat, Compact, Replace
slices.Insert, Delete, Clone, Clip
```

## Tóm tắt bài 5

- Sub-slice `s[i:j]` share underlying — modify lẫn nhau.
- `cap(sub) = cap(s) - low`. Append có thể ghi đè original.
- **Full expression `s[i:j:k]`** giới hạn cap → an toàn khi return sub-slice.
- `copy(dst, src)` tách hoàn toàn. Return số element copied.
- Patterns: filter (alloc/in-place), map (Go 1.18+ generic), stack, queue, buffer reuse.
- Memory leak: sub-slice giữ array lớn → `slices.Clip` hoặc `copy()`.
- Go 1.21+ `slices` package: Sort, Contains, Index, Delete, Insert, Clone, ... — học sử dụng để code gọn.
- Queue với slice O(n) khi dequeue — dùng linked list / ring buffer cho production.

**Bài kế tiếp** → [Bài 6: Contact Management System — Project áp dụng struct + slice + map + pointer](06-project-contact-management.md)
