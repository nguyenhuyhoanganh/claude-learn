# Bài 1: Tổng quan app & liệt kê queries cần trả lời

Đến giờ ta đã có nhiều lệnh trong tay (String, Hash, TTL, INCR...) nhưng vẫn ở mức "biết lệnh đơn lẻ". Phase này là bước **chuyển từ lệnh sang kiến trúc**: thiết kế và xây feature lớn cho app **RB** (Redis eBay) — auction marketplace.

Bài đầu tiên: tour qua app, liệt kê **mọi query/mutation** cần implement. Đây là bước **bắt buộc** trước khi chọn data structure (theo Redis Design Methodology, [phase-3 bài 3](../phase-3/03-redis-design-methodology.md)).

## App RB — sản phẩm mô phỏng eBay

### Business rules

- **Users**: đăng ký, đăng nhập, đăng xuất.
- **Items** (auction): user đăng sản phẩm với **starting price** và **end time**.
- **Bidding**: user khác bid giá cao hơn giá hiện tại.
- **Winner**: hết thời gian → user có bid cao nhất thắng.

Đây là core. Mọi feature khác xoay quanh.

### Các trang chính trong app

```text
+-----------------------------------------------------+
|  /              Landing page                        |
|     - 3 carousel: most expensive / ending soon /    |
|                   most viewed                       |
|     - Search bar (header)                           |
|                                                     |
|  /auth/signin   Sign-in form (username + password)  |
|  /auth/signup   Sign-up form                        |
|                                                     |
|  /items/new     Create auction form                 |
|  /items/:id     Item detail page                    |
|                 - Image, title, seller link         |
|                 - Like button                       |
|                 - Highest bid + bid count + time    |
|                 - Bid form                          |
|                 - Bid history chart                 |
|                 - Similar items carousel            |
|                                                     |
|  /users/:id     Seller profile                      |
|                 - Items being sold                  |
|                 - Items they like                   |
|                 - Items both you AND they like      |
|                                                     |
|  /dashboard     Your seller dashboard               |
|                 - Sortable table of YOUR items      |
|                 - Pagination                        |
+-----------------------------------------------------+
```

### Quy mô giả định — quan trọng cho design

App được thiết kế cho **traffic cao**:
- Có thể tới **hàng triệu item** đang active cùng lúc.
- Mọi list (carousel, dashboard) **phải có pagination** — không bao giờ trả toàn bộ.
- Mọi sort phải **predictable performance** — không "ORDER BY rồi sort runtime với 1M record".

→ Lựa chọn data structure không chỉ phụ thuộc "có lưu được không" mà còn "có scale được không".

## Một feature đặc biệt cần chú ý: **Unique views per user**

Mỗi item có counter "số view". Quy tắc:
- User đã đăng nhập view item → +1.
- User đó **view lại** → KHÔNG +1 (đã được tính rồi).
- User chưa đăng nhập → không count.

→ Không chỉ là counter `INCR` đơn thuần. Phải **uniqueness check** trước khi tăng. Sẽ học cách giải sau (phase-9 với Set).

## Methodology nhắc lại — Query-first

Theo bài [phase-3 bài 3](../phase-3/03-redis-design-methodology.md):

> Trong Redis: **liệt kê query trước**, mới chọn data structure.

Tiếp tục với app RB, ta KHÔNG vẽ ER diagram. Ta đi qua từng trang, **liệt kê mọi data operation** cần.

### Tour qua từng trang để liệt query

**Landing page (`/`)**:
- Find items sorted by **price** (descending), limit N.
- Find items sorted by **ending time** (ascending), limit N.
- Find items sorted by **view count** (descending), limit N.
- (Header) Search items by name.

**Sign in (`/auth/signin`)**:
- Find user by username (để verify password).
- Create session sau khi auth thành công.

**Sign up (`/auth/signup`)**:
- Check username uniqueness.
- Create user.
- Create session.

**Item detail (`/items/:id`)**:
- Find item by id.
- Count likes on item.
- Add/remove like (toggle).
- Check if **current user** liked it.
- Create bid (with current user, amount).
- Get bid history (for chart).
- Find similar items.
- Track view (with unique-per-user rule).

**Seller profile (`/users/:id`)**:
- Get user info.
- Find items owned by user.
- Find items user likes.
- **Intersection**: items both current-user AND seller like.

**Dashboard (`/dashboard`)**:
- Find items owned by current user.
- Sortable by name / price / time left / views / bids.
- Pagination.

**Sessions (cross-cutting)**:
- Find session by token (mỗi request).
- Create session on login.
- Delete session on logout.

### Gom mọi operation lại

Đây là toàn bộ data operation cần implement:

**Reads (queries)**:
| # | Operation |
|---|---|
| 1 | Find items by price (sorted, paginated) |
| 2 | Find items by ending time (sorted, paginated) |
| 3 | Find items by views (sorted, paginated) |
| 4 | Find item by id |
| 5 | Find user by id |
| 6 | Find user by username |
| 7 | Find session by id (token) |
| 8 | Search items by name |
| 9 | Get bid history of item |
| 10 | Get likes count of item |
| 11 | Check if user liked item |
| 12 | Get all items liked by user |
| 13 | Get items both userA and userB liked (intersection) |
| 14 | Find items owned by user |
| 15 | Find similar items |
| 16 | Check if user has viewed item (for unique view) |
| 17 | Count distinct viewers of an item |

**Writes (mutations)**:
| # | Operation |
|---|---|
| 18 | Create user |
| 19 | Create session |
| 20 | Delete session |
| 21 | Create item |
| 22 | Like item |
| 23 | Unlike item |
| 24 | Create bid |
| 25 | Track view (idempotent per user) |

→ **25 operations** — quy mô vừa phải. Mỗi operation sẽ là một function trong `src/services/queries/*`.

## Bốn loại resource cần lưu

Sau khi liệt query, ta thấy 6 loại "record":

| Resource | Mô tả |
|---|---|
| **User** | Thông tin tài khoản: username, password hash, etc. |
| **Session** | Token đăng nhập: user_id, csrf, expires |
| **Item** | Auction: title, image, price, time, owner |
| **Bid** | Lịch sử bid: amount, user, time |
| **View** | Đếm unique view per user per item |
| **Like** | Quan hệ user ↔ item (like) |

Bài 2 sẽ áp **5 câu hỏi methodology** để quyết định kiểu data Redis cho từng resource.

## Vì sao bước này quan trọng?

Nếu ta nhảy ngay vào code mà chưa liệt query:

❌ Khi đụng "find user by username", ta sẽ phát hiện hash không hỗ trợ query theo field → phải tốn refactor, thêm secondary index.

❌ Khi đụng "items sorted by price (paginated)", ta phát hiện list/hash không có built-in sort → phải refactor sang Sorted Set.

❌ Khi đụng "unique view per user", ta phát hiện `INCR` không kiểm tra "đã làm chưa" → phải thêm Set check.

Tất cả "đụng chết" này tránh được bằng **liệt query trước, design sau**. 30 phút trên giấy = nhiều giờ debug ở code.

## Tóm tắt bài 1

- App RB = auction marketplace, traffic high (1M+ items, pagination mọi nơi).
- **Unique view per user** là requirement đặc biệt — không chỉ counter đơn.
- Liệt 25 operations (17 read + 8 write) — toàn bộ data layer của app.
- 6 loại resource cần lưu: User, Session, Item, Bid, View, Like.
- **Bài 2** sẽ áp methodology để chọn data type cho từng resource.

**Bài kế tiếp** → [Bài 2: Chọn data type cho từng resource](02-chon-data-type-cho-tung-resource.md)
