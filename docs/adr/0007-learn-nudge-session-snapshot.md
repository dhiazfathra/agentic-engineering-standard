# ADR-0007: Learn nudge counts only changes made in the session

## Status

Accepted. Supersedes the nudge trigger in ADR-0004.

## Date

2026-09-23

## Context

ADR-0004's Stop hook blocked whenever `git status` showed a change outside
`learning/`. In the first live session it fired on every turn, although the
agent had changed nothing: an untracked `.claude/` folder at the repo root
was already there when the session started. ADR-0004 listed this as a
known consequence.

## Decision

`learn-nudge.sh start` runs on SessionStart. It writes `HEAD` and a
`path hash` line for every dirty file to
`<git-dir>/learn-nudge/<session_id>`. On Stop, the hook counts only:

- dirty files that are new, or whose content changed, since the snapshot
- files changed by commits made since the snapshot

It blocks when that set is not empty and has nothing under `learning/`.
With no snapshot, every dirty file counts, as before.

## Alternatives Considered

### Ignore the offending paths in `.gitignore`

- Pros: no hook change.
- Cons: fixes one path. The next stray file trips the hook again.
- Rejected: the hook, not the project, was wrong.

### Parse the transcript for edit tool calls

- Pros: exact.
- Cons: couples the hook to the transcript format. Misses edits made by
  shell commands.
- Rejected: git already knows what changed.

## Consequences

- The snapshot lives in the git directory, so it is never committed and
  needs no ignore rule. Each session has its own file.
- A file that was dirty at start and is edited again in the session does
  count, because its hash changes.
- The hook now runs `git hash-object` on each dirty file at every stop.
  The cost grows with the number of dirty files, not the repo size.
