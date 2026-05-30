# Bài 1: Ansible — configuration management agentless

Terraform tạo server. **Ansible** cấu hình app/service bên trong. Cùng nhau = bộ đôi DevOps modern.

## Ansible là gì?

> **Ansible** = tool **agentless** automation: cài app, config service, deploy code lên server qua SSH.

Đặc điểm:
- **Agentless** — không cần cài agent target server (chỉ SSH).
- **YAML playbook** — declarative, dễ đọc.
- **Idempotent** — chạy lại nhiều lần kết quả giống nhau.
- **Module ecosystem** — 3000+ module sẵn.
- Python-based (host management agent ad-hoc).

## So với Bash + SSH

Bash + SSH (phase 11):

```bash
for srv in web01 web02; do
    ssh $srv "apt install -y nginx"
    ssh $srv "systemctl enable --now nginx"
done
```

Vấn đề:
- Không idempotent — chạy 2 lần báo lỗi nếu đã cài.
- Không track success/fail.
- Không retry.
- Sai version Linux → command fail.

Ansible:

```yaml
- hosts: web
  tasks:
    - name: Install nginx
      apt:
        name: nginx
        state: present
    - name: Start nginx
      systemd:
        name: nginx
        state: started
        enabled: yes
```

- Idempotent built-in.
- Module `apt` work với Ubuntu, `yum` cho RHEL — Ansible chọn đúng.
- Output structured (changed / ok / failed per task).
- Parallel host built-in.

## Setup Ansible

```bash
# Ubuntu
sudo apt install -y ansible

# CentOS/RHEL
sudo dnf install -y epel-release
sudo dnf install -y ansible

# pipx (modern recommend)
pipx install ansible
pipx inject ansible boto3      # AWS modules

# Verify
ansible --version
# ansible [core 2.16.x]
```

## Components

| Term | Mô tả |
|---|---|
| **Control node** | Máy chạy Ansible (laptop, CI server) |
| **Managed node** | Server target (cần SSH + Python) |
| **Inventory** | List managed node |
| **Playbook** | YAML file mô tả task |
| **Task** | Single action (cài package, copy file) |
| **Module** | Tool thực thi task (apt, copy, template, ...) |
| **Role** | Reusable task group |
| **Collection** | Package nhiều role/module |

## Inventory

`inventory.ini`:

```ini
[web]
web01 ansible_host=192.168.56.11
web02 ansible_host=192.168.56.12

[db]
db01 ansible_host=192.168.56.15

[cache]
mc01 ansible_host=192.168.56.13

[all:vars]
ansible_user=ubuntu
ansible_ssh_private_key_file=~/.ssh/id_ed25519
```

Hoặc YAML:

```yaml
# inventory.yml
all:
  vars:
    ansible_user: ubuntu
  children:
    web:
      hosts:
        web01:
          ansible_host: 192.168.56.11
        web02:
          ansible_host: 192.168.56.12
    db:
      hosts:
        db01:
          ansible_host: 192.168.56.15
```

### Dynamic inventory

Cho cloud: AWS, GCP, Azure → auto-fetch instance list:

```yaml
# inventory.aws_ec2.yml
plugin: aws_ec2
regions:
  - us-east-1
keyed_groups:
  - key: tags.Role
    prefix: role
```

```bash
ansible-inventory -i inventory.aws_ec2.yml --list
```

## Ad-hoc command

Chạy 1 lệnh trên nhiều host:

```bash
# Ping
ansible all -i inventory.ini -m ping

# Run shell
ansible web -i inventory.ini -m shell -a "uptime"

# Install package
ansible web -i inventory.ini -m apt -a "name=nginx state=present" -b

# Copy file
ansible web -i inventory.ini -m copy -a "src=local.conf dest=/etc/app/" -b
```

`-b` = become (sudo). `-m` = module. `-a` = args.

## Playbook

