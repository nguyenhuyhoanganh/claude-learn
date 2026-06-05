# Bài 36: Tổng kết khoá học + roadmap kế tiếp

> 28 phase, 36 bài. Bạn đã đi từ "install Rust" đến **memory model + ownership + lifetimes + traits + smart pointers**. Đây là nền tảng đủ để code production Rust. Bài này tổng kết, self-assessment, và 4 con đường tiếp.

## Đã học gì

### Foundations (phase 1-6)
- Cài Rust, Cargo project structure.
- Variables (immut default, mut opt-in), shadowing, scope, const, type alias.
- Scalar types (12 integer, 2 float, bool, char) + compound (tuple, array).
- Functions: param, return, statement vs expression.
- Control flow: if/else (expression), loop (return value), while, for.
- **Ownership** — feature đặc trưng nhất Rust: 3 rules, move vs copy, drop.

### Memory + References (phase 7-9)
- References `&T` / `&mut T` — borrow without ownership.
- Borrow checker rules: 1 mut OR many immut, not both.
- Slices `&str`, `&[T]` — view portion no copy.
- Structs: named field, tuple struct, unit-like, methods, builder.

### Enums + Generics (phase 10-12)
- Enums = sum type with data variants. `impl` methods.
- `match` exhaustive pattern matching + guards + bindings.
- `if let` / `while let` shorthand.
- Generics `<T>` + trait bounds. Monomorphization zero-cost.
- `Option<T>` / `Result<T, E>` — null + exception replacement.
- `?` operator propagate.

### Collections + Project (phase 13-16)
- `Vec<T>` dynamic array.
- Modules + crates + workspaces.
- `String` UTF-8 + `&str` slice. Bytes vs chars vs graphemes.
- `HashMap<K, V>` + `HashSet<T>`.
- Custom error: `thiserror` library, `anyhow` app.

### Advanced (phase 17-21)
- Error handling: panic vs Result, `?`, conversions.
- Traits: interface + default methods + derive. `impl Trait` vs `dyn Trait`.
- Lifetimes `'a`: explicit borrow tracking. Elision rules.
- Closures `|...| ...` + 3 trait Fn/FnMut/FnOnce.
- Iterators: lazy adapter chain + consumer. Zero-cost.

### Tooling + Crates (phase 22-25)
- Testing built-in: unit + integration + doc tests.
- `rand` crate: random + seedable + distribution.
- `chrono` crate: date/time + timezone + parse + format.
- `regex` crate: linear-time pattern matching.

### Smart Pointers (phase 26-27)
- `Box<T>`: heap allocation, recursive type, trait object.
- `Rc<T>`: shared ownership single-thread.
- `Cell<T>` / `RefCell<T>`: interior mutability.
- `Weak<T>`: non-owning Rc for cycle breaking.
- `OnceCell` / `LazyCell`: lazy init.

## Self-assessment — 12 câu hỏi

Trả lời được hết = ready cho project Rust thật.

1. Vì sao Rust mặc định immutable? Mut opt-in giúp gì?
2. Difference Copy vs Move? Cho ví dụ `String` vs `i32`.
3. Borrow rules: 2 rule chính?
4. `&str` vs `&String`: chọn nào cho function param?
5. `Option::unwrap()` khi nào nên dùng? Khi nào không?
6. Match exhaustive: nếu thiếu variant, compile error hay warning?
7. `impl Trait` vs `dyn Trait`: dispatch khác nhau ra sao?
8. Khi nào cần lifetime annotation explicit?
9. `Fn` vs `FnMut` vs `FnOnce`: difference 3 trait?
10. Iterator chain lazy hay eager? Khi nào execute?
11. `Rc<RefCell<T>>` solve vấn đề gì?
12. Khi nào dùng `Box<dyn Trait>` thay `impl Trait`?

Bí 3+ câu → đọc lại phase tương ứng.

## Topic NOT covered — đọc thêm

Khoá học này coverage **language**. Production Rust còn cần:

### Async/Await + Tokio
```rust
async fn fetch() -> Result<String, Error> {
    let resp = reqwest::get("https://api.example.com").await?;
    Ok(resp.text().await?)
}
```

`async`/`await` + `tokio` runtime cho HTTP, network, IO concurrent.

### Concurrency: Arc + Mutex + channels
Multi-thread sharing — `std::sync::Arc<Mutex<T>>`, `mpsc::channel`. Crossbeam, Rayon for parallel.

### Unsafe Rust
`unsafe { ... }` block cho FFI, raw pointer, custom type, perf-critical SIMD. 1% code, 99% safe.

