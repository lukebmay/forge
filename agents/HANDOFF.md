# Handoff — forge (lukebmay)

**Updated:** 2026-08-05 (CL7 X11 live green — operator confirmed)  
**Implement on:** `plan/forge-layout-control-loop` (**ahead of origin**; **not pushed**)  
**HEAD:** control-loop tip includes `fe8448c` PWA fix + CL0–CL6 + docs  
**Wayland residual:** `plan/forge-wayland-live` — **WIP stashed** (do not drop; see below)  
**Default queue canon:** merge plan → `master` next so queue docs are current on default  
**Remotes:** `test` / `prod` **not** touched — **no push** unless human asks  

**Active plan:** [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md)  
**Next:** **merge** plan branch → `master` (local), then Wayland residual smoke (logout)  
**Completed CL7 live:** [cl7-live-ghostty](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_cl7-live-ghostty.md)  
**Completed CL7 code:** [cl7-pwa-open-wait](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_cl7-pwa-open-wait.md)  
**Rename-only (later):** [forge-monitor-recovery-rename.md](./plans/forge-monitor-recovery-rename.md)  
**Queue:** [PRIORITY.md](./PRIORITY.md)

---

## Session strategy

| Phase | Session | Status |
| --- | --- | --- |
| **1** | **X11 (GNOME on Xorg)** | **Done** — CL7 live green |
| **2** | **Wayland residual** | **Next after merge** — one logout pass for borders / thrash / place timing |

Host **black**: dual 4K, GNOME Shell 46. Operator ran X11 at **150%** scale with
`gdisplays save default` + `gdisplays --user-to-login`.

---

## Where we left off (live)

| Fact | Detail |
| --- | --- |
| Session | **X11** (`XDG_SESSION_TYPE=x11`) |
| Displays | **150%**; gdisplays default + login apply (human) |
| `forge layout dev` | **Success** — opened full black profile (slightly slow: intentional control-loop settle) |
| Tree mon0 | TABBED Google-chrome (New Tab) + Grok \| ghostty |
| Tree mon1 | ghostty \| TABBED YouTube, Google Voice, Gmail |
| PWA wait | No Grok 15s timeout (fix `fe8448c` held) |
| Install | Debug install matched plan tip (`layout-controller.js`, `place-hint.js`) |
| Wayland residual | Still open; stash holds wayland-live WIP |

### Prior failure (fixed in code, retested live on X11)

| Fact | Detail |
| --- | --- |
| Was | `forge layout dev` hung ~15s; Grok wait timeout; remaining opens aborted |
| Root cause | Sugar `Google-chrome` discarded desktop `chrome-<id>-Default` / `crx_*` hints |
| Fix | `fe8448c` — wait merge, PlaceNext specific class, chrome family class_eq, continue opens |

---

## Next session — do this first

### Agent / human

1. **Merge** `plan/forge-layout-control-loop` → `master` **locally** (orchestrator / human).
   - **Do not push** unless human asks.
2. **Wayland residual smoke** (logout install path only):
   - Switch to Wayland if needed; install from master (or plan tip if not yet merged).
   - Sole Ghostty + optional `forge layout dev`; chase only Wayland-specific residuals.
3. Then: container selection S3, desktop keybinds, MR0 rename as priority allows.

### Agent rules reminder

| Rule | |
| --- | --- |
| Branch | Stay on plan branch until merge; after merge continue on master or wayland-live as appropriate |
| Push | **Never** unless human asks this message |
| Stash | **Never** drop wayland-live WIP; **never** pop onto control-loop or master |
| Live data | No Dropbox/secrets live mutate; layout live on black is intentional product smoke |

---

## Agent git: stashed Wayland WIP (do not lose)

**Human is not managing this stash.** Agents must treat it as repo state.

| | |
| --- | --- |
| **Why** | Unfinished `plan/forge-wayland-live` stashed so control-loop could start clean |
| **Branch it belongs to** | `plan/forge-wayland-live` only |
| **Control-loop / master** | **Do not** `stash pop` onto `plan/forge-layout-control-loop` or `master` |
| **Drop?** | **Never** `stash drop` / `stash clear` until committed on wayland-live or human abandons |

### Identify

```sh
git stash list
# Expect:
# stash@{N}: On plan/forge-wayland-live: WIP plan/forge-wayland-live: rival-tilers, soft-rehome, install scripts (unrelated to control-loop CL0)
```

