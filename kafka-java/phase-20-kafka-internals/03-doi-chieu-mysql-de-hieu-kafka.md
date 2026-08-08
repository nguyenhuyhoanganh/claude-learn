# Bài 3: Đối chiếu MySQL để hiểu Kafka — replica, binlog, sharding

Cách nhanh nhất để hiểu kiến trúc Kafka là soi nó qua một thứ bạn đã quen: **MySQL**. Cụm MySQL và cụm Kafka giải cùng một nhóm bài toán — nhân bản dữ liệu, chia tải đọc, chia tải ghi — và giải bằng những ý tưởng gần giống nhau.

Nhưng phép so sánh này là con dao hai lưỡi. Có ba chỗ mà tài liệu (kể cả transcript gốc của bài giảng này) nói gộp lại thành sai, và sai theo kiểu khiến bạn hiểu nhầm cả hai hệ thống. Bài này dựng lại phép so sánh cho chuẩn, rồi chỉ rõ ba chỗ đó.

## Mô hình 1 — Read Replica: chia tải cho hệ thống đọc nhiều

Bài toán: ứng dụng đọc gấp 50 lần ghi (mạng xã hội, trang tin, sàn thương mại điện tử). Một database gánh hết thì nghẽn ở khâu đọc.

```text
                     ┌──────────────────┐
    INSERT / UPDATE  │                  │
    ────────────────►│   MySQL PRIMARY  │   (còn gọi: master, source)
                     │   nhận mọi lệnh  │
                     │   ghi            │
                     └────────┬─────────┘
                              │ đẩy BINLOG sang các bản sao
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │ REPLICA 1    │ │ REPLICA 2    │ │ REPLICA 3    │
      │ chỉ SELECT   │ │ chỉ SELECT   │ │ chỉ SELECT   │
      └──────────────┘ └──────────────┘ └──────────────┘
              ▲               ▲               ▲
              └───────────────┴───────────────┘
                       SELECT được chia đều
```

Mô hình này gọi là **Read Replica** (bản sao chỉ đọc) hoặc **Read-Write Replica**. Ghi đi vào một chỗ, đọc trải ra nhiều chỗ.

### Về thuật ngữ master/slave

Từ MySQL 8.0.22, tài liệu chính thức đã chuyển sang **source / replica** thay cho **master / slave**. Cú pháp cũng đổi: `CHANGE MASTER TO` → `CHANGE REPLICATION SOURCE TO`, `SHOW SLAVE STATUS` → `SHOW REPLICA STATUS`. Kafka thì chưa bao giờ dùng cặp từ đó — Kafka luôn gọi là **leader / follower**. Khi viết tài liệu hay nói trong phỏng vấn, dùng cặp từ mới.

### Đính chính lớn nhất: binlog KHÔNG phải WAL

Đây là chỗ transcript gốc nói sai, và cũng là hiểu lầm phổ biến nhất khi nói về replication của MySQL. Nguyên văn chỗ sai: *"khi write vào DB, dữ liệu sẽ ghi vào log file (mọi DB đều dùng Write-Ahead Logging — WAL)... sau khi ghi log xong, các DB Read sẽ nhận file log đó để đồng bộ (trong MySQL gọi là Binlog)"*.

Sự thật: MySQL có **hai loại nhật ký hoàn toàn khác nhau**, và cái dùng để nhân bản **không phải** cái WAL.

