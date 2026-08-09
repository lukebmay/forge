# Plan: layout settle contract (hard Meta + soft expectations + verify)

**Status:** active — design lock  
**Priority:** **P0** (cold open leaf / focus thrash; unblocks reliable one-shot layout)  
**Branch:** `plan/forge-layout-cold-topology` (or default when merging)  
**Created:** 2026-08-08  
**Related:** [forge-settle-learning.md](./forge-settle-learning.md) (SL1–SL2 geom samples; supersede/extend),  
[forge-layout-cold-topology.md](./forge-layout-cold-topology.md) (spine),  
AC1–AC6 apply-contract, thrash catalog (CL3)

### Session note (overwrite)

**2026-08-09:** **SE0–SE4 + SE7 done.** Soft barrier + file persist + docs.
Next: **SE5** extension pin/D018 tighten; **SE8/CT3** X11 cold smoke.

**2026-08-08:** Operator + agent locked direction. Product: hard Meta readiness →
act → soft expectation barrier (file-backed) → post-settled verify once.

---

## Problem

Cold `forge layout` builds topology but **open leaf / focus** fails after maps:

- mon0 Chrome visible instead of profile `active` (Grok)
- mon1 wrong tab selected vs visible content
- Fixed sleeps (250 ms reassert) work on one host speed, fail on others or when
  residual arrives late
- Meta never emits “I am settled” — pure wall-clock is not a contract
- Cleanup stripped D012 reassert as “patch” without replacing the **stick** half
  of the settle contract

Root classes of residual (do not collapse them):

| Kind | Example | Effect |
| --- | --- | --- |
| **Focus residual** | Late activate / focus steal after TILE | `lastTabFocus` / open leaf / strip |
| **Geometry residual** | size-changed after map or our move | slot drift, jumpiness |
| **Structure failure** | wrong mon children / missing bind | topology — **not** a wait bug |

This plan owns **hard readiness + soft residual settle + post-settled verify**.
Structure remains cold-topology skeleton→bind (CT0/CT1).

---

## Locked direction (agree list)

| # | Decision |
| --- | --- |
| **1** | **Phase order:** never set profile open leaves / keyboard focus mid-open. Structure+bind first; focus phase only after hard-ready for target windows. |
| **2** | **Hard expectations:** Meta/Forge guarantees we wait for before acting in a phase (map, windowId, TILE, mon ≥ 0, sane rect). Hard timeout ~**5s** (rarely hit). Clock starts when **we make the call** (launch / move / focus apply), counts until hard signals return. |
| **3** | **Soft expectations:** residuals that *may* appear (focus steal, size-changed after apply). Not guaranteed. Soft timeout = **max(last 10 observed residual latencies for that process) × 1.25**, with floor until N samples and a clamp so outliers cannot dominate forever. If no residual by soft timeout → declare soft-settled and move on. |
| **4** | **Clock:** from **call site** (open, move, focus-apply, …) until hard or soft events land — not “machine speed benchmark,” not arbitrary sleep from command start only. |
| **5** | **Reset soft quiet** on in-scope residual Meta signals for that phase (focus residual → focus quiet; geom residual → geom quiet). Not every Meta event on the display. |
| **6** | **Focus steal = thrash:** nothing should steal managed open leaf / layout keyboard focus during layout focus phase. On steal → **correct immediately** (restore pin / re-apply desired) + record residual for learning. |
| **7** | **Learning store (file-backed):** first long observation = **first open/process after fresh install or empty heuristics file** for that class/key — not first open per session. Persist good data; **keep updating** so recent sessions dominate (upgrades, driver changes). Storage update strategy finalized in task SE0 if needed. |
| **8** | **Keys:** host + app class/app id + process kind (open / move / focus-phase / …). **Never** personal desk / role names in product heuristics. |
| **9** | **Post-settled verify (once):** after hard+soft labeled settled, one thrash look (open leaf, optional kbd). Mismatch → correct **once** + record late residual. Without Meta settle ACK this terminal verify is required; it is a **contract terminal phase**, not an infinite belt. |
| **10** | **Late residual after command:** if still in pin/verify window → correct + learn; if after layout finished → record for learning (optional light correct only if still wrong and safe). Do not restart whole layout forever. |
| **11** | **Defaults before samples:** short product floors (e.g. D012-class quiet) only until file has data; reassert-as-phase is core, **not** fixed 250 ms forever. |
| **12** | **Hard timeout ~5s** for hard expectations. Soft timeouts from heuristics. Learning trial may use longer soft cap once per class. |
| **13** | Extend settle-learning / thrash catalog; do not invent a parallel Chrome-only stack. |

