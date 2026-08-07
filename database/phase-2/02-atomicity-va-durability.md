# Bài 2: Atomicity và Durability — cỗ máy chống mất dữ liệu

Có một câu nói làm nhiều kỹ sư mất ngủ lần đầu nghe:

> **Hệ điều hành nói dối database, và database có thể vô tình nói dối bạn.**

Bạn gõ `COMMIT`. Database trả về "thành công". Bạn tin. Ứng dụng gửi email "đơn hàng đã được ghi nhận". Ba giây sau máy chủ mất điện. Bật lên — **đơn hàng không có ở đó**.

Không ai làm sai cả. Database đã gọi lệnh ghi, hệ điều hành đã trả lời "xong rồi", nhưng thực tế dữ liệu mới chỉ nằm trong RAM của hệ điều hành. Bài này mổ xẻ chính xác chuỗi nói dối đó, và hai chữ cái của ACID sinh ra để chặn nó: **A** — không để lại dữ liệu nửa vời, và **D** — đã hứa thì phải giữ.

## Phần I — Atomicity: tất cả hoặc không gì cả

### Định nghĩa và cái tên

**Atomicity** (tính nguyên tử): **mọi câu lệnh trong một transaction phải cùng thành công. Chỉ cần một câu thất bại, toàn bộ transaction bị hoàn tác.**

Tên gọi lấy từ *atom* — nguyên tử — thứ mà vào thời điểm khái niệm này ra đời (thập niên 1970) được coi là không thể chia nhỏ. Ẩn dụ vẫn giữ nguyên giá trị: transaction là **một cục**, không có nửa cục.

```text
   KHÔNG CÓ ATOMICITY                    CÓ ATOMICITY
   ═══════════════════                   ═════════════
   lệnh 1  ✔ có hiệu lực                 lệnh 1  ✔
   lệnh 2  ✔ có hiệu lực                 lệnh 2  ✔
   lệnh 3  ✘ LỖI                         lệnh 3  ✘ LỖI
   lệnh 4  — không chạy                       ↓
                                          TẤT CẢ bị hoàn tác
   → dữ liệu ở trạng thái NỬA VỜI        → dữ liệu như chưa có gì xảy ra
```

### Bốn kiểu "thất bại" mà atomicity phải xử lý

Không phải chỉ có mỗi trường hợp mất điện. Có bốn nguồn, và chúng đòi cơ chế xử lý khác nhau:

| # | Nguồn thất bại | Ví dụ cụ thể | Ai phát hiện |
|---|---|---|---|
| 1 | **Vi phạm ràng buộc** | `balance` bị âm trong khi có `CHECK (balance >= 0)` | Database, ngay lập tức |
| 2 | **Trùng khoá** | `INSERT` một `id` đã tồn tại, vi phạm `PRIMARY KEY` | Database, ngay lập tức |
| 3 | **Câu lệnh sai** | Gõ nhầm tên cột, sai cú pháp | Database, ngay lập tức |
| 4 | **Tiến trình chết** | Mất điện, `kill -9`, OOM killer, kernel panic | **Không ai** — phải phát hiện lúc khởi động lại |

Ba loại đầu dễ: database đang chạy, nó biết có lỗi, nó tự hoàn tác. Loại thứ tư mới là loại khó, vì **không có ai còn sống để hoàn tác cả**.

```text
   LOẠI 1-3 — LỖI "LỊCH SỰ"              LOẠI 4 — CHẾT ĐỘT NGỘT
   ══════════════════════════             ═══════════════════════
   BEGIN                                  BEGIN
     UPDATE ...  ✔                          UPDATE ...  ✔
     UPDATE ...  ✘ vi phạm CHECK             UPDATE ...  ✔
        ↓                                    UPDATE ...  ✔
   database còn sống                              ⚡ MẤT ĐIỆN
   → tự đánh dấu transaction hỏng
   → hoàn tác ngay                        (không có gì chạy nữa)
                                                   │
                                                   ▼
                                          BẬT MÁY LÊN LẠI
                                          → database phải TỰ NHẬN RA
                                            có transaction dang dở
                                          → tự dọn
```

Đó là lý do mọi database nghiêm túc đều có một giai đoạn gọi là **crash recovery** (phục hồi sau sự cố) chạy lúc khởi động. Nó không phải tính năng phụ — nó là chỗ atomicity thật sự được thực thi.