```text
   MỘT lệnh UPDATE trong MySQL sinh ra HAI bản ghi nhật ký khác nhau
   ═══════════════════════════════════════════════════════════════════

   UPDATE accounts SET balance = 900 WHERE id = 42;
              │
              ├──────────────────────────┐
              ▼                          ▼
   ┌─────────────────────┐    ┌──────────────────────────┐
   │  REDO LOG           │    │  BINARY LOG (binlog)     │
   │  (ib_logfile*)      │    │  (mysql-bin.00000N)      │
   ├─────────────────────┤    ├──────────────────────────┤
   │ Tầng: InnoDB        │    │ Tầng: MySQL server       │
   │ (tầng lưu trữ)      │    │ (trên tầng lưu trữ)      │
   ├─────────────────────┤    ├──────────────────────────┤
   │ Nội dung: VẬT LÝ    │    │ Nội dung: LOGIC          │
   │ "trang số 137,      │    │ "dòng id=42: balance     │
   │  byte 44 đổi từ     │    │  đổi 1000 → 900"         │
   │  X sang Y"          │    │                          │
   ├─────────────────────┤    ├──────────────────────────┤
   │ Kiểu ghi: VÒNG      │    │ Kiểu ghi: GHI THÊM       │
   │ (ghi đè khi đầy)    │    │ (file mới khi đầy)       │
   ├─────────────────────┤    ├──────────────────────────┤
   │ Mục đích:           │    │ Mục đích:                │
   │  phục hồi sau crash │    │  NHÂN BẢN (replication)  │
   │                     │    │  khôi phục theo thời điểm│
   ├─────────────────────┤    ├──────────────────────────┤
   │ ĐÂY MỚI LÀ "WAL"    │    │ Replica đọc CÁI NÀY      │
   │ Replica KHÔNG đọc   │    │ NHƯNG nó KHÔNG phải WAL  │
   └─────────────────────┘    └──────────────────────────┘
```

Bốn điểm cần nắm chắc:

**Một — WAL của MySQL là redo log, không phải binlog.** WAL (Write-Ahead Logging — ghi nhật ký trước) là kỹ thuật: ghi ý định thay đổi vào nhật ký **trước** khi sửa file dữ liệu, để nếu mất điện giữa chừng thì khởi động lại còn biết đường làm lại. Ở MySQL/InnoDB, vai trò đó do **redo log** đảm nhiệm. Redo log là nội bộ của InnoDB, ghi theo kiểu vòng tròn, và **không bao giờ rời khỏi máy đó**.

**Hai — binlog tồn tại độc lập với engine lưu trữ.** Binlog nằm ở tầng server MySQL, phía trên tầng lưu trữ. Bạn đổi engine từ InnoDB sang MyISAM thì redo log biến mất (MyISAM không có), nhưng binlog vẫn còn. Đây là bằng chứng rõ nhất rằng hai thứ này khác nhau về bản chất.

**Ba — có thể tắt binlog mà database vẫn chạy.** Nếu không cần nhân bản, đặt `--skip-log-bin` là xong, MySQL vẫn an toàn trước sự cố mất điện nhờ redo log. Ngược lại, **không thể tắt redo log** khi đang dùng InnoDB.

**Bốn — PostgreSQL mới là hệ mà "replica đọc WAL" đúng theo nghĩa đen.** PostgreSQL chỉ có một nhật ký duy nhất là WAL, và nó dùng chính WAL đó cho cả phục hồi sau crash lẫn streaming replication. Câu "replica đọc WAL" đúng với PostgreSQL, **sai với MySQL**. Có lẽ đây là nguồn gốc của hiểu lầm.

Bảng đối chiếu ba hệ:

| Hệ | Nhật ký phục hồi sau crash (WAL thật) | Nhật ký dùng để nhân bản |
|---|---|---|
| **MySQL / InnoDB** | redo log (`ib_logfile*`) | **binlog** — khác hẳn |
| **PostgreSQL** | WAL (`pg_wal/`) | **cùng WAL đó** |
| **Kafka** | log segment của partition | **cùng log segment đó** |

Dòng cuối đáng chú ý: **Kafka giống PostgreSQL hơn giống MySQL** ở điểm này. Kafka chỉ có **một** cái log duy nhất cho mỗi partition, và nó vừa là kho dữ liệu, vừa là thứ follower kéo về để nhân bản. Không có nhật ký thứ hai nào cả. Đó là một trong những lý do khiến kiến trúc Kafka đơn giản một cách đáng ngạc nhiên.

