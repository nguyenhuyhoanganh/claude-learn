# Bài 2: JWT Auth, password hashing, middleware, refresh token

REST API stateless dùng JWT (JSON Web Token) thay session cookie. JWT chứa user info, signed → client gửi mỗi request, server verify chữ ký. Bài này build pipeline: register → login → access token + refresh token → middleware verify → renew.

## JWT recap

```text
header.payload.signature

[Header]    {"alg":"HS256","typ":"JWT"}
[Payload]   {"sub":"42","exp":1780000000,"role":"user"}
[Signature] HMAC-SHA256(header.payload, secret)
```

3 phần base64url + dot separator. Client gửi:
```text
Authorization: Bearer eyJhbGciOiJIUzI1NiI...
```

Server decode + verify signature → trust payload.

## Password hashing với bcrypt

```go
package auth

import "golang.org/x/crypto/bcrypt"

const cost = 12

func HashPassword(password string) (string, error) {
    hash, err := bcrypt.GenerateFromPassword([]byte(password), cost)
    if err != nil {
        return "", fmt.Errorf("bcrypt: %w", err)
    }
    return string(hash), nil
}

func VerifyPassword(hash, password string) error {
    return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}
```

**Lưu ý**:
- bcrypt **không** dùng được cho password > 72 byte (cắt bớt).
- Cost 12 = ~250ms hash. Production OK (rate limit login).
- KHÔNG dùng SHA, MD5 cho password.

## JWT lib

```bash
go get github.com/golang-jwt/jwt/v5
```

```go
package auth

import (
    "fmt"
    "time"
    "github.com/golang-jwt/jwt/v5"
)

type Claims struct {
    UserID int    `json:"uid"`
    Email  string `json:"email"`
    Role   string `json:"role"`
    jwt.RegisteredClaims
}

type JWTManager struct {
    secret   []byte
    lifetime time.Duration
}

func NewJWTManager(secret string, lifetime time.Duration) *JWTManager {
    return &JWTManager{secret: []byte(secret), lifetime: lifetime}
}

func (m *JWTManager) Generate(userID int, email, role string) (string, error) {
    claims := Claims{
        UserID: userID,
        Email:  email,
        Role:   role,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(m.lifetime)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            Subject:   fmt.Sprintf("%d", userID),
        },
    }
    
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(m.secret)
}

func (m *JWTManager) Verify(tokenStr string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenStr, &Claims{},
        func(t *jwt.Token) (any, error) {
            if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
                return nil, fmt.Errorf("unexpected signing method")
            }
            return m.secret, nil
        })
    
    if err != nil {
        return nil, fmt.Errorf("parse token: %w", err)
    }
    
    claims, ok := token.Claims.(*Claims)
    if !ok || !token.Valid {
        return nil, fmt.Errorf("invalid token")
    }
    
    return claims, nil
}
```

## Register handler

