#!/usr/bin/env python3
"""Unit tests for scripts/forge/layout_apply.py (WR3 pure apply helpers)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "layout"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from layout_apply import (  # noqa: E402
    GHOSTTY_MULTI_INSTANCE_FLAG,
    MODE_RECONCILE,
    MODE_STEPS,
    actions_to_extension_steps,
    detect_layout_mode,
    ghostty_multi_instance_argv,
    is_ghostty_launch_target,
    open_action_to_launch_fields,
    partition_plan_actions,
    residual_follow_up,
    rewrite_ghostty_launch_app,
    slot_to_monitor_path,
    slot_to_tree_path,
    window_tile_selector,
)
from layout_plan import plan_reconcile  # noqa: E402


def _load(name: str):
    return json.loads((_FIXTURES / name).read_text(encoding="utf-8"))


class TestDetectMode(unittest.TestCase):
    def test_v1_steps(self):
        self.assertEqual(
            detect_layout_mode({"version": 1, "steps": []}),
            MODE_STEPS,
        )

    def test_v2_roles(self):
        self.assertEqual(
            detect_layout_mode(_load("profile-dev-v2.json")),
            MODE_RECONCILE,
        )

    def test_mode_steps(self):
        self.assertEqual(
            detect_layout_mode({"version": 2, "mode": "steps", "steps": [{"op": "ping"}]}),
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
        self.assertEqual(detect_layout_mode(data), MODE_RECONCILE)

    def test_tiles_without_roles(self):
        self.assertEqual(
            detect_layout_mode({"tiles": {"mon0": ["ghostty"]}}),
            MODE_RECONCILE,
        )

    def test_tiles_with_version_2(self):
        self.assertEqual(
            detect_layout_mode({"version": 2, "tiles": {"mon0": ["a", "b"]}}),
            MODE_RECONCILE,
        )

    def test_bare_array(self):
        self.assertEqual(
            detect_layout_mode([["ghostty"], ["firefox"]]),
            MODE_RECONCILE,
        )

    def test_tiles_array_key(self):
        self.assertEqual(
            detect_layout_mode({"tiles": [["a", "b"], ["c"]]}),
            MODE_RECONCILE,
        )

    def test_force_launch_with_steps(self):
        self.assertEqual(
            detect_layout_mode(
                {"version": 2, "roles": [{"id": "x"}], "steps": [{"op": "ping"}]},
                force_launch=True,
            ),
            MODE_STEPS,
        )

    def test_force_launch_roles_only_errors(self):
        with self.assertRaisesRegex(ValueError, "force-launch"):
            detect_layout_mode(_load("profile-dev-v2.json"), force_launch=True)

    def test_mode_steps_without_steps_errors(self):
        with self.assertRaisesRegex(ValueError, "steps"):
            detect_layout_mode({"mode": "steps"})

    def test_empty_object_errors(self):
        with self.assertRaisesRegex(ValueError, "cannot determine"):
            detect_layout_mode({})

    def test_version_1_implies_steps(self):
        # validate_profile still requires steps[]; mode only selects path
        self.assertEqual(detect_layout_mode({"version": 1}), MODE_STEPS)


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
        # Placement moves first; layout uses park id:3 on mon0 after moves.
        self.assertEqual(
            steps,
            [
                {"op": "move", "tile": "id:9", "dest": "path:mo1ws0"},
                {"op": "move", "tile": "id:3", "dest": "path:mo0ws0"},
                {"op": "layout", "mode": "hsplit", "selector": "id:3"},
            ],
        )

    def test_soft_park_uses_dest_window_id(self):
        steps = actions_to_extension_steps(
            [
                {
                    "op": "park",
                    "windowId": 602,
                    "path": "mo1ws0/0",
                    "slot": "mon0.overflow",
                    "destWindowId": 601,
                }
            ]
        )
        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0]["op"], "move")
        self.assertEqual(steps[0]["tile"], "id:602")
        self.assertEqual(steps[0]["dest"], "id:601")

    def test_focus_actions_last(self):
        steps = actions_to_extension_steps(
            [
                {"op": "focus", "selector": "id:102", "reason": "profile"},
                {
                    "op": "move",
                    "windowId": 9,
                    "slot": "mon0.term",
                },
                {"op": "focus", "selector": "id:101", "reason": "active"},
            ]
        )
        self.assertEqual(
            steps,
            [
                {"op": "move", "tile": "id:9", "dest": "path:mo0ws0"},
                {"op": "focus", "selector": "id:102"},
                {"op": "focus", "selector": "id:101"},
            ],
        )

    def test_actions_to_extension_steps_close(self):
        steps = actions_to_extension_steps(
            [
                {"op": "close", "windowId": 42, "path": "mo0ws0/2"},
                {"op": "open", "role": "x", "open": {"app": "x"}, "slot": "mon0.a"},
            ]
        )
        self.assertEqual(steps, [{"op": "close", "selector": "id:42"}])

    def test_actions_to_extension_steps_close_force(self):
        steps = actions_to_extension_steps(
            [{"op": "close", "windowId": 7}],
            force_close=True,
        )
        self.assertEqual(
            steps, [{"op": "close", "selector": "id:7", "force": True}]
        )

    def test_clean_plan_maps_to_close_steps(self):
        plan = plan_reconcile(
            _load("tree-stray-wrong-mon.json"),
            {
                "version": 2,
                "layout": {
                    "mon0": {
                        "children": [{"id": "term", "roles": ["ghostty"]}]
                    }
                },
                "roles": [
                    {
                        "id": "ghostty",
                        "match": {"class": "com.mitchellh.ghostty"},
                        "open": {"app": "ghostty"},
                        "slot": "mon0.term",
                    }
                ],
            },
            clean=True,
        )
        steps = actions_to_extension_steps(plan["actions"])
        close_sels = {
            s["selector"] for s in steps if s.get("op") == "close"
        }
        self.assertEqual(close_sels, {"id:602", "id:603"})
        self.assertFalse(any(s.get("op") == "move" and "overflow" in str(s) for s in steps))

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

    def test_residual_follow_up_moves_despite_residual_open(self):
        """LF3: residual open (chrome lag) must not drop mon-fix moves."""
        residual_ext = [
            {
                "op": "move",
                "role": "ghostty-2",
                "windowId": 501,
                "slot": "mon1.ghostty-2",
            },
            {"op": "ensure_layout", "slot": "mon1", "mode": "hsplit"},
        ]
        residual_open = [
            {
                "op": "open",
                "role": "google-chrome",
                "open": {"app": "google-chrome"},
                "slot": "mon0.s0",
            }
        ]
        steps, still = residual_follow_up(residual_ext, residual_open)
        self.assertEqual(still, ["google-chrome"])
        move = [s for s in steps if s.get("op") == "move"]
        self.assertEqual(len(move), 1)
        self.assertEqual(move[0]["tile"], "id:501")
        self.assertEqual(move[0]["dest"], "path:mo1ws0")

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
        # LF4: bare ghostty → multi-instance argv (not stock single-instance desktop)
        self.assertIn(GHOSTTY_MULTI_INSTANCE_FLAG, fields["app"].split())
        self.assertTrue(fields["app"].startswith("ghostty"))

    def test_open_ghostty_desktop_id_rewrites_multi_instance(self):
        fields = open_action_to_launch_fields(
            {
                "op": "open",
                "role": "ghostty-2",
                "slot": "mon1.ghostty-2",
                "open": {
                    "app": "com.mitchellh.ghostty",
                    "wmClass": "com.mitchellh.ghostty",
                },
            }
        )
        self.assertEqual(fields["monitor"], 1)
        self.assertEqual(fields["wm_class"], "com.mitchellh.ghostty")
        parts = fields["app"].split()
        self.assertEqual(parts[0], "ghostty")
        self.assertEqual(parts[1], GHOSTTY_MULTI_INSTANCE_FLAG)
        self.assertNotIn("--gtk-single-instance=true", fields["app"])


class TestGhosttyMultiInstanceLaunch(unittest.TestCase):
    """LF4: Ghostty layout open must not use single-instance desktop default."""

    def test_is_ghostty_targets(self):
        self.assertTrue(is_ghostty_launch_target("ghostty"))
        self.assertTrue(is_ghostty_launch_target("Ghostty"))
        self.assertTrue(is_ghostty_launch_target("com.mitchellh.ghostty"))
        self.assertTrue(is_ghostty_launch_target("com.mitchellh.ghostty.desktop"))
        self.assertTrue(
            is_ghostty_launch_target(
                "ghostty", desktop="/usr/share/applications/com.mitchellh.ghostty.desktop"
            )
        )
        self.assertTrue(
            is_ghostty_launch_target("ghostty --gtk-single-instance=false")
        )
        self.assertTrue(is_ghostty_launch_target("/usr/bin/ghostty"))
        self.assertFalse(is_ghostty_launch_target("firefox"))
        self.assertFalse(is_ghostty_launch_target("google-chrome"))
        self.assertFalse(is_ghostty_launch_target(""))

    def test_multi_instance_argv(self):
        argv = ghostty_multi_instance_argv("ghostty")
        self.assertEqual(argv, ["ghostty", GHOSTTY_MULTI_INSTANCE_FLAG])
        argv2 = ghostty_multi_instance_argv(
            "ghostty --gtk-single-instance=true --foo=1"
        )
        self.assertEqual(argv2[0], "ghostty")
        self.assertEqual(argv2[1], GHOSTTY_MULTI_INSTANCE_FLAG)
        self.assertIn("--foo=1", argv2)
        self.assertNotIn("--gtk-single-instance=true", argv2)
        argv3 = ghostty_multi_instance_argv(
            "com.mitchellh.ghostty", exe_path="/usr/bin/ghostty"
        )
        self.assertEqual(argv3, ["/usr/bin/ghostty", GHOSTTY_MULTI_INSTANCE_FLAG])

    def test_rewrite_app_string(self):
        s = rewrite_ghostty_launch_app("ghostty")
        self.assertEqual(s, f"ghostty {GHOSTTY_MULTI_INSTANCE_FLAG}")
        self.assertEqual(rewrite_ghostty_launch_app("firefox"), "firefox")


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
        # Fixture is thrashed → Mode B soft-parks non-roles (no mon structure ensure).
        self.assertTrue(plan["thrashState"]["thrashed"])
        self.assertGreater(plan["counts"]["parked"], 0)
        steps = actions_to_extension_steps(plan["actions"])
        ops = [s["op"] for s in steps]
        self.assertIn("move", ops)
        # Parks become moves onto dest id; layout only if structure/mon ensure present.
        for s in steps:
            if s["op"] == "move":
                self.assertTrue(s["tile"].startswith("id:"))
                # soft park: dest id:anchor (not mon-root path)
                self.assertTrue(
                    s["dest"].startswith("path:mo") or s["dest"].startswith("id:"),
                    f"unexpected move dest {s['dest']!r}",
                )
                self.assertTrue(
                    s["dest"].startswith("id:"),
                    f"Mode B soft park should dest id:, got {s['dest']!r}",
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

    def test_ensure_layout_tabbed_multi_window_order(self):
        """layout on anchor first (flatten + mon-wrap), then move others in."""
        steps = actions_to_extension_steps(
            [
                {
                    "op": "ensure_layout",
                    "slot": "mon1.term",
                    "mode": "tabbed",
                    "windowIds": [201, 301, 302],
                }
            ]
        )
        self.assertEqual(
            steps,
            [
                {"op": "layout", "mode": "tabbed", "selector": "id:201"},
                {"op": "move", "tile": "id:301", "dest": "id:201"},
                {"op": "move", "tile": "id:302", "dest": "id:201"},
            ],
        )
        # layout must precede moves so mon-direct windows get a CON wrap first
        self.assertEqual(steps[0]["op"], "layout")
        self.assertTrue(all(s["op"] == "move" for s in steps[1:]))

    def test_ensure_order_maps_to_order_step(self):
        steps = actions_to_extension_steps(
            [
                {
                    "op": "ensure_order",
                    "slot": "mon0",
                    "mode": "hsplit",
                    "windowIds": [101, 103],
                }
            ]
        )
        self.assertEqual(
            steps,
            [{"op": "order", "windowIds": ["id:101", "id:103"]}],
        )

    def test_ensure_order_after_layout_and_placement(self):
        steps = actions_to_extension_steps(
            [
                {
                    "op": "ensure_order",
                    "slot": "mon0",
                    "mode": "hsplit",
                    "windowIds": [101, 103],
                },
                {
                    "op": "ensure_layout",
                    "slot": "mon0.left-tab",
                    "mode": "tabbed",
                    "windowIds": [101, 102],
                },
                {"op": "move", "windowId": 9, "slot": "mon1.comms"},
            ]
        )
        self.assertEqual(steps[0]["op"], "move")
        self.assertEqual(steps[1]["op"], "layout")
        self.assertEqual(steps[-1], {"op": "order", "windowIds": ["id:101", "id:103"]})

    def test_move_position_start_from_plan(self):
        steps = actions_to_extension_steps(
            [
                {
                    "op": "move",
                    "role": "ghostty-right",
                    "windowId": 88,
                    "slot": "mon1.term",
                    "position": "start",
                    "childIndex": 0,
                }
            ]
        )
        self.assertEqual(
            steps,
            [
                {
                    "op": "move",
                    "tile": "id:88",
                    "dest": "path:mo1ws0",
                    "position": "start",
                }
            ],
        )


class TestLaunchAppGhostty(unittest.TestCase):
    """LF4: forge.launch_app must not gio-launch single-instance Ghostty desktop."""

    @classmethod
    def setUpClass(cls):
        import importlib.util

        bin_path = _REPO / "scripts" / "forge" / "forge"
        name = "forge_cli_lf4_launch"
        loader = importlib.machinery.SourceFileLoader(name, str(bin_path))
        spec = importlib.util.spec_from_loader(name, loader)
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        sys.modules[name] = mod
        spec.loader.exec_module(mod)
        cls.forge = mod

    def test_launch_app_ghostty_spawns_multi_instance_not_gio(self):
        from unittest import mock

        fake = mock.Mock()
        fake.pid = 4242
        with mock.patch.object(self.forge.subprocess, "Popen", return_value=fake) as popen:
            with mock.patch.object(
                self.forge,
                "resolve_desktop_file",
                return_value="/usr/share/applications/com.mitchellh.ghostty.desktop",
            ):
                with mock.patch.object(
                    self.forge,
                    "parse_desktop_entry",
                    return_value={
                        "Exec": "/usr/bin/ghostty --gtk-single-instance=true",
                        "TryExec": "/usr/bin/ghostty",
                        "StartupWMClass": "com.mitchellh.ghostty",
                    },
                ):
                    with mock.patch.object(self.forge.os.path, "isfile", return_value=True):
                        with mock.patch.object(
                            self.forge.shutil, "which", side_effect=lambda x: x if x == "ghostty" else None
                        ):
                            proc = self.forge.launch_app("ghostty")
        self.assertIs(proc, fake)
        self.assertEqual(popen.call_count, 1)
        argv = popen.call_args[0][0]
        self.assertNotEqual(argv[0], "gio")
        self.assertNotEqual(argv[0], "gtk-launch")
        self.assertEqual(argv[0], "/usr/bin/ghostty")
        self.assertEqual(argv[1], GHOSTTY_MULTI_INSTANCE_FLAG)
        self.assertNotIn("--gtk-single-instance=true", argv)

    def test_launch_app_ghostty_argv_already_multi(self):
        from unittest import mock

        fake = mock.Mock()
        fake.pid = 1
        app = f"ghostty {GHOSTTY_MULTI_INSTANCE_FLAG}"
        with mock.patch.object(self.forge.subprocess, "Popen", return_value=fake) as popen:
            with mock.patch.object(self.forge, "resolve_desktop_file", return_value=None):
                with mock.patch.object(
                    self.forge.shutil, "which", side_effect=lambda x: "/usr/bin/ghostty" if x == "ghostty" else None
                ):
                    self.forge.launch_app(app)
        argv = popen.call_args[0][0]
        self.assertEqual(argv, ["ghostty", GHOSTTY_MULTI_INSTANCE_FLAG])


if __name__ == "__main__":
    unittest.main()
