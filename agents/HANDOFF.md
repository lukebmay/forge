# Handoff — forge (lukebmay)

**Updated:** 2026-08-09 (**settle SE0–SE5+SE7; CT3 near-cold green**)  
**Branch:** `plan/forge-layout-cold-topology`  
**Sessions:** **X11 preferred for agent live test** (HUP reload). Wayland still a daily driver (logout to load extension).

**Default:** always fix the **real problem** (phase contract). Temporary / band-aid only if the operator **explicitly** asks for temporary.

---

## Start here (P0)

| Pri | Work | Path |
| --- | --- | --- |
| **P0** | Settle contract residual: SE6 geom optional; close cleanup after CT3 | [plan](./plans/forge-layout-settle-contract.md) |
| done | SE0–SE5 + SE7; CT3 near-cold X11 green | [completed/](./plans/forge-layout-settle-contract/completed/) |
| → | CT3 optional true cold-empty | [CT3](./tasks/forge-layout-cold-topology_ct3-x11-live.md) |
| → | Cleanup strip close | [cleanup](./tasks/forge-layout-cold-topology_cleanup-fallbacks.md) |
| → | CT2 Wayland cold smoke | [CT2](./tasks/forge-layout-cold-topology_ct2-wayland-live.md) |
| shellrc | gdisplays session/greeter (GS0+) | `~/dev/me/shellrc/agents/plans/gdisplays-session-greeter.md` |

### Progress (2026-08-09)

| Done | Detail |
| --- | --- |
| SE0–SE4 | hard/soft settle + focus phase wire |
| SE5 | `LAYOUT_OPEN_LEAF_PIN_MS=15000`; pure pin helpers; meta-focus steal tests |
| SE7 | heuristics file persist |
| CT3 | near-cold `layout dev`: Grok + YouTube leaves, ghostty focus; agent Ghostty kept |

**Live notes:** first-ever soft focus wait ~6s; after zero-residual samples next full focus phase uses 400ms floor. Pin was 3.5s (too short) → 15s wall.

---

## Why patches are bad (read this before coding)

Forge layout has been **duct-taped**: each live failure got another pass, sleep, re-ensure, re-focus, or Mode B recover. That feels like progress and **is how systems rot**.

### What a patch is

| Patch | Architecture |
| --- | --- |
| Second/third plan after open “just in case” | One ordered phase model: skeleton → bind → order/size → **focus once** |
| Belt re-`ensure_layout` that rewrites topology after bind | Bind only fills slots; structure does not invent again on happy path |
| Mid-flight focus + quiet sleep + reassert | Focus is a **phase after settle**, not a bandage for races we refuse to own |
| Mode B thrash-recover as cold success | Mode B = **true chaos only** / explicit recover — not construction-order failure |
| “Works for my dual-mon Chrome desk” branches | **Generic** topology + profile data. **Never** product code for one layout |
| Stacked mitigations that stay forever | When the real fix lands, **delete the crutches** in the same effort |

### Why this became a problem

1. **Symptom → band-aid** without naming which **phase** failed.  
2. Band-aids **hide** the next bug (mon1 order thrash, dock miss, wrong open leaf).  
3. Agents re-learn the desk instead of the **contract**.  
4. Tests encode patches (“plan twice is OK”) instead of the spine.  
5. Personal layout names in code/comments become the implicit product.

Operator rules (hard):

1. **No custom coding for personal layouts.** Profiles are data. Engine must work for any mon order, any tab/stack actives, any app class. Framing a bug as “Grok vs Chrome on black” is fine for repro; **shipping a Chrome/Grok branch is fireable-level bad.**  
2. **Always prefer the real problem** over a temporary workaround. Temporary only when the operator **explicitly** asks for temp / stopgap / “just unstick me.”

### Recent examples (what not to do again)

These are from the same CT2 week — use them as anti-patterns in cleanup and design.

| What we saw | Wrong response (patch) | Real problem (architecture) |
| --- | --- | --- |
| Tab open leaf wrong after cold open (wrong role visible) | Mid-flight focus; belt re-focus; quiet sleep + second reassert stacked forever | **Visibility / active leaf is a post-settle phase.** Raising an open leaf while maps still activate lets apps steal focus (autofocus / late activate). Focus **once after** structure+bind+order are stable — not during open thrash. |
| “Fix” open leaf by stomping lastTabFocus rules ad hoc | Preserve-lastTabFocus bolted onto every re-ensure | **Do not re-ensure topology after bind on the happy path.** If structure rewrite is the crime, stop rewriting; don’t paper the side effect. |
| mon1 mon-children **swapped** (tab \| term vs term \| tab) after thrash | Run layout again / `ensure_order` as the mental model of success | **Order is part of the spine**, not a cleanup pass after chaos. Construction must not thrash mon order mid-batch; settled re-run is repair, not the design. |
| Left dock open lands on focus mon | One more dock hook special-case | **Generic policy:** dock sticky mon from pointer; attach LFT(m) or last tile on that mon — never “Nautilus on black” logic. |
| New open as mon-root covering a tab group | Another mon-root exception for “my dual mon” | **Empty mon LFT ring → end-of-mon-tree attach** (generic last tile), not inventing mon-root as third HSPLIT sibling. |
| Agent “fixed” desk by reordering windows live | Treat symptom as done | Identify the **phase** that allowed swap/steal; fix contract + **delete** the band-aid when the real fix lands. |

