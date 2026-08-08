# Bài 7: KRaft và thuật toán Raft — bầu cử, nhiệm kỳ, nhật ký metadata

Chữ "Raft" xuất hiện khắp nơi trong tài liệu Kafka nhưng gần như không bao giờ được giải thích. Người ta viết "KRaft dùng thuật toán đồng thuận Raft" rồi đi tiếp, để lại một hộp đen.

Bài này mở hộp đen đó. Raft không khó — nó được thiết kế **có chủ đích để dễ hiểu** (bài báo gốc năm 2014 của Diego Ongaro và John Ousterhout mang tên *"In Search of an Understandable Consensus Algorithm"*, ra đời vì Paxos quá khó dạy). Hiểu Raft rồi thì KRaft, etcd, Consul, CockroachDB đều mở ra cùng lúc.

## Bài toán đồng thuận — vì sao nó khó

**Đồng thuận** (consensus) là bài toán: *nhiều máy phải cùng đồng ý về một giá trị, kể cả khi một số máy chết và mạng không đáng tin.*

Nghe tầm thường cho tới khi liệt kê những gì có thể xảy ra:

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  Máy có thể CHẾT bất cứ lúc nào — kể cả giữa lúc ghi         │
   │  Máy chết có thể SỐNG LẠI với dữ liệu cũ                     │
   │  Gói tin có thể MẤT                                          │
   │  Gói tin có thể TỚI MUỘN — muộn nhiều giây                   │
   │  Gói tin có thể TỚI KHÔNG ĐÚNG THỨ TỰ                        │
   │  Gói tin có thể BỊ NHÂN ĐÔI                                  │
   │  Mạng có thể ĐỨT ĐÔI, chia cụm thành hai nhóm                │
   │  Đồng hồ các máy có thể LỆCH nhau                            │
   └──────────────────────────────────────────────────────────────┘

   Và thuật toán vẫn phải đảm bảo: KHÔNG BAO GIỜ có hai quyết định
   mâu thuẫn được coi là hợp lệ.
```

Điều Raft **không** hứa: nó không hứa luôn luôn tiến triển. Khi mất quorum, Raft **dừng lại** thay vì đoán bừa. Đó là lựa chọn cố ý — dừng có thể sửa được, sai thì không.

## Raft: ba trạng thái và một cuốn sổ nhiệm kỳ

Mỗi node trong nhóm Raft luôn ở đúng một trong ba trạng thái:

```text
              ┌─────────────────────────────────────────┐
              │                                          │
              │   hết thời gian chờ (election timeout)   │
              ▼                                          │
        ┌──────────┐                              ┌──────┴───┐
        │ FOLLOWER │ ──────────────────────────►  │CANDIDATE │
        │ (đi theo)│                              │ (ứng cử) │
        └──────────┘                              └──────┬───┘
              ▲                                          │
              │  gặp nhiệm kỳ cao hơn                    │ nhận
              │  hoặc leader hợp lệ                      │ quá bán
              │                                          │ phiếu
              │                                          ▼
              │                                    ┌──────────┐
              └────────────────────────────────────│  LEADER  │
                          gặp nhiệm kỳ cao hơn     │(lãnh đạo)│
                                                   └──────────┘
```

| Trạng thái | Làm gì |
|---|---|
| **Follower** | Thụ động. Chỉ trả lời request từ leader và candidate. Trạng thái khởi đầu của mọi node |
| **Candidate** | Đang tranh cử. Tự tăng nhiệm kỳ, bỏ phiếu cho mình, đi xin phiếu |
| **Leader** | Nhận mọi lệnh ghi, sao chép sang follower, gửi nhịp tim để giữ ghế |

### Term — nhiệm kỳ, "đồng hồ logic" của Raft

**Term** (nhiệm kỳ) là một số nguyên chỉ tăng, không bao giờ giảm. Mỗi nhiệm kỳ có **nhiều nhất một leader** (có thể không có ai, nếu bầu hỏng).

```text
   term 1        term 2        term 3        term 4
   ├──────────┤  ├──────────┤  ├──┤          ├──────────────┤
   bầu → L=A     bầu → L=B     bầu HỎNG      bầu → L=C
                               (chia phiếu,
                                không ai quá bán)
