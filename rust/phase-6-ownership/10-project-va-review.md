# Bài 52: Project & Section Review — lần theo ownership, tổng kết phase

Hết phase Ownership — phần khó nhất khoá học. Project này rèn kỹ năng quan trọng nhất: **lần theo ownership từng dòng**, xác định mỗi phép gán/lời gọi là copy hay move. Sau đó tổng kết toàn phase.

## Kỹ năng cốt lõi: hỏi "type này có Copy không?"

Mỗi khi gặp gán biến hoặc truyền vào hàm, hỏi: **type này implement Copy không?**
- **Có** (i32, bool, f64, char, &str, references) → **copy**, bản gốc valid.
- **Không** (String, Vec) → **move**, bản gốc vô hiệu.

## Phần 1: copy hay move?

```rust
fn main() {
    // (1) Boolean — Copy
    let is_concert = true;
    let is_event = is_concert;
    println!("{is_concert} {is_event}");   // OK — true true (copy)

    // (2) &str (string literal) — Copy (reference)
    let sushi = "Salmon";
    let dinner = sushi;
    println!("{sushi} {dinner}");           // OK — Salmon Salmon (copy reference)

    // (3) String — KHÔNG Copy → move
    let sushi = String::from("Salmon");
    let dinner = sushi;
    // println!("{sushi}");                 // ERROR — sushi đã move
    println!("{dinner}");                   // OK — dinner là owner mới
}
```

| Trường hợp | Type | Copy? | Bản gốc sau gán |
|---|---|---|---|
| (1) `is_concert` | `bool` | ✓ | valid |
| (2) `sushi` literal | `&str` | ✓ (reference) | valid |
| (3) `sushi` String | `String` | ✗ | **vô hiệu (move)** |

**Mẹo kiểm tra**: in cả hai biến cạnh nhau sau khi gán. Nếu compile → copy. Nếu lỗi "moved value" → move.

## Phần 2: lần theo move qua hàm

```rust
fn eat_meal(mut meal: String) -> String {   // mut để mutate, return để trả về
    meal.clear();                            // xoá hết ký tự (mutation)
    meal                                      // trả ownership về caller
}

fn main() {
    let sushi = String::from("Salmon");
    let dinner = sushi;                       // (a) move: sushi → dinner
    let fish = eat_meal(dinner);             // (b) move: dinner → meal, (c) return: meal → fish
    println!("[{fish}]");                     // [] — đã clear, chuỗi rỗng
}
```

Lần theo ownership của text "Salmon" từng bước:

```text
1. sushi   là owner gốc của "Salmon"
2. (a) let dinner = sushi   → move: dinner là owner, sushi VÔ HIỆU
3. (b) eat_meal(dinner)     → move: meal (parameter) là owner, dinner VÔ HIỆU
4.     trong eat_meal: meal.clear() xoá nội dung
5. (c) return meal          → move: fish là owner, meal hết scope
6. fish là owner cuối; cuối main, fish ra khỏi scope → dọn heap
```

Điểm học:
- `clear()` cần `mut meal` (mutation, immutable mặc định).
- Nếu **không** return `meal`, cuối `eat_meal` `meal` ra khỏi scope → **dọn** "Salmon" → mất luôn. Return mới bảo toàn.
- `fish` là owner cuối — nếu không gán return vào `fish`, giá trị bị dọn ngay.

## Phần 3: vì sao cần return để giữ giá trị

Nếu bỏ return:

```rust
fn eat_meal(mut meal: String) {              // không return
    meal.clear();
}                                             // meal ra khỏi scope → DỌN heap

fn main() {
    let dinner = String::from("Salmon");
    eat_meal(dinner);                        // move vào, không lấy lại được
    // println!("{dinner}");                 // ERROR — dinner đã move, text đã dọn
}
```

Đây chính là vấn đề bài 51 nêu: ownership thuần buộc return-rồi-gán-lại cho mọi hàm dùng giá trị — không scale. **References** (phase 7) là lời giải.

---

# Section Review — tổng kết Ownership

## Khái niệm nền

- **Ownership** = giải pháp quản lý bộ nhớ compile-time của Rust: nhanh như C, an toàn như GC.
- Ba quy tắc: (1) mỗi giá trị một owner, (2) một owner tại một thời điểm, (3) owner ra khỏi scope → drop.
- **Stack** (cố định, nhanh, LIFO) vs **Heap** (động, chậm hơn, cần allocator + reference).
- Ownership chủ yếu quản lý **heap data** (tránh trùng lặp, tránh double-free).

