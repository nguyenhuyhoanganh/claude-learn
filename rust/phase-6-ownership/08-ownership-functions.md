# Bài 50: Ownership với function parameters — truyền vào hàm là copy hay move

Bạn truyền một `String` vào function, function in nó ra, rồi... biến gốc **không dùng được nữa**. Đây là điểm bối rối phổ biến nhất khi viết Rust thực tế. Lý do: **parameter cũng là owner** — và quy tắc copy/move áp dụng y hệt khi truyền giá trị vào hàm. Bài này gỡ điều đó, cộng cách làm parameter mutable.

## Parameter tuân theo cùng quy tắc ownership

Parameter là một **tên** trong function, đại diện một giá trị — giống biến. Khi truyền argument vào, việc **copy hay move** quyết định bởi cùng quy tắc:

```text
Type Copy (i32, bool, &str, references) → COPY vào parameter (bản gốc valid)
Type non-Copy (String, Vec)             → MOVE vào parameter (bản gốc vô hiệu)
```

## Truyền type Copy: bản gốc vẫn sống

```rust
fn print_value(value: i32) {
    println!("Giá trị của bạn là {value}");
}

fn main() {
    let apples = 6;
    print_value(apples);             // COPY 6 vào parameter
    println!("apples vẫn là {apples}");   // OK — apples valid
}
```

`i32` implement Copy → `print_value` nhận **bản sao** của `6`. Hình dung như `let value = apples;` (copy). `apples` không bao giờ mất ownership → vẫn dùng được sau lời gọi. Parameter `value` ra khỏi scope cuối hàm, dọn bản sao của nó (vô hại).

## Truyền type non-Copy: ownership MOVE vào hàm

```rust
fn print_value(value: String) {
    println!("Giá trị của bạn là {value}");
}

fn main() {
    let oranges = String::from("oranges");
    print_value(oranges);            // MOVE vào parameter
    // println!("{oranges}");        // ERROR — oranges đã bị move!
}
```
```text
error[E0382]: borrow of moved value: `oranges`
  value moved here: print_value(oranges);
  note: `String` does not implement the `Copy` trait
```

`String` không Copy → truyền vào hàm là **move**. Hình dung như `let value = oranges;` ngay tại lời gọi: `value` (parameter) thành owner mới, `oranges` **vô hiệu hoá**. Cuối `print_value`, `value` ra khỏi scope → **dọn text heap**. Quay về `main`, text đã biến mất, `oranges` không dùng được.

```text
main: oranges ──move──> value (parameter)
                          │
print_value kết thúc ─────┘ value ra khỏi scope → DỌN text heap
                            → text biến mất, oranges vô hiệu
```

Đây là điểm gây sốc cho người mới: chỉ **truyền vào hàm để in** mà mất luôn biến gốc. Khó chịu, nhưng đúng mục đích ownership: đảm bảo text heap được dọn đúng một lần, một owner.

## Cách thoát: clone (tạm) — hoặc reference (đúng)

Compiler thường gợi ý `.clone()`:

```rust
print_value(oranges.clone());        // truyền bản sao, oranges giữ ownership
println!("{oranges}");                // OK
```

Chạy được, nhưng **đắt** (nhân đôi heap). Cách **đúng** là truyền **reference** — hàm mượn, không lấy ownership:

```rust
fn print_value(value: &String) {     // nhận reference
    println!("Giá trị của bạn là {value}");
}

fn main() {
    let oranges = String::from("oranges");
    print_value(&oranges);           // mượn, KHÔNG move
    println!("{oranges}");           // OK — oranges vẫn owner
}
```

`&String` parameter mượn `oranges`; không move, không copy heap. Đây là pattern chuẩn cho hàm chỉ-đọc (phase 7 đào sâu reference parameters). Nhưng trước hết, bài này cho thấy **vì sao** cần reference — bằng cách thấy move gây đau ra sao.

## Parameter immutable mặc định

Như biến, parameter **immutable** mặc định. Không mutate được trong thân hàm:

```rust
fn add_fries(meal: String) {
    meal.push_str(" và khoai");      // ERROR — meal immutable
}
```
```text
error: cannot borrow `meal` as mutable, as it is not declared as mutable
```

## `mut` trước tên parameter

Để mutate, thêm `mut` **trước tên parameter** (như biến dùng `let mut`):

```rust
fn add_fries(mut meal: String) {     // mut parameter
    meal.push_str(" và khoai");      // OK
    println!("{meal}");
}

fn main() {
    let burger = String::from("Burger");
    add_fries(burger);               // Burger và khoai
}
```

