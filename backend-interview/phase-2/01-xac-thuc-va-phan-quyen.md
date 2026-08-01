# Bài 1: Xác thực và phân quyền — hai câu hỏi khác nhau

Bạn vừa đổi mật khẩu và đăng xuất khỏi mọi thiết bị. Nhưng ngay lúc này, hacker **vẫn ung dung ở trong tài khoản** như chưa hề có gì xảy ra.

Sao lại vô lý vậy? Đổi mật khẩu đáng lẽ phải cắt đứt mọi kẻ xâm nhập chứ?

Vấn đề không nằm ở mật khẩu. Kẻ tấn công đã trộm được **tấm vé thông hành** của bạn — cái token. Và token đó vẫn còn hiệu lực, **bất kể bạn làm gì với mật khẩu**.

Tấm vé đó là trái tim của xác thực và phân quyền. Hiểu nó, bạn hiểu tại sao web hoạt động — và tại sao nó bị hack.

## Hai câu hỏi, đừng bao giờ trộn lẫn

```text
   ┌─────────────────────── KHÁCH SẠN ────────────────────────┐
   │                                                          │
   │  QUẦY LỄ TÂN                          CỬA PHÒNG          │
   │  Bạn đưa CHỨNG MINH THƯ               Bạn quẹt THẺ TỪ    │
   │  → chứng minh mình LÀ AI              → thẻ mở được      │
   │                                          phòng CỦA BẠN   │
   │  XÁC THỰC                                nhưng không mở  │
   │  (Authentication)                        được phòng khác │
   │  "Bạn LÀ AI?"                            hay kho bạc     │
   │                                                          │
   │                                       PHÂN QUYỀN         │
   │                                       (Authorization)    │
   │                                       "Bạn ĐƯỢC LÀM GÌ?" │
   └──────────────────────────────────────────────────────────┘

   XÁC THỰC LUÔN ĐẾN TRƯỚC. PHÂN QUYỀN THEO SAU.
```

| | Xác thực (Authentication) | Phân quyền (Authorization) |
|---|---|---|
| Trả lời câu | **Bạn là ai?** | **Bạn được làm gì?** |
| Viết tắt | AuthN | AuthZ |
| Xảy ra khi | Đăng nhập, mỗi request | Mỗi lần chạm vào tài nguyên |
| Mã lỗi HTTP | **401** Unauthorized | **403** Forbidden |
| Bằng chứng | Mật khẩu, token, vân tay, chứng thư | Vai trò, quyền, quyền sở hữu |
| Thất bại nghĩa là | "Tôi không biết bạn" | "Tôi biết bạn, nhưng không cho" |

**Rất nhiều lỗ hổng bảo mật sinh ra vì lập trình viên nhầm hai khái niệm này** — xác thực đúng người, nhưng cho phép sai việc.

## Lỗ hổng phổ biến nhất: IDOR

**IDOR** (*Insecure Direct Object Reference* — tham chiếu đối tượng trực tiếp không an toàn) nằm trong nhóm rủi ro số 1 của OWASP Top 10, và nó đơn giản đến mức đáng sợ.

```text
Bạn đăng nhập ĐÚNG tài khoản của mình.
Bạn mở /don-hang/1042  → thấy đơn của bạn. Bình thường.
Bạn đổi thành /don-hang/1043 → thấy đơn của NGƯỜI LẠ.
   → kèm họ tên, số điện thoại, địa chỉ giao hàng.

Xác thực: ĐÚNG. Phân quyền: KHÔNG CÓ.
```

```python
# ❌ SAI — chỉ kiểm đăng nhập
@app.get("/don-hang/{order_id}")
def xem_don(order_id: int, user = Depends(dang_nhap)):
    return db.query("SELECT * FROM orders WHERE order_id = %s", order_id)

# ✅ ĐÚNG — quyền sở hữu nằm NGAY TRONG điều kiện WHERE
@app.get("/don-hang/{order_id}")
def xem_don(order_id: int, user = Depends(dang_nhap)):
    don = db.query(
        "SELECT * FROM orders WHERE order_id = %s AND customer_id = %s",
        order_id, user.id
    )
    if not don:
        raise HTTPException(404)      # 404, KHÔNG phải 403
    return don
```

Hai chi tiết quan trọng:

**① Đưa quyền sở hữu vào `WHERE`, đừng kiểm sau khi lấy.**

```python
# ❌ Vẫn sai kiểu khác — lấy ra rồi mới kiểm
don = db.query("SELECT * FROM orders WHERE order_id = %s", order_id)
if don.customer_id != user.id:        # dễ quên, dễ bị bỏ qua khi refactor
    raise HTTPException(403)
```

