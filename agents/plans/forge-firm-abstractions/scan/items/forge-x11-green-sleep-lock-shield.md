# forge-x11-green-sleep-lock-shield

**Verdict:** pull-in-refactor
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-x11-green-sleep-lock-shield.md

## Stated status

**next** (stale). Agent work done 2026-08-23: `--dev` + TRACE, soft `session-sleep` PASS, restore-while-locked `fromLock` shield + L0 green, dirty tip on `green`. Only open checkbox is **optional** human overnight HDMI eyes-on.

## Leftovers

- **Optional overnight eyes-on** on host `green` (X11 + NVIDIA HDMI panel power-off). Soft DPMS does not exercise it. **Close this leftover** — do not keep-parallel, do not block the refactor, do not put it on PRIORITY.
- Hard HDMI hotplug / gdm re-login storms remain a **host firmware/NVIDIA** path; not a TOM bug and not a kernel slice.
- `design.md` recovery map still says session shield **~3s** only — stale vs while-locked `fromLock` + `LOCK_SHIELD_WHILE_LOCKED_US`.

## Why this verdict

Option 2 **keeps** H1 and session restore as surfaces to import, not throw away. The shipped contract is an **epoch/shield rule**, not a desk-bug campaign:

- Enable/HUP already in `unlock-dialog` can call `onSessionLocked` **before** track/restore → empty lock shield.
- Restore-while-locked must **replace** that with `fromLock: true` and a long TTL (`LOCK_SHIELD_WHILE_LOCKED_US`, day-scale). A 3s post-HUP shield expires while still locked → overnight DPMS has no lock forest.
- Unlock shortens to `LOCK_SHIELD_AFTER_UNLOCK_US` (8s). While the shield is active, H1 **reapplies the restored forest**; it must not snapshot thrash topology.

That belongs on firm-abstractions (Host epochs / session restore), same family as dual monitor-resolve (strict session vs T6 majority).

The X11 `green` overnight checkbox is host verify. **Do not** wait on it. Soft path already proved. Duck-tape on `monitor-recovery.js` is not a reason to keep a live host plan — import the strategy.

**Why not close-only:** layers.md would keep the stale “shield ~3s” story and re-break overnight lock. **Why not keep-parallel:** overnight eyes-on is optional and cannot wait-block kernel work.

## Destination

**Absorb into** `forge-firm-abstractions` Host/epoch import (session restore + H1 shield). Then archive this spine → `plans/archived/completed/` (L0 after merge). Overnight HDMI: **wontfix-as-queue-item** (human MAY still do it; no PRIORITY row).

## Absorb

- **While locked:** lock shield TTL = `LOCK_SHIELD_WHILE_LOCKED_US`; `fromLock: true`; forest + focus from restore (or a real snapshot with monitors). Empty shield after enable-while-locked is a bug.
- **While unlocked post-restore:** ~3s shield (`untilMonoUs + 3_000_000`) so post-HUP thrash cannot H1 a broken snapshot.
- **Unlock:** shorten remaining shield to `LOCK_SHIELD_AFTER_UNLOCK_US`; settle workareas 900ms after unlock-from-sleep (`WORKAREAS_SETTLE_AFTER_UNLOCK_MS`).
- **H1 vs shield:** active session shield ⇒ monitor-recovery **reapplies** that forest (do not snapshot thrash). Compose with R016 no-op / R017 entered-monitor defer — not a third recovery system.
- **Two mon-resolve policies stay:** session `resolveStrictMonitor` (no majority); T6 `resolveTargetMonitor` (stableKey / majority). Do not merge.
- **Tests to keep:** `tests/regression/bug-h1-monitor-recovery-workareas-thrash.test.js` (lock-shield + restore-while-locked).
- **Code:** `session-layout-restore.js:restoreSessionLayoutAfterTrack`, `monitor-recovery.js` lock-shield constants.
- **Do not absorb:** NVIDIA HDMI overnight hunt, `session-sleep` matrix as a product slice, SSH-to-green procedure.
