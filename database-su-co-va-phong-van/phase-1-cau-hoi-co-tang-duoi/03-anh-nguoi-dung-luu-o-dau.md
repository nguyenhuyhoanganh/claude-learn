# Bài 3: "Ảnh người dùng tải lên, bạn lưu vào đâu?"

Phút thứ 8 của buổi phỏng vấn. Người đối diện xoay tờ giấy lại, vẽ đúng hai cái hộp. Một hộp ghi *"kho ảnh"*, một hộp ghi *"bảng dữ liệu"*.

Rồi hỏi:

> *"Ảnh người dùng tải lên, bạn lưu vào đâu?"*

Nghe nhẹ như một câu chào. Nó là câu mở màn quen thuộc nhất khi người ta tuyển kỹ sư hệ thống, và nó có ba tầng nằm bên dưới.

Bạn vừa trả lời trong đầu rồi. Giữ nguyên câu đó — câu đó **đúng**, và nó vẫn chưa đủ để bạn được nhận.

## Giải nghĩa thuật ngữ

Bài này dùng khá nhiều từ chuyên ngành. Đọc bảng này trước, mỗi từ kèm một cách hình dung đời thường:

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **BLOB** (Binary Large Object) | Kiểu cột chứa dữ liệu nhị phân lớn: ảnh, PDF, video. MySQL gọi `BLOB`, PostgreSQL gọi `BYTEA` | Nhét nguyên tấm ảnh vào một ô trong bảng Excel |
| **Object Storage** (kho đối tượng) | Dịch vụ lưu file theo cặp *khoá → nội dung*, truy cập qua HTTP. Ví dụ: AWS S3, Google Cloud Storage, MinIO | Cái tủ gửi đồ ở siêu thị: đưa đồ, nhận số; đưa số, lấy đồ |
| **Buffer Pool / Shared Buffers** | Vùng RAM database dùng để giữ các trang dữ liệu vừa đọc, khỏi phải xuống đĩa lần sau | Mặt bàn làm việc: thứ hay dùng thì để trên bàn, thứ ít dùng cất vào tủ |
| **Trang (Page)** | Đơn vị đọc/ghi nhỏ nhất của database, thường 8 KB (PostgreSQL) hoặc 16 KB (InnoDB) | Database không đọc từng dòng, nó đọc từng "trang giấy" chứa nhiều dòng |
| **WAL / Binlog** (nhật ký ghi) | Sổ ghi trước: mọi thay đổi được ghi vào nhật ký **trước** khi ghi vào bảng, để mất điện vẫn khôi phục được | Ghi vào sổ tay trước, chép vào sổ cái sau |
| **TOAST** | Cơ chế của PostgreSQL: giá trị lớn hơn ~2 KB bị **cắt nhỏ, nén, và đẩy sang một bảng phụ** | Đồ quá to không nhét vừa ngăn kéo thì tháo ra, bọc lại, cất sang kho bên cạnh |
| **Transaction** (giao dịch) | Nhóm thao tác chạy trọn gói: hoặc thành công hết, hoặc quay đầu sạch như chưa từng chạy | Chuyển khoản: trừ bên này và cộng bên kia phải cùng thành công |
| **Rollback** (quay đầu) | Huỷ toàn bộ thay đổi của một giao dịch đang dở | Ctrl+Z cho cả nhóm thao tác |
| **File mồ côi** (orphan file) | File còn nằm trong kho nhưng không dòng dữ liệu nào trỏ tới nó nữa | Cái hộp trong kho mà không ai còn giữ phiếu gửi |
| **Ảnh vỡ** (broken reference) | Dòng dữ liệu trỏ tới một file **không còn tồn tại** | Còn phiếu gửi nhưng vào kho thì hộp đã mất |
| **Presigned URL** | Đường dẫn tạm có chữ ký, cho phép tải lên/tải xuống trực tiếp kho mà không cần đi qua server của bạn | Vé vào cửa có hạn giờ, dùng một lần |
| **CDN** | Mạng máy chủ đặt gần người dùng để phát file nhanh | Kho hàng đặt ở nhiều tỉnh thay vì một kho ở trung tâm |

## Tầng 1 — Định nghĩa: để ngoài, bảng chỉ giữ đường dẫn

Ứng viên trả lời gọn:

> *"Để ngoài, vào kho file riêng. Trong bảng chỉ giữ một đường dẫn."*

