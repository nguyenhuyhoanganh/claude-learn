# Bài 15: Redis 100 GB xuống 60 GB mà không xoá một dòng dữ liệu

**100 GB.** Sếp muốn kéo xuống còn **60**, và **cấm xoá dữ liệu**.

Đây là câu hỏi cuối của một buổi phỏng vấn backend. Bạn sẽ trả lời thế nào? Thử nghĩ 3 giây trước khi đọc tiếp.

Ba đáp án bật ra nhanh nhất **đều trượt**:

```text
   ① Thêm máy
   ② Bật nén
   ③ Tự xoá bớt
```

Nghe rất hợp lý, và cả ba đều trượt **vì cùng một lý do**: chúng đang đoán sai chỗ Redis thật sự tiêu bộ nhớ.

Thứ quyết định **không nằm ở lượng dữ liệu**. Nó nằm ở một con số trong file cấu hình, và mặc định con số đó là **64**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **Kiểu dữ liệu** (data type) | String, List, Hash, Set, Sorted Set — quyết định bạn được gõ **lệnh nào** | Loại đồ đựng: chai, hộp, túi |
| **Cách lưu / Encoding** | Cách Redis thật sự sắp xếp dữ liệu đó trong RAM — **thứ thật sự trả tiền** | Cách xếp đồ vào bên trong: xếp khít hay để rời từng món |
| **Listpack** | Một **khối byte liền mạch**: các phần tử nối đuôi nhau, **không con trỏ nào** | Xếp đồ khít nhau trong một hộp duy nhất |
| **Ziplist** | Tên cũ của listpack ở các bản Redis trước 7.0 | (Cùng ý tưởng, định dạng cũ hơn) |
| **Hashtable** (bảng băm) | Mỗi trường một ô riêng, tên và giá trị **cấp phát riêng**, có con trỏ nối | Mỗi món một hộp riêng, có nhãn, có mục lục |
| **Cấp phát** (allocation) | Một lần xin bộ nhớ từ hệ thống. **Mỗi lần xin đều bị làm tròn lên** | Mua giấy theo ram, dù chỉ cần 3 tờ |
| **Mức cấp phát** (size class) | Bộ cấp phát chỉ có sẵn vài cỡ khối cố định (8, 16, 32, 64, 96, 128 byte...) | Cửa hàng chỉ bán hộp cỡ S, M, L — không có cỡ giữa |
| **`hash-max-listpack-value`** | Giá trị dài hơn ngưỡng này thì Hash **đổi cách lưu** sang bảng băm. Mặc định **64 byte** | Món đồ dài quá thì không xếp khít được nữa, phải để hộp riêng |
| **`hash-max-listpack-entries`** | Số trường tối đa còn giữ được listpack | Hộp chỉ nhét được ngần này món |
| **`OBJECT ENCODING`** | Lệnh trả về **TÊN cách lưu** của một key (`listpack` hay `hashtable`) | Hỏi: "hộp này xếp kiểu nào?" |
| **`MEMORY USAGE`** | Lệnh trả về **SỐ BYTE** một key đang chiếm | Hỏi: "hộp này nặng bao nhiêu?" |

## Vì sao ba đáp án thông thường đều trượt

### Đáp án 1 — Thêm máy

```text
   Thêm máy chỉ CHIA NHỎ cùng lượng dữ liệu ra nhiều chỗ hơn.

   Tổng bộ nhớ phải mua KHÔNG GIẢM ĐI ĐÂU CẢ.
   Nó còn NHÍCH LÊN, vì mỗi máy cõng thêm phần sổ sách riêng
   (bảng định tuyến cluster, bộ đệm kết nối, phần đầu của mỗi tiến trình).

   Thêm BẢN SAO (replica) còn tệ hơn nữa:
   bản sao giữ NGUYÊN MỘT BẢN ĐẦY ĐỦ,
   nên nó NHÂN ĐÔI chỗ tốn chứ không chia bớt.
```

