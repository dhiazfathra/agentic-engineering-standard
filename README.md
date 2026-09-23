# agentic-engineering-standard

This repo holds two templates for agentic engineering projects that learn
from their own use. It also holds real projects cloned from them.

## Layout

```
templates/agnostic/        stack-agnostic base
  AGENTS.md                project rules (CLAUDE.md is a symlink to it)
  docs/STACK.md            stack and commands (TBD)
  learning/MEMORY.md       durable project facts and decisions
  learning/LESSONS.md      mistakes, with evidence and a fix
  .claude/skills/learn     the learning-loop skill
  .claude/hooks/           Stop hook that asks the agent to run the learn skill
templates/opinionated/     overlay on agnostic: Next.js on Vercel, Turso, MinIO
  docs/STACK.md            the chosen stack
  docs/diagrams/           stack comparison behind the choice
  .gitignore.append        Next.js ignores, appended to the base .gitignore
examples/rewind/           working example and case study, built from opinionated
docs/adr/                  architecture decision records for this repo
scripts/new-project.sh     clones a template
tests/run.sh               tests for the script and the hook
```

## Start a project

```sh
scripts/new-project.sh my-app                        # agnostic, creates examples/my-app
scripts/new-project.sh -t opinionated my-app         # agnostic base + opinionated overlay
scripts/new-project.sh -t opinionated my-app ../app  # standalone copy
```

Open the new project's directory in Claude Code. For an agnostic project,
fill in `docs/STACK.md`.

To add another opinionated template, create `templates/<name>/` with only
the files that differ from the agnostic base. The script picks it up from
the directory.

## Finishing work

Every project, and this repo, ends each piece of work the same way. The
steps are in `templates/agnostic/AGENTS.md`:

1. Commit and push each logical change on its own, as soon as it passes.
2. Harden with `/security-review` and `/performance`.
3. Bring the README, docs, and ADRs up to date with `/documentation-and-adrs`.
4. Commit and push the results.

The three skills are not in the template. Install them in `~/.claude/skills`.

Decisions for this repo are in [`docs/adr/`](docs/adr/).

## The learning loop

The loop is modelled on [Hermes Agent](https://github.com/NousResearch/hermes-agent),
which curates its own memory, creates skills after complex tasks, and
improves those skills as it uses them. It is on by default:

1. **Nudge.** When a turn ends with changed files but `learning/` untouched,
   the Stop hook blocks once and asks for the `learn` skill.
2. **Record.** The skill writes facts to `MEMORY.md` and evidence-backed
   lessons to `LESSONS.md`.
3. **Grow skills.** When a procedure repeats, the skill writes it down as a
   new skill. When a skill proves wrong in use, the skill patches it.
4. **Promote.** Lessons in `examples/*` flow up by tag. `[general]` lessons
   go to `templates/agnostic`, and `[stack]` lessons go to
   `templates/opinionated`. The next project you clone starts smarter.

## Development

```sh
bash tests/run.sh
shellcheck scripts/*.sh tests/*.sh templates/agnostic/.claude/hooks/*.sh
```
