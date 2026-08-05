#!/usr/bin/env python3
"""Unit tests for scripts/forge/layout_plan.py (WR1 pure reconcile planner)."""

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

from layout_plan import (  # noqa: E402
    collect_windows,
    detect_thrash,
    forest_stable_key_map,
    format_layout_description,
    mon_head_and_rest,
    mon_index_from_slot,
    normalize_profile,
    normalize_shares,
    plan_reconcile,
    resolve_mon_key,
    resolve_profile_mon_keys,
    validate_reconcile_profile,
    window_matches,
)
from layout_plan import _class_eq as plan_class_eq  # noqa: E402
from layout_plan import _mon_split_anchor_ids  # noqa: E402


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
        path = _FORGE_CLI / "examples" / "layout-minimal.json"
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


class TestTilesNormalize(unittest.TestCase):
    """WR10 compact tiles sugar → v2 IR."""

    def test_dual_mon_happy_path(self):
        raw = {
            "tiles": {
                "mon0": [["google-chrome", "grok"], "ghostty"],
                "mon1": ["ghostty", ["youtube", "gmail", "voice"]],
            }
        }
        p = validate_reconcile_profile(raw)
        self.assertEqual(p["version"], 2)
        self.assertEqual(p["mode"], "reconcile")
        self.assertEqual(p["overflow"]["slot"], "mon0.overflow")
        self.assertEqual(p["overflow"]["layout"], "tabbed")
        self.assertEqual(p["marginal"]["mode"], "coexist")
        self.assertEqual(p["marginal"]["roleOrder"], "first")
        self.assertEqual(p["marginal"]["residual"], "leave")

        self.assertEqual(p["layout"]["mon0"]["split"], "hsplit")
        self.assertEqual(p["layout"]["mon1"]["split"], "hsplit")

        m0 = p["layout"]["mon0"]["children"]
        self.assertEqual(m0[0]["id"], "s0")
        self.assertEqual(m0[0]["layout"], "tabbed")
        self.assertEqual(m0[0]["roles"], ["google-chrome", "grok"])
        self.assertEqual(m0[1]["id"], "ghostty")
        self.assertEqual(m0[1]["roles"], ["ghostty"])

        m1 = p["layout"]["mon1"]["children"]
        self.assertEqual(m1[0]["id"], "ghostty-2")
        self.assertEqual(m1[0]["roles"], ["ghostty-2"])
        self.assertEqual(m1[1]["id"], "s0")
        self.assertEqual(m1[1]["layout"], "tabbed")
        self.assertEqual(m1[1]["roles"], ["youtube", "gmail", "voice"])

        by_id = {r["id"]: r for r in p["roles"]}
        self.assertEqual(len(by_id), 7)
        self.assertEqual(by_id["ghostty"]["slot"], "mon0.ghostty")
        self.assertEqual(by_id["ghostty-2"]["slot"], "mon1.ghostty-2")
        self.assertEqual(by_id["google-chrome"]["slot"], "mon0.s0")
        self.assertEqual(by_id["youtube"]["slot"], "mon1.s0")
        self.assertEqual(by_id["ghostty"]["open"]["app"], "ghostty")
        self.assertEqual(by_id["ghostty"]["match"]["class"], "ghostty")

    def test_nested_split_explicit(self):
        raw = {
            "tiles": {
                "mon0": ["term"],
                "mon1": {
                    "split": "h",
                    "content": [
                        "ghostty",
                        {
                            "split": "v",
                            "content": [["youtube", "gmail"], "nautilus"],
                        },
                    ],
                },
            }
        }
        p = validate_reconcile_profile(raw)
        self.assertEqual(p["layout"]["mon1"]["split"], "hsplit")
        kids = p["layout"]["mon1"]["children"]
        self.assertEqual(kids[0]["roles"], ["ghostty"])
        nested = kids[1]
        self.assertEqual(nested["split"], "vsplit")
        self.assertEqual(nested["children"][0]["layout"], "tabbed")
        self.assertEqual(nested["children"][0]["roles"], ["youtube", "gmail"])
        self.assertEqual(nested["children"][1]["id"], "nautilus")
        by_id = {r["id"]: r for r in p["roles"]}
        self.assertEqual(by_id["youtube"]["slot"], f"mon1.{nested['id']}.{nested['children'][0]['id']}")
        self.assertEqual(by_id["nautilus"]["slot"], f"mon1.{nested['id']}.nautilus")

    def test_nested_array_form(self):
        raw = {
            "tiles": {
                "mon0": [
                    "a",
                    [["b", "c"], "d"],
                ]
            }
        }
        p = validate_reconcile_profile(raw)
        kids = p["layout"]["mon0"]["children"]
        self.assertEqual(kids[0]["id"], "a")
        self.assertIn("children", kids[1])
        self.assertEqual(kids[1]["split"], "hsplit")
        self.assertEqual(kids[1]["children"][0]["layout"], "tabbed")
        self.assertEqual(kids[1]["children"][1]["id"], "d")

    def test_stacked_layout_content_sugar(self):
        """{layout: stacked, content: roles} → multi-role leaf layout stacked."""
        raw = {
            "tiles": {
                "mon0": [
                    {"layout": "stacked", "content": ["ghostty", "nautilus"]},
                    "firefox",
                ]
            }
        }
        p = validate_reconcile_profile(raw)
        kids = p["layout"]["mon0"]["children"]
        self.assertEqual(kids[0]["layout"], "stacked")
        self.assertEqual(kids[0]["roles"], ["ghostty", "nautilus"])
        self.assertNotIn("children", kids[0])
        self.assertEqual(kids[1]["roles"], ["firefox"])
        by_id = {r["id"]: r for r in p["roles"]}
        self.assertEqual(by_id["ghostty"]["slot"], f"mon0.{kids[0]['id']}")
        self.assertEqual(by_id["nautilus"]["slot"], f"mon0.{kids[0]['id']}")

    def test_stacked_split_alias_role_content(self):
        """split: stacked with only role cells also desugars to stacked leaf."""
        raw = {
            "tiles": {
                "mon0": [{"split": "stacked", "content": ["a", "b"]}],
            }
        }
        p = validate_reconcile_profile(raw)
        kids = p["layout"]["mon0"]["children"]
        self.assertEqual(len(kids), 1)
        self.assertEqual(kids[0]["layout"], "stacked")
        self.assertEqual(kids[0]["roles"], ["a", "b"])

    def test_bare_multi_cell_still_tabbed(self):
        raw = {"tiles": {"mon0": [["a", "b"]]}}
        p = validate_reconcile_profile(raw)
        self.assertEqual(p["layout"]["mon0"]["children"][0]["layout"], "tabbed")

    def test_id_dedupe(self):
        raw = {"tiles": {"mon0": ["ghostty", "ghostty", "ghostty"]}}
        p = validate_reconcile_profile(raw)
        ids = [r["id"] for r in p["roles"]]
        self.assertEqual(ids, ["ghostty", "ghostty-2", "ghostty-3"])
        self.assertEqual(len(set(ids)), 3)

    def test_split_aliases(self):
        for alias, want in (
            ("h", "hsplit"),
            ("horizontal", "hsplit"),
            ("hsplit", "hsplit"),
            ("v", "vsplit"),
            ("vertical", "vsplit"),
            ("vsplit", "vsplit"),
        ):
            p = validate_reconcile_profile(
                {"tiles": {"mon0": {"split": alias, "content": ["a", "b"]}}}
            )
            self.assertEqual(p["layout"]["mon0"]["split"], want, alias)

    def test_rich_object_cell(self):
        raw = {
            "tiles": {
                "mon0": [
                    {
                        "id": "grok",
                        "match": {"class": "Google-chrome", "title~=": "Grok"},
                        "open": {"app": "Grok", "wmClass": "Google-chrome"},
                    },
                    "ghostty",
                ]
            }
        }
        p = validate_reconcile_profile(raw)
        by_id = {r["id"]: r for r in p["roles"]}
        self.assertEqual(by_id["grok"]["match"]["title~="], "Grok")
        self.assertEqual(by_id["grok"]["open"]["wmClass"], "Google-chrome")
        self.assertEqual(by_id["ghostty"]["open"]["app"], "ghostty")

    def test_ir_passthrough_no_regression(self):
        raw = _load("profile-dev-v2.json")
        p = validate_reconcile_profile(raw)
        self.assertEqual(len(p["roles"]), 7)
        self.assertIn("mon0", p["layout"])
        self.assertEqual(p["layout"]["mon0"]["children"][0]["id"], "left-tab")
        # normalize is idempotent on IR
        n1 = normalize_profile(raw)
        n2 = normalize_profile(n1)
        self.assertEqual(n1["roles"], n2["roles"])
        self.assertEqual(n1["layout"], n2["layout"])
        self.assertEqual(n2["marginal"]["mode"], "coexist")

    def test_example_tiles_minimal_file(self):
        path = _FORGE_CLI / "examples" / "layout-tiles-minimal.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        self.assertIsInstance(raw, list)  # bare dual-mon array
        p = validate_reconcile_profile(raw)
        self.assertEqual(len(p["roles"]), 7)
        self.assertEqual(p["layout"]["mon0"]["split"], "hsplit")
        self.assertEqual(p["layout"]["mon1"]["split"], "hsplit")

    def test_example_tiles_nested_file(self):
        path = _FORGE_CLI / "examples" / "layout-tiles-nested.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        # Explicit mon0/mon1 (mon1 body is tagged hsplit, not a bare list)
        self.assertIsInstance(raw, dict)
        self.assertIn("mon0", raw)
        self.assertIn("mon1", raw)
        p = validate_reconcile_profile(raw)
        self.assertGreaterEqual(len(p["roles"]), 7)
        self.assertEqual(p["layout"]["mon1"]["split"], "hsplit")
        self.assertTrue(p.get("monExplicit"))

    def test_single_item_list_like_string(self):
        p = validate_reconcile_profile({"tiles": {"mon0": [["ghostty"]]}})
        self.assertEqual(p["roles"][0]["id"], "ghostty")
        self.assertEqual(p["layout"]["mon0"]["children"][0]["id"], "ghostty")

    def test_nested_ir_validate(self):
        raw = {
            "version": 2,
            "roles": [
                {
                    "id": "a",
                    "match": "A",
                    "open": "a",
                    "slot": "mon0.s0.a",
                },
                {
                    "id": "b",
                    "match": "B",
                    "open": "b",
                    "slot": "mon0.s0.b",
                },
            ],
            "layout": {
                "mon0": {
                    "split": "hsplit",
                    "children": [
                        {
                            "id": "s0",
                            "split": "vsplit",
                            "children": [
                                {"id": "a", "roles": ["a"]},
                                {"id": "b", "roles": ["b"]},
                            ],
                        }
                    ],
                }
            },
        }
        p = validate_reconcile_profile(raw)
        self.assertEqual(p["layout"]["mon0"]["children"][0]["split"], "vsplit")
        self.assertEqual(p["roles"][0]["slot"], "mon0.s0.a")


class TestBareArrayNormalize(unittest.TestCase):
    """LS1: top-level bare JSON array → mon tiles IR."""

    def test_dual_mon_fixture(self):
        raw = _load("profile-bare-dual-mon.json")
        self.assertIsInstance(raw, list)
        p = validate_reconcile_profile(raw)
        self.assertEqual(p["version"], 2)
        self.assertIn("mon0", p["layout"])
        self.assertIn("mon1", p["layout"])
        self.assertEqual(p["layout"]["mon0"]["split"], "hsplit")
        self.assertEqual(p["layout"]["mon1"]["split"], "hsplit")
        self.assertEqual(len(p["roles"]), 7)
        by_id = {r["id"]: r for r in p["roles"]}
        self.assertEqual(by_id["ghostty"]["slot"], "mon0.ghostty")
        self.assertEqual(by_id["ghostty-2"]["slot"], "mon1.ghostty-2")
        self.assertEqual(by_id["Grok"]["slot"], "mon0.s0")
        self.assertEqual(by_id["YouTube"]["slot"], "mon1.s0")

    def test_single_mon_fixture(self):
        raw = _load("profile-bare-single-mon.json")
        p = validate_reconcile_profile(raw)
        self.assertIn("mon0", p["layout"])
        self.assertNotIn("mon1", p["layout"])
        self.assertEqual(p["layout"]["mon0"]["split"], "hsplit")
        kids = p["layout"]["mon0"]["children"]
        self.assertEqual(kids[0]["layout"], "tabbed")
        self.assertEqual(kids[0]["roles"], ["firefox", "code"])
        self.assertEqual(kids[1]["id"], "ghostty")

    def test_flat_strings_stay_mon0(self):
        p = validate_reconcile_profile(["firefox", "ghostty"])
        self.assertIn("mon0", p["layout"])
        self.assertNotIn("mon1", p["layout"])
        self.assertEqual(len(p["roles"]), 2)

    def test_mixed_top_level_not_mon_list(self):
        # Tab group + string → single mon panes (not mon0/mon1).
        p = validate_reconcile_profile([["a", "b"], "c"])
        self.assertNotIn("mon1", p["layout"])
        kids = p["layout"]["mon0"]["children"]
        self.assertEqual(kids[0]["layout"], "tabbed")
        self.assertEqual(kids[1]["id"], "c")

    def test_tiles_array_key(self):
        raw = {
            "description": "with tiles array",
            "tiles": [
                [["google-chrome", "Grok"], "ghostty"],
                ["ghostty", ["YouTube", "Gmail"]],
            ],
            "floating": [],
        }
        p = validate_reconcile_profile(raw)
        self.assertEqual(p["description"], "with tiles array")
        self.assertEqual(p["floating"], [])
        self.assertIn("mon0", p["layout"])
        self.assertIn("mon1", p["layout"])
        self.assertEqual(len(p["roles"]), 6)

    def test_existing_monn_object_still_works(self):
        raw = {
            "tiles": {
                "mon0": [["google-chrome", "Grok"], "ghostty"],
                "mon1": ["ghostty", ["YouTube", "Gmail", "Google Voice"]],
            }
        }
        p = validate_reconcile_profile(raw)
        self.assertEqual(len(p["roles"]), 7)
        self.assertIn("mon0", p["layout"])
        self.assertIn("mon1", p["layout"])


