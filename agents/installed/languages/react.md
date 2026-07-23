# React

**Precedence:** ESLint (react/typescript-eslint), Prettier, `tsconfig`, framework conventions (Next/Vite/Remix) override this file.

JS: `agents/languages/javascript.md`. TS: `agents/languages/typescript.md`. UX principles: `agents/languages/web-frontend.md`.

## Style

- Function components + hooks; avoid new class components
- One component per file when non-trivial; colocate small helpers
- Hooks: top level only; stable dependency arrays; extract custom hooks for reuse
- State: lift only as far as needed; prefer local state over global by default
- Lists: stable `key`s (not array index unless static)
- Effects: synchronize with external systems — not derived render logic
- Accessibility: semantic HTML first; aria only when needed
- Naming: `PascalCase` components; `camelCase` hooks/vars; `use*` for hooks

## Files

- Prefer `.tsx` for components with markup when TypeScript is in use
- Match existing project layout (`components/`, feature folders, etc.)

## Tools

- Format: Prettier
- Lint: ESLint + TypeScript as configured
