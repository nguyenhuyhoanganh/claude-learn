# Bài 3: Python automation — subprocess, requests, boto3, parallel

Bài này dạy **Python tool DevOps thực tế**: chạy shell command, gọi REST API, manage cloud, parallel processing.

## subprocess — chạy shell

```python
import subprocess

# Cơ bản
result = subprocess.run(
    ["ls", "-la", "/tmp"],
    capture_output=True,
    text=True,
    check=True              # Raise nếu exit ≠ 0
)
print(result.stdout)
print(result.returncode)
```

### Pipe + shell

```python
# Pipe với shell=True (cẩn thận inject)
result = subprocess.run(
    "ps aux | grep nginx",
    shell=True,
    capture_output=True,
    text=True
)

# An toàn hơn: 2 subprocess + pipe
ps = subprocess.Popen(["ps", "aux"], stdout=subprocess.PIPE)
grep = subprocess.Popen(["grep", "nginx"], stdin=ps.stdout, stdout=subprocess.PIPE, text=True)
ps.stdout.close()
output, _ = grep.communicate()
```

### Stream output realtime

```python
process = subprocess.Popen(
    ["tail", "-f", "/var/log/syslog"],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1
)

for line in process.stdout:
    print(f"LOG: {line.strip()}")
```

### Timeout + kill

```python
try:
    result = subprocess.run(
        ["long-task"],
        capture_output=True,
        timeout=30
    )
except subprocess.TimeoutExpired:
    print("Task timeout")
```

### Helper class

```python
class Shell:
    @staticmethod
    def run(cmd: list[str], *, check: bool = True, **kwargs) -> subprocess.CompletedProcess:
        """Wrapper around subprocess.run with sensible defaults."""
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=check,
            **kwargs
        )

    @staticmethod
    def stdout(cmd: list[str]) -> str:
        return Shell.run(cmd).stdout.strip()

# Use
hostname = Shell.stdout(["hostname"])
Shell.run(["systemctl", "restart", "nginx"])
```

## requests — HTTP

```python
import requests

# GET
r = requests.get("https://api.github.com/users/torvalds")
print(r.status_code)
print(r.json()["name"])

# POST JSON
r = requests.post(
    "https://api.acme.com/users",
    json={"name": "Alice", "email": "a@b.com"},
    headers={"Authorization": "Bearer xxx"},
    timeout=10
)
r.raise_for_status()      # Raise nếu 4xx/5xx
data = r.json()

# Auth
r = requests.get(url, auth=("user", "pass"))
r = requests.get(url, auth=requests.auth.HTTPBasicAuth("user", "pass"))

# Headers
headers = {
    "User-Agent": "DevOps-Tool/1.0",
    "X-Custom-Header": "value"
}
r = requests.get(url, headers=headers)

# Query string
r = requests.get("https://api.acme.com/users", params={"role": "admin", "limit": 10})

# Form data
r = requests.post(url, data={"key": "value"})

# Upload file
with open("file.zip", "rb") as f:
    r = requests.post(url, files={"file": f})

# Stream large download
with requests.get("https://example.com/large.iso", stream=True) as r:
    with open("file.iso", "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
```

### Session — connection reuse

```python
s = requests.Session()
s.headers.update({"Authorization": "Bearer xxx"})
s.mount("https://", requests.adapters.HTTPAdapter(pool_maxsize=20))

# Multiple request reuse connection
for user_id in range(100):
    r = s.get(f"https://api.acme.com/users/{user_id}")
```

### Retry

```python
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

retry = Retry(
    total=3,
    backoff_factor=1,           # 1s, 2s, 4s
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["GET", "POST"]
)
s = requests.Session()
s.mount("https://", HTTPAdapter(max_retries=retry))

r = s.get("https://flaky-api.com/data")
```

### Async với httpx (modern alternative)

```python
import httpx
import asyncio

async def fetch_all(urls):
    async with httpx.AsyncClient() as client:
        tasks = [client.get(url) for url in urls]
        return await asyncio.gather(*tasks)

urls = ["https://api1.com", "https://api2.com", "https://api3.com"]
results = asyncio.run(fetch_all(urls))
```

10x faster cho parallel HTTP.

## boto3 — AWS SDK

```python
import boto3

# Default region from ~/.aws/config or env
ec2 = boto3.client("ec2")

# Explicit region
ec2 = boto3.client("ec2", region_name="us-east-1")

# Multiple credentials
session = boto3.Session(profile_name="prod")
ec2 = session.client("ec2")
```

### EC2

