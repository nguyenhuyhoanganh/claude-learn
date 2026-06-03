# Bài 1: For loop — Cách duy nhất Go cho phép lặp

Java có `for`, `while`, `do-while`, `for-each`. JavaScript có `for`, `while`, `do-while`, `for...of`, `for...in`, `.forEach()`, `.map()`. Python có `for`, `while`. **Go có 1 keyword duy nhất**: `for`. Hết. Mọi pattern loop khác đều được biểu diễn qua `for`. Quyết định thiết kế này cực mạnh — giảm cognitive load, không cần nhớ syntax nhiều kiểu, không cần debate "dùng `while` hay `for`".

## Bốn dạng `for` trong Go

```go
// 1. C-style — counter
for i := 0; i < 10; i++ { ... }

// 2. While-style — chỉ điều kiện
for x < 100 { ... }

// 3. Infinite — không điều kiện
for { ... }

// 4. Range — duyệt collection
for i, v := range slice { ... }
```

Một keyword, bốn pattern. Sẽ deep-dive từng cái.

## 1. C-style for

```go
for i := 0; i < 10; i++ {
    fmt.Println(i)
}
// 0, 1, 2, ..., 9
```

Ba phần phân tách bằng `;`:
- **Init**: `i := 0` — chạy 1 lần đầu.
- **Condition**: `i < 10` — check trước mỗi iteration.
- **Post**: `i++` — chạy sau mỗi iteration.

Phần init khai báo biến scope **chỉ trong loop**:
```go
for i := 0; i < 10; i++ { ... }
fmt.Println(i)  // COMPILE ERROR: i undefined
```

→ Đây là feature, không phải bug. Không leak biến counter ra ngoài.

### Backward loop

```go
for i := 9; i >= 0; i-- {
    fmt.Println(i)
}
```

### Step khác 1

```go
for i := 0; i < 100; i += 5 {
    fmt.Println(i)  // 0, 5, 10, ..., 95
}
```

### Multi variable

```go
for i, j := 0, 10; i < j; i, j = i+1, j-1 {
    fmt.Println(i, j)
}
// 0 10, 1 9, 2 8, 3 7, 4 6
```

Hiếm dùng nhưng được hỗ trợ.

## 2. While-style

Bỏ init + post, chỉ giữ condition:

```go
n := 100
for n > 1 {
    n /= 2
    fmt.Println(n)
}
// 50, 25, 12, 6, 3, 1
```

Tương đương `while (n > 1)` của Java/C.

## 3. Infinite loop

```go
for {
    // chạy mãi mãi
}
```

Dùng cho:
- Server listen loop.
- Goroutine worker (chờ task từ channel).
- Game tick loop.

Thoát bằng `break`, `return`, hoặc `os.Exit`:

```go
counter := 0
for {
    counter++
    fmt.Println(counter)
    if counter >= 5 {
        break
    }
}
```

Khác C/Java `while(true)` — không bị warning "constant expression".

## 4. Range — Duyệt collection

Dạng quan trọng nhất. Range hoạt động với:

| Type | Returns |
|---|---|
| `array` / `slice` | `index, value` |
| `map` | `key, value` |
| `string` | `index, rune` (UTF-8 aware) |
| `channel` | `value` (chỉ 1) |
| `int` (Go 1.22+) | `value` (0 → n-1) |
| `func` (Go 1.23+) | tuỳ signature |

### Range slice

```go
languages := []string{"Go", "Python", "Java"}

for i, v := range languages {
    fmt.Printf("%d: %s\n", i, v)
}
// 0: Go
// 1: Python
// 2: Java
```

### Bỏ index hoặc value

Quy tắc Go: **biến không dùng = compile error**. Dùng `_` để discard:

```go
// Bỏ index
for _, v := range languages {
    fmt.Println(v)
}

// Bỏ value (chỉ lấy index)
for i := range languages {
    fmt.Println(i)
}

// Chỉ chạy n lần — không quan tâm index/value
for range make([]struct{}, 5) {
    fmt.Println("hi")
}
```

### Range map

```go
prices := map[string]float64{
    "tshirt": 20.0,
    "mug":    12.5,
    "book":   2.99,
}

for key, val := range prices {
    fmt.Printf("%s: $%.2f\n", key, val)
}
```

**Cảnh báo**: range map **không guarantee thứ tự**. Mỗi lần chạy có thể khác. Đây là intent — tránh code phụ thuộc thứ tự (sẽ break khi Go nâng version).

Cần thứ tự → sort keys:
```go
keys := make([]string, 0, len(prices))
for k := range prices {
    keys = append(keys, k)
}
sort.Strings(keys)
for _, k := range keys {
    fmt.Printf("%s: $%.2f\n", k, prices[k])
}
```

### Range string

```go
s := "Hi 👋"
for i, r := range s {
    fmt.Printf("byte %d: %c (codepoint %d)\n", i, r, r)
}
// byte 0: H (codepoint 72)
// byte 1: i (codepoint 105)
// byte 2:   (codepoint 32)
// byte 3: 👋 (codepoint 128075)
```

Lưu ý:
- `i` là **byte index**, không phải character index.
- `r` là **rune** (Unicode code point), không phải byte.
- Emoji chiếm 4 byte → index nhảy từ 3 → 7.

Khác với `for i := 0; i < len(s); i++` (duyệt theo byte) → có thể cắt sai code point.

### Range channel

```go
ch := make(chan int)
go func() {
    for i := 0; i < 5; i++ {
        ch <- i
    }
    close(ch)
}()

for v := range ch {
    fmt.Println(v)  // 0, 1, 2, 3, 4
}
```

Loop tự thoát khi channel close. Phase 8 (Concurrency) đào sâu.

