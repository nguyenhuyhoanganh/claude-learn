# Bài 4: OAuth 2.0 — cho mượn quyền mà không đưa chìa khoá nhà

**12.000 mật khẩu Gmail bay sạch trong một đêm.**

3 giờ sáng, một startup Việt Nam nhận cuộc gọi. Database của họ vừa bị đăng lên diễn đàn — trong đó có một cột tên là `gmail_password`.

Ứng dụng của họ chỉ làm đúng một việc: **đọc email để lọc hoá đơn**. Nhưng để đọc được, nó bắt người dùng gõ thẳng mật khẩu Gmail vào form của mình.

Người dùng chỉ muốn cho phép **đọc hoá đơn**. Nhưng thứ họ trao đi là **toàn bộ tài khoản**: đọc, gửi, xoá, đổi mật khẩu — và không có cách nào rút lại.

Vậy làm sao để cho một ứng dụng quyền đọc email **mà không đưa cho nó chìa khoá cả căn nhà**?

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt | Trong ví dụ Gmail |
|---|---|---|
| **Resource Owner** | **Chủ tài nguyên** — người sở hữu dữ liệu | Bạn |
| **Client** | **Ứng dụng bên thứ ba** xin quyền | App lọc hoá đơn |
| **Authorization Server** | **Máy chủ cấp quyền** | Google |
| **Resource Server** | **Máy chủ giữ dữ liệu** | Gmail API |
| **Scope** | **Phạm vi quyền** — được làm gì, không được làm gì | `gmail.readonly` |
| **Access Token** | **Thẻ ra vào** — dùng để gọi API, đời ngắn | |
| **Refresh Token** | **Thẻ xin cấp lại** — đổi lấy access token mới, đời dài | |
| **Authorization Code** | **Mã một lần** — đổi lấy token, sống ~1 phút | |
| **Client Secret** | **Mật khẩu của ứng dụng** — chỉ nằm trên máy chủ | |
| **Redirect URI** | **Địa chỉ quay về** sau khi người dùng đồng ý | |
| **Front channel** | **Kênh trước** — đi qua trình duyệt, **ai cũng thấy** | |
| **Back channel** | **Kênh sau** — server gọi thẳng server, **không ai thấy** | |
| **PKCE** | đọc là "pixy" — cơ chế chống trộm mã một lần | |
| **Consent screen** | **Màn hình đồng ý** — nơi người dùng thấy rõ mình cho phép gì | |

## Ý tưởng cốt lõi: thẻ phòng khách sạn

```text
   ❌ CÁCH CŨ (password grant / bắt gõ mật khẩu vào app)
      Bạn đưa CHÌA KHOÁ NHÀ cho người giúp việc.
      → Họ vào được mọi phòng, mọi lúc, mãi mãi.
      → Muốn rút lại phải ĐỔI Ổ KHOÁ (đổi mật khẩu) — và mọi người khác chết theo.

   ✅ OAUTH 2.0
      Bạn đưa THẺ TỪ chỉ mở được PHÒNG KHÁCH, hết hạn sau 1 giờ.
      → Không mở được két sắt.
      → Mất thẻ thì huỷ đúng thẻ đó, chìa khoá nhà vẫn nguyên.
      → Bạn xem được danh sách ai đang giữ thẻ, huỷ từng cái một.
```

**Điểm quan trọng nhất phải nhớ:** OAuth 2.0 sinh ra để trả lời câu hỏi **"ứng dụng này được phép làm gì trên dữ liệu của bạn?"** — tức là **phân quyền (authorization)**, không phải xác thực.

Nó **không** trả lời câu *"người dùng này là ai"*. Dùng nó để đăng nhập là sai mục đích, và đó là nguyên nhân của một lỗ hổng nghiêm trọng — bài 5 sẽ mổ xẻ.

## Scope — hợp đồng giữa hai bên

```text
   scope = "https://www.googleapis.com/auth/gmail.readonly"
                                                  ▲
                          chỉ ĐỌC được thư. Không gửi. Không xoá.

   Người dùng NHÌN THẤY ĐÚNG DÒNG ĐÓ trên màn hình đồng ý trước khi bấm.
   Đó là hợp đồng ba bên: bạn — Google — ứng dụng.
```

Nguyên tắc **quyền tối thiểu**: xin đúng thứ cần, đúng lúc cần.

