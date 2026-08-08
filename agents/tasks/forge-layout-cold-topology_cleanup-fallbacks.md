# CT-cleanup — Remove dead cold-path fallbacks

**Status:** parked (start after CT2 + CT3 live green)  
**Plan:** [forge-layout-cold-topology.md](../plans/forge-layout-cold-topology.md)  
**Branch:** `plan/forge-layout-cold-topology` (or `task/forge-layout-cold-cleanup`)  
**Depends:** CT1 shipped; CT2 Wayland + CT3 X11 one-shot verified

---

## Goal

After skeleton-first cold layout is the real path, **delete or demote**
fallback / patch-over patterns that only existed because construction order
was wrong. Stop accumulating useless dead code.

---

## Candidate removals / demotions (audit, do not delete blindly)

| Area | Likely dead or demote |
| --- | --- |
| CLI orchestrator | Cold `postOpenRetry` / plan4 thrash re-apply as success path |
| Residual multi-replan | Belt plan3 structure invention when skeleton already correct |
| Mode B | Auto Mode B park on cold open (keep mid-session chaos / `--recover` only) |
| Ensure-after-open only | Paths that skip skeleton and rebuild topology solely from residual windows |
| Sleeps / “try again” | Timing hacks that papered over race construction |
| Docs / help | Text that presents Mode B second pass as normal cold success |

**Keep:** AC1–AC6 settle contract; Mode A collect for sane mid-session; Mode B
for true thrash recover; `--safe`; settled re-run idempotent; fail-open
placeholders for bad clients.

---

## Acceptance

- [ ] Audit list of fallback call sites with “keep / demote / delete”  
- [ ] Dead cold success paths removed or gated behind explicit recover  
- [ ] Unit/regression suite still green; no “plan twice” tests as success  
- [ ] `docs/user/layout.md` cold section matches one-shot path only  
- [ ] Short DECISIONS / archive note what was removed and why  

---

## Session note

Created 2026-08-08 from operator direction: after architecture fix + live
test, run a cleanup sweep. **Do not start until CT2/CT3 pass.**
