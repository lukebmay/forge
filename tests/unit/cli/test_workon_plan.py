#!/usr/bin/env python3
"""Unit tests for scripts/forge/workon_plan.py (WR1 pure reconcile planner)."""

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

from workon_plan import (  # noqa: E402
    collect_windows,
    mon_index_from_slot,
    plan_reconcile,
    validate_reconcile_profile,
    window_matches,
)


def _load(name: str):
    return json.loads((_FIXTURES / name).read_text(encoding="utf-8"))


class TestValidateReconcileProfile(unittest.TestCase):
    def test_fixture_ok(self):
        p = validate_reconcile_profile(_load("profile-dev-v2.json"))
        self.assertEqual(p["version"], 2)
        self.assertEqual(p["mode"], "reconcile")
        self.assertEqual(len(p["roles"]), 7)
        self.assertEqual(p["overflow"]["slot"], "mon0.overflow")
        self.assertIn("mon0", p["layout"])

    def test_mode_default_when_roles(self):
        raw = _load("profile-dev-v2.json")
        del raw["mode"]
        p = validate_reconcile_profile(raw)
        self.assertEqual(p["mode"], "reconcile")

    def test_version_default_when_roles(self):
        raw = {
            "roles": [
                {
                    "id": "term",
                    "match": "com.mitchellh.ghostty",
                    "open": "ghostty",
                    "slot": "mon0.term",
                }
            ],
            "layout": {
                "mon0": {"children": [{"roles": ["term"]}]}
            },
        }
        p = validate_reconcile_profile(raw)
        self.assertEqual(p["version"], 2)
        self.assertEqual(p["mode"], "reconcile")
        self.assertEqual(p["roles"][0]["match"]["class"], "com.mitchellh.ghostty")
        self.assertEqual(p["roles"][0]["open"]["app"], "ghostty")
        self.assertEqual(p["roles"][0]["slot"], "mon0.term")
        self.assertEqual(p["layout"]["mon0"]["children"][0]["id"], "term")

    def test_split_and_tabbed_defaults(self):
        raw = {
            "roles": [
                {"id": "a", "class": "Foo", "app": "foo"},
                {"id": "b", "class": "Bar", "app": "bar"},
                {"id": "t", "match": "Term", "open": "term"},
            ],
            "layout": {
                "mon0": {
                    "children": [
                        {"id": "tabs", "roles": ["a", "b"]},
                        {"roles": ["t"]},
                    ]
                }
            },
        }
        p = validate_reconcile_profile(raw)
        self.assertEqual(p["layout"]["mon0"]["split"], "hsplit")
        self.assertEqual(p["layout"]["mon0"]["children"][0]["layout"], "tabbed")
        self.assertEqual(p["roles"][0]["slot"], "mon0.tabs")
        self.assertEqual(p["roles"][2]["slot"], "mon0.t")

    def test_minimal_example_file(self):
        path = _FORGE_CLI / "examples" / "workon-minimal.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        p = validate_reconcile_profile(raw)
        self.assertEqual(len(p["roles"]), 2)
        self.assertEqual(p["layout"]["mon0"]["split"], "hsplit")

    def test_reject_v1(self):
        with self.assertRaisesRegex(ValueError, "unsupported profile version"):
            validate_reconcile_profile({"version": 1, "roles": []})

    def test_reject_empty_roles(self):
        with self.assertRaisesRegex(ValueError, "non-empty"):
            validate_reconcile_profile({"version": 2, "mode": "reconcile", "roles": []})

    def test_reject_missing_match(self):
        with self.assertRaisesRegex(ValueError, "match"):
            validate_reconcile_profile(
                {
                    "version": 2,
                    "roles": [
                        {
                            "id": "x",
                            "open": {"app": "a"},
                            "slot": "mon0.term",
                        }
                    ],
                }
            )

    def test_reject_mon_only_match(self):
        with self.assertRaisesRegex(ValueError, "need class, title"):
            validate_reconcile_profile(
                {
                    "version": 2,
                    "roles": [
                        {
                            "id": "x",
                            "match": {"mon": 0},
                            "open": {"app": "a"},
                            "slot": "mon0.term",
                        }
                    ],
                }
            )

    def test_reject_missing_open_app(self):
        with self.assertRaisesRegex(ValueError, "open.app"):
            validate_reconcile_profile(
                {
                    "version": 2,
                    "roles": [
                        {
                            "id": "x",
                            "match": {"class": "X"},
                            "open": {},
                            "slot": "mon0.term",
                        }
                    ],
                }
            )

    def test_reject_bad_slot(self):
        with self.assertRaisesRegex(ValueError, "invalid slot"):
            validate_reconcile_profile(
                {
                    "version": 2,
                    "roles": [
                        {
                            "id": "x",
                            "match": {"class": "X"},
                            "open": {"app": "a"},
                            "slot": "not-a-slot",
                        }
                    ],
                }
            )

    def test_reject_steps_mode(self):
        with self.assertRaisesRegex(ValueError, "unsupported mode"):
            validate_reconcile_profile(
                {
                    "version": 2,
                    "mode": "steps",
                    "roles": [
                        {
                            "id": "x",
                            "match": {"class": "X"},
                            "open": {"app": "a"},
                            "slot": "mon0.a",
                        }
                    ],
                }
            )

    def test_slot_from_layout_roles(self):
        p = validate_reconcile_profile(
            {
                "version": 2,
                "layout": {
                    "mon0": {
                        "children": [{"id": "term", "roles": ["ghost"]}],
                    }
                },
                "roles": [
                    {
                        "id": "ghost",
                        "match": {"class": "G"},
                        "open": {"app": "ghostty"},
                    }
                ],
            }
        )
        self.assertEqual(p["roles"][0]["slot"], "mon0.term")


