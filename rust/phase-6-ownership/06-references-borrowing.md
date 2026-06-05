# Bài 48: References & Borrowing — mượn giá trị không lấy quyền sở hữu, `&` và `*`

`clone` giải bài toán "dùng lại String" nhưng **đắt** — nhân đôi heap. Có cách rẻ hơn nhiều: thay vì sao chép giá trị hay chuyển ownership, ta **mượn** nó. **Reference** cho phép code dùng một giá trị **mà không lấy quyền sở hữu** — như mượn xe bạn dùng tạm rồi trả, bạn vẫn là chủ. Đây là công cụ giải quyết hầu hết "đau khổ" của ownership.

## Vấn đề và giải pháp: borrowing

Mỗi giá trị có một owner. Khi nhiều nơi cần dùng lại một String, hai lựa chọn đã biết đều có vấn đề:
- `clone` → nhân đôi heap, tốn memory.
- move → mất quyền dùng bản gốc.

**Reference** là lựa chọn thứ ba: dùng giá trị **không** move ownership, **không** copy. Hành động tạo reference gọi là **borrowing** (mượn).

```text
Như đời thực: mượn xe của bạn
  → tôi KHÔNG thành chủ xe
  → tôi dùng tạm rồi trả
  → bạn VẪN là chủ suốt quá trình
```

- **Reference** = danh từ (cái ta tạo ra) = một **địa chỉ** tới giá trị gốc.
- **Borrow** = động từ. "Borrow" trong Rust = tạo reference tới giá trị mà không lấy ownership.

## Toán tử `&` — tạo reference (borrow)

Dùng dấu **`&`** (ampersand, borrow operator) trước giá trị để tạo reference:

```rust
fn main() {
    let my_value = String::from("Toyota");
    let my_ref = &my_value;          // mượn — tạo reference tới my_value

    println!("{my_value}");          // OK — my_value VẪN là owner
    println!("{my_ref}");            // OK — reference cũng dùng được
}
```

`&my_value` lấy **địa chỉ** nơi String được lưu, gán vào `my_ref`. **Không** copy text, **không** move ownership. `my_value` vẫn là owner; `my_ref` chỉ "mượn".

```text
  my_value → [ptr,len,cap] ──> "Toyota" (heap)   ← OWNER
  my_ref   ────────────────────^               ← chỉ là địa chỉ tới my_value
```

So với clone: clone tạo text heap thứ hai; reference chỉ lưu một địa chỉ (rẻ hơn nhiều).

## Type của reference: `&String`, `&i32`

Reference có type riêng, khác type giá trị gốc — thêm `&` đằng trước:

```rust
let value = 2;
let r = &value;          // type của r là &i32 ("reference tới i32")

let s = String::from("hi");
let sr = &s;             // type của sr là &String
```

Đọc `&i32` = "địa chỉ dẫn tới một i32". `&` đọc là "địa chỉ dẫn tới". **`String` ≠ `&String`** — hai type khác nhau:

```text
String   = ngôi nhà thật (giá trị trên heap)
&String  = tờ giấy ghi địa chỉ ngôi nhà
```

`my_value` là owner của String; `my_ref` là owner của *reference* (tờ giấy địa chỉ) — không phải owner của String.

## Reference được với cả stack và heap

Thường mượn heap data (vì copy heap đắt), nhưng kỹ thuật reference được cả stack:

```rust
let n = 2;
let nref = &n;           // &i32 — mượn stack value (hợp lệ nhưng hiếm)

let s = String::from("Toyota");
let sref = &s;           // &String — mượn heap value (phổ biến)
```

Với stack data (i32) reference ít gặp — vì copy stack rẻ rồi, không cần mượn. Borrowing toả sáng với **heap data**, nơi tránh copy/move đáng giá.

## Toán tử `*` — dereference (đi theo địa chỉ)

Reference chứa địa chỉ, không phải giá trị. Để lấy **giá trị tại địa chỉ đó**, dùng toán tử **dereference** `*` (asterisk):

```rust
fn main() {
    let value = 2;
    let r = &value;
    println!("{}", *r);          // 2 — đi theo địa chỉ, lấy giá trị
}
```

`*r` = "lấy địa chỉ trong `r`, đi tới đó, lấy giá trị" → `2`. Dereference chỉ dùng được với **reference** (cần một địa chỉ để đi theo):

