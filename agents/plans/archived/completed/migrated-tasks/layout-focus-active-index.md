# layout-focus-active-index

**Status:** done  
**Goal:** Disambiguate multi-instance apps for layout `active` / `focus` (0-based index sugar).

## Acceptance

1. **`active` on `{tab|stack}` (container-local, 0-based):**
   - `"active": "Grok"` → first matching role in **this** group
   - `"active": 1` → 2nd child in the group content/roles list
   - `"active": ["Grok", 1]` → 2nd `Grok` in **this** group
2. **`focus` top-level (desk-wide):**
   - `"focus": "Grok"` ≡ `["Grok", 0]` → first matching role in profile roles order
   - `"focus": ["Grok", 1]` → 2nd Grok role desk-wide
   - `"focus": "Grok-2"` → explicit role id still works
3. **Save:** when open/focused leaf is not uniquely named by token alone, emit index form (`1` or `["Grok", 1]`) so dual-Grok round-trips.
4. **Validate/plan/apply** preserve and resolve these forms to the correct windowId focus ops.
5. **Tests** cover dual-Grok active + focus; existing tests stay green.
6. **Docs** (`docs/user/layout.md`, DESIGN brief, cli_help) document 0-based index sugar.

## Non-goals

- Container-level `focus` (keep desk-level only)
- 1-based indexes

## Session note

**Shipped (Task Force A):**

- **`layout_plan.py`:** `_role_ref_present`, `_role_matches_token`, `_match_role_token_nth`, `_resolve_role_ref`, `_resolve_active_ref`, `_resolve_profile_focus_active`. Fixed `active: 0` rejected by `str().strip()`. Desugar + validate resolve `active`/`focus` sugar → role id strings in IR.
- **`layout_save.py`:** `_disambiguate_token` / `_active_token_for_group` / `_focus_token_from_forest` emit `["token", n]` on collision; `_focus_for_output` / `_active_for_output` keep list/int through compact.
- **Docs:** `docs/user/layout.md`, `docs/DESIGN.md`, `cli_help.py`.
- **Tests:** dual-Grok save round-trip; plan active/focus index forms.

**Key APIs:** `_match_role_token_nth(token, roles, n)`, `_resolve_role_ref(ref, roles)`, `_resolve_active_ref(ref, role_ids, group_roles)`, `_disambiguate_token(token, tokens, index)`.
