# Bài 1: File IO — Read, Write, Buffer, Atomic write

File operation là **bread-and-butter** của backend developer. Go có `os`, `io`, `bufio`, `io/fs` stdlib, mỗi package giải quyết một layer. Bài này dạy đủ pattern production: đọc file (small/large), write atomic (không corrupt khi crash), tail log, walk directory, embed asset.

## Read file — Cách nhanh

```go
data, err := os.ReadFile("config.json")
if err != nil {
    return err
}
fmt.Println(string(data))
```

`os.ReadFile`:
- Đơn giản nhất.
- Đọc **toàn bộ** vào memory.
- OK cho file < 100MB.
- KHÔNG dùng cho file lớn (sẽ OOM).

## Read file — Lớn (streaming)

```go
f, err := os.Open("big.log")
if err != nil {
    return err
}
defer f.Close()

buf := make([]byte, 4096)
for {
    n, err := f.Read(buf)
    if n > 0 {
        process(buf[:n])
    }
    if err == io.EOF {
        break
    }
    if err != nil {
        return err
    }
}
```

Buffer 4KB → đọc từng chunk. Memory cố định.

## Read file — Theo dòng (bufio.Scanner)

```go
f, err := os.Open("log.txt")
if err != nil { return err }
defer f.Close()

scanner := bufio.NewScanner(f)
for scanner.Scan() {
    line := scanner.Text()
    process(line)
}
if err := scanner.Err(); err != nil {
    return err
}
```

`bufio.Scanner`:
- Đọc theo dòng (default).
- Buffer internal.
- Limit dòng max 64KB (default) — đổi với `scanner.Buffer(buf, max)`.

## Write file — Cách đơn giản

```go
data := []byte("hello world")
err := os.WriteFile("out.txt", data, 0644)
```

Permission `0644`:
- Owner: read + write.
- Group: read.
- Others: read.

→ Atomic? **Không**. Nếu crash giữa chừng → file partial. Bài sau fix.

## Write file — Streaming với bufio

```go
f, err := os.Create("out.txt")
if err != nil { return err }
defer f.Close()

w := bufio.NewWriter(f)
defer w.Flush()    // QUAN TRỌNG — flush trước khi close

for _, line := range lines {
    fmt.Fprintln(w, line)
}
```

`bufio.Writer` buffer (4KB default) → giảm syscall. Phải `Flush()` trước `Close()`.

## Append to file

```go
f, err := os.OpenFile("log.txt",
    os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
if err != nil { return err }
defer f.Close()

f.WriteString("new line\n")
```

`os.OpenFile` flag:
- `O_RDONLY`, `O_WRONLY`, `O_RDWR` — mode.
- `O_APPEND` — append.
- `O_CREATE` — tạo nếu chưa có.
- `O_TRUNC` — truncate nếu có.
- `O_EXCL` — fail nếu đã có (combine với `O_CREATE` → exclusive create).

## Atomic write — Production safe

```go
func atomicWrite(path string, data []byte) error {
    dir := filepath.Dir(path)
    tmp, err := os.CreateTemp(dir, ".atomic-")
    if err != nil { return err }
    
    if _, err := tmp.Write(data); err != nil {
        tmp.Close()
        os.Remove(tmp.Name())
        return err
    }
    if err := tmp.Sync(); err != nil {     // ép flush disk
        tmp.Close()
        os.Remove(tmp.Name())
        return err
    }
    if err := tmp.Close(); err != nil {
        os.Remove(tmp.Name())
        return err
    }
    
    return os.Rename(tmp.Name(), path)     // atomic
}
```

Steps:
1. Write vào temp file (same dir để rename atomic).
2. `Sync()` → ép flush kernel buffer xuống disk.
3. `Close()`.
4. `Rename()` → atomic on POSIX (cùng filesystem).

→ Nếu crash giữa chừng: file gốc nguyên vẹn, temp file leftover (cleanup periodically).

## File info

```go
info, err := os.Stat("file.txt")
if err != nil {
    if os.IsNotExist(err) {
        // file không tồn tại
    }
    return err
}

fmt.Println(info.Name())     // file.txt
fmt.Println(info.Size())     // bytes
fmt.Println(info.Mode())     // -rw-r--r--
fmt.Println(info.ModTime())  // last modified
fmt.Println(info.IsDir())    // false
```

## Check file exists

