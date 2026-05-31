# Bài 2: Migration MariaDB EC2 → RDS Multi-AZ

Bài 1 đã giới thiệu refactor strategy. Bài này **chi tiết migration** MariaDB từ EC2 → RDS — chuyển 1 service đầu tiên.

## Vì sao migrate sang RDS?

EC2 self-host MariaDB:
- Phải patch OS + MariaDB version.
- Phải setup backup script + cron.
- Phải build replication cluster cho HA.
- Failover manual.
- Monitor + alert tự setup.

RDS managed:
- Auto patch (window bạn chọn).
- Auto backup + point-in-time restore.
- Multi-AZ 1 click → sync replica failover.
- Read replica 1 click → scale read.
- CloudWatch metric built-in.
- IAM authentication.
- Encryption at rest + in transit built-in.

Trade-off: cost +30%, hạn chế customize (vd không edit `my.cnf` lung tung).

## Kiểm tra trước migration

```bash
# Kích thước DB hiện tại
mysql -u root -p -e "
SELECT table_schema 'DB',
       ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) 'Size MB'
FROM information_schema.tables
GROUP BY table_schema;"

# Schema list
mysql -u root -p -e "SHOW DATABASES;"

# Slow query nếu có
mysql -u root -p -e "SHOW VARIABLES LIKE 'slow_query_log';"
```

Plan:
- Size < 100 GB → dump + restore đơn giản.
- Size > 100 GB → DMS (Database Migration Service).

## RDS Subnet Group

Đã tạo ở bài 2 phase 14. Recap:

```bash
aws rds create-db-subnet-group \
    --db-subnet-group-name vprofile-db-subnet \
    --db-subnet-group-description "vProfile DB private subnets" \
    --subnet-ids $RDS_SUBNET_A $RDS_SUBNET_B \
    --tags Key=Project,Value=vprofile
```

## Parameter Group — custom config

RDS có default parameter group nhưng read-only. Tạo custom:

```bash
aws rds create-db-parameter-group \
    --db-parameter-group-name vprofile-mariadb-params \
    --db-parameter-group-family mariadb10.11 \
    --description "vProfile custom params"

# Set parameter
aws rds modify-db-parameter-group \
    --db-parameter-group-name vprofile-mariadb-params \
    --parameters \
        ParameterName=slow_query_log,ParameterValue=1,ApplyMethod=immediate \
        ParameterName=long_query_time,ParameterValue=2,ApplyMethod=immediate \
        ParameterName=max_connections,ParameterValue=200,ApplyMethod=pending-reboot
```

| Apply method | Khi áp dụng |
|---|---|
| `immediate` | Áp dụng ngay |
| `pending-reboot` | Áp dụng khi reboot DB |

Static parameter (max_connections, innodb_buffer_pool_size) cần reboot. Dynamic apply ngay.

## Option Group — additional features

```bash
aws rds create-option-group \
    --option-group-name vprofile-mariadb-options \
    --engine-name mariadb \
    --major-engine-version 10.11 \
    --option-group-description "vProfile options"

# Add MariaDB audit plugin
aws rds add-option-to-option-group \
    --option-group-name vprofile-mariadb-options \
    --options "OptionName=MARIADB_AUDIT_PLUGIN,OptionSettings=[{Name=SERVER_AUDIT_FILE_PATH,Value=/rdsdbdata/log/audit/}]" \
    --apply-immediately
```

Option = plugin/feature add-on (audit, S3 backup, ...).

## Secrets Manager cho password

Tránh hardcode password:

```bash
aws secretsmanager create-secret \
    --name prod/vprofile/db \
    --description "RDS master password" \
    --secret-string "$(openssl rand -base64 32)"

# Get secret cho RDS create command
DB_PASSWORD=$(aws secretsmanager get-secret-value \
    --secret-id prod/vprofile/db \
    --query SecretString --output text)
```

## Create RDS Multi-AZ

```bash
aws rds create-db-instance \
    --db-instance-identifier vprofile-rds \
    --db-instance-class db.t3.micro \
    --engine mariadb \
    --engine-version 10.11.6 \
    --master-username admin \
    --master-user-password "$DB_PASSWORD" \
    --allocated-storage 20 \
    --max-allocated-storage 100 \
    --storage-type gp3 \
    --storage-encrypted \
    --kms-key-id alias/aws/rds \
    --db-name accounts \
    --vpc-security-group-ids $BACKEND_SG \
    --db-subnet-group-name vprofile-db-subnet \
    --db-parameter-group-name vprofile-mariadb-params \
    --option-group-name vprofile-mariadb-options \
    --backup-retention-period 7 \
    --preferred-backup-window "03:00-04:00" \
    --preferred-maintenance-window "Sun:04:00-Sun:05:00" \
    --multi-az \
    --publicly-accessible false \
    --auto-minor-version-upgrade true \
    --deletion-protection \
    --enable-iam-database-authentication \
    --enable-performance-insights \
    --performance-insights-retention-period 7 \
    --monitoring-interval 60 \
    --monitoring-role-arn arn:aws:iam::ACCOUNT:role/rds-monitoring-role \
    --tags Key=Project,Value=vprofile Key=Environment,Value=production
```

