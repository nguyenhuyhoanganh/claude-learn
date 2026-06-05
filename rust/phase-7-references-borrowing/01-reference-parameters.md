# Bài 53: Reference parameters — immutable vs mutable, giải bài toán scale

Phase 6 kết thúc bằng nỗi đau: hàm "nuốt" mất `String`, buộc return-rồi-gán-lại cho mọi lời gọi — không scale. Lời giải ở đây: cho hàm nhận **reference parameter** — mượn giá trị thay vì lấy ownership. Bài này: bốn cách khai báo parameter (sở hữu/mượn × immutable/mutable), và cách `&String`/`&mut String` xoá sạch vấn đề return.

## Vấn đề nhắc lại

```rust
fn add_flour(mut meal: String) -> String {   // nuốt String, phải trả về
    meal.push_str("bột; ");
    meal
}
fn main() {
    let mut meal = String::new();
    meal = add_flour(meal);                    // phải gán lại — rườm rà
}
```

Mọi hàm dùng `String` phải nhận ownership rồi return — không scale (bài 51). Giải pháp: **reference parameter**.

## Immutable reference parameter: `&String`

Hàm chỉ **đọc** giá trị → nhận `&String` (reference, không lấy ownership):

```rust
fn show_my_meal(meal: &String) {          // &String — mượn, chỉ đọc
    println!("Các bước: {meal}");
}

fn main() {
    let current_meal = String::from("bột");
    show_my_meal(&current_meal);           // truyền &  — mượn
    println!("{current_meal}");            // OK — vẫn là owner
}
```

`meal: &String` = **immutable reference** — có quyền **đọc** giá trị tại địa chỉ, **không** có quyền sửa. `current_meal` giữ ownership suốt; `meal` chỉ là owner của *reference* (tờ giấy địa chỉ), dọn tờ giấy đó cuối hàm — text heap không bị đụng.

**Bắt buộc khớp type ở cả hai đầu**:

```rust
show_my_meal(current_meal);    // ERROR — truyền String, hàm cần &String
show_my_meal(&current_meal);   // OK — truyền reference
```

```text
error[E0308]: mismatched types: expected `&String`, found `String`
```

Hàm nhận `&String` → caller phải truyền `&` ở argument. Không cần return — không lo ownership.

## Mutable reference parameter: `&mut String`

Hàm cần **sửa** giá trị mà không lấy ownership → **mutable reference** `&mut String`:

```rust
fn add_flour(meal: &mut String) {          // &mut String — mượn + sửa được
    meal.push_str("bột; ");                 // OK — mutate qua mutable ref
}                                           // KHÔNG cần return!

fn main() {
    let mut current_meal = String::new();
    add_flour(&mut current_meal);          // truyền &mut
    add_flour(&mut current_meal);          // gọi lại thoải mái, không gán lại
    println!("{current_meal}");            // bột; bột;
}
```

`&mut String` = reference **có** quyền sửa giá trị tại địa chỉ. Vẫn là **borrow** (không move ownership — `current_meal` vẫn owner), nhưng kèm quyền mutate. Giờ `push_str` chạy được, **không** cần return, **không** cần gán lại — bài toán scale được giải.

Yêu cầu: owner gốc phải **`mut`** mới tạo được `&mut` từ nó:

```rust
let current_meal = String::new();          // immutable
add_flour(&mut current_meal);              // ERROR — không &mut từ immutable
let mut current_meal = String::new();      // phải mut
```

## Bốn cách khai báo parameter — bảng tổng

Đây là phần cốt lõi cần thuộc. Một parameter `meal` cho `String` có **bốn** dạng:

| Cú pháp | Lấy ownership? | Sửa được? | Khi dùng |
|---|---|---|---|
| `meal: String` | **Có** (move) | Không | Hàm **tiêu thụ** giá trị |
| `meal: mut String` | **Có** (move) | Có | Tiêu thụ + sửa bản của mình |
| `meal: &String` | Không (mượn) | Không | Hàm chỉ **đọc** |
| `meal: &mut String` | Không (mượn) | **Có** | Hàm **sửa tại chỗ**, giữ owner |

