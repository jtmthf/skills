# Common Graphite Workflows

Step-by-step recipes for everyday development tasks with the Graphite CLI.

## Table of Contents

- [Starting a New Feature](#starting-a-new-feature)
- [Daily Sync Routine](#daily-sync-routine)
- [Responding to Code Review](#responding-to-code-review)
- [Rebasing and Conflict Resolution](#rebasing-and-conflict-resolution)
- [Cleaning Up After Merges](#cleaning-up-after-merges)
- [Working with Others' Stacks](#working-with-others-stacks)
- [Recovering from Mistakes](#recovering-from-mistakes)
- [CI and Merge Automation](#ci-and-merge-automation)
- [Using the Graphite MCP with AI Agents](#using-the-graphite-mcp-with-ai-agents)

---

## Starting a New Feature

### Simple feature (1–2 PRs)

```bash
gt sync                             # start fresh from trunk
gt create -am "feat: add user avatar upload"
# ... write code ...
gt submit                           # push and create PR
```

### Multi-PR feature (stacked)

```bash
gt sync
gt create -am "feat: add avatar storage service"
# ... write code for storage layer ...

gt create -am "feat: add avatar upload API endpoint"
# ... write code for API ...

gt create -am "feat: add avatar upload UI component"
# ... write code for UI ...

gt submit --stack                   # push all 3 and create PRs
```

### With AI-generated commit messages

```bash
gt create --ai -a                   # stages all, generates message with AI
gt submit --ai --stack              # generates PR titles/descriptions with AI
```

---

## Daily Sync Routine

Run this at the start of each session to stay current:

```bash
gt sync                             # fetch trunk, restack, clean merged branches
gt log                              # see state of all your stacks
```

If `gt sync` reports conflicts:
1. Inspect the conflicts — trivial ones (renamed symbols, import reordering, whitespace) can be resolved directly without user input
2. For non-trivial conflicts involving business logic, show the user both sides and ask
3. Stage resolved files: `gt add .`
4. Continue: `gt continue`

---

## Responding to Code Review

### Changes to a single PR

```bash
gt checkout the-branch              # go to the branch with feedback
# ... make the requested changes ...
gt modify -a                        # amend the commit
gt submit                           # push the update
```

### Changes to a PR in the middle of a stack

```bash
gt checkout middle-branch           # go to the branch
# ... make changes ...
gt modify -a                        # amend — children auto-restack
gt submit --stack                   # push the entire updated stack
```

### Adding a follow-up commit instead of amending

Sometimes it's clearer for reviewers to see the change as a separate commit:

```bash
gt checkout the-branch
# ... make changes ...
gt modify -c -m "fix: address review feedback on validation"
gt submit
```

You can squash later with `gt squash` before merging.

---

## Rebasing and Conflict Resolution

### Restack after trunk updates

```bash
gt sync --restack                   # fetch + restack in one step
```

### Restack a specific part of the stack

```bash
gt restack --upstack                # restack current branch and above
gt restack --downstack              # restack current branch and below
gt restack --only                   # restack only current branch
```

### Resolving conflicts

When a restack or sync hits conflicts:

```bash
# 1. Inspect the conflicting files
# 2. Trivial conflicts (renamed functions, import changes, whitespace):
#    resolve them directly — no need to bother the user
# 3. Non-trivial conflicts (business logic, ambiguous intent):
#    show the user both sides and ask how to resolve
# 4. Stage the resolved files
gt add .
# 5. Continue the restack
gt continue
```

If the restack is going badly and you want to start over:

```bash
gt abort                            # cancel the in-progress rebase
```

---

## Cleaning Up After Merges

Graphite handles most cleanup automatically during `gt sync`, but you can also:

```bash
# Delete a specific branch (also closes the PR)
gt delete branch-name -c

# Delete a branch and everything above it
gt delete branch-name --upstack

# Remove a branch but keep the uncommitted changes
gt pop
```

---

## Working with Others' Stacks

### Fetching someone else's stack for review

```bash
gt get their-branch -d              # fetch with downstack (full context)
gt log --stack                      # see the stack structure
gt info -d                          # view the diff
```

### Checking out a PR by number

```bash
gt get pr-branch-name               # fetch and track the branch
```

---

## Recovering from Mistakes

### Undo the last gt operation

```bash
gt undo                             # revert the most recent gt command
```

### Force undo (when normal undo fails)

```bash
gt undo -f
```

### Accidentally committed to the wrong branch

```bash
# If you haven't pushed yet
gt undo                             # undo the commit
gt checkout correct-branch
gt create -am "the commit message"
```

### Need to move a branch to a different parent

```bash
gt move --onto correct-parent
```

---

## CI and Merge Automation

### Submit with auto-merge

```bash
gt submit -m                        # merge when CI passes and approved
gt submit -m --stack                # auto-merge the entire stack in order
```

### Submit as draft

```bash
gt submit -d                        # create as draft PR
gt submit -p                        # publish (un-draft) an existing PR
```

### Submit with specific reviewers

```bash
gt submit -r alice,bob              # individual reviewers
gt submit -t frontend-team          # team reviewers
```

### Re-request review after updates

```bash
gt submit --rerequest-review
```

---

## Using the Graphite MCP with AI Agents

The Graphite MCP server enables AI agents (Claude Code, Cursor, etc.) to create stacked PRs automatically. The MCP breaks large AI-generated changes into sequential, reviewable chunks.

### Setup

**Claude Code:**
```bash
claude mcp add graphite gt mcp
```

**Cursor:**
Add to MCP settings:
```json
{
  "mcpServers": {
    "graphite": {
      "command": "gt",
      "args": ["mcp"]
    }
  }
}
```

### Requirements
- Graphite CLI v1.6.7 or later (`gt upgrade`)
- Authenticated with Graphite (`gt auth`)

### How It Works

When the Graphite MCP is connected, AI agents can use MCP tools (prefixed `mcp__graphite__`) to:
- Plan stack structure for a feature
- Create branches with appropriate granularity
- Commit changes to the right branch in the stack
- Submit the stack for review

The MCP teaches agents to stack like a senior engineer — scoping PRs to be small, testable, and independently reviewable — without manual prompting.

### When to Use MCP vs CLI

- **MCP**: When the AI agent is autonomously building a feature and should decide how to stack
- **CLI (via Bash)**: When you want explicit control over each branch and commit, or when the MCP is not available

Both produce the same result: well-structured stacked PRs on GitHub.
