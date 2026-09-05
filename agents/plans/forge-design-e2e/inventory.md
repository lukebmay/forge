# forge-design-e2e — nest inventory

**Slice:** T0 classify + **T4 fates applied**. Story catalog is T1
`stories.md`. Harness is T2–T4.

**Design law used:** `agents/design.md`, OpSet
`prototypes/container-motion/src/opsets/mark2.md`, layout architecture
in `agents/project.md`, newest CHANGELOG **D105** (visible settle).
Black-box E2E = gesture in; GetTree / Meta rect / TILE|FLOAT / identity
/ **visible** geometry out. No call-order E2E.

**FIRM keep (not “delete”):** nest isolation (private `XDG_RUNTIME_DIR`,
`FORGE_HOST`, `FORGE_CONFIG_HOME`, nest Chrome profile), `./install
--dev` TRACE, `nested run` **always-stop** (unless `--keep` /
`--keep-on-fail`). Hunt = `forge-test nested log` (JSONL), not
`nested logs` (shell stderr). Layouts = `_forge-test-*` only — never
personal `dev` / `t1` / `vinyl`.

**Legend**

| Class | Meaning |
| --- | --- |
| `valid-black-box` | User sequence + tree / mode / identity / visible geom |
| `helper-mirror` | Call-order, PlaceNext, log-token CTS, or fixture-as-fail |
| `mixed` | Some black-box oracles **and** helper-mirror fails |
| `tool-not-story` | Runner / injector / isolation / measurement — not a story |
| `missing` | No nest campaign exists |

Fate: **keep** (as-is, including as tool), **rewrite** (same user
sequence, design oracles), **delete-as-story** (drop from E2E catalog;
may keep as tool).

## T4 fates (done)

| Old | Fate | Now |
| --- | --- | --- |
| `smoke-close-reflow` | rewrite **done** | alias → `--trunk trunk.close.three-equal-one-gone` |
| `smoke-mark2` / fingerprint Join | delete-as-story **done** | alias → `--trunk trunk.mark2.join-enter` |
| `smoke-toggle-tab` | rewrite **done** | alias → `--branch branch.tabs.stacked-same-slot` (body) |
| `smoke-layout-ws` | rewrite/split **done** | alias → `--branch branch.layout.ws2-no-mutate-ws1` (body); mega 8-step is not a trunk |
| `smoke-layout-occupied` | rewrite **done** | alias → `--branch branch.layout.missing-roles-open` (tree oracles) |
| `smoke-layout-dnd` | rewrite **done** | alias → `--branch leaf.mark2.move-empty-monitor` (empty-mon Move; not `simulateEnteredMonitor` expect) |
| `smoke-layout-tabbed-edge` | delete-as-story **done** | **keep tool**; not `--rc` |
| `smoke-nest-apps` | keep tool **done** | not `--rc` |
| `smoke-geom-epsilon` | keep tool **done** | not `--rc` |
| Host `H.*` | keep host-only **done** | not nest `--rc` |
| `invoke` / `dnd-drop` | keep injectors **done** | — |
| `PROOF_CASES` `N.*` | not the spec **done** | `proof-loop --suite core` = seven trunks |

**BVHnV:** nest trunk green (`dock=false`). Catalog
`expected_fail=False`. Host dock Nautilus 1/3 still **product**. Do not
add a weakened nest story.

---

## Summary table (T0 classify; T4 fates in **Now**)

Every nest **campaign** and `PROOF_CASES` row. CLI alias is
`./scripts/forge/forge-test nested <alias>`. `nested run -- python3
scripts/forge/<script>` is the **same script**, not a second story.

