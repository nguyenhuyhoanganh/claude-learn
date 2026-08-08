# Bài 5: Bao nhiêu partition là đủ — giới hạn vật lý và công thức tính

[Phase 18 bài 2](../phase-18-best-practices/02-topic-partition-replication.md) đã trả lời câu hỏi này từ góc **nghiệp vụ**: bao nhiêu topic, bao nhiêu partition, replication factor bao nhiêu.

Bài này trả lời từ góc **vật lý**: partition tốn cái gì của hệ thống, trần cứng nằm ở đâu, và vì sao "cứ tạo nhiều partition cho chắc" là một quyết định tốn kém âm thầm.

Bốn yếu tố bị ảnh hưởng, và chúng kéo về **hai hướng ngược nhau**:

```text
   Tăng partition thì:
     ✓ Thông lượng TĂNG          ← lý do người ta tăng
     ✗ Số file mở TĂNG
     ✗ Độ trễ đầu-cuối TĂNG
     ✗ Thời gian phục hồi sự cố TĂNG

   → Có một điểm tối ưu, và nó KHÔNG phải "càng nhiều càng tốt".
```

## Yếu tố 1 — thông lượng

### Mô hình tư duy: trạm kiểm soát

```text
   TOPIC = trạm kiểm soát        PARTITION = làn kiểm tra

   1 làn:                        5 làn:
   ┌───────────────────┐         ┌───────────────────┐
   │ ──►──►──►──►──►   │         │ ──►──►            │
   │  xe nối đuôi nhau │         │ ──►──►            │
   │                   │         │ ──►──►            │
   │  1 xe/phút        │         │ ──►──►            │
   └───────────────────┘         │ ──►──►  5 xe/phút │
                                 └───────────────────┘
```

Nhưng mô hình này có một vế thứ hai mà người ta hay quên:

```text
   Xây 5 làn mà chỉ có 1 nhân viên kiểm tra
   → vẫn 1 xe/phút, mà tốn tiền xây thêm 4 làn.
```

> **Partition chỉ cho phép song song. Producer và consumer mới thật sự tạo ra song song.**

Ba con số phải khớp nhau:

```text
   Số partition  ≥  Số consumer trong group     (thừa consumer = ngồi không)
   Số partition      quyết định TRẦN song song
   Số consumer       quyết định song song THỰC TẾ
```

### Công thức tính từ thông lượng mong muốn

Con số nền để tính:

```text
   Một partition xử lý được khoảng 10 MB/s
   (con số tham chiếu từ benchmark phổ biến; phụ thuộc mạnh vào
    phần cứng, kích thước message, cấu hình nén và acks)
```

Ví dụ tính:

```text
   Yêu cầu: xử lý 5 TB mỗi ngày cho một topic

   5 TB / ngày
     = 5 × 1024 × 1024 MB / 86400 giây
     = 5.242.880 MB / 86.400 s
     ≈ 60 MB/s

   Số partition tối thiểu = 60 / 10 = 6 partition
```

Nhưng **6 là sàn tuyệt đối**, không phải con số nên dùng. Ba hệ số nhân cần cộng vào:

| Hệ số | Nhân thêm | Vì sao |
|---|---|---|
| **Cao điểm** | ×2 tới ×3 | Lưu lượng không đều 24 giờ. Giờ cao điểm có thể gấp 3 trung bình |
| **Tăng trưởng** | ×1,5 tới ×2 | Tăng partition sau này **phá vỡ ánh xạ key→partition** ([Phase 20 bài 3](../phase-20-kafka-internals/03-doi-chieu-mysql-de-hieu-kafka.md)) |
| **Dự phòng khi có máy chết** | ×1,3 | Mất một broker thì các máy còn lại phải gánh thêm |

```text
   6 × 2,5 (cao điểm) × 1,5 (tăng trưởng) × 1,3 (dự phòng) ≈ 29
   → chọn 30 partition
```

### Quy tắc thực dụng theo số broker

Với cụm nhỏ, có một quy tắc đơn giản hơn nhiều:

```text
   Cụm ≤ 6 broker:  tối đa 2N partition mỗi topic
                     (N = số broker)

   Ví dụ 6 broker → tối đa 12 partition cho mỗi topic

   Cụm > 12 broker: phải tính theo thông lượng như trên,
                     quy tắc 2N không còn phù hợp
```

Vì sao `2N`: nó đảm bảo mỗi broker giữ trung bình 2 leader của topic đó — đủ để cân tải mà chưa gây quá tải file mở.

