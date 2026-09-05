# Nest E2E harness (T2–T5)

**Plan:** [forge-design-e2e.md](../forge-design-e2e.md)
**Stories:** [stories.md](./stories.md)
**Updated:** 2026-09-04 (T5 `--rc` expected-fail)

Story **catalog + select + oracles + CLI** (T2), **trunk bodies** (T3),
**proof-loop suites = story tree** (T4), **`--rc` expected-fail hook**
(T5). Remaining leaves/branches stay unimplemented (honest non-zero).
Nest BVHnV trunk is **green**; host dock 1/3 is still **product**.

## How to run

Story campaigns need **one** of `--trunk` / `--branch` / `--rc`. There is
**no implicit default story**. `forge-test nested` without those flags is
still `status`. `proof-loop --suite core` **is** the seven trunks.

```bash
# Lightest net: one trunk only (prefix ok if unique)
./scripts/forge/forge-test nested --trunk trunk.open.launch-into-2slot
./scripts/forge/forge-test nested --trunk trunk.open --dry-run

# One branch + descendant leaves (not sibling trunks)
./scripts/forge/forge-test nested --branch branch.layout.ws2-no-mutate-ws1

# Full stories.md tree (RC). Skips leaf.float.fail-safe-terminator
# unless a fail-safe fixture exists. Unimplemented → non-zero.
./scripts/forge/forge-test nested --rc
./scripts/forge/forge-test nested --rc --dry-run

# Loop runner: suites = story tree (always-stop per case)
./scripts/forge/forge-test nested proof-loop --suite core --dry-run
./scripts/forge/forge-test nested proof-loop --suite core --iterations 1
./scripts/forge/forge-test nested proof-loop --suite rc --dry-run
./scripts/forge/forge-test nested proof-loop --trunk trunk.open --dry-run
```

`--dry-run` prints resolved ids and **exits 0**. It does not start nest.

Live `--trunk` / `--branch` starts nest via `nested run` / `_cli_run`
(**always-stop** unless `--keep` / `--keep-on-fail`), `--monitors` = max
of the selected stories (1 or 2). Do not start nest while the selected
set still has unimplemented bodies.

Day-to-day after a tiling/open/layout JS change: pick the lightest
**`--trunk`** from the stories.md tree map. To soak trunks:
`proof-loop --suite core`.

## Select

| Flag | Meaning |
| --- | --- |
| `--trunk <id>` | That **trunk only**. Prefix match if unique (`trunk.open` → `trunk.open.launch-into-2slot`). |
| `--branch <id>` | That branch **and** descendant leaves. Not a trunk. A leaf id is that leaf only. |
| `--rc` | Every `trunk.*` / `branch.*` / `leaf.*` in stories.md except `leaf.float.fail-safe-terminator` (skip unless fixture). Includes BVHnV. |

Cannot combine the three. Cannot combine `--suite` with `--trunk` /
`--branch` / `--rc`. Cannot combine with `start` / `smoke-*` / other
nested actions.

`--rc` and `proof-loop --suite rc` are the **same story tree**.
`proof-loop --suite core` is trunks only (always-stop per case).

## Oracles

Library: `scripts/forge/nest_oracles.py`. Input is GetTree / `forge tree`
JSON (`monitors[]`; FLOATS as `orphanWindows`). Failures are
`OracleError` — not PlaceNext, `parentNode is null`, or fingerprint-only
Join.

1. **Who sits where** — parent / children / order / H V TAB STACK
   (`assert_who_sits_where`, `Mon0(H(V(A,C),B))` shorthand).
1. **Mode** — TILE or FLOAT (`assert_mode`).
1. **Identity** — wm-class / pid / windowId (`assert_identity`).
1. **Visible Meta/rect** — open leaf only for TAB/STACK; share bands from
   `nest_proof.py` (`HALF_*` / `THIRD_*`, `assert_visible_fill_half`,
   `assert_visible_not_third`).
1. **D105 visible-only** — `assert_visible_only` checks **one** head.
   Other monitors may be missing or still mapping. Wrong visible pane
   still fails.

Share helpers in `nest_proof.py` are unchanged (`assert_siblings_fill_half`,
`assert_slot_not_third`).

## Unimplemented vs expected-fail

| Status | Meaning | Live exit (not dry-run) |
| --- | --- | --- |
| `unimplemented` | No runner yet | **non-zero** (do not pass; no nest). Not the same as expected-fail. |
| `expected-fail: yes` | Plan-named in-progress. **None** in the catalog (zero stories). Hook is plumbed. | Ready + fail → print `XFAIL` / `expected-fail`; `--rc` / `proof-loop --suite rc` is **not** hard red from that id alone. Unexpected fail still red. |
| ready fail (not expected) | Regression or flake | **non-zero** |

