# Memory

Durable facts about this project that the code does not show: decisions,
constraints, gotchas, and external pointers. One line per fact, dated.
Update a line when it changes and delete it when it is wrong.

<!-- - 2026-01-01 Fact. Why it matters. -->

- 2026-09-23 Opinionated projects use bun only (ADR-0009). The overlay ships its own `.claude/settings.json`, so a change to the base settings must be copied into it; `tests/run.sh` catches drift.
