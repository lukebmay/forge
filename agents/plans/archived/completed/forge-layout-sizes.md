# Plan: Custom tile sizes in layout sugar + tree track

**Status:** Complete (SZ1–SZ3) — **merged to master**  
**Updated:** 2026-07-30  
**Branch:** `plan/forge-layout-sizes` (merged → `master` @ `05f944f`)  
**Goal:** Custom widths/heights (sibling `percent` + `userSized`) are preserved
wherever we track the tree: install/update session restore, layout save, layout
load/apply — with dead-simple sugar.

### Session note (overwrite)

**Merged to master 2026-07-30** (fast-forward `05f944f`). SZ1–SZ3 done:
share sugar save/load/apply + RunSteps `size`; live black 0.67/0.33; install track.
No push.

## Product target

### Runtime model (already exists)

| Field | Meaning |
| --- | --- |
| `node.percent` | Share of parent along split axis (HSPLIT → width, VSPLIT → height) |
| `node.userSized` | User set this size (mouse/keyboard/golden); not min-size write-back |

Equal siblings often store `percent=0` (magic equal in `computeSizes`). Custom
sizes set real percents + `userSized=true` on the resized pair.

Session soft-rehome / install (`tree-snapshot` / `session-layout`) already
carry percent + userSized. Layout **sugar** save/load does **not** — that is
the main gap. Structure Move also **resets** sibling percents, so load must
re-apply sizes **after** structure/order.

### Sugar (author + save)

Parallel **`share`** list on a split object (same length as content):

```json
{ "hsplit": [ { "tab": ["google-chrome", "Grok"] }, "ghostty" ], "share": [0.67, 0.33] }
```

| Form | Behavior |
| --- | --- |
| `share: [0.67, 0.33]` | Fractions; renormalized if sum ≠ 1 |
| `share: [2, 1]` | Unnormalized weights (same as ratio) |
| `ratio: [2, 1]` | Alias of share weights (optional accept; save prefers `share`) |
| Omit `share` | Equal siblings (current default) |

**Save rules:**

- Emit `share` only when any sibling among that parent’s tiled children is
  `userSized`, or percents are unequal beyond ~1% with all positive.
- Mon-level custom sizes: wrap bare pane list as
  `{ "hsplit": […], "share": […] }` (or `vsplit` when mon layout is VSPLIT).
- Nested h/v: put `share` on that `{hsplit|vsplit: …}` object.
- Round shares to 3 decimals; drop pure equal (all ~1/n) to stay bare.
- Do **not** emit shares for automatic-only percents when no sibling is
  `userSized` and values are equal-ish.

**Load rules:**

- Desugar `share`/`ratio` → IR `share: number[]` on the split/mon node.
- Plan `ensure_sizes` after structure/order (claimed window ids + shares).
- Apply via RunSteps `{ op: "size", windowIds, shares }` (new).
- Missing/malformed share: ignore (equal); never crash planner.

### Install / update

| Path | Expectation |
| --- | --- |
| `forge save-session-layout` / install pre-HUP | Portable JSON includes percent + userSized (already) |
| Soft rehome / restore | Re-apply percent + userSized (already via snapshot) |
| Gaps | Audit: percent=0 equal OK; userSized pairs survive; no wipe on rehome |

## Implementation slices

| ID | Work | Notes |
| --- | --- | --- |
| **SZ1** | Sugar + save + desugar + plan + apply + RunSteps `size` + unit tests | Main pipe |
| **SZ2** | Install/session audit + live black smoke (resize → save → load → install) | On machine `black` |
| **SZ3** | Docs + `forge layout help` sugar line + DESIGN note | After SZ1 |

## Acceptance (plan done)

1. Resize a mon split (userSized), `forge layout save` emits `share` (not equal bare).
2. Load that profile restores those shares (GetTree percent/userSized match ±ε).
3. Install/update path still restores custom sizes from session layout.
4. Equal desks still save bare arrays (no forced share noise).
5. Unit tests green; live smoke on black.

## Out of scope

- Pixel/`ppt` absolute sizes (percent shares only)
- Flex basis / min-max constraints
- yuiop resize keybinds / auto-tiling → [forge-resize-and-autotile.md](./forge-resize-and-autotile.md)

## Related

- T4 sizing policy (userSized): `forge-daily-driver` completed
- Layout sugar: `forge-layout-sugar` (LS1–2,4–5,7–8)
- Session snapshot: `tree-snapshot.js`, `session-layout.js`