```python
# List instances
resp = ec2.describe_instances(
    Filters=[
        {"Name": "tag:Environment", "Values": ["production"]},
        {"Name": "instance-state-name", "Values": ["running"]}
    ]
)

for reservation in resp["Reservations"]:
    for inst in reservation["Instances"]:
        name = next((t["Value"] for t in inst.get("Tags", []) if t["Key"] == "Name"), "")
        print(f"{inst['InstanceId']}: {name} ({inst['PrivateIpAddress']})")

# Start/stop
ec2.start_instances(InstanceIds=["i-xxx", "i-yyy"])
ec2.stop_instances(InstanceIds=["i-xxx"])

# Create
ec2.run_instances(
    ImageId="ami-xxx",
    InstanceType="t3.micro",
    KeyName="my-key",
    SecurityGroupIds=["sg-xxx"],
    SubnetId="subnet-xxx",
    MinCount=1, MaxCount=1,
    TagSpecifications=[{
        "ResourceType": "instance",
        "Tags": [{"Key": "Name", "Value": "auto-created"}]
    }]
)

# Wait
waiter = ec2.get_waiter("instance_running")
waiter.wait(InstanceIds=["i-xxx"])
```

### S3 — High-level Resource

```python
s3 = boto3.resource("s3")

# List bucket
for bucket in s3.buckets.all():
    print(bucket.name)

# Upload
bucket = s3.Bucket("my-bucket")
bucket.upload_file("local.txt", "remote.txt")
bucket.upload_file("file.bin", "data/file.bin",
                   ExtraArgs={"ContentType": "application/octet-stream",
                              "StorageClass": "STANDARD_IA"})

# Download
bucket.download_file("remote.txt", "local.txt")

# List objects
for obj in bucket.objects.filter(Prefix="logs/"):
    print(f"{obj.key}: {obj.size} bytes")

# Delete
bucket.Object("remote.txt").delete()

# Pre-signed URL
s3_client = boto3.client("s3")
url = s3_client.generate_presigned_url(
    "get_object",
    Params={"Bucket": "my-bucket", "Key": "file.zip"},
    ExpiresIn=3600
)
```

### DynamoDB

```python
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("Users")

# Put
table.put_item(Item={
    "user_id": "alice",
    "email": "a@b.com",
    "age": 30
})

# Get
resp = table.get_item(Key={"user_id": "alice"})
user = resp.get("Item")

# Query (with index)
from boto3.dynamodb.conditions import Key

resp = table.query(
    KeyConditionExpression=Key("user_id").begins_with("a")
)
items = resp["Items"]

# Update
table.update_item(
    Key={"user_id": "alice"},
    UpdateExpression="SET age = :a",
    ExpressionAttributeValues={":a": 31}
)
```

### Pagination

```python
# Some APIs return paginated
paginator = ec2.get_paginator("describe_instances")
for page in paginator.paginate():
    for r in page["Reservations"]:
        ...
```

### CloudWatch metric

```python
cw = boto3.client("cloudwatch")

# Publish custom metric
cw.put_metric_data(
    Namespace="vprofile",
    MetricData=[{
        "MetricName": "OrderCount",
        "Value": 1,
        "Unit": "Count",
        "Dimensions": [{"Name": "Environment", "Value": "prod"}]
    }]
)

# Get metric
resp = cw.get_metric_statistics(
    Namespace="AWS/EC2",
    MetricName="CPUUtilization",
    Dimensions=[{"Name": "InstanceId", "Value": "i-xxx"}],
    StartTime=datetime.utcnow() - timedelta(hours=1),
    EndTime=datetime.utcnow(),
    Period=300,
    Statistics=["Average"]
)
```

## Parallel processing

### concurrent.futures

```python
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

# I/O bound → threads
def fetch(url):
    return requests.get(url).text

urls = ["https://api1.com", "https://api2.com", ...]

with ThreadPoolExecutor(max_workers=10) as executor:
    results = list(executor.map(fetch, urls))

# CPU bound → processes
def cpu_intensive(n):
    return sum(i * i for i in range(n))

numbers = [10000, 20000, 30000]
with ProcessPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(cpu_intensive, numbers))
```

### asyncio

```python
import asyncio
import httpx

async def fetch(client, url):
    r = await client.get(url)
    return r.json()

async def main():
    async with httpx.AsyncClient() as client:
        tasks = [fetch(client, url) for url in urls]
        results = await asyncio.gather(*tasks)
    return results

results = asyncio.run(main())
```

### Multiprocessing — heavy parallel

```python
from multiprocessing import Pool

def process_file(path):
    # Heavy processing
    return result

with Pool(processes=8) as pool:
    results = pool.map(process_file, file_paths)
```

## Logging — structured

```python
import logging
import json
from datetime import datetime

# Setup logger
class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            **(record.__dict__.get("extra", {}))
        })

handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
logger.addHandler(handler)

# Use
logger.info("Starting deploy", extra={"version": "1.2.3"})
logger.warning("Disk usage high", extra={"usage": "85%"})
logger.error("Deploy failed", exc_info=True)
```

