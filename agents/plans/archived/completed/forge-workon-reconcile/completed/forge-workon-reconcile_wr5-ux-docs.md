# WR5 — Workon UX summary + docs

**Plan:** [forge-workon-reconcile.md](../../forge-workon-reconcile.md)  
**Status:** Done  
**Priority:** P1 product  
**Depends:** WR1–WR4

## Goal

Morning-proof CLI polish: human summaries, list/show host clarity, user docs.

## Acceptance

1. `forge workon list` human lines include **host** (when relevant) and enough
   to see which file won (path or short path + source) — not only JSON. **Done**
2. `forge workon show` / plan / dry-run headers consistently show
   `host=… profile=… source=…` (path optional if long). **Done**
3. `docs/user/` short page (or section) for `forge workon` reconcile UX:
   idempotent default, dry-run, force-launch escape, FORGE_WORKON_DIR. **Done**
4. `docs/DESIGN.md` already has FC6 notes — only touch if stale vs shipped. **Done** (WR5 UX line)
5. `scripts/forge/README.md` already partially updated — keep consistent. **Done**
6. No behavior regression for dry-run/apply; unit tests still green. **Done**

## Non-goals

- Live black trials (WR6)
- capture command (WR7)
- shellrc env auto-install (WR9)

## Session note

**WR5 Done (2026-07-26):**

- `workon_lib.format_short_path` / `format_profile_list_line` — list stderr lines:
  `name  [source] host  short-path  desc`
- Header shared for show / plan / dry-run / apply (steps + reconcile); short path
- JSON list stdout contract unchanged (full paths)
- `docs/user/workon.md` + docs index + troubleshooting cross-link
- DESIGN WR5 UX note; `scripts/forge/README.md` user-guide pointer
- Unit tests for format helpers; all workon CLI pure tests green

**Next:** **WR6** live black trials (empty / perfect / messy).
