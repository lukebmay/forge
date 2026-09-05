# forge-vinyl-inkscape-investigatory — Nest Inkscape + test vinyl equivalent

**Status:** Accepted
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-09-04
**Design:** Layout apply spine (`project.md`); R044 / R045 / R045b vinyl
PH / Inkscape WS2. D051 float-reason. Archived vinyl FLOAT plan is
history, not the hunt owner.
**Related:** [forge-design-e2e.md](./forge-design-e2e.md),
[forge-core-slot-geometry.md](./forge-core-slot-geometry.md) (chrome
gate is not this hunt).

## Goal

Find **why** Inkscape struggles to tile under a vinyl-shaped apply on
WS2, using **nest stories** and a **`_forge-test-*` profile** — never
personal `vinyl` / `dev`. Keep that test profile updated if save-file
format changes.

## Acceptance

- [x] Test profile `_forge-test-inkscape-ws2` (name MAY vary if taken)
      mirrors vinyl **topology**, not the personal file: mon0 Inkscape
      TILE; mon1 Ghostty | tab(YouTube) or nest-safe stand-ins documented
      in the profile comment. Lives with other `_forge-test-*`
- [x] Nest investigatory story (leaf under `trunk.layout`): apply that
      profile on **WS2** after a WS1 occupied apply (`_forge-test-one-ws`
      or equivalent). Oracles: Inkscape TILE in-slot on dest mon/ws;
      no leftover `forge-ph`; WS1 forest unchanged
- [x] Hunt from **nest** JSONL (`forge-test nested log`) names the
      failing phase (open / PlaceNext / PH bind / float-reason /
      Meta mon vs Forest `moNwsW` / hard-miss). Write the token +
      verdict on this plan’s session note
- [x] If the hunt names a product bug: REGRESSIONS row + failing L0
      **before** the patch (tests encode design). If nest cannot map
      Inkscape: record that as the gate, still ship the profile +
      story body
- [x] Agent never runs host `forge layout vinyl` / `dev`

## Context for the next agent (complete + succinct)

### Why this is investigatory

Host 2026-09-04: `forge layout vinyl` on WS2 did not layout properly.
R044/R045/R045b shipped PH workspace, PH consume-before-percent, and
role-matching leftover-PH. Host vinyl eyes remain. Do **not** re-patch
from memory — nest + logs.

Vinyl-shaped topology (from user docs / R044):

```text
WS2:  Mon0(Inkscape) | Mon1(H(Ghostty, TAB(YouTube, …)))
```

Use nest-isolated clients when Chrome/YouTube cannot map
(`smoke-nest-apps` / Ghostty+TextEditor stand-ins). Profile roles stay
generic; **no** `if inkscape` product branches (`project.md`).

### Proven

- R044: PlaceNext carries ApplyLayout workspace; nest inkscape/ghostty
  hard-done on WS2 (then). Hunt: `place-hint workspace move` / `ws=1`
- R045/R045b: PH consume + role-fallback; leftover-ph role match
- D051: Inkscape max → Meta `allows_resize=false` ≠ permanent no-resize
- Archived `forge-layout-vinyl-inkscape-float.md` — D051 landed; not
  this hunt
- HANDOFF: vinyl WS2 untested this login
- Nest layouts = `_forge-test-*` only (`testing.md`)

### Paths

- Profile dir: `layout/common/` + `layout/hosts/<host>/` (wayland-rc
  plan). Nest shares `FORGE_LAYOUT_DIR`. Add `_forge-test-inkscape-ws2`
  there; if save format changes, update **this** file in the same
  effort as product save
- Nest story catalog: `agents/plans/forge-design-e2e/stories.md`
- Hunt: `./scripts/forge/forge-test nested log --grep
  'place-hint|forge-ph|float-reason|open-miss|forest-match|inkscape' --level
  debug+ --last 80`
- L0 related: `tests/unit/extension/place-hint*.js`,
  `layout-placeholder`, `float-reason.test.js`

### Implementation slices

| Slice | What | Exit |
| --- | --- | --- |
| **VIN0** | Author `_forge-test-inkscape-ws2` + stories.md leaf (black-box oracles) | Profile + catalog exist |
| **VIN1** | Nest `--monitors=2` apply on WS2; hunt tape; session note verdict | Named phase or “Inkscape did not map” |
| **VIN2** | Only if product bug: REGRESSIONS + failing test then patch | Honest; no personal vinyl |
| **VIN3** | Geom after R061: TILE dest = Forest slot AABB (ε); skip min-clamp-learn on undersize; bounded same-dest present retry. No `force:true`. No `wm_class=Inkscape` | L0 R062 green. Nest remaining: **Meta grow-refuse** |

**Order:** VIN0 → VIN1 → VIN2 if needed → VIN3.

Can run **after** A/C/E/B (stability). Parallel with cheatsheet (F).
Do not share nest with other campaigns.

## Do not

- Branch: **master**. No commit/push unless operator asks
- Invent `Mark2Drop*`. No Forest←GObject dual-write. No
  `live-handle.js` growth
- Do not skip ROOT `move*`. Do not relocate dual-write into
  tree-api-nav
- Do not patch-only `computeSizes`. Do not ship whole-forest
  `MON_MISMATCH` RESYNC
