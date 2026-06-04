# Bài 3: ECS, EKS, CloudFront, Route 53 advanced

Bài này cover container orchestration trên AWS (ECS, EKS) + CDN + DNS routing nâng cao.

## ECS — Elastic Container Service

Container orchestration native của AWS. Đơn giản hơn K8s.

### Concepts

```text
Cluster (nhóm logic)
└── Service (quản lý task)
    └── Task (container đang chạy)
        └── Container definition
```

### Launch types

| | EC2 | Fargate |
|---|---|---|
| Quản host | Bạn tự quản | AWS quản |
| Cost | Rẻ hơn | +20% |
| Customize | Đầy đủ | Hạn chế |
| Scale time | Vài phút | Vài giây |
| Phù hợp | Nhạy cảm cost, cần customize | Đơn giản |

### Task definition

```json
{
    "family": "vprofile",
    "networkMode": "awsvpc",
    "executionRoleArn": "arn:aws:iam::123:role/ecsTaskExecutionRole",
    "taskRoleArn": "arn:aws:iam::123:role/vprofile-task",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "1024",
    "memory": "2048",
    "containerDefinitions": [
        {
            "name": "tomcat",
            "image": "123.dkr.ecr.us-east-1.amazonaws.com/vprofile:v1.0",
            "portMappings": [{"containerPort": 8080, "protocol": "tcp"}],
            "essential": true,
            "environment": [
                {"name": "ENV", "value": "production"}
            ],
            "secrets": [
                {
                    "name": "DB_PASSWORD",
                    "valueFrom": "arn:aws:secretsmanager:us-east-1:123:secret:prod/db/password"
                }
            ],
            "logConfiguration": {
                "logDriver": "awslogs",
                "options": {
                    "awslogs-group": "/ecs/vprofile",
                    "awslogs-region": "us-east-1",
                    "awslogs-stream-prefix": "ecs"
                }
            },
            "healthCheck": {
                "command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
                "interval": 30,
                "timeout": 5,
                "retries": 3,
                "startPeriod": 60
            },
            "ulimits": [
                {"name": "nofile", "softLimit": 65536, "hardLimit": 65536}
            ]
        },
        {
            "name": "datadog-agent",
            "image": "datadog/agent:latest",
            "essential": false,
            "environment": [...]
        }
    ]
}
```

Multi-container task = sidecar pattern (vd: app + monitoring agent).

### Service

```bash
aws ecs create-service \
    --cluster vprofile \
    --service-name app \
    --task-definition vprofile:1 \
    --desired-count 3 \
    --launch-type FARGATE \
    --platform-version LATEST \
    --network-configuration "awsvpcConfiguration={
        subnets=[subnet-xxx,subnet-yyy],
        securityGroups=[sg-xxx],
        assignPublicIp=DISABLED
    }" \
    --load-balancers "targetGroupArn=arn:...,containerName=tomcat,containerPort=8080" \
    --health-check-grace-period-seconds 120 \
    --deployment-configuration "maximumPercent=200,minimumHealthyPercent=50,deploymentCircuitBreaker={enable=true,rollback=true}" \
    --enable-execute-command \
    --propagate-tags TASK_DEFINITION
```

`deploymentCircuitBreaker` = tự động rollback nếu deploy fail. Đây là best practice hiện đại.

### Service Auto Scaling

```bash
# Đăng ký target có thể scale
aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --resource-id service/vprofile/app \
    --scalable-dimension ecs:service:DesiredCount \
    --min-capacity 3 \
    --max-capacity 20

# Target tracking policy
aws application-autoscaling put-scaling-policy \
    --policy-name cpu-tracking \
    --service-namespace ecs \
    --resource-id service/vprofile/app \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration '{
        "TargetValue": 70.0,
        "PredefinedMetricSpecification": {"PredefinedMetricType": "ECSServiceAverageCPUUtilization"},
        "ScaleOutCooldown": 60,
        "ScaleInCooldown": 300
    }'
```

### CapacityProviders — Mix Fargate + Spot

```yaml
CapacityProviderStrategy:
  - CapacityProvider: FARGATE
    Weight: 1
    Base: 2                  # Tối thiểu 2 on-demand
  - CapacityProvider: FARGATE_SPOT
    Weight: 4                # Còn lại dùng spot
```

70% Fargate Spot → tiết kiệm khoảng 50%.

### ECS Exec — Giống `docker exec`

```bash
# Update service với enable-execute-command rồi:
aws ecs execute-command \
    --cluster vprofile \
    --task TASK_ID \
    --container tomcat \
    --interactive \
    --command "/bin/bash"
```

Debug container mà không cần SSH vào host.

### ECS vs Fargate — Lúc nào dùng cái nào?

