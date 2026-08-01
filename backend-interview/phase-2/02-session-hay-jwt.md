# Bài 2: Session hay JWT — server nhớ bạn hay bạn mang bằng chứng

Vừa lên bản mới, **2.000 người bị đá ra khỏi tài khoản**.

Người phỏng vấn xoay màn hình lại, kéo ghế ngồi xuống đối diện, rồi hỏi đúng một câu:

> *"Session lưu ở đâu?"*

Câu hỏi cũ tới mức nghe như hỏi cho vui, để làm nóng trước khi vào phần khó. **Nó không phải vậy đâu.**

Vì đây là câu hỏi bốn tầng, và đáp án tầng một — *"lưu trong bộ nhớ máy chủ, mã phiên để trong cookie"* — vừa **đúng** vừa là **nguyên nhân của 2.000 người bị đá ra**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **Session** | **Phiên làm việc** — trạng thái server nhớ về bạn giữa các request |
| **Session ID** | **Mã phiên** — chuỗi ngẫu nhiên trỏ tới dữ liệu phiên trên server |
| **Cookie** | Mẩu dữ liệu trình duyệt tự động gửi kèm mọi request tới cùng tên miền |
| **Stateful** | **Có trạng thái** — server phải nhớ |
| **Stateless** | **Không trạng thái** — server không nhớ gì, mọi thứ nằm trong request |
| **JWT** (*JSON Web Token*) | Token tự chứa thông tin, có chữ ký số |
| **Claim** | **Tuyên bố** — một trường thông tin bên trong JWT (`sub`, `exp`, `role`...) |
| **Signature** | **Chữ ký số** — bằng chứng nội dung chưa bị sửa |
| **Base64url** | Cách biểu diễn dữ liệu bằng ký tự an toàn cho URL — **không phải mã hoá** |
| **Revoke** | **Thu hồi** — vô hiệu hoá một token/phiên trước hạn |
| **XSS** (*Cross-Site Scripting*) | Kẻ tấn công chèn được JavaScript vào trang của bạn |
| **CSRF** (*Cross-Site Request Forgery*) | Trang khác lừa trình duyệt gửi request thay bạn |

## Trường phái 1: Session — server nhớ bạn

```text
   ĐĂNG NHẬP
   ┌────────┐  POST /login {email, password}   ┌──────────┐
   │ Client │ ────────────────────────────────►│  Server  │
   │        │                                   │          │
   │        │                                   │ ① kiểm mật khẩu
   │        │                                   │ ② sinh mã ngẫu nhiên
   │        │                                   │    "a3f9c1..."
   │        │                                   │ ③ LƯU vào kho:
   │        │                                   │    a3f9c1 → {user_id: 42,
   │        │                                   │              role: "admin"}
   │        │  Set-Cookie: sid=a3f9c1;          │
   │        │◄──── HttpOnly; Secure; SameSite ──│
   └────────┘                                   └──────────┘

   MỖI REQUEST SAU
   ┌────────┐  Cookie: sid=a3f9c1              ┌──────────┐
   │ Client │ ────────────────────────────────►│  Server  │
   │(tự động│      (trình duyệt tự gửi)        │ TRA KHO  │
   │ gửi)   │                                   │ a3f9c1 → user 42
   └────────┘                                   └──────────┘
```

Toàn bộ thông tin nằm ở **phía server**. Cookie chỉ chứa một **mã tra cứu vô nghĩa** — lộ ra cũng không đọc được gì (nhưng dùng được, nên vẫn phải bảo vệ).

### Đây là chỗ 2.000 người bị đá ra

```text
❌ Lưu trong BỘ NHỚ của tiến trình:

   Load Balancer chia request ngẫu nhiên
        ├──► Máy A [bộ nhớ: a3f9c1 → user 42]
        └──► Máy B [bộ nhớ: TRỐNG]

   Request 1 rơi vào máy A → OK
   Request 2 rơi vào máy B → "Bạn là ai?" → ĐÁ RA

   → Khoảng 50% request mất phiên với 2 máy.
   → Và MỖI LẦN DEPLOY là mất sạch phiên của tất cả mọi người.
```

