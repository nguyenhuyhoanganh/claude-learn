# Bài 87: Generic trong struct — type linh hoạt cho field

Hàm generic xử lý nhiều type — nhưng generic dùng được nhiều chỗ hơn. Một struct `TreasureChest` có field `treasure` — kho báu có thể là vàng (String), số lượng (i32), danh sách (array)... Không lẽ viết ba struct riêng? **Generic trong struct** cho field một type **linh hoạt**: một định nghĩa struct, nhiều type cho field. Đây là cách `Vec<T>`, `Option<T>` được xây.

## Generic trong struct: `<T>` sau tên struct

Khai `<T>` sau tên struct, dùng `T` làm type cho field:

```rust
#[derive(Debug)]
struct TreasureChest<T> {             // khai generic T
    captain: String,                  // field cố định String
    treasure: T,                      // field linh hoạt type T
}
```

```text
struct TreasureChest <T> {
│      │             │
│      │             └ khai generic T (sau tên struct)
│      └ tên struct
└ keyword

  treasure: T,        ← field dùng generic T
```

`<T>` sau tên struct khai generic; `treasure: T` cho field linh hoạt. Nghĩa: "với type `T` tương lai bất kỳ, `treasure` sẽ là type đó". `captain` vẫn cố định String. Struct trộn field generic và field cụ thể.

## Tạo instance: Rust tự suy T

Tạo instance như bình thường — Rust suy `T` từ giá trị field:

```rust
fn main() {
    let gold_chest = TreasureChest {
        captain: String::from("Firebeard"),
        treasure: "Gold",                // T = &str (suy từ đây)
    };

    let silver_chest = TreasureChest {
        captain: String::from("Bloodsail"),
        treasure: String::from("Silver"),    // T = String
    };

    let special_chest = TreasureChest {
        captain: String::from("Bootyplunder"),
        treasure: ["Gold", "Silver", "Platinum"],   // T = [&str; 3]
    };
}
# #[derive(Debug)] struct TreasureChest<T> { captain: String, treasure: T }
```

Mỗi instance, `treasure` có type khác: `&str`, `String`, `[&str; 3]`. Rust suy `T` từ giá trị `treasure`. Type instance là `TreasureChest<&str>`, `TreasureChest<String>`, `TreasureChest<[&str; 3]>` — cùng struct, khác `T`.

`T` cực linh hoạt: scalar (số, string), collection (array, tuple), struct/enum tự định nghĩa — kể cả type tương lai. Một định nghĩa struct phục vụ tất cả.

## Vì sao generic struct mạnh

Không generic, phải viết struct riêng cho từng type field:

```rust
struct GoldChest { captain: String, treasure: String }      // riêng cho String
struct CountChest { captain: String, treasure: i32 }        // riêng cho i32
struct ListChest { captain: String, treasure: [i32; 3] }    // riêng cho array
```

Lặp y hệt, chỉ khác type `treasure`. Generic gộp thành **một** `TreasureChest<T>` — không lặp, vẫn an toàn type (mỗi instance khoá một `T` cụ thể). Đây chính là cách thư viện chuẩn xây `Vec<T>` (vector chứa type bất kỳ), `Option<T>` (có thể có giá trị type bất kỳ).

## Nhiều generic trong struct

Struct có nhiều generic như hàm (`<T, U>`):

```rust
#[derive(Debug)]
struct Pair<T, U> {                   // hai generic độc lập
    first: T,
    second: U,
}

fn main() {
    let p = Pair { first: 5, second: "hello" };    // T = i32, U = &str
    let q = Pair { first: true, second: 3.14 };    // T = bool, U = f64
}
```

`<T, U>` cho hai field khác type độc lập. Như hàm: nhiều generic cho phép (không bắt buộc) khác type. `HashMap<K, V>` (phase HashMaps) dùng pattern này: key type `K`, value type `V`.

## Generic enum (xem trước)

Enum cũng nhận generic (bài 89 đào sâu) — `Option<T>` chính là enum generic:

```rust
enum Option<T> {                      // T = type của giá trị (nếu có)
    Some(T),                          // có giá trị type T
    None,                             // không có
}
```

`Vec<T>`, `Option<T>`, `Result<T, E>` đều là type generic của thư viện chuẩn — xây bằng đúng cú pháp `<T>` bạn vừa học.

## Đào sâu: type instance bao gồm generic cụ thể

Điểm quan trọng: type đầy đủ của instance **bao gồm** `T` cụ thể. `TreasureChest<&str>` và `TreasureChest<String>` là **hai type khác nhau** với compiler:

```rust
fn take_str_chest(c: TreasureChest<&str>) { }    // chỉ nhận TreasureChest<&str>

fn main() {
    let gold = TreasureChest { captain: String::from("F"), treasure: "Gold" };
    let silver = TreasureChest { captain: String::from("B"), treasure: String::from("S") };
    take_str_chest(gold);            // OK
    // take_str_chest(silver);       // ERROR — TreasureChest<String> ≠ TreasureChest<&str>
}
# #[derive(Debug)] struct TreasureChest<T> { captain: String, treasure: T }
# fn take_str_chest(c: TreasureChest<&str>) {}
```

`T` là **một phần** của type struct. Đây là lý do bài sau (impl block) phải xử lý generic cẩn thận — method gắn với `TreasureChest<T>`, không phải `TreasureChest` trơn.

## Use case thực tế

```rust
#[derive(Debug)]
struct Wrapper<T> {                   // bọc giá trị bất kỳ kèm metadata
    value: T,
    label: String,
}

fn main() {
    let temp = Wrapper { value: 25.5, label: String::from("nhiệt độ") };
    let count = Wrapper { value: 42, label: String::from("số lượng") };
    let name = Wrapper { value: "Anh", label: String::from("tên") };

    println!("{temp:?}");            // Wrapper { value: 25.5, label: "nhiệt độ" }
    println!("{count:?}");
}
```

`Wrapper<T>` bọc giá trị type bất kỳ kèm nhãn — một struct cho mọi loại dữ liệu. Pattern "container generic" (wrapper, cache, node, box) cực phổ biến. Generic struct cho phép xây cấu trúc dữ liệu tái sử dụng cho mọi type.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `T` cho field không khai `<T>` | Rust tìm type tên `T` | Khai `<T>` sau tên struct |
| Tưởng `TreasureChest<&str>` = `TreasureChest<String>` | Type khác nhau | `T` là phần của type |
| Viết struct riêng cho từng type field | Lặp code | Dùng generic |
| Quên `,` giữa nhiều generic | Lỗi | `<T, U>` |
| Quên derive Debug khi in | `{:?}` lỗi | `#[derive(Debug)]` |

## Tóm tắt bài 87

- **Generic struct**: `struct Name<T> { field: T }` — field có type linh hoạt; khai `<T>` sau tên.
- Rust **tự suy** `T` từ giá trị field; mỗi instance khoá một `T` cụ thể.
- `T` nhận mọi type: scalar, collection, struct/enum, type tương lai — một định nghĩa cho tất cả.
- Nhiều generic `<T, U>` cho nhiều field khác type (như `HashMap<K, V>`).
- Type instance **bao gồm** `T` cụ thể: `Name<&str>` ≠ `Name<String>` (hai type khác).
- Nền cho `Vec<T>`, `Option<T>`, `Result<T,E>`; xây container/cấu trúc dữ liệu tái sử dụng.

**Bài kế tiếp** → [Bài 88: Generic & impl block — method cho struct generic](04-generics-impl.md)
