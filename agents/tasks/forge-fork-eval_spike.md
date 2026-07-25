# Task — Forge fork evaluation spike

**Status:** Ready for Phase B (install trial)  
**Plan:** [forge-fork-eval.md](../plans/forge-fork-eval.md)  
**Priority:** P2  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-fork-eval/completed/` (not `tasks/completed/`)

## Problem

EGO upstream Forge (currently **v89** on `black`) is under-maintained; multi-monitor thrash + retab has crashed GNOME Shell. This tree (**jcrussell/forge**) is the better code base (Phase A). Need a **live install trial** before daily-driving it.

## Already decided (do not re-litigate)

| Decision | Value |
| --- | --- |
| Codebase base | **This repo** — not `~/dev/me/forge_original` |
| Install method | **`make dev`** from this tree |
| UUID | Keep `forge@jmmaranan.com` (in-place replace) |
| Session | **X11 only** for trial |
| Personal fork | **Not yet** — tracked in [forge-fork-eval_personal-fork.md](./forge-fork-eval_personal-fork.md) |
| gdisplays | Independent (v1 done in shellrc) |

## Host facts (2026-07-16)

- `black`, GNOME Shell **46.0**, X11, Forge **enabled**  
- Installed: EGO SweetTooth **version 89** (upstream lineage, Dec 2025)  
- Config: `~/.config/forge/` present  
- Build: host Node was **18.19.1** — need **20+**; `node_modules` was **missing**

## Remaining work (next session order)

**Preferred tooling:** `scripts/forge/` (see `scripts/forge/README.md`). One-shot:

```bash
cd ~/dev/me/forge_jcrussell
./scripts/forge/status.zsh
./scripts/forge/switch-to-jcrussell.zsh   # save → uninstall → make dev → apply --translate=jcrussell
# log out / log in (X11), then:
./scripts/forge/status.zsh
```

Rollback: `./scripts/forge/rollback.zsh` or `./scripts/forge/switch-to-ego.zsh`

### 1. Backup (manual / script)

```bash
./scripts/forge/save-settings.zsh
# → ~/.local/share/forge-manage/backups/<stamp>/{extension,config,dconf-forge.conf,meta.json}
```

Manual equivalent still works:

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP=~/dev/me/forge_backup_$STAMP
mkdir -p "$BACKUP"
cp -a ~/.local/share/gnome-shell/extensions/forge@jmmaranan.com "$BACKUP/extension"
cp -a ~/.config/forge "$BACKUP/config" 2>/dev/null || true
dconf dump /org/gnome/shell/extensions/forge/ > "$BACKUP/dconf-forge.conf"
```

### 2. Build deps + install

```bash
./scripts/forge/install-jcrussell.zsh
# or: npm install && make check-deps && make dev
```

Then **log out and log in** (prefer full session restart on X11). Enable if needed:

```bash
gnome-extensions enable forge@jmmaranan.com
./scripts/forge/status.zsh
```

Confirm lineage=`jcrussell` (version-name from `git describe`, not EGO version 89).

### 3. Rollback (if needed)

```bash
./scripts/forge/rollback.zsh          # restores extension/ from latest backup
# or reinstall EGO zip:
./scripts/forge/switch-to-ego.zsh
```

### 4. Smoke + stress

Use plan checklist. Minimum path:

1. Dual head OK (`gdisplays load default` if needed).  
2. Windows tiled on **both** monitors.  
3. Tabbed + stacked without crash.  
4. Blank displays (DPMS / idle) → wake → **retab** — no shell crash.  
5. Cheatsheet `Super+Shift+/`.  

On crash, capture:

```bash
journalctl --user -b /usr/bin/gnome-shell -n 200 --no-pager
```

### 5. Close out

- Fill trial table below.  
- Daily-driver recommendation (one paragraph).  
- Quick wins list (config / small patch / hard).  
- Update plan acceptance + session note.  
- Move **this file** → `agents/plans/forge-fork-eval/completed/`.

## Out of scope

- Long-term maintenance / EGO publish  
- Large refactors  
- gdisplays v2  
- Re-doing Phase A comparison  

## Deliverables

- [x] Comparison notes (plan Phase A)  
- [x] Base recommendation: **jcrussell**  
- [x] Trial defaults locked (make dev, UUID, X11)  
- [x] Host inventory + backup/install/rollback commands  
- [x] Backup created (path: `~/.local/share/forge-manage/backups/switch-jcrussell-manual-20260722-163828`)  
- [ ] Trial result (smoke table) — partial; see notes  
- [ ] Crash? journal excerpt if any  
- [x] Quick-win list — host defaults, theme restore, float-on-maximize  
- [x] Daily-driver recommendation after install — **staying on jcrussell**; multi-mon overnight still broken  
- [x] Rollback verified **or** deliberately staying on fork — **staying on fork**

## Smoke results (fill next session)

| Check | Result | Notes |
| --- | --- | --- |
| Enables on login | | |
| Tile both monitors | | |
| Focus hjkl / arrows | | |
| Tabbed / stacked | | |
| Drag-drop preview | | |
| Floating rules | | |
| Blank → wake → retab (no crash) | | |
| Cheatsheet | | |
| Prefs persist | | |

## Acceptance

- [x] User can choose **codebase base** without re-research  
- [ ] User can choose **daily driver** after live trial (or explicit defer)  
- [ ] Install state documented (on fork or rolled back)

## Session notes

**2026-07-23 (session wrap):** Daily-driving jcrussell. Manual lock keeps placement; **overnight auto-lock clustered all windows on one monitor** (workareas thrash / no soft rehome). Maximize: Super+Enter floats full max so it sticks. Soft rehome **implemented** — [completed](../plans/forge-harden-and-session/completed/forge-harden-and-session_soft-rehome.md); still needs live blank/wake verify. Spike not fully closed (smoke table incomplete) but install decision is stay-on-fork.

**2026-07-22 (wrap):** Live jcrussell; scripts/forge suite; theme + host defaults.

**2026-07-22 (manual switch):** EGO→jcrussell by hand; backup `switch-jcrussell-manual-20260722-163828`; settings preserved.

**2026-07-22:** Added `scripts/forge/` migration suite.

**2026-07-16:** Imported from shellrc; Phase A done; base = this fork. Host: Shell 46 / X11 / EGO v89 / Node 18 (needs 20) / no node_modules.  
**2026-07-16 (prep):** Plan + this task updated for next session — start at Phase B backup; do not re-compare upstream.
