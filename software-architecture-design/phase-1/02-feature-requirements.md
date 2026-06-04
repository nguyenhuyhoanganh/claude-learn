# Bài 2: Feature Requirements — quy trình thu thập từng bước

## Tại sao cần một quy trình bài bản?

Không thể chỉ hỏi khách hàng "kể hết những gì bạn cần" rồi ngồi viết — câu hỏi như vậy **quá mơ hồ** với các hệ thống phức tạp (complex systems). Khách hàng thường:
- Quên những trường hợp ngoài lề (edge cases).
- Mặc định rằng những thứ "ai cũng biết" thì không cần nói.
- Đưa ra yêu cầu mâu thuẫn nhau mà chính họ không nhận ra.

**Phương pháp hiệu quả hơn: Use Cases và User Flows**

- **Use Case** (kịch bản sử dụng): Một tình huống cụ thể trong đó hệ thống được dùng để đạt được mục tiêu nào đó của người dùng.
- **User Flow** (luồng người dùng): Biểu diễn từng bước (hoặc dưới dạng đồ thị) của mỗi use case — ai làm gì, theo thứ tự nào.

Cặp khái niệm này giúp bóc tách requirements thành các đơn vị **rời rạc, kiểm tra được**, thay vì một mớ mô tả chung chung.

## Quy trình 3 bước

### Bước 1: Liệt kê tất cả Actors (người/hệ thống tương tác)

Đặt câu hỏi: **ai/cái gì sẽ tương tác với hệ thống của chúng ta?**

Đó có thể là người dùng (user), hệ thống bên ngoài (external system), thiết bị (device), v.v.

**Ví dụ với dịch vụ đi nhờ xe (hitchhiking service):**
- **Driver** (tài xế — người muốn chở khách).
- **Rider** (người đi nhờ — người muốn xin đi chung xe).

→ ⚠️ Nếu bỏ sót một actor, ta sẽ tự động bỏ sót toàn bộ các use cases liên quan đến actor đó. Đây là lỗi rất phổ biến.

Trong các hệ thống lớn còn có thể có: Admin (quản trị viên), Payment Gateway (cổng thanh toán bên ngoài), Map Service (dịch vụ bản đồ), Customer Support (bộ phận hỗ trợ).

### Bước 2: Liệt kê tất cả Use Cases

Với mỗi actor, ghi ra **mọi cách mà actor đó có thể tương tác với hệ thống**.

**Ví dụ:**

| Use Case | Actor liên quan |
|---|---|
| Đăng ký rider mới | Rider |
| Đăng ký driver mới | Driver |
| Rider đăng nhập và tìm xe đi nhờ | Rider |
| Driver đăng nhập và báo "sẵn sàng nhận khách" | Driver |
| Match thành công → chuyến đi diễn ra | Driver + Rider |
| Match không thành công (không tìm được tài xế nào quanh đó) | Rider |
| Rider huỷ chuyến giữa chừng | Rider |
| Driver từ chối yêu cầu | Driver |
| Rider đánh giá driver sau chuyến đi | Rider |

Mỗi dòng = 1 use case. Càng đầy đủ càng tốt, kể cả các trường hợp "tiêu cực" (huỷ, từ chối, lỗi).

### Bước 3: Mở rộng mỗi Use Case thành User Flow

Với mỗi use case, **mô tả chi tiết toàn bộ luồng tương tác** giữa các actor và hệ thống — ai gửi thông điệp gì, hệ thống phản hồi như thế nào, theo thứ tự ra sao.

**Công cụ chính: Sequence Diagram (sơ đồ tuần tự)** trong UML.

Quy ước đọc Sequence Diagram:
- Thời gian đi **từ trên xuống dưới**.
- Mỗi entity (actor hoặc thành phần hệ thống) là một **đường thẳng dọc**.
- Mũi tên **liền** = request (yêu cầu).
- Mũi tên **đứt** = response (phản hồi).
- Khối chữ nhật trên đường thẳng = entity đang **xử lý/active**.

## Ví dụ minh hoạ: Sequence Diagram cho "Match chuyến đi thành công"

```text
Driver              Hệ thống              Rider
  |                    |                    |
  |── "Tôi sẵn sàng    |                    |
  |   trên tuyến A→B"→|                    |
  |                    |                    |
  |                    |←── "Cần xe đi      |
  |                    |   từ A→B"          |
  |                    |                    |
  |                    | [Tìm match phù hợp]|
  |                    |                    |
  |←── "Có rider gần   |                    |
  |   đây, nhận không?"|                    |
  |                    |── "Đã tìm được    →|
  |                    |   tài xế cho bạn"  |
  |                    |                    |
  |   [Tài xế lái đến đón rider]            |
  |                    |                    |
  |── "Đã đón được     |                    |
  |   rider, bắt đầu  →|                    |
  |   chuyến đi"       |                    |
  |                    |── "Chuyến đi đã   →|
  |                    |   bắt đầu"         |
  |                    |                    |
  |   [Tài xế lái đến điểm đến]             |
  |                    |                    |
  |── "Đã đến nơi,    →|                    |
  |   kết thúc chuyến" |                    |
  |                    |                    |
  |                    | [Trừ tiền từ tài   |
  |                    |  khoản Rider]      |
  |                    | [Chuyển tiền cho   |
  |                    |  Driver (đã trừ fee)]|
  |                    |                    |
  |←── "Đã nhận được   |                    |
  |   tiền"            |── "Hoá đơn chuyến →|
  |                    |   đi"              |
```

Sơ đồ này thể hiện trọn vẹn 1 use case, đủ chi tiết để bất kỳ ai đọc cũng hình dung được flow.

## Lợi ích phụ ngoài việc nắm rõ requirements

Sequence Diagram còn cho ta **bộ khung sẵn để thiết kế API** ở giai đoạn sau:
- Mỗi mũi tên trong sơ đồ = một **API call tiềm năng**.
- Dữ liệu trên mũi tên = **tham số (arguments)** mà API đó cần.
- Rất dễ dàng trích xuất ra **bản đặc tả API (API specification)** chính thức từ sơ đồ này.

→ Sequence Diagram không chỉ giúp thu thập requirements mà còn rút ngắn khoảng cách giữa requirements và thiết kế kỹ thuật.

## Tóm tắt

```text
3 bước thu thập Feature Requirements bài bản:

1. Identify Actors            — Liệt kê mọi người/hệ thống tương tác
                                 với hệ thống ta đang thiết kế
                                 
2. Enumerate Use Cases        — Với mỗi actor, liệt kê mọi cách họ
                                 tương tác (cả tích cực lẫn tiêu cực)
                                 
3. Expand each Use Case       — Vẽ Sequence Diagram chi tiết
   → User Flow                  cho từng use case
```

**Sequence Diagram giúp:**
- **Visualize interactions** — Trực quan hoá các tương tác phức tạp.
- **Spot missing cases** — Phát hiện sớm các case bị bỏ sót (thường thấy ngay khi vẽ).
- **Lay groundwork for API design** — Đặt nền móng cho thiết kế API ở phase sau.

---
**Bài kế tiếp**: [Bài 3 - Quality Attributes (Thuộc tính chất lượng)](03-quality-attributes.md) →
