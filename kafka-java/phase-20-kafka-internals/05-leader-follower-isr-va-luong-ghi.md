# Bài 5: Leader, Follower, ISR và đường đi thật của một lệnh ghi

Mô tả phổ biến về replication của Kafka nghe như thế này:

> *"Từ Broker Leader, dữ liệu được ghi log rồi replicate sang các Broker Replica còn lại."*

Câu này vẽ ra hình ảnh leader **đẩy** dữ liệu sang follower. Hình ảnh đó **sai chiều**, và cái sai chiều này kéo theo một loạt hiểu nhầm: không giải thích được ISR là gì, không giải thích được vì sao follower tụt lại thì bị đá ra, không giải thích được vì sao `acks=all` lại có độ trễ như vậy.

Sự thật: **follower chủ động đi kéo (fetch) dữ liệu từ leader, y hệt như một consumer bình thường.** Leader không đẩy gì cả.

Bài này đi theo đúng đường đi của một message, từ lúc bạn gọi `send()` tới lúc consumer đọc được nó, và giải nghĩa mọi cơ chế gặp trên đường.

## Đính chính: follower KÉO, không phải leader ĐẨY

```text
   MÔ HÌNH SAI — leader đẩy
   ════════════════════════
        ┌────────┐  push   ┌──────────┐
        │ LEADER │ ──────► │ FOLLOWER │
        └────────┘         └──────────┘

   Nếu đúng vậy thì: leader phải nhớ follower đã nhận tới đâu,
   phải quản lý retry khi follower chậm, phải có bộ đệm riêng
   cho từng follower. Rất phức tạp.

   MÔ HÌNH ĐÚNG — follower kéo
   ═══════════════════════════
        ┌────────┐         ┌──────────┐
        │ LEADER │ ◄────── │ FOLLOWER │  "cho tôi dữ liệu từ offset 105"
        │        │ ──────► │          │  "đây, offset 105 tới 130"
        └────────┘  trả về └──────────┘
                             (FetchRequest — CÙNG giao thức consumer dùng)
```

Follower gửi **FetchRequest** lên leader, đúng loại request mà consumer dùng, chỉ khác một cờ đánh dấu "tôi là replica". Vòng lặp này chạy liên tục.

Vì sao thiết kế kéo lại tốt hơn đẩy — bốn lý do:

| Lý do | Giải thích |
|---|---|
| **Follower tự điều tiết tốc độ** | Follower chậm thì kéo thưa hơn. Leader không cần biết, không cần bộ đệm riêng cho ai |
| **Dùng lại đúng một đường code** | Fetch của follower và fetch của consumer là cùng một cơ chế. Ít code hơn, ít lỗi hơn |
| **Vị trí đọc do người đọc giữ** | Follower tự nhớ mình cần offset nào. Leader không phải theo dõi |
| **Bắt kịp sau khi chết dễ dàng** | Follower sống lại chỉ cần fetch từ offset cũ. Không cần bắt tay phức tạp |

Đây chính là **cùng một triết lý** đã bàn ở [Bài 1](01-vi-sao-kafka-ra-doi-tai-linkedin.md): dời trách nhiệm theo dõi vị trí từ bên gửi sang bên nhận. Kafka áp dụng nguyên tắc đó **hai lần** — cho consumer, và cho follower.

> **Điểm dễ nhớ**: trong Kafka, **không có ai đẩy dữ liệu cho ai**. Producer đẩy vào leader (đó là lần đẩy duy nhất). Sau đó mọi thứ đều là kéo.

## Đường đi đầy đủ của một message

