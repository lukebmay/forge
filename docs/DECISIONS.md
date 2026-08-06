# Design decisions

**How to use:** scan by Topic / Imp. Update in place when a decision changes;
set Status=`superseded` and add a new row (do not rewrite history silently).

| ID | Date | Topic | Imp | Status | Decision | Why |
| --- | --- | --- | --- | --- | --- | --- |
| D001 | 2026-08-06 | theming | P0 | active | Bundled CSS base + user overrides; never full-file patchCss clobber | Upgrades wiped personal colors; user file is deltas not a fork |
