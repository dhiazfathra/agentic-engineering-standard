# ADR-0008: The monorepo root runs its own learning loop

## Status

Accepted. Extends ADR-0004.

## Date

2026-09-23

## Context

ADR-0004 gave the loop to templates and examples only. Sessions at the
repo root change the templates, the clone script, and the ADRs, but kept
nothing they learned. The root had an untracked copy of the hook with no
`learning/` to write to, so the hook asked for a skill that had nowhere to
record.

## Decision

The root gets its own `learning/MEMORY.md` and `learning/LESSONS.md`. Its
`.claude/hooks/learn-nudge.sh`, `.claude/settings.json`, and
`.claude/skills/learn` are symlinks to the same paths in
`templates/agnostic/`.

The learn skill finds the templates directory at `../../templates` inside
an example, or at `templates` at the root. Root `[project]` lessons stay in
the root. `[general]` lessons promote to `templates/agnostic`, and
`[stack]` lessons to `templates/opinionated`.

## Alternatives Considered

### Copy the hook, settings, and skill to the root

- Pros: the root works even if the template moves.
- Cons: the copies drift. The root copy was already stale once.
- Rejected: a symlink keeps one authoritative copy (see ADR-0005).

### Treat the root as an example under `examples/`

- Pros: no special case in the skill.
- Cons: the root is not a project cloned from a template.
- Rejected: it would misplace the monorepo's own facts.

## Consequences

- A change to the agnostic hook, settings, or skill changes the root too.
  `tests/run.sh` checks the symlinks.
- The skill has one monorepo-aware line for the root. Standalone clones
  have neither templates path, so they do not promote.
