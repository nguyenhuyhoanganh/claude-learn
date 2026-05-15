# Bài 5: Composite Pattern

## Composite Pattern là gì?

Composite là một **Structural Design Pattern** cho phép xử lý object đơn lẻ và nhóm object theo cùng một cách. Client không cần phân biệt đây là leaf (lá) hay composite (nhánh/nhóm).

**Ý tưởng cốt lõi:** Tạo tree structure nơi mỗi node có thể là leaf (không có children) hoặc composite (có children), nhưng cả hai đều implement cùng interface.

**Ví dụ thực tế:**
- File system: File và Folder đều có thể `getSize()`, `delete()`
- Menu UI: MenuItem và Menu đều có thể `click()`, `render()`
- Tổ chức công ty: Employee và Department đều có `getSalary()`
- HTML DOM: text node và element node

## UML Cấu trúc

```
Client ──────> Component (interface)
                    |  + operation()
                    |  + add(Component)    // chỉ Composite implement
                    |  + remove(Component) // chỉ Composite implement
                    |
          ┌─────────┴────────────┐
          ↓                      ↓
        Leaf                 Composite
    + operation()           + operation()  // gọi operation() của tất cả children
                            + add(Component)
                            + remove(Component)
                            - children: List<Component>
```

## Ví dụ: File System

```java
// Component - interface chung cho cả File và Directory
public interface FileSystemComponent {
    String getName();
    int getSize();
    void print(String indent);
    void delete();
}

// Leaf - File không có children
public class File implements FileSystemComponent {
    private final String name;
    private final int size;
    
    public File(String name, int size) {
        this.name = name;
        this.size = size;
    }
    
    @Override public String getName() { return name; }
    
    @Override public int getSize() { return size; }
    
    @Override
    public void print(String indent) {
        System.out.println(indent + "📄 " + name + " (" + size + " bytes)");
    }
    
    @Override
    public void delete() {
        System.out.println("Deleting file: " + name);
    }
}

// Composite - Directory có thể chứa File và Directory khác
public class Directory implements FileSystemComponent {
    private final String name;
    private final List<FileSystemComponent> children = new ArrayList<>();
    
    public Directory(String name) {
        this.name = name;
    }
    
    public void add(FileSystemComponent component) {
        children.add(component);
    }
    
    public void remove(FileSystemComponent component) {
        children.remove(component);
    }
    
    @Override public String getName() { return name; }
    
    @Override
    public int getSize() {
        // Tổng kích thước của tất cả children (recursive)
        return children.stream()
            .mapToInt(FileSystemComponent::getSize)
            .sum();
    }
    
    @Override
    public void print(String indent) {
        System.out.println(indent + "📁 " + name + " (" + getSize() + " bytes)");
        // Recursive - in từng child
        for (FileSystemComponent child : children) {
            child.print(indent + "  ");
        }
    }
    
    @Override
    public void delete() {
        // Xóa tất cả children trước
        children.forEach(FileSystemComponent::delete);
        System.out.println("Deleting directory: " + name);
    }
}

// Client - xử lý File và Directory như nhau
public class FileExplorer {
    public static void main(String[] args) {
        // Tạo cây file system
        Directory root = new Directory("root");
        
        File readme = new File("README.md", 1024);
        File gitignore = new File(".gitignore", 256);
        root.add(readme);
        root.add(gitignore);
        
        Directory src = new Directory("src");
        src.add(new File("Main.java", 2048));
        src.add(new File("Utils.java", 1536));
        
        Directory test = new Directory("test");
        test.add(new File("MainTest.java", 1024));
        src.add(test); // Directory trong Directory
        
        root.add(src);
        
        // In cây - không cần biết File hay Directory
        root.print("");
        // 📁 root (5888 bytes)
        //   📄 README.md (1024 bytes)
        //   📄 .gitignore (256 bytes)
        //   📁 src (4608 bytes)
        //     📄 Main.java (2048 bytes)
        //     📄 Utils.java (1536 bytes)
        //     📁 test (1024 bytes)
        //       📄 MainTest.java (1024 bytes)
        
        System.out.println("Total size: " + root.getSize()); // 5888
        
        // Xóa cả cây - chỉ gọi 1 method
        root.delete();
    }
}
```

## Ví dụ thực tế: JSF UIComponent

JavaServer Faces (JSF) UI framework dùng Composite Pattern:

```java
// UIComponent là Component interface
// UIViewRoot là root Composite
// UIInput, UIOutput là Leaf
// UIForm, UIPanel là Composite

// Cây JSF component tree:
// UIViewRoot
//   ├── UIOutput (h:head)
//   └── UIForm (h:form)
//       ├── UIInput (h:inputText)
//       └── UICommand (h:commandButton)

// JSF framework gọi encode() trên UIViewRoot
// UIViewRoot.encode() → gọi encode() trên từng child
// UIForm.encode() → gọi encode() trên từng child của form
// UIInput.encode() → render HTML input
```

## Composite và đệ quy

Composite Pattern tự nhiên dùng đệ quy:

```java
// Tính lương trong tổ chức (CEO → Manager → Employee)
public interface OrgUnit {
    String getName();
    double getSalary(); // tổng lương của unit
}

public class Employee implements OrgUnit {
    private final String name;
    private final double salary;
    
    @Override public String getName() { return name; }
    @Override public double getSalary() { return salary; } // lương cá nhân
}

public class Department implements OrgUnit {
    private final String name;
    private final List<OrgUnit> members = new ArrayList<>();
    
    public void addMember(OrgUnit unit) { members.add(unit); }
    
    @Override public String getName() { return name; }
    
    @Override
    public double getSalary() {
        // Tổng lương = lương của tất cả members (có thể là employee hoặc department khác)
        return members.stream().mapToDouble(OrgUnit::getSalary).sum();
    }
}
```

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Leaf methods** | Leaf không implement add/remove; có thể throw UnsupportedOperationException |
| **Type safety** | Để add/remove trong Component → dễ dùng nhưng kém type safe |
| **Caching** | Composite có thể cache kết quả getSize() nếu tốn kém |
| **Ordering** | Thứ tự children quan trọng trong một số trường hợp |

## So sánh Composite vs Decorator

| | Composite | Decorator |
|--|-----------|-----------|
| **Children** | Nhiều (tree) | Đúng 1 |
| **Mục đích** | Group objects | Thêm behavior |
| **Recursion** | Có (traverse tree) | Không |
| **Focus** | Cấu trúc | Behavior |

## Pitfalls (Nhược điểm)

1. **Over-generalization:** Không phải mọi hierarchy đều nên là Composite
2. **Type checking mất:** Không phân biệt leaf và composite từ interface
3. **Performance:** Deep tree → đệ quy sâu → có thể stack overflow
4. **Removing parent reference:** Nếu cần biết parent, phải thêm reference ngược

## Tóm lại

```
Composite = Tree structure nơi leaf và composite cùng interface
```

**Nhận dạng Composite:** Component có thể chứa danh sách các Component khác; cả hai xử lý như nhau.

**Dùng Composite khi:**
- Cần biểu diễn cấu trúc cây phân cấp (part-whole hierarchy)
- Muốn client xử lý individual object và collection của chúng như nhau
- Cấu trúc có thể lồng nhau nhiều cấp

---
**Tiếp theo:** Facade Pattern →
