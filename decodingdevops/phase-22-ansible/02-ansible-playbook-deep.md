# Bài 2: Ansible playbook deep — modules, handlers, conditionals, loops

Bài 1 overview. Bài này dạy **playbook syntax đầy đủ** để viết Ansible production-grade.

## Playbook structure

```yaml
---
- name: Setup web server
  hosts: web
  become: yes
  gather_facts: yes        # Auto-detect OS, IP, ...
  vars:
    app_port: 8080
  vars_files:
    - vars/common.yml
    - vars/{{ ansible_os_family }}.yml
  vars_prompt:
    - name: db_password
      prompt: "DB password"
      private: yes
  pre_tasks:
    - name: Notify start
      debug: msg="Starting setup"
  roles:
    - common
    - { role: nginx, tags: ['web'] }
  tasks:
    - name: Install package
      apt:
        name: nginx
        state: present
  post_tasks:
    - name: Notify done
      debug: msg="Done"
  handlers:
    - name: reload nginx
      systemd:
        name: nginx
        state: reloaded
```

## Modules — toolbox

3000+ modules. Top quan trọng:

### Package management

```yaml
# apt (Debian/Ubuntu)
- apt:
    name: ["nginx", "git", "vim"]
    state: present
    update_cache: yes
    cache_valid_time: 3600

# dnf (RHEL/Fedora)
- dnf:
    name: nginx
    state: latest
    enablerepo: epel

# Generic
- package:
    name: nginx
    state: present
```

### Service

```yaml
- systemd:
    name: nginx
    state: started        # started/stopped/restarted/reloaded
    enabled: yes
    daemon_reload: yes    # Sau khi sửa unit file
```

### File operations

```yaml
# Copy file
- copy:
    src: app.conf
    dest: /etc/app/
    owner: root
    group: root
    mode: '0644'
    backup: yes

# Copy content (inline)
- copy:
    content: |
      key1: value1
      key2: value2
    dest: /etc/app/config

# Template (Jinja2)
- template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
    owner: root
    mode: '0644'
    validate: 'nginx -t -c %s'
  notify: reload nginx

# Manage file/dir/symlink
- file:
    path: /var/log/app
    state: directory       # file/directory/link/absent/touch
    owner: app
    mode: '0755'
    recurse: yes
```

### Text manipulation

```yaml
# Add/modify line
- lineinfile:
    path: /etc/ssh/sshd_config
    regexp: '^#?PermitRootLogin'
    line: 'PermitRootLogin no'
    backup: yes
  notify: restart sshd

# Multiple lines
- blockinfile:
    path: /etc/hosts
    block: |
      192.168.1.10 web01
      192.168.1.11 db01
    marker: "# {mark} ANSIBLE"

# Regex replace
- replace:
    path: /etc/app/config
    regexp: 'host=.*'
    replace: 'host=db01'
```

### User & permissions

```yaml
- user:
    name: deploy
    groups: ["wheel", "docker"]
    shell: /bin/bash
    create_home: yes
    state: present

- group:
    name: devops
    state: present

- authorized_key:
    user: deploy
    key: "{{ lookup('file', 'public_key.pub') }}"
    state: present
```

### Command execution

```yaml
# command — direct, no shell
- command: /opt/setup.sh
  args:
    creates: /opt/installed     # Idempotent: skip if exists

# shell — shell features (pipe, redirect)
- shell: |
    set -e
    cd /opt/app
    git pull
    npm install
  args:
    chdir: /opt/app

# raw — no Python on target (rare)
- raw: yum install -y python3
```

### Git, archive

```yaml
- git:
    repo: 'https://github.com/acme/app.git'
    dest: /opt/app
    version: main
    force: yes

- unarchive:
    src: https://example.com/app.tar.gz
    dest: /opt/
    remote_src: yes
    creates: /opt/app/bin
```

### Cron, scheduled tasks

```yaml
- cron:
    name: "Backup database"
    minute: "0"
    hour: "2"
    job: "/opt/backup.sh"
    user: backup

- cron:
    name: "Cleanup tmp"
    special_time: daily
    job: "find /tmp -mtime +7 -delete"
```

### Database

