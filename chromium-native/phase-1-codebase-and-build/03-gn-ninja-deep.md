# Bài 3: GN + Ninja Deep

Bài này dạy:
- GN là gì, vì sao Chromium chọn (không dùng CMake / Bazel).
- `args.gn`: build flags quan trọng.
- `gn gen`, `autoninja` workflow.
- BUILD.gn patterns: `source_set`, `static_library`, `component`, `executable`, `test`.
- `gn desc`, `gn ls`, `gn refs` deep.
- Build flavor: debug vs release vs component.

Kết thúc bài: bạn config build Chromium, hiểu BUILD.gn syntax, add new source vào target.

## GN — Generate Ninja

**GN** = meta build system generate ninja files. Chromium's choice.

### Vì sao GN, không CMake / Bazel?

**Vs CMake**:

- GN faster — generation < 10s cho Chromium (CMake ~minutes).
- GN simpler syntax — python-like, không có CMake's quoting hell.
- Custom for Chromium use case.

**Vs Bazel**:

- GN ra trước Bazel mature.
- Bazel có hermetic build nhưng complexity cao.
- Migration to Bazel = lớn (Chromium đã thử).

→ GN là custom của Chromium, dùng riêng + bởi vài Google project.

### Workflow tổng quát

```bash
# 1. Configure build (lần đầu, hoặc khi đổi args)
gn gen out/Debug

# 2. Compile target
autoninja -C out/Debug chrome
# Equivalent: ninja -C out/Debug -j N chrome (autoninja auto -j)

# 3. Run
out/Debug/chrome
```

## `args.gn` — build configuration

```python
# out/Debug/args.gn

is_debug = true
is_component_build = true
symbol_level = 2
target_os = "linux"
target_cpu = "x64"
```

Open editor:

```bash
gn args out/Debug
```

Save → re-generate ninja files automatically.

### Common flags

```python
# Build type
is_debug = true              # Debug build (asserts on, no opt)
# is_debug = false           # Release (opt, no asserts)
is_official_build = false    # Official build (slow link, full opt)

# Component vs static
is_component_build = true    # Each target → shared lib (fast incremental link)
# is_component_build = false # Single binary (slow link, fast startup)

# Debug symbols
symbol_level = 2             # Full (default debug)
# symbol_level = 1           # Reduced (limited)
# symbol_level = 0           # No symbols (release)

# Sanitizers
is_asan = false              # AddressSanitizer
is_ubsan = false             # UndefinedBehaviorSanitizer
is_tsan = false              # ThreadSanitizer
is_msan = false              # MemorySanitizer (linux only)

# Misc
dcheck_always_on = false     # DCHECK in release
treat_warnings_as_errors = true
use_goma = true              # Distributed build (Google internal)
use_remoteexec = true        # Remote execution

# Targets
target_os = "linux"          # Or "android", "ios", "mac", "win", "chromeos"
target_cpu = "x64"           # Or "arm", "arm64", "x86"
```

### `is_debug` vs `is_component_build`

| Combination | Speed | Use case |
|---|---|---|
| `debug + component` | **Fast incremental build**, slow startup | Daily dev |
| `debug + non-component` | Slow link, OK startup | Final debug verification |
| `release + component` | Fast build, fast runtime | Pre-release test |
| `release + non-component` | **Slow link**, fast runtime, small binary | Ship build |

→ **Default cho daily dev**: `is_debug=true, is_component_build=true`.

## `gn gen`

```bash
gn gen out/Debug

# Or with args inline
gn gen out/Debug --args="is_debug=true is_component_build=true"

# Cross-compile
gn gen out/Android --args='target_os="android" target_cpu="arm64"'
```

Output: `out/Debug/` chứa generated ninja file. Hundreds of `.ninja` files.

### Multiple out dirs

```bash
out/
├── Debug/                  # Debug build
├── Release/                # Release build
├── Asan/                   # ASan-instrumented
├── Android/                # Android cross-build
└── ...
```

Mỗi config = 1 out dir. Switch giữa chúng nhanh, không cần regenerate.

## `autoninja`

Wrapper around ninja:

```bash
autoninja -C out/Debug chrome           # Build chrome
autoninja -C out/Debug content_shell    # Build content_shell
autoninja -C out/Debug unit_tests       # Build unit_tests

# Multiple targets
autoninja -C out/Debug chrome chromedriver

# All targets (= ninja default)
autoninja -C out/Debug
```

`autoninja` auto:

- `-j N`: parallel jobs (matches CPU).
- Goma/RBE handling.

### Incremental build

Edit `chrome/browser/foo.cc` → `autoninja -C out/Debug chrome`:

- Ninja detect file changed.
- Recompile only affected `.cc` + dependents.
- Link.
- Build done in seconds (vs hour cho clean build).

## BUILD.gn syntax

```python
# Variables
my_var = "hello"
my_list = [ "a", "b", "c" ]
my_dict = { key = "value" }

# Conditionals
if (is_linux) {
  ...
} else if (is_android) {
  ...
}

# Functions called "target types"
source_set("foo") {
  sources = [
    "foo.cc",
    "foo.h",
  ]
  deps = [
    "//base",
    "//content/public/browser",
  ]
}
```

### Target types

#### `source_set` — compile but don't link

```python
source_set("foo") {
  sources = [
    "foo.cc",
    "foo.h",
  ]
  deps = [ "//base" ]
}
```

`source_set` = "object files" — compile sources, but không link thành lib. Khi target khác depend, các object file được link trực tiếp vào.

**Phổ biến nhất**. Faster than static_library.

#### `static_library` — `.a` file

```python
static_library("foo") {
  sources = [ ... ]
}
```

Produces `libfoo.a`. Slower than source_set (extra step) but cleaner separation.

#### `shared_library` — `.so` file

```python
shared_library("foo") {
  sources = [ ... ]
}
```

Produces `libfoo.so`/`.dll`/`.dylib`.

#### `component` — switches based on `is_component_build`

```python
component("foo") {
  sources = [ ... ]
  deps = [ ... ]
}
```

- `is_component_build=true` → `shared_library`.
- `is_component_build=false` → `static_library`.

Smart pattern — chunk source into component build for fast dev.

#### `executable` — `.exe`

```python
executable("chrome") {
  sources = [ "main.cc" ]
  deps = [ ":browser", ":renderer" ]
}
```

Final binary.

#### `test` — test binary

```python
test("unit_tests") {
  sources = [ "foo_unittest.cc" ]
  deps = [
    "//base/test:run_all_unittests",
    ":foo",
  ]
}
```

Tương tự executable nhưng cho test (has special handling cho test infrastructure).

#### `group` — virtual target (bundle deps)

```python
group("everything") {
  deps = [
    ":chrome",
    ":chromedriver",
    ":content_shell",
  ]
}
```

Khi build `:everything` → build all deps. Useful cho meta-target.

### Common config

```python
config("my_config") {
  cflags = [ "-Wno-deprecated" ]
  defines = [ "MY_FEATURE_ENABLED=1" ]
  include_dirs = [ "../include" ]
}

source_set("foo") {
  sources = [ ... ]
  configs += [ ":my_config" ]
  public_configs = [ ":my_public_config" ]  # Propagate to deps
}
```

### Visibility

```python
source_set("internal_helper") {
  visibility = [ ":foo" ]   # Only :foo trong cùng dir có thể depend
}
```

### Path syntax

```python
"//base"                  # Absolute from src/
"//base:base"             # Same as above (default target name = dir name)
"//base/files:file_util"  # Specific target trong base/files/
":foo"                    # Same BUILD.gn

"foo.cc"                  # Relative to current BUILD.gn
"//base/files/file.h"     # Absolute path to file
```

## Real BUILD.gn example

`chrome/browser/bookmarks/BUILD.gn`:

```python
source_set("bookmarks") {
  sources = [
    "bookmark_model_factory.cc",
    "bookmark_model_factory.h",
    "chrome_bookmark_client.cc",
    "chrome_bookmark_client.h",
    # ...
  ]

  deps = [
    "//base",
    "//chrome/browser/profiles",
    "//components/bookmarks/browser",
    "//content/public/browser",
  ]

  public_deps = [
    "//components/bookmarks/browser:browser_headers",
  ]

  if (is_android) {
    deps += [ "//chrome/android:java_helper" ]
  }
}
```

