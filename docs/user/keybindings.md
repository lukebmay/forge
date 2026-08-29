# Keybindings

## Source of truth

Forge keeps a **live cheatsheet** of *your* current chords (Safe default:
**`Ctrl+Super+/`**; Vim kit: **`Super+Shift+/`**). Prefer that overlay over any
static table when you have customized binds.

Live state is **GSettings / dconf** (`org.gnome.shell.extensions.forge.keybindings`).
It survives reboot. Named kits and portable JSON are optional backups (below).

Forge shortcuts do **not** appear in GNOME Settings → Keyboard. That panel only
lists GNOME/custom entries.

---

## Why the kits look the way they do

| Idea | Why |
| --- | --- |
| **Bare `Super+…` is user space** | Launchers, GNOME, and desktop custom binds almost always live on Super. Shipping a tiling WM that grabs `Super+h/j/k/l` by default surprises most GNOME users. |
| **Safe ≠ recommended** | Install must not stomp. Daily tiling wants denser Super+ maps — those are **opt-in kits**, not the schema default. |
| **One primary modifier family** | Safe uses **`Ctrl+Super`** for almost everything so the map is learnable. **`Ctrl+Shift+Super`** only for *twins* of the same key (move vs focus, always-float vs float). Random mix of Shift+Super vs Ctrl+Super without a rule was accidental legacy. |
| **Lock = `Super+Delete` (all kits)** | Rare global action; keeps letter keys free. (Historical `Super+q` was a launcher collision.) |
| **Zoom = Enter (Vim / i3)** | Full / horizontal / vertical: `Super+Enter` / `Ctrl+Super+Enter` / `Shift+Super+Enter`. Safe leaves Super+ free, so zoom stays unbound there. GNOME `toggle-maximized` is cleared while Forge is enabled. |
| **`Super+m` (Vim)** | Mark 2 `toggleSplit`. Safe/i3 leave `Super+m` unbound (monocle was removed). |
| **Run = Space (Vim / i3)** | `Super+Space` (empty command = GNOME Run a Command). GNOME input-source Super+Space is cleared while Forge is enabled. |
| **Float = Alt+Super+Enter (Safe / Vim)** | Leaves zoom on Super+Enter. **i3:** `Shift+Super+Space`. Always-float: `Ctrl+Shift+Super+Space`. |
| **Rare chrome off bare Super+** | **Focus border** and **tiling master toggle** almost never fire — multi-mod only. |
| **Border = `Ctrl+Super+b`** | **b**order. (Legacy `Super+x` / `Ctrl+Super+x` was arbitrary.) |
| **Tiling master = `Ctrl+Super+e`** | **e**nable / disable Forge tiling for the session. (Legacy `Super+w` meant “window” vaguely and fought Super+w habits; not a strong mnemonic.) |
| **Vim kit** | Power map: vim-style focus on `Super+hjkl`, move on Shift, join on Ctrl+Super. |
| **i3 kit** | Approximate i3 muscle memory (focus hjkl, move Shift+hjkl, splits `b`/`v`/`e`, zoom on Enter). Not a full i3 mode system. |
| **No silent kit rewrite on install** | Live dconf stays until you load a kit. `./install` **warns** when live chords match no kit (stale after we change Vim/i3). Re-load: `./install --kit=vim` or `forge keybind load vim`. |

Workflow we want: **load a kit → tweak → Save as your kit**.

---

## Safe is the install default — not the recommendation

Fresh installs and **Restore Safe defaults** use **Safe** only so Super+ stays free.

**Safe is not a power-user recommendation.** Try **Vim** or **i3**, then save your own.

### Safe modifier grammar

| Layer | Modifiers | Role |
| --- | --- | --- |
| **Primary** | `Ctrl+Super` | Almost all actions |
| **Secondary** | `Ctrl+Shift+Super` | Twin of the same key |
| **User space** | bare `Super+…` | Not used by Safe |

### Safe kit (full)

