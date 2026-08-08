# Bài 2: Cluster là gì — High Availability và Scalability giải nghĩa tận gốc

Hai chữ **HA** và **scalability** bị nói nhiều tới mức mất nghĩa. Người ta gật gù "cluster để HA và scale" rồi đi tiếp, mà không trả lời được những câu hỏi cụ thể: *cụm 3 máy chịu được mấy máy chết? Vì sao lại là 3 mà không phải 2 hay 4? Đặt 3 máy ở 3 trung tâm dữ liệu có thật sự tốt hơn không?*

Bài này trả lời từng câu, bằng số. Và sửa lại hai chỗ mà rất nhiều tài liệu tiếng Việt nói sai: **scale-in không phải scale-up**, và **con số 3 máy không áp dụng cho broker**.

## Cluster — định nghĩa và cái nó thật sự đổi

> **Cluster** (cụm) = nhiều máy chủ chạy cùng một phần mềm, **biết về sự tồn tại của nhau**, và cùng phục vụ như thể chúng là một hệ thống duy nhất.

Chữ quan trọng nhất là "biết về nhau". Ba máy chạy Kafka mà không cấu hình cho nhận nhau thì đó là ba hệ thống riêng biệt, không phải cluster.

```text
   KHÔNG PHẢI CLUSTER                      LÀ CLUSTER
   ══════════════════                      ══════════

   ┌──────┐  ┌──────┐  ┌──────┐            ┌──────┐◄──►┌──────┐
   │Kafka │  │Kafka │  │Kafka │            │Kafka │    │Kafka │
   │  A   │  │  B   │  │  C   │            │  A   │◄─┐ │  B   │
   └──────┘  └──────┘  └──────┘            └──────┘  │ └──────┘
      ▲         ▲         ▲                    ▲     │    ▲
      │         │         │                    └──┐  │  ┌─┘
   Ứng dụng phải tự chọn                          ▼  ▼  ▼
   gọi máy nào, tự xử lý                        ┌──────┐
   khi máy đó chết                              │Kafka │
                                                │  C   │
                                                └──────┘
                                                    ▲
                                          Ứng dụng gọi BẤT KỲ máy nào
                                          → nhận về bản đồ toàn cụm
                                          → tự định tuyến đúng chỗ
```

Hệ quả thực tế quan trọng nhất, và cũng là điều làm Kafka dễ chịu khi lập trình:

> Từ góc nhìn ứng dụng, cụm 1 máy và cụm 100 máy là **giống hệt nhau**. Code không đổi một dòng. Bạn chỉ đổi `bootstrap.servers` trong file cấu hình.

Đây không phải chuyện nhỏ. So với việc phải tự viết logic "thử máy A, lỗi thì thử máy B", Kafka client làm sẵn toàn bộ: nhận metadata, cache lại, tự định tuyến, tự làm mới khi có máy chết. Sẽ mổ xẻ cơ chế này ở [Bài 7](09-failover-thuc-hanh-va-so-lieu.md).

## High Availability — "chịu được mấy máy chết" là câu hỏi đúng

**HA** (High Availability — tính sẵn sàng cao) nghĩa là: **một thành phần hỏng không làm cả hệ thống ngừng phục vụ.**

Câu hỏi mơ hồ: "hệ thống này có HA không?" — vô nghĩa, vì HA không phải trạng thái bật/tắt.

Câu hỏi đúng: **"hệ thống này chịu được đồng thời bao nhiêu máy chết mà vẫn nhận được dữ liệu?"** — trả lời được bằng một con số.

### Đo HA của Kafka bằng công thức

Với Kafka, con số đó phụ thuộc **ba tham số**, không phải số máy:

```text
   RF  = replication.factor        (số bản sao của mỗi partition)
   ISR = min.insync.replicas       (số bản sao tối thiểu phải đồng bộ mới cho ghi)
   N   = số broker trong cụm

   ĐỌC được khi:  còn ≥ 1 bản sao sống của partition đó
   GHI được khi:  số bản sao đang đồng bộ ≥ min.insync.replicas
                  (chỉ áp dụng khi producer dùng acks=all)
```

Bảng tra cho cụm 3 broker — đây là bảng đáng thuộc:

| RF | min.insync.replicas | acks | Chết 1 broker | Chết 2 broker | Nguy cơ mất dữ liệu |
|---|---|---|---|---|---|
| 1 | 1 | all | **Mất partition** trên broker đó | Mất nhiều hơn | Rất cao. Cấm dùng ở production |
| 2 | 1 | all | Vẫn ghi + đọc | Có thể mất partition | Cao — ghi được cả khi chỉ còn 1 bản sao |
| 3 | 1 | all | Vẫn ghi + đọc | Vẫn ghi + đọc | Trung bình — ghi được khi chỉ còn 1 bản |
| **3** | **2** | **all** | **Vẫn ghi + đọc** | **CHỈ đọc được, ghi bị từ chối** | **Thấp — cấu hình chuẩn production** |
| 3 | 3 | all | **Ghi bị từ chối ngay** | Ghi bị từ chối | Rất thấp nhưng quá mong manh |

Đọc dòng in đậm cho kỹ, vì nó là lựa chọn mặc định của mọi hệ thống nghiêm túc:

- **RF=3** → mỗi partition có 3 bản. Chịu được 2 máy chết mà **dữ liệu vẫn còn**.
- **min.insync.replicas=2** → phải có ít nhất 2 bản đồng bộ mới cho ghi. Chết 1 máy: còn 2 bản, vẫn ghi bình thường. Chết 2 máy: còn 1 bản, Kafka **chủ động từ chối ghi** với lỗi `NOT_ENOUGH_REPLICAS`.

Tại sao từ chối ghi lại là điều tốt? Vì nếu cho ghi khi chỉ còn 1 bản, và đúng cái máy đó cũng chết ngay sau đó, dữ liệu **mất vĩnh viễn và không ai biết**. Từ chối ghi là chọn *"báo lỗi rõ ràng"* thay vì *"âm thầm mất tiền của khách"*. Với hệ thống ngân hàng đây là lựa chọn duy nhất chấp nhận được.

Dòng cuối bảng (`min.insync.replicas=3`) giải thích vì sao không nên tham lam: đặt bằng RF thì **chỉ cần một máy đi bảo trì là toàn bộ ghi dừng lại**. Quy tắc: `min.insync.replicas = RF - 1`.

### Nhiều trung tâm dữ liệu — lợi và giá phải trả

Đặt cả 3 máy trong một trung tâm dữ liệu (**data center**, DC) vẫn là cluster, nhưng có một điểm chết chung: mất điện toàn DC, cháy, lụt, đứt cáp đầu vào → mất cả 3.

```text
   PHƯƠNG ÁN A — một DC
   ┌─────────── DC Hà Nội ───────────┐
   │  ┌────┐   ┌────┐   ┌────┐       │      Độ trễ giữa các máy: ~0,2 ms
   │  │ B1 │   │ B2 │   │ B3 │       │      Chết cả DC → mất tất
   │  └────┘   └────┘   └────┘       │
   └─────────────────────────────────┘

   PHƯƠNG ÁN B — nhiều vùng sẵn sàng (Availability Zone) cùng vùng địa lý
   ┌── AZ-a ──┐  ┌── AZ-b ──┐  ┌── AZ-c ──┐
   │  ┌────┐  │  │  ┌────┐  │  │  ┌────┐  │   Độ trễ: ~1 ms
   │  │ B1 │  │  │  │ B2 │  │  │  │ B3 │  │   Chết 1 AZ → vẫn chạy
   │  └────┘  │  │  └────┘  │  │  └────┘  │   Cùng vùng nên chịu chung
   └──────────┘  └──────────┘  └──────────┘   sự cố cấp vùng

   PHƯƠNG ÁN C — nhiều vùng địa lý (region)
   ┌── Singapore ──┐          ┌── Tokyo ──┐
   │   ┌────┐      │          │   ┌────┐  │   Độ trễ: ~70 ms
   │   │ B1 │      │  ~70 ms  │   │ B2 │  │   Chịu được thảm hoạ cấp vùng
   │   └────┘      │◄────────►│   └────┘  │   NHƯNG ghi acks=all rất chậm
   └───────────────┘          └───────────┘
```

Đây là chỗ transcript gốc nói *"đặt 1 máy ở DC A, 1 máy ở DC B để tăng HA rất nhiều"* — ý đúng nhưng **thiếu mất phần giá phải trả**, và phần đó mới là phần quyết định trong thực tế:

| Cách bố trí | Độ trễ giữa các bản sao | Ảnh hưởng lên `acks=all` | Ai nên dùng |
|---|---|---|---|
| Cùng một DC / một AZ | ~0,1–0,5 ms | Gần như không đáng kể | Dev, staging, hệ thống chấp nhận mất DC |
| Nhiều AZ, cùng region | ~0,5–2 ms | Mỗi lần ghi cộng thêm ~1–2 ms | **Mặc định cho production trên cloud** |
| Nhiều region | 30–200 ms | Mỗi lần ghi cộng thêm 30–200 ms → thông lượng sụp | Gần như **không ai** trải một cụm qua nhiều region |

Điểm mấu chốt mà transcript không nói: **`acks=all` bắt producer chờ mọi bản sao trong ISR xác nhận**. Nếu một bản sao nằm ở Tokyo còn leader ở Singapore, mỗi message phải chịu trọn một vòng khứ hồi 70 ms. Producer đồng bộ sẽ tụt từ hàng chục nghìn message/giây xuống còn khoảng 14 message/giây cho mỗi luồng.

Vì vậy **cách làm chuẩn trong ngành không phải trải một cụm qua nhiều region**, mà là:

```text
   Cụm Singapore (3 AZ)              Cụm Tokyo (3 AZ)
   ┌────┐ ┌────┐ ┌────┐              ┌────┐ ┌────┐ ┌────┐
   │ B1 │ │ B2 │ │ B3 │              │ B1 │ │ B2 │ │ B3 │
   └────┘ └────┘ └────┘              └────┘ └────┘ └────┘
      │                                       ▲
      └──── MirrorMaker 2 ────────────────────┘
            (sao chép BẤT ĐỒNG BỘ giữa hai cụm)

   Ghi ở Singapore: nhanh (chỉ chờ 3 AZ nội vùng)
   Tokyo tụt sau vài trăm ms — chấp nhận được cho thảm hoạ
```

**MirrorMaker 2** là công cụ chính thức của Kafka để sao chép giữa hai cụm. Nó sao chép **bất đồng bộ**, nên không kéo tụt độ trễ ghi.

### Rack awareness — HA "miễn phí" mà nhiều người bỏ quên

Kafka có một tham số ít được nhắc mà lại rất giá trị:

```properties
broker.rack=ap-southeast-1a
```

Khai báo broker này nằm ở rack (hoặc AZ) nào. Khi đó controller sẽ **cố ý trải các bản sao của một partition ra các rack khác nhau**:

```text
   KHÔNG có broker.rack — controller không biết gì về vị trí vật lý
   Partition 0: bản sao ở B1, B2  ← cả hai lại tình cờ cùng một rack
   → Rack đó mất điện = mất cả 2 bản = partition chết

   CÓ broker.rack — controller trải bản sao ra khác rack
   Partition 0: bản sao ở B1 (rack a), B2 (rack b), B3 (rack c)
   → Mất trọn một rack vẫn còn 2 bản
```

Một dòng cấu hình, đổi từ "có thể mất partition khi mất một rack" thành "chắc chắn không mất". Nên đặt ở **mọi** cụm production nhiều AZ.

## Scalability — và chỗ mà rất nhiều tài liệu nói sai

### Đính chính thuật ngữ: scale-in KHÔNG phải scale-up

Đây là lỗi rất phổ biến, kể cả trong transcript gốc của bài giảng này. Có **hai trục** mở rộng, mỗi trục có hai chiều:

```text
                         TĂNG                      GIẢM
                    ┌──────────────┐         ┌──────────────┐
   TRỤC DỌC         │   SCALE-UP   │         │  SCALE-DOWN  │
   (vertical)       │              │         │              │
   Máy khoẻ hơn     │ 8GB → 32GB   │         │ 32GB → 8GB   │
                    │ 4 CPU → 16   │         │ 16 CPU → 4   │
                    └──────────────┘         └──────────────┘

                    ┌──────────────┐         ┌──────────────┐
   TRỤC NGANG       │  SCALE-OUT   │         │  SCALE-IN    │
   (horizontal)     │              │         │              │
   Nhiều máy hơn    │ 3 máy → 10   │         │ 10 máy → 3   │
                    └──────────────┘         └──────────────┘
```

