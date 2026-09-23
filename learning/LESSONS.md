# Lessons

One line per lesson: what went wrong, the evidence, and what to do instead.
The scope is `project` (only this repo), `stack` (belongs in the opinionated
template), or `general` (belongs in the agnostic template).

<!-- - 2026-01-01 [general] Lesson. Evidence: what cost time. Do instead: X. -->

- 2026-09-23 [project] Two sessions edited this working tree at once. Evidence: `README.md`, `tests/run.sh`, and the hook gained uncommitted edits from another session while this one worked on the same files. Do instead: run `git status` at session start. If there are foreign changes, use a git worktree, or stage only your own hunks.
- 2026-09-23 [general] Claude Code loads `.claude/agents/` at session start only. Evidence: the session that added `worker` and `chore` got "Agent type 'worker' not found" while its own opus-delegates hook blocked every other route. Do instead: land a new agent together with the gate that needs it, then restart the session before relying on either.
- 2026-09-23 [general] A gate that sends one-line commands to a subagent costs more than it saves. Evidence: "commit push" on Opus took 4 min and 2 subagent starts; the same command by hand took under 1 s (docs/reports/2026-09-23-slow-commit-push.md). Do instead: delegate only work bigger than a subagent start, and do exactly what was asked before adding scope.
