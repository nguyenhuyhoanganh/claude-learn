# Bài 12: Bảng đính chính transcript và tổng kết Phase 20

Phase này được viết từ một loạt transcript video tiếng Việt về "Kafka Internal". Transcript đó có nhiều ý hay, nhưng cũng có những chỗ **sai về mặt kỹ thuật** — sai theo kiểu dễ lan truyền vì nghe rất hợp lý.

Bài này liệt kê **toàn bộ** những chỗ đã kiểm chứng, phân loại thành ba nhóm: **đúng và đã giữ**, **sai và đã sửa**, **thiếu và đã bổ sung**. Mục đích không phải bắt lỗi ai, mà để bạn có một danh sách kiểm chứng được — và để những chỗ sai không âm thầm đi vào đầu bạn.

Nguồn đối chiếu: transcript chính thức của khoá tại [`transcripts/kafka-java/`](../../transcripts/kafka-java/), tài liệu Apache Kafka, và các KIP được dẫn tên cụ thể.

---

## Nhóm A — những chỗ transcript nói ĐÚNG (đã giữ và mở rộng)

| # | Nội dung trong transcript | Xác nhận | Được mở rộng ở |
|---|---|---|---|
| A1 | Kafka sinh ra tại LinkedIn để giải bài toán giám sát và theo dõi hành vi người dùng | Đúng | [Bài 1](01-vi-sao-kafka-ra-doi-tai-linkedin.md) |
| A2 | Hệ cũ dùng **polling** HTTP lấy XML, schema đổi liên tục, phải xử lý tay | Đúng | Bài 1 — thêm bảng bốn vấn đề của polling |
| A3 | Chạy theo **hourly batch** nên không làm được realtime | Đúng | Bài 1 |
| A4 | **ActiveMQ** không scale nổi quy mô LinkedIn, broker gây gián đoạn | Đúng | Bài 1 — thêm phân tích **vì sao** mô hình hàng đợi hỏng |
| A5 | Ba người: **Jay Kreps, Neha Narkhede, Jun Rao** | Đúng | Bài 1 |
| A6 | Cluster để có **HA** và **Scalability** | Đúng | [Bài 2](02-cluster-ha-va-scalability.md) |
| A7 | Scale-up bị giới hạn bởi phần cứng (khe RAM, dung lượng tối đa) | Đúng | Bài 2 — thêm hai giới hạn nữa: giá phi tuyến và **không tăng HA** |
| A8 | Đặt máy ở nhiều data center tăng HA | Đúng | Bài 2 — thêm **giá phải trả**: độ trễ và ảnh hưởng lên `acks=all` |
| A9 | MySQL: 1 primary ghi, nhiều replica đọc, dùng cho hệ read-heavy | Đúng | [Bài 3](03-doi-chieu-mysql-de-hieu-kafka.md) |
| A10 | Sharding chia server ghi thành nhiều mảnh cho hệ write-heavy | Đúng | Bài 3 — thêm ba kiểu chia và bẫy điểm nóng |
| A11 | Tư duy cốt lõi là **"chia để trị"** | Đúng | Bài 3 — tách thành hai động tác vuông góc |
| A12 | Producer publish, Consumer group subscribe | Đúng | [Bài 10](10-hanh-trinh-mot-message.md), [Bài 11](11-tu-dien-moi-thanh-phan-kafka.md) |
| A13 | Mỗi partition có một broker làm **Leader**, các broker khác giữ **Replica** | Đúng | [Bài 5](05-leader-follower-isr-va-luong-ghi.md) |
| A14 | Leader và Replica được **trải đều** để cân tải | Đúng | [Bài 4](04-giai-phau-broker-topic-partition-replica.md) — thêm cơ chế xoay vòng `Replicas` |
| A15 | Broker chết → bầu leader mới từ bản sao đã nhân bản | Đúng | Bài 5 — làm rõ là **chọn**, không phải bầu |
| A16 | ZooKeeper: bầu controller, giữ metadata, kiểm tra sức khoẻ node, phát hiện broker join/leave | Đúng | [Bài 6](06-zookeeper-tu-a-den-z.md) |
| A17 | ZooKeeper bị giới hạn **write throughput** cho metadata khi số partition tăng | Đúng | Bài 6 — thêm cơ chế cụ thể gây nghẽn |
| A18 | Phải vận hành **hai hệ phân tán riêng biệt** là gánh nặng | Đúng | Bài 6 — thêm bảng sáu đầu việc trùng lặp |
| A19 | KRaft nhúng Raft vào trong Kafka, bỏ ZooKeeper | Đúng | [Bài 7](07-kraft-va-thuat-toan-raft.md) |
| A20 | znode **EPHEMERAL**, node theo dõi node đứng trước, node trước chết thì node sau lên | Đúng | Bài 6 — thêm lý do: tránh **herd effect** |
| A21 | Cột **ISR** cho biết các bản sao đã đồng bộ | Đúng | Bài 5 — thêm cách đo bằng thời gian |
| A22 | `--replication-factor 3 --partitions 3` cho ba partition trải ba broker | Đúng | [Bài 9](09-failover-thuc-hanh-va-so-lieu.md) |
| A23 | Tắt một broker, gửi message vẫn thành công | Đúng | Bài 9 kịch bản 1 — thêm số đo |

