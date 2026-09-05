---
title: Testing
read_when: Adding tests, changing test strategy, enabling optional features, forge live matrix / nest Wayland smoke, or layout regression work
order: 70
---

# Testing (forge extension)

**Base:** follow [`agents/installed/testing.md`](./installed/testing.md) for the
portable pyramid, **design-sourced / black-box E2E**, story tree, in-progress
expected-fail, visible-contract, lifecycle, plog log-contract pointer, CI, and
Grok leader / reattach rules. This file **extends** that base with forge-only
practice. On conflict, **this extension wins**.

## Commits are not a test gate (FIRM)

Husky / lint-staged format and lint staged files. They **must not** run
Vitest, pytest, nest, or live matrix. The suite is not yet high-quality
and stable enough to block `git commit`. Run tests in the session when
the change can break a contract; do not re-add `vitest related` (or
equivalent) to `package.json` `lint-staged`.

## Nest is the E2E (FIRM)

Nested Wayland (`forge-test nested`) is Forge’s **end-to-end** harness for
extension JS. It is **not** a helper-unit dump. Host dual-4K / real Chrome
PWA identity remain host authority only for what nest physically cannot
prove ([D022](./design/CHANGELOG.md)).

Catalog rules that apply here without restating: design is the spec; code
is a **black box**; story **tree** (trunk → branch → leaf); RC = **full
tree**; partial features may fail **expected** stories only.

**Forge-specific**

| Do | Do not |
| --- | --- |
| Author nest stories from `design.md`, OpSet docs (`mark2.md`), layout architecture in `project.md`, and named user sequences | Author nest stories by reading `adapter-*.js` / `layout-apply-*.js` and asserting those helpers |
| Assert after the gesture: Forest/GetTree **who sits where**, TILE/FLOAT, **this** window’s identity, **visible** geometry | Assert PlaceNext internals, call order, or “the fixture already did this” |
| Trunk after a tiling/open/layout change (lightest net that would catch an obvious desk break) | Treat a compat `smoke-*` PASS as proof of a different story |
| RC: full nest tree (`--rc` / `proof-loop --suite rc`) before calling a tip release-ready | Ship on unit green + one unrelated nest smoke |

**Visible settle (D105):** nest must not fail a story because a **buried**
tab, hidden map, or **other monitor/workspace** is still settling, if the
user’s current view already matches the contract. It **must** fail if the
visible pane/group is wrong (1/3\|2/3 of the focused split, wrong open
leaf, fly-in of a window the user can see).

**In-progress:** a partial layout/open slice may leave its nest story red
**if the plan names that expected fail** (`expected_fail=True` → print
`XFAIL` / `expected-fail`; `--rc` / `--suite rc` is not hard red from
that id alone). Unrelated trunk red is a regression. Unimplemented
bodies are **not** expected-fail — they stay non-zero. Do not rewrite
the story to match half-built code.

**Not expected-fail:** `trunk.tabs.open-leaf-one-slot` and
`trunk.mark2.join-enter` can flake vs T3 PASS (`H(TAB,V) !=
H(TAB,WINDOW)`; TAB peers not one slot). That is a harness/product
flake — do not mark those ids expected-fail and do not weaken Expect.

| When | Run |
| --- | --- |
| After tiling / open / layout JS | **`--trunk <id>`** for that area (lightest net) |
| That trunk fails | **`--branch <id>`** → leaf down the same tree |
| Release candidate / “prove this tip” | **`--rc`** / `proof-loop --suite rc` (full tree except `leaf.float.fail-safe-terminator` unless fixture). Unimplemented = not release-ready |

Story catalog + rebuild: [forge-design-e2e.md](./plans/forge-design-e2e.md).

## Real regression tests (FIRM)

A test is real when inverting the **user-visible contract** fails it.
Helper renames, call order, and “the fixture already does this” do not count.

**Assert after the user sequence**

1. Forest / GetTree — who is parent, which children, in what order
1. Mode (TILE / FLOAT / GRAB_TILE) of the windows the user moved
1. Child **identity** (this Nautilus, not “some WINDOW”)

**Forbidden as the only assert**

