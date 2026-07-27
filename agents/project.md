# Project

## Overview

**Forge** — GNOME Shell extension for i3/sway-style tiling window management.

### Who owns what (do not collapse these)

| Layer | Meaning |
| --- | --- |
| **EGO / forge-ext** | Upstream SweetTooth / `forge-ext/forge` (seeks maintainer) |
| **jcrussell** | Community / AI-maintained fork on GitHub — **Phase A base** |
| **This tree (Luke)** | Local product work on that base; **official personal GitHub fork not created yet** — see [forge-fork-eval_personal-fork](./tasks/forge-fork-eval_personal-fork.md) |

Local path: `~/dev/me/forge_jcrussell` (name still says jcrussell; remotes may
still point at jcrussell until the personal-fork task lands). Reference clone
of upstream: `~/dev/me/forge_original`.

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
| [forge-workon-reconcile](./plans/forge-workon-reconcile.md) | WR1–WR5 **Done** | **WR10** tiles sugar → WR11 coexist → WR12 shellrc (P1) |
| [forge-command](./plans/forge-command.md) | FC0–FC5 **Done** | FC6 via workon-reconcile plan |
| [forge-daily-driver](./plans/forge-daily-driver.md) | T0–T7 + OP1 + OP-opt **Done** | Live; thrash bugs interrupt; T9 later |
| [forge-codebase-audit](./plans/forge-codebase-audit.md) | Wave 1 **Done** | Optional B1 DnD extract only |
| [personal fork](./tasks/forge-fork-eval_personal-fork.md) | Ready | Ownership/remotes — low daily tiling impact |

**Day-to-day ranking:** [PRIORITY.md](./PRIORITY.md).  
**Host `black`:** GNOME Shell 46, X11, dual 4K; **this tree** installed in place (not EGO v89).

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

### Dev testing (live install / Shell HUP)

When agents run live tests that need install + Shell reload (`./install`,
`forge save-session-layout`, dual-mon thrash):

1. **Use a debug install** — `./install` / `make dev` set `production=false`.
2. **Turn logging on** before the run (otherwise `Logger` stays silent):

   ```sh
   gsettings set org.gnome.shell.extensions.forge logging-enabled true
   gsettings set org.gnome.shell.extensions.forge log-level 4   # INFO
   ```

3. **Session-layout file trace** (debug builds only): append-only log at
   `~/.config/forge/config/session-layout-trace.log` during restore / shield /
   rehome. Prefer this over journal guessing after HUP.
4. **Post-HUP collectors** must survive `killall -HUP gnome-shell` (`nohup` /
   background script writing under `/tmp/...`), then compare `forge tree`.
5. Do not rely on the user to re-layout windows for verification.

### Git

Follow shellrc catalog **`git.md`** (composed into `AGENTS.md`): **no commit and no
push** unless the current user message **directly** asks. “Commit” means commit
only — never push unless they also asked to push. Session end / wrap-up does not
authorize either.