class TestStringCellInference(unittest.TestCase):
    """LS2: string cells infer open + match (chrome PWA / stem)."""

    def test_grok_is_chrome_pwa(self):
        p = validate_reconcile_profile({"tiles": {"mon0": ["Grok"]}})
        r = p["roles"][0]
        self.assertEqual(r["open"]["app"], "Grok")
        self.assertEqual(r["match"]["class"], "Google-chrome")
        self.assertEqual(r["match"]["title~="], "Grok")

    def test_ghostty_stem_class(self):
        p = validate_reconcile_profile({"tiles": {"mon0": ["ghostty"]}})
        r = p["roles"][0]
        self.assertEqual(r["open"]["app"], "ghostty")
        self.assertEqual(r["match"]["class"], "ghostty")
        self.assertNotIn("title~=", r["match"])

    def test_google_chrome_launcher(self):
        p = validate_reconcile_profile({"tiles": {"mon0": ["google-chrome"]}})
        r = p["roles"][0]
        self.assertEqual(r["open"]["app"], "google-chrome")
        self.assertEqual(r["match"]["class"], "Google-chrome")
        self.assertEqual(r["match"]["title~="], "Google Chrome")

    def test_youtube_known_pwa(self):
        p = validate_reconcile_profile({"tiles": {"mon0": ["YouTube"]}})
        r = p["roles"][0]
        self.assertEqual(r["match"]["class"], "Google-chrome")
        self.assertEqual(r["match"]["title~="], "YouTube")

    def test_google_voice_multiword(self):
        p = validate_reconcile_profile({"tiles": {"mon0": ["Google Voice"]}})
        r = p["roles"][0]
        self.assertEqual(r["open"]["app"], "Google Voice")
        self.assertEqual(r["match"]["class"], "Google-chrome")
        self.assertEqual(r["match"]["title~="], "Voice")
        self.assertEqual(r["id"], "Google-Voice")

    def test_explicit_object_overrides(self):
        p = validate_reconcile_profile(
            {
                "tiles": {
                    "mon0": [
                        {
                            "app": "Grok",
                            "class": "Custom-Class",
                            "title~=": "MyGrok",
                        }
                    ]
                }
            }
        )
        r = p["roles"][0]
        self.assertEqual(r["match"]["class"], "Custom-Class")
        self.assertEqual(r["match"]["title~="], "MyGrok")
        self.assertEqual(r["open"]["app"], "Grok")

    def test_grok_claims_window(self):
        w = {"wmClass": "Google-chrome", "title": "Grok"}
        p = validate_reconcile_profile({"tiles": {"mon0": ["Grok"]}})
        self.assertTrue(window_matches(w, p["roles"][0]["match"]))
        self.assertFalse(
            window_matches(
                {"wmClass": "Google-chrome", "title": "Gmail - Inbox"},
                p["roles"][0]["match"],
            )
        )

    def test_ghostty_claims_reverse_dns(self):
        w = {"wmClass": "com.mitchellh.ghostty", "title": "Ghostty"}
        p = validate_reconcile_profile({"tiles": {"mon0": ["ghostty"]}})
        self.assertTrue(window_matches(w, p["roles"][0]["match"]))

    def test_bare_dual_plans_perfect_tree(self):
        forest = _load("tree-perfect.json")
        profile = _load("profile-bare-dual-mon.json")
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["ok"])
        self.assertTrue(plan["nothingToDo"], plan)
        self.assertEqual(plan["counts"]["reused"], 7)
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertEqual(plan["counts"]["moved"], 0)


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

    def test_title_substr_main_chrome_not_pwa(self):
        """Main Chrome tabs end with ' - Google Chrome'; PWAs do not."""
        m = {"class": "Google-chrome", "title~=": "Google Chrome"}
        self.assertTrue(
            window_matches(
                {"wmClass": "Google-chrome", "title": "New Tab - Google Chrome"}, m
            )
        )
        self.assertTrue(
            window_matches(
                {"wmClass": "Google-chrome", "title": "Google Chrome"}, m
            )
        )
        self.assertFalse(
            window_matches({"wmClass": "Google-chrome", "title": "Grok"}, m)
        )
        self.assertFalse(
            window_matches(
                {"wmClass": "Google-chrome", "title": "Gmail - Inbox - Gmail"}, m
            )
        )

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
        self.assertEqual(plan["counts"].get("ordered", 0), 0)
        self.assertEqual(plan["counts"]["reused"], 7)
        self.assertEqual(plan["actions"], [])
        self.assertTrue(all(r["status"] == "reused" for r in plan["roles"]))
        self.assertFalse(any(a.get("op") == "ensure_order" for a in plan["actions"]))


class TestMonOrder(unittest.TestCase):
    """Mon-level L/R pane order vs profile (ensure_order)."""

    def test_mon0_reversed_emits_ensure_order(self):
        """[ghostty, TABBED chrome|grok] + all roles reused → ensure_order mon0."""
        forest = _load("tree-mon0-reversed.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["ok"])
        self.assertFalse(plan["nothingToDo"])
        self.assertEqual(plan["counts"]["reused"], 7)
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertEqual(plan["counts"]["moved"], 0)
        self.assertEqual(plan["counts"].get("structure", 0), 0)
        self.assertEqual(plan["counts"]["ordered"], 1)
        orders = [a for a in plan["actions"] if a.get("op") == "ensure_order"]
        self.assertEqual(len(orders), 1)
        o = orders[0]
        self.assertEqual(o["slot"], "mon0")
        self.assertEqual(o["mode"], "hsplit")
        # Profile mon0: left-tab (chrome) then term (ghostty)
        self.assertEqual(o["windowIds"], [101, 103])
        # No mon ensure_layout thrash — order only
        self.assertFalse(
            any(
                a.get("op") == "ensure_layout" and a.get("slot") in ("mon0", "mon1")
                for a in plan["actions"]
            )
        )

    def test_perfect_order_no_ensure_order(self):
        forest = _load("tree-perfect.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["nothingToDo"])
        self.assertEqual(plan["counts"].get("ordered", 0), 0)
        self.assertFalse(any(a.get("op") == "ensure_order" for a in plan["actions"]))


class TestTwoPassMonClaim(unittest.TestCase):
    """Same-class dual-mon roles must not steal the only on-mon window."""

    def test_mon0_ghostty_missing_does_not_steal_mon1(self):
        """mon0 empty of ghostty, mon1 has one → mon1 reused, mon0 open (not move)."""
        profile = [
            [["google-chrome", "Grok"], "ghostty"],
            ["ghostty", ["YouTube", "Gmail", "Google Voice"]],
        ]
        forest = {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "layout": "HSPLIT",
                    "children": [],
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
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "children": [
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
                                    "title": "Google Voice",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        plan = plan_reconcile(forest, profile)
        by_id = {r["id"]: r for r in plan["roles"]}
        self.assertEqual(by_id["ghostty"]["status"], "open")
        self.assertNotIn("windowId", by_id["ghostty"])
        self.assertEqual(by_id["ghostty-2"]["status"], "reused")
        self.assertEqual(by_id["ghostty-2"]["windowId"], 201)
        moves = [
            a
            for a in plan["actions"]
            if a.get("op") == "move" and a.get("windowId") == 201
        ]
        self.assertEqual(moves, [])

    def test_mon_ensure_skips_when_only_tab_members_have_ids(self):
        """Term role open + only tab windows live → no mon hsplit on tab leaves."""
        profile = [
            [["google-chrome", "Grok"], "ghostty"],
            ["ghostty", ["YouTube", "Gmail", "Google Voice"]],
        ]
        forest = {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "layout": "HSPLIT",
                    "children": [],
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
                                    "title": "Google Voice",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        }
                    ],
                },
            ],
        }
        plan = plan_reconcile(forest, profile)
        by_id = {r["id"]: r for r in plan["roles"]}
        self.assertEqual(by_id["ghostty"]["status"], "open")
        self.assertEqual(by_id["ghostty-2"]["status"], "open")
        mon_ensures = [
            a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout" and a.get("slot") in ("mon0", "mon1")
        ]
        for a in mon_ensures:
            wids = a.get("windowIds") or []
            self.assertFalse(
                set(wids) & {202, 203, 204},
                f"mon ensure must not select tab members: {a}",
            )
        # Direct unit: term open → no safe anchors for mon1
        prof = validate_reconcile_profile(profile, mon_count=2)
        role_results = plan["roles"]
        anchors = _mon_split_anchor_ids(role_results, "mon1", prof)
        self.assertEqual(anchors, [])


class TestPartialReopenLF1(unittest.TestCase):
    """
    LF1: close mon0 Ghostty + chrome, keep Grok + mon1 desk; forge layout dev.
    mon0 ghostty open (not steal mon1); Grok stays open leaf; residual pins.
    """

    PROFILE = [
        [["google-chrome", "Grok"], "ghostty"],
        ["ghostty", ["YouTube", "Gmail", "Google Voice"]],
    ]

    def _forest_repro(self):
        """mon0: Grok only. mon1: ghostty | tab(YT,Gmail,Voice)."""
        return {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "layout": "HSPLIT",
                    "lastTabFocusId": 101,
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 101,
                            "wmClass": "Google-chrome",
                            "title": "Grok",
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
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "children": [
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
                                    "title": "Google Voice",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        },
                    ],
                },
            ],
        }

    def test_plan1_open_mon0_term_reuse_mon1_focus_grok(self):
        plan = plan_reconcile(self._forest_repro(), self.PROFILE)
        by_id = {r["id"]: r for r in plan["roles"]}
        self.assertEqual(by_id["ghostty"]["status"], "open")
        self.assertEqual(by_id["ghostty-2"]["status"], "reused")
        self.assertEqual(by_id["ghostty-2"]["windowId"], 201)
        self.assertEqual(by_id["google-chrome"]["status"], "open")
        self.assertEqual(by_id["Grok"]["status"], "reused")
        # Peer mon ensure must not thrash mon1 when only mon0 places.
        mon1_ensures = [
            a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout" and a.get("slot") == "mon1"
        ]
        self.assertEqual(mon1_ensures, [])
        focus = [a for a in plan["actions"] if a.get("op") == "focus"]
        self.assertTrue(
            any(
                a.get("role") == "Grok" and a.get("reason") == "survivor"
                for a in focus
            ),
            focus,
        )
        self.assertTrue(
            any(a.get("op") == "open" and a.get("role") == "ghostty" for a in plan["actions"])
        )

    def test_residual_pin_chrome_title_mismatch_move_ghostty_focus_grok(self):
        """After open: chrome title misses match; ghostty on wrong mon; pins fix."""
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
                            "lastTabFocusId": 301,
                            "children": [
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 301,
                                    "wmClass": "Google-chrome",
                                    "title": "New Tab",
                                    "monitor": 0,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 101,
                                    "wmClass": "Google-chrome",
                                    "title": "Grok",
                                    "monitor": 0,
                                    "children": [],
                                },
                            ],
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
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "children": [
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
                                    "title": "Google Voice",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 401,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 1,
                            "children": [],
                        },
                    ],
                },
            ],
        }
        plan = plan_reconcile(
            forest,
            self.PROFILE,
            role_pins={"google-chrome": 301, "ghostty": 401},
            just_opened_roles={"google-chrome", "ghostty"},
        )
        by_id = {r["id"]: r for r in plan["roles"]}
        self.assertEqual(by_id["google-chrome"]["status"], "reused")
        self.assertEqual(by_id["google-chrome"]["windowId"], 301)
        self.assertEqual(by_id["ghostty"]["status"], "move")
        self.assertEqual(by_id["ghostty"]["windowId"], 401)
        self.assertEqual(by_id["ghostty-2"]["windowId"], 201)
        self.assertEqual(by_id["Grok"]["status"], "reused")
        opens = [a for a in plan["actions"] if a.get("op") == "open"]
        self.assertEqual(opens, [])
        moves = [
            a
            for a in plan["actions"]
            if a.get("op") == "move" and a.get("windowId") == 401
        ]
        self.assertEqual(len(moves), 1)
        self.assertEqual(moves[0].get("slot"), "mon0.ghostty")
        focus = [a for a in plan["actions"] if a.get("op") == "focus"]
        self.assertTrue(
            any(
                a.get("role") == "Grok"
                and a.get("reason") == "survivor"
                and a.get("selector") == "id:101"
                for a in focus
            ),
            focus,
        )
        # mon1 already correct — no mon1 ensure thrash
        self.assertFalse(
            any(
                a.get("op") == "ensure_layout" and a.get("slot") == "mon1"
                for a in plan["actions"]
            ),
            plan["actions"],
        )


