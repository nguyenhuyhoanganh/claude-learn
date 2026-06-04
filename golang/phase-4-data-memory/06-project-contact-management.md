# Bài 6: Contact Management System — Project áp dụng struct + slice + map + pointer

Tổng kết Phase 4 bằng một mini-app **Contact Management** thực dụng. App quản lý danh bạ — add/find/list/delete contact. Áp dụng **struct** (chưa học chính thức nhưng peek trước), **slice** (chứa list), **map** (lookup nhanh theo tên), **pointer** (trả `nil` khi không tìm thấy). Đây là microcosm cho 80% CRUD application.

## Yêu cầu

```text
[Tính năng]
- Add contact (Name, Email, Phone)
- Find by name → trả về pointer hoặc nil
- List all contacts
- Delete by name
- Duplicate name → reject
- ID tự động tăng

[Implement]
- Slice []Contact: lưu list theo thứ tự add
- Map[string]int: index theo tên → vị trí trong slice (lookup O(1))
- nextID counter
- init() function chạy trước main để setup
```

## Step 1: Setup

```bash
mkdir contact-manager
cd contact-manager
go mod init github.com/yourname/contact-manager
```

## Step 2: Define struct + state

```go
package main

import (
    "fmt"
    "strings"
)

type Contact struct {
    ID    int
    Name  string
    Email string
    Phone string
}

var (
    contacts      []Contact
    indexByName   map[string]int   // name → index trong slice
    nextID        int
)

func init() {
    contacts = make([]Contact, 0, 100)
    indexByName = make(map[string]int, 100)
    nextID = 1
}
```

Giải thích:
- `Contact` struct với 4 field public (chữ hoa).
- `contacts` slice giữ list theo thứ tự insert.
- `indexByName` map cho lookup O(1) theo tên.
- `nextID` tự tăng cho ID.
- `init()` chạy trước `main` — Go runtime guarantee.

**Lưu ý về `init()`**: dùng cho setup global. Không lạm dụng — khi có nhiều `init` ở nhiều file, thứ tự khó dự đoán.

## Step 3: Add contact

```go
func AddContact(name, email, phone string) error {
    name = strings.TrimSpace(name)
    if name == "" {
        return fmt.Errorf("name is required")
    }

    // Check duplicate
    if _, exists := indexByName[name]; exists {
        return fmt.Errorf("contact %q already exists", name)
    }

    c := Contact{
        ID:    nextID,
        Name:  name,
        Email: email,
        Phone: phone,
    }
    nextID++

    contacts = append(contacts, c)
    indexByName[name] = len(contacts) - 1   // index của contact vừa add

    fmt.Printf("✓ Added contact #%d: %s\n", c.ID, c.Name)
    return nil
}
```

Pattern:
- Return `error` thay vì panic. Caller quyết định handle.
- Trim whitespace input.
- Map maintain song song với slice — modify slice phải update map.

## Step 4: Find contact (return pointer)

```go
func FindByName(name string) *Contact {
    idx, ok := indexByName[name]
    if !ok {
        return nil
    }
    return &contacts[idx]
}
```

Pattern quan trọng:
- Return `*Contact` (pointer) thay vì `Contact` (value).
- `nil` = không tìm thấy. Caller check `if c == nil`.
- `&contacts[idx]` — pointer trỏ thẳng vào slice element. **Caller có thể modify**:

```go
c := FindByName("Alice")
if c != nil {
    c.Phone = "+84-123"   // modify slice element trực tiếp
}
```

→ Đây là sức mạnh của pointer. Production tuỳ tình huống: cho phép modify (admin tool) hoặc cấm (return copy).

## Step 5: Delete contact

```go
func Delete(name string) error {
    idx, ok := indexByName[name]
    if !ok {
        return fmt.Errorf("contact %q not found", name)
    }

    // Xoá khỏi slice
    contacts = append(contacts[:idx], contacts[idx+1:]...)
    delete(indexByName, name)

    // Cập nhật index cho các contact phía sau (vì index dịch xuống 1)
    for i := idx; i < len(contacts); i++ {
        indexByName[contacts[i].Name] = i
    }

    fmt.Printf("✓ Deleted %s\n", name)
    return nil
}
```

Bẫy quan trọng: khi xoá phần tử giữa slice, **mọi index sau đó dịch xuống 1**. Map index phải update theo.

Tối ưu hơn (Go 1.21+):
```go
contacts = slices.Delete(contacts, idx, idx+1)
```

