# Bài 2: Interfaces — Implicit, mạnh hơn Java

Interface là **siêu năng lực** của Go. Khác Java/C# bắt buộc `implements`, Go có **implicit interface**: bất kỳ type nào có đủ method matching là tự động satisfy. Điều này nghe đơn giản, nhưng kéo theo: bạn có thể implement interface của **package khác** mà không sửa source họ, code loose-coupling tự nhiên, mock test cực dễ. Hiểu interface là bước nhảy lớn về tư duy.

## Interface là contract

```go
type Person interface {
    GetName() string
}
```

Đọc là: "Anything có method `GetName() string` là Person".

```go
type Employee struct {
    Name string
}

func (e Employee) GetName() string {
    return e.Name
}

type BusinessPerson struct {
    Name string
}

func (b BusinessPerson) GetName() string {
    return b.Name
}

// Cả hai satisfy Person — không cần "implements Person"
func DisplayPerson(p Person) {
    fmt.Println(p.GetName())
}

DisplayPerson(Employee{Name: "Alice"})
DisplayPerson(BusinessPerson{Name: "Bob"})
```

→ Không có keyword `implements`. Compiler tự check satisfaction.

## Implicit là gì? Có gì hay?

Java:
```java
class Employee implements Person { ... }
```

Bạn phải **biết trước** Employee sẽ là Person. Sau này define interface mới → phải sửa code Employee.

Go:
```go
type Employee struct { ... }
func (e Employee) GetName() string { ... }

// Sau đó (có thể trong package khác):
type Person interface { GetName() string }

// Employee tự động là Person — không sửa Employee
```

→ Loose coupling thật sự. Interface định nghĩa **ở phía consumer**, không phải provider.

→ Trong stdlib, `io.Reader`, `io.Writer` cho phép bạn implement Reader/Writer cho type của mình → tích hợp với toàn bộ Go IO ecosystem (file, network, compression, ...) **không sửa stdlib**.

## Đọc code interface stdlib

```go
// io package
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

type Closer interface {
    Close() error
}

// Compose interface
type ReadWriter interface {
    Reader
    Writer
}

type ReadCloser interface {
    Reader
    Closer
}
```

Mọi type implement `Read(...)` đều là `Reader`: `os.File`, `bytes.Buffer`, `strings.Reader`, `http.Response.Body`, `bufio.Reader`...

→ Magic. Function nhận `io.Reader` accept tất cả ngay.

## Interface composition

```go
type ReadWriter interface {
    Reader
    Writer
}
```

Có 2 method: `Read` + `Write`. Bất kỳ type implement cả 2 đều là `ReadWriter`.

→ Composition over inheritance — đặc trưng Go.

## Empty interface — `any`

```go
var x any   // = interface{}
x = 42
x = "hello"
x = []int{1, 2, 3}
```

Empty interface = "không có method requirement" = "mọi type satisfy".

Tương đương `Object` (Java), `void*` (C), `Any` (Kotlin), nhưng safer.

Use case:
- Container generic trước Go 1.18 (giờ dùng generic).
- JSON unknown shape: `map[string]any`.
- Function nhận arg tuỳ loại: `fmt.Println(args ...any)`.

→ Hạn chế dùng. Generic (Go 1.18+) tốt hơn cho hầu hết case.

## Type assertion

```go
var i any = "hello"

// Assert đúng type
s := i.(string)
fmt.Println(s)           // hello

// Sai type → PANIC
n := i.(int)             // PANIC

// Comma-ok safer
s, ok := i.(string)
if ok {
    fmt.Println(s)
}

n, ok := i.(int)
if !ok {
    fmt.Println("not int")
}
```

## Type switch — Dispatch theo type runtime

```go
func describe(i any) {
    switch v := i.(type) {
    case int:
        fmt.Printf("int: %d\n", v)
    case string:
        fmt.Printf("string: %q\n", v)
    case []int:
        fmt.Printf("slice: %v\n", v)
    case error:
        fmt.Printf("error: %v\n", v)
    default:
        fmt.Printf("unknown: %T\n", v)
    }
}
```

