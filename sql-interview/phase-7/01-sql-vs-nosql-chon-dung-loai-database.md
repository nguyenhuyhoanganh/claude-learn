# Bài 1: SQL vs NoSQL — chọn đúng loại database

Đêm ra mắt sản phẩm. Một triệu người dùng đổ vào và hệ thống sập hoàn toàn. Startup đó mất trắng hai năm công sức chỉ sau một đêm.

Nguyên nhân không phải code dở, không phải server yếu. Họ đã **chọn sai loại database ngay từ ngày đầu tiên** — và tới ngày thứ 700 thì không đổi được nữa.

Đây là câu hỏi phỏng vấn kinh điển, và cái bẫy của nó là: hầu hết ứng viên trả lời như đang đọc bài so sánh trên blog. Người phỏng vấn thì đang chờ một thứ khác — **bạn có biết cái giá của việc chọn sai, và có biết Postgres hôm nay đã làm được bao nhiêu phần việc của NoSQL chưa?**

## Trước hết: "NoSQL" không phải một loại database

Đây là hiểu lầm phổ biến nhất. NoSQL không phải một thứ — nó là **bốn họ hoàn toàn khác nhau**, gộp chung dưới một cái tên marketing.

| Họ | Đại diện | Mô hình dữ liệu | Bài toán nó sinh ra để giải |
|---|---|---|---|
| **Document** | MongoDB, CouchDB | JSON lồng nhau | Schema thay đổi liên tục, đọc cả cụm cùng lúc |
| **Key-Value** | Redis, DynamoDB, Memcached | khoá → giá trị | Tra cứu theo khoá cực nhanh, cache, session |
| **Wide-Column** | Cassandra, HBase, ScyllaDB | hàng có số cột động, phân vùng theo khoá | Ghi cực lớn, phân tán nhiều trung tâm dữ liệu |
| **Graph** | Neo4j, ArangoDB | nút + cạnh | Duyệt quan hệ nhiều tầng (mạng xã hội, gian lận) |

Nói *"dùng NoSQL"* cũng vô nghĩa như nói *"dùng phương tiện giao thông"*. Redis và Neo4j không có gì chung ngoài việc **cả hai đều không phải bảng quan hệ**.

Và ngược lại, "SQL" cũng có nhiều kiểu: PostgreSQL/MySQL (OLTP hàng), ClickHouse/DuckDB (OLAP cột), CockroachDB/Yugabyte (phân tán, vẫn SQL và vẫn ACID).

## Khác biệt cốt lõi: nơi bạn đặt độ phức tạp

```text
DATABASE QUAN HỆ — CHUẨN HOÁ (normalize)
   Mỗi sự thật lưu đúng MỘT chỗ.
   khách_hàng ─┬─ đơn_hàng ─── dòng_đơn_hàng ─── sản_phẩm
               └─ địa_chỉ

   ✓ Sửa tên khách → sửa 1 chỗ, mọi nơi đúng theo
   ✓ Không bao giờ có dữ liệu mâu thuẫn
   ✗ Đọc một màn hình = ghép 5 bảng
   → ĐỘ PHỨC TẠP NẰM Ở LÚC ĐỌC


DATABASE DOCUMENT — PHI CHUẨN HOÁ (denormalize)
   Gom sẵn thứ hay đọc cùng nhau vào một tài liệu.
   { _id, khach: {ten, dia_chi}, san_pham: [{ten, gia, sl}], tong }

   ✓ Đọc một màn hình = một lần tra khoá
   ✗ Sửa tên khách → phải tìm và sửa ở HÀNG NGHÌN tài liệu
   ✗ Sửa nửa chừng thì dữ liệu mâu thuẫn
   → ĐỘ PHỨC TẠP NẰM Ở LÚC GHI
```

Không có bên nào "đơn giản hơn". Độ phức tạp không biến mất — nó chỉ **chuyển chỗ**. Câu hỏi thật là: *trong hệ thống của bạn, chỗ nào chịu được độ phức tạp đó?*

## Bảng so sánh theo tiêu chí thật sự quan trọng

