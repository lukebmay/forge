# Design notes

Interesting “why” decisions for humans and agents. Not a changelog.

## Soft rehome on workareas thrash (H1)

**Problem:** Overnight GNOME auto-lock → wake (especially dual 4K + hybrid GPU)
fires a burst of `workareas-changed` while Mutter may shove windows onto the
primary. Tree keys are `mo${index}ws${ws}`; if Forge eagerly follows
`window-entered-monitor` / `Meta.Window.get_monitor()` mid-thrash, every tile
piles under one monitor node and stays there after both heads return.

**Approach:**

1. On quiet renders, snapshot per-window **last-good** `{ monitorIndex, frame }`
   from the tree (not thrashy Meta).
2. On `workareas-changed` (with windows, no workspace add/remove), set a thrash
   pending flag and debounce (~200ms). While pending, ignore
   `window-entered-monitor` rehomes.
3. On settle: resolve each window’s target monitor by **max intersection area**
   of last-good frame with current monitor geometries; `move_to_monitor` first;
   then one `_reconcileWindowHomes()` so intact CONs migrate together; render.
4. If a target `moNwsW` node is missing → fall back to `reloadTree` + layout-group
   restore (existing path).

**Not done here:** stable EDID/connector IDs (H2/M1 if still needed), gdisplays
connector remap (shellrc), session layout apply.

**Tests:** `tests/regression/bug-h1-soft-rehome-workareas-thrash.test.js`,
utils `bestMonitorIndexForRect`.
