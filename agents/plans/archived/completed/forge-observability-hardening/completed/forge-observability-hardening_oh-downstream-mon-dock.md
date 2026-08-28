# forge-observability-hardening_oh-downstream-mon-dock — Monitor identity + same-mon dock launch

**Status:** done
**Plan:** [forge-observability-hardening](../plans/forge-observability-hardening.md) § Downstream
**Branch:** master
**Blocker:** (none) — soft host verify [oh-ws-orphan-host-verify](../blockers/oh-ws-orphan-host-verify.md) does not block
**Updated:** 2026-08-23
**Model:** Grok 4.5

## Goal

Make monitor identity and same-monitor dock / open placement **falsifiable with
traces**, then close the remaining product gaps from OH Downstream:

1. **Left dock → left insert** (symmetric right) — sticky dock mon already
   largely shipped (D007 / dock-sticky-mon); verify with TRACE + fix regressions.
2. **Single-dock fallback chain** when only one dock / dock miss ambiguity:
   **last-focused insert → end-of-tree insert → nearest groupable to last
   focused → float** (OH1 product ask; open-min overflow already covers some
   of the tab/float end — wire or prove the chain end-to-end for dock opens).
3. **Monitor identity** — keep tree/apply/rehome using stable fingerprints
   (`lib/extension/monitor-identity.js`) correctly under index churn; add/fix
   TRACE at remap / wrong-mon decisions so live hunts are queryable.

Do **not** re-litigate D039–D044 / belt / PlaceNext mon-root. Do **not** wait
on soft human host verify.

## Acceptance

- [x] Product behavior matches Downstream table for same-mon dock + single-dock
      fallback (unit coverage for each branch; nest smoke when JS changed)
- [x] Monitor identity / wrong-mon decisions emit queryable TRACE/DEBUG
      (`forge log --grep` friendly); no new journal INFO
- [x] L0 green for touched paths (`WindowManager-open-app-policy`,
      `lft-mru`, `monitor-identity`, related open-min if touched)
- [x] Nest campaigns use **`./install --dev`** then
      `./scripts/forge/forge-test nested …` (TRACE). Stop nest before handoff.
- [x] Session note overwritten with paths, proven vs guessed, enable/test cmds
- [x] No commit/push unless operator asked (git.md)

## Context for the next agent (complete + succinct)

### Product locks

| Lock | Detail |
| --- | --- |
| D007 | Dock sticky = pointer geometry; never rehome dock by focus |
| D013 | Empty LFT(m) → last tile on mon; single dock pending wins appId drift |
| D027 | Empty dest head beats LFT/focus; dock still wins |
| D049 | Overflow → same-mon tab BFS → float (open-min); no shrink-probe |
| D068 | `./install --dev` → TRACE; hunt with `forge log` not `tail` |
| OP1 | DESIGN § Open-app placement |

### Code map

| Concern | Path |
| --- | --- |
| Placement pure | `lib/extension/lft-mru.js` `resolveOpenAppPlacement` |
| Plan + branch logs | `lib/extension/window.js` `_planOpenAppPlacement` (branches: place-hint, dock-mon-lft, dock-end-of-tree, dock-same-mon-focus, last-focused, end-of-tree, placement) |
| Insert chain logs | `trackWindow` DEBUG `track insert branch=` (`nearest-groupable` / `open-min-float` / …) |
| Open-min / float end | `lib/extension/open-min-place.js` via `_decideOpenMinPlacement` |
| Monitor fingerprints | `lib/extension/monitor-identity.js` (`listIndexRemaps`) · consumers: workareas-policy, tree-snapshot, session-layout, tree, window refresh, monitor-recovery |
| Units | `tests/unit/window/WindowManager-open-app-policy.test.js`, `tests/unit/extension/lft-mru.test.js`, `tests/unit/extension/monitor-identity.test.js` |
| Contracts | `docs/dev/contracts.md` — New-window home / Monitor fingerprint rows |

### Retest (FIRM)

```bash
cd ~/dev/me/forge
./install --dev
npx vitest run tests/unit/window/WindowManager-open-app-policy.test.js \
  tests/unit/extension/lft-mru.test.js \
  tests/unit/extension/monitor-identity.test.js
./scripts/forge/forge-test nested run -- forge ping
forge log --grep 'open-plan|nearest-groupable|monitor-identity|wrong-mon' --level debug+ --last 80
./scripts/forge/forge-test nested stop   # if interactive nest left up
```

Install **only** from durable `~/dev/me/forge` (not `~/.grok/` worktrees).

### Proven already (pre-this-slice)

- Dock sticky mon + LFT(m) / end-of-tree / same-mon focus upgrade
- OH1 pepper logs open-plan `branch=`
- open-min late-adopt + env floor
- Host tip Wayland session `F7UjZ` after `forge update --dev`

### Risks

- Host dual-4K left-dock eyes-on still soft ([oh-ws-orphan-host-verify](../blockers/oh-ws-orphan-host-verify.md)) — nest is 1×FHD
- Free-open beside TABBED still prefers bag wrap when mins allow (D032) over
  strict OP1 tab-after; Downstream chain uses open-min tab as nearest-groupable
- Touching PlaceNext / ApplyLayout slots — out of scope

## Session note

**2026-08-23 implementer (Grok 4.5)** — Downstream closed on units + nest smoke.

### Survey (proven vs gap)

| Ask | Already satisfied | Gap closed this slice |
| --- | --- | --- |
| Left dock → left insert | D007 sticky + mon0 end-of-tree unit (`dock-nautilus-left`); dual-mon dock≠focus | Reordered dock attach: **same-mon focus → LFT(m) → end-of-tree**; DEBUG branches |
| Single-dock chain | open-min tab BFS → float (D049) | Units for focus-first, end-of-tree, dock nearest-groupable, dock float; `track insert branch=nearest-groupable\|open-min-float` |
| Monitor identity hunts | fingerprints + remapIndex consumers | `listIndexRemaps` + TRACE on refresh; H1 `wrong-mon tree→target key=` TRACE |

### Files changed

- `lib/extension/monitor-identity.js` — `listIndexRemaps`
- `lib/extension/window.js` — dock chain order; insert DEBUG branches; identity refresh TRACE
- `lib/extension/monitor-recovery.js` — wrong-mon TRACE in H1 target loop
- `tests/unit/extension/monitor-identity.test.js` — remap list cases
- `tests/unit/window/WindowManager-open-app-policy.test.js` — single-dock + dock open-min chain
- `docs/dev/contracts.md` — New-window home + monitor fingerprint rows

### Commands / results

```bash
./install --dev   # v49-90-beta.2-389-g45bcfad-dirty
npx vitest run tests/unit/window/WindowManager-open-app-policy.test.js \
  tests/unit/extension/lft-mru.test.js \
  tests/unit/extension/monitor-identity.test.js
# → 99 passed
./scripts/forge/forge-test nested run -- forge ping   # ok; nest stopped
forge log --grep 'nearest-groupable|open-plan branch=dock' --level debug+ --last 40
```

**Nest stopped:** yes (`nested status` → running False).

**Not done / remaining:** no product code gap for this task. Soft host dual-mon
dock eyes-on stays on the host-verify blocker (does not reopen this task).

**No commit/push** (operator did not ask).
