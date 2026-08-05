# forge (lukebmay) — active priorities

**Updated:** 2026-08-05 (layout dev OK; border harden; stable gate before session split)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

## Priority order (locked 2026-08-04)

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Border smoke + Wayland thrash** | Layout OK; borders must be clean before session-backend refactor |
| **2** | **Container selection finish** | S3 kit binds → S5 live QA; product mid-wave (S2 elevated ops already shipped) |
| **3** | **Desktop keybinds** | Manage GNOME chords (not own); Safe dual-lock; conflict offer; open GNOME Keyboard button |

**If operator is on Wayland:** finish **1** before more product code or the session split.  
**If still on X11** and not switching: **2** can proceed; thrash already OK on X11 product lock path.

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **Logout + border re-smoke** | New border registry code; no leftover outlines after focus/resize/layout | [HANDOFF](./HANDOFF.md) |
| **2** | **Wayland thrash (W4)** | Super+Delete lock → unlock; `forge tree`; journal | After borders green |
| **3** | **Session-backend plan** | Draft `session/{wayland,x11}` — **approve before code** | After thrash; major redesign |
| **4** | **CON selection S3** | Vim Super+p + BackSpace clear multi-bind + cheatsheet | [plan](./plans/forge-container-selection.md) |
| **5** | **KB1+** | Open GNOME Keyboard button; conflict offer (KB2) | after S3; [desktop-keybinds](./plans/forge-desktop-keybinds.md) |

**Shipped recently**

| Item | Note |
| --- | --- |
| Wayland W1–W5 + W3b | sizes, PlaceNext/PWA, Guake, cross-mon move — `plan/forge-wayland-live` |
| **Border harden (W3c)** | registry + node ownership + slot prefer — **logout smoke** |
| Soft-rehome lock+DPMS | X11 product GNOME lock OK |
| Selection S1–S2 | Elevated ops + bag chrome |
| **KB0** kit-aware GNOME lock | Safe Super+L+Delete; Vim/i3 Delete only |

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
