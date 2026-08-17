# Project

## Overview

**Forge** — GNOME Shell extension for i3/sway-style tiling window management.

### Who owns what (do not collapse these)

| Layer | Meaning |
| --- | --- |
| **EGO / forge-ext** | Upstream SweetTooth / `forge-ext/forge` (seeks maintainer) |
| **jcrussell** | Community / AI-maintained fork on GitHub — **Phase A base** |
| **This tree (Luke)** | Product work on jcrussell base; GitHub **`lukebmay/forge`** (lineage id **`luke`**) |

Local path: `~/dev/me/forge`. Reference clone of upstream: `~/dev/me/forge_original`.

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
| `master` | GNOME 45+ — **default work branch** (`lukebmay/forge`) |
| `plan/*` / `task/*` | **Major** refactors/features only; merge back when gated |
| `main` | Upstream default on **jcrussell** / **forge-ext** (pull via `upstream/main`) |
| `legacy` / `gnome-3-36` | GNOME 3.36 — feature-frozen |

Day-to-day agents implement on **`master`**. Do not open a side branch for ordinary fixes or small features.

## Priorities for agents

1. **Use named APIs** — [docs/dev/contracts.md](../docs/dev/contracts.md). Extend
   the catalog first; do not hand-roll a twin helper.
2. **Install trial** of this fork on `black` (gate for daily driver).
3. **Multi-monitor / tab-stack lifecycle** — blank/thrash + retab must not crash Shell.
4. **Resize predictability** and **session scripting** (`layout dev`) — see harden plan.
5. Prefer small, tested patches; `npm test` / `make unit-test` for logic changes.
6. UUID `forge@jmmaranan.com` — installs **replace** the live extension in place.
7. gdisplays / connector identity lives in **shellrc**, not here.

## Active work

| Item | Status | Next |
| --- | --- | --- |
| **[Canonical contracts](./plans/forge-canonical-contracts.md)** | **P0** IC0–IC3 done | IC4 **skipped** (AL8) |
| **[CLI → Node](./plans/forge-cli-node.md)** | **Locked** D036 · CN0–CN6 **done** (CN7 skip) | no layout port; CN13 later |
| **[ApplyLayout](./plans/forge-layout-in-process.md)** | AL0–AL8 **done** | R036 cold host residual (logout) |
| **[Slot machines](./plans/forge-layout-slot-machines.md)** | **SM1–SM7 code done** (uncommitted) | human R036 cold; tab D0 |
| **[First-class containers](./plans/forge-first-class-containers.md)** | C0+C1 **done** (C1 uncommitted) | Wave Z live residual; C2 later |
| **[Tab strip DnD](./plans/forge-tab-chrome-drag.md)** | TD1 **done** (nest live) | TD2 only if peel Model B mismatch |
| **[CLI attachable jobs](./plans/forge-cli-jobs.md)** | **Done** (CJ1–CJ6) | Durable mutators default; `forge jobs`; see § CLI jobs below |
| **STACKED layouts** | Major product | As PRIORITY allows |
| `forge layout` (was workon) | **Done** rename + mon L/R order | Live-drive; mid-apply TTY death no longer aborts job |
| [forge-workon-reconcile](./plans/forge-workon-reconcile.md) | **Complete** (historical name) | — |
| [forge-command](./plans/forge-command.md) | FC0–FC5 **Done** | Jobs extend CLI process model |
| [forge-daily-driver](./plans/forge-daily-driver.md) | T0–T7 + OP1 + T9 **Done** | Live |
| [forge-codebase-audit](./plans/forge-codebase-audit.md) | Wave 1 + B1 **Done** | B2 optional |
| [personal fork](./plans/forge-fork-eval/completed/forge-fork-eval_personal-fork.md) | **Done** | lukebmay/forge · lineage `luke` · master |

**Day-to-day ranking:** [PRIORITY.md](./PRIORITY.md).  
**Host `black`:** GNOME Shell 46, X11, dual 4K; **this tree** installed in place (not EGO v89).

## CLI jobs (agents)