**Cách chữa: tách mã phiên khỏi dữ liệu phiên.**

```text
✅ Mã phiên trong cookie, DỮ LIỆU phiên trong KHO CHUNG:

        ├──► Máy A ──┐
        └──► Máy B ──┼──► Redis / PostgreSQL  [a3f9c1 → user 42]
             Máy C ──┘

   Thêm bao nhiêu máy cũng không ảnh hưởng. Deploy không mất phiên.
```

```python
import secrets, json, redis

r = redis.Redis()
TTL = 7 * 24 * 3600          # 7 ngày

def tao_phien(user_id: int, ip: str, ua: str) -> str:
    sid = secrets.token_urlsafe(32)       # ◄── PHẢI dùng bộ sinh mã hoá
    r.setex(f"sess:{sid}", TTL, json.dumps({
        "user_id": user_id, "tao_luc": time.time(), "ip": ip, "ua": ua,
    }))
    return sid

def doc_phien(sid: str):
    raw = r.get(f"sess:{sid}")
    if not raw:
        return None
    r.expire(f"sess:{sid}", TTL)          # gia hạn trượt (sliding expiration)
    return json.loads(raw)
```

> **Cảnh báo:** dùng `secrets.token_urlsafe` (Python) / `crypto.randomBytes` (Node), **không dùng `random`** — bộ sinh ngẫu nhiên thường có thể đoán được, và đoán được mã phiên là chiếm được tài khoản.

### Cookie phải cấu hình đúng — bốn thuộc tính

```http
Set-Cookie: sid=a3f9c1...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800
```

| Thuộc tính | Chống được gì | Nếu thiếu thì sao |
|---|---|---|
| `HttpOnly` | **XSS** đọc trộm cookie | JavaScript đọc được `document.cookie` → mất phiên |
| `Secure` | Nghe lén trên HTTP | Cookie gửi cả trên kết nối không mã hoá |
| `SameSite=Lax` | **CSRF** | Trang khác lừa trình duyệt gửi request thay bạn |
| `Path` / `Domain` | Rò sang subdomain | Cookie lộ cho subdomain không tin cậy |

```text
SameSite giải thích:
   Strict — cookie KHÔNG gửi khi tới từ trang khác. An toàn nhất,
            nhưng click link từ email vào cũng bị coi là chưa đăng nhập.
   Lax    — gửi khi ĐIỀU HƯỚNG bằng GET từ trang khác, không gửi với POST.
            ◄── ĐIỂM CÂN BẰNG TỐT NHẤT, và là mặc định của trình duyệt hiện đại.
   None   — luôn gửi. BẮT BUỘC kèm Secure. Chỉ dùng khi thật sự cần cross-site.
```

## Trường phái 2: JWT — bạn mang bằng chứng đóng dấu sẵn

Ý tưởng lật ngược hoàn toàn: thay vì server ghi nhớ bạn, **hãy để chính bạn mang theo bằng chứng có đóng dấu**.

```text
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9  .  eyJzdWIiOiI0MiIsImV4cCI6MTc1...  .  dBjftJeZ4CVP-mB92K
   └────────── HEADER ──────────────────┘    └────────── PAYLOAD ─────────┘    └──── SIGNATURE ────┘
        thuật toán, loại token                thông tin về bạn (claims)          chữ ký bảo vệ
```

```json
// HEADER
{ "alg": "HS256", "typ": "JWT" }

// PAYLOAD — các "claim" chuẩn
{
  "sub": "42",                    // subject — ID người dùng (KHÔNG bao giờ đổi)
  "iss": "https://auth.shop.vn",  // issuer — ai cấp
  "aud": "shop-api",              // audience — cấp cho ứng dụng nào
  "exp": 1754035200,              // expiration — hết hạn lúc nào
  "iat": 1754031600,              // issued at — cấp lúc nào
  "jti": "9f3c-4a1e",             // JWT ID — để thu hồi từng cái
  "role": "admin"                 // claim tuỳ biến
}
```

### Kiến trúc và cách hoạt động: chữ ký hoạt động thế nào

