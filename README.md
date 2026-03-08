# Skills

Agent skills for Claude, modeled after [anthropics/skills](https://github.com/anthropics/skills).

Skills are folders of instructions, scripts, and resources that Claude loads dynamically to improve performance on specialized tasks.

## Structure

- [`skills/`](./skills): Individual skill implementations (each in its own subfolder with a `SKILL.md`)
- [`template/`](./template): Starting point for new skills
- [`.claude-plugin/`](./.claude-plugin): Plugin manifest for Claude Code

## Adding a Skill

1. Copy `template/SKILL.md` into a new folder under `skills/`:
   ```
   skills/my-skill/SKILL.md
   ```
2. Fill in the `name`, `description`, and instructions in the markdown body.
3. Register the skill in `.claude-plugin/marketplace.json` under the appropriate plugin entry.

## Using in Claude Code

Register this repository as a plugin marketplace:

```
/plugin marketplace add <your-github-username>/skills
```

Then install a plugin:

```
/plugin install my-plugin@jack-agent-skills
```

## Skill Format

```markdown
---
name: my-skill-name
description: A clear description of what this skill does and when to use it.
---

# My Skill Name

Instructions for Claude to follow when this skill is active.
```

See the [Agent Skills spec](https://github.com/anthropics/skills/blob/main/spec/agent-skills-spec.md) and [Anthropic docs](https://support.claude.com/en/articles/12512198-creating-custom-skills) for more detail.
