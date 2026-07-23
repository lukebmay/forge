# TypeScript

**Precedence:** `tsconfig.json` / `tsconfig.*.json`, ESLint typescript-eslint, Prettier, and package scripts override this file.

JS style baseline: `agents/languages/javascript.md`. React: `agents/languages/react.md`.

shellrc inspiration: ESLint TS parser/plugin; unused-vars via `@typescript-eslint`; same Prettier/indent as JS (2 spaces, max-len 100).

## When

Default for app code when the repo is already TS. Prefer `.ts` / `.tsx` over plain JS for new modules in a TS tree.

## Style

- Prefer `strict` (or project-equivalent) — don’t weaken compiler options casually
- Types at **boundaries** (APIs, exports, public functions); infer locals when obvious
- Avoid `any`; use `unknown` + narrow, or precise unions
- Prefer `interface` / `type` consistently with the file/project
- `readonly` / `as const` when values must not mutate
- Don’t fight the compiler with excess assertions; fix the types
- Enums: prefer string unions or `as const` objects unless the codebase already uses enums
- Imports: match project (`project-relative` vs path aliases in tsconfig)

## Tools

- Check: `tsc --noEmit` (or project script)
- Lint: typescript-eslint
- Format: Prettier
