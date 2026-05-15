# Bài 1: B-Tree - Cấu trúc dữ liệu nền tảng của Database Index

## Tại sao cần B-Tree?

Khi bảng có hàng triệu rows, **Full Table Scan** trở thành bottleneck:

```
Tìm row với id=5000 trong bảng 1 triệu rows:
  → Đọc page 0 (40 rows) → Không có id=5000
  → Đọc page 1 (40 rows) → Không có id=5000
  → ...
  → Đọc page 25000 → Tìm thấy!
  
  = 25,000 I/O operations!
```

Database cần cấu trúc dữ liệu giúp **thu hẹp không gian tìm kiếm** mà không cần đọc toàn bộ bảng. Đó là **B-Tree**.

> **B-Tree** = Balanced Tree — Cây cân bằng đảm bảo tìm kiếm trong O(log N)

---

## Cấu trúc B-Tree

### Các khái niệm cơ bản

```
B-Tree bậc M (degree M):
  - Mỗi node có tối đa M con (children)
  - Mỗi node có tối đa M-1 phần tử (keys)
  - Mỗi phần tử = (key, value/data pointer)
  - Cây luôn được cân bằng
  
Ví dụ B-Tree bậc 3 (có thể 2-3 con):
          [4, 8]              ← Root node
         /   |   \
      [2,3] [6,7] [10,11]   ← Internal nodes
```

### Ba loại node

```
Root Node:     Node đầu tiên ở đỉnh (chỉ có 1)
Internal Node: Node ở giữa (có con và cha)
Leaf Node:     Node ở cuối (không có con)
```

### Mỗi phần tử trong B-Tree gốc

```
Mỗi element trong node gồm:
┌────────┬──────────────┐
│  key   │     value    │
│ (id=5) │ data pointer │
│        │ (tuple_id,   │
│        │  page=123)   │
└────────┴──────────────┘

key   = Giá trị bạn search (ví dụ: id, email)
value = Pointer đến row thực trong heap
```

> **Lưu ý quan trọng:** Trong B-Tree gốc, cả key VÀ value đều tồn tại ở **mọi node** (root, internal, leaf). Đây là điểm khác biệt chính với B+Tree.

---

## Cách B-Tree tăng tốc tìm kiếm

### Search: Tìm id=3

```
B-Tree (degree 3):
              [4, 8]           Root
             /   |   \
          [2,3] [6,7] [10,11]  Leaves

Tìm id=3:
  Step 1: Đọc Root [4, 8]
          → 3 < 4 → Đi sang nhánh trái
  Step 2: Đọc node [2, 3]
          → 3 == 3 → Tìm thấy! Lấy data pointer
  Step 3: Đọc heap page được chỉ định
  
  Tổng: 3 I/O operations thay vì 25,000!
```

### Ưu điểm về hiệu năng

```
Full Table Scan: O(N) → 1 triệu rows = 25,000 page reads
B-Tree search:  O(log N) → 1 triệu rows ≈ 20 node traversals

Với 1 tỷ rows:
  Full scan: 25,000,000 page reads
  B-Tree:    30 node traversals
```

### Node = Page trên disk

Điều quan trọng cần hiểu: **Mỗi node trong B-Tree tương ứng với 1 page trên disk**:

```
Page = 8KB (PostgreSQL) = 8,192 bytes
Key = INTEGER (4 bytes)
Value/pointer = 6 bytes
Overhead = 2 bytes

Số elements mỗi page ≈ 8192 / (4+6+2) ≈ 682 elements!

→ Không phải "bậc 3" như trong ví dụ lý thuyết
→ Thực tế: hàng trăm đến hàng nghìn keys mỗi node
→ Tìm 1 tỷ rows chỉ cần 3-4 I/O hops!
```

---

## Giới hạn của B-Tree gốc

### Vấn đề 1: Keys và Values ở tất cả nodes

```
B-Tree node chứa cả key VÀ value:
[key=4, value=ptr_A] [key=8, value=ptr_B]
   ↑                       ↑
   6 bytes                 6 bytes
   
Chiếm nhiều space → Ít keys mỗi node
→ Tree sâu hơn → Nhiều I/O hơn
```

### Vấn đề 2: Range Queries chậm

```
Tìm tất cả rows với id BETWEEN 4 AND 9:

B-Tree (ví dụ nhỏ):
         [5, 8]
        /   |   \
     [3,4] [6,7] [9,10]

Step 1: Tìm id=4 → Đọc Root → Đọc node [3,4] → Lấy value (id=4)
Step 2: Tìm id=5 → Đọc Root lại! → Không có trong [3,4] → Đọc [6,7]? → 5 ở đâu?
Step 3: Tìm id=6 → Đọc Root lại! → Tìm xuống...
...

→ Mỗi key phải traverse từ root xuống leaf
→ Range queries rất kém hiệu quả!
```

### Vấn đề 3: Internal nodes chiếm nhiều bộ nhớ

```
Data pointer thường = 6-8 bytes
Keys thường = 4-8 bytes

Nếu index trên UUID field:
UUID = 16 bytes

Mỗi element = 16 bytes (key) + 8 bytes (pointer) = 24 bytes
Elements mỗi page = 8192 / 24 = 341 elements (giảm đáng kể)
Tree sâu hơn → Nhiều I/O hơn
```

---

## Tóm tắt: Tại sao cần B+Tree

```
B-Tree gốc:
  ✅ Nhanh hơn Full Table Scan (O(log N) vs O(N))
  ❌ Range queries kém (phải traverse lại từ root cho mỗi key)
  ❌ Internal nodes cồng kềnh (lưu cả keys và values)
  ❌ Ít keys mỗi node → Tree sâu hơn → Nhiều I/O

B+Tree (tiến hóa của B-Tree):
  ✅ Internal nodes chỉ lưu keys (nhỏ gọn hơn)
  ✅ Values chỉ ở leaf nodes
  ✅ Leaf nodes được liên kết (linked list)
  ✅ Range queries rất nhanh
```

---

**Tiếp theo:** 02-btree-plus-va-ung-dung-thuc-te.md →
