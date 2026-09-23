# Lessons

One line per lesson: what went wrong, the evidence, and what to do instead.
The scope is `project` (only this repo), `stack` (belongs in the opinionated
template), or `general` (belongs in the agnostic template).

<!-- - 2026-01-01 [general] Lesson. Evidence: what cost time. Do instead: X. -->

- 2026-09-23 [project] Two sessions edited this working tree at once. Evidence: `README.md`, `tests/run.sh`, and the hook gained uncommitted edits from another session while this one worked on the same files. Do instead: run `git status` at session start. If there are foreign changes, use a git worktree, or stage only your own hunks.
