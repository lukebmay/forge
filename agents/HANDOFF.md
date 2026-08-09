# Handoff — forge (lukebmay)

**Updated:** 2026-08-08 (P0 = patch cleanup; test on **X11**)  
**Branch:** `plan/forge-layout-cold-topology`  
**Sessions:** **X11 preferred for agent live test** (HUP reload). Wayland still a daily driver (logout to load extension).

---

## Start here (P0)

| Pri | Work | Path |
| --- | --- | --- |
| **P0** | **Strip patchwork — architecture holds the weight** | [cleanup](./tasks/forge-layout-cold-topology_cleanup-fallbacks.md) |
| → | CT3 X11 live smoke (agent can HUP + verify) | [CT3](./tasks/forge-layout-cold-topology_ct3-x11-live.md) |
| → | CT2 Wayland cold smoke (operator logout when needed) | [CT2](./tasks/forge-layout-cold-topology_ct2-wayland-live.md) |
| shellrc | gdisplays session/greeter (GS0+) | `~/dev/me/shellrc/agents/plans/gdisplays-session-greeter.md` |

**Do not** start unrelated mid features (DnD polish, ignore-mode, etc.) until cleanup has removed dead/competing cold-path patches and the spine is documented as the only success path.

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

Operator rule (hard): **no custom coding for personal layouts.** Profiles are data. Engine must work for any mon order, any tab/stack actives, any app class. Framing a bug as “Grok vs Chrome on black” is fine for repro; **shipping a Chrome/Grok branch is fireable-level bad.**

### How to work instead

```text
1. Name the phase that broke (skeleton | open | bind | order | size | focus | residual).
2. Fix that phase’s contract so the failure class cannot recur.
3. Delete or demote every pass/sleep/re-ensure that only existed for that failure class.
4. Prove with abstract unit forests (roles a/b/c), not only one host profile.
5. Live smoke on X11 (agent HUP) first; Wayland logout when extension-only.
```

**Cold spine (CT0 lock — hold this):**

```text
skeleton → open → bind to slots → order/size → focus once (post-settle) → residual
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
| Cleanup | **P0 now** — remove patch weight; architecture holds |

---

## CT1 shipped (keep; do not re-litigate)

Skeleton-first cold path: `ensure_skeleton` + `bind`; cold thrash report-only; postOpenRetry opt-in. Units landed with CT1.

## Recent mitigations (candidates to **demote/delete** in cleanup)

These may have been necessary while the spine was incomplete. Cleanup audits each as **keep / demote / delete** — default is **delete if the phase model makes it redundant**.

| ID | Mitigation | Cleanup question |
| --- | --- | --- |
| D010 | Chrome-clear after residual | Keep if residual is long phase; don’t clear mid-bind |
| D011 | Preserve lastTabFocus on re-ensure | Delete re-ensure on happy path → preserve may be unused |
| D012 | Final focus + quiet + reassert | Keep **one** post-settle focus; drop extra reasserts if race owned |
| D013 | Dock single-pending + last tile | Keep as **generic** policy; not desk-specific |
| Belt structure after residual | Demote/delete if skeleton+bind already correct |
| Cold Mode B / postOpenRetry | Explicit recover only, never default success |

---

## Testing this session

**Prefer X11** on black: `./install` + `killall -HUP gnome-shell` (or project install path) so agents can verify without logout.

```sh
gsettings set org.gnome.shell.extensions.forge logging-enabled true
gsettings set org.gnome.shell.extensions.forge log-level 4
```

Wayland: logout still required for extension code.

---

## Operator after session switch

1. `gdisplays --status` — if scale wrong: `gdisplays load default`  
2. Confirm session is **X11** for agent live tests  
3. Agent: **P0 cleanup** (audit + strip), then CT3 X11 smoke  

---

## Open human blockers

- hard: resize-autotile-design (P3 — unrelated)

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
- **No personal-layout special cases** in product code  
- **No new cold-path pass** without removing an obsolete one (or documenting keep)  
