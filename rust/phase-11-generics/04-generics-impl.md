# Bài 88: Generic & impl block — method cho struct generic

Định nghĩa method cho struct generic phức tạp hơn struct thường. `TreasureChest<T>` có `T` là phần của type — nên `impl TreasureChest` trơn **không** compile. Có hai cách: định nghĩa method cho **một type cụ thể** của `T` (chỉ struct có `T` đó mới có method), hoặc cho **mọi type `T`** (mọi struct đều có). Phân biệt hai cách này là phần khó nhất của generic — nhưng cực mạnh.

## Vấn đề: `impl` trơn không đủ

Struct generic, `T` là phần của type → `impl` phải xử lý `T`:

```rust
struct TreasureChest<T> { captain: String, treasure: T }

impl TreasureChest {                  // ERROR — thiếu generic
    // ...
}
```
```text
error[E0107]: missing generics for struct `TreasureChest`
```

Rust cần biết struct loại nào — vì method có thể thao tác field `treasure` (type `T`), mà không biết `T` thì không biết phép nào hợp lệ trên nó. Hai cách giải quyết.

## Cách 1: impl cho type cụ thể của T

Cung cấp **type cụ thể** trong `<>` → method chỉ tồn tại trên struct có `T` đúng type đó:

```rust
struct TreasureChest<T> { captain: String, treasure: T }

impl TreasureChest<String> {          // CHỈ cho TreasureChest<String>
    fn clean_treasure(&mut self) {
        self.treasure = self.treasure.trim().to_string();   // biết treasure là String
    }
}
```

```text
impl TreasureChest<String> {
│                  │
│                  └ type CỤ THỂ → method chỉ cho struct có T = String
└ impl
```

`impl TreasureChest<String>` định nghĩa method **chỉ** cho `TreasureChest` có `T = String`. Struct với `T` khác (`&str`, array) **không** có `clean_treasure`. Vì biết `T = String`, Rust cho phép gọi method của String (`.trim()`, `.to_string()`) trên `self.treasure`.

```rust
fn main() {
    let mut silver = TreasureChest { captain: String::from("B"), treasure: String::from("  Silver  ") };
    silver.clean_treasure();         // OK — T là String

    let mut gold = TreasureChest { captain: String::from("F"), treasure: "Gold" };
    // gold.clean_treasure();        // ERROR — T là &str, không có method này
}
# struct TreasureChest<T> { captain: String, treasure: T }
# impl TreasureChest<String> { fn clean_treasure(&mut self) { self.treasure = self.treasure.trim().to_string(); } }
```

`gold` (`T = &str`) **không** có `clean_treasure` — method chỉ tồn tại cho `T = String`. Cực granular: method khác nhau cho `T` khác nhau.

Ví dụ method cho `T` là array:

```rust
impl TreasureChest<[&str; 3]> {       // chỉ cho T = mảng 3 &str
    fn amount_of_treasure(&self) -> usize {
        self.treasure.len()           // biết treasure là array → .len() hợp lệ
    }
}
# struct TreasureChest<T> { captain: String, treasure: T }
```

`amount_of_treasure` chỉ tồn tại trên `TreasureChest<[&str; 3]>`. Cách 1 dùng khi method **chỉ hợp lý cho một type `T`** (vd `.trim()` chỉ cho String, `.len()` chỉ cho array).

## Cách 2: impl cho mọi type T

Muốn method tồn tại trên **mọi** struct bất kể `T` → khai generic `<T>` sau `impl`:

```rust
impl<T> TreasureChest<T> {            // method cho MỌI T
    fn capital_captain(&self) -> String {
        self.captain.to_uppercase()   // chỉ dùng captain (luôn String), không đụng T
    }
}
```

```text
impl <T> TreasureChest <T> {
│    │                  │
│    │                  └ T này = generic khai bên trái
│    └ khai generic T (để T sau là generic, không phải type cụ thể)
└ impl

  fn capital_captain... → tồn tại trên MỌI TreasureChest<T>
```

`impl<T> TreasureChest<T>` — `<T>` sau `impl` **khai** generic, để `T` sau `TreasureChest` là **generic** (không phải type tên `T`). Method này tồn tại trên **mọi** struct, bất kể `T`:

```rust
fn main() {
    let gold = TreasureChest { captain: String::from("Firebeard"), treasure: "Gold" };
    let silver = TreasureChest { captain: String::from("Bloodsail"), treasure: String::from("S") };

    println!("{}", gold.capital_captain());      // FIREBEARD — T = &str, vẫn có method
    println!("{}", silver.capital_captain());    // BLOODSAIL — T = String, cũng có
}
# struct TreasureChest<T> { captain: String, treasure: T }
# impl<T> TreasureChest<T> { fn capital_captain(&self) -> String { self.captain.to_uppercase() } }
```