## Bẫy tinh tế: mut của biến gốc KHÔNG ảnh hưởng parameter

Điểm gây nhầm lẫn quan trọng. Xét:

```rust
fn add_fries(meal: String) {         // meal IMMUTABLE
    meal.push_str(" và khoai");      // ERROR
}

fn main() {
    let mut burger = String::from("Burger");   // burger mutable
    add_fries(burger);
}
```

Dù `burger` là `mut`, code **vẫn lỗi**. Vì khi truyền vào hàm, ownership **move** từ `burger` sang `meal`, và `meal` (parameter) **immutable** mặc định — bất kể `burger` mutable hay không. Tính mutable **không** đi theo move; owner mới (`meal`) bắt đầu lại từ immutable.

```text
burger (mut) ──move──> meal (immutable mặc định)
   tính 'mut' KHÔNG chuyển theo — meal phải tự khai 'mut'
```

Sửa: khai `mut` ở **parameter** (`mut meal: String`), không phải ở biến gốc. Mỗi owner tự quyết mutability của mình.

| Khai `mut` ở | Cho phép mutate? |
|---|---|
| Biến gốc `burger` | Chỉ mutate qua `burger` (trước move) |
| Parameter `meal` | Mutate qua `meal` (sau move) — đây là cái cần |

> Compiler còn warn ngược: nếu khai `mut` mà không mutate → "variable does not need to be mutable". Rust giúp giữ mutability đúng cả hai chiều.

## Đào sâu: mutability là thuộc tính của binding, không của giá trị

Vì sao `mut` không đi theo move? Vì trong Rust, **mutability gắn với binding (cái tên), không với giá trị**. Khi ownership chuyển sang tên mới, tên mới khai báo lại mutability của riêng nó. Một giá trị có thể được sở hữu bởi binding immutable lúc này, rồi move sang binding mutable lúc khác (hoặc ngược lại). Đây là thiết kế nhất quán: mỗi owner kiểm soát quyền sửa của chính nó.

```rust
fn main() {
    let s = String::from("hi");      // immutable binding
    let mut s2 = s;                  // move sang mutable binding
    s2.push_str("!");                // OK qua s2
}
```

## Use case thực tế

```rust
// Hàm CẦN sở hữu (tiêu thụ giá trị) → nhận String
fn into_uppercase(text: String) -> String {
    text.to_uppercase()              // tiêu thụ text, trả String mới
}

// Hàm chỉ ĐỌC → nhận &str (không move, linh hoạt nhất)
fn count_chars(text: &str) -> usize {
    text.chars().count()
}

fn main() {
    let name = String::from("Anh");
    println!("{}", count_chars(&name));   // mượn — name còn dùng được
    let upper = into_uppercase(name);     // move — name bị tiêu thụ
    println!("{upper}");                   // ANH
}
```

Quy tắc thiết kế: hàm chỉ đọc → `&str` (mượn); hàm cần sở hữu/tiêu thụ → `String` (move). Mặc định ưu tiên mượn.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng biến sau khi truyền String vào hàm | `moved value` | Truyền `&` (mượn) hoặc nhận lại return |
| Khai `mut` ở biến gốc, mong parameter mutate | Vẫn lỗi | Khai `mut` ở **parameter** |
| Tưởng mut đi theo move | Không | Mỗi binding tự khai mut |
| Dùng `String` parameter khi chỉ đọc | Buộc caller move/clone | Dùng `&str` |
| Clone tràn lan để né move | Tốn memory | Dùng reference parameter |
| Quên parameter immutable mặc định | `cannot borrow as mutable` | `mut` trước tên parameter |

## Tóm tắt bài 50

- **Parameter là owner** → quy tắc copy/move áp dụng khi truyền argument vào hàm.
- Type **Copy** (i32, &str, references) → copy vào parameter, bản gốc **valid**.
- Type **non-Copy** (String) → **move** vào parameter, bản gốc **vô hiệu**, hàm dọn nó cuối scope.
- Né move: `.clone()` (đắt) hoặc tốt hơn là truyền **reference** `&` (mượn, không move).
- Parameter **immutable mặc định**; khai `mut` **trước tên parameter** để mutate.
- **Mutability gắn với binding, không theo move** — `mut` của biến gốc không sang parameter; mỗi owner tự khai.

**Bài kế tiếp** → [Bài 51: Return values & ownership — trả quyền sở hữu ra khỏi hàm, vấn đề cần references](09-return-values.md)
