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
| D011 | 2026-08-08 | layout | P0 | superseded | Belt re-focus + preserve lastTabFocus on ensure | Superseded by D014 (belt no structure; keep preserve as generic) |
| D012 | 2026-08-08 | layout | P0 | superseded | Final focus after settle + reassert | Superseded by D015 (one post-settle focus; reassert opt-in) |
| D013 | 2026-08-08 | open-app | P0 | active | Empty LFT(m) → last tile on mon; single dock pending wins appId drift | mon-root 3rd HSPLIT covered tabs; dock miss fell to focus mon |
| D014 | 2026-08-08 | layout | P0 | active | Post-open belt = pin-role wrong-mon moves only; no ensure_layout/order | Belt structure rewrite after bind stomped topology/open leaf; residual owns structure |
| D015 | 2026-08-08 | layout | P0 | superseded | One post-settle focus; no reassert | Superseded by D017 — quiet alone does not own late chrome steal |
| D016 | 2026-08-08 | layout | P0 | active | `_layoutOp` still preserves valid lastTabFocus on TABBED/STACKED re-affirm | Mid-session ensure_layout still anchors first id; generic safety not desk-specific |
| D017 | 2026-08-08 | layout | P0 | superseded | Final focus + verify-once only | Superseded by D018 — verify alone lost to multi-second chrome activate |
| D018 | 2026-08-08 | layout | P0 | active | Pin tab open leaf on focus; restore on meta-focus steal; tab-active=lastTabFocus; CLI stable poll | Cold: Chrome over Grok; tab chrome follows keyboard not open leaf |
| D019 | 2026-08-08 | layout | P0 | active | Settle contract: hard Meta ready + soft expectations (file heuristics) + post-settled verify once; focus steal = thrash correct | Fixed ms reassert brittle; Meta has no settle ACK; plan forge-layout-settle-contract |
| D020 | 2026-08-09 | windows | mid | active | `mode: "ignore"` in windows.json: no tree node / decorations / session claim; user config only (no bundled brands) | Float still tracks + processFloats; some apps need true hands-off |
| D021 | 2026-08-09 | CLI | P0 | active | Mutating forge commands run as durable one-shot jobs by default (attach); `--detach` no-wait only; no flag required for TTY survival; single-flight mutators; not a daemon | Closing agent TTY mid-layout aborted apply; session-bound workers inherit DBus/DISPLAY |
| D022 | 2026-08-10 | nest-test | P0 | active | Nest = value-first retest harness (avoid Wayland logout loops); separate logical host data (`FORGE_HOST` + nest config root); no UNIX test user v1; auto stop/cleanup; nest only when extension reload needed; host for no-code smokes; nest default 1 mon — multi-mon only when testing multi-mon behavior | Shared HOME heuristics/config taint parent; dual-mon dummy nest unblocks structure loop only when needed; test-user setup cost > isolation gain until data-root fails |
| D023 | 2026-08-12 | tree | P0 | active | Child list via Node (`appendChild`/`insertBefore`/`removeChild`/`replaceChildren`); no `childNodes`/`parentNode` assigns outside Node | R018 install HSPLIT swap was a hand-rolled splice; catalog Canonical APIs |
