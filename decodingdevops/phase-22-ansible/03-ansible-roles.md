# Bài 3: Ansible Roles, Galaxy, và collection

Role = Terraform module của Ansible. Cấu trúc reusable + version + share.

## Role structure

```text
roles/
└── nginx/
    ├── defaults/main.yml        # Default vars (lowest precedence)
    ├── vars/main.yml             # Vars (high precedence)
    ├── files/                    # Static files
    │   └── ssl-cert.pem
    ├── templates/                # Jinja2 templates
    │   └── nginx.conf.j2
    ├── tasks/main.yml            # Tasks
    │   ├── install.yml
    │   └── configure.yml
    ├── handlers/main.yml
    ├── meta/main.yml             # Metadata + dependencies
    ├── library/                  # Custom Python modules
    ├── tests/                    # Molecule tests
    │   ├── molecule/
    │   └── ...
    └── README.md
```

## Tạo role

```bash
ansible-galaxy init nginx
# Hoặc:
mkdir -p roles/nginx/{tasks,handlers,templates,defaults,vars,meta,files}
```

## Files structure example

### `defaults/main.yml`

```yaml
---
nginx_user: www-data
nginx_worker_processes: auto
nginx_worker_connections: 1024
nginx_listen_port: 80
nginx_ssl_enabled: false
nginx_sites:
  - name: default
    server_name: _
    root: /var/www/html
```

### `vars/main.yml`

```yaml
---
nginx_packages:
  - nginx
  - nginx-common
nginx_config_dir: /etc/nginx
```

### `tasks/main.yml`

```yaml
---
- name: Install
  include_tasks: install.yml
  tags: [install]

- name: Configure
  include_tasks: configure.yml
  tags: [config]

- name: Start
  systemd:
    name: nginx
    state: started
    enabled: yes
  tags: [start]
```

### `tasks/install.yml`

```yaml
---
- name: Install nginx packages
  apt:
    name: "{{ nginx_packages }}"
    state: present
    update_cache: yes
  when: ansible_os_family == "Debian"

- name: Install nginx (RHEL)
  dnf:
    name: nginx
    state: present
  when: ansible_os_family == "RedHat"
```

### `tasks/configure.yml`

```yaml
---
- name: Main config
  template:
    src: nginx.conf.j2
    dest: "{{ nginx_config_dir }}/nginx.conf"
    backup: yes
    validate: 'nginx -t -c %s'
  notify: reload nginx

- name: Site configs
  template:
    src: site.conf.j2
    dest: "{{ nginx_config_dir }}/sites-available/{{ item.name }}"
  loop: "{{ nginx_sites }}"
  notify: reload nginx

- name: Enable sites
  file:
    src: "{{ nginx_config_dir }}/sites-available/{{ item.name }}"
    dest: "{{ nginx_config_dir }}/sites-enabled/{{ item.name }}"
    state: link
  loop: "{{ nginx_sites }}"
  notify: reload nginx

- name: Remove default site
  file:
    path: "{{ nginx_config_dir }}/sites-enabled/default"
    state: absent
  notify: reload nginx
```

### `handlers/main.yml`

```yaml
---
- name: reload nginx
  systemd:
    name: nginx
    state: reloaded
  listen: reload nginx

- name: restart nginx
  systemd:
    name: nginx
    state: restarted
```

### `meta/main.yml`

```yaml
---
galaxy_info:
  author: DevOps Team
  description: Nginx web server role
  company: Acme
  license: MIT
  min_ansible_version: '2.14'
  platforms:
    - name: Ubuntu
      versions: [jammy, focal]
    - name: EL
      versions: [9, 8]
  galaxy_tags:
    - web
    - nginx

dependencies:
  - role: common
  - role: ssl
    when: nginx_ssl_enabled | bool
```

### `templates/nginx.conf.j2`

```jinja2
user {{ nginx_user }};
worker_processes {{ nginx_worker_processes }};

events {
    worker_connections {{ nginx_worker_connections }};
}

http {
    sendfile on;
    keepalive_timeout 65;
    include /etc/nginx/mime.types;
    include {{ nginx_config_dir }}/sites-enabled/*;
}
```

## Use role trong playbook

```yaml
# site.yml
- hosts: web
  become: yes
  roles:
    - common
    - { role: nginx, tags: ['web'] }
    - role: monitoring
      vars:
        monitor_enabled: true
      when: env == "production"
```

`roles:` keyword run before `tasks:`.

Inline role với `import_role` / `include_role`:

```yaml
tasks:
  - name: Setup nginx
    include_role:
      name: nginx
    vars:
      nginx_ssl_enabled: true
```

## Dependencies

Role A depends on B:

```yaml
# roles/app/meta/main.yml
dependencies:
  - role: common
  - role: java
    vars:
      java_version: '17'
```

Khi run role `app` → tự run `common`, `java` trước.

## Ansible Galaxy — role registry

### Find role

```bash
ansible-galaxy search nginx
# Or browse https://galaxy.ansible.com
```

### Install role

```bash
ansible-galaxy role install geerlingguy.nginx

# Specific version
ansible-galaxy role install geerlingguy.nginx,3.1.0

# Install to custom path
ansible-galaxy role install geerlingguy.nginx -p ./roles/
```

### Requirements file

`requirements.yml`:

```yaml
roles:
  - src: geerlingguy.nginx
    version: 3.1.0
  - src: geerlingguy.docker
    version: 6.1.0
  - src: https://github.com/acme/custom-role.git
    name: custom_role
    version: v1.0.0

collections:
  - name: community.general
    version: '8.0.0'
  - name: amazon.aws
    version: '7.0.0'
  - name: community.docker
    version: '3.4.11'
```

```bash
ansible-galaxy install -r requirements.yml
```

