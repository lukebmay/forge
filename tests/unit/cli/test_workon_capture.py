#!/usr/bin/env python3
"""Unit tests for scripts/forge/workon_capture.py (WR7)."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
_FORGE_BIN = _FORGE_CLI / "forge"
_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "workon"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from workon_capture import (  # noqa: E402
    capture_tiles_profile,
    format_capture_stderr,
    profile_for_output,
)
from workon_plan import (  # noqa: E402
    normalize_profile,
    plan_reconcile,
    validate_reconcile_profile,
)


def _load(name: str):
    return json.loads((_FIXTURES / name).read_text(encoding="utf-8"))


class TestCaptureTilesProfile(unittest.TestCase):
    def test_perfect_dual_mon_shape(self):
        forest = _load("tree-perfect.json")
        raw = capture_tiles_profile(forest)
        profile = profile_for_output(raw)
        self.assertIn("tiles", profile)
        self.assertEqual(profile.get("floating"), [])
        tiles = profile["tiles"]
        self.assertIn("mon0", tiles)
        self.assertIn("mon1", tiles)
        # mon0: tabbed pair + ghostty
        self.assertEqual(len(tiles["mon0"]), 2)
        self.assertIsInstance(tiles["mon0"][0], list)
        self.assertEqual(len(tiles["mon0"][0]), 2)
        self.assertIsInstance(tiles["mon0"][1], dict)
        # mon1: ghostty + tabbed triple
        self.assertEqual(len(tiles["mon1"]), 2)
        self.assertIsInstance(tiles["mon1"][0], dict)
        self.assertIsInstance(tiles["mon1"][1], list)
        self.assertEqual(len(tiles["mon1"][1]), 3)

    def test_chrome_product_title_match(self):
        forest = _load("tree-perfect.json")
        profile = profile_for_output(capture_tiles_profile(forest))
        cells = profile["tiles"]["mon0"][0]
        main = cells[0]
        self.assertEqual(main["match"]["class"], "Google-chrome")
        self.assertEqual(main["match"].get("title~="), "Google Chrome")
        grok = cells[1]
        self.assertEqual(grok["match"].get("title~="), "Grok")

    def test_validates_sugar(self):
        forest = _load("tree-perfect.json")
        profile = profile_for_output(capture_tiles_profile(forest))
        ir = validate_reconcile_profile(profile)
        self.assertEqual(ir["version"], 2)
        self.assertEqual(len(ir["roles"]), 7)

    def test_skips_empty_workspace_copies(self):
        forest = _load("tree-perfect.json")
        profile = profile_for_output(capture_tiles_profile(forest))
        self.assertEqual(set(profile["tiles"].keys()), {"mon0", "mon1"})

    def test_tabbed_ghostty_nautilus(self):
        forest = _load("tree-ghostty-nautilus-tab.json")
        profile = profile_for_output(capture_tiles_profile(forest))
        mon0 = profile["tiles"]["mon0"]
        self.assertEqual(len(mon0), 1)
        self.assertIsInstance(mon0[0], list)
        self.assertEqual(len(mon0[0]), 2)
        ids = {c["id"] for c in mon0[0]}
        self.assertIn("ghostty", ids)
        self.assertIn("nautilus", ids)

    def test_empty_raises(self):
        with self.assertRaisesRegex(ValueError, "no tiled windows"):
            capture_tiles_profile(_load("tree-empty.json"))

    def test_stderr_counts(self):
        forest = _load("tree-perfect.json")
        raw = capture_tiles_profile(forest)
        line = format_capture_stderr(raw)
        self.assertIn("mon0=", line)
        self.assertIn("mon1=", line)
        self.assertIn("windows=7", line)

    def test_id_dedupe_two_ghostty(self):
        forest = _load("tree-perfect.json")
        profile = profile_for_output(capture_tiles_profile(forest))
        ids = []
        for mon in ("mon0", "mon1"):
            for pane in profile["tiles"][mon]:
                if isinstance(pane, list):
                    ids.extend(c["id"] for c in pane)
                else:
                    ids.append(pane["id"])
        self.assertIn("ghostty", ids)
        self.assertIn("ghostty-2", ids)


class TestCaptureRoundTrip(unittest.TestCase):
    def test_perfect_forest_reuses_all(self):
        forest = _load("tree-perfect.json")
        sugar = profile_for_output(capture_tiles_profile(forest))
        ir = normalize_profile(sugar)
        plan = plan_reconcile(forest, ir)
        self.assertTrue(plan["ok"])
        self.assertEqual(plan["counts"]["opened"], 0)
        roles = plan["roles"]
        self.assertEqual(len(roles), 7)
        for r in roles:
            self.assertIn(
                r["status"],
                ("reused", "move"),
                msg=f"role {r['id']} status={r['status']}",
            )
            self.assertNotEqual(r["status"], "open")
        # Prefer pure reuse on already-perfect layout (no wrong mon)
        self.assertEqual(plan["counts"]["opened"], 0)
        missing = [r for r in roles if r["status"] == "open"]
        self.assertEqual(missing, [])

    def test_tab_fixture_round_trip(self):
        forest = _load("tree-ghostty-nautilus-tab.json")
        sugar = profile_for_output(capture_tiles_profile(forest))
        plan = plan_reconcile(forest, sugar)
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertEqual(len(plan["roles"]), 2)


class TestCaptureCli(unittest.TestCase):
    def test_tree_file_stdout(self):
        tree = _FIXTURES / "tree-perfect.json"
        proc = subprocess.run(
            [
                sys.executable,
                str(_FORGE_BIN),
                "workon",
                "capture",
                "--tree-file",
                str(tree),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = json.loads(proc.stdout)
        self.assertIn("tiles", data)
        self.assertIn("mon0", data["tiles"])
        self.assertIn("forge workon capture:", proc.stderr)
        self.assertIn("windows=7", proc.stderr)

    def test_out_writes_file(self):
        tree = _FIXTURES / "tree-perfect.json"
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "sketch.json"
            proc = subprocess.run(
                [
                    sys.executable,
                    str(_FORGE_BIN),
                    "workon",
                    "capture",
                    "--tree-file",
                    str(tree),
                    "--out",
                    str(out),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertTrue(out.is_file())
            disk = json.loads(out.read_text(encoding="utf-8"))
            stdout = json.loads(proc.stdout)
            self.assertEqual(disk["tiles"].keys(), stdout["tiles"].keys())

    def test_out_missing_parent_errors(self):
        tree = _FIXTURES / "tree-perfect.json"
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "nope" / "sketch.json"
            proc = subprocess.run(
                [
                    sys.executable,
                    str(_FORGE_BIN),
                    "workon",
                    "capture",
                    "--tree-file",
                    str(tree),
                    "--out",
                    str(out),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(proc.returncode, 0)
            self.assertIn("parent directory missing", proc.stderr)


if __name__ == "__main__":
    unittest.main()
