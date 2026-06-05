# Bài 32: `chrono` crate — date/time trong Rust

> Stdlib có `std::time::SystemTime` cho timestamp đơn giản. Cần parse "2024-06-04", tính tuổi, format theo locale → dùng `chrono`. Bài này dạy basics + common patterns.

## Setup

```toml
[dependencies]
chrono = "0.4"
```

```rust
use chrono::{DateTime, Utc, Local, NaiveDate};

fn main() {
    let now_utc: DateTime<Utc> = Utc::now();
    let now_local: DateTime<Local> = Local::now();
    
    println!("UTC: {now_utc}");
    println!("Local: {now_local}");
}
```

`Utc::now()` / `Local::now()` — current time.

## Types

| Type | What |
|---|---|
| `DateTime<Utc>` | Date+time UTC |
| `DateTime<Local>` | Date+time local timezone |
| `NaiveDate` | Date only, no timezone (2024-06-04) |
| `NaiveTime` | Time only (15:30:00) |
| `NaiveDateTime` | Date+time, no timezone |
| `Duration` | Time span |

`Naive*` = no timezone info. Use when timezone irrelevant (birthday).

## Create specific date

```rust
use chrono::{NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc};

let date = NaiveDate::from_ymd_opt(2024, 6, 4).unwrap();
let time = NaiveTime::from_hms_opt(15, 30, 0).unwrap();
let dt = NaiveDateTime::new(date, time);

let utc_dt = Utc.with_ymd_and_hms(2024, 6, 4, 15, 30, 0).unwrap();
```

`from_ymd_opt` returns `Option` — invalid date (Feb 30) → None.

## Parse string

```rust
use chrono::{NaiveDate, DateTime, Utc};

let date: NaiveDate = "2024-06-04".parse().unwrap();

let formatted = "2024-06-04T15:30:00Z";
let dt: DateTime<Utc> = formatted.parse().unwrap();
```

Default format ISO 8601.

### Custom format

```rust
use chrono::NaiveDate;

let date = NaiveDate::parse_from_str("04/06/2024", "%d/%m/%Y").unwrap();
```

Format specifiers:
- `%Y` — 4-digit year (2024).
- `%m` — month 01-12.
- `%d` — day 01-31.
- `%H` — hour 00-23.
- `%M` — minute.
- `%S` — second.
- `%A` — day name (Monday).
- `%B` — month name (June).
- `%Z` — timezone abbreviation.

Full list in chrono docs.

## Format output

```rust
let now = Utc::now();
let formatted = now.format("%Y-%m-%d %H:%M:%S").to_string();
let pretty = now.format("%B %d, %Y at %H:%M").to_string();
let custom = now.format("%A, %d %B %Y").to_string();
```

## Arithmetic

```rust
use chrono::{Duration, Utc};

let now = Utc::now();

let in_1_hour = now + Duration::hours(1);
let yesterday = now - Duration::days(1);
let next_week = now + Duration::weeks(1);

let diff = in_1_hour - now;
println!("{}", diff.num_seconds());        // 3600
println!("{}", diff.num_minutes());        // 60
```

`Duration` for arithmetic. Various units: `seconds`, `minutes`, `hours`, `days`, `weeks`.

## Timezone conversion

```rust
use chrono::{DateTime, Utc, Local, FixedOffset, TimeZone};

let utc_now = Utc::now();
let local_now: DateTime<Local> = utc_now.into();

// Specific timezone offset
let tokyo = FixedOffset::east_opt(9 * 3600).unwrap();         // UTC+9
let tokyo_time = utc_now.with_timezone(&tokyo);
println!("Tokyo: {tokyo_time}");

// For named zones (London, New York) → chrono-tz crate
```

### chrono-tz for named zones

```toml
[dependencies]
chrono = "0.4"
chrono-tz = "0.8"
```

```rust
use chrono::Utc;
use chrono_tz::Asia::Tokyo;

let utc = Utc::now();
let tokyo = utc.with_timezone(&Tokyo);
println!("{tokyo}");
```

Full TZ database.

## Extract components

```rust
use chrono::{Datelike, Timelike, Utc};

let now = Utc::now();

println!("year: {}", now.year());
println!("month: {}", now.month());
println!("day: {}", now.day());
println!("weekday: {:?}", now.weekday());

println!("hour: {}", now.hour());
println!("minute: {}", now.minute());
println!("second: {}", now.second());
```

## Comparison

```rust
let a = Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0).unwrap();
let b = Utc.with_ymd_and_hms(2024, 6, 4, 0, 0, 0).unwrap();

if a < b { println!("a before b"); }
```

Standard comparison operators.

## Common patterns

### Age from birthday
```rust
use chrono::{NaiveDate, Utc, Datelike};

fn age(birthday: NaiveDate) -> i32 {
    let today = Utc::now().date_naive();
    let mut age = today.year() - birthday.year();
    if today.month() < birthday.month() ||
       (today.month() == birthday.month() && today.day() < birthday.day()) {
        age -= 1;
    }
    age
}

fn main() {
    let bd = NaiveDate::from_ymd_opt(1990, 5, 15).unwrap();
    println!("Age: {}", age(bd));
}
```

### Days until event
```rust
fn days_until(target: NaiveDate) -> i64 {
    let today = Utc::now().date_naive();
    (target - today).num_days()
}
```

### Format human-readable elapsed
```rust
fn elapsed_str(seconds: i64) -> String {
    let h = seconds / 3600;
    let m = (seconds % 3600) / 60;
    let s = seconds % 60;
    format!("{h:02}:{m:02}:{s:02}")
}
```

## Serialize/deserialize

```toml
[dependencies]
chrono = { version = "0.4", features = ["serde"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

```rust
use chrono::{DateTime, Utc};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct Event {
    name: String,
    at: DateTime<Utc>,
}

fn main() {
    let e = Event {
        name: "meeting".into(),
        at: Utc::now(),
    };
    let json = serde_json::to_string(&e).unwrap();
    println!("{json}");
}
```

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `from_ymd_opt(2024, 2, 30)` panic if unwrap | Returns None. Handle. |
| Mixing `Naive*` with timezone | Convert explicit `.and_utc()` etc. |
| `Local::now()` server timezone | Use `Utc::now()` for consistency. |
| Format spec wrong | Check chrono docs (`%Y` vs `%y`). |
| `Duration::hours(1).num_seconds()` | OK. Be aware unit. |
| Parse without timezone | `NaiveDateTime`, can't compare with `DateTime<Utc>` directly. |
| Comparing naive with UTC | Convert explicit. |
| Leap year/second confusion | chrono handles automatically. |

## Tóm tắt bài 32

- `chrono` crate for date/time. Stdlib `SystemTime` minimal.
- Types: `DateTime<Utc>`, `DateTime<Local>`, `NaiveDate`, `NaiveTime`, `Duration`.
- `Utc::now()`, `Local::now()` current time.
- Parse: `"2024-06-04".parse()`, custom `parse_from_str("...", "%Y-%m-%d")`.
- Format: `dt.format("%Y-%m-%d").to_string()`.
- Arithmetic: `dt + Duration::days(1)`. Diff: `(a - b).num_days()`.
- Timezone: `with_timezone(&zone)`. Named zones via `chrono-tz`.
- Serialize via `serde` feature.

**Bài kế tiếp** → [Bài 33 (phase-25): regex crate — pattern matching](../phase-25-regex-crate/01-regex-cot-loi.md)
