# Bài 6: "Bạn sao lưu database thế nào?"

Trong phòng phỏng vấn, người đối diện lật sang trang mới, hỏi một câu nghe rất hiền lành:

> *"Bạn sao lưu database thế nào?"*

Năm chữ, không có bẫy nào trong câu chữ cả. **Bẫy nằm ở chỗ bạn dừng lại ngay sau khi trả lời xong.**

Tôi đã xem câu này đánh trượt nhiều người giỏi, và lần nào cũng trượt ở đúng một chỗ: họ kể tên **công cụ**, trong khi người phỏng vấn đang hỏi một **con số**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **Backup** (sao lưu) | Bản chụp dữ liệu tại một thời điểm, cất ở nơi khác, dùng để dựng lại khi mất | Ảnh chụp cuốn sổ, cất trong két ở nhà |
| **Replica** (bản sao) | Một máy chủ database thứ hai liên tục chép lại mọi thay đổi của máy chính | Người thư ký ngồi cạnh, chép y hệt từng dòng bạn viết |
| **RPO** (Recovery Point Objective) | **Lượng dữ liệu chấp nhận mất**, tính bằng thời gian | "Mất tối đa 5 phút giao dịch gần nhất" |
| **RTO** (Recovery Time Objective) | **Thời gian chấp nhận hệ thống chết**, từ lúc sự cố tới lúc chạy lại | "Phải sống lại trong vòng 30 phút" |
| **WAL / Binlog** (nhật ký ghi) | Sổ ghi trước mọi thay đổi, PostgreSQL gọi WAL, MySQL gọi binlog | Sổ nháp ghi từng thao tác theo thứ tự thời gian |
| **PITR** (Point-In-Time Recovery) | Phục hồi về **đúng một thời điểm bất kỳ**, không chỉ về mốc sao lưu | Tua ngược cuốn phim tới đúng giây 14:32:07 |
| **Logical backup** | Xuất dữ liệu ra dạng câu lệnh SQL (`pg_dump`, `mysqldump`) | Chép lại nội dung sổ bằng tay, ra một file chữ |
| **Physical backup** | Sao chép thẳng các file dữ liệu của database | Photocopy nguyên cuốn sổ, từng trang |
| **Snapshot** | Ảnh chụp tức thời của cả ổ đĩa ở tầng hạ tầng (EBS, LVM, ZFS) | Đóng băng cả cái tủ hồ sơ trong một khoảnh khắc |
| **Immutable / Object Lock** | Bản sao lưu **không thể xoá hay sửa** trong một khoảng thời gian | Két sắt hẹn giờ: khoá rồi thì tới ngày mới mở được |
| **Restore drill** (diễn tập phục hồi) | Chạy thử toàn bộ quy trình phục hồi, có bấm giờ | Diễn tập chữa cháy: không phải để biết có bình cứu hoả, mà để biết mất bao lâu |

## Tầng 1 — Định nghĩa: mỗi đêm một bản, giữ 7 bản

Câu trả lời quen thuộc nhất:

> *"Mỗi đêm 2 giờ sáng chạy một lệnh xuất cả database ra file, đẩy lên kho lưu trữ, giữ 7 bản gần nhất."*

**Không sai một chữ nào.** Đây đúng là thứ đang chạy ở phần lớn công ty, và nó đã cứu rất nhiều người.

```bash
# Thứ mà 80% công ty đang chạy
0 2 * * *  pg_dump -Fc production | aws s3 cp - s3://backup/$(date +\%F).dump
```

Cây bút bên kia bàn ghi lại. Rồi họ **không hỏi bạn dùng công cụ gì nữa**. Họ hỏi một câu nghe như hỏi vu vơ, nhưng nó đo đúng thứ bạn chưa từng phải trả.

## Tầng 2 — Con số: "bạn vừa mất bao nhiêu dữ liệu?"

> *"Giả sử ổ đĩa chết lúc 1 giờ chiều thứ Ba. Bạn phục hồi từ bản sao lưu gần nhất. Bạn vừa mất bao nhiêu dữ liệu?"*

Đây là câu quyết định.