```text
 ┌─ ỨNG DỤNG ─────────────────────────────────────────────────────────┐
 │  producer.send(new ProducerRecord<>("order-events","KH-042", order))│
 └───────────────────────────┬────────────────────────────────────────┘
                             ▼
 ┌─ TRONG THƯ VIỆN CLIENT (vẫn ở tiến trình ứng dụng) ────────────────┐
 │  1. Serializer      biến key và value thành mảng byte              │
 │  2. Partitioner     murmur2("KH-042") % 3 = 1  → partition 1       │
 │  3. RecordAccumulator  bỏ vào lô (batch) của partition 1           │
 │     Lô được gửi đi khi: đầy batch.size (16 KB)                     │
 │                    HOẶC đợi đủ linger.ms                           │
 │  4. Sender thread   tra metadata: leader của P1 là broker 2        │
 │                     → mở kết nối tới broker 2, gửi ProduceRequest  │
 └───────────────────────────┬────────────────────────────────────────┘
                             ▼
 ┌─ BROKER 2 (leader của partition 1) ────────────────────────────────┐
 │  5. Kiểm tra: tôi có đúng là leader không?                         │
 │     Không → trả lỗi NOT_LEADER_OR_FOLLOWER                         │
 │  6. Kiểm tra: |ISR| >= min.insync.replicas?                        │
 │     Không → trả lỗi NOT_ENOUGH_REPLICAS (khi acks=all)             │
 │  7. Nối lô vào cuối file .log của partition 1  → ghi vào PAGE CACHE │
 │  8. LEO của leader tăng: 105 → 130                                 │
 │  9. Nếu acks=1 → TRẢ VỀ NGAY cho producer tại đây                  │
 │     Nếu acks=all → GIỮ request lại, chờ ở bước 12                  │
 └───────────────────────────┬────────────────────────────────────────┘
                             ▼
 ┌─ FOLLOWER (broker 1 và broker 3) ──────────────────────────────────┐
 │ 10. Vòng lặp fetch đang chạy sẵn: "cho tôi từ offset 105"          │
 │ 11. Nhận 105..130, ghi vào .log của mình, LEO của mình lên 130     │
 │     Lần fetch KẾ TIẾP xin từ 130 → đó chính là lời báo             │
 │     "tôi đã có tới 130 rồi"                                        │
 └───────────────────────────┬────────────────────────────────────────┘
                             ▼
 ┌─ BROKER 2 (leader) tính lại ───────────────────────────────────────┐
 │ 12. High Watermark = LEO NHỎ NHẤT trong toàn bộ ISR                │
 │     leader=130, f1=130, f3=130  → HW = 130                         │
 │ 13. HW đã vượt offset của lô đang chờ → TRẢ VỀ cho producer        │
 │ 14. Từ giờ consumer mới ĐƯỢC PHÉP đọc tới offset 130               │
 └────────────────────────────────────────────────────────────────────┘
```

Bốn chỗ đáng dừng lại kỹ, và đó là bốn phần tiếp theo của bài.

## LEO và High Watermark — hai con số quyết định mọi thứ

Đây là cặp khái niệm quan trọng nhất của replication Kafka, và cũng là cặp hầu như không được nhắc trong tài liệu nhập môn.

| Ký hiệu | Tên đầy đủ | Nghĩa |
|---|---|---|
| **LEO** | Log End Offset | Offset **kế tiếp sẽ được ghi** vào bản sao này. Mỗi bản sao có LEO riêng |
| **HW** | High Watermark | Offset cao nhất mà **mọi bản sao trong ISR đều đã có**. Consumer chỉ được đọc tới đây |

```text
   Partition 1, RF=3, ISR = {leader, f1, f3}
   ═════════════════════════════════════════

   LEADER (broker 2)
   ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐
   │100│101│102│103│104│105│106│107│108│109│      LEO = 110
   └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘

   FOLLOWER f1 (broker 1)
   ┌───┬───┬───┬───┬───┬───┬───┬───┐
   │100│101│102│103│104│105│106│107│              LEO = 108
   └───┴───┴───┴───┴───┴───┴───┴───┘

   FOLLOWER f3 (broker 3)
   ┌───┬───┬───┬───┬───┬───┬───┐
   │100│101│102│103│104│105│106│                  LEO = 107
   └───┴───┴───┴───┴───┴───┴───┘

   High Watermark = min(110, 108, 107) = 107
                                          ▲
   ┌────────────────────────────────┬─────┴──────────────────┐
   │  offset 100..106                │  offset 107..109       │
   │  ĐÃ AN TOÀN                     │  CHƯA an toàn          │
   │  mọi bản sao đều có             │  chỉ leader (và f1) có │
   │  Consumer ĐỌC ĐƯỢC              │  Consumer KHÔNG THẤY   │
   └────────────────────────────────┴────────────────────────┘
```

