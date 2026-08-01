# Bài 3: Basic Auth, API Key và mTLS — xác thực giữa hai cỗ máy

2 giờ 14 phút sáng. Một kỹ sư trực đêm mở file log của hệ thống thanh toán, chỉ để tìm một lỗi timeout bình thường. Anh cuộn xuống, cuộn tiếp, rồi bàn tay dừng lại.

Trên màn hình là **12.000 dòng log**, dòng nào cũng lặp lại đúng một header giống hệt nhau:

```text
Authorization: Basic YWRtaW46U3VwZXJTM2NyZXQhMjM=
```

Anh copy một chuỗi bất kỳ, dán vào lệnh giải mã. Một giây sau, màn hình hiện ra **tên đăng nhập và mật khẩu của tài khoản quản trị, viết rõ ràng bằng chữ thường**.

Không ai tấn công gì cả. **Mật khẩu tự nó nằm sẵn ở đó**, 12.000 lần.

Bài này nói về ba cơ chế xác thực **giữa máy với máy** — nơi không có con người ngồi gõ mật khẩu, và nơi những sai lầm im lặng nhất xảy ra.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **Basic Authentication** | Xác thực cơ bản — gửi `tên:mật khẩu` mã Base64 trong header |
| **Base64** | Cách **biểu diễn** dữ liệu bằng 64 ký tự an toàn — **không phải mã hoá** |
| **API Key** | **Khoá API** — chuỗi bí mật dài, đại diện cho một ứng dụng |
| **TLS** (*Transport Layer Security*) | Lớp mã hoá đường truyền; HTTPS = HTTP + TLS |
| **mTLS** (*mutual TLS*) | **TLS hai chiều** — cả hai bên đều trình chứng thư |
| **Certificate** | **Chứng thư số** — giấy tờ điện tử chứng minh danh tính, có chữ ký của CA |
| **CA** (*Certificate Authority*) | **Cơ quan cấp chứng thư** — bên thứ ba mà cả hai đều tin |
| **Private key** | **Khoá riêng** — phần bí mật, không bao giờ rời khỏi máy |
| **Realm** | **Vùng bảo vệ** — cái nhãn server đặt cho khu vực cần xác thực |
| **Timing attack** | **Tấn công thời gian** — dò bí mật qua chênh lệch thời gian phản hồi |
| **Secret rotation** | **Xoay vòng bí mật** — thay khoá định kỳ |

## Hai kiểu bằng chứng

```text
① THỨ BẠN ĐANG GIỮ (bearer — "người cầm là chủ")
   Mật khẩu, API key, token.
   → Ai cầm được là dùng được. Không cần chứng minh gì thêm.
   → Giống VÉ XEM PHIM: nhặt được vé là vào rạp được.

② THỨ BẠN CHỨNG MINH ĐƯỢC MÀ KHÔNG PHẢI ĐƯA RA (proof of possession)
   Chứng thư số + khoá riêng.
   → Bạn KÝ một thử thách bằng khoá riêng. Khoá KHÔNG BAO GIỜ rời máy.
   → Giống CHỮ KÝ TAY: người khác thấy chữ ký nhưng không ký giả được.
```

Toàn bộ khác biệt giữa API Key và mTLS nằm ở đúng hai dòng đó.

## Basic Authentication — đơn giản tới mức thô

Nó có từ thời HTTP 1.0, chuẩn hiện hành là RFC 7617.

```text
CÔNG THỨC — gọn tới mức không có bước nào ở giữa:

   "admin" + ":" + "SuperS3cret!23"
        ▼
   "admin:SuperS3cret!23"
        ▼  Base64
   "YWRtaW46U3VwZXJTM2NyZXQhMjM="
        ▼
   Authorization: Basic YWRtaW46U3VwZXJTM2NyZXQhMjM=

   XONG. Đó là toàn bộ giao thức.
   Không có phiên đăng nhập. Không có cookie. Không có gì khác.
```

