# Bài 2: Feature Requirements - Quy trình từng bước

## Tại sao cần quy trình?

Không thể chỉ hỏi client "kể hết những gì bạn cần" — quá mơ hồ với complex systems.

**Phương pháp tốt hơn: Use Cases & User Flows**

- **Use Case**: Một tình huống cụ thể trong đó hệ thống được dùng để đạt mục tiêu của người dùng
- **User Flow**: Biểu diễn từng bước (hoặc đồ thị) của mỗi use case

## Quy trình 3 bước

### Bước 1: Xác định tất cả Actors/Users

Ai tương tác với hệ thống?

**Ví dụ hitchhiking service:**
- Driver (tài xế muốn chở khách)
- Rider (người muốn đi nhờ)

→ Nếu bỏ sót actor, sẽ bỏ sót use cases quan trọng.

### Bước 2: Xác định tất cả Use Cases

Mọi cách mà actor tương tác với hệ thống:

| Use Case | Actor |
|----------|-------|
| Đăng ký rider mới | Rider |
| Đăng ký driver mới | Driver |
| Rider đăng nhập & tìm xe | Rider |
| Driver đăng nhập & sẵn sàng | Driver |
| Match thành công → chuyến đi | Driver + Rider |
| Match không thành công | Rider |

### Bước 3: Mở rộng mỗi Use Case thành User Flow

Mô tả toàn bộ luồng tương tác giữa actors và system.

**Công cụ: Sequence Diagram (UML)**

```
Thời gian đi từ trên xuống dưới
Mỗi entity là một đường thẳng dọc
Mũi tên liền = request, mũi tên đứt = response
```

## Ví dụ: Sequence Diagram - Successful Ride Match

```
Driver          System          Rider
  |                |               |
  |-- "Sẵn sàng   |               |
  |    trên route" |               |
  |                |               |
  |                |<-- "Cần xe    |
  |                |    từ A→B"   |
  |                |               |
  |                |[Tìm match]    |
  |                |               |
  |<-- "Có rider" |               |
  |                |-- "Tìm được"→|
  |                |               |
  |    [Driver đến đón]           |
  |                |               |
  |-- "Bắt đầu    |               |
  |    chuyến đi" |               |
  |                |--"Đã bắt đầu"→|
  |                |               |
  |    [Driver đến điểm đến]      |
  |                |               |
  |-- "Kết thúc   |               |
  |    chuyến đi" |               |
  |                |               |
  |                |[Trừ tiền Rider]
  |                |[Chuyển cho Driver]
  |                |               |
  |<-- "Đã nhận  |               |
  |    tiền"      |-- "Receipt" →|
```

## Lợi ích phụ: Xác định API

Mỗi arrow trong sequence diagram = một API call tiềm năng:
- Data flowing = arguments của API call
- Dễ dàng extract ra future API specification

## Tóm tắt

```
3 bước thu thập Feature Requirements:
1. Identify Actors
2. Enumerate Use Cases  
3. Expand each Use Case → User Flow (Sequence Diagram)
```

**Sequence Diagram giúp:**
- Visualize interactions
- Spot missing cases
- Lay groundwork cho API design

---
**Tiếp theo:** Bài 3 - Quality Attributes →