`switch v := i.(type)` — chỉ work trong switch. Bài Phase 3 đã thấy. Phổ biến cho dispatch handler, decode JSON, plugin system.

## Interface value internal — (Type, Value)

```text
[Interface value]
┌──────────┬──────────┐
│   Type   │  Value   │
└──────────┴──────────┘
```

Khi gán `var p Person = Employee{Name: "Alice"}`:
- Type: `Employee`
- Value: `{Name: "Alice"}`

Khi gọi `p.GetName()`:
- Look up Type's method table.
- Tìm `GetName`.
- Gọi với Value làm receiver.

→ Có overhead 2x dereference vs gọi trực tiếp. Trong hot path khác biệt nhỏ.

## Nil interface vs Interface chứa nil

Bẫy nổi tiếng:
```go
type MyError struct{ msg string }
func (e *MyError) Error() string { return e.msg }

func do() error {
    var err *MyError = nil
    return err               // ← interface KHÔNG nil
}

if err := do(); err != nil {
    fmt.Println("error!")    // IN!
}
```

Vì:
- `var err *MyError = nil` → value nil, nhưng type `*MyError` ≠ nil.
- Return `err` → interface = `(*MyError, nil)` ≠ nil interface.

Fix:
```go
func do() error {
    var err *MyError
    if cond {
        err = &MyError{...}
    }
    if err == nil {
        return nil       // explicit nil interface
    }
    return err
}
```

→ Đã đề cập Phase 5 bài 2. **Một trong những bug khó debug nhất trong Go**.

## Interface satisfaction check compile-time

Đảm bảo type satisfy interface tại compile:
```go
var _ Person = (*Employee)(nil)   // assert: *Employee phải là Person
var _ io.Reader = (*MyReader)(nil)
```

→ Nếu type không satisfy → compile fail. Hữu ích cho `interface change → ensure backward compat`.

## Pattern: Dependency Injection

```go
// Interface
type Notifier interface {
    Send(msg string) error
}

// Implementation 1
type EmailNotifier struct{ Server string }
func (e EmailNotifier) Send(msg string) error { ... }

// Implementation 2 — mock cho test
type MockNotifier struct{ Sent []string }
func (m *MockNotifier) Send(msg string) error {
    m.Sent = append(m.Sent, msg)
    return nil
}

// Service phụ thuộc Notifier (interface)
type AlertService struct {
    notifier Notifier
}

func NewAlertService(n Notifier) *AlertService {
    return &AlertService{notifier: n}
}

func (s *AlertService) Trigger(msg string) error {
    return s.notifier.Send(msg)
}

// Production
svc := NewAlertService(EmailNotifier{Server: "smtp.x"})

// Test
mock := &MockNotifier{}
svc := NewAlertService(mock)
svc.Trigger("test")
assert(len(mock.Sent) == 1)
```

→ DI Go-style. Không cần framework (Spring, Guice).

## Pattern: Plugin system

```go
type Plugin interface {
    Name() string
    Execute(args []string) error
}

var registry = map[string]Plugin{}

func Register(p Plugin) {
    registry[p.Name()] = p
}

// Plugin tự đăng ký trong init()
type LogPlugin struct{}
func (LogPlugin) Name() string { return "log" }
func (LogPlugin) Execute(args []string) error { ... }

func init() {
    Register(LogPlugin{})
}
```

## Best practice — Interface size

**Quy tắc Go**: interface nhỏ, ít method.

```text
[Go-way]                              [Java-way]
type Reader interface {                  interface FullService {
    Read(p []byte) (n int, err error)        void method1();
}                                           void method2();
                                            void method3();
type Writer interface {                     void method4();
    Write(p []byte) (n int, err error)      // ...20 methods
}                                       }
```

Stdlib: 80% interface có 1 method. `io.Reader`, `io.Writer`, `io.Closer`, `error`, `fmt.Stringer`, `sort.Interface`...

