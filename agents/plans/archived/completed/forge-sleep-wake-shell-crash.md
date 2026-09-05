# forge-sleep-wake-shell-crash — Two Shell SEGV classes on wake

**Status:** complete (host sleep/wake PASS 2026-09-03)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-09-03

## Goal

Stop gnome-shell SIGSEGV on host sleep/wake (and post-crash restart). Two
distinct classes; do not collapse them.

## Crash classes

### 1. PRIMARY — session-layout rehome `move_to_monitor`

**Owner:** orchestrator (do not redo here).

Unlock → workareas settle → shield reapply →
`session-layout-restore` rehome called raw `metaWin.move_to_monitor`
when `get_monitor() === -1` (Wayland unready). Native SEGV.

**Fix in flight:** `safeMoveToMonitor` (`monitor-recovery.js`) from
rehome. Guard: `tests/regression/bug-sleep-wake-rehome-safe-move.test.js`.

### 2. SECOND — chrome / disposed St (this slice)

Journal:

1. **Sep 01 23:29 / Sep 02 10:36** — `present-chrome.js` St.BoxLayout
   already disposed → SEGV. **R051** shipped `actorAlive` on the TABBED
   present strip (`add_child` / strip / hide).
1. **Sep 02 11:42** — `node-chrome.js:203` / `:232` (tab close
   `closeFn` → `metaWin.delete`). Preceded by
   `st_widget_get_theme_node` on `window-tabbed-tab` / close button
   **not in the stage**.
1. **Sep 02 22:48** (post-crash restart) — `decoration.js:782+`
   `_destroyActorBorder`: `window_group.contains` / `hide` / `destroy`
   on disposed **St.Bin**. JS ERROR (GJS logs then throws); may not
   SEGV. try/catch still hits journal.

**Fix this slice:** skip/rebuild when actor dead; never St-call
disposed actors. Do **not** reconnect D100 handlers. Do **not** touch
session-layout rehome.

## Acceptance

- [x] Tab close/click on a disposed chip does not St-call or
      `Meta.delete`
- [x] Tab close skips `Meta.delete` when `isWindowAlive` is false
- [x] `_destroyActorBorder` / hide / show skip disposed St.Bin
- [x] Present does not `get_theme_node` a disposed window border
- [x] Host: sleep/wake after tip install — no chrome SEGV
      *(operator 2026-09-03: resume from sleep did not crash Shell)*

## Implementation

| Path | Gate |
| --- | --- |
| `lib/extension/node-chrome.js` | `deleteMetaFromTab` + `actorAlive` on close/click/press |
| `lib/extension/decoration.js` | `actorAlive` on border hide/show/restack/destroy + chrome layer |
| `lib/extension/present-chrome.js` | `actorAlive` before `get_theme_node` on `actor.border` |
| `lib/extension/adapter-map-admit.js` | border `destroy` sets `_forgeDisposed` |

**Guard:** `tests/regression/bug-r056-chrome-dispose-segv.test.js`
(R051 present-strip stays). Hunt: `metric warn deco-disposed`
`where=destroy-border`.

## Do not

- Dual-write Forest←GObject
- Reconnect D100 Meta handlers
- Redo PRIMARY `move_to_monitor` rehome
- Commit / push unless asked

## Session note

2026-09-03 — Host sleep/wake **PASS** (operator: resume from sleep did
not crash). Plan complete. D102 present-hold + `safeMoveToMonitor`
stay. L0: `bug-r056` + R051 + `bug-sleep-wake-rehome-safe-move`.
