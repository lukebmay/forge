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
    HARD_TIMEOUT_MS,
    MODE_RECONCILE,
    MODE_STEPS,
    actions_to_extension_steps,
    assign_open_role_pins,
    belt_actions_from_plan,
    detect_layout_mode,
    focus_actions_from_plan,
    focus_actions_still_needed,
    find_settled_window,
    forest_stability_fingerprint,
    ghostty_multi_instance_argv,
    hard_ready_status,
    is_ghostty_launch_target,
    layout_wait_tree_stable_enabled,
    move_step_window_ids,
    open_action_to_launch_fields,
    parent_last_tab_focus_by_window_id,
    partition_plan_actions,
    residual_follow_up,
    resolve_focus_soft_timeout_ms,
    rewrite_ghostty_launch_app,
    run_soft_focus_barrier,
    slot_to_monitor_path,
    slot_to_tree_path,
    soft_focus_wall_ms,
    wait_for_open_role_pins,
    wait_for_tree_stable,
    wait_until_hard_ready,
    window_has_map_id,
    window_is_settled,
    window_tile_selector,
    without_focus_actions,
)
from settle_heuristics import (  # noqa: E402
    empty_store,
    get_or_create_entry,
    learning_trial_soft_cap_ms,
    make_key,
    record_trial,
    soft_floor_ms,
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
        self.assertEqual(slot_to_tree_path("mon0.term", workspace=2), "mo0ws2")


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

    def test_actions_to_extension_steps_workspace_dest(self):
        steps = actions_to_extension_steps(
            [
                {
                    "op": "move",
                    "role": "x",
                    "windowId": 9,
                    "slot": "mon1.comms",
                }
            ],
            workspace=2,
        )
        self.assertEqual(steps[0]["dest"], "path:mo1ws2")

    def test_action_workspace_stamp_overrides_param(self):
        steps = actions_to_extension_steps(
            [
                {
                    "op": "move",
                    "windowId": 9,
                    "slot": "mon0.term",
                    "workspace": 1,
                }
            ],
            workspace=0,
        )
        self.assertEqual(steps[0]["dest"], "path:mo0ws1")

    def test_open_action_tree_path_uses_workspace(self):
        fields = open_action_to_launch_fields(
            {
                "op": "open",
                "role": "term",
                "open": {"app": "ghostty"},
                "slot": "mon1.term",
                "workspace": 1,
            }
        )
        self.assertEqual(fields["tree_path"], "mo1ws1")
        self.assertEqual(fields["monitor"], 1)

    def test_open_action_param_workspace_when_unstamped(self):
        fields = open_action_to_launch_fields(
            {
                "op": "open",
                "role": "term",
                "open": {"app": "ghostty"},
                "slot": "mon0.term",
            },
            workspace=2,
        )
        self.assertEqual(fields["tree_path"], "mo0ws2")

    def test_residual_follow_up_workspace_dest(self):
        steps, still = residual_follow_up(
            [
                {
                    "op": "move",
                    "role": "term",
                    "windowId": 5,
                    "slot": "mon1.term",
                }
            ],
            [],
            workspace=1,
        )
        self.assertEqual(still, [])
        self.assertEqual(steps[0]["dest"], "path:mo1ws1")

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
                # profile = keyboard activate; active = open-leaf only
                {"op": "focus", "selector": "id:102"},
                {"op": "focus", "selector": "id:101", "keyboard": False},
            ],
        )

    def test_focus_active_open_leaf_no_keyboard(self):
        steps = actions_to_extension_steps(
            [
                {"op": "focus", "selector": "id:1", "reason": "active"},
                {"op": "focus", "selector": "id:2", "reason": "survivor"},
                {"op": "focus", "selector": "id:3", "reason": "profile"},
            ]
        )
        self.assertEqual(
            steps,
            [
                {"op": "focus", "selector": "id:1", "keyboard": False},
                {"op": "focus", "selector": "id:2", "keyboard": False},
                {"op": "focus", "selector": "id:3"},
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

    def test_focus_actions_still_needed_open_leaf_mismatch(self):
        """Late chrome steal: lastTabFocus ≠ active role → verify re-apply."""
        forest = {
            "focusWindowId": 99,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "children": [
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "lastTabFocusId": 10,  # chrome visible/stolen
                            "children": [
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 10,
                                    "wmClass": "a",
                                    "title": "a",
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 20,
                                    "wmClass": "b",
                                    "title": "b",
                                },
                            ],
                        },
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "lastTabFocusId": 30,  # already correct
                            "children": [
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 30,
                                    "wmClass": "c",
                                    "title": "c",
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 31,
                                    "wmClass": "d",
                                    "title": "d",
                                },
                            ],
                        },
                    ],
                }
            ],
        }
        by_wid = parent_last_tab_focus_by_window_id(forest)
        self.assertEqual(by_wid["10"], "10")
        self.assertEqual(by_wid["20"], "10")
        self.assertEqual(by_wid["30"], "30")

        actions = [
            {
                "op": "focus",
                "selector": "id:20",
                "role": "b",
                "reason": "active",
            },
            {
                "op": "focus",
                "selector": "id:30",
                "role": "c",
                "reason": "active",
            },
            {
                "op": "focus",
                "selector": "id:99",
                "role": "term",
                "reason": "profile",
            },
        ]
        needed = focus_actions_still_needed(forest, actions)
        roles = [a["role"] for a in needed]
        self.assertEqual(roles, ["b"])  # only stolen open leaf

        # Profile kbd mismatch
        forest_bad_kbd = dict(forest)
        forest_bad_kbd["focusWindowId"] = 10
        needed2 = focus_actions_still_needed(forest_bad_kbd, actions)
        self.assertEqual([a["role"] for a in needed2], ["b", "term"])

        # All match → empty
        forest_ok = {
            "focusWindowId": 99,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "children": [
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "lastTabFocusId": 20,
                            "children": [
                                {"nodeType": "WINDOW", "windowId": 10},
                                {"nodeType": "WINDOW", "windowId": 20},
                            ],
                        },
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "lastTabFocusId": 30,
                            "children": [
                                {"nodeType": "WINDOW", "windowId": 30},
                                {"nodeType": "WINDOW", "windowId": 31},
                            ],
                        },
                    ],
                }
            ],
        }
        self.assertEqual(focus_actions_still_needed(forest_ok, actions), [])

    def test_belt_actions_pin_moves_only_by_default(self):
        """Belt is wrong-mon rehome for pins only; no structure rewrite or focus."""
        actions = [
            {
                "op": "ensure_layout",
                "slot": "mon0.s0",
                "mode": "tabbed",
                "windowIds": [10, 20],
            },
            {"op": "ensure_order", "slot": "mon0", "mode": "hsplit", "windowIds": [1, 2]},
            {"op": "move", "role": "Grok", "windowId": 20, "slot": "mon0.s0"},
            {"op": "move", "role": "other", "windowId": 99, "slot": "mon1.x"},
            {"op": "focus", "selector": "id:20", "role": "Grok", "reason": "active"},
            {"op": "focus", "selector": "id:1", "role": "ghostty", "reason": "profile"},
            {"op": "park", "windowId": 5, "slot": "mon1"},
            {"op": "bind", "windowId": 20, "layoutRole": "Grok"},
        ]
        belt = belt_actions_from_plan(actions, {"Grok": 20})
        ops = [a["op"] for a in belt]
        self.assertEqual(ops, ["move"])
        self.assertEqual(belt[0]["role"], "Grok")
        self.assertFalse(
            any(
                a.get("op")
                in ("park", "bind", "focus", "ensure_layout", "ensure_order")
                for a in belt
            )
        )

        with_focus = belt_actions_from_plan(
            actions, {"Grok": 20}, include_focus=True
        )
        self.assertEqual(sum(1 for a in with_focus if a["op"] == "focus"), 2)
        self.assertEqual(sum(1 for a in with_focus if a["op"] == "move"), 1)
        self.assertFalse(any(a.get("op") == "ensure_layout" for a in with_focus))

        focus_only = focus_actions_from_plan(actions)
        self.assertEqual(len(focus_only), 2)
        stripped = without_focus_actions(actions)
        self.assertFalse(any(a.get("op") == "focus" for a in stripped))
        self.assertEqual(len(stripped), len(actions) - 2)

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