```

Term giải bài toán mà đồng hồ thật không giải được: **so sánh cái gì cũ, cái gì mới, mà không cần đồng hồ chính xác.** Quy tắc nền tảng của cả Raft chỉ có một câu:

> **Node nào nhận được thông điệp mang term lớn hơn term của mình thì lập tức cập nhật term và lùi về làm follower.**

Đây chính là thứ chặn split-brain. Leader cũ bị cô lập, sống lại và cố ra lệnh với term 2, trong khi cụm đã ở term 5 — mọi node từ chối và nói cho nó biết term hiện tại. Leader cũ tự động lùi về follower. Không cần ai đi "giết" nó.

## Bầu cử diễn ra chính xác thế nào

```text
   TRẠNG THÁI BÌNH THƯỜNG
   ══════════════════════
   ┌────────┐  nhịp tim mỗi ~100ms  ┌──────────┐
   │ LEADER │ ────────────────────► │ FOLLOWER │  đặt lại đồng hồ chờ
   │(term 4)│ ────────────────────► │ FOLLOWER │  đặt lại đồng hồ chờ
   └────────┘                       └──────────┘

   LEADER CHẾT
   ═══════════
   t=0     Nhịp tim ngừng.
   t=?     Đồng hồ chờ của mỗi follower đếm ngược.
           MỖI NODE CÓ THỜI GIAN CHỜ NGẪU NHIÊN (ví dụ 150–300 ms)

   t=180ms Node B hết giờ TRƯỚC:
           - tăng term: 4 → 5
           - chuyển sang CANDIDATE
           - bỏ phiếu cho chính mình (1 phiếu)
           - gửi RequestVote(term=5, log của tôi tới đâu) cho mọi node

   t=185ms Node C nhận RequestVote:
           - term 5 > term 4 của mình → cập nhật term, lùi về follower
           - kiểm tra: log của B có ÍT NHẤT BẰNG log của mình không?
           - chưa bỏ phiếu cho ai ở term 5?
           - CẢ HAI đều thoả → BỎ PHIẾU CHO B

   t=190ms B có 2/3 phiếu = quá bán → B LÊN LEADER (term 5)
           B lập tức phát nhịp tim để chặn các cuộc bầu cử khác
```

### Chi tiết then chốt 1 — thời gian chờ ngẫu nhiên

Nếu mọi node cùng chờ đúng 200 ms thì **cả ba cùng ứng cử một lúc**, chia phiếu đều, không ai quá bán, nhiệm kỳ hỏng, rồi lại cùng chờ 200 ms, lại chia phiếu — lặp vô hạn.

Raft giải bằng một mẹo đơn giản đến bất ngờ: **mỗi node chờ một khoảng ngẫu nhiên trong một dải**. Xác suất hai node hết giờ cùng lúc rất thấp, và nếu có xảy ra thì lần bầu lại cũng ngẫu nhiên lại. Thực tế thường xong sau một hoặc hai vòng.

### Chi tiết then chốt 2 — cử tri kiểm tra log trước khi bỏ phiếu

Đây là điều kiện đảm bảo **an toàn** của Raft, và nó là lý do Raft không bao giờ mất dữ liệu đã commit:

> Một node **chỉ bỏ phiếu** cho ứng viên có log **mới ít nhất bằng** log của mình (so sánh term của bản ghi cuối, rồi tới độ dài log).

Hệ quả: **kẻ thiếu dữ liệu không bao giờ trở thành leader**, vì không thể gom đủ quá bán phiếu. So sánh trực tiếp với `unclean.leader.election` ở [Bài 5](05-leader-follower-isr-va-luong-ghi.md) — chỗ mà Kafka **cho phép** bạn tự bắn vào chân mình ở tầng partition, thì ở tầng metadata Raft **không cho phép**, không có công tắc nào cả. Metadata quan trọng hơn, nên không có tuỳ chọn nới lỏng.

## Sao chép nhật ký — cách một quyết định được ghi nhận

```text
   Client gửi lệnh "đặt leader của order-events-0 = broker 3"
                            │
                            ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 1. LEADER nối bản ghi vào cuối log CỦA MÌNH             │
   │    (chưa commit — chưa được coi là quyết định)          │
   └─────────────────────────┬───────────────────────────────┘
                             ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 2. LEADER gửi AppendEntries tới mọi follower            │
   └─────────────────────────┬───────────────────────────────┘
                             ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 3. Follower kiểm tra: bản ghi TRƯỚC ĐÓ của tôi có khớp  │
   │    với cái leader nói không?                            │
   │    Khớp   → ghi vào log, trả lời OK                     │
   │    Không  → TỪ CHỐI. Leader lùi lại một bước và thử lại │
   │             cho tới khi tìm được điểm hai bên khớp nhau │
   └─────────────────────────┬───────────────────────────────┘
                             ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 4. Đủ QUÁ BÁN đã ghi → leader đánh dấu COMMITTED        │
   │    Từ giây phút này, bản ghi KHÔNG BAO GIỜ mất          │
   └─────────────────────────┬───────────────────────────────┘
                             ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 5. Leader áp dụng vào máy trạng thái + trả lời client   │
   │    Nhịp tim kế tiếp báo cho follower biết đã commit tới │
   │    đâu → follower cũng áp dụng                          │
   └─────────────────────────────────────────────────────────┘