```text
KHI CẤP TOKEN:
   noi_dung = base64url(header) + "." + base64url(payload)
   chu_ky   = HMAC-SHA256(noi_dung, KHOA_BI_MAT)      ◄── chỉ server biết khoá
   token    = noi_dung + "." + base64url(chu_ky)

KHI KIỂM TOKEN:
   ① Tách token thành 3 phần
   ② Tự tính lại chữ ký từ header+payload bằng KHOA_BI_MAT
   ③ So chữ ký tự tính với chữ ký trong token
      → khớp   = nội dung CHƯA BỊ SỬA
      → lệch   = từ chối ngay

   Giống CON DẤU SÁP của nhà vua: ai sửa nội dung bên trong,
   con dấu lập tức vỡ và thư bị từ chối.
```

**Điểm tuyệt vời:** server chỉ cần kiểm con dấu là biết token thật hay giả — **không phải mở kho hồ sơ nào cả**. Đây là "không trạng thái" (stateless).

### ⚠️ Hiểu lầm đắt tiền nhất về JWT

```text
   BASE64URL KHÔNG PHẢI MÃ HOÁ.

   Bất kỳ ai cầm token đều ĐỌC ĐƯỢC toàn bộ payload.
   Không cần khoá. Không cần công cụ đặc biệt. Dán vào jwt.io là xong.
```

```bash
echo 'eyJzdWIiOiI0MiIsInJvbGUiOiJhZG1pbiJ9' | base64 -d
# {"sub":"42","role":"admin"}
```

**Chữ ký chống SỬA, không chống ĐỌC.**

```json
// ❌ TUYỆT ĐỐI KHÔNG bỏ vào JWT
{ "sub": "42", "cccd": "001099...", "luong": 45000000, "so_the": "4111..." }
```

Muốn nội dung bí mật thì cần **JWE** (*JSON Web Encryption*) — nhưng gần như không ai dùng. Cách đúng là **đừng để dữ liệu nhạy cảm trong token**.

### Hai loại thuật toán ký

```text
HS256 (đối xứng) — MỘT khoá dùng cả để ký và kiểm
   ✓ Đơn giản, nhanh
   ✗ Mọi dịch vụ kiểm token đều phải giữ khoá → dịch vụ nào cũng KÝ ĐƯỢC
   → chỉ dùng khi một hệ thống vừa cấp vừa kiểm

RS256 / ES256 (bất đối xứng) — khoá RIÊNG để ký, khoá CÔNG KHAI để kiểm
   ✓ Chỉ máy chủ xác thực giữ khoá riêng
   ✓ Các dịch vụ khác chỉ cần khoá công khai (tải từ endpoint JWKS)
   → BẮT BUỘC cho hệ thống nhiều dịch vụ
```

### Ba lỗ hổng JWT kinh điển

```python
# ❌ LỖ HỔNG 1: alg=none — token không cần chữ ký
# Kẻ tấn công đổi header thành {"alg":"none"}, xoá chữ ký, sửa payload tuỳ ý
jwt.decode(token, key, algorithms=["none"])      # THẢM HOẠ

# ✅ Luôn CHỈ ĐỊNH thuật toán, không để thư viện tự đọc từ header
jwt.decode(token, key, algorithms=["RS256"])     # danh sách trắng cứng

# ❌ LỖ HỔNG 2: nhầm lẫn thuật toán (algorithm confusion)
# Server dùng RS256. Kẻ tấn công đổi header thành HS256 rồi KÝ BẰNG
# CHÍNH KHOÁ CÔNG KHAI (vốn ai cũng tải được). Thư viện cũ sẽ chấp nhận.
# ✅ Chữa: chỉ định algorithms cứng như trên

# ❌ LỖ HỔNG 3: không kiểm aud và iss
# Token do Google cấp cho ỨNG DỤNG KHÁC vẫn được hệ thống bạn chấp nhận
# ✅ Kiểm đủ
jwt.decode(token, key, algorithms=["RS256"],
           audience="shop-api",                  # cấp cho TÔI chứ?
           issuer="https://auth.shop.vn",        # ai cấp?
           options={"require": ["exp", "sub", "aud", "iss"]})
```

## Vấn đề trung tâm: **JWT không thu hồi được**

