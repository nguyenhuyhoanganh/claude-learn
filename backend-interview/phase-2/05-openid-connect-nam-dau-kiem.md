# Bài 5: OpenID Connect — tấm hộ chiếu và năm dấu kiểm

**Không một mật khẩu nào bị lộ. Không có tấn công dò mật khẩu.**

2 giờ 14 phút sáng, Minh nhận cảnh báo: **12.000 tài khoản** trong ứng dụng của anh vừa bị người lạ đăng nhập — **bằng cửa chính**.

Log sạch trơn. Người lạ bấm nút "Đăng nhập bằng Google", hệ thống mở cửa. Không dò mật khẩu, không lỗi SQL. **Google cấp cho họ một tấm thẻ thật, và Minh đã tin tấm thẻ đó.**

Thủ phạm nằm ở ba dòng backend:

```python
# ❌ Ba dòng đã giết 12.000 tài khoản
token = request.json["access_token"]                        # nhận từ trình duyệt
info  = requests.get(GOOGLE_USERINFO,
                     headers={"Authorization": f"Bearer {token}"}).json()
user  = db.tim_theo_email(info["email"])                    # thấy email khớp
dang_nhap(user)                                             # → cho vào
```

Nghe rất hợp lý. **Và nó sai ngay từ dòng đầu tiên.**

Vì Minh chưa bao giờ hỏi: ***tấm thẻ này được cấp cho AI?***

## OIDC là gì và vì sao nó tồn tại

Bài 4 đã nói: **OAuth 2.0 trả lời câu "ứng dụng này được làm gì", không trả lời câu "người dùng là ai".**

Nhưng cả thế giới lại dùng nó để đăng nhập. Nên năm 2014, **OpenID Connect** ra đời: nó **không thay thế OAuth**, nó **đứng lên trên OAuth** và thêm đúng một thứ — **một tấm hộ chiếu có niêm phong**, nói rõ *bạn là ai* và *cấp cho ứng dụng nào*.

```text
   ┌──────────────────────────────────────────────┐
   │  OpenID Connect  (XÁC THỰC — "bạn LÀ AI")    │  ← lớp mỏng thêm vào
   ├──────────────────────────────────────────────┤
   │  OAuth 2.0       (PHÂN QUYỀN — "được làm gì")│  ← nền móng
   └──────────────────────────────────────────────┘
```

### Bốn nhân vật trên sân

| Vai | Tên chuẩn | Trong ví dụ |
|---|---|---|
| **Bạn** | End User | Người đăng nhập |
| **Ứng dụng của bạn** | **Relying Party (RP)** | shop24.vn |
| **Nhà cung cấp danh tính** | **OpenID Provider (OP)** | Google |
| **API giữ dữ liệu** | Resource Server | Gmail API, API của shop24 |

## Hai tấm thẻ, hai người đọc — đừng bao giờ cầm nhầm

Đây là bảng quan trọng nhất của cả bài:

```text
   ┌─────────────────────────────────────────────────────────────┐
   │  ACCESS TOKEN                                               │
   │  Ai đọc:      API (resource server)                         │
   │  Trả lời câu: "được LÀM GÌ?"                                │
   │  Ví như:      THẺ TỪ MỞ PHÒNG khách sạn                     │
   │  Định dạng:   thường là chuỗi mờ (opaque), app KHÔNG cần đọc│
   ├─────────────────────────────────────────────────────────────┤
   │  ID TOKEN                                                   │
   │  Ai đọc:      ỨNG DỤNG CỦA BẠN (relying party)              │
   │  Trả lời câu: "LÀ AI?"                                      │
   │  Ví như:      HỘ CHIẾU CÓ NIÊM PHONG                        │
   │  Định dạng:   LUÔN là JWT, app tự đọc và tự kiểm được       │
   └─────────────────────────────────────────────────────────────┘

   ĐỪNG BAO GIỜ ĐẢO NGƯỢC HAI CHIỀU NÀY.
```

