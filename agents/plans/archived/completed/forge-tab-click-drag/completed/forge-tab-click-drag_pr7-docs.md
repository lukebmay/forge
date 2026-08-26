# forge-tab-click-drag_pr7-docs — Contracts and user docs

**Status:** done
**Plan:** forge-tab-click-drag
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-18

## Goal

Document shipped tab click-drag (PR1–PR15): chrome layer, float+gap
reorder, peel/MOVE APP, wrap prefs, pointer-center scoot, release
residual clear. Docs/contracts only — **no product code**.

## Acceptance

- [x] `docs/dev/contracts.md` — catalog rows for strip reorder / peel /
      chrome pickability / mid-drag pack as shipped (named APIs; no twin paths)
- [x] `docs/dev/actions.md` — Chrome live drag / float+gap (not outline)
      behavior where actions list tab chrome
- [x] `docs/DESIGN.md` — short narrative for tab chrome layer + wrap
- [x] `docs/DECISIONS.md` — new D0xx for Chrome live reorder (when shipping
      this docs slice) if not already present
- [x] `docs/user/layouts.md` — user-facing wrap prefs / strip behavior
- [x] `docs/user/troubleshooting.md` — overlay leftover vs trackChrome;
      stuck chip / residual clear
- [x] `docs/user/layout.md` — only if cold-layout prose still implies old
      strip model
- [x] TD4 one-liner folded: update
      `agents/plans/forge-tab-chrome-drag.md` (TD4 done via PR7)
- [x] Document pointer-center scoot + `clearTabDragResiduals` on release
- [x] No product JS/CSS changes; no ApplyLayout / FCC / spanning chrome
      redesign

## Context for the next agent (complete + succinct)

- Plan § PR7: `agents/plans/forge-tab-click-drag.md` (~2280)
- Shipped through PR15 — see `agents/plans/forge-tab-click-drag/completed/`
- Preserve: PR9 foreign spacer-only; PR10 synthetic peel; PR12 one layout
  owner; PR13 chip+event coords; PR15 residual locks
- Do not re-litigate D039–D044; mon-local groups (D044) stay
- TD4 was deferred into this docs PR (`forge-tab-chrome-drag.md`) — now done
- Follow `agents/installed/documentation.md` + `markdown.md`

## Session note

**2026-08-18 PR7 docs done.** Documented tip PR1–PR15 (pointer×center scoot,
`clearTabDragResiduals`, float+gap — not outline).

### Files

| Path | Change |
| --- | --- |
| `docs/dev/contracts.md` | Catalog: chrome layer, wrap, reorder commit, live preview, peel, residual clear |
| `docs/dev/actions.md` | § TabChromeDrag (D046) |
| `docs/DESIGN.md` | § Tab chrome layer + Chrome live drag |
| `docs/DECISIONS.md` | **D046** Chrome live tab strip DnD |
| `docs/user/layouts.md` | Tab strip drag + wrap prefs table |
| `docs/user/keybindings.md` | Drag-to-tile one-liner → layouts (TD4) |
| `docs/user/troubleshooting.md` | Overlay vs trackChrome; stuck chip / residual |
| `agents/plans/forge-tab-chrome-drag.md` | TD4 **done** via PR7 |

### Intentional gaps

- `docs/user/layout.md` — **unchanged**. Cold-layout / sugar prose does not
  teach the old outline strip-drag model (`active` “does not reorder” is
  still correct profile semantics).
- Live in-app cheatsheet stays keybind-driven; TD4 one-liner is docs, not a
  new cheatsheet row.

### Risks

- Host tip may still be pre-PR15 until operator reload — docs describe tip
  code, not a stale session.
- No product JS/CSS touched; no commit/push.
