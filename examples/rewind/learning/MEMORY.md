# Memory

Durable facts about this project that the code does not show: decisions,
constraints, gotchas, and external pointers. One line per fact, dated.
Update a line when it changes and delete it when it is wrong.

<!-- - 2026-01-01 Fact. Why it matters. -->

- 2026-09-23 Created from the `opinionated` template by `scripts/new-project.sh`.
- 2026-09-23 Lessons from this project feed back into `../../templates` through the learn skill's promote step.
- 2026-09-23 UI source of truth: Claude Design project `9bb10f93-f534-4e75-831a-253a96666114`, file `Rewind.dc.html`. Read it with DesignSync `get_file` after `/design-login`.
- 2026-09-23 Turso cloud DB `rewind` exists in `aws-ap-northeast-1` (`libsql://rewind-dhiazfathra.aws-ap-northeast-1.turso.io`). No token yet.
- 2026-09-23 Styling is CSS Modules plus the design's CSS variables, not Tailwind: the design is plain CSS over `_ds` and `--rw-*` tokens, so it ports as written. `create-next-app` defaults to Tailwind; pass `--no-tailwind`.
- 2026-09-23 v1 deploys to Vercel but keeps MinIO on this PC. Presigned URLs work from Vercel; server-to-MinIO calls do not. MinIO moves to a VPS next iteration.
- 2026-09-23 Bun 1.4.2 is the package manager and script runner, not pnpm (user decision). Node 24 stays the runtime; Vitest stays the test runner.
- 2026-09-23 Vercel: CLI logged in as `envisionlab-ai`; project `rewind` goes under team `envision-labs-projects-71c0945a`, root `examples/rewind/apps/web`.
- 2026-09-23 Deviations from SPEC-infra, each recorded in its commit: ESLint 9.39.5 not 10; fonts via `next/font/google` instead of copied `.ttf` files; `parseEnv` lives in `parse-env.ts` so `drizzle.config.ts` can reuse it.
- 2026-09-23 MinIO CORS origins come from `S3_CORS_ORIGINS` (default `http://localhost:3000`). Add the Vercel domain when it exists.
- 2026-09-23 Vercel project `rewind` created and linked (team envision-labs-projects-71c0945a, root examples/rewind/apps/web). Production alias: https://rewind-ecru.vercel.app. GitHub connected; pushes to main deploy. Ignored build step: `git diff --quiet HEAD^ HEAD -- .`.
- 2026-09-23 Turso cloud database migrated (0000_init baseline). Vercel env vars set for production/preview/development: DATABASE_URL, DATABASE_AUTH_TOKEN (production only), S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY.