Và đây chính là lỗi của Minh:

```text
   Backend của Minh nhận ACCESS TOKEN, rồi dùng chính nó
   để trả lời câu hỏi "người này là ai".

   → Đúng như CẦM THẺ PHÒNG KHÁCH SẠN GIƠ LÊN Ở QUẦY NHẬP CẢNH SÂN BAY.

   Có người sẽ cãi: "nhưng tôi có gọi /userinfo mà!"
   → Không cứu được đâu. `/userinfo` chỉ nói CHỦ CỦA TOKEN NÀY LÀ AI.
     Nó TUYỆT NHIÊN KHÔNG NÓI token được cấp cho ỨNG DỤNG NÀO.
```

Kịch bản tấn công đầy đủ:

```text
① Kẻ tấn công dựng một app vô hại: "Ứng dụng xem thời tiết"
② Nạn nhân đăng nhập app đó bằng Google → app nhận access token HỢP LỆ
③ Kẻ tấn công lấy token đó, gửi thẳng vào backend của shop24
④ shop24 gọi /userinfo → Google trả về email của NẠN NHÂN → hợp lệ!
⑤ shop24 tìm thấy email khớp → CHO ĐĂNG NHẬP

   → Chiếm tài khoản mà không cần biết mật khẩu, không để lại dấu vết bất thường.
   Đây gọi là "confused deputy" — kẻ đại diện bị lú lẫn.
```

### Bên trong ID Token

```json
{
  "iss": "https://accounts.google.com",   // AI CẤP
  "aud": "1234.apps.googleusercontent.com", // CẤP CHO ỨNG DỤNG NÀO  ◄── DẤU KIỂM CỨU MẠNG
  "sub": "110248495921238986420",         // MÃ NGƯỜI DÙNG THẬT
  "exp": 1754035200,                      // hết hạn
  "iat": 1754031600,                      // cấp lúc
  "nonce": "xY9k2mQp...",                 // chống phát lại
  "email": "an@gmail.com",
  "email_verified": true,                 // ◄── ĐỪNG BỎ QUA TRƯỜNG NÀY
  "name": "Nguyễn Văn An"
}
```

**Hai trường quyết định tính đúng đắn:**

```text
`sub` — ĐÂY mới là mã người dùng thật, và nó KHÔNG BAO GIỜ ĐỔI.

   ❌ Khoá tài khoản trong database bằng EMAIL
      → email đổi được, và đổi rất thường xuyên
      → tệ hơn: người dùng bỏ email cũ, nhà cung cấp cấp lại cho NGƯỜI KHÁC
      → người lạ đăng nhập vào đúng tài khoản của bạn

   ✅ Khoá bằng cặp (iss, sub). Email chỉ là thông tin hiển thị.
```

```text
`email_verified` — nếu là false thì email đó CHƯA ĐƯỢC XÁC MINH.

   ❌ Gộp tài khoản theo email chưa xác minh
      → kẻ tấn công đăng ký tài khoản ở một nhà cung cấp lỏng lẻo
        với email của nạn nhân, rồi đăng nhập vào app của bạn
        và được GỘP vào tài khoản thật.

   ✅ Chỉ gộp khi email_verified = true, và tốt nhất là bắt xác nhận thêm.
```

```sql
CREATE TABLE identities (
    identity_id BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(user_id),
    issuer      TEXT   NOT NULL,          -- "https://accounts.google.com"
    subject     TEXT   NOT NULL,          -- giá trị `sub`
    email_luc_lien_ket TEXT,
    UNIQUE (issuer, subject)              -- ◄── khoá thật nằm ở ĐÂY
);
```

## Kiến trúc và cách hoạt động