Hoặc nếu không quan tâm thứ tự, swap-and-pop O(1):
```go
last := len(contacts) - 1
if idx != last {
    contacts[idx] = contacts[last]
    indexByName[contacts[idx].Name] = idx
}
contacts = contacts[:last]
delete(indexByName, name)
```

## Step 6: List contacts

```go
func List() {
    if len(contacts) == 0 {
        fmt.Println("(no contacts)")
        return
    }

    fmt.Println("───────────────────────────────────────────────")
    fmt.Printf("%-4s %-20s %-25s %-15s\n", "ID", "NAME", "EMAIL", "PHONE")
    fmt.Println("───────────────────────────────────────────────")
    for _, c := range contacts {
        fmt.Printf("%-4d %-20s %-25s %-15s\n",
            c.ID, c.Name, c.Email, c.Phone)
    }
    fmt.Println("───────────────────────────────────────────────")
    fmt.Printf("Total: %d contacts\n", len(contacts))
}
```

## Step 7: Update contact

```go
func Update(name string, email, phone string) error {
    idx, ok := indexByName[name]
    if !ok {
        return fmt.Errorf("contact %q not found", name)
    }
    
    if email != "" {
        contacts[idx].Email = email
    }
    if phone != "" {
        contacts[idx].Phone = phone
    }
    return nil
}
```

→ Truy cập slice element bằng index = modify in-place. Khác với `c := contacts[idx]` (copy).

## Step 8: main() chạy thử

```go
package main

func main() {
    AddContact("Alice Wonderland", "alice@wonder.land", "+1-555-1234")
    AddContact("Bob Builder", "bob@build.it", "+1-555-5678")
    AddContact("Charlie Chaplin", "charlie@silent.film", "+1-555-9999")
    AddContact("Alice Wonderland", "duplicate@example.com", "")   // sẽ fail

    List()

    fmt.Println("\n--- Find Bob ---")
    if c := FindByName("Bob Builder"); c != nil {
        fmt.Printf("Found: %+v\n", *c)
    } else {
        fmt.Println("Bob not found")
    }

    fmt.Println("\n--- Update Bob phone ---")
    Update("Bob Builder", "", "+1-555-0000")

    fmt.Println("\n--- Delete Alice ---")
    Delete("Alice Wonderland")
    List()
}
```

Chạy:
```bash
go run .
```

Output:
```text
✓ Added contact #1: Alice Wonderland
✓ Added contact #2: Bob Builder
✓ Added contact #3: Charlie Chaplin
───────────────────────────────────────────────
ID   NAME                 EMAIL                     PHONE
───────────────────────────────────────────────
1    Alice Wonderland     alice@wonder.land         +1-555-1234
2    Bob Builder          bob@build.it              +1-555-5678
3    Charlie Chaplin      charlie@silent.film       +1-555-9999
───────────────────────────────────────────────
Total: 3 contacts

--- Find Bob ---
Found: {ID:2 Name:Bob Builder Email:bob@build.it Phone:+1-555-5678}

--- Update Bob phone ---

--- Delete Alice ---
✓ Deleted Alice Wonderland
───────────────────────────────────────────────
ID   NAME                 EMAIL                     PHONE
───────────────────────────────────────────────
2    Bob Builder          bob@build.it              +1-555-0000
3    Charlie Chaplin      charlie@silent.film       +1-555-9999
───────────────────────────────────────────────
Total: 2 contacts
```

## Bẫy đã gặp trong project này

| Bẫy | Trong project |
|---|---|
| Map index không sync với slice | Sau Delete, map index phải update toàn bộ phần tử sau |
| Return value vs pointer khi find | Pointer cho phép modify, value chỉ đọc |
| Loop modify khi delete | Dùng slice operations đúng (Delete + reindex) |
| `init` chạy trước main | Nhớ setup global var đúng chỗ |
| Pointer trỏ vào slice element | Hữu ích cho modify, nhưng nếu slice grow → pointer cũ invalid! |

### Bẫy pointer trỏ vào slice element + grow

```go
c := FindByName("Alice")    // c trỏ vào &contacts[0]
AddContact("Z", "", "")     // có thể trigger slice grow → realloc
// c giờ trỏ vào array CŨ — không phải data hiện tại!
*c                          // có thể giá trị cũ
```

→ Bug khó debug. Fix: copy out khi cần lưu dài:
```go
c := FindByName("Alice")
if c != nil {
    snapshot := *c   // copy value
    // dùng snapshot, không phụ thuộc slice
}
```

Production safer: dùng `map[string]*Contact` (lưu pointer trực tiếp, không phụ thuộc slice index):
```go
var contactByName = map[string]*Contact{}
```

