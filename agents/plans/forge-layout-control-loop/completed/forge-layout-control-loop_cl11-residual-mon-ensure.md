# Task: forge-layout-control-loop_cl11-residual-mon-ensure

**Status:** done  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05  
**Replaces live-only CL11:** operator retest found residual never mon-splits after open.

## Operator symptom (CL11 live fail)

1. Closed all but Ghostty → `forge layout dev`.
2. Apps opened on correct mons but **fullscreen mon-root TABBED** (not profile hsplit).
3. No soft dim (chrome opt-in default off — expected unless gsetting on).
4. Deferred hide did not feel like background open (apps still focused/visible).
5. Residual never produced final tree: mon0/mon1 stayed TABBED with all roles as mon-direct kids.

Live tree after fail (confirmed):

```text
mo0 TABBED: chrome New Tab | ghostty | Grok   (full workarea each)
mo1 TABBED: ghostty | YouTube | Voice | Gmail
```

Dry-run residual on that forest: **structure only** (tab ensure for mon0.s0 / mon1.s0) + focus — **zero mon-level ensure_layout hsplit**.

## Root cause (confirmed)

After parallel open, residual `plan_reconcile` claims all roles as **`reused`** (windows already exist).  
Mon-level HSPLIT is gated:

```python
has_role_placement = counts["opened"] > 0 or counts["moved"] > 0
# mon ensure only if has_role_placement
```

`just_opened_roles` is only used for focus survivor logic — **not** mon ensure / `mons_with_placement`.

So residual after open-all: structure tab groups only → mon stays TABBED fullscreen.

Secondary: re-apply without opens (current desk thrash) also skips mon ensure when structure-only — same gap for repair.

## Deferred hide / unfocused open (research + harden)

| Approach | Reality on GNOME 46 X11/Wayland |
| --- | --- |
| Opacity 0 on compositor actor | Best-effort visual hide; actor may be late/null at track; client map can restore opacity |
| Skip raise/activate in Forge | Already for deferred; **apps still call present** — Mutter often grants focus |
| True “open unfocused” API | **No reliable general API** for arbitrary GTK/Chrome apps |
| Minimize | Hides but overview/taskbar noise; not preferred for layout batch |
| Apply chrome dim (CL10) | Opt-in gsetting; default **false** — not the same as hide |

**Product stance:** keep deferred opacity hide + no raise; re-hide on late actor; document limits. Do not claim true background focus-steal prevention without Mutter cooperation.

## Acceptance

1. **Planner:** residual after open (all roles claimed + `just_opened_roles` set) emits mon-level `ensure_layout` hsplit for mon0/mon1 when profile wants split and live mon is wrong / flat tabbed.
2. **Planner:** structure-only repair (no open/move, no just_opened) still emits mon ensure when mon layout/children disagree with profile (current thrash desk).
3. **Order:** tab/stack structure ensures for mon children should run **before** mon-level hsplit/vsplit so mon kids become `[tab CON, ghostty]` then mon split (not 3-way equal then tab). Adjust `final_actions` / ensure list order if needed.
4. **Tests:** pytest covers (a) just_opened residual mon ensure, (b) structure-only mon repair on flat TABBED mon matching operator forest shape.
5. **CLI (optional small):** after `release-deferred`, reload forest before residual plan (stale FLOAT forest is OK for paths; prefer fresh).
6. **Hide harden (small):** re-apply hide when deferred actor appears late; unit test pure helpers if new pure API.
7. Full `python3 -m pytest tests/unit/cli/ -q` + `npm test` green (or scoped if timeout; note counts).
8. Session note; local commit; **no push**.

## Non-goals

- Soft-rehome rename.
- Wayland residual (after this X11 path green).
- Default-on apply chrome.
- Perfect unfocused app launch for all clients.

## Files likely

| Path | Change |
| --- | --- |
| `scripts/forge/layout_plan.py` | mon ensure gate + order |
| `tests/unit/cli/test_layout_plan.py` | operator-shaped residual cases |
| `scripts/forge/forge` | optional forest reload after release |
| `lib/extension/layout-deferred-open.js` + `window.js` | hide re-apply if needed |
| plan/task notes | session overwrite |

## Session note

**2026-08-05 A/B AGREE**

### Shipped
1. **Mon ensure residual** — `just_opened_roles` + `_mons_with_split_mismatch` (TABBED mon vs profile hsplit); structure ensure **before** mon hsplit.
2. **`compare_layout_structure`** — pure profile tree vs live GetTree (role-mon, mon-layout, group). Plan returns `structureMatch` / `structureMismatches`. FIRM tests: mismatch ⇒ not nothingToDo; match ⇒ no ensure_layout.
3. **CLI** — residual replan reloads forest after release-deferred.
4. **Hide** — re-apply deferred hide when actor late / opacity restored.
5. **B fix** — `--safe` + just_opened must not force has_work.

### Tests
pytest CLI **372**. Deferred-open vitest green.

### Operator
Live dry-run now plans mon0/mon1 hsplit + tab structure. Re-run `forge layout dev` (or residual) to apply.

### Unfocused open
No reliable Mutter API; opacity + no raise only. Apply chrome remains opt-in.
