# Bài 3: Redis Internals và định lý CAP

Bài này nhìn Redis từ góc **nội tại lưu trữ** — vì sao nó nhanh, nó đánh đổi gì — rồi mở rộng sang định lý CAP, khung tư duy để hiểu **mọi** hệ phân tán.

> Khoá [redis](../../redis/README.md) trong workspace này đi sâu vào cách **dùng** Redis: các kiểu dữ liệu, lệnh, mẫu thiết kế. Bài này bổ sung góc nhìn khác: Redis **hoạt động thế nào bên trong** và nó nằm ở đâu trên bản đồ hệ phân tán.

## Vì sao Redis nhanh

Bốn lý do, và lý do thứ tư là lý do phản trực giác nhất:

```text
   1. TOAN BO DU LIEU TRONG RAM
      → khong bao gio cham dia trong duong doc/ghi
      → ~100 nanogiay thay vi ~100 microgiay

   2. CAU TRUC DU LIEU TOI UU SAN
      → khong phai phan tich SQL, khong lap ke hoach, khong toi uu
      → GET la mot lan tra bang bam: O(1)

   3. GIAO THUC RESP CUC GON
      → phan tich rat nhanh, khong co dong goi nang ne

   4. MOT LUONG CHO LENH   ← phan truc giac
      → khong co khoa
      → khong co chuyen ngu canh
      → khong co dieu kien tranh chap
      → moi lenh la NGUYEN TU MIEN PHI
```

Điểm 4 xứng đáng nói kỹ. Trực giác nói "nhiều luồng thì nhanh hơn", nhưng với thao tác chỉ mất **vài trăm nanogiây**, chi phí lấy khoá và chuyển ngữ cảnh **lớn hơn chính công việc**.

```text
   THAO TAC MAT 200 ns
   ═══════════════════
   Lay/tra khoa mutex   : ~20-100 ns    → 10-50% chi phi thuan tuy
   Chuyen ngu canh      : ~1.000-3.000 ns → GAP 5-15 LAN cong viec

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
   → Do tre p99 tang vot, va khong co canh bao nao truoc.
```

Đây là nguyên nhân sự cố Redis phổ biến nhất. Cách phòng:

```bash
# Vo hieu hoa cac lenh nguy hiem trong san pham that
rename-command KEYS ""
rename-command FLUSHALL ""
rename-command FLUSHDB ""
```

```bash
# Theo doi lenh cham
redis-cli CONFIG SET slowlog-log-slower-than 10000    # 10 ms
redis-cli SLOWLOG GET 10
```

Và luôn dùng `SCAN` thay `KEYS`:

```text
   KEYS pattern   →  O(n), CHAN toan bo server
   SCAN cursor    →  lap dan, moi lan tra ve mot phan, KHONG chan
```

---

## Mã hoá — cùng kiểu dữ liệu, nhiều cách lưu

Đây là phần nội tại thú vị nhất và có tác động lớn nhất tới bộ nhớ.

```text
   MOT KIEU DU LIEU (vi du: Hash) CO NHIEU MA HOA BEN TRONG

   Nho  →  listpack   : mang phang, quet tuyen tinh O(n)
                        → RAT gon, tot voi it phan tu
   Lon  →  hashtable  : bang bam that, O(1)
                        → ton hon nhieu, nhung nhanh voi nhieu phan tu
```

Ngưỡng chuyển đổi:

```bash
redis-cli CONFIG GET hash-max-listpack-entries    # 128
redis-cli CONFIG GET hash-max-listpack-value      # 64
```

```text
   Hash co <= 128 truong VA moi gia tri <= 64 byte  →  listpack
   Vuot MOT trong hai nguong                        →  hashtable
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
redis-cli HDEL h1 f3                    # xoa truong dai di
redis-cli OBJECT ENCODING h1
```

```text
"hashtable"        ← VAN LA hashtable, KHONG quay ve listpack
```

```text
   → Chi MOT lan vuot nguong la ma hoa doi VINH VIEN
   → Bo nho khong bao gio quay lai muc cu
   → Muon quay ve: phai XOA khoa va tao lai
```

Tác động thực tế có thể rất lớn:

```text
   1 TRIEU hash, moi cai 10 truong nho
     listpack  :  ~104 byte/hash  →  104 MB
     hashtable :  ~400 byte/hash  →  400 MB

   → Chi vi MOT truong vuot 64 byte trong moi hash,
     bo nho tang GAP 4 LAN.
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
redis-cli --bigkeys          # tim khoa lon nhat moi kieu
redis-cli --memkeys          # tim khoa ton bo nho nhat
redis-cli MEMORY USAGE khoa  # bo nho THAT cua mot khoa
redis-cli MEMORY DOCTOR      # goi y tu Redis
redis-cli INFO memory
```

Chú ý phân biệt hai lệnh hay bị nhầm:

```text
   OBJECT ENCODING khoa   →  tra ve TEN MA HOA ("listpack", "hashtable")
   MEMORY USAGE khoa      →  tra ve SO BYTE
                             (co tuy chon SAMPLES n de lay mau)
```

---

## Độ bền — Redis chọn được mức

Redis **không** phải cache thuần tuý; nó lưu xuống đĩa được, và cho bạn chọn mức đảm bảo:

```text
   RDB (anh chup)                     AOF (nhat ky nhung lenh ghi)
   ═════════════                      ════════════════════════════
   Dinh ky luu toan bo trang thai     Ghi lai MOI lenh thay doi du lieu
   → file nho, khoi phuc nhanh        → file lon, khoi phuc cham hon
   → MAT du lieu giua hai lan chup    → mat toi da theo appendfsync
   → fork() tao ban sao → dung        → ghi lai dinh ky de gon lai
     bo nho tam thoi tang vot
```

```bash
# appendfsync — nut van do ben
appendfsync always     # fsync moi lenh — khong mat gi, cham nhat
appendfsync everysec   # fsync moi giay — mat toi da 1 giay  (MAC DINH)
appendfsync no         # de he dieu hanh quyet — co the mat ~30 giay
```

Đây là ví dụ đẹp cho nguyên tắc ở [phase-2 bài 2](../phase-2/02-atomicity-va-durability.md): **độ bền là nút vặn, không phải công tắc**. Redis công khai điều đó thay vì giấu đi.

### Cái bẫy của `fork()`

```text
   Ca RDB lan viec ghi lai AOF deu dung fork().

   Linh vuc copy-on-write: ban sao ban dau khong ton bo nho.
   NHUNG neu ung dung dang ghi nhieu trong luc fork chay:
     → cac page bi sua phai duoc SAO CHEP THAT
     → bo nho co the tang toi GAP DOI trong thoi gian ngan
     → neu may khong du RAM → OOM killer giet Redis
```

Phòng thủ:

```bash
# Cho phep cap phat vuot muc — BAT BUOC voi Redis
sysctl vm.overcommit_memory=1
```

Không đặt tham số này là nguyên nhân số một khiến Redis bị giết lúc lưu ảnh chụp.

---

## Redis Cluster

```text
   16.384 KHE BAM (hash slot) chia cho cac nut

   slot = CRC16(khoa) mod 16384

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
   Ca hai khoa deu bam theo "42"
   → cung mot khe → cung mot nut → thao tac nhieu khoa CHAY DUOC
```

Đây chính là kỹ thuật **nhóm cùng vị trí** ở [phase-7 bài 1](../phase-7/01-database-sharding-la-gi.md), áp cho Redis.

### Cluster không đảm bảo nhất quán mạnh

```text
   Redis Cluster dung nhan ban BAT DONG BO.

   1. Client ghi vao primary → primary tra ve OK NGAY
   2. Primary chet TRUOC KHI kip nhan ban
   3. Replica duoc thang cap
   → LENH GHI DO BIEN MAT
```

Redis ghi rõ điều này trong tài liệu. Nếu cần đảm bảo mạnh hơn:

```bash
WAIT 1 1000     # cho it nhat 1 replica xac nhan, toi da 1000 ms
```

Nhưng `WAIT` **không phải** commit hai pha — nó chỉ giảm cửa sổ mất dữ liệu, không loại bỏ hoàn toàn.

---

## Định lý CAP

Bây giờ tới khung tư duy tổng quát cho **mọi** hệ phân tán.

```text
   Trong mot he PHAN TAN, khi mang bi CHIA CAT (partition),
   ban phai chon giua:

        C — Consistency  (nhat quan): moi nut tra ve du lieu MOI NHAT
        A — Availability (kha dung) : moi yeu cau deu duoc tra loi
        P — Partition tolerance     : he van chay khi mang dut

   → P KHONG PHAI LUA CHON. Mang SE dut.
   → Nen thuc te chi la: chon C hay chon A khi P xay ra.
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
                                     ghi x=9      doc x = ?

   CHON C (nhat quan):  nut B TU CHOI tra loi
                        → "toi khong chac minh co du lieu moi nhat"
                        → he KHONG KHA DUNG voi B

   CHON A (kha dung) :  nut B tra ve x=5 (du lieu CU)
                        → he van chay, nhung KHONG NHAT QUAN
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
   NEU (P) mang dut  →  chon giua (A) kha dung va (C) nhat quan
   NGUOC LAI (E)     →  chon giua (L) do tre thap va (C) nhat quan
```

```text
   Vi du:
     PostgreSQL dong bo : PC / EC   — luon uu tien nhat quan
     Cassandra          : PA / EL   — luon uu tien kha dung va do tre
     MongoDB            : PC / EC   — nhung dieu chinh duoc
     DynamoDB           : PA / EL   — mac dinh
```

PACELC hữu dụng hơn CAP trong thực tế, vì phần "EL" — đánh đổi giữa **độ trễ** và **nhất quán** khi mạng **bình thường** — mới là thứ bạn đối mặt hàng ngày.

Đây chính xác là đánh đổi đã gặp ở [phase-9 bài 1](../phase-9/01-database-replication-la-gi.md): `synchronous_commit = remote_apply` chọn C và trả giá bằng L; `off` chọn L và trả giá bằng C.

### Ba hiểu lầm phổ biến về CAP

```text
   ❌ "Chon 2 trong 3"
   ✔  P khong phai lua chon. Chi chon C hay A KHI P xay ra.

   ❌ "NoSQL la AP, SQL la CP"
   ✔  Phu thuoc CAU HINH, khong phu thuoc loai san pham.
      PostgreSQL bat dong bo la AP. MongoDB w:majority la CP.

   ❌ "He AP thi khong dang tin"
   ✔  Rat nhieu nghiep vu chap nhan duoc du lieu tre vai tram ms.
      Dem luot thich, goi y san pham, thong ke — deu on voi AP.
      Chi tien bac, ton kho, cho ngoi moi thuc su can C.
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