```

Bước 3 là phần tinh tế nhất và đáng nói kỹ. Mỗi `AppendEntries` kèm theo `(index, term)` của bản ghi **ngay trước** bản ghi mới. Follower chỉ chấp nhận nếu chỗ đó khớp. Cơ chế này sinh ra một tính chất rất mạnh:

> **Nếu hai log có cùng `(index, term)` tại một vị trí, thì toàn bộ phần trước vị trí đó của hai log là GIỐNG HỆT NHAU.**

Nghĩa là chỉ cần kiểm tra một điểm là biết cả quá khứ có khớp không — không phải so sánh từng bản ghi. Đây gọi là **Log Matching Property**.

### Chỗ giống Kafka đến bất ngờ

Nếu bạn thấy bước 3 quen quen thì đúng vậy — nó chính là **leader epoch** của [Bài 5](05-leader-follower-isr-va-luong-ghi.md), cùng ý tưởng cắt bỏ phần phân kỳ để hai bên khớp lại.

Bảng đối chiếu để cố định mô hình tư duy:

| Raft | Kafka partition |
|---|---|
| Raft log | Log của partition |
| Term | Leader epoch |
| Commit index | High Watermark |
| Quá bán đã ghi → commit | Mọi bản sao trong ISR đã có → HW nhích lên |
| Cử tri kiểm tra log trước khi bầu | ISR quyết định ai được lên leader |
| Follower gửi AppendEntries response | Follower gửi FetchRequest với offset |

Khác biệt cốt lõi giữa hai cái: **Raft dùng quá bán, Kafka dùng ISR.** Raft với 5 node cần 3 đồng ý. Kafka với RF=5 và `min.insync.replicas=2` chỉ cần 2. Kafka nới lỏng hơn để đổi lấy thông lượng, và bù lại bằng cách theo dõi chặt xem ai đang thực sự đồng bộ.

## KRaft — Raft áp dụng vào Kafka

### Metadata trở thành một topic

Đây là ý tưởng trung tâm của KIP-500:

```text
   ┌────────────────────────────────────────────────────────────┐
   │  Topic nội bộ:  __cluster_metadata                         │
   │  Số partition:  ĐÚNG 1  (không thể khác — Raft cần một log)│
   │  Nhân bản:      trên toàn bộ controller quorum             │
   │  Nội dung:      NHẬT KÝ mọi thay đổi metadata              │
   └────────────────────────────────────────────────────────────┘

   offset 0   : TopicRecord         tạo topic "order-events"
   offset 1   : PartitionRecord     P0: replicas=[1,2,3] isr=[1,2,3] leader=1
   offset 2   : PartitionRecord     P1: replicas=[2,3,1] isr=[2,3,1] leader=2
   offset 3   : RegisterBrokerRecord broker 4 tham gia cụm
   offset 4   : PartitionChangeRecord P0 leader đổi 1 → 3, isr=[3,2]
   offset 5   : ConfigRecord        order-events: min.insync.replicas=2
   ...
