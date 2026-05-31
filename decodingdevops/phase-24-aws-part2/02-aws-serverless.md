# Bài 2: AWS Serverless — Lambda, API Gateway, Step Functions, EventBridge

Serverless = không quản server, chỉ care code. Bài này dạy **Lambda đầy đủ** + API Gateway + orchestration.

## Lambda deep

### Anatomy

```python
def lambda_handler(event, context):
    """
    event:   Trigger data (HTTP request, S3 event, ...)
    context: Runtime info (request_id, function_name, timeout, ...)
    return:  Response (auto-serialize JSON)
    """
    print(f"Received: {event}")
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"message": "Hello"})
    }
```

### Limits

| | Value |
|---|---|
| Memory | 128 MB - 10240 MB |
| Timeout | Max 15 phút |
| Package size | 50 MB zip, 250 MB unzipped, 10 GB image |
| /tmp | 512 MB - 10 GB |
| Concurrent | 1000 / account default |
| Env variable | 4 KB total |
| Payload | 6 MB sync, 256 KB async |

### Runtimes

- Python 3.11/3.12.
- Node.js 18/20.
- Java 17/21.
- Go (provided.al2).
- Ruby 3.2.
- .NET 6/8.
- Custom runtime (Rust, Bash, ...).
- Container image (any).

### Deploy Lambda

#### Option 1: Zip upload

```bash
# Package
zip -r function.zip lambda_handler.py
zip function.zip dependencies/*

# Create function
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

### Cold start

First invoke = load runtime + code = 100ms-2s.

Mitigation:
- **Provisioned concurrency**: keep N instance warm (extra cost).
- **SnapStart** (Java only): cache initialized state.
- **Smaller package**: fewer dependencies.
- **Init logic**: connection pool outside handler.

```python
# BAD - new connection per invoke
def lambda_handler(event, context):
    conn = psycopg2.connect(...)        # Cold start mỗi invoke
    ...

# GOOD - reuse connection
conn = psycopg2.connect(...)             # Init once

def lambda_handler(event, context):
    cursor = conn.cursor()
    ...
```

### Lambda layers

Share code between functions:

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

# Use in function
aws lambda update-function-configuration \
    --function-name hello \
    --layers arn:aws:lambda:us-east-1:123:layer:common-deps:1
```

Layers: cache deps, share utility code, custom runtime.

### Versions + Aliases

```bash
# Publish version (immutable snapshot)
aws lambda publish-version --function-name hello
# Version 1 created

# Create alias
aws lambda create-alias \
    --function-name hello \
    --name prod \
    --function-version 1

# Traffic shifting alias
aws lambda update-alias \
    --function-name hello \
    --name prod \
    --function-version 2 \
    --routing-config 'AdditionalVersionWeights={"1"=0.9}'
# 90% v1, 10% v2 (canary)
```

API Gateway / EventBridge trigger `hello:prod` → use alias.

## API Gateway

### REST API vs HTTP API vs WebSocket

| | REST API | HTTP API | WebSocket API |
|---|---|---|---|
| Cost | High | **Low** (cheaper 70%) | Medium |
| Latency | Higher | **Lower** | N/A |
| Feature | Full | Subset | Bidirectional |
| Use case | Legacy, full feature | Modern simple | Realtime chat |

HTTP API recommend cho project mới.

### Setup HTTP API + Lambda

```bash
# Create API
API_ID=$(aws apigatewayv2 create-api \
    --name vprofile-api \
    --protocol-type HTTP \
    --target arn:aws:lambda:us-east-1:123:function:hello \
    --query ApiId --output text)

# Get URL
aws apigatewayv2 get-api --api-id $API_ID \
    --query ApiEndpoint --output text
# https://xxxx.execute-api.us-east-1.amazonaws.com
```

### Routes

```bash
# Add route + integration
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
# Cert
CERT_ARN=$(aws acm request-certificate \
    --domain-name api.vprofile.acme.com \
    --validation-method DNS \
    --region us-east-1 \
    --query CertificateArn --output text)

# Wait validated...

# Custom domain
aws apigatewayv2 create-domain-name \
    --domain-name api.vprofile.acme.com \
    --domain-name-configurations CertificateArn=$CERT_ARN

# Mapping
aws apigatewayv2 create-api-mapping \
    --domain-name api.vprofile.acme.com \
    --api-id $API_ID \
    --stage \$default

# Route 53 alias
aws route53 change-resource-record-sets ... # Alias to API Gateway domain
```

### Authorization

```yaml
# JWT (Cognito or external IdP)
- Authorization: Bearer <jwt-token>
- API Gateway verify với issuer URL + audience

# IAM (sign with AWS sig v4)
- Service-to-service

# Lambda authorizer
- Custom logic Python function
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

# Cache (REST API only)
CacheEnabled: true
CacheTtlInSeconds: 300
```

## Step Functions — workflow

Orchestrate Lambda + service into workflow:

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

UI: visual workflow editor.

Pros:
- Built-in retry + error handling.
- Long-running (max 1 year).
- Parallel + Map (foreach).
- Audit log every step.
- Integrate 200+ AWS service direct.

Cost: $25/million state transition. Standard. Express workflow cheaper for short tasks.

## EventBridge — event bus

```text
Event Source → EventBridge → Targets
              (S3, EC2,      (Lambda, SQS,
               custom)        Step Functions, ...)
```

### Schedule (cron)

```bash
aws events put-rule \
    --name backup-daily \
    --schedule-expression 'cron(0 2 * * ? *)' \
    --state ENABLED

aws events put-targets \
    --rule backup-daily \
    --targets "Id=1,Arn=arn:aws:lambda:us-east-1:123:function:backup"
```

### React to AWS event

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

### Custom event

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

Subscriber rule:

```json
{
    "source": ["vprofile.orders"],
    "detail-type": ["OrderPlaced"],
    "detail": {"amount": [{"numeric": [">", 50]}]}
}
```

### EventBridge Pipes

Source → Filter → Enrichment → Target. Replace many Lambda glue.

Source: SQS, Kinesis, DynamoDB stream, MSK.
Target: Lambda, Step Functions, SQS, ...

## SAM — Serverless Application Model

`template.yaml` full example:

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

# Local test
sam local start-api
sam local invoke GetUserFunction --event events/test.json
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Cold start critical path | Latency spike | Provisioned concurrency |
| Package > 250 MB | Deploy fail | Use layer hoặc container image |
| Connection pool inside handler | Slow | Init outside |
| Sync invocation no error handling | Lost message | Dead Letter Queue |
| API Gateway no throttling | Cost spike | Rate limit per stage |
| Step Functions Standard for short task | $$$ | Use Express |
| Lambda in VPC | Cold start +5s | Avoid VPC nếu không cần |
| Hardcode secret | Lộ | Secrets Manager + cache |

## Tóm tắt bài 2

- **Lambda**: serverless function pay-per-invocation max 15 phút.
- **Provisioned concurrency** mitigate cold start.
- **Layers** share code, **versions + aliases** canary deploy.
- **API Gateway HTTP API** cheaper than REST, modern projects.
- **JWT + IAM + Lambda authorizer** authentication options.
- **Step Functions** orchestration với retry + parallel + visual editor.
- **EventBridge** event bus: schedule + AWS event + custom event.
- **SAM** = CloudFormation transform cho serverless app.

**Bài kế tiếp** → [Bài 3: ECS/EKS + CloudFront + Route 53 advanced](03-aws-ecs-eks.md)