- Do not reintroduce raw `move_to_monitor` at map. Do not port belt /
  Mode B / title→`renderTree` / entered-monitor maze
- Nest: `./scripts/forge/forge-test nested --trunk <id>` one CLI;
  hunt `forge-test nested log`; always stop nest. Agent does **not**
  host `layout`. Test layouts only `_forge-test-*`
- Install from `~/dev/me/forge` with `./install --dev` (TRACE)
- Proto brake: `cd prototypes/container-motion && npm test`
- Do not apply personal `vinyl` / `dev` / `t1`
- Do not special-case `wm_class=Inkscape` in product JS

## Enable / test

```text
cd ~/dev/me/forge && ./install --dev
./scripts/forge/forge-test nested --branch branch.layout.ws2-no-mutate-ws1
# then the new inkscape-ws2 leaf once VIN0 lands
./scripts/forge/forge-test nested log --grep 'place-hint|forge-ph|float-reason|open-miss' --level debug+ --last 80
./scripts/forge/forge-test nested stop
```

## Session note

2026-09-04 VIN0–VIN2 (nest). No host `layout vinyl`/`dev`/`t1`.

**Profile:** `$FORGE_LAYOUT_DIR/common/_forge-test-inkscape-ws2.json`
(`FORGE_LAYOUT_DIR=/home/luke/dev/me/shellrc/configs/forge/layout`).
Save-format dual-mon `tiles: [[inkscape],[ghostty,{tab:[TextEditor,ghostty]}]]`.
YouTube stand-in = `org.gnome.TextEditor` (profile comment). Fixture twin:
`tests/unit/cli/fixtures/layout/_forge-test-inkscape-ws2.json`.

**Story:** `leaf.layout.apply-inkscape-ws2` (parent `trunk.layout.apply-one-ws`,
`monitors=2`). `branch.layout.ws2-no-mutate-ws1` nest **PASS**.

**VIN1 hunt (pre-patch, nest JSONL):** PlaceNext **did** late-confirm Inkscape
`already-on-desk mon=0 ws=1 class=org.inkscape.Inkscape`. Then
`float-reason … TILE→FLOAT reason=type-modal-dialog`
`type=modal-dialog,noResize` (not transient). `forest-match` `mon0.inkscape`.
Mon0 `shape=()`; Inkscape FLOAT; mon1 `H(WINDOW,TAB(WINDOW,WINDOW))` OK.
Inkscape **did map**. First inkscape claim also `late mismatch re-queue`
(Ghostty title steal) then re-claim — not the fail gate.

**VIN2:** R061 + D110. Failing L0 first (`float-reason` R061). Dialog types
float **only if transient**; `no-resize` does not apply to those types.
No `wm_class=Inkscape` branch. `float-reason` debug now appends `flagsTag`.

**Post-patch nest:** Inkscape **TILE** `shape=WINDOW` on dest mon0/ws2; no
leftover `forge-ph`; layout CLI `ok=true`. Story still **FAIL** in-slot:
GetTree **700×651** (`width_ratio=0.373`) vs commanded **1878×1048**.
Hunt: `geom-epsilon … tag=ambiguous dMax=1178` `sx=42 sy=32 sw=1878 sh=1048`
`ow=700 oh=651` + `minClampLearn` on the Inkscape Meta id. D095 ambiguous
does not force. **Next:** D115 heal ladder
([forge-observe-agree-heal.md](./forge-observe-agree-heal.md)) — jitter
same-dest, learn min, TAB, FLOAT. Honest FAIL until that lands, not XFAIL.

**Nest:** `forge-test nested status` → `running: False`.

2026-09-04 VIN3 (geom after R061). No host `layout vinyl`. Did **not** revert D110.

**Diagnosis:** Dest was already the Forest slot (`sw=1878 sh=1048`). Meta stayed at map size (`ow=700 oh=651`). D095 `tag=ambiguous` did not retry. Epoch skip of min-clamp-learn does not help if learn runs **after** epoch leave on the still-small frame; oversized-frame learn vs a stale tiny slot can record 700 as min. Clamp-learn is frame **larger** than request — undersize is the opposite.

**Patch (generic):** `frameUndersizedVsCommand` / `decideUndersizeDestRetry`. Skip min-clamp-learn (`undersize-vs-command`). Bounded same-dest TILE retry (`geomUndersizeRetry`, cap 3, no force). Forest `paneRect` preferred for that learn slot. No Inkscape class branch.

**L0:** `WindowManager-tile-dest-undersize` (4), `geom-epsilon` undersize dest retry (2), `drop-intent` R062 min-learn skip (1). Related overflow-rehome still green. **50** in that trio + geom. R062 + D111.

**Post-fix nest** `leaf.layout.apply-inkscape-ws2` **FAIL** in-slot (honest, not XFAIL): TILE `shape=WINDOW` `class=org.inkscape.Inkscape` **700×651** (`width_ratio=0.373`) vs dest **1878×1048**. Tape: `geom-epsilon phase=undersize-retry` ×3 same dest; `min-clamp-learn skip id=… reason=undersize-vs-command`; no force. Ghostty/TextEditor settle `tag=agree`. **Remaining phase:** D115 heal ladder (jitter already retried ×3). Next:
learn min → TAB enter/wrap → FLOAT. Not `force:true`.

**Nest:** `forge-test nested status` → `running: False`.
