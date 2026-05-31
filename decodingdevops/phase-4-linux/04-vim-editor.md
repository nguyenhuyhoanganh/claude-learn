# Bài 4: Vim editor — text editor sống còn trên server không GUI

## Vì sao Vim?

SSH vào server production. Cần sửa nhanh `/etc/nginx/nginx.conf`. Bạn gõ:

```bash
$ code nginx.conf
bash: code: command not found

$ notepad nginx.conf
bash: notepad: command not found

$ nano nginx.conf
bash: nano: command not found
```

Vim (hoặc tiền thân Vi) **luôn có sẵn** trên mọi distro Linux/Unix. **POSIX standard** yêu cầu phải có. Đây là **editor duy nhất bạn chắc chắn dùng được** trên mọi server lạ.

Có editor khác (nano, micro, helix...) — nhưng Vim **bắt buộc phải biết**, không có lựa chọn khác. Đầu tư 1-2 giờ học → cả sự nghiệp DevOps không lo.

> Vim curve học dốc, nhưng sau khi quen sẽ nhanh hơn mọi editor khác. Đó là vì sao một số dev senior dùng Vim như editor chính cả ngày.

## Vi vs Vim

- **vi**: editor cũ, có trên mọi Unix từ 1976. Tính năng hạn chế.
- **vim** ("Vi IMproved"): bản nâng cấp với syntax highlight, undo nhiều bước, plugin, multi-window, copy paste mượt.

Trên Ubuntu, gõ `vi` thường mở vim. Trên CentOS minimal, `vi` là `vi` thực sự — cài vim:

```bash
sudo dnf install -y vim          # CentOS/RHEL
sudo apt install -y vim          # Ubuntu/Debian
```

## 3 chế độ — concept cốt lõi

Vim **có chế độ** (modal editor). Đây là khác biệt lớn nhất với editor thông thường.

```text
           ┌──────────────────────┐
           │   COMMAND MODE       │  ← khi mở vim, bắt đầu ở đây
           │   (di chuyển, xoá,   │
           │   copy, paste...)    │
           └──┬──────┬──────┬─────┘
              │      │      │
            i/o/a    :      │
              │      │      │
              ▼      ▼      │
       ┌──────────┐ ┌──────────────┐
       │  INSERT  │ │ EX/COMMAND-  │
       │  MODE    │ │ LINE MODE    │
       │ (typing) │ │ (:w, :q...)  │
       └────┬─────┘ └──────┬───────┘
            │ Esc          │ Enter
            ▼              ▼
          (về Command mode)
```

| Mode | Vào bằng | Làm gì | Thoát |
|---|---|---|---|
| **Command** (Normal) | Esc | Navigate, copy, paste, delete, search | (mặc định) |
| **Insert** | `i`, `a`, `o`, `I`, `A`, `O` | Gõ text như editor thường | Esc |
| **Ex / Command-line** | `:` từ command | Save, quit, replace, run command | Enter / Esc |
| **Visual** (bonus) | `v`, `V`, Ctrl+V | Select text | Esc |

**Quy luật vàng**: khi mơ hồ, gõ **Esc** → về Command mode.

## Workflow tối thiểu — mở, edit, save, quit

```bash
vim hello.txt
```

Vim mở. Bạn ở **Command mode**.

```text
[bấm i để vào Insert mode]

Hello DevOps
This is my first vim file.

[bấm Esc về Command mode]
[bấm :wq Enter để save và quit]
```

Đó là **đủ** để dùng Vim cơ bản. Mọi thứ khác là tăng tốc.

## Insert mode — vào bằng cách nào?

| Phím | Hành vi |
|---|---|
| `i` | Insert **trước** ký tự con trỏ |
| `a` | Append **sau** ký tự con trỏ |
| `I` (Shift+i) | Insert **đầu dòng** |
| `A` (Shift+a) | Append **cuối dòng** |
| `o` | Tạo dòng mới **dưới** dòng hiện tại + vào Insert |
| `O` (Shift+o) | Tạo dòng mới **trên** dòng hiện tại + vào Insert |
| `s` | Xoá ký tự hiện tại + vào Insert |
| `S` | Xoá cả dòng + vào Insert |

`o` và `O` là phím **năng suất** — dùng nhiều nhất khi thêm dòng mới.

## Ex mode — lệnh `:`

Bắt đầu bằng `:`, kết thúc Enter.

| Lệnh | Tác dụng |
|---|---|
| `:w` | Save (write) |
| `:q` | Quit |
| `:wq` hoặc `:x` hoặc `ZZ` | Save + quit |
| `:q!` | Quit không save (force) |
| `:w!` | Save force (file readonly) |
| `:e <file>` | Mở file mới |
| `:r <file>` | Insert content file vào pwd |
| `:!<cmd>` | Chạy lệnh shell (`:!ls`, `:!date`) |
| `:set nu` | Hiện line number |
| `:set nonu` | Tắt line number |
| `:set paste` | Bật paste mode (giữ format khi paste) |
| `:set ic` | Ignore case khi search |
| `:syntax on` | Bật syntax highlight |

