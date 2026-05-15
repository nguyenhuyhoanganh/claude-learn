# Bài 3: Command Pattern

## Command Pattern là gì?

Command là một **Behavioral Design Pattern** đóng gói (encapsulate) một request thành một object độc lập, chứa đủ thông tin để thực thi request, delay thực thi, hoặc undo.

**Ý tưởng cốt lõi:** Biến "action" thành "object". Thay vì gọi trực tiếp method, bạn tạo Command object rồi execute nó.

**Ví dụ thực tế:**
- Undo/Redo trong text editor (Ctrl+Z, Ctrl+Y)
- Task queue / job scheduler
- Transaction logging
- Macro recording (record và playback actions)
- UI Button actions

## UML Cấu trúc

```
Client ──────> Invoker ──────> Command (interface)
                                   |  + execute()
                                   |  + undo()
                                   |
                          ┌────────┴────────┐
                          ↓                 ↓
                    ConcreteCommand1   ConcreteCommand2
                    - receiver: Obj    - receiver: Obj
                    + execute()        + execute()
                    + undo()           + undo()
                          |
                          ↓ delegates to
                       Receiver
                       (actual business logic)
```

## Implement Command Pattern

```java
// Command interface
public interface Command {
    void execute();
    void undo();
    String getDescription();
}

// Receiver - nơi chứa actual business logic
public class TextEditor {
    private StringBuilder text = new StringBuilder();
    private int cursorPosition = 0;
    
    public void insertText(String s, int position) {
        text.insert(position, s);
        cursorPosition = position + s.length();
        System.out.println("Text: '" + text + "'");
    }
    
    public void deleteText(int start, int length) {
        text.delete(start, start + length);
        cursorPosition = start;
        System.out.println("Text: '" + text + "'");
    }
    
    public String getText() { return text.toString(); }
    public int getCursorPosition() { return cursorPosition; }
}

// Concrete Command 1 - Insert text
public class InsertTextCommand implements Command {
    private final TextEditor editor;
    private final String textToInsert;
    private final int position;
    
    public InsertTextCommand(TextEditor editor, String text, int position) {
        this.editor = editor;
        this.textToInsert = text;
        this.position = position;
    }
    
    @Override
    public void execute() {
        editor.insertText(textToInsert, position);
    }
    
    @Override
    public void undo() {
        // Undo insert = delete
        editor.deleteText(position, textToInsert.length());
    }
    
    @Override
    public String getDescription() {
        return "Insert '" + textToInsert + "' at " + position;
    }
}

// Concrete Command 2 - Delete text
public class DeleteTextCommand implements Command {
    private final TextEditor editor;
    private final int start;
    private final int length;
    private String deletedText; // lưu lại để undo
    
    public DeleteTextCommand(TextEditor editor, int start, int length) {
        this.editor = editor;
        this.start = start;
        this.length = length;
    }
    
    @Override
    public void execute() {
        // Lưu text trước khi xóa (cần cho undo)
        deletedText = editor.getText().substring(start, start + length);
        editor.deleteText(start, length);
    }
    
    @Override
    public void undo() {
        // Undo delete = insert lại text đã xóa
        editor.insertText(deletedText, start);
    }
    
    @Override
    public String getDescription() {
        return "Delete " + length + " chars at " + start;
    }
}

// Invoker - quản lý command history
public class EditorHistory {
    private final Deque<Command> undoStack = new ArrayDeque<>();
    private final Deque<Command> redoStack = new ArrayDeque<>();
    
    public void execute(Command command) {
        command.execute();
        undoStack.push(command);
        redoStack.clear(); // xóa redo stack khi có action mới
        System.out.println("Executed: " + command.getDescription());
    }
    
    public void undo() {
        if (undoStack.isEmpty()) {
            System.out.println("Nothing to undo");
            return;
        }
        Command command = undoStack.pop();
        command.undo();
        redoStack.push(command);
        System.out.println("Undid: " + command.getDescription());
    }
    
    public void redo() {
        if (redoStack.isEmpty()) {
            System.out.println("Nothing to redo");
            return;
        }
        Command command = redoStack.pop();
        command.execute();
        undoStack.push(command);
        System.out.println("Redid: " + command.getDescription());
    }
}

// Client
public class Main {
    public static void main(String[] args) {
        TextEditor editor = new TextEditor();
        EditorHistory history = new EditorHistory();
        
        // Execute commands
        history.execute(new InsertTextCommand(editor, "Hello", 0));
        // Text: 'Hello'
        
        history.execute(new InsertTextCommand(editor, " World", 5));
        // Text: 'Hello World'
        
        history.execute(new DeleteTextCommand(editor, 5, 6));
        // Text: 'Hello'
        
        // Undo
        history.undo(); // undo delete → 'Hello World'
        history.undo(); // undo second insert → 'Hello'
        
        // Redo
        history.redo(); // redo second insert → 'Hello World'
    }
}
```