Đưa vào `WHERE` thì **không thể quên** — không có quyền thì không có dữ liệu.

**② Trả 404 thay vì 403.** Trả 403 là đang nói *"đơn này có tồn tại, nhưng bạn không được xem"* — kẻ tấn công dùng chính điều đó để dò xem ID nào tồn tại. Nguyên tắc: **không tiết lộ sự tồn tại của thứ người ta không có quyền thấy**.

### Tình huống thực tế và cách xử lý

> **Tình huống:** Hệ thống có 47 endpoint. Bạn sửa IDOR ở 12 chỗ, ba tháng sau đội khác thêm 8 endpoint mới và quên kiểm ở 3 chỗ.

**Vấn đề gốc: phân quyền đang là thứ "phải nhớ làm", nên nó sẽ bị quên.** Cách chữa là biến nó thành thứ **mặc định có**, phải chủ động tắt mới không có.

```python
# Cách 1: middleware mặc định CHẶN, phải khai báo mới cho qua
@app.middleware("http")
async def bat_buoc_xac_thuc(request: Request, call_next):
    if request.url.path not in DUONG_DAN_CONG_KHAI:
        if not request.state.user:
            return JSONResponse({"error": "UNAUTHENTICATED"}, 401)
    return await call_next(request)

# Cách 2: repository luôn nhận user, không có đường đi vòng
class OrderRepo:
    def __init__(self, user):       # ← bắt buộc truyền user khi khởi tạo
        self.user = user
    def lay(self, order_id):
        return db.query(
            "SELECT * FROM orders WHERE order_id=%s AND customer_id=%s",
            order_id, self.user.id)
```

```sql
-- Cách 3 (mạnh nhất): Row Level Security — database tự lọc
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY chi_don_cua_minh ON orders
    USING (customer_id = current_setting('app.user_id')::bigint);
-- Kể cả lệnh chạy tay cũng không thấy đơn của người khác
```

Và **kiểm thử tự động** để lỗi không quay lại:

```python
@pytest.mark.parametrize("path", TAT_CA_ENDPOINT_CO_ID)
def test_khong_xem_duoc_du_lieu_nguoi_khac(client, path):
    tai_nguyen_cua_b = tao_du_lieu(user_b)
    r = client.get(path.format(id=tai_nguyen_cua_b.id),
                   headers=token_cua(user_a))
    assert r.status_code in (403, 404), f"IDOR tại {path}"
```

## HTTP không có trí nhớ — và đó là gốc của mọi thứ

```text
HTTP là giao thức KHÔNG TRẠNG THÁI (stateless).
Mỗi yêu cầu độc lập, không dính dáng gì tới yêu cầu trước.

   Request 1: "Tôi là An, mật khẩu abc" → Server: "OK, chào An"
   Request 2: "Cho tôi xem đơn hàng"    → Server: "Bạn là ai?"
                                            ▲ nó ĐÃ QUÊN
```

Server quên bạn sau mỗi lần bấm chuột. Vậy làm sao nó nhớ?

Đây là câu hỏi mà **mọi cơ chế xác thực đều đang cố trả lời**, và chúng chia làm hai trường phái:

```text
① SERVER NHỚ BẠN      → Session (có trạng thái)
② BẠN MANG BẰNG CHỨNG → Token / JWT (không trạng thái)
```

Hai trường phái này được mổ xẻ chi tiết ở bài 2. Ở đây cần nắm **cấu trúc chung** của mọi cơ chế:

```text
   ĐĂNG NHẬP MỘT LẦN
        │
        ├─► Server phát ra một BẰNG CHỨNG (session id / token / chứng thư)
        │
        ▼
   MỖI REQUEST SAU ĐÓ
        │
        ├─► Client đính kèm bằng chứng đó
        │      Authorization: Bearer eyJhbGci...
        │      hoặc Cookie: session_id=abc123
        │
        ├─► Server KIỂM bằng chứng   ← XÁC THỰC (bạn là ai)
        │
        └─► Server kiểm QUYỀN        ← PHÂN QUYỀN (bạn được làm gì)
```

## Ba mô hình phân quyền

Sau khi biết "bạn là ai", câu hỏi tiếp là "bạn được làm gì". Có ba cách trả lời, độ phức tạp tăng dần.

### ① RBAC — phân quyền theo vai trò

*Role-Based Access Control*. Phổ biến nhất, đủ cho 80% hệ thống.

