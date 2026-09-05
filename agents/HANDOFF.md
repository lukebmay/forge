# Handoff — forge (lukebmay)

**Updated:** 2026-09-04 — **D117 V0 docs + V1–V6 code landed**.
D115/D116 stay. Nest **stopped**.
**Branch:** `master`. **Push / commit:** only if asked.

**Hard blocker:** (none)
**Soft blocker:** [settings-overlay-design.md](./blockers/settings-overlay-design.md)
(design meeting for in-shell settings overlay; does not stop code)

**Next agent (ordered):**

1. **Host eyes** (human): logout for D108/D109/D113 + R059/R060.
   D117 V1–V6 is **code-landed** (see plan session note). Do not invert
   D115/D041.
1. Do **not** invert D115. Locks: `design.md` § Geometry loop + D116.

Do **not** dual-write. Do **not** grow `live-handle.js`. Do **not**
invent `Mark2Drop*`. Do **not** reintroduce raw `move_to_monitor`.
Do **not** patch-only `computeSizes`. Do **not** ship whole-forest
`MON_MISMATCH` RESYNC. Agent does **not** host `layout`. Test
profiles `_forge-test-*` only.

**Landed this session:**

| Id | Lock | Result |
| --- | --- | --- |
| D115 H1–H6 | observe→heal | After present `move` settle: agree or ladder. Owner `lib/extension/heal-ladder.js`. D111 jitter = rung 1 (`geomUndersizeRetry`). Then `noteWindowMinFromHealUndersize`, Mark 2 Group enter/wrap same mon (`place:end`), else FLOAT = Agree. Nest inkscape-ws2 **PASS** (FLOAT after jitter×3). |
| D116 C0–C3 | design clarity | One story: D095 near / D115 far / D093 FLOAT after ladder / D105 visible wait / D100 handlers off / D049 overflow ≠ undersize. D026 superseded. No JS. |
| D117 V0 | visible-open docs | `design.md` § Visible-open + CHANGELOG D117. D071 chrome overlay lifetime **superseded**. Overlay = visible-hard; focus = all required mapped; hide-place-show. |
| D117 V1–V6 | visible-open code | Hide-place-show (`layout-deferred-open.js` + `adapter-map-admit.js`). Spawn `orderOpenActionsVisibleFirst`. Per-WINDOW slot wait. Raise `revealGroupChild` on map. Focus before hard-ready. Overlay hunt `visible-hard overlay clear`. Nest `leaf.settle.visible-first-open` **PASS**; nest stopped. |

**Nest soak (this session, nest stopped):**

PASS: `leaf.layout.apply-inkscape-ws2` (honest FLOAT after jitter+learn-min);
`leaf.settle.jitter-same-dest` (H(A,B) TILE, no TAB/FLOAT);
`leaf.settle.visible-first-open` (TAB strip = first kid / active).

Hunt: `forge-test nested log --grep heal-ladder --level info+` —
Inkscape `rung=jitter` ×3 dest 1878×1048 → `learn-min` 700×651 →
`rung=float reason=no-legal-tile-slot`. Ghostty `rung=agree` is debug.

**Still open:**

- Host logout eyes (D108/D109/D113 + R059/R060)
- Dock Nautilus ½-col (`Kf7DR`)
- G8n `bindClassApi` leftover Node copies
- Residual chrome dispose after pile-recovery present

**Confirm:** no `Mark2Drop*`, no Forest←GObject dual-write, no
`live-handle.js` growth, no commit/push unless asked.

## FIRM — nest vs host

| Do | Do not |
| --- | --- |
| `./scripts/forge/forge-test nested --trunk <id>` **one** CLI | Bare `forge launch` / host GUI from **agent** |
| Hunt nest: `forge-test nested log --grep PAT --level info+` | `nested logs` (shell stderr) |
| Always stop nest before handoff | Host `forge layout vinyl` / `dev` from agent |

```text
cd ~/dev/me/forge && ./install --dev
cd prototypes/container-motion && npm test
```

## Do not port

Belt, Mode B, title→`renderTree`, entered-monitor maze,
WindowManager façade. H1/session-restore stay parked.
