# Container motion prototype

Interactive sandbox for forge **2D tree motion** (peel, sibling move, wrap, group,
flatten, multi-monitor geometry) without GNOME Shell.

Self-contained under `prototypes/` — own deps, no forge runtime imports.

Related plan: [`agents/plans/forge-container-motion-design.md`](../../agents/plans/forge-container-motion-design.md).

## Run

```sh
cd prototypes/container-motion
npm install
npm start
```

Open [http://localhost:5177/](http://localhost:5177/).

## Chrome

| Control | Where |
| --- | --- |
| **☰** | Settings — left overlay over views/atomics (no resize) |
| **Atomics** | Left slide-out — pushes / resizes desk+tree |
| **Keybinds** | Right overlay — slides over views (no resize) |
| **Dump tree** | `console.log` summary + raw forest |
| **Desk / Tree / Split** | Title bar view mode |

Ops and selection also log to the browser console. Main desk/tree views do not
scroll; drawers scroll if needed.

Weird trees and empty group spacers are intentional — use **Flatten** to collapse
1-child CONs when you want.

State persists in `localStorage` (`forge.container-motion.v1`). **Reset all** clears it.