Đây là câu trả lời cho câu chuyện mở đầu bài trước — *đổi mật khẩu rồi mà hacker vẫn ở trong tài khoản*.

```text
SESSION:  thu hồi = XOÁ một dòng trong Redis        → tức thì ✅
JWT:      token đã cấp là ĐÃ CẤP.
          Server không giữ danh sách nào để xoá.
          Nó CÒN HIỆU LỰC cho tới lúc `exp`.
          → Đổi mật khẩu, đăng xuất, khoá tài khoản: KHÔNG đá được ai ra.
```

Bốn cách xử lý, mỗi cách một cái giá:

```text
① TOKEN NGẮN HẠN + REFRESH TOKEN   ← cách phổ biến nhất
   Access token sống 5-15 phút, refresh token sống 7-30 ngày.
   Refresh token LƯU Ở SERVER (có trạng thái) → thu hồi được.
   → Cửa sổ rủi ro thu về đúng 15 phút.

② DANH SÁCH ĐEN (blacklist)
   Lưu `jti` của token bị thu hồi vào Redis với TTL = thời gian còn lại.
   → Nhưng lúc này bạn PHẢI tra Redis mỗi request
   → tức là đã mất tính "không trạng thái", lợi thế chính của JWT.

③ MỐC THỜI GIAN THU HỒI (revocation timestamp)
   Lưu MỘT dòng mỗi user: `tokens_invalid_before = <thời điểm>`.
   Từ chối mọi token có `iat` < mốc đó.
   → Rẻ hơn blacklist (1 dòng/user thay vì 1 dòng/token), cache được tốt.

④ CHẤP NHẬN RỦI RO
   Với dữ liệu không nhạy cảm, cửa sổ 15 phút là chấp nhận được.
   → Nói ra được điều này trong phỏng vấn là điểm cộng.
```

```python
# Cách ③ — thực dụng nhất
def kiem_token(token: str):
    payload = jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"],
                         audience=AUD, issuer=ISS)
    moc = cache.get(f"invalid_before:{payload['sub']}")   # cache 60s
    if moc and payload["iat"] < moc:
        raise HTTPException(401, "TOKEN_REVOKED")
    return payload

def doi_mat_khau(user_id):
    ...
    cache.set(f"invalid_before:{user_id}", time.time())   # đá mọi token cũ
```

### Xoay vòng refresh token — chống trộm token

```text
Mỗi lần dùng refresh token → cấp refresh token MỚI, HUỶ cái cũ.

Nếu một refresh token CŨ được dùng lại
   → nghĩa là có hai bên đang giữ cùng một chuỗi
   → chắc chắn đã bị trộm
   → HUỶ TOÀN BỘ họ token của user đó, bắt đăng nhập lại.

Đây gọi là "phát hiện tái sử dụng" (reuse detection).
```

## Bảng so sánh đầy đủ

| Tiêu chí | Session | JWT |
|---|---|---|
| Nơi giữ trạng thái | **Server** (Redis/DB) | **Client** |
| Kiểm mỗi request | Tra kho (~1 ms) | Kiểm chữ ký (~0,1 ms), không I/O |
| Thu hồi tức thì | ✅ **Xoá một dòng** | ❌ Cần thêm cơ chế |
| Mở rộng ngang | Cần kho chung | ✅ Không cần gì |
| Kích thước gửi kèm | ~40 byte | **~500–1000 byte mỗi request** |
| Đổi quyền có hiệu lực ngay | ✅ | ❌ Chờ token hết hạn |
| Xuyên tên miền / nhiều dịch vụ | Khó | ✅ **Dễ** |
| Rủi ro chính | Trộm session ID | **Không thu hồi được** + lộ payload |
| Nơi lưu ở client | Cookie `HttpOnly` | Cookie `HttpOnly` hoặc bộ nhớ |

## Lưu token ở đâu phía client — câu hỏi vặn hay gặp

