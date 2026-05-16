# Bài 1: NGINX as Web Server

## Cấu hình cơ bản

```nginx
# nginx.conf
events { }

http {
    server {
        listen 80;

        location / {
            root /usr/share/nginx/html;
        }
    }
}
```

**Giải thích:**
- `events {}`: Required block (kể cả để trống)
- `http {}`: Layer 7 HTTP context
- `server {}`: Virtual server listening on port 80
- `location /`: Match tất cả requests
- `root`: Thư mục chứa static files

---

## Serve Multiple Paths

```nginx
http {
    server {
        listen 80;

        # Serve root HTML
        location / {
            root /var/www/html;
            index index.html;
        }

        # Serve images từ thư mục khác
        location /images {
            root /var/www/static;
            # Requests đến /images/logo.png → /var/www/static/images/logo.png
        }
    }
}
```

---

## MIME Types

Nếu không có MIME types, browser sẽ không biết cách render file:

```nginx
http {
    include /etc/nginx/mime.types;  # Include default MIME types

    server {
        listen 80;
        location / {
            root /usr/share/nginx/html;
        }
    }
}
```

---

## Custom Error Pages

```nginx
http {
    server {
        listen 80;

        error_page 404 /404.html;
        error_page 500 502 503 504 /50x.html;

        location /404.html {
            root /var/www/errors;
        }
    }
}
```

---

## Reload Configuration

```bash
# Check config syntax
nginx -t

# Reload (không restart, không drop connections)
nginx -s reload

# Stop
nginx -s stop
```

---
**Tiếp theo:** Bài 2 - NGINX as Layer 7 Proxy →