```text
String       → move, read-only      (nuốt giá trị)
mut String   → move, sửa được       (nuốt + sửa)
&String      → mượn, read-only      (đọc, không return)
&mut String  → mượn, sửa được       (sửa tại chỗ, không return) ← giải scale
```

Hai dạng `&...` (mượn) là lựa chọn mặc định nên ưu tiên — không phá ownership của caller. Chọn `&mut` khi cần sửa, `&` khi chỉ đọc.

## Rust tự dereference khi gọi method qua reference

Để ý: trong `add_flour`, `meal` là `&mut String` (reference), nhưng ta gọi `meal.push_str(...)` y như trên String thật. Rust **tự dereference** — biết bạn muốn gọi method trên *String tại địa chỉ*, không phải trên địa chỉ. Thiết kế hay: dù `meal` là reference hay giá trị, cùng cú pháp method đều chạy.

Nhưng quyền sửa vẫn do loại reference quyết định:

```rust
fn f(meal: &String) {          // immutable ref
    meal.push_str("x");        // ERROR — không có quyền mutate
}
```

`push_str` (mutate) cần `&mut`, không phải `&`. Reference type sai quyền → lỗi.

## Khớp đúng loại reference, không chỉ "có ref hay không"

Compiler kiểm **cả quyền** của reference, không chỉ "là reference":

```rust
fn add_flour(meal: &mut String) { meal.push_str("x"); }

fn main() {
    let mut m = String::new();
    add_flour(&m);             // ERROR — truyền &String, hàm cần &mut String
    add_flour(&mut m);         // OK
}
```
```text
error: types differ in mutability: expected `&mut String`, found `&String`
```

Truyền `&` (immutable) vào nơi cần `&mut` → mismatch. Phải khớp **cả** "là reference" lẫn "đúng quyền".

## Use case thực tế: pipeline build dữ liệu

So sánh hai cách build chuỗi qua nhiều bước:

```rust
// CŨ (ownership thuần): return + gán lại mỗi bước — rườm rà
fn add_a(s: String) -> String { /* ... */ s }

// MỚI (mutable reference): mượn, không return — gọn, scale
fn add_step(trip: &mut String, step: &str) {
    trip.push_str(step);
    trip.push_str("; ");
}

fn main() {
    let mut trip = String::from("Kế hoạch: ");
    add_step(&mut trip, "Hà Nội");
    add_step(&mut trip, "Huế");
    add_step(&mut trip, "Sài Gòn");
    println!("{trip}");        // Kế hoạch: Hà Nội; Huế; Sài Gòn;
}
```

`&mut` parameter cho phép nhiều hàm sửa cùng một String tuần tự, owner (`trip`) giữ nguyên suốt — không clone, không return-gán-lại. Đây là pattern chuẩn của Rust.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Truyền `String` vào hàm cần `&String` | Type mismatch | Thêm `&` ở argument |
| Tạo `&mut` từ owner immutable | Compile error | Owner phải `let mut` |
| Dùng `&String` rồi cố mutate | Không có quyền | Dùng `&mut String` |
| Truyền `&` vào nơi cần `&mut` | Mismatch mutability | Truyền `&mut` |
| Dùng `String` parameter khi chỉ đọc | Buộc caller move/clone | Dùng `&str`/`&String` |
| Quên: method tự deref qua ref | Tưởng phải `*` | Rust tự dereference |

## Tóm tắt bài 53

- **Reference parameter** cho hàm **mượn** giá trị, không lấy ownership → không cần return-gán-lại.
- **`&String`** (immutable ref): chỉ **đọc**; **`&mut String`** (mutable ref): **sửa** tại chỗ, vẫn không move.
- Bốn dạng parameter: `String` / `mut String` (move) và `&String` / `&mut String` (mượn).
- Tạo `&mut` cần owner **`mut`**; truyền `&`/`&mut` phải khớp **đúng quyền** với parameter.
- Rust **tự dereference** khi gọi method qua reference; nhưng quyền sửa vẫn do loại reference quyết.
- `&mut` parameter giải bài toán scale của phase 6 — pipeline build dữ liệu gọn gàng.

**Bài kế tiếp** → [Bài 54: Quy tắc borrowing — nhiều reader HOẶC một writer](02-borrowing-rules.md)
