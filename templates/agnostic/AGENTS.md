# {{PROJECT_NAME}}

`CLAUDE.md` is a symlink to this file. Edit this file only.

## Stack and commands

`docs/STACK.md` lists the stack and the exact test, lint, build, and dev
commands. A command it does not list does not exist yet. Do not guess one.

## Boundaries

- Never commit secrets or `.env*` files.
- Never add a dependency when a few lines or an existing one covers it.
- Ask before changing a DB schema, public API, or CI.
- Run the tests and the linter before calling work done.

## Models

Opus plans. Cheaper models do the work. On Opus, write the plan or spec,
then delegate: the `worker` subagent (Sonnet, low effort) implements
tasks, and the `chore` subagent (Haiku, low effort) commits, pushes,
renames, and moves. `.claude/hooks/opus-delegates.sh` blocks Opus from
code edits, those chores, and other subagents. Markdown stays open.

## Finishing work

Every piece of work follows these steps, in this order:

1. Commit each logical change on its own as soon as its tests pass, and
   push it. Do not batch unrelated changes or hold commits until the end.
2. Run `/security-review` on the changed code. Fix each finding, or
   record why it does not apply.
3. Run `/performance` on the changed code. Fix each finding with a
   measurement, or record why it does not apply.
4. Run `/documentation-and-adrs`. Update the README and every doc the
   work made stale. Record each decision that is expensive to reverse as
   an ADR in `docs/adr/NNNN-title.md`. Never rewrite an accepted ADR.
   Supersede it with a new one.
5. Commit and push the fixes and docs from steps 2 to 4 as atomic commits.

If one of these skills is not installed, say so. Do not skip the step
silently.

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