Hai mươi ba điểm đúng. Phần lớn nội dung transcript là chuẩn — vấn đề nằm ở chỗ **thiếu chiều sâu** và ở tám chỗ sai bên dưới.

---

## Nhóm B — những chỗ transcript nói SAI (đã sửa)

### B1 — "Scale-in / Scale-out (hoặc hiểu là Scale-up / Scale-out)"

| | |
|---|---|
| **Sai ở đâu** | Gộp **scale-in** và **scale-up** làm một. Đây là hai khái niệm ngược nhau ở hai trục khác nhau |
| **Đúng là** | Trục dọc: **scale-up / scale-down**. Trục ngang: **scale-out / scale-in**. **Scale-in là GIẢM số máy** — ngược với scale-out |
| **Vì sao quan trọng** | Nói sai trong phỏng vấn là dấu hiệu rõ ràng chưa nắm khái niệm nền |
| **Sửa ở** | [Bài 2](02-cluster-ha-va-scalability.md) |

### B2 — "Cluster cần tối thiểu N/2+1 node sống theo nguyên tắc Raft Consensus"

| | |
|---|---|
| **Sai ở đâu** | Áp công thức quorum của **controller** lên **broker**. Câu này khiến người đọc tưởng cụm 3 broker chết 2 máy là chết hẳn |
| **Đúng là** | **Broker không dùng quorum.** Khả năng chịu đựng của broker do **RF** và **`min.insync.replicas`** quyết định. Quorum chỉ ràng buộc **controller** |
| **Bằng chứng** | [Bài 9 kịch bản 2](09-failover-thuc-hanh-va-so-lieu.md): chết 2/3 broker → **đọc vẫn chạy bình thường**; ghi bị chặn, và đổi `min.insync.replicas` thành 1 là ghi được ngay **mà không cần máy nào sống lại** |
| **Sửa ở** | [Bài 2](02-cluster-ha-va-scalability.md), [Bài 9](09-failover-thuc-hanh-va-so-lieu.md) |

### B3 — "Cơ chế bầu leader partition dựa trên thuật toán Raft"

| | |
|---|---|
| **Sai ở đâu** | Trộn hai tầng hoàn toàn khác nhau |
| **Đúng là** | **Raft bầu controller** (có bỏ phiếu, cần quá bán). **Controller CHỌN partition leader** từ danh sách ISR — thuần tuý tra bảng, không bỏ phiếu, không cần quorum |
| **Câu để nhớ** | *Raft bầu ra người ra quyết định. Người ra quyết định thì tra ISR chứ không bầu cử.* |
| **Sửa ở** | [Bài 5](05-leader-follower-isr-va-luong-ghi.md), [Bài 7](07-kraft-va-thuat-toan-raft.md) |

### B4 — "Chạy KRaft mode... tạo znode thành công trên Zookeeper"