| id | alias | mons | class | fate | T4 now |
| --- | --- | --- | --- | --- | --- |
| N.close-reflow | `smoke-close-reflow` | 1 | valid-black-box | rewrite | alias → `trunk.close.three-equal-one-gone` |
| N.join-right | `smoke-mark2` | 1 | mixed | delete-as-story | alias → `trunk.mark2.join-enter` |
| N.toggle-tab | `smoke-toggle-tab` | 1 | valid-black-box (partial) | rewrite | alias → `branch.tabs.stacked-same-slot` |
| N.nest-apps | `smoke-nest-apps` | 1 | tool-not-story | keep (tool) | tool; not `--rc` |
| N.layout-ws | `smoke-layout-ws` | 2 | mixed | rewrite / split | alias → `branch.layout.ws2-no-mutate-ws1` |
| N.layout-occupied | `smoke-layout-occupied` | 2 | mixed | rewrite | alias → `branch.layout.missing-roles-open` |
| N.layout-dnd | `smoke-layout-dnd` | 2 | mixed | rewrite | alias → `leaf.mark2.move-empty-monitor` |
| N.tabbed-edge | `smoke-layout-tabbed-edge` | 2 | valid-black-box | delete-as-story | keep **tool**; not `--rc` |
| N.geom-epsilon | `smoke-geom-epsilon` | 2 | tool-not-story | delete-as-story (keep tool) | tool; not `--rc` |
| N.wake-approx | (none) | 2 | missing | keep row as host/approx note | `--suite wake-approx` |
| H.borders | (host) | 0 | tool-not-story | keep host-only | `--suite host` |
| H.idle-dpms | (host) | 0 | tool-not-story | keep host-only | `--suite host` |
| H.dual-4k | (host) | 0 | tool-not-story | keep host-only | `--suite host` |
| — | `invoke` | n/a | tool-not-story | keep | injector |
| — | `dnd-drop` | n/a | tool-not-story | keep | injector |
| — | `proof-loop` | per case | tool-not-story | keep runner; **tree** | `--suite core` = trunks |
| — | `nested run` / start/stop | 1–4 | tool-not-story | keep | — |
| — | `nested log` | n/a | tool-not-story | keep | — |
| **BVHnV trunk** | `--trunk trunk.open.launch-into-2slot` | 1 | **written** | nest green | `expected_fail=False`; host 1/3 product |
| T1 seed 7 FLOAT | `trunk.float.not-under-monitor` | — | written | T3 body | — |
| T1 seed 8 empty dest | `branch.open.empty-head-dock` | — | catalog | unimplemented body | T5 |
| T1 seed 9 D105 visible | `trunk.settle.visible-group-ready` | — | written | T3 body | — |

### Sequences (user language)

What the script **actually** does. Not the intended design catalog.

1. **N.close-reflow** — Seed **3** Ghostty TILEs on **one** MONITOR
   (even ~1/3). Close one (`_closeOp`). Remaining pair must fill **~1/2**
   (GetTree sibling percent **and** Meta/rect; fail stuck ~1/3). Then
   CENTER-join the two survivors → TABBED (dnd-drop, else
   `toggleTabStack`); revealed tab Meta/rect not ~1/3; dbus-focus the
   buried sibling. Best-effort plog hunt
   (`forgetHostWindow|repairSharesAfterChildChange`) is **not** a CTS
   fail. Script:
   `scripts/forge/nest_close_reflow_smoke.py`.
1. **N.join-right** — Open two nest clients. `invoke join.right` on the
   leftmost. Fail only if window count drops or **forest fingerprint
   is unchanged**. Does **not** assert Join tree
   (`Mon(V(A,B))` / identities / shares). Same file as toggle-tab:
   `nest_mark2_smoke.py` → `nest_invoke.smoke_mark2_on_bus`.
1. **N.toggle-tab** — Same seed (two TILEs). `toggleTabStack` three
   times: TABBED → STACKED → TABBED. Bag kids WINDOW-only. No open-leaf
   / reveal-does-not-shrink-pane. Same script; CLI/proof-loop sets
   `FORGE_NEST_SMOKE_ACTION=toggleTabStack`.
1. **N.nest-apps** — Launch Nautilus, Ghostty, Text Editor, Chrome.
   Assert each maps as a **nest** Meta window (wm-class + pid
   `WAYLAND_DISPLAY` / `XDG_RUNTIME_DIR` nest-scoped; no host spill).
   Isolation gate, not a tiling story.
   `nest_apps_smoke.py`.
