# forge-nested-isolation_n4-docs — Nest process docs (D022)

**Status:** done  
**Plan:** [forge-nested-isolation](../../forge-nested-isolation.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-10  

## Goal

Agent-facing docs match D022 so campaigns stop defaulting to dual-mon nest and
logout loops. After N3/N1: document `run`, `FORGE_HOST` / `FORGE_CONFIG_HOME`,
and cleanup that is mechanical not memory-only.

## Acceptance

- [x] `agents/testing.md` § Wayland: nest when / not when; default mon=1;
      multi-mon only for multi-mon cases
- [x] `agents/plans/forge-wayland-rc-test-suite.md`: dual nest only for dual cases
- [x] HANDOFF / PRIORITY locks for D022 implement order
- [x] Re-sync after N3/N1 ship (document `run` / `FORGE_HOST` / data-root env)
- [x] Auto-cleanup pointer once N3 API exists (`forge nested run`; interactive still `stop`)

## Context for the next agent

- Design lock: D0 completed task + D022
- Process rules encoded in testing.md § Wayland + HANDOFF nest sections
- **Prefer** `forge nested run -- <cmd>` for one-shot campaigns (always stops)
- **`exec`/`restart`** only when nest stays up intentionally; still **stop** when done
- mon=1 default; `--monitors=N` only for multi-mon cases
- Nest only for code→reload; no-code smokes on host
- N1 env: `FORGE_HOST=<host>-sub-<name>`, `FORGE_CONFIG_HOME=<session>/forge-config`
- **N2 gap:** extension may still write parent `~/.config/forge`
- Next product slice: [N2](./forge-nested-isolation_n2-extension-root.md)

## Session note

**2026-08-10 N4 docs re-sync (ready for review)**

Patched agent docs to match shipped N3/N1 APIs; no product code changes.

**Files:**
- `agents/testing.md` — entrypoints table (`run`/`exec`/`restart`); N1 env;
  N2 gap; smoke loop prefers `run`; stop FIRM updated
- `agents/plans/forge-wayland-rc-test-suite.md` — Phase 1/4 + cheat sheet +
  pass criteria prefer `run`; dual only for dual cases
- `agents/HANDOFF.md` / `agents/PRIORITY.md` — N3+N1 done; N4/N2 remaining;
  drop “until N3 auto” language; prefer `run`
- `agents/plans/forge-nested-isolation.md` — status table + N4 acceptance

**Grep residual:** no active “until N3” in agent process docs (only completed
task prose / this task history).