```yaml
- mysql_db:
    name: vprofile
    state: present
    login_user: root
    login_password: "{{ db_root_password }}"

- mysql_user:
    name: appuser
    password: "{{ app_db_password }}"
    priv: 'vprofile.*:ALL'
    host: '%'
    state: present
```

### Docker

```yaml
- community.docker.docker_image:
    name: nginx
    source: pull
    tag: '1.25'

- community.docker.docker_container:
    name: web
    image: nginx:1.25
    ports:
      - "80:80"
    state: started
    restart_policy: unless-stopped
```

### AWS

```yaml
- amazon.aws.ec2_instance:
    name: web01
    image_id: ami-xxx
    instance_type: t3.micro
    subnet_id: subnet-xxx
    security_groups: ["sg-web"]
    state: running

- amazon.aws.s3_object:
    bucket: my-bucket
    object: file.txt
    src: local.txt
    mode: put
```

## Variables — precedence

Highest → lowest:

1. CLI `-e var=value`.
2. Task vars.
3. Block vars.
4. Role vars.
5. Play vars.
6. host_vars.
7. group_vars (by inventory).
8. Inventory facts.
9. Defaults (role).

```yaml
# vars at play level
- hosts: all
  vars:
    app_name: vprofile

# Or external file
- hosts: all
  vars_files:
    - vars/common.yml
    - "vars/{{ ansible_distribution }}.yml"
```

### group_vars / host_vars

```text
inventory/
├── hosts.yml
├── group_vars/
│   ├── all.yml
│   ├── web.yml
│   └── db.yml
└── host_vars/
    └── web01.yml
```

`group_vars/all.yml` apply mọi host. `host_vars/web01.yml` chỉ web01.

### Magic variables

```yaml
- debug: var=ansible_hostname
- debug: var=ansible_facts.distribution
- debug: var=ansible_default_ipv4.address
- debug: var=groups['web']           # All web hosts
- debug: var=hostvars['db01'].ansible_host
- debug: var=inventory_hostname
```

## Templates với Jinja2

`templates/nginx.conf.j2`:

```jinja2
worker_processes {{ ansible_processor_vcpus }};
events {
    worker_connections {{ nginx_max_connections | default(1024) }};
}

http {
    upstream backend {
        {% for host in groups['app'] %}
        server {{ hostvars[host].ansible_default_ipv4.address }}:{{ app_port }};
        {% endfor %}
    }

    server {
        listen {{ nginx_port | default(80) }};
        server_name {{ inventory_hostname }};

        {% if ssl_enabled %}
        listen 443 ssl;
        ssl_certificate /etc/ssl/cert.pem;
        ssl_certificate_key /etc/ssl/key.pem;
        {% endif %}

        location / {
            proxy_pass http://backend;
        }
    }
}
```

Template render với context của target host:
- `ansible_processor_vcpus` = auto-detect CPU count.
- `groups['app']` = list all app hosts.
- `hostvars[host].ansible_default_ipv4.address` = IP của host kia.

### Jinja2 filters

```jinja2
{{ name | upper }}                       # ALICE
{{ name | lower }}
{{ name | title }}
{{ name | default('unknown') }}
{{ list | length }}
{{ list | first }}
{{ list | last }}
{{ list | unique }}
{{ list | sort }}
{{ dict | to_json }}
{{ dict | to_nice_yaml }}
{{ value | int }}
{{ value | regex_replace('old', 'new') }}
{{ list | map('upper') | list }}
{{ password | b64encode }}
{{ "secret" | hash('sha256') }}
```

## Conditionals

```yaml
- name: Install on Ubuntu
  apt:
    name: nginx
  when: ansible_os_family == "Debian"

- name: Install on RHEL
  dnf:
    name: nginx
  when: ansible_os_family == "RedHat"

# Multiple conditions
- name: Production only
  command: ./prod-setup.sh
  when:
    - env == "production"
    - ansible_distribution_major_version == "22"
    - inventory_hostname in groups['web']

# Check variable existence
- when: my_var is defined
- when: my_var is not defined
- when: my_var | length > 0

# Boolean cast
- when: enable_feature | bool

# Previous task result
- name: Check service
  command: systemctl is-active nginx
  register: nginx_status
  changed_when: false
  failed_when: false

- name: Start nginx
  systemd:
    name: nginx
    state: started
  when: nginx_status.rc != 0
```