| | |
|---|---|
| **Sai ở đâu** | Tự mâu thuẫn. Chế độ KRaft **không có** ZooKeeper, không có znode, không có phiên ZooKeeper |
| **Đúng là** | KRaft dùng **BrokerRegistrationRequest** gửi thẳng tới controller quorum, rồi **nhịp tim mỗi 2 giây** |
| **Cách phân biệt** | Có `process.roles` + `controller.quorum.voters` → KRaft. Có `zookeeper.connect` hoặc cổng 2181 → ZooKeeper |
| **Sửa ở** | [Bài 6](06-zookeeper-tu-a-den-z.md), [Bài 8](08-cluster-membership-va-vong-doi-broker.md) |

### B5 — "Trong mỗi Broker chứa các Topic. Trong Topic chia thành nhiều Partition"

| | |
|---|---|
| **Sai ở đâu** | Mô hình lồng nhau kiểu thư mục. Không giải thích được vì sao broker chết mà topic vẫn còn |
| **Đúng là** | **Topic là khái niệm logic cấp cụm**, không thuộc broker nào. **Broker chứa bản sao của partition** |
| **Bằng chứng vật lý** | Trên đĩa chỉ có thư mục `order-events-0`, **không có** thư mục `order-events` |
| **Sửa ở** | [Bài 4](04-giai-phau-broker-topic-partition-replica.md) |

### B6 — "Từ Broker Leader, dữ liệu được replicate sang các Broker Replica"

| | |
|---|---|
| **Sai ở đâu** | Sai **chiều**. Câu này vẽ ra hình ảnh leader đẩy dữ liệu đi |
| **Đúng là** | **Follower KÉO** bằng `FetchRequest` — đúng giao thức consumer dùng. Leader **không đẩy** gì cả |
| **Vì sao quan trọng** | Không hiểu điều này thì không giải thích nổi ISR, `replica.lag.time.max.ms`, hay vì sao follower chậm không làm leader chậm theo |
| **Sửa ở** | [Bài 5](05-leader-follower-isr-va-luong-ghi.md) |

### B7 — "mọi DB đều dùng WAL... sau khi ghi log xong, DB Read nhận file log đó để replicate (MySQL gọi là Binlog)"

| | |
|---|---|
| **Sai ở đâu** | Đồng nhất **binlog** với **WAL**. MySQL có **hai** nhật ký khác nhau về mọi mặt |
| **Đúng là** | **Redo log** (`ib_logfile*`) mới là WAL của MySQL: vật lý, ghi vòng, nội bộ InnoDB, dùng phục hồi sau crash, **không rời khỏi máy**. **Binlog** là nhật ký logic ở tầng server, ghi thêm, và **binlog mới là thứ replica đọc** |
| **Nguồn gốc hiểu lầm** | Câu "replica đọc WAL" **đúng với PostgreSQL** (chỉ có một nhật ký duy nhất), **sai với MySQL** |
| **Liên quan tới Kafka** | Kafka giống PostgreSQL: chỉ có **một** log cho mỗi partition, vừa là dữ liệu vừa là thứ follower kéo về |
| **Sửa ở** | [Bài 3](03-doi-chieu-mysql-de-hieu-kafka.md) |

### B8 — "linger.ms giúp chuyển luồng gửi giữa các Partition theo cơ chế Round-Robin khi không truyền Key"

| | |
|---|---|
| **Sai ở đâu** | **Round-robin là hành vi cũ**, đã bị thay từ Kafka 2.4 (KIP-480) |
| **Đúng là** | **Phân vùng dính (sticky partitioning)**: dồn một loạt message vào một partition tới khi lô đầy hoặc hết `linger.ms`, rồi mới đổi partition. Mục đích là **lô lớn hơn → ít request hơn → độ trễ thấp hơn** |
| **Đối chứng** | Transcript **chính thức** của khoá (`033_Demo Handling Null Keys`) mô tả đúng hành vi này: một consumer nhận một loạt, im lặng, rồi consumer kia mới nhận |
| **Cập nhật thêm** | Kafka 3.3 (KIP-794) nâng lên **uniform sticky** — ưu tiên partition mà broker đang xử lý nhanh hơn |
| **Sửa ở** | [Bài 10](10-hanh-trinh-mot-message.md) |

### B9 — "Failover time từ vài chục giây xuống chỉ còn vài mili giây"

