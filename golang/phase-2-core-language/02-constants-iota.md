# Bài 2: Constants, iota và Enums "kiểu Go"

Constants nghe đơn giản, nhưng Go có một keyword độc đáo gọi là **`iota`** biến nó thành tool tạo enum, bitmask, lookup table cực mạnh — không ngôn ngữ phổ biến nào có tương đương. Nắm `iota` là tiêu chí phân biệt người viết Go "đúng kiểu" với người chỉ porting code từ Java/C++.

## Constants cơ bản

```go
const Pi = 3.14
const Greeting = "Hello"
const MaxRetries = 5
const IsProduction = true
```

Đặc điểm:
- **Bất biến**: gán lại = compile error.
- **Không có địa chỉ**: không lấy `&Pi` được.
- **Inline tại compile time**: không tốn runtime cost.
- **Untyped by default**: linh hoạt convert.

```go
const N = 100
var x int32 = N        // OK — N untyped, convert được
var y int64 = N        // OK
var z float64 = N      // OK
```

Nếu giai cụ thể type:
```go
const N int32 = 100
var x int32 = N        // OK
var y int64 = N        // COMPILE ERROR — type mismatch
```

→ Best practice: **không gán type cho const** trừ khi cần. Để compiler tự convert.

## Constants block — nhóm nhiều const

```go
const (
    Host     = "localhost"
    Port     = 8080
    AppName  = "myapp"
    Pi       = 3.14159
)
```

Đọc dễ hơn nhiều so với:
```go
const Host = "localhost"
const Port = 8080
const AppName = "myapp"
const Pi = 3.14159
```

Convention: 1 block cho 1 nhóm chủ đề.

## Sai khác giữa `var` và `const`

| | `const` | `var` |
|---|---|---|
| Giá trị | Compile-time | Runtime |
| Đổi được | KHÔNG | CÓ |
| Có địa chỉ (`&`) | KHÔNG | CÓ |
| Type | Untyped optional | Bắt buộc (hoặc infer) |
| Function call làm value | KHÔNG | CÓ |
| Map/slice/struct làm value | KHÔNG | CÓ |

```go
const N = 5             // OK
const T = time.Now()    // ERROR: function call không phải compile-time
const M = []int{1, 2}   // ERROR: slice không compile-time
```

→ `const` chỉ chứa primitive (số, chuỗi, bool) tại compile time.

## `iota` — Counter compile-time

`iota` là identifier đặc biệt trong `const` block, **bắt đầu từ 0 và tự tăng theo mỗi dòng**:

```go
const (
    Sunday    = iota  // 0
    Monday            // 1   (kế thừa expression "= iota")
    Tuesday           // 2
    Wednesday         // 3
    Thursday          // 4
    Friday            // 5
    Saturday          // 6
)
```

Cú pháp `Monday` (không có `= iota`) **kế thừa expression** từ dòng trên — quy tắc đặc biệt chỉ trong `const` block. Tương đương:
```go
const (
    Sunday    = iota   // 0
    Monday    = iota   // 1
    Tuesday   = iota   // 2
    // ...
)
```

→ Viết theo cách đầu tiên gọn hơn rất nhiều.

## `iota` biến thiên — Bắt đầu từ 1

Hai cách:

```go
// Cách 1: Skip 0
const (
    _ = iota          // bỏ qua 0
    Sunday            // 1
    Monday            // 2
)

// Cách 2: Offset
const (
    Sunday = iota + 1 // 1
    Monday            // 2  (iota=1, +1 = 2)
    Tuesday           // 3
)
```

## `iota` cho bitmask (flag)

Đây là pattern siêu mạnh khi cần kết hợp flag:

```go
const (
    PermissionRead    = 1 << iota   // 1 << 0 = 1 (binary 0001)
    PermissionWrite                 // 1 << 1 = 2 (binary 0010)
    PermissionExecute               // 1 << 2 = 4 (binary 0100)
    PermissionDelete                // 1 << 3 = 8 (binary 1000)
)

// Combine
var p = PermissionRead | PermissionWrite  // 3 (binary 0011)

// Check
if p&PermissionRead != 0 {
    fmt.Println("can read")
}
```

