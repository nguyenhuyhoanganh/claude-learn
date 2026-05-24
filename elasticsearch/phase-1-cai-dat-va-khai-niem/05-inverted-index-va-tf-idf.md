# Bài 5: Inverted index và TF-IDF

Bài này giải thích **tại sao** Elasticsearch nhanh: **inverted index** (data structure cốt lõi) + **TF-IDF** (cách tính relevance).

## Vấn đề: search trên document text

Có 1 triệu document. User search "matrix". Phải làm sao?

### Cách ngây thơ: scan từng document

```text
For each doc:
    if "matrix" in doc.text:
        match
```

→ O(N) — 1 triệu doc scan từng cái → chậm. Nếu mỗi doc 10 KB → đọc 10 GB từ disk.

### Cách thông minh: index trước

Trước khi search, **xây dựng index** map term → documents chứa term đó.

```text
INDEX:
"matrix" → [doc1, doc5, doc23, doc100]
"reloaded" → [doc5, doc23]
"trinity" → [doc1, doc23]
```

→ Search "matrix" = lookup key trong hash → **O(1)** trả list doc IDs. Nhanh hàng triệu lần.

→ Đây là **inverted index**.

## Inverted index = data structure cốt lõi

Tên gọi "inverted" vì nó **đảo ngược** mapping:

- **Normal**: document → terms (như list trang sách).
- **Inverted**: term → documents (như index cuối sách).

### Build process

Document gốc:

```text
Doc 1: "Space the final frontier these are the voyages"
Doc 2: "He's bad he's number one he's a space cowboy"
```

Build inverted index — 3 bước:

**Bước 1: Tokenize**

Split string thành tokens (words):

```text
Doc 1: ["Space", "the", "final", "frontier", "these", "are", "the", "voyages"]
Doc 2: ["He's", "bad", "he's", "number", "one", "he's", "a", "space", "cowboy"]
```

**Bước 2: Normalize**

- Lowercase: `"Space" → "space"`.
- Remove punctuation: `"He's" → "hes"` hoặc `"he", "s"`.
- (Optional) Stemming: `"voyages" → "voyag"`, `"running" → "run"`.
- (Optional) Stop words: bỏ `"the", "a", "is", "are"`...

```text
Doc 1: ["space", "final", "frontier", "voyag"]      (sau stem + stop)
Doc 2: ["bad", "number", "one", "space", "cowboy"]
```

**Bước 3: Build inverted map**

```text
TERM       → DOCUMENTS (postings list)
─────────────────────────────────────
"bad"      → [doc2]
"cowboy"   → [doc2]
"final"    → [doc1]
"frontier" → [doc1]
"number"   → [doc2]
"one"      → [doc2]
"space"    → [doc1, doc2]
"voyag"    → [doc1]
```

### Search "space cowboy"

```text
"space"  → [doc1, doc2]
"cowboy" → [doc2]
```

Intersect (cả 2 phải có) → `[doc2]`. Done.

→ Không scan doc gốc. Chỉ lookup hash.

## Trong thực tế: thêm thông tin

Inverted index ES không chỉ lưu `term → [doc_ids]`. Còn lưu:

- **Position** trong doc (cho phrase search).
- **Frequency** trong doc (cho relevance).
- **Field** chứa term (`title` vs `body`).

Format thực:

```text
"matrix" → [
    { doc: 1, field: "title", positions: [0],     freq: 1 },
    { doc: 5, field: "body",  positions: [2, 17], freq: 2 },
    { doc: 23, field: "title", positions: [0],    freq: 1 }
]
```

→ Phục vụ phrase query (Phase 3), highlighting, relevance scoring.

## Lucene segment

Inverted index ES build qua **Apache Lucene**. Mỗi shard = nhiều **segment** (immutable inverted index file).

- Add document → tạo segment mới.
- Update document → mark old version deleted + tạo segment mới.
- Periodic merge → gộp segment nhỏ thành segment lớn → giảm fragmentation.

→ Background detail, không phải tinker thường xuyên. Phase 8 chạm khi tối ưu.

## Phần 2: relevance scoring với TF-IDF