| Action | Chord |
| --- | --- |
| Focus ←↓↑→ | `Ctrl+Super+arrows` |
| Move ←↓↑→ | `Ctrl+Shift+Super+arrows` |
| Join h/j/k/l | `Ctrl+Super+h/j/k/l` |
| Toggle float | `Alt+Super+Enter` |
| Always-float (app) | `Ctrl+Shift+Super+Space` |
| Group chrome (tab ↔ stack) | `Ctrl+Super+g` |
| Split orientation (H ↔ V) | `Ctrl+Super+s` |
| Split H / V (force) | `Ctrl+Super+z` / `Ctrl+Super+v` |
| Tabbed to/from split | `Ctrl+Super+t` |
| Merge into tabbed group | `Ctrl+Super+m` |
| Ungroup parent container | `Ctrl+Shift+Super+m` |
| Focus parent / child | `Ctrl+Super+a` / `Ctrl+Shift+Super+a` |
| Move in / out of container | `Ctrl+Super+,` / `Ctrl+Shift+Super+,` |
| Toggle tab decoration | `Ctrl+Shift+Super+t` |
| Focus border | `Ctrl+Super+b` (**b**order; rare) |
| Toggle tiling mode | `Ctrl+Super+e` (**e**nable tiling; rare) |
| Toggle workspace tiling | `Ctrl+Shift+Super+w` |
| Open preferences | `Ctrl+Super+.` |
| Lock screen | `Super+Delete` (all kits) |
| Reload config | `Ctrl+Super+r` |
| Cheatsheet | `Ctrl+Super+/` |
| Launch app | `Ctrl+Shift+Super+Enter` (empty command = GNOME Run a Command) |
| Equalize sizes | `Ctrl+Super+=` |
| Expand / shrink | `Ctrl+Super+]` / `Ctrl+Super+[` |
| Swap last active | `Ctrl+Super+Enter` |
| Layout debug overlay | `Ctrl+Super+d` |
| Gap ± | `Ctrl+Super++` / `Ctrl+Super+-` |
| Edge resize (grow) | `Ctrl+Super+y/u/i/o` (left/bottom/top/right) |
| Edge resize (shrink) | `Ctrl+Shift+Super+o/i/u/y` |
| Snaps / cyclic focus | unbound |

**Resize vs Window Size:** cheatsheet **Resize** is edge
`window-resize-*` (grow/shrink one side on the owning split). **Window Size** is
expand / shrink / golden (`[`/`]` family) — both axes via owning-split steps.
Same category split as the live cheatsheet.

Forge still frees a few GNOME defaults while enabled (edge-tile keys, maximize,
toggle-maximized, etc. — see `gnome-overrides`). Those restore on disable.

---

## Vim kit (recommended starter)

Prior Forge power-user map. Uses bare Super+ freely.

| Action | Chord |
| --- | --- |
| Focus h/j/k/l (also arrows) | `Super+h/j/k/l`, `Super+arrows` |
| Move h/j/k/l | `Shift+Super+h/j/k/l` |
| Join h/j/k/l | `Ctrl+Super+h/j/k/l` |
| Toggle float | `Alt+Super+Enter` |
| Always-float (app) | `Ctrl+Shift+Super+Space` |
| Zoom full / H / V | `Super+Enter` / `Ctrl+Super+Enter` / `Shift+Super+Enter` |
| Toggle split (H ↔ V) | `Super+m` |
| Toggle tab/stack | `Super+n` |
| Cycle layout | `Super+[` / `Super+]` |
| Promote / promote recursive | `Super+{` / `Super+}` |
| Size nudge | `Alt+Super+hjkl` |
| Size share / presets | `Alt+Super+yuio` / `nm,.` / `/` / `7890` |
| Split H / V (force) | `Super+z` / `Super+v` |
| Stacked / tabbed (to/from split) | `Shift+Super+s` / `Shift+Super+t` |
| Merge into tabbed group | `Shift+Super+m` |
| Focus parent / child | `Super+p` / `Shift+Super+p` |
| Move in / out of container | `Shift+Super+,` / `Ctrl+Shift+Super+,` |
| Tab decoration | `Ctrl+Alt+y` |
| Focus border | `Ctrl+Super+b` |
| Toggle tiling | `Ctrl+Super+e` |
| Workspace tiling | `Shift+Super+w` |
| Preferences | `Super+.` |
| Lock screen | `Super+Delete` |
| Reload / cheatsheet | `Shift+Super+r` / `Shift+Super+/` |
| Launch app | `Super+Space` (empty command = GNOME Run a Command) |
| Equalize sizes | `Super+=` |
| Swap last active | `Super+Tab` |
| Layout debug | `Ctrl+Super+d` |
| Gap ± | `Ctrl+Super++` / `Ctrl+Super+-` |
| Snaps (center / thirds) | `Ctrl+Alt+c` / `d/e/g/t` |
| Edge resize | same family as Safe (`Ctrl+Super` y/u/i/o + Shift twins) |
| Split chrome show-all | unbound (prefs Appearance; grab forces show-all) |

**Why this shape:** focus is the hottest action → shortest chord (`Super+letter`).
Move adds Shift (heavier). Join adds Ctrl so three roles share hjkl without
colliding. Parent/child is `p` / `Shift+p`. `m`/`n` toggle split and
tab/stack; `[`/`]` cycle layout. Size is Alt+Super (D081).

---

## i3 kit (recommended, i3-inspired)

Approximate i3 layout on Forge actions (not a full i3 config).

