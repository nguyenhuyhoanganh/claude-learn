# Bài 5: Wait command, rollback và tổng kết Phase 6

Pipeline trigger update-service nhưng **không đợi** deploy xong. Nếu stage sau muốn smoke test prod → test trước khi prod up → fail. Bài này: `aws ecs wait`, rollback strategy, tổng kết + cleanup.

## Phần 1: `aws ecs wait services-stable`

ECS có **wait commands** — block CLI cho đến khi condition đạt.

```bash
aws ecs wait services-stable \
    --cluster $AWS_ECS_CLUSTER \
    --services $AWS_ECS_SERVICE_PROD
```

> Lưu ý: `--services` (plural), khác `--service` (singular) ở `update-service`.

→ Lệnh **không return** cho đến khi service trạng thái **stable** (mọi task running + healthy).

Default timeout: 10 phút. Nếu deploy chậm hơn → CLI exit non-zero → pipeline fail.

### Thêm vào pipeline

```groovy
stage('Deploy to AWS') {
    ...
    steps {
        withCredentials([...]) {
            sh '''
                set -euo pipefail

                sed -i "s/#APP_VERSION#/${REACT_APP_VERSION}/g" aws/task-definition-prod.json

                LATEST_TD_REVISION=$(aws ecs register-task-definition \
                    --cli-input-json file://aws/task-definition-prod.json \
                    | jq -r '.taskDefinition.revision')

                aws ecs update-service \
                    --cluster $AWS_ECS_CLUSTER \
                    --service $AWS_ECS_SERVICE_PROD \
                    --task-definition $AWS_ECS_TD_PROD:$LATEST_TD_REVISION

                # Đợi rolling update hoàn tất
                aws ecs wait services-stable \
                    --cluster $AWS_ECS_CLUSTER \
                    --services $AWS_ECS_SERVICE_PROD

                echo "Deployment successful!"
            '''
        }
    }
}
```

Push + Build Now → log:

```text
+ aws ecs update-service ...
{ ... }
+ aws ecs wait services-stable --cluster ... --services ...
                                                                ← Blocked ~60-120s
+ echo Deployment successful!
Deployment successful!
```

→ Stage giờ chờ deploy thật sự xong → bài tiếp có thể smoke test an toàn.

## Phần 2: Smoke test sau deploy ECS

Phase 3 đã làm smoke test cho Netlify. Pattern tương tự cho ECS, nhưng URL khác.

Vấn đề: mỗi task ECS có **public IP khác nhau**, đổi mỗi deploy. Nếu muốn URL ổn định → cần **Application Load Balancer (ALB)** đứng trước ECS service.

→ ALB setup ngoài phạm vi khoá. Workaround đơn giản: lấy IP runtime:

```bash
TASK_ARN=$(aws ecs list-tasks --cluster $AWS_ECS_CLUSTER --service-name $AWS_ECS_SERVICE_PROD --query 'taskArns[0]' --output text)

ENI_ID=$(aws ecs describe-tasks --cluster $AWS_ECS_CLUSTER --tasks $TASK_ARN \
    --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text)

PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids $ENI_ID \
    --query 'NetworkInterfaces[0].Association.PublicIp' --output text)

echo "Production URL: http://$PUBLIC_IP"
```

→ 3 lệnh AWS lồng nhau để lấy public IP. Verbose.

Production thường:
- Dùng **ALB** + Route 53 → URL ổn định.
- Hoặc dùng **CloudFront** đứng trước ALB → CDN + HTTPS.

Khoá học bỏ qua phần này — focus vào deploy mechanics.

## Phần 3: Rollback strategies

Production fail rồi sao? 3 cách:

### 1. Manual rollback qua console

ECS console → service → **Update service** → chọn revision cũ.

```text
Revision: 4 (previous good)    ← chọn
Service force redeploy
```

→ Service rolling back về revision 4. Fast nhưng manual.

### 2. Pipeline rollback (preferred)

Mỗi build deploy `version-N`. Rollback = re-deploy `version-N-1`:

```groovy
stage('Rollback') {
    when { expression { params.ROLLBACK_TO != null } }
    steps {
        sh '''
            aws ecs update-service \
                --cluster $AWS_ECS_CLUSTER \
                --service $AWS_ECS_SERVICE_PROD \
                --task-definition $AWS_ECS_TD_PROD:$ROLLBACK_TO

            aws ecs wait services-stable ...
        '''
    }
}
```

→ Trigger manual với parameter `ROLLBACK_TO=4`. Pipeline auto rollback.

### 3. Auto-rollback on failure

ECS có **deployment circuit breaker** — nếu task mới fail X lần → tự rollback:

```json
"deploymentConfiguration": {
    "deploymentCircuitBreaker": {
        "enable": true,
        "rollback": true
    },
    "maximumPercent": 200,
    "minimumHealthyPercent": 100
}
```

→ Tự động fall back khi healthcheck fail. **Production-grade**.

## Phần 4: Cleanup (cực kỳ quan trọng)

ECS không free tier → không cleanup = tốn tiền. Sau khi xong khoá:

### 4.1. Stop ECS service

ECS Console → cluster → service → **Update** → `Desired tasks: 0` → Update.

→ Task stop, không tính compute.

### 4.2. Delete service

Service → **Delete service**.

→ Service xoá.

### 4.3. Delete cluster

Cluster → **Delete cluster** → gõ tên confirm.

→ Cluster xoá. **Không** ảnh hưởng ECR (registry tách).

### 4.4. Delete ECR images (optional)

ECR repo → tab Images → select all → **Delete**.

Hoặc xoá cả repo:

ECR repo → **Delete repository** → confirm.

→ Storage cost = 0.

### 4.5. Verify

Vài giây sau:
- ECS console: 0 cluster, 0 service.
- ECR console: 0 repo (nếu delete).
- Billing dashboard (sau 24h): cost back to S3 only.

> **Cẩn thận**: chưa xoá là vẫn tốn. Set reminder calendar 1 tuần sau check lại.

## ✨ Tổng kết Phase 6

Bạn đi từ "không biết ECS" đến **pipeline tự động build → push ECR → deploy ECS**.

### Khái niệm đã nắm

- **ECS** = managed container orchestration AWS-native.
- **Cluster → Service → Task → Container** — 4 tầng.
- **Task Definition** = JSON blueprint, versioned.
- **Fargate** = serverless, không thấy EC2.
- **ECR** = registry private cho image.
- **Rolling update** — ECS đảm bảo uptime (start new trước, stop old sau).
- **Rollback** — re-deploy revision cũ qua console/pipeline/circuit breaker.

### Kỹ năng đã hành

- Tạo cluster + task def + service qua UI (warm-up).
- Viết Dockerfile cho app (nginx + build).
- Build + tag + push image lên ECR.
- Custom AWS CLI image với Docker + jq.
- Pipeline: `sed` thay placeholder → `register-task-definition` → `update-service` → `wait services-stable`.
- Quản lý IAM policy: thêm ECR + ECS FullAccess.
- Cleanup mọi resource để tránh cost.

### Pipeline kết quả

```text
Checkout SCM
    ↓
Build (npm ci + build)
    ↓
Tests (parallel: Unit + E2E)
    ↓
Build Docker image (tag với BUILD_ID)
    ↓
Push ECR
    ↓
Deploy to AWS ECS (sed + register + update + wait)
```

Mỗi commit → tự động qua mọi stage, ECS rolling update không downtime.

### Hạn chế khoá học

- **Không có ALB** → URL đổi mỗi deploy.
- **Không có HTTPS** → cần ACM cert + ALB/CloudFront.
- **Không có auto-scaling** → desiredCount cố định.
- **Không có monitoring/alerts** → cần CloudWatch + SNS.
- **IAM policy quá rộng** (`*FullAccess`) → production cần scope hẹp.

→ Đây là **phần advanced** — học sau Phase 6 nếu cần.

## Phase 6 → Phase 7

Phase 6 là **đỉnh kỹ thuật** của khoá. Phase 7 wrap-up:

- Cleanup AWS resources (đã đề cập trên).
- Lịch sử Jenkins + tương lai.
- Bonus + roadmap học tiếp.

## Đọc thêm

- ECS Workshop: <https://ecsworkshop.com> — hands-on tutorial chuyên sâu.
- AWS Architecture Center: <https://aws.amazon.com/architecture/> — patterns thực tế.
- "Container Patterns" — book chuyên về container deployment.

## Bạn đã sẵn sàng cho Phase 7 nếu...

- [ ] Hiểu ECS cluster vs service vs task vs task definition.
- [ ] Biết Fargate khác EC2 launch type ở đâu.
- [ ] Tự viết được Dockerfile cho app Node/React.
- [ ] Hiểu flow: build → tag → push ECR.
- [ ] Biết `aws ecs register-task-definition` + `update-service` + `wait services-stable`.
- [ ] Hiểu vì sao cần `sed` thay placeholder + ý nghĩa Checkout SCM fresh mỗi build.
- [ ] Biết cleanup ECS + ECR sau khi xong.

---

→ **Sẵn sàng?** [Phase 7: Tổng kết khoá học](../phase-7-tong-ket/01-terminate-aws-resources.md)
