# Bài 1: net/http — Web server từ scratch

Stdlib Go có `net/http` mạnh đến mức **không cần framework** cho hầu hết API. Caddy server, Hugo, Prometheus, etcd — đều xây trực tiếp trên `net/http`. Sau bài này bạn biết: tạo HTTP server, route, middleware, parse request, render JSON. Bài sau touch framework (Gin, Echo, Chi) khi thật cần.

## Hello server

```go
package main

import (
    "fmt"
    "net/http"
)

func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, "Hello, world")
    })
    
    fmt.Println("listening on :8080")
    http.ListenAndServe(":8080", nil)
}
```

3 dòng = full HTTP server. Test:
```bash
curl localhost:8080
# Hello, world
```

## Anatomy

```go
http.HandleFunc(pattern, handler)
//             ↑       ↑
//             route    function nhận (w, r)

type ResponseWriter interface {
    Header() Header
    Write([]byte) (int, error)
    WriteHeader(statusCode int)
}

type Request struct {
    Method  string         // GET, POST, ...
    URL     *url.URL
    Header  Header
    Body    io.ReadCloser
    Form    url.Values
    Context context.Context
    // ...
}
```

## Multiple routes

```go
http.HandleFunc("/", home)
http.HandleFunc("/users", listUsers)
http.HandleFunc("/users/create", createUser)

http.ListenAndServe(":8080", nil)
```

Đơn giản. Mặc định dùng `http.DefaultServeMux`.

## Pattern matching

```go
http.HandleFunc("/api/", apiHandler)        // prefix match
http.HandleFunc("/api/users", usersHandler) // exact match
```

`/` cuối → prefix. Không có / → exact.

`http.DefaultServeMux` (mux = multiplexer = router) đơn giản: exact match + prefix. Không support path parameter.

## Go 1.22+ — Native pattern matching

```go
mux := http.NewServeMux()

mux.HandleFunc("GET /users/{id}", func(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    fmt.Fprintln(w, "user:", id)
})

mux.HandleFunc("POST /users", createUser)
mux.HandleFunc("DELETE /users/{id}", deleteUser)

http.ListenAndServe(":8080", mux)
```

Go 1.22+ stdlib mux:
- Method filter (`GET`, `POST`).
- Path parameter `{id}`.
- Wildcard `{path...}` (catch-all).

→ Cho 90% case không cần framework nữa.

## Method check (pre-1.22)

```go
func userHandler(w http.ResponseWriter, r *http.Request) {
    switch r.Method {
    case "GET":
        listUsers(w, r)
    case "POST":
        createUser(w, r)
    default:
        http.Error(w, "method not allowed", 405)
    }
}
```

## Read query params

```go
http.HandleFunc("/search", func(w http.ResponseWriter, r *http.Request) {
    q := r.URL.Query().Get("q")           // ?q=foo
    limit := r.URL.Query().Get("limit")   // ?limit=10
    
    fmt.Fprintf(w, "search: q=%s, limit=%s\n", q, limit)
})
```

## Read JSON body

```go
type CreateUserReq struct {
    Name  string `json:"name"`
    Email string `json:"email"`
}

func createUser(w http.ResponseWriter, r *http.Request) {
    var req CreateUserReq
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), 400)
        return
    }
    defer r.Body.Close()
    
    // process req
    user := saveUser(req)
    
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(201)
    json.NewEncoder(w).Encode(user)
}
```

Pattern: decode body → validate → process → encode response.

## Read form

```go
func login(w http.ResponseWriter, r *http.Request) {
    if err := r.ParseForm(); err != nil {
        http.Error(w, err.Error(), 400)
        return
    }
    
    username := r.FormValue("username")
    password := r.FormValue("password")
    
    // ...
}
```

`r.FormValue` lookup cả query string + form body.

## Read file upload

```go
func upload(w http.ResponseWriter, r *http.Request) {
    r.ParseMultipartForm(10 << 20)   // 10 MB max
    
    file, header, err := r.FormFile("file")
    if err != nil {
        http.Error(w, err.Error(), 400)
        return
    }
    defer file.Close()
    
    fmt.Fprintf(w, "got %s (%d bytes)\n", header.Filename, header.Size)
    
    // Save to disk
    out, _ := os.Create("./uploads/" + header.Filename)
    defer out.Close()
    io.Copy(out, file)
}
```

## Set header

```go
w.Header().Set("Content-Type", "application/json")
w.Header().Set("X-Request-ID", uuid.NewString())
w.Header().Add("Set-Cookie", "session=abc")

w.WriteHeader(201)   // PHẢI set status TRƯỚC Write
w.Write([]byte("..."))
```

**Quy tắc**: `Header().Set()` trước `WriteHeader()`. Sau `WriteHeader` set header → no-op.

## Helpers stdlib

```go
http.Error(w, "bad request", 400)              // status + plain text
http.NotFound(w, r)                             // 404
http.Redirect(w, r, "/login", 302)              // redirect
http.ServeFile(w, r, "./static/index.html")
http.FileServer(http.Dir("./public"))           // static file server
```

## Static file server

```go
fs := http.FileServer(http.Dir("./public"))
http.Handle("/static/", http.StripPrefix("/static/", fs))
```

URL `/static/img.png` → serve `./public/img.png`.

## Middleware pattern

Middleware = function nhận `Handler` return `Handler`:

```go
type Middleware func(http.Handler) http.Handler

func LoggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next.ServeHTTP(w, r)
        log.Printf("%s %s — %v", r.Method, r.URL.Path, time.Since(start))
    })
}

func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        token := r.Header.Get("Authorization")
        if !validToken(token) {
            http.Error(w, "unauthorized", 401)
            return
        }
        ctx := context.WithValue(r.Context(), "user", parseUser(token))
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

// Chain
mux := http.NewServeMux()
mux.HandleFunc("/api/users", listUsers)

handler := LoggingMiddleware(AuthMiddleware(mux))
http.ListenAndServe(":8080", handler)
```

→ Middleware chain — log → auth → handler.

## Custom Server config

```go
srv := &http.Server{
    Addr:              ":8080",
    Handler:           mux,
    ReadTimeout:       5 * time.Second,
    WriteTimeout:      10 * time.Second,
    IdleTimeout:       60 * time.Second,
    ReadHeaderTimeout: 2 * time.Second,
    MaxHeaderBytes:    1 << 20,    // 1 MB
}

if err := srv.ListenAndServe(); err != http.ErrServerClosed {
    log.Fatal(err)
}
```

Production phải set timeout. Default 0 = unlimited → slowloris attack.

## Graceful shutdown

```go
func main() {
    srv := &http.Server{Addr: ":8080", Handler: handler}
    
    go func() {
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            log.Fatal(err)
        }
    }()
    
    // Wait Ctrl+C
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit
    
    log.Println("shutting down...")
    
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    
    if err := srv.Shutdown(ctx); err != nil {
        log.Fatal(err)
    }
    log.Println("server stopped")
}
```

`srv.Shutdown(ctx)`:
- Stop accept new connections.
- Wait existing requests xong (up to context deadline).
- Return error nếu timeout.

→ Container/K8s SIGTERM → graceful drain.

## HTTP Client

```go
client := &http.Client{
    Timeout: 10 * time.Second,
}

resp, err := client.Get("https://api.example.com/users")
if err != nil { return err }
defer resp.Body.Close()

if resp.StatusCode != 200 {
    return fmt.Errorf("status %d", resp.StatusCode)
}

body, _ := io.ReadAll(resp.Body)
fmt.Println(string(body))
```

POST JSON:
```go
data, _ := json.Marshal(payload)
req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(data))
req.Header.Set("Content-Type", "application/json")
req.Header.Set("Authorization", "Bearer "+token)

resp, err := client.Do(req)
defer resp.Body.Close()
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên `defer Close()` body | Connection leak | Server: `r.Body`, Client: `resp.Body` |
| Server không timeout | Slowloris | Set ReadTimeout, WriteTimeout |
| `WriteHeader` 2 lần | Panic | Chỉ 1 lần |
| `Header().Set` sau `WriteHeader` | No-op | Set trước |
| `http.DefaultClient` không timeout | Hang forever | Custom client |
| Không graceful shutdown | Mất request | `srv.Shutdown(ctx)` |
| Read body 2 lần | Empty lần 2 | Stream cẩn thận |
| `r.ParseForm` quên gọi | FormValue empty | Auto gọi bởi `FormValue` nhưng cẩn thận multipart |
| Context value với string key | Collision | Custom key type |

## Pattern production

### Handler với DI

```go
type Server struct {
    db    *sqlx.DB
    cache *Cache
    log   *slog.Logger
}

func (s *Server) handleUser(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    u, err := s.db.GetUser(r.Context(), id)
    // ...
}

func main() {
    s := &Server{db: openDB(), cache: NewCache(), log: slog.Default()}
    
    mux := http.NewServeMux()
    mux.HandleFunc("GET /users/{id}", s.handleUser)
    
    http.ListenAndServe(":8080", mux)
}
```

→ Method receiver = state injection.

### Error response chuẩn

```go
type ErrorResponse struct {
    Error   string `json:"error"`
    Code    string `json:"code,omitempty"`
    Details any    `json:"details,omitempty"`
}

func writeError(w http.ResponseWriter, status int, msg string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(ErrorResponse{Error: msg})
}
```

## Framework decision

```text
[Stdlib net/http]
- Đủ cho 80% case
- 0 dependencies
- Go 1.22+ pattern matching

[Gin] — fastest, opinionated
[Echo] — minimal, performance
[Chi] — idiomatic, middleware ecosystem
[Fiber] — fasthttp-based, không compatible với stdlib

→ Default: stdlib. Switch khi cần feature cụ thể.
```

## Quick reference

```go
// Server
http.HandleFunc("GET /path/{id}", handler)
http.ListenAndServe(":8080", nil)

// Custom server
srv := &http.Server{
    Addr: ":8080", Handler: mux,
    ReadTimeout: 5*time.Second,
}
srv.ListenAndServe()
srv.Shutdown(ctx)

// Handler
func h(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    q := r.URL.Query().Get("q")
    json.NewDecoder(r.Body).Decode(&v)
    
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(201)
    json.NewEncoder(w).Encode(v)
}

// Middleware
func mw(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // before
        next.ServeHTTP(w, r)
        // after
    })
}

// Client
client := &http.Client{Timeout: 10*time.Second}
req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
resp, _ := client.Do(req); defer resp.Body.Close()
```

## Tóm tắt bài 1

- `net/http` stdlib đủ mạnh cho 80% API.
- Go 1.22+ mux native: method + path parameter.
- Handler signature: `(ResponseWriter, *Request)`.
- Pattern: decode body → validate → process → encode.
- Middleware = `Handler → Handler` function.
- Custom `http.Server` để set timeout (production bắt buộc).
- Graceful shutdown với `Shutdown(ctx)`.
- HTTP Client: custom với timeout, không dùng `DefaultClient`.
- Framework chỉ cần khi stdlib không đủ.

**Bài kế tiếp** → [Phase 12 - Bài 1: Testing và benchmarking](../phase-12-testing/01-testing-basics.md)