**Focus/visibility rule (generic):** any tab/stack **active** (or profile focus) must be applied **after** launches and moves have settled enough that clients will not steal activation. That is phase ordering, not an app-specific race sleep.

### How to work instead

```text
1. Name the phase that broke (skeleton | open | bind | order | size | focus | residual).
2. Fix that phase’s contract so the failure class cannot recur.
3. Delete or demote every pass/sleep/re-ensure that only existed for that failure class.
4. Prove with abstract unit forests (roles a/b/c), not only one host profile.
5. Live smoke on X11 (agent HUP) first; Wayland logout when extension-only.
6. Temporary only if operator explicitly requested temporary.
```

**Cold spine (CT0 lock — hold this):**

```text
skeleton → open → bind → order/size → focus once (post-settle) → residual
```

Thrash mid-batch is **forbidden**. Multi-CLI “run layout again” is **not** the product fix. Internal multi-phase **within one command** is OK only if ordered as above.

**Cleanup means strip, not archive.** After a real fix, leftover belt structure invention, cold postOpenRetry success path, and “try focus again forever” must not remain as default weight. Keep: AC1–AC6 settle, Mode A mid-session, Mode B for true chaos, `--safe`, fail-open placeholders.

See also: [REGRESSIONS.md](./REGRESSIONS.md) (guard the **spine**, not a museum of mitigations), plan [forge-layout-cold-topology.md](./plans/forge-layout-cold-topology.md).

---

## Architecture lock (do not re-litigate)

| Topic | Decision |
| --- | --- |
| Settle thrash (AC1–AC6) | Done — residual geom = echo |
| Cold Mode B second pass | **Not** product success path — skeleton-first one-shot |
| Thrash mid-batch | Forbidden while layout ops in flight |
| Tree shape vs bind | Shape first; async bind to slots OK |
| Skeleton | Slot-tagged AC4 placeholders (CT0/CT1) |
| Focus | One post-settle phase; not mid-structure raise |
| Profiles | Data only — never special-case a host desk in product code |
| X11 | Preferred agent live test (HUP); CT3 required |
| Wayland | Daily driver; logout for extension loads |
| Cleanup strip | **Code landed 2026-08-08** — belt moves-only; one focus; postOpenRetry opt-in |

---

## CT1 shipped (keep; do not re-litigate)

Skeleton-first cold path: `ensure_skeleton` + `bind`; cold thrash report-only; postOpenRetry opt-in. Units landed with CT1.

## Cleanup strip (landed — verify via CT3)

| Was | Now |
| --- | --- |
| Belt `ensure_layout` / `ensure_order` after residual | **Pin-role wrong-mon moves only** (`belt_actions_from_plan`) D014 |
| Final focus + 250ms reassert | **Focus + verify-once** (re-apply only lastTabFocus/kbd mismatches) D017 |
| postOpenRetry default | Still opt-in `FORGE_LAYOUT_POST_OPEN_RETRY=1` D009 |
| lastTabFocus preserve on `_layoutOp` | **Keep** generic mid-session safety D016 |
| Mode B cold | Still suppressed on cold/just_opened |

**Cold X11 residual (fixed 2026-08-09):** mon0 Chrome over Grok; mon1 wrong tab. **D018+D019+SE5:** pin open leaf for soft wall (15s); restore on meta-focus steal; tab-active=lastTabFocus; CLI soft residual barrier + post-settled verify.

Audit table: [cleanup task](./tasks/forge-layout-cold-topology_cleanup-fallbacks.md).

---

## Testing this session

**Prefer X11** on black: `./install` + `killall -HUP gnome-shell` (or project install path) so agents can verify without logout.

```sh
gsettings set org.gnome.shell.extensions.forge logging-enabled true
gsettings set org.gnome.shell.extensions.forge log-level 4
```

Wayland: logout still required for extension code.

CLI-only cleanup changes (Python `forge` / `layout_apply`) are live without HUP. Extension comment-only; no HUP required for cleanup strip.

---

## Operator after session switch

1. `gdisplays --status` — if scale wrong: `gdisplays load default`  
2. Confirm session is **X11** for agent live tests  
3. Agent: **CT3 X11 cold smoke** (near-cold or cold desk → one `forge layout dev`)  

---

## Open human blockers

- hard: resize-autotile-design (P3 — unrelated)

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
- **No personal-layout special cases** in product code  
- **No new cold-path pass** without removing an obsolete one (or documenting keep)  
