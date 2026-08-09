# Handoff — forge (lukebmay)

**Updated:** 2026-08-09 (nest stop FIRM; isolation D0 next; unfocus abandoned)  
**Branch:** **`master`** (default).  
**Sessions:** **Wayland** daily driver + extensive smoke via **`forge nested`**. Dual-mon CT = host desk **or** nest `--monitors=2`. **X11** still fine for HUP loops when available.  
**Agent terminal:** Durable **Grok leader** for true cold (closes agent TILE). Guake/float also OK. After true cold, **leader must reopen a head** (Ghostty) and operator `/resume` or `grok -r`.  
**Jobs (shipped):** Mutating `forge` durable by default. Closing TTY does not abort apply.  
**Layouts for tests:** only **`_forge-test-*`** — never personal `dev` / `t1` in matrix.  
**Wayland RC suite:** [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) · results `agents/test-results/wayland/`

**Default:** fix the **real problem** (phase contract). Temporary only if operator **explicitly** asks.

---

## Architecture lock (do not re-litigate)

| Topic | Decision |
| --- | --- |
| Cold spine | `skeleton → open → bind → order/size → hard-ready → focus once → soft residual → verify once` |
| Soft residual (D019) | **Product** — Meta has no settle ACK; learned quiet + correct-on-miss. Not a bug class. |
| Mode B as cold success | **Forbidden** — Mode B = true mid-session chaos only |
| Belt after bind | **Moves-only** (D014) — no structure rewrite on happy path |
| Profiles | Data only — no personal-layout product branches |
| Focus | Post-settle phase; open-leaf pin on steal (D018) |
| Unfocus key (`Ctrl+Super+Esc`) | **Abandoned** — not product; keybind unbound |
| Close → focus | **Kept** (FC1) — LFT/sibling restore |
| CLI jobs | Durable mutators (D021) |
| Wayland retest | `forge nested restart` (not logout loop); dual-mon nest: `--monitors=2` |
| Nest mon size | Each dummy mon = host **primary logical** size (not squeezed 2-in-1) |

### Why patches are bad (still FIRM)

Name the phase that failed → fix that contract → delete crutches. See historical detail in [REGRESSIONS.md](./REGRESSIONS.md) and [project.md](./project.md) § Layout apply architecture.

---

## Start here (next agent)

| Pri | Work | Path |
| --- | --- | --- |
| **next** | **Discussion:** practical nest isolation (+ extension shutdown) — strategies first, no code until lock | [D0](./tasks/forge-nested-isolation_d0-discussion.md) |
| **next** | Wayland nest dual-mon RC (`_forge-test-*` only); **always `forge nested stop` after nest tests** | [suite](./plans/forge-wayland-rc-test-suite.md) · [nested](../scripts/forge/nested_wayland.py) |
| **next** | Host dual-mon L1 on `_forge-test-*` after nest green; R010 only if structure still fails first-shot | live matrix |
| later | STACKED product / resize-autotile | other plans — do not mix into cold spine |
| done | R007 open-leaf; D019 hard/soft; AT-W1 nest; CLI jobs; SE0–SE9; place→structure residual; leader true-cold; `_forge-test-*` profiles | — |

### Headless / true cold (FIRM)

1. Only **durable Grok leader** (or Guake/float) can survive closing all tiles.  
2. A **windowed** Grok client **dies with its TTY** — it cannot reattach itself after you kill its terminal.  
3. After live suites that close the agent TILE, the **leader process** must reopen a head (`ghostty`) and the operator reattaches (`grok -r` / `/resume`).  
4. `forge test live run` attempts auto-launch Ghostty when `GROK_LEADER_SOCKET` is set and agent window is gone.

```bash
forge test live probe   # want can_true_cold + leader note when applicable
forge test live run --suite cold
# if empty desk: open Ghostty, then: grok -r <session-id>
```

### Nested Wayland dual-mon

```bash
forge nested start --monitors=2 --replace   # size defaults to host primary logical
# throwaway shell only:
eval $(forge nested env --export)
forge ping
forge layout _forge-test-ghosttys
forge tree   # mo0ws0 + mo1ws0
# DO NOT leave nest env on host desk shells
```