Cả `gold` lẫn `silver` đều có `capital_captain` — method tồn tại cho mọi `T`. Vì method chỉ đụng `captain` (luôn String), không đụng `T`, nên hợp lệ cho mọi `T`.

## Vì sao cần `<T>` sau `impl`

Điểm gây bối rối nhất. Vì sao `impl<T> TreasureChest<T>` chứ không `impl TreasureChest<T>` trơn?

```text
impl TreasureChest<T>     → Rust tưởng T là type CỤ THỂ tên "T" (struct/enum tên T)
impl<T> TreasureChest<T>  → <T> khai T là GENERIC → T sau là generic đó
```

Không có `<T>` sau `impl`, Rust nghĩ `T` trong `TreasureChest<T>` là một type cụ thể tên `T` (như cách 1 với `String`). Khai `<T>` sau `impl` báo "`T` là generic" → `TreasureChest<T>` nghĩa "mọi `T`". Đây là lý do cú pháp có vẻ lặp `<T>` hai lần — cái đầu khai, cái sau dùng.

## So sánh hai cách

| | Cách 1: `impl Type<String>` | Cách 2: `impl<T> Type<T>` |
|---|---|---|
| Method tồn tại trên | chỉ struct có `T` = String | **mọi** struct (mọi `T`) |
| Dùng method của `T`? | Có (biết `T` cụ thể) | Không (T bất kỳ, không biết phép nào) |
| Khai `<T>` sau impl? | Không | **Có** |
| Khi dùng | method chỉ hợp lý cho một `T` | method dùng phần không-generic (captain) |

```text
Cách 1: impl TreasureChest<String> { ... }   → chỉ T=String, dùng được method của String
Cách 2: impl<T> TreasureChest<T> { ... }      → mọi T, chỉ dùng field không phụ thuộc T
```

Quy tắc: method cần thao tác `T` theo cách đặc thù type → cách 1 (cụ thể); method chung không đụng `T` (hoặc đụng theo cách generic) → cách 2 (mọi `T`).

## Use case thực tế

```rust
#[derive(Debug)]
struct Container<T> { items: Vec<T>, name: String }

// Cách 2: method chung cho mọi T
impl<T> Container<T> {
    fn count(&self) -> usize { self.items.len() }        // không đụng T cụ thể
    fn rename(&mut self, new: String) { self.name = new; }
}

// Cách 1: method chỉ cho Container<i32>
impl Container<i32> {
    fn sum(&self) -> i32 {                                // cần T = i32 để cộng
        self.items.iter().sum()
    }
}

fn main() {
    let mut nums = Container { items: vec![1, 2, 3], name: String::from("số") };
    println!("{}", nums.count());        // 3 — method chung
    println!("{}", nums.sum());          // 6 — method chỉ cho i32

    let words = Container { items: vec!["a", "b"], name: String::from("chữ") };
    println!("{}", words.count());       // 2 — có count
    // words.sum();                      // ERROR — sum chỉ cho Container<i32>
}
```

`count`/`rename` (cách 2) cho mọi `Container<T>`; `sum` (cách 1) chỉ cho `Container<i32>` (vì cộng cần biết là số). Kết hợp hai cách: method chung cho mọi type, method đặc thù cho type cụ thể. Đây là pattern chuẩn cho cấu trúc dữ liệu generic.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `impl TreasureChest` trơn (struct generic) | missing generics | Cung cấp `<...>` |
| `impl TreasureChest<T>` không khai `<T>` sau impl | Rust tìm type tên T | `impl<T> TreasureChest<T>` |
| Dùng method của `T` trong cách 2 | Không biết phép nào hợp lệ | Cách 1 (type cụ thể) hoặc trait bound |
| Gọi method cách 1 trên struct `T` khác | Method không tồn tại | Đúng type, hoặc dùng cách 2 |
| Quên `<T>` sau impl lần đầu | Khó hiểu lỗi | Nhớ: khai `<T>` rồi dùng `T` |

## Tóm tắt bài 88

- Struct generic: `impl` phải xử lý `T` (`impl Type` trơn không đủ).
- **Cách 1** `impl Type<String>`: method chỉ tồn tại cho struct có `T` = type cụ thể đó; dùng được method của `T` (biết type).
- **Cách 2** `impl<T> Type<T>`: method tồn tại cho **mọi** `T`; `<T>` sau `impl` khai generic để `T` sau là generic (không phải type tên T).
- Cách 2 không dùng được phép đặc thù của `T` (vì `T` bất kỳ) — chỉ thao tác field không phụ thuộc `T`.
- Kết hợp: method chung (cách 2) + method đặc thù type (cách 1) trên cùng struct.
- `<T>` sau `impl` là điểm bối rối nhất — khai generic, tránh Rust hiểu `T` là type cụ thể.

**Bài kế tiếp** → [Bài 89: Generic trong enum — `Option<T>` và các enum generic](05-generics-trong-enum.md)