### Đính chính nhỏ: MySQL Router không phải lúc nào cũng tự tách đọc/ghi

Transcript nói *"MySQL Router phân loại truy vấn: INSERT/UPDATE gửi đến con Write; SELECT gửi đến các con Read"*. Điều này chỉ đúng với phiên bản đủ mới.

| Cách hoạt động | Phiên bản | Ứng dụng phải làm gì |
|---|---|---|
| **Hai cổng riêng** — 6446 cho đọc-ghi, 6447 cho chỉ đọc | Cách kinh điển của InnoDB Cluster | **Ứng dụng tự chọn cổng** theo loại truy vấn. Router không đọc câu SQL |
| **Tách đọc/ghi trên một cổng** — Router tự phân tích câu lệnh | MySQL Router 8.2 trở lên | Ứng dụng chỉ nối một cổng, Router định tuyến |

Vì sao chi tiết này quan trọng: nó ảnh hưởng tới cách bạn viết ứng dụng. Với cách kinh điển, bạn phải cấu hình **hai DataSource** trong Spring và chú thích `@Transactional(readOnly = true)` để chọn đúng nguồn.

### Vấn đề mà mọi mô hình replica đều gặp: độ trễ nhân bản

Đây là phần transcript bỏ qua hoàn toàn, mà lại là thứ gây bug nhiều nhất trong thực tế:

```text
   t=0ms    Người dùng bấm "Cập nhật hồ sơ"
            → UPDATE đi vào PRIMARY, thành công
   t=2ms    Trang chuyển hướng sang "Xem hồ sơ"
            → SELECT đi vào REPLICA 2
   t=2ms    REPLICA 2 chưa nhận kịp binlog
            → trả về DỮ LIỆU CŨ

   Người dùng: "Tôi vừa lưu mà, sao không thấy đổi?"
```

Hiện tượng này gọi là **replication lag** (độ trễ nhân bản), và nó là hệ quả tất yếu của nhân bản **bất đồng bộ** (asynchronous). Ba cách xử lý:

| Cách | Cơ chế | Giá phải trả |
|---|---|---|
| **Read-your-own-writes** | Sau khi ghi, ép các truy vấn của chính người dùng đó đi vào primary trong N giây | Primary chịu thêm tải |
| **Semi-sync replication** | Primary chờ ít nhất một replica xác nhận đã nhận binlog rồi mới trả về | Mỗi lần ghi cộng thêm một vòng khứ hồi mạng |
| **Chấp nhận** | Hiển thị dữ liệu hơi cũ | Chỉ hợp với dữ liệu không nhạy cảm (số lượt xem, gợi ý) |

**Kafka gặp đúng bài toán này, và giải bằng cùng ý tưởng** — đó chính là `acks` và ISR:

| MySQL | Kafka tương ứng |
|---|---|
| Nhân bản bất đồng bộ (mặc định) | `acks=1` — leader ghi xong là trả về, chưa chờ follower |
| Semi-sync replication | `acks=all` + `min.insync.replicas=2` |
| Replication lag | Follower tụt sau leader, bị loại khỏi ISR nếu tụt quá `replica.lag.time.max.ms` |

Nhưng Kafka có một khác biệt quan trọng: **consumer không bao giờ đọc được dữ liệu chưa nhân bản đủ**. Cơ chế **high watermark** chặn việc đó ở mức giao thức. Nghĩa là Kafka **không có** bài toán "đọc ra dữ liệu cũ" kiểu read replica. Sẽ giải thích ở [Bài 5](05-leader-follower-isr-va-luong-ghi.md).

## Mô hình 2 — Sharding: chia tải cho hệ thống ghi nhiều

