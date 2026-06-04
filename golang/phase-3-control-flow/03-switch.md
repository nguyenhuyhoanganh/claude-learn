# Bài 3: Switch — Go's secret weapon mạnh hơn Java/C nhiều

Switch trong C/Java chỉ là `if-else if-else if` viết gọn — và còn buộc `break` mỗi case (quên thì fall-through gây bug). Switch trong Go: **không cần break**, **case là expression bất kỳ**, **switch không cần subject**, và **switch type** cho phép dispatch theo type runtime. Đây là 4 super-power mà người Java mới chuyển qua Go thường bỏ phí.

## Switch cơ bản (C-style nhưng tốt hơn)

```go
day := "Sunday"

switch day {
case "Sunday", "Saturday":
    fmt.Println("weekend")
case "Monday", "Tuesday":
    fmt.Println("work days, lots of meetings")
default:
    fmt.Println("midweek")
}
```

So với Java:
- Không cần `break` — Go tự thoát sau case match.
- Multiple value trong 1 case dùng `,`.
- `default` không cần ở cuối — nhưng convention đặt cuối.

Bằng Java tương đương:
```java
switch (day) {
    case "Sunday":
    case "Saturday":
        System.out.println("weekend");
        break;  // nếu quên → fall-through SAI
    case "Monday":
    case "Tuesday":
        System.out.println("work days, lots of meetings");
        break;
    default:
        System.out.println("midweek");
}
```

→ Java verbose + dễ bug quên break. Go gọn + an toàn mặc định.

## Super-power #1: Switch không có expression

```go
hour := time.Now().Hour()

switch {
case hour < 12:
    fmt.Println("morning")
case hour < 17:
    fmt.Println("afternoon")
default:
    fmt.Println("evening")
}
```

Khi `switch` không có subject, mỗi `case` là **boolean expression**. Tương đương `if-else if-else` nhưng đọc dễ hơn.

→ Pattern này thay thế cho if-else dài.

## Super-power #2: Switch với init

Giống `if init; cond`:

```go
switch x := getValue(); {
case x < 0:
    fmt.Println("negative")
case x == 0:
    fmt.Println("zero")
case x > 0:
    fmt.Println("positive")
}
```

Hoặc:
```go
switch v := getValue(); v {
case "a":
    fmt.Println("alpha")
case "b":
    fmt.Println("beta")
}
```

## Super-power #3: Fall-through explicit

Nếu muốn fall-through như C: dùng keyword `fallthrough`:

```go
switch grade {
case 'A':
    fmt.Println("excellent")
    fallthrough
case 'B':
    fmt.Println("pass")
case 'F':
    fmt.Println("fail")
}
// grade='A' → "excellent" và "pass"
// grade='B' → chỉ "pass"
```

→ Explicit. Không bị bug "quên break".

Hiếm dùng (thường thay bằng `,`). Nhưng có lúc cần cho state machine.

## Super-power #4: Type switch

Đây là siêu năng lực thật sự — không ngôn ngữ phổ biến nào có syntax gọn như Go.

```go
func describe(i any) {
    switch v := i.(type) {
    case int:
        fmt.Printf("int: %d\n", v)
    case string:
        fmt.Printf("string: %q (len %d)\n", v, len(v))
    case bool:
        fmt.Printf("bool: %t\n", v)
    case []int:
        fmt.Printf("slice of int: %v\n", v)
    case nil:
        fmt.Println("nil")
    default:
        fmt.Printf("unknown type: %T\n", v)
    }
}

describe(42)            // int: 42
describe("hello")       // string: "hello" (len 5)
describe(true)          // bool: true
describe([]int{1,2})    // slice of int: [1 2]
describe(3.14)          // unknown type: float64
```

Phân tích:
- `i any` (= `interface{}`) — nhận bất kỳ type.
- `v := i.(type)` — pseudo-syntax, chỉ dùng trong switch.
- Trong mỗi case, `v` có type cụ thể của case đó.

Áp dụng:
- Decode JSON unknown shape.
- Plugin system.
- Generic-like behavior (trước khi Go có generic 1.18+).

## Switch trên struct field

```go
type Event struct {
    Type    string
    Payload any
}

func handle(e Event) {
    switch e.Type {
    case "user.created":
        sendWelcomeEmail(e.Payload)
    case "user.deleted":
        archiveData(e.Payload)
    case "order.placed":
        chargeCustomer(e.Payload)
    default:
        logUnknown(e)
    }
}
```

Pattern phổ biến cho event-driven system.

## Switch cho enum

```go
type LogLevel int

const (
    LevelInfo LogLevel = iota
    LevelWarn
    LevelError
)

func format(l LogLevel) string {
    switch l {
    case LevelInfo:
        return "[INFO]"
    case LevelWarn:
        return "[WARN]"
    case LevelError:
        return "[ERROR]"
    default:
        return "[UNKNOWN]"
    }
}
```

