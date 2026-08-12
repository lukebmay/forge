# Layout / open-app regressions

**Purpose:** stop re-fixing the same dual-mon bugs without a durable record.
When a live failure repeats a known class, **add a unit test that fails without
the fix**, then a row here. Plan session notes are not enough.

| ID | Date | Symptom | Root cause | Fix | Guard test(s) |
| --- | --- | --- | --- | --- | --- |
| R001 | 2026-08-06 | mon0 tab shows Chrome not Grok | belt `ensure_layout` anchors first id; stomps lastTabFocus | D016 preserve lastTabFocus + D014 belt no structure | `session-api-layout-cycle` layout TABBED re-affirm; `belt_actions` pin-moves-only |
| R002 | 2026-08-08 | same after cold open | mid-flight focus before chrome map; late activate steals | D017 focus + verify-once on lastTabFocus mismatch | `focus_actions_still_needed`; final focus verify in CLI |
| R005 | 2026-08-08 | cold X11: Chrome over Grok; wrong tab selected | first focus sticks then chrome/PWA late activate rewrites lastTabFocus; tab-active followed kbd not open leaf | D018 pin+restore; tab-active=lastTabFocus; SE5 pin 15s; SE3 soft barrier | `layout-open-leaf-pin`; `run_soft_focus_barrier`; `focus_actions_still_needed` |
| R006 | 2026-08-09 | fixed 250–2s reassert brittle across host speeds | soft residual not modeled; Meta has no settle ACK | D019 hard-ready 5s + soft barrier from settle-heuristics + post-settled verify once | `run_soft_focus_barrier`; `wait_until_hard_ready`; `test_settle_heuristics`; `TestTimeoutResilience` (soft undersize → verify/learn; hard timeout detect/continue; wall spin-safe) |
| R007 | 2026-08-09 | cold/mid: Chrome over Grok again; left ghostty not focused after layout | (1) active focus used Meta.activate → kbd thrash; (2) no-open path skipped soft barrier; (3) learned soft floor 400ms too short after opens; (4) RunSteps dropped `keyboard:false`; (5) save focus ignored floats / no LFT fallback | open-leaf focus `keyboard:false`; always final soft focus; cold soft floor 2s with pins; run-steps passthrough; save focus = last saved item (+ LFT); `--focus` CLI | `test_focus_active_open_leaf_no_keyboard`; `test_focus_from_float_*`; `test_parse_focus_cli_and_override` |
| R008 | 2026-08-09 | **true cold** mon0 Chrome New Tab over Grok (partial path green) | residual desk / pre-R007 path; **not** reproduced after R007 cold soft floor + pin | verified green SE8b (2× true cold Guake + partial) — R007 path holds | `L2.true-cold-dev` / R008 live; soft barrier + open-leaf pin |
| R009 | 2026-08-09 | `forge layout clean` / show fails on `{tiles:[]}` | `detect_layout_mode` required non-empty tiles | empty `tiles` list/dict + empty `roles:[]` count as reconcile sugar (CE1) | `test_empty_tiles_list_is_reconcile`; `test_empty_roles_list_is_reconcile` |
| R010 | 2026-08-09 | **Wayland** multi-open residual: mon1 tabs flat / wrong mon after first Mode A apply; second apply Mode B thrash-recover repaired | **Not** “Meta has no settled event” (that is **D019 soft residual** — intentional product fallback). R010 was **structure phase**: same-batch mon HSPLIT after TABBED flattened mon1; place+ensure without replan used pre-move mon paths | **Shipped:** mon-ensure skip when nested structure planned; residual place→structure replan. Soft residual + in-command verify = product (not a bug). Mode B as cold *success* still rejected. Re-check first-shot multi-open only as structure residual — do not treat soft-timeout as R010 | `partition_extension_steps_place_vs_structure`; mon-ensure skip in `layout_plan` |
| R011 | 2026-08-10 | **X11** partial chrome reopen (`L1.ghosttys-only` / `L1.right-ghostty`): mon0 open leaf stuck on Chrome (Walmart title); Grok flat at `mo0ws0/2`; soft focus max-corrections (32); dry-run `tabbed-roles-not-grouped:mon0.s0` | place→structure split treated **all** `move` as place. `ensure_layout` tabbed expands to `layout(anchor)` + `move(peer→id:anchor)`; join moves ran **before** TABBED wrap → solo TABBED(Chrome) + Grok mon sibling | **Shipped:** window-dest moves (`dest id:…`) stay in structure after layout wrap; mon-path moves remain place | `test_partition_tab_join_moves_stay_with_structure`; live `L1.ghosttys-only` / `L1.right-ghostty` |
| R012 | 2026-08-10 | **X11** DnD: tab-join Nautilus onto left mon Ghostty after right-mon tab group → mon **HSPLIT** instead of TABBED; TOP then center worked | Meta `window-entered-monitor` mid **GRAB_TILE** rehomed as mon LFT sibling (HSPLIT); target frame shrunk; pointer often over self → null drop → stuck HSPLIT | **Shipped:** skip rehome while GRAB_TILE / `_draggedNodeWindow`; grab-end re-resolves `nodeWinAtPointer`; RunSteps `dnd-drop` for live | L0 `bug-r012-grabtile-no-mid-drag-rehome`; live `L1.r012-cross-mon-tab-dnd` (`--tags R012` / `--from-work dnd`) |
| R013 | 2026-08-10 | **Wayland** multi-open residual (`L1.ghosttys-only` / sequence → `L1.right-ghostty`): mon1 tabs flat or mon0 TABBED polluted with ghostty; soft focus max-corrections (32); open leaf Ghostty | residual place→structure built mon1 TABBED, then Meta rehomed pin roles to mon0; **belt** mon-root moves fixed mon but **flattened** TABBED (no structure after belt). Soft barrier cannot repair structure | **Shipped:** after belt pin mon-moves, one place→structure rebind (`beltStructure` / optional `beltPlace2`) — same contract as residual follow-up; not Mode B | live `L1.ghosttys-only` / `L1.right-ghostty`; apply log `beltStructure` |
| R014 | 2026-08-10 | **Wayland** soft focus max-corrections (32); open leaf stuck on focused TILE sibling (e.g. Ghostty) after keyboard:false focus on Grok reports ok | **GetTree mutated live tree:** `syncLastTabFocusFromFocus` on every GetTree stomped `lastTabFocus` to Meta keyboard focus. Soft barrier set open leaf then polled GetTree which rewrote LTF to focused ghostty in same TABBED — infinite thrash. Violates D018 (open leaf ≠ kbd focus) | **Shipped:** remove GetTree-side sync; session save keeps its own sync path; **host RC green** after logout loads tip | live soft settle; keyboard:false focus + GetTree must preserve LTF; `wayland-rc` 2026-08-10 |
| R015 | 2026-08-10 | **Wayland** host: drag TILE from mon0 onto **empty** mon1 → snaps back on release; keyboard mon-move works | DnD only commits when `nodeWinAtPointer` is set; R012 skips mid-drag rehome while GRAB_TILE; empty dest mon → null target → grab-end no-op → `commitLayout` snaps geometry to source mon | **Shipped:** grab-end empty-mon path (`resolveEmptyMonitorDrop` + `_commitEmptyMonitorDrop`); session `dnd-drop` with `destMonitor`; live `L1.r015-empty-mon-dnd` | L0 `bug-r015-empty-mon-dnd`; live `--tags R015` / `--from-work dnd` |
| R016 | 2026-08-11 | **Wayland/X11** dual-mon: **no-op** monitor re-apply (e.g. `gdisplays load` when layout already correct, or Mutter re-`ApplyMonitorsConfig` with identical geometry) **thrashes** tiled desk — windows jump / tabs reshuffle / focus storm — instead of calm retile or true no-op | `workareas-changed` (and related) arms **H1 thrash-pending + monitor-recovery** even when mon geometry fingerprint is **unchanged**. H1 is correct for lock/wake GPU peel; wrong for false thrash. shellrc gdisplays **6.4.2** skips no-op apply at caller; Forge must still short-circuit | **Shipped:** `workareas-policy` fingerprint + classify; signal no-op when fp+homes match; settle graduated (noop / retile / mon_gain / mon_loss collect-to-end / H1 thrash); quiet fp on `snapshotLastGoodHomes` | L0 `workareas-policy` + `bug-r016-noop-workareas-no-thrash`; live `L1.r016-noop-workareas` (`--tags R016`) |
| R017 | 2026-08-11 | **Wayland** dual-mon: scale change thrash. **1.5→1.0** often OK after first fix; **1.0→1.5 reverse** still destroyed topology (mon0 ghostty → mon1) | (A) entered-monitor race + quiet poison; (B) settle classifies scale as **thrash→H1** because `geom:` stableKeys rewrite on every size change (lost+gained all heads); H1 mis-rehomes via **stale-scale frames** before last-good index | **Shipped:** entered-monitor suppress/defer/grace; **same mon count → retile** (geom change) / **renumber** (geom quiet); Meta→tree align on retile; H1 prefers last-good **index before frame**. Nest: both scale dirs `workareas-retile`. **Host tip:** logout after install | L0 `bug-r017-…` + `workareas-policy`; live note `--tags R017` |
| R018 | 2026-08-12 | **Wayland** `forge install` after `layout dev`: right mon HSPLIT swaps (term\|tab → tab\|term). Left `[tab\|term]` stays. Install is not a layout apply. | Session restore mixed-mon splice: extra sibling (desktop icon / float) → `insertBefore(rebuilt, anchor)` when `anchor === rebuilt[0]` is a no-op, then the tab CON lands *before* the term. Wayland `forge_restart_shell` then flushed that swapped tree (`immediate` bypasses 12s hold) even though there is no HUP. | **Shipped:** mixed splice = extrasBefore + rebuilt + extrasAfter (desc order). Flush session-layout only on X11 HUP. | L0 `tree-snapshot` mixed term\|tab / tab\|term extras |
| R003 | 2026-08-08 | left dock open → right mon | dock mon from focus/`get_current_monitor`; weak hook | D007 pointer mon + activate_full | `open-app-policy` focus mon0 + dock mon1; pointer geometry |
| R004 | 2026-08-08 | dock miss → focus mon; mon-root covers left tab | appId mismatch dropped pending; empty LFT(m) → mon-root 3rd HSPLIT child | single-pending match; `_lastTileOnMonitor` end-of-tree | `lft-mru` single unexpired mismatch; `open-app-policy` dock empty mon LFT |

