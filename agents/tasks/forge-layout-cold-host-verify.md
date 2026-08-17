# forge-layout-cold-host-verify — Host cold `layout dev` after logout (R036)

**Status:** ready  
**Plan:** (none) · residual of R036 / SM1–SM7  
**Branch:** master (default)  
**Blocker:** (none) — human only **logout + login**, then restart agents  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.5** (or any implementer / orchestrator on host after login)  
**Regression:** [R036](../REGRESSIONS.md) · prior work [forge-layout-cold-apply-structure](./forge-layout-cold-apply-structure.md)

## Goal

On a **fresh Wayland host session** (tip already installed before logout),
true-cold `forge layout dev` leaves the dual-mon desk matching the `dev`
profile. Agents own the entire verify (and fix if still broken). Human does
**not** run layout or interpret trees.

## Human-only prep (done before this task runs)

1. Agent session already ran `./install --kit=vim` (tip on disk).
2. Human **logs out and logs back in** (Wayland loads extension JS).
3. Human starts agents again (Guake / durable Grok leader / float OK).

No other human steps. Agents close/open apps as needed for true cold.

## Acceptance

- [ ] `forge ping` shows tip at or after SM1–SM7 install (apiVersion 10;
      version string includes post-SM commit or `-dirty` matching tree)
- [ ] True cold desk: only agent terminal on desk (close chrome / Grok /
      ghostty / PWAs the agent can close — keep **agent** shell alive)
- [ ] `forge layout dev` product path completes (exit 0 preferred; if
      `ok: false` + `hard-failed`, name slots and fix or open honest residual)
- [ ] `forge tree`: mon0 `TABBED(chrome,Grok) | ghostty` (order/open leaf
      per profile); mon1 `ghostty | TABBED(YouTube,Gmail,Voice)`
- [ ] Soft: no hard-abort; preferably low corrections when structure is good
- [ ] Journal during apply: no entered-monitor **rehome applying** while
      ApplyEpoch live; chrome clear reason `all-hard` (SM7), not soft-enter
- [ ] Session note updated; on pass move this task to
      `agents/tasks/completed/` and mark R036 host cold in REGRESSIONS/HANDOFF
- [ ] On fail: name the **phase** (epoch / open / place / hard / focus /
      soft), fix contract or leave a hard residual — do **not** reintroduce
      belt, TILE-anywhere hard-as-ok, mon-root PlaceNext, or soft-enter chrome

## Context for the next agent

### Product path (already in tree)

| Slice | Role |
| --- | --- |
| SM1 | ApplyEpoch home authority (`layout-apply-epoch.js`) |
| SM2 | In-slot hard + forest-match `Done.ok` |
| SM3 | Open PlaceNext into slot/PH (not mon-root) |
| SM4 | Slot machines + hard retry |
| SM5 | Focus after all-hard |
| SM7 | Overlay clear at all-hard |
| SM6 | Belt deleted |

Completed notes:
`agents/plans/forge-layout-slot-machines/completed/`.

### Procedure (agent)

```bash
# 1) Confirm tip loaded after human logout
forge ping
# want: apiVersion 10; version not stuck on pre-SM tip

# 2) Optional L0 sanity (if code still dirty / just pulled)
npm test -- tests/unit/extension/layout-apply-epoch.test.js \
  tests/unit/extension/layout-apply-slot.test.js \
  tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/regression/bug-h1-monitor-recovery-workareas-thrash.test.js

# 3) True cold desk — close layout apps; keep THIS agent terminal
#    (close other chrome/Grok/ghostty/PWA windows the agent can)

# 4) Apply + tree
forge layout dev
forge tree

# 5) Journal snippets
journalctl --user -b --no-pager | rg 'Forge.*(ApplyEpoch|all-hard|enteredMon|hard-failed|chrome|slot)' | tail -60
```

### Pass criteria (tree)

| Mon | Expect |
| --- | --- |
| mon0 | TABBED (chrome + Grok; open leaf Grok per profile) \| ghostty |
| mon1 | ghostty \| TABBED (YouTube, Gmail, Voice; open leaf YouTube per profile) |

Do **not** use personal layouts other than `dev` for this residual. Live matrix
layouts stay `_forge-test-*` only.

### If tip still old

```bash
./install --kit=vim
# Wayland: must ask human to logout again — disable/enable does not reload JS.
# Do not claim cold pass on pre-logout Shell.
```

### Do not

- Reintroduce belt / `beltStructure` as happy path
- TILE-anywhere as hard success
- Mon-root-only PlaceNext for apply opens
- Soft-enter chrome clear
- Mode B as cold success
- Nest dual-mon by default for this residual (host dual-mon is the bar)
- Close the agent’s own terminal

## Session note

**2026-08-16:** Agent task created. SM1–SM7 implement committed/pushed with
install on disk. Human: logout + login + start agents. Next agent runs this
task end-to-end (cold verify ± fix).
