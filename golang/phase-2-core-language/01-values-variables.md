# Bài 1: Values và Variables — Bộ não của mọi chương trình Go

Mỗi dòng code bạn viết đều xoay quanh **value** (giá trị thực: số, chữ, true/false) và **variable** (cái hộp chứa giá trị, có tên, có địa chỉ trong RAM). Hiểu rõ 2 thứ này quyết định bạn viết được code performant hay không. Go có hệ thống type **rất nghiêm** so với Python/JS — đặc biệt là không có implicit conversion. Bù lại, code không lỗi runtime kiểu "undefined is not a function".

## Value types cơ bản trong Go

```go
// String
"Hello, Go"
`raw string với "quote" được giữ nguyên`

// Integer (int, int8, int16, int32, int64, uint, uint8...)
42
-100
0xFF       // hex
0b1010     // binary
0o777      // octal

// Float (float32, float64)
3.14
1e9        // scientific
.5

// Boolean
true
false

// Complex (hiếm dùng)
3+4i

// Nil — không value
nil
```

Khác với Python (`int` vô hạn), Go có **int kích thước cố định** — quan trọng khi tính memory.

## Sizing cụ thể

| Type | Size | Range |
|---|---|---|
| `int8` | 1 byte | -128 → 127 |
| `int16` | 2 byte | -32768 → 32767 |
| `int32` | 4 byte | ~-2.1B → 2.1B |
| `int64` | 8 byte | ~-9.2 × 10^18 → 9.2 × 10^18 |
| `int` | 4 hoặc 8 byte | Tuỳ platform (64-bit OS = int64) |
| `uint8` (= `byte`) | 1 byte | 0 → 255 |
| `uint32` | 4 byte | 0 → ~4.3B |
| `uint` | 4 hoặc 8 byte | Tuỳ platform |
| `float32` | 4 byte | ~7 digit precision |
| `float64` | 8 byte | ~15 digit precision |
| `bool` | 1 byte | true / false |
| `string` | 16 byte header | (data ngoài header) |

**Best practice**: dùng `int` cho counter, index, ID. Chỉ dùng `int32`, `int64` cụ thể khi serialize (DB, network), khi cần size cố định.

## Declare variable: 3 cách

```go
// Cách 1: var với type
var greeting string
greeting = "Hello"

// Cách 2: var với initial value (compiler infer type)
var greeting = "Hello"   // string
var count = 10           // int

// Cách 3: short declaration (chỉ trong function)
greeting := "Hello"      // = var greeting string = "Hello"
count := 10              // = var count int = 10
```

**`:=` chỉ dùng được trong function body.** Ngoài function (package-level), bắt buộc `var`:
```go
package main

var globalCount = 0      // OK
// globalCount := 0      // COMPILE ERROR ở package level

func main() {
    local := 5           // OK
}
```

## Zero value — Go không bao giờ để memory rác

Đây là điểm khác biệt căn bản với C/C++:

```go
var name string   // ""
var count int     // 0
var price float64 // 0.0
var active bool   // false
var data []int    // nil
var user *User    // nil
```

Mọi variable Go khai báo đều có **giá trị mặc định an toàn**. Không bao giờ "garbage memory" như C.

→ Nghĩa là code này hoàn toàn hợp lệ:
```go
var count int
count++
fmt.Println(count)  // 1
```

Trong C/C++, `count` có thể là bất kỳ value rác nào và `count++` là undefined behavior.

## Type inference

Go compiler đoán type từ value bên phải:

```go
greeting := "Hello"  // string
count := 10          // int  (không phải int64)
price := 9.99        // float64 (không phải float32)
active := true       // bool
nothing := nil       // ERROR: nil không có type rõ
```

→ `nil` cần explicit type:
```go
var data []int = nil    // OK
var user *User = nil    // OK
```

## Multiple declaration

```go
// Cùng type
var x, y, z int = 1, 2, 3

// Khác type
var (
    name    string = "Alice"
    age     int    = 30
    active  bool   = true
)

// Short form
name, age := "Bob", 25
```

Pattern phổ biến: return multiple value từ function (sẽ học bài Functions):
```go
value, err := strconv.Atoi("42")
if err != nil { /* handle */ }
```

## Tại sao Go cấm variable không dùng?

```go
func main() {
    x := 10
    fmt.Println("hi")
}
// COMPILE ERROR: x declared and not used
```

Không phải warning. **Compile error**. Lý do:
- Variable không dùng = lỗi logic tiềm ẩn (gán nhầm, quên dùng).
- Code rác làm reviewer bối rối.
- Go intentional làm khó để force code sạch.

Workaround khi thật sự không dùng:
```go
x := getValue()
_ = x              // assign vào blank identifier — compile OK
```

Hoặc xoá luôn dòng `x :=`. Đây là cách đúng.

## So sánh declare giữa các ngôn ngữ

```go
// Go
var name string = "Alice"
age := 30
```

```java
// Java — type bên trái
String name = "Alice";
int age = 30;
```

```python
# Python — không type
name = "Alice"
age = 30
```

```rust
// Rust — :type giống Go
let name: String = String::from("Alice");
let age = 30;
```

Go đặt **type bên phải** (giống Pascal, Rust, TypeScript). Nhiều người Java/C++ ban đầu khó chịu, nhưng có lý do — khi đọc đoạn code phức tạp như `var users []User`, mắt scan từ trái sang phải đọc được **"users là một slice của User"**, hợp ngôn ngữ tự nhiên.

## Type conversion — Go cấm implicit

Code này trong Python/JS chạy bình thường:
```python
x = 5
y = 3.14
print(x + y)  # 8.14
```