Dùng **ECS EC2** khi:
- Cần GPU.
- Cần instance type cụ thể.
- Workload chạy dài hạn (tận dụng Reserved Instance).
- Cần privileged container.
- Nhạy cảm về chi phí.

Dùng **Fargate** khi:
- Workload biến đổi nhiều.
- Muốn zero ops.
- Cần multi-tenant isolation.
- Quick PoC (proof of concept).

## EKS — Managed Kubernetes

Phase 29-30 sẽ deep-dive K8s. Ở đây chỉ setup nhanh.

### Tạo cluster với eksctl

```yaml
# cluster.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: vprofile-prod
  region: us-east-1
  version: "1.28"

vpc:
  subnets:
    private:
      us-east-1a: { id: subnet-priv-a }
      us-east-1b: { id: subnet-priv-b }
    public:
      us-east-1a: { id: subnet-pub-a }
      us-east-1b: { id: subnet-pub-b }

managedNodeGroups:
  - name: workers
    instanceType: t3.large
    minSize: 3
    maxSize: 10
    desiredCapacity: 3
    privateNetworking: true
    iam:
      withAddonPolicies:
        autoScaler: true
        cloudWatch: true
        ebs: true
        externalDNS: true
        certManager: true

addons:
  - name: vpc-cni
  - name: kube-proxy
  - name: coredns
  - name: aws-ebs-csi-driver

cloudWatch:
  clusterLogging:
    enableTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"]

iam:
  withOIDC: true
  serviceAccounts:
    - metadata:
        name: cluster-autoscaler
        namespace: kube-system
      wellKnownPolicies:
        autoScaler: true
```

```bash
eksctl create cluster -f cluster.yaml
# Mất ~15 phút

aws eks update-kubeconfig --name vprofile-prod --region us-east-1
kubectl get nodes
```

### Fargate cho EKS

Chạy K8s pod như serverless container:

```yaml
fargateProfiles:
  - name: app
    selectors:
      - namespace: vprofile-prod
        labels:
          tier: app
```

Pod được schedule lên Fargate tự động. Không phải quản node.

### Karpenter — Cluster autoscaler hiện đại

Thay thế cluster-autoscaler truyền thống:

```yaml
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: [amd64, arm64]
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: [m, c]
        - key: karpenter.sh/capacity-type
          operator: In
          values: [spot, on-demand]
      nodeClassRef:
        name: default
  limits:
    cpu: "1000"
  disruption:
    consolidationPolicy: WhenUnderutilized
```

Ưu điểm của Karpenter:
- Bin-packing tối ưu (xếp pod sao cho dùng tối ưu node).
- Mix nhiều instance type.
- Mix Spot + on-demand.
- Scale nhanh hơn Cluster Autoscaler.

### EKS Add-ons

```bash
# Cluster autoscaler / Karpenter
helm install karpenter ...

# Ingress controller
helm install ingress-nginx ...

# Cert manager
helm install cert-manager ...

# External DNS
helm install external-dns ...

# Metrics server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# AWS Load Balancer Controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller ...
```

## CloudFront — CDN advanced

### Functions vs Lambda@Edge

| | CloudFront Functions | Lambda@Edge |
|---|---|---|
| Runtime | Chỉ JavaScript | Node.js + Python |
| Cost | $0.10 / triệu | $0.60 / triệu + duration |
| Max time | 1 ms | 5-30s |
| Phù hợp | Thao tác header, redirect đơn giản | Logic phức tạp, A/B test |

### CloudFront Function (Ví dụ)

```javascript
function handler(event) {
    var request = event.request;
    var headers = request.headers;

    // Redirect HTTP → HTTPS (CloudFront có sẵn nhưng đây là ví dụ)
    if (headers['cloudfront-forwarded-proto'] && headers['cloudfront-forwarded-proto'].value === 'http') {
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {'location': {value: 'https://' + headers.host.value + request.uri}}
        };
    }

    // Thêm security header
    headers['strict-transport-security'] = {value: 'max-age=31536000; includeSubDomains'};

    return request;
}
```

### Origin Failover (Tự fallback khi origin chính fail)

Primary origin fail → fallback sang origin dự phòng tự động:

```yaml
OriginGroups:
  - Id: vprofile-failover
    FailoverCriteria:
      StatusCodes: [403, 404, 500, 502, 503, 504]
    Members:
      - OriginId: primary-alb
      - OriginId: secondary-alb-different-region
```

DR pattern: primary us-east-1 down → CloudFront tự route sang us-west-2.

### Signed URL / Cookie (URL có chữ ký)