class TestMatching(unittest.TestCase):
    def test_class_case_insensitive(self):
        w = {"wmClass": "Google-chrome", "title": "Grok"}
        self.assertTrue(window_matches(w, {"class": "google-chrome"}))

    def test_title_exact(self):
        w = {"wmClass": "X", "title": "Grok"}
        self.assertTrue(window_matches(w, {"title": "Grok"}))
        self.assertFalse(window_matches(w, {"title": "grok"}))

    def test_title_substr(self):
        w = {"title": "Gmail - Inbox - Gmail"}
        self.assertTrue(window_matches(w, {"title~=": "Gmail"}))
        self.assertFalse(window_matches(w, {"title~=": "YouTube"}))

    def test_title_regex(self):
        w = {"title": "Google Chrome"}
        self.assertTrue(window_matches(w, {"title~=": "/^Google Chrome$/"}))
        self.assertFalse(window_matches(w, {"title~=": "/Grok/"}))

    def test_mon_index_from_slot(self):
        self.assertEqual(mon_index_from_slot("mon0.left-tab"), 0)
        self.assertEqual(mon_index_from_slot("mon1.comms"), 1)
        self.assertEqual(mon_index_from_slot("primary.overflow"), 0)


class TestPlanEmpty(unittest.TestCase):
    def test_empty_opens_all(self):
        forest = _load("tree-empty.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["ok"])
        self.assertFalse(plan["nothingToDo"])
        self.assertEqual(plan["counts"]["opened"], 7)
        self.assertEqual(plan["counts"]["reused"], 0)
        self.assertEqual(plan["counts"]["moved"], 0)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["unclaimed"], [])
        opens = [a for a in plan["actions"] if a["op"] == "open"]
        self.assertEqual(len(opens), 7)
        roles_open = {r["id"] for r in plan["roles"] if r["status"] == "open"}
        self.assertEqual(len(roles_open), 7)
        # no park of nonexistent
        self.assertFalse(any(a["op"] == "park" for a in plan["actions"]))