```text
   NGƯỜI DÙNG      SHOP24 (RP)        GOOGLE (OP)
       │                │                  │
       │ bấm "Đăng nhập │                  │
       │  bằng Google"  │                  │
       ├───────────────►│                  │
       │                │                  │
   ┌───┴────────────────┴──────────────────┴─────────────────────────────┐
   │ BƯỚC 1 — đá trình duyệt sang Google, kèm 5 thứ                      │
   │                                                                      │
   │   GET https://accounts.google.com/o/oauth2/v2/auth                   │
   │       ?client_id=1234.apps.googleusercontent.com                     │
   │       &response_type=code                                            │
   │       &scope=openid email profile     ◄── "openid" BẮT BUỘC, nó biến │
   │                                            OAuth thành OIDC          │
   │       &redirect_uri=https://shop24.vn/callback                       │
   │       &state=xY9k...      ◄── chống CSRF, lưu trong PHIÊN            │
   │       &nonce=mQp7...      ◄── chống PHÁT LẠI, lưu trong PHIÊN        │
   │       &code_challenge=E9Me...&code_challenge_method=S256   (PKCE)    │
   └──────────────────────────────────────────────────────────────────────┘
       │                │                  │
   ┌───┴────────────────┴──────────────────┴─────────────────────────────┐
   │ BƯỚC 2 — người dùng gõ mật khẩu TRÊN TRANG CỦA GOOGLE               │
   │   → mật khẩu KHÔNG BAO GIỜ đi qua máy chủ shop24                    │
   │   → shop24 không thấy nó, không lưu nó, nên không thể làm lộ nó     │
   └──────────────────────────────────────────────────────────────────────┘
       │                │                  │
   ┌───┴────────────────┴──────────────────┴─────────────────────────────┐
   │ BƯỚC 3 — Google KHÔNG đưa token, chỉ ném về MÃ MỘT LẦN              │
   │   302 → https://shop24.vn/callback?code=4/0AY0e...&state=xY9k...    │
   │   → đi qua trình duyệt = ĐƯỜNG CÔNG KHAI, nên nó phải VÔ DỤNG       │
   │     nếu đứng một mình (sống 1 phút, dùng 1 lần, thiếu secret)       │
   └──────────────────────────────────────────────────────────────────────┘
       │                │                  │
   ┌───┴────────────────┴──────────────────┴─────────────────────────────┐
   │ BƯỚC 4 — QUAN TRỌNG NHẤT: backend gọi THẲNG sang Google (kênh sau)  │
   │                                                                      │
   │   POST https://oauth2.googleapis.com/token                          │
   │     code=4/0AY0e...&client_id=...&client_secret=GOCSPX-...          │
   │     &code_verifier=dBjftJeZ...&grant_type=authorization_code        │
   │                                                                      │
   │   ← { "access_token": "ya29...",     ← cho API                      │
   │       "id_token": "eyJhbGci...",     ← CHO ỨNG DỤNG CỦA BẠN         │
   │       "refresh_token": "1//0g..." }                                 │
   │                                                                      │
   │   Trình duyệt KHÔNG BAO GIỜ nhìn thấy cuộc gọi này.                 │
   └──────────────────────────────────────────────────────────────────────┘
       │                │
   ┌───┴────────────────┴───────────────────────────────────────────────┐
   │ BƯỚC 5 — KIỂM ID TOKEN QUA NĂM DẤU KIỂM  (phần tiếp theo)          │
   └────────────────────────────────────────────────────────────────────┘
```

## Năm dấu kiểm — thiếu một là cả bức tường thủng

> JWT chỉ là Base64. **Tôi ngồi đây cũng tự gõ ra một cái trông y hệt.** Thứ làm nó đáng tin không phải nội dung, mà là năm dấu kiểm sau.