### Kiến trúc và cách hoạt động

```text
LẦN ĐẦU — client chưa mang gì

   Client ──── GET /api/du-lieu ────────────────► Server
          ◄─── 401 Unauthorized ────────────────
               WWW-Authenticate: Basic realm="API"
                                        ▲
               Lời mời lịch sự: "tôi chấp nhận kiểu Basic,
               vùng cần bảo vệ tên là API"
               (realm chỉ là cái NHÃN, nó không bảo vệ gì cả)

   Nếu mở bằng trình duyệt → hộp thoại xám xấu xí bật lên,
   hộp thoại mà không ai thiết kế được và không ai đổi được.

LẦN HAI — client mang header

   Client ──── GET /api/du-lieu ────────────────► Server
               Authorization: Basic YWRtaW46...      ① tách chuỗi
          ◄─── 200 OK ──────────────────────────    ② so mật khẩu
                                                     ③ trả kết quả

TỪ LẦN BA TRỞ ĐI — "gửi trước" (preemptive)
   Client tự gắn sẵn header ngay từ lần gọi đầu, khỏi chờ bị hỏi.
   Tiết kiệm một vòng mạng.
```

**Và đây là chỗ đáng nhớ nhất:**

> Mật khẩu của bạn **không đi qua mạng một lần** — nó đi qua mạng ở **mọi lần**, mãi mãi, cho tới khi bạn đổi mật khẩu. 1.000 request là 1.000 lần mật khẩu bay qua dây.

### Hiểu lầm đắt tiền nhất: Base64 không phải mã hoá

```bash
echo 'YWRtaW46U3VwZXJTM2NyZXQhMjM=' | base64 -d
# admin:SuperS3cret!23
```

Một dòng lệnh. Không cần công cụ đặc biệt. Không cần kỹ năng gì. Trình duyệt của bạn cũng làm được.

```text
   MÃ HOÁ cần một CHIẾC CHÌA. Không có chìa thì không mở được.
   BASE64 KHÔNG CÓ CHÌA NÀO HẾT. Ai cũng mở được, không cần xin phép ai.
   Nó chỉ đổi ký tự sang một bảng khác cho an toàn đường truyền.

   Base64 là CÁI PHONG BÌ TRONG SUỐT.
   Nó giúp thư đi đúng đường, nhưng ai cầm cũng đọc được nội dung.
```

Từ đó suy ra một luật **không có ngoại lệ**:

> **Basic Authentication chạy trên HTTP thường = dán mật khẩu lên bưu thiếp.** Ai đứng giữa đường cũng đọc được.

Nhưng — và đây là phần ít ai nói — **TLS chỉ bảo vệ đường đi, nó không bảo vệ hai đầu**:

```text
Header vẫn hiện NGUYÊN VĂN ở:
   □ Log của reverse proxy (nginx, HAProxy)
   □ Log của load balancer
   □ Công cụ giám sát (APM, tracing)
   □ Lịch sử shell nếu ai đó chạy curl
   □ Bộ nhớ và lịch sử trình duyệt

   ▲ Và đó chính xác là cái file log lúc 2 giờ sáng.
```

### Sáu luật khi buộc phải dùng Basic Auth

```text
① TLS LÀ BẮT BUỘC. Không có chế độ thử nghiệm, không có ngoại lệ.

② CHẶN HEADER Authorization KHỎI MỌI NƠI GHI LOG
   → proxy, load balancer, APM, tracing. Đây là luật cứu file log 2h sáng.

③ SERVER TUYỆT ĐỐI KHÔNG LƯU MẬT KHẨU THÔ
   → lưu bản băm bằng bcrypt/Argon2id, muối riêng từng tài khoản.

④ SO SÁNH PHẢI HẰNG THỜI GIAN
   → so bằng `==` thường sẽ dừng ở ký tự sai đầu tiên,
     và thời gian phản hồi rò rỉ manh mối. Chênh vài micro giây, nhưng đủ.

⑤ GIỚI HẠN SỐ LẦN THỬ
   → Basic không có MFA, không có CAPTCHA, không có gì cả.
     Chặn theo IP và theo tài khoản, khoá dần sau vài lần sai.

⑥ ĐỪNG NHÉT MẬT KHẨU CỦA CON NGƯỜI VÀO ĐÓ
   → sinh một chuỗi ngẫu nhiên thật dài, coi nó như chiếc chìa
     dùng riêng cho MỘT MÁY. Mất chìa thì thu hồi chìa đó thôi.
```

