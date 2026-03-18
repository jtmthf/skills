# Graphite CLI Command Reference

Complete reference for the `gt` CLI. Commands are grouped by function.

## Table of Contents

- [Global Flags](#global-flags)
- [Branch Navigation](#branch-navigation)
- [Creating & Modifying](#creating--modifying)
- [Reorganizing](#reorganizing)
- [Stack Management](#stack-management)
- [Remote Operations](#remote-operations)
- [Information & Utilities](#information--utilities)
- [Git Passthroughs](#git-passthroughs)
- [Administrative](#administrative)

---

## Global Flags

These flags work with any gt command:

| Flag | Description |
|---|---|
| `--help` | Display command help |
| `--allCommands` | Print full command list |
| `--cwd <dir>` | Specify working directory |
| `--debug` | Enable debug output |
| `--interactive / --no-interactive` | Allow prompts/editors (default: enabled) |
| `--verify / --no-verify` | Enable git hooks (default: enabled) |
| `--quiet` | Minimize terminal output |

---

## Branch Navigation

### `gt checkout [branch]`
Switch branches with stack-aware selection.

| Flag | Description |
|---|---|
| `-a, --all` | Show all branches |
| `-u, --show-untracked` | Include untracked branches |
| `-s, --stack` | Show only current stack |
| `-t, --trunk` | Jump to trunk |

### `gt up [steps]`
Move upstack (toward leaf branches).

| Flag | Description |
|---|---|
| `-n, --steps <N>` | Number of levels to move |
| `--to <branch>` | Move to specific upstack branch |

### `gt down [steps]`
Move downstack (toward trunk).

| Flag | Description |
|---|---|
| `-n, --steps <N>` | Number of levels to move |

### `gt top`
Jump to the tip (topmost branch) of the current stack.

### `gt bottom`
Jump to the base (bottommost branch) of the current stack.

### `gt parent`
Display the immediate parent branch name.

### `gt children`
Display immediate child branch names.

---

## Creating & Modifying

### `gt create [name]`
Create a new stacked branch on top of the current branch. This is the primary command for building stacks.

| Flag | Description |
|---|---|
| `--ai` | Generate commit message with AI |
| `-a, --all` | Stage all changes before committing |
| `-i, --insert` | Insert branch between current and its children |
| `-m, --message <msg>` | Commit message |
| `-p, --patch` | Interactive staging (select hunks) |
| `-u, --update` | Stage tracked file changes |
| `-v, --verbose` | Show detailed output |

**Examples:**
```bash
gt create -am "feat: add user avatar component"
gt create my-branch -m "fix: handle null email"
gt create --ai -a                                # AI-generated message
```

### `gt modify`
Amend the current branch's commit. Automatically restacks child branches.

| Flag | Description |
|---|---|
| `-a, --all` | Stage all changes |
| `-c, --commit` | Create new commit instead of amending |
| `-e, --edit` | Edit commit message |
| `--interactive-rebase` | Open interactive rebase |
| `--into` | Fold changes into a specific commit |
| `-m, --message <msg>` | New commit message |
| `-p, --patch` | Interactive staging |
| `--reset-author` | Reset author metadata |
| `-u, --update` | Stage tracked file changes |
| `-v, --verbose` | Show detailed output |

**Examples:**
```bash
gt modify -a                     # amend with all changes
gt modify -am "feat: updated message"
gt modify -c -m "additional work" # add new commit, don't amend
```

### `gt absorb`
Intelligently merge staged changes into the correct downstack commits based on which commit last touched each changed line.

| Flag | Description |
|---|---|
| `-a, --all` | Stage all changes first |
| `-d, --dry-run` | Preview without applying |
| `-f, --force` | Skip confirmation |
| `-p, --patch` | Interactive staging |

---

## Reorganizing

### `gt split`
Divide a branch into multiple branches.

| Flag | Description |
|---|---|
| `-c, --by-commit` | Split each commit into its own branch |
| `-f, --by-file` | Split by file |
| `-h, --by-hunk` | Split by hunk (interactive) |

### `gt squash`
Collapse multiple commits on the current branch into one.

| Flag | Description |
|---|---|
| `--edit` | Edit the resulting message |
| `-m, --message <msg>` | Set the squashed message |
| `-n, --no-edit` | Keep existing message |

### `gt fold`
Merge the current branch into its parent branch.

| Flag | Description |
|---|---|
| `-k, --keep` | Keep the branch after folding |

### `gt move`
Rebase the current branch onto a different parent.

| Flag | Description |
|---|---|
| `-a, --all` | Move the entire upstack |
| `-o, --onto <branch>` | Target parent branch |
| `--source <branch>` | Branch to move (default: current) |

### `gt reorder`
Rearrange branches in the stack interactively.

### `gt restack`
Rebase branches to resolve dependency mismatches.

| Flag | Description |
|---|---|
| `--branch <name>` | Restack specific branch |
| `--downstack` | Restack current branch and below |
| `--only` | Restack only current branch |
| `--upstack` | Restack current branch and above |

---

## Stack Management

### `gt track [branch]`
Start tracking an existing git branch in Graphite.

| Flag | Description |
|---|---|
| `-f, --force` | Force tracking |
| `-p, --parent <branch>` | Set parent branch |

### `gt untrack [branch]`
Stop tracking a branch in Graphite (branch remains in git).

### `gt delete [name]`
Remove a branch.

| Flag | Description |
|---|---|
| `-c, --close` | Also close the associated PR |
| `--downstack` | Delete the branch and everything below |
| `-f, --force` | Skip confirmation |
| `--upstack` | Delete the branch and everything above |

### `gt pop`
Delete the current branch but preserve uncommitted changes.

### `gt rename [name]`
Rename the current branch.

| Flag | Description |
|---|---|
| `-f, --force` | Force rename |

### `gt unlink [branch]`
Disconnect a branch from its associated PR.

### `gt freeze [branch]`
Lock a branch from edits.

### `gt unfreeze [branch]`
Unlock a frozen branch.

---

## Remote Operations

### `gt submit`
Push branches and create/update PRs on GitHub. The primary command for getting your stack reviewed.

| Flag | Description |
|---|---|
| `--ai` | Generate PR title/description with AI |
| `--always` | Submit even if no changes |
| `--branch <name>` | Submit specific branch |
| `-c, --confirm` | Confirm before submitting |
| `-d, --draft` | Create PRs as drafts |
| `--dry-run` | Preview without submitting |
| `-e, --edit` | Edit PR details before submitting |
| `--edit-description` | Edit PR description |
| `--edit-title` | Edit PR title |
| `-f, --force` | Force push |
| `--ignore-out-of-sync-trunk` | Submit even if trunk is out of sync |
| `-m, --merge-when-ready` | Auto-merge when approved |
| `--no-ai` | Disable AI generation |
| `-n, --no-edit` | Don't edit PR details |
| `-p, --publish` | Publish draft PRs |
| `--rerequest-review` | Re-request reviews |
| `-r, --reviewers <users>` | Set reviewers |
| `-s, --stack` | Submit entire stack |
| `--target-trunk` | Set PR base to trunk |
| `-t, --team-reviewers <teams>` | Set team reviewers |
| `-u, --update-only` | Only update existing PRs |
| `-v, --view` | Open PRs in browser after submit |
| `-w, --web` | Open PR creation in browser |

**Examples:**
```bash
gt submit                        # submit current branch
gt submit --stack                # submit entire stack
gt submit -d --stack             # submit stack as drafts
gt submit -m -r user1,user2     # submit with auto-merge and reviewers
gt submit --ai --stack           # AI-generated titles and descriptions
```

### `gt sync`
Sync with remote: fetch trunk, restack branches, clean merged branches.

| Flag | Description |
|---|---|
| `-a, --all` | Sync all stacks |
| `-f, --force` | Force sync |
| `--restack` | Restack after syncing |

### `gt get [branch]`
Fetch a branch from remote and track it locally.

| Flag | Description |
|---|---|
| `-d, --downstack` | Also fetch downstack branches |
| `-f, --force` | Force fetch |
| `--restack` | Restack after fetching |
| `-U, --unfrozen` | Fetch without freezing |
| `-u, --remote-upstack` | Also fetch upstack branches |

### `gt merge`
Merge the bottom of the stack into trunk.

| Flag | Description |
|---|---|
| `-c, --confirm` | Confirm before merging |
| `--dry-run` | Preview without merging |

---

## Information & Utilities

### `gt log [command]`
View stack structure and branch relationships. The go-to command for understanding your stack.

| Flag | Description |
|---|---|
| `-a, --all` | Show all stacks |
| `--classic` | Classic tree view |
| `-r, --reverse` | Reverse order |
| `-u, --show-untracked` | Include untracked branches |
| `-s, --stack` | Show only current stack |
| `-n, --steps <N>` | Limit depth |

### `gt info [branch]`
Display detailed branch information.

| Flag | Description |
|---|---|
| `-b, --body` | Show PR body |
| `-d, --diff` | Show diff |
| `-p, --patch` | Show patch |
| `-s, --stat` | Show diffstat |

### `gt trunk`
Display or configure the trunk branch.

| Flag | Description |
|---|---|
| `--add <branch>` | Add a trunk branch |
| `-a, --all` | Show all trunk branches |

### `gt pr [branch]`
Open the PR page in a browser.

| Flag | Description |
|---|---|
| `--stack` | Open the stack view |

---

## Git Passthroughs

These wrap the equivalent git commands while maintaining Graphite metadata:

| Command | Equivalent |
|---|---|
| `gt add [args..]` | `git add` |
| `gt cherry-pick [args..]` | `git cherry-pick` |
| `gt rebase [args..]` | `git rebase` |
| `gt reset [args..]` | `git reset` |
| `gt restore [args..]` | `git restore` |

---

## Administrative

| Command | Description |
|---|---|
| `gt auth [-t token]` | Configure authentication |
| `gt init [--reset] [--trunk]` | Initialize Graphite in a repo |
| `gt config` | Configure CLI settings |
| `gt aliases [--legacy] [--reset]` | Edit command aliases |
| `gt abort [-f]` | Stop a halted rebase |
| `gt continue [-a]` | Resume a halted rebase |
| `gt undo [-f]` | Revert recent gt operations |
| `gt revert [sha] [-e]` | Create a revert branch |
| `gt completion` | Configure bash/zsh completions |
| `gt fish` | Configure fish completions |
| `gt upgrade` | Update gt to latest version |
| `gt dash` | Open the Graphite web dashboard |
| `gt docs` | Open CLI documentation |
| `gt feedback [message]` | Send feedback to Graphite |
