# Bài 38: `loop`, `break`, `continue` — lặp vô hạn có kiểm soát

Lập trình mạnh nhờ **tự động hoá** việc lặp lại. Đếm ngược 10→0, thử lại kết nối tới khi thành công, đọc input tới khi user gõ "quit" — đều là **iteration** (lặp). Công cụ lặp đơn giản nhất của Rust là `loop`: chạy mãi mãi cho tới khi bạn bảo dừng. Bài này: `loop`, cách dừng bằng `break`, bỏ qua vòng bằng `continue`, và hai chiêu nâng cao Rust độc đáo.

## `loop` — vòng lặp vô hạn

**Iterate** = lặp lại, làm đi làm lại. `loop` khai báo một block Rust chạy **lặp vô hạn**, không có điểm dừng mặc định:

```rust
fn main() {
    loop {
        println!("Chạy");       // in mãi mãi (infinite loop)
    }
}
```

Đây là **infinite loop** (vòng lặp vô hạn) — chạy tới khi hết memory và crash. (Đừng chạy thật; nếu lỡ, Ctrl+C để dừng terminal.) Block của `loop` chạy lại từ đầu sau mỗi lần xong, vô tận.

## `break` — chấm dứt loop

Để dừng, dùng keyword **`break`** — nó "phá" ra khỏi loop. Thường gắn với `if` để dừng khi một điều kiện thoả:

```rust
fn main() {
    let mut seconds = 10;

    loop {
        if seconds == 0 {
            println!("Phóng!");
            break;                  // thoát loop
        }
        println!("{seconds} giây nữa...");
        seconds -= 1;               // PHẢI thay đổi biến, nếu không loop vô hạn
    }
}
```
```text
10 giây nữa...
9 giây nữa...
...
1 giây nữa...
Phóng!
```

Cơ chế đếm ngược:
1. `seconds` khởi tạo 10, **mut** (để giảm dần).
2. Mỗi vòng: nếu `seconds == 0` → in "Phóng!" và `break`; nếu chưa, in giây còn lại và `seconds -= 1`.
3. Sau 10 vòng, `seconds` về 0 → `if` đúng → `break` → dừng.

Điểm sống còn: phải có gì đó **thay đổi** trong loop tiến tới điều kiện `break`. Quên `seconds -= 1` → loop vô hạn.

## `loop` trả giá trị qua `break`

Điểm độc đáo của Rust (khác hầu hết ngôn ngữ): `loop` là **expression**, và `break` có thể **mang theo giá trị** — trở thành giá trị của cả loop:

```rust
fn main() {
    let mut counter = 0;

    let result = loop {
        counter += 1;
        if counter == 10 {
            break counter * 2;      // thoát VÀ trả giá trị
        }
    };                              // ; kết thúc let

    println!("{result}");           // 20
}
```

`break counter * 2` vừa thoát loop vừa trả `20` ra biến `result`. Hữu ích khi loop "tìm kiếm" một giá trị rồi trả về — chỉ `loop` làm được điều này (`while`/`for` thì không).

## `continue` — bỏ qua phần còn lại, sang vòng kế

`break` dừng **hẳn** loop. **`continue`** chỉ dừng **vòng hiện tại**, nhảy ngay tới đầu vòng kế — bỏ qua code còn lại trong block:

```rust
fn main() {
    let mut seconds = 21;

    loop {
        if seconds <= 0 {
            println!("Phóng!");
            break;
        }
        if seconds % 2 == 0 {
            println!("{seconds} giây (chẵn) — bỏ 3 giây");
            seconds -= 3;
            continue;               // sang vòng kế, BỎ QUA code dưới
        }
        println!("{seconds} giây nữa...");
        seconds -= 1;
    }
}
```

Khi `seconds` chẵn: in thông báo chẵn, giảm 3, rồi `continue` → **không** chạy hai dòng cuối (in thường + giảm 1). Không có `continue`, code sẽ chạy tiếp cả hai dòng đó — sai logic.

```text
break    : thoát HẲN loop
continue : bỏ phần còn lại của vòng HIỆN TẠI, nhảy về đầu vòng kế
```

`continue` ≈ "else ngầm": thay vì bọc phần còn lại trong `else`, ta `continue` để nhảy qua.

## Bonus: labeled loops — break/continue loop ngoài

Khi lồng nhiều loop, `break`/`continue` mặc định chỉ tác động loop **trong cùng**. Để thoát loop **ngoài** từ trong loop trong, dùng **label** (nhãn) — tên bắt đầu bằng `'`:

```rust
fn main() {
    'outer: loop {
        loop {
            println!("trong loop trong");
            break 'outer;           // thoát thẳng loop NGOÀI
        }
        println!("dòng này không bao giờ chạy");
    }
    println!("xong");
}
```

`'outer:` đặt tên loop ngoài; `break 'outer` thoát thẳng nó (không chỉ loop trong). Cũng dùng `continue 'outer`. Đây là tính năng Rust ít ngôn ngữ có — cứu khi xử lý ma trận 2D, tìm kiếm lồng nhau, cần thoát nhiều tầng cùng lúc.

```rust
// Ví dụ thật: tìm trong lưới 2D, thoát cả 2 loop khi thấy
fn find(grid: [[i32; 3]; 3], target: i32) -> Option<(usize, usize)> {
    'search: for (r, row) in grid.iter().enumerate() {
        for (c, &val) in row.iter().enumerate() {
            if val == target {
                return Some((r, c));   // (hoặc break 'search nếu chỉ cần thoát)
            }
        }
    }
    None
}
# fn main() {}
```

## Đào sâu: `loop` vs `while` — khi nào dùng cái nào

`loop` là vòng lặp "thuần" nhất, nhưng thường `while`/`for` rõ ý hơn (bài 39):

| Dùng `loop` khi | Dùng `while`/`for` khi |
|---|---|
| Cần lặp **vô hạn** rồi `break` theo điều kiện phức tạp | Có điều kiện dừng rõ ràng ngay đầu |
| Cần `break` **trả giá trị** | Không cần trả giá trị từ loop |
| Điều kiện dừng kiểm **giữa/cuối** vòng | Điều kiện dừng kiểm **đầu** vòng |
| Vòng lặp event/server chạy mãi | Duyệt collection, đếm |

`loop` + `break` mạnh và rõ khi điều kiện dừng nằm giữa thân vòng (như đếm ngược: in trước, kiểm sau). Khi điều kiện dừng tự nhiên ở đầu, `while` gọn hơn.

## Use case thực tế: retry với giới hạn

```rust
fn main() {
    let mut attempts = 0;
    let max_attempts = 3;

    let connected = loop {
        attempts += 1;
        println!("Thử kết nối lần {attempts}...");

        if try_connect() {
            break true;             // thành công → trả true
        }
        if attempts >= max_attempts {
            break false;            // hết lượt → trả false
        }
    };

    println!("Kết nối: {connected}");
}

fn try_connect() -> bool { false }   // giả lập luôn fail
```

`loop` + `break <giá trị>` là pattern lý tưởng cho retry: lặp tới khi thành công **hoặc** hết lượt, trả kết quả ra ngoài.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên thay đổi biến điều kiện | Infinite loop | Đảm bảo có gì tiến tới `break` |
| Quên `mut` cho biến đếm | Compile error | `let mut` |
| `continue` nhưng quên cập nhật biến trước đó | Infinite loop | Cập nhật biến TRƯỚC `continue` |
| Mong `break` thoát loop ngoài | Chỉ thoát loop trong | Dùng label `break 'outer` |
| `break value` với `while`/`for` | Không hỗ trợ | Chỉ `loop` trả giá trị qua break |
| Đếm ngược kiểm `== 0` nhưng giảm >1 | Vượt qua 0, vô hạn | Kiểm `<= 0` cho an toàn |

## Tóm tắt bài 38

- `loop { }` lặp **vô hạn**; dừng bằng **`break`** (thường gắn `if` + điều kiện).
- Phải có gì đó **thay đổi** trong loop tiến tới `break`, nếu không vô hạn (biến đếm cần `mut`).
- `loop` là expression: **`break value`** trả giá trị ra ngoài — chỉ `loop` làm được.
- **`continue`** bỏ phần còn lại của vòng hiện tại, nhảy về đầu vòng kế (≠ `break` dừng hẳn).
- **Labeled loop** `'name:` + `break 'name` thoát/continue loop **ngoài** từ loop lồng.
- Dùng `loop` khi cần lặp vô hạn/trả giá trị/điều kiện dừng giữa vòng; `while`/`for` khi dừng rõ ở đầu.

**Bài kế tiếp** → [Bài 39: `while` loop — lặp khi điều kiện còn đúng, so sánh loop/while/for](06-while-loop.md)
