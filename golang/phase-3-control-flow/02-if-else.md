# Bài 2: if-else và pattern "if với init" đặc trưng Go

`if-else` thì ngôn ngữ nào cũng có. Nhưng Go thêm một quirky đặc biệt: bạn được phép **khởi tạo biến ngay trong if**. Pattern này lặp ở 90% code Go production — đặc biệt là check error. Hiểu nó là bước đầu tiên viết "Go-way" thay vì "Java-way".

## Syntax cơ bản

```go
if temperature > 30 {
    fmt.Println("nóng")
}

if score >= 90 {
    fmt.Println("A")
} else if score >= 80 {
    fmt.Println("B")
} else if score >= 70 {
    fmt.Println("C")
} else {
    fmt.Println("fail")
}
```

Khác C/Java:
- **Không có dấu `()`** quanh condition.
- **Bắt buộc dấu `{}`** — kể cả 1 dòng. Không có `if x {y}` trên 1 dòng.
- `else` phải ở cùng dòng với `}` đóng.

```go
// SAI
if x > 0
{                  // brace xuống dòng — COMPILE ERROR
    ...
}

// ĐÚNG
if x > 0 {
    ...
} else {           // else cùng dòng với }
    ...
}
```

→ Convention cứng. Không có debate "Allman vs K&R brace style".

## Condition phải là boolean

Khác C/Python — Go không có "truthy/falsy":

```go
// C: hợp lệ
if (x) { ... }      // x != 0
if (s) { ... }      // s != NULL

// Go: COMPILE ERROR
if x { ... }        // x không phải bool
if s { ... }
```

Phải explicit:
```go
if x != 0 { ... }
if s != "" { ... }
if user != nil { ... }
```

→ Tránh bug âm thầm. Đặc biệt với `0`, `""`, `nil` có ý nghĩa logic khác nhau.

## Toán tử logic

```go
if x > 0 && y > 0 { ... }   // AND
if x > 0 || y > 0 { ... }   // OR
if !done { ... }            // NOT

// Short-circuit
if user != nil && user.Active { ... }
// Nếu user nil → không evaluate user.Active → tránh nil pointer
```

## Pattern signature: if với init statement

Đây là feature đặc trưng của Go:

```go
if err := doSomething(); err != nil {
    return err
}
```

Phân tích:
```go
if <init>; <condition> {
   <body>
}
```

`err` chỉ tồn tại trong `if` block (và `else if`, `else`). Không leak ra ngoài.

```go
if value, ok := myMap["key"]; ok {
    fmt.Println("found:", value)
} else {
    fmt.Println("missing")
}

// value, ok không available ở đây
```

### Tại sao pattern này quan trọng

Hai cách viết, một logic:

```go
// Cách 1: split — biến scope rộng
value, err := strconv.Atoi(input)
if err != nil {
    return err
}
// value vẫn tồn tại — nhưng giờ là valid value
useValue(value)
```

```go
// Cách 2: if với init — biến scope hẹp
if value, err := strconv.Atoi(input); err != nil {
    return err
} else {
    useValue(value)
}
```

Vẻ ngoài cách 2 đẹp hơn, nhưng convention Go khuyến nghị cách 1 nếu cần dùng `value` sau:

```go
// Cách 3 (Go-way) — split khi cần dùng value bên ngoài
value, err := strconv.Atoi(input)
if err != nil {
    return err
}
useValue(value)
```

Chỉ dùng `if init` khi biến **chỉ cần trong if/else**:
```go
if v, ok := cache[k]; ok {
    return v   // không cần v ngoài if
}
return fetch(k)
```

## Pattern: check error rồi return

Đây là idiom #1 trong code Go:

```go
file, err := os.Open(path)
if err != nil {
    return fmt.Errorf("open %q: %w", path, err)
}
defer file.Close()
```

90% function Go có 1+ block `if err != nil { return ... }`. Quen sớm thì viết Go nhanh.

Đây là lý do Go không có exception — error là value, check bằng `if`, return explicit.

## Pattern: nil check trước dereference

```go
if user == nil {
    return errors.New("user is nil")
}
fmt.Println(user.Name)
```

Hoặc combined:
```go
if user == nil || user.Active == false {
    return errors.New("user invalid")
}
```

Short-circuit `||`: nếu `user == nil` true → bỏ qua check thứ 2 → tránh nil pointer.

## Pattern: lookup map với comma-ok

```go
prices := map[string]float64{"tshirt": 20}

// Sai: không phân biệt "không có key" và "value = 0"
price := prices["mug"]   // 0.0 — nhưng key không tồn tại

// Đúng: comma-ok idiom
if price, ok := prices["mug"]; ok {
    fmt.Printf("mug price: $%.2f\n", price)
} else {
    fmt.Println("mug not in catalog")
}
```

Áp dụng cho map, type assertion, channel receive — bài Phase 4 (map), Phase 6 (type assertion), Phase 8 (channel) chi tiết.

## Early return / Guard clause

Pattern Go chuẩn: check error early, return ngay, body chính ở cuối "thẳng".