1. `toHaveBeenCalled` / call-order on internals
1. “Homes to mon 0” when the fixture pointer is also 0
1. `parent.layout` alone (HSPLIT vs VSPLIT without who sits where)

**Rule:** new live bug → write the failing test **before** the patch,
against the user gesture (open / drag / drop / apply), not the helper
just changed. One such test beats twenty patch-mirrors.

## Lifecycle

| Phase | Stance |
| --- | --- |
| Shape still moving | Sparse tests; unit only on stable pure helpers |
| Contract locked | Build unit suite; integration on critical paths |
| Bug found | Regression test when cheap and non-brittle |
| **Live layout bug** | REGRESSIONS row + unit if pure + **`LIVE_CASES` R0xx** in `live_matrix.py` |

## Forge AI live matrix (GUIDELINE)

AI live cases are **E2E-class** (desk behavior hard to fully script). They
**use scripting** for setup/apply/tree/checks; the agent supplies selection,
judgment, and debug. They **do not replace** unit/integration tests.

**Order (FIRM for layout work):**

1. **L0** — relevant unit/integration for the blast radius  
2. **`./scripts/forge/forge-test live plan/run`** — selected E2E cases only  
3. Fix phase → re-run L0 → re-run same live subset  

```bash
# L0 example (adjust to touch paths)
python3 -m pytest tests/unit/cli/test_layout_apply.py -q
# then live
./scripts/forge/forge-test live probe
./scripts/forge/forge-test live plan --from-work <hint>   # or --behaviors / --tags R0xx
./scripts/forge/forge-test live run --from-work <hint>    # only selected cases
```

| Rule | Detail |
| --- | --- |
| **L0 before live** | Rule out pure bugs before dual-mon thrash |
| **Select by blast radius** | Only cases whose behaviors the change can break |
| **Not always full suite** | `plan` without filters is max-for-capability, not mandatory run |
| **Regression → catalog + unit** | Live R0xx → `LIVE_CASES` tag; pure test when possible |
| **Capability** | True cold needs Guake/float agent; X11 for HUP loops; Wayland: `can_nested` / `can_retest` |
| **Wayland retest** | See **§ Wayland live testing workflow** below (FIRM when session is Wayland) |
| **CLI jobs** | Mutating `forge` runs as durable jobs — closing the agent TTY does **not** abort apply. True cold still needs non-tile agent **window** placement. Job runner units: `tests/unit/cli/test_job_runner.py` |
| **L1 setup** | `close-mon0/1-chrome` by tree mon; `ensure-nautilus` / `ensure-dev-shape` real (AT2). Units: `tests/unit/cli/test_live_matrix.py` |
| **Focus live** | `--from-work close` → `L1.close-focus-lft` (close→LFT). Unfocus key product **abandoned**. |
| **True cold / headless** | Durable Grok leader required if agent TILE will close. After suite, leader reopens Ghostty head; operator `grok -r`. Windowed clients die with TTY and cannot self-reattach. |
| **Test layouts** | Only `_forge-test-*` profiles — not personal `dev`/`t1` |

Plan: `agents/plans/forge-ai-live-test-matrix.md`.  
Handoff quick ref: `agents/HANDOFF.md` § Nested Wayland / Wayland smoke loop.

---

## Wayland live testing workflow (FIRM when on Wayland)

Nest + live matrix are **`forge-test`**, not user `forge`. Always-works clone
entry: `./scripts/forge/forge-test`. Opt-in PATH: `./install --with-test-cli`.

Use this whenever the login session is **Wayland** and work needs **install / extension
JS reload / dual-mon desk smoke**.

**Normal reload loop = nest (or X11 HUP). Host logout is occasional, not the
default.** When `can_nested` is true, agents **must** prove extension JS changes
in nest before asking the human to log out of the primary session. Do **not**
treat primary logout/login as the ordinary way to load a dirty tip mid-campaign.

