# Task: CA6 — Raise / restack policy note + light DRY

**Plan:** [forge-codebase-audit.md](../plans/forge-codebase-audit.md)  
**Status:** done — A/B **AGREE**  
**Risk:** med (stacking is brittle)  
**Mode:** A/B implement–verify  

---

## Goal

Document one stacking policy in DESIGN.md. Extract only a **safe** shared raise helper if call sites are trivial duplicates. Do **not** unify fullscreen demote / Wayland stack / make_above paths.

---

## Primary files

- `docs/DESIGN.md` — expand § Raise / restack
- Optionally: tiny helper (e.g. `safeRaise(meta)` in utils or focus) only if call sites are trivial try/catch duplicates
- Avoid: fullscreen demote paths without tests

---

## Acceptance

- [x] DESIGN lists: tab click, focus mgr, session raise, float-under-fullscreen exception
- [x] No regression in:
  - `bug-tab-click-activate`
  - `bug-d5mm-focus-restack`
  - `bug-5l9b-raise-float-under-fullscreen`
  - `bug-jnfk-wayland-focus-stacking`
- [x] If code DRY: ≤ one small helper; no behavior change (**docs-only** — no helper; only local `raiseWin` in session restore)
- [x] Full `npm test` green
- [x] Task + plan session notes updated

---

## Out of scope

- Rewriting Wayland stack timeouts
- lastTabFocus id churn fix (product bug)
- Unifying make_above / fullscreen demote into the raise helper
- Tree layout extract (CA7)

---

## Test plan

```sh
npm test
# focus:
#   tests/regression/bug-tab-click-activate.test.js
#   tests/regression/bug-d5mm-focus-restack.test.js
#   tests/regression/bug-5l9b-raise-float-under-fullscreen.test.js
#   tests/regression/bug-jnfk-wayland-focus-stacking.test.js
```

---

## Session note

**CA6 B (2026-07-26): AGREE.** Docs-only; `git diff` is DESIGN.md + plan/task
notes only — zero `lib/` / behavior changes. Spot-checked call sites against
code: `_activateFromTab`, `FocusManager` stack/tab/hover, `raiseAfterSessionRestore`
(+ local `raiseWin`), `raise-float` + untiled rehome `_aboveDemotedForFullscreen`
skip, Wayland `_forgeStackTimeoutId` 50ms in `_activateWindowNode`, demote /
`make_above` / decoration separate. DESIGN completeness OK (incl. Wayland).
No helper added (correct). Full `npm test`: 184 files / **1868** passed; four
raise regressions green.