### Vì sao consumer bị chặn ở High Watermark

Đây là một trong những quyết định thiết kế đẹp nhất của Kafka. Giả sử không có chặn:

```text
   KỊCH BẢN NẾU CONSUMER ĐƯỢC ĐỌC QUÁ HW
   ═════════════════════════════════════

   t=0   Leader có offset 100..109. Follower mới có tới 106.
   t=1   Consumer đọc được tới 109, xử lý xong, commit offset 110.
         → Hệ thống hạ nguồn đã trừ kho, đã gửi email cho khách.
   t=2   LEADER CHẾT.
   t=3   Controller bầu f1 (chỉ có tới 107) làm leader mới.
   t=4   Leader mới có LEO = 108. Offset 108, 109 KHÔNG TỒN TẠI NỮA.

   Kết quả: consumer đã xử lý hai sự kiện mà bây giờ
   KHÔNG CÒN TRONG HỆ THỐNG. Không thể phát lại, không thể đối soát.
   Đây là "phantom read" ở mức hệ thống phân tán — bẩn nhất có thể.
```

Chặn ở HW loại bỏ hoàn toàn kịch bản này:

> **Consumer chỉ nhìn thấy dữ liệu đã được nhân bản đủ.** Bất cứ thứ gì consumer đã đọc thì chắc chắn sống sót qua việc đổi leader.

Đây cũng là câu trả lời cho câu hỏi ở [Bài 3](03-doi-chieu-mysql-de-hieu-kafka.md): vì sao Kafka **không** có bài toán "đọc phải dữ liệu cũ" như read replica của MySQL. MySQL cho replica phục vụ đọc mà không có cơ chế watermark, nên đọc ra dữ liệu tụt sau. Kafka thì không cho đọc phần chưa an toàn — dù đọc từ leader.

### Cái giá: độ trễ đầu-cuối không bao giờ bằng 0

Hệ quả trực tiếp mà nhiều người bất ngờ khi đo lần đầu:

```text
   Producer gửi xong lúc      t = 0 ms
   Leader ghi vào page cache  t = 0,2 ms
   Follower fetch về          t = 1,0 ms   (chu kỳ fetch)
   Follower fetch lần kế tiếp t = 1,5 ms   ← LÚC NÀY leader mới biết
                                             follower đã có
   HW nhích lên               t = 1,5 ms
   Consumer thấy message      t = 1,5 ms trở đi
```

Nghĩa là **kể cả khi producer dùng `acks=1`** (không chờ follower), consumer vẫn phải chờ HW nhích lên. Độ trễ này thường 1–5 ms trong một AZ, và tăng theo độ trễ mạng giữa các bản sao. Đây là lý do thật khiến "đo Kafka thấy chậm hơn dự tính" — không phải Kafka chậm, mà là bạn đang đo cả một vòng nhân bản.

## ISR — In-Sync Replicas, và cách một follower bị đá ra

**ISR** (In-Sync Replicas — các bản sao đang đồng bộ) = tập các bản sao **đang bắt kịp leader**, bao gồm cả chính leader.

Điểm quan trọng nhất và cũng hay bị hiểu sai nhất: **ISR không đo bằng số offset tụt lại, mà đo bằng THỜI GIAN.**

```properties
replica.lag.time.max.ms = 30000    # mặc định 30 giây
```

Quy tắc chính xác:

> Một follower bị loại khỏi ISR nếu nó **không gửi FetchRequest đòi dữ liệu mới nhất** trong vòng `replica.lag.time.max.ms`.

