# Bài 1: Deploy vProfile lên Kubernetes — kiến trúc và manifest

Project capstone cuối khoá: deploy toàn bộ vProfile stack (5 service) lên Kubernetes. Manifest sản xuất, có ConfigMap, Secret, Ingress, HPA, monitoring.

## Mục tiêu

Sau bài này bạn:
- Convert 5 Docker container (phase 28) → 5 K8s resource set.
- Hiểu khi nào dùng Deployment vs StatefulSet.
- Setup persistent storage cho MariaDB.
- Expose web qua Ingress + TLS.
- Auto-scale app tier với HPA.

## Architecture trên K8s

```text
                     Internet
                          │
                          ▼ DNS
                  +──────────────+
                  │ Ingress      │
                  │ (nginx-      │
                  │  ingress)    │
                  +──────┬───────+
                         │
                         ▼
                  +──────────────+
                  │ Service: web │ (ClusterIP)
                  +──────┬───────+
                         │ selector: app=web
                         ▼
              +─────────────────────+
              │ Pod: web (nginx)    │ × 2 replicas
              │ Deployment          │
              +──────────┬──────────+
                         │
                         ▼
                  +──────────────+
                  │ Service: app │ (ClusterIP)
                  +──────┬───────+
                         │ selector: app=tomcat
                         ▼
              +─────────────────────+
              │ Pod: app (Tomcat)   │ × 3 replicas (HPA 2-10)
              │ Deployment          │
              +─┬──────┬───────┬────+
                │      │       │
        ┌───────┘      │       └───────┐
        ▼              ▼               ▼
  +──────────+  +──────────+   +──────────+
  │ Svc: db  │  │ Svc: mc  │   │ Svc: mq  │
  +────┬─────+  +────┬─────+   +────┬─────+
       │             │              │
       ▼             ▼              ▼
  +─────────+  +─────────+    +─────────+
  │ Pod: db │  │ Pod: mc │    │ Pod: mq │
  │ Stateful│  │ Deploy- │    │ Stateful│
  │ Set × 1 │  │ ment    │    │ Set × 1 │
  │ + PVC   │  │ × 1     │    │ + PVC   │
  +─────────+  +─────────+    +─────────+
```

5 service Docker → mỗi cái thành:
- **Deployment** (stateless) hoặc **StatefulSet** (stateful).
- **Service** (network endpoint stable).
- **PVC** nếu cần storage persist.

## Namespace

```yaml
# 00-namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: vprofile
  labels:
    name: vprofile
    env: dev
```

```bash
kubectl apply -f 00-namespace.yaml
kubectl config set-context --current --namespace=vprofile
```

Sau này mọi resource trong namespace `vprofile` → tách biệt với app khác.

## ConfigMap — config chung

```yaml
# 01-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: vprofile-config
data:
  # Connection hostnames (service names)
  DB_HOST: "vprofile-db"
  CACHE_HOST: "vprofile-cache"
  MQ_HOST: "vprofile-mq"

  # Ports
  DB_PORT: "3306"
  CACHE_PORT: "11211"
  MQ_PORT: "5672"

  # App config
  DB_NAME: "accounts"
  TOMCAT_OPTS: "-Xms512m -Xmx1024m -XX:+UseG1GC"

  # nginx config
  nginx.conf: |
    upstream tomcat {
        server vprofile-app:8080;
    }

    server {
        listen 80 default_server;
        server_name _;

        location / {
            proxy_pass http://tomcat;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
```

ConfigMap chứa **cả env variable lẫn file**. File `nginx.conf` sẽ mount vào nginx pod.

## Secret — credential

```yaml
# 02-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: vprofile-secrets
type: Opaque
stringData:
  # stringData không cần base64 — K8s auto-encode
  DB_USER: "admin"
  DB_PASSWORD: "ChangeMe123!"
  DB_ROOT_PASSWORD: "RootChangeMe123!"
  MQ_USER: "test"
  MQ_PASSWORD: "MqPassChange!"
```

