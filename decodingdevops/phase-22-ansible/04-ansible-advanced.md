# Bài 4: Ansible Vault, dynamic inventory, AWX/Tower

Bài cuối phase 22. Các tính năng nâng cao: quản lý secret, dynamic inventory cho cloud, GUI orchestration.

## Ansible Vault — Mã hoá secret

### Encrypt file

```bash
# Encrypt
ansible-vault encrypt group_vars/all/secrets.yml

# File plain → file đã encrypt (single password)
```

File trước khi encrypt:

```yaml
db_password: admin123
api_key: sk-xxx
```

Sau khi encrypt:

```
$ANSIBLE_VAULT;1.1;AES256
66303934633463323030...
```

→ Có thể commit lên Git an toàn vì nội dung đã encrypted.

### Decrypt + edit

```bash
# Xem nội dung
ansible-vault view group_vars/all/secrets.yml

# Edit (mở editor, decrypt → edit → re-encrypt tự động)
ansible-vault edit group_vars/all/secrets.yml

# Decrypt về plain text (tránh dùng trong repo)
ansible-vault decrypt group_vars/all/secrets.yml

# Đổi password (rekey)
ansible-vault rekey group_vars/all/secrets.yml
```

### Chạy playbook với vault

```bash
# Prompt password lúc chạy
ansible-playbook site.yml --ask-vault-pass

# Dùng file chứa password
ansible-playbook site.yml --vault-password-file=~/.vault_pass

# Nhiều vault với ID khác nhau
ansible-playbook site.yml \
    --vault-id dev@dev_pass.txt \
    --vault-id prod@prod_pass.txt
```

### Vault IDs — Multi-environment

Encrypt với ID cụ thể (cho mỗi môi trường):

```bash
ansible-vault encrypt --vault-id prod@prompt secrets-prod.yml
ansible-vault encrypt --vault-id dev@prompt secrets-dev.yml
```

File header sẽ có:

```
$ANSIBLE_VAULT;1.2;AES256;prod
```

Khi chạy: cần pass password tương ứng với ID.

### Encrypt một giá trị duy nhất (inline)

```yaml
# Variable encrypted inline trong file plain
db_password: !vault |
  $ANSIBLE_VAULT;1.1;AES256
  663034343339623136...

api_key: !vault |
  $ANSIBLE_VAULT;1.1;AES256
  663532323836653964...
```

Tạo:

```bash
ansible-vault encrypt_string 'admin123' --name 'db_password'
```

Output paste vào playbook/vars file.

### Best practice với Vault

- Password file (`.vault_pass`) **tuyệt đối không commit** vào Git.
- Dùng password manager (1Password, LastPass) tích hợp với `ansible-vault`.
- Rotate password định kỳ.
- Mỗi environment có password riêng.
- Trong CI: dùng env variable `ANSIBLE_VAULT_PASSWORD_FILE`.

### Alternative: External Secret

```yaml
# Lookup từ external secret store
db_password: "{{ lookup('aws_secret', 'prod/db/password') }}"
db_password: "{{ lookup('hashi_vault', 'secret=secret/prod/db:password') }}"

# Lookup từ env variable
api_key: "{{ lookup('env', 'API_KEY') }}"
```

Ưu điểm so với Ansible Vault: không có file encrypted trong repo, rotate tập trung tại source secret.

## Dynamic inventory — Inventory tự động từ cloud

Static inventory (file ini):

```ini
[web]
web01 ansible_host=192.168.1.10
web02 ansible_host=192.168.1.11
```

Vấn đề: với cloud, IP thay đổi liên tục (instance bị terminate, spot, autoscaling). Dynamic inventory query trực tiếp cloud API để lấy danh sách host.

### AWS dynamic inventory

File `inventory.aws_ec2.yml`:

```yaml
plugin: amazon.aws.aws_ec2
regions:
  - us-east-1
  - us-west-2

# Group instance theo tag
keyed_groups:
  - prefix: tag
    key: tags
  - prefix: env
    key: tags.Environment
  - prefix: role
    key: tags.Role

# Filter chỉ lấy instance phù hợp
filters:
  tag:Project: vprofile
  instance-state-name: running

# Nguồn hostname
hostnames:
  - tag:Name
  - private-ip-address

# Set host variable
compose:
  ansible_host: private_ip_address
  ansible_user: 'ec2-user'
```

Cách dùng:

```bash
# Test (xem inventory được generate)
ansible-inventory -i inventory.aws_ec2.yml --list

# Run playbook
ansible-playbook -i inventory.aws_ec2.yml site.yml --limit role_web
```

Group được tự động tạo: `env_production`, `role_web`, `tag_Name_web01`, ...

### Plugin cần cài

```bash
ansible-galaxy collection install amazon.aws community.aws
pip install boto3 botocore
```

### Cloud khác

```bash
# GCP
plugin: google.cloud.gcp_compute

# Azure
plugin: azure.azcollection.azure_rm

# DigitalOcean
plugin: community.digitalocean.digitalocean

# Kubernetes
plugin: kubernetes.core.k8s
```

### Kết hợp static + dynamic

```bash
# Inventory đa nguồn
ansible-playbook \
    -i inventory/static.ini \
    -i inventory/aws_ec2.yml \
    site.yml
```

## Ansible Tower / AWX — GUI orchestration

GUI để chạy playbook + RBAC + audit + schedule.

### Cài AWX (bản open-source của Tower)

Dùng AWX Operator trên K8s:

```bash
helm repo add awx-operator https://ansible.github.io/awx-operator/
helm install -n awx --create-namespace awx-operator awx-operator/awx-operator
```

Browser → AWX UI bao gồm:
- **Projects**: Git repo chứa code Ansible.
- **Inventories**: hosts + groups.
- **Credentials**: SSH key, vault password, cloud credentials.
- **Job Templates**: playbook + inventory + credential + extra vars.
- **Schedules**: trigger theo lịch (như cron).
- **Workflows**: nối nhiều template theo DAG (directed acyclic graph).
- **Surveys**: prompt user nhập input lúc chạy.
- **Notifications**: Slack, email, webhook.

### Use case

- **Self-service deploy**: dev click button → AWX chạy deploy playbook.
- **Scheduled**: backup hằng đêm lúc 2h sáng.
- **Audit**: ai chạy gì, khi nào, output lưu lại.
- **RBAC**: team chỉ thấy resource của mình.
- **Approval**: yêu cầu manager duyệt trước khi chạy.

### Tower vs AWX

- **Tower**: bản commercial của RedHat, có paid support.
- **AWX**: open source, không có support.

Tính năng tương tự, lựa chọn dựa vào nhu cầu tổ chức.

## Ansible Pull (đối lập với Push)

Mặc định = push (Ansible chạy từ controller đẩy lên target). Đôi khi cần pull (server tự fetch + chạy local):

```bash
# Trên managed host
ansible-pull -U https://github.com/acme/ansible-config.git \
             -i localhost,
             -e env=prod \
             playbooks/site.yml
```

Use case:
- **Disposable infrastructure**: cloud-init chạy ansible-pull khi instance boot.
- Không có central controller (vd: edge nodes).
- Node tự converge config.

## Performance optimization (Tối ưu hiệu năng)

### Forks (Chạy song song)

```ini
# ansible.cfg
forks = 100
```

Số host xử lý song song. Mặc định chỉ 5 — quá thấp cho fleet lớn.

### Pipelining (Giảm SSH overhead)

```ini
[ssh_connection]
pipelining = True
```

Giảm số kết nối SSH mỗi task → nhanh 2-4 lần.

### Async tasks (Task chạy bất đồng bộ)

```yaml
- name: Long task
  command: /opt/build.sh
  async: 3600          # Max 1 giờ
  poll: 0              # Không đợi

- name: Check
  async_status:
    jid: "{{ ansible_job_id }}"
  register: result
  until: result.finished
  retries: 60
  delay: 60
```

