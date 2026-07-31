# Design notes

Interesting “why” decisions for humans and agents. Not a changelog.

## Fork identity (EGO / jcrussell / luke)

Three layers that must not collapse:

| Layer | Meaning |
| --- | --- |
| **EGO / forge-ext** | Upstream SweetTooth install (`forge-ext/forge`) |
| **jcrussell** | Community base (`jcrussell/forge`) |
| **luke** | This product tree (`lukebmay/forge`) |

UUID stays `forge@jmmaranan.com` so installs replace in place. Lineage id
`luke` is stamped in `install-origin.json` and returned by
`forge_detect_lineage` when origin/git remote is lukebmay; version-name alone
still means “non-EGO git build,” with old stamps defaulting to `jcrussell`.

Preferred install path: `./install` / `forge install`. Low-level helpers:
`build-install.zsh`, `rebuild.zsh`, `migrate-from-ego.zsh`.

## Recovery architecture

**Why this section exists:** Overnight lock/wake thrash and extension HUP look
like one “windows all piled on primary” bug. They are not. Each layer below
catches a **different** failure mode. Stacking another debounce or second
snapshot “just in case” is how `window.js` grew safety nets without a map.

**Rule for agents:** document and extract (see codebase audit plan). Do **not**
delete shield / hold / richness, and do **not** merge the two monitor-resolve
policies, without a product redesign plus **live dual-head proof** on real
hardware. Inventory + task order:
[agents/plans/forge-codebase-audit.md](../agents/plans/forge-codebase-audit.md).

Detail for each mechanism lives in the sections that follow (H1, session
layout, T6, T7). This section is the **map** so those pieces stay complementary.

### How the nets compose

```text
                    ┌─────────────────────────────────────┐
  quiet render ──►  │ last-good homes WeakMap (frame+mon  │
                    │ + stableKey)                        │
                    └──────────────┬──────────────────────┘
                                   │
  workareas-changed ── debounce 300ms ──► soft rehome (H1)
         │                                  │
         │                         snapshotTree (T6) FIRST
         │                                  │
         │                         refresh T7 liveMap
         │                                  │
         │                         resolve mon: stableKey →
         │                           frame ∩ → remapped idx
         │                                  │
         │                         majority-align tab/stack
         │                                  │
         │                         move_to_monitor + reconcile
         │                                  │
         │                         restoreTreeIfNeeded (T6)
         │                           resolveTargetMonitor =
         │                           stableKey / majority
         │
  install HUP ── flush session-layout.json (richness + hold)
         │
  enable ── flat track ── portable match ── session restore
         │                    │
         │              resolveStrictMonitor (NO majority)
         │                    │
         │              rehome Meta+tree (retry) → applySnapshot
         │                    │
         │              raise DFS + focus
         │                    │
         │              seed last-good + shield ~3s
         │                    │
         └──── while shield: soft rehome REAPPLIES forest
               (does not snapshot thrash topology)
```

| Layer | Trigger | Policy | Why it stays |
| --- | --- | --- | --- |
| Last-good homes | quiet render | tree frame + mon + stableKey | H1 needs pre-thrash truth; Meta lies mid-burst |
| Soft rehome (H1) | `workareas-changed` settle | last-good geometry + T6 | dual-head thrash without full disk restore |
| T6 in-memory forest | soft rehome + `reloadTree` | full H/V/tabs/order/percents | topology survives rehome when Meta peels windows |
| T7 stableKey | thrash / renumber | fingerprint → current index | `moN` ids go stale after hybrid GPU renumber |
| Majority mon remap | **T6 only** (`resolveTargetMonitor`) | survivors’ mon / stableKey | rebuild cohort when `moN` is gone — **not** session |
| Session-layout disk | disable / install flush | portable match + **strict** mon | HUP wipes memory; different failure than thrash |
| Richness guard | save / flush | refuse thrash-flat overwrite | prevents last-good file becoming “all columns” |
| 12s save hold | post-enable | suppress auto-save | thrash after enable must not clobber disk |
| Session shield ~3s | post-restore | soft rehome **reapplies** forest | empty last-good + Meta peel after correct restore |
| entered-monitor suppress | thrash pending / restore / shield | ignore Meta rehomes | Meta shoves windows; tree must not follow mid-flight |

### Two monitor resolve policies (do not merge)

| Function | Module | When | Behavior |
| --- | --- | --- | --- |
| `resolveTargetMonitor` | `tree-snapshot.js` | T6 restore after thrash / reload | Prefer snapshot mon if survivors live there; else **stableKey**; else **majority** mon of survivors |
| `resolveStrictMonitor` | `session-layout.js` | session restore after HUP | Portable leaf → **exact** mon from disk match; **no majority** pile-up |

Majority is correct when in-memory survivors still know where they belong but
`moN` renumbered. Majority is **wrong** after HUP: Meta has already piled
windows; “where most windows currently sit” re-implements the bug. Merging
these into one helper without a product redesign will re-break one of the two
paths. Keep the dual API; share only trivial geometry/fingerprint helpers.

### Production path vs test/compat

**Production soft rehome uses T6 only** (`snapshotTree` → rehome →
`restoreTreeIfNeeded`). Layout-group snapshot APIs (outer STACKED/TABBED only)
remain for forge-bqa / older callers — **test and compat**, not the live thrash
path. Do not “simplify” soft rehome back onto layout-group.

### Do not remove without live dual-head proof

Shield, 12s save hold, and richness guard each closed a distinct race seen on
real dual-head (lock/wake, HUP, thrash-flat save). Unit tests cannot fully
substitute overnight hybrid-GPU thrash. Removing any of the three without
**live dual-head proof** is a regression waiting to ship.

### Timers / debounces (recovery-related)

| Timer | MS / notes |
| --- | --- |
| workareas settle | **300ms** — hybrid thrash often &gt;200ms |
| session-layout save debounce | 1500ms |
| session-layout save hold | **12s** mono after enable |
| session shield | **~3s** sliding; soft rehome reapplies forest |
| entered-monitor / home reconcile | idle coalesce during thrash/restore/shield |
| renderTree / reloadTree | idle coalesce / low |

