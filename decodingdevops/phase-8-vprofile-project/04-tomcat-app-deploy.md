# Bài 4: Tomcat setup và deploy vProfile.war

App tier — Java app chạy trên Tomcat 10. Build source code thành `.war`, deploy lên Tomcat.

## Setup app01

```bash
vagrant ssh app01
sudo -i
```

### 1. Install Java 17 + Maven + Git

```bash
dnf install -y java-17-openjdk java-17-openjdk-devel git wget unzip
java -version
# openjdk version "17.0.x"

# Maven (build .war)
dnf install -y maven
mvn --version
```

### 2. Tạo user tomcat

```bash
useradd -r -m -U -d /opt/tomcat -s /sbin/nologin tomcat
```

### 3. Download Tomcat 10

```bash
TOMCAT_VERSION="10.1.17"
cd /tmp
wget https://dlcdn.apache.org/tomcat/tomcat-10/v${TOMCAT_VERSION}/bin/apache-tomcat-${TOMCAT_VERSION}.tar.gz

# Extract
tar -xzf apache-tomcat-${TOMCAT_VERSION}.tar.gz -C /opt/tomcat --strip-components=1
chown -R tomcat:tomcat /opt/tomcat/
chmod +x /opt/tomcat/bin/*.sh
```

### 4. systemd unit

```bash
cat > /etc/systemd/system/tomcat.service <<'EOF'
[Unit]
Description=Apache Tomcat 10
After=network.target

[Service]
Type=forking
User=tomcat
Group=tomcat
Environment="JAVA_HOME=/usr/lib/jvm/jre"
Environment="CATALINA_PID=/opt/tomcat/temp/tomcat.pid"
Environment="CATALINA_HOME=/opt/tomcat"
Environment="CATALINA_BASE=/opt/tomcat"
Environment="CATALINA_OPTS=-Xms512M -Xmx1024M -server -XX:+UseParallelGC"
ExecStart=/opt/tomcat/bin/startup.sh
ExecStop=/opt/tomcat/bin/shutdown.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now tomcat
systemctl status tomcat
systemctl stop firewalld
systemctl disable firewalld
```

### 5. Verify default

```bash
curl http://localhost:8080
# Tomcat welcome page HTML
```

Browser: `http://192.168.56.12:8080` → Tomcat welcome.

## Build vProfile.war

### 1. Clone source

```bash
cd /tmp
git clone -b local https://github.com/hkhcoder/vprofile-project.git
cd vprofile-project
```

### 2. Edit application.properties

File `src/main/resources/application.properties` chứa **connection string** cho 5 service. Sửa hostname/credentials phù hợp lab:

```bash
vim src/main/resources/application.properties
```

Đảm bảo:

```properties
# JDBC
jdbc.url=jdbc:mysql://db01:3306/accounts?useUnicode=true&characterEncoding=UTF-8&zeroDateTimeBehavior=convertToNull&useSSL=false
jdbc.username=admin
jdbc.password=admin123

# Memcached
memcached.active.host=mc01
memcached.active.port=11211
memcached.standBy.host=mc02
memcached.standBy.port=11211

# RabbitMQ
rabbitmq.address=rmq01
rabbitmq.port=5672
rabbitmq.username=test
rabbitmq.password=test
```

Hostname `db01`, `mc01`, `rmq01` — đã sync `/etc/hosts` ở bài 2.

### 3. Build với Maven

```bash
mvn install
```

Maven sẽ:
- Tải dependencies từ Maven Central.
- Compile Java code.
- Run unit tests.
- Package thành `.war`.

Build thành công → `target/vprofile-v2.war`:

```bash
ls -la target/
# -rw-r--r-- ... vprofile-v2.war
```

Lần đầu build: 5-10 phút (download deps). Lần sau cache: 30 giây.

## Deploy vProfile.war lên Tomcat

### 1. Stop Tomcat

```bash
systemctl stop tomcat
```

### 2. Xoá default ROOT app

```bash
rm -rf /opt/tomcat/webapps/ROOT
rm -rf /opt/tomcat/webapps/ROOT.war
```

### 3. Copy .war thành ROOT.war

```bash
cp target/vprofile-v2.war /opt/tomcat/webapps/ROOT.war
chown tomcat:tomcat /opt/tomcat/webapps/ROOT.war
```

`ROOT.war` deploy ở context path `/` (root). Nếu copy `vprofile.war` → context path `/vprofile`.

### 4. Start Tomcat

```bash
systemctl start tomcat
systemctl status tomcat
```

Tomcat tự extract `.war` → folder `webapps/ROOT/`. Mất ~10s đầu deploy.

### 5. Verify

```bash
curl http://localhost:8080
# vProfile login page HTML
```

