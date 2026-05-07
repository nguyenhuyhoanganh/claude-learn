# Bài 6: Deploy lên nhiều cụm máy chủ riêng

## Bối cảnh thực tế

Trong môi trường doanh nghiệp (như Samsung), hạ tầng thường gồm nhiều cụm máy chủ vật lý hoặc on-premise — không phải cloud công cộng. Các máy chủ này:

- Nằm trong **mạng nội bộ** (không expose ra internet)
- Chia thành các **cụm theo môi trường** (dev cluster, staging cluster, production cluster)
- Mỗi cụm có thể có **nhiều nodes** cần deploy đồng thời
- Yêu cầu xác thực qua **SSH key** hoặc qua **bastion host**

GitHub-hosted runners (ubuntu-latest) **không thể trực tiếp kết nối** đến máy chủ nội bộ. Có hai hướng giải quyết:

---

## Hướng 1: Self-hosted Runner chạy trong mạng nội bộ

Runner cài trực tiếp trên một máy trong cùng mạng — máy này có thể reach đến toàn bộ cluster.

```
GitHub ──(HTTPS outbound)──► Self-hosted Runner (mạng nội bộ)
                                       │
                              ┌────────┼────────┐
                           node-1   node-2   node-3
```

Thiết lập runner (trên máy nội bộ):
1. Vào **Settings → Actions → Runners → New self-hosted runner**
2. Chọn OS → chạy lệnh GitHub cung cấp để cài `actions-runner`
3. Runner kết nối ra GitHub qua **HTTPS outbound** (không cần mở port inbound)

```yaml
jobs:
  deploy:
    runs-on: self-hosted        # ← dùng runner nội bộ
    steps:
      - run: ssh node-1 "systemctl restart myapp"   # reach được vì cùng mạng
```

**Ưu điểm:** Đơn giản, runner đã có quyền truy cập mọi thứ trong mạng nội bộ.  
**Nhược điểm:** Máy chạy runner phải luôn online, cần maintain thêm một máy.

---

## Hướng 2: GitHub Runner → SSH qua Bastion Host

Bastion host (jump host) là máy duy nhất expose ra internet, làm cầu nối vào mạng nội bộ:

```
GitHub Runner ──(SSH)──► Bastion Host ──(SSH)──► node-1, node-2, node-3
             (internet)   (expose port 22)         (mạng nội bộ)
```

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via bastion
        env:
          BASTION_HOST: ${{ secrets.BASTION_HOST }}
          BASTION_USER: ${{ secrets.BASTION_USER }}
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
        run: |
          # Ghi SSH key ra file tạm
          echo "$SSH_PRIVATE_KEY" > /tmp/deploy_key
          chmod 600 /tmp/deploy_key
          
          # SSH qua bastion đến node đích
          ssh -i /tmp/deploy_key \
              -o StrictHostKeyChecking=no \
              -o ProxyJump=$BASTION_USER@$BASTION_HOST \
              deploy@node-1.internal \
              "cd /app && git pull && systemctl restart myapp"
          
          rm /tmp/deploy_key
```

---

## Deploy đến nhiều nodes — Matrix + SSH

Cách scalable để deploy song song đến nhiều nodes:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node:
          - { host: "10.0.1.11", name: "node-1" }
          - { host: "10.0.1.12", name: "node-2" }
          - { host: "10.0.1.13", name: "node-3" }
      fail-fast: false           # ← node này fail không cancel node khác

    steps:
      - name: Deploy to ${{ matrix.node.name }}
        uses: appleboy/ssh-action@v1.0.0      # ← action SSH phổ biến
        with:
          host: ${{ matrix.node.host }}
          username: deploy
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          proxy_host: ${{ secrets.BASTION_HOST }}   # ← jump qua bastion
          proxy_username: ${{ secrets.BASTION_USER }}
          proxy_key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            set -e
            cd /srv/myapp
            git fetch origin
            git checkout ${{ github.sha }}
            npm ci --production
            systemctl restart myapp
            systemctl is-active myapp   # ← verify sau khi restart
```

`appleboy/ssh-action` là action cộng đồng phổ biến, hỗ trợ ProxyJump (bastion), multiple hosts, và script execution.

---

## Deploy nhiều cụm theo môi trường

Lưu cấu hình cluster dưới dạng JSON trong secrets:

```json
// Secret STAGING_CLUSTER (dạng JSON string)
{
  "bastion": "bastion-staging.internal.company.com",
  "nodes": ["10.1.0.11", "10.1.0.12"],
  "app_dir": "/srv/staging/myapp"
}
```