```text
   02:00 ─────────────────────────────────────────► 13:00
     ▲                                                ▲
     │                                                │
   Bản sao lưu                                    Ổ ĐĨA CHẾT
   gần nhất
     └──────────────── 11 TIẾNG ──────────────────────┘
                            ▲
              11 tiếng này KHÔNG NẰM Ở ĐÂU CẢ.
              Không có bản sao nào chứa nó.
              Nó biến mất vĩnh viễn.
```

**Bây giờ đổi 11 tiếng đó ra tiếng nói của người trả lương cho bạn:**

```text
   Một sàn nhỏ chạy 2.000 đơn/ngày, tập trung 08:00–22:00
      → 11 tiếng đó ≈ 900 đơn.

   Đó KHÔNG phải 900 dòng dữ liệu.
   Đó là 900 KHÁCH ĐÃ TRẢ TIỀN mà hệ thống không còn nhớ họ là ai,
   mua gì, và đã trả bao nhiêu.
```

Khoảng trống đó có một cái tên: **RPO — Recovery Point Objective**, tức lượng dữ liệu bạn chấp nhận mất.

Và đây là chỗ đảo ngược cả cách suy nghĩ:

> **Bạn không chọn công cụ trước. Bạn chọn con số này trước, rồi công cụ mới theo sau.**

### RPO và RTO — hai con số, đừng lẫn

Đây là cặp khái niệm hay bị gộp làm một:

```text
                    SỰ CỐ XẢY RA
                          │
        ◄──── RPO ────────┼──────── RTO ────────►
                          │
   "Mất bao nhiêu     "Chết bao lâu
    DỮ LIỆU?"          rồi mới sống lại?"

   Đo bằng: khoảng thời gian     Đo bằng: khoảng thời gian
   giữa lần sao lưu cuối         từ lúc sập tới lúc chạy lại
   và lúc sự cố
```

Hai con số này **độc lập nhau**, và thường thì cải thiện một cái sẽ làm cái kia đắt hơn:

| | RPO thấp (mất ít dữ liệu) | RTO thấp (sống lại nhanh) |
|---|---|---|
| Cần gì | Sao lưu **dày** hơn: nhật ký ghi liên tục | Bản sao **sẵn sàng chạy**: replica nóng, hoặc bản dựng sẵn |
| Chi phí | Lưu trữ + băng thông | Máy chủ chạy không tải + đội trực |
| Không có nó thì | Mất giao dịch của khách | Khách không mua được trong lúc chờ |

### Cách kéo RPO từ 11 tiếng xuống vài phút

Chìa khoá là **nhật ký ghi** (WAL/binlog). Database vốn đã ghi lại **mọi thay đổi theo thứ tự thời gian** để chống mất điện. Bạn chỉ cần chép nhật ký đó ra ngoài liên tục:

```text
   ┌──── Bản đầy đủ ────┐                                    ổ đĩa chết
   │  Chủ nhật 02:00    │                                         │
   └────────────────────┘                                         │
        └── WAL ── WAL ── WAL ── WAL ── WAL ── WAL ── WAL ────────┘
            (chép ra kho lưu trữ liên tục, mỗi vài chục giây)

   Phục hồi = bản đầy đủ + phát lại toàn bộ WAL tới đúng thời điểm.
   RPO tụt từ 11 TIẾNG xuống còn VÀI PHÚT (thậm chí vài giây).
```

Đây gọi là **PITR — phục hồi về một thời điểm bất kỳ**. Nó cho bạn thêm một siêu năng lực mà bản dump hàng đêm không có:

```sql
-- Ai đó chạy nhầm lệnh xoá lúc 14:32. Phục hồi về đúng 14:31:59.
restore_command = 'aws s3 cp s3://wal-archive/%f %p'
recovery_target_time = '2026-08-06 14:31:59+07'
```

Bạn không phải quay về 2 giờ sáng. Bạn quay về **đúng một giây trước tai nạn**.

### Ba kiểu sao lưu, đặt cạnh nhau

