# Shared keybind core

**Status:** locked (D080, **D081** kit content, **D085** adapters, **D088** overlays)
**As of:** 2026-08-28

Proto exists to find Forge bugs. Two chord tables with the same labels
and different actions is a failed prototype. Historical Forge vim kit
(Super+a parent, Ctrl+Super+hjkl swap, …) is **not** the kit — proto
right-hand reach is.

## Decision

One **gi-free kernel** table: **action id → chord**, Super-bearing
(product). **Vim / Mark 2 kit = proto right-hand main-reach** (D081).
Proto is the condensed app; as proto goes, so does Forge proper.

Each **KeybindAdapter unions a host overlay** onto that table (D088).
The overlay is adapter-local. Adapters do not import each other's
overlay. Same chord may bind different overlay **ids**.

| Adapter | What it does |
| --- | --- |
| **Keybind core** (kernel) | Action id → Super-bearing Mark 2 table |
| **KeybindAdapterGnome** | Kernel table as GNOME accels ∪ Gnome overlay |
| **KeybindAdapterWebView** | `stripSuper(kernel ∪ WebView overlay)` |
| **Gnome Safe / i3** | Gnome overlays on the **same kernel ids** — not a second Mark 2 table |

`stripSuper`: drop Super/Meta from each chord; leave Ctrl/Shift/Alt/key.
WebView has no Super key, so the adapter stores Super-bearing chords
and strips them for the proto desk.

```text
<Super>h              →  h
<Shift><Super>h       →  Shift+h
<Ctrl><Super>h        →  Ctrl+h
<Alt><Super>Return    →  Alt+Return
<Super>a              →  a
<Super>q              →  q
```

## Action ids (shared contract)

Ids are OpSet (or core query) names, not `window-move-left` and not
`tree.move`. Examples:

`focus.left` · `move.left` · `join.left` · `launch` · `remove` ·
`toggleSplit` · `size.nudge.x-`

Both keybind adapters dispatch **kernel** ids into the **same** OpSet.
Drift of kernel id → behavior is a bug. Overlay-only ids (`host.quit`,
proto flatten/tags) stay on that adapter.

## Vim kit (right-hand reach — D081)

Product chords (Forge = Super-bearing; proto = stripSuper of the same
table):

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
| `Alt+yuio` | size=`share` this / +sibs / sibs / +parent |
| `Alt+nm,.` / `Alt+/` | size=`share` parent family / all |
| `Alt+7890` | in-axis presets |

**Not** the kernel kit: leftover proto `yuio` extra-focus, `Ctrl+yuio`
TreeOp swap, `z`/`v` setLayout, peel moveIn/Out, merge-group. Those were
proto sandbox or old Forge vim.

## Overlays (adapter extend — D088)

**KeybindAdapterWebView** (Super-bearing names; proto `stripSuper`s):

| Chord | Action |
| --- | --- |
| `Super+a` | launch toy WINDOW |
| `Super+q` | OpSet `remove` (settle) |
| Backspace | `remove` |
| Delete | TreeOp destroy (no settle) |
| `f` | flatten |
| `t` / Escape | merge tags |

**KeybindAdapterGnome:**

| Chord | Action |
| --- | --- |
| `Super+q` | quit / close focused app (GNOME) |
| `Super+Delete` | lock |
| `Super+Return` family | zoom |
| `Super+Space` | run dialog |
| `Ctrl+Super+e` / `Ctrl+Super+b` | tiling master / focus border |
| prefs / cheatsheet | host/session |

Neither overlay is imported by the other. `Super+a` is **not** kernel
parent-focus (`Super+p` is). `Super+q` is **not** a kernel id.

## What this forces

- Product **Move is Mark 2 Move** (same id `move.*`). Forge
  `tree.move` is not a twin OpSet.
- P6a: shipping vim kit + CommandHandler dispatch `join.*` on the
  `Ctrl+Super+hjkl` chord (`window-swap-*` gsettings keys). SwapNext /
  last-active stay swap. Safe/i3 overlays use the same kernel ids.
- Safe kit may keep Ctrl+Super grammar as a **Gnome overlay** of the
  same kernel ids.

## Code home (P1c)

```text
lib/keybinds/actions.js     # kernel id list
lib/keybinds/mark2.js       # Super-bearing kernel table
lib/keybinds/strip-super.js
lib/keybinds/proto-overlay.js   # WebView overlay (not imported by Gnome)
lib/keybinds/gnome-overlay.js   # Gnome overlay (not imported by WebView)
```

Proto: `stripSuper(mark2Table ∪ webViewOverlay)`.
Forge vim/Mark 2: `mark2Table` ∪ Gnome overlay.
Tests: proto chords ≡ stripSuper(Forge Mark 2 chords) for every **shared
kernel** id. Overlay-only chords must not appear on the other adapter.
A mismatch fails CI in **both** trees.