```yaml
jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      nodes: ${{ steps.parse.outputs.nodes }}
      bastion: ${{ steps.parse.outputs.bastion }}
    steps:
      - id: parse
        env:
          CLUSTER_CONFIG: ${{ secrets.STAGING_CLUSTER }}
        run: |
          echo "nodes=$(echo $CLUSTER_CONFIG | jq -c '.nodes')" >> $GITHUB_OUTPUT
          echo "bastion=$(echo $CLUSTER_CONFIG | jq -r '.bastion')" >> $GITHUB_OUTPUT

  deploy:
    needs: prepare
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: ${{ fromJSON(needs.prepare.outputs.nodes) }}
    steps:
      - uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ matrix.node }}
          username: deploy
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          proxy_host: ${{ needs.prepare.outputs.bastion }}
          proxy_username: bastion-user
          proxy_key: ${{ secrets.BASTION_SSH_KEY }}
          script: ./deploy.sh
```

---

## Rolling Deploy — Không downtime

Khi deploy lên nhiều nodes, không deploy tất cả cùng lúc — lần lượt từng node để luôn có node đang serve:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    # KHÔNG dùng matrix — cần sequential, không parallel
    steps:
      - name: Deploy node-1
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.NODE_1 }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            # Drain khỏi load balancer
            curl -X POST http://lb.internal/drain/node-1
            sleep 10
            
            # Deploy
            cd /srv/myapp && git pull && systemctl restart myapp
            
            # Verify healthy
            curl --retry 5 --retry-delay 3 http://node-1.internal/health
            
            # Đưa lại vào load balancer
            curl -X POST http://lb.internal/activate/node-1

      - name: Deploy node-2
        # tương tự...
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.NODE_2 }}
          ...
```

Nếu node-1 deploy fail (health check không pass), `set -e` sẽ khiến step fail → node-2 không deploy → chỉ một node bị ảnh hưởng.

---

## SSH Key Management — Best Practices

### Tạo deploy key riêng (không dùng personal key)

```bash
# Tạo key mới chỉ dùng cho CI/CD
ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key -N ""

# Thêm public key vào máy chủ
ssh-copy-id -i deploy_key.pub deploy@node-1.internal

# Lưu private key vào GitHub Secret
cat deploy_key   # → copy vào secret SSH_PRIVATE_KEY
```

### Giới hạn quyền của deploy key

Trên server, trong `~/.ssh/authorized_keys` có thể giới hạn lệnh được phép:

```
command="/srv/scripts/deploy.sh",no-port-forwarding,no-x11-forwarding ssh-ed25519 AAAA...
```

Deploy key chỉ được phép chạy script `deploy.sh`, không thể làm gì khác dù key bị lộ.

### Rotate key định kỳ

Đặt lịch reminder hoặc workflow tự động check expiry của keys.

---

## Kiểm tra trạng thái sau deploy

```yaml
- name: Verify deployment
  uses: appleboy/ssh-action@v1.0.0
  with:
    host: ${{ secrets.NODE_1 }}
    key: ${{ secrets.SSH_KEY }}
    script: |
      # Check service running
      systemctl is-active --quiet myapp || exit 1
      
      # Check HTTP response
      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health)
      [ "$HTTP_CODE" = "200" ] || exit 1
      
      # Check version deployed đúng
      DEPLOYED_SHA=$(cat /srv/myapp/.deployed-sha)
      [ "$DEPLOYED_SHA" = "${{ github.sha }}" ] || exit 1
      
      echo "✓ Node healthy, SHA matches"
```

---

## Sơ đồ tổng hợp

```
GitHub Actions
     │
     │ HTTPS (outbound)
     ▼
┌─────────────────────────────────────────────┐
│              MẠNG NỘI BỘ                    │
│                                             │
│  Bastion Host ──────────────────────────    │
│       │                                │    │
│       ├──SSH──► Dev Cluster            │    │
│       │         node-1, node-2         │    │
│       │                                │    │
│       ├──SSH──► Staging Cluster        │    │
│       │         node-1, node-2, node-3 │    │
│       │                                │    │
│       └──SSH──► Production Cluster     │    │
│                 node-1 ... node-10     │    │
└─────────────────────────────────────────────┘
```

Hoặc thay Bastion bằng **Self-hosted Runner** đặt trong mạng nội bộ — runner tự SSH đến các nodes mà không cần expose bất kỳ cổng nào ra ngoài.