Browser: `http://192.168.56.12:8080` → login form xuất hiện.

Login:
- Username: `admin_vp`
- Password: `admin_vp`

→ vào dashboard. Click thử các tab "User", "Account" — query DB chạy.

## Debug khi không up

### Tomcat fail start

```bash
journalctl -u tomcat -n 50
# Hoặc:
tail -f /opt/tomcat/logs/catalina.out
```

Common errors:
- `Address already in use`: port 8080 đã có process khác. Check `ss -tulnp :8080`.
- `JAVA_HOME not set`: verify `Environment="JAVA_HOME=..."` trong unit file.
- Permission denied: `chown -R tomcat:tomcat /opt/tomcat`.

### App login fail

```bash
tail -f /opt/tomcat/logs/catalina.out
```

Look for:
- `Communications link failure` → MySQL không reach (firewall? hostname?).
- `Access denied for user 'admin'` → password sai trong application.properties.
- `Connection refused mc01:11211` → memcached down hoặc bind localhost.
- `Connection refused rmq01:5672` → RabbitMQ down.

Test từng service từ app01:

```bash
mysql -h db01 -u admin -padmin123 -e "SELECT 1;"
echo stats | nc mc01 11211 | head -3
nc -zv rmq01 5672
```

Mọi cái OK → restart Tomcat:

```bash
systemctl restart tomcat
```

## Rebuild khi đổi properties

```bash
cd /tmp/vprofile-project
vim src/main/resources/application.properties
mvn install
systemctl stop tomcat
rm -rf /opt/tomcat/webapps/ROOT*
cp target/vprofile-v2.war /opt/tomcat/webapps/ROOT.war
chown tomcat:tomcat /opt/tomcat/webapps/ROOT.war
systemctl start tomcat
```

5 lệnh → deploy version mới. Phase Jenkins (section 17) sẽ tự động hoá toàn bộ.

## Optimal — build .war trên host

Build trên VM tốn RAM + chậm (do single CPU). Pattern thực tế:
- Build `.war` trên **machine có nhiều CPU/RAM** (laptop, CI server).
- Copy `.war` lên app server.
- App server chỉ chạy Tomcat.

Lab này build trên VM cho đơn giản. Section CI/CD sẽ tách build vs runtime.

## Tomcat manager UI

Tomcat có UI quản lý app:

```bash
# Edit tomcat-users.xml
vim /opt/tomcat/conf/tomcat-users.xml
```

Thêm vào trước `</tomcat-users>`:

```xml
<role rolename="manager-gui"/>
<role rolename="admin-gui"/>
<user username="admin" password="admin" roles="manager-gui,admin-gui"/>
```

Edit `/opt/tomcat/webapps/manager/META-INF/context.xml`:

```xml
<Valve className="org.apache.catalina.valves.RemoteAddrValve"
       allow="^.*$" />
```

(Default chỉ cho 127.0.0.1. Đổi `^.*$` để cho mọi IP — chỉ làm trên lab.)

Restart Tomcat. Truy cập `http://192.168.56.12:8080/manager/html` → login `admin/admin` → UI quản app.

## Trade-off: ROOT.war vs vprofile.war

| Name | URL path |
|---|---|
| `ROOT.war` | `http://app01:8080/` |
| `vprofile.war` | `http://app01:8080/vprofile/` |

Bài 5 nginx config sẽ dùng `/` → ROOT.war hợp. Nếu dùng path khác, đổi nginx proxy_pass tương ứng.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Tomcat 9 + servlet API 5 | App fail load | Tomcat 10 yêu cầu Jakarta EE 9 — match version |
| Quên xoá ROOT cũ | Page conflict | `rm -rf webapps/ROOT*` trước copy |
| `chown` quên | Tomcat không đọc `.war` | `chown tomcat:tomcat` |
| Maven build fail dependency | Timeout download | Retry, hoặc set proxy |
| Maven version mismatch JDK | Compile fail | Match `pom.xml` `maven.compiler.source` với JDK installed |
| Property file sai hostname | Connection fail | Re-build sau khi sửa |

## Tóm tắt bài 4

- App01: Java 17 + Tomcat 10 + Maven.
- Build vProfile: `mvn install` → `target/vprofile-v2.war`.
- Sửa `application.properties` với hostname `db01`, `mc01`, `rmq01` trước build.
- Deploy: rename `.war` thành `ROOT.war` → copy vào `webapps/`.
- Tomcat auto-extract `.war`, app start ~10s.
- Login test: `admin_vp` / `admin_vp`.
- Log debug: `/opt/tomcat/logs/catalina.out` và `journalctl -u tomcat`.

**Bài kế tiếp** → [Bài 5: nginx reverse proxy và end-to-end validation](05-nginx-load-balancer.md)