Chi tiết tinh tế: "đòi dữ liệu mới nhất" nghĩa là follower đã fetch tới bằng LEO của leader **tại một thời điểm nào đó** trong 30 giây qua. Một follower tụt sau 1 triệu message nhưng đang kéo với tốc độ bằng leader thì **vẫn tụt** và sẽ bị loại; ngược lại một follower tụt 50 message nhưng liên tục bắt kịp thì vẫn ở trong ISR.

### Vì sao đo bằng thời gian mà không đo bằng số message

Kafka từng dùng cách đo theo số message (`replica.lag.max.messages`) và **đã bỏ** vì nó sai trong tình huống rất thường gặp:

```text
   ĐO THEO SỐ MESSAGE — đặt ngưỡng 4000
   ════════════════════════════════════

   Lúc bình thường:  producer gửi 100 msg/s
                     follower tụt tối đa ~50 msg → ổn

   Lúc có đợt cao điểm: producer gửi 50.000 msg/s trong 2 giây
                     follower khoẻ mạnh, mạng tốt, đang kéo hết sức
                     nhưng vẫn tụt 8.000 msg trong khoảnh khắc
                     → BỊ ĐÁ KHỎI ISR OAN

   Hậu quả dây chuyền:
   ISR co từ 3 xuống 1 → không đủ min.insync.replicas=2
   → producer nhận NOT_ENOUGH_REPLICAS → ứng dụng lỗi
   → chỉ vì một đợt cao điểm 2 giây mà follower vẫn khoẻ
```

Đo theo thời gian không có bệnh này: follower đang kéo hết sức thì vẫn liên tục "chạm" tới LEO của leader, nên đồng hồ 30 giây được đặt lại liên tục.

### Xem ISR co lại bằng mắt

```bash
/opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --topic order-events
```

Bình thường:

```text
Topic: order-events  Partition: 0  Leader: 1  Replicas: 1,2,3  Isr: 1,2,3
```

Sau khi dừng broker 3:

```text
Topic: order-events  Partition: 0  Leader: 1  Replicas: 1,2,3  Isr: 1,2
                                              ^^^^^^^^^^^^^^   ^^^^^^^
                                              vẫn liệt kê đủ   chỉ còn 2
```

Đọc đúng hai cột này:

| Cột | Nghĩa | Đổi khi nào |
|---|---|---|
| `Replicas` | Danh sách bản sao **được giao** cho partition này | Chỉ đổi khi bạn chạy `kafka-reassign-partitions.sh` |
| `Isr` | Bản sao **đang thực sự bắt kịp** | Đổi liên tục theo sức khoẻ cụm |

> **Cảnh báo vận hành quan trọng nhất của Kafka**: chỉ số cần theo dõi là `UnderReplicatedPartitions` (số partition có `Isr` < `Replicas`). Ở cụm khoẻ, con số này phải là **0 mãi mãi**. Nó lớn hơn 0 kéo dài nghĩa là có broker ốm, đĩa chậm, hoặc mạng nghẽn — và bạn đang chạy với ít lớp bảo vệ hơn bạn tưởng.

### Ba lý do thật khiến ISR co lại ở production

| Nguyên nhân | Dấu hiệu đi kèm | Cách xử lý |
|---|---|---|
| Broker chết hoặc khởi động lại | Broker biến mất khỏi danh sách | Bình thường, ISR tự phục hồi khi broker lên |
| **Đĩa của follower chậm** | ISR co ở nhiều partition cùng lúc, `iowait` cao | Kiểm tra đĩa, tách log Kafka khỏi đĩa hệ điều hành |
| **GC dừng dài trên follower** | ISR chớp tắt theo chu kỳ | Giảm heap, đổi sang G1GC, kiểm tra `GCPauseTime` |
| Mạng giữa broker nghẽn | ISR co ở broker cùng một AZ | Kiểm tra băng thông, xem `replica.fetch.max.bytes` |

Điểm chung: **ISR co lại gần như luôn là triệu chứng của vấn đề hạ tầng**, không phải vấn đề Kafka.

## acks — ba mức, ba mức đánh đổi

`acks` là tham số phía **producer**, trả lời câu hỏi: *"leader phải làm xong tới đâu thì mới coi lệnh gửi là thành công?"*

