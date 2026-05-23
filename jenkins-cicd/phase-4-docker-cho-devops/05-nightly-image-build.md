# Bài 5: Nightly image build job

Stage `Docker` build image mỗi pipeline → 5s lãng phí mỗi build (cache hit). Image thường **ổn định** vài tuần — không cần build mỗi commit. Pattern: **build image 1 lần/đêm**, pipeline chính dùng image đã build.

## Tại sao tách job?

Logic build image (Dockerfile) khác logic build app (Jenkinsfile):

- Dockerfile **hiếm khi đổi** — vài tuần/lần.
- App code **đổi mỗi commit**.

→ Trộn 2 logic trong 1 pipeline → mỗi commit kiểm tra cả 2 → lãng phí.

→ Tách:
- **Pipeline A** (`learn-jenkins-app`): build/test/deploy app, dùng image đã có. **Trigger: mỗi commit**.
- **Pipeline B** (`nightly-docker-build`): build image. **Trigger: 1 lần/đêm**.

```text
Đêm:                                  Sáng:
  Pipeline B chạy                       Dev push code
    → build image my-playwright:latest    → Pipeline A trigger
    → image sẵn sàng cho ngày sau         → dùng image my-playwright:latest
                                          → KHÔNG build image
                                          → nhanh ~5s/build
```

## Bước 1: Tạo Jenkinsfile cho nightly build

Tạo file mới ở root project tên **`Jenkinsfile-nightly`** (hoặc `Jenkinsfile.nightly` — quy ước tổ chức).

```groovy
pipeline {
    agent any
    stages {
        stage('Build Docker Image') {
            steps {
                sh 'docker build -t my-playwright .'
            }
        }
    }
}
```

→ Pipeline rất đơn giản: 1 stage, 1 lệnh. Đúng "Single Responsibility".

Commit + push.

## Bước 2: Tạo job Jenkins riêng cho nightly

Trong Jenkins UI:

1. Dashboard → **+ New Item**.
2. Tên: `nightly-build-docker-image`.
3. **Copy from**: `learn-jenkins-app` (copy config cũ để khỏi cấu hình lại Git).
4. Chọn type **Pipeline** → OK.
5. **Configure**:
   - **Pipeline → Script Path**: đổi `Jenkinsfile` → `Jenkinsfile-nightly`.
   - **Build Triggers**: tick **Build periodically**.
     - Schedule: `H 2 * * *` (chạy 2:0X AM mỗi ngày, X random).
   - **Build Triggers**: **BỎ tick** Poll SCM (không cần trigger theo commit).
6. **Save**.

→ Job mới tạo. Click **Build Now** để chạy lần đầu (test).

## Bước 3: Xoá stage Docker khỏi pipeline chính

Trong `Jenkinsfile` (file gốc), xoá hẳn:

```groovy
stage('Docker') {              // ← Xoá nguyên block
    steps {
        sh 'docker build -t my-playwright .'
    }
}
```

Commit + push. Pipeline `learn-jenkins-app` giờ chỉ:

```text
Build → Run Tests → Deploy Staging → Deploy Prod
```

→ Stage Docker biến mất.

## Verify hoạt động

1. Sau khi xoá stage Docker, chạy `learn-jenkins-app` lần nữa. Stage Deploy Staging dùng `my-playwright` — phải work vì image đã build sẵn.

2. Tối nay, job `nightly-build-docker-image` tự chạy lúc 2 AM. Sáng mai check build history → có entry mới.

## Lưu ý: máy local tắt = job không chạy

Trong khoá học, Jenkins chạy trong Docker Desktop trên máy bạn. **Tắt máy/đóng Docker = Jenkins không chạy = nightly job không trigger**.

→ Vấn đề cho học. Trong production, Jenkins chạy 24/7 trên server → nightly luôn chạy.

Workaround cho học: chạy manual khi cần update image (sau khi sửa Dockerfile).

## Trade-off khi tách

### Ưu

- Pipeline chính nhanh hơn (~5s).
- Dockerfile change không trigger pipeline app → cleaner history.
- Image rebuild đêm → pull deps mới nhất hằng đêm (catch CVE sớm).

### Nhược

- Thêm 1 job phải maintain.
- Khi cập nhật Dockerfile, phải nhớ trigger nightly thủ công (hoặc đợi đêm).
- Image dùng trong pipeline có thể **không khớp** Dockerfile (nếu nightly chưa chạy sau commit Dockerfile).

→ Trong pratice, chấp nhận trade-off này. Khi gấp, trigger nightly job manual.

## Mở rộng: image versioning chiến lược

Tới giờ ta dùng tag `latest`. Có nhược điểm:

- Không biết "image đang dùng là từ khi nào".
- Không rollback được khi image mới broken.

Pattern tốt hơn: **tag bằng date hoặc commit**:

```groovy
// Jenkinsfile-nightly
pipeline {
    agent any
    stages {
        stage('Build Docker Image') {
            steps {
                sh '''
                    DATE_TAG=$(date +%Y%m%d)
                    docker build -t my-playwright:$DATE_TAG -t my-playwright:latest .
                '''
            }
        }
    }
}
```

→ Image có 2 tag: `my-playwright:20260105` (date) + `my-playwright:latest` (pointer hiện tại).

Pipeline chính chọn:

```groovy
agent { docker { image 'my-playwright:latest' } }     // Luôn dùng mới nhất
// hoặc
agent { docker { image 'my-playwright:20260105' } }   // Pin version cụ thể
```

→ Rollback: đổi tag pin về ngày cũ.

## Push image lên registry (chuẩn bị Phase 6)

Hiện image chỉ tồn tại trên Jenkins host (local Docker daemon). Production cần push lên **registry** (Docker Hub, AWS ECR, GHCR...) để **các machine khác** pull về dùng.

Demo push lên Docker Hub:

```groovy
// Jenkinsfile-nightly
pipeline {
    agent any
    environment {
        DOCKERHUB = credentials('dockerhub-creds')   // user/pass Docker Hub
    }
    stages {
        stage('Build & Push') {
            steps {
                sh '''
                    docker build -t myusername/my-playwright:latest .
                    echo $DOCKERHUB_PSW | docker login -u $DOCKERHUB_USR --password-stdin
                    docker push myusername/my-playwright:latest
                '''
            }
        }
    }
}
```

→ Sau này nhiều máy Jenkins (multi-agent setup) đều `docker pull` được image này.

→ Phase 6 sẽ làm tương tự với **AWS ECR**.

## Tóm tắt

- Tách image build ra **job riêng** chạy nightly → pipeline chính nhanh hơn, cleaner.
- File mới: `Jenkinsfile-nightly`, job mới: `nightly-build-docker-image`.
- Trigger nightly bằng cron: `H 2 * * *` (random minute, 2 AM).
- Pipeline chính bỏ stage Docker.
- Trade-off: phải maintain 2 job, image có thể out-of-sync với Dockerfile.
- Best practice: tag image bằng date/commit + `latest` để rollback dễ.
- Production: push image lên **registry** để share giữa các machine (chuẩn bị Phase 6).

---

→ [Bài tiếp theo: Cài Linux package trong Dockerfile](06-cai-package-trong-dockerfile.md)
