# Handoff — forge (lukebmay)

**Updated:** 2026-08-26 — **`agents migrate-layout` applied**
**Branch:** **`master`**. Nest **stopped**.
**Sessions:** **Wayland** daily driver. **green** = X11 NVIDIA.

## Layout migrate (done this session)

- `migrate-layout` → `update --all` → `build` (catalog **0.5.1**, tool **0.4.0**)
- Design: `docs/DESIGN.md` → `agents/design.md`; `docs/DECISIONS.md` → `agents/design/CHANGELOG.md`
- Tasks peer queue removed; completed tasks → `plans/archived/completed/migrated-tasks/`
- Languages pruned (kept scripting + bash/zsh + js/ts/python + docker/css/html)
- ~39 completed plans → `plans/archived/completed/`; `IDEAS.md` → `ideas/IDEAS.md`

## Next session (FIRM)

1. **Tip reload (logout)** then:
   - R042: Chrome already open → `forge layout:dev` → mon1 **2 columns**.
   - R043/D071: overlay stays until Done; after clear, click Grok **body**
     (not only tab) → full slot width (no ⅓ + Chrome behind).
   - Hunt `chrome clear|epoch-end tab-slot|forest-failsafe|rect-mismatch`.
2. Chaos nest (opt-in): `FORGE_LAYOUT_CHAOS=1` —
   [forge-layout-chaos-nest-queue.md](./plans/forge-layout-chaos-nest-queue.md).
3. Soft: D069 tip eyes-on —
   [forge-tab-peer-geometry.md](./plans/forge-tab-peer-geometry.md) ·
   [migrated](./plans/archived/completed/migrated-tasks/forge-tab-peer-slot-size.md).
4. **Super+2** — early-vs-late same session
   ([forge-ws-super2-bounce.md](./plans/forge-ws-super2-bounce.md)):
   - After `layout:dev` modal clears, Super+2 **while dock hover still spins /
     icons wiggle** → expect bounce.
   - After spinner gone + no wiggle → expect stick.
   - Do **not** add forge WS activate/pin fallbacks unless a forge-owned residual
     remains after urgency/busy is ruled in or out.
5. Soft: OH remainder — [blocker](./blockers/oh-ws-orphan-host-verify.md).
6. Soft: D049 tiny-env — [blocker](./blockers/d049-tiny-env-nautilus.md).

## Super+2 (current picture)

| Trial | Bounce? |
| --- | --- |
| Guake killed / never started, forge off | **yes** (earlier; settle not controlled) |
| Non-forge `~/Desktop/gnome-launch-test.py` | **no** |
| Forge on + Guake on + wait until dock quiet | **no** |

**Working theory:** race — Super+2 during post-layout **busy cursor / dock
urgency**, not Guake-only and not forge `activate_workspace`. Modal clear ≠ desk
quiet.

## Active next (summary)

| Pri | Slice | Status |
| --- | --- | --- |
| P0 | Tab peer geometry (host tip) | [plan](./plans/forge-tab-peer-geometry.md) — tip eyes-on |
| P0 | Super+2 settle/urgency | [plan](./plans/forge-ws-super2-bounce.md) |
| soft | OH host verify | [blocker](./blockers/oh-ws-orphan-host-verify.md) |
| soft | D049 tiny-env | [blocker](./blockers/d049-tiny-env-nautilus.md) |
| soft | DING ⅓ thrash | [plan](./plans/forge-enable-ding-percent-thrash.md) |
| next | X11 green sleep/lock | [plan](./plans/forge-x11-green-sleep-lock-shield.md) |

**FIRM:** Prefer nest for code→reload. Host `forge layout:dev` ≠ crash harness.
User `forge test` / `forge nested` are not product → `forge-test`.
**Hunts:** `forge log --grep/--session/--level` only — never `tail` at TRACE.