```python
# ❌ Xin hết mọi thứ ngay từ đầu → người dùng sợ, tỉ lệ đồng ý tụt
scope = "gmail.readonly gmail.send drive contacts calendar"

# ✅ Xin từng bước (incremental authorization)
scope = "gmail.readonly"                    # lúc đăng ký, chỉ xin thứ cần ngay
# ... khi người dùng bấm nút "Gửi báo cáo qua email" mới xin thêm:
scope = "gmail.readonly gmail.send"
```

## Kiến trúc và cách hoạt động: luồng Authorization Code

Đây là luồng chuẩn, và là thứ bạn phải vẽ được trên giấy khi phỏng vấn.

```text
   NGƯỜI DÙNG        APP (client)         GOOGLE (auth server)      GMAIL API
       │                  │                       │                     │
       │  bấm "Kết nối"   │                       │                     │
       ├─────────────────►│                       │                     │
       │                  │                       │                     │
   ┌───┴──────────────────┴───────────────────────┴─────────────────────┴───┐
   │ BƯỚC 1 — App KHÔNG hỏi gì cả. Nó ĐÁ TRÌNH DUYỆT sang thẳng Google.     │
   │                                                                        │
   │  GET https://accounts.google.com/o/oauth2/v2/auth                      │
   │      ?client_id=1234.apps.googleusercontent.com                        │
   │      &redirect_uri=https://app.vn/callback                             │
   │      &response_type=code                                               │
   │      &scope=gmail.readonly                                             │
   │      &state=xY9k...          ◄── chuỗi ngẫu nhiên, LƯU TRONG PHIÊN     │
   │      &code_challenge=E9Me... ◄── bản BĂM của code_verifier (PKCE)      │
   │      &code_challenge_method=S256                                       │
   └────────────────────────────────────────────────────────────────────────┘
       │                                          │
   ┌───┴──────────────────────────────────────────┴─────────────────────────┐
   │ BƯỚC 2 — Người dùng gõ mật khẩu, NHƯNG GÕ TRÊN TRANG CỦA GOOGLE.       │
   │                                                                        │
   │   ┌────────────────────────────────────────┐                           │
   │   │  App "Lọc hoá đơn" muốn:               │  ◄── MÀN HÌNH ĐỒNG Ý      │
   │   │    ✓ Xem thư của bạn                   │      Người dùng thấy RÕ   │
   │   │                                        │      mình cho phép gì     │
   │   │      [Từ chối]      [Cho phép]         │                           │
   │   └────────────────────────────────────────┘                           │
   │                                                                        │
   │   → Mật khẩu KHÔNG BAO GIỜ đi qua máy chủ của app.                     │
   │     App không thấy nó, không lưu nó, nên cũng KHÔNG THỂ làm lộ nó.     │
   └────────────────────────────────────────────────────────────────────────┘
       │                                          │
   ┌───┴──────────────────────────────────────────┴─────────────────────────┐
   │ BƯỚC 3 — Google KHÔNG đưa token. Nó chỉ ném về một MÃ NGẮN.            │
   │                                                                        │
   │  302 → https://app.vn/callback?code=4/0AY0e-g7...&state=xY9k...        │
   │                                    ▲                                   │
   │        Mã này: sống ~1 phút, DÙNG ĐÚNG MỘT LẦN, cầm một mình VÔ DỤNG.  │
   │        Nó đi qua TRÌNH DUYỆT — tức là qua KÊNH CÔNG KHAI.              │
   └────────────────────────────────────────────────────────────────────────┘
       │                  │                       │
   ┌───┴──────────────────┴───────────────────────┴─────────────────────────┐
   │ BƯỚC 4 — BƯỚC QUAN TRỌNG NHẤT. Backend của app gọi THẲNG sang Google.  │
   │                                                                        │
   │  POST https://oauth2.googleapis.com/token        ◄── KÊNH SAU          │
   │    grant_type=authorization_code                     trình duyệt       │
   │    &code=4/0AY0e-g7...                               KHÔNG BAO GIỜ     │
   │    &client_id=1234...                                nhìn thấy         │
   │    &client_secret=GOCSPX-...   ◄── chỉ nằm trên MÁY CHỦ                │
   │    &code_verifier=dBjftJeZ...  ◄── bản GỐC của code_challenge (PKCE)   │
   │    &redirect_uri=https://app.vn/callback                               │
   │                                                                        │
   │  ← { "access_token": "ya29...",  "expires_in": 3600,                   │
   │      "refresh_token": "1//0g...", "scope": "gmail.readonly" }          │
   └────────────────────────────────────────────────────────────────────────┘
       │                  │                                             │
       │                  │  GET /gmail/v1/messages                     │
       │                  │  Authorization: Bearer ya29...              │
       │                  ├────────────────────────────────────────────►│
       │                  │◄──────────── danh sách thư ─────────────────┤
```

