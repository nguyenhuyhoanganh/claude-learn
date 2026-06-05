# Bài 50: Push Docker image lên Artifact Registry

> GKE cluster cần pull image từ registry public/private. Bài này dùng **Google Artifact Registry** (successor của Container Registry). Push 4 service image lên, configure GKE pull.

## Artifact Registry là gì?

Managed Docker registry trên Google Cloud. Pricing:
- $0.10/GB/month storage.
- Egress trong region free; cross-region $0.12/GB.

So với Docker Hub: private, gần GKE → pull nhanh, không rate limit, auth tự động qua IAM.

## Tạo Artifact Registry repository

```text
$ gcloud artifacts repositories create food-ordering-repo \
    --repository-format=docker \
    --location=us-central1 \
    --description="Food ordering microservices"

Created repository [food-ordering-repo].
```

Hostname: `us-central1-docker.pkg.dev/food-ordering-system-001/food-ordering-repo/`.

## Configure Docker auth

```text
$ gcloud auth configure-docker us-central1-docker.pkg.dev

Adding credentials for: us-central1-docker.pkg.dev
After update, the following will be written to your Docker config file...
```

Docker tự xác thực qua gcloud token khi push.

## Tag image

Build local lần nữa với tag chuẩn:
```text
$ cd order-service/order-container
$ mvn clean package -DskipTests

$ docker build -t us-central1-docker.pkg.dev/food-ordering-system-001/food-ordering-repo/order-service:1.0 .
```

Hoặc retag image cũ:
```text
$ docker tag food-ordering/order-service:1.0 \
    us-central1-docker.pkg.dev/food-ordering-system-001/food-ordering-repo/order-service:1.0
```

## Push

```text
$ docker push us-central1-docker.pkg.dev/food-ordering-system-001/food-ordering-repo/order-service:1.0

The push refers to repository [us-central1-docker.pkg.dev/food-ordering-system-001/food-ordering-repo/order-service]
abc123: Pushed
def456: Pushed
1.0: digest: sha256:... size: 2421
```

Image ~250 MB Spring Boot → push ~2-5 phút lần đầu.

Verify:
```text
$ gcloud artifacts docker images list us-central1-docker.pkg.dev/food-ordering-system-001/food-ordering-repo

IMAGE                                                                                  DIGEST       CREATE_TIME
us-central1-docker.pkg.dev/.../food-ordering-repo/order-service                       sha256:...   2026-06-04
```

Hoặc qua console: <https://console.cloud.google.com/artifacts/docker/...>.

## Push 4 service

Tạo script `push-all.sh`:

```bash
#!/bin/bash
REGISTRY=us-central1-docker.pkg.dev/food-ordering-system-001/food-ordering-repo
TAG=${1:-1.0}

for svc in order payment restaurant customer; do
    echo "Building $svc..."
    cd $svc-service/$svc-container
    mvn clean package -DskipTests || exit 1
    docker build -t $REGISTRY/$svc-service:$TAG . || exit 1
    docker push $REGISTRY/$svc-service:$TAG || exit 1
    cd ../..
done
```

```text
$ ./push-all.sh 1.0
```

## Update Deployment YAML để dùng image GKE

```yaml
# infrastructure/k8s/order-service/deployment-gke.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: food-ordering-system
spec:
  replicas: 2                                        # GKE có 12 GB tổng → 2 replica OK
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
    spec:
      containers:
        - name: order-service
          image: us-central1-docker.pkg.dev/food-ordering-system-001/food-ordering-repo/order-service:1.0
          imagePullPolicy: Always                     # production: pull mỗi lần (cho rolling update)
          ports:
            - containerPort: 8181
          env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: POSTGRES_PASSWORD
            - name: SPRING_CONFIG_LOCATION
              value: "file:/config/application.yml"
          volumeMounts:
            - name: config-volume
              mountPath: /config
          resources:
            requests:
              memory: 768Mi
              cpu: 250m
            limits:
              memory: 1Gi
              cpu: 1000m
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8181
            initialDelaySeconds: 60
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8181
            initialDelaySeconds: 120
            periodSeconds: 30
      volumes:
        - name: config-volume
          configMap:
            name: order-service-config
            items:
              - key: application.yml
                path: application.yml
```

`imagePullPolicy: Always` — mỗi rollout pod pull image mới (theo digest), giúp rolling update reliable.

## GKE Workload Identity (production)

Local minikube dùng env var pass password. Production tốt hơn dùng Workload Identity — Pod **mượn** identity của Google Service Account, không cần secret tay.

