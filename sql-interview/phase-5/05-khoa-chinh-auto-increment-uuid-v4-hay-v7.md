# Bài 5: Khoá chính — auto increment, UUID v4 hay v7?

3 giờ sáng, hệ thống thanh toán khựng lại. Độ trễ p99 vọt từ 40 ms lên 5 giây. Đơn hàng dồn, khách bỏ đi. Kỹ sư trực đêm lật tung mọi thứ: CPU ổn, RAM ổn, mạng ổn, không ai deploy gì.

Thủ phạm nằm ở nơi không ai ngờ: **chính cột khoá chính của bảng**.

Bảng đó dùng `UUID v4` làm khoá chính. Suốt hai năm nó chạy êm — vì index còn nằm gọn trong RAM. Đêm đó, index vừa vượt qua kích thước bộ nhớ đệm.

Đây là câu hỏi phỏng vấn ba tầng, và tầng nào cũng có người ngã.

## Tầng 1: khác biệt cơ bản

| | Auto increment (`BIGSERIAL` / `IDENTITY`) | UUID v4 |
|---|---|---|
| Cách sinh | Database cấp số kế tiếp | Client tự sinh, 122 bit ngẫu nhiên |
| Trùng lặp | Không, trong phạm vi một database | Xác suất ~0 trên toàn cầu |
| Cần hỏi database trước khi ghi | **Có** | Không |
| Kích thước | 8 byte | 16 byte (nhị phân) / 36 byte (chuỗi) |
| Đoán được ID kế tiếp | **Có** | Không |
| Sinh ở nhiều máy song song | Cần điều phối | Tự nhiên |

Đáp án tầng 1 mà ai cũng nói: *"Em chọn UUID vì nó không trùng, sinh ở đâu cũng được, không phải hỏi database trước."* Đúng — và người phỏng vấn sẽ gật đầu rồi hỏi tiếp.

## Tầng 2: "chỉ tốn đĩa thôi mà" — chỗ đáp án tầng 1 chết

Đĩa rẻ, chuyện đó không ai cãi. Nhưng **cái đắt của UUID v4 chưa bao giờ nằm ở đĩa**. Nó nằm ở cách B+Tree ghi dữ liệu.

```text
AUTO INCREMENT — id luôn tăng, luôn ghi vào TRANG CUỐI

  [1..100][101..200][201..300][301..400]
                                    ▲
                            luôn chèn vào đây
   • Trang này đang nằm sẵn trong bộ nhớ đệm (buffer pool)
   • Không phải đọc đĩa
   • Trang đầy thì mở trang mới, các trang cũ đầy 100%
   → Ghi tuần tự (sequential write), rẻ nhất có thể


UUID v4 — id ngẫu nhiên, ghi vào KHẮP NƠI

  [0a3f..][2b71..][5e09..][8c44..][b1d2..][f907..]
      ▲               ▲                ▲
    chèn            chèn             chèn      ... rải đều toàn cây
   • Trang đích thường KHÔNG có trong bộ nhớ đệm → phải đọc từ đĩa trước
   • Trang đầy → TÁCH ĐÔI (page split), hai trang mới chỉ đầy ~50%
   • Index phình to ~1,5–2 lần vì các trang đầy nửa vời
   → Ghi ngẫu nhiên (random write), đắt nhất có thể
```

Đây là **ngưỡng lật** — điều mà chỉ người từng đo mới nói được:

```text
Index còn nằm gọn trong RAM (shared_buffers / innodb_buffer_pool)
   → Hai bên gần như bằng nhau. Đo mãi không ra khác biệt.

Index vượt quá RAM
   → Mỗi lần chèn UUID v4 là một lần đọc đĩa ngẫu nhiên.
   → Thông lượng ghi tụt 2–5 lần, có báo cáo tới 10 lần.
```

Đó chính xác là chuyện xảy ra lúc 3 giờ sáng. Không ai đổi gì. Index chỉ vừa lớn hơn RAM.

