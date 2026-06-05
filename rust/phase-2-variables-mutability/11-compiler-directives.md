# Bài 18: Compiler Directives — `#[...]` và metadata điều khiển compiler

Bạn đã thấy cảnh báo vàng "unused variable" suốt mấy bài qua. Cách 1 để dập nó là prefix `_`. Có cách 2 mạnh hơn: ra lệnh trực tiếp cho compiler "đừng cảnh báo chuyện này" — bằng **compiler directive** (attribute). Và directive còn làm được nhiều hơn việc dập cảnh báo: nó là cú pháp nền cho `#[derive]`, `#[test]`, `#[tokio::main]`... mà bạn sẽ gặp khắp Rust.

## Directive là gì

**Compiler directive** (chỉ thị compiler), tên chính thức trong Rust là **attribute**, = một annotation thêm vào code để **báo compiler cách xử lý** đoạn code đó. "Directive" nghĩa là mệnh lệnh/chỉ thị. Đây là **metadata** — dữ liệu về code, không phải code chạy.

Cú pháp cơ bản:

```rust
#[allow(unused_variables)]
let x = 5;
```

```text
#  [ allow ( unused_variables ) ]
│  │  ─────  ──────────────────
│  │  tên    tham số của directive
│  └── cặp ngoặc vuông bao directive
└── dấu # bắt đầu (Shift+3)
```

Bắt buộc: dấu `#`, cặp ngoặc vuông `[]`, bên trong là tên directive (và tham số nếu có).

## Directive áp dụng cho cái nằm NGAY DƯỚI

Directive viết trên dòng/khối nào thì áp dụng cho **thứ ngay bên dưới** nó: một dòng, một function, hay một struct.

### Áp dụng cho 1 dòng

```rust
fn main() {
    #[allow(unused_variables)]
    let mile = 1600;            // được tha — không warn

    let feet = 5280;            // VẪN warn — directive chỉ áp dòng trên
}
```

### Áp dụng cho cả function

Đặt directive trên `fn` → áp dụng toàn thân function:

```rust
#[allow(unused_variables)]
fn main() {
    let mile = 1600;           // không warn
    let feet = 5280;           // không warn
    let yard = 3;              // không warn — cả function được tha
}
```

## `#![...]` — áp dụng cho cả file/crate

Có một biến thể: thêm dấu `!` sau `#` → `#![...]`. Đây là **inner attribute**, áp dụng cho **toàn bộ file/module/crate** chứ không phải thứ bên dưới.

```rust
#![allow(unused_variables)]     // áp cho TOÀN BỘ file — đặt ở đỉnh file

fn main() {
    let a = 1;                  // không warn
}
fn helper() {
    let b = 2;                  // không warn — directive phủ cả file
}
```

Quy tắc nhớ:

| Cú pháp | Tên | Áp cho | Đặt ở đâu |
|---|---|---|---|
| `#[...]` | outer attribute | Thứ **ngay dưới** (dòng/fn/struct) | Trên thứ cần áp |
| `#![...]` | inner attribute | **Toàn bộ** file/module/crate | Đỉnh file (hoặc đầu module) |

Vì sao `#!` phải ở đỉnh file: nó là "chỉ thị toàn cục", đặt trên cùng để cả compiler lẫn developer khác mở file đều thấy ngay rằng nó ảnh hưởng mọi thứ phía dưới.

## `allow` chỉ là một trong nhiều directive

`allow` cho phép một hành vi mà compiler vốn cảnh báo. Nó nhận tham số là **tên lint** (quy tắc kiểm tra) muốn tắt:

```rust
#[allow(unused_variables)]      // tắt cảnh báo biến không dùng
#[allow(dead_code)]             // tắt cảnh báo code không gọi tới
#[allow(non_snake_case)]        // tắt cảnh báo naming
```

Cùng họ với `allow` là các mức xử lý lint khác:

| Directive | Hành vi |
|---|---|
| `#[allow(lint)]` | Bỏ qua hoàn toàn — không nói gì |
| `#[warn(lint)]` | Cảnh báo (vàng) — mặc định của nhiều lint |
| `#[deny(lint)]` | Coi như **lỗi** — chặn compile |
| `#[forbid(lint)]` | Như deny, và cấm code con `allow` lại |

```rust
#![deny(unused_variables)]      // biến không dùng → LỖI, không build được
```

Pattern production: nhiều team đặt `#![deny(warnings)]` để ép code sạch tuyệt đối — mọi cảnh báo thành lỗi, không ai merge code cẩu thả được.

## Directive bạn sẽ gặp liên tục về sau

`allow` chỉ là khởi đầu. Cùng cú pháp `#[...]`, Rust dùng attribute cho rất nhiều việc "tốt", không chỉ tắt cảnh báo:

