# Bài 1: Flash sale và bài toán chống bán quá hàng

10 chiếc iPhone giá 1.000 đồng. 50.000 người bấm mua trong cùng một giây. Sáng hôm sau, kho hàng của bạn **âm 40 chiếc** — 50 khách đã thanh toán thành công cho những chiếc máy không hề tồn tại.

Đây là **oversell** (bán quá hàng), cơn ác mộng của mọi sàn thương mại điện tử. Và nó không phải lỗi của database. Database làm đúng từng lệnh — chỉ là theo một thứ tự chết người.

Phase-4 bài 3 đã dạy `SELECT FOR UPDATE`, khoá lạc quan và bài toán double booking. Bài này đi xa hơn một bậc: **cái gì xảy ra khi 50.000 request cùng đập vào một dòng dữ liệu**, và vì sao lời giải sách vở lại sập ở quy mô đó.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Oversell** | ô-vơ-seo | **Bán quá hàng** — bán nhiều hơn số thực có |
| **Race condition** | rêis | **Điều kiện tranh đua** — hai tiến trình chạy đua trên cùng một dòng |
| **Lost update** | | **Mất bản cập nhật** — ghi của người này bị người kia đè lên |
| **Atomic write** | a-tô-mịc | **Ghi nguyên tử** — đọc-kiểm-ghi gộp thành một thao tác không tách rời |
| **Pessimistic lock** | pe-si-mít | **Khoá bi quan** — khoá trước, hỏi sau |
| **Optimistic lock** | óp-ti-mít | **Khoá lạc quan** — không khoá, kiểm tra lúc ghi |
| **Livelock** | lai-lốc | Ai cũng bận rộn mà **không ai tiến được** |
| **Deadlock** | đét-lốc | **Khoá chết** — hai bên cùng chờ nhau vô tận |
| **Reservation** | rê-dơ-vê-shân | **Giữ chỗ có thời hạn** |
| **Sharded counter** | | **Bộ đếm chia mảnh** — tách một dòng đếm thành N dòng để giảm tranh chấp |
| **Idempotency key** | ai-đem-pô-tần | **Khoá bất biến** — để gọi lại nhiều lần vẫn ra một kết quả |

## Đoạn code ngây thơ gây ra tất cả

```python
# ❌ Kịch bản kinh điển
ton = db.query("SELECT ton_kho FROM products WHERE id = 1").scalar()   # đọc
if ton > 0:                                                             # kiểm tra
    db.execute("UPDATE products SET ton_kho = %s WHERE id = 1", (ton - 1,))  # ghi
    tao_don_hang(user_id)
```

Giữa `SELECT` và `UPDATE` luôn có một **kẽ hở thời gian**. Chỉ vài mili giây — nhưng đủ để cả thế giới chen ngang.

```text
thời gian ──────────────────────────────────────────────────►

Request A:  đọc ton_kho=1 ──┐                    ┌── ghi ton_kho=0
                             └── kiểm tra: OK ───┘
Request B:      đọc ton_kho=1 ──┐                    ┌── ghi ton_kho=0
                                 └── kiểm tra: OK ───┘
                                        ▲
                          Cả hai đều tin mình là người cuối cùng.
                          Cả hai cùng trừ. Bán 2 máy, tồn kho chỉ giảm 1.
```

Đây là **lost update** (mất bản cập nhật) — hiện tượng đã học ở phase-4. Nhân kịch bản đó lên 50.000 lần: hàng nghìn request tràn vào cùng một khe hở như thác nước đổ qua một khe cửa hẹp.

## Bốn lời giải, xếp theo thứ tự nên thử

### ① Ghi nguyên tử có điều kiện — luôn thử cái này trước

```sql
UPDATE products
SET ton_kho = ton_kho - 1
WHERE product_id = 1 AND ton_kho >= 1
RETURNING ton_kho;
```

Đây là lời giải **rẻ nhất, đơn giản nhất, và đúng nhất** — nhưng ít người nói ra đầu tiên trong phỏng vấn.