### Hai cách hoàn tác: undo log và MVCC

Hoàn tác một `UPDATE` nghĩa là phải **biết giá trị cũ**. Có hai trường phái, và chúng dẫn tới hai kiến trúc database rất khác nhau:

```text
   TRƯỜNG PHÁI 1 — SỬA TẠI CHỖ + UNDO LOG        (MySQL InnoDB, Oracle)
   ═══════════════════════════════════════════════════════════════════
   Bảng:              UNDO LOG:
   ┌────┬─────────┐   ┌──────────────────────────────┐
   │ 1  │  900000 │   │ XID 77: id=1 cũ là 1000000   │
   └────┴─────────┘   └──────────────────────────────┘
     ▲ giá trị MỚI      ▲ giá trị CŨ cất riêng ra đây
       ghi đè lên chỗ cũ

   Rollback = đọc undo log, ghi 1000000 trở lại vào bảng.
   Đọc dữ liệu cũ = phải mở undo log ra tra ngược.

   TRƯỜNG PHÁI 2 — KHÔNG SỬA TẠI CHỖ                    (PostgreSQL)
   ═══════════════════════════════════════════════════════════════════
   Bảng:
   ┌────┬─────────┬──────────┬──────────┐
   │ 1  │ 1000000 │ xmin=50  │ xmax=77  │  ← phiên bản CŨ, còn nguyên
   │ 1  │  900000 │ xmin=77  │ xmax=—   │  ← phiên bản MỚI, thêm vào
   └────┴─────────┴──────────┴──────────┘
       xmin = transaction nào TẠO dòng này
       xmax = transaction nào XOÁ/THAY dòng này

   Rollback = chỉ cần ghi "XID 77 đã huỷ".
              Phiên bản mới tự động vô hình với mọi người.
   Đọc dữ liệu cũ = phiên bản cũ vẫn nằm ngay trong bảng, đọc thẳng.
```

Hệ quả của hai lựa chọn này lan ra rất xa:

| | InnoDB (undo log) | PostgreSQL (nhiều phiên bản) |
|---|---|---|
| Rollback | Phải hoàn tác thật từng dòng | Chỉ ghi một dấu "đã huỷ" — gần như tức thì |
| Kích thước bảng | Ổn định | Phình ra vì chứa cả phiên bản chết |
| Dọn rác | Tiến trình *purge* dọn undo log | `VACUUM` dọn tuple chết trong bảng |
| Đọc dữ liệu cũ | Chậm hơn (phải dựng lại từ undo) | Nhanh (nằm sẵn trong bảng) |
| Transaction dài | Undo log phình to | Bảng phình to vì `VACUUM` không dọn được |

Đây là ví dụ rất đẹp cho nguyên tắc **không có lựa chọn miễn phí**. PostgreSQL rollback nhanh nhưng phải nuôi `VACUUM`. InnoDB bảng gọn nhưng rollback đắt và đọc dữ liệu cũ tốn công.

### Rollback tự động lúc khởi động — nhìn bằng mắt

Thử tái hiện tình huống mất điện một cách an toàn:

```bash
docker run --name atom-lab -e POSTGRES_PASSWORD=lab -p 5433:5432 -d postgres:16
docker exec -it atom-lab psql -U postgres
```

```sql
CREATE TABLE accounts (id INT PRIMARY KEY, balance BIGINT);
INSERT INTO accounts VALUES (1, 1000000), (2, 500000);

BEGIN;
UPDATE accounts SET balance = balance - 100000 WHERE id = 1;
-- CỐ TÌNH không commit. Để nguyên cửa sổ này.
```

Ở terminal khác, giết tiến trình đúng nghĩa "rút phích":

```bash
docker kill atom-lab          # SIGKILL, không cho dọn dẹp
docker start atom-lab
docker logs atom-lab --tail 20
```

```text
LOG:  database system was interrupted; last known up at 2026-08-07 09:14:22 GMT
LOG:  database system was not properly shut down; automatic recovery in progress
LOG:  redo starts at 0/1573C48
LOG:  invalid record length at 0/15764A0: wanted 24, got 0
LOG:  redo done at 0/1576468 system usage: CPU: ... elapsed: 0.01 s
LOG:  database system is ready to accept connections
```