```rust
#[derive(Debug, Clone)]         // tự sinh code in debug + clone cho struct
struct Point { x: i32, y: i32 }

#[test]                          // đánh dấu function này là unit test
fn it_works() { assert_eq!(2 + 2, 4); }

#[derive(PartialEq)]             // tự sinh code so sánh ==
struct Id(u32);
```

- `#[derive(...)]` — tự động sinh implementation (Debug, Clone, PartialEq...). Sẽ gặp ở phase Structs, Traits — cực kỳ hay dùng.
- `#[test]` — đánh dấu hàm test. Phase Testing.
- `#[derive(Debug)]` — điều kiện để in struct bằng `{:?}`. Phase Data Types (Debug trait).

Điểm chung: **mọi attribute đều theo cú pháp `#[tên(tham_số)]`**. Học cú pháp một lần, dùng cho tất cả.

## Đào sâu: directive xử lý lúc nào, vì sao quan trọng

Attribute được compiler đọc và xử lý **trong lúc compile**, trước/trong khi sinh mã. Có hai nhóm tác động:

1. **Điều khiển lint** (`allow`/`deny`/`warn`): chỉ ảnh hưởng việc compiler có than phiền hay không. **Không** đổi mã chạy ra. Tắt warning không sửa được bug — chỉ giấu lời nhắc.
2. **Sinh mã / biến đổi code** (`derive`, các macro attribute như `#[tokio::main]`): thực sự **chèn thêm code** vào chương trình lúc compile. `#[derive(Debug)]` viết hộ bạn cả chục dòng implement in ấn.

Vì attribute chạy ở compile time, chúng **zero-cost runtime** — không có "lớp attribute" nào tồn tại khi chương trình chạy.

## Khi nào KHÔNG nên dùng `#[allow]`

`allow` rất dễ bị lạm dụng thành cách "giấu rác":

| Tình huống | Nên làm |
|---|---|
| Biến demo trong lúc học | Prefix `_` gọn hơn, hoặc xoá biến |
| Cảnh báo "unused" do quên dùng | **Sửa logic**, đừng tắt — có thể là bug |
| Tắt `#![allow(warnings)]` cả project | Nguy hiểm — che luôn cảnh báo thật sự quan trọng |
| Code thư viện công khai | Hạn chế allow; người dùng lib cần thấy cảnh báo |

`allow` đúng chỗ: tắt một lint **bạn hiểu rõ và cố ý chấp nhận** trong phạm vi hẹp (một dòng/một function), kèm lý do. Tắt bừa cả file/project = mù trước cảnh báo có ích.

So `_` vs `#[allow(unused_variables)]` cho biến không dùng:

| Cách | Ưu | Nhược |
|---|---|---|
| `let _x = 5;` | Ngắn, cục bộ, rõ ý "cố tình bỏ" | Đổi tên biến |
| `#[allow(unused_variables)]` | Giữ nguyên tên | Dài hơn, dễ lạm dụng phủ rộng |

Đa số trường hợp biến lẻ: dùng `_`. `allow` để dành cho khi cần tha cả khối có lý do chính đáng.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `!` khi muốn áp cả file | Directive chỉ áp dòng dưới | File-level dùng `#![...]` ở đỉnh file |
| Đặt `#![...]` giữa file | Lỗi: inner attribute sai vị trí | Đặt đỉnh file/module |
| Dùng `allow` để giấu bug thật | Bug lọt | Sửa nguyên nhân, đừng tắt cảnh báo |
| Sai tên lint | Compiler báo lint không tồn tại | Dùng Ctrl+Space (IntelliSense) chọn lint đúng |
| Tưởng allow sửa được lỗi (error) | Vẫn không build | `allow` chỉ tắt **warning/lint**, không tắt error |

## Tóm tắt bài 18

- **Compiler directive** (attribute) = metadata `#[...]` báo compiler cách xử lý code.
- `#[...]` áp cho thứ **ngay dưới**; `#![...]` áp cho **toàn file/crate**, đặt ở đỉnh.
- `allow`/`warn`/`deny`/`forbid` điều khiển mức xử lý **lint**; `deny(warnings)` ép code sạch.
- Cùng cú pháp dùng cho `#[derive]`, `#[test]`, macro attribute — gặp khắp Rust về sau.
- Xử lý ở **compile time**, zero-cost runtime. `allow` chỉ giấu cảnh báo, không sửa bug.
- Biến lẻ không dùng: ưu tiên `_`. `allow` để dành cho khối có lý do cố ý, phạm vi hẹp.

**Bài kế tiếp** → [Bài 19: Project & Section Review — ráp toàn bộ phase Variables](12-project-va-review.md)