```text
❌ localStorage
   JavaScript đọc được → MỘT lỗ hổng XSS là mất sạch token.
   Đây là lựa chọn phổ biến nhất, và cũng là sai lầm phổ biến nhất.

⚠️ Bộ nhớ JavaScript (biến trong app)
   XSS vẫn đọc được, nhưng mất khi tải lại trang → phải refresh liên tục.

✅ Cookie HttpOnly + Secure + SameSite
   JavaScript KHÔNG đọc được → XSS không lấy được token.
   Đổi lại phải chống CSRF — nhưng SameSite=Lax đã giải quyết gần hết.
```

```text
MẪU THIẾT KẾ TỐT NHẤT hiện nay cho web:

   Access token   → cookie HttpOnly, đời ngắn (15 phút)
   Refresh token  → cookie HttpOnly, Path=/auth/refresh, đời dài
                    (giới hạn Path để nó chỉ được gửi tới đúng endpoint đó)
   + SameSite=Lax + kiểm CSRF token cho các thao tác ghi
```

## Session fixation — chi tiết ăn điểm

```text
① Kẻ tấn công lấy một mã phiên hợp lệ (chưa đăng nhập): sid=XYZ
② Lừa nạn nhân dùng chính mã đó (qua link có tham số, hoặc XSS đặt cookie)
③ Nạn nhân ĐĂNG NHẬP — nếu server GIỮ NGUYÊN sid=XYZ...
④ ...thì kẻ tấn công cũng đang giữ sid=XYZ, và giờ nó đã thành phiên đã đăng nhập.
   → Chiếm tài khoản mà không cần biết mật khẩu.
```

```python
# ✅ Luật: ĐĂNG NHẬP XONG PHẢI HUỶ MÃ CŨ VÀ CẤP MÃ MỚI
def dang_nhap(request, email, password):
    user = kiem_mat_khau(email, password)
    r.delete(f"sess:{request.cookies.get('sid')}")   # huỷ mã cũ
    sid_moi = tao_phien(user.id, request.client.host, request.headers["user-agent"])
    response.set_cookie("sid", sid_moi, httponly=True, secure=True, samesite="lax")
```

Nguyên tắc chung: **mọi lần thay đổi mức đặc quyền đều phải cấp mã phiên mới** — đăng nhập, nâng quyền admin, hoàn tất MFA.

## Cây quyết định

```text
Hệ thống của bạn là gì?
   │
   ├─ Web app truyền thống, một tên miền, một backend
   │     └──► SESSION + Redis.
   │          Đơn giản, thu hồi tức thì, đổi quyền có hiệu lực ngay.
   │          → ĐÂY LÀ MẶC ĐỊNH ĐÚNG cho đa số dự án.
   │
   ├─ API cho mobile app, hoặc nhiều dịch vụ độc lập kiểm token
   │     └──► JWT ngắn hạn (RS256) + REFRESH TOKEN có trạng thái
   │
   ├─ Đăng nhập một lần cho nhiều sản phẩm (SSO)
   │     └──► OpenID Connect (bài 5) — chuẩn hoá trên nền JWT
   │
   └─ Chưa biết chắc
         └──► SESSION. Dễ đổi sang JWT sau hơn là chiều ngược lại.
```

> **Sự thật ít ai nói:** rất nhiều dự án chọn JWT vì nghe "hiện đại" và "không trạng thái", rồi lại thêm blacklist trong Redis để thu hồi được — **tức là quay về có trạng thái, mà vẫn gánh nhược điểm payload lớn và không đổi quyền ngay được.** Nói được điều này trong phỏng vấn cho thấy bạn đã suy nghĩ thật.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Vừa lên bản mới, **2.000 người bị đá ra khỏi tài khoản**. Không có lỗi nào trong log.

**Chẩn đoán — ba câu hỏi, mỗi câu một cách kiểm:**

```bash
# ① Hệ thống đang chạy mấy máy?
kubectl get pods -l app=api --no-headers | wc -l
#  4    ← có 4 bản, mà phiên lại nằm trong bộ nhớ từng bản

# ② Phiên đang lưu ở đâu? Grep cấu hình
grep -rn "SESSION_ENGINE\|session_store\|MemoryStore" config/
#  SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
#  CACHES = {'default': {'BACKEND': 'LocMemCache'}}   ◄── BỘ NHỚ TỪNG TIẾN TRÌNH
```