```text
   NGƯỜI DÙNG ──gán──► VAI TRÒ ──có──► QUYỀN

   An      ──►  admin      ──► [đọc_don, sửa_don, xoá_don, quản_lý_user]
   Bình    ──►  nhân_viên  ──► [đọc_don, sửa_don]
   Chi     ──►  khách      ──► [đọc_don_của_mình]
```

```sql
CREATE TABLE roles       (role_id SERIAL PRIMARY KEY, ten TEXT UNIQUE);
CREATE TABLE permissions (perm_id SERIAL PRIMARY KEY, ten TEXT UNIQUE);
CREATE TABLE role_permissions (
    role_id INT REFERENCES roles(role_id),
    perm_id INT REFERENCES permissions(perm_id),
    PRIMARY KEY (role_id, perm_id)
);
CREATE TABLE user_roles (
    user_id BIGINT REFERENCES users(user_id),
    role_id INT    REFERENCES roles(role_id),
    PRIMARY KEY (user_id, role_id)
);
```

```python
def yeu_cau_quyen(ten_quyen: str):
    def kiem(user = Depends(dang_nhap)):
        if ten_quyen not in user.quyen:
            raise HTTPException(403, "Không đủ quyền")
        return user
    return kiem

@app.delete("/don-hang/{id}")
def xoa_don(id: int, user = Depends(yeu_cau_quyen("xoa_don"))):
    ...
```

> **Mẹo quan trọng:** kiểm theo **quyền** (`xoa_don`), đừng kiểm theo **vai trò** (`if user.role == "admin"`). Vì khi sếp yêu cầu "cho trưởng nhóm cũng xoá được", bạn chỉ cần gán thêm quyền cho vai trò đó — không phải đi sửa 40 chỗ trong code.

**Hạn chế của RBAC:** nó không trả lời được câu *"nhân viên chỉ được xem đơn của **chi nhánh mình**"*. Quyền `doc_don` là có hoặc không, nó không biết "đơn nào".

### ② ABAC — phân quyền theo thuộc tính

*Attribute-Based Access Control*. Quyết định dựa trên **thuộc tính** của người dùng, tài nguyên, và ngữ cảnh.

```python
def duoc_phep(user, hanh_dong, tai_nguyen, ngu_canh):
    # Thuộc tính người dùng + tài nguyên + ngữ cảnh
    if hanh_dong == "duyet_chi" and tai_nguyen.loai == "phieu_chi":
        return (user.chi_nhanh == tai_nguyen.chi_nhanh      # cùng chi nhánh
                and tai_nguyen.so_tien <= user.han_muc      # trong hạn mức
                and 8 <= ngu_canh.gio <= 18                 # trong giờ hành chính
                and ngu_canh.ip in MANG_NOI_BO)             # từ mạng công ty
    return False
```

Mạnh hơn nhiều nhưng khó kiểm toán: *"ai đang có quyền duyệt chi?"* trở thành câu hỏi phải chạy chương trình mới trả lời được.

### ③ ReBAC — phân quyền theo quan hệ

*Relationship-Based Access Control*. Đây là mô hình của Google Drive, Notion, Figma — quyền đến từ **quan hệ trong đồ thị**.

```text
   An ──là chủ──► Thư mục "Dự án"
                       │
                       ├──chứa──► Tài liệu A
                       └──chứa──► Tài liệu B

   Bình ──được chia sẻ (xem)──► Thư mục "Dự án"
   → Bình tự động XEM được Tài liệu A và B (quyền KẾ THỪA xuống)

   Câu hỏi phân quyền trở thành: "có ĐƯỜNG ĐI nào từ Bình tới Tài liệu A
   với nhãn ≥ xem không?"
```

Google công bố hệ thống **Zanzibar** giải bài toán này ở quy mô hàng tỷ quan hệ; các bản mã nguồn mở tương đương: **SpiceDB**, **OpenFGA**, **Ory Keto**.

### Bảng chọn

| Mô hình | Dùng khi | Ví dụ | Độ phức tạp |
|---|---|---|---|
| **RBAC** | Quyền theo chức danh, tài nguyên đồng nhất | CMS, ERP nội bộ, admin panel | Thấp |
| **RBAC + quyền sở hữu** | Thêm điều kiện "của mình" | Hầu hết app thương mại điện tử | Thấp |
| **ABAC** | Quyết định phụ thuộc ngữ cảnh (giờ, IP, hạn mức) | Ngân hàng, bảo hiểm, y tế | Trung bình |
| **ReBAC** | Chia sẻ tài nguyên tuỳ ý, quyền kế thừa theo cây | Drive, Notion, Figma, GitHub | Cao |

