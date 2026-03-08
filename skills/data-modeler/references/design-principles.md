# Design Principles

These principles apply across all phases. They reflect hard-won lessons from production database design — internalize them so they inform every decision you make.

> **Database-specific note**: Many examples below use PostgreSQL syntax. When the target database is MySQL, SQLite, or SQL Server, adapt accordingly — key differences are called out with **[MySQL]**, **[SQLite]**, or **[SQL Server]** markers. If no marker is present, the advice applies broadly.

## Table of Contents
- [Data Type Rigor](#data-type-rigor)
- [Constraint-First Design](#constraint-first-design)
- [Immutability and Data History](#immutability-and-data-history)
- [Index Strategy](#index-strategy)
- [Denormalization Discipline](#denormalization-discipline)

---

## Data Type Rigor

Choose types deliberately. The wrong type is expensive to fix once data exists.

**Primary keys**: Prefer `bigint` auto-increment for most cases. If UUIDs are needed (distributed systems, API exposure), use UUIDv7 or ULID for better index locality — random UUIDs (v4) fragment B-tree indexes. Never expose auto-increment IDs in public APIs (they leak volume info); add a separate public-facing identifier column.

**Money**: Store as integer minor units (e.g., `amount_cents integer`) as the strong default. Integer math is exact and faster. The application layer converts for display. Exceptions to note to the user when relevant:
- Currencies with no minor unit (Japanese yen) — store as integer yen
- Currencies with three decimal places (Kuwaiti dinar, Bahraini dinar) — store as integer fils (thousandths)
- Sub-cent precision needs (gas pricing, forex) — use `numeric`/`decimal` with explicit scale
- Never use `float` or `double` for money under any circumstances

**Text vs varchar**: Prefer `text` over `varchar(n)` unless the database or domain requires a hard length limit. Arbitrary length caps like `varchar(255)` add constraint without value in PostgreSQL. Use CHECK constraints for actual validation (e.g., `CHECK(length(email) <= 320)`). **[MySQL]**: `text` and `varchar` have different storage and indexing characteristics — `varchar(n)` is often appropriate. **[SQL Server]**: `nvarchar` is preferred for Unicode support.

**Timestamps**: Use `timestamptz` (timestamp with time zone) for anything time-sensitive. Bare `timestamp` silently drops timezone info, causing subtle bugs across time zones. The only exception is pure calendar dates (`date` type) and cases where the application explicitly manages timezone conversion. **[MySQL]**: MySQL lacks a true `timestamptz` — use `DATETIME(6)` and handle timezone conversion at the application level, or use `TIMESTAMP` (which converts to UTC but has a 2038 limitation). **[SQLite]**: Store as ISO 8601 text strings.

**Status fields**: Constrain with CHECK constraints or a lookup/reference table. Never leave status as an unconstrained string — typos and invalid values will creep in. Prefer string columns with CHECK constraints over database-level ENUMs (e.g., PostgreSQL `CREATE TYPE ... AS ENUM`) — ENUMs are harder to modify (adding values requires `ALTER TYPE`, removing values requires migration gymnastics), while CHECK constraints can be dropped and recreated:
```sql
status text NOT NULL CHECK(status IN ('pending', 'active', 'archived'))
```
That said, ENUMs have legitimate uses (type safety across multiple tables, catalog documentation). If the project already uses ENUMs consistently, follow that convention. **[MySQL]**: MySQL's `ENUM` type is a column-level feature with fewer migration issues than PostgreSQL's `CREATE TYPE`. **[SQLite]**: No native ENUM; use CHECK constraints.

**Booleans**: Use `boolean` type where supported (PostgreSQL, MySQL). For databases without native boolean support (older SQLite), use `integer` with CHECK(value IN (0, 1)). Prefer positive naming (`is_active` over `is_not_deleted`) to avoid double-negative confusion in queries.

**JSON columns**: Use sparingly — only for truly schemaless data where the structure varies meaningfully per row. Frequent JSON field queries are a signal to normalize into proper columns or tables. JSON is useful for metadata bags, user preferences, and API response caching.

- **[PostgreSQL]**: Always prefer `jsonb` over `json`. `jsonb` is stored in a decomposed binary format, supports indexing, and is faster for reads. `json` preserves key order and whitespace, which is almost never useful.
  - Index JSON fields with GIN indexes for containment queries:
    ```sql
    CREATE INDEX idx_events_payload ON events USING GIN (payload);
    -- Enables: WHERE payload @> '{"type": "click"}'
    ```
  - For path-specific lookups, a functional index is more efficient than a full GIN:
    ```sql
    CREATE INDEX idx_events_type ON events ((payload->>'type'));
    ```
  - Large `jsonb` values trigger PostgreSQL's TOAST mechanism (out-of-line storage). This is transparent but can add overhead when reading large documents frequently — consider storing only indexable/queryable fields in JSON and large blobs in object storage.
- **[MySQL]**: `json` type (5.7.8+) is stored as binary internally. To index a JSON field, use a generated column:
  ```sql
  ALTER TABLE events ADD COLUMN event_type varchar(50) GENERATED ALWAYS AS (payload->>'$.type') STORED;
  CREATE INDEX idx_events_type ON events (event_type);
  ```
- **[SQLite]**: No native JSON type; store as `TEXT`. Use `json_extract()` and related JSON functions (available since SQLite 3.38) for querying:
  ```sql
  SELECT * FROM events WHERE json_extract(payload, '$.type') = 'click';
  ```

**Generated/computed columns**: Useful for indexing derived values without duplicating logic in the application.

- **[PostgreSQL]**: `GENERATED ALWAYS AS ... STORED` — value is computed from other columns and stored on write:
  ```sql
  CREATE TABLE products (
      price_cents integer NOT NULL,
      tax_rate numeric(5,4) NOT NULL,
      total_cents integer GENERATED ALWAYS AS (ROUND(price_cents * (1 + tax_rate))) STORED
  );
  ```
- **[MySQL]**: Supports both `VIRTUAL` (computed on read, not stored) and `STORED` (computed on write, stored on disk):
  ```sql
  -- Virtual: no storage cost, recomputed on every read
  full_name varchar(255) GENERATED ALWAYS AS (CONCAT(first_name, ' ', last_name)) VIRTUAL,
  -- Stored: can be indexed
  full_name varchar(255) GENERATED ALWAYS AS (CONCAT(first_name, ' ', last_name)) STORED
  ```
- **[SQLite]**: Supports `GENERATED ALWAYS AS` with `STORED` or `VIRTUAL` (SQLite 3.31+).
- **[SQL Server]**: Uses `AS (expression)` syntax; add `PERSISTED` to store the value.
- **Limitations**: Generated columns cannot reference other generated columns or columns in other tables. They cannot be the target of INSERT/UPDATE. Use them primarily as indexing targets for derived values.

---

## Constraint-First Design

Constraints are not optional hardening — they are the schema. Every business rule that can be expressed as a constraint should be, because application-layer validation has bugs, but the database is always on.

**Uniqueness**: Think hard about what combinations must be unique. Composite unique constraints are cheap and prevent entire categories of bugs:
- `UNIQUE(order_id, product_id)` on line items prevents duplicate entries
- `UNIQUE(user_id, role_id, organization_id)` on memberships prevents duplicate assignments
- `UNIQUE(slug, tenant_id)` on content ensures URL uniqueness per tenant

**Foreign key actions**: Choose `ON DELETE` behavior explicitly for every FK:
- **RESTRICT** (default, safest): Deletion blocked until references are cleaned up. Use when the referenced entity has independent business meaning.
- **CASCADE**: Deleting parent deletes children. Use only for true ownership where children have no meaning without the parent (line items on an order, comments on a deleted post).
- **SET NULL**: Sets FK to NULL on parent deletion. Use when the relationship is optional and historical reference isn't critical (e.g., assigned_to on a task when an employee leaves).
- **NO ACTION**: Similar to RESTRICT but checked at transaction end rather than statement end. Prefer RESTRICT for clarity.

Never cascade-delete entities that have independent business meaning. Don't cascade-delete roles that have memberships pointing to them — force explicit reassignment first.

**CHECK constraints**: Use for value ranges, valid status strings, positive amounts, non-empty strings:
```sql
CHECK(quantity > 0)
CHECK(length(name) > 0)
CHECK(discount_percent BETWEEN 0 AND 100)
CHECK(email ~* '^[^@]+@[^@]+\.[^@]+$')  -- basic email format (PostgreSQL)
```

**Partial unique indexes**: Use when uniqueness is conditional (PostgreSQL, SQLite 3.15+):
```sql
-- Only one default address per customer
CREATE UNIQUE INDEX idx_one_default_address
  ON addresses (customer_id) WHERE is_default = true;

-- Unique active subscription per user (allow multiple cancelled)
CREATE UNIQUE INDEX idx_one_active_subscription
  ON subscriptions (user_id) WHERE status = 'active';
```
**[MySQL]**: MySQL does not support partial indexes. Alternatives: use a nullable column with a unique index (NULL values are excluded from uniqueness), or enforce at the application level. **[SQL Server]**: Supports filtered indexes with `WHERE` clauses.

**NOT NULL by default**: Make columns NOT NULL unless there's a specific reason for nullability. NULLs introduce three-valued logic that complicates queries and application code. If a value is optional, prefer a sensible default or a separate table over a nullable column.

---

## Immutability and Data History

Think carefully about what data changes over time and how that affects historical records.

**Snapshot mutable data on reference**: When an order references a shipping address and addresses can change, the order must either snapshot the address fields or the system must ensure addresses are append-only (new entry on change, old entry preserved). Apply this thinking to:
- Product prices on line items (always snapshot `unit_price` at order time)
- Shipping addresses on orders
- Tax rates at transaction time
- User display names on audit logs

**Soft deletes**: For domains with audit or compliance requirements (healthcare, finance, legal), implement soft deletes (`deleted_at timestamptz`) from day one. Retrofitting later means updating every query. For other domains, ask the user whether soft deletes are needed. When implementing soft deletes:
- Add a partial unique index excluding soft-deleted rows: `WHERE deleted_at IS NULL`
- Consider a view that filters out deleted records for application queries
- Plan for how soft-deleted records affect aggregates and reports

**Audit trails**: For sensitive data (clinical notes, financial records, permissions changes), consider version history:
- A `_versions` table that records every change with timestamp and actor
- Application-level audit libraries (`paper_trail` in Rails, `django-simple-history`, `temporal_tables` in PostgreSQL)
- At minimum, `created_at` and `updated_at` on every table

---

## Index Strategy

Bad indexing is the #1 cause of slow queries in production. Think about how data will be queried, not just how it's stored.

**Index every foreign key**: Every FK column should have an index. Some ORMs do this automatically (Rails), others don't (PostgreSQL raw, Prisma). Be explicit. Without an FK index, deleting a parent row triggers a sequential scan of the child table.

**Composite indexes over single-column**: For common multi-column query patterns, composite indexes are far more effective. Column order matters — put equality conditions first, then range conditions:
```sql
-- Serves: "recent pending orders for customer X"
CREATE INDEX idx_orders_customer_status_created
  ON orders (customer_id, status, created_at DESC);

-- Serves: "active users by last login"
CREATE INDEX idx_users_active_login
  ON users (is_active, last_login_at DESC) WHERE is_active = true;
```

**Avoid low-selectivity indexes**: An index on a boolean column or a status column with 3–4 values is rarely useful — the query planner prefers sequential scans when the index would return a large percentage of rows. Use partial indexes instead:
```sql
-- Instead of indexing all rows on status:
CREATE INDEX idx_orders_pending ON orders (created_at DESC) WHERE status = 'pending';
```

**Partial indexes for conditional queries**: If you frequently query a subset (active users, pending orders, non-deleted records), a partial index is smaller and faster.

**Cover hot query paths**: Identify the 3–5 most common queries and ensure each has an optimal index. Show the user which queries each index serves. This is the single most important indexing practice.

**When NOT to index**: Don't index columns that are rarely queried. Don't index very small tables (sequential scan is faster). Don't create indexes speculatively — each index slows writes and consumes storage.

---

## Denormalization Discipline

Normalize by default. Only denormalize when there is a known, demonstrated performance need — not speculatively.

**Cached aggregates** (like `order_total`) require a maintenance strategy:
- Database triggers (automatic but hidden complexity)
- Application-level sync (explicit but requires discipline)
- Periodic recalculation jobs (eventual consistency, simpler)

If the user hasn't identified this as a performance bottleneck, derive it from the source data.

**Acceptable denormalization**: A direct FK that saves a multi-table join (like `client_id` on invoices when derivable through joins) is reasonable denormalization. Document it and consider a CHECK constraint or trigger for consistency.

**When you do denormalize, always document:**
1. What is denormalized
2. Why (which query or access pattern)
3. How consistency is maintained
4. What happens if the source and cache diverge