class TestWindowSettledLf5(unittest.TestCase):
    """LF5: settle predicate before residual/layout Move."""

    def test_float_not_settled(self):
        w = {
            "windowId": 10,
            "mode": "FLOAT",
            "rect": {"x": 0, "y": 0, "width": 800, "height": 600},
            "monitor": 0,
        }
        self.assertFalse(window_is_settled(w))

    def test_tile_settled(self):
        w = {
            "windowId": 11,
            "mode": "TILE",
            "rect": {"x": 0, "y": 0, "width": 960, "height": 1080},
            "monitor": 1,
        }
        self.assertTrue(window_is_settled(w))

    def test_missing_id_not_settled(self):
        self.assertFalse(window_is_settled({"mode": "TILE", "rect": {"width": 1, "height": 1}}))

    def test_zero_rect_not_settled(self):
        w = {
            "windowId": 12,
            "mode": "TILE",
            "rect": {"x": 0, "y": 0, "width": 0, "height": 100},
        }
        self.assertFalse(window_is_settled(w))

    def test_missing_rect_ok_when_tiled(self):
        # Older GetTree fixtures may omit rect; mode TILE is enough.
        self.assertTrue(window_is_settled({"windowId": 13, "mode": "TILE"}))

    def test_negative_monitor_not_settled(self):
        w = {"windowId": 14, "mode": "TILE", "monitor": -1}
        self.assertFalse(window_is_settled(w))

    def test_require_tile_false(self):
        w = {"windowId": 15, "mode": "FLOAT"}
        self.assertTrue(window_is_settled(w, require_tile=False))

    def test_find_settled_window(self):
        wins = [
            {"windowId": 1, "mode": "FLOAT"},
            {"windowId": 2, "mode": "TILE", "rect": {"width": 100, "height": 100}},
        ]
        hit = find_settled_window(wins)
        self.assertEqual(hit["windowId"], 2)
        self.assertIsNone(find_settled_window(wins, window_id=1))
        self.assertEqual(find_settled_window(wins, window_id=2)["windowId"], 2)

    def test_move_step_window_ids(self):
        steps = [
            {"op": "move", "tile": "id:501", "dest": "path:mo1ws0"},
            {"op": "layout", "mode": "hsplit", "selector": "id:501"},
            {"op": "move", "tile": "path:mo0ws0/0", "dest": "path:mo0ws0"},
            {"op": "park", "tile": "id:99", "dest": "id:1"},
        ]
        self.assertEqual(move_step_window_ids(steps), ["501", "99"])