**Lời khuyên thực dụng:** bắt đầu bằng **RBAC + kiểm quyền sở hữu trong `WHERE`**. Đó là điểm cân bằng tốt nhất, và bạn có thể nói ra lộ trình nâng cấp khi được hỏi.

## Multi-tenant: cái bẫy chết người nhất

Với hệ thống phục vụ nhiều công ty (SaaS), quên một điều kiện `tenant_id` nghĩa là **công ty A đọc được dữ liệu công ty B**.

```python
# ❌ Quên tenant_id → rò rỉ dữ liệu xuyên khách hàng
don = db.query("SELECT * FROM orders WHERE order_id = %s", order_id)

# ✅ tenant_id BẮT BUỘC trong mọi truy vấn
don = db.query(
    "SELECT * FROM orders WHERE order_id = %s AND tenant_id = %s",
    order_id, user.tenant_id)
```

Nhưng đây vẫn là "phải nhớ làm" — và điều gì phải nhớ thì sẽ bị quên. Cách chữa đúng là **ép ở tầng database**:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY cach_ly_tenant ON orders
    USING (tenant_id = current_setting('app.tenant_id')::bigint);
```

```python
# Đặt biến phiên ngay khi mượn kết nối, trong CÙNG transaction
@contextmanager
def ket_noi_cua_tenant(tenant_id):
    with pool.connection() as conn:
        conn.execute("SELECT set_config('app.tenant_id', %s, true)",
                     (str(tenant_id),))   # true = chỉ trong transaction này
        yield conn
```

Từ giây đó, **kể cả khi lập trình viên quên `WHERE tenant_id`, database vẫn tự lọc.**

## Đăng nhập nhiều yếu tố (MFA)

**MFA** (*Multi-Factor Authentication*) yêu cầu bằng chứng từ nhiều **loại** khác nhau:

```text
① THỨ BẠN BIẾT   — mật khẩu, mã PIN
② THỨ BẠN CÓ     — điện thoại (mã OTP), khoá vật lý (YubiKey)
③ THỨ BẠN LÀ     — vân tay, khuôn mặt

