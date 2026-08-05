# Task: forge-layout-control-loop_cl7-live-ghostty

**Status:** ready — **X11 first**  
**Owner:** human / operator (live on black); agent may drive retests on X11 via HUP  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop` (tip includes `fe8448c` PWA open/wait)  
**Created:** 2026-08-05  
**Handoff:** [HANDOFF.md](../HANDOFF.md)

## Goal

Live smoke on **black**: sole Ghostty open frame ≈ slot; border matches; multi-open /
`forge layout dev` no mid-batch thrash and **no Chrome PWA wait timeout**.

## Session strategy

| Pass | When |
| --- | --- |
| **1. X11** | **Now** — GNOME on Xorg so `./install` / HUP reloads without logout |
| **2. Wayland** | After X11 green — one logout pass for residual only |

## Acceptance (operator / live)

1. Checkout + debug install from control-loop branch:
   ```sh
   cd ~/dev/me/forge
   git checkout plan/forge-layout-control-loop
   ./install --dev
   ```
2. Enable logging if useful:
   ```sh
   gsettings set org.gnome.shell.extensions.forge logging-enabled true
   gsettings set org.gnome.shell.extensions.forge log-level 4
   ```
3. Sole Ghostty on mon0: window frame fills correct tile; border not full-ring/small-client desync.
4. Second Ghostty / thrashy resize still settles.
5. `forge layout dev`:
   - No `open failed role='Grok': wait timeout after 15000ms` (or other PWA)
   - mon0: chrome + Grok | ghostty; mon1: ghostty-2 | YouTube / Gmail / Voice
   - No render-per-open flood; layout stable
6. Record session (**prefer X11 this pass**) and any residual in plan/HANDOFF.

## Already fixed in code (do not re-debug unless live fails again)

Live failure on Wayland after sole Ghostty: Grok wait timeout because sugar
`Google-chrome` discarded desktop `chrome-<id>-Default` / `crx_*` hints; open
loop aborted remaining roles. Fix: `fe8448c` — see completed
[cl7-pwa-open-wait](../plans/forge-layout-control-loop/completed/forge-layout-control-loop_cl7-pwa-open-wait.md).

## Agent note

Agents do **not** claim this done without operator confirmation of the live bar.
On **X11**, agents may reinstall + HUP and re-run `forge layout` when the human
authorizes live smoke. On Wayland, reload needs logout.

## Session note

**2026-08-05 handoff:** Code ready (`fe8448c` + CL0–CL6). Live retest **not**
done. Next human: switch black to **X11**, install, sole Ghostty → `forge layout
dev`. Strategy: iron X11 first, Wayland last.