class TestHardReadySe2(unittest.TestCase):
    """SE2: hard-ready barrier (call clock → TILE/rect/mon; 5s)."""

    def test_hard_timeout_locked(self):
        self.assertEqual(HARD_TIMEOUT_MS, 5000)

    def test_hard_ready_status_partial(self):
        wins = [
            {"windowId": 1, "mode": "FLOAT"},
            {
                "windowId": 2,
                "mode": "TILE",
                "rect": {"width": 100, "height": 100},
                "monitor": 0,
            },
        ]
        st = hard_ready_status(wins, ["1", "2", "2"])
        self.assertFalse(st["ok"])
        self.assertEqual(st["settled"], ["2"])
        self.assertEqual(st["pending"], ["1"])

    def test_hard_ready_status_all_ok(self):
        wins = [
            {"windowId": "a", "mode": "TILE", "rect": {"width": 1, "height": 1}},
            {"windowId": "b", "mode": "TILE"},
        ]
        st = hard_ready_status(wins, ["a", "b"])
        self.assertTrue(st["ok"])
        self.assertEqual(st["pending"], [])

    def test_wait_until_hard_ready_empty_ids(self):
        out = wait_until_hard_ready(lambda: [], [], timeout_ms=100)
        self.assertTrue(out["ok"])
        self.assertEqual(out["polls"], 0)

    def test_wait_until_hard_ready_polls_until_tile(self):
        state = {"n": 0}
        windows_seq = [
            [{"windowId": 9, "mode": "FLOAT"}],
            [{"windowId": 9, "mode": "FLOAT"}],
            [
                {
                    "windowId": 9,
                    "mode": "TILE",
                    "rect": {"width": 10, "height": 10},
                    "monitor": 0,
                }
            ],
        ]

        def load():
            i = min(state["n"], len(windows_seq) - 1)
            state["n"] += 1
            return windows_seq[i]

        sleeps: list[float] = []
        clock = {"t": 0.0}

        def mono():
            return clock["t"]

        def sleep(s):
            sleeps.append(s)
            clock["t"] += s

        out = wait_until_hard_ready(
            load,
            ["9"],
            timeout_ms=HARD_TIMEOUT_MS,
            poll_ms=50,
            call_started_mono=0.0,
            sleep_fn=sleep,
            monotonic_fn=mono,
        )
        self.assertTrue(out["ok"])
        self.assertEqual(out["settled"], ["9"])
        self.assertGreaterEqual(out["polls"], 3)
        self.assertEqual(out["hardTimeoutMs"], HARD_TIMEOUT_MS)
        self.assertTrue(sleeps)  # waited between polls

    def test_wait_until_hard_ready_timeout(self):
        clock = {"t": 0.0}

        def mono():
            return clock["t"]

        def sleep(s):
            clock["t"] += max(s, 0.05)

        out = wait_until_hard_ready(
            lambda: [{"windowId": 1, "mode": "FLOAT"}],
            ["1"],
            timeout_ms=200,
            poll_ms=50,
            call_started_mono=0.0,
            sleep_fn=sleep,
            monotonic_fn=mono,
        )
        self.assertFalse(out["ok"])
        self.assertEqual(out["pending"], ["1"])
        self.assertIn("hard-ready timeout", out["error"] or "")
        self.assertGreaterEqual(out["elapsed_ms"], 200)

    def test_call_clock_from_call_started(self):
        """Elapsed is from call_started_mono, not only poll loop entry."""
        clock = {"t": 1.5}  # 1500ms after call at t=0

        def mono():
            return clock["t"]

        out = wait_until_hard_ready(
            lambda: [
                {
                    "windowId": 3,
                    "mode": "TILE",
                    "rect": {"width": 1, "height": 1},
                }
            ],
            ["3"],
            timeout_ms=HARD_TIMEOUT_MS,
            poll_ms=0,
            call_started_mono=0.0,
            sleep_fn=lambda _s: None,
            monotonic_fn=mono,
        )
        self.assertTrue(out["ok"])
        self.assertGreaterEqual(out["elapsed_ms"], 1500)


