#!/bin/sh
set -eu

REPO_URL="https://raw.githubusercontent.com/Ziy1-Tan/herdr-codebuddy/main"
ACTION="${1:-install}"

case "$ACTION" in
  install|uninstall) ;;
  *)
    echo "Usage: install.sh [install|uninstall]" >&2
    exit 2
    ;;
esac

for command in curl node; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Error: '$command' is required." >&2
    exit 1
  fi
done

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' 0 HUP INT TERM

for file in install.js herdr-codebuddy-hook.js; do
  curl -fsSL --retry 3 --connect-timeout 10 \
    "$REPO_URL/$file" \
    -o "$TMP_DIR/$file"
done

node "$TMP_DIR/install.js" "$ACTION"
