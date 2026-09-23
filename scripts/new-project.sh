#!/usr/bin/env bash
# Clone template/ into a new project. Usage: new-project.sh <name> [dest]
# dest defaults to examples/<name>. Use a path outside the repo to create a
# standalone project.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
name=${1:?usage: new-project.sh <name> [dest]}
dest=${2:-$root/examples/$name}

[[ $name =~ ^[a-z0-9][a-z0-9-]*$ ]] || {
	echo "invalid name: $name (use lowercase, digits, -)" >&2
	exit 1
}
[ -e "$dest" ] && {
	echo "already exists: $dest" >&2
	exit 1
}

mkdir -p "$(dirname "$dest")"
cp -R "$root/template" "$dest"
sed -i.bak "s/{{PROJECT_NAME}}/$name/g" "$dest/AGENTS.md" && rm "$dest/AGENTS.md.bak"
echo "created $dest"