`--rc` and `proof-loop --suite rc` select the **full tree** (minus
`leaf.float.fail-safe-terminator` unless fixture). Unimplemented in that
set → not release-ready. A plan-named expected-fail is a ready story that
is allowed to fail.

Nest `trunk.open.launch-into-2slot` `expected_fail` is **false** (T3 live
PASS, `dock=false`). Host dock Nautilus 1/3 is a **different Given**
(layout+tab+dock) — product, not a nest expected-fail. Expect for that
trunk is unchanged.

**Not expected-fail (T4 flake):** `trunk.tabs.open-leaf-one-slot` and
`trunk.mark2.join-enter` can flake vs T3 PASS (`H(TAB,V) !=
H(TAB,WINDOW)`; TAB peers not one slot). Documented flake — do not mark
those ids expected-fail and do not weaken Join/tabs Expect.

## Rebuilt vs kept

**Rebuilt**

1. Catalog = `scripts/forge/nest_stories.py` (stories.md ids).
   `PROOF_CASES` is host/wake/tools only — not the nest spec.
1. `--trunk` / `--branch` / `--rc` on `forge-test nested` and on
   `proof-loop`.
1. `proof-loop --suite` = story tree (`core` trunks, `rc` full tree,
   `regression`/`chaos` loop core).
1. Black-box oracle library.

**Kept (do not regress)**

1. Nest isolation (`client_env`, `FORGE_HOST`, `FORGE_CONFIG_HOME`).
1. `./install --dev` TRACE.
1. `nested run` always-stop.
1. `nested log` JSONL hunts.
1. `--monitors`, `_forge-test-*` only.
1. `invoke` / `dnd-drop` as injectors (not stories).
1. Share bands in `nest_proof.py`.
1. `proof-loop` as the **loop** (iterations / hours / `--until` / fail
   JSONL / `--keep-on-fail` / always-stop per case).

**CLI after T4**

1. Tiling `smoke-*` aliases wrap `--trunk`/`--branch` (compat one
   session; catalog is stories).
1. `smoke-nest-apps` / `smoke-geom-epsilon` / `smoke-layout-tabbed-edge`
   stay **tools** (not `--rc`).
1. Host `H.*` — not nest `--rc`.

Fingerprint-only Join (`N.join-right`) is **not** a trunk. Alias
`smoke-mark2` runs `trunk.mark2.join-enter` (tree oracles).

## T3 fill list (trunk bodies)

Register a body with `nest_stories.story_runner(id)` (`nest_story_bodies.py`).
Live start/stop is `_cli_run` (same as `smoke-*`). Do not green BVHnV by
weakening Expect.

| Trunk | Body | Live |
| --- | --- | --- |
| `trunk.open.launch-into-2slot` | yes (`expected_fail=False`) | nest live **PASS** (`dock=false`); host dock 1/3 still product |
| `trunk.close.three-equal-one-gone` | yes | live `--trunk` / `--suite core` |
| `trunk.tabs.open-leaf-one-slot` | yes | live `--trunk` / `--suite core` |
| `trunk.layout.apply-one-ws` | yes (`_forge-test-one-ws` only) | live `--trunk` / `--suite core` |
| `trunk.mark2.join-enter` | yes (`invoke join.left`) | live `--trunk` / `--suite core` |
| `trunk.float.not-under-monitor` | yes (`FloatToggle`) | live `--trunk` / `--suite core` |
| `trunk.settle.visible-group-ready` | yes (2 mon; D105 visible-only) | live `--trunk` / `--suite core` |

T4 rewrite-mapped bodies (not every remaining leaf):
`branch.tabs.stacked-same-slot`, `branch.tabs.reveal-no-shrink`,
`branch.layout.ws2-no-mutate-ws1`, `branch.layout.missing-roles-open`,
`branch.mark2.group-tab`, `branch.mark2.move-swap`,
`leaf.mark2.move-empty-monitor`. `--suite rc` catalog bodies are
**ready** (fail-safe skip). Honest FAIL remain (not XFAIL). T5:
expected-fail hook is live (zero catalog flags).

## L0

```bash
python3 -m pytest tests/unit/cli/test_nest_stories.py \
  tests/unit/cli/test_nest_oracles.py tests/unit/cli/test_nest_story_bodies.py \
  tests/unit/cli/test_nest_proof.py -q
./scripts/forge/forge-test nested --help   # documents --trunk / --branch / --rc
./scripts/forge/forge-test nested --rc --dry-run
./scripts/forge/forge-test nested proof-loop --suite rc --dry-run
./scripts/forge/forge-test nested proof-loop --suite core --dry-run
```

T4 live (always-stop **per case**; settle is 2 mon):

```bash
./scripts/forge/forge-test nested proof-loop --suite core --iterations 1
./scripts/forge/forge-test nested status   # running: False
```
