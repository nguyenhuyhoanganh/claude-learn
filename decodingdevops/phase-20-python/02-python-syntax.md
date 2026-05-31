# Bài 2: Python syntax đầy đủ cho DevOps

Bài 1 overview. Bài này dạy **Python syntax** đủ viết tool DevOps thực tế, focus vào điểm khác Bash.

## Indentation matter

Python dùng **indent** thay `{}`:

```python
if x > 0:
    print("positive")
    print("processing...")
else:
    print("non-positive")
```

- 4 space mỗi level (PEP 8 standard).
- Không mix tab + space.
- Editor auto-format: black, ruff.

## Data types

### Numbers

```python
i = 42                  # int (arbitrary precision)
f = 3.14                # float
c = 2 + 3j              # complex (hiếm dùng)
big = 10 ** 100         # int khổng lồ OK

# Operations
5 / 2       # 2.5 (true division)
5 // 2      # 2 (floor division)
5 % 2       # 1 (modulo)
5 ** 2      # 25 (power)

# Conversion
int("42")          # 42
float("3.14")      # 3.14
str(42)            # "42"
int("0xFF", 16)    # 255 (hex)
bin(10)            # "0b1010"
```

### Strings

```python
s1 = "hello"
s2 = 'world'
s3 = """multi-line
string"""

# Concat
s = "Hello, " + "World"
s = " ".join(["a", "b", "c"])     # "a b c"

# f-string (modern, recommend)
name = "Alice"
greeting = f"Hello {name}, you are {30} years old"
print(f"{name=}")                  # Debug: name='Alice'

# Methods
s.upper()           # "HELLO"
s.lower()
s.strip()           # Remove whitespace 2 đầu
s.split(",")        # ["hello", " world"]
s.replace("a", "b")
s.startswith("h")   # True
s.endswith("o")
s.find("llo")       # 2 (index)
"abc" in s          # True

# Format
"Name: %s, Age: %d" % ("Alice", 30)            # Old style
"Name: {}, Age: {}".format("Alice", 30)         # Mid
f"Name: {name}, Age: {30}"                      # Modern
```

### Bool, None

```python
a = True
b = False
c = None        # Python null

# Truthy / Falsy
if []:          # False (empty list)
    ...
if 0:           # False
    ...
if "":          # False
    ...
if None:        # False
    ...

# Comparison
None == None    # True
None is None    # True (prefer)
```

### Collections

```python
# List - mutable, ordered
fruits = ["apple", "banana", "cherry"]
fruits.append("date")
fruits.remove("banana")
fruits[0]              # "apple"
fruits[-1]             # "date" (negative index)
fruits[1:3]            # ["banana", "cherry"] (slice)
len(fruits)

# Tuple - immutable, ordered
point = (3, 4)
x, y = point           # Unpack
single = (1,)          # Comma mandatory for 1-tuple

# Set - mutable, no duplicates, unordered
unique = {1, 2, 3, 3}  # {1, 2, 3}
unique.add(4)
unique.remove(1)
1 in unique            # True

# Dict - mutable, key-value
user = {"name": "Alice", "age": 30}
user["email"] = "a@b.com"
user.get("phone", "N/A")     # Safe access
"name" in user               # True
del user["age"]

# Iterate dict
for key, value in user.items():
    print(f"{key}: {value}")

for key in user.keys():
    print(key)

for value in user.values():
    print(value)
```

## Control flow

### if/elif/else

```python
status = "ok"

if status == "ok":
    print("Good")
elif status == "warning":
    print("Warn")
else:
    print("Bad")

# Ternary
result = "even" if x % 2 == 0 else "odd"

# Match (Python 3.10+, like switch)
match status:
    case "ok":
        print("Good")
    case "warning" | "alert":
        print("Concern")
    case _:
        print("Unknown")
```

### Loops

