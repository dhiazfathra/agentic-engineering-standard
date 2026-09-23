# ADR-0009: Opinionated projects use bun only

## Status

Accepted. Adds the package manager to the stack in ADR-0003.

## Date

2026-09-23

## Context

ADR-0003 fixed the stack but not the package manager. Without a rule, an
agent picks one per session. Mixed managers leave several lockfiles and
resolve different dependency trees on a dev machine and on Vercel.

## Decision

Opinionated projects use bun as the package manager and script runner.
The overlay enforces it three ways:

- `docs/STACK.md` states the rule.
- `.claude/hooks/bun-only.sh` runs on PreToolUse for Bash. It exits 2,
  which blocks the call, when a command starts `npm`, `npx`, `pnpm`,
  `pnpx`, or `yarn`.
- `.gitignore.append` ignores `package-lock.json`, `yarn.lock`, and
  `pnpm-lock.yaml`, so only `bun.lock` can be committed.

## Alternatives Considered

### Rule in `docs/STACK.md` only

- Pros: no hook.
- Cons: an agent that misses the rule runs npm anyway.
- Rejected: the rule is cheap to enforce, so enforce it.

### `only-allow bun` preinstall script

- Pros: also blocks humans.
- Cons: needs a `package.json`, which the template does not have. Adds a
  dependency.
- Rejected for now. Add it when the app is scaffolded if humans need the
  guard too.

## Consequences

- The overlay now ships its own `.claude/settings.json`, a copy of the
  base hooks plus PreToolUse. A change to the base settings must be ported
  to it. `tests/run.sh` fails when the base hooks drift.
- The hook matches commands only at command position, after `;`, `&`,
  `|`, `(`, or `$(`. `xargs npm` and `bash -c 'npm i'` get through.
- The hook needs `jq`.
