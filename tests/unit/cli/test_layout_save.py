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
    filter_forest_workspace,
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

    def test_save_filter_one_workspace_only(self):
        """WS1: capture only mon roots for target/current workspace."""
        forest = {
            "apiVersion": 2,
            "activeWorkspace": 1,
            "nWorkspaces": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "id": "mo0ws0",
                    "rect": {"x": 0, "y": 0, "width": 1000, "height": 1000},
                    "stableKey": "geom:0,0,1000,1000#primary",
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "layout": None,
                            "rect": {"x": 0, "y": 0, "width": 100, "height": 100},
                            "percent": 0,
                            "userSized": False,
                            "children": [],
                            "mode": "TILE",
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "ws0-term",
                            "windowId": 10,
                            "pid": 110,
                            "monitor": 0,
                        }
                    ],
                },
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "id": "mo0ws1",
                    "rect": {"x": 0, "y": 0, "width": 1000, "height": 1000},
                    "stableKey": "geom:0,0,1000,1000#primary",
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "layout": None,
                            "rect": {"x": 0, "y": 0, "width": 100, "height": 100},
                            "percent": 0,
                            "userSized": False,
                            "children": [],
                            "mode": "TILE",
                            "wmClass": "org.gnome.Nautilus",
                            "title": "ws1-files",
                            "windowId": 20,
                            "pid": 220,
                            "monitor": 0,
                        }
                    ],
                },
            ],
        }
        # Meta activeWorkspace=1 → only Nautilus, not Ghostty.
        profile = profile_for_output(capture_tiles_profile(forest))
        body = json.dumps(profile)
        self.assertIn("nautilus", body.casefold())
        self.assertNotIn("ghostty", body.casefold())
        # Explicit workspace=0 ignores meta and captures Ghostty only.
        profile0 = profile_for_output(capture_tiles_profile(forest, workspace=0))
        body0 = json.dumps(profile0)
        self.assertIn("ghostty", body0.casefold())
        self.assertNotIn("nautilus", body0.casefold())
        # filter_forest_workspace keeps one mon set.
        scoped = filter_forest_workspace(forest, 1)
        self.assertEqual([m["id"] for m in scoped["monitors"]], ["mo0ws1"])
        self.assertEqual(scoped.get("activeWorkspace"), 1)

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

    def test_tab_active_and_profile_focus(self):
        forest = _load("tree-perfect.json")
        # mon0 tab: chrome(101) + Grok(102); make Grok active + focused
        mon0_tab = forest["monitors"][0]["children"][0]
        mon0_tab["lastTabFocusId"] = 102
        forest["focusWindowId"] = 102
        profile = profile_for_output(capture_tiles_profile(forest))
        self.assertIsInstance(profile, dict)
        self.assertEqual(profile.get("focus"), "Grok")
        tiles = profile.get("tiles")
        self.assertIsInstance(tiles, list)
        tab = tiles[0][0]
        self.assertIn("tab", tab)
        self.assertEqual(tab.get("active"), "Grok")

        ir = validate_reconcile_profile(profile, mon_count=2)
        self.assertEqual(ir.get("focus"), "Grok")
        kids = ir["layout"]["mon0"]["children"]
        tab_child = next(c for c in kids if c.get("layout") == "tabbed")
        self.assertEqual(tab_child.get("active"), "Grok")

    def test_dual_grok_active_and_focus_indexed(self):
        """Two Grok leaves → save emits [token, n]; plan focuses second windowId."""
        forest = _load("tree-perfect.json")
        mon0_tab = forest["monitors"][0]["children"][0]
        first = dict(mon0_tab["children"][0])
        first["title"] = "Grok"
        first["wmClass"] = "Google-chrome"
        mon0_tab["children"][0] = first
        mon0_tab["children"][1]["title"] = "Grok"
        mon0_tab["lastTabFocusId"] = 102
        forest["focusWindowId"] = 102

        profile = profile_for_output(capture_tiles_profile(forest))
        self.assertIsInstance(profile, dict)
        self.assertEqual(profile.get("focus"), ["Grok", 1])
        tab = profile["tiles"][0][0]
        self.assertEqual(tab.get("active"), ["Grok", 1])
        self.assertEqual(tab.get("tab"), ["Grok", "Grok"])

        ir = validate_reconcile_profile(profile, mon_count=2)
        self.assertEqual(ir.get("focus"), "Grok-2")
        tab_child = next(
            c for c in ir["layout"]["mon0"]["children"] if c.get("layout") == "tabbed"
        )
        self.assertEqual(tab_child.get("active"), "Grok-2")
        self.assertEqual(tab_child.get("roles"), ["Grok", "Grok-2"])

        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["ok"])
        focus_ops = [a for a in plan["actions"] if a.get("op") == "focus"]
        sels = [a.get("selector") for a in focus_ops]
        self.assertIn("id:102", sels)
        by_role = {r["id"]: r.get("windowId") for r in plan["roles"]}
        self.assertEqual(by_role.get("Grok"), 101)
        self.assertEqual(by_role.get("Grok-2"), 102)

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

    def test_empty_desk_saves_empty_profile(self):
        """Empty forest → bare [] so `forge layout clean` can close everything."""
        raw = capture_tiles_profile(_load("tree-empty.json"))
        self.assertEqual(raw.get("tiles"), {})
        self.assertTrue(raw.get("_stats", {}).get("empty"))
        out = profile_for_output(raw)
        self.assertEqual(out, [])
        ir = validate_reconcile_profile(out)
        self.assertEqual(ir["roles"], [])
        self.assertEqual(ir["version"], 2)

    def test_float_only_saves_empty_profile(self):
        """FLOAT-only desk (e.g. Guake) → empty profile, not an error."""
        forest = {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "id": "mo0ws0",
                    "rect": {"x": 0, "y": 0, "width": 1000, "height": 1000},
                    "stableKey": "geom:0,0,1000,1000#primary",
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "layout": None,
                            "rect": {
                                "x": 0,
                                "y": 0,
                                "width": 100,
                                "height": 100,
                            },
                            "percent": 0,
                            "userSized": False,
                            "children": [],
                            "wmClass": "org.inkscape.Inkscape",
                            "title": "Drawing",
                            "windowId": 9001,
                            "pid": 9001,
                            "monitor": 0,
                            "mode": "FLOAT",
                        }
                    ],
                }
            ],
        }
        raw = capture_tiles_profile(forest)
        self.assertEqual(raw.get("tiles"), {})
        self.assertNotIn("floating", raw)
        self.assertEqual(raw.get("_stats", {}).get("floating"), 1)
        out = profile_for_output(raw)
        self.assertEqual(out, [])
        plan = plan_reconcile(forest, out, clean=True)
        self.assertEqual(plan["counts"]["closed"], 1)
        self.assertEqual(plan["actions"][0]["op"], "close")
        self.assertEqual(plan["actions"][0]["windowId"], 9001)

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

    def test_mon_vsplit_saves_tagged_not_bare_hsplit(self):
        """Mon-root VSPLIT [ghostty, nautilus] must not desugar as hsplit."""
        forest = {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "layout": "VSPLIT",
                    "rect": {"x": 0, "y": 0, "width": 1000, "height": 1000},
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 1,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 0,
                            "mode": "TILE",
                            "rect": {
                                "x": 0,
                                "y": 0,
                                "width": 1000,
                                "height": 500,
                            },
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 2,
                            "wmClass": "org.gnome.Nautilus",
                            "title": "Home",
                            "monitor": 0,
                            "mode": "TILE",
                            "rect": {
                                "x": 0,
                                "y": 500,
                                "width": 1000,
                                "height": 500,
                            },
                            "children": [],
                        },
                    ],
                }
            ],
        }
        raw = capture_tiles_profile(forest)
        self.assertEqual(raw["tiles"]["mon0"], {"vsplit": ["ghostty", "nautilus"]})
        sugar = profile_for_output(raw)
        # Single mon: mon map (not bare [{vsplit}] nested-only pane list).
        self.assertIsInstance(sugar, dict)
        mon_body = sugar.get("tiles", sugar).get("mon0")
        self.assertEqual(mon_body, {"vsplit": ["ghostty", "nautilus"]})

        ir = validate_reconcile_profile(sugar, mon_count=1)
        self.assertEqual(ir["layout"]["mon0"].get("split"), "vsplit")
        kids = ir["layout"]["mon0"]["children"]
        self.assertEqual(len(kids), 2)
        self.assertEqual(kids[0].get("roles"), ["ghostty"])
        self.assertEqual(kids[1].get("roles"), ["nautilus"])

    def test_mon_vsplit_reopen_plan_ensure_vsplit(self):
        """After closing nautilus, plan ensure_layout mode=vsplit (not hsplit)."""
        forest = {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "layout": "VSPLIT",
                    "rect": {"x": 0, "y": 0, "width": 1000, "height": 1000},
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 1,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 0,
                            "mode": "TILE",
                            "rect": {
                                "x": 0,
                                "y": 0,
                                "width": 1000,
                                "height": 500,
                            },
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 2,
                            "wmClass": "org.gnome.Nautilus",
                            "title": "Home",
                            "monitor": 0,
                            "mode": "TILE",
                            "rect": {
                                "x": 0,
                                "y": 500,
                                "width": 1000,
                                "height": 500,
                            },
                            "children": [],
                        },
                    ],
                }
            ],
        }
        sugar = profile_for_output(capture_tiles_profile(forest))
        live = {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "layout": "HSPLIT",
                    "rect": {"x": 0, "y": 0, "width": 1000, "height": 1000},
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 1,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 0,
                            "mode": "TILE",
                            "rect": {
                                "x": 0,
                                "y": 0,
                                "width": 1000,
                                "height": 1000,
                            },
                            "children": [],
                        }
                    ],
                }
            ],
        }
        plan = plan_reconcile(live, sugar)
        self.assertTrue(plan["ok"])
        by_id = {r["id"]: r for r in plan["roles"]}
        self.assertEqual(by_id["ghostty"]["status"], "reused")
        self.assertEqual(by_id["nautilus"]["status"], "open")
        ensures = [
            a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout" and a.get("slot") == "mon0"
        ]
        self.assertTrue(ensures, plan["actions"])
        self.assertEqual(ensures[0].get("mode"), "vsplit")
        self.assertNotEqual(ensures[0].get("mode"), "hsplit")

    def test_dual_mon_vsplit_bare_preserves_mon_split(self):
        """Dual bare [{vsplit:…}, mon1Body] + mon_count=2 → mon0.split=vsplit."""
        forest = {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "layout": "VSPLIT",
                    "rect": {"x": 0, "y": 0, "width": 1000, "height": 1000},
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 1,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 0,
                            "mode": "TILE",
                            "rect": {
                                "x": 0,
                                "y": 0,
                                "width": 1000,
                                "height": 500,
                            },
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 2,
                            "wmClass": "org.gnome.Nautilus",
                            "title": "Home",
                            "monitor": 0,
                            "mode": "TILE",
                            "rect": {
                                "x": 0,
                                "y": 500,
                                "width": 1000,
                                "height": 500,
                            },
                            "children": [],
                        },
                    ],
                },
                {
                    "nodeType": "MONITOR",
                    "id": "mo1ws0",
                    "layout": "HSPLIT",
                    "rect": {"x": 1000, "y": 0, "width": 1000, "height": 1000},
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 3,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 1,
                            "mode": "TILE",
                            "rect": {
                                "x": 1000,
                                "y": 0,
                                "width": 1000,
                                "height": 1000,
                            },
                            "children": [],
                        }
                    ],
                },
            ],
        }
        sugar = profile_for_output(capture_tiles_profile(forest))
        self.assertIsInstance(sugar, list)
        self.assertEqual(len(sugar), 2)
        self.assertEqual(sugar[0], {"vsplit": ["ghostty", "nautilus"]})
        self.assertEqual(sugar[1], ["ghostty"])

        ir = validate_reconcile_profile(sugar, mon_count=2)
        self.assertEqual(ir["layout"]["mon0"].get("split"), "vsplit")
        self.assertEqual(len(ir["layout"]["mon0"]["children"]), 2)
        self.assertIn("mon1", ir["layout"])

    def test_dual_mon_hsplit_tree_perfect_unchanged(self):
        """Tree-perfect dual HSPLIT still bare array with mon split hsplit."""
        forest = _load("tree-perfect.json")
        sugar = profile_for_output(capture_tiles_profile(forest))
        self.assertIsInstance(sugar, list)
        self.assertEqual(len(sugar), 2)
        # mon bodies remain bare pane lists (default hsplit), not {vsplit:…}
        self.assertIsInstance(sugar[0], list)
        self.assertIsInstance(sugar[1], list)
        ir = validate_reconcile_profile(sugar, mon_count=2)
        self.assertEqual(ir["layout"]["mon0"].get("split"), "hsplit")
        self.assertEqual(ir["layout"]["mon1"].get("split"), "hsplit")


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


