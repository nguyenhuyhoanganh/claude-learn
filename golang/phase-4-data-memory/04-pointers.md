# Bài 4: Pointers — Đăng nhập trực tiếp vào memory

Pointer là thứ làm Go khác Python/Java rõ nhất ở foundation. Java có "reference" nhưng giấu pointer; Python có "name binding" nhưng ép user không nghĩ về memory; C/C++ có pointer arithmetic nhưng đầy bug nguy hiểm. Go đứng giữa: **có pointer, nhưng KHÔNG arithmetic**. Bạn có quyền chỉnh memory, nhưng không có cách nào "trượt khỏi vùng cho phép". Đây là một trong những quyết định thiết kế tuyệt nhất của Go.

## Pointer là gì?

```text
Mọi biến đều có ADDRESS trong RAM:

age := 10
RAM[0xc0000140a8] = 10
        ↑
   địa chỉ của age

Pointer là biến CHỨA địa chỉ của biến khác:

agePtr := &age
RAM[0xc0000140b0] = 0xc0000140a8
        ↑                ↑
   địa chỉ của agePtr   value của agePtr = địa chỉ của age
```

So sánh với analogy:
- Bank account = variable.
- Account number = address.
- Người biết account number = pointer holder → có thể chuyển tiền vào account, ảnh hưởng số dư.

## Hai operator: `&` và `*`

```go
age := 10

// & — lấy ADDRESS của biến
agePtr := &age
fmt.Printf("%p\n", agePtr)     // 0xc0000140a8
fmt.Println(agePtr)            // 0xc0000140a8

// * — DEREFERENCE pointer, lấy value
fmt.Println(*agePtr)           // 10

// Đổi value qua pointer
*agePtr = 25
fmt.Println(age)               // 25 — biến gốc đổi!
```

Mnemonic:
- `&x` đọc là "address of x".
- `*p` đọc là "value at p".

## Tại sao cần pointer?

### Lý do 1: Modify biến từ function khác

```go
func modify(x int) {
    x = 100   // chỉ đổi copy, không ảnh hưởng caller
}

n := 10
modify(n)
fmt.Println(n)   // 10 — không đổi
```

Pass-by-value: function nhận copy.

Muốn modify thật → pass pointer:
```go
func modify(x *int) {
    *x = 100
}

n := 10
modify(&n)
fmt.Println(n)   // 100 — đã đổi
```

### Lý do 2: Tránh copy struct lớn

```go
type User struct {
    Name    string
    Email   string
    Address [10]Address    // mỗi Address 200 byte → 2KB
    History []Event        // có thể MB
}

// Pass-by-value — copy 2KB+
func process(u User) { ... }

// Pass-by-pointer — copy 8 byte
func process(u *User) { ... }
```

Rule of thumb: struct > 64 byte → pass pointer.

### Lý do 3: Phân biệt "không value" và "zero value"

```go
type Config struct {
    Port int
}

// Bị nhập nhằng: Port=0 vì không set, hay user cố tình set 0?
func validate(c Config) { ... }

// Rõ ràng: nil = không có config, *Config = có
func validate(c *Config) {
    if c == nil {
        c = defaultConfig()
    }
    // ...
}
```

## Pointer type

```go
var p *int             // pointer to int — nil
var q *string          // pointer to string — nil
var u *User            // pointer to User — nil
```

Pointer cũng có zero value = `nil`.

## Dereference nil pointer = PANIC

```go
var p *int
fmt.Println(*p)        // PANIC: nil pointer dereference
```

→ Nguyên nhân hàng đầu của runtime crash. Luôn check nil trước dereference:
```go
if p != nil {
    fmt.Println(*p)
}
```

## `new` keyword — Tạo pointer tới zero value

```go
p := new(int)
fmt.Println(*p)        // 0
*p = 42
fmt.Println(*p)        // 42

// Tương đương:
var x int
p := &x
```

`new(T)` cho pointer tới zero value của type T. Hiếm dùng trong Go modern — phổ biến hơn là literal:

```go
u := &User{Name: "Alice"}
```

## Struct + pointer field

```go
type Node struct {
    Value int
    Next  *Node    // pointer to next node
}

head := &Node{Value: 1}
head.Next = &Node{Value: 2}
head.Next.Next = &Node{Value: 3}

// Traverse
for n := head; n != nil; n = n.Next {
    fmt.Println(n.Value)
}
```

→ Linked list, tree, graph đều cần pointer field.

## Auto-dereference cho struct

```go
u := &User{Name: "Alice"}

fmt.Println(u.Name)       // "Alice" — Go auto-deref
fmt.Println((*u).Name)    // tương đương, verbose
```

