# forge-observability-hardening_oh1-plog-logging — Vendor pansi/plog + serious logging

**Status:** in progress  
**Plan:** [forge-observability-hardening](../plans/forge-observability-hardening.md)  
**Branch:** master  
**Blocker:** (none)  
**Priority:** **P0** (highest — before multi-ws / monitor / DnD product fixes)  
**Model:** **Grok 4.6**  
**Reasoning:** **high**  
**Updated:** 2026-08-21

## Goal

Pin shellrc’s current JS **pansi** + **plog** into forge as a 3rd-party
dependency, replace the existing `Logger` system, switch CLI JS to plog, and
pepper **debug** / **trace** through every remotely problematic path —
especially workspace, monitor, layout apply, DnD, and dock/same-mon launch.

## Model rationale

Cross-cutting adapter (Node plog vs GJS Shell sink), gsettings level mapping,
and “where to trace” judgment are easy to get wrong. Use **4.6 high**. Mechanical
peppering of call sites may continue under **4.5** in follow-up sessions once
the adapter and replace pattern are locked.

## Acceptance

- [x] shellrc: add `PANSI_VERSION` on `p.js` (keep `ANSI_COLOR_VERSION` / `PLOG_VERSION`); **commit + push shellrc**, then snap
- [x] Vendored tree at `third_party/pansi/` with pinned version file (exact versions + shellrc commit/date)
- [ ] Forge **Node CLI** (`cli/*.mjs` and related) uses vendored `p` / `plog` (no ad-hoc `console.log` for product logging)
- [x] Forge **GJS extension** uses a thin adapter with the same level API (`trace`/`debug`/`info`/`warn`/`error`) sinking to Shell `log()` / journal (optional file sink OK); **does not** import Node-only modules into GJS
- [x] `lib/shared/logger.js` reduced to shim forwarding to plog-adapter — bulk call-site rename still open (Logger.* still OK)
- [x] Level filter works normally: below debug, **no** debug/trace lines. **Dev install default = debug** (not trace). Trace only when deliberately escalated for stuck failures.
- [ ] Hot paths peppered: at minimum
  - layout apply (epoch, snapshot, forest filter by workspace, open/bind/size/focus)
  - tree insert / PlaceNext / open-min / dock launch insert choice
  - monitor resolve / workareas / entered-monitor / same-mon launch side
  - DnD grab / preview / commit / empty-mon / mins red zones
  - workspace filter / orphan / cross-ws claim
- [ ] Suspicious areas use `debug()`; structural decision points use `trace()` liberally
- [ ] Prefs UI still exposes log level (mapped to plog)
- [ ] L0: adapter unit tests + existing suites still green; nest not required unless GJS sink needs Shell

## Context for the next agent (complete + succinct)

### Source to snap (shellrc)

| File | Version symbol (today) |
| --- | --- |
| `~/dev/me/shellrc/util/js/ansi_color.js` | `ANSI_COLOR_VERSION = "1.0.0"` |
| `~/dev/me/shellrc/util/js/p.js` | **no version export yet** — add before snap |
| `~/dev/me/shellrc/util/js/plog.js` | `PLOG_VERSION = "1.0.0"` (Node ESM; `node:fs`/`crypto`) |

Design ACK’d / B-plog-design closed in shellrc (2026-08-21). Snap current JS;
forge may keep a thin local adapter.

### Existing forge logger

- `lib/shared/logger.js` — `Logger` with OFF…ALL; gated by `logging-enabled` +
  `log-level` + `production` (production → OFF even if enabled)
- Prefs: `lib/prefs/settings.js` Logger row
- Dev tip: `gsettings set … logging-enabled true` and `log-level` 4=INFO / 5=DEBUG / 6=TRACE
  (see `agents/project.md` § Dev testing)

### GJS constraint (FIRM)

Vendored `plog.js` uses Node builtins. Extension code runs in GJS. Pattern:

```text
third_party/pansi/     # pinned copies (Node-faithful)
lib/shared/plog-adapter.js   # forge: init from gsettings; GJS sink vs Node sink
```

CLI imports third_party (or adapter that selects Node). Extension imports
adapter only.

### Pepper targets (start here)

- `lib/extension/session-api.js`, `layout-apply-*.js`, `window.js`, `tree.js`,
  `tree-layout.js`, `drag-drop.js`, `action-pipeline.js`
- `lib/shared/layout-plan.js`, `layout-open.js`, `open-min-place.js` (if present)
- `cli/*.mjs` product paths
- Existing in-progress bugs for context:
  [`forge-layout-ws-orphan-min-float-dnd`](./forge-layout-ws-orphan-min-float-dnd.md)

### Same-mon launch policy (log the decision; do not “fix” product here)

When tracing dock/launch insert, log which branch fired:

1. left dock → left side (symmetric for right)
2. if only one dock: last focused insert → end of tree insert → nearest
   groupable to last focused → float

## Session note

2026-08-21 — Partial OH1:
- shellrc: `PANSI_VERSION=1.0.0` on `p.js`; commit+push `3226f7c`
- forge: `third_party/pansi/` snap + VERSION pin
- `lib/shared/plog-adapter.js` + `Logger` shim; schema INFO baseline;
  rem `./install` sets log-level=5 DEBUG
- L0: logger + plog-adapter tests
- **Still open:** CLI → vendored plog; pepper hot paths; call-site migration
  beyond shim

## Session note (prior)

Ready. Do not start multi-ws product surgery until adapter + key traces land.