Ba dòng đáng đọc kỹ:

- `was not properly shut down` — database **tự phát hiện** lần trước chết bất thường.
- `redo starts at ...` — nó bắt đầu đọc lại WAL từ checkpoint gần nhất.
- `redo done` — xong. Mất 0,01 giây.

Kiểm tra dữ liệu:

```sql
SELECT * FROM accounts;
```

```text
 id | balance
----+---------
  1 | 1000000     ← đã quay về giá trị cũ
  2 |  500000
```

Transaction dang dở đã bị hoàn tác, không cần ai can thiệp. Đó là atomicity trong đời thực.

## Phần II — Durability: đã hứa thì phải giữ

### Định nghĩa và phép thử rút phích

**Durability** (tính bền vững): **sau khi transaction đã `COMMIT`, thay đổi phải tồn tại vĩnh viễn trên bộ nhớ không bay hơi, bất kể chuyện gì xảy ra sau đó.**

Cách kiểm tra định nghĩa này chỉ có một, và nó rất thô bạo:

```text
   PHÉP THỬ RÚT PHÍCH

   1. Chạy COMMIT
   2. Database trả về "thành công"
   3. RÚT PHÍCH ĐIỆN NGAY GIÂY ĐÓ
   4. Cắm lại, bật lên, kiểm tra dữ liệu

   Còn dữ liệu  → durable ✔
   Mất dữ liệu  → hệ đó đã nói dối bạn ở bước 2 ✘
```

Chú ý cụm "**sau khi đã COMMIT**". Durability không hứa gì về dữ liệu chưa commit — chuyện đó là việc của atomicity.

### Vì sao durability khó: đường đi năm tầng của một byte

Nguồn gốc mọi rắc rối nằm ở đây. Từ lúc ứng dụng gọi lệnh ghi đến lúc byte nằm yên trên chip nhớ vật lý, nó đi qua **năm tầng đệm**, và mỗi tầng đều có thể nói "xong rồi" khi chưa xong:

```text
   ┌─────────────────────────────────────────────────────────────────┐
   │ 1. ỨNG DỤNG        conn.commit()                                │
   └───────────────────────────┬─────────────────────────────────────┘
                               ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ 2. BỘ NHỚ ĐỆM DATABASE   shared_buffers / buffer pool           │
   │    Dữ liệu sửa nằm ở RAM của tiến trình database.               │
   │    Mất điện ở đây → MẤT.                                        │
   └───────────────────────────┬─────────────────────────────────────┘
                               ▼  write()
   ┌─────────────────────────────────────────────────────────────────┐
   │ 3. PAGE CACHE CỦA HỆ ĐIỀU HÀNH                                  │
   │    ⚠ OS trả về "ghi thành công" NGAY TẠI ĐÂY.                   │
   │    Dữ liệu vẫn ở RAM. Mất điện ở đây → MẤT.                     │
   │    ĐÂY LÀ LỜI NÓI DỐI Ở ĐẦU BÀI.                                │
   └───────────────────────────┬─────────────────────────────────────┘
                               ▼  fsync()
   ┌─────────────────────────────────────────────────────────────────┐
   │ 4. BỘ ĐỆM CỦA THIẾT BỊ (DRAM cache trên SSD / RAID controller)  │
   │    Ổ đĩa cũng có RAM riêng và cũng thích trả lời sớm.           │
   │    Mất điện ở đây → MẤT, TRỪ KHI ổ có tụ chống mất điện         │
   │    hoặc RAID có pin dự phòng (BBU).                             │
   └───────────────────────────┬─────────────────────────────────────┘
                               ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ 5. CHIP NHỚ VẬT LÝ (NAND / đĩa từ)                              │
   │    Đến đây mới thật sự durable.                                 │
   └─────────────────────────────────────────────────────────────────┘
```

Đọc hình trên thành lời: *"Mỗi tầng đều muốn trả lời 'xong' thật nhanh để tầng trên khỏi phải chờ. Durability là công cuộc ép từng tầng nói thật."*

### `fsync` — lệnh ép hệ điều hành nói thật

`fsync(fd)` là lời gọi hệ thống nói với hệ điều hành: *"đừng giữ trong cache nữa, đẩy xuống thiết bị ngay, và đừng trả lời tôi cho tới khi thiết bị xác nhận."*

