# Bài 2: JSON encoding/decoding — Backbone của REST API

90% backend Go giao tiếp qua JSON: REST API, config file, queue payload, log structured. Package `encoding/json` stdlib đủ cho production. Bài này dạy: marshal, unmarshal, custom tag, decode unknown shape, stream JSON, performance trick.

## Marshal — Go → JSON

```go
import "encoding/json"

type User struct {
    ID    int    `json:"id"`
    Name  string `json:"name"`
    Email string `json:"email"`
}

u := User{ID: 1, Name: "Alice", Email: "alice@x.com"}
data, err := json.Marshal(u)
fmt.Println(string(data))
// {"id":1,"name":"Alice","email":"alice@x.com"}
```

### Pretty print

```go
data, _ := json.MarshalIndent(u, "", "  ")
// {
//   "id": 1,
//   "name": "Alice",
//   "email": "alice@x.com"
// }
```

### Struct tag rule

```go
type User struct {
    ID        int       `json:"id"`
    Name      string    `json:"name"`
    Email     string    `json:"email,omitempty"`     // bỏ nếu empty
    Password  string    `json:"-"`                    // không serialize
    CreatedAt time.Time `json:"created_at"`
    Internal  string    `json:"-"`
    Anon      string    `json:",omitempty"`           // dùng field name "Anon"
}
```

Options:
- `json:"name"` — rename field.
- `json:"name,omitempty"` — bỏ qua nếu zero value.
- `json:"-"` — không bao giờ serialize.
- `json:",string"` — số encode dưới dạng string (cho ID lớn JS không handle).

## Unmarshal — JSON → Go

```go
data := []byte(`{"id":1,"name":"Alice","email":"alice@x.com"}`)

var u User
if err := json.Unmarshal(data, &u); err != nil {
    return err
}
fmt.Println(u)
```

**Quan trọng**: pass `&u` (pointer) để Unmarshal modify.

### Unknown shape — `map[string]any`

```go
data := []byte(`{"name":"Alice","age":30,"tags":["a","b"]}`)

var m map[string]any
json.Unmarshal(data, &m)
// m["name"] = "Alice" (string)
// m["age"] = float64(30)   ← JSON number → float64
// m["tags"] = []any{"a", "b"}
```

→ Chú ý: JSON number → `float64` mặc định.

## Encoder/Decoder — Stream JSON

```go
// Decode từ reader (file, network)
dec := json.NewDecoder(reader)
var u User
if err := dec.Decode(&u); err != nil { return err }

// Encode vào writer
enc := json.NewEncoder(writer)
enc.SetIndent("", "  ")
enc.Encode(u)
```

Khi nào dùng Encoder/Decoder?
- **Stream** (HTTP request/response body).
- **JSON Lines** (newline-delimited JSON).
- Tránh load toàn bộ vào memory.

```go
// Read JSON Lines (NDJSON)
dec := json.NewDecoder(file)
for {
    var rec Record
    if err := dec.Decode(&rec); err == io.EOF {
        break
    } else if err != nil {
        return err
    }
    process(rec)
}
```

## HTTP Handler pattern

```go
func handleUser(w http.ResponseWriter, r *http.Request) {
    var u User
    if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
        http.Error(w, err.Error(), 400)
        return
    }
    
    // Process u
    saved := save(u)
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(saved)
}
```

Standard REST pattern. Phase 11 (Web) đào sâu.

## Nested struct

```go
type Address struct {
    City    string `json:"city"`
    Country string `json:"country"`
}

type User struct {
    Name    string  `json:"name"`
    Address Address `json:"address"`
    Tags    []string `json:"tags"`
}

u := User{
    Name:    "Alice",
    Address: Address{City: "HCM", Country: "VN"},
    Tags:    []string{"go", "dev"},
}

data, _ := json.Marshal(u)
// {"name":"Alice","address":{"city":"HCM","country":"VN"},"tags":["go","dev"]}
```

