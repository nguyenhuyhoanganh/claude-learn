# Case 6: Job chạy hai lần

## Triệu chứng

```text
   02:00  Job trả lãi tiết kiệm hằng tháng khởi động.
   02:47  Job hoàn tất. Log ghi: "Đã trả lãi cho 84.203 tài khoản."
   02:51  Job KHỞI ĐỘNG LẠI. Log ghi lại y hệt.
   03:38  Hoàn tất lần hai.

   08:00  Khách hàng nhận HAI khoản lãi.
          Tổng chi thừa: 1,84 tỷ đồng.
```

Nguyên nhân: pod chạy job bị Kubernetes khởi động lại vì vượt giới hạn bộ nhớ. Job **không có cơ chế nào biết mình đã chạy rồi**.

## Chẩn đoán

```sql
-- BƯỚC 1: xác nhận có chạy trùng và phạm vi
SELECT date_trunc('hour', created_at) AS gio,
       count(*)          AS so_but_toan,
       sum(amount_minor) AS tong_tien,
       count(DISTINCT account_id) AS so_tai_khoan
FROM ledger_lines
WHERE entry_type = 'INTEREST_PAYOUT'
  AND created_at::date = current_date
GROUP BY 1 ORDER BY 1;
```

```text
   gio      | so_but_toan | tong_tien     | so_tai_khoan
   ---------+-------------+---------------+--------------
   02:00    |      84.203 | 1.840.000.000 |       84.203
   03:00    |      84.203 | 1.840.000.000 |       84.203
                 ▲
   Cùng số bút toán, cùng số tiền, cùng số tài khoản → chạy trùng hoàn toàn.
```

```sql
-- BƯỚC 2: tìm chính xác các cặp trùng để xử lý
SELECT account_id, count(*) AS so_lan, sum(amount_minor) AS tong,
       array_agg(id ORDER BY created_at) AS cac_but_toan
FROM ledger_lines
WHERE entry_type = 'INTEREST_PAYOUT'
  AND created_at::date = current_date
GROUP BY account_id
HAVING count(*) > 1;
```

```bash
# BƯỚC 3: vì sao job chạy lại?
kubectl describe pod interest-job-x7k2 | grep -A5 "Last State"
#   Last State: Terminated
#     Reason:   OOMKilled
#     Exit Code: 137
#   → Kubernetes tự khởi động lại theo restartPolicy
```

## Sáu nguyên nhân khiến job chạy trùng

```text
   ① POD BỊ KHỞI ĐỘNG LẠI GIỮA CHỪNG      ← trường hợp trên
      OOM, node bị thu hồi, deploy đúng lúc job đang chạy.

   ② NHIỀU BẢN SAO CÙNG CHẠY
      Scale lên 3 pod, cả 3 đều có bộ lập lịch riêng.

   ③ BỘ LẬP LỊCH GỬI TRÙNG
      Cron của Kubernetes có ngữ nghĩa "ít nhất một lần"
      trong một số tình huống.

   ④ NGƯỜI CHẠY TAY
      Job lỗi, kỹ sư chạy lại thủ công mà không biết lần đầu
      đã chạy được một phần.

   ⑤ ĐỔI MÚI GIỜ / GIỜ MÙA HÈ
      Cron 02:00 chạy hai lần trong đêm chuyển giờ.

   ⑥ THỬ LẠI TỰ ĐỘNG CỦA HỆ THỐNG ĐIỀU PHỐI
      Job báo lỗi ở bước cuối (ví dụ ghi log kết quả),
      hệ thống điều phối chạy lại toàn bộ.
```

```text
   ⚠ KHÔNG CÓ CÁCH NÀO NGĂN ĐƯỢC HẾT SÁU NGUYÊN NHÂN NÀY.

   → Nên nguyên tắc thiết kế phải là: JOB PHẢI AN TOÀN KHI CHẠY LẠI,
     chứ không phải "đảm bảo job chỉ chạy một lần".

   Giả định "job chỉ chạy đúng một lần" là giả định SAI trong
   mọi hệ thống phân tán.
```

## Ba lớp phòng thủ

### ① Bản ghi lần chạy — chống chạy trùng ở cấp job

