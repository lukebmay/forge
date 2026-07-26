# Task Force B — Independent codebase audit review

**Role:** independent auditor/planner (no production code)  
**Date:** 2026-07-25  
**Compared against:** `agents/plans/forge-codebase-audit.md` (still **stub** when re-read; A has not expanded CA tasks yet)

---

## 1. Independent findings

### 1.1 Line-count inventory (approx., source files)

| File | ~Lines | Notes |
| --- | ---: | --- |
| [`lib/extension/window.js`](../../lib/extension/window.js) | **~5061** | Primary size target; sole mega-file |
| [`lib/extension/tree.js`](../../lib/extension/tree.js) | **~2910** | Primary size target |
| [`lib/extension/session-api.js`](../../lib/extension/session-api.js) | **~880+** | DBus glue; dense but under 1k OK |
| [`lib/extension/session-layout.js`](../../lib/extension/session-layout.js) | **~871** | Pure; healthy extraction pattern |
| [`lib/extension/tree-snapshot.js`](../../lib/extension/tree-snapshot.js) | **~640+** | Pure T6; healthy |
| [`lib/extension/decoration.js`](../../lib/extension/decoration.js) | **~450+** | Already extracted from WM |
| [`lib/extension/command.js`](../../lib/extension/command.js) | **~mid** | Handlers; fine |
| [`lib/extension/tile-select.js`](../../lib/extension/tile-select.js) | **~mid** | Pure FC1 |
| [`lib/extension/focus.js`](../../lib/extension/focus.js) | **~182** | Thin extract; good |
| [`lib/extension/lft-mru.js`](../../lib/extension/lft-mru.js) | **~220** | Pure OP1 |
| Other extension modules | mostly **&lt;400** | Within bar |

**Workspace residue (not production path, but real debt):** entire tree
`temp-before-debug/` — old extension snapshot (pre–session-layout era). Not
referenced by build/tests. `.gitignore` ignores `temp` but **not**
`temp-before-debug`. Delete (or gitignore + remove) in a hygiene PR.

### 1.2 `window.js` section map (method groups)

Rough vertical slices of `WindowManager` (line ranges approximate):

| Region | ~Lines | Content |
| --- | --- | --- |
| Helpers / enums | 83–185 | `sessionLayoutTrace`, `metaWinLabel`, modes |
| ctor + overrides + queue | 186–402 | managers, float/tile overrides, `queueEvent` |
| Signals | 403–540 | display / WM / workspace |
| **Session shield + soft rehome** | 544–920 | thrash pending, settle, group align, last-good |
| Float / fullscreen demotion | 919–1100 | always-float, demote |
| Resize / expand / golden | 1105–1318 | keyboard size policy |
| enable / disable | 1319–1385 | timers, session flush |
| Monitor identity | 1387–1435 | T7 map |
| Layout / monocle / move | 1484–1860 | workspace float, `move()` |
| render / reload | 1947–2095 | idle render, snapshot reload |
| **Session save / restore orchestration** | 2098–2426 | save hold, rehome, strict, raise, seed |
| Track / place / dock / LFT | 2582–3040 | open-app, place-hint, dock sticky |
| Window signals / destroy | 3074–3385 | bind, destroy, focus restore |
| **Meta rehome / reconcile** | 3385–3630 | entered-monitor, workspace burst, container migrate |
| **DnD** | 3872–4520 | drop zones, preview, grab-op (~650 lines) |
| Grab resize / float match | 4520–5020 | resize pairs, override classifiers |

**Already delegated via thin wrappers:** decoration (`decorationManager`),
focus/stack restack (`focusManager`), pure helpers (`SessionLayout`,
`TreeSnapshot`, `LftMru`, place-hint, tile-select).

### 1.3 `tree.js` section map

| Region | Content |
| --- | --- |
| `Node` (~68–870) | ADT + **tab/decoration chrome** (`_createWindowTab`, `_activateFromTab`, decoration bins) tightly coupled to St/Clutter |
| `Queue` | tiny |
| `Tree` scaffold | workspaces/monitors, `reload`, destroy |
| Snapshot wrappers | T6 thin-wrap + **legacy layout-group** APIs (~1095–1240) |
| Navigation | focus / move / swap / next |
| Layout engine | `processNode`, split/stack/tab, min-size redistrib, percents |
| Debug | `debugNode` / `debugParentNodes` (Logger.debug only) |

### 1.4 Recovery / rehome / match / raise — overlapping nets

**Production call graph (enable / HUP / thrash):**