Đây là câu trả lời **đúng**, không có gì phải bàn. Cả internet đều khuyên thế.

Người phỏng vấn gật đầu, không nhìn cả cuốn sổ, ghi đúng một dòng ngắn: **"Giữ đường dẫn"**. Rồi họ **không chuyển sang câu khác**.

Đó là tín hiệu. Vì cái họ cần không phải *chỗ bạn để ảnh* — cả internet đều khuyên để ra ngoài. Họ cần biết **bạn đã chạy thật cái mình vừa khuyên hay chỉ mới đọc được nó**.

Trước khi lên tầng 2, hãy nắm rõ ba lựa chọn thật sự tồn tại:

| Cách lưu | Cụ thể là gì | Ai dùng |
|---|---|---|
| **Trong database** | Cột `BYTEA`/`BLOB` chứa thẳng bytes của ảnh | Hệ nhỏ, ảnh nhỏ, cần giao dịch chặt |
| **Trên đĩa của máy chủ ứng dụng** | Ghi file vào `/var/www/uploads/`, DB giữ đường dẫn | Server đơn lẻ, dự án cũ |
| **Kho đối tượng** (S3, GCS, MinIO) | Đẩy file lên dịch vụ riêng, DB giữ khoá | **Mặc định của mọi hệ hiện đại** |

Cách thứ hai có một cái bẫy ít người nói: nó **chết ngay khi bạn chạy hai máy chủ**. Người dùng tải ảnh lên máy A, lần sau request rơi vào máy B — máy B không có file đó. Rất nhiều đội phát hiện chuyện này đúng vào ngày họ bật auto-scaling.

## Tầng 2 — Con số: "để thẳng ảnh vào bảng thì tốn cỡ nào?"

Người phỏng vấn hỏi tiếp, giọng vẫn nhẹ:

> *"Nếu để thẳng ảnh vào trong bảng thì tốn cỡ nào?"*

Nghe như hỏi cho có. Đây chính là chỗ đo bạn đã vận hành thật hay chưa. Câu trả lời **không có con số** là câu trả lời của người mới đọc.

Đặt bài toán cụ thể:

```text
1.000.000 tấm ảnh × 200 KB/tấm = 200 GB nằm ngay trong bảng dữ liệu.
```

Con số 200 GB đó chưa làm ai sợ — đĩa bây giờ rẻ. Cái đau nằm ở **bốn chỗ khác**, và đây là bốn chỗ bạn cần nói ra:

### Đau chỗ 1 — Sao lưu

Mỗi lần chạy bản sao lưu đầy đủ, máy phải **đọc lại trọn 200 GB đó**, kể cả khi cả tuần không có tấm ảnh nào thay đổi.

```text
   Không có ảnh trong DB:   sao lưu 12 GB   →  ~4 phút
   Có ảnh trong DB:         sao lưu 212 GB  →  ~70 phút

   Chạy mỗi đêm. Mỗi đêm đọc lại 200 GB dữ liệu KHÔNG HỀ ĐỔI.
```

Và nó không dừng ở thời gian sao lưu. Thời gian **phục hồi** cũng nhân lên theo — mà đó mới là con số quan trọng, vì phục hồi là lúc hệ thống đang chết. (Xem [Bài 6: Bạn sao lưu database thế nào](06-ban-sao-luu-database-the-nao.md) để hiểu vì sao con số phục hồi mới là con số phải bấm giờ.)

### Đau chỗ 2 — Vùng nhớ đệm bị ảnh chiếm

Đây là chỗ tinh vi hơn, và nói được nó là ghi điểm ngay.

Database giữ trong RAM một vùng gọi là **buffer pool** — hãy hình dung nó như **mặt bàn làm việc**: thứ hay dùng thì để trên bàn cho nhanh, thứ ít dùng cất vào tủ (đĩa). Mặt bàn đó có kích thước cố định, thường bằng 25–75% RAM của máy.

Bình thường mặt bàn đó chứa **index và các dòng dữ liệu nóng** — đúng thứ mà mọi câu truy vấn cần.