```go
// SAI: pyramid of doom
func process(input string) error {
    if input != "" {
        if validated := validate(input); validated {
            if user := findUser(input); user != nil {
                if err := save(user); err == nil {
                    return nil
                } else {
                    return err
                }
            } else {
                return errors.New("not found")
            }
        } else {
            return errors.New("invalid")
        }
    } else {
        return errors.New("empty")
    }
}
```

```go
// ĐÚNG: early return
func process(input string) error {
    if input == "" {
        return errors.New("empty")
    }
    if !validate(input) {
        return errors.New("invalid")
    }
    user := findUser(input)
    if user == nil {
        return errors.New("not found")
    }
    if err := save(user); err != nil {
        return err
    }
    return nil
}
```

→ Đọc từ trên xuống tuyến tính. Không nested. Không `else` không cần thiết.

Convention: **không cần `else` sau `return`**. `golangci-lint` báo warning.

```go
// Không cần
if x > 0 {
    return positive
} else {
    return negative
}

// Đẹp hơn
if x > 0 {
    return positive
}
return negative
```

## So sánh với ternary operator

Go **không có** ternary (`condition ? a : b`). Quyết định thiết kế — code readable hơn nếu dùng `if`:

```go
// Java/JS
String result = x > 0 ? "positive" : "negative";

// Go — phải dùng if
var result string
if x > 0 {
    result = "positive"
} else {
    result = "negative"
}
```

Có vẻ verbose, nhưng:
- Không ai tranh cãi style.
- Code dễ debug (breakpoint từng nhánh).
- Trade một dòng để đọc rõ hơn.

Helper function nếu cần ngắn:
```go
func ifElse[T any](cond bool, a, b T) T {
    if cond { return a }
    return b
}

result := ifElse(x > 0, "positive", "negative")
```

(Generic Go 1.18+. Phase 5 sẽ học.)

## Real-world examples

### Auth check

```go
func handleRequest(w http.ResponseWriter, r *http.Request) {
    token := r.Header.Get("Authorization")
    if token == "" {
        http.Error(w, "missing token", http.StatusUnauthorized)
        return
    }
    
    user, err := authenticate(token)
    if err != nil {
        http.Error(w, "invalid token", http.StatusUnauthorized)
        return
    }
    
    if !user.HasRole("admin") {
        http.Error(w, "forbidden", http.StatusForbidden)
        return
    }
    
    // happy path
    serveAdminPanel(w, user)
}
```

→ Chain of guards. Mỗi check fail → return ngay. Body chính cuối cùng.

### Config validation

```go
func loadConfig(path string) (*Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("read config: %w", err)
    }
    
    var cfg Config
    if err := json.Unmarshal(data, &cfg); err != nil {
        return nil, fmt.Errorf("parse config: %w", err)
    }
    
    if cfg.Port == 0 {
        cfg.Port = 8080  // default
    }
    if cfg.DBHost == "" {
        return nil, errors.New("db_host required")
    }
    
    return &cfg, nil
}
```

## Bẫy phổ biến

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Brace xuống dòng | Compile fail | `{` cuối dòng if |
| `if x` với x không phải bool | Compile fail | Compare explicit |
| Nested deep | Khó đọc | Early return |
| `else` sau `return` | Lint warning | Bỏ `else` |
| Shadow biến trong if init | Logic sai | Cẩn thận `:=` |
| Map lookup không check ok | Confuse 0 và missing | `if v, ok := m[k]; ok` |
| Quên `defer Close()` sau open | Resource leak | `defer` ngay sau open |
| Type assertion không check | Panic runtime | `if v, ok := x.(Type); ok` |
| `if err == nil` thay `if err != nil` | Logic ngược | Đọc kỹ |

### Bẫy shadow đặc biệt

```go
err := outerCall()
if err != nil {
    err := innerCall()   // ← shadow! tạo err mới trong if
    if err != nil {
        return err
    }
    // err outer vẫn != nil, nhưng đã bị cover
}
return err   // return err outer (lỗi cũ chưa được handle)
```

→ Đây là bug rất khó debug. `go vet` bắt được nếu chạy. Linter `shadow` strict hơn.

## Quick reference

```go
// Cơ bản
if cond { }
if cond { } else { }
if cond1 { } else if cond2 { } else { }

// With init
if x := getValue(); x > 0 { }
if v, ok := m[k]; ok { }
if err := f(); err != nil { return err }

// Toán tử
if a && b { }
if a || b { }
if !flag { }
if u != nil && u.Active { }    // safe nil check
```

## Tóm tắt bài 2

- Syntax: `if cond { }`, không có `()`, brace cuối dòng.
- Condition phải boolean — không có truthy/falsy.
- **`if init; cond`** = đặc trưng Go: khai báo biến scope hẹp trong if.
- Pattern `if err != nil { return ... }` xuất hiện ở 90% function.
- Early return / guard clause thay nested deep.
- **Không có ternary** — phải dùng `if`.
- Bỏ `else` sau `return`.
- Bẫy shadow `err := ...` trong if cần cẩn thận.

**Bài kế tiếp** → [Bài 3: Switch — Go's secret weapon mạnh hơn Java/C nhiều](03-switch.md)