```text
① CHỮ KÝ
   Tải khoá công khai từ endpoint JWKS của nhà cung cấp
   (https://www.googleapis.com/oauth2/v3/certs)
   Chọn đúng khoá theo trường `kid` trong header.
   Xác minh chữ ký.
   → VÀ TUYỆT ĐỐI TỪ CHỐI thuật toán tên là "none".

② iss (issuer) — AI ĐÃ CẤP?
   Phải khớp CHÍNH XÁC TỪNG KÝ TỰ với giá trị trong tài liệu discovery.
   → So NGUYÊN CHUỖI. Đừng dùng "chứa" hay "bắt đầu bằng".
     Thừa một dấu gạch chéo cuối cũng là SAI.

③ aud (audience) — CẤP CHO AI?          ◄── DẤU KIỂM CỨU MẠNG
   Phải bằng ĐÚNG client_id của riêng bạn.
   → Đúng MỘT DÒNG `if` là xong. Và đó chính là dòng Minh đã thiếu.

④ exp / iat — CÒN HẠN KHÔNG?
   Kiểm `exp` chưa qua, và chỉ cho phép lệch đồng hồ vài chục giây.
   → Nới cửa sổ này ra vài phút là bạn tự mở lại cánh cửa vừa đóng.

⑤ nonce — CÓ PHẢI LẦN ĐĂNG NHẬP NÀY KHÔNG?
   Chuỗi bạn sinh ở bước 1 và cất trong phiên phải khớp
   với `nonce` nằm trong token.
   → Không khớp nghĩa là ai đó đang PHÁT LẠI một lần đăng nhập cũ.
```

```python
from jose import jwt
import httpx

# Tải cấu hình từ discovery — đừng nhúng cứng URL
CAU_HINH = httpx.get("https://accounts.google.com/.well-known/openid-configuration").json()
JWKS     = httpx.get(CAU_HINH["jwks_uri"]).json()      # nhớ CACHE, và làm mới theo `kid`

def kiem_id_token(id_token: str, nonce_trong_phien: str):
    payload = jwt.decode(
        id_token,
        JWKS,
        algorithms=["RS256"],                 # ① danh sách trắng CỨNG, không đọc từ header
        issuer=CAU_HINH["issuer"],            # ② iss
        audience=CLIENT_ID,                   # ③ aud  ◄── DÒNG CỨU MẠNG
        options={
            "require": ["exp", "iat", "sub", "aud", "iss"],
            "leeway": 30,                     # ④ exp, cho lệch đồng hồ 30 giây
        },
    )
    if payload.get("nonce") != nonce_trong_phien:      # ⑤ nonce
        raise HTTPException(401, "NONCE_MISMATCH")
    if not payload.get("email_verified", False):
        raise HTTPException(401, "EMAIL_CHUA_XAC_MINH")
    return payload
```

**Diễn lại đúng đêm đó:** tấm thẻ của app lạ bay tới backend. Backend bóc ID token ra, đọc trường `aud` — thấy ghi tên **app lạ** chứ không phải `shop24`. **Từ chối.** Chỉ một dòng `if`. 12.000 tài khoản vẫn nguyên vẹn.

> **Lời khuyên cuối và quan trọng nhất: đừng tự viết năm dấu kiểm này.** Mọi ngôn ngữ đều có thư viện đã được soi kỹ (`authlib`, `openid-client`, `spring-security-oauth2`). Gọi một hàm là xong. Tự viết là tự nhận thêm năm chỗ để sai.

## Ba khái niệm đi kèm hay bị hỏi

### ① `nonce` và `state` khác nhau thế nào?

Đây là câu hỏi vặn rất hay gặp, vì cả hai đều là chuỗi ngẫu nhiên lưu trong phiên.

```text
   state  — đi theo TRÌNH DUYỆT (query string), quay về ở URL callback.
            Chống: CSRF trên luồng đăng nhập.
            Trả lời câu: "cái CODE quay về này có đúng là của phiên tôi vừa mở không?"

   nonce  — đi vào TRONG ID TOKEN, do nhà cung cấp nhúng vào.
            Chống: phát lại (replay) một ID token cũ.
            Trả lời câu: "cái TOKEN này có đúng là của lần đăng nhập vừa rồi không?"

   Hai thứ khác nhau, bảo vệ hai chỗ khác nhau. PHẢI CÓ CẢ HAI.
```

