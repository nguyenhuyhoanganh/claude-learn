# Bài 2: Kiến trúc Memcached — sự đơn giản có chủ đích

Memcached ra đời năm 2003 cho LiveJournal, và hai mươi năm sau vẫn chạy ở Facebook, Wikipedia, Twitter, Reddit. Điều đáng học nhất ở nó không phải tính năng — mà là **những gì nó cố tình KHÔNG làm**.

```text
   MEMCACHED KHONG CO:
     ✘ Lưu xuống đĩa         ✘ Nhân bản
     ✘ Kiểu dữ liệu          ✘ Transaction
     ✘ Truy vấn              ✘ Xác thực mạnh
     ✘ Cụm tích hợp sẵn      ✘ Biến cố / thông báo

   MEMCACHED CO:
     ✔ get / set / delete trên chuỗi byte
     ✔ TTL
     ✔ Nhanh, ổn định, dự đoán được
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
client.set('user:42', 'du lieu')     # thư viện tự chọn máy
```

Lợi ích của thiết kế này:

```text
   ✔ Không có điểm chết đơn
   ✔ Thêm máy = thêm dung lượng TUYẾN TÍNH, không cần cấu hình gì
   ✔ Một máy chết → chỉ mất 1/N cache, các máy khác không biết
   ✔ Không có chi phí đồng bộ
   ✔ Vận hành cực kỳ đơn giản
```

---

## Quản lý bộ nhớ — slab allocator

Đây là phần kỹ thuật đáng học nhất của Memcached.

### Vấn đề: phân mảnh bộ nhớ

```text
   Nếu dùng malloc/free thông thường:
     cap 100 byte, giai phong
     cap 340 byte, giai phong
     cap  27 byte, giai phong
     ...
   → bộ nhớ đầy các lỗ trống kích thước lẻ
   → cấp một khối 500 byte → không có lỗ nào vừa
   → PHÂN MẢNH: còn nhiều bộ nhớ trống nhưng KHÔNG DÙNG ĐƯỢC
```

Với một tiến trình chạy nhiều tháng và cấp phát hàng tỷ lần, phân mảnh sẽ giết nó.

### Lời giải: chia thành các lớp kích thước cố định

```text
   BO NHO CHIA THANH CAC TRANG (SLAB PAGE) 1 MB
   Mỗi trang thuộc một LỚP (slab class) với kích thước chunk CỐ ĐỊNH

   Lop 1  : chunk  96 byte  →  1 MB / 96   = 10.922 chunk
   Lop 2  : chunk 120 byte  →  1 MB / 120  =  8.738 chunk
   Lop 3  : chunk 152 byte  →  1 MB / 152  =  6.898 chunk
   Lop 4  : chunk 192 byte
   ...
   Lop 42 : chunk 1 MB

   Hệ số tăng mặc định: 1,25 (mỗi lớp lớn hơn lớp trước 25%)
```

Lưu một giá trị:

```text
   Gia tri 130 byte
     → tìm lớp nhỏ nhất VỪA: lớp 3 (152 byte)
     → đặt vào một chunk trống của lớp 3
     → LANG PHI 22 byte  (152 − 130)
```

```text
   ƯU:  cap phat va giai phong O(1), KHONG BAO GIO phan manh
   NHƯỢC: lãng phí trung bình ~10-25% (gọi là "slab overhead")
```

### Cái bẫy: nghẽn lớp (slab calcification)

Đây là vấn đề vận hành thật, và rất khó chẩn đoán nếu không biết trước:

```text
   Ngày 1: ứng dụng lưu toàn giá trị ~100 byte
           → gần hết bộ nhớ được CẤP CHO LỚP 2
           ┌────────────────────────────────────┐
           │ Lop 2: 60 GB   Lop 8: 4 GB         │
           └────────────────────────────────────┘

   Ngày 30: ứng dụng đổi sang lưu giá trị ~5 KB (lớp 8)
           → lớp 8 ĐẦY, bắt đầu xoá dữ liệu (evict)
           → lớp 2 còn 60 GB TRỐNG nhưng KHÔNG TRẢ LẠI ĐƯỢC
           ┌────────────────────────────────────┐
           │ Lớp 2: 60 GB (trống!)  Lớp 8: ĐẦY  │
           └────────────────────────────────────┘

   → Tỉ lệ trúng cache SỤP, dù còn 60 GB RAM chưa dùng
```

Chẩn đoán:

```bash
echo "stats slabs" | nc localhost 11211
```

```text
STAT 2:chunk_size 120
STAT 2:total_pages 61440          ← 60 GB cấp cho lớp 2
STAT 2:used_chunks 1204           ← mà chỉ dùng 1.204 chunk!
STAT 8:chunk_size 5920
STAT 8:total_pages 4096
STAT 8:used_chunks 177234
STAT 8:evicted 8842119            ← lớp 8 đang xoá điên cuồng
```

Hai con số cạnh nhau — lớp 2 gần như rỗng, lớp 8 đang xoá hàng triệu mục — là dấu hiệu rõ ràng.

Cách chữa:

```bash
# Bật tái phân bổ trang giữa các lớp (mặc định TẮT ở bản cũ)
memcached -o slab_reassign,slab_automove=1

# Hoặc điều chỉnh hệ số tăng để ít lớp hơn, mỗi lớp rộng hơn
memcached -f 1.5
```

Từ Memcached 1.5, `slab_automove` bật mặc định — nhưng rất nhiều hệ thống vẫn chạy bản cũ hoặc cấu hình cũ.

---

## LRU và cách xoá mục

