# Bài 2: SET và GET — hai lệnh cơ bản nhất

Hai lệnh đầu tiên ai cũng học. Nhưng `SET` ẩn chứa rất nhiều quyền lực — có hơn **10 option**. Bài này tập trung vào dạng cơ bản nhất; các option nâng cao sẽ ở bài kế tiếp.

## Cú pháp tối thiểu

```text
SET key value
GET key
```

### Ví dụ chạy thực

```text
127.0.0.1:6379> SET message "Hi there"
OK
127.0.0.1:6379> GET message
"Hi there"
127.0.0.1:6379> GET nokey
(nil)
```

- `SET` trả `OK` khi thành công.
- `GET` trả **value** nếu key tồn tại, hoặc `(nil)` nếu không.

> `(nil)` ở redis-cli, trong client library sẽ là `null` (JS), `None` (Python), `nil` (Go), `Optional.empty()` (Java)...

## Dưới mui xe — chuyện gì xảy ra?

```text
1. Client gõ: SET message "Hi there"

2. Client mã hoá RESP:
   *3\r\n$3\r\nSET\r\n$7\r\nmessage\r\n$8\r\nHi there\r\n

3. Server đọc, parse RESP.

4. Server tra command table → tìm hàm setCommand().

5. setCommand() làm:
   - tạo (hoặc tìm) entry "message" trong dictionary chính.
   - gán value là object string "Hi there" (8 byte).
   - đánh dấu DB "dirty" (cho persistence).

6. Server reply: +OK\r\n

7. Client decode: "OK".
```

Toàn bộ quá trình thường mất **vài chục micro giây** ở server + một round-trip mạng.

## Value là gì? — binary-safe string

Redis gọi value của SET là **string**, nhưng "string" ở Redis = **chuỗi byte tuỳ ý**, không bắt buộc UTF-8.

Có nghĩa là bạn có thể lưu:

```text
SET name "Alice"                  # text bình thường
SET age "30"                      # số được lưu như text "30"
SET flag "true"                   # boolean cũng là text
SET html "<html>...</html>"       # cả văn bản dài
SET json "{\"a\":1}"              # JSON serialized
SET image <binary bytes>          # ảnh nhỏ, byte raw
```

Giới hạn: **512 MB / value** (cấu hình được, nhưng đừng làm vậy — sẽ rất chậm).

> Khi gửi binary qua redis-cli, dùng `redis-cli -x` (stdin) hoặc gửi từ code: client lib tự xử lý byte. Trong RESP, bulk string `$N\r\n<N bytes>\r\n` là binary-safe.

### "Số" bên trong Redis vẫn là string

Quan sát quan trọng — Redis **không có** type "integer" riêng cho value SET:

```text
SET age 30          # "30" được lưu là string 2 byte "30"
GET age             # → "30" (string)
TYPE age            # → string
```

Khi bạn dùng `INCR` trên một key, Redis parse string thành integer, +1, rồi serialize lại thành string. Sẽ học chi tiết ở [Bài 7](07-lam-viec-voi-so.md).

## Ghi đè và idempotency

`SET` **luôn ghi đè** value cũ, **xoá luôn TTL cũ** (trừ khi dùng option `KEEPTTL` — bài kế tiếp).

```text
SET color red
GET color           # "red"
SET color green
GET color           # "green"

# TTL bị reset:
SET key1 val1 EX 100
TTL key1            # 100
SET key1 val2       # KHÔNG có EX → TTL biến mất
TTL key1            # -1 (không expire)
```

> Quan sát quan trọng cho cache: nếu bạn cập nhật cache bằng `SET key newvalue` mà **quên** thêm lại `EX`, cache sẽ tồn tại vĩnh viễn → leak memory. Bài 3 + 4 sẽ giải quyết.

## Khoảng trắng và quote trong redis-cli

Khi giá trị **không** có khoảng trắng, không cần quote:

```text
SET color red
```

Khi giá trị **có** khoảng trắng hoặc ký tự đặc biệt, **phải quote**:

```text
SET msg "Hello world"
SET msg 'Hello world'
```

Dấu nháy đơn / nháy đôi đều dùng được. Nếu chuỗi chứa nháy đơn, dùng nháy đôi bên ngoài:

```text
SET news "Today's headlines"
```

Trong code (lib), bạn pass string thẳng — lib lo escape.

## Tài liệu chính thức — đọc sao cho đúng

