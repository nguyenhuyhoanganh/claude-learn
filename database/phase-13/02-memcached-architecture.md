# Bài 2: Kiến trúc Memcached — sự đơn giản có chủ đích

Memcached ra đời năm 2003 cho LiveJournal, và hai mươi năm sau vẫn chạy ở Facebook, Wikipedia, Twitter, Reddit. Điều đáng học nhất ở nó không phải tính năng — mà là **những gì nó cố tình KHÔNG làm**.

```text
   MEMCACHED KHONG CO:
     ✘ Luu xuong dia         ✘ Nhan ban
     ✘ Kieu du lieu          ✘ Transaction
     ✘ Truy van              ✘ Xac thuc manh
     ✘ Cum tich hop san      ✘ Bien co / thong bao

   MEMCACHED CO:
     ✔ get / set / delete tren chuoi byte
     ✔ TTL
     ✔ Nhanh, on dinh, du doan duoc
```

Danh sách "không có" dài hơn danh sách "có". Đó là chủ đích thiết kế, và bài này giải thích vì sao nó lại thành công.

## Kiến trúc tổng thể

```text
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ APP 1   │  │ APP 2   │  │ APP 3   │
   └────┬────┘  └────┬────┘  └────┬────┘
        │            │            │
        └────────────┼────────────┘
                     │  CLIENT tu quyet dinh di dau
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ MEMCD 1 │  │ MEMCD 2 │  │ MEMCD 3 │
   │ 64 GB   │  │ 64 GB   │  │ 64 GB   │
   └─────────┘  └─────────┘  └─────────┘
        ▲            ▲            ▲
        └── CHUNG KHONG BIET NHAU TON TAI ──┘
```

Đây là đặc điểm kiến trúc quan trọng nhất: **các máy chủ Memcached hoàn toàn độc lập**. Không có giao thức đồng bộ, không có bầu chọn lãnh đạo, không có gì cả.

Việc định tuyến hoàn toàn nằm ở **client**, dùng **băm nhất quán** ([phase-7 bài 1](../phase-7/01-database-sharding-la-gi.md)):

```python
from pymemcache.client.hash import HashClient

client = HashClient([
    ('memcd1', 11211),
    ('memcd2', 11211),
    ('memcd3', 11211),
])
client.set('user:42', 'du lieu')     # thu vien tu chon may
```

Lợi ích của thiết kế này:

```text
   ✔ Khong co diem chet don
   ✔ Them may = them dung luong TUYEN TINH, khong can cau hinh gi
   ✔ Mot may chet → chi mat 1/N cache, cac may khac khong biet
   ✔ Khong co chi phi dong bo
   ✔ Van hanh cuc ky don gian
```

---

## Quản lý bộ nhớ — slab allocator

Đây là phần kỹ thuật đáng học nhất của Memcached.

### Vấn đề: phân mảnh bộ nhớ

```text
   Neu dung malloc/free thong thuong:
     cap 100 byte, giai phong
     cap 340 byte, giai phong
     cap  27 byte, giai phong
     ...
   → bo nho day cac lo trong kich thuoc le
   → cap mot khoi 500 byte → khong co lo nao vua
   → PHAN MANH: con nhieu bo nho trong nhung KHONG DUNG DUOC
```

Với một tiến trình chạy nhiều tháng và cấp phát hàng tỷ lần, phân mảnh sẽ giết nó.

### Lời giải: chia thành các lớp kích thước cố định

```text
   BO NHO CHIA THANH CAC TRANG (SLAB PAGE) 1 MB
   Moi trang thuoc mot LOP (slab class) voi kich thuoc chunk CO DINH

   Lop 1  : chunk  96 byte  →  1 MB / 96   = 10.922 chunk
   Lop 2  : chunk 120 byte  →  1 MB / 120  =  8.738 chunk
   Lop 3  : chunk 152 byte  →  1 MB / 152  =  6.898 chunk
   Lop 4  : chunk 192 byte
   ...
   Lop 42 : chunk 1 MB

   He so tang mac dinh: 1,25 (moi lop lon hon lop truoc 25%)
```

Lưu một giá trị:

```text
   Gia tri 130 byte
     → tim lop nho nhat VUA: lop 3 (152 byte)
     → dat vao mot chunk trong cua lop 3
     → LANG PHI 22 byte  (152 − 130)
```

```text
   ƯU:  cap phat va giai phong O(1), KHONG BAO GIO phan manh
   NHUOC: lang phi trung binh ~10-25% (goi la "slab overhead")
```

### Cái bẫy: nghẽn lớp (slab calcification)

Đây là vấn đề vận hành thật, và rất khó chẩn đoán nếu không biết trước:

```text
   Ngay 1: ung dung luu toan gia tri ~100 byte
           → gan het bo nho duoc CAP CHO LOP 2
           ┌────────────────────────────────────┐
           │ Lop 2: 60 GB   Lop 8: 4 GB         │
           └────────────────────────────────────┘

   Ngay 30: ung dung doi sang luu gia tri ~5 KB (lop 8)
           → lop 8 DAY, bat dau xoa du lieu (evict)
           → lop 2 con 60 GB TRONG nhung KHONG TRA LAI DUOC
           ┌────────────────────────────────────┐
           │ Lop 2: 60 GB (trong!)  Lop 8: DAY  │
           └────────────────────────────────────┘

   → Ti le trung cache SUP, du con 60 GB RAM chua dung
```

Chẩn đoán:

```bash
echo "stats slabs" | nc localhost 11211
```

```text
STAT 2:chunk_size 120
STAT 2:total_pages 61440          ← 60 GB cap cho lop 2
STAT 2:used_chunks 1204           ← ma chi dung 1.204 chunk!
STAT 8:chunk_size 5920
STAT 8:total_pages 4096
STAT 8:used_chunks 177234
STAT 8:evicted 8842119            ← lop 8 dang xoa dien cuong
```

Hai con số cạnh nhau — lớp 2 gần như rỗng, lớp 8 đang xoá hàng triệu mục — là dấu hiệu rõ ràng.

Cách chữa:

```bash
# Bat tai phan bo trang giua cac lop (mac dinh TAT o ban cu)
memcached -o slab_reassign,slab_automove=1

# Hoac dieu chinh he so tang de it lop hon, moi lop rong hon
memcached -f 1.5
```

Từ Memcached 1.5, `slab_automove` bật mặc định — nhưng rất nhiều hệ thống vẫn chạy bản cũ hoặc cấu hình cũ.

---

## LRU và cách xoá mục

```text
   MOI LOP co danh sach LRU RIENG.
   Khi lop day → xoa muc IT DUOC DUNG NHAT trong LOP DO.

   → Muc bi xoa KHONG PHAI muc it dung nhat toan cuc,
     ma la muc it dung nhat TRONG LOP KICH THUOC DO.
```

Memcached 1.5 cải tiến thành **LRU phân đoạn**:

```text
   HOT   →  muc vua duoc truy cap
   WARM  →  muc duoc truy cap lai it nhat mot lan
   COLD  →  ung vien bi xoa
   TEMP  →  muc co TTL rat ngan, khong len HOT

   Mot luong nen di chuyen muc giua cac doan
   → tranh duoc hien tuong mot dot quet lam troi sach cache
```

Đoạn `TEMP` giải quyết một vấn đề thực tế: các mục có TTL 5 giây không nên đẩy các mục có TTL 1 giờ ra khỏi cache.

---

## Mô hình luồng và giao thức

### Đa luồng thật sự

```text
   MEMCACHED                          REDIS
   ═════════                          ═════
   NHIEU LUONG (mac dinh 4)           MOT LUONG cho lenh
   → tan dung nhieu loi CPU           → don gian, khong can khoa
   → can khoa noi bo                  → nhung gioi han o 1 loi

   → Memcached thuong cho THONG LUONG cao hon tren may nhieu loi
     cho cac thao tac get/set thuan tuy
```

```bash
memcached -t 8      # 8 luong
```

Số luồng quá cao gây tranh chấp khoá nội bộ; con số thực dụng là **4-8**, hiếm khi cần hơn.

### Hai giao thức

```text
   VAN BAN (de go loi, de doc)
     set user:42 0 3600 5\r\n
     hello\r\n
     → STORED

   NHI PHAN (nho hon, nhanh hon)
     header 24 byte + payload

   → Nen dung nhi phan trong san pham that.
     Van ban rat tien de chan doan bang telnet/nc.
```

Chẩn đoán nhanh không cần công cụ gì:

```bash
echo -e "get user:42\r" | nc localhost 11211
echo "stats" | nc localhost 11211
echo "stats items" | nc localhost 11211
```

---

## Memcached vs Redis

Đây là so sánh được hỏi nhiều nhất, và câu trả lời đúng phụ thuộc vào bài toán:

| | Memcached | Redis |
|---|---|---|
| Kiểu dữ liệu | Chỉ chuỗi byte | **String, list, set, hash, sorted set, stream, bitmap, HLL** |
| Đa luồng | **Có** | Một luồng cho lệnh (I/O đa luồng từ 6.0) |
| Lưu xuống đĩa | Không | **Có** (RDB, AOF) |
| Nhân bản | Không | **Có** |
| Cụm tích hợp | Không (client tự lo) | **Có** (Redis Cluster) |
| Transaction | Không | Có (`MULTI`/`EXEC`) |
| Script phía server | Không | **Có** (Lua) |
| Publish/subscribe | Không | **Có** |
| Bộ nhớ cho giá trị nhỏ | **Ít hơn** (~50-60 byte overhead) | Nhiều hơn (~90-100 byte) |
| Xoá khi đầy | LRU theo lớp | **Nhiều chính sách** cấu hình được |
| Vận hành | **Đơn giản hơn nhiều** | Phức tạp hơn |

