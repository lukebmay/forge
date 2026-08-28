# Plan: Canonical internal contracts

**Status:** active — design locked enough to implement  
**Priority:** **P0** (foundation; ahead of features and FCC Wave C)  
**Branch:** `master` (default)  
**Created:** 2026-08-13  
**Catalog:** [docs/dev/contracts.md](../../docs/dev/contracts.md)

### Session note (overwrite)

**2026-08-13:** IC0–IC3 **done** (R019/R020, D024–D026). `revealGroupChild`
landed. Next: live nest/logout smoke; IC4 later.

---

## Problem

We already have good named APIs (`afterFocus`, `commitLayout`,
`mergeWindowsIntoGroup`, `reassertNodeToSlot`, D019 waiters, D023 child
list). Call sites and “bugfix” helpers still bypass them:

| Symptom | One-off | Should have been |
| --- | --- | --- |
| Drag Grok onto Chrome CENTER does nothing; Chrome onto Grok tabs | `_isNoOpDrop` treats CENTER as “already after sibling” | Drop-intent: CENTER on H/V siblings **changes layout** |
| VLC (and friends) jump to full screen when a video ends | `tree.apply` **skips** fullscreen; `onExternalGeometry` is log-only | Tile-slot authority → `reassertNodeToSlot` |
| Wrong tab visible after a random path | `parent.lastTabFocus =` + `raise()` in the new file | One reveal primitive |
| Extra quiet after a move | New 400 ms sleep / new TILE poll | Existing D019 waiter or extension echo |

Patches hide the next instance of the same class.

---

## Locked decisions (do not re-litigate)

| # | Decision |
| --- | --- |
| **1** | **Catalog is law.** [contracts.md](../../docs/dev/contracts.md) lists the job → API. New behavior extends that API first. |
| **2** | **Do not over-abstract.** Two settle brains stay **until ApplyLayout (D038)**. Do not add a JS GetTree `wait_until_hard_ready`. `settleTabFocus` stays chrome-only. IC4 skip when AL8 deletes CLI waiters. |
| **3** | **D024 drop-intent.** No-op iff parent + order + **layout** already match. CENTER on H/V siblings is a real group op. Execute via `tree.mergeWindowsIntoGroup`. |
| **4** | **D025 reveal.** Live “show this group child” goes through one WM helper (`revealGroupChild`). Snapshot persist may write LTF as data only. |
| **5** | **D026 tile-slot.** TILE `renderRect` is geometry authority. Unsolicited Meta fullscreen / maximize / size (no live grab, no forge echo) restores to slot. User grab-resize stays percent. Forge zoom (Wave Z) is a later **presentation flag**, not Meta fullscreen. |
| **6** | **Maximize → float** on multi-tile is a one-off we will retire under IC3 (snap back instead). Lone-tile maximize-on-single stays. |
| **7** | **User vs app.** Live `grabMode` / forge suppress / echo = ours or user grab. Everything else on a TILE is unsolicited, including VLC’s own fullscreen and the maximize button. Forge zoom keys (later) are how the user peeks. We do **not** try to detect “clicked the GTK maximize widget.” |
| **8** | **AC1 holds.** Verify remains log-only. Restore is a dedicated sensor branch, not verify-driven reassert. |
| **9** | **FCC Wave C / Z after contracts.** Do not start monocle-delete / setLayout rewrite in this campaign. Zoom full/width/height is Wave Z on top of D026. |

---

## Non-goals

- First-class container rewrite (C0–C5)
- Ratio-step yuiop / auto-tile algorithms
- Cross-mon TABBED product (separate D0)
- Unifying raise into one `raiseWindow()` (DESIGN § Raise)
- Making Mode B a cold success path

---

## Tasks

| ID | Work | Status | Depends |
| --- | --- | --- | --- |
| **IC0** | Catalog + DECISIONS D024–D026 + PRIORITY/HANDOFF | **done** (this session) | — |
| **IC1** | Pure `dropChangesStructure` + DnD CENTER uses `mergeWindowsIntoGroup`; both-direction VSPLIT regression | **done** (R019) | IC0 |
| **IC2** | `revealGroupChild` + convert live LTF/raise one-offs | **done** (D025) | IC0 |
| **IC3** | Tile-slot authority: unsolicited size/max/fs → restore; `notify::fullscreen`; stop apply-skip / max-float | **done** (R020) | IC0 |
| **IC4** | Fold CLI `wait_for_wm_class` + delete `FINAL_FOCUS_QUIET_MS` sleep | later | IC0 |
| **Z0** | (later, FCC) lock zoom chords; implement on D026 | later | IC3 + FCC C spine as needed |

