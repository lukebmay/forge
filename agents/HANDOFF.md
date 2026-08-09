# Handoff — forge (lukebmay)

**Updated:** 2026-08-09 (**FC2 unfocus; SE8b; CE1; FC0–FC1**)  
**Branch:** **`master`** (default). Plan/task branches only for major refactors/features.  
**Sessions:** **X11 preferred for agent live test** (HUP reload). Wayland still a daily driver (logout to load extension).  
**Agent terminal:** Guake OK for **true cold**; Ghostty OK for partial + HUP (never close agent Ghostty).  
**Note:** Guake dropdown hidden may omit Guake from `forge tree` → probe can report ghostty / `can_true_cold=false` even when agent is under Guake (pstree). Manual true cold still OK.

**Default:** always fix the **real problem** (phase contract). Temporary / band-aid only if the operator **explicitly** asks for temporary.

### AI live tests (do this for layout work)

E2E-class desk tests (scripted setup + agent judgment). **Not** a substitute for
unit tests — run **L0 first** for the blast radius, then selected live cases.

```bash
# 1) L0 pure/integration for what you touched
python3 -m pytest tests/unit/cli/test_layout_apply.py -q   # example
# 2) Live E2E subset only
forge test live probe                         # capability gates
forge test live plan --from-work open-leaf    # what would run (not everything)
forge test live run --from-work open-leaf     # execute selected only
forge test live plan --tags R008              # regression-linked cases
```

| Rule | Detail |
| --- | --- |
| **L0 then live** | Rule out pure bugs before dual-mon thrash |
| Select by **behaviors** / **R0xx** / work hint | Do **not** run full matrix every time |
| New live regression | REGRESSIONS + unit if pure + `LIVE_CASES` R id |
| True cold | Requires Guake (or float agent); probe `can_true_cold` |
| Wayland nested retest | Deferred AT-W1 — only before next Wayland CT |

### Architecture fix status (honest)

| Problem class | Status |
| --- | --- |
| Cold/partial **open leaf** (Chrome over Grok, wrong tab) | **Green** — R007 path; SE8b true cold Guake 2/2 + partial ghosttys-only PASS (2026-08-09) |
| **Hard Meta ready** before move/focus | **Fixed** — 5s call-clock `wait_until_hard_ready` |
| Fixed 250ms/2s reassert as product truth | **Removed** — learned soft quiet + event-driven correct |
| Belt structure rewrite after bind | **Still stripped** (D014) — do not reintroduce |
| Mode B as cold success | **Still suppressed** on cold |
| Heuristics file learning | **Landed** — first-ever ~6s then floor/history; SE7 persist |
| Cleanup strip (belt invent / multi-focus) | **Closed** — code landed; CT3 near-cold + matrix green |
| Window ignore mode | **Shipped** — `mode: "ignore"` in windows.json (D020) |
| `forge layout clean` `{tiles:[]}` | **Shipped** — CE1 / R009 `detect_layout_mode` empty tiles |
| Geom soft residual in **same** file (SE6) | **Optional** — SL1 still session thrash catalog |
| True cold-empty CT3 (all apps closed) | **Optional / not required** if matrix green |
| Wayland CT2 parity | **Not re-run** this session (logout) |
| Unrelated: resize-autotile, STACKED product | **Open** (other plans) |

**Bottom line:** Open-leaf architecture (R007) holds for **true cold** (SE8b
verified). Focus-on-close (FC0–FC1) + unfocus Esc (FC2) shipped. **AI live
matrix** is the preferred layout sign-off path (`forge test live`, L0 first).

---

## Start here (next agent)

| Pri | Work | Path |
| --- | --- | --- |
| **use** | AI live matrix for any layout work | [plan](./plans/forge-ai-live-test-matrix.md) · `forge test live` |
| mid | AT2 L1 mon-specific setup polish | [AT2](./tasks/forge-ai-live-test-matrix_at2-l1-setup.md) |
| mid | FC3 combined live smoke (close + unfocus) | [plan](./plans/forge-focus-close-and-escape.md) draft |
| later | Nested Wayland retest spike | AT-W1 — only before next Wayland CT |
| mid | Merge DnD plan branch when ready | `plan/forge-dnd-drop-zones` (complete) |
| optional | SE6 geom soft residual | [settle](./plans/forge-layout-settle-contract.md) |
| human | CT2 Wayland cold smoke | [CT2](./tasks/forge-layout-cold-topology_ct2-wayland-live.md) |
| done | FC2 unfocus; FC0–FC1; SE8b R008; CE1 R009; SE0–SE5+SE7; R007; AT0/AT1 | — |

