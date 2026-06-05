# Bài 51: Return values & ownership — trả quyền sở hữu ra khỏi hàm, vấn đề cần references

Bài 50 cho thấy truyền `String` vào hàm là **move** — hàm "nuốt" mất biến gốc. Vậy làm sao giữ lại giá trị sau khi hàm dùng? Câu trả lời ở chiều ngược: hàm **trả ownership về** caller qua return value. Bài này: move qua return, và một ví dụ cho thấy cách tiếp cận này **không scale** — đặt nền cho lý do references là giải pháp đúng (phase 7).

## Return value cũng move ownership

Bài 50: ownership move từ caller **vào** parameter. Chiều ngược lại cũng đúng: ownership move **ra** từ hàm về caller qua return value.

```rust
fn bake_cake() -> String {
    let cake = String::from("Chocolate Mousse");
    cake                              // move ownership RA, về caller
}

fn main() {
    let cake = bake_cake();           // nhận ownership
    println!("Tôi có bánh {cake}");   // Tôi có bánh Chocolate Mousse
}
```

`cake` (trong `bake_cake`) sắp ra khỏi scope cuối hàm — bình thường sẽ bị dọn. Nhưng vì ta **return** nó, ownership **move ra** về `cake` trong `main`. Text heap được **bảo toàn**, không bị dọn. `main` thành owner mới.

```text
bake_cake: cake (sắp hết scope)
              │ return → move ownership RA
              ▼
main:      cake (owner mới — text được giữ lại)
```

Return value cho phép **giữ giá trị sống** dù hàm kết thúc. Hai biến tên `cake` không sao — ownership chỉ move từ cái này sang cái kia.

## Implicit return ngắn gọn

Như bài 31, dùng implicit return (bỏ `;` dòng cuối), thậm chí bỏ biến trung gian:

```rust
fn bake_cake() -> String {
    String::from("Chocolate Mousse")   // tạo và return luôn
}
```

Vùng tinh tế: dòng này technically không có "owner tên" nào, nhưng giá trị vẫn được bảo toàn và move về caller. Nếu caller **không** gán vào biến:

```rust
bake_cake();                          // không gán → không có owner mới → DỌN luôn
```

Không owner nhận → Rust dọn ngay text heap. Ownership cần một owner để "đậu" lại.

## Vấn đề: hàm "nuốt" giá trị, phải trả lại

Đây là phần quan trọng — cho thấy giới hạn của ownership thuần. Nếu hàm chỉ **dùng** một String (kể cả chỉ đọc/mutate) rồi muốn caller giữ lại, ta **buộc** phải return nó về:

```rust
fn add_flour(mut meal: String) -> String {   // PHẢI return để trả ownership
    meal.push_str("thêm bột; ");
    meal                                       // trả về
}

fn main() {
    let mut current_meal = String::new();
    current_meal = add_flour(current_meal);    // phải gán lại
    // current_meal = add_sugar(current_meal); // và lặp lại cho MỌI hàm...
    println!("{current_meal}");
}
```

Mỗi hàm nhận String **phải** return nó, và caller **phải** gán lại — nếu không, ownership move vào hàm, hàm dọn nó cuối scope, mất giá trị. Phiền toái này áp dụng cho **mọi** giá trị owned.

## Vì sao cách này không scale

Vấn đề bùng nổ khi build dữ liệu qua nhiều bước:

```rust
fn main() {
    let mut meal = String::new();
    meal = add_flour(meal);          // trả về, gán lại
    meal = add_sugar(meal);          // trả về, gán lại
    meal = add_salt(meal);           // trả về, gán lại
    meal = add_eggs(meal);           // trả về, gán lại
    // ... mỗi bước phải return + gán lại — rườm rà
}
# fn add_flour(s: String) -> String { s }
# fn add_sugar(s: String) -> String { s }
# fn add_salt(s: String) -> String { s }
# fn add_eggs(s: String) -> String { s }
```

Tệ hơn nữa: ngay cả hàm **chỉ in** (không mutate) cũng phải return String để khỏi mất nó. Và nếu hàm nhận **nhiều** String parameter, phải trả **tất cả** về — cần bọc trong tuple:

```rust
fn process(a: String, b: String) -> (String, String) {
    println!("{a} {b}");
    (a, b)                           // phải trả CẢ HAI về qua tuple
}

fn main() {
    let x = String::from("x");
    let y = String::from("y");
    let (x, y) = process(x, y);      // nhận lại cả hai
    println!("{x} {y}");
}
```

Hàm chỉ in hai chuỗi mà phải nhận chúng, rồi đóng gói trả về tuple, caller phải destructure nhận lại — **cồng kềnh, không scale**. Chỉ để **dùng** giá trị mà phải nhảy múa chuyển ownership qua lại.

```text
Vấn đề: chỉ muốn DÙNG giá trị
nhưng ownership thuần buộc:  move vào → return ra → gán lại → lặp cho mọi hàm/giá trị
```

## Giải pháp đúng: references (phase 7)

Câu trả lời cho mớ rườm rà này là **references** (bài 48): cho hàm **mượn** giá trị thay vì lấy ownership. Mượn xong tự trả, caller giữ owner suốt — không cần return-rồi-gán-lại:

```rust
fn add_flour(meal: &mut String) {    // MƯỢN (mutable), không lấy ownership
    meal.push_str("thêm bột; ");
}                                     // không cần return!

fn main() {
    let mut meal = String::new();
    add_flour(&mut meal);            // mượn — meal vẫn owner
    add_flour(&mut meal);            // gọi lại thoải mái, không gán lại
    println!("{meal}");
}
```

So sánh:

| | Ownership thuần (return) | Reference (mượn) |
|---|---|---|
| Hàm lấy ownership? | Có (move) | Không (mượn) |
| Phải return giá trị? | **Có** (mọi giá trị) | Không |
| Caller phải gán lại? | **Có** | Không |
| Nhiều giá trị? | Bọc tuple trả hết | Mượn từng cái, gọn |
| Scale? | Kém | Tốt |

Đây chính là chủ đề chính của **phase 7 (References & Borrowing)**: reference parameters, mutable references, và quy tắc borrowing. Bài này cho bạn thấy **vì sao** chúng cần thiết — bằng cách trải nghiệm nỗi đau khi không có chúng.

## Đào sâu: khi nào return ownership vẫn đúng

Reference giải quyết "chỉ dùng tạm", nhưng **return ownership vẫn đúng** khi hàm thực sự **tạo ra** hoặc **tiêu thụ rồi biến đổi** giá trị:

```rust
// ĐÚNG return ownership: hàm TẠO giá trị mới
fn make_config() -> String {
    String::from("default-config")
}

// ĐÚNG return ownership: hàm TIÊU THỤ rồi tạo cái mới
fn into_uppercase(s: String) -> String {
    s.to_uppercase()
}
```

Quy tắc: hàm **tạo/sản xuất** giá trị → return ownership (`-> String`). Hàm chỉ **đọc/sửa tại chỗ** giá trị của caller → mượn reference. Đừng móc ownership ra-vào chỉ để dùng tạm.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên return → giá trị bị dọn cuối hàm | Mất data | Return, hoặc dùng reference |
| Return nhưng caller không gán | Dọn ngay | Gán vào biến |
| Return-rồi-gán-lại cho hàm chỉ đọc | Rườm rà, không scale | Dùng reference (phase 7) |
| Bọc tuple trả nhiều giá trị chỉ để dùng tạm | Cồng kềnh | Mượn từng reference |
| Dùng reference cho hàm tạo giá trị mới | Sai mô hình | Hàm tạo → return ownership |

## Tóm tắt bài 51

- Return value **move ownership RA** từ hàm về caller — bảo toàn giá trị dù hàm kết thúc.
- Nếu caller không gán return vào biến → không owner → giá trị bị **dọn ngay**.
- Ownership thuần buộc: hàm "nuốt" giá trị phải **return + gán lại** — kể cả hàm chỉ in.
- Cách này **không scale**: nhiều bước/nhiều giá trị → tuple cồng kềnh, rườm rà.
- Giải pháp đúng cho "dùng tạm": **references** (mượn, không lấy ownership) — chủ đề phase 7.
- Return ownership **vẫn đúng** khi hàm **tạo** hoặc **tiêu thụ-biến đổi** giá trị.

**Bài kế tiếp** → [Bài 52: Project & Section Review — lần theo ownership, tổng kết phase](10-project-va-review.md)
