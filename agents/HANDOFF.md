# Handoff — forge (lukebmay)

**Updated:** 2026-08-23 (D054 shipped; **D067 Q0–Q6** done — pretty query + hunt fields)
**Branch:** **`master`** (default). Tip on disk; **logout / nest restart** needed
to load D054 write path + Q6 hunt `{ fields }` emits. Query CLI works from tree
immediately (plog-query **1.1.0**).
**Sessions:** **Wayland** daily driver (Guake agent). **green** = X11 NVIDIA.

## Next session (FIRM)

1. **P0** OH downstream — monitor identity + same-mon dock launch
   ([plan](./plans/forge-observability-hardening.md) § Downstream). Use
   `forge log trace` + `forge log --grep …` for hunts. Agent **4.5**.
2. Soft human (does not block #1): [host verify](./blockers/oh-ws-orphan-host-verify.md)
   after logout — vinyl WS2, sole-max, TILE DnD, FLOAT skip; optional 3× Nautilus
   open-min eyes-on; confirm `forge log` / apiVersion **11** + jsonl on tip;
   interactive `forge log --last 1` should color (Q0); pretty body when payload
   present (Q5/Q6 after tip reload).
3. Soft: D049 tiny-env Nautilus — [blocker](./blockers/d049-tiny-env-nautilus.md).
4. Soft: green overnight HDMI sleep eyes-on after lock-shield fix —
   [task](./tasks/forge-x11-green-sleep-lock-shield.md).

**Retest (FIRM):** nest = `./scripts/forge/forge-test nested …`. No user
`forge test` / `forge nested`. Default nest mon=1. After code install on
Wayland: `forge-test nested restart` (or stop/run) so extension reloads.

## Logging (D050 + D052 + D053 + D054 dual-tape)

| Item | Detail |
| --- | --- |
| Journal | **WARN/ERROR/fatal only** (not INFO); message-only (no structured fields) |
| File | `~/.local/state/forge/forge.log` (ANSI); enable **truncates** both tapes |
| JSONL | Sibling `forge.jsonl` **default ON** (`FORGE_LOG_JSONL=0` off) |
| Query | `forge log query` / `--last`/`--grep`/`--level`/`--since` → vendored plog-query |
| Color | **Q0 done** — `runPlogQuery` inherits TTY stdout/stderr for `--color=auto` |
| Pretty | **Q5 done** — vendored plog-query **1.1.0** (`--pretty`/`--hilight`/bat) |
| Fields | INFO+ `{ fields }` → JSONL payload; warn+ flattened (D054). **Q6:** hunts structured |
| Regular/`--prod` | **INFO (4)**; prod does **not** force logs OFF |
| `--dev` | **DEBUG (5)**; TRACE = `forge log trace` or gsettings 6 |
| Live level | `forge log` session / `--persist` / `--truncate`; `changed::` → `reconfigure()` |
| DBus | `Log` · apiVersion **11** |
| Vendored | `third_party/pansi` PLOG **1.3.0** · `third_party/plog-query` **1.1.0** (re-snapped shellrc `042419f`) |

## Shipped this session

| Item | Commit / note |
| --- | --- |
| **D067 Q0–Q6** | `0807963` — TTY inherit + plog-query **1.1.0** + hunt `{ fields }` · [completed](./tasks/completed/forge-log-query-pretty-wire.md) |
| **D054 dual-tape + query** | `4306974` — PLOG 1.3.0 + plog-query + `forge log` forward · [completed](./tasks/completed/forge-log-dual-tape-query.md) |
| Open-min late-adopt | `98538d9` — null map skipped mins; `_adoptOpenIntoTileSlot` tab/float · [completed](./tasks/completed/forge-open-min-late-adopt.md) |
| D052 logging defaults | `531db43` — DEBUG `--dev`; truncate on enable |
| D051 vinyl / max≠no-resize | prior — [task](./tasks/forge-layout-vinyl-inkscape-float.md); keep `HUNT_TILE_SLOT_FLOAT` until host green |

**Host seed:** `~/.config/forge/config/window-mins.json` Nautilus 360×380.
**Do not close** durable-agent ghostty windows.
**Jobs:** `~/.local/share/forge/jobs/<id>/`.

## Active next (summary)

| Pri | Slice | Status |
| --- | --- | --- |
| **P0** | monitor identity + same-mon dock | **next** · [plan](./plans/forge-observability-hardening.md) § Downstream |
| soft | Host verify OH + tip (+ `forge log` pretty/fields eyes-on) | [blocker](./blockers/oh-ws-orphan-host-verify.md) |
| soft | D049 tiny-env Nautilus | [blocker](./blockers/d049-tiny-env-nautilus.md) |

**FIRM:** Prefer nest for code→reload. Host `forge layout dev` ≠ crash harness.
User `forge test` / `forge nested` are not product → `forge-test`.