```

Metadata không còn là một cái cây trạng thái phải đọc lại toàn bộ. Nó là **một dòng sự kiện có offset**, đúng như mọi topic khác của Kafka.

Ba hệ quả trực tiếp, và cả ba đều chữa đúng một cơn đau đã liệt kê ở [Bài 6](06-zookeeper-tu-a-den-z.md):

| Hệ quả | Chữa cơn đau nào |
|---|---|
| Broker chỉ cần nói "tôi đang ở offset N, cho tôi phần sau" | Controller không phải nạp lại toàn bộ khi khởi động |
| Mọi broker giữ **bản sao đầy đủ** metadata trong RAM, tự cập nhật bằng cách đọc log | Hết cảnh "hai nguồn sự thật lệch nhau" |
| Ghi metadata là **nối vào log**, không phải cập nhật cây | Hết nghẽn cổ chai khi có sự cố lớn |

### Kiến trúc KRaft

```text
   ┌──────────── CONTROLLER QUORUM (3 hoặc 5 node) ─────────────┐
   │                                                             │
   │   ┌───────────────┐   ┌────────────┐   ┌────────────┐      │
   │   │ Controller 1  │   │Controller 2│   │Controller 3│      │
   │   │ ACTIVE        │◄─►│  standby   │◄─►│  standby   │      │
   │   │ (Raft leader) │   │(Raft follo)│   │(Raft follo)│      │
   │   │               │   │            │   │            │      │
   │   │ __cluster_    │   │ __cluster_ │   │ __cluster_ │      │
   │   │ metadata      │   │ metadata   │   │ metadata   │      │
   │   │ (bản đầy đủ)  │   │(bản đầy đủ)│   │(bản đầy đủ)│      │
   │   └───────┬───────┘   └────────────┘   └────────────┘      │
   └───────────┼─────────────────────────────────────────────────┘
               │  broker KÉO log metadata về (giống follower kéo dữ liệu)
   ┌───────────┼─────────────────────────────────────────────────┐
   │           ▼                                                  │
   │   ┌────────────┐  ┌────────────┐  ┌────────────┐            │
   │   │  Broker 1  │  │  Broker 2  │  │  Broker 3  │            │
   │   │ bản sao    │  │ bản sao    │  │ bản sao    │            │
   │   │ metadata   │  │ metadata   │  │ metadata   │            │
   │   │ trong RAM  │  │ trong RAM  │  │ trong RAM  │            │
   │   └────────────┘  └────────────┘  └────────────┘            │
   │                        BROKER                                │
   └──────────────────────────────────────────────────────────────┘
```

Chú ý cơ chế ở giữa: **broker KÉO log metadata**, đúng như follower kéo dữ liệu partition ở [Bài 5](05-leader-follower-isr-va-luong-ghi.md). Kafka dùng lại đúng một cơ chế cho ba việc khác nhau — consumer đọc dữ liệu, follower nhân bản, broker đồng bộ metadata. Đây là dấu hiệu của một thiết kế đã hội tụ.

### Hai kiểu triển khai

```properties
# KIỂU GỘP (combined) — cụm nhỏ, dev, tối đa vài chục broker
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
```

```properties
# KIỂU TÁCH (isolated) — production lớn
# Trên 3 máy controller chuyên dụng:
process.roles=controller
# Trên 97 máy broker:
process.roles=broker
```

| | Gộp | Tách |
|---|---|---|
| Số máy tối thiểu | 3 | 3 controller + N broker |
| Phù hợp | Dev, cụm nhỏ | Production lớn (100+ broker) |
| Rủi ro | Broker quá tải làm controller chậm theo | Không |
| Kafka khuyến nghị cho production | Không | **Có** |

Ở môi trường học của khoá này, `docker-compose.yml` dùng **kiểu gộp** — ba container, mỗi container vừa broker vừa controller.

### Ảnh chụp nhanh — chống log phình vô hạn

Log metadata chỉ ghi thêm, nên sau vài năm nó sẽ khổng lồ. KRaft giải bằng **snapshot** (ảnh chụp trạng thái):

```text
   Log metadata: 50 triệu bản ghi
        │
        │  định kỳ nén lại thành ảnh chụp trạng thái hiện tại
        ▼
   ┌───────────────────────────────┐   ┌──────────────────────┐
   │ SNAPSHOT tại offset 49.900.000│ + │ log từ 49.900.001 →  │
   │ (trạng thái đầy đủ, gọn)      │   │ (chỉ 100.000 bản ghi)│
   └───────────────────────────────┘   └──────────────────────┘

   Node mới tham gia: nạp snapshot rồi đọc phần đuôi
   → nhanh hơn nhiều so với phát lại 50 triệu bản ghi