→ Single-method interface dễ implement, dễ compose, dễ mock.

## "Accept interface, return struct"

```go
// GOOD: accept interface (flexible), return concrete (clear)
func ProcessReader(r io.Reader) *Result { ... }

// BAD: accept concrete, return interface
func ProcessReader(r *os.File) io.Closer { ... }
```

Lý do:
- Accept interface → caller pass bất kỳ implementation.
- Return concrete → caller biết chính xác có gì, không phải type assert.

Quote nổi tiếng từ stdlib design.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Interface lớn 5+ method | Khó implement | Tách thành interface nhỏ |
| Định nghĩa interface ở phía provider | Coupling | Define ở phía consumer |
| Empty `any` khắp nơi | Mất type safety | Dùng generic (1.18+) |
| Nil interface != nil pointer | Bug âm thầm | Explicit `return nil` |
| Type assert không check `ok` | Panic | Dùng comma-ok |
| Method set value receiver vs pointer | Interface satisfy khác | Hiểu method set |
| Interface chứa interface | Cyclic | Cẩn thận import |
| `interface{}` thay `any` (Go 1.18+) | Verbose | Dùng `any` |

### Method set value vs pointer receiver

```go
type Animal interface { Sound() string }

type Dog struct{}
func (d *Dog) Sound() string { return "woof" }   // POINTER receiver

var a Animal = Dog{}     // COMPILE ERROR — Dog không sat Animal
var a Animal = &Dog{}    // OK
```

Rule:
- Pointer receiver → chỉ `*T` satisfy interface.
- Value receiver → cả `T` và `*T` satisfy.

→ Pointer receiver "restrictive" hơn. Hầu hết case OK.

## Pattern: Functional interface

Go không có `lambda` keyword nhưng function value implement interface đẹp:
```go
type Handler interface {
    Handle(req Request) Response
}

// Adapter — function thành Handler
type HandlerFunc func(req Request) Response

func (f HandlerFunc) Handle(req Request) Response {
    return f(req)
}

// Dùng
var h Handler = HandlerFunc(func(r Request) Response {
    return Response{}
})
```

`net/http`: `http.HandlerFunc` adapter chính là pattern này.

## Bonus: interface với generic (Go 1.18+)

```go
// Constraint
type Number interface {
    int | int64 | float64
}

func Sum[T Number](nums []T) T {
    var sum T
    for _, n := range nums {
        sum += n
    }
    return sum
}

Sum([]int{1, 2, 3})       // 6
Sum([]float64{1.1, 2.2})  // 3.3
```

→ Interface dùng làm constraint cho generic. Type set với `|`.

## Quick reference

```go
// Define interface
type Reader interface {
    Read(p []byte) (n int, err error)
}

// Composed interface
type ReadWriter interface {
    Reader
    Writer
}

// Empty
var x any   // = interface{}

// Type assert
v, ok := i.(MyType)

// Type switch
switch v := i.(type) {
case int: ...
case string: ...
default: ...
}

// Compile-time check
var _ Interface = (*Type)(nil)

// Best practice
// 1. Small interfaces (1-2 method)
// 2. Define at consumer side
// 3. Accept interface, return struct
// 4. Pointer receiver consistent
```

## Tóm tắt bài 2

- Interface = contract — set of method signatures.
- **Implicit satisfaction** — type có đủ method = auto implement.
- Interface định nghĩa ở **consumer**, không phải provider → loose coupling.
- Empty `any` = mọi type. Generic Go 1.18+ thay cho phần lớn.
- Type assertion `i.(T)` + comma-ok. Type switch dispatch.
- Interface value = `(Type, Value)`. Nil interface khác interface chứa nil pointer.
- Best practice: interface nhỏ, accept interface return struct, define ở consumer.
- DI Go-style: không cần framework, chỉ cần interface + constructor.
- Pointer vs value receiver ảnh hưởng interface satisfaction.

**Bài kế tiếp** → [Bài 3: Composition + Embedding — Thay thế inheritance](03-composition-embedding.md)
