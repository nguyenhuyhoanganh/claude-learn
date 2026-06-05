# Bài 51: Deploy app lên GKE + verify SAGA cloud-native

> Image đã trên Artifact Registry, cluster đã sẵn. Bài này áp dụng manifests lên GKE, expose qua LoadBalancer, test SAGA end-to-end qua public IP.

## Apply Kafka qua Helm

```text
$ kubectl create namespace food-ordering-system
$ kubectl config set-context --current --namespace=food-ordering-system

$ helm install kafka-cluster confluentinc/cp-helm-charts \
    -f infrastructure/k8s/cp-helm-values.yaml \
    --namespace food-ordering-system
```

GKE node e2-medium (2 CPU + 4 GB) → Kafka cluster ăn 1-1.5 GB. Còn 2.5-3 GB / node cho microservice.

## Apply Postgres

Lưu ý: production thường dùng **Cloud SQL** (managed Postgres) thay vì self-host StatefulSet. Cloud SQL có:
- Auto backup hàng ngày.
- HA (high availability) replica.
- Failover automatic.
- Connection pooling tích hợp.

Khoá học vẫn dùng StatefulSet cho consistency với phase-11 và để học K8s. Production khuyên Cloud SQL.

```text
$ kubectl apply -f infrastructure/k8s/postgres/init-scripts.yaml
$ kubectl apply -f infrastructure/k8s/postgres/statefulset.yaml
$ kubectl apply -f infrastructure/k8s/postgres/service.yaml
```

PVC trên GKE auto bind với Google Cloud Persistent Disk (SSD) → durable.

## Apply 4 microservice với GKE image

```text
$ kubectl apply -f infrastructure/k8s/postgres-secret.yaml
$ kubectl apply -f infrastructure/k8s/order-service/configmap.yaml
$ kubectl apply -f infrastructure/k8s/order-service/deployment-gke.yaml
$ kubectl apply -f infrastructure/k8s/order-service/service.yaml

# tương tự payment, restaurant, customer
```

Check:
```text
$ kubectl get pods -n food-ordering-system

NAME                                                READY   STATUS     RESTARTS   AGE
customer-service-d8c9a7b6f-x7m4q                    1/1     Running    0          3m
kafka-cluster-cp-kafka-0                            2/2     Running    0          10m
kafka-cluster-cp-kafka-1                            2/2     Running    0          10m
kafka-cluster-cp-kafka-2                            2/2     Running    0          10m
kafka-cluster-cp-schema-registry-7b8d4e9f-r5n9k     2/2     Running    0          10m
kafka-cluster-cp-zookeeper-0                        2/2     Running    0          10m
order-service-5d8b6f9c8d-xz9p7                      1/1     Running    0          3m
order-service-5d8b6f9c8d-ab12c                      1/1     Running    0          3m
payment-service-789f5d7c8d-q3r4s                    1/1     Running    0          3m
postgres-0                                          1/1     Running    0          5m
restaurant-service-9c8d7e6f5d-ab12c                 1/1     Running    0          3m
```

12 pod chạy trên 3 node.

## LoadBalancer cho Order service

GKE hỗ trợ LoadBalancer type — tự tạo Google Cloud LB với public IP:

```yaml
# infrastructure/k8s/order-service/service-lb.yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service-lb
  namespace: food-ordering-system
spec:
  selector:
    app: order-service
  ports:
    - name: http
      port: 80
      targetPort: 8181
  type: LoadBalancer
```

```text
$ kubectl apply -f infrastructure/k8s/order-service/service-lb.yaml
$ kubectl get svc order-service-lb -w

NAME              TYPE           CLUSTER-IP    EXTERNAL-IP   PORT(S)        AGE
order-service-lb  LoadBalancer   10.96.x.x     <pending>     80:32567/TCP   10s
order-service-lb  LoadBalancer   10.96.x.x     34.71.123.45  80:32567/TCP   90s
```

90 giây Google Cloud provision LB. Lấy `EXTERNAL-IP` = `34.71.123.45`.

## Test SAGA qua public IP

```text
$ curl -X POST http://34.71.123.45/orders \
    -H 'Accept: application/vnd.api.v1+json' \
    -H 'Content-Type: application/json' \
    -d '{
      "customerId": "d215b5f8-0249-4dc5-89a3-51fd148cfb41",
      "restaurantId": "d215b5f8-0249-4dc5-89a3-51fd148cfb45",
      "address": { "street": "1 Le Duan", "postalCode": "100000", "city": "Hanoi" },
      "price": 50.00,
      "items": [
        {"productId": "d215b5f8-0249-4dc5-89a3-51fd148cfb48",
         "quantity": 1, "price": 50.00, "subTotal": 50.00}
      ]
    }'

{"orderTrackingId":"abc-123","orderStatus":"PENDING","message":"Order created successfully"}
```

Đợi 30s rồi GET:
```text
$ curl http://34.71.123.45/orders/abc-123

{"orderTrackingId":"abc-123","orderStatus":"APPROVED","failureMessages":[]}
```

SAGA chạy thành công trên cloud thật.

