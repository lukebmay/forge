# forge-proof-regression-loop — Unattended nest proof regression

**Status:** Accepted (orchestrator lock 2026-09-03); **P0 landed; P1 code landed (live nest pending)**
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-09-03 (N.tabbed-edge nest PASS)
**Related:** [testing.md](../testing.md) ·
[live matrix](./forge-ai-live-test-matrix.md) ·
[Wayland RC](./forge-wayland-rc-test-suite.md) ·
[nested isolation](./archived/completed/forge-nested-isolation.md) ·
[chaos nest queue](./forge-layout-chaos-nest-queue.md) ·
[tab-share/close-reflow](./forge-tab-share-close-reflow.md) ·
[monitors.md blank/wake](../../docs/user/monitors.md)

## Goal

Make the operator's **usual host desk checks** a closed-loop nest
regression that agents run for hours **without human judgment on the
green path**. Failures are mechanical (CTS + catalog), queued, and
reproducible. Host remains authority only for what nest physically
cannot prove (real dual-4K, real idle+DPMS suspend, visual chrome).

**Bulletproof** here means: deterministic catalog → scripted CTS →
loop runner with nest restart → fail→queue. Not "an agent stares at
the nest window."

## Acceptance (plan)

- [ ] Manual checks mapped: nest smoke id / `LIVE_CASES` / host-only
- [ ] `forge-test nested proof-loop` runs a named suite in a loop
- [ ] Nest isolation FIRM: private `XDG_RUNTIME_DIR`; always stop;
      campaigns install `--dev` (TRACE)
- [ ] Close-reflow + tab-share ~1/2 is a nest CTS smoke (not host-only)
- [ ] Sleep/wake: honest gates (nest-approx vs host-only) + inject hook
- [ ] Failure writes a queue row (seed, smoke, log pointers); no agent
      "looks fine" override on green
- [ ] L0 units for catalog/select/share oracles (no live Shell)
- [ ] Docs: `testing.md` + forge-test help name the loop
- [ ] Do **not** require host logout loops; do **not** claim dual-4K
      or real suspend are nest-proven

## Problem diagnosis

The pyramid exists and is not empty. It still leaves the **human as
the regression oracle** for the gestures they repeat every session.

### What already exists

| Layer | What it is | Gap |
| --- | --- | --- |
| **L0** | pytest/vitest; close-reflow units landed with S2–S5 | Does not paint Meta, join, or wake |
| **Live matrix** | `LIVE_CASES` + `forge-test live plan/run` | Host-desk E2E; **agent judgment**; gated post-D100c; pre-D100 RC greens are invalid |
| **Nest smokes** | `smoke-mark2`, `smoke-toggle-tab`, `smoke-layout-ws`, `smoke-layout-occupied`, `smoke-layout-dnd`, `smoke-layout-tabbed-edge`, `smoke-geom-epsilon`, `smoke-nest-apps` | One-shot; no hours loop; no fail queue; **no close-reflow / tab 1/2** |
| **Chaos queue** | `FORGE_LAYOUT_CHAOS` + [forge-layout-chaos-nest-queue.md](./forge-layout-chaos-nest-queue.md) | Layout-apply cocktails only; empty until a fail is filed |
| **RC procedure** | [forge-wayland-rc-test-suite.md](./forge-wayland-rc-test-suite.md) | Last black green 2026-08-10 was **pre-D100** (old handlers on) |
| **Idle/wake** | `trigger-idle-lock.zsh` + monitors.md | Host/X11 DPMS; nest dummy mons do not GPU-peel |

### Why humans still run the same checks

1. **Catalog is host-shaped.** `LIVE_CASES` encode dual-4K chrome
   open-leaf, agent survival, personal-desk thrash. They are not the
   operator's daily "close one of three, tab the group, look at
   borders, join/move." Those live in HANDOFF as **host verify**.
2. **Nest smokes are campaigns, not a product CTS.** Each is a useful
   script behind `nested run` (always stop). There is no suite object,
   no loop, no seed, no "run until it fails." An agent that wants hours
   of proof must invent a shell `for` and babysit.
3. **Green path still asks for judgment.** Live matrix product rule 1:
   scripts do setup/tree/checks; **the agent supplies selection and
   judgment**. That is correct for ambiguous dual-mon chrome. It is
   wrong for "siblings filled 1/2" and "closed id gone." Those are
   numbers.
4. **D100 changed the desk.** Old RC PASS (R013/R014) ran with
   GObject handlers connected. D100c deleted `window.js`. Close/tab
   share bugs (S2–S5) are exactly the class that pre-D100 greens
   cannot speak to. PRIORITY still gates matrix/RC/chaos behind
   "post-D100c nest hold" — which this plan **is**.