### Range int (Go 1.22+)

```go
for i := range 10 {
    fmt.Println(i)  // 0, 1, ..., 9
}
```

Cú pháp mới, gọn hơn `for i := 0; i < 10; i++`. Chỉ dùng được Go 1.22+.

## `break` và `continue`

```go
for i := 0; i < 10; i++ {
    if i == 5 {
        break          // thoát toàn bộ loop
    }
    if i%2 == 0 {
        continue       // skip iteration hiện tại
    }
    fmt.Println(i)
}
// 1, 3
```

## Labeled break — thoát nested loop

Vấn đề: `break` chỉ thoát loop trong cùng.

```go
for i := 0; i < 5; i++ {
    for j := 0; j < 5; j++ {
        if i*j > 6 {
            break  // chỉ thoát loop j
        }
    }
}
```

Cần thoát **cả 2** → dùng label:

```go
outer:
for i := 0; i < 5; i++ {
    for j := 0; j < 5; j++ {
        if i*j > 6 {
            break outer  // thoát luôn loop i
        }
    }
}
```

Tương tự `continue outer` skip iteration outer.

→ Power của Go: không có `goto` (hầu như), nhưng có labeled break/continue cho nested clean.

## Bẫy phổ biến với for

### Bẫy 1: Loop variable capture trong goroutine (PRE-1.22)

```go
// Go < 1.22 — BẪY KINH ĐIỂN
for i := 0; i < 3; i++ {
    go func() {
        fmt.Println(i)  // có thể print 3, 3, 3 (không phải 0, 1, 2)
    }()
}
```

Vì goroutine share biến `i`, đến lúc chạy thì `i` đã = 3.

**Fix < 1.22**:
```go
for i := 0; i < 3; i++ {
    i := i  // shadow — tạo biến mới mỗi iteration
    go func() {
        fmt.Println(i)
    }()
}
```

**Go 1.22+** sửa bug này: mỗi iteration tự động có biến mới. Code đầu tiên **chạy đúng**.

→ Bug nổi tiếng đến mức Go team phải break compatibility để fix. Update Go ≥ 1.22.

### Bẫy 2: Modify slice khi đang range

```go
s := []int{1, 2, 3}
for i, v := range s {
    s = append(s, v)  // modify s — không ảnh hưởng loop
    fmt.Println(i, v)
}
// 0 1, 1 2, 2 3 — chỉ 3 lần, không infinite
```

Range capture length **tại lúc bắt đầu**. Append sau không tăng số iteration. Nhưng modify index thì có effect:
```go
s := []int{1, 2, 3}
for i := range s {
    s[i] *= 2
}
fmt.Println(s)  // [2 4 6]
```

### Bẫy 3: Off-by-one

```go
// Sai
for i := 0; i <= len(s); i++ {  // i <= len → out of bounds
    fmt.Println(s[i])
}

// Đúng
for i := 0; i < len(s); i++ {
    fmt.Println(s[i])
}
```

Hoặc dùng `range` để tránh hoàn toàn.

### Bẫy 4: Khi range chiếm bộ nhớ lớn

```go
// Slice 1 triệu User (mỗi 1KB)
users := loadOneMillionUsers()

// Sai: copy mỗi User (1GB total)
for _, u := range users {
    process(u)
}

// Đúng: range theo index
for i := range users {
    process(&users[i])  // pointer, không copy
}
```

Range copy value vào `u`. Với struct lớn → mất memory + thời gian. Nhiều người không biết.

## Bảng tổng hợp pattern

| Pattern | Khi dùng |
|---|---|
| `for i := 0; i < n; i++` | Counter chính xác, cần index |
| `for x < limit` | Loop có điều kiện thoát động |
| `for {}` + `break` | Worker loop, server loop |
| `for i, v := range s` | Duyệt slice/map/string thông thường |
| `for _, v := range s` | Chỉ cần value |
| `for i := range s` | Chỉ cần index hoặc đếm |
| `for k := range m` | Chỉ key của map |
| `for v := range ch` | Consume channel |
| `for i := range n` (1.22+) | n lần count |

## Real-world: Worker loop

```go
func worker(jobs <-chan Job, results chan<- Result) {
    for job := range jobs {        // chờ jobs, thoát khi channel close
        result := process(job)
        results <- result
    }
}
```

Pattern này dùng cho mọi background worker, pipeline streaming, queue consumer. Phase 8 đào sâu.

## Real-world: Retry loop

```go
const maxRetries = 5
var err error
for attempt := 1; attempt <= maxRetries; attempt++ {
    err = callAPI()
    if err == nil {
        break  // thành công, thoát
    }
    backoff := time.Duration(attempt) * time.Second
    time.Sleep(backoff)
}
if err != nil {
    return fmt.Errorf("failed after %d attempts: %w", maxRetries, err)
}
```

Pattern này lặp ở mọi production code: HTTP retry, DB reconnect, queue redeliver.

## Tóm tắt bài 1

- **Một keyword `for`** thay cho `while`, `do-while`, `for-each` của ngôn ngữ khác.
- 4 dạng: C-style, while-style, infinite, range.
- `range`: slice/array (index, value), map (key, value), string (byte index, rune), channel (value), int (Go 1.22+).
- Map range **không có thứ tự** — sort keys nếu cần ổn định.
- `break` / `continue` cơ bản. `break label` / `continue label` cho nested.
- Bẫy capture variable trong goroutine — Go 1.22+ tự fix.
- Range struct lớn → dùng `for i := range` + pointer, tránh copy.
- Patterns production: worker, retry, server listen.

**Bài kế tiếp** → [Bài 2: if-else và pattern "if với init" đặc trưng Go](02-if-else.md)