Full inventory (queue, workspace, Wayland stack, keyboard resize, …) and
“justified?” notes:
[forge-codebase-audit.md § Debounce / timers inventory](../agents/plans/forge-codebase-audit.md#debounce--timers-inventory-libextension).
No orphan recovery timers found at audit time; keep teardown lists in sync when
extracting soft-rehome / session-restore modules.

### Raise / restack

**Why this section exists:** Z-order is not one API. Tab click, focus manager,
session restore, float-on-focus, and Wayland transient pins each solve a
different “window is buried / wrong layer” failure. Collapsing them into one
`raiseWindow(meta)` helper is an audit smell — fullscreen demotion and
`make_above` pins must stay separate (see forge-5l9b, forge-zo4, forge-jnfk).

**Rule for agents:** document call sites; at most a trivial `safeRaise(meta)`
try/catch if needed. Do **not** unify restack order, demotion guards, or
Wayland pin/unpin into that helper. Product bugs (e.g. `lastTabFocus` id
churn) are not raise-path cleanup.

#### Call sites (do not merge)

| Path | Where | What it does |
| --- | --- | --- |
| **Tab click** | `Node._activateFromTab` (`tree.js`) | `lastTabFocus` ← meta; `raise` + **`focus` + `activate`** (same as keyboard; activate-only failed on X11 after multi-mon); **immediately** `updateTabbedFocus` / `updateStackedFocus` + **`updateDecorationLayout`** (raise buries chrome; focus-update queue is deferred ~220ms and skips when focus did not change) |
| **Focus manager** | `FocusManager` (`focus.js`) | `updateStackedFocus`: set `lastTabFocus` + **raise focused only** (stable `childNodes` / label order — no `appendChild` reordering); `updateTabbedFocus`: raise focused leaf when parent is TABBED; pointer hover: `focus` + `raise` under cursor |
| **Session raise-after-restore** | `SessionLayoutRestoreManager.raiseAfterSessionRestore` (`session-layout-restore.js`) | DFS walk restored forest: `raise` each leaf, then `lastTabFocus` per CON; finally raise focused meta + tab/stack update so nothing stays buried under a sibling after HUP match |
| **RunSteps settle (WR14)** | `SessionApi._settleAfterRunSteps` (`session-api.js`) | After quiet batch render idle: `updateTabbedFocus` / `updateStackedFocus` per TABBED/STACKED CON (`lastTabFocus` or first tiled), then `updateDecorationLayout` so tab strips stay pickable after mass move/layout |
| **Float under fullscreen** | `window.js` focus `raise-float` queue + untiled rehome float raise | Raise focused float above tiles **unless** `node._aboveDemotedForFullscreen` — bare `raise()` undoes `_reconcileFullscreenFloatDemotion`’s `lower()` without setting `is_above()`, so the next demote pass never re-lowers it (forge-5l9b) |
| **Wayland stack timeout** | `Tree._activateWindowNode` (`tree.js`) | On Wayland, brief `make_above` + per-window **50ms** `_forgeStackTimeoutId` unpin so the window leaves the desktop layer; not a generic raise — keep cleanup on disable / destroy (forge-jnfk / forge-ph7f) |

Also raise (not policy centers): directional/cyclic focus via `_activateWindowNode`,
command keybinds (`command.js`), session DBus activate (`session-api.js`),
post-close focus (`window.js`). Same rule: call `raise` + existing tab/stack
helpers; do not invent a second restack pipeline.

**Focus deferred queue:** `focus-update` raises stack/tab **then** restacks
decoration/border (never decoration-first — a later `meta.raise()` buries chrome).

#### What must stay separate

| Mechanism | Why not “just raise” |
| --- | --- |
| **Fullscreen float demote** (`_reconcileFullscreenFloatDemotion`) | `unmake_above` + `lower` + `_aboveDemotedForFullscreen`; raise-on-focus must skip demoted floats |
| **`make_above` / always-on-top** | User pin vs Forge `_forgeSetAbove` vs Wayland **transient** pin (`_forgeTransientAbove`); suppress `notify::above` via `_withSuppressedAboveHandler` |
| **Decoration restack** | Tab strip actors above that CON’s windows (pickability) — not Meta.Window Z-order |

Local `raiseWin` in session restore is fine; optional shared `safeRaise` only
for null-safe try/catch duplicates. **Never** fold demote / `make_above` /
Wayland timeout into it.

**Tests:** `bug-tab-click-activate`, `bug-d5mm-focus-restack`,
`bug-5l9b-raise-float-under-fullscreen`, `bug-jnfk-wayland-focus-stacking`.

## Soft rehome on workareas thrash (H1)

**Map:** [Recovery architecture](#recovery-architecture) — this is the live
thrash path (T6 + last-good + entered-monitor suppress), not session disk.

**Problem:** Overnight GNOME auto-lock → wake (especially multi-monitor + GPU re-probe)
fires a burst of `workareas-changed` while Mutter may shove windows onto the
primary. Tree keys are `mo${index}ws${ws}`; if Forge eagerly follows
`window-entered-monitor` / `Meta.Window.get_monitor()` mid-thrash, every tile
piles under one monitor node and stays there after both heads return.

**Approach:**

1. On quiet renders, snapshot per-window **last-good**
   `{ monitorIndex, stableKey?, frame }` from the tree (not thrashy Meta).
2. On `workareas-changed` (with windows, no workspace add/remove), set a thrash
   pending flag and debounce (~300ms; hybrid GPU thrash often exceeds 200ms).
   While pending, ignore `window-entered-monitor` rehomes.
3. On settle: **snapshot forest first** (stableKeys from pre-refresh map), then
   refresh the T7 identity map, then resolve each window’s target monitor by
   **stableKey** → max intersection of last-good frame → remapped index → Meta.
4. **Tab/stack survival (T3):** majority-align outermost STACKED/TABBED members
   onto one target so `_containerFullyMigrates` moves the CON as a unit; dead
   siblings no longer block full migration.
5. **Full tree snapshot (T6):** before rehome, capture the forest (H/V + tabs +
   order + percent/`userSized` + window refs + optional mon `stableKey`). After
   reconcile, `restoreTreeIfNeeded` — skip intact mon topology (re-apply percents
   only), rebuild when flattened/peeled. Target mon is **remapped** via stableKey
   when `moN` is stale, else majority mon of survivors. `reloadTree` uses force
   `restoreTree` with a **fresh** snapshot around its own wipe.
6. `move_to_monitor` then one `_reconcileWindowHomes()` + restore + render.
7. If a target `moNwsW` node is missing → fall back to `reloadTree` (fresh
   snapshot inside that path).

While a **session shield** is active, soft rehome **reapplies the restored
forest** instead of snapshotting thrash topology (see session layout).

**Live proof (2026-07-24):** idle auto-lock + DPMS → unlock kept dual-head
placement and a two-window tab pair; retab after wake did not abort Shell.

**Related:** T7 stable output keys (`monitor-identity.js`); gdisplays owns
monitors.xml identity in shellrc — Forge does not import it.

**Tests:** `tests/regression/bug-h1-soft-rehome-workareas-thrash.test.js`,
`tests/unit/extension/tree-snapshot.test.js`, `monitor-identity.test.js`,
utils `bestMonitorIndexForRect`.

**Manual reproduce:** `scripts/forge/trigger-idle-lock.zsh` (short idle / DPMS);
manual Super+Delete is a weak control path.

## Session layout across install/update

**Map:** [Recovery architecture](#recovery-architecture) — disk portable path +
strict mon + richness/hold/shield; complementary to H1, not a replacement.

**Problem:** Shell HUP / extension reload wipes the in-memory tree. Flat
re-track + Mutter pile-up → full-height columns, lost tabs. After install HUP,
Mutter may also leave keyboard focus on the wrong window even when topology
restores.

**Approach:** Portable forest at `~/.config/forge/config/session-layout.json`
(leaves: id, pid, wmClass/title, frame, monitor; CONs keep `lastTabFocusId`).
Envelope also stores **`focusWindowId`** (the focused window at flush time).
Debounced last-good save; install flushes before HUP. On enable: match ≥50% in
order id → **unique class+title** → pid cohort (geometry + title boost) →
class cohort → unique class; **strict** mon rehome (`resolveStrictMonitor` —
**not** T6 majority). Child order in the portable forest is the tab/stack
chrome order; raise each CON’s `lastTabFocus` so the open leaf stays on top;
**activate** the resolved `focusWindowId` so keyboard focus survives
install/update. Richness guard + post-enable **12s** save hold protect
last-good. **Install/update is tree snapshot only** — never named `forge layout`
profiles. `./install` / `forge save-session-layout` only flush
`session-layout.json`.

**Tab/stack after install:** sibling order is forest `children[]` order (not
geometry rank). Matching must not scramble co-framed tabs — title-before-pid
geometry plus title boost on ties. `updateTabbedFocus` records `lastTabFocus`
(same as stacks) so the open item is current at flush. Because the focus-update
queue is deferred (~220ms), save/flush also **synchronously** pins each
focused window’s TABBED/STACKED parent `lastTabFocus` from Mutter focus before
portable serialize (SI1 — stale open leaf was Grok while Chrome had keyboard
focus). CLI GetTree fallback does the same, then writes `lastTabFocusId` /
`focusWindowId`.

**Focus must survive id churn + thrash shield:** Topology match uses full leaf
metadata, but `focusWindowId` / `lastTabFocusId` resolve via synthetic
`{ id }` leaves. After HUP, Meta ids often change — resolver looks up the
already-matched portable leaf with that *saved* id (`leafAssign`), not only
`byId`. Shield stores `focusMeta` and re-activates it on thrash reapply (not
Mutter’s post-HUP pick). Activate uses `get_current_time_roundtrip` +
`workspace.activate_with_focus` when available, then an idle retry after
`renderTree` so workareas thrash cannot keep the wrong tile.

## Layout profile focus + active tab/stack

**Problem:** `forge layout save` / apply restored structure (tab/stack groups,
mon order) but not *which* tab was open or which app should hold keyboard focus.
Users re-clicked the right tab after every load.

**Approach:** GetTree exports `lastTabFocusId` per CON and top-level
`focusWindowId`. Save emits optional sugar:

- `{ "tab"|"stack": […], "active": "Grok" }` — open leaf in that group
- top-level `{ "focus": "Grok" }` — keyboard focus after apply

**Multi-instance sugar (0-based):** bare token = first match; `n` = index into
the group content (active) or profile roles (focus); `["Grok", 1]` = 2nd token
match — **container-local** for `active`, **desk-wide** for `focus`. Explicit
role ids (`"Grok-2"`) still work. Save emits `[token, n]` when the open/focused
leaf’s token collides with a sibling (or another desk window for focus).
Normalize/validate desugar both to role id strings in IR so plan focus ops stay simple.

Plan appends `focus` actions (group actives first, then profile focus). Apply
maps them to RunSteps `focus` last so structure/order settle first. Tokens match
role id / open app / title fragment (same as cells).

**Same-pid multi-window (Ghostty):** titles churn; greedy leaf match could swap
or drop both on tied frames. Fix: forest-aware **global assignment**
(`assignByScore` + `geometryMatchScore` with −d²) in
`session-layout.js`.

**Post-restore soft-rehome race:** After HUP, `_lastGoodHomes` is empty (new
`Meta.Window`s). Meta thrash can peel a window after a correct restore; soft
rehome then `snapshotTree()` freezes broken topology. Fix: restore transaction +
seed last-good + **session shield** (~3s sliding) re-applying the restored
forest. Live agent loop confirmed dual Ghostty mon placement.

**Collapse percent trap:** single-child CON (e.g. VSPLIT wrapping one Ghostty)
must promote the **CON’s** mon-level percent on collapse; a sole child at
`percent=1` next to `TABBED percent=0` makes the terminal full-width and tabs
zero-width. `renormalizeChildPercents` also equalizes non-userSized siblings when
any share is zero.

**Tests:** `session-layout.test.js`, `tree-snapshot.test.js`, soft-rehome shield
regression. Dev builds append
`~/.config/forge/config/session-layout-trace.log` during restore.

## Tab strip clickability

**Problem:** Clicking group tabs sometimes did nothing until the user first
clicked the active window’s content.

**Cause (historical):** `updateDecorationLayout` stacked each CON decoration
`insert_child_below(global focus)`. When focus was elsewhere, the strip sat
under other actors and missed pointer picks. Tab handlers also only called
`activate()` without `lastTabFocus` / stacked restack.

**Fix (restack + reactive):** Restack each decoration **above that CON’s window
actors**; make the decoration/tab reactive; `_activateFromTab` sets
`lastTabFocus`, raises, activates, and calls `updateTabbedFocus` /
`updateStackedFocus`.

**LF2 residual (2026-07-29):** After layout apply / multi-mon focus, tab click
sometimes still did nothing until a **dock** click. Two holes:

1. Tab path used **`activate` without `focus`** while keyboard
   `_activateWindowNode` uses raise→focus→activate (needed on X11 stacking).
2. Tab path raised the window **without restacking chrome**; deferred
   focus-update (~220ms) never runs when focus did not change, so the strip
   stayed under the window actor. Hover also re-raised the already-focused
   window every ~16ms and re-buried chrome.

**LF2 fix:** `_activateFromTab` does focus+activate, unfreezes, restacks
decoration/border immediately; hover only focus/raises when the under-pointer
window differs from desk focus.

**Tests:** `tests/regression/bug-tab-click-activate.test.js`.

## Full in-memory tree snapshot (T6)

**Map:** [Recovery architecture](#recovery-architecture) — production thrash
backbone; mon resolve here is **majority/stableKey**, not session-strict.

**Problem:** Layout-group snapshot only kept outer STACKED/TABBED. Nested H/V
splits, sibling order, percents, and `userSized` died on `reloadTree` / thrash
rebuild even when windows rehomed correctly.

**Why full snapshot before disk:** Thrash recovery needs live `Meta.Window` refs
and current `moNwsW` parents — not EDID keys or a long-lived session file.
Portable session-layout.json is only for short-lived disable→enable; disk/layout
profiles can version a richer contract later.

**Approach:**

- Pure module `lib/extension/tree-snapshot.js` (`version: 1` forest of monitor
  descriptors → recursive CON/WINDOW). Tree thin-wraps (`snapshotTree` /
  `restoreTree` / `restoreTreeIfNeeded`); creates fresh `St.Bin` CONs on rebuild.
- **Target mon remap:** `resolveTargetMonitor` prefers the snapshot mon when
  survivors still live there; when `moN` is stale, **stableKey** (T7) before pure
  majority; else majority mon of survivors. Mixed mons (foreign windows) rebuild
  only the cohort in place; pure mon full-replaces. Empty CONs left on the
  abandoned mon are pruned. **Do not** fold this into session
  `resolveStrictMonitor`.
- Cohort rule: only windows under the resolved target mon that appear in the
  monDesc. Missing windows collapse (no single-child CONs). Mon-level and CON
  percents renormalized after collapse. No blanket `resetSiblingPercent` wipe.
- **Production soft rehome uses T6 only.** Layout-group APIs remain for
  forge-bqa / test-compat; capture/rebuild share the pure helpers (descriptors
  now include percent/userSized).
- LFT: after restore, re-touch focused tile when present.

## Stable monitor output keys (T7)

**Map:** [Recovery architecture](#recovery-architecture) — renumber survival for
last-good and T6 mon descriptors; gdisplays still owns monitors.xml.

**Problem:** Tree nodes and forest snapshots key monitors as `mo${index}ws${ws}`.
After hybrid thrash / connector renumber, the same physical head can get a new
index → soft rehome and T6 restore attach structure to the wrong monitor.

**Boundary (do not blur):**

| Layer | Owns |
| --- | --- |
| **gdisplays** (shellrc) | monitors.xml, EDID/vendor/serial, named scenes, connector remap |
| **Forge** | Window tree on **logical** outputs; best-effort stableKey → current index |

Forge must **not** import Python, parse EDID, or write monitors.xml.

**Approach:**

1. Pure `lib/extension/monitor-identity.js`: fingerprint live monitor fields into
   a stable string key; build `stableKey ↔ index` maps; remap old index through
   previous fingerprints.
2. **Key formats:** `conn:DP-1` (prefer connector from Shell layoutManager when
   present) → `name:…` → `geom:x,y,w,h[#primary]` (index only for collisions).
3. Thin capture via `MonitorManager.collectLiveMonitorsInfo` + optional
   `Main.layoutManager.monitors` fields; refresh on enable, soft-rehome settle,
   and `layoutManager::monitors-changed`.
4. T6 mon descriptors keep `id: moNwsW` and add optional `stableKey`.
   `resolveTargetMonitor` uses `findMonitorByStableKey` when index id is stale.
5. Last-good homes store `stableKey` so soft rehome survives renumber even when
   geometry intersection is ambiguous.

**Not done:** full EDID parity with gdisplays; disk session profiles / layout.

**Tests:** `tests/unit/extension/monitor-identity.test.js`, stableKey cases in
`tree-snapshot.test.js`.

## Daily-driver product locks (2026-07-24)

Dual taskforce analysis + user lock: [agents/plans/forge-layout-thrash-analysis.md](../agents/plans/forge-layout-thrash-analysis.md).
Execution: [agents/plans/forge-daily-driver.md](../agents/plans/forge-daily-driver.md).

- **Tab chrome:** empty reserved bar with missing labels is a bug (geometry reserved
  without tab actors), not “stack looks different from tabs.”
- **Stack mode available by default;** **tabbed** remains the default group type
  (DnD center, bare-array sugar `["a","b"]`, merge-group). Stacks use object sugar
  `{layout:stacked,content:[…]}` or stack↔tab / stack toggles.
- **STACKED chrome on GNOME 45–47:** `St.BoxLayout` only honored `.vertical`.
  Writing `.orientation` was a silent no-op, so stack title bars laid out as a
  **horizontal** strip at N× bar height (“tabbed but taller”). Fix:
  `Compat.setBoxOrientation` (`.vertical` pre-48, `.orientation` on 48+).
- **STACKED bar height:** each title is `stacked-tab-bar-height` (same as the
  tab strip), pinned with `set_height` — not `y_expand` over the full column
  (which could make every bar N× too tall).
- **STACKED label order is stable:** focus/click must not `appendChild` the
  focused leaf to the end (that shuffled chrome every time). Z-order is
  `raise()` + `lastTabFocus`; tree order is user/move order only.
- **HiDPI / fractional scale (black):** gdisplays scale **1.5** (3840→2560
  logical) with X11 framebuffer **2×** logical (5120). Meta rects are in that
  X space; `Utils.dpi()` = `St.ThemeContext.scale_factor` (**2**) converts logical
  settings (e.g. tab bar 35) → stage pixels. Do **not** multiply again by
  monitor scale 1.5 — that would double-count relative to Meta coordinates.
- **Sizing:** equal share until user resizes (flex-like *contract* later; no big-bang engine now).
  Implemented as `Node.userSized` + `new-window-size-policy` (`preserve`|`equalize`);
  min-size redistrib writes effective percents without marking user intent **unless**
  any sibling is already `userSized` (then stored percents stay put for save/load).
- **Layout sugar shares:** profiles carry optional `share` / `ratio` on
  `{hsplit|vsplit:…}`; save emits shares only for user-sized / unequal splits;
  apply runs RunSteps `size` after structure/order (moves reset sibling percents).
  Mid-paint `tree.apply` suppresses `window-entered-monitor` rehome so
  `move_resize_frame` does not redistribute a mon child to `percent=1` and
  corrupt intentional shares.
- **Keybinds first-class:** bare Super+ is user-space; Safe install defaults only;
  recommended **kits** (vim / i3) + save your own — not one-key-at-a-time exploration.
- **Debug overlay** opt-in, soon — for humans and agents; not permanent size chrome.

## Layout reshape phases (2026-07-28)

**Problem:** Full keyboard tiling needs split↔group conversion, nested structure,
and move-into-group — but H/V trees are visually ambiguous
(`hsplit(vsplit(A,B), vsplit(C,D))` vs `vsplit(hsplit(A,C), hsplit(B,D))`), and
casual “groupify this parent” dissolves nested units.

**Phase 1 (shipped):**

| Verb | Safe | Vim | Behavior |
| --- | --- | --- | --- |
| Group chrome cycle | `Ctrl+Super+g` | `Shift+Super+n` | **TABBED ↔ STACKED only**; no-op on H/V |
| Split orientation | `Ctrl+Super+s` | `Ctrl+Super+n` | H ↔ V only (no group exit yet) |
| Merge two windows | `Ctrl+Super+m` | `Shift+Super+m` | Last-active (or sibling) → tabbed group |
| Tab force (to/from split) | `Ctrl+Super+t` | `Shift+Super+t` | Existing LayoutTabbedToggle |

Groups today are **window-leaf bags** — chrome flip is lossless. CLI parity via
RunSteps: `layout-cycle` (axis `group`|`split`), `merge-group`, `float`.
Portable kits: `FORGE_KEYBIND_PROFILES_DIR` + `forge keybind backup|apply`.

**Phase 2–3 (active plan):** first-class containers — non-destructive layout
cycle, explicit group/ungroup, split chrome (focus ancestry + show-all + drag),
owning-split resize, monocle **removed**. Zoom + floating groups designed in,
built after. No BC obligation. Plan:
[agents/plans/forge-first-class-containers.md](../agents/plans/forge-first-class-containers.md).

**Float:** mode on the tree node (keeps slot). Re-tile = same parent. If parent
gone / invalid: park at end of last monitor (same soft-park policy as layout).

## Keybind kits (T5 + grammar)

**Problem:** Bare Super+ defaults steal launchers/GNOME; mixed Ctrl+Super vs
Shift+Super with no grammar; Super+arrows still felt user-space; GNOME Settings
never lists extension shortcuts.

**Approach:**

1. **Safe = install default only, not recommended.** Bare Super+ only for
   **`Super+Delete` lock**. Primary **`Ctrl+Super`**; secondary
   **`Ctrl+Shift+Super`** for twins.
2. **Shared rare chords:** lock `Super+Delete`; border `Ctrl+Super+b`; tiling
   master `Ctrl+Super+e`; always-float `Ctrl+Shift+Super+Space`. **Float:**
   Safe/Vim `Ctrl+Super+Space` (Ctrl-primary); i3 `Shift+Super+Space` (i3).
3. **Kits:** `safe` / `vim` / `i3`; apply → tweak → save under
   `keybinding-profiles/`.
4. **Conflict scan** + prefs banner; GNOME Settings never lists Forge binds.

**Grammar rule:** change modifier families only when two actions share a base key.

## Open-app placement: LFT MRU + dock sticky (OP1)

**Problem:** New windows jumped monitors (dock vs pointer vs restore geometry)
and stopped joining the selected tab group. A single `lastFocusedWindow` was
easy to poison with floats (Guake) and ignored per-monitor dock intent.

**Approach:**

1. **LFT MRU** (`lib/extension/lft-mru.js`): global ordered list of **tiled**
   nodes + per-monitor rings. Tile focus → move to front of both; destroy/float
   → drop. Floats never enter.
2. **Generic / terminal open:** home + attach from **global LFT** (not pointer).
   No LFT → mon 0 root.
3. **Dock open (when detectable):** sticky dock mon (`move_to_monitor` + short
   grace against re-home races); attach **LFT(m)** else mon root. Detection:
   `noteDockLaunch` / `_forgeDockMonitor`, plus best-effort `Shell.App`
   activate/open_new_window hook (skips overview).
4. **Insert:** LFT in TABBED/STACKED → insert after LFT; else aspect split of LFT
   rect (taller → VSPLIT, else HSPLIT).

### Tiny-pane → tab fallback (OP-opt)

**Problem:** Aspect-splitting a already-narrow LFT yields postage-stamp panes.

**Rule (opt-in):** After proposed 50/50 of LFT along the aspect axis, each
child’s width **and** height must be ≥
`max(min-edge px, floor(0.12 * min(workarea)), app min on that axis)`. Else
force-wrap LFT in a TABBED CON so the new window joins as a sibling tab.
Default **off** (`tiny-pane-tab-fallback-enabled`); min-edge default **320**.
Only on open-app aspect path — not manual split keybinds. Min-edge, not area
fraction (ultrawide-safe). Pure helper: `shouldTabInsteadOfSplit` in `lft-mru.js`.

`new-window-placement=window-actual` remains an escape hatch for restore geometry;
default path is LFT policy. `lastFocusedWindow` still exists for pointer helpers.

## Session DBus + `forge` CLI (FC0–FC5)

**Problem:** Scripts and `layout` need a stable control plane. E2E’s
`Shell.Eval` / `_forgeTestBridge` is fine for tests, not for production
scripting (Eval is disabled or unsafe on real sessions).

**Approach:**

1. **DBus on the session bus**, owned by the extension for its lifetime
   (including unlock-dialog — same reason the tree stays loaded):
   - Bus name: `org.gnome.Shell.Extensions.Forge`
   - Path: `/org/gnome/Shell/Extensions/Forge`
   - Interface: `org.gnome.Shell.Extensions.Forge`
2. **Methods:** `Ping()` health JSON (`ok`, uuid, versionName, `apiVersion`);
   `GetTree(options_json)` → plain-JSON forest (no live `Meta.Window` refs);
   **FC1:** `Focus(s)`, `Swap(s,s)`, `Move(s,s)` → `{ok:true}` or
   `{error, candidates?}`. **FC2:** `PlaceNext(options_json)` → one-shot
   place hint for the next matching map. **FC3:** `GetSetting` / `SetSetting`
   / `SettingsSave` / `SettingsLoad` for portable config-sync keys.
   **FC4:** `RunSteps(steps_json)` → freeze render, batch ops, one
   `renderTree("run-steps")`. Never throw across DBus.
3. **Pure projection** in `lib/extension/tree-query.js`; **selectors** in
   `lib/extension/tile-select.js`; **place hints** in `place-hint.js`;
   **settings allowlist/coercion** in `settings-control.js`; **step schema
   + dispatch** in `run-steps.js` (unit-tested); export glue in
   `session-api.js` + wire from `extension.js`.
4. **User CLI** `scripts/forge/forge` (`ping` / `tree` / `focus` / `swap` /
   `move` / `launch` / `get` / `set` / `settings save|load` / `run` /
   `run-steps` / **`layout`**) talks DBus via PyGObject or `gdbus` — distinct
   from `forge-ctl`.
5. **wm_class is case-insensitive** for `class:` selectors, PlaceNext match,
   and `forge launch --wm-class` wait. Meta often reports `Eog` while desktop
   ids look like `org.gnome.eog` / `eog` — exact match made PlaceNext miss and
   the window fell through to LFT attach on the wrong head.
6. **Launch wait annotates tree paths** in the CLI (`moNwsW/i/j…`). GetTree
   projection does not carry path; wait walks the forest so the result JSON
   can return `path` for scripts without a second Focus call.

### Tile selector grammar (FC1)

Shared by DBus + CLI (`parseSelector` / `matchWindows`):

| Form | Meaning |
| --- | --- |
| `focus` / `lft` | Focused Meta.Window / global LFT node (via live ctx) |
| `title:Exact` | Window title exact |
| `title~=substr` | Substring |
| `title~=/regex/flags?` | JS regex |
| `class:WmClass` | `wm_class` exact |
| `class:WmClass@mon` | Class on mon index / `moN` / `moNwsW` / stableKey / role |
| `path:mo0ws0/0/1` | Mon then child indices (`cN`/`wN` ok) |
| `id:N` | Meta window id |

Options: plain string, or JSON `{"selector":"…","first":true}`. **N>1** →
`error: ambiguous` + candidate list (title/class/path) unless `first`.

**Move semantics:** source must be WINDOW. Dest WINDOW → reparent **after**
dest in dest’s parent (not `swapPairs`). Dest CON/MONITOR (path) →
`appendChild` + `resetSiblingPercent`. **Swap** always uses `tree.swapPairs`.

### Launch + PlaceNext (FC2)

**Why a pre-map hint:** A CLI cannot reparent a window that does not exist
yet. `PlaceNext` queues a one-shot `{ wmClass?, monitor?, treePath?,
attachSelector?, expiresAt }` on the WindowManager. On `trackWindow`,
`_planOpenAppPlacement` **consumes** a matching hint (exact `wm_class`) and
overrides OP1 LFT home/attach. Default `forge launch` (no place flags) sets
no hint — OP1 LFT attach applies as usual.

**CLI:** `forge launch <app>` prefers `gio launch` / `gtk-launch` for
`.desktop` ids, else spawns argv. With `--monitor` / `--tree-path`, calls
`PlaceNext` before spawn, then polls `GetTree` for `--wm-class` unless
`--no-wait`. Already-mapped: `forge move` after wait (no PlaceNext).

**Ghostty exception (LF4):** Stock
`com.mitchellh.ghostty.desktop` runs
`ghostty --gtk-single-instance=true`. A second `gio launch` reuses that
process and often maps the new window onto mon0 next to the existing
instance — PlaceNext stem match alone cannot fix it. Layout open and
`launch_app` therefore spawn `ghostty --gtk-single-instance=false`
(argv) for Ghostty targets, still using the desktop only for
StartupWMClass wait hints. Residual move + optional belt re-plan remain
the safety net if Meta mon is still wrong.

**Open-then-stable-rehome (LF6):** Per-window TILE settle (LF5) is not
enough when Ghostty (or Meta) **moves itself** after first tile.
Reconcile apply when roles need open:

1. Extension steps for **already-present** tiles only.
2. **Open all** missing apps (launch + pin windowIds); no residual Move mid-open.
3. Wait until **GetTree fingerprint** is unchanged for N consecutive polls
   (`forest_stability_fingerprint` / `wait_for_tree_stable` in
   `layout_apply.py` — windowIds, modes, monitors, paths, CON layouts,
   `lastTabFocusId`).
4. **Then** re-plan with `role_pins` and apply residual moves/layout/order/focus
   in one batch.
5. Optional short second stable wait + belt move pass if just_opened still
   wrong mon.

Fingerprint thrash, not wall-clock alone, is the gate: rehome only after
the forest stops changing.

`apiVersion` in Ping is **5** once RunSteps exists (was 4 with settings;
was 3 with PlaceNext; `TREE_QUERY` stays 1 as `queryApiVersion`;
tile-select grammar still version 2).

### Settings get/set + named profiles (FC3)

**Why not raw dconf:** Only portable keys from `SETTINGS_KEYS` /
`KEYBINDING_KEYS` (+ string kbd keys) are scriptable — same surface as
config-sync export/import. Unknown keys fail closed.

**Ambiguous names:** `focus-border-toggle` exists on both schemas; plain
key errors with “use `settings:…` or `kbd:…`”.

**Profiles:** `~/.config/forge/profiles/<name>/{settings,keybindings}.json`
— full portable snapshot via `ConfigSync.buildPortableProps` /
`applyPortableProps`, not a second settings store. Distinct from
keybinding-only kits under `config/keybinding-profiles/`.

### RunSteps + freezeRender (FC4)

**Why batch:** Scripts (and `layout`) issue many focus /
move / layout / set ops. Per-op `renderTree` flickers and races. One
freeze for the whole batch, one render at the end.

**Payload:** JSON array of `{ "op": "…" , … }` or
`{ "steps": [...], "stopOnError": true }`. `stopOnError` defaults true;
on failure returns `{ ok:false, stoppedAt, results:[{ok|error,index}…] }`
without throwing on DBus.

**Extension ops:** `ping`, `focus`, `swap`, `move`, `layout`
(absolute `tabbed|stacked|hsplit|vsplit`), `place-next`, `set`. Quiet
cores skip mid-batch unfreeze/`renderTree(force)`.

**CLI-only ops:** `launch`, `wait-window`, `wait` never enter the
extension — process spawn and window-appear polling stay in
`scripts/forge/forge`. `partitionMixedSteps` (JS) and
`partition_mixed_steps` (Python) split scripts into extension vs CLI
chunks. **`forge run-steps`** stays extension-only (rejects launch/wait).
**`forge run`** and **`forge layout`** interleave: each CLI chunk runs
in-process; each extension chunk is one DBus `RunSteps` (one freeze/render).

### Layout profiles (FC5 → FC6 reconcile; was workon)

**Problem:** Morning setup is still glue (`gdisplays load` + several
`forge launch` + layout/focus). FC0–FC4 are the primitives; FC5 is a
**named profile** that composes them without a new DBus method.

**Why not shellrc domain `workon`:** shellrc already owns `workon` for other
domains (`t`/`e`). The tiling command is always **`forge layout`**.

**FC5 (shipped):** `~/.config/forge/layout/<name>.json` schema `version: 1`
imperative `steps[]`. Fine for one-shot scripts; **wrong daily default** —
re-running doubles apps (live trial, 2026-07-26).

**FC6 / WR1–WR3:** desired-state **reconcile** — roles + layout shape;
match/claim existing tiles; launch only gaps; park overflow; no kill.
Host-scoped profiles in **shellrc** user-space (like gdisplays):

```text
$shellrc/configs/forge/layout/hosts/<hostname>/<name>.json
$shellrc/configs/forge/layout/common/<name>.json
~/.config/forge/layout/<name>.json          # XDG fallback
```

**Why a pure planner first:** Shell thrash and launch side effects make
round-trip testing expensive. `layout_plan.py` takes a GetTree forest +
v2 profile → actions with **no DBus**, so doubled/empty/perfect cases are
plain unit fixtures. Claim set is global (one window per role); extras
park, never kill. MVP “home” for a role is **correct monitor index** for
its slot — executor moves to `path:moNws0`.

**Structure repair (2026-07-27):** same-mon is not enough. Multi-role
`tabbed`/`stacked` slots must share a CON parent with that layout. After a
cold open, apps land flat under the mon → residual replan used to say
“nothing to do.” Planner now counts `structure`, attaches `windowIds` to
`ensure_layout`, and apply folds them: `layout tabbed` on the anchor
(wraps under mon) + `move` siblings into it. Prefer **path mon** over
lagging meta `monitor` after Move.

**Cross-mon Move must touch Meta (2026-07-27):** session-api `Move` used to
only reparent the tree. Dual Ghostties planned “move mon1” but both stayed
visually on mon0 because `get_monitor()` never changed. After reparent,
call `safeMoveToMonitor` so Mutter agrees; optional `position: start`
prepends under a MONITOR (profile mon1.term left of comms). Apply runs
placement moves **before** mon-level ensure_layout. Mon hsplit anchors are
**term tiles only** — selecting chrome inside a tab CON rewrote that CON
to HSPLIT and broke groups.

**Executor (WR3):** `forge layout <name>` resolves host path, branches
schema, then either imperative steps or reconcile:

| Mode | When |
| --- | --- |
| **reconcile** | `version: 2` + `roles[]`, or `mode: reconcile` |
| **steps** | `version: 1`, `mode: steps`, or `steps[]` without roles |
| **force** | `--force-launch` → steps only (errors if no `steps[]`) |

Reconcile apply: optional displays/settings → GetTree → `plan_reconcile` →
extension `move`/`layout` for existing tiles → **open all** gaps → wait
**tree stable** (LF6 fingerprint) → residual rehome batch (+ optional belt).
`--dry-run` prints counts + plan JSON (`dryRun: true`) with no mutations.
`--tree-file` feeds a forest offline for dry-run tests. Pure apply helpers:
`layout_apply.py`.

**CLI UX (WR5+):** `list` is this-host only (Name + Description table on TTY;
JSON `[{name,description}]` when piped). dry-run / apply / show share
`host=… profile=… source=… path=…` headers. Colorized
`forge help` / `forge layout help` explain acronyms and profile defaults.
Profiles are user JSON only — no app/host hardcoding in Forge. Human
shorthands: string `match`/`open`, default mon `hsplit`, multi-role
`tabbed`, omit `version`/`mode` when `roles[]` present. User guide:
[docs/user/layout.md](user/layout.md).

**Compact tiles sugar + marginal coexist (product locks 2026-07-27):**

Humans should not write a roles essay for a named desk. Preferred
authoring is nested lists of app names. **Interim** form still uses
`tiles` + `monN` keys and optional flat Chrome cells; **target** is a bare
array (no `tiles` / no `mon0`) so a dual-mon desk is just:

```json
[
  [ ["google-chrome", "Grok"], "ghostty" ],
  [ "ghostty", ["YouTube", "Gmail", "Google Voice"] ]
]
```

**Layout sugar containers + mon binding (2026-07-29):** medium keys on save
(`tab`/`stack`/`hsplit`/`vsplit`); load accepts short/medium/long aliases
(`t`/`h`/`v`/`s`, …). Bare array = **implicit** mons (live mon count;
offline dual only when every top-level item is a list). Explicit `mon0`/`mon1`
or `monitors: [[],[]]` never folds heads together. `forge layout save
--monitors` writes mon keys.

String cells: open by desktop/PATH; match inferred from app Name / chrome
heuristics (plan: [forge-layout-sugar.md](../agents/plans/forge-layout-sugar.md)).
Object `tiles` / `floating` only when needed. Malformed structure: load what
you can, park leftovers safely. **Description** is optional cosmetics:
auto one-liner (`mon0 (hsplit): tabgroup, ghostty. …`) for `list` when
missing; interactive save shows magenta **Current Description:** (value
only, never the word “Description” in the value) then **Keep, Edit (K/e):**
(default Keep). Edit opens **New Description:** with that current value
prefilled — never required to load.

Arrays under a mon are panes (order = spatial order). Nested arrays are
tab groups. Bare strings are single-app panes. **Split** is inferred
(wider-than-tall → horizontal; override `"split": "h"` / `"v"`). **Tabbed**
is inferred when a pane has ≥2 apps. Role ids auto-de-dupe. Nested
`{ split, content }` (or nested arrays) cover a v-split under an h-split
without a second schema.

Sugar **desugars** into the existing v2 IR (`roles[]` + `layout`). One
planner, two spellings — rehome/claim/structure repair stay on IR.

**Marginal windows** default to **coexist** + **leave residuals**: companions
already living in a layout slot stay; true residuals **stay put** (no
cross-mon park thrash). Opt-in `marginal.residual: "park"` soft-parks onto
the last claimed role window (move onto that id — never mon0 root dump).
Close is never default; opt-in `forge layout --clean` closes only true
residuals (Meta delete, never process-kill; `--clean --force` skips
can_close veto). Each slot is a **logical** group; the live tree still
collapses single-child CONs, so a lone Ghostty is not forced into lonely
tab chrome until a second member appears.

**Zero thrash (P0):** Containers are **HSPLIT | VSPLIT | TABBED | STACKED**
(H/V nest). Mode change is **non-destructive** (`setLayout` / I1): no silent
flatten of nested CONs, no percent wipe on toggle (C1; explicit ungroup is
C2). **Sane desk:** re-seat roles and **tab marginals** (non-role windows)
into the profile **view area** they overlap (partial → first view) so
`layout` cleans the desk. **Detected thrash:** roles only + soft-park
everything else on last mon last group — no archaeology. Profile ensure may
still reshape structure deliberately; user toggles must not. CLI:
`plan.thrashState` + stderr mode A/B; `--safe` is open+move only.
**Single-role view + nested H/V companions** (Ghostty with Nautilus/FB/Chess
under VSPLIT or nested CON) is **Mode A** — not thrash; collect by mon-child
containment + tab the view. Nested-split thrash only for **multi-role
tabbed** views. Plans: thrash-zero (historical) +
[first-class containers](../agents/plans/forge-first-class-containers.md).

**Quiet apply:** default `forge layout` prints human counts on stderr;
full plan/apply JSON only with `--verbose` / `FORGE_VERBOSE=1` (and on
errors / `--dry-run`).

Plan: [agents/plans/forge-workon-reconcile.md](../agents/plans/forge-workon-reconcile.md).

| Field (v1 steps) | Role |
| --- | --- |
| `displays` | Optional string → `gdisplays load <name>` (hard fail + install hint if binary missing) |
| `settings` | Optional string → DBus `SettingsLoad` |
| `stopOnError` | Default **true** |
| `steps` | Same ops as FC4 extension + CLI `launch` / `wait` / `wait-window` |

**Order (v1):** validate → displays → settings → partition steps → CLI/extension
chunks. Pure helpers: `scripts/forge/layout_lib.py`.

**Non-goals:** full i3 layout restore, GUI recorder, disk session-layout as
layout profiles, shadowing shellrc domain tools, killing surplus windows (park only).

### CLI on PATH (`~/.local/bin/forge`)

**Problem:** Daily use of `forge tree` / `layout` / `install` should not require
`cd` into the clone or PATH'ing `scripts/forge/`.

**Approach:** `./install` (and any path that writes install-origin) symlinks
`~/.local/bin/forge` → `$repo/scripts/forge/forge`. Source of truth stays in the
git tree (`layout_lib.py` is a sibling import). Uninstall removes that path
**only when forge-owned** (symlink into `…/scripts/forge/forge` or a marked
wrapper) so a foreign `forge` binary is never deleted. Origin stamp is kept so
`forge install` can reinstall after uninstall.

**Why not copy into bin:** the CLI is a multi-file Python entry; a bare copy
breaks imports. **Why not PATH the repo:** multiple clones and moves make that
ambiguous; XDG user bin is the stable entry.

## User stylesheet vs `make dev` (production flag)

**Problem:** `make dev` sets `production = false` for logging / DEV banner.
Historically `ExtensionThemeManager` loaded only the **bundled** `stylesheet.css`
in that mode, so `~/.config/forge/stylesheet/forge/stylesheet.css` (real colors)
never applied after a debug install — looked like “need a reboot.”

**Approach:** Always prefer the user profile stylesheet when present; keep
`production` for logger level and prefs Logger group only. Live reload:
`css-updated` gsettings, Super+Shift+r (`ConfigReload` re-imports CSS), or
`scripts/forge/reload-theme.zsh`.
