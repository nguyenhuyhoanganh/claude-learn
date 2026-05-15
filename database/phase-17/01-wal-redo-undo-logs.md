# Bài 1: WAL, Redo và Undo Logs - Nền Tảng của Durability

## Giới thiệu

**Write-Ahead Log (WAL)**, Redo Log, và Undo Log là những cơ chế cốt lõi đảm bảo tính **Durability** trong ACID. Hiểu chúng giúp bạn debug crash recovery, optimize writes, và thiết kế hệ thống robust hơn.

---

## 1. Ba Loại Database Logs

```
Logs trong database:
┌──────────────────────────────────────────────────────┐
│  WAL = Write-Ahead Log                               │
│  (PostgreSQL, MySQL/InnoDB, SQLite)                  │
│  Ghi mọi thay đổi TRƯỚC khi ghi vào data files      │
├──────────────────────────────────────────────────────┤
│  Redo Log                                            │
│  (Oracle, MySQL InnoDB)                              │
│  Dùng để "replay" sau crash (redo committed changes) │
├──────────────────────────────────────────────────────┤
│  Undo Log                                            │
│  (Oracle, MySQL InnoDB)                              │
│  Dùng để rollback uncommitted changes                │
└──────────────────────────────────────────────────────┘

Thực chất: WAL ≈ Redo Log trong nhiều implementations
MySQL InnoDB có cả Redo Log (iblogfile*) và Undo Log (undo tablespace)
```

---

## 2. Vấn Đề: Cần Gì cho Durability?

```
Kịch bản không có WAL:

  1. Transaction: UPDATE salary SET amount=60000 WHERE id=42
  2. Database: Cập nhật page trong memory (buffer pool)
  3. Response: "OK, committed!"
  4. CRASH before writing to disk!
  5. Restart: page trên disk vẫn là amount=50000 (!)
  → Lost committed data!
  → Violation of Durability!

Kịch bản có WAL:

  1. Transaction: UPDATE salary SET amount=60000 WHERE id=42
  2. Database: Ghi WAL entry TRƯỚC:
     "Transaction 101: UPDATE employees row 42 salary 50000→60000"
  3. WAL được fsync() vào disk (guaranteed!)
  4. Response: "OK, committed!"
  5. CRASH before updating actual data page!
  6. Restart: Read WAL → "Transaction 101 committed but not applied"
  7. Replay WAL: Apply change to data file
  → Data recovered! Durability maintained!
```

---

## 3. WAL Structure

### WAL Record Format

```
WAL Record:
┌─────────────────────────────────────────────┐
│ LSN (Log Sequence Number)                   │ ← Unique, monotone increasing
│ Transaction ID                               │
│ Resource Manager (HEAP, BTREE, XACT...)     │ ← Loại operation
│ Previous LSN (for rollback chain)           │
│ Data:                                        │
│   - Resource identifier (relation, page)    │
│   - Old value (for undo)                    │
│   - New value (for redo)                    │
└─────────────────────────────────────────────┘

PostgreSQL WAL sizes:
  Single row UPDATE → ~200-500 bytes WAL
  Full page write → ~8KB WAL (for first write after checkpoint)
```

### WAL Segments

```
PostgreSQL lưu WAL trong segments:
  /var/lib/postgresql/data/pg_wal/
  000000010000000000000001  ← 16MB segment
  000000010000000000000002
  000000010000000000000003
  ...

WAL Archiving (cho Point-in-Time Recovery):
  Mỗi segment hoàn thành → Copy to archive location (S3, NFS)
  
  postgresql.conf:
    archive_mode = on
    archive_command = 'aws s3 cp %p s3://my-bucket/wal/%f'
```

---

## 4. Checkpoints

```
Vấn đề với WAL thuần túy:
  Crash → Replay toàn bộ WAL từ đầu → Mất nhiều giờ!

Giải pháp: Checkpoints

Checkpoint process:
  1. Flush tất cả "dirty pages" từ memory xuống disk
  2. Write checkpoint record vào WAL
  3. "Tất cả changes trước LSN=X đã được persist"
  4. WAL trước checkpoint có thể được deleted/archived

Recovery sau crash:
  1. Tìm checkpoint cuối
  2. Apply WAL từ checkpoint đến thời điểm crash
  → Chỉ cần replay từ checkpoint, không phải từ đầu!
```