1. **N.layout-ws** — Dual-mon 8-step bag: WS1 `forge layout
   _forge-test-ghosttys` → WS2 `_forge-test-ws-b` → back WS1 → open
   Nautilus-or-extra-Ghostty → dest-monitor drop onto mon1 → CENTER
   tab → close extra (+ maybe another) → re-run layout A. After each
   step: GetTree (dual Ghostty / extra id / mon / TABBED exists /
   closed id gone) **plus** `assert_cts_logs` fail-loud on
   `parentNode is null`, `forest-match failed`, `render-throw`,
   `disposed`. Step 4 does **not** assert insert-split shares. Step 7
   does **not** assert remaining fill ~1/2. Refuses `dev`/`t1`.
   `nest_layout_ws_campaign.py`.
1. **N.layout-occupied** — Switch WS2. Seed one TILE on dest mon1
   matching a second role (eog / TextEditor / gedit / nautilus).
   `forge layout _forge-test-occupied-2slot`. Tree: mon0 one TILE,
   mon1 H/V two WINDOW children, second-role identity, no leftover PH.
   **Also** fail if nest JSONL contains `open-miss`, `PlaceNext dest
   failed`, `must be slot/PH`, `bag-con-child`. Refuses `dev`/`t1`/
   `vinyl`. `nest_layout_occupied_smoke.py`.
1. **N.layout-dnd** — Seed two Ghosttys, apply `_forge-test-ghosttys`,
   dest-monitor drop of leftmost onto **occupied** dest (explicitly
   **not** empty-mon). After: that window’s monitor index = dest; dest
   still has tiles; no TABBED/STACKED CON child. Layout stdout may
   fail on `forest-match failed` / `hard-failed`. Drop JS sets
   `simulateEnteredMonitor: true`. `nest_layout_dnd_smoke.py`.
1. **N.tabbed-edge** — Per zone LEFT/RIGHT/TOP/BOTTOM: seed 3 Ghosttys,
   CENTER-join two into TABBED, edge-drop the third onto a tab WINDOW.
   Expect: bag stays WINDOW-only; dragged is **not** in the bag;
   parent is HSPLIT (L/R) or VSPLIT (T/B) **CON** (not MONITOR)
   holding bag + dragged. Tree/identity oracles. Comments mention
   `slotSplit`; asserts do not. `nest_layout_tabbed_edge_smoke.py`.
1. **N.geom-epsilon** — Seed 3 Ghosttys; churn layout / join / move /
   `size.share*` / unequal then equal `run-steps`. Summarize nest
   `geom-epsilon` JSONL (worst in-band `dMax` → recommended ε). Exit 0
   even if samples are sparse. Does **not** fail a wrong visible desk.
   `nest_geom_epsilon_campaign.py`.
1. **N.wake-approx** — `PROOF_CASES` row with `smoke=""`. Loop skips
   unless `--include-unshipped`. Not a nest campaign.
1. **H.*** — Host-only (borders, idle+DPMS, physical dual-4K).
   `proof-loop --suite host` prints and exits 2. Not nest E2E.

---

## PROOF_CASES (T4: not the spec)

`scripts/forge/nest_proof.py` `PROOF_CASES` is **host / wake / tools**
only. Nest spec is `nest_stories.py` (stories.md). `proof-loop` remains
the **runner** (iterations / hours / `--until` / JSONL fail queue /
`--keep-on-fail` / per-case `--monitors` / always-stop).

| Suite | Meaning (T4) |
| --- | --- |
| `core` (alias `smoke`) | All seven trunks |
| `rc` | Full story tree (unimplemented → non-zero) |
| `regression` / `chaos` | Loop **core** (trunks) |
| `wake-approx` / `host` | Unchanged |

### Flat list (order in code)

1. `N.close-reflow` → `smoke-close-reflow` →
   `nest_close_reflow_smoke.py` — suites core, regression, chaos.
1. `N.join-right` → `smoke-mark2` → `nest_mark2_smoke.py` /
   `nest_invoke.cmd_smoke_from_env` (default `join.right`) — core,
   regression, chaos.
