# Bài 71: Methods nâng cao — nhiều tham số & gọi method từ method

Method không chỉ nhận `self` — nó nhận thêm tham số như function thường, và còn **gọi method khác** trên cùng struct. Hai kỹ thuật này biến struct thành một bộ hành vi giàu có: so sánh hai instance với nhau, tách logic thành các method nhỏ tái dùng. Đây là nơi struct bắt đầu giống "object" thực thụ.

## Method với nhiều tham số

Sau `self` (bắt buộc), method nhận thêm tham số tuỳ ý — như function. Lúc gọi, truyền đối số cho các tham số sau `self` (không truyền `self`):

```rust
impl TaylorSwiftSong {
    fn is_longer_than(&self, other: &TaylorSwiftSong) -> bool {
        self.duration_secs > other.duration_secs
    }
}
```

```text
fn is_longer_than(&self, other: &TaylorSwiftSong) -> bool {
│                 │      │                          │
│                 │      │                          └ return type
│                 │      └ tham số thêm (sau self)
│                 └ self luôn đầu tiên
└ method
```

`is_longer_than` so song hiện tại (`self`) với song khác (`other`). Cả hai dùng `&` (reference) để không lấy ownership. So sánh field `duration_secs` của hai struct → trả `bool`.

Gọi method:

```rust
fn main() {
    let blank_space = TaylorSwiftSong {
        title: String::from("Blank Space"), release_year: 2014, duration_secs: 231,
    };
    let all_too_well = TaylorSwiftSong {
        title: String::from("All Too Well"), release_year: 2012, duration_secs: 327,
    };

    if blank_space.is_longer_than(&all_too_well) {       // truyền &other, KHÔNG truyền self
        println!("{} dài hơn", blank_space.title);
    } else {
        println!("{} ngắn hơn hoặc bằng", blank_space.title);
    }
}
# struct TaylorSwiftSong { title: String, release_year: u32, duration_secs: u32 }
# impl TaylorSwiftSong { fn is_longer_than(&self, other: &TaylorSwiftSong) -> bool { self.duration_secs > other.duration_secs } }
```

Điểm cốt lõi:
- Gọi trên `blank_space` → `self` = `blank_space` (Rust tự truyền).
- Truyền `&all_too_well` cho tham số `other` (phải khớp type: `&TaylorSwiftSong`, không phải `TaylorSwiftSong` — tránh move).
- **Không** truyền `self` — Rust lo. Chỉ truyền đối số cho tham số sau `self`.

Mọi instance của type đều có method này — định nghĩa một lần, dùng chung. Có thể gọi trên `blank_space` hay `all_too_well` đều được.

## `Self` thay tên struct trong tham số

Tham số `other` có thể dùng `&Self` thay `&TaylorSwiftSong` (bền hơn khi đổi tên struct):

```rust
fn is_longer_than(&self, other: &Self) -> bool {     // &Self = &TaylorSwiftSong
    self.duration_secs > other.duration_secs
}
```

`Self` (S hoa) = alias cho type đang `impl`. Nếu đổi tên struct, không phải sửa method.

## Gọi method từ method

Trong thân method, gọi method khác trên cùng instance qua `self.other_method()`. Lý tưởng để **tách logic thành method nhỏ tái dùng**:

```rust
impl TaylorSwiftSong {
    fn years_since_release(&self) -> u32 {
        2024 - self.release_year             // method nhỏ, một việc
    }

    fn display_song_info(&self) {
        println!("Tên: {}", self.title);
        println!("Đã phát hành: {} năm", self.years_since_release());   // gọi method khác
    }
}
```

`display_song_info` gọi `self.years_since_release()` — `self` + `.` + tên method + `()`. Là method nên cần `()`; nếu method có tham số sau `self`, truyền vào đây.

```text
self.years_since_release()
│    │                   │
│    │                   └ () để invoke (method cần ()); tham số sau self vào đây
│    └ tên method
└ instance hiện tại
```

## Vì sao tách method nhỏ

Triết lý (như function bài 30): method nên **nhỏ, một trách nhiệm**. Xây độ phức tạp bằng cách ghép nhiều method nhỏ:

- `years_since_release` chỉ tính số năm — một việc.
- `display_song_info` ghép nhiều thông tin, gọi `years_since_release` để lấy phần tính toán.

Lợi ích: logic tách rời (decoupled) → dễ đọc, dễ sửa, dễ tái dùng. `years_since_release` có thể gọi từ nhiều method khác, không chép lại công thức.

```rust
impl TaylorSwiftSong {
    fn years_since_release(&self) -> u32 { 2024 - self.release_year }

    fn is_classic(&self) -> bool {
        self.years_since_release() > 10      // tái dùng cùng method
    }
    fn summary(&self) -> String {
        format!("{} ({} năm trước)", self.title, self.years_since_release())
    }
}
# struct TaylorSwiftSong { title: String, release_year: u32, duration_secs: u32 }
```

`years_since_release` dùng lại ở `is_classic` và `summary` — sửa công thức (đổi năm hiện tại) chỉ một chỗ.

## Method trả giá trị dùng tiếp

Method trả giá trị → gán vào biến, dùng như function thường:

```rust
fn main() {
    let song = TaylorSwiftSong { /* ... */ };
    let years = song.years_since_release();      // gán return value
    let classic = song.is_classic();
    println!("{years} năm, classic? {classic}");
}
# struct TaylorSwiftSong { title: String, release_year: u32, duration_secs: u32 }
# impl TaylorSwiftSong { fn years_since_release(&self)->u32{2024-self.release_year} fn is_classic(&self)->bool{self.years_since_release()>10} }
```

Method chỉ là function sống trong struct — return value của nó dùng y hệt.

## Use case thực tế

```rust
#[derive(Debug)]
struct Rectangle { width: u32, height: u32 }

impl Rectangle {
    fn area(&self) -> u32 {
        self.width * self.height             // method nhỏ
    }
    fn is_square(&self) -> bool {
        self.width == self.height
    }
    fn can_hold(&self, other: &Rectangle) -> bool {      // nhiều tham số
        self.width >= other.width && self.height >= other.height
    }
    fn describe(&self) -> String {
        format!("{}x{}, diện tích {}, vuông? {}",
            self.width, self.height, self.area(), self.is_square())   // gọi method khác
    }
}

fn main() {
    let big = Rectangle { width: 10, height: 8 };
    let small = Rectangle { width: 4, height: 3 };
    println!("{}", big.describe());          // 10x8, diện tích 80, vuông? false
    println!("{}", big.can_hold(&small));    // true
}
```

`describe` ghép `area()` + `is_square()` (gọi method từ method); `can_hold` nhận `&other` (nhiều tham số). Struct trở thành type giàu hành vi, logic gọn và tái dùng.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Truyền `self` lúc gọi method | Lỗi | Rust tự truyền; chỉ truyền tham số sau `self` |
| Truyền `other` (value) thay `&other` | move error | Truyền `&other` (reference) |
| Quên `()` khi gọi method từ method | Không invoke | `self.method()` |
| Quên `self.` khi gọi method khác | Không tìm thấy | Phải `self.method()`, không `method()` |
| Method khổng lồ làm nhiều việc | Khó đọc/test | Tách method nhỏ, một trách nhiệm |
| Tham số sau `self` thiếu type | Compile error | Mọi tham số cần type |

## Tóm tắt bài 71

- Method nhận **tham số thêm** sau `self`; lúc gọi truyền đối số cho chúng (không truyền `self`).
- Tham số nhận instance khác nên dùng **reference** (`&other: &Self`) để tránh move.
- Gọi method khác trên cùng instance qua **`self.other_method()`** (cần `()`).
- Tách logic thành **method nhỏ, một trách nhiệm**; tái dùng qua `self.method()` → dễ đọc, sửa một chỗ.
- Method trả giá trị → gán biến, dùng như function thường.
- `Self` (S hoa) dùng được trong type tham số, bền khi đổi tên struct.

**Bài kế tiếp** → [Bài 72: Associated functions & nhiều `impl` block — constructor `new`](07-associated-functions.md)
