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

An interactive agent skill for relational database schema design and migration. Guides you through a structured 5-phase workflow, scaled to task complexity:

1. **Capture Requirements** — entities, attributes, relationships, access patterns, scale
2. **Understand Existing Schema** — brownfield scanning of migrations, ORM models, and naming conventions
3. **Validate & Refine** — normalization review, design-principles check, design-linter sub-agent
4. **Present for Approval** — full schema proposal with constraints, indexes, FK actions, ERD, and open questions
5. **Migration** — generates migration files for Prisma, Knex.js, Rails, Django, Alembic, Drizzle, TypeORM, raw SQL (PostgreSQL/MySQL), and more

**Sub-agents**: `schema-scanner` (brownfield analysis), `design-linter` (mechanical schema validation), `migration-writer` (framework-specific file generation)

**Reference library**: design principles, multi-tenancy patterns, polymorphic associations, table partitioning, hierarchical data (adjacency list / materialized path / closure table), zero-downtime migrations

**Framework support**: PostgreSQL, MySQL, SQLite, SQL Server — including Go ecosystem (golang-migrate, goose, Ent, GORM, sqlc, Atlas)

Triggers on: database modeling, schema design, adding tables/relationships, planning migrations, ERD creation, or any discussion of entities, foreign keys, or normalization.

### [`voice-writer`](./skills/voice-writer/SKILL.md)

A personalized writing voice skill that drafts text matching your tone, vocabulary, and formatting preferences. Ships configured for a specific author but is designed to be customized.

**Workflow:**
1. **Understand the Request** — routes to content type (announcement, proposal, article, guidance, update, message)
2. **Draft** — writes following the voice profile's sentence patterns, tone, and structure
3. **Critic Review** — self-reviews against banned phrases, voice profile, and formatting rules (up to 3 rounds)
4. **Present** — delivers the final draft

**Customizing for your voice:** Edit `reference/voice-profile.md` with your own sentence patterns, tone, vocabulary, and content types. Update `reference/banned-phrases.md` with phrases you want eliminated. The skill's Constraints in `SKILL.md` define formatting rules (no em dashes, no standalone greetings, etc.) which you can adjust to match your preferences.

**Reference files**: voice profile (patterns and habits), banned phrases (~40 AI-isms and dead language), critic protocol (self-review quality bar)

Triggers on: "write in my voice", "draft", "write this up", "announcement", "proposal", or when producing text meant to be sent or published.
