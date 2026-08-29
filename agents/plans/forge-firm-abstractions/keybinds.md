# Shared keybind core

**Status:** locked (D080, **D081** kit content, **D085** adapters)
**As of:** 2026-08-28

Proto exists to find Forge bugs. Two chord tables with the same labels
and different actions is a failed prototype. Historical Forge vim kit
(Super+a parent, Ctrl+Super+hjkl swap, …) is **not** the kit — proto
right-hand reach is.

## Decision

One **gi-free** table: **action id → chord**, Super-bearing (product).
**Vim / Mark 2 kit = proto right-hand main-reach** (D081). Proto is the
condensed app; as proto goes, so does Forge proper.

| Adapter | What it does |
| --- | --- |
| **Keybind core** (kernel) | Action id → Super-bearing Mark 2 table |
| **KeybindAdapterGnome** | That table as GNOME accels |
| **KeybindAdapterWebView** | `stripSuper(table)` plus a **proto overlay** |
| **Gnome Safe / i3** | Host overlays on the **same action ids** — not a second Mark 2 table |

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

Both keybind adapters dispatch these ids into the **same** OpSet.
Drift of id → behavior is a bug.

## Vim kit (right-hand reach — D081)

Product chords (Forge = Super-bearing; proto = stripSuper):

| Reach | Action |
| --- | --- |
| `hjkl` (+ arrows) | `focus.*` |
| `Shift+hjkl` | `move.*` (Mark 2 Move) |
| `Ctrl+hjkl` | `join.*` (Mark 2 Join — **not** swap) |
| `p` / `Shift+p` | `focus.parent` / `focus.child` |
| `m` / `n` | `toggleSplit` / `toggleTabStack` |
| `[` / `]` | `layout.cycle-` / `layout.cycle+` |
| `{` / `}` | `promote` / `promoteRecursive` |
| `Alt+hjkl` | size nudge |
| `Alt+yuio` | float this / +sibs / sibs / +parent |
| `Alt+nm,.` / `Alt+/` | float parent family / all |
| `Alt+7890` | in-axis presets |

**Not** the kit: leftover proto `yuio` extra-focus, `Ctrl+yuio` TreeOp
swap, `z`/`v` setLayout, peel moveIn/Out, merge-group. Those were proto
sandbox or old Forge vim.

## Overlays (domain cruft — keep off the core table)

**Proto only:** `a` = launch toy WINDOW, `q` / Backspace = Remove,
merge-tag `t` / Escape, TreeOp `Delete` without settle, `f` flatten.
Browser/test. Not product chords.

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
