#!/usr/bin/env zsh
# Same as ./install — scripts/install.zsh with a .zsh name for clarity.
emulate -L zsh
set -euo pipefail
ROOT=${0:A:h}
exec "$ROOT/scripts/install.zsh" "$@"
