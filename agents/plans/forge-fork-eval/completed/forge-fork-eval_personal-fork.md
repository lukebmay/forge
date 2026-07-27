# Task — Official personal fork (distinct from jcrussell)

**Status:** Done  
**Plan:** [forge-fork-eval.md](../plans/forge-fork-eval.md)  
**Priority:** P2 (identity / ownership — low day-to-day tiling impact; see PRIORITY.md)  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-fork-eval/completed/`

## Problem

Daily work and install tooling still present this tree as **jcrussell**
(lineage string, `install-jcrussell` / `switch-to-jcrussell`, docs, remotes).
That confuses three different things:

| Layer | What it is today | Who owns it |
| --- | --- | --- |
| **Upstream EGO** | `forge-ext/forge` / SweetTooth | Upstream (seeks maintainer) |
| **jcrussell** | Community / AI-maintained fork on GitHub | **jcrussell** |
| **This work** | Local tree `~/dev/me/forge` with Luke’s product work | **Luke** — **lukebmay/forge**, lineage **`luke`** |

Phase A chose jcrussell as **code base**, not as Luke’s long-term identity.

## Goals

1. **Create an official personal fork** on GitHub (Luke’s account) of the
   current base (prefer fork-from **jcrussell/forge** so history matches this
   tree; note relationship to `forge-ext/forge` in README).
2. **Wire remotes** on this clone (or a renamed local path):
   - `origin` → personal fork (push target)
   - `upstream` → `jcrussell/forge` (and/or `forge-ext/forge` — document which)
3. **Name the product lineage** distinctly from jcrussell in tooling, e.g.:
   - lineage id: `luke` / `personal` / chosen short name (decide once)
   - keep **UUID** `forge@jmmaranan.com` for in-place install (unless a later
     task deliberately splits UUID)
4. **Update install / status / origin stamp** so:
   - “installed from **this** tree” ≠ “lineage = jcrussell community”
   - scripts can still **migrate from EGO** and recognize **old jcrussell**
     installs
5. **Docs:** README, `agents/project.md`, PRIORITY, install README — clear
   three-way map (EGO / jcrussell / Luke).
6. **Do not** rewrite history or renumber commits; thin rename + remote +
   branding pass after fork exists.

## Decisions locked

| Topic | Decision |
| --- | --- |
| GitHub repo | `lukebmay/forge` (name `forge`) |
| Default branch | `master` |
| Lineage id | **`luke`** |
| UUID | keep `forge@jmmaranan.com` |
| Local path | `~/dev/me/forge` |
| Upstream tracking | `upstream` = jcrussell; optional `ego` remote not required |
| Script renames | Keep `install-jcrussell` / `switch-to-jcrussell` (historical non-EGO family) |

## Acceptance

- [x] Personal GitHub fork exists; `origin` points at it with push access
- [x] `upstream` (or documented remote) points at jcrussell and/or forge-ext
- [x] Written three-way map in README or DESIGN (EGO / jcrussell / Luke)
- [x] Lineage / install-origin distinguish **Luke tree** from **jcrussell** and **EGO**
- [x] `./install` / `forge install` still work; status shows correct source
- [x] PRIORITY + this plan session note updated; spike “Personal fork: Not yet” flipped

## Out of scope

- EGO publish / new UUID for store listing  
- Taking over `forge-ext` or `jcrussell`  
- Full rebrand of every historical agent plan path  
- `forge update` hosting story (separate)

## Suggested implementation order

1. Create GitHub fork + set remotes on this clone.  
2. Push current `master` (default on lukebmay/forge) to personal origin.  
3. Pick lineage id; extend `forge_detect_lineage` + origin stamp (`source` /
   `lineage` fields).  
4. Minimal script/doc renames so “jcrussell” means the **upstream community
   base**, not “Luke’s install.”  
5. Smoke: status, install origin, one rebuild.  
6. Close task → plan `completed/`.

## Session note

**2026-07-27:** Done. A/B **AGREE**. Parent smoke: `zsh -n` OK; `forge_detect_lineage` → `luke`.
Remotes: origin=`lukebmay/forge`, upstream=`jcrussell/forge`. Lineage stamp on next `./install`.
Moved to `agents/plans/forge-fork-eval/completed/`.