```text
   acks=0  ────────────────────────────────────────────────────
   Producer gửi đi và KHÔNG chờ gì cả.
   ┌──────────┐  gửi   ┌────────┐
   │ Producer │ ─────► │ Leader │   (producer đã coi là xong)
   └──────────┘        └────────┘
   Mất dữ liệu khi: mạng rớt, leader chết, leader từ chối — mà KHÔNG BIẾT
   Độ trễ: thấp nhất có thể
   Dùng cho: số liệu đo lường, log không quan trọng


   acks=1  ────────────────────────────────────────────────────
   Chờ leader ghi vào page cache của nó.
   ┌──────────┐  gửi   ┌────────┐
   │ Producer │ ─────► │ Leader │ ghi xong
   │          │ ◄───── │        │ báo OK
   └──────────┘        └────────┘
   Mất dữ liệu khi: leader chết TRƯỚC khi follower kịp kéo về
   Độ trễ: trung bình
   Dùng cho: dữ liệu chấp nhận mất một ít khi có sự cố


   acks=all (hoặc -1) ─────────────────────────────────────────
   Chờ MỌI bản sao trong ISR đã có dữ liệu.
   ┌──────────┐  gửi   ┌────────┐ ◄── fetch ── ┌───┐
   │ Producer │ ─────► │ Leader │ ◄── fetch ── │f1 │
   │          │        │        │              └───┘
   │          │ ◄───── │        │ ◄── fetch ── ┌───┐
   └──────────┘  OK    └────────┘              │f3 │
                  (sau khi HW đã vượt qua lô)  └───┘
   Mất dữ liệu khi: MỌI bản sao trong ISR cùng chết
   Độ trễ: cao nhất
   Dùng cho: MỌI dữ liệu nghiệp vụ
```

Từ **Kafka 3.0**, mặc định của producer đã đổi thành `acks=all` và `enable.idempotence=true`. Đây là thay đổi rất đáng hoan nghênh — mặc định cũ (`acks=1`) khiến vô số hệ thống mất dữ liệu mà chủ nhân không biết.

### Cái bẫy: `acks=all` một mình KHÔNG đủ

Đây là chỗ sai kinh điển nhất trong cấu hình Kafka, và nó im lặng:

```text
   Cấu hình:  RF=3, acks=all, min.insync.replicas=1  (mặc định!)

   t=0   ISR = {leader, f1, f3}    → acks=all chờ cả 3. An toàn.
   t=1   f1 và f3 cùng ốm (đĩa chậm), bị loại khỏi ISR.
   t=2   ISR = {leader}            → acks=all giờ chỉ chờ... LEADER.
                                      Vì ISR chỉ có mỗi leader!
   t=3   Producer vẫn nhận "thành công" bình thường. Không cảnh báo gì.
   t=4   LEADER CHẾT.
   t=5   → MẤT TOÀN BỘ dữ liệu ghi trong khoảng t=2 tới t=4.
```

`acks=all` nghĩa là *"chờ mọi bản sao **trong ISR**"*. Nếu ISR co xuống còn một, thì `acks=all` **thoái hoá thành `acks=1`** mà không hề báo.

Thứ chặn được kịch bản này là **`min.insync.replicas`** — tham số phía **broker/topic**:

```text
   min.insync.replicas = 2

   t=2   ISR co xuống {leader}, |ISR| = 1 < 2
   t=3   Producer nhận LỖI NotEnoughReplicasException
         → ứng dụng BIẾT NGAY và có thể quyết định (retry, báo động, dừng)
```

> **Quy tắc vàng**: `acks=all` và `min.insync.replicas` **phải đi cùng nhau**. Thiếu một trong hai là mất tác dụng. Và `min.insync.replicas` phải đặt ở **cấp topic hoặc broker**, không phải ở producer — nhiều người tìm nhầm chỗ.

```bash
# Đặt cho một topic đã tồn tại
/opt/kafka/bin/kafka-configs.sh --bootstrap-server localhost:9092 \
  --entity-type topics --entity-name order-events \
  --alter --add-config min.insync.replicas=2
```

