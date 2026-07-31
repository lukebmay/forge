# Discussion plan: Resize sugar keys + auto-tiling

**Status:** Discussion / draft (no implement until product lock)  
**Updated:** 2026-07-31  
**Branch:** (none yet — discussion only)  
**Kind:** Product discussion → later tasks  
**Unrelated to:** [forge-layout-sizes.md](./forge-layout-sizes.md) (custom share preserve)  
**Scope cut (2026-07-31):** **Structural** resize (owning-split edge resolver,
Size vs Resize naming) is **in**
[forge-first-class-containers.md](./forge-first-class-containers.md) Wave R —
interleaved with container work. **This plan only keeps** ratio-step (yuiop) +
auto-tile algorithms (optional, not critical path).

### Session note (overwrite)

Opened as discussion plan from user request. No A/B implement until
human locks key chord + algorithm shortlist.

## Problem A — Quick double / ratio resize

Want a **fast** way to grow/shrink the focused tile’s share (width or height
along parent split), from:

1. **CLI** — e.g. `forge size double` / `forge size 2/3` / `forge resize …`
2. **Keybind** — especially **vim kit**, home-row-ish letters

### Sketch: `yuiop` family (vim mode)

User sketch (resize mod keys + `yuiop`):

| Key | Intent (draft) | Unit |
| --- | --- | --- |
| `i` | Reset siblings to **equal** | — (same as `window-reset-sizes`) |
| `u` | Shrink focused ~**1/3** of current share? or of parent? | third |
| `o` | Grow focused ~**1/3** | third |
| `y` | Shrink ~**1/2** | half |
| `p` | Grow ~**1/2** | half |

**Open design questions**

1. **One dimension only** — parent is HSPLIT (width) or VSPLIT (height). Focused
   window’s parent CON decides axis. Nested: expand against pair (existing
   `wm.expand` / percent math). No second axis without a layout cycle.
2. **What does “1/3” mean?**
   - **A:** multiply focused share by 2/3 or 4/3 (relative)
   - **B:** move ±1/3 of **parent** toward/away from pair (absolute ppt-ish)
   - **C:** snap focused to fixed targets (1/3, 1/2, 2/3, golden) cycling
3. **Double width/height** — special case: focused becomes 2× current share
   (capped), pair absorbs debit; or snap to 2/3 of parent?
4. **Mod chord** — reuse existing resize mods (`Ctrl+Super` edge family) or a
   dedicated “ratio resize” mod? Avoid clashing with edge y/u/i/o
   (Safe kit already uses y/u/i/o for **edges**).
5. **CLI surface** — mirror keybind ops:
   - `forge size equal`
   - `forge size grow|shrink [--third|--half|--factor N]`
   - `forge size set 0.67` / `forge size double`
6. **Tabbed/STACKED** — resize the **container** against its split pair (already
   how mouse resize works for tab groups), not a leaf inside the bag.

### Existing related surface

| Feature | Notes |
| --- | --- |
| `window-reset-sizes` | Equalize siblings (`Ctrl+Super+=` / Vim `Super+=`) |
| `window-golden-ratio` | Unbound by default |
| expand/shrink | Pixel delta via amount setting |
| Edge resize | Directional grab (y/u/i/o in Safe) — **not** ratio steps |

**Conflict risk:** Safe kit edge keys are already `y/u/i/o`. Vim kit may need
different letters or a distinct mod so ratio-step and edge-resize coexist.

## Problem B — Auto-tiling algorithms

Optional “smart place” when opening windows or on demand:

| Algorithm (candidates) | Sketch |
| --- | --- |
| **BSP / binary space** | Always split largest leaf (or focused) H/V alternating |
| **Master–stack** | One master + stack column (dwm-like); master share configurable |
| **Grid / columns** | N equal columns; new windows fill next cell |
| **Spiral** | Nested split spiral (awesome-like) |
| **Largest-empty** | Place next window in largest remaining rect |
| **Preserve + insert** | Current OP1/LFT + `new-window-size-policy` (already) |

### Design questions

1. Global mode vs one-shot “retile now”?
2. Per-monitor algorithm?
3. Interact with layout profiles (profiles win; auto only for unmanaged desks)?
4. How aggressive: only on new map, or continuous rebalance?

## Proposed product path (draft — not locked)

| Phase | Work |
| --- | --- |
| **D0** | Human lock: yuiop meaning + mod chord vs Safe edge keys; CLI verbs |
| **R1** | CLI size equal/grow/shrink/set/double + RunSteps/DBus if needed |
| **R2** | Vim-kit keybinds for locked chord; schema + kit docs |
| **A0** | Pick 1–2 auto-tile algorithms for spike (recommend: master–stack + largest-empty) |
| **A1** | Implement spike behind setting / CLI `forge tile <algo>` |

## Acceptance (when implemented later)

- Discussion decisions recorded in this plan + DESIGN.md.
- CLI + keybind for ratio resize without breaking Safe edge kit.
- At least one auto-tile path is optional and documented.

## Explicit non-goals (now)

- Implementing keybinds before D0 lock
- Replacing layout profiles with always-on auto-tile
- Pixel-perfect i3 `resize set` IPC

## Human blockers

| Item | Kind |
| --- | --- |
| Lock yuiop semantics + mod keys | design |
| Choose auto-tile shortlist | design |