| | |
|---|---|
| **Sai ở đâu** | "Vài mili giây" là con số bị thổi phồng, không có nguồn |
| **Đúng là** | Benchmark Confluent trên cụm **2 triệu partition**: phục hồi sau tắt đột ngột **~503 giây → ~37 giây**; tắt có kiểm soát **~135 giây → ~32 giây**. Thời gian **đổi controller** rút từ hàng chục giây xuống **dưới một giây** |
| **Đo thực tế** | [Bài 9 kịch bản 5](09-failover-thuc-hanh-va-so-lieu.md): `kill -9` mất **~8,7 giây**, `docker stop` mất **~0,5 giây**. Gần như toàn bộ thời gian là **phát hiện chết**, không phải bầu lại |
| **Sửa ở** | [Bài 7](07-kraft-va-thuat-toan-raft.md), [Bài 9](09-failover-thuc-hanh-va-so-lieu.md) |

### B10 — "hỗ trợ mở rộng lên hàng triệu Partition"

| | |
|---|---|
| **Sai ở đâu** | Không sai về mặt sự kiện (đó là mục tiêu của KIP-500 và đã chứng minh trong benchmark), nhưng **dễ bị hiểu nhầm thành lời khuyên thực hành** |
| **Đúng là** | "Hàng triệu" là con số **toàn cụm** với hàng trăm broker. Mỗi broker vẫn nên giữ trong khoảng **2.000–4.000 bản sao partition** |
| **Vì sao** | Mỗi partition tốn file mở, bộ nhớ đệm ở client, thời gian quét log khi khởi động, và thời gian rebalance |
| **Sửa ở** | [Bài 7](07-kraft-va-thuat-toan-raft.md) |

### B11 — "Mỗi Broker tương ứng với một máy chủ ảo (VM) hoặc máy vật lý"

| | |
|---|---|
| **Sai ở đâu** | Đúng ở production nhưng sai về bản chất |
| **Đúng là** | **Broker là một tiến trình** có `node.id` riêng. Bằng chứng: `docker-compose.yml` của khoá chạy **3 broker trên một máy** |
| **Hệ quả thực hành** | Production thì một máy một broker — vì nhiều broker chung máy làm RF mất tác dụng |
| **Sửa ở** | [Bài 4](04-giai-phau-broker-topic-partition-replica.md) |

### B12 — "MySQL Router phân loại truy vấn: INSERT/UPDATE gửi con Write, SELECT gửi con Read"

| | |
|---|---|
| **Sai ở đâu** | Chỉ đúng với phiên bản đủ mới |
| **Đúng là** | Cách kinh điển của InnoDB Cluster là **hai cổng riêng** (6446 đọc-ghi, 6447 chỉ đọc) và **ứng dụng tự chọn cổng**. Tự phân tích câu SQL để tách đọc/ghi trên một cổng chỉ có từ **MySQL Router 8.2** |
| **Hệ quả thực hành** | Với cách kinh điển, ứng dụng Spring phải cấu hình **hai DataSource** và dùng `@Transactional(readOnly = true)` |
| **Sửa ở** | [Bài 3](03-doi-chieu-mysql-de-hieu-kafka.md) |

**Tổng: 12 chỗ đã sửa.** Trong đó B2, B3, B5, B6, B7 là những chỗ sai ảnh hưởng nặng nhất tới mô hình tư duy.

---

## Nhóm C — những chỗ transcript KHÔNG NÓI (đã bổ sung)

Đây là phần chiếm phần lớn dung lượng Phase 20, và cũng là phần đáng giá nhất.