```text
   ══════════ BUFFER POOL 16 GB — khi ảnh để NGOÀI ══════════
   ┌────────────────────────────────────────────────────────┐
   │ index don_hang     │ index nguoi_dung  │ index san_pham│
   │ dòng nóng bảng đơn │ dòng nóng bảng SP │ thống kê      │
   │ ... gần như toàn bộ phần "làm việc" của DB nằm vừa RAM │
   └────────────────────────────────────────────────────────┘
                        → tỷ lệ trúng đệm ~99%

   ══════════ BUFFER POOL 16 GB — khi ảnh để TRONG bảng ══════════
   ┌────────────────────────────────────────────────────────┐
   │ ẢNH ẢNH ẢNH ẢNH ẢNH ẢNH ẢNH ẢNH ẢNH ẢNH ẢNH ẢNH ẢNH ẢNH │
   │ ẢNH ẢNH ẢNH │ index don_hang (bị đá ra một nửa)        │
   └────────────────────────────────────────────────────────┘
                        → tỷ lệ trúng đệm tụt còn ~80%
```

Một request đọc ảnh **200 KB** sẽ kéo 25 trang 8 KB vào bộ đệm, và **đá 25 trang index ra ngoài**. Lần sau có ai tra cứu đơn hàng, index đó không còn trong RAM, phải đọc lại từ đĩa.

Hệ quả là câu đắt nhất trong phỏng vấn: **những truy vấn không hề đụng tới ảnh cũng chậm theo.** Đó là kiểu chậm khó chẩn đoán nhất, vì bạn nhìn vào câu lệnh chậm và không thấy gì bất thường trong nó cả.

### Đau chỗ 3 — Nhật ký ghi phình theo

Mọi database đều ghi trước vào **nhật ký ghi** (PostgreSQL gọi là WAL, MySQL gọi là binlog) rồi mới ghi vào bảng. Mục đích: mất điện giữa chừng vẫn khôi phục được.

Nghĩa là tấm ảnh 200 KB của bạn **được ghi xuống đĩa hai lần**: một lần vào nhật ký, một lần vào bảng.

Và nhật ký đó còn được **truyền sang mọi bản sao (replica)**:

```text
   Tải lên 1.000 ảnh/ngày × 200 KB = 200 MB dữ liệu ảnh
        ↓ ghi WAL                    = 200 MB
        ↓ truyền sang 2 replica      = 400 MB qua mạng
        ↓ lưu WAL để phục hồi 7 ngày = 1,4 GB

   Cùng lượng ảnh đó, nếu để ở kho đối tượng:
        DB chỉ ghi thêm 1.000 dòng chứa đường dẫn ≈ 100 KB.
```

### Đau chỗ 4 — TOAST (riêng PostgreSQL)

PostgreSQL không cho một dòng vượt quá một trang 8 KB. Giá trị nào lớn hơn ngưỡng ~2 KB sẽ bị **nén lại, cắt thành từng mảnh 2 KB, và cất sang một bảng phụ** gọi là bảng TOAST.

Nghe thì hay — dòng chính vẫn gọn. Nhưng:

- Ảnh JPEG/PNG **đã nén sẵn**, nên PostgreSQL cố nén thêm chỉ tốn CPU mà không giảm được bao nhiêu.
- Mỗi lần đọc ảnh là **thêm một lượt tra cứu sang bảng TOAST** và ghép các mảnh lại.
- Bảng TOAST cũng cần được dọn rác (VACUUM), cũng phình, cũng nằm trong bản sao lưu.

Mẹo nhỏ đáng biết: nếu bạn *bắt buộc* phải lưu ảnh trong PostgreSQL, hãy tắt nén cho cột đó vì nén ảnh là vô ích:

```sql
ALTER TABLE anh ALTER COLUMN du_lieu SET STORAGE EXTERNAL;
-- EXTERNAL = vẫn cắt mảnh sang bảng TOAST nhưng KHÔNG nén.
-- Tiết kiệm CPU đáng kể với dữ liệu đã nén sẵn (JPEG, PNG, MP4, ZIP).
```

### Khi nào lưu trong database lại ĐÚNG?

Đây là vế thứ hai của đánh đổi — nói được vế này chứng tỏ bạn không học vẹt:

| Lưu trong DB hợp lý khi | Vì sao |
|---|---|
| File **rất nhỏ** (< 10 KB): chữ ký, avatar 64×64, mã QR | Không kích hoạt TOAST, không phá bộ đệm đáng kể |
| **Số lượng ít** (vài nghìn), gần như không đổi | Chi phí sao lưu không đáng kể |
| Cần **giao dịch chặt tuyệt đối**: file phải sống chết cùng dòng dữ liệu | Đây là lợi thế duy nhất mà kho ngoài không có |
| Yêu cầu pháp lý cấm dữ liệu rời khỏi database | Ràng buộc tuân thủ, không phải kỹ thuật |