5. **Sleep/wake is a different physics.** Idle auto-lock + DPMS +
   hybrid GPU fires `workareas-changed` while Mutter shoves windows
   onto the primary. Dummy nest monitors do not blank, do not DPMS,
   do not re-probe connectors. Treating nest ping after `xset dpms`
   as wake-proof is a **false green**.
6. **Always-stop smokes vs interactive nest.** Isolation is FIRM and
   correct (`run` always stops). A proof loop must **use** that
   (restart between iterations), not fight it with `--keep` for hours.

### The operator's actual oracle (today)

From [HANDOFF.md](../HANDOFF.md) + [tab-share-close-reflow](./forge-tab-share-close-reflow.md):

| Check | Expect | Where it lives today |
| --- | --- | --- |
| Close one of three tiles | Siblings fill ~1/2; no stuck 1/3 | Host eyes; L0 units only |
| Tab-click a ~1/2 group | Meta width ~1/2, not ~1/3 | Host eyes; S1 Forest slot |
| Borders | Only focused border; tab groups green | Host eyes; no nest assert |
| Open-leaf | New window on LFT / dock mon | `LIVE_CASES` L1 + nest layout smokes partial |
| Join / move / group | Mark 2 tree change | `smoke-mark2` (join.right only); U4 optional |
| Wake survival | Dual-head + tabs after idle+DPMS | Host `trigger-idle-lock.zsh`; H1 units |

That list is short. It is also **exactly** what should be a nest
loop, except wake (physics) and borders (pixels).

## Target architecture

```text
L0  unit/integration for blast radius          always first
     ↑ pytest / vitest (share repair, forgetHostWindow, …)
N   nest proof loop                            hours, unattended
     ↑ forge-test nested proof-loop
     ↑ catalog NEST_PROOF_CASES (deterministic)
     ↑ each case = existing or new smoke + CTS
     ↑ nest restart between iterations (run always-stop)
     ↑ fail → JSONL queue (seed, case, log pointers)
H   selective host                             rare
     ↑ LIVE_CASES that nest cannot prove
     ↑ tagged host-only (dual-4K, idle+DPMS, visual borders)
     ↑ no logout loops; nest already loaded the tip
```

### What "bulletproof" means (FIRM)

| Rule | Detail |
| --- | --- |
| **Deterministic catalog** | Every case has id, smoke entry, monitors, CTS, capability (`nest` / `nest-approx` / `host-only`) |
| **CTS asserts** | Forest (parent/children/order), mode, **identity**, geom/share ε, closed-gone. Not `toHaveBeenCalled` |
| **Loop runner** | One CLI; hours/iterations/seed; stop conditions; JSONL tape |
| **Failure→queue** | Repro command + seed + nest log pointers. Chaos queue stays for layout cocktails; proof failures get their own JSONL |
| **No agent judgment on green** | Exit 0 means CTS passed. Agent debugs **red** only |
| **Canonical APIs** | Extend `forge-test nested` + sibling catalog (`nest_proof.py`). Do **not** invent a second harness. `LIVE_CASES` stay host-desk |
| **Isolation** | Private `XDG_RUNTIME_DIR`; `FORGE_HOST` + `FORGE_CONFIG_HOME`; `--dev` TRACE; always stop nest |
| **Capability honesty** | Nest dummy 1920×1080 ≠ dual-4K. Nest DPMS ≠ session sleep. Refuse or tag `host-only` |

### Catalog home (Canonical APIs)

| Catalog | Owns | Runner |
| --- | --- | --- |
| `scripts/forge/live_matrix.py` `LIVE_CASES` | Host L1/L2 desk (chrome, cold, open-leaf) | `forge-test live` |
| `scripts/forge/nest_proof.py` `PROOF_CASES` | Nest-provable CTS (smokes + loop) | `forge-test nested proof-loop` / `smoke-*` |

Do not stuff nest smokes into `LIVE_CASES`. `live run` executes host
`forge layout` and agent-survival checks; a nest smoke would either
be skipped or destroy the host desk. Cross-link by id in notes.

### Capability tags (FIRM)

| Tag | Meaning | Loop may run? |
| --- | --- | --- |
| `nest` | Dummy mons + nest clients prove the contract | yes |
| `nest-approx` | Best-effort inject (workareas thrash, lock-dialog if present) — not physics-equal | yes, labeled approx |
| `host-only` | Requires host session physics or visual | **no** (print skip) |

## Manual → automated map

Operator usual checks → where they run. **N.*** = `PROOF_CASES` id.

