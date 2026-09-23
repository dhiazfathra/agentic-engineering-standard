# Spec: infra

Module `infra` from `CAPABILITY-MAP.md`. Status: revised after review on
2026-09-23 (bun replaces pnpm), awaiting approval.

## Objective

Give every later module a working base to build on. After `infra`, a
developer on this PC runs three commands and has the web app, the
extension, a local database and MinIO running. The same web app deploys to
Vercel against Turso cloud, and still uploads to the MinIO on this PC.

`infra` ships no product features. Its only route is a health check.

User stories:

- As a developer, I clone the repo, run `nvm use`, `bun install` and
  `bun run dev`, and get the web app on `http://localhost:3000` and the
  extension loaded in a dev browser.
- As a developer, I open `http://localhost:3000/api/health` and see whether
  the database and MinIO answer.
- As a developer, I push to `main` and Vercel builds `apps/web`.

## Tech stack

Versions are the current npm `latest` as of 2026-09-23. Pin exact versions
in `package.json` files.

| Concern         | Choice                                                                                                         | Version                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Runtime         | Node through nvm, pinned in `.nvmrc`                                                                           | 24 (24.21.0 installed)                      |
| Package manager | Bun workspaces and script runner, pinned in `packageManager`                                                   | `bun` 1.4.2                                 |
| Web             | Next.js App Router, fullstack (route handlers and RSC)                                                         | `next` 16.3.6                               |
| UI              | React                                                                                                          | 19.3.0                                      |
| Styling         | CSS Modules plus the design's CSS variables. No Tailwind                                                       | —                                           |
| Extension       | WXT, one codebase for Chrome and Firefox, React popup                                                          | `wxt` 0.21.4                                |
| Database        | Turso (libSQL): a local file in dev, Turso cloud on Vercel                                                     | `@libsql/client` 0.18.0                     |
| ORM, migrations | Drizzle                                                                                                        | `drizzle-orm` 0.45.3, `drizzle-kit` 0.31.11 |
| Blob storage    | MinIO in Docker, S3 API                                                                                        | `@aws-sdk/client-s3` 3.1138.0               |
| Validation      | zod, for env and every request body                                                                            | `zod` 4.6.5                                 |
| Unit tests      | Vitest with v8 coverage                                                                                        | `vitest` 5.0.1                              |
| E2E tests       | Playwright                                                                                                     | `@playwright/test` 1.63.0                   |
| Lint            | ESLint (Next.js flat config)                                                                                   | `eslint` 10.11.0                            |
| Language        | TypeScript: the version `create-next-app@16.3.6` pins, then 7.0.2 once `next build` and `wxt build` pass on it | —                                           |

`@aws-sdk/s3-request-presigner` and `rrweb` are approved but arrive with
`rewinds-api` and `extension`. `infra` installs only what it uses.

## Commands

All commands run from `examples/rewind/`.

```
Setup:      nvm use && bun install && cp .env.example apps/web/.env.local
Infra up:   docker compose up -d        # MinIO on :9000, console on :9001
Infra down: docker compose down         # add -v to wipe the bucket
Migrate:    bun run db:migrate             # drizzle-kit migrate against DATABASE_URL
Dev:        bun run dev                 # next dev on :3000 and wxt dev, in parallel
Dev (FF):   bun run --filter extension dev:firefox
Test:       bun run test                # vitest run --coverage in every package
E2E:        bun run e2e                 # Playwright against next start
Lint:       bun run lint                # eslint . in every package
Typecheck:  bun run typecheck            # tsc --noEmit in every package
Build:      bun run build               # next build, wxt build, wxt build -b firefox
```

These commands go into `docs/STACK.md` when they work, then get promoted
to `../../templates/opinionated/docs/STACK.md`.

## Project structure