class TestPartialReopenLF3(unittest.TestCase):
    """
    LF3: close mon0 chrome + mon1 Ghostty; mon0 Ghostty stays.
    Plan1: mon0 ghostty reused, mon1 ghostty-2 open (no mon0 steal).
    Residual: both Ghosttys on mon0 → move mon1 role to mon1.
    """

    PROFILE = [
        [["google-chrome", "Grok"], "ghostty"],
        ["ghostty", ["YouTube", "Gmail", "Google Voice"]],
    ]

    def _forest_chrome_and_mon1_term_closed(self):
        """mon0: Grok | ghostty. mon1: tabs only."""
        return {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "layout": "HSPLIT",
                    "lastTabFocusId": 101,
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 101,
                            "wmClass": "Google-chrome",
                            "title": "Grok",
                            "monitor": 0,
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 102,
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
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "children": [
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
                                    "title": "Google Voice",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        },
                    ],
                },
            ],
        }

    def test_plan1_reuse_mon0_ghostty_open_mon1(self):
        plan = plan_reconcile(self._forest_chrome_and_mon1_term_closed(), self.PROFILE)
        by_id = {r["id"]: r for r in plan["roles"]}
        self.assertEqual(by_id["ghostty"]["status"], "reused")
        self.assertEqual(by_id["ghostty"]["windowId"], 102)
        self.assertEqual(by_id["ghostty-2"]["status"], "open")
        self.assertEqual(by_id["google-chrome"]["status"], "open")
        self.assertEqual(by_id["Grok"]["status"], "reused")
        # mon0 term must not be stolen for mon1
        self.assertNotEqual(by_id["ghostty-2"].get("windowId"), 102)
        opens = [a for a in plan["actions"] if a.get("op") == "open"]
        open_roles = {a.get("role") for a in opens}
        self.assertIn("ghostty-2", open_roles)
        self.assertIn("google-chrome", open_roles)
        self.assertNotIn("ghostty", open_roles)

    def test_profile_ghostty_open_gets_wmclass_from_match(self):
        p = validate_reconcile_profile(self.PROFILE)
        by_id = {r["id"]: r for r in p["roles"]}
        self.assertEqual(by_id["ghostty"]["match"]["class"], "ghostty")
        self.assertEqual(by_id["ghostty"]["open"].get("wmClass"), "ghostty")
        self.assertEqual(by_id["ghostty-2"]["open"].get("wmClass"), "ghostty")

    def test_residual_two_ghosttys_on_mon0_move_mon1(self):
        """New mon1 Ghostty landed mon0; residual moves ghostty-2 to mon1."""
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
                            "lastTabFocusId": 101,
                            "children": [
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 301,
                                    "wmClass": "Google-chrome",
                                    "title": "New Tab",
                                    "monitor": 0,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 101,
                                    "wmClass": "Google-chrome",
                                    "title": "Grok",
                                    "monitor": 0,
                                    "children": [],
                                },
                            ],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 102,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 0,
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 501,
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
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "children": [
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
                                    "title": "Google Voice",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        plan = plan_reconcile(
            forest,
            self.PROFILE,
            role_pins={"google-chrome": 301, "ghostty-2": 501},
            just_opened_roles={"google-chrome", "ghostty-2"},
        )
        by_id = {r["id"]: r for r in plan["roles"]}
        self.assertEqual(by_id["ghostty"]["status"], "reused")
        self.assertEqual(by_id["ghostty"]["windowId"], 102)
        self.assertEqual(by_id["ghostty-2"]["status"], "move")
        self.assertEqual(by_id["ghostty-2"]["windowId"], 501)
        self.assertEqual(by_id["google-chrome"]["status"], "reused")
        self.assertEqual(by_id["google-chrome"]["windowId"], 301)
        moves = [
            a
            for a in plan["actions"]
            if a.get("op") == "move" and a.get("windowId") == 501
        ]
        self.assertEqual(len(moves), 1)
        self.assertEqual(moves[0].get("slot"), "mon1.ghostty-2")
        self.assertEqual(
            [a for a in plan["actions"] if a.get("op") == "open"],
            [],
        )

    def test_residual_without_chrome_pin_still_plans_ghostty_move(self):
        """Chrome title lag → open; ghostty-2 still planned as move (apply must run)."""
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
                            "title": "Grok",
                            "monitor": 0,
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 102,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 0,
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 501,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 0,
                            "children": [],
                        },
                        {
                            # Unmatched new chrome (title not Google Chrome / pin miss)
                            "nodeType": "WINDOW",
                            "windowId": 301,
                            "wmClass": "Google-chrome",
                            "title": "New Tab",
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
                                    "title": "Google Voice",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        # Pin only ghostty-2 (chrome pin missing / title lag)
        plan = plan_reconcile(
            forest,
            self.PROFILE,
            role_pins={"ghostty-2": 501},
            just_opened_roles={"ghostty-2"},
        )
        by_id = {r["id"]: r for r in plan["roles"]}
        self.assertEqual(by_id["ghostty"]["windowId"], 102)
        self.assertEqual(by_id["ghostty-2"]["status"], "move")
        self.assertEqual(by_id["ghostty-2"]["windowId"], 501)
        from layout_apply import partition_plan_actions, residual_follow_up

        residual_ext, residual_open = partition_plan_actions(plan["actions"])
        steps, still = residual_follow_up(residual_ext, residual_open)
        move_tiles = [s["tile"] for s in steps if s.get("op") == "move"]
        self.assertIn("id:501", move_tiles)
        # chrome may still be open — must not suppress moves
        if by_id["google-chrome"]["status"] == "open":
            self.assertIn("google-chrome", still)


class TestTabRoleOrder(unittest.TestCase):
    """In-group tab order (profile roles[] order) when already co-tabbed."""

    def test_reversed_tabs_emit_ensure_order(self):
        # mon1.comms desired youtube→gmail→voice; live is voice→gmail→youtube
        forest = _load("tree-perfect.json")
        mon1 = forest["monitors"][1]
        tab = mon1["children"][1]
        self.assertEqual(tab.get("layout"), "TABBED")
        # Reverse tab children: voice, gmail, youtube (ids 204, 203, 202)
        kids = list(tab["children"])
        tab["children"] = list(reversed(kids))
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertFalse(plan["nothingToDo"])
        orders = [
            a
            for a in plan["actions"]
            if a.get("op") == "ensure_order" and a.get("slot") == "mon1.comms"
        ]
        self.assertEqual(len(orders), 1)
        # Desired: youtube, gmail, voice
        self.assertEqual(orders[0]["windowIds"], [202, 203, 204])
        self.assertEqual(plan["counts"].get("structure", 0), 0)

    def test_class_stem_matches_reverse_dns(self):
        from layout_plan import window_matches

        w = {"wmClass": "com.mitchellh.ghostty", "title": "Ghostty"}
        self.assertTrue(window_matches(w, {"class": "ghostty"}))
        self.assertTrue(window_matches(w, {"class": "com.mitchellh.ghostty"}))


class TestThrashModeMatrix(unittest.TestCase):
    """TZ-matrix: lock table for Mode A/B thrash plans (regression).

    One fixture row per thrash class — asserts thrashState + counts + key
    action shapes. Detailed Mode A/B behavior stays in sibling classes.
    """

    def _plan(self, forest_name: str):
        return plan_reconcile(_load(forest_name), _load("profile-dev-v2.json"))

    def test_perfect_dual_mon_nothing_to_do(self):
        """perfect dual-mon → nothingToDo / not thrashed."""
        plan = self._plan("tree-perfect.json")
        self.assertTrue(plan["ok"])
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["thrashState"]["score"], 0)
        self.assertTrue(plan["nothingToDo"])
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["moved"], 0)
        self.assertEqual(plan["counts"]["structure"], 0)
        self.assertEqual(plan["actions"], [])
        self.assertEqual(plan["counts"]["reused"], 7)

    def test_nested_term_hsplit_mode_a_collect(self):
        """Companion under term nested HSPLIT → Mode A tab, not Mode B park."""
        plan = self._plan("tree-thrash-mon1-nested-hsplit.json")
        self.assertTrue(plan["ok"])
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertFalse(plan["nothingToDo"])
        self.assertEqual(plan["counts"]["reused"], 7)
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertEqual(plan["counts"]["moved"], 0)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["kept"], 2)
        keep_ids = {k["windowId"] for k in plan["kept"]}
        self.assertEqual(keep_ids, {301, 302})
        for k in plan["kept"]:
            self.assertEqual(k["slot"], "mon1.term")
        ensures = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
        }
        self.assertIn("mon1.term", ensures)
        self.assertEqual(ensures["mon1.term"]["mode"], "tabbed")
        self.assertEqual(ensures["mon1.term"]["windowIds"], [201, 301, 302])
        self.assertFalse(any(a.get("op") == "park" for a in plan["actions"]))

    def test_mode_b_wrong_mon_companions_park(self):
        """True thrash (≥2 wrong mon) + companions → Mode B park FB/Chess."""
        plan = self._plan("tree-thrash-mode-b-companions.json")
        self.assertTrue(plan["ok"])
        self.assertTrue(plan["thrashState"]["thrashed"])
        self.assertGreaterEqual(plan["thrashState"]["score"], 3)
        self.assertFalse(plan["nothingToDo"])
        self.assertEqual(plan["counts"]["parked"], 2)
        self.assertEqual(plan["counts"]["kept"], 0)
        parks = [a for a in plan["actions"] if a.get("op") == "park"]
        self.assertEqual({p["windowId"] for p in parks}, {301, 302})
        for p in parks:
            self.assertIsNotNone(p.get("destWindowId"))

    def test_voice_mon_direct_structure_comms_only(self):
        """voice mon-direct out of tab → structure mon1.comms only; no term thrash."""
        plan = self._plan("tree-voice-mon-direct.json")
        self.assertTrue(plan["ok"])
        # Grouping signal may mark Mode B; either mode is fine if scope stays comms
        self.assertFalse(plan["nothingToDo"])
        self.assertEqual(plan["counts"]["reused"], 7)
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertEqual(plan["counts"]["moved"], 0)
        self.assertEqual(plan["counts"]["parked"], 0)
        ensures = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
        }
        self.assertIn("mon1.comms", ensures)
        self.assertEqual(ensures["mon1.comms"]["mode"], "tabbed")
        self.assertEqual(ensures["mon1.comms"]["windowIds"], [202, 203, 204])
        # No nested-term / mon-level rewrite; no park of non-roles (none present)
        self.assertNotIn("mon1.term", ensures)
        self.assertNotIn("mon0", ensures)
        self.assertNotIn("mon1", ensures)
        self.assertFalse(any(a.get("op") == "park" for a in plan["actions"]))
        # Structure work is only the comms rejoin (count may be 1)
        self.assertGreaterEqual(plan["counts"]["structure"], 1)
        self.assertEqual(
            {a["slot"] for a in plan["actions"] if a.get("op") == "ensure_layout"},
            {"mon1.comms"},
        )

    def test_mon_direct_companions_mode_a_structure_tab(self):
        """mon-direct companions on sane mon → Mode A collect into term tab."""
        plan = self._plan("tree-mon1-companions-direct.json")
        self.assertTrue(plan["ok"])
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertFalse(plan["nothingToDo"])
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["kept"], 2)
        self.assertEqual(plan["counts"]["left"], 0)
        keep_ids = {k["windowId"] for k in plan["kept"]}
        self.assertEqual(keep_ids, {301, 302})
        for k in plan["kept"]:
            self.assertEqual(k["slot"], "mon1.term")
        ensures = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
        }
        self.assertIn("mon1.term", ensures)
        self.assertEqual(ensures["mon1.term"]["mode"], "tabbed")
        self.assertEqual(ensures["mon1.term"]["windowIds"], [201, 301, 302])
        self.assertNotIn("mon0", ensures)
        self.assertNotIn("mon1", ensures)
        self.assertFalse(any(a.get("op") == "park" for a in plan["actions"]))

    def test_wrong_mon_roles_moves_not_dual_park(self):
        """wrong-mon roles → moves + structure; not dual-mon park thrash."""
        plan = self._plan("tree-wrong-mon-roles.json")
        self.assertTrue(plan["ok"])
        self.assertTrue(plan["thrashState"]["thrashed"])  # roles-wrong-mon signal
        self.assertFalse(plan["nothingToDo"])
        self.assertEqual(plan["counts"]["moved"], 2)
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(
            plan["counts"]["reused"] + plan["counts"]["moved"], 7
        )
        moves = [a for a in plan["actions"] if a.get("op") == "move"]
        move_ids = {m["windowId"] for m in moves}
        self.assertEqual(move_ids, {201, 202})
        by_id = {r["id"]: r for r in plan["roles"]}
        self.assertEqual(by_id["ghostty-right"]["status"], "move")
        self.assertEqual(by_id["youtube"]["status"], "move")
        self.assertEqual(by_id["ghostty-right"]["windowId"], 201)
        self.assertEqual(by_id["youtube"]["windowId"], 202)
        # No mass residual park (no FB/Chess style dual dump)
        self.assertFalse(any(a.get("op") == "park" for a in plan["actions"]))
        # Comms still tabbed after youtube returns
        ensures = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
        }
        self.assertIn("mon1.comms", ensures)
        self.assertEqual(ensures["mon1.comms"]["mode"], "tabbed")
        self.assertEqual(ensures["mon1.comms"]["windowIds"], [202, 203, 204])


