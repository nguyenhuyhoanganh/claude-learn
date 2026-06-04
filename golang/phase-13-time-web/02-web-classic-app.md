# Bài 2: Web Classic App — Router, template, session, form, auth

Trước khi build REST API, master classic server-rendered web app trước — 95% concept áp dụng cho REST. Bài này build pattern hoàn chỉnh: routing với chi, HTML template engine có cache, session middleware, form processing có validation, login/register/auth. Đây là backbone của mọi Go web project trước khi thêm framework.

## Router với chi

```bash
go get github.com/go-chi/chi/v5
```

```go
import "github.com/go-chi/chi/v5"

r := chi.NewRouter()
r.Use(middleware.Logger)
r.Use(middleware.Recoverer)

r.Get("/", homeHandler)
r.Get("/posts", listPostsHandler)
r.Get("/posts/{id}", showPostHandler)
r.Post("/posts", createPostHandler)

r.Route("/admin", func(r chi.Router) {
    r.Use(adminAuthMiddleware)
    r.Get("/dashboard", dashboardHandler)
})

http.ListenAndServe(":8080", r)
```

Chi vs stdlib mux:
- Path param (`{id}`).
- Sub-router với `Route`.
- Middleware chain dễ.
- Compatible 100% với `http.Handler`.

Lấy path param:
```go
id := chi.URLParam(r, "id")
```

## Template engine với cache

```go
import "html/template"

type TemplateCache struct {
    templates map[string]*template.Template
}

func NewTemplateCache(dir string) (*TemplateCache, error) {
    cache := map[string]*template.Template{}
    
    pages, err := filepath.Glob(filepath.Join(dir, "*.page.html"))
    if err != nil { return nil, err }
    
    for _, page := range pages {
        name := filepath.Base(page)
        
        ts, err := template.ParseFiles(page)
        if err != nil { return nil, err }
        
        ts, err = ts.ParseGlob(filepath.Join(dir, "*.layout.html"))
        if err != nil { return nil, err }
        
        ts, err = ts.ParseGlob(filepath.Join(dir, "*.partial.html"))
        if err != nil { return nil, err }
        
        cache[name] = ts
    }
    
    return &TemplateCache{templates: cache}, nil
}

func (tc *TemplateCache) Render(w http.ResponseWriter, name string, data any) {
    ts, ok := tc.templates[name]
    if !ok {
        http.Error(w, "template not found: "+name, 500)
        return
    }
    
    var buf bytes.Buffer
    if err := ts.Execute(&buf, data); err != nil {
        http.Error(w, err.Error(), 500)
        return
    }
    
    buf.WriteTo(w)
}
```

→ Cache parse 1 lần khi start, render từ memory.

**Quan trọng**: dùng `bytes.Buffer` trung gian — nếu Execute fail giữa chừng, response không bị partial.

## Template structure

```text
templates/
├── base.layout.html       ← layout chung
├── nav.partial.html       ← partial reuse
├── home.page.html         ← page riêng
├── post.page.html
└── login.page.html
```

`base.layout.html`:
```html
{{define "base"}}
<!DOCTYPE html>
<html>
<head><title>{{template "title" .}}</title></head>
<body>
    {{template "nav" .}}
    <main>{{template "main" .}}</main>
</body>
</html>
{{end}}
```

`home.page.html`:
```html
{{template "base" .}}

{{define "title"}}Home{{end}}

{{define "main"}}
    <h1>Welcome, {{.User.Name}}</h1>
{{end}}
```

## Template data

```go
type TemplateData struct {
    User       *User
    Flash      string
    CSRFToken  string
    Form       *Form
    Posts      []*Post
}

func (s *Server) addDefaults(r *http.Request, td *TemplateData) *TemplateData {
    if td == nil {
        td = &TemplateData{}
    }
    td.Flash = s.session.PopString(r, "flash")
    td.User = s.currentUser(r)
    return td
}

// Handler
func (s *Server) homeHandler(w http.ResponseWriter, r *http.Request) {
    data := s.addDefaults(r, &TemplateData{
        Posts: s.repo.LatestPosts(),
    })
    s.tc.Render(w, "home.page.html", data)
}
```