| Rule | Detail |
| --- | --- |
| **Nest first** | After `./install --dev` for JS changes: `./scripts/forge/forge-test nested run` / `restart` + retest |
| **Nest install = `--dev` (FIRM)** | Agent nest / live-with-traces campaigns install with **`./install --dev`** (or `forge update --dev` from the durable clone). That sets **TRACE (6)** (D068), layout debug overlay, and `forge-test` on PATH (D104) so hunts work. Plain `./install` is INFO-only — insufficient when the campaign needs traces. Host tip after nest green may stay `--dev` until you intentionally switch. |
| **Host logout** | Only when nest cannot prove the behavior (true host dual-4K cold / chrome open-leaf RC) **or** occasional tip load after nest already green |
| **Never** | Invent logout loops for mid-campaign retests when nest works |

### Two layers (do not conflate)

| Layer | What it proves | Where it runs | How extension code reloads |
| --- | --- | --- | --- |
| **A — Nest retest** | Extension loads, DBus Forge works; structure/open/focus retest | Nested Shell window (`./scripts/forge/forge-test nested`) | `./scripts/forge/forge-test nested restart` / `run` (**default** code→reload; no host logout) |
| **B — Host dual-mon live** | Real dual 4K desk: layout, open leaf, focus, cold/partial | **Host** Wayland session | Tip already loaded, **or** occasional logout after nest green |

| Also | Role |
| --- | --- |
| **L0** | Unit/integration for pure/contract bugs — always before expensive live |
| **CLI-only** (`layout_apply` / `forge` Python) | Live on host **without** nest restart or HUP |

### When to nest (D022 — FIRM)

| Situation | Action |
| --- | --- |
| Extension **JS** changed → need reload without host logout | **Nest** (code/test loop only) |
| No code change; one-shot / smoke | **Host only** — do not start nest |
| Multi-mon behavior under test | Nest `--monitors=N` (usually 2) **or** host dual-mon |
| Single-desk structure / open / focus retest | Nest **default 1 mon** — do not pay dual-mon cost |
| Chrome open-leaf / real dual-4K RC authority | **Host** L1 (until nest chrome isolation proven) |

Nest supports **1–4** dummy monitors (`--monitors`). **Default is 1.** Each
dummy mon is **1920×1080 @ scale 1** (Full HD, no scaling) unless `--size` /
`--scale` override. Multi-mon nest is not a free substitute for host dual-4K
geometry; host remains authority for physical dual-mon sign-off. Design:
[D022](./design/CHANGELOG.md) · [nest isolation plan](./plans/forge-nested-isolation.md).

### Nest entrypoints (N3 — FIRM)

Story catalog is `--trunk` / `--branch` / `--rc` (ids from
[stories.md](./plans/forge-design-e2e/stories.md)). `smoke-*` tiling
names are **T4 compat aliases**, not the catalog. Tools stay tools.

| Entry | When | Cleanup |
| --- | --- | --- |
| **`./scripts/forge/forge-test nested --trunk <id>`** | Day-to-day: lightest trunk for the blast radius (`trunk.open` prefix ok if unique) | Same as `nested run` (always stops unless `--keep` / `--keep-on-fail`) |
| **`./scripts/forge/forge-test nested --branch <id>`** | Trunk failed, or the change is that subsystem: branch + descendant leaves | Same as `nested run` (always stops unless `--keep` / `--keep-on-fail`) |
| **`./scripts/forge/forge-test nested --rc`** | Full stories.md tree (skip `leaf.float.fail-safe-terminator` unless fixture). Unimplemented → non-zero. Plan-named expected-fail → `XFAIL`, not hard red | Same as `nested run` (always-stop per ready story unless `--keep` / `--keep-on-fail`) |
| **`./scripts/forge/forge-test nested proof-loop --suite core`** | Seven trunks (alias `--suite smoke`). `--iterations N` / `--hours H` | Nested `run` per case (always stops unless `--keep` / `--keep-on-fail`) |
| **`./scripts/forge/forge-test nested proof-loop --suite rc`** | Same tree as `--rc`. Unimplemented → non-zero (not release-ready) | Nested `run` per case (always stops unless `--keep` / `--keep-on-fail`) |
| **`./scripts/forge/forge-test nested run -- <cmd…>`** | One-shot non-story campaign | Starts if needed → cmd → **always stops** (unless `--keep`) |
| **`./scripts/forge/forge-test nested exec -- <cmd…>`** | Nest already up; multi-step interactive | No auto-stop — **stop** when done |
| **`./scripts/forge/forge-test nested invoke <id>`** | Mark 2 `command({name})` via Shell.Eval (e2e dbus; no Super+key) | Nest must already be up |
| **`./scripts/forge/forge-test nested dnd-drop …`** | Synthetic tile drop via session `_dndDropOp` → `OpSet.pointer.release` → named Ops (empty-mon: `--dest-monitor` → `move`; host Meta transfer last-resort) | Nest must already be up |
| **`smoke-close-reflow` / `smoke-mark2` / `smoke-toggle-tab` / `smoke-layout-ws` / `smoke-layout-occupied` / `smoke-layout-dnd`** | Compat aliases → `--trunk` / `--branch` (T4). `smoke-mark2` is `trunk.mark2.join-enter` (tree oracles), **not** fingerprint Join | Same as `nested run` (always stops) |
| **`./scripts/forge/forge-test nested smoke-nest-apps`** | Nautilus / Ghostty / TextEditor / Chrome map **in-nest** (isolation **tool**, not `--rc`) | Same as `nested run` (always stops) |
| **`./scripts/forge/forge-test nested smoke-geom-epsilon`** | D095 sent↔observed ε campaign (measure **tool**, not `--rc`) | Same as `nested run` (always stops; defaults `--monitors=2`) |
| **`./scripts/forge/forge-test nested smoke-layout-tabbed-edge`** | TABBED edge-drop **tool** (not `--rc`) | Same as `nested run` (always stops; defaults `--monitors=2`) |
| **`./scripts/forge/forge-test nested restart` / `start`** | Long interactive retest loop | **stop** when campaign ends |