```

Ý tưởng này giống hệt **log compaction** của Kafka thường — thêm một chỗ nữa Kafka dùng lại chính khái niệm của mình.

## Số liệu thật — và đính chính con số bị thổi phồng

Transcript gốc nói:

> *"tối ưu hoá thời gian khôi phục sự cố (Failover time) từ vài chục giây xuống chỉ còn vài mili giây"*

**Vài mili giây là sai.** Con số đó không có cơ sở. Số liệu thật đến từ benchmark Confluent công bố khi giới thiệu KRaft, đo trên cụm có **2 triệu partition**:

| Phép đo | ZooKeeper | KRaft | Cải thiện |
|---|---|---|---|
| Tắt có kiểm soát (controlled shutdown) | ~135 giây | ~32 giây | ~4× |
| Phục hồi sau tắt đột ngột (uncontrolled) | ~503 giây | ~37 giây | **~13×** |

Còn thời gian **đổi controller** thì rút từ hàng chục giây xuống **dưới một giây** (đơn vị vài trăm mili giây tới khoảng một giây, tuỳ quy mô).

> **Lưu ý về cách trích dẫn**: đây là số của một benchmark cụ thể, ở quy mô cực đoan 2 triệu partition, do Confluent thực hiện. Đừng dùng nó như một lời hứa cho cụm của bạn. Điều **đúng** để nói là: *cải thiện một bậc độ lớn, và cải thiện càng rõ khi cụm càng nhiều partition.*

Vì sao lại nhanh hơn nhiều đến vậy — quay lại đúng phần đầu bài:

```text
   ZOOKEEPER: controller mới phải ĐỌC LẠI TOÀN BỘ trạng thái
              → thời gian TỈ LỆ THUẬN với số partition

   KRAFT:     controller standby ĐÃ CÓ SẴN metadata đầy đủ trong RAM
              (nó vẫn đang kéo log metadata suốt thời gian qua)
              → chỉ cần chuyển vai trò, gần như KHÔNG PHỤ THUỘC số partition
```

Đây là khác biệt về **độ phức tạp thuật toán**, không phải khác biệt về tinh chỉnh. Đó là lý do khoảng cách giãn ra khi cụm to.

### Đính chính đi kèm: "hàng triệu partition" nghĩa là gì

Câu *"hỗ trợ mở rộng lên hàng triệu Partition"* là **mục tiêu thiết kế** của KIP-500 và đã được chứng minh trong benchmark, nhưng đừng hiểu là "cứ tạo hàng triệu partition thì ổn". Mỗi partition vẫn tốn:

- Vài file mở trên mỗi bản sao (`.log`, `.index`, `.timeindex`)
- Bộ nhớ đệm cho từng partition ở producer và consumer
- Một luồng fetch chia sẻ ở follower
- Thời gian trong mỗi lần rebalance của consumer group

Con số thực dụng cho một broker vẫn nằm trong khoảng **2.000–4.000 partition** (tính cả bản sao). "Hàng triệu" là con số **toàn cụm** với hàng trăm broker, không phải mỗi máy.

## Chuyển đổi từ ZooKeeper sang KRaft

Nếu bạn phải làm việc này ở production, đây là bức tranh tổng thể:

```text
   GIAI ĐOẠN 0 — chuẩn bị
   ├─ Nâng Kafka lên 3.5+ (chạy ở chế độ ZooKeeper)
   ├─ Nâng inter.broker.protocol.version lên phiên bản hiện tại
   └─ Kiểm tra: không dùng tính năng nào KRaft chưa hỗ trợ

   GIAI ĐOẠN 1 — dựng controller quorum
   └─ Khởi động 3 node controller với zookeeper.metadata.migration.enable=true
      → controller ĐỌC metadata từ ZooKeeper và chép vào log KRaft

   GIAI ĐOẠN 2 — chế độ kép (dual-write)
   └─ Metadata được ghi vào CẢ ZooKeeper LẪN KRaft
      → có thể quay lui an toàn nếu có vấn đề

   GIAI ĐOẠN 3 — chuyển từng broker
   └─ Khởi động lại lần lượt từng broker, bỏ zookeeper.connect,
      thêm controller.quorum.voters

   GIAI ĐOẠN 4 — chốt
   └─ Tắt chế độ migration → KHÔNG QUAY LUI ĐƯỢC NỮA
   └─ Tắt cụm ZooKeeper