Vì sao nó đúng: một lệnh `UPDATE` đơn lẻ **tự lấy khoá dòng** trong lúc thực thi, và điều kiện `ton_kho >= 1` được đánh giá **sau khi** đã lấy được khoá, trên giá trị mới nhất. Không có kẽ hở nào giữa đọc và ghi vì chúng là **một thao tác duy nhất**.

```python
row = db.execute(
    "UPDATE products SET ton_kho = ton_kho - 1 "
    "WHERE product_id = %s AND ton_kho >= 1 RETURNING ton_kho",
    (pid,)
).fetchone()

if row is None:
    raise HetHang()          # không dòng nào bị ảnh hưởng = hết hàng
con_lai = row[0]
```

Cộng thêm một `CHECK` để luật nằm trong dữ liệu, không nằm trong query:

```sql
ALTER TABLE products ADD CONSTRAINT ck_ton_kho CHECK (ton_kho >= 0);
```

Từ giây đó, **không một câu lệnh nào trên đời làm tồn kho âm được nữa** — kể cả script import, kể cả lệnh chạy tay.

**Giới hạn:** cách này chỉ dùng được khi logic đủ đơn giản để viết trong một câu `UPDATE`. Nếu cần đọc, tính toán nhiều bước, gọi dịch vụ khác rồi mới ghi — phải dùng cách 2 hoặc 3.

### ② Khoá bi quan — `SELECT FOR UPDATE`

```sql
BEGIN;
SELECT ton_kho FROM products WHERE product_id = 1 FOR UPDATE;
--                                                 ▲ khoá dòng này
--   Mọi transaction khác gọi FOR UPDATE trên cùng dòng sẽ PHẢI CHỜ

-- ... tính toán phức tạp: kiểm mã giảm giá, kiểm hạn mức mua, tính phí ship

UPDATE products SET ton_kho = ton_kho - 1 WHERE product_id = 1;
INSERT INTO orders (...) VALUES (...);
COMMIT;   -- ◄── khoá nhả ra TẠI ĐÂY, không phải sau câu SELECT
```

Giống phòng thử đồ: ai vào trước chốt cửa, người sau xếp hàng chờ bên ngoài.

**Và đây là chỗ nó sập ở quy mô flash sale:**

```text
50.000 request, mỗi transaction giữ khoá 50 ms:
    Người thứ 50.000 phải chờ:  50.000 × 50 ms = 2.500 giây = 41 PHÚT

Thực tế xảy ra trước đó:
    • Kết nối trong pool cạn sạch (mỗi request chờ = 1 kết nối bị giữ)
    • Toàn bộ website đứng, kể cả trang không liên quan (xem phase-7 bài 6)
    • Timeout hàng loạt, người dùng bấm lại → làm tình hình tệ gấp đôi
```

Khoá bi quan **đúng về mặt dữ liệu nhưng sai về mặt hệ thống** ở quy mô này. Nó biến 50.000 request song song thành một hàng dọc tuần tự — và cái hàng đó dài hơn kiên nhẫn của bất kỳ ai.

Ba luật khi buộc phải dùng:

```sql
SET lock_timeout = '2s';        -- thà báo lỗi còn hơn chờ vô tận

-- Luôn khoá theo cùng MỘT THỨ TỰ để tránh deadlock
SELECT * FROM products WHERE product_id = ANY($1) ORDER BY product_id FOR UPDATE;
--                                                 ▲ bắt buộc

-- Giữ transaction ngắn nhất có thể — không gọi mạng ở giữa
```

Biến thể hữu ích: `FOR UPDATE NOWAIT` (báo lỗi ngay thay vì chờ) và `FOR UPDATE SKIP LOCKED` (bỏ qua dòng bị khoá — dùng cho hàng đợi, không dùng cho tồn kho).

### ③ Khoá lạc quan — không khoá gì cả, kiểm tra lúc ghi

Cho mọi người cùng đọc thoải mái. Mỗi dòng dán thêm một con tem: cột `version`. Ai muốn sửa phải chứng minh tem chưa đổi.

