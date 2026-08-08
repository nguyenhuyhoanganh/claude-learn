# Bài 3: Redis Internals và định lý CAP

Bài này nhìn Redis từ góc **nội tại lưu trữ** — vì sao nó nhanh, nó đánh đổi gì — rồi mở rộng sang định lý CAP, khung tư duy để hiểu **mọi** hệ phân tán.

> Khoá [redis](../../redis/README.md) trong workspace này đi sâu vào cách **dùng** Redis: các kiểu dữ liệu, lệnh, mẫu thiết kế. Bài này bổ sung góc nhìn khác: Redis **hoạt động thế nào bên trong** và nó nằm ở đâu trên bản đồ hệ phân tán.

## Vì sao Redis nhanh

Bốn lý do, và lý do thứ tư là lý do phản trực giác nhất:

```text
   1. TOAN BO DU LIEU TRONG RAM
      → không bao giờ chạm đĩa trong đường đọc/ghi
      → ~100 nanogiay thay vi ~100 microgiay

   2. CAU TRUC DU LIEU TOI UU SAN
      → không phải phân tích SQL, không lập kế hoạch, không tối ưu
      → GET là một lần tra bảng băm: O(1)

   3. GIAO THUC RESP CUC GON
      → phân tích rất nhanh, không có đóng gói nặng nề

   4. MỘT LUỒNG CHO LỆNH   ← phản trực giác
      → không có khoá
      → không có chuyển ngữ cảnh
      → không có điều kiện tranh chấp
      → mỗi lệnh là NGUYÊN TỬ MIỄN PHÍ
```

Điểm 4 xứng đáng nói kỹ. Trực giác nói "nhiều luồng thì nhanh hơn", nhưng với thao tác chỉ mất **vài trăm nanogiây**, chi phí lấy khoá và chuyển ngữ cảnh **lớn hơn chính công việc**.

```text
   THAO TAC MAT 200 ns
   ═══════════════════
   Lấy/trả khoá mutex   : ~20-100 ns    → 10-50% chi phí thuần tuý
   Chuyển ngữ cảnh      : ~1.000-3.000 ns → GẤP 5-15 LẦN công việc

   → Voi thao tac cuc ngan, MOT LUONG THANG.
```

Từ Redis 6.0 có **I/O đa luồng** — nhưng chỉ cho việc **đọc/ghi socket và phân tích giao thức**. Việc **thực thi lệnh vẫn một luồng**, và đó là chủ đích.

### Hệ quả: một lệnh chậm chặn tất cả

```text
   KEYS *              trên 10 triệu khoá  →  ~2 giây
   FLUSHALL            trên database lớn   →  vài giây
   SMEMBERS            trên set 5 triệu    →  ~1 giây
   Script Lua vòng lặp dài                 →  bao lâu tuỳ script

   → TRONG SUOT THOI GIAN DO, MOI CLIENT KHAC BI CHAN.
   → Độ trễ p99 tăng vọt, và không có cảnh báo nào trước.
```

Đây là nguyên nhân sự cố Redis phổ biến nhất. Cách phòng:

```bash
# Vô hiệu hoá các lệnh nguy hiểm trong sản phẩm thật
rename-command KEYS ""
rename-command FLUSHALL ""
rename-command FLUSHDB ""
```

```bash
# Theo dõi lệnh chậm
redis-cli CONFIG SET slowlog-log-slower-than 10000    # 10 ms
redis-cli SLOWLOG GET 10
```

Và luôn dùng `SCAN` thay `KEYS`:

```text
   KEYS pattern   →  O(n), CHAN toan bo server
   SCAN cursor    →  lặp dần, mỗi lần trả về một phần, KHÔNG chặn
```

---

## Mã hoá — cùng kiểu dữ liệu, nhiều cách lưu

Đây là phần nội tại thú vị nhất và có tác động lớn nhất tới bộ nhớ.

```text
   MOT KIEU DU LIEU (vi du: Hash) CO NHIEU MA HOA BEN TRONG

   Nho  →  listpack   : mang phang, quet tuyen tinh O(n)
                        → RẤT gọn, tốt với ít phần tử
   Lớn →  hashtable  : bảng băm thật, O(1)
                        → tốn hơn nhiều, nhưng nhanh với nhiều phần tử
```

Ngưỡng chuyển đổi:

```bash
redis-cli CONFIG GET hash-max-listpack-entries    # 128
redis-cli CONFIG GET hash-max-listpack-value      # 64
```

```text
   Hash có <= 128 trường VÀ mọi giá trị <= 64 byte  →  listpack
   Vượt MỘT trong hai ngưỡng                        →  hashtable
```

Kiểm tra mã hoá thật:

```bash
redis-cli HSET h1 f1 v1 f2 v2
redis-cli OBJECT ENCODING h1
```

```text
"listpack"
```

```bash
redis-cli HSET h1 f3 $(python3 -c "print('x'*100)")
redis-cli OBJECT ENCODING h1
```

```text
"hashtable"
```

### Chuyển đổi là MỘT CHIỀU

Đây là chi tiết rất quan trọng và rất hay bị bỏ sót:

```bash
redis-cli HDEL h1 f3                    # xoá trường dài đi
redis-cli OBJECT ENCODING h1
```

```text
"hashtable"        ← VAN LA hashtable, KHONG quay ve listpack
```

```text
   → Chỉ MỘT lần vượt ngưỡng là mã hoá đổi VĨNH VIỄN
   → Bộ nhớ không bao giờ quay lại mức cũ
   → Muốn quay về: phải XOÁ khoá và tạo lại
```

Tác động thực tế có thể rất lớn:

```text
   1 TRIỆU hash, mỗi cái 10 trường nhỏ
     listpack  :  ~104 byte/hash  →  104 MB
     hashtable :  ~400 byte/hash  →  400 MB

   → Chỉ vì MỘT trường vượt 64 byte trong mỗi hash,
     bộ nhớ tăng GẤP 4 LẦN.
```

Bảng ngưỡng cho các kiểu:

| Kiểu | Mã hoá nhỏ | Ngưỡng |
|---|---|---|
| Hash | `listpack` | `hash-max-listpack-entries` 128, `-value` 64 |
| List | `listpack` → `quicklist` | `list-max-listpack-size` 128 |
| Set (số nguyên) | `intset` | `set-max-intset-entries` 512 |
| Set (khác) | `listpack` | `set-max-listpack-entries` 128 |
| Sorted set | `listpack` → `skiplist` | `zset-max-listpack-entries` 128 |
| String | `int` / `embstr` / `raw` | `embstr` nếu ≤ **44 byte** |

Ngưỡng 44 byte của `embstr` cũng đáng nhớ: chuỗi ≤ 44 byte được lưu **cùng một khối bộ nhớ** với đối tượng, tiết kiệm một lần cấp phát.

### Điều tra bộ nhớ

```bash
redis-cli --bigkeys          # tìm khoá lớn nhất mỗi kiểu
redis-cli --memkeys          # tìm khoá tốn bộ nhớ nhất
redis-cli MEMORY USAGE khoa  # bộ nhớ THẬT của một khoá
redis-cli MEMORY DOCTOR      # goi y tu Redis
redis-cli INFO memory
```

Chú ý phân biệt hai lệnh hay bị nhầm:

```text
   OBJECT ENCODING khoa   →  trả về TÊN MÃ HOÁ ("listpack", "hashtable")
   MEMORY USAGE khoa      →  trả về SỐ BYTE
                             (có tuỳ chọn SAMPLES n để lấy mẫu)
```

---

## Độ bền — Redis chọn được mức

Redis **không** phải cache thuần tuý; nó lưu xuống đĩa được, và cho bạn chọn mức đảm bảo:

```text
   RDB (ảnh chụp)                     AOF (nhật ký những lệnh ghi)
   ═════════════                      ════════════════════════════
   Định kỳ lưu toàn bộ trạng thái     Ghi lại MỌI lệnh thay đổi dữ liệu
   → file nhỏ, khôi phục nhanh        → file lớn, khôi phục chậm hơn
   → MẤT dữ liệu giữa hai lần chụp    → mất tối đa theo appendfsync
   → fork() tạo bản sao → dung        → ghi lại định kỳ để gọn lại
     bộ nhớ tạm thời tăng vọt
```

```bash
# appendfsync — nút vặn độ bền
appendfsync always     # fsync mỗi lệnh — không mất gì, chậm nhất
appendfsync everysec   # fsync mỗi giây — mất tối đa 1 giây  (MẶC ĐỊNH)
appendfsync no         # để hệ điều hành quyết — có thể mất ~30 giây
```

