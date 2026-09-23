# ADR-0010: Opus plans, cheaper models do the work

## Status

Accepted.

## Date

2026-09-23

## Context

Opus costs more and runs slower than Sonnet and Haiku. A session on Opus
tends to do all of its work on Opus, including edits a plan or spec has
already decided and chores like commits and file moves. Low effort on a
cheaper model is enough for that work.

## Decision

The agnostic template ships a PreToolUse hook,
`.claude/hooks/opus-delegates.sh`, and two subagents:

- `worker`: Sonnet, effort `low`. Implements one task from a plan or spec.
- `chore`: Haiku, effort `low`. Commits, pushes, renames, and moves.

When the main conversation runs on Opus, the hook exits 2, which blocks:

- `Edit`, `Write`, and `NotebookEdit` on any file that is not Markdown.
  Opus can still write plans, specs, ADRs, and learning files.
- `Bash` commands that start `git commit`, `git push`, `git mv`, or `mv`.
- `Agent` calls to any subagent except `worker`, `chore`, and `Explore`.

Subagent tool calls carry `agent_id` and pass through. The hook does
nothing on other models. To work on Opus directly, switch with `/model`.

## Alternatives Considered

### A rule in `AGENTS.md` only

- Pros: no hook.
- Cons: an Opus session that misses or ignores the rule works on Opus
  anyway.
- Rejected, as in ADR-0009: the rule is cheap to enforce.

### Allow any subagent with a `model` of `sonnet` or `haiku`

- Pros: works before the custom agents load.
- Cons: the Agent tool has no effort parameter. Effort is set only in
  agent frontmatter, so low effort needs the named agents.
- Rejected.

## Consequences

- PreToolUse input has no model field. The hook reads the last `"model"`
  in the transcript. A run with no readable transcript is allowed.
- Right after `/model`, the first tool call can still see the old model
  until the transcript records a reply from the new one.
- Bash can still write files, for example with `sed -i` or a redirect.
  The hook covers the edit tools only.
- Claude Code loads subagents at session start. A session that adds
  `.claude/agents/` must restart before it can delegate to them.
- The opinionated overlay's `settings.json` copies the base PreToolUse
  entry. `tests/run.sh` fails when it drifts.