### Vì sao phải vòng vèo hai bước? (câu hỏi phỏng vấn kinh điển)

```text
   Đường đi qua TRÌNH DUYỆT là đường CÔNG KHAI:
      → nằm trong lịch sử trình duyệt
      → nằm trong log của proxy và server
      → nằm trong header Referer khi trang chuyển tiếp
      → hiện trên thanh địa chỉ, lọt vào ảnh chụp màn hình

   Nên:
      MÃ MỘT LẦN đi đường công khai  → lọt ra vẫn AN TOÀN
         (sống 1 phút, dùng 1 lần, và thiếu client_secret thì vô dụng)
      TOKEN đi đường riêng (kênh sau) → không ai thấy

   Đó là TOÀN BỘ lý do có hai bước.
```

### `state` và `redirect_uri` — hai thứ đừng bao giờ làm ẩu

```python
# ① state — chống CSRF trên chính luồng đăng nhập
state = secrets.token_urlsafe(32)
session["oauth_state"] = state              # LƯU TRONG PHIÊN

# ... khi Google gọi về callback:
if request.args.get("state") != session.pop("oauth_state", None):
    raise HTTPException(400, "STATE_MISMATCH")
# → Nếu không kiểm: kẻ tấn công lừa bạn hoàn tất luồng đăng nhập
#   của TÀI KHOẢN CỦA HẮN → dữ liệu bạn tạo sau đó rơi vào tay hắn.
```

```text
② redirect_uri phải KHỚP TUYỆT ĐỐI với danh sách đã đăng ký.

   ✅ So từng ký tự với danh sách trắng
   ❌ Dùng "chứa" hay "bắt đầu bằng"
   ❌ Cho ký tự đại diện:  https://*.app.vn/callback
   ❌ Thừa hoặc thiếu một dấu gạch chéo cuối cũng là SAI

   Vì sao nghiêm khắc vậy? Nếu kẻ tấn công đăng ký được
   https://app.vn.evil.com/callback thì MÃ MỘT LẦN sẽ bay thẳng về cho hắn.
```

## PKCE — vá lỗ hổng cho ứng dụng không giấu được bí mật

Luồng trên có một giả định: **app có backend để giấu `client_secret`**. Nhưng nếu app là một trang React chạy trong trình duyệt, hay một app Android nằm trong máy người dùng thì giấu ở đâu?

**Không đâu cả.** Dịch ngược file APK là đọc được. Xem mã nguồn trang là thấy.

Tệ hơn, trên di động app quay về bằng một **đường dẫn tuỳ biến** (`myapp://callback`) — và một **app độc hại có thể đăng ký chung đường dẫn đó** rồi hứng lấy mã một lần trước khi app thật kịp nhận.

**PKCE** (*Proof Key for Code Exchange*, đọc là "pixy") vá đúng lỗ hổng đó, bằng một mẹo đơn giản đến bất ngờ:

```text
   TRƯỚC KHI ĐI:
      app tự bốc một chuỗi ngẫu nhiên   → code_verifier  (GIỮ BÍ MẬT trong máy)
      tính bản băm của nó               → code_challenge = SHA256(verifier)

   BƯỚC 1 (kênh công khai): gửi code_challenge   ← chỉ là BẢN BĂM, lộ cũng không sao
   BƯỚC 4 (đổi token):      gửi code_verifier    ← BẢN GỐC

   Google tính SHA256(verifier) rồi so với challenge đã nhận.
      Khớp   → đúng là app đã khởi đầu luồng này → cấp token
      Lệch   → từ chối

   → App độc hại cướp được MÃ nhưng KHÔNG có code_verifier
     (nó nằm trong bộ nhớ của app thật, chưa bao giờ ra khỏi máy)
     → mã đó trở nên VÔ DỤNG.
```

```javascript
// Sinh PKCE trong trình duyệt
function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
sessionStorage.setItem('pkce_verifier', verifier);

const challenge = base64url(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
);
// gửi challenge ở bước 1, gửi verifier ở bước 4
```

