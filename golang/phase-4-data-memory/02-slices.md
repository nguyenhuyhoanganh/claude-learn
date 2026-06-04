# Bài 2: Slices — Dynamic array của Go (quan trọng nhất)

Slice là cấu trúc dữ liệu **bạn sẽ dùng 90% thời gian** khi viết Go. Nhưng cũng là chỗ Go newbie bug nhiều nhất, vì slice trông như "list trong Python" nhưng đằng sau là một cấu trúc 3-field tinh tế. Hiểu nhầm = leak memory, share data ngoài ý muốn, performance kém 10x. Bài này deep-dive.

## Slice = Array + dynamic abstraction

Cú pháp giống array nhưng **bỏ size**:

```go
var nums []int                  // slice nil
names := []string{"Alice", "John", "Mark"}
prices := make([]float64, 3)    // [0 0 0]
```

→ Không có `[5]int` (array). Chỉ `[]int` (slice).

## Cấu trúc nội bộ — Slice header

Slice là **3 field**:

```text
type slice struct {
    ptr      *T      // trỏ vào array underlying
    length   int     // số element hiện có
    capacity int     // số element MAX có thể chứa không cần realloc
}
```

```go
s := []int{10, 20, 30}
//          ┌──┬──┬──┐
//   ptr ──→│10│20│30│
//          └──┴──┴──┘
//   len = 3
//   cap = 3
```

Khi gán slice, **chỉ copy 3 field này** (24 byte), không copy data underlying:

```go
a := []int{1, 2, 3}
b := a                 // copy header (3 field)
b[0] = 99
fmt.Println(a)         // [99 2 3] — CÙNG underlying!
```

→ Khác hoàn toàn array (value type, copy toàn bộ).

## Tạo slice — 4 cách

```go
// 1. Literal
s := []int{1, 2, 3}

// 2. make với length
s := make([]int, 5)        // len=5, cap=5, init zero
// [0 0 0 0 0]

// 3. make với length + capacity
s := make([]int, 3, 10)    // len=3, cap=10
// [0 0 0] — nhưng đã reserve 10 slot

// 4. Slice từ array hoặc slice khác
arr := [5]int{1, 2, 3, 4, 5}
s := arr[1:4]              // [2 3 4]
```

## `len()` vs `cap()`

```go
s := make([]int, 3, 10)
fmt.Println(len(s))  // 3 — số element hiện có
fmt.Println(cap(s))  // 10 — capacity (max trước khi realloc)
```

```text
┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
│0 │0 │0 │  │  │  │  │  │  │  │  ← underlying array (10 slots)
└──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
└──len=3──┘
└────────────cap=10────────────┘
```

## `append` — Cách thêm element

```go
s := []int{1, 2, 3}
s = append(s, 4)        // [1 2 3 4]
s = append(s, 5, 6, 7)  // [1 2 3 4 5 6 7]

// Append slice vào slice
a := []int{1, 2, 3}
b := []int{4, 5, 6}
a = append(a, b...)     // [1 2 3 4 5 6] — toán tử ... spread
```

**Cực kỳ quan trọng**: `append` **return slice mới**. Phải gán lại:
```go
// SAI — bug âm thầm
append(s, 4)            // không gán → mất kết quả

// ĐÚNG
s = append(s, 4)
```

## Append + capacity growth

```go
s := make([]int, 0, 3)     // len=0, cap=3
s = append(s, 1)           // len=1, cap=3
s = append(s, 2)           // len=2, cap=3
s = append(s, 3)           // len=3, cap=3 — FULL
s = append(s, 4)           // len=4, cap=6 ← doubled
s = append(s, 5, 6, 7)     // len=7, cap=8 (tuỳ Go version)
```

**Quy luật growth (Go runtime)**:
- cap < 256: doubled.
- cap >= 256: tăng 1.25x.

Khi cap đủ → append cũ array.
Khi cap không đủ → **alloc array mới, copy, return slice mới**.

→ Append có thể trigger **alloc + copy** → mất O(n). Tổng cộng amortized O(1) (như Java ArrayList).

## Tối ưu: preallocate

```go
// SAI — append liên tục, alloc nhiều lần
var data []int
for i := 0; i < 1000; i++ {
    data = append(data, i)
}

// ĐÚNG — pre-alloc capacity
data := make([]int, 0, 1000)
for i := 0; i < 1000; i++ {
    data = append(data, i)
}
```