class TestPlanPerfect(unittest.TestCase):
    def test_perfect_nothing_to_do(self):
        forest = _load("tree-perfect.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["ok"])
        self.assertTrue(plan["nothingToDo"])
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertEqual(plan["counts"]["moved"], 0)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"].get("structure", 0), 0)
        self.assertEqual(plan["counts"]["reused"], 7)
        self.assertEqual(plan["actions"], [])
        self.assertTrue(all(r["status"] == "reused" for r in plan["roles"]))


class TestPlanStructureRepair(unittest.TestCase):
    def test_mon_split_anchors_skip_tab_members(self):
        """Mon hsplit ensure anchors on term tiles, not chrome inside tabs."""
        forest = {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "layout": "HSPLIT",
                    "children": [
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
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
                            ],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 103,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "A",
                            "monitor": 0,
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 104,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "B",
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
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "children": [
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 201,
                                    "wmClass": "Google-chrome",
                                    "title": "YouTube",
                                    "monitor": 1,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 202,
                                    "wmClass": "Google-chrome",
                                    "title": "Gmail",
                                    "monitor": 1,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 203,
                                    "wmClass": "Google-chrome",
                                    "title": "Voice",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        }
                    ],
                },
            ],
        }
        plan = plan_reconcile(forest, _load("profile-dev-v2.json"))
        self.assertEqual(plan["counts"]["moved"], 1)
        by_slot = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout" and a.get("slot") in ("mon0", "mon1")
        }
        self.assertEqual(by_slot["mon0"]["windowIds"], [103])
        self.assertEqual(by_slot["mon1"]["windowIds"], [104])
        move = next(a for a in plan["actions"] if a.get("op") == "move")
        self.assertEqual(move.get("position"), "start")
        self.assertEqual(move.get("childIndex"), 0)

    def test_flat_same_mon_needs_structure(self):
        """Windows on correct mons but not tabbed → structure repair, not open."""
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
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertEqual(plan["counts"]["moved"], 0)
        self.assertEqual(plan["counts"]["reused"], 7)
        self.assertEqual(plan["counts"]["structure"], 2)
        ensures = [a for a in plan["actions"] if a["op"] == "ensure_layout"]
        by_slot = {a["slot"]: a for a in ensures}
        self.assertIn("mon0.left-tab", by_slot)
        self.assertEqual(by_slot["mon0.left-tab"]["mode"], "tabbed")
        self.assertEqual(by_slot["mon0.left-tab"]["windowIds"], [101, 102])
        self.assertIn("mon1.comms", by_slot)
        self.assertEqual(by_slot["mon1.comms"]["windowIds"], [202, 203, 204])
        # mon-level ensure omitted when only structure work
        self.assertNotIn("mon0", by_slot)
        self.assertNotIn("mon1", by_slot)