class TestSoftFocusBarrierSe3(unittest.TestCase):
    """SE3: soft focus residual barrier (steal → correct + reset quiet)."""

    def test_resolve_timeout_first_ever(self):
        t = resolve_focus_soft_timeout_ms(empty_store(), host="black")
        self.assertEqual(t, learning_trial_soft_cap_ms("focus"))

    def test_resolve_timeout_uses_max_across_classes(self):
        store = empty_store()
        key = make_key("black", "google-chrome", "focus-phase", "focus")
        ent = get_or_create_entry(
            store,
            key,
            host="black",
            wm_class="google-chrome",
            process_kind="focus-phase",
            residual_kind="focus",
        )
        record_trial(ent, had_residual=True, latency_ms=800)
        t = resolve_focus_soft_timeout_ms(
            store, host="black", wm_classes=["google-chrome", "ghostty"]
        )
        # chrome learned 800*1.25=1000; ghostty first-ever 6000 → max 6000
        self.assertEqual(t, learning_trial_soft_cap_ms("focus"))
        t_chrome = resolve_focus_soft_timeout_ms(
            store, host="black", wm_classes=["google-chrome"]
        )
        self.assertEqual(t_chrome, int(800 * 1.25))

    def test_wall_ms_clamped(self):
        self.assertEqual(soft_focus_wall_ms(400), 3000)  # clamp focus 3s wins over 1.2s
        self.assertLessEqual(soft_focus_wall_ms(10_000), 15000)

    def test_soft_settle_no_residual(self):
        clock = {"t": 0.0}

        def mono():
            return clock["t"]

        def sleep(s):
            clock["t"] += s

        out = run_soft_focus_barrier(
            lambda: [],
            lambda _n: None,
            soft_timeout_ms=150,
            poll_ms=50,
            call_started_mono=0.0,
            sleep_fn=sleep,
            monotonic_fn=mono,
        )
        self.assertTrue(out["ok"])
        self.assertTrue(out["softSettled"])
        self.assertEqual(out["corrections"], 0)
        self.assertEqual(out["residuals"], [])
        self.assertGreaterEqual(out["elapsed_ms"], 150)

    def test_steal_corrects_and_resets_quiet(self):
        clock = {"t": 0.0}
        phase = {"n": 0}
        corrects: list[int] = []

        def mono():
            return clock["t"]

        def sleep(s):
            clock["t"] += s

        def check():
            # steal on first poll after start; clean after one correct
            phase["n"] += 1
            if phase["n"] == 1:
                return [{"op": "focus", "selector": "id:1"}]
            return []

        def correct(needed):
            corrects.append(len(needed))

        out = run_soft_focus_barrier(
            check,
            correct,
            soft_timeout_ms=100,
            poll_ms=50,
            call_started_mono=0.0,
            sleep_fn=sleep,
            monotonic_fn=mono,
            max_wall_ms=5000,
        )
        self.assertTrue(out["ok"])
        self.assertEqual(out["corrections"], 1)
        self.assertEqual(len(out["residuals"]), 1)
        self.assertEqual(corrects, [1])

    def test_max_corrections_stops_loop(self):
        clock = {"t": 0.0}

        def mono():
            return clock["t"]

        def sleep(s):
            clock["t"] += 0.01

        out = run_soft_focus_barrier(
            lambda: [{"op": "focus"}],
            lambda _n: None,
            soft_timeout_ms=500,
            poll_ms=10,
            max_corrections=3,
            call_started_mono=0.0,
            sleep_fn=sleep,
            monotonic_fn=mono,
            max_wall_ms=10_000,
        )
        self.assertFalse(out["ok"])
        self.assertEqual(out["corrections"], 3)
        self.assertIn("max corrections", out["error"] or "")

    def test_soft_floor_known(self):
        self.assertEqual(soft_floor_ms("focus"), 400)


