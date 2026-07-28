#!/usr/bin/env python3
"""Unit tests for scripts/forge/layout_save.py (WR7) + layout save CLI."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
_FORGE_BIN = _FORGE_CLI / "forge"
_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "layout"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from layout_save import (  # noqa: E402
    capture_tiles_profile,
    format_capture_stderr,
    profile_for_output,
)
from layout_plan import (  # noqa: E402
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
        # Empty floating omitted (max sugar)
        self.assertNotIn("floating", profile)
        tiles = profile["tiles"]
        self.assertIn("mon0", tiles)
        self.assertIn("mon1", tiles)
        # mon0: tabbed pair + ghostty
        self.assertEqual(len(tiles["mon0"]), 2)
        self.assertIsInstance(tiles["mon0"][0], list)
        self.assertEqual(len(tiles["mon0"][0]), 2)
        # mon1: ghostty + tabbed triple
        self.assertEqual(len(tiles["mon1"]), 2)
        self.assertIsInstance(tiles["mon1"][1], list)
        self.assertEqual(len(tiles["mon1"][1]), 3)
        # mon1 tabs in tree order: youtube, gmail, voice
        mon1_tabs = tiles["mon1"][1]
        titles = [
            c.get("title~=") if isinstance(c, dict) else None for c in mon1_tabs
        ]
        self.assertEqual(titles, ["YouTube", "Gmail", "Voice"])

    def test_chrome_product_title_match(self):
        forest = _load("tree-perfect.json")
        profile = profile_for_output(capture_tiles_profile(forest))
        cells = profile["tiles"]["mon0"][0]
        main = cells[0]
        # Flat sugar: app + class + title~= (no nested match)
        self.assertEqual(main.get("class"), "Google-chrome")
        self.assertEqual(main.get("title~="), "Google Chrome")
        self.assertEqual(main.get("app"), "google-chrome")
        grok = cells[1]
        self.assertEqual(grok.get("title~="), "Grok")
        self.assertEqual(grok.get("app"), "Grok")

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
        # String sugar when class is unique / no title need
        cells = mon0[0]
        stems = []
        for c in cells:
            if isinstance(c, str):
                stems.append(c)
            elif isinstance(c, dict):
                stems.append(c.get("app") or c.get("id") or "")
        self.assertTrue(any("ghostty" in s for s in stems))
        self.assertTrue(any("nautilus" in s for s in stems))

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
        labels = []
        for mon in ("mon0", "mon1"):
            for pane in profile["tiles"][mon]:
                if isinstance(pane, list):
                    for c in pane:
                        if isinstance(c, str):
                            labels.append(c)
                        elif isinstance(c, dict):
                            labels.append(c.get("app") or c.get("id") or "")
                elif isinstance(pane, str):
                    labels.append(pane)
                elif isinstance(pane, dict):
                    labels.append(pane.get("app") or pane.get("id") or "")
        # Two ghostties → ghostty + ghostty-2 after normalize; sugar may be
        # plain "ghostty" twice until desugar allocates -2.
        ghost = [x for x in labels if "ghostty" in str(x).lower()]
        self.assertGreaterEqual(len(ghost), 2)
        ir = normalize_profile(profile)
        gids = [r["id"] for r in ir["roles"] if "ghostty" in r["id"]]
        self.assertIn("ghostty", gids)
        self.assertTrue(any(x.startswith("ghostty") and x != "ghostty" for x in gids))


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
        self.assertEqual(plan["counts"]["opened"], 0)
        missing = [r for r in roles if r["status"] == "open"]
        self.assertEqual(missing, [])

    def test_tab_fixture_round_trip(self):
        forest = _load("tree-ghostty-nautilus-tab.json")
        sugar = profile_for_output(capture_tiles_profile(forest))
        plan = plan_reconcile(forest, sugar)
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertEqual(len(plan["roles"]), 2)


class TestSaveCli(unittest.TestCase):
    def test_stdout_only(self):
        tree = _FIXTURES / "tree-perfect.json"
        proc = subprocess.run(
            [
                sys.executable,
                str(_FORGE_BIN),
                "layout",
                "save",
                "mydesk",
                "--stdout",
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
        self.assertIn("forge layout save:", proc.stderr)
        self.assertIn("windows=7", proc.stderr)
        self.assertIn("stdout only", proc.stderr)
        self.assertIn("name=mydesk", proc.stderr)

    def test_write_host_path(self):
        tree = _FIXTURES / "tree-perfect.json"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            env = {
                **os.environ,
                "FORGE_LAYOUT_DIR": str(root),
                "FORGE_HOST": "testhost",
            }
            proc = subprocess.run(
                [
                    sys.executable,
                    str(_FORGE_BIN),
                    "layout",
                    "save",
                    "mydesk",
                    "--tree-file",
                    str(tree),
                ],
                capture_output=True,
                text=True,
                check=False,
                env=env,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            dest = root / "hosts" / "testhost" / "mydesk.json"
            self.assertTrue(dest.is_file(), proc.stderr)
            disk = json.loads(dest.read_text(encoding="utf-8"))
            self.assertIn("tiles", disk)
            self.assertEqual(proc.stdout.strip(), "")
            self.assertIn(str(dest), proc.stderr)
            self.assertIn("host=testhost", proc.stderr)
            self.assertIn("name=mydesk", proc.stderr)

    def test_save_requires_name(self):
        tree = _FIXTURES / "tree-perfect.json"
        proc = subprocess.run(
            [
                sys.executable,
                str(_FORGE_BIN),
                "layout",
                "save",
                "--tree-file",
                str(tree),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("need profile name", proc.stderr)

    def test_workon_command_gone(self):
        proc = subprocess.run(
            [sys.executable, str(_FORGE_BIN), "workon", "list"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(proc.returncode, 0)


if __name__ == "__main__":
    unittest.main()