### Nest lifecycle — STOP after tests (FIRM)

**Always** tear down the nest when nest work ends (session wrap-up, switch to
host-only work, or abandon a campaign). Leaving a nest running burns CPU/RAM,
can leave orphan dbus, and fights host chrome/session.

| When | Action |
| --- | --- |
| Nest tests done for this prompt/session | `forge nested stop` |
| Moving to host desk matrix | `forge nested stop` first (or never export nest env into host shell) |
| Wrap-up commit / handoff | Confirm `forge nested status` → `running: False` |
| Crash / unclear state | `forge nested stop` then `status`; kill orphans if needed |

```bash
forge nested stop
forge nested status   # want: running: False, shell_pid/dbus_pid None
# if status says not running but ps still shows nest bus dbus-daemon:
#   pkill -f 'state/forge/nested/.*/bus'   # last resort; prefer stop
```

**Do not** leave `eval $(forge nested env --export)` on a durable agent shell —
use a throwaway terminal or `forge nested exec -- …`.

**Nest isolation (next work):** nest can still thrash host chrome/session when
apps share single-instance or host bus is mis-exported. Prefer test apps
(ghostty/nautilus) inside nest; avoid host dock Chrome from nest until isolation
exists. Discussion task first:
[forge-nested-isolation_d0-discussion.md](./tasks/forge-nested-isolation_d0-discussion.md).

### AI live tests

```bash
# L0 first
python3 -m pytest tests/unit/cli/test_layout_apply.py tests/unit/cli/test_live_matrix.py -q
forge test live probe
forge test live plan --from-work open-leaf
forge test live run --from-work open-leaf
```

| Rule | Detail |
| --- | --- |
| L0 then live | Always |
| Select by behaviors/R0xx | Never default full matrix |
| Test profiles only | `_forge-test-dual` / `_forge-test-ghosttys` / `_forge-test-clean` / `_forge-test-nautilus` |
| No personal `dev` in matrix | FIRM |

---

## Abandoned / do not revive

| Item | Status |
| --- | --- |
| `Ctrl+Super+Esc` / WindowUnfocus product | Abandoned 2026-08-09 |
| Mode B as cold success | Still forbidden |
| Belt structure rewrite after bind | Still stripped (D014) |
| Fixed 250ms/2s reassert as truth | Removed (D019 soft) |
| Personal-layout product branches | Forbidden |

---

## Active plans (relevant)

| Plan | Role |
| --- | --- |
| [forge-layout-settle-contract](./plans/forge-layout-settle-contract.md) | Hard/soft settle — **architecture** |
| [forge-layout-cold-topology](./plans/forge-layout-cold-topology.md) | Spine / CT — **architecture** |
| [forge-ai-live-test-matrix](./plans/forge-ai-live-test-matrix.md) | Live capability matrix |
| [forge-wayland-rc-test-suite](./plans/forge-wayland-rc-test-suite.md) | Wayland RC procedure |
| [forge-cli-jobs](./plans/forge-cli-jobs.md) | Durable mutators (shipped) |
| [forge-focus-close-and-escape](./plans/forge-focus-close-and-escape.md) | FC1 close-focus kept; FC2 unfocus abandoned |

Historical complete plans under `plans/*/completed/` — do not re-open as active work without re-scoping to current spine.

### Active tasks cleanup

| Task | Action |
| --- | --- |
| CT2 wayland live | Keep — nest dual + host dual |
| CT3 x11 live | Optional if on X11 |
| wayland residual smoke | Archive notes → suite results |
| settle-learning / settle-pure d0 | Superseded by SE0–SE9 shipped — mark optional/historical |
| cl11 live deferred | Control-loop era — do not reimplement verify-war |
| resize-autotile d0 | Unrelated open product |
| container-motion | Unrelated |
| layout-mon-claim-order | Only if R010 structure still reproduces after place→structure |

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
- **No personal-layout special cases** in product code  
- **No new cold-path pass** without removing an obsolete one  
- **Headless true cold:** reattach head after suite (leader does it)
