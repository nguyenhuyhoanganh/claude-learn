# Bài 7: Memento Pattern

## Memento Pattern là gì?

Memento là một **Behavioral Design Pattern** cho phép lưu và khôi phục trạng thái trước đó của một object mà không vi phạm encapsulation.

**Ý tưởng cốt lõi:** Chụp "ảnh" trạng thái của object (memento), lưu bên ngoài (caretaker), và khôi phục khi cần — mà không để bên ngoài biết state bên trong object.

**Ví dụ thực tế:**
- Undo/Redo trong các ứng dụng
- Game save/load
- Database transaction (savepoint + rollback)
- Snapshot trong virtual machines
- Git commits

## Ba thành phần

1. **Originator:** Object có state cần lưu. Tạo Memento và khôi phục từ Memento.
2. **Memento:** Object chứa snapshot của Originator's state. "Opaque" — không ai được sửa ngoại trừ Originator.
3. **Caretaker:** Lưu giữ Mementos. Không biết và không được đọc nội dung bên trong.

## UML Cấu trúc

```
Caretaker ──────> Memento (opaque)
                      ↑ (tạo và đọc)
               Originator
               - state
               + save(): Memento  (tạo memento)
               + restore(Memento) (khôi phục từ memento)
```

## Implement Memento Pattern

```java
// Originator - object cần lưu state
public class TextEditor {
    private String content;
    private int cursorPosition;
    private String selectedText;
    
    public TextEditor() {
        this.content = "";
        this.cursorPosition = 0;
        this.selectedText = "";
    }
    
    public void write(String text) {
        content += text;
        cursorPosition = content.length();
    }
    
    public void select(int start, int end) {
        selectedText = content.substring(start, end);
        System.out.println("Selected: '" + selectedText + "'");
    }
    
    public void deleteSelected() {
        if (!selectedText.isEmpty()) {
            content = content.replace(selectedText, "");
            selectedText = "";
        }
    }
    
    public String getContent() { return content; }
    
    // Tạo Memento - snapshot của state hiện tại
    public EditorMemento save() {
        return new EditorMemento(content, cursorPosition, selectedText);
    }
    
    // Khôi phục từ Memento
    public void restore(EditorMemento memento) {
        this.content = memento.getContent();
        this.cursorPosition = memento.getCursorPosition();
        this.selectedText = memento.getSelectedText();
    }
    
    @Override
    public String toString() {
        return "Content: '" + content + "', Cursor: " + cursorPosition;
    }
    
    // Memento - inner class để Originator có thể truy cập private state
    // Class này là "opaque" - Caretaker chỉ biết nó tồn tại, không biết nội dung
    public static final class EditorMemento {
        private final String content;        // snapshot
        private final int cursorPosition;    // snapshot
        private final String selectedText;   // snapshot
        
        // Package-private constructor - chỉ Originator mới tạo được
        private EditorMemento(String content, int cursorPosition, String selectedText) {
            this.content = content;
            this.cursorPosition = cursorPosition;
            this.selectedText = selectedText;
        }
        
        // Chỉ Originator cần getters - nhưng để đơn giản, giữ private
        private String getContent() { return content; }
        private int getCursorPosition() { return cursorPosition; }
        private String getSelectedText() { return selectedText; }
    }
}

// Caretaker - lưu giữ Mementos, không biết nội dung bên trong
public class UndoManager {
    private final Deque<TextEditor.EditorMemento> history = new ArrayDeque<>();
    private final Deque<TextEditor.EditorMemento> redoStack = new ArrayDeque<>();
    private final TextEditor editor;
    
    public UndoManager(TextEditor editor) {
        this.editor = editor;
    }
    
    public void save() {
        history.push(editor.save()); // chụp snapshot
        redoStack.clear(); // xóa redo khi có action mới
        System.out.println("State saved. History size: " + history.size());
    }
    
    public void undo() {
        if (history.isEmpty()) {
            System.out.println("Nothing to undo");
            return;
        }
        redoStack.push(editor.save()); // lưu current state vào redo
        editor.restore(history.pop()); // khôi phục
        System.out.println("Undo! " + editor);
    }
    
    public void redo() {
        if (redoStack.isEmpty()) {
            System.out.println("Nothing to redo");
            return;
        }
        history.push(editor.save());
        editor.restore(redoStack.pop());
        System.out.println("Redo! " + editor);
    }
}

// Client
public class Main {
    public static void main(String[] args) {
        TextEditor editor = new TextEditor();
        UndoManager undoManager = new UndoManager(editor);
        
        undoManager.save(); // save initial state (empty)
        
        editor.write("Hello");
        undoManager.save();
        System.out.println(editor); // Content: 'Hello', Cursor: 5
        
        editor.write(" World");
        undoManager.save();
        System.out.println(editor); // Content: 'Hello World', Cursor: 11
        
        editor.write("!");
        System.out.println(editor); // Content: 'Hello World!', Cursor: 12
        // (chưa save)
        
        undoManager.undo(); // → 'Hello World'
        undoManager.undo(); // → 'Hello'
        undoManager.undo(); // → '' (empty)
        
        undoManager.redo(); // → 'Hello'
        undoManager.redo(); // → 'Hello World'
    }
}
```

## Ví dụ thực tế: Database Savepoint

```java
// JDBC Savepoint là Memento pattern
Connection conn = DriverManager.getConnection("...");
conn.setAutoCommit(false);

// Savepoint = Memento
Savepoint savepoint1 = conn.setSavepoint("after_insert_user");

try {
    conn.prepareStatement("INSERT INTO users VALUES(...)").execute();
    
    Savepoint savepoint2 = conn.setSavepoint("after_update_profile");
    conn.prepareStatement("UPDATE profiles SET...").execute();
    
    // Lỗi xảy ra
    conn.prepareStatement("DELETE FROM users WHERE...").execute(); // sai!
    
    conn.commit();
} catch (SQLException e) {
    // Khôi phục về savepoint (Memento)
    conn.rollback(savepoint2); // quay về trước DELETE
    conn.commit();
}
```

## So sánh Memento vs Command (cho Undo)

| | Memento | Command |
|--|---------|---------|
| **Undo cách** | Khôi phục snapshot | Thực thi inverse operation |
| **Storage** | State (có thể tốn memory) | Inverse operations |
| **Complexity** | Đơn giản hơn (chỉ copy state) | Phức tạp hơn (cần biết inverse) |
| **Dùng khi** | State đơn giản, dễ copy | Operations phức tạp, reversible |

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Encapsulation** | Memento không được expose state ra ngoài (opaque) |
| **Memory** | Nhiều snapshot = nhiều RAM → cân nhắc giới hạn history |
| **Serialization** | Memento có thể serialize để persist (save game) |
| **Shallow vs Deep** | Cần deep copy nếu state chứa mutable objects |

## Pitfalls (Nhược điểm)

1. **Memory usage:** Lưu nhiều snapshots → tốn RAM
2. **Deep copy:** Nếu state có mutable objects → phải deep copy → chậm
3. **Caretaker ignorance:** Caretaker không biết memory cost của mỗi memento
4. **Language limitations:** Một số ngôn ngữ không có cách tốt để enforce opaqueness

## Tóm lại

```
Memento = Lưu snapshot của state để khôi phục sau, không vi phạm encapsulation
```

**Dùng Memento khi:**
- Cần undo/redo functionality
- Cần save/restore state (game save, crash recovery)
- Cần snapshot trước khi thực hiện thao tác nguy hiểm

---
**Tiếp theo:** Observer Pattern →