Go syntactic sugar: `p.field` khi `p` là pointer = `(*p).field`. Không cần dereference explicit.

## Method receiver: value vs pointer

```go
type Counter struct {
    count int
}

// Value receiver — copy, không modify được
func (c Counter) IncBroken() {
    c.count++   // chỉ đổi copy
}

// Pointer receiver — đổi gốc
func (c *Counter) Inc() {
    c.count++   // đổi struct gốc
}

c := Counter{}
c.IncBroken()
fmt.Println(c.count)   // 0

c.Inc()
fmt.Println(c.count)   // 1
```

**Quy tắc cho receiver**:
- Đổi state → pointer receiver.
- Struct > 64 byte → pointer (tránh copy).
- Type chứa mutex, channel, slice "owner" → pointer.
- Type giá trị immutable (Point, Time) → value.

Phase 6 (OOP) deep dive.

## Pointer to pointer

```go
x := 10
p := &x
pp := &p

fmt.Println(**pp)   // 10

**pp = 99
fmt.Println(x)      // 99
```

Hiếm dùng — chỉ khi muốn modify pointer trong function:
```go
func reassign(pp **int) {
    newVal := 999
    *pp = &newVal    // đổi pointer
}
```

## Go cấm pointer arithmetic

C/C++:
```c
int arr[3] = {1, 2, 3};
int *p = arr;
p++;            // p giờ trỏ vào arr[1]
*p = 99;
```

Go:
```go
arr := [3]int{1, 2, 3}
p := &arr[0]
p++             // COMPILE ERROR: invalid operation
```

→ Tránh được toàn bộ class bug "buffer overflow", "out-of-bound write" trong C.

Khi cần "duyệt" array → dùng index hoặc range:
```go
for i := range arr {
    arr[i] *= 2
}
```

## `unsafe.Pointer` — Escape hatch

Khi thật sự cần pointer arithmetic (vd interop với C, performance hack):

```go
import "unsafe"

arr := [3]int{1, 2, 3}
p := unsafe.Pointer(&arr[0])
p = unsafe.Add(p, unsafe.Sizeof(int(0)))   // di chuyển tới arr[1]
v := *(*int)(p)
fmt.Println(v)  // 2
```

**Cảnh báo**: dùng `unsafe` = mất an toàn type. Chỉ dùng khi:
- Cần interop với CGo.
- Performance critical (benchmark đã chứng minh).
- Implement low-level lib (vd `encoding/binary`).

99% code app KHÔNG dùng `unsafe`.

## Escape analysis — Pointer xuống heap

Compiler quyết định variable nằm stack hay heap:

```go
// 1. Variable local, không escape → stack
func f() {
    x := 10
    fmt.Println(x)
}

// 2. Return pointer → escape lên heap
func f() *int {
    x := 10
    return &x      // x phải tồn tại sau khi f trả về → heap
}

// 3. Pass pointer ra interface → escape
func f() {
    x := 10
    var i any = &x   // có thể escape
    use(i)
}
```

Xem escape:
```bash
go build -gcflags="-m" main.go
# ./main.go:5:6: moved to heap: x
```

Pattern tối ưu: pre-alloc, reuse buffer (pool), giảm escape:
```go
import "sync"

var pool = sync.Pool{
    New: func() any { return new(Buffer) },
}

func handle() {
    buf := pool.Get().(*Buffer)
    defer pool.Put(buf)
    // dùng buf
}
```

## Pass-by-value vs Pass-by-pointer — Trực quan

```go
type Big struct {
    data [1000]int  // 8KB
}

func processValue(b Big) { /* copy 8KB */ }
func processPointer(b *Big) { /* copy 8 byte */ }

b := Big{}
processValue(b)      // chậm
processPointer(&b)   // nhanh
```

→ Đo cụ thể với benchmark. Quy tắc thô: struct > 64 byte → pointer.

## Nil pointer vs nil interface — Bẫy quái

```go
type MyError struct{ msg string }
func (e *MyError) Error() string { return e.msg }

func doSomething() error {
    var err *MyError = nil
    return err    // ← BẪY
}

func main() {
    if err := doSomething(); err != nil {
        fmt.Println("error!")    // IN! dù value bên trong là nil
    }
}
```

Vì sao? `error` là interface. Interface có **(type, value)**. Khi return `var err *MyError = nil`, interface = `(*MyError, nil)` — type ≠ nil → interface ≠ nil.

Fix:
```go
func doSomething() error {
    var err *MyError
    if condition {
        err = &MyError{...}
    }
    if err == nil {
        return nil    // explicit nil interface
    }
    return err
}
```