Read replica giải bài toán đọc nhiều. Nhưng nếu **ghi** mới là chỗ nghẽn thì sao? Thêm bao nhiêu replica cũng vô ích, vì mọi lệnh ghi vẫn dồn về một primary.

Lời giải là **sharding** (chia mảnh): chẻ dữ liệu ra nhiều database, mỗi database chỉ giữ một phần và nhận ghi cho phần đó.

```text
                       ┌──────────────────────┐
    Ghi user_id = 32   │  Tầng định tuyến     │
    ──────────────────►│  (routing layer)     │
                       └──────┬───────┬───────┘
                              │       │
              ┌───────────────┘       └──────────────┐
              ▼                                      ▼
    ┌────────────────────┐              ┌────────────────────┐
    │  SHARD 1           │              │  SHARD 2           │
    │  user_id 1..500K   │              │  user_id 500K..1M  │
    │  NHẬN GHI          │              │  NHẬN GHI          │
    └────────────────────┘              └────────────────────┘

    Hai shard nhận ghi ĐỘC LẬP → năng lực ghi gấp đôi
```

### Ba kiểu chia và bẫy của kiểu phổ biến nhất

Ví dụ trong transcript dùng **range sharding** (chia theo khoảng): id 1–500.000 vào shard 1, id 500.001–1.000.000 vào shard 2. Cách này dễ hiểu nhưng có một bẫy chí mạng mà transcript không nói.

| Kiểu chia | Cách làm | Ưu | Nhược |
|---|---|---|---|
| **Range** (theo khoảng) | id 1–500K → S1, 500K–1M → S2 | Truy vấn theo khoảng rất nhanh; dễ thêm shard mới ở cuối | **Điểm nóng ghi**: mọi user mới đều có id lớn nhất → dồn hết vào shard cuối |
| **Hash** (theo băm) | `hash(user_id) % số_shard` | Phân bố đều tuyệt vời, không có điểm nóng | Đổi số shard là phải chuyển gần hết dữ liệu |
| **Consistent hashing** (băm nhất quán) | Băm lên vòng tròn + node ảo | Thêm/bớt shard chỉ chuyển một phần nhỏ dữ liệu | Phức tạp hơn để cài đặt |

Bẫy của range sharding, vẽ ra cho rõ:

```text
   ID người dùng tăng dần theo thời gian
   ═════════════════════════════════════

   Shard 1 (1..500K)      Shard 2 (500K..1M)     Shard 3 (1M..1.5M)
   ┌────────────────┐     ┌────────────────┐     ┌────────────────┐
   │ Người dùng cũ  │     │ Người dùng cũ  │     │ NGƯỜI DÙNG MỚI │
   │ Ghi: rất ít    │     │ Ghi: ít        │     │ Ghi: TẤT CẢ    │
   │ CPU: 5%        │     │ CPU: 10%       │     │ CPU: 95% 🔥    │
   └────────────────┘     └────────────────┘     └────────────────┘

   Ba máy, nhưng chỉ MỘT máy làm việc.
   Chia mảnh xong mà vẫn nghẽn đúng chỗ cũ.
```

**Kafka chọn hash, không chọn range** — và đó là quyết định đúng. Kafka tính:

```text
   partition = murmur2(key_bytes) % số_partition
```

Kết quả: các key trải đều ra mọi partition, không có partition nóng, kể cả khi key là id tăng dần theo thời gian.

Nhưng cái giá của hash cũng lộ ra ngay: **đổi số partition thì ánh xạ key → partition đổi hết**. Đây chính là lý do tại sao Kafka cho tăng số partition nhưng **cảnh báo dữ dội**, và tại sao **không cho giảm**. Chi tiết ở [Phase 3 bài 7](../phase-3-kafka-fundamentals/07-rebalancing-scaling-partitions.md).