class TestDetectThrash(unittest.TestCase):
    """TZ-detect: desk thrash vs sane (plan.thrashState)."""

    def test_detect_thrash_term_nested_companions_false(self):
        """Single-role term + nested companions is not thrash (Mode A)."""
        forest = _load("tree-thrash-mon1-nested-hsplit.json")
        profile = _load("profile-dev-v2.json")
        state = detect_thrash(forest, profile)
        self.assertFalse(state["thrashed"])
        self.assertEqual(state["score"], 0)
        self.assertFalse(
            any("nested-split" in r for r in state["reasons"]),
            f"single-role nested companions must not thrash: {state['reasons']}",
        )

    def test_detect_thrash_comms_nested_hsplit(self):
        """Multi-role tabbed view as nested HSPLIT → thrash."""
        forest = _load("tree-thrash-comms-nested-hsplit.json")
        profile = _load("profile-dev-v2.json")
        state = detect_thrash(forest, profile)
        self.assertTrue(state["thrashed"])
        self.assertGreaterEqual(state["score"], 3)
        blob = " ".join(state["reasons"]).lower()
        self.assertTrue(
            any(
                k in blob
                for k in (
                    "nested-split",
                    "tabbed-roles-not-grouped",
                    "mon1.comms",
                )
            ),
            f"reasons should mention comms structure: {state['reasons']}",
        )

    def test_detect_thrash_perfect_false(self):
        forest = _load("tree-perfect.json")
        profile = _load("profile-dev-v2.json")
        state = detect_thrash(forest, profile)
        self.assertFalse(state["thrashed"])
        self.assertEqual(state["score"], 0)
        self.assertEqual(state["reasons"], [])

    def _stacked_pair_profile(self):
        """Minimal multi-role stacked profile for mon0.stack (ghostty + nautilus)."""
        return {
            "version": 2,
            "mode": "reconcile",
            "layout": {
                "mon0": {
                    "split": "hsplit",
                    "children": [
                        {
                            "id": "stack",
                            "layout": "stacked",
                            "roles": ["ghostty", "nautilus"],
                        }
                    ],
                }
            },
            "roles": [
                {
                    "id": "ghostty",
                    "match": {"class": "com.mitchellh.ghostty"},
                    "open": {"app": "ghostty"},
                    "slot": "mon0.stack",
                },
                {
                    "id": "nautilus",
                    "match": {"class": "org.gnome.Nautilus"},
                    "open": {"app": "nautilus"},
                    "slot": "mon0.stack",
                },
            ],
        }

    def test_detect_thrash_stacked_roles_not_grouped(self):
        """Multi-role stacked slot with flat mon children → stacked-roles-not-grouped."""
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
                            "windowId": 601,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 0,
                            "mode": "TILE",
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 602,
                            "wmClass": "org.gnome.Nautilus",
                            "title": "Home",
                            "monitor": 0,
                            "mode": "TILE",
                            "children": [],
                        },
                    ],
                }
            ],
        }
        state = detect_thrash(forest, self._stacked_pair_profile())
        self.assertTrue(state["thrashed"])
        self.assertGreaterEqual(state["score"], 3)
        self.assertTrue(
            any(r == "stacked-roles-not-grouped:mon0.stack" for r in state["reasons"]),
            f"expected stacked-roles-not-grouped:mon0.stack in {state['reasons']}",
        )

    def test_detect_thrash_stacked_roles_grouped_ok(self):
        """Already co-grouped under STACKED → no stacked-roles-not-grouped thrash."""
        forest = _load("tree-stacked-pair.json")
        state = detect_thrash(forest, self._stacked_pair_profile())
        self.assertFalse(
            any("stacked-roles-not-grouped" in r for r in state["reasons"]),
            f"co-grouped STACKED must not thrash: {state['reasons']}",
        )
        self.assertFalse(state["thrashed"])
        self.assertEqual(state["score"], 0)

    def test_detect_thrash_stacked_comms_nested_hsplit(self):
        """Multi-role stacked view as nested HSPLIT → thrash (parity with tabbed)."""
        forest = _load("tree-thrash-comms-nested-hsplit.json")
        profile = _load("profile-dev-v2.json")
        # Flip comms to stacked; same broken forest should still thrash.
        for ch in profile["layout"]["mon1"]["children"]:
            if ch.get("id") == "comms":
                ch["layout"] = "stacked"
                break
        state = detect_thrash(forest, profile)
        self.assertTrue(state["thrashed"])
        self.assertGreaterEqual(state["score"], 3)
        blob = " ".join(state["reasons"]).lower()
        self.assertTrue(
            any(
                k in blob
                for k in (
                    "nested-split",
                    "stacked-roles-not-grouped",
                    "mon1.comms",
                )
            ),
            f"reasons should mention stacked/comms structure: {state['reasons']}",
        )
        self.assertFalse(
            any("tabbed-roles-not-grouped:mon1.comms" in r for r in state["reasons"]),
            f"stacked slot must not use tabbed reason: {state['reasons']}",
        )

    def test_plan_stacked_on_tabbed_emits_ensure_stacked(self):
        """Stacked multi-role profile + TABBED forest → ensure_layout mode stacked."""
        forest = _load("tree-ghostty-nautilus-tab.json")
        plan = plan_reconcile(forest, self._stacked_pair_profile())
        self.assertTrue(plan["ok"])
        self.assertFalse(plan["nothingToDo"])
        ensures = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
        }
        self.assertIn("mon0.stack", ensures)
        self.assertEqual(ensures["mon0.stack"]["mode"], "stacked")
        self.assertEqual(ensures["mon0.stack"]["windowIds"], [501, 502])
        self.assertEqual(plan["counts"]["structure"], 1)
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertTrue(plan["thrashState"]["thrashed"])
        self.assertIn(
            "stacked-roles-not-grouped:mon0.stack",
            plan["thrashState"]["reasons"],
        )

    def test_plan_stacked_on_flat_emits_ensure_stacked(self):
        """Stacked multi-role profile + flat mon siblings → ensure_layout stacked."""
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
                            "windowId": 601,
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "Ghostty",
                            "monitor": 0,
                            "mode": "TILE",
                            "children": [],
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 602,
                            "wmClass": "org.gnome.Nautilus",
                            "title": "Home",
                            "monitor": 0,
                            "mode": "TILE",
                            "children": [],
                        },
                    ],
                }
            ],
        }
        plan = plan_reconcile(forest, self._stacked_pair_profile())
        self.assertTrue(plan["ok"])
        ensures = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
        }
        self.assertIn("mon0.stack", ensures)
        self.assertEqual(ensures["mon0.stack"]["mode"], "stacked")
        self.assertEqual(ensures["mon0.stack"]["windowIds"], [601, 602])
        self.assertGreaterEqual(plan["counts"]["structure"], 1)

    def test_plan_stacked_pair_nothing_to_do(self):
        """Already STACKED forest + stacked profile → no structure thrash."""
        forest = _load("tree-stacked-pair.json")
        plan = plan_reconcile(forest, self._stacked_pair_profile())
        self.assertTrue(plan["ok"])
        self.assertTrue(plan["nothingToDo"], plan)
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["thrashState"]["score"], 0)
        self.assertEqual(plan["counts"]["structure"], 0)
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertEqual(plan["actions"], [])
        self.assertFalse(
            any(a.get("op") == "ensure_layout" for a in plan["actions"]),
        )

    def test_plan_reconcile_thrash_state_on_thrash_fixture(self):
        forest = _load("tree-thrash-mode-b-companions.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertIn("thrashState", plan)
        self.assertTrue(plan["thrashState"]["thrashed"])
        self.assertGreaterEqual(plan["thrashState"]["score"], 3)

    def test_plan_reconcile_thrash_state_on_perfect(self):
        forest = _load("tree-perfect.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertIn("thrashState", plan)
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["thrashState"]["score"], 0)


class TestModeBThrashRecover(unittest.TestCase):
    """TZ-recover: Mode B parks non-roles when thrashState.thrashed."""

    def test_thrash_fixture_parks_fb_chess_roles_reused(self):
        forest = _load("tree-thrash-mode-b-companions.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["ok"])
        self.assertTrue(plan["thrashState"]["thrashed"])
        self.assertFalse(plan["nothingToDo"])
        # Wrong mon roles move; rest reuse; FB 301 + Chess 302 soft-park
        self.assertEqual(plan["counts"]["reused"] + plan["counts"]["moved"], 7)
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertEqual(plan["counts"]["moved"], 2)
        self.assertEqual(plan["counts"]["parked"], 2)
        self.assertEqual(plan["counts"]["kept"], 0)
        self.assertEqual(plan["counts"]["left"], 0)
        by_id = {r["id"]: r for r in plan["roles"]}
        self.assertEqual(by_id["gmail"]["status"], "reused")
        self.assertEqual(by_id["voice"]["status"], "reused")
        self.assertEqual(by_id["ghostty-right"]["status"], "move")
        self.assertEqual(by_id["youtube"]["status"], "move")
        parks = [a for a in plan["actions"] if a.get("op") == "park"]
        self.assertEqual(len(parks), 2)
        park_ids = {p["windowId"] for p in parks}
        self.assertEqual(park_ids, {301, 302})
        for p in parks:
            self.assertIsNotNone(p.get("destWindowId"), f"soft park needs dest: {p}")
            # Dump: last mon last claimed role (voice 204 on mon1.comms)
            self.assertEqual(p["destWindowId"], 204)
        self.assertFalse(any(u.get("status") == "kept" for u in plan["unclaimed"]))

    def test_perfect_still_nothing_to_do_no_mass_park(self):
        forest = _load("tree-perfect.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["nothingToDo"])
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["moved"], 0)
        self.assertEqual(plan["counts"]["structure"], 0)
        self.assertEqual(plan["actions"], [])
        self.assertEqual(plan["thrashRisk"]["score"], 0)

    def test_companions_direct_not_thrashed_still_keep(self):
        """Mode A: mon-direct companions kept (not mass-parked) when not thrashed."""
        forest = _load("tree-mon1-companions-direct.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["kept"], 2)
        keep_ids = {k["windowId"] for k in plan["kept"]}
        self.assertEqual(keep_ids, {301, 302})
        self.assertFalse(any(a.get("op") == "park" for a in plan["actions"]))


class TestSafeMode(unittest.TestCase):
    """TZ-gate: --safe open+move only (no park/structure/ensure)."""

    def test_safe_on_thrash_skips_park_and_ensure(self):
        forest = _load("tree-thrash-mode-b-companions.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile, safe=True)
        self.assertTrue(plan["ok"])
        self.assertTrue(plan["safe"])
        # Detection still reports Mode B
        self.assertTrue(plan["thrashState"]["thrashed"])
        self.assertGreaterEqual(plan["thrashState"]["score"], 3)
        # No residual mutations; role moves still allowed
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["kept"], 0)
        self.assertEqual(plan["counts"]["structure"], 0)
        self.assertEqual(plan["counts"]["closed"], 0)
        self.assertEqual(plan["counts"]["left"], 2)
        self.assertEqual(plan["counts"]["moved"], 2)
        ops = {a.get("op") for a in plan["actions"]}
        self.assertNotIn("park", ops)
        self.assertNotIn("ensure_layout", ops)
        self.assertNotIn("close", ops)
        self.assertIn("move", ops)
        # Roles still claimed
        self.assertEqual(plan["counts"]["reused"] + plan["counts"]["moved"], 7)

    def test_safe_on_mode_a_skips_collect_structure(self):
        forest = _load("tree-mon1-companions-direct.json")
        profile = _load("profile-dev-v2.json")
        full = plan_reconcile(forest, profile)
        self.assertFalse(full["thrashState"]["thrashed"])
        self.assertEqual(full["counts"]["kept"], 2)
        self.assertGreater(full["counts"]["structure"], 0)

        plan = plan_reconcile(forest, profile, safe=True)
        self.assertTrue(plan["safe"])
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["counts"]["kept"], 0)
        self.assertEqual(plan["counts"]["structure"], 0)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["left"], 2)
        self.assertEqual(plan["actions"], [])
        self.assertTrue(plan["nothingToDo"])

    def test_safe_still_moves_wrong_mon_roles(self):
        forest = _load("tree-stray-wrong-mon.json")
        # ghostty role on mon0; stray windows left. Use a role that needs move.
        # Prefer thrash fixture roles with wrong mon if available; else construct.
        profile = {
            "version": 2,
            "mode": "reconcile",
            "overflow": {"slot": "mon0.overflow", "layout": "tabbed"},
            "marginal": {"mode": "coexist", "roleOrder": "first", "residual": "leave"},
            "layout": {
                "mon0": {"children": [{"id": "term", "roles": ["ghostty"]}]},
            },
            "roles": [
                {
                    "id": "ghostty",
                    "match": {"class": "com.mitchellh.ghostty"},
                    "open": {"app": "ghostty"},
                    "slot": "mon0.term",
                }
            ],
        }
        # Baseline: ghostty reused; strays left
        plan0 = plan_reconcile(forest, profile, safe=True)
        self.assertTrue(plan0["safe"])
        self.assertEqual(plan0["counts"]["reused"], 1)
        self.assertEqual(plan0["counts"]["moved"], 0)
        self.assertEqual(plan0["counts"]["left"], 2)
        self.assertFalse(any(a.get("op") == "close" for a in plan0["actions"]))
        # clean ignored under safe
        plan_clean = plan_reconcile(forest, profile, safe=True, clean=True)
        self.assertEqual(plan_clean["counts"]["closed"], 0)
        self.assertEqual(plan_clean["counts"]["left"], 2)

    def test_safe_clean_does_not_close(self):
        forest = _load("tree-thrash-mode-b-companions.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile, safe=True, clean=True)
        self.assertTrue(plan["safe"])
        self.assertTrue(plan["clean"])
        self.assertEqual(plan["counts"]["closed"], 0)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertFalse(any(a.get("op") in ("close", "park", "ensure_layout") for a in plan["actions"]))


class TestModeACollect(unittest.TestCase):
    """TZ-collect: Mode A tabs marginals into overlapping view areas."""

    def test_companions_direct_collect_term_tab_no_park(self):
        forest = _load("tree-mon1-companions-direct.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["left"], 0)
        self.assertEqual(plan["counts"]["kept"], 2)
        keep_ids = {k["windowId"] for k in plan["kept"]}
        self.assertEqual(keep_ids, {301, 302})
        for k in plan["kept"]:
            self.assertEqual(k["slot"], "mon1.term")
        ensures = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
        }
        self.assertNotIn("mon0", ensures)
        self.assertNotIn("mon1", ensures)
        self.assertIn("mon1.term", ensures)
        self.assertEqual(ensures["mon1.term"]["mode"], "tabbed")
        self.assertEqual(ensures["mon1.term"]["windowIds"], [201, 301, 302])
        self.assertFalse(any(a.get("op") == "park" for a in plan["actions"]))

    def test_chrome_half_collect_to_comms(self):
        """Marginal rect only on chrome half → mon1.comms (not mon-span term)."""
        forest = _load("tree-mon1-marginal-chrome-half.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["kept"], 1)
        self.assertEqual(plan["kept"][0]["windowId"], 301)
        self.assertEqual(plan["kept"][0]["slot"], "mon1.comms")
        ensures = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
        }
        self.assertNotIn("mon0", ensures)
        self.assertNotIn("mon1", ensures)
        self.assertIn("mon1.comms", ensures)
        self.assertEqual(ensures["mon1.comms"]["mode"], "tabbed")
        self.assertEqual(
            ensures["mon1.comms"]["windowIds"], [202, 203, 204, 301]
        )
        self.assertFalse(any(a.get("op") == "park" for a in plan["actions"]))

    def test_partial_straddle_first_view(self):
        """Rect straddling term|comms → first profile view mon1.term."""
        forest = _load("tree-mon1-marginal-straddle.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["kept"], 1)
        self.assertEqual(plan["kept"][0]["windowId"], 301)
        self.assertEqual(plan["kept"][0]["slot"], "mon1.term")
        ensures = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
        }
        self.assertIn("mon1.term", ensures)
        self.assertEqual(ensures["mon1.term"]["mode"], "tabbed")
        self.assertEqual(ensures["mon1.term"]["windowIds"], [201, 301])

    def test_already_tabbed_collect_nothing_to_do(self):
        """Second plan after collect: forest already tabbed → nothingToDo."""
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
                            "nodeType": "CON",
                            "layout": "TABBED",
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
                                    "windowId": 301,
                                    "wmClass": "Google-chrome",
                                    "title": "Facebook",
                                    "monitor": 1,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 302,
                                    "wmClass": "Google-chrome",
                                    "title": "Chess.com",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        },
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "children": [
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
                                    "title": "Gmail - Inbox - Gmail",
                                    "monitor": 1,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 204,
                                    "wmClass": "Google-chrome",
                                    "title": "Google Voice - Messages",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        plan = plan_reconcile(forest, _load("profile-dev-v2.json"))
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["counts"]["structure"], 0)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertTrue(plan["nothingToDo"])
        self.assertEqual(plan["actions"], [])

    def test_thrash_still_mode_b_parks(self):
        forest = _load("tree-thrash-mode-b-companions.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["counts"]["parked"], 2)
        self.assertEqual(plan["counts"]["kept"], 0)
        park_ids = {
            a["windowId"] for a in plan["actions"] if a.get("op") == "park"
        }
        self.assertEqual(park_ids, {301, 302})

    def test_perfect_still_nothing_to_do(self):
        forest = _load("tree-perfect.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertTrue(plan["nothingToDo"])
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["actions"], [])


class TestModeANestedCompanions(unittest.TestCase):
    """TZ-mode-a-nested: companions under role VSPLIT/HSPLIT → Mode A collect."""

    def test_flat_pre_nested_companions_mode_a(self):
        forest = _load("tree-live-pre-nested-companions.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["kept"], 3)
        by_slot = {}
        for k in plan["kept"]:
            by_slot.setdefault(k["slot"], set()).add(k["windowId"])
        self.assertEqual(by_slot.get("mon0.term"), {901})
        self.assertEqual(by_slot.get("mon1.term"), {301, 302})
        ensures = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
        }
        self.assertEqual(ensures["mon0.term"]["mode"], "tabbed")
        self.assertEqual(ensures["mon0.term"]["windowIds"], [103, 901])
        self.assertEqual(ensures["mon1.term"]["mode"], "tabbed")
        self.assertEqual(ensures["mon1.term"]["windowIds"], [201, 301, 302])

    def test_nested_con_companions_mode_a(self):
        forest = _load("tree-live-pre-nested-con-companions.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["kept"], 3)
        keep_ids = {k["windowId"] for k in plan["kept"]}
        self.assertEqual(keep_ids, {901, 301, 302})
        for k in plan["kept"]:
            if k["windowId"] == 901:
                self.assertEqual(k["slot"], "mon0.term")
            else:
                self.assertEqual(k["slot"], "mon1.term")
        ensures = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
        }
        self.assertEqual(ensures["mon0.term"]["windowIds"], [103, 901])
        self.assertEqual(ensures["mon1.term"]["windowIds"], [201, 301, 302])
        self.assertFalse(any(a.get("op") == "park" for a in plan["actions"]))

    def test_sugar_tiles_nested_con_mode_a(self):
        """Black-style tiles sugar: mon0.ghostty-left / mon1.ghostty-right slots."""
        forest = _load("tree-live-pre-nested-con-companions.json")
        sugar = {
            "tiles": {
                "mon0": [
                    [
                        {
                            "id": "chrome-luke",
                            "match": {
                                "class": "Google-chrome",
                                "title~=": "Google Chrome",
                            },
                            "open": {"app": "google-chrome"},
                        },
                        {
                            "id": "grok",
                            "match": {"class": "Google-chrome", "title~=": "Grok"},
                            "open": {"app": "Grok"},
                        },
                    ],
                    {
                        "id": "ghostty-left",
                        "match": {"class": "com.mitchellh.ghostty"},
                        "open": {"app": "ghostty"},
                    },
                ],
                "mon1": [
                    {
                        "id": "ghostty-right",
                        "match": {"class": "com.mitchellh.ghostty"},
                        "open": {"app": "ghostty"},
                    },
                    [
                        {
                            "id": "youtube",
                            "match": {
                                "class": "Google-chrome",
                                "title~=": "YouTube",
                            },
                            "open": {"app": "YouTube"},
                        },
                        {
                            "id": "gmail",
                            "match": {"class": "Google-chrome", "title~=": "Gmail"},
                            "open": {"app": "Gmail"},
                        },
                        {
                            "id": "voice",
                            "match": {"class": "Google-chrome", "title~=": "Voice"},
                            "open": {"app": "Google Voice"},
                        },
                    ],
                ],
            }
        }
        plan = plan_reconcile(forest, sugar)
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["kept"], 3)
        by_slot = {}
        for k in plan["kept"]:
            by_slot.setdefault(k["slot"], set()).add(k["windowId"])
        self.assertEqual(by_slot.get("mon0.ghostty-left"), {901})
        self.assertEqual(by_slot.get("mon1.ghostty-right"), {301, 302})
        ensures = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
        }
        self.assertEqual(ensures["mon0.ghostty-left"]["windowIds"], [103, 901])
        self.assertEqual(
            ensures["mon1.ghostty-right"]["windowIds"], [201, 301, 302]
        )

    def test_true_thrash_still_mode_b(self):
        forest = _load("tree-thrash-mode-b-companions.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["counts"]["parked"], 2)
        self.assertEqual(plan["counts"]["kept"], 0)

    def test_post_tab_nothing_to_do(self):
        """Already tabbed role+companions → second plan nothingToDo."""
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
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "children": [
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 103,
                                    "wmClass": "com.mitchellh.ghostty",
                                    "title": "Ghostty",
                                    "monitor": 0,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 901,
                                    "wmClass": "org.gnome.Nautilus",
                                    "title": "Home",
                                    "monitor": 0,
                                    "children": [],
                                },
                            ],
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
                                    "wmClass": "com.mitchellh.ghostty",
                                    "title": "Ghostty",
                                    "monitor": 1,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 301,
                                    "wmClass": "Google-chrome",
                                    "title": "Facebook",
                                    "monitor": 1,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 302,
                                    "wmClass": "Google-chrome",
                                    "title": "Chess.com",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        },
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "children": [
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
                                    "title": "Gmail - Inbox - Gmail",
                                    "monitor": 1,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 204,
                                    "wmClass": "Google-chrome",
                                    "title": "Google Voice - Messages",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        plan = plan_reconcile(forest, _load("profile-dev-v2.json"))
        self.assertFalse(plan["thrashState"]["thrashed"])
        self.assertEqual(plan["counts"]["structure"], 0)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertTrue(plan["nothingToDo"])
        self.assertEqual(plan["actions"], [])


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
        # Only mons with role open/move get mon ensure (avoid peer thrash / LFT steal).
        self.assertNotIn("mon0", by_slot)
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
        # coexist: tab-CON extras kept; bare residuals left in place (TZ1)
        self.assertGreater(
            plan["counts"]["parked"]
            + plan["counts"]["kept"]
            + plan["counts"].get("left", 0),
            0,
        )
        parks = [a for a in plan["actions"] if a["op"] == "park"]
        self.assertEqual(len(parks), plan["counts"]["parked"])
        for k in plan["kept"]:
            self.assertEqual(k["status"], "kept")
            self.assertNotIn(k["windowId"], claimed_ids)
        wins = collect_windows(forest)
        self.assertEqual(
            len(wins),
            plan["counts"]["reused"]
            + plan["counts"]["moved"]
            + plan["counts"]["parked"]
            + plan["counts"]["kept"]
            + plan["counts"].get("left", 0),
        )

    def test_doubled_strict_leaves_extras_by_default(self):
        forest = _load("tree-doubled-black.json")
        profile = _load("profile-dev-v2.json")
        profile["marginal"] = {"mode": "strict", "residual": "leave"}
        plan = plan_reconcile(forest, profile)
        self.assertEqual(plan["counts"]["kept"], 0)
        # Fixture is thrashed (mon-children-excess) → Mode B parks even residual leave.
        self.assertTrue(plan["thrashState"]["thrashed"])
        self.assertGreater(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["left"], 0)
        self.assertTrue(any(a["op"] == "park" for a in plan["actions"]))

    def test_doubled_strict_park_soft_parks_extras(self):
        forest = _load("tree-doubled-black.json")
        profile = _load("profile-dev-v2.json")
        profile["marginal"] = {"mode": "strict", "residual": "park"}
        plan = plan_reconcile(forest, profile)
        self.assertEqual(plan["counts"]["kept"], 0)
        self.assertGreater(plan["counts"]["parked"], 0)
        parks = [a for a in plan["actions"] if a["op"] == "park"]
        self.assertEqual(len(parks), plan["counts"]["parked"])
        # Soft park targets a window id, not mon-root dump
        self.assertTrue(any(p.get("destWindowId") is not None for p in parks))

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
        # Empty forest: no window anchors → skip mon-level ensure (would demote tabs)
        self.assertNotIn("mon0", slots)
        self.assertNotIn("mon1", slots)
        self.assertIn("mon0.left-tab", slots)
        self.assertIn("mon1.comms", slots)


class TestMarginalCoexist(unittest.TestCase):
    """WR11: coexist keep companions; strict parks all unclaimed."""

    def _ghostty_profile(self, **marginal_extra):
        prof = {
            "version": 2,
            "mode": "reconcile",
            "overflow": {"slot": "mon0.overflow", "layout": "tabbed"},
            "layout": {
                "mon0": {
                    "split": "hsplit",
                    "children": [{"id": "term", "roles": ["ghostty"]}],
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
        }
        if marginal_extra:
            prof["marginal"] = marginal_extra
        return prof

    def test_validate_marginal_defaults(self):
        p = validate_reconcile_profile(_load("profile-dev-v2.json"))
        self.assertEqual(p["marginal"]["mode"], "coexist")
        self.assertEqual(p["marginal"]["roleOrder"], "first")
        self.assertEqual(p["marginal"]["residual"], "leave")

    def test_validate_marginal_strict(self):
        raw = _load("profile-dev-v2.json")
        raw["marginal"] = {"mode": "strict"}
        p = validate_reconcile_profile(raw)
        self.assertEqual(p["marginal"]["mode"], "strict")
        self.assertEqual(p["marginal"]["roleOrder"], "first")
        self.assertEqual(p["marginal"]["residual"], "leave")

    def test_reject_unknown_marginal_mode(self):
        raw = _load("profile-dev-v2.json")
        raw["marginal"] = {"mode": "yeet"}
        with self.assertRaisesRegex(ValueError, "marginal.mode"):
            validate_reconcile_profile(raw)

    def test_reject_unknown_residual(self):
        raw = _load("profile-dev-v2.json")
        raw["marginal"] = {"residual": "yeet"}
        with self.assertRaisesRegex(ValueError, "marginal.residual"):
            validate_reconcile_profile(raw)

    def test_nautilus_tabbed_with_ghostty_kept(self):
        forest = _load("tree-ghostty-nautilus-tab.json")
        plan = plan_reconcile(forest, self._ghostty_profile())
        self.assertEqual(plan["counts"]["reused"], 1)
        self.assertEqual(plan["counts"]["kept"], 1)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertTrue(plan["nothingToDo"])
        self.assertEqual(plan["actions"], [])
        self.assertEqual(len(plan["kept"]), 1)
        k = plan["kept"][0]
        self.assertEqual(k["windowId"], 502)
        self.assertEqual(k["status"], "kept")
        self.assertEqual(k["slot"], "mon0.term")
        self.assertEqual(k["wmClass"], "org.gnome.Nautilus")
        # roleOrder first: Ghostty before Nautilus in membership (already so)
        self.assertFalse(any(a["op"] == "park" for a in plan["actions"]))

    def test_nautilus_wrong_order_no_structure_thrash(self):
        """Already tabbed together → no order-only re-tab (TZ1 zero thrash)."""
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
                                    "windowId": 502,
                                    "wmClass": "org.gnome.Nautilus",
                                    "title": "Home",
                                    "monitor": 0,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 501,
                                    "wmClass": "com.mitchellh.ghostty",
                                    "title": "Ghostty",
                                    "monitor": 0,
                                    "children": [],
                                },
                            ],
                        }
                    ],
                }
            ],
        }
        plan = plan_reconcile(forest, self._ghostty_profile())
        self.assertEqual(plan["counts"]["kept"], 1)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["structure"], 0)
        self.assertTrue(plan["nothingToDo"])
        self.assertEqual(plan["actions"], [])
        self.assertEqual(plan["thrashRisk"]["score"], 0)

    def test_stray_wrong_mon_left_by_default(self):
        forest = _load("tree-stray-wrong-mon.json")
        plan = plan_reconcile(forest, self._ghostty_profile())
        self.assertEqual(plan["counts"]["reused"], 1)
        self.assertEqual(plan["counts"]["kept"], 0)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["left"], 2)
        self.assertFalse(any(a["op"] == "park" for a in plan["actions"]))
        left_ids = {x["windowId"] for x in plan["left"]}
        self.assertEqual(left_ids, {602, 603})

    def test_stray_wrong_mon_soft_park_when_requested(self):
        forest = _load("tree-stray-wrong-mon.json")
        prof = self._ghostty_profile()
        prof["marginal"] = {"mode": "coexist", "residual": "park"}
        plan = plan_reconcile(forest, prof)
        self.assertEqual(plan["counts"]["parked"], 2)
        self.assertEqual(plan["counts"]["left"], 0)
        parks = [a for a in plan["actions"] if a["op"] == "park"]
        self.assertEqual(len(parks), 2)
        # Soft park onto Ghostty (only claimed window)
        for p in parks:
            self.assertEqual(p.get("destWindowId"), 601)
        # No overflow ensure_layout
        self.assertFalse(
            any(
                a.get("op") == "ensure_layout" and "overflow" in str(a.get("slot", ""))
                for a in plan["actions"]
            )
        )
        # WR16: park-only must not rewrite mon splits
        mon_ensures = [
            a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout" and a.get("slot") in ("mon0", "mon1")
        ]
        self.assertEqual(mon_ensures, [])

    def test_extra_role_copy_mon_direct_kept_in_span(self):
        """WR16: mon-direct after role mon-child is span-kept (not park)."""
        forest = _load("tree-extra-role-copy.json")
        profile = {
            "version": 2,
            "layout": {
                "mon0": {
                    "split": "hsplit",
                    "children": [
                        {
                            "id": "left-tab",
                            "layout": "tabbed",
                            "roles": ["chrome-luke", "grok"],
                        }
                    ],
                }
            },
            "roles": [
                {
                    "id": "chrome-luke",
                    "match": {"class": "Google-chrome", "title": "Google Chrome"},
                    "open": {"app": "google-chrome"},
                    "slot": "mon0.left-tab",
                },
                {
                    "id": "grok",
                    "match": {"class": "Google-chrome", "title~=": "Grok"},
                    "open": {"app": "Grok"},
                    "slot": "mon0.left-tab",
                },
            ],
        }
        plan = plan_reconcile(forest, profile)
        self.assertEqual(plan["counts"]["reused"], 2)
        # 703 mon-direct after left-tab CON → mon-child span keep
        self.assertEqual(plan["counts"]["kept"], 1)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"].get("closed", 0), 0)
        self.assertEqual(plan["kept"][0]["windowId"], 703)
        self.assertEqual(plan["kept"][0]["slot"], "mon0.left-tab")
        self.assertFalse(any(a["op"] == "park" for a in plan["actions"]))

    def test_extra_in_slot_con_kept(self):
        """Extra matcher copy already in role's tab CON → companion keep."""
        forest = {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "children": [
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "children": [
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 801,
                                    "wmClass": "Google-chrome",
                                    "title": "Google Chrome",
                                    "monitor": 0,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 802,
                                    "wmClass": "Google-chrome",
                                    "title": "Grok",
                                    "monitor": 0,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 803,
                                    "wmClass": "Google-chrome",
                                    "title": "Grok",
                                    "monitor": 0,
                                    "children": [],
                                },
                            ],
                        }
                    ],
                }
            ],
        }
        profile = {
            "version": 2,
            "layout": {
                "mon0": {
                    "children": [
                        {
                            "id": "left-tab",
                            "layout": "tabbed",
                            "roles": ["chrome-luke", "grok"],
                        }
                    ]
                }
            },
            "roles": [
                {
                    "id": "chrome-luke",
                    "match": {"class": "Google-chrome", "title": "Google Chrome"},
                    "open": {"app": "google-chrome"},
                    "slot": "mon0.left-tab",
                },
                {
                    "id": "grok",
                    "match": {"class": "Google-chrome", "title~=": "Grok"},
                    "open": {"app": "Grok"},
                    "slot": "mon0.left-tab",
                },
            ],
        }
        plan = plan_reconcile(forest, profile)
        self.assertEqual(plan["counts"]["reused"], 2)
        self.assertEqual(plan["counts"]["kept"], 1)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["kept"][0]["windowId"], 803)
        self.assertTrue(plan["nothingToDo"])

    def test_strict_leaves_unclaimed_by_default(self):
        forest = _load("tree-ghostty-nautilus-tab.json")
        plan = plan_reconcile(
            forest, self._ghostty_profile(mode="strict", roleOrder="first")
        )
        self.assertEqual(plan["counts"]["reused"], 1)
        self.assertEqual(plan["counts"]["kept"], 0)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["left"], 1)
        self.assertEqual(plan["left"][0]["windowId"], 502)
        self.assertEqual(plan["kept"], [])

    def test_strict_park_soft_parks_unclaimed(self):
        forest = _load("tree-ghostty-nautilus-tab.json")
        plan = plan_reconcile(
            forest,
            self._ghostty_profile(mode="strict", residual="park", roleOrder="first"),
        )
        self.assertEqual(plan["counts"]["kept"], 0)
        self.assertEqual(plan["counts"]["parked"], 1)
        parks = [a for a in plan["actions"] if a["op"] == "park"]
        self.assertEqual(len(parks), 1)
        self.assertEqual(parks[0]["windowId"], 502)
        self.assertEqual(parks[0].get("destWindowId"), 501)