Production: dùng **Sealed Secrets**, **External Secrets Operator**, hoặc **Vault** thay vì commit secret vào Git.

```bash
# Quick: tạo Secret từ literal
kubectl create secret generic vprofile-secrets \
    --from-literal=DB_PASSWORD='ChangeMe123!' \
    --from-literal=MQ_PASSWORD='MqPassChange!' \
    --dry-run=client -o yaml > 02-secret.yaml
```

## Database tier — MariaDB StatefulSet

```yaml
# 10-db-pvc.yaml — PersistentVolumeClaim
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: db-data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 10Gi
  storageClassName: gp3       # AWS EBS; "standard" trên Minikube
```

```yaml
# 11-db-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: vprofile-db
spec:
  serviceName: vprofile-db
  replicas: 1
  selector:
    matchLabels:
      app: db
  template:
    metadata:
      labels:
        app: db
    spec:
      containers:
        - name: mariadb
          image: mariadb:11
          ports:
            - containerPort: 3306
          env:
            - name: MYSQL_DATABASE
              valueFrom:
                configMapKeyRef:
                  name: vprofile-config
                  key: DB_NAME
            - name: MYSQL_USER
              valueFrom:
                secretKeyRef:
                  name: vprofile-secrets
                  key: DB_USER
            - name: MYSQL_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: vprofile-secrets
                  key: DB_PASSWORD
            - name: MYSQL_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: vprofile-secrets
                  key: DB_ROOT_PASSWORD
          volumeMounts:
            - name: data
              mountPath: /var/lib/mysql
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"
          livenessProbe:
            exec:
              command: ["mysqladmin", "ping", "-h", "localhost"]
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            exec:
              command: ["mysqladmin", "ping", "-h", "localhost"]
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: db-data
```

```yaml
# 12-db-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: vprofile-db
spec:
  selector:
    app: db
  ports:
    - port: 3306
      targetPort: 3306
  clusterIP: None       # Headless service cho StatefulSet
```

**Headless service** (`clusterIP: None`) cho StatefulSet → mỗi pod có DNS riêng `vprofile-db-0.vprofile-db.vprofile.svc.cluster.local`. Pod hiện tại có 1 → reach bằng `vprofile-db`.

## Cache tier — Memcached Deployment

Memcached **stateless** (cache, mất OK) → Deployment đơn giản:

```yaml
# 20-cache-deploy.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vprofile-cache
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cache
  template:
    metadata:
      labels:
        app: cache
    spec:
      containers:
        - name: memcached
          image: memcached:1.6-alpine
          ports:
            - containerPort: 11211
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "200m"
```

```yaml
# 21-cache-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: vprofile-cache
spec:
  selector:
    app: cache
  ports:
    - port: 11211
      targetPort: 11211
```

## Message Queue — RabbitMQ StatefulSet

```yaml
# 30-mq-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: vprofile-mq
spec:
  serviceName: vprofile-mq
  replicas: 1
  selector:
    matchLabels:
      app: mq
  template:
    metadata:
      labels:
        app: mq
    spec:
      containers:
        - name: rabbitmq
          image: rabbitmq:3.12-management-alpine
          ports:
            - containerPort: 5672
              name: amqp
            - containerPort: 15672
              name: management
          env:
            - name: RABBITMQ_DEFAULT_USER
              valueFrom:
                secretKeyRef:
                  name: vprofile-secrets
                  key: MQ_USER
            - name: RABBITMQ_DEFAULT_PASS
              valueFrom:
                secretKeyRef:
                  name: vprofile-secrets
                  key: MQ_PASSWORD
          volumeMounts:
            - name: data
              mountPath: /var/lib/rabbitmq
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "300m"
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        resources:
          requests:
            storage: 5Gi
```

`volumeClaimTemplates` = mỗi pod StatefulSet auto-create PVC riêng. Pod `vprofile-mq-0` → PVC `data-vprofile-mq-0`.

