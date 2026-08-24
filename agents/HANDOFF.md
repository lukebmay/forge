# Handoff — forge (lukebmay)

**Updated:** 2026-08-24 (handoff commit: open-leaf + D026 + silent-LTF — logout retest)
**Branch:** **`master`** (default). Tip **committed + pushed** (open-leaf preserve,
D026 post-echo, silent-LTF / `setOpenLeaf`, hunt TRACE). `./install --dev`
already staged earlier — **logout still needed** to load this tip. Nest
**stopped**. **Sessions:** **Wayland** daily driver. **green** = X11 NVIDIA.

## Next session (FIRM)

1. **Open-leaf / Voice (fix on tip — logout):** tip reload → hunt YouTube open
   leaf across vinyl WS bounce. Task
   [forge-ws-open-leaf-silent-lasttabfocus](./tasks/forge-ws-open-leaf-silent-lasttabfocus.md).
   Expect `lastTabFocus tab` TRACE on real changes; preserve should not miss
   `already-open` Voice after save sync. Prior writeup:
   [completed](./tasks/completed/forge-ws-switch-open-leaf-steal.md).
2. Soft eyes-on remainder: TILE DnD + FLOAT skip; optional 3× Nautilus
   open-min; optional dual-mon left-dock; `forge log` apiVersion **11** +
   jsonl — [blocker](./blockers/oh-ws-orphan-host-verify.md). D026 sole-max
   already host PASS on `NTJ5d` (post-echo heal).
3. Soft: D049 tiny-env Nautilus — [blocker](./blockers/d049-tiny-env-nautilus.md).
4. Soft: green overnight HDMI sleep — [task](./tasks/forge-x11-green-sleep-lock-shield.md).

## Plog digest — session `NTJ5d` (2026-08-23 ~20:33–20:34)

| Item | Result | Evidence |
| --- | --- | --- |
| **D026 sole Inkscape max** | **PASS** (visible ~390ms shrink flash, then heal) | `20:34:08` `d026-restore … slot=2518x1408` → `postEchoSlot` 390ms → `20:34:09` `post-echo-slot reassert` — matches indigo full-border + shrunk frame then refill |
| **WS1 minor thrash** | Super bounce + Guake | `20:33:20` `active-workspace-changed ?→1` then `1→0`; `afterFocus pin-restore stolen open-leaf`; `20:33:26` Guake attach + `moved pointer to [Guake!]` |
| **Open-leaf Voice** | **FAIL on `NTJ5d`**; fix committed | Return `20:33:51` preserve miss `already-open` Voice. Cause: save `syncLastTabFocusFromFocus` stomped live LTF; fix on tip awaiting logout |
| Vinyl chrome | clear same second as soft | `20:33:34` `chrome clear reason=all-hard` + `soft skip reason=no-focus` |
| WARN/ERROR | none | — |

```bash
forge log --session NTJ5d --grep 'd026-restore|post-echo-slot|ws-change preserve|lastTabFocus tab|active-workspace-changed|pin-restore|Guake|chrome clear' --level trace --since 30m
```

**Hunts (FIRM):** `forge log --session/--grep/--level` only — **never** `tail`
at TRACE. See [project.md](./project.md) § Logging. Catalog: `agents/installed/plog.md`.

**Retest (FIRM):** nest = `./scripts/forge/forge-test nested …`. No user
`forge test` / `forge nested`. Default nest mon=1. Nest/hunt installs:
`./install --dev` (TRACE). After code install on Wayland: logout (this tip)
or `forge-test nested restart`. See [testing.md](./testing.md).

## This tip (committed)

| Area | Files / note |
| --- | --- |
| Open-leaf WS steal | preserve + reassert; **silent LTF:** `session-layout.js` no-stomp sync; `focus.js` `setOpenLeaf`; reveal/pin via canonical writer |
| D026 post-echo | `window.js` `_schedulePostEchoSlotReassert` + TRACE `d026-restore` / `post-echo-slot` |
| Hunt TRACE | `lastTabFocus tab\|stack`; `ws-change preserve`; `soft quiet`/`skip`; `active-workspace-changed` |
| Docs | task + HANDOFF/PRIORITY; completed open-leaf + D026 notes |

L0: action-pipeline + focus + session-layout **105** green.

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

## Shipped this session (prior commits on tip)

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

## Shellrc (adjacent, not this queue)

Pending only (no work started):
[hunt practices catalog](../../shellrc/agents/tasks/agents-catalog-plog-hunt-practices.md) ·
[log-contract tests](../../shellrc/agents/tasks/plog-log-contract-tests.md)
under `~/dev/me/shellrc/agents/tasks/`.

## Active next (summary)

| Pri | Slice | Status |
| --- | --- | --- |
| soft | Logout → tip load silent-LTF fix + OH eyes-on (+ Voice/YouTube; D026 PASS) | [task](./tasks/forge-ws-open-leaf-silent-lasttabfocus.md) · [blocker](./blockers/oh-ws-orphan-host-verify.md) |
| soft | D049 tiny-env Nautilus | [blocker](./blockers/d049-tiny-env-nautilus.md) |

**FIRM:** Prefer nest for code→reload. Host `forge layout:dev` ≠ crash harness.
User `forge test` / `forge nested` are not product → `forge-test`.