→ Tránh 9-10 lần copy (1, 2, 4, 8, ..., 1024). Bench → nhanh hơn 3-5x.

## Sub-slice / "Slice từ slice"

```go
s := []int{10, 20, 30, 40, 50}

s[1:4]       // [20 30 40] — low=1, high=4 (exclude)
s[:3]        // [10 20 30] — từ đầu
s[2:]        // [30 40 50] — đến cuối
s[:]         // [10 20 30 40 50] — toàn bộ
```

Quy tắc:
- `low` **included**.
- `high` **excluded**.
- Default low = 0, high = len.

**BẪY: sub-slice SHARE underlying array.**

```go
original := []int{1, 2, 3, 4, 5}
sub := original[1:4]   // [2 3 4]

sub[0] = 99
fmt.Println(original)  // [1 99 3 4 5] ← original cũng đổi!
fmt.Println(sub)       // [99 3 4]
```

→ Đây là nguồn bug đau đầu nhất với slice.

## Capacity của sub-slice

```go
s := []int{1, 2, 3, 4, 5}    // len=5, cap=5
sub := s[1:3]                 // [2 3]
fmt.Println(len(sub))         // 2
fmt.Println(cap(sub))         // 4 — từ index 1 đến hết = 4 slot
```

Sub-slice "thấy" toàn bộ phần còn lại của underlying array. Append vào sub có thể ghi đè original:

```go
s := []int{1, 2, 3, 4, 5}
sub := s[1:3]
sub = append(sub, 99)  // viết vào index 3 của underlying
fmt.Println(s)         // [1 2 3 99 5] ← s[3] bị đổi!
```

## Full slice expression — Giới hạn capacity

Cú pháp `s[low:high:max]` để **giới hạn cap**:

```go
s := []int{1, 2, 3, 4, 5}
sub := s[1:3:3]         // [2 3], len=2, cap=2

// Bây giờ append vào sub sẽ alloc array mới, không ghi đè s
sub = append(sub, 99)
fmt.Println(s)          // [1 2 3 4 5] — không đổi
fmt.Println(sub)        // [2 3 99]
```

→ Pattern bảo vệ original data. Quan trọng khi return sub-slice ra ngoài.

## Copy — tách hoàn toàn

Khi cần slice độc lập:

```go
src := []int{1, 2, 3}
dst := make([]int, len(src))
copy(dst, src)

dst[0] = 99
fmt.Println(src)  // [1 2 3] — không ảnh hưởng
fmt.Println(dst)  // [99 2 3]
```

`copy(dst, src)` trả về số element copied = `min(len(dst), len(src))`.

## Delete element

Go không có `delete` built-in cho slice. Pattern phổ biến:

```go
s := []int{10, 20, 30, 40, 50}

// Delete index 2 (giá trị 30)
i := 2
s = append(s[:i], s[i+1:]...)
fmt.Println(s)  // [10 20 40 50]
```

Trong Go 1.21+ có `slices.Delete`:
```go
import "slices"

s := []int{10, 20, 30, 40, 50}
s = slices.Delete(s, 2, 3)   // delete index [2:3]
// [10 20 40 50]
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
```

## Slice nil vs empty

```go
var s []int            // nil slice — len=0, cap=0, ptr=nil
t := []int{}           // empty slice — len=0, cap=0, ptr != nil

fmt.Println(s == nil)  // true
fmt.Println(t == nil)  // false
fmt.Println(len(s))    // 0
fmt.Println(len(t))    // 0
```

**Quan trọng**: cả hai append đều OK:
```go
s = append(s, 1)  // OK (Go auto-alloc)
t = append(t, 1)  // OK
```

→ Treat hai cái này như nhau cho hầu hết logic. Khác biệt chỉ khi JSON marshal:
```go
json.Marshal(s)  // "null"
json.Marshal(t)  // "[]"
```

## Slice 2D

```go
matrix := [][]int{
    {1, 2, 3},
    {4, 5, 6},
    {7, 8, 9},
}

fmt.Println(matrix[1][2])  // 6

// Tạo động
rows, cols := 3, 4
grid := make([][]int, rows)
for i := range grid {
    grid[i] = make([]int, cols)
}
```

→ Khác array 2D ở chỗ mỗi row có thể độc lập length:
```go
ragged := [][]int{
    {1, 2},
    {3, 4, 5, 6},
    {7},
}
```

## Pass slice vào function

```go
func double(s []int) {
    for i := range s {
        s[i] *= 2
    }
}

nums := []int{1, 2, 3}
double(nums)
fmt.Println(nums)  // [2 4 6] — đã đổi!
```

