# Window rules

Rules tell Forge to **float** a window that would normally tile (dialogs, launchers,
games), **force-tile** one that would normally float, or **ignore** a window entirely
(stronger than float). Forge ships ~40 default float/tile rules for common apps
(JetBrains splashes, Conky, ddterm, GNOME setup dialogs, …). There is **no** bundled
ignore list — ignore is user config only.

## Two ways to add a rule

- **Preferences → Windows** — "Add Floating Window": type the window class (and
  optionally a title); Forge saves a **float** rule. This is the easy path for float.
- **Toggle shortcuts** — the per-window and per-class float toggles (see
  [keybindings](keybindings.md#common-defaults)) write a float rule for you.
- **Ignore** — edit `windows.json` by hand (`mode: "ignore"`). Prefs/keybind capture
  for ignore may come later.

## The file: `~/.config/forge/config/windows.json`

```json
{
  "overrides": [
    { "wmClass": "Conky", "mode": "float" },
    { "wmClass": "jetbrains-idea", "wmTitle": "splash", "mode": "float" },
    { "wmClass": "Calculator", "mode": "tile" },
    { "wmClass": "SomeOverlayApp", "mode": "ignore" }
  ]
}
```

Each override:

| Field | Required | Meaning |
| --- | --- | --- |
| `wmClass` | yes* | Window class to match. **Exact** match (case-sensitive); comma-separates a list of exact classes. |
| `wmTitle` | no | Window title. Substring; `!` prefix negates; comma-separates multiple patterns. |
| `mode` | yes | See modes below. |
| `wmId` | — | Runtime-only (written by the per-window toggle); don't set by hand. |

\* Title-only float/ignore rules (no `wmClass`) are supported by the engine for
special cases; prefer class matches for stable config.

### Modes

| `mode` | Forge behavior |
| --- | --- |
| `float` | Not tiled; still **tracked** (tree node FLOAT, borders/processFloats, may raise). Good for dropdowns, dialogs, tools you still want Forge-aware. |
| `tile` | Force into the tile tree even if the window type would float. |
| `ignore` | **Hands-off:** no tree node, no decorations, no open/session layout claim, no LFT. Mutter manages the window alone. Use when float is still too involved (true overlays). |

After hand-editing, reload with **`Super+Shift+r`** (or restart the extension). A
new `ignore` rule also drops any already-tracked match on override reload.

## Finding a window's class

```bash
xprop WM_CLASS      # then click the window
```

Use the **second** string it prints (the class), or read it from GNOME Looking
Glass (`Alt+F2` → `lg`).

> Precedence: a `tile` override for a window/class wins over float-by-type and float
> rules, so you can force-tile one window of an otherwise-floating class. A
> per-window toggle never removes a class-wide rule. **`ignore` wins over float and
> tracking** — matching windows are never managed (edit the file to undo).