```text
   Topic 2 partition:  murmur2("user-42") % 2 = 0  → partition 0
   Tăng lên 3:         murmur2("user-42") % 3 = 2  → partition 2  ← ĐỔI CHỖ!

   Hệ quả: các sự kiện của "user-42" trước đây ở P0, từ giờ vào P2.
   Consumer đọc P2 có thể xử lý sự kiện mới TRƯỚC khi consumer đọc P0
   xử lý xong sự kiện cũ → THỨ TỰ THEO KEY BỊ PHÁ VỠ.
```

## Bản đồ ánh xạ: khái niệm MySQL ↔ khái niệm Kafka

Đây là bảng đáng in ra dán lên tường:

| Khái niệm MySQL | Khái niệm Kafka tương ứng | Khác biệt cần lưu ý |
|---|---|---|
| Database instance | **Broker** | Broker là **tiến trình**, không nhất thiết là một máy |
| Table | **Topic** | Topic không có schema bắt buộc, không có chỉ mục theo cột |
| Shard | **Partition** | Kafka chia bằng hash `murmur2`, tự động, không cần tầng định tuyến riêng |
| Primary / source | **Leader** của partition | Leader ở **cấp partition**, không phải cấp máy — một broker vừa là leader partition này vừa là follower partition kia |
| Replica (chỉ đọc) | **Follower** | Follower Kafka **không phục vụ đọc** (mặc định); nó chỉ là bản sao chờ sẵn |
| Binlog | **Chính bản thân log của partition** | Kafka không có nhật ký thứ hai. Log **là** dữ liệu |
| Replication lag | **Follower tụt sau leader** → bị loại khỏi ISR | Kafka đo bằng thời gian (`replica.lag.time.max.ms`), mặc định 30 giây |
| Semi-sync replication | `acks=all` + `min.insync.replicas` | |
| MySQL Router / ProxySQL | **Không có** — client tự định tuyến bằng metadata | Bớt hẳn một thành phần phải vận hành |
| Failover thủ công hoặc qua Orchestrator | **Controller tự bầu leader mới** | Tự động, tính bằng giây |
| `AUTO_INCREMENT` id | **Offset** | Offset chỉ duy nhất **trong một partition**, không duy nhất toàn topic |
| `SELECT ... WHERE` | **Không có** | Kafka chỉ đọc tuần tự từ một offset. Muốn lọc thì lọc ở phía consumer |
| `DELETE FROM ...` | **Không có** | Dữ liệu tự hết hạn theo retention, hoặc bị nén bởi log compaction |

Bốn dòng đáng dừng lại lâu hơn:

**Follower không phục vụ đọc.** Đây là điểm khác biệt lớn nhất so với read replica của MySQL, và cũng là thứ hay bị hiểu nhầm nhất. Ở MySQL, thêm replica là **tăng năng lực đọc**. Ở Kafka, thêm bản sao **không** tăng năng lực đọc — mọi lượt đọc vẫn đi vào leader. Muốn tăng năng lực đọc của Kafka thì phải **thêm partition**.

> Có ngoại lệ: từ Kafka 2.4, tính năng **follower fetching** (KIP-392) cho consumer đọc từ follower cùng rack để tiết kiệm phí truyền dữ liệu giữa các AZ. Nhưng mục tiêu là **giảm chi phí mạng**, không phải tăng thông lượng, và phải bật thủ công qua `client.rack`.

**Không có tầng định tuyến riêng.** MySQL sharding cần một tầng đứng giữa (MySQL Router, ProxySQL, Vitess, hoặc code trong ứng dụng) để biết dữ liệu nằm ở shard nào. Kafka **không cần** — client tự tải bản đồ partition→broker về và tự tính `murmur2(key) % N`. Bớt một thành phần phải cài, giám sát, và có thể chết.

**Failover tự động.** Cụm MySQL cần Orchestrator, MHA, hoặc InnoDB Cluster để tự chuyển primary. Kafka có sẵn controller làm việc đó, không cần công cụ ngoài.

