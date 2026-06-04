# Bài 3: Composition + Embedding — Thay thế inheritance

Go **không có inheritance**. Tranh cãi từ ngày Go ra mắt — nhiều người Java/C# nghĩ "vậy làm sao reuse code?". Câu trả lời: **composition**, qua một feature gọi là **embedding**. Embedding nhìn giống inheritance nhưng đứng vững hơn về maintainability. Bài này clear hoàn toàn.

## Vấn đề với inheritance

```java
// Java
class Animal {
    void eat() { ... }
    void sleep() { ... }
}

class Dog extends Animal {
    void bark() { ... }
}

class Cat extends Animal {
    void meow() { ... }
}

// Vấn đề khi cần thêm:
class FlyingAnimal extends Animal { void fly(); }
class Bird extends FlyingAnimal { ... }
class Fish extends Animal { void swim(); }

// Dog cũng có thể bay (chó robot)?
// Diamond problem khi multiple inheritance.
// "extends" rigid, sửa parent gãy child.
```

Inheritance:
- Tight coupling parent ↔ child.
- "Is-A" relationship khó suy nghĩ khi domain phức tạp.
- Diamond problem.
- Khó test (mock parent khó).

## Composition: "Has-A"

Thay vì `Dog extends Animal`, tư duy `Dog has-a Animal behavior`:

```go
type Eater interface {
    Eat()
}

type Sleeper interface {
    Sleep()
}

type Barker interface {
    Bark()
}

type Dog struct {
    eater   Eater
    sleeper Sleeper
}

func (d Dog) Bark() { ... }
```

→ Mỗi behavior là interface. Dog **compose** từ behavior.

Đây là khái niệm OOP đúng nghĩa: design theo behavior, không theo type hierarchy.

## Struct embedding — Sugar cho composition

```go
type Animal struct {
    Name string
    Age  int
}

func (a Animal) Eat() {
    fmt.Println(a.Name, "is eating")
}

type Dog struct {
    Animal     // ← EMBEDDED — không có field name
    Breed string
}

d := Dog{
    Animal: Animal{Name: "Rex", Age: 5},
    Breed:  "Husky",
}

// Truy cập "promoted" field/method
fmt.Println(d.Name)   // "Rex" — promoted từ Animal
d.Eat()               // "Rex is eating" — method promoted

// Nguyên gốc vẫn truy cập được
fmt.Println(d.Animal.Name)   // "Rex"
```

→ Embedding **promote** field + method từ embedded type lên outer type.

## Đây KHÔNG phải inheritance

Embedding ≠ extends. Khác biệt:

```go
type Animal struct { Name string }
func (a Animal) Speak() { fmt.Println("...") }

type Dog struct {
    Animal
}

d := Dog{Animal: Animal{Name: "Rex"}}
d.Speak()              // OK — promoted

// Nhưng:
var a Animal = d       // COMPILE ERROR — Dog không phải Animal
//    ↑
// "Dog is not Animal", chỉ "Dog contains Animal"
```

Khác Java `Dog d = ...; Animal a = d;` — work vì IS-A.

Go: tách biệt. Dog có Animal, nhưng Dog ≠ Animal.

## Embedding nhiều type

```go
type Engine struct { HP int }
func (e Engine) Start() { fmt.Println("engine start") }

type Wheels struct { Count int }
func (w Wheels) Roll() { fmt.Println("rolling") }

type Car struct {
    Engine     // embed
    Wheels     // embed
    Brand string
}

c := Car{
    Engine: Engine{HP: 200},
    Wheels: Wheels{Count: 4},
    Brand:  "Tesla",
}

c.Start()       // "engine start" — từ Engine
c.Roll()        // "rolling" — từ Wheels
c.HP            // 200 — promoted Engine.HP
c.Count         // 4 — promoted Wheels.Count
```

→ Multiple embedding. Go không diamond problem vì:
- Mỗi field giữ tên gốc khi conflict.
- Method conflict → compile error nếu gọi không ambiguous.

