# Task: LS7 + LS8 — auto description + interactive save UX

**Plan:** [forge-layout-sugar.md](../plans/forge-layout-sugar.md)  
**Status:** done (B AGREE)  
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

| File state | UX |
| --- | --- |
| **No existing description** | No K/D/E menu. One line edit **pre-filled with auto default**; Enter accepts. |
| **Exists + description** | **[K]eep current** (Enter = K, no edit step) / **[D]efault** (line edit **pre-filled with auto**) / **[E]dit** (line edit **pre-filled with existing**) |

Default and Edit both open the same single-line editor; only the prefill
differs. Enter accepts the buffer (so Default + Enter = pure auto one-liner).

**Non-interactive:** no prompts — keep existing description if any; else write auto. Escapes: `--description TEXT`, `--no-description`.

Keep the flow dead simple — no `$EDITOR`, no multi-page wizard.

## Acceptance

1. Profile without `description` loads and lists with auto one-liner. **✓**
2. No existing desc → no Keep/Default/Edit menu; prefill default only. **✓**
3. Edit prefill = **existing**; Default prefill = **auto**; Keep = unchanged (no edit). **✓**
4. Default + Enter writes auto without extra typing. **✓**
5. Non-interactive save never blocks; never drops a custom description without a flag when re-saving. **✓**
6. Tests for format helper; optional CLI prompt tests with mocked stdin. **✓**

## Session note

**B verify 2026-07-28 — AGREE.**

- Diff + key paths reviewed; **242** layout unit tests re-run OK.
- Spot-check: bare dual-mon / single-mon / v2 IR format strings; non-interactive keep/auto/flags; capture no longer uses name as description; list auto on bare arrays; load still description-optional.
- No blocking findings; no code changes.
