# Bài 46: Deploy Kafka stack vào K8s qua Helm

> Confluent có sẵn cp-helm-charts cho Kafka + Zookeeper + Schema Registry. Bài này cài tay từng bước, giải thích từng config, troubleshoot lỗi thường gặp khi run lần đầu.

## Cài Helm

```text
$ brew install helm                          # macOS
$ helm version
version.BuildInfo{Version:"v3.14.0", ...}
```

Helm = package manager cho K8s. Chart = template YAML cho 1 application phức tạp.

## Add Confluent repo

```text
$ helm repo add confluentinc https://confluentinc.github.io/cp-helm-charts/
$ helm repo update
$ helm search repo confluentinc

NAME                                CHART VERSION  APP VERSION  DESCRIPTION
confluentinc/cp-helm-charts        0.6.1          7.5.0         A Helm chart for Confluent Platform...
```

## Start minikube với resource đủ

```text
$ minikube start --cpus=4 --memory=8192 --driver=docker
$ minikube status

minikube
type: Control Plane
host: Running
kubelet: Running
apiserver: Running
kubeconfig: Configured
```

Tạo namespace:
```text
$ kubectl create namespace food-ordering-system
$ kubectl config set-context --current --namespace=food-ordering-system
```

## Tạo Helm values file — `cp-helm-values.yaml`

```yaml
# infrastructure/k8s/cp-helm-values.yaml

cp-zookeeper:
  enabled: true
  servers: 1                                # 1 Zookeeper cho dev (production 3)
  image: confluentinc/cp-zookeeper
  imageTag: 7.5.0
  persistence:
    enabled: true
    dataDirSize: 1Gi
    dataLogDirSize: 1Gi

cp-kafka:
  enabled: true
  brokers: 3                                # 3 broker
  image: confluentinc/cp-kafka
  imageTag: 7.5.0
  persistence:
    enabled: true
    size: 5Gi
  configurationOverrides:
    offsets.topic.replication.factor: 3
    transaction.state.log.replication.factor: 3
    transaction.state.log.min.isr: 2
    default.replication.factor: 3
    min.insync.replicas: 2
    num.partitions: 3
    auto.create.topics.enable: false        # tắt — ta tạo topic explicit
  resources:
    requests:
      memory: 512Mi
      cpu: 200m
    limits:
      memory: 1Gi
      cpu: 500m

cp-schema-registry:
  enabled: true
  replicaCount: 1
  image: confluentinc/cp-schema-registry
  imageTag: 7.5.0
  resources:
    requests:
      memory: 256Mi
    limits:
      memory: 512Mi

# Disable các thành phần không cần
cp-kafka-connect:
  enabled: false
cp-ksql-server:
  enabled: false
cp-control-center:
  enabled: false
cp-kafka-rest:
  enabled: false
```

## Install Helm chart

```text
$ helm install kafka-cluster confluentinc/cp-helm-charts \
    -f infrastructure/k8s/cp-helm-values.yaml \
    --namespace food-ordering-system

NAME: kafka-cluster
LAST DEPLOYED: Tue Jun 4 10:23:45 2026
NAMESPACE: food-ordering-system
STATUS: deployed
```

## Verify deployment

```text
$ kubectl get pods -n food-ordering-system

NAME                                                    READY   STATUS    RESTARTS   AGE
kafka-cluster-cp-kafka-0                                2/2     Running   0          3m
kafka-cluster-cp-kafka-1                                2/2     Running   0          3m
kafka-cluster-cp-kafka-2                                2/2     Running   0          3m
kafka-cluster-cp-schema-registry-6b8d459f8d-x4kg2       2/2     Running   0          3m
kafka-cluster-cp-zookeeper-0                            2/2     Running   0          3m
```

3 Kafka broker + 1 Zookeeper + 1 Schema Registry. `2/2` = pod có 2 container (main + JMX exporter).

```text
$ kubectl get services -n food-ordering-system

NAME                                          TYPE        CLUSTER-IP      PORT(S)
kafka-cluster-cp-kafka                        ClusterIP   10.96.45.123   9092/TCP,5556/TCP
kafka-cluster-cp-kafka-headless               ClusterIP   None            9092/TCP
kafka-cluster-cp-schema-registry              ClusterIP   10.96.78.234   8081/TCP
kafka-cluster-cp-zookeeper                    ClusterIP   10.96.12.45    2181/TCP,2888/TCP,3888/TCP
kafka-cluster-cp-zookeeper-headless           ClusterIP   None            2181/TCP,2888/TCP,3888/TCP
```

## DNS bên trong cluster

Pod resolve hostname `kafka-cluster-cp-kafka:9092` qua CoreDNS. Service Spring Boot kết nối:

```yaml
kafka-config:
  bootstrap-servers: kafka-cluster-cp-kafka-headless:9092
  schema-registry-url: http://kafka-cluster-cp-schema-registry:8081
```

Headless service trả về IP của từng pod (kafka-cluster-cp-kafka-0, -1, -2) → producer biết hết broker.

## Tạo topic init

Helm chart không tạo topic. Ta dùng `kubectl exec` vào pod Kafka:

```text
$ kubectl exec -it kafka-cluster-cp-kafka-0 -- kafka-topics \
    --bootstrap-server localhost:9092 \
    --create --topic payment-request \
    --partitions 3 --replication-factor 3

$ kubectl exec -it kafka-cluster-cp-kafka-0 -- kafka-topics \
    --bootstrap-server localhost:9092 \
    --create --topic payment-response \
    --partitions 3 --replication-factor 3

# tương tự cho restaurant-approval-request, restaurant-approval-response, customer
```

Hoặc tự động hoá bằng K8s Job:

```yaml
# infrastructure/k8s/init-kafka-topics-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: init-kafka-topics
  namespace: food-ordering-system
spec:
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: kafka-init
          image: confluentinc/cp-kafka:7.5.0
          command:
            - /bin/sh
            - -c
            - |
              for topic in payment-request payment-response \
                           restaurant-approval-request restaurant-approval-response \
                           customer; do
                kafka-topics --bootstrap-server kafka-cluster-cp-kafka-headless:9092 \
                  --create --if-not-exists \
                  --topic $topic --partitions 3 --replication-factor 3
              done
```

```text
$ kubectl apply -f init-kafka-topics-job.yaml
$ kubectl logs job/init-kafka-topics
```

## Test Kafka từ pod tạm

```text
$ kubectl run kafka-test --rm -it --image=confluentinc/cp-kafka:7.5.0 -- bash

bash-5.1$ kafka-console-producer \
    --bootstrap-server kafka-cluster-cp-kafka-headless:9092 \
    --topic payment-request
> hello kafka
^D

bash-5.1$ kafka-console-consumer \
    --bootstrap-server kafka-cluster-cp-kafka-headless:9092 \
    --topic payment-request --from-beginning
hello kafka
```

## Truy cập Schema Registry

Port-forward để curl từ host:
```text
$ kubectl port-forward svc/kafka-cluster-cp-schema-registry 8081:8081

$ curl http://localhost:8081/subjects
[]
```

Empty vì chưa publish Avro message. Khi service Spring Boot publish lần đầu sẽ tự đăng ký schema.

## Persistent data — đảm bảo data không mất

```text
$ kubectl get pvc -n food-ordering-system

NAME                                                    STATUS   VOLUME                                     CAPACITY
datadir-kafka-cluster-cp-kafka-0                        Bound    pvc-abc-1                                  5Gi
datadir-kafka-cluster-cp-kafka-1                        Bound    pvc-abc-2                                  5Gi
datadir-kafka-cluster-cp-kafka-2                        Bound    pvc-abc-3                                  5Gi
datadir-kafka-cluster-cp-zookeeper-0                    Bound    pvc-xyz-1                                  1Gi
datalogdir-kafka-cluster-cp-zookeeper-0                 Bound    pvc-xyz-2                                  1Gi
```

PVC bind với PV. Restart pod → data still ở PV → topic persistence.

Delete StatefulSet KHÔNG xoá PVC:
```text
$ helm uninstall kafka-cluster -n food-ordering-system
$ kubectl get pvc                              # PVC vẫn còn
$ kubectl delete pvc --all -n food-ordering-system    # cần manual
```

## Resource monitoring

```text
$ kubectl top pods -n food-ordering-system

NAME                                                CPU(cores)   MEMORY(bytes)
kafka-cluster-cp-kafka-0                            45m          512Mi
kafka-cluster-cp-kafka-1                            48m          524Mi
kafka-cluster-cp-kafka-2                            42m          508Mi
kafka-cluster-cp-schema-registry-6b8d459f8d-x4kg2   12m          245Mi
kafka-cluster-cp-zookeeper-0                        18m          178Mi
```

Tổng ~ 2 GB RAM cho Kafka stack — match calculation bài 45.

## Bẫy thường gặp

| Triệu chứng | Nguyên nhân |
|---|---|
| Pod kafka pending | minikube hết memory. Resize: `minikube stop && minikube start --memory=8192` |
| Pod CrashLoopBackOff | Check `kubectl logs`. Thường Zookeeper chưa lên hoặc replication factor > broker count |
| Schema Registry không lên | Kafka chưa bootstrap. Đợi 1-2 phút. |
| Topic không tạo được | Job init chạy quá sớm. Add `initContainers` chờ. |
| `pvc pending` | minikube driver = docker không support storage class. `minikube addons enable default-storageclass` |
| Service Spring Boot bên ngoài K8s không connect | Phải port-forward hoặc deploy service vào K8s |
| Helm install timeout | Tăng `--timeout=10m` |
| `headless` service không resolve | Pod cần `subdomain` field. Helm tự handle. |

## Cleanup

```text
$ helm uninstall kafka-cluster -n food-ordering-system
$ kubectl delete pvc --all -n food-ordering-system
$ kubectl delete namespace food-ordering-system
$ minikube stop
```

## Tóm tắt bài 46

- Helm + Confluent cp-helm-charts deploy Kafka stack trong K8s với 1 lệnh.
- Values file config 3 broker + 1 Zookeeper + Schema Registry, replication factor 3.
- Headless service cho phép producer/consumer resolve từng broker.
- Init topic qua K8s Job — declarative, có thể replay.
- PVC giữ data persistent ngay cả khi pod restart.
- 2 GB RAM cho full Kafka stack — phù hợp dev local.

**Bài kế tiếp** → [Bài 47: Tạo Deployment YAML cho 4 microservice](03-deployment-microservices.md)
