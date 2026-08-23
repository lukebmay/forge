# Handoff — forge (lukebmay)

**Updated:** 2026-08-23 (OH Downstream + plog TRACE hunts shipped; soft human next)
**Branch:** **`master`** (default). Tip needs **Wayland logout once** after push
to load this build into host Shell (nest already proved ping). Nest **stopped**.
**Sessions:** **Wayland** daily driver. **green** = X11 NVIDIA.

## Next session (FIRM)

1. Soft human: [host verify](./blockers/oh-ws-orphan-host-verify.md)
   — vinyl WS2, sole-max, TILE DnD, FLOAT skip; optional 3× Nautilus open-min;
   optional dual-mon left-dock eyes-on (Downstream units+nest already green);
   confirm `forge log` / apiVersion **11** + jsonl; pretty when payload present.
2. Soft: D049 tiny-env Nautilus — [blocker](./blockers/d049-tiny-env-nautilus.md).
3. Soft: green overnight HDMI sleep eyes-on after lock-shield fix —
   [task](./tasks/forge-x11-green-sleep-lock-shield.md).

**Hunts (FIRM):** `forge log --session/--grep/--level` only — **never** `tail`
at TRACE. See [project.md](./project.md) § Logging. Catalog: `agents/installed/plog.md`.

**Retest (FIRM):** nest = `./scripts/forge/forge-test nested …`. No user
`forge test` / `forge nested`. Default nest mon=1. Nest/hunt installs:
`./install --dev` (TRACE). After code install on Wayland: `forge-test nested
restart` (or stop/run) so extension reloads. See [testing.md](./testing.md).

## Logging (D050 + D053 + D054 dual-tape + D068 levels)

| Item | Detail |
| --- | --- |
| Journal | **WARN/ERROR/fatal only** (not INFO); message-only (no structured fields) |
| File | `~/.local/state/forge/forge.log` (ANSI); enable **truncates** both tapes |
| JSONL | Sibling `forge.jsonl` **default ON** (`FORGE_LOG_JSONL=0` off) |
| Query | `forge log query` / `--session`/`--last`/`--grep`/`--level`/`--since` → vendored plog-query (**not** `tail`) |
| Color | **Q0 done** — `runPlogQuery` inherits TTY stdout/stderr for `--color=auto` |
| Pretty | **Q5 done** — vendored plog-query **1.1.0** (`--pretty`/`--hilight`/bat) |
| Fields | INFO+ `{ fields }` → JSONL payload; warn+ flattened (D054). **Q6:** hunts structured |
| Regular | **INFO (4)**; does **not** force logs OFF |
| `--prod` | **WARN (3)**; dual-sink stays; raise via `forge log` for hunts |
| `--dev` | **TRACE (6)** (D068) |
| Live level | `forge log` session / `--persist` / `--truncate`; `changed::` → `reconfigure()` |
| DBus | `Log` · apiVersion **11** |
| Vendored | `third_party/pansi` PLOG **1.3.0** · `third_party/plog-query` **1.1.0** (re-snapped shellrc `042419f`) |

## Shipped this session

| Item | Commit / note |
| --- | --- |
| **plog TRACE hunts** | float-reason keep TRACE gated; title churn skip render; place-hint FIFO accept+test + `winClass=` logs; P2 bad-slot = settle jitter · [completed](./tasks/completed/forge-plog-trace-hunts.md) |
| **OH Downstream** | dock chain last-focus→LFT(m)→end-of-tree→open-min; `listIndexRemaps`/wrong-mon TRACE · [completed](./plans/forge-observability-hardening/completed/forge-observability-hardening_oh-downstream-mon-dock.md) |
| Nest `--dev` docs | `agents/testing.md` + `project.md` FIRM: nest/hunt = `./install --dev` |
| **D068** | `545a926` — `--dev`→TRACE · `--prod`→WARN · keep dual-sink (not journal-only) |
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
| soft | Host verify OH + tip (+ optional dual-mon dock eyes-on) | [blocker](./blockers/oh-ws-orphan-host-verify.md) |
| soft | D049 tiny-env Nautilus | [blocker](./blockers/d049-tiny-env-nautilus.md) |

**FIRM:** Prefer nest for code→reload. Host `forge layout dev` ≠ crash harness.
User `forge test` / `forge nested` are not product → `forge-test`.