## Conflict resolution

```go
type A struct { Name string }
type B struct { Name string }

type C struct {
    A
    B
}

c := C{}
c.Name        // COMPILE ERROR — ambiguous

c.A.Name = "A name"   // explicit OK
c.B.Name = "B name"
```

Compiler bắt ambiguous lúc compile. An toàn hơn diamond problem của C++.

## Embedding pointer

```go
type Logger struct{ ... }
func (l *Logger) Log(msg string) { ... }

type Service struct {
    *Logger    // embed pointer
}

s := Service{Logger: &Logger{}}
s.Log("hi")    // OK — pointer auto deref
```

Pattern phổ biến khi:
- Embedded type là singleton.
- Muốn share state qua nhiều outer.

## Embedding interface

```go
type Stringer interface {
    String() string
}

type Closer interface {
    Close() error
}

type ReadCloser interface {
    io.Reader     // embed interface
    io.Closer
}
```

→ Interface composition. `ReadCloser` = Reader + Closer.

Type implement cả 2 method = satisfy ReadCloser.

## Override method (giả)

Outer struct có method cùng tên → override (shadow):

```go
type Animal struct{}
func (Animal) Speak() { fmt.Println("generic animal noise") }

type Dog struct {
    Animal
}
func (Dog) Speak() { fmt.Println("woof") }   // shadow

d := Dog{}
d.Speak()         // "woof"
d.Animal.Speak()  // "generic animal noise" — gọi original
```

Đây không phải polymorphism — chỉ shadow. Cẩn thận.

## Use case: HTTP middleware decorator

```go
type Server struct {
    *http.Server   // embed pointer
}

func NewServer(addr string) *Server {
    return &Server{
        Server: &http.Server{
            Addr: addr,
            // ...
        },
    }
}

// Server tự động có method ListenAndServe, Shutdown, ... từ http.Server
// Có thể thêm method riêng:
func (s *Server) WithTLS(cert, key string) error {
    return s.Server.ListenAndServeTLS(cert, key)
}
```

→ "Extend" stdlib type mà không sửa stdlib.

## Use case: Test helpers

```go
type TestSuite struct {
    *testing.T   // embed *testing.T
    DB *sql.DB
}

func NewTestSuite(t *testing.T) *TestSuite {
    return &TestSuite{T: t, DB: openTestDB()}
}

func (s *TestSuite) AssertUser(id int, expectedName string) {
    var name string
    s.DB.QueryRow("SELECT name FROM users WHERE id=$1", id).Scan(&name)
    if name != expectedName {
        s.Errorf("got %q, want %q", name, expectedName)   // T.Errorf via embed
    }
}

// Test code
func TestUserCreate(t *testing.T) {
    s := NewTestSuite(t)
    // ... use s.AssertUser, s.Fatal, s.Run ...
}
```

→ Test helper class với access đầy đủ `testing.T` method.

## Use case: Mutex protected struct

```go
type Counter struct {
    sync.Mutex    // embed — Lock/Unlock promoted
    count int
}

c := &Counter{}
c.Lock()              // promoted
c.count++
c.Unlock()
```

Nhưng pattern này gây controversy:
- Mutex method bị "leak" ra ngoài API.
- User có thể gọi `c.Lock()` từ ngoài → ngoài ý muốn.

Best practice: **unexport** mutex:
```go
type Counter struct {
    mu    sync.Mutex   // unexported field, NOT embed
    count int
}

func (c *Counter) Inc() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.count++
}
```

→ Encapsulate. Caller không gọi `c.mu.Lock()`.

## Khi NÊN embed?