Hai mật khẩu KHÔNG phải MFA — chúng cùng một loại.
```

| Phương thức | Chống được | Điểm yếu |
|---|---|---|
| **SMS OTP** | Lộ mật khẩu | **SIM swap** — kẻ tấn công chiếm số điện thoại. Yếu nhất. |
| **TOTP** (Google Authenticator) | Lộ mật khẩu, SIM swap | Vẫn bị lừa qua trang giả (phishing) |
| **Push notification** | Như TOTP | **MFA fatigue** — spam tới khi nạn nhân bấm nhầm "Đồng ý" |
| **WebAuthn / Passkey** | **Cả phishing** | Cần thiết bị hỗ trợ |

**WebAuthn/Passkey là lựa chọn tốt nhất hiện nay** vì nó gắn chữ ký với **tên miền**: trang giả `paypa1.com` không lấy được chữ ký dành cho `paypal.com`. Đây là cơ chế duy nhất chống được phishing về mặt nguyên lý, không phải bằng cảnh báo người dùng.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Xác thực xong quên phân quyền | **IDOR** — xem được dữ liệu người khác | Quyền sở hữu vào `WHERE` |
| Kiểm quyền sau khi lấy dữ liệu | Dễ quên khi refactor | Đưa vào điều kiện truy vấn |
| Trả 403 cho tài nguyên không thuộc về mình | Lộ sự tồn tại → dò được ID | Trả 404 |
| Kiểm theo vai trò `if role == "admin"` | Đổi luật phải sửa 40 chỗ | Kiểm theo **quyền** |
| Quên `tenant_id` ở một truy vấn | **Rò dữ liệu xuyên khách hàng** | Row Level Security |
| Phân quyền là "phải nhớ làm" | Endpoint mới sẽ quên | Mặc định chặn, phải khai báo mới cho qua |
| Không có test IDOR | Lỗi quay lại sau mỗi lần thêm tính năng | Test tham số hoá cho mọi endpoint có ID |
| Dùng ID tuần tự trong URL công khai | Dễ dò (`/don/1`, `/don/2`...) | UUID public + vẫn phải kiểm quyền |
| SMS OTP làm yếu tố thứ hai duy nhất | SIM swap | TOTP hoặc Passkey |
| Đổi mật khẩu không huỷ token cũ | Hacker vẫn ở trong tài khoản | Xem bài 2 — cơ chế thu hồi |

## Câu hỏi phỏng vấn hay gặp

**H: Xác thực và phân quyền khác gì nhau?**
Xác thực trả lời *"bạn là ai"*, phân quyền trả lời *"bạn được làm gì"*. Xác thực luôn đến trước. Mã lỗi cũng khác: 401 nghĩa là *"tôi không biết bạn là ai"* (thiếu hoặc hỏng token), 403 là *"tôi biết bạn nhưng không cho"*. Rất nhiều lỗ hổng sinh ra vì lập trình viên nhầm hai cái — xác thực đúng người nhưng cho phép sai việc, và đó chính là IDOR.

**H: IDOR là gì, chặn thế nào?**
Là khi người dùng đổi ID trên URL và xem được dữ liệu của người khác — xác thực đúng nhưng thiếu phân quyền. Cách chặn là **đưa quyền sở hữu vào ngay điều kiện `WHERE`** thay vì lấy dữ liệu ra rồi mới kiểm, vì kiểm sau thì dễ quên khi refactor. Và trả **404 thay vì 403** để không tiết lộ sự tồn tại của tài nguyên. Ở tầng kiến trúc, em biến phân quyền thành thứ **mặc định có** — middleware chặn trước, repository bắt buộc nhận user, hoặc Row Level Security ở database.

**H: RBAC, ABAC, ReBAC khác gì?**
RBAC gán quyền theo **vai trò** — đơn giản, đủ cho hầu hết hệ thống, nhưng không trả lời được *"chỉ xem đơn của chi nhánh mình"*. ABAC quyết định theo **thuộc tính** của người dùng, tài nguyên và ngữ cảnh (giờ, IP, hạn mức) — mạnh hơn nhưng khó kiểm toán. ReBAC quyết định theo **quan hệ trong đồ thị** với quyền kế thừa — đây là mô hình của Drive, Notion, Figma, và Google giải nó bằng Zanzibar. Em bắt đầu bằng RBAC cộng kiểm quyền sở hữu, rồi nâng cấp khi có nhu cầu thật.

**H: Hệ thống SaaS nhiều khách hàng, làm sao chắc chắn không rò dữ liệu giữa họ?**
Không dựa vào việc lập trình viên nhớ thêm `WHERE tenant_id` — điều gì phải nhớ thì sẽ bị quên ở endpoint thứ 48. Em ép ở tầng database bằng **Row Level Security**: chính sách lọc theo `current_setting('app.tenant_id')`, và biến này được đặt ngay khi mượn kết nối, trong cùng transaction. Kể cả lệnh chạy tay hay code quên điều kiện thì database vẫn tự lọc.

**H: MFA là gì và loại nào tốt nhất?**
Là yêu cầu bằng chứng từ nhiều **loại** khác nhau: thứ bạn biết, thứ bạn có, thứ bạn là — hai mật khẩu không phải MFA vì cùng một loại. SMS OTP yếu nhất vì SIM swap. TOTP tốt hơn nhưng vẫn bị lừa qua trang giả. **WebAuthn/Passkey là tốt nhất** vì chữ ký được gắn với tên miền, nên trang giả không lấy được — nó chống phishing về mặt nguyên lý chứ không phải bằng cách cảnh báo người dùng.

## Tóm tắt bài 1

- **Xác thực** = *bạn là ai* (401); **phân quyền** = *bạn được làm gì* (403). Xác thực luôn đến trước.
- **IDOR** là lỗ hổng phổ biến nhất khi trộn lẫn hai khái niệm — chữa bằng cách đưa **quyền sở hữu vào `WHERE`** và trả **404 thay vì 403**.
- Phân quyền phải là thứ **mặc định có**, không phải "nhớ thì làm": middleware chặn trước, repository bắt buộc nhận user, hoặc **Row Level Security**.
- HTTP **không có trí nhớ** → mọi cơ chế xác thực đều đang trả lời câu "làm sao server nhớ bạn": server nhớ (**session**) hoặc bạn mang bằng chứng (**token**).
- Ba mô hình phân quyền: **RBAC** (vai trò), **ABAC** (thuộc tính + ngữ cảnh), **ReBAC** (quan hệ, kế thừa — Drive/Notion/Figma). Bắt đầu bằng RBAC + quyền sở hữu.
- Kiểm theo **quyền** chứ đừng kiểm theo **vai trò** — để đổi luật không phải sửa 40 chỗ.
- Multi-tenant: đừng tin vào trí nhớ, **ép cách ly ở tầng database**.
- MFA phải khác **loại**; **Passkey/WebAuthn** là cơ chế duy nhất chống phishing về nguyên lý.

**Bài kế tiếp** → [Bài 2: Session hay JWT — server nhớ bạn hay bạn mang bằng chứng](02-session-hay-jwt.md)
