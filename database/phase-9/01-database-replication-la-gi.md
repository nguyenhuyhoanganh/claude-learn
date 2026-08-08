# Bài 1: Database Replication — nhân bản dữ liệu và cái giá của độ trễ

Ba giờ sáng. Ổ đĩa của máy chủ database chết. Không có replica.

```text
   Dữ liệu gần nhất: bản sao lưu lúc 2 giờ sáng
   Mất: 1 tiếng giao dịch
   Thời gian phục hồi: 4 tiếng (khôi phục 800 GB từ sao lưu)
   Hệ thống offline: 4 tiếng
```

Cùng tình huống, có replica:

```text
   Phát hiện primary chết         : 10 giây
   Chuyển replica thành primary   : 30 giây
   Đổi cấu hình ứng dụng          : 20 giây
   Hệ thống offline               : ~1 phút
   Mất dữ liệu                    : 0 tới vài trăm mili-giây
```

Nhưng replication không miễn phí. Nó đem về một khái niệm mới mà bạn sẽ phải sống chung mãi: **độ trễ nhân bản**.

## Replication là gì

Giữ **bản sao đầy đủ** của dữ liệu trên nhiều máy chủ, và tự động đồng bộ chúng.

```text
                    ┌─────────────────┐
        GHI ───────▶│    PRIMARY      │  nhận mọi lệnh ghi
                    │  (nguồn sự thật)│
                    └────────┬────────┘
                             │ dòng thay đổi (WAL)
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌───────────┐  ┌───────────┐  ┌───────────┐
       │ REPLICA 1 │  │ REPLICA 2 │  │ REPLICA 3 │
       │ (chỉ đọc) │  │ (chỉ đọc) │  │ (chỉ đọc) │
       └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
             └──────────────┼──────────────┘
                            ▲
                          ĐỌC
```

### Khác sharding chỗ nào

Đây là nhầm lẫn phổ biến, và phân biệt rất gọn:

```text
   SHARDING                            REPLICATION
   ════════                            ═══════════
   Mỗi máy giữ MỘT PHẦN KHÁC NHAU      Mỗi máy giữ TOÀN BỘ, GIỐNG NHAU

   máy 1: user 1-1000                  máy 1: TẤT CẢ user
   máy 2: user 1001-2000               máy 2: TẤT CẢ user
   máy 3: user 2001-3000               máy 3: TẤT CẢ user

   Giải quyết: dữ liệu quá lớn         Giải quyết: đọc quá nhiều,
               ghi quá nhiều                        và máy có thể chết
```

Hai kỹ thuật **không loại trừ nhau** — hệ thống lớn thường có cả hai: mỗi shard lại có replica riêng.

## Năm lý do để nhân bản

| Lý do | Giải thích |
|---|---|
| **Chia tải đọc** | Tỉ lệ đọc/ghi thường 10:1 tới 100:1. Ba replica cho khả năng đọc gấp bốn |
| **Sẵn sàng cao** | Primary chết thì chuyển sang replica trong vài chục giây, không phải vài giờ |
| **Cách ly phân tích** | Chạy báo cáo nặng trên replica, không làm bẩn cache của primary |
| **Gần người dùng** | Replica đặt ở Singapore phục vụ người dùng châu Á với độ trễ thấp |
| **Nguồn sao lưu** | Chạy `pg_dump` trên replica, không ảnh hưởng hệ thống chính |

Lý do thứ ba đáng nhấn mạnh: một truy vấn phân tích quét toàn bảng sẽ **đẩy mọi page nóng ra khỏi buffer pool** ([phase-3 bài 2](../phase-3/02-row-based-vs-column-based.md)). Chạy nó trên replica là cách rẻ nhất để tránh chuyện đó.

> **Cảnh báo quan trọng:** replica **không phải** bản sao lưu. Lệnh `DELETE FROM orders` nhầm sẽ được nhân bản sang mọi replica trong khoảng **200 mili-giây**. Sao lưu và replication giải quyết hai vấn đề khác nhau.

### Lý do thứ tư đáng nói kỹ: giao thức database rất "nói nhiều"

Đặt replica gần người dùng không chỉ là chuyện độ trễ mạng cộng thêm một lần. Giao thức database **chattier hơn HTTP rất nhiều**:

```text
   MỘT LẦN GỌI API HTTP:  1 vòng mạng
   MỘT LẦN CHẠY TRUY VẤN: nhiều hơn thế

     mở kết nối   : bắt tay TCP (1) + TLS (2) + xác thực (2)  = 5 vòng
     chuẩn bị     : Parse → ParseComplete                     = 1 vòng
     chạy         : Bind/Execute/Sync → kết quả                = 1 vòng
     kết quả lớn  : chia thành NHIỀU gói TCP, MỖI gói phải được xác nhận
```

```text
   ỨNG DỤNG Ở SINGAPORE, DATABASE Ở VIRGINIA (RTT ~230 ms)

   Một trang gọi 10 truy vấn tuần tự:
     10 × 230 ms = 2,3 GIÂY  — chỉ riêng độ trễ mạng
     (chưa tính thời gian database thực sự xử lý)

   Cùng ứng dụng, database ở CÙNG VÙNG (RTT ~0,5 ms):
     10 × 0,5 ms = 5 mili-giay
                                 → NHANH HƠN 460 LẦN
```

Ba hệ quả thực dụng:

```text
   1. "Đặt ứng dụng gần người dùng, và đặt DATABASE GẦN HƠN NỮA."
      Ứng dụng ↔ database phải ở CÙNG VÙNG. Không có ngoại lệ.
      Người dùng ↔ ứng dụng thì CDN và edge lo được.

   2. Nếu bắt buộc phải gọi xuyên vùng → GOM TRUY VẤN
      10 truy vấn tuần tự → 1 truy vấn có JOIN, hoặc 1 stored procedure
      → từ 2,3 giây xuống 230 ms

   3. Kết quả LỚN càng tệ hơn
      1 MB kết quả chia thành ~700 gói TCP, mỗi gói phải được xác nhận
      → độ trễ KHÔNG chỉ là một RTT, mà là nhiều RTT chồng lên nhau
      → đây cũng là lý do câu SQL DÀI chậm, xem [phase-14 bài 1]
```

Đây là lý do replica theo vùng có giá trị lớn hơn con số "giảm độ trễ" nghe qua: nó không tiết kiệm **một** vòng mạng, nó tiết kiệm **mọi** vòng mạng của mọi truy vấn.

---

## Hai kiến trúc

### Primary / Replica (một chiều ghi)

```text
                ┌──────────┐
       GHI ────▶│ PRIMARY  │────┬───▶ REPLICA 1  ─┐
                └──────────┘    ├───▶ REPLICA 2  ─┼──▶ ĐỌC
                                └───▶ REPLICA 3  ─┘
```

| Ưu | Nhược |
|---|---|
| **Không bao giờ có xung đột ghi** | Khả năng **ghi không tăng** — vẫn một máy |
| Đơn giản, dễ hiểu, dễ vận hành | Primary là điểm chết đơn (cho tới khi chuyển đổi) |
| Là mặc định của PostgreSQL, MySQL | |

Đây là kiến trúc **99% hệ thống nên dùng**.

### Multi-master (nhiều nơi cùng ghi)

```text
       GHI ────▶┌──────────┐ ◀────▶ ┌──────────┐◀──── GHI
                │ MASTER 1 │        │ MASTER 2 │
                └──────────┘        └──────────┘
                        (đồng bộ hai chiều)
```

| Ưu | Nhược |
|---|---|
| Ghi được ở nhiều nơi | **Xung đột ghi** — và không có cách giải quyết nào tự động mà đúng |
| Chịu lỗi tốt hơn | Vận hành phức tạp hơn nhiều |
| Ghi độ trễ thấp theo vùng | |

Vấn đề xung đột nghiêm trọng hơn nhiều người nghĩ:

```text
   Cùng lúc, trên hai master:
     Master 1:  UPDATE users SET email='a@x.com' WHERE id=5
     Master 2:  UPDATE users SET email='b@y.com' WHERE id=5

   Khi đồng bộ, ai thắng?

   • "Ghi sau thắng" (last-write-wins) → MẤT một thay đổi, âm thầm
   • "Trộn" → chỉ áp dụng được cho vài kiểu dữ liệu đặc biệt (CRDT)
   • "Hỏi ứng dụng" → phải viết logic giải quyết cho MỌI bảng
```

Chưa kể: `id` tự tăng đụng nhau, `UNIQUE` không đảm bảo được, và khoá ngoại có thể gãy.

**Chỉ dùng multi-master khi** các nơi ghi **không giẫm lên nhau** — ví dụ khách hàng miền Bắc chỉ ghi vào máy chủ Bắc, khách miền Nam chỉ ghi vào máy chủ Nam. Khi đó xung đột gần như không xảy ra.

---

## Đồng bộ hay bất đồng bộ