Vế cuối trong cột trái là quan trọng nhất, và nó dẫn thẳng sang tầng 3.

## Tầng 3 — Đánh đổi: "ghi file xong mà transaction hỏng thì file đi đâu?"

Ứng viên gật, thấy mình vừa ghi điểm. Rồi người phỏng vấn hỏi câu thứ hai:

> *"Ghi file xong mà transaction hỏng giữa chừng, quay đầu, thì file đó đi đâu?"*

**Nó không đi đâu cả. Nó nằm lại.**

Vì đây là sự thật cốt lõi của cả bài: **ổ đĩa/kho ảnh và database không chung một transaction.**

```text
   ┌─────────────────┐              ┌─────────────────┐
   │   KHO ẢNH (S3)  │              │    DATABASE     │
   │                 │              │                 │
   │  Không có       │   HAI THẾ    │  Có BEGIN,      │
   │  BEGIN/COMMIT/  │   GIỚI RIÊNG │  COMMIT,        │
   │  ROLLBACK.      │   BIỆT       │  ROLLBACK.      │
   │  Ghi là xong.   │              │  Quay đầu được. │
   └─────────────────┘              └─────────────────┘

   Bảng quay đầu sạch sẽ. Còn file thì ở lại luôn.
```

Bạn **không thể** làm cho hai thứ này nguyên tử với nhau. Không có mẹo nào. Điều duy nhất bạn chọn được là: **khi hỏng thì để lại loại rác nào.**

### Hai chiều lệch, và chúng không hề bằng nhau

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  GHI FILE TRƯỚC, GHI DÒNG SAU                                │
   │                                                              │
   │  File ghi xong ✓ → DB hỏng ✗  →  FILE MỒ CÔI                 │
   │  Hậu quả: một file nằm trong kho không ai trỏ tới.           │
   │  Người dùng thấy gì? KHÔNG THẤY GÌ CẢ. Họ thử lại, thành công.│
   │  Chi phí: tiền lưu trữ.                                      │
   └──────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────┐
   │  GHI DÒNG TRƯỚC, GHI FILE SAU                                │
   │                                                              │
   │  DB ghi xong ✓ → file hỏng ✗  →  ẢNH VỠ                      │
   │  Hậu quả: dòng trỏ vào một file không tồn tại.               │
   │  Người dùng thấy gì? MỘT Ô VỠ GIỮA TRANG. Ngay lập tức.      │
   │  Chi phí: uy tín + phiếu hỗ trợ + có thể mất đơn hàng.       │
   └──────────────────────────────────────────────────────────────┘
```

**Chọn loại rác rẻ hơn.** Quy tắc gói trong một dòng:

> **Ghi file TRƯỚC, ghi dòng SAU, và không xoá file trong luồng xử lý request.**

Vế thứ ba cũng quan trọng như hai vế đầu. Rất nhiều người viết code "dọn dẹp cho sạch" thế này:

```java
// SAI — cố xoá file khi transaction hỏng
try {
    String key = s3.upload(file);
    donHangRepository.save(new DonHang(key));   // ← ném exception
} catch (Exception e) {
    s3.delete(key);        // ✗ "dọn cho sạch"
    throw e;
}
```

Nó sai vì ba lý do:

1. **Lệnh xoá đó cũng có thể hỏng** — mạng chập đúng lúc, và bạn quay lại điểm xuất phát nhưng code phức tạp gấp đôi.
2. **Bạn không chắc transaction đã rollback thật chưa** khi exception nổi lên. Nếu nó thực ra đã commit ở một nhánh khác, bạn vừa tự tay tạo ra **ảnh vỡ** — đúng loại rác đắt mà bạn đang cố tránh.
3. Nó làm request chậm thêm và có thể ném ra một exception thứ hai che mất exception gốc.

Cứ để file mồ côi nằm đó. Dọn nó bằng một tiến trình riêng, chạy nền, thong thả, có thể chạy lại — nơi mà sai một lần cũng không ai chết.

### Con số cho tầng 2 của câu hỏi này

```text
100.000 lượt tải lên mỗi ngày, tỷ lệ hỏng 0,1%
  → 100 file mồ côi/ngày
  → 36.500 file mồ côi/năm
  → 36.500 × 200 KB ≈ 7,3 GB rác/năm