### Macros
Declarative `macro_rules!` + procedural macro (`derive`). Build DSL.

### no_std + embedded
Run on micro-controller no heap, no OS. Bare metal.

### WebAssembly
Compile Rust to WASM, run in browser via wasm-bindgen.

### CLI: clap, structopt
Production-quality CLI parsing.

### Web backend: Axum, Actix
HTTP framework on tokio.

### Database: sqlx, diesel
Type-safe SQL.

### Serialization: serde
JSON, YAML, TOML, MessagePack — 1 trait, 100+ formats.

## Roadmap đề xuất

### Path A: Backend Engineer
1. `tokio` runtime + `axum` framework.
2. `sqlx` async DB.
3. `serde` JSON.
4. Deploy to AWS/GCP với Docker.
5. Sample project: REST API → microservice.

### Path B: CLI Developer
1. `clap` argument parsing.
2. `indicatif` progress bars.
3. `ratatui` TUI library.
4. `crossterm` cross-platform terminal.
5. Sample project: `bat`/`fd`/`ripgrep` clone.

### Path C: Systems Programmer
1. Unsafe Rust deep dive.
2. FFI binding C library.
3. Embedded `no_std`.
4. Custom allocator.
5. Sample project: minimal kernel, OS module.

### Path D: WASM / Frontend
1. `wasm-bindgen` for browser.
2. `yew` or `leptos` framework.
3. `web-sys` DOM API.
4. Deploy to Cloudflare Pages.
5. Sample project: interactive web app full Rust.

## Practice projects

Cấp độ tăng dần:

### Beginner (post-course)
- CLI calculator.
- TODO app (file persistence).
- Number guessing game.
- Markdown to HTML converter.

### Intermediate
- HTTP client with retry.
- WebSocket chat server.
- File deduplication tool.
- Mini interpreter for simple language.

### Advanced
- Database engine (key-value).
- Compiler frontend.
- Async runtime mini.
- HTTP server from scratch (no framework).

## Books + Resources

### Essential
- **The Rust Programming Language** — official book. Free <https://doc.rust-lang.org/book/>.
- **Rust by Example** — practical. <https://doc.rust-lang.org/rust-by-example/>.
- **Rustlings** — exercises. <https://github.com/rust-lang/rustlings>.

### Advanced
- **Programming Rust** — O'Reilly, Jim Blandy. Comprehensive.
- **Rust for Rustaceans** — Jon Gjengset. Intermediate to advanced.
- **Zero To Production In Rust** — Luca Palmieri. Backend specific.

### Community
- **Reddit r/rust** — active.
- **Rust Users Forum** — official.
- **This Week in Rust** — weekly newsletter.
- **Jon Gjengset YouTube** — deep technical streams.

## Career thoughts

Rust adoption trend 2024-2026:
- Linux kernel (since 6.1).
- Windows kernel components.
- Android (Treble).
- Browser engines.
- Databases (TiKV, SurrealDB, Materialize).
- Crypto/blockchain (Solana, Polkadot).
- Web (Cloudflare Pingora, Discord).
- Big tech: AWS, Microsoft, Google, Meta, Apple — all use Rust production.

Rust developer:
- Median salary: ~20-30% above Python/Go (Stack Overflow Survey).
- High demand, low supply.
- Knowledge transfers (after Rust, your Python/Go also better).

## Final words

Rust steep learning curve — bạn vừa vượt qua. Hard part now is **practice**. Mỗi project apply ownership, lifetime, trait → muscle memory build.

Đừng:
- `clone()` mọi thứ. Slow code, lazy think.
- `unwrap()` mọi nơi. Hides errors.
- Fight borrow checker — listen, redesign.

Hãy:
- Read compiler error full. Best teacher.
- Read other people's Rust code (GitHub).
- Contribute to open source.
- Pair program / code review.

> **Programming is hard. Rust makes the hardness explicit so you can address it. Most other languages hide complexity until production — at 3 AM.**

Chúc may mắn trên hành trình Rust.

## Tóm tắt khoá

- 28 phase, 36 bài.
- Cover: variables, types, ownership, references, structs/enums, generics, traits, lifetimes, closures, iterators, error handling, smart pointers, testing.
- 4 production crates: rand, chrono, regex, thiserror/anyhow.
- 4 con đường nghề: Backend, CLI, Systems, WASM.
- 12-question self-assessment.
- Resource: official book, Rust by Example, Rustlings.

**Hết khoá học. Chúc may mắn trên hành trình Rust của bạn.**
