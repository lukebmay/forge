# Prototypes

Self-contained design sandboxes hosted in this repo. **Not** forge product code:
separate `package.json`, no imports from `lib/` / `cli/`, not built or installed
with the extension.

| Dir | Purpose |
| --- | --- |
| [`container-motion/`](./container-motion/) | 2D tree motion / container atomics playground |

Each prototype documents its own `npm start` (or equivalent). Agents: treat these
as disposable UX labs — do not wire them into Shell, tests, or install paths.
