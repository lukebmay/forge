#!/usr/bin/env python3
"""Dump frozen plan_reconcile expected fixtures for ApplyLayout AL1.

Regenerate (from repo root):

  python3 scripts/forge/dump_layout_expected.py
  # or:
  python3 -m pytest tests/unit/cli/test_layout_expected.py -q --dump-layout-expected

Do **not** “improve” plans. These freeze current Python planner output so
AL2/AL3 can match JSON without a live Python oracle.

Naming (FIRM for synthetic labels in this repo):
  - Hosts: colors / plants / heroes in real life; tests use **forgetest**
  - Layout profiles: **layoutA**, **layoutB**, … — never color-like names
    (including “gold”) for layouts or fixture dirs

Case catalog is the source of truth for which (forest, profile, flags)
tuples are frozen. Product-default flags use clean=True unless the case
is keepOthers/safe.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

_REPO = Path(__file__).resolve().parents[2]
_FORGE = Path(__file__).resolve().parent
_FIXTURES = _REPO / "tests" / "unit" / "cli" / "fixtures" / "layout"
_EXPECTED = _FIXTURES / "expected"

if str(_FORGE) not in sys.path:
    sys.path.insert(0, str(_FORGE))

from layout_plan import plan_reconcile  # noqa: E402

# Product CLI default for forge layout is clean=True (see layout_cli).
_PRODUCT_CLEAN = True


def _load(name: str) -> Any:
    return json.loads((_FIXTURES / name).read_text(encoding="utf-8"))


def _flags(
    *,
    clean: bool | None = None,
    keep_others: bool = False,
    safe: bool = False,
    role_pins: dict[str, Any] | None = None,
    just_opened_roles: list[str] | None = None,
) -> dict[str, Any]:
    """Serialize plan_reconcile kwargs for expected fixtures (JSON-friendly)."""
    if clean is None:
        clean = False if keep_others or safe else _PRODUCT_CLEAN
    out: dict[str, Any] = {
        "clean": bool(clean),
        "keepOthers": bool(keep_others),
        "safe": bool(safe),
    }
    if role_pins is not None:
        # Stable pin map (string keys, int windowIds when possible).
        out["rolePins"] = {
            str(k): (int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else v)
            for k, v in sorted(role_pins.items(), key=lambda kv: str(kv[0]))
        }
    if just_opened_roles is not None:
        out["justOpenedRoles"] = sorted(str(x) for x in just_opened_roles)
    return out


def _case(
    case_id: str,
    *,
    forest: str,
    profile: str,
    clean: bool | None = None,
    keep_others: bool = False,
    safe: bool = False,
    role_pins: dict[str, Any] | None = None,
    just_opened_roles: list[str] | None = None,
    note: str = "",
) -> dict[str, Any]:
    return {
        "id": case_id,
        "forest": forest,
        "profile": profile,
        "flags": _flags(
            clean=clean,
            keep_others=keep_others,
            safe=safe,
            role_pins=role_pins,
            just_opened_roles=just_opened_roles,
        ),
        "note": note,
    }


# Residual replan pins: tree-perfect windowIds claim profile-dev-v2 roles.
_PERFECT_ROLE_PINS = {
    "chrome-luke": 101,
    "grok": 102,
    "ghostty-left": 103,
    "ghostty-right": 201,
    "youtube": 202,
    "gmail": 203,
    "voice": 204,
}
_PERFECT_JUST_OPENED = list(_PERFECT_ROLE_PINS.keys())

# Expected-case catalog — acceptance coverage for AL1.
CASES: list[dict[str, Any]] = [
    _case(
        "empty-clean",
        forest="tree-empty.json",
        profile="profile-dev-v2.json",
        note="cold empty desk; product clean=True",
    ),
    _case(
        "perfect-clean",
        forest="tree-perfect.json",
        profile="profile-dev-v2.json",
        note="already matches profile",
    ),
    _case(
        "wrong-mon-clean",
        forest="tree-wrong-mon-roles.json",
        profile="profile-dev-v2.json",
        note="roles on wrong monitors",
    ),
    _case(
        "extra-copy-clean",
        forest="tree-extra-role-copy.json",
        profile="profile-dev-v2.json",
        note="duplicate role windows; clean closes residuals",
    ),
    _case(
        "nested-hsplit-clean",
        forest="tree-mon0-nested-hsplit-collapse.json",
        profile="profile-dev-v2.json",
        note="nested HSPLIT under mon0 left tab",
    ),
    _case(
        "thrash-report-only-just-opened",
        forest="tree-thrash-mode-b-companions.json",
        profile="profile-dev-v2.json",
        just_opened_roles=["chrome-luke", "grok"],
        note="thrashed forest + justOpenedRoles → report thrash, no Mode B park",
    ),
    _case(
        "extra-copy-keep-others",
        forest="tree-extra-role-copy.json",
        profile="profile-dev-v2.json",
        keep_others=True,
        note="keepOthers parks residuals instead of close",
    ),
    _case(
        "wrong-mon-safe",
        forest="tree-wrong-mon-roles.json",
        profile="profile-dev-v2.json",
        safe=True,
        note="safe: open+move only; no structure ensure",
    ),
    _case(
        "residual-replan-pins",
        forest="tree-perfect.json",
        profile="profile-dev-v2.json",
        role_pins=_PERFECT_ROLE_PINS,
        just_opened_roles=_PERFECT_JUST_OPENED,
        note="residual replan with rolePins + justOpenedRoles (post-open)",
    ),
]


def plan_kwargs_from_flags(flags: dict[str, Any]) -> dict[str, Any]:
    """Map expected-fixture flags object → plan_reconcile kwargs."""
    kw: dict[str, Any] = {
        "clean": bool(flags.get("clean", False)),
        "keep_others": bool(flags.get("keepOthers", False)),
        "safe": bool(flags.get("safe", False)),
    }
    if "rolePins" in flags and flags["rolePins"] is not None:
        kw["role_pins"] = dict(flags["rolePins"])
    if "justOpenedRoles" in flags and flags["justOpenedRoles"] is not None:
        kw["just_opened_roles"] = list(flags["justOpenedRoles"])
    return kw


def build_expected_record(case: dict[str, Any]) -> dict[str, Any]:
    forest = _load(case["forest"])
    profile = _load(case["profile"])
    flags = case["flags"]
    plan = plan_reconcile(forest, profile, **plan_kwargs_from_flags(flags))
    return {
        "id": case["id"],
        "note": case.get("note") or "",
        "forestFile": case["forest"],
        "profileFile": case["profile"],
        "profile": profile,
        "forest": forest,
        "flags": flags,
        "plan": plan,
    }


def dump_all(*, expected_dir: Path = _EXPECTED) -> list[Path]:
    expected_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for case in CASES:
        rec = build_expected_record(case)
        path = expected_dir / f"{case['id']}.json"
        path.write_text(
            json.dumps(rec, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        written.append(path)
    readme = expected_dir / "README.md"
    readme.write_text(
        """# Layout plan expected fixtures (AL1)

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
""",
        encoding="utf-8",
    )
    return written


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument(
        "--check",
        action="store_true",
        help="exit 1 if on-disk expected fixtures differ from planner (no write)",
    )
    ap.add_argument(
        "--list",
        action="store_true",
        help="print case ids and exit",
    )
    args = ap.parse_args(argv)
    if args.list:
        for c in CASES:
            print(c["id"])
        return 0
    if args.check:
        missing = []
        dirty = []
        for case in CASES:
            path = _EXPECTED / f"{case['id']}.json"
            if not path.is_file():
                missing.append(case["id"])
                continue
            on_disk = json.loads(path.read_text(encoding="utf-8"))
            fresh = build_expected_record(case)
            if json.dumps(on_disk, sort_keys=True) != json.dumps(fresh, sort_keys=True):
                dirty.append(case["id"])
        if missing or dirty:
            if missing:
                print("missing expected:", ", ".join(missing), file=sys.stderr)
            if dirty:
                print("stale expected:", ", ".join(dirty), file=sys.stderr)
            return 1
        print(f"ok: {len(CASES)} expected cases match current plan_reconcile")
        return 0
    paths = dump_all()
    print(f"wrote {len(paths)} expected files under {_EXPECTED.relative_to(_REPO)}")
    for p in paths:
        print(f"  {p.relative_to(_REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
