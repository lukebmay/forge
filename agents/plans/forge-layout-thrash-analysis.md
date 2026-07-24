# Dual taskforce analysis: stack/tab, ratios, blank/wake

**Date:** 2026-07-24 (updated: product design rounds + execution plan)  
**Mode:** Two independent read-only taskforces (two rounds) + user product lock  
**Base:** jcrussell (`this tree`) vs rewrite / abandon  
**Execution plan:** [forge-daily-driver.md](./forge-daily-driver.md) ← **next agents start here**  
**Related:** [forge-harden-and-session.md](./forge-harden-and-session.md)

## User symptoms

1. Drag onto window sometimes yields **stacked** instead of **tabbed**.
2. **Stack / group labels are actually broken** (not a format mix-up — see below).
3. New tiles sometimes **1/3–2/3** instead of **50–50** (upstream felt more equal).
4. After **display blank/wake**, some windows correct multi-mon; some **untabbed**; some **wrong place**.

Stacking is non-critical; disable until tabbing solid is OK. Correctness > fork loyalty.

### Stack labels — user-corrected (critical)

**Do not** treat this as “user expected horizontal tabs but got vertical i3 stack headers.”

Observed in real use:

| Observation | Meaning |
| --- | --- |
| **Only one stack label when there should be two** | N tiled children, &lt;N label actors (partial chrome) |
| **No stack label at all — only a gap** | Bar height reserved; decoration host empty; **desktop shows through** where the strip should be |
| Super+s appears to do nothing | Default stack binding is **`Super+Shift+s`**, not Super+s |
| Super+x “toggles groups” / odd single full-width label | Default Super+x is **`focus-border-toggle`**, not grouping. Grouping is **`Super+Shift+t`** (tabbed) / **`Super+Shift+s`** (stacked). Second toggle OFF returns to **H/V split** (ungroups) |

**Code path that produces empty gap (both forces confirmed):**

1. `_createWindowTab()` early-returns if `!this.app` (`tree.js`) → no tab actor.
2. `processNode` clears all decoration children every render, then re-attaches only existing `child.tab`s.
3. `_applyDecorationRect` still `decoration.show()` and reserves `barSize` when `showtab-decoration-enabled` and tiled children exist — **without requiring any tabs attached**.
4. Content is inset by `stackedHeight` / `totalBars` anyway → empty strip → desktop gap.

Same path for STACKED and TABBED (shared chrome). Stack uses a vertical column of the **same** tab widgets; missing actors still leave empty reserved space.

---

## Consensus (both taskforces agree)

| Decision | Verdict |
| --- | --- |
| **Abandon jcrussell for upstream** | **No** |
| **Full greenfield rewrite now** | **No** |
| **Stay on this fork and fix** | **Yes** |
| **Disable stacking (default / DND)** | **Yes** until tab chrome is reliable |
| **Empty labels / gap** | Real **chrome lifecycle bug**, not UX confusion |
| **Stack↔tab ON** | Already preserves group (layout enum only) |
| **Stack↔tab OFF (toggle again)** | Intentionally **ungroups** to H/V split — bad mental model for “convert” |
| **Flexbox full redesign now** | **No** — policy-first hybrid later |
| **Equalize by default until user resizes** | **Yes** — smart default |
| **On-disk tree as first thrash fix** | **No** — full **in-memory** snapshot + soft rehome first; disk for session/`workon` later |
| **gdisplays** | Ideas/identity concepts yes; **do not** merge runtime into Forge |
| **Unified multi-line tabs** (`max_tabs_per_line=1` ≈ stack) | **Agree as North Star**; implement **after** single-row tab reliability |
| **Debug layout overlays** | **Sooner** (opt-in) — human + agent debugging; not always-on product chrome |
| **Keybind system** | **First-class:** bare Super+ is user-space; safe multi-modifier defaults; presets + save/load |

### Shared architectural themes

1. **Monitor identity is index-only** (`mo${index}ws${ws}`).
2. **Layout is not durable** — reload restores only outermost STACKED/TABBED; H/V + percents often lost.
3. **Stack + tab share decoration chrome** — geometry reserved independently of whether labels exist.
4. **DnD center** default tabbed, but **joining existing STACKED ignores `dnd-center-layout`**.
5. **Percents:** magic `0` = equal; forge-7m3 preserves ratios after first resize; min-size can paint 1:2 with “equal” percents.
6. **Keyboard defaults today:** many bare Super+ chords (hjkl, c, x, g, …); Super+Shift+s/t for stack/tab — product lock is to treat bare Super+ as user-space going forward (T5).

