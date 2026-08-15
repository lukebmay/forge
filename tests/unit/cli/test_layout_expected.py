#!/usr/bin/env python3
"""AL1: expected plan fixtures match current plan_reconcile (no planner port).

Regenerate:

  python3 scripts/forge/dump_layout_expected.py
  python3 -m pytest tests/unit/cli/test_layout_expected.py -q --dump-layout-expected
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
_EXPECTED = Path(__file__).resolve().parent / "fixtures" / "layout" / "expected"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from dump_layout_expected import (  # noqa: E402
    CASES,
    build_expected_record,
    dump_all,
    plan_kwargs_from_flags,
)
from layout_plan import plan_reconcile  # noqa: E402


def _load_expected(case_id: str) -> dict:
    path = _EXPECTED / f"{case_id}.json"
    return json.loads(path.read_text(encoding="utf-8"))


class TestLayoutExpectedCatalog(unittest.TestCase):
    """Catalog covers AL1 acceptance shapes."""

    def test_case_ids_unique(self):
        ids = [c["id"] for c in CASES]
        self.assertEqual(len(ids), len(set(ids)), ids)

    def test_acceptance_shapes_present(self):
        ids = {c["id"] for c in CASES}
        for required in (
            "empty-clean",
            "perfect-clean",
            "wrong-mon-clean",
            "extra-copy-clean",
            "nested-hsplit-clean",
            "thrash-report-only-just-opened",
            "extra-copy-keep-others",
            "wrong-mon-safe",
            "residual-replan-pins",
        ):
            self.assertIn(required, ids)

    def test_residual_case_has_pins(self):
        residual = next(c for c in CASES if c["id"] == "residual-replan-pins")
        flags = residual["flags"]
        self.assertIn("rolePins", flags)
        self.assertIn("justOpenedRoles", flags)
        self.assertGreaterEqual(len(flags["rolePins"]), 1)
        self.assertGreaterEqual(len(flags["justOpenedRoles"]), 1)


class TestLayoutExpectedParity(unittest.TestCase):
    """On-disk expected fixtures match a live plan_reconcile call."""

    def test_expected_files_exist(self):
        for case in CASES:
            path = _EXPECTED / f"{case['id']}.json"
            self.assertTrue(
                path.is_file(), f"missing {path} — run dump_layout_expected.py"
            )

    def test_each_expected_matches_planner(self):
        for case in CASES:
            with self.subTest(case=case["id"]):
                exp = _load_expected(case["id"])
                self.assertEqual(exp["id"], case["id"])
                self.assertIn("plan", exp)
                self.assertIn("forest", exp)
                self.assertIn("profile", exp)
                self.assertIn("flags", exp)
                live = plan_reconcile(
                    exp["forest"],
                    exp["profile"],
                    **plan_kwargs_from_flags(exp["flags"]),
                )
                self.assertEqual(
                    json.loads(json.dumps(live, sort_keys=True)),
                    json.loads(json.dumps(exp["plan"], sort_keys=True)),
                    f"expected plan drift for {case['id']}; regenerate dump_layout_expected.py",
                )

    def test_catalog_rebuild_matches_disk(self):
        """Catalog inputs rebuild the same record as on disk (full envelope)."""
        for case in CASES:
            with self.subTest(case=case["id"]):
                exp = _load_expected(case["id"])
                fresh = build_expected_record(case)
                self.assertEqual(
                    json.loads(json.dumps(fresh, sort_keys=True)),
                    json.loads(json.dumps(exp, sort_keys=True)),
                    f"full expected envelope drift for {case['id']}",
                )


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--dump-layout-expected" in argv:
        dump_all()
        print(f"dumped {len(CASES)} expected cases to {_EXPECTED}")
        return 0
    sys.argv = [sys.argv[0]] + [a for a in argv if a != "--dump-layout-expected"]
    return unittest.main(verbosity=2, exit=False).result.wasSuccessful() and 0 or 1


if __name__ == "__main__":
    raise SystemExit(main())