### Đáp án 2 — Bật nén

Redis **không có nút nén chung** cho dữ liệu đang nằm trong bộ nhớ. Lục hết file cấu hình, mọi chỗ có chữ "nén" đều nằm ngoài chuyện này:

| Tuỳ chọn | Nén cái gì | Có chạm bộ nhớ đang chạy không |
|---|---|---|
| `rdbcompression` | Nén file khi **ghi xuống đĩa** | Không |
| `list-compress-depth` | Nén **phần giữa** của danh sách (mặc định **tắt**) | Chỉ với List, và mặc định tắt |
| `repl-diskless-sync-*`, nén đường truyền | Nén **đường truyền giữa các máy** | Không |

**Không cái nào chạm được vào bộ nhớ đang chạy.**

### Đáp án 3 — Tự xoá bớt

Cái này trượt luôn **đề bài** — vì nó chính là xoá dữ liệu, mà đề bài cấm xoá.

## Tầng ẩn: kiểu dữ liệu ≠ cách lưu

Đáp án thật nằm ở một tầng mà phần lớn người dùng Redis **chưa từng nhìn tới**.

Bạn gõ lệnh tạo Hash, bạn nghĩ Redis dựng cho bạn một bảng băm. **Không hẳn!**

Phải tách hẳn hai thứ ra:

```text
   ┌─ KIỂU DỮ LIỆU ────────────────────────────────────────────┐
   │  Hash, List, Set, Sorted Set...                            │
   │  → quyết định bạn được gõ LỆNH NÀO (HSET, HGET, HDEL...)   │
   │  → Đây là thứ BẠN THẤY.                                    │
   └────────────────────────────────────────────────────────────┘
                             ║  hai tầng TÁCH RỜI nhau
                             ▼
   ┌─ CÁCH LƯU (ENCODING) ─────────────────────────────────────┐
   │  listpack  hay  hashtable?                                 │
   │  → quyết định TỐN BAO NHIÊU BỘ NHỚ                         │
   │  → Đây là thứ TRẢ TIỀN.                                    │
   └────────────────────────────────────────────────────────────┘
```

### Hai cách lưu, khác nhau thế nào

```text
   ═══ DỮ LIỆU NHỎ → LISTPACK ═══════════════════════════════════

   Redis gói TẤT CẢ vào MỘT KHỐI BYTE LIỀN MẠCH:

   ┌───────────────────────────────────────────────────────┐
   │[đầu][len|"ten"][len|"An"][len|"tuoi"][len|"25"][cuối]│
   └───────────────────────────────────────────────────────┘
     ↑ MỘT lần cấp phát duy nhất. KHÔNG con trỏ nào.


   ═══ DỮ LIỆU LỚN → HASHTABLE ══════════════════════════════════

   ┌─ bảng băm ─┐
   │  ô 0  ─────┼──► [mục] ──► tên: [cấp phát riêng "ten"]
   │  ô 1       │              giá trị: [cấp phát riêng "An"]
   │  ô 2  ─────┼──► [mục] ──► tên: [cấp phát riêng "tuoi"]
   │  ...       │              giá trị: [cấp phát riêng "25"]
   └────────────┘

     ↑ Mỗi trường: bảng ô + mục + tên + giá trị = 4 vùng nhớ riêng,
       mỗi vùng LẠI BỊ LÀM TRÒN LÊN mức cấp phát gần nhất.
```

**Ranh giới giữa hai thế giới đó chỉ là một con số trong file cấu hình.**

> **Kiểu dữ liệu là thứ bạn THẤY. Cách lưu mới là thứ TRẢ TIỀN.**

## Bậc thang bộ nhớ: thêm 1 byte, RAM tăng 76,67%

Con số 64 đó cứng đến mức nào? Đội Valkey đo đúng 3 key, mỗi key một Hash chỉ có **một trường**, cùng mẫu tên key và tên trường:

```text
   Độ dài giá trị        Bộ nhớ key đó chiếm      Cách lưu
   ────────────────────────────────────────────────────────────
   49 – 63 byte          104 byte                 listpack
   64 – 79 byte          120 byte    (+15%)       listpack
   65 byte trở lên       212 byte    (+76,67%)    HASHTABLE
```

**Thêm đúng một ký tự, bộ nhớ của key đó tăng hơn ba phần tư.**

### Ở đây có HAI bậc nhảy KHÁC LOẠI nhau — trộn chúng vào là hiểu sai bài

```text
   ┌─ BẬC NHỎ: 104 → 120 byte ────────────────────────────────────┐
   │  VẪN nằm trong khối liền mạch (vẫn là listpack).             │
   │  Nguyên nhân: chỗ ghi ĐỘ DÀI phình từ 1 byte lên 2,          │
   │  đẩy cả khối sang MỨC CẤP PHÁT TO HƠN.                       │
   │  → Đây là bậc của BỘ CẤP PHÁT, không phải bậc đổi cách lưu.  │
   └──────────────────────────────────────────────────────────────┘

   ┌─ BẬC LỚN: 120 → 212 byte ────────────────────────────────────┐
   │  ĐỔI CÁCH LƯU sang hashtable.                                │
   │  Từ 1 vùng nhớ thành 4+ vùng nhớ, mỗi vùng làm tròn riêng.   │
   │  → ĐÂY MỚI LÀ BẬC ĐẮT.                                       │
   └──────────────────────────────────────────────────────────────┘
```

> **Bộ nhớ của Redis không phải đường thẳng đi lên. Nó là HÀM BẬC THANG.**

```text
   bộ nhớ
     │                              ┌──────────  hashtable
     │                              │
     │                              │  ← BẬC ĐẮT (đổi cách lưu)
     │                              │
     │              ┌───────────────┘
     │      ┌───────┘  ← bậc nhỏ (mức cấp phát)
     │──────┘
     └──────────────────────────────────────────► độ dài giá trị
           49    63 64    79 80         64→65
```

Hệ quả thực tiễn rất mạnh: **rút ngắn một giá trị từ 65 byte xuống 63 byte tiết kiệm nhiều hơn là rút từ 200 byte xuống 100 byte** — vì cái đầu vượt qua một bậc thang, cái sau chỉ trượt trong cùng một bậc.

## Câu chuyện thực tế cứu Instagram năm 2011

Mẹo dựa vào chính bậc thang này đã cứu Instagram thật, gần 15 năm trước.

Hồi đó Instagram cần một **bảng ánh xạ 300 triệu tấm ảnh về người đã đăng chúng** — một cấu trúc rất đơn giản: `ảnh → người dùng`.

```text
   ═══ CÁCH NGÂY THƠ: mỗi ảnh một key ════════════════════════════

   SET  photo:1155315   939
   SET  photo:1155316   1425
   ...

   Đo thử: 1 TRIỆU key ngốn 70 MB
   → 300 triệu ảnh = 70 MB × 300 = 21 GB
   → VƯỢT CẢ CỠ MÁY HỌ THUÊ ĐƯỢC.
```

Người viết lõi Redis gợi ý **gom lại thành Hash**:

```text
   ═══ CÁCH GOM NHÓM ════════════════════════════════════════════

   Chia 1 triệu key thành 1.000 NHÓM, mỗi nhóm 1.000 phần tử:

   HSET  photo:1155      315   939      ← nhóm = id / 1000
   HSET  photo:1155      316   1425     ← trường = id % 1000
   ...

   Cùng lượng dữ liệu đó: 70 MB  →  16 MB

   Toàn bộ 300 triệu ánh xạ gói gọn dưới 5 GB
   (vừa một máy rẻ hơn 3 lần).
```

### Vì sao gom nhóm lại rẻ hơn tới 4 lần?

