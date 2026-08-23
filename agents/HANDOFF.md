# Handoff — forge (lukebmay)

**Updated:** 2026-08-22 (`forge log` queued next; D052 + open-min late-adopt)
**Branch:** **`master`** (default). Tip on disk; **logout once** still needed for
eyes-on (Wayland tip deferred).
**Sessions:** **Wayland** daily driver (Guake agent).

## Next session (FIRM)

1. **Implement** [forge-log-cli-session](./tasks/forge-log-cli-session.md) —
   `forge log` session override + `--persist` + settings `changed::` → plog
   `reconfigure()`. UX locked in the task. Agent **4.5**.
2. Soft human (does not block #1): [host verify](./blockers/oh-ws-orphan-host-verify.md)
   after logout — vinyl WS2, sole-max, TILE DnD, FLOAT skip; optional 3× Nautilus
   open-min eyes-on.
3. After #1: OH downstream — monitor identity + same-mon dock launch
   ([plan](./plans/forge-observability-hardening.md) § Downstream).

**Retest (FIRM):** nest = `./scripts/forge/forge-test nested …`. No user
`forge test` / `forge nested`. Default nest mon=1.

## Logging (D050 + D052 shipped)

| Item | Detail |
| --- | --- |
| Journal | INFO/WARN/ERROR only |
| File | `~/.local/state/forge/forge.log` (level-gated); enable **truncates** |
| `--dev` | **DEBUG (5)**; TRACE = `gsettings … log-level 6` |
| Gap | Live raise may not refresh plog min until `reconfigure` — **`forge log` task** |
| Commits | `531db43` D052 · prior D050 in `b75ba46` lineage |

## Shipped this session

| Item | Commit / note |
| --- | --- |
| Open-min late-adopt | `98538d9` — null map skipped mins; `_adoptOpenIntoTileSlot` tab/float · [completed](./tasks/completed/forge-open-min-late-adopt.md) |
| D052 logging defaults | `531db43` — DEBUG `--dev`; truncate on enable |
| D051 vinyl / max≠no-resize | prior — [task](./tasks/forge-layout-vinyl-inkscape-float.md); keep `HUNT_TILE_SLOT_FLOAT` until host green |

**Host seed:** `~/.config/forge/config/window-mins.json` Nautilus 360×380.
**Do not close** durable-agent ghostty windows.
**Jobs:** `~/.local/share/forge/jobs/<id>/`.

## Active next (summary)

| Pri | Slice | Status |
| --- | --- | --- |
| **P0** | `forge log` session CLI | **next** · [task](./tasks/forge-log-cli-session.md) |
| soft | Host verify OH + tip | [blocker](./blockers/oh-ws-orphan-host-verify.md) |
| P0 | monitor identity + same-mon dock | after `forge log` |
| soft | D049 tiny-env Nautilus | [blocker](./blockers/d049-tiny-env-nautilus.md) |

**FIRM:** Prefer nest for code→reload. Host `forge layout dev` ≠ crash harness.
User `forge test` / `forge nested` are not product → `forge-test`.
