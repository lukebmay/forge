# Layout / open-app regressions

**Purpose:** stop re-fixing the same dual-mon bugs without a durable record.
When a live failure repeats a known class, **add a unit test that fails without
the fix**, then a row here. Plan session notes are not enough.

| ID | Date | Symptom | Root cause | Fix | Guard test(s) |
| --- | --- | --- | --- | --- | --- |
| R001 | 2026-08-06 | mon0 tab shows Chrome not Grok | belt `ensure_layout` anchors first id; stomps lastTabFocus | D011 preserve lastTabFocus | `session-api-layout-cycle` layout TABBED re-affirm |
| R002 | 2026-08-08 | same after cold open | mid-flight focus before chrome map; late activate steals | D012 final focus after settle | `belt_actions` structure-only; final focus in CLI |
| R003 | 2026-08-08 | left dock open → right mon | dock mon from focus/`get_current_monitor`; weak hook | D007 pointer mon + activate_full | `open-app-policy` focus mon0 + dock mon1; pointer geometry |
| R004 | 2026-08-08 | dock miss → focus mon; mon-root covers left tab | appId mismatch dropped pending; empty LFT(m) → mon-root 3rd HSPLIT child | single-pending match; `_lastTileOnMonitor` end-of-tree | `lft-mru` single unexpired mismatch; `open-app-policy` dock empty mon LFT |

## Rules

1. **New live regression** → file row + failing unit test before/with fix.  
2. **Do not** only “note in HANDOFF” without a test.  
3. Prefer pure helpers (`lft-mru.js`, `layout_apply.py`) so tests stay fast.  
4. Wayland install needs **logout** for extension half; CLI path is live immediately.

## Related

- OP1 design: [docs/DESIGN.md](../docs/DESIGN.md) open-app placement  
- Decisions: D007, D011, D012 in [docs/DECISIONS.md](../docs/DECISIONS.md)  
- Task history: [completed/forge-dock-sticky-mon.md](./tasks/completed/forge-dock-sticky-mon.md)  