```text
   MỖI KEY trong Redis đều có phần sổ sách riêng:
      • một mục trong bảng băm chính (dict entry)
      • một đối tượng key (chuỗi tên key)
      • một đối tượng value
      • nếu có TTL: thêm một mục trong bảng expires

   → khoảng 60–90 byte MỖI KEY, chỉ để làm sổ sách.

   Gom 1.000 phần tử vào 1 key:
      → trả phần sổ sách đó MỘT LẦN thay vì 1.000 lần
      → và 1.000 phần tử đó nằm trong MỘT KHỐI LIỀN MẠCH,
        không con trỏ nào.
```

### Cái bẫy đi kèm mẹo này

Để nhóm 1.000 phần tử vẫn giữ được listpack, **bạn phải nâng ngưỡng số phần tử**:

```conf
hash-max-listpack-entries 1000
hash-max-listpack-value   64
```

Mặc định của Redis là **128** (Valkey 9.x là **512**). Nếu bạn gom 1.000 phần tử mà quên nâng ngưỡng, **mọi nhóm đều lập tức đổi sang hashtable** và bạn mất trắng toàn bộ lợi ích — thậm chí còn tệ hơn cách ngây thơ.

## Cạm bẫy một chiều: cấu hình sửa rồi mà bộ nhớ không giảm

Tài liệu Redis nói thẳng một câu:

> **Phần tiết kiệm bộ nhớ sẽ MẤT TRẮNG nếu vượt ngưỡng.**

Không log. Không cảnh báo. **Phần tử thứ 1.001 nhét thêm vào một nhóm sẽ âm thầm nuốt sạch lợi ích của cả nhóm đó.**

Và người phỏng vấn sẽ hỏi câu hiểm nhất:

> *"Tôi sửa cấu hình xong rồi, sao bộ nhớ không giảm?"*

**Vì đường quay về chưa từng được viết.**

```text
   Trong mã nguồn có hàm hashTypeConvert():

      listpack  ──────────►  hashtable      CÓ CODE ĐÀNG HOÀNG
      hashtable ──────────►  listpack       DẪN THẲNG VÀO DÒNG
                                            BÁO "Not implemented"
```

Hệ quả:

```text
   ✗ Xoá bớt phần tử KHÔNG BAO GIỜ đưa một Hash về lại khối liền mạch.
   ✗ Sửa cấu hình CHỈ ÁP CHO LẦN GHI TIẾP THEO, không đụng key đã có.
   ✗ Một key đã "lỡ" vượt ngưỡng một lần thì mang cách lưu đắt VĨNH VIỄN.
```

### Muốn thu hồi bộ nhớ thật thì phải làm gì

Phải **dựng lại key từ đầu**. Ba cách, từ nhẹ tới nặng:

| Cách | Làm gì | Gián đoạn |
|---|---|---|
| **Ghi lại từng key** | Đọc key ra, `DEL`, rồi `HSET` lại toàn bộ | Không, nhưng phải làm theo lô và cẩn thận với key đang được ghi |
| **Nạp lại từ file dump** | `BGSAVE` rồi khởi động lại từ RDB — khi nạp lại, Redis chọn cách lưu **theo cấu hình hiện tại** | Có, vài giây tới vài phút |
| **Dựng máy phụ rồi chuyển vai** | Dựng replica với cấu hình mới, đồng bộ, rồi promote | Gần như không |

Cách thứ hai đáng nhớ vì nó giải thích một hiện tượng hay gặp: **khởi động lại Redis xong thấy bộ nhớ tụt hẳn** — không phải vì "khởi động lại thì sạch", mà vì lúc nạp lại từ RDB, mọi key được dựng lại theo ngưỡng cấu hình **hiện tại**.

## Cái giá của việc tăng ngưỡng

> *"Thế đặt ngưỡng lên 100.000 cho chắc ăn?"*

