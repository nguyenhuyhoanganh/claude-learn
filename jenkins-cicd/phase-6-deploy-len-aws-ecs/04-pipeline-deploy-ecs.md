# Bài 4: Pipeline tự động deploy ECS

Image đã ở ECR. Task Definition đã tham chiếu image. Còn 2 việc: **đăng ký task def version mới** + **update service** dùng version mới. Bài này automate cả hai qua AWS CLI.

## Flow

```text
Stage Deploy:
  1. sed replace #APP_VERSION# → version thật trong task-definition-prod.json
  2. aws ecs register-task-definition → tạo revision mới
  3. Parse response JSON → lấy revision number
  4. aws ecs update-service → trỏ service vào revision mới
  5. aws ecs wait services-stable → đợi rolling deploy xong
```

## Bước 1: `sed` thay version trong task definition

Task def có placeholder `#APP_VERSION#`. Pipeline phải thay bằng version thật trước khi register.

```bash
sed -i "s/#APP_VERSION#/$REACT_APP_VERSION/g" aws/task-definition-prod.json
```

Giải nghĩa:

- **`sed`** — stream editor.
- **`-i`** — edit in place (sửa trực tiếp file).
- **`s/<find>/<replace>/g`** — substitute. `g` = global (mọi occurrence).
- **`s/#APP_VERSION#/$REACT_APP_VERSION/g`** — tìm `#APP_VERSION#`, thay bằng giá trị biến `$REACT_APP_VERSION`.
- **`aws/task-definition-prod.json`** — file.

→ Sau `sed`:

```json
"image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/learn-jenkins-app:1.0.42"
```

> Quote outer phải **double quote** `"..."` để shell expand `$REACT_APP_VERSION`. Nếu single quote → không expand.

### Vì sao dùng placeholder?

Nếu commit `task-definition-prod.json` với image hardcoded `:latest`, mỗi deploy phải hardcode lại version → human error.

Placeholder + `sed` → version inject runtime → tự động đồng bộ với build number.

## Bước 2: `aws ecs register-task-definition`

```bash
aws ecs register-task-definition \
    --cli-input-json file://aws/task-definition-prod.json
```

- **`--cli-input-json file://<path>`** — đọc input từ file JSON.
- **`file://`** prefix bắt buộc (3 dấu `/`).

→ Output JSON chứa info revision mới:

```json
{
    "taskDefinition": {
        "taskDefinitionArn": "arn:aws:ecs:us-east-1:...:task-definition/learn-jenkins-app-task-definition-prod:5",
        "family": "learn-jenkins-app-task-definition-prod",
        "revision": 5,
        ...
    }
}
```

→ Bước 3 parse revision = 5.

## Bước 3: Parse revision với `jq`

```bash
LATEST_TD_REVISION=$(aws ecs register-task-definition \
    --cli-input-json file://aws/task-definition-prod.json \
    | jq '.taskDefinition.revision')
echo "Latest TD revision: $LATEST_TD_REVISION"
```

Pattern:

- `$(...)` — capture stdout của command.
- Pipe output của `aws` vào `jq`.
- `jq '.taskDefinition.revision'` — JMESPath, lấy field `taskDefinition.revision`.

→ `LATEST_TD_REVISION = 5`.

## Bước 4: `aws ecs update-service`

```bash
aws ecs update-service \
    --cluster $AWS_ECS_CLUSTER \
    --service $AWS_ECS_SERVICE_PROD \
    --task-definition $AWS_ECS_TD_PROD:$LATEST_TD_REVISION
```

Tham số:

- `--cluster` — tên cluster (`learn-jenkins-app-cluster-prod`).
- `--service` — tên service (`learn-jenkins-app-service-prod`).
- `--task-definition` — `family:revision` (vd `learn-jenkins-app-task-definition-prod:5`).

→ ECS trigger **rolling update**:

```text
T+0:   Service desiredCount=1, current task v4
T+10:  Start task v5 (đợi healthy)
T+30:  Task v5 healthy + serving traffic
T+40:  Stop task v4
T+60:  Done. desiredCount=1, current = v5
```

Default: ECS đảm bảo **uptime** (start new trước, stop old sau).

## Env vars cần thêm

```groovy
environment {
    APP_NAME             = 'learn-jenkins-app'
    AWS_DEFAULT_REGION   = 'us-east-1'
    AWS_DOCKER_REGISTRY  = '123456789012.dkr.ecr.us-east-1.amazonaws.com'
    AWS_ECS_CLUSTER      = 'learn-jenkins-app-cluster-prod'
    AWS_ECS_SERVICE_PROD = 'learn-jenkins-app-service-prod'
    AWS_ECS_TD_PROD      = 'learn-jenkins-app-task-definition-prod'
    REACT_APP_VERSION    = "1.0.${BUILD_ID}"
}
```

→ Mọi tên hardcode 1 chỗ. Đổi service → sửa env, không phải scan command.

## Stage Deploy hoàn chỉnh