### Session ship (2026-08-09) — cold-continue

| Shipped | Detail |
| --- | --- |
| **FC2** | `window-unfocus` → `Ctrl+Super+Escape`; `exitForgeMode` no-op API; `unfocusTiles` + hover suppress; live X11 `focusWindowId` None |
| **SE8b / R008** | True cold Guake X11 2/2 + partial ghosttys-only green; R007 path holds (no new open-leaf code) |
| **CE1 / R009** | `detect_layout_mode` empty `tiles:[]` / `roles:[]` → reconcile; live `forge layout clean` empties desk |
| **FC0–FC1** | `pickFocusAfterClose` + wire in `window.js` close restore; live close→LFT smoke |
| **R007** | Open-leaf focus `keyboard:false`; always soft final focus; cold soft floor 2s with pins; RunSteps passthrough; save focus floats/LFT; `--focus` CLI |
| **AI live matrix** | `scripts/forge/live_matrix.py` + `forge test live probe\|list\|plan\|run`; L0-then-live policy; behavior/R0xx selection; Guake preferred for `can_true_cold` |

| Not shipped | Detail |
| --- | --- |
| FC3 combined close+unfocus matrix | draft — unfocus half green on FC2 |
| AT2 / AT-W1 | setup polish / nested Wayland deferred |
| Residual hard-ready warn | cold open still logs “targets not hard-ready (moving anyway)” — structure race noise, leaves OK |

**Enable live:** X11; Guake for cold; `gsettings … logging-enabled true` + log-level 4 if debugging pin.

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

CLI-only cleanup changes (Python `forge` / `layout_apply`) are live without HUP. Extension half needs install/HUP.

### Agent live E2E — most important (run these)

These **partial layout reloads** are the **primary agent end-to-end bar** for
layout settle + claim + open leaf. Unit tests do not replace them. Prefer X11;
**never close the agent’s own Ghostty** (close other windows only).

Profile baseline: host `dev` (mon0 tab+ghostty | mon1 ghostty+tab). For the
nautilus case use host `t1` (or open Nautilus then `layout t1`).

| # | Pre-state (then `forge layout dev` unless noted) | Must hold after |
| --- | --- | --- |
| **1** | **Ghosttys only** — both mon ghosttys; all Chrome/PWAs closed | Full desk; mon0 open leaf **Grok**; mon1 **YouTube**; agent ghostty id survives |
| **2** | **Left chrome + ghostty** — mon0 tab(chrome,Grok)+ghostty; mon1 chrome closed (ghostty may remain) | mon1 tabs reopen; open leaves Grok + YouTube; no mon steal of mon0 ghostty |
| **3** | **Right ghostty** — mon0 chrome closed (ghostty only); mon1 ghostty + tabs | mon0 chrome/Grok reopen; mon1 ghostty **reused** (not stolen to mon0); leaves correct |
| **4** | **Left ghostty + nautilus** — agent ghostty + Nautilus only → `forge layout t1` | t1 structure; nautilus kept/placed; agent ghostty survives; tabs/actives sane |

Also useful (secondary): near-cold empty → one `layout dev`; settled re-run no-op;
optional true cold-empty (close everything **except** agent terminal carefully).

**Pass criteria (each case):** `ok`; structure not thrashing (no Mode B cold);
profile actives visible (lastTabFocus); focus role if profile sets it; **agent
Ghostty windowId still in tree**.

**2026-08-09:** matrix green on black X11 after SE0–SE5+SE7 (agent ghostty kept).

---

## Operator after session switch

1. `gdisplays --status` — if scale wrong: `gdisplays load default`  
2. Confirm session is **X11** for agent live tests  
3. Agent: **partial reload matrix** above (not only full cold)  

---

## Open human blockers

- hard: resize-autotile-design (P3 — unrelated)

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
- **No personal-layout special cases** in product code  
- **No new cold-path pass** without removing an obsolete one (or documenting keep)  