| Action | Chord |
| --- | --- |
| Focus h/j/k/l (+ arrows) | `Super+h/j/k/l`, arrows |
| Move (+ arrows) | `Shift+Super+h/j/k/l` (+ arrows) |
| Join | `Ctrl+Super+h/j/k/l` (Forge-only; i3 has no exact twin) |
| Float | `Shift+Super+Space` (Enter is zoom) |
| Always-float | `Ctrl+Shift+Super+Space` |
| Zoom full / H / V | `Super+Enter` / `Ctrl+Super+Enter` / `Shift+Super+Enter` |
| Split toggle / H / V | `Super+e` / `Super+b` / `Super+v` |
| Stacked / tabbed (to/from split) | `Super+s` / `Super+w` |
| Group chrome (tab ↔ stack) | `Shift+Super+n` |
| Merge into tabbed group | `Shift+Super+m` |
| Ungroup parent container | `Ctrl+Shift+Super+m` |
| Focus parent / child | `Super+a` / `Shift+Super+a` (i3 `$mod+a` class) |
| Move in / out of container | `Shift+Super+,` / `Ctrl+Shift+Super+,` |
| Tab decoration | `Shift+Super+w` |
| Snap center (not fullscreen) | `Super+f` (Wave Z may map to zoom full) |
| Expand / shrink | `Super+]` / `Super+[` |
| Edge resize | same family as Safe (`Ctrl+Super` y/u/i/o + Shift twins) |
| Split chrome show-all | unbound (prefs Appearance; grab forces show-all) |
| Launch app | `Super+Space` (empty command = GNOME Run a Command) |
| `Super+m` | **unbound** (was monocle; free for later — zoom uses Enter) |
| Lock | `Super+Delete` |
| Cheatsheet / reload | `Shift+Super+/` / `Shift+Super+r` |
| Focus border / tiling master | `Ctrl+Super+b` / `Ctrl+Super+e` (shared; rare) |

**Why this shape:** i3 users expect Super+hjkl and Shift to move containers.
`Super+b/v/e` and `s/w` mirror common i3 split/layout keys. Where Forge actions
have no i3 twin, we pick free Super+ keys or keep Forge’s Ctrl+Super join row.
(`window-unfocus` / `Ctrl+Super+Esc` is abandoned — not in any kit.)

---

## Keybind kits in Preferences

**Preferences → Keyboard → Keybind kits**

| Kit | Role |
| --- | --- |
| **Safe** | Install default only — not recommended for daily tiling |
| **Vim** | Recommended Super+hjkl starter |
| **i3** | Recommended i3-inspired Super+ map |

Applying Vim/i3 (or any Super+ kit) shows a **confirmation** with conflict notes
when GNOME or other Forge actions share a chord.

**Your kits:** name → Save / Load under

`FORGE_KEYBIND_PROFILES_DIR` when set (shellrc exports
`$shellrc/configs/forge/keybinding-profiles`), else
`~/.config/forge/config/keybinding-profiles/<name>.json`.

Prefs **Save** / **Load** and the CLI share the same files and rules:

| Action | Prefs | CLI |
| --- | --- | --- |
| Save live map | **Save** with a name | `forge keybind save my-kit` |
| Load saved map | **Load** | `forge keybind load my-kit` |
| Load built-in | kit toggles, or **Load** `vim`/`safe`/`i3` | `forge keybind load vim` |

Both write/read `…/keybinding-profiles/<name>.json` with the same JSON shape
(`version`, `mod-mask-mouse-tile`, `bindings`, `name`). Built-in names
`vim` / `safe` / `i3` are reserved (cannot overwrite as a user profile).
`forge keybind status` reports whether live matches a built-in kit.

Daily install that also refreshes Vim:

```bash
./install --kit=vim
# or: forge install --kit=vim
```

Same shape as portable `keybindings.json`.

**Conflicts** row on that page scans Forge vs itself and vs GNOME
wm/shell/mutter (+ custom shortcuts when readable).

---

## Portable export

**Preferences → Portability** can also write
`~/.config/forge/config/keybindings.json` (and settings). See [config.md](config.md).

---

## Drag to tile

**Tab strip:** drag a tab along its bar to reorder (float + gap); drag off
the bar to peel into normal tile drag — see
[layouts.md](layouts.md#tab-strip-drag-chrome-like).

**`mod-mask-mouse-tile`:** `None` (default — any drag can tile) or hold
`Super` / `Ctrl` / `Alt` / `Shift` for the tile preview.
`preview-hint-enabled` draws the drop-zone hint.

---

## Implementation pointers (developers)

| Piece | Path |
| --- | --- |
| Kit data + apply | `lib/shared/keybind-presets.js` |
| Conflict scan | `lib/shared/keybind-conflicts.js` |
| Schema defaults (= Safe) | `schemas/…gschema.xml` keybindings section |
| Prefs UI | `lib/prefs/keyboard.js` |
| Registration | `lib/extension/keybindings.js` → `Main.wm.addKeybinding` |
