#!/usr/bin/env bash
# Opus plans, cheaper models do the work. Runs on PreToolUse. When the main
# conversation runs on Opus, it blocks code edits, commits, pushes, and
# moves, and any subagent except `worker` (Sonnet, low effort), `chore`
# (Haiku, low effort), and the read-only `Explore`. Opus may still write
# Markdown: plans, specs, ADRs, and learning files. Switch to another model
# with /model to work directly. Exit 2 blocks the call and shows stderr to
# the agent.
set -euo pipefail

input=$(cat)
# Subagents run their own model. Only the main conversation is gated.
[ -n "$(jq -r '.agent_id // empty' <<<"$input")" ] && exit 0

# PreToolUse input has no model field. The transcript records it on every
# assistant message; the last one is the current model.
transcript=$(jq -r '.transcript_path // empty' <<<"$input")
[ -r "$transcript" ] || exit 0
model=$(tail -n 200 "$transcript" | grep -o '"model":"[^"]*"' | tail -n 1 || true)
[[ $model == *opus* ]] || exit 0

block() {
	echo "Opus plans; it does not do the work. $1 Delegate with the Agent tool: subagent_type \"worker\" (Sonnet) for implementation, or \"chore\" (Haiku) for commits, renames, and moves. Pass the plan or spec in the prompt." >&2
	exit 2
}

case $(jq -r '.tool_name // empty' <<<"$input") in
Edit | Write | NotebookEdit)
	path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")
	[[ $path == *.md ]] || block "Only Markdown edits (plans, specs, docs) are allowed on Opus."
	;;
Bash)
	cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
	# Command position only, as in bun-only.sh.
	if grep -Eq '(^|[;&|(])[[:space:]]*(git[[:space:]]+(commit|push|mv)|mv)([[:space:]]|$)' <<<"$cmd"; then
		block "Commits, pushes, and moves are chores."
	fi
	;;
Agent | Task)
	case $(jq -r '.tool_input.subagent_type // empty' <<<"$input") in
	worker | chore | Explore) ;;
	*) block "Only the worker, chore, and Explore subagents run cheap." ;;
	esac
	;;
esac
exit 0
