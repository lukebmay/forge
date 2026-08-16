# forge-layout-slot-machines_d0-discussion — Slot machines architecture D0

**Status:** done — operator locked 2026-08-16 (D039–D043)  
**Plan:** [forge-layout-slot-machines](../../forge-layout-slot-machines.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** Grok 4.6 xhigh (design). Implement via SM1–SM7.

## Goal

Lock per-slot place + hard retry + ApplyEpoch + honest `Done.ok`. Divide
implement work. **No production code** in this task.

## Acceptance

- [x] Read plan; confirm / amend / reject L1–L7
- [x] Options chosen (retry N, `Done.ok`, migration order)
- [x] Locks written (hard retry, slot vs window, barriers, chrome A, geom, what deletes)
- [x] DECISIONS D039–D043; D019 timeout-continue amended; no silent contradiction of D018, D026, D034, D037/D038
- [x] SM1–SM7 drafted with agent + deps
- [x] PRIORITY + HANDOFF updated
- [x] No production code
- [x] Tab product implement not started; interaction noted (after SM7)

## Confirm / amend / reject

| Lock | Verdict |
| --- | --- |
| L1 authority (tree slots, D026, structure ≠ soft) | **Confirm** |
| L2.1–L2.3 per-window machines | **Amend** — **slot** machines (WINDOW **or** TABBED/STACKED CON) |
| L2.4 “less spine” as the goal | **Amend** — goal is one writer + honest hard + honest `ok` |
| L2.5 keep desired forest | **Confirm** |
| L3.1 existing `windowIsSettled` | **Reject** — hard = **in-slot** (mon + parent CON + ε rect) |
| L3.2–L3.3 retry N | **Confirm** — N=2 extra; 5s then 2s |
| L3.4 late catch-up after Done | **Amend** — only while ApplyEpoch is live |
| L3.5–L3.6 hard miss ≠ soft; one-shot continue dies | **Confirm** |
| `Done.ok` on hard-fail | **Lock D041** — required fail → `ok: false`; peers still finish; no best-effort `ok` |
| L4 group chrome A | **Confirm** as product; **implement in tab/FCC D0**, not SM1–SM4 |
| L4.6 focus after all hard | **Confirm** |
| L5 couplings + ApplyEpoch | **Confirm**; workareas mid-apply **cancels** (`displays-changed`) |
| L6 D026 continuous | **Confirm** as existing; **idle-only** during/after apply |
| L7 non-goals | **Confirm** + belt dies; no dual path; no machines before SM1–SM3 |

## Operator locks (2026-08-16)

1. Slot, not window — TABBED/STACKED = one machine.
2. Hard = in-slot, not TILE-anywhere.
3. `Done.ok` = required forest match. Hard-fail should be rare; if common, fix the contract, do not keep `ok` true.
4. Execution continues peers on hard-fail; that is not success.
5. Contracts first (SM1–SM3), then machines (SM4).
6. Belt dies after open-into-slot works (SM6).
7. Group chrome A waits for tab/FCC D0; SM owns apply-overlay lifetime only.

## Follow-up

See plan task table. Next session: **4.5 med orchestrator** assigns SM1
(4.5 high) then SM2 (4.6 high).

## Session note

**2026-08-16:** Direction recorded, then 4.6 review amended L2/L3/`Done.ok`.
Operator agreed including `Done.ok` = false on required hard-fail.
**Also superseded:** D010 (overlay through soft → D043 all-hard), D014
(belt as product → D042 delete). D019 execution → D040/D041; D026
idle-only in epoch; D037 executor is D040 not AL7 spine.
DECISIONS + SM1–SM7 + PRIORITY written. No production code.