---

## IC1 — drop intent (daily-driver bug)

**Repro:** Chrome tiled left-mon (often a tall VSPLIT after aspect-split).
Grok opens underneath. Drag Grok onto Chrome **CENTER** → preview may show
tab hint, grab-end no-ops. Drag Chrome onto Grok → TABBED. `_isNoOpDrop`
sees `isBefore=false` and `chrome.nextSibling === grok`.

**Fix:**

1. Pure `dropChangesStructure` (new `lib/extension/drop-intent.js` or sibling
   of `drop-zones.js`) encoding D0 + D024.
2. `_isNoOpDrop` = `!dropChangesStructure(...)`.
3. CENTER that groups two windows calls `mergeWindowsIntoGroup` (same as
   keybind / `merge-group` RunStep).
4. Unit: 2-child VSPLIT `[Chrome, Grok]`, CENTER Grok→Chrome **and**
   Chrome→Grok both become TABBED. Keep D3 edge no-op (already bottom,
   drop BOTTOM).

Target pick (`_findNodeWindowAtPointer`): exclude the dragged meta. Prefer
**tree slot** (`renderRect` / `initRect`) for targets during grab so a
moving live frame cannot self-hit. Do not invent a second zone system.

---

## IC2 — reveal group child

Add `wm.revealGroupChild(node, { keyboard = false, pin = false })`:

```text
write lastTabFocus → optional pin → raise leaf
  → settleTabFocus (F+Dfocus+B)
  → if keyboard: activate + afterFocus
```

Convert live writers in `command.js`, `session-api._focusOp`,
`tree._activateFromTab` (keep activate), merge/toggle paths, session restore
raise walk. Snapshot `toPortableForest` / `applyMonitorSnapshot` stay data.

`updateTabbedFocus` / `updateStackedFocus` become internals of reveal / F.

---

## IC3 — tile-slot authority

In `updateMetaPositionSize` (and new `notify::fullscreen`):

```text
forge-caused or open-pending → existing
live grab → existing grab handlers
TILE unsolicited (size / max / fs) → unmaximize + unfullscreen + reassertNodeToSlot
lone-tile maximize-on-single → leave
```

Delete or invert: `_resolveExternalMaximize` float-on-full-max; `tree.apply`
fullscreen skip (apply must be able to place after we unfullscreen).

Tests: fake TILE + `is_fullscreen()` + size-changed → move back to slot;
maximize flags same; grab RESIZING does **not** snap.

---

## IC4 — settle leftovers

- `forge.wait_for_wm_class` should call `wait_until_hard_ready` (or
  `wait_for_open_role_pins` when map-only).
- Remove `_layout_final_focus_pass` `FINAL_FOCUS_QUIET_MS=400` sleep.
- No new waiter.

---

## Related plans

| Plan | Action |
| --- | --- |
| [actions.md](../../docs/dev/actions.md) / action-pipeline | Unchanged formulas; name collision documented |
| [dnd-drop-zones](./forge-dnd-drop-zones.md) | D0–D4 done; **D024 residual** is IC1 |
| [first-class-containers](./forge-first-class-containers.md) | C/Z **after** this plan; Z uses D026 |
| [resize-and-autotile](./forge-resize-and-autotile.md) | Still discussion (yuiop / auto-tile) |
| [layout-settle-contract](./forge-layout-settle-contract.md) | D019 stays; IC4 only folds leftovers |
| [tab-groups-cross-mon](../tasks/forge-tab-groups-cross-mon_d0-discussion.md) | Still later D0 |

---

## Success

1. Agents have one catalog; a missing case is an API extension, not a patch.
2. Both directions of CENTER on a 2-child VSPLIT create a tab group.
3. A TILE that Meta-fullscreens without a grab returns to its slot.
4. Live open-leaf writes go through one helper.
5. No third settle brain.
