# Bài 3: Launch EC2 cho 5 service vProfile

Phase 8 dùng 5 Vagrant VM. AWS lift-shift = thay bằng 5 EC2. Bài này launch từng cái với **user data script** tự setup.

## Key pair — SSH access

```bash
aws ec2 create-key-pair \
    --key-name vprofile-key \
    --query KeyMaterial \
    --output text > vprofile-key.pem

chmod 400 vprofile-key.pem
```

`chmod 400` mandatory — SSH refuse nếu permission rộng.

## Route 53 Private Hosted Zone — DNS internal

```bash
# Tạo private zone
ZONE_ID=$(aws route53 create-hosted-zone \
    --name vprofile.internal \
    --caller-reference $(date +%s) \
    --vpc VPCRegion=us-east-1,VPCId=$VPC_ID \
    --hosted-zone-config Comment="vProfile internal DNS",PrivateZone=true \
    --query 'HostedZone.Id' --output text)
```

Sau khi tạo EC2, add A record:

```bash
aws route53 change-resource-record-sets --hosted-zone-id $ZONE_ID --change-batch '{
    "Changes": [{
        "Action": "CREATE",
        "ResourceRecordSet": {
            "Name": "db01.vprofile.internal",
            "Type": "A",
            "TTL": 60,
            "ResourceRecords": [{"Value": "10.0.11.50"}]
        }
    }]
}'
```

App dùng `db01.vprofile.internal` thay IP → dễ migrate sau.

## EC2 launch — db01 (MariaDB)

### User data script

`scripts/db01-userdata.sh`:

```bash
#!/bin/bash
exec > >(tee /var/log/user-data.log) 2>&1
set -euxo pipefail

# Install
dnf update -y
dnf install -y mariadb-server git wget

# Start
systemctl enable --now mariadb

# Wait MariaDB ready
sleep 10

# Tạo DB + user
mysql -e "CREATE DATABASE accounts;"
mysql -e "CREATE USER 'admin'@'%' IDENTIFIED BY 'admin123';"
mysql -e "GRANT ALL PRIVILEGES ON accounts.* TO 'admin'@'%';"
mysql -e "FLUSH PRIVILEGES;"

# Set root password
mysqladmin -u root password 'admin123'

# Bind 0.0.0.0
sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' /etc/my.cnf.d/mariadb-server.cnf 2>/dev/null
echo "bind-address = 0.0.0.0" >> /etc/my.cnf.d/mariadb-server.cnf

systemctl restart mariadb

# Load schema
cd /tmp
git clone -b local https://github.com/hkhcoder/vprofile-project.git
mysql -u root -padmin123 accounts < vprofile-project/src/main/resources/db_backup.sql

# Tag complete
touch /var/log/userdata-complete
```

### Launch

```bash
# Get latest Amazon Linux 2023 AMI
AMI_ID=$(aws ssm get-parameter \
    --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
    --query Parameter.Value --output text)

# Launch
DB_ID=$(aws ec2 run-instances \
    --image-id $AMI_ID \
    --instance-type t3.micro \
    --key-name vprofile-key \
    --subnet-id $PRIV_A \
    --security-group-ids $BACKEND_SG \
    --user-data file://scripts/db01-userdata.sh \
    --tag-specifications 'ResourceType=instance,Tags=[
        {Key=Name,Value=db01},
        {Key=Role,Value=database},
        {Key=Project,Value=vprofile}
    ]' \
    --metadata-options 'HttpEndpoint=enabled,HttpTokens=required' \
    --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3,DeleteOnTermination=true}' \
    --query 'Instances[0].InstanceId' --output text)

echo "Launched db01: $DB_ID"

# Wait running
aws ec2 wait instance-running --instance-ids $DB_ID

# Get private IP
DB_IP=$(aws ec2 describe-instances --instance-ids $DB_ID \
    --query 'Reservations[0].Instances[0].PrivateIpAddress' --output text)

echo "db01 IP: $DB_IP"
```