class TestCleanResiduals(unittest.TestCase):
    """WR15: --clean closes residuals that would otherwise park."""

    def _ghostty_profile(self, mode="coexist"):
        return {
            "version": 2,
            "marginal": {"mode": mode, "roleOrder": "first"},
            "layout": {
                "mon0": {
                    "children": [
                        {"id": "term", "roles": ["ghostty"]},
                    ]
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
        }

    def test_default_leaves_strays(self):
        forest = _load("tree-stray-wrong-mon.json")
        plan = plan_reconcile(forest, self._ghostty_profile())
        self.assertFalse(plan.get("clean"))
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["left"], 2)
        self.assertEqual(plan["counts"]["closed"], 0)
        self.assertEqual(plan["counts"]["kept"], 0)
        self.assertFalse(any(a["op"] == "park" for a in plan["actions"]))
        self.assertFalse(any(a["op"] == "close" for a in plan["actions"]))

    def test_clean_closes_strays_not_roles(self):
        forest = _load("tree-stray-wrong-mon.json")
        plan = plan_reconcile(forest, self._ghostty_profile(), clean=True)
        self.assertTrue(plan["clean"])
        self.assertEqual(plan["counts"]["reused"], 1)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["closed"], 2)
        self.assertEqual(plan["counts"]["kept"], 0)
        closes = [a for a in plan["actions"] if a["op"] == "close"]
        self.assertEqual(len(closes), 2)
        self.assertEqual({c["windowId"] for c in closes}, {602, 603})
        self.assertFalse(any(a["op"] == "park" for a in plan["actions"]))
        # role window not closed
        role_ids = {
            r.get("windowId") for r in plan["roles"] if r.get("windowId") is not None
        }
        for c in closes:
            self.assertNotIn(c["windowId"], role_ids)

    def test_clean_keeps_companions(self):
        forest = _load("tree-ghostty-nautilus-tab.json")
        plan = plan_reconcile(forest, self._ghostty_profile(), clean=True)
        self.assertEqual(plan["counts"]["reused"], 1)
        self.assertEqual(plan["counts"]["kept"], 1)
        self.assertEqual(plan["counts"]["closed"], 0)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertFalse(any(a["op"] == "close" for a in plan["actions"]))
        self.assertEqual(plan["kept"][0]["windowId"], 502)

    def test_clean_strict_closes_companions(self):
        forest = _load("tree-ghostty-nautilus-tab.json")
        plan = plan_reconcile(
            forest, self._ghostty_profile(mode="strict"), clean=True
        )
        self.assertEqual(plan["counts"]["kept"], 0)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["closed"], 1)
        closes = [a for a in plan["actions"] if a["op"] == "close"]
        self.assertEqual(len(closes), 1)
        self.assertEqual(closes[0]["windowId"], 502)

    def test_clean_no_overflow_ensure(self):
        forest = _load("tree-stray-wrong-mon.json")
        plan = plan_reconcile(forest, self._ghostty_profile(), clean=True)
        overflow_ensures = [
            a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout" and "overflow" in str(a.get("slot", ""))
        ]
        self.assertEqual(overflow_ensures, [])


