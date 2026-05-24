# Bài 2: Move Semantics

Bài này dạy:
- Lvalue vs rvalue: định nghĩa, ví dụ, vì sao cần phân biệt.
- Rvalue reference `T&&`.
- `std::move` thực sự làm gì (chỉ là cast).
- Move constructor và move assignment.
- Khi nào move tự động xảy ra (RVO, return by value).
- Perfect forwarding intro (`std::forward`).

Kết thúc bài: bạn viết được class hỗ trợ move; biết khi nào nên `std::move`, khi nào không; debug được "use after move" bug.

## Tại sao cần move semantics?

Trước C++11, mọi pass/return object là **copy**. Copy của object lớn (string, vector, file handle) tốn kém:

```cpp
std::string CreateBigString() {
  std::string s = ReadFile("huge.txt");   // s có thể là 10MB
  return s;   // Copy 10MB? Tốn kém!
}

std::string big = CreateBigString();
// Trước C++11 (giả thuyết): 2 copy — return value, gán cho big.
```

Move semantics cho phép **"steal"** internal data của object tạm thay vì copy:

```cpp
// Modern C++: s được MOVE — chỉ swap internal pointer
std::string big = CreateBigString();
```

Move = transfer ownership của resource (heap pointer, file handle) từ object này sang object khác, không copy data.

## Lvalue vs Rvalue

Đây là khái niệm cốt lõi. Mỗi expression trong C++ là **lvalue** hoặc **rvalue**.

### Lvalue

**Lvalue** = expression có **địa chỉ rõ ràng**, "có chỗ ở" — bạn có thể `&` lấy address.

```cpp
int x = 5;        // x là lvalue
&x;               // OK — có address

x = 10;           // Assignment: x ở vế trái — lvalue
int& ref = x;     // x bound được tới lvalue reference

std::string s("hello");
s.size();         // s là lvalue
```

### Rvalue

**Rvalue** = expression **không có địa chỉ tường minh**, là "giá trị tạm" — không có chỗ lưu.

```cpp
5;                // Literal — rvalue
x + 1;            // Kết quả phép cộng — rvalue
GetNumber();      // Return value của function — rvalue (thường)
std::string("hi"); // Temporary string — rvalue
```

Bạn không thể `&5` hay `&(x+1)`.

### Tại sao phân biệt?

- **Lvalue** = object có thể đang được dùng — không nên "steal" data.
- **Rvalue** = object tạm sắp die — có thể steal data thoải mái.

Move semantics tận dụng: nếu argument là rvalue, ta biết object đó sắp die → "steal" được internal data.

## Reference: lvalue vs rvalue reference

### Lvalue reference `T&`

```cpp
int x = 5;
int& r = x;     // OK — bind tới lvalue
// int& r2 = 5;  // ERROR — không bind rvalue
```

`const T&` đặc biệt — bind được cả 2:

```cpp
const int& r = 5;     // OK — const ref bind được rvalue (extend lifetime)
const std::string& s = std::string("hi");  // OK
```

### Rvalue reference `T&&` (C++11+)

```cpp
int&& rr = 5;          // OK — bind tới rvalue
// int&& rr2 = x;      // ERROR — không bind lvalue (x)
```

`T&&` chỉ bind được rvalue.

**Quan trọng**: bên trong scope, `rr` là **lvalue** (vì nó có tên, có address).

```cpp
void f(int&& rr) {
  rr = 10;     // rr là lvalue ở đây (mặc dù type là rvalue reference)
  &rr;          // OK — lấy address
}
```

→ Type của parameter là `int&&`, nhưng **expression** `rr` là lvalue.

## `std::move` — thực sự là cast

```cpp
#include <utility>

std::string a = "hello";
std::string b = std::move(a);   // a được "move into" b
// a hợp lệ nhưng unspecified state (thường empty)
```

`std::move(x)` **KHÔNG move gì cả**. Nó chỉ **cast** lvalue thành rvalue reference:

```cpp
// std::move có nghĩa: "tôi cho phép steal resource của object này"
// Equivalent với:
std::string b = static_cast<std::string&&>(a);
```

Việc steal thực sự diễn ra trong **move constructor** / **move assignment** của `std::string`.

### Sau move, object ở trạng thái gì?

Object được move from rơi vào **valid but unspecified state**:

- Hợp lệ: có thể destroy, có thể assign giá trị mới.
- Unspecified: nội dung không known.

```cpp
std::string a = "hello";
std::string b = std::move(a);

// a is hợp lệ nhưng nội dung không rõ
std::cout << a;            // Có thể empty, có thể "hello" — không định
a = "new value";           // OK — assign
a.size();                  // OK
// a.front();               // UB nếu a empty
```

→ **Sau move, đừng dùng object cũ trừ khi assign giá trị mới**.

## Move constructor và move assignment

Class hỗ trợ move bằng cách định nghĩa 2 special function:

```cpp
class MyString {
 public:
  // Constructor
  MyString(const char* s) {
    size_ = std::strlen(s);
    data_ = new char[size_ + 1];
    std::strcpy(data_, s);
  }

  // Destructor
  ~MyString() {
    delete[] data_;
  }

  // Copy constructor
  MyString(const MyString& other) {
    size_ = other.size_;
    data_ = new char[size_ + 1];
    std::strcpy(data_, other.data_);
  }

  // Copy assignment
  MyString& operator=(const MyString& other) {
    if (this != &other) {
      delete[] data_;
      size_ = other.size_;
      data_ = new char[size_ + 1];
      std::strcpy(data_, other.data_);
    }
    return *this;
  }

  // Move constructor
  MyString(MyString&& other) noexcept {
    data_ = other.data_;       // Steal pointer
    size_ = other.size_;
    other.data_ = nullptr;     // Set other vào valid empty state
    other.size_ = 0;
  }

  // Move assignment
  MyString& operator=(MyString&& other) noexcept {
    if (this != &other) {
      delete[] data_;           // Free current
      data_ = other.data_;      // Steal
      size_ = other.size_;
      other.data_ = nullptr;
      other.size_ = 0;
    }
    return *this;
  }

 private:
  char* data_ = nullptr;
  size_t size_ = 0;
};
```

Khi gọi:

```cpp
MyString a("hello");
MyString b = a;             // Copy ctor — 2 strings tồn tại
MyString c = std::move(a);  // Move ctor — c "steal" data của a; a giờ empty
MyString d("foo");
d = std::move(b);           // Move assignment — d cleanup data cũ rồi steal từ b
```

### `noexcept` — quan trọng

Move ctor và move assignment thường `noexcept`. Lý do: `std::vector` và container khác **chỉ dùng move khi noexcept**, nếu không sẽ fallback về copy (vì exception trong move giữa các phần tử = bể container).

→ **Luôn mark `noexcept` cho move ctor và move assignment** trong class của bạn.

### Default move (Rule of 0)

Nếu class chỉ chứa member tự có move (vd `std::string`, `std::vector`, `std::unique_ptr`), compiler **tự sinh** move ctor + move assignment:

```cpp
class User {
 public:
  User(std::string name, std::vector<int> ids)
      : name_(std::move(name)), ids_(std::move(ids)) {}

 private:
  std::string name_;
  std::vector<int> ids_;
};

// Tự động có move ctor & move assignment
User u1("Alice", {1, 2, 3});
User u2 = std::move(u1);  // OK — auto move
```

→ **Rule of zero**: nếu không có raw resource (`new`/`delete`, file handle, OS handle), không cần define copy/move/destructor manually.

Sẽ học sâu ở Bài 3.

## Khi nào move tự động xảy ra?

### 1. Return by value (RVO + move)

```cpp
std::string Greet() {
  std::string s = "Hello";
  return s;   // RVO hoặc move — không copy
}

std::string g = Greet();   // g nhận data trực tiếp, không copy
```

**RVO (Return Value Optimization)**: compiler có thể elide copy/move, construct trực tiếp ở caller. Nếu không elide → automatic move (vì `s` là local sắp die).

→ **KHÔNG `return std::move(s);`** — đó là antipattern! Compiler không elide được khi có move tường minh. Cứ `return s;` để RVO/auto-move work.

### 2. Pass to function nhận `T` by value với rvalue

```cpp
void TakeString(std::string s);

TakeString(std::string("hi"));    // Move ctor được dùng — rvalue source
std::string a = "hi";
TakeString(std::move(a));          // Move ctor — explicit cast
TakeString(a);                     // Copy ctor — a là lvalue
```

### 3. Temporary trong expression

```cpp
std::string Combine() {
  return "foo" + std::string("bar");   // Temp result → moved into return value
}
```

### 4. Container operation

```cpp
std::vector<std::string> v;
v.push_back("hello");                          // Move (rvalue temp)
v.push_back(std::move(some_string));           // Move (explicit)
v.push_back(some_string);                      // Copy (lvalue)
```

## Perfect forwarding — `std::forward`

```cpp
template <typename T>
void Wrapper(T&& arg) {
  Inner(std::forward<T>(arg));   // Preserve lvalue/rvalue category
}
```

Trong template, `T&&` là **forwarding reference** (không phải rvalue reference!). Nó bind được cả lvalue và rvalue:

```cpp
Wrapper(5);          // T = int, arg là int&& (rvalue ref)
int x = 5;
Wrapper(x);          // T = int&, arg là int& (lvalue ref) — collapse rule
```

`std::forward<T>(arg)` cast về đúng type ban đầu — giữ nguyên lvalue/rvalue.

Dùng trong:

- Factory function: forward args tới constructor.
- Wrapper / decorator.

Sẽ học sâu hơn ở Phase 4 (templates). Beginner chỉ cần biết: trong template `T&&` + `std::forward<T>`, đó là "perfect forwarding".

## Move với standard types

Các type của std lib đều support move:

| Type | Move cost |
|---|---|
| `std::string` | O(1) — swap pointer |
| `std::vector<T>` | O(1) — swap data pointer + size |
| `std::unique_ptr<T>` | O(1) — swap pointer |
| `std::shared_ptr<T>` | O(1) — swap (no atomic count change) |
| `std::array<T, N>` | O(N) — element-by-element move |
| `std::map`, `std::set` | O(1) — root pointer transfer |
| Trivially copyable type (`int`, struct of int) | Copy (move = copy) |

`std::array` move không faster copy — vì storage inline, không có heap pointer để swap.

## Pattern thực tế

### Sink function — take ownership

```cpp
class FileManager {
 public:
  // Sink — take ownership của contents
  void StoreContents(std::string contents) {
    contents_ = std::move(contents);   // Move into member
  }

 private:
  std::string contents_;
};

FileManager mgr;
std::string data = ReadFile("foo.txt");
mgr.StoreContents(std::move(data));   // Move into function, then into member
// data giờ empty
```

→ Pattern: parameter `T` by value + `std::move` vào member. Caller có thể pass lvalue (copy) hoặc rvalue (move) — sink quyết định.

### Forwarding constructor

```cpp
class User {
 public:
  User(std::string name, std::string email)
      : name_(std::move(name)), email_(std::move(email)) {}

 private:
  std::string name_;
  std::string email_;
};

User u1("Alice", "alice@example.com");   // Temps moved into params, then into members
std::string n = "Bob";
User u2(std::move(n), "bob@example.com");   // n moved
```

→ Take by value + move into member. Tránh extra copy.

### Swap idiom

```cpp
void swap(MyString& a, MyString& b) noexcept {
  using std::swap;
  swap(a.data_, b.data_);   // Swap raw pointer — O(1)
  swap(a.size_, b.size_);
}
```

`std::swap` cho built-in type dùng move dưới capot. Custom swap có thể tối ưu hơn.

### Copy-and-swap idiom

```cpp
MyString& operator=(MyString other) {  // Pass by value — copy hoặc move from caller
  swap(*this, other);                  // Swap with other
  return *this;
}                                       // other destroy với data cũ của *this
```

Một implementation hợp nhất copy assignment + move assignment + exception safety. Phổ biến nhưng có cost copy nếu LHS lớn hơn.

## Move trong Chromium

Chromium dùng move nhiều, đặc biệt với:

- `std::unique_ptr<T>` — luôn move, không copy.
- `base::OnceCallback` — move-only (sẽ học ở chromium-native/phase-2/01).
- `base::Value`, `std::string`, container — move when passing.

```cpp
// Chromium pattern
std::unique_ptr<Widget> CreateWidget() {
  auto w = std::make_unique<Widget>();
  // ...
  return w;     // Auto move
}

void StoreWidget(std::unique_ptr<Widget> w) {
  // Sink — take ownership
  widget_ = std::move(w);
}

auto w = CreateWidget();
StoreWidget(std::move(w));   // Explicit move
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng object sau move | UB hoặc unexpected value | Đừng dùng sau move, hoặc assign giá trị mới |
| `return std::move(s);` | Block RVO, có thể chậm hơn | Cứ `return s;` để compiler optimize |
| Quên `noexcept` cho move | Container fallback về copy | Mark move ctor/assignment `noexcept` |
| `std::move` cho object cần dùng tiếp | Bug logic | Chỉ move khi object sắp die |
| Mistake `T&&` trong non-template = forwarding ref | Không bind lvalue | Forwarding ref CHỈ trong template |
| Move trivially-copyable type | Không nhanh hơn copy | Đừng move int/bool/POD — copy là OK |
| Self-move (`a = std::move(a)`) | UB | Check `this != &other` trong move assignment |

## Tóm tắt

| Concept | Take-away |
|---|---|
| Lvalue | Có địa chỉ, có chỗ ở; bind được `T&` |
| Rvalue | Tạm thời, sắp die; bind được `T&&` |
| `T&&` | Rvalue reference (chỉ bind rvalue) |
| `std::move(x)` | Cast x thành rvalue reference — cho phép steal |
| Move ctor / move assignment | Steal resource từ rvalue source |
| `noexcept` | Mark move noexcept để container dùng được |
| RVO | Compiler elide copy/move khi return by value |
| Sau move | Object hợp lệ nhưng unspecified — đừng dùng |
| Perfect forwarding | `T&&` trong template + `std::forward` |

## Exercise (optional)

1. Implement class `Buffer` với raw `new[]` data + size. Viết copy ctor, move ctor, copy assignment, move assignment. Verify bằng cách print khi mỗi cái chạy.
2. Test: pass Buffer by value vào function. Pass cùng object 2 lần — lần 1 không `std::move`, lần 2 có. So sánh.
3. Implement sink function nhận `std::string` by value + move vào member. Verify caller's string empty sau call.
4. Try `return std::move(local)` vs `return local` — measure xem có khác biệt assembly không (`-O0` thấy rõ).

---

**Bài kế tiếp** → [Bài 3: RAII và Rule of Five](03-raii-and-rule-of-five.md)
