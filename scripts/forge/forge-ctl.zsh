#!/usr/bin/env zsh
# Multi-command front-end for scripts/forge/*.zsh
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}

usage() {
  cat <<EOF
forge-ctl — manage EGO ↔ jcrussell Forge installs

Usage: forge-ctl <command> [args…]

Atomic commands:
  status                 Show install / settings / backups
  save                   Backup extension + dconf + config
  apply [backup]         Restore settings (optional --translate=)
  translate [in] [out]   Filter dconf dump to a target schema
  restore-theme [backup] Restore CSS colors + stamp css-last-update
  reload-theme           Live-reload user stylesheet (css-updated)
  idle-lock              Short idle/DPMS lock for blank/wake testing
  host-defaults          Apply host-defaults.conf (lock/quit/maximize chords)
  install                Unified install from this tree (lineage-aware)
  install-ego            Install from extensions.gnome.org
  uninstall              Remove user extension (keeps dconf)
  install-jcrussell      Build+install this repo (make dev)
  update                 Rebuild tree → live extension (restart Shell yourself)
  check-updates          Git (and optional --ego) update check

Process flows:
  switch-to-jcrussell    save → uninstall → install-jcrussell → apply
  switch-to-ego          save → uninstall → install-ego → apply
  rollback [backup]      Restore extension/ from a backup

Global options (after command): --force --color=auto|always|never -h

Examples:
  forge-ctl status
  forge-ctl save
  forge-ctl update --force
  forge-ctl switch-to-jcrussell --force
  forge-ctl check-updates --fetch --ego
  forge-ctl rollback ~/.local/share/forge-manage/backups/latest

Env:
  FORGE_BACKUP_ROOT   default ~/.local/share/forge-manage/backups
  FORGE_REPO_ROOT     default: repo containing scripts/forge
  FORGE_FORCE=1       non-interactive yes
EOF
}

cmd="${1:-}"
[[ -z "$cmd" || "$cmd" == "-h" || "$cmd" == "--help" ]] && { usage; exit 0; }
shift || true

case "$cmd" in
  status) exec "$SCRIPT_DIR/status.zsh" "$@" ;;
  save|save-settings) exec "$SCRIPT_DIR/save-settings.zsh" "$@" ;;
  apply|apply-settings) exec "$SCRIPT_DIR/apply-settings.zsh" "$@" ;;
  translate|translate-settings) exec "$SCRIPT_DIR/translate-settings.zsh" "$@" ;;
  restore-theme|theme) exec "$SCRIPT_DIR/restore-theme.zsh" "$@" ;;
  reload-theme|reload-css) exec "$SCRIPT_DIR/reload-theme.zsh" "$@" ;;
  idle-lock|trigger-idle-lock) exec "$SCRIPT_DIR/trigger-idle-lock.zsh" "$@" ;;
  host-defaults|defaults) exec "$SCRIPT_DIR/apply-host-defaults.zsh" "$@" ;;
  install) exec "${SCRIPT_DIR:h}/install.zsh" "$@" ;;
  install-ego) exec "$SCRIPT_DIR/install-ego.zsh" "$@" ;;
  uninstall) exec "$SCRIPT_DIR/uninstall.zsh" "$@" ;;
  install-jcrussell|install-dev) exec "$SCRIPT_DIR/install-jcrussell.zsh" "$@" ;;
  update|update-jcrussell|reload-install) exec "$SCRIPT_DIR/update-jcrussell.zsh" "$@" ;;
  check-updates|check) exec "$SCRIPT_DIR/check-updates.zsh" "$@" ;;
  switch-to-jcrussell|to-jcrussell|to-dev) exec "$SCRIPT_DIR/switch-to-jcrussell.zsh" "$@" ;;
  switch-to-ego|to-ego) exec "$SCRIPT_DIR/switch-to-ego.zsh" "$@" ;;
  rollback) exec "$SCRIPT_DIR/rollback.zsh" "$@" ;;
  *)
    print -u2 "forge-ctl: unknown command: $cmd"
    usage
    exit 1
    ;;
esac