---

## Round 1 recap (symptoms → code)

See original sections below for major/minor architecture lists. Short map:

| Symptom | Primary drivers |
| --- | --- |
| Accidental stack on drag | Join-existing STACKED parent; modes on; old settings |
| Missing / empty labels | `!app` skip tab + show empty decoration host |
| 1:2 ratios | Percent preserve + min-size redistribution + nesting |
| Blank/wake | Soft rehome partial CON migrate; reload flattens; index keys |

---

## Round 2 — design questions (both forces)

### Q1 — Stack/tab UX & conversion

#### Empty labels / gap root cause

| Force | Verdict |
| --- | --- |
| **A (rewrite)** | Decoration are an **imperative side channel** of render, not a pure function of layout. Reserve bar always; labels optional → empty gap class of bugs. Target: `DecorationModel` with N slots + placeholders. |
| **B (incremental)** | Same mechanisms; **fixable in-tree**: fallback tab without `app`; self-heal if deco child count &lt; tiled count; never show host without tabs **or** always attach fallback (prefer always attach). Regression tests required. |

**Agreement:** Real bug. Not “different format.” Fix chrome reliability before stack polish or multi-line wrap.

#### Convert-all-to-tabs / convert-all-to-stacks?

| Force | Tabs | Stacks |
| --- | --- | --- |
| **A** | Yes — focused CON first; **monitor-scope** convert-to-tabs useful for recovery | No as primary product (stack off) |
| **B** | Not required as button if force-tabbed command exists; today only parent-of-focus toggle | Same; stack optional |

**Agreement:** Explicit **force tabbed** (preserve children) is more valuable than “convert all to stacks.” Monitor-wide convert-to-tabs is a nice recovery tool later. No urgent need for convert-all-to-stacks if stacking is disabled by default.

#### Should stack↔tab conversion preserve the group?

| Force | Verdict |
| --- | --- |
| **A** | **Yes always for convert.** Separate **ungroup** command. Toggle-off→split is wrong as the only exit. |
| **B** | **ON path already preserves group.** OFF path intentionally splits. Product: force-tabbed/force-stacked that never go to split; keep toggle for power users if wanted. |

**Agreement:** Convert must not ungroup. Today Super+Shift+t while stacked **does** convert without ungrouping; second press on the **same** mode ungroups. That second-press behavior is what feels broken.

#### Super+s / Super+x

| Chord | Default | Reality |
| --- | --- | --- |
| Super+s | Unbound | Does nothing |
| Super+Shift+s | Stacked toggle | No-ops if `stacked-tiling-mode-enabled` false |
| Super+Shift+t | Tabbed toggle | ON preserves group; OFF → split |
| Super+x | Focus border toggle | Not grouping |

**Agreement:** Wrong expectations more than broken bindings (unless portable `keybindings.json` remapped). Document + cheatsheet; optional remap only for i3 muscle memory.

#### Near-term product

**Both:** Disable stack by default; force DND tabbed (including convert/refuse join-as-stack); fix tab chrome reliability first.

---

### Q2 — Sizing model: flexbox vs percents

#### User proposal (for the record)

- Default: equal share of remaining space (flex grow), like CSS flexbox.
- Optional static size per tile: px and/or percent; remainder to flex children.
- Cleaner gaps/borders; overlays for pin / % / px / auto per axis.
- Optional pin tile-to-tile linkage (A moves → B grows/shrinks).
- Concern: current system feels not thought through; design before more work.

#### Current system (facts)

- `Node.percent`; **`0.0` = equal** in `computeSizes`.
- `insertChildPercent` (forge-7m3): if siblings already sized, **preserve ratios**, carve `1/(n+1)`.
- Min-size redistribution (forge-s6g) can **paint** unequal frames without updating stored percents.
- Gaps applied after layout (`processGap`); decoration has separate adjust hacks.
- No pin, no flex-grow flag, no size overlay UI.

#### Do we need a flexbox redesign?

