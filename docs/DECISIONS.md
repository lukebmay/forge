# Design decisions

**How to use:** scan by Topic / Imp. Update in place when a decision changes;
set Status=`superseded` and add a new row (do not rewrite history silently).

| ID | Date | Topic | Imp | Status | Decision | Why |
| --- | --- | --- | --- | --- | --- | --- |
| D001 | 2026-08-06 | theming | P0 | active | Bundled CSS base + user overrides; never full-file patchCss clobber | Upgrades wiped personal colors; user file is deltas not a fork |
| D002 | 2026-08-07 | meta-probe | P1 | active | Intervalic agreement only; soft disagreements recorded, never reset settle timer | Title/focus noise must not block layout settle; keep soft timelines for later chrome/focus work |
| D003 | 2026-08-07 | meta-probe | P1 | superseded | Settle = hard-stable duration; cal@50ms bootstrap 10s; 1 cal+N full/op; write once at end | Superseded by D004 (per-app write + thrash campaign) |
| D004 | 2026-08-07 | meta-probe | P0 | active | Core apps 5×; sticky trials; per-app write; sleep inhibit; thrash delay sweeps | Sleep/crash lost matrices; open_warm piled windows; need thrash-free inter-op D for engine rewrite |
| D005 | 2026-08-07 | meta-probe | P0 | active | Meta baseline: multi-op thrash-free at D=0 (Forge off) on black | Core apps green; product thrash is Forge-induced, not Meta floor |
| D006 | 2026-08-07 | layout | P0 | active | Thrash/fail-open → float client + placeholder TILE leaf; never forest reassert | One bad app must not unsettle forest; close PH = drop slot + one reflow |
| D007 | 2026-08-08 | open-app | P1 | active | Dock sticky mon = pointer geometry; hook activate/open_new_window/activate_full; never rehome dock by focus | get_current_monitor/focus stole left-dock opens to right mon |
| D008 | 2026-08-08 | layout | P0 | active | Cold layout: skeleton (slot-tagged PHs) before bind; no Mode B mid-batch | Residual Mode B second pass is construction-order patch, not product fix |
| D009 | 2026-08-08 | layout | P0 | active | CT1: ensure_skeleton+bind ops; thrash park suppressed on cold/just_opened | One CLI invocation; postOpenRetry opt-in only |
| D010 | 2026-08-08 | layout | P1 | active | Apply chrome clears after residual place (not at LayoutBatch end) | Cold bind/structure is long visual phase; early clear dropped dim mid-thrash |
| D011 | 2026-08-08 | layout | P0 | active | Belt post-open re-focuses; layout preserves valid lastTabFocus | ensure_layout anchors first id (chrome) and stomped active Grok |
