# forge-observability-hardening_oh2-typescript-checkjs — JSDoc + checkJs, no casual `any`

**Status:** done  
**Plan:** [forge-observability-hardening](../../forge-observability-hardening.md)  
**Branch:** master  
**Blocker:** (none)  
**Priority:** **P0**  
**Model:** **Grok 4.5**  
**Reasoning:** **high**  
**Updated:** 2026-08-21

## Goal

Make forge’s TypeScript posture real without a full `.ts` migration: tighten
**JSDoc + `checkJs`**, type hot boundaries, and eliminate casual `any` except
where a huge hand-rolled type would be required.

## Model rationale

Mostly mechanical hygiene + judgment on escape hatches across a large JS tree.
**4.5 high** is enough; escalate to **4.6 high** only if `tsconfig` / module
resolution fights GJS+Vitest in a structural way.

## Operator lock (ACK’d)

- **JSDoc + `checkJs` first** — keep `.js` for GJS/extension
- Full `.ts` migration is **not** this task
- `any` only when avoiding a huge manual type surface; prefer `unknown` + narrow

## Acceptance

- [x] Audit `tsconfig.json`: `allowJs` + `checkJs` kept; document any gaps
  (`skipLibCheck`, `noImplicitAny`, `strictNullChecks` — tighten what does not
  explode the tree; record what stays loose and why)
- [x] Add / expand JSDoc `@typedef` / `@param` / `@returns` on public boundaries
  in `lib/shared/*` and hot extension modules (layout plan, open-min, DnD
  intent, monitor policy, session-api ops)
- [x] Ban casual `/** @type {any} */` and untyped `any` casts in `cli/` and
  `lib/shared/`; replace with real types or `unknown`
- [x] Escape-hatch policy written in task/plan: when `any` is allowed (e.g. raw
  Meta/GObject bags) — require a one-line reason comment
- [x] `npx tsc --noEmit` (or project script) runs in CI-ish local check; fix or
  quarantine errors introduced by this task
- [x] New code from OH1/OH3 lands with JSDoc types (no new untyped public APIs)
- [x] No mass file rename to `.ts`

## Root vs focused tsconfig

| Config | Role |
| --- | --- |
| `tsconfig.json` | Editor / broad `allowJs`+`checkJs` over full `lib/**` + extension entry + `@girs/*`. **Stays loose** — no `strict`, no `noImplicitAny`, no `strictNullChecks`. Full-tree `tsc` is **not** the OH2 gate (huge / noisy / hang risk). |
| `tsconfig.check.json` | **CI-ish OH2 gate.** Focused include: shared pures + open-min / drop-intent / tree-layout / workareas / monitor-identity + `cli/plog.mjs` + `types/forge-ambient.d.ts`. |

**Run:** `npm run typecheck:oh2` (= `tsc -p tsconfig.check.json --noEmit`). Cap ~120s; never unbounded full-tree tsc.

## Escape-hatch policy

`any` / loose bags **only** when a full hand-rolled type would be Meta/GObject-sized
or a versioned JSON IR too large for this slice. Prefer `unknown` + narrow, or a
small `@typedef`.

| Allowed | How |
| --- | --- |
| `gi://*` modules | `types/forge-ambient.d.ts` — `any` default export + minimal `Gio.File`/`Settings` JSDoc names |
| Vendored `third_party/pansi/*` | `// @ts-nocheck` — typed boundary is `cli/plog.mjs` + `lib/shared/plog-adapter.js` |
| Layout profile / plan action JSON | `@typedef {Record<string, any>} LayoutJson` / `PlanAction` in `layout-plan.js` — one-line escape note |
| Meta / tree node GObject bags in extension | Prefer `object` / `unknown` + narrow; if `any` must stay, one-line reason comment |

**Forbidden:** casual `/** @type {any} */` casts in `cli/` / `lib/shared/` without reason.

## Quarantine / deferred (not blocking OH2)

- Full-tree `tsc -p tsconfig.json` — deferred; root stays loose on purpose
- Mass typing of `lib/extension/*` Meta bags (tile-select, tree-snapshot, …) — out of focused include
- Full layout IR typedef (beyond `LayoutJson` bag) — deferred
- `cli/launch-lib.mjs` not in focused include (anys removed; optional later add)

## Context for the next agent (complete + succinct)

### Landed

- Durable `tsconfig.check.json` + `npm run typecheck:oh2` (**green**)
- `types/forge-ambient.d.ts` — gi stubs, Node `process`/`NodeJS`, Gio JSDoc names
- Deleted probe leftovers: `tsconfig.oh2-focus.json`, `tsconfig.oh2-probe.json`, `tsconfig.oh2-shared.json`
- JSDoc on hot boundaries: layout-plan / layout-open / open-min-place / drop-intent /
  workareas-policy / assert / plog-adapter / cli/plog
- Casual `@type {any}` removed from `cli/launch-lib.mjs` + `lib/shared/*`
- Vendored pansi `@ts-nocheck` (wrappers remain typed)

### Verify

```bash
npm run typecheck:oh2
npm test -- tests/unit/shared/assert.test.js tests/unit/cli/plog.test.js tests/unit/shared/plog-adapter.test.js
```

### Next

OH1–OH3 **done**. Resume multi-ws / monitor / DnD / same-mon launch **with
traces**. Parked WIP: `stash@{0}` `36e02b267c1c2605ebd9e555d4d3d285aad9a751`
ws-orphan — restore carefully; do not drop.

## Session note

2026-08-21 — OH2 done. Focused checkJs green; root tsconfig stays loose.
Escape hatch = gi/pansi/LayoutJson bags with reason. No commit/push this slice.