```
examples/rewind/
  .nvmrc                   24
  package.json             private root; workspaces apps/*, packages/*; scripts fan out with bun run --filter '*'
  bun.lock                 committed; Vercel detects it and installs with bun
  docker-compose.yml       minio + a one-shot mc job that creates the bucket
  .env.example             every variable, with local defaults, no secrets
  apps/
    web/                   Next.js 16.3.6
      src/app/             routes; api/health/route.ts is the only one in infra
      src/lib/parse-env.ts zod schema; parseEnv(source) is pure, so drizzle.config.ts reuses it
      src/lib/env.ts       env = parseEnv(process.env), imported instead of process.env
      src/lib/db.ts        libSQL client + drizzle instance
      src/lib/storage.ts   S3 client pointed at MinIO
      src/styles/          tokens.css (the design's _ds tokens + --rw-* vars), fonts.css
      public/fonts/        the design's Inter, Poppins, Instrument Serif .ttf files
      drizzle/             generated SQL migrations
      drizzle.config.ts
      e2e/                 Playwright specs
    extension/             WXT
      entrypoints/popup/   React popup; in infra, a placeholder that renders
      wxt.config.ts        manifest: name, icons, host_permissions
  packages/
    schema/                shared zod schemas; empty export in infra
  docs/
    STACK.md               real commands, once they work
    design/                Rewind.dc.html, copied from the design project for reference
```

Tests sit next to the code they test: `foo.ts` and `foo.test.ts`.

## Environment

`apps/web/src/lib/env.ts` parses `process.env` with zod at startup and
fails fast with the name of the missing variable.

| Variable              | Local value                        | Vercel value                                              |
| --------------------- | ---------------------------------- | --------------------------------------------------------- |
| `DATABASE_URL`        | `file:local.db`                    | `libsql://rewind-dhiazfathra.aws-ap-northeast-1.turso.io` |
| `DATABASE_AUTH_TOKEN` | unset                              | from `turso db tokens create rewind`, set in Vercel only  |
| `S3_ENDPOINT`         | `http://localhost:9000`            | `http://localhost:9000`                                   |
| `S3_BUCKET`           | `rewind`                           | `rewind`                                                  |
| `S3_ACCESS_KEY`       | `rewind`                           | same as local                                             |
| `S3_SECRET_KEY`       | a local-only value in `.env.local` | same as local, set in Vercel only                         |

The Turso database `rewind` was created on 2026-09-23 in
`aws-ap-northeast-1`. No token exists yet. `infra` creates one and writes
it straight into Vercel, never into a file.

### Vercel against MinIO on this PC

`S3_ENDPOINT` is `localhost` on Vercel too, on purpose:

- Signing an upload or download URL is local math. It needs the keys, not
  a connection, so it works on Vercel.
- The browser on this PC then talks to `http://localhost:9000` itself.
  Chrome and Firefox treat `localhost` as a secure origin, so an HTTPS
  page can load from it without mixed-content blocking.
- Any call where the server itself must reach MinIO fails on Vercel. The
  health check reports MinIO as `unreachable` there, which is the truth.
  Modules that need server-to-MinIO calls document their Vercel behaviour
  in their own spec.
- Only this PC can play videos from the Vercel deploy. That ceiling lifts
  when MinIO moves to a VPS in the next iteration.

MinIO sets `MINIO_API_CORS_ALLOW_ORIGIN` to the local origin, the Vercel
domain and the extension origins, so browsers can `PUT` to it.

## Code style

```ts
// apps/web/src/lib/env.ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  S3_ENDPOINT: z.url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
});

export const env = schema.parse(process.env);
```

```ts
// apps/web/src/app/api/health/route.ts
import { sql } from "drizzle-orm";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { s3 } from "@/lib/storage";

const probe = (p: Promise<unknown>) =>
  p.then(
    () => "ok" as const,
    () => "unreachable" as const,
  );

export async function GET() {
  const [database, storage] = await Promise.all([
    probe(db.run(sql`select 1`)),
    probe(s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }))),
  ]);
  const ok = database === "ok" && storage === "ok";
  return Response.json({ database, storage }, { status: ok ? 200 : 503 });
}
```

Conventions:

- Prettier defaults. File names in kebab-case; React components in
  PascalCase.