```text
   ③ TÍNH RA CON SỐ:
      4 máy, phiên chỉ nằm ở 1 máy
      → xác suất request rơi đúng máy đó = 1/4
      → 75% REQUEST MẤT PHIÊN

      Và mỗi lần deploy = mọi máy khởi động lại = MẤT SẠCH phiên của tất cả.
```

**Cách xử lý — tách mã phiên khỏi dữ liệu phiên:**

```python
# ✅ Dữ liệu phiên ra KHO CHUNG
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": "redis://redis-master:6379/1",
    }
}
SESSION_ENGINE = "django.contrib.sessions.backends.cache"

SESSION_COOKIE_HTTPONLY = True      # JS không đọc được → chống XSS
SESSION_COOKIE_SECURE   = True      # chỉ gửi qua HTTPS
SESSION_COOKIE_SAMESITE = "Lax"     # chống CSRF
```

**Kiểm chứng bằng test, đừng tin cảm giác:**

```python
def test_phien_song_qua_nhieu_may():
    """Đăng nhập ở 'máy A', gọi API ở 'máy B' — phải vẫn nhận ra."""
    sid = dang_nhap(client_may_a, "an@x.com", "matkhau")
    r = client_may_b.get("/api/me", cookies={"sid": sid})
    assert r.status_code == 200, "Phiên không sống qua nhiều máy"
```

**Và một chi tiết bảo mật hay bị quên trong lúc sửa:**

```python
# ✅ ĐĂNG NHẬP XONG PHẢI CẤP MÃ PHIÊN MỚI — chống session fixation
def dang_nhap(request, email, password):
    user = kiem_mat_khau(email, password)
    request.session.cycle_key()      # ◄── huỷ mã cũ, cấp mã mới
    request.session["user_id"] = user.id
```

```text
   VÌ SAO CẦN?
   ① Kẻ tấn công lấy một mã phiên hợp lệ (chưa đăng nhập): sid=XYZ
   ② Lừa nạn nhân dùng chính mã đó
   ③ Nạn nhân ĐĂNG NHẬP — nếu server giữ nguyên sid=XYZ...
   ④ ...thì kẻ tấn công cũng đang giữ sid=XYZ, và nó vừa thành phiên ĐÃ ĐĂNG NHẬP.
   → Chiếm tài khoản mà KHÔNG CẦN BIẾT MẬT KHẨU.
```

> **Tình huống 2:** Phát hiện một tài khoản admin bị chiếm. Bạn đổi mật khẩu và khoá tài khoản. **Nhưng kẻ tấn công vẫn đang thao tác trong hệ thống.**

**Chẩn đoán:** hệ thống dùng JWT, và **JWT không thu hồi được**.

```bash
# Giải mã token của kẻ tấn công (lấy từ log) để biết còn bao lâu
echo 'eyJhbGciOi...' | cut -d. -f2 | base64 -d | jq '.exp, .iat, .sub'
#  1754121600   ← hết hạn lúc nào
#  1754035200   ← cấp lúc nào
#  → token sống 24 GIỜ. Còn 18 giờ nữa nó mới hết hiệu lực.
```

```text
   ĐỔI MẬT KHẨU KHÔNG ĐÁ ĐƯỢC AI RA.
   Server không giữ danh sách token nào để xoá — nó chỉ kiểm CHỮ KÝ.
```

**Cứu hoả ngay — ba lựa chọn theo mức độ khẩn cấp:**

```text
① NẶNG NHẤT (đá TẤT CẢ mọi người, dùng khi khẩn cấp thật):
   Xoay khoá ký → mọi token cũ lập tức sai chữ ký
   → nhưng 100% người dùng phải đăng nhập lại

② VỪA: đặt MỐC THU HỒI cho riêng user đó
③ NHẸ: chặn theo `jti` (mã token) — chỉ chặn đúng token đó
```

```python
# ② MỐC THU HỒI — rẻ nhất và nên có sẵn từ đầu
def khoa_tai_khoan(user_id):
    db.execute("UPDATE users SET tokens_invalid_before = now() WHERE id = %s",
               (user_id,))
    cache.set(f"invalid_before:{user_id}", time.time(), ex=86400)

def kiem_token(token: str):
    p = jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"],
                   audience=AUD, issuer=ISS)
    moc = cache.get(f"invalid_before:{p['sub']}")     # cache 60s, rất rẻ
    if moc and p["iat"] < float(moc):
        raise HTTPException(401, "TOKEN_REVOKED")
    return p
```

