# Handoff — forge (lukebmay)

**Updated:** 2026-09-02 — **R054/R055** open-leaf writers landed (L0 +
nest green). Awaiting **host** `layout dev` + DnD-into-TAB verify.
G8n stub paused. **Branch:** `master`. **Push / commit:** only if asked.

**Handoff to:** human host verify, then G8n if desk is good. Do **not**
dual-write child-lists. Do **not** reconnect old handlers. Do **not**
grow `live-handle.js`.

## Human host load

Tip is installed `--dev` on this clone; **Wayland needs re-login** for
host Shell to load JS. Nest already proved toggle-tab + tabbed-edge.

```sh
cd ~/dev/me/forge && ./install --dev
# Wayland: log out of GNOME, log back in (HUP does not reload JS)
```

Install from this durable clone only (not a Grok worktree). `--dev` →
TRACE so hunts work.

| Expect to work | Expect incomplete / parked |
| --- | --- |
| Extension enables; windows map; TILE; Mark 2 join/move on one mon | Host DnD maze / cross-mon Ctrl+hjkl reconnect |
| Unary TAB/STACK no strip (R053); move leaves no hollow spacer (R052) | Host visual: layout `active` + DnD raise (**R054/R055** — L0/nest green) |
| `forge tree` Forest-backed | `class Tree` still in tree.js (G8n stub) |
| Adapter ROOT is `createLiveTree` | |

**Do not** save loadouts / session-layout if the desk looks wrong.

Hunt (host session after re-login):

```sh
forge log
forge log --session <id> --grep 'lastTabFocus|revealGroupChild source=dnd-join|settleTabFocus' --level info+ --last 80
```

Never `tail` the tape. Nest hunts stay `forge-test nested log`.

## Logging — previous session retain

On extension **enable** and `forge log --truncate`, non-empty
`forge.log` / `forge.jsonl` are copied to `forge.prev.log` /
`forge.prev.jsonl`, then current tapes are emptied.

## FIRM — nest vs host

| Do | Do not |
| --- | --- |
| `./scripts/forge/forge-test nested smoke-*` **one** CLI | Bare `forge launch` / host GUI from **agent** |
| Hunt nest: `./scripts/forge/forge-test nested log --grep PAT --level info+ --last 40` | `nested logs` (shell stderr) |

Nest is **stopped**. Agent still does **not** host `layout`.

## Landed this breath — R054 / R055

Plan: `agents/plans/forge-tab-open-leaf-visibility.md`.

- `setOpenLeaf` Forest-first (`setLastTabFocus` + duck)
- Join `markOpenLeaf` on wrap/enter-con
- DnD CENTER `revealGroupChild(..., source: "dnd-join")`
- L0 `bug-r054-r055-open-leaf` (failed then green)
- Nest `smoke-toggle-tab` + `smoke-layout-tabbed-edge` PASS
- Proto 155 ok

Host: after logout, `layout dev` open leaves + DnD into TAB
raise/focus.

## Brake

```text
cd prototypes/container-motion && npm test
```

## Do not port

Belt, Mode B, title→`renderTree`, entered-monitor maze, WindowManager
façade. H1/session-restore stay parked.