| Thuật ngữ | Nghĩa | Cặp đối lập của nó |
|---|---|---|
| **Scale-up** | Nâng cấp phần cứng **một máy** | Scale-down |
| **Scale-out** | Thêm **số lượng máy** | **Scale-in** |

Nói "scale-in / scale-out (hoặc hiểu là scale-up / scale-out)" là gộp nhầm hai khái niệm ngược nhau. **Scale-in là giảm số máy**, tức là ngược với scale-out chứ không liên quan gì tới scale-up.

### Vì sao scale-up luôn đụng trần

Ví dụ cụ thể: máy chủ 8 GB RAM, ứng dụng Java bị tràn vùng nhớ heap khi lượng request tăng.

```text
   8 GB  →  16 GB  →  32 GB  →  64 GB  →  ???

   Trần cứng chặn ở đâu:
   ├─ Số khe cắm RAM trên bo mạch chủ (thường 4, 8, hoặc 16 khe)
   ├─ Dung lượng tối đa mỗi thanh RAM mà bo mạch hỗ trợ
   ├─ Giới hạn của chính CPU (địa chỉ hoá bộ nhớ)
   └─ Giá tiền: mỗi lần gấp đôi RAM thì giá thường HƠN gấp đôi
```

Ba vấn đề của scale-up mà transcript có nhắc một (giới hạn phần cứng) nhưng bỏ qua hai cái còn lại — và hai cái bỏ qua mới là lý do thật sự khiến hệ thống lớn không đi đường này:

**Một — giá tăng phi tuyến.** Máy 64 GB không đắt gấp 8 lần máy 8 GB, nó đắt gấp 15–20 lần. Phân khúc máy chủ cao cấp bị tính giá theo kiểu khác hẳn.

**Hai — vẫn là một điểm chết duy nhất.** Nâng máy từ 8 GB lên 256 GB thì nó vẫn là **một** máy. Nó chết là mất tất. Scale-up **không hề tăng HA**, thậm chí còn nguy hiểm hơn vì bạn dồn nhiều trứng hơn vào một giỏ.

**Ba — phải dừng máy để nâng cấp.** Cắm thêm RAM nghĩa là tắt máy. Trên cloud thì đổi loại máy cũng phải khởi động lại instance. Là thời gian ngừng phục vụ có kế hoạch, và với hệ thống stateful như Kafka thì mỗi lần khởi động lại là một lần rebalance.

### Scale-out và cái giá của nó

Thay 1 máy 8 GB bằng 5 máy 4 GB:

| | Scale-up | Scale-out |
|---|---|---|
| Trần | Có, cứng | Gần như không (thêm máy là được) |
| Chi phí | Phi tuyến, tăng vọt | Gần tuyến tính |
| Tính sẵn sàng | Không cải thiện | **Cải thiện thật** — 1 máy chết còn 4 |
| Nâng cấp | Phải dừng máy | Thêm/bớt máy khi đang chạy |
| Độ phức tạp | Thấp | **Cao** — phải giải bài phân tán |
| Vấn đề mới sinh ra | Không | Đồng thuận, phân vùng mạng, dữ liệu không nhất quán, đồng bộ đồng hồ |

Dòng cuối là phần transcript gốc bỏ hẳn, và là phần đắt nhất. Scale-out **không miễn phí**: bạn đổi một bài toán phần cứng (đơn giản, tốn tiền) lấy một bài toán phần mềm phân tán (rẻ tiền phần cứng, nhưng khó khủng khiếp). Toàn bộ ZooKeeper, KRaft, Raft, ISR, leader election trong các bài sau **tồn tại chỉ để trả giá cho quyết định scale-out này**.

## "Vì sao tối thiểu 3 máy" — đính chính quan trọng nhất bài này

Câu "cụm Kafka tối thiểu 3 máy vì liên quan tới thuật toán Raft và cơ chế đồng thuận" là **đúng một nửa và sai một nửa**, nên rất dễ dẫn tới cấu hình sai.

### Nửa đúng: quorum áp dụng cho CONTROLLER

**Quorum** (số đại biểu tối thiểu) là số phiếu cần có để một quyết định được coi là hợp lệ. Với Raft, quorum = **đa số quá bán**:

```text
   quorum = ⌊N/2⌋ + 1

   N=1  → quorum 1  → chịu được 0 máy chết
   N=2  → quorum 2  → chịu được 0 máy chết   ← 2 máy VÔ DỤNG
   N=3  → quorum 2  → chịu được 1 máy chết
   N=4  → quorum 3  → chịu được 1 máy chết   ← 4 máy KHÔNG hơn 3 máy
   N=5  → quorum 3  → chịu được 2 máy chết
```

Hai điều rút ra:

**Số chẵn là lãng phí.** Cụm 4 controller chịu đựng đúng bằng cụm 3, mà tốn thêm một máy và thêm một điểm hỏng. Vì vậy quorum luôn là **số lẻ: 3 hoặc 5**.

**Vì sao phải quá bán.** Để chống **split-brain** (não chẻ đôi) — tình huống mạng đứt làm cụm tách thành hai nhóm, mỗi nhóm tưởng nhóm kia đã chết và tự bầu ra một trưởng nhóm. Hai trưởng nhóm cùng nhận ghi thì dữ liệu phân kỳ vĩnh viễn.

```text
   Cụm 3 controller, mạng đứt tách thành 2 nhóm
   ═══════════════════════════════════════════

   ┌── Nhóm A ──┐   ✂ mạng đứt ✂   ┌──── Nhóm B ────┐
   │  C1        │                   │  C2      C3    │
   │  1 phiếu   │                   │  2 phiếu       │
   └────────────┘                   └────────────────┘
     1 < quorum(2)                    2 >= quorum(2)
     → KHÔNG được bầu leader          → ĐƯỢC bầu leader
     → tự nhận mình là thiểu số       → tiếp tục phục vụ
     → ngừng nhận ghi

   Vì tổng chỉ có 3 phiếu, KHÔNG BAO GIỜ tồn tại hai nhóm
   cùng có quá bán. Split-brain bị chặn về mặt toán học.
```

Đó chính là lý do con số 3 tồn tại — và nó áp dụng cho **controller quorum**, tức là các node có `process.roles` chứa `controller`.

### Nửa sai: broker KHÔNG bị ràng buộc bởi quorum

Đây là chỗ dễ hiểu lầm nhất, và hiểu lầm này dẫn thẳng tới cấu hình sai ở production.

| | Controller quorum | Broker |
|---|---|---|
| Có dùng bầu cử quá bán không? | **Có** — Raft | **Không** |
| Số lượng nên là | **Lẻ: 3 hoặc 5** | Bất kỳ: 3, 4, 7, 40, 100 |
| Chết quá nửa thì sao | Cụm mất khả năng thay đổi metadata | Không có khái niệm "quá nửa" |
| Cái gì quyết định chịu đựng | Công thức quorum | **RF và `min.insync.replicas`** |

Cụ thể: cụm có 3 broker, RF=3, `min.insync.replicas=2`. Chết 2 broker thì **vẫn đọc được bình thường** — leader mới được bầu từ bản sao còn sống, consumer vẫn poll ra dữ liệu. Chỉ **ghi** mới bị chặn, và bị chặn vì `min.insync.replicas=2` không thoả, **không phải** vì "thiếu quorum Raft".

Ngược lại, cụm 40 broker mà cả 40 đều là broker thuần (controller nằm riêng 3 máy) thì chết 20 broker cũng chẳng liên quan gì tới quorum — chỉ những partition có toàn bộ bản sao nằm trên 20 máy chết mới bị ảnh hưởng.

> **Cách nhớ**: quorum bảo vệ **metadata** (ai là leader, topic nào có partition nào). RF và `min.insync.replicas` bảo vệ **dữ liệu**. Hai lớp khác nhau, đừng trộn.

Thí nghiệm này sẽ được làm bằng tay ở [Bài 7](09-failover-thuc-hanh-va-so-lieu.md), có đầy đủ output thật.

## Ba trục độc lập — bảng cần thuộc lòng

Đây là mô hình tư duy gọn nhất về việc mở rộng Kafka:

```text
   ┌──────────────┬────────────────────┬──────────────────────────────┐
   │   Số BROKER  │  →  DUNG LƯỢNG     │  Tổng CPU, RAM, disk của cụm │
   ├──────────────┼────────────────────┼──────────────────────────────┤
   │  Số PARTITION│  →  KHẢ NĂNG SCALE │  Mức song song cho 1 topic   │
   ├──────────────┼────────────────────┼──────────────────────────────┤
   │  REPLICATION │  →  TÍNH SẴN SÀNG  │  Chịu được mấy broker chết   │
   └──────────────┴────────────────────┴──────────────────────────────┘
```

