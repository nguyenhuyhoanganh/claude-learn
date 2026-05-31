# Bài 4: Ansible Vault, dynamic inventory, AWX/Tower

Bài cuối phase 22. Advanced features: secret management, dynamic inventory cloud, GUI orchestration.

## Ansible Vault — encrypt secret

### Encrypt file

```bash
# Encrypt
ansible-vault encrypt group_vars/all/secrets.yml

# Plain file → encrypted (single password)
```

File trước:

```yaml
db_password: admin123
api_key: sk-xxx
```

Sau encrypt:

```
$ANSIBLE_VAULT;1.1;AES256
66303934633463323030...
```

### Decrypt + edit

```bash
# View
ansible-vault view group_vars/all/secrets.yml

# Edit (open editor, decrypt → edit → re-encrypt)
ansible-vault edit group_vars/all/secrets.yml

# Decrypt back to plain (avoid in repo)
ansible-vault decrypt group_vars/all/secrets.yml

# Rekey (change password)
ansible-vault rekey group_vars/all/secrets.yml
```

### Run với vault

```bash
# Prompt password
ansible-playbook site.yml --ask-vault-pass

# Password file
ansible-playbook site.yml --vault-password-file=~/.vault_pass

# Multiple vaults với ID
ansible-playbook site.yml \
    --vault-id dev@dev_pass.txt \
    --vault-id prod@prod_pass.txt
```

### Vault IDs — multi-environment

Encrypt với specific ID:

```bash
ansible-vault encrypt --vault-id prod@prompt secrets-prod.yml
ansible-vault encrypt --vault-id dev@prompt secrets-dev.yml
```

File header:

```
$ANSIBLE_VAULT;1.2;AES256;prod
```

Khi run: pass appropriate ID password.

### Encrypt single value

```yaml
# Inline encrypted variable
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

Output paste vào playbook/vars.

### Best practice với Vault

- Password file (`.vault_pass`) **không commit**.
- Use **pass manager** (1Password, LastPass) integrated với `ansible-vault`.
- Rotate password periodically.
- Different password per environment.
- CI: env variable `ANSIBLE_VAULT_PASSWORD_FILE`.

### Alternative: External Secret

```yaml
# Lookup external
db_password: "{{ lookup('aws_secret', 'prod/db/password') }}"
db_password: "{{ lookup('hashi_vault', 'secret=secret/prod/db:password') }}"

# Lookup environment
api_key: "{{ lookup('env', 'API_KEY') }}"
```

Pros: no encrypted file in repo, central rotation.

## Dynamic inventory

Static inventory:

```ini
[web]
web01 ansible_host=192.168.1.10
web02 ansible_host=192.168.1.11
```

Issue: cloud → IP đổi liên tục. Dynamic inventory query API.

### AWS dynamic inventory

`inventory.aws_ec2.yml`:

```yaml
plugin: amazon.aws.aws_ec2
regions:
  - us-east-1
  - us-west-2

# Group instances by tag
keyed_groups:
  - prefix: tag
    key: tags
  - prefix: env
    key: tags.Environment
  - prefix: role
    key: tags.Role

# Filter
filters:
  tag:Project: vprofile
  instance-state-name: running

# Hostname source
hostnames:
  - tag:Name
  - private-ip-address

# Set host variable
compose:
  ansible_host: private_ip_address
  ansible_user: 'ec2-user'
```

Use:

```bash
# Test
ansible-inventory -i inventory.aws_ec2.yml --list

# Run
ansible-playbook -i inventory.aws_ec2.yml site.yml --limit role_web
```

Groups auto-generate: `env_production`, `role_web`, `tag_Name_web01`, ...

### Required plugins

```bash
ansible-galaxy collection install amazon.aws community.aws
pip install boto3 botocore
```

### Other cloud

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

### Static + dynamic combined

```bash
# Multi-source inventory
ansible-playbook \
    -i inventory/static.ini \
    -i inventory/aws_ec2.yml \
    site.yml