**Nest client isolation (FIRM):** `client_env` sets a private `XDG_RUNTIME_DIR`
under the nest state (Wayland socket symlinked), nest-scoped XDG config/cache/data
+ `HOME`, nest D-Bus, `GTK_USE_PORTAL=0`, `GIO_USE_VFS=local`, and Chrome
`--user-data-dir=<nest>/chrome-profile`. Without that, GApplication/Chrome attach
to the **host** desk. Prefer `nested exec` / `nested run` over
`eval $(nested env --export)` in a long-lived agent shell.

```bash
# One-shot campaign (default mon=1; auto cleanup) — --dev → TRACE (D068)
./install --dev && ./scripts/forge/forge-test nested run -- forge ping
# Multi-mon campaign only when testing multi-mon:
./scripts/forge/forge-test nested run --monitors=2 -- forge tree
# Keep nest up intentionally:
./scripts/forge/forge-test nested run --keep -- forge ping   # then stop yourself later
```

`status` / `start` / `exec` also **reap stale** pid/bus residue (N3).

### Nest client + Shell env (N1/N2)

Nest `env` / `export` / `exec` / `run` **and** nest Shell start set:

| Var | Value | Role |
| --- | --- | --- |
| `FORGE_HOST` | `<short-hostname>-sub-<nestname>` (e.g. `black-sub-forge`) | Separate host key for CLI heuristics / layout host |
| `FORGE_CONFIG_HOME` | `<session_dir>/forge-config` | Nest forge root (CLI + extension; not parent `~/.config/forge`) |

Extension uses `forgeConfigHome()` / `forgeConfigDir()` (`lib/shared/forge-config-home.js`).
Layout **profiles** stay shared (`layout/` / `FORGE_LAYOUT_DIR`). Shared install UUID
and gsettings are intentional.

### Capability gates

```bash
./scripts/forge/forge-test live probe          # host desk + can_hup / can_nested / can_retest
./scripts/forge/forge-test nested doctor            # nest host tools only (exit 0 if can nest)
```

| Field | Meaning |
| --- | --- |
| `can_hup` | X11 only — `killall -HUP gnome-shell` reloads host extension |
| `can_nested` | Wayland host + tools — `./scripts/forge/forge-test nested` allowed |
| `can_retest` | `can_hup` **or** `can_nested` — agent can iterate without fantasy reboot |

On **X11:** use HUP; `./scripts/forge/forge-test nested start` **exits 2** with HUP guidance (not a crash).