| Chủ đề bổ sung | Vì sao cần | Ở bài |
|---|---|---|
| **High Watermark và LEO** | Không có nó thì không hiểu vì sao consumer không đọc được dữ liệu vừa ghi | [Bài 5](05-leader-follower-isr-va-luong-ghi.md) |
| **`min.insync.replicas`** và bẫy `acks=all` thoái hoá thành `acks=1` | Đây là lỗi cấu hình gây mất dữ liệu **im lặng** phổ biến nhất | Bài 5 |
| **`replica.lag.time.max.ms`** — ISR đo bằng thời gian | Giải thích vì sao cách đo cũ theo số message đã bị bỏ | Bài 5 |
| **`unclean.leader.election.enable`** | Công tắc CAP tường minh nhất trong Kafka | Bài 5 |
| **Leader epoch** | Chống phân kỳ dữ liệu; giải thích dòng `Truncating to offset N` trong log | Bài 5 |
| **Bố cục dữ liệu trên đĩa** — segment, `.index`, `.timeindex`, `kafka-dump-log.sh` | Biến khái niệm trừu tượng thành thứ nhìn thấy được | [Bài 4](04-giai-phau-broker-topic-partition-replica.md) |
| **Vì sao Kafka nhanh** — ghi tuần tự, page cache, zero-copy | Thiếu hẳn trong transcript, mà đây là câu hỏi phỏng vấn kinh điển | Bài 4 |
| **Bẫy TLS làm mất zero-copy** | Chi phí thật của việc bật mã hoá, ít ai lường trước | Bài 4 |
| **`broker.rack`** | Một dòng cấu hình, đổi từ "có thể mất partition" thành "chắc chắn không" | [Bài 2](02-cluster-ha-va-scalability.md) |
| **MirrorMaker 2 thay vì trải cụm qua nhiều region** | Cách làm chuẩn trong ngành, transcript chỉ nói "đặt máy ở nhiều DC" | Bài 2 |
| **Raft giải thích đầy đủ** — term, bầu cử, thời gian chờ ngẫu nhiên, kiểm tra log trước khi bỏ phiếu, Log Matching Property | Transcript chỉ nhắc tên thuật toán | [Bài 7](07-kraft-va-thuat-toan-raft.md) |
| **`__cluster_metadata`** — metadata thành một topic | Đây là ý tưởng trung tâm của KIP-500 | Bài 7 |
| **Snapshot của KRaft** | Chống log metadata phình vô hạn | Bài 7 |
| **Đường chuyển đổi ZooKeeper → KRaft** | Việc thật phải làm ở mọi công ty đang chạy cụm cũ | Bài 7 |
| **Trạng thái "fenced"** | Giải thích vì sao rolling restart ở KRaft mượt hơn | [Bài 8](08-cluster-membership-va-vong-doi-broker.md) |
| **Tắt có kiểm soát so với chết đột ngột** | Chênh nhau ~17 lần về thời gian gián đoạn | Bài 8, [Bài 9](09-failover-thuc-hanh-va-so-lieu.md) |
| **Bẫy giảm timeout gây dao động** | Suy nghĩ tự nhiên nhưng phản tác dụng | Bài 8 |
| **Quy trình rolling restart chuẩn** | Bỏ qua bước chờ under-replicated là nguồn gốc mất dữ liệu khi bảo trì | Bài 8 |
| **Hành vi client khi failover** — `delivery.timeout.ms`, làm mới metadata | Giải thích vì sao demo failover "không thấy gì xảy ra" | Bài 8 |
| **Kiến trúc hai tầng luồng của broker** | Giải thích `num.network.threads` và `num.io.threads` | [Bài 10](10-hanh-trinh-mot-message.md) |
| **Purgatory và long polling** | Khép lại vòng tròn với bài toán polling ở Bài 1 | Bài 10 |
| **Group Coordinator** và cách chọn bằng `hash(group.id) % 50` | Cho thấy không có điểm nghẽn trung tâm | Bài 10 |
| **`max.poll.interval.ms`** và vòng lặp rebalance vô tận | Sự cố production số một của consumer | Bài 10 |
| **Idempotent consumer** | "Ít nhất một lần" là mặc định, nên đây là kỹ năng bắt buộc | Bài 10 |
| **Số liệu độ trễ đầu-cuối bóc tách theo chặng** | Biết chỉnh chỗ nào có tác dụng | Bài 10 |
| **Sáu kịch bản failover có output thật** | Chứng minh thay vì khẳng định | [Bài 9](09-failover-thuc-hanh-va-so-lieu.md) |
| **Bộ chỉ số giám sát và chuỗi cảnh báo sớm** | Đặt cảnh báo ở chỉ số đầu tiên, không phải chỉ số cuối | Bài 9 |
| **Bảng mặc định phải đổi trước production** | Chín trong mười một mặc định của Kafka không an toàn cho tải thật | Bài 9, [Bài 11](11-tu-dien-moi-thanh-phan-kafka.md) |
| **Hệ sinh thái** — Connect, Debezium, Streams, ksqlDB, Schema Registry, Cruise Control | Bức tranh đầy đủ quanh Kafka | Bài 11 |

