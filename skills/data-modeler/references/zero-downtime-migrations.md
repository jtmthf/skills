# Zero-Downtime Migrations

Read this reference when generating migrations for a production database with uptime requirements — i.e., when the table has live traffic, cannot tolerate a maintenance window, or when the user is concerned about locking.

## Why Migrations Lock

Most DDL operations acquire a table-level lock that blocks reads and writes for the lock's duration. On a busy table with millions of rows, this can mean seconds or minutes of downtime.

### PostgreSQL Lock Levels

PostgreSQL DDL locks to be aware of:

| Operation | Lock Level | Blocks |
|---|---|---|
| `ALTER TABLE ADD COLUMN` (nullable, no default) | `ACCESS EXCLUSIVE` | All reads + writes, but completes instantly |
| `ALTER TABLE ADD COLUMN ... DEFAULT ...` (volatile) | `ACCESS EXCLUSIVE` | All reads + writes, rewrites table |
| `ALTER TABLE ADD COLUMN ... DEFAULT ...` (constant, PG 11+) | `ACCESS EXCLUSIVE` | All reads + writes, but completes instantly |
| `ALTER TABLE SET NOT NULL` | `ACCESS EXCLUSIVE` | All reads + writes, scans table |
| `CREATE INDEX` | `SHARE` | Writes only, blocks for full build time |
| `CREATE INDEX CONCURRENTLY` | `SHARE UPDATE EXCLUSIVE` | Almost nothing — safe for production |
| `DROP TABLE` | `ACCESS EXCLUSIVE` | All reads + writes |

**Mitigation**: Set `lock_timeout` before running migrations to fail fast rather than queue indefinitely:
```sql
SET lock_timeout = '2s';
ALTER TABLE orders ADD COLUMN notes text;
```
If the lock cannot be acquired within 2 seconds, the migration fails cleanly rather than queuing behind a long-running query and blocking everything behind it.

### MySQL Online DDL

