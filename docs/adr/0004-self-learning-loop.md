# ADR-0004: Self-learning loop with a Stop hook and a learn skill

## Status

Accepted

## Date

2026-09-23

## Context

Agents repeat mistakes across sessions because nothing they learn is kept.
Hermes Agent shows a working pattern: it curates its own memory, writes
skills after complex tasks, and patches them when they prove wrong.

## Decision

Every template ships a learning loop:

- `learning/MEMORY.md` holds dated project facts. `learning/LESSONS.md`
  holds mistakes with evidence and a fix.
- `.claude/skills/learn` records memory and lessons, and creates or patches
  skills.
- `.claude/hooks/learn-nudge.sh` is a Stop hook. When a turn ends with
  changed files but `learning/` untouched, it blocks once and asks for the
  learn skill.
- Lessons in examples are promoted by tag: `[general]` to
  `templates/agnostic`, `[stack]` to `templates/opinionated`.

## Alternatives Considered

### Rely on the agent to remember

- Pros: no hook, no files.
- Cons: it does not happen in practice.
- Rejected: the nudge is what makes the loop run.

### Hook that blocks on every turn

- Pros: nothing slips.
- Cons: noise on turns that changed nothing. Agents learn to ignore it.
- Rejected: block once, and only when files changed.

## Consequences

- `tests/run.sh` tests the hook. It must change in the same commit as the
  hook.
- The hook has only a scripted test so far. It still needs a check in a
  live Claude Code session.
- Any untracked file outside `learning/` can trip the hook, including
  local agent state that is not ignored yet.
