# ADR-0006: Mandatory finishing workflow for every piece of work

## Status

Accepted

## Date

2026-09-23

## Context

Work was being called done with docs out of date, no ADR for decisions
that are expensive to reverse, and no security or performance pass. Commits
were batched and left unpushed. In this repo, `f0c9d24` sat unpushed while
the next work started, and six decisions had no ADR.

## Decision

Every project, and this repo, ends each piece of work with the steps in the
"Finishing work" section of `templates/agnostic/AGENTS.md`:

1. Commit and push each logical change on its own, as soon as it passes.
2. Run `/security-review` and fix or explain each finding.
3. Run `/performance` and fix each finding with a measurement, or explain it.
4. Run `/documentation-and-adrs` to update the README, docs, and ADRs.
5. Commit and push the results as atomic commits.

ADRs live in `docs/adr/NNNN-title.md`. An accepted ADR is never rewritten.
A new ADR supersedes it.

## Alternatives Considered

### Leave it to judgment

- Pros: no ceremony on small changes.
- Cons: the steps are skipped exactly when they matter.
- Rejected: the gaps above happened under this approach.

### Enforce with a hook

- Pros: cannot be forgotten.
- Cons: a hook cannot tell whether a review was done well. More hook code
  to test.
- Rejected for now. Revisit if the rule is skipped in practice.

## Consequences

- The three skills are not in the template. They must be installed in
  `~/.claude/skills`. An agent that cannot find one must say so.
- Existing examples need the section ported by hand. `examples/rewind` has
  it.
- Hardening runs before the docs step, so the docs describe the hardened
  code.