Hữu ích cho task chạy lâu — không block playbook chính.

### Fact caching (Cache thông tin host)

```ini
[defaults]
gather_facts = smart
fact_caching = jsonfile
fact_caching_connection = /tmp/ansible-facts
fact_caching_timeout = 86400
```

Skip gather_facts nếu đã cache → tiết kiệm 10-30s mỗi host.

### Strategy (Chiến lược chạy task)

```yaml
- hosts: all
  strategy: free      # Mỗi host chạy độc lập (mặc định 'linear')
  tasks: ...
```

`free` strategy: host nhanh chạy trước, không đợi host chậm.

## Idempotency check (Kiểm tra idempotency)

Re-run playbook → output phải hiện `changed=0`:

```bash
ansible-playbook site.yml --check --diff
# Dry run: xem sẽ thay đổi gì
```

Test idempotency:

```bash
ansible-playbook site.yml
# Lần 1: changed=5

ansible-playbook site.yml
# Lần 2: changed=0 ← Idempotent ✅
```

Nếu lần 2 vẫn có `changed` → có task không idempotent → cần fix (vd: dùng `creates` cho command, dùng module `file` thay vì `shell mkdir`).

## Best practices summary

| Category | Practice |
|---|---|
| **Structure** | Role-based, tách concern rõ ràng |
| **Variables** | Default sensible, override per environment |
| **Secrets** | Ansible Vault hoặc external (Vault, Secrets Manager) |
| **Inventory** | Dynamic cho cloud, static cho legacy |
| **Testing** | Molecule + `--check --diff` |
| **Lint** | `ansible-lint` strict mode |
| **CI/CD** | Playbook in repo, validate trong PR |
| **Audit** | AWX/Tower hoặc logging tập trung |
| **Performance** | Forks 50+, pipelining, fact cache |
| **Documentation** | README cho mỗi role, kèm example |

## CI cho Ansible

```yaml
name: Ansible

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - run: pip install ansible ansible-lint molecule molecule-plugins[docker]

      - run: ansible-galaxy install -r requirements.yml

      - run: ansible-lint

      - run: ansible-playbook --syntax-check site.yml

      - name: Check mode (dry run)
        run: |
          ansible-playbook --check --diff \
              -i inventory/dev.aws_ec2.yml \
              site.yml
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

  molecule:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        role: [nginx, mariadb, tomcat]
    steps:
      - uses: actions/checkout@v4
      - run: pip install molecule molecule-plugins[docker]
      - run: cd roles/${{ matrix.role }} && molecule test

  deploy:
    needs: [lint, molecule]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: pip install ansible

      - run: ansible-playbook -i inventory site.yml
        env:
          ANSIBLE_VAULT_PASSWORD_FILE: /tmp/vault_pass
        # ANSIBLE_VAULT_PASSWORD set in secret
```

## Tổng kết phase 22

4 bài cover:
1. Ansible basics + inventory + playbook + module.
2. Playbook deep: conditional, loop, handler, block, tag.
3. Roles + Galaxy + Collections + Molecule.
4. Vault + dynamic inventory + AWX/Tower + performance.

Skill đạt được:
- Viết playbook + role idempotent production-grade.
- Module ecosystem 3000+ công cụ.
- Quản lý secret.
- Dynamic inventory cho cloud.
- GUI orchestration với AWX.

## Tóm tắt bài 4

- **Ansible Vault** encrypt secret file/string trực tiếp trong repo.
- **External secrets**: AWS Secrets Manager, Vault lookup — alternative tốt hơn cho production.
- **Dynamic inventory** query cloud API (AWS, GCP, Azure, K8s).
- **Tag + filter** trong inventory plugin → tự động group host.
- **AWX/Tower** GUI orchestration với RBAC + audit + schedule.
- **Performance**: forks, pipelining, fact cache, async.
- CI: lint + molecule + check mode + apply.

**Phase kế tiếp** → [Phase 23 — Monitoring](../phase-23-monitoring/01-monitoring-basics.md)