```go
if _, err := os.Stat(path); err == nil {
    // exists
} else if errors.Is(err, os.ErrNotExist) {
    // không tồn tại
}
```

## Walk directory

```go
err := filepath.WalkDir("./root", func(path string, d fs.DirEntry, err error) error {
    if err != nil { return err }
    if d.IsDir() {
        return nil    // skip directory (hoặc filepath.SkipDir)
    }
    if filepath.Ext(path) == ".go" {
        fmt.Println(path)
    }
    return nil
})
```

`filepath.WalkDir` (Go 1.16+) nhanh hơn `filepath.Walk` cũ.

Skip subdirectory:
```go
return filepath.SkipDir   // skip cả tree từ đây
return filepath.SkipAll   // skip toàn bộ walk
```

## Filepath — Cross-platform path

```go
import "path/filepath"

p := filepath.Join("a", "b", "c.txt")
// Unix: "a/b/c.txt"
// Windows: "a\\b\\c.txt"

dir := filepath.Dir("/etc/conf/app.yaml")        // "/etc/conf"
base := filepath.Base("/etc/conf/app.yaml")      // "app.yaml"
ext := filepath.Ext("app.yaml")                  // ".yaml"
absPath, _ := filepath.Abs("./conf")             // "/Users/x/conf"
rel, _ := filepath.Rel("/a/b", "/a/b/c/d")       // "c/d"
```

**Đừng** concat string `+` cho path. Luôn dùng `filepath.Join`.

## Directory operations

```go
// Create
os.Mkdir("./newdir", 0755)         // chỉ 1 level
os.MkdirAll("./a/b/c", 0755)       // recursive (mkdir -p)

// Remove
os.Remove("file.txt")               // file only
os.RemoveAll("./tree")              // recursive (rm -rf)

// Read directory entries
entries, _ := os.ReadDir(".")
for _, e := range entries {
    fmt.Println(e.Name(), e.IsDir())
}

// Get cwd
cwd, _ := os.Getwd()

// Change dir
os.Chdir("/tmp")
```

## Temp file / directory

```go
// Temp file in $TMPDIR
f, err := os.CreateTemp("", "myapp-*.tmp")
defer os.Remove(f.Name())
defer f.Close()

// Temp dir
dir, err := os.MkdirTemp("", "myapp-*")
defer os.RemoveAll(dir)
```

`*` trong pattern = random suffix. Đảm bảo unique.

Use case:
- Test fixtures.
- Atomic write (như trên).
- Process tạm.

## Embed static assets — `embed` package (Go 1.16+)

```go
import _ "embed"

//go:embed config.yaml
var configData []byte

//go:embed templates/*.html
var templatesFS embed.FS

//go:embed assets
var assetsFS embed.FS

func main() {
    fmt.Println(string(configData))
    
    // Serve embedded files
    http.Handle("/", http.FileServer(http.FS(assetsFS)))
}
```

→ Compile asset vào binary. Deploy 1 file, không lo missing template.

Patterns:
- Embed default config.
- Embed templates HTML.
- Embed migration SQL.
- Embed static frontend (single binary deploy).

## File locking

```go
import "syscall"

func lockFile(f *os.File) error {
    return syscall.Flock(int(f.Fd()), syscall.LOCK_EX)
}

func unlock(f *os.File) error {
    return syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
}
```

Advisory lock — process khác **đồng ý** check. Production thường dùng filelock lib (`gofrs/flock`).

## Tail file (-f)

```go
import "github.com/nxadm/tail"

t, _ := tail.TailFile("/var/log/app.log", tail.Config{
    Follow: true,
    ReOpen: true,    // re-open on logrotate
})

for line := range t.Lines {
    fmt.Println(line.Text)
}
```

Stdlib không có sẵn `tail -f`. Dùng lib `nxadm/tail`.

## io.Reader / io.Writer — Universal interface

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}
```

Mọi type implement = file, network, buffer, compression, encryption, ...

Pattern: function nhận `io.Reader` thay vì `*os.File`:
```go
func process(r io.Reader) error {
    scanner := bufio.NewScanner(r)
    // ...
}

// Dùng được với file, stdin, network, strings, bytes
process(strings.NewReader("hello"))
process(os.Stdin)
process(httpResponse.Body)
process(file)
```

→ Code reusable cao.

## `io.Copy` — Move data

```go
io.Copy(dst, src)             // dst là Writer, src là Reader

