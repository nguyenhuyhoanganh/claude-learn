# Bài 1: Kết nối cluster và dataset MovieLens

Phase 1 cài cluster. Phase 2 thực sự **làm việc với data**. Trước hết: cách kết nối hiệu quả + chọn dataset mẫu.

## Kết nối Elasticsearch

### Local: 3 cách

1. **Curl từ terminal** — manual, OK cho script.
2. **Kibana Dev Tools** — UI, autocomplete, recommend.
3. **REST client** (Postman, Insomnia) — GUI.

→ Khoá học **chính dùng Kibana Dev Tools**. Mở Kibana → sidebar → **Dev Tools** (🔧).

### Remote (production)

Production thường truy cập qua:
- HTTPS với cert.
- Authentication (basic auth hoặc API key).
- IP allowlist.

```bash
curl -u username:password \
     -H "Content-Type: application/json" \
     https://es.production.com:9200/
```

→ Phase 7 dạy security setup.

### Curl shortcut

Mỗi lệnh curl gõ `-H "Content-Type: application/json"` mệt. Tạo alias trong `~/.bashrc`:

```bash
alias curl='curl -H "Content-Type: application/json"'
```

Reload: `source ~/.bashrc`.

Hoặc viết script `~/bin/curles`:

```bash
#!/bin/bash
/usr/bin/curl -H "Content-Type: application/json" "$@"
```

Make executable: `chmod +x ~/bin/curles`.

## Dataset MovieLens

Khoá học dùng **MovieLens** — dataset phim, rating, tag từ GroupLens (đại học Minnesota). Lý do:

- **Free, multiple sizes** — từ 100K rating đến 25M rating.
- **Đa dạng field type** — text (title), date (release year), array (genres), int (rating), timestamp.
- **Realistic** — không phải data fake, dùng cho real research.

### Tải MovieLens

```bash
# Trên server / Codespace
cd ~
wget https://files.grouplens.org/datasets/movielens/ml-latest-small.zip
unzip ml-latest-small.zip
cd ml-latest-small
ls
```

Files:

```text
ml-latest-small/
├── movies.csv      ← movieId, title, genres
├── ratings.csv     ← userId, movieId, rating, timestamp
├── tags.csv        ← userId, movieId, tag, timestamp
├── links.csv       ← movieId → IMDb/TMDb ID
└── README.html
```

> `ml-latest-small` = 100K ratings, 9,000 movies, 600 users. Đủ học. Production-scale: `ml-25m`.

### Sample movies.csv

```csv
movieId,title,genres
1,Toy Story (1995),Adventure|Animation|Children|Comedy|Fantasy
2,Jumanji (1995),Adventure|Children|Fantasy
3,Grumpier Old Men (1995),Comedy|Romance
```

→ Mỗi movie có ID, title (có year trong ngoặc), genres pipe-separated.

### Sample ratings.csv

```csv
userId,movieId,rating,timestamp
1,1,4.0,964982703
1,3,4.0,964981247
1,6,4.0,964982224
```

→ User 1 rate movie 1 = 4.0, timestamp Unix epoch.

## Test với Shakespeare (warmup)

Trước khi vào MovieLens, hãy test cluster bằng Shakespeare data (Phase 1 bài 2 đã setup hoặc tự download):

```bash
# Mapping
curl -X PUT "http://localhost:9200/shakespeare" -H 'Content-Type: application/json' -d'
{
    "mappings": {
        "properties": {
            "speaker":      { "type": "keyword" },
            "play_name":    { "type": "keyword" },
            "line_id":      { "type": "integer" },
            "speech_number": { "type": "integer" },
            "text_entry":   { "type": "text" }
        }
    }
}
'

# Bulk import (file ~25 MB)
wget https://media.sundog.tech/shakespeare_8.0.json
curl -X POST "http://localhost:9200/shakespeare/_bulk" \
     -H 'Content-Type: application/x-ndjson' \
     --data-binary @shakespeare_8.0.json
```

→ ~110K dòng Shakespeare nhập vào ES trong vài giây.

Query thử:

```text
GET /shakespeare/_search
{
    "query": {
        "match_phrase": { "text_entry": "to be or not to be" }
    }
}
```

Response: hit từ Hamlet, scene 3.1. ✓ Cluster work.

## Index `movies` cho khoá

Tạo index movies (chưa mapping — sẽ học bài 2):

```text
PUT /movies
```

→ ES tạo index empty với default settings (1 shard, 1 replica, dynamic mapping).

Verify:

```text
GET /_cat/indices?v
```

Thấy `movies` trong list. health = `yellow` (vì local 1 node, replica unassigned — bình thường).

## Lưu ý security mock

Cấu hình Phase 1 tắt `xpack.security.enabled`. **Chỉ cho local!**

Production:
- Bật security, tạo user.
- Mọi request kèm `--user elastic:password`.
- HTTPS với cert.

→ Phase 7 dạy.

## Pattern API URL

Tổng quan endpoint phổ biến cho data operations:

```text
GET    /<index>/_doc/<id>           — Get document
POST   /<index>/_doc                — Create with auto-ID
PUT    /<index>/_doc/<id>           — Create/replace with explicit ID
POST   /<index>/_update/<id>        — Partial update
DELETE /<index>/_doc/<id>           — Delete document

POST   /<index>/_search             — Search
POST   /<index>/_count              — Count matching

POST   /<index>/_bulk               — Bulk operations
GET    /<index>/_mapping            — Get schema
PUT    /<index>                     — Create index
DELETE /<index>                     — Delete index
GET    /_cat/indices?v              — List indices
GET    /_cluster/health             — Cluster status
```

→ Học thuộc 10 endpoint trên = đủ làm 80% công việc.

## Tóm tắt

- **Kibana Dev Tools** là tool chính tương tác Elasticsearch (autocomplete + syntax highlight).
- Curl alias / script giảm gõ.
- Dataset **MovieLens** (GroupLens) free, đa dạng field type, real data.
- `ml-latest-small`: 100K ratings, 9K movies, đủ học.
- Shakespeare data warmup nhanh.
- Index `movies` tạo empty trước khi insert (bài tiếp).
- 10 endpoint cốt lõi = đủ cho 80% công việc CRUD + search.

---

→ [Bài tiếp theo: Analyzers cơ bản](02-analyzers-co-ban.md)