**Không xoá được một bản ghi.** Đây là hệ quả của việc log là bất biến. Với GDPR ("quyền được lãng quên"), đây là vấn đề thật, và cách giải là **log compaction** cộng với **tombstone** (ghi một message có cùng key nhưng value là `null`) — hoặc mã hoá dữ liệu cá nhân bằng khoá riêng cho từng người rồi xoá khoá.

## Tư duy cốt lõi chung: chia để trị

Transcript gốc tóm gọn rất đúng: **"chia để trị" (divide and conquer)**. Cả MySQL cluster lẫn Kafka cluster đều dựa trên đúng hai động tác:

```text
   ┌────────────────────────────────────────────────────────────┐
   │  ĐỘNG TÁC 1 — CHẺ NHỎ (partitioning / sharding)            │
   │                                                             │
   │  Mục đích: KHẢ NĂNG MỞ RỘNG                                 │
   │  Cắt dữ liệu thành N mảnh rời, mỗi mảnh một máy nhận ghi    │
   │  → Năng lực ghi tăng gấp N                                  │
   │  Giá: mất khả năng truy vấn xuyên mảnh và thứ tự toàn cục   │
   ├────────────────────────────────────────────────────────────┤
   │  ĐỘNG TÁC 2 — NHÂN BẢN (replication)                        │
   │                                                             │
   │  Mục đích: TÍNH SẴN SÀNG                                    │
   │  Nhân mỗi mảnh thành R bản trên R máy khác nhau             │
   │  → Chịu được R-1 máy chết                                   │
   │  Giá: tốn R lần dung lượng đĩa, và ghi chậm hơn nếu đồng bộ │
   └────────────────────────────────────────────────────────────┘

   Hai động tác VUÔNG GÓC nhau. Hệ thống nghiêm túc nào cũng làm CẢ HAI.
```

Ghép cả hai lại cho một topic Kafka 2 partition, RF=3, trên 3 broker:

```text
                Broker 1         Broker 2         Broker 3
              ┌───────────┐    ┌───────────┐    ┌───────────┐
   Partition 0│  LEADER   │    │ follower  │    │ follower  │
              ├───────────┤    ├───────────┤    ├───────────┤
   Partition 1│ follower  │    │  LEADER   │    │ follower  │
              └───────────┘    └───────────┘    └───────────┘

   Chẻ nhỏ:  P0 và P1 nhận ghi ĐỘC LẬP → tăng thông lượng
   Nhân bản: mỗi P có 3 bản trên 3 máy  → chịu được 2 máy chết
   Cân tải:  leader TRẢI ĐỀU, không máy nào rảnh
```

Dòng cuối là chi tiết mà transcript nói đúng và đáng nhấn: controller **cố ý** trải leader ra đều các broker. Nếu tất cả leader dồn vào một máy thì máy đó gánh 100% traffic còn hai máy kia chỉ ngồi nhân bản.

## Bảng so sánh tổng: khi nào dùng cái gì

| Bài toán | MySQL cluster | Kafka |
|---|---|---|
| Cần truy vấn theo điều kiện phức tạp | **Có** — SQL, chỉ mục, JOIN | Không |
| Cần đọc lại toàn bộ lịch sử thay đổi | Khó — phải tự viết bảng lịch sử | **Có** — bản chất là log |
| Nhiều hệ thống cùng tiêu thụ một luồng dữ liệu | Khó — mỗi bên phải tự polling | **Có** — nhiều consumer group độc lập |
| Cập nhật một bản ghi tại chỗ | **Có** — `UPDATE` | Không — chỉ ghi thêm bản mới |
| Thông lượng ghi rất cao (triệu/giây) | Khó, phải shard thủ công | **Có** — ghi tuần tự là điểm mạnh nhất |
| Đảm bảo giao dịch ACID nhiều bảng | **Có** | Chỉ có transaction trong phạm vi Kafka |
| Xoá một bản ghi theo yêu cầu người dùng | **Có** — `DELETE` | Khó — cần compaction + tombstone |