class TestMonChildSpanAndParkGating(unittest.TestCase):
    """WR16: mon-child span keep companions; park-only skips mon ensure."""

    def test_mon1_facebook_chess_kept_on_term_no_mon_ensure(self):
        forest = _load("tree-mon1-companions-direct.json")
        profile = _load("profile-dev-v2.json")
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["ok"])
        self.assertEqual(plan["counts"]["opened"], 0)
        self.assertEqual(plan["counts"]["moved"], 0)
        self.assertEqual(plan["counts"]["reused"], 7)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["kept"], 2)
        keep_ids = {k["windowId"] for k in plan["kept"]}
        self.assertEqual(keep_ids, {301, 302})
        for k in plan["kept"]:
            self.assertEqual(k["slot"], "mon1.term")
            self.assertEqual(k["status"], "kept")
        # Structure tabs ghostty + companions; no mon0/mon1 rewrite
        self.assertGreaterEqual(plan["counts"]["structure"], 1)
        ensures = [a for a in plan["actions"] if a.get("op") == "ensure_layout"]
        by_slot = {a["slot"]: a for a in ensures}
        self.assertNotIn("mon0", by_slot)
        self.assertNotIn("mon1", by_slot)
        self.assertIn("mon1.term", by_slot)
        self.assertEqual(by_slot["mon1.term"]["mode"], "tabbed")
        self.assertEqual(by_slot["mon1.term"]["windowIds"], [201, 301, 302])
        self.assertFalse(any(a["op"] == "park" for a in plan["actions"]))

    def test_mon1_companions_already_tabbed_nothing_to_do(self):
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
                            "nodeType": "CON",
                            "layout": "TABBED",
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
                                    "windowId": 301,
                                    "wmClass": "Google-chrome",
                                    "title": "Facebook",
                                    "monitor": 1,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 302,
                                    "wmClass": "Google-chrome",
                                    "title": "Chess.com",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        },
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "children": [
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
                                    "title": "Gmail - Inbox - Gmail",
                                    "monitor": 1,
                                    "children": [],
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 204,
                                    "wmClass": "Google-chrome",
                                    "title": "Google Voice - Messages",
                                    "monitor": 1,
                                    "children": [],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        plan = plan_reconcile(forest, _load("profile-dev-v2.json"))
        self.assertEqual(plan["counts"]["kept"], 2)
        self.assertEqual(plan["counts"]["parked"], 0)
        self.assertEqual(plan["counts"]["structure"], 0)
        self.assertTrue(plan["nothingToDo"])
        self.assertEqual(plan["actions"], [])

    def test_park_only_no_mon_level_ensure(self):
        forest = _load("tree-stray-wrong-mon.json")
        profile = {
            "version": 2,
            "layout": {
                "mon0": {
                    "split": "hsplit",
                    "children": [{"id": "term", "roles": ["ghostty"]}],
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
        }
        profile["marginal"] = {"mode": "coexist", "residual": "park"}
        plan = plan_reconcile(forest, profile)
        self.assertEqual(plan["counts"]["parked"], 2)
        self.assertEqual(plan["counts"]["moved"], 0)
        self.assertEqual(plan["counts"]["opened"], 0)
        mon_ensures = [
            a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout" and a.get("slot") in ("mon0", "mon1")
        ]
        self.assertEqual(mon_ensures, [])
        # Soft park: no overflow ensure_layout (zero thrash)
        overflow = [
            a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout" and "overflow" in str(a.get("slot", ""))
        ]
        self.assertEqual(overflow, [])
        parks = [a for a in plan["actions"] if a.get("op") == "park"]
        self.assertEqual(len(parks), 2)
        self.assertTrue(all(p.get("destWindowId") is not None for p in parks))


_SK0 = "geom:0,0,5120,2880#primary"
_SK1 = "geom:5120,0,5120,2880"


class TestStableKeyMonitors(unittest.TestCase):
    """WR8: tiles/layout mon keys via T7 stableKey or monitors aliases."""

    def test_forest_stable_key_map(self):
        forest = _load("tree-empty.json")
        m = forest_stable_key_map(forest)
        self.assertEqual(m[_SK0], 0)
        self.assertEqual(m[_SK1], 1)

    def test_resolve_mon_key_raw_stable(self):
        forest = _load("tree-empty.json")
        self.assertEqual(resolve_mon_key(_SK0, forest), 0)
        self.assertEqual(resolve_mon_key(_SK1, forest), 1)
        self.assertEqual(resolve_mon_key("mon1", forest), 1)
        self.assertEqual(resolve_mon_key("primary", forest), 0)

    def test_resolve_unknown_lists_available(self):
        forest = _load("tree-empty.json")
        with self.assertRaisesRegex(ValueError, r"available stableKeys:.*geom:"):
            resolve_mon_key("geom:9,9,1,1", forest)

    def test_validate_raw_stable_key_layout(self):
        raw = {
            "tiles": {
                _SK0: ["ghostty"],
                _SK1: ["firefox"],
            }
        }
        p = validate_reconcile_profile(raw)
        self.assertIn(_SK0, p["layout"])
        self.assertIn(_SK1, p["layout"])
        self.assertEqual(p["roles"][0]["slot"], f"{_SK0}.ghostty")

    def test_validate_alias_map(self):
        raw = {
            "monitors": {"left": _SK0, "right": _SK1},
            "tiles": {
                "left": ["ghostty"],
                "right": ["firefox"],
            },
        }
        p = validate_reconcile_profile(raw)
        self.assertEqual(p["monitors"]["left"], _SK0)
        self.assertIn("left", p["layout"])
        self.assertEqual(p["roles"][0]["slot"], "left.ghostty")

    def test_validate_rejects_unknown_alias(self):
        raw = {"tiles": {"sideways": ["ghostty"]}}
        with self.assertRaisesRegex(ValueError, r"layout key 'sideways'"):
            validate_reconcile_profile(raw)

    def test_plan_raw_stable_key_empty(self):
        forest = _load("tree-empty.json")
        profile = {
            "tiles": {
                _SK0: ["ghostty"],
                _SK1: ["firefox"],
            }
        }
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["ok"])
        self.assertEqual(plan["counts"]["opened"], 2)
        by_id = {r["id"]: r for r in plan["roles"]}
        self.assertEqual(by_id["ghostty"]["slot"], "mon0.ghostty")
        self.assertEqual(by_id["firefox"]["slot"], "mon1.firefox")
        opens = {a["role"]: a for a in plan["actions"] if a["op"] == "open"}
        self.assertEqual(opens["ghostty"]["slot"], "mon0.ghostty")
        self.assertEqual(opens["firefox"]["slot"], "mon1.firefox")

    def test_plan_alias_map_empty(self):
        forest = _load("tree-empty.json")
        profile = {
            "monitors": {"left": _SK0, "right": _SK1},
            "tiles": {
                "left": ["ghostty"],
                "right": ["firefox"],
            },
        }
        plan = plan_reconcile(forest, profile)
        self.assertEqual(plan["counts"]["opened"], 2)
        slots = {r["id"]: r["slot"] for r in plan["roles"]}
        self.assertEqual(slots["ghostty"], "mon0.ghostty")
        self.assertEqual(slots["firefox"], "mon1.firefox")

    def test_plan_stable_key_perfect_reuse(self):
        """Same roles as mon0/mon1 profile, keys = forest stableKeys → nothingToDo."""
        forest = _load("tree-perfect.json")
        mon0_profile = _load("profile-dev-v2.json")
        # Rewrite mon0/mon1 → stableKeys in a shallow copy of layout + slots
        raw = json.loads(json.dumps(mon0_profile))
        layout = raw["layout"]
        raw["layout"] = {_SK0: layout["mon0"], _SK1: layout["mon1"]}
        for role in raw["roles"]:
            slot = role["slot"]
            if slot.startswith("mon0."):
                role["slot"] = _SK0 + slot[4:]
            elif slot.startswith("mon1."):
                role["slot"] = _SK1 + slot[4:]
        plan = plan_reconcile(forest, raw)
        self.assertTrue(plan["nothingToDo"])
        self.assertEqual(plan["counts"]["reused"], 7)
        self.assertTrue(all(r["slot"].startswith("mon") for r in plan["roles"]))

    def test_plan_alias_perfect_reuse(self):
        forest = _load("tree-perfect.json")
        mon0_profile = _load("profile-dev-v2.json")
        raw = json.loads(json.dumps(mon0_profile))
        layout = raw["layout"]
        raw["monitors"] = {"left": _SK0, "right": _SK1}
        raw["layout"] = {"left": layout["mon0"], "right": layout["mon1"]}
        for role in raw["roles"]:
            slot = role["slot"]
            if slot.startswith("mon0."):
                role["slot"] = "left" + slot[4:]
            elif slot.startswith("mon1."):
                role["slot"] = "right" + slot[4:]
        plan = plan_reconcile(forest, raw)
        self.assertTrue(plan["nothingToDo"])
        self.assertEqual(plan["counts"]["reused"], 7)

    def test_resolve_profile_rewrites_to_monN(self):
        forest = _load("tree-empty.json")
        prof = validate_reconcile_profile(
            {
                "monitors": {"left": _SK0},
                "tiles": {"left": ["ghostty"]},
            }
        )
        resolved = resolve_profile_mon_keys(prof, forest)
        self.assertIn("mon0", resolved["layout"])
        self.assertNotIn("left", resolved["layout"])
        self.assertNotIn("monitors", resolved)
        self.assertEqual(resolved["roles"][0]["slot"], "mon0.ghostty")

    def test_mon0_regression_still_plans(self):
        forest = _load("tree-empty.json")
        plan = plan_reconcile(forest, _load("profile-dev-v2.json"))
        self.assertEqual(plan["counts"]["opened"], 7)
        plan2 = plan_reconcile(_load("tree-perfect.json"), _load("profile-dev-v2.json"))
        self.assertTrue(plan2["nothingToDo"])

    def test_dotted_name_stable_key_longest_prefix(self):
        """name:Dell.U2720Q must not split on first '.' (validate + resolve agree)."""
        sk_dotted = "name:Dell.U2720Q"
        forest = {
            "apiVersion": 2,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "id": "mo0ws0",
                    "stableKey": sk_dotted,
                    "children": [],
                },
                {
                    "nodeType": "MONITOR",
                    "id": "mo1ws0",
                    "stableKey": "geom:5120,0,5120,2880",
                    "children": [],
                },
            ],
        }
        # mon_head_and_rest: longest-prefix, not first-dot
        head, rest = mon_head_and_rest(
            f"{sk_dotted}.ghostty", known_heads={sk_dotted}
        )
        self.assertEqual(head, sk_dotted)
        self.assertEqual(rest, "ghostty")
        # first-dot fallback would wrongly yield name:Dell
        bad_head, _ = mon_head_and_rest(f"{sk_dotted}.ghostty")
        self.assertEqual(bad_head, "name:Dell")

        # tiles key = dotted stableKey
        profile = {"tiles": {sk_dotted: ["ghostty"]}}
        p = validate_reconcile_profile(profile)
        self.assertIn(sk_dotted, p["layout"])
        self.assertEqual(p["roles"][0]["slot"], f"{sk_dotted}.ghostty")
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["ok"])
        self.assertEqual(plan["roles"][0]["slot"], "mon0.ghostty")
        self.assertEqual(plan["counts"]["opened"], 1)

        # alias → dotted stableKey
        profile_alias = {
            "monitors": {"desk": sk_dotted},
            "tiles": {"desk": ["ghostty"]},
        }
        plan_a = plan_reconcile(forest, profile_alias)
        self.assertEqual(plan_a["roles"][0]["slot"], "mon0.ghostty")
        self.assertEqual(plan_a["counts"]["opened"], 1)


