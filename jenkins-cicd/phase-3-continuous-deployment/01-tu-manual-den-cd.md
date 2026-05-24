# Bài 1: Từ manual deployment đến Continuous Deployment

Phase 2 đã có CI hoàn chỉnh — code được build + test tự động. Nhưng **deploy** thì vẫn thủ công. Phase 3 đẩy automation thêm một bước: **đưa code lên server thật, hoàn toàn tự động**.

## Pipeline hiện tại đứng ở đâu?

```text
   ┌─────────┐   ┌─────────┐   ┌──────────┐   ┌──────────┐
   │  Code   │ → │  Build  │ → │   Test   │ → │   E2E    │ → ??? (manual)
   │  (Git)  │   │  (npm)  │   │  (jest)  │   │(Playwright)│
   └─────────┘   └─────────┘   └──────────┘   └──────────┘
                                                                ↓
                                                        Dev tải build/ về
                                                        FTP / SSH copy lên server
                                                        Click "publish"
                                                        Mở browser kiểm tra
```

Mỗi lần release, dev (hoặc ops) phải:
1. Tải `build/` từ Jenkins.
2. Upload qua FTP / SCP / dashboard cloud.
3. Đợi xong → mở browser kiểm tra.
4. Nếu hỏng → rollback thủ công.

**Vấn đề**:
- Tốn thời gian (10-30 phút/release).
- Sai sót (upload nhầm thư mục, quên file).
- Không deploy đêm khuya nếu Dev đi ngủ.
- Không có log audit "ai deploy lúc nào".

## Mục tiêu Phase 3

```text
┌─────────────────────────────────────────────────────────────────┐
│ Git push  →  Build  →  Test  →  Deploy Staging  →  E2E Staging │
│                                                          ↓        │
│                                                  Manual Approval  │ (Continuous Delivery)
│                                                          ↓        │
│                                                   Deploy Prod     │
│                                                          ↓        │
│                                                  E2E Production   │
└─────────────────────────────────────────────────────────────────┘
        (Bỏ approval → Continuous Deployment)
```

Sau Phase 3, pipeline tự động:

- Build + test (Phase 2).
- Deploy lên **staging environment** (môi trường gần giống production).
- Chạy E2E test trên staging.
- **Manual approval** (có người duyệt) → hoặc **bỏ qua approval** → tự động deploy production.
- Chạy E2E test trên production.
- Cả pipeline trigger tự động khi push code.

## Deploy đi đâu? Netlify

Khoá học dùng **Netlify** làm cloud hosting:

- **Free tier** đủ cho dự án nhỏ. Không cần thẻ tín dụng.
- Có **CLI tool** (`netlify-cli`) → script được. Đây là điều **bắt buộc** để automation từ Jenkins.
- Hỗ trợ static site (HTML/CSS/JS) — đúng output của React build.
- Có concept **preview URL** → mỗi deploy có URL riêng (dùng làm staging).
- Có concept **production URL** → URL chính thức cho user cuối.

Lý do chọn Netlify cho khoá học (so với S3, Vercel, GitHub Pages...):
- Setup đơn giản nhất.
- Có sẵn staging/production qua flag CLI.
- Token-based auth (không cần SSH key, cloud account đặt sẵn).

Phase 5 sẽ deploy lên **AWS S3** — tương tự nhưng đầy đủ enterprise hơn. Hiểu Netlify thì AWS dễ.

### Đăng ký Netlify

1. <https://app.netlify.com/signup>.
2. Sign up bằng email hoặc GitHub account.
3. Verify email.
4. Khi hỏi *"Create your first site"* → **Skip this step for now**.
5. Bạn vào dashboard:

```text
┌────────────────────────────────────────────┐
│  Netlify                                    │
├────────────────────────────────────────────┤
│  Sites           Domains    Forms    Pages  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  + Add new site                       │  │
│  │  • Import existing project            │  │
│  │  • Start from template                │  │
│  │  • Deploy manually   ← chọn cho bài  │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

## Demo: manual deployment (chỉ làm 1 lần)

Trước khi tự động hoá, **làm tay** một lần để hiểu **đầu vào / đầu ra** của deploy. Đây là nguyên tắc vàng: **không automate cái mình chưa hiểu**.

### Bước 1: Có sẵn build folder

Trong project local, chạy:

```bash
npm ci
npm run build
```

→ Có thư mục `build/` chứa file production.

Hoặc tải file zip mẫu từ resources khoá (chứa `build/` đã build sẵn).

### Bước 2: Upload qua Netlify UI

1. Trên Netlify dashboard → **Add new site** → **Deploy manually**.
2. **Drag & drop** thư mục `build/` vào ô upload (hoặc click **Browse to upload**).
3. Đợi 30 giây.

Netlify tạo cho bạn 1 site mới với URL random kiểu:

```text
https://golden-pavlova-abc123.netlify.app
```

→ Mở URL trên browser → website của bạn đã online!

### Bước 3: Khám phá Netlify dashboard

Vào trang site mới tạo:

```text
┌─────────────────────────────────────────────────────┐
│  golden-pavlova-abc123                              │
├─────────────────────────────────────────────────────┤
│  Site Overview │ Deploys │ Site Configuration │ ... │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Production: https://golden-pavlova-abc123.netlify.app │
│  Latest deploy: 2 minutes ago                        │
│                                                      │
│  Build status: ✓ Published                          │
└─────────────────────────────────────────────────────┘
```

Vào **Site Configuration** → bạn thấy **Site ID** (dạng UUID `12345678-abcd-ef00-1234-567890abcdef`). Lưu lại — sẽ dùng ở bài 2.

> Có thể đổi tên site (Site Configuration → Change site name) — nhưng URL `.netlify.app` cũng đổi theo. Cẩn thận nếu đang share link.

### Bước 4: Suy ngẫm — "automation phải làm những gì?"

Tóm lại, deploy thủ công gồm:
1. Có file build sẵn.
2. Auth với Netlify (qua browser).
3. Chọn site (chọn site ID).
4. Upload thư mục build.
5. Đợi xong → verify.

→ **Jenkins phải làm đúng 5 bước trên qua CLI**, không click chuột. Bài 2 sẽ dùng **Netlify CLI**.

## Continuous Delivery vs Continuous Deployment

Cả 2 đều viết tắt là **CD** — đây là điểm gây nhầm lẫn kinh điển. Khác biệt **chỉ ở approval cuối cùng**:

| Khái niệm                  | Có manual approval? | Production update |
|----------------------------|---------------------|-------------------|
| **Continuous Delivery**    | ✅ Có               | Sau khi human duyệt |
| **Continuous Deployment**  | ❌ Không             | Tự động 100%      |

```text
Continuous Delivery:
   Build → Test → Deploy Staging → Test → [⏸ APPROVAL] → Deploy Prod

Continuous Deployment:
   Build → Test → Deploy Staging → Test → Deploy Prod
                                                ↑
                                          (tự động, không approval)
```

**Khi nào dùng cái nào?**

- **Delivery** (có approval): website có business risk cao (e-commerce, banking), industry có compliance (medical, finance), team mới adopt DevOps.
- **Deployment** (không approval): startup tốc độ cao, tổ chức trưởng thành về test coverage, có rollback tự động khi lỗi.

→ Phase 3 sẽ làm **cả 2** — đầu tiên là Delivery (bài 7 sẽ thêm approval), cuối Phase đổi sang Deployment (bài 9 bỏ approval + thêm version check).

## Lưu ý setup Netlify

- **Free tier** giới hạn: 100 GB bandwidth/tháng, 300 build minutes/tháng (build trên Netlify, không tính từ Jenkins). Đủ cho học.
- Site **public mặc định**. Để private cần plan Pro.
- **Không tự khoá site** sau N ngày inactive — không sợ mất.

## Tóm tắt

- Pipeline CI Phase 2 dừng sau test → deploy vẫn manual.
- Phase 3 mở rộng: **deploy lên cloud (Netlify) hoàn toàn tự động**, có staging + production environment.
- **Continuous Delivery** = tự động build + test + staging, **có manual approval** trước production.
- **Continuous Deployment** = tự động cả production, không approval.
- Trước khi automate: **làm thủ công 1 lần** để hiểu input/output cần gì.
- Netlify là hosting đơn giản, có CLI, có concept preview/production URL → phù hợp khoá học.

---

→ [Bài tiếp theo: Cài CLI tool và lưu config trong environment variables](02-cli-tools-va-env-config.md)
