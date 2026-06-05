# Bài 47: Move, drop, clone — chuyển quyền sở hữu heap data

Đây là trái tim của ownership. Ở bài 45, `let year = time;` với `i32` tạo bản sao — cả hai biến dùng được. Bây giờ lặp lại **y hệt** cú pháp với `String`, và kết quả **ngược hoàn toàn**: biến gốc bị **vô hiệu hoá**. Đây gọi là **move**, và hiểu nó là vượt qua được rào cản lớn nhất khi học Rust. Bài này: move, hàm `drop`, và `clone` để thoát move.

## Lặp lại thí nghiệm — lần này với String

Nhớ ví dụ bài 45 với `i32`:

```rust
let time = 2025;
let year = time;
println!("{time} {year}");      // OK — cả hai valid (Copy)
```

Giờ thay bằng `String`:

```rust
fn main() {
    let person = String::from("Boris");
    let genius = person;            // ??? KHÁC HẲN i32
    println!("{person}");           // ERROR!
}
```
```text
error[E0382]: borrow of moved value: `person`
  = note: `String` does not implement the `Copy` trait
  value moved here: let genius = person;
```

Cú pháp giống hệt, nhưng `person` **không dùng được nữa**. Vì sao?

## Move là gì

`String` **không** implement Copy (heap data, copy đắt). Khi `let genius = person;`, Rust **không** sao chép text trên heap (sẽ tốn memory). Thay vào đó, nó **chép metadata stack** (ptr, len, capacity) sang `genius`, nhưng **không** đụng text heap. Kết quả: vẫn **một** text trên heap, nhưng giờ có **hai** metadata trỏ tới nó.

```text
Sau "let genius = person;":

  person → [ptr, len, cap] ──┐
                              ├──> "Boris" (MỘT text trên heap)
  genius → [ptr, len, cap] ──┘
```

Vấn đề: ai dọn text heap khi hết scope? Nếu cả `person` lẫn `genius` đều dọn → **double free** (dọn hai lần) → corruption.

Giải pháp của Rust: **move ownership**. Khi gán, ownership **chuyển** từ `person` sang `genius`. `genius` thành owner mới; `person` bị **vô hiệu hoá** (như chưa từng tồn tại). Chỉ `genius` dọn text → không double free.

```text
        Quy tắc 2 (bài 43): MỘT owner tại một thời điểm.
person ──move──> genius   (person hết hiệu lực)
```

## Move ≠ shallow copy ngầm — nó vô hiệu hoá bản gốc

Điểm khác biệt với "shallow copy" của ngôn ngữ khác: ở các ngôn ngữ không có ownership, code này tạo **hai con trỏ** tới cùng heap → khi cả hai hết scope, cả hai cố dọn → **double free error** (lỗi memory corruption, lỗ hổng bảo mật).

Rust **diệt tận gốc**: move vô hiệu hoá bản gốc → không bao giờ có hai owner → không bao giờ double free. Lỗi compile-time thay vì crash runtime.

```text
Ngôn ngữ khác:  person ─┐
                        ├─> heap   → cả hai dọn → DOUBLE FREE (crash)
                genius ─┘
Rust:           person (vô hiệu) genius ─> heap → một dọn → AN TOÀN
```

## So sánh Copy vs Move

```text
                   Copy (i32, stack)        Move (String, heap)
let b = a;         tạo bản sao đầy đủ        chuyển ownership
sau đó dùng a?     ✓ valid                   ✗ vô hiệu hoá
heap?              không liên quan           một text, owner chuyển sang b
lý do              copy stack rẻ             tránh double free + copy heap đắt
```

Cùng cú pháp `let b = a;`, hành vi quyết định bởi: type có Copy (→ copy) hay không (→ move).

## Move xảy ra ở đúng dòng gán

`person` valid tới **trước** dòng move:

```rust
fn main() {
    let person = String::from("Boris");
    println!("{person}");          // OK — person còn là owner
    let genius = person;           // move xảy ra Ở ĐÂY
    // println!("{person}");       // ERROR — person đã bị move
    println!("{genius}");          // OK — genius là owner mới
}
```

## Hàm `drop` — dọn dẹp tường minh

Khi owner ra khỏi scope, Rust tự gọi hàm `drop` để giải phóng heap. Bạn cũng **tự gọi** được để dọn sớm:

```rust
fn main() {
    let person = String::from("Boris");
    drop(person);                  // dọn ngay, vô hiệu hoá person
    // println!("{person}");      // ERROR — person đã bị drop
}
```

`drop(person)` giải phóng text heap **ngay**, vô hiệu hoá `person`. Sau đó `person` không dùng được, cũng không move sang biến khác được (không còn ownership để chuyển).

