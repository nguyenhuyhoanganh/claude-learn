# Bài 1: Bảo mật image — quét lỗ hổng, non-root, distroless

Một câu hỏi đơn giản: image `node:18` của bạn có bao nhiêu lỗ hổng đã biết?

```bash
trivy image node:18
```

```text
node:18 (debian 12.4)
Total: 847 (UNKNOWN: 2, LOW: 583, MEDIUM: 191, HIGH: 63, CRITICAL: 8)
```

**847 lỗ hổng**, trong đó 8 mức nghiêm trọng — và bạn chưa viết một dòng code nào. Bài này chỉ ra chúng từ đâu ra và cách giảm xuống gần bằng 0.

---

## Lỗ hổng đến từ đâu

```text
   ┌─────────────────────────────────────────────────────────┐
   │  Code của bạn                     ~1% lỗ hổng           │
   ├─────────────────────────────────────────────────────────┤
   │  Thư viện npm/pip/maven           ~15%                  │
   ├─────────────────────────────────────────────────────────┤
   │  HỆ ĐIỀU HÀNH TRONG IMAGE GỐC     ~84%                  │
   │  (bash, curl, openssl, glibc, apt, perl, python...)     │
   │  Phần lớn ứng dụng của bạn KHÔNG DÙNG TỚI               │
   └─────────────────────────────────────────────────────────┘
```

Đây là nhận thức quan trọng nhất: **phần lớn lỗ hổng nằm ở những phần mềm bạn không hề dùng tới**. Ứng dụng Node.js không cần `perl`, không cần `apt`, không cần `bash`. Nhưng chúng vẫn nằm trong image, và mỗi cái là một bề mặt tấn công.

---

## Chọn image gốc — đòn bẩy lớn nhất

```bash
trivy image --severity HIGH,CRITICAL node:18
trivy image --severity HIGH,CRITICAL node:18-slim
trivy image --severity HIGH,CRITICAL node:18-alpine
trivy image --severity HIGH,CRITICAL gcr.io/distroless/nodejs18-debian12
```

| Image gốc | Kích thước | HIGH + CRITICAL | Có shell |
|---|---|---|---|
| `node:18` | ~1,1 GB | ~70 | Có |
| `node:18-slim` | ~250 MB | ~15 | Có |
| `node:18-alpine` | ~180 MB | ~3 | Có (`ash`) |
| `gcr.io/distroless/nodejs18` | ~170 MB | **~0** | **Không** |

(Con số cụ thể thay đổi theo thời điểm; tỉ lệ giữa chúng thì ổn định.)

### Distroless — chỉ có runtime, không có gì khác

```text
   Image THƯỜNG chứa:
   ┌────────────────────────────────────────────┐
   │ Ứng dụng của bạn                           │
   │ Runtime (node, python, jre)                │
   │ Shell (bash, sh)          ← kẻ tấn công cần│
   │ Trình quản lý gói (apt, apk) ← để cài thêm │
   │ Công cụ mạng (curl, wget) ← để tải mã độc  │
   │ Tiện ích (ps, ls, cat, find)               │
   │ Hàng trăm thư viện hệ thống                │
   └────────────────────────────────────────────┘

   DISTROLESS chứa:
   ┌────────────────────────────────────────────┐
   │ Ứng dụng của bạn                           │
   │ Runtime                                    │
   │ Chứng chỉ CA, múi giờ, vài thư viện lõi    │
   └────────────────────────────────────────────┘
```

Ý nghĩa an ninh rất lớn: kẻ tấn công chiếm được quyền thực thi trong container distroless thì **không có shell để chạy lệnh, không có `curl` để tải công cụ, không có `apt` để cài thêm**. Nhiều kỹ thuật tấn công tiêu chuẩn đơn giản là không thực hiện được.

```dockerfile
# Multi-stage: build ở image đầy đủ, chạy ở distroless
FROM node:18 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs18-debian12
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
USER nonroot
CMD ["dist/server.js"]
```

Lưu ý: distroless **không có shell**, nên `CMD` phải dùng dạng exec (mảng), không dùng dạng chuỗi.

### Cái giá của distroless