| Force | Answer |
| --- | --- |
| **A** | **Conceptually yes** as the long-term **contract** (auto vs fixed basis vs grow). **Not** as a big-bang rewrite now. Salvage percents with clear policy; mid-term hybrid (auto + fixed px/%); long-term one documented flex-like model. |
| **B** | **No full flex engine.** User’s “equal until I pin” is deliverable as **policy + optional userSized flag**. Flex doesn’t fix gap/border chrome math. |

**Agreement:**

| Question | Consensus |
| --- | --- |
| Is current system fine as-is? | **No** — under-documented, magic zero, preserve-vs-equalize implicit, min-size desync |
| Full flexbox redesign now? | **No** — blocks multi-mon / chrome work |
| Smart default = re-equalize until user sets size? | **Yes** |
| Overlays now? | **Later** (A: after contract stable; B: low priority debug first) |
| Pin-to-tile linkage? | **Defer / complexity trap** |
| Gaps/borders fixed by flex? | **No** — separate chrome/gap math |

#### Recommended sizing path

```text
Near:  equalize by default; mark user-intent only on resize; setting for
       insert equalize vs preserve; write-back effective % after min-size
Mid:   optional fixed basis (px | %) + flex remainder  ← “hybrid flex”
Long:  one named contract; optional debug overlay for auto/%/px
Never-now: constraint-graph pin-A-to-B
```

**Opinion (orchestrator):** Your flexbox intuition is **right as product language**. Implementing browser flex inside Shell is wrong. The honest model is:

```text
siblings along axis:
  fixed:  basis in px or % of free container (after gaps)
  flex:   share remaining space by weight (default weight 1 = equal)
min-size from Meta always applied as constraint after
```

That *is* flexbox. We can get 80% of the UX with policy on current percents first, then introduce explicit `basis` without rewriting the tree.

---

### Q3 — On-disk tree backup + monitor translation

#### Does Forge persist the tree today?

**No.** Memory only (lock keeps process tree). Disk has `windows.json` (float rules), settings/keybindings, stylesheet — not topology. In-process: layout-group snapshot around `reloadTree` (tabs/stacks only); soft rehome last-good frame WeakMap.

#### Should we add on-disk backup?

| Force | Verdict |
| --- | --- |
| **A** | **Yes for cold recovery / session scripting**, as versioned snapshot + remap — **not** live truth on every thrash. Debounced write after stable render. |
| **B** | **Disk premature for thrash.** First: full **in-memory** tree snapshot + stable connector map; then optional session file for `workon`. |

**Agreement on order:**

```text
1. Full in-memory snapshot (H/V + tabs + order + size policy + window refs)
2. Soft rehome uses it (majority CON migrate; restore groups without full peel)
3. Stable output keys (Mutter connector / role fingerprint; index fallback)
4. Disk snapshot for logout/workon (window match keys: class + app-id + …)
```

#### How do tiles change when monitor attributes change?

| Event | Behavior | Sane? |
| --- | --- | --- |
| Resolution / workarea only | Re-render; structure kept; % re-derive px | Usually yes |
| Blank/wake thrash | Soft rehome: last-good frame ∩ mon → `move_to_monitor` → reconcile | Often; **unverified on black** |
| Partial CON members differ dest | Windows peel out → group dies | **No** — common untab path |
| Missing monitor node / inconsistent | `reloadTree` + partial group restore | Tabs maybe; H/V/percents lost |
| Connector reorder same count | Index keys may map wrong geometry until rehome | Fragile |
| Monitor count 0 transient | Ignore workareas | Guarded |

**Verdict:** Mild DPMS can work; partial migration and index identity **do fall apart**. Not a full translation layer today.

#### Borrow gdisplays identity?

| Layer | Owns |
| --- | --- |
| **gdisplays** (`shellrc/.../gdisplays/identity.py`) | Connector class, EDID/vendor/product/serial, role match, monitors.xml remap |
| **Forge** | Window tree on **logical outputs**; consume stable keys → current index |
| **Boundary** | Forge must **not** import Python or reimplement monitors.xml. Optional: Mutter connector name in GJS, or small exported map from gdisplays for roles. |

**Both forces:** borrow the **matching idea**, not the binary.

#### Translation layer sketch (A)

