---
title: Testing
read_when: Adding tests, changing test strategy, or enabling optional features for verification
order: 70
---

# Testing

Rule vocabulary: **FIRM** / **GUIDELINE** / **MAY** (see `general.md`).

## Goal

Catch real bugs without making change expensive. Tests serve the product.

## Optional features in dev (FIRM)

When implementing/debugging an optional feature: **turn it on** in local/dev for that work. Record the enable command in task/handoff. Prefer tests that force the optional path explicitly.

## Pyramid (GUIDELINE)

| Layer | When | Cost |
| --- | --- | --- |
| Unit | Pure logic, parsers, validators | Cheap — be thorough once contract is clear |
| Integration | Critical paths + known gotchas | Few, high value |
| E2E / manual | Full UI when ROI is clear | Rarest |

Do not chase coverage numbers. Prefer one test that would have caught a real bug.

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
| **Nest install = `--dev` (FIRM)** | Agent nest / live-with-traces campaigns install with **`./install --dev`** (or `forge update --dev` from the durable clone). That sets **TRACE (6)** (D068) so `forge log` hunts work. Plain `./install` is INFO-only — insufficient when the campaign needs traces. Host tip after nest green may stay `--dev` until you intentionally switch. |
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
[D022](../docs/DECISIONS.md) · [nest isolation plan](./plans/forge-nested-isolation.md).

### Nest entrypoints (N3 — FIRM)

| Entry | When | Cleanup |
| --- | --- | --- |
| **`./scripts/forge/forge-test nested run -- <cmd…>`** | **Prefer** for one-shot campaigns | Starts if needed → cmd → **always stops** (unless `--keep`) |
| **`./scripts/forge/forge-test nested exec -- <cmd…>`** | Nest already up; multi-step interactive | No auto-stop — **stop** when done |
| **`./scripts/forge/forge-test nested restart` / `start`** | Long interactive retest loop | **stop** when campaign ends |

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

# Multi-step retest loop (stop yourself)
./install --dev && ./scripts/forge/forge-test nested restart
./scripts/forge/forge-test nested exec -- forge tree
./scripts/forge/forge-test nested stop
./scripts/forge/forge-test nested status            # running: False

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
| Plan | `agents/plans/forge-ai-live-test-matrix.md` (AT-W1) |
| CT2 host cold | `agents/tasks/forge-layout-cold-topology_ct2-wayland-live.md` |
| shellrc twin (optional) | `nested-gnome` — not a forge dependency |

## Do / don’t

**Do:** boundaries, invariants, critical paths once stable, focused regressions.  
**Don’t:** assert private call order, mirror implementation, freeze experimental APIs mid-design.

## Brittleness

Prefer observable outputs, stable fixtures, injected time/random, temp dirs. Avoid real clocks, important live data (see `security.md`).

## CI (GUIDELINE)

Unit green on every change when CI exists. Critical integration should not be “never run.”
