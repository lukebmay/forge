# Design notes

Interesting “why” decisions for humans and agents. Not a changelog.

## Soft rehome on workareas thrash (H1)

**Problem:** Overnight GNOME auto-lock → wake (especially dual 4K + hybrid GPU)
fires a burst of `workareas-changed` while Mutter may shove windows onto the
primary. Tree keys are `mo${index}ws${ws}`; if Forge eagerly follows
`window-entered-monitor` / `Meta.Window.get_monitor()` mid-thrash, every tile
piles under one monitor node and stays there after both heads return.

**Approach:**

1. On quiet renders, snapshot per-window **last-good** `{ monitorIndex, frame }`
   from the tree (not thrashy Meta).
2. On `workareas-changed` (with windows, no workspace add/remove), set a thrash
   pending flag and debounce (~300ms; hybrid GPU thrash often exceeds 200ms).
   While pending, ignore `window-entered-monitor` rehomes.
3. On settle: resolve each window’s target monitor by **max intersection area**
   of last-good frame with current monitor geometries.
4. **Tab/stack survival (T3):** majority-align outermost STACKED/TABBED members
   onto one target so `_containerFullyMigrates` moves the CON as a unit; dead
   siblings no longer block full migration.
5. **Full tree snapshot (T6):** before rehome, capture the forest (H/V + tabs +
   order + percent/`userSized` + window refs). After reconcile,
   `restoreTreeIfNeeded` — skip intact mon topology (re-apply percents only),
   rebuild when flattened/peeled. Target mon is **remapped** to where the
   surviving cohort currently lives (majority mon) so empty snapshot-mon
   cohorts still regroup mon-agnostically (layout-group style). `reloadTree`
   uses force `restoreTree` with a **fresh** snapshot around its own wipe —
   not the soft-rehome capture.
6. `move_to_monitor` then one `_reconcileWindowHomes()` + restore + render.
7. If a target `moNwsW` node is missing → fall back to `reloadTree` (fresh
   snapshot inside that path).

**Live proof (2026-07-24, black):** idle auto-lock + DPMS → unlock kept dual-head
placement and a two-window tab pair; retab after wake did not abort Shell.

**Not done here:** stable EDID/connector IDs (H2/M1 if still needed), gdisplays
connector remap (shellrc), session layout apply / disk (T7).

**Tests:** `tests/regression/bug-h1-soft-rehome-workareas-thrash.test.js`,
`tests/unit/extension/tree-snapshot.test.js`, utils `bestMonitorIndexForRect`.

**Manual reproduce:** `scripts/forge/trigger-idle-lock.zsh` (short idle / DPMS);
manual Super+Delete is a weak control path.

## Full in-memory tree snapshot (T6)

**Problem:** Layout-group snapshot only kept outer STACKED/TABBED. Nested H/V
splits, sibling order, percents, and `userSized` died on `reloadTree` / thrash
rebuild even when windows rehomed correctly.

**Why full snapshot before disk:** Thrash recovery needs live `Meta.Window` refs
and current `moNwsW` parents — not EDID keys or a session file. Disk/workon
(T7+) can version the same descriptor later; shipping disk first would freeze
the wrong contract.

**Approach:**

- Pure module `lib/extension/tree-snapshot.js` (`version: 1` forest of monitor
  descriptors → recursive CON/WINDOW). Tree thin-wraps (`snapshotTree` /
  `restoreTree` / `restoreTreeIfNeeded`); creates fresh `St.Bin` CONs on rebuild.
- **Target mon remap:** `resolveTargetMonitor` prefers the snapshot mon when
  survivors still live there; otherwise majority mon of survivors. Mixed mons
  (foreign windows) rebuild only the cohort in place; pure mon full-replaces.
  Empty CONs left on the abandoned mon are pruned.
- Cohort rule: only windows under the resolved target mon that appear in the
  monDesc. Missing windows collapse (no single-child CONs). Mon-level and CON
  percents renormalized after collapse. No blanket `resetSiblingPercent` wipe.
- Layout-group APIs remain for forge-bqa callers; capture/rebuild share the pure
  helpers (descriptors now include percent/userSized).
- LFT: after restore, re-touch focused tile when present.

## Daily-driver product locks (2026-07-24)

Dual taskforce analysis + user lock: [agents/plans/forge-layout-thrash-analysis.md](../agents/plans/forge-layout-thrash-analysis.md).
Execution: [agents/plans/forge-daily-driver.md](../agents/plans/forge-daily-driver.md).

- **Tab chrome:** empty reserved bar with missing labels is a bug (geometry reserved
  without tab actors), not “stack looks different from tabs.”
- **Stacking off by default;** tab-first; convert stack↔tab keeps the group; ungroup separate.
- **Sizing:** equal share until user resizes (flex-like *contract* later; no big-bang engine now).
  Implemented as `Node.userSized` + `new-window-size-policy` (`preserve`|`equalize`);
  min-size redistrib writes effective percents without marking user intent.
- **Keybinds first-class:** bare Super+ is user-space; Safe install defaults only;
  recommended **kits** (vim / i3) + save your own — not one-key-at-a-time exploration.
- **Debug overlay** opt-in, soon — for humans and agents; not permanent size chrome.

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
   rect (taller → VSPLIT, else HSPLIT). No tiny-pane auto-tab in V1.

`new-window-placement=window-actual` remains an escape hatch for restore geometry;
default path is LFT policy. `lastFocusedWindow` still exists for pointer helpers.

## User stylesheet vs `make dev` (production flag)

**Problem:** `make dev` sets `production = false` for logging / DEV banner.
Historically `ExtensionThemeManager` loaded only the **bundled** `stylesheet.css`
in that mode, so `~/.config/forge/stylesheet/forge/stylesheet.css` (real colors)
never applied after a debug install — looked like “need a reboot.”

**Approach:** Always prefer the user profile stylesheet when present; keep
`production` for logger level and prefs Logger group only. Live reload:
`css-updated` gsettings, Super+Shift+r (`ConfigReload` re-imports CSS), or
`scripts/forge/reload-theme.zsh`.