```text
# Tạo GSA
$ gcloud iam service-accounts create order-service-gsa

# Grant role
$ gcloud projects add-iam-policy-binding food-ordering-system-001 \
    --member="serviceAccount:order-service-gsa@food-ordering-system-001.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Bind với KSA
$ kubectl annotate serviceaccount order-sa \
    iam.gke.io/gcp-service-account=order-service-gsa@food-ordering-system-001.iam.gserviceaccount.com
```

Pod chạy với KSA → tự nhận GSA permission → đọc secret từ Secret Manager → inject env tự động.

Khoá học giữ đơn giản (K8s Secret), không setup Workload Identity. Production nghiêm túc nên dùng.

## Cloud Build CI/CD (preview, không bắt buộc)

```yaml
# cloudbuild.yaml
steps:
  - name: 'maven:3.9-eclipse-temurin-17'
    entrypoint: 'mvn'
    args: ['clean', 'package', '-DskipTests']

  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'us-central1-docker.pkg.dev/$PROJECT_ID/food-ordering-repo/order-service:$SHORT_SHA'
      - 'order-service/order-container'

  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'us-central1-docker.pkg.dev/$PROJECT_ID/food-ordering-repo/order-service:$SHORT_SHA']

  - name: 'gcr.io/cloud-builders/kubectl'
    args:
      - 'set'
      - 'image'
      - 'deployment/order-service'
      - 'order-service=us-central1-docker.pkg.dev/$PROJECT_ID/food-ordering-repo/order-service:$SHORT_SHA'
    env:
      - 'CLOUDSDK_COMPUTE_ZONE=us-central1-a'
      - 'CLOUDSDK_CONTAINER_CLUSTER=food-ordering-cluster'

options:
  logging: CLOUD_LOGGING_ONLY
```

Push Git tag → Cloud Build trigger → build + push + deploy auto. Đó là CI/CD pipeline production thực.

## Image size optimization

Order service image ~250 MB. Có thể giảm:

### Multi-stage build

```dockerfile
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
COPY order-service/ order-service/
COPY common/ common/
COPY infrastructure/ infrastructure/
RUN mvn clean package -pl order-service/order-container -am -DskipTests

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /app/order-service/order-container/target/order-container.jar app.jar
EXPOSE 8181
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

Stage 1 build, stage 2 chỉ chứa JAR + JRE. Final image ~ 180 MB.

### Spring Boot layered JAR

```dockerfile
FROM eclipse-temurin:17-jre-alpine AS jre

FROM jre AS layers
WORKDIR /app
ARG JAR_FILE=target/order-container.jar
COPY ${JAR_FILE} application.jar
RUN java -Djarmode=layertools -jar application.jar extract

FROM jre
WORKDIR /app
COPY --from=layers /app/dependencies/ ./
COPY --from=layers /app/spring-boot-loader/ ./
COPY --from=layers /app/snapshot-dependencies/ ./
COPY --from=layers /app/application/ ./
ENTRYPOINT ["java", "org.springframework.boot.loader.JarLauncher"]
```

Spring Boot 2.3+ có "layered jar" — Docker cache layer dependency riêng → rebuild nhanh khi chỉ đổi code app.

## Bẫy thường gặp

| Triệu chứng | Sửa |
|---|---|
| `denied: Permission denied` push | `gcloud auth configure-docker` chưa chạy. Hoặc IAM thiếu role `artifactregistry.writer`. |
| Image push chậm | Network. Hoặc image to (~ 1 GB Spring Boot fat jar). Multi-stage giảm. |
| Pod `ErrImagePull` GKE | Service Account của node thiếu `roles/artifactregistry.reader`. |
| Tag conflict | Dùng SHA / timestamp thay `latest`. |
| Storage cost cao | Cleanup old tag: `gcloud artifacts docker images delete ...`. |
| Vulnerability scan fail | Enable Container Analysis: `gcloud services enable containeranalysis.googleapis.com`. |
| Build flakey | Cache Maven dependencies — `~/.m2` mount as volume hoặc dùng Cloud Build cache. |

## Tóm tắt bài 50

- Artifact Registry = managed Docker registry, tích hợp GKE.
- `gcloud artifacts repositories create` 1 lần, rồi `docker push` như Docker Hub.
- Image tag format: `LOCATION-docker.pkg.dev/PROJECT/REPO/IMAGE:TAG`.
- Deployment YAML reference image GKE full URL, `imagePullPolicy: Always` cho rolling update.
- Workload Identity (production) > K8s Secret cho secret management.
- Multi-stage Dockerfile + Spring Boot layered jar giảm image size + tăng cache hit.

**Bài kế tiếp** → [Bài 51: Deploy app lên GKE + verify SAGA cloud-native](03-deploy-app-gke.md)
