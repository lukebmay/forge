# Plan: Layout workspace scope

**Status:** ready (design locked)  
**Priority:** P0 daily-driver — desks are workspaces  
**Created:** 2026-08-06  
**Branch:** `plan/forge-layout-workspace-scope`  
**Host:** black (X11 + Wayland)  

### Session note (overwrite)

**2026-08-06:** Product locks from operator after Inkscape-on-ws2 was pulled
into `forge layout dev` on ws1. Implement WS0 first (never claim off-ws).

---

## Why

Layouts are **task desks**. A workspace often holds an entirely different tool
set (code vs graphics vs video). Today layout plan/apply:

- Claims windows from **all** workspaces
- Applies into **ws0** paths (`moNws0`) by default
- Can move / keep companions (e.g. Inkscape) onto the active coding desk

That fights multi-workspace use.

## Product locks (do not re-litigate without human)

### Scope

| Rule | Detail |
| --- | --- |
| **Default scope** | Target workspace only — plan, claim, open, structure, park/keep |
| **No cross-ws steal** | Matching class/title on another workspace is **invisible** |
| **Open missing** | New apps land on the **target** workspace |
| **Save** | Snapshot **that workspace only** |
| **Escape hatch** | Optional later `--collect` / from-all-workspaces — **not** default; out of WS0–WS3 unless needed |

### Workspace targeting (CLI)

| Form | Meaning |
| --- | --- |
| `forge layout dev` | Apply `dev` on **current** workspace |
| `forge layout vinyl-graphics video-edit` | **Sequential from current**: first → current, second → current+1, … |
| `forge layout 2:vinyl-graphics` or `vinyl-graphics@2` | Apply on workspace **2** (1-based) |
| `forge layout 1:foo 2:bar 4:baz` | Explicit multi; no `--on` flag |
| Mix | Args **without** explicit ws advance sequential cursor; explicit `W:name` / `name@W` pin that apply only |

**Sequential cursor (locked):**

1. Start at **current** workspace index (1-based for CLI).
2. For each bare `name`: apply on cursor, then cursor += 1.
3. For each `W:name` / `name@W`: apply on W; **do not** advance cursor (or: do not use sequential slot — pin only).  
   *Implement note:* pin does not consume a sequential slot and does not change cursor.
4. One bare name alone = current only (cursor never needs +1 for user-visible effect).

**No `--on`.** Specificity in scripts = `1:foo 2:bar`.

### Preflight (all-or-nothing)

Before any mutate:

1. Resolve every arg → `(workspace, profileName)`.
2. **Every** profile must resolve (host + user search path) — else **error, apply nothing**.
3. **Every** workspace index must exist in this session — else **error, apply nothing**.
4. **Sequential span** must fit: if bare names need current..current+N-1 and session has fewer workspaces — **error, apply nothing**.
5. Then apply in order; prefer stop-on-first-apply-failure with report of what succeeded (document in task). Preflight failures never partial-apply.

### Names

| Rule | Detail |
| --- | --- |
| **Forbidden in layout names** | `:` and `@` (CLI grammar) |
| **Save / rename** | Reject names containing `:` or `@` with clear error |
| **Existing profiles** | Scan host/user layout dirs; rename only if any name already contains `:`/`@` (unlikely) |

### Index base

- CLI: **1-based** (`-w` not required; `2:name` means second workspace).
- Tree ids: `moNws{W-1}` (0-based Meta/workspace index).
- Help and errors always speak 1-based to the user.

### Dry-run

Show per-workspace blocks; include:

```text
workspace: 2 (current)
candidates: 5 on ws2 (ignored 8 on other workspaces)
```

### Errors (examples)

```text
forge layout: profile 'vinyl-graphics' not found
  looked in: …/layout/hosts/black/ …
  hint: forge layout list

forge layout: workspace 5 out of range (session has 4 workspaces)
  hint: use 1..4, or bare name for current (now: 2)

forge layout: need 3 workspaces from current (2) for sequential apply; only 4 exist total but 2..4 is OK / only 1 left
  hint: open more workspaces, or use explicit N:name

forge layout: name must not contain ':' or '@' (reserved for workspace targeting)
```

### Out of scope (this plan)

- Browser-like tab drag product (separate plan)
- Container selection S3
- Dynamic workspaces (still unsupported; fixed count)
- Profile-pinned default workspace in JSON (workspaces shift — CLI only)

---

## Tasks

| ID | Work | Status |
| --- | --- | --- |
| **WS0** | Scope: forest filter + claim/open/structure only on target ws; unit fixtures (Inkscape-on-ws2 invisible to ws1 plan) | next |
| **WS1** | Thread workspace through apply paths (stop hardcoding `ws0`); current-ws from extension | pending |
| **WS2** | CLI parse: bare / `W:name` / `name@W`; sequential from current; preflight all-or-nothing; name charset on save | pending |
| **WS3** | Docs + help + dry-run messaging; migrate any illegal names; live X11 smoke multi-ws | pending |

Optional later (not required for plan done): `--collect`, `--switch` after apply to target ws.

---

## Acceptance (plan done)

1. `forge layout dev` never moves windows from other workspaces.
2. Multi bare names sequential from current with preflight.
3. `W:name` and `name@W` both work; mixed with bare sequential rules as locked.
4. Save rejects `:` / `@` in names; list/show unchanged for legal names.
5. Unit + live black dual-ws smoke green on X11; Wayland smoke when operator on Wayland.

## Related

- Inkscape incident: layout apply during X11 smoke (2026-08-06)
- Prior design chat: workspace-scoped desks + no global claim
- Tab chrome drag: [forge-tab-chrome-drag.md](./forge-tab-chrome-drag.md) (lower pri)