| Manual check | Expect | Nest proof | LIVE_CASES | Still host-only |
| --- | --- | --- | --- | --- |
| Close 1 of 3 tiles | Siblings fill ~1/2; no stuck 1/3; closed id gone | **N.close-reflow** (`smoke-close-reflow`) | `L1.close-focus-lft` (focus, not share) | Host dual-4K chrome close (optional RC) |
| Tab-click group ~1/2 | Meta ≈ Forest paneRect ~1/2, not ~1/3 | **N.tab-share** (same smoke, stage 2) | `L1.r026` / `L1.r032` notes (not CTS width) | Visual tab strip |
| Borders | Only focused; tab groups green | **skip / later** St paint | — | **host-only** (pixels) |
| Open-leaf | Attach LFT / dock mon; no PlaceNext mon-root | `smoke-layout-occupied` + `smoke-layout-ws` step 4 | L1 open-leaf / R054 / R021 | Host chrome-family open-leaf RC |
| Join | Tree changes; bag or split as Mark 2 | `smoke-mark2` (`join.right`) | — | Host first-try Nautilus CENTER (U4) |
| Move | Leaf moves; dest mon / sibling | `smoke-layout-ws` step 5; `smoke-layout-dnd` | R015/R022 | Host DnD maze (parked) |
| Group (CENTER tab) | TABBED bag; WINDOW kids only | `smoke-layout-ws` step 6 CENTER; `smoke-layout-tabbed-edge` | R012 | Host Nautilus-under-Ghostty first try |
| Toggle tab/stack | TABBED ↔ STACKED | `smoke-toggle-tab` | — | — |
| WS switch + layout | A on WS1, B on WS2, back, re-run A | `smoke-layout-ws` | — | — |
| Occupied dest apply | No open-miss / PlaceNext | `smoke-layout-occupied` | — | — |
| Geom ε (sent↔observed) | D095 bound | `smoke-geom-epsilon` | — | Host 4K scale |
| Apps map in-nest | Nautilus/Ghostty/editor/Chrome isolation | `smoke-nest-apps` | — | Host Chrome profile |
| Wake / idle lock | Dual-head + tabs survive | **N.wake-approx** (workareas inject) | `L1.r016-noop-workareas` (no-op fp) | **host-only** real idle+DPMS (`trigger-idle-lock.zsh`) |
| Dual-4K cold / chrome RC | Physical heads, scale, chrome | nest `--monitors=2` dummy ≠ 4K | L1/L2 suites | **host-only** |
| True cold + clean | Empty desk → layout | nest can empty | L2 `true-cold-dev` / `layout-clean` | True cold with tiled agent window |

### Suite membership

| Suite | Cases | Default mons | Overnight? |
| --- | --- | --- | --- |
| `core` | N.close-reflow, smoke-mark2, smoke-nest-apps | 1 | warm-up |
| `regression` | core + layout-ws, occupied, dnd, tabbed-edge, geom-epsilon, toggle-tab | 1 or 2 per case | **yes** |
| `chaos` | regression + `FORGE_LAYOUT_CHAOS=1` on layout smokes | 2 | optional |
| `wake-approx` | N.wake-approx only (later slice) | 2 | optional |
| `host` | print-only skip list | — | never in nest loop |

## Nested loop runner design

### CLI (Canonical — extend `forge-test nested`)

```bash
./install --dev   # TRACE; FIRM for campaigns
./scripts/forge/forge-test nested doctor          # exit 0 or stop
./scripts/forge/forge-test nested proof-loop --suite regression --hours 8 --seed 1
./scripts/forge/forge-test nested proof-loop --suite core --iterations 3
./scripts/forge/forge-test nested proof-loop --dry-run --suite regression
./scripts/forge/forge-test nested smoke-close-reflow   # one-shot; always stops
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--suite` | `core` | `core` / `regression` / `chaos` |
| `--hours` | unset | Wall clock stop |
| `--iterations` | `1` if no `--hours` | Full suite passes |
| `--seed` | `1` | Integer; chaos + jitter |
| `--until` | `fail` | `fail` stop on first red; `keep-going` finish hours |
| `--cases` | suite | Explicit `N.close-reflow,smoke-mark2` |
| `--chaos` | off | `FORGE_LAYOUT_CHAOS=1` + seed on layout cases |
| `--dry-run` | off | Print resolved cases; no nest |
| `--json` | off | Machine summary |
| `--keep` | **off** | Debug only; FIRM default always-stop |
| `--record-queue` | nest state JSONL | Path to append fail rows |

Stop = whichever of hours / iterations hits first. SIGINT → stop nest
→ non-zero. `doctor` fail → exit 2, do not start a loop.

### Nest lifecycle per case (FIRM)

