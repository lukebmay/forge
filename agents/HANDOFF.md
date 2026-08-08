# Handoff — forge (lukebmay)

**Updated:** 2026-08-08 (CT2 fix: belt focus + lastTabFocus; logout re-smoke)  
**Branch:** `plan/forge-layout-cold-topology` (merge to master after wrap-up)  
**Sessions:** **Wayland and X11 are both daily drivers** (X11 on older machines)

---

## Start here

| Pri | Work | Path |
| --- | --- | --- |
| **P0** | **CT2** — code fix shipped; **logout + cold re-smoke** | [CT2](./tasks/forge-layout-cold-topology_ct2-wayland-live.md) |
| → | CT3 X11 live (required parity) | [CT3](./tasks/forge-layout-cold-topology_ct3-x11-live.md) |
| post | Cleanup dead cold fallbacks (after live green) | [cleanup](./tasks/forge-layout-cold-topology_cleanup-fallbacks.md) |
| shellrc | gdisplays session/greeter (GS0+) | `~/dev/me/shellrc/agents/plans/gdisplays-session-greeter.md` |

### CT2 fix (2026-08-08) — operator logout then cold smoke

**Bug:** mon0 tab showed Chrome not Grok; partial reopen thrashed.  
**Cause:** post-open belt re-`ensure_layout` (anchor=chrome) without focus; stomped active leaf.  
**Fix:** belt includes focus; `_layoutOp` preserves valid lastTabFocus; chrome-clear after residual (D010/D011).  
**Live:** partial close Grok → layout → Grok open leaf OK (CLI).  
**You:** log out (Wayland install) → cold `forge layout dev` → confirm mon0 Grok open + dual-mon tabs; second run moved 0.

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

## Regression fixed this session

| Issue | Fix |
| --- | --- |
| Apply chrome ended too early on cold Wayland | CLI `chrome-clear` **after residual** (D010) |
| mon0 Chrome open instead of Grok; partial thrash | Belt re-focus after ensure; `_layoutOp` preserves lastTabFocus (D011) |

## CT2 live (operator re-smoke after logout)

Code + `./install` done. Wayland needs **logout** for extension half (CLI belt focus is already live).

1. Log out → Wayland back.  
2. Optional logging:
   ```sh
   gsettings set org.gnome.shell.extensions.forge logging-enabled true
   gsettings set org.gnome.shell.extensions.forge log-level 4
   ```
3. Cold/near-cold → **one** `forge layout dev` → mon0 tab **Grok** open \| ghostty; mon1 ghostty \| YT tabs.  
4. Settled re-run → moved 0.  
5. Optional: close Grok → layout → reopen + Grok open leaf, no layered thrash.  
6. Do **not** start cleanup-fallbacks until CT2+CT3 green.

**Key paths:** `layout_apply.py` (`belt_actions_from_plan`), `scripts/forge/forge`,
`session-api.js` `_layoutOp`, `layout_plan.py`.

---

## Operator after login

1. `gdisplays --status` — if scale wrong: `gdisplays load default`  
2. Greeter wrong: `gdisplays --user-to-login` until GS2 write-through ships  
3. **CT2 cold smoke** (above)

---

## Open human blockers

- hard: resize-autotile-design (P3 — unrelated to cold layout)

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