| | Logical (`pg_dump`) | Physical (`pg_basebackup`) | Snapshot (EBS/LVM/ZFS) |
|---|---|---|---|
| Cách làm | Đọc dữ liệu, xuất ra câu lệnh SQL | Chép file dữ liệu thô | Đóng băng ổ đĩa ở tầng hạ tầng |
| Tốc độ tạo | Chậm nhất (đọc qua engine) | Nhanh | **Gần như tức thì** |
| Tốc độ phục hồi | **Rất chậm** (chạy lại mọi câu lệnh, dựng lại mọi index) | Nhanh | **Nhanh nhất** |
| Phục hồi một bảng | **Được** | Không (phải dựng cả cụm) | Không |
| Đổi phiên bản DB được | **Được** | Không (cùng phiên bản, cùng kiến trúc) | Không |
| Hỗ trợ PITR | Không | **Có** (kèm WAL) | Có (nếu snapshot nhất quán + WAL) |
| Kích thước | Nhỏ (nén tốt, không chứa index) | Bằng cỡ database | Bằng cỡ ổ đĩa |

Điểm hay bị bỏ sót ở dòng "tốc độ phục hồi": một bản `pg_dump` của database 500 GB có thể mất **8–12 tiếng** để phục hồi, vì nó phải dựng lại toàn bộ index từ đầu. Nếu RTO của bạn là 1 tiếng, thì bản dump đó **không phải là chiến lược sao lưu của bạn** — nó chỉ là lưới an toàn cuối cùng.

**Cấu hình đúng cho phần lớn hệ nghiêm túc:**

```text
   ① Physical backup mỗi tuần (hoặc mỗi ngày với DB nhỏ)
   ② WAL archiving liên tục          →  RPO vài phút
   ③ Logical dump mỗi tuần            →  để phục hồi một bảng, và để
                                          đổi phiên bản/chuyển máy chủ
   ④ Snapshot ổ đĩa mỗi ngày          →  để RTO thấp khi chỉ hỏng máy
```

Bốn thứ này **không thay thế nhau**, chúng chống bốn loại tai nạn khác nhau.

## Tầng 3 — Đánh đổi: "đã có replica rồi thì cần backup làm gì?"

Câu hỏi thứ hai:

> *"Hệ thống của bạn đã có một bản sao (replica) chạy song song, đồng bộ liên tục. Vậy còn cần bản sao lưu để làm gì nữa?"*

Đây là chỗ nhiều người gật đầu quá nhanh. Câu trả lời nằm ở một chữ: **replica chép MỌI THỨ máy chính ghi xuống — kể cả cái sai.**

```text
   14:32:00.000   Bạn gõ nhầm:  DELETE FROM don_hang;   (quên WHERE)
   14:32:00.010   Máy chính: 2 triệu dòng biến mất.
   14:32:00.180   Replica nhận được lệnh đó qua WAL.
   14:32:00.190   Replica: 2 triệu dòng cũng biến mất.

   ═══ 190 mili-giây. ═══
   Nhanh hơn cả thời gian bạn kịp nhận ra mình vừa gõ gì.
   Cả hai bản cùng sạch trơn, cùng một lúc.
```

Hai thứ đó chống **hai tai nạn hoàn toàn khác nhau**:

| | Replica | Backup |
|---|---|---|
| Chống được | **Chết máy**: hỏng ổ đĩa, mất điện, đứt mạng, sập cả vùng | **Hỏng dữ liệu**: gõ nhầm, bug ghi sai, mã độc, dữ liệu bị bôi bẩn dần |
| Không chống được | Mọi lỗi logic — nó chép trung thành cả lỗi | Máy chết (backup không tự chạy thay được) |
| Độ trễ khi cứu | Vài giây (chuyển vai) | Vài chục phút tới vài giờ |
| Ảnh hưởng tới RTO | **Rất tốt** | Kém |
| Ảnh hưởng tới RPO | **Rất tốt** (vài trăm ms) | Tuỳ tần suất |

> **Cái này không thể thay thế cái kia.** Trả lời "có replica rồi" cho câu hỏi backup là trả lời sai câu hỏi.

### Bản sao có độ trễ — thứ ở giữa mà rất ít người biết

Đây là chi tiết ăn điểm mạnh nhất bài này.

Bạn có thể cấu hình một replica **cố tình chạy chậm lại 1 tiếng**:

```ini
# PostgreSQL — trên replica
recovery_min_apply_delay = '1h'
```

```sql
-- MySQL
CHANGE REPLICATION SOURCE TO SOURCE_DELAY = 3600;
```

