# Stack

- Next.js fullstack, deployed on Vercel
- Turso (libSQL) for the database
- Self-hosted MinIO for blob storage only
- Bun as the package manager and script runner

Use `bun install`, `bun add`, `bun run`, and `bunx`. Never use npm, npx,
pnpm, or yarn. The `bun-only.sh` PreToolUse hook blocks them, and
`.gitignore` drops their lockfiles. Commit `bun.lock` only.

The rationale is in `diagrams/stack-comparison.html`. This stack is the
only option compared there that moves the wall already hit out of the way
without adding a second architectural seam.

## Commands

TBD until the app is scaffolded. When it is, list the exact test, lint,
build, and dev commands here and promote them to the opinionated template.
