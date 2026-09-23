#!/usr/bin/env bash
# Create a project from a template.
# Usage: new-project.sh [-t template] <name> [dest]
# The template defaults to agnostic. Every other template is an overlay: it is
# copied on top of agnostic, and each overlay file named <file>.append is
# appended to <file>. dest defaults to examples/<name>.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
template=agnostic
if [[ ${1:-} == -t ]]; then
	template=${2:?usage: new-project.sh [-t template] <name> [dest]}
	shift 2
fi
name=${1:?usage: new-project.sh [-t template] <name> [dest]}
dest=${2:-$root/examples/$name}

[[ -d $root/templates/$template ]] || {
	echo "unknown template: $template" >&2
	exit 1
}
[[ $name =~ ^[a-z0-9][a-z0-9-]*$ ]] || {
	echo "invalid name: $name (use lowercase, digits, -)" >&2
	exit 1
}
[[ -e $dest ]] && {
	echo "already exists: $dest" >&2
	exit 1
}

mkdir -p "$(dirname "$dest")"
cp -R "$root/templates/agnostic" "$dest"
if [[ $template != agnostic ]]; then
	cp -R "$root/templates/$template/." "$dest/"
	find "$dest" -name '*.append' -print0 | while IFS= read -r -d '' f; do
		cat "$f" >>"${f%.append}"
		rm "$f"
	done
fi
sed -i.bak "s/{{PROJECT_NAME}}/$name/g" "$dest/AGENTS.md" && rm "$dest/AGENTS.md.bak"
echo "- $(date +%F) Created from the \`$template\` template by \`scripts/new-project.sh\`." >>"$dest/learning/MEMORY.md"
echo "created $dest from $template"
