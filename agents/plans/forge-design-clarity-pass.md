# forge-design-clarity-pass — Whole-design clarity + no conflicts

**Status:** Accepted — **C0–C3 done** (docs-only). After
[forge-observe-agree-heal.md](./forge-observe-agree-heal.md) H1–H6.
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-09-04
**Design:** catalog `documentation.md` § Design writing / Cross-lock
update.

## Goal

Read **current** `agents/design.md` + active CHANGELOG rows end-to-end.
Every lock that the **daily-driver product** depends on must:

1. Be **crystal clear** (actor, value, context, rejected alternatives).
1. Serve the product: i3/sway-style tiling on GNOME that the operator
   can run on other machines.
1. **Not contradict** another active lock. If two locks fight, newest
   meeting wins **and** the loser is marked superseded in the same
   effort.

This is a **docs/lock pass**, not a feature rewrite. If a lock is
wrong for the product, **stop and ask** (design meeting) — do not
silently invert it in code.

## Acceptance

- [x] `design.md` sections the next agent needs (TOM, D095/D115 heal,
      chrome `moNwsW`, Mark 2 words, FLOAT, apply spine) pass the
      catalog design-writing bar
- [x] CHANGELOG rows that are one-liners without a `design.md` home
      get a home or are marked superseded/rejected
- [x] Conflict list written on this plan (found / none). Each found
      conflict resolved or escalated
- [x] `docs/user/*` only if a user-visible sentence was wrong
      (none — skipped)

## Implementation slices

| Slice | What | Exit |
| --- | --- | --- |
| **C0** | Inventory active P0 locks vs product goal | List on this plan |
| **C1** | Rewrite unclear sections in place (context + words table) | Readable |
| **C2** | Cross-lock: D069/D093/D095/D105/D115/D100 wait vs observe | No silent fights |
| **C3** | Mark superseded rows; do not rewrite history | CHANGELOG honest |

## Do not

- Implement heal ladder here (that is observe-agree-heal)
- Port belt / Mode B / entered-monitor maze
- Invent new product features under “clarity”
- Re-run the whole nest tree because docs changed

## C0 — P0 inventory vs product goal

**Product:** i3/sway-style tiling on GNOME; kernel portable so another
host can get an adapter.

### Serve the product (keep; homes in `design.md`)

| Cluster | IDs | Home |
| --- | --- | --- |
| Kernel / adapters | D073 D074 D079 D080 D082–D085 D087 D088 D090–D094 D096–D101 | Firm architecture, TOM, Mark 2 words |
| Reality vs belief | D092 D093 D096 D098 D100 **D116** | TOM ↔ reality table; D100 keep/disconnect |
| Geometry / heal | D095 D103 D111 D114 **D115** | § Geometry loop |
| Visible wait | D105 | Visible settle + apply spine |
| Chrome | D099 D109 (D046 P1) | Chrome identity `moNwsW`; title spam |
| FLOAT | D087 D110 (amends D051) | FLOATS bag; dialogs; D115 FLOAT = Agree |
| Pointer / Ops | D101 D106–D108 D112 | Mark 2 words; `place: "end"` |
| Apply | D008 D009 D037–D042 D070-layout failsafe | Apply spine |
| Wake (keep) | D102 | present-hold + `safeMoveToMonitor` |
| Overflow mins | D049 | **frame > slot**; not D115 undersize |
| Tab peers | D069 | Primary present; no `force: true` |
| Nest / CLI / install | D021 D022 D036 D045 D048 | existing sections |
| Insert / groups | D032 D044 D094 | mark2.md + TOM |
| Theming / log | D001 D050 | existing |

### Translated, not inverted

| ID | Translation |
| --- | --- |
| D023 | Named child-list API = **Forest atomics**, not GObject `Node` |
| D024 / D025 | CENTER = Group; reveal helper — still true under D101 |
| D006 | Thrash fail-open FLOAT+PH ≠ D115 undersize FLOAT |

### Parked / disconnected (do not execute as v1)

| ID / path | Status |
| --- | --- |
| D100 disconnect catalog | Observe/chrome only |
| H1 / entered-monitor maze | On disk; **parked** |
| D026 idle restore-to-slot | **Superseded** (C3) |
| Belt / Mode B | Deleted / forbidden |

### Do not invert (FIRM)

D115 heal ladder, D095 no `force: true`, D100 handlers off, D105
visible wait, D108 `place: "end"`, D109 `moNwsW`.

## C2 — Conflict list

| Fight | Resolution |
| --- | --- |
| D095 “do not shove / do not ignore far misses” vs D115 “heal until Agree” | **One story** (`design.md` § Geometry loop + D116). Near = D095. Far = D115 ladder. No `force: true` |
| D093 FLOAT terminator vs D115 | FLOAT **after** the ladder, not instead of jitter/TAB |
| D105 wait vs D115 wait | Ladder may continue for **that** window; user/E2E wait is **visible group** only |
| D100 observe vs D115 heal | Heal owner = `heal-ladder.js` on present settle. Do **not** reconnect idle restore / entered-monitor |
| D098 “RESYNC TOM toward REALITY” vs D115 “make Meta honor TOM” | **Two directions** table: host-event vs after-present |
| D069 `tree.render` + `force: true` epoch-end vs D095/D115 | Primary present; opportunistic/force heals **removed**. D069 stays active as shared-slot + visible-first |
| D049 overflow vs D115 undersize | Overflow = **frame > slot**. Undersize = **frame < commanded dest** |
| D026 idle restore vs D100/D115 | **D026 superseded** (C3) |
| Recovery section still described entered-monitor as live | **D100 banner**: maze on disk; D102 hold stays |
| Overview omitted D115 | Compass line added (still small) |
| mark2.md “prototype-only” vs D080 product OpSet | Status line updated to product OpSet |
| Duplicate CHANGELOG IDs D070 / D071 | Noted at top of CHANGELOG; **not** renumbered |

**Escalations:** none. No lock was inverted. No `docs/user/*` change.

## Session note

2026-09-04 — C0–C3 **done** (docs-only, no JS, no nest, no commit).
D115 not inverted. One story: present settle → D095 near / D115 far
ladder → FLOAT after ladder = Agree; D105 visible wait; D100 handlers
stay off. D026 superseded. D116 records the composition. Next: host
eyes (human).
