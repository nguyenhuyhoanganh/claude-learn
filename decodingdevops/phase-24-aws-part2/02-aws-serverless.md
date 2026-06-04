# Bài 2: AWS Serverless — Lambda, API Gateway, Step Functions, EventBridge

Serverless = không quản server, chỉ cần care về code. Bài này dạy **Lambda đầy đủ** + API Gateway + orchestration.

## Lambda deep dive

### Anatomy

```python
def lambda_handler(event, context):
    """
    event:   Dữ liệu trigger (HTTP request, S3 event, ...)
    context: Thông tin runtime (request_id, function_name, timeout, ...)
    return:  Response (Lambda tự serialize thành JSON)
    """
    print(f"Received: {event}")
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"message": "Hello"})
    }
```

### Limit (Giới hạn)

| | Giá trị |
|---|---|
| Memory | 128 MB - 10240 MB |
| Timeout | Max 15 phút |
| Package size | 50 MB zip, 250 MB unzipped, 10 GB image |
| /tmp | 512 MB - 10 GB |
| Concurrent | 1000 / account (mặc định) |
| Env variable | 4 KB tổng |
| Payload | 6 MB sync, 256 KB async |

### Runtimes (Ngôn ngữ hỗ trợ)

- Python 3.11/3.12.
- Node.js 18/20.
- Java 17/21.
- Go (provided.al2).
- Ruby 3.2.
- .NET 6/8.
- Custom runtime (Rust, Bash, ...).
- Container image (mọi ngôn ngữ).

### Deploy Lambda

#### Option 1: Upload qua Zip

```bash
# Package
zip -r function.zip lambda_handler.py
zip function.zip dependencies/*

# Tạo function
aws lambda create-function \
    --function-name hello \
    --runtime python3.12 \
    --role arn:aws:iam::123:role/lambda-exec \
    --handler lambda_handler.lambda_handler \
    --zip-file fileb://function.zip \
    --timeout 30 \
    --memory-size 512 \
    --environment Variables={ENV=production,LOG_LEVEL=INFO}

# Update code
aws lambda update-function-code \
    --function-name hello \
    --zip-file fileb://function.zip
```

#### Option 2: Container image

```dockerfile
FROM public.ecr.aws/lambda/python:3.12

COPY requirements.txt ${LAMBDA_TASK_ROOT}
RUN pip install -r requirements.txt

COPY app/ ${LAMBDA_TASK_ROOT}

CMD ["lambda_handler.lambda_handler"]
```

```bash
docker build -t my-lambda .
docker tag my-lambda:latest 123.dkr.ecr.us-east-1.amazonaws.com/my-lambda:latest
docker push 123.dkr.ecr.us-east-1.amazonaws.com/my-lambda:latest

aws lambda create-function \
    --function-name hello \
    --package-type Image \
    --code ImageUri=123.dkr.ecr.us-east-1.amazonaws.com/my-lambda:latest \
    --role arn:...
```

#### Option 3: SAM (Serverless Application Model)

`template.yaml`:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  HelloFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/
      Handler: lambda_handler.lambda_handler
      Runtime: python3.12
      Timeout: 30
      MemorySize: 512
      Environment:
        Variables:
          ENV: production
      Events:
        Api:
          Type: Api
          Properties:
            Path: /hello
            Method: get
```

```bash
sam build
sam deploy --guided
```

### Cold start (Khởi động lạnh)

Lần invoke đầu = load runtime + code = mất 100ms-2s.

Mitigation (cách giảm cold start):
- **Provisioned concurrency**: giữ N instance luôn warm (tốn thêm tiền).
- **SnapStart** (chỉ Java): cache state đã initialize.
- **Package nhỏ hơn**: ít dependency hơn.
- **Init logic**: connection pool đặt ngoài handler.

```python
# BAD - tạo connection mới mỗi invoke
def lambda_handler(event, context):
    conn = psycopg2.connect(...)        # Cold start mỗi lần invoke
    ...

# GOOD - reuse connection
conn = psycopg2.connect(...)             # Init 1 lần khi container warm

def lambda_handler(event, context):
    cursor = conn.cursor()
    ...
```

### Lambda layers

Chia sẻ code giữa nhiều function:

```bash
# Build layer
mkdir python
pip install requests boto3 -t python/
zip -r layer.zip python/

# Publish
aws lambda publish-layer-version \
    --layer-name common-deps \
    --description "Shared deps" \
    --zip-file fileb://layer.zip \
    --compatible-runtimes python3.12

# Dùng trong function
aws lambda update-function-configuration \
    --function-name hello \
    --layers arn:aws:lambda:us-east-1:123:layer:common-deps:1
```

Layers dùng để: cache dependency, share utility code, custom runtime.

### Versions + Aliases (Phiên bản và bí danh)

```bash
# Publish version (snapshot bất biến)
aws lambda publish-version --function-name hello
# Version 1 created