| Vấn đề | Cách xử lý |
|---|---|
| `kubectl exec ... -- sh` **không chạy được** | Dùng `kubectl debug` với ephemeral container (xem Phase 20) |
| Không có `curl` để `healthcheck` trong Dockerfile | Dùng `httpGet` probe của Kubernetes |
| Khó gỡ lỗi khi có sự cố | Có tag `:debug` kèm busybox cho môi trường không phải production |
| Thư viện native cần glibc | Dùng `distroless/base` thay vì `static` |

> **Alpine là lựa chọn cân bằng tốt**: nhỏ, ít lỗ hổng, **vẫn có shell**. Nhược điểm: dùng `musl` thay `glibc`, gây lỗi khó hiểu với một số thư viện native (đặc biệt Python có phần mở rộng C, và các gói npm biên dịch sẵn).

---

## Chạy bằng non-root — bắt buộc

Mặc định container chạy bằng **root**. Đây là mặc định tệ nhất trong Docker.

```dockerfile
# SAI — mặc định là root
FROM node:18-alpine
COPY . /app
CMD ["node", "/app/server.js"]

# ĐÚNG
FROM node:18-alpine
RUN addgroup -g 1001 -S appgroup && \
    adduser  -u 1001 -S appuser -G appgroup
WORKDIR /app
COPY --chown=appuser:appgroup . .
USER appuser                      # ← dòng quyết định
CMD ["node", "server.js"]
```

Ép ở phía Kubernetes, không tin vào Dockerfile:

```yaml
spec:
  securityContext:                    # cấp Pod
    runAsNonRoot: true                # TỪ CHỐI chạy nếu image dùng root
    runAsUser: 1001
    runAsGroup: 1001
    fsGroup: 1001                     # quyền sở hữu volume gắn vào
    seccompProfile:
      type: RuntimeDefault            # chặn phần lớn syscall nguy hiểm

  containers:
    - name: app
      securityContext:                # cấp container
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
```

Giải nghĩa từng trường:

| Trường | Chặn được gì |
|---|---|
| `runAsNonRoot: true` | Pod **không khởi động** nếu image chạy bằng root — lưới an toàn cuối cùng |
| `allowPrivilegeEscalation: false` | Chặn `setuid` leo thang quyền trong container |
| `readOnlyRootFilesystem: true` | Kẻ tấn công **không ghi được file** → không cài được backdoor |
| `capabilities: drop: ["ALL"]` | Bỏ mọi quyền đặc biệt của Linux (`NET_ADMIN`, `SYS_ADMIN`…) |
| `seccompProfile: RuntimeDefault` | Chặn khoảng 300 syscall không cần thiết |

`readOnlyRootFilesystem: true` thường làm ứng dụng lỗi vì cần ghi file tạm. Cách xử lý:

```yaml
      volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: cache
          mountPath: /app/.cache
      volumes:
        - name: tmp
          emptyDir: {}
        - name: cache
          emptyDir: {}
```

Chỉ mở đúng những thư mục thật sự cần ghi — phần còn lại vẫn chỉ đọc.

---

## Quét lỗ hổng và đưa vào CI

```bash
# Quét image
trivy image myapp:v1.2.3

# Chỉ quan tâm mức cao, và chỉ những lỗ hổng ĐÃ CÓ BẢN VÁ
trivy image --severity HIGH,CRITICAL --ignore-unfixed myapp:v1.2.3

# Quét cả Dockerfile để tìm lỗi cấu hình
trivy config ./Dockerfile

# Quét thư viện trong mã nguồn
trivy fs --scanners vuln,secret .
```

Cờ **`--ignore-unfixed`** rất quan trọng thực tế: rất nhiều lỗ hổng **chưa có bản vá**, nên báo động về chúng chỉ tạo nhiễu. Tập trung vào cái sửa được.

```yaml
# GitHub Actions
- name: Quét image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: myapp:${{ github.sha }}
    severity: CRITICAL,HIGH
    ignore-unfixed: true
    exit-code: '1'          # LÀM HỎNG build nếu có lỗ hổng
    format: 'sarif'
    output: 'trivy.sarif'
```

> **Lời khuyên triển khai**: đừng bật `exit-code: 1` ngay ngày đầu — bộ build sẽ đỏ hết và cả đội sẽ tắt nó đi. Bắt đầu bằng chế độ chỉ báo cáo, dọn dần, rồi mới bật chặn.

### Quét cả trong registry, không chỉ trong CI