class TestForestStabilityLf6(unittest.TestCase):
    """LF6 helpers: fingerprint + optional wait (debug; not default apply gate)."""

    def test_wait_tree_stable_enabled_default_off(self):
        self.assertFalse(layout_wait_tree_stable_enabled(flag=False, env={}))
        self.assertFalse(
            layout_wait_tree_stable_enabled(flag=False, env={"FORGE_LAYOUT_WAIT_TREE_STABLE": ""})
        )
        self.assertFalse(
            layout_wait_tree_stable_enabled(flag=False, env={"FORGE_LAYOUT_WAIT_TREE_STABLE": "0"})
        )

    def test_wait_tree_stable_enabled_flag_or_env(self):
        self.assertTrue(layout_wait_tree_stable_enabled(flag=True, env={}))
        self.assertTrue(
            layout_wait_tree_stable_enabled(
                flag=False, env={"FORGE_LAYOUT_WAIT_TREE_STABLE": "1"}
            )
        )
        self.assertTrue(
            layout_wait_tree_stable_enabled(
                flag=False, env={"FORGE_LAYOUT_WAIT_TREE_STABLE": "true"}
            )
        )
        self.assertTrue(
            layout_wait_tree_stable_enabled(
                flag=False, env={"FORGE_LAYOUT_WAIT_TREE_STABLE": "YES"}
            )
        )
        # Flag wins even if env is unset/falsey.
        self.assertTrue(
            layout_wait_tree_stable_enabled(
                flag=True, env={"FORGE_LAYOUT_WAIT_TREE_STABLE": "0"}
            )
        )

    def test_fingerprint_stable_on_same_forest(self):
        forest = _load("tree-perfect.json")
        a = forest_stability_fingerprint(forest)
        b = forest_stability_fingerprint(forest)
        self.assertEqual(a, b)
        self.assertIn("W id=", a)
        self.assertIn("id=101", a)
        self.assertIn("mode=TILE", a)

    def test_fingerprint_changes_on_monitor_move(self):
        forest = _load("tree-perfect.json")
        base = forest_stability_fingerprint(forest)
        # Move mon0 ghostty (103) meta monitor to 1 → fingerprint must change.
        mon0 = forest["monitors"][0]
        for node in mon0["children"]:
            if node.get("windowId") == 103:
                node["monitor"] = 1
                break
        else:
            self.fail("window 103 not found")
        moved = forest_stability_fingerprint(forest)
        self.assertNotEqual(base, moved)

    def test_fingerprint_includes_con_layout_and_focus(self):
        forest = {
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "layout": "HSPLIT",
                    "children": [
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "lastTabFocusId": 42,
                            "children": [
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 42,
                                    "mode": "TILE",
                                    "monitor": 0,
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 43,
                                    "mode": "FLOAT",
                                    "monitor": 0,
                                },
                            ],
                        }
                    ],
                }
            ]
        }
        fp = forest_stability_fingerprint(forest)
        self.assertIn("layout=TABBED", fp)
        self.assertIn("focus=42", fp)
        self.assertIn("mode=FLOAT", fp)
        self.assertIn("id=42", fp)
        # Deterministic sort: second call identical.
        self.assertEqual(fp, forest_stability_fingerprint(forest))

    def test_fingerprint_empty_forest(self):
        self.assertEqual(forest_stability_fingerprint({}), "")
        self.assertEqual(forest_stability_fingerprint({"monitors": []}), "")

    def test_wait_for_tree_stable_ok_after_n_samples(self):
        forest = _load("tree-perfect.json")
        calls = {"n": 0}
        sleeps: list[float] = []

        def load():
            calls["n"] += 1
            return forest

        def sleep_fn(s: float) -> None:
            sleeps.append(s)

        # Fake clock: advance slightly each sleep so loop can run.
        t = {"v": 0.0}

        def mono() -> float:
            return t["v"]

        real_sleep = sleep_fn

        def sleep_and_tick(s: float) -> None:
            real_sleep(s)
            t["v"] += s

        out = wait_for_tree_stable(
            load,
            timeout_ms=5000,
            poll_ms=100,
            stable_samples=3,
            sleep_fn=sleep_and_tick,
            monotonic_fn=mono,
        )
        self.assertTrue(out["ok"])
        self.assertEqual(out["samples"], 3)
        self.assertEqual(out["polls"], 3)
        self.assertEqual(out["fingerprint"], forest_stability_fingerprint(forest))
        self.assertIs(out["forest"], forest)
        self.assertIsNone(out["error"])
        # Two sleeps between three samples.
        self.assertEqual(len(sleeps), 2)

    def test_wait_for_tree_stable_timeout_when_churning(self):
        forests = [
            {
                "monitors": [
                    {
                        "nodeType": "MONITOR",
                        "id": "mo0ws0",
                        "layout": "HSPLIT",
                        "children": [
                            {
                                "nodeType": "WINDOW",
                                "windowId": 1,
                                "mode": "TILE",
                                "monitor": 0,
                            }
                        ],
                    }
                ]
            },
            {
                "monitors": [
                    {
                        "nodeType": "MONITOR",
                        "id": "mo0ws0",
                        "layout": "HSPLIT",
                        "children": [
                            {
                                "nodeType": "WINDOW",
                                "windowId": 1,
                                "mode": "TILE",
                                "monitor": 1,  # thrash
                            }
                        ],
                    }
                ]
            },
        ]
        i = {"n": 0}
        t = {"v": 0.0}

        def load():
            f = forests[i["n"] % 2]
            i["n"] += 1
            return f

        def mono() -> float:
            return t["v"]

        def sleep_fn(s: float) -> None:
            t["v"] += s

        out = wait_for_tree_stable(
            load,
            timeout_ms=400,
            poll_ms=100,
            stable_samples=3,
            sleep_fn=sleep_fn,
            monotonic_fn=mono,
        )
        self.assertFalse(out["ok"])
        self.assertIsNotNone(out["error"])
        self.assertLess(out["samples"], 3)
        self.assertGreaterEqual(out["polls"], 2)

    def test_wait_for_tree_stable_optional_debug_doc(self):
        """Helper remains; docstring says optional debug, not default product gate."""
        doc = wait_for_tree_stable.__doc__ or ""
        self.assertIn("optional", doc.lower())
        self.assertIn("debug", doc.lower())
        self.assertIn("wait-tree-stable", doc.lower())
        self.assertIn("fingerprint", doc.lower())


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
        # CT1: skeleton maps without windowIds; opens stay CLI-side
        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0]["op"], "skeleton")
        self.assertIn("mons", steps[0])
        self.assertGreaterEqual(len(steps[0]["mons"]), 2)
        # No layout/move steps before maps
        self.assertFalse(any(s["op"] == "layout" for s in steps))

    def test_skeleton_and_bind_mapper(self):
        actions = [
            {
                "op": "ensure_skeleton",
                "workspace": 0,
                "mons": [
                    {
                        "mon": 0,
                        "slot": "mon0",
                        "split": "hsplit",
                        "children": [
                            {
                                "id": "left-tab",
                                "slot": "mon0.left-tab",
                                "mode": "tabbed",
                                "roles": ["chrome-luke", "grok"],
                            },
                            {
                                "id": "term",
                                "slot": "mon0.term",
                                "roles": ["ghostty-left"],
                            },
                        ],
                    }
                ],
            },
            {"op": "bind", "role": "chrome-luke", "windowId": 101, "layoutRole": "chrome-luke"},
            {"op": "ensure_order", "windowIds": [101, 103]},
            {"op": "focus", "windowId": 101},
        ]
        steps = actions_to_extension_steps(actions)
        ops = [s["op"] for s in steps]
        self.assertEqual(ops[0], "skeleton")
        self.assertNotIn("windowIds", steps[0])
        self.assertIn("mons", steps[0])
        self.assertEqual(ops[1], "bind")
        self.assertEqual(steps[1]["tile"], "id:101")
        self.assertEqual(steps[1]["layoutRole"], "chrome-luke")
        self.assertEqual(ops[-1], "focus")
        # Phase order: skeleton before bind before order before focus
        self.assertLess(ops.index("skeleton"), ops.index("bind"))
        self.assertLess(ops.index("bind"), ops.index("order"))
        self.assertLess(ops.index("order"), ops.index("focus"))

    def test_bind_before_residual_close_and_park(self):
        """CT0 P5: role move → bind → residual park/close (not close before bind)."""
        actions = [
            {
                "op": "move",
                "role": "ghostty",
                "windowId": 501,
                "slot": "mon0.term",
            },
            {
                "op": "bind",
                "role": "ghostty",
                "windowId": 501,
                "layoutRole": "ghostty",
            },
            {
                "op": "park",
                "windowId": 999,
                "slot": "mon0.overflow",
                "destWindowId": 501,
            },
            {"op": "close", "windowId": 1000},
            {"op": "ensure_order", "windowIds": [501, 502]},
        ]
        steps = actions_to_extension_steps(actions)
        ops = [s["op"] for s in steps]
        # role move, bind, residual park(as move)+close, order
        self.assertEqual(ops[0], "move")
        self.assertEqual(steps[0]["tile"], "id:501")
        self.assertEqual(ops[1], "bind")
        # residual park becomes move onto dest; close after bind
        bind_i = ops.index("bind")
        close_i = ops.index("close")
        self.assertLess(bind_i, close_i)
        # park mapped as move after bind
        residual_moves = [
            i for i, s in enumerate(steps) if s["op"] == "move" and s["tile"] == "id:999"
        ]
        self.assertEqual(len(residual_moves), 1)
        self.assertLess(bind_i, residual_moves[0])
        self.assertLess(residual_moves[0], close_i)
        self.assertLess(close_i, ops.index("order"))

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
                # Join inserts after anchor → order pass restores profile order.
                {"op": "order", "windowIds": ["id:10", "id:11"]},
            ],
        )

    def test_ensure_layout_tabbed_multi_window_order(self):
        """layout + join moves, then order so join-after-anchor does not reverse tails."""
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
                {"op": "order", "windowIds": ["id:201", "id:301", "id:302"]},
            ],
        )
        # layout must precede moves so mon-direct windows get a CON wrap first
        self.assertEqual(steps[0]["op"], "layout")
        self.assertEqual(steps[-1]["op"], "order")

    def test_ensure_layout_nested_vsplit_joins_like_tabbed(self):
        """LF8: nested h/v with ≥2 windowIds → layout first + move rest onto first."""
        steps = actions_to_extension_steps(
            [
                {
                    "op": "ensure_layout",
                    "slot": "mon0.s1",
                    "mode": "vsplit",
                    "windowIds": [103, 301],
                }
            ]
        )
        self.assertEqual(
            steps,
            [
                {"op": "layout", "mode": "vsplit", "selector": "id:103"},
                {"op": "move", "tile": "id:301", "dest": "id:103"},
                {"op": "order", "windowIds": ["id:103", "id:301"]},
            ],
        )

    def test_ensure_layout_mon_level_hsplit_no_join(self):
        """Mon-level hsplit must not join anchors under one CON."""
        steps = actions_to_extension_steps(
            [
                {
                    "op": "ensure_layout",
                    "slot": "mon0",
                    "mode": "hsplit",
                    "windowIds": [103, 201],
                }
            ]
        )
        self.assertEqual(
            steps,
            [{"op": "layout", "mode": "hsplit", "selector": "id:103"}],
        )

    def test_move_dest_window_id_maps_to_id_dest(self):
        """LF8 residual join: destWindowId → dest id:… not path:moNwsW."""
        steps = actions_to_extension_steps(
            [
                {
                    "op": "move",
                    "role": "nautilus",
                    "windowId": 301,
                    "slot": "mon0.s1.nautilus",
                    "destWindowId": 103,
                }
            ]
        )
        self.assertEqual(
            steps,
            [{"op": "move", "tile": "id:301", "dest": "id:103"}],
        )

    def test_open_action_passes_attach_selector_from_dest(self):
        fields = open_action_to_launch_fields(
            {
                "op": "open",
                "role": "nautilus",
                "slot": "mon0.s1.nautilus",
                "open": {"app": "nautilus", "wmClass": "nautilus"},
                "destWindowId": 103,
            }
        )
        self.assertEqual(fields.get("attach_selector"), "id:103")
        self.assertEqual(fields.get("monitor"), 0)

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
        # place → layout/join → order(s). Plan ensure_order first; tab join adds
        # a second order so join-after-anchor does not reverse role tails.
        order_steps = [s for s in steps if s.get("op") == "order"]
        self.assertEqual(
            order_steps,
            [
                {"op": "order", "windowIds": ["id:101", "id:103"]},
                {"op": "order", "windowIds": ["id:101", "id:102"]},
            ],
        )

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