```rust
let x = 5;
println!("{}", *x);          // ERROR — x là i32, không phải reference, không deref được
```

```text
  &  : tạo reference (lấy địa chỉ)      value → &value
  *  : dereference (đi theo địa chỉ)    &value → *(&value) = value
```

`&` và `*` là hai chiều ngược nhau: `&` đóng gói thành địa chỉ, `*` mở ra lấy giá trị.

## Rust tự dereference khi in

Thử in reference **không** có `*`:

```rust
let value = 2;
let r = &value;
println!("{r}");             // 2 — KHÔNG phải địa chỉ!
```

Rust in `2`, không phải địa chỉ. Vì Rust implement Display cho reference sao cho nó **tự dereference** — đoán bạn muốn thấy giá trị, không phải địa chỉ thô. Tiện lợi này cho phép bỏ `*` trong hầu hết trường hợp (in ấn, gọi method). `*` tường minh ở đầu bài chính là việc Rust làm ngầm.

## Đào sâu: reference vs pointer — đảm bảo an toàn

Reference còn gọi là **pointer** (con trỏ) vì "trỏ" tới giá trị. Nhưng có khác biệt quan trọng:

| | Reference (Rust) | Pointer (C/ngôn ngữ khác) |
|---|---|---|
| Đảm bảo trỏ giá trị hợp lệ? | **Có** — luôn valid | Không — có thể trỏ vùng đã dọn |
| Nguy cơ | An toàn | Dangling pointer → bug, lỗ hổng |

Rust **đảm bảo** reference luôn trỏ tới giá trị hợp lệ suốt thời gian nó tồn tại. Nguyên tắc:

> **References must never outlive the referent** — reference không được sống lâu hơn giá trị nó trỏ tới.

```text
Reference  = địa chỉ ngôi nhà ĐẢM BẢO vẫn đứng đó
Pointer    = địa chỉ ngôi nhà CÓ THỂ đã bị phá (bãi đất trống)
```

Ở C, bạn có thể giữ con trỏ tới vùng nhớ đã giải phóng → đọc rác/crash/lỗ hổng. Rust compiler **chặn** điều này tại compile time — reference luôn dẫn tới data còn sống. (Bài về dangling references ở phase 7 đào sâu.)

## Use case thực tế: đọc data nhiều nơi không copy

```rust
fn main() {
    let config = String::from("server=localhost;port=8080");

    let r1 = &config;            // nhiều reference cùng đọc
    let r2 = &config;
    let r3 = &config;

    println!("{}", r1.len());    // dùng method qua reference
    println!("{}", r2.contains("8080"));
    println!("{r3}");
    // config VẪN là owner, không copy lần nào
}
```

Ba reference cùng đọc một String, **không** clone (không tốn heap), **không** move (config vẫn owner). Đây là cách reference giải quyết bài toán "dùng lại data" rẻ hơn clone. (Phase 7: quy tắc nhiều reference đọc vs ghi.)

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dereference giá trị thường (`*x` với x là i32) | Compile error | `*` chỉ dùng với reference |
| Nhầm `String` với `&String` | Type mismatch | Chúng là hai type khác |
| Tưởng reference copy giá trị | Chỉ là địa chỉ | Reference rẻ, không copy heap |
| Quên `&` khi muốn mượn | Move thay vì borrow | Thêm `&` để borrow |
| Tưởng phải luôn `*` để dùng | Rust tự deref khi in/gọi method | Bỏ `*` được hầu hết trường hợp |
| Reference tới giá trị đã chết | Rust chặn compile-time | (phase 7: dangling references) |

## Tóm tắt bài 48

- **Reference** = địa chỉ tới giá trị; **borrowing** = tạo reference mà **không** lấy ownership.
- **`&value`** tạo reference (borrow); rẻ hơn clone (không copy heap), không move (owner giữ nguyên).
- Type reference khác giá trị: `&String`, `&i32` ("địa chỉ dẫn tới...").
- **`*ref`** dereference — đi theo địa chỉ lấy giá trị; chỉ dùng được với reference.
- Rust **tự dereference** khi in/gọi method → bỏ `*` được hầu hết trường hợp.
- Reference Rust **đảm bảo** luôn trỏ giá trị hợp lệ (≠ pointer C có thể dangling) — an toàn compile-time.

**Bài kế tiếp** → [Bài 49: String, &String, str, &str — bốn type chuỗi và reference là Copy](07-string-str-variants.md)