> **Khuyến nghị hiện hành (OAuth 2.1): dùng PKCE cho MỌI client, kể cả client có backend.** Nó rẻ, không có nhược điểm, và chặn thêm một lớp tấn công (code injection).

## Bốn luồng còn sống và hai luồng đã chết

```text
✅ ① AUTHORIZATION CODE + PKCE
      Ứng dụng có người dùng thật. MẶC ĐỊNH cho mọi trường hợp.

✅ ② CLIENT CREDENTIALS
      MÁY nói chuyện với MÁY, KHÔNG có người dùng nào cả.
      POST /token  grant_type=client_credentials
                   &client_id=...&client_secret=...&scope=orders:read
      → Dùng cho: cron job, dịch vụ nội bộ, tích hợp backend–backend.
      → LƯU Ý: token này đại diện cho ỨNG DỤNG, không phải người dùng nào.

✅ ③ DEVICE AUTHORIZATION
      Thiết bị KHÔNG CÓ BÀN PHÍM TỬ TẾ: Smart TV, máy chơi game, CLI.
      Màn hình hiện: "Vào google.com/device và nhập mã: HTPX-QRDW"
      Bạn mở điện thoại, gõ mã, bấm đồng ý.
      Thiết bị hỏi lại liên tục (polling) tới khi được duyệt.

✅ ④ REFRESH TOKEN
      Đổi lấy access token mới khi cái cũ hết hạn,
      mà không phải làm phiền người dùng lần nữa.

❌ ⑤ IMPLICIT — ĐÃ KHAI TỬ
      Ném token thẳng vào THANH ĐỊA CHỈ.
      → Token nằm trong lịch sử trình duyệt, trong log, trong Referer,
        trong ảnh chụp màn hình.
      → Thay bằng: Authorization Code + PKCE.

❌ ⑥ PASSWORD GRANT (ROPC) — ĐÃ KHAI TỬ
      Chính là cái form ở đầu video: app cầm thẳng mật khẩu của bạn
      rồi đi đổi token.
      → Nó chỉ tồn tại cho thời kỳ quá độ. Bây giờ thì ĐỪNG.
```

### Cây quyết định — ba câu hỏi

```text
① Có NGƯỜI DÙNG THẬT không?
      KHÔNG → Client Credentials. Xong.
      CÓ    → hỏi tiếp ②

② Thiết bị có GÕ ĐƯỢC không?
      KHÔNG → Device Authorization (TV, console, CLI)
      CÓ    → hỏi tiếp ③

③ Giấu được client_secret không? (có backend không?)
      CÓ    → Authorization Code + PKCE   ← vẫn nên có PKCE
      KHÔNG → Authorization Code + PKCE   ← BẮT BUỘC phải có PKCE

   → Đáp án gần như luôn là: Authorization Code + PKCE.
```

## Refresh token: xoay vòng và phát hiện trộm

```python
def lam_moi_token(refresh_token: str):
    ban_ghi = db.lay_refresh(hash_it(refresh_token))

    if ban_ghi is None:
        raise HTTPException(401, "INVALID_REFRESH")

    # ◄── PHÁT HIỆN TÁI SỬ DỤNG: token này ĐÃ được dùng rồi
    if ban_ghi.da_dung:
        # Có HAI bên đang giữ cùng một chuỗi → chắc chắn đã bị trộm
        db.huy_toan_bo_ho_token(ban_ghi.family_id)     # huỷ CẢ HỌ
        canh_bao_bao_mat(ban_ghi.user_id)
        raise HTTPException(401, "TOKEN_REUSE_DETECTED")

    db.danh_dau_da_dung(ban_ghi.id)
    return cap_cap_token_moi(ban_ghi.user_id, family_id=ban_ghi.family_id)
```

```text
Vì sao huỷ CẢ HỌ chứ không chỉ token đó?

   Vì bạn KHÔNG BIẾT ai là kẻ trộm:
      - Nạn nhân dùng token, rồi kẻ trộm dùng lại  → phát hiện
      - Kẻ trộm dùng token, rồi nạn nhân dùng lại  → cũng phát hiện
   Cả hai kịch bản đều biểu hiện y hệt nhau.
   → An toàn nhất: huỷ hết, bắt đăng nhập lại. Phiền một lần, còn hơn mất tài khoản.
```

Ba luật khác cho refresh token:

```text
① Lưu bản BĂM trong database, không lưu chuỗi thô.
② Gắn với thiết bị/IP để phát hiện dùng từ nơi lạ.
③ Có hạn tuyệt đối (absolute lifetime), ví dụ 90 ngày —
   không cho gia hạn vô tận.
```