## Di chuyển trong Command mode

### Cơ bản

| Phím | Đi đâu |
|---|---|
| `h` `j` `k` `l` | Trái, xuống, lên, phải (hoặc arrow keys) |
| `0` | Đầu dòng |
| `^` | Đầu dòng (bỏ qua space) |
| `$` | Cuối dòng |
| `w` | Word kế tiếp |
| `b` | Word phía trước |
| `e` | Cuối word hiện tại |
| `(` `)` | Câu trước / sau |
| `{` `}` | Đoạn trước / sau |

### Nhảy nhanh

| Phím | Đi đâu |
|---|---|
| `gg` | Đầu file |
| `G` (Shift+g) | Cuối file |
| `nG` hoặc `:n` | Dòng `n` (vd `42G` hoặc `:42`) |
| `H` | Đầu màn hình |
| `M` | Giữa màn hình |
| `L` | Cuối màn hình |
| `Ctrl+F` | Xuống 1 trang |
| `Ctrl+B` | Lên 1 trang |
| `Ctrl+D` | Xuống nửa trang |
| `Ctrl+U` | Lên nửa trang |

### Multiplier — n + command

Hầu hết lệnh có thể prefix bằng số = "làm n lần":

```text
5j         Đi xuống 5 dòng
3w         Đi 3 word
10dd       Xoá 10 dòng
2yy        Copy 2 dòng
```

Đây là **Vim power** — kết hợp số + lệnh = năng suất khủng.

## Xoá — `d`, `x`

| Phím | Xoá gì |
|---|---|
| `x` | 1 ký tự (vị trí con trỏ) |
| `X` | 1 ký tự phía trước con trỏ |
| `dd` | Cả dòng (cut, vào clipboard Vim) |
| `dw` | Word kế tiếp |
| `d$` hoặc `D` | Từ con trỏ đến cuối dòng |
| `d0` | Từ con trỏ đến đầu dòng |
| `dgg` | Từ đây đến đầu file |
| `dG` | Từ đây đến cuối file |
| `5dd` | Xoá 5 dòng |
| `:5,10d` | Xoá dòng 5 đến 10 |

**Lưu ý**: `dd` thực ra là **cut**, không phải delete — text vào "register" (clipboard Vim) và **paste lại được** bằng `p`.

## Copy / Paste — `y`, `p`

`y` = **y**ank (copy). `p` = **p**aste.

| Phím | Hành động |
|---|---|
| `yy` (hoặc `Y`) | Copy cả dòng |
| `yw` | Copy 1 word |
| `y$` | Copy đến cuối dòng |
| `5yy` | Copy 5 dòng |
| `p` | Paste **sau** con trỏ (hoặc dưới dòng nếu là dòng) |
| `P` (Shift+p) | Paste **trước** con trỏ (hoặc trên dòng) |

**Workflow paste OS clipboard**: text từ ngoài → paste vào Vim:

```text
:set paste                 ← Bật paste mode (không auto-indent)
i                          ← Insert mode
Ctrl+Shift+V (terminal)    ← Paste
Esc
:set nopaste               ← Tắt
```

Nếu không `set paste`, Vim sẽ **tự indent** text dán vào — gây rối XML/YAML.

## Undo / Redo

| Phím | Hành động |
|---|---|
| `u` | Undo |
| `Ctrl+R` | Redo |
| `U` | Undo cả dòng |

Vim hỗ trợ **undo tree** — bạn có thể undo qua hàng trăm thao tác, kể cả qua file đóng/mở lại (nếu bật undofile).

## Search — `/`, `?`, `n`, `N`

```text
/text          Search "text" về SAU
?text          Search "text" về TRƯỚC
n              Đến match kế tiếp (cùng hướng)
N              Đến match kế tiếp (NGƯỢC hướng)
*              Search word dưới con trỏ (forward)
#              Search word dưới con trỏ (backward)
```

Case-insensitive tạm thời:

```text
/text\c        Search "text" ignore case
```

Hoặc bật permanent:

```text
:set ic        Ignore case
:set noic      Trở lại case sensitive
```

## Search and Replace — `:s`

```text
:s/old/new/                   Replace lần đầu trong dòng hiện tại
:s/old/new/g                  Replace MỌI lần trong dòng (global per line)
:%s/old/new/g                 Replace toàn file
:%s/old/new/gc                Replace toàn file, hỏi xác nhận từng cái
:1,10s/old/new/g              Replace từ dòng 1 đến 10
:'<,'>s/old/new/g             Replace trong selection (Visual mode)
:%s/\<word\>/new/g            Word boundary (chỉ match "word" độc lập)
:%s/old/new/gi                Case-insensitive
```

`%s` = "trong toàn file". `g` = "toàn dòng" (không chỉ first match). `c` = "confirm".