## Copy vs Move

```text
Type Copy (stack: i32/bool/f64/char + references &T)
   → gán/truyền = COPY, bản gốc valid (tự động, rẻ)

Type non-Copy (heap: String, Vec)
   → gán/truyền = MOVE, bản gốc vô hiệu (tránh double-free)
```

- **Copy** trait: tự động, stack, rẻ.
- **Move**: chuyển ownership, vô hiệu bản gốc, một owner dọn → an toàn.
- **`clone()`**: bản sao thật của heap (Clone trait) — hai owner độc lập, nhưng **đắt**.
- **`drop(x)`**: giải phóng heap ngay; Rust tự gọi cuối scope.

## String

- `String` (heap, động, mutable) vs `&str` (literal, nhúng binary, read-only).
- `String::new()` / `String::from()`; metadata stack (ptr/len/capacity) + text heap.
- `push_str`/`push` mutate (cần `mut`); vượt capacity → reallocate.

## References & Borrowing

- **`&value`** tạo reference (borrow) — dùng không lấy ownership, rẻ hơn clone.
- **`*ref`** dereference (Rust tự deref khi in/gọi method).
- Reference **đảm bảo** trỏ giá trị hợp lệ (≠ pointer C); **implement Copy**.
- Bốn type chuỗi: `String` / `&String` / `str` / `&str`.

## Functions & ownership

- Parameter là owner → copy/move như gán biến.
- Type Copy → copy vào hàm (bản gốc valid); non-Copy → move (bản gốc vô hiệu).
- Parameter immutable mặc định; `mut` trước tên; **mutability không theo move**.
- Return value move ownership **ra** về caller — bảo toàn giá trị.
- Ownership thuần không scale cho "dùng tạm" → **references** (phase 7).

## Bản đồ phase Ownership

```text
NỀN
  ownership (3 quy tắc) ── stack/heap ── scope

COPY vs MOVE
  Copy trait (stack + refs) → copy, bản gốc valid
  non-Copy (String)         → move, bản gốc vô hiệu
  clone (heap copy, đắt) · drop (giải phóng)

STRING
  String (heap, động) vs &str (binary, cố định)
  ptr/len/capacity · push_str · reallocate

REFERENCES
  &value (borrow) · *ref (deref) · &String/&str
  reference là Copy · đảm bảo hợp lệ

FUNCTIONS
  param = owner (copy/move) · mut param · return move ra
  → vấn đề scale → references (phase 7)
```

## Bẫy tổng hợp

| Bẫy | Cách tránh |
|---|---|
| Dùng String sau move | clone, hoặc reference |
| Tưởng mọi gán là copy | Chỉ Copy type; String move |
| `mut` biến gốc mong parameter mutate | Khai `mut` ở parameter |
| Clone tràn lan | Dùng reference khi chỉ đọc |
| Quên return → mất giá trị | Return, hoặc reference |
| Nhầm String và &str | Sở hữu vs mượn, hai type khác |

## Quy trình lần theo ownership

```text
Mỗi dòng gán/lời gọi, hỏi:
1. Type này có implement Copy không?
   → Có  → copy, cả hai valid
   → Không → move, bản gốc vô hiệu
2. Ownership đi đâu? (biến→biến, biến→param, param→return)
3. Ai là owner cuối? → ai dọn heap cuối scope?
```

## Tóm tắt phase Ownership

- **Ownership** = quản lý bộ nhớ compile-time, nhanh + an toàn, không GC.
- **Copy** (stack/refs, tự động) vs **Move** (heap, vô hiệu bản gốc); `clone` để sao thật (đắt).
- **String** (heap, động) vs **&str** (binary, cố định); references để mượn không lấy ownership.
- Hàm: parameter là owner (copy/move); return move ownership ra.
- Kỹ năng cốt lõi: **lần theo ownership từng dòng**, hỏi "Copy hay không?".

Bạn đã vượt qua phần khó nhất của Rust. Phase tiếp theo (**References & Borrowing**) xây tiếp lên reference: quy tắc borrow (nhiều reference đọc vs một reference ghi), mutable references, dangling references — giải quyết triệt để vấn đề "không scale" mà phase này kết thúc.

**Bài kế tiếp** → [Bài 53: Reference parameters — immutable vs mutable, giải bài toán scale](../phase-7-references-borrowing/01-reference-parameters.md)