```text
enable
  → hold session save 12s
  → reloadTree → track → _restoreSessionLayoutAfterTrack
       match ≥50% (id → same-pid global assign → class+title → class global → unique)
       → _rehomeWindowsForSessionForest (move_to_monitor + appendChild + retry)
       → _restoreSessionForestStrict (resolveStrictMonitor + applyMonitorSnapshot)
       → _raiseAfterSessionRestore
       → seed _lastGoodHomes + 3s shield

workareas-changed (windows, no ws add/remove)
  → thrash pending + 300ms settle
  → if shield: reapply forest (do NOT snapshotTree thrash)
  → else soft rehome: snapshotTree → resolve mon (stableKey/frame/Meta)
       → majority-align STACKED/TABBED → move_to_monitor → reconcile
       → restoreTreeIfNeeded → render
  → inconsistent → reloadTree (fresh snapshot) or shield reapply

window-entered-monitor
  → ignored while thrash / restoring / shield
  → else updateMetaWorkspaceMonitor + trackCurrentMonWs

quiet render
  → snapshot last-good homes
  → debounced session-layout save (1.5s; richness guard; hold blocks thrash-flat)
```

**Layer count is high but mostly non-redundant after Ghostty ship:**

| Layer | Role | Redundant? |
| --- | --- | --- |
| Soft rehome (H1) | live thrash without disk | No |
| T6 full forest | structure across rehome/reload | No — supersedes layout-group on this path |
| Session portable + strict mon | HUP / install | No |
| Shield + reapply | post-HUP thrash vs empty last-good | No — proven live |
| Richness + 12s hold | thrash-flat overwrite | No |
| Layout-group snapshot/restore | **tests + forge-bqa history** | **Production soft-rehome no longer calls it** (window.js has zero refs) |

**Match scoring:** `assignByScore` + `geometryMatchScore` (−d² + mon bonus) is the
live path; older greedy distance-only comments are obsolete. Order is documented
in task + DESIGN — **keep; do not invent new match phases in cleanup**.

**Raise / restack (multiple intentional call sites):**

| Path | Where |
| --- | --- |
| Tab click | `Node._activateFromTab` + decoration restack |
| Focus manager | `updateStackedFocus` / `updateTabbedFocus` / hover |
| Session restore | `_raiseAfterSessionRestore` DFS + lastTabFocus + focus |
| Commands | Focus/Move/Swap raise + tab focus helpers |
| Float-under-fullscreen | demotion / raise policy (separate concern) |

Cleanup goal: **one documented stacking policy**, not one function that does
everything — collapsing these without care will re-break tab click / Wayland pin.

### 1.5 Dead / diagnostic / hygiene issues

| Finding | Severity | Detail |
| --- | --- | --- |
| **Duplicate `_monitorIndexOfNode`** | High hygiene | Defined at ~1047 **and** ~2916 in `window.js`. JS class body: **later wins**. First body is dead. Keep null-safe second (or merge best of both). |
| **`temp-before-debug/`** | High residue | Full old tree; delete. |
| **`sessionLayoutTrace` volume** | Medium | Useful for install loops; gated file write when `production===false`. Prefer `Logger.debug` over `Logger.info` for per-window spam; keep file path for dev HUP. Do **not** delete shield/rehome traces until product is quiet for a while. |
| **Dual mon-ws ID helpers** | Medium | `Utils.createMonitorWorkspaceId` / `monitorIndex` / `workspaceIndex` vs `MonitorIdentity.createMonWsId` / `monIndexFromId` / `workspaceFromId`. Same strings; two homes. |
| **Layout-group vs T6 dual API** | Medium | Layout-group still tested (`bug-bqa`, H1 unwrapped tests) but **not** on production soft-rehome after T6. Document “compat + tests”; do not delete until tests migrate to T6 equivalents or stay intentionally as narrower API. |
| **`_sessionLayoutSaveSrcId` cleanup** | Low | Cleared in `disable` / `flush` manually; **not** in `_removeSignals`’s `_clearTimeoutId` list. Align for symmetry. |
| `console.log` | None found in lib | Good |
| `Logger.debug` in tree render | Low | Existing; fine behind log level |

### 1.6 Pure modules already extracted (pattern to extend)

| Module | Role |
| --- | --- |
| `session-layout.js` | portable forest, match, richness, plans |
| `tree-snapshot.js` | capture/restore forest, apply mon, percents |
| `monitor-identity.js` | stableKey maps |
| `lft-mru.js` | open-app placement pure bits |
| `place-hint.js` | PlaceNext queue pure |
| `tile-select.js` / `tree-query.js` / `run-steps.js` | FC control plane pure |

**Pattern:** pure functions + unit tests; GObject `WindowManager` / `Tree` thin-wrap
with Meta/St. **Do not extract half-coupled GObject chunks that still need
`this.tree` and global display without a clear interface.**

### 1.7 Test coverage (relevant)

