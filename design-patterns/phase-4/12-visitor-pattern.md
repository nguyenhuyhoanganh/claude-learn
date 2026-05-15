# Bài 12: Visitor Pattern

## Visitor Pattern là gì?

Visitor là một **Behavioral Design Pattern** cho phép thêm operation mới vào class hierarchy mà không cần sửa các class hiện có.

**Ý tưởng cốt lõi:** Tách operation ra khỏi class. Mỗi "visitor" là một operation. Object chấp nhận visitor bằng cách gọi `accept(visitor)`, và visitor gọi method phù hợp cho class đó.

**Từ khóa: Double Dispatch** — Lần dispatch 1: gọi `accept()` trên object. Lần dispatch 2: object gọi method cụ thể trên visitor (`visitor.visit(this)`).

**Ví dụ thực tế:**
- Thêm serialization, report generation vào class hierarchy hiện có
- AST operations trong compiler (type checking, code generation, formatting)
- `Files.walkFileTree()` với `FileVisitor`
- DOM4J XMLVisitor

## Vấn đề không có Visitor

```java
// Muốn thêm print() và export() vào hierarchy Employee
// → Phải sửa TẤT CẢ các class (Programmer, Manager, VP...)
// → Vi phạm Open/Closed Principle

public interface Employee {
    void print();    // phải thêm vào interface và tất cả implementations
    void export();   // phải thêm vào interface và tất cả implementations
}
```

## UML Cấu trúc

```
Client ──────────────────────> Visitor (interface)
                                    |  + visit(Programmer)
                                    |  + visit(Manager)
                                    |  + visit(VP)
                                    |
                       ┌────────────┴─────────────┐
                       ↓                          ↓
                 PrintVisitor             AppraisalVisitor
                 + visit(p: Programmer)  + visit(p: Programmer)
                 + visit(m: Manager)     + visit(m: Manager)
                 + visit(vp: VP)         + visit(vp: VP)

Element (interface)
    |  + accept(Visitor)
    |
    ↑ (call visitor.visit(this) inside accept)
    |
    ├── Programmer.accept(v) { v.visit(this); }
    ├── Manager.accept(v)    { v.visit(this); }
    └── VP.accept(v)         { v.visit(this); }
```

## Implement Visitor Pattern