```text
Snapshot:
  outputs: stableKey → logical rect/scale
  workspaces: tree { layout, children, sizePolicy, windowKey }

Apply after thrash:
  liveMap: stableKey → current monitor index
  rematch windows + rebuild CONs
  unmatched → primary / Meta placement; mark dirty
```

---

### Q4 — Unified tabs + multi-line wrap (stack = max_tabs_per_line=1)

#### User proposal

Always tabs; min tab width % and/or max tabs per line; overflow → second tabline; `max_tabs_per_line=1` emulates stacks; one system for many tabs + stack.

#### Verdicts

| Force | Agree? | When? |
| --- | --- | --- |
| **A** | **Yes as target chrome model** | After decoration reliability + convert-without-ungroup; wrap multiplies bar geometry bugs if done first |
| **B** | **Yes medium-term North Star** | Steps: stack off → tab reliability → chrome planner params → max_tabs_per_line → deprecate STACKED enum |

**Agreement:** Right long-term product. Code already shares tab actors; STACKED is mostly orientation + N×barHeight. St does not give free CSS flex-wrap — multi-row needs custom row hosts.

**Risks both note:** variable bar height vs content; nested CON tabs (forge-37r); focus/raise still one active child; i3 users need docs that stack = max 1 per line.

**Do not** implement multi-line before empty-gap / 1-of-N is fixed.

---

## Design-before-code priorities (orchestrator synthesis)

```text
1. Stack off + DND force-tab
2. Tab decoration invariant     (N labels; never empty gap)
3. Opt-in layout debug overlay  (sooner — user request; T2)
4. Soft rehome + tab survival + live H1 verify
5. Sizing policy                (equal until user resize; hybrid flex later)
6. Keybind system first-class   (safe defaults, presets, save/load)
7. Full in-mem snapshot → stable outputs → disk/workon
8. Unified multi-line tabs
9. Pin-to-tile                  (never for now)
```

**Execution:** structured tasks T0–T9 in **[forge-daily-driver.md](./forge-daily-driver.md)**.

### Explicit non-goals for now

- Full flexbox engine rewrite  
- Pin-to-tile constraint graph  
- Always-on (non-debug) size chrome  
- Merging gdisplays into Forge  
- Greenfield rewrite / rebase on upstream  

---

## Taskforce A — rewrite lens (architecture) — Round 1

**Lens:** If we rebuilt the core, what is wrong and what should replace it?

### Major issues

| ID | Issue | Severity | Drives |
| --- | --- | --- | --- |
| M1 | Volatile monitor identity | Critical | Wrong place after wake |
| M2 | Partial layout restore on reload | Critical | Untab / wrong structure |
| M3 | Imperative mutation + signal races (no settle→apply engine) | Critical | Probabilistic thrash bugs |
| M4 | STACKED vs TABBED peer modes + shared decorations | High | Drag stack/tab; missing labels |
| M5 | `Tree.split` can leave stale WINDOW node for same Meta.Window | High | Focus/attach/decoration desync |
| M6 | `window.js` still mega-hub | High | Maintainability |
| M7 | Multi-path percent model (0 = equal magic; no single invariant) | High | 1:2 complaints |

### Greenfield sketch (tab-first)

- Output keyed by **stable connector/EDID** (index fallback only).
- Layout nodes: `SplitH | SplitV | Tabs` only (stack optional later as chrome of Tabs).
- Same window node id through structural ops (no split double-node).
- Debounced: dirty → resolve homes → **one** `LayoutEngine.apply` → place + chrome.
- Center DnD: always **wrap pair into Tabs**; never convert whole multi-child split.
- Ratios always sum to 1.0; explicit equalize-on-first-pair policy.

### Keep even if rewriting

Crash guards (`getWorkAreaSafe`, prune-first render, idle finally), Vitest regressions, soft rehome idea, layout-group snapshot concept (extend to full tree), `compat.js`, command names, windows.json/theme path.

### A’s bottom line

**Re-architecture in place on jcrussell**, not clean-room rewrite and not retreat to upstream.

---

## Taskforce B — incremental lens — Round 1

**Lens:** Assume we keep the code; diagnose paths and order fixes.

### Symptom diagnoses (short)