```sql
-- Đọc
SELECT ton_kho, version FROM products WHERE product_id = 1;
-- → ton_kho = 10, version = 7

-- ... xử lý ở tầng ứng dụng ...

-- Ghi: chỉ thành công nếu KHÔNG AI sửa từ lúc bạn đọc
UPDATE products
SET ton_kho = ton_kho - 1, version = version + 1
WHERE product_id = 1 AND version = 7;
-- Nếu ai đó sửa trước → version đã thành 8 → 0 dòng bị ảnh hưởng → thử lại
```

```python
def mua_hang(pid, so_lan_thu_toi_da=3):
    for lan in range(so_lan_thu_toi_da):
        ton, ver = doc_san_pham(pid)
        if ton < 1:
            raise HetHang()
        n = db.execute(
            "UPDATE products SET ton_kho = ton_kho - 1, version = version + 1 "
            "WHERE product_id = %s AND version = %s", (pid, ver)
        ).rowcount
        if n == 1:
            return                      # thành công
        time.sleep(0.01 * (2 ** lan) * random.random())   # backoff + jitter
    raise QuaTaiThuLaiSau()
```

**Khoá lạc quan tốt khi tranh chấp THẤP, và tệ hơn khoá bi quan khi tranh chấp CAO:**

```text
Tranh chấp thấp (99% lần ghi thành công ngay):
   → Không ai chờ ai. Nhanh nhất.

Flash sale (50.000 người tranh 1 dòng):
   → 49.999 lần UPDATE thất bại, tất cả cùng thử lại
   → Sóng thử lại đè lên nhau, tỷ lệ thành công càng giảm
   → Gọi là "livelock": ai cũng bận rộn mà không ai tiến được
```

Nên với flash sale, khoá lạc quan **không phải lời giải** — nó là cách làm hệ thống bận rộn một cách vô ích.

### So sánh ba cách

| | Ghi nguyên tử | Khoá bi quan | Khoá lạc quan |
|---|---|---|---|
| Đúng đắn | ✅ | ✅ | ✅ |
| Độ phức tạp code | Thấp nhất | Trung bình | Cao (phải retry) |
| Tranh chấp thấp | ✅ Tốt nhất | Chấp nhận được | ✅ Tốt |
| Tranh chấp cực cao | ✅ Vẫn tốt nhất | ❌ Hàng đợi dài, cạn pool | ❌ Livelock |
| Logic nhiều bước | ❌ Không làm được | ✅ | ✅ |
| Nguy cơ deadlock | Rất thấp | **Có** — phải khoá đúng thứ tự | Không |

## Nhưng ở quy mô flash sale, cả ba đều chưa đủ

Vấn đề gốc không nằm ở cách khoá. Vấn đề là **50.000 request cùng chạm vào một dòng dữ liệu duy nhất**. Dù bạn khoá kiểu gì, dòng đó vẫn là nút thắt vật lý.

Lời giải kiến trúc: **đừng để 50.000 request chạm tới database.**

### Chiến lược A: chặn ở tầng ngoài trước khi vào database

```text
50.000 request
      ▼
┌─────────────────────────────────────────────────┐
│ ① CDN / Edge: chặn bot, hàng đợi ảo             │ → còn 30.000
├─────────────────────────────────────────────────┤
│ ② Rate limit theo user/IP: 1 request / 3 giây   │ → còn 12.000
├─────────────────────────────────────────────────┤
│ ③ BỘ ĐẾM REDIS: DECR nguyên tử, hết thì chặn    │ → còn 10-15
├─────────────────────────────────────────────────┤
│ ④ Database: chỉ số ít request thật sự tới đây   │
└─────────────────────────────────────────────────┘
```

Bước ③ là chìa khoá. Redis đơn luồng, `DECR` là thao tác nguyên tử:

```lua
-- Script Lua chạy nguyên tử trên Redis
local ton = tonumber(redis.call('GET', KEYS[1]))
if not ton or ton <= 0 then
    return -1                          -- hết hàng
end
return redis.call('DECR', KEYS[1])     -- giữ chỗ thành công
```