```go
type RegisterRequest struct {
    Email    string `json:"email" validate:"required,email"`
    Password string `json:"password" validate:"required,min=8"`
    Name     string `json:"name" validate:"required,max=100"`
}

type AuthResponse struct {
    Token        string `json:"token"`
    RefreshToken string `json:"refresh_token"`
    User         UserDTO `json:"user"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
    var req RegisterRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, 400, "invalid request")
        return
    }
    
    if err := h.validator.Struct(req); err != nil {
        writeError(w, 400, err.Error())
        return
    }
    
    hash, err := auth.HashPassword(req.Password)
    if err != nil {
        h.log.Error("hash password", "error", err)
        writeError(w, 500, "internal error")
        return
    }
    
    user, err := h.svc.Register(r.Context(), req.Email, hash, req.Name)
    if err != nil {
        if errors.Is(err, services.ErrEmailTaken) {
            writeError(w, 409, "email already registered")
            return
        }
        h.log.Error("register", "error", err)
        writeError(w, 500, "internal error")
        return
    }
    
    token, _ := h.jwt.Generate(user.ID, user.Email, "user")
    refresh, _ := h.jwt.GenerateRefresh(user.ID)
    
    writeJSON(w, 201, AuthResponse{
        Token: token, RefreshToken: refresh, User: mapUser(user),
    })
}
```

## Login handler

```go
type LoginRequest struct {
    Email    string `json:"email" validate:"required,email"`
    Password string `json:"password" validate:"required"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
    var req LoginRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, 400, "invalid request")
        return
    }
    
    user, err := h.svc.UserByEmail(r.Context(), req.Email)
    if err != nil {
        // KHÔNG leak "email không tồn tại" — same error cho cả 2
        writeError(w, 401, "invalid credentials")
        return
    }
    
    if err := auth.VerifyPassword(user.PasswordHash, req.Password); err != nil {
        writeError(w, 401, "invalid credentials")
        return
    }
    
    token, err := h.jwt.Generate(user.ID, user.Email, user.Role)
    if err != nil {
        writeError(w, 500, "internal error")
        return
    }
    refresh, _ := h.jwt.GenerateRefresh(user.ID)
    
    writeJSON(w, 200, AuthResponse{
        Token: token, RefreshToken: refresh, User: mapUser(user),
    })
}
```

**Security best practice**: lỗi "email không có" và "password sai" trả **same response** — chống email enumeration.

## Auth middleware

```go
type contextKey string

const userKey contextKey = "user"

func AuthMiddleware(jm *auth.JWTManager) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            header := r.Header.Get("Authorization")
            if !strings.HasPrefix(header, "Bearer ") {
                writeError(w, 401, "missing bearer token")
                return
            }
            
            tokenStr := strings.TrimPrefix(header, "Bearer ")
            claims, err := jm.Verify(tokenStr)
            if err != nil {
                writeError(w, 401, "invalid token")
                return
            }
            
            // Inject vào context
            ctx := context.WithValue(r.Context(), userKey, claims)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}

// Helper truy cập user
func UserFromContext(ctx context.Context) (*auth.Claims, bool) {
    c, ok := ctx.Value(userKey).(*auth.Claims)
    return c, ok
}
```

**Quan trọng**: custom type `contextKey` cho key tránh collision.

## Role-based access

```go
func RequireRole(role string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            claims, ok := UserFromContext(r.Context())
            if !ok {
                writeError(w, 401, "unauthorized")
                return
            }
            
            if claims.Role != role && claims.Role != "admin" {
                writeError(w, 403, "forbidden")
                return
            }
            
            next.ServeHTTP(w, r)
        })
    }
}
```

Wire:
```go
r.Route("/admin", func(r chi.Router) {
    r.Use(AuthMiddleware(jm))
    r.Use(RequireRole("admin"))
    r.Get("/users", listAllUsers)
})
```

## Refresh token

Access token nên ngắn hạn (15-60 phút). Refresh token dài hạn (7-30 ngày).

```go
type RefreshRequest struct {
    RefreshToken string `json:"refresh_token"`
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
    var req RefreshRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, 400, "invalid request")
        return
    }
    
    // Verify refresh token
    claims, err := h.jwt.VerifyRefresh(req.RefreshToken)
    if err != nil {
        writeError(w, 401, "invalid refresh token")
        return
    }
    
    // Check revoked (DB lookup)
    if h.tokenStore.IsRevoked(r.Context(), claims.JTI) {
        writeError(w, 401, "token revoked")
        return
    }
    
    // Generate new access token
    user, err := h.svc.UserByID(r.Context(), claims.UserID)
    if err != nil {
        writeError(w, 401, "invalid token")
        return
    }
    
    newAccess, _ := h.jwt.Generate(user.ID, user.Email, user.Role)
    
    writeJSON(w, 200, map[string]string{"token": newAccess})
}
```

Refresh token store (Redis hoặc DB) — track revoked → logout = mark revoked.

## Logout

JWT stateless — không "logout" thật. Cách handle:
1. Frontend xóa token.
2. Server thêm token vào **revocation list** (Redis với TTL = remaining lifetime).
3. Middleware check revocation.

```go
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
    claims, _ := UserFromContext(r.Context())
    
    // Revoke
    h.tokenStore.Revoke(r.Context(), claims.ID, claims.ExpiresAt.Time)
    
    writeJSON(w, 200, map[string]string{"status": "ok"})
}
```

→ Trade-off: stateless lost, nhưng có security control.

## Pattern: writeJSON + writeError helpers

```go
func writeJSON(w http.ResponseWriter, status int, data any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
    writeJSON(w, status, map[string]string{"error": msg})
}
```

DRY. Caller 1 dòng.

## Bẫy thường gặp với auth

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Lưu password plaintext | Disaster | bcrypt cost 12 |
| JWT secret weak | Brute force | 256-bit random |
| Token không expire | Vĩnh viễn valid | Set `ExpiresAt` |
| Trả "email not found" | Email enumeration | "Invalid credentials" |
| String key cho context | Collision | Custom type |
| Token trong query string | Log leak | Header `Bearer` |
| Logout không revoke | Token vẫn valid | Revocation list |
| Algorithm "none" attack | Bypass signature | Verify alg phải HS256 |
| Refresh token không rotate | Replay | Rotate mỗi refresh |
| JWT chứa sensitive data | Leak khi decode | Chỉ ID + role |

## Security checklist

```text
[Password]
✓ bcrypt cost 12+
✓ Min length 8, mix case + digit
✓ Rate limit login (5 attempts/min)
✓ Lock account after N failed

[JWT]
✓ Secret 256-bit random (32+ byte)
✓ ExpiresAt set (15-60 min access, 7-30d refresh)
✓ Algorithm whitelist HS256/RS256
✓ Verify signature + exp + iss + aud
✓ Don't store sensitive data in payload

[Transport]
✓ HTTPS only (HSTS header)
✓ Token in Authorization header, not URL
✓ CORS configured

[Storage]
✓ Refresh token in DB/Redis (revocable)
✓ Audit log login attempts
```

## Quick reference

```go
// Password
auth.HashPassword(pwd)
auth.VerifyPassword(hash, pwd)

// JWT
jm := auth.NewJWTManager(secret, lifetime)
token, _ := jm.Generate(userID, email, role)
claims, err := jm.Verify(token)

// Middleware
r.Use(AuthMiddleware(jm))
r.Use(RequireRole("admin"))

// Context
claims, ok := UserFromContext(r.Context())

// Helper
writeJSON(w, status, data)
writeError(w, status, msg)
```

## Tóm tắt bài 2

- Password: bcrypt cost 12, không SHA/MD5.
- JWT lib: `golang-jwt/jwt/v5`. HS256 cho symmetric, RS256 cho asymmetric (multi-service).
- Access token ngắn (15-60 min), refresh token dài (7-30d).
- Login: same response cho email/password sai — chống enumeration.
- Middleware: parse Bearer → verify → inject vào context.
- Custom `contextKey` tránh collision string key.
- Role-based access: middleware `RequireRole`.
- Logout: revocation list (Redis với TTL).
- Security: HTTPS, rate limit, algorithm whitelist, don't store sensitive data in JWT.

**Bài kế tiếp** → [Bài 3: Service layer + Repository pattern + DI](03-service-repository.md)