## Cloud Logging — log tích hợp

GKE tự push log mọi pod vào Cloud Logging.

```text
$ gcloud logging read 'resource.type=k8s_container 
    AND resource.labels.cluster_name=food-ordering-cluster 
    AND resource.labels.namespace_name=food-ordering-system 
    AND resource.labels.container_name=order-service' \
    --limit 50 --format json
```

Hoặc web console:
- <https://console.cloud.google.com/logs/query>
- Filter: `resource.type="k8s_container" AND severity>=INFO`.

Real-time tail:
```text
$ gcloud beta logging tail 'resource.type=k8s_container 
    AND resource.labels.container_name=order-service'
```

## Cloud Monitoring — metric tích hợp

Mỗi pod có metric CPU/memory tự collect. Custom metric Spring Boot Actuator + Micrometer:

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, info, prometheus, metrics
  metrics:
    export:
      prometheus:
        enabled: true
```

Endpoint `/actuator/prometheus` expose Prometheus format. GKE có **Managed Service for Prometheus** — auto scrape.

Dashboard: <https://console.cloud.google.com/monitoring>.

## Resource cost ước tính

Stack chạy ổn định:
- 3 node e2-medium (24/7): $72/tháng.
- LoadBalancer: $7/tháng.
- Persistent Disk 30GB × 3: ~$15/tháng.
- Egress out (~1 GB/ngày): $4/tháng.

Total ~$100/tháng nếu chạy 24/7.

Học bài: 5 giờ/lần × 4 lần/tháng = 20 giờ → ~$3/tháng. Free credit cover.

## Multi-region (production)

GKE 1 region 1 cluster cho dev. Production:
- Multi-zone cluster trong 1 region — chống AZ outage.
- Multi-region cluster (qua Anthos / Multi-Cluster Ingress) — chống region outage.
- DR (Disaster Recovery) cluster ở region khác.

Khoá học giữ single-region single-zone cho đơn giản.

## Network Policy (security)

K8s mặc định mọi pod giao tiếp được với nhau. Production cần restrict:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: order-allow-payment
  namespace: food-ordering-system
spec:
  podSelector:
    matchLabels:
      app: order-service
  policyTypes: [Egress]
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: payment-service
      ports:
        - protocol: TCP
          port: 8282
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
```

Order chỉ được egress đến Payment + Postgres. Block khác.

Cần CNI hỗ trợ Network Policy (Calico, Cilium). GKE bật bằng `--enable-network-policy` khi create cluster.

## Ingress với managed cert (production)

LoadBalancer 4-layer mỗi service tốn $7/tháng. Production dùng Ingress với 1 LB cho nhiều service:

```yaml
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: food-ordering-cert
spec:
  domains:
    - api.food-ordering.example.com

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: food-ordering-ingress
  annotations:
    networking.gke.io/managed-certificates: food-ordering-cert
    kubernetes.io/ingress.global-static-ip-name: food-ordering-ip
spec:
  rules:
    - host: api.food-ordering.example.com
      http:
        paths:
          - path: /orders
            pathType: Prefix
            backend:
              service:
                name: order-service
                port:
                  number: 8181
          - path: /customers
            pathType: Prefix
            backend:
              service:
                name: customer-service
                port:
                  number: 8484
```

Google auto provision HTTPS cert (Let's Encrypt) + route theo path. 1 LB serve nhiều service.

## Bẫy thường gặp trên GKE

| Triệu chứng | Sửa |
|---|---|
| LoadBalancer pending mãi | Quota external IP. Check `gcloud compute addresses list`. |
| Pod scheduled mãi Pending | Node insufficient resource. Tăng `replicas` node-pool. |
| `ErrImagePull` | Node service account thiếu role `roles/artifactregistry.reader`. |
| Pod đột nhiên restart | OOM. Cloud Logging `reason=OOMKilled`. Tăng memory limit. |
| Cluster autoscaler không scale | Min/max node range nhỏ. Reset. |
| Network latency cao | Service ở zone khác pod. Dùng `topology.kubernetes.io/zone`. |
| Egress charge cao | Optimize: dùng VPC peering hoặc Cloud Interconnect. |
| Pod crash khi GKE upgrade | Disable auto-upgrade với `--no-enable-autoupgrade`. |

## Tóm tắt bài 51

- Deploy 12 pod (Kafka 5 + Postgres 1 + 4 service + customer) trên GKE 3-node cluster.
- LoadBalancer service auto tạo Google Cloud LB → public IP + port 80.
- SAGA chạy end-to-end qua public IP — verify hệ thống cloud-native hoạt động.
- Cloud Logging + Monitoring tích hợp sẵn — không cần setup ELK / Grafana riêng.
- Production cân nhắc: Cloud SQL thay StatefulSet Postgres, Ingress thay LoadBalancer, Network Policy security.
- Cost ~$3-5 cho học, ~$100/tháng cho 24/7 deploy nhỏ.

**Bài kế tiếp** → [Bài 52: Horizontal Pod Autoscaler — scale theo CPU](04-horizontal-autoscaler.md)
