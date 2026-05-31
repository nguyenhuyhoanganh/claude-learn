# Bài 1: Build tools — Maven, Gradle và Nexus

Build tool = compile code + manage dependency + tạo artifact. Maven và Gradle thống trị Java/JVM. Hiểu cơ bản để debug CI pipeline.

## Vì sao cần build tool?

Không có build tool, bạn:
- Tự download mọi `.jar` dependency.
- Compile từng file `.java` thủ công.
- Run test bằng tay.
- Đóng gói `.jar`/`.war` bằng script.

Build tool tự động:
- Resolve dependency từ Maven Central / Maven repo.
- Compile + test + package.
- Standard project layout.
- Plugin ecosystem (Sonar, Docker, deploy...).

## Maven

### Cấu trúc project chuẩn

```text
my-app/
├── pom.xml                  ← Project Object Model (config)
├── src/
│   ├── main/
│   │   ├── java/            ← Source code
│   │   ├── resources/       ← Config file (application.properties)
│   │   └── webapp/          ← Web content (cho .war)
│   └── test/
│       ├── java/            ← Test code
│       └── resources/       ← Test config
└── target/                  ← Build output (jar/war)
```

Convention over configuration — folder theo chuẩn này, Maven tự hiểu.

### pom.xml — heart of Maven

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>

    <!-- Project identity -->
    <groupId>com.acme</groupId>
    <artifactId>vprofile</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <packaging>war</packaging>

    <!-- Properties -->
    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <!-- Dependencies -->
    <dependencies>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-core</artifactId>
            <version>6.1.0</version>
        </dependency>
        <dependency>
            <groupId>junit</groupId>
            <artifactId>junit</artifactId>
            <version>4.13.2</version>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <!-- Build plugins -->
    <build>
        <finalName>vprofile-v2</finalName>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-war-plugin</artifactId>
                <version>3.4.0</version>
            </plugin>
        </plugins>
    </build>
</project>
```

### Lifecycle phases

```text
validate → compile → test → package → verify → install → deploy
```

| Phase | Action |
|---|---|
| `validate` | Check project structure |
| `compile` | Compile source code |
| `test` | Run unit test |
| `package` | Tạo jar/war |
| `verify` | Run integration test |
| `install` | Copy artifact vào local repo `~/.m2/` |
| `deploy` | Upload remote repo (Nexus) |

Phase sau implicitly chạy mọi phase trước. `mvn package` = validate + compile + test + package.

### Commands

```bash
mvn clean                # Xoá target/
mvn compile              # Compile
mvn test                 # Run test
mvn package              # Tạo .war (skip nếu test fail)
mvn install              # Local install
mvn deploy               # Push lên Nexus

# Skip test (cẩn thận production)
mvn package -DskipTests
mvn install -Dmaven.test.skip=true

# Verbose
mvn -X package           # Debug
mvn -q package           # Quiet

# Profile
mvn package -Pproduction
```

### Dependency resolution

Khi build, Maven check:
1. **Local repo** `~/.m2/repository/` → có chưa?
2. **Remote repo** (Maven Central default) → download → cache local.

```bash
# Refresh dependency
mvn dependency:resolve
mvn dependency:tree         # Hiện tree dependencies
mvn dependency:purge-local-repository   # Xoá cache
```

### Settings.xml

`~/.m2/settings.xml` config Maven global:

```xml
<settings>
    <!-- Proxy -->
    <proxies>
        <proxy>
            <id>corp</id>
            <host>proxy.corp.com</host>
            <port>8080</port>
        </proxy>
    </proxies>

    <!-- Private repo -->
    <servers>
        <server>
            <id>nexus-releases</id>
            <username>${env.NEXUS_USER}</username>
            <password>${env.NEXUS_PASS}</password>
        </server>
    </servers>

    <!-- Mirror -->
    <mirrors>
        <mirror>
            <id>nexus</id>
            <mirrorOf>*</mirrorOf>
            <url>https://nexus.corp.com/repository/maven-public/</url>
        </mirror>
    </mirrors>
</settings>
```

## Gradle

Alternative cho Maven, **xu hướng modern**:

| | Maven | Gradle |
|---|---|---|
| Config | XML (verbose) | Groovy / Kotlin DSL |
| Speed | Slow | **Fast** (incremental + daemon) |
| Flexibility | Convention-bound | **Highly customizable** |
| Plugin | Many | More |
| Android | Supported | **Default** |
| Spring Boot | Supported | **Recommended** |

### build.gradle

```groovy
plugins {
    id 'java'
    id 'org.springframework.boot' version '3.2.0'
}

group = 'com.acme'
version = '1.0.0-SNAPSHOT'
sourceCompatibility = '17'

repositories {
    mavenCentral()
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
}

test {
    useJUnitPlatform()
}
```

### Commands

```bash
./gradlew build              # Compile + test + package
./gradlew clean              # Clean
./gradlew test               # Test only
./gradlew bootRun            # Run Spring Boot app
./gradlew dependencies       # Show deps
```

`./gradlew` = Gradle wrapper — đảm bảo version Gradle cố định, không cần cài global.

## npm / pnpm / yarn — Node.js

Tương đương Maven cho JS/TS:

```bash
npm install              # Install deps from package.json
npm run build            # Build
npm test                 # Test
npm publish              # Publish to npm registry