| Rule | Detail |
| --- | --- |
| **Default** | Mutating commands = durable job + **attach** (stream + wait). No flag for TTY survival. |
| **`--detach`** | Same worker; print job id; return immediately |
| **`--foreground` / `FORGE_JOB=0`** | In-process (debug) |
| **In-scope** | `layout` apply (incl. clean profile), `run` / `run-steps`, install family, `test live run` |
| **Out of scope** | `ping`, `tree`, `layout list\|show\|save\|help`, short focus/get/set |
| **Single-flight** | One mutator at a time; busy → error with job id |
| **Job dir** | `~/.local/share/forge/jobs/<id>/` (`status.json`, `pid`, logs) or `$FORGE_JOBS_DIR` |
| **Signals** | Attached Ctrl+C cancels worker; SIGHUP/TTY death does **not** kill worker; `forge jobs cancel` |
| **Code** | `scripts/forge/job_runner.py`; D021 |
| **Tests** | Units `tests/unit/cli/test_job_runner.py`; live parent-HUP smoke green (CJ5) |
| **True cold** | Still cares about agent **window** placement (Guake/float), not apply process survival |

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
| **Open leaf** | Visible/active child of a TABBED/STACKED group (`lastTabFocus`) — not the same as keyboard focus |
| **Hard expectation** | Meta signal we wait for before the next act (TILE, windowId, mon, sane rect) |
| **Soft residual** | Race that *may* follow an act (focus steal, size-changed); wait learned quiet; if absent, proceed |
| **Profile** | User JSON data only — never special-case a host desk in product code |
| **Synthetic names** | Host `forgetest` for tests; layout profiles `layoutA` / `layoutB` / … — not color-like labels (colors/plants/heroes are real hosts) |

## Configuration paths

| What | Where |
| --- | --- |
| GSettings schema | `org.gnome.shell.extensions.forge` |
| Window overrides | `~/.config/forge/config/windows.json` |
| Stylesheet overrides | `~/.config/forge/stylesheet/forge/stylesheet.css` |
| Settle heuristics | `~/.config/forge/config/settle-heuristics.json` (host+class+kind timings only) |

## Where to look (do not dump full docs here)

| Need | Doc |
| --- | --- |
| Build / test / format | [CONTRIBUTING.md](../CONTRIBUTING.md), `make help` |
| Architecture / render / Mutter | [docs/dev/](../docs/dev/) (`architecture.md`, `rendering.md`, `compat.md`) |
| **Job → API (agents)** | **[docs/dev/contracts.md](../docs/dev/contracts.md)** — extend these first |
| **Layout settle / cold spine (agents)** | **This file** § Layout apply architecture |
| Unit / e2e tests | [tests/README.md](../tests/README.md), [tests/e2e/README.md](../tests/e2e/README.md) |
| User behavior | [docs/user/](../docs/user/) (`layout.md` cold apply steps) |
| Durable “why” + decisions | [docs/DESIGN.md](../docs/DESIGN.md), [docs/DECISIONS.md](../docs/DECISIONS.md) (D039–D043 apply; D008–D009 forest-first) |
| Priorities / plans / live matrix | [PRIORITY.md](./PRIORITY.md), [HANDOFF.md](./HANDOFF.md), `agents/plans/` |

---

## Layout apply architecture (for future agents)

This is the **product contract** for `forge layout` (reconcile / desired-state
desk restore). Read it before adding sleeps, second `ensure_layout` passes,
“just run layout again,” or app-specific branches.

Chrome/Grok/Ghostty appear below only as **repro history** on host `black`. The
engine must stay generic: any app class, any mon order, any profile `active`.

### Vocabulary (do not conflate these)

| Term | Meaning in forge |
| --- | --- |
| **TABBED group** | Several windows share one pane; only one is the **open leaf** (visible content). Forge draws a tab strip for the others. |
| **Open leaf** | Which window the group shows (`lastTabFocus` / `lastTabFocusId`). Profile field often named `active`. |
| **Keyboard focus** | Which window receives keys (`focusWindowId`). Can differ from open leaf (e.g. focus on Ghostty while a mon0 tab shows Grok). |
| **Tab strip active** | Which tab *looks* selected in decoration CSS. Must track **open leaf**, not only keyboard focus. |
| **Late activate** | After map/tile, an app raises itself (common with Chrome and PWAs) and rewrites Meta focus / open leaf after we already set them. |
| **Hard expectation** | Something we treat as required before the next act (e.g. mode TILE, windowId present, monitor ≥ 0, positive width/height). |
| **Soft residual** | Something that *often* happens after an act but is not guaranteed (focus steal, size-changed). Wait a learned quiet window; if nothing arrives, move on. |
| **Call clock** | Timer starts when **we** issue the act (launch, move, focus apply)—not from “command start” or machine benchmarks alone. |

### Why we chose this architecture

**Constraint:** Mutter/GNOME does not emit “this window is settled.” Apps map as
FLOAT, then TILE; they may activate, resize, or steal focus seconds later.
Sleeping a fixed 250 ms or re-running layout “until it looks right” is not a
contract.

