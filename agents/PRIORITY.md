# forge (lukebmay) — active priorities

**Updated:** 2026-09-04 — D117 **V0 + V1–V6 landed**.
D115 H1–H6 + D116 stay.
**Do not resave loadouts.**
**Branch:** `master`. **Push / commit:** only when asked.

---

## Active next (ordered)

1. **Host eyes** (human, not agent next-code) after logout —
   D108 CENTER last + strip gap; [REGRESSIONS R060](./REGRESSIONS.md)
   (and R059). Empty WS2 chrome (SG8). Wrap-row Meta inset (SG7).
   Cheatsheet fit/scroll/collapse + Float toggle.
1. **Nest leftover** —
   [forge-design-e2e.md](./plans/forge-design-e2e.md).
   Core proof-loop **PASS** 7/7. `stacked-same-slot` **PASS**.
   `empty-head-dock` **PASS**. No unimplemented `--rc` body.
1. **G8n leftover** (not product-next) — ROOT `move*` attached;
   `bindClassApi` leftover Node copies.
   [forge-retire-gobject-topology.md](./plans/forge-retire-gobject-topology.md).
1. **Proof regression loop** — optional P2
   [forge-proof-regression-loop.md](./plans/forge-proof-regression-loop.md).
1. **Focus borders polish** — soft if desk looks right.
1. **Not next:** invent-lock / H1 maze; G8o; G9 STACKED; host DnD
   maze; `Mark2Drop*`; patch-only `computeSizes`; settings overlay
   implement; rewrite nest so current host 1/3 goes green; re-run
   green tests with no relevant change.

---

## Keep-parallel (not a work row)

| Item | Path |
| --- | --- |
| **Retire GObject (D100)** | [forge-retire-gobject-topology.md](./plans/forge-retire-gobject-topology.md) |
| Observe+heal (D115) | [forge-observe-agree-heal.md](./plans/forge-observe-agree-heal.md) (**H1–H6 shipped**) |
| Design clarity pass | [forge-design-clarity-pass.md](./plans/forge-design-clarity-pass.md) (**C0–C3 done**) |
| Layout visible-open (D117) | [forge-layout-visible-open.md](./plans/forge-layout-visible-open.md) (**V0–V6 landed**) |
| Core slot geometry | [forge-core-slot-geometry.md](./plans/forge-core-slot-geometry.md) (SG8+SG7 **unit** landed; host eyes) |
| Design-sourced nest E2E | [forge-design-e2e.md](./plans/forge-design-e2e.md) (T0–T6 done; leftover flake) |
| Proof regression loop | [forge-proof-regression-loop.md](./plans/forge-proof-regression-loop.md) |
| AI live matrix / Wayland RC / chaos nest | living; ungated for nest `--trunk` |

---

## Parked (gated)

| Item | Path | Gate |
| --- | --- | --- |
| Settings overlay (in-shell prefs) | [blocker](./blockers/settings-overlay-design.md) · [cheatsheet plan](./plans/forge-cheatsheet-overlay.md) CS3 | Design meeting (soft) |
| yuiop resize / autotile | [forge-resize-and-autotile.md](./plans/forge-resize-and-autotile.md) | D100 core + design blocker |
| multi-ws pinned slots | [d0](./plans/forge-pinned-slots-multi-ws/d0-discussion.md) | D100 core + design meeting |
| CLI Node leftovers | [forge-cli-node.md](./plans/forge-cli-node.md) | after D100c |
| H1 / session-restore maze | on disk in adapter | parked as maze; **lock shield + safe rehome + present-hold stay** |

---

**FIRM:** proto brake. Hunt: `forge log` / nest `forge-test nested log`
only. Nest isolation: [testing.md](./testing.md). Do **not** port belt /
Mode B / title→`renderTree` / entered-monitor maze. Agent does **not**
host `layout`. Sleep/wake host verify **PASS** 2026-09-03.

**Parallelism (no shared-file races):**

| Parallel | Serial |
| --- | --- |
| TGI (mark2 insert) ∥ CS0–CS2 (cheatsheet.js) | TGI → CME (`mark2.js`) |
| VIN after stability; ∥ CS if no nest clash | SG8+SG7 unit landed (`present-chrome.js` / `decoration.js`) |
| G8n only when not touching those files | CME vs design-e2e leftover (`stories.md` / nest bodies) |
| One nest at a time | Host logout eyes anytime (human) |