### Bảng đánh đổi đầy đủ

| Cấu hình | Thông lượng (tương đối) | Chịu được gì | Mất dữ liệu khi |
|---|---|---|---|
| `acks=0` | 100% | Không gì | Bất kỳ trục trặc nào, và **âm thầm** |
| `acks=1` | ~85% | Follower chết | Leader chết trước khi follower kéo kịp |
| `acks=all`, minISR=1 | ~65% | Follower chết | ISR co còn 1 rồi leader chết — **im lặng** |
| **`acks=all`, minISR=2, RF=3** | **~60%** | **Chết 1 broker bất kỳ** | **Chỉ khi cả 2 bản sao trong ISR cùng chết** |

(Con số thông lượng là bậc độ lớn tương đối, phụ thuộc mạnh vào kích thước message, `linger.ms`, và mạng. Hãy đo trên hệ thống của bạn.)

## Unclean leader election — công tắc đánh đổi dữ liệu lấy khả năng phục vụ

Kịch bản: mọi bản sao trong ISR đều chết. Còn lại một follower đã **bị loại khỏi ISR từ lâu** và tụt sau rất nhiều. Kafka phải chọn:

```text
   ┌───────────────────────────────────────────────────────────────┐
   │  unclean.leader.election.enable = false   (MẶC ĐỊNH)           │
   ├───────────────────────────────────────────────────────────────┤
   │  Partition ĐỨNG IM. Không leader, không đọc, không ghi.        │
   │  Chờ tới khi một bản sao trong ISR sống lại.                   │
   │                                                                │
   │  Chọn:  NHẤT QUÁN  hơn  SẴN SÀNG   (chữ C trong CAP)           │
   │  Được:  không mất một byte nào                                 │
   │  Mất:   partition ngừng phục vụ, có thể hàng giờ               │
   ├───────────────────────────────────────────────────────────────┤
   │  unclean.leader.election.enable = true                         │
   ├───────────────────────────────────────────────────────────────┤
   │  Đưa bản sao tụt hậu lên làm leader ngay.                      │
   │  Mọi message mà bản sao đó CHƯA CÓ biến mất VĨNH VIỄN.          │
   │                                                                │
   │  Chọn:  SẴN SÀNG  hơn  NHẤT QUÁN   (chữ A trong CAP)           │
   │  Được:  phục vụ lại trong vài giây                             │
   │  Mất:   dữ liệu, im lặng, không cách nào khôi phục             │
   └───────────────────────────────────────────────────────────────┘
```

```text
   Minh hoạ cụ thể
   ═══════════════
   Leader chết ở offset 5000. Bản sao tụt hậu chỉ có tới 4200.

   unclean = false → partition chết cứng, dữ liệu 4200..5000 còn nguyên
                     trên đĩa của leader cũ, chờ nó sống lại
   unclean = true  → bản sao lên leader, LEO = 4200,
                     800 message BIẾN MẤT
                     và tệ hơn: consumer đã commit offset 4900
                     giờ offset 4900 KHÔNG TỒN TẠI → consumer bị đặt lại
```

Mặc định `false` là đúng cho gần như mọi hệ thống. Chỉ bật `true` khi bạn **thật sự** ưu tiên đường truyền không đứt hơn dữ liệu đầy đủ — ví dụ luồng số liệu đo lường hoặc log truy cập, nơi mất vài trăm bản ghi không ai chết.

## Leader epoch — cơ chế chống dữ liệu phân kỳ

Ở [Bài 4](04-giai-phau-broker-topic-partition-replica.md) có file `leader-epoch-checkpoint`. Đây là lúc giải nghĩa nó.

**Epoch** = một số nguyên tăng dần mỗi lần partition đổi leader. Nó đóng vai trò "nhiệm kỳ".

```text
   epoch 0:  broker 1 làm leader, ghi offset 0..99
   epoch 1:  broker 1 chết, broker 2 lên leader, ghi offset 100..250
   epoch 2:  broker 2 chết, broker 1 sống lại và lên leader
```

