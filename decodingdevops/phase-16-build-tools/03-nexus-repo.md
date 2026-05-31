# Bài 3: Nexus Repository Manager — artifact repo cho DevOps

Sau khi build `.jar`/`.war` → cần nơi lưu để CD pipeline pull, team share, version control. **Nexus** là tool phổ biến nhất.

## Vì sao cần artifact repo?

Không có repo:
- Build mỗi env → mỗi nơi 1 binary khác → "works on staging, fails prod".
- Maven Central rate limit → CI fail random.
- Internal library không lên public repo → share file qua email.
- Không track ai upload phiên bản nào khi nào.

Có repo:
- 1 binary build → deploy mọi env → reproducible.
- Cache Maven Central → CI build offline-friendly.
- Internal library publish riêng team.
- Audit log đầy đủ.

## Nexus types

| Repo type | Mục đích |
|---|---|
| **Hosted** | Lưu artifact của bạn |
| **Proxy** | Cache remote repo (Maven Central, npm, ...) |
| **Group** | Aggregate nhiều repo thành 1 endpoint |

Default setup:

```text
maven-public (Group)
├── maven-releases (Hosted, release artifact)
├── maven-snapshots (Hosted, SNAPSHOT artifact)
└── maven-central (Proxy → repo.maven.apache.org)
```

App config Maven dùng `maven-public` URL → Nexus tự route.

## Setup Nexus

### Docker

```bash
docker run -d --name nexus \
    -p 8081:8081 \
    -v nexus-data:/nexus-data \
    -e INSTALL4J_ADD_VM_PARAMS="-Xms2g -Xmx2g -XX:MaxDirectMemorySize=2g" \
    sonatype/nexus3:latest

# Wait ~3 phút khởi
sleep 180

# Get admin password
docker exec nexus cat /nexus-data/admin.password
```

Browser: `http://localhost:8081` → Sign in `admin` + password.

Setup wizard:
1. New password.
2. Anonymous access: disable (production).
3. Done.

### Production install

EC2 t3.medium (4 GB RAM minimum):

```bash
# /etc/systemd/system/nexus.service
[Unit]
Description=Nexus Repository
After=network.target

[Service]
Type=forking
User=nexus
ExecStart=/opt/nexus/bin/nexus start
ExecStop=/opt/nexus/bin/nexus stop
Restart=on-failure
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

```bash
useradd -r -d /opt/nexus -s /sbin/nologin nexus
cd /opt
wget https://download.sonatype.com/nexus/3/latest-unix.tar.gz
tar -xzf latest-unix.tar.gz
mv nexus-3.* nexus
chown -R nexus:nexus nexus sonatype-work

systemctl daemon-reload
systemctl enable --now nexus
```

## Repo types & formats

Nexus support nhiều format:

| Format | Use |
|---|---|
| **Maven** | Java .jar/.war/.pom |
| **npm** | Node.js packages |
| **PyPI** | Python wheels |
| **Docker** | Container image |
| **NuGet** | .NET |
| **Helm** | K8s chart |
| **Apt / Yum** | Linux packages |
| **Raw** | Bất kỳ binary |

Setup mỗi format: Settings → Repository → Repositories → Create.

## Configure Maven dùng Nexus

### `~/.m2/settings.xml`

```xml
<settings>
    <servers>
        <server>
            <id>nexus-releases</id>
            <username>devops</username>
            <password>${env.NEXUS_PASSWORD}</password>
        </server>
        <server>
            <id>nexus-snapshots</id>
            <username>devops</username>
            <password>${env.NEXUS_PASSWORD}</password>
        </server>
    </servers>

    <mirrors>
        <mirror>
            <id>nexus</id>
            <mirrorOf>*</mirrorOf>
            <url>http://nexus.acme.com:8081/repository/maven-public/</url>
        </mirror>
    </mirrors>

    <profiles>
        <profile>
            <id>nexus</id>
            <repositories>
                <repository>
                    <id>central</id>
                    <url>http://central</url>
                    <releases><enabled>true</enabled></releases>
                    <snapshots><enabled>true</enabled></snapshots>
                </repository>
            </repositories>
        </profile>
    </profiles>

    <activeProfiles>
        <activeProfile>nexus</activeProfile>
    </activeProfiles>
</settings>
```

### `pom.xml` distribution

```xml
<distributionManagement>
    <repository>
        <id>nexus-releases</id>
        <url>http://nexus.acme.com:8081/repository/maven-releases/</url>
    </repository>
    <snapshotRepository>
        <id>nexus-snapshots</id>
        <url>http://nexus.acme.com:8081/repository/maven-snapshots/</url>
    </snapshotRepository>
</distributionManagement>
```

### Build + deploy

```bash
mvn clean deploy
# = compile + test + package + install (local) + deploy (Nexus)
```

Nexus auto-route:
- Version `2.0.0` → `maven-releases`.
- Version `2.0.0-SNAPSHOT` → `maven-snapshots`.

### Verify

```bash
curl -u admin:password \
    http://nexus.acme.com:8081/service/rest/v1/search/assets?repository=maven-releases