**History (what went wrong):** each live failure got another **band-aid**—extra
`ensure_layout` after bind, focus during open, fixed reassert timers, belt
structure rewrite, Mode B thrash-recover as cold “success.” That felt like
progress and **rotted the system**: band-aids hid the next bug, tests encoded
patches, and agents re-learned one desk instead of a phase model.

**Choice:** an **ordered phase spine** (structure before focus) plus a
**hard/soft settle contract** (wait for required Meta signals; treat residual
races as event-driven thrash with learned timeouts). Goals:

1. Name the **phase** that failed (skeleton / open / bind / focus / …), not “Chrome is weird.”
2. **One** `forge layout <name>` finishes the desk; multi-CLI “run again” is not the product fix.
3. **Profiles = data**; product code stays generic (no “if Grok then …” branches).
4. When the real fix lands, **delete** the crutches that only existed for that failure class.

Decisions: **D008–D009** (forest before machines; no Mode B cold), **D014
superseded** (belt is not product), **D016** (lastTabFocus preserve),
**D018** (pin), **D019** (hard/soft *ideas*; execution → **D040/D041**),
**D039–D043** (ApplyEpoch, slot machines, forest-match `ok`, open-into-slot,
overlay).
Plans: [forge-layout-cold-topology](./plans/forge-layout-cold-topology.md),
[forge-layout-settle-contract](./plans/forge-layout-settle-contract.md),
[forge-layout-slot-machines](./plans/forge-layout-slot-machines.md).

**Locked apply architecture (SM0, 2026-08-16):** **slot** machines (a slot is
a TILE window **or** a TABBED/STACKED CON), not per-window. ApplyEpoch is the
only home writer during apply. Hard = **in-slot** (retry N=2). `Done.ok` =
required forest match (hard-failed → `ok: false`; peers still finish). Open
into slot; belt deleted (SM6/D042). Group chrome A is tab/FCC, not SM1–SM4.
Implement: **SM1** (4.5 high) then **SM2** (4.6 high). Do not start SM4
before SM2+SM3.

### Problems this architecture solves

Concrete failure classes (how they looked, what phase owned them):

| What went wrong (observable) | Wrong fix (do not reintroduce) | Architecture answer |
| --- | --- | --- |
| After cold or partial `layout dev`, a **TABBED group shows the wrong window**: e.g. plain Chrome “New Tab” **visible over** the profile’s intended open leaf (Grok), or mon1 shows Voice content while the YouTube tab is lit (or the reverse). Profile wanted `active: Grok` / `active: YouTube`. | Mid-open focus; sleep 250 ms and re-focus forever; belt re-`ensure_layout` that rewrites the group | **Focus after all required slots are terminal.** Pin the intended open leaf (~15s); restore on meta-focus steal; tab strip follows **lastTabFocus**, not keyboard-only. |
| Operator must run `forge layout` **two or three times** before the desk sticks | Accept multi-CLI as success; Mode B second pass on cold | **One spine per command.** Soft residual + verify-once catch late Meta *inside* that run. |
| After thrash, mon children **swap order** (e.g. mon1 becomes `term \| tab` instead of `tab \| term`) | “Just run layout again” / ensure_order as the design | **Order is part of construction**, not a cleanup pass after chaos. No happy-path structure rewrite after bind. |
| Post-open “belt” **rewrites topology** and stomps open leaf / mon order | More ensure_layout after residual; keep belt as the design | **Open into the slot** (D042). Belt is **deleted** (SM6), not the happy path |
| Fixed quiet (250 ms / 2 s) works on one machine, fails on another or when Chrome is slow | Longer sleeps; per-app hardcode | **Hard** = in-slot retry (5s then 2s×2). **Soft** = rolling max residual latency × 1.25 per host+wm_class (file-backed) |
| Product code grows `if chrome / if ghostty` settle branches for one host desk | Ship personal layout as engine logic | Heuristics keys: `host\|class\|processKind\|residualKind`. Profiles name roles; **engine never keys on role names**. |
| Cold empty desk treated as thrash → Mode B parks everything then “recovers” | Mode B as cold success path | Cold/just_opened: thrash **report-only**; skeleton-first one-shot. Mode B = true mid-session chaos only. |

### Cold / open spine (hold this)

Happy path for one reconcile apply (especially when roles need open):

```text
ApplyEpoch
  → materialize forest (skeleton + bind existing + open INTO slots)
  → slot machines (parallel independent slots; hard = in-slot retry)
  → forest match (Done.ok)
  → focus once + soft residual + verify once
  → release epoch
```