## Tình huống thực tế và cách xử lý

> **Tình huống:** App của bạn dùng OAuth với Google. Người dùng phàn nàn: mỗi tuần lại bị bắt đăng nhập lại, dù bạn có refresh token.

**Ba nguyên nhân thường gặp và cách sửa:**

```text
① Không xin scope `offline_access` / không có `access_type=offline`
   → Google chỉ cấp refresh token khi bạn XIN RÕ.
   ✅ Thêm &access_type=offline&prompt=consent vào bước 1

② Refresh token bị Google thu hồi
   → Người dùng đổi mật khẩu, hoặc app không hoạt động 6 tháng,
     hoặc người dùng gỡ quyền trong trang bảo mật Google.
   ✅ Bắt lỗi `invalid_grant` và đưa người dùng vào luồng kết nối lại
      — đừng để họ thấy màn hình trắng.

③ Bạn lưu đè refresh token cũ bằng giá trị NULL
   → Google chỉ trả refresh token ở LẦN ĐỒNG Ý ĐẦU TIÊN.
     Các lần refresh sau không có trường đó trong phản hồi.
   ✅ Chỉ ghi đè khi phản hồi THẬT SỰ có refresh_token mới:
```

```python
resp = doi_token(...)
cap_nhat = {"access_token": resp["access_token"],
            "het_han": now() + timedelta(seconds=resp["expires_in"])}
if resp.get("refresh_token"):          # ◄── chỉ ghi đè khi CÓ
    cap_nhat["refresh_token"] = resp["refresh_token"]
db.cap_nhat(user_id, **cap_nhat)
```

> **Tình huống 2:** Đối tác báo API của bạn trả 401 ngẫu nhiên khi họ gọi nhiều luồng song song.

**Nguyên nhân:** nhiều luồng cùng phát hiện token hết hạn, cùng gọi refresh, và với **xoay vòng refresh token** thì chỉ luồng đầu tiên thành công — phần còn lại nhận `TOKEN_REUSE_DETECTED`.

```python
# ✅ Chỉ MỘT luồng được refresh, các luồng khác chờ kết quả
import threading
_khoa = threading.Lock()

def lay_access_token():
    tok = cache.get("access_token")
    if tok and not sap_het_han(tok):
        return tok
    with _khoa:                            # ◄── khoá
        tok = cache.get("access_token")    # kiểm lại (double-checked locking)
        if tok and not sap_het_han(tok):
            return tok
        tok = goi_refresh()
        cache.set("access_token", tok)
        return tok
```

Với hệ thống nhiều tiến trình, dùng **khoá phân tán** (Redis `SET NX EX`) thay cho khoá cục bộ.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng password grant | Cầm mật khẩu người dùng — đúng thảm hoạ đầu bài | Authorization Code + PKCE |
| Dùng implicit flow | Token nằm trong lịch sử trình duyệt và log | Đã khai tử — dùng code + PKCE |
| Không kiểm `state` | CSRF trên luồng đăng nhập, chiếm tài khoản | Sinh ngẫu nhiên, lưu phiên, so lúc quay về |
| `redirect_uri` dùng ký tự đại diện | Mã một lần bay về cho kẻ tấn công | So khớp tuyệt đối từng ký tự |
| Không dùng PKCE cho SPA/mobile | App độc hại cướp được mã | PKCE bắt buộc (nên dùng cho mọi client) |
| `client_secret` trong app mobile/SPA | Dịch ngược là đọc được | Không có secret; dựa vào PKCE |
| Xin quá nhiều scope | Người dùng sợ, tỉ lệ đồng ý tụt | Xin từng bước, quyền tối thiểu |
| Lưu refresh token dạng thô | Rò database = chiếm mọi tài khoản | Lưu bản băm |
| Refresh token không xoay vòng | Trộm được là dùng mãi | Xoay vòng + phát hiện tái sử dụng |
| Ghi đè refresh token bằng `NULL` | Mất kết nối sau lần refresh đầu | Chỉ ghi đè khi phản hồi có trường đó |
| Nhiều luồng cùng refresh | 401 ngẫu nhiên | Khoá (cục bộ hoặc phân tán) |
| Dùng access token để biết "người dùng là ai" | **Lỗ hổng nghiêm trọng** | Đó là việc của OIDC — bài 5 |

