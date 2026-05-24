# Bài 6: Concurrency Control

Production = nhiều client cùng lúc đọc/ghi. Cùng update 1 document → race condition. ES có cơ chế **optimistic concurrency control** để xử lý.

## Vấn đề: lost update

```text
T+0:  Client A → GET page-view-count → 10
T+0:  Client B → GET page-view-count → 10 (cùng lúc)
T+1:  Client A → set count = 11
T+1:  Client B → set count = 11
```

→ 2 user view → count phải = 12. Thực tế = 11. **Lost update**.

Xảy ra trong:
- Counter (page view, like).
- Inventory (số sản phẩm còn).
- Wallet balance.

## Pessimistic vs Optimistic

**Pessimistic locking** (kiểu SQL `SELECT FOR UPDATE`):
- Lock document khi đọc.
- Client khác chờ.
- Pros: simple logic.
- Cons: chậm, deadlock risk, không scale distributed.

**Optimistic locking**:
- Đọc kèm version.
- Update kèm version expected.
- Server check: nếu version expected ≠ current → fail.
- Client retry với version mới.
- Pros: scale tốt, no lock.
- Cons: code phức tạp hơn (retry logic).

→ **ES dùng optimistic**.

## `_seq_no` + `_primary_term`

ES có 2 field metadata cho concurrency:

- **`_seq_no`** — sequence number tăng mỗi write trong shard.
- **`_primary_term`** — version của primary shard (tăng khi primary promote/failover).

Cặp `(seq_no, primary_term)` = **identifier unique** version document.

GET document:

```json
{
    "_id": "1",
    "_seq_no": 5,
    "_primary_term": 1,
    "_source": { "count": 10 }
}
```

## Update với `if_seq_no` + `if_primary_term`

Update chỉ work nếu version vẫn là expected:

```text
PUT /movies/_doc/109487?if_seq_no=5&if_primary_term=1
{
    "id": 109487,
    "title": "Interstellar",
    "year": "2014"
}
```

Scenarios:

**Case 1**: không ai update giữa lúc đọc + ghi → seq_no vẫn 5 → succeed. seq_no tăng lên 6.

**Case 2**: client khác đã update → seq_no thành 6 → mình gửi if_seq_no=5 → **fail** với HTTP 409 Conflict:

```json
{
    "error": {
        "type": "version_conflict_engine_exception",
        "reason": "[109487]: version conflict, required seqNo [5], primary term [1]. current document has seqNo [6] and primary term [1]"
    },
    "status": 409
}
```

→ Client retry: GET lại → có seq_no=6 → update với if_seq_no=6.

## Client retry pattern

Pseudo-code:

```python
def update_with_retry(doc_id, update_fn, max_retries=5):
    for attempt in range(max_retries):
        # Read
        doc = es.get(index="movies", id=doc_id)
        seq_no = doc["_seq_no"]
        primary_term = doc["_primary_term"]
        
        # Apply update logic
        new_source = update_fn(doc["_source"])
        
        # Write with version check
        try:
            es.index(
                index="movies",
                id=doc_id,
                body=new_source,
                if_seq_no=seq_no,
                if_primary_term=primary_term
            )
            return  # Success
        except VersionConflict:
            # Someone else updated. Retry.
            continue
    
    raise Exception("Max retries exceeded")
```

→ Loop tối đa N lần. Mỗi loop = read fresh + try write.

## `retry_on_conflict` (automatic retry)

ES `_update` endpoint có flag tự retry:

```text
POST /movies/_update/109487?retry_on_conflict=5
{
    "script": "ctx._source.view_count++"
}
```

→ Nếu version conflict → ES tự retry (read fresh + apply script) tối đa 5 lần. Không cần client logic.

→ Best cho counter increment / append.

> Chỉ work với `_update`. Không work với `_doc` PUT (full replace).

## Demo

```text
# Insert
PUT /counter/_doc/page-1
{ "views": 0 }

# Read
GET /counter/_doc/page-1
```

Response có seq_no=0, primary_term=1.

```text
# Update với version đúng → success
POST /counter/_update/page-1?if_seq_no=0&if_primary_term=1
{
    "doc": { "views": 1 }
}
```

seq_no → 1.

```text
# Update với version cũ → fail
POST /counter/_update/page-1?if_seq_no=0&if_primary_term=1
{
    "doc": { "views": 2 }
}
```

→ 409 Conflict.

```text
# Retry on conflict
POST /counter/_update/page-1?retry_on_conflict=5
{
    "script": "ctx._source.views++"
}
```

→ Tăng views, auto retry nếu conflict.

## Khi nào cần concurrency control?

| Use case                  | Cần?                                     |
|---------------------------|------------------------------------------|
| Log append-only          | Không (mỗi log = doc mới)                |
| Counter increment        | **Có** (race condition phổ biến)         |
| User profile update      | Có (nếu nhiều device sync cùng lúc)      |
| Bulk import (lần đầu)    | Không (mỗi doc unique ID)                |
| Inventory (e-commerce)   | **Có cực kỳ** (oversell scenario)        |

→ Đánh giá use case. Mặc định không quan tâm; bật khi data critical.

## Limitation

### Single document

Concurrency control chỉ work **per document**. Không transaction nhiều document như SQL.

→ Use case multi-doc transaction (transfer tiền account A → B) → **không phù hợp ES**. Dùng RDBMS.

### Distributed

`_seq_no` per shard. 2 shard khác nhau → seq_no independent. Document cùng shard mới so sánh được — vì ES route doc cùng ID vào cùng shard (bài Phase 1).

## Tóm tắt

- **Lost update** = race condition khi 2 client update cùng document.
- **Pessimistic** (lock) vs **Optimistic** (version check). ES = optimistic.
- **`_seq_no`** + **`_primary_term`** = identifier version document.
- Update với **`?if_seq_no=X&if_primary_term=Y`** — fail HTTP 409 nếu version đã đổi.
- Client retry pattern: read fresh → apply → write với version expected → repeat.
- **`?retry_on_conflict=N`** trên `_update` — ES tự retry, không cần client logic.
- Counter increment, inventory cần. Log append-only không cần.
- Chỉ work **per document**, không multi-doc transaction.

---

→ [Bài tiếp theo: Data modeling và parent-child](07-data-modeling.md)