```python
GIU_CHO = redis.register_script(LUA_SCRIPT)

def mua_hang(pid, user_id):
    con_lai = GIU_CHO(keys=[f"flash:ton:{pid}"])
    if con_lai < 0:
        return "Hết hàng"

    # Chỉ ~10 request tới được đây. Database hoàn toàn thảnh thơi.
    try:
        with db.transaction():
            row = db.execute(
                "UPDATE products SET ton_kho = ton_kho - 1 "
                "WHERE product_id = %s AND ton_kho >= 1 RETURNING ton_kho",
                (pid,)).fetchone()
            if row is None:
                raise HetHang()                    # database là chân lý cuối cùng
            db.execute("INSERT INTO orders (...) VALUES (...)")
    except Exception:
        redis.incr(f"flash:ton:{pid}")             # HOÀN LẠI chỗ đã giữ
        raise
```

**Nguyên tắc bắt buộc:** Redis chỉ là **bộ lọc**, database vẫn là **chân lý cuối cùng**. Nếu Redis và database lệch nhau (Redis mất dữ liệu, hoặc hoàn lại thất bại), database phải là bên đúng. Và phải có job đối soát định kỳ:

```sql
-- Đối soát: Redis nói còn bao nhiêu vs database nói còn bao nhiêu
SELECT product_id, ton_kho FROM products WHERE product_id = ANY($1);
-- So với GET flash:ton:<pid>, lệch thì đồng bộ lại từ database
```

### Chiến lược B: giữ chỗ có thời hạn (reservation)

Vấn đề thực tế: khách bấm mua rồi **bỏ đi không thanh toán**. Nếu bạn trừ kho ngay, hàng bị giữ vĩnh viễn.

```sql
CREATE TABLE inventory_holds (
    hold_id    BIGSERIAL PRIMARY KEY,
    product_id BIGINT      NOT NULL,
    user_id    BIGINT      NOT NULL,
    so_luong   INT         NOT NULL,
    het_han    TIMESTAMPTZ NOT NULL,
    UNIQUE (product_id, user_id)          -- mỗi người chỉ giữ được một chỗ
);

-- Tồn kho KHẢ DỤNG = tồn kho vật lý − số đang được giữ chưa hết hạn
CREATE VIEW ton_kho_kha_dung AS
SELECT p.product_id,
       p.ton_kho - COALESCE(sum(h.so_luong) FILTER (WHERE h.het_han > now()), 0)
           AS kha_dung
FROM products p
LEFT JOIN inventory_holds h USING (product_id)
GROUP BY p.product_id, p.ton_kho;
```

```text
Luồng đầy đủ:

  Bấm mua ──► GIỮ CHỖ 10 phút (chưa trừ kho thật)
                    │
                    ├── thanh toán thành công ──► trừ kho thật, xoá hold
                    │
                    ├── huỷ ────────────────────► xoá hold, chỗ về lại ngay
                    │
                    └── hết 10 phút ────────────► job dọn hold hết hạn
```

Job dọn phải chạy đều và phải idempotent:

```sql
DELETE FROM inventory_holds WHERE het_han < now();
```

### Chiến lược C: tách bộ đếm thành nhiều dòng (sharded counter)

Khi vẫn buộc phải đếm trong database mà một dòng là nút thắt:

```sql
CREATE TABLE ton_kho_shard (
    product_id BIGINT NOT NULL,
    shard      SMALLINT NOT NULL,
    ton_kho    INT NOT NULL CHECK (ton_kho >= 0),
    PRIMARY KEY (product_id, shard)
);
-- 100 chiếc iPhone chia thành 10 shard, mỗi shard 10 chiếc

-- Mỗi request đập vào MỘT shard ngẫu nhiên → tranh chấp giảm 10 lần
UPDATE ton_kho_shard SET ton_kho = ton_kho - 1
WHERE product_id = 1 AND shard = floor(random() * 10)::int AND ton_kho >= 1
RETURNING ton_kho;

-- Nếu shard đó hết, thử shard khác (tối đa vài lần) rồi mới báo hết hàng
```

