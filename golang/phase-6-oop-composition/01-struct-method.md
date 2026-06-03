# Bài 1: Struct và Method — OOP "kiểu Go"

Go không có `class`, không có `extends`, không có `public/private` keyword. Nhưng Go vẫn làm được mọi thứ OOP cần: encapsulation, polymorphism, composition. Cách Go làm khác Java/C# đến mức người mới chuyển qua thường choáng. Bài này dạy Go-way: **struct + method + visibility quy ước hoa/thường**.

## Struct là gì?

```go
type User struct {
    ID    int
    Name  string
    Email string
    Age   int
}

u := User{
    ID:    1,
    Name:  "Alice",
    Email: "alice@example.com",
    Age:   30,
}
```

Struct = collection of named fields với type. Tương đương:
- `class` (Java) — nhưng không có method bên trong.
- `struct` (C) — nhưng safer.
- `dataclass` (Python) — concept gần.
- `record` (C#) — concept gần.

## Khởi tạo struct

```go
// 1. Field name (rõ ràng nhất — khuyên dùng)
u := User{ID: 1, Name: "Alice"}

// 2. Positional (theo thứ tự định nghĩa — dễ bug khi sửa struct)
u := User{1, "Alice", "alice@x.com", 30}

// 3. Zero value
var u User                 // {0, "", "", 0}

// 4. Pointer literal
u := &User{ID: 1, Name: "Alice"}

// 5. new() — trỏ tới zero value
u := new(User)             // u: *User, *u = User{}
```

→ Best practice: **field name** form. Khi struct sửa thì positional break.

## Truy cập field

```go
u := User{Name: "Alice"}

fmt.Println(u.Name)        // Alice
u.Name = "Bob"             // modify
fmt.Println(u.Name)        // Bob

// Pointer — auto deref
p := &u
fmt.Println(p.Name)        // Bob (= (*p).Name)
p.Name = "Charlie"         // modify qua pointer
```

## Visibility — Chữ hoa = exported

```go
type User struct {
    ID       int      // exported (public) — package khác dùng được
    Name     string   // exported
    password string   // unexported (private) — chỉ trong package
}
```

Quy tắc: **chữ đầu của identifier**:
- HOA → exported = public.
- thường → unexported = private.

Áp dụng cho: field, function, type, constant, variable.

Khác Java/C# (`public`, `private` keyword), Go quy ước. Đơn giản hơn, không cần đánh thêm keyword.

## Anonymous struct

```go
// Khai báo + dùng tại chỗ, không tạo type name
config := struct {
    Host string
    Port int
}{
    Host: "localhost",
    Port: 8080,
}

// Cho table-driven test
tests := []struct {
    name string
    input int
    want int
}{
    {"positive", 5, 25},
    {"zero", 0, 0},
}
```

Hữu ích cho: test case, JSON response one-off, internal grouping.

## Method — Function gắn vào type

```go
type Circle struct {
    Radius float64
}

func (c Circle) Area() float64 {
    return math.Pi * c.Radius * c.Radius
}

c := Circle{Radius: 5}
fmt.Println(c.Area())   // 78.539...
```

Phần trong `()` trước tên là **receiver**:
- `c Circle` — instance để gọi method.
- Tương đương `this` (Java) hay `self` (Python), nhưng phải tự đặt tên.

Convention: receiver name 1-2 ký tự (`c`, `u`, `r`), không dùng `self`/`this`.

## Method trên type của mình

Method chỉ define được trên type **trong cùng package**:

```go
// Cùng package — OK
type Circle struct{ Radius float64 }
func (c Circle) Area() float64 { ... }

// Type từ stdlib — KHÔNG
func (s string) Reverse() string { ... }   // COMPILE ERROR
```

Workaround: tạo type alias:
```go
type MyString string
func (s MyString) Reverse() string { ... }
```

## Value receiver vs Pointer receiver

```go
type Counter struct {
    count int
}

// Value receiver — copy struct
func (c Counter) IncBroken() {
    c.count++           // chỉ đổi copy
}

// Pointer receiver — modify gốc
func (c *Counter) Inc() {
    c.count++           // đổi struct gốc
}

c := Counter{}
c.IncBroken()
fmt.Println(c.count)    // 0 — không đổi!

c.Inc()
fmt.Println(c.count)    // 1 — đã đổi
```

**Quy tắc chọn receiver**:
| Tình huống | Receiver |
|---|---|
| Method modify state | Pointer |
| Struct lớn (> 64 byte) | Pointer (tránh copy) |
| Struct chứa sync.Mutex, channel | Pointer (Mutex không copy được) |
| Struct chứa slice/map owner | Pointer (consistent) |
| Type giá trị nhỏ, immutable | Value (Point, Time-like) |
| Cần implement interface | Như interface định nghĩa |

**Convention**: trong cùng type, **chọn 1 kiểu thống nhất**. Đừng mix:
```go
// BAD
func (c Counter) Method1() {}
func (c *Counter) Method2() {}   // mix → confusing
```

## Auto-conversion giữa value và pointer

```go
type User struct{ Name string }

func (u *User) SetName(n string) { u.Name = n }
func (u User) GetName() string   { return u.Name }

u := User{Name: "Alice"}

u.SetName("Bob")    // OK — Go tự lấy &u
fmt.Println(u.Name) // Bob

p := &u
p.GetName()         // OK — Go tự deref (*p).GetName()
```

Go tự convert giữa `T` ↔ `*T` khi gọi method. Trừ khi value không addressable:
```go
User{Name: "X"}.SetName("Y")   // COMPILE ERROR — không lấy được &User{...}
```

## Method có argument

```go
type Rectangle struct {
    Width, Height float64
}

func (r Rectangle) Scale(factor float64) Rectangle {
    return Rectangle{
        Width:  r.Width * factor,
        Height: r.Height * factor,
    }
}

r := Rectangle{2, 3}
r2 := r.Scale(2)         // {4, 6}
```

→ Return new struct thay vì modify. Pattern functional.

## Method return error

```go
func (u *User) SetEmail(email string) error {
    if !strings.Contains(email, "@") {
        return errors.New("invalid email")
    }
    u.Email = email
    return nil
}

if err := user.SetEmail("invalid"); err != nil {
    log.Println(err)
}
```

Pattern phổ biến cho validation, IO operation.

## Constructor — Convention `New*`

Go không có `constructor` keyword. Convention: function `New*` trả về instance:

```go
type Server struct {
    addr    string
    port    int
    timeout time.Duration
}

func NewServer(addr string, port int) *Server {
    return &Server{
        addr:    addr,
        port:    port,
        timeout: 30 * time.Second,    // default
    }
}

// Dùng
s := NewServer("localhost", 8080)
```

Return `*Server` thay vì `Server` vì:
- Encapsulation: bên trong có thể setup phức tạp.
- Caller dùng pointer → tránh copy.
- Đồng nhất với method pointer receiver.

## Khi nào không cần constructor?

Khi zero value đã usable:
```go
type Counter struct {
    count int
}

// var c Counter — đã dùng được, count = 0
// Không cần NewCounter()
```

Go khuyến nghị design zero value usable nếu được. Vd `sync.Mutex`, `bytes.Buffer`, `strings.Builder` — zero value chạy ngay không cần init.

## Struct embedding (peek bài 3)

```go
type Person struct {
    Name string
    Age  int
}

type Employee struct {
    Person    // embedded — không có field name
    Salary float64
}

e := Employee{Person: Person{Name: "Alice", Age: 30}, Salary: 5000}
fmt.Println(e.Name)   // "Alice" — promoted field
```

Đây không phải inheritance — là composition. Bài 3 deep dive.

## Comparison

Struct comparable nếu mọi field comparable:
```go
type Point struct{ X, Y int }
p1 := Point{1, 2}
p2 := Point{1, 2}
fmt.Println(p1 == p2)   // true

type WithSlice struct{ Data []int }
// w1 == w2 → COMPILE ERROR: slice không comparable
```

## Struct làm map key

```go
type Coord struct{ X, Y int }
m := map[Coord]string{
    {0, 0}: "origin",
    {1, 1}: "diag",
}
fmt.Println(m[Coord{0, 0}])   // origin
```

→ Hữu ích cho lookup theo nhiều dimension.

## JSON tags

```go
type User struct {
    ID        int       `json:"id"`
    Name      string    `json:"name"`
    Email     string    `json:"email,omitempty"`
    CreatedAt time.Time `json:"created_at"`
    password  string    `json:"-"`     // skip
}
```

`json:"..."` tag điều khiển encode/decode:
- `json:"name"` — đổi tên field.
- `json:"email,omitempty"` — bỏ qua nếu empty.
- `json:"-"` — không serialize.

Phase 9 (Encoding) deep dive.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Mix value + pointer receiver | Confusing | Chọn 1 cho cả type |
| Method modify trên value receiver | Không đổi gốc | Pointer receiver |
| Quên `*` cho big struct | Slow do copy | Pointer receiver |
| Constructor return value cho big struct | Slow | Return `*T` |
| Forget `omitempty` | JSON có null field | Add tag |
| Field viết hoa không cần thiết | Lộ API | Giữ thường nếu nội bộ |
| Embedding làm "inheritance" | Bug khi method conflict | Hiểu nó là composition |
| Compare struct có slice/map field | Compile error | Custom Equal() method |

## Pattern production

### Builder

```go
type Query struct {
    table  string
    where  []string
    limit  int
    order  string
}

func (q *Query) Where(c string) *Query {
    q.where = append(q.where, c)
    return q
}
func (q *Query) Limit(n int) *Query {
    q.limit = n
    return q
}

// Dùng
q := (&Query{table: "users"}).Where("age > 18").Limit(10)
```

### Configuration

```go
type Config struct {
    DBHost   string
    DBPort   int
    Logger   *log.Logger
}

func (c Config) Validate() error {
    if c.DBHost == "" {
        return errors.New("DBHost required")
    }
    return nil
}
```

### Domain model

```go
type Order struct {
    ID         string
    UserID     string
    Items      []OrderItem
    Status     OrderStatus
    CreatedAt  time.Time
}

func (o *Order) Cancel() error {
    if o.Status == StatusShipped {
        return errors.New("cannot cancel shipped")
    }
    o.Status = StatusCancelled
    return nil
}
```

## Quick reference

```go
// Define
type T struct {
    F1 type1
    F2 type2 `tag:"value"`
}

// Init
t := T{F1: v1, F2: v2}
t := &T{F1: v1}
t := new(T)
var t T

// Method
func (t T) M() {}       // value receiver
func (t *T) M() {}      // pointer receiver

// Constructor
func NewT(...) *T { return &T{...} }

// Embedding (bài 3)
type Child struct {
    Parent
    extraField string
}
```

## Tóm tắt bài 1

- Struct = collection of named fields. Khởi tạo bằng field name (rõ ràng).
- Visibility: **chữ hoa = exported**. Không có keyword `public`/`private`.
- Method gắn vào type qua receiver `(t T)` hoặc `(t *T)`.
- **Pointer receiver** để modify state hoặc tránh copy struct lớn.
- **Value receiver** cho type nhỏ, immutable.
- Convention: thống nhất receiver kiểu trong cùng type.
- Constructor: function `NewT()` trả `*T`.
- Struct embedding (peek): composition, không phải inheritance.
- Struct comparable nếu mọi field comparable.

**Bài kế tiếp** → [Bài 2: Interfaces — Implicit, mạnh hơn Java](02-interfaces.md)