Đây là chỗ phải trả tiền, và trả bằng **thời gian chạy lệnh**:

```text
   ┌─ LISTPACK ────────────────────────────────────────────────────┐
   │  KHÔNG có mục lục. KHÔNG băm.                                  │
   │                                                                │
   │  Tìm một trường  →  QUÉT TUẦN TỰ TỪ ĐẦU KHỐI.       O(n)      │
   │                                                                │
   │  Ghi một trường vào giữa  →  CẤP PHÁT LẠI CẢ KHỐI             │
   │                              và DỊCH TOÀN BỘ PHẦN ĐUÔI. O(n)  │
   └────────────────────────────────────────────────────────────────┘

   ┌─ HASHTABLE ───────────────────────────────────────────────────┐
   │  Tìm một trường  →  băm rồi nhảy thẳng.              O(1)      │
   │  Ghi một trường  →  O(1)                                       │
   └────────────────────────────────────────────────────────────────┘
```

**Ngưỡng càng cao, hai chi phí đó càng phình theo.** Với 100.000 phần tử trong một listpack, mỗi lệnh `HGET` phải lê qua trung bình 50.000 phần tử — và vì Redis **chạy một luồng duy nhất**, lệnh đó **chặn toàn bộ máy chủ** trong lúc nó chạy.

Đây là chỗ nguy hiểm nhất: một key quá to trong listpack không chỉ làm chính nó chậm, nó làm **cả Redis** chậm.

Tệp cấu hình của Valkey cảnh báo đúng chuyện này: *chỉ chỉnh sau khi ĐÃ ĐO trên dữ liệu thật*.

### Con số tham khảo để chọn ngưỡng

```text
   entries ≤   128  →  mặc định Redis, an toàn tuyệt đối
   entries ≤   512  →  mặc định Valkey 9.x, vẫn rất an toàn
   entries ≈ 1.000  →  con số Instagram dùng; đã đo và chấp nhận được
   entries > 5.000  →  BẮT ĐẦU NGUY HIỂM, phải tự đo độ trễ p99
   entries >10.000  →  gần như luôn sai lầm
```

### Đổi cả hành vi API

Một hệ quả rất dễ bị bỏ sót:

```text
   HSCAN trên LISTPACK    →  trả HẾT trong MỘT LẦN, bỏ qua tham số COUNT
   HSCAN trên HASHTABLE   →  trả THEO TỪNG TRANG, đúng như tài liệu mô tả
```

Nghĩa là code duyệt Hash của bạn **chạy khác nhau tuỳ theo key đó lớn hay nhỏ** — và bug chỉ lộ ra khi key vượt ngưỡng trên production.

## ⚠ Đính chính một hiểu lầm phổ biến về `OBJECT ENCODING`

Có một chi tiết hay bị nói sai, kể cả trong nhiều bài viết:

```text
   ✗ SAI:  "OBJECT ENCODING đo bộ nhớ, và nó lấy mẫu 5 phần tử
            với bảng băm nên số không chính xác."

   ✓ ĐÚNG: OBJECT ENCODING trả về TÊN CÁCH LƯU — một chuỗi
            như "listpack" hay "hashtable". Nó KHÔNG trả về byte nào cả.

            Lệnh trả về SỐ BYTE là MEMORY USAGE.
            Và CHÍNH LỆNH NÀY mới là lệnh lấy mẫu:
```

```text
   MEMORY USAGE key [SAMPLES count]

   • Mặc định SAMPLES = 5:
     với kiểu dữ liệu tổng hợp (Hash, List, Set, Sorted Set),
     nó chỉ lấy mẫu 5 phần tử rồi NHÂN RA để ước tính.

   • SAMPLES 0 = quét TOÀN BỘ, chính xác tuyệt đối,
     nhưng ĐẮT — và vì Redis một luồng, quét một key khổng lồ
     sẽ CHẶN CẢ MÁY CHỦ.
```