CI:

```yaml
- run: ansible-galaxy install -r requirements.yml
- run: ansible-playbook -i inventory site.yml
```

### Use community role

```yaml
- hosts: web
  roles:
    - role: geerlingguy.nginx
      vars:
        nginx_vhosts:
          - listen: "80"
            server_name: "vprofile.acme.com"
            root: "/var/www/vprofile"
```

Battle-tested. Save weeks of work.

## Collections

Modern Ansible packaging. Bundle modules + plugins + roles.

```bash
ansible-galaxy collection install community.general
ansible-galaxy collection install amazon.aws

# List installed
ansible-galaxy collection list
```

Use:

```yaml
- amazon.aws.ec2_instance:
    name: web01
    image_id: ami-xxx
    instance_type: t3.micro
```

Fully qualified collection name (FQCN) recommend.

## Molecule — test role

```bash
pip install molecule molecule-plugins[docker]

# Init test scaffold
cd roles/nginx
molecule init scenario --driver-name docker
```

Tạo `molecule/default/`:

```text
molecule/default/
├── molecule.yml         # Config
├── converge.yml         # Playbook chạy role
├── verify.yml           # Assertions
└── tests/
```

`molecule.yml`:

```yaml
---
dependency:
  name: galaxy
driver:
  name: docker
platforms:
  - name: ubuntu-22
    image: geerlingguy/docker-ubuntu2204-ansible
    pre_build_image: true
  - name: rocky-9
    image: geerlingguy/docker-rockylinux9-ansible
    pre_build_image: true
provisioner:
  name: ansible
verifier:
  name: ansible
```

`converge.yml`:

```yaml
---
- name: Converge
  hosts: all
  roles:
    - nginx
```

`verify.yml`:

```yaml
---
- name: Verify
  hosts: all
  tasks:
    - name: Check nginx running
      command: systemctl is-active nginx
      changed_when: false

    - name: Check nginx responds
      uri:
        url: http://localhost
        status_code: 200
```

Run:

```bash
molecule test
# 1. Destroy existing
# 2. Create containers (multi-distro)
# 3. Run converge.yml
# 4. Run verify.yml
# 5. Idempotency test (run converge again → no change)
# 6. Destroy
```

CI cho role:

```yaml
- run: pip install molecule molecule-plugins[docker]
- run: cd roles/nginx && molecule test
```

## Refactor vProfile thành roles

```text
ansible/
├── ansible.cfg
├── inventory/
│   ├── hosts.yml
│   └── group_vars/
│       └── all.yml
├── requirements.yml
├── site.yml
└── roles/
    ├── common/
    ├── mariadb/
    ├── memcached/
    ├── rabbitmq/
    ├── tomcat/
    └── nginx/
```

`site.yml`:

```yaml
---
- name: Common setup
  hosts: all
  become: yes
  roles:
    - common

- name: Database
  hosts: db
  become: yes
  roles:
    - mariadb

- name: Cache
  hosts: cache
  become: yes
  roles:
    - memcached

- name: Queue
  hosts: queue
  become: yes
  roles:
    - rabbitmq

- name: App
  hosts: app
  become: yes
  roles:
    - java
    - tomcat
    - vprofile_app

- name: Web
  hosts: web
  become: yes
  roles:
    - nginx
```

Each role: install + configure + start service idempotent.

Run:

```bash
ansible-playbook -i inventory site.yml

# Only DB
ansible-playbook -i inventory site.yml --limit db

# Skip app
ansible-playbook -i inventory site.yml --skip-tags app

# Tags
ansible-playbook -i inventory site.yml --tags configure
```

## ansible.cfg

```ini
[defaults]
inventory = ./inventory/hosts.yml
roles_path = ./roles
collections_path = ./collections
host_key_checking = False
forks = 50
gather_facts = smart
fact_caching = jsonfile
fact_caching_connection = /tmp/ansible-facts
fact_caching_timeout = 86400
retry_files_enabled = False
stdout_callback = yaml
deprecation_warnings = True

[ssh_connection]
ssh_args = -o ControlMaster=auto -o ControlPersist=60s
pipelining = True
control_path = /tmp/ansible-ssh-%%h-%%p-%%r
```

`forks = 50` = 50 parallel host execution. Speed up.

## Best practices

| Practice | Why |
|---|---|
| Role-based architecture | Reusability |
| Defaults sensible | Easy consumer |
| Validate inputs | Early fail |
| Idempotent everywhere | Re-run safe |
| Tag mọi task | Selective run |
| Ansible Vault cho secret | Security |
| Test với Molecule | Quality |
| Lint với ansible-lint | Best practice |
| Version pin role/collection | Reproducible |
| Use FQCN | Future-proof |
| `--check --diff` trước apply prod | Safety |

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Role không idempotent | Re-run break | Use modules với state |
| `command`/`shell` không `creates:` | Not idempotent | Add `creates:` hoặc check |
| Hardcode path | Cross-distro break | Use facts (ansible_distribution) |
| No test | Bug hidden | Molecule |
| Missing dependencies in `meta` | Order break | Document deps |
| Role không version | Break when update | Pin in requirements.yml |

## Tóm tắt bài 3

- **Role** = directory structure chuẩn (tasks, handlers, defaults, templates, files, meta).
- **`ansible-galaxy init`** generate scaffold.
- **Dependencies** in `meta/main.yml` auto-run preceded.
- **Ansible Galaxy** registry community role.
- **Collections** bundle modules + plugins + roles.
- **Molecule** test role multi-distro với Docker.
- **`requirements.yml`** pin role + collection version.
- vProfile playbook → modular role architecture.

**Bài kế tiếp** → [Bài 4: Ansible Vault, dynamic inventory, AWX/Tower](04-ansible-advanced.md)
