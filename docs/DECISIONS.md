# Design decisions

**How to use:** scan by Topic / Imp. Update in place when a decision changes;
set Status=`superseded` and add a new row (do not rewrite history silently).

| ID | Date | Topic | Imp | Status | Decision | Why |
| --- | --- | --- | --- | --- | --- | --- |
| D001 | 2026-08-06 | theming | P0 | active | Bundled CSS base + user overrides; never full-file patchCss clobber | Upgrades wiped personal colors; user file is deltas not a fork |
| D002 | 2026-08-07 | meta-probe | P1 | active | Intervalic agreement only; soft disagreements recorded, never reset settle timer | Title/focus noise must not block layout settle; keep soft timelines for later chrome/focus work |
| D003 | 2026-08-07 | meta-probe | P1 | active | Settle = hard-stable duration; cal@50ms bootstrap 10s; 1 cal+N full/op; write once at end | Drop verify/count floor; slow hosts get longer duration; light checks timeline |