Còn hai chi phí nữa hay bị bỏ quên:

**① WAL amplification.** PostgreSQL ghi nhật ký trước (*Write-Ahead Log*). Page split sinh ra full-page write, nên lượng WAL của UUID v4 có thể gấp vài lần auto increment. WAL nhiều hơn nghĩa là replica chạy chậm hơn, backup lớn hơn.

**② Chi phí lan sang mọi index phụ.** Trong InnoDB, khoá chính được nhúng vào **mọi** secondary index. Khoá chính 36 byte dạng chuỗi × 6 index phụ = 216 byte thừa mỗi dòng, chưa kể phần khoá chính trong bảng.

```sql
-- ❌ Sai lầm phổ biến nhất: lưu UUID dưới dạng chuỗi
id VARCHAR(36)     -- 36 byte + tiền tố, so sánh theo chuỗi (chậm)
id CHAR(36)        -- 36 byte cố định

-- ✅ Đúng
id UUID            -- PostgreSQL: 16 byte nhị phân, có kiểu riêng
id BINARY(16)      -- MySQL: 16 byte
```

MySQL 8 có sẵn hàm chuyển đổi, và cờ `swap_flag` rất quan trọng:

```sql
-- swap_flag = 1: đảo phần time-low lên đầu → UUID v1 trở nên tăng dần
INSERT INTO t (id) VALUES (UUID_TO_BIN(UUID(), 1));
SELECT BIN_TO_UUID(id, 1) FROM t;
```

## Tầng 3: "hệ thống có 4 dịch vụ cùng ghi vào bảng đó thì chọn gì?"

Đây là chỗ đáp án tầng 2 chết. Tầng 2 vừa chê UUID v4 ghi chậm — nhưng ở đây auto increment **không dùng nổi**, vì không có ai đứng ra phát số cho 4 dịch vụ độc lập.

Lối ra không phải bỏ UUID. Lối ra là **bắt UUID xếp hàng theo thời gian**.

### UUID v7: có thứ tự, vẫn phân tán

```text
UUID v4 (RFC 4122) — 122 bit ngẫu nhiên thuần
  f47ac10b-58cc-4372-a567-0e02b2c3d479
  └───────── không có trật tự nào ─────────┘

UUID v7 (RFC 9562, chuẩn hoá 2024) — thời gian ở đầu
  018f4d2c-9a1b-7000-8000-1a2b3c4d5e6f
  └──── 48 bit timestamp ms ────┘└─ ngẫu nhiên ─┘
   ▲
   Sinh ở 4 máy khác nhau → vẫn tự xếp đúng thứ tự thời gian
   → Ghi vào trang cuối như auto increment
   → Không page split, index gọn
```

Đo thực tế trên bảng lớn (index vượt RAM), UUID v7 cho thông lượng ghi **cao gấp 2–3 lần** UUID v4, và kích thước index nhỏ hơn đáng kể.

```sql
-- PostgreSQL 18+ có sẵn
SELECT uuidv7();

-- PostgreSQL cũ hơn: dùng extension pg_uuidv7, hoặc hàm tự viết
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid AS $$
DECLARE
    unix_ts_ms BYTEA;
    uuid_bytes BYTEA;
BEGIN
    unix_ts_ms := substring(int8send((extract(epoch FROM clock_timestamp()) * 1000)::bigint)
                            FROM 3);
    uuid_bytes := unix_ts_ms || gen_random_bytes(10);
    -- đặt version = 7 (4 bit cao của byte 7)
    uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
    -- đặt variant = RFC 4122 (2 bit cao của byte 9)
    uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
    RETURN encode(uuid_bytes, 'hex')::uuid;
END $$ LANGUAGE plpgsql VOLATILE;
```

### Nhưng UUID v7 không miễn phí — ba rủi ro mới