### Bẫy: key lệch làm công thức vô nghĩa

Toàn bộ tính toán trên giả định dữ liệu **trải đều** các partition. Điều đó chỉ đúng khi không có key, hoặc khi key đủ đa dạng.

```text
   Topic "orders", key = customerId, 10 partition

   Thực tế của một sàn thương mại điện tử:
     Khách "SHOPEE-MALL" chiếm 40% tổng đơn
     → murmur2("SHOPEE-MALL") % 10 = 7
     → PARTITION 7 nhận 40% lưu lượng

   ┌────┬────┬────┬────┬────┬────┬────┬──────────┬────┬────┐
   │ P0 │ P1 │ P2 │ P3 │ P4 │ P5 │ P6 │   P7     │ P8 │ P9 │
   │ 7% │ 6% │ 7% │ 6% │ 7% │ 6% │ 7% │   40%    │ 7% │ 7% │
   └────┴────┴────┴────┴────┴────┴────┴──────────┴────┴────┘
                                          🔥
   Tăng lên 20 partition KHÔNG giúp gì — key đó vẫn vào đúng MỘT partition.
```

Ba cách chữa:

| Cách | Làm gì | Đánh đổi |
|---|---|---|
| **Key ghép** | `customerId + ":" + (orderId % 4)` → một khách trải ra 4 partition | **Mất thứ tự** trong phạm vi khách đó |
| **Custom partitioner** | Tách riêng key nóng ra partition dành riêng ([bài 4](04-gui-va-doc-partition-chi-dinh.md)) | Phải bảo trì lớp partitioner |
| **Tách topic** | Khách lớn đi topic riêng | Producer phải biết ai là khách lớn |

Và điều quan trọng nhất phải nói thẳng:

> **Nếu nghiệp vụ bắt buộc xử lý tuần tự theo một key, thì tăng partition và tăng consumer KHÔNG giúp gì cả.** Trần song song của key đó là 1, vĩnh viễn. Đây là giới hạn của bài toán, không phải của Kafka.

## Yếu tố 2 — số file mở (file descriptor)

Đây là yếu tố hầu như không ai tính, cho tới khi broker sập với lỗi `Too many open files`.

### Mỗi partition tốn bao nhiêu file

```text
   Mỗi bản sao partition, cho MỖI segment:
     • xxx.log         dữ liệu
     • xxx.index       chỉ mục offset
     • xxx.timeindex   chỉ mục thời gian
   → tối thiểu 3 file cho segment đang mở

   Cộng thêm mỗi thư mục partition:
     • leader-epoch-checkpoint
     • partition.metadata
```

### Tính cho một broker thật

```text
   Cụm 3 broker, 50 topic, mỗi topic 12 partition, RF=3

   Tổng bản sao partition trong cụm = 50 × 12 × 3 = 1.800
   Mỗi broker giữ                    = 1.800 / 3   = 600 bản sao

   File mở tối thiểu (chỉ segment đang mở):
       600 × 3 ≈ 1.800

   Nhưng segment CŨ chưa hết hạn cũng có thể đang mở.
   Retention 7 ngày, segment 1 GB, mỗi partition ~5 segment:
       600 × 5 × 3 ≈ 9.000

   Cộng socket của client, kết nối inter-broker:
       ≈ 10.000 - 15.000 file descriptor
```

Mặc định của Linux là **1024**. Thấp hơn nhu cầu thật cả chục lần.

### Kiểm tra và sửa

```bash
# Giới hạn toàn hệ thống
sysctl fs.file-max

# Giới hạn của tiến trình Kafka đang chạy
cat /proc/$(pgrep -f kafka.Kafka)/limits | grep "open files"

# Đang dùng bao nhiêu
ls /proc/$(pgrep -f kafka.Kafka)/fd | wc -l
```

```bash
# /etc/security/limits.conf
kafka  soft  nofile  128000
kafka  hard  nofile  128000
```

```ini
# Với systemd — limits.conf KHÔNG áp dụng cho service của systemd
# /etc/systemd/system/kafka.service.d/override.conf
[Service]
LimitNOFILE=128000
```

> **Bẫy rất hay gặp**: sửa `/etc/security/limits.conf` rồi khởi động lại mà giới hạn không đổi — vì Kafka chạy bằng **systemd**, và systemd **bỏ qua** file đó. Phải dùng `LimitNOFILE` trong unit file. Kiểm chứng bằng `/proc/<pid>/limits`, đừng tin `ulimit -n` của shell.

Trong Docker/Kubernetes:

```yaml
# docker-compose.yml
services:
  kafka1:
    ulimits:
      nofile:
        soft: 128000
        hard: 128000
```

Tài liệu Confluent khuyến nghị **tối thiểu 100.000** file descriptor cho broker production.

## Yếu tố 3 — độ trễ đầu-cuối

Đây là yếu tố tinh vi nhất, và nó đến từ một chi tiết cài đặt ít người biết.

Nhắc lại từ [Phase 20 bài 5](../phase-20-kafka-internals/05-leader-follower-isr-va-luong-ghi.md): consumer chỉ đọc được tới **high watermark**, tức là chỉ sau khi mọi bản sao trong ISR đã nhận được dữ liệu.

Chi tiết quyết định:

```text
   Việc follower kéo dữ liệu về được xử lý bởi một SỐ LƯỢNG LUỒNG CÓ HẠN.
   Tham số: num.replica.fetchers (mặc định 1 cho mỗi broker nguồn)

   Broker B kéo dữ liệu từ broker A cho 500 partition
   → 500 partition đó CHIA NHAU một luồng fetcher
   → partition xui xẻo phải chờ tới lượt
```

```text
   Broker giữ 100 bản sao partition:
     mỗi vòng fetch xử lý 100 partition → độ trễ thêm ~1 ms

   Broker giữ 5.000 bản sao partition:
     mỗi vòng fetch xử lý 5.000 partition → độ trễ thêm vài chục ms
```

Với ứng dụng thời gian thực, vài chục mili giây là vấn đề lớn. Cách chữa:

```properties
# Tăng số luồng kéo dữ liệu — thường đặt bằng số lõi CPU / 2
num.replica.fetchers=4
```

Nhưng chữa gốc là **đừng tạo quá nhiều partition ngay từ đầu**.

## Yếu tố 4 — thời gian phục hồi khi broker chết

Đây là chỗ số partition biến thành thời gian ngừng phục vụ.

### Tắt có kiểm soát

```text
   docker stop / systemctl stop / SIGTERM

   Broker báo trước cho controller "tôi sắp tắt"
   → controller chuyển TRƯỚC mọi ghế leader
   → thời gian ảnh hưởng: gần như bằng 0
   (đo được ~0,5 giây ở Phase 20 bài 9)
```

### Chết đột ngột

```text
   kill -9 / mất điện / hết bộ nhớ

   t=0..9s   Controller chưa biết (broker.session.timeout.ms)
   t=9s      Tuyên bố chết → chọn leader mới cho TỪNG partition
             mà broker đó đang làm leader
   t=9s+     Client làm mới metadata

   Nếu broker đó giữ 20 ghế leader   → phần bầu lại: vài chục ms
   Nếu broker đó giữ 5.000 ghế leader → phần bầu lại: có thể vài GIÂY
```

```text
   Tổng thời gian ngừng ≈ 9 giây (phát hiện, CỐ ĐỊNH)
                        + f(số leader trên máy đó)  ← PHẦN TỈ LỆ VỚI PARTITION
```

Phần phát hiện là hằng số. Phần thứ hai **tỉ lệ với số partition**. Đây chính là lý do KRaft được thiết kế lại ([Phase 20 bài 7](../phase-20-kafka-internals/07-kraft-va-thuat-toan-raft.md)) — nó rút ngắn mạnh phần thứ hai, nhưng không xoá được nó.

Và điều đáng nhớ: **tắt có kiểm soát không có vấn đề này**, vì leader đã chuyển xong trước khi tắt. Nên rủi ro chỉ hiện thực hoá khi máy chết đột ngột — mà chuyện đó thì hiếm, nhưng luôn xảy ra vào lúc tệ nhất.

## Bảng tổng hợp bốn yếu tố

| Yếu tố | Tăng partition thì | Trần thực dụng | Chỉ số theo dõi |
|---|---|---|---|
| **Thông lượng** | **Tăng** (tới trần của consumer) | Không có trần từ phía này | Consumer lag |
| **File mở** | Tăng tuyến tính | ~4.000 bản sao/broker | `/proc/<pid>/fd` đếm được |
| **Độ trễ** | Tăng | Vài trăm ms nếu quá nhiều | Độ trễ đầu-cuối |
| **Thời gian phục hồi** | Tăng | Vài giây nếu quá nhiều | Thời gian bầu lại leader |

