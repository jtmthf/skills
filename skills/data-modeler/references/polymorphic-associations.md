# Polymorphic Associations

Read this reference when the design includes entities that can belong to multiple parent types — comments on posts/photos/videos, tags on articles/products/pages, attachments on messages/tasks/tickets, etc.

## The Problem

You need a `comments` table where a comment can belong to a `post`, a `photo`, or a `video`. The naive approach uses two columns:

```sql
-- Anti-pattern: polymorphic FK columns
CREATE TABLE comments (
    id bigint PRIMARY KEY,
    commentable_type text NOT NULL,  -- 'post', 'photo', 'video'
    commentable_id bigint NOT NULL,  -- FK to... which table?
    body text NOT NULL
);
```

This is common in ORMs (Rails' `belongs_to :commentable, polymorphic: true`, Django's `GenericForeignKey`) but has real problems: the database cannot enforce referential integrity on `commentable_id` because it doesn't know which table it points to. Orphaned references accumulate silently. You also can't JOIN without a CASE expression, and composite indexes are awkward.

## Pattern 1: Exclusive Belongs-To (Exclusive Arc)

Add a nullable FK column for each parent type. Use a CHECK constraint to enforce that exactly one is set.

```sql
CREATE TABLE comments (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    post_id bigint REFERENCES posts(id) ON DELETE CASCADE,
    photo_id bigint REFERENCES photos(id) ON DELETE CASCADE,
    video_id bigint REFERENCES videos(id) ON DELETE CASCADE,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Exactly one parent must be set
    CHECK(
        (post_id IS NOT NULL)::int +
        (photo_id IS NOT NULL)::int +
        (video_id IS NOT NULL)::int = 1
    )
);

-- [MySQL] / [SQLite]: Cast-to-int is not portable. Use CASE WHEN instead:
-- CHECK(
--     CASE WHEN post_id IS NOT NULL THEN 1 ELSE 0 END +
--     CASE WHEN photo_id IS NOT NULL THEN 1 ELSE 0 END +
--     CASE WHEN video_id IS NOT NULL THEN 1 ELSE 0 END = 1
-- )

CREATE INDEX idx_comments_post ON comments (post_id) WHERE post_id IS NOT NULL;
CREATE INDEX idx_comments_photo ON comments (photo_id) WHERE photo_id IS NOT NULL;
CREATE INDEX idx_comments_video ON comments (video_id) WHERE video_id IS NOT NULL;
```

**Pros**: Full referential integrity. Database enforces exactly-one-parent. Clean JOINs. Straightforward partial indexes.

**Cons**: Adding a new parent type requires a migration (new nullable column + update CHECK). Gets unwieldy beyond 4–5 parent types.

**Use when**: The number of parent types is small and stable (2–5), and referential integrity matters.

## Pattern 2: Join Tables Per Parent Type

Create a separate association table for each parent type.

```sql
CREATE TABLE post_comments (
    comment_id bigint PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,
    post_id bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE photo_comments (
    comment_id bigint PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,
    photo_id bigint NOT NULL REFERENCES photos(id) ON DELETE CASCADE
);
```

**Pros**: Full referential integrity. Adding a new parent type is a new table, not a migration to existing tables. Each join table can have parent-specific metadata.

**Cons**: Querying "all comments for any parent" requires UNION ALL. More tables to manage.

**Use when**: Parent types will grow over time, or different parent types need different association metadata.

## Pattern 3: Shared Interface Table (Table Inheritance Simulation)

Create a `commentable_entities` table that acts as an abstract parent. Each concrete type references it.

```sql
CREATE TABLE commentable_entities (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    entity_type text NOT NULL CHECK(entity_type IN ('post', 'photo', 'video'))
);

CREATE TABLE posts (
    id bigint PRIMARY KEY REFERENCES commentable_entities(id),
    title text NOT NULL
    -- ...
);

CREATE TABLE comments (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    commentable_entity_id bigint NOT NULL REFERENCES commentable_entities(id) ON DELETE CASCADE,
    body text NOT NULL
);
```

**Pros**: Single FK on comments. Full referential integrity. Easy to query all comments.

**Cons**: Extra indirection table. Creating a post requires two inserts (commentable_entities + posts). Can feel over-engineered for simple cases.

**Use when**: There's a genuine shared interface or behavior across parent types, or you need this pattern for multiple child tables (comments, tags, attachments all pointing to the same abstract parent).

## Recommendation

Default to **Pattern 1 (Exclusive Arc)** for most cases — it's the simplest approach that maintains referential integrity, and most real-world polymorphic relationships have a small, stable set of parent types. If the user anticipates frequent new parent types, suggest Pattern 2. Pattern 3 is best reserved for complex domain models where the abstraction has independent meaning.

Always explain the trade-off to the user: the ORM-style polymorphic FK is the easiest to code against but gives up referential integrity at the database level. Whether that matters depends on how critical data consistency is to the domain.
