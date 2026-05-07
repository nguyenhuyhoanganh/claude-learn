# Udemy Transcript Downloader

Tự động tải transcript (phụ đề tiếng Anh) từ khóa học Udemy Business của Samsung.

## Yêu cầu

- Python 3.8+
- Tài khoản đăng nhập tại `samsungu.udemy.com`

## Cài đặt lần đầu

```bash
cd /Users/hoanganh/Workspace/learn/transcripts
python3 -m venv .venv
.venv/bin/pip install requests
```

## Chạy script

```bash
cd /Users/hoanganh/Workspace/learn/transcripts
.venv/bin/python download_transcripts.py
```

Script sẽ tạo các thư mục theo chapter và lưu từng lecture thành file `.txt`. Các file đã tải sẽ được bỏ qua (có thể chạy lại nhiều lần an toàn).

## Cấu trúc output

```
transcripts/
└── docker-kubernetes-the-practical-guide/
    ├── Section 01 - Getting Started/
    │   ├── 001_Welcome to the Course.txt
    │   ├── 002_What Is Docker?.txt
    │   └── ...
    ├── Section 02 - Docker Images & Containers The Core Building Blocks/
    │   ├── 014_Module Introduction.txt
    │   └── ...
    └── ...
```

## Khi cookies hết hạn

Cookies Udemy hết hạn sau vài ngày. Khi script báo lỗi 401/403, làm theo các bước sau:

**Bước 1:** Mở Chrome, truy cập `samsungu.udemy.com`, mở bất kỳ lecture nào

**Bước 2:** Nhấn `F12` → tab **Network** → filter **Fetch/XHR**

**Bước 3:** Click sang lecture khác, tìm request đến `samsungu.udemy.com/api-2.0/...` → chuột phải → **Copy as cURL**

**Bước 4:** Từ chuỗi cURL đó, tìm và cập nhật 3 giá trị sau trong `cookies.json`:

| Key | Tìm trong cURL |
|-----|---------------|
| `access_token` | `-b '...access_token=XYZ...'` |
| `dj_session_id` | `dj_session_id=XYZ` |
| `csrftoken` | `csrftoken=XYZ` |

**Bước 5:** Chạy lại script — các file đã tải sẽ không bị tải lại.

## Đổi khóa học

Mở `download_transcripts.py` và sửa 1 dòng duy nhất:

```python
COURSE_SLUG = "docker-kubernetes-the-practical-guide"
```

Lấy slug từ URL khóa học, phần nằm giữa `/course/` và `/learn/`:

```
https://samsungu.udemy.com/course/docker-kubernetes-the-practical-guide/learn/lecture/22625180
                                  ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
                                  đây là COURSE_SLUG, chép phần này vào script
```

Không cần quan tâm đến số `22625180` ở cuối URL — đó là lecture ID, script không dùng.

## Đổi ngôn ngữ transcript

Mở `download_transcripts.py`, sửa dòng:

```python
PREFERRED_LOCALE = "en_US"
```

Một số locale phổ biến: `vi_VN` (tiếng Việt), `zh_CN` (tiếng Trung), `ja_JP` (tiếng Nhật).
