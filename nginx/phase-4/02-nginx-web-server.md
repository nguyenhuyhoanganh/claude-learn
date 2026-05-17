# Bài 2: NGINX as web server — serve static content production-grade

Vai trò "kinh điển nhất" của NGINX là phục vụ static file: HTML, CSS, JS, ảnh. Bài này không dừng ở "cấu hình tối thiểu", mà đi vào pattern **production**: `root` vs `alias`, MIME types, gzip, sendfile, cache headers, error page.

## Config tối giản

```nginx
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    server {
        listen 80;
        server_name example.com;
        
        root  /var/www/html;
        index index.html;

        location / {
            try_files $uri $uri/ =404;
        }
    }
}
```

5 dòng tạo nên một web server. Hãy phân tích từng cái.

## `server_name` — virtual host

```nginx
server_name example.com www.example.com;
```

NGINX match `Host` header trong HTTP request với `server_name`. Có thể có **nhiều `server` block** cùng `listen 80;`, NGINX chọn block đúng theo Host header:

```nginx
server {
    listen 80;
    server_name a.example.com;
    root /var/www/a;
}

server {
    listen 80;
    server_name b.example.com;
    root /var/www/b;
}
```

→ Request `Host: a.example.com` → block đầu. `Host: b.example.com` → block sau.

`server_name` accept:
- Exact: `example.com`
- Wildcard: `*.example.com`, `mail.*`
- Regex: `~^(?<sub>.+)\.example\.com$`

Nếu không match nào → fallback **default_server** (server block đầu tiên, hoặc block có `listen 80 default_server;`).

## `root` vs `alias` — khác biệt then chốt

Đây là một **bẫy phổ biến**. Hai directive nhìn giống nhau nhưng map URL khác nhau.

### `root` — concat URL vào path

```nginx
location /images/ {
    root /var/www;
}
```

Request `GET /images/logo.png` → file `/var/www/images/logo.png` (root **+** URL).

→ URL path **được giữ nguyên** trong filesystem path.

### `alias` — replace URL prefix

```nginx
location /images/ {
    alias /var/www/static/;
}
```

Request `GET /images/logo.png` → file `/var/www/static/logo.png` (alias **thay thế** `/images/`).

→ URL prefix **bị xoá**, alias path đặt vào chỗ đó.

### So sánh trực quan

```text
location /images/ {
    root  /var/www;          alias /var/www/static/;
}

GET /images/logo.png
   → root:  /var/www + /images/logo.png  = /var/www/images/logo.png
   → alias: /var/www/static/ + logo.png  = /var/www/static/logo.png
```

**Khi nào dùng cái nào**:
- `root` — URL path khớp 1-1 với filesystem.
- `alias` — URL prefix bị "ẩn", filesystem khác hẳn.

> Bẫy thường gặp: `alias` **bắt buộc kết thúc bằng `/`** nếu location có `/`. Ngược lại NGINX hành xử kỳ lạ.

## `try_files` — fallback có thứ tự

```nginx
location / {
    try_files $uri $uri/ /index.html =404;
}
```

NGINX thử lần lượt:
1. File `$uri` (vd `/about.html`).
2. Directory `$uri/` (tìm `index` trong đó).
3. File `/index.html` (cuối cùng).
4. Nếu không có cái nào — trả `404`.

→ Pattern này **đặc biệt quan trọng** cho **single-page app** (React, Vue, Angular):

```nginx
location / {
    try_files $uri $uri/ /index.html;       # SPA fallback
}
```

Mọi URL không match file thật → trả `index.html` → React Router xử lý.

## MIME types — vì sao quan trọng

Nếu không khai báo, browser nhận file kèm `Content-Type: application/octet-stream` (binary) → thay vì render HTML, browser download xuống.

```nginx
http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
}
```

`/etc/nginx/mime.types` là file mapping extension → MIME:

```text
types {
    text/html                             html htm shtml;
    text/css                              css;
    text/javascript                       js mjs;
    application/json                      json;
    image/png                             png;
    image/jpeg                            jpeg jpg;
    image/svg+xml                         svg svgz;
    image/webp                            webp;
    font/woff                             woff;
    font/woff2                            woff2;
    application/pdf                       pdf;
    ...
}
```

Đa số NGINX install đã có file này. **Chỉ cần `include`**.

## sendfile — zero-copy phục vụ file

```nginx
http {
    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
}
```

| Directive | Mục đích |
|---|---|
| `sendfile on` | Dùng syscall `sendfile()` — copy disk → socket trong kernel, không qua user-space buffer |
| `tcp_nopush on` | Gửi data theo batch lớn (header + payload đầu), giảm số packet |
| `tcp_nodelay on` | Tắt Nagle algorithm cho keepalive connection — gửi response nhỏ ngay |

```text
Không sendfile (truyền thống):
   disk ──► kernel buf ──► user buf (nginx) ──► kernel buf ──► socket
                              (copy lần 2 + 3)

sendfile:
   disk ──► kernel buf ──────────────────────────────────────► socket
                              (zero-copy, gần như)
```

`sendfile` đặc biệt hiệu quả cho file lớn. NGINX serve image/video/PDF nhanh hơn ~30% nhờ điều này.

## Compression — gzip + brotli

Nén response giảm bandwidth 60-80% cho HTML/CSS/JS:

```nginx
http {
    gzip on;
    gzip_vary on;                                    # Vary: Accept-Encoding header
    gzip_min_length 1024;                            # chỉ nén file > 1KB
    gzip_comp_level 5;                               # 1-9, 5 là cân bằng
    gzip_types
        text/plain
        text/css
        text/xml
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;
    
    # Disable for buggy old browsers
    gzip_disable "msie6";
}
```

