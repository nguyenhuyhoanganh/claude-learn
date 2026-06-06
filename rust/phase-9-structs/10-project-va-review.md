# Bài 75: Project & Section Review — Flight struct, tổng kết phase

Hết phase Structs — công cụ mô hình hoá dữ liệu quan trọng nhất Rust. Project này dựng một `Flight` struct đầy đủ: field, Debug, constructor, method (đọc & sửa), struct update. Sau đó tổng kết toàn phase.

## Đề bài project

1. `Flight` struct: `origin`, `destination` (String), `price` (f64), `passengers` (u32).
2. Derive Debug.
3. Constructor `new`.
4. Method `change_destination` (sửa), `increase_price` (sửa +20%), `itinerary` (đọc, in).
5. Tạo instance qua `new`, gọi method, dùng struct update tạo instance thứ hai.

## Lời giải đầy đủ

```rust
#[derive(Debug)]
struct Flight {
    origin: String,
    destination: String,
    price: f64,
    passengers: u32,
}

impl Flight {
    fn new(origin: String, destination: String, price: f64, passengers: u32) -> Self {
        Self { origin, destination, price, passengers }      // shorthand + Self
    }

    fn change_destination(&mut self, new_destination: String) {   // sửa → &mut self
        self.destination = new_destination;
    }

    fn increase_price(&mut self) {                                // sửa → &mut self
        self.price *= 1.2;                                         // +20%
    }

    fn itinerary(&self) {                                         // đọc → &self
        println!("{} -> {}", self.origin, self.destination);
    }
}

fn main() {
    let mut my_flight = Flight::new(
        String::from("New York"),
        String::from("Los Angeles"),
        299.99,
        150,
    );

    my_flight.change_destination(String::from("San Francisco"));
    my_flight.increase_price();
    my_flight.itinerary();                       // New York -> San Francisco
    println!("{my_flight:?}");                     // price ~359.98

    // Struct update: copy price & passengers, đổi origin & destination
    let another_flight = Flight {
        origin: String::from("Paris"),
        destination: String::from("Rome"),
        ..my_flight                               // copy price, passengers (Copy)
    };
    println!("{another_flight:#?}");
}
```

### Điểm học cốt lõi

| Phần | Khái niệm |
|---|---|
| `#[derive(Debug)]` | In struct bằng `{:?}`/`{:#?}` (bài 69) |
| `new` | Associated function (không `self`), constructor, `Self`, shorthand (bài 68, 72) |
| `change_destination`, `increase_price` | Method sửa → `&mut self` (bài 70) |
| `itinerary` | Method đọc → `&self` |
| `my_flight` phải `mut` | Để gọi method `&mut self` |
| `..my_flight` | Struct update — copy field Copy (price f64, passengers u32) (bài 68) |

### Bẫy trong project

- `my_flight` phải `let mut` — nếu không, gọi `change_destination` (`&mut self`) lỗi.
- `..my_flight`: `origin`/`destination` (String) **không** bị move vì đã khai riêng trước `..`; chỉ copy `price`/`passengers` (Copy). Nếu để `..my_flight` copy cả String → `my_flight` mất origin/destination.
- `increase_price` dùng `*= 1.2` (augmented assignment) — gọn hơn `self.price = self.price * 1.2`.

---

# Section Review — tổng kết Structs

## Định nghĩa & instance

- **Struct** = container dữ liệu liên quan; 3 loại: **named field**, **tuple**, **unit-like**.
- Định nghĩa: `struct Name { field: type }` (PascalCase tên, snake_case field) — blueprint, tạo type mới.
- Instance: `Name { field: value }` (đủ field, đúng type, thứ tự tuỳ ý); truy cập `instance.field`.
- Struct sở hữu field, field sở hữu giá trị; lấy field non-Copy ra → move.

## Sửa & truyền hàm

- Sửa field: cần **`mut` toàn struct** (không sửa lẻ).
- 4 cách truyền: `Coffee`/`mut Coffee` (move), `&Coffee`/`&mut Coffee` (mượn) — ưu tiên reference.

## Cú pháp tiện

- **Field shorthand**: tên trùng field → `field` thay `field: field`.
- **Struct update `..instance`**: copy field còn lại; theo ownership rules (non-Copy bị move).
- **`#[derive(Debug)]`**: in `{:?}`/`{:#?}`; Display không derive được.

## Method & associated function

```text
Method:               có self, gọi instance.method(), 4 dạng self
  &self      → đọc (phổ biến nhất)
  &mut self  → sửa (phổ biến)
  self/mut self → tiêu thụ (hiếm)
Associated function:  KHÔNG self, gọi Type::func(), constructor 'new'
```

- Method: function trong `impl`, tham số đầu `self`; nhận tham số thêm sau `self`; gọi method khác qua `self.m()`.
- Associated function: gắn type, không `self`, gọi `Type::func()`; `new` = constructor convention.
- Nhiều `impl` block hợp lệ (Rust gộp).

## Pattern & loại struct

- **Builder pattern**: method trả `&mut self` → chain.
- **Tuple struct** `struct S(T)`: field theo vị trí, type-safety (newtype).
- **Unit-like struct** `struct S;`: không field, vẫn có method.

## Bản đồ phase Structs

```text
ĐỊNH NGHĨA
  struct Name { field: type }  →  instance Name { field: value }  →  .field
  3 loại: named field · tuple struct S(T) · unit-like S;

DỮ LIỆU
  mut toàn struct để sửa · 4 cách truyền hàm (value/ref × im/mutable)
  shorthand · ..update · #[derive(Debug)]

HÀNH VI (impl block)
  method (self): &self đọc · &mut self sửa · self tiêu thụ
  associated fn (no self): Type::new() constructor
  builder pattern (chain &mut self)
```

## Bẫy tổng hợp

| Bẫy | Cách tránh |
|---|---|
| Sửa field quên `mut` instance | `let mut` |
| `{:?}` struct chưa derive | `#[derive(Debug)]` |
| Dùng `self` value rồi gọi method tiếp | `&self`/`&mut self` |
| Gọi associated fn bằng `.` | `Type::func()` |
| `..` copy field non-Copy | khai riêng/`clone()` |
| Truy cập tuple struct bằng tên | `.0`, `.1` |

## Tóm tắt phase Structs

- **Struct** mô hình hoá dữ liệu thực tế: field có tên, type của riêng bạn — hơn hẳn tuple.
- Sửa cần `mut`; truyền hàm 4 cách (ưu tiên reference); shorthand/`..`/`#[derive(Debug)]` tiện lợi.
- **Method** (`self`) = hành vi; **associated function** (no `self`) = constructor; builder pattern để chain.
- Tuple struct cho newtype/type-safety; unit-like cho marker.

Bạn đã có công cụ mô hình hoá dữ liệu mạnh nhất. Nhưng struct chỉ biểu diễn "**VÀ**" — một Coffee có name **và** price **và** is_hot. Phase tiếp theo là **Enum** — biểu diễn "**HOẶC**": một giá trị là biến thể này **hoặc** biến thể kia (đỏ hoặc xanh, thành công hoặc lỗi). Enum + struct + `match` (phase 5) là bộ ba mô hình hoá dữ liệu cốt lõi của Rust.

**Bài kế tiếp** → [Bài 76: Enum — biểu diễn "một trong nhiều biến thể"](../phase-10-enums/01-enum-la-gi.md)