Nên câu nói đúng là: **`MEMORY USAGE` cho ra hai loại số khác hẳn nhau về bản chất ở hai bên ngưỡng** — với listpack nó đo được khá sát cả khối; với hashtable nó đang **ngoại suy từ 5 mẫu**.

Cách dùng đúng khi cần con số tin cậy:

```bash
redis-cli MEMORY USAGE hot:key SAMPLES 0    # chính xác, dùng trên key VỪA PHẢI
```

## Quy trình kiểm tra hệ của bạn

```bash
# ① Nhìn tổng quan: cái gì đang ăn bộ nhớ
redis-cli INFO memory | grep -E 'used_memory_human|used_memory_rss_human|mem_fragmentation_ratio'

# ② Tìm key to nhất theo từng kiểu dữ liệu (an toàn, dùng SCAN)
redis-cli --bigkeys

# ③ Tìm key tốn bộ nhớ nhất (dùng MEMORY USAGE dưới nền)
redis-cli --memkeys

# ④ Với vài key nóng: xem cách lưu và số byte
redis-cli OBJECT ENCODING  san_pham:42     # → listpack  hay  hashtable
redis-cli MEMORY USAGE     san_pham:42     # → số byte (ước tính từ 5 mẫu)

# ⑤ Gợi ý tự động của Redis
redis-cli MEMORY DOCTOR
```

```python
# ⑥ Thống kê: bao nhiêu phần trăm key đang ở cách lưu đắt?
import redis
r = redis.Redis()
dem = {}
for key in r.scan_iter(match='san_pham:*', count=1000):
    enc = r.object('encoding', key).decode()
    dem[enc] = dem.get(enc, 0) + 1
print(dem)
# {'listpack': 12043, 'hashtable': 88211}
#                                    ↑ 88% đang ở cách lưu đắt
#                                      → đây là chỗ để đi tìm 40 GB
```

## Cùng nguyên lý, áp cho mọi kiểu dữ liệu khác

Ngưỡng listpack không chỉ có ở Hash. **Mọi kiểu tổng hợp đều có cặp ngưỡng riêng**, và đây là bảng đáng dán lên tường:

| Kiểu | Tham số | Mặc định (Redis) |
|---|---|---|
| Hash | `hash-max-listpack-entries` / `-value` | 128 / 64 |
| List | `list-max-listpack-size` | 128 |
| Set (toàn số nguyên) | `set-max-intset-entries` | 512 |
| Set (có chuỗi) | `set-max-listpack-entries` / `-value` | 128 / 64 |
| Sorted Set | `zset-max-listpack-entries` / `-value` | 128 / 64 |

Và với **String** thì có một ngưỡng riêng ít người biết:

```text
   Chuỗi ≤ 44 byte   →  encoding "embstr": đối tượng và nội dung
                        nằm trong MỘT lần cấp phát duy nhất.
   Chuỗi > 44 byte   →  encoding "raw":    HAI lần cấp phát riêng.

   Chuỗi là SỐ NGUYÊN nhỏ  →  encoding "int": lưu thẳng dạng số,
                              và Redis còn dùng chung các số 0–9999
                              (shared integers) → gần như miễn phí.
```

Hệ quả rất thực tiễn: **lưu `"1425"` (kiểu int) rẻ hơn hẳn lưu `"user_1425"` (kiểu embstr)**. Trong bảng ánh xạ của Instagram, việc giá trị là số nguyên thuần chính là một phần lý do nó rẻ tới vậy.

## Đừng quên: tên key cũng tốn tiền

```text
   "u:1425"                        →  6 byte tên key
   "application:user:profile:1425" →  29 byte tên key

   Với 100 TRIỆU key:
      chênh 23 byte × 100 triệu = 2,3 GB
      chỉ vì cách đặt tên.
```

