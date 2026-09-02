# forge-observability-hardening

**Verdict:** close
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-observability-hardening.md

## Stated status

Active header is stale: OH1–OH3 **done**; ws-orphan **done**; monitor + same-mon launch **done**. Soft leftover is host dual-mon eyes-on (blocker already `done`).

## Leftovers

- **Host dual-mon eyes-on** — called out on the plan session note; lives on [oh-ws-orphan-host-verify](../../../../blockers/oh-ws-orphan-host-verify.md) which is already **done** (follow-ups filed). Do not keep this spine for that.
- **Bulk `Logger.*` → `plog.*` rename** (OH1 gap, not a blocker) — prefs (`lib/prefs/keyboard.js`, `portability.js`) and some `lib/shared/settings.js` still use `Logger`. Hygiene, not a product campaign.
- **Python `scripts/forge/forge` not Node-plog** — same leftover as `forge-cli-node#CN14/CN15`; not observability kernel work.
- **OH2 tsconfig** stays dual (`tsconfig.json` loose vs `tsconfig.check.json` focused). Not unfinished OH2; do not reopen.

No named OH slice remains.

## Why this verdict

Option 2: duck-tape on `tree.js` is not a reason to keep a live P0 instrumentation plan. The **campaign** shipped (vendor plog, adapter, pepper, checkJs, never-throw asserts, downstream dock/mon traces). Remaining hunts are rename/CLI/host hygiene.

Do **not** post-refactor this as a product queue item. Do **not** keep it parallel to the TOM rewrite. Close the spine; absorb the **strategy** into Host logging so the kernel lift does not invent a second logger or throwing asserts.

## Destination

Archive → `agents/plans/archived/completed/forge-observability-hardening.md` (L0 after merge). Optional Logger→plog rename is **wontfix-or-drive-by**, not a parked PRIORITY row. Python plog follows `forge-cli-node` CN14/15 if that work happens.

## Absorb

**Pull into firm-abstractions as Host logging (not a live OH slice):**

- **O1 / D068:** info filters debug+trace; `./install` → INFO, `--dev` → TRACE, `--prod` → WARN. Ship quieter. Dual-sink stays on in all modes (level gates volume).
- **O2/O5/O6:** one plog API. Node `cli/` imports vendored plog; GJS uses `plog-adapter` (no `node:fs` in Shell). Do not add a second logger in TOM/presenter.
- **O9 / `lib/shared/assert.js`:** asserts **never throw** (logout risk). Failure = plog error + `assertionFailed` flag; skip further apply / DnD commit / launch insert. Active at log-level ≥ debug or `!production`; noop at info-and-below.
- **Kernel vs Host:** TOM/OpSet stay gi-free and should take injected log/assert or stay silent. Journal/file/jsonl sinks, gsettings `logging-enabled`/`log-level`, `forge log` (D053/D054/D067) are **Host**. Do not put `node:` or Gio sinks in the shared TOM.
- **O8:** JSDoc + `checkJs` first; no full `.ts` migration. Ban casual `any`.
- **Vendor:** `third_party/pansi/` + `third_party/plog-query`; do not re-vendor or fork a forge-only logger.

Locks already in `agents/design.md` § Logging sinks / production flag — layers.md should name Host logging, not reopen OH1–OH3.
