# Task: LS7 + LS8 — auto description + interactive save UX

**Plan:** [forge-layout-sugar.md](../plans/forge-layout-sugar.md)  
**Status:** ready (after LS1–LS2; can parallel LS4–LS5 if normalize exists)  
**Pri:** P0 layout-sugar track

## Scope

### LS7 — auto description

- Pure `format_layout_description(profile_ir) -> str`.
- Shape (example):

  ```text
  mon0 (hsplit): tabgroup, ghostty. mon1 (hsplit): ghostty, tabgroup.
  ```

- Pane tokens: single app stem; multi-role pane → `tabgroup`.
- **Never required to load.** `list` / `show` use stored description if present, else auto.
- Unit tests for generator.

### LS8 — `forge layout save` description UX

**Interactive TTY only** (scripting.md):

| File state | Prompt |
| --- | --- |
| New / no description | Show default; **[K]eep** (default Enter) / **[E]dit** (pre-fill default, Enter accepts) |
| Exists + description | **[K]eep current** (default) / **[D]efault** (auto) / **[E]dit** (pre-fill **default**, not current) |

**Non-interactive:** no prompts — keep existing description if any; else write auto. Escapes: `--description TEXT`, `--no-description`.

Keep the flow dead simple — no `$EDITOR`, no multi-page wizard.

## Acceptance

1. Profile without `description` loads and lists with auto one-liner.
2. Interactive save choices K/D/E behave as plan; Enter defaults documented.
3. Non-interactive save never blocks; never drops a custom description without a flag when re-saving.
4. Tests for format helper; optional CLI prompt tests with mocked stdin.

## Session note

(overwrite when implementing)
