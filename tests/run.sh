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
check "ignores node_modules in workspace members" bash -c "cd '$op' && git init -q && mkdir -p apps/web/node_modules && touch apps/web/node_modules/x && git check-ignore -q apps/web/node_modules/x"
check "keeps .env.example visible" bash -c "cd '$op' && touch .env.example .env.local && ! git check-ignore -q .env.example && git check-ignore -q .env.local"
check "removes .append files" test -z "$(find "$op" -name '*.append')"
check "records opinionated origin" grep -q 'from the .opinionated. template' "$op/learning/MEMORY.md"
check "overlay adds bun-only hook" test -x "$op/.claude/hooks/bun-only.sh"
# shellcheck disable=SC2016 # jq variables, not shell
check "overlay settings keep base hooks" jq -e --slurpfile b "$repo/templates/agnostic/.claude/settings.json" \
	'.hooks.SessionStart == $b[0].hooks.SessionStart and .hooks.Stop == $b[0].hooks.Stop and (.hooks.PreToolUse | contains($b[0].hooks.PreToolUse))' "$op/.claude/settings.json" >/dev/null
check "overlay settings wire bun-only" jq -e '.hooks.PreToolUse[] | select(.matcher == "Bash") | .hooks[].command | endswith("bun-only.sh")' "$op/.claude/settings.json" >/dev/null
check "ignores foreign lockfiles" grep -qx 'pnpm-lock.yaml' "$op/.gitignore"

# --- bun-only.sh ---
bun_hook=$repo/templates/opinionated/.claude/hooks/bun-only.sh
# shellcheck disable=SC2329 # both are called through check
bun_run() { jq -n --arg c "$1" '{tool_input: {command: $c}}' | "$bun_hook" 2>/dev/null; }
# shellcheck disable=SC2329
bun_blocks() { ! bun_run "$1"; }
# shellcheck disable=SC2016 # literal $(...) is the input under test
for c in 'npm install' 'npx next dev' 'pnpm i' 'yarn' 'cd app && npm run build' 'sudo npm i -g x' 'echo $(npm -v)'; do
	check "bun-only blocks: $c" bun_blocks "$c"
done
for c in 'bun install' 'bunx next dev' 'grep -r npm .' 'ls ~/npm-cache' 'bun add yarn-lock-parser'; do
	check "bun-only allows: $c" bun_run "$c"
done
check "bun-only allows non-Bash input" bash -c "echo '{}' | '$bun_hook'"

# --- opus-delegates.sh ---
od_hook=$repo/templates/agnostic/.claude/hooks/opus-delegates.sh
check "copies worker and chore agents" bash -c "grep -q '^model: sonnet' '$tmp/examples/demo/.claude/agents/worker.md' && grep -q '^model: haiku' '$tmp/examples/demo/.claude/agents/chore.md'"
check "agents run at low effort" bash -c "grep -q '^effort: low' '$tmp/examples/demo/.claude/agents/worker.md' && grep -q '^effort: low' '$tmp/examples/demo/.claude/agents/chore.md'"
check "keeps .claude/agents visible" bash -c "cd '$tmp/examples/demo' && git init -q && ! git check-ignore -q .claude/agents/worker.md"
check "agnostic settings wire opus-delegates" jq -e '.hooks.PreToolUse[].hooks[].command | endswith("opus-delegates.sh")' "$repo/templates/agnostic/.claude/settings.json" >/dev/null
echo '{"type":"assistant","message":{"model":"claude-opus-5-5"}}' >"$tmp/opus.jsonl"
echo '{"type":"assistant","message":{"model":"claude-sonnet-5"}}' >"$tmp/sonnet.jsonl"
# shellcheck disable=SC2329 # both are called through check
od_run() { # transcript, tool name, tool_input JSON, then an optional agent_id
	jq -n --arg t "$tmp/$1.jsonl" --arg n "$2" --argjson i "$3" --arg a "${4:-}" \
		'{transcript_path: $t, tool_name: $n, tool_input: $i} + (if $a == "" then {} else {agent_id: $a} end)' | "$od_hook" 2>/dev/null
}
# shellcheck disable=SC2329
od_blocks() { ! od_run "$@"; }
check "opus blocks code edit" od_blocks opus Edit '{"file_path":"src/app.ts"}'
check "opus blocks code write" od_blocks opus Write '{"file_path":"a.sh"}'
check "opus blocks notebook edit" od_blocks opus NotebookEdit '{"notebook_path":"n.ipynb"}'
check "opus allows plan Markdown" od_run opus Write '{"file_path":"docs/plan.md"}'
for c in 'git commit -m x' 'git add . && git push' 'git mv a b' 'mv a b' 'git status' 'bash tests/run.sh' 'grep -r "git commit" .'; do
	check "opus allows: $c" od_run opus Bash "$(jq -n --arg c "$c" '{command: $c}')"
done
check "opus blocks default subagent" od_blocks opus Agent '{"subagent_type":"general-purpose"}'
check "opus blocks untyped subagent" od_blocks opus Agent '{}'
for a in worker chore Explore; do
	check "opus allows $a subagent" od_run opus Agent "{\"subagent_type\":\"$a\"}"
done
check "sonnet edits freely" od_run sonnet Edit '{"file_path":"src/app.ts"}'
check "subagent under opus edits freely" od_run opus Edit '{"file_path":"src/app.ts"}' agent-1
check "allows without transcript" bash -c "echo '{\"tool_name\":\"Edit\"}' | '$od_hook'"

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

# --- repo root runs the agnostic loop through symlinks ---
for f in hooks/learn-nudge.sh hooks/opus-delegates.sh settings.json skills/learn agents; do
	check "root .claude/$f links to agnostic" test "$repo/.claude/$f" -ef "$repo/templates/agnostic/.claude/$f"
done
check "root has learning/" test -f "$repo/learning/LESSONS.md" -a -f "$repo/learning/MEMORY.md"

echo "$fails failure(s)"
exit "$fails"
