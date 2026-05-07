# Bài 2: Activity Types — Kiểm soát loại hành động

## Vấn đề

Event `pull_request` kích hoạt khi **bất kỳ hành động nào** xảy ra với PR: mở, đóng, chỉnh sửa, assign... Nhưng bạn chỉ muốn chạy workflow khi PR được **mở** hoặc **chỉnh sửa code** chứ không phải khi đóng.

Đây là lúc **Activity Types** phát huy tác dụng.

---

## Activity Types là gì?

Là các loại hành động cụ thể của một event. Bạn có thể chỉ định chính xác loại nào sẽ kích hoạt workflow.

---

## Cú pháp

```yaml
on:
  pull_request:
    types:
      - opened
      - edited
```

Hoặc viết gọn:

```yaml
on:
  pull_request:
    types: [opened, edited]
```

---

## Activity Types của `pull_request`

| Type | Kích hoạt khi |
|---|---|
| `opened` | PR mới được tạo |
| `closed` | PR bị đóng (merged hoặc rejected) |
| `edited` | Tiêu đề/body PR bị chỉnh sửa |
| `synchronize` | Có commit mới được push vào branch của PR |
| `reopened` | PR đóng rồi mở lại |
| `assigned` | Được assign cho ai đó |
| `labeled` | Được gán label |
| `review_requested` | Yêu cầu review |

### Mặc định (khi không khai báo types)

```yaml
on: pull_request
# tương đương với:
on:
  pull_request:
    types: [opened, synchronize, reopened]
```

> **Quan trọng:** Mặc định `pull_request` **không** trigger khi PR được `closed`. Muốn bắt sự kiện đóng PR, phải khai báo rõ `types: [closed]`.

---

## Activity Types của `issues`

| Type | Kích hoạt khi |
|---|---|
| `opened` | Issue mới được tạo |
| `closed` | Issue bị đóng |
| `edited` | Issue bị chỉnh sửa |
| `deleted` | Issue bị xoá |
| `labeled` | Issue được gán label |
| `assigned` | Issue được assign |

---

## Ví dụ thực tế

### Chỉ chạy khi PR mới được tạo

```yaml
on:
  pull_request:
    types: [opened]
```

### Chạy khi PR được tạo hoặc có code mới

```yaml
on:
  pull_request:
    types: [opened, synchronize]
```

### Kết hợp nhiều events và types

```yaml
on:
  pull_request:
    types: [opened, synchronize]
  workflow_dispatch:       # khai báo event không có types → để nguyên dấu :
```

> Lưu ý: `workflow_dispatch:` **phải có dấu hai chấm** dù không có gì bên dưới, vì bạn đang dùng cú pháp map (key: value).

---

## Kiểm tra event đã trigger đúng chưa

Sau khi chạy workflow, nhìn vào phần **Summary** của workflow run, GitHub sẽ hiển thị:

```
Triggered by: pull_request (opened)
```

Giúp bạn xác nhận đúng loại event đã trigger.

---

**Tiếp theo:** Event Filters — Lọc theo branch và file path →