JSON log → ingest ELK/Loki/CloudWatch.

## Real-world: AWS resource cleanup tool

```python
#!/usr/bin/env python3
"""
AWS resource cleanup tool.
Identify + delete unused resources to save cost.
"""
import argparse
import logging
from datetime import datetime, timedelta
from typing import List

import boto3
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)


class AWSCleanup:
    def __init__(self, region: str, dry_run: bool = True):
        self.region = region
        self.dry_run = dry_run
        self.ec2 = boto3.client("ec2", region_name=region)
        self.s3 = boto3.resource("s3")
        self.rds = boto3.client("rds", region_name=region)
        self.savings = 0.0

    def find_orphan_ebs_volumes(self) -> List[dict]:
        """EBS không attach instance."""
        resp = self.ec2.describe_volumes(
            Filters=[{"Name": "status", "Values": ["available"]}]
        )
        return resp["Volumes"]

    def find_stopped_instances_older_than(self, days: int) -> List[dict]:
        """EC2 stopped > N ngày."""
        cutoff = datetime.utcnow() - timedelta(days=days)
        resp = self.ec2.describe_instances(
            Filters=[{"Name": "instance-state-name", "Values": ["stopped"]}]
        )

        old = []
        for r in resp["Reservations"]:
            for inst in r["Instances"]:
                # Approx: use launch time (could query state transitions)
                if inst["LaunchTime"].replace(tzinfo=None) < cutoff:
                    old.append(inst)
        return old

    def find_unused_elastic_ips(self) -> List[dict]:
        """EIP không associate."""
        resp = self.ec2.describe_addresses()
        return [eip for eip in resp["Addresses"] if "InstanceId" not in eip]

    def find_old_snapshots(self, days: int = 30) -> List[dict]:
        """Snapshot > N ngày."""
        cutoff = datetime.utcnow() - timedelta(days=days)
        resp = self.ec2.describe_snapshots(OwnerIds=["self"])

        return [
            s for s in resp["Snapshots"]
            if s["StartTime"].replace(tzinfo=None) < cutoff
        ]

    def find_stale_rds_snapshots(self, days: int = 30) -> List[dict]:
        cutoff = datetime.utcnow() - timedelta(days=days)
        resp = self.rds.describe_db_snapshots(SnapshotType="manual")

        return [
            s for s in resp["DBSnapshots"]
            if s["SnapshotCreateTime"].replace(tzinfo=None) < cutoff
        ]

    def cleanup_ebs(self, volumes: List[dict]):
        for vol in volumes:
            cost = vol["Size"] * 0.08    # gp3 estimate $/month
            logger.info(f"EBS {vol['VolumeId']}: {vol['Size']}GB, ~${cost:.2f}/mo")
            self.savings += cost

            if not self.dry_run:
                self.ec2.delete_volume(VolumeId=vol["VolumeId"])

    def cleanup_eips(self, eips: List[dict]):
        for eip in eips:
            logger.info(f"EIP {eip.get('PublicIp')}: $3.60/mo")
            self.savings += 3.60

            if not self.dry_run:
                self.ec2.release_address(AllocationId=eip["AllocationId"])

    def run(self):
        logger.info(f"Running cleanup in {self.region} (dry_run={self.dry_run})")

        orphan_ebs = self.find_orphan_ebs_volumes()
        unused_eips = self.find_unused_elastic_ips()
        old_snaps = self.find_old_snapshots(days=30)
        stale_rds = self.find_stale_rds_snapshots(days=30)

        logger.info(f"Found: {len(orphan_ebs)} orphan EBS, "
                    f"{len(unused_eips)} unused EIP, "
                    f"{len(old_snaps)} old EC2 snapshots, "
                    f"{len(stale_rds)} stale RDS snapshots")

        self.cleanup_ebs(orphan_ebs)
        self.cleanup_eips(unused_eips)

        logger.info(f"Estimated monthly savings: ${self.savings:.2f}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--execute", action="store_false", dest="dry_run")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s"
    )

    cleaner = AWSCleanup(args.region, args.dry_run)
    cleaner.run()


if __name__ == "__main__":
    main()
```

Run weekly cron → save thousands $/year.

## Tóm tắt bài 3

- **`subprocess.run`** capture output, check=True raise on fail.
- **`requests.Session`** connection reuse + retry config.
- **`httpx` async** parallel HTTP 10x faster.
- **`boto3`** client vs resource (high-level).
- **Pagination + waiter** trong boto3.
- **`ThreadPoolExecutor`** I/O bound, **`ProcessPoolExecutor`** CPU bound.
- **`asyncio`** modern concurrency.
- **JSON logger** structured log cho ELK/CloudWatch.
- Real tool: AWS cleanup → save real $.

**Bài kế tiếp** → [Bài 4: CLI tool + packaging + testing](04-cli-packaging.md)
