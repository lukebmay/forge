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
        # Bare dual-mon array (no tiles wrapper / mon keys / empty floating)
        self.assertIsInstance(profile, list)
        self.assertEqual(len(profile), 2)
        mon0, mon1 = profile
        # mon0: tabbed pair + ghostty
        self.assertEqual(len(mon0), 2)
        self.assertIsInstance(mon0[0], list)
        self.assertEqual(len(mon0[0]), 2)
        # mon1: ghostty + tabbed triple
        self.assertEqual(len(mon1), 2)
        self.assertIsInstance(mon1[1], list)
        self.assertEqual(len(mon1[1]), 3)
        # mon1 tabs: strings when PWA inference is enough
        mon1_tabs = mon1[1]
        self.assertEqual(mon1_tabs, ["YouTube", "Gmail", "Google Voice"])

    def test_chrome_string_cells_when_inferable(self):
        forest = _load("tree-perfect.json")
        profile = profile_for_output(capture_tiles_profile(forest))
        cells = profile[0][0]
        # Inference re-derives class + title~= from the app string
        self.assertEqual(cells[0], "google-chrome")
        self.assertEqual(cells[1], "Grok")

    def test_validates_sugar(self):
        forest = _load("tree-perfect.json")
        profile = profile_for_output(capture_tiles_profile(forest))
        ir = validate_reconcile_profile(profile)
        self.assertEqual(ir["version"], 2)
        self.assertEqual(len(ir["roles"]), 7)

    def test_skips_empty_workspace_copies(self):
        forest = _load("tree-perfect.json")
        profile = profile_for_output(capture_tiles_profile(forest))
        self.assertIsInstance(profile, list)
        self.assertEqual(len(profile), 2)

    def test_tabbed_ghostty_nautilus(self):
        forest = _load("tree-ghostty-nautilus-tab.json")
        profile = profile_for_output(capture_tiles_profile(forest))
        # Single mon → top-level panes (not mon wrapper)
        self.assertIsInstance(profile, list)
        self.assertEqual(len(profile), 1)
        self.assertIsInstance(profile[0], list)
        self.assertEqual(len(profile[0]), 2)
        cells = profile[0]
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
        for mon_body in profile:
            for pane in mon_body:
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

    def test_custom_description_wraps_tiles_array(self):
        forest = _load("tree-perfect.json")
        raw = capture_tiles_profile(forest)
        apply_description(raw, "My custom desk")
        profile = profile_for_output(raw)
        self.assertIsInstance(profile, dict)
        self.assertEqual(profile.get("description"), "My custom desk")
        self.assertIsInstance(profile.get("tiles"), list)
        self.assertEqual(len(profile["tiles"]), 2)
        self.assertNotIn("mon0", profile)

    def test_auto_description_omitted_for_bare_array(self):
        forest = _load("tree-perfect.json")
        raw = capture_tiles_profile(forest)
        from layout_save import auto_description_for_profile

        auto = auto_description_for_profile(raw)
        apply_description(raw, auto)
        profile = profile_for_output(raw)
        self.assertIsInstance(profile, list)

    def test_internal_tiles_map_still_validates(self):
        """capture_tiles_profile keeps mon map until profile_for_output."""
        forest = _load("tree-perfect.json")
        raw = capture_tiles_profile(forest)
        self.assertIn("mon0", raw["tiles"])
        self.assertIn("mon1", raw["tiles"])


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

    def test_interactive_no_existing_keep_uses_auto(self):
        def boom(_prompt: str, prefill: str) -> str:
            raise AssertionError("edit should not run on Keep")

        lines: list[str] = []

        def pr(*a, **_k):
            lines.append(" ".join(str(x) for x in a))

        got = resolve_save_description(
            auto="mon0 (hsplit): a, b.",
            existing=None,
            interactive=True,
            input_fn=lambda _p: "",  # Enter → Keep
            edit_line_fn=boom,
            print_fn=pr,
        )
        self.assertEqual(got, "mon0 (hsplit): a, b.")
        self.assertTrue(any("Current Description:" in ln for ln in lines))
        # Value must not include the word Description (label is separate).
        self.assertNotIn("Description: mon0", got)

    def test_interactive_keep(self):
        def boom(prompt: str, prefill: str) -> str:
            raise AssertionError("edit should not run on Keep")

        got = resolve_save_description(
            auto="auto-line",
            existing="keep-me",
            interactive=True,
            profile_name="dev",
            input_fn=lambda _p: "",  # Enter → Keep
            edit_line_fn=boom,
            print_fn=lambda *a, **k: None,
        )
        self.assertEqual(got, "keep-me")

    def test_interactive_edit_prefill_current_existing(self):
        edits: list[tuple[str, str]] = []

        def edit(prompt: str, prefill: str) -> str:
            edits.append((prompt, prefill))
            return prefill + "!"

        def choose(prompt: str) -> str:
            self.assertIn("Keep, Edit", prompt)
            self.assertTrue(prompt.endswith(" ") or prompt.rstrip() != prompt)
            return "e"

        got = resolve_save_description(
            auto="auto-line",
            existing="old-custom",
            interactive=True,
            input_fn=choose,
            edit_line_fn=edit,
            print_fn=lambda *a, **k: None,
        )
        self.assertEqual(got, "old-custom!")
        self.assertEqual(len(edits), 1)
        self.assertIn("New Description:", edits[0][0])
        self.assertEqual(edits[0][1], "old-custom")
        # Prefill is value-only — no label word.
        self.assertFalse(edits[0][1].lower().startswith("description"))

    def test_interactive_edit_prefill_auto_when_new(self):
        edits: list[str] = []

        def edit(_prompt: str, prefill: str) -> str:
            edits.append(prefill)
            return prefill

        got = resolve_save_description(
            auto="mon0 (hsplit): tabgroup, ghostty.",
            existing=None,
            interactive=True,
            input_fn=lambda _p: "e",
            edit_line_fn=edit,
            print_fn=lambda *a, **k: None,
        )
        self.assertEqual(got, "mon0 (hsplit): tabgroup, ghostty.")
        self.assertEqual(edits, ["mon0 (hsplit): tabgroup, ghostty."])

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
        # Bare dual-mon array; pure-auto description omitted
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0][0], ["google-chrome", "Grok"])
        self.assertEqual(data[0][1], "ghostty")
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
        self.assertIsInstance(data.get("tiles"), list)
        self.assertEqual(len(data["tiles"]), 2)

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
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 2)

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
            self.assertIsInstance(disk, list)
            self.assertEqual(len(disk), 2)
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
            self.assertIsInstance(disk.get("tiles"), list)

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
