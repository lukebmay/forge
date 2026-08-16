# expected-normalize — AL2 frozen profile IR

Python `normalize_profile` / `validate_reconcile_profile` dumps for
`lib/shared/layout-plan.js` parity.

Regenerate (repo root):

```bash
python3 scripts/forge/dump_layout_normalize_expected.py
```

Each file: `{ id, op, profileFile|input, opts, ok, error, output }`.

Do **not** invent improved IR. Re-dump from Python after intentional
layout_plan.py sugar changes, then update JS to match.