Đây là nút vặn quan trọng nhất của replication.

```text
   BẤT ĐỒNG BỘ (asynchronous)         ĐỒNG BỘ (synchronous)
   ══════════════════════════          ═════════════════════
   Client → PRIMARY                    Client → PRIMARY
              │ ghi WAL                           │ ghi WAL
              │ fsync                             │ fsync
              ▼                                   ▼ gửi cho replica
   ◀───── "OK, đã commit"                        │ CHỜ replica xác nhận
              │                                   ▼
              ▼ gửi cho replica (sau)   ◀───── "OK, đã commit"
           REPLICA

   Độ trễ ghi : không đổi              Độ trễ ghi : + 1 vòng mạng
   Mất dữ liệu khi primary chết: CÓ    Mất dữ liệu: KHÔNG
   Replica chết → primary vẫn chạy     Replica chết → GHI BỊ CHẶN ⚠
```

Dòng cuối là cái bẫy lớn nhất của replication đồng bộ: **nếu replica duy nhất bị chết hoặc mạng đứt, primary sẽ ngừng nhận lệnh ghi** — nó đang chờ một xác nhận không bao giờ tới.

> **Quy tắc:** nếu dùng đồng bộ, luôn có **ít nhất hai** replica đồng bộ tiềm năng, và cấu hình `synchronous_standby_names = 'ANY 1 (r1, r2)'` — chỉ cần một trong hai xác nhận là đủ.

### PostgreSQL: năm mức, vặn theo từng transaction

```sql
SET synchronous_commit = 'on';   -- hoặc off, local, remote_write, remote_apply
```

| Mức | Chờ tới khi | Mất tối đa khi primary chết |
|---|---|---|
| `off` | Không chờ gì | Vài trăm ms giao dịch cuối |
| `local` | WAL xuống đĩa **máy này** | Toàn bộ nếu máy này chết hẳn |
| `remote_write` | Replica **nhận** được vào bộ nhớ | Mất nếu **cả hai** cùng chết |
| `on` (mặc định) | Replica **ghi WAL xuống đĩa** | Không mất |
| `remote_apply` | Replica **áp dụng xong**, đọc thấy được | Không mất, và đọc replica luôn thấy |

Điểm mạnh nhất: **vặn được theo từng transaction**.

```sql
-- Chuyển tiền: an toàn tuyệt đối
BEGIN;
SET LOCAL synchronous_commit = 'remote_apply';
UPDATE accounts SET balance = balance - 100000 WHERE id = 1;
UPDATE accounts SET balance = balance + 100000 WHERE id = 2;
COMMIT;

-- Ghi log sự kiện: nhanh là được
BEGIN;
SET LOCAL synchronous_commit = 'off';
INSERT INTO event_logs (payload) VALUES ('...');
COMMIT;
```

Một database, hai mức đảm bảo khác nhau cho hai loại dữ liệu khác nhau. Đây là công cụ rất mạnh mà ít người dùng.

### Bán đồng bộ trong MySQL

MySQL có thêm một mức trung gian gọi là *semi-synchronous*: primary chờ replica **nhận** được (chưa cần áp dụng), rồi mới báo commit.

```sql
SET GLOBAL rpl_semi_sync_source_enabled = 1;
SET GLOBAL rpl_semi_sync_source_timeout = 1000;   -- 1 giây
```

Tham số `timeout` rất quan trọng: nếu replica không trả lời trong 1 giây, MySQL **tự động rơi về chế độ bất đồng bộ** thay vì chặn ghi. Đó là hành vi an toàn hơn PostgreSQL đồng bộ, đổi lại là mất đảm bảo trong khoảnh khắc đó.

---

## Vật lý hay logic

Hai cách hoàn toàn khác nhau để truyền thay đổi.

```text
   NHÂN BẢN VẬT LÝ (physical / streaming)
   ══════════════════════════════════════
   Truyền chính các bản ghi WAL: "page 4201, byte 128, đổi từ X sang Y"
   → Replica là bản sao BIT-BY-BIT của primary

   NHÂN BẢN LOGIC (logical)
   ════════════════════════
   Giải mã WAL thành thao tác mức hàng: "INSERT vào bảng orders: (1, 'x', 42)"
   → Replica áp dụng thao tác đó, cấu trúc vật lý có thể khác
```

