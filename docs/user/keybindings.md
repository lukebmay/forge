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
| **Lock = GNOME `Super+Delete`** | While Forge is enabled, GNOME screensaver moves from Super+L → Super+Delete so Super+L is free for focus-right. GNOME owns lock + panel sleep; Forge does not force DPMS. |
| **Float = Space under the kit’s primary mod** | **Safe / Vim:** `Ctrl+Super+Space` (Ctrl is the multi-mod family). **i3:** `Shift+Super+Space` (i3 tradition). Always-float twin: `Ctrl+Shift+Super+Space`. Old `Super+c` had no mnemonic. |
| **Rare chrome off bare Super+** | **Focus border** and **tiling master toggle** almost never fire — multi-mod only. |
| **Border = `Ctrl+Super+b`** | **b**order. (Legacy `Super+x` / `Ctrl+Super+x` was arbitrary.) |
| **Tiling master = `Ctrl+Super+e`** | **e**nable / disable Forge tiling for the session. (Legacy `Super+w` meant “window” vaguely and fought Super+w habits; not a strong mnemonic.) |
| **Vim kit** | Power map: vim-style focus on `Super+hjkl`, move on Shift, swap on Ctrl+Super. |
| **i3 kit** | Approximate i3 muscle memory (focus hjkl, move Shift+hjkl, splits `b`/`v`/`e`, float Shift+Space). Not a full i3 mode system. |
| **No auto-migrate on upgrade** | Your dconf values stay until you Apply a kit, Restore Safe, or import. |

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
| Swap h/j/k/l | `Ctrl+Super+h/j/k/l` |
| Toggle float | `Ctrl+Super+Space` |
| Always-float (app) | `Ctrl+Shift+Super+Space` |
| Group chrome (tab ↔ stack) | `Ctrl+Super+g` |
| Split orientation (H ↔ V) | `Ctrl+Super+s` |
| Split H / V (force) | `Ctrl+Super+z` / `Ctrl+Super+v` |
| Tabbed to/from split | `Ctrl+Super+t` |
| Merge into tabbed group | `Ctrl+Super+m` |
| Ungroup (one-level CON dissolve) | `Ctrl+Shift+Super+m` |
| Focus parent / child CON | unbound |
| Move unit out / into sibling CON | unbound |
| Toggle tab decoration | `Ctrl+Shift+Super+t` |
| Focus border | `Ctrl+Super+b` (**b**order; rare) |
| Toggle tiling mode | `Ctrl+Super+e` (**e**nable tiling; rare) |
| Toggle workspace tiling | `Ctrl+Shift+Super+w` |
| Open preferences | `Ctrl+Super+.` |
| Lock screen | `Super+Delete` (all kits) |
| Reload config | `Ctrl+Super+r` |
| Cheatsheet | `Ctrl+Super+/` |
| Launch app | `Ctrl+Shift+Super+Enter` |
| Resize — edge grow | `Ctrl+Super+y/u/i/o` (left/bottom/top/right) |
| Resize — edge shrink | `Ctrl+Shift+Super+o/i/u/y` |
| Resize — expand / shrink tile share | `Ctrl+Super+]` / `Ctrl+Super+[` |
| Resize — equalize sibling shares | `Ctrl+Super+=` |
| Swap last active | `Ctrl+Super+Enter` |
| Layout debug overlay | `Ctrl+Super+d` |
| Show-all split chrome | unbound by default (`split-chrome-show-all-toggle`) |
| Gap ± | `Ctrl+Super++` / `Ctrl+Super+-` |
| Snaps / cyclic focus | unbound |

Forge still frees a few GNOME defaults while enabled (edge-tile keys, maximize,
etc. — see `gnome-overrides`). Those restore on disable.

---

## Vim kit (recommended starter)

Prior Forge power-user map. Uses bare Super+ freely.