→ Đây chính là cách kernel Linux flag, HTTP method (GET, POST flag), CSS class match được implement.

## `iota` skip với `_`

```go
const (
    StatusOK    = iota  // 0
    _                   // 1 (skipped — reserved)
    StatusFound         // 2
    StatusError         // 3
)
```

## `iota` reset mỗi const block

```go
const (
    Red = iota   // 0
    Green        // 1
    Blue         // 2
)

const (
    Small = iota // 0  ← reset
    Medium       // 1
    Large        // 2
)
```

`iota` reset về 0 ở mỗi `const (...)` block mới.

## Enums "kiểu Go" — Type-safe Pattern

Go không có keyword `enum` như Java/Rust, nhưng combine `type` + `const` + `iota` cho ra pattern tốt hơn:

```go
// Định nghĩa type alias
type LogLevel int

// Define enum values
const (
    LevelTrace LogLevel = iota
    LevelDebug
    LevelInfo
    LevelWarning
    LevelError
    LevelFatal
)
```

So với `const Trace = 0`, pattern này:
- **Type-safe**: function nhận `LogLevel` không nhận `int` ngẫu nhiên.
- **Có thể attach method**.

```go
// Thêm method để in tên
var levelNames = []string{
    LevelTrace:   "TRACE",
    LevelDebug:   "DEBUG",
    LevelInfo:    "INFO",
    LevelWarning: "WARN",
    LevelError:   "ERROR",
    LevelFatal:   "FATAL",
}

func (l LogLevel) String() string {
    if l < LevelTrace || l > LevelFatal {
        return "UNKNOWN"
    }
    return levelNames[l]
}
```

→ Method `String()` thuộc interface `fmt.Stringer`. Khi `fmt.Println(LevelInfo)` → tự gọi `.String()` → in "INFO".

```go
fmt.Println(LevelInfo)        // INFO (không phải "2")
fmt.Println(LevelError)       // ERROR
fmt.Println(LogLevel(99))     // UNKNOWN

// Type safety
func log(level LogLevel, msg string) { /* ... */ }
log(LevelInfo, "started")     // OK
log(42, "started")            // COMPILE ERROR: int không phải LogLevel
```

→ Đây là cách K8s, Docker, Hugo, Terraform define enum. Standard pattern.

## Pitfall — type alias không phải bảo vệ hoàn toàn

```go
log(LogLevel(42), "danger")  // OK — convert được
```

Go cho phép convert int → LogLevel explicit. Nếu cần thắt chặt thêm, dùng validation:
```go
func (l LogLevel) IsValid() bool {
    return l >= LevelTrace && l <= LevelFatal
}

func log(level LogLevel, msg string) error {
    if !level.IsValid() {
        return fmt.Errorf("invalid log level: %d", level)
    }
    // ...
}
```

## Stringer interface — Tự động print đẹp

Khi type satisfy interface `fmt.Stringer`:
```go
type Stringer interface {
    String() string
}
```

→ `fmt.Println(x)`, `fmt.Printf("%s", x)`, `fmt.Sprintf("%v", x)` tự gọi `.String()`.

Pattern: mọi enum bạn define nên có `.String()`.

```go
type Color int

const (
    Red Color = iota
    Green
    Blue
)

func (c Color) String() string {
    return [...]string{"red", "green", "blue"}[c]
}

fmt.Println(Red)      // red (không phải "0")
```

## Use case thực tế

### HTTP status codes

```go
type HTTPStatus int

const (
    StatusOK          HTTPStatus = 200
    StatusCreated                = 201   // kế thừa HTTPStatus
    StatusBadRequest             = 400
    StatusUnauthorized           = 401
    StatusNotFound               = 404
    StatusServerError            = 500
)
```

→ Type-safe, không dùng nhầm 200 vs 500. Net/http stdlib có sẵn (`http.StatusOK`).

### Permission flags