// File to file
src, _ := os.Open("a.txt")
dst, _ := os.Create("b.txt")
io.Copy(dst, src)

// Network to file
io.Copy(file, response.Body)

// File to stdout
io.Copy(os.Stdout, file)
```

Đơn giản hơn loop Read/Write thủ công.

## Compress / Decompress

```go
import "compress/gzip"

// Compress
f, _ := os.Create("data.gz")
defer f.Close()
gw := gzip.NewWriter(f)
defer gw.Close()
gw.Write([]byte("hello world"))

// Decompress
f, _ := os.Open("data.gz")
defer f.Close()
gr, _ := gzip.NewReader(f)
defer gr.Close()
data, _ := io.ReadAll(gr)
```

→ Reader/Writer chain — Go's biggest IO superpower.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên `defer Close()` | File leak | `defer f.Close()` ngay |
| Quên `defer Flush()` cho bufio.Writer | Data mất | `defer w.Flush()` |
| `os.ReadFile` cho file lớn | OOM | Stream |
| Write không atomic | File partial khi crash | atomicWrite pattern |
| Path concat `+` | Bug Windows | `filepath.Join` |
| `os.Stat` race với Open | TOCTOU | Open trực tiếp |
| `O_APPEND` khi nhiều process | Race trên text | Lock |
| Scanner buffer overflow | Dòng quá dài fail | `scanner.Buffer(buf, max)` |

## Pattern production

### Atomic config reload

```go
func ReloadConfig(path string) (*Config, error) {
    data, err := os.ReadFile(path)
    if err != nil { return nil, err }
    
    var cfg Config
    if err := yaml.Unmarshal(data, &cfg); err != nil {
        return nil, err
    }
    return &cfg, nil
}

// Watch with fsnotify
import "github.com/fsnotify/fsnotify"
watcher, _ := fsnotify.NewWatcher()
watcher.Add(configPath)
for ev := range watcher.Events {
    if ev.Op&fsnotify.Write == fsnotify.Write {
        cfg, _ := ReloadConfig(configPath)
        store.Update(cfg)
    }
}
```

### Logrotate-friendly writer

```go
import "gopkg.in/natefinch/lumberjack.v2"

logger := &lumberjack.Logger{
    Filename:   "/var/log/app.log",
    MaxSize:    100,    // MB
    MaxBackups: 3,
    MaxAge:     28,     // days
    Compress:   true,
}
log.SetOutput(logger)
```

Auto rotate + compress old logs.

## Quick reference

```go
// Simple
data, _ := os.ReadFile(path)
os.WriteFile(path, data, 0644)

// Streaming
f, _ := os.Open(path); defer f.Close()
scanner := bufio.NewScanner(f); for scanner.Scan() { ... }

// Write streaming
f, _ := os.Create(path); defer f.Close()
w := bufio.NewWriter(f); defer w.Flush()

// Append
f, _ := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)

// Info
info, _ := os.Stat(path)
exists := errors.Is(err, os.ErrNotExist) == false

// Path
filepath.Join, Dir, Base, Ext, Abs, Rel
filepath.WalkDir(root, func)

// Directory
os.Mkdir, MkdirAll, Remove, RemoveAll, ReadDir, Getwd, Chdir

// Temp
os.CreateTemp("", "prefix-*.ext")
os.MkdirTemp("", "prefix-*")

// Embed
//go:embed file.yaml
var data []byte

// IO
io.Copy(dst, src)
io.ReadAll(r)
io.WriteString(w, s)
```

## Tóm tắt bài 1

- `os.ReadFile` / `WriteFile` đơn giản, OK cho file nhỏ.
- File lớn → stream với `os.Open` + `bufio.Scanner` (read line) hoặc raw buffer.
- Atomic write: temp file + sync + rename.
- `filepath.Join` cross-platform path. KHÔNG concat `+`.
- Walk directory: `filepath.WalkDir`.
- Embed asset (`//go:embed`) compile vào binary → single file deploy.
- `io.Reader`/`io.Writer` universal interface — code reusable.
- `io.Copy` move data giữa source-dest.
- Compression chain với gzip/lzw/bzip2 stdlib.

**Bài kế tiếp** → [Bài 2: JSON encoding/decoding](02-json-encoding.md)
