# forge-observability-hardening_oh3-assertions — Debug/trace assertions

**Status:** ready  
**Plan:** [forge-observability-hardening](../plans/forge-observability-hardening.md)  
**Branch:** master  
**Blocker:** (none) — implement after OH1 plog adapter so asserts can log  
**Priority:** **P0**  
**Model:** **Grok 4.6**  
**Reasoning:** **high**  
**Updated:** 2026-08-21

## Goal

Add a shared assertion helper used on programmer invariants (tree parentage,
workspace membership, monitor indices, grab ownership, apply-epoch exclusivity)
with best-practice gating: **active in debug/trace (dev)**, **noop** at normal
info-and-below product levels so hot paths stay cheap.

## Model rationale

Assert policy (throw vs log-and-continue, production gating, interaction with
plog levels) is an architecture lock. **4.6 high** for the API + first hot-path
wiring; further peppering can continue under **4.5**.

## Locked policy (operator ACK 2026-08-21)

| Rule | Detail |
| --- | --- |
| **When active** | `log-level >= debug` **or** `!production` (dev install). At info-and-below in production → **noop**. |
| **On failure (active)** | **plog error** (invariant name + key ids) + set **`assertionFailed` global flag**. **Never throw** — throwing risks Shell logout / login loops (untenable). |
| **After flag** | Rest of code **stops gracefully** (skip further mutate / apply / grab commits) so the operator can address the failure without endless restarts. |
| **Do not** | Use asserts as the only user-facing validation of bad profile JSON / DBus input — those stay normal errors. |
| **Do** | Assert internal invariants after mutations: non-null parent after insert, window’s workspace matches apply ws, grab node matches `_draggedNodeWindow`, mon index in range, epoch live XOR restore path, etc. |
| **Messages** | Stable short code + structured fields (ws, mon, windowId, slot) so traces correlate with plog lines. |

## Acceptance

- [ ] Shared module (e.g. `lib/shared/assert.js`) with `assert(cond, msgOrFields)`,
  maybe `assertEq` / `assertNe` — documented
- [ ] Gated: noop when inactive; when active → plog error + set global failure flag (**no throw**)
- [ ] Unit tests: active vs noop; failure logs; **never throws**; flag readable/clearable for tests
- [ ] Call sites honor `assertionFailed` (graceful stop) on at least apply / DnD commit / launch insert
- [ ] Wired into high-value invariants (minimum set):
  - tree child-list ops / parent consistency after mutate
  - apply snapshot workspace filter (no cross-ws claim when applying one ws)
  - DnD grab ownership (`_draggedNodeWindow` vs focus)
  - monitor index bounds / same-mon group home
  - launch insert branch preconditions
- [ ] Docs: one short row in contracts or DESIGN — when asserts run; graceful-stop flag; how to enable
- [ ] No assert-only “fixes” that swallow product bugs silently when noop’d

## Context for the next agent (complete + succinct)

- Depends on OH1 plog adapter for failure logging
- Existing `production` flag in `lib/shared/settings.js` already forces Logger OFF
  in production — mirror that discipline
- Prefer pure-checkable asserts in `lib/shared/` tested under Vitest; GJS-only
  asserts thin-call the shared helper
- Pair with OH2: type the assert helpers with JSDoc
- **FIRM:** no throw on assert failure — Shell logout risk

## Session note

2026-08-21 — Operator ACK: log error + global graceful-stop flag; never throw.
Land soon after OH1.