---

## Soft vs hard (glossary)

| Term | Meaning |
| --- | --- |
| **Hard expectation** | Signal we treat as required before the next act (TILE+rect+mon after open, etc.). Wait up to hard timeout. |
| **Soft expectation** | Residual that *often* follows an act; wait up to learned soft timeout; if absent, proceed. |
| **Soft residual** | Same idea as soft expectation (operator language). |
| **Focus thrash** | Unwanted focus/activate that rewrites open leaf or layout kbd after we set them. |
| **Geometry thrash** | Client size/position after map or our apply (catalog today). |
| **Call clock** | Timer from the forge call that initiated the wait (launch, RunSteps move, focus apply). |

---

## Target lifecycle (one layout invocation)

```text
P0  Resolve profile + live candidates
P1  Skeleton / structure as needed (CT1)
P2  Open missing roles (batch) — hard-ready per role (call clock)
P3  Bind / order / size — hard-ready for move targets
P4  Focus phase:
      hard-ready for active/focus windows
      apply open leaves + profile focus once
      soft expectation barrier (focus residuals; steal → correct + reset quiet)
P5  Residual close/park (existing)
P6  Post-settled verify once (open leaf + kbd); correct once if needed
P7  Persist heuristic updates (async / end of command)
```

Thrash Mode B structure recover stays **mid-session chaos only** (cold-topology).

---

## Learning file (intent; SE0 may refine)

| Topic | Intent |
| --- | --- |
| Path | Under forge config, e.g. `~/.config/forge/config/settle-heuristics.json` (exact path SE0) |
| First-ever | Missing class/key → learning trial (longer soft cap), then write |
| Update | Every successful session/process contributes samples when data is good; prefer recent (rolling last 10 latencies + counts) |
| Stale | Rolling window naturally forgets ancient max; schema version invalidates on engine change |
| Privacy | No titles/URLs/personal role names — class keys + timings only |

**Update strategy (default until SE0 changes):**

- Keep last **10 residual latencies** per (host, class, process kind, residual kind)
- Soft timeout = `max(those) * 1.25`, clamped
- Also track fraction of trials with **zero** residual (often quiet) to avoid over-waiting
- Trials with no residual do **not** push max latency to 0
- Write at end of layout command / idle coalesce (no fsync storm)

---

## What this supersedes / absorbs

| Prior | Action |
| --- | --- |
| D012 fixed 250 ms reassert as product truth | Supersede timer; keep phase order |
| D015 “one focus, quiet alone” | Supersede |
| D017 verify-once only | Absorb into soft barrier + post-settled verify |
| D018 pin + restore + tab-active | **Keep** as extension mechanism for focus residual correct |
| SL1/SL2 geom samples | Extend with focus residual + disk persist |
| Cleanup demotion of reassert | Documented mistake; reassert becomes event-driven soft barrier |

---

## Non-goals

- Machine-speed benchmarks scaling all sleeps  
- Brand-specific Chrome/Grok product branches  
- LF6 whole-tree fingerprint as default gate (still opt-in debug)  
- Infinite reassert / multi-CLI “run layout again” as success  
- Solving pure structure bugs with waits alone  

---

## Design discussion (open before implement)

If any item stays contested, **stop at SE0** and resolve with operator. Else treat
defaults below as locked for implement tasks.

### SE0 — design discussion / lock remaining knobs

**Status:** done (2026-08-09)

