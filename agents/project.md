# Project

## Overview

**Forge** — GNOME Shell extension for i3/sway-style tiling window management.

This tree is **jcrussell/forge** (community / AI-maintained fork). Upstream
**forge-ext/forge** seeks a maintainer; local reference clone:
`~/dev/me/forge_original`.

Compose rules into root `AGENTS.md`:

```sh
python3 agentsmd_build.py
python3 agentsmd_build.py --preset=full
```

## Stack

- GNOME Shell extension (GJS / ES modules), GNOME 45+
- GTK4 / Adwaita preferences
- Vitest unit tests + Dockerized E2E
- Prettier (2-space, 100 cols); husky pre-commit
- Build: **Node.js 20+**, gettext (`make check-deps`)

## Priorities for agents

1. **Install trial** of this fork on `black` (gate for daily driver).
2. **Multi-monitor / tab-stack lifecycle** — blank/thrash + retab must not crash Shell.
3. **Resize predictability** and **session scripting** (`workon dev`) — see harden plan.
4. Prefer small, tested patches; `npm test` / `make unit-test` for logic changes.
5. UUID `forge@jmmaranan.com` — installs **replace** the live extension in place.
6. gdisplays / connector identity lives in **shellrc**, not here.

## Active work

| Item | Status | Next |
| --- | --- | --- |
| [forge-fork-eval](./plans/forge-fork-eval.md) | Phase A done — **use this fork as base** | Phase B/C install trial on `black` |
| [spike task](./tasks/forge-fork-eval_spike.md) | Ready | Backup → Node 20 → `make dev` → smoke → blank/wake |
| [forge-daily-driver](./plans/forge-daily-driver.md) | Ready | T0 stack-off → T1 tab chrome → overlay → blank/wake |
| [forge-harden-and-session](./plans/forge-harden-and-session.md) | H1 code done | Live verify via daily-driver T3; then session/`workon` |

**Host `black` (last inventory):** GNOME Shell 46.0, X11, EGO Forge **v89** still installed until trial.

## Layout

| Path | Purpose |
| --- | --- |
| `extension.js` / `prefs.js` | Shell lifecycle / prefs entry |
| `lib/extension/` | Tree, WM, command/focus/decoration, keybindings |
| `lib/shared/` | Settings, config-sync, theme, logger |
| `lib/prefs/` | GTK4 prefs pages |
| `docs/` | User + developer docs |
| `tests/` | Unit (Vitest) + e2e + mocks |
| `agents/plans/` | Plans |
| `agents/tasks/` | Session tasks; done plan-linked → `plans/<plan>/completed/` |

## Project-specific rules

- Read `docs/dev/architecture.md` and `docs/dev/compat.md` before large Mutter/API changes.
- Keep signal disconnect / actor teardown disciplined on `disable()` and node removal.
- Prefer fixing root causes over silencing crashes.
- Do not re-run the upstream-vs-fork comparison unless the trees change materially.