| Action | Chord |
| --- | --- |
| Focus h/j/k/l (also arrows) | `Super+h/j/k/l`, `Super+arrows` |
| Move h/j/k/l | `Shift+Super+h/j/k/l` |
| Swap h/j/k/l | `Ctrl+Super+h/j/k/l` |
| Toggle float | `Ctrl+Super+Space` (Ctrl-primary kits; i3 uses Shift+Space) |
| Always-float (app) | `Ctrl+Shift+Super+Space` |
| Group chrome (tab ↔ stack) | `Shift+Super+n` (**n**ode layout) |
| Split orientation (H ↔ V) | `Ctrl+Super+n` |
| Split H / V (force) | `Super+z` / `Super+v` |
| Stacked / tabbed (to/from split) | `Shift+Super+s` / `Shift+Super+t` |
| Merge into tabbed group | `Shift+Super+m` |
| Ungroup (one-level CON dissolve) | `Ctrl+Shift+Super+m` |
| Focus parent / child CON | unbound |
| Move unit out / into sibling CON | unbound |
| Tab decoration | `Ctrl+Alt+y` |
| Focus border | `Ctrl+Super+b` |
| Toggle tiling | `Ctrl+Super+e` |
| Workspace tiling | `Shift+Super+w` |
| Preferences | `Super+.` |
| Lock screen | `Super+Delete` |
| Reload / cheatsheet | `Shift+Super+r` / `Shift+Super+/` |
| Launch app | `Shift+Super+Enter` |
| Resize equalize / expand / shrink | `Super+=` / `]` / `[` |
| Swap last active | `Super+Enter` |
| Layout debug | `Ctrl+Super+d` |
| Show-all split chrome | unbound by default (`split-chrome-show-all-toggle`) |
| Gap ± | `Ctrl+Super++` / `Ctrl+Super+-` |
| Snaps (center / thirds) | `Ctrl+Alt+c` / `d/e/g/t` |
| Edge resize | same family as Safe (`Ctrl+Super` y/u/i/o + Shift twins) |

**Why this shape:** focus is the hottest action → shortest chord (`Super+letter`).
Move adds Shift (heavier). Swap adds Ctrl so three roles share hjkl without
colliding. Letter keys for float/split/tab match old Forge muscle memory.

---

## i3 kit (recommended, i3-inspired)

Approximate i3 layout on Forge actions (not a full i3 config).

| Action | Chord |
| --- | --- |
| Focus h/j/k/l (+ arrows) | `Super+h/j/k/l`, arrows |
| Move (+ arrows) | `Shift+Super+h/j/k/l` (+ arrows) |
| Swap | `Ctrl+Super+h/j/k/l` (Forge-only; i3 has no exact twin) |
| Float | `Shift+Super+Space` (i3 tradition; Safe/Vim use `Ctrl+Super+Space`) |
| Always-float | `Ctrl+Shift+Super+Space` |
| Split toggle / H / V | `Super+e` / `Super+b` / `Super+v` |
| Stacked / tabbed (to/from split) | `Super+s` / `Super+w` |
| Group chrome (tab ↔ stack) | `Shift+Super+n` |
| Merge into tabbed group | `Shift+Super+m` |
| Ungroup (one-level CON dissolve) | `Ctrl+Shift+Super+m` |
| Focus parent CON | `Super+a` (i3 `$mod+a`) |
| Focus child / move-out / move-in | unbound |
| Tab decoration | `Shift+Super+w` |
| “Fullscreen-ish” snap center | `Super+f` (not zoom; see REG-i3-super-f) |
| Launch app | `Super+Enter` |
| Lock | `Super+Delete` |
| Cheatsheet / reload | `Shift+Super+/` / `Shift+Super+r` |
| Focus border / tiling master | `Ctrl+Super+b` / `Ctrl+Super+e` (shared; rare) |
| Show-all split chrome | unbound by default (`split-chrome-show-all-toggle`) |
| Expand / shrink | `Super+]` / `Super+[` |
| `Super+m` | **free** — reserved for zoom full later (monocle removed) |

**Why this shape:** i3 users expect Super+hjkl and Shift to move containers.
`Super+b/v/e` and `s/w` mirror common i3 split/layout keys. `Super+a` is focus
parent (i3). Where Forge actions have no i3 twin, we pick free Super+ keys or
keep Forge’s Ctrl+Super swap row.

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

CLI: `forge keybind backup [name]`, `forge keybind apply vim|safe|i3`.

Same shape as portable `keybindings.json`.

**Conflicts** row on that page scans Forge vs itself and vs GNOME
wm/shell/mutter (+ custom shortcuts when readable).

---

## Portable export

**Preferences → Portability** can also write
`~/.config/forge/config/keybindings.json` (and settings). See [config.md](config.md).

---

## Drag to tile

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