```python
# for
for fruit in fruits:
    print(fruit)

# for with index
for i, fruit in enumerate(fruits):
    print(f"{i}: {fruit}")

# for range
for i in range(10):           # 0-9
    print(i)

for i in range(2, 10, 2):     # 2, 4, 6, 8 (step 2)
    print(i)

# Iterate dict
for key, value in user.items():
    print(f"{key}={value}")

# Iterate parallel với zip
names = ["a", "b", "c"]
ages = [1, 2, 3]
for name, age in zip(names, ages):
    print(f"{name}: {age}")

# while
n = 0
while n < 10:
    print(n)
    n += 1

# break / continue
for i in range(10):
    if i == 5:
        break              # Exit loop
    if i % 2 == 0:
        continue           # Skip
    print(i)

# else trên loop (executes nếu không break)
for i in range(10):
    if i == 100:
        break
else:
    print("Loop completed without break")
```

### Comprehension — Pythonic

```python
# List comprehension
squares = [x**2 for x in range(10)]
even = [x for x in range(20) if x % 2 == 0]
matrix = [[i*j for j in range(5)] for i in range(5)]

# Dict comprehension
square_dict = {x: x**2 for x in range(5)}
# {0: 0, 1: 1, 2: 4, 3: 9, 4: 16}

# Set comprehension
unique_lengths = {len(s) for s in fruits}

# Generator (lazy)
gen = (x**2 for x in range(10))     # Tuple-like but lazy
next(gen)                            # 0
next(gen)                            # 1
```

## Functions

```python
def greet(name, greeting="Hello"):
    """Greet someone."""
    return f"{greeting}, {name}"

greet("Alice")                      # Hello, Alice
greet("Bob", greeting="Hi")          # Hi, Bob
greet(name="Charlie", greeting="Hey")
```

### Type hints

```python
def add(x: int, y: int = 0) -> int:
    return x + y

def get_users() -> list[dict[str, str]]:
    return [{"name": "Alice"}, {"name": "Bob"}]

# Optional
from typing import Optional
def find_user(uid: int) -> Optional[dict]:
    ...
```

### *args, **kwargs

```python
def total(*nums):              # Tuple of args
    return sum(nums)

total(1, 2, 3, 4)              # 10

def config(**kwargs):           # Dict of keyword args
    for k, v in kwargs.items():
        print(f"{k}: {v}")

config(host="localhost", port=8080)
```

### Lambda

```python
add = lambda x, y: x + y
add(2, 3)                       # 5

sorted_users = sorted(users, key=lambda u: u["age"])
```

### Decorators

```python
import time
from functools import wraps

def timing(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        elapsed = time.time() - start
        print(f"{func.__name__}: {elapsed:.2f}s")
        return result
    return wrapper

@timing
def slow_function():
    time.sleep(1)
    return "done"

slow_function()                 # slow_function: 1.00s
```

Use case decorators:
- Timing.
- Cache (`@functools.cache`).
- Retry.
- Auth check.
- Log.

## Classes

```python
class User:
    """User class."""

    # Class variable
    company = "Acme"

    def __init__(self, name: str, age: int):
        # Instance variable
        self.name = name
        self.age = age

    def greet(self) -> str:
        return f"Hi {self.name}, you work at {self.company}"

    def __str__(self) -> str:
        return f"User({self.name}, {self.age})"

    def __repr__(self) -> str:
        return f"User(name={self.name!r}, age={self.age})"

# Use
u = User("Alice", 30)
print(u.greet())
print(str(u))
print(repr(u))

# Inheritance
class Admin(User):
    def __init__(self, name: str, age: int, role: str):
        super().__init__(name, age)
        self.role = role

    def greet(self) -> str:
        base = super().greet()
        return f"{base} (admin: {self.role})"
```

### Dataclass

```python
from dataclasses import dataclass, field
from typing import List

@dataclass
class User:
    name: str
    age: int
    email: str = ""
    tags: List[str] = field(default_factory=list)

u = User("Alice", 30)
print(u)                        # User(name='Alice', age=30, email='', tags=[])
```