- Read env only through `env`. Never read `process.env` elsewhere.
- No barrel files, no wrapper around a library that adds nothing.
- Server-only modules import `server-only`.
- Colours, spacing and fonts come from `tokens.css` variables. No raw hex
  values in component CSS.

## Testing strategy

- Vitest in every package. `coverage.thresholds` is 100 for lines,
  branches, functions and statements, and `bun run test` fails below it.
  Config and generated files (`*.config.ts`, `drizzle/`, `.next/`,
  `.output/`) are excluded from coverage and listed in the config.
- Unit tests cover `env.ts` (valid env, each missing variable, bad URL)
  and the health route (all four ok/unreachable combinations, with the db
  and s3 clients stubbed).
- One Playwright test runs against `next start`, a real `file:` database
  and the real MinIO container. It requests `/api/health` and expects
  `200 {"database":"ok","storage":"ok"}`.
- One Playwright test builds the Chrome extension, loads it unpacked with
  `--load-extension`, and asserts that the popup renders. Firefox gets a
  build check (`wxt build -b firefox` exits 0) until `extension` adds
  Firefox runtime tests.

## Boundaries

- Always:
  - Run `bun run test`, `bun run lint` and `bun run typecheck` before each commit.
  - Pin exact dependency versions.
  - Keep `.env.example` in step with `env.ts`.
  - Follow the finishing steps in `AGENTS.md`. Update `learning/` at the
    end of the session.
- Ask first:
  - Any dependency not listed in this spec.
  - Changing the Turso database, its region, or its tokens.
  - Changing Vercel project settings beyond linking and env vars.
  - Exposing MinIO beyond `localhost`, for example a tunnel.
- Never:
  - Commit `.env*` files, Turso tokens or MinIO secrets.
  - Print a token into the transcript or a file. Pipe it straight into
    `vercel env add`.
  - Use Tailwind or a component library in place of the design's CSS.
  - Replace the `CLAUDE.md` symlinks, or restructure files, to satisfy a
    tool.

## Success criteria

1. `nvm use` selects Node 24, and `bun install` finishes without warnings
   about the engine.
2. `docker compose up -d` starts MinIO, and the `rewind` bucket exists
   afterwards (`mc ls local/rewind` exits 0).
3. `bun run db:migrate` exits 0 against `file:local.db` and against the Turso
   cloud database.
4. `bun run dev` serves `http://localhost:3000`. `GET /api/health` returns
   `200 {"database":"ok","storage":"ok"}` with MinIO up, and `503` with
   `"storage":"unreachable"` after `docker compose stop minio`.
5. The web app renders a page using the design's fonts and tokens: the
   computed `--color-primary` is `#01afaf`, and `Inter` loads from
   `/fonts/`.
6. `bun run build` produces a Chrome build and a Firefox build, and the
   Chrome build loads unpacked and shows its popup.
7. `bun run test` passes at 100% coverage. `bun run lint`, `bun run typecheck` and
   `bun run e2e` exit 0.
8. The Vercel deploy of `apps/web` builds. Its `/api/health` returns
   `"database":"ok"` and `"storage":"unreachable"`.
9. `docs/STACK.md` lists the commands above, and so does
   `../../templates/opinionated/docs/STACK.md` with project names removed.

## Decisions

Recorded 2026-09-23.

- Bun 1.4.2 replaces pnpm as package manager, workspace tool and script
  runner. Scaffold with `bunx create-next-app@16.3.6 --no-tailwind` and
  `bunx wxt@0.21.4 init`. The `bun-only.sh` PreToolUse hook blocks npm,
  npx, pnpm and yarn. Next.js still runs on Node 24, locally and on Vercel. Vitest
  stays the test runner, because its coverage thresholds gate the 100%
  rule.
- TypeScript starts at the version `create-next-app@16.3.6` pins. Move to
  7.0.2 in its own commit once `next build` and `wxt build` pass on it.
- Vercel: the CLI is installed and logged in as `envisionlab-ai`. The
  project is `rewind` under the team `envision-labs-projects-71c0945a`,
  with root directory `examples/rewind/apps/web`, linked to this GitHub
  repo so pushes to `main` deploy.

## Open questions

None.