### Khi nào Memcached vẫn tốt hơn

```text
   ✔ Chi can cache thuan tuy: get/set/delete
   ✔ Gia tri co kich thuoc TUONG TU nhau (tranh nghen lop)
   ✔ May nhieu loi, can thong luong toi da
   ✔ Muon van hanh don gian nhat co the
   ✔ Cache RAT LON (hang tram GB) — Memcached xu ly tot
```

### Khi nào Redis tốt hơn

```text
   ✔ Can cau truc du lieu (hang doi, bang xep hang, tap hop)
   ✔ Can du lieu song sot qua khoi dong lai
   ✔ Can nhan ban / san sang cao
   ✔ Can pub/sub hoac stream
   ✔ Can thao tac nguyen tu phuc tap (script Lua)
```

Quy tắc gọn:

> **Chỉ cần cache → Memcached. Cần nhiều hơn cache → Redis.**

Và trong thực tế, phần lớn đội chọn Redis vì nó làm được cả hai — chấp nhận vận hành phức tạp hơn một chút để đổi lấy chỉ phải học một công cụ.

---

## Mẫu dùng trong production

### Cache-Aside

```python
def lay_nguoi_dung(user_id):
    khoa = f'user:{user_id}'
    du_lieu = mc.get(khoa)
    if du_lieu is not None:
        return json.loads(du_lieu)

    nguoi_dung = db.query("SELECT * FROM users WHERE id = %s", (user_id,))
    mc.set(khoa, json.dumps(nguoi_dung), expire=3600)
    return nguoi_dung
```

### Chống dồn dập khi cache hết hạn

```text
   VAN DE: mot khoa NONG het han
     → 10.000 request cung luc thay cache truot
     → 10.000 truy van dong thoi xuong database
     → DATABASE SUP

   Goi la "dam dong sam set" (thundering herd) hoac "cache stampede"
```

Ba cách chống:

```python
# CACH 1 — Khoa: chi MOT request duoc di lay du lieu
def lay_co_khoa(khoa, ham_lay, ttl=3600):
    du_lieu = mc.get(khoa)
    if du_lieu is not None:
        return json.loads(du_lieu)

    khoa_lock = f'lock:{khoa}'
    if mc.add(khoa_lock, '1', expire=10):        # `add` chi thanh cong neu CHUA CO
        try:
            du_lieu = ham_lay()
            mc.set(khoa, json.dumps(du_lieu), expire=ttl)
            return du_lieu
        finally:
            mc.delete(khoa_lock)
    else:
        time.sleep(0.05)                          # nguoi khac dang lay, cho chut
        return lay_co_khoa(khoa, ham_lay, ttl)
```

```python
# CACH 2 — Lam moi som: lam moi TRUOC khi het han
def lay_lam_moi_som(khoa, ham_lay, ttl=3600, som=300):
    goi = mc.get(khoa)
    if goi:
        d = json.loads(goi)
        if d['het_han'] - time.time() > som:
            return d['gia_tri']                   # con xa han, dung luon
        # sap het han → mot so request di lam moi, so con lai dung ban cu
        if random.random() < 0.1:
            d['gia_tri'] = ham_lay()
            mc.set(khoa, json.dumps({'gia_tri': d['gia_tri'],
                                     'het_han': time.time()+ttl}), expire=ttl+60)
        return d['gia_tri']
    ...
```

```python
# CACH 3 — TTL co nhieu ngau nhien: khong de nhieu khoa het han cung luc
mc.set(khoa, du_lieu, expire=3600 + random.randint(0, 600))
```

Cách 3 rẻ nhất và nên áp dụng **mặc định** cho mọi khoá — nó chống được kịch bản tệ nhất là hàng nghìn khoá được nạp cùng lúc (sau khi khởi động lại cache) rồi hết hạn cùng lúc.

### Cache nhiều tầng

```text
   ┌──────────────────────────────────────────────┐
   │  L1: bo nho trong tien trinh (LRU, ~10 MB)   │  ~0,001 ms
   │      → khoa NONG NHAT, TTL rat ngan (5-30s)  │
   ├──────────────────────────────────────────────┤
   │  L2: Memcached (chung, hang tram GB)         │  ~0,3 ms
   ├──────────────────────────────────────────────┤
   │  L3: Database                                │  ~5 ms
   └──────────────────────────────────────────────┘
```

