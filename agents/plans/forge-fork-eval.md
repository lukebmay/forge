# Plan: Evaluate Forge fork (quick wins, decide later fork)

**Status:** Phase B install done — daily-driving **jcrussell-based** tree.  
**Priority:** P1 next = **official personal fork** (identity); spike wrap is P2  
**Repo (this tree):** `~/dev/me/forge_jcrussell` → remote still `jcrussell/forge` (not Luke’s fork yet)  
**GNOME host:** `black`, **X11**, dual 4K, Shell **46**, uuid `forge@jmmaranan.com`  
**After trial product plan:** [forge-harden-and-session.md](./forge-harden-and-session.md), [forge-command.md](./forge-command.md)  
**Next:** [personal-fork task](../tasks/forge-fork-eval_personal-fork.md) — GitHub fork + lineage ≠ jcrussell

**Completed:** Phase A comparison + import from shellrc; product work on this tree  
**Completed task files:** `agents/plans/forge-fork-eval/completed/` *(none yet — spike still open)*

### Session note (2026-07-25)

**Need official personal fork.** Tooling/docs still say “jcrussell” for Luke’s
install path. Three-way map: EGO (`forge-ext`) / community **jcrussell** /
**Luke** (this work, not forked on GitHub yet). Task:
[forge-fork-eval_personal-fork.md](../tasks/forge-fork-eval_personal-fork.md).

---

## Next session (start here)

**Goal:** Official personal fork + lineage identity (not another Phase A).

| Step | Action | Notes |
| --- | --- | --- |
| 0 | Read [personal-fork task](../tasks/forge-fork-eval_personal-fork.md) | Lock GitHub name + lineage id with Luke if needed |
| 1 | Create GitHub fork; set `origin` / `upstream` | Push this `master` |
| 2 | Lineage + install-origin distinguish Luke vs jcrussell vs EGO | Minimal script/doc pass |
| 3 | Smoke status / install origin | Close task → completed/ |

**Earlier goal (mostly done):** Install jcrussell-based tree, smoke dual-head, blank/wake.

| Step | Action | Notes |
| --- | --- | --- |
| 0 | Read this plan + [spike](../tasks/forge-fork-eval_spike.md) | Do not re-do Phase A |
| 1 | Confirm still on `black` / X11 / dual head | `gdisplays --status` or load `default` if layout wrong |
| 2 | **Backup** installed extension + config | `./scripts/forge/save-settings.zsh` (or full `switch-to-jcrussell.zsh`); currently **EGO upstream v89** |
| 3 | Ensure **Node 20+** then `npm install` in this tree | Host now has **Node 24** available; still need `node_modules` before first `make dev` |
| 4 | Install trial: **`make dev`** / `./scripts/forge/install-jcrussell.zsh` | Prefer `./scripts/forge/switch-to-jcrussell.zsh` (save→install→apply) |
| 5 | Log out / log in (X11 may need more than `Alt+F2 r`) | Then `./scripts/forge/status.zsh` / enable if needed |
| 6 | Smoke checklist (below) | Record pass/fail on spike task |
| 7 | Phase C: blank → wake → retab stress | Journal if crash |
| 8 | Write daily-driver recommendation + rollback note | Close spike → `plans/forge-fork-eval/completed/` when done |

**Defaults locked for trial (open questions closed):**

1. **Install method:** build-from-source — `make dev` from this tree.  
2. **UUID:** keep `forge@jmmaranan.com` (replace in place; backup first).  
3. **Session type:** X11 only for this trial (matches daily use).  
4. **gdisplays:** keep using independently; v1 remap already shipped.

**Do not:** re-compare to `forge_original`, or open gdisplays v2 unless display pain is separate.  
**Do:** create the **personal fork** now ([task](../tasks/forge-fork-eval_personal-fork.md)) — Phase A “not yet” is obsolete.

---

## Goal

1. Decide whether **jcrussell/forge** (this tree) is a better base than upstream **forge-ext/forge**. → **Yes (Phase A)**  
2. Install/test with **minimal risk** to the current session workflow. → **next**  
3. Identify **quick wins** (config, prefs, small patches) without owning a long-term personal fork yet.  
4. Capture a clear **go / no-go / wait** for a personal fork later.

**Non-goals:** full rewrite, EGO publish, taking over `forge-ext`, large multi-monitor redesign unless a tiny patch is obviously safe.

---

## Why we care

Forge keeps GNOME niceties while providing i3/sway-like tiling. Daily pain on `black`:

- Multi-monitor after display blank / reattach: tiles smooshed onto one monitor.  
- Restoring tabbed/stacked layout afterward → **GNOME Shell crash** (logout required).  
- Keybinding quirks / multi-monitor oddities.  
- Upstream maintenance uncertainty.

### gdisplays / hybrid (context only)

Connector renames were **not** Forge’s fault (AMD iGPU + NVIDIA hybrid, mobo USB4 left + HDMI right). Sequence: rename → stale monitors.xml/primary → windows collapse → Forge retab on damaged tree → crash. gdisplays v1 reduces stress; Forge must still survive `workareas-changed` / thrash without crashing.

