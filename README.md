# agentic-engineering-standard

This repo is a template for agentic engineering projects that learns from
its own use. It also holds real projects cloned from the template.

## Layout

```
template/               stack-agnostic boilerplate
  AGENTS.md             project rules (CLAUDE.md is a symlink to it)
  learning/MEMORY.md    durable project facts and decisions
  learning/LESSONS.md   mistakes, with evidence and a fix
  .claude/skills/learn  the learning-loop skill
  .claude/hooks/        Stop hook that asks the agent to run the learn skill
examples/rewind/     working example and case study (Next.js, Turso, MinIO)
scripts/new-project.sh  clones the template
tests/run.sh            tests for the script and the hook
```

## Start a project

```sh
scripts/new-project.sh my-app              # creates examples/my-app
scripts/new-project.sh my-app ../my-app    # creates a standalone copy
```

Open the new project's directory in Claude Code. Fill in `Stack` and
`Commands` in its `AGENTS.md`.

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
4. **Promote.** A lesson tagged `[general]` in `examples/*` gets applied to
   `template/`, so the next project you clone starts smarter.

## Development

```sh
bash tests/run.sh
shellcheck scripts/*.sh tests/*.sh template/.claude/hooks/*.sh
```