| Area | Coverage |
| --- | --- |
| Session layout pure | Strong (`session-layout.test.js`) |
| T6 snapshot | Strong (`tree-snapshot.test.js`) |
| Soft rehome + shield | Strong (`bug-h1-soft-rehome-workareas-thrash.test.js`) |
| Tab click restack | Regression present |
| Layout-groups | `bug-bqa-stacked-survives-reload` + H1 unwrapped cases |
| DnD | unit WindowManager-drag-drop* |
| Prefs UI | thin unit only — **out of scope** for this audit (note only) |
| e2e thrash | not required for tidy PRs; live black remains product gate |

### 1.8 Timer / debounce inventory

| Source | Delay | Purpose | Keep? |
| --- | --- | --- | --- |
| `_queueSourceId` | 220ms | command event queue | Yes |
| `_workspaceChangingTimeoutId` | 300ms | WS transition hover guard | Yes |
| `_workareasSettleSrcId` | 300ms | thrash soft-rehome settle | Yes (hybrid GPU) |
| `_manualResizeEndId` | 120ms | kbd resize end | Yes |
| `_pointerFocusTimeoutId` | 16ms | focus-on-hover poll | Yes when enabled |
| `_renderTreeSrcId` | idle | coalesce render | Yes |
| `_reloadTreeSrcId` | idle | coalesce reload | Yes |
| `_windowHomeReconcileSrcId` | idle | workspace-change burst | Yes |
| `_sessionLayoutSaveSrcId` | 1500ms | disk last-good | Yes |
| session save hold | 12s | post-enable thrash-flat | Yes |
| session shield | 3s sliding | post-HUP thrash | Yes |
| `_wsWindowAddSrcId` | 200ms | window window-added rehome | Yes |
| `_forgeStackTimeoutId` | 50ms | Wayland stack pin | Yes |
| ConfigSync export | 500ms | portable settings | Yes |

**No timer looks dead.** Cleanup = document table in DESIGN, not delete timers.

### 1.9 Abstraction / size strategy (not a rewrite)

**Highest ROI splits for `window.js` (~5k → aim &lt;3k over several PRs):**

1. Session orchestration cluster (~session save/restore/shield/rehome/raise/trace) → e.g. `window-session-layout.js` as methods module or small helper class with `wm` ref.
2. Soft-rehome cluster → `window-soft-rehome.js` (or same recovery module if co-located with session).
3. DnD cluster (~650 lines) → `window-dnd.js`.

**For `tree.js` (~2.9k):**

1. Prefer **documenting** Node tab/decoration coupling first (actors live on Node for a reason).
2. Optional later: move layout-group wrappers to call only pure `tree-snapshot` + thin Tree; avoid big Node split until decoration lifecycle is listed.

**Do not:** rewrite flex engine; merge recovery into one “smart” function; delete shield/richness without live proof; prefs test campaign.

---

## 2. Proposed CA task list (B order)

### CA0 — Workspace residue
- **Do:** Remove `temp-before-debug/` (or add to gitignore + delete). Confirm not used by make/tests.
- **Accept:** tree gone; `npm test` green; no import refs.

### CA1 — Recovery architecture doc (no behavior change)
- **Do:** One diagram in `docs/DESIGN.md`: enable/HUP, workareas thrash, shield, soft rehome, reloadTree fallback, entered-monitor suppression. Timer table. Note layout-group = test/compat, T6 = production.
- **Accept:** DESIGN section exists; links from plan; no code change required.

### CA2 — Dead-code hygiene (small PR)
- **Do:** Remove dead first `_monitorIndexOfNode`; keep null-safe implementation. Route `_sessionLayoutSaveSrcId` through same clear path as other timers where safe. Downgrade per-window `sessionLayoutTrace` journal noise to debug (keep file write for `!production`).
- **Accept:** single mon-index helper; tests green; no change to restore success path.

### CA3 — Unify mon-ws identity helpers
- **Do:** Make `Utils.createMonitorWorkspaceId` / `monitorIndex` / `workspaceIndex` thin delegates to `MonitorIdentity` (or reverse — one source of truth). Update call sites only if needed.
- **Accept:** one implementation; unit tests for both import paths green.

### CA4 — Extract session-layout orchestration from `window.js`
- **Do:** Move save/restore/rehome/strict/raise/seed/shield/trace orchestration into dedicated module; `WindowManager` thin methods remain for DBus/`enable`. Pure logic stays in `session-layout.js`.
- **Accept:** `window.js` drops ~300–500 lines; session unit + H1 shield regressions green; no live behavior change.

### CA5 — Extract soft-rehome cluster
- **Do:** `_queueSoftRehomeOnWorkareas`, `_softRehomeAfterWorkareas`, group align, last-good snapshot/resolve → same recovery module or sibling.
- **Accept:** H1 + workareas regressions green; thrash path still debounced 300ms.