## Loops

```yaml
# Simple loop
- name: Install packages
  apt:
    name: "{{ item }}"
    state: present
  loop:
    - nginx
    - git
    - vim

# Loop with dict
- user:
    name: "{{ item.name }}"
    groups: "{{ item.groups }}"
  loop:
    - { name: alice, groups: 'sudo' }
    - { name: bob, groups: 'docker' }

# Loop dict
- name: Create users
  user:
    name: "{{ item.key }}"
    uid: "{{ item.value.uid }}"
  loop: "{{ users | dict2items }}"
  vars:
    users:
      alice: { uid: 1001 }
      bob: { uid: 1002 }

# Range
- debug: msg="{{ item }}"
  loop: "{{ range(1, 10) | list }}"

# Loop until
- name: Wait for app
  uri:
    url: "http://localhost:8080/health"
  register: result
  until: result.status == 200
  retries: 30
  delay: 5

# Nested loops
- debug: msg="{{ item[0] }} - {{ item[1] }}"
  with_nested:
    - [a, b]
    - [1, 2, 3]
```

## Handlers

```yaml
tasks:
  - name: Deploy nginx config
    template:
      src: nginx.conf.j2
      dest: /etc/nginx/nginx.conf
    notify:
      - reload nginx        # Single handler
      - check nginx status  # Multiple

handlers:
  - name: reload nginx
    systemd:
      name: nginx
      state: reloaded

  - name: check nginx status
    command: nginx -t
```

Handler chỉ chạy:
- Sau khi mọi task xong.
- Khi task `changed` (notify).
- 1 lần dù notify nhiều task.

Force run handler ngay:

```yaml
- name: Apply config
  template:
    src: config.j2
    dest: /etc/config
  notify: reload service

- meta: flush_handlers      # Run handler ngay
```

## Blocks — group + error handling

```yaml
- name: Setup app
  block:
    - apt:
        name: app
        state: present
    - systemd:
        name: app
        state: started
  rescue:
    - debug:
        msg: "Setup failed, cleaning up"
    - command: /opt/cleanup.sh
  always:
    - debug:
        msg: "Always runs"
  when: ansible_os_family == "Debian"
  become: yes
  tags: setup
```

`block` = try, `rescue` = catch, `always` = finally.

## Tags

```yaml
tasks:
  - name: Install
    apt: name=nginx
    tags: [install, setup]

  - name: Configure
    template: ...
    tags: [config]

  - name: Start
    systemd: ...
    tags: [start, deploy]
```

```bash
# Run only tagged
ansible-playbook play.yml --tags install,config

# Skip tags
ansible-playbook play.yml --skip-tags config

# List tags
ansible-playbook play.yml --list-tags
```

## Delegate, run_once

```yaml
# Run on different host
- name: Backup DB
  command: /opt/backup.sh
  delegate_to: db01

# Run once across all hosts
- name: Notify deploy
  uri:
    url: https://slack.com/...
  run_once: true
  delegate_to: localhost
```

Use case: notification, DB migration (only 1 host runs).

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Quên `become: yes` | Permission denied | Set at play hoặc task |
| `command` thay module | Not idempotent | Use specific module |
| Quên handler notify | Service không restart | Notify list |
| Template không validate | Bad config deployed | Add `validate:` |
| Tags missing | Cannot selective run | Tag everything |
| Loop với module reload nhiều lần | Slow | Combine into 1 task |
| Hardcode password | Lộ | Ansible Vault |

## Tóm tắt bài 2

- **Modules** = action atomic (apt, systemd, template, lineinfile, mysql_db, ...).
- **Variable precedence** complex — biết để debug.
- **`group_vars/`, `host_vars/`** organize variables.
- **Jinja2 templates** + filters cho dynamic config.
- **Conditionals `when`** + **Loops `loop`** + **`until`** retry.
- **Handlers** delayed action when task `changed`.
- **`block/rescue/always`** error handling.
- **Tags** selective run.
- **`delegate_to`, `run_once`** for special host execution.

**Bài kế tiếp** → [Bài 3: Roles và Galaxy](03-ansible-roles.md)