### ② ID token chỉ là một bức ảnh chụp

```text
   ID token nói: "LÚC 9 GIỜ SÁNG, người này là An."
   Nó KHÔNG nói gì về 9 giờ 01 phút.

   → Vì thế: dùng ID token ĐÚNG MỘT LẦN, lúc đăng nhập,
     rồi TẠO PHIÊN CỦA RIÊNG BẠN (session hoặc token nội bộ).

   ❌ ĐỪNG gửi ID token lên API của bạn ở mọi request.
      Đó là hỏi tấm hộ chiếu một câu vốn dành cho thẻ phòng.
```

### ③ Đăng xuất trong OIDC phức tạp hơn bạn nghĩ

```text
   Người dùng bấm "Đăng xuất" ở shop24:
      → xoá phiên ở shop24  ✅
      → NHƯNG họ vẫn đang đăng nhập ở Google
      → bấm "Đăng nhập bằng Google" lần nữa là vào lại NGAY, không hỏi gì

   Muốn đăng xuất thật sự (RP-initiated logout):
      GET {end_session_endpoint}
          ?id_token_hint=eyJ...
          &post_logout_redirect_uri=https://shop24.vn/da-dang-xuat

   Và ngược lại — Back-Channel Logout:
      Khi người dùng đăng xuất ở Google, Google gọi ngược về
      endpoint đăng xuất của bạn để bạn huỷ phiên.
      → Phải đăng ký endpoint này và xác minh logout token.
```

## Tình huống thực tế và cách xử lý

> **Tình huống:** Công ty muốn hỗ trợ đăng nhập bằng Google, Facebook, và cả tài khoản email/mật khẩu truyền thống. Người dùng An đăng ký bằng email, tháng sau bấm "Đăng nhập bằng Google" với **cùng email đó**. Chuyện gì xảy ra?

**Ba lựa chọn, ba hệ quả — đây là quyết định sản phẩm, không chỉ là kỹ thuật:**

```text
❌ Cách 1: TỰ ĐỘNG GỘP theo email
   → Lỗ hổng chiếm tài khoản. Kẻ tấn công đăng ký ở một nhà cung cấp
     lỏng lẻo bằng email của nạn nhân, rồi đăng nhập và được gộp
     vào tài khoản thật.

⚠️ Cách 2: TẠO TÀI KHOẢN RIÊNG
   → An có hai tài khoản, dữ liệu bị chia đôi, bộ phận hỗ trợ khổ sở.

✅ Cách 3: GỘP CÓ XÁC NHẬN — cách đúng
   → Phát hiện email trùng VÀ email_verified = true
   → Hiện màn hình: "Email này đã có tài khoản. Đăng nhập bằng mật khẩu
     để liên kết với Google."
   → Chỉ liên kết SAU KHI người dùng chứng minh sở hữu tài khoản cũ.
```

```python
def xu_ly_dang_nhap_oidc(payload):
    # ① Đã liên kết trước đó chưa?
    ident = db.tim_identity(issuer=payload["iss"], subject=payload["sub"])
    if ident:
        return dang_nhap(ident.user_id)          # đường thẳng

    # ② Chưa liên kết — có tài khoản nào trùng email không?
    if not payload.get("email_verified"):
        return tao_tai_khoan_moi(payload)        # email chưa xác minh: KHÔNG gộp

    user_cu = db.tim_user_theo_email(payload["email"])
    if user_cu:
        # ③ KHÔNG tự động gộp — bắt chứng minh sở hữu
        return yeu_cau_xac_nhan_lien_ket(user_cu.id, payload)

    # ④ Hoàn toàn mới
    return tao_tai_khoan_moi(payload)
```

> **Tình huống 2:** Backend cần biết vai trò (`role`) của người dùng để phân quyền. Nhóm đề xuất nhét `role` vào ID token cho tiện.

**Vấn đề:** ID token là ảnh chụp lúc đăng nhập. Nếu bạn thu quyền admin của ai đó lúc 10 giờ, token cấp lúc 9 giờ **vẫn ghi `role: admin`** cho tới khi hết hạn.

