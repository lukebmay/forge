# B-oh-ws-orphan-host-verify — Host verify OH1–OH3 + ws-orphan tip

**Status:** done (follow-up tasks filed)
**Severity:** soft
**Owner:** human
**Kind:** verify
**Plan:** [forge-observability-hardening](../plans/forge-observability-hardening.md)
**Unblocks:** confidence before monitor / same-mon launch product work
**Priority:** P0 soft (eyes-on; does not block agent queue)
**Created:** 2026-08-22
**Updated:** 2026-08-22

## Host verify outcome (2026-08-22)

Tip loaded; DEBUG on; `layout dev` felt good. `layout vinyl` **hard-failed**
(job `…T104904Z-e208d5`) — product: slot ids ≠ late-adopt; config: vinyl.json
is single-mon. Titlebar preview miss + tab multi-row height + min-width wrap
filed under `agents/tasks/`. See PRIORITY.

## Why this is human-only

Wayland tip load needs **logout once**. Multi-ws layout + false-float + titlebar
DnD are desk-feel bugs; journal/eyes-on is the sign-off.

## Agent prep already done

- OH1–OH3 + ws-orphan landed on `master` (commit + push this wrap-up)
- L0: focused observability + workspace + min-learn + size-skip + ratchet suites green
- `npm run typecheck:oh2` green
- Nest not required for this ship slice
- Stash `ws-orphan WIP park` dropped after reapply

## What the human must do

1. **Load tip** — log out and back in (Wayland) so Shell picks up the install.
2. **Logging** — confirm prefs/gsettings: logging enabled; log-level **6 (TRACE)** after `./install --dev` (D068).
3. **CLI plog (optional)** — `FORGE_LOG_LEVEL=debug FORGE_LOG_TEE=stderr forge ping` should tee debug without breaking JSON/protocol on normal `forge ping`.
4. **Multi-ws layout** — on ws1 run `forge layout dev`; on ws2 run `forge layout vinyl` (or your second profile). Confirm ws1 desk is **not** closed/mutated by the ws2 apply; no hard abort on `size targets not under common parent` after bind already ran.
5. **False float / mins** — after layouts + dock Nautilus, windows should **not** spuriously float from poisoned mins; if a tile already fits its slot, it stays tiled (ratchet, not float).
6. **Titlebar DnD** — before any tab peel: drag a tiled titlebar and confirm drop zones paint; after a mid-drag destroy/unmanage of the dragged window, grab/stage must not stick.
7. **Journal (if anything looks wrong)** — with DEBUG:
   ```bash
   journalctl --user -b --no-pager | rg 'Forge.*(open-plan branch=|apply-ws|size skip|refuse-mins|assert|orphan)' | tail -80
   ```

## Done when

- [ ] Tip loaded (logout once)
- [ ] Multi-ws apply does not thrash the other workspace
- [ ] No obvious false overflow-float after open/layout
- [ ] Titlebar drop zones work before tab peel; grab does not stick after destroy
- [ ] (Optional) DEBUG journal shows sensible `open-plan branch=` / size-skip lines when exercised

Mark this blocker **done** when the checklist is satisfied, or file a new task with repro if something fails.