Nhưng đừng cắt tên key tới mức không đọc nổi. Đánh đổi hợp lý: **rút gọn tiền tố, giữ nguyên phần định danh**, và ghi lại quy ước ở một chỗ.

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Thêm máy để giảm bộ nhớ | Chia nhỏ chứ không giảm tổng; replica còn nhân đôi | Giảm ở tầng cách lưu |
| Đi tìm nút "bật nén" | Không có nút nén cho bộ nhớ đang chạy | Gom nhóm + giữ trong ngưỡng listpack |
| Sửa cấu hình rồi chờ bộ nhớ giảm | Cấu hình chỉ áp cho lần ghi **tiếp theo** | Dựng lại key: nạp lại từ RDB, hoặc dựng replica rồi promote |
| Tưởng xoá bớt phần tử sẽ quay về listpack | **Đường quay về chưa từng được viết** | Phải dựng lại key |
| Gom 1.000 phần tử mà quên nâng `entries` | Mọi nhóm lập tức thành hashtable, mất trắng lợi ích | Nâng `hash-max-listpack-entries` **trước** khi ghi |
| Nâng ngưỡng lên rất cao "cho chắc" | Listpack là quét tuần tự O(n), và Redis **một luồng** → chặn cả máy chủ | Đo độ trễ p99 trước; hiếm khi nên vượt 1.000 |
| Nghĩ `OBJECT ENCODING` trả về số byte | Nó trả về **tên cách lưu** | `MEMORY USAGE` mới trả byte |
| Tin `MEMORY USAGE` là chính xác tuyệt đối | Mặc định chỉ **lấy mẫu 5 phần tử** rồi nhân ra | `SAMPLES 0` khi cần chính xác, nhưng chỉ trên key vừa phải |
| Chạy `KEYS *` để kiểm kê | Chặn cả máy chủ | `SCAN`, `--bigkeys`, `--memkeys` |
| Code duyệt `HSCAN` giả định luôn phân trang | Trên listpack nó trả hết một lần | Viết code chịu được cả hai hành vi |
| Đặt tên key rất dài cho "dễ đọc" | 23 byte × 100 triệu key = 2,3 GB | Rút gọn tiền tố, ghi lại quy ước |

## Nguồn và kiểm chứng

- Số đo listpack/hashtable (**104 / 120 / 212 byte**, tăng **76,67%**) lấy từ bài *"The secret life of data in Valkey"* trên valkey.io. Mặc định của **Valkey 9.1**: `hash-max-listpack-entries = 512`, `hash-max-listpack-value = 64`. Mặc định của **Redis**: `128` / `64`.
- Instagram (2011): 1 triệu key kiểu `SET` riêng lẻ ≈ **70 MB**; gom thành Hash 1.000 nhóm × 1.000 phần tử còn ≈ **16 MB**; toàn bộ 300 triệu ánh xạ dưới **5 GB**.
- Chuyển đổi **một chiều**: `hashTypeConvert()` chỉ có đường listpack → hashtable; chiều ngược lại chưa được cài đặt.
- Ngưỡng `embstr` cho String là **44 byte**.
- **Đính chính so với nhiều tài liệu trôi nổi:** `OBJECT ENCODING` trả về **tên cách lưu**, không trả byte. Lệnh lấy mẫu 5 phần tử là **`MEMORY USAGE ... [SAMPLES count]`**.

## Bản mẫu 30 giây