**Cách xử lý:**

```text
✅ Dùng ID token ĐÚNG MỘT LẦN để biết `sub`, rồi tra vai trò từ
   DATABASE CỦA BẠN ở mỗi request.
   → Thu quyền có hiệu lực ngay lập tức.

⚠️ Nếu buộc phải nhét vào token vì lý do hiệu năng:
   → token đời rất ngắn (5 phút)
   → cộng cơ chế thu hồi (mốc `tokens_invalid_before` — xem bài 2)
```

Nguyên tắc chung: **danh tính đến từ nhà cung cấp, quyền hạn đến từ hệ thống của bạn.**

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng access token để biết "là ai" | **Chiếm tài khoản** (confused deputy) | Dùng **ID token**, kiểm `aud` |
| Không kiểm `aud` | Token của app khác cũng vào được | Một dòng `if` — dòng cứu mạng |
| Chỉ gọi `/userinfo` rồi tin | `/userinfo` không nói token cấp cho ai | Kiểm ID token đủ 5 dấu |
| Khoá tài khoản bằng **email** | Email đổi được, và có thể bị cấp lại cho người khác | Khoá bằng `(iss, sub)` |
| Bỏ qua `email_verified` | Chiếm tài khoản qua nhà cung cấp lỏng lẻo | Chỉ gộp khi đã xác minh |
| Tự động gộp theo email | Lỗ hổng chiếm tài khoản | Gộp có xác nhận sở hữu |
| Chấp nhận `alg: none` | Ai cũng tự ký token được | Danh sách trắng cứng `["RS256"]` |
| So `iss` bằng "chứa"/"bắt đầu bằng" | Nhà cung cấp giả lọt qua | So nguyên chuỗi từng ký tự |
| Không kiểm `nonce` | Phát lại token cũ | Sinh, lưu phiên, so lúc nhận |
| Nới `leeway` lên vài phút | Token hết hạn vẫn dùng được | Vài chục giây là đủ |
| Gửi ID token lên API mọi request | Sai mục đích, không thu hồi được | Tạo phiên của riêng bạn |
| Nhét `role` vào ID token đời dài | Thu quyền không có hiệu lực | Tra quyền từ database của bạn |
| Không cache JWKS | Gọi mạng mỗi request | Cache + làm mới theo `kid` lạ |
| Cache JWKS vĩnh viễn | Nhà cung cấp xoay khoá → hỏng hết | Có TTL + làm mới khi gặp `kid` mới |
| Tự viết code kiểm token | Năm chỗ để sai | Dùng thư viện đã được soi kỹ |

## Câu hỏi phỏng vấn hay gặp

**H: OAuth 2.0 và OpenID Connect khác gì nhau?**
OAuth trả lời *"ứng dụng này được làm gì trên dữ liệu của bạn"* — đó là **phân quyền**. OIDC đứng **lên trên** OAuth và thêm đúng một thứ: **ID token**, một tấm hộ chiếu có niêm phong nói rõ *bạn là ai* và *cấp cho ứng dụng nào* — đó là **xác thực**. Dùng OAuth thuần để đăng nhập là sai mục đích, và chính chỗ đó sinh ra lỗ hổng chiếm tài khoản.

**H: Access token và ID token khác gì?**
**Access token dành cho API** — trả lời câu *"được làm gì"*, ví như thẻ từ mở phòng khách sạn, và ứng dụng của bạn không cần đọc nó. **ID token dành cho ứng dụng của bạn** — trả lời câu *"là ai"*, luôn là JWT nên bạn tự đọc và tự kiểm được, ví như hộ chiếu. **Đừng bao giờ đảo ngược hai chiều đó** — dùng access token để xác định danh tính chính là cầm thẻ phòng giơ lên ở quầy nhập cảnh.

