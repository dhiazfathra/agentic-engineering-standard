# agentic-engineering-standard

This monorepo holds an agentic engineering template and projects cloned
from it. `CLAUDE.md` is a symlink to this file.

## Layout

- `template/` is the stack-agnostic boilerplate. It holds the rules, the
  learning files, the learn skill, and the Stop hook.
- `examples/<name>/` is a real project cloned from the template. Open the
  project directory itself as the agent workspace, so its hook and skills
  load.
- `scripts/new-project.sh` clones the template.
- `tests/run.sh` tests the scripts and the hook.

## Commands

- Test: `bash tests/run.sh`
- Lint: `shellcheck scripts/*.sh tests/*.sh template/.claude/hooks/*.sh`
- Format: `shfmt -w scripts tests template/.claude/hooks` and `prettier --write "**/*.md"`
- New project: `scripts/new-project.sh <name> [dest]`

## Rules

- Change the template only for general lessons that apply to any stack.
  Project specifics stay in the project.
- A template change does not reach projects that already exist. Port it to
  each example by hand when it matters.
- When you change the template's hook or the clone script, update
  `tests/run.sh` in the same change.