---

## Ba mô hình tư duy cần mang theo

Nếu chỉ giữ lại ba thứ từ toàn bộ Phase 20, hãy giữ ba thứ này.

### Mô hình 1 — ba tầng bảo vệ hỏng độc lập nhau

```text
   ┌──────────────────────────────────────────────────────────────┐
   │ TẦNG DỮ LIỆU      RF                                          │
   │                   "Còn bản sao nào không?"                    │
   │                   RF=1 + máy chết = MẤT VĨNH VIỄN             │
   ├──────────────────────────────────────────────────────────────┤
   │ TẦNG ĐỘ BỀN       min.insync.replicas                         │
   │                   "Có cho ghi khi thiếu bản sao không?"       │
   │                   Không đủ = NotEnoughReplicas (đúng, cố ý)   │
   ├──────────────────────────────────────────────────────────────┤
   │ TẦNG ĐIỀU PHỐI    quorum controller                           │
   │                   "Có thay đổi metadata được không?"          │
   │                   Mất quá bán = ĐÓNG BĂNG metadata            │
   └──────────────────────────────────────────────────────────────┘

   Đừng gộp thành một câu "cụm 3 máy chịu được 1 máy chết".
```

### Mô hình 2 — Kafka dùng lại đúng một cơ chế cho bốn việc

```text
   Consumer đọc dữ liệu           →  FetchRequest (kéo, có offset)
   Follower nhân bản partition    →  FetchRequest (kéo, có offset)
   Broker đồng bộ metadata KRaft  →  kéo log metadata, có offset
   Kafka lưu offset của consumer  →  một topic (__consumer_offsets)

   → Không có ai ĐẨY dữ liệu cho ai (trừ producer đẩy vào leader).
   → Mọi thứ đều là MỘT CÁI LOG CÓ OFFSET và người đọc tự nhớ vị trí.
```

Đây là dấu hiệu của một thiết kế đã hội tụ: cùng một ý tưởng, dùng ở bốn tầng khác nhau. Nắm được ý tưởng đó là nắm được Kafka.

### Mô hình 3 — mọi tính năng của Kafka là một đánh đổi tường minh

```text
   Bỏ thứ tự toàn cục     →  ĐƯỢC song song hoá bằng partition
   Bỏ khả năng sửa message →  ĐƯỢC tốc độ ghi tuần tự
   Bỏ truy vấn theo điều kiện → ĐƯỢC thông lượng cực cao
   Bỏ việc broker theo dõi consumer → ĐƯỢC phát lại và nhiều group
   Bỏ đảm bảo exactly-once mặc định → ĐƯỢC độ trễ thấp
   Chấp nhận độ trễ +1 vòng nhân bản → ĐƯỢC consumer không đọc phải dữ liệu ma
```

Kafka không "giỏi mọi thứ". Nó **cố ý từ bỏ** những đảm bảo mà phần lớn hệ thống không cần, để đổi lấy những thứ hầu hết hệ thống rất cần. Hiểu bảng đánh đổi này là biết **khi nào không nên dùng Kafka** — và đó thường là dấu hiệu của người đã thật sự dùng nó ở production.

---

## Mục lục Phase 20