---

## Host inventory (captured 2026-07-16)

| Fact | Value |
| --- | --- |
| Host | `black` |
| GNOME Shell | **46.0** (fork metadata supports 45–50 — OK) |
| Session | **X11** (`DISPLAY=:1`) |
| Installed extension | `~/.local/share/gnome-shell/extensions/forge@jmmaranan.com` |
| Installed lineage | **EGO / SweetTooth**, **version 89**, url `forge-ext/forge`, shell-version ≤49, `extension.js` matches upstream size (~4k, Dec 2025) |
| User config | `~/.config/forge/{config,stylesheet}` present |
| This tree deps | **Node 18.19.1** on host (project wants **20+**); **`node_modules` absent** — install before `make dev` |
| Enabled | `forge@jmmaranan.com` is currently enabled |

---

## Phase A — Codebase comparison (done 2026-07-16)

| | Upstream (`forge_original`) | This fork |
| --- | --- | --- |
| Maintenance | Seeks maintainer; README points here | Active mid-2026 |
| Tests | None (prettier-as-test) | Vitest + Docker E2E + fuzz |
| Multi-mon / tabs | Basic | Hardened lifecycle, monitor-skip, workarea guards |
| Docs / modules | Thin monolith | Extracted managers + `docs/` |

**Phase A recommendation (locked):**

| Decision | Choice |
| --- | --- |
| **Base for work** | **This tree** — not `forge_original` |
| Daily driver | After successful Phase B/C (or stay on EGO v89 until then) |
| Personal long-term fork | **Not yet** |
| gdisplays | Independent; v1 already done |

Full comparison detail remains in git history of this plan / session notes if needed; do not re-run Phase A.

---

## Phase B — Safe install trial

1. `./scripts/forge/switch-to-jcrussell.zsh` (or manual save / install-jcrussell / apply — see `scripts/forge/README.md`).  
2. Log out/in; `./scripts/forge/status.zsh` (lineage should be `jcrussell`).  
3. Smoke checklist.  
4. Rollback = `./scripts/forge/rollback.zsh` or `./scripts/forge/switch-to-ego.zsh`.

**2026-07-22:** Migration scripts landed; **manual switch completed** on black → jcrussell `v49-90-beta.2` ACTIVE; 56 dconf keys + windows.json preserved; backup `switch-jcrussell-manual-20260722-163828`. Scripts updated (build-before-uninstall). Next: Phase C smoke/stress.

## Phase C — Stress path

1. `gdisplays load default` (or equivalent) so dual head is correct.  
2. Tile on **both** monitors; tabbed stack on one.  
3. DPMS blank / activity blank.  
4. Wake; note placement.  
5. Retab/restack — **must not crash shell**.  
6. Optional: primary flip / mild topology change if safe.  
7. On crash: `journalctl --user -b /usr/bin/gnome-shell` excerpt on spike task.

## Phase D — Decide after trial

| Outcome | Next step |
| --- | --- |
| Better, no crash | Daily-drive this fork; track jcrussell; no personal fork yet |
| Better, still crash | Issue upstream to jcrussell; optional tiny local patch |
| Worse / unstable | Restore EGO v89 backup; reassess |
| Config-only wins | Document prefs; stay on chosen build |

---

## Smoke checklist

- [ ] Extension enables without error on login  
- [ ] Tiling on left (USB4/DP) and right (HDMI) independently  
- [ ] Focus nav hjkl + arrows across monitors  
- [ ] Tabbed + stacked create/destroy without crash  
- [ ] Drag-drop tile preview OK  
- [ ] Floating rules for known apps still OK  
- [ ] After DPMS blank/wake: windows not permanently lost; **no shell crash on retab**  
- [ ] Keybinding cheatsheet (`Super+Shift+/`) works  
- [ ] Prefs save and survive logout  

---

## Task breakdown

| ID | Task | Scope | Status |
| --- | --- | --- | --- |
| **1** | [forge-fork-eval_spike.md](../tasks/forge-fork-eval_spike.md) | Phase A done; B/C/D next | **In progress** |
| **2** | `forge-fork-eval_quickwins.md` *(later)* | Config tweaks / minimal patches | Blocked on 1 + go-ahead |

---

## Acceptance (plan-level)

- [x] Written comparison: upstream vs jcrussell  
- [x] Base recommendation: **start from jcrussell fork**  
- [x] Plan/task home is this repo (not shellrc)  
- [ ] Install trial completed **or** blocked with reason  
- [ ] Incident path retested  
- [ ] Daily-driver recommendation after live trial  
- [ ] Rollback path verified if install happened  

---

## Session notes

**2026-07-16 (shellrc):** Plan filed from incident; no install.

**2026-07-16 (this repo):** Plan imported; Phase A vs `forge_original` complete; **base = jcrussell**. Shellrc stubs point here. Host inventory: Shell 46 / X11 / EGO v89 installed / Node 18 needs upgrade for build. **Next session starts at Phase B** (backup → Node 20 → `make dev` → smoke → blank/wake).