Nó nhận WAL/binlog ngay lập tức nhưng **giữ lại một tiếng mới áp dụng**. Nghĩa là:

```text
   14:32  Gõ nhầm DELETE trên máy chính. Máy chính mất sạch.
   14:35  Bạn phát hiện ra.
   14:36  Replica trễ VẪN CÒN NGUYÊN dữ liệu của 13:36.

   → Bạn có một cửa sổ 1 tiếng để:
        • Dừng việc áp dụng trên replica trễ ngay lập tức
        • Lấy lại đúng bảng bị xoá
        • Không phải phục hồi cả cụm từ backup
```

Cái giá: thêm một máy chủ, và nó không dùng để phục vụ đọc thời gian thực được. Nhưng với hệ mà một lệnh gõ nhầm có thể xoá dữ liệu tiền bạc, đây là món bảo hiểm rẻ nhất bạn mua được.

### Quy tắc 3-2-1 và mối đe doạ hiện đại

Quy tắc kinh điển của ngành lưu trữ:

```text
   3 bản sao của dữ liệu
   2 loại phương tiện lưu trữ khác nhau
   1 bản ở địa điểm khác (off-site)
```

Với hạ tầng đám mây, cần thêm một chữ nữa — **1 bản không thể xoá được**:

```text
   Mã độc tống tiền hiện đại KHÔNG chỉ mã hoá dữ liệu.
   Việc ĐẦU TIÊN chúng làm là đi tìm và XOÁ SẠCH BẢN SAO LƯU,
   vì có backup thì nạn nhân không trả tiền.

   Nếu tài khoản dùng để chạy backup có quyền XOÁ backup,
   thì bạn không có backup. Bạn chỉ có một file chờ bị xoá.
```

Cách chặn:

```text
   ① Object Lock / Immutable backup: bản sao lưu KHÔNG THỂ bị xoá
      trong N ngày, kể cả bằng tài khoản quản trị cao nhất.
   ② Tài khoản ghi backup KHÔNG có quyền xoá (chỉ ghi thêm).
   ③ Một bản ở tài khoản đám mây / nhà cung cấp KHÁC hẳn.
```

## Tầng 4 — Quy trình: bản sao lưu chưa phục hồi thử không phải bản sao lưu

Người phỏng vấn đưa câu tình huống cuối, và nó thường chỉ là một câu:

> *"Lần gần nhất bạn phục hồi thử là bao giờ?"*

Đây là câu mà **không đọc tài liệu nào trả lời được**. Chỉ người đã ngồi phục hồi lúc 3 giờ sáng mới trả lời trôi.

Có một cách nói rất hay trong ngành:

> **Bản sao lưu của Schrödinger:** trước khi bạn phục hồi thử, nó vừa tồn tại vừa không tồn tại.

Những cách một bản sao lưu "có chạy" nhưng vẫn vô dụng — tất cả đều là chuyện thật, thường xuyên xảy ra:

| Kiểu hỏng | Vì sao không ai phát hiện |
|---|---|
| Job chạy mỗi đêm, nhưng ghi ra **file rỗng 0 byte** từ 4 tháng trước | Job vẫn báo "thành công", vì lệnh vẫn chạy xong |
| Bản dump thiếu một schema mới thêm | Script sao lưu liệt kê schema bằng tay, không ai cập nhật |
| Bản sao lưu **có**, nhưng mật khẩu giải mã nằm trong... chính database đó | Không ai từng thử giải mã |
| Phục hồi được nhưng **mất 14 tiếng**, trong khi RTO cam kết là 1 tiếng | Không ai từng bấm giờ |
| Phục hồi được nhưng thiếu **quyền, extension, hoặc dữ liệu ở object storage** | Chỉ tập trung vào database, quên phần còn lại |
| Bản sao lưu bị **bôi bẩn từ lâu**: dữ liệu sai đã được sao lưu 7 lần | Chỉ giữ 7 bản, và lỗi đã tồn tại 10 ngày |

Dòng cuối cùng đáng dừng lại: **thời gian giữ bản sao lưu phải dài hơn thời gian trung bình để phát hiện ra một lỗi dữ liệu.** Giữ 7 bản mà lỗi mất 3 tuần mới lộ ra thì mọi bản sao lưu bạn có đều đã chứa lỗi đó.