```yaml
# webserver.yml
---
- name: Setup web server
  hosts: web
  become: yes              # Sudo

  vars:
    app_name: vprofile
    app_port: 8080

  tasks:
    - name: Update apt cache
      apt:
        update_cache: yes
        cache_valid_time: 3600

    - name: Install nginx
      apt:
        name: nginx
        state: present

    - name: Configure nginx
      template:
        src: nginx.conf.j2
        dest: /etc/nginx/sites-available/{{ app_name }}
        owner: root
        group: root
        mode: '0644'
      notify: reload nginx

    - name: Enable site
      file:
        src: /etc/nginx/sites-available/{{ app_name }}
        dest: /etc/nginx/sites-enabled/{{ app_name }}
        state: link
      notify: reload nginx

    - name: Start nginx
      systemd:
        name: nginx
        state: started
        enabled: yes

  handlers:
    - name: reload nginx
      systemd:
        name: nginx
        state: reloaded
```

```bash
ansible-playbook -i inventory.ini webserver.yml
```

### Anatomy

- `hosts:` → target group.
- `become: yes` → sudo.
- `vars:` → playbook-scope variables.
- `tasks:` → list of action.
- `handlers:` → run khi `notify` trigger.

## Modules — toolbox

Core module:

| Module | Mục đích |
|---|---|
| `apt` / `dnf` / `yum` | Install package |
| `service` / `systemd` | Manage service |
| `copy` | Copy file |
| `template` | Render Jinja2 template |
| `file` | Manage file/dir/symlink |
| `lineinfile` | Edit config line |
| `replace` | Regex replace |
| `user` / `group` | User management |
| `cron` | Crontab |
| `git` | Git clone/pull |
| `unarchive` | Extract zip/tar |
| `command` / `shell` | Run shell command |
| `uri` | HTTP API call |
| `wait_for` | Wait condition |
| `assert` | Validate |
| `debug` | Print var |

Cloud:
- `amazon.aws.ec2_instance`
- `community.aws.s3_object`
- `google.cloud.gcp_compute_instance`

## Variables

```yaml
# group_vars/web.yml
nginx_port: 80
nginx_user: www-data

# host_vars/web01.yml
ssl_cert: /etc/ssl/web01.crt
```

```yaml
# playbook
- name: Set port
  template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
  vars:
    custom_param: "value"
```

```jinja2
# nginx.conf.j2
listen {{ nginx_port }};
user {{ nginx_user }};

{% if ssl_cert is defined %}
ssl_certificate {{ ssl_cert }};
{% endif %}
```

Variable precedence (cao → thấp):
1. CLI `-e`
2. Task vars
3. Playbook vars
4. host_vars
5. group_vars
6. Defaults

## Loops

```yaml
- name: Install packages
  apt:
    name: "{{ item }}"
    state: present
  loop:
    - nginx
    - mariadb-server
    - php

- name: Create users
  user:
    name: "{{ item.name }}"
    groups: "{{ item.groups }}"
  loop:
    - { name: alice, groups: 'wheel' }
    - { name: bob,   groups: 'docker' }
```

## Conditions

```yaml
- name: Install on Ubuntu
  apt:
    name: nginx
  when: ansible_distribution == "Ubuntu"

- name: Install on RHEL
  dnf:
    name: nginx
  when: ansible_os_family == "RedHat"

- name: Restart only if config changed
  systemd:
    name: nginx
    state: restarted
  when: nginx_config.changed
```

## Roles — reusable

```text
roles/
└── webserver/
    ├── tasks/
    │   └── main.yml
    ├── handlers/
    │   └── main.yml
    ├── templates/
    │   └── nginx.conf.j2
    ├── files/
    │   └── index.html
    ├── vars/
    │   └── main.yml
    ├── defaults/
    │   └── main.yml
    └── meta/
        └── main.yml
```

```yaml
# site.yml — use role
- hosts: web
  roles:
    - webserver
    - { role: monitoring, tags: ['monitor'] }
```