## Embedded struct

```go
type Base struct {
    ID        int       `json:"id"`
    CreatedAt time.Time `json:"created_at"`
}

type User struct {
    Base                    // embedded — field promoted
    Name string `json:"name"`
}

u := User{Base: Base{ID: 1, CreatedAt: time.Now()}, Name: "Alice"}
data, _ := json.Marshal(u)
// {"id":1,"created_at":"...","name":"Alice"}
```

→ Embed → JSON flat. Dùng cho common fields (timestamps, audit).

## Custom Marshaler

```go
type Color int

const (
    Red Color = iota
    Green
    Blue
)

func (c Color) MarshalJSON() ([]byte, error) {
    names := []string{"red", "green", "blue"}
    if int(c) < 0 || int(c) >= len(names) {
        return nil, fmt.Errorf("invalid color: %d", c)
    }
    return json.Marshal(names[c])
}

func (c *Color) UnmarshalJSON(data []byte) error {
    var s string
    if err := json.Unmarshal(data, &s); err != nil { return err }
    
    switch s {
    case "red":   *c = Red
    case "green": *c = Green
    case "blue":  *c = Blue
    default:
        return fmt.Errorf("unknown color: %s", s)
    }
    return nil
}

// Dùng
type Product struct {
    Name  string `json:"name"`
    Color Color  `json:"color"`
}

p := Product{Name: "shirt", Color: Red}
data, _ := json.Marshal(p)
// {"name":"shirt","color":"red"}
```

Pattern: enum → human-readable string trong JSON.

## Time encoding

```go
type Event struct {
    Time time.Time `json:"time"`
}

e := Event{Time: time.Now()}
data, _ := json.Marshal(e)
// {"time":"2026-06-03T10:23:45.123456789Z"}    ← RFC 3339
```

Đổi format:
```go
type DateOnly struct {
    time.Time
}

func (d DateOnly) MarshalJSON() ([]byte, error) {
    return []byte(`"` + d.Format("2006-01-02") + `"`), nil
}
```

## Number trong JSON

```go
type Data struct {
    SmallInt int     `json:"small"`
    BigID    int64   `json:"big_id,string"`         // encode as string
    Money    float64 `json:"money"`
}

d := Data{SmallInt: 42, BigID: 9007199254740993, Money: 19.99}
data, _ := json.Marshal(d)
// {"small":42,"big_id":"9007199254740993","money":19.99}
```

`int64` lớn quá `Number.MAX_SAFE_INTEGER` của JS → encode dưới dạng string.

## Decoding numbers — UseNumber

```go
dec := json.NewDecoder(reader)
dec.UseNumber()    // decode số thành json.Number (string)

var m map[string]any
dec.Decode(&m)

n := m["count"].(json.Number)
i, _ := n.Int64()    // OK với int64 lớn
f, _ := n.Float64()
```

→ Tránh mất precision khi decode unknown number.

## Strict decode — DisallowUnknownFields

```go
dec := json.NewDecoder(r.Body)
dec.DisallowUnknownFields()    // fail khi có field lạ

var u User
if err := dec.Decode(&u); err != nil {
    return err   // "json: unknown field"
}
```

Strict mode cho API public.

## Marshaling nil

```go
var s []int = nil
data, _ := json.Marshal(s)
fmt.Println(string(data))   // "null"

s2 := []int{}
data, _ = json.Marshal(s2)
fmt.Println(string(data))   // "[]"
```

→ Nil slice/map → `null`. Empty → `[]` / `{}`. Khác biệt quan trọng cho consumer JS.

Init empty thay vì nil:
```go
type Response struct {
    Items []Item `json:"items"`
}

resp := Response{Items: []Item{}}    // not nil → "[]"
// nếu Items chưa init → "null"
```

## Performance trick

### 1. Reuse decoder

```go
dec := json.NewDecoder(r.Body)
// reuse cho multiple decode
```

### 2. RawMessage cho lazy parse