Less boilerplate cho data container.

### Property

```python
class Temperature:
    def __init__(self, celsius: float):
        self._celsius = celsius

    @property
    def fahrenheit(self) -> float:
        return self._celsius * 9/5 + 32

    @fahrenheit.setter
    def fahrenheit(self, value: float):
        self._celsius = (value - 32) * 5/9

t = Temperature(25)
print(t.fahrenheit)             # 77.0
t.fahrenheit = 100
print(t._celsius)               # 37.8
```

## Exception

```python
try:
    result = 10 / 0
except ZeroDivisionError as e:
    print(f"Math error: {e}")
except Exception as e:
    print(f"Other error: {e}")
else:
    print("No error")
finally:
    print("Always run")

# Raise
def withdraw(amount):
    if amount < 0:
        raise ValueError("Amount must be positive")
    if amount > balance:
        raise InsufficientFundsError(f"Need {amount}, have {balance}")

# Custom exception
class InsufficientFundsError(Exception):
    pass
```

### Context manager

```python
# Auto-close file
with open("file.txt") as f:
    content = f.read()
# f.close() automatic

# Multiple
with open("in.txt") as fin, open("out.txt", "w") as fout:
    fout.write(fin.read())

# Custom context manager
from contextlib import contextmanager

@contextmanager
def timer(label):
    start = time.time()
    try:
        yield
    finally:
        print(f"{label}: {time.time() - start:.2f}s")

with timer("DB query"):
    # work
    ...
```

## Modules & packages

```text
my_tool/
├── __init__.py
├── cli.py
├── aws.py
└── utils/
    ├── __init__.py
    └── string.py
```

```python
# aws.py
def list_instances():
    ...

# cli.py
from . import aws
from .utils.string import normalize

aws.list_instances()
```

```python
# Standard library
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
import json
import re
import subprocess

# Third-party
import requests
import boto3
import yaml
```

## File I/O

```python
from pathlib import Path

# Read
content = Path("file.txt").read_text()
lines = Path("file.txt").read_text().splitlines()
data = json.loads(Path("config.json").read_text())

# Write
Path("output.txt").write_text("Hello")
Path("config.json").write_text(json.dumps(data, indent=2))

# Iterate dir
for f in Path("/var/log").glob("*.log"):
    print(f)

for f in Path("/etc").rglob("*.conf"):    # Recursive
    print(f)

# Path operations
p = Path("/var/log/app.log")
p.name           # "app.log"
p.stem           # "app"
p.suffix         # ".log"
p.parent         # PosixPath('/var/log')
p.exists()       # True/False
p.is_file()
p.is_dir()
p.stat().st_size # bytes

# Make dir
Path("/tmp/new/dir").mkdir(parents=True, exist_ok=True)

# Delete
Path("file.txt").unlink()
Path("dir").rmdir()      # Empty dir only
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Mutable default arg | Shared state | Use `None` + check |
| `==` vs `is` | Bug subtle với None | `is None` |
| Late binding closure | Loop variable confusion | Default arg trick |
| Floating point comparison | False | Use `math.isclose()` |
| Mixed indent | IndentationError | Strict 4 space |
| Quên `self` trong method | UnboundLocalError | Add `self` |
| List slicing return copy | Memory cost | Use generator |
| `print()` thay logging | No level, no format | Use `logging` |

## Tóm tắt bài 2

- **Indent** quyết định block (4 space).
- **f-string** modern formatting.
- **Comprehension** Pythonic loop.
- **Type hints** giúp IDE + mypy check.
- **Dataclass** less boilerplate.
- **Decorator** modify function behavior.
- **Context manager** (`with`) auto-cleanup.
- **`pathlib.Path`** modern file/dir API.
- **Exception** with `try/except/else/finally`.

**Bài kế tiếp** → [Bài 3: Python cho automation — subprocess, requests, boto3](03-python-automation.md)