| Case | Có nên? |
|---|---|
| Wrap stdlib type, thêm method | Yes |
| Share common field/method nhiều struct | Yes |
| Compose feature (Reader + Writer) | Yes |
| Mock/test helper kế thừa T | Yes |
| Replace "extends" của Java | No — refactor design |
| Share Mutex public | No — unexport field |

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Treat embedding as inheritance | Bug logic | Hiểu là composition |
| Conflict field name | Compile error | Explicit access `.A.X` |
| Embed Mutex public | Caller lạm dụng | Unexport mutex |
| Embed interface không init | Nil pointer khi gọi | Check init |
| Override method nhầm | "polymorphism" giả | Test kỹ |
| Deep nested embedding | Khó hiểu | Limit 1-2 level |
| Embed type cho 1 method | Overengineer | Just add method |

## Composition pattern: Strategy

```go
type PaymentStrategy interface {
    Charge(amount float64) error
}

type CreditCardStrategy struct{ Number string }
func (c CreditCardStrategy) Charge(amount float64) error { ... }

type PayPalStrategy struct{ Email string }
func (p PayPalStrategy) Charge(amount float64) error { ... }

type Order struct {
    Items    []Item
    Strategy PaymentStrategy   // composition
}

func (o *Order) Checkout() error {
    total := o.computeTotal()
    return o.Strategy.Charge(total)
}

// Dùng
order := Order{Strategy: CreditCardStrategy{Number: "..."}}
order.Checkout()

// Đổi strategy không sửa Order
order.Strategy = PayPalStrategy{Email: "..."}
```

→ Pattern strategy classic, composition idiomatic.

## Composition pattern: Decorator

```go
type Logger interface {
    Log(msg string)
}

type ConsoleLogger struct{}
func (c ConsoleLogger) Log(msg string) { fmt.Println(msg) }

// Decorator add prefix
type PrefixLogger struct {
    Logger        // embed inner Logger
    Prefix string
}

func (p PrefixLogger) Log(msg string) {
    p.Logger.Log(p.Prefix + " " + msg)
}

// Chain
inner := ConsoleLogger{}
withTime := PrefixLogger{Logger: inner, Prefix: time.Now().String()}
withTimeAndID := PrefixLogger{Logger: withTime, Prefix: "[id:1]"}

withTimeAndID.Log("hi")
// [id:1] 2026-06-03 10:00 hi
```

→ Stack decorator dễ.

## So sánh với Java

```java
// Java — extends
class Dog extends Animal { ... }

// Override
@Override
public void Speak() { ... }

// Diamond — Java cấm multi-extend class
class C extends A implements B { ... }
```

```go
// Go — embed
type Dog struct {
    Animal
}

// Shadow (KHÔNG override theo nghĩa polymorphic)
func (d Dog) Speak() { ... }

// "Diamond" OK với multiple embed
type C struct {
    A
    B
}
```

Trade-off:
- Java: explicit, hierarchy rõ.
- Go: composition flexible, ít coupling, ít magic.

## Quick reference

```go
// Embed
type Outer struct {
    Inner       // embed value
}

type Outer struct {
    *Inner      // embed pointer
}

// Access promoted
outer.Inner.Field   // explicit
outer.Field         // promoted (nếu unambiguous)
outer.InnerMethod() // promoted

// Embed interface
type ReadWriter interface {
    io.Reader
    io.Writer
}

// Conflict resolution
outer.A.Field       // explicit khi ambiguous

// Constructor
func NewOuter(...) *Outer {
    return &Outer{Inner: Inner{...}}
}
```

## Tóm tắt bài 3

- Go **KHÔNG có inheritance**. Thay bằng **composition** qua **embedding**.
- Embedding: struct field không có name → promote field + method.
- **Outer ≠ Embedded type**. Chỉ "has-a", không "is-a".
- Embed nhiều type → multiple "behavior". Conflict bằng explicit `.A.X`.
- Embed pointer khi singleton/shared. Embed interface cho composition.
- Embed Mutex public → API leak. Unexport thay vì.
- Pattern: Strategy (compose interface), Decorator (embed + override).
- Override method = shadow, không polymorphic. Phải qua interface để polymorphism.

**Bài kế tiếp** → [Bài 4: Generics — Type parameter từ Go 1.18+](04-generics.md)