## Con số thực dụng để nhớ

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  MỖI BROKER      2.000 - 4.000 bản sao partition             │
   │                  (tính cả leader lẫn follower)                │
   ├──────────────────────────────────────────────────────────────┤
   │  MỖI TOPIC       Cụm ≤ 6 broker:  tối đa 2N partition        │
   │                  Cụm lớn hơn:     tính theo thông lượng       │
   ├──────────────────────────────────────────────────────────────┤
   │  KHỞI ĐIỂM       3 - 6 partition cho topic mới               │
   │                  (tăng được, KHÔNG giảm được)                 │
   ├──────────────────────────────────────────────────────────────┤
   │  FILE DESCRIPTOR Tối thiểu 100.000 cho broker production     │
   └──────────────────────────────────────────────────────────────┘
```

Câu hỏi tự kiểm tra trước khi chốt con số:

```text
   1. Thông lượng đỉnh cần bao nhiêu MB/s?     → sàn = MB/s ÷ 10
   2. Nhân hệ số cao điểm × tăng trưởng × dự phòng
   3. Có key nào chiếm quá 20% lưu lượng?      → nếu có, tính toán trên VÔ NGHĨA
   4. Con số này × RF ÷ số broker < 4.000?     → nếu không, cần thêm broker
   5. Có thật sự cần tuần tự theo key không?   → nếu có, trần song song của key đó là 1
```

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| "Tạo 10.000 partition cho chắc, sau này khỏi lo" | Tốn file mở, độ trễ tăng, phục hồi chậm — và **không giảm được** |
| Tăng partition để chữa lag mà consumer không tăng theo | Không nhanh hơn một chút nào |
| Tính partition mà không tính key lệch | Một partition nóng 40%, tăng bao nhiêu cũng vô ích |
| Tăng partition trên topic đang chạy có key | **Phá vỡ ánh xạ key→partition** → thứ tự theo key bị phá |
| Quên tăng file descriptor | Broker sập với `Too many open files`, thường lúc cao điểm |
| Sửa `limits.conf` khi chạy bằng systemd | **Không có tác dụng** — phải dùng `LimitNOFILE` trong unit file |
| Dùng `ulimit -n` để kiểm chứng | Đó là giới hạn của shell, không phải của tiến trình Kafka. Xem `/proc/<pid>/limits` |
| `kill -9` broker nhiều partition | Ngừng phục vụ 9 giây **cộng** thời gian bầu lại hàng nghìn leader |
| Giữ `num.replica.fetchers=1` với nhiều partition | Độ trễ đầu-cuối tăng vài chục ms |

## Tóm tắt bài 5

- Tăng partition **tăng thông lượng** nhưng đồng thời **tăng số file mở, độ trễ, và thời gian phục hồi**. Có điểm tối ưu, không phải "càng nhiều càng tốt".
- **Partition chỉ cho phép song song; producer và consumer mới tạo ra song song.** Xây 5 làn mà một nhân viên thì vẫn 1 xe/phút.
- Công thức: **sàn = (MB/s cần) ÷ 10**, rồi nhân **hệ số cao điểm (×2–3) × tăng trưởng (×1,5–2) × dự phòng (×1,3)**.
- Quy tắc nhanh cho cụm nhỏ: **cụm ≤ 6 broker thì tối đa 2N partition mỗi topic**.
- **Key lệch làm mọi tính toán vô nghĩa.** Một key chiếm 40% lưu lượng thì tăng partition không giúp gì. Và nếu nghiệp vụ bắt buộc tuần tự theo key thì **trần song song của key đó là 1, vĩnh viễn**.
- **File descriptor** là trần cứng hay bị quên: mỗi bản sao partition tốn ~3 file cho mỗi segment. Broker production cần **tối thiểu 100.000**, trong khi mặc định Linux là **1024**. Chạy bằng systemd thì `limits.conf` **không có tác dụng** — phải dùng `LimitNOFILE`.
- **Độ trễ tăng** vì việc kéo dữ liệu giữa các broker dùng số luồng có hạn (`num.replica.fetchers`, mặc định 1). Nhiều partition chia nhau một luồng.
- **Thời gian phục hồi** = ~9 giây phát hiện (hằng số) **+** thời gian bầu lại leader (**tỉ lệ với số partition trên máy đó**). Tắt có kiểm soát thì không có vấn đề này.
- Con số cần nhớ: **2.000–4.000 bản sao partition mỗi broker**, **3–6 partition cho topic mới**, **100.000 file descriptor**.

**Bài kế tiếp** → [Bài 6: SSL/TLS cho Kafka từ gốc — CA, keystore, truststore](06-ssl-tls-cho-kafka-tu-goc.md)