Pattern: helper `addDefaults` set common field (user, flash, CSRF).

## Session với scs

```bash
go get github.com/alexedwards/scs/v2
```

```go
import "github.com/alexedwards/scs/v2"

session := scs.New()
session.Lifetime = 24 * time.Hour
session.Cookie.Secure = true       // HTTPS only (prod)
session.Cookie.HttpOnly = true     // no JS access
session.Cookie.SameSite = http.SameSiteLaxMode

r.Use(session.LoadAndSave)

// Trong handler
session.Put(r.Context(), "user_id", 42)
id := session.GetInt(r.Context(), "user_id")
session.Remove(r.Context(), "user_id")

// Flash message
session.Put(r.Context(), "flash", "Saved!")
msg := session.PopString(r.Context(), "flash")   // get + remove
```

`scs`:
- Pluggable store: cookie, memory, Redis, PostgreSQL.
- Built-in middleware.

## Form processing

```go
type Form struct {
    Values url.Values
    Errors map[string][]string
}

func New(data url.Values) *Form {
    return &Form{Values: data, Errors: map[string][]string{}}
}

func (f *Form) Required(fields ...string) {
    for _, field := range fields {
        if strings.TrimSpace(f.Values.Get(field)) == "" {
            f.Errors[field] = append(f.Errors[field], "required")
        }
    }
}

func (f *Form) MaxLen(field string, n int) {
    v := f.Values.Get(field)
    if utf8.RuneCountInString(v) > n {
        f.Errors[field] = append(f.Errors[field],
            fmt.Sprintf("max %d characters", n))
    }
}

func (f *Form) MatchPattern(field string, pattern *regexp.Regexp) {
    if !pattern.MatchString(f.Values.Get(field)) {
        f.Errors[field] = append(f.Errors[field], "invalid format")
    }
}

func (f *Form) Valid() bool {
    return len(f.Errors) == 0
}
```

Dùng trong handler:
```go
func (s *Server) registerHandler(w http.ResponseWriter, r *http.Request) {
    if err := r.ParseForm(); err != nil {
        http.Error(w, err.Error(), 400)
        return
    }
    
    form := forms.New(r.PostForm)
    form.Required("email", "password", "name")
    form.MaxLen("name", 50)
    form.MatchPattern("email", emailRegex)
    
    if !form.Valid() {
        s.tc.Render(w, "register.page.html", &TemplateData{Form: form})
        return
    }
    
    // Create user
    if err := s.repo.CreateUser(...); err != nil {
        s.session.Put(r.Context(), "flash", "Registration failed")
        http.Redirect(w, r, "/register", 303)
        return
    }
    
    s.session.Put(r.Context(), "flash", "Welcome!")
    http.Redirect(w, r, "/", 303)
}
```

Template hiển thị error:
```html
<form method="POST" action="/register">
    <input type="email" name="email" value='{{.Form.Values.Get "email"}}'>
    {{with .Form.Errors.email}}
        {{range .}}<p class="error">{{.}}</p>{{end}}
    {{end}}
    
    <input type="password" name="password">
    {{with .Form.Errors.password}}
        {{range .}}<p class="error">{{.}}</p>{{end}}
    {{end}}
    
    <button type="submit">Register</button>
</form>
```

## Authentication

```go
// bcrypt password hashing
import "golang.org/x/crypto/bcrypt"

func HashPassword(password string) (string, error) {
    hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
    return string(hash), err
}

func CheckPassword(hash, password string) error {
    return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

// Login handler
func (s *Server) loginHandler(w http.ResponseWriter, r *http.Request) {
    r.ParseForm()
    email := r.PostForm.Get("email")
    password := r.PostForm.Get("password")
    
    user, err := s.repo.UserByEmail(r.Context(), email)
    if err != nil {
        s.session.Put(r.Context(), "flash", "Invalid credentials")
        http.Redirect(w, r, "/login", 303)
        return
    }
    
    if err := CheckPassword(user.PasswordHash, password); err != nil {
        s.session.Put(r.Context(), "flash", "Invalid credentials")
        http.Redirect(w, r, "/login", 303)
        return
    }
    
    // Login success
    s.session.RenewToken(r.Context())   // chống session fixation
    s.session.Put(r.Context(), "user_id", user.ID)
    
    http.Redirect(w, r, "/", 303)
}

// Logout
func (s *Server) logoutHandler(w http.ResponseWriter, r *http.Request) {
    s.session.Remove(r.Context(), "user_id")
    s.session.RenewToken(r.Context())
    http.Redirect(w, r, "/", 303)
}
```