> *"Em không thêm máy và cũng không đi tìm nút nén — thêm máy chỉ chia nhỏ chứ không giảm tổng, còn Redis thì không có nút nén cho bộ nhớ đang chạy.*
>
> *Em đi vào tầng **cách lưu**. Redis tách hai thứ: kiểu dữ liệu quyết định mình được gõ lệnh nào, còn cách lưu mới là thứ trả tiền. Hash nhỏ được gói vào một khối byte liền mạch gọi là listpack — không con trỏ nào. Vượt ngưỡng thì nó bung ra thành bảng băm thật, mỗi trường một ô riêng và mỗi mảnh lại bị làm tròn lên. Đội Valkey đo được: giá trị 63 byte tốn 104 byte, 64 byte tốn 120 byte, còn **65 byte nhảy vọt lên 212 byte** — thêm một ký tự, tăng hơn ba phần tư. Bộ nhớ Redis là hàm bậc thang chứ không phải đường thẳng.*
>
> *Nên việc đầu tiên em làm là chạy `redis-cli --memkeys` và `OBJECT ENCODING` trên vài key nóng để xem bao nhiêu phần trăm key đang ở cách lưu đắt. Rồi em gom nhóm — đúng mẹo đã cứu Instagram năm 2011: họ chia 1 triệu key thành 1.000 nhóm mỗi nhóm 1.000 phần tử, cùng lượng dữ liệu tụt từ 70 MB xuống 16 MB.*
>
> *Nhưng em nói trước hai cái bẫy. Thứ nhất, **đổi cách lưu là một chiều** — trong mã nguồn chỉ có đường listpack sang hashtable, chiều ngược lại dẫn vào dòng báo chưa cài đặt. Nên xoá bớt phần tử không đưa key về lại được, và sửa cấu hình chỉ áp cho lần ghi tiếp theo. Muốn thu hồi thật thì phải dựng lại key, thường là dựng một replica với cấu hình mới rồi chuyển vai.*
>
> *Thứ hai, **nâng ngưỡng lên rất cao là tự bắn vào chân**: listpack không có mục lục, tìm một trường là quét tuần tự, và Redis chạy một luồng nên một key khổng lồ sẽ chặn cả máy chủ. Em đo p99 trước khi vượt quá khoảng 1.000 phần tử một nhóm."*

## Tóm tắt bài 15

- **Thêm máy không giảm tổng bộ nhớ** (replica còn nhân đôi), và **Redis không có nút nén** cho bộ nhớ đang chạy.
- Phải tách **kiểu dữ liệu** (thứ bạn thấy, quyết định lệnh nào) khỏi **cách lưu** (thứ trả tiền).
- **Listpack** = một khối byte liền mạch, không con trỏ. **Hashtable** = mỗi trường 4 vùng nhớ riêng, mỗi vùng làm tròn lên.
- **Bộ nhớ Redis là hàm bậc thang**: 63 byte → 104; 64 byte → 120; **65 byte → 212 (+76,67%)**. Có hai loại bậc: bậc của bộ cấp phát (nhỏ) và bậc đổi cách lưu (đắt).
- **Gom nhóm** là mẹo lớn nhất: Instagram giảm 70 MB xuống 16 MB cho cùng lượng dữ liệu, vì phần sổ sách mỗi key được trả một lần thay vì nghìn lần.
- **Đổi cách lưu là MỘT CHIỀU.** Xoá phần tử không đưa về lại được; cấu hình chỉ áp cho lần ghi tiếp theo. Muốn thu hồi thật phải **dựng lại key**.
- **Nâng ngưỡng có giá bằng thời gian chạy lệnh**: listpack là O(n) cả khi đọc lẫn ghi, và Redis một luồng nên một key to chặn cả máy chủ.
- `HSCAN` **đổi hành vi** ở hai bên ngưỡng — trả hết một lần trên listpack, phân trang trên hashtable.
- **`OBJECT ENCODING` trả tên cách lưu, `MEMORY USAGE` trả byte** — và chính `MEMORY USAGE` mới là lệnh lấy mẫu 5 phần tử.
- Cùng nguyên lý áp cho List, Set, Sorted Set; String có ngưỡng riêng **44 byte** (embstr vs raw), và số nguyên nhỏ gần như miễn phí.

**Bài kế tiếp** → [Bài 16: Khoá xoắn vào nhau — gốc là thứ tự, không phải số lượng](../phase-4-thu-tu-va-quy-mo/01-khoa-xoan-nhau-goc-la-thu-tu.md)
