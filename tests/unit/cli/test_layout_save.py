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
    apply_description,
    capture_tiles_profile,
    format_capture_stderr,
    profile_for_output,
    resolve_save_description,
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


class TestResolveSaveDescription(unittest.TestCase):
    def test_noninteractive_new_uses_auto(self):
        got = resolve_save_description(
            auto="mon0: ghostty.",
            existing=None,
            interactive=False,
        )
        self.assertEqual(got, "mon0: ghostty.")

    def test_noninteractive_keeps_existing(self):
        got = resolve_save_description(
            auto="mon0: ghostty.",
            existing="My custom desk",
            interactive=False,
        )
        self.assertEqual(got, "My custom desk")

    def test_flag_description_wins(self):
        got = resolve_save_description(
            auto="auto",
            existing="old",
            description_flag="from-flag",
            interactive=False,
        )
        self.assertEqual(got, "from-flag")

    def test_no_description_omits(self):
        got = resolve_save_description(
            auto="auto",
            existing="old",
            no_description=True,
            interactive=True,
        )
        self.assertIsNone(got)

    def test_interactive_no_existing_prefill_auto(self):
        edits: list[tuple[str, str]] = []

        def edit(prompt: str, prefill: str) -> str:
            edits.append((prompt, prefill))
            return prefill  # Enter accepts default

        got = resolve_save_description(
            auto="mon0 (hsplit): a, b.",
            existing=None,
            interactive=True,
            edit_line_fn=edit,
            print_fn=lambda *a, **k: None,
        )
        self.assertEqual(got, "mon0 (hsplit): a, b.")
        self.assertEqual(len(edits), 1)
        self.assertEqual(edits[0][1], "mon0 (hsplit): a, b.")

    def test_interactive_keep(self):
        def boom(prompt: str, prefill: str) -> str:
            raise AssertionError("edit should not run on Keep")

        got = resolve_save_description(
            auto="auto-line",
            existing="keep-me",
            interactive=True,
            profile_name="dev",
            input_fn=lambda _p: "",  # Enter → K
            edit_line_fn=boom,
            print_fn=lambda *a, **k: None,
        )
        self.assertEqual(got, "keep-me")

    def test_interactive_default_prefill_auto(self):
        edits: list[str] = []

        def edit(_prompt: str, prefill: str) -> str:
            edits.append(prefill)
            return prefill

        got = resolve_save_description(
            auto="auto-line",
            existing="old-custom",
            interactive=True,
            input_fn=lambda _p: "d",
            edit_line_fn=edit,
            print_fn=lambda *a, **k: None,
        )
        self.assertEqual(got, "auto-line")
        self.assertEqual(edits, ["auto-line"])

    def test_interactive_edit_prefill_existing(self):
        edits: list[str] = []

        def edit(_prompt: str, prefill: str) -> str:
            edits.append(prefill)
            return prefill + "!"

        got = resolve_save_description(
            auto="auto-line",
            existing="old-custom",
            interactive=True,
            input_fn=lambda _p: "e",
            edit_line_fn=edit,
            print_fn=lambda *a, **k: None,
        )
        self.assertEqual(got, "old-custom!")
        self.assertEqual(edits, ["old-custom"])

    def test_apply_description(self):
        p = {"tiles": {}}
        apply_description(p, "hello")
        self.assertEqual(p["description"], "hello")
        apply_description(p, None)
        self.assertNotIn("description", p)


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
        # Non-interactive: auto description when none existing
        self.assertEqual(
            data.get("description"),
            "mon0 (hsplit): tabgroup, ghostty. mon1 (hsplit): ghostty, tabgroup.",
        )
        self.assertIn("forge layout save:", proc.stderr)
        self.assertIn("windows=7", proc.stderr)
        self.assertIn("stdout only", proc.stderr)
        self.assertIn("name=mydesk", proc.stderr)

    def test_stdout_description_flag(self):
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
                "--description",
                "Custom desk",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = json.loads(proc.stdout)
        self.assertEqual(data.get("description"), "Custom desk")

    def test_stdout_no_description(self):
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
                "--no-description",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = json.loads(proc.stdout)
        self.assertNotIn("description", data)

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
            self.assertTrue(disk.get("description"))
            self.assertEqual(proc.stdout.strip(), "")
            self.assertIn(str(dest), proc.stderr)
            self.assertIn("host=testhost", proc.stderr)
            self.assertIn("name=mydesk", proc.stderr)

    def test_rewrite_keeps_custom_description(self):
        tree = _FIXTURES / "tree-perfect.json"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            dest = root / "hosts" / "testhost" / "mydesk.json"
            dest.parent.mkdir(parents=True)
            dest.write_text(
                json.dumps({"description": "Keep me", "tiles": {"mon0": ["x"]}}),
                encoding="utf-8",
            )
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
            disk = json.loads(dest.read_text(encoding="utf-8"))
            self.assertEqual(disk.get("description"), "Keep me")

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
