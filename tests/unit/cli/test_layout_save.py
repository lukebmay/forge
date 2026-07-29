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
        # mon0: tabbed pair + ghostty (medium tab key)
        self.assertEqual(len(mon0), 2)
        self.assertIsInstance(mon0[0], dict)
        self.assertIn("tab", mon0[0])
        self.assertEqual(len(mon0[0]["tab"]), 2)
        # mon1: ghostty + tabbed triple
        self.assertEqual(len(mon1), 2)
        self.assertIsInstance(mon1[1], dict)
        self.assertEqual(mon1[1].get("tab"), ["YouTube", "Gmail", "Google Voice"])

    def test_chrome_string_cells_when_inferable(self):
        forest = _load("tree-perfect.json")
        profile = profile_for_output(capture_tiles_profile(forest))
        cells = profile[0][0]["tab"]
        # Inference re-derives class + title~= from the app string
        self.assertEqual(cells[0], "google-chrome")
        self.assertEqual(cells[1], "Grok")

    def test_validates_sugar(self):
        forest = _load("tree-perfect.json")
        profile = profile_for_output(capture_tiles_profile(forest))
        ir = validate_reconcile_profile(profile, mon_count=2)
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
        # Single mon → top-level panes (not mon wrapper); tab is medium-tagged
        self.assertIsInstance(profile, list)
        self.assertEqual(len(profile), 1)
        pane = profile[0]
        self.assertIsInstance(pane, dict)
        self.assertIn("tab", pane)
        cells = pane["tab"]
        self.assertEqual(len(cells), 2)
        stems = []
        for c in cells:
            if isinstance(c, str):
                stems.append(c)
            elif isinstance(c, dict):
                stems.append(c.get("app") or c.get("id") or "")
        self.assertTrue(any("ghostty" in s for s in stems))
        self.assertTrue(any("nautilus" in s for s in stems))

    def test_stacked_pair_emits_layout_object(self):
        forest = _load("tree-stacked-pair.json")
        profile = profile_for_output(capture_tiles_profile(forest))
        self.assertIsInstance(profile, list)
        self.assertEqual(len(profile), 1)
        pane = profile[0]
        self.assertIsInstance(pane, dict)
        self.assertIn("stack", pane)
        self.assertIsInstance(pane["stack"], list)
        self.assertEqual(len(pane["stack"]), 2)
        self.assertNotIsInstance(pane, list)

    def test_stacked_save_desugars_to_stacked_mode(self):
        forest = _load("tree-stacked-pair.json")
        sugar = profile_for_output(capture_tiles_profile(forest))
        ir = validate_reconcile_profile(sugar)
        kids = ir["layout"]["mon0"]["children"]
        self.assertEqual(len(kids), 1)
        self.assertEqual(kids[0]["layout"], "stacked")
        self.assertEqual(len(kids[0]["roles"]), 2)
        tab_sugar = profile_for_output(
            capture_tiles_profile(_load("tree-ghostty-nautilus-tab.json"))
        )
        self.assertIn("tab", tab_sugar[0])
        tab_ir = validate_reconcile_profile(tab_sugar)
        self.assertEqual(tab_ir["layout"]["mon0"]["children"][0]["layout"], "tabbed")

    def test_single_mon_tab_plus_vsplit_not_dual_mon_roundtrip(self):
        """Green desk: tab | vsplit — bare array stays mon0 (not dual mon)."""
        intended = {
            "tiles": {
                "mon0": [
                    {"tab": ["Grok", "google-chrome"]},
                    {
                        "vsplit": [
                            "ghostty",
                            {
                                "app": "gnome-terminal",
                                "class": "Gnome-terminal",
                                "title~=": "Terminal",
                            },
                        ],
                    },
                ]
            }
        }
        sugar = profile_for_output(intended)
        # Tagged panes: bare array is fine; offline still mon0
        self.assertIsInstance(sugar, list)
        self.assertEqual(len(sugar), 2)
        self.assertIn("tab", sugar[0])
        self.assertIn("vsplit", sugar[1])

        ir = validate_reconcile_profile(sugar)
        self.assertEqual(set(ir["layout"].keys()), {"mon0"})
        kids = ir["layout"]["mon0"]["children"]
        self.assertEqual(len(kids), 2)
        self.assertEqual(kids[0].get("layout"), "tabbed")
        self.assertEqual(kids[0].get("roles"), ["Grok", "google-chrome"])
        self.assertEqual(kids[1].get("split"), "vsplit")

        ir1 = validate_reconcile_profile(sugar, mon_count=1)
        self.assertEqual(set(ir1["layout"].keys()), {"mon0"})

        # Explicit mon keys never fold
        explicit = {"mon0": sugar[0:1], "mon1": [sugar[1]]}
        ir_ex = validate_reconcile_profile(explicit, mon_count=1)
        self.assertIn("mon0", ir_ex["layout"])
        self.assertIn("mon1", ir_ex["layout"])
        self.assertTrue(ir_ex.get("monExplicit"))

    def test_save_monitors_flag_emits_mon_keys(self):
        forest = _load("tree-perfect.json")
        raw = capture_tiles_profile(forest)
        out = profile_for_output(raw, monitors=True)
        self.assertIsInstance(out, dict)
        self.assertIn("mon0", out)
        self.assertIn("mon1", out)
        self.assertNotIn("tiles", out)

    def test_container_aliases_load(self):
        for sugar in (
            {"t": ["a", "b"]},
            {"tab": ["a", "b"]},
            {"tabbed": ["a", "b"]},
            {"layout": "tab", "content": ["a", "b"]},
        ):
            ir = validate_reconcile_profile([sugar])
            self.assertEqual(ir["layout"]["mon0"]["children"][0]["layout"], "tabbed")
        for sugar in (
            {"s": ["a", "b"]},
            {"stack": ["a", "b"]},
            {"stacked": ["a", "b"]},
        ):
            ir = validate_reconcile_profile([sugar])
            self.assertEqual(ir["layout"]["mon0"]["children"][0]["layout"], "stacked")
        for sugar in (
            {"h": ["ghostty", "firefox"]},
            {"hsplit": ["ghostty", "firefox"]},
            {"horizontal": ["ghostty", "firefox"]},
            {"v": ["ghostty", "firefox"]},
            {"vsplit": ["ghostty", "firefox"]},
        ):
            ir = validate_reconcile_profile([sugar])
            kids = ir["layout"]["mon0"]["children"]
            self.assertEqual(len(kids), 1)
            self.assertIn(kids[0].get("split"), ("hsplit", "vsplit"))

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

        def _collect(node, labels: list) -> None:
            if isinstance(node, str):
                labels.append(node)
            elif isinstance(node, list):
                for x in node:
                    _collect(x, labels)
            elif isinstance(node, dict):
                for k in ("tab", "stack", "hsplit", "vsplit", "content", "children"):
                    if k in node:
                        _collect(node[k], labels)
                if node.get("app"):
                    labels.append(str(node["app"]))

        labels: list = []
        _collect(profile, labels)
        ghost = [x for x in labels if "ghostty" in str(x).lower()]
        self.assertGreaterEqual(len(ghost), 2)
        ir = normalize_profile(profile, mon_count=2)
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

    def test_stacked_fixture_round_trip(self):
        forest = _load("tree-stacked-pair.json")
        sugar = profile_for_output(capture_tiles_profile(forest))
        ir = normalize_profile(sugar)
        self.assertEqual(ir["layout"]["mon0"]["children"][0]["layout"], "stacked")
        plan = plan_reconcile(forest, sugar)
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertEqual(len(plan["roles"]), 2)
        # save → normalize → plan on same forest: structure empty / nothingToDo
        self.assertTrue(plan["nothingToDo"], plan)
        self.assertEqual(plan["counts"].get("structure", 0), 0)
        self.assertEqual(plan["actions"], [])
        self.assertFalse(plan.get("thrashState", {}).get("thrashed", False))
        ensures = [
            a
            for a in plan.get("actions") or []
            if a.get("op") == "ensure_layout"
            and a.get("mode") in ("tabbed", "stacked")
        ]
        self.assertEqual(ensures, [])


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
        # Bare dual-mon array; pure-auto description omitted; medium tab key
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0][0], {"tab": ["google-chrome", "Grok"]})
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
