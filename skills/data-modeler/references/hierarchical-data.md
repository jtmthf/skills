# Hierarchical Data

Read this reference when the domain involves categories, org charts, threaded comments, menus, file systems, or any self-referential entity — i.e., records that belong to other records of the same type.

## Pattern Comparison

| | Adjacency List | Materialized Path | Closure Table |
|---|---|---|---|
| Schema complexity | Low | Low | Medium |
| Find direct children | Simple query | LIKE query | Join |
| Find all descendants | Recursive CTE | LIKE query | Join |
| Find all ancestors | Recursive CTE | String split | Join |
| Insert node | O(1) | O(1) | O(depth) |
| Move subtree | O(1) | O(subtree) | O(subtree) |
| Referential integrity | FK enforced | Not enforced | FK enforced |
| CTE support required | Yes (PostgreSQL 8.4+, MySQL 8.0+, SQLite 3.35+) | No | No |

## Pattern 1: Adjacency List (Default)

Each record stores a reference to its immediate parent. The simplest approach.

```sql
CREATE TABLE categories (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    parent_id bigint REFERENCES categories(id) ON DELETE RESTRICT,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_parent ON categories (parent_id);
```

Root nodes have `parent_id = NULL`.

**Querying descendants** (requires recursive CTE):
```sql
WITH RECURSIVE subtree AS (
    -- Base case: start node
    SELECT id, parent_id, name, 0 AS depth
    FROM categories WHERE id = $1

    UNION ALL

    -- Recursive case: children of current nodes
    SELECT c.id, c.parent_id, c.name, s.depth + 1
    FROM categories c
    JOIN subtree s ON c.parent_id = s.id
)
SELECT * FROM subtree ORDER BY depth;
```

**Pros**: Simple schema, easy writes, full referential integrity, standard SQL with CTE support.

**Cons**: Fetching full trees requires recursive CTEs (not available in all databases/versions). Deep trees with frequent ancestor queries can be slow.

**Use when**: The tree is shallow-to-medium depth, CTE support is available, and writes are frequent. This is the right default for most use cases.

## Pattern 2: Materialized Path

Each record stores its full path from root as a string (e.g., `/1/4/12/`).

```sql
CREATE TABLE categories (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    path text NOT NULL,  -- e.g., '/1/4/12/'
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_path ON categories (path);
-- [PostgreSQL]: text_pattern_ops enables LIKE prefix matching on the index
CREATE INDEX idx_categories_path_pattern ON categories (path text_pattern_ops);
```

**Find all descendants** (fast LIKE query, no recursion):
```sql
SELECT * FROM categories WHERE path LIKE '/1/4/%';
```

**Find all ancestors** (requires parsing the path string in application or SQL):
```sql
-- Find ancestors of node with path '/1/4/12/'
SELECT * FROM categories WHERE '/1/4/12/' LIKE path || '%';
```

**Insert**: Concatenate parent's path + new id. Moving a subtree requires updating `path` for every node in the subtree — expensive for large trees.

**Pros**: Fast subtree reads without recursion. Works in databases without CTE support.

**Cons**: Moving nodes is expensive (UPDATE all descendants). Path strings can get long. No database-enforced referential integrity on the path. Path parsing in queries is awkward.

**Use when**: The tree is read-heavy, moves are rare, and CTE support is unavailable or undesirable.

## Pattern 3: Closure Table

A separate table stores every ancestor-descendant pair, including self-references.

```sql
CREATE TABLE categories (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE category_ancestors (
    ancestor_id bigint NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    descendant_id bigint NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    depth integer NOT NULL,  -- 0 = self, 1 = parent, 2 = grandparent, etc.
    PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX idx_category_ancestors_descendant ON category_ancestors (descendant_id);
```

**Insert a new node** (O(depth) inserts — one row per ancestor):
```sql
-- Insert self-reference
INSERT INTO category_ancestors VALUES ($new_id, $new_id, 0);
-- Insert ancestors inherited from parent
INSERT INTO category_ancestors (ancestor_id, descendant_id, depth)
SELECT ancestor_id, $new_id, depth + 1
FROM category_ancestors WHERE descendant_id = $parent_id;
```

**Find all descendants** (single join, no recursion):
```sql
SELECT c.* FROM categories c
JOIN category_ancestors a ON c.id = a.descendant_id
WHERE a.ancestor_id = $root_id AND a.depth > 0;
```

**Find all ancestors** (single join):
```sql
SELECT c.* FROM categories c
JOIN category_ancestors a ON c.id = a.ancestor_id
WHERE a.descendant_id = $node_id AND a.depth > 0
ORDER BY a.depth DESC;
```

**Pros**: All queries are simple JOINs — no recursion, no string parsing. Full referential integrity. Most flexible for diverse query patterns.

**Cons**: Insert cost is O(depth). Move is expensive — delete old ancestor rows, insert new ones. The ancestor table can grow large for deep trees.

**Use when**: Queries are varied (frequent ancestor lookups, sibling queries, depth filtering), or the tree is deep and read-heavy.

## Recommendation

- **Default to adjacency list** — it's the simplest, has full referential integrity, and recursive CTEs handle most real-world trees efficiently. Only consider alternatives when there's a specific query-performance or compatibility constraint.
- **Materialized path** when CTE support is unavailable or the tree is very read-heavy and moves are rare.
- **Closure table** when you need maximum query flexibility (especially mixed ancestor/descendant queries) without recursion.

**Nested sets** (storing left/right pre-order traversal values) also exist but are not recommended — the write cost of inserts and moves is high and the model is hard to maintain correctly. Avoid unless migrating from an existing nested-sets schema.

## Questions to Ask the User

1. How deep is the tree expected to get? (Shallow: 3–5 levels; Deep: 10+ levels)
2. Are moves common, or is the tree mostly built once and read?
3. What query patterns matter most — children, full subtrees, ancestors, siblings?
4. What database and version? (Affects CTE support)
5. Is referential integrity critical, or is application-level enforcement acceptable?