1. `N.toggle-tab` → `smoke-toggle-tab` → **the same argv as
   `smoke-mark2`** (`_mark2_argv` → `nest_mark2_smoke.py`). Proof-loop
   and CLI set `FORGE_NEST_SMOKE_ACTION=toggleTabStack`. Same script
   twice; not two implementations. Suites regression, chaos (not
   core).
1. `N.nest-apps` → `smoke-nest-apps` → `nest_apps_smoke.py` — core,
   regression, chaos.
1. `N.layout-ws` → `smoke-layout-ws` → `nest_layout_ws_campaign.py` —
   regression, chaos; `layout_chaos=True`.
1. `N.layout-occupied` → `smoke-layout-occupied` →
   `nest_layout_occupied_smoke.py` — regression, chaos;
   `layout_chaos=True`.
1. `N.layout-dnd` → `smoke-layout-dnd` → `nest_layout_dnd_smoke.py` —
   regression, chaos; `layout_chaos=True`.
1. `N.tabbed-edge` → `smoke-layout-tabbed-edge` →
   `nest_layout_tabbed_edge_smoke.py` — regression, chaos.
1. `N.geom-epsilon` → `smoke-geom-epsilon` →
   `nest_geom_epsilon_campaign.py` — regression, chaos;
   `layout_chaos=True`.
1. `N.wake-approx` → no smoke — suite `wake-approx` only.
1. `H.borders` / `H.idle-dpms` / `H.dual-4k` → no nest smoke — suite
   `host`.

### Same script twice (do not count as two stories)

1. `forge-test nested smoke-mark2` ≡ `nested run -- python3
   scripts/forge/nest_mark2_smoke.py` ≡ `N.join-right`.
1. `smoke-toggle-tab` ≡ that **same** `nest_mark2_smoke.py` with
   `FORGE_NEST_SMOKE_ACTION=toggleTabStack` ≡ `N.toggle-tab`.
1. Each other `smoke-*` alias ≡ `nested run -- python3
   scripts/forge/nest_*` ≡ the matching `N.*` row.
1. `proof-loop` is not a ninth product story — it **re-runs** the
   rows above.

Core suite (`proof-loop --suite smoke`) is **close-reflow + join-right
+ nest-apps**. That set can be green while BVHnV (T1 seed 1) is
untested.

---

## BVHnV gap (T1 seed 1) — missing

Host 2026-09-03 session `BVHnV`: `layout` left a **2-slot ~50/50**
column; dock Nautilus → **1/3|2/3** of the monitor (insert unit did
**not** split; the other sibling did **not** keep ~1/2).

**Required story (plan acceptance):** 2-slot ~50/50 on **one** MONITOR
→ **free-open** a third client (Nautilus or extra Ghostty) with focus
on one slot → **insert unit splits**; the **other** sibling keeps ~1/2
of the monitor; new+focus share that column — **not** 1/3|2/3 of the
whole monitor. Black-box: GetTree percents + Meta/rect widths.

**No existing smoke is that story.** Confirmed by reading campaigns:

1. **`smoke-close-reflow`** — Given **3** even TILEs (~1/3). Action =
   **close**. Expect remaining **~1/2**. Inverse of launch-into-2-slot.
   Green here does **not** prove layout-then-launch.
1. **`smoke-layout-ws` step 4** — After layout A each MONITOR has
   **one** Ghostty. Open extra is 1→2 on a head (or later a dest-mon
   **move**), then CENTER **group**. Asserts “new TILE exists / on a
   mon”, **not** insert-split vs 1/3|2/3.
1. **`smoke-layout-occupied`** — Apply a **desired 2-slot** on WS2.
   Does not then **launch a third**. Hunt is PlaceNext / open-miss
   logs.
1. **`smoke-layout-tabbed-edge`** — Given **3** TILEs already.
   CENTER-group two, **edge-drop** the third onto a tab (Join invent
   split). Not free-open into a 2-child H/V.
1. **`smoke-layout-dnd`** — Move an existing TILE to an **occupied
   dest monitor**. Not launch.
1. **`smoke-mark2`** — Two clients + `join.right`. Fingerprint delta
   only.