Match by **message**, not only index (index may move).

### Restore (only when resuming Wayland residual)

```sh
cd ~/dev/me/forge
git checkout plan/forge-wayland-live
git pull --ff-only   # if tracking
git stash list       # find N by message
git stash pop stash@{N}
# resolve conflicts; commit on wayland-live when ready
```

---

## Control loop — shipped on plan branch

| ID | What | Status |
| --- | --- | --- |
| **CL0** | `layout-controller.js` — `requestLayout` / `requestVerify` trailing debounce | done |
| **CL1** | `layout-verify.js` — Meta↔slot ε=4; agreement ×2 → SETTLED | done |
| **CL2** | `layout-sensors.js` — suppress on apply; external geometry path | done |
| **CL3** | `app-thrash-catalog.js` — Ghostty sticky `needsExtraVerify` | done |
| **CL4** | `layout-open.js` — open quiet → `requestLayout` | done |
| **CL5** | DBus `LayoutBatch` — layout CLI multi-open one post-quiet commit | done |
| **CL6** | `layout-verify-interval-ms` gsetting (default **0** = off) | done |
| **CL7 code** | Chrome PWA wait/place/class_eq + open-loop continue (`fe8448c`) | done |
| **CL7 live X11** | Operator green: layout dev + dual-mon tree | **done** |
| **CL7 Wayland residual** | Logout smoke after merge | **open** |

**Recent commits (local, not pushed; tip first at wrap time):**

```text
f85f22c docs(agents): handoff X11-first CL7 live after PWA open/wait fix
fe8448c fix(layout): match Chrome PWA classes on open wait and PlaceNext
d1a9e0f docs(agents): handoff CL0–CL6 complete; CL7 operator live Ghostty
845700a feat(layout): CL6 optional layout-verify-interval-ms (default off)
e89ec31 feat(layout): CL5 layout CLI open batch with single post-quiet commit
58fab3e feat(layout): CL4 open path quiet batch then requestLayout
9d7f921 feat(layout): CL3 in-memory app thrash catalog with Ghostty defaults
1c1f2e9 feat(layout): CL2 external geometry via control loop and apply suppress
ee8445d feat(layout): CL1 Meta↔slot verify scanner and agreement counter
05cfef2 feat(layout): CL0 requestLayout/requestVerify debounce skeleton
```

**Tests (CL7 wrap):** vitest **2100** passed (194 files); CLI pytest `tests/unit/cli/` **358** passed.

### Key modules

| Module | Role |
| --- | --- |
| `lib/extension/layout-controller.js` | Debounce, agreement, thrash-extra, batch gate |
| `lib/extension/layout-verify.js` | Pure frame↔slot scan |
| `lib/extension/layout-sensors.js` | Forge-caused / in-slot helpers |
| `lib/extension/layout-open.js` | Open quiet helpers |
| `lib/extension/app-thrash-catalog.js` | Per-class thrash heuristics |
| `lib/extension/place-hint.js` | PlaceNext + chrome family `wmClassEqual` |
| `scripts/forge/forge` | `do_launch`, wait merge, layout open loop |
| `scripts/forge/layout_plan.py` | Reconcile plan + chrome family `_class_eq` |

### Host layout profile

```text
~/dev/me/shellrc/configs/forge/layout/hosts/black/dev.json
# sugar: mon0 tab(google-chrome,Grok)|ghostty ; mon1 ghostty|tab(YouTube,Gmail,Google Voice)
```

CLI: `~/.local/bin/forge` → `~/dev/me/forge/scripts/forge/forge` (symlink; tree edits are live for CLI).

---

## Soft-rehome origin (fact)

| | |
| --- | --- |
| jcrussell? | **No** |
| This fork | **Yes** — H1, Luke; product name → **monitor-recovery** (separate PR only) |

---

## Live session notes

| Layer | Status |
| --- | --- |
| Control loop CL0–CL6 | **Code done** on plan branch |
| PWA open/wait | **Code done** (`fe8448c`) |
| CL7 live X11 | **Green** (operator 2026-08-05) |
| Wayland borders / W4 thrash | Residual; stash holds extra WIP — **after** merge |
| monitor-recovery rename | Separate PR; do not block merge |