class TestCl9ParallelOpenPins(unittest.TestCase):
    """CL9: map/windowId pin assignment without TILE settle."""

    def test_window_has_map_id(self):
        self.assertTrue(window_has_map_id({"windowId": 1, "mode": "FLOAT"}))
        self.assertTrue(window_has_map_id({"windowId": "42"}))
        self.assertFalse(window_has_map_id({"windowId": None}))
        self.assertFalse(window_has_map_id({"windowId": ""}))
        self.assertFalse(window_has_map_id({}))
        self.assertFalse(window_has_map_id(None))

    def test_assign_open_role_pins_by_class_ignores_mode(self):
        pending = [
            {"role": "chrome", "wait_classes": ["Google-chrome"]},
            {"role": "ghostty", "wait_classes": ["ghostty", "com.mitchellh.ghostty"]},
        ]
        windows = [
            {"windowId": 10, "wmClass": "Google-chrome", "mode": "FLOAT"},
            {"windowId": 20, "wmClass": "com.mitchellh.ghostty", "mode": "FLOAT"},
            {"windowId": 99, "wmClass": "other", "mode": "TILE"},
        ]
        pins = assign_open_role_pins(pending, windows, used_ids=set())
        self.assertEqual(pins, {"chrome": 10, "ghostty": 20})
        # FLOAT is fine — no TILE required for pin.
        self.assertFalse(window_is_settled(windows[0]))

    def test_assign_skips_used_and_same_class_second_instance(self):
        pending = [
            {"role": "g1", "wait_classes": ["ghostty"]},
            {"role": "g2", "wait_classes": ["ghostty"]},
        ]
        windows = [
            {"windowId": 1, "wmClass": "ghostty"},
            {"windowId": 2, "wmClass": "ghostty"},
        ]
        pins = assign_open_role_pins(pending, windows, used_ids={"1"})
        # window 1 already used (baseline); both roles claim from remaining → only id 2 left
        self.assertEqual(pins, {"g1": 2})
        pins2 = assign_open_role_pins(pending, windows, used_ids=set())
        self.assertEqual(pins2, {"g1": 1, "g2": 2})

    def test_assign_accept_any_new(self):
        pending = [{"role": "mystery", "wait_classes": None, "accept_any_new": True}]
        windows = [{"windowId": 7, "wmClass": "Whatever", "mode": "FLOAT"}]
        pins = assign_open_role_pins(pending, windows)
        self.assertEqual(pins, {"mystery": 7})

    def test_wait_for_open_role_pins_polls_until_mapped(self):
        pending = [
            {"role": "a", "wait_classes": ["A"]},
            {"role": "b", "wait_classes": ["B"]},
        ]
        polls = {"n": 0}
        t = {"v": 0.0}

        def load():
            polls["n"] += 1
            if polls["n"] < 3:
                return [{"windowId": 1, "wmClass": "A", "mode": "FLOAT"}]
            return [
                {"windowId": 1, "wmClass": "A", "mode": "FLOAT"},
                {"windowId": 2, "wmClass": "B", "mode": "FLOAT"},
            ]

        def mono() -> float:
            return t["v"]

        def sleep_fn(s: float) -> None:
            t["v"] += s

        out = wait_for_open_role_pins(
            load,
            pending,
            baseline_ids=set(),
            timeout_ms=5000,
            poll_ms=50,
            sleep_fn=sleep_fn,
            monotonic_fn=mono,
        )
        self.assertTrue(out["ok"])
        self.assertEqual(out["role_pins"], {"a": 1, "b": 2})
        self.assertEqual(out["missing"], [])
        self.assertGreaterEqual(out["polls"], 3)

    def test_wait_for_open_role_pins_timeout_partial(self):
        pending = [
            {"role": "a", "wait_classes": ["A"]},
            {"role": "missing", "wait_classes": ["Nope"]},
        ]
        t = {"v": 0.0}

        def load():
            return [{"windowId": 1, "wmClass": "A", "mode": "FLOAT"}]

        def mono() -> float:
            return t["v"]

        def sleep_fn(s: float) -> None:
            t["v"] += max(s, 0.1)

        out = wait_for_open_role_pins(
            load,
            pending,
            baseline_ids=set(),
            timeout_ms=200,
            poll_ms=50,
            sleep_fn=sleep_fn,
            monotonic_fn=mono,
        )
        self.assertFalse(out["ok"])
        self.assertEqual(out["role_pins"], {"a": 1})
        self.assertEqual(out["missing"], ["missing"])
        self.assertIn("map wait timeout", out["error"] or "")

    def test_assign_open_role_pins_title_disambiguates_chrome(self):
        """X11: all PWAs share Google-chrome — title~= must pin, not open order."""
        pending = [
            {
                "role": "google-chrome",
                "wait_classes": ["Google-chrome"],
                "title_contains": "Google Chrome",
            },
            {
                "role": "Grok",
                "wait_classes": ["Google-chrome", "chrome-ggjo-Default"],
                "title_contains": "Grok",
            },
            {
                "role": "Gmail",
                "wait_classes": ["Google-chrome"],
                "title_contains": "Gmail",
            },
        ]
        # Map order is scrambled vs role open order (Gmail, Grok, about:blank).
        windows = [
            {"windowId": 1, "wmClass": "Google-chrome", "title": "Gmail - Inbox"},
            {"windowId": 2, "wmClass": "Google-chrome", "title": "Grok"},
            {
                "windowId": 3,
                "wmClass": "Google-chrome",
                "title": "about:blank - Google Chrome",
            },
        ]
        pins = assign_open_role_pins(pending, windows, used_ids=set())
        self.assertEqual(
            pins,
            {"google-chrome": 3, "Grok": 2, "Gmail": 1},
        )

    def test_assign_open_role_pins_waits_when_title_missing(self):
        pending = [
            {
                "role": "Grok",
                "wait_classes": ["Google-chrome"],
                "title_contains": "Grok",
            }
        ]
        early = [{"windowId": 9, "wmClass": "Google-chrome", "title": ""}]
        self.assertEqual(assign_open_role_pins(pending, early), {})
        later = [{"windowId": 9, "wmClass": "Google-chrome", "title": "Grok"}]
        self.assertEqual(assign_open_role_pins(pending, later), {"Grok": 9})

    def test_wait_for_open_role_pins_title_polls_until_identity(self):
        pending = [
            {
                "role": "Grok",
                "wait_classes": ["Google-chrome"],
                "title_contains": "Grok",
            },
            {
                "role": "Gmail",
                "wait_classes": ["Google-chrome"],
                "title_contains": "Gmail",
            },
        ]
        polls = {"n": 0}
        t = {"v": 0.0}

        def load():
            polls["n"] += 1
            if polls["n"] < 3:
                # Mapped but titles not ready — must not pin by class alone.
                return [
                    {"windowId": 1, "wmClass": "Google-chrome", "title": ""},
                    {"windowId": 2, "wmClass": "Google-chrome", "title": ""},
                ]
            return [
                {"windowId": 1, "wmClass": "Google-chrome", "title": "Gmail - Inbox"},
                {"windowId": 2, "wmClass": "Google-chrome", "title": "Grok"},
            ]

        def mono() -> float:
            return t["v"]

        def sleep_fn(s: float) -> None:
            t["v"] += s

        out = wait_for_open_role_pins(
            load,
            pending,
            baseline_ids=set(),
            timeout_ms=5000,
            poll_ms=50,
            sleep_fn=sleep_fn,
            monotonic_fn=mono,
        )
        self.assertTrue(out["ok"])
        self.assertEqual(out["role_pins"], {"Grok": 2, "Gmail": 1})
        self.assertGreaterEqual(out["polls"], 3)


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
        # cwd=$HOME so layout from a project dir does not open Ghostty there
        self.assertEqual(popen.call_args.kwargs.get("cwd"), self.forge._launch_home())

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
        self.assertEqual(popen.call_args.kwargs.get("cwd"), self.forge._launch_home())


