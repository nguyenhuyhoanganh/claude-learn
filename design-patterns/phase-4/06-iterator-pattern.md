# Bài 6: Iterator Pattern

## Iterator Pattern là gì?

Iterator là một **Behavioral Design Pattern** cung cấp cách duyệt qua các phần tử của collection mà không cần lộ cấu trúc bên trong (array, tree, linked list, graph...).

**Ý tưởng cốt lõi:** Tách logic duyệt ra khỏi collection. Client dùng iterator interface mà không cần biết collection được implement bằng gì.

**Ví dụ thực tế:**
- Java `Iterator<T>` trong Collection Framework
- Python `__iter__` / `__next__`
- `Scanner` class (duyệt qua input stream)
- `ResultSet` trong JDBC (duyệt qua query results)
- `Files.walk()` trong Java NIO

## UML Cấu trúc

```
Client ──────> Iterable (aggregate interface)
                   |  + iterator(): Iterator
                   |
                   ↓
              ConcreteCollection
              - data: []
              + iterator(): Iterator ──> ConcreteIterator
                                             - index: int
                                             + hasNext(): boolean
                                             + next(): T
```

## Implement Iterator Pattern

```java
// Iterator interface
public interface Iterator<T> {
    boolean hasNext();
    T next();
}

// Iterable interface - collection có thể cung cấp iterator
public interface IterableCollection<T> {
    Iterator<T> iterator();
    Iterator<T> reverseIterator(); // optional: duyệt ngược
}

// Enum ThemeColor - aggregate
public enum ThemeColor {
    RED, GREEN, BLUE, YELLOW, PURPLE;
    
    // Inner class - Iterator (private, client không biết class cụ thể)
    private static class ThemeColorIterator implements Iterator<ThemeColor> {
        private int position = 0;
        private final boolean reverse;
        private final ThemeColor[] values = ThemeColor.values();
        
        ThemeColorIterator(boolean reverse) {
            this.reverse = reverse;
            if (reverse) position = values.length - 1;
        }
        
        @Override
        public boolean hasNext() {
            return reverse ? position >= 0 : position < values.length;
        }
        
        @Override
        public ThemeColor next() {
            if (!hasNext()) throw new NoSuchElementException();
            ThemeColor color = values[position];
            if (reverse) position--; else position++;
            return color;
        }
    }
    
    // Factory methods - client chỉ biết Iterator interface
    public static Iterator<ThemeColor> getIterator() {
        return new ThemeColorIterator(false);
    }
    
    public static Iterator<ThemeColor> getReverseIterator() {
        return new ThemeColorIterator(true);
    }
}

// Client - dùng iterator, không biết cấu trúc bên trong
public class Main {
    public static void main(String[] args) {
        System.out.println("Forward:");
        Iterator<ThemeColor> iter = ThemeColor.getIterator();
        while (iter.hasNext()) {
            System.out.println("  " + iter.next());
        }
        
        System.out.println("Reverse:");
        Iterator<ThemeColor> reverseIter = ThemeColor.getReverseIterator();
        while (reverseIter.hasNext()) {
            System.out.println("  " + reverseIter.next());
        }
    }
}
```

## Ví dụ: Tree Iterator

```java
// Binary Tree với in-order iterator
public class BinaryTreeNode<T extends Comparable<T>> {
    T value;
    BinaryTreeNode<T> left, right;
    
    public BinaryTreeNode(T value) { this.value = value; }
    
    // In-order iterator (left → root → right)
    public Iterator<T> inOrderIterator() {
        List<T> elements = new ArrayList<>();
        collectInOrder(this, elements);
        return elements.iterator(); // dùng Java's built-in Iterator
    }
    
    private void collectInOrder(BinaryTreeNode<T> node, List<T> result) {
        if (node == null) return;
        collectInOrder(node.left, result);
        result.add(node.value);
        collectInOrder(node.right, result);
    }
}
```

## Ví dụ thực tế: Java Collection Framework

```java
// Java's Iterator<T> là implementation của pattern này
List<String> list = Arrays.asList("A", "B", "C");

// Cách 1: Iterator trực tiếp
Iterator<String> iter = list.iterator();
while (iter.hasNext()) {
    String s = iter.next();
    // iter.remove(); // có thể xóa safely khi đang duyệt
    System.out.println(s);
}

// Cách 2: for-each (Java tự tạo iterator)
for (String s : list) {
    System.out.println(s);
}

// Cách 3: Stream (iterator ẩn đằng sau)
list.stream().filter(s -> s.startsWith("A")).forEach(System.out::println);

// Scanner cũng là Iterator
Scanner scanner = new Scanner(System.in);
while (scanner.hasNextLine()) {
    String line = scanner.nextLine(); // iterate over input lines
}

// Files.walk - iterate file tree
Files.walk(Paths.get("/home/user"))
    .filter(Files::isRegularFile)
    .forEach(System.out::println);
```

## Iterator với fail-fast detection

```java
// Java iterators fail-fast: ném ConcurrentModificationException nếu collection thay đổi
List<String> list = new ArrayList<>(Arrays.asList("A", "B", "C"));
Iterator<String> iter = list.iterator();

list.add("D"); // modify collection while iterating

try {
    while (iter.hasNext()) {
        iter.next(); // ConcurrentModificationException!
    }
} catch (ConcurrentModificationException e) {
    System.out.println("Collection was modified during iteration!");
}

// Safe way: dùng iter.remove() để xóa
Iterator<String> safeIter = list.iterator();
while (safeIter.hasNext()) {
    if (safeIter.next().equals("B")) {
        safeIter.remove(); // safe!
    }
}
```

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Inner class** | Iterator thường là inner class để truy cập private state của collection |
| **Stateful** | Iterator nhớ vị trí hiện tại → mỗi `for` loop cần iterator mới |
| **Fail-fast** | Phát hiện modification trong khi đang iterate → throw exception |
| **Multiple iterators** | Cùng collection có thể có nhiều iterators cùng lúc |

## So sánh Iterator vs Composite

| | Iterator | Composite |
|--|---------|-----------|
| **Mục đích** | Duyệt qua collection | Tổ chức objects thành tree |
| **Structure** | Linear (thường) | Hierarchical |
| **Combination** | Iterator thường dùng để duyệt Composite tree | Composite chứa children |

## Pitfalls (Nhược điểm)

1. **No index access:** Không biết index hiện tại (phải tự đếm nếu cần)
2. **State invalid:** Collection bị modify → iterator state invalid
3. **Single direction:** Thường chỉ forward; backward cần implement thêm
4. **Overhead:** Với array đơn giản → for loop hiệu quả hơn iterator

## Tóm lại

```
Iterator = Cung cấp cách duyệt collection mà không lộ cấu trúc bên trong
```

**Dùng Iterator khi:**
- Muốn che giấu implementation của collection (array, linked list, tree...)
- Cần nhiều cách duyệt khác nhau (forward, backward, in-order...)
- Muốn interface nhất quán cho nhiều loại collection khác nhau

---
**Tiếp theo:** Memento Pattern →