Chi phí lưu trữ S3 (~0,023 USD/GB/tháng):  ~2 USD/năm.

Cùng tỷ lệ hỏng đó nhưng chọn chiều ngược lại:
  → 36.500 ẢNH VỠ/năm, tức trung bình 100 người/ngày nhìn thấy
    một ô vỡ trên màn hình.
```

**Hai USD một năm, đổi lấy việc không ai nhìn thấy ảnh vỡ.** Đó là cách trình bày đánh đổi mà người phỏng vấn muốn nghe: có con số ở cả hai vế.

## Tầng 4 — Quy trình: dựng luồng tải ảnh cho đúng

Người phỏng vấn đưa tình huống: *"Vậy luồng tải ảnh của bạn chạy thế nào?"*. Đây là lúc trả lời bằng các bước cụ thể.

### Luồng chuẩn: hai pha, có trạng thái tạm

```text
   ① Client xin một chỗ để tải lên
      POST /api/anh/xin-cho  →  server sinh khoá + presigned URL
      Server ghi ngay một dòng:  { khoa, trang_thai = 'CHO_XAC_NHAN', luc = now() }

   ② Client tải file THẲNG lên S3 bằng presigned URL
      (không đi qua server của bạn → server không phải gánh băng thông)

   ③ Client báo đã xong
      POST /api/anh/xac-nhan { khoa }
      Server kiểm tra file có thật trên S3 (HEAD object), rồi trong CÙNG
      một transaction: đổi trang_thai = 'DA_DUNG' và gắn khoá vào đơn hàng.

   ④ Job dọn rác chạy mỗi đêm
      Xoá mọi dòng 'CHO_XAC_NHAN' cũ hơn 24 giờ, và xoá file tương ứng.
```

Điểm hay của luồng này: **kho ảnh và database luôn được nối lại bằng một dòng trạng thái**, nên bạn không bao giờ phải đoán file nào là rác.

### Job dọn file mồ côi: bốn luật bắt buộc

Nếu hệ của bạn chưa có bảng trạng thái mà chỉ có file trần trong kho, job dọn phải theo bốn luật sau — thiếu luật nào cũng có ngày xoá nhầm ảnh thật:

```python
def don_file_mo_coi():
    NGUONG_TUOI = timedelta(hours=24)      # LUẬT 1: chỉ đụng file ĐỦ GIÀ

    for khoa in s3.liet_ke_tat_ca():
        tuoi = now() - s3.thoi_diem_tao(khoa)
        if tuoi < NGUONG_TUOI:
            continue      # File mới có thể đang trong luồng tải dở → BỎ QUA

        if db.ton_tai_dong_tro_toi(khoa):
            continue      # Có người dùng → giữ

        # LUẬT 2: KHÔNG xoá thẳng. Chuyển sang khu cách ly trước.
        s3.chuyen_sang("cach-ly/" + khoa)
        log.info("Đưa vào khu cách ly: %s", khoa)

    # LUẬT 3: Sau 30 ngày trong khu cách ly mà không ai kêu → mới xoá thật
    for khoa in s3.liet_ke("cach-ly/"):
        if now() - s3.thoi_diem_chuyen(khoa) > timedelta(days=30):
            s3.xoa(khoa)

    # LUẬT 4: Có phanh. Rác vượt ngưỡng bất thường = có bug ở chỗ khác,
    # không phải chuyện để job này tự tiện dọn.
    if so_file_dua_vao_cach_ly > 1000:
        canh_bao_truc("Rác tăng bất thường — dừng job, kiểm tra luồng ghi")
        raise DungKhanCap()