## Auth middleware

```go
func (s *Server) requireAuth(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if !s.isAuthenticated(r) {
            s.session.Put(r.Context(), "flash", "Please log in")
            http.Redirect(w, r, "/login", 303)
            return
        }
        
        w.Header().Set("Cache-Control", "no-store")    // sensitive page
        next.ServeHTTP(w, r)
    })
}

func (s *Server) isAuthenticated(r *http.Request) bool {
    return s.session.Exists(r.Context(), "user_id")
}

// Wire
r.Group(func(r chi.Router) {
    r.Use(s.requireAuth)
    r.Get("/dashboard", s.dashboardHandler)
    r.Post("/posts", s.createPostHandler)
})
```

## CSRF protection

```bash
go get github.com/justinas/nosurf
```

```go
import "github.com/justinas/nosurf"

func CSRFMiddleware(next http.Handler) http.Handler {
    csrf := nosurf.New(next)
    csrf.SetBaseCookie(http.Cookie{
        HttpOnly: true,
        Path:     "/",
        Secure:   true,
        SameSite: http.SameSiteLaxMode,
    })
    return csrf
}

// Template helper
func (s *Server) addDefaults(r *http.Request, td *TemplateData) *TemplateData {
    td.CSRFToken = nosurf.Token(r)
    // ...
}
```

Form template:
```html
<form method="POST">
    <input type="hidden" name="csrf_token" value="{{.CSRFToken}}">
    <!-- ... -->
</form>
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Parse template mỗi request | Slow | Cache vào memory |
| `Execute` thẳng vào `w` | Partial response khi error | Buffer trung gian |
| Lưu password plaintext | Security disaster | bcrypt |
| Session không HttpOnly | XSS đọc | Cookie HttpOnly + Secure |
| Quên CSRF | CSRF attack | nosurf middleware |
| Redirect 302 sau POST | Browser cache | 303 See Other |
| Form value không validate | Bug + injection | Validate + sanitize |
| Cache cho page auth | Leak data | `Cache-Control: no-store` |
| Session fixation | Attack | `RenewToken` sau login |

## Project structure

```text
mywebapp/
├── go.mod
├── cmd/web/main.go                 ← entry point
├── internal/
│   ├── server/                     ← HTTP handlers
│   │   ├── handlers.go
│   │   ├── middleware.go
│   │   ├── routes.go
│   │   └── server.go
│   ├── models/                     ← domain
│   │   ├── user.go
│   │   └── post.go
│   ├── repository/                 ← DB
│   │   ├── user_repo.go
│   │   └── post_repo.go
│   └── forms/                      ← validation
│       └── form.go
├── ui/
│   ├── html/                       ← template
│   │   ├── base.layout.html
│   │   ├── home.page.html
│   │   └── ...
│   └── static/                     ← CSS, JS, img
└── migrations/
    └── ...
```

→ Pattern Go standard: `cmd/` cho binary, `internal/` cho private, `ui/` cho assets.

## Tóm tắt bài 2

- Router với chi: path param, sub-router, middleware chain.
- Template cache: parse 1 lần khi start, render từ memory.
- `bytes.Buffer` trung gian để Execute không vỡ response.
- Layout + partial pattern cho DRY HTML.
- Session với `scs`: pluggable store, secure cookie.
- Form processing: validate + return errors → re-render với data + errors.
- Password: bcrypt với cost 12.
- Auth: session-based với `RenewToken` chống fixation.
- CSRF: nosurf middleware + hidden form field.
- Project structure: `cmd/web`, `internal/server`, `internal/models`, `ui/html`, `migrations/`.

**Bài kế tiếp** → [Phase 14 - Bài 1: E-Commerce REST API — Architecture overview](../phase-14-ecommerce/01-architecture.md)
