# Handoff — forge (lukebmay)

**Updated:** 2026-08-08 (post-reboot displays + cold topology plan)  
**Branch:** `master` (cold work → create `plan/forge-layout-cold-topology`)  
**Session type for next operator login:** **Wayland** (daily driver; tip install already on disk)

---

## Start here

| Pri | Work | Path |
| --- | --- | --- |
| **P0** | **Cold layout topology (design → one-shot)** | [plans/forge-layout-cold-topology.md](./plans/forge-layout-cold-topology.md) · task [CT0](./tasks/forge-layout-cold-topology_ct0-design.md) |
| mid | DnD plan branch merge when ready | `plan/forge-dnd-drop-zones` |
| shellrc | gdisplays multi-config duals (no login ensure) | shellrc `bdb2ccc` + follow-up strip ensure |

---

## What just happened (reboot incident)

1. **Displays:** DRM connector renumber (hybrid AMD/NVIDIA) + single-config user `monitors.xml` → Mutter 1.25 fallback; greeter X11 duals/primary drift.  
2. **gdisplays:** User XML now writes **canonical + live + history duals**; load applies non-persistently so Mutter cannot wipe multi-config. **Login ensure/autostart removed** (hostile; not product).  
3. **Forge session-layout:** Correctly discarded post-reboot (by design).  
4. **`forge layout dev`:** First pass Mode B partial; 2–3 passes reached correct tree. **Not** settle-thrash regression — cold topology construction order.

### Current desk (after recovery)

```text
mon0: tab(chrome, Grok) | ghostty
mon1: ghostty | tab(YouTube, Gmail, Voice)
```

### Operator after Wayland reload

1. Confirm scale 1.5 / primary left (`gdisplays --status`). If wrong: `gdisplays load default` then optional `gdisplays --user-to-login` (greeter primary = **user** primary, scale=1 duals).  
2. Do **not** expect login autostart.  
3. Next agent work: **CT0 design lock** for cold layout — not a second-pass Mode B patch.

---

## Cold Mode B — architectural read (for CT0)

| Layer | Role |
| --- | --- |
| Apply-contract thrash | Residual geom after place — **done** |
| Mode B thrash-recover | Mid-session chaos — keep for true thrash only |
| Cold path | Must **skeleton-first, then bind**; no thrash recover mid-batch |

Agree: tree **shape** should not race async maps; async is for **bind/place** to slots only.

---

## gdisplays (shellrc) product direction (not forge)

Friendly helper, not greeter-fighting daemon:

- Multi-config duals on **user** XML (append/union renumber variants) — in place.  
- Greeter: write-through on intentional load/set; primary follows **user** primary; scale=1 duals for GDM.  
- Keep X11+Wayland duals; keep NVIDIA-class renumbers for other users.  
- No login ensure / autostart.

---

## Open human blockers

- hard: resize-autotile-design  
- soft: none for this incident  

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
- Plan code on `plan/<plan>` · queue docs on default branch after wrap-up  