```

Luật 1 chống một cái bẫy rất thật: nếu job chạy đúng lúc ai đó vừa tải file lên nhưng chưa kịp ghi dòng vào DB, file đó trông y hệt rác. **Ngưỡng tuổi phải dài hơn thời gian dài nhất mà luồng tải lên có thể kéo dài.**

Luật 4 chống cái bẫy đắt nhất: một bug ở tầng ghi khiến DB mất đường dẫn, và job dọn rác **trung thành xoá sạch ảnh thật**. Có phanh nghĩa là bug chỉ gây phiền, không gây thảm hoạ.

### Ba chi tiết thiết kế hay bị hỏi vặn

**① Trong bảng lưu đường dẫn đầy đủ hay chỉ lưu khoá?**

```text
   ✗ https://cdn-cu.example.com/anh/2024/03/abc123.jpg
     → Đổi CDN, đổi domain, đổi cấu trúc thư mục = phải chạy migration
       trên hàng triệu dòng.

   ✓ anh/2024/03/abc123.jpg
     → Chỉ lưu KHOÁ. Phần domain do cấu hình ứng dụng ghép vào lúc chạy.
       Đổi CDN = đổi một dòng cấu hình.
```

**② Ảnh riêng tư thì phát thế nào?**

Không bao giờ để bucket ở chế độ công khai cho dữ liệu riêng tư. Dùng **presigned URL** — đường dẫn có chữ ký và có hạn giờ:

```java
// Server kiểm tra quyền TRƯỚC, rồi mới cấp vé vào cửa có hạn 5 phút
if (!quyenService.duocXem(nguoiDung, anh)) throw new CamTruyCapException();
return s3.taoPresignedUrl(anh.getKhoa(), Duration.ofMinutes(5));
```

**③ Cùng một tấm ảnh được nhiều người tải lên thì sao?**

Đặt tên khoá theo **mã băm nội dung** (content hash) thay vì tên file người dùng đặt:

```text
   khoa = sha256(nội dung file) + phần mở rộng

   Được ba thứ cùng lúc:
     • Trùng nội dung = trùng khoá → tự động khử trùng lặp, tiết kiệm kho
     • Tên file người dùng không lọt vào hệ thống → chặn cả một họ lỗi bảo mật
       (đường dẫn kiểu ../../etc/passwd, ký tự lạ, tên trùng nhau)
     • Ghi lại cùng nội dung là thao tác luỹ đẳng → thử lại thoải mái
```

## Bốn cách lưu, đặt cạnh nhau

| Tiêu chí | Trong DB (BLOB) | Đĩa máy chủ app | Kho đối tượng (S3) | S3 + CDN |
|---|---|---|---|---|
| Sao lưu | Rất nặng | Phải sao lưu riêng, dễ quên | Kho tự lo, có phiên bản | Như S3 |
| Chạy nhiều máy chủ | Được | **Hỏng** | Được | Được |
| Giao dịch chặt với dòng dữ liệu | **Có** (lợi thế duy nhất) | Không | Không | Không |
| Băng thông đi qua server app | Có | Có | Không (tải thẳng) | Không |
| Tốc độ tới người dùng cuối | Chậm | Chậm | Trung bình | **Nhanh nhất** |
| Chi phí/GB | Đắt nhất (đĩa DB cao cấp) | Trung bình | Rẻ | Rẻ + phí truyền |
| Độ phức tạp | Thấp nhất | Thấp | Trung bình | Cao hơn |
| **Nên chọn khi** | File < 10 KB, ít, cần giao dịch | Gần như không bao giờ | **Mặc định** | Ảnh phát cho đông người |

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Ghi dòng trước, ghi file sau | Tạo ra ảnh vỡ — loại rác đắt | Ghi file trước, ghi dòng sau |
| Cố xoá file trong khối `catch` | Lệnh xoá cũng hỏng được; có thể tạo ra ảnh vỡ | Để job nền dọn, có ngưỡng tuổi |
| Job dọn xoá thẳng, không có ngưỡng tuổi | Xoá nhầm file vừa tải lên chưa kịp ghi dòng | Ngưỡng 24h + khu cách ly 30 ngày |
| Job dọn không có phanh | Một bug tầng ghi → xoá sạch ảnh thật | Dừng khi số rác vượt ngưỡng bất thường |
| Lưu URL đầy đủ trong DB | Đổi CDN/domain = migration hàng triệu dòng | Chỉ lưu khoá, ghép domain lúc chạy |
| Lưu file lên đĩa máy chủ app | Chết ngay khi scale lên 2 máy | Kho đối tượng |
| Bucket để công khai cho dữ liệu riêng tư | Ai đoán được khoá là xem được | Presigned URL có hạn giờ + kiểm quyền |
| Đặt tên khoá theo tên file người dùng | Trùng tên, ký tự lạ, lỗ hổng đường dẫn | Băm nội dung làm khoá |
| Không giới hạn kích thước và kiểu file | Có người tải lên 2 GB, hoặc tải lên mã độc | Kiểm dung lượng + kiểm chữ ký nhị phân (magic bytes), không tin phần mở rộng |
| Để PostgreSQL nén ảnh JPEG trong TOAST | Tốn CPU mà không giảm được dung lượng | `SET STORAGE EXTERNAL` |

## Vì sao thứ tự hai câu hỏi không hề ngẫu nhiên

Nhìn lại đúng thứ tự người phỏng vấn đã hỏi:

```text
   ① "Để trong bảng thì tốn cỡ nào?"      ← đo bạn có CON SỐ không
   ② "Ghi file xong thì file đi đâu?"     ← đo bạn có VẾT SẸO không