Reuse `_cli_run` / `run_campaign` (N3). Each case is `start → smoke
script → always stop` unless `--keep`. That **is** the restart
between iterations. Do not hold one nest for hours: Shell leaks and
stale Meta ids hide close-reflow bugs.

```text
for iter in 1..N:
  for case in suite:
    run_campaign(case.argv, monitors=case.monitors)  # always stop
    append JSONL {iter, case, rc, wallMs, seed}
    if rc != 0 and until=fail: write queue; stop nest; exit 1
stop nest; status running: False
```

### Logging

| Tape | Where | Who reads |
| --- | --- | --- |
| Loop JSONL | `~/.local/state/forge/nested/<name>/proof-loop/<utc>.jsonl` | agent / `proof-loop` summary |
| Nest forge.jsonl | nest `FORGE_CONFIG_HOME` sibling | `forge-test nested log --grep …` |
| gnome-shell stderr | nest `shell.log` | `nested logs` (not hunts) |
| Fail queue | same proof-loop dir `failures.jsonl` | next agent repro |

Never `tail` TRACE. Hunt: `forge-test nested log --grep PAT --level info+ --last 40`.

Fail row fields: `utc`, `iter`, `seed`, `case_id`, `smoke`, `rc`,
`repro` (copy-paste command), `forge_jsonl`, `shell_log`. Chaos
cocktail fails **also** append to
[forge-layout-chaos-nest-queue.md](./forge-layout-chaos-nest-queue.md)
when `--chaos` (existing queue contract).

### Isolation (FIRM — do not regress N1–N3)

- Private `XDG_RUNTIME_DIR` under nest state (client_env)
- `FORGE_HOST=<host>-sub-<name>`, `FORGE_CONFIG_HOME=<nest>/forge-config`
- Always stop; `status` reaps stale
- `./install --dev` before JS campaigns (TRACE / D068)
- Prefer `run` over `eval $(nested env --export)` on agent shells
- Stop nest before any host `forge-test live`

### What the loop will not do

- Host logout / login
- `gdisplays` load / real connector thrash
- Personal `dev` / `t1` layouts
- Close the host agent Ghostty
- Claim visual border color PASS

## Sleep / wake testing strategy

Honest split. Nest **cannot** prove overnight idle+DPMS on hybrid GPU
dual-4K. Pretending it can is how we ship false greens.

### What nest CAN prove (`nest-approx`)

| Inject | How | Proves |
| --- | --- | --- |
| Workareas thrash | Shell.Eval emit / call the same settle path H1 uses (`workareas-changed` analog, or `sessionApi` hook) with **unchanged** dummy geometry | No-op fingerprint (R016 class): tiles + tabs stay |
| Workareas thrash + fake peel | Same hook with jittered workarea or mon index swap on dummy heads | Monitor-recovery reparents by stable key / geom; tabs not unwrapped |
| Lock dialog present | If nest gnome-shell shows screensaver/lock, `ScreenSaver.Lock` via nest bus | Extension does not drop tree on lock **dialog** (not DPMS) |
| Enable↔disable | Nest disable/enable Forge (install path, not wake) | Session-layout stamp re-apply (monitors.md install/update) |

Proposed hook (slice **P-wake**, not P0):

```text
sessionApi._debugWorkareasPulse({ reason, fingerprintMutate })
```

Adapter-only, TRACE-gated, nest/eval. Not a user Op. Calls the same
monitor-recovery settle as the real signal. Unit: existing
`workareas-policy` / `bug-h1-soft-rehome-workareas-thrash` stay L0.

### What nest CANNOT prove (`host-only`)

| Physics | Why nest fails |
| --- | --- |
| Idle auto-lock | Nested shell is a window; host idle ≠ nest idle; mutter dummy heads do not GPU-off |
| DPMS blank | `xset dpms` is X11 host; Wayland host DPMS does not blank dummy mons inside the nest window |
| Connector re-probe / hybrid GPU peel | No real DRM; `MUTTER_DEBUG_NUM_DUMMY_MONITORS` stays put |
| Dual-4K scale / physical arrangement | Dummy 1920×1080 @ scale 1 |

Host procedure (already documented; do not replace):

```bash
./scripts/forge/trigger-idle-lock.zsh --idle-and-dpms --idle-delay=10
# then: dual-head placement, tab pairs, forge tree, journal
```

Manual lock (`Super+Delete`) is a **control**, not the overnight path
(monitors.md). A human blocker for true wake remains **soft** unless
an RC explicitly requires it.

### Gates

```text
proof-loop --suite regression     # never includes host-only
proof-loop --suite wake-approx    # inject only; labeled approx in JSONL
forge-test live run --tags R016   # host no-op workareas (if capability)
trigger-idle-lock.zsh             # host-only; agent does not fire on daily desk
```