## `gn desc` deep

```bash
# Full info
gn desc out/Debug //chrome/browser:browser

# Specific aspect
gn desc out/Debug //chrome/browser:browser sources
gn desc out/Debug //chrome/browser:browser deps
gn desc out/Debug //chrome/browser:browser direct_deps
gn desc out/Debug //chrome/browser:browser inputs        # Generated files
gn desc out/Debug //chrome/browser:browser configs
gn desc out/Debug //chrome/browser:browser defines

# Trace why dep
gn desc out/Debug //chrome/browser:browser deps --tree
gn desc out/Debug //chrome/browser:browser deps --all
```

### Find what causes a deps

```bash
gn path out/Debug //chrome/browser:browser //base:base
# Shows dependency chain
```

## `gn refs` — reverse dependency

```bash
gn refs out/Debug //base/strings:strings
# Targets that depend on base/strings:strings

gn refs out/Debug //base:base --all   # Including transitive
gn refs out/Debug //base/strings/string_util.cc   # File-level
```

Useful khi rename/move file → biết ai cần update.

## `gn check` — header inclusion check

```bash
gn check out/Debug
```

Verify rằng mỗi `#include` được declare trong `BUILD.gn` deps. Bắt header dependency mismatch.

## Common build commands

```bash
# Build chrome
autoninja -C out/Debug chrome

# Build a single source file (compile check)
autoninja -C out/Debug chrome/browser/bookmarks/bookmark_model_factory.o

# Build test
autoninja -C out/Debug bookmarks_unittests
out/Debug/bookmarks_unittests

# Build all unittests
autoninja -C out/Debug unit_tests

# Build content_shell (lighter than chrome, no full chrome UI)
autoninja -C out/Debug content_shell
```

## Build performance

Chromium clean build: **20-60 phút** (depends on machine, with Goma/RBE faster).
Incremental build (1 file change): **5-30 giây**.

Tips:

- Use `is_component_build=true` cho dev.
- Use `is_debug=true symbol_level=1` để giảm link time.
- Use Goma (Google internal) hoặc RBE (Remote BUILD Execution) — distribute compilation.
- `ccache` cho local cache.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Forget `gn gen` after args change | Stale config | Always `gn gen` after edit args.gn |
| Forget add new file to BUILD.gn | Compile success, but feature missing | Add to `sources` |
| Missing dep in BUILD.gn | `gn check` fail | Add deps line |
| `target_os` mismatch | Build wrong arch | Specify in args.gn |
| Edit generated `.ninja` | Lost on regenerate | Never edit out/ |
| `is_component_build=false` for dev | Slow incremental link | Use component for dev |
| `is_official_build=true` for dev | Very slow | Only for release |
| Mix release + debug objects | Link error | Use single config per out dir |

## Tóm tắt

| Concept | Take-away |
|---|---|
| GN | Meta build system, generate ninja |
| `args.gn` | Build configuration |
| `gn gen` | Generate ninja files |
| `autoninja` | Wrapper run ninja |
| `source_set` | Compile-only (no lib) — phổ biến nhất |
| `component` | Auto-switch shared/static based on flag |
| `executable` / `test` | Final binary |
| `is_component_build=true` | Daily dev — fast incremental link |
| `is_debug=true` | Debug build (asserts, no opt) |
| `gn desc` / `gn refs` | Exploration |
| `gn check` | Verify include matches deps |

## Comparison

| Tool | Use case |
|---|---|
| GN | Chromium build config |
| Ninja | Actual build executor (parallel, incremental) |
| CMake | General C++ build (non-Chromium) |
| Bazel | Google internal large-scale build |
| Make | Legacy, simple |

## Exercise (optional)

1. (Cần checkout) `gn gen out/Debug`, `autoninja -C out/Debug chrome`. Time it.
2. Edit `chrome/browser/foo.cc` (no-op edit). `autoninja` again. So fast incremental.
3. `gn desc out/Debug //base:base_features`. Đọc sources và deps.
4. `gn refs out/Debug //base/strings:strings` đếm số target dùng base/strings.

---

**Phase kế** → [Phase 2: base/ Library](../phase-2-base-library/01-callbacks-and-bind.md)
