#!/usr/bin/env bash
# Tests for scripts/new-project.sh and the learn-nudge Stop hook.
set -uo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
hook=$repo/templates/agnostic/.claude/hooks/learn-nudge.sh
fails=0
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

check() { # name, then a command that must succeed
	local name=$1
	shift
	if "$@"; then echo "ok   $name"; else
		echo "FAIL $name"
		fails=$((fails + 1))
	fi
}

# --- new-project.sh (run against a copy so examples/ stays untouched) ---
cp -R "$repo/scripts" "$repo/templates" "$tmp/"
np=$tmp/scripts/new-project.sh

check "rejects invalid name" bash -c "! '$np' Bad_Name 2>/dev/null"
check "rejects missing name" bash -c "! '$np' 2>/dev/null"
check "creates examples/<name> by default" bash -c "'$np' demo >/dev/null && [ -f '$tmp/examples/demo/AGENTS.md' ]"
check "substitutes project name" grep -q '^# demo$' "$tmp/examples/demo/AGENTS.md"
check "leaves no .bak behind" test ! -e "$tmp/examples/demo/AGENTS.md.bak"
check "keeps CLAUDE.md symlink" bash -c "[ -L '$tmp/examples/demo/CLAUDE.md' ] && [ \"\$(readlink '$tmp/examples/demo/CLAUDE.md')\" = AGENTS.md ]"
check "copies hidden .claude dir" test -x "$tmp/examples/demo/.claude/hooks/learn-nudge.sh"
check "refuses existing dest" bash -c "! '$np' demo 2>/dev/null"
check "honours custom dest" bash -c "'$np' solo '$tmp/out/solo' >/dev/null && [ -f '$tmp/out/solo/AGENTS.md' ]"
check "records agnostic origin in memory" grep -q 'from the .agnostic. template' "$tmp/examples/demo/learning/MEMORY.md"
check "agnostic keeps TBD stack" grep -q '^TBD' "$tmp/examples/demo/docs/STACK.md"
check "rejects unknown template" bash -c "! '$np' -t nope x 2>/dev/null"
check "rejects -t without value" bash -c "! '$np' -t 2>/dev/null"
op=$tmp/examples/op
check "creates from opinionated" bash -c "'$np' -t opinionated op >/dev/null"
check "overlay replaces STACK.md" grep -q 'Next.js' "$op/docs/STACK.md"
check "overlay adds diagram" test -f "$op/docs/diagrams/stack-comparison.html"
check "keeps agnostic base files" test -x "$op/.claude/hooks/learn-nudge.sh"
check "appends .append files" bash -c "grep -q '^.serena/' '$op/.gitignore' && grep -q '^/.next/' '$op/.gitignore'"
check "removes .append files" test -z "$(find "$op" -name '*.append')"
check "records opinionated origin" grep -q 'from the .opinionated. template' "$op/learning/MEMORY.md"

# --- learn-nudge.sh ---
proj=$tmp/proj
mkdir -p "$proj" && git -C "$proj" init -q
run_hook() { echo "$1" | CLAUDE_PROJECT_DIR=$proj "$hook"; }

check "silent on clean tree" test -z "$(run_hook '{}')"
touch "$proj/app.ts"
check "blocks when learning/ untouched" bash -c "[[ \$(echo '{}' | CLAUDE_PROJECT_DIR='$proj' '$hook') == *'\"decision\":\"block\"'* ]]"
check "lets second stop through" test -z "$(run_hook '{"stop_hook_active": true}')"
mkdir -p "$proj/learning" && touch "$proj/learning/LESSONS.md"
check "silent once learning/ changed" test -z "$(run_hook '{}')"
check "silent outside git" test -z "$(echo '{}' | CLAUDE_PROJECT_DIR=$tmp/out "$hook")"
check "hook output is valid JSON" bash -c "rm -rf '$proj/learning'; echo '{}' | CLAUDE_PROJECT_DIR='$proj' '$hook' | jq -e .decision >/dev/null"

# Session snapshot: files dirty at SessionStart do not count.
sid='{"session_id": "s1"}'
start_hook() { echo "$sid" | CLAUDE_PROJECT_DIR=$proj "$hook" start; }
check "start is silent" test -z "$(start_hook)"
check "silent on files dirty before session" test -z "$(run_hook "$sid")"
check "other session still sees them" test -n "$(run_hook '{"session_id": "s2"}')"
echo edit >>"$proj/app.ts"
check "blocks when pre-dirty file changes" test -n "$(run_hook "$sid")"
start_hook
touch "$proj/new.ts"
check "blocks on new file" test -n "$(run_hook "$sid")"
git -C "$proj" add -A && git -C "$proj" -c user.name=t -c user.email=t@t commit -qm c1
start_hook
touch "$proj/later.ts"
git -C "$proj" add -A && git -C "$proj" -c user.name=t -c user.email=t@t commit -qm c2
check "blocks on work committed in session" test -n "$(run_hook "$sid")"
mkdir -p "$proj/learning" && touch "$proj/learning/MEMORY.md"
check "silent once session touched learning/" test -z "$(run_hook "$sid")"

echo "$fails failure(s)"
exit "$fails"