Trong Go: **COMPILE ERROR**:
```go
x := 5
y := 3.14
fmt.Println(x + y)  // ERROR: mismatched types int and float64
```

Phải convert explicit:
```go
fmt.Println(float64(x) + y)  // 8.14
// Hoặc
fmt.Println(x + int(y))      // 8
```

Tại sao? Tránh bug âm thầm. Python `int + float = float` không phải lúc nào cũng đúng intent. Go bắt bạn thể hiện rõ.

```go
// Convert phổ biến
var i int = 65
var f float64 = float64(i)
var u uint = uint(f)
var s string = string(rune(i))  // 'A' — int 65 = 'A' Unicode

// Số → chuỗi (KHÔNG dùng string(int) — nó cho ký tự Unicode)
n := 42
s := strconv.Itoa(n)        // "42" — đúng

// Chuỗi → số
n, err := strconv.Atoi("42")
if err != nil { /* xử lý */ }
```

## String — không chỉ là array char

```go
s := "Hello"
fmt.Println(len(s))      // 5

// String trong Go là sequence of bytes (UTF-8)
emoji := "👋 xin chào"
fmt.Println(len(emoji))  // 14 (byte, không phải character)

// Đếm character thật sự (rune)
fmt.Println(utf8.RuneCountInString(emoji))  // 9
```

Phase 7 (Strings & Text) đào sâu rune, byte, UTF-8.

```go
// Concat
s1 := "Hello"
s2 := "World"
s3 := s1 + " " + s2          // "Hello World"

// Hiệu năng kém với loop — dùng strings.Builder:
var b strings.Builder
for i := 0; i < 1000; i++ {
    b.WriteString("x")
}
result := b.String()
```

## Raw string vs normal string

```go
normal := "C:\\Users\\Alice\nNewLine"
// C:\Users\Alice
// NewLine

raw := `C:\Users\Alice\nNoNewLine`
// C:\Users\Alice\nNoNewLine
```

Backtick `` ` `` cho phép giữ nguyên `\n`, `\t`, `"`. Hữu ích cho:
- Regex pattern.
- SQL query nhiều dòng.
- JSON template.

```go
query := `
SELECT u.id, u.name, p.title
FROM users u
JOIN posts p ON p.user_id = u.id
WHERE u.active = TRUE
`
```

## Memory model: stack vs heap

```text
[Variable local trong function]
   ↓ Compiler escape analysis
   ↓
   ├── KHÔNG escape → STACK     (nhanh, auto cleanup)
   └── ESCAPE       → HEAP      (chậm hơn, GC quản lý)
```

Escape khi:
- Return pointer ra ngoài function.
- Variable lớn (slice/map khởi tạo lớn).
- Assign vào interface (escape do dynamic dispatch).

Xem escape analysis:
```bash
go build -gcflags="-m" main.go
# ./main.go:10:6: moved to heap: x
```

Tối ưu: tránh return pointer khi không cần, dùng value type cho struct nhỏ.

Phase 4 (Memory & Pointer) đào sâu.

## Bẫy phổ biến với variable

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| `:=` shadow biến outer scope | Bug khó debug | Dùng `=` khi tái assign |
| Declare biến không dùng | Compile error | Xoá hoặc `_ = x` |
| `int(float)` mất phần thập phân | Sai data | Dùng `math.Round` trước khi convert |
| `string(65)` mong "65" | Ra "A" | Dùng `strconv.Itoa(65)` |
| Concat string trong loop | O(n²) memory | `strings.Builder` |
| So sánh float trực tiếp | Sai do floating-point | `math.Abs(a-b) < epsilon` |
| Quên zero value an toàn | Code thừa init | Tin tưởng zero value |
| Dùng `int32` vô tội vạ | Lỗi overflow trên ARM 32-bit | Dùng `int` cho counter |

### Bẫy shadow (CỰC kỳ phổ biến)

```go
err := doSomething()
if err != nil {
    err := otherThing()   // ← shadow err outer!
    if err != nil {
        return err        // return err mới
    }
    // err outer vẫn không nil, nhưng đã bị che
}
return err               // return err outer (đã có lỗi từ trước)
```

→ Bug âm thầm. Dùng `go vet` để bắt.

## Pattern production: validate input

```go
func parseAge(input string) (int, error) {
    age, err := strconv.Atoi(input)
    if err != nil {
        return 0, fmt.Errorf("invalid age %q: %w", input, err)
    }
    if age < 0 || age > 150 {
        return 0, fmt.Errorf("age out of range: %d", age)
    }
    return age, nil
}
```

Pattern này lặp ở mọi handler/API: parse → validate → return error có wrap.

## Tóm tắt bài 1

- Value type cơ bản: string, int (8/16/32/64/uint), float (32/64), bool, complex, nil.
- 3 cách declare: `var x type`, `var x = value`, `x := value` (chỉ trong func).
- Zero value: string `""`, int `0`, bool `false`, slice/map/pointer `nil`. Mọi var đều có default an toàn.
- Type inference từ value bên phải. `nil` cần explicit type.
- **Cấm**: unused variable, unused import, implicit type conversion.
- String là UTF-8 bytes — `len()` đếm byte, không phải character.
- Raw string `` `...` `` cho multi-line, regex, SQL.
- Stack/heap quyết định bởi escape analysis. Code performant cần hiểu.
- Bẫy shadow `:=` với `if err :=` rất phổ biến — `go vet` bắt.

**Bài kế tiếp** → [Bài 2: Constants, iota và Enums "kiểu Go"](02-constants-iota.md)