# Tạo alias
aws lambda create-alias \
    --function-name hello \
    --name prod \
    --function-version 1

# Traffic shifting alias (canary deploy)
aws lambda update-alias \
    --function-name hello \
    --name prod \
    --function-version 2 \
    --routing-config 'AdditionalVersionWeights={"1"=0.9}'
# 90% traffic vào v1, 10% vào v2 (canary)
```

API Gateway / EventBridge trigger `hello:prod` → dùng alias (không bind trực tiếp version).

## API Gateway

### REST API vs HTTP API vs WebSocket

| | REST API | HTTP API | WebSocket API |
|---|---|---|---|
| Cost | Cao | **Thấp** (rẻ hơn 70%) | Trung bình |
| Latency | Cao hơn | **Thấp hơn** | N/A |
| Feature | Đầy đủ | Subset | Bidirectional |
| Use case | Legacy, full feature | Project hiện đại đơn giản | Real-time chat |

**HTTP API** được khuyến nghị cho project mới.

### Setup HTTP API + Lambda

```bash
# Tạo API
API_ID=$(aws apigatewayv2 create-api \
    --name vprofile-api \
    --protocol-type HTTP \
    --target arn:aws:lambda:us-east-1:123:function:hello \
    --query ApiId --output text)

# Lấy URL
aws apigatewayv2 get-api --api-id $API_ID \
    --query ApiEndpoint --output text
# https://xxxx.execute-api.us-east-1.amazonaws.com
```

### Routes

```bash
# Thêm route + integration
aws apigatewayv2 create-integration \
    --api-id $API_ID \
    --integration-type AWS_PROXY \
    --integration-uri arn:aws:lambda:us-east-1:123:function:users \
    --payload-format-version 2.0

aws apigatewayv2 create-route \
    --api-id $API_ID \
    --route-key 'GET /users' \
    --target integrations/$INTEGRATION_ID
```

### Custom domain + cert

```bash
# Cert ACM
CERT_ARN=$(aws acm request-certificate \
    --domain-name api.vprofile.acme.com \
    --validation-method DNS \
    --region us-east-1 \
    --query CertificateArn --output text)

# Chờ validated...

# Tạo custom domain
aws apigatewayv2 create-domain-name \
    --domain-name api.vprofile.acme.com \
    --domain-name-configurations CertificateArn=$CERT_ARN

# Mapping
aws apigatewayv2 create-api-mapping \
    --domain-name api.vprofile.acme.com \
    --api-id $API_ID \
    --stage \$default

# Route 53 alias
aws route53 change-resource-record-sets ... # Alias trỏ đến API Gateway domain
```

### Authorization

```yaml
# JWT (Cognito hoặc external IdP)
- Authorization: Bearer <jwt-token>
- API Gateway verify với issuer URL + audience

# IAM (sign request với AWS sig v4)
- Dùng cho service-to-service

# Lambda authorizer
- Logic auth tuỳ chỉnh, viết bằng Python
```

```python
# Lambda authorizer
def authorize(event, context):
    token = event["headers"].get("authorization", "").replace("Bearer ", "")

    if validate_token(token):
        return {
            "isAuthorized": True,
            "context": {"user_id": "alice"}
        }
    return {"isAuthorized": False}
```

### Throttling + caching

```yaml
DefaultRouteSettings:
  ThrottlingRateLimit: 1000      # req/s
  ThrottlingBurstLimit: 2000

# Cache (chỉ REST API có)
CacheEnabled: true
CacheTtlInSeconds: 300
```

## Step Functions — Workflow orchestration

Phối hợp Lambda + service thành workflow:

```json
{
  "Comment": "Order processing",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123:function:validate",
      "Next": "ChargePayment",
      "Retry": [{
        "ErrorEquals": ["ValidationError"],
        "MaxAttempts": 0
      }]
    },
    "ChargePayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123:function:charge",
      "Next": "ParallelProcessing",
      "Catch": [{
        "ErrorEquals": ["States.ALL"],
        "Next": "CompensatePayment"
      }]
    },
    "ParallelProcessing": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "SendEmail",
          "States": {
            "SendEmail": {
              "Type": "Task",
              "Resource": "arn:aws:states:::sns:publish",
              "Parameters": {
                "TopicArn": "arn:aws:sns:...",
                "Message.$": "$"
              },
              "End": true
            }
          }
        },
        {
          "StartAt": "ShipOrder",
          "States": {
            "ShipOrder": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:us-east-1:123:function:ship",
              "End": true
            }
          }
        }
      ],
      "Next": "Done"
    },
    "Done": {
      "Type": "Succeed"
    },
    "CompensatePayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123:function:refund",
      "End": true
    }
  }
}
```

UI: visual workflow editor (kéo thả).

**Ưu điểm Step Functions:**
- Retry + error handling built-in.
- Long-running (tối đa 1 năm).
- Hỗ trợ Parallel + Map (foreach).
- Audit log mọi bước.
- Tích hợp trực tiếp 200+ AWS service.

Cost: $25 / triệu state transition (Standard). Workflow loại **Express** rẻ hơn nhiều cho task ngắn.

## EventBridge — Event bus

```text
Event Source → EventBridge → Targets
              (S3, EC2,      (Lambda, SQS,
               custom)        Step Functions, ...)
