# Bài 3: Bridge Pattern

## Bridge Pattern là gì?

Bridge là một **Structural Design Pattern** tách rời (decouple) abstraction khỏi implementation để cả hai có thể thay đổi độc lập.

**Ý tưởng cốt lõi:** Thay vì dùng inheritance để kết hợp abstraction và implementation, Bridge dùng composition — abstraction chứa implementation như một field.

**Vấn đề không có Bridge:**

```
          Shape (abstract)
         /               \
   Circle               Square
  /      \             /      \
RedCircle BlueCircle RedSquare BlueSquare
```

Thêm 1 shape hoặc 1 màu mới → số class tăng theo cấp số nhân. Với N shapes và M colors → N×M classes!

**Với Bridge:**

```
Shape (abstraction)          Color (implementation)
├── Circle  ─────────────>   ├── Red
└── Square                   └── Blue
```

Thêm shape hay color chỉ thêm 1 class → N+M classes.

## UML Cấu trúc

```
Abstraction ──────────> Implementor (interface)
    |  + operation()       |  + operationImpl()
    |                      |
    |              ┌───────┴───────┐
    |              ↓               ↓
Refined        ConcreteImpl1   ConcreteImpl2
Abstraction
```

## Ví dụ: Collection và Sorting

```java
// Implementor - interface cho implementation
public interface LinkedList<T> {
    void add(T value);
    T get(int index);
    int size();
    T removeFirst();
    T removeLast();
}

// Concrete Implementor 1
public class SinglyLinkedList<T> implements LinkedList<T> {
    // Chỉ có next pointer
    private Node<T> head;
    private int size;
    
    @Override
    public void add(T value) {
        // thêm vào cuối
        Node<T> newNode = new Node<>(value);
        if (head == null) { head = newNode; }
        else {
            Node<T> current = head;
            while (current.next != null) current = current.next;
            current.next = newNode;
        }
        size++;
    }
    
    @Override
    public T removeFirst() {
        if (head == null) throw new NoSuchElementException();
        T value = head.value;
        head = head.next;
        size--;
        return value;
    }
    
    @Override
    public T removeLast() {
        // O(n) với singly linked list
        if (head == null) throw new NoSuchElementException();
        if (head.next == null) { T val = head.value; head = null; size--; return val; }
        Node<T> current = head;
        while (current.next.next != null) current = current.next;
        T value = current.next.value;
        current.next = null;
        size--;
        return value;
    }
    
    @Override public T get(int index) { /* ... */ return null; }
    @Override public int size() { return size; }
}

// Concrete Implementor 2
public class DoublyLinkedList<T> implements LinkedList<T> {
    // Có cả next và prev pointer → removeLast() O(1)
    private Node<T> head, tail;
    private int size;
    
    @Override public void add(T value) { /* O(1) với tail pointer */ }
    @Override public T removeFirst() { /* O(1) */ return null; }
    @Override public T removeLast() { /* O(1) với doubly linked */ return null; }
    @Override public T get(int index) { /* O(n) */ return null; }
    @Override public int size() { return size; }
}

// Abstraction - chứa implementation
public abstract class Queue<T> {
    protected LinkedList<T> list; // bridge to implementation
    
    public Queue(LinkedList<T> list) {
        this.list = list;
    }
    
    public void enqueue(T value) {
        list.add(value); // delegate to implementation
    }
    
    public abstract T dequeue();
    public abstract T peek();
    
    public boolean isEmpty() {
        return list.size() == 0;
    }
}

// Refined Abstraction 1 - FIFO Queue
public class FifoQueue<T> extends Queue<T> {
    
    public FifoQueue(LinkedList<T> list) {
        super(list);
    }
    
    @Override
    public T dequeue() {
        return list.removeFirst(); // FIFO: remove from front
    }
    
    @Override
    public T peek() {
        return list.get(0);
    }
}

// Refined Abstraction 2 - Stack (LIFO)
public class Stack<T> extends Queue<T> {
    
    public Stack(LinkedList<T> list) {
        super(list);
    }
    
    @Override
    public T dequeue() {
        return list.removeLast(); // LIFO: remove from back
    }
    
    @Override
    public T peek() {
        return list.get(list.size() - 1);
    }
}

// Client - chọn combination tùy ý
public class Main {
    public static void main(String[] args) {
        // FifoQueue dùng SinglyLinkedList
        Queue<Integer> queue1 = new FifoQueue<>(new SinglyLinkedList<>());
        queue1.enqueue(1);
        queue1.enqueue(2);
        queue1.enqueue(3);
        System.out.println(queue1.dequeue()); // 1 (FIFO)
        
        // Stack dùng DoublyLinkedList (removeFirst/Last đều O(1))
        Queue<Integer> stack = new Stack<>(new DoublyLinkedList<>());
        stack.enqueue(1);
        stack.enqueue(2);
        stack.enqueue(3);
        System.out.println(stack.dequeue()); // 3 (LIFO)
        
        // FifoQueue dùng DoublyLinkedList (removeLast O(1))
        Queue<Integer> queue2 = new FifoQueue<>(new DoublyLinkedList<>());
    }
}
```

