# Handoff — forge (lukebmay)

**Updated:** 2026-08-05 (CL0–CL6 code complete on control-loop branch)  
**Implement on:** `plan/forge-layout-control-loop` (**ahead 7** of origin; **not pushed**)  
**Wayland residual:** `plan/forge-wayland-live` — **WIP is stashed** (agents own git; see below)  
**Default:** `master` has older queue docs until this plan branch is merged for queue canon  
**Remotes:** `test` / `prod` **not** touched  

**Active plan:** [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md)  
**Next task:** [forge-layout-control-loop_cl7-live-ghostty.md](./tasks/forge-layout-control-loop_cl7-live-ghostty.md) — **operator** live smoke on black  
**Rename-only plan:** [forge-monitor-recovery-rename.md](./plans/forge-monitor-recovery-rename.md)  
**Queue:** [PRIORITY.md](./PRIORITY.md)

---

## Agent git: stashed Wayland WIP (do not lose)

**Human is not managing this stash.** Agents must treat it as repo state.

| | |
| --- | --- |
| **Why** | Pre-handoff, unfinished `plan/forge-wayland-live` code was stashed so CL0 could start on a clean tree |
| **Branch it belongs to** | `plan/forge-wayland-live` only |
| **Control-loop** | **Do not** `stash pop` onto `plan/forge-layout-control-loop` or `master` |
| **Drop?** | **Never** `stash drop` / `stash clear` until that WIP is committed on wayland-live or explicitly abandoned by the human |

### Identify

```sh
git stash list
# Expect a message like:
# stash@{N}: On plan/forge-wayland-live: WIP plan/forge-wayland-live: rival-tilers, soft-rehome, install scripts (unrelated to control-loop CL0)
```

Index may not stay `@{0}` if other stashes are added — **match by message**, not only by number.

### Restore (only when resuming Wayland residual)

```sh
cd ~/dev/me/forge
git checkout plan/forge-wayland-live
git pull --ff-only   # if tracking
git stash list       # find N by message
git stash pop stash@{N}
# resolve conflicts if any; commit on wayland-live when ready
```

---

## Control loop (CL0–CL6) — shipped on plan branch

| ID | What |
| --- | --- |
| **CL0** | `layout-controller.js` — `requestLayout` / `requestVerify` trailing debounce; post-render hook |
| **CL1** | `layout-verify.js` — Meta↔slot ε=4; agreement ×2 → SETTLED; mismatch latch |
| **CL2** | `layout-sensors.js` — suppress on move/apply; in-slot chrome; external → `onExternalGeometry` |
| **CL3** | `app-thrash-catalog.js` — Ghostty sticky `needsExtraVerify`; thrash-extra after SETTLED |
| **CL4** | `layout-open.js` — open quiet (dock/default/ghostty) → `requestLayout` (max wait 2.5s) |
| **CL5** | Open-layout batch + DBus `LayoutBatch` — layout CLI multi-open one post-quiet commit |
| **CL6** | `layout-verify-interval-ms` gsetting (default **0** = off) → periodic `requestVerify` |

**Commits (local, not pushed):**

```text
845700a feat(layout): CL6 optional layout-verify-interval-ms (default off)
e89ec31 feat(layout): CL5 layout CLI open batch with single post-quiet commit
58fab3e feat(layout): CL4 open path quiet batch then requestLayout
9d7f921 feat(layout): CL3 in-memory app thrash catalog with Ghostty defaults
1c1f2e9 feat(layout): CL2 external geometry via control loop and apply suppress
ee8445d feat(layout): CL1 Meta↔slot verify scanner and agreement counter
05cfef2 feat(layout): CL0 requestLayout/requestVerify debounce skeleton
```

**Tests (last full):** ~2095 npm unit tests green; pytest `tests/unit/cli/` 338 on CL5.

### Key modules

| Module | Role |
| --- | --- |
| `lib/extension/layout-controller.js` | Debounce, agreement, thrash-extra, periodic, batch gate |
| `lib/extension/layout-verify.js` | Pure frame↔slot scan |
| `lib/extension/layout-sensors.js` | Forge-caused / in-slot helpers |
| `lib/extension/layout-open.js` | Open quiet/max-wait pure helpers |
| `lib/extension/app-thrash-catalog.js` | Per-class thrash heuristics |

---

## Soft-rehome origin (fact)

| | |
| --- | --- |
| jcrussell? | **No** |
| This fork | **Yes** — H1, Luke; product name → **monitor-recovery** (separate PR only) |

---

## Next for human / next agent

1. **CL7 operator retest:** debug install of control-loop branch (PWA wait fix);
   sole Ghostty → `forge layout dev` — no Grok 15s timeout; mon1 PWAs open; note X11/Wayland.
2. Merge `plan/forge-layout-control-loop` → `master` when CL7 OK (or earlier if you want queue+code on default) — **do not push** unless asked.
3. Leave wayland-live stash alone until that plan resumes.
4. Optional: MR0 monitor-recovery rename on own branch/PR.

---

## Live Wayland status (prior)

| Layer | Status |
| --- | --- |
| W-storm render guards | On wayland-live (partially ported geometry suppress into CL2) |
| Borders | Still needs clean smoke on Wayland residual |
| monitor-recovery thrash (W4) | Not done on Wayland |
| Control loop (CL*) | **CL0–CL6 + PWA open/wait fix** — CL7 operator retest |