```

Hoặc Nexus UI → Browse → maven-releases.

## Authentication & RBAC

Nexus role-based access:

### Built-in role

- `nx-admin` — toàn quyền.
- `nx-anonymous` — đọc public repo.

### Custom role

Security → Roles → Create role:
- Name: `developer`.
- Privileges:
  - `nx-repository-view-maven2-*-read` (đọc maven repo).
  - `nx-repository-view-maven2-maven-snapshots-add` (push SNAPSHOT).
  - `nx-repository-view-maven2-maven-snapshots-edit` (overwrite SNAPSHOT).

### User

Security → Users → Create local user:
- ID: `cijenkins`.
- Email.
- Password.
- Role: `developer`.

CI Jenkins authenticate với user `cijenkins`.

### LDAP integration

```text
Security → LDAP → Add LDAP server
Hostname: ldap.acme.com
Port: 389
Bind DN: cn=nexus,ou=services,dc=acme,dc=com
```

Users sync từ LDAP → role map → SSO.

## Cleanup policy

Nexus disk đầy theo thời gian. Tạo cleanup policy:

Repository → Cleanup Policies → Create:
- Name: `cleanup-snapshots-30d`.
- Format: maven2.
- Criteria:
  - Last downloaded > 30 days.
  - Last updated > 30 days.

Apply policy vào repo `maven-snapshots`:
- Edit repo → Cleanup → Add policy.

Snapshot cũ tự xoá theo cron.

## Docker registry trên Nexus

Setup Docker Hosted repo:
- Type: docker (hosted).
- HTTP port: 5000.
- Allow anonymous pull: disable.

```bash
# Login
docker login nexus.acme.com:5000

# Push
docker tag vprofile:v1.0 nexus.acme.com:5000/vprofile:v1.0
docker push nexus.acme.com:5000/vprofile:v1.0

# Pull từ máy khác
docker pull nexus.acme.com:5000/vprofile:v1.0
```

Docker Hub rate limit (100 pull/6h anonymous) → Nexus Docker proxy cache pull rate khỏi giới hạn.

## Helm chart repo

```bash
# Push chart
helm push vprofile-1.0.0.tgz oci://nexus.acme.com:8081/repository/helm-hosted/

# Pull
helm install vprofile oci://nexus.acme.com:8081/repository/helm-hosted/vprofile --version 1.0.0
```

## Backup Nexus

```bash
# Stop nexus
systemctl stop nexus

# Backup
tar -czf nexus-backup-$(date +%F).tar.gz \
    /opt/nexus/sonatype-work/nexus3/{blobs,db,etc}

# Restart
systemctl start nexus

# Send to S3
aws s3 cp nexus-backup-*.tar.gz s3://acme-backups/nexus/
```

Production: backup daily + retention 30 ngày.

## Nexus alternatives

| Tool | Type | Note |
|---|---|---|
| **Nexus OSS** | Open source | Free, feature-rich |
| **Nexus Pro** | Commercial | Staging, advanced |
| **JFrog Artifactory** | Commercial | Enterprise leader |
| **AWS CodeArtifact** | AWS managed | $0.05/GB-month |
| **GitHub Packages** | SaaS | Tied GitHub |
| **GitLab Package Registry** | SaaS | Tied GitLab |
| **Harbor** | OSS | K8s/Docker focus, vuln scan |

Khoá học dùng Nexus OSS.

## Vulnerability scan

Nexus IQ (commercial) tự scan dependencies vuln.

Free alternative: **OWASP Dependency-Check** Maven plugin:

```xml
<plugin>
    <groupId>org.owasp</groupId>
    <artifactId>dependency-check-maven</artifactId>
    <version>9.0.7</version>
    <executions>
        <execution>
            <goals><goal>check</goal></goals>
        </execution>
    </executions>
    <configuration>
        <failBuildOnCVSS>7</failBuildOnCVSS>
        <suppressionFile>owasp-suppress.xml</suppressionFile>
    </configuration>
</plugin>
```

`mvn verify` → scan CVE → fail build nếu CVSS ≥ 7.

## CI pipeline với Nexus

GitHub Actions:

```yaml
- name: Build + Deploy
  env:
    NEXUS_USER: ${{ secrets.NEXUS_USER }}
    NEXUS_PASSWORD: ${{ secrets.NEXUS_PASSWORD }}
  run: |
    mvn -B clean deploy \
        -s settings.xml \
        -DskipTests=false
```

`settings.xml` (commit Git, reference env var):

```xml
<servers>
    <server>
        <id>nexus-releases</id>
        <username>${env.NEXUS_USER}</username>
        <password>${env.NEXUS_PASSWORD}</password>
    </server>
</servers>
```

CI build → push artifact → CD pulls → deploy.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Disk Nexus đầy | Stop accept upload | Cleanup policy + monitor |
| Nexus public anonymous write | Anyone push | Disable anonymous, require auth |
| HTTP thay HTTPS | Credential lộ on wire | Cài reverse proxy nginx + TLS |
| Backup không có | Loss artifact | Daily backup S3 |
| Cleanup quá aggressive | Mất artifact đang dùng | Test policy trên 1 repo trước |
| Version sync conflict | 2 dev cùng push 1 version release | Release version immutable |
| Slow upload large jar | Build timeout | Increase max body size |

## Tóm tắt bài 3

- **Nexus** = artifact repo cho mọi format (Maven, npm, Docker, Helm, ...).
- Repo types: **Hosted** (lưu), **Proxy** (cache), **Group** (aggregate).
- Default group `maven-public` route SNAPSHOT/release/Central transparent.
- **`settings.xml`** Maven config mirror + credential.
- **Cleanup policy** auto-xoá artifact cũ.
- **Nexus Docker registry** giảm Docker Hub rate limit.
- **OWASP Dependency-Check** scan CVE trong dependency.
- Backup `sonatype-work/` directory daily.

**Phase kế tiếp** → [Phase 17 — Jenkins](../phase-17-jenkins/01-jenkins-basics.md)