Ba trục **độc lập nhau**. Sai lầm hay gặp là chỉnh nhầm trục:

| Triệu chứng | Chỉnh sai | Chỉnh đúng |
|---|---|---|
| Consumer xử lý không kịp, lag phình | Thêm broker | **Thêm partition** rồi thêm consumer instance |
| Đĩa cụm sắp đầy | Thêm partition | **Thêm broker** (hoặc giảm retention) |
| Sợ mất dữ liệu khi máy chết | Thêm partition | **Tăng RF** + đặt `min.insync.replicas` |
| Một broker CPU 95%, các broker khác rảnh | Thêm broker | Kiểm tra **phân bố leader** — có thể lệch, dùng `kafka-leader-election.sh` |

Dòng cuối là bẫy thật hay gặp: thêm broker vào cụm **không tự động** chuyển dữ liệu cũ sang. Broker mới sẽ rỗng cho tới khi bạn chạy `kafka-reassign-partitions.sh` để phân bố lại. Đây là điểm khác biệt lớn giữa hệ thống stateful (Kafka) và stateless (Spring Boot microservice), nơi thêm instance là có hiệu lực ngay.

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| Cụm 2 broker cho "HA" | Quorum 2 chịu được 0 máy chết; RF=2 + minISR=2 thì chết 1 máy là ngừng ghi | Tối thiểu 3 |
| Cụm 4 hoặc 6 controller cho "chắc ăn hơn" | Số chẵn không tăng khả năng chịu đựng | 3 hoặc 5 controller |
| `min.insync.replicas` = RF | Một máy bảo trì là ngừng ghi toàn hệ thống | Đặt `RF - 1` |
| Trải một cụm qua nhiều region | Mỗi lần ghi `acks=all` cộng thêm 30–200 ms | Mỗi region một cụm + MirrorMaker 2 |
| Quên `broker.rack` trên cloud nhiều AZ | Các bản sao có thể dồn vào một AZ | Đặt `broker.rack` bằng tên AZ |
| Thêm broker rồi tưởng tải tự cân bằng | Broker mới rỗng, không nhận partition cũ | Chạy `kafka-reassign-partitions.sh` |
| Tăng partition để tăng độ bền | Partition không liên quan tới độ bền | Tăng RF |

## Tóm tắt bài 2

- **Cluster** = nhiều máy biết về nhau, phục vụ như một. Với Kafka, ứng dụng viết code y hệt cho cụm 1 máy và 100 máy.
- **HA không phải trạng thái bật/tắt**. Hỏi đúng là "chịu được mấy máy chết", và câu trả lời do **RF** và **`min.insync.replicas`** quyết định, không phải số broker.
- Cấu hình chuẩn production: **RF=3, `min.insync.replicas=2`, `acks=all`** — chết 1 máy vẫn ghi bình thường, chết 2 máy thì từ chối ghi (cố ý) nhưng vẫn đọc được.
- **Đính chính**: **scale-in là ngược của scale-out** (giảm số máy), **không phải** đồng nghĩa với scale-up. Cặp đúng: scale-up/scale-down (trục dọc), scale-out/scale-in (trục ngang).
- Scale-up đụng trần phần cứng, giá phi tuyến, và **không tăng HA**. Scale-out mở rộng gần như vô hạn nhưng phải trả giá bằng độ phức tạp của hệ phân tán.
- **Đính chính quan trọng**: con số "tối thiểu 3 máy vì Raft" chỉ áp dụng cho **controller quorum** (nên là số lẻ 3 hoặc 5). **Broker không dùng quorum** — khả năng chịu đựng của broker do RF và `min.insync.replicas` quyết định.
- Nhiều AZ cùng region là mặc định hợp lý (+1–2 ms). Nhiều region thì tách cụm và dùng **MirrorMaker 2**, đừng trải một cụm.
- Ba trục độc lập: **broker → dung lượng, partition → khả năng scale, replication → tính sẵn sàng**. Chỉnh đúng trục cho đúng triệu chứng.

**Bài kế tiếp** → [Bài 3: Đối chiếu MySQL để hiểu Kafka — replica, binlog, sharding](03-doi-chieu-mysql-de-hieu-kafka.md)