class TestFocusAndActive(unittest.TestCase):
    def test_profile_focus_and_tab_active_emit_focus_actions(self):
        forest = _load("tree-perfect.json")
        profile = {
            "focus": "Grok",
            "tiles": {
                "mon0": [
                    {"tab": ["google-chrome", "Grok"], "active": "Grok"},
                    "ghostty",
                ],
                "mon1": [
                    "ghostty",
                    {"tab": ["YouTube", "Gmail", "Google Voice"]},
                ],
            },
        }
        ir = validate_reconcile_profile(profile, mon_count=2)
        self.assertEqual(ir.get("focus"), "Grok")
        tab0 = ir["layout"]["mon0"]["children"][0]
        self.assertEqual(tab0.get("layout"), "tabbed")
        self.assertEqual(tab0.get("active"), "Grok")

        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["ok"])
        focus_ops = [a for a in plan["actions"] if a.get("op") == "focus"]
        self.assertGreaterEqual(len(focus_ops), 1, plan["actions"])
        # Profile focus is Grok (windowId 102 on mon0 tab)
        sels = [a.get("selector") for a in focus_ops]
        self.assertIn("id:102", sels)
        self.assertGreaterEqual(plan["counts"].get("focused", 0), 1)

    def test_focus_only_is_work(self):
        forest = _load("tree-perfect.json")
        profile = {
            "focus": "Grok",
            "tiles": {
                "mon0": [
                    {"tab": ["google-chrome", "Grok"]},
                    "ghostty",
                ],
                "mon1": [
                    "ghostty",
                    {"tab": ["YouTube", "Gmail", "Google Voice"]},
                ],
            },
        }
        plan = plan_reconcile(forest, profile)
        self.assertFalse(plan["nothingToDo"])
        self.assertTrue(any(a.get("op") == "focus" for a in plan["actions"]))

    def _dual_grok_forest(self):
        forest = _load("tree-perfect.json")
        mon0_tab = forest["monitors"][0]["children"][0]
        first = dict(mon0_tab["children"][0])
        first["title"] = "Grok"
        first["wmClass"] = "Google-chrome"
        mon0_tab["children"][0] = first
        mon0_tab["children"][1]["title"] = "Grok"
        return forest

    def test_dual_grok_active_second_plans_second_window(self):
        forest = self._dual_grok_forest()
        profile = {
            "tiles": {
                "mon0": [
                    {"tab": ["Grok", "Grok"], "active": ["Grok", 1]},
                    "ghostty",
                ],
                "mon1": [
                    "ghostty",
                    {"tab": ["YouTube", "Gmail", "Google Voice"]},
                ],
            },
        }
        ir = validate_reconcile_profile(profile, mon_count=2)
        tab0 = ir["layout"]["mon0"]["children"][0]
        self.assertEqual(tab0.get("active"), "Grok-2")
        plan = plan_reconcile(forest, profile)
        focus_ops = [a for a in plan["actions"] if a.get("op") == "focus"]
        self.assertTrue(any(a.get("selector") == "id:102" for a in focus_ops), focus_ops)
        self.assertTrue(
            any(a.get("role") == "Grok-2" and a.get("reason") == "active" for a in focus_ops)
        )

    def test_focus_nth_grok_desk_wide(self):
        forest = self._dual_grok_forest()
        profile = {
            "focus": ["Grok", 1],
            "tiles": {
                "mon0": [
                    {"tab": ["Grok", "Grok"]},
                    "ghostty",
                ],
                "mon1": [
                    "ghostty",
                    {"tab": ["YouTube", "Gmail", "Google Voice"]},
                ],
            },
        }
        ir = validate_reconcile_profile(profile, mon_count=2)
        self.assertEqual(ir.get("focus"), "Grok-2")
        plan = plan_reconcile(forest, profile)
        focus_ops = [a for a in plan["actions"] if a.get("op") == "focus"]
        self.assertTrue(
            any(
                a.get("selector") == "id:102" and a.get("reason") == "profile"
                for a in focus_ops
            ),
            focus_ops,
        )

    def test_active_bare_index_zero_and_one(self):
        forest = self._dual_grok_forest()
        for idx, expect_role, expect_wid in (
            (0, "Grok", 101),
            (1, "Grok-2", 102),
        ):
            profile = {
                "tiles": {
                    "mon0": [
                        {"tab": ["Grok", "Grok"], "active": idx},
                        "ghostty",
                    ],
                    "mon1": [
                        "ghostty",
                        {"tab": ["YouTube", "Gmail", "Google Voice"]},
                    ],
                },
            }
            ir = validate_reconcile_profile(profile, mon_count=2)
            tab0 = ir["layout"]["mon0"]["children"][0]
            self.assertEqual(tab0.get("active"), expect_role, f"active={idx}")
            plan = plan_reconcile(forest, profile)
            focus_ops = [a for a in plan["actions"] if a.get("op") == "focus"]
            self.assertTrue(
                any(a.get("selector") == f"id:{expect_wid}" for a in focus_ops),
                (idx, focus_ops),
            )

    def test_focus_explicit_role_id_still_works(self):
        forest = self._dual_grok_forest()
        profile = {
            "focus": "Grok-2",
            "tiles": {
                "mon0": [{"tab": ["Grok", "Grok"]}, "ghostty"],
                "mon1": [
                    "ghostty",
                    {"tab": ["YouTube", "Gmail", "Google Voice"]},
                ],
            },
        }
        ir = validate_reconcile_profile(profile, mon_count=2)
        self.assertEqual(ir.get("focus"), "Grok-2")
        plan = plan_reconcile(forest, profile)
        self.assertTrue(
            any(
                a.get("op") == "focus" and a.get("selector") == "id:102"
                for a in plan["actions"]
            )
        )