| # | Question | Default if no further input |
| --- | --- | --- |
| D1 | Heuristics file path + schema version | `~/.config/forge/config/settle-heuristics.json` v1 |
| D2 | Hard timeout | **5s** |
| D3 | Soft clamp (max wait even if history huge) | focus residual **3s**, geom residual **5s** (tunable) |
| D4 | Default soft floor before any samples | focus **400 ms**, geom from catalog seed/learned |
| D5 | Learning trial soft cap (first-ever class) | **min(10s, soft_clamp * 2)** |
| D6 | N for rolling max | **10** residual-positive samples |
| D7 | Pad | **+25%** |
| D8 | Post-settled verify | **exactly one** full check; one correction pass max |
| D9 | Late residual after layout CLI exits | pin window may still restore; after pin expiry **record only** unless SE0 chooses idle correct |
| D10 | Relation to `plan/forge-settle-learning` branch | Prefer implement on current cold-topology / master; merge learning plan docs |

**Exit SE0:** write D019 in `docs/DECISIONS.md`; update settle-learning plan status
(supersede or point here); no further product design thrash mid-implement.

---

## Tasks

| ID | Task | Status |
| --- | --- | --- |
| **SE0** | Design discussion lock (table above) + DECISIONS D019 | **done** |
| **SE1** | Heuristics store: schema, read/write, host+class+kind keys, rolling last-10, pad/clamp pure helpers + unit tests | **done** |
| **SE2** | Hard-ready barrier API (call clock → TILE/rect/mon; 5s timeout) unify LF5 wait; tests | **done** |
| **SE3** | Soft expectation barrier (focus residual): start after focus apply; steal → correct + record + reset quiet; soft timeout from heuristics; tests | **done** |
| **SE4** | Wire focus phase in `forge layout` open path: hard-ready → apply once → soft barrier → post-settled verify once; restore reassert-as-phase (not fixed 250 ms product) | **done** |
| **SE5** | Extension: ensure pin/restore + tab-active=lastTabFocus aligned with SE3 (D018 keep/tighten); meta-focus steal always treated as thrash during layout focus pin window | **next** |
| **SE6** | Geom soft expectation: fold SL1 minQuiet into same store/API (no second file) | ready after SE1 |
| **SE7** | Persist updates end-of-layout; first-ever learning trial path; docs (`layout.md` settle section) + REGRESSIONS | **done** |
| **SE8** | X11 CT3 cold smoke + Wayland CT2 when logout OK; thrash dump / heuristics dump CLI if useful | ready after SE5 |

Optional later:

| ID | Task | Status |
| --- | --- | --- |
| **SE9** | Invalidate heuristics on schema/engine bump; operator `forge thrash reset-heuristics` | optional |
| **SE10** | Drop Ghostty brand seed when live samples support (old SL3) | optional |

---

## Acceptance (plan-level)

- [x] SE0 locked (D019 written)  
- [x] SE1 heuristics store + unit tests  
- [x] SE2 hard-ready barrier (5s; unify LF5)  
- [x] SE3 soft focus barrier + tests  
- [x] SE4 focus phase wire (hard → apply → soft → verify once)  
- [x] SE7 persist heuristics + layout.md / REGRESSIONS  
- [x] Focus steal during focus phase corrected without fixed 250 ms sole policy (code; CT3 live)  
- [x] Heuristics file path + rolling update (code; live after first layout)  
- [x] Unit tests for pure store + soft/hard predicates; abstract roles only  
- [x] No personal-layout product branches  
- [ ] Cold open: profile actives visible without second CLI layout (CT3 X11)  
- [ ] Hard timeout 5s path logs clearly when Meta never delivers (live)  

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Learning from broken topology | Only sample when structure match / pin roles valid |
| Soft timeout too long after outlier | Clamp + rolling 10 |
| Soft timeout too short | Late residual → correct once + raise history |
| Treating size noise as focus residual | Separate residual kinds |
| Dual systems (SL1 memory + new file) | SE6 merge into one store |

---

## Why this should dissolve the open-leaf class of bugs

If hard-ready is honest, focus runs once at the right time, soft residual is
event-driven (steal = thrash = correct), post-settled verify catches late Meta,
and heuristics adapt per class/host without brand hacks — then Chrome-over-Grok
and wrong tab chrome are the same failure class: **focus phase settle**, not
more belt ensures or Mode B.

Structure bugs remain CT spine, not this plan.
