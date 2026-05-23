# Bài 9 (Optional): EC2 và Nginx web server

Bài này **không bắt buộc** cho Phase 6. Đây là demo về **EC2** — service nền tảng nhất của AWS. Có thời gian thì làm, không có thì skip thẳng Phase 6.

## EC2 là gì?

**EC2** (Elastic Compute Cloud) = **virtual server** thuê theo giờ. Đây là service đầu tiên của AWS (cùng S3, 2006). Hầu hết AWS service khác build trên EC2.

```text
Physical server (AWS data center)
└── Hypervisor
    ├── EC2 instance 1 (your VM)
    ├── EC2 instance 2 (someone else's VM)
    └── EC2 instance 3 (...)
```

→ Bạn có **VM riêng**, tự do install gì cũng được, full root access.

## So sánh EC2 vs S3 vs Container

| Service           | Use case                                          |
|-------------------|---------------------------------------------------|
| **S3**            | Object storage, static file                       |
| **EC2**           | Generic VM, install gì cũng được                  |
| **ECS / EKS**     | Container orchestration (Phase 6)                 |
| **Lambda**        | Serverless function, không quản VM                |

→ EC2 = max flexibility, max work to maintain. Đa số tổ chức chuyển sang ECS/Lambda cho app mới.

## Khi nào dùng EC2?

- Legacy app cần OS-level control.
- Long-running process, custom kernel.
- Game server, streaming.
- Dev/test environment.
- Self-host database (PostgreSQL, Elasticsearch...) nếu không dùng RDS.

## Tạo EC2 instance

1. Console → search `EC2` → **EC2 Dashboard**.
2. **Launch instance**.

### Step 1: Name + OS

```text
Name:        my-web-server
OS:          [Amazon Linux ▼]
AMI:         Amazon Linux 2023 (free tier eligible)
```

### Step 2: Instance type

```text
Instance type:   [t2.micro ▼]
                 ← Free tier eligible: 1 vCPU, 1 GB RAM
```

### Step 3: Key pair (SSH)

Cần để SSH vào server. Có 2 lựa chọn:

- **Existing key pair** — nếu đã có.
- **Create new** → đặt tên (vd `my-aws-key`) → download `.pem` file → lưu cẩn thận (chỉ download 1 lần).

> Khoá học không cần SSH (dùng EC2 Instance Connect từ browser). Bỏ qua key pair (chọn "Proceed without"), nhưng bạn sẽ không SSH được từ máy local.

### Step 4: Network settings

```text
☑ Allow SSH from anywhere       (port 22)
☑ Allow HTTPS from internet     (port 443)
☑ Allow HTTP from internet      (port 80)

Auto-assign public IP: [Enable ▼]
```

→ Network "Security Group" = firewall. Mở port nào cần expose.

### Step 5: Storage

```text
8 GB gp3 (free tier 30 GB total)
```

Default đủ dùng.

### Step 6: Launch

Click **Launch instance** → đợi 1-2 phút → instance status = "Running" + "2/2 checks passed".

## Connect vào instance

1. Chọn instance → **Connect** (button trên cùng).
2. Tab **EC2 Instance Connect** → user mặc định `ec2-user` (Amazon Linux) hoặc `ubuntu` (Ubuntu).
3. Click **Connect** → mở terminal trong browser.

```text
   ,     #_
   ~\_  ####_        Amazon Linux 2023
  ~~  \_#####\
  ~~     \###|
  ~~       \#/ ___
   ~~       V~' '->
    ~~~         /
      ~~._.   _/
         _/ _/
       _/m/'

[ec2-user@ip-172-31-xx-xx ~]$
```

→ Terminal trong browser. Gõ command bình thường.

## Install Nginx

Nginx = web server phổ biến.

```bash
# Update package list (chỉ chạy đầu tiên)
sudo dnf update -y

# Install Nginx
sudo dnf install -y nginx

# Start service
sudo systemctl start nginx

# Enable auto-start on boot
sudo systemctl enable nginx

# Verify
sudo systemctl status nginx
# active (running) ← muốn thấy
```

`dnf` = package manager mới của Amazon Linux/Fedora (successor của `yum`).

## Truy cập website

1. Quay lại EC2 console → tab Instance.
2. Tìm **Public IPv4 address** (vd `54.123.45.67`).
3. Mở browser: `http://54.123.45.67`.

