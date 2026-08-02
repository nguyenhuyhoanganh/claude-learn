# Case 8: Deploy giữa chừng làm hỏng giao dịch

## Triệu chứng

```text
   14:00  Deploy phiên bản mới lên production. Rolling update, 12 pod.
   14:03  Deploy hoàn tất. Mọi chỉ số bình thường.
   14:20  Bắt đầu có khiếu nại: "tôi chuyển tiền mà không thấy gì".

   Kiểm tra: 84 giao dịch ở trạng thái SENT, không bao giờ chuyển tiếp.
   Tiền đã trừ khỏi tài khoản khách. Lệnh đã gửi tới ngân hàng.
   Nhưng KHÔNG CÓ TIẾN TRÌNH NÀO đang chờ kết quả nữa —
   các pod cũ đã bị dừng giữa chừng.
```

Đây là loại sự cố mà **không có gì trong code sai**. Phiên bản cũ đúng, phiên bản mới đúng. Vấn đề nằm ở **khoảnh khắc chuyển giao**.

## Chẩn đoán

```sql
-- BƯỚC 1: các giao dịch treo có tập trung vào khoảng thời gian nào không?
SELECT date_trunc('minute', created_at) AS phut, count(*)
FROM transfers
WHERE status = 'SENT' AND created_at > now() - interval '2 hours'
GROUP BY 1 ORDER BY 1;
```

```text
   phut     | count
   ---------+-------
   14:00    |    31
   14:01    |    28
   14:02    |    25
   14:03    |     0
              ▲
   Chỉ tập trung trong 3 phút deploy → nguyên nhân là deploy,
   không phải lỗi nghiệp vụ.
```

```bash
# BƯỚC 2: pod bị dừng thế nào?
kubectl get events --sort-by=.lastTimestamp | grep -i "killing\|preStop"
#   Killing container transfer-api ... (grace period 30s)

# BƯỚC 3: ứng dụng có xử lý tín hiệu dừng không?
grep -rn "SIGTERM\|shutdown\|@PreDestroy\|preStop" src/ deploy/
#   (không có kết quả)  → ứng dụng bị giết ngay lập tức
```

## Bốn thứ bị mất khi pod dừng đột ngột

```text
   ① REQUEST ĐANG XỬ LÝ DỞ
      Đã trừ tiền, chưa ghi kết quả.

   ② TIẾN TRÌNH ĐANG CHỜ PHẢN HỒI TỪ BÊN NGOÀI  ← trường hợp trên
      Đã gửi lệnh, đang chờ ngân hàng trả lời.
      Pod chết → không ai nhận kết quả → giao dịch treo vĩnh viễn.

   ③ TÁC VỤ TRONG BỘ NHỚ
      Lịch thử lại, hàng đợi nội bộ, bộ đếm — mất sạch.

   ④ JOB NỀN ĐANG CHẠY
      Chạy được 60% rồi dừng, không có checkpoint (case 6).
```

```text
   ⚠ ĐIỀU NGUY HIỂM NHẤT LÀ ②:

   Trạng thái "đang chờ kết quả" tồn tại TRONG BỘ NHỚ của một tiến trình.
   Tiến trình chết là trạng thái đó biến mất, và KHÔNG AI BIẾT
   là có việc đang dang dở.

   → Đây là lý do trạng thái quan trọng KHÔNG ĐƯỢC chỉ nằm trong bộ nhớ.
```

## Nguyên tắc gốc: mọi việc dang dở phải khôi phục được từ database

```text
   ❌ MÔ HÌNH SAI — trạng thái nằm trong bộ nhớ tiến trình:

      var ketQua = nganHangClient.chuyenTien(lenh);   // chờ 30 giây
      transferDao.capNhat(id, ketQua);                // pod chết ở đây là mất

   ✅ MÔ HÌNH ĐÚNG — trạng thái luôn ở database:

      transferDao.capNhatTrangThai(id, "SENT", maThamChieu);   // ghi TRƯỚC
      try {
          var ketQua = nganHangClient.chuyenTien(lenh);
          transferDao.capNhatTrangThai(id, ketQua.status(), ...);
      } catch (Exception e) {
          transferDao.capNhatTrangThai(id, "UNKNOWN", ...);
      }

   → Pod chết ở bất kỳ đâu, database vẫn ghi "SENT" hoặc "UNKNOWN".
     Một job quét định kỳ sẽ nhặt lên và tra soát (case 2).
```