```python
# ④ So sánh hằng thời gian
import hmac, base64
from argon2 import PasswordHasher

ph = PasswordHasher()

def kiem_basic(header: str) -> str | None:
    if not header.startswith("Basic "):
        return None
    try:
        user, _, pwd = base64.b64decode(header[6:]).decode().partition(":")
    except Exception:
        return None

    ban_ghi = db.lay_client(user)
    if not ban_ghi:
        ph.hash("dummy")            # tốn cùng thời gian → không lộ user tồn tại hay không
        return None
    try:
        ph.verify(ban_ghi.hash, pwd)   # thư viện đã lo hằng thời gian
        return user
    except Exception:
        return None
```

Sáu luật này **không biến Basic thành an toàn** — chúng chỉ hạ thiệt hại xuống mức chấp nhận được khi bạn thật sự không còn lựa chọn nào khác. **Đó là một sự thoả hiệp, không phải một chiến thắng.**

### Cái giá cấu trúc của Basic Auth

```text
✗ KHÔNG CÓ NÚT ĐĂNG XUẤT — không có phiên thì không có gì để huỷ.
  Trình duyệt cứ thế nhớ mãi. Muốn thoát phải đóng hẳn trình duyệt.

✗ KHÔNG THU HỒI ĐƯỢC TỪNG THIẾT BỊ — muốn cắt một máy thì phải đổi
  mật khẩu, và MỌI máy khác chết theo.

✗ KHÔNG CÓ PHẠM VI QUYỀN HẠN — có chìa là có TẤT CẢ.

✗ VÀ ĐÂY LÀ NGHỊCH LÝ ĐẸP NHẤT:
  bạn băm mật khẩu càng chậm để chống dò (bcrypt cost 12 ≈ 0,2 giây),
  thì mỗi request lại càng tốn CPU — mà Basic thì BĂM Ở MỌI REQUEST.
  → Cách làm an toàn hơn lại tự bóp cổ chính API của bạn.
```

Đó là lý do **Basic chỉ nên sống giữa hai cái máy, không phải giữa người và máy** — và nếu là giữa hai máy thì nên cache kết quả xác thực trong vài giây.

## API Key — tấm thẻ ra vào

```text
   sk_live_51HxYzABC...    ← chuỗi ngẫu nhiên dài, đại diện cho MỘT ứng dụng

   Gửi ở đâu:
   ✅ Authorization: Bearer sk_live_...     ← chuẩn, không lọt vào log URL
   ✅ X-API-Key: sk_live_...                ← cũng ổn
   ❌ GET /api/data?api_key=sk_live_...     ← THẢM HOẠ: nằm trong log truy cập,
                                               trong lịch sử trình duyệt, trong Referer
```

### Tình huống thực tế và cách xử lý

> **Tình huống:** Một API nội bộ bị gọi **4 triệu lượt trong 4 tiếng**. Không ai phá gì cả — kẻ lạ chỉ đang cầm đúng chìa khoá của công ty. Chìa đó nằm trong một dòng cấu hình mà một bạn đẩy nhầm lên kho mã nguồn công khai, **320 ngày trước**. Không có cảnh báo nào. Hoá đơn hạ tầng tháng đó nhảy lên 3 tỷ đồng.

Ba câu hỏi cần trả lời được, và mỗi câu là một lớp phòng thủ:

**① Vì sao 320 ngày mà không ai biết?** Vì không có **giám sát bất thường**.

