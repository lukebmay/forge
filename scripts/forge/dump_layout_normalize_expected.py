#!/usr/bin/env python3
"""Dump frozen normalize_profile / validate_reconcile_profile expected fixtures (AL2).

Regenerate (from repo root):

  python3 scripts/forge/dump_layout_normalize_expected.py

Do **not** invent improved IR. These freeze current Python normalize/validate
so lib/shared/layout-plan.js can deep-equal without a live Python oracle.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any

_REPO = Path(__file__).resolve().parents[2]
_FORGE = Path(__file__).resolve().parent
_FIXTURES = _REPO / "tests" / "unit" / "cli" / "fixtures" / "layout"
_EXPECTED = _FIXTURES / "expected-normalize"

if str(_FORGE) not in sys.path:
    sys.path.insert(0, str(_FORGE))

from layout_plan import normalize_profile, validate_reconcile_profile  # noqa: E402


def _load(name: str) -> Any:
    return json.loads((_FIXTURES / name).read_text(encoding="utf-8"))


def _catalog() -> list[dict[str, Any]]:
    """Cases: op, id, input or profileFile, opts."""
    cases: list[dict[str, Any]] = []

    for pname in (
        "profile-bare-single-mon.json",
        "profile-bare-dual-mon.json",
        "profile-dev-v2.json",
    ):
        data = _load(pname)
        stem = pname.removesuffix(".json")
        for op in ("normalize", "validate"):
            cases.append({
                "id": f"{stem}-{op}-offline",
                "op": op,
                "profileFile": pname,
                "opts": {},
                "input": data,
            })

    dual = _load("profile-bare-dual-mon.json")
    for opts in (
        {"mon_count": 1},
        {"mon_count": 2},
        {"mon_count": 2, "mon_indices": [1, 0]},
        {"mon_count": 2, "mon_indices": [0, 1]},
    ):
        tag = f"mc{opts['mon_count']}"
        if "mon_indices" in opts:
            tag += "-idx" + "".join(str(i) for i in opts["mon_indices"])
        for op in ("normalize", "validate"):
            cases.append({
                "id": f"bare-dual-{op}-{tag}",
                "op": op,
                "profileFile": "profile-bare-dual-mon.json",
                "opts": opts,
                "input": dual,
            })

    sugars: dict[str, Any] = {
        "tiles-flat-ghostty": {"tiles": {"mon0": ["ghostty", "ghostty", "ghostty"]}},
        "tiles-tab-group": {"tiles": {"mon0": [["a", "b"]]}},
        "bare-flat-strings": ["firefox", "ghostty"],
        "alias-monitors": {
            "monitors": {"left": "mon0", "right": "mon1"},
            "tiles": {"left": ["ghostty"], "right": ["firefox"]},
        },
        "tagged-vsplit": {
            "tiles": {"mon0": [{"vsplit": ["a", "b"], "share": [2, 1]}]}
        },
        # Gray-shaped bare sole hsplit+share (must lift to mon0, not nest s0)
        "bare-sole-hsplit-share": {
            "tiles": [{
                "hsplit": ["ghostty", "nautilus"],
                "share": [0.691, 0.309],
            }],
            "focus": "ghostty",
        },
        "pwa-chrome": {
            "tiles": {"mon0": ["google-chrome", "Grok", "YouTube"]}
        },
        "focus-token": {
            "tiles": {"mon0": ["ghostty", "firefox"]},
            "focus": "firefox",
        },
        "empty-roles": {
            "version": 2,
            "mode": "reconcile",
            "roles": [],
            "layout": {},
        },
        "top-level-mon-keys": {"mon0": [["firefox", "code"], "ghostty"]},
        "monitors-list": {"monitors": [[["a", "b"], "c"], ["d"]]},
        "tab-active": {
            "tiles": {
                "mon0": [{"tab": ["ghostty", "firefox"], "active": 1}]
            }
        },
        "stacked": {"tiles": {"mon0": [{"stack": ["a", "b"]}]}},
        "nested-hsplit": {
            "tiles": {
                "mon0": [{"hsplit": ["a", {"vsplit": ["b", "c"]}]}]
            }
        },
        "role-object": {
            "tiles": {
                "mon0": [{
                    "app": "ghostty",
                    "class": "com.mitchellh.ghostty",
                    "id": "term",
                }]
            }
        },
        "share-ratio": {
            "tiles": {
                "mon0": {
                    "hsplit": ["a", "b"],
                    "ratio": [1, 3],
                }
            }
        },
        "geom-role-left-right": {
            "tiles": {
                "left": ["ghostty"],
                "right": ["firefox"],
            }
        },
    }
    for name, data in sugars.items():
        for op in ("normalize", "validate"):
            cases.append({
                "id": f"{name}-{op}",
                "op": op,
                "profileFile": None,
                "opts": {},
                "input": data,
            })

    return cases


def dump_all(*, dry_run: bool = False) -> int:
    _EXPECTED.mkdir(parents=True, exist_ok=True)
    cases = _catalog()
    n_ok = 0
    n_err = 0
    for c in cases:
        kwargs = dict(c["opts"])
        # Map mon_count / mon_indices (Python kwargs)
        try:
            if c["op"] == "normalize":
                got = normalize_profile(copy.deepcopy(c["input"]), **kwargs)
            else:
                got = validate_reconcile_profile(
                    copy.deepcopy(c["input"]), **kwargs
                )
            err = None
            n_ok += 1
        except Exception as e:  # noqa: BLE001 — oracle dump
            got = None
            err = f"{type(e).__name__}: {e}"
            n_err += 1

        payload = {
            "id": c["id"],
            "op": c["op"],
            "profileFile": c["profileFile"],
            "opts": c["opts"],
            # Inline input only when not from a shared profile file
            "input": None if c["profileFile"] else c["input"],
            "ok": err is None,
            "error": err,
            "output": got,
        }
        path = _EXPECTED / f"{c['id']}.json"
        text = json.dumps(payload, indent=2, sort_keys=True) + "\n"
        if dry_run:
            print(f"{'OK' if err is None else 'ERR'} {path.name} {err or ''}")
        else:
            path.write_text(text, encoding="utf-8")
            print(f"wrote {path.relative_to(_REPO)} ({'ok' if err is None else err})")

    print(f"\n{len(cases)} cases ({n_ok} ok, {n_err} error fixtures)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    return dump_all(dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