1. **`smoke-geom-epsilon`** — Log `dMax` measurement; exit 0 on sparse
   samples.

**Explicit contrast with `smoke-close-reflow`:** close-reflow is T1
seed **2** (close 1 of 3 → share repair). BVHnV is T1 seed **1**
(launch into a 2-child split, D032 / D090 / D105). Seeding three even
TILEs is a **close Given** (D032 even-3 only after resize /
`window-reset-sizes`), not proof of insert-on-open.

T3 nest trunk is **green** (`dock=false`). Do not rewrite Expect. Host
dock-open 1/3 is still the product Given (`forge-core-slot-geometry`).
T4: catalog `expected_fail=False`.

---

## Missing vs T1 seed (plan items 1–9)

Stories come from design (T1). This table only says **coverage of
current scripts**.

1. **Launch into a 2-child split** (D032, D090, D105) — BVHnV trunk.
   **Missing.** See above. Closest false friends: close-reflow,
   layout-ws open-extra, tabbed-edge.
1. **Close 1 of 3 equal tiles → remaining fill.** **Covered** by
   `smoke-close-reflow` (valid-black-box percents + Meta/rect).
   **Rewrite** into the story tree; keep those oracles. layout-ws
   step 7 only checks closed ids gone — **not** this story.
1. **TABBED/STACKED — one open leaf; peers share one slot; reveal does
   not shrink the pane** (D069, D025). **Partial.**
   `smoke-toggle-tab`: layout cycle + WINDOW-only kids; no open-leaf /
   slot-stable-on-reveal. close-reflow stage 2: revealed Meta not
   ~1/3 after CENTER join + dbus focus sibling — geom only, not
   “reveal does not shrink.” tabbed-edge: Join edge, not reveal.
   **Rewrite** a dedicated story; do not treat toggle-tab PASS as D025.
1. **Layout apply — one workspace; desired forest; missing roles
   open; extras per keep/close policy** (`project.md` layout).
   **Partial / mixed.** layout-ws / occupied / dnd apply
   `_forge-test-*` and check some GetTree shape. Occupied **also**
   fails on PlaceNext / open-miss **log** tokens. None assert
   keep/close extras policy in user-visible tree language. **Rewrite**
   without PlaceNext-as-contract.
1. **Layout on WS2 does not mutate WS1.** **Partial.** layout-ws
   applies B on WS2 then checks WS1 ids still present **after
   switching back**. It does not snapshot WS1 **during** the WS2
   apply. occupied applies only on WS2 and never looks at WS1.
   **Rewrite** (WS1 frozen while WS2 apply).
1. **Mark 2 Join / Move / Group** (`mark2.md`). **Partial / mixed.**
   Join: fingerprint-only (`smoke-mark2`) + tabbed-edge (edge invent
   split, valid-black-box tree). Group: toggle-tab cycle + layout-ws
   CENTER (TABBED exists). Move: layout-dnd occupied dest-monitor
   (mixed; entered-monitor sim). No Given/Expect tree for
   `join.right` / `move.left` as design Ops. **Rewrite** from
   `mark2.md`; keep `nested invoke` / `dnd-drop` as **injectors**.
1. **FLOAT not under a MONITOR** (D087). **Missing.**
   `tiled_windows()` skips FLOAT; no campaign asserts FLOATS bag vs
   MONITOR children.
1. **Empty-head / dock open lands on the empty dest** (D027).
   **Missing.** layout-dnd is **occupied** dest (docs: not L1.r015
   empty-mon). `dnd-drop --dest-monitor` is a **tool** to drop an
   existing TILE, not dock/free-open onto an empty head.
1. **Visible group ready while another mon still mapping** (D105).
   **Missing.** No smoke asserts the **visible** pane/group while an
   off-screen slot is still settling. geom-epsilon does not do this.
   layout-ws CTS can fail on whole-tape helper tokens (opposite of
   D105).

---

## CLI surface (`forge-test nested`)

From `scripts/forge/test_cli.py` `_NESTED_ACTIONS` +
`nested_wayland.cmd_nested`.

### Smoke aliases (always `nested run` → always-stop)