Mở [redis.io/docs/latest/commands/set/](https://redis.io/docs/latest/commands/set/). Header trông như:

```text
SET key value [NX | XX] [GET] [EX seconds | PX milliseconds |
    EXAT unix-time-seconds | PXAT unix-time-milliseconds | KEEPTTL]
```

**Cách đọc**:

| Ký hiệu | Ý nghĩa |
|---|---|
| `SET`, `NX`, `XX`, `GET`, `EX` (in HOA) | **Keyword** — gõ chính xác |
| `key`, `value`, `seconds` (chữ thường) | **Placeholder** — bạn thay bằng giá trị thật |
| `[...]` | Optional, có thể có hoặc không |
| `\|` (pipe) | "Hoặc" — chọn 1 trong các option phân tách bằng `\|` |

Ví dụ: `SET color red EX 60` → keyword SET, key=color, value=red, option EX với seconds=60.

### Quy tắc đọc thêm cho lệnh phức tạp

```text
ZADD key [NX | XX | GT | LT] [CH] [INCR] score member [score member ...]
```

- `[NX | XX | GT | LT]` — chọn tối đa 1.
- `[CH]` — flag bật/tắt.
- `[INCR]` — flag bật/tắt.
- `score member [score member ...]` — bắt buộc 1 cặp, có thể lặp.

Trên trang doc còn có:
- **Examples** — cách dùng cụ thể.
- **Time complexity** — O(...) của lệnh; ví dụ SET là O(1), ZRANGE là O(log N + M).
- **Return value** — dạng kết quả: simple string / bulk string / integer / array / nil.
- **History** — option thêm/bỏ ở version nào.

> Doc Redis **đáng tin và đầy đủ**. Bookmark trang `/commands/` và lọc theo group khi cần.

## SET với binary data (ví dụ Node.js)

Trong app thực, lưu binary thường gặp:

```js
import { createClient } from 'redis';
const client = createClient({ url: 'redis://localhost:6379' });
await client.connect();

// Lưu một Buffer binary
const buf = Buffer.from([0xff, 0x00, 0x12, 0xab]);
await client.set('binary:icon', buf);

// Đọc về (đặt cờ returnBuffers nếu cần Buffer chính xác)
const back = await client.get('binary:icon');
console.log(back);     // chuỗi byte
```

> Một số client mặc định **decode UTF-8** → có thể làm hỏng binary. Cấu hình `binary` / `Buffer` mode khi cần — đọc doc của client bạn dùng.

## Pattern phổ biến: cache-aside dùng SET/GET

Mô hình kinh điển nhất:

```text
def get_user(id):
    cached = redis.GET(f"user:{id}")
    if cached is not None:
        return decode(cached)         # cache hit

    user = db.query("SELECT * FROM users WHERE id=?", id)
    redis.SET(f"user:{id}", encode(user), EX=300)   # cache 5 phút
    return user
```

3 hành vi chính:
- **Hit**: lấy từ Redis → trả ngay, không động vào DB.
- **Miss**: lấy từ DB → cache lại → trả.
- **Invalidate**: khi update user, cần `DEL user:{id}` hoặc set value mới.

Sẽ làm pattern này thật ở phase-3.

## Khi nào SET là không đủ?

Nếu bạn thấy mình:

- Lưu một JSON object mà sau đó chỉ cập nhật vài field → dùng **Hash** (HSET) sẽ hiệu quả hơn.
- Muốn ngăn ghi đè (chỉ ghi nếu chưa có) hoặc chỉ ghi nếu đã có → dùng option `NX`/`XX` (bài 3).
- Muốn tăng giảm số → dùng `INCR`/`INCRBY` thay vì `SET` (bài 7).
- Cần đặt expiration → dùng `EX`/`PX` ngay trong SET (bài 3, 4).
- Muốn đọc/ghi nhiều key cùng lúc → dùng `MGET`/`MSET` (bài 5) hoặc **pipeline**.

## Tóm tắt bài 2

- `SET key value` luôn ghi đè, là atomic, độ phức tạp O(1).
- `GET key` trả value hoặc nil.
- Value là **chuỗi byte tuỳ ý** (binary-safe), tối đa 512 MB.
- "Số" được lưu như string, nhưng có lệnh số chuyên (INCR...) dùng vẫn được.
- Cách đọc doc Redis: HOA = keyword, thường = placeholder, `[]` = optional, `|` = chọn một.
- Pattern cache-aside là dùng chính của SET/GET.

**Bài kế tiếp** → [Bài 3: Các option của SET — NX, XX, GET, KEEPTTL, EX/PX/EXAT/PXAT](03-set-options.md)
