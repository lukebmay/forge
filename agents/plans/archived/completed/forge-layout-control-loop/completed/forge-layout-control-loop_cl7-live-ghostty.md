# Task: forge-layout-control-loop_cl7-live-ghostty

**Status:** done — **X11 pass green** (Wayland residual = next session, separate)  
**Owner:** human / operator (live on black) + agent docs wrap  
**Plan:** [forge-layout-control-loop.md](../../forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop` (tip includes `fe8448c` PWA open/wait + control loop CL0–CL6)  
**Created:** 2026-08-05  
**Completed:** 2026-08-05  
**Handoff:** [HANDOFF.md](../../../HANDOFF.md)

## Goal

Live smoke on **black**: sole Ghostty open frame ≈ slot; border matches; multi-open /
`forge layout dev` no mid-batch thrash and **no Chrome PWA wait timeout**.

## Session strategy

| Pass | When | Result |
| --- | --- | --- |
| **1. X11** | GNOME on Xorg (HUP-friendly) | **Green** — operator confirmed 2026-08-05 |
| **2. Wayland** | After merge / residual session | **Open** — logout pass only |

## Acceptance (operator / live)

1. [x] Checkout + debug install from control-loop branch (`./install --dev`)
2. [x] Logging available when useful (`logging-enabled` / `log-level 4`)
3. [x] Sole Ghostty / layout path: frames settle to slots (no stuck desync reported)
4. [x] Multi-open path settles (control-loop intentional settle — slightly slow OK)
5. [x] `forge layout dev` on **X11**:
   - [x] No `open failed role='Grok': wait timeout after 15000ms` (or other PWA)
   - [x] mon0: TABBED Google-chrome (New Tab) + Grok | ghostty
   - [x] mon1: ghostty | TABBED YouTube, Google Voice, Gmail
   - [x] Layout stable (opened everything; no mid-batch thrash failure)
6. [x] Session recorded as **X11**; displays fixed 150%; `gdisplays save default` + login apply done by human

## Already fixed in code (do not re-debug unless live fails again)

Live failure on Wayland after sole Ghostty: Grok wait timeout because sugar
`Google-chrome` discarded desktop `chrome-<id>-Default` / `crx_*` hints; open
loop aborted remaining roles. Fix: `fe8448c` — see completed
[cl7-pwa-open-wait](./forge-layout-control-loop_cl7-pwa-open-wait.md).

## Agent note

Agents do **not** claim this done without operator confirmation of the live bar.
**X11 bar confirmed by operator 2026-08-05.** Wayland residual remains after merge.

## Session note

**2026-08-05 — CL7 X11 live green (operator):**

| Fact | Detail |
| --- | --- |
| Session | `XDG_SESSION_TYPE=x11` |
| Displays | Fixed **150%** scale; `gdisplays save default` + `gdisplays --user-to-login` (human) |
| Install | Debug install matches plan tip (`layout-controller.js`, `place-hint.js`) |
| `forge layout dev` | Opened everything successfully; **slightly slow** (intentional control-loop settle) |
| Tree mon0 | TABBED Google-chrome (New Tab) + Grok \| ghostty |
| Tree mon1 | ghostty \| TABBED YouTube, Google Voice, Gmail |
| PWA wait | No Grok/Chrome 15s timeout |
| Wayland | Residual still open; WIP stashed on wayland-live — do not pop onto this branch |

**Next:** merge `plan/forge-layout-control-loop` → `master` (local; no push unless asked), then Wayland residual smoke (logout).