```groovy
stage('Deploy to AWS') {
    agent {
        docker {
            image 'my-aws-cli'
            args  '-u root -v /var/run/docker.sock:/var/run/docker.sock'
            reuseNode true
        }
    }
    steps {
        withCredentials([usernamePassword(
            credentialsId: 'my-aws',
            usernameVariable: 'AWS_ACCESS_KEY_ID',
            passwordVariable: 'AWS_SECRET_ACCESS_KEY'
        )]) {
            sh """
                set -euo pipefail

                # 1. Replace placeholder
                sed -i "s/#APP_VERSION#/${REACT_APP_VERSION}/g" aws/task-definition-prod.json

                # 2. Register new task def
                LATEST_TD_REVISION=\$(aws ecs register-task-definition \
                    --cli-input-json file://aws/task-definition-prod.json \
                    | jq '.taskDefinition.revision')

                echo "New task definition revision: \$LATEST_TD_REVISION"

                # 3. Update service
                aws ecs update-service \
                    --cluster ${AWS_ECS_CLUSTER} \
                    --service ${AWS_ECS_SERVICE_PROD} \
                    --task-definition ${AWS_ECS_TD_PROD}:\$LATEST_TD_REVISION
            """
        }
    }
}
```

**Lưu ý syntax**:

- Outer quote `"""..."""` → Groovy interpolate `${REACT_APP_VERSION}`, `${AWS_ECS_CLUSTER}` trước khi đẩy xuống shell.
- `\$` escape — giữ `$LATEST_TD_REVISION` cho shell (không Groovy).
- `\(`...`\)` không cần (đã có `$(...)` thoát qua escape `\$`).

Hoặc dùng `'''...'''` để tránh escape:

```groovy
sh '''
    set -euo pipefail
    sed -i "s/#APP_VERSION#/${REACT_APP_VERSION}/g" aws/task-definition-prod.json
    LATEST_TD_REVISION=$(aws ecs register-task-definition --cli-input-json file://aws/task-definition-prod.json | jq '.taskDefinition.revision')
    aws ecs update-service \
        --cluster $AWS_ECS_CLUSTER \
        --service $AWS_ECS_SERVICE_PROD \
        --task-definition $AWS_ECS_TD_PROD:$LATEST_TD_REVISION
'''
```

→ Shell tự đọc env var `${REACT_APP_VERSION}` (vì Jenkins inject vào env shell). Groovy không can thiệp.

## Verify deployment

Push + Build Now → log:

```text
+ sed -i s/#APP_VERSION#/1.0.42/g aws/task-definition-prod.json
+ aws ecs register-task-definition --cli-input-json file://aws/task-definition-prod.json
+ jq .taskDefinition.revision
New task definition revision: 5
+ aws ecs update-service --cluster learn-jenkins-app-cluster-prod ...
{
    "service": { ... "taskDefinition": "...:5", ... }
}
```

→ ECS bắt đầu rolling update. Pipeline return ngay (chưa chờ deploy xong → bài 5 thêm wait).

Vào ECS console → cluster → service → **Events** tab → thấy log:

```text
(service ...) has reached a steady state.
(service ...) (deployment ...) deregistered task arn:aws:ecs:...:task/...
(service ...) registered 1 targets in target-group...
```

Browser truy cập public IP → thấy app version mới deploy.

## Vấn đề: `sed` sửa file commit

`sed -i` sửa file trong workspace → khi rerun pipeline, file đã có version cũ thay. `sed` lần 2 không tìm `#APP_VERSION#` (đã bị thay).

**Fix 1**: tạo bản copy, sed file copy:

```bash
cp aws/task-definition-prod.json /tmp/task-def.json
sed -i "s/#APP_VERSION#/${REACT_APP_VERSION}/g" /tmp/task-def.json
aws ecs register-task-definition --cli-input-json file:///tmp/task-def.json | ...
```

**Fix 2**: dùng `cleanWs()` đầu pipeline (Phase 1 đã học) → workspace fresh mỗi build.

**Fix 3**: stage Build (Checkout SCM) **auto-clone repo mỗi build** → file luôn fresh. Đây là default Jenkins → không cần làm gì.

→ Khoá học rely on default Checkout SCM behavior. Mỗi build pull repo lại → file `task-definition-prod.json` luôn có `#APP_VERSION#`.

## Permission cần thêm

Lần đầu run, có thể fail với:

```text
An error occurred (AccessDeniedException) when calling the RegisterTaskDefinition operation
```

→ IAM user `jenkins` thiếu policy. Bài 2 đã thêm `AmazonECS_FullAccess` — verify.

## Pitfall

### Pitfall 1: `sed` không work trên macOS local

```bash
sed -i "..." file              # GNU sed (Linux): OK
sed -i "" "..." file           # BSD sed (macOS): khác syntax
```

→ Trong container Linux thì OK. Test local Mac dùng `sed -i ""`.

### Pitfall 2: `jq` ra string có quote

```text
"5"                # ← có quote
```

→ Dùng `jq -r` (raw) hoặc strip quote. Cách dễ: dùng số raw:

```bash
jq -r '.taskDefinition.revision'         # ← Output: 5 (không quote)
```

### Pitfall 3: Cluster/service name trong AWS khác Jenkinsfile

→ Update task def revision OK, nhưng update service fail vì service không tồn tại. Check tên đúng.

### Pitfall 4: ECS update vẫn lâu deploy

`update-service` chỉ trigger. Rolling update mất 30-90s. Bài 5 dùng `wait` đợi xong.

## Tóm tắt

- 4 lệnh deploy: `sed` → `register-task-definition` → `jq` parse revision → `update-service`.
- `sed -i "s/x/y/g" file` thay text trong file.
- `aws ... | jq '.path.to.field'` parse JSON, capture vào shell var với `$(...)`.
- Env vars hardcode names 1 chỗ — dễ refactor.
- `sed` modify file workspace → rely Checkout SCM mỗi build fresh.
- `update-service` trigger rolling update, ECS đảm bảo uptime.

---

→ [Bài tiếp theo: Wait command và tổng kết Phase 6](05-rolling-update-va-rollback.md)
