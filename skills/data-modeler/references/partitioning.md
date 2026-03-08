# Table Partitioning

Read this reference when scale expectations exceed ~50 million rows, for time-series or event-log tables, or when the user mentions archival, data retention, or cold storage needs.

## When to Partition

Partitioning is not a default — it adds complexity. Consider it when:
- A table will exceed 50–100M rows and queries consistently filter on a predictable column (usually time)
- You need to efficiently drop old data (dropping a partition is O(1), deleting rows is O(n))
- You need different storage tiers (recent partitions on fast storage, old on cold storage)
- Query performance degrades because indexes become too large to fit in memory

Do NOT partition when:
- The table is under 10M rows (indexes handle this fine)
- Queries don't filter on the partition key (partitioning won't help and may hurt)
- The primary access pattern is point lookups by PK (partitioning adds overhead)

**[SQLite]**: SQLite has no partitioning support. Workarounds: use separate tables per time period and ATTACH DATABASE to query across them, or consider a database that supports partitioning (PostgreSQL, MySQL) if this is a hard requirement.

## PostgreSQL Declarative Partitioning

PostgreSQL 10+ supports declarative partitioning. This is the recommended approach.

### Range Partitioning (Most Common)

Partition by time ranges — ideal for event logs, audit trails, analytics, time-series data.

```sql
CREATE TABLE events (
    id bigint GENERATED ALWAYS AS IDENTITY,
    tenant_id bigint NOT NULL,
    event_type text NOT NULL,
    payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE events_2025_01 PARTITION OF events
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE events_2025_02 PARTITION OF events
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Indexes are created per-partition
CREATE INDEX idx_events_2025_01_tenant ON events_2025_01 (tenant_id, created_at DESC);
```

**Partition management**: Automate creation of future partitions and detachment/dropping of old ones. Use `pg_partman` extension or a scheduled job. Always create partitions ahead of time — inserting into a non-existent partition fails.

**Retention**: To drop data older than N months, detach and drop the partition:
```sql
ALTER TABLE events DETACH PARTITION events_2024_01;
DROP TABLE events_2024_01;
```

### List Partitioning

Partition by discrete values — useful for multi-tenant isolation or status-based separation.

```sql
CREATE TABLE orders (
    id bigint GENERATED ALWAYS AS IDENTITY,
    region text NOT NULL,
    total_cents integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY LIST (region);

CREATE TABLE orders_us PARTITION OF orders FOR VALUES IN ('us-east', 'us-west');
CREATE TABLE orders_eu PARTITION OF orders FOR VALUES IN ('eu-west', 'eu-central');
```

**Use when**: Queries almost always filter by the partition key value, and the set of values is small and known.

### Hash Partitioning

Distributes rows evenly across N partitions based on a hash of the partition key. Useful for spreading load when there's no natural range or list key.

```sql
CREATE TABLE sessions (
    id bigint GENERATED ALWAYS AS IDENTITY,
    user_id bigint NOT NULL,
    data jsonb
) PARTITION BY HASH (user_id);

CREATE TABLE sessions_0 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE sessions_1 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 1);
-- etc.
```

**Use when**: You need to spread write load and don't have a natural range key. Less common than range partitioning.

## MySQL Partitioning

MySQL supports RANGE, LIST, HASH, and KEY partitioning but with more limitations:
- Partition key must be part of every unique index (including PK)
- No foreign keys on partitioned tables
- Limited to 8192 partitions per table

```sql
CREATE TABLE events (
    id bigint AUTO_INCREMENT,
    created_at datetime NOT NULL,
    event_type varchar(50) NOT NULL,
    PRIMARY KEY (id, created_at)  -- partition key must be in PK
) PARTITION BY RANGE (YEAR(created_at) * 100 + MONTH(created_at)) (
    PARTITION p202501 VALUES LESS THAN (202502),
    PARTITION p202502 VALUES LESS THAN (202503)
);
```

## Partition Key Selection

The partition key should be:
1. Present in almost every query's WHERE clause
2. Monotonically increasing (for range partitioning) so new data goes to the latest partition
3. Not frequently updated (moving a row between partitions is a delete + insert)

Common partition keys: `created_at`, `event_date`, `tenant_id`, `region`.

## Questions to Ask the User

When partitioning comes up, clarify:
1. What's the expected row count per month/year?
2. What's the data retention policy? (Keep forever, drop after N months, archive to cold storage?)
3. Do all queries filter by the partition key candidate?
4. What's the target database? (PostgreSQL and MySQL have very different partitioning capabilities)
5. Is there an existing partitioning strategy in the codebase?
