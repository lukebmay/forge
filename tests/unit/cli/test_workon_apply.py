#!/usr/bin/env python3
"""Unit tests for scripts/forge/workon_apply.py (WR3 pure apply helpers)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "workon"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from workon_apply import (  # noqa: E402
    MODE_RECONCILE,
    MODE_STEPS,
    actions_to_extension_steps,
    detect_workon_mode,
    open_action_to_launch_fields,
    partition_plan_actions,
    slot_to_monitor_path,
    slot_to_tree_path,
    window_tile_selector,
)
from workon_plan import plan_reconcile  # noqa: E402


def _load(name: str):
    return json.loads((_FIXTURES / name).read_text(encoding="utf-8"))


class TestDetectMode(unittest.TestCase):
    def test_v1_steps(self):
        self.assertEqual(
            detect_workon_mode({"version": 1, "steps": []}),
            MODE_STEPS,
        )

    def test_v2_roles(self):
        self.assertEqual(
            detect_workon_mode(_load("profile-dev-v2.json")),
            MODE_RECONCILE,
        )

    def test_mode_steps(self):
        self.assertEqual(
            detect_workon_mode({"version": 2, "mode": "steps", "steps": [{"op": "ping"}]}),
            MODE_STEPS,
        )

    def test_roles_without_version(self):
        data = {
            "roles": [
                {
                    "id": "x",
                    "match": {"class": "X"},
                    "open": {"app": "a"},
                    "slot": "mon0.a",
                }
            ]
        }
        self.assertEqual(detect_workon_mode(data), MODE_RECONCILE)

    def test_force_launch_with_steps(self):
        self.assertEqual(
            detect_workon_mode(
                {"version": 2, "roles": [{"id": "x"}], "steps": [{"op": "ping"}]},
                force_launch=True,
            ),
            MODE_STEPS,
        )

    def test_force_launch_roles_only_errors(self):
        with self.assertRaisesRegex(ValueError, "force-launch"):
            detect_workon_mode(_load("profile-dev-v2.json"), force_launch=True)

    def test_mode_steps_without_steps_errors(self):
        with self.assertRaisesRegex(ValueError, "steps"):
            detect_workon_mode({"mode": "steps"})

    def test_empty_object_errors(self):
        with self.assertRaisesRegex(ValueError, "cannot determine"):
            detect_workon_mode({})

    def test_version_1_implies_steps(self):
        # validate_profile still requires steps[]; mode only selects path
        self.assertEqual(detect_workon_mode({"version": 1}), MODE_STEPS)


class TestSlotPaths(unittest.TestCase):
    def test_slot_to_monitor_path(self):
        self.assertEqual(slot_to_monitor_path("mon0.left-tab"), "path:mo0ws0")
        self.assertEqual(slot_to_monitor_path("mon1.comms"), "path:mo1ws0")
        self.assertEqual(slot_to_monitor_path("primary.overflow"), "path:mo0ws0")
        self.assertEqual(slot_to_monitor_path("mon2", workspace=1), "path:mo2ws1")

    def test_slot_to_tree_path(self):
        self.assertEqual(slot_to_tree_path("mon1.term"), "mo1ws0")


class TestActionMapping(unittest.TestCase):
    def test_window_tile_selector(self):
        self.assertEqual(window_tile_selector({"windowId": 42}), "id:42")
        self.assertEqual(
            window_tile_selector({"path": "mo0ws0/0/1"}), "path:mo0ws0/0/1"
        )
        self.assertEqual(
            window_tile_selector({"path": "path:mo0ws0"}), "path:mo0ws0"
        )
        self.assertIsNone(window_tile_selector({}))

    def test_actions_to_extension_steps_skips_open(self):
        actions = [
            {"op": "ensure_layout", "slot": "mon0", "mode": "hsplit"},
            {"op": "open", "role": "grok", "open": {"app": "Grok"}, "slot": "mon0.left-tab"},
            {
                "op": "move",
                "role": "x",
                "windowId": 9,
                "slot": "mon1.comms",
            },
            {"op": "park", "windowId": 3, "slot": "mon0.overflow"},
        ]
        steps = actions_to_extension_steps(actions)
        # layout uses window id on same mon (park id:3 → mon0); mon path is move dest only
        self.assertEqual(
            steps,
            [
                {"op": "layout", "mode": "hsplit", "selector": "id:3"},
                {"op": "move", "tile": "id:9", "dest": "path:mo1ws0"},
                {"op": "move", "tile": "id:3", "dest": "path:mo0ws0"},
            ],
        )

    def test_ensure_layout_skipped_without_window(self):
        # Empty desk: layout not feasible until something is open
        steps = actions_to_extension_steps(
            [
                {"op": "ensure_layout", "slot": "mon0", "mode": "hsplit"},
                {"op": "ensure_layout", "slot": "mon0.left-tab", "mode": "tabbed"},
                {"op": "open", "role": "a", "open": {"app": "x"}, "slot": "mon0.a"},
            ]
        )
        self.assertEqual(steps, [])

    def test_partition(self):
        ext, opens = partition_plan_actions(
            [
                {"op": "ensure_layout", "slot": "mon0", "mode": "hsplit"},
                {"op": "open", "role": "a"},
                {"op": "move", "windowId": 1, "slot": "mon0.a"},
            ]
        )
        self.assertEqual(len(ext), 2)
        self.assertEqual(len(opens), 1)
        self.assertEqual(opens[0]["role"], "a")

    def test_open_action_to_launch_fields(self):
        fields = open_action_to_launch_fields(
            {
                "op": "open",
                "role": "grok",
                "slot": "mon1.comms",
                "open": {
                    "app": "Grok",
                    "wmClass": "Google-chrome",
                    "timeout": 25000,
                },
            }
        )
        self.assertEqual(fields["app"], "Grok")
        self.assertEqual(fields["wm_class"], "Google-chrome")
        self.assertEqual(fields["timeout"], 25000)
        self.assertEqual(fields["monitor"], 1)
        self.assertEqual(fields["tree_path"], "mo1ws0")

    def test_open_respects_explicit_path(self):
        fields = open_action_to_launch_fields(
            {
                "op": "open",
                "slot": "mon0.term",
                "open": {"app": "ghostty", "treePath": "mo0ws0/1"},
            }
        )
        self.assertEqual(fields["tree_path"], "mo0ws0/1")
        self.assertEqual(fields["monitor"], 0)


class TestPlanToStepsFixture(unittest.TestCase):
    def test_perfect_no_steps(self):
        plan = plan_reconcile(_load("tree-perfect.json"), _load("profile-dev-v2.json"))
        self.assertTrue(plan["nothingToDo"])
        self.assertEqual(actions_to_extension_steps(plan["actions"]), [])
        self.assertEqual(partition_plan_actions(plan["actions"]), ([], []))

    def test_empty_opens_only(self):
        plan = plan_reconcile(_load("tree-empty.json"), _load("profile-dev-v2.json"))
        ext, opens = partition_plan_actions(plan["actions"])
        self.assertEqual(len(opens), 7)
        steps = actions_to_extension_steps(ext)
        # ensure_layout present in plan but not feasible (no window id) — skip
        # so apply does not fail layout before launches
        self.assertEqual(steps, [])

    def test_doubled_moves_and_parks(self):
        plan = plan_reconcile(
            _load("tree-doubled-black.json"), _load("profile-dev-v2.json")
        )
        steps = actions_to_extension_steps(plan["actions"])
        ops = [s["op"] for s in steps]
        self.assertIn("layout", ops)
        self.assertIn("move", ops)
        for s in steps:
            if s["op"] == "move":
                self.assertTrue(s["tile"].startswith("id:"))
                # mon/overflow parks use path:mo…; tab fold uses dest id:anchor
                self.assertTrue(
                    s["dest"].startswith("path:mo") or s["dest"].startswith("id:"),
                    f"unexpected move dest {s['dest']!r}",
                )
            if s["op"] == "layout":
                # must be window selector, not mon path
                self.assertTrue(
                    s["selector"].startswith("id:"),
                    f"layout selector must be id:, got {s['selector']!r}",
                )

    def test_structure_repair_tab_fold_steps(self):
        """Flat same-mon windows → layout + move-into-group (no open)."""
        forest = {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "layout": "HSPLIT",
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 101,
                            "wmClass": "Google-chrome",
                            "title": "Google Chrome",
                            "monitor": 0,
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 102,
                            "wmClass": "Google-chrome",
                            "title": "Grok",
                            "monitor": 0,
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 103,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 0,
                            "children": [],
                        },
                    ],
                },
                {
                    "nodeType": "MONITOR",
                    "id": "mo1ws0",
                    "layout": "HSPLIT",
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 201,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 1,
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 202,
                            "wmClass": "Google-chrome",
                            "title": "YouTube",
                            "monitor": 1,
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 203,
                            "wmClass": "Google-chrome",
                            "title": "Gmail",
                            "monitor": 1,
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 204,
                            "wmClass": "Google-chrome",
                            "title": "Voice",
                            "monitor": 1,
                            "children": [],
                        },
                    ],
                },
            ],
        }
        plan = plan_reconcile(forest, _load("profile-dev-v2.json"))
        self.assertFalse(plan["nothingToDo"])
        self.assertGreater(plan["counts"]["structure"], 0)
        self.assertEqual(plan["counts"]["opened"], 0)
        steps = actions_to_extension_steps(plan["actions"])
        self.assertIn(
            {"op": "layout", "mode": "tabbed", "selector": "id:101"},
            steps,
        )
        self.assertIn({"op": "move", "tile": "id:102", "dest": "id:101"}, steps)
        self.assertIn(
            {"op": "layout", "mode": "tabbed", "selector": "id:202"},
            steps,
        )
        self.assertIn({"op": "move", "tile": "id:203", "dest": "id:202"}, steps)
        self.assertIn({"op": "move", "tile": "id:204", "dest": "id:202"}, steps)

    def test_ensure_layout_with_window_ids_no_move(self):
        steps = actions_to_extension_steps(
            [
                {
                    "op": "ensure_layout",
                    "slot": "mon0.left-tab",
                    "mode": "tabbed",
                    "windowIds": [10, 11],
                }
            ]
        )
        self.assertEqual(
            steps,
            [
                {"op": "layout", "mode": "tabbed", "selector": "id:10"},
                {"op": "move", "tile": "id:11", "dest": "id:10"},
            ],
        )


if __name__ == "__main__":
    unittest.main()
