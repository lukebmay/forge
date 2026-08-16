# Handoff — forge (lukebmay)

**Updated:** 2026-08-16 (chrome clear at soft-enter; tab restack on clear; logging)  
**Branch:** **`master`** (default).  
**Sessions:** **Wayland** daily driver; nest for **code→reload** loops only (default **1 mon**).  
**Agent terminal:** Durable **Grok leader** for true cold (closes agent TILE). Guake/float also OK.  
**Jobs (shipped):** Mutating `forge` durable by default.  
**Layouts for tests:** only **`_forge-test-*`** — never personal `dev` / `t1` in matrix.  
**Nest design:** [D022](../docs/DECISIONS.md) · [plan](./plans/forge-nested-isolation.md) · [D0](./tasks/completed/forge-nested-isolation_d0-discussion.md).  
**Repo tip:** `a63cdb0` (soft-enter chrome clear + tab restack + INFO logs).  
**Disk install:** needs reinstall after this commit for clean version name; disk had
soft-enter from dirty install.  
**Host Shell tip (live):** **`g8ecb0f6-dirty` until logout** — Wayland does not
reload extension JS in-session.  
**Logging:** `logging-enabled=true`, `log-level=5` (DEBUG). Journal already
shows `[Forge] [DEBUG]` lines.  
**Queue:** **Logout** → tip load → spinner/tab eyes-on + R036 cold. Tab planning
only after tip load if residual remains. [IDEAS](./IDEAS.md).

**Default:** fix the **real problem** (ownership, contracts, pure reuse). Temporary only if operator **explicitly** asks.  
**Lens (FIRM):** **Size is a symptom, not the disease.** Prefer healthy abstractions and tests over “make the file smaller.”

### Hot — spinner + tab click (soft-enter chrome + restack)

| Field | Detail |
| --- | --- |
| Symptom | Spinner stays long; tab click often fails to activate app |
| Root | (1) Host Shell was pre-fix tip. (2) Apply scrim is **reactive** and eats pointer until clear. (3) Soft quiet is multi-second (pin floor / corrections) — clear-after-soft still blocked tabs for the whole wait. (4) Strip buried under raised windows until restack (R032) |
| Fix | Clear chrome at **soft-enter** (before quiet wait). Restack tab strips on chrome clear. INFO logs: chrome show/clear, `_activateFromTab`, restack, reveal adopt |
| Logging | `gsettings get org.gnome.shell.extensions.forge logging-enabled` → true; log-level 5. Follow: `journalctl --user -f \| rg 'Forge.*(chrome|tab|restack|activate)'` |
| Paths | `layout-apply-run.js`; `session-api.js`; `tree.js`; `action-pipeline.js`; `window.js` |
| L0 | layout-apply-run + action-pipeline + bug-tab-click-activate green |
| Host | **Logout required.** Then: `forge ping` must not be `g8ecb0f6`; `forge layout dev`; spinner drops when soft starts; tabs clickable during soft/verify |

```bash
./install --kit=vim
# Wayland: log out and back in, then:
forge ping   # versionName should include a63cdb0 (or later)
gsettings get org.gnome.shell.extensions.forge logging-enabled  # true
gsettings get org.gnome.shell.extensions.forge log-level        # uint32 5
forge layout dev
# expect journal: chrome show → … → chrome clear reason=soft-enter → tab strip restack
# tab click: _activateFromTab / revealGroupChild lines
journalctl --user -b --no-pager | rg 'Forge.*(chrome|soft-enter|_activateFromTab|restack)' | tail -40
npm test -- tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/action-pipeline.test.js \
  tests/regression/bug-tab-click-activate.test.js
```

### Hot — R036 cold Wayland `forge layout dev` (beltStructure + unwrap)

| Field | Detail |
| --- | --- |
| Symptom | Cold job **ok** but tree wrong: mon0 `TABBED\|VSPLIT(ghostty)`; mon1 **flat** 4-wide. Soft OK. Mid re-apply fixes mon1 only |
| Root A | PlaceNext mon-root / D032 thrash (PH pin helps) |
| Root B | AL8 ApplyLayout belt mon moves **without** R013 `beltStructure` → mon1 TABBED flattened |
| Root C | Lone mon-direct VSPLIT never unwrapped after structure |
| Fix (code) | PH PlaceNext pin + pin no-D032; **runBeltStructureRebind** after belt moves; **unwrap mon-direct 1-child H/V** after order/size |
| Paths | `layout-apply-settle.js` beltStructure; `layout-apply-run.js`; `session-api.js` unwrap; prior PH pin files |
| Host | **Logout** then cold `forge layout dev` for tip + cold sign-off |
| Task | [forge-layout-cold-apply-structure](./tasks/forge-layout-cold-apply-structure.md) · [R036](./REGRESSIONS.md) |

```bash
forge ping
./install --kit=vim
# Host cold after logout:
forge layout dev
forge tree
# mon0: TABBED(chrome,Grok) | ghostty
# mon1: ghostty | TABBED(YouTube,Gmail,Voice)
```

### Architecture lock (do not re-litigate)

| Topic | Decision |
| --- | --- |
| Cold spine | `skeleton → open → bind → order/size → hard-ready → focus once → soft residual → verify once` |
| Soft residual (D019) | **Product** — Meta has no settle ACK; learned quiet + correct-on-miss. Not a bug class. |
| Apply chrome | Through structure + hard-ready + focus; **clear at soft-enter** (scrim must not block tabs during soft quiet) |
| Mode B as cold success | **Forbidden** |
| Belt after bind | **Moves-only** (D014) + beltStructure rebind after pin mon moves (R013/R036) |
| Job → API | [contracts.md](../docs/dev/contracts.md) |
| Nest after tests | Prefer `forge nested run` (always stops) |

### Start here (next agent)

**Host must logout** to load `a63cdb0` (soft-enter chrome + restack). Until then
`forge ping` stays `g8ecb0f6` and spinner/tab symptoms are expected on old tip.
Do not redesign D036/D037. Never call `_layoutOp`.

| You can do | You must not |
| --- | --- |
| Logout → tip + cold layout (R036) + spinner/tab eyes-on | Treat pre-logout failures as post-fix regressions |
| After tip: journal for chrome clear soft-enter + tab activate | Start tab product implement before [tab planning](./tasks/forge-tab-work-planning.md) if residual remains |
| Nest mon=1 for code loops | Dual-mon nest by default |

| Pri | Work | Path |
| --- | --- | --- |
| **P0** | Logout → tip `a63cdb0` + R036 cold + spinner/tab verify | this HANDOFF hot sections |
| **plan first** | Tab work D0 if residual after tip | [forge-tab-work-planning](./tasks/forge-tab-work-planning.md) |
| later | Soft polish · scale smoke · STACKED | [PRIORITY](./PRIORITY.md) · [IDEAS](./IDEAS.md) |

### Doc map

| Doc | Role |
| --- | --- |
| [PRIORITY.md](./PRIORITY.md) | Queue |
| [IDEAS.md](./IDEAS.md) | Parked optionals |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
| [contracts](../docs/dev/contracts.md) | Job → API |