Historical phase names (skeleton / open / bind / …) may remain as logs.
Product `ok` is forest match (D041), not “hard warned and focus passed.”

| Phase | Responsibility | Must not |
| --- | --- | --- |
| **ApplyEpoch** | Desired forest is the only writer of mon / TILE home (D039) | Entered-monitor rehome; interleave H1; D026 restore mid-apply |
| **Materialize forest** | Skeleton + bind existing + open **into slots** (PH / slot id) | Mon-root-only PlaceNext; invent a fourth PH kind |
| **Slot machines** | Per **slot** (window **or** tab/stack CON): place → in-slot hard → retry N=2 | Per-window machines for tab peers; TILE-anywhere as ready |
| **Forest match** | `Done.ok` iff every required TILE slot is in-slot (D041) | Focus-only verify as success; best-effort `ok` on hard-fail |
| **Focus once** | After all required slots terminal: open leaves + profile kbd | Focus during open/place |
| **Soft barrier** | Learned quiet; steal → pin restore + reset quiet | Soft-fix wrong mon / flat tabs |
| **Belt** | **Deleted** (SM6/D042) | `ensure_layout` after bind; belt-as-success |

Thrash mid-batch is **forbidden**. Multi-step work **inside one command** is fine
only if ordered as above. “Operator runs layout again” is **not** the design.

### Hard vs soft settle (D019)

| Kind | Meaning | Clock | Timeout |
| --- | --- | --- | --- |
| **Hard** | Required **in-slot** (TILE\|grab + desired mon + parent CON + ε rect). Timeout **retries place** (D040) | From our place act | First **5s**, retry **2s**, N=2 extra |
| **Soft** | Residual that often follows focus/move (focus steal, geometry noise) | From last act (apply or correct); quiet **resets** when a residual fires | Learned: max(last **10** residual-positive latencies) × **1.25**, floored/clamped; **first-ever** class/key uses a longer learning trial (~6s for focus) |

**Focus steal during the pin window is thrash, not “user intent.”** On layout
focus, the extension pins the intended open leaf for ~**15s** (aligned with the
soft wall cap—short pins expired mid soft barrier). If Meta activates a sibling
in the same TABBED/STACKED group, restore the pin (raise + lastTabFocus + tab
strip). Decoration mark the open leaf from **lastTabFocus**, not keyboard focus
alone (so the strip matches the visible content).

Heuristics file: `~/.config/forge/config/settle-heuristics.json` — **timings and
class keys only** (no titles, URLs, or personal role names).

| Layer | Entry points |
| --- | --- |
| Store / soft timeout math | `scripts/forge/settle_heuristics.py` / `lib/extension/settle-math.js` |
| Hard-ready / soft (product) | `lib/extension/layout-apply-settle.js` (ApplyLayout) |
| Thin CLI apply | `scripts/forge/layout_apply_client.py` → DBus `ApplyLayout` |
| Pin + meta-steal restore | `lib/extension/layout-open-leaf-pin.js`, `window.js`, `session-api.js` `_focusOp`, `action-pipeline.js` `afterFocus` / `revealGroupChild` (R026 adopt) |

### What we deliberately rejected

| Rejected approach | Why |
| --- | --- |
| Default whole-tree fingerprint quiet (LF6) before every residual | Can wait correctly but feels jumpy; keep **opt-in** (`--wait-tree-stable` / env) |
| “Sleep N ms then reassert focus forever” | Brittle across hosts; stacks forever; hides real structure bugs |
| Product branches for one person’s Chrome/Grok/Ghostty desk | Profiles are data; optional geom seeds are floors, not the product |
| Mode B / `FORGE_LAYOUT_POST_OPEN_RETRY` as cold happy path | Masks construction-order failure; Mode B = mid-session chaos; postOpenRetry env-only |
| Fixing wrong mon-children / missing bind with more waits | That is a **structure** bug—fix the spine, not soft timeout |

### Rules for future agents (FIRM)

1. **Name the phase** that broke before coding (skeleton \| open \| bind \| order \| size \| focus \| residual).  
2. **Fix that phase’s contract** so the failure class cannot recur; then **delete** the band-aid that only papered it.  
3. **No personal-layout product code.** Reproduce with abstract roles or profile JSON; never ship `if role == Grok`.  
4. **No new cold-path pass** without removing an obsolete one (or documenting why it stays).  
5. **Temporary** only if the operator **explicitly** asks for temp/stopgap.  
6. Unit-test pure helpers; **sign off layout** with the **partial reload matrix** below—not unit tests alone.  
7. Prefer **X11** for agent live tests (`./install` + HUP). **Wayland:** full loop in [testing.md](./testing.md) § Wayland live testing workflow — nest restart between installs; dual-mon on host.

