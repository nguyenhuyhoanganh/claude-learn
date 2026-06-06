# Bài 67: Sửa field & truyền struct vào hàm — 4 cách nhận struct

Struct đã tạo, giờ cần **sửa** field và **truyền** struct cho hàm xử lý. Sửa field cần `mut` (toàn struct, không sửa lẻ field được). Truyền struct vào hàm lại đụng ownership y như String (phase 6) — và có đúng **4 cách** nhận: value/reference × immutable/mutable. Nắm bốn cách này là nền cho cả phương thức (bài 70).

## Sửa field: cần `mut` toàn struct

Ghi đè field bằng `instance.field = value`, nhưng instance phải **`mut`**:

```rust
fn main() {
    let mut beverage = Coffee {
        name: String::from("Mocha"),
        price: 4.99,
        is_hot: false,
    };

    beverage.name = String::from("Caramel Macchiato");   // ghi đè field
    beverage.price = 6.99;
    beverage.is_hot = true;

    println!("{} giá {}", beverage.name, beverage.price);
}
```

Ba điểm quan trọng:
- **`mut` ở instance/biến**, không phải ở định nghĩa struct. Blueprint **không** có khái niệm mutable — một type có cả instance mutable lẫn immutable.
- **Tất cả hoặc không**: cả struct mutable hoặc cả struct immutable. **Không** có sửa-lẻ-từng-field (không thể một field mutable, field khác immutable).
- Ghi đè field String → field thành owner của String mới; String cũ tự được dọn.

## Struct làm return value của hàm

Struct là type bình thường → trả về từ hàm được. (Lưu ý: định nghĩa struct phải ở **file level**, ngoài hàm, để mọi hàm dùng được.)

```rust
struct Coffee { name: String, price: f64, is_hot: bool }

fn make_coffee(name: String, price: f64, is_hot: bool) -> Coffee {
    Coffee { name: name, price: price, is_hot: is_hot }   // tạo & trả về (implicit)
}

fn main() {
    let coffee = make_coffee(String::from("Latte"), 4.99, true);
    println!("{}", coffee.name);     // Latte
}
```

`make_coffee` nhận ba giá trị, dựng `Coffee`, trả về (implicit return, không `;`). Ownership của String di chuyển: biến → parameter → field → trả ra cùng struct về caller. (Bài 68 sẽ rút gọn `name: name` thành `name`; bài 72 cho cách idiomatic hơn — associated function `new`.)

## 4 cách truyền struct vào hàm

Đây là phần cốt lõi. Hàm nhận struct có đúng **4** cách — tổ hợp value/reference × immutable/mutable:

```text
fn f(coffee: Coffee)        → value, immutable: LẤY ownership, chỉ đọc
fn f(mut coffee: Coffee)    → value, mutable:   LẤY ownership, sửa được
fn f(coffee: &Coffee)       → reference, immutable: MƯỢN, chỉ đọc
fn f(coffee: &mut Coffee)   → reference, mutable:   MƯỢN, sửa được
```

### Cách 1: `Coffee` — lấy ownership, chỉ đọc

```rust
fn drink_coffee(coffee: Coffee) {
    println!("Uống {}", coffee.name);
    // coffee.is_hot = false;        // ERROR — immutable
}

fn main() {
    let mocha = Coffee { /* ... */ };
    drink_coffee(mocha);             // MOVE: mocha → coffee
    // println!("{}", mocha.name);  // ERROR — mocha đã move
}
# struct Coffee { name: String, price: f64, is_hot: bool }
```

Ownership **move** từ `mocha` sang `coffee`. Cuối hàm `coffee` dọn struct → `mocha` vô hiệu, struct biến mất. Parameter immutable → chỉ đọc.

### Cách 2: `mut Coffee` — lấy ownership, sửa được

```rust
fn drink_coffee(mut coffee: Coffee) {
    coffee.is_hot = false;           // OK — mutable
}
```

Như cách 1 (move ownership) nhưng `mut` cho phép sửa field. Vẫn mất `mocha` sau lời gọi.

### Cách 3: `&Coffee` — mượn, chỉ đọc

