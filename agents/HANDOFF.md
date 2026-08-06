# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (workspace CLI exclusive modes; container motion design)  
**Branch tip:** `master` (local, **not pushed**)  
**X11:** `./install` + HUP OK · **Wayland:** logout to reload ES modules  
**No push** unless human asks · stash drop only after human OK  

## P0 next: workspace-scoped layouts

[forge-layout-workspace-scope.md](./plans/forge-layout-workspace-scope.md)

| Task | Path |
| --- | --- |
| WS0 claim scope | […_ws0-claim-scope.md](./tasks/forge-layout-workspace-scope_ws0-claim-scope.md) |
| WS1 apply + current | […_ws1-apply-current.md](./tasks/forge-layout-workspace-scope_ws1-apply-current.md) |
| WS2 CLI | Sequential **XOR** static (`W:name` / `name@W`); **mix = error** |
| WS3 docs + live | […_ws3-docs-live.md](./tasks/forge-layout-workspace-scope_ws3-docs-live.md) |

**Branch when coding:** `plan/forge-layout-workspace-scope`

## Design (no Shell motion yet)

[forge-container-motion-design.md](./plans/forge-container-motion-design.md) — peel Model B lean,
no edge auto-pop, join mess documented, HTML prototype **MD1** before MI* implement.

| Task | Path |
| --- | --- |
| MD1 HTML prototype | [forge-container-motion-design_md1-html-prototype.md](./tasks/forge-container-motion-design_md1-html-prototype.md) |

## Deferred

- [Tab chrome drag](./plans/forge-tab-chrome-drag.md) — browser-like DnD after dual-session + WS scope  
- Selection S3 — containers branch rebase  

## Locks (quick)

**Layout CLI:** all bare (sequential from current) **or** all numbered — never mix.  
**Peel lean:** wrap bag slot → split(G′, peeled); aspect/direction; mon siblings keep width.  
**Move lean:** no auto-pop at sibling edge; explicit move-out/in / group.

## Agent rules

FIRM SSH / secrets / no unsolicited push — AGENTS.md  
