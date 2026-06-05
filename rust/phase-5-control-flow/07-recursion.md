# Bài 40: Recursion — hàm tự gọi chính nó, base case, call stack

Một hàm có thể... gọi chính nó. Nghe điên rồ nhưng hợp lệ — đó là **recursion** (đệ quy). Recursion hay xuất hiện trong phỏng vấn nhưng ít dùng hằng ngày. Mục tiêu bài này: hiểu recursion là gì, cơ chế hoạt động (qua **call stack**), và vì sao nó nguy hiểm nếu thiếu **base case** — đừng lo nếu thấy khó, đây là một trong những chủ đề khó nhất.

## Recursion là gì

**Recursion** = khi một hàm **gọi chính nó** trong thân của nó. Không phải gọi hàm khác — gọi đúng hàm đang được định nghĩa.

```rust
fn countdown(seconds: i32) {
    println!("{seconds} giây nữa...");
    countdown(seconds - 1);         // GỌI CHÍNH NÓ — đây là recursion
}
```

Mỗi lần gọi đệ quy là một **lần thực thi độc lập** của hàm, bắt đầu lại từ đầu nhưng với argument khác. Lần gọi gốc vào **trạng thái chờ** (pending) tới khi lần gọi lồng bên trong xong, rồi kết quả "bong bóng" ngược lên.

## Vấn đề: infinite recursion

Code trên có lỗi chí mạng: nó **không bao giờ dừng**. `countdown(5)` gọi `countdown(4)` gọi `countdown(3)`... `countdown(0)` gọi `countdown(-1)`... tới âm vô cực. Giống `loop` quên `break` — nhưng hậu quả tệ hơn: **stack overflow** (sẽ giải thích).

## Base case — điều kiện dừng đệ quy

Như `loop` cần `break`, recursion cần **base case** (trường hợp cơ sở): một điều kiện (thường là `if`) **không** chứa lời gọi đệ quy, đánh dấu điểm dừng:

```rust
fn countdown(seconds: i32) {
    if seconds == 0 {
        println!("Phóng!");          // BASE CASE — không gọi đệ quy
    } else {
        println!("{seconds} giây nữa...");
        countdown(seconds - 1);      // RECURSIVE CASE — tiến về base case
    }
}

fn main() {
    countdown(5);
}
```
```text
5 giây nữa...
4 giây nữa...
3 giây nữa...
2 giây nữa...
1 giây nữa...
Phóng!
```

Hai phần bắt buộc của mọi hàm đệ quy:
1. **Base case**: điều kiện dừng, **không** gọi đệ quy (`seconds == 0`).
2. **Recursive case**: gọi chính nó với argument **tiến gần base case** (`seconds - 1`).

Thiếu base case → vô hạn. Recursive case không tiến về base case → cũng vô hạn.

## Cơ chế: call stack

Để hiểu recursion, phải hiểu **call stack** — cấu trúc Rust dùng theo dõi các hàm đang chạy. Mỗi lời gọi hàm đẩy một "frame" lên stack; hàm xong thì frame bị gỡ.

```text
countdown(5)  gọi countdown(4)  gọi countdown(3) ...

Stack lớn dần (đẩy vào):
┌─ countdown(0) ─┐  ← base case, KHÔNG gọi tiếp → bắt đầu gỡ
├─ countdown(1) ─┤
├─ countdown(2) ─┤
├─ countdown(3) ─┤
├─ countdown(4) ─┤
├─ countdown(5) ─┤
└─ main         ─┘  ← đáy stack
```

Diễn biến:
1. `main` gọi `countdown(5)` → đẩy frame, in "5...", gọi `countdown(4)`.
2. Mỗi lần gọi đẩy thêm frame; tất cả ở trạng thái **chờ** lần gọi con xong.
3. `countdown(0)` chạm base case → in "Phóng!", **không** gọi tiếp → frame này xong, **gỡ** khỏi stack.
4. Việc gỡ "bong bóng" ngược: `countdown(1)` xong → gỡ; `countdown(2)` xong → gỡ; ... tới `countdown(5)` → gỡ → về `main`.

Đây là lý do lần gọi gốc "chờ": nó chưa xong cho tới khi toàn bộ chuỗi con hoàn tất và gỡ ngược lên.

## Stack overflow — vì sao infinite recursion crash

Call stack có **kích thước giới hạn** (thường ~8MB). Mỗi frame chiếm chỗ. Infinite recursion đẩy frame mãi mãi → stack đầy → **stack overflow**, chương trình crash:

```text
thread 'main' has overflowed its stack
fatal runtime error: stack overflow
```

Khác infinite loop (`loop`) chỉ chạy mãi nhưng không tốn thêm memory, infinite **recursion** tốn memory tăng dần (mỗi frame) → crash nhanh. Đây là rủi ro thực: recursion sâu (kể cả có base case) trên dữ liệu lớn vẫn có thể tràn stack.

## Recursion vs Iteration — cùng bài toán, hai cách

