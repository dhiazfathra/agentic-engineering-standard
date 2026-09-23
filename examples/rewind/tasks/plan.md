# Implementation Plan: infra

Module `infra` from `../CAPABILITY-MAP.md`. The spec is `../SPEC-infra.md`.
Tasks are in `todo.md`.

## Overview

Scaffold the Bun workspace so that every later module has a working
base. The workspace holds `apps/web` (Next.js 16.3.6), `apps/extension`
(WXT) and `packages/schema`. It also gets MinIO in Docker, Turso through
Drizzle, env parsed with zod, the design's tokens and fonts, and a health
check that proves the database and storage connections, locally and on
Vercel.

## Architecture decisions

- **Scaffold with the generators, then trim.** Use
  `bunx create-next-app@16.3.6` and `bunx wxt@0.21.4 init`, then delete
  what the spec doesn't use. Their outputs match what each tool expects,
  which beats writing configs by hand.
- **One health route proves the whole stack.** `/api/health` exercises
  env, the database and storage. Its end-to-end test is the integration
  check for the module.
- **Tokens are copied, not linked.** `tokens.css` is a copy of the
  design's `_ds_bundle.css` variables plus the `--rw-*` block from
  `Rewind.dc.html`, with a header naming the source. The design project is
  outside the repo, and a build must not depend on it.
- **Bun runs scripts, Node runs Next.js.** `bun run dev` calls `next dev`,
  which runs on Node 24. Vercel does the same.
- **The Firefox check is a build, not a runtime test.** A Firefox runtime
  test would mean `web-ext` and Playwright's Firefox, and
  Playwright can't load Firefox extensions. `extension` revisits this.

## Dependency graph

```
T1 workspace root, .nvmrc, bun.lock
 ├── T2 apps/web scaffold ── T4 env.ts ── T5 db + migrations ─┐
 │                              └──────── T6 storage + MinIO ─┴── T7 /api/health ── T8 e2e
 │         └── T9 tokens + fonts
 ├── T3 apps/extension scaffold ── T10 extension e2e
 └── packages/schema (empty, part of T1)
T7 + T9 ── T11 Vercel project + deploy
T8 + T10 + T11 ── T12 STACK.md + template promotion
T12 ── T13 TypeScript 7 attempt
```

## Task list

### Phase 1: Workspace

- [ ] T1: Workspace root
- [ ] T2: Scaffold `apps/web`
- [ ] T3: Scaffold `apps/extension`

### Checkpoint A

- [ ] `bun install`, `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] Commit and push

### Phase 2: Backing services

- [ ] T4: `env.ts` with zod
- [ ] T5: Turso client and Drizzle migrations
- [ ] T6: MinIO in Docker and the S3 client
- [ ] T7: `/api/health`

### Checkpoint B

- [ ] `bun run test` at 100% coverage
- [ ] `curl localhost:3000/api/health` returns 200, and 503 with MinIO stopped
- [ ] Commit and push

### Phase 3: Design and e2e

- [ ] T8: Health e2e against real services
- [ ] T9: Design tokens and fonts
- [ ] T10: Extension e2e (Chrome) and Firefox build check

### Checkpoint C

- [ ] `bun run e2e` exits 0
- [ ] Commit and push

### Phase 4: Deploy and docs

- [ ] T11: Vercel project `rewind` and first deploy
- [ ] T12: `docs/STACK.md` and promotion to the opinionated template
- [ ] T13: Try TypeScript 7.0.2

### Checkpoint: Complete

- [ ] All nine success criteria in `SPEC-infra.md` hold, each with evidence
- [ ] Finishing steps from `AGENTS.md`: `/security-review`, `/performance`, `/documentation-and-adrs`
- [ ] The learn skill updates `learning/`
- [ ] Human review before `rewinds-api` starts

## Risks and mitigations

| Risk                                                                              | Impact | Mitigation                                                                                                                                                      |
| --------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-next-app@16.3.6` doesn't produce a Bun workspace layout, or tries npm     | Med    | Run it with `--use-bun --skip-install` inside `apps/`, then install once from the root. The `bun-only.sh` hook catches any npm call.                            |
| Vitest 5 plus `next` 16.3.6 need extra config for the `@/` alias or `server-only` | Med    | Alias `server-only` to an empty module in `vitest.config.ts`. Mirror `tsconfig` paths with `vite-tsconfig-paths` only if an alias alone fails. Ask first.       |
| 100% coverage on generated scaffold code (`layout.tsx`, `page.tsx`)               | Low    | Cover them with one render test each. Exclude only config and generated output, and list every exclusion in the config.                                         |
| Vercel's build can't find `bun.lock` with root directory `apps/web`               | Med    | Keep the lockfile at `examples/rewind/`. If detection fails, set the install command to `cd ../.. && bun install` in `vercel.json`.                             |
| Vercel's GitHub integration watches the whole monorepo, so every push deploys     | Low    | Set an ignored build step: `git diff --quiet HEAD^ HEAD -- .`, run from the root directory.                                                                     |
| MinIO CORS on a single-node container                                             | Med    | Set `MINIO_API_CORS_ALLOW_ORIGIN` in `docker-compose.yml`. Prove it with a browser `PUT` in `rewinds-api`. For `infra`, `HeadBucket` from the server is enough. |
| The Turso token leaks into the transcript                                         | High   | Pipe it: `turso db tokens create rewind \| vercel env add DATABASE_AUTH_TOKEN production`. Never echo it.                                                       |
| TypeScript 7 breaks `next build` or `wxt build`                                   | Low    | T13 is last and separate. If it fails, record the error in `learning/LESSONS.md` and stay on the pinned version.                                                |

## Open questions

None. Each "ask first" in the risks table is asked only if that risk
actually happens.