MySQL 5.6+ supports Online DDL with `ALGORITHM=INPLACE` for many operations. Check the [MySQL docs](https://dev.mysql.com/doc/refman/8.0/en/innodb-online-ddl-operations.html) for each operation's support level.

```sql
ALTER TABLE orders ADD COLUMN notes TEXT, ALGORITHM=INPLACE, LOCK=NONE;
```

If `INPLACE` is not supported for an operation, MySQL will copy the table — use an online schema change tool instead (see below).

## Safe Patterns

### Adding Columns

**Safe**: Add nullable columns with no default, or columns with a constant default (PostgreSQL 11+, MySQL 8.0+). These complete near-instantly.

```sql
-- Safe: nullable, no default
ALTER TABLE orders ADD COLUMN notes text;

-- Safe on PG 11+: constant default, no table rewrite
ALTER TABLE orders ADD COLUMN is_priority boolean NOT NULL DEFAULT false;
```

**Unsafe**: Adding a column with a volatile default (e.g., `DEFAULT now()`) on older PostgreSQL versions triggers a full table rewrite. Use the expand-contract pattern instead.

### Creating Indexes

Never use plain `CREATE INDEX` on a live, busy table — it holds a `SHARE` lock for the entire build.

```sql
-- Safe: concurrent build, no writes blocked
CREATE INDEX CONCURRENTLY idx_orders_customer ON orders (customer_id);
```

**[PostgreSQL]** `CREATE INDEX CONCURRENTLY` caveats:
- Cannot run inside a transaction block
- Takes longer than a regular `CREATE INDEX` (two table scans)
- If it fails partway, it leaves an `INVALID` index — check with `SELECT * FROM pg_indexes WHERE indexname = '...'` and `DROP INDEX CONCURRENTLY` before retrying

**[MySQL]**: Online DDL handles most index creation without locking. Use `ALGORITHM=INPLACE, LOCK=NONE`.

### Renaming or Dropping Columns (Expand-Contract)

Renaming or dropping a column while the application is running causes errors in deployed code that still references the old name. Use the expand-contract pattern:

**Phase 1 — Expand**: Add the new column. Update application to write to both old and new.
```sql
ALTER TABLE users ADD COLUMN full_name text;
```

**Phase 2 — Migrate**: Backfill existing rows (batch to avoid long-running transactions).
```sql
UPDATE users SET full_name = first_name || ' ' || last_name
WHERE full_name IS NULL AND id BETWEEN $start AND $end;
```

**Phase 3 — Contract**: Once all application code reads only the new column, drop the old one.
```sql
ALTER TABLE users DROP COLUMN first_name;
ALTER TABLE users DROP COLUMN last_name;
```

Each phase is independently deployable. Never combine Phase 1 and Phase 3 in a single migration.

### Adding NOT NULL Constraints

Adding `NOT NULL` to an existing nullable column requires a full table scan to verify no NULLs exist. On large tables, this locks the table.

**Safe approach (PostgreSQL)**:
1. Add a `CHECK` constraint with `NOT VALID` (skips scan, validates only new rows):
   ```sql
   ALTER TABLE orders ADD CONSTRAINT orders_customer_id_not_null
     CHECK (customer_id IS NOT NULL) NOT VALID;
   ```
2. Backfill any NULLs.
3. Validate the constraint (scans existing rows with a weaker lock):
   ```sql
   ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_id_not_null;
   ```
4. Finally, apply `NOT NULL` (PostgreSQL 12+ can use the validated check constraint to skip the scan):
   ```sql
   ALTER TABLE orders ALTER COLUMN customer_id SET NOT NULL;
   ```

### Adding Foreign Keys

Adding an FK to an existing table triggers a full scan to validate referential integrity.

**Safe approach (PostgreSQL)**:
```sql
-- Add FK as NOT VALID to skip scan (validates new rows only)
ALTER TABLE orders ADD CONSTRAINT fk_orders_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;

-- Validate separately with a weaker lock
ALTER TABLE orders VALIDATE CONSTRAINT fk_orders_customer;
```

## Online Schema Change Tools

For complex migrations on very large tables where even the patterns above are too risky, use dedicated tools:

### gh-ost (MySQL)

GitHub's online schema change tool. Uses MySQL's binary log (binlog) to replicate changes to a shadow table, then atomically swaps. No triggers — lower write overhead than `pt-online-schema-change`.

```bash
gh-ost --host=... --database=mydb --table=orders \
  --alter="ADD COLUMN notes TEXT" \
  --execute
```

**Best for**: Large MySQL tables (hundreds of millions of rows), when InnoDB Online DDL is insufficient.

### pt-online-schema-change (MySQL)

Percona's tool. Creates a shadow table, uses triggers to sync changes, then swaps. Trigger overhead can be significant on write-heavy tables.

**Best for**: MySQL environments where gh-ost's binlog requirements aren't met.

### pg_repack (PostgreSQL)

Rebuilds PostgreSQL tables and indexes without holding an `ACCESS EXCLUSIVE` lock for the full duration. Useful for `VACUUM FULL` replacements and index rebuilds.

```bash
pg_repack --table orders mydb
```

**Best for**: Table bloat reclamation and index rebuilds that `CONCURRENTLY` can't handle (e.g., reindexing all indexes on a table).

## Advisory Locks for Migration Runners

When multiple application instances start simultaneously (e.g., Kubernetes rolling deploys), multiple instances may try to run migrations concurrently. Use advisory locks to serialize:

```sql
-- Acquire advisory lock (blocks until available)
SELECT pg_advisory_lock(12345);
-- Run migrations
-- Release on connection close or explicitly:
SELECT pg_advisory_unlock(12345);
```

Most migration frameworks (Flyway, Liquibase, golang-migrate, Alembic) implement this internally. Verify that yours does before relying on application-level serialization.

## Questions to Ask the User

1. Is this a production database with live traffic, or can a maintenance window be used?
2. How large is the table being modified? (Row count, approximate size in GB)
3. What database and version? (Affects which safe patterns apply)
4. What's the write rate on this table? (Affects viability of triggers and online tools)
5. Is there a specific operation causing concern — adding a column, adding an index, changing a type?