```python
# Cảnh báo khi một khoá dùng vượt xa mức bình thường của chính nó
def kiem_bat_thuong(key_id):
    hien_tai  = redis.get(f"rate:1h:{key_id}") or 0
    trung_binh = redis.get(f"baseline:{key_id}") or 1
    if int(hien_tai) > int(trung_binh) * 10:
        canh_bao(f"Khoá {key_id} dùng gấp 10 lần bình thường")
```

Cộng thêm: cảnh báo khi khoá được gọi từ **quốc gia lạ**, từ **IP chưa từng thấy**, hoặc **ngoài giờ hoạt động thường lệ**.

**② Vì sao khoá lọt lên GitHub?** Vì không có **quét bí mật**.

```bash
# Chặn ngay tại máy dev, trước khi commit
brew install gitleaks
gitleaks protect --staged        # đặt vào pre-commit hook

# Quét toàn bộ lịch sử repo (bí mật cũ vẫn nằm trong commit cũ!)
gitleaks detect --source . --log-opts="--all"
```

Và **bật secret scanning** của GitHub/GitLab — chúng còn tự báo cho nhà cung cấp (Stripe, AWS) để thu hồi khoá giúp bạn.

**③ Vì sao một khoá làm được nhiều thế?** Vì không có **phạm vi** và **hạn mức**.

```sql
CREATE TABLE api_keys (
    key_id      BIGSERIAL PRIMARY KEY,
    key_hash    TEXT      NOT NULL UNIQUE,   -- ◄── LƯU BẢN BĂM, không lưu khoá thô
    key_prefix  TEXT      NOT NULL,          -- "sk_live_51Hx" để hiển thị và tra cứu
    tenant_id   BIGINT    NOT NULL,
    scopes      TEXT[]    NOT NULL,          -- ['orders:read'] — quyền tối thiểu
    rate_limit  INT       NOT NULL DEFAULT 1000,
    ip_allowlist INET[],                     -- chỉ cho gọi từ IP này
    het_han     TIMESTAMPTZ,                 -- ◄── LUÔN có hạn
    thu_hoi_luc TIMESTAMPTZ,
    lan_dung_cuoi TIMESTAMPTZ,               -- để phát hiện khoá bỏ quên
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON api_keys (key_prefix);
```

```python
import secrets, hashlib

def tao_khoa(tenant_id, scopes, so_ngay=90):
    raw = "sk_live_" + secrets.token_urlsafe(32)
    db.insert(
        key_hash=hashlib.sha256(raw.encode()).hexdigest(),  # chỉ lưu bản băm
        key_prefix=raw[:16],
        tenant_id=tenant_id, scopes=scopes,
        het_han=now() + timedelta(days=so_ngay),
    )
    return raw          # ◄── HIỂN THỊ ĐÚNG MỘT LẦN, không bao giờ hiện lại
```

> **Vì sao API key băm bằng SHA-256 được, trong khi mật khẩu người dùng thì không?** Vì khoá là chuỗi **ngẫu nhiên 256 bit** — không thể dò cạn, không có "khoá phổ biến" như `123456`. Mật khẩu người dùng có entropy thấp nên cần hàm cố tình chậm. Đây là chi tiết ghi điểm khi phỏng vấn.

### Xoay vòng khoá không downtime

```text
Không thể "đổi khoá lúc 0h" — đối tác không đổi kịp.

   Ngày 0:  cấp khoá MỚI, cả CŨ và MỚI cùng sống
   Ngày 0:  thông báo, gửi khoá mới cho đối tác
   Ngày 30: xem `lan_dung_cuoi` của khoá cũ
            → còn dùng thì nhắc lại; về 0 thì sang bước sau
   Ngày 60: thu hồi khoá cũ

   → Luôn hỗ trợ NHIỀU khoá cùng hiệu lực cho một tenant.
     Đây là điều kiện tiên quyết để xoay vòng được.
```

