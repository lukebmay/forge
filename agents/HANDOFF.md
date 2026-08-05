# Handoff — forge (lukebmay)

**Updated:** 2026-08-05 (merge control-loop → master; Wayland residual next)  
**On branch:** `master` (**ahead 11+** of origin; **not pushed**)  
**HEAD:** includes CL0–CL6 + `fe8448c` PWA fix + CL7 X11 live docs  
**Wayland residual:** next operator pass (logout → GNOME Wayland)  
**Stashed WIP:** `plan/forge-wayland-live` — **do not drop**; do not pop onto master  
**Remotes:** **no push** unless human asks  

**Active residual plan:** [forge-wayland-live.md](./plans/forge-wayland-live.md) (borders / W4 thrash)  
**Control-loop plan:** [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md) — **X11 done; code on master**  
**Completed CL7 live:** [cl7-live-ghostty](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_cl7-live-ghostty.md)  
**Completed CL7 code:** [cl7-pwa-open-wait](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_cl7-pwa-open-wait.md)  
**Queue:** [PRIORITY.md](./PRIORITY.md)

---

## Session strategy

| Phase | Session | Status |
| --- | --- | --- |
| **1** | **X11 (GNOME on Xorg)** | **Done** — CL7 live green |
| **2** | **Wayland residual** | **Next** — one logout pass; install already on disk |

Host **black**: dual 4K, GNOME Shell 46. X11 pass used **150%** scale
(`gdisplays save default` + `gdisplays --user-to-login`).

---

## Where we left off

| Fact | Detail |
| --- | --- |
| X11 CL7 | **Green** — `forge layout dev` full black profile; slightly slow settle intentional |
| Tree mon0 | TABBED Google-chrome (New Tab) + Grok \| ghostty |
| Tree mon1 | ghostty \| TABBED YouTube, Google Voice, Gmail |
| PWA wait | No Grok timeout (`fe8448c`) |
| Merge | **Done** — `plan/forge-layout-control-loop` fast-forwarded into `master` (local) |
| Install | **Debug install done** on X11 before Wayland logout: `v49-90-beta.2-…-g5721f8e` under `~/.local/share/gnome-shell/extensions/forge@jmmaranan.com` |
| Tests | vitest **2100**; CLI pytest **358** |
| Push | **Not** done |

### Prior failure (fixed + retested on X11)

| Was | Fix |
| --- | --- |
| Grok 15s wait timeout; open batch aborted | `fe8448c` wait merge + chrome family class_eq + continue opens |

---

## Next — Wayland residual (human)

Install is already on disk from this session. **Logout is required** for a full
Wayland session (extension reload without logout is X11-friendly only).

1. Log out → at GDM pick **GNOME** (Wayland), not “GNOME on Xorg”.
2. Confirm: `echo $XDG_SESSION_TYPE` → `wayland`.
3. Optional logging:
   ```sh
   gsettings set org.gnome.shell.extensions.forge logging-enabled true
   gsettings set org.gnome.shell.extensions.forge log-level 4
   ```
4. Sole Ghostty on mon0: frame ≈ slot; border not full-ring/small-client desync.
5. `forge layout dev` — same dual-mon tree as X11; no PWA wait timeout; layout stable.
6. Note only **Wayland-specific** residuals (borders, W4 thrash, place timing).
7. Paste tree/stderr if anything fails.

Do **not** re-debug X11-already-fixed PWA open unless it regresses on Wayland.

### After Wayland green (or residuals filed)

1. Container selection S3, desktop keybinds, MR0 rename as priority allows.
2. If stash WIP is needed for a residual: checkout `plan/forge-wayland-live` only,
   then `stash pop` **by message** — never onto master.

---

## Agent rules reminder

| Rule | |
| --- | --- |
| Branch | Product path on **master** now; Wayland residual work on `plan/forge-wayland-live` if code needed |
| Push | **Never** unless human asks this message |
| Stash | **Never** drop wayland-live WIP; **never** pop onto master |
| Live data | No Dropbox/secrets live mutate; layout live on black is intentional product smoke |

---

## Agent git: stashed Wayland WIP (do not lose)

**Human is not managing this stash.** Agents must treat it as repo state.

| | |
| --- | --- |
| **Why** | Unfinished `plan/forge-wayland-live` stashed so control-loop could start clean |
| **Branch it belongs to** | `plan/forge-wayland-live` only |
| **Master / control-loop** | **Do not** `stash pop` onto `master` or `plan/forge-layout-control-loop` |
| **Drop?** | **Never** `stash drop` / `stash clear` until committed on wayland-live or human abandons |

### Identify

```sh
git stash list
# Expect:
# stash@{N}: On plan/forge-wayland-live: WIP plan/forge-wayland-live: rival-tilers, soft-rehome, install scripts (unrelated to control-loop CL0)
```

Match by **message**, not only index (index may move).

### Restore (only when resuming Wayland residual code)

```sh
cd ~/dev/me/forge
git checkout plan/forge-wayland-live
git pull --ff-only   # if tracking
git stash list       # find N by message
git stash pop stash@{N}
# resolve conflicts; commit on wayland-live when ready
```

---

## Control loop — on master

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
| **CL7 live X11** | **Done** — operator green 2026-08-05 |
| **CL7 live Wayland** | **Pending** — residual smoke after logout |

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