```

Câu đầu ai cũng trả lời được, và đúng. **Nó không dùng để loại ai** — nó dùng để xem bạn dừng lại ở đó hay bạn đi tiếp một bước nữa.

Câu thứ hai thì chỉ người đã từng dọn rác lúc 2 giờ sáng mới trả lời trôi chảy, vì nó không nằm trong bài hướng dẫn nào cả.

> Họ không hỏi bạn để ảnh ở đâu. Họ hỏi bạn biết nó **rò ở đâu**.
>
> **Câu trả lời sai không làm bạn trượt. Dừng quá sớm thì có.**

## Bản mẫu 30 giây

> *"Ảnh để **ngoài**, vào kho đối tượng như S3, trong bảng em chỉ giữ **khoá** chứ không giữ URL đầy đủ — để sau này đổi CDN không phải migration.*
>
> *Nếu để trong bảng: một triệu ảnh 200 KB là 200 GB, mỗi lần sao lưu đầy đủ phải đọc lại trọn 200 GB dù không tấm nào đổi. Đau hơn là nó chiếm mất buffer pool, nên những truy vấn **không liên quan tới ảnh** cũng chậm theo — đó là kiểu chậm khó chẩn đoán nhất. Với Postgres thì ảnh còn bị TOAST cắt mảnh và nén vô ích vì JPEG đã nén sẵn.*
>
> *Chỗ quan trọng hơn là **kho ảnh và database không chung một transaction**. Nên em ghi file trước, ghi dòng sau, và không xoá file trong luồng request. Lý do: hỏng theo chiều đó chỉ để lại file mồ côi — tốn tiền lưu trữ, người dùng không thấy gì. Hỏng theo chiều ngược lại là ảnh vỡ giữa trang, khách nhìn thấy ngay. Với 100 nghìn lượt/ngày và tỷ lệ hỏng 0,1% thì mỗi năm khoảng 36.500 file mồ côi, chừng 7 GB, tức khoảng 2 đô một năm — em chọn trả 2 đô đó.*
>
> *Rác thì dọn bằng job nền, chỉ đụng file cũ hơn 24 giờ, chuyển sang khu cách ly 30 ngày rồi mới xoá thật, và có phanh dừng nếu lượng rác tăng bất thường — vì rác tăng đột biến thường nghĩa là có bug ở tầng ghi chứ không phải có nhiều rác thật."*

## Tóm tắt bài 3

- **Ảnh để ngoài, bảng chỉ giữ khoá** — không giữ URL đầy đủ, để đổi CDN không phải migration.
- Để trong bảng thì đau ở **bốn chỗ**: sao lưu nặng, buffer pool bị chiếm khiến truy vấn không liên quan cũng chậm, nhật ký ghi phình và nhân bản sang replica, và TOAST nén vô ích với dữ liệu đã nén.
- **Kho ảnh và database không chung một transaction.** Không có mẹo nào làm chúng nguyên tử với nhau — bạn chỉ chọn được để lại loại rác nào.
- **Ghi file trước, ghi dòng sau, không xoá trong luồng request.** File mồ côi tốn tiền lưu trữ; ảnh vỡ tốn uy tín.
- Job dọn rác phải có **ngưỡng tuổi**, **khu cách ly**, và **phanh dừng** khi rác tăng bất thường.
- Lưu trong DB vẫn đúng với file **rất nhỏ, ít, và cần giao dịch chặt** — đó là lợi thế duy nhất kho ngoài không có.

**Bài kế tiếp** → [Bài 4: "Dùng khoá ngoại có làm chậm không?"](04-khoa-ngoai-co-lam-cham-khong.md)