Nest **shares host dconf**. `org.gnome.shell disable-user-extensions=true` (host crash recovery) keeps nest Forge in ExtensionState INITIALIZED — no Forge DBus, campaigns fail `Forge DBus not ready`. Do not treat that as a missing `./install`. Clearing the key is a **host-session** choice (also loads host extensions); nest cannot isolate it today.

### Extensive Wayland smoke loop (default agent campaign)

```text
0. Confirm: XDG_SESSION_TYPE=wayland; ./scripts/forge/forge-test live probe → can_nested=true
1. L0 for blast radius (pytest/vitest)
2. If NO extension JS change this iteration:
     host-only live / forge layout / probe — skip nest entirely
3. If extension JS changed (code/test loop):
     ./install --dev
     ./scripts/forge/forge-test nested doctor
     # Prefer one-shot campaign entry (auto stop):
     ./scripts/forge/forge-test nested run -- forge ping
     # multi-mon case only: ./scripts/forge/forge-test nested run --monitors=2 -- …
     # Multi-step interactive (keep nest up):
     #   ./scripts/forge/forge-test nested restart            # mon=1 default
     #   ./scripts/forge/forge-test nested exec -- forge tree
     #   … more nest cases …
     #   ./scripts/forge/forge-test nested stop               # FIRM when interactive loop ends
4. Host dual-mon / chrome RC (host env only — nest NOT exported):
     ./scripts/forge/forge-test nested stop               # if nest still up
     ./scripts/forge/forge-test live plan --from-work <hint>
     ./scripts/forge/forge-test live run  --from-work <hint>
5. Code change → `./install --dev` → prefer `./scripts/forge/forge-test nested run -- …` or
   `restart`+`exec`+`stop` (mon=1 unless multi-mon case)
6. Logout only if host Shell never loaded this tip and host dual-mon needs host tip.
7. ALWAYS before wrap-up / handoff / idle: nest down
     ./scripts/forge/forge-test nested status         # running: False (reaps stale)
```

### Nest stop after tests (FIRM)

| Rule | Detail |
| --- | --- |
| **Prefer `run`** | One-shot campaigns use `./scripts/forge/forge-test nested run -- …` (mechanical stop) |
| **Interactive still stop** | `exec` / `restart` / `start` leave nest up — `./scripts/forge/forge-test nested stop` when done |
| **Stop before host matrix** | Do not run host `forge layout` / `./scripts/forge/forge-test live` with nest env exported |
| **Verify** | `./scripts/forge/forge-test nested status` → `running: False` |
| **No durable export** | Prefer `run` / `exec`; avoid long-lived `eval $(./scripts/forge/forge-test nested env --export)` on agent shells |
| **Wrap-up gate** | Commit/handoff only after nest is stopped (or status proves already down) |

Leaving nests up wastes resources and can leave orphan session buses;
`status` reaps stale pids, but prefer `run` so cleanup is not memory-only.

**Shell env trap:** `eval $(./scripts/forge/forge-test nested env --export)` points `WAYLAND_DISPLAY` +
`DBUS_SESSION_BUS_ADDRESS` at the **nest**. Host dual-mon commands must use the
**host** bus/display. Prefer a separate terminal for nest health, or unset nest
exports before host `forge tree` / `forge layout` / `./scripts/forge/forge-test live run`.

### Minimal commands (cheat sheet)