| | Vật lý | Logic |
|---|---|---|
| Nhân bản gì | **Toàn bộ** cụm database | Chọn từng bảng |
| Replica ghi được không | **Không** (chỉ đọc) | **Có** (bảng khác) |
| Khác phiên bản PostgreSQL | Không | **Được** — dùng để nâng cấp không dừng |
| Khác cấu trúc bảng | Không | Được (có giới hạn) |
| Chi phí | Thấp | Cao hơn (phải giải mã) |
| Có nhân bản DDL không | **Có** | **Không** — phải chạy tay ở cả hai bên |
| Dùng cho | Sẵn sàng cao, replica đọc | Nâng cấp phiên bản, đưa dữ liệu sang hệ khác, CDC |

Ứng dụng nổi bật nhất của nhân bản logic: **nâng cấp PostgreSQL 14 lên 17 không dừng dịch vụ**. Dựng máy 17, nhân bản logic từ máy 14 sang, chờ bắt kịp, rồi chuyển đổi trong vài giây.

Dòng "không nhân bản DDL" là cái bẫy phổ biến: bạn `ALTER TABLE ADD COLUMN` trên bên phát, bên nhận không có cột đó, và nhân bản **dừng lại với lỗi**.

---

## Độ trễ nhân bản

Đây là khái niệm bạn sẽ sống chung mãi sau khi có replica.

### Nó đến từ đâu

```text
   PRIMARY commit lúc t=0
     │
     ├─ ghi WAL xuống đĩa                    ~0,1 ms
     ├─ tiến trình gửi WAL đọc và gửi        ~0,5 ms
     ├─ TRUYỀN QUA MẠNG                      0,5 ms (LAN) → 200 ms (xuyên lục địa)
     ├─ replica nhận và ghi WAL              ~0,5 ms
     ├─ replica ÁP DỤNG WAL                  ~1 ms  ← thường là nút cổ chai
     └─ dữ liệu đọc được trên replica

   ĐỘ TRỄ ĐIỂN HÌNH: 5-50 ms trong cùng vùng
```

### Bốn nguyên nhân làm độ trễ tăng vọt

| Nguyên nhân | Vì sao |
|---|---|
| **Ghi hàng loạt trên primary** | Sinh WAL nhanh hơn replica áp dụng được |
| **Truy vấn dài trên replica** | Việc áp dụng WAL bị **tạm dừng** để không xoá dữ liệu mà truy vấn đang đọc |
| **Băng thông mạng** | Đặc biệt khi khôi phục sau khi replica offline một lúc |
| **Replica yếu hơn primary** | Áp dụng WAL là **một luồng** — replica phải theo kịp bằng một lõi |

Nguyên nhân thứ hai đặc biệt phản trực giác: **chạy báo cáo nặng trên replica làm chính replica đó tụt lại**. PostgreSQL cho hai lựa chọn:

```conf
# Cho phép tạm dừng áp dụng WAL tới 30 giây để truy vấn chạy xong
max_standby_streaming_delay = 30s

# Hoặc: cho primary biết replica đang đọc gì, để nó không dọn rác sớm
hot_standby_feedback = on
```

Đánh đổi:

```text
   max_standby_streaming_delay lớn  →  replica tụt lại nhiều
   max_standby_streaming_delay nhỏ  →  truy vấn bị HUỶ:
                                       "ERROR: canceling statement due to
                                        conflict with recovery"

   hot_standby_feedback = on        →  truy vấn không bị huỷ
                                    →  NHƯNG primary không VACUUM được
                                       → bảng phình trên PRIMARY
```

Không có lựa chọn nào miễn phí. Với replica dành riêng cho phân tích, `hot_standby_feedback = on` cộng theo dõi độ phình thường là lựa chọn đúng.

### Đo độ trễ

```sql
-- Chạy trên REPLICA: trễ bao nhiêu giây
SELECT CASE WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn()
            THEN 0
            ELSE EXTRACT(epoch FROM now() - pg_last_xact_replay_timestamp())
       END AS tre_giay;
```

```sql
-- Chạy trên PRIMARY: trễ bao nhiêu BYTE
SELECT client_addr,
       state,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn))   AS chua_gui,
       pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn))             AS chua_ap_dung,
       write_lag, flush_lag, replay_lag
FROM pg_stat_replication;
```

```text
 client_addr | state     | chua_gui | chua_ap_dung | replay_lag
-------------+-----------+----------+--------------+-------------
 10.0.1.22   | streaming | 0 bytes  | 128 kB       | 00:00:00.042
```

Ngưỡng cảnh báo gợi ý:

| Độ trễ | Mức |
|---|---|
| < 1 giây | Bình thường |
| 1-10 giây | Cảnh báo — xem có truy vấn dài trên replica không |
| > 10 giây | Nghiêm trọng — replica không dùng được cho đọc |
| Tăng đều không dừng | **Khẩn cấp** — replica không bao giờ bắt kịp, sẽ hết đĩa WAL |

---

## Bài toán đọc-được-cái-mình-vừa-ghi

Hệ quả trực tiếp của độ trễ, và là lỗi người dùng nhìn thấy rõ nhất:

```text
   t=0 ms    Người dùng bấm "Lưu"  → GHI vào PRIMARY  ✔ commit
   t=2 ms    Ứng dụng trả về "Đã lưu!"
   t=5 ms    Trang tải lại         → ĐỌC từ REPLICA
   t=6 ms    Replica trả về DỮ LIỆU CŨ  ⚠
   t=45 ms   Replica mới nhận được thay đổi

   Người dùng thấy: "Tôi bấm Lưu, nó bảo lưu rồi, mà nó không lưu."
   → Họ bấm Lưu lần nữa → có thể tạo bản ghi trùng
```

Bốn cách chữa, từ rẻ tới đắt:

| Cách | Làm gì | Ưu | Nhược |
|---|---|---|---|
| **Đọc từ primary sau khi ghi** | Trong N giây sau lệnh ghi, mọi lệnh đọc của **người đó** đi vào primary | Đơn giản, hiệu quả ngay | Primary gánh thêm; cần theo dõi "ai vừa ghi" |
| **Dính phiên** | Một người dùng luôn đọc từ cùng một replica | Dễ làm ở tầng cân bằng tải | Replica đó chết là mất; vẫn trễ so với primary |
| **Đọc theo LSN** | Ghi xong lưu vị trí WAL; khi đọc, bắt replica chờ tới vị trí đó | Chính xác nhất | Ứng dụng phải mang theo LSN |
| **`remote_apply`** | Chờ replica áp dụng xong rồi mới báo commit | Không bao giờ đọc phải dữ liệu cũ | Mỗi lệnh ghi cộng một vòng mạng |

Cách 1 giải quyết ~90% trường hợp với ~10% công sức:

```python
def lay_ket_noi_doc(user_id):
    vua_ghi_luc = cache.get(f"vua_ghi:{user_id}")
    if vua_ghi_luc and time.time() - vua_ghi_luc < 5:
        return pool_primary          # trong 5 giây sau khi ghi
    return pool_replica

def sau_khi_ghi(user_id):
    cache.set(f"vua_ghi:{user_id}", time.time(), ex=10)
```

Cách 3 với PostgreSQL:

```sql
-- Trên PRIMARY sau khi ghi
SELECT pg_current_wal_insert_lsn();     -- → 0/3A2B4C8

-- Trên REPLICA trước khi đọc
SELECT pg_wal_replay_wait('0/3A2B4C8');  -- PostgreSQL 18+
-- Bản cũ hơn: kiểm tra pg_last_wal_replay_lsn() >= LSN, không thì đọc primary
```

---

## Chuyển đổi khi primary chết

### Ba mức tự động hoá

| Mức | Cách làm | Thời gian ngừng | Rủi ro |
|---|---|---|---|
| **Thủ công** | Người trực nhận cảnh báo, chạy lệnh chuyển | 5-30 phút | Thấp — con người kiểm tra được |
| **Bán tự động** | Công cụ phát hiện, đề xuất, người bấm nút | 1-5 phút | Thấp |
| **Tự động** | Patroni, repmgr, PAF tự chuyển | 10-60 giây | **Não phân đôi** nếu cấu hình sai |

### Não phân đôi — rủi ro lớn nhất

```text
   MẠNG BỊ CHIA CẮT (primary vẫn sống, chỉ là không liên lạc được)

   ┌──────────┐           ✂ mạng đứt          ┌──────────┐
   │ PRIMARY  │  ← vẫn nhận ghi từ một số     │ REPLICA  │
   │          │     client ở phía nó          │          │
   └──────────┘                               └──────────┘
                                                    │
                                              "primary chết rồi!"
                                              → TỰ THĂNG CẤP
                                                    ▼
                                              ┌──────────┐
                                              │ PRIMARY  │ ← cũng nhận ghi
                                              │   MỚI    │
                                              └──────────┘

   HAI PRIMARY CÙNG NHẬN GHI.
   Khi mạng nối lại: hai nhánh dữ liệu KHÔNG THỂ TRỘN TỰ ĐỘNG.
```