OK, search "matrix" return list document chứa "matrix". Nhưng **thứ tự**? Document nào quan trọng nhất hiện đầu?

→ Đây là **relevance**. ES dùng score (`_score`) để rank.

Algorithm cổ điển: **TF-IDF** (Term Frequency × Inverse Document Frequency).

## TF (Term Frequency)

**Tần suất** từ xuất hiện trong **document đó**.

```text
Document 1: "matrix matrix matrix story about matrix"
  → TF("matrix") = 4 / 6 = 0.67

Document 2: "movie about computer"
  → TF("matrix") = 0
```

→ Doc 1 quan trọng hơn về "matrix" (vì nói nhiều về matrix).

## IDF (Inverse Document Frequency)

**Mức hiếm** của từ trong **toàn corpus**.

```text
"the" xuất hiện trong 999/1000 doc → IDF rất thấp (~0)
"matrix" xuất hiện trong 5/1000 doc → IDF cao
"quantum-entanglement" xuất hiện trong 1/1000 doc → IDF rất cao
```

Công thức:

```text
IDF(term) = log(total_docs / docs_containing_term)
```

→ Từ hiếm = IDF cao = "có ý nghĩa".

## TF × IDF

Score = TF × IDF.

Ý nghĩa:

- Document nói **nhiều** về term + term **hiếm** trong corpus → score cao.
- Document **không nhắc** term hoặc term quá phổ biến (như "the") → score thấp.

Example:

Search "matrix":

- Doc 1: TF("matrix") = 0.67, IDF("matrix") = 3.0 → score = 2.01.
- Doc 2: TF("matrix") = 0.1, IDF("matrix") = 3.0 → score = 0.3.
- Doc 3 chứa nhiều "the": TF("the") cao nhưng IDF("the") ≈ 0 → score ≈ 0.

→ Doc 1 lên top.

## BM25 — ES default từ 5.0

TF-IDF có flaw: TF tăng tuyến tính → 100 lần "matrix" có score 100× hơn 1 lần. Không realistic.

**BM25** = "Best Match 25" → cải tiến:

- TF saturate (curve nhô lên rồi flat). 100 lần "matrix" chỉ ~2× hơn 1 lần.
- Field length normalization. Doc dài, score giảm chút (vì dễ chứa term hơn).

→ ES dùng BM25 mặc định. Concept tương tự TF-IDF. Đa số case, dev không tinker — accept default.

## Demo `_score` trong response

```text
GET /movies/_search
{
    "query": { "match": { "title": "matrix" } }
}
```

Response:

```json
{
    "hits": {
        "max_score": 1.5,
        "hits": [
            { "_id": "1", "_score": 1.5, "_source": { "title": "Matrix Reloaded" } },
            { "_id": "2", "_score": 1.2, "_source": { "title": "The Matrix" } },
            { "_id": "3", "_score": 0.5, "_source": { "title": "Matrix Story Behind" } }
        ]
    }
}
```

→ Hits sort descending by `_score` (default).

## Khi nào không dùng score?

Không phải lúc nào cũng cần ranking:

- **Filter** (Phase 3 bài 5): match yes/no, không tính score → nhanh hơn.
- **Sort by date**: log analytics → mới nhất trước, không relevance.
- **Aggregation only**: count, sum, distinct → score irrelevant.

→ ES có cơ chế **skip scoring** (filter context vs query context).

## Tóm tắt

- **Inverted index** = data structure map `term → [document_ids]`. O(1) lookup.
- Built qua tokenize + normalize + map. Apache Lucene handle.
- ES inverted index lưu thêm position, frequency, field.
- **TF-IDF** = relevance scoring kinh điển. Score = TF × IDF.
- **TF** = tần suất từ trong doc. **IDF** = mức hiếm trong corpus.
- ES dùng **BM25** mặc định (cải tiến TF-IDF) — TF saturates, length normalization.
- `_score` trong response = BM25 score. Sort desc by default.
- Filter / aggregation không cần score → skip scoring → nhanh hơn.

---

→ [Bài tiếp theo: Shard và Replica](06-shard-va-replica.md)
