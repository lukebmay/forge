# Handoff — forge (lukebmay)

**Updated:** 2026-08-04 (wayland live fixes)  
**Branch:** `plan/forge-first-class-containers` (local commits; push optional)  
**Default:** `master` — **not** merged (selection mid-wave + thrash fix on feature)  
**Remotes:** `test` / `prod` **not** touched  
**Queue:** [PRIORITY.md](./PRIORITY.md) — **1 Wayland thrash → 2 selection S3 → 3 desktop keybinds**

## Where we are

| Layer | Status |
| --- | --- |
| Wayland live fixes W1–W3 | **Unit done** on `plan/forge-wayland-live` — **logout/in required** for live smoke |

| Layer | Status |
| --- | --- |
| Soft-rehome lock+DPMS thrash | **Fixed + hardened** (live dual-head X11 retest OK) |
| Lock ownership | **GNOME** screensaver; Forge does **not** force DPMS (today Super+Delete only for all kits — **Safe should keep Super+L**, see desktop-keybinds plan) |
| Containers spine C0–C5 + R1/R1b + R2 | **Done** |
| Selection **S1–S2** | **Done** (elevated ops) |
| Selection **S3** kit chords | After Wayland smoke |
| Desktop keybinds plan | **New** — [forge-desktop-keybinds.md](./plans/forge-desktop-keybinds.md) |
| Wayland live thrash + selection | **Next session** (operator logs into Wayland) |

## Next agent — Wayland session first

1. Operator: log out of X11 (`:1`), log into **GNOME Wayland** on black.  
2. Stay on **`plan/forge-first-class-containers`**; merge **`master` → feature** if master moved.  
3. `./install` (debug) so extension + CLI match branch.  
4. Enable logging:

   ```sh
   SCHEMA_DIR=~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas
   gsettings --schemadir "$SCHEMA_DIR" set org.gnome.shell.extensions.forge logging-enabled true
   gsettings --schemadir "$SCHEMA_DIR" set org.gnome.shell.extensions.forge log-level 5
   ```

5. **Thrash matrix (Wayland):**  
   - `forge layout dev`  
   - Lock with **Super+Delete** (GNOME media-keys; no Forge DPMS force)  
   - Wait until panels actually sleep if they do on Wayland; unlock  
   - Compare `forge tree` topology (dual-head TABBED bags intact?)  
   - Journal: `lock-screen thrash guard on` → unlock → `workareas-soft-rehome`  
   - Note: Wayland has no `xset`; blank is compositor-owned.

6. **Selection smoke (Wayland):** same RunSteps as X11 (below); optional bind i3 kit for Super+a parent.  

7. After Wayland OK: **S3** selection kit binds → then **KB0** Safe dual-lock (desktop-keybinds plan).

## Soft-rehome (2026-08-04) — what shipped

| Piece | Behavior |
| --- | --- |
| Lock-screen thrash guard | On `unlock-dialog` (checked **before** parentMode=user): freeze last-good, hold thrash pending, **no settle until unlock** |
| Post-rehome cooldown | Sliding **3s**; thrash pending stays true; late workareas re-extend |
| Fingerprint re-arm | If mon geometry moves during 300ms debounce, re-queue settle |
| Zero monitors | Never clear thrash pending |
| Super+Delete | **GNOME** `media-keys.screensaver` = Super+Delete while Forge enabled (frees Super+L). No `xset dpms force off`. |

**X11 live proof:** lock + DPMS Off ~24s → topology unchanged (3|4 both TABBED).
**X11 product path (2026-08-04):** GNOME `ScreenSaver.Lock` (Super+Delete media-keys; Forge does not own lock) → **Monitor is Off** without xset; unlock ~15s; topology **identical**; journal: thrash guard on → settle on unlock. Artifacts: `/tmp/forge-lock-thrash-20260804/gnome-owned-lock/`.  
**Artifacts:** `/tmp/forge-lock-thrash-20260804/`.

### Design notes (lock ownership)

- Vanilla GNOME/Ubuntu: **X DPMS timeouts often 0**; Mutter/gsd owns blank on lock/idle — not “someone disabled DPMS” via xset.  
- Forge should **not** own lock or force DPMS. Only rebind Super+L → Super+Delete for focus-right.  
- Optional Forge `prefs-lock-screen` left **unbound** (loginctl fallback if user binds it).

## Selection live (X11, 2026-08-04)

Via `forge run-steps` (focus-parent unbound on Safe/Vim; i3 has Super+a):

| Check | Result |
| --- | --- |
| focus → focus-parent | OK (`attach: parent`) |
| elevated layout-cycle group TABBED↔STACKED | **OK** mon0 tab bag |
| focus-parent when already elevated under mon | `no focus parent` — **expected** (can't climb past MONITOR) |
| focus-child after elevate | OK (`attach: child`) |
| RunSteps `swap` after elevate | **Does not** swap CON unit — swaps leaf windows (CLI path not S2-aware). Keyboard Move/Swap use `resolveMoveUnit` (unit path). |
| mon1 after thrash recover | Occasional nested HSPLIT residual from Mode B; `forge layout dev` usually heals |

**Not fully keyboard-exercised:** S3 unbound on current kit. Wayland should re-run smoke + try i3 kit parent key if available.

### Useful RunSteps

```bash
forge layout dev
forge run-steps '[{"op":"focus","selector":"title~=Grok"},{"op":"focus-parent","selector":"focus"},{"op":"layout-cycle","axis":"group","selector":"focus"}]'
forge tree
```

## Key code map

| Concern | Path |
| --- | --- |
| Soft rehome / lock guard | `lib/extension/soft-rehome.js` |
| Session mode lock first | `extension.js` `_onSessionModeChanged` |
| GNOME Super+Delete lock | `lib/shared/gnome-overrides.js` `screensaver` |
| Conflict scan | `lib/shared/keybind-conflicts.js` + prefs Keyboard |
| Prefs Keyboard | `lib/prefs/keyboard.js` |
| Selection pure helpers | `layout-unit.js` |
| Elevated keyboard ops | `command.js` Move/Swap/Layout/Ungroup |
| Bag chrome | `decoration.js` `.window-selection-border` |
| S3 task | `agents/tasks/forge-container-selection_s3-kit-bindings.md` |
| Desktop keybinds plan | `agents/plans/forge-desktop-keybinds.md` |

## Human blockers

None hard. Operator must switch session for Wayland.

## Commits on feature (approx)

- thrash guard + multi-machine races + GNOME-owned lock (no DPMS force)  
- docs: product GNOME lock retest; PRIORITY + desktop-keybinds plan  

## Plans

| Plan | Next |
| --- | --- |
| Wayland thrash (ops) | [PRIORITY](./PRIORITY.md) #1 when on Wayland |
| [forge-container-selection.md](./plans/forge-container-selection.md) | S3 after Wayland smoke |
| [forge-desktop-keybinds.md](./plans/forge-desktop-keybinds.md) | KB0 Safe Super+L+Delete; KB1 open GNOME Keyboard; KB2 conflict offer |
| [forge-first-class-containers.md](./plans/forge-first-class-containers.md) | residual mouse / Z0 after selection |