```python
from botocore.signers import CloudFrontSigner
import rsa

def rsa_signer(message):
    with open("private_key.pem", "rb") as f:
        private_key = serialization.load_pem_private_key(f.read(), password=None)
    return private_key.sign(message, padding.PKCS1v15(), hashes.SHA1())

signer = CloudFrontSigner("KEY_PAIR_ID", rsa_signer)
url = signer.generate_presigned_url(
    "https://d123.cloudfront.net/private/video.mp4",
    date_less_than=datetime.utcnow() + timedelta(hours=1)
)
```

Use case: phân phối content riêng tư, video DRM, link download có thời hạn.

## Route 53 advanced

### Routing policies

| Policy | Use case |
|---|---|
| **Simple** | 1 record → 1 IP |
| **Weighted** | A/B test, gradual rollout |
| **Latency** | Route đến region có latency thấp nhất |
| **Failover** | Primary fail → chuyển secondary |
| **Geolocation** | Trả nội dung khác nhau theo quốc gia |
| **Geoproximity** | Bias theo region |
| **Multi-value** | DNS-level "load balance" |

### Failover example

```bash
# Primary
aws route53 change-resource-record-sets ... '{
    "Name": "api.vprofile.acme.com",
    "Type": "A",
    "SetIdentifier": "primary",
    "Failover": "PRIMARY",
    "HealthCheckId": "health-check-id",
    "AliasTarget": {"DNSName": "primary-alb.us-east-1.elb.amazonaws.com", ...}
}'

# Secondary
'{
    "Name": "api.vprofile.acme.com",
    "Type": "A",
    "SetIdentifier": "secondary",
    "Failover": "SECONDARY",
    "AliasTarget": {"DNSName": "secondary-alb.us-west-2.elb.amazonaws.com", ...}
}'
```

Khi health check primary fail → Route 53 trả về IP của secondary.

### Health check + SNS notification

```bash
HC_ID=$(aws route53 create-health-check --caller-reference $(date +%s) \
    --health-check-config '{
        "Type": "HTTPS",
        "ResourcePath": "/health",
        "FullyQualifiedDomainName": "api.vprofile.acme.com",
        "Port": 443,
        "RequestInterval": 30,
        "FailureThreshold": 3,
        "Regions": ["us-east-1", "eu-west-1", "ap-southeast-1"]
    }' --query HealthCheck.Id --output text)

# CloudWatch alarm khi unhealthy
aws cloudwatch put-metric-alarm \
    --alarm-name route53-health-check-fail \
    --metric-name HealthCheckStatus \
    --namespace AWS/Route53 \
    --dimensions Name=HealthCheckId,Value=$HC_ID \
    --statistic Minimum \
    --period 60 \
    --threshold 1 \
    --comparison-operator LessThanThreshold \
    --evaluation-periods 1 \
    --alarm-actions $SNS_TOPIC
```

### DNSSEC

Ký zone với KMS key (chống DNS spoofing):

```bash
aws route53 create-key-signing-key \
    --hosted-zone-id $ZONE \
    --key-management-service-arn arn:aws:kms:us-east-1:123:key/xxx \
    --name ksk-vprofile \
    --status ACTIVE

aws route53 enable-hosted-zone-dnssec --hosted-zone-id $ZONE
```

Cập nhật DS record ở nhà đăng ký domain → DNSSEC chain được thiết lập.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| ECS task không graceful shutdown | Connection bị drop | Handle SIGTERM trong app |
| Fargate ephemeral storage mặc định 20GB | Disk đầy | Tăng qua task def |
| EKS cluster không update | Hết EOL support | Upgrade mỗi 12-18 tháng |
| Karpenter consolidation quá aggressive | Pod restart thường xuyên | Tinh chỉnh `disruption.consolidationPolicy` |
| CloudFront cache HTML | Content cũ | TTL ngắn cho HTML, dài cho asset |
| Route 53 TTL cao + đổi record | DNS propagate chậm | Set TTL thấp trước khi đổi |
| Health check tốn tiền | $0.50 / check / tháng | Giới hạn cho endpoint critical |

## Tóm tắt bài 3

- **ECS** AWS-native container, Fargate serverless hoặc EC2 tiết kiệm cost.
- **CapacityProviders** mix Fargate Spot + on-demand để tối ưu chi phí.
- **ECS Exec** debug container mà không cần SSH host.
- **EKS** managed K8s với eksctl + Karpenter (autoscaler hiện đại).
- **CloudFront Functions** vs Lambda@Edge (cost vs feature trade-off).
- **Origin failover** + signed URL cho CDN nâng cao.
- **Route 53 policies**: weighted, latency, failover, geolocation, multi-value.
- **Health check** + DNSSEC cho DNS production.

**Bài kế tiếp** → [Bài 4: AWS Systems Manager + Secrets Manager + Organizations](04-aws-ssm-secrets.md)
