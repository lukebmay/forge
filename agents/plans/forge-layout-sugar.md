# Plan: Dead-simple layout sugar

**Status:** Active — LS1+LS2 done; next LS7–LS8  
**Updated:** 2026-07-28  
**Goal:** A layout config so simple you could write it by accident and it still works.

### Session note (overwrite)

LS1+LS2 **done** (A/B AGREE): bare array + string inference; 221 layout unit tests OK.  
Next: [LS7–LS8 description](../tasks/forge-layout-sugar_ls7-ls8-description.md); then LS4 save bare array / LS5 docs.

## Product target

### Happy path — bare JSON array (no keys)

**Dual-mon** (top-level length = monitor count): each item is that monitor’s
L→R panes; nested list = **tabbed** group (order = tab order).

```json
[
  [ ["google-chrome", "Grok"], "ghostty" ],
  [ "ghostty", ["YouTube", "Gmail", "Google Voice"] ]
]
```

**Single-mon** (or only one physical mon live): top-level is **panes**, not
monitors — same shape as one mon’s body:

```json
[ ["firefox", "code"], "ghostty" ]
```

Heuristic when loading:

| Live mons | Top-level shape | Interpretation |
| --- | --- | --- |
| 1 | array of cells | panes on mon0 |
| ≥2 | array whose items look like mon bodies (arrays / split objects) | mon0, mon1, … in order |
| ≥2 | flat list of string/app cells only | put all panes on mon0 (best-effort); or pack left→right across mons — **decide in implement task** (prefer: one mon of panes if ambiguous, document it) |

Ambiguous / malformed structure: **load what you can**, ignore the rest;
unclaimed / leftover apps **park safely** (existing soft-park / residual
policy), never crash the planner.

### Object form — only when needed

```json
{
  "description": "optional — never required to load",
  "tiles": { ... } | [ ... ],
  "floating": [ ... ]
}
```

- Prefer bare array file when there is no floating and no extra metadata.
- `tiles` key only if mixing with `floating` / advanced IR.
- Stored `description` is optional cosmetics for `list` / humans.
- `mon0` / `mon1` keys remain valid **advanced** sugar (stableKey / alias later);
  not required for the happy path.

### String cells — infer match from `app`

A string is both **open** target and **match** seed:

| Infer | Rule |
| --- | --- |
| `open.app` | the string |
| `title~=` | desktop `Name=` if resolve hits; else the string (or known short frag) |
| `class` | optional: desktop hints / chrome→`Google-chrome` when Exec is chrome; stem match for reverse-DNS (`ghostty`) |
| Chrome PWAs | title disambiguation required; class alone never enough |

Explicit `{ "app", "class", "title~=" }` remains an **override**, not the default
authoring style.

Save (`forge layout save`) should emit the **simplest** form that round-trips:
prefer bare array + string cells; only add objects / `tiles` / titles when
needed for fidelity.

---

## Auto description (always available, never required)

**Load does not need `description`.** Apply/plan/show structure work without it.

Whenever a human-facing description is needed and the profile has none (or we
are generating a default), **auto-build a dead-simple one-liner** from the
normalized layout:

```text
mon0 (hsplit): tabgroup, ghostty. mon1 (hsplit): ghostty, tabgroup.
```

### Generator rules (keep boring)

| Pane shape | Token |
| --- | --- |
| string / single app | app id or open stem (`ghostty`, `Grok`) |
| tabbed multi-role | `tabgroup` (or `tabgroup(a,b,c)` if short — prefer plain `tabgroup` first) |
| nested h/v split | `hsplit` / `vsplit` with child tokens |
| mon split omitted | infer `hsplit` when ≥2 panes (same as sugar defaults) |

Format sketch:

```text
mon{N} ({split}): {pane}, {pane}, …. mon{N+1} ({split}): …
```

- One line; no prose essay.
- Stable enough for `forge layout list` columns.
- Pure function: profile IR → string (unit-testable). No GetTree required once
  IR exists; save can run on captured sugar after normalize.

### When to use auto vs stored

| Situation | Behavior |
| --- | --- |
| `list` / list line | Use stored `description` if non-empty; else **auto** |
| `show` header | Same |
| Load / apply / plan | Ignore description entirely |
| Save write | See interactive UX below |

Do **not** force writers to invent a description. Bare array files stay valid.

---

## Save UX — description (interactive only)

`forge layout save <name>` on a **TTY** should make description a 5-second
choice, not a project. Non-interactive: no prompts (rules below).

### Interactive flows

**A. No existing description** (new file, or file without `description`)

Do **not** offer Keep / Default / Edit menu. One step only:

1. Compute **default** auto description from the snapshot about to be written.
2. Single-line edit **pre-filled with that default**.
3. User presses Enter to accept, or edits/clears and types their own.

No multi-option prompt when there is nothing to “keep.”

**B. Existing file with a description**

1. Show current + auto default (short).
2. Prompt:

   ```text
   Description for "dev":
     current: Dual-mon: Chrome+Grok | Ghostty …
     default: mon0 (hsplit): tabgroup, ghostty. mon1 (hsplit): ghostty, tabgroup.
   [K]eep current  [D]efault  [E]dit  — default K
   ```

3. **Keep (k):** retain file’s description (Enter = K). No further prompt.
4. **Default (d):** single-line edit **pre-filled with the auto-generated
   one-liner**. Enter accepts default as-is; user may tweak first.
5. **Edit (e):** single-line edit **pre-filled with the existing (current)
   description**. Enter accepts; user may clear and rewrite.

Summary:

| Choice | Behavior |
| --- | --- |
| Keep | existing text unchanged (no edit step) |
| Default | edit buffer starts as **auto default**; Enter accepts |
| Edit | edit buffer starts as **existing**; Enter accepts |
| No existing | skip menu; edit buffer starts as **auto default** |

### Non-interactive

| Case | Description written |
| --- | --- |
| New file / no description | auto default |
| Exists + has description | **keep** existing (no prompt) |
| `--description TEXT` | use TEXT (escape hatch) |
| `--no-description` | omit key (bare array purity) |

No prompts when stdin/stdout not a TTY (scripting.md interactive vs script).

### Implementation notes

- Pure: `format_layout_description(prof) -> str` in `layout_plan` or `layout_save`.
- CLI only: prompt helpers in `forge` layout save path; respect `agents/scripting.md` TTY rules.
- `list` already has description field — fill from auto when missing after load/normalize.
- Unit tests for generator; light CLI tests with mocked TTY optional.

---

## Why this is the bar

Current black `dev` is already flatter than v2 IR, but still teaches
`tiles` + `monN` + Chrome object cells. Target: **lists and names only**,
with optional one-line auto description for discoverability.

## Implementation slices

| ID | Work | Notes |
| --- | --- | --- |
| **LS1** | `normalize_profile`: accept bare top-level array → internal tiles IR | **Done** — shape-only multi vs mon0 |
| **LS2** | String-cell match inference (desktop Name / chrome heuristics) | **Done** — pure heuristics + PWA map |
| **LS3** | Best-effort parse + park leftovers | no hard fail on weird JSON shape |
| **LS4** | `layout save` emits bare array when possible | no `floating: []`, no mon keys if index order is enough |
| **LS5** | Docs + black `dev.json` rewrite to bare array | shellrc example is the demo |
| **LS6** | Tests: 1-mon, 2-mon, ambiguous, chrome PWA inference | fixtures |
| **LS7** | `format_layout_description` + list/show fallback | pure; unit tests |
| **LS8** | Interactive save description UX (K/D/E + non-interactive rules) | TTY only |

No backwards compatibility required (pre-release). Old `tiles.monN` and rich
cells keep working as supersets.

## Acceptance (when implemented)

1. File that is **only** the dual-mon array above loads on black and plans correctly.
2. Single-mon array of panes works without wrapping in `[[...]]` mon layer when one mon.
3. `forge layout save` can rewrite to bare array + strings when safe.
4. Missing/inferable class/title not required for typical Chrome+PWA desk.
5. No `description` required to load; `list` still shows a useful one-liner (auto or stored).
6. Interactive save: K/D/E (or K/E on new) is obvious; non-interactive never hangs.
7. Unit tests green; live black smoke.

## Related shipped

| Item | Note |
| --- | --- |
| `workon` → `layout` | Done |
| Mon L/R `ensure_order` | Done |
| In-group tab order | Done |
| Flat `{app,class,title~=}` cells | Interim sugar (before LS2) |
| Class stem `ghostty` ↔ reverse-DNS | Done |

## Out of scope here

- STACKED product path → [forge-stacked-layouts.md](./forge-stacked-layouts.md)
- Full gdisplays-level monitor identity in bare arrays (mon index order is enough for v1)
- Fancy multi-line description editors / `$EDITOR` (single-line prefill is enough)

## Next task

[forge-layout-sugar_ls7-ls8-description.md](../tasks/forge-layout-sugar_ls7-ls8-description.md) — auto description + interactive save UX.

Completed: [LS1–LS2](./forge-layout-sugar/completed/forge-layout-sugar_ls1-ls2.md).