# Equivalent
yarn install / yarn build / yarn test
pnpm install
```

### package.json

```json
{
    "name": "my-app",
    "version": "1.0.0",
    "scripts": {
        "build": "webpack",
        "test": "jest",
        "start": "node server.js"
    },
    "dependencies": {
        "express": "^4.18.0"
    },
    "devDependencies": {
        "jest": "^29.0.0"
    }
}
```

## Artifact Repository — Nexus / Artifactory

Build xong → upload artifact vào **artifact repo**:

| Repo | Type |
|---|---|
| **Nexus OSS / Pro** | Sonatype, Java + Docker + npm + ... |
| **JFrog Artifactory** | Enterprise leader |
| **AWS CodeArtifact** | Managed cloud |
| **GitHub Packages** | Tích hợp GitHub |
| **GitLab Package Registry** | Tích hợp GitLab |

### Vì sao cần?

- **Reproducibility**: build cùng artifact cho dev, staging, prod.
- **Cache**: Maven Central mirror — không phụ thuộc internet/proxy.
- **Versioning**: tag SNAPSHOT (dev) vs RELEASE (prod).
- **Security scan**: scan vuln trước deploy.
- **Audit**: ai upload gì khi nào.

### Nexus setup nhanh

```bash
# Docker run
docker run -d -p 8081:8081 --name nexus sonatype/nexus3:latest

# Browser: http://localhost:8081
# Default admin password trong:
docker exec nexus cat /nexus-data/admin.password
```

Đăng nhập, đổi password, tạo repo:
- `maven-snapshots` (cho SNAPSHOT version).
- `maven-releases` (cho RELEASE).
- `maven-proxy` (cache Maven Central).
- `maven-public` (group: snapshots + releases + proxy).

### Maven deploy lên Nexus

`pom.xml`:

```xml
<distributionManagement>
    <snapshotRepository>
        <id>nexus-snapshots</id>
        <url>http://nexus:8081/repository/maven-snapshots/</url>
    </snapshotRepository>
    <repository>
        <id>nexus-releases</id>
        <url>http://nexus:8081/repository/maven-releases/</url>
    </repository>
</distributionManagement>
```

```bash
mvn deploy
# Upload artifact lên Nexus
```

## SonarQube — static analysis

Đã giới thiệu phase 2. Maven plugin:

```bash
mvn sonar:sonar \
    -Dsonar.host.url=https://sonarcloud.io \
    -Dsonar.token=$SONAR_TOKEN \
    -Dsonar.projectKey=acme_vprofile
```

Output: code quality report — bug, code smell, vuln, coverage.

## CI/CD pipeline integration

```text
Git push
    │
    ▼
CI (Jenkins/GitHub Actions)
    │
    ├─► mvn clean test
    ├─► mvn package
    ├─► mvn sonar:sonar           ← Quality gate
    ├─► mvn deploy                 ← Upload Nexus
    └─► Trigger CD
        │
        ▼
    Deploy artifact từ Nexus → app server
```

Phase 17 (Jenkins) sẽ implement.

## Build cache + parallel

### Maven

```bash
mvn -T 4 package          # 4 thread parallel
mvn -T 1C package         # 1 thread/core

# Local cache
mvn dependency:resolve -Dmaven.repo.local=./target/m2-repo
```

### Gradle

Gradle daemon + build cache built-in → fast.

```bash
./gradlew build --build-cache --parallel
```

## Containerized build — best practice

```dockerfile
# Multi-stage build cho .war
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /build
COPY pom.xml .
RUN mvn dependency:go-offline           # Cache deps trước copy source
COPY src ./src
RUN mvn package -DskipTests

FROM tomcat:10-jdk17
COPY --from=builder /build/target/*.war /usr/local/tomcat/webapps/ROOT.war
```

Pros:
- Reproducible build (no "works on my machine").
- CI build trong container.
- Image cuối nhỏ (chỉ Tomcat + .war).

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| `mvn install` chậm vì download | First build 5-10 phút | Cache `~/.m2/` |
| Version conflict transitive deps | Runtime error | `mvn dependency:tree` debug |
| SNAPSHOT vs RELEASE | Build không reproducible | Pin RELEASE for prod |
| Skip test prod | Bug lọt | Chỉ skip dev |
| Settings.xml secret commit git | Credential leak | Env variable |
| pom.xml dùng `LATEST`/`RELEASE` | Build khác nhau | Pin version cụ thể |
| Multi-module phụ thuộc circular | Build fail | Refactor module |
| Local-only build, CI fail | Env khác | Build trong Docker |

## Tóm tắt bài 1

- **Maven** standard Java build, **Gradle** modern alternative (Android, Spring Boot ưu).
- **pom.xml** = config trung tâm, lifecycle phase: compile → test → package → install → deploy.
- `~/.m2/repository/` = local cache. Remote = Maven Central.
- **Nexus / Artifactory** = artifact repo doanh nghiệp.
- **SonarQube** scan code quality trong pipeline.
- **Multi-stage Docker** = build reproducible across environment.
- Build pipeline: `mvn clean test package sonar:sonar deploy` chuẩn enterprise Java.

**Phase kế tiếp** → [Phase 17 — Bài 1: Jenkins CI/CD](../phase-17-jenkins/01-jenkins-basics.md)