```text
   ⚠ VÀ ĐÂY LÀ ĐIỂM MẤU CHỐT:

   PHẢI CÓ JOB QUÉT CÁC GIAO DỊCH TREO, CHẠY ĐỘC LẬP VỚI LUỒNG CHÍNH.

   Không có job này, ghi trạng thái vào database cũng vô nghĩa —
   vì không ai đọc lên để xử lý tiếp.

      SELECT * FROM transfers
      WHERE status IN ('SENT','UNKNOWN')
        AND updated_at < now() - interval '5 minutes';
```

## Dừng ứng dụng đúng cách

```text
   TRÌNH TỰ DỪNG AN TOÀN:

   ① NHẬN TÍN HIỆU DỪNG
        ↓
   ② BÁO "KHÔNG SẴN SÀNG" cho bộ cân bằng tải
      → ngừng nhận request MỚI, nhưng vẫn xử lý request đang có
        ↓
   ③ CHỜ BỘ CÂN BẰNG TẢI GỠ MÌNH RA (5–15 giây)
      ⚠ Bước này hay bị bỏ. Không chờ thì vẫn có request mới bay vào
        trong lúc đang dừng.
        ↓
   ④ XỬ LÝ NỐT request đang dở, có giới hạn thời gian
        ↓
   ⑤ ĐÓNG kết nối database, hàng đợi, ghi nốt log
        ↓
   ⑥ THOÁT
```

```yaml
# Kubernetes — cấu hình tối thiểu
spec:
  terminationGracePeriodSeconds: 60      # phải LỚN HƠN thời gian xử lý dài nhất
  containers:
    - name: transfer-api
      lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 15"]   # ← bước ③, chờ LB gỡ ra
      readinessProbe:
        httpGet: { path: /health/ready, port: 8080 }
        periodSeconds: 3
```

```properties
# Spring Boot
server.shutdown=graceful
spring.lifecycle.timeout-per-shutdown-phase=45s
management.endpoint.health.probes.enabled=true
```

```text
   ⚠ terminationGracePeriodSeconds PHẢI LỚN HƠN:
        thời gian preStop  +  thời gian xử lý request dài nhất

   Đặt 30 giây trong khi request chuyển tiền chờ ngân hàng 45 giây
   thì pod vẫn bị giết giữa chừng.
```

## Đổi lược đồ database — nguồn sự cố deploy thứ hai

```text
   TRONG LÚC ROLLING UPDATE, PHIÊN BẢN CŨ VÀ MỚI CHẠY ĐỒNG THỜI.
   CẢ HAI ĐỀU DÙNG CHUNG MỘT DATABASE.

   ❌ NHỮNG THAY ĐỔI LÀM HỎNG PHIÊN BẢN CŨ NGAY LẬP TỨC:
      · Xoá cột
      · Đổi tên cột
      · Đổi kiểu dữ liệu
      · Thêm cột NOT NULL không có giá trị mặc định
      · Thêm ràng buộc mà dữ liệu cũ vi phạm

   ✅ QUY TẮC: MỌI THAY ĐỔI LƯỢC ĐỒ PHẢI TƯƠNG THÍCH NGƯỢC
      TRONG ÍT NHẤT MỘT PHIÊN BẢN.
```

```text
   QUY TRÌNH ĐỔI TÊN CỘT AN TOÀN — BỐN LẦN TRIỂN KHAI:

   Lần 1: THÊM cột mới, code ghi CẢ HAI cột, đọc cột cũ
   Lần 2: chép dữ liệu cũ sang cột mới theo lô
   Lần 3: code đọc cột MỚI, vẫn ghi cả hai
   Lần 4: bỏ ghi cột cũ, sau một thời gian ổn định thì XOÁ cột cũ

   → Chậm, nhưng mỗi bước đều có đường lùi.
   → Đây là cái giá của việc không có downtime.
```

## Ba loại thao tác cần đối xử khác nhau khi deploy

```text
   ① REQUEST NGẮN (< 1 giây)
      → Dừng nhẹ nhàng là đủ.

   ② REQUEST DÀI, CÓ GỌI RA NGOÀI (chuyển tiền, thanh toán)
      → Ghi trạng thái vào database TRƯỚC khi gọi ra ngoài
      → Có job quét giao dịch treo
      → Thời gian chờ dừng phải đủ dài

   ③ JOB NỀN CHẠY LÂU
      → Checkpoint theo lô (case 6)
      → KHÔNG deploy trong khung giờ job chạy
      → Hoặc tách job ra khỏi chu kỳ deploy của API
```