Lỗ hổng mới được công bố **sau khi** image đã build. Image bạn quét sạch hôm nay có thể có 5 lỗ hổng nghiêm trọng vào tuần sau — mà CI không chạy lại.

```bash
# Quét định kỳ toàn bộ image đang chạy trong cụm
trivy k8s --report summary cluster
```

Các registry như Harbor, ECR, GCR đều có quét tự động định kỳ — nên bật.

---

## Ghim phiên bản bằng digest

```dockerfile
# YẾU — tag có thể bị đẩy đè
FROM node:18-alpine

# TỐT HƠN — cụ thể hơn, nhưng vẫn là tag
FROM node:18.19.1-alpine3.19

# MẠNH NHẤT — digest không thể đổi
FROM node:18.19.1-alpine3.19@sha256:f2dc6eea95f787e25f173ba9904c9d0647ab2506178c7b5b7c5a3d02bc4af145
```

```text
   Vì sao digest quan trọng:

   Tag "18-alpine" hôm nay trỏ tới image A.
   Tuần sau maintainer đẩy image B đè lên cùng tag.
   → Build lại → NHẬN IMAGE KHÁC mà không hề biết
   → Không tái lập được build cũ
   → Và nếu tài khoản maintainer bị chiếm, bạn nhận mã độc
```

Digest là **hàm băm của nội dung** — nó không thể trỏ tới thứ khác. Dùng công cụ như Renovate hay Dependabot để tự động cập nhật digest kèm pull request, giữ được cả tính tái lập lẫn tính cập nhật.

---

## Đừng để lộ bí mật trong image

### Bí mật nằm lại trong layer dù đã xoá

```dockerfile
# SAI — token VẪN NẰM trong lịch sử layer
FROM node:18
COPY .npmrc /root/.npmrc          # chứa token
RUN npm ci
RUN rm /root/.npmrc               # xoá ở layer SAU — VÔ ÍCH
```

```bash
# Ai cũng lấy lại được
docker history --no-trunc myapp:v1
docker save myapp:v1 | tar -x && grep -r "npm_token" .
```

Layer là **bất biến và cộng dồn**. Xoá file ở layer sau chỉ đánh dấu nó biến mất ở tầng nhìn thấy — dữ liệu vẫn còn nguyên trong layer trước.

```dockerfile
# ĐÚNG — BuildKit secret mount, KHÔNG bao giờ vào layer nào
# syntax=docker/dockerfile:1
FROM node:18
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci
```

```bash
DOCKER_BUILDKIT=1 docker build --secret id=npmrc,src=$HOME/.npmrc -t myapp:v1 .
```

### `.dockerignore` — tuyến phòng thủ đầu tiên

```text
.git
.env
.env.*
*.pem
*.key
node_modules
.aws
.ssh
**/secrets/
**/*credentials*
```

Không có `.dockerignore`, một lệnh `COPY . .` vô hại sẽ đưa cả thư mục `.git` (chứa toàn bộ lịch sử, kể cả bí mật đã từng commit rồi xoá) và file `.env` vào image.

```bash
# Kiểm tra image đã build có lộ gì không
trivy image --scanners secret myapp:v1.2.3
```

---

## Ký image và kiểm chứng nguồn gốc

Quét lỗ hổng trả lời *"image này có lỗ hổng không"*. Ký image trả lời một câu khác: *"image này có đúng do CI của chúng ta build ra không, hay ai đó đã đẩy đè lên?"*

```bash
# Ký bằng cosign, không cần quản lý khoá (keyless, dùng OIDC)
cosign sign --yes myregistry.io/myapp:v1.2.3

# Kiểm chứng
cosign verify \
  --certificate-identity-regexp="https://github.com/myorg/myapp/.*" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  myregistry.io/myapp:v1.2.3
```

Ép ở cấp cụm bằng admission controller:

```yaml
# Kyverno — từ chối image không có chữ ký hợp lệ
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: kiem-chung-chu-ky
spec:
  validationFailureAction: Enforce
  rules:
    - name: kiem-tra-chu-ky
      match:
        resources:
          kinds: [Pod]
      verifyImages:
        - imageReferences: ["myregistry.io/*"]
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/myorg/*"
                    issuer: "https://token.actions.githubusercontent.com"
```

---

## Danh sách kiểm tra image production