## mTLS — cả hai bên cùng trình căn cước

TLS thường chỉ **một chiều**: bạn kiểm tra server có đúng là `shop.vn` không, còn server không biết bạn là ai.

**mTLS** làm cả hai chiều.

```text
   BẮT TAY TLS THƯỜNG                 BẮT TAY mTLS
   ─────────────────────              ─────────────────────
   Client → "chào"                    Client → "chào"
   Server → chứng thư của tôi         Server → chứng thư của tôi
   Client → kiểm bằng CA đã tin       Client → kiểm bằng CA đã tin
            ✓                                  ✓
                                      Server → "cho tôi xem chứng thư của bạn"
   (server KHÔNG biết client là ai)   Client → chứng thư của tôi
                                      Client → KÝ một thử thách bằng KHOÁ RIÊNG
                                      Server → kiểm chữ ký + kiểm CA
                                               ✓ giờ CẢ HAI đều biết nhau
```

Điểm mấu chốt: **khoá riêng không bao giờ rời khỏi máy**. Client chứng minh mình sở hữu nó bằng cách **ký**, chứ không phải bằng cách gửi nó đi. Đây là khác biệt căn bản so với API key — nghe lén đường truyền không giúp gì cho kẻ tấn công.

```nginx
# nginx làm mTLS
server {
    listen 443 ssl;
    ssl_certificate         /etc/ssl/server.crt;
    ssl_certificate_key     /etc/ssl/server.key;

    ssl_client_certificate  /etc/ssl/ca.crt;   # CA nội bộ cấp chứng thư cho client
    ssl_verify_client       on;                # ◄── BẮT BUỘC client trình chứng thư
    ssl_verify_depth        2;

    location / {
        proxy_set_header X-Client-DN $ssl_client_s_dn;   # danh tính đã xác minh
        proxy_pass http://backend;
    }
}
```

### Cái giá của mTLS — và cú đau lúc 3 giờ sáng

```text
✗ Vận hành phức tạp: phải tự dựng CA nội bộ, cấp/phân phối chứng thư
✗ Trình duyệt hỗ trợ rất tệ (hộp thoại chọn chứng thư xấu và khó hiểu)
✗ Khó dùng qua CDN/proxy (kết nối TLS bị kết thúc ở lớp đó)

✗ VÀ ĐÂY LÀ CÚ ĐAU RẤT HAY XẢY RA:
     Một tấm chứng thư một năm HẾT HẠN lúc 3 giờ sáng
     → mọi dịch vụ bên trong ngừng nói chuyện với nhau CÙNG MỘT LÚC.
     → Vì chúng được cấp cùng ngày, nên chúng cũng hết hạn cùng ngày.

  Cách phòng:
     • Chứng thư đời NGẮN (24h–90 ngày) + tự động gia hạn
       (cert-manager, SPIFFE/SPIRE, Vault PKI)
     • Cảnh báo trước hạn 30 ngày
     • LỆCH ngày hết hạn giữa các dịch vụ
```

Trong hệ sinh thái Kubernetes, **service mesh** (Istio, Linkerd) làm mTLS tự động giữa mọi pod — bạn không phải viết dòng nào, và chứng thư được xoay vòng mỗi 24 giờ.

## Bảng so sánh

| | Basic Auth | API Key | mTLS |
|---|---|---|---|
| Loại bằng chứng | Người cầm là chủ | Người cầm là chủ | **Chứng minh sở hữu** |
| Bí mật đi qua mạng | **Mỗi request** | Mỗi request | **Không bao giờ** |
| Nghe lén được? | Nếu không TLS thì có | Nếu không TLS thì có | ✅ Không |
| Chống giả mạo server | ❌ | ❌ | ✅ **Có** |
| Phạm vi quyền (scope) | ❌ Có là có tất cả | ✅ Có | ⚠️ Qua trường trong chứng thư |
| Thu hồi từng client | ❌ | ✅ Xoá một dòng | ⚠️ Cần CRL/OCSP |
| Độ phức tạp vận hành | Rất thấp | Thấp | **Cao** |
| Trình duyệt dùng được | ⚠️ Hộp thoại xấu | ✅ | ❌ |
| Chi phí CPU mỗi request | **Cao** (băm mật khẩu) | Thấp | Thấp (sau bắt tay) |
| Dùng cho | Hệ cũ, công cụ nội bộ | **API đối tác** (mặc định) | Dịch vụ nội bộ, ngân hàng, y tế |