```bash
# One-shot nest campaign (Wayland; auto cleanup) — --dev for TRACE hunts
./install --dev && ./scripts/forge/forge-test nested run -- forge ping

# Story catalog (design tree). Day-to-day --trunk; fail → walk down;
# RC = full tree except leaf.float.fail-safe-terminator unless fixture.
# Unimplemented = not release-ready. Plan-named expected-fail → XFAIL.
./scripts/forge/forge-test nested --trunk trunk.open.launch-into-2slot
./scripts/forge/forge-test nested --trunk trunk.open --dry-run
./scripts/forge/forge-test nested proof-loop --suite core --iterations 1
./scripts/forge/forge-test nested --rc --dry-run
./scripts/forge/forge-test nested proof-loop --suite rc --dry-run
./scripts/forge/forge-test nested proof-loop --suite core --iterations 1 --monitors=2
./scripts/forge/forge-test nested proof-loop --dry-run --suite regression

# Compat aliases (T4) — map to stories; not the catalog names.
# smoke-mark2 is trunk.mark2.join-enter (tree oracles), not fingerprint Join.
./scripts/forge/forge-test nested smoke-close-reflow
./scripts/forge/forge-test nested smoke-mark2
./scripts/forge/forge-test nested smoke-layout-ws
./scripts/forge/forge-test nested smoke-layout-occupied

# Tools (not --rc): isolation / D095 measure / tabbed-edge
./scripts/forge/forge-test nested smoke-nest-apps
./scripts/forge/forge-test nested smoke-geom-epsilon
./scripts/forge/forge-test nested smoke-layout-tabbed-edge

# Mark 2 injectors (nest must already be up; not product `forge Move`)
./scripts/forge/forge-test nested invoke join.right --hint leftmost --activate
./scripts/forge/forge-test nested invoke move.left --window-id 42
./scripts/forge/forge-test nested invoke toggleSplit --selector 'class:org.gnome.Nautilus'
./scripts/forge/forge-test nested dnd-drop leftmost rightmost --zone center
./scripts/forge/forge-test nested dnd-drop leftmost --dest-monitor 1

# Multi-step retest loop (stop yourself)
./install --dev && ./scripts/forge/forge-test nested restart
./scripts/forge/forge-test nested exec -- forge tree
./scripts/forge/forge-test nested stop
./scripts/forge/forge-test nested status            # running: False
# Nest hunt JSONL (not shell.log; tapes survive stop)
./scripts/forge/forge-test nested log --grep 'place-hint|forest-match' --level info+ --last 40
./scripts/forge/forge-test nested logs              # gnome-shell stderr only

# Host live (dual-mon) — host env only
./scripts/forge/forge-test live probe
./scripts/forge/forge-test live run --from-work open-leaf   # example
# Prefer _forge-test-* layouts, not personal dev/t1

# Make aliases
make nested-start | nested-restart | nested-stop | nested-status
```

### When logout is still required

| Situation | Action |
| --- | --- |
| Host never loaded this build this boot, and case needs **host** dual-mon extension | One logout/in, then prefer nest for further JS reloads |
| `can_nested=false` (`./scripts/forge/forge-test nested doctor`) | Fix tools/host Wayland, or logout once |
| Changing only CLI Python (no extension JS) | No nest restart, no logout |

### X11 contrast (same product)

```bash
./install --dev && killall -HUP gnome-shell    # host reloads; TRACE for hunts
./scripts/forge/forge-test live run --from-work <hint>
```

### Ownership

| Piece | Path |
| --- | --- |
| Nest module / CLI | `scripts/forge/nested_wayland.py`, `./scripts/forge/forge-test nested …` |
| Units | `tests/unit/cli/test_nested_wayland.py`, live_matrix probe fields |
| Plan | `agents/plans/forge-ai-live-test-matrix.md` (AT-W1); **E2E rebuild** [forge-design-e2e.md](./plans/forge-design-e2e.md) |
| CT2 host cold | `agents/tasks/forge-layout-cold-topology_ct2-wayland-live.md` |
| shellrc twin (optional) | `nested-gnome` — not a forge dependency |

### Log-contract tests (GUIDELINE → FIRM when hunt-found)

When a bug was confirmed via `forge log` / JSONL, lock the **stable hunt token**
in the same change when the harness can see the tape:

| Layer | Where | What |
| --- | --- | --- |
| L0 | `tests/unit/extension/log-contract-hunt-tokens.test.js` | Spy `Logger.trace`; assert tokens like `ws-change preserve hit`, `lastTabFocus tab` |
| Nest / e2e | `tests/e2e/framework/log_contract.py` + callers (e.g. `test_workspace_operations.py`) | Read nest `forge.jsonl` (`FORGE_CONFIG_HOME` → sibling of `forge-config/`); `wait_for_log_token` / `assert_log_tokens` |

**Do:** assert greppable tokens / one field; pair with a state oracle.  
**Do not:** snapshot full TRACE, ANSI pretty, titles, or pointer coords.  
E2E session fixture sets **TRACE (6)** so these tokens emit (D068 / `--dev`).  
Practice source: shellrc `plog-log-contract-tests` (+ catalog hunt practices).