`HttpTokens=required` = IMDSv2 mandatory (security). `metadata-options` quan trọng — IMDSv1 deprecated.

## EC2 launch — mc01 (Memcached)

`scripts/mc01-userdata.sh`:

```bash
#!/bin/bash
exec > >(tee /var/log/user-data.log) 2>&1
set -euxo pipefail

dnf update -y
dnf install -y memcached

# Bind all interfaces
sed -i 's/OPTIONS=.*/OPTIONS=""/' /etc/sysconfig/memcached

systemctl enable --now memcached
systemctl restart memcached

touch /var/log/userdata-complete
```

```bash
MC_ID=$(aws ec2 run-instances \
    --image-id $AMI_ID \
    --instance-type t3.micro \
    --key-name vprofile-key \
    --subnet-id $PRIV_A \
    --security-group-ids $BACKEND_SG \
    --user-data file://scripts/mc01-userdata.sh \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=mc01},{Key=Role,Value=cache}]' \
    --query 'Instances[0].InstanceId' --output text)

aws ec2 wait instance-running --instance-ids $MC_ID
```

## EC2 launch — rmq01 (RabbitMQ)

`scripts/rmq01-userdata.sh`:

```bash
#!/bin/bash
exec > >(tee /var/log/user-data.log) 2>&1
set -euxo pipefail

dnf update -y
dnf install -y epel-release wget
dnf install -y centos-release-rabbitmq-38
dnf install -y rabbitmq-server

systemctl enable --now rabbitmq-server

# Allow remote connection
echo "listeners.tcp.default = 5672" > /etc/rabbitmq/rabbitmq.conf

# Create user
rabbitmqctl add_user test test
rabbitmqctl set_user_tags test administrator
rabbitmqctl set_permissions -p / test ".*" ".*" ".*"

# Enable management UI
rabbitmq-plugins enable rabbitmq_management

systemctl restart rabbitmq-server

touch /var/log/userdata-complete
```

Launch tương tự với SG backend, subnet private.

## EC2 launch — app01 (Tomcat)

`scripts/app01-userdata.sh`:

```bash
#!/bin/bash
exec > >(tee /var/log/user-data.log) 2>&1
set -euxo pipefail

TOMCAT_VERSION="10.1.17"

# Install
dnf update -y
dnf install -y java-17-openjdk java-17-openjdk-devel git wget maven

# Tomcat user
useradd -r -m -U -d /opt/tomcat -s /sbin/nologin tomcat

# Download Tomcat
cd /tmp
wget -q https://dlcdn.apache.org/tomcat/tomcat-10/v${TOMCAT_VERSION}/bin/apache-tomcat-${TOMCAT_VERSION}.tar.gz
tar -xzf apache-tomcat-${TOMCAT_VERSION}.tar.gz -C /opt/tomcat --strip-components=1
chown -R tomcat:tomcat /opt/tomcat
chmod +x /opt/tomcat/bin/*.sh

# systemd unit
cat > /etc/systemd/system/tomcat.service <<'EOF'
[Unit]
Description=Apache Tomcat
After=network.target

[Service]
Type=forking
User=tomcat
Group=tomcat
Environment="JAVA_HOME=/usr/lib/jvm/jre"
Environment="CATALINA_PID=/opt/tomcat/temp/tomcat.pid"
Environment="CATALINA_HOME=/opt/tomcat"
Environment="CATALINA_OPTS=-Xms512M -Xmx1024M"
ExecStart=/opt/tomcat/bin/startup.sh
ExecStop=/opt/tomcat/bin/shutdown.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tomcat

# Wait backend services ready
echo "Waiting for backend..."
for svc in "db01.vprofile.internal:3306" "mc01.vprofile.internal:11211" "rmq01.vprofile.internal:5672"; do
    until nc -zv ${svc/:/ } &>/dev/null; do
        echo "Waiting for $svc..."
        sleep 5
    done
done

# Build vProfile
cd /tmp
git clone -b local https://github.com/hkhcoder/vprofile-project.git
cd vprofile-project

# Update application.properties
PROPS=src/main/resources/application.properties
sed -i 's|jdbc.url=.*|jdbc.url=jdbc:mysql://db01.vprofile.internal:3306/accounts?useUnicode=true\&characterEncoding=UTF-8\&zeroDateTimeBehavior=convertToNull\&useSSL=false|' $PROPS
sed -i 's|jdbc.username=.*|jdbc.username=admin|' $PROPS
sed -i 's|jdbc.password=.*|jdbc.password=admin123|' $PROPS
sed -i 's|memcached.active.host=.*|memcached.active.host=mc01.vprofile.internal|' $PROPS
sed -i 's|memcached.active.port=.*|memcached.active.port=11211|' $PROPS
sed -i 's|rabbitmq.address=.*|rabbitmq.address=rmq01.vprofile.internal|' $PROPS
sed -i 's|rabbitmq.username=.*|rabbitmq.username=test|' $PROPS
sed -i 's|rabbitmq.password=.*|rabbitmq.password=test|' $PROPS

# Build
mvn package -DskipTests -B

# Deploy
rm -rf /opt/tomcat/webapps/ROOT*
cp target/vprofile-v2.war /opt/tomcat/webapps/ROOT.war
chown tomcat:tomcat /opt/tomcat/webapps/ROOT.war

systemctl start tomcat
touch /var/log/userdata-complete
```

