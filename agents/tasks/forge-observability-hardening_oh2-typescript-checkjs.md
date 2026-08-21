# forge-observability-hardening_oh2-typescript-checkjs — JSDoc + checkJs, no casual `any`

**Status:** ready  
**Plan:** [forge-observability-hardening](../plans/forge-observability-hardening.md)  
**Branch:** master  
**Blocker:** (none) — prefer after OH1 adapter exists so new modules are typed at birth  
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

- [ ] Audit `tsconfig.json`: `allowJs` + `checkJs` kept; document any gaps
  (`skipLibCheck`, `noImplicitAny`, `strictNullChecks` — tighten what does not
  explode the tree; record what stays loose and why)
- [ ] Add / expand JSDoc `@typedef` / `@param` / `@returns` on public boundaries
  in `lib/shared/*` and hot extension modules (layout plan, open-min, DnD
  intent, monitor policy, session-api ops)
- [ ] Ban casual `/** @type {any} */` and untyped `any` casts in `cli/` and
  `lib/shared/`; replace with real types or `unknown`
- [ ] Escape-hatch policy written in task/plan: when `any` is allowed (e.g. raw
  Meta/GObject bags) — require a one-line reason comment
- [ ] `npx tsc --noEmit` (or project script) runs in CI-ish local check; fix or
  quarantine errors introduced by this task
- [ ] New code from OH1/OH3 lands with JSDoc types (no new untyped public APIs)
- [ ] No mass file rename to `.ts`

## Context for the next agent (complete + succinct)

- Repo already has `tsconfig.json` with `allowJs`/`checkJs` over `lib/**`,
  `extension.js`, `prefs.js`, and `@girs/*`
- GJS + Vitest: types must not assume Node globals in extension modules
- Hot `any` examples today: `cli/launch-lib.mjs` rect/window casts — fix or
  justify
- Prefer typing pure JSON shapes in `lib/shared/` first (layout plan, open
  policy) — highest ROI for multi-ws bugs

## Session note

Ready. Sequence after OH1 starts so logger/assert APIs are typed as they land.