### Kịch bản diễn tập phục hồi, có bấm giờ

Chạy mỗi quý. Chạy trên môi trường riêng, không đụng production:

```text
   ┌─ BƯỚC 0 ────────────────────────────────────────────────────┐
   │ Bấm đồng hồ. Ghi lại giờ bắt đầu.                            │
   │ Người chạy diễn tập KHÔNG phải người dựng hệ thống sao lưu.  │
   │ (Nếu chỉ một người làm được thì bạn có rủi ro nhân sự,       │
   │  không phải quy trình.)                                      │
   └──────────────────────────────────────────────────────────────┘

   ① Dựng một máy trống, đúng phiên bản database production.
   ② Lấy bản sao lưu gần nhất từ kho — KHÔNG dùng bản để sẵn trên máy.
   ③ Phục hồi. Ghi lại: mất bao lâu, có lỗi gì không.
   ④ Phát lại WAL tới một thời điểm CỤ THỂ (ví dụ: 15 phút trước).
   ⑤ Kiểm tra dữ liệu:
        • Đếm số dòng vài bảng chính, so với production
        • Mở 3 bản ghi mới nhất, xem nội dung có đúng không
        • Chạy vài truy vấn nghiệp vụ thật (tổng doanh thu hôm qua...)
   ⑥ Khôi phục cả phần NGOÀI database:
        • File ở object storage
        • Secrets / khoá mã hoá
        • Cấu hình, extension, role và phân quyền
   ⑦ Dừng đồng hồ. GHI CON SỐ VÀO TÀI LIỆU.

   ┌─ SẢN PHẨM CỦA DIỄN TẬP ─────────────────────────────────────┐
   │ Một con số RTO đo thật, và một danh sách những thứ đã VẤP.   │
   │ Danh sách vấp mới là phần giá trị nhất — nó là những thứ     │
   │ đáng lẽ bạn sẽ phát hiện lúc 3 giờ sáng khi hệ đang chết.    │
   └──────────────────────────────────────────────────────────────┘
```

### Giám sát bản sao lưu: bốn chỉ số

Đừng chỉ theo dõi "job có chạy không". Theo dõi bốn thứ:

```text
   ① Tuổi của bản sao lưu gần nhất       → cảnh báo nếu > 26 giờ
   ② Kích thước bản sao lưu               → cảnh báo nếu lệch >20% so với
                                             lần trước (rỗng, hoặc phình lạ)
   ③ Độ trễ của WAL archiving             → cảnh báo nếu > 5 phút
   ④ Ngày diễn tập phục hồi gần nhất      → cảnh báo nếu > 90 ngày
```

Chỉ số ④ là thứ gần như không ai làm, và nó là chỉ số duy nhất thật sự chứng minh bạn có bản sao lưu.

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Chỉ có dump hàng đêm | RPO = tới 24 tiếng | Bật WAL/binlog archiving liên tục |
| Coi replica là backup | Replica chép cả lệnh xoá nhầm, trong 200ms | Hai thứ chống hai tai nạn khác nhau, phải có cả hai |
| Chưa bao giờ phục hồi thử | Không biết bản sao lưu có dùng được không, và mất bao lâu | Diễn tập mỗi quý, có bấm giờ |
| Tài khoản backup có quyền xoá backup | Mã độc/người xoá nhầm quét sạch cả bản cứu hộ | Object Lock + tài khoản chỉ được ghi thêm |
| Backup nằm cùng tài khoản/vùng với production | Sự cố cấp tài khoản là mất cả hai | Ít nhất một bản ở nơi khác hẳn |
| Giữ quá ít bản | Lỗi phát hiện muộn thì mọi bản đều đã nhiễm | Retention > thời gian trung bình phát hiện lỗi |
| Quên phần ngoài database | Phục hồi xong nhưng ảnh, file, khoá mã hoá vẫn mất | Đưa object storage + secrets vào phạm vi |
| Chỉ đo thời gian **tạo** backup | Con số quan trọng là thời gian **phục hồi** | Bấm giờ chiều phục hồi |
| Không kiểm tra tính toàn vẹn | Bản sao lưu hỏng âm thầm trên đĩa | `pg_verifybackup`, checksum, `amcheck` |
| Không ai ngoài một người biết quy trình | Người đó nghỉ phép đúng hôm sập | Viết runbook, để người khác chạy diễn tập |