```

## Ansible Tower / AWX

GUI để run playbook + RBAC + audit + scheduled.

### Install AWX (open source Tower)

Use AWX Operator on K8s:

```bash
helm repo add awx-operator https://ansible.github.io/awx-operator/
helm install -n awx --create-namespace awx-operator awx-operator/awx-operator
```

Browser → AWX UI:
- Projects: Git repo Ansible code.
- Inventories: hosts + groups.
- Credentials: SSH key, vault password, cloud credentials.
- Job Templates: playbook + inventory + credential + extra vars.
- Schedules: cron-like trigger.
- Workflows: chain templates DAG.
- Surveys: prompt user input.
- Notifications: Slack, email, webhook.

### Use case

- Self-service deploy: dev click button → AWX run deploy playbook.
- Scheduled: nightly backup at 2am.
- Audit: who ran what when, output saved.
- RBAC: team only see their resource.
- Approval: require manager approve before run.

### Tower vs AWX

- **Tower**: commercial RedHat, paid support.
- **AWX**: open source, no support.

Similar feature, choose based on org.

## Ansible Pull (vs Push)

Default = push (Ansible from controller). Sometimes need pull (server fetch + run locally):

```bash
# On managed host
ansible-pull -U https://github.com/acme/ansible-config.git \
             -i localhost,
             -e env=prod \
             playbooks/site.yml
```

Use case:
- Disposable infrastructure (cloud-init runs ansible-pull).
- No central controller.
- Self-converge nodes.

## Performance optimization

### Forks

```ini
# ansible.cfg
forks = 100
```

Parallel execution per host.

### Pipelining

```ini
[ssh_connection]
pipelining = True
```

Reduce SSH connection per task → 2-4x faster.

### Async tasks

```yaml
- name: Long task
  command: /opt/build.sh
  async: 3600          # Max 1 hour
  poll: 0              # Don't wait

- name: Check
  async_status:
    jid: "{{ ansible_job_id }}"
  register: result
  until: result.finished
  retries: 60
  delay: 60
```

Useful cho long-running task không block playbook.

### Fact caching

```ini
[defaults]
gather_facts = smart
fact_caching = jsonfile
fact_caching_connection = /tmp/ansible-facts
fact_caching_timeout = 86400
```

Skip gather_facts nếu cached, save 10-30s/host.

### Strategy

```yaml
- hosts: all
  strategy: free      # Each host run independent (vs default 'linear')
  tasks: ...
```

`free` strategy: host nhanh chạy trước, không đợi.

## Idempotency check

Re-run playbook → output `changed=0`:

```bash
ansible-playbook site.yml --check --diff
# Dry run: see what would change
```

Test idempotency:

```bash
ansible-playbook site.yml
# First run: changed=5

ansible-playbook site.yml
# Second run: changed=0 ← Idempotent
```

If second run shows changed → fix tasks not idempotent.

## Best practices summary

| Category | Practice |
|---|---|
| Structure | Role-based, separate concern |
| Variables | Defaults sensible, override per env |
| Secrets | Ansible Vault hoặc external (Vault, Secrets Manager) |
| Inventory | Dynamic cho cloud, static cho legacy |
| Testing | Molecule + `--check --diff` |
| Lint | `ansible-lint` strict |
| CI/CD | Playbook in repo, validate PR |
| Audit | AWX/Tower hoặc logging |
| Performance | Forks 50+, pipelining, fact cache |
| Documentation | README per role, examples |

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

      - name: Check mode
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
2. Playbook deep: conditionals, loops, handlers, blocks, tags.
3. Roles + Galaxy + Collections + Molecule.
4. Vault + dynamic inventory + AWX/Tower + performance.

Skills:
- Viết playbook + role idempotent production-grade.
- Module ecosystem 3000+ tools.
- Secret management.
- Dynamic inventory cloud.
- GUI orchestration với AWX.

## Tóm tắt bài 4

- **Ansible Vault** encrypt secret file/string in repo.
- **External secrets**: AWS Secrets Manager, Vault lookup.
- **Dynamic inventory** query cloud API (AWS, GCP, Azure, K8s).
- **Tags + filter** trong inventory plugin → auto group.
- **AWX/Tower** GUI orchestration với RBAC + audit + schedule.
- **Performance**: forks, pipelining, fact cache, async.
- CI: lint + molecule + check mode + apply.

**Phase kế tiếp** → [Phase 23 — Monitoring](../phase-23-monitoring/01-monitoring-basics.md)