**Đánh đổi:** đọc tổng tồn kho phải cộng 10 dòng, và có thể có shard hết trong khi shard khác còn — nghĩa là bạn báo "hết hàng" khi thực ra vẫn còn. Đây là đánh đổi có ý thức: chấp nhận bán thiếu vài chiếc để không bao giờ bán thừa.

### Chiến lược D: tuần tự hoá hoàn toàn bằng hàng đợi

```text
50.000 request  ──► HÀNG ĐỢI (Kafka / Redis Stream)
                          │
                          ▼
                    1 consumer duy nhất
                    xử lý tuần tự, không tranh chấp
                          │
                          ▼
                    Database (một luồng ghi)

  Người dùng nhận ngay: "Đã nhận đơn, mã #8412, đang xử lý"
  Vài giây sau: push/email báo kết quả
```

Đây là cách các sàn lớn thực sự làm cho flash sale quy mô rất lớn. Nó đúng tuyệt đối vì **không có tranh chấp nào cả** — chỉ có một người ghi. Cái giá: trải nghiệm người dùng đổi từ "kết quả tức thì" sang "sẽ báo sau", và bạn mua về toàn bộ độ phức tạp của hệ bất đồng bộ (xem phase-7 bài 6).

## Bảng chọn chiến lược theo quy mô

| Quy mô tranh chấp | Chiến lược | Ghi chú |
|---|---|---|
| < 100 req/s vào cùng một dòng | **Ghi nguyên tử có điều kiện** | Đủ, đơn giản, không cần gì thêm |
| 100–1.000 req/s | Ghi nguyên tử + rate limit + `lock_timeout` | Vẫn để database gánh |
| 1.000–10.000 req/s | + **Bộ đếm Redis** làm bộ lọc + reservation | Database chỉ nhận request đã lọc |
| > 10.000 req/s | + **Hàng đợi** tuần tự hoá, hoặc sharded counter | Trải nghiệm bất đồng bộ |
| Logic nhiều bước, tranh chấp thấp | Khoá lạc quan (`version`) | Nhớ backoff + jitter |
| Logic nhiều bước, tranh chấp trung bình | `SELECT FOR UPDATE` + `lock_timeout` + khoá đúng thứ tự | Giữ transaction ngắn |

## Ba vấn đề đi kèm mà người phỏng vấn hay hỏi tiếp

### ① Deadlock khi mua nhiều sản phẩm cùng lúc

```text
Giỏ hàng A: [sản phẩm 5, sản phẩm 9]     Giỏ hàng B: [sản phẩm 9, sản phẩm 5]

  A khoá 5 ──► chờ 9                       B khoá 9 ──► chờ 5
                    ▲                                        ▲
                    └──────── vòng chờ vô tận ───────────────┘
```

Cách chữa duy nhất và tuyệt đối: **luôn khoá theo cùng một thứ tự**.

```sql
SELECT * FROM products
WHERE product_id = ANY($1)
ORDER BY product_id            -- ◄── dòng cứu mạng
FOR UPDATE;
```

### ② Idempotency — chống trừ kho hai lần khi khách bấm lại

```sql
CREATE TABLE orders (
    order_id         BIGSERIAL PRIMARY KEY,
    idempotency_key  TEXT UNIQUE NOT NULL,    -- client sinh, gửi kèm mọi lần thử lại
    ...
);

-- Bấm lại 5 lần → chỉ tạo 1 đơn, 4 lần sau không làm gì
INSERT INTO orders (idempotency_key, ...) VALUES ($1, ...)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING order_id;
-- Trả về 0 dòng = đơn đã tồn tại → trả lại đơn cũ cho client
```

Đây là mẫu thiết kế bắt buộc: **khách hàng luôn bấm lại khi màn hình quay lâu** (xem thêm phase-7 bài 2 về replication lag khiến họ bấm lại).

### ③ Hoàn kho khi thanh toán thất bại

Trừ kho lúc đặt đơn, nhưng thanh toán qua cổng ngoài mất 30 giây và có thể thất bại. Đừng giữ transaction suốt thời gian đó (phase-7 bài 6). Dùng máy trạng thái:

```text
tao_don (giữ chỗ) ──► cho_thanh_toan ──┬──► da_thanh_toan (trừ kho thật)
                                        │
                                        └──► that_bai (hoàn chỗ giữ)
                                              ▲
                              Job quét đơn quá hạn thanh toán → tự hoàn
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Sáng hôm sau đợt sale, kho báo **âm 40 chiếc**. Bạn cần trả lời hai câu: *"mất bao nhiêu tiền?"* và *"làm sao không tái diễn?"*

**Bước 1 — đo thiệt hại chính xác trước khi làm gì khác:**

```sql
-- ① Sản phẩm nào âm, âm bao nhiêu
SELECT product_id, name, ton_kho
FROM products WHERE ton_kho < 0 ORDER BY ton_kho;

-- ② Những đơn nào là "đơn ma" (bán vượt kho)
WITH da_ban AS (
    SELECT product_id, sum(quantity) AS tong_ban
    FROM order_items i JOIN orders o USING (order_id)
    WHERE o.ordered_at BETWEEN $1 AND $2 AND o.status <> 'cancelled'
    GROUP BY 1
)
SELECT p.product_id, p.name,
       d.tong_ban, p.ton_kho_ban_dau,
       d.tong_ban - p.ton_kho_ban_dau AS so_don_ma
FROM da_ban d JOIN products p USING (product_id)
WHERE d.tong_ban > p.ton_kho_ban_dau;

-- ③ Xác định ĐÚNG những khách cần hoàn tiền — ai đặt SAU khi hết hàng
SELECT o.order_id, o.customer_id, o.total_amount, o.ordered_at
FROM orders o JOIN order_items i USING (order_id)
WHERE i.product_id = 42
ORDER BY o.ordered_at
OFFSET 10;              -- 10 chiếc đầu là hợp lệ, từ dòng 11 trở đi là đơn ma
```

**Bước 2 — chặn ở tầng database ngay, trước khi sửa code:**

```sql
UPDATE products SET ton_kho = 0 WHERE ton_kho < 0;    -- dọn dữ liệu sai trước
ALTER TABLE products ADD CONSTRAINT ck_ton_kho CHECK (ton_kho >= 0);
-- Từ giây này, KHÔNG một câu lệnh nào làm tồn kho âm được nữa
```

**Bước 3 — sửa gốc: đổi đọc-kiểm-ghi thành ghi nguyên tử:**

```python
# ❌ Code cũ — có khe hở giữa đọc và ghi
ton = db.query("SELECT ton_kho FROM products WHERE id=%s", pid).scalar()
if ton > 0:
    db.execute("UPDATE products SET ton_kho=%s WHERE id=%s", (ton-1, pid))

# ✅ Một thao tác duy nhất, không có khe hở
row = db.execute(
    "UPDATE products SET ton_kho = ton_kho - 1 "
    "WHERE product_id = %s AND ton_kho >= 1 RETURNING ton_kho",
    (pid,)).fetchone()
if row is None:
    raise HetHang()
```

**Bước 4 — kiểm chứng bằng test tải, đừng tin cảm giác:**

```python
# Bắn 500 request song song vào 10 sản phẩm — PHẢI chỉ có đúng 10 đơn thành công
import concurrent.futures as cf
with cf.ThreadPoolExecutor(500) as ex:
    kq = list(ex.map(lambda _: mua_hang(pid=42), range(500)))
assert sum(1 for r in kq if r.ok) == 10, "VẪN CÒN OVERSELL"
assert db.query("SELECT ton_kho FROM products WHERE id=42").scalar() == 0
```

> **Tình huống 2:** Đã dùng bộ đếm Redis lọc trước. Nhưng sau đợt sale, Redis nói **còn 3**, database nói **còn 0**. Ai đúng?

**Chẩn đoán — tìm chỗ rò:**

```python
# Chỗ rò gần như luôn nằm ở đây: đã DECR Redis nhưng database thất bại
# mà KHÔNG hoàn lại
con_lai = GIU_CHO(keys=[f"flash:ton:{pid}"])    # Redis giảm xuống
if con_lai < 0:
    return "Hết hàng"

