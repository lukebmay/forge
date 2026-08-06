# Plan: Layout workspace scope

**Status:** ready (design locked)  
**Priority:** P0 daily-driver — desks are workspaces  
**Created:** 2026-08-06  
**Branch:** `plan/forge-layout-workspace-scope`  
**Host:** black (X11 + Wayland)  

### Session note (overwrite)

**2026-08-06:** Product locks after Inkscape-on-ws2 was pulled into `forge layout
dev` on ws1. **No mix** sequential bare names with numbered forms (operator lock).
**P0 first priority.** Implement WS0 first (never claim off-ws).

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

### Workspace targeting (CLI) — two exclusive modes

**All layout args are bare, or all are numbered. Never mix.**

| Mode | Args | Behavior |
| --- | --- | --- |
| **Sequential** | Only bare `name`… | First → **current** workspace, second → current+1, … |
| **Static** | Only `W:name` and/or `name@W`… | Each apply on explicit **1-based** workspace W |

| Example | OK? |
| --- | --- |
| `forge layout dev` | Sequential (current only) |
| `forge layout vinyl-graphics video-edit` | Sequential from current |
| `forge layout 1:foo 2:bar 4:baz` | Static |
| `forge layout foo@1 bar@2` | Static (same as `1:foo 2:bar`) |
| `forge layout dev 3:vinyl` | **Error** — mixed sequential + numbered |
| `forge layout 1:foo video-edit` | **Error** — mixed |

**No `--on`.** Scripts use static form only: `1:foo 2:bar`.

**No pins-with-cursor.** Numbered forms never combine with bare names.

### Preflight (all-or-nothing)

Before any mutate:

1. Classify argv mode: all bare | all numbered | **mixed → error, apply nothing**.
2. Resolve every arg → `(workspace, profileName)`.
3. **Every** profile must resolve (host + user search path) — else **error, apply nothing**.
4. **Every** workspace index must exist in this session — else **error, apply nothing**.
5. **Sequential span** must fit: bare names need current..current+N-1 within session count — else **error, apply nothing**.
6. Then apply in order; prefer stop-on-first-apply-failure with report of what succeeded (document in task). Preflight failures never partial-apply.

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

forge layout: need 3 workspaces from current (2) for sequential apply; session has 2
  hint: open more workspaces, or use static form (1:foo 2:bar)

forge layout: cannot mix sequential names and numbered workspaces
  got: bare 'dev' and '3:vinyl'
  hint: use only bare names (from current) or only N:name / name@N

forge layout: name must not contain ':' or '@' (reserved for workspace targeting)
```

### Out of scope (this plan)

- Browser-like tab drag product (separate plan)
- Container motion / peel design ([forge-container-motion-design](./forge-container-motion-design.md))
- Container selection S3 (unmerged branch)
- Dynamic workspaces (still unsupported; fixed count)
- Profile-pinned default workspace in JSON (workspaces shift — CLI only)

---

## Tasks

| ID | Work | Status |
| --- | --- | --- |
| **WS0** | Scope: forest filter + claim/open/structure only on target ws; unit fixtures (Inkscape-on-ws2 invisible to ws1 plan) | next |
| **WS1** | Thread workspace through apply paths (stop hardcoding `ws0`); current-ws from extension | pending |
| **WS2** | CLI: exclusive sequential **or** static modes; `W:name` / `name@W`; preflight; name charset on save | pending |
| **WS3** | Docs + help + dry-run messaging; migrate any illegal names; live X11 smoke multi-ws | pending |

Optional later (not required for plan done): `--collect`, `--switch` after apply to target ws.

---

## Acceptance (plan done)

1. `forge layout dev` never moves windows from other workspaces.
2. Multi bare names sequential from current with preflight; **mix with numbered is error**.
3. Static mode: `W:name` and `name@W` only (all numbered).
4. Save rejects `:` / `@` in names; list/show unchanged for legal names.
5. Unit + live black dual-ws smoke green on X11; Wayland smoke when operator on Wayland.

## Related

- Inkscape incident: layout apply during X11 smoke (2026-08-06)
- Motion/peel/selection design: [forge-container-motion-design.md](./forge-container-motion-design.md)
- Tab chrome drag: [forge-tab-chrome-drag.md](./forge-tab-chrome-drag.md) (lower pri)
