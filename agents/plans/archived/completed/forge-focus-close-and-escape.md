# Plan: focus on close + unfocus (Ctrl+Super+Esc)

**Status:** partial — **FC0–FC1 shipped** (close → focus restore).  
**FC2–FC3 unfocus (`Ctrl+Super+Esc`) abandoned** 2026-08-09 (chords poorly with Esc/terminals; not product-critical). Keybind unbound; `WindowUnfocus` command removed.  
**Priority:** close-focus remains high; unfocus abandoned  
**Branch:** `master`  
**Related:** action pipeline FocusChanged; LFT MRU; tree single-child collapse

---

## Product intent (operator + agent agreement)

### A. After closing a window (click close or Super+Q)

Focus should land on a **sensible remaining tile**, not “nothing” and not a random mon.

**Priority order (locked for FC1):**

1. **Last-focused remaining tile** that is still in the tree and focusable  
   (prefer same workspace; prefer global LFT / focus MRU among survivors — not the closed window).
2. Else **next sibling** in the closed window’s container (existing child order).
3. Else **previous sibling** in that container.
4. Else other NORMAL windows on the **same workspace** (current fallback).

**Not preferred:** focus a float/Guake unless it was the LFT/MRU survivor and is TILE-eligible for LFT rules — floats stay out of LFT by policy.

### B. Single-child containers dissolve (confirm product truth)

**Yes — this is already tree contract:** a CON with fewer than two surviving
children collapses to that child (or null). See `tree.js` `_rebuildGroup` /
TreeSnapshot rebuild: *“never carries degenerate single-child containers.”*

On close of the penultimate sibling:

1. Container dissolves; **sole survivor is promoted** to the parent (often mon-direct or grandparent split).
2. Focus target = that **promoted survivor** (same window that was the last child of the old CON).
3. After promotion, that node has **new siblings** (former uncle/aunt mon children). Further closes use the same rules relative to the new parent.

**Logical behavior we want:** yes — dissolve + focus survivor is correct. Do not leave single-child tab/split shells.

TABBED/STACKED with one remaining window: collapse to that window (lose tab strip) unless product later decides otherwise; today collapse is generic for CONs.

### C. Ctrl+Super+Esc (or Forge-bound equivalent)

| State | Action |
| --- | --- |
| Future selection / grab / “mode” active | **Exit mode** first (no unfocus) |
| No mode | **Clear tile focus** — no Forge TILE has keyboard focus; shell/desktop/dock may hold focus (Mutter may focus overview, desktop, or nothing focusable) |

**Agree with caveats:**

- Mutter always has *some* focus target; “no app focus” means **no managed TILE** is the focus window — not a hard guarantee that no Meta window is focused (notifications, shell actors).
- Implementation: prefer `global.stage.set_key_focus(null)` / focus desktop window if available; document X11 vs Wayland differences.
- Must not re-steal focus into last tile via LFT hover immediately — gate or clear LFT touch on explicit unfocus.

---

## Current code (starting point)

| Concern | Today |
| --- | --- |
| Close focus restore | `window.js` `_captureFocusRestore` / `_restoreFocusAfterWindowClosed` — **siblings only** (order of `childNodes`), then any NORMAL on same workspace. **No LFT/MRU preference.** |
| Super+Q | GNOME/app close → unmanaged path → same restore |
| Single-child collapse | Tree rebuild / cleanTree — **already dissolves** |
| Ctrl+Super+Esc | **Not implemented** as Forge unfocus (no product binding yet) |

---

## Tasks

| ID | Task | Status |
| --- | --- | --- |
| FC0 | [Design lock + pure focus-target helper](./completed/forge-focus-close-and-escape_fc0-policy.md) | **done** — `pickFocusAfterClose` |
| FC1 | [Wire close restore to policy](./completed/forge-focus-close-and-escape_fc1-close-restore.md) | **done** |
| FC2 | [Unfocus keybind + mode exit hook](./completed/forge-focus-close-and-escape_fc2-unfocus.md) | **done** |
| FC3 | [Live matrix close + unfocus](./completed/forge-focus-close-and-escape_fc3-live.md) | **done** — `L1.close-focus-lft` + `L1.unfocus`; RunSteps `unfocus` |

---

## Non-goals

- Changing GNOME Super+Q itself (we react to close)
- Float-as-LFT
- Selection modes implementation (only a hook for future mode exit)