**Sửa gốc — thu cửa sổ rủi ro từ 24 giờ xuống 15 phút:**

```python
# Access token ĐỜI NGẮN + refresh token CÓ TRẠNG THÁI
ACCESS_TOKEN_TTL  = timedelta(minutes=15)      # ◄── cửa sổ rủi ro tối đa
REFRESH_TOKEN_TTL = timedelta(days=30)         # lưu BẢN BĂM trong database

def lam_moi(refresh_token: str):
    ban_ghi = db.lay_refresh(hash_it(refresh_token))
    if ban_ghi is None:
        raise HTTPException(401)
    if ban_ghi.da_dung:                          # ◄── PHÁT HIỆN TÁI SỬ DỤNG
        db.huy_toan_bo_ho_token(ban_ghi.family_id)   # huỷ CẢ HỌ
        canh_bao_bao_mat(ban_ghi.user_id)
        raise HTTPException(401, "TOKEN_REUSE_DETECTED")
    db.danh_dau_da_dung(ban_ghi.id)
    return cap_token_moi(ban_ghi.user_id, family_id=ban_ghi.family_id)
```

> **Và đây là điều đáng suy nghĩ:** nếu bạn phải thêm blacklist hoặc mốc thu hồi để thu hồi được token, thì bạn **đã quay về có trạng thái** — mà vẫn gánh nhược điểm payload lớn và không đổi quyền ngay được. Với web app một tên miền, **session + Redis đơn giản hơn và mạnh hơn**.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Session trong bộ nhớ tiến trình | Thêm máy = mất phiên; deploy = đá hết | Kho chung (Redis/DB) |
| Sinh mã phiên bằng `random` thường | Đoán được → chiếm tài khoản | `secrets` / `crypto.randomBytes` |
| Cookie thiếu `HttpOnly` | XSS đọc trộm được | Luôn bật |
| Cookie thiếu `SameSite` | CSRF | `SameSite=Lax` |
| Đăng nhập không cấp mã phiên mới | **Session fixation** | Huỷ mã cũ, cấp mã mới |
| Để token trong `localStorage` | XSS lấy sạch | Cookie `HttpOnly` |
| Bỏ dữ liệu nhạy cảm vào JWT payload | Ai cũng đọc được (Base64 ≠ mã hoá) | Chỉ để `sub`, `exp`, `role` |
| `algorithms` lấy từ header token | `alg=none` / nhầm lẫn thuật toán | Danh sách trắng cứng trong code |
| Không kiểm `aud` và `iss` | Chấp nhận token của ứng dụng khác | Kiểm đủ 5 trường |
| JWT đời dài (7 ngày) | Không đá được ai ra suốt 7 ngày | 15 phút + refresh token |
| Refresh token không xoay vòng | Trộm được là dùng mãi | Xoay vòng + phát hiện tái sử dụng |
| Dùng HS256 cho nhiều dịch vụ | Dịch vụ nào cũng ký được token | RS256 + JWKS |
| Đổi mật khẩu không huỷ phiên/token | Hacker vẫn ở trong tài khoản | Xoá phiên hoặc đặt mốc thu hồi |

## Câu hỏi phỏng vấn hay gặp

**H: Session lưu ở đâu?**
Em tách hai thứ: **mã phiên** nằm trong cookie `HttpOnly` `Secure` `SameSite`, còn **dữ liệu phiên** nằm ở **kho chung** như Redis. Không lưu trong bộ nhớ máy chủ, vì khi chạy hai máy sau bộ cân tải thì request rơi vào máy kia sẽ không tìm thấy phiên — khoảng một nửa số lượt bị đá ra, và mỗi lần deploy là mất sạch phiên của mọi người. Và một chi tiết hay bị quên: **đăng nhập xong phải huỷ mã cũ và cấp mã mới** để chống session fixation.