**H: Vì sao 12.000 tài khoản bị chiếm dù không lộ mật khẩu?**
Vì backend nhận access token từ trình duyệt rồi gọi `/userinfo` để biết người dùng là ai. Nhưng `/userinfo` chỉ nói **chủ của token này là ai** — nó **không nói token được cấp cho ứng dụng nào**. Kẻ tấn công dựng một app vô hại, lấy access token hợp lệ của nạn nhân, rồi gửi vào backend nạn nhân. Cách chặn là kiểm **ID token** và đặc biệt là trường **`aud`** — nó phải bằng đúng `client_id` của bạn. Đúng một dòng `if`.

**H: Năm dấu kiểm của ID token là gì?**
**Chữ ký** (tải khoá công khai từ JWKS theo `kid`, và từ chối thuật toán `none`), **`iss`** (khớp chính xác từng ký tự với discovery), **`aud`** (bằng đúng `client_id` của bạn — dấu kiểm cứu mạng), **`exp`/`iat`** (còn hạn, chỉ cho lệch đồng hồ vài chục giây), và **`nonce`** (khớp chuỗi bạn sinh ở bước một). Thiếu một là cả bức tường thủng. Và lời khuyên quan trọng nhất: **đừng tự viết** — dùng thư viện đã được soi kỹ.

**H: `state` và `nonce` khác nhau ở đâu?**
`state` đi theo **trình duyệt** trong query string và quay về ở URL callback — nó chống **CSRF trên luồng đăng nhập**, trả lời câu *"cái code quay về này có đúng của phiên tôi vừa mở không"*. `nonce` được nhà cung cấp nhúng **vào trong ID token** — nó chống **phát lại**, trả lời câu *"cái token này có đúng của lần đăng nhập vừa rồi không"*. Hai thứ bảo vệ hai chỗ khác nhau, phải có cả hai.

**H: Người dùng đăng ký bằng email rồi sau đó đăng nhập bằng Google cùng email, xử lý sao?**
Không tự động gộp — đó là lỗ hổng chiếm tài khoản, vì kẻ tấn công có thể đăng ký ở một nhà cung cấp lỏng lẻo bằng email của nạn nhân. Em **gộp có xác nhận**: chỉ khi `email_verified` là true mới xét, và hiện màn hình bắt người dùng đăng nhập bằng mật khẩu cũ để chứng minh sở hữu trước khi liên kết. Trong database em khoá danh tính bằng cặp **`(iss, sub)`**, còn email chỉ là thông tin hiển thị — vì email đổi được và thậm chí có thể bị nhà cung cấp cấp lại cho người khác.

## Tóm tắt bài 5

- **OIDC = OAuth 2.0 + ID token.** OAuth trả lời *"được làm gì"*, OIDC thêm *"là ai"*.
- **Hai tấm thẻ, hai người đọc**: access token cho **API**, ID token cho **ứng dụng của bạn**. Cầm nhầm là mở toang cửa.
- `/userinfo` **không cứu được** — nó nói chủ của token là ai, không nói token cấp cho ứng dụng nào.
- **Năm dấu kiểm**: chữ ký (JWKS + từ chối `none`), `iss`, **`aud`** (cứu mạng), `exp`/`iat`, `nonce`. Thiếu một là thủng.
- Khoá tài khoản bằng **`(iss, sub)`**, không bằng email — email đổi được và có thể bị cấp lại cho người khác. Luôn kiểm **`email_verified`**.
- ID token là **một bức ảnh chụp** — dùng đúng một lần lúc đăng nhập rồi tạo phiên của riêng bạn; đừng gửi nó lên API mọi request.
- **Danh tính đến từ nhà cung cấp, quyền hạn đến từ hệ thống của bạn.**
- Gộp tài khoản phải **có xác nhận sở hữu**, không bao giờ tự động theo email.

**Bài kế tiếp** → [Phase 3, Bài 1: Load Balancer — chia đều dòng khách](../phase-3/01-load-balancer-chia-deu-dong-khach.md)