```
PostgreSQL checkpoint settings:
  checkpoint_completion_target = 0.9  (Spread checkpoint over 90% of interval)
  max_wal_size = 1GB                   (WAL size trước khi force checkpoint)
  checkpoint_timeout = 5min            (Time interval)
  
  Too many checkpoints → I/O spikes (full dirty page flush)
  Too few checkpoints → Long recovery time
  → Balance based on your I/O capacity
```

---

## 5. Redo Log (MySQL InnoDB)

```
MySQL InnoDB dùng Redo Log riêng biệt với WAL concept:

Files: /var/lib/mysql/ib_logfile0, ib_logfile1 (circular)

Write flow:
  Transaction change → Log Buffer (memory)
  Log Buffer → Redo Log file (disk, on commit)
  
  Background thread:
  Redo Log entries → Apply to Data files (tablespaces)
  
Crash recovery:
  1. Find last checkpoint
  2. Apply redo log entries after checkpoint
  3. Rollback uncommitted transactions (using undo log)

innodb_log_file_size = 256MB (per file)
innodb_log_files_in_group = 2 (circular: 512MB total)
```

---

## 6. Undo Log (MySQL InnoDB)

```
Undo Log dùng cho:
  1. Rollback: Khi transaction ROLLBACK, undo log có old values
  2. MVCC: Read Committed/Repeatable Read cần thấy old versions

InnoDB Undo Log:
  Lưu trong undo tablespace (hoặc system tablespace cũ)
  
  INSERT → Undo: DELETE (rollback = xóa row mới)
  UPDATE → Undo: UPDATE với giá trị cũ
  DELETE → Undo: INSERT (rollback = khôi phục row)

MVCC và Undo:
  Transaction T1 đọc row với snapshot t=5
  Transaction T2 update row tại t=6
  T1 cần đọc version từ t=5 → Đọc undo log để reconstruct!
```

---

## 7. WAL Trong Thực Tế

### WAL Settings Tuning

```ini
# postgresql.conf

# Synchronous commit: Đảm bảo WAL được sync trước khi commit
synchronous_commit = on   # Default: safe
# synchronous_commit = off  # Faster, nhưng có thể mất <wal_writer_delay ms data

# WAL compression
wal_compression = lz4  # Giảm WAL size, tốt cho I/O-bound systems

# WAL level cho replication
wal_level = replica  # logical, replica, minimal

# WAL buffering
wal_buffers = 64MB  # Default = 1/32 of shared_buffers
```

### Giám sát WAL

```sql
-- WAL usage
SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0'::pg_lsn)) AS total_wal_generated;

-- WAL write rate
SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), pg_walfile_name_offset('0/0')::text::pg_lsn)) AS wal_usage;

-- Checkpoint stats
SELECT * FROM pg_stat_bgwriter;
-- checkpoints_timed: checkpoints theo schedule
-- checkpoints_req: checkpoints được trigger bởi WAL size
-- buffers_checkpoint: pages flushed during checkpoint
```

---

## 8. Ứng Dụng: Point-in-Time Recovery (PITR)

```
PITR = Khôi phục database về trạng thái tại bất kỳ thời điểm nào

Setup:
  1. Base backup: pg_basebackup → S3 (full snapshot)
  2. WAL archiving → S3 (continuous, mỗi 16MB segment)

Khi cần restore đến T=2024-01-15 14:30:
  1. Restore base backup từ S3
  2. Apply archived WAL từ backup time đến 14:30
  3. Database ở trạng thái chính xác tại 14:30!

postgresql.conf:
  restore_command = 'aws s3 cp s3://backup/wal/%f %p'
  recovery_target_time = '2024-01-15 14:30:00'

→ "Oops, developer dropped production table at 14:35" 
→ Restore đến 14:29 → Data back!
```

---

**Tiếp theo:** 02-thao-luan-uuid-pk-va-postgres-vs-mysql.md →