Probe field (later): `can_host_idle_lock` (gsettings + gdbus + not
destroying tiled agent). Default skip.

## Implementation slices

Ordered by proof value. Blast = files/risk, not drama.

| Slice | What | Acceptance | Blast | Status |
| --- | --- | --- | --- | --- |
| **P0** | `nest_proof.py` catalog + select + share oracles; `proof-loop` CLI stub looping **existing** smokes; always-stop; JSONL; dry-run; units | `proof-loop --dry-run --suite regression` prints cases; `--iterations 1 --suite core` runs mark2/nest-apps if nest up; L0 units green | `nest_proof.py`, `test_cli.py`, `nested_wayland.py`, `tests/unit/cli/test_nest_proof.py` | **landed** (live nest pending) |
| **P1** | `smoke-close-reflow`: 3 ghostty → close one → siblings ~1/2 (not 1/3); closed gone; stage 2 tab-group Meta not ~1/3 | Nest CTS red if stuck 1/3; wired as `N.close-reflow` + `forge-test nested smoke-close-reflow` | `nest_close_reflow_smoke.py`, cmd_nested, help | **landed** (L0 + nest PASS) |
| **P2** | Join/move/group coverage gaps: invoke `move.*` + `group` (CENTER) as named core cases, not only layout-ws step 6 | `N.join` / `N.move` / `N.group` in `core` or `regression`; U4 nest optional folds in | nest_invoke + small smokes | next |
| **P3** | Fail queue + chaos: `--until keep-going`; chaos rows also hit layout-chaos queue | Red smoke writes `failures.jsonl` + repro cmd | nest_proof loop | next |
| **P4** | Wake-approx inject hook + `N.wake-approx` | Dummy workareas pulse; tabs/ids survive; **not** claimed as DPMS | adapter sessionApi debug + smoke | after P1 green |
| **P5** | Docs: testing.md nest loop; RC suite points here; HANDOFF "host verify" shrinks to host-only rows | Agents run `proof-loop` instead of asking human for close/tab | testing.md, RC plan, HANDOFF | with P1 |
| **P6** | Optional: border CTS (focused class / tab green via GetTree or eval computed style) | Only if a stable non-pixel oracle exists | skip if brittle | optional |
| **P7** | Host-only tag in `LIVE_CASES` notes + `forge-test live plan --from-work wake` refuses nest fantasy | Probe/plan print `host-only: idle-dpms, dual-4k` | live_matrix notes | optional |

### P0 acceptance (detail)

- [x] `PROOF_CASES` lists every current `smoke-*` + close-reflow
- [x] `select_proof_cases(suite, cases=…)` pure
- [x] `cmd_proof_loop` uses `run_campaign` per case (always stop)
- [x] `--dry-run` exit 0 with JSON/text plan
- [x] Host-only cases never selected for nest suites
- [x] Units: select, hoist flags, help mentions `proof-loop`

### P1 acceptance (detail)

- [x] Seed 3 nest ghostty TILEs (mon=1)
- [x] Close one via `close_window_id` (sessionApi `_closeOp`)
- [x] Assert closed id absent; 2 TILEs remain; width ratios not in
      `[0.28, 0.38]` of monitor (stuck-1/3 band); pair fills ~1/2 or
      VSPLIT ~1/2 height
- [x] Stage 2: CENTER group one remaining + new tile → TABBED \| sibling;
      revealed child rect ~1/2 of monitor (ε 8%)
- [x] Ghost WINDOW forbidden (`assert_forest_oracles` + no `forge-ph`)
- [x] Always-stop via existing `smoke-*` → `_cli_run` pattern

### Estimated time

| Slice | Nest wall (one pass) | Agent work |
| --- | --- | --- |
| P0 | core ~2–4 min/iter; regression ~15–25 min/iter | 1 session |
| P1 | ~1–2 min | 1 session (oracle + flake) |
| P2 | +1–3 min | 1 session |
| P4 | +1 min | 1–2 sessions (hook care) |
| Overnight regression | `--hours 8 --suite regression` ≈ 20–30 iters | unattended |

## Conference verdict

### Strongest recommendations

1. **Do not grow `LIVE_CASES` into a nest loop.** Host matrix and nest
   CTS are different runners. Sibling catalog + `forge-test nested
   proof-loop` is the Canonical extension.
2. **Close-reflow + tab 1/2 is the missing core smoke.** Everything
   else in the operator's list is already a nest campaign except
   borders and real wake. Ship that smoke before adding more layout
   cocktails.
