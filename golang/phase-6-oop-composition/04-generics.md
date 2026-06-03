# Bài 4: Generics — Type parameter từ Go 1.18+

Go 1.18 (3/2022) là update lớn nhất kể từ 1.0 — thêm **generics**. Trước đó, code Go muốn reusable across type phải dùng `interface{}` (mất type safety) hoặc copy-paste 5 phiên bản (`SumInt`, `SumFloat64`, ...). Generics fix cả hai. Bài này cover đủ generics để dùng được — không lý thuyết hàn lâm.

## Vấn đề trước generics

```go
// Trước Go 1.18 — phải viết riêng mỗi type
func SumInt(nums []int) int {
    var s int
    for _, n := range nums { s += n }
    return s
}

func SumFloat64(nums []float64) float64 { ... }
func SumInt64(nums []int64) int64 { ... }
// ...
```

Hoặc dùng `interface{}` mất type safety:
```go
func Sum(nums []any) any {
    var s float64
    for _, n := range nums {
        s += n.(float64)   // type assertion mỗi element
    }
    return s
}
```

→ Cả 2 đều xấu.

## Generic function

```go
func Sum[T int | float64](nums []T) T {
    var s T
    for _, n := range nums {
        s += n
    }
    return s
}

Sum([]int{1, 2, 3})            // 6
Sum([]float64{1.1, 2.2, 3.3})  // 6.6
```

Anatomy:
- `[T int | float64]` — **type parameter** với constraint.
- `T` dùng như type bất kỳ trong function.
- Compiler tạo monomorphic version cho mỗi T concrete.

## Type constraint với interface

```go
type Number interface {
    int | int64 | float64
}

func Sum[T Number](nums []T) T { ... }
```

Constraint định nghĩa **type set** — các type được phép.

`type T1 | T2 | T3` đọc là "T1 hoặc T2 hoặc T3".

## Standard constraints

Go 1.18+ có package `constraints`:
```go
import "golang.org/x/exp/constraints"

func Max[T constraints.Ordered](a, b T) T {
    if a > b { return a }
    return b
}

Max(3, 5)              // 5
Max("apple", "banana") // "banana"
Max(1.5, 2.5)          // 2.5
```

`constraints.Ordered` = mọi type so sánh được (`<`, `>`): int, float, string.

Khác `constraints`:
- `Signed`: int, int8, int16, int32, int64.
- `Unsigned`: uint, uint8, ...
- `Integer`: Signed | Unsigned.
- `Float`: float32, float64.
- `Complex`: complex64, complex128.
- `Ordered`: Integer | Float | string.

## `any` constraint

```go
func PrintAll[T any](items []T) {
    for _, item := range items {
        fmt.Println(item)
    }
}

PrintAll([]int{1, 2, 3})
PrintAll([]string{"a", "b"})
PrintAll([]User{...})
```

`any` = no constraint = mọi type.

## Generic type (struct, slice, map)

```go
type Stack[T any] struct {
    data []T
}

func (s *Stack[T]) Push(v T) {
    s.data = append(s.data, v)
}

func (s *Stack[T]) Pop() (T, bool) {
    var zero T
    if len(s.data) == 0 {
        return zero, false
    }
    v := s.data[len(s.data)-1]
    s.data = s.data[:len(s.data)-1]
    return v, true
}

// Dùng
s := &Stack[int]{}
s.Push(1)
s.Push(2)
v, _ := s.Pop()   // 2

ss := &Stack[string]{}
ss.Push("hello")
```

→ Type-safe generic stack. Trước 1.18 phải tự type assert.

## Map / Filter / Reduce

```go
func Map[T, U any](s []T, f func(T) U) []U {
    out := make([]U, len(s))
    for i, v := range s {
        out[i] = f(v)
    }
    return out
}

func Filter[T any](s []T, pred func(T) bool) []T {
    var out []T
    for _, v := range s {
        if pred(v) {
            out = append(out, v)
        }
    }
    return out
}

func Reduce[T, U any](s []T, initial U, f func(U, T) U) U {
    acc := initial
    for _, v := range s {
        acc = f(acc, v)
    }
    return acc
}

// Dùng
nums := []int{1, 2, 3, 4, 5}
doubled := Map(nums, func(n int) int { return n * 2 })   // [2 4 6 8 10]
evens := Filter(nums, func(n int) bool { return n%2 == 0 })   // [2 4]
sum := Reduce(nums, 0, func(acc, n int) int { return acc + n })   // 15
```

→ Functional pattern type-safe.

## Type inference

Go tự suy ra type parameter từ argument:

```go
Sum([]int{1, 2, 3})           // T = int, auto
Sum[int]([]int{1, 2, 3})      // explicit, verbose
```

Hầu hết case không cần `[T]` explicit.

Khi nào cần explicit?
- Function không nhận argument với type T.
- Có 2 T constraint khác → compiler không quyết được.

```go
func MakeZero[T any]() T {
    var zero T
    return zero
}

MakeZero[int]()       // CẦN explicit — không có arg để infer
```

## Generic + interface method

Generic không cho phép gọi method trừ khi constraint bảo đảm có method:

```go
// SAI — T any không có method gì
func Greet[T any](v T) {
    v.Name()   // COMPILE ERROR
}

// ĐÚNG — constraint có method
type Nameable interface {
    Name() string
}

func Greet[T Nameable](v T) {
    fmt.Println(v.Name())
}
```

## Multiple type parameter

```go
func Pair[K, V any](k K, v V) struct {
    Key   K
    Value V
} {
    return struct{ Key K; Value V }{k, v}
}

p := Pair("name", 42)
fmt.Println(p.Key, p.Value)   // name 42
```

## Constraint với underlying type