Launch ở **private subnet** với `APP_SG`:

```bash
APP_ID=$(aws ec2 run-instances \
    --image-id $AMI_ID \
    --instance-type t3.small \
    --key-name vprofile-key \
    --subnet-id $PRIV_A \
    --security-group-ids $APP_SG \
    --user-data file://scripts/app01-userdata.sh \
    --iam-instance-profile Name=ec2-vprofile-role \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=app01},{Key=Role,Value=app}]' \
    --query 'Instances[0].InstanceId' --output text)
```

## IAM Instance Profile

EC2 cần permission để pull artifact, write log → IAM role:

```bash
# Create role
aws iam create-role --role-name ec2-vprofile-role \
    --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "ec2.amazonaws.com"},
            "Action": "sts:AssumeRole"
        }]
    }'

# Attach policies
aws iam attach-role-policy --role-name ec2-vprofile-role \
    --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy

aws iam attach-role-policy --role-name ec2-vprofile-role \
    --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

# Create instance profile
aws iam create-instance-profile --instance-profile-name ec2-vprofile-role
aws iam add-role-to-instance-profile \
    --instance-profile-name ec2-vprofile-role \
    --role-name ec2-vprofile-role
```

`AmazonSSMManagedInstanceCore` = cho phép SSM Session Manager — không cần bastion.

## EC2 launch — web01 (nginx reverse proxy)

`scripts/web01-userdata.sh`:

```bash
#!/bin/bash
exec > >(tee /var/log/user-data.log) 2>&1
set -euxo pipefail

dnf update -y
dnf install -y nginx

# Custom nginx config
cat > /etc/nginx/conf.d/vprofile.conf <<'EOF'
upstream tomcat {
    server app01.vprofile.internal:8080 max_fails=3 fail_timeout=30s;
}

server {
    listen 80 default_server;
    server_name _;

    access_log /var/log/nginx/vprofile-access.log;
    error_log /var/log/nginx/vprofile-error.log;

    # Health check endpoint cho ALB
    location /health {
        return 200 'ok';
        add_header Content-Type text/plain;
    }

    location / {
        proxy_pass http://tomcat;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# Remove default
rm -f /etc/nginx/conf.d/default.conf

# Test + start
nginx -t
systemctl enable --now nginx

touch /var/log/userdata-complete
```

Web01 ở **public subnet** vì ALB sẽ forward đến nó (hoặc đặt public + behind ALB):

```bash
WEB_ID=$(aws ec2 run-instances \
    --image-id $AMI_ID \
    --instance-type t3.micro \
    --key-name vprofile-key \
    --subnet-id $PUB_A \
    --security-group-ids $ELB_SG \
    --user-data file://scripts/web01-userdata.sh \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=web01},{Key=Role,Value=web}]' \
    --query 'Instances[0].InstanceId' --output text)
```

