# Bài 2: Deploy lên Elastic Cloud

Walkthrough deploy + connect app từ ngoài.

## Step 1: Sign up trial

1. <https://cloud.elastic.co>.
2. Sign up email.
3. Email verify.

## Step 2: Create deployment

UI:

```text
┌─ Create deployment ─────────────────────────────────┐
│                                                       │
│  Name:    [my-first-cluster              ]            │
│                                                       │
│  Cloud:   ○ AWS    ● GCP    ○ Azure                  │
│                                                       │
│  Region:  [Asia Pacific - Singapore ▼]                │
│                                                       │
│  Version: [8.13.0 (latest) ▼]                         │
│                                                       │
│  ┌─ Hardware ────────────────────────────────────┐  │
│  │ Profile: ● General Purpose                     │  │
│  │          ○ CPU Optimized                       │  │
│  │          ○ Storage Optimized                   │  │
│  │ Size:    [Small (1 zone)]                      │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│                              [Cancel]  [Create]      │
└─────────────────────────────────────────────────────┘
```

Click **Create**. Provisioning ~5 min.

## Step 3: Note credentials

Page hiện sau create:

```text
⚠️  This password is shown only ONCE. Save it now.

Username: elastic
Password: <random-string>

Elasticsearch endpoint:
   https://my-first-cluster.es.asia-southeast1.gcp.cloud.es.io:9243

Kibana endpoint:
   https://my-first-cluster.kb.asia-southeast1.gcp.cloud.es.io:9243

Cloud ID (for Beats/Logstash):
   my-first-cluster:<base64-encoded-info>
```

→ Lưu password manager. **Download CSV** option có sẵn.

## Step 4: Open Kibana

Click Kibana URL → tab mới → Kibana UI. Login:

- Username: `elastic`
- Password: vừa save.

→ Login thành công → familiar Kibana UI giống Phase 6.

## Step 5: Add sample data

Quickest cách verify: home page → **Try sample data** → **Sample web logs** → **Add data**.

→ Few seconds setup. Click **View data** → dashboards available.

→ Đã có cluster running với data + dashboards. Production-quality.

## Step 6: Connect từ app

### Python ES client

```python
from elasticsearch import Elasticsearch

es = Elasticsearch(
    "https://my-first-cluster.es.asia-southeast1.gcp.cloud.es.io:9243",
    basic_auth=("elastic", "password-here")
)

# Test
print(es.info())

# Index
es.index(index="my-app", body={"hello": "world"})
```

### Node.js

```javascript
const { Client } = require('@elastic/elasticsearch');

const client = new Client({
    node: 'https://my-first-cluster.es.asia-southeast1.gcp.cloud.es.io:9243',
    auth: {
        username: 'elastic',
        password: 'password-here'
    }
});

await client.info();
```

### Cloud ID alternative

Hơn nữa, libraries support **Cloud ID** (giảm config):

```python
es = Elasticsearch(
    cloud_id="my-first-cluster:<base64>",
    basic_auth=("elastic", "password-here")
)
```

→ Cloud ID encode URL + version + region trong 1 string. Đơn giản hơn.

## Step 7: API key (best practice)

Đừng dùng `elastic` user trong production app. Tạo **API key** scoped:

Kibana → **Stack Management → Security → API keys → Create API key**:

```text
Name: my-app-write
Privileges:
  - Cluster: monitor
  - Indices:
    - Names: my-app-*
    - Privileges: write, view_index_metadata
```

Save → modal hiện key (chỉ lần duy nhất):

```text
ID: a1b2c3d4
API Key: zxc...vbn
Encoded: YTFiMmMzZDQ6enhjLi4udmJu
```

Use `encoded` directly:

```python
es = Elasticsearch(
    cloud_id="...",
    api_key="YTFiMmMzZDQ6enhjLi4udmJu"
)
```

→ Revocable bất kỳ lúc nào không affect user accounts.

