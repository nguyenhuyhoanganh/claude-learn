# Bài 15: Scopes — block, biến sống và chết theo cặp `{}`

Vì sao biến khai báo trong `main` không dùng được ở function khác? Vì sao biến trong vòng `for` biến mất khi loop kết thúc? Câu trả lời cho cả hai là **scope** — và hiểu scope là nền tảng để sau này hiểu **ownership**, khái niệm khó nhất của Rust.

## Scope là gì — định nghĩa

**Scope** (phạm vi) = vùng/ranh giới mà một **tên** (name — biến, hằng, function) còn **valid**, tức còn dùng được.

Scope gắn chặt với **block** (khối). **Block** = vùng nằm giữa một cặp ngoặc nhọn `{` ... `}`. Mỗi block tạo ra một scope.

```rust
fn main() {              // ┐ mở block của main → mở scope
    let coffee = 5.99;   // │ coffee valid từ đây...
    println!("{coffee}");// │
}                        // ┘ đóng block → coffee out of scope
```

`coffee` chỉ sống trong thân `main`. Ngoài `main` (dòng trước `fn main` hoặc sau `}`) không tồn tại cái tên `coffee`.

### "Out of scope" — biến chết

Khi chạm `}` cuối scope, **mọi biến khai báo trong scope đó bị Rust dọn dẹp**. Ta nói biến **"goes out of scope"** (ra khỏi phạm vi) — như thể nó không còn tồn tại.

```rust
fn main() {
    let coffee = 5.99;
}                        // coffee ra khỏi scope TẠI ĐÂY
// println!("{coffee}"); // ERROR: cannot find value `coffee`
```

Đây không chỉ là quy ước cú pháp — nó là **cơ chế quản lý bộ nhớ** của Rust. Cuối scope, Rust tự gọi dọn dẹp (drop) cho biến. Không cần `free()` thủ công như C, không cần garbage collector như Java. Phase Ownership sẽ đào sâu; giờ chỉ cần nắm: **scope quyết định vòng đời biến**.

## Block lồng nhau — outer vs inner scope

Block không chỉ đến từ function. Bạn có thể tạo block **bất kỳ đâu** bằng cặp `{}`, kể cả lồng trong function:

```rust
fn main() {                    // outer scope (của main)
    let coffee = 5.99;

    {                          // inner scope (block lồng)
        let cookie = 1.99;
        println!("{coffee}");  // OK — inner thấy được outer
        println!("{cookie}");  // OK — cookie thuộc inner
    }                          // cookie ra khỏi scope

    println!("{coffee}");      // OK — coffee vẫn sống
    // println!("{cookie}");   // ERROR — cookie đã chết
}
```

Quy tắc nhìn xuyên scope:

```text
┌─ outer scope (main) ──────────────────┐
│  coffee = 5.99                          │
│                                         │
│  ┌─ inner scope ──────────────────┐    │
│  │  cookie = 1.99                   │    │
│  │  thấy: coffee ✓  cookie ✓        │    │
│  └──────────────────────────────────┘    │
│                                         │
│  thấy: coffee ✓   cookie ✗ (đã chết)   │
└─────────────────────────────────────────┘
```

**Quy tắc một chiều:**
- Inner scope **thấy** tên của outer scope (nhìn ra ngoài được).
- Outer scope **không thấy** tên của inner scope (không nhìn vào trong được).

Lý do: tên trong inner chết khi block inner kết thúc, nên khi quay lại outer, cái tên đó đã biến mất.

## Shadowing trong inner scope khác shadowing thường

Khai báo lại cùng tên trong inner block **không phải** shadowing theo nghĩa "che vĩnh viễn" — nó tạo một biến **độc lập** chỉ sống trong inner scope:

```rust
fn main() {
    let coffee = 5.99;
    {
        let coffee = 1.99;        // biến MỚI, độc lập, chỉ trong block này
        println!("{coffee}");      // 1.99 — cái gần nhất thắng
    }
    println!("{coffee}");          // 5.99 — outer coffee không hề bị đụng
}
```

Khi truy cập một tên, Rust dùng binding **gần nhất** còn valid (inner trước, rồi mới outer). Ra khỏi inner block, binding inner chết → tên `coffee` lại trỏ về bản outer `5.99`.

So với shadowing cùng scope (bài 14): ở đó bản cũ bị che **hết phần còn lại của scope**. Ở đây bản inner chỉ che **trong block inner**, ra ngoài là hết hiệu lực.