| Symptom | Top causes |
| --- | --- |
| Drag → stack | Join existing STACKED; settings; stack mode on |
| Missing labels / gap | See Round 2 Q1a (app null + empty host show) |
| 1:2 ratios | forge-7m3 preserve + min-size paint + nesting |
| Blank/wake | Partial CON migrate; reload group restore limits; 200ms settle; index keys |

### B’s fix order (PR-sized)

0. Stacking off by default; force DND center → tabbed when stack off; audit gsettings on black  
1. Center-drop: never join-as-stack when user wants tabs  
2. Ratio UX: equalize on first pair / setting without undoing multi-sibling preserve  
3. Blank/wake: finish h1-verify; snapshot/restore tab groups around soft rehome; relax full-migration  
4. Stable monitor keys only if thrash remains  

---

## Round 3 — user product lock (2026-07-24)

### Debug overlays (sizing / layout)

**User:** Overlays may help human debugging — worth doing **first or sooner**. Defers
implementation priority to agents (who do most of the debugging) but explicitly
pulls overlays **earlier** than “after everything else.”

**Decision (orchestrator, aligned with user):** Opt-in **layout debug overlay** is
**T2** in [forge-daily-driver.md](./forge-daily-driver.md) — after tab chrome (T1)
so labels exist, **before** deep blank/wake and sizing work. Off by default; no
permanent pin/flex production chrome. Pin-to-tile remains deferred.

### Keybinds as first-class (user opinion — **agreed**)

**User position:**

1. **Bare Super+ letter/number chords are user-space.** Extremely common for
   launchers, app shortcuts, desktop custom binds. Forge defaults should **not**
   aggressively claim them.
2. Defaults should use **`Shift+Super` / `Alt+Super` / `Ctrl+Super`** (and further
   combinations) so stock installs leave Super+ free.
3. **Preset layouts** (one click): e.g. try **vim-style** (hjkl focus/move) vs a
   **safe** shipping layout — without rebinding every action one key at a time.
4. Eventually **save / load custom** keybind profiles.
5. Good keybinds are **core** to an efficient development environment; tedious
   one-by-one rebinding to experiment is **inexcusably bad UX**.

**Do we agree?** **Yes.** A tiling WM’s keyboard surface is the product. Shipping
vim Super+hjkl as the only default is fine as a *named preset*, not as the only
path and not as the unreviewed collision set for every GNOME user.

**Today (evidence):** schema already binds many bare Super+ chords, e.g.
focus `Super+h/j/k/l`, float `Super+c`, focus-border `Super+x`, split toggle
`Super+g`, prefs `Super+Period`, etc. Portable `keybindings.json` + config-sync
exist, but **no one-click presets** and no “safe vs vim” product story.

**Plan:** Phase **T5** in forge-daily-driver — full keybind system (safe defaults
for fresh installs, presets, save/load). T0 only **audits** bare Super+ list.
Do not half-fix by changing two chords mid-chrome work.

**Presets (sketch):**

| Preset | Intent |
| --- | --- |
| `safe` (default shipping) | All Forge actions on Shift/Alt/Ctrl+Super (+ arrows where useful) |
| `vim` | Current-style hjkl / Super+Shift move — power users opt in |
| later | user-named profiles under `~/.config/forge/…` |

---

## Execution path (canonical)

| Doc | Role |
| --- | --- |
| **[forge-daily-driver.md](./forge-daily-driver.md)** | Task order T0–T9, playbook, non-goals |
| This analysis | Why / evidence / taskforce + user decisions |
| [forge-harden-and-session.md](./forge-harden-and-session.md) | H1 history; session scripting long-term |

**Next agent:** start **T0** → **T1** (see `agents/tasks/forge-daily-driver_t0-*.md`).

### Open verify

`agents/tasks/forge-harden-and-session_h1-verify.md` folded into daily-driver **T3**
after T0–T1 install: dual tile/tab → idle+DPMS → wake → placement + tabs + retab.

---

## Sources

- Taskforce A (rewrite): explore — architecture + Round 2 design answers  
- Taskforce B (incremental): explore — path diagnosis + Round 2 design answers  
- User product lock Round 2–3: labels, flex sizing, disk/remap, multi-line tabs, overlays sooner, keybinds first-class  
- Plan baseline: `forge-harden-and-session.md` (H1 soft rehome shipped; live verify open)  
- gdisplays identity: `shellrc/scripts/devices/displays/gdisplays/identity.py`  
