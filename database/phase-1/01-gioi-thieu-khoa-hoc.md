# Bài 1: Giới thiệu khóa học Database Engines Crash Course

## Tại sao khóa học này khác biệt?

Hầu hết các khóa học về database dạy bạn cách **dùng** database: viết SQL, tạo bảng, kết nối ứng dụng. Nhưng khóa học này dạy bạn điều quan trọng hơn: **hiểu database hoạt động như thế nào từ bên trong**.

Khi bạn hiểu cách database thực sự hoạt động, bạn sẽ bắt đầu tự đặt ra những câu hỏi mà trước đây bạn chưa bao giờ nghĩ đến:

- Tại sao query này chậm? Index có giúp ích không?
- Ứng dụng của tôi cần sharding hay partitioning?
- Khi nào nên dùng NoSQL thay vì SQL?
- Transaction này có đảm bảo an toàn không?

## Đối tượng học viên

Khóa học này **KHÔNG** dành cho người mới hoàn toàn. Bạn cần có:

- Biết cơ bản về SQL (SELECT, INSERT, JOIN...)
- Đã từng kết nối ứng dụng với database
- Hiểu cơ bản về lập trình và backend

Nếu bạn chưa biết gì về database, hãy học SQL cơ bản trước, sau đó quay lại đây.

## Mục tiêu học tập

Sau khi hoàn thành khóa học, bạn sẽ:

1. **Hiểu nguyên lý ACID** - Tại sao transactions tồn tại và chúng bảo vệ dữ liệu thế nào
2. **Nắm vững Database Internals** - Page, Row, Disk I/O hoạt động ra sao
3. **Thành thạo Indexing** - B-Tree, B+Tree, Composite Index, khi nào cần dùng
4. **Hiểu Partitioning và Sharding** - Phân biệt hai khái niệm thường bị nhầm lẫn
5. **Nắm Concurrency Control** - Lock, Deadlock, Two-Phase Locking
6. **Hiểu Database Replication** - Scale horizontal như thế nào
7. **Biết Database Engines** - Tại sao InnoDB, RocksDB, WiredTiger lại khác nhau
8. **Áp dụng vào System Design** - Thiết kế database cho bài toán thực tế

## Quan niệm sai lầm cần phá bỏ

> **"Relational database không scale được"**

Đây là quan niệm SAI. Relational database có rất nhiều công cụ để scale:
- **Replication**: Thêm replica để phân tải read
- **Partitioning**: Chia bảng lớn thành các phần nhỏ
- **Connection Pooling**: Quản lý kết nối hiệu quả
- **Proper Indexing**: Tối ưu query

Chỉ khi đã khai thác hết các công cụ này mà vẫn không đủ, mới nên nghĩ đến NoSQL hay các giải pháp phức tạp hơn.

## Triết lý học tập

Giảng viên Hussein luôn đặt câu hỏi: **"Tại sao công nghệ này tồn tại?"**

Thay vì học cách dùng một công cụ cụ thể, hãy hiểu:
- Vấn đề gì nó giải quyết?
- Tại sao người ta phát minh ra nó?
- Khi nào nên dùng, khi nào không?

Khi hiểu "tại sao", bạn sẽ tự biết "khi nào" và "như thế nào".

---

**Tiếp theo:** 02-lo-trinh-hoc-database.md →