3. **Restart nest every case.** Cheap vs false greens from leaked
   Meta ids / stale Forest. Isolation plan already paid for `run`.
4. **Label wake as approx or host-only.** An inject hook is worth
   building (R016 + H1). Calling it "sleep/wake tested" is not.
5. **Invalidate pre-D100 RC greens.** Re-run `regression` suite on
   this tip; do not cite 2026-08-10 black as D100 sign-off.
6. **Human host verify shrinks** to: visual borders, real idle+DPMS
   when they care, dual-4K chrome RC. Close/tab/join/move become nest
   exit codes.

### Dissent risks (what will still fail)

| Risk | Why | Mitigation |
| --- | --- | --- |
| **False green on wake** | Dummy mons never GPU-peel | Capability tags; host script stays |
| **False green on dual-4K** | 1920×1080 @1 ≠ scaled 4K slots | Host L1 remains RC authority |
| **False green on borders** | GetTree has no CSS | Leave host-only until a stable oracle |
| **Flake on 3-tile seed** | Nest Ghostty map timing; GApplication | Reuse `seed_ghostty_tiles` + wait; restart nest |
| **Join vs group confusion** | `join.right` splits; CENTER `group` tabs | CTS must assert layout word (TABBED vs HSPLIT) |
| **Stuck-1/3 ε too tight/loose** | Gaps/borders ~8–16px on 1920 | Band: fail 1/3 ±5%; pass 1/2 ±8% |
| **Loop burns the host** | Nested shell is a window on the daily desk | 1–2 dummy mons; always stop; don't `--monitors=4` overnight |
| **dconf shared** | Host `disable-user-extensions` kills nest Forge | doctor/docs already; loop fail message must name this |
| **Chaos as "the" regression** | Shuffle/delay finds layout races, not close-reflow | Chaos is `--suite chaos`, not default `regression` |
| **Agent still asked to "confirm desk"** | Habit / HANDOFF text | P5: HANDOFF host table = host-only only |
| **proof-loop vs job runner** | Hours-long; TTY death | Grok leader already; optional later `is_mutating_job_command` for `nested proof-loop` — not P0 |
| **G8n / tree.js peel mid-loop** | Topology still moving | Loop proves **this tip**; do not freeze G8n for greens |

### Non-goals

- Replacing L0
- Full chrome L1 inside nest (N5 still later)
- UNIX test user / bubblewrap
- Auto-login / host logout
- Pixel-diff screenshots as the CTS (too brittle)
- Personal layout profiles

## Code map

| Piece | Path |
| --- | --- |
| Catalog + loop | `scripts/forge/nest_proof.py` |
| Close-reflow smoke | `scripts/forge/nest_close_reflow_smoke.py` |
| CLI | `scripts/forge/test_cli.py`, `nested_wayland.py` `cmd_nested` |
| Existing smokes | `nest_mark2_smoke.py`, `nest_layout_ws_campaign.py`, … |
| Host catalog | `scripts/forge/live_matrix.py` |
| Nest isolation | `scripts/forge/nested_wayland.py` (`run_campaign`, `client_env`) |
| Units | `tests/unit/cli/test_nest_proof.py`, `test_nest_close_reflow.py` |
| Idle host | `scripts/forge/trigger-idle-lock.zsh` |

## Context for the next agent

Execute **P0 remainder / P1** on this plan. Do not dual-write
Forest←GObject. Do not grow `live-handle.js`. Do not invent
`Mark2Drop*`. Do not start host `forge layout` with nest env
exported. Do not commit/push unless asked.

**Landed this session (P0 + P1 close-reflow):**

- Plan (this file)
- `scripts/forge/nest_proof.py` — `PROOF_CASES`, `select_proof_cases`,
  share/stuck-third oracles, `cmd_proof_loop` (`--dry-run` /
  `--iterations` / `--hours` / `--until` / `--suite`)
- `scripts/forge/nest_close_reflow_smoke.py` — 3→close→1/2 CTS +
  tab-share stage; `forge-test nested smoke-close-reflow`
- CLI: `proof-loop` + `smoke-close-reflow` in `_NESTED_ACTIONS`,
  help, `cmd_nested`
- Units: `tests/unit/cli/test_nest_proof.py` + `test_nest_close_reflow.py`

**Proven:** L0 units (43 pytest). Nest `smoke-close-reflow` **PASS**
2026-09-03 (`axis=hsplit tab=True`; nest stopped). Next:

```bash
cd ~/dev/me/forge
./install --dev
./scripts/forge/forge-test nested doctor
python3 -m pytest tests/unit/cli/test_nest_proof.py tests/unit/cli/test_nest_close_reflow.py tests/unit/cli/test_nested_wayland.py -q
./scripts/forge/forge-test nested proof-loop --dry-run --suite regression
./scripts/forge/forge-test nested smoke-close-reflow
./scripts/forge/forge-test nested proof-loop --suite core --iterations 1
./scripts/forge/forge-test nested status   # running: False
```

**Failed / not tried:** first nest run failed naive WINDOW percent
`[0.5, 1.0]` (inner CON fill=1); 3-tile CENTER dnd `commit failed`
(likely min-size on ~1/3 slots). Fixed: split-parent percents;
CENTER-join the two survivors (inventory step 5) + toggleTabStack
fallback. Third nest run PASS.

**Enable:** `./install --dev` (TRACE). Nest isolation is automatic
via `nested run`. Chaos: `--suite chaos` or `--chaos` (P3 polish).

**Risks:** close-reflow flake on seed timing; stuck-1/3 ε; nest
Ghostty-only (Nautilus often GApplication stub — do not require it
for P1). Nest P1 is green — HANDOFF host close/tab rows can shrink
to occasional tip load (not ordinary 1/3 proof).

**Do not:** `--keep` overnight; personal `dev`/`t1`; treat dummy
DPMS as wake; cite pre-D100 RC; run host live with nest exported.

**Next slice:** P1 live-green + P2 join/move/group named cases.
Topology P0 remains G8n-s1 on
[forge-retire-gobject-topology.md](./forge-retire-gobject-topology.md)
— proof loop is keep-parallel overnight, not a G8n dual-write.

## Session note

2026-09-03 — **P1 `smoke-close-reflow`.** Inventory campaign is
`forge-test nested smoke-close-reflow` (always-stop, mon=1). Seed 3
ghostty → CTS0 three kids → close one → remaining pair `percent≈0.5`
and Meta/GetTree width ~1/2 (fail stuck ~1/3) → open third + CENTER
the two survivors (dnd CENTER, else toggleTabStack) → TABBED
(full-width pair slot). Revealed Meta must not be stuck ~1/3. Hunt
`forgetHostWindow|repairSharesAfterChildChange|window-destroy` is
best-effort; leftover `forge-ph` fails. Forest GetTree CON.rect is
null — tab CTS uses the revealed WINDOW Meta/rect (`assert_slot_half_width`
always, not gated on bag.rect).

CLI already had `smoke-close-reflow` in `_NESTED_ACTIONS` / help /
`cmd_nested`. Share oracles live in `nest_proof.py`. L0:
`tests/unit/cli/test_nest_close_reflow.py` + percent/placeholder rows
in `test_nest_proof.py`.

```bash
./install --dev
./scripts/forge/forge-test nested doctor
python3 -m pytest tests/unit/cli/test_nest_close_reflow.py tests/unit/cli/test_nest_proof.py -q
./scripts/forge/forge-test nested smoke-close-reflow
./scripts/forge/forge-test nested status   # running: False
```

**Nest:** PASS `close-reflow ok … axis=hsplit tab=True`. Always-stop
(`nested status` running: False). Doctor `can_nested=true`.

Do not dual-write; do not grow `live-handle.js`; do not invent
`Mark2Drop*`. No commit/push unless asked.

## Session note — N.layout-ws flake

2026-09-03 — **`proof-loop --suite regression` N.layout-ws.** Repro
`nested smoke-layout-ws --monitors=2` timed out
`waiting for 1 windows on ws=1 (have 0)` after WS1 layout A (core
suite still PASS). Nest `--keep` dump: Meta had ghostty on ws=1;
GetTree `{workspace:1}` empty; Forest parent was `mo0ws0` CON
(sibling of the ws0 left tile). Admit dest was `mo1ws1` /
`emptyHead=true` / `mon-root`; window-map resync agreed. Ghostty
maps `class=null` → FLOATS; FLOAT→TILE `resolveRetileParent` used
ws0 focus / `forest.monitors[0]` (`mo0ws0`). Not client isolation.

**Fix:** `monWsIdFromMeta` + retile/observe to `moNwsW`; skip
end-of-tree attach on empty-head; `_tileInsertUnit` only if under
dest mon; adopt skips other-ws unit. Wait timeout now also prints
`forestAll=` / `metaWs=` (no extra sleep).

```bash
./install --dev
./scripts/forge/forge-test nested smoke-layout-ws --monitors=2
./scripts/forge/forge-test nested status   # running: False
```

**Nest:** PASS `ok a=_forge-test-ghosttys b=_forge-test-ws-b steps=8 extra=nautilus-tile`.
Always-stop. L0: monitor-identity / observe-reality / tom-live 109
green. Drop-slot-split 2 fails are pre-existing (same on stash).

