# JavaScript

**Precedence:** `eslint.config.*`, Prettier, and package scripts override this file.

shellrc inspiration (`configs/eslint.config.js`, `prettierrc.conf`): 2-space indent; printWidth/max-len **100**; semicolons; double quotes; trailing commas `es5` / always-multiline in ESLint; `eqeqeq`; Unix linebreaks; arrow parens always.

## When

Use node/bun/deno when the project is already JS-based or you need its ecosystem. Otherwise prefer Python/zsh for general scripting.

Typed JS → `agents/languages/typescript.md`. React/JSX → `agents/languages/react.md`.

## Style

- Prefer modern ECMAScript; match module system already in the tree (CJS vs ESM)
- `const`/`let` only (no `var`)
- Strict equality (`===`)
- Async: `async`/`await` over mixed raw promise chains when clearer
- Unused vars: trailing `_` often ignored by local ESLint — follow project rules
- Prefer small pure functions; avoid hidden global state

## Tools

- Format: Prettier
- Lint: ESLint (flat config in shellrc templates)
