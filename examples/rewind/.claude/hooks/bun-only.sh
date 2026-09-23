#!/usr/bin/env bash
# Bun only. Runs on PreToolUse for Bash and blocks a command that starts
# npm, npx, pnpm, pnpx, or yarn. Exit 2 blocks the call and shows stderr to
# the agent.
set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')
# Command position only: start of the command, or after ; & | ( or $(.
# `grep npm` and paths that contain "npm" stay allowed.
if grep -Eq '(^|[;&|(])[[:space:]]*(sudo[[:space:]]+)?(npm|npx|pnpm|pnpx|yarn)([[:space:]]|$)' <<<"$cmd"; then
	echo "This project uses bun only. Use bun install, bun add, bun run, or bunx instead." >&2
	exit 2
fi
