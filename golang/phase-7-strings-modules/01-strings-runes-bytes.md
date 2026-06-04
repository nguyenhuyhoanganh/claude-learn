# Bài 1: Strings, runes, bytes — Hiểu UTF-8 trong Go

String trong Go nhìn đơn giản nhưng dưới capo phức tạp hơn bạn nghĩ: là **immutable byte sequence UTF-8 encoded**. Không phải char array, không phải Unicode array. Hiểu sai → bug với emoji, tiếng Việt, ký tự đa byte. Bài này clear definitive.

## String là gì trong Go?

```go
s := "Hello, 🌍"
```

Internal:
```text
[String header]
┌─────────┬─────────┐
│   ptr   │   len   │
└─────────┴─────────┘
   │        16 (byte!)
   ▼
[Byte array UTF-8]
H  e  l  l  o  ,  _  🌍🌍🌍🌍
0  1  2  3  4  5  6  7  8 9 10  ← byte index
                     └─── 4 byte cho emoji
```

- **Pointer** trỏ vào byte sequence (read-only, immutable).
- **Length** = số **byte**, không phải character.
- Encoding: **UTF-8** (chuẩn web/OS hiện đại).

```go
s := "Hello, 🌍"
fmt.Println(len(s))   // 11 byte (5 + 2 + 4)
```

Đếm "character" không đơn giản bằng `len()`.

## byte vs rune

```go
// byte = uint8 = 1 byte (alias)
var b byte = 'A'
fmt.Println(b)     // 65

// rune = int32 = 1 Unicode code point
var r rune = '🌍'
fmt.Println(r)     // 127757 (U+1F30D)
```

- `byte` cho data binary, ASCII.
- `rune` cho Unicode character (có thể nhiều byte trong UTF-8).

## UTF-8 explained

```text
ASCII (U+0000-U+007F):     1 byte    'A' = 0x41
Latin extended:            2 byte    'é' = 0xC3 0xA9
Asian (CJK):               3 byte    '中' = 0xE4 0xB8 0xAD
Emoji (above U+FFFF):      4 byte    '🌍' = 0xF0 0x9F 0x8C 0x8D
```

UTF-8 backward-compatible với ASCII — gọn cho text Latin, có thể encode mọi Unicode.

## Range string — Iterate theo rune

```go
s := "Hi 中"
for i, r := range s {
    fmt.Printf("byte %d: %c (codepoint %d)\n", i, r, r)
}
// byte 0: H (codepoint 72)
// byte 1: i (codepoint 105)
// byte 2:   (codepoint 32)
// byte 3: 中 (codepoint 20013)
```

`range` UTF-8 aware:
- `i` = byte index (nhảy 3 ở '中' vì 3 byte).
- `r` = rune (Unicode code point).

vs `for i := 0; i < len(s); i++` (byte by byte) — sẽ cắt vỡ multi-byte char.

## Đếm character thực

```go
import "unicode/utf8"

s := "Hi 🌍"
fmt.Println(len(s))                       // 7 (byte)
fmt.Println(utf8.RuneCountInString(s))    // 4 (character)

// Hoặc convert thành []rune
fmt.Println(len([]rune(s)))               // 4
```

→ Nếu cần index theo character: convert sang `[]rune` trước.

## String concat

```go
// + đơn giản
s := "Hello" + " " + "World"

// Loop với += → CHẬM (O(n²))
var s string
for i := 0; i < 1000; i++ {
    s += "x"   // mỗi lần alloc string mới
}

// strings.Builder — ĐÚNG cho loop
var b strings.Builder
for i := 0; i < 1000; i++ {
    b.WriteString("x")
}
result := b.String()
```

`strings.Builder` tránh alloc liên tục → 10-100x nhanh.

Hoặc `strings.Join`:
```go
parts := []string{"a", "b", "c"}
s := strings.Join(parts, ", ")   // "a, b, c"
```

## Strings package — Toolkit

```go
import "strings"

strings.ToUpper("hello")          // "HELLO"
strings.ToLower("HELLO")          // "hello"
strings.TrimSpace("  hi  ")       // "hi"
strings.Trim("***hi***", "*")     // "hi"
strings.HasPrefix("hello.go", "hello")    // true
strings.HasSuffix("hello.go", ".go")      // true
strings.Contains("hello", "ell")  // true
strings.Replace("hello", "l", "L", -1)    // "heLLo" (-1 = all)
strings.ReplaceAll("hello", "l", "L")     // "heLLo"
strings.Split("a,b,c", ",")               // ["a","b","c"]
strings.Join([]string{"a","b"}, ",")      // "a,b"
strings.Count("hello", "l")               // 2
strings.Index("hello", "ll")              // 2
strings.Repeat("ab", 3)                   // "ababab"
strings.Fields("  hi  there  ")           // ["hi", "there"] — split by whitespace
```

→ Đủ 90% case. Đọc `pkg.go.dev/strings`.

## strings.Builder vs bytes.Buffer

```go
// strings.Builder — Go 1.10+, faster, type-safe
var sb strings.Builder
sb.WriteString("hello")
sb.WriteByte(' ')
sb.WriteRune('🌍')
s := sb.String()

// bytes.Buffer — generic, có Read/Write byte
var bb bytes.Buffer
bb.WriteString("hello")
b := bb.Bytes()
```

Khi:
- Build string → `strings.Builder`.
- Build byte slice → `bytes.Buffer`.
- Cần Reader/Writer interface → `bytes.Buffer`.

## Convert string ↔ slice

```go
// String → bytes
b := []byte("hello")    // copy
fmt.Println(b)          // [104 101 108 108 111]

// Bytes → string
s := string(b)          // copy

// String → runes
r := []rune("Hi 🌍")
fmt.Println(r)          // [72 105 32 127757]

// Runes → string
s := string(r)
```

