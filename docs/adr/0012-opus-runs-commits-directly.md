# ADR-0012: Opus runs commits, pushes, and moves directly

## Status

Accepted. Amends ADR-0010.

## Date

2026-09-23

## Context

ADR-0010 blocked `git commit`, `git push`, `git mv`, and `mv` on Opus and
sent them to the `chore` subagent. The first real use was "commit push".
It took about four minutes and three subagent starts, and it never
finished: the user ran the same command by hand and it was done in under
a second. A subagent start costs a new context, the project's rules, and
a model round trip. One shell command costs less than that on any model.
See `docs/reports/2026-09-23-slow-commit-push.md`.

## Decision

`opus-delegates.sh` no longer gates Bash. Opus runs a single commit,
push, or move itself. The gate still blocks non-Markdown edits and every
subagent except `worker`, `chore`, and `Explore`. `chore` stays for
mechanical work with many steps.

## Alternatives Considered

### Keep the Bash block and speed up `chore`

- Pros: keeps ADR-0010 as written.
- Cons: no setting removes the start-up cost of a subagent.
- Rejected.

## Consequences

- The gate saves tokens only where the delegated work is larger than the
  cost of starting a subagent: implementation, not one-line commands.