## Refactor: tách thành package

```text
contact-manager/
├── go.mod
├── main.go
└── contact/
    └── contact.go
```

`contact/contact.go`:
```go
package contact

type Contact struct { ... }

type Manager struct {
    contacts    []Contact
    indexByName map[string]int
    nextID      int
}

func New() *Manager {
    return &Manager{
        contacts:    make([]Contact, 0, 100),
        indexByName: make(map[string]int, 100),
        nextID:      1,
    }
}

func (m *Manager) Add(name, email, phone string) error { ... }
func (m *Manager) FindByName(name string) *Contact { ... }
func (m *Manager) Delete(name string) error { ... }
func (m *Manager) List() []Contact { ... }
```

`main.go`:
```go
package main

import "github.com/yourname/contact-manager/contact"

func main() {
    m := contact.New()
    m.Add("Alice", "a@x.com", "+1")
    m.Add("Bob",   "b@x.com", "+2")
    // ...
}
```

→ Có thể tạo nhiều `Manager` (test, multi-tenant). Không phụ thuộc global state.

Phase 6 (OOP) sẽ kỹ về method, struct.

## Test (peek)

```go
// contact_test.go
package contact

import "testing"

func TestAdd(t *testing.T) {
    m := New()
    err := m.Add("Alice", "a@x.com", "+1")
    if err != nil {
        t.Fatalf("add fail: %v", err)
    }
    if c := m.FindByName("Alice"); c == nil {
        t.Error("Alice should exist")
    }
}

func TestDuplicate(t *testing.T) {
    m := New()
    m.Add("Alice", "", "")
    if err := m.Add("Alice", "", ""); err == nil {
        t.Error("duplicate should error")
    }
}

func TestDelete(t *testing.T) {
    m := New()
    m.Add("Alice", "", "")
    m.Add("Bob", "", "")
    m.Delete("Alice")
    if c := m.FindByName("Alice"); c != nil {
        t.Error("Alice should be gone")
    }
    if c := m.FindByName("Bob"); c == nil {
        t.Error("Bob should remain")
    }
}
```

```bash
go test ./...
```

## Bài tập mở rộng

1. Search by partial name (substring match).
2. Sort contacts: by name, by ID, by latest added.
3. Import/export CSV.
4. Persistence: save tới file JSON, load lại khi start.
5. Pagination: `ListPage(page, size int) []Contact`.
6. Tag system: contact có `Tags []string`, filter by tag.
7. Concurrent-safe: thêm `sync.RWMutex`.

## Pattern production rút ra

### 1. Composite data: slice + map cho dual access

```go
// Slice: thứ tự, iterate, append O(1)
// Map: lookup theo key O(1)
contacts    []Contact
indexByName map[string]int
```

Pattern phổ biến cho: order book (price + time), cache (key + recency), session (id + token).

### 2. Return `*T` thay vì `(T, bool)` cho lookup

```go
// Cách 1: comma-ok
c, ok := m.FindByName("Alice")

// Cách 2: pointer hoặc nil
c := m.FindByName("Alice")
if c == nil { ... }
```

Cả 2 đều OK. Pointer-or-nil cho phép modify; comma-ok rõ "tồn tại hay không".

### 3. `Init()` cho global setup

Limit dùng `init()` vì hard to test. Tốt hơn: factory function `New()` + dependency injection.

### 4. Validate input ở boundary

```go
func Add(name, email, phone string) error {
    name = strings.TrimSpace(name)
    if name == "" { return ... }
    // ...
}
```

Validate ở public API, bên trong trust data.

## Tóm tắt bài 6

- Build mini-app CRUD áp dụng Phase 4: struct, slice, map, pointer.
- Pattern dual-index: slice (order) + map (fast lookup) — common trong production.
- Return `*Contact` cho `Find` → caller có thể modify trực tiếp. **Cẩn thận khi slice grow → pointer cũ invalid**.
- Delete phần tử giữa slice → reindex map.
- Refactor thành `package contact` + `New() *Manager` cho testability.
- `init()` chạy trước `main` — dùng sparingly.
- Test: `go test` với các case happy path + edge case.

🎉 **Hoàn thành Phase 4**. Bạn đã có nền tảng data structures + memory model của Go. Đủ tự tin attack Phase 5 (Functions & Error handling).

**Bài kế tiếp** → [Phase 5 - Bài 1: Functions — function value, closure, named return](../phase-5-functions-errors/01-functions-deep.md)
