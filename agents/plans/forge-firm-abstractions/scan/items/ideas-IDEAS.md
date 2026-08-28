# ideas-IDEAS

**Verdict:** close (file stays as parking lot; rows below)
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/ideas/IDEAS.md

## Stated status

Parked list, not a work queue (updated 2026-08-22). Product later / Dropped /
Do not revive.

## Leftovers

- Three **Product later** rows still have live homes (blocker + plan) that
  B01/B03 scan; this file is not a second queue.
- Stale relative links (`./blockers/`, `./plans/`, `./tasks/…`) from
  `agents/ideas/` — hygiene only, not work.
- `agents/ideas/` has only `IDEAS.md` (no extra idea files).

## Why this verdict

Option 2 does not revive parked product meetings from this file. **Do not
revive** is FIRM. **Dropped** rows are shipped or explicitly not-a-task.
**Product later** rows are already owned by live plans/blockers; L0 parks
them post-refactor if B01/B03 agree — IDEAS itself is not PRIORITY.

## Destination

Keep `agents/ideas/IDEAS.md` as the parking lot. Do not copy rows onto
PRIORITY. L0 may trim Dropped / Do not revive later; not this batch.

## Absorb

None from this file. Kernel/import must not contradict **Do not revive**
locks (D044 mon-local, D043 overlay, Mode B forbidden, no product
`forge nested` / `forge test`).

## Product later

| Item | Home (as listed) | Verdict | Note |
| --- | --- | --- | --- |
| Multi-ws pinned slots | blocker `pinned-slots-multi-ws-design` · D0 under `forge-pinned-slots-multi-ws` | post-refactor | PRIORITY parked; operator meeting. B01 owns live files. Not kernel. |
| Ratio / autotile (yuiop) | `forge-resize-and-autotile` · blocker `resize-autotile-design` | post-refactor | Hard human lock before implement. B01 owns live files. |
| CN14 / CN15 | `forge-cli-node` | post-refactor | Optional CLI after CN13. B03 owns live spine. |

## Dropped from this file (2026-08-18)

Do not re-queue without new evidence.

| Item | Why gone (file) | Verdict |
| --- | --- | --- |
| Tab click-drag **PR7** docs | Shipped (D046) | close |
| Tab click-drag PR2–PR6 as “later” | Shipped through PR15 | close |
| TD4 docs one-liner (separate) | Folds into PR7; not its own queue row | close |
| FCC C2+ / strip `_layoutOp` | Shipped (C2–C5 + P3) | close |
| FCC Wave Z “when promoted” | Z0/Z1 shipped (D030); leftovers in FCC REG only | close |
| STACKED product D0 / SL6 polish | Phase 1 + SL5 live done; no open product gap | close |
| Session restore vs ApplyLayout | SM/ApplyEpoch honest; restore is a separate epoch — no open failure | close |
| Freeze Python `layout_plan.py` as oracle | Status quo (D036); not a task | close |
| Soft-only polish (R014 class) | Soft residual is product (D019); task only on a live burn | close |
| L1 scale smoke | R017 + L0 guards shipped; eyes-on is operator choice | close |
| Dual-mon open-heavy nest mon=2 | Coverage preference, not work | close |
| Bag-API review `layout-apply-slot.js` | Hygiene without failure | close |
| Per-window signals → WindowAttach | Lifecycle scope complete; residual only on a leak bug | close |
| MD1 HTML container-motion prototype | Superseded by D032 / TD1 / D044 | close |
| CLI “nothing applied” wording | Tiny copy; no locked false-ok message path | close |

## Do not revive

Do **not** revive. Verdict **abandon** (wontfix / forbidden), not close-as-done.

| Item | Note (file) | Verdict |
| --- | --- | --- |
| `Ctrl+Super+Esc` unfocus (FC2) | Abandoned; keybind unbound | abandon |
| Mode B as cold success | Forbidden | abandon |
| Personal `dev`/`t1` in live matrix | Use `_forge-test-*` only | abandon |
| Cross-mon TABBED/STACKED as product | D044 — mon-local only; no spanning chrome | abandon |
| Overlay clear before all-hard | D043 — spinner is not soft | abandon |
| Top-level `forge nested` / `forge test` as product | Rejected — `./scripts/forge/forge-test` only | abandon |
| Belt after bind / TILE-anywhere hard / mon-root PlaceNext map move | D039–D043 + R036 | abandon |
| Silent `_layoutOp` nested peel | P3 deleted `_flattenLayoutParentToWindows` | abandon |
| Hover-spinner / tab-click residuals as open work | None unless post-R036 overlay/click repro | abandon |
