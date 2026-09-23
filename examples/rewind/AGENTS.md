# rewind

Rewind is a bug-reporting tool built around screen recordings. It is the
working example and case study for `../../templates/opinionated`.

`CLAUDE.md` is a symlink to this file. Edit this file only.

## Stack and commands

`docs/STACK.md` lists the stack and the exact test, lint, build, and dev
commands. A command it does not list does not exist yet. Do not guess one.

## Boundaries

- Never commit secrets or `.env*` files.
- Never add a dependency when a few lines or an existing one covers it.
- Ask before changing a DB schema, public API, or CI.
- Run the tests and the linter before calling work done.

## Learning loop

This project improves its own rules. Every session with changes ends with
the `learn` skill (`.claude/skills/learn/SKILL.md`). The Stop hook reminds
you when you forget it.

- `learning/MEMORY.md`: durable project facts and decisions. Read it at session start.
- `learning/LESSONS.md`: what went wrong and what to do instead, with evidence.
- `.claude/skills/`: procedures learned from repeated work. Prefer an
  existing skill over working the procedure out again.

Rules in this file beat memory. Memory beats guesses. If memory
contradicts the code, trust the code and fix the memory.
