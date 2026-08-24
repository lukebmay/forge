# Handoff — forge (lukebmay)

**Updated:** 2026-08-24 (DING admit fix landed; Super+2 Guake trial next)
**Branch:** **`master`** (default). Tip has open-leaf + D026 + silent-LTF +
DING ignore / mon percent scale + WS TRACE / log-contract. Nest **stopped**.
**Sessions:** **Wayland** daily driver. **green** = X11 NVIDIA.

## Next session (FIRM)

1. **Soft host** — after tip load (`./install --dev` + logout **or**
   disable→enable): `layout:dev` → disable → enable → confirm mon0 Ghostty ~½
   ([task](./tasks/forge-enable-ding-percent-thrash.md)).
2. **Super+2 bounce** — [task](./tasks/forge-ws-super2-bounce.md). **Forge is
   not the WS switcher** (bounce with extension disabled). Operator will try
   Guake off / `window-refocus=false`.
3. Soft eyes-on remainder: TILE DnD + FLOAT skip; optional open-min / dual-mon
   dock — [blocker](./blockers/oh-ws-orphan-host-verify.md).
4. Soft: D049 tiny-env Nautilus — [blocker](./blockers/d049-tiny-env-nautilus.md).

## Digest — host findings + fix (2026-08-24)

| Item | Result | Evidence |
| --- | --- | --- |
| **Super+2 with forge disabled** | **BOUNCE still happens** | Operator eyes-on; Super+2 = GNOME `switch-to-workspace-2` |
| Guake | **prime external suspect** | `window-refocus`/`ontop`/`losefocus` true |
| pin-restore / ws-preserve | **not WS driver** | no `activate_workspace`; cannot run when disabled |
| **Re-enable Ghostty ~⅓** | **agent fix landed** | DING `gjs` Desktop Icons were TILE → session-layout → `cleanTree`; now product-ignore + portable prune + mon `renormalizeChildPercents` |
| Open-leaf YouTube | prior PASS (`G2DXn`) | `ws-change preserve hit` |
| D026 sole max | prior PASS (`NTJ5d`) | post-echo heal |

```bash
# enable thrash verify
forge tree   # mon0 Ghostty pct ~0.5, childPctSum ~1
# bounce (after Guake trial)
forge log --grep 'active-workspace-changed|Guake|pin-restore' --level trace --since 15m
```

**Hunts (FIRM):** `forge log --session/--grep/--level` only — **never** `tail`
at TRACE. Enable **truncates** hunt tapes.

**Retest (FIRM):** nest = `./scripts/forge/forge-test nested …`. After JS tip:
`./install --dev` then nest restart **or** logout for host. See [testing.md](./testing.md).

## This tip (DING + hunts)

| Area | Note |
| --- | --- |
| DING | `isDingDesktopIconsSurface` → ignore at track; session skip; cleanTree narrowed; mon remove scales |
| WS TRACE | `active-workspace-changed` + `focus=` / `focusWs=` / `overview=` |
| Log-contract | L0 + nest helper (TRACE fixture) |

## Logging (D050 + D053 + D054 dual-tape + D068 levels)

| Item | Detail |
| --- | --- |
| Journal | **WARN/ERROR/fatal only** (not INFO); message-only (no structured fields) |
| File | `~/.local/state/forge/forge.log` (ANSI); enable **truncates** both tapes |
| JSONL | Sibling `forge.jsonl` **default ON** (`FORGE_LOG_JSONL=0` off) |
| Query | `forge log` → vendored plog-query (**not** `tail`) |
| `--dev` | **TRACE (6)** (D068) |

## Active next (summary)

| Pri | Slice | Status |
| --- | --- | --- |
| soft | Enable DING ⅓ host verify | [task](./tasks/forge-enable-ding-percent-thrash.md) |
| P0 | Super+2 bounce (external) | [task](./tasks/forge-ws-super2-bounce.md) — Guake trial |
| soft | Host verify remainder | [blocker](./blockers/oh-ws-orphan-host-verify.md) |
| soft | D049 tiny-env Nautilus | [blocker](./blockers/d049-tiny-env-nautilus.md) |

**FIRM:** Prefer nest for code→reload. Host `forge layout:dev` ≠ crash harness.
User `forge test` / `forge nested` are not product → `forge-test`.
