# Bài 81: Method trên enum — hành vi cho từng variant

Struct có method (phase 9); enum cũng vậy — cùng cú pháp `impl`, cùng `self`. Method trên enum thường kết hợp với `match` để xử lý hành vi **khác nhau cho từng variant**. Thay vì một function ngoài nhận enum làm tham số, ta đặt hành vi **trực tiếp lên enum** — gọn, nhất quán, mọi instance tự có. Đây là cách enum trở thành type giàu hành vi.

## `impl` cho enum — như struct

Định nghĩa method trong `impl EnumName { }`, y cú pháp struct (phase 9 bài 70):

```rust
enum LaundryCycle {
    Cold,
    Hot { temperature: u32 },
    Delicate(String),
}

impl LaundryCycle {                  // impl + tên enum
    fn wash(&self) {                 // method, tham số đầu self
        match self {                 // match trên self
            LaundryCycle::Cold => {
                println!("Giặt nước lạnh");
            }
            LaundryCycle::Hot { temperature } => {
                println!("Giặt ở {temperature} độ");
            }
            LaundryCycle::Delicate(fabric_type) => {
                println!("Giặt nhẹ cho {fabric_type}");
            }
        }
    }
}

fn main() {
    let cycle = LaundryCycle::Hot { temperature: 100 };
    cycle.wash();                    // gọi method trên instance
}
```

Mọi thứ giống struct: `impl LaundryCycle`, method có `self`, gọi `instance.method()`. Khác biệt: bên trong method, dùng `match self` để xử lý từng variant.

## `self` + `match` — pattern trung tâm

Method enum gần như luôn `match self` để rẽ nhánh theo variant. `self` là instance (Rust tự truyền khi gọi), `match self` kiểm tra nó là variant nào:

```text
fn wash(&self) {
    match self {              ← self = instance, match xem là variant nào
        Variant1 => ...,
        Variant2 => ...,
    }
}
```

Đây là cách enum biểu diễn "hành vi khác nhau tuỳ variant" gọn gàng: một method, `match` bên trong xử lý mọi trường hợp, compiler đảm bảo phủ đủ.

## 4 dạng `self` — như struct

`self` có đúng 4 dạng như struct (bài 70): `self`/`mut self` (value, move) và `&self`/`&mut self` (reference, mượn). Ưu tiên reference:

```rust
impl LaundryCycle {
    fn wash(&self) { /* đọc → &self */ }
    fn reset(&mut self) { /* sửa → &mut self */ }
}
# enum LaundryCycle { Cold }
```

`&self` (đọc, phổ biến nhất), `&mut self` (sửa). `self` value lấy ownership → consume enum (hiếm). Như struct.

## Quan trọng: `&self` cho reference dữ liệu kèm

Điểm tinh tế khi method dùng `&self` (mượn). Trích dữ liệu kèm trong `match self` thì dữ liệu là **reference**, không phải giá trị — vì enum chỉ được mượn, không cho move dữ liệu ra:

```rust
impl LaundryCycle {
    fn wash(&self) {                 // mượn &self
        match self {
            LaundryCycle::Delicate(fabric_type) => {
                // fabric_type là &String (reference), KHÔNG phải String
                println!("Giặt {fabric_type}");      // Rust tự deref khi dùng
            }
            LaundryCycle::Hot { temperature } => {
                // temperature là &u32
                println!("{temperature} độ");
            }
            LaundryCycle::Cold => {}
        }
    }
}
# enum LaundryCycle { Cold, Hot { temperature: u32 }, Delicate(String) }
```

Khi `match self` với `&self`, Rust cho `fabric_type` là `&String` (reference) chứ không `String` — nếu cho `String` thì enum mất ownership dữ liệu (move ra khỏi reference, không hợp lệ). Bạn dùng reference y như giá trị (Rust tự deref). Đây là lý do `&self` + `match` hoạt động mượt mà mà không vi phạm ownership.

## Function ngoài → method: vì sao tốt hơn

So sánh function ngoài nhận enum vs method trên enum:

```rust
// CÁCH A: function ngoài
fn wash(cycle: &LaundryCycle) { match cycle { /* ... */ } }
wash(&my_cycle);

// CÁCH B: method (idiomatic)
impl LaundryCycle { fn wash(&self) { match self { /* ... */ } } }
my_cycle.wash();
# enum LaundryCycle { Cold }
# let my_cycle = LaundryCycle::Cold;
```

| | Function ngoài | Method |
|---|---|---|
| Gắn với type? | Không (rời rạc) | **Có** (trong impl) |
| Gọi | `wash(&x)` | `x.wash()` |
| Khám phá | phải biết tên hàm | autocomplete `x.` gợi ý |
| Nhất quán | tuỳ tiện | mọi instance cùng interface |

Method gom hành vi vào type → mọi `LaundryCycle` tự có `wash`, gọi `x.wash()` tự nhiên, IDE gợi ý. Đây là lợi ích của `impl` block: tạo **interface nhất quán** cho type.

## Associated function trên enum

Enum cũng có associated function (không `self`) như struct — thường làm constructor:

```rust
impl LaundryCycle {
    fn default_hot() -> Self {                // associated fn (no self)
        Self::Hot { temperature: 60 }
    }
}

fn main() {
    let cycle = LaundryCycle::default_hot();  // gọi Type::func()
}
# enum LaundryCycle { Cold, Hot { temperature: u32 }, Delicate(String) }
# impl LaundryCycle { fn default_hot() -> Self { Self::Hot { temperature: 60 } } }
```

Gọi `Enum::func()` (`::`), không `self`. `Self` = alias enum. Dùng tạo instance với logic/giá trị mặc định.

## Use case thực tế

```rust
#[derive(Debug)]
enum Shape {
    Circle { radius: f64 },
    Rectangle { width: f64, height: f64 },
}

impl Shape {
    fn area(&self) -> f64 {                  // hành vi khác theo variant
        match self {
            Shape::Circle { radius } => std::f64::consts::PI * radius * radius,
            Shape::Rectangle { width, height } => width * height,
        }
    }
    fn describe(&self) -> String {
        format!("{:?} có diện tích {:.2}", self, self.area())   // gọi method khác
    }
}

fn main() {
    let c = Shape::Circle { radius: 5.0 };
    let r = Shape::Rectangle { width: 4.0, height: 3.0 };
    println!("{:.2}", c.area());      // 78.54
    println!("{}", r.describe());     // Rectangle {...} có diện tích 12.00
}
```

`area` tính khác nhau tuỳ variant (Circle vs Rectangle) qua `match self`; `describe` gọi `self.area()`. Một type `Shape` với hành vi gắn liền, mỗi variant xử lý đúng cách. Pattern này (enum + method + match) là cách Rust thay thế đa hình OOP cho tập biến thể hữu hạn.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `self` → thành associated fn | Gọi `.method()` lỗi | Method có `self` |
| Mong dữ liệu kèm là giá trị với `&self` | Là reference | Dùng như reference (Rust tự deref) |
| Method thiếu variant trong match | non-exhaustive | Phủ mọi variant |
| Dùng `self` value rồi gọi method tiếp | move error | `&self`/`&mut self` |
| Gọi associated fn bằng `.` | Lỗi | `Enum::func()` |

## Tóm tắt bài 81

- Enum có method qua **`impl EnumName { }`** — cùng cú pháp struct, tham số đầu `self`.
- Method enum gần như luôn **`match self`** để xử lý hành vi khác nhau theo variant.
- 4 dạng `self` như struct; ưu tiên `&self` (đọc), `&mut self` (sửa).
- Với `&self`, dữ liệu kèm trích trong `match` là **reference** (`&String`, `&u32`) — Rust tự deref khi dùng.
- Method (vs function ngoài) gom hành vi vào type → interface nhất quán, gọi `x.method()`, IDE gợi ý.
- Enum cũng có associated function (constructor, `Enum::func()`); pattern enum+method+match thay đa hình OOP.

**Bài kế tiếp** → [Bài 82: `match` nâng cao — nhiều giá trị `|`, match giá trị chính xác](07-match-nang-cao.md)