Đây chính xác là chỗ chữ **D** được thực thi. Và nó **đắt**:

| Nơi lưu | Độ trễ một lần `fsync` | So sánh |
|---|---|---|
| RAM (không fsync) | ~0,1 µs | 1× |
| NVMe SSD hiện đại | ~20-100 µs | ~200-1.000× |
| SATA SSD | ~0,5-2 ms | ~5.000-20.000× |
| HDD 7200 rpm | ~8-15 ms | ~100.000× |
| RAID có pin dự phòng | ~10-50 µs | ~100-500× |

Con số này quyết định trần TPS (transaction mỗi giây) của hệ thống. Trên HDD với `fsync` 10 ms, một luồng ghi tuần tự **không thể** vượt quá **100 transaction/giây** — bất kể CPU mạnh cỡ nào. Đây là giới hạn vật lý, không phải giới hạn phần mềm.

### WAL — mẹo để vẫn nhanh mà vẫn bền

Nếu mỗi lần commit phải `fsync` toàn bộ dữ liệu đã sửa thì database sẽ chậm không dùng được. WAL là lời giải, và ý tưởng của nó cực kỳ đơn giản:

> Thay vì `fsync` **dữ liệu thật** (nằm rải rác khắp đĩa — ghi ngẫu nhiên), hãy `fsync` một **bản ghi ý định** rất nhỏ vào một file **chỉ nối tiếp** (ghi tuần tự).

```text
   KHÔNG CÓ WAL — phải fsync dữ liệu thật
   ══════════════════════════════════════════════════════
   COMMIT
     ├─ fsync page 4.201 (bảng orders)          ghi ngẫu nhiên
     ├─ fsync page   887 (index trên user_id)   ghi ngẫu nhiên
     ├─ fsync page 9.113 (index trên ngày)      ghi ngẫu nhiên
     └─ fsync page    12 (bảng inventory)       ghi ngẫu nhiên
        → 4 lần nhảy đầu đọc, 4 lần fsync → CHẬM KHỦNG KHIẾP

   CÓ WAL — chỉ fsync nhật ký
   ══════════════════════════════════════════════════════
   COMMIT
     └─ ghi nối tiếp vào cuối file WAL rồi fsync MỘT lần:
          [LSN 0/15A3B] orders  page 4201: dòng 17, status 'new'→'paid'
          [LSN 0/15A5C] index   page  887: thêm khoá (42 → tid 4201/17)
          [LSN 0/15A6D] COMMIT XID 12345
        → 1 lần ghi tuần tự, 1 lần fsync → NHANH

   Còn các page dữ liệu thật? Cứ nằm bẩn trong RAM.
   CHECKPOINT sau này sẽ gom lại đổ xuống một thể.
```

Hai tính chất làm cho mẹo này hoạt động được:

1. **Ghi tuần tự nhanh hơn ghi ngẫu nhiên rất nhiều** — trên HDD chênh cả trăm lần, trên SSD vẫn chênh vài lần.
2. **Bản ghi WAL nhỏ hơn page rất nhiều** — ghi "đổi ô này từ X sang Y" tốn vài chục byte, còn ghi cả page tốn 8 KB.

Quy tắc bất di bất dịch của WAL, và cũng là chỗ ra cái tên "write-**ahead**":

> **Bản ghi WAL mô tả một thay đổi phải nằm yên trên đĩa TRƯỚC khi page chứa thay đổi đó được phép xuống đĩa.**

Nhờ quy tắc này, khi khởi động lại sau sự cố, database luôn có đủ thông tin để dựng lại: đọc WAL từ checkpoint gần nhất, **redo** (làm lại) mọi thay đổi của transaction đã commit, **undo** (hoàn tác) mọi transaction chưa commit. Đó chính là các dòng log `redo starts at ... / redo done` bạn thấy ở thí nghiệm phần I.

### Checkpoint — vì sao cần và vì sao gây giật

Nếu WAL cứ dài mãi thì phục hồi sau sự cố sẽ mất hàng giờ. **Checkpoint** là điểm database dồn hết page bẩn xuống đĩa rồi ghi một dấu: *"tới đây mọi thứ đã an toàn, khỏi cần đọc WAL trước điểm này."*

