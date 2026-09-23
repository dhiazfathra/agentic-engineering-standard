# Lessons

One line per lesson: what went wrong, the evidence, and what to do instead.
The scope is `project` (only this repo), `stack` (belongs in the opinionated
template), or `general` (belongs in the agnostic template).

<!-- - 2026-01-01 [general] Lesson. Evidence: what cost time. Do instead: X. -->

- 2026-09-23 [general] Claude Code loads `.claude/agents/` at session start only. Evidence: the session that added `worker` and `chore` got "Agent type 'worker' not found" while its own opus-delegates hook blocked every other route. Do instead: land a new agent together with the gate that needs it, then restart the session before relying on either.
- 2026-09-23 [general] `zsh -lic '...'` (used to load nvm/vercel/turso completions) prints gitstatus init errors and iTerm escape codes to the captured output, so piping its result into another command (`| tail -1` for a token) silently grabs garbage. Evidence: a Turso token file full of `]1337;RemoteHost=...` escape codes; `drizzle-kit migrate` then failed with no error message. Do instead: extract the real value with a pattern match, e.g. `grep -oE 'eyJ[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+'` for a JWT, not `tail -1`.
- 2026-09-23 [general] `vercel deploy --cwd <app-dir>` uploads only that directory as the deployment source, so a project's `rootDirectory` set to a path relative to the git repo can't be found: "The specified Root Directory ... does not exist." Do instead: copy `.vercel/project.json` to the monorepo root and run `vercel deploy --cwd <repo-root>` so the full tree uploads and `rootDirectory` resolves inside it.
- 2026-09-23 [general] Vercel's per-deployment URL (`*-<hash>-<team>.vercel.app`) has Deployment Protection (SSO) on by default and redirects curl to a login page; the project's stable alias does not. Do instead: verify against the stable alias, not the deployment URL, when checking a production endpoint without a browser session.