### CA6 — Extract DnD from `window.js`
- **Do:** drop ops, preview, grab moving helpers → `window-dnd.js` (or `drag-drop.js`).
- **Accept:** drag-drop unit tests green; `window.js` further reduced.

### CA7 — `tree.js` density pass (narrow)
- **Do:** Document Node decoration ownership in DESIGN. Optionally fold layout-group helpers comments to “compat”; no production call-site deletion until tests re-homed. Avoid large Node extract in this plan unless &lt;1 day and tests cover tab chrome.
- **Accept:** DESIGN note; optionally `window.js`/`tree.js` comments trimmed per `comments.md`; tests green.

### CA8 — Raise / stacking policy note
- **Do:** DESIGN short policy: when to raise (tab, focus, session restore, float demote). Only micro-dedup if identical try/raise wrappers; **no** merge of tab restack with session raise.
- **Accept:** policy written; tab-click + H1 + float regressions green.

### CA9 — Optional: layout-group long-term
- **Do:** Either keep as intentional narrow API for tests, or migrate bqa/H1 unwrapped tests to T6 forest APIs and delete layout-group restore paths.
- **Accept:** explicit decision in plan; if delete, no production caller left + tests updated.

### Non-goals (confirm)
- No flex engine, no gdisplays merge, no prefs unit-test campaign, no e2e thrash requirement for tidy PRs, no match-order redesign.

---

## 3. Re-read of A’s plan

Re-read [`agents/plans/forge-codebase-audit.md`](./forge-codebase-audit.md) after independent list:

- **Status still:** stub — not started  
- Seed table + approach + non-goals present  
- **No CA task table, no acceptance criteria, no line-count refresh, no residue callouts**

---

## 4. Verdict

### **AGREE** (on diagnosis and approach seeds)

A’s stub correctly identifies:

1. `window.js` / `tree.js` as primary size targets  
2. Layered thrash recovery as doc + careful dedup, not big-bang delete  
3. Match history keep + document  
4. Raise paths need policy, not random merge  
5. Timer inventory needed  
6. Prefer pure-module extraction pattern  
7. Small PRs; tests green; not a rewrite  

Direction and non-goals match this independent audit.

### Numbered findings (nits / required expansions for A)

A’s plan is **sound as a seed** but **not yet executable**. Before CA work starts, A should expand the plan with:

1. **Missing residue:** `temp-before-debug/` cleanup (CA0) — not in seed.  
2. **Missing concrete bug/hygiene:** duplicate `_monitorIndexOfNode` (CA2).  
3. **Stale size claim:** seed says ~4.7k; measured **~5.1k**.  
4. **Layout-group clarification:** production soft-rehome uses **T6 only**; layout-group is test/compat — seed lumps “majority mon remap” without separating dead production path.  
5. **No prioritized CA task list with acceptance** — stub “suggested approach” is good process but not shippable slices. Adopt B’s CA0–CA8 order (or justify reorder).  
6. **Session diagnostics:** seed says “drop redundant guards” — too aggressive if read as delete shield/richness; phrase as **document then prove redundancy before removal**.  
7. **DnD extract** (~650 lines) is high-ROI and **absent** from seed table.  
8. **Dual mon-ws helpers** (utils vs monitor-identity) absent from seed.  
9. **Timers:** all current timers are justified — inventory should conclude “keep”, not hunt for cuts.

### Required changes for A to “finish” the plan document

1. Promote stub → active plan with **CA task table** (id, slice, acceptance, status).  
2. Incorporate CA0–CA2 as first executable slices (low risk).  
3. Soften “drop redundant guards” → document first; delete only with test + rationale.  
4. Note T6 vs layout-group production reality.  
5. Point “next task” at **CA0 or CA1** (either order fine; prefer CA0 if residue confuses agents).

### Optional improvements

- Cross-link archive entries for session-layout / soft-rehome when archiving.  
- Later: e2e thrash only if cheap Docker path exists — not blocking tidy PRs.  
- `session-api.js` split only if it grows past ~1k.

---

## 5. Recommended first task

**CA0 (residue delete) or CA1 (DESIGN recovery diagram)** — zero behavior risk.

Then **CA2 (duplicate mon-index + timer clear hygiene)** as first code PR.

Then **CA4** (session orchestration extract) as first meaningful `window.js` shrink — after docs so agents do not re-litigate recovery.

---

## 6. Handoff summary for orchestrator

| Item | Value |
| --- | --- |
| **Verdict** | **AGREE** (seed sound; expand to executable CA list) |
| **Top disagreements** | Missing CA0 residue, duplicate method, DnD extract, T6-vs-layout-group production fact; stub incomplete as plan |
| **First task** | CA0 delete `temp-before-debug/` **or** CA1 recovery DESIGN section |
| **Do not** | Rewrite recovery; delete shield/richness; merge all raise paths; implement in this B pass |
