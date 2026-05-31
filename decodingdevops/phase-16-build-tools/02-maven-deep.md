# Bài 2: Maven deep-dive — POM, dependency, plugin, lifecycle

Bài 1 overview build tools. Bài này **đào sâu Maven** — tool xuất hiện thường xuyên nhất với Java DevOps.

## POM — Project Object Model

`pom.xml` = trái tim Maven project. Phân tích đầy đủ:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
                             http://maven.apache.org/xsd/maven-4.0.0.xsd">

    <modelVersion>4.0.0</modelVersion>

    <!-- ========== IDENTITY ========== -->
    <groupId>com.acme</groupId>
    <artifactId>vprofile</artifactId>
    <version>2.0.0-SNAPSHOT</version>
    <packaging>war</packaging>
    <name>vProfile App</name>
    <description>Social network for art collectors</description>

    <!-- ========== PROPERTIES ========== -->
    <properties>
        <java.version>17</java.version>
        <maven.compiler.source>${java.version}</maven.compiler.source>
        <maven.compiler.target>${java.version}</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>

        <spring.version>6.1.0</spring.version>
        <junit.version>5.10.0</junit.version>

        <surefire.version>3.2.2</surefire.version>
    </properties>

    <!-- ========== PARENT ========== -->
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>

    <!-- ========== DEPENDENCY MGMT ========== -->
    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework</groupId>
                <artifactId>spring-framework-bom</artifactId>
                <version>${spring.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>

    <!-- ========== DEPENDENCIES ========== -->
    <dependencies>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-webmvc</artifactId>
        </dependency>

        <dependency>
            <groupId>org.springframework.security</groupId>
            <artifactId>spring-security-core</artifactId>
            <version>6.2.0</version>
        </dependency>

        <dependency>
            <groupId>org.hibernate</groupId>
            <artifactId>hibernate-core</artifactId>
            <version>6.4.1.Final</version>
        </dependency>

        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <version>8.2.0</version>
            <scope>runtime</scope>
        </dependency>

        <dependency>
            <groupId>com.googlecode.xmemcached</groupId>
            <artifactId>xmemcached</artifactId>
            <version>2.4.7</version>
        </dependency>

        <dependency>
            <groupId>com.rabbitmq</groupId>
            <artifactId>amqp-client</artifactId>
            <version>5.20.0</version>
        </dependency>

        <!-- Test -->
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>${junit.version}</version>
            <scope>test</scope>
        </dependency>

        <dependency>
            <groupId>org.mockito</groupId>
            <artifactId>mockito-core</artifactId>
            <version>5.7.0</version>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <!-- ========== REPOSITORIES ========== -->
    <repositories>
        <repository>
            <id>central</id>
            <url>https://repo.maven.apache.org/maven2</url>
        </repository>
        <repository>
            <id>nexus-internal</id>
            <url>https://nexus.acme.com/repository/maven-public/</url>
        </repository>
    </repositories>

    <!-- ========== DEPLOYMENT ========== -->
    <distributionManagement>
        <repository>
            <id>nexus-releases</id>
            <url>https://nexus.acme.com/repository/maven-releases/</url>
        </repository>
        <snapshotRepository>
            <id>nexus-snapshots</id>
            <url>https://nexus.acme.com/repository/maven-snapshots/</url>
        </snapshotRepository>
    </distributionManagement>

    <!-- ========== BUILD ========== -->
    <build>
        <finalName>vprofile-${project.version}</finalName>

        <plugins>
            <!-- Compiler -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.12.1</version>
                <configuration>
                    <source>${java.version}</source>
                    <target>${java.version}</target>
                    <parameters>true</parameters>
                </configuration>
            </plugin>

            <!-- War -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-war-plugin</artifactId>
                <version>3.4.0</version>
                <configuration>
                    <failOnMissingWebXml>false</failOnMissingWebXml>
                </configuration>
            </plugin>

            <!-- Surefire (unit test) -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>${surefire.version}</version>
                <configuration>
                    <argLine>${argLine} -Xmx1024m</argLine>
                </configuration>
            </plugin>

            <!-- Jacoco (coverage) -->
            <plugin>
                <groupId>org.jacoco</groupId>
                <artifactId>jacoco-maven-plugin</artifactId>
                <version>0.8.11</version>
                <executions>
                    <execution>
                        <goals><goal>prepare-agent</goal></goals>
                    </execution>
                    <execution>
                        <id>report</id>
                        <phase>verify</phase>
                        <goals><goal>report</goal></goals>
                    </execution>
                </executions>
            </plugin>

            <!-- SonarQube -->
            <plugin>
                <groupId>org.sonarsource.scanner.maven</groupId>
                <artifactId>sonar-maven-plugin</artifactId>
                <version>3.10.0.2594</version>
            </plugin>
        </plugins>
    </build>

    <!-- ========== PROFILES ========== -->
    <profiles>
        <profile>
            <id>production</id>
            <properties>
                <skipTests>false</skipTests>
            </properties>
            <build>
                <finalName>vprofile-prod-${project.version}</finalName>
            </build>
        </profile>

        <profile>
            <id>local</id>
            <properties>
                <db.url>jdbc:mysql://localhost:3306/accounts</db.url>
            </properties>
        </profile>
    </profiles>

</project>
```

## Maven coordinates

`groupId:artifactId:version` = unique identifier:

```text
com.acme:vprofile:2.0.0-SNAPSHOT
   │       │           │
   │       │           └ Version (semantic)
   │       └ Artifact name
   └ Group (reverse domain)
```

### Version naming

| Pattern | Meaning |
|---|---|
| `1.0.0` | Release, immutable |
| `1.0.0-SNAPSHOT` | Development version, mutable |
| `1.0.0-RC1` | Release candidate |
| `1.0.0-alpha`, `-beta` | Pre-release |
| `[1.0,2.0)` | Range (avoid for prod) |

SNAPSHOT: Maven check remote repo định kỳ → tải bản mới nhất. Release: cache permanent.

## Dependency scope

```xml
<dependency>
    <scope>compile</scope>     <!-- Default — compile + runtime + test -->
    <scope>provided</scope>     <!-- Compile only, runtime expected (vd Servlet API trên Tomcat) -->
    <scope>runtime</scope>      <!-- Runtime + test, không compile (vd JDBC driver) -->
    <scope>test</scope>         <!-- Test only -->
    <scope>system</scope>       <!-- Like provided + systemPath (avoid) -->
    <scope>import</scope>       <!-- Chỉ trong dependencyManagement, import BOM -->
</dependency>
```

## Transitive dependency

A depends on B, B depends on C → A tự nhiên có C.

```bash
mvn dependency:tree
```

Output:

```text
com.acme:vprofile:war:2.0
├── org.springframework:spring-webmvc:jar:6.1.0:compile
│   ├── org.springframework:spring-aop:jar:6.1.0:compile
│   ├── org.springframework:spring-beans:jar:6.1.0:compile
│   ├── org.springframework:spring-context:jar:6.1.0:compile
│   └── org.springframework:spring-core:jar:6.1.0:compile
├── com.mysql:mysql-connector-j:jar:8.2.0:runtime
└── org.junit.jupiter:junit-jupiter:jar:5.10.0:test
```

### Version conflict — nearest wins

A → B (1.0) → C (2.0)
A → D → C (3.0)

A "ở gần" C 3.0 hơn → 3.0 wins.

Exclude transitive:

```xml
<dependency>
    <groupId>org.springframework</groupId>
    <artifactId>spring-webmvc</artifactId>
    <exclusions>
        <exclusion>
            <groupId>commons-logging</groupId>
            <artifactId>commons-logging</artifactId>
        </exclusion>
    </exclusions>
</dependency>
```

Hoặc force version:

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>commons-logging</groupId>
            <artifactId>commons-logging</artifactId>
            <version>1.2</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

## Maven lifecycle chi tiết

```text
Default lifecycle:
  validate → initialize → generate-sources → process-sources →
  generate-resources → process-resources → compile → process-classes →
  generate-test-sources → process-test-sources → generate-test-resources →
  process-test-resources → test-compile → process-test-classes → test →
  prepare-package → package → pre-integration-test → integration-test →
  post-integration-test → verify → install → deploy

Clean lifecycle:
  pre-clean → clean → post-clean

Site lifecycle:
  pre-site → site → site-deploy
```

Khi `mvn package`, **mọi phase trước nó** chạy.

`mvn install` = + copy artifact vào `~/.m2/repository/` (local).
`mvn deploy` = + upload remote repo (Nexus).

### Phase vs Goal

- **Phase** = step trong lifecycle.
- **Goal** = task plugin cụ thể.

```bash
# Run phase
mvn compile

# Run goal
mvn compiler:compile

# Phase = collection of goals
# Phase `compile` execute goal `compiler:compile`
```

### List all phases

```bash
mvn help:describe -Dcmd=package
```

## Plugin

Plugin = code execute lifecycle goal. Built-in: `compiler`, `surefire`, `jar`, `war`, `deploy`.

### Bind plugin to phase

```xml
<plugin>
    <groupId>org.codehaus.mojo</groupId>
    <artifactId>exec-maven-plugin</artifactId>
    <version>3.1.0</version>
    <executions>
        <execution>
            <id>generate-config</id>
            <phase>generate-resources</phase>
            <goals><goal>exec</goal></goals>
            <configuration>
                <executable>scripts/gen-config.sh</executable>
            </configuration>
        </execution>
    </executions>
</plugin>
```

Plugin xuất hiện tự nhiên qua phase.

### Useful plugins

| Plugin | Mục đích |
|---|---|
| `maven-compiler-plugin` | Compile |
| `maven-surefire-plugin` | Unit test |
| `maven-failsafe-plugin` | Integration test |
| `maven-jar-plugin` | Tạo .jar |
| `maven-war-plugin` | Tạo .war |
| `maven-assembly-plugin` | Fat jar / custom assembly |
| `maven-shade-plugin` | Uber jar (shade dependencies) |
| `maven-source-plugin` | Tạo source jar |
| `maven-javadoc-plugin` | Tạo javadoc |
| `jacoco-maven-plugin` | Code coverage |
| `maven-pmd-plugin` | Static analysis |
| `maven-checkstyle-plugin` | Code style |
| `spotbugs-maven-plugin` | Bug pattern detection |
| `sonar-maven-plugin` | SonarQube scan |
| `dependency-check-maven` | OWASP dependency check |
| `versions-maven-plugin` | Manage version dependencies |

## Multi-module project

```text
vprofile-parent/
├── pom.xml                    ← Parent POM
├── common/
│   ├── pom.xml
│   └── src/...
├── api/
│   ├── pom.xml
│   └── src/...
└── web/
    ├── pom.xml
    └── src/...
```

Parent POM:

```xml
<modelVersion>4.0.0</modelVersion>
<groupId>com.acme</groupId>
<artifactId>vprofile-parent</artifactId>
<version>2.0.0-SNAPSHOT</version>
<packaging>pom</packaging>

<modules>
    <module>common</module>
    <module>api</module>
    <module>web</module>
</modules>

<dependencyManagement>
    <!-- Centralized version control -->
</dependencyManagement>
```

Child POM:

```xml
<parent>
    <groupId>com.acme</groupId>
    <artifactId>vprofile-parent</artifactId>
    <version>2.0.0-SNAPSHOT</version>
</parent>

<artifactId>api</artifactId>
<packaging>jar</packaging>

<dependencies>
    <dependency>
        <groupId>com.acme</groupId>
        <artifactId>common</artifactId>
        <version>${project.version}</version>
    </dependency>
</dependencies>
```

```bash
# Build parent + tất cả module
mvn install

# Build chỉ 1 module
mvn install -pl api

# Build module + dependencies cần
mvn install -pl api -am
```

## Build profiles

Activate khác nhau cho env:

```xml
<profiles>
    <profile>
        <id>dev</id>
        <activation>
            <activeByDefault>true</activeByDefault>
        </activation>
        <properties>
            <db.url>jdbc:mysql://localhost:3306/dev</db.url>
        </properties>
    </profile>

    <profile>
        <id>production</id>
        <properties>
            <db.url>jdbc:mysql://prod-rds:3306/prod</db.url>
        </properties>
    </profile>

    <profile>
        <id>ci</id>
        <activation>
            <property>
                <name>env.CI</name>
            </property>
        </activation>
    </profile>
</profiles>
```

```bash
mvn package                       # Default = dev
mvn package -Pproduction         # Production profile
mvn package -Pdev,ci             # Multiple
```

`<activation>` auto-activate by:
- `activeByDefault`.
- OS family/arch.
- JDK version.
- Property exist.
- File exist.

## Maven from CLI

```bash
# Common
mvn clean install
mvn clean package
mvn test
mvn -DskipTests install
mvn -Dtest=UserServiceTest test

# Offline (cache only)
mvn -o package

# Quiet / verbose
mvn -q package
mvn -X package

# Parallel
mvn -T 4 package         # 4 threads
mvn -T 1C package        # 1 thread per core

# Update SNAPSHOT
mvn -U package

# Specific phase + goal
mvn dependency:tree
mvn dependency:analyze
mvn versions:display-dependency-updates
mvn help:effective-pom
```

## settings.xml

`~/.m2/settings.xml`:

```xml
<settings>
    <!-- Local repo location -->
    <localRepository>/path/to/.m2/repository</localRepository>

    <!-- Mirror -->
    <mirrors>
        <mirror>
            <id>nexus-central</id>
            <mirrorOf>*</mirrorOf>
            <url>https://nexus.acme.com/repository/maven-public/</url>
        </mirror>
    </mirrors>

    <!-- Credentials -->
    <servers>
        <server>
            <id>nexus-releases</id>
            <username>${env.NEXUS_USER}</username>
            <password>${env.NEXUS_PASS}</password>
        </server>
    </servers>

    <!-- Proxy -->
    <proxies>
        <proxy>
            <id>corp-proxy</id>
            <active>true</active>
            <protocol>http</protocol>
            <host>proxy.acme.com</host>
            <port>8080</port>
        </proxy>
    </proxies>
</settings>
```

CI/CD: env variable `MAVEN_OPTS` cho JVM options, settings.xml ở `~/.m2/`.

## Optimization

### Parallel build

```bash
mvn -T 1C clean install
```

4-core machine → 4x faster cho multi-module.

### Skip phase không cần

```bash
mvn package -DskipTests              # Skip test execution
mvn install -Dmaven.test.skip=true   # Skip compile + execute test
mvn package -Dmaven.javadoc.skip=true
```

### Incremental compilation

Maven mặc định **không** incremental. Plugin `incremental` help. Gradle có sẵn.

### Build cache

`Takari Build Cache` plugin → cache module không đổi.

### Offline mode

```bash
mvn -o package
```

Container build: `mvn dependency:go-offline` lần đầu → cache → `mvn -o package` lần sau.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Quên `clean` | Stale class files | `mvn clean package` |
| Dependency version conflict | Runtime NoSuchMethodError | `dependency:tree`, exclude/manage |
| SNAPSHOT trong release | Build không reproducible | Use release version |
| `~/.m2/` không backup | First build chậm | Persist across CI |
| Plugin không bind phase | Goal không chạy auto | Explicit `<execution>` |
| Settings.xml secret commit Git | Lộ Nexus credential | Env variable |
| Network corp proxy | Download fail | Settings.xml proxy block |

## Tóm tắt bài 2

- **POM** = identity + dependencies + build + profiles.
- **Scope**: compile (default), provided, runtime, test, import.
- **Transitive**: `dependency:tree` debug, nearest wins, exclusion + dependencyManagement.
- **Lifecycle**: clean / default / site. Phase trước tự chạy.
- **Plugin** bind vào phase qua `<execution>`.
- **Multi-module** với parent POM + `<modules>`.
- **Profile** environment-specific.
- **settings.xml** local config (mirror, credential, proxy).
- **Parallel build** + cache cho speed.

**Bài kế tiếp** → [Bài 3: Nexus Repository Manager](03-nexus-repo.md)