```yaml
# 31-mq-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: vprofile-mq
spec:
  selector:
    app: mq
  ports:
    - port: 5672
      targetPort: 5672
      name: amqp
    - port: 15672
      targetPort: 15672
      name: management
```

## App tier — Tomcat Deployment

```yaml
# 40-app-deploy.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vprofile-app
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: tomcat
  template:
    metadata:
      labels:
        app: tomcat
    spec:
      containers:
        - name: tomcat
          image: ghcr.io/acme/vprofile:v1.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: vprofile-config
            - secretRef:
                name: vprofile-secrets
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          livenessProbe:
            httpGet:
              path: /
              port: 8080
            initialDelaySeconds: 60
            periodSeconds: 30
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3
          startupProbe:
            httpGet:
              path: /
              port: 8080
            failureThreshold: 30      # 5 phút cho Tomcat init
            periodSeconds: 10
```

`RollingUpdate maxSurge=1 maxUnavailable=0` → deploy 1 pod mới, đợi healthy, kill 1 pod cũ → no downtime.

```yaml
# 41-app-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: vprofile-app
spec:
  selector:
    app: tomcat
  ports:
    - port: 8080
      targetPort: 8080
```

## Web tier — nginx Deployment

```yaml
# 50-web-deploy.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vprofile-web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: nginx
          image: nginx:1.25-alpine
          ports:
            - containerPort: 80
          volumeMounts:
            - name: nginx-config
              mountPath: /etc/nginx/conf.d/default.conf
              subPath: nginx.conf
          resources:
            requests:
              memory: "64Mi"
              cpu: "100m"
            limits:
              memory: "128Mi"
              cpu: "200m"
          livenessProbe:
            httpGet:
              path: /
              port: 80
            periodSeconds: 10
      volumes:
        - name: nginx-config
          configMap:
            name: vprofile-config
            items:
              - key: nginx.conf
                path: nginx.conf
```

```yaml
# 51-web-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: vprofile-web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
  type: ClusterIP        # Ingress sẽ expose ra ngoài
```

## Ingress — expose ra Internet

```yaml
# 60-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: vprofile-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
spec:
  ingressClassName: nginx
  rules:
    - host: vprofile.acme.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: vprofile-web
                port:
                  number: 80
  tls:
    - hosts:
        - vprofile.acme.com
      secretName: vprofile-tls
```

Cần **nginx-ingress controller** + **cert-manager** install cluster trước.

Lab nhanh không HTTPS: bỏ `tls` block + `cert-manager` annotation.

## HorizontalPodAutoscaler

```yaml
# 70-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: vprofile-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: vprofile-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
```

Khi CPU > 70% hoặc memory > 80%, HPA tăng pod (max 10). Khi idle, giảm về min 2.

Cần **metrics-server** install (Minikube: `minikube addons enable metrics-server`).

## Deploy

```bash
# Apply theo thứ tự
kubectl apply -f 00-namespace.yaml
kubectl apply -f 01-configmap.yaml
kubectl apply -f 02-secret.yaml

# Data tier first
kubectl apply -f 10-db-pvc.yaml -f 11-db-statefulset.yaml -f 12-db-service.yaml
kubectl apply -f 20-cache-deploy.yaml -f 21-cache-service.yaml
kubectl apply -f 30-mq-statefulset.yaml -f 31-mq-service.yaml

# Đợi data tier ready (~30s)
kubectl wait --for=condition=ready pod -l app=db --timeout=120s
kubectl wait --for=condition=ready pod -l app=mq --timeout=120s

# App tier
kubectl apply -f 40-app-deploy.yaml -f 41-app-service.yaml

# Đợi app ready
kubectl wait --for=condition=ready pod -l app=tomcat --timeout=300s

# Web tier
kubectl apply -f 50-web-deploy.yaml -f 51-web-service.yaml

# Ingress + HPA
kubectl apply -f 60-ingress.yaml -f 70-hpa.yaml
```