```sql
CREATE TABLE job_runs (
    job_name       TEXT NOT NULL,
    business_date  DATE NOT NULL,
    status         TEXT NOT NULL,      -- RUNNING | COMPLETED | FAILED
    started_at     TIMESTAMPTZ NOT NULL,
    finished_at    TIMESTAMPTZ,
    last_processed_id BIGINT,
    processed_count   BIGINT DEFAULT 0,
    PRIMARY KEY (job_name, business_date)   -- ← khoá chống chạy trùng
);
```

```java
// Giành quyền chạy — chỉ một tiến trình thắng
int claimed = jdbc.update("""
    INSERT INTO job_runs (job_name, business_date, status, started_at)
    VALUES (?, ?, 'RUNNING', now())
    ON CONFLICT (job_name, business_date) DO NOTHING
    """, "INTEREST_PAYOUT", ngayNghiepVu);

if (claimed == 0) {
    log.warn("Job đã chạy hoặc đang chạy cho ngày {} — bỏ qua", ngayNghiepVu);
    return;
}
```

```text
   ⚠ CHÚ Ý business_date, KHÔNG PHẢI ngày giờ chạy thật.

   Job trả lãi tháng 7 chạy lại vào ngày 3/8 vẫn phải hiểu
   là "kỳ tháng 7", không phải kỳ mới.
   → Ngày nghiệp vụ là tham số ĐẦU VÀO của job, không phải now().
```

### ② Bất biến khi lặp ở cấp bản ghi — lớp quan trọng nhất

```text
   LỚP ① CHỐNG ĐƯỢC CHẠY TRÙNG TOÀN BỘ.
   NHƯNG KHÔNG CHỐNG ĐƯỢC TRƯỜNG HỢP JOB CHẾT GIỮA CHỪNG RỒI CHẠY TIẾP.

   → Cần lớp thứ hai: mỗi bản ghi chỉ được tạo MỘT LẦN,
     bất kể job chạy bao nhiêu lần.
```

```sql
-- Khoá duy nhất theo ý định nghiệp vụ, không theo lần chạy
CREATE UNIQUE INDEX uq_interest_payout
    ON ledger_lines (account_id, entry_type, business_date)
    WHERE entry_type = 'INTEREST_PAYOUT';
```

```java
// Ghi có xử lý trùng — chạy lại bao nhiêu lần cũng ra một kết quả
jdbc.update("""
    INSERT INTO ledger_lines (account_id, entry_type, business_date,
                              amount_minor, journal_entry_id)
    VALUES (?, 'INTEREST_PAYOUT', ?, ?, ?)
    ON CONFLICT (account_id, entry_type, business_date) DO NOTHING
    """, accountId, ngayNghiepVu, soTien, journalId);
```

```text
   → ĐÂY LÀ LỚP QUAN TRỌNG NHẤT.
     Có nó thì dù job chạy 10 lần, kết quả vẫn đúng.
     Không có nó thì mọi cơ chế khác chỉ là giảm xác suất.
```

### ③ Checkpoint — chạy tiếp thay vì chạy lại từ đầu

```java
Long lastId = jobRun.getLastProcessedId();
while (true) {
    List<Account> lo = accountDao.findAfter(lastId, 500);   // keyset, không OFFSET
    if (lo.isEmpty()) break;

    xuLyLo(lo, ngayNghiepVu);                               // mỗi lô một transaction

    lastId = lo.get(lo.size() - 1).getId();
    jobRunDao.checkpoint(jobName, ngayNghiepVu, lastId);    // lưu mốc
}
jobRunDao.complete(jobName, ngayNghiepVu);
```

```text
   ⚠ VÀ KHÔNG BỌC CẢ JOB TRONG MỘT TRANSACTION.

   Một transaction giữ 84.203 dòng trong 47 phút sẽ:
      · chặn dọn dẹp của database
      · giữ kết nối ở trạng thái nhàn rỗi trong transaction
      · rollback ở phút 46 = mất trắng toàn bộ

   → Mỗi lô một transaction, cộng checkpoint sau mỗi lô.
```

## Xử lý ngay khi đã chi trùng

