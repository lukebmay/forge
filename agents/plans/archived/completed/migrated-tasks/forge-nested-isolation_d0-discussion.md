# forge-nested-isolation_d0-discussion — Nest isolation strategies

**Status:** done (design locked 2026-08-10)  
**Plan:** implement → [forge-nested-isolation.md](../../plans/forge-nested-isolation.md) · related [forge-wayland-rc-test-suite.md](../../plans/forge-wayland-rc-test-suite.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Decision log:** [D022](../../docs/DECISIONS.md) (nest testing model)

## Goal

**Discussion only** — agree how to isolate nested Wayland Forge tests from the
host session so nest work does not thrash host Chrome, dock, single-instance
apps, or shared D-Bus/session state. Capture options, tradeoffs, and a
**recommended path** before any isolation implementation.

Also in scope for the same conversation: **shutting down extensions** cleanly
in nest (and whether host extension state is affected).

No isolation code in this task. Follow-up implement tasks only after user lock.

## Why now

- Nest dual-mon RC works for ghostty/layout smoke, but nest Chrome / host dock
  can crash or fight (single-instance, shared profile, mis-exported bus).
- Agents leave nests running → CPU/RAM + orphan session buses (mitigated by
  **FIRM** `forge nested stop` after tests — still need better isolation when
  nest *is* up).
- Practical isolation is the next product-facing nest investment.
- Primary pain: **logout/login loops** for extension JS retest on Wayland.

## User locks (2026-08-10)

| # | Topic | Lock |
| --- | --- | --- |
| 1 | Nest purpose | **Maximal value / least work.** Nest exists to avoid host logout loops when iterating extension code. Tight code→install→nest retest loop; less handoff noise/tokens. Not a purity goal of “full L1 in nest.” |
| 2 | Isolation strategy | Same maxim: ship the isolation that unblocks value without heavy infra. |
| 3 | Separate UNIX user | **User deferred to agent decision.** See **Recommended path** — **no separate user for v1**. |
| 4 | Data / host identity | Nest is a **separate logical host** (e.g. `black-sub-01`). Do **not** share settle heuristics with parent. CLI + env overrides for forge data locations (CLI and extension). |
| 5 | Ops / geometry | Nest mons may be smaller / lower scale (visibility OK, not primary). **Auto stop + cleanup** after nested tests — no residual mess for operator. **Only nest when a code/test loop needs extension reload.** Small tests with no code change → **host parent session**. |
| 6 | Nest monitor count | **Default single mon.** Dual (or more) dummy mons only when the case under test is dual-mon behavior. Do not start `--monitors=2` for generic extension reload / single-desk smoke. |

## Recommended path (locked)

### Nest role (value model)

| When | Where |
| --- | --- |
| Extension JS changed → need reload without host logout | **Nest** (`./install` + `forge nested restart`) — **default `--monitors=1`** |
| Dual-mon structure / multi-mon claim / cross-mon behavior | **Nest** `--monitors=2` (or N) **only if that is what is under test**; size may be reduced |
| Single-desk structure / open / focus retest (not mon topology) | **Nest single mon** — do not pay dual-mon setup cost |
| No code change; smoke / one-shot layout on real desk | **Host parent only** — do not start nest |
| Chrome open-leaf / real dual-4K geometry RC authority | **Host** L1 (until nest chrome isolation is proven) |
| True cold / close-all-tiles | Host + Guake/float or durable Grok leader |

**A2-ish, value-first:** nest is the **retest harness + dual-mon structure loop**, not a full substitute for host chrome RC until data isolation is proven.

### Isolation v1 — no separate UNIX user

| Layer | v1 approach |
| --- | --- |
| Display + session bus | Already private (keep; env hygiene FIRM) |
| Forge **host id** | Nest clients: `FORGE_HOST=<hostname>-sub-<nestname>` (e.g. `black-sub-forge`) |
| Forge **data root** | Nest-scoped config/state under nest state dir (or `FORGE_*` overrides); **not** parent `~/.config/forge` mutators |
| Heuristics | Separate file/namespace by host id — parent heuristics never written from nest |
| Layout profiles | Read shared tree (`layout/`, `FORGE_LAYOUT_DIR`) — profiles are fixtures, not host timing |
| Apps in nest | Prefer ghostty / nautilus / `_forge-test-*` **without** host single-instance chrome until profile isolation exists |
| Extension enable | Nest bus only; **host extension enablement untouched** on nest stop |
| Disk extension UUID | Still shared install path (tip on disk) — intentional for retest; host in-memory code updates only on logout |
| Lifecycle | Campaign wrappers: start → run → **always** stop + cleanup; no orphan bus/pids |
| Separate UNIX user | **Rejected for v1** (setup/polkit/agent cost; nested embed still under host compositor). **Escalate** only if v1 still taints parent after data-root isolation |

**Why not test user first:** most taint is **shared HOME config + single-instance apps**, not UID. Fixing data roots + env + auto-cleanup captures most value; a second user does not remove “embed nest window on host Wayland” complexity and adds login/gdm/polkit surface.

### Extension shutdown

| Action | Rule |
| --- | --- |
| Nest start | Enable Forge on **nest** bus only (existing path) |
| Nest stop | Kill nest Shell + private bus; **do not** disable/reconfigure host Forge |
| Nest-exported shell | Never run host desk mutators; prefer `forge nested exec` |
| Host from nest env | Forbidden — wrong bus/display |

### Ops productization (implement follow-ups)

1. **Auto stop/cleanup** — any nested test entry (`forge nested exec`, future `forge test live --nested`, campaign helper) guarantees stop on exit (success or fail); `status` → not running; stale pid/bus reaped.
2. **Nest only when needed** — agents: if no extension JS change this iteration, stay on host.
3. **Default nest geometry** — **1 mon** unless the case needs multi-mon; smaller than host primary OK (e.g. scale 1, reduced WxH); when dual is needed, dummy mons side-by-side.
4. **Data overrides** — document + implement CLI/env for forge config root (CLI first; extension reads same root via nest Shell env / GLib user config isolation as needed).

## Options table (filled)

| Option | Verdict | Why |
| --- | --- | --- |
| **A. Env hygiene** | **Keep (FIRM)** | Cheap; prevents bus/display footguns; insufficient alone |
| **B. App allowlist (nest)** | **Keep as default practice** | Ghostty-class RC high value, low thrash; chrome deferred |
| **C. Separate UNIX user** | **Reject v1; escalate later** | High setup; not needed if data root isolated |
| **D. Home/profile / data root namespace** | **Do in v1** | Core anti-taint; nest = separate logical host |
| **E. bubblewrap** | **Reject v1** | Heavy; may break Shell embed |
| **F. Extension unload (nest-only)** | **Keep semantics** | Nest bus enable; host untouched |
| **G. Hybrid A+B+D+F + auto-cleanup** | **v1 path** | Max value / least work |

## Success metrics

- Host Chrome/dock undisturbed during nest ghostty dual-mon layouts.
- Nest mutators do not rewrite parent settle-heuristics or windows.json.
- Agent checklist short; nest campaigns leave `running: False` without manual cleanup.
- Code/test loop: install → nest restart → case → stop, without host logout.
- No-code smokes stay on host (no nest spin-up tax).

## Out of scope for D0

- Implementing useradd / bubblewrap / profile dirs.
- Changing cold spine or live matrix case logic (except docs after implement).

## Acceptance

- [x] Options table filled with **recommendation + rejected paths + why**
- [x] Explicit **user lock** on default isolation path (and whether separate
      test user is required for v1) — **no test user v1**
- [x] Explicit lock on **extension shutdown** behavior (nest-only vs host)
- [x] Follow-up implement task(s) drafted only after lock (below)
- [x] No isolation product code required for D0 completion

## Follow-up implement tasks (draft — not started)

| Id | Goal |
| --- | --- |
| **N1** | Nest client env: `FORGE_HOST=<host>-sub-<name>`; nest-scoped config/state dirs; wire CLI readers |
| **N2** | Extension + nest Shell: honor same data root (env / XDG_CONFIG_HOME under nest state) so JS does not write parent `~/.config/forge` |
| **N3** | Auto stop/cleanup: `exec` and any nested live runner always stop nest; stale reaper; agent rules |
| **N4** | Docs: testing.md / HANDOFF / RC suite — nest role, when-not-to-nest, dual-mon, stop FIRM, host-id |
| **N5** (optional) | Chrome-in-nest only after N1–N2: separate user-data-dir; else keep host L1 for chrome |

## Context for the next agent (complete + succinct)

- Nest CLI: `scripts/forge/nested_wayland.py` · `forge nested start|stop|status|env|exec`
- Already: private bus + display; `--monitors=2`; stop-after-tests FIRM
- Heuristics host key already: `FORGE_HOST` in `settle_heuristics.py` / `layout_lib.py`
- Profiles for matrix: only `_forge-test-*`
- Proven: dual-mon nest + `_forge-test-ghosttys`; chrome-from-nest painful
- Related suite: `agents/plans/forge-wayland-rc-test-suite.md`
- **Next:** implement N3→N1→N4→N2 — plan `agents/plans/forge-nested-isolation.md` (P0)

## Session note

**2026-08-09:** Task opened; isolation strategies discussion; nest stop FIRM.

**2026-08-10:** Design locked with user. Nest = maximal-value retest (avoid logout
loops); separate logical host data; no UNIX test user v1; auto cleanup; nest only
for code/test loop; host for no-code smokes. **Default nest mon count = 1**; dual
only when testing dual-mon behavior. D022 recorded. D0 complete.