→ Bug nổi tiếng. Phase 6 (Interface) deep dive.

## Bẫy thường gặp với pointer

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Dereference nil pointer | Panic | Check `p != nil` trước |
| Return pointer tới local int | OK (Go escape lên heap) | Hiểu escape analysis |
| Modify field qua copied struct | Mất thay đổi | Dùng pointer receiver |
| Pointer arithmetic mong | Compile error | Dùng index |
| Pointer to map/slice header | Confusing | Map/slice đã ref-like |
| `var p *T = nil` + return error | Interface không nil | Explicit `return nil` |
| Share pointer giữa goroutine | Race condition | Mutex hoặc channel |
| Pointer giữ ref tới object lớn | Memory không free | Set nil khi không cần |

### Bẫy share pointer trong goroutine

```go
// SAI
for i := 0; i < 5; i++ {
    go func() { print(&i) }()   // tất cả goroutine trỏ vào cùng i
}

// ĐÚNG (Go 1.22+ tự fix)
for i := 0; i < 5; i++ {
    i := i
    go func() { print(&i) }()
}
```

## Use case patterns

### Builder

```go
type RequestBuilder struct {
    method string
    url    string
    body   []byte
}

func (r *RequestBuilder) Method(m string) *RequestBuilder {
    r.method = m
    return r
}

func (r *RequestBuilder) URL(u string) *RequestBuilder {
    r.url = u
    return r
}

func (r *RequestBuilder) Build() Request { ... }

// Dùng
req := (&RequestBuilder{}).Method("POST").URL("/api").Build()
```

Chain method cần pointer receiver để modify + return self.

### Optional field

```go
type Config struct {
    Port    int      // bắt buộc
    Timeout *int     // optional — nil = default
    Verbose *bool    // optional
}

cfg := Config{Port: 8080}      // mặc định
cfg := Config{Port: 8080, Timeout: ptr(30)}

func ptr[T any](v T) *T { return &v }
```

### Linked list / Tree

```go
type TreeNode struct {
    Value       int
    Left, Right *TreeNode
}

func insert(root *TreeNode, v int) *TreeNode {
    if root == nil {
        return &TreeNode{Value: v}
    }
    if v < root.Value {
        root.Left = insert(root.Left, v)
    } else {
        root.Right = insert(root.Right, v)
    }
    return root
}
```

## So sánh với Java/Python

```java
// Java — "reference" mặc định cho object
User u = new User();
modify(u);     // modify chỉnh u thật

void modify(User u) {
    u.name = "X";   // OK
}
```

→ Java giấu pointer, mọi object đều pass-by-reference. Đơn giản nhưng không control được.

```python
# Python — name binding
u = User()
modify(u)

def modify(u):
    u.name = "X"  # OK
    u = None      # local rebind, không ảnh hưởng caller
```

→ Python tương tự, không phân biệt được "pass-by-pointer" vs "rebind local".

Go cho user **chọn**: pass-by-value (rõ ràng không share) hoặc pass-by-pointer (rõ ràng share). Tradeoff là verbose hơn một chút, đổi lại minh bạch.

## Quick reference

```go
// Khai báo
var p *int          // nil
p := &x             // address-of
p := new(int)       // tới zero value

// Operations
*p                  // dereference
*p = 100            // assign through pointer
p.field             // auto-deref cho struct

// Patterns
func (r *T) Method() {}    // pointer receiver — modify
func (r T) Method() {}     // value receiver — read-only

// Check
if p == nil { ... }

// Helpers (Go 1.21+ pattern)
func ptr[T any](v T) *T { return &v }
```

## Tóm tắt bài 4

- Pointer chứa **address** của biến khác. `&x` lấy address, `*p` dereference.
- Pass pointer để: modify caller's var, tránh copy struct lớn, phân biệt nil vs zero.
- Auto-dereference cho field: `p.field` = `(*p).field`.
- Pointer receiver method: cho phép modify state + tránh copy.
- Go **KHÔNG cho pointer arithmetic** — an toàn hơn C. Escape hatch: `unsafe.Pointer`.
- Escape analysis quyết định stack vs heap. Return pointer → heap.
- Nil pointer dereference = panic. Luôn check.
- Nil pointer trong interface ≠ nil interface — bẫy quái.
- 99% code app KHÔNG dùng `unsafe`. Dùng pointer thường + escape analysis là đủ.

**Bài kế tiếp** → [Bài 5: Slicing nâng cao — sub-slice, copy, Go 1.21+ stdlib](05-slicing-advanced.md)