## Bản chất câu hỏi

Nhìn lại hai câu đã hỏi, đúng thứ tự:

```text
   ① "Bạn vừa mất bao nhiêu dữ liệu?"    ← đo bạn có CON SỐ không
   ② "Replica đủ chưa?"                   ← đo bạn có phân biệt được
                                            HAI LOẠI TAI NẠN không
```

**Không câu nào hỏi tên công cụ.** Cả hai đều hỏi bạn **đã tính tới đâu**.

> Họ không hỏi bạn biết gì. Họ hỏi **bạn đã mất gì**.

Người từng ngồi phục hồi lúc 3 giờ sáng luôn trả lời bằng một con số — vì họ **đã bấm giờ thật**.

## Bản mẫu 30 giây

> *"Em bắt đầu từ con số chứ không từ công cụ: em hỏi nghiệp vụ **mất bao nhiêu phút dữ liệu thì chấp nhận được**, và **chết bao lâu thì chấp nhận được** — tức RPO và RTO. Hai con số đó quyết định toàn bộ phần còn lại.*
>
> *Cấu hình em chạy: một bản đầy đủ mỗi đêm, cộng **nhật ký ghi được chép ra liên tục** (WAL với Postgres, binlog với MySQL). Nhờ vế thứ hai, RPO của em là vài phút chứ không phải 11 tiếng — vì nếu chỉ có dump lúc 2 giờ sáng mà ổ đĩa chết lúc 1 giờ chiều thì em mất trọn 11 tiếng, với sàn 2.000 đơn/ngày là khoảng 900 khách đã trả tiền. Và nhật ký ghi còn cho em phục hồi về đúng một giây trước lúc ai đó gõ nhầm, chứ không phải quay về 2 giờ sáng.*
>
> ***Replica thì không thay được backup.*** *Replica chống chết máy; backup chống hỏng dữ liệu. Em gõ nhầm một câu `DELETE` thì trong khoảng 200 mili-giây cả hai bản cùng sạch. Nếu ngân sách cho phép em còn dựng thêm một **replica trễ một tiếng** — nó cho em một cửa sổ một tiếng để cứu một bảng bị xoá mà không phải phục hồi cả cụm.*
>
> *Và quan trọng nhất: **mỗi quý em phục hồi thử một lần, có bấm giờ**, do người khác chạy chứ không phải người dựng hệ thống. Bản sao lưu chưa phục hồi thử thì chưa phải bản sao lưu — em từng gặp job chạy xanh suốt nhiều tháng mà ghi ra file rỗng. Em cũng để bản sao lưu ở chế độ không thể xoá được, vì tài khoản chạy backup mà xoá được backup thì coi như không có backup."*

## Tóm tắt bài 6

- **Chọn con số trước, chọn công cụ sau.** RPO = mất bao nhiêu dữ liệu; RTO = chết bao lâu. Hai con số độc lập nhau.
- Chỉ có dump hàng đêm nghĩa là **RPO tới 24 tiếng**. Thêm **nhật ký ghi liên tục** kéo nó xuống vài phút và mở khoá khả năng phục hồi về **đúng một thời điểm**.
- Ba kiểu sao lưu chống ba việc khác nhau: **logical** (phục hồi một bảng, đổi phiên bản), **physical + WAL** (PITR), **snapshot** (RTO thấp).
- **Replica không phải backup.** Replica chống chết máy; backup chống hỏng dữ liệu. Lệnh xoá nhầm được chép sang replica trong ~200ms.
- **Replica trễ** là món bảo hiểm rẻ nằm giữa hai thứ trên.
- Bản sao lưu mà **tài khoản chạy nó xoá được** thì không phải bản sao lưu. Cần Object Lock và tài khoản chỉ ghi thêm.
- **Bản sao lưu chưa phục hồi thử không phải bản sao lưu.** Diễn tập mỗi quý, có bấm giờ, do người khác chạy, và phải bao gồm cả phần ngoài database.

**Bài kế tiếp** → [Bài 7: "Lưu số dư tiền kiểu gì?"](07-luu-so-du-tien-kieu-gi.md)