### Code map (entry points)

| Concern | Where |
| --- | --- |
| Plan (Python dry-run / dump) | `scripts/forge/layout_plan.py` |
| Plan (product) | `lib/shared/layout-plan.js` `planReconcile` |
| Thin CLI apply | `scripts/forge/layout_apply_client.py` + `forge` `cmd_layout` |
| Apply spine | `lib/extension/layout-apply-run.js` + structure/open/settle bags; SM1+ adds epoch + slot machines |
| Heuristics store | `scripts/forge/settle_heuristics.py` / `forgeConfigDir()/settle-heuristics.json` |
| Open-leaf pin / meta-steal restore | `lib/extension/layout-open-leaf-pin.js`, `window.js`, `session-api.js`, `action-pipeline.js` |
| User-facing cold steps | [docs/user/layout.md](../docs/user/layout.md) |

---

## Project-specific rules

- Read `docs/dev/architecture.md` and `docs/dev/compat.md` before large Mutter/API changes.
- Keep signal disconnect / actor teardown disciplined on `disable()` and node removal.
- Prefer fixing root causes over silencing crashes.
- Do not re-run the upstream-vs-fork comparison unless the trees change materially.

### Tree child list (FIRM)

Child membership and order go through `Node` (`lib/extension/tree.js`):

| Use | Do not |
| --- | --- |
| `appendChild` / `insertBefore` / `removeChild` / `replaceChildren` | Assign `childNodes` or `parentNode` outside Node methods |

`replaceChildren(ordered)` is the replace/reorder primitive (session restore, mon order, hoist). Forest apply is `TreeSnapshot.applyMonitorSnapshot` (T6), not a new splice.

`Tree.split` wraps via `insertBefore` + `appendChild` (same window node). `swapPairs` reorders via `replaceChildren` / insert. Do not assign `childNodes`/`parentNode` to copy either.

### Dev testing (live install / Shell reload)

When agents run live tests that need install + Shell reload (`./install`,
`forge save-session-layout`, dual-mon thrash):

1. **Use a debug install** — `./install` / `make dev` set `production=false`.
2. **Turn logging on** before the run (otherwise `Logger` stays silent):

   ```sh
   gsettings set org.gnome.shell.extensions.forge logging-enabled true
   gsettings set org.gnome.shell.extensions.forge log-level 4   # INFO
   ```

3. **Reload path by session:**
   - **X11:** `killall -HUP gnome-shell` (or Alt+F2 → r).
   - **Wayland:** `forge nested restart` between code changes; dual-mon live on
     **host** desk. Full procedure: [testing.md](./testing.md) § Wayland live
     testing workflow and [HANDOFF](./HANDOFF.md) § Wayland extensive smoke loop.
4. **Session-layout file trace** (debug builds only): append-only log at
   `~/.config/forge/config/session-layout-trace.log` during restore / shield /
   rehome. Prefer this over journal guessing after HUP.
5. **Post-HUP collectors** (X11) must survive `killall -HUP gnome-shell` (`nohup` /
   background script writing under `/tmp/...`), then compare `forge tree`.
6. Do not rely on the user to re-layout windows for verification.

### Agent live E2E (most important)

**Do not treat unit tests alone as layout sign-off.** These partial reloads are
the **primary agent end-to-end bar** for the architecture above. Full procedure
and pass criteria: [HANDOFF.md](./HANDOFF.md) § Agent live E2E.

| # | Pre-state | Then |
| --- | --- | --- |
| 1 | **Ghosttys only** (all Chrome closed) | `forge layout dev` |
| 2 | **Left chrome + ghostty** (mon1 Chrome closed) | `forge layout dev` |
| 3 | **Right ghostty** (mon0 Chrome closed; mon1 ghostty+tabs) | `forge layout dev` |
| 4 | **Left ghostty + nautilus** | `forge layout t1` |

**Never close the agent’s Ghostty.** After each case on `dev`: mon0 TABBED open
leaf is the Grok window (not plain Chrome); mon1 open leaf is YouTube; structure
is not Mode-B thrashing; **agent windowId still in `forge tree`**.

### Git

Follow shellrc catalog **`git.md`** (composed into `AGENTS.md`): **no commit and no
push** unless the current user message **directly** asks. “Commit” means commit
only — never push unless they also asked to push. Session end / wrap-up does not
authorize either.