> KHÔNG nén image (JPEG, PNG, WebP) — đã được nén ở format. `gzip_types` chỉ liệt kê text-based.

Brotli (Google) nén tốt hơn gzip ~20% nhưng cần module riêng:

```bash
apt-get install nginx-module-brotli
```

```nginx
load_module modules/ngx_http_brotli_filter_module.so;
load_module modules/ngx_http_brotli_static_module.so;

http {
    brotli on;
    brotli_comp_level 4;
    brotli_types text/css application/javascript image/svg+xml;
}
```

## Cache headers cho static asset

Static asset (logo, CSS hash, JS bundle) nên cache **lâu** ở browser:

```nginx
location ~* \.(jpg|jpeg|png|gif|webp|ico|svg|woff2?|ttf|eot|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    access_log off;
}
```

| Header | Hiệu ứng |
|---|---|
| `expires 1y` | NGINX set `Expires: <date_1_year_later>` |
| `Cache-Control: public, immutable` | Browser cache, không revalidate |
| `access_log off` | Giảm log spam cho asset (hàng nghìn/giây) |

**Quan trọng**: build tool (Webpack/Vite) gắn hash vào filename (`app.a3f8c2.js`) — đổi nội dung = đổi tên → cache không sai.

## Custom error page

Mặc định NGINX trả "404 Not Found" plain. Custom HTML đẹp:

```nginx
server {
    error_page 404            /404.html;
    error_page 500 502 503 504 /50x.html;
    
    location = /404.html {
        root /var/www/error;
        internal;        # chỉ NGINX trả, browser không trực tiếp truy cập được
    }
    
    location = /50x.html {
        root /var/www/error;
        internal;
    }
}
```

`internal;` quan trọng — chặn browser request thẳng `/404.html` (vẫn được serve thay vì 404 redirect).

## CORS — Cross-Origin Resource Sharing

Khi static asset được fetch từ domain khác (vd CDN, font):

```nginx
location ~* \.(woff2?|ttf|otf|eot)$ {
    add_header Access-Control-Allow-Origin "*";
    add_header Access-Control-Allow-Methods "GET, OPTIONS";
    expires 1y;
}
```

→ Browser cho phép `@font-face` load font từ domain này.

## Security headers — tối thiểu phải có

```nginx
server {
    # Force HTTPS — tell browser luôn dùng HTTPS lần sau
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Chống XSS đơn giản
    add_header X-Content-Type-Options "nosniff" always;
    
    # Click-jacking
    add_header X-Frame-Options "SAMEORIGIN" always;
    
    # Referrer policy
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Content Security Policy (tùy app, đơn giản hoá)
    add_header Content-Security-Policy "default-src 'self'" always;
}
```

`always` flag = gửi header kể cả response error (4xx/5xx). Quan trọng cho HSTS.

## Cấu hình hoàn chỉnh cho SPA frontend

```nginx
events { worker_connections 1024; }

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    
    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
    keepalive_timeout 30;
    
    # Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;

    server {
        listen 80;
        server_name app.example.com;
        
        root  /var/www/app/dist;
        index index.html;

        # Asset cache lâu
        location ~* \.(jpg|jpeg|png|gif|webp|ico|svg|woff2?|ttf|css|js)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            access_log off;
            try_files $uri =404;
        }

        # SPA fallback
        location / {
            add_header Cache-Control "no-cache";          # index.html không cache
            try_files $uri $uri/ /index.html;
        }
        
        # Security
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
    }
}
```

Config này là **production-ready** cho 99% SPA app.

## Khi NGINX **không** nên serve static

| Tình huống | Đề xuất |
|---|---|
| User-generated content lớn (ảnh user upload triệu lượt) | Object storage (S3) + CDN trước (CloudFront, Fastly) |
| Asset cần global low latency | CDN (Cloudflare, Fastly, AWS CloudFront) |
| Video streaming (HLS, DASH) | Dedicated streaming server hoặc CDN |
| File rất lớn, ít truy cập (backup, log) | Object storage; NGINX không phù hợp |

NGINX cực giỏi serve static **gần**, nhưng không thay được CDN cho global delivery.

## Bẫy thường gặp

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| `root` thay vì `alias` (hoặc ngược lại) | File 404 dù file thật có | Hiểu rõ semantic của 2 directive |
| Quên `include mime.types` | Browser download HTML thay vì render | Luôn include trong `http` block |
| Quên `try_files ... /index.html` cho SPA | React route refresh → 404 | Add SPA fallback |
| Quên `add_header ... always` | Header không có với error response | Dùng `always` |
| Cache index.html quá lâu | Deploy mới user không thấy | `Cache-Control: no-cache` cho `index.html` |
| Quên `sendfile on` | Performance thấp cho file lớn | Default đa số đã bật, kiểm tra config |
| `gzip` cho image | Tốn CPU, không thu lợi (đã nén) | `gzip_types` chỉ text-based |

## Tóm tắt bài 2

- NGINX serve static với `root` (concat URL) hoặc `alias` (replace prefix) — đừng nhầm.
- `try_files` cho SPA fallback `try_files $uri $uri/ /index.html`.
- Include `mime.types` để browser biết MIME.
- `sendfile on` + `tcp_nopush` = zero-copy, performance tối đa.
- `gzip` cho text-based, không cho image.
- `expires 1y` + `Cache-Control immutable` cho hash filename asset; `no-cache` cho `index.html`.
- Security headers (HSTS, X-Frame-Options...) là yêu cầu tối thiểu production.
- NGINX không thay CDN cho global delivery.

**Bài kế tiếp** → [Bài 3: NGINX as Layer 7 reverse proxy — path-based routing + block](03-nginx-layer7-proxy.md)
