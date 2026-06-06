# Bài 72: Associated functions & nhiều `impl` block — constructor `new`

`String::from("hi")` và `String::new()` — bạn dùng suốt nhưng chưa biết chúng là gì. Đó là **associated function**: function gắn với **type** (không phải instance). Khác method (gọi trên instance, có `self`), associated function gọi trên type qua `::`, không có `self`. Dùng phổ biến nhất làm **constructor** — hàm tạo instance mới. Bài này cũng giới thiệu nhiều `impl` block.

## Associated function là gì

**Associated function** = function gắn với **type**, **không** sống trên instance. Khác method:

| | Method | Associated function |
|---|---|---|
| Gắn với | instance | **type** |
| Tham số `self`? | **Có** | **Không** |
| Gọi bằng | `instance.method()` | `Type::function()` |

Bạn đã gặp: `String::from(...)`, `String::new()` — không gọi trên một String cụ thể, mà trên **type** `String`, qua `::` (scope resolution operator).

```text
String :: from ( "hi" )
│       │   │
│       │   └ associated function
│       └ truy cập namespace của type
└ type
```

Type tạo một **namespace** (như folder chứa file) cho các associated function. `::` đi vào namespace đó tìm function.

## Định nghĩa associated function: không có `self`

Trong `impl` block (cùng chỗ method), function **không có `self`** → Rust hiểu là associated function:

```rust
impl TaylorSwiftSong {
    fn new(title: String, release_year: u32, duration_secs: u32) -> Self {
        Self { title, release_year, duration_secs }      // tạo & trả instance
    }
}
```

```text
fn new(title: String, ...) -> Self {
│  │                    │
│  │                    └ trả về instance (Self = TaylorSwiftSong)
│  └ KHÔNG có self → associated function
└ định nghĩa như function thường
```

Rust phân biệt: **có `self`** (mọi dạng) → method; **không `self`** → associated function. Associated function không cần `self` vì chưa có instance nào — nó gắn với type, dùng để **tạo ra** instance.

## Constructor `new` — use case phổ biến nhất

**Constructor** = function trả về instance mới của type. Convention Rust: đặt tên **`new`**:

```rust
impl TaylorSwiftSong {
    fn new(title: String, release_year: u32, duration_secs: u32) -> Self {
        Self { title, release_year, duration_secs }
    }
}

fn main() {
    let song = TaylorSwiftSong::new(
        String::from("Blank Space"), 2014, 231,
    );
    song.display_song_info();
}
# struct TaylorSwiftSong { title: String, release_year: u32, duration_secs: u32 }
# impl TaylorSwiftSong { fn new(title: String, release_year: u32, duration_secs: u32) -> Self { Self { title, release_year, duration_secs } } fn display_song_info(&self){} }
```

Gọi `TaylorSwiftSong::new(...)` — y cú pháp `String::from(...)`: tên type + `::` + tên function. Sạch hơn nhiều so với viết `TaylorSwiftSong { title: ..., release_year: ..., ... }` thủ công mỗi lần.

`new` không phải bắt buộc tên, nhưng là **convention cộng đồng** — code của bạn trông giống code người khác. Dùng `Self` trong return + body (bền khi đổi tên struct).

## `Self` trong associated function

`Self` (S hoa) = alias type đang `impl` — dùng được cả ở return type lẫn body:

```rust
fn new(title: String, release_year: u32, duration_secs: u32) -> Self {   // Self = TaylorSwiftSong
    Self { title, release_year, duration_secs }                          // Self = TaylorSwiftSong
}
```

Tương đương viết `TaylorSwiftSong` cả hai chỗ, nhưng `Self` bền hơn — đổi tên struct không phải sửa.

## Nhiều `impl` block

Một struct có thể có **nhiều** `impl` block — Rust gộp tất cả lại thành một định nghĩa type:

```rust
impl TaylorSwiftSong {
    fn new(/* ... */) -> Self { /* ... */ }       // constructor ở block 1
}

impl TaylorSwiftSong {
    fn display_song_info(&self) { /* ... */ }     // method ở block 2
    fn years_since_release(&self) -> u32 { /* ... */ }
}
# struct TaylorSwiftSong { title: String, release_year: u32, duration_secs: u32 }
```

Hai block, cùng `TaylorSwiftSong` → Rust gộp như một. **Hiện tại không có lợi ích** rõ ràng (chia tuỳ ý), nhưng:
- Tổ chức code (vd tách constructor khỏi method).
- **Bắt buộc** cho vài concept sau (generics, trait bounds — phase sau) yêu cầu nhiều `impl` block.

Bài này chỉ giới thiệu cú pháp hợp lệ; lợi ích thực sự lộ rõ ở phase Generics.

## Method vs associated function — phân biệt rõ

```rust
impl Coffee {
    fn new(name: String) -> Self {       // associated fn: không self, gọi Coffee::new()
        Self { name }
    }
    fn describe(&self) {                  // method: có self, gọi coffee.describe()
        println!("{}", self.name);
    }
}

fn main() {
    let coffee = Coffee::new(String::from("Mocha"));   // :: cho associated fn
    coffee.describe();                                  // .  cho method
}
# struct Coffee { name: String }
```

| | Cú pháp gọi | Có `self`? | Mục đích |
|---|---|---|---|
| Associated function | `Coffee::new()` (`::`) | Không | Tạo/thao tác trên type |
| Method | `coffee.describe()` (`.`) | Có | Thao tác trên instance |

## Use case thực tế: constructor với logic

Constructor không chỉ gán field — có thể chứa logic (validate, giá trị mặc định):

```rust
#[derive(Debug)]
struct Circle { radius: f64 }

impl Circle {
    fn new(radius: f64) -> Self {
        Self { radius }
    }
    fn unit() -> Self {                  // constructor khác: hình tròn bán kính 1
        Self { radius: 1.0 }
    }
    fn from_diameter(diameter: f64) -> Self {   // constructor từ đường kính
        Self { radius: diameter / 2.0 }
    }
    fn area(&self) -> f64 {              // method
        std::f64::consts::PI * self.radius * self.radius
    }
}

fn main() {
    let c1 = Circle::new(5.0);
    let c2 = Circle::unit();
    let c3 = Circle::from_diameter(10.0);
    println!("{:.2}", c1.area());        // 78.54
}
```

Nhiều associated function tạo instance theo nhiều cách (`new`, `unit`, `from_diameter`) — linh hoạt hơn chỉ gán field thô. Đây là pattern chuẩn: type cung cấp các "lối vào" tạo instance qua associated function.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Gọi associated fn bằng `.` | Lỗi | Dùng `Type::function()` |
| Gọi method bằng `::` | Lỗi | Dùng `instance.method()` |
| Thêm `self` vào constructor | Thành method | Constructor không có `self` |
| Đặt tên constructor khác `new` không lý do | Lệch convention | Dùng `new` (trừ khi có lý do) |
| Quên `-> Self` ở constructor | Không trả instance | Khai return type |
| Tưởng nhiều `impl` block là lỗi | Bỏ lỡ tổ chức | Hợp lệ, Rust gộp lại |

## Tóm tắt bài 72

- **Associated function** = function gắn **type** (không instance), **không có `self`**, gọi `Type::func()` (`::`).
- Khác **method** (gọi `instance.method()`, có `self`); Rust phân biệt qua sự có mặt của `self`.
- Use case chính: **constructor** — tạo instance mới; convention đặt tên **`new`**.
- Dùng `Self` (S hoa) trong return + body (bền khi đổi tên struct).
- Một struct có **nhiều `impl` block** — Rust gộp lại; hữu ích để tổ chức, bắt buộc cho concept sau.
- Nhiều constructor (`new`, `from_diameter`, `unit`) cho nhiều cách tạo instance.

**Bài kế tiếp** → [Bài 73: Builder pattern — chuỗi method để dựng struct](08-builder-pattern.md)