| Tiêu chí | Quan hệ (Postgres/MySQL) | Document (MongoDB) | Wide-Column (Cassandra) | Key-Value (Redis/DynamoDB) |
|---|---|---|---|---|
| Giao dịch ACID nhiều bản ghi | **Mạnh, mặc định** | Có từ 4.0 nhưng đắt | Rất hạn chế | Hầu như không |
| JOIN | Mạnh | Yếu (`$lookup` chậm) | Không có | Không có |
| Truy vấn tuỳ ý (ad-hoc) | **Mạnh** | Khá | Yếu — phải thiết kế theo query | Chỉ theo khoá |
| Schema linh hoạt | Trung bình (`ALTER`, `JSONB`) | **Mạnh** | Khá | Không có schema |
| Mở rộng ghi theo chiều ngang | Cần sharding thủ công | Có sẵn | **Rất mạnh** | Rất mạnh |
| Nhất quán | Mạnh | Điều chỉnh được | Điều chỉnh được | Thường eventual |
| Đội ngũ biết dùng | **Ai cũng biết** | Phổ biến | Hiếm | Phổ biến |
| Công cụ BI/báo cáo | **Mọi công cụ đều hỗ trợ** | Hạn chế | Rất hạn chế | Không |

Hàng cuối cùng là hàng người ta hay quên và trả giá đắt nhất: **nếu dữ liệu nằm ngoài SQL, đội phân tích của bạn không truy cập được**, và bạn sẽ phải xây một đường ống ETL để đổ nó về một kho SQL — tức là bạn quay lại SQL bằng cửa sau, với chi phí gấp đôi.

## Đào sâu: CAP không phải "chọn hai trong ba"

Định lý CAP hay bị trích dẫn sai. Phát biểu đúng:

```text
C — Consistency  : mọi lần đọc đều thấy lần ghi mới nhất
A — Availability : mọi request đều nhận được phản hồi
P — Partition tolerance : hệ thống vẫn chạy khi mạng giữa các máy đứt

Sự thật: TRONG HỆ PHÂN TÁN, P LÀ BẮT BUỘC — mạng chắc chắn sẽ đứt.
Nên lựa chọn thật sự chỉ có: KHI MẠNG ĐỨT, bạn chọn C hay A?

  CP (chọn C): từ chối phục vụ để không trả dữ liệu sai
               → ngân hàng, kho hàng, đặt chỗ
  AP (chọn A): vẫn trả lời, chấp nhận dữ liệu có thể cũ
               → mạng xã hội, feed, đếm lượt xem
```

Và mô hình đầy đủ hơn là **PACELC**: *nếu Partition thì chọn A hay C; Else (bình thường) thì chọn Latency hay Consistency*. Đây là phần thực tế hơn, vì mạng đứt rất hiếm còn đánh đổi độ trễ thì xảy ra **mỗi giây**.

**Eventual consistency** (nhất quán sau cùng) nghĩa là: nếu ngừng ghi, sau một lúc mọi bản sao sẽ giống nhau. "Một lúc" đó có thể là 5 mili giây hoặc 5 giây — và người dùng thì sống ở *ngay bây giờ* (xem bài 2).

## Cây quyết định

```text
Dữ liệu của bạn có cần đảm bảo "tổng vào = tổng ra" không?
(tiền, kho, chỗ ngồi, điểm số — thứ sai một ly là kiện được)
        │
        ├── CÓ ──────────────► DATABASE QUAN HỆ. Hết bàn.
        │                      ACID không phải tính năng phụ, nó là yêu cầu.
        │
        └── KHÔNG ─┬─ Bạn có biết TRƯỚC mọi câu hỏi sẽ hỏi dữ liệu này không?
                   │
                   ├── KHÔNG ──► QUAN HỆ. Truy vấn ad-hoc là điểm mạnh nhất của SQL.
                   │
                   └── CÓ ─────┬─ Lượng GHI có vượt quá sức một máy không?
                               │   (nghĩa là: >50.000 ghi/giây, bền vững)
                               │
                               ├── KHÔNG ──► QUAN HỆ. Một Postgres trên phần cứng
                               │             hiện đại chịu được nhiều hơn bạn nghĩ.
                               │
                               └── CÓ ─────► Chọn theo hình dạng truy cập:
                                             • tra theo khoá   → Key-Value
                                             • ghi log/chuỗi TG → Wide-Column
                                             • duyệt quan hệ    → Graph
                                             • cụm JSON lồng    → Document
```

**Điểm mấu chốt mà người phỏng vấn muốn nghe: mặc định là quan hệ.** Không phải vì nó tốt hơn, mà vì:

- Bạn gần như luôn **không biết trước** mọi câu hỏi sẽ hỏi dữ liệu này — và SQL là công cụ duy nhất mạnh cho câu hỏi bạn chưa nghĩ ra.
- Đổi từ quan hệ sang NoSQL sau này **dễ hơn nhiều** so với chiều ngược lại. Chuẩn hoá → phi chuẩn hoá là bài toán có lời giải; ngược lại thì phải tự tay dựng lại quan hệ từ dữ liệu đã mâu thuẫn.
- Đội ngũ nào cũng biết SQL. Cassandra thì không.