Kết luận thực dụng: **hai thứ này không thay thế nhau, chúng bổ sung cho nhau.** Kiến trúc phổ biến nhất trong thực tế là dùng cả hai, nối bằng CDC:

```text
   Ứng dụng ──► MySQL (nguồn sự thật, truy vấn được)
                  │
                  │ Debezium đọc binlog
                  ▼
                Kafka (luồng sự kiện, phát lại được, nhiều bên tiêu thụ)
                  │
       ┌──────────┼──────────┬──────────────┐
       ▼          ▼          ▼              ▼
   Elasticsearch  Kho dữ liệu  Cache      Dịch vụ gợi ý
```

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| "Binlog chính là WAL của MySQL" | Sai. WAL của MySQL là **redo log**. Binlog là nhật ký logic ở tầng server, dùng cho nhân bản |
| "Thêm Kafka replica để đọc nhanh hơn" | Sai. Follower không phục vụ đọc. Muốn đọc nhanh hơn thì **thêm partition** |
| "Partition Kafka giống hệt shard MySQL" | Gần giống, nhưng Kafka tự định tuyến bằng hash, không cần tầng proxy |
| "Offset giống AUTO_INCREMENT id" | Offset chỉ duy nhất **trong một partition**, không phải toàn topic |
| Range sharding cho id tăng dần | Sinh điểm nóng ghi ở shard cuối. Kafka tránh bằng cách dùng hash |
| "Tăng partition thì cứ tăng thoải mái" | Tăng partition **phá vỡ ánh xạ key→partition** và do đó phá thứ tự theo key |
| "Kafka thay được database" | Không truy vấn theo điều kiện, không cập nhật tại chỗ, không xoá từng bản ghi |

## Tóm tắt bài 3

- **Read Replica** giải bài toán đọc nhiều; **Sharding** giải bài toán ghi nhiều. Cụm nghiêm túc dùng cả hai.
- **Đính chính lớn**: MySQL có **hai** nhật ký khác nhau. **Redo log** mới là WAL (phục hồi sau crash, ghi vòng, nội bộ InnoDB). **Binlog** là nhật ký logic ở tầng server, và **binlog mới là thứ replica đọc**. Câu "replica đọc WAL" đúng với PostgreSQL, sai với MySQL.
- **Kafka giống PostgreSQL**: chỉ có **một** log duy nhất cho mỗi partition, vừa là dữ liệu vừa là thứ follower kéo về.
- **Đính chính nhỏ**: MySQL Router kinh điển dùng **hai cổng riêng** (6446/6447) và ứng dụng tự chọn; tự phân tích câu SQL để tách đọc/ghi chỉ có từ Router 8.2.
- **Replication lag** là bài toán chung. Kafka giải bằng `acks` + ISR, và nhờ **high watermark** nên consumer Kafka không bao giờ đọc phải dữ liệu chưa nhân bản đủ.
- **Range sharding sinh điểm nóng** khi id tăng dần. Kafka dùng `murmur2(key) % N` để trải đều — nhưng cái giá là đổi số partition sẽ phá ánh xạ key→partition.
- Điểm khác biệt lớn nhất so với MySQL: **follower Kafka không phục vụ đọc**. Muốn tăng năng lực đọc thì tăng partition, không phải tăng RF.
- Kafka **không cần tầng định tuyến riêng** — client tự tải metadata và tự tính partition. Bớt hẳn một thành phần so với sharding MySQL.
- Tư duy chung: **chẻ nhỏ cho khả năng mở rộng, nhân bản cho tính sẵn sàng** — hai trục vuông góc.

**Bài kế tiếp** → [Bài 4: Giải phẫu broker, topic, partition, replica — cái gì nằm ở đâu trên đĩa](04-giai-phau-broker-topic-partition-replica.md)