```java
// Visitor interface - method cho mỗi concrete element
public interface EmployeeVisitor {
    void visit(Programmer programmer);
    void visit(ProjectLead lead);
    void visit(Manager manager);
    void visit(VicePresident vp);
}

// Element interface - chứa accept method
public interface Employee {
    String getName();
    String getEmployeeId();
    List<Employee> getDirectReports();
    void accept(EmployeeVisitor visitor);
}

// Abstract base
public abstract class AbstractEmployee implements Employee {
    private final String name;
    private final String employeeId;
    
    public AbstractEmployee(String name, String employeeId) {
        this.name = name;
        this.employeeId = employeeId;
    }
    
    @Override public String getName() { return name; }
    @Override public String getEmployeeId() { return employeeId; }
    @Override public List<Employee> getDirectReports() { return Collections.emptyList(); }
}

// Concrete Elements
public class Programmer extends AbstractEmployee {
    private final String primarySkill;
    
    public Programmer(String name, String id, String skill) {
        super(name, id);
        this.primarySkill = skill;
    }
    
    public String getPrimarySkill() { return primarySkill; }
    
    @Override
    public void accept(EmployeeVisitor visitor) {
        visitor.visit(this); // double dispatch!
    }
}

public class ProjectLead extends AbstractEmployee {
    private final List<Programmer> programmers = new ArrayList<>();
    
    public ProjectLead(String name, String id) { super(name, id); }
    
    public void addProgrammer(Programmer p) { programmers.add(p); }
    
    @Override
    public List<Employee> getDirectReports() { return new ArrayList<>(programmers); }
    
    public List<Programmer> getProgrammers() { return programmers; }
    
    @Override
    public void accept(EmployeeVisitor visitor) {
        visitor.visit(this);
    }
}

public class Manager extends AbstractEmployee {
    private final List<ProjectLead> leads = new ArrayList<>();
    
    public Manager(String name, String id) { super(name, id); }
    
    public void addProjectLead(ProjectLead lead) { leads.add(lead); }
    
    @Override
    public List<Employee> getDirectReports() { return new ArrayList<>(leads); }
    
    @Override
    public void accept(EmployeeVisitor visitor) {
        visitor.visit(this);
    }
}

public class VicePresident extends AbstractEmployee {
    private final List<Manager> managers = new ArrayList<>();
    
    public VicePresident(String name, String id) { super(name, id); }
    
    public void addManager(Manager m) { managers.add(m); }
    
    @Override
    public List<Employee> getDirectReports() { return new ArrayList<>(managers); }
    
    @Override
    public void accept(EmployeeVisitor visitor) {
        visitor.visit(this);
    }
}

// Concrete Visitor 1 - Print org structure
public class PrintVisitor implements EmployeeVisitor {
    private int depth = 0;
    
    private String indent() { return "  ".repeat(depth); }
    
    @Override
    public void visit(Programmer p) {
        System.out.printf("%s[Programmer] %s - %s%n", indent(), p.getName(), p.getPrimarySkill());
    }
    
    @Override
    public void visit(ProjectLead lead) {
        System.out.printf("%s[Project Lead] %s (%d programmers)%n", 
            indent(), lead.getName(), lead.getProgrammers().size());
    }
    
    @Override
    public void visit(Manager m) {
        System.out.printf("%s[Manager] %s (%d leads)%n", 
            indent(), m.getName(), m.getDirectReports().size());
    }
    
    @Override
    public void visit(VicePresident vp) {
        System.out.printf("%s[Vice President] %s%n", indent(), vp.getName());
    }
    
    public void increaseDepth() { depth++; }
    public void decreaseDepth() { depth--; }
}

// Concrete Visitor 2 - Appraisal (accumulating visitor)
public class AppraisalVisitor implements EmployeeVisitor {
    private final Map<String, Double> ratings = new HashMap<>();
    
    private double getRatingFor(Employee e) {
        return ratings.getOrDefault(e.getEmployeeId(), 3.0); // default 3/5
    }
    
    @Override
    public void visit(Programmer p) {
        // Programmers rated 1-5 based on skill
        double rating = p.getPrimarySkill().equals("Java") ? 4.5 : 3.5;
        ratings.put(p.getEmployeeId(), rating);
        System.out.printf("Appraising %s: %.1f/5%n", p.getName(), rating);
    }
    
    @Override
    public void visit(ProjectLead lead) {
        // Lead rating = 75% own + 25% team average
        double teamAvg = lead.getProgrammers().stream()
            .mapToDouble(p -> getRatingFor(p))
            .average().orElse(3.0);
        double rating = 0.75 * 4.0 + 0.25 * teamAvg;
        ratings.put(lead.getEmployeeId(), rating);
        System.out.printf("Appraising %s: %.1f/5%n", lead.getName(), rating);
    }
    
    @Override
    public void visit(Manager m) {
        double rating = 4.2; // simplified
        ratings.put(m.getEmployeeId(), rating);
    }
    
    @Override
    public void visit(VicePresident vp) {
        double rating = 4.5;
        ratings.put(vp.getEmployeeId(), rating);
    }
    
    public Map<String, Double> getRatings() { return Collections.unmodifiableMap(ratings); }
}

// Client - traverse org structure với bất kỳ visitor
public class OrgChart {
    
    // Traverse tree và visit mỗi node
    public static void traverse(Employee root, EmployeeVisitor visitor) {
        root.accept(visitor);
        // Traverse children recursively
        for (Employee child : root.getDirectReports()) {
            traverse(child, visitor);
        }
    }
    
    public static void main(String[] args) {
        // Build org structure
        VicePresident vp = new VicePresident("Richard", "VP-001");
        
        Manager m1 = new Manager("Alice", "MGR-001");
        Manager m2 = new Manager("Bob", "MGR-002");
        
        ProjectLead pl1 = new ProjectLead("Charlie", "PL-001");
        ProjectLead pl2 = new ProjectLead("Diana", "PL-002");
        
        pl1.addProgrammer(new Programmer("Eve", "DEV-001", "Java"));
        pl1.addProgrammer(new Programmer("Frank", "DEV-002", "Python"));
        pl2.addProgrammer(new Programmer("Grace", "DEV-003", "Java"));
        
        m1.addProjectLead(pl1);
        m2.addProjectLead(pl2);
        vp.addManager(m1);
        vp.addManager(m2);
        
        // Visitor 1: Print org chart
        System.out.println("=== ORG CHART ===");
        PrintVisitor printer = new PrintVisitor();
        traverse(vp, printer);
        
        // Visitor 2: Appraisal
        System.out.println("\n=== APPRAISAL ===");
        AppraisalVisitor appraiser = new AppraisalVisitor();
        traverse(vp, appraiser);
        System.out.println("Ratings: " + appraiser.getRatings());
        
        // Thêm Visitor 3 mới mà không sửa Employee classes!
    }
}
```

## Ví dụ thực tế: Java NIO FileVisitor

```java
// Files.walkFileTree() dùng Visitor pattern
Files.walkFileTree(Paths.get("/home/user"), new SimpleFileVisitor<Path>() {
    @Override
    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
        System.out.println("File: " + file);
        return FileVisitResult.CONTINUE;
    }
    
    @Override
    public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
        System.out.println("Dir: " + dir);
        return FileVisitResult.CONTINUE;
    }
    
    @Override
    public FileVisitResult visitFileFailed(Path file, IOException exc) {
        System.err.println("Failed: " + file + " - " + exc);
        return FileVisitResult.CONTINUE;
    }
});
```

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Thêm element khó** | Thêm class mới vào hierarchy → phải sửa tất cả visitors |
| **Thêm operation dễ** | Chỉ tạo visitor class mới, không sửa elements |
| **Accumulating state** | Visitor có thể lưu state khi traverse (như AppraisalVisitor) |
| **Encapsulation yếu** | Elements phải expose getters cho visitors |

## So sánh Visitor vs Strategy

| | Visitor | Strategy |
|--|---------|---------|
| **Target** | Object hierarchy | Single algorithm |
| **Nhiều implementations** | Visitor implementations = khác nhau hoàn toàn | Strategy implementations = cùng task khác algorithm |
| **Adding ops** | Dễ thêm operation mới | Dễ thêm algorithm mới |

## Pitfalls (Nhược điểm)

1. **Adding new types hard:** Thêm concrete element class → phải sửa tất cả visitor implementations
2. **Breaks encapsulation:** Phải expose internal state qua getters
3. **Circular dependency:** Visitor biết về elements, elements biết về visitor
4. **Confusing:** Double dispatch khó hiểu lúc đầu

## Tóm lại

```
Visitor = Tách operation ra khỏi class hierarchy, thêm operation không sửa classes
```

**Dùng Visitor khi:**
- Cần thực hiện nhiều operations khác nhau trên một object structure phức tạp
- Class hierarchy ổn định nhưng cần thêm nhiều operations
- Muốn tránh "polluting" classes với unrelated operations

---
**Tiếp theo:** Null Object Pattern →