class TestEnsureSizesApply(unittest.TestCase):
    def test_ensure_sizes_maps_to_size_step(self):
        steps = actions_to_extension_steps(
            [
                {
                    "op": "ensure_sizes",
                    "slot": "mon0",
                    "windowIds": [101, 103],
                    "shares": [0.7, 0.3],
                }
            ]
        )
        self.assertEqual(
            steps,
            [
                {
                    "op": "size",
                    "windowIds": ["id:101", "id:103"],
                    "shares": [0.7, 0.3],
                }
            ],
        )

    def test_ensure_sizes_after_order(self):
        steps = actions_to_extension_steps(
            [
                {
                    "op": "ensure_sizes",
                    "slot": "mon0",
                    "windowIds": [101, 103],
                    "shares": [2, 1],
                },
                {
                    "op": "ensure_order",
                    "slot": "mon0",
                    "mode": "hsplit",
                    "windowIds": [101, 103],
                },
                {
                    "op": "ensure_layout",
                    "slot": "mon0",
                    "mode": "hsplit",
                    "windowIds": [101, 103],
                },
                {"op": "move", "windowId": 9, "slot": "mon1"},
            ]
        )
        ops = [s["op"] for s in steps]
        self.assertEqual(ops[0], "move")
        self.assertEqual(ops[1], "layout")
        self.assertEqual(ops[2], "order")
        self.assertEqual(ops[3], "size")
        self.assertEqual(steps[3]["shares"], [2.0, 1.0])


if __name__ == "__main__":
    unittest.main()