```rust
fn drink_coffee(coffee: &Coffee) {
    println!("Uống {}", coffee.name);    // Rust tự deref khi dùng .
}

fn main() {
    let mocha = Coffee { /* ... */ };
    drink_coffee(&mocha);            // mượn — KHÔNG move
    println!("{}", mocha.price);     // OK — mocha vẫn owner
}
# struct Coffee { name: String, price: f64, is_hot: bool }
```

`&Coffee` = reference (mượn). Ownership **không** move — `mocha` vẫn owner sau lời gọi. Đọc field được, sửa không. Rust **tự dereference** khi dùng `.` (nhắc lại bài 48) — `coffee.name` chạy dù `coffee` là `&Coffee`.

### Cách 4: `&mut Coffee` — mượn, sửa được

```rust
fn drink_coffee(coffee: &mut Coffee) {
    coffee.price = 10.99;            // sửa qua mutable reference
    coffee.is_hot = false;
}

fn main() {
    let mut mocha = Coffee { /* ... */ };   // owner phải mut
    drink_coffee(&mut mocha);        // mượn mutable
    println!("{}", mocha.price);     // 10.99 — mocha vẫn owner, đã sửa
}
# struct Coffee { name: String, price: f64, is_hot: bool }
```

`&mut Coffee` mượn + sửa. Ownership không move, nhưng sửa được struct gốc. Owner (`mocha`) phải `mut` để tạo `&mut`.

## Bảng tổng 4 cách

| Cú pháp | Ownership | Sửa? | Sau lời gọi | Khi dùng |
|---|---|---|---|---|
| `Coffee` | move | Không | mất biến gốc | Hàm **tiêu thụ** struct |
| `mut Coffee` | move | Có | mất biến gốc | Tiêu thụ + sửa bản của mình |
| `&Coffee` | mượn | Không | biến gốc còn | **Chỉ đọc** (phổ biến) |
| `&mut Coffee` | mượn | Có | biến gốc còn | **Sửa tại chỗ** (phổ biến) |

## Quy tắc chọn: ưu tiên reference

Như phase 6-7, **ưu tiên reference** (cách 3, 4):
- Chỉ đọc → `&Coffee`.
- Cần sửa → `&mut Coffee`.
- Lấy ownership (cách 1, 2) chỉ khi hàm thực sự **tiêu thụ** struct — vì nếu không return lại, struct mất; nhiều hàm cùng cần thì phải return-gán-lại liên tục (vấn đề scale, bài 51).

```rust
// Idiomatic: đọc thì &, sửa thì &mut
fn print_coffee(c: &Coffee) { println!("{}", c.name); }
fn heat_up(c: &mut Coffee) { c.is_hot = true; }
# struct Coffee { name: String, price: f64, is_hot: bool }
```

Struct là argument tuyệt vời: thay vì 3 parameter rời, gói thành 1 — một type, nhiều field bên trong.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Sửa field mà quên `mut` instance | Compile error | `let mut` |
| Mong sửa lẻ một field | Không được | Cả struct mutable hoặc không |
| Dùng biến sau khi truyền `Coffee` vào hàm | move error | Truyền `&`/`&mut` |
| Tạo `&mut` từ owner immutable | Compile error | `let mut` owner |
| Định nghĩa struct trong `main` rồi dùng nơi khác | Scope giới hạn | Định nghĩa file level |
| Truyền `&` vào nơi cần `&mut` | Mismatch | Khớp đúng quyền |

## Tóm tắt bài 67

- Sửa field: `instance.field = value`, cần **`mut` toàn struct** (không sửa lẻ field; mutable là của instance, không phải blueprint).
- Struct là type → trả về từ hàm được; định nghĩa struct ở **file level**.
- **4 cách** nhận struct: `Coffee` / `mut Coffee` (move) và `&Coffee` / `&mut Coffee` (mượn).
- Move (value) → mất biến gốc; reference → biến gốc còn; Rust tự deref khi dùng `.`.
- **Ưu tiên reference**: `&` đọc, `&mut` sửa; value chỉ khi tiêu thụ struct.
- Nền cho phương thức (bài 70): `self` cũng có đúng 4 dạng này.

**Bài kế tiếp** → [Bài 68: Cú pháp rút gọn & struct update — `field` shorthand, `..` spread](03-shorthand-va-update.md)
