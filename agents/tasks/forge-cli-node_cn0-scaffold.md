# forge-cli-node_cn0-scaffold — `cli/` + shared purity inventory

**Status:** ready — start **after TD1** (or if TD1 files are idle and
operator asks to parallel)  
**Plan:** [forge-cli-node](../plans/forge-cli-node.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-14  
**Agent:** `grok-4.5` as 4.5 **low** (mechanical). Do not redesign.

## Goal

Create the Node CLI directory and write down which `lib/shared` files
Node may import. Land the `lib/shared` **gi-free** rule (D036) as
docs + a canary import. No user-facing command yet.

## Acceptance

- [ ] `cli/package.json` is `{ "name": "forge-cli", "private": true, "type": "module" }`
- [ ] `lib/shared/package.json` is `{ "type": "module" }` (silences
      typeless-package warning)
- [ ] `cli/README.md` lists node-safe vs `gi://` files (copy from
      the plan table; update if you find another `gi://` import)
- [ ] `cli/README.md` states FIRM: no `gi://` / `node:` / `fs` /
      `process` in new `lib/shared/` files
- [ ] `cli/smoke-import.mjs` imports `listKits` from
      `../lib/shared/keybind-presets.js` and prints kit ids
- [ ] `node cli/smoke-import.mjs` exits 0; stdout includes
      `safe`, `vim`, `i3`
- [ ] `tests/unit/cli/smoke-import.test.js` spawns that file
- [ ] Full `npm test` still green
- [ ] **No** rename of `scripts/forge/*`
- [ ] **No** change to `~/.local/bin/forge`
- [ ] **No** extract of `forge-config-home` (that is CN3)
- [ ] **No** new npm dependencies

## Context for the next agent (complete + succinct)

### Proven (2026-08-14, Node 24.3)

```js
import { listKits } from "../lib/shared/keybind-presets.js";
```

works from a repo-root `.mjs`. `forge-config-home.js` **fails**
(`gi://` → `ERR_UNSUPPORTED_ESM_URL_SCHEME`).

### Node-safe today

`keybind-presets.js`, `settings-keys.js`, `settings-control.js`,
`keybind-conflicts.js`, `gnome-overrides.js`, `rival-tilers.js`.

Also (in `lib/extension/`, not shared): `settle-math.js`,
`run-steps.js` (`partitionMixedSteps`).

### gi-bound (do not import from Node)

`forge-config-home.js`, `settings.js`, `config-sync.js`, `theme.js`,
`logger.js`.

### Test

```bash
node cli/smoke-import.mjs
npm test -- tests/unit/cli/smoke-import.test.js
npm test
```

### Risks

Do not flip root `package.json` `"type": "module"`. Only `cli/` and
`lib/shared/` get `"type": "module"`.

## Session note

**2026-08-14:** Task drafted at lock. No code.