class TestFormatLayoutDescription(unittest.TestCase):
    def test_bare_dual_mon(self):
        bare = _load("profile-bare-dual-mon.json")
        desc = format_layout_description(bare)
        self.assertEqual(
            desc,
            "mon0 (hsplit): tabgroup, ghostty. mon1 (hsplit): ghostty, tabgroup.",
        )

    def test_ir_ignores_stored_description(self):
        ir = _load("profile-dev-v2.json")
        self.assertIn("description", ir)
        desc = format_layout_description(ir)
        self.assertEqual(
            desc,
            "mon0 (hsplit): tabgroup, ghostty. mon1 (hsplit): ghostty, tabgroup.",
        )

    def test_single_mon_panes(self):
        bare = _load("profile-bare-single-mon.json")
        desc = format_layout_description(bare)
        self.assertTrue(desc.startswith("mon0"), desc)
        self.assertIn("ghostty", desc)

    def test_nested_hsplit_token(self):
        sugar = {
            "tiles": {
                "mon0": [
                    {"split": "h", "content": ["ghostty", "firefox"]},
                    "code",
                ]
            }
        }
        desc = format_layout_description(sugar)
        self.assertEqual(desc, "mon0 (hsplit): hsplit(ghostty, firefox), code.")

    def test_empty_or_steps_profile(self):
        self.assertEqual(format_layout_description({"version": 1, "steps": []}), "")
        self.assertEqual(format_layout_description({}), "")

    def test_split_inferred_when_omitted(self):
        sugar = {"tiles": {"mon0": ["ghostty", "firefox"]}}
        desc = format_layout_description(sugar)
        self.assertEqual(desc, "mon0 (hsplit): ghostty, firefox.")

    def test_single_pane_no_split(self):
        sugar = {"tiles": {"mon0": ["ghostty"]}}
        desc = format_layout_description(sugar)
        self.assertEqual(desc, "mon0: ghostty.")


# --- LF8: nested VSPLIT apply (t1-shaped mon0 hsplit | vsplit) ---

_T1_PROFILE = {
    "tiles": [
        [
            {"tab": ["google-chrome", "Grok"], "active": "Grok"},
            {"vsplit": ["ghostty", "nautilus"]},
        ],
        [
            "ghostty",
            {
                "tab": ["YouTube", "Gmail", "Google Voice"],
                "active": "YouTube",
            },
        ],
    ],
}


def _t1_forest_missing_nautilus(*, nautilus_on_mon1: bool = False):
    """
    Live-like tree after close nautilus: mon0 still has VSPLIT CON with ghostty.
    Optional residual: nautilus landed on mon1 (wrong mon).
    """
    mon0_kids = [
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
                    "mode": "TILE",
                    "children": [],
                },
                {
                    "nodeType": "WINDOW",
                    "windowId": 102,
                    "wmClass": "Google-chrome",
                    "title": "Grok",
                    "monitor": 0,
                    "mode": "TILE",
                    "children": [],
                },
            ],
        },
        {
            "nodeType": "CON",
            "layout": "VSPLIT",
            "children": [
                {
                    "nodeType": "WINDOW",
                    "windowId": 103,
                    "wmClass": "com.mitchellh.ghostty",
                    "title": "Ghostty",
                    "monitor": 0,
                    "mode": "TILE",
                    "children": [],
                },
            ],
        },
    ]
    mon1_kids = [
        {
            "nodeType": "WINDOW",
            "windowId": 201,
            "wmClass": "com.mitchellh.ghostty",
            "title": "Ghostty",
            "monitor": 1,
            "mode": "TILE",
            "children": [],
        },
        {
            "nodeType": "CON",
            "layout": "TABBED",
            "children": [
                {
                    "nodeType": "WINDOW",
                    "windowId": 202,
                    "wmClass": "Google-chrome",
                    "title": "YouTube",
                    "monitor": 1,
                    "mode": "TILE",
                    "children": [],
                },
                {
                    "nodeType": "WINDOW",
                    "windowId": 203,
                    "wmClass": "Google-chrome",
                    "title": "Gmail",
                    "monitor": 1,
                    "mode": "TILE",
                    "children": [],
                },
                {
                    "nodeType": "WINDOW",
                    "windowId": 204,
                    "wmClass": "Google-chrome",
                    "title": "Voice",
                    "monitor": 1,
                    "mode": "TILE",
                    "children": [],
                },
            ],
        },
    ]
    if nautilus_on_mon1:
        mon1_kids.append(
            {
                "nodeType": "WINDOW",
                "windowId": 301,
                "wmClass": "org.gnome.Nautilus",
                "title": "Home",
                "monitor": 1,
                "mode": "TILE",
                "children": [],
            }
        )
    return {
        "apiVersion": 2,
        "monitors": [
            {
                "nodeType": "MONITOR",
                "id": "mo0ws0",
                "layout": "HSPLIT",
                "rect": {"x": 0, "y": 0, "width": 1000, "height": 1000},
                "stableKey": "geom:0,0,5120,2880#primary",
                "children": mon0_kids,
            },
            {
                "nodeType": "MONITOR",
                "id": "mo1ws0",
                "layout": "HSPLIT",
                "rect": {"x": 1000, "y": 0, "width": 1000, "height": 1000},
                "stableKey": "geom:5120,0,5120,2880",
                "children": mon1_kids,
            },
        ],
    }


class TestLf8NestedVsplitApply(unittest.TestCase):
    """LF8: nested mon0.s1 vsplit must not demote via mon hsplit on ghostty."""

    def test_slot_modes_record_nested_vsplit(self):
        from layout_plan import _slot_layout_modes

        prof = validate_reconcile_profile(_T1_PROFILE, mon_count=2)
        modes = _slot_layout_modes(prof)
        self.assertEqual(modes.get("mon0.s0"), "tabbed")
        self.assertEqual(modes.get("mon0.s1"), "vsplit")
        self.assertEqual(modes.get("mon1.s0"), "tabbed")

    def test_missing_nautilus_no_mon0_hsplit_on_nested_ghostty(self):
        forest = _t1_forest_missing_nautilus()
        plan = plan_reconcile(forest, _T1_PROFILE)
        mon0_ensures = [
            a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout" and a.get("slot") == "mon0"
        ]
        # Nested ghostty must not anchor mon0 hsplit (would demote VSPLIT CON).
        self.assertEqual(
            mon0_ensures,
            [],
            f"must not ensure mon0 hsplit on nested ghostty: {mon0_ensures}",
        )
        for a in mon0_ensures:
            self.assertNotIn(103, a.get("windowIds") or [])

        opens = [a for a in plan["actions"] if a.get("op") == "open"]
        self.assertTrue(
            any(a.get("role") == "nautilus" for a in opens),
            f"expected open nautilus: {opens}",
        )
        # Nested vsplit ensure and/or open dest onto ghostty.
        nest_ensures = [
            a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
            and a.get("mode") == "vsplit"
            and str(a.get("slot") or "").startswith("mon0.s1")
        ]
        open_naut = next(a for a in opens if a.get("role") == "nautilus")
        self.assertTrue(
            nest_ensures or open_naut.get("destWindowId") == 103,
            f"need nested vsplit ensure or dest→ghostty; "
            f"ensures={nest_ensures} open={open_naut}",
        )
        if nest_ensures:
            self.assertIn(103, nest_ensures[0].get("windowIds") or [])

    def test_residual_nautilus_on_mon1_joins_ghostty(self):
        """Nautilus on mon1 → move destWindowId=ghostty (not mon root only)."""
        forest = _t1_forest_missing_nautilus(nautilus_on_mon1=True)
        plan = plan_reconcile(forest, _T1_PROFILE)
        moves = [
            a
            for a in plan["actions"]
            if a.get("op") == "move" and a.get("role") == "nautilus"
        ]
        self.assertEqual(len(moves), 1, plan["actions"])
        move = moves[0]
        self.assertEqual(
            move.get("destWindowId"),
            103,
            f"residual join must target nested ghostty: {move}",
        )
        self.assertEqual(move.get("windowId"), 301)
        # Still no mon0 hsplit demote via nested leaf.
        mon0_hsplit = [
            a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout"
            and a.get("slot") == "mon0"
            and a.get("mode") == "hsplit"
        ]
        self.assertEqual(mon0_hsplit, [])

    def test_tree_perfect_still_nothing_to_do(self):
        """Existing dual-mon perfect profile stays quiet."""
        forest = _load("tree-perfect.json")
        plan = plan_reconcile(forest, _load("profile-dev-v2.json"))
        self.assertTrue(plan["nothingToDo"])
        self.assertEqual(plan["actions"], [])

    def test_mon_direct_term_still_anchors_mon_hsplit(self):
        """Mon-direct ghostty (not nested) remains valid mon ensure anchor."""
        # mon1: ghostty mon-direct moved? use thrash-ish: mon1 only has tabs
        # so mon1 placement needs mon-direct... profile-dev mon1 term is mon-direct
        # when present. Use forest with mon0 ghostty mon-direct + open on mon1.
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
                        }
                    ],
                },
            ],
        }
        # ghostty-2 is on mon0 as 104-less; 103 is mon0 ghostty. mon1 term missing
        # → open. mon_split anchors for mon1 empty (no mon-direct). mon0 no placement.
        plan = plan_reconcile(forest, _load("profile-dev-v2.json"))
        mon_ensures = {
            a["slot"]: a
            for a in plan["actions"]
            if a.get("op") == "ensure_layout" and a.get("slot") in ("mon0", "mon1")
        }
        # mon0 has no open/move → no mon0 ensure; mon1 open with no mon-direct anchor
        self.assertNotIn("mon0", mon_ensures)


class TestShareSugar(unittest.TestCase):
    """SZ1: share/ratio desugar + ensure_sizes plan."""

    def test_normalize_shares_weights(self):
        self.assertEqual(normalize_shares([2, 1]), [0.667, 0.333])
        self.assertEqual(normalize_shares([0.7, 0.3]), [0.7, 0.3])
        self.assertIsNone(normalize_shares([]))
        self.assertIsNone(normalize_shares([1]))
        self.assertIsNone(normalize_shares([1, 0]))
        self.assertIsNone(normalize_shares([-1, 1]))

    def test_desugar_hsplit_share_weights(self):
        sugar = {"hsplit": ["a", "b"], "share": [2, 1]}
        ir = normalize_profile({"tiles": {"mon0": sugar}})
        mon = ir["layout"]["mon0"]
        self.assertEqual(mon.get("split"), "hsplit")
        self.assertEqual(mon.get("share"), [0.667, 0.333])
        self.assertEqual(len(mon["children"]), 2)

    def test_desugar_ratio_alias(self):
        sugar = {"hsplit": ["ghostty", "nautilus"], "ratio": [3, 1]}
        ir = normalize_profile({"tiles": {"mon0": sugar}})
        self.assertEqual(ir["layout"]["mon0"].get("share"), [0.75, 0.25])

    def test_desugar_nested_share(self):
        sugar = {
            "tiles": {
                "mon0": [
                    {"hsplit": ["ghostty", "firefox"], "share": [2, 1]},
                    "code",
                ]
            }
        }
        ir = normalize_profile(sugar)
        kids = ir["layout"]["mon0"]["children"]
        nested = next(c for c in kids if c.get("split") == "hsplit")
        self.assertEqual(nested.get("share"), [0.667, 0.333])
        self.assertNotIn("share", ir["layout"]["mon0"])

    def test_bare_list_no_share(self):
        ir = normalize_profile({"tiles": {"mon0": ["ghostty", "nautilus"]}})
        self.assertNotIn("share", ir["layout"]["mon0"])

    def test_plan_ensure_sizes_when_claimed(self):
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
                            "title": "Ghostty",
                            "monitor": 0,
                            "mode": "TILE",
                            "percent": 0.5,
                            "userSized": False,
                            "children": [],
                            "path": "mo0ws0/0",
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 2,
                            "wmClass": "org.gnome.Nautilus",
                            "title": "Home",
                            "monitor": 0,
                            "mode": "TILE",
                            "percent": 0.5,
                            "userSized": False,
                            "children": [],
                            "path": "mo0ws0/1",
                        },
                    ],
                }
            ],
        }
        # Paths on forest walk: collect_windows builds path; parent_info needs
        # tree structure with path via walk. Use real nested forest paths.
        profile = {
            "tiles": {
                "mon0": {
                    "hsplit": ["ghostty", "nautilus"],
                    "share": [0.7, 0.3],
                }
            }
        }
        plan = plan_reconcile(forest, profile)
        self.assertTrue(plan["ok"])
        size_ops = [a for a in plan["actions"] if a.get("op") == "ensure_sizes"]
        self.assertEqual(len(size_ops), 1)
        self.assertEqual(size_ops[0]["slot"], "mon0")
        self.assertEqual(size_ops[0]["shares"], [0.7, 0.3])
        self.assertEqual(size_ops[0]["windowIds"], [1, 2])
        self.assertEqual(plan["counts"].get("sized"), 1)


class TestClassEqChromeFamily(unittest.TestCase):
    """W2: Chrome browser class matches Wayland PWA / crx ids."""

    def test_casefold_and_stem(self):
        self.assertTrue(plan_class_eq("Google-chrome", "google-chrome"))
        self.assertTrue(plan_class_eq("ghostty", "com.mitchellh.ghostty"))
        self.assertFalse(plan_class_eq("A", "B"))
        self.assertFalse(plan_class_eq(None, "A"))

    def test_chrome_browser_matches_pwa_and_crx(self):
        self.assertTrue(plan_class_eq("Google-chrome", "chrome-ggjoabcdef-Default"))
        self.assertTrue(plan_class_eq("google-chrome", "chrome-ggjoabcdef-Default"))
        self.assertTrue(plan_class_eq("Chromium", "chrome-ggjoabcdef-Default"))
        self.assertTrue(plan_class_eq("chromium", "crx_abc123"))
        self.assertTrue(plan_class_eq("google-chrome-stable", "crx_xyz"))
        self.assertTrue(plan_class_eq("chrome-aaa-Default", "Google-chrome"))
        self.assertTrue(plan_class_eq("Google-chrome", "Google-chrome"))

    def test_non_chrome_does_not_match_pwa(self):
        self.assertFalse(plan_class_eq("firefox", "chrome-ggjo-Default"))
        self.assertFalse(plan_class_eq("ghostty", "crx_abc"))


if __name__ == "__main__":
    unittest.main()
