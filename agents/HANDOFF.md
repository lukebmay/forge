# Handoff — forge (lukebmay)

**Updated:** 2026-08-30 — **D095 Accepted** (settled slot / presenter SoT).
S1 `geom-epsilon` + nest `smoke-geom-epsilon` landed; **ε₀ = 4** locked.
**P0 next:** S2 host-bag window model → S3 `Tree.apply` visible-first →
S4 `--dev=` modes. **Do not** delete heal waves until S3. Parallel:
toggleTabStack nest. **Do not resave loadouts.** Nest apps work via client
isolation (`smoke-nest-apps`). **Plan:**
[forge-settled-slot-authority](./plans/forge-settled-slot-authority.md)
· [forge-live-layout-dnd-proof](./plans/forge-live-layout-dnd-proof.md)
**Architecture:** [architecture-verdict-2026-08-29.md](./plans/forge-live-layout-dnd-proof/architecture-verdict-2026-08-29.md)
**Branch:** **`master`**. **Push:** only if asked.

## Pain / architecture

Kernel generic; adapters extend (D085/D087/D088/**D092**). Live topology =
POJO Forest. **D093** present → observe → AGREE/RESYNC. **D095** geometry:
presenter = reality feedback; Forge always owns projected/commanded/observed;
evidence-only writes; no geometry-force; ε₀=4; nest logs separate.

## D095 locks agents must not rediscover

| Lock | Value |
| --- | --- |
| Reality | Presenter frame when queryable |
| Forge store | Always (not optional cache) |
| Writes | Evidence only; **no** `force: true` geometry |
| ε₀ | **4** px Meta; formula `max(4, ceil(worst_settle_in_band×1.2))` |
| Progressive bump | **Per wm-class** (S6 + fault-inject) |
| `--dev=` | Comma modes: `strict-geometry`, `geom-epsilon-measure`, `fault-inject-geometry`, `geom-trace` |
| Nest | Separate tapes; **private XDG_RUNTIME_DIR** client isolation; `smoke-nest-apps`; close nest windows on exit |

## Next session (start here)

1. Read plan [`forge-settled-slot-authority.md`](./plans/forge-settled-slot-authority.md) § Agent read-this-first + S2–S4.
2. **S2** — host bag `desiredRect` / `commanded` / `observed` / `slotGen`; pre-move skip.
3. **S3** — visible-first on `Tree.apply` **before** heal demotion.
4. **S4** — parse `./install --dev=a,b`; wire `strict-geometry`.
5. Nest smoke per slice; hunt nest logs only:
   `eval $(forge-test nested env --export)` then `forge log --grep geom-epsilon`
   or `nest_log_query` under nest `FORGE_CONFIG_HOME`.

### Do / do not

| Do | Do not |
| --- | --- |
| Nest first for JS (`./install --dev` + `forge-test nested …`) | Pollute agent shell with `eval $(nested env --export)` then expect host Wayland |
| Use `nested exec/run` so clients get isolated `XDG_RUNTIME_DIR` | Launch nest apps with host runtime (GApplication → host desk) |
| Close nest windows; kill leftover nest `chrome-profile` procs | Leave nest Chrome/ghostty attached after stop |
| Hunt nest `forge log` / jsonl | `cat`/`rg` tape files |
| | Delete heal waves before S3 |
| | Resave personal loadouts |

## Brake

`cd prototypes/container-motion && npm test` → **154**.
`forge-test nested smoke-geom-epsilon` · `smoke-layout-dnd` · `smoke-layout-tabbed-edge`.
