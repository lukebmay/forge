# Layout plan expected fixtures (AL1)

Frozen `plan_reconcile` outputs for ApplyLayout parity (AL2/AL3).

## Naming

Do **not** use color-like labels (including “gold”) for layout names or
fixture dirs. Real hosts are colors/plants/heroes; synthetic host =
`forgetest`. Synthetic layout profiles = `layoutA`, `layoutB`, …

## Regenerate

From repo root (do not hand-edit plan bodies):

```bash
python3 scripts/forge/dump_layout_expected.py
# or
python3 -m pytest tests/unit/cli/test_layout_expected.py -q --dump-layout-expected
```

## Shape

Each `<case-id>.json`:

```json
{
  "id": "…",
  "note": "…",
  "forestFile": "tree-….json",
  "profileFile": "profile-….json",
  "profile": {},
  "forest": {},
  "flags": {
    "clean": true,
    "keepOthers": false,
    "safe": false,
    "rolePins": {},
    "justOpenedRoles": []
  },
  "plan": {}
}
```

`flags` uses product CLI defaults (`clean: true`) unless the case is
`keepOthers` / `safe`. Optional `rolePins` / `justOpenedRoles` cover residual
replan after open.

## Rules

- Do **not** “improve” plans when regenerating — freeze current planner only.
- AL2/AL3 compare JS `planReconcile` plan JSON to `plan` here.
- Source cases: `scripts/forge/dump_layout_expected.py` → `CASES`.