```text
   ⚠ CÁCH ĐƠN GIẢN VÀ HIỆU QUẢ NHẤT CHO ③:

   ĐẶT KHUNG GIỜ CẤM DEPLOY trùng với khung giờ job tài chính chạy.
   Job đối soát và trả lãi chạy 02:00–04:00 thì cấm deploy khung đó.

   Không cần kỹ thuật gì phức tạp, chỉ cần một quy tắc trong quy trình.
```

## Xử lý ngay với 84 giao dịch treo

```text
   ① KHÔNG HOÀN TIỀN TỰ ĐỘNG (case 2 — đây là cách mất tiền nhanh nhất)

   ② TRUY VẤN TRẠNG THÁI TỪNG GIAO DỊCH ở ngân hàng theo mã tham chiếu
      → phần lớn sẽ ra kết quả rõ ràng

   ③ VỚI GIAO DỊCH VẪN KHÔNG RÕ → gửi tra soát chính thức

   ④ THÔNG BÁO KHÁCH: đang tra soát, tiền không mất, có mốc thời gian

   ⑤ SAU KHI XONG: kiểm tra tài khoản treo đã về 0 chưa
```

## Chặn tái diễn

```text
   ① DỪNG NHẸ NHÀNG — preStop + readiness + grace period đủ dài
   ② TRẠNG THÁI QUAN TRỌNG LUÔN Ở DATABASE, không ở bộ nhớ
   ③ JOB QUÉT GIAO DỊCH TREO chạy độc lập, mỗi 5 phút
   ④ THAY ĐỔI LƯỢC ĐỒ TƯƠNG THÍCH NGƯỢC, không có ngoại lệ
   ⑤ KHUNG GIỜ CẤM DEPLOY trùng giờ job tài chính
   ⑥ KIỂM TRA SAU MỖI LẦN DEPLOY
```

```bash
# Kiểm tra tự động chạy 10 phút sau mỗi lần deploy
#!/usr/bin/env bash
TREO=$(psql -tAc "
  SELECT count(*) FROM transfers
  WHERE status IN ('SENT','UNKNOWN')
    AND updated_at < now() - interval '5 minutes'")

if [ "$TREO" -gt 0 ]; then
  echo "CẢNH BÁO: $TREO giao dịch treo sau deploy"
  exit 1        # chặn pipeline, buộc xem xét
fi
```

```java
// Test dừng nhẹ nhàng — chạy trong môi trường staging
@Test
void dung_ung_dung_giua_chung_khong_lam_treo_giao_dich() {
    var future = CompletableFuture.runAsync(() -> chuyenTien(soTien));
    Thread.sleep(500);                       // đang gọi ngân hàng

    applicationContext.close();              // mô phỏng tín hiệu dừng

    var gd = transferDao.findLast();
    assertThat(gd.getStatus())
        .as("Phải ghi được trạng thái trước khi dừng")
        .isIn("SENT", "UNKNOWN", "SUCCESS", "FAILED");
    assertThat(gd.getStatus()).isNotEqualTo("CREATED");
}
```

## Bài học

```text
   ① CODE ĐÚNG Ở CẢ HAI PHIÊN BẢN VẪN CÓ THỂ HỎNG Ở KHOẢNH KHẮC
      CHUYỂN GIAO.

   ② TRẠNG THÁI TRONG BỘ NHỚ TIẾN TRÌNH LÀ TRẠNG THÁI SẼ MẤT.
      Ghi vào database TRƯỚC khi gọi ra ngoài.

   ③ GHI TRẠNG THÁI MÀ KHÔNG CÓ JOB QUÉT THÌ VÔ NGHĨA.
      Phải có tiến trình độc lập nhặt việc dang dở lên xử lý.

   ④ DỪNG NHẸ NHÀNG PHẢI CÓ BƯỚC CHỜ BỘ CÂN BẰNG TẢI GỠ MÌNH RA.
      Bỏ bước này thì vẫn có request mới bay vào trong lúc đang dừng.

   ⑤ ROLLING UPDATE NGHĨA LÀ HAI PHIÊN BẢN CHẠY ĐỒNG THỜI.
      Mọi thay đổi lược đồ phải tương thích ngược ít nhất một phiên bản.

   ⑥ CẤM DEPLOY TRONG GIỜ JOB TÀI CHÍNH CHẠY.
      Một quy tắc trong quy trình, không tốn công kỹ thuật,
      và chặn được cả một nhóm sự cố.
```

**Bài kế tiếp** → [Case 9: Sai tỷ giá và sai làm tròn hàng loạt](09-sai-ty-gia-lam-tron.md)

**Quay lại** → [Case 7: Webhook mất](07-webhook-mat.md)