**① Lộ thời điểm tạo.** Bất kỳ ai cầm ID đều đọc ngược ra được bản ghi tạo lúc mấy giờ, chính xác tới mili giây.

```text
Hậu quả thật:
  • Đối thủ đếm được số đơn hàng bạn tạo mỗi ngày (tạo 2 đơn cách nhau 24h,
    trừ timestamp trong ID → biết bạn tạo bao nhiêu đơn ở giữa)
  • Lộ thời điểm người dùng đăng ký, thời điểm giao dịch
  • Vi phạm yêu cầu privacy trong một số ngành
```

**Cách chữa — dùng ID hai lớp:**

```sql
CREATE TABLE orders (
    order_id     UUID PRIMARY KEY DEFAULT uuid_generate_v7(),  -- nội bộ, ghi nhanh
    public_id    UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(), -- v4, phơi ra ngoài
    ...
);
```

Nhanh mà vẫn kín. Đây là câu trả lời làm người phỏng vấn ghi thêm một dòng.

**② Điểm nóng khi chia mảnh (hot shard).** Nếu bạn shard theo tiền tố của ID, mọi bản ghi tạo cùng lúc đều rơi vào **cùng một shard** — đúng thứ sharding sinh ra để tránh. UUID v4 thì rải đều tự nhiên.

**③ Vẫn không sắp xếp được chính xác trong cùng mili giây.** Hai ID sinh trong cùng một mili giây chỉ khác nhau phần ngẫu nhiên, nên `ORDER BY id` không đảm bảo đúng thứ tự thật. Đừng dùng ID thay cho cột `created_at`.

### Các lựa chọn khác trong họ "ID có thứ tự"

| Loại | Bit | Đặc điểm |
|---|---|---|
| **ULID** | 128 | Giống v7, mã hoá Base32 26 ký tự (đọc/copy dễ hơn) |
| **Snowflake** (Twitter) | 64 | timestamp + machine_id + sequence. Gọn bằng `BIGINT`, cần cấp `machine_id` |
| **KSUID** | 160 | timestamp giây + 128 bit ngẫu nhiên |
| **UUID v1** | 128 | timestamp + MAC address — **lộ địa chỉ MAC**, tránh dùng |
| **NanoID** | tuỳ | Chuỗi URL-safe ngắn, không có thứ tự |

Snowflake đáng chú ý vì nó là **64 bit** — bằng đúng `BIGINT`, nên giữ được mọi ưu thế kích thước của auto increment mà vẫn sinh được ở nhiều máy. Cái giá: phải có cơ chế cấp `machine_id` duy nhất cho mỗi tiến trình (thường qua ZooKeeper/etcd hoặc pod ordinal của StatefulSet).

## Đào sâu: khoá chính không chỉ là ID

Ba khái niệm hay bị trộn lẫn, và phân biệt được là ghi điểm ngay:

```text
SURROGATE KEY (khoá thay thế)  — số/UUID vô nghĩa, do hệ thống sinh
                                  order_id = 1042
NATURAL KEY (khoá tự nhiên)     — dữ liệu nghiệp vụ có sẵn tính duy nhất
                                  email, số CCCD, mã sản phẩm SKU
COMPOSITE KEY (khoá ghép)       — nhiều cột cùng tạo nên định danh
                                  PRIMARY KEY (order_id, product_id)
```

**Vì sao nên dùng surrogate key làm khoá chính, kể cả khi đã có natural key:**

- Natural key **thay đổi**. Email đổi, số CCCD đổi khi cấp lại, SKU đổi khi tái cấu trúc danh mục. Khoá chính đổi nghĩa là mọi khoá ngoại trỏ tới nó đều phải cập nhật theo.
- Natural key thường **dài**, và trong InnoDB nó bị nhúng vào mọi index phụ.
- Natural key có thể **lộ dữ liệu cá nhân** nếu bị phơi ra URL.

Nhưng **vẫn phải đặt `UNIQUE` cho natural key** — nếu không bạn có hai khách hàng cùng email và không có gì ngăn được.