Đây là ví dụ đẹp cho nguyên tắc ở [phase-2 bài 2](../phase-2/02-atomicity-va-durability.md): **độ bền là nút vặn, không phải công tắc**. Redis công khai điều đó thay vì giấu đi.

### Cái bẫy của `fork()`

```text
   Cả RDB lẫn việc ghi lại AOF đều dùng fork().

   Lĩnh vực copy-on-write: bản sao ban đầu không tốn bộ nhớ.
   NHƯNG nếu ứng dụng đang ghi nhiều trong lúc fork chạy:
     → các page bị sửa phải được SAO CHÉP THẬT
     → bộ nhớ có thể tăng tới GẤP ĐÔI trong thời gian ngắn
     → nếu máy không đủ RAM → OOM killer giết Redis
```

Phòng thủ:

```bash
# Cho phép cấp phát vượt mức — BẮT BUỘC với Redis
sysctl vm.overcommit_memory=1
```

Không đặt tham số này là nguyên nhân số một khiến Redis bị giết lúc lưu ảnh chụp.

---

## Redis Cluster

```text
   16.384 KHE BĂM (hash slot) chia cho các nút

   slot = CRC16(khoá) mod 16384

   Nut A: khe     0 - 5460
   Nut B: khe  5461 - 10922
   Nut C: khe 10923 - 16383
```

Con số 16.384 là cố định, không đổi được — nó đủ nhỏ để bảng khe vừa trong gói tin trao đổi giữa các nút, và đủ lớn để chia mịn cho hàng trăm nút.

### Giới hạn: thao tác nhiều khoá

```bash
redis-cli -c MSET user:1 a user:2 b
```

```text
(error) CROSSSLOT Keys in request don't hash to the same slot
```

Lời giải là **hash tag** — phần trong ngoặc nhọn quyết định khe:

```bash
redis-cli -c MSET "user:{42}:name" An "user:{42}:email" an@x.com
```

```text
   Cả hai khoá đều băm theo "42"
   → cùng một khe → cùng một nút → thao tác nhiều khoá CHẠY ĐƯỢC
```

Đây chính là kỹ thuật **nhóm cùng vị trí** ở [phase-7 bài 1](../phase-7/01-database-sharding-la-gi.md), áp cho Redis.

### Cluster không đảm bảo nhất quán mạnh

```text
   Redis Cluster dùng nhân bản BẤT ĐỒNG BỘ.

   1. Client ghi vào primary → primary trả về OK NGAY
   2. Primary chết TRƯỚC KHI kịp nhân bản
   3. Replica được thăng cấp
   → LENH GHI DO BIEN MAT
```

Redis ghi rõ điều này trong tài liệu. Nếu cần đảm bảo mạnh hơn:

```bash
WAIT 1 1000     # chờ ít nhất 1 replica xác nhận, tối đa 1000 ms
```

Nhưng `WAIT` **không phải** commit hai pha — nó chỉ giảm cửa sổ mất dữ liệu, không loại bỏ hoàn toàn.

---

## Định lý CAP

Bây giờ tới khung tư duy tổng quát cho **mọi** hệ phân tán.

```text
   Trong một hệ PHÂN TÁN, khi mạng bị CHIA CẮT (partition),
   bạn phải chọn giữa:

        C — Consistency  (nhất quán): mọi nút trả về dữ liệu MỚI NHẤT
        A — Availability (khả dụng) : mọi yêu cầu đều được trả lời
        P — Partition tolerance     : hệ vẫn chạy khi mạng đứt

   → P KHONG PHAI LUA CHON. Mang SE dut.
   → Nên thực tế chỉ là: chọn C hay chọn A khi P xảy ra.
```

### Diễn bằng ví dụ

```text
   BINH THUONG                        MANG DUT
   ═══════════                        ════════
   ┌─────┐  ◀──▶  ┌─────┐             ┌─────┐   ✂   ┌─────┐
   │ NUT A│        │ NUT B│            │ NUT A│      │ NUT B│
   │ x=5  │        │ x=5  │            │ x=5  │      │ x=5  │
   └─────┘        └─────┘             └─────┘      └─────┘
                                          ▲            ▲
                                     ghi x=9      đọc x = ?

   CHON C (nhat quan):  nut B TU CHOI tra loi
                        → "tôi không chắc mình có dữ liệu mới nhất"
                        → hệ KHÔNG KHẢ DỤNG với B

   CHỌN A (khả dụng) :  nút B trả về x=5 (dữ liệu CŨ)
                        → hệ vẫn chạy, nhưng KHÔNG NHẤT QUÁN
```