## Postgres hôm nay làm được bao nhiêu phần việc của NoSQL

Đây là phần khiến câu trả lời của bạn nổi bật, vì rất nhiều người vẫn so sánh Postgres của năm 2010.

### `JSONB` — document store bên trong bảng quan hệ

```sql
CREATE TABLE events (
    event_id   BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL,
    event_type TEXT        NOT NULL,
    payload    JSONB       NOT NULL,      -- schema tự do ở đây
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index cho mọi khoá trong JSON, không cần khai báo trước
CREATE INDEX events_payload_gin ON events USING gin (payload jsonb_path_ops);

-- Truy vấn theo khoá lồng — dùng được index
SELECT * FROM events WHERE payload @> '{"device": {"os": "iOS"}}';

-- Index riêng cho một khoá hay dùng (nhanh hơn GIN cho trường hợp cụ thể)
CREATE INDEX events_country_idx ON events ((payload->>'country'));

-- Trộn tự do dữ liệu quan hệ và JSON trong cùng một câu
SELECT u.full_name,
       e.payload->>'country'          AS quoc_gia,
       e.payload->'cart'->>'total'    AS gia_tri_gio,
       count(*)                       AS so_lan
FROM events e
JOIN users u USING (user_id)
WHERE e.created_at >= now() - INTERVAL '7 days'
GROUP BY 1, 2, 3;
```

`JSONB` lưu dạng nhị phân đã phân tích sẵn, có index GIN, có toán tử chứa `@>`, có `jsonb_path_query` theo chuẩn SQL/JSON. Với đa số hệ thống, **đây là toàn bộ lý do bạn từng nghĩ mình cần MongoDB.**

> Cân nhắc: `JSONB` mất tính ràng buộc và tốn chỗ hơn cột thật (mỗi dòng lưu lại tên khoá). Mẫu thiết kế tốt là **cột thật cho thứ ổn định và cần ràng buộc, `JSONB` cho phần đuôi biến động**.

### Các năng lực NoSQL khác đã có sẵn trong Postgres

| Nhu cầu | Từng cần | Postgres hôm nay |
|---|---|---|
| Document store | MongoDB | `JSONB` + GIN index |
| Hàng đợi công việc | RabbitMQ/SQS | `SELECT ... FOR UPDATE SKIP LOCKED` |
| Pub/Sub thời gian thực | Redis | `LISTEN` / `NOTIFY` |
| Tìm kiếm toàn văn | Elasticsearch | `tsvector` + GIN |
| Tìm gần đúng / gợi ý | Elasticsearch | `pg_trgm` |
| Dữ liệu địa lý | MongoDB geo | **PostGIS** (mạnh nhất thị trường) |
| Chuỗi thời gian | InfluxDB | **TimescaleDB** extension |
| Tìm kiếm vector / AI | Pinecone | **pgvector** extension |
| Cache | Redis | `UNLOGGED TABLE` (nhưng Redis vẫn nhanh hơn nhiều) |
| Phân tích cột | ClickHouse | `citus` columnar / ngoại vi |

Nguyên tắc rút ra: **đừng thêm một database mới cho tới khi Postgres thật sự không làm nổi.** Mỗi hệ thống lưu trữ thêm vào là thêm một thứ phải vận hành, sao lưu, giám sát, nâng cấp, và một chỗ nữa để dữ liệu lệch nhau.

## Khi nào NoSQL thật sự thắng

Để công bằng — có những bài toán mà quan hệ thua rõ ràng:

**① Ghi cực lớn, phân tán nhiều vùng địa lý → Cassandra/ScyllaDB.**
Hàng triệu ghi mỗi giây, nhiều trung tâm dữ liệu cùng nhận ghi, chấp nhận nhất quán sau cùng. Discord lưu hàng nghìn tỷ tin nhắn trên ScyllaDB. Postgres phải shard thủ công mới tới được đó.

**② Tra cứu theo khoá với độ trễ dưới mili giây → Redis/DynamoDB.**
Session, giỏ hàng, rate limit, bảng xếp hạng. Redis chạy trong RAM nên nhanh hơn Postgres một bậc về độ lớn — không phải vì Postgres kém, mà vì nó phải đảm bảo bền vững.

