# Bài 1: Behavioral Design Patterns - Tổng quan

## Behavioral Patterns là gì?

Behavioral Patterns giải quyết câu hỏi: **"Làm thế nào để các class và object giao tiếp và phân chia trách nhiệm với nhau?"**

Chúng tập trung vào:
- **Cách các object tương tác** với nhau
- **Cách phân chia trách nhiệm** giữa các object
- **Cách thiết kế luồng điều khiển** (flow of control) trong chương trình

## 12 Behavioral Patterns

| Pattern | Mục đích | Từ khóa |
|---------|----------|---------|
| **Chain of Responsibility** | Truyền request qua chuỗi handler | Pipeline, Filter |
| **Command** | Đóng gói request thành object | Undo/Redo, Queue |
| **Interpreter** | Định nghĩa grammar và interpret câu | DSL, Parser |
| **Mediator** | Object trung gian quản lý giao tiếp | Chat room, Controller |
| **Iterator** | Duyệt collection mà không lộ cấu trúc | for-each |
| **Memento** | Lưu và khôi phục trạng thái | Undo, Snapshot |
| **Observer** | Notify nhiều object khi state thay đổi | Event listener |
| **State** | Thay đổi behavior theo state | FSM, Workflow |
| **Strategy** | Đổi algorithm lúc runtime | Sort, Payment |
| **Template Method** | Skeleton algorithm, subclass điền chi tiết | Framework hooks |
| **Visitor** | Thêm operation mà không sửa class | Report generator |
| **Null Object** | Object không làm gì thay cho null | Default behavior |

## Khi nào dùng Behavioral Patterns?

| Tình huống | Pattern phù hợp |
|-----------|----------------|
| Xử lý request qua nhiều bước validation/filtering | Chain of Responsibility |
| Cần undo/redo hoặc queue operations | Command |
| Phải parse custom language hoặc expression | Interpreter |
| Nhiều object cần giao tiếp phức tạp với nhau | Mediator |
| Cần duyệt collection theo cách khác nhau | Iterator |
| Cần save/restore state (Ctrl+Z) | Memento |
| Cần notify nhiều listener khi state thay đổi | Observer |
| Behavior của object thay đổi theo state | State |
| Cần đổi algorithm mà không sửa context | Strategy |
| Các subclass khác nhau ở một vài bước | Template Method |
| Cần thêm operation vào hierarchy mà không sửa | Visitor |
| Muốn tránh null check ở khắp nơi | Null Object |

## Phân biệt nhanh các Behavioral Patterns hay bị nhầm

| Pattern A | Pattern B | Điểm khác nhau |
|---------|---------|---------------|
| **Strategy** | **State** | Strategy: client chọn algorithm; State: tự chuyển state |
| **Command** | **Chain of Responsibility** | Command: một handler cụ thể; CoR: nhiều handler, truyền tiếp |
| **Observer** | **Mediator** | Observer: broadcast 1-nhiều; Mediator: nhiều-nhiều qua trung gian |
| **Template Method** | **Strategy** | Template: inheritance + override; Strategy: composition + delegate |

---
**Tiếp theo:** Chain of Responsibility →