**Cảnh báo**: mỗi convert = **alloc + copy**. Loop convert → slow.

## String immutability

```go
s := "hello"
s[0] = 'H'        // COMPILE ERROR — string immutable
```

→ Modify cần convert:
```go
b := []byte(s)
b[0] = 'H'
s = string(b)
```

Hoặc dùng `strings.Replace`.

## String comparison

```go
"abc" == "abc"       // true
"abc" < "abd"        // true — byte-wise
"abc" < "abcd"       // true

// Case-insensitive
strings.EqualFold("Hello", "HELLO")   // true
```

## Multi-line string

```go
// Backtick — raw string, giữ nguyên \n \t " backslash
sql := `
SELECT u.id, u.name
FROM users u
WHERE u.active = true
`

regex := `^[a-z]+\d+$`     // không cần escape backslash
```

Khác `"..."`:
```go
"Hello\nWorld"   // chứa newline (escape)
`Hello\nWorld`   // chứa literal "\n" (4 ký tự)
```

## Formatting với fmt

```go
name := "Alice"
age := 30

fmt.Sprintf("%s is %d", name, age)     // "Alice is 30"
fmt.Sprintf("%-10s|", name)            // "Alice     |" (left align)
fmt.Sprintf("%10s|", name)             // "     Alice|" (right align)
fmt.Sprintf("%05d", age)               // "00030" (pad zero)
fmt.Sprintf("%.2f", 3.14159)           // "3.14"
fmt.Sprintf("%x", 255)                 // "ff" (hex)
fmt.Sprintf("%q", "hello")             // "\"hello\"" (quoted)
fmt.Sprintf("%v", []int{1,2,3})        // "[1 2 3]" (default)
fmt.Sprintf("%+v", User{Name: "A"})    // "{Name:A}" (field name)
fmt.Sprintf("%T", x)                   // type name
```

## Encoding stdlib

```go
// strconv — convert primitive ↔ string
n, err := strconv.Atoi("42")
s := strconv.Itoa(42)
f, err := strconv.ParseFloat("3.14", 64)
b, err := strconv.ParseBool("true")

// encoding/hex
hex.EncodeToString([]byte{0xff, 0x00})   // "ff00"

// encoding/base64
base64.StdEncoding.EncodeToString([]byte("hello"))   // "aGVsbG8="

// encoding/json
json.Marshal(map[string]int{"x": 1})     // []byte(`{"x":1}`)
```

## Real-world: Email validation

```go
import "strings"

func isValidEmail(s string) bool {
    if len(s) < 5 || !strings.Contains(s, "@") {
        return false
    }
    parts := strings.Split(s, "@")
    if len(parts) != 2 {
        return false
    }
    user, domain := parts[0], parts[1]
    return len(user) > 0 && strings.Contains(domain, ".")
}
```

Production: dùng regex hoặc `net/mail`:
```go
import "net/mail"
_, err := mail.ParseAddress("alice@example.com")
```

## Real-world: Truncate UTF-8 safe

```go
// SAI: cắt theo byte → vỡ UTF-8
func truncate(s string, n int) string {
    if len(s) > n {
        return s[:n] + "..."   // có thể vỡ multi-byte char
    }
    return s
}

// ĐÚNG: cắt theo rune
func truncate(s string, n int) string {
    r := []rune(s)
    if len(r) > n {
        return string(r[:n]) + "..."
    }
    return s
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| `len(s)` mong character count | Sai cho UTF-8 | `utf8.RuneCountInString` |
| `for i := 0; i < len(s); i++` cho UTF-8 | Cắt vỡ char | `for i, r := range s` |
| Concat với `+=` trong loop | O(n²) slow | `strings.Builder` |
| Convert string ↔ []byte trong loop | Alloc nhiều | Cache hoặc dùng Builder |
| String compare case-sensitive | "Hello" != "hello" | `strings.EqualFold` |
| Regex compile mỗi call | Slow | Compile 1 lần global |
| Modify string trực tiếp | Compile error | Convert `[]byte` |
| Cắt byte ở giữa multi-byte | Vỡ UTF-8 | Cắt rune |

## Quick reference

```go
// Type
byte = uint8     (ASCII)
rune = int32     (Unicode code point)
string           (immutable UTF-8 byte sequence)

// Length
len(s)                              // byte count
utf8.RuneCountInString(s)           // character count

// Convert
[]byte(s); string(b)
[]rune(s); string(r)
strconv.Atoi / Itoa / ParseFloat
fmt.Sprintf("...", args...)

// Build
strings.Builder
bytes.Buffer
strings.Join

// Manipulate
strings.ToUpper/Lower/Trim/HasPrefix/Contains/Split/Replace/Count/Index

// Match
strings.EqualFold
regexp.MustCompile + Match/FindString/ReplaceAll

// Format
fmt.Sprintf("%s %d %.2f %-10s %v %T")
```

## Tóm tắt bài 1

- String = immutable UTF-8 byte sequence.
- `len(s)` = byte count, **không phải** character count.
- `byte = uint8` cho ASCII; `rune = int32` cho Unicode.
- `range s` aware UTF-8: `i` byte index, `r` rune.
- Concat loop → `strings.Builder` (10-100x nhanh hơn `+=`).
- Modify string cần convert `[]byte` → modify → convert lại.
- `strings` package: ToUpper, Trim, Split, Replace, HasPrefix, Contains, ...
- Cắt truncate UTF-8 safe → convert `[]rune` trước.

**Bài kế tiếp** → [Bài 2: Go Modules — Quản lý dependency](02-go-modules.md)