## Agent live E2E (most important)

Unit tests are necessary but **not sufficient** for dual-mon layout. Agents
must run the **partial reload matrix** on X11 (never close agent Ghostty):

| Pre-state | Command |
| --- | --- |
| Ghosttys only | `forge layout dev` |
| Left chrome + ghostty | `forge layout dev` |
| Right ghostty (mon0 chrome gone) | `forge layout dev` |
| Left ghostty + nautilus | `forge layout t1` |

Full procedure + pass criteria: [HANDOFF.md](./HANDOFF.md) § Agent live E2E.
Guards open-leaf steal (R005/R006), mon claim (R001 class), dual ghostty reuse.

## Rules

1. **New live regression** → file row + failing **unit** test when pure, **and** a
   `LIVE_CASES` entry in `scripts/forge/live_matrix.py` tagged with that **R0xx**.  
2. **Do not** only “note in HANDOFF” without a test.  
3. Prefer pure helpers (`lft-mru.js`, `layout_apply.py`) so tests stay fast.  
4. Wayland host Shell cannot HUP — reload extension via **`forge nested restart`** (AT-W1); dual-mon host CT may still need one logout if host never loaded tip. CLI path is live immediately.  
5. Layout sign-off: **`forge test live plan/run`** with behaviors for the change —
   not the full catalog every time. Full auto only for release / large layout refactors.  
6. Select: `forge test live plan --tags R0xx` or `--from-work open-leaf|cold|…`.

## Related

- OP1 design: [docs/DESIGN.md](../docs/DESIGN.md) open-app placement  
- Decisions: D007, D014–D019 in [docs/DECISIONS.md](../docs/DECISIONS.md)  
- Task history: [completed/forge-dock-sticky-mon.md](./tasks/completed/forge-dock-sticky-mon.md)  