| Mục | Lệnh kiểm tra |
|---|---|
| Không chạy bằng root | `docker inspect myapp:v1 --format '{{.Config.User}}'` — phải khác rỗng và khác `0` |
| Dùng multi-stage build | Đọc Dockerfile |
| Image gốc tối giản | `docker images myapp:v1` — dưới ~300 MB cho app thường |
| Không có lỗ hổng HIGH/CRITICAL đã có bản vá | `trivy image --severity HIGH,CRITICAL --ignore-unfixed` |
| Không lộ bí mật | `trivy image --scanners secret` |
| Ghim bằng digest | Đọc Dockerfile |
| Có `.dockerignore` | Kiểm tra file tồn tại và đủ mục |
| Có `HEALTHCHECK` hoặc probe Kubernetes | Đọc manifest |
| `readOnlyRootFilesystem` | Đọc manifest |
| `capabilities: drop: ["ALL"]` | Đọc manifest |
| Đã ký | `cosign verify` |

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dùng image gốc đầy đủ (`node:18`) cho production | **~70 lỗ hổng HIGH/CRITICAL** miễn phí |
| Không đặt `USER` trong Dockerfile | Container chạy **root** — thoát container là chiếm node |
| `RUN rm secret` sau khi `COPY secret` | **Bí mật vẫn còn** trong layer, ai cũng lấy được |
| Không có `.dockerignore` | Cả `.git` và `.env` vào image |
| Dùng tag `latest` | Không tái lập được build, và có thể bị đẩy đè |
| Chỉ quét trong CI, không quét trong registry | Lỗ hổng công bố **sau** khi build thì không ai biết |
| Bật `exit-code: 1` ngay ngày đầu | Build đỏ hết, cả đội tắt tính năng quét |
| `readOnlyRootFilesystem` mà không mount `/tmp` | Ứng dụng lỗi khi ghi file tạm |
| Dùng distroless rồi ngạc nhiên vì `kubectl exec` không chạy | Đó là **tính năng**, không phải lỗi — dùng `kubectl debug` |
| Alpine cho ứng dụng Python có phần mở rộng C | Lỗi khó hiểu do `musl` khác `glibc` |
| Không quét thư viện của ứng dụng | Lỗ hổng npm/pip bị bỏ sót hoàn toàn |

---

## Tóm tắt bài 1

- **~84% lỗ hổng trong image đến từ hệ điều hành nền**, không phải code của bạn — và phần lớn là phần mềm ứng dụng **không hề dùng tới**.
- **Chọn image gốc là đòn bẩy lớn nhất**: từ `node:18` (~70 lỗ hổng HIGH/CRITICAL) xuống `distroless` (~0).
- **Distroless không có shell, không có trình quản lý gói, không có `curl`** — nhiều kỹ thuật tấn công tiêu chuẩn đơn giản là không thực hiện được. Cái giá là khó gỡ lỗi (dùng `kubectl debug`).
- **Alpine là lựa chọn cân bằng** — nhỏ, ít lỗ hổng, vẫn có shell. Nhưng `musl` khác `glibc` gây lỗi với một số thư viện native.
- **Container mặc định chạy bằng root** — mặc định tệ nhất của Docker. Đặt `USER` trong Dockerfile **và** ép bằng `runAsNonRoot: true` ở Kubernetes.
- Bộ `securityContext` tối thiểu: `runAsNonRoot`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities: drop: ["ALL"]`, `seccompProfile: RuntimeDefault`.
- **Xoá bí mật ở layer sau là vô ích** — layer bất biến và cộng dồn, `docker history` lấy lại được. Dùng **BuildKit secret mount**.
- **`.dockerignore` là tuyến phòng thủ đầu tiên** — không có nó thì `.git` và `.env` vào thẳng image.
- **Ghim bằng digest**, không phải tag — tag có thể bị đẩy đè, digest thì không.
- **Quét cả trong registry**, không chỉ trong CI — lỗ hổng mới công bố sau khi build thì CI không biết. Dùng `--ignore-unfixed` để giảm nhiễu.
- **Ký image (cosign) trả lời câu hỏi khác với quét lỗ hổng**: "image này có đúng do CI của ta build không". Ép bằng admission controller như Kyverno.

**Bài kế tiếp** → [Bài 2: RBAC và ServiceAccount — ai được làm gì trong cụm](02-rbac-va-serviceaccount.md)
