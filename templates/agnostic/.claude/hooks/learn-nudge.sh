#!/usr/bin/env bash
# Learn nudge. `learn-nudge.sh start` runs on SessionStart and snapshots the
# tree. With no argument it runs on Stop: it blocks the first stop of a turn
# when this session changed files but not learning/, and asks the agent to
# run the learn skill. Files that were already dirty at session start and
# stay unchanged do not count.
set -euo pipefail

input=$(cat)
# The second stop of a turn arrives with stop_hook_active=true. Let it
# through, or the hook would loop.
if grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true' <<<"$input"; then
	exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"
git_dir=$(git rev-parse --absolute-git-dir 2>/dev/null) || exit 0
session=$(sed -nE 's/.*"session_id"[[:space:]]*:[[:space:]]*"([A-Za-z0-9_-]+)".*/\1/p' <<<"$input")
base=$git_dir/learn-nudge/${session:-default}

# One "path hash" line per dirty file under this directory.
dirty() {
	git ls-files -m -o --exclude-standard -- . | sort -u | while IFS= read -r f; do
		echo "$f $(git hash-object -- "$f" 2>/dev/null || echo deleted)"
	done
}

if [ "${1:-}" = start ]; then
	mkdir -p "${base%/*}"
	{
		git rev-parse -q --verify HEAD || echo none
		dirty
	} >"$base"
	exit 0
fi

base_head=none
base_dirty=
if [ -f "$base" ]; then
	base_head=$(head -n 1 "$base")
	base_dirty=$(tail -n +2 "$base")
fi

changed=$(
	comm -13 <(echo "$base_dirty" | sort) <(dirty | sort) | sed 's/ [^ ]*$//'
	if [ "$base_head" != none ]; then
		git diff --name-only --relative "$base_head" HEAD -- . 2>/dev/null || true
	fi
)
[ -z "$changed" ] && exit 0
grep -q '^learning/' <<<"$changed" && exit 0

cat <<'JSON'
{"decision":"block","reason":"Files changed but learning/ is untouched. Run the learn skill (.claude/skills/learn/SKILL.md). If there is nothing to learn, say so in one line."}
JSON