1. `smoke-mark2` — default 1 mon; `nest_mark2_smoke.py`.
1. `smoke-toggle-tab` — default 1 mon; same script +
   `FORGE_NEST_SMOKE_ACTION=toggleTabStack`.
1. `smoke-layout-dnd` — defaults `--monitors=2`.
1. `smoke-layout-ws` — defaults `--monitors=2`.
1. `smoke-layout-occupied` — defaults `--monitors=2`.
1. `smoke-layout-tabbed-edge` — defaults `--monitors=2`.
1. `smoke-geom-epsilon` — defaults `--monitors=2`.
1. `smoke-nest-apps` — defaults `--monitors=1`.
1. `smoke-close-reflow` — defaults `--monitors=1`.

### Tools (not stories)

1. `start` / `stop` / `restart` / `status` / `wait` / `enable-forge`
   / `doctor` — nest lifecycle. **Keep.** `doctor` is host-capability
   only (no campaign).
1. `env` / `exec` / `run` — client env + one-shot campaign. **Keep
   `run` always-stop.** `--keep` is debug.
1. `invoke` — `nest_invoke.py`: Shell.Eval → `extWm.command({name})`
   (Mark 2 action ids). Gesture injector. **Keep.** Not a story.
1. `dnd-drop` — `nest_invoke.py`: session `_dndDropOp` →
   `_commitResolvedDrop` (empty-mon: dest-monitor path). Pointer
   substitute. **Keep as injector.** Must not be the catalog. Default
   `simulateEnteredMonitor=true` is adapter-shaped; T2 should not
   require it as the contract.
1. `proof-loop` — loop the **story tree**. **Keep runner.**
   `--suite core|rc|regression|chaos|wake-approx|host`, `--iterations` /
   `--hours`, `--cases` (story ids or deprecated `N.*` aliases),
   `--until fail|keep-going`, `--chaos`, `--keep-on-fail`, `--dry-run`.
1. `log` — plog-query nest `forge.jsonl` (tapes survive stop).
   **Keep.** `--grep` / `--level` / `--last`.
1. `logs` — gnome-shell **stderr** (`shell.log`). Debug only; **not**
   the hunt. **Keep** as debug; do not use as E2E oracle.

Flags worth keeping: `--monitors` (1–4 dummy 1920×1080 @1), `--name`,
`--keep` / `--keep-on-fail`, `--dev` TRACE via install (not a nested
flag).

---

## Harness reuse (runner vs catalog)

### Keep as runner (T2 may wrap; do not throw away)

1. **`nested_wayland.py`** — start/stop/restart; dummy `--monitors`;
   `run_campaign` always-stop; stale pid/bus reap; `client_env`
   isolation (`XDG_RUNTIME_DIR`, nest HOME/XDG, `GTK_USE_PORTAL=0`,
   `GIO_USE_VFS=local`, Chrome `--user-data-dir`, `FORGE_HOST`,
   `FORGE_CONFIG_HOME`); layout **profiles** stay shared;
   `wait_forge_ready` / `wait_nest_client_ready`; `doctor`; refuse
   X11 host by default.
1. **`nest_proof.py` loop** — `cmd_proof_loop`, fail JSONL queue,
   repro cmd, `--until`, hours/iterations. **Not** `PROOF_CASES` as
   spec. Share **oracles** (`assert_siblings_fill_half`,
   `assert_split_percents_half`, `assert_slot_not_third`,
   `assert_no_placeholders`) are reusable black-box helpers for T1
   seed 2 (and geom bands). `THIRD_*` / `HALF_*` bands stay useful.
1. **`forge-test nested`** — one CLI; hoist flags; smoke aliases can
   become `--trunk` / `--branch` / `--rc` later (T2/T5).
1. **`nest_invoke.py`** — GetTree, launch, close, workspace activate,
   Mark 2 `invoke`, selector hints. **Keep.** `forest_fingerprint` is
   **too weak** as a story oracle (rewrite). `find_bag_groups` /
   `assert_bag_window_kids_only` are usable tree checks.
