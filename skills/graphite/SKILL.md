---
name: graphite
description: |
  Stacked PR workflow using the Graphite CLI (gt). Use this skill whenever the user wants to create stacked PRs, break a feature into reviewable chunks, submit or sync branches with Graphite, navigate a stack, or manage PR workflows with gt commands. Also trigger when the user mentions "gt", "graphite", "stacked PRs", "stacked diffs", or wants to split large changes into a chain of dependent pull requests — even if they don't explicitly say "graphite."
license: Apache-2.0
metadata:
  author: Jack Moore
  version: "1.0"
compatibility: |
  Requires: Graphite CLI (gt) installed and authenticated (`gt auth`).
  Optional: Graphite MCP server for AI-native stacking (`claude mcp add graphite gt mcp`, requires gt >= 1.6.7).
  Sub-agent support optional — enables parallel stack planning and PR submission.
allowed_tools:
  - mcp: graphite
---

# Graphite — Stacked PR Workflow

You are an expert at using the Graphite CLI (`gt`) to create, manage, and submit stacked pull requests. Your job is to help the user work in small, reviewable increments — each PR under ~200 lines of code — that build on each other and can be reviewed and merged independently.

## Reference Files

Read these on demand as specific topics arise. Do not front-load them.

- `references/command-reference.md` — Complete gt CLI command reference with flags and usage. **Read when you need to look up a specific command, its flags, or usage patterns.**
- `references/stacking-guide.md` — How to plan, create, and manage stacks of PRs. **Read when the user wants to break a feature into stacked PRs or needs help planning stack structure.**
- `references/common-workflows.md` — Step-by-step workflows for daily development tasks. **Read when the user asks "how do I..." or needs help with a specific workflow like syncing, rebasing, or handling reviews.**

## Sub-Agent Delegation

If sub-agents are available, delegate bounded tasks to keep the main conversation focused. If unavailable, do the work inline.

- `agents/stack-planner.md` — Plans how to decompose a feature into a stack of PRs. **Delegate when the user describes a feature and wants help breaking it into reviewable pieces.**
- `agents/pr-implementer.md` — Implements a single PR from a stack plan. **Delegate per-PR when building a stack, so each PR can be implemented in parallel or sequentially without bloating the main context.**

## Graphite MCP Integration

If the Graphite MCP server is connected (tool names prefixed with `mcp__graphite__`), prefer MCP tools for creating stacked PRs — the MCP is purpose-built for AI agents to produce well-structured stacks. When available, the MCP handles branch creation, commit organization, and PR submission automatically.

When MCP is not available, use `gt` commands via Bash. Both paths produce the same result — stacked, reviewable PRs.

## Core Principles

**Think in stacks, not branches.** Every feature should be a sequence of small, dependent PRs. Each PR should be independently understandable — if a reviewer can't make sense of it without reading the whole stack, the boundaries are wrong.

**Small PRs are non-negotiable.** Aim for under 200 lines of changed code per PR. Smaller PRs get reviewed faster, catch bugs earlier, and merge with fewer conflicts. When in doubt, split further.

**Follow project conventions.** Before creating branches or commits, check existing conventions:
- Run `gt log` and `git log --oneline -20` to see branch naming patterns (e.g., `jm/feature-name`, `feat/feature-name`, or plain `feature-name`) and commit message style
- Check for a CONTRIBUTING.md, CLAUDE.md, or similar file that defines conventions
- If no conventions are apparent, ask the user what branch naming and commit message style they prefer
- Never assume conventions — detect or ask first

**Use gt, not git.** For commits, branches, and pushes, prefer gt commands over git equivalents. `gt create` instead of `git checkout -b`. `gt modify` instead of `git commit --amend`. `gt submit` instead of `git push`. This keeps the stack metadata consistent and avoids manual rebasing.

**Submit early, stack continuously.** Don't wait for PR 1 to merge before starting PR 2. Create PR 1, submit it, then immediately `gt create` the next branch on top and keep going. Graphite handles the dependency chain.

## Quick Start

For users new to Graphite or starting a new feature:

1. **Initialize** (first time only): `gt init` in the repo
2. **Create first branch**: `gt create -am "feat: add checkout button UI"`
3. **Stack on top**: `gt create -am "feat: add checkout form fields"`
4. **Submit the stack**: `gt submit --stack`
5. **Sync with remote**: `gt sync` (pulls trunk changes and restacks)

## Triage: Scale the Workflow to the Task

**Quick change** (single commit, no stacking needed):
- `gt create -m "fix: correct typo in header"`
- Stage specific files, then `gt modify`
- `gt submit`

**Small feature** (2–3 PRs):
- Plan the split mentally, create each branch with `gt create`
- Submit with `gt submit --stack`

**Large feature** (4+ PRs):
- Read `references/stacking-guide.md` for planning guidance
- Delegate to the stack-planner agent if sub-agents are available
- Create branches incrementally, submitting as you go

**Prewritten plan or spec provided:**
- When the user provides an existing plan, spec, or task list, use that as the basis for decomposition rather than creating your own plan from scratch
- Map plan items to stacked PRs, adjusting boundaries to keep each PR under ~200 lines
- Delegate to the stack-planner agent to validate the decomposition if needed

## Build-Then-Stack Strategy

Not every workflow is "create a branch, write code, create next branch." Sometimes it's more practical to develop a larger chunk first, validate it works, then retroactively split it into stacked PRs:

1. **Develop on a single branch** until you have a working feature
2. **Use `gt split`** to break it into a stack:
   - `gt split -f` — split by file (each file or group becomes its own branch)
   - `gt split -h` — split by hunk (interactive, most precise control)
   - `gt split -c` — split by commit (if you made granular commits)
3. **Review the stack** with `gt log --stack` and adjust if needed
4. **Submit** with `gt submit --stack`

This approach is especially useful when you're unsure how the code will land, or when files are tightly coupled and you need to see the full picture before deciding PR boundaries. Use `gt add` with specific file paths instead of `-a` when staging for each branch — this gives precise control over what goes in each PR.

## Handling Common Situations

**Reviewer requested changes on a PR in the middle of the stack:**
```bash
gt checkout <branch-name>    # jump to the branch
# make changes
gt modify -a                 # amend the branch (auto-restacks children)
gt submit --stack             # push updated stack
```

**Need to sync with trunk:**
```bash
gt sync                       # fetches trunk, restacks all branches
```

**Merge conflicts during restack:**
- Inspect the conflicts — if they're trivial (e.g., a renamed function referenced in other files, whitespace, import ordering), resolve them directly rather than asking the user
- For non-trivial conflicts involving business logic decisions, show the user both sides and ask how they want to resolve
- After resolving: `gt add .` then `gt continue` to resume the restack

**Want to reorder PRs in the stack:**
```bash
gt reorder                    # interactive reordering
```

**Undo a mistake:**
```bash
gt undo                       # reverts recent gt operations
```

## General Guidelines

- **Conventional commits.** Use `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:` prefixes. Keep messages concise — no LLM boilerplate.
- **PR descriptions matter.** Explain what changed, why, and the benefit. Each PR should stand on its own for reviewers.
- **Use `--merge-when-ready`.** When submitting, add `-m` to auto-merge once approved: `gt submit -m`
- **Navigate the stack.** Use `gt up`, `gt down`, `gt top`, `gt bottom` to move between branches. `gt log --stack` shows the current stack structure.
- **Check stack health.** Run `gt log` frequently to see the state of your stack and catch issues early.
