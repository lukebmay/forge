# P1a — Lift proto TOM → `lib/tom/`

**Status:** done
**Updated:** 2026-08-27
**Implementer:** Grok 4.5 (mechanical lift; not a reshape)
**Brake:** `cd prototypes/container-motion && npm test` → **ALL PASSED (144 cases)**

## Goal

Same gi-free kernel in proto and product path. Source of truth is
`lib/tom/*.js`. Proto `src/tom/` re-exports.

## Landed

1. **`lib/tom/`** (kernel source):
   - `index.js`, `kernel.js`, `atomics.js`, `composed.js`, `queries.js`,
     `sizing.js`, `api.js`, `shorthand.js`
   - `package.json` `{ "type": "module" }` (same as `lib/shared/`)
   - Relative imports / JSDoc `import('…')` use `.js` (not `.mjs`)
   - Comment still says `monitors.mjs` (world file stays in proto)

2. **Proto shims** `prototypes/container-motion/src/tom/*.mjs`:
   - `export * from "../../../../lib/tom/<file>.js"`
   - `// @ts-check` + JSDoc `@typedef` re-exports for Forest/Node/…
   - Callers unchanged (`tree.mjs`, mark2, transact, harness, cases-*)

3. **Vite:** `prototypes/container-motion/vite.config.js` —
   `server.fs.allow: ["../.."]` (repo root) so the shim path is served.

4. **Brake:** `npm test` — shorthand 6, atomics 45, composed 14, opset 59,
   workflow 20 → **ALL PASSED (144 cases)**.

Settle (`cleanupStructure` / `collapseUnary` / `pruneEmptyCons`) still in
`composed`. `Forest.decisions` / `mergeTags` still present. Those are
P1b / P2.

## Do not (still)

- Edit `lib/extension/tree.js` or `window.js`
- Move Mark 2 / keybinds / monitors / presenters into `lib/tom/`
- Extract `lib/rulesets/` (P1b)
- Strip `decisions` / `mergeTags` (P2)
- Add `lib/tom` to `tsconfig.check.json`
- Commit or push

## Done when

- [x] `lib/tom/` is the kernel source
- [x] proto tests import it (via shim)
- [x] `cd prototypes/container-motion && npm test` green
- [x] Forge still loads old `lib/extension/tree.js` (untouched)

## Remaining

- **P1b** — extract RuleSet settle to `lib/rulesets/{core,mark2}.js`
- **P1c** — shared Super-bearing keybind table
- GJS import of `lib/tom` from extension — later slices