Mọi thứ recursion làm được, vòng lặp (iteration) cũng làm được — thường an toàn hơn:

```rust
// Đếm ngược bằng iteration (while) — không tốn stack
fn countdown_loop(mut seconds: i32) {
    while seconds > 0 {
        println!("{seconds} giây nữa...");
        seconds -= 1;
    }
    println!("Phóng!");
}
```

| | Recursion | Iteration (loop/while/for) |
|---|---|---|
| Cơ chế dừng | base case | điều kiện loop |
| Bộ nhớ | tốn stack (mỗi frame) | hằng số (không thêm frame) |
| Nguy cơ | stack overflow | infinite loop (chạy mãi, không crash) |
| Dễ đọc cho | cấu trúc cây/phân nhánh | duyệt tuyến tính |

> Trong Rust, **ưu tiên iteration** cho hầu hết bài toán — an toàn hơn (không tràn stack), thường nhanh hơn. Recursion tỏa sáng với cấu trúc tự nhiên đệ quy: cây thư mục, parse cú pháp lồng nhau, thuật toán chia để trị. (Rust **không đảm bảo** tail-call optimization, nên đệ quy sâu thực sự có thể tràn stack — khác một số ngôn ngữ functional.)

## Use case thực tế: giai thừa (factorial)

Bài toán tự nhiên đệ quy: `n! = n × (n-1)!`, với `1! = 1`.

```rust
fn factorial(n: u64) -> u64 {
    if n <= 1 {
        1                           // base case
    } else {
        n * factorial(n - 1)        // recursive case
    }
}

fn main() {
    println!("{}", factorial(5));   // 120 = 5×4×3×2×1
}
```

Diễn biến `factorial(5)`:
```text
factorial(5) = 5 * factorial(4)        ┐ đẩy stack, chờ
factorial(4) = 4 * factorial(3)        │
factorial(3) = 3 * factorial(2)        │
factorial(2) = 2 * factorial(1)        │
factorial(1) = 1  ← base case          ┘ bắt đầu bong bóng ngược
            ↑
factorial(2) = 2 * 1   = 2
factorial(3) = 3 * 2   = 6
factorial(4) = 4 * 6   = 24
factorial(5) = 5 * 24  = 120
```

Mỗi lần gọi **chờ** lời gọi con trả về, rồi nhân và đẩy kết quả lên. Đây chính là "bong bóng ngược" của call stack.

Phiên bản iteration cho cùng kết quả, không tốn stack:

```rust
fn factorial_iter(n: u64) -> u64 {
    let mut product = 1;
    let mut count = n;
    while count > 1 {
        product *= count;
        count -= 1;
    }
    product
}
```

## Đào sâu: nhận diện bài toán đệ quy

Chìa khoá viết recursion: nhận ra bài toán **chứa phiên bản nhỏ hơn của chính nó**.

- `5! = 5 × 4!` — giai thừa của n chứa giai thừa của n-1.
- Tổng cây thư mục = tổng các file + tổng các thư mục con (mỗi thư mục con lại là bài toán y hệt).
- Duyệt cây: xử lý node, rồi đệ quy mỗi node con.

Khi thấy "bài toán = thao tác trên một phần + cùng bài toán trên phần còn lại nhỏ hơn" → ứng viên cho recursion. Rồi xác định base case (phần nhỏ nhất, dừng được).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Thiếu base case | Stack overflow crash | Luôn có điều kiện dừng không gọi đệ quy |
| Recursive case không tiến về base | Vô hạn | Argument phải tiến gần base (`n-1`) |
| Đệ quy quá sâu (dữ liệu lớn) | Tràn stack dù có base | Cân nhắc iteration |
| Quên `return` khi cần thoát sớm | Chạy tiếp ngoài ý muốn | Dùng `if/else` hoặc `return` rõ |
| Dùng recursion cho duyệt tuyến tính | Tốn stack vô ích | Dùng vòng lặp |
| Trông đợi tail-call optimization | Rust không đảm bảo | Đệ quy sâu → iteration |

## Tóm tắt bài 40

- **Recursion** = hàm **gọi chính nó**; mỗi lần gọi là một thực thi độc lập, lần gốc chờ lần con.
- Bắt buộc **base case** (điều kiện dừng, không gọi đệ quy) + recursive case (tiến về base case).
- **Call stack** theo dõi các lời gọi: đẩy frame khi gọi, gỡ khi xong, kết quả "bong bóng" ngược.
- Thiếu/sai base case → **stack overflow** (khác infinite loop: tốn memory tăng dần, crash nhanh).
- Mọi recursion viết được bằng **iteration** — Rust ưu tiên iteration (an toàn, không tràn stack).
- Recursion hợp với cấu trúc tự nhiên đệ quy (cây, chia để trị); nhận diện "bài toán chứa bản nhỏ hơn của nó".

**Bài kế tiếp** → [Bài 41: Debugging trong VSCode — breakpoint, step, watch, call stack](08-debugging-vscode.md)
