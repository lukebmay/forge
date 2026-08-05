# Handoff — forge (lukebmay)

**Updated:** 2026-08-05 (session end — CL7 PWA fix + X11-first live path)  
**Implement on:** `plan/forge-layout-control-loop` (**ahead 9** of origin; **not pushed**)  
**HEAD:** `fe8448c` — *fix(layout): match Chrome PWA classes on open wait and PlaceNext*  
**Wayland residual:** `plan/forge-wayland-live` — **WIP stashed** (do not drop; see below)  
**Default queue canon:** `master` is stale until this plan branch is merged for queue docs  
**Remotes:** `test` / `prod` **not** touched — **no push** unless human asks  

**Active plan:** [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md)  
**Next task:** [forge-layout-control-loop_cl7-live-ghostty.md](./tasks/forge-layout-control-loop_cl7-live-ghostty.md)  
**Completed this session:** [cl7-pwa-open-wait](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_cl7-pwa-open-wait.md)  
**Rename-only (later):** [forge-monitor-recovery-rename.md](./plans/forge-monitor-recovery-rename.md)  
**Queue:** [PRIORITY.md](./PRIORITY.md)

---

## Session strategy (locked for next agent)

| Phase | Session | Why |
| --- | --- | --- |
| **1 — now** | **X11 (GNOME on Xorg)** | `killall -HUP` / `./install` reloads extension without logout; agents can retest layout |
| **2 — after X11 green** | **Wayland** | One focused pass for borders / thrash / place timing residuals |

Do **not** spend this queue on Wayland logout tax until sole Ghostty + `forge layout dev` is boring on X11.

Host **black**: dual 4K, GNOME Shell 46. Last install reported **session=wayland** — human should switch to **Xorg** before the next live drive.

---

## Where we left off (live)

| Fact | Detail |
| --- | --- |
| Session restore | After prior install + logout, **sole Ghostty** came up one large window — good |
| Then `forge layout dev` | Opened some apps; **~15s hang**; failed on role **Grok** wait timeout |
| Root cause | Sugar `open.wmClass=Google-chrome`; wait ignored desktop hints; Meta class is `chrome-<appid>-Default` |
| Cascades | First open failure **aborted** remaining mon1 opens |
| Fix shipped | `fe8448c` — wait merge, PlaceNext specific class, chrome family class_eq, continue opens |
| Install | Debug install of that commit **done** while still on Wayland (needs logout **or** switch to X11 + install/HUP) |
| Live retest | **Not confirmed** by operator yet |

### Smoke after fix (CLI, no Shell)

Grok desktop on black resolves:

```text
wait:  [chrome-…-Default, crx_…, google-chrome, Grok]
place: chrome-…-Default
eq(Google-chrome, chrome-…-Default): True
```

---

## Next session — do this first

### Human (once)

1. Log into **GNOME on Xorg** (X11), not Wayland.
2. On `plan/forge-layout-control-loop`:
   ```sh
   cd ~/dev/me/forge
   git checkout plan/forge-layout-control-loop
   ./install --dev          # HUP on X11
   ```
3. Optional logging:
   ```sh
   gsettings set org.gnome.shell.extensions.forge logging-enabled true
   gsettings set org.gnome.shell.extensions.forge log-level 4
   ```
4. **Sole Ghostty** on mon0 → `forge layout dev`.
5. Paste full JSON/stderr if anything fails; note X11.

### Acceptance for CL7 (operator)

See [task](./tasks/forge-layout-control-loop_cl7-live-ghostty.md). Short bar:

- [ ] No Grok (or other PWA) **15s wait timeout**
- [ ] mon0: chrome + Grok tabs | ghostty; mon1: ghostty-2 | YouTube/Gmail/Voice
- [ ] No mid-batch render thrash / layout stable
- [ ] Sole Ghostty frame ≈ slot (border not full-ring/small-client desync)
- [ ] Record **X11** (this pass)

### After X11 CL7 green

1. Merge `plan/forge-layout-control-loop` → `master` (local; **no push** unless asked) so queue canon is current.
2. Wayland smoke pass (logout install); only chase Wayland-specific residuals.
3. Then: container selection S3, desktop keybinds, MR0 rename as priority allows.

### Agent rules reminder

| Rule | |
| --- | --- |
| Branch | Stay on `plan/forge-layout-control-loop` for CL work |
| Push | **Never** unless human asks this message |
| Stash | **Never** drop wayland-live WIP; **never** pop onto control-loop |
| Live data | No Dropbox/secrets live mutate; layout live on black is intentional product smoke |

---

## Agent git: stashed Wayland WIP (do not lose)

**Human is not managing this stash.** Agents must treat it as repo state.

| | |
| --- | --- |
| **Why** | Unfinished `plan/forge-wayland-live` stashed so control-loop could start clean |
| **Branch it belongs to** | `plan/forge-wayland-live` only |
| **Control-loop** | **Do not** `stash pop` onto `plan/forge-layout-control-loop` or `master` |
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

| ID | What |
| --- | --- |
| **CL0** | `layout-controller.js` — `requestLayout` / `requestVerify` trailing debounce |
| **CL1** | `layout-verify.js` — Meta↔slot ε=4; agreement ×2 → SETTLED |
| **CL2** | `layout-sensors.js` — suppress on apply; external geometry path |
| **CL3** | `app-thrash-catalog.js` — Ghostty sticky `needsExtraVerify` |
| **CL4** | `layout-open.js` — open quiet → `requestLayout` |
| **CL5** | DBus `LayoutBatch` — layout CLI multi-open one post-quiet commit |
| **CL6** | `layout-verify-interval-ms` gsetting (default **0** = off) |
| **CL7 code** | Chrome PWA wait/place/class_eq + open-loop continue (`fe8448c`) |
| **CL7 live** | **Pending** — operator X11 first |

**Recent commits (local, not pushed; tip first):**

```text
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

**Tests:** CLI pytest `tests/unit/cli/` **358**; place-hint vitest **24** (PWA fix). Full npm suite was ~2095 earlier on CL0–CL6.

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

## Live session notes (prior / residual)

| Layer | Status |
| --- | --- |
| Control loop CL0–CL6 | **Code done** on plan branch |
| PWA open/wait | **Code done** (`fe8448c`); **live retest pending** |
| Session restore sole Ghostty | Looked good once on Wayland login |
| Wayland borders / W4 thrash | Residual; stash holds extra WIP — **after** X11 CL7 |
| monitor-recovery rename | Separate PR; do not block CL7 |