```go
type Permission uint8

const (
    PermRead    Permission = 1 << iota
    PermWrite
    PermExecute
    PermAdmin
)

func (u User) CanWrite() bool {
    return u.Permission&PermWrite != 0
}

func (u User) Grant(p Permission) {
    u.Permission |= p
}

func (u User) Revoke(p Permission) {
    u.Permission &^= p   // AND NOT — bit clear
}
```

### Size constants với số lớn

```go
const (
    _  = iota
    KB = 1 << (10 * iota)   // 1 << 10 = 1024
    MB                       // 1 << 20
    GB                       // 1 << 30
    TB                       // 1 << 40
    PB                       // 1 << 50
)

fmt.Println(KB, MB, GB)  // 1024 1048576 1073741824
```

→ Đây là code thật trong nhiều thư viện network (HTTP body size limit, file upload limit).

## Bẫy phổ biến với constants

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Dùng `var` cho giá trị bất biến | Có thể bị gán lại do nhầm | `const` cho mọi giá trị bất biến |
| Const trong function, không export | Mọi nơi khác không dùng được | Move ra package level nếu cần share |
| `iota` không trong cùng block | Đếm không đúng | `iota` chỉ work trong cùng `const ()` |
| Quên type cho enum | `int` mọi nơi → type-unsafe | Define `type X int` |
| Quên `.String()` cho enum | Print ra số khó hiểu | Implement `Stringer` |
| Compare enum với magic number | `if level == 2` vs `if level == LevelInfo` | Luôn dùng tên |
| Reuse `iota` value cho 2 thứ khác nhau | Bug logic | Mỗi `const ()` block cho 1 nhóm |
| Bitmask trùng bit | Flag không phân biệt | `1 << iota` đảm bảo unique |

## Pattern production: feature flag

```go
type Feature uint32

const (
    FeatureNewUI Feature = 1 << iota
    FeatureBetaSearch
    FeatureAIChat
    FeatureExperimentalAuth
)

type User struct {
    ID       int
    Features Feature
}

func (u *User) Has(f Feature) bool {
    return u.Features&f != 0
}

func (u *User) Enable(f Feature) {
    u.Features |= f
}

// Dùng:
alice := &User{ID: 1}
alice.Enable(FeatureNewUI | FeatureAIChat)
if alice.Has(FeatureAIChat) {
    // hiện AI chat UI
}
```

→ Lưu vào DB 1 cột `int` chứa nhiều flag → tiết kiệm space, query nhanh.

## So sánh enum với ngôn ngữ khác

```rust
// Rust — enum riêng biệt, không phải int
enum LogLevel {
    Trace, Debug, Info, Warning, Error
}
```

```java
// Java — enum riêng, có method
public enum LogLevel {
    TRACE, DEBUG, INFO, WARNING, ERROR;
    public String label() { return name(); }
}
```

```go
// Go — int alias + const
type LogLevel int
const ( LevelTrace LogLevel = iota; ... )
func (l LogLevel) String() string { ... }
```

Rust/Java enum **không thể convert int** → an toàn hơn. Go cho phép convert → linh hoạt hơn nhưng cần validation.

Trade-off: Go đơn giản, không cần feature riêng cho enum.

## Tóm tắt bài 2

- `const` cho giá trị bất biến tại compile-time. Không lấy được địa chỉ.
- `const` block (`const (...)`) gọn cho nhóm.
- `iota`: counter tự tăng trong const block, bắt đầu 0, reset mỗi block.
- Pattern enum: `type X int` + `const ( A X = iota; B; C )`.
- `1 << iota` cho bitmask flag — kết hợp với OR (`|`), AND (`&`), AND NOT (`&^`).
- Implement `String() string` cho enum → print đẹp tự động.
- Enum Go không type-safe tuyệt đối (cho convert) → cần `IsValid()` khi cần.
- Use case: HTTP status, permission, feature flag, size constant.

**Bài kế tiếp** → [Bài 3: Custom Logger — Project đầu tiên áp dụng iota + Stringer](03-project-custom-logger.md)
