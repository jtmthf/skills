# Multi-Tenancy Patterns

Read this reference when the domain is SaaS, multi-tenant, or involves tenant/organization isolation.

## Choosing a Strategy

There are three primary patterns. The right choice depends on isolation requirements, operational complexity tolerance, and scale.

### Row-Level Tenancy (Shared Schema)

All tenants share the same tables. Every tenant-scoped table has a `tenant_id` column.

```sql
CREATE TABLE projects (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    tenant_id bigint NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Every query must filter by tenant_id. A missing WHERE clause leaks data.
CREATE INDEX idx_projects_tenant ON projects (tenant_id);

-- Uniqueness is always scoped to tenant
CREATE UNIQUE INDEX idx_projects_tenant_name ON projects (tenant_id, name);
```

**When to use**: Most SaaS applications. Simplest to operate, easiest to query across tenants (for admin/analytics), lowest infrastructure cost.

**Risks**:
- Every query must include `tenant_id` — a missing filter leaks cross-tenant data. Mitigate with PostgreSQL Row Level Security (RLS):
  ```sql
  ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON projects
    USING (tenant_id = current_setting('app.current_tenant')::bigint);
  ```
- Noisy neighbor: one tenant's heavy queries affect others. Mitigate with connection pooling limits and query timeouts.
- All unique constraints must include `tenant_id` in the composite.

**Recommended for**: Most applications unless there's a regulatory or contractual requirement for stronger isolation.

### Schema-Per-Tenant

Each tenant gets their own PostgreSQL schema within a shared database. Tables are identical across schemas.

```sql
CREATE SCHEMA tenant_42;
CREATE TABLE tenant_42.projects (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
```

**When to use**: When tenants need stronger isolation (different data retention policies, independent backup/restore) but full database separation is overkill.

**Risks**:
- Schema migrations must be applied to every tenant schema — migration tooling must handle this
- Cross-tenant queries (admin dashboards, analytics) require `UNION ALL` across schemas or a separate analytics pipeline
- Connection management: `SET search_path` per request, or separate connection pools per tenant. **Security**: validate the tenant schema name against a whitelist before interpolating into `SET search_path` — an unvalidated value is a SQL injection vector.
- PostgreSQL catalog bloat: thousands of schemas with identical table definitions bloat `pg_class`

**Recommended for**: B2B SaaS with contractual isolation requirements, regulated industries, or tenants with meaningfully different data lifecycle needs.

### Database-Per-Tenant

Each tenant gets a separate database (or separate database cluster).

**When to use**: Maximum isolation. Required when tenants are in different jurisdictions with data residency laws, or when the contract guarantees dedicated infrastructure.

**Risks**:
- Highest operational complexity: each database needs independent backup, monitoring, migrations
- Cross-tenant queries essentially impossible without ETL
- Connection management per database
- Cost scales linearly with tenants

**Recommended for**: Enterprise SaaS with data residency requirements, healthcare/government contracts, or very large tenants that need dedicated resources.

### Horizontal Sharding

Horizontal sharding distributes data across multiple database nodes by a shard key. Unlike partitioning (which stays on one server), sharding spans machines.

**Approaches**:
- **Citus (PostgreSQL)**: Distributes tables by a distribution column (usually `tenant_id`). Queries that include the distribution key are routed to the correct shard; cross-shard queries are handled by the coordinator. Best fit for multi-tenant workloads already using row-level tenancy.
- **Vitess (MySQL)**: Sharding middleware originally built for YouTube. Handles query routing, resharding, and connection pooling. Higher operational complexity but production-proven at extreme scale.
- **Application-level sharding**: The application maintains a shard routing table (`tenant_id → database host`). Simpler infrastructure but shifts routing logic into every service.

**When to consider**: After exhausting single-database optimizations (partitioning, read replicas, connection pooling, query tuning). Sharding introduces distributed systems complexity — avoid it until there's a clear bottleneck that simpler approaches can't solve.

**Schema implications**:
- The shard key (`tenant_id`) must be present in every distributed table and included in composite primary keys
- Cross-shard JOINs are expensive or impossible — analytics typically requires a separate ETL pipeline or a dedicated analytics database
- Schema migrations must coordinate across all shards

## Common Design Patterns Across Strategies

**Tenant table**: Always have a `tenants` (or `organizations`) table as the root:
```sql
CREATE TABLE tenants (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9-]+$'),
    plan text NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'pro', 'enterprise')),
    created_at timestamptz NOT NULL DEFAULT now()
);
```

**User-tenant membership**: Users typically belong to one or more tenants:
```sql
CREATE TABLE memberships (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id bigint NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    role text NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member', 'viewer')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, tenant_id)
);
```

**Feature gating by plan**: If different plans unlock different features, consider a `plan_features` lookup table rather than hardcoding in application logic. This keeps the feature matrix queryable and auditable.

## Questions to Ask the User

When multi-tenancy comes up, clarify:
1. How many tenants are expected? (10s, 1000s, millions?)
2. Are there data residency or compliance requirements?
3. Do tenants need independent backup/restore?
4. Will there be cross-tenant analytics or admin views?
5. Can users belong to multiple tenants?
6. Are there different plans with different feature access?