Paths: `lib/extension/monitor-identity.js`, `tom-live.js`,
`observe-reality.js`, `adapter-open-place.js`, `adapter-map-admit.js`,
`scripts/forge/nest_invoke.py`. No commit/push unless asked.

## Session note — nest start/socket race (harness)

2026-09-03 — Overnight `proof-loop --suite core --seed 99` intermittent
fails were **harness**, not product:

```text
nested Wayland socket not ready: /run/user/1000/wayland-forge
DBus GetTree failed: Could not connect: No such file or directory
```

Later iterations of the same smokes PASS. Rapid start→stop (always-stop
per case) can miss the nest compositor socket or Forge DBus name.

**Fix (shared path, all smokes):** `nested_wayland.py`

- `start()` retries **once** on socket-not-ready (`run_with_socket_retry`)
- `run_campaign` waits socket + gnome-shell + Forge DBus
  (`wait_nest_session_ready`) **before** exec; no GetTree until ready
- Clearer errors: timeout, socket/bus path, `shell.log`, retry note,
  `disable-user-extensions` hint on Forge miss

L0: `tests/unit/cli/test_nested_wayland.py` (retry/wait helpers; no live
nest). Did **not** stop soak nest `forge`; no live nest experiment.

```bash
python3 -m pytest tests/unit/cli/test_nested_wayland.py -q
```

No commit/push unless asked.

## Session note — N.tabbed-edge dnd-drop CENTER

2026-09-03 — **`smoke-layout-tabbed-edge`.** Repro on nest
`--name forge-tabbed` (did **not** stop soak `forge`):

```text
nest tabbed-edge: zone=LEFT
nest tabbed-edge: dnd-drop CENTER not ok: dnd-drop: commit failed
```

3 Ghosttys auto-tile as `HSPLIT(A, VSPLIT(B,C))`. CENTER of two
windowId-sorted tiles is often a **non-sibling** Group. Mark 2 Group
fail-closed (`group: onto window not a sibling`). Pointer still emitted
`group`. After Group wrap-tab-onto, LEFT was a pointer **noop**: join
mins used the zone paint strip then halved it again (256 > ~115).

**Fix (product):**

- Group pointer onto a nested WINDOW wrap-tabs at dest slot
  (`groupNonSiblingWindow` / `wrap-tab-onto`)
- Join edge onto a tab WINDOW **slot-splits** the sibling bag (H5;
  flip parent to H/V)
- Pointer join mins vs the **onto pane**, not the zone strip
- Nest `stop` pid/env match is token-exact (`wayland-forge` must not
  kill `wayland-forge-tabbed`). Default display is `wayland-<name>`

**Live:** `./install --dev` then

```bash
./scripts/forge/forge-test nested smoke-layout-tabbed-edge \
  --name forge-tabbed --display wayland-smoke-forge-tabbed --monitors=2
./scripts/forge/forge-test nested stop --name forge-tabbed
```

Use a display that does **not** prefix-match soak `wayland-forge` until
the running soak process reloads `nested_wayland.py`.

**Nest:** PASS `ok zones=LEFT,RIGHT,TOP,BOTTOM`. Always-stop
(`forge-tabbed` running: False). Soak `forge` left running (core iter
28+). L0: `mark2-pointer.test.js` 17; `test_nested_wayland.py` 31.

Paths: `lib/opsets/mark2.js`, `mark2-pointer.js`,
`prototypes/container-motion/src/opsets/mark2.md`,
`lib/extension/forest-run.js`, `drag-drop.js`,
`scripts/forge/nested_wayland.py`,
`nest_layout_tabbed_edge_smoke.py`. No commit/push unless asked.

## Session note (orchestrator overnight)

2026-09-03 late: core soak `--seed 99` ~34 iters / ~4% harness fails
(all `socket not ready` / DBus — early iters + one during concurrent
`forge-reg` regression). Nest start readiness harden landed mid-soak
(`wait_nest_session_ready` + one start retry). Product fixes:
layout-ws Meta `moNwsW` retile; tabbed-edge Group wrap-tab + Join
slot-split + join mins. Do not run a second nest while soak owns
`forge`. After soak: quiet full regression once.

2026-09-03 morning wrap: 4h core soak `--seed 99` finished
**294 iters / 882 runs / fail=4 (0.45%)** — all harness socket-not-ready
(iters 2/5/7/28). Product CTS clean after. Quiet
`proof-loop --suite regression --iterations 1` → **9/9 PASS**
(close-reflow, join-right, toggle-tab, nest-apps, layout-ws,
layout-occupied, layout-dnd, tabbed-edge, geom-epsilon). Nest stopped.
