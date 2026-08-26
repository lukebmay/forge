# Task: CA7 — Extract tree layout compute

**Plan:** [forge-codebase-audit.md](../plans/forge-codebase-audit.md)  
**Status:** done (A/B AGREE)  
**Risk:** med  
**Mode:** A/B implement–verify  

---

## Goal

Move pure(ish) sizing/gap math out of `tree.js` into `lib/extension/tree-layout.js`. Tree keeps `processNode` orchestration and decoration/tab attach. No behavior change to percent/`0=equal`, min-size redistrib, or gaps.

**Target:** tree.js drops ≥300 lines (stretch higher if gap/split math moves cleanly).

---

## Primary files

- **New:** `lib/extension/tree-layout.js`
- `lib/extension/tree.js` — import + thin wrappers or direct calls
- Unit tests only if pure helpers gain a clean seam (optional; prefer existing regressions)

---

## Move candidates (priority)

| Symbol | Notes |
| --- | --- |
| `computeSizes` | percent → pixel sizes; T4 effective percents |
| `_minSizeInOrientation` | recursive; needs tiled-children + size hints |
| `_redistributeForMinSizes` | pure arrays |
| `_mostShrinkableIndex` | pure arrays |
| `processGap` | pure-ish rect + settings gaps if injectable |
| `applyMargins` | pure-ish |

**Keep in tree.js:** `processNode`, `processSplit` / stacked / tabbed geometry that attaches St decorations, `apply`, render, chrome.

**Pattern:** free functions taking needed deps (node, orientation helpers, getTiledChildren callback, settings for gaps) **or** a small module of pure math + Tree methods that delegate. Prefer pure where possible so unit tests can call without full Tree.

**Semantics to preserve:**
- `percent` 0 / missing → equal share (`1.0 / n`)
- grab-tile skips min-size and stored percents
- min-size only on HSPLIT/VSPLIT
- Bug #330 remainder folds onto most-shrinkable when mins active
- T4 writes effective percents after min paint without setting `userSized`

---

## Acceptance

- [x] Layout math lives outside tree.js (`computeSizes` / min-size redistrib / gap math as practical)
- [x] tree.js line count drops ≥300 vs pre-CA7 (~2909) → **2577 (−332)**; `tree-layout.js` **413**
- [x] `t4-sizing-policy` + `bug-s6g-minsize-redistribution` + related resize regressions green
- [x] Full `npm test` green (184 files / 1868 tests)
- [x] No intentional behavior change
- [x] Task + plan session notes updated

---

## Out of scope

- Tab chrome extract
- processNode St decoration attach
- Raising policy (CA6 done)
- Mass comment rewrite (CA8)

---

## Test plan

```sh
npm test
# focus:
#   tests/regression/t4-sizing-policy.test.js
#   tests/regression/bug-s6g-minsize-redistribution.test.js
#   tests/regression/bug-305-resize-boundary.test.js
#   tests/regression/bug-resize-three-windows.test.js
```

---

## Session note

**CA7 B (2026-07-26): AGREE**

Independent review of `tree-layout.js` + `tree.js` wrappers. No behavior drift found;
no code fixes required.

| Check | Result |
| --- | --- |
| Line count | tree.js **2577** (−332 from 2909); layout **413** — meets ≥300 drop |
| GRAB_TILE | `createEnum` → `"GRAB_TILE"`; matches `Window.WINDOW_MODES.GRAB_TILE` |
| percent 0/missing | equal share `1/n` preserved |
| grab-tile path | skips stored percents + min-size (verified offline smoke + tests) |
| min redistrib / #330 / T4 | logic byte-equivalent; write-back without `userSized` |
| processGap / margins | same; Waydroid skip intact; gap injected from Tree wrapper |
| stacked/tabbed | pure rects extracted; decoration attach still on Tree |
| imports/cycles | `tree-layout.js` has **no** tree import; no cycle |

**Tests (B re-run):** focused t4/s6g/305/resize 28/28; full `npm test` **184/1868** green.

**Next:** CA8. No commit.

---

**CA7 A (2026-07-26):** Extracted pure layout into `lib/extension/tree-layout.js`.

**Moved (free exports):** `computeSizes`, `minSizeInOrientation`, `redistributeForMinSizes`,
`mostShrinkableIndex`, `processGap`, `applyMargins`, `splitChildRect`, `decorationLayout`,
`stackedChildRect`, `tabbedChildRect`, `resetSiblingPercent`, `insertChildPercent`,
`redistributeSiblingPercent`, local `orientationFromLayout` (string enums, no tree import cycle).

**Stayed in tree.js:** `processNode` orchestration, `_applyDecorationRect` / `_ensureDecoration`
(St chrome), `processStacked`/`processTabbed` decoration attach (thin rect via TreeLayout),
`apply`/render/cleanTree/Node chrome.

**Tree API:** same public methods; thin wrappers inject `getTiledChildren`, gaps, settings margins.

**Sizes:** tree.js 2909 → **2577** (−332); tree-layout.js **413**.
