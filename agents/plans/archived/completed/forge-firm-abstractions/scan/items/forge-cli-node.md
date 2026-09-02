# forge-cli-node

**Verdict:** post-refactor
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-cli-node.md

## Stated status

Locked (2026-08-14); CN0–CN6 + CN13 shipped (CN7 skip; CN8–CN12 cancelled as written); leftover **CN14** (`nested` + `test live` + leftover Python jobs CLI) and **CN15** (delete Python control CLI).

## Leftovers

- **CN14** — Port `nested` / `test live` (and leftover jobs CLI) off Python *or* leave them on CN13’s `spawnSync(python3, [scripts/forge/forge, …])` forever. Dev harness; lowest user-facing value. Still Python today (`nested_wayland.py`, `live_matrix.py`, `live_cli.py`, `scripts/forge/forge`).
- **CN15** — Delete `scripts/forge/forge` and leftover `.py` when no spawn remains; keep zsh install plane; grep path updates. Mechanical, after CN13 leftovers are gone.
- **Not this plan:** CN8–CN12 layout list/plan/apply (cancelled; belong to in-process ApplyLayout / kernel import, not `cli/`).
- **Shipped inside this plan (close as done, do not re-queue):** CN0 scaffold, CN1 exec helper, CN2 keybind, CN3 `lib/shared/paths.js`, CN4 DBus ping/tree, CN5 thin DBus verbs, CN6 launch/run-steps, CN13 PATH `cli/forge.mjs` + `cli/job-runner.mjs`.

## Why this verdict

Option 2 keeps CLI as a **surface**, not a kernel. D036 already locked: product policy in gi-free `lib/shared/`, Node `cli/` facades, GJS prefs/extension facades. That architecture is landed through CN13.

CN14/CN15 are leftover language-migration of **dev harness + Python delete**. They are not TOM/OpSet/presenter work. Porting `nested_wayland.py` / `live_matrix.py` during a kernel lift would churn the living test entrypoints for no kernel gain. Do not pull the remainder into firm-abstractions.

CN0–CN13 are complete inside this spine — do not reopen them as refactor slices. The live plan should park (not stay on PRIORITY beside the kernel).

## Destination

PRIORITY parked list **after** kernel/import: `forge-cli-node#CN14` then `#CN15`. Archive the spine to `plans/archived/completed/` only when those leftovers are done or explicitly wontfix. Do not archive yet (CN14/15 still real).

## Absorb

- **D036 (keep):** `lib/shared/` = no `gi://`, no `node:`, no `process`/`fs`. Prefs/extension/CLI are facades over the same pures. Do not invent `pures/` or a second shared tree.
- **CLI shape (keep):** PATH `cli/forge.mjs`; leftover Python only via CN13 spawn; zsh install plane stays under `scripts/forge/*.zsh`.
- **FIRM from this plan that still binds:** no `gi://` in `cli/`; no new npm runtime deps; no TypeScript; delete Python body in the same slice that Node reaches parity; preserve `forge <cmd>` argv/stdout/exit; missing `node` → 127.
- **Do not absorb:** layout planner/apply port into `cli/` (CN8–CN12 cancelled). ApplyLayout / planner JS is kernel+extension import, not this plan.
- **Do not absorb:** CN14 nested/live matrix as a kernel slice — those stay a post-refactor CLI/harness job (see `forge-ai-live-test-matrix` / `forge-wayland-rc-test-suite` for the living harnesses themselves).