class TestShareCapture(unittest.TestCase):
    """SZ1: custom mon/split shares round-trip via save sugar."""

    def _mon_forest(self, *, p0=0.0, p1=0.0, u0=False, u1=False):
        return {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "layout": "HSPLIT",
                    "percent": 0,
                    "userSized": False,
                    "rect": {"x": 0, "y": 0, "width": 1000, "height": 1000},
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 1,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 0,
                            "mode": "TILE",
                            "percent": p0,
                            "userSized": u0,
                            "rect": {
                                "x": 0,
                                "y": 0,
                                "width": 700,
                                "height": 1000,
                            },
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 2,
                            "wmClass": "org.gnome.Nautilus",
                            "title": "Home",
                            "monitor": 0,
                            "mode": "TILE",
                            "percent": p1,
                            "userSized": u1,
                            "rect": {
                                "x": 700,
                                "y": 0,
                                "width": 300,
                                "height": 1000,
                            },
                            "children": [],
                        },
                    ],
                }
            ],
        }

    def test_user_sized_emits_share(self):
        forest = self._mon_forest(p0=0.7, p1=0.3, u0=True, u1=True)
        raw = capture_tiles_profile(forest)
        mon0 = raw["tiles"]["mon0"]
        self.assertIsInstance(mon0, dict)
        self.assertIn("hsplit", mon0)
        self.assertIn("share", mon0)
        self.assertEqual(mon0["share"], [0.7, 0.3])

        sugar = profile_for_output(raw)
        # Single mon with mon-level hsplit+share stays mon-map (not bare panes).
        if isinstance(sugar, dict) and "tiles" in sugar:
            body = sugar["tiles"]
            if isinstance(body, dict):
                mon_body = body.get("mon0")
            else:
                mon_body = body
        elif isinstance(sugar, dict) and "mon0" in sugar:
            mon_body = sugar["mon0"]
        else:
            mon_body = sugar
        self.assertIsInstance(mon_body, dict)
        self.assertIn("share", mon_body)
        self.assertEqual(mon_body["share"], [0.7, 0.3])

    def test_equal_percent_no_share(self):
        forest = self._mon_forest(p0=0, p1=0, u0=False, u1=False)
        sugar = profile_for_output(capture_tiles_profile(forest))
        # Bare panes list — no share key
        self.assertIsInstance(sugar, list)
        self.assertEqual(len(sugar), 2)
        self.assertTrue(all(not isinstance(x, dict) or "share" not in x for x in sugar))

    def test_roundtrip_normalize_keeps_share(self):
        forest = self._mon_forest(p0=0.7, p1=0.3, u0=True, u1=True)
        sugar = profile_for_output(capture_tiles_profile(forest))
        ir = normalize_profile(sugar, mon_count=1)
        mon = ir["layout"]["mon0"]
        self.assertEqual(mon.get("share"), [0.7, 0.3])
        self.assertEqual(len(mon["children"]), 2)


if __name__ == "__main__":
    unittest.main()