Bài toán ở epoch 2: broker 1 sống lại với dữ liệu tới offset 130 — nhưng **offset 100..130 của nó là dữ liệu cũ từ epoch 0**, khác hoàn toàn với offset 100..130 mà broker 2 đã ghi ở epoch 1. Cùng số offset, nội dung khác nhau. Đây gọi là **phân kỳ dữ liệu** (divergence).

```text
   Broker 1 (dữ liệu cũ)      Broker 2 (dữ liệu đúng)
   offset 100: đơn hàng A     offset 100: đơn hàng X
   offset 101: đơn hàng B     offset 101: đơn hàng Y
   ...                        ...
   → CÙNG OFFSET, KHÁC NỘI DUNG. Nếu không xử lý, cụm hỏng vĩnh viễn.
```

Cách leader epoch giải quyết: khi broker 1 quay lại làm follower, nó hỏi leader hiện tại *"offset cuối cùng của epoch 0 là bao nhiêu?"*. Leader trả lời "99". Broker 1 **cắt bỏ (truncate)** mọi thứ từ offset 100 trở đi, rồi fetch lại từ 100.

Cơ chế này (KIP-101, có từ Kafka 0.11) thay cho cách cũ dựa vào high watermark, vốn có lỗ hổng trong một số kịch bản khởi động lại đồng thời. Bạn không cần cấu hình gì — nó chạy ngầm. Nhưng biết nó tồn tại giúp bạn hiểu vì sao trong log broker thỉnh thoảng xuất hiện dòng `Truncating to offset 99` và đó **không phải lỗi**.

## Đính chính: Raft KHÔNG bầu partition leader

Đây là chỗ transcript gốc nói sai một cách dễ lan truyền:

> *"Cơ chế bầu chọn thăng cấp Leader mới này dựa trên thuật toán đồng thuận Raft (vì mình đang chạy ở mode KRaft)."*

Sai. Trong Kafka có **hai loại bầu chọn hoàn toàn khác nhau**, dùng hai cơ chế khác nhau:

| | Bầu **controller** | Bầu **partition leader** |
|---|---|---|
| Ai bầu | Các node có role `controller` bầu lẫn nhau | **Controller đang tại vị tự chọn**, không ai bỏ phiếu |
| Cơ chế | **Raft** — bỏ phiếu, cần quá bán | **Chọn từ danh sách ISR** — thuần tuý tra bảng |
| Tần suất | Hiếm — chỉ khi controller chết | Thường xuyên — mỗi lần broker lên/xuống |
| Có bỏ phiếu không | **Có** | **Không** |
| Cần quorum không | **Có** | **Không** |

Cụ thể chuyện xảy ra khi một broker chết:

```text
   1. Controller phát hiện broker 2 mất kết nối
      (KRaft: hết hạn phiên đăng ký / ZooKeeper: znode tạm biến mất)

   2. Controller tra metadata: broker 2 đang làm leader cho những partition nào?
      → order-events-1, payment-events-0, ...

   3. Với TỪNG partition đó, controller CHỌN — không bầu:
      lấy phần tử đầu tiên trong ISR mà vẫn còn sống

      order-events-1: Replicas=[2,3,1]  Isr=[2,3,1]
                      broker 2 chết → chọn broker 3

   4. Controller ghi quyết định vào nhật ký metadata
   5. Controller phát LeaderAndIsrRequest tới các broker liên quan
   6. Broker 3 chuyển bản sao của nó từ chế độ follower sang leader
   7. Client nhận metadata mới → gửi request tới broker 3
```

Bước 3 là **một phép tra bảng**, không phải một cuộc bầu cử. Raft chỉ xuất hiện ở bước 4 — để đảm bảo quyết định của controller được ghi bền vững và nhất quán vào nhật ký metadata.

> **Câu tóm gọn để nhớ**: **Raft bầu ra người ra quyết định. Người ra quyết định thì tra ISR chứ không bầu cử.**