**H: Session và JWT khác gì? Chọn cái nào?**
Session là **server nhớ bạn** — trạng thái nằm ở server, nên thu hồi chỉ là xoá một dòng, và đổi quyền có hiệu lực ngay. JWT là **bạn mang bằng chứng có chữ ký** — server không cần tra kho nào, nên dễ mở rộng và dễ dùng xuyên nhiều dịch vụ. Em mặc định chọn **session + Redis** cho web app một tên miền, vì nó đơn giản và thu hồi được tức thì. JWT đáng dùng khi có nhiều dịch vụ độc lập cùng kiểm token, hoặc cho mobile app.

**H: Nhược điểm lớn nhất của JWT là gì?**
**Không thu hồi được.** Token đã cấp là còn hiệu lực tới lúc `exp`, nên đổi mật khẩu hay khoá tài khoản cũng không đá được kẻ đang giữ token. Bốn cách xử lý: token ngắn hạn 15 phút cộng refresh token có trạng thái (phổ biến nhất, thu cửa sổ rủi ro về 15 phút); danh sách đen theo `jti` — nhưng lúc đó phải tra Redis mỗi request, tức là **đã mất tính không trạng thái**, lợi thế chính của JWT; hoặc lưu một mốc `tokens_invalid_before` cho mỗi user, rẻ hơn nhiều và cache được. Nhược điểm thứ hai là **payload ai cũng đọc được** — Base64 không phải mã hoá.

**H: Token nên lưu ở đâu phía client?**
Không lưu trong `localStorage` — JavaScript đọc được nên một lỗ hổng XSS là mất sạch, và đây là sai lầm phổ biến nhất. Lưu trong **cookie `HttpOnly` `Secure` `SameSite=Lax`**: JavaScript không đọc được nên XSS không lấy được token; đổi lại phải chống CSRF, nhưng `SameSite=Lax` đã giải quyết gần hết. Mẫu tốt nhất là access token đời ngắn trong cookie, refresh token trong cookie riêng có `Path` giới hạn về đúng endpoint refresh.

**H: `alg=none` là lỗ hổng gì?**
Là khi thư viện đọc thuật toán **từ chính header của token** thay vì từ cấu hình của bạn. Kẻ tấn công đổi header thành `{"alg":"none"}`, xoá chữ ký, sửa payload thành `role: admin` — và thư viện chấp nhận vì token "không cần chữ ký". Người anh em của nó là **nhầm lẫn thuật toán**: server dùng RS256, kẻ tấn công đổi sang HS256 rồi ký bằng chính **khoá công khai** vốn ai cũng tải được. Cách chữa cho cả hai giống nhau: **luôn chỉ định `algorithms` cứng trong code**, không để thư viện tự quyết.

## Tóm tắt bài 2

- HTTP không có trí nhớ → hai trường phái: **server nhớ bạn** (session) hoặc **bạn mang bằng chứng** (JWT).
- Session: **mã phiên trong cookie, dữ liệu trong kho chung** — không bao giờ lưu trong bộ nhớ tiến trình.
- Cookie phải đủ **`HttpOnly` + `Secure` + `SameSite`**; và **đăng nhập xong phải cấp mã phiên mới** (chống session fixation).
- JWT: chữ ký chống **SỬA**, không chống **ĐỌC** — Base64 không phải mã hoá, đừng để dữ liệu nhạy cảm vào payload.
- Ba lỗ hổng JWT: **`alg=none`**, **nhầm lẫn thuật toán**, **không kiểm `aud`/`iss`** — cả ba chữa bằng cách chỉ định `algorithms` cứng và kiểm đủ trường.
- Nhược điểm cốt lõi của JWT là **không thu hồi được** → token ngắn hạn + refresh token có trạng thái + xoay vòng có phát hiện tái sử dụng.
- Rất nhiều dự án chọn JWT rồi thêm blacklist — **quay về có trạng thái mà vẫn gánh nhược điểm của JWT**. Mặc định đúng cho web app một tên miền là **session + Redis**.

**Bài kế tiếp** → [Bài 3: Basic Auth, API Key và mTLS — xác thực giữa hai cỗ máy](03-basic-auth-api-key-va-mtls.md)
