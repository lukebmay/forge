# Shared keybind core

**Status:** locked (D080)
**As of:** 2026-08-27

Proto exists to find Forge bugs. Two chord tables with the same labels
and different actions is a failed prototype.

## Decision

One **gi-free** table: **action id → chord**, Super-bearing (product).

| Adapter | What it does |
| --- | --- |
| **Forge Mark 2 kit** | The table as GNOME accels |
| **Proto** | `stripSuper(table)` plus a **proto overlay** |
| **Forge Safe / i3** | Host overlays on the **same action ids** — not a second Mark 2 table |

`stripSuper`: drop Super/Meta from each chord; leave Ctrl/Shift/Alt/key.

```text
<Super>h              →  h
<Shift><Super>h       →  Shift+h
<Ctrl><Super>h        →  Ctrl+h
<Alt><Super>Return    →  Alt+Return
```

## Action ids (shared contract)

Ids are OpSet (or core query) names, not `window-move-left` and not
`tree.move`. Examples:

`focus.left` · `move.left` · `join.left` · `launch` · `remove` ·
`toggleSplit` · `size.nudge.x-`

Forge CommandHandler and proto `keybinds.mjs` both dispatch these ids
into the **same** OpSet. Drift of id → behavior is a bug.

## Overlays (domain cruft — keep off the core table)

**Proto only:** `a` = launch toy WINDOW, `q` / Backspace = Remove,
merge-tag `t` / Escape, TreeOp `Delete` without settle, maybe `f`
flatten. These exercise the kernel in a browser; they are not product
chords.

**Forge only:** lock `Super+Delete`, zoom `Super+Return` family, run
dialog `Super+Space`, tiling master, prefs, cheatsheet. Host/session —
not TOM.

Neither overlay is imported by the other.

## What this forces

- Product **Move is Mark 2 Move** (same id `move.*`). Forge
  `tree.move` is not a twin OpSet.
- Today’s Forge vim kit maps `Ctrl+Super+hjkl` to **swap**; proto maps
  `Ctrl+h` to **Join**. After stripSuper those are the same chord.
  **Mark 2 table wins.** Swap, if kept, gets a different chord. Do not
  silently keep Forge swap on the Join chord.
- Safe kit may keep Ctrl+Super grammar as a **Forge overlay** of the
  same action ids.

## Code home (P1c)

```text
lib/keybinds/actions.js     # id list
lib/keybinds/mark2.js       # Super-bearing table
lib/keybinds/strip-super.js
```

Proto: `stripSuper(mark2Table) ∪ protoOverlay`.
Forge vim/Mark 2: `mark2Table`.
Tests: proto chords ≡ stripSuper(Forge Mark 2 chords) for every shared
id. A mismatch fails CI in **both** trees.