```

| Điều cần biết | Chi tiết |
|---|---|
| Có phải dừng hệ thống không | **Không** — chuyển lần lượt từng máy (rolling) |
| Ứng dụng có phải sửa không | **Không một dòng nào** — client chưa bao giờ chạm ZooKeeper |
| Điểm không quay lui | Sau giai đoạn 4 |
| Phiên bản hỗ trợ chuyển đổi | Kafka 3.5 tới 3.9 |
| Kafka 4.0 | **Không có** đường chuyển đổi — phải chuyển xong ở 3.x trước khi nâng lên 4.0 |

Dòng cuối là điều đáng nhớ nhất: **không thể nhảy thẳng từ Kafka 3.x chế độ ZooKeeper lên 4.0.** Phải chuyển sang KRaft khi còn ở 3.x.

## Lệnh kiểm tra KRaft

```bash
# Xem trạng thái quorum: ai đang là leader, ai tụt sau bao nhiêu
/opt/kafka/bin/kafka-metadata-quorum.sh \
  --bootstrap-server localhost:9092 describe --status
```

```text
ClusterId:              kR9xQmT2SbGvNp8wLzYd4A
LeaderId:               1
LeaderEpoch:            7
HighWatermark:          88421
MaxFollowerLag:         0
MaxFollowerLagTimeMs:   12
CurrentVoters:          [1,2,3]
CurrentObservers:       [4,5,6]
```

Đọc từng dòng:

| Dòng | Nghĩa |
|---|---|
| `LeaderId` | Controller đang tại vị |
| `LeaderEpoch` | Số nhiệm kỳ (term) — nhảy liên tục nghĩa là bầu cử lặp lại, dấu hiệu xấu |
| `HighWatermark` | Offset metadata đã commit |
| `MaxFollowerLag` | Controller standby tụt sau bao nhiêu bản ghi. **Nên gần 0** |
| `CurrentVoters` | Các node bỏ phiếu được — chính là controller quorum |
| `CurrentObservers` | Broker thuần: **kéo metadata nhưng KHÔNG bỏ phiếu** |

Dòng cuối làm rõ một điều quan trọng: broker trong KRaft là **quan sát viên** của nhóm Raft. Chúng nhận toàn bộ log metadata nhưng không tham gia bầu cử. Đây chính là lý do "quorum quá bán" **không** áp dụng cho broker — đúng như đã đính chính ở [Bài 2](02-cluster-ha-va-scalability.md).

```bash
# Đọc thẳng nhật ký metadata ra chữ
/opt/kafka/bin/kafka-metadata-shell.sh \
  --snapshot /var/lib/kafka/data/__cluster_metadata-0/*.checkpoint
```

```text
>> ls /
brokers  topics  configs  clientQuotas  acls
>> ls /topics
order-events  payment-events  __consumer_offsets
>> cat /topics/order-events/0/data
{
  "partitionId": 0,
  "replicas": [1, 2, 3],
  "isr": [1, 2, 3],
  "leader": 1,
  "leaderEpoch": 4
}
```

Công cụ này cho bạn nhìn thẳng vào "bộ não" của cụm — thứ tương đương với `zkCli.sh` thời ZooKeeper.

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| "Raft bầu partition leader" | Raft bầu **controller**. Controller **chọn** partition leader từ ISR — xem [Bài 5](05-leader-follower-isr-va-luong-ghi.md) |
| "Failover KRaft chỉ vài mili giây" | Thời gian đổi controller là **dưới một giây tới vài giây**. Vài mili giây là con số bị thổi phồng |
| "KRaft hỗ trợ hàng triệu partition nên tạo bao nhiêu cũng được" | Đó là con số **toàn cụm**. Mỗi broker vẫn nên giữ trong khoảng 2.000–4.000 bản sao partition |
| Dùng 2 hoặc 4 controller | Số chẵn không tăng khả năng chịu đựng. Dùng **3 hoặc 5** |
| "Broker cũng bỏ phiếu trong quorum" | Broker là **observer** — kéo metadata, không bỏ phiếu |
| Nhảy thẳng từ ZooKeeper 3.x lên Kafka 4.0 | Không có đường. Phải chuyển sang KRaft **khi còn ở 3.x** |
| Gộp controller và broker ở cụm lớn | Broker quá tải kéo controller chậm theo. Production lớn nên **tách** |
| Bỏ qua `MaxFollowerLag` | Controller standby tụt sau nghĩa là failover sẽ chậm. Cảnh báo khi khác 0 kéo dài |
| `LeaderEpoch` nhảy liên tục mà bỏ qua | Dấu hiệu bầu cử lặp — thường do mạng chập chờn hoặc GC dừng dài |

## Tóm tắt bài 7

- **Đồng thuận** là bài toán "nhiều máy cùng đồng ý một giá trị dù có máy chết và mạng không tin được". Raft ra đời năm 2014 với mục tiêu tường minh là **dễ hiểu hơn Paxos**.
- Raft có **ba trạng thái** (follower / candidate / leader) và một **term** (nhiệm kỳ) tăng dần. Quy tắc nền: gặp term lớn hơn thì lập tức lùi về follower — đây là thứ chặn split-brain mà không cần "giết" ai.
- Bầu cử dùng **thời gian chờ ngẫu nhiên** để tránh chia phiếu, và cử tri **kiểm tra log của ứng viên** trước khi bỏ phiếu → **kẻ thiếu dữ liệu không bao giờ lên leader**.
- Sao chép nhật ký dùng kiểm tra `(index, term)` của bản ghi liền trước → sinh ra **Log Matching Property**: khớp một điểm là khớp cả quá khứ.
- Raft ánh xạ gần như một-một sang Kafka partition: **term ↔ leader epoch, commit index ↔ high watermark**. Khác biệt: **Raft dùng quá bán, Kafka dùng ISR** (nới lỏng hơn để lấy thông lượng).
- **KRaft biến metadata thành một topic**: `__cluster_metadata`, một partition, nhân bản trên controller quorum. Metadata từ **trạng thái** thành **nhật ký có offset** — chính triết lý Kafka áp dụng cho Kafka.
- Nhờ đó: broker đọc metadata **gia tăng**, controller standby luôn có sẵn bản đầy đủ trong RAM, nên đổi controller gần như **không phụ thuộc số partition**.
- **Đính chính số liệu**: phục hồi sau tắt đột ngột trên cụm 2 triệu partition rút từ ~503 giây xuống ~37 giây (benchmark Confluent); đổi controller từ hàng chục giây xuống **dưới một giây**. **Không phải "vài mili giây"**.
- **Broker là observer** trong nhóm Raft — kéo metadata nhưng không bỏ phiếu. Đây là lý do quorum không ràng buộc số broker.
- Chuyển đổi ZooKeeper → KRaft làm được **không cần dừng hệ thống, không cần sửa code ứng dụng**, nhưng **phải làm xong khi còn ở Kafka 3.x** vì 4.0 không còn đường chuyển.
- Lệnh cần thuộc: `kafka-metadata-quorum.sh --status` và `kafka-metadata-shell.sh`.

**Bài kế tiếp** → [Bài 8: Vòng đời một broker — tham gia cụm, nhịp tim, rời cụm](08-cluster-membership-va-vong-doi-broker.md)