class TestPlanDoubled(unittest.TestCase):
    def test_doubled_claims_one_parks_extras(self):
        forest = _load("tree-doubled-black.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["ok"])
        self.assertFalse(plan["nothingToDo"])
        self.assertEqual(plan["counts"]["opened"], 0)
        # all 7 roles filled from existing windows
        self.assertEqual(plan["counts"]["reused"] + plan["counts"]["moved"], 7)
        claimed_ids = {
            r["windowId"] for r in plan["roles"] if r.get("windowId") is not None
        }
        self.assertEqual(len(claimed_ids), 7)
        # no double-open
        self.assertFalse(any(a["op"] == "open" for a in plan["actions"]))
        # extras parked
        self.assertGreater(plan["counts"]["parked"], 0)
        parks = [a for a in plan["actions"] if a["op"] == "park"]
        self.assertEqual(len(parks), plan["counts"]["parked"])
        for p in parks:
            self.assertEqual(p["slot"], "mon0.overflow")
            self.assertNotIn(p["windowId"], claimed_ids)
        # windows total = claimed + unclaimed
        wins = collect_windows(forest)
        self.assertEqual(len(wins), plan["counts"]["reused"] + plan["counts"]["moved"] + plan["counts"]["parked"])

    def test_ghostty_prefers_slot_mon(self):
        forest = _load("tree-doubled-black.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        by_id = {r["id"]: r for r in plan["roles"]}
        # left ghostty should pick a mon0 ghostty when available
        gl = by_id["ghostty-left"]
        self.assertIn(gl["status"], ("reused", "move"))
        # path mon0 preferred for left
        self.assertTrue(
            str(gl.get("path", "")).startswith("mo0") or gl["status"] == "move"
        )
        gr = by_id["ghostty-right"]
        self.assertNotEqual(gl.get("windowId"), gr.get("windowId"))


class TestPlanPartial(unittest.TestCase):
    def test_missing_one_role_opens_one(self):
        forest = _load("tree-perfect.json")
        # remove Grok window from forest
        mons = forest["monitors"]
        tab = mons[0]["children"][0]
        tab["children"] = [c for c in tab["children"] if c.get("title") != "Grok"]
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertEqual(plan["counts"]["opened"], 1)
        self.assertEqual(plan["counts"]["reused"], 6)
        opens = [a for a in plan["actions"] if a["op"] == "open"]
        self.assertEqual(len(opens), 1)
        self.assertEqual(opens[0]["role"], "grok")
        self.assertEqual(opens[0]["open"]["app"], "Grok")


class TestClaimExclusivity(unittest.TestCase):
    def test_two_roles_same_class_no_steal(self):
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
                            "windowId": 1,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "A",
                            "monitor": 0,
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 2,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "B",
                            "monitor": 0,
                            "children": [],
                        },
                    ],
                },
                {
                    "nodeType": "MONITOR",
                    "id": "mo1ws0",
                    "layout": "HSPLIT",
                    "children": [],
                },
            ],
        }
        profile = {
            "version": 2,
            "mode": "reconcile",
            "overflow": {"slot": "mon0.overflow", "layout": "tabbed"},
            "roles": [
                {
                    "id": "ghostty-left",
                    "match": {"class": "com.mitchellh.ghostty"},
                    "open": {"app": "ghostty"},
                    "slot": "mon0.term",
                },
                {
                    "id": "ghostty-right",
                    "match": {"class": "com.mitchellh.ghostty"},
                    "open": {"app": "ghostty"},
                    "slot": "mon1.term",
                },
            ],
        }
        plan = plan_reconcile(forest, profile)
        ids = [r.get("windowId") for r in plan["roles"]]
        self.assertEqual(len(set(ids)), 2)
        self.assertEqual(plan["counts"]["opened"], 0)
        # right role should move (both wins on mon0)
        by_id = {r["id"]: r for r in plan["roles"]}
        self.assertEqual(by_id["ghostty-left"]["status"], "reused")
        self.assertEqual(by_id["ghostty-right"]["status"], "move")
        moves = [a for a in plan["actions"] if a.get("op") == "move"]
        self.assertEqual(len(moves), 1)
        self.assertEqual(moves[0].get("slot"), "mon1.term")

    def test_single_window_second_role_opens(self):
        forest = {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 9,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "only",
                            "monitor": 0,
                            "children": [],
                        }
                    ],
                }
            ],
        }
        profile = {
            "version": 2,
            "roles": [
                {
                    "id": "a",
                    "match": {"class": "com.mitchellh.ghostty"},
                    "open": {"app": "ghostty"},
                    "slot": "mon0.term",
                },
                {
                    "id": "b",
                    "match": {"class": "com.mitchellh.ghostty"},
                    "open": {"app": "ghostty"},
                    "slot": "mon1.term",
                },
            ],
        }
        plan = plan_reconcile(forest, profile)
        by_id = {r["id"]: r for r in plan["roles"]}
        self.assertEqual(by_id["a"]["status"], "reused")
        self.assertEqual(by_id["b"]["status"], "open")
        self.assertEqual(plan["counts"]["opened"], 1)


class TestEnsureLayout(unittest.TestCase):
    def test_ensure_on_work(self):
        forest = _load("tree-empty.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        ensures = [a for a in plan["actions"] if a["op"] == "ensure_layout"]
        slots = {a["slot"] for a in ensures}
        self.assertIn("mon0", slots)
        self.assertIn("mon1", slots)
        self.assertIn("mon0.left-tab", slots)
        self.assertIn("mon1.comms", slots)


if __name__ == "__main__":
    unittest.main()
