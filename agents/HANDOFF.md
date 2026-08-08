# Handoff — forge (lukebmay)

**Updated:** 2026-08-08 (CT1 code done; next = CT2 Wayland live)  
**Branch:** `plan/forge-layout-cold-topology` (merge to master after wrap-up)  
**Sessions:** **Wayland and X11 are both daily drivers** (X11 on older machines)

---

## Start here

| Pri | Work | Path |
| --- | --- | --- |
| **P0** | **CT2** Wayland live one-shot cold layout | [CT2](./tasks/forge-layout-cold-topology_ct2-wayland-live.md) |
| → | CT3 X11 live (required parity) | [CT3](./tasks/forge-layout-cold-topology_ct3-x11-live.md) |
| post | Cleanup dead cold fallbacks (after live green) | [cleanup](./tasks/forge-layout-cold-topology_cleanup-fallbacks.md) |
| shellrc | gdisplays session/greeter (GS0+) | `~/dev/me/shellrc/agents/plans/gdisplays-session-greeter.md` |

---

## Architecture lock (do not re-litigate)

| Topic | Decision |
| --- | --- |
| Settle thrash (AC1–AC6) | Done — residual geom = echo |
| Cold Mode B second pass | **Not** the product fix — skeleton-first one-shot |
| Thrash mid-batch | Forbidden while layout ops in flight |
| Tree shape vs bind | Shape first; async bind to slots OK |
| Skeleton mechanism | Slot-tagged AC4 placeholders (CT0 approved; **CT1 implemented**) |
| X11 | Daily driver parity (CT3), not optional |
| Cleanup | After CT2/CT3: remove cold fallbacks that architecture makes dead |

---

## CT1 shipped (code)

| Piece | Detail |
| --- | --- |
| Plan | `ensure_skeleton` on cold empty; `bind` when layoutRole PHs present |
| Apply order | skeleton → role move → bind → residual close/park → layout/order/size/focus |
| Extension | RunSteps `skeleton`/`bind`; `_layoutBindPending` lifecycle |
| Cold thrash | Report-only; no Mode B park mid-batch |
| postOpenRetry | Off by default; `FORGE_LAYOUT_POST_OPEN_RETRY=1` only |
| Units | 290 plan/apply + 97 JS |

---

## CT2 live (next — operator; not A/B coding)

1. Debug install: `./install` (production=false).  
2. Logging on:
   ```sh
   gsettings set org.gnome.shell.extensions.forge logging-enabled true
   gsettings set org.gnome.shell.extensions.forge log-level 4
   ```
3. Cold desk → **one** `forge layout dev` → dual-mon tabs correct **without** Mode B / second pass.  
4. Settled re-run → nothing to do.  
5. Stop at failures; session-layout-trace / `forge tree` for diagnosis.  
6. Do **not** start cleanup-fallbacks until CT2+CT3 green.

**Key paths:** `layout_plan.py`, `layout_apply.py`, `scripts/forge/forge`
`_layout_run_reconcile`, `run-steps.js`, `session-api.js`,
`layout-placeholder.js` / `tree.js`.

---

## Operator after login

1. `gdisplays --status` — if scale wrong: `gdisplays load default`  
2. Greeter wrong: `gdisplays --user-to-login` until GS2 write-through ships  
3. Agent/operator: **CT2** live on Wayland

---

## Open human blockers

- hard: resize-autotile-design (P3 — unrelated to cold layout)

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
