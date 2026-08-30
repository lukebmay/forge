# Handoff — forge (lukebmay)

**Updated:** 2026-08-30 — **D095 S8 closeout.** S1–S6 shipped; S7 skipped
(no zoom repro); opportunistic heals deleted; progressive ε + fault-inject
green. **P0 next:** toggleTabStack nest / live-layout leftover. **Do not
resave loadouts.** Nest apps via client isolation (`smoke-nest-apps`).
**Plan:** [forge-live-layout-dnd-proof](./plans/forge-live-layout-dnd-proof.md)
· D095 archive:
[forge-settled-slot-authority](./plans/archived/completed/forge-settled-slot-authority.md)
**Architecture:** [architecture-verdict-2026-08-29.md](./plans/forge-live-layout-dnd-proof/architecture-verdict-2026-08-29.md)
**Branch:** **`master`**. **Push:** only if asked.

## Pain / architecture

Kernel generic; adapters extend (D085/D087/D088/**D092**). Live topology =
POJO Forest. **D093** present → observe → AGREE/RESYNC. **D095** geometry:
presenter = reality feedback; Forge always owns projected/commanded/observed;
evidence-only writes; no geometry-force; ε₀=4; near-band `max(2ε,ε+8)`;
session per-wm-class ε bump on near-miss; nest logs separate. Opportunistic
blanket heals **deleted** (S5).

## D095 locks agents must not rediscover

| Lock | Value |
| --- | --- |
| Reality | Presenter frame when queryable |
| Forge store | Always (not optional cache) |
| Writes | Evidence only; **no** `force: true` geometry |
| ε₀ | **4** px Meta; formula `max(4, ceil(worst_settle_in_band×1.2))` |
| Near-band | **`max(2×ε, ε+8)`** (ε₀ → 12) |
| Progressive bump | **Per wm-class** (session); thin class → window mirror; after 3 near fails |
| `--dev=` | Comma modes: `strict-geometry`, `geom-epsilon-measure`, `fault-inject-geometry`, `geom-trace` |
| Opportunistic heals | **Deleted** (S5); production ≈ strict for those waves |
| Nest | Separate tapes; **private XDG_RUNTIME_DIR** client isolation; `smoke-nest-apps`; close nest windows on exit |
| S7 zoom | **Skipped** until zoom regress — do not invent fixes |
| Leftover force | D026 `_restoreTileToSlot` / `_schedulePostEchoSlotReassert` still `{ force: true }` (not opportunistic heal; thin follow-up) |

## Enable run modes

```bash
./install --dev=strict-geometry
./install --dev=fault-inject-geometry
./install --dev   # TRACE + production=false; modes=[]
# gsettings: org.gnome.shell.extensions.forge dev-modes
# (use --schemadir=<ext>/schemas if host gsettings misses the key)
```

## Next session (start here)

1. **P0:** [`forge-live-layout-dnd-proof.md`](./plans/forge-live-layout-dnd-proof.md)
   **toggleTabStack nest** (+ host logout for soft+edge tip if needed).
2. D095 is **closed** (archived). Reopen S7 only if zoom regresses.
3. Hunt nest logs only. Do not resave loadouts.

### S8 session note (closeout)

| Item | Detail |
| --- | --- |
| Shipped | S1 ε measure → S2 host-bag model → S3 visible-first → S4 `--dev=` → S5 heals deleted → S6 progressive ε + fault-inject |
| S7 | **Skipped** — no zoom primary-path repro after `_reassertZoomedTiles` delete |
| Leftover | D026 restore/post-echo still `{ force: true }` — PRIORITY one-liner; not “done” |
| Archive | `agents/plans/archived/completed/forge-settled-slot-authority.md` |
| Blocker | `agents/blockers/settled-slot-authority-design.md` **closed** |

### Do / do not

| Do | Do not |
| --- | --- |
| Nest first for JS (`./install --dev` + `forge-test nested …`) | Pollute agent shell with `eval $(nested env --export)` then expect host Wayland |
| Use `nested exec/run` so clients get isolated `XDG_RUNTIME_DIR` | Launch nest apps with host runtime (GApplication → host desk) |
| Close nest windows; kill leftover nest `chrome-profile` procs | Leave nest Chrome/ghostty attached after stop |
| Hunt nest `forge log` / jsonl | `cat`/`rg` tape files |
| | Resave personal loadouts |
| | Add geometry `force: true` |
| | Reintroduce opportunistic heals |
| | Invent S7 zoom fixes without a repro |

## Brake

`cd prototypes/container-motion && npm test` → **154**.
`forge-test nested smoke-geom-epsilon` · `smoke-layout-dnd` · `smoke-layout-tabbed-edge`.
