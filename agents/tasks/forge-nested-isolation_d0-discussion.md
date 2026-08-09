# forge-nested-isolation_d0-discussion — Nest isolation strategies

**Status:** ready  
**Plan:** (none standalone) · related [forge-wayland-rc-test-suite.md](../plans/forge-wayland-rc-test-suite.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

**Discussion only** — agree how to isolate nested Wayland Forge tests from the
host session so nest work does not thrash host Chrome, dock, single-instance
apps, or shared D-Bus/session state. Capture options, tradeoffs, and a
**recommended path** before any isolation implementation.

Also in scope for the same conversation: **shutting down extensions** cleanly
in nest (and whether host extension state is affected).

No isolation code in this task. Follow-up implement tasks only after user lock.

## Why now

- Nest dual-mon RC works for ghostty/layout smoke, but nest Chrome / host dock
  can crash or fight (single-instance, shared profile, mis-exported bus).
- Agents leave nests running → CPU/RAM + orphan session buses (mitigated by
  **FIRM** `forge nested stop` after tests — still need better isolation when
  nest *is* up).
- Practical isolation is the next product-facing nest investment.

## Discussion agenda

1. **Threat model** — what must not leak between nest and host?
   - D-Bus session bus (already private nest bus when env correct)
   - Wayland display (private when env correct)
   - XDG runtime / config / cache (Chrome profile, GNOME settings?)
   - Single-instance apps (Chrome, Slack, …)
   - GNOME extensions enablement / state
   - Filesystem layout tree / forge state under `~/.local/state/forge`

2. **Strategy options** (evaluate each: cost, isolation strength, agent UX)

   | Option | Idea | Pros | Cons |
   | --- | --- | --- | --- |
   | **A. Env hygiene only** | Throwaway env, never export nest on host shell; stop after tests | Cheap; already partial | Does not stop single-instance chrome thrash |
   | **B. App allowlist** | Nest only ghostty/nautilus/`_forge-test-*` apps; ban chrome in nest docs | Immediate; no new infra | Weak for chrome-class RC cases |
   | **C. Separate test user** | Nested shell as another UNIX user (or full nested login) | Strong process + home isolation | Setup friction; sudo/polkit; agent complexity |
   | **D. Home/profile namespace** | `HOME=` or Chrome `--user-data-dir=` under nest state dir | Medium isolation without new user | Incomplete for all apps; path footguns |
   | **E. systemd-run / bubblewrap** | Scoped runtime + mounts for nest clients | Stronger sandbox | Heavier; may break Shell embedding |
   | **F. Extension unload** | Explicit disable/enable Forge (and others) around nest; host restore | Clean retest semantics | Host flicker if wrong bus; need careful API |
   | **G. Hybrid** | B + D for apps, F for extension, A as FIRM ops | Pragmatic | Must write clear agent rules |

3. **Separate test user?** Maybe / maybe not
   - When it **is** worth it: full chrome multi-instance RC; untrusted app
     thrash; long-lived parallel nest without host pain.
   - When it is **not**: ghostty-only layout structure RC; agent speed; one-box
     daily driver with minimal setup.
   - Decision criteria: isolation gap that still bites after A+B+D+F.

4. **Extension shutdown**
   - Nest: ensure Forge (and optional others) enable/disable is nest-bus only.
   - Host: never toggle host extension from a nest-exported shell.
   - After nest stop: host extension must be unchanged.
   - Optional: nest start/stop hooks to load tip only inside nest.

5. **Success metrics**
   - Host Chrome/dock undisturbed while nest runs ghostty layouts.
   - Nest can open a *second* Chrome profile (or chosen browser) without host
     window steal / crash.
   - Agent checklist one page; `forge nested stop` remains FIRM.

6. **Out of scope for D0**
   - Implementing useradd / bubblewrap / profile dirs.
   - Changing cold spine or live matrix case logic (except docs).

## Acceptance

- [ ] Options table filled with **recommendation + rejected paths + why**
- [ ] Explicit **user lock** on default isolation path (and whether separate
      test user is required for v1)
- [ ] Explicit lock on **extension shutdown** behavior (nest-only vs host)
- [ ] Follow-up implement task(s) drafted only after lock (not in D0)
- [ ] No isolation product code required for D0 completion

## Context for the next agent (complete + succinct)

- Nest CLI: `scripts/forge/nested_wayland.py` · `forge nested start|stop|status|env|exec`
- Stop-after-tests is **FIRM** in `agents/testing.md` + `agents/HANDOFF.md`
- Profiles for matrix: only `_forge-test-*` (never personal `dev`/`t1`)
- Proven: dual-mon nest + `_forge-test-ghosttys`; chrome-from-nest painful
- Related suite: `agents/plans/forge-wayland-rc-test-suite.md`
- Prefer discussion notes in this task’s Session note + short HANDOFF pointer

## Session note

**2026-08-09:** Task opened as first slice of practical isolation work. User:
isolation is good; discuss strategies first (maybe separate test user); also
extension shutdown; wrap nest stop into agent rules. Nest left running from
prior campaign was stopped this session.
