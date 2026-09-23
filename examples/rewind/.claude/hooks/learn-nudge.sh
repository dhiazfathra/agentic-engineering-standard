#!/usr/bin/env bash
# Stop hook: blocks the first stop of a turn when the work changed files
# but learning/ was not touched, and asks the agent to run the learn skill.
set -euo pipefail

input=$(cat)
# The second stop of a turn arrives with stop_hook_active=true. Let it
# through, or the hook would loop.
if grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true' <<<"$input"; then
	exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"
changes=$(git status --porcelain -- . 2>/dev/null || true)
[ -z "$changes" ] && exit 0
grep -q 'learning/' <<<"$changes" && exit 0

cat <<'JSON'
{"decision":"block","reason":"Files changed but learning/ is untouched. Run the learn skill (.claude/skills/learn/SKILL.md). If there is nothing to learn, say so in one line."}
JSON