### Ví dụ thực tế — đổi tên biến trong code

```text
:%s/userName/user_name/g       Đổi camelCase → snake_case
:%s/v1\.0\.0/v1.0.1/g          Bump version (escape dấu .)
:%s/^#/##/g                    Đổi mọi heading H1 → H2 trong Markdown
```

## Visual mode — select text

```text
v              Character-wise select
V              Line-wise select
Ctrl+V         Block (column) select
```

Sau khi select, có thể:

```text
d              Xoá selection
y              Copy
c              Change (xoá + Insert mode)
:s/x/y/        Replace trong selection
>              Indent right
<              Indent left
=              Auto-format
```

**Block select** mạnh: edit nhiều dòng cùng cột.

## Cấu hình Vim — `~/.vimrc`

Edit `~/.vimrc` để thiết lập mặc định:

```vim
" Hiện line number
set number

" Cú pháp highlight
syntax on

" Tab = 4 space
set tabstop=4
set shiftwidth=4
set expandtab

" Hiển thị match khi search
set incsearch
set hlsearch

" Ignore case khi search nhưng smart case
set ignorecase
set smartcase

" Auto-indent
set autoindent
set smartindent

" Cho phép backspace xoá qua line, indent, start
set backspace=indent,eol,start

" Hiển thị cursorline
set cursorline

" Mouse support
set mouse=a

" Color scheme
colorscheme desert
```

File này được **load mỗi lần mở vim**. Bạn có thể commit lên Git, sync nhiều server bằng `~/dotfiles/`.

## Tab + Window — multi-buffer

Vim mở nhiều file cùng lúc:

```bash
vim file1 file2 file3
```

Các phím navigate buffer:

```text
:ls              List buffer mở
:b 2             Chuyển sang buffer 2
:bn              Buffer kế
:bp              Buffer trước
:bd              Đóng buffer
```

Split window:

```text
:split file2     Chia ngang (top/bottom)
:vsplit file2    Chia dọc (left/right)
Ctrl+w + arrows  Di chuyển giữa window
Ctrl+w + q       Đóng window
```

Đặc biệt **`:vsplit`** so sánh 2 file rất tiện — pair với `:diffthis` được `vim -d a b`.

## 20 phím Vim phải nhớ

| Phím | Hành động |
|---|---|
| `i` | Insert |
| `Esc` | Về Command mode |
| `:w` | Save |
| `:q` | Quit |
| `:wq` | Save + quit |
| `:q!` | Quit không save |
| `dd` | Xoá dòng |
| `yy` | Copy dòng |
| `p` | Paste |
| `u` | Undo |
| `Ctrl+R` | Redo |
| `/text` | Search |
| `n` / `N` | Match next/prev |
| `gg` / `G` | Đầu / cuối file |
| `0` / `$` | Đầu / cuối dòng |
| `:%s/a/b/g` | Replace toàn file |
| `o` | Dòng mới phía dưới + Insert |
| `:set nu` | Hiện line number |
| `5dd` | Xoá 5 dòng |
| `v` + d | Visual select + cut |

Học 20 phím này = đủ dùng 95% trường hợp.

## Cheat sheet vận hành nhanh

```text
Mở:           vim file.conf
Sửa:          i → gõ → Esc
Save & quit:  :wq
Quit:         :q  hoặc  ZZ
Quit force:   :q!
Search:       /pattern
Replace all:  :%s/old/new/g
Go to line N: :N  hoặc  NG
Show line #:  :set nu
Paste mode:   :set paste
```

## Trade-off — khi nào dùng editor khác?

- **nano**: dễ hơn (footer hiện shortcut), nhưng yếu hơn nhiều. OK cho user mới sửa 1 dòng.
- **VS Code + Remote SSH**: edit file server từ VS Code → tốt cho code dài. Vẫn nên biết Vim cho emergency.
- **Helix**: modern modal editor, smarter defaults. Còn mới, không có sẵn.
- **Emacs**: powerful, nhưng community Linux server dùng Vim nhiều hơn.

Khoá này dùng **Vim** vì là chuẩn lề DevOps.

## Tóm tắt bài 4

- Vim **luôn có sẵn** — editor sống còn trên server.
- 3 mode: **Command**, **Insert**, **Ex** (`:`). Esc luôn về Command.
- `i/a/o` vào Insert, `:wq` save+quit, `:q!` quit không save.
- **Navigate**: `hjkl`, `gg/G`, `w/b`, `0/$`.
- **Edit**: `dd` (cut), `yy` (copy), `p` (paste), `u` (undo).
- **Search**: `/text`, `n`. **Replace**: `:%s/old/new/g`.
- Multiplier: `5dd`, `3yy` — số + lệnh.
- Cấu hình `~/.vimrc` cho settings mặc định.

**Bài kế tiếp** → [Bài 5: Lọc, tìm và xử lý text — grep, cut, sort, awk, sed, find](05-loc-tim-text.md)
