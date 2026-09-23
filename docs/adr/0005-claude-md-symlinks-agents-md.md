# ADR-0005: CLAUDE.md is a symlink to AGENTS.md, and tools adapt to it

## Status

Accepted

## Date

2026-09-23

## Context

Different agents read different rule files. `AGENTS.md` is the shared
name. Claude Code reads `CLAUDE.md`. Two files with the same content drift.
A formatting gate (procoder) flagged the symlink, and the first fix
replaced the symlink with a copy. That was reverted in `f0c9d24`.

## Decision

`CLAUDE.md` is a symlink to `AGENTS.md` in the repo root, in every
template, and in every example. Edit `AGENTS.md` only.

When a tool rejects this design, fix the tool, not the project. The
procoder false positive is fixed by a local patch that treats symlinks as
out of scope for formatting.

## Alternatives Considered

### Copy AGENTS.md to CLAUDE.md

- Pros: every tool handles a regular file.
- Cons: two copies drift. The gate passes while the rules split.
- Rejected: changes the design to satisfy a tool.

### CLAUDE.md with an `@AGENTS.md` import

- Pros: no symlink.
- Cons: a second file to keep, and only Claude Code resolves the import.
- Rejected: same objection as the copy.

## Consequences

- `scripts/new-project.sh` must keep the symlink. `tests/run.sh` checks it.
- Tools that follow or reject symlinks need a patch. The procoder patch
  lives outside this repo and must be rebuilt for each plugin version.