## Update Route 53 records

Sau khi mọi EC2 running, get IP và update DNS:

```bash
# Get private IPs
get_ip() {
    aws ec2 describe-instances --instance-ids $1 \
        --query 'Reservations[0].Instances[0].PrivateIpAddress' --output text
}

DB_IP=$(get_ip $DB_ID)
MC_IP=$(get_ip $MC_ID)
RMQ_IP=$(get_ip $RMQ_ID)
APP_IP=$(get_ip $APP_ID)
WEB_IP=$(get_ip $WEB_ID)

# Update Route 53
update_record() {
    local name=$1
    local ip=$2
    aws route53 change-resource-record-sets --hosted-zone-id $ZONE_ID --change-batch "{
        \"Changes\": [{
            \"Action\": \"UPSERT\",
            \"ResourceRecordSet\": {
                \"Name\": \"$name.vprofile.internal\",
                \"Type\": \"A\",
                \"TTL\": 60,
                \"ResourceRecords\": [{\"Value\": \"$ip\"}]
            }
        }]
    }"
}

update_record db01 $DB_IP
update_record mc01 $MC_IP
update_record rmq01 $RMQ_IP
update_record app01 $APP_IP
update_record web01 $WEB_IP
```

## Verify user data success

```bash
# SSH via SSM
aws ssm start-session --target $APP_ID

# Trong instance:
sudo cat /var/log/user-data.log | tail -50
ls /var/log/userdata-complete   # Should exist
systemctl status tomcat
curl http://localhost:8080
```

Nếu fail:
- Check user data syntax: `bash -n scripts/app01-userdata.sh`.
- Check log: `/var/log/cloud-init-output.log`.
- Verify IAM role có permission.

## Cost estimation EC2 tier

| Instance | Type | $/hour | $/month (730h) |
|---|---|---|---|
| db01 | t3.micro | $0.0104 | $7.6 |
| mc01 | t3.micro | $0.0104 | $7.6 |
| rmq01 | t3.micro | $0.0104 | $7.6 |
| app01 | t3.small | $0.0208 | $15.2 |
| web01 | t3.micro | $0.0104 | $7.6 |
| **Total compute** | | | **~$46** |
| EBS gp3 (20GB × 5) | | | $8 |
| NAT GW | | | $32 |
| ALB | | | $20 |
| Data transfer | | | $5-20 |
| **Grand total** | | | **~$120-150/month** |

So với on-prem self-host: $0 marginal nhưng phải tự quản hardware.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| User data quá dài (16KB limit) | Truncate, fail | Upload script S3 + curl |
| User data lỗi syntax | EC2 boot OK nhưng service fail | Local validate `bash -n` |
| Quên `set -e` | Fail silent | `set -euxo pipefail` |
| AMI Amazon Linux 2 vs 2023 | Package name khác | Pin AMI ID hoặc test trước |
| EBS Delete on termination off | Orphan volume bill | Default tick "delete on termination" |
| Quên IAM role | SSM/CloudWatch fail | Attach instance profile |
| Hardcode credential trong user data | Lộ qua metadata | Use Secrets Manager |
| Quên `chmod 400` key | SSH fail | Mandatory chmod |

## Tóm tắt bài 3

- 5 EC2: db01 + mc01 + rmq01 (private, backend SG), app01 (private, app SG), web01 (public, elb SG).
- **User data script** auto-setup mỗi service khi launch.
- **Route 53 private zone** = DNS internal (db01.vprofile.internal).
- **IAM instance profile** cho phép EC2 dùng SSM, CloudWatch.
- **IMDSv2** required (`HttpTokens=required`) — security.
- **SSM Session Manager** thay bastion — không cần SSH key public.
- Cost ~$46/month compute + $100 infra (NAT + ALB).

**Bài kế tiếp** → [Bài 4: ALB + Target Group + Route 53 public domain](04-alb-target-group.md)