Tầng L1 giải quyết vấn đề mà Memcached không giải được: **độ trễ mạng**. Với khoá cực nóng (cấu hình hệ thống, cờ tính năng), 0,3 ms × 50.000 lần/giây vẫn là chi phí đáng kể.

Đánh đổi: L1 không thể vô hiệu hoá đồng bộ giữa các tiến trình, nên TTL phải rất ngắn.

---

## Theo dõi

```bash
echo "stats" | nc localhost 11211
```

Bốn chỉ số quan trọng nhất:

```text
STAT get_hits 88412993
STAT get_misses 4118822
   → ti le trung = 88.412.993 / (88.412.993 + 4.118.822) = 95,5%

STAT evictions 12849
   → so muc bi XOA vi het bo nho.  Tang deu = CAN THEM RAM

STAT bytes 61203847168
STAT limit_maxbytes 68719476736
   → 61,2 GB / 64 GB = 89% da dung

STAT curr_connections 1842
STAT threads 8
```

| Chỉ số | Ngưỡng cảnh báo |
|---|---|
| Tỉ lệ trúng | **< 90%** — kiểm tra TTL và kích thước cache |
| `evictions` tăng đều | Cache quá nhỏ, hoặc nghẽn lớp |
| `bytes / limit_maxbytes` | **> 90%** — sắp bắt đầu xoá nhiều |
| `evicted_unfetched` cao | Đang lưu những thứ **không bao giờ được đọc** |

Chỉ số cuối rất hữu ích và ít người biết: nó đếm số mục bị xoá mà **chưa từng được `get` lần nào**. Con số cao nghĩa là bạn đang cache nhầm thứ.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Coi Memcached là nơi lưu trữ | Mất sạch khi khởi động lại; không có nhân bản | Chỉ dùng làm cache, luôn có nguồn sự thật |
| Không bật `slab_automove` | Nghẽn lớp — tỉ lệ trúng sụp dù còn RAM trống | `-o slab_reassign,slab_automove=1` |
| Lưu giá trị kích thước rất khác nhau | Nghẽn lớp nặng | Tách thành các cụm Memcached riêng theo kích thước |
| Không có nhiễu ngẫu nhiên trong TTL | Hàng nghìn khoá hết hạn cùng lúc → dồn dập | `expire = base + random(0, base/10)` |
| Không chống dồn dập cho khoá nóng | Một khoá hết hạn làm sập database | Khoá phân tán hoặc làm mới sớm |
| Dùng `hash % N` để định tuyến | Thêm máy = mất gần hết cache | Băm nhất quán (thư viện thường đã có) |
| Lưu giá trị > 1 MB | Bị từ chối (giới hạn mặc định) | Tăng `-I`, hoặc chia nhỏ, hoặc nén |
| Bỏ qua `evicted_unfetched` | Cache đầy những thứ không ai đọc | Theo dõi và rà lại chiến lược cache |

## Tóm tắt bài 2

- Điều đáng học nhất ở Memcached là **những gì nó cố tình không làm**: không đĩa, không nhân bản, không kiểu dữ liệu, không truy vấn — và chính sự đơn giản đó giữ nó sống hai mươi năm.
- **Các máy chủ hoàn toàn độc lập**, không biết nhau tồn tại. Định tuyến nằm ở **client** với **băm nhất quán** — nên không có điểm chết đơn và thêm máy là tuyến tính.
- **Slab allocator** chia bộ nhớ thành các lớp kích thước cố định → cấp phát O(1), **không bao giờ phân mảnh**, đổi lại lãng phí ~10-25%.
- **Nghẽn lớp** là cái bẫy vận hành nguy hiểm nhất: bộ nhớ đã cấp cho một lớp **không trả lại được**, nên đổi kích thước giá trị có thể làm sụp tỉ lệ trúng dù còn hàng chục GB trống. Chẩn đoán bằng `stats slabs`, chữa bằng `slab_automove`.
- Memcached **đa luồng thật**, thường cho thông lượng cao hơn Redis trên máy nhiều lõi cho get/set thuần tuý.
- Quy tắc chọn: **chỉ cần cache → Memcached; cần nhiều hơn cache → Redis.**
- Chống **dồn dập khi cache hết hạn** bằng ba cách: khoá phân tán, làm mới sớm, và — rẻ nhất, nên làm mặc định — **thêm nhiễu ngẫu nhiên vào TTL**.
- Chỉ số ít biết nhưng rất hữu ích: **`evicted_unfetched`** — số mục bị xoá mà chưa từng được đọc, cho biết bạn đang cache nhầm thứ.

**Bài kế tiếp** → [Bài 3: Redis Internals và CAP Theorem](03-redis-va-cap-theorem.md)
