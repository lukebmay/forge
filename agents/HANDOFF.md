# Handoff — forge (lukebmay)

**Updated:** 2026-08-05 (layout control-loop plan locked + pushed)  
**Implement on:** `plan/forge-layout-control-loop` (= `master` @ `14d4308` + plan docs)  
**Wayland residual:** `plan/forge-wayland-live` (W-storm shipped; WIP stashed — see below)  
**Default:** `master` has queue canon; do not merge wayland-live until operator smoke  
**Remotes:** `test` / `prod` **not** touched  

**Active plan:** [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md)  
**First task:** [forge-layout-control-loop_cl0-request-api.md](./tasks/forge-layout-control-loop_cl0-request-api.md)  
**Rename-only plan:** [forge-monitor-recovery-rename.md](./plans/forge-monitor-recovery-rename.md)  
**Queue:** [PRIORITY.md](./PRIORITY.md)

### Stash (do not drop)

```text
stash@{0}: WIP plan/forge-wayland-live: rival-tilers, soft-rehome, install scripts
  (unrelated to CL0 — restore only on plan/forge-wayland-live when resuming that work)
```

---

## Soft-rehome origin (fact)

| | |
| --- | --- |
| jcrussell? | **No** |
| This fork | **Yes** — H1, Luke, `a897516` (2026-07-23); later `soft-rehome.js` extract |
| Product name going forward | **monitor-recovery** (rename = separate PR only) |

---

## What just locked (design — not coded yet)

| Decision | Detail |
| --- | --- |
| Open = batch N | Single pipeline; N=1 for dock/launcher |
| Debounced layout | 150–300ms; **no** render-per-app in multi-open |
| Verify | Event-driven; **≥2** consecutive Meta↔slot agreements after commit |
| Catalog | First-open longer observe; thrashy classes (Ghostty) extra verify |
| Sensors vs apply | Track client response to our `move_resize_frame`; suppress self-noise |
| X11 | Same control loop; **no** session-backend split in this plan |
| 5s rescan | Debug gsetting only; default off |
| Ghostty truth | Post-map **resize**, not self-move |

**First task:** [forge-layout-control-loop_cl0-request-api.md](./tasks/forge-layout-control-loop_cl0-request-api.md)

---

## Live Wayland status (prior)

| Layer | Status |
| --- | --- |
| W-storm render guards | Shipped on wayland-live — logout smoke |
| Borders | Hardened — still needs clean smoke |
| monitor-recovery thrash (W4) | Not done on Wayland |
| Control loop (CL*) | **Plan ready** — implement next major reliability path |

If Forge vanishes after crash: `gsettings get org.gnome.shell disable-user-extensions`.

---

## Operator / next agent

1. Prefer finish short Wayland border smoke if still dirty on disk, **or** start CL0 on new branch from up-to-date master (merge wayland-live if needed).
2. **Do not** mix monitor-recovery rename into CL commits.
3. Implement CL0 → CL1 → CL2 → CL3 → CL4 (sole Ghostty live gate).
4. After CL4: sole Ghostty open must show frame ≈ slot (no full red ring / small window).

### Glossary quick ref

| Term | Meaning |
| --- | --- |
| Mutate tree | In-memory topology only |
| Render / commit | Slots + `move_resize_frame` |
| Verify | Meta frames vs slots |
| Rebuild | `reloadTree` nuclear |
| Monitor-recovery | Workareas thrash (was soft-rehome) |

Logging (debug install):

```sh
gsettings set org.gnome.shell.extensions.forge logging-enabled true
gsettings set org.gnome.shell.extensions.forge log-level 4
```
