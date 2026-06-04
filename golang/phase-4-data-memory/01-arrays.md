# Bài 1: Arrays — Khối xây dựng đầu tiên của collections

90% developer Go production rất ít khi đụng tới **array** thuần. Hầu hết thời gian họ dùng **slice**. Vậy tại sao vẫn cần học array? Vì slice **được xây trên array** — không hiểu array thì không hiểu được trick performance của slice (capacity, doubling, copy-on-grow). Hơn nữa, một số corner case của Go (math vector, crypto hash output, fixed-size buffer) chỉ array làm được. Bài này 15 phút bạn xong array, rồi tự tin học slice.

## Array là gì?

```text
[Array]
- Sequence các phần tử cùng type
- Length cố định (không grow được)
- Index 0-based
- Lưu liên tiếp trong memory (contiguous)
- Length là phần của TYPE
```

Cú pháp:
```go
var nums [5]int   // array 5 phần tử int
```

→ `[5]int` là **type**. `[5]int` và `[6]int` là **2 type khác nhau**.

## Vì sao array không grow được?

```text
RAM:
... [other data] [array nums 5 slot: __ __ __ __ __] [other data] ...
                                                    ↑
                                                    biên giới — phía sau là dữ liệu chương trình khác

Nếu cố tăng nums lên 6 slot:
→ ghi đè vùng "other data" 
→ data corruption, không cho phép
```

Đây là lý do array có size cố định **tại compile time**. Muốn grow → phải copy sang block memory mới (đây chính là cách slice làm).

## Declare array

```go
// 1. Zero value
var nums [3]int          // [0 0 0]
var names [2]string      // ["" ""]
var flags [4]bool        // [false false false false]

// 2. Khai báo + khởi tạo
var nums = [3]int{1, 2, 3}

// 3. Short form
nums := [3]int{1, 2, 3}

// 4. Compiler đếm size cho mình
nums := [...]int{1, 2, 3, 4, 5}    // = [5]int

// 5. Sparse init với index
nums := [10]int{0: 100, 5: 500, 9: 999}
// [100 0 0 0 0 500 0 0 0 999]
```

→ `[...]` rất tiện khi không muốn đếm tay.

## Truy cập + sửa

```go
nums := [3]int{10, 20, 30}

fmt.Println(nums[0])    // 10
nums[1] = 99            // sửa
fmt.Println(nums)        // [10 99 30]

// Out of bounds
fmt.Println(nums[5])    // PANIC: index out of range
```

Compile-time check khi index là constant:
```go
nums[10] = 1   // COMPILE ERROR: invalid array index
```

Runtime check khi index động:
```go
i := getIndex()
nums[i] = 1    // có thể panic
```

## Length

```go
nums := [...]int{1, 2, 3, 4, 5}
fmt.Println(len(nums))   // 5
```

`len()` cho array luôn là **compile-time constant** — compiler biết ngay, không runtime cost.

## Loop array

```go
nums := [...]int{10, 20, 30}

for i := 0; i < len(nums); i++ {
    fmt.Println(i, nums[i])
}

// Hoặc range (tốt hơn)
for i, v := range nums {
    fmt.Println(i, v)
}
```

## Multi-dimensional array

```go
// 2D matrix 2 hàng 3 cột
var matrix [2][3]int

matrix[0][0] = 1
matrix[0][1] = 2
matrix[0][2] = 3
matrix[1][0] = 4
matrix[1][1] = 5
matrix[1][2] = 6

// Literal
matrix := [2][3]int{
    {1, 2, 3},
    {4, 5, 6},
}

// Loop nested
for i := 0; i < 2; i++ {
    for j := 0; j < 3; j++ {
        fmt.Print(matrix[i][j], " ")
    }
    fmt.Println()
}
```

3D, 4D đều có thể, nhưng hiếm dùng — quá complex thì refactor thành struct.

## Đặc tính: Array là value type

Đây là điểm KHÁC NHAU LỚN với array trong Java/Python/JS — và là **lý do dân Go ít dùng array thuần**.

```go
a := [3]int{1, 2, 3}
b := a              // COPY TOÀN BỘ — không phải reference
b[0] = 99
fmt.Println(a)      // [1 2 3] — a không đổi
fmt.Println(b)      // [99 2 3]
```

So với Java:
```java
int[] a = {1, 2, 3};
int[] b = a;        // b và a CÙNG trỏ vào array
b[0] = 99;
// a = [99 2 3] — đã đổi
```

Đặc tính value type kéo theo:
- Pass array vào function = **copy toàn bộ** → đắt nếu array lớn.
- Compare 2 array bằng `==` → so sánh từng phần tử (chỉ work khi element type comparable).