→ Slice header copy, nhưng cùng underlying → modify được.

**BẪY**: nếu function append thì có thể không thấy:
```go
func add(s []int) {
    s = append(s, 99)
}

nums := []int{1, 2, 3}
add(nums)
fmt.Println(nums)  // [1 2 3] — không thấy 99!
```

Vì `append` có thể alloc mới → slice local có header mới, không ảnh hưởng `nums`.

Fix: return slice mới:
```go
func add(s []int) []int {
    return append(s, 99)
}
nums = add(nums)
```

## Bẫy thường gặp với slice

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên gán `s = append(s, ...)` | Mất append result | Luôn gán lại |
| Sub-slice share data | Modify lẫn nhau | `copy()` hoặc full-expression `[i:j:j]` |
| Append vào sub có cap dư | Ghi đè original | Full-expression `[i:j:j]` |
| Pass slice mong giữ reference khi append | Header thay đổi không thấy | Return slice mới |
| `nil` slice vs empty slice | JSON marshal khác | Init `[]T{}` nếu cần "[]" |
| Loop variable capture trong goroutine | Race / wrong value | Go 1.22+ tự fix |
| Slice giữ tham chiếu vùng nhớ lớn | Memory leak | `copy()` để cắt liên kết |
| Modify slice khi đang range | Behavior undefined | Snapshot trước |

### Bẫy memory leak — Slice giữ array lớn

```go
func readFileFirst10Bytes(path string) []byte {
    data, _ := os.ReadFile(path)  // 100MB
    return data[:10]               // GIỮ 100MB underlying!
}
```

→ Caller chỉ thấy 10 byte, nhưng GC không thể free 100MB underlying.

Fix:
```go
func readFileFirst10Bytes(path string) []byte {
    data, _ := os.ReadFile(path)
    result := make([]byte, 10)
    copy(result, data)             // copy ra slice mới
    return result                  // 100MB sẽ được GC
}
```

## Package `slices` (Go 1.21+)

```go
import "slices"

s := []int{3, 1, 4, 1, 5, 9, 2, 6}

slices.Sort(s)                       // [1 1 2 3 4 5 6 9]
slices.Reverse(s)
slices.Contains(s, 5)                // true
slices.Index(s, 9)                   // index of 9
slices.Max(s); slices.Min(s)
slices.Equal(a, b)                   // element-wise compare
s2 := slices.Clone(s)                // deep clone
s = slices.Delete(s, 2, 4)
s = slices.Insert(s, 1, 100, 200)
slices.Concat(a, b, c)
```

→ Dùng `slices` package thay vì viết lại. Đỡ bug.

## Quick reference

```go
// Tạo
s := []int{1, 2, 3}                    // literal
s := make([]int, 5)                    // zero, len=5, cap=5
s := make([]int, 0, 100)               // empty, cap=100
var s []int                            // nil

// Operations
len(s); cap(s)
s = append(s, 1, 2, 3)                 // append (PHẢI gán)
s = append(s, other...)                // append slice
sub := s[1:4]                          // sub-slice [low:high)
sub := s[1:4:5]                        // full expression với cap
copy(dst, src)                         // copy data

// Delete index i
s = append(s[:i], s[i+1:]...)
s = slices.Delete(s, i, i+1)

// Insert at index i
s = append(s[:i], append([]int{v}, s[i:]...)...)
s = slices.Insert(s, i, v)

// Stdlib (Go 1.21+)
slices.Sort, slices.Contains, slices.Index,
slices.Clone, slices.Equal, slices.Max, slices.Reverse
```

## Tóm tắt bài 2

- Slice = 3 field (ptr, len, cap) trỏ vào array underlying.
- Khác array: **reference-like** — copy header nhưng cùng data.
- `append` có thể alloc + copy → phải gán lại.
- Growth: 2x đến cap=256, sau đó 1.25x. Pre-alloc với `make(T, 0, n)` để tối ưu.
- Sub-slice share data — full expression `[i:j:j]` hoặc `copy()` để tách.
- Bẫy memory leak: slice giữ underlying lớn → `copy()` cắt liên kết.
- Nil slice = empty slice cho hầu hết logic, khác khi marshal JSON.
- Go 1.21+: package `slices` thay viết tay.

**Bài kế tiếp** → [Bài 3: Maps — hash table built-in mọi Go developer phải master](03-maps.md)