`drop` chỉ làm việc với **heap data** (owner của heap). Đây là hàm Rust **tự gọi ngầm** cho mọi owner heap ở cuối scope — bạn ít khi cần gọi tay, nhưng hiểu nó giúp hình dung điều xảy ra cuối scope.

## `clone` — bản sao thật của heap data, tránh move

Muốn `person` **vẫn dùng được** sau khi gán? Cần một **bản sao thật** của text heap. Dùng method `clone`:

```rust
fn main() {
    let person = String::from("Boris");
    let genius = person.clone();   // sao chép CẢ text heap
    println!("{person}");          // OK — person vẫn valid!
    println!("{genius}");          // OK — bản sao độc lập
}
```

```text
Sau "let genius = person.clone();":

  person → [ptr,len,cap] ──> "Boris"   (text gốc)
  genius → [ptr,len,cap] ──> "Boris"   (text SAO CHÉP, ô heap riêng)
```

`clone` tạo **hai** text heap độc lập, **hai** owner → không move, cả hai valid. Đây là việc `String` (implement trait **Clone**) làm khi bạn gọi `.clone()`.

## Cái giá của clone

`clone` **nhân đôi** text trên heap → tốn memory gấp đôi. Nên **tránh** trừ khi cần. Nếu tái sử dụng được cùng một text không cần copy → dùng references (bài 48) thay vì clone.

```text
Copy (i32):    tự động, rẻ (stack)
Clone (String): thủ công .clone(), ĐẮT (nhân đôi heap)
```

> **Lời khuyên thực dụng**: người mới **đừng sợ `clone`**. Cứ clone để code chạy trước, hiểu logic. Khi giỏi hơn sẽ học giảm clone bằng references. Tối ưu memory sớm là sai lầm — chạy đúng trước, tối ưu sau.

## Đào sâu: ba trait/hàm liên quan

| | Copy | Clone | Drop |
|---|---|---|---|
| Bản chất | trait | trait (`.clone()`) | hàm `drop` |
| Khi nào | tự động (gán type stack) | thủ công gọi | cuối scope (tự) hoặc gọi tay |
| Tác dụng | sao chép bit stack | sao chép sâu (cả heap) | giải phóng heap |
| Type | stack (i32...) | heap (String, Vec...) | owner của heap |

Bộ ba này là cơ chế Rust quản lý vòng đời giá trị: tạo bản sao (Copy/Clone) hoặc huỷ (Drop), tất cả an toàn, không double-free, không leak.

## Use case thực tế: khi nào clone là đúng

```rust
fn main() {
    let original = String::from("config-data");

    // Cần giữ original VÀ đưa bản độc lập cho nơi khác sửa
    let mut working_copy = original.clone();
    working_copy.push_str("-modified");

    println!("Gốc:  {original}");        // config-data (nguyên vẹn)
    println!("Sửa:  {working_copy}");    // config-data-modified
}
```

Clone đúng khi thực sự cần **hai bản độc lập** có thể tiến hoá khác nhau. Nếu chỉ cần **đọc** cùng data ở nhiều nơi → references rẻ hơn nhiều (bài 48).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng biến sau move | `borrow of moved value` | `.clone()` hoặc reference |
| Tưởng String gán = copy | Thực ra move | Chỉ Copy type mới copy |
| Dùng biến sau `drop` | Compile error | Không dùng sau drop |
| Clone tràn lan | Tốn memory | Dùng references khi chỉ đọc |
| Sợ clone, code không chạy | Bế tắc | Người mới cứ clone trước, tối ưu sau |
| Tưởng `drop` làm việc với stack | Chỉ heap | drop cho owner heap |

## Tóm tắt bài 47

- `String` không Copy → `let b = a;` là **move**: ownership chuyển sang `b`, `a` bị **vô hiệu hoá**.
- Move chép metadata stack, **không** copy text heap → vẫn một text, owner chuyển sang.
- Move diệt tận gốc **double free** (một owner → một lần dọn) — lỗi compile thay vì crash runtime.
- **`drop(x)`** giải phóng heap ngay, vô hiệu hoá `x`; Rust tự gọi cuối scope cho owner heap.
- **`.clone()`** tạo bản sao thật của heap → hai owner độc lập, cả hai valid; nhưng **đắt** (nhân đôi heap).
- Người mới đừng sợ `clone`; cần chỉ-đọc cùng data → dùng **references** (bài 48) rẻ hơn.

**Bài kế tiếp** → [Bài 48: References & Borrowing — mượn giá trị không lấy quyền sở hữu, `&` và `*`](06-references-borrowing.md)