**③ Duyệt quan hệ sâu nhiều tầng → Neo4j.**
*"Tìm mọi người quen của người quen của người quen, chưa từng kết bạn với tôi."* Trong SQL đây là recursive CTE với chi phí bùng nổ; trong graph database nó là thao tác gốc.

**④ Schema thật sự không biết trước → MongoDB.**
Nhận webhook từ 200 đối tác khác nhau, mỗi đối tác một định dạng. Nhưng lưu ý: `JSONB` giải được đa số trường hợp này rồi.

**⑤ Phân tích cột trên hàng tỷ dòng → ClickHouse/DuckDB.**
Đây không phải NoSQL (vẫn dùng SQL), nhưng là ví dụ tốt về việc **chọn công cụ theo hình dạng truy cập**, không theo nhãn.

## Kiến trúc thực tế: hầu hết công ty lớn dùng cả hai

```text
      ┌──────────────── Ứng dụng ────────────────┐
      │                                           │
      ▼                    ▼                      ▼
┌───────────┐      ┌─────────────┐        ┌──────────────┐
│PostgreSQL │      │    Redis    │        │Elasticsearch │
│           │      │             │        │              │
│ Đơn hàng  │      │  Session    │        │ Tìm sản phẩm │
│ Thanh toán│      │  Giỏ hàng   │        │ Gợi ý tìm    │
│ Người dùng│      │  Rate limit │        │              │
│ Tồn kho   │      │  Cache      │        │              │
│           │      │             │        │              │
│ SỰ THẬT   │◄─────┤ tái dựng    │◄───────┤ đồng bộ từ   │
│ DUY NHẤT  │ được │ được        │  CDC   │ nguồn        │
└───────────┘      └─────────────┘        └──────────────┘
```

Nguyên tắc kiến trúc quan trọng nhất:

> **Chỉ có MỘT nguồn sự thật (source of truth). Mọi kho khác phải tái dựng lại được từ nó.**

Redis mất sạch dữ liệu lúc 3 giờ sáng thì người dùng phải đăng nhập lại — khó chịu, không chết. Nhưng nếu Redis đang giữ số dư tài khoản mà không có ở đâu khác, bạn vừa mất tiền của khách.

Cách đồng bộ giữa các kho là **CDC** (*Change Data Capture*, bắt thay đổi dữ liệu): đọc WAL của Postgres bằng Debezium, đẩy sang Kafka, các kho khác nghe và cập nhật. Cách này tốt hơn nhiều so với ghi kép ở tầng ứng dụng — ghi kép luôn có kịch bản ghi được chỗ này mà hỏng chỗ kia.

## Cái giá của việc chọn sai — và vì sao nó bất đối xứng

```text
Chọn QUAN HỆ mà đáng lẽ nên NoSQL:
   Triệu chứng: ghi chậm dần, phải shard, phải thêm cache
   Chi phí sửa: vài tháng kỹ thuật, nhưng ĐƯỜNG ĐI RÕ RÀNG
   Trong lúc đó: hệ thống vẫn ĐÚNG

Chọn NoSQL mà đáng lẽ nên QUAN HỆ:
   Triệu chứng: dữ liệu mâu thuẫn, không viết nổi báo cáo,
                phải tự cài lại transaction ở tầng ứng dụng
   Chi phí sửa: viết lại phần lớn hệ thống + LÀM SẠCH dữ liệu đã hỏng
   Trong lúc đó: hệ thống ĐANG SAI, và bạn không biết sai bao nhiêu
```

Sự bất đối xứng này là lý do "mặc định chọn quan hệ" không phải bảo thủ — nó là quản trị rủi ro. Bạn đang chọn cái sai **rẻ hơn**.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Nói "dùng NoSQL" như một loại | NoSQL là 4 họ khác hẳn nhau | Gọi tên cụ thể và bài toán nó giải |
| Chọn MongoDB vì "schema linh hoạt" | 6 tháng sau vẫn cần transaction và JOIN | Thử `JSONB` trước |
| Chọn NoSQL vì "scale tốt hơn" | Chưa từng đo, chưa chạm trần một máy | Đo trước; một Postgres đi rất xa |
| Trích CAP là "chọn 2 trong 3" | Hiểu sai — P là bắt buộc | "Khi mạng đứt thì chọn C hay A" |
| Để dữ liệu tiền ở kho eventual consistency | Số dư sai, không đối soát được | Tiền luôn ở kho ACID |
| Ghi kép từ ứng dụng vào 2 kho | Ghi được chỗ này hỏng chỗ kia | CDC từ một nguồn sự thật |
| Dùng cache làm nguồn sự thật | Mất cache = mất dữ liệu | Cache phải tái dựng được |
| Quên đội phân tích | Dữ liệu ngoài SQL thì BI không đọc được | Tính chi phí ETL vào quyết định |
| Thêm database mới cho mỗi nhu cầu | 6 hệ thống phải vận hành, sao lưu, giám sát | Ép Postgres tới giới hạn trước |