```sql
CREATE TABLE customers (
    customer_id BIGSERIAL PRIMARY KEY,      -- surrogate: bền, gọn
    email       TEXT NOT NULL UNIQUE,       -- natural: vẫn phải ràng buộc
    ...
);
```

### Clustered index: vì sao vấn đề này ở MySQL nặng hơn Postgres

```text
InnoDB (MySQL) — CLUSTERED: dữ liệu THẬT nằm ở lá của cây khoá chính
   → khoá chính ngẫu nhiên = dữ liệu bảng cũng bị ghi ngẫu nhiên
   → khoá chính bị nhúng vào MỌI index phụ
   → tác động của UUID v4 rất nặng

PostgreSQL — HEAP: dữ liệu nằm ở heap riêng, index chỉ trỏ tới (ctid)
   → khoá chính ngẫu nhiên chỉ làm hỏng index của chính nó
   → nhẹ hơn, nhưng vẫn có page split và WAL amplification
```

Nói cách khác: **UUID v4 làm khoá chính trên MySQL đau hơn trên PostgreSQL nhiều lần.** Đây là chi tiết cho thấy bạn hiểu tới tầng lưu trữ.

## Cây quyết định

```text
Bạn có cần sinh ID ở NGOÀI database không?
  (nhiều dịch vụ ghi song song / client sinh ID offline / merge nhiều nguồn)
        │
        ├── KHÔNG ──► BIGINT GENERATED ALWAYS AS IDENTITY
        │             (đừng phức tạp hoá cái đang chạy tốt)
        │
        └── CÓ ─────► Có cần ID không đoán được / không lộ thời gian
                      khi phơi ra ngoài không?
                            │
                            ├── KHÔNG ──► UUID v7 (hoặc ULID / Snowflake)
                            │
                            └── CÓ ─────► UUID v7 nội bộ + UUID v4 public
                                          (hoặc slug ngẫu nhiên riêng)
```

Với auto increment, ưu tiên cú pháp chuẩn SQL thay vì `SERIAL`:

```sql
-- Cũ (Postgres riêng): SERIAL tạo sequence "rời rạc", dễ mất quyền, dễ ghi đè
id SERIAL PRIMARY KEY

-- Mới, chuẩn SQL (PG 10+), nên dùng:
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
--        ▲ ALWAYS: chặn luôn việc ứng dụng tự chèn id, tránh lệch sequence
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Lưu UUID dưới dạng `VARCHAR(36)` | Gấp 2,25 lần kích thước, so sánh chuỗi chậm | `UUID` (PG) / `BINARY(16)` (MySQL) |
| UUID v4 làm khoá chính bảng ghi nhiều | Page split, index phình, ghi chậm vài lần khi vượt RAM | UUID v7 hoặc auto increment |
| UUID v4 trên InnoDB | Nặng hơn Postgres vì clustered + nhúng vào mọi index phụ | Cân nhắc rất kỹ |
| Dùng `ORDER BY uuid_v7` thay `created_at` | Cùng mili giây thì thứ tự sai | Luôn sắp theo cột thời gian thật |
| Phơi UUID v7 ra API công khai | Lộ thời điểm tạo, đếm được lưu lượng | Tách `public_id` v4 |
| Shard theo tiền tố UUID v7 | Hot shard — mọi bản ghi mới vào một mảnh | Shard theo hash của ID hoặc theo tenant |
| Dùng natural key (email) làm khoá chính | Email đổi → cập nhật lan khắp FK | Surrogate PK + `UNIQUE` cho natural key |
| `SERIAL` thay vì `IDENTITY` | Ứng dụng chèn id thủ công → sequence lệch → duplicate key | `GENERATED ALWAYS AS IDENTITY` |
| Dùng `INT` cho khoá chính | Trần 2,1 tỷ (xem bài 2) | `BIGINT` |
| UUID v1 | Lộ địa chỉ MAC của máy chủ | v4 hoặc v7 |

## Câu hỏi phỏng vấn hay gặp

**H: Bảng đơn hàng này, khoá chính chọn UUID hay auto increment?**
Em hỏi lại: **ID có cần sinh ở ngoài database không?** Nếu chỉ một dịch vụ ghi thì `BIGINT IDENTITY` — gọn nhất, ghi tuần tự, không có lý do phức tạp hoá. Nếu nhiều dịch vụ ghi song song thì UUID, nhưng là **v7 dạng nhị phân**, không phải v4 dạng chuỗi.

**H: UUID chỉ tốn đĩa thôi mà, đúng không?**
Không, đĩa là phần rẻ nhất. Cái đắt là **ghi ngẫu nhiên vào B+Tree**: UUID v4 rơi vào khắp cây, gây page split và làm trang chỉ đầy nửa vời, nên index phình 1,5–2 lần. Ngưỡng lật là khi index vượt RAM — dưới ngưỡng đo mãi không ra khác biệt, trên ngưỡng thì thông lượng ghi tụt vài lần. Trên InnoDB còn nặng hơn vì khoá chính được nhúng vào mọi index phụ.

**H: UUID v7 hoàn hảo vậy sao chưa ai bỏ v4?**
Vì chính cái timestamp tiện lợi đó mở ra ba rủi ro: lộ thời điểm tạo (đối thủ đếm được lưu lượng của bạn), gây hot shard khi chia mảnh theo tiền tố, và không sắp xếp chính xác trong cùng mili giây. Cách em hay dùng là v7 làm khoá nội bộ để ghi nhanh, và một cột `public_id` v4 riêng để phơi ra ngoài.

**H: `SERIAL` và `IDENTITY` khác gì?**
`SERIAL` là cú pháp riêng của Postgres, tạo một sequence rời rạc mà ứng dụng vẫn chèn id thủ công vào được — dẫn tới lệch sequence và duplicate key sau này. `GENERATED ALWAYS AS IDENTITY` là chuẩn SQL, gắn sequence chặt vào cột và **chặn** việc chèn thủ công. Nên dùng cái sau.

**H: Có nên dùng email làm khoá chính không?**
Không. Natural key thay đổi được — email đổi thì mọi khoá ngoại trỏ tới phải cập nhật theo. Nó cũng dài và lộ dữ liệu cá nhân nếu phơi ra URL. Em dùng surrogate key làm khoá chính, nhưng **vẫn** đặt `UNIQUE` cho email để giữ ràng buộc nghiệp vụ.

## Tóm tắt bài 5

- Auto increment ghi **tuần tự** vào trang cuối; UUID v4 ghi **ngẫu nhiên** khắp cây → page split, index phình 1,5–2 lần, WAL nhiều hơn.
- **Ngưỡng lật là RAM**, không phải đĩa: dưới ngưỡng hai bên như nhau, trên ngưỡng UUID v4 tụt vài lần.
- UUID v4 trên **InnoDB** đau hơn Postgres nhiều, vì clustered index và vì khoá chính bị nhúng vào mọi index phụ.
- UUID **v7** đặt timestamp ở đầu → có thứ tự, ghi vào trang cuối, vẫn sinh được ở nhiều máy.
- Cái giá của v7: **lộ thời điểm tạo**, gây **hot shard**, không chính xác trong cùng mili giây → giải bằng cặp `internal v7 + public v4`.
- Luôn lưu UUID **dạng nhị phân** (`UUID` / `BINARY(16)`), dùng surrogate key làm PK và `UNIQUE` cho natural key, và dùng `IDENTITY` thay vì `SERIAL`.

**Bài kế tiếp** → [Bài 6: Ràng buộc — đặt luật vào trong dữ liệu, không vào trong trí nhớ](06-rang-buoc-constraint-luat-nam-trong-du-lieu.md)