```text
   MỖI LỚP có danh sách LRU RIÊNG.
   Khi lớp đầy → xoá mục ÍT ĐƯỢC DÙNG NHẤT trong LỚP ĐÓ.

   → Mục bị xoá KHÔNG PHẢI mục ít dùng nhất toàn cục,
     mà là mục ít dùng nhất TRONG LỚP KÍCH THƯỚC ĐÓ.
```

Memcached 1.5 cải tiến thành **LRU phân đoạn**:

```text
   HOT   →  mục vừa được truy cập
   WARM  →  mục được truy cập lại ít nhất một lần
   COLD  →  ứng viên bị xoá
   TEMP  →  mục có TTL rất ngắn, không lên HOT

   Một luồng nền di chuyển mục giữa các đoạn
   → tránh được hiện tượng một đợt quét làm trôi sạch cache
```

Đoạn `TEMP` giải quyết một vấn đề thực tế: các mục có TTL 5 giây không nên đẩy các mục có TTL 1 giờ ra khỏi cache.

---

## Mô hình luồng và giao thức

### Đa luồng thật sự

```text
   MEMCACHED                          REDIS
   ═════════                          ═════
   NHIỀU LUỒNG (mặc định 4)           MỘT LUỒNG cho lệnh
   → tận dụng nhiều lõi CPU           → đơn giản, không cần khoá
   → cần khoá nội bộ                  → nhưng giới hạn ở 1 lõi

   → Memcached thường cho THÔNG LƯỢNG cao hơn trên máy nhiều lõi
     cho các thao tác get/set thuần tuý
```

```bash
memcached -t 8      # 8 luong
```

Số luồng quá cao gây tranh chấp khoá nội bộ; con số thực dụng là **4-8**, hiếm khi cần hơn.

### Hai giao thức

```text
   VĂN BẢN (dễ gỡ lỗi, dễ đọc)
     set user:42 0 3600 5\r\n
     hello\r\n
     → STORED

   NHỊ PHÂN (nhỏ hơn, nhanh hơn)
     header 24 byte + payload

   → Nên dùng nhị phân trong sản phẩm thật.
     Văn bản rất tiện để chẩn đoán bằng telnet/nc.
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
   ✔ Giá trị có kích thước TƯƠNG TỰ nhau (tránh nghẽn lớp)
   ✔ Máy nhiều lõi, cần thông lượng tối đa
   ✔ Muốn vận hành đơn giản nhất có thể
   ✔ Cache RẤT LỚN (hàng trăm GB) — Memcached xử lý tốt
```

### Khi nào Redis tốt hơn

```text
   ✔ Cần cấu trúc dữ liệu (hàng đợi, bảng xếp hạng, tập hợp)
   ✔ Cần dữ liệu sống sót qua khởi động lại
   ✔ Cần nhân bản / sẵn sàng cao
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
   VẤN ĐỀ: một khoá NÓNG hết hạn
     → 10.000 request cùng lúc thấy cache trượt
     → 10.000 truy vấn đồng thời xuống database
     → DATABASE SUP

   Gọi là "đám đông sấm sét" (thundering herd) hoặc "cache stampede"
```

Ba cách chống:

```python
# CÁCH 1 — Khoá: chỉ MỘT request được đi lấy dữ liệu
def lay_co_khoa(khoa, ham_lay, ttl=3600):
    du_lieu = mc.get(khoa)
    if du_lieu is not None:
        return json.loads(du_lieu)

    khoa_lock = f'lock:{khoa}'
    if mc.add(khoa_lock, '1', expire=10):        # `add` chỉ thành công nếu CHƯA CÓ
        try:
            du_lieu = ham_lay()
            mc.set(khoa, json.dumps(du_lieu), expire=ttl)
            return du_lieu
        finally:
            mc.delete(khoa_lock)
    else:
        time.sleep(0.05)                          # người khác đang lấy, chờ chút
        return lay_co_khoa(khoa, ham_lay, ttl)
```

```python
# CÁCH 2 — Làm mới sớm: làm mới TRƯỚC khi hết hạn
def lay_lam_moi_som(khoa, ham_lay, ttl=3600, som=300):
    goi = mc.get(khoa)
    if goi:
        d = json.loads(goi)
        if d['het_han'] - time.time() > som:
            return d['gia_tri']                   # còn xa hạn, dùng luôn
        # sắp hết hạn → một số request đi làm mới, số còn lại dùng bản cũ
        if random.random() < 0.1:
            d['gia_tri'] = ham_lay()
            mc.set(khoa, json.dumps({'gia_tri': d['gia_tri'],
                                     'het_han': time.time()+ttl}), expire=ttl+60)
        return d['gia_tri']
    ...
```

```python
# CÁCH 3 — TTL có nhiễu ngẫu nhiên: không để nhiều khoá hết hạn cùng lúc
mc.set(khoa, du_lieu, expire=3600 + random.randint(0, 600))
```

Cách 3 rẻ nhất và nên áp dụng **mặc định** cho mọi khoá — nó chống được kịch bản tệ nhất là hàng nghìn khoá được nạp cùng lúc (sau khi khởi động lại cache) rồi hết hạn cùng lúc.

### Cache nhiều tầng

```text
   ┌──────────────────────────────────────────────┐
   │  L1: bộ nhớ trong tiến trình (LRU, ~10 MB)   │  ~0,001 ms
   │      → khoá NÓNG NHẤT, TTL rất ngắn (5-30s)  │
   ├──────────────────────────────────────────────┤
   │  L2: Memcached (chung, hàng trăm GB)         │  ~0,3 ms
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
   → số mục bị XOÁ vì hết bộ nhớ.  Tăng đều = CẦN THÊM RAM

STAT bytes 61203847168
STAT limit_maxbytes 68719476736
   → 61,2 GB / 64 GB = 89% đã dùng

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