### Bản đồ các hệ

| Hệ | Thiên về | Ghi chú |
|---|---|---|
| **PostgreSQL** (một nút) | Không áp dụng | Không phân tán thì không có P |
| **PostgreSQL** + nhân bản đồng bộ | **CP** | Replica chết → ghi bị chặn |
| **PostgreSQL** + nhân bản bất đồng bộ | **AP** | Replica trả dữ liệu cũ |
| **MongoDB** (`w: majority`) | **CP** | Không đủ đa số → từ chối ghi |
| **MongoDB** (`w: 1`) | Thiên AP | Có thể mất ghi khi chuyển đổi |
| **Redis Cluster** | **AP** | Nhân bản bất đồng bộ, có thể mất ghi |
| **Cassandra** | **AP** (cấu hình được) | Điều chỉnh qua mức nhất quán |
| **etcd / ZooKeeper / Consul** | **CP** | Dựa trên Raft/Paxos, mất đa số → dừng |
| **CockroachDB / Spanner** | **CP** | Ưu tiên đúng đắn tuyệt đối |
| **DynamoDB** | Cấu hình được | Đọc nhất quán mạnh hoặc cuối cùng |

Dòng đầu tiên đáng chú ý: **CAP chỉ áp dụng cho hệ phân tán**. Một PostgreSQL đơn lẻ không "chọn CP" — nó đơn giản không nằm trong bài toán.

### PACELC — mở rộng thực dụng hơn

CAP chỉ nói về lúc mạng đứt. Nhưng mạng đứt là chuyện **hiếm**. PACELC bổ sung phần còn lại:

```text
   NẾU (P) mạng đứt  →  chọn giữa (A) khả dụng và (C) nhất quán
   NGƯỢC LẠI (E)     →  chọn giữa (L) độ trễ thấp và (C) nhất quán
```

```text
   Vi du:
     PostgreSQL đồng bộ : PC / EC   — luôn ưu tiên nhất quán
     Cassandra          : PA / EL   — luôn ưu tiên khả dụng và độ trễ
     MongoDB            : PC / EC   — nhưng điều chỉnh được
     DynamoDB           : PA / EL   — mac dinh
```

PACELC hữu dụng hơn CAP trong thực tế, vì phần "EL" — đánh đổi giữa **độ trễ** và **nhất quán** khi mạng **bình thường** — mới là thứ bạn đối mặt hàng ngày.

Đây chính xác là đánh đổi đã gặp ở [phase-9 bài 1](../phase-9/01-database-replication-la-gi.md): `synchronous_commit = remote_apply` chọn C và trả giá bằng L; `off` chọn L và trả giá bằng C.

### Ba hiểu lầm phổ biến về CAP

```text
   ❌ "Chọn 2 trong 3"
   ✔  P không phải lựa chọn. Chỉ chọn C hay A KHI P xảy ra.

   ❌ "NoSQL là AP, SQL là CP"
   ✔  Phụ thuộc CẤU HÌNH, không phụ thuộc loại sản phẩm.
      PostgreSQL bất đồng bộ là AP. MongoDB w:majority là CP.

   ❌ "Hệ AP thì không đáng tin"
   ✔  Rất nhiều nghiệp vụ chấp nhận được dữ liệu trễ vài trăm ms.
      Đếm lượt thích, gợi ý sản phẩm, thống kê — đều ổn với AP.
      Chỉ tiền bạc, tồn kho, chỗ ngồi mới thực sự cần C.
```

---

## Chọn mức nhất quán theo nghiệp vụ

Cách áp dụng CAP vào quyết định thật:

| Loại dữ liệu | Cần | Vì sao |
|---|---|---|
| Số dư tài khoản | **C tuyệt đối** | Sai một đồng là sai |
| Tồn kho khi đặt hàng | **C** | Bán quá số lượng là mất tiền |
| Chỗ ngồi, vé | **C** | Đặt trùng là sự cố |
| Đếm lượt thích | **A** | Lệch vài trăm mili-giây không ai biết |
| Gợi ý sản phẩm | **A** | Cũ vài phút cũng không sao |
| Thống kê, báo cáo | **A** | Vốn đã là dữ liệu quá khứ |
| Phiên đăng nhập | **A** kèm dính phiên | Ưu tiên độ trễ |
| Cấu hình, cờ tính năng | **A** kèm TTL ngắn | Đọc rất nhiều, đổi rất ít |

Bảng này quan trọng hơn việc thuộc định nghĩa CAP: **một hệ thống thật thường cần cả hai mức, cho các loại dữ liệu khác nhau**.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chạy `KEYS *` trên production | Chặn toàn bộ server nhiều giây | `SCAN`; và `rename-command KEYS ""` |
| Bỏ qua chuyển đổi mã hoá một chiều | Bộ nhớ tăng gấp 4 lần vĩnh viễn | Giữ giá trị dưới ngưỡng; theo dõi `OBJECT ENCODING` |
| Không đặt `vm.overcommit_memory=1` | Redis bị OOM killer giết lúc lưu ảnh chụp | `sysctl vm.overcommit_memory=1` |
| Dùng Redis Cluster mà không dùng hash tag | Thao tác nhiều khoá báo `CROSSSLOT` | `{...}` để nhóm khoá liên quan |
| Coi Redis Cluster là nhất quán mạnh | Mất lệnh ghi khi chuyển đổi | `WAIT`, hoặc dùng hệ CP cho dữ liệu quan trọng |
| Nghĩ CAP là "chọn 2 trong 3" | Hiểu sai bản chất đánh đổi | P bắt buộc; chỉ chọn C hay A khi P xảy ra |
| Áp một mức nhất quán cho toàn hệ thống | Vừa chậm vừa không cần thiết | Chọn theo **từng loại dữ liệu** |
| Bỏ qua `appendfsync` mặc định | Mất tối đa 1 giây dữ liệu mà không biết | Biết mức mình đang chạy, và có ý thức về nó |

## Tóm tắt bài 3

- Redis nhanh nhờ bốn lý do, trong đó **một luồng** là lý do phản trực giác nhất: với thao tác chỉ mất ~200 ns, **chi phí khoá và chuyển ngữ cảnh lớn hơn chính công việc**.
- Hệ quả: **một lệnh chậm chặn tất cả**. `KEYS *` trên 10 triệu khoá làm treo server 2 giây. Luôn dùng `SCAN`, và vô hiệu hoá các lệnh nguy hiểm.
- **Mã hoá bên trong** quyết định bộ nhớ: `listpack` gọn nhưng O(n), `hashtable` tốn nhưng O(1). **Chuyển đổi là một chiều** — vượt ngưỡng một lần là đổi vĩnh viễn, và bộ nhớ có thể tăng **gấp 4 lần**.
- Phân biệt `OBJECT ENCODING` (trả về **tên mã hoá**) với `MEMORY USAGE` (trả về **số byte**).
- **Độ bền của Redis là nút vặn** (`appendfsync always/everysec/no`), và Redis công khai điều đó thay vì giấu. `fork()` cho RDB/AOF có thể làm bộ nhớ tăng gấp đôi — bắt buộc đặt `vm.overcommit_memory=1`.
- **Redis Cluster** chia 16.384 khe; thao tác nhiều khoá cần **hash tag** `{...}` — chính là nhóm cùng vị trí của sharding. Và nó **nhân bản bất đồng bộ**, nên có thể mất lệnh ghi khi chuyển đổi.
- **CAP không phải "chọn 2 trong 3"**: P là bắt buộc, bạn chỉ chọn C hay A **khi** P xảy ra. Và lựa chọn phụ thuộc **cấu hình**, không phụ thuộc loại sản phẩm.
- **PACELC** thực dụng hơn: nó thêm phần "khi mạng bình thường, chọn giữa **độ trễ** và **nhất quán**" — đó mới là đánh đổi bạn đối mặt hàng ngày.
- Một hệ thống thật thường cần **cả hai mức**, cho các loại dữ liệu khác nhau: tiền bạc cần C, lượt thích chỉ cần A.

**Bài kế tiếp** → [Phase 14 — Bài 1: Bảo mật kết nối Database với TLS/SSL](../phase-14/01-bao-mat-ket-noi-database-tls.md)
