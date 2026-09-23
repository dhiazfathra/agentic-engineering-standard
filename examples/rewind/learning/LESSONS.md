# Lessons

One line per lesson: what went wrong, the evidence, and what to do instead.
The scope is `project` (only this repo), `stack` (belongs in the opinionated
template), or `general` (belongs in the agnostic template).

<!-- - 2026-01-01 [general] Lesson. Evidence: what cost time. Do instead: X. -->

- 2026-09-23 [general] An agent's non-interactive shell does not run `nvm use`, so it gets the default Node. Evidence: Vitest died with `The requested module 'node:util' does not provide an export named 'styleText'` on Node 18.12.0 while `.nvmrc` said 24. Do instead: prefix every command that runs Node with `. ~/.nvm/nvm.sh && nvm use >/dev/null`.
- 2026-09-23 [stack] An anchored `/node_modules` or `/coverage` in `.gitignore` misses workspace members. Evidence: after `bun install`, `git status` listed `apps/extension/node_modules/.bin/wxt` and `apps/extension/coverage/`. Do instead: write `node_modules/` and `coverage/` without the leading slash. (promoted)
- 2026-09-23 [stack] `.env*` in `.gitignore` also hides `.env.example`. Evidence: `git status` did not list a new `.env.example`. Do instead: add `!.env.example` after `.env*`. (promoted)
- 2026-09-23 [stack] `bun run --filter <pkg>` loads `.env` files from the directory you ran it in, not the package's. Evidence: `bun run db:migrate` from the root failed with `Invalid environment: DATABASE_URL, ...` although `apps/web/.env.local` existed. Do instead: in tool configs outside Next, call `loadEnvConfig(process.cwd())` from `@next/env`.
- 2026-09-23 [stack] libSQL rejects an empty migration, and `drizzle-kit migrate` then exits 1 without printing anything. Evidence: calling the migrator directly showed `SQLITE_UNKNOWN_0: not an error`. Do instead: give a baseline migration a no-op statement such as `SELECT 1;`.
- 2026-09-23 [stack] Docker Hub no longer serves `minio/minio` or `minio/mc`. Evidence: `pull access denied for minio/minio, repository does not exist`. Do instead: pin `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` (multi-arch). It ships `mc` and `curl`, so one image runs the server, the health check and the bucket job.
- 2026-09-23 [stack] WXT reads every file in `entrypoints/` as an entrypoint, including tests. Evidence: `ERROR Multiple entrypoints with the same name detected` after adding `entrypoints/background.test.ts`. Do instead: put extension tests in `tests/`.
- 2026-09-23 [stack] `eslint-config-next@16.3.6` pulls plugins that only accept ESLint 9. Evidence: `bun install` warned `incorrect peer dependency "eslint@10.11.0"`, and `eslint-plugin-react@7.37.5` accepts only up to ^9. Do instead: pin ESLint 9.39.5 until those plugins support 10.
- 2026-09-23 [general] The procoder gate asks for `package-lock.json` beside every workspace member when the only lockfile is `bun.lock`. Evidence: `BLOCKING apps/web/package.json npm dependencies NOT checked — ... generate package-lock.json`, gate exit 1. Do instead: fix the tool, not the repo. The local `bun-lockfile.patch` teaches procoder about `bun.lock`, and osv-scanner must be v2 (1.8.2 says `could not determine extractor` for `bun.lock`).