| Tình huống | Phạm vi che | Sau block |
|---|---|---|
| Shadow cùng scope | Tới hết scope hiện tại | Vẫn là bản shadow |
| Shadow trong inner block | Chỉ trong inner block | Quay về bản outer |

## Block là expression — trả về giá trị

Đây là điểm Rust khác nhiều ngôn ngữ: **block tự nó là một expression**, có thể trả về giá trị. Dòng cuối block **không có `;`** trở thành giá trị của cả block:

```rust
fn main() {
    let price = {
        let base = 5.0;
        let tax = 0.5;
        base + tax          // KHÔNG có ; → đây là giá trị của block
    };                       // ; này kết thúc câu lệnh let

    println!("{price}");     // 5.5
}
```

`base` và `tax` chỉ sống trong block tính toán, xong việc thì chết — không làm ô nhiễm scope ngoài. Đây là pattern sạch để tính một giá trị phức tạp rồi vứt biến tạm. Phase Functions sẽ đào sâu statement vs expression; giờ ghi nhớ: **block trả về dòng cuối không có dấu `;`**.

```text
let price = {            ← block bắt đầu
    let base = 5.0;       ← statement (có ;)
    let tax  = 0.5;       ← statement (có ;)
    base + tax            ← expression cuối (KHÔNG ;) = giá trị block
};                        ← ; kết thúc let
```

## Use case thực tế: giới hạn vòng đời tài nguyên

Trong production, "biến chết cuối scope" được tận dụng để **giải phóng tài nguyên đúng lúc** — lock, file, kết nối:

```rust
use std::sync::Mutex;

fn process(data: &Mutex<Vec<i32>>) {
    let total;
    {
        let guard = data.lock().unwrap();   // chiếm lock
        total = guard.iter().sum();          // dùng dữ liệu
    }   // guard ra khỏi scope ở ĐÂY → lock tự nhả

    // Code sau đây chạy KHÔNG giữ lock — thread khác vào được
    println!("Tổng: {total}");
    expensive_work_without_lock();
}
# fn expensive_work_without_lock() {}
```

Bằng cách bọc `guard` trong block hẹp, lock được nhả ngay khi xong việc đọc, thay vì giữ tới hết function. Đây là pattern thật, dùng liên tục khi viết code đa luồng — và nó hoạt động chính nhờ quy tắc scope.

## Đào sâu: scope là nền của ownership

Rust không có garbage collector. Vậy ai dọn bộ nhớ khi biến không cần nữa? **Scope.** Quy tắc cốt lõi của Rust:

> Mỗi giá trị có một **owner** (chủ sở hữu). Khi owner ra khỏi scope, giá trị bị **drop** (dọn).

Với type đơn giản trên stack (số, bool) "drop" chỉ là quên đi slot stack — gần như free. Với type cấp phát heap (String, Vec) "drop" gọi destructor giải phóng heap memory. Cả hai đều **kích hoạt bởi `}` cuối scope**, quyết định tại compile time.

Đây là lý do bạn phải nắm scope vững **trước** khi vào phase Ownership: ownership chỉ là scope + quy tắc ai-được-giữ-giá-trị chồng lên.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng biến sau khi block chứa nó kết thúc | `cannot find value` | Khai báo ở scope đủ rộng, hoặc trả giá trị ra ngoài |
| Mong outer dùng được biến của inner | Compile error | Trả giá trị qua block-expression |
| Quên block-expression cần dòng cuối không `;` | Block trả về `()` thay vì giá trị | Bỏ `;` ở dòng giá trị cuối |
| Tạo biến tạm rò ra scope ngoài | Code khó đọc, tên rác | Bọc tính toán tạm trong block riêng |
| Tưởng inner shadow đè outer vĩnh viễn | Hiểu sai giá trị | Inner shadow chỉ sống trong inner block |

## Tóm tắt bài 15

- **Scope** = vùng một tên còn valid; **block** = vùng giữa cặp `{}`. Mỗi block tạo một scope.
- Cuối scope, mọi biến trong đó **bị drop** — đây là cơ chế quản lý bộ nhớ của Rust (không cần GC).
- Inner scope **thấy** outer; outer **không thấy** inner (quy tắc một chiều).
- Khai báo lại tên trong inner block tạo biến độc lập, ra block là quay về bản outer.
- Block là **expression**: dòng cuối không `;` trở thành giá trị của block.
- Scope là nền tảng của **ownership** — phase sau sẽ xây tiếp lên đây.

**Bài kế tiếp** → [Bài 16: Constants — hằng số biết tại compile time, sống ở file level](09-constants.md)
