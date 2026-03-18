# Stacking PRs with Graphite

How to plan, create, and manage stacks of pull requests that are small, reviewable, and independently mergeable.

## Table of Contents

- [Why Stack?](#why-stack)
- [Planning a Stack](#planning-a-stack)
- [Decomposition Strategies](#decomposition-strategies)
- [Creating the Stack](#creating-the-stack)
- [Managing an Active Stack](#managing-an-active-stack)
- [Review Best Practices](#review-best-practices)
- [Anti-Patterns](#anti-patterns)

---

## Why Stack?

Large PRs are a bottleneck. A 1000-line PR takes days to review, hides bugs in the noise, and blocks downstream work. Stacking fixes this by breaking features into a chain of small PRs, each under ~200 lines.

Benefits:
- **Unblocked development**: Start PR 3 while PR 1 is still in review
- **Faster reviews**: Reviewers can understand 100 lines in minutes, not hours
- **Easier debugging**: When something breaks, the cause is in a small, recent change
- **Automatic rebasing**: Graphite handles dependency management — no manual rebase chains

---

## Planning a Stack

If the user provides an existing plan, spec, or task list, use that as the starting point — don't reinvent the decomposition. Map their plan items to stacked PRs, adjusting boundaries only where a single item would exceed ~200 lines. If no plan exists, sketch the stack together.

Each PR should be:

1. **Atomic**: One logical change — a component, an endpoint, a migration
2. **Independently testable**: Tests should pass at every PR boundary
3. **Reviewable without full context**: A reviewer shouldn't need to read 4 other PRs to understand this one
4. **Ordered by dependency**: Data models before business logic, business logic before UI

A good heuristic: if you can describe the PR in a single sentence without "and", the scope is right.

### Example: E-Commerce Checkout Feature

Instead of one massive "Add checkout" PR:

```
PR 1: Add checkout button component to cart page
PR 2: Create checkout form with validation
PR 3: Integrate payment gateway (Stripe) service
PR 4: Wire up order submission and confirmation flow
PR 5: Add checkout analytics and error tracking
```

Each PR builds on the previous one, but each is understandable and reviewable on its own.

### Example: API Feature

```
PR 1: Add database migration for new table
PR 2: Create data model and repository layer
PR 3: Add service layer with business logic
PR 4: Create API endpoint with validation
PR 5: Add integration tests
```

### Example: Refactoring

```
PR 1: Extract shared interface/type
PR 2: Migrate module A to new interface
PR 3: Migrate module B to new interface
PR 4: Remove old interface and dead code
```

---

## Decomposition Strategies

When breaking a feature into PRs, use one or more of these strategies:

### By Layer
Split along architectural layers: database → model → service → API → UI. Works well for new features that touch the full stack.

### By Component
Split by UI component or service boundary. Works well for features that are horizontally distributed.

### By Behavior
Each PR adds one user-visible behavior. Works well for features with multiple distinct user interactions.

### By Risk
Put risky or controversial changes in their own PR so they can be reviewed more carefully. Isolate migrations, security changes, and performance-sensitive code.

### By Reversibility
Group irreversible changes (schema drops, data migrations) separately from easily-reverted changes. This makes rollback planning clearer.

---

## Creating the Stack

### Starting a New Stack

```bash
# Start from trunk
gt checkout --trunk

# Create the first branch in the stack
gt create -m "feat: add users table migration"
# Stage specific files for this PR
gt add db/migrations/001_users.sql schema.prisma
gt modify

# Work on the next piece — it automatically stacks on top
gt create -m "feat: add user model and repository"
gt add lib/models/user.ts lib/repositories/user.ts
gt modify

# Continue stacking
gt create -m "feat: add user registration endpoint"
gt add app/api/register/route.ts
gt modify
```

Use `gt add` with specific file paths rather than the `-a` flag when you want precise control over what goes into each PR. The `-a` flag is convenient for quick single-file changes, but for multi-file features it's better to be explicit.

### Adding to an Existing Stack

```bash
# Navigate to where you want to insert
gt checkout existing-branch

# Create stacks on top
gt create -am "feat: next piece of work"
```

### Inserting Into the Middle of a Stack

```bash
# Go to the branch you want to insert AFTER
gt checkout branch-2-of-5

# Insert creates a branch between current and its children
gt create -i -am "feat: forgot this piece"
# Now: branch-2 → new-branch → branch-3 → branch-4 → branch-5
```

### Splitting a Branch That's Too Large

If a branch grew beyond ~200 lines:

```bash
# Split by file — each file gets its own branch
gt split -f

# Split by commit — each commit becomes a branch
gt split -c

# Split by hunk — interactive, most precise
gt split -h
```

---

### Build-Then-Stack: Retroactive Splitting

Sometimes it's more practical to develop a larger chunk first and split it into stacked PRs afterward. This works well when:
- You're exploring an unfamiliar codebase and don't know the right boundaries yet
- Files are tightly coupled and you need the full picture before deciding PR scope
- You're prototyping and want to validate the approach before structuring for review

Workflow:
```bash
# Develop everything on one branch
gt create -m "feat: notifications system"
# ... build the complete feature ...

# Split into a stack retroactively
gt split -f     # by file — each file or group becomes its own branch
gt split -h     # by hunk — interactive, most precise
gt split -c     # by commit — if you made granular commits

# Review and adjust
gt log --stack
# Use gt fold to merge branches that are too small
# Use gt split again on branches that are too large

# Submit
gt submit --stack
```

---

## Managing an Active Stack

### Checking Stack Status

```bash
gt log --stack          # see your current stack structure
gt log                  # see all stacks
gt info                 # details about current branch
```

### Responding to Review Feedback

When a reviewer requests changes on a PR in the middle of the stack:

```bash
gt checkout the-branch   # go to the branch needing changes
# make the fixes
gt modify -a             # amend the commit — children auto-restack
gt submit --stack        # push the whole updated stack
```

### Syncing with Trunk

```bash
gt sync                  # fetch trunk, clean merged branches, restack
```

If conflicts arise during restack:
1. Resolve the conflicts in your editor
2. Stage the resolved files: `gt add .`
3. Continue the restack: `gt continue`

### Reordering Branches

```bash
gt reorder               # interactive — rearrange the stack
```

### Moving a Branch to a Different Parent

```bash
gt move --onto new-parent   # rebase current branch onto new-parent
gt move --onto new-parent -a # move current branch and all upstack
```

### Folding Branches Together

If two adjacent branches should be one PR:

```bash
gt checkout the-child-branch
gt fold                  # merges into parent
```

### Absorbing Changes Into the Right Commit

When you have staged changes that logically belong to an earlier commit in the stack:

```bash
gt absorb -a             # auto-assigns changes to the right downstack commits
gt absorb -d             # dry run — preview where changes would go
```

---

## Review Best Practices

### For Authors

- **Submit early**: Open PRs as soon as each branch is ready, even if the stack isn't complete
- **Use draft status**: Mark incomplete work as draft (`gt submit -d`)
- **Write meaningful PR descriptions**: Each PR should explain what changed, why, and the benefit — without requiring the reviewer to read other PRs in the stack
- **Assign targeted reviewers**: Different PRs may need different reviewers (backend vs frontend)
- **Enable merge-when-ready**: `gt submit -m` auto-merges after approval

### For Reviewers

- **Review bottom-up**: Start with the PR closest to trunk and work upward
- **Treat each PR independently**: If a PR doesn't make sense without heavy context from the stack, ask the author to restructure
- **Review promptly**: Stacked PRs are designed to be small and fast to review — don't let them sit
- **Watch for upstack impacts**: Graphite's UI shows when reviewed code is modified in higher PRs

### GitHub Settings for Smooth Stacking

Configure these in your GitHub repo settings:
- **Disable** "Dismiss stale approvals" — prevents unnecessary re-reviews when parent PRs change
- **Disable** "Require approval of most recent push" — stacking involves frequent force pushes
- **Enable** auto-merge in repository settings

---

## Anti-Patterns

### The Monolith Stack
One giant PR with 15 commits. If you're past ~200 lines, split it with `gt split`.

### The Unreviewed Pile
Stacking 10 PRs before submitting any for review. Submit early (`gt submit --stack`) and iterate.

### Tight Coupling Between PRs
If PR 3 can't be understood without reading PRs 1 and 2, the boundaries are wrong. Each PR should be a coherent unit.

### Premature Stacking
Not every change needs a stack. A single bug fix or config change is fine as one PR. Stack when the work naturally decomposes into 2+ sequential steps.

### Waiting for Merges
Don't wait for PR 1 to merge before starting PR 2. That defeats the purpose. Stack and keep going — Graphite handles the rebasing.