Settings quan trọng:

| Setting | Giá trị | Vai trò |
|---|---|---|
| `--multi-az` | enabled | Standby ở AZ khác, sync replication |
| `--storage-encrypted` | enabled | Encrypt at rest |
| `--backup-retention-period 7` | 7 ngày | Point-in-time restore tới 7 ngày |
| `--deletion-protection` | enabled | Chống xoá nhầm |
| `--auto-minor-version-upgrade` | enabled | Auto patch security |
| `--enable-performance-insights` | enabled | Slow query analysis built-in |
| `--monitoring-interval 60` | 60s | Enhanced monitoring metric |

### Storage scaling

`--max-allocated-storage 100` = auto-scale từ 20 GB → 100 GB khi cần. **No manual resize**.

Modern RDS: dùng **storage autoscaling**, không pre-allocate big.

## Wait RDS available

```bash
echo "Waiting RDS create (5-10 min)..."
aws rds wait db-instance-available --db-instance-identifier vprofile-rds

# Get endpoint
RDS_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier vprofile-rds \
    --query 'DBInstances[0].Endpoint.Address' --output text)

echo "RDS endpoint: $RDS_ENDPOINT"
# vprofile-rds.xxx.us-east-1.rds.amazonaws.com
```

## Migrate data từ EC2

### Bước 1: Dump trên db01 (EC2)

```bash
# SSH vào db01 (qua bastion hoặc SSM)
aws ssm start-session --target $DB_EC2_ID

# Trong db01:
mysqldump -u root -padmin123 --single-transaction --routines --triggers \
    --databases accounts > /tmp/accounts-dump.sql

# Kiểm tra size
ls -lh /tmp/accounts-dump.sql

# Compress
gzip /tmp/accounts-dump.sql
ls -lh /tmp/accounts-dump.sql.gz
```

`--single-transaction` = consistent dump không lock table (cho InnoDB).

### Bước 2: Upload S3

```bash
# Trong db01:
aws s3 cp /tmp/accounts-dump.sql.gz s3://vprofile-migration/
```

### Bước 3: Download + restore lên RDS

```bash
# Trên app01 (cùng VPC như RDS):
aws s3 cp s3://vprofile-migration/accounts-dump.sql.gz /tmp/
gunzip /tmp/accounts-dump.sql.gz

# Restore
DB_PASS=$(aws secretsmanager get-secret-value \
    --secret-id prod/vprofile/db \
    --query SecretString --output text)

mysql -h $RDS_ENDPOINT -u admin -p"$DB_PASS" < /tmp/accounts-dump.sql

# Verify
mysql -h $RDS_ENDPOINT -u admin -p"$DB_PASS" -e "USE accounts; SHOW TABLES; SELECT COUNT(*) FROM user;"
```

## Update app01 connection string

```bash
# SSH app01
sudo vi /tmp/vprofile-project/src/main/resources/application.properties

# Đổi:
jdbc.url=jdbc:mysql://vprofile-rds.xxx.us-east-1.rds.amazonaws.com:3306/accounts?useSSL=true&requireSSL=true
jdbc.username=admin
jdbc.password=<password>

# Rebuild
cd /tmp/vprofile-project
mvn package -DskipTests

# Redeploy
sudo systemctl stop tomcat
sudo rm -rf /opt/tomcat/webapps/ROOT*
sudo cp target/vprofile-v2.war /opt/tomcat/webapps/ROOT.war
sudo chown tomcat:tomcat /opt/tomcat/webapps/ROOT.war
sudo systemctl start tomcat
```

### Connection encryption

RDS support SSL. Update JDBC URL:

```text
jdbc:mysql://endpoint:3306/db?useSSL=true&requireSSL=true&verifyServerCertificate=true&trustCertificateKeyStoreUrl=file:rds-ca.jks
```

Tải CA cert:

```bash
wget https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

Import vào Java keystore + reference trong JDBC URL.

## Verify migration

```bash
# Test connection
curl https://vprofile.acme.com
# Login admin_vp / admin_vp → dashboard

# Click "User" tab → query DB → verify data từ RDS
```

CloudWatch RDS metric:
- `DatabaseConnections` > 0.
- `CPUUtilization` < 50%.
- `ReadIOPS`/`WriteIOPS` activity.

## Decommission db01 EC2

```bash
# Sau khi verify RDS work 24+ giờ:
aws ec2 terminate-instances --instance-ids $DB_EC2_ID
```

Cost saving: $7.6/month (db01) → $30 (RDS Multi-AZ). Tăng 4x nhưng có HA + backup + zero ops.

## Read Replica

Scale read:

```bash
aws rds create-db-instance-read-replica \
    --db-instance-identifier vprofile-rds-read1 \
    --source-db-instance-identifier vprofile-rds \
    --db-instance-class db.t3.micro \
    --auto-minor-version-upgrade
