# forge (lukebmay) — active priorities

**Updated:** 2026-08-04 (wayland W1–W5; logout smoke next)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

## Priority order (locked 2026-08-04)

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Wayland thrash + selection smoke** | Session switch; prove soft-rehome under compositor blank; short; gate daily-driver confidence on both sessions |
| **2** | **Container selection finish** | S3 kit binds → S5 live QA; product mid-wave (S2 elevated ops already shipped) |
| **3** | **Desktop keybinds** | Manage GNOME chords (not own); Safe dual-lock; conflict offer; open GNOME Keyboard button |

**If operator is on Wayland:** do **1** before more product code.  
**If still on X11** and not switching: **2** can proceed; thrash already OK on X11 product lock path.

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **Logout load + layout/icons smoke** | Confirm `forge ping` version; `layout dev` one-shot + icons | [HANDOFF](./HANDOFF.md) |
| **2** | **Wayland thrash** | Lock Super+Delete → unlock; `forge tree`; journal | [HANDOFF](./HANDOFF.md) |
| **2** | **Wayland selection smoke** | RunSteps elevate + layout-cycle; optional i3 Super+a | After thrash OK |
| **3** | **CON selection S3** | Vim Super+p + BackSpace clear multi-bind + cheatsheet | [plan](./plans/forge-container-selection.md) |
| **4** | **KB1+** | Open GNOME Keyboard button; conflict offer (KB2); desktop section | after S3; [desktop-keybinds](./plans/forge-desktop-keybinds.md) KB0 **done** |
| 5 | S5 live QA | Checklist A–G after S3 | selection plan |

**Shipped recently**

| Item | Note |
| --- | --- |
| Wayland W1–W5 | sizes, PlaceNext/PWA, Guake/dock, residual belt + tab icons — `plan/forge-wayland-live`; **logout/in then smoke** |
| Soft-rehome lock+DPMS | Guard + sliding cooldown + fingerprint re-arm; X11 product GNOME lock OK |
| GNOME owns Super+Delete lock | Forge does not force DPMS; `prefs-lock-screen` unbound |
| Selection S1–S2 | Elevated ops + bag chrome |
| **KB0** kit-aware GNOME lock | Safe Super+L+Delete; Vim/i3 Delete only |
| Desktop keybinds plan | [forge-desktop-keybinds.md](./plans/forge-desktop-keybinds.md) — KB1 next |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session (Wayland next) |
| [forge-desktop-keybinds.md](./plans/forge-desktop-keybinds.md) | Manage GNOME chords; Safe Super+L |
| [forge-container-selection.md](./plans/forge-container-selection.md) | S3 next product |
| [forge-layout-settle-pure.md](./plans/forge-layout-settle-pure.md) | D0 draft; user lock later |
| [forge-stacked-layouts.md](./plans/forge-stacked-layouts.md) | SL0–SL5 done; SL6 optional |

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | Wayland thrash + selection smoke | **Next when on Wayland** — [HANDOFF](./HANDOFF.md) |
| **P0** | [container selection](./plans/forge-container-selection.md) | **S2 done** — S3 next (after or parallel if X11) |
| **P1** | [desktop keybinds](./plans/forge-desktop-keybinds.md) | **KB0 done** — KB1–4 after S3 |
| P1 | [layout settle pure](./plans/forge-layout-settle-pure.md) D0 | Draft hybrid; **user lock** then PS1 |
| P1 | [first-class containers](./plans/forge-first-class-containers.md) residual | Mouse resize / Z0 after selection |
| P1 | [stacked](./plans/forge-stacked-layouts.md) | SL0–SL5 **done**; SL6 optional |
| P2 | Live layout daily-drive | Bare-array sugar live on black |
| P3 | [resize ratio/autotile](./plans/forge-resize-and-autotile.md) | Optional/parked |
| P3 | [layout-sugar](./plans/forge-layout-sugar.md) LS3/LS6 | Optional; main path **done** |

### Done recently

| Item | Note |
| --- | --- |
| Lock thrash soft-rehome | X11 GNOME ScreenSaver.Lock + panels Off → no thrash |
| Lock ownership | GNOME media-keys; no Forge DPMS |
| Selection S1–S2 | Elevated CON ops |
| LF1–LF8 layout reliability | Live OK |
| STACKED SL0–SL5 | Done |
| workon → layout rename | no BC |
