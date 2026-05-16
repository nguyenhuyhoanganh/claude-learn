# Bài 1: 2 cách load relational data trong Redis

Sau khi lấy danh sách IDs từ Sorted Set / Set, bài toán thường gặp tiếp theo: **load các hash liên quan**. Có 2 cách trong Redis: **pipeline HGETALL** (đã quen) và **SORT command** (mới, mạnh hơn nhưng phức tạp). Bài này so sánh, sau đó các bài tiếp đi sâu vào SORT.

## Bối cảnh — vì sao bài này tồn tại

Đến giờ ta đã làm:

```ts
// Step 1: IDs từ sorted set
const ids = await client.zRange('items:views', 0, 19, { REV: true });

// Step 2: Pipeline HGETALL
const items = await Promise.all(ids.map((id) => client.hGetAll(itemKey(id))));
```

→ 2 RTT, ~1-2ms. Đủ dùng.

**Nhưng**: 2 RTT chứ không phải 1. Có thể giảm xuống 1 RTT không? Có — bằng lệnh `SORT`.

## SORT command — preview

```text
SORT items:views BY items#*->endingAt GET items#*->name GET items#*->views
```

→ **1 lệnh**, lấy "sort + join hash data + return".

Hoạt động trên: Set, Sorted Set, List.

Cú pháp phức tạp, dễ sai. Học cẩn thận.

## So sánh nhanh: Pipeline vs SORT

| | Pipeline (ZRANGE + HGETALL) | SORT |
|---|---|---|
| Số RTT | 2 | 1 |
| Cú pháp | Đơn giản, 2 lệnh tách | Phức tạp, 1 lệnh đa cờ |
| Dễ debug | Có thể test từng step | Khó debug, 1 lệnh fail toàn bộ |
| Cluster support | OK (nếu mỗi hash cùng slot với sorted set khi cần) | **Không hỗ trợ cluster** với BY/GET |
| Latency profile | Predictable, mỗi step rõ ràng | 1 lệnh nặng có thể chặn event loop |
| Flexibility | Cao — xử lý ở client | Hạn chế — pattern cố định |

**Quan trọng**: SORT KHÔNG hoạt động trên Redis Cluster với BY/GET pattern (vì cần access nhiều key). Đây là **lý do hàng đầu** SORT đang deprecated cho code mới.

## Recommendation

| Tình huống | Dùng |
|---|---|
| App standalone, dataset nhỏ | Hoặc cũng được |
| App cluster | **Pipeline** (SORT không chạy) |
| Production mới | **Pipeline** (rõ ràng, dễ maintain) |
| Search/sort phức tạp | **RediSearch** (phase-18) |
| Code đã có dùng SORT | Học để đọc, dần migrate |

Khoá vẫn dạy SORT vì:
1. Còn nhiều codebase cũ dùng.
2. Đây là tiếng vọng historical của Redis design — biết để hiểu trade-off.
3. SORT vẫn hữu ích cho 1 số use case standalone-only.

## Implement getItemsByEndingSoonest với Pipeline (đã làm phase-11)

```ts
export async function getItemsByEndingSoonest(offset = 0, count = 10) {
  const ids = await client.zRange(
    itemsByEndingSoonKey(),
    Date.now(),
    '+inf',
    { BY: 'SCORE', LIMIT: { offset, count } }
  );
  
  if (ids.length === 0) return [];
  
  const items = await Promise.all(ids.map((id) => client.hGetAll(itemKey(id))));
  return items
    .map((raw, i) => Object.keys(raw).length === 0 ? null : deserialize(ids[i], raw))
    .filter(Boolean);
}
```

2 RTT, clear code. Recommended cho production mới.

## Implement getItemsByMostViewed với SORT

```ts
export async function getMostViewedItems(offset = 0, count = 10) {
  const results = await client.sort(itemsByViewsKey(), {
    BY: 'NOSORT',                                       // không sort thêm (sorted set đã sort)
    GET: ['#', `${itemKey('*')}->name`, `${itemKey('*')}->views`],
    LIMIT: { offset, count },
  });
  // results = ['id1', 'name1', 'views1', 'id2', 'name2', 'views2', ...]
  
  // Chunk thành 3 trường mỗi item
  const items: Partial<Item>[] = [];
  for (let i = 0; i < results.length; i += 3) {
    items.push({
      id:    results[i],
      name:  results[i + 1],
      views: parseInt(results[i + 2], 10),
    });
  }
  return items;
}
```

1 RTT — fetched sort + members + fields trong 1 lệnh.

**Nhược điểm**:
- Trả mảng flat — phải chunk ở client.
- Chỉ lấy được fields đã specify trong GET — không có full hash.
- Phải code chunk logic.

## Cú pháp SORT chi tiết

```text
SORT key [BY pattern] [LIMIT offset count] [GET pattern [GET pattern ...]] [ASC|DESC] [ALPHA] [STORE destination]
```

Mọi argument optional. Mặc định:
- Sort theo **member numerically**.
- Trả về sorted members.

Các argument:

| Arg | Ý nghĩa |
|---|---|
| `BY pattern` | Sort theo external value lookup qua pattern. `BY NOSORT` = không sort, giữ thứ tự. |
| `LIMIT offset count` | Pagination (như SQL). |
| `GET pattern` | Field cần lấy ra. `#` = member gốc. Có thể nhiều GET. |
| `ASC` / `DESC` | Hướng sort. Default ASC. |
| `ALPHA` | Sort theo alphabet thay vì numeric. |
| `STORE dest` | Lưu kết quả vào list `dest` thay vì trả về. |

## Cảnh báo: SORT trên dataset lớn rất chậm

SORT phải **load tất cả member** vào memory, sort, lookup các GET pattern. Với 1M item:
- Memory tạm thời: 100s MB.
- Thời gian: 100ms-1s.
- Chặn event loop.

→ **Tuyệt đối tránh SORT trên collection lớn** ở production. Với `BY NOSORT` thì OK (bỏ qua sort), nhưng GET vẫn lookup từng key.

## Khi nào SORT thực sự đáng dùng?

1. **Standalone Redis** (không cluster).
2. **Collection nhỏ** (< 10k phần tử).
3. **Cần 1 RTT** vì latency mạng cao (vd app + Redis cross-region).
4. **Sort criteria khác với "natural order"** của collection (vd: list of user IDs, sort theo age từ hash).

Đa số trường hợp: pipeline 2 RTT đủ.

## Roadmap phase-12

5 bài còn lại:
- Bài 2: Phân tích SORT step-by-step (BY pattern).
- Bài 3: GET pattern + joining hash data.
- Bài 4: SORT options khác (LIMIT, ALPHA, NOSORT).
- Bài 5: Implement getMostViewed bằng SORT trong app RB.
- Bài 6: Best practice + khi nào quay về pipeline.

## Tóm tắt bài 1

- 2 cách load relational data: **pipeline** (đơn giản, 2 RTT) hoặc **SORT** (phức tạp, 1 RTT).
- SORT không hỗ trợ **Redis Cluster** với BY/GET — lý do quan trọng để tránh.
- Pipeline là **recommendation default** cho code mới.
- SORT vẫn cần học vì legacy code và một số use case standalone.
- Tránh SORT trên collection lớn (> 10k) — block event loop.

**Bài kế tiếp** → [Bài 2: SORT command — phân tích step-by-step](02-sort-step-by-step.md)