```

App update:

```properties
# Write
jdbc.url.write=jdbc:mysql://vprofile-rds.xxx.rds.amazonaws.com:3306/accounts
# Read
jdbc.url.read=jdbc:mysql://vprofile-rds-read1.xxx.rds.amazonaws.com:3306/accounts
```

Spring routing datasource → write goes to primary, read goes to replica.

## RDS Proxy — connection pooling

App scale → mỗi instance mở connection riêng → DB max_connections hit:

```bash
aws rds create-db-proxy \
    --db-proxy-name vprofile-proxy \
    --engine-family MYSQL \
    --auth "AuthScheme=SECRETS,SecretArn=arn:aws:secretsmanager:...:secret:prod/vprofile/db" \
    --role-arn arn:aws:iam::ACCOUNT:role/rds-proxy-role \
    --vpc-subnet-ids $RDS_SUBNET_A $RDS_SUBNET_B \
    --vpc-security-group-ids $BACKEND_SG

# Register RDS target
aws rds register-db-proxy-targets \
    --db-proxy-name vprofile-proxy \
    --db-instance-identifiers vprofile-rds
```

App connect tới Proxy → Proxy pool connection → DB.

Lợi: throttling, IAM auth, transparent failover.

## Automated backup vs Snapshot

| | Automated | Manual snapshot |
|---|---|---|
| Trigger | RDS auto | Bạn run |
| Retention | 0-35 ngày | Vô hạn |
| Cost | Free trong retention | Tính per GB |
| Cross-region copy | Manual | Manual |
| Restore | Point-in-time | At snapshot time |

```bash
# Manual snapshot trước major change
aws rds create-db-snapshot \
    --db-snapshot-identifier vprofile-pre-upgrade-$(date +%F) \
    --db-instance-identifier vprofile-rds

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
    --db-instance-identifier vprofile-rds-restored \
    --db-snapshot-identifier vprofile-pre-upgrade-2026-05-31
```

## Performance Insights — slow query analysis

Console → RDS → vprofile-rds → Performance Insights:
- Top SQL by time.
- Top wait events.
- DB load over time.

Replace mở slow_query_log + analyze manual.

## IAM database authentication

```bash
# Tạo IAM policy
aws iam create-policy --policy-name rds-connect-vprofile --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Action": ["rds-db:connect"],
        "Resource": ["arn:aws:rds-db:us-east-1:ACCOUNT:dbuser:DB_RESOURCE_ID/admin"]
    }]
}'

# Attach vào IAM role của EC2

# Trên DB:
CREATE USER 'admin' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS';

# Trong app — get IAM token thay password:
TOKEN=$(aws rds generate-db-auth-token \
    --hostname $RDS_ENDPOINT \
    --port 3306 \
    --region us-east-1 \
    --username admin)

mysql -h $RDS_ENDPOINT -u admin --password="$TOKEN" --enable-cleartext-plugin
```

Token valid 15 phút. App auto-rotate. **No more static password**.

## Cost RDS

| Config | Monthly |
|---|---|
| db.t3.micro Single-AZ | $15 |
| db.t3.micro Multi-AZ | $30 |
| db.t3.small Multi-AZ | $60 |
| db.m6g.large Multi-AZ | $200 |
| Storage gp3 (20 GB) | $2.5 |
| Backup storage > 100% | $0.095/GB |
| IO Performance Insights free 7d | Free |

Pricing: pay per hour. Reserved Instance 1-3 năm → -30-50%.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Single-AZ prod | Outage AZ → down | Multi-AZ mandatory prod |
| `deletion-protection` off | Lỡ delete | Always on prod |
| Public subnet RDS | Security risk | Private subnet only |
| Backup retention 0 | Mất data nếu xoá | Set 7-35 ngày |
| Quên SG inbound RDS | App fail connect | Allow app SG → RDS port |
| Migrate downtime | Service interruption | Lập kế hoạch, AWS DMS cho live migration |
| `useSSL=false` | Lộ data on wire | `requireSSL=true` |
| Hardcode password | Lộ | Secrets Manager + IAM auth |

## Tóm tắt bài 2

- **RDS Multi-AZ** = HA tự động, sync replica, failover < 60s.
- **Parameter Group** custom config (slow_query, max_connections).
- **Secrets Manager** lưu password — không hardcode.
- Migration: `mysqldump` → S3 → restore lên RDS.
- **Read Replica** scale read; **RDS Proxy** connection pool.
- **Performance Insights** built-in slow query analysis.
- **IAM database authentication** thay static password.
- **Backup retention 7-35 ngày** + manual snapshot trước major change.
- Cost db.t3.micro Multi-AZ ~$30/month.

**Bài kế tiếp** → [Bài 3: ElastiCache + Amazon MQ + S3 CloudFront](03-elasticache-mq-cloudfront.md)