```go
type Envelope struct {
    Type string          `json:"type"`
    Data json.RawMessage `json:"data"`
}

var env Envelope
json.Unmarshal(data, &env)

switch env.Type {
case "user":
    var u User
    json.Unmarshal(env.Data, &u)
case "order":
    var o Order
    json.Unmarshal(env.Data, &o)
}
```

`json.RawMessage` = `[]byte` không parse — parse sau dựa trên type.

### 3. Alternative library

Stdlib `encoding/json` an toàn nhưng chậm. Hot path:
- `json-iterator/go` — drop-in replacement, ~2x faster.
- `goccy/go-json` — even faster.
- `valyala/fastjson` — không type-safe, dùng cho parse cụ thể.

Đo bench trước khi đổi.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên `&u` cho Unmarshal | Decode không update | Pass pointer |
| Field unexported | Không serialize | Capitalize field |
| `nil` slice → `null` | Consumer JS bug | Init `[]T{}` |
| Number lớn mất precision | Bug ID | `json:"id,string"` |
| Time format không như mong | Format khác | Custom Marshaler |
| Unknown field silently | Bug khi spec đổi | `DisallowUnknownFields` |
| Decode JSON tới interface | `float64` mặc định | `UseNumber()` |
| Tag sai syntax | Field như default | Run `go vet` |
| Marshal struct với cycle | Stack overflow | Tránh cycle |

## Pattern production

### API response envelope

```go
type Response[T any] struct {
    Data  T      `json:"data,omitempty"`
    Error string `json:"error,omitempty"`
    Meta  Meta   `json:"meta"`
}

type Meta struct {
    RequestID string    `json:"request_id"`
    Timestamp time.Time `json:"timestamp"`
}

func writeJSON[T any](w http.ResponseWriter, status int, data T) {
    resp := Response[T]{
        Data: data,
        Meta: Meta{RequestID: uuid.NewString(), Timestamp: time.Now()},
    }
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(resp)
}
```

Generic envelope với Go 1.18+.

### Versioned struct

```go
type UserV1 struct {
    Name  string `json:"name"`
    Email string `json:"email"`
}

type UserV2 struct {
    UserV1
    Phone string `json:"phone"`
}

// Backward compat — V1 client decode V2 OK (ignore phone)
```

## Quick reference

```go
// Marshal
data, err := json.Marshal(v)
data, err := json.MarshalIndent(v, "", "  ")

// Unmarshal
err := json.Unmarshal(data, &v)

// Tags
`json:"name"`              // rename
`json:"name,omitempty"`    // skip empty
`json:"-"`                 // skip always
`json:"id,string"`         // number as string

// Stream
enc := json.NewEncoder(w); enc.Encode(v)
dec := json.NewDecoder(r); dec.Decode(&v)
dec.DisallowUnknownFields()
dec.UseNumber()

// Custom
func (T) MarshalJSON() ([]byte, error)
func (T *T) UnmarshalJSON(data []byte) error

// Lazy
json.RawMessage   // raw bytes, parse sau

// Util
json.Valid(data)        // check valid JSON
json.Compact(dst, src)  // remove whitespace
```

## Tóm tắt bài 2

- Stdlib `encoding/json` đủ cho production.
- Tag `json:"name,omitempty"` — rename + skip empty.
- Marshal: value. Unmarshal: pointer.
- `Encoder/Decoder` cho streaming (HTTP, NDJSON).
- Custom `MarshalJSON` / `UnmarshalJSON` cho format đặc biệt (enum, date).
- `RawMessage` lazy parse cho polymorphic data.
- `DisallowUnknownFields` strict mode public API.
- `UseNumber()` tránh mất precision với int64 lớn.
- Bẫy: nil → `null`, init empty → `[]` cho consumer JS.
- Generic envelope cho API response.

**Bài kế tiếp** → [Phase 10 - Bài 1: SQL với database/sql](../phase-10-database/01-database-sql.md)
