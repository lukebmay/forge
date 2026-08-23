# Plan: Observability hardening (plog + types + asserts)

**Status:** active — OH1–OH3 **done**; ws-orphan **done**; monitor + same-mon launch next  
**Priority:** **P0** (highest)  
**Branch:** `master`  
**Created:** 2026-08-21  
**Updated:** 2026-08-21  
**Related bugs (unblocked for traced fixes):** multi-workspace layout (`dev` on
ws1 / `vinyl` on ws2), monitor confusion, DnD breakage, same-monitor dock launch
placement (left dock → left side; single-dock fallback chain).  
**Sibling (shipped):**
[`forge-layout-ws-orphan-min-float-dnd`](../tasks/completed/forge-layout-ws-orphan-min-float-dnd.md)
— stash `ws-orphan WIP park` dropped after reapply.

---

## Why this first

Repeated layout / DnD / monitor “fixes” keep regressing because we cannot see
workspace identity, monitor identity, tree/slot decisions, or launch insert
choice at the moment of failure. Logging, typed boundaries, and debug asserts
are the instrumentation layer that makes the next product fixes falsifiable
instead of another blind patch.

**Operator stance (ACK’d 2026-08-21):**

1. Vendor shellrc **pansi** + **plog** into forge as pinned 3rd-party.
2. Type posture = **JSDoc + `checkJs` first** (not a full `.ts` migration).
3. Add assertions with best-practice gating (dev / debug-trace).

---

## Locked product (do not re-litigate)

| # | Lock |
| --- | --- |
| **O1** | Log levels filter as usual: at **info**, neither `debug` nor `trace` lines appear. **Dev install default = debug** (not trace). Trace is the nuclear option for repeated unsolved failures. Ship/production stays quieter (info or off per existing `production` gate). |
| **O2** | Replace `lib/shared/logger.js` `Logger` call sites with **plog** API (via forge adapter where needed). Prefer `debug()` on suspicious paths; **`trace()` anywhere appropriate** in layout / DnD / monitor / workspace / launch / apply. |
| **O3** | Vendor path: `third_party/pansi/` (pinned snapshot + version stamps). Source of truth for the snap: shellrc `util/js/{ansi_color,p,plog}.js` (+ tests if useful). |
| **O4** | Before snap: version shellrc JS (`ANSI_COLOR_VERSION`, `PANSI_VERSION` on `p.js`, `PLOG_VERSION`), **commit + push shellrc**, then snap. Record pinned versions + shellrc rev in forge `third_party/pansi/VERSION`. |
| **O5** | **Node CLI** (`cli/*.mjs`, leftover Node helpers) imports vendored plog/pansi directly where Node APIs are available. |
| **O6** | **GJS / extension** must **not** import Node-only `node:fs` / `node:crypto` plog as-is. Thin forge adapter: same levels + method names; sink to Shell `log()` / journal (and optional file under `forgeConfigDir()` if cheap). Keep call-site API uniform. |
| **O7** | gsettings / prefs: keep `logging-enabled` + `log-level` (map to plog levels). Regular `./install` → **INFO**; `./install --dev` → **TRACE**; `./install --prod` → **WARN** (D068). |
| **O8** | TypeScript posture: keep `.js` for GJS; enable / tighten **JSDoc + `checkJs`**; ban `any` except rare escape hatches that would otherwise require huge hand-written types. Prefer `unknown` + narrow. |
| **O9** | Assertions: **never throw** (Shell logout risk is untenable). On failure when active: **plog error** + set a **global assertion-failure flag** so the rest of the code can **stop gracefully** and the operator can fix without endless login loops. Active in debug/trace (and/or `!production`); **noop** at info-and-below. Never use asserts as the only user-facing validation of bad external input. |

---

## Build slices (ordered)

| ID | Slice | Model | Reasoning | Task file |
| --- | --- | --- | --- | --- |
| **OH1** | Vendor pansi/plog + forge adapter + replace Logger + pepper layout/DnD/monitor/ws/launch + CLI switch | **Grok 4.6** | **high** | [OH1](./completed/forge-observability-hardening_oh1-plog-logging.md) **done** |
| **OH2** | JSDoc + checkJs hygiene; no casual `any` | **Grok 4.5** | **high** | [OH2](./completed/forge-observability-hardening_oh2-typescript-checkjs.md) **done** |
| **OH3** | Shared assertions gated by level / production | **Grok 4.6** | **high** | [OH3](./completed/forge-observability-hardening_oh3-assertions.md) **done** |

**Order:** OH1 → OH3 → OH2 all **done**. Resume multi-ws / monitor / DnD /
same-mon launch with debug/trace evidence — do not treat unit green alone as
sign-off.

---

## Downstream product backlog (not this plan’s implement scope)

Capture so we do not lose the operator’s failure report:

| Symptom | Desired / suspected |
| --- | --- |
| `layout dev` on ws1 + `layout vinyl` on ws2 lays out wrong | **Done** — [ws-orphan](../tasks/completed/forge-layout-ws-orphan-min-float-dnd.md) |
| DnD often broken under multi-ws / confusion | Grab unmanaged + min-learn/ratchet **done** with ws-orphan; residual: dest mon/ws traces |
| Same-monitor dock launch | Left dock → left insert; **if only one dock:** last-focused insert → end-of-tree insert → nearest groupable to last focused → float |

---

## Non-goals

- Full rewrite of forge to `.ts`
- Waiting on further shellrc plog design churn (B-plog-design **closed**; snap today’s JS)
- Fixing multi-ws / DnD product bugs **inside** OH1–OH3 (instrument first)
- Reintroducing shrink-probe or belt

---

## Session note

2026-08-21 — **ws-orphan done** (uncommitted; stash dropped). Next: monitor
identity + same-mon dock launch with traces. OH1–OH3 still uncommitted.

Prior: OH3 asserts log+flag never throw; OH1 CLI plog + pansi `3226f7c`; rem
install DEBUG=5.
