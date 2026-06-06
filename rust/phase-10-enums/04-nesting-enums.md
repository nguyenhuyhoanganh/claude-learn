# Bài 79: Lồng enum trong enum — kết hợp các type

Enum là type bình thường — nên dữ liệu kèm của một variant có thể là... một enum khác. Một món Burrito kèm loại thịt (Chicken/Steak), loại thịt lại là một enum. Đây là **lồng enum trong enum** — và rộng hơn, là khả năng kết hợp struct/enum tuỳ ý để mô hình hoá cấu trúc thực tế phức tạp. Bài này cho thấy enum, struct ghép với nhau thành cây dữ liệu.

## Enum là type → lồng được

Vì enum là type như mọi type khác, dữ liệu kèm variant có thể là enum khác. Ví dụ một nhà hàng: món ăn (`RestaurantItem`) kèm loại thịt (`Meat`):

```rust
#[derive(Debug)]
enum Meat {
    Chicken,
    Steak,
}

#[derive(Debug)]
enum RestaurantItem {
    Burrito(Meat),                   // tuple variant kèm enum Meat
    Bowl(Meat),
    VeganPlate,                      // không kèm gì
}
```

`Burrito(Meat)` — variant Burrito kèm một giá trị type `Meat` (lại là enum). Burrito và Bowl kèm thịt; VeganPlate không.

## Tạo instance lồng nhau

Tạo: cung cấp variant của enum lồng làm dữ liệu kèm:

```rust
fn main() {
    let lunch = RestaurantItem::Burrito(Meat::Steak);    // Burrito kèm Steak
    let dinner = RestaurantItem::Bowl(Meat::Chicken);
    let abandoned = RestaurantItem::VeganPlate;          // không kèm

    println!("Trưa: {lunch:?}");      // Trưa: Burrito(Steak)
    println!("Tối: {dinner:?}");      // Tối: Bowl(Chicken)
}
# #[derive(Debug)] enum Meat { Chicken, Steak }
# #[derive(Debug)] enum RestaurantItem { Burrito(Meat), Bowl(Meat), VeganPlate }
```

`RestaurantItem::Burrito(Meat::Steak)` — variant ngoài (`Burrito`) kèm variant trong (`Meat::Steak`). Debug hiện lồng nhau: `Burrito(Steak)`. Cây dữ liệu: RestaurantItem chứa Meat.

## Nhiều enum lồng trong struct variant

Struct variant cho phép kèm **nhiều** enum lồng, mỗi cái có tên field. Vd món ăn kèm thịt **và** đậu:

```rust
#[derive(Debug)]
enum Meat { Chicken, Steak }

#[derive(Debug)]
enum Beans { Pinto, Black }

#[derive(Debug)]
enum RestaurantItem {
    Burrito { meat: Meat, beans: Beans },    // struct variant kèm 2 enum
    Bowl { meat: Meat, beans: Beans },
    VeganPlate,
}

fn main() {
    let lunch = RestaurantItem::Burrito {
        meat: Meat::Steak,
        beans: Beans::Pinto,
    };
    println!("{lunch:?}");
    // Burrito { meat: Steak, beans: Pinto }
}
```

Struct variant `Burrito { meat: Meat, beans: Beans }` kèm hai enum lồng, mỗi cái có tên rõ. Tạo bằng `{}` với field. Cây sâu hơn: RestaurantItem → (Meat, Beans).

## Kết hợp tự do: enum, struct, lồng nhau

Điểm cốt lõi: enum, struct là type bình thường → ghép tuỳ ý để mô hình hoá cấu trúc thực tế:

```text
enum trong enum:     Burrito(Meat)
enum trong struct:   struct Order { item: RestaurantItem }
struct trong enum:   PayPal(Credentials)   (bài 78)
struct trong struct: struct A { b: B }
array trong struct:  struct Cart { items: [Item; 5] }
```

Không giới hạn lồng — xây cây dữ liệu nhiều tầng phản ánh domain thực:

```rust
#[derive(Debug)]
enum Meat { Chicken, Steak }

#[derive(Debug)]
enum RestaurantItem { Burrito(Meat), VeganPlate }

#[derive(Debug)]
struct Order {                       // struct chứa enum
    item: RestaurantItem,
    quantity: u32,
    table: u32,
}

fn main() {
    let order = Order {
        item: RestaurantItem::Burrito(Meat::Steak),   // enum trong struct
        quantity: 2,
        table: 5,
    };
    println!("{order:#?}");
}
```

`Order` (struct) chứa `RestaurantItem` (enum) chứa `Meat` (enum) — ba tầng. Mỗi tầng dùng đúng công cụ: struct cho "VÀ" (order có item VÀ quantity VÀ table), enum cho "HOẶC" (item là Burrito HOẶC VeganPlate).

## Đào sâu: mô hình hoá domain

Khả năng lồng/kết hợp là điều khiến Rust mô hình hoá **domain thực tế** chính xác. "Domain" = lĩnh vực bài toán (nhà hàng, ngân hàng, game). Bạn ánh xạ khái niệm thực → type:

```text
Thực tế                          Rust
"đơn hàng có món + số lượng"  →  struct Order { item, quantity }
"món là burrito HOẶC bowl"   →  enum RestaurantItem { Burrito, Bowl }
"burrito kèm thịt + đậu"     →  variant Burrito { meat, beans }
"thịt là gà HOẶC bò"         →  enum Meat { Chicken, Steak }
```

Cấu trúc type phản ánh cấu trúc thực tế. Đây là sức mạnh lớn: compiler đảm bảo chỉ tổ hợp hợp lệ tồn tại (không thể có "burrito không thịt" nếu field `meat` bắt buộc; không thể có "thịt là Pizza" nếu Meat chỉ Chicken/Steak). Type system bắt lỗi domain ngay compile time.

## Use case thực tế: AST đơn giản

Lồng enum là nền cho cấu trúc cây như biểu thức toán (Abstract Syntax Tree):

```rust
#[derive(Debug)]
enum Expr {
    Number(f64),
    Add(Box<Expr>, Box<Expr>),       // enum chứa chính nó (cần Box — phase sau)
    Multiply(Box<Expr>, Box<Expr>),
}

fn main() {
    // (2 + 3) — Add chứa hai Number
    let expr = Expr::Add(
        Box::new(Expr::Number(2.0)),
        Box::new(Expr::Number(3.0)),
    );
    println!("{expr:?}");
}
```

`Expr` lồng chính nó (enum đệ quy) — biểu diễn cây biểu thức. (Cần `Box` vì kích thước đệ quy vô hạn — phase Smart Pointers. Đây là sneak peek cho thấy lồng enum mạnh thế nào.) Pattern này dùng cho parser, interpreter, cấu trúc cây.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên prefix enum lồng | `cannot find value` | `Meat::Steak`, không `Steak` |
| Sai cú pháp variant (tuple vs struct) | Lỗi | `()` cho tuple, `{}` cho struct |
| Enum đệ quy trực tiếp (không Box) | "infinite size" error | Dùng `Box` (phase sau) |
| Quên derive Debug ở enum lồng | `{:?}` lỗi | Derive ở mọi enum trong cây |
| Lồng quá sâu khó đọc | Phức tạp | Tách type, đặt tên rõ |

## Tóm tắt bài 79

- Enum là type → dữ liệu kèm variant có thể là **enum khác** (lồng enum trong enum).
- Tạo: `OuterEnum::Variant(InnerEnum::Variant)`; struct variant kèm nhiều enum có tên field.
- Kết hợp tự do: enum trong enum, enum trong struct, struct trong enum — xây **cây dữ liệu** nhiều tầng.
- Mỗi tầng dùng đúng công cụ: struct ("VÀ"), enum ("HOẶC") — phản ánh cấu trúc domain thực tế.
- Type system đảm bảo chỉ tổ hợp hợp lệ tồn tại → bắt lỗi domain ngay compile time.
- Lồng enum là nền cho cấu trúc cây (AST, parser) — enum đệ quy cần `Box` (phase sau).

**Bài kế tiếp** → [Bài 80: `match` với enum — xử lý mọi variant, trích dữ liệu kèm](05-match-voi-enum.md)
