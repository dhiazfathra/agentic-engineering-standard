# ADR-0001: One monorepo for templates and the projects cloned from them

## Status

Accepted

## Date

2026-09-23

## Context

The repo started as a place for agentic engineering practices, with one
artifact for a project called Rewind (a stack comparison diagram). Two
things were mixed together: a reusable standard, and a real project that
uses it. A standard nobody builds with does not get tested. A project with
no standard to feed back into keeps its lessons to itself.

## Decision

Keep both in one monorepo:

- `templates/` holds the reusable boilerplate.
- `examples/<name>/` holds real projects cloned from a template with
  `scripts/new-project.sh`. `examples/rewind` is the first one.

Lessons learned in an example flow back up to the templates through the
learn skill (see [ADR-0004](0004-self-learning-loop.md)).

## Alternatives Considered

### Separate repos for the template and each project

- Pros: clean history per project, independent access control.
- Cons: promoting a lesson means a cross-repo change. Easy to skip.
- Rejected: the feedback loop is the point, and it must be cheap.

### Template only, no example

- Pros: smaller repo.
- Cons: no real use, so no evidence that the rules work.
- Rejected: an untested standard drifts from what works.

## Consequences

- A template change does not reach existing examples. Port it by hand when
  it matters (rule in `AGENTS.md`).
- Each example must be opened as its own agent workspace so its hook and
  skills load.
- The repo can grow many examples. Consider pnpm workspaces once the first
  `package.json` exists.
