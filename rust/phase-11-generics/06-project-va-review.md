# Bài 90: Project & Section Review — ChatMessage generic, tổng kết phase

Hết phase Generics. Project này dựng hệ thống chat dùng generic struct + impl block hai kiểu + enum. Sau đó tổng kết toàn phase, chuẩn bị cho `Option`/`Result` (phase tiếp theo — ứng dụng quan trọng nhất của generic).

## Đề bài project

1. `DigitalContent` enum: `AudioFile`, `VideoFile`.
2. `ChatMessage<T>` struct: `content` (generic `T`), `time` (String).
3. impl block **cách 1** (chỉ `T = DigitalContent`): method `consume_entertainment`.
4. impl block **cách 2** (mọi `T`): method `retrieve_time`.
5. Tạo instance với `T` khác nhau, gọi method.

## Lời giải đầy đủ

```rust
#[derive(Debug)]
enum DigitalContent {
    AudioFile,
    VideoFile,
}

#[derive(Debug)]
struct ChatMessage<T> {               // generic struct
    content: T,                       // field generic
    time: String,                     // field cố định
}

// CÁCH 1: method chỉ cho ChatMessage<DigitalContent>
impl ChatMessage<DigitalContent> {
    fn consume_entertainment(&self) {
        println!("Đang xem {:?}", self.content);   // biết content là DigitalContent
    }
}

// CÁCH 2: method cho MỌI ChatMessage<T>
impl<T> ChatMessage<T> {
    fn retrieve_time(&self) -> String {
        self.time.clone()             // chỉ đụng time (String), không đụng T
    }
}

fn main() {
    let message = ChatMessage { content: "hi lol", time: String::from("2025-03-12") };  // T = &str
    let notification = ChatMessage { content: String::from("Pizza?"), time: String::from("2025-04-12") };  // T = String
    let audio = ChatMessage { content: DigitalContent::AudioFile, time: String::from("2025-05-12") };  // T = DigitalContent

    // consume_entertainment CHỈ trên audio (T = DigitalContent)
    audio.consume_entertainment();    // Đang xem AudioFile
    // message.consume_entertainment();  // ERROR — T là &str

    // retrieve_time trên MỌI message (mọi T)
    println!("{}", message.retrieve_time());        // 2025-03-12
    println!("{}", notification.retrieve_time());
    println!("{}", audio.retrieve_time());
}
```

### Điểm học cốt lõi

| Phần | Khái niệm |
|---|---|
| `ChatMessage<T>` | Generic struct, field generic + cố định (bài 87) |
| `impl ChatMessage<DigitalContent>` | impl cách 1 — chỉ type cụ thể (bài 88) |
| `impl<T> ChatMessage<T>` | impl cách 2 — mọi `T` (bài 88) |
| `consume_entertainment` | chỉ tồn tại khi `T = DigitalContent` |
| `retrieve_time` | tồn tại mọi `T` (chỉ đụng `time`) |
| 3 instance khác `T` | `&str`, `String`, `DigitalContent` |

### Bẫy trong project

- `impl ChatMessage<DigitalContent>` (cách 1) → `consume_entertainment` chỉ có trên `audio`; gọi trên `message` (T=&str) lỗi.
- `impl<T> ChatMessage<T>` (cách 2) → `<T>` sau `impl` bắt buộc, nếu không Rust tưởng `T` là type cụ thể.
- `retrieve_time` trả `self.time.clone()` — clone để không move String ra khỏi field.
- `consume_entertainment` dùng `{:?}` → `DigitalContent` cần derive Debug.

---

# Section Review — tổng kết Generics

## Khái niệm

- **Generic** = type argument, placeholder cho type tương lai — như parameter cho giá trị.
- "Generic" = không cụ thể; cho code tái sử dụng không khoá vào một type.
- Khai bằng `<T>` (angle bracket); convention `T` (một), `T, U` (nhiều).
- **Monomorphization**: compiler sinh phiên bản cụ thể mỗi type → zero-cost runtime.

## Function

- `fn name<T>(value: T) -> T` — generic cho parameter/return.
- Một `T` nhiều chỗ → **bắt buộc** cùng type; `<T, U>` → **cho phép** khác type.
- **Turbofish** `func::<Type>()` chỉ định type rõ (`.parse::<i32>()`).

## Struct & Enum

```text
struct Name<T> { field: T }      → field type linh hoạt
enum Name<T> { Variant(T) }      → dữ liệu variant linh hoạt
```

- Type instance bao gồm `T` cụ thể: `Name<i32>` ≠ `Name<String>`.
- Variant trơn của enum generic cần **annotate** type.
- Nền cho `Vec<T>`, `Option<T>`, `Result<T, E>`, `HashMap<K, V>`.

## impl block

```text
impl Type<String> { }    → CÁCH 1: chỉ T = String, dùng method của String được
impl<T> Type<T> { }      → CÁCH 2: mọi T, <T> sau impl khai generic
```

- Cách 1: method cho type `T` cụ thể (dùng phép đặc thù type).
- Cách 2: method cho mọi `T` (chỉ đụng phần không phụ thuộc `T`).
- `<T>` sau `impl` (cách 2) tránh Rust hiểu `T` là type cụ thể.

## Bản đồ phase Generics

```text
GENERIC = placeholder type (<T>), zero-cost (monomorphization)

FUNCTION   fn f<T>(x: T) -> T · turbofish ::<T> · <T,U> nhiều type
STRUCT     struct S<T> { f: T } · Name<i32> ≠ Name<String>
ENUM       enum E<T> { V(T) } · variant trơn cần annotate · Option<T>, Result<T,E>
IMPL       impl Type<String> (cụ thể) · impl<T> Type<T> (mọi T)
```

## Bẫy tổng hợp

| Bẫy | Cách tránh |
|---|---|
| Dùng `T` không khai `<T>` | Khai `<T>` trước |
| Một `T` mong khác type | `<T, U>` |
| `impl Type<T>` không khai `<T>` sau impl | `impl<T> Type<T>` |
| Variant trơn enum generic không annotate | `let x: E<Type> = ...` |
| Tưởng generic chậm | Zero-cost (monomorphization) |

## Tóm tắt phase Generics

- **Generic** cho code một lần dùng nhiều type — function, struct, enum, method — vẫn an toàn, zero-cost.
- Một `T` ép cùng type; `<T, U>` cho phép khác type; turbofish chỉ định rõ.
- impl block: cách 1 (type cụ thể) vs cách 2 (`impl<T>` mọi `T`).
- Nền cho mọi type generic của thư viện chuẩn.

Bạn đã nắm generic — và mảnh ghép cuối là ứng dụng quan trọng nhất của nó: **`Option<T>` và `Result<T, E>`**. Đây là cách Rust xử lý "giá trị có thể không tồn tại" (thay `null`) và "thao tác có thể lỗi" (thay exception) — hai trong những enum được dùng nhiều nhất toàn Rust. Mọi thứ về enum (phase 10) và generic (phase này) hội tụ ở đây.

**Bài kế tiếp** → [Bài 91: Option enum — xử lý giá trị có thể không tồn tại](../phase-12-option-result/01-option-enum.md)
