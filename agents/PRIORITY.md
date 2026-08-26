# forge (lukebmay) — active priorities

**Updated:** 2026-08-26 — **`agents migrate-layout` applied** (catalog 0.5.1 / tool 0.4.0)
**Cross-session handoff:** [`HANDOFF.md`](./HANDOFF.md) ← **read first**
**Lens:** healthy codebase first — ownership, **named APIs**, unit tests.
**Branch:** **`master`**. **Push:** only when human asks.

**Layout:** plans-only queue (no `agents/tasks/`). Design =
[`design.md`](./design.md) · history =
[`design/CHANGELOG.md`](./design/CHANGELOG.md). Parked =
[`ideas/`](./ideas/). Completed plans under
`plans/archived/completed/` (+ `migrated-tasks/`).

**Languages kept:** scripting, bash, zsh, javascript, typescript, python,
docker, css, html. **Pruned:** c/cpp/go/rust/zig/lua + DB packs +
kubernetes/qemu/podman/react/web-*.

**Locked (shipped highlights):** D036–D044 · D046 · D049–D054 · D068–D069 ·
SM1–SM7 · FCC C0–C5/R1/P3 · PR1–PR15 tab chrome · OH1–OH3 · user CLI surface.

---

## Active next (ordered)

1. **P0** — Tab peer geometry host tip (**D069**) —
   [forge-tab-peer-geometry.md](./plans/forge-tab-peer-geometry.md)
2. **P0** — Super+2 settle/urgency race —
   [forge-ws-super2-bounce.md](./plans/forge-ws-super2-bounce.md)
3. soft — optional DING ⅓ —
   [forge-enable-ding-percent-thrash.md](./plans/forge-enable-ding-percent-thrash.md);
   open-miss host **PASS**
4. soft human — D049 tiny-env —
   [blocker](./blockers/d049-tiny-env-nautilus.md)
5. soft — OH host verify —
   [blocker](./blockers/oh-ws-orphan-host-verify.md)
6. **P2 mid** (design only) — multi-ws pinned slots —
   [blocker](./blockers/pinned-slots-multi-ws-design.md) ·
   [d0](./plans/forge-pinned-slots-multi-ws/d0-discussion.md)
7. later — CN14/CN15 · [cli-node](./plans/forge-cli-node.md)
8. blocked — yuiop resize/autotile —
   [blocker](./blockers/resize-autotile-design.md) ·
   [plan](./plans/forge-resize-and-autotile.md)
9. next — X11 green sleep/lock —
   [forge-x11-green-sleep-lock-shield.md](./plans/forge-x11-green-sleep-lock-shield.md)
10. in progress — vinyl Inkscape FLOAT tip verify —
    [forge-layout-vinyl-inkscape-float.md](./plans/forge-layout-vinyl-inkscape-float.md)

**Agents:** Do **not** start multi-ws pinned-slots design until the operator
schedules that meeting. Default implement = **Grok 4.5**. Architecture locks =
**4.6 xhigh/high** when PRIORITY says so.

**FIRM:** Prefer `./scripts/forge/forge-test nested run -- …`. Hunts via
`forge log` only. See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).

---

## Still-open plan files (not archived)

| Plan | Why kept |
| --- | --- |
| tab-peer-geometry, ws-super2-bounce, enable-ding, chaos-nest | PRIORITY/HANDOFF active |
| min-size-floor, observability-hardening | soft human / host remainder |
| cli-node, resize-and-autotile | later / blocked |
| vinyl-inkscape-float, x11-green-sleep-lock-shield | in progress / next |
| ai-live-test-matrix, wayland-rc-test-suite | living harness/procedure |
| canonical-contracts, container-motion-design, lifecycle-abstractions | open design/active |
| open-min-* , layout-enable-open-miss | recent residual / PASS record |

Archive: [`plans/archived/completed/`](./plans/archived/completed/) (~39 shipped
plans + migrated-tasks). Parked ideas: [`ideas/IDEAS.md`](./ideas/IDEAS.md).