with db.transaction():                           # ← nếu chỗ này ném lỗi
    ...                                          #   Redis đã giảm mà kho chưa trừ
```

**Cách xử lý — ba lớp:**

```python
# ① LUÔN HOÀN LẠI trong khối except
try:
    with db.transaction():
        row = db.execute("UPDATE products SET ton_kho = ton_kho - 1 "
                         "WHERE product_id=%s AND ton_kho>=1 RETURNING ton_kho",
                         (pid,)).fetchone()
        if row is None:
            raise HetHang()
        db.execute("INSERT INTO orders (...) VALUES (...)")
except Exception:
    redis.incr(f"flash:ton:{pid}")               # ◄── HOÀN LẠI, bắt buộc
    raise
```

```sql
-- ② JOB ĐỐI SOÁT chạy mỗi phút trong lúc sale
--    DATABASE LÀ CHÂN LÝ — Redis phải theo nó, không phải ngược lại
SELECT product_id, ton_kho FROM products WHERE product_id = ANY($1);
```

```python
for pid, ton_that in ket_qua:
    ton_redis = int(redis.get(f"flash:ton:{pid}") or 0)
    if ton_redis != ton_that:
        canh_bao(f"Lệch sp {pid}: Redis={ton_redis}, DB={ton_that}")
        redis.set(f"flash:ton:{pid}", ton_that)   # ĐỒNG BỘ TỪ DATABASE
```

```text
   ③ NGUYÊN TẮC KIẾN TRÚC:
      Redis là BỘ LỌC — nó chỉ làm giảm số request tới database.
      DATABASE là CHÂN LÝ CUỐI CÙNG — nó mới quyết định bán hay không.

      → Redis nói "còn hàng" mà database nói "hết" → DATABASE ĐÚNG.
      → Redis chết sạch lúc 3 giờ sáng → hệ thống chỉ CHẬM ĐI, không SAI ĐI.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `SELECT` rồi `UPDATE` ở tầng ứng dụng | Lost update → oversell | `UPDATE ... WHERE ton_kho >= 1` |
| Không có `CHECK (ton_kho >= 0)` | Một chỗ quên là kho âm | Đặt ràng buộc ở database |
| `FOR UPDATE` cho flash sale 50k req | Hàng đợi 41 phút, cạn pool, sập cả site | Lọc ở tầng ngoài trước |
| Khoá lạc quan khi tranh chấp cực cao | Livelock — ai cũng bận, không ai tiến | Ghi nguyên tử hoặc hàng đợi |
| Khoá nhiều dòng không theo thứ tự | Deadlock | `ORDER BY id FOR UPDATE` |
| Không đặt `lock_timeout` | Request chờ vô tận, cạn pool | `SET lock_timeout = '2s'` |
| Redis là chân lý cuối cùng | Redis mất dữ liệu = kho sai | Database mới là chân lý; có job đối soát |
| Quên hoàn lại chỗ giữ trên Redis khi lỗi | Kho "ảo" cạn dần | `INCR` trong khối `except` |
| Trừ kho ngay khi bấm mua | Khách bỏ đi, hàng bị giữ vĩnh viễn | Reservation có `het_han` + job dọn |
| Không có idempotency key | Khách bấm lại = trừ kho nhiều lần | `UNIQUE` + `ON CONFLICT DO NOTHING` |
| Gọi cổng thanh toán trong transaction | Giữ khoá 30 giây, sập hệ thống | Máy trạng thái, gọi ngoài transaction |
| Không test tải trước ngày sale | Phát hiện vấn đề lúc đang sale | Load test đúng kịch bản tranh chấp |

## Câu hỏi phỏng vấn hay gặp

