# forge-tab-work-planning — Tab product batch (plan before implement)

**Status:** ready (planning first)  
**Plan:** (none yet) — use high-reasoning model (Grok 4.6 xhigh) **before** code  
**Branch:** master (default)  
**Blocker:** (none)  
**Priority:** **SM7 overlay-all-hard landed** (D043 gate). Group chrome A
is tab/FCC, not SM1–SM4. R036 cold is human residual. Ready for
**4.6 xhigh** planning when SM6 does not contend.  
**Updated:** 2026-08-16

## Goal

One planning session that locks tab-adjacent residuals and product edges, then
implement slices. **Do not start tab implementation until this D0 lands.**

## Agenda (planning session)

### 1. Apply chrome / “hover spinners” on tabs (UX residual)

| Field | Detail |
| --- | --- |
| Symptom | Layout-apply spinner(s) stay on a long time while hovering/using tabs after the desk looks settled enough to drop the modal |
| Intent | Spinner/scrim must stop **as soon as** settle is far enough to remove the modal (same gate) |
| Code already | **SM7:** `_clearChrome` reason `all-hard` after slot machines terminal; restack on clear (R032); soft may still run after clear; Done idempotent |
| Evidence | 2026-08-16: L0 green (clear at all-hard; not mid-place). Host/nest tip re-verify after install+logout |
| Open questions | If still long/broken on tip after all-hard clear: second spinner? strip z-order beyond restack? pin thrash? |
| Related | R027 chrome-until-ready; **D043** (D010 superseded — overlay dies at all-hard) |

**Acceptance direction (plan must lock):** one clear rule for when chrome drops; L0 + host repro steps.

### 2. Cross-mon TABBED / STACKED product (D0)

Existing task: [forge-tab-groups-cross-mon_d0-discussion.md](./forge-tab-groups-cross-mon_d0-discussion.md).

- Supported product vs thrash-only survival (H1 majority-align)?
- Normalize vs intentional span; chrome / open-leaf / DnD across mons

### 3. Tab chrome drag residuals (only if still real)

From [forge-tab-chrome-drag.md](../plans/forge-tab-chrome-drag.md):

| ID | Work | Note |
| --- | --- | --- |
| TD0 | Grab inventory tab vs titlebar | draft / skip if operator already confident |
| TD2 | Peel Model B mismatch | **only if** LX4 ≠ locked model |
| TD3 | Join another strip | **only if** CENTER miss |
| TD4 | User docs one-liner | after behavior stable |

TD1 strip reorder **done** (code + nest).

### 4. Tab click / strip interactivity (already shipped — recheck only if repro)

| ID | Status |
| --- | --- |
| R025 slot | done host |
| R026 pin adopt | done host |
| R032 strip click dead | done (Done restack-only) |

Planning may open a new regression only if host tip still fails after logout.

## Non-goals for this planning task

- Implement before lock
- STACKED product chrome polish (separate plan)
- Resize/autotile design (separate blocker)

## Acceptance (planning complete)

- [ ] Written recommendation for chrome clear gate (when spinner dies vs modal)
- [ ] Cross-mon tabs: supported vs unsupported + normalize rule
- [ ] TD2–TD4: implement / skip / defer with one-line each
- [ ] Follow-up implement tasks drafted (or “none”) on master queue
- [ ] PRIORITY updated after lock

## Context for the next agent

- Operator: plan with **4.6 xhigh** after **SM7**; do not start tab code now
- SM0 locked: group chrome A is this D0 / FCC, not SM1–SM4
- Overlay DnD zone (slot rect) **fixed** and committed separately — not this batch
- Host tip may still need **logout** for soft-clear chrome path to load

## Session note

**2026-08-16:** Opened from operator: hover spinners still long on tabs; park with
other tab work; planning session before implement. Overlay fix shipped.
