# agentic-engineering-standard

This monorepo holds two agentic engineering templates and the projects
cloned from them. `CLAUDE.md` is a symlink to this file.

## Layout

- `templates/agnostic/` is the stack-agnostic base. It holds the rules, the
  learning files, the learn skill, and the Stop hook.
- `templates/opinionated/` is an overlay on top of the base. It fixes the
  stack (Next.js on Vercel, Turso, self-hosted MinIO). It holds only the
  files that differ from the base. A file named `<file>.append` is appended
  to the base file instead of replacing it.
- `examples/<name>/` is a real project cloned from a template.
  `examples/rewind` is built from the opinionated template. Open the
  project directory itself as the agent workspace, so its hook and skills
  load.
- `scripts/new-project.sh` clones a template.
- `tests/run.sh` tests the script and the hook.

## Commands

- Test: `bash tests/run.sh`
- Lint: `shellcheck scripts/*.sh tests/*.sh templates/agnostic/.claude/hooks/*.sh`
- Format: `shfmt -w scripts tests templates/agnostic/.claude/hooks` and `prettier --write "**/*.md"`
- New project: `scripts/new-project.sh [-t agnostic|opinionated] <name> [dest]`

## Rules

- A lesson that applies to any stack goes in `templates/agnostic`. A
  stack-specific lesson goes in `templates/opinionated`. Project
  specifics stay in the project.
- Never copy a base file into the overlay unless the content differs.
- A template change does not reach projects that already exist. Port it to
  each example by hand when it matters.
- When you change the hook or the clone script, update `tests/run.sh` in
  the same change.
- Work in this repo ends with the "Finishing work" steps in
  `templates/agnostic/AGENTS.md`. Monorepo decisions go in `docs/adr/`.

## Learning loop

Sessions at the root learn too. The root runs the agnostic template's
learn skill and Stop hook through symlinks in `.claude/`, so a fix to the
template fixes the root.

- `learning/MEMORY.md`: durable facts about this monorepo. Read it at session start.
- `learning/LESSONS.md`: what went wrong here, with evidence. `[project]`
  lessons stay here. `[general]` and `[stack]` lessons are promoted to
  `templates/`.
