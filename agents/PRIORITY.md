# forge (lukebmay) — active priorities

**Updated:** 2026-08-27 — Firm abstractions (planning next)
**Cross-session handoff:** [`HANDOFF.md`](./HANDOFF.md) ← **read first**
**Lens:** **clean, firm abstractions** — named APIs, one word one meaning,
kernel vs OpSet vs presenter. Not “next proto bug.”
**Branch:** **`master`**. **Push:** only when human asks.

Design = [`design.md`](./design.md) · history =
[`design/CHANGELOG.md`](./design/CHANGELOG.md). Parked ideas =
[`ideas/`](./ideas/). Completed =
[`plans/archived/completed/`](./plans/archived/completed/).

---

## Active next (ordered)

1. **P0** — **Firm abstractions refactor — planning session**
   ([`HANDOFF`](./HANDOFF.md)). Required slices:
   1. Author the refactor plan(s) (TOM / OpSet / presenter / Shell /
      contracts — firm boundaries).
   1. **Scan all still-open plans** (`agents/plans/`, this file’s parked
      list, `blockers/`, `ideas/`): **close**, **abandon**, or **pull
      in** (refactor or post-refactor). Rebuild this queue from that
      scan. No shadow PRIORITY.

Do **not** start implement slices, Mark 2 proto, or Shell Move until
that plan exists and the scan has run.

**Agents:** Default implement (when the plan says so) = **Grok 4.5**.
Do **not** start multi-ws pinned-slots design until the operator
schedules that meeting.

---

## Parked until plan scan

These stay listed so the scan does not miss them. They are **not** next
work.

| Item | Path |
| --- | --- |
| Mark 2 / TOM proto (paused) | [forge-container-motion-design.md](./plans/forge-container-motion-design.md) · [mark2.md](../prototypes/container-motion/src/opsets/mark2.md) |
| Tab peer geometry host tip (D069) | [forge-tab-peer-geometry.md](./plans/forge-tab-peer-geometry.md) |
| Super+2 settle/urgency | [forge-ws-super2-bounce.md](./plans/forge-ws-super2-bounce.md) |
| optional DING ⅓ | [forge-enable-ding-percent-thrash.md](./plans/forge-enable-ding-percent-thrash.md) |
| D049 tiny-env | [blocker](./blockers/d049-tiny-env-nautilus.md) |
| OH host verify | [blocker](./blockers/oh-ws-orphan-host-verify.md) |
| multi-ws pinned slots (design only) | [blocker](./blockers/pinned-slots-multi-ws-design.md) |
| CN14/CN15 | [cli-node](./plans/forge-cli-node.md) |
| yuiop resize/autotile | [blocker](./blockers/resize-autotile-design.md) |
| X11 green sleep/lock | [forge-x11-green-sleep-lock-shield.md](./plans/forge-x11-green-sleep-lock-shield.md) |

**FIRM (until the refactor plan says otherwise):** proto suite is the
Mark 2 brake (`prototypes/container-motion && npm test`). Green + wrong
desk ⇒ paint, not the TOM. Shell hunts: `forge log` only. Nest for
code→reload. See [testing.md](./testing.md).

---

## Still-open plan files (scan these)

| Plan | Why it was kept (pre-scan) |
| --- | --- |
| container-motion-design | Mark 2 proto / locks — **paused** |
| tab-peer-geometry, ws-super2-bounce, enable-ding, chaos-nest | old PRIORITY |
| min-size-floor, observability-hardening | soft human / host remainder |
| cli-node, resize-and-autotile | later / blocked |
| vinyl-inkscape-float, x11-green-sleep-lock-shield | in progress / next |
| ai-live-test-matrix, wayland-rc-test-suite | living harness/procedure |
| canonical-contracts, lifecycle-abstractions | open design |
| open-min-* , layout-enable-open-miss | recent residual / PASS record |

Archive: [`plans/archived/completed/`](./plans/archived/completed/).
Parked ideas: [`ideas/IDEAS.md`](./ideas/IDEAS.md).