## Ví dụ thực tế: JDBC DriverManager

JDBC là Bridge giữa Java code và các database drivers:

```java
// Abstraction - JDBC API (không đổi dù database nào)
Connection conn = DriverManager.getConnection("jdbc:mysql://...", user, pass);
PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users");
ResultSet rs = stmt.executeQuery();

// Implementation phía sau:
// - MySQL JDBC Driver (com.mysql.jdbc.Driver)
// - PostgreSQL JDBC Driver (org.postgresql.Driver)
// - Oracle JDBC Driver (oracle.jdbc.driver.OracleDriver)

// Đổi database: chỉ đổi connection string, code khác không đổi
Connection mysqlConn = DriverManager.getConnection("jdbc:mysql://localhost/db");
Connection pgConn = DriverManager.getConnection("jdbc:postgresql://localhost/db");
```

## Implement Bridge theo từng bước

```
1. Xác định 2 chiều biến thiên (VD: Abstraction = Queue type, Implementation = LinkedList type)
2. Tách implementation ra thành interface riêng
3. Abstraction chứa implementation reference
4. Abstraction delegate operations xuống implementation
5. Client kết hợp abstraction và implementation tùy ý
```

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Tránh explosion** | N abstraction × M implementation = N+M classes thay vì N×M |
| **Runtime switch** | Có thể đổi implementation lúc runtime |
| **Không phải Abstract Factory** | Bridge giải quyết class explosion; Abstract Factory tạo families |
| **Khi nào dùng** | Khi cả abstraction và implementation cần extend độc lập |

## So sánh Bridge vs Adapter

| | Bridge | Adapter |
|--|--------|---------|
| **Mục đích** | Ngăn class explosion từ đầu | Fix incompatible interfaces sau |
| **Thiết kế** | Proactive (thiết kế trước) | Reactive (fix sau) |
| **Abstraction** | Cả hai có thể thay đổi | Chỉ một phía thay đổi |
| **Thời điểm** | Khi bắt đầu thiết kế | Khi tích hợp code có sẵn |

## Pitfalls (Nhược điểm)

1. **Over-engineering:** Nếu chỉ có vài combination thì không cần Bridge
2. **Tăng complexity:** Thêm layer trung gian → khó debug hơn
3. **Khó nhận ra nhu cầu:** Thường chỉ thấy cần Bridge khi đã có class explosion

## Tóm lại

```
Bridge = Tách abstraction và implementation thành 2 hierarchy độc lập
```

**Nhận dạng Bridge:** Có 2 chiều biến thiên trong thiết kế → mỗi chiều là 1 hierarchy, kết nối qua composition.

**Dùng Bridge khi:**
- Muốn tránh N×M class explosion
- Cả abstraction và implementation cần mở rộng độc lập
- Muốn đổi implementation lúc runtime

---
**Tiếp theo:** Decorator Pattern →