## Step 8: Connect FileBeat / Logstash

### FileBeat

`filebeat.yml`:

```yaml
cloud.id: "my-first-cluster:<base64>"
cloud.auth: "elastic:password-here"

filebeat.inputs:
  - type: log
    paths: ["/var/log/nginx/access.log"]
```

→ Beat đơn giản gửi log lên Elastic Cloud.

### Logstash

```text
output {
    elasticsearch {
        cloud_id => "my-first-cluster:<base64>"
        cloud_auth => "elastic:password-here"
        index => "logs-%{+YYYY.MM.dd}"
    }
}
```

## Step 9: Setup ILM + SLM

Cloud auto setup default ILM (`logs` policy, 30-day retention) + SLM (daily snapshot).

Customize Kibana → **Stack Management → Index Lifecycle Policies / Snapshot Lifecycle Policies**.

## Step 10: Monitor + scale

### Monitor

Kibana → **Stack Monitoring** → real-time cluster stats. Free.

### Scale

Deployment dashboard → **Edit** → adjust:

```text
Hot tier:    Size 8 GB RAM × 2 zones    →    16 GB × 3 zones
Warm tier:   (add)                        →    4 GB × 2 zones
Cold tier:   (add)                        →    2 GB × 2 zones
```

→ Apply. Elastic Cloud rolling restart auto. Zero downtime.

→ Pay only delta. Auto invoice.

## Cost monitoring

Elastic Cloud → **Billing** → daily breakdown:
- ES costs.
- Kibana costs.
- Data transfer.

Set budget alert qua cloud provider native (AWS Budgets, GCP Billing alerts).

## Backup migration

Snapshot tự động via SLM. Restore:

```text
Kibana → Stack Management → Snapshot and Restore
```

→ UI list snapshots, select restore.

Cross-cluster restore (migrate to another deployment):

1. Snapshot deployment A.
2. Trên deployment B, register same S3 repo.
3. Restore.

→ Migration straightforward.

## Disable / delete deployment

```text
Deployment dashboard → Settings → Delete deployment
```

→ Confirm name. Permanent. Snapshots optionally retain.

→ Trial expire = deployment auto-delete sau X days warning. Backup data trước.

## Pitfalls

### 1. Quên lưu password initial

ES `elastic` user password chỉ hiện 1 lần creation. Quên = reset (xoá data?). Lưu kỹ.

### 2. Public exposure

Default deployment public internet. Restrict bằng:

```text
Deployment → Security → Traffic filters
```

→ Whitelist IP / VPC.

### 3. Cost surprise

POC small → forget scale down → bill cuối tháng surprise.

→ Set billing alert. Delete deployment khi không cần.

### 4. Trial expire data loss

14 day trial → auto delete. Snapshot trước.

## ✨ Tổng kết Phase 9

Sau Phase 9:

- **Elastic Cloud** = managed service official. 14-day trial free.
- 5 min setup deployment. Full Kibana + ES + Platinum features.
- Connect qua **endpoint URL** hoặc **Cloud ID**.
- **API key** for production app (revocable).
- FileBeat + Logstash support `cloud.id` config.
- Auto ILM + SLM preset.
- Scale up/down qua UI, zero downtime.
- Backup migration qua snapshot to shared S3 repo.
- Trade-off: cost 2-3× vs self-host, nhưng zero ops + enterprise features.

## Tóm tắt

- Sign up → create deployment 5 min → get credentials → Kibana ready.
- Connect Python/Node via library với endpoint + auth (basic hoặc API key).
- FileBeat/Logstash use `cloud.id` simplified config.
- Monitor + scale qua deployment dashboard.
- Backup auto SLM. Migrate qua snapshot restore cross-cluster.
- Cẩn thận trial expire, public exposure, cost.

---

→ [Phase 10: Tổng kết khoá học](../phase-10-tong-ket/01-tong-ket-va-roadmap.md)
