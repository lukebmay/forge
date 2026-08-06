# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (**X11 RC ready** — WS0–WS3 + CSS on master)  
**Branch tip:** `master` @ `6e210a7` (local, **ahead of origin**, not pushed)  
**Install:** `v49-90-beta.2-202-g6e210a7` · X11 · ACTIVE  
**Wayland:** ES modules need **logout** to reload — operator residual next  
**Stash:** `stash@{0}` still present — **drop only after human OK**  
**Remotes:** **no push** unless human asks  

---

## Stable RC

| Gate | Status |
| --- | --- |
| CSS dual-load + deltas | **Done** |
| Workspace scope WS0–WS3 | **Done** (merged master) |
| Unit: npm 2262 + pytest cli 424 | **Green** |
| X11 dual-ws + layout apply smoke | **Green** |
| Wayland residual | **Human** after logout |
| Session DPMS / daily layout | **Human** B-manual |
| AP5 visual matrix | **Human soft** |

| Explicitly **not** RC | Note |
| --- | --- |
| Container motion / peel | design + MD1 post-RC |
| Resize / autotile | design P3 |
| Tab chrome drag / S3+ | later |

### Just shipped (this arc)

**Layout workspace scope** — plan/claim/apply/save scoped to one workspace;
GetTree `activeWorkspace`/`nWorkspaces`; CLI sequential XOR static + preflight;
docs Workspace scope; live X11 Inkscape-on-ws2 isolation proven.

**CSS base + user overrides (D001)** — dual-load; patchCss never full-clobbers.

### Operator checklist (you)

1. **Wayland:** log out → GNOME on Wayland → [residual smoke](./tasks/forge-wayland-live_residual-smoke.md).  
2. Optional: [B-manual session](./blockers/B-manual-black-session-verify.md) (DPMS / daily layout).  
3. Optional soft: [AP5 visual](./blockers/B-ap5-operator-visual-matrix.md).  
4. When happy: push + tag RC/beta per [RELEASING.md](../RELEASING.md) (agent will not push unasked).

### Note

`gsettings` schema may need  
`GSETTINGS_SCHEMA_DIR=~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas`  
on this host (extension DBus/prefs still work). Not RC-blocking.

---

## Agent rules (reminder)

- **No push** unless human asks.  
- **No SSH** without **explicit** in the current message.  
