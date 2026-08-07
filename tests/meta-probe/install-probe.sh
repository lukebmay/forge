#!/usr/bin/env bash
# Install meta-probe extension (symlink into user extensions dir).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
UUID="meta-probe@forge-test.local"
SRC="$ROOT/extension"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

if [[ ! -f "$SRC/metadata.json" || ! -f "$SRC/extension.js" ]]; then
  echo "error: missing extension sources under $SRC" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
if [[ -e "$DEST" && ! -L "$DEST" ]]; then
  echo "error: $DEST exists and is not a symlink; move it aside first" >&2
  exit 1
fi

ln -sfn "$SRC" "$DEST"
echo "linked $DEST -> $SRC"
echo
echo "Next (Wayland: logout/login required to load a new extension):"
echo "  1) Log out and back in (or restart the session)"
echo "  2) gnome-extensions enable $UUID"
echo "  3) gnome-extensions disable forge@jmmaranan.com   # for clean measurements"
echo "  4) python3 $ROOT/probe_driver.py ping"
echo
echo "Optional compile schemas: none (probe has no gsettings)."