Ba cơ chế phòng thủ:

| Cơ chế | Cách hoạt động |
|---|---|
| **Quorum** | Chỉ thăng cấp khi **đa số** nút đồng ý. Cụm 3 nút cần 2 phiếu |
| **Fencing / STONITH** | Chủ động **tắt** máy cũ (qua API đám mây hoặc IPMI) trước khi thăng cấp |
| **Địa chỉ IP nổi** | Ứng dụng nối tới một IP ảo; chỉ máy giữ IP đó mới nhận được lưu lượng |

Patroni — công cụ phổ biến nhất cho PostgreSQL — dùng cả ba, với etcd/Consul làm nơi bỏ phiếu.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Coi replica là bản sao lưu | `DELETE` nhầm được nhân bản trong 200 ms | Sao lưu riêng, có phục hồi theo thời điểm |
| Dùng đồng bộ với **một** replica | Replica chết → primary ngừng nhận ghi | `ANY 1 (r1, r2)` với hai replica |
| Cho **mọi** lệnh đọc vào replica | Người dùng không thấy cái mình vừa ghi | Đọc từ primary trong vài giây sau khi ghi |
| Chạy báo cáo nặng trên replica không chỉnh gì | Replica tụt lại, hoặc truy vấn bị huỷ | `hot_standby_feedback` + theo dõi độ phình |
| Bật `hot_standby_feedback` mà không theo dõi | Primary không `VACUUM` được, bảng phình | Theo dõi `n_dead_tup` trên primary |
| Multi-master khi các nơi ghi giẫm lên nhau | Xung đột ghi mất dữ liệu âm thầm | Chỉ multi-master khi phân vùng ghi rõ ràng |
| Tự động chuyển đổi không có fencing | Não phân đôi, hai nhánh dữ liệu | Patroni + quorum + fencing |
| Nhân bản logic rồi `ALTER TABLE` một bên | Nhân bản dừng với lỗi | Chạy DDL ở **cả hai** bên, bên nhận trước |
| Không theo dõi độ trễ | Đọc dữ liệu cũ hàng phút mà không biết | Cảnh báo ở 1s / 10s / tăng đều |

## Tóm tắt bài 1

- **Replication ≠ Sharding**: nhân bản là mọi máy giữ **toàn bộ, giống nhau**; sharding là mỗi máy giữ **một phần khác nhau**. Hai kỹ thuật kết hợp được.
- **Replica không phải bản sao lưu** — lệnh xoá nhầm được nhân bản trong ~200 ms.
- **Giao thức database rất "nói nhiều"**: một trang gọi 10 truy vấn tuần tự qua vùng khác (RTT 230 ms) mất **2,3 giây chỉ riêng độ trễ mạng**, so với 5 ms nếu cùng vùng — **nhanh hơn 460 lần**. Quy tắc: *"đặt ứng dụng gần người dùng, và đặt database gần hơn nữa"* — ứng dụng và database phải **cùng vùng**, không có ngoại lệ.
- **Primary/Replica** phù hợp cho 99% hệ thống. **Multi-master** chỉ nên dùng khi các nơi ghi **không giẫm lên nhau**, vì không có cách giải quyết xung đột nào tự động mà đúng.
- **Đồng bộ** không mất dữ liệu nhưng **replica chết thì primary ngừng nhận ghi** — luôn cấu hình `ANY 1 (r1, r2)` với ít nhất hai replica.
- PostgreSQL có **năm mức** `synchronous_commit` và vặn được **theo từng transaction** — chuyển tiền dùng `remote_apply`, ghi log dùng `off`, trong cùng một database.
- **Vật lý** nhân bản cả cụm, replica chỉ đọc; **logic** chọn từng bảng, replica ghi được, và cho phép **nâng cấp phiên bản không dừng dịch vụ** — nhưng **không nhân bản DDL**.
- **Truy vấn dài trên replica làm chính replica tụt lại.** Chọn giữa `max_standby_streaming_delay` (truy vấn bị huỷ) và `hot_standby_feedback` (primary không `VACUUM` được).
- **Đọc-được-cái-mình-vừa-ghi** giải rẻ nhất bằng cách cho lệnh đọc vào primary trong vài giây sau khi ghi.
- Tự động chuyển đổi cần **quorum + fencing + IP nổi**, nếu không sẽ có **não phân đôi** — hai nhánh dữ liệu không thể trộn lại.

**Bài kế tiếp** → [Bài 2: Demo Replication với PostgreSQL](02-replication-demo-postgres.md)