```text
   ① DỪNG JOB VÀ KHOÁ KHÔNG CHO CHẠY LẠI

   ② XÁC ĐỊNH CHÍNH XÁC CÁC BÚT TOÁN THỪA
      Giữ bút toán đầu tiên theo thời gian, đánh dấu các bút toán sau.

   ③ ĐẢO BÚT TOÁN THỪA — KHÔNG XOÁ

         Nợ  "Ví khách hàng"          1.840.000.000
         Có  "Chi phí lãi"            1.840.000.000
         (bút toán đảo, tham chiếu tới bút toán gốc)

      → Sổ cái bất biến. Xoá dòng là phá nguyên tắc và mất dấu vết.

   ④ NẾU KHÁCH ĐÃ TIÊU MẤT PHẦN THỪA
      · Số nhỏ → chấp nhận, ghi chi phí tổn thất
      · Số lớn → liên hệ khách, thu hồi dần, không cưỡng chế đột ngột
      ⚠ Trừ thẳng làm số dư âm là tạo ra sự cố khác (case 3)

   ⑤ THÔNG BÁO CHỦ ĐỘNG
      Khách nhận hai khoản lãi sẽ nhận ra. Chủ động giải thích
      tốt hơn nhiều so với âm thầm trừ lại.
```

## Chặn tái diễn

```text
   ① KHOÁ DUY NHẤT THEO Ý ĐỊNH NGHIỆP VỤ — bắt buộc, quan trọng nhất
   ② BẢN GHI LẦN CHẠY với khoá (tên job + ngày nghiệp vụ)
   ③ CHECKPOINT theo lô, mỗi lô một transaction
   ④ NGÀY NGHIỆP VỤ LÀ THAM SỐ ĐẦU VÀO, không dùng now()
   ⑤ GIỚI HẠN TÀI NGUYÊN ĐỦ và cảnh báo trước khi chạm ngưỡng
   ⑥ THEO DÕI THỜI GIAN TRÊN MỖI BẢN GHI, không chỉ tổng thời gian
      → job chậm dần là dấu hiệu sắp có sự cố
   ⑦ HẠN MỨC CHI CẤP HỆ THỐNG (phase 4 bài 4)
      → 1,84 tỷ chi thêm trong một giờ lẽ ra phải chạm trần và dừng lại
```

```java
// Test bắt buộc cho mọi job có chi tiền
@Test
void chay_job_ba_lan_ra_cung_ket_qua() {
    seedTaiKhoan(1000);

    job.run(ngayNghiepVu);
    long lan1 = tongDaChi();

    job.run(ngayNghiepVu);
    job.run(ngayNghiepVu);

    assertThat(tongDaChi())
        .as("Job phải bất biến khi chạy lại")
        .isEqualTo(lan1);
}
```

## Bài học

```text
   ① "JOB CHỈ CHẠY MỘT LẦN" LÀ GIẢ ĐỊNH SAI.
      Pod chết, deploy, chạy tay, đổi giờ — sáu nguyên nhân,
      không cách nào ngăn hết.

   ② THIẾT KẾ ĐỂ AN TOÀN KHI CHẠY LẠI, đừng cố ngăn chạy lại.

   ③ KHOÁ DUY NHẤT THEO Ý ĐỊNH NGHIỆP VỤ LÀ LỚP MẠNH NHẤT.
      Mọi cơ chế khác chỉ giảm xác suất; lớp này chặn tuyệt đối.

   ④ NGÀY NGHIỆP VỤ PHẢI LÀ THAM SỐ, KHÔNG PHẢI now().
      Chạy lại vào ngày khác vẫn phải hiểu đúng kỳ.

   ⑤ ĐẢO BÚT TOÁN, KHÔNG XOÁ DÒNG.

   ⑥ HẠN MỨC CHI CẤP HỆ THỐNG LÀ LƯỚI AN TOÀN CUỐI CÙNG.
      Nó lẽ ra đã chặn 1,84 tỷ chi thừa ngay từ phút đầu.
```

**Bài kế tiếp** → [Case 7: Webhook mất — đơn hàng không được ghi nhận](07-webhook-mat.md)

**Quay lại** → [Case 5: Đối soát lệch](05-doi-soat-lech.md)