## Câu hỏi phỏng vấn hay gặp

**H: OAuth 2.0 giải quyết vấn đề gì?**
Nó cho phép **uỷ quyền có giới hạn** — cho một ứng dụng làm đúng một việc trên dữ liệu của bạn, mà không phải đưa mật khẩu. Ẩn dụ: thay vì đưa chìa khoá nhà, bạn đưa thẻ từ chỉ mở được phòng khách và hết hạn sau một giờ; mất thẻ thì huỷ đúng thẻ đó, chìa khoá nhà vẫn nguyên. Điểm quan trọng: OAuth trả lời câu **"ứng dụng này được làm gì"** — nó **không** trả lời câu "người dùng là ai".

**H: Vì sao Authorization Code phải qua hai bước, không cấp token luôn?**
Vì đường đi qua trình duyệt là **đường công khai** — nó nằm trong lịch sử, trong log proxy, trong header `Referer`, trong ảnh chụp màn hình. Nên OAuth cho **mã một lần** đi đường công khai (sống một phút, dùng một lần, và thiếu `client_secret` thì vô dụng), còn **token** đi đường riêng qua kênh sau mà trình duyệt không bao giờ thấy. Đó là toàn bộ lý do có hai bước.

**H: PKCE là gì và vá lỗ hổng nào?**
Ứng dụng không có backend — SPA hoặc app mobile — **không giấu được `client_secret`**, và trên di động một app độc hại có thể đăng ký chung đường dẫn quay về rồi cướp mã một lần. PKCE vá bằng cách: app tự sinh một chuỗi ngẫu nhiên `code_verifier`, gửi **bản băm** của nó ở bước công khai, và gửi **bản gốc** ở bước đổi token. App độc hại cướp được mã nhưng không có `code_verifier` — vốn chưa bao giờ rời khỏi bộ nhớ app thật — nên mã đó vô dụng. OAuth 2.1 khuyến nghị dùng PKCE cho **mọi** client.

**H: Chọn luồng nào?**
Ba câu hỏi. Có người dùng thật không — không thì **Client Credentials**. Thiết bị gõ được không — không thì **Device Authorization**. Còn lại đều là **Authorization Code + PKCE**. Hai luồng đã chết là **Implicit** (ném token vào thanh địa chỉ) và **Password Grant** (app cầm thẳng mật khẩu).

**H: Refresh token bị trộm thì sao?**
Đó là lý do phải **xoay vòng**: mỗi lần dùng thì cấp cái mới và huỷ cái cũ. Nếu một refresh token cũ được dùng lại, nghĩa là có hai bên đang giữ cùng một chuỗi — chắc chắn đã bị trộm. Lúc đó **huỷ toàn bộ họ token** của người dùng đó chứ không chỉ token này, vì bạn không biết bên nào là kẻ trộm: cả hai kịch bản đều biểu hiện y hệt nhau. Phiền người dùng đăng nhập lại một lần, còn hơn mất tài khoản.

## Tóm tắt bài 4

- OAuth 2.0 = **uỷ quyền có giới hạn**: thẻ phòng khách sạn thay cho chìa khoá nhà. Nó trả lời *"app được làm gì"*, **không** trả lời *"người dùng là ai"*.
- **Scope** là hợp đồng ba bên mà người dùng nhìn thấy trên màn hình đồng ý — xin **quyền tối thiểu**, xin **từng bước**.
- Hai bước tồn tại vì: **mã một lần** đi kênh công khai (lộ vẫn an toàn), **token** đi kênh sau (không ai thấy).
- **`state`** chống CSRF trên luồng đăng nhập; **`redirect_uri`** phải khớp tuyệt đối, cấm ký tự đại diện.
- **PKCE** cho app không giấu được bí mật: gửi **bản băm** ở kênh công khai, gửi **bản gốc** ở kênh sau. Nên dùng cho **mọi** client.
- Bốn luồng sống: **Code+PKCE** (mặc định), **Client Credentials** (máy–máy), **Device** (TV/CLI), **Refresh**. Hai luồng đã chết: **Implicit** và **Password Grant**.
- Refresh token: **lưu bản băm**, **xoay vòng**, **phát hiện tái sử dụng → huỷ cả họ**, và có **hạn tuyệt đối**.

**Bài kế tiếp** → [Bài 5: OpenID Connect — tấm hộ chiếu và năm dấu kiểm](05-openid-connect-nam-dau-kiem.md)