## Ví dụ: Command Queue (Task Scheduler)

```java
// Commands có thể được queued và executed sau
public class PrintCommand implements Command {
    private final String documentName;
    private final int copies;
    
    public PrintCommand(String docName, int copies) {
        this.documentName = docName;
        this.copies = copies;
    }
    
    @Override
    public void execute() {
        System.out.printf("Printing %d copies of '%s'%n", copies, documentName);
    }
    
    @Override
    public void undo() {
        System.out.println("Cannot undo printing");
    }
    
    @Override
    public String getDescription() {
        return "Print " + copies + " copies of " + documentName;
    }
}

// Print queue
public class PrintQueue {
    private final Queue<Command> queue = new LinkedList<>();
    
    public void addJob(Command command) {
        queue.offer(command);
        System.out.println("Queued: " + command.getDescription());
    }
    
    public void processAll() {
        while (!queue.isEmpty()) {
            queue.poll().execute();
        }
    }
}
```

## Ví dụ thực tế: Java Runnable

```java
// Runnable là Command pattern
Runnable command = () -> System.out.println("Task executed");

// Có thể execute sau:
Thread thread = new Thread(command);
thread.start();

// Hoặc submit vào ExecutorService:
ExecutorService executor = Executors.newFixedThreadPool(4);
executor.submit(command); // queued, executed khi có thread rảnh

// Callable<T> là Command với return value
Callable<Integer> calculation = () -> 42 * 42;
Future<Integer> future = executor.submit(calculation);
System.out.println(future.get()); // 1764
```

## Macro Command (Composite Command)

```java
// Macro = nhiều commands gom thành 1
public class MacroCommand implements Command {
    private final List<Command> commands;
    private final String name;
    
    public MacroCommand(String name, Command... commands) {
        this.name = name;
        this.commands = Arrays.asList(commands);
    }
    
    @Override
    public void execute() {
        commands.forEach(Command::execute);
    }
    
    @Override
    public void undo() {
        // Undo ngược thứ tự
        ListIterator<Command> iter = commands.listIterator(commands.size());
        while (iter.hasPrevious()) {
            iter.previous().undo();
        }
    }
    
    @Override
    public String getDescription() { return "Macro: " + name; }
}
```

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Undo support** | Phải lưu state trước khi execute để có thể undo |
| **Command logging** | Commands có thể được log → audit trail, crash recovery |
| **Transactional** | Nhóm nhiều command → execute tất cả hoặc rollback tất cả |
| **Simple commands** | Đôi khi quá phức tạp → dùng lambda/method reference đơn giản hơn |

## So sánh Command vs Strategy

| | Command | Strategy |
|--|---------|----------|
| **Mục đích** | Encapsulate action + state (undo/queue) | Encapsulate algorithm |
| **State** | Thường có (cho undo) | Thường không có |
| **Receiver** | Biết về receiver cụ thể | Không cần receiver |
| **Dùng khi** | Undo/redo, queue, logging | Đổi algorithm lúc runtime |

## Pitfalls (Nhược điểm)

1. **Class explosion:** Nhiều commands nhỏ → nhiều class
2. **Undo complexity:** Không phải operation nào cũng reversible (print, email)
3. **Memory:** History stack lưu tất cả commands → tốn RAM
4. **Ordering issues:** Undo ngược thứ tự phức tạp khi có dependencies

## Tóm lại

```
Command = Đóng gói request thành object để queue, log, hoặc undo
```

**Dùng Command khi:**
- Cần undo/redo functionality
- Cần queue operations và execute sau
- Cần logging, auditing operations
- Cần parameterize action (e.g., UI button với different actions)

---
**Tiếp theo:** Interpreter Pattern →
