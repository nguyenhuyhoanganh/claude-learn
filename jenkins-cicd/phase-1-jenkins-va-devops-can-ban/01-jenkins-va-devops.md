# Bài 1: Jenkins là gì và vì sao gắn liền với DevOps?

## Một câu chuyện trước khi định nghĩa

Priya là developer trong một team nhỏ. Mỗi lần khách hàng yêu cầu thay đổi, Priya phải tự tay:

1. Sửa code → push lên Git.
2. Build lại phần mềm.
3. Chạy hết tests.
4. Đóng gói thành bản chạy được.
5. Upload lên server.
6. Vào browser kiểm tra xem có lỗi không.

Priya **mê viết code**. Còn 5 việc còn lại thì nhàm chán, lặp đi lặp lại, và mỗi lần làm là một lần dễ sai. Có lần Priya quên upload 1 file CSS → website mất layout vài giờ. Có lần Priya upload nhầm build cũ → bug đã sửa lại quay về.

Trong một buổi retrospective, đồng nghiệp Alex đề nghị: *"Hay thử Jenkins?"*

Đây là vấn đề **mọi team phần mềm hiện đại đều gặp**, và Jenkins là **một trong những lời giải kinh điển nhất**.

---

## Jenkins là gì?

> Jenkins là **automation server** mã nguồn mở, viết bằng Java, dùng để **tự động hoá các công việc lặp đi lặp lại** trong vòng đời phát triển phần mềm — chủ yếu là **build, test, và deploy**.

Cách dễ hình dung nhất: Jenkins giống một **robot trợ lý** — bạn dạy nó một chuỗi việc làm, nó sẽ tự làm 24/7, không kêu ca, không quên bước.

Khi Priya commit code mới, Jenkins có thể:

```text
Code mới push lên Git
          │
          ▼
┌─────────────────────────┐
│  Jenkins phát hiện       │
│  có code mới             │
└────────────┬────────────┘
             │
             ▼
   ┌──────────────────────┐
   │  Tự động:            │
   │  1. Pull code         │
   │  2. Compile            │
   │  3. Chạy unit test     │
   │  4. Chạy E2E test      │
   │  5. Build Docker image │
   │  6. Push lên registry  │
   │  7. Deploy lên server  │
   │  8. Smoke test         │
   │  9. Báo Slack          │
   └──────────────────────┘
```

Trong lúc Priya đi pha cà phê, Jenkins đã làm xong toàn bộ. Nếu có bước nào lỗi, Jenkins dừng và báo chính xác lỗi ở đâu.

### Định nghĩa chính xác hơn

Trong giới DevOps, Jenkins được gọi là **Continuous Integration / Continuous Deployment (CI/CD) tool**. Hai khái niệm này sẽ học sâu ở phase 2 và 3. Tạm hiểu:

- **CI (Continuous Integration)**: mỗi lần code thay đổi → tự động build + test để **bắt lỗi sớm**.
- **CD (Continuous Deployment / Delivery)**: sau khi build + test pass → tự động đưa code lên môi trường chạy thật.

---

## Vì sao Jenkins quan trọng?

### 1. Bắt lỗi sớm

Trước đây: developer làm 2 tuần → merge code → mới phát hiện code conflict, test fail. Cuối cùng mất thêm 1 tuần fix.

Với Jenkins: **mỗi lần commit** đều build + test. Nếu lỗi → biết ngay trong vòng vài phút, fix khi context còn fresh.

### 2. Loại bỏ "works on my machine"

Bạn deploy lên server, lỗi. Đồng nghiệp bảo *"trên máy tao chạy bình thường mà"*. Đây là nightmare kinh điển.

Jenkins build trong **môi trường chuẩn hoá** (thường là Docker container) → kết quả y nhau bất kể máy ai chạy.

### 3. Giải phóng developer khỏi việc lặp lại

Đếm thử: mỗi ngày bạn mất bao nhiêu phút cho việc build + test + deploy thủ công? Nếu 30 phút × 200 ngày làm việc/năm = **100 giờ/năm cho 1 người**. Một team 5 người = **500 giờ tự do** để làm việc thật sự sáng tạo.

### 4. Lịch sử & truy vết

Mỗi lần Jenkins chạy đều lưu log, kết quả test, artifact build. 3 tháng sau khi production có bug, bạn vẫn xem được **commit nào, build nào, ai deploy** — cực kỳ quan trọng để truy nguyên.

---

## Jenkins fit vào bức tranh DevOps như thế nào?

Bài này có lý do nhắc DevOps song song với Jenkins: **Jenkins là công cụ, DevOps là văn hoá**. Hai cái đi cùng nhau nhưng không phải một.

### DevOps không phải là gì?

- **Không phải** một chuẩn / spec — mỗi tổ chức hiểu DevOps một kiểu.
- **Không phải** một tool / phần mềm.
- **Không phải** "cứ dùng Jenkins là làm DevOps".

### DevOps thực sự là gì?

DevOps là **một sự thay đổi mindset** trong cách team xây và vận hành phần mềm. Để hiểu rõ, xem ví dụ kinh điển:

```text
Customer muốn feature mới
         │
         ▼
┌────────────────┐  pass spec   ┌─────────────┐  pass code   ┌─────────────┐
│ Project Manager│ ───────────► │  Developer  │ ───────────► │  Tester     │
└────────────────┘              └─────────────┘              └──────┬──────┘
                                                                    │ pass build
                                                                    ▼
                              ┌─────────────────────────────────────────┐
                              │  Sysadmin / Ops → deploy lên production │
                              └─────────────────────────────────────────┘
```

Mỗi nhóm có **góc nhìn khác nhau**:

- **Dev** quan tâm: code có chạy, feature có đầy đủ.
- **Ops/Sysadmin** quan tâm: server có ổn, uptime cao, security tốt.
- **Tester** quan tâm: có bug nào không.
- **PM** quan tâm: đúng deadline, đúng budget.

Khi có lỗi production:

> Dev: *"Code tôi chạy đúng mà, chắc Ops cấu hình sai."*  
> Ops: *"Server tôi ổn định mà, chắc code Dev có bug."*  
> Tester: *"Tôi test đủ case rồi mà..."*

**Mọi người đổ lỗi nhau, không ai chịu trách nhiệm tổng thể.**

### DevOps khắc phục bằng cách nào?

1. **Phá silo** — Dev, Ops, Tester cùng ngồi nhìn vào sản phẩm cuối, **cùng chịu trách nhiệm**.
2. **Automation** — mọi việc lặp lại đều phải tự động hoá → giảm sai sót, tăng tốc độ. Đây là chỗ **Jenkins toả sáng**.
3. **Learning culture** — sai thì học, không đổ lỗi. Lỗi production là cơ hội cải thiện hệ thống, không phải để săn lỗi cá nhân.
4. **Iterative & feedback** — không dồn release lớn, mà ship nhỏ liên tục, lấy feedback nhanh.

### Vòng lặp DevOps

```text
       Plan ──────► Code ──────► Build
        ▲                          │
        │                          ▼
   Monitor                       Test
        ▲                          │
        │                          ▼
     Operate ◄────── Deploy ◄──── Release
```

Vòng này **không bao giờ dừng** — mỗi iteration của phần mềm đều đi qua các bước này, và feedback từ Monitor lại feed ngược về Plan. Jenkins là công cụ tự động hoá phần **Build → Test → Release → Deploy**.

---

## Mối quan hệ Jenkins ↔ DevOps

| Việc                            | Jenkins làm | DevOps mindset |
|---------------------------------|-------------|----------------|
| Tự động build mỗi khi push      | ✅           | (Tự động hoá)  |
| Run test tự động                | ✅           | (Bắt lỗi sớm)  |
| Deploy lên server               | ✅           | (Iterative)    |
| Dev & Ops cùng đọc log lỗi      | (Cung cấp log) | ✅ (Phá silo) |
| Không đổ lỗi khi production fail | —           | ✅ (Văn hoá)   |
| Học từ incident                 | —           | ✅              |

**Tóm lại**: bạn có thể cài Jenkins, viết pipeline đẹp, nhưng nếu team vẫn **đổ lỗi cho nhau** và **dấu lỗi đi** thì đó **không phải DevOps**. Ngược lại, một team không dùng Jenkins nhưng có văn hoá hợp tác + automation tốt thì vẫn "DevOps hơn" nhiều team có Jenkins.

---

## Cảnh báo: dùng tool có chữ "DevOps" ≠ làm DevOps

Đây là sai lầm phổ biến của các tổ chức mới bắt đầu:

- Mua tool Jenkins, GitLab CI, ArgoCD, Terraform… đắt tiền.
- Tổ chức training cho 1-2 người gọi là "DevOps Engineer".
- Vẫn để Dev và Ops ngồi 2 phòng khác nhau, vẫn đổ lỗi.

→ Đây **không phải** DevOps. Đây là *DevOps theatre* (DevOps biểu diễn).

DevOps thật sự đòi hỏi:
- **Thay đổi structure tổ chức** (đôi khi phải gộp team).
- **Thay đổi process** (CI/CD, code review, on-call).
- **Thay đổi mindset** (blameless postmortem, ownership).

Tool như Jenkins **hỗ trợ** quá trình thay đổi này, nhưng không thay thế được.

---

## Trong khoá học này, bạn sẽ học gì?

```text
Phase 1: Jenkins căn bản    ← Bạn đang ở đây
   │
   ▼
Phase 2: CI thật sự (test + report)
   │
   ▼
Phase 3: CD (staging → production)
   │
   ▼
Phase 4: Docker chuyên sâu cho pipeline
   │
   ▼
Phase 5: Deploy lên AWS (S3, EC2)
   │
   ▼
Phase 6: Deploy container lên ECS
   │
   ▼
Phase 7: Roadmap tiếp theo
```

Khoá này **tập trung vào automation** (phần kỹ thuật của DevOps). Phần văn hoá / tổ chức nằm ngoài phạm vi — bạn nên đọc thêm sách (gợi ý cuối bài).

---

## Tóm tắt

- **Jenkins** là automation server mã nguồn mở, dùng để tự động hoá build, test, deploy.
- Mỗi lần code thay đổi → Jenkins tự build + test → **bắt lỗi sớm**, **chuẩn hoá môi trường**, **giải phóng developer**.
- **DevOps** là **văn hoá hợp tác + tự động hoá**, không phải tool.
- Jenkins **hỗ trợ** DevOps (phần automation), nhưng không thay thế được phần thay đổi văn hoá tổ chức.
- Trong khoá: tập trung vào Jenkins + automation; bạn tự tìm hiểu thêm phần văn hoá.

---

## Đọc thêm (rất khuyến khích)

- **The Phoenix Project** (Gene Kim) — tiểu thuyết kinh điển về DevOps transformation. Đọc như đọc truyện, không khô khan. Có audiobook.
- **The DevOps Handbook** — phần lý thuyết chính thức, đi cùng The Phoenix Project.
- **Accelerate** (Nicole Forsgren) — research-based, chứng minh DevOps mang lại kết quả kinh doanh đo lường được.
- **State of DevOps Report** (DORA) — báo cáo hằng năm, free download, giúp benchmark team bạn.

---

→ [Bài tiếp theo: Cài Jenkins bằng Docker](02-cai-dat-jenkins-voi-docker.md)