Chi tiết về Raft ở [Bài 7](07-kraft-va-thuat-toan-raft.md).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| `acks=all` mà quên `min.insync.replicas` | Mất dữ liệu **im lặng** khi ISR co còn 1 | Đặt `min.insync.replicas=2` ở cấp topic |
| Đặt `min.insync.replicas` ở producer | Không có tác dụng — đó là tham số broker/topic | Dùng `kafka-configs.sh` cấp topic |
| `min.insync.replicas` = RF | Một máy bảo trì là ngừng ghi toàn hệ thống | Đặt `RF - 1` |
| Bật `unclean.leader.election.enable=true` cho tiện | Mất dữ liệu vĩnh viễn, im lặng | Giữ `false` trừ khi dữ liệu thật sự bỏ được |
| Không theo dõi `UnderReplicatedPartitions` | Chạy không có lớp bảo vệ mà không biết | Cảnh báo khi > 0 kéo dài quá 5 phút |
| Nghĩ leader đẩy dữ liệu cho follower | Không hiểu nổi ISR và `replica.lag.time.max.ms` | Follower **kéo** bằng FetchRequest |
| Nghĩ Raft bầu partition leader | Nhầm lẫn hai tầng hoàn toàn khác nhau | Raft bầu **controller**; controller **chọn** partition leader từ ISR |
| Giảm `replica.lag.time.max.ms` để "phát hiện lỗi nhanh hơn" | ISR chớp tắt liên tục ở lúc cao điểm → producer lỗi oan | Giữ mặc định 30 giây |
| Tăng RF để consumer đọc nhanh hơn | Follower không phục vụ đọc | Tăng **partition** |

## Tóm tắt bài 5

- **Đính chính lớn**: **follower KÉO dữ liệu từ leader** bằng FetchRequest — cùng giao thức consumer dùng. Leader **không đẩy** gì cả. Đây là lý do ISR đo được, và là lý do Kafka đơn giản hơn các hệ thống đẩy.
- **LEO** = offset kế tiếp sẽ ghi vào một bản sao. **High Watermark** = LEO nhỏ nhất trong ISR.
- **Consumer chỉ đọc được tới High Watermark** — nghĩa là mọi thứ consumer thấy đều đã nhân bản đủ và chắc chắn sống sót qua việc đổi leader. Cái giá là độ trễ đầu-cuối luôn có thêm một vòng nhân bản (thường 1–5 ms).
- **ISR đo bằng THỜI GIAN** (`replica.lag.time.max.ms`, mặc định 30 giây), không đo bằng số message tụt lại. Cách đo cũ theo số message đã bị bỏ vì đá nhầm follower khoẻ trong lúc cao điểm.
- **`acks=all` một mình không đủ**. Khi ISR co còn 1, `acks=all` thoái hoá thành `acks=1` mà không báo. Phải đi kèm **`min.insync.replicas=2`** đặt ở **cấp topic**.
- Cấu hình chuẩn: **RF=3, `min.insync.replicas=2`, `acks=all`, `enable.idempotence=true`** (ba cái sau là mặc định từ Kafka 3.0 trở đi, trừ `min.insync.replicas`).
- **`unclean.leader.election.enable`** là công tắc CAP tường minh nhất trong Kafka: `false` (mặc định) chọn nhất quán, `true` chọn sẵn sàng và **mất dữ liệu im lặng**.
- **Leader epoch** chống phân kỳ dữ liệu khi leader cũ sống lại — dòng `Truncating to offset N` trong log là bình thường, không phải lỗi.
- **Đính chính lớn**: **Raft bầu controller. Controller CHỌN partition leader từ danh sách ISR** — không bỏ phiếu, không cần quorum. Hai tầng khác nhau, đừng trộn.
- Chỉ số vận hành số một: **`UnderReplicatedPartitions` phải luôn bằng 0**.

**Bài kế tiếp** → [Bài 6: ZooKeeper từ A đến Z — nó làm gì cho Kafka và vì sao bị loại bỏ](06-zookeeper-tu-a-den-z.md)
