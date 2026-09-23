# ADR-0002: Stack-agnostic base template with an opinionated overlay

## Status

Accepted

## Date

2026-09-23

## Context

Most of the template (rules, learning files, learn skill, Stop hook) does
not depend on a stack. Rewind needs a fixed stack. A single template would
either force that stack on every project or leave Rewind to fill in the
stack by hand each time.

## Decision

Split the template in two:

- `templates/agnostic/` is the complete base. `docs/STACK.md` is TBD.
- `templates/opinionated/` is an overlay. It holds only the files that
  differ from the base. A file named `<file>.append` is appended to the
  base file instead of replacing it.

`scripts/new-project.sh -t <template>` copies the base, then the overlay,
then applies the `*.append` files. Any new directory under `templates/`
works as an overlay with no script change.

## Alternatives Considered

### Two full copies

- Pros: each template is readable on its own.
- Cons: every base change must be made twice, and the copies drift.
- Rejected: duplicates the same knowledge.

### One template with stack sections commented out

- Pros: one directory.
- Cons: every project carries dead text. Agents read it as instructions.
- Rejected: irrelevant context lowers agent accuracy.

## Consequences

- Never copy a base file into the overlay unless the content differs.
- Lessons are routed by tag: `[general]` to the base, `[stack]` to the
  overlay.
- `tests/run.sh` covers the overlay, the append step, and the symlink.