| Bài | Nội dung | Đính chính chính |
|---|---|---|
| [01](01-vi-sao-kafka-ra-doi-tai-linkedin.md) | Vì sao Kafka ra đời tại LinkedIn | Mốc thời gian: phát triển 2010, mở mã 2011 |
| [02](02-cluster-ha-va-scalability.md) | Cluster, High Availability, Scalability | B1 (scale-in), B2 (quorum không áp cho broker) |
| [03](03-doi-chieu-mysql-de-hieu-kafka.md) | Đối chiếu MySQL để hiểu Kafka | B7 (binlog ≠ WAL), B12 (MySQL Router) |
| [04](04-giai-phau-broker-topic-partition-replica.md) | Giải phẫu broker, topic, partition, replica | B5 (broker không chứa topic), B11 (broker là tiến trình) |
| [05](05-leader-follower-isr-va-luong-ghi.md) | Leader, Follower, ISR, đường đi lệnh ghi | B6 (follower kéo), B3 (Raft không bầu partition leader) |
| [06](06-zookeeper-tu-a-den-z.md) | ZooKeeper từ A đến Z | B4 (KRaft không có znode) |
| [07](07-kraft-va-thuat-toan-raft.md) | KRaft và thuật toán Raft | B9 (số liệu failover), B10 (hàng triệu partition) |
| [08](08-cluster-membership-va-vong-doi-broker.md) | Vòng đời một broker | B4 (đăng ký KRaft, không phải znode) |
| [09](09-failover-thuc-hanh-va-so-lieu.md) | Thực hành failover có số liệu | B2 (chứng minh bằng thí nghiệm) |
| [10](10-hanh-trinh-mot-message.md) | Hành trình một message | B8 (sticky, không phải round-robin) |
| [11](11-tu-dien-moi-thanh-phan-kafka.md) | Từ điển mọi thành phần Kafka | — |
| [12](12-dinh-chinh-transcript-va-tong-ket.md) | Bảng đính chính và tổng kết | Bài này |

## Phase 20 khác gì các phase khác của khoá

Phase 20 **không thay thế** phần nào của khoá. Nó là lớp đào sâu bên dưới:

| Bạn đã học ở | Phase 20 đào thêm |
|---|---|
| [Phase 1](../phase-1-intro/01-tai-sao-event-driven.md) — vì sao cần event-driven | Bài 1 — vì sao **Kafka** ra đời, và mỗi quyết định thiết kế chữa cơn đau nào |
| [Phase 3](../phase-3-kafka-fundamentals/01-core-concepts-cluster.md) — khái niệm cốt lõi | Bài 4, 5 — dữ liệu nằm ở đâu trên đĩa, HW/LEO/ISR hoạt động ra sao |
| [Phase 9](../phase-9-kafka-cluster/01-replication-listeners.md) — replication và listener | Bài 6, 7 — ZooKeeper và KRaft giải nghĩa đầy đủ |
| [Phase 9 bài 2](../phase-9-kafka-cluster/02-docker-compose-cluster.md) — dựng cụm Docker | Bài 8, 9 — vòng đời broker và sáu kịch bản failover có số đo |
| [Phase 12](../phase-12-reliability/01-acknowledgement-intro.md) — độ tin cậy và ack | Bài 5 — bẫy `acks=all` thoái hoá thành `acks=1` |
| [Phase 18](../phase-18-best-practices/01-producer-best-practices.md) — best practices | Bài 9, 11 — bảng mặc định phải đổi, kèm lý do từng dòng |

## Tóm tắt bài 12

- Transcript nguồn có **23 điểm đúng** đã được giữ và mở rộng, **12 chỗ sai** đã sửa, và một danh sách dài những chỗ thiếu đã bổ sung.
- Năm chỗ sai ảnh hưởng nặng nhất tới mô hình tư duy: **quorum không áp dụng cho broker** (B2), **Raft không bầu partition leader** (B3), **broker không chứa topic** (B5), **follower kéo chứ leader không đẩy** (B6), **binlog không phải WAL** (B7).
- Ba chỗ sai còn lại dễ lan truyền vì nghe hợp lý: **scale-in ≠ scale-up** (B1), **null key dùng sticky chứ không round-robin** (B8), **failover không phải vài mili giây** (B9).
- Ba mô hình tư duy đáng mang theo: **ba tầng bảo vệ hỏng độc lập**, **Kafka dùng lại một cơ chế log-có-offset cho bốn việc**, và **mọi tính năng là một đánh đổi tường minh**.
- Phase 20 là lớp bổ sung, không thay thế phase nào. Đọc song song với Phase 3, 9, 12, 18.

**Quay lại** → [Mục lục khoá Kafka Java](../README.md)