**H: 10 sản phẩm, 50.000 người bấm mua cùng lúc, làm sao không bán quá?**
Em trả lời theo hai tầng. Về **tính đúng đắn**, lời giải rẻ nhất là ghi nguyên tử có điều kiện: `UPDATE ... SET ton_kho = ton_kho - 1 WHERE id = ? AND ton_kho >= 1 RETURNING ton_kho` — không có kẽ hở giữa đọc và ghi vì chúng là một thao tác, và không dòng nào bị ảnh hưởng nghĩa là hết hàng. Cộng thêm `CHECK (ton_kho >= 0)` để luật nằm trong dữ liệu. Về **quy mô**, ở 50.000 request thì vấn đề không còn là cách khoá mà là việc tất cả cùng chạm một dòng — nên em lọc ở tầng ngoài bằng bộ đếm Redis `DECR` nguyên tử, chỉ để khoảng 10–15 request tới được database, và Redis chỉ là bộ lọc còn database vẫn là chân lý cuối cùng, có job đối soát.

**H: Vì sao không dùng `SELECT FOR UPDATE`?**
Nó đúng về dữ liệu nhưng sai về hệ thống ở quy mô đó. Nó biến 50.000 request song song thành một hàng dọc tuần tự — với 50 ms mỗi transaction thì người cuối chờ 41 phút. Và trước khi tới đó, pool kết nối đã cạn vì mỗi request đang chờ đều giữ một kết nối, làm sập cả những trang không liên quan. `FOR UPDATE` đúng cho tranh chấp trung bình và logic nhiều bước, kèm `lock_timeout` và khoá theo thứ tự cố định.

**H: Khoá lạc quan có tốt hơn không?**
Ngược lại — nó tệ hơn khi tranh chấp cực cao. 49.999 lần `UPDATE` thất bại rồi tất cả cùng thử lại, sóng retry đè lên nhau và tỷ lệ thành công càng giảm. Đó là livelock: ai cũng bận rộn mà không ai tiến được. Khoá lạc quan tốt khi tranh chấp **thấp** và logic có nhiều bước.

**H: Khách bấm mua rồi bỏ đi thì sao?**
Không trừ kho ngay mà **giữ chỗ có thời hạn**: bảng `inventory_holds` với cột `het_han`, tồn kho khả dụng = tồn kho vật lý trừ số đang giữ chưa hết hạn. Thanh toán xong thì trừ kho thật và xoá hold; huỷ thì xoá hold ngay; hết hạn thì job dọn. Và mọi request phải có idempotency key để khách bấm lại năm lần vẫn chỉ tạo một đơn.

**H: Còn cách nào đúng tuyệt đối không?**
Tuần tự hoá hoàn toàn: đẩy mọi request vào hàng đợi, một consumer duy nhất xử lý tuần tự. Không có tranh chấp nào vì chỉ có một người ghi. Đây là cách các sàn lớn thực sự làm. Cái giá là trải nghiệm đổi từ "kết quả tức thì" sang "đã nhận đơn, sẽ báo sau", cộng toàn bộ độ phức tạp của hệ bất đồng bộ.

## Tóm tắt bài 1

- Nguồn gốc oversell là **kẽ hở giữa đọc và ghi** — lost update ở quy mô hàng chục nghìn request.
- Thứ tự nên thử: **ghi nguyên tử có điều kiện** (`WHERE ton_kho >= 1 RETURNING`) → khoá bi quan → khoá lạc quan. Cộng `CHECK (ton_kho >= 0)` để luật nằm trong dữ liệu.
- Ở quy mô flash sale, `FOR UPDATE` **đúng dữ liệu nhưng sập hệ thống** (hàng đợi dài, cạn pool); khoá lạc quan thì **livelock**.
- Lời giải kiến trúc là **đừng để 50.000 request chạm database**: lọc bằng CDN → rate limit → bộ đếm Redis `DECR` nguyên tử → database.
- **Redis là bộ lọc, database là chân lý cuối cùng** — luôn hoàn lại chỗ giữ khi lỗi và có job đối soát.
- Ba thứ đi kèm bắt buộc: **khoá theo thứ tự cố định** (chống deadlock), **idempotency key** (khách luôn bấm lại), và **reservation có hạn** (khách bỏ đi giữa chừng).

**Bài kế tiếp** → [Bài 2: Market basket và giá vốn hàng bán FIFO](02-market-basket-va-gia-von-hang-ban-fifo.md)