```text
   Dòng thời gian WAL:

   ├────────────────┼──────────────────────────────────┼──────▶
   WAL cũ           CHECKPOINT                      MẤT ĐIỆN
   (xoá được)       "mọi page bẩn đã xuống đĩa"     ở đây
                    │◀──── chỉ cần đọc lại đoạn này ────▶│
```

Đánh đổi rất trực tiếp:

| Checkpoint dày (thường xuyên) | Checkpoint thưa |
|---|---|
| Phục hồi sau sự cố nhanh | Phục hồi chậm (WAL dài) |
| I/O nền cao, dễ gây giật đều đặn | I/O dồn cục, giật mạnh nhưng ít lần |
| WAL chiếm ít đĩa | WAL chiếm nhiều đĩa |

Đây là nguồn gốc của hiện tượng "cứ vài phút hệ thống lại khựng một nhịp" mà nhiều đội gặp: đó là checkpoint đang đổ hàng nghìn page bẩn xuống đĩa cùng lúc. Cách chữa trong PostgreSQL là **kéo dài thời gian trải I/O** ra:

```sql
SHOW checkpoint_timeout;             -- mặc định 5min
SHOW checkpoint_completion_target;   -- mặc định 0.9 (từ PG14)
```

`checkpoint_completion_target = 0.9` nghĩa là "hãy rải việc ghi ra trong 90% khoảng thời gian giữa hai checkpoint" thay vì dồn một cục.

### Vấn đề trang rách (torn page)

Một chi tiết tinh vi mà ít tài liệu nhập môn nhắc: page của PostgreSQL là 8 KB, nhưng đơn vị ghi nguyên tử của ổ đĩa thường chỉ là 512 byte hoặc 4 KB.

```text
   Đang ghi page 8 KB xuống đĩa:
   ┌────────┬────────┬────────┬────────┐
   │ 4KB mới│ 4KB cũ │        │        │   ⚡ mất điện giữa chừng
   └────────┴────────┴────────┴────────┘
     nửa mới, nửa cũ → PAGE RÁCH, không đọc nổi

   WAL cũng bó tay: bản ghi WAL kiểu "đổi ô này từ X sang Y"
   chỉ áp dụng được lên một page LÀNH LẶN. Page rách thì không có gốc để áp.
```

Hai hệ giải quyết theo hai cách:

- **PostgreSQL** — `full_page_writes = on` (mặc định): lần đầu tiên một page bị sửa **sau mỗi checkpoint**, cả page 8 KB được chép nguyên vào WAL. Phục hồi thì dùng bản nguyên đó làm gốc. Đây là lý do WAL của Postgres phình mạnh ngay sau checkpoint.
- **MySQL InnoDB** — *doublewrite buffer*: mọi page được ghi hai lần, lần đầu vào một vùng liền mạch riêng, lần sau vào chỗ thật. Rách ở chỗ thật thì lấy lại từ vùng riêng.

Cả hai đều là **hoá đơn phải trả để có durability thật** trên phần cứng không đảm bảo ghi nguyên tử.

### Group commit — cách nhiều transaction chia nhau một `fsync`

Nếu 100 transaction cùng commit trong vòng 1 mili-giây, database không dại gì gọi `fsync` 100 lần. Nó gom lại:

```text
   KHÔNG GOM                          CÓ GOM (group commit)
   ══════════                         ═════════════════════
   T1 → fsync (1ms)                   T1 ┐
   T2 → fsync (1ms)                   T2 ├─ cùng chờ ─→ fsync (1ms)
   T3 → fsync (1ms)                   T3 ┘
   ...                                ...
   T100 → fsync (1ms)                 T100 ┘
   ────────────────────               ─────────────────────
   Tổng: 100 ms                       Tổng: ~1 ms
   Thông lượng: 1.000 TPS             Thông lượng: ~100.000 TPS
```

Đây là lý do một database có thể vượt xa giới hạn "1 / độ trễ fsync" khi có **nhiều kết nối đồng thời**. Với một kết nối duy nhất thì trần vẫn là 1/fsync — một thực tế hay bị hiểu nhầm khi đo hiệu năng bằng một luồng rồi kết luận "database này chậm".

### Durability có nút vặn — và ai cũng nên biết nút đó ở đâu

Đây là phần thực dụng nhất của bài. Cả ba hệ phổ biến đều cho phép **đánh đổi độ bền lấy tốc độ**, và đều bật mức an toàn nhất theo mặc định:

**PostgreSQL — `synchronous_commit`**

| Giá trị | Nghĩa | Mất tối đa | Tốc độ |
|---|---|---|---|
| `on` (mặc định) | Chờ WAL `fsync` xong mới trả về | Không mất gì | Chuẩn |
| `off` | Trả về ngay, WAL được đẩy xuống sau | Vài trăm ms giao dịch cuối | Nhanh hơn nhiều |
| `local` | Chỉ chờ máy này, không chờ replica | Mất nếu máy này chết hẳn | Nhanh hơn `remote_*` |
| `remote_write` | Chờ replica **nhận** được | Mất nếu cả hai cùng chết | Vừa |
| `remote_apply` | Chờ replica **áp dụng** xong | Bền nhất | Chậm nhất |

Điểm cực kỳ quan trọng và hay bị hiểu sai: `synchronous_commit = off` **không** làm hỏng dữ liệu. Nó chỉ có thể làm **mất các giao dịch cuối cùng**. Database vẫn nhất quán, chỉ là mấy giây cuối biến mất — hoàn toàn khác với việc dữ liệu bị hỏng.

Hay hơn nữa: nút này vặn được **theo từng transaction**.

```sql
BEGIN;
SET LOCAL synchronous_commit = off;      -- chỉ áp dụng cho transaction này
INSERT INTO event_logs (payload) VALUES ('...');
COMMIT;
```

Nghĩa là bạn có thể để chuyển tiền chạy ở mức bền tuyệt đối, còn ghi log sự kiện chạy ở mức nhanh — trong cùng một database.

**MySQL InnoDB — `innodb_flush_log_at_trx_commit`**

| Giá trị | Nghĩa | Mất tối đa |
|---|---|---|
| `1` (mặc định) | Ghi + `fsync` mỗi lần commit | Không mất gì |
| `2` | Ghi vào OS cache mỗi commit, `fsync` mỗi giây | ~1 giây, **chỉ khi máy chết** (MySQL chết không mất) |
| `0` | Ghi + `fsync` mỗi giây | ~1 giây, kể cả khi chỉ MySQL chết |

**Redis — `appendfsync`**

| Giá trị | Nghĩa | Mất tối đa |
|---|---|---|
| `always` | `fsync` mỗi lệnh ghi | Không mất gì, chậm nhất |
| `everysec` (mặc định) | `fsync` mỗi giây | ~1 giây |
| `no` | Để hệ điều hành tự quyết | Tuỳ hệ điều hành, có thể ~30 giây |

Redis là ví dụ điển hình của việc **đem durability ra đánh đổi công khai**. Nó không giấu — nó viết thẳng vào tài liệu rằng mặc định bạn có thể mất một giây dữ liệu. Với cache thì đó là lựa chọn đúng.

### Đo `fsync` trên máy của bạn

PostgreSQL có sẵn công cụ đo trực tiếp:

```bash
docker exec -it atom-lab pg_test_fsync
```

```text
5 seconds per test

Compare file sync methods using one 8kB write:
        open_datasync                     18325.331 ops/sec      55 usecs/op
        fdatasync                         17948.212 ops/sec      56 usecs/op
        fsync                             16104.775 ops/sec      62 usecs/op
        fsync_writethrough                            n/a
        open_sync                         16781.404 ops/sec      60 usecs/op
```

Đọc thành lời: *"Máy này `fsync` mất khoảng 60 micro-giây. Vậy một luồng ghi đơn lẻ có trần khoảng 16.000 transaction/giây. Muốn cao hơn thì phải có nhiều kết nối đồng thời để group commit phát huy tác dụng."*

> Lưu ý: nếu con số ra **cao bất thường** (ví dụ vài triệu ops/sec), rất có thể ổ đĩa của bạn đang nói dối `fsync` — thường gặp ở ổ tiêu dùng và ở một số lớp ảo hoá. Đó không phải tin vui.

## Atomicity và Durability nối vào nhau chỗ nào

Hai chữ này hay được dạy rời, nhưng chúng dùng **chung một cỗ máy**:

```text
                    ┌──────────────────────┐
                    │         WAL          │
                    └──────────┬───────────┘
              ┌────────────────┴─────────────────┐
              ▼                                  ▼
   ┌────────────────────┐            ┌────────────────────────┐
   │   ATOMICITY        │            │     DURABILITY         │
   │                    │            │                        │
   │ Đọc WAL lúc khởi   │            │ fsync WAL lúc COMMIT   │
   │ động lại:          │            │ → đã hứa là giữ được   │
   │  • UNDO transaction│            │                        │
   │    chưa commit     │            │ CHECKPOINT gom page bẩn│
   │  • REDO transaction│            │ xuống đĩa để WAL không │
   │    đã commit       │            │ dài vô hạn             │
   └────────────────────┘            └────────────────────────┘
```

Một câu để nhớ: **WAL vừa là bằng chứng để hoàn tác (A), vừa là bằng chứng để giữ lời hứa (D).**

## Bẫy thường gặp

| Bẫy | Vì sao nguy hiểm | Cách xử lý |
|---|---|---|
| Chạy database trên ổ đĩa nói dối `fsync` | Mọi cam kết durability đều vô nghĩa, và bạn không hề biết | Chạy `pg_test_fsync`, nghi ngờ nếu số quá đẹp; dùng ổ có tụ chống mất điện |
| Tưởng replica là bản sao lưu | Lệnh `DELETE` nhầm được nhân bản sang replica trong ~200 ms | Sao lưu thật, có thể phục hồi theo thời điểm; xem [phase-9](../phase-9/01-database-replication-la-gi.md) |
| Đặt `synchronous_commit = off` cho dữ liệu tiền bạc | Mất vài trăm ms giao dịch cuối = mất tiền thật | Vặn theo từng transaction bằng `SET LOCAL`, không vặn toàn cục |
| Tắt `full_page_writes` để tăng tốc | Mất điện đúng lúc ghi page → page rách → hỏng dữ liệu, không sửa được | Chỉ tắt nếu tầng lưu trữ **bảo đảm** ghi nguyên tử; mặc định là để bật |
| Đo hiệu năng ghi bằng một luồng rồi kết luận | Một luồng bị chặn bởi độ trễ `fsync`, không phản ánh trần thật của hệ | Đo với 16-64 kết nối đồng thời để group commit hoạt động |
| Tưởng "committed" nghĩa là đã có trong file bảng | Chưa. Nó chỉ chắc chắn nằm trong WAL. Page thật xuống đĩa lúc checkpoint | Nhớ: WAL là nguồn sự thật, file bảng là bản dựng lại |
| Transaction dài trong PostgreSQL | Chặn `VACUUM` dọn tuple chết → bảng phình vô hạn | Giới hạn thời gian bằng `idle_in_transaction_session_timeout` |

## Tóm tắt bài 2

- **Atomicity** đối phó với **bốn** kiểu thất bại, trong đó loại khó nhất là tiến trình chết đột ngột — vì không còn ai sống để hoàn tác. Đó là lý do tồn tại giai đoạn *crash recovery* lúc khởi động.
- Có **hai trường phái hoàn tác**: sửa tại chỗ + undo log (InnoDB, Oracle) và giữ nhiều phiên bản (PostgreSQL). Lựa chọn này quyết định luôn việc hệ đó cần `VACUUM` hay cần *purge*.
- **Durability khó vì có năm tầng đệm**, mỗi tầng đều muốn trả lời "xong" sớm. `fsync` là lệnh ép các tầng nói thật, và nó tốn từ vài chục micro-giây đến vài chục mili-giây.
- **WAL** biến ghi ngẫu nhiên nhiều chỗ thành ghi tuần tự một chỗ — đó là toàn bộ lý do database vừa nhanh vừa bền được. Quy tắc: bản ghi WAL phải xuống đĩa **trước** page dữ liệu.
- **Checkpoint** giữ cho thời gian phục hồi có giới hạn, đổi lại gây giật I/O định kỳ. **Full page write** / *doublewrite* chống trang rách.
- **Group commit** cho nhiều transaction chia nhau một `fsync` — vì thế đo hiệu năng bằng một luồng luôn cho kết quả bi quan sai lệch.
- Cả ba hệ (PostgreSQL, MySQL, Redis) đều có **nút vặn durability**, và PostgreSQL còn vặn được theo từng transaction bằng `SET LOCAL synchronous_commit`.

**Bài kế tiếp** → [Bài 3: Isolation và bốn hiện tượng đọc bất thường](03-isolation-va-read-phenomena.md)