```go
a := [3]int{1, 2, 3}
b := [3]int{1, 2, 3}
fmt.Println(a == b)  // true
```

## Pass array vào function — bẫy hiệu năng

```go
func sum(arr [1000]int) int {
    total := 0
    for _, v := range arr {
        total += v
    }
    return total
}

// Gọi
a := [1000]int{...}
result := sum(a)        // copy 8000 byte vào function — slow
```

Workaround 1: pass pointer
```go
func sum(arr *[1000]int) int {
    total := 0
    for _, v := range arr {
        total += v
    }
    return total
}

result := sum(&a)
```

Workaround 2 (chuẩn Go): dùng slice
```go
func sum(arr []int) int { ... }   // slice không copy data
result := sum(a[:])
```

→ Đây chính là lý do slice tồn tại. Bài kế tiếp.

## So sánh array

```go
a := [3]int{1, 2, 3}
b := [3]int{1, 2, 3}
fmt.Println(a == b)   // true

c := [4]int{1, 2, 3, 4}
fmt.Println(a == c)   // COMPILE ERROR: mismatched types [3]int and [4]int
```

→ Size khác → type khác → không so sánh được.

## Use case của array

Khi nào dùng array thuần thay vì slice?

| Use case | Vì sao |
|---|---|
| Fixed-size buffer (vd hash output) | SHA256 = `[32]byte`, không bao giờ đổi size |
| Math vector / matrix (vd 3D graphics) | Vector3 = `[3]float32`, fixed |
| Lookup table compile-time | `var months = [12]string{...}` |
| Stack-allocated (escape analysis) | Array nhỏ chắc chắn stack, tránh GC |
| Performance critical | Predictable memory layout |
| Compile-time guarantee size | Type system enforce size đúng |

```go
// Crypto
hash := sha256.Sum256(data)   // returns [32]byte
fmt.Printf("%x\n", hash)

// Graphics
type Vec3 [3]float32
func (v Vec3) Length() float32 { ... }

// Lookup
var dayNames = [7]string{"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
fmt.Println(dayNames[3])  // Wed
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Pass array lớn vào function | Copy toàn bộ, slow | Dùng pointer `*[N]T` hoặc slice `[]T` |
| Mong slice với `[N]T` | Type fixed, không grow | Dùng `[]T` (slice) |
| Compare array khác size | Compile error | Cùng size hoặc convert sang slice |
| Set index ngoài range | Compile/runtime error | Check `len()` trước |
| Nhầm `[3]int{1,2,3}` với `[3]int{...}` | Init không đầy đủ | Dùng literal đầy đủ |
| Quên `[...]int{}` đếm tự động | Phải đếm tay | `[...]` cho compiler đếm |

## Pattern thực tế: ring buffer fixed size

```go
type RingBuffer struct {
    data  [16]int  // fixed 16 slots
    head  int
    size  int
}

func (r *RingBuffer) Push(v int) {
    r.data[r.head] = v
    r.head = (r.head + 1) % len(r.data)
    if r.size < len(r.data) {
        r.size++
    }
}

func (r *RingBuffer) Get(i int) int {
    return r.data[i]
}
```

→ Fixed-size buffer cho metrics, rate limiter, recent log lines. Slice không phù hợp vì grow không control.

## Quick reference

```go
// Declare
var a [5]int                    // zero value
a := [5]int{1, 2, 3, 4, 5}      // literal
a := [...]int{1, 2, 3}          // auto-count = [3]int
a := [10]int{0: 100, 9: 999}    // sparse

// Access
a[0]                            // get
a[1] = 99                       // set
len(a)                          // length (compile-time const)

// 2D
var m [3][4]int
m := [3][4]int{{1,2,3,4}, ...}

// Pass-by-value (CAREFUL)
func sum(a [1000]int) int {}    // copy 8KB
func sum(a *[1000]int) int {}   // pass pointer
func sum(a []int) int {}        // pass slice (preferred)

// Compare
a == b                          // element-wise, same size only
```

## Tóm tắt bài 1

- Array: sequence cùng type, size cố định, contiguous memory.
- `[N]T` là TYPE — `[3]int` ≠ `[4]int`.
- 5 cách init: `var`, `[N]T{...}`, `[...]T{...}`, sparse, zero value.
- **Value type**: gán/pass = copy toàn bộ.
- Compare `==` element-wise nếu cùng type.
- 90% case dùng slice thay vì array, nhưng vẫn cần array cho: crypto hash, math vector, lookup table, ring buffer.
- Pass array lớn → dùng pointer hoặc convert slice (`a[:]`).

**Bài kế tiếp** → [Bài 2: Slices — Dynamic array của Go (quan trọng nhất)](02-slices.md)