Hơn `if-else` về readability + Go vet warning nếu thiếu case (với linter `exhaustive`).

## Range expression trong case

Go không cho `case x > 5` trong switch có subject. Workaround: switch không subject:

```go
// Sai
switch x {
case > 5:   // COMPILE ERROR
    ...
}

// Đúng
switch {
case x > 5:
    ...
}
```

Một số ngôn ngữ khác (Kotlin, Rust) có pattern match mạnh hơn. Go cố tình giữ đơn giản.

## Switch trong handle error

```go
func process(input string) {
    err := doWork(input)
    switch {
    case err == nil:
        fmt.Println("success")
    case errors.Is(err, ErrNotFound):
        fmt.Println("not found, skipping")
    case errors.Is(err, ErrTimeout):
        fmt.Println("timeout, retrying")
    default:
        fmt.Println("fatal:", err)
    }
}
```

Phase 5 (Error handling) sẽ kỹ `errors.Is`, `errors.As`.

## Switch dispatcher pattern

Production: HTTP handler dispatch theo path/method.

```go
func router(w http.ResponseWriter, r *http.Request) {
    switch {
    case r.Method == "GET" && r.URL.Path == "/users":
        listUsers(w, r)
    case r.Method == "POST" && r.URL.Path == "/users":
        createUser(w, r)
    case r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/users/"):
        getUser(w, r)
    default:
        http.NotFound(w, r)
    }
}
```

Project thật dùng router lib (Gin, Echo, Chi), nhưng pattern switch dispatcher rất phổ biến cho microservice nhỏ.

## State machine với switch

```go
type State int

const (
    StateIdle State = iota
    StateRunning
    StatePaused
    StateStopped
)

func transition(current State, event string) State {
    switch current {
    case StateIdle:
        if event == "start" {
            return StateRunning
        }
    case StateRunning:
        switch event {
        case "pause":
            return StatePaused
        case "stop":
            return StateStopped
        }
    case StatePaused:
        if event == "resume" {
            return StateRunning
        }
    }
    return current
}
```

Nested switch cho hierarchical state — vẫn đọc được.

## Bẫy phổ biến

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên `default` trong type switch | Crash khi type mới | Luôn có `default` |
| Dùng `fallthrough` ở case cuối | Compile error | Đừng dùng cuối |
| `case > 5` trong switch có subject | Compile error | Dùng switch không subject |
| Case duplicate value | Compile error | Compiler bắt |
| Type switch không check type cụ thể | Type assertion sai | List case kỹ |
| Switch trên float so sánh equal | Precision issue | Dùng range |
| Switch dài 20+ case | Hard to maintain | Refactor thành map lookup |

### Refactor switch dài thành map

Khi switch chỉ map value → handler/action:
```go
// Trước: switch
switch action {
case "create":
    handleCreate()
case "update":
    handleUpdate()
case "delete":
    handleDelete()
}

// Sau: map of function
handlers := map[string]func(){
    "create": handleCreate,
    "update": handleUpdate,
    "delete": handleDelete,
}
if h, ok := handlers[action]; ok {
    h()
}
```

Map lookup O(1), switch O(n). Với n nhỏ thì switch nhanh hơn (compiler optimize), với n lớn thì map win.

## Switch vs if vs map — Khi nào dùng gì?

| Use case | Lựa chọn |
|---|---|
| 1-2 condition đơn giản | `if` |
| 3-7 case đối chiếu value | `switch` |
| 8+ case → handler tương ứng | `map[string]Handler` |
| Range check `< > >=` | `switch` không subject |
| Type dispatch | `switch x.(type)` |
| Error type check | `switch + errors.Is` |
| State machine | nested `switch` |

## Quick reference

```go
// Expression switch
switch x {
case 1, 2, 3:
    // ...
case 4:
    // ...
default:
    // ...
}

// Expressionless (= if-else chain)
switch {
case x < 0:
case x == 0:
case x > 0:
}

// With init
switch v := f(); v {
case "a":
case "b":
}

// Type switch
switch v := i.(type) {
case int:
case string:
case nil:
default:
}

// Fallthrough
switch x {
case 1:
    fmt.Println("one")
    fallthrough
case 2:
    fmt.Println("two")
}
```

## Tóm tắt bài 3

- Không cần `break` mặc định — tự thoát.
- Multiple value trong 1 case: `case "a", "b":`.
- Switch không có subject = if-else chain gọn.
- Switch với init: `switch x := f(); x { ... }`.
- `fallthrough` explicit, hiếm dùng.
- **Type switch** `switch v := i.(type)` — siêu mạnh, dispatch theo runtime type.
- Dispatcher pattern, state machine — switch là natural fit.
- Switch dài 8+ case → refactor thành `map[K]Handler`.

**Bài kế tiếp** → [Bài 4: Sales Order Processor — Project áp dụng for, if, switch, map](04-project-sales-order.md)
