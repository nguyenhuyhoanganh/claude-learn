# Bài 2: Logstash cơ bản

Logstash = ETL pipeline. 3 stage: **Input → Filter → Output**. Bài này: cài, viết pipeline đầu tiên, Grok parse log.

## Pipeline anatomy

File `.conf` mô tả 3 section:

```text
input {
    # Một hoặc nhiều input plugins
    file {
        path => "/var/log/nginx/access.log"
    }
}

filter {
    # Một hoặc nhiều filter plugins
    grok {
        match => { "message" => "%{COMBINEDAPACHELOG}" }
    }
}

output {
    # Một hoặc nhiều output plugins
    elasticsearch {
        hosts => ["http://localhost:9200"]
        index => "nginx-logs-%{+YYYY.MM.dd}"
    }
}
```

→ Logstash đọc input continuously → mỗi event đi qua filters → đẩy ra output.

## Cài Logstash

### Docker

Thêm vào `docker-compose.yml` (Phase 1):

```yaml
logstash:
    image: docker.elastic.co/logstash/logstash:8.13.0
    container_name: logstash
    environment:
        - "LS_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
        - ./logstash/pipeline:/usr/share/logstash/pipeline
    depends_on:
        - elasticsearch
```

Tạo file `./logstash/pipeline/main.conf` → Logstash auto-load khi start.

### Native (Linux)

```bash
sudo apt-get install logstash
sudo systemctl start logstash
```

Config file: `/etc/logstash/conf.d/*.conf` — load all.

## Pipeline đầu tiên: hello world

`hello.conf`:

```text
input {
    stdin {}                          ← Đọc từ STDIN
}

output {
    stdout { codec => rubydebug }     ← In ra terminal, format đẹp
}
```

Chạy:

```bash
/usr/share/logstash/bin/logstash -f hello.conf
```

→ Logstash start, đọc dòng từ terminal. Gõ "hello world" → output:

```text
{
    "message"    => "hello world",
    "@timestamp" => 2026-05-24T10:00:00.000Z,
    "@version"   => "1",
    "host"       => { "hostname" => "machine" }
}
```

→ Logstash auto-add metadata `@timestamp`, `@version`, `host`.

Ctrl+C exit.

## Input plugins phổ biến

| Plugin     | Use case                                   |
|------------|--------------------------------------------|
| `file`     | Đọc file, watch new lines (như `tail -f`)  |
| `stdin`    | Manual test                                |
| `tcp` / `udp` | Listen socket                           |
| `http`     | HTTP endpoint receive                      |
| `kafka`    | Consume Kafka topic                        |
| `jdbc`     | SQL query database (bài 3)                 |
| `s3`       | S3 bucket                                  |
| `beats`    | Receive từ FileBeat / MetricBeat           |
| `syslog`   | Syslog protocol                            |
| `generator`| Generate fake event (test)                |

## Output plugins phổ biến

| Plugin           | Use case                       |
|------------------|--------------------------------|
| `elasticsearch`  | Push ES                        |
| `stdout`         | Debug                          |
| `file`           | Write file                     |
| `kafka`          | Push Kafka                     |
| `s3`             | Push S3                        |
| `email`          | Alert email                    |
| `mongodb`        | MongoDB                        |
| `pagerduty`      | Alert PagerDuty                |

## Import CSV

Common case: CSV file → ES.

`csv-import.conf`:

```text
input {
    file {
        path => "/data/movies.csv"
        start_position => "beginning"
        sincedb_path => "/dev/null"          ← Re-read mỗi run
    }
}

filter {
    csv {
        separator => ","
        skip_header => true
        columns => ["movieId", "title", "genres"]
    }
    mutate {
        convert => { "movieId" => "integer" }
        split   => { "genres" => "|" }      ← Pipe-separated → array
        remove_field => ["message", "host", "path", "@version", "@timestamp"]
    }
}

output {
    elasticsearch {
        hosts => ["http://localhost:9200"]
        index => "movies"
        document_id => "%{movieId}"          ← Set _id = movieId
    }
    stdout { codec => dots }                  ← In dấu chấm cho mỗi event
}
```

Run:

```bash
logstash -f csv-import.conf
```

→ Mỗi dòng CSV trở thành document trong index `movies`. Logstash exit khi đọc hết file (vì `file` plugin tail).

### Mutate filter

`mutate` = data transformation:

- `convert` — đổi type (string → int).
- `split` — string → array (split by delimiter).
- `rename` — đổi tên field.
- `remove_field` — bỏ field.
- `add_field` — thêm field.
- `lowercase`, `uppercase`, `strip` — string ops.
- `gsub` — regex replace.

## Grok filter cho log

Logs thường unstructured text:

```text
2026-05-24 10:23:45 ERROR Cannot connect to database
2026-05-24 10:24:01 INFO User login: alice
```

→ Cần parse thành structured fields (`timestamp`, `level`, `message`).

**Grok** = pattern matching cho text. Dùng predefined patterns:

```text
filter {
    grok {
        match => {
            "message" => "%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} %{GREEDYDATA:log_message}"
        }
    }
}
```

Cú pháp `%{PATTERN:field_name}`:
- **`TIMESTAMP_ISO8601`** match ISO date.
- **`LOGLEVEL`** match INFO/WARN/ERROR/...
- **`GREEDYDATA`** match tất cả còn lại.

→ Capture thành 3 fields: `timestamp`, `level`, `log_message`.

### Patterns built-in

Logstash ship hàng trăm patterns. Phổ biến:

| Pattern              | Match                              |
|----------------------|------------------------------------|
| `IP`                 | IP address                         |
| `IPV4` / `IPV6`      | Specific IP version                |
| `EMAIL`              | Email                              |
| `URI`                | URL                                 |
| `HOSTNAME`           | Hostname                            |
| `NUMBER`             | Số                                  |
| `WORD`               | Single word (alphanum)             |
| `GREEDYDATA`         | Mọi thứ còn lại                     |
| `DATA`               | Lazy match                         |
| `TIMESTAMP_ISO8601`  | ISO 8601 timestamp                  |
| `LOGLEVEL`           | INFO/WARN/ERROR/...                 |
| `COMBINEDAPACHELOG`  | Apache combined log format         |
| `COMMONAPACHELOG`    | Apache common log format           |
| `SYSLOGBASE`         | Syslog header                       |

Full list: <https://github.com/logstash-plugins/logstash-patterns-core/tree/main/patterns>.

### Apache log

```text
192.168.1.1 - - [24/May/2026:10:00:00 +0000] "GET /index.html HTTP/1.1" 200 1234
```

Grok pattern `COMBINEDAPACHELOG` parse luôn:

```text
filter {
    grok {
        match => { "message" => "%{COMBINEDAPACHELOG}" }
    }
}
```

→ Extract: `clientip`, `verb`, `request`, `response`, `bytes`, `useragent`, `referrer`...

### Grok debugger

Test pattern trước khi deploy:

- Web: <https://grokdebugger.com>.
- Kibana → Dev Tools → tab **Grok Debugger**.

Paste sample log + pattern → output preview match.

## GeoIP enrichment

Có IP address → lookup country/city/lat-lon:

```text
filter {
    geoip {
        source => "clientip"
    }
}
```

→ Add fields `geoip.country_name`, `geoip.city_name`, `geoip.location` (lat-lon).

→ Visualize trên Kibana Maps (Phase 6).

## Conditional filter

Apply filter conditional:

```text
filter {
    if [level] == "ERROR" {
        mutate {
            add_field => { "alert" => "true" }
        }
    }

    if [response] >= 500 {
        mutate {
            add_tag => ["server_error"]
        }
    }
}
```

## Multiple inputs / outputs

```text
input {
    file { path => "/var/log/app.log" type => "app" }
    file { path => "/var/log/nginx/access.log" type => "nginx" }
    beats { port => 5044 }              ← FileBeat
}

output {
    elasticsearch {
        hosts => ["http://es:9200"]
        index => "logs-%{type}-%{+YYYY.MM.dd}"
    }
    s3 {
        bucket => "logs-archive"
        prefix => "%{type}/%{+YYYY/MM/dd}"
    }
}
```

→ Index name dynamic theo `type` + date. Output cả ES và S3.

## Tóm tắt

- Pipeline: **input → filter → output**.
- File `.conf` định nghĩa pipeline.
- 30+ input plugins (file, beats, jdbc, kafka, s3, ...).
- 30+ output plugins (elasticsearch, file, s3, kafka, email, ...).
- Filter phổ biến: **csv**, **grok**, **mutate**, **geoip**, **date**.
- **Grok** parse text unstructured → fields. Dùng predefined patterns.
- Test grok với Grok Debugger trước deploy.
- Conditional filter dùng `if`.

---

→ [Bài tiếp theo: Logstash + JDBC (MySQL)](03-logstash-jdbc-mysql.md)
