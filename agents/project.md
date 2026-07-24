# Project

## Overview

**Forge** — GNOME Shell extension for i3/sway-style tiling window management.

This tree is **jcrussell/forge** (community / AI-maintained fork). Upstream
**forge-ext/forge** seeks a maintainer; local reference clone:
`~/dev/me/forge_original`.

Compose rules into root `AGENTS.md` (shellrc `agents`):

```sh
agents build
agents build --preset=full
# or: python3 agents.py build
```

Agent source of truth is **`agents/`** → `AGENTS.md` only. Do not reintroduce
`CLAUDE.md`, `.claude/`, or beads (`.beads` / `bd`) project files.

## Stack

- GNOME Shell extension (GJS / ES modules), GNOME 45+
- GTK4 / Adwaita preferences
- Vitest unit tests + Dockerized E2E
- Prettier (2-space, 100 cols); husky pre-commit
- Build: **Node.js 20+**, gettext (`make check-deps`)

## Branches

| Branch | Role |
| --- | --- |
| `main` | GNOME 45+ — **this work** |
| `legacy` / `gnome-3-36` | GNOME 3.36 — feature-frozen |

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
| [forge-daily-driver](./plans/forge-daily-driver.md) | T0–T1 done | Next: T2 overlay → T3 blank/wake |
| [forge-harden-and-session](./plans/forge-harden-and-session.md) | H1 code done | Live verify via daily-driver T3; then session/`workon` |

**Host `black` (last inventory):** GNOME Shell 46.0, X11, EGO Forge **v89** still installed until trial.

## Layout

| Path | Purpose |
| --- | --- |
| `extension.js` / `prefs.js` | Shell lifecycle / prefs entry |
| `lib/extension/` | Tree, WM, command/focus/decoration, keybindings |
| `lib/shared/` | Settings, config-sync, theme, logger |
| `lib/prefs/` | GTK4 prefs pages (**not** unit-tested) |
| `docs/` | User + developer docs |
| `tests/` | Unit (Vitest) + e2e + mocks |
| `agents/plans/` | Plans |
| `agents/tasks/` | Session tasks; done plan-linked → `plans/<plan>/completed/` |

## Domain concepts (quick)

| Concept | Detail |
| --- | --- |
| **Tiling tree** | i3/sway-style tree; H/V split, STACKED, TABBED |
| **Window modes** | TILE (managed), FLOAT (unmanaged), GRAB_TILE (drag), DEFAULT |
| **Session / lock** | On lock screen: disable keybindings; **keep tree in memory** so layout survives |
| **GObject** | Core classes use `static { GObject.registerClass(this); }`; track signal IDs and disconnect on teardown / `disable()` |

## Configuration paths

| What | Where |
| --- | --- |
| GSettings schema | `org.gnome.shell.extensions.forge` |
| Window overrides | `~/.config/forge/config/windows.json` |
| Stylesheet overrides | `~/.config/forge/stylesheet/forge/stylesheet.css` |

## Where to look (do not dump full docs here)

| Need | Doc |
| --- | --- |
| Build / test / format | [CONTRIBUTING.md](../CONTRIBUTING.md), `make help` |
| Architecture / render / Mutter | [docs/dev/](../docs/dev/) (`architecture.md`, `rendering.md`, `compat.md`) |
| Unit / e2e tests | [tests/README.md](../tests/README.md), [tests/e2e/README.md](../tests/e2e/README.md) |
| User behavior | [docs/user/](../docs/user/) |
| Durable “why” | [docs/DESIGN.md](../docs/DESIGN.md) |
| Priorities / plans | [PRIORITY.md](./PRIORITY.md), `agents/plans/` |

## Project-specific rules

- Read `docs/dev/architecture.md` and `docs/dev/compat.md` before large Mutter/API changes.
- Keep signal disconnect / actor teardown disciplined on `disable()` and node removal.
- Prefer fixing root causes over silencing crashes.
- Do not re-run the upstream-vs-fork comparison unless the trees change materially.

### Git

Follow shellrc catalog **`git.md`** (composed into `AGENTS.md`): **no commit and no
push** unless the current user message **directly** asks. “Commit” means commit
only — never push unless they also asked to push. Session end / wrap-up does not
authorize either.
