# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (workspace-scope design locked; no implement yet)  
**Branch tip:** `master` (local, **not pushed**)  
**X11:** preferred for agent `./install` + `killall -HUP gnome-shell`  
**Wayland:** ES modules need **logout** to reload  
**Stash:** `stash@{0}` still present — drop only after human OK  
**Remotes:** **no push** unless human asks  

## Next implement

**[forge-layout-workspace-scope](./plans/forge-layout-workspace-scope.md)** — layouts are per-workspace desks.

| Task | Path |
| --- | --- |
| WS0 claim scope | [forge-layout-workspace-scope_ws0-claim-scope.md](./tasks/forge-layout-workspace-scope_ws0-claim-scope.md) |
| WS1 apply + current | [forge-layout-workspace-scope_ws1-apply-current.md](./tasks/forge-layout-workspace-scope_ws1-apply-current.md) |
| WS2 CLI grammar | [forge-layout-workspace-scope_ws2-cli-grammar.md](./tasks/forge-layout-workspace-scope_ws2-cli-grammar.md) |
| WS3 docs + live | [forge-layout-workspace-scope_ws3-docs-live.md](./tasks/forge-layout-workspace-scope_ws3-docs-live.md) |

**Branch when coding:** `plan/forge-layout-workspace-scope` from up-to-date master.

### Locks (summary)

- Claim/apply/save **one workspace only** (no cross-ws steal).
- Bare multi names = **sequential from current**; `W:name` and `name@W` pin; no `--on`.
- Preflight all-or-nothing (missing profile / OOR ws / too few ws → apply nothing).
- Layout names may not contain `:` or `@`.

### Deferred

- [Tab chrome drag (browser-like)](./plans/forge-tab-chrome-drag.md) — P2 after dual-session core + WS scope.
- Peel sliver UX — design discussion only (2026-08-06); not queued as task yet.

## Shipped recently (master local)

| Item | Note |
| --- | --- |
| mon-order X11 | Bare dual L→R — `0e8c2f7` |
| monitor-recovery rename | `ed77e04` + `b9e3040` |
| X11 install/HUP smoke | green; **side effect:** layout pulled Inkscape from other ws → WS plan |

## Operator

1. Optional: Wayland residual after logout.  
2. Next agent: start **WS0** (do not implement peel/tab-drag unless asked).  

```bash
SCHEMA=~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas
gsettings --schemadir "$SCHEMA" set org.gnome.shell.extensions.forge logging-enabled true
gsettings --schemadir "$SCHEMA" set org.gnome.shell.extensions.forge log-level 4
```

## Open blockers

| Severity | Item |
| --- | --- |
| soft | AP5 visual gesture matrix |
| hard | B-manual-black-session-verify |
| hard | resize-autotile-design (P3) |

## Agent rules

- FIRM SSH / secrets / no unsolicited push — see AGENTS.md  