Run role:

```bash
ansible-playbook site.yml
ansible-playbook site.yml --tags monitor
```

### Ansible Galaxy

```bash
# Install role/collection
ansible-galaxy role install geerlingguy.nginx
ansible-galaxy collection install community.general
```

Galaxy = npm cho Ansible — thousands role tested.

## vProfile setup với Ansible

```yaml
# playbook.yml
---
- name: Setup database
  hosts: db
  become: yes
  roles:
    - mariadb

- name: Setup cache
  hosts: cache
  become: yes
  roles:
    - memcached

- name: Setup message broker
  hosts: queue
  become: yes
  roles:
    - rabbitmq

- name: Setup app server
  hosts: app
  become: yes
  roles:
    - java
    - tomcat
    - vprofile_app

- name: Setup web server
  hosts: web
  become: yes
  roles:
    - nginx_reverse_proxy
```

Thay vào setup script Bash phase 8 → playbook idempotent, reusable.

## Best practices

| Practice | Why |
|---|---|
| Role-based structure | Reusable, testable |
| Use `defaults/` cho default var | Override dễ |
| Tag tasks | Selective run |
| Encrypt secret với `ansible-vault` | Security |
| Test với molecule | Quality |
| Lint với `ansible-lint` | Best practice |
| Pin collection version | Reproducible |
| `--check --diff` trước apply prod | Safety |

### Ansible Vault — encrypt secret

```bash
# Encrypt file
ansible-vault encrypt group_vars/all/secrets.yml

# Edit
ansible-vault edit group_vars/all/secrets.yml

# Run với vault
ansible-playbook playbook.yml --ask-vault-pass
ansible-playbook playbook.yml --vault-password-file=~/.vault_pass
```

`secrets.yml` plain:

```yaml
db_password: "supersecret"
api_key: "sk-xxx"
```

Encrypted → file binary-like, commit Git được.

## CI/CD cho Ansible

```yaml
# .github/workflows/ansible.yml
on: [pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pipx install ansible-lint
      - run: ansible-lint playbook.yml

  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pipx install ansible
      - run: ansible-playbook playbook.yml --check --diff
```

## Khi nào dùng Ansible vs Terraform?

| Task | Tool |
|---|---|
| Tạo EC2 / VPC / RDS | **Terraform** |
| Cài nginx / config app | **Ansible** |
| Provision K8s cluster | Terraform |
| Deploy app lên cluster | Ansible / Helm |
| Manage AWS IAM | Terraform |
| Setup user trên server | Ansible |

Pattern: Terraform → infra. Ansible → in-server config.

Modern alternative: **cloud-init + container image** thay Ansible cho immutable infrastructure.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| `command` / `shell` cho mọi thứ | Không idempotent | Dùng module chuyên |
| Hardcode password | Lộ | Ansible Vault |
| Quên `become: yes` | Permission denied | Set ở play hoặc task |
| Run mọi host parallel quá nhiều | OOM control node | `serial: 5` rolling |
| Không test trên staging | Phá prod | `--check --diff` |
| Role không version | Update break | Pin requirements.yml |
| Inventory hardcoded | Drift với cloud | Dynamic inventory |

## Tóm tắt bài 1

- **Ansible** = agentless config management qua SSH + YAML playbook.
- **Idempotent** built-in — chạy lại an toàn.
- **Module** = action atomic (apt, copy, template, systemd...).
- **Role** + **Galaxy** = reusable code.
- **Ansible Vault** encrypt secret commit Git.
- **Dynamic inventory** cho cloud (AWS, GCP).
- Terraform tạo infra → Ansible cấu hình bên trong.
- `--check --diff` test trước apply prod.

**Phase kế tiếp** → [Phase 23 — Bài 1: Monitoring với Prometheus + Grafana](../phase-23-monitoring/01-monitoring-basics.md)