→ Thấy **Welcome to nginx!** default page. ✅

> Browser có thể default HTTPS → fail vì chưa cài SSL. Force `http://` (chú ý `http`, không `https`).

## Deploy file riêng

Default page Nginx ở `/usr/share/nginx/html/index.html`. Override:

```bash
# Trong SSH
sudo bash -c 'echo "<h1>Hello from EC2 + Nginx</h1>" > /usr/share/nginx/html/index.html'
```

→ Refresh browser → thấy text mới.

→ Đây là cách dev/staging server cá nhân setup. Không recommended cho production (manual, no CI).

## Tích hợp với Jenkins (sketch)

Để Jenkins deploy lên EC2:

```groovy
stage('Deploy to EC2') {
    steps {
        sshagent(credentials: ['ec2-ssh-key']) {
            sh '''
                scp -o StrictHostKeyChecking=no -r build/ ec2-user@$EC2_HOST:/tmp/build
                ssh ec2-user@$EC2_HOST "sudo cp -r /tmp/build/* /usr/share/nginx/html/"
            '''
        }
    }
}
```

→ Dùng `sshagent` plugin + private key trong Jenkins Credentials. SCP file lên + SSH chạy lệnh copy.

→ Setup phức tạp hơn S3 nhiều. **Không recommend** cho khoá học — Phase 6 dùng container tốt hơn.

## Cost

EC2 t2.micro free tier: **750 giờ/tháng đầu năm**. Sau đó ~$8/tháng nếu chạy 24/7.

→ **Quan trọng**: tắt khi không dùng.

## Stop vs Terminate

EC2 instance có 2 cách "tắt":

| Action          | Effect                                                  |
|-----------------|---------------------------------------------------------|
| **Stop**        | Như shutdown computer. EBS volume vẫn còn, data giữ. Có thể start lại. **Vẫn tính tiền storage** nhưng không tính compute. |
| **Terminate**   | Xoá vĩnh viễn. EBS volume xoá theo (nếu set delete-on-terminate). **Không recover**. Không tính tiền nữa. |

### Khi nào dùng cái nào?

- Tắt qua đêm để tiết kiệm → **Stop**.
- Xong project → **Terminate**.

### Stop instance

EC2 console → chọn instance → **Instance state** → **Stop instance**.

### Terminate instance

→ **Instance state** → **Terminate instance** → confirm.

> Khi terminate, kiểm tra cả **Elastic IP** (nếu có) → cũng tính tiền nếu giữ không gắn instance. Vào **Network & Security → Elastic IPs** → Release.

## Cleanup cuối bài

Để tránh tốn tiền:

```text
1. Terminate EC2 instance
2. Release Elastic IP (nếu có)
3. Xoá EBS volume orphan (nếu có)
4. Xoá Security Group custom (nếu có)
```

→ EC2 console → check từng menu trên không còn entry.

## Pitfall

### Pitfall 1: SSH bị refuse

```text
Connection refused on port 22
```

→ Check Security Group allow port 22 + Source `0.0.0.0/0` (anywhere).

### Pitfall 2: HTTPS hiện trong browser

Browser tự thêm `s`. Force `http://54.123.45.67`.

### Pitfall 3: Quên terminate

1 tháng sau check billing → thấy charge $8 cho EC2. Terminate ngay.

### Pitfall 4: Lost SSH key

`.pem` file chỉ download 1 lần. Mất → không SSH vào được instance được. Phải terminate, tạo mới.

## Tóm tắt

- **EC2** = VM thuê theo giờ. Most flexible AWS service.
- Tạo qua wizard 6 step, ~2 phút.
- Connect qua **EC2 Instance Connect** (browser) hoặc SSH key.
- Cài Nginx qua `dnf install nginx` + `systemctl start nginx`.
- Truy cập qua Public IP HTTP.
- **Stop** = pause, vẫn tính storage. **Terminate** = xoá vĩnh viễn.
- Quên cleanup = trả tiền. Set Billing Alert.
- Cho khoá học: dùng để hiểu concept VM. Production deploy app → dùng ECS (Phase 6) tốt hơn.

---

→ [Phase 6: Deploy container lên AWS ECS](../phase-6-deploy-len-aws-ecs/01-ecs-tong-quan.md)
