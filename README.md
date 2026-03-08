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
/plugin marketplace add jtmthf/skills
```

Then install a plugin:

```
/plugin install my-plugin@jtmthf-skills
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

## Available Skills

### [`data-modeler`](./skills/data-modeler/SKILL.md)

An interactive agent skill for relational database schema design. Guides you through a structured 6-phase workflow:

1. **Capture Requirements** — entities, attributes, relationships, access patterns, scale
2. **Understand Existing Schema** — analyzes migrations, ORM models, and naming conventions
3. **Normalization** — applies 1NF/2NF/3NF with reasoned denormalization where justified
4. **Review** — full schema proposal with constraints, indexes, FK actions, and open questions
5. **Preview** — Mermaid ERD diagram of the approved schema
6. **Migration** — generates migration files for Prisma, Knex, Rails, Django, Alembic, Drizzle, TypeORM, or raw SQL

Triggers on: database modeling, schema design, adding tables/relationships, planning migrations, ERD creation, or any discussion of entities and normalization.