Hoặc gộp một lệnh:

```bash
kubectl apply -f .
```

## Verify

```bash
kubectl get all
# NAME                                READY   STATUS    AGE
# pod/vprofile-app-xxx                1/1     Running   2m
# pod/vprofile-app-yyy                1/1     Running   2m
# pod/vprofile-app-zzz                1/1     Running   2m
# pod/vprofile-cache-xxx              1/1     Running   2m
# pod/vprofile-db-0                   1/1     Running   2m
# pod/vprofile-mq-0                   1/1     Running   2m
# pod/vprofile-web-xxx                1/1     Running   2m
# pod/vprofile-web-yyy                1/1     Running   2m

# NAME                       TYPE        CLUSTER-IP   PORT(S)
# service/vprofile-app       ClusterIP   10.x.x.x     8080/TCP
# service/vprofile-cache     ClusterIP   10.x.x.x     11211/TCP
# service/vprofile-db        ClusterIP   None         3306/TCP
# service/vprofile-mq        ClusterIP   None         5672/TCP
# service/vprofile-web       ClusterIP   10.x.x.x     80/TCP

kubectl get ingress
# NAME                CLASS   HOSTS                ADDRESS         PORTS
# vprofile-ingress    nginx   vprofile.acme.com    a.b.c.d         80, 443

kubectl get hpa
# NAME                  REFERENCE                 TARGETS              MINPODS   MAXPODS
# vprofile-app-hpa      Deployment/vprofile-app   30%/70%, 40%/80%     2         10        REPLICAS: 3
```

## Test

```bash
# Port forward (test local nếu Ingress chưa setup)
kubectl port-forward svc/vprofile-web 8080:80
# Browser: http://localhost:8080

# Hoặc nếu có Ingress + DNS:
curl https://vprofile.acme.com

# Login admin_vp / admin_vp
```

## Debug nếu fail

```bash
# Pod CrashLoopBackOff?
kubectl describe pod vprofile-app-xxx
kubectl logs vprofile-app-xxx
kubectl logs vprofile-app-xxx --previous     # Log run trước nếu restart

# Service không route?
kubectl get endpoints vprofile-app
# Phải có IP — nếu rỗng = selector không match label

# Pod không reach service?
kubectl exec -it vprofile-app-xxx -- sh
# Trong pod:
nslookup vprofile-db
curl http://vprofile-cache:11211

# Event recent
kubectl get events --sort-by='.lastTimestamp' | tail -20
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Order apply sai (app trước DB) | App crash khi connect | Apply data tier trước |
| Probe timeout quá ngắn | Pod restart loop | startupProbe cho slow boot |
| ConfigMap key mismatch | env undefined | Verify key chính xác |
| Image tag latest | Pull lại mỗi pod | Pin version |
| Secret commit Git | Lộ credential | Sealed Secrets / Vault |
| Resource request thiếu | Scheduler chọn node sai | Always set request |
| StatefulSet replica > 1 cho MariaDB single-primary | Data corruption | Replicas 1 cho master/slave manual setup |
| Quên metrics-server | HPA "unknown" target | Install addon |

## Tóm tắt bài 1

- vProfile 5 service → 5 set của (Deployment/StatefulSet + Service [+ PVC]).
- **StatefulSet** cho DB, MQ (cần stable identity + storage).
- **Deployment** cho cache, app, web (stateless).
- **ConfigMap + Secret** tách config/credential khỏi image.
- **Headless service** + StatefulSet → DNS ổn định per-pod.
- **Probes** (liveness, readiness, startup) cho self-healing.
- **HPA** scale app theo CPU/memory.
- **Ingress** + TLS via cert-manager.
- Apply theo thứ tự: namespace → config/secret → data → app → web → ingress/hpa.

**Bài kế tiếp** → [Bài 2: Helm chart cho vProfile — package manager K8s](02-helm-chart.md)
