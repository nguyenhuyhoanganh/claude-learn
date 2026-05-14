# Bài 2: Lộ trình học Database Engineering

## Tổng quan các chủ đề

Khóa học được tổ chức theo lộ trình từ nền tảng đến nâng cao. Mỗi chủ đề xây dựng trên kiến thức của chủ đề trước.

```
NỀN TẢNG
├── ACID (Atomicity, Consistency, Isolation, Durability)
│   └── Hiểu transactions và tính an toàn dữ liệu
│
├── Database Internals (Page, Row, Disk I/O)
│   └── Cách dữ liệu thực sự được lưu trữ
│
HIỆU NĂNG
├── Database Indexing (B-Tree, B+Tree, Composite Index)
│   └── Tăng tốc truy vấn
│
├── Concurrency Control (Lock, Deadlock, 2PL)
│   └── Xử lý nhiều transaction đồng thời
│
SCALE
├── Database Partitioning
│   └── Chia nhỏ dữ liệu trong một máy
│
├── Database Sharding
│   └── Chia nhỏ dữ liệu ra nhiều máy
│
├── Database Replication
│   └── Nhân bản dữ liệu để tăng availability
│
NÂNG CAO
├── Database Engines (InnoDB, MyISAM, RocksDB...)
│   └── Lựa chọn engine phù hợp với workload
│
├── Database Cursors
│   └── Xử lý tập kết quả lớn hiệu quả
│
├── NoSQL Architecture
│   └── Khi nào SQL không đủ
│
├── Database Security
│   └── Bảo vệ dữ liệu
│
└── Homomorphic Encryption
    └── Truy vấn trên dữ liệu mã hóa (bleeding-edge)
```

## Cách học hiệu quả

### Không nên học theo kiểu "marathon"
Khóa học có hơn 14 giờ nội dung. Không nên cố gắng xem hết trong một lần.

### Nên học theo từng block
1. Học một chủ đề
2. Thực hành với Postgres/MySQL
3. Đặt câu hỏi và tìm câu trả lời
4. Mới chuyển sang chủ đề tiếp theo

### Kết nối kiến thức
Sau mỗi chủ đề, hãy tự hỏi:
- "Điều này ảnh hưởng thế nào đến code tôi đang viết?"
- "Khi nào tôi sẽ cần dùng kiến thức này?"
- "Điều gì xảy ra nếu tôi bỏ qua điều này?"

## Các chủ đề thường bị đánh giá thấp

Nhiều developers biết về indexing và sharding, nhưng thường bỏ qua:

| Chủ đề bị bỏ qua | Tại sao quan trọng |
|---|---|
| **Database Partitioning** | Thường hiệu quả hơn sharding cho nhiều bài toán |
| **Database Cursors** | Xử lý dataset lớn mà không OOM |
| **Database Replication** | Scale đọc mà không cần microservices phức tạp |
| **Database Security** | Thường bị nghĩ đến quá muộn |

## Database Engines - Chủ đề đặc biệt

Đây là một trong những chủ đề được đánh giá cao nhất trong khóa học. Nhiều developers không biết rằng:

- **MySQL** có thể dùng nhiều storage engine khác nhau (InnoDB, MyISAM...)
- **PostgreSQL** có thể được mở rộng với các storage engine khác
- Lựa chọn engine ảnh hưởng trực tiếp đến hiệu năng theo cách bạn không ngờ đến

Ví dụ: Ứng dụng write-heavy nên dùng engine khác với ứng dụng read-heavy.

## Database Discussions - Mở rộng tư duy

Cuối khóa học có phần thảo luận về các câu hỏi mở như:
- Có nên implement Bloom Filter trong ứng dụng hay dùng cái sẵn có trong database?
- Khi nào distributed transactions thực sự cần thiết?
- Lựa chọn giữa Postgres và MySQL trong các tình huống cụ thể

Những thảo luận này không có câu trả lời đúng/sai tuyệt đối - mục tiêu là mở rộng cách tư duy.

## Công cụ sử dụng trong khóa học

- **PostgreSQL** - Database chính cho các ví dụ thực hành
- **Python** - Ví dụ về cursors
- Không dùng ORM - để hiểu rõ những gì thực sự xảy ra

---

**Tiếp theo:** Phase 2 - ACID: Nền tảng của mọi transaction database →