```go
type Number interface {
    ~int | ~float64       // tilde ~ = underlying type
}

type Celsius float64
type Fahrenheit float64

func Avg[T Number](nums []T) T { ... }

c := []Celsius{20, 25, 30}
Avg(c)                       // OK vì Celsius có underlying float64
```

`~T` = "T hoặc bất kỳ type có underlying T". Cho phép Avg work với type alias.

## Use case: Container thread-safe generic

```go
type SafeMap[K comparable, V any] struct {
    mu sync.RWMutex
    m  map[K]V
}

func NewSafeMap[K comparable, V any]() *SafeMap[K, V] {
    return &SafeMap[K, V]{m: make(map[K]V)}
}

func (s *SafeMap[K, V]) Set(k K, v V) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.m[k] = v
}

func (s *SafeMap[K, V]) Get(k K) (V, bool) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    v, ok := s.m[k]
    return v, ok
}

// Dùng
m := NewSafeMap[string, int]()
m.Set("count", 42)
v, _ := m.Get("count")
```

`comparable` constraint — built-in, cho key map.

## Generic không thay thế interface

Generics tốt cho:
- Container type-safe.
- Algorithm trên collection cùng type.
- Numeric operation.

Interface tốt cho:
- Polymorphism runtime.
- Plugin/dependency injection.
- Loose coupling.

```go
// Generic — compile-time, từng version cho mỗi T
func Sum[T Number](nums []T) T { ... }

// Interface — runtime dispatch
type Storage interface { Save(data []byte) error }
```

Đừng generic hóa thứ đáng dùng interface.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Generic mọi nơi | Code khó đọc | Chỉ generic khi cần |
| Constraint quá lỏng (`any`) | Mất type safety | Constraint cụ thể |
| Quên `~` cho type alias | Type alias không satisfy | Dùng `~T` |
| Method receiver có `[T]` | Khó nhớ syntax | Học sample stdlib |
| Generic + reflection | Anti-pattern | Chọn 1 |
| Compile time tăng | Slow build | Cân nhắc khi project lớn |
| Generic type không initialize | Zero value bug | Explicit init |

## Performance

Go generic dùng **monomorphization + type erasure hybrid**:
- Mỗi constraint group → 1 implementation.
- Type không cụ thể (any) dùng dictionary.

Effect:
- Performance gần như native code khi T cụ thể.
- Binary size tăng nhẹ.

So với:
- C++ template: full monomorphization → binary lớn, compile chậm.
- Java generic: type erasure → mọi T thành Object → boxing cost.

→ Go đứng giữa — pragmatic.

## Pattern production

### 1. Result type

```go
type Result[T any] struct {
    Value T
    Err   error
}

func (r Result[T]) Unwrap() (T, error) {
    return r.Value, r.Err
}

func Try[T any](v T, err error) Result[T] {
    return Result[T]{Value: v, Err: err}
}

// Dùng
r := Try(strconv.Atoi("42"))
v, err := r.Unwrap()
```

### 2. Optional / Maybe

```go
type Optional[T any] struct {
    value *T
}

func Some[T any](v T) Optional[T] {
    return Optional[T]{value: &v}
}

func None[T any]() Optional[T] {
    return Optional[T]{}
}

func (o Optional[T]) Get() (T, bool) {
    if o.value == nil {
        var zero T
        return zero, false
    }
    return *o.value, true
}
```

### 3. Type-safe Set

```go
type Set[T comparable] struct {
    m map[T]struct{}
}

func NewSet[T comparable](items ...T) *Set[T] {
    s := &Set[T]{m: make(map[T]struct{})}
    for _, v := range items {
        s.m[v] = struct{}{}
    }
    return s
}

func (s *Set[T]) Add(v T)      { s.m[v] = struct{}{} }
func (s *Set[T]) Has(v T) bool { _, ok := s.m[v]; return ok }
func (s *Set[T]) Size() int    { return len(s.m) }
```

## Khi NÀO dùng generic

Quy tắc thực dụng:
1. **Đã viết 2+ version function cho type khác nhau** → generic.
2. **Container type-safe** (stack, queue, set, tree) → generic.
3. **Algorithm trên collection** (Map, Filter, Reduce, Sort) → generic.

KHÔNG dùng khi:
- Chỉ 1 type — over-engineering.
- Cần polymorphism runtime — dùng interface.
- Type quá đa dạng → constraint mơ hồ (`any`) → mất type safety.

## Quick reference

```go
// Function
func F[T constraint](v T) T { ... }
func F[T, U any](a T, b U) ... { ... }

// Type
type Stack[T any] struct { data []T }

// Method (lưu ý syntax)
func (s *Stack[T]) Push(v T) { ... }

// Constraints
type Number interface { int | float64 }
type ~T → underlying type allow

// Standard (golang.org/x/exp/constraints)
constraints.Ordered
constraints.Number
constraints.Integer

// Built-in
any            = no constraint
comparable     = ==/!= được
```

## Tóm tắt bài 4

- Go 1.18+ thêm generics: type parameter `[T constraint]`.
- Type set với `int | float64 | string`.
- `~T` = underlying type — cho phép type alias.
- `any` = no constraint. `comparable` = compare được.
- `constraints` package có sẵn `Ordered`, `Integer`, `Float`, ...
- Generic function, generic type (struct), generic method.
- Type inference tự suy T từ argument.
- Patterns: Result, Optional, Set, container thread-safe.
- KHÔNG thay thế interface — bổ sung. Generic compile-time, interface runtime.
- Dùng khi 2+ version cùng logic khác type.

**Bài kế tiếp** → [Bài 5: Payroll Processor + Bank Account — Project áp dụng struct, method, interface, embedding](05-project-payroll-bank.md)