## Câu hỏi phỏng vấn hay gặp

**H: SQL và NoSQL khác nhau thế nào, khi nào dùng loại nào?**
NoSQL không phải một loại — nó là bốn họ (document, key-value, wide-column, graph) giải bốn bài toán khác nhau. Khác biệt cốt lõi với quan hệ là **nơi đặt độ phức tạp**: quan hệ chuẩn hoá nên phức tạp lúc đọc (phải JOIN), document phi chuẩn hoá nên phức tạp lúc ghi (phải cập nhật nhiều chỗ). Em mặc định chọn quan hệ, và chỉ đổi khi có lý do đo được — vì mình gần như luôn không biết trước mọi câu hỏi sẽ hỏi dữ liệu, và SQL là công cụ mạnh nhất cho câu hỏi chưa nghĩ ra.

**H: Vì sao mặc định là quan hệ?**
Vì cái sai bất đối xứng. Chọn quan hệ mà đáng lẽ nên NoSQL thì triệu chứng là chậm — đường sửa rõ ràng và trong lúc đó dữ liệu vẫn đúng. Chọn NoSQL mà đáng lẽ nên quan hệ thì triệu chứng là dữ liệu mâu thuẫn — phải viết lại hệ thống **và** làm sạch dữ liệu đã hỏng, mà không biết hỏng bao nhiêu.

**H: MongoDB có ACID không?**
Có transaction nhiều tài liệu từ 4.0 (replica set) và 4.2 (sharded cluster). Nhưng nó đắt hơn nhiều so với Postgres và có giới hạn thời gian mặc định 60 giây. Quan trọng hơn: mô hình document được thiết kế để **không cần** transaction — nếu bạn đang dùng transaction nhiều tài liệu thường xuyên, đó là dấu hiệu mô hình dữ liệu của bạn vốn là quan hệ.

**H: Khi nào dùng Redis?**
Cho dữ liệu **tái dựng được** và cần độ trễ dưới mili giây: session, cache, rate limit, bảng xếp hạng, hàng đợi nhẹ. Không dùng làm nguồn sự thật cho dữ liệu không tái dựng được. Nguyên tắc: nếu Redis mất sạch lúc 3 giờ sáng, hệ thống phải chỉ *chậm đi*, không được *sai đi*.

**H: Postgres thay được MongoDB không?**
Với đa số hệ thống thì có — `JSONB` cho schema tự do, index GIN cho truy vấn theo khoá lồng, và bạn giữ được JOIN, transaction, ràng buộc và mọi công cụ BI. Postgres còn có PostGIS cho địa lý, pgvector cho AI, TimescaleDB cho chuỗi thời gian, `SKIP LOCKED` cho hàng đợi. MongoDB vẫn thắng khi bạn cần sharding tự động sẵn có và schema thật sự không đoán trước được.

## Tóm tắt bài 1

- **NoSQL không phải một loại** — bốn họ (document, key-value, wide-column, graph) giải bốn bài toán khác nhau.
- Khác biệt cốt lõi là **nơi đặt độ phức tạp**: quan hệ phức tạp lúc **đọc**, document phức tạp lúc **ghi**. Nó không biến mất, chỉ chuyển chỗ.
- CAP không phải "chọn 2 trong 3" — P là bắt buộc, lựa chọn thật là **khi mạng đứt thì chọn C hay A**; và PACELC nói rõ hơn về đánh đổi độ trễ hằng ngày.
- **Mặc định là quan hệ**, vì cái sai bất đối xứng: chọn nhầm quan hệ thì hệ thống *chậm*, chọn nhầm NoSQL thì hệ thống *sai*.
- Postgres hôm nay đã có `JSONB`, `SKIP LOCKED`, `LISTEN/NOTIFY`, full-text, PostGIS, pgvector, TimescaleDB — **ép nó tới giới hạn trước khi thêm kho mới**.
- Kiến trúc thật dùng nhiều kho, nhưng chỉ có **một nguồn sự thật**; mọi kho khác phải tái dựng được từ nó, đồng bộ qua **CDC** chứ không ghi kép.

**Bài kế tiếp** → [Bài 2: Read replica và độ trễ sao chép](02-read-replica-va-do-tre-sao-chep.md)