## Cây quyết định

```text
Ai gọi API của bạn?
   │
   ├─ CON NGƯỜI qua trình duyệt
   │     └──► Session hoặc OIDC (bài 2, bài 5). KHÔNG dùng Basic/API key.
   │
   ├─ ỨNG DỤNG CỦA ĐỐI TÁC / KHÁCH HÀNG
   │     └──► API KEY (mặc định)
   │          + băm khi lưu + scope + hạn dùng + rate limit + IP allowlist
   │          + giám sát bất thường + quy trình xoay vòng
   │
   ├─ DỊCH VỤ NỘI BỘ trong cùng cụm
   │     └──► mTLS (lý tưởng qua service mesh) hoặc token nội bộ đời rất ngắn
   │
   ├─ ĐỐI TÁC YÊU CẦU TIÊU CHUẨN CAO (ngân hàng, bảo hiểm, y tế)
   │     └──► mTLS — thường là yêu cầu bắt buộc trong hợp đồng
   │
   └─ HỆ THỐNG CŨ CHỈ HỖ TRỢ BASIC
         └──► Basic + TLS + 6 luật ở trên + coi đó là NỢ KỸ THUẬT có kế hoạch trả
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tưởng Base64 là mã hoá | Mật khẩu nằm công khai trong log | Nhớ: phong bì trong suốt |
| Log header `Authorization` | 12.000 mật khẩu trong file log | Chặn ở proxy, LB, APM |
| Basic Auth trên HTTP thường | Ai đứng giữa cũng đọc được | TLS bắt buộc |
| Lưu API key dạng thô trong DB | Rò database = rò mọi khoá | Lưu bản băm SHA-256 |
| API key trong query string | Nằm trong access log, Referer, lịch sử | Header `Authorization` |
| API key không có hạn dùng | Khoá 320 ngày trước vẫn dùng được | Luôn có `het_han` |
| API key không có scope | Một khoá làm được mọi thứ | Quyền tối thiểu |
| Không giám sát bất thường | 4 triệu lượt gọi mà không ai biết | Cảnh báo theo mức bình thường của chính khoá |
| Không quét bí mật trong repo | Khoá lọt lên GitHub | `gitleaks` + secret scanning |
| Chỉ hỗ trợ một khoá mỗi tenant | Không xoay vòng được | Cho nhiều khoá cùng sống |
| So sánh bí mật bằng `==` | Tấn công thời gian | `hmac.compare_digest` |
| Chứng thư mTLS cấp cùng ngày | Hết hạn đồng loạt lúc 3h sáng | Đời ngắn + tự gia hạn + lệch ngày |
| Coi xác thực là cả ngôi nhà | Vẫn IDOR, vẫn rò dữ liệu | Xác thực chỉ là **cánh cửa** |

## Câu hỏi phỏng vấn hay gặp

**H: Base64 trong Basic Auth có phải mã hoá không?**
Không. Đây là hiểu lầm đắt tiền nhất về nó. Mã hoá cần một chiếc chìa, không có chìa thì không mở được. Base64 **không có chìa nào cả** — nó chỉ đổi ký tự sang bảng khác cho an toàn đường truyền, và một dòng lệnh `base64 -d` là ra mật khẩu thô. Nó là **cái phong bì trong suốt**: giúp thư đi đúng đường, nhưng ai cầm cũng đọc được.

**H: Basic Auth có dùng được không?**
Được, nhưng chỉ **giữa hai cái máy**, không phải giữa người và máy, và phải kèm sáu luật: TLS bắt buộc, **chặn header `Authorization` khỏi mọi nơi ghi log**, server lưu bản băm chứ không lưu mật khẩu thô, so sánh hằng thời gian, giới hạn số lần thử, và dùng chuỗi ngẫu nhiên dài thay vì mật khẩu của người. Sáu luật đó không biến nó thành an toàn — chúng chỉ hạ thiệt hại xuống mức chấp nhận được. Đó là **một sự thoả hiệp, không phải một chiến thắng**.

**H: Vì sao Basic Auth tốn CPU?**
Vì nó **băm mật khẩu ở mọi request** — không có phiên nào để nhớ. Và đây là nghịch lý: bạn băm càng chậm để chống dò (bcrypt cost 12 ≈ 0,2 giây) thì mỗi request lại càng tốn CPU. Cách làm an toàn hơn tự bóp cổ chính API của bạn. Với giao tiếp máy–máy, cách giảm là cache kết quả xác thực trong vài giây.

**H: API key lưu thế nào cho đúng?**
Lưu **bản băm SHA-256**, không lưu khoá thô — rò database thì kẻ trộm vẫn không dùng được. Kèm `key_prefix` để hiển thị và tra cứu. Khoá thô chỉ hiện **đúng một lần** lúc tạo. Và SHA-256 là đủ ở đây, khác với mật khẩu người dùng — vì khoá là chuỗi ngẫu nhiên 256 bit nên không dò cạn được, còn mật khẩu người dùng có entropy thấp nên mới cần hàm cố tình chậm.

**H: mTLS khác API key ở điểm căn bản nào?**
API key là **thứ bạn đang giữ** — ai cầm được là dùng được, và nó đi qua mạng ở mỗi request. mTLS là **thứ bạn chứng minh được mà không phải đưa ra** — khoá riêng không bao giờ rời khỏi máy, client chứng minh sở hữu bằng cách **ký một thử thách**. Nghe lén đường truyền không giúp gì cho kẻ tấn công. Đổi lại là chi phí vận hành: phải dựng CA, phân phối chứng thư, và cú đau kinh điển là chứng thư một năm hết hạn lúc 3 giờ sáng làm mọi dịch vụ ngừng nói chuyện cùng lúc — nên phải dùng chứng thư đời ngắn có tự động gia hạn.

## Tóm tắt bài 3

- Hai kiểu bằng chứng: **thứ bạn đang giữ** (mật khẩu, API key — ai cầm là dùng được) và **thứ bạn chứng minh được mà không đưa ra** (chứng thư + khoá riêng).
- **Base64 không phải mã hoá** — nó là phong bì trong suốt. Basic Auth gửi mật khẩu ở **mọi** request, và TLS chỉ bảo vệ đường đi chứ **không bảo vệ hai đầu**.
- Luật cứu file log lúc 2 giờ sáng: **chặn header `Authorization` khỏi mọi nơi ghi log**.
- API key: **lưu bản băm**, có **scope**, có **hạn dùng**, có **rate limit**, có **IP allowlist**, và cho **nhiều khoá cùng sống** để xoay vòng được.
- Bốn triệu lượt gọi trong 320 ngày mà không ai biết = thiếu **giám sát bất thường** + thiếu **quét bí mật trong repo**.
- **mTLS** là cơ chế mạnh nhất vì khoá riêng không rời máy — cái giá là vận hành, và bẫy chết người là **chứng thư hết hạn đồng loạt**.
- Xác thực chỉ là **cánh cửa**. Sau cánh cửa vẫn phải có phân quyền, hạn mức, nhật ký, và thời hạn ngắn cho mọi thứ.

**Bài kế tiếp** → [Bài 4: OAuth 2.0 — cho mượn quyền mà không đưa chìa khoá nhà](04-oauth-2-cho-muon-quyen-khong-dua-chia-khoa.md)