1. **`nest_log_query.py`** — nest JSONL via vendored `plog-query`.
   **Keep for hunts.** Do **not** use `assert_cts_logs` FAIL_SUBSTR
   (`parentNode is null`, `forest-match failed`, …) as the E2E
   contract. D105: visible geom, not whole-desk log quiet.
1. **Refuse personal profiles** — keep in layout campaigns.
1. **`--dev` TRACE + always-stop + isolation** — FIRM; T2 must not
   regress.

### Must not become the story catalog

1. `PROOF_CASES` / suite `core` = current scripts.
1. `smoke-*` names (helper/campaign names, not user sequences).
1. Fingerprint-only Join (`N.join-right`).
1. PlaceNext / `open-miss` / `parentNode is null` / `forest-match
   failed` as the **only** fail.
1. `simulateEnteredMonitor` as a user-visible expect.
1. geom-epsilon recommended-ε printout as RC health.
1. nest-apps isolation as a tiling trunk.
1. Host `H.*` rows inside nest `--rc` (stay host-only).
1. Personal `dev` / `vinyl` host layouts as nest fixtures.

### Delete-as-story vs rewrite (T4 hint; T4 owns the cut)

| Keep oracles / rewrite | Delete from E2E catalog |
| --- | --- |
| close-reflow fill-half + tab not-third | geom-epsilon as a “story” (keep measurement CLI) |
| toggle-tab bag WINDOW-only + layout names | join-right fingerprint-only oracle |
| tabbed-edge parent CON holds bag+dragged | layout-ws / occupied **log CTS** fail-loud |
| occupied / layout-ws **tree** who-sits-where | mega 8-step as one trunk |
| invoke + dnd-drop injectors | entered-monitor sim as contract |

---

## Units (L0, not nest stories)

`tests/unit/cli/` — no live gnome-shell. **Keep** as harness tests;
T4 retargets catalog assertions when `PROOF_CASES` dies.

1. `test_nest_proof.py` — suite select, share oracles, proof-loop
   dry-run / fail queue. Catalog-shape tests follow **story** ids
   (`trunk.close.three-equal-one-gone`, `trunk.mark2.join-enter`).
1. `test_nest_close_reflow.py` — parser + fill-half oracles.
1. `test_nest_invoke.py` — action ids, GetTree unpack, dnd argv, nest
   env refuse host.
1. `test_nested_wayland.py` — isolation, always-stop, hoist,
   doctor-shaped helpers.
1. `test_nest_apps_smoke.py` — host-spill environ.
1. `test_nest_layout_ws_campaign.py` /
   `test_nest_layout_occupied.py` / `test_nest_layout_dnd.py` /
   `test_nest_layout_tabbed_edge.py` — dry-run, refuse `dev`, tree
   fixture oracles.
1. `test_nest_log_query.py` — plog paths + classify tokens (hunt
   helper L0, not E2E law).
1. `test_nest_launch_argv.py` — Chrome profile / Ghostty
   multi-instance.

`test_cli.py` nested aliases: document + hoist. **Keep.**

---

## Helper-mirror notes (why mixed)

Opened `lib/extension/*` only enough to confirm smokes name adapter
internals as fail tokens — **no helper rewrite**.

1. Occupied / layout-ws treat **PlaceNext dest**, **open-miss**,
   **parentNode is null**, **forest-match failed** as campaign fail.
   Those are apply/helper logs, not “visible pane wrong.”
1. `dnd-drop` / dest-monitor drops call session `_dndDropOp` and may
   set `simulateEnteredMonitor` (D100 disconnected
   `window-entered-monitor`). Fine as an injector; not a story
   expect.
1. `smoke-mark2` “tree changed” can pass a wrong Join.
1. layout-ws step 4 “new TILE on a monitor” is the fixture succeeding
   at map, not D032 insert-split.

---

## Out of scope this slice

1. No T1 `stories.md`. No T2 harness. No T3–T6.
1. No product JS. No commit/push. No host `forge layout`. No G8n-s2 /
   slot-geometry patches.
1. No long nest smokes (no `nested doctor` run required; CLI `--help`
   / source were enough).