```

### Schedule (cron-like)

```bash
aws events put-rule \
    --name backup-daily \
    --schedule-expression 'cron(0 2 * * ? *)' \
    --state ENABLED

aws events put-targets \
    --rule backup-daily \
    --targets "Id=1,Arn=arn:aws:lambda:us-east-1:123:function:backup"
```

### React to AWS event (Phản ứng với event của AWS)

```bash
# EC2 instance state change
aws events put-rule \
    --name ec2-stopped \
    --event-pattern '{
        "source": ["aws.ec2"],
        "detail-type": ["EC2 Instance State-change Notification"],
        "detail": {"state": ["stopped"]}
    }'

aws events put-targets --rule ec2-stopped \
    --targets "Id=1,Arn=arn:aws:sns:us-east-1:123:alerts"
```

### Custom event (Event tự định nghĩa)

```python
import boto3

eb = boto3.client("events")

eb.put_events(Entries=[{
    "Source": "vprofile.orders",
    "DetailType": "OrderPlaced",
    "Detail": json.dumps({
        "order_id": "12345",
        "amount": 100,
        "user_id": "alice"
    })
}])
```

Subscriber rule (lọc event):

```json
{
    "source": ["vprofile.orders"],
    "detail-type": ["OrderPlaced"],
    "detail": {"amount": [{"numeric": [">", 50]}]}
}
```

### EventBridge Pipes

Source → Filter → Enrichment → Target. Thay thế nhiều Lambda glue (Lambda chỉ làm nhiệm vụ kết nối).

Source hỗ trợ: SQS, Kinesis, DynamoDB stream, MSK.
Target: Lambda, Step Functions, SQS, ...

## SAM — Serverless Application Model

`template.yaml` ví dụ đầy đủ:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Runtime: python3.12
    Timeout: 30
    MemorySize: 512
    Tracing: Active
    Environment:
      Variables:
        LOG_LEVEL: INFO

Resources:
  Api:
    Type: AWS::Serverless::HttpApi
    Properties:
      Domain:
        DomainName: api.vprofile.acme.com
        CertificateArn: !Ref CertArn
        Route53:
          HostedZoneId: !Ref ZoneId

  UsersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: users
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - {AttributeName: user_id, AttributeType: S}
      KeySchema:
        - {AttributeName: user_id, KeyType: HASH}

  GetUserFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: functions/get_user/
      Handler: app.handler
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref UsersTable
      Environment:
        Variables:
          USERS_TABLE: !Ref UsersTable
      Events:
        Api:
          Type: HttpApi
          Properties:
            ApiId: !Ref Api
            Path: /users/{id}
            Method: GET

Outputs:
  ApiUrl:
    Value: !GetAtt Api.ApiEndpoint
```

```bash
sam build
sam deploy --guided

# Test local
sam local start-api
sam local invoke GetUserFunction --event events/test.json
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Cold start ở critical path | Latency spike | Provisioned concurrency |
| Package > 250 MB | Deploy fail | Dùng layer hoặc container image |
| Tạo connection pool trong handler | Chậm | Init bên ngoài handler |
| Sync invocation không có error handling | Mất message | Dead Letter Queue |
| API Gateway không throttling | Cost spike | Rate limit per stage |
| Step Functions Standard cho task ngắn | Tốn tiền | Dùng Express |
| Lambda trong VPC | Cold start +5s | Tránh VPC nếu không thực sự cần |
| Hardcode secret | Lộ | Secrets Manager + cache trong handler |

## Tóm tắt bài 2

- **Lambda**: serverless function, trả tiền theo invocation, max 15 phút.
- **Provisioned concurrency** giảm cold start.
- **Layers** share code; **versions + aliases** cho canary deploy.
- **API Gateway HTTP API** rẻ hơn REST, khuyến nghị cho project hiện đại.
- **JWT + IAM + Lambda authorizer** là các option authentication.
- **Step Functions** orchestration với retry + parallel + visual editor.
- **EventBridge** event bus: schedule + AWS event + custom event.
- **SAM** = CloudFormation transform cho serverless app.

**Bài kế tiếp** → [Bài 3: ECS/EKS + CloudFront + Route 53 advanced](03-aws-ecs-eks.md)
