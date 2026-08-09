#!/usr/bin/env python3
"""Unit tests for scripts/forge/live_matrix.py (pure probe + selection)."""

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

from live_matrix import (  # noqa: E402
    LAYER_L1,
    LAYER_L2,
    LIVE_CASES,
    behaviors_from_work_hint,
    capability_from_forest,
    check_agent_survives,
    check_closed_gone,
    check_focus_is_tile,
    check_lft_retained,
    check_mon_open_leaf_contains,
    check_no_tile_focus,
    classify_agent_terminal,
    evaluate_checks,
    forest_has_nautilus,
    forest_has_some_tiles,
    forest_looks_like_dev_shape,
    recommend_for_work,
    select_cases,
    select_chrome_tile_ids,
    session_type_from_env,
)


def _load(name: str):
    return json.loads((_FIXTURES / name).read_text(encoding="utf-8"))


def _with_focus(forest, wid, *, mode=None, wm_class=None, title=None):
    f = json.loads(json.dumps(forest))
    f["focusWindowId"] = wid
    if mode is None and wm_class is None:
        return f
    for w in _walk_wins(f):
        if str(w.get("windowId")) == str(wid):
            if mode is not None:
                w["mode"] = mode
            if wm_class is not None:
                w["wmClass"] = wm_class
            if title is not None:
                w["title"] = title
    return f


def _walk_wins(forest):
    out = []

    def walk(n):
        if not isinstance(n, dict):
            return
        if n.get("nodeType") == "WINDOW":
            out.append(n)
        for c in n.get("children") or []:
            walk(c)

    for m in forest.get("monitors") or []:
        walk(m)
    return out


def _add_guake(forest, wid=999, *, focused=True):
    f = json.loads(json.dumps(forest))
    mon0 = f["monitors"][0]
    mon0.setdefault("children", []).append(
        {
            "nodeType": "WINDOW",
            "layout": None,
            "children": [],
            "wmClass": "Guake",
            "title": "Guake",
            "windowId": wid,
            "mode": "FLOAT",
            "monitor": 0,
        }
    )
    if focused:
        f["focusWindowId"] = wid
    return f


class TestSessionAndAgent(unittest.TestCase):
    def test_session_x11_wayland(self):
        self.assertEqual(
            session_type_from_env({"XDG_SESSION_TYPE": "x11"}), "x11"
        )
        self.assertEqual(
            session_type_from_env({"XDG_SESSION_TYPE": "wayland"}), "wayland"
        )
        self.assertEqual(
            session_type_from_env(
                {"WAYLAND_DISPLAY": "wayland-0"}, xdg_session_type=""
            ),
            "wayland",
        )

    def test_classify_ghostty_focus(self):
        forest = _load("tree-perfect.json")
        forest["focusWindowId"] = 103
        kind, w, _ = classify_agent_terminal(forest)
        self.assertEqual(kind, "ghostty")
        self.assertEqual(str(w.get("windowId")), "103")

    def test_classify_guake(self):
        forest = _add_guake(_load("tree-perfect.json"), focused=True)
        kind, w, _ = classify_agent_terminal(forest)
        self.assertEqual(kind, "guake")
        self.assertEqual(str(w.get("mode")).upper(), "FLOAT")

    def test_capability_true_cold_guake(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(
            forest, ping={"ok": True, "versionName": "test"}, env={"XDG_SESSION_TYPE": "x11"}
        )
        self.assertEqual(cap.session, "x11")
        self.assertTrue(cap.can_hup)
        self.assertTrue(cap.can_true_cold)
        self.assertEqual(cap.agent_terminal, "guake")

    def test_capability_true_cold_blocked_ghostty(self):
        forest = _load("tree-perfect.json")
        forest["focusWindowId"] = 103
        cap = capability_from_forest(
            forest, env={"XDG_SESSION_TYPE": "x11"}
        )
        self.assertEqual(cap.agent_terminal, "ghostty")
        self.assertFalse(cap.can_true_cold)
        self.assertTrue(cap.can_hup)


class TestSelect(unittest.TestCase):
    def test_partial_excludes_l2(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = select_cases(suite="partial", capability=cap)
        self.assertTrue(sel.cases)
        self.assertTrue(all(c.layer == LAYER_L1 for c in sel.cases))
        self.assertFalse(any(c.requires_true_cold for c in sel.cases))

    def test_cold_requires_capability(self):
        forest = _load("tree-perfect.json")
        forest["focusWindowId"] = 103
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = select_cases(suite="cold", capability=cap)
        self.assertEqual(sel.cases, [])
        self.assertTrue(any("true cold blocked" in s["reason"] for s in sel.skipped))

    def test_cold_with_guake(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = select_cases(suite="cold", capability=cap)
        self.assertTrue(sel.cases)
        self.assertTrue(all(c.layer == LAYER_L2 for c in sel.cases))

    def test_behaviors_open_leaf(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = select_cases(
            suite="auto", capability=cap, behaviors={"open-leaf"}
        )
        self.assertTrue(sel.cases)
        for c in sel.cases:
            self.assertIn("open-leaf", c.behaviors)

    def test_tags_r008(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = select_cases(suite="regression", capability=cap, tags={"R008"})
        ids = {c.id for c in sel.cases}
        self.assertIn("L1.ghosttys-only", ids)
        self.assertIn("L2.true-cold-dev", ids)

    def test_work_hint_clean(self):
        self.assertIn("clean-empty", behaviors_from_work_hint("clean"))
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = recommend_for_work("clean", cap)
        self.assertTrue(any(c.id == "L2.layout-clean" for c in sel.cases))
        # tight: clean does not pull entire open-leaf matrix
        self.assertFalse(any(c.id == "L1.t1-nautilus" for c in sel.cases))

    def test_work_hint_open_leaf_not_clean(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = recommend_for_work("open-leaf", cap)
        ids = {c.id for c in sel.cases}
        self.assertIn("L1.ghosttys-only", ids)
        self.assertNotIn("L2.layout-clean", ids)
        self.assertNotIn("L1.t1-nautilus", ids)

    def test_work_hint_cold_only_cold_cases(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = recommend_for_work("cold", cap)
        self.assertTrue(sel.cases)
        self.assertTrue(all("cold-open" in c.behaviors for c in sel.cases))

    def test_catalog_has_r009_clean(self):
        c = next(x for x in LIVE_CASES if x.id == "L2.layout-clean")
        self.assertIn("R009", c.regressions)


class TestChecks(unittest.TestCase):
    def test_open_leaf_and_agent(self):
        forest = _load("tree-perfect.json")
        # fixture mon0 tab lastTabFocus may be unset — set Grok
        mon0_tab = forest["monitors"][0]["children"][0]
        mon0_tab["lastTabFocusId"] = 102
        mon1_tab = forest["monitors"][1]["children"][1]
        mon1_tab["lastTabFocusId"] = 202
        forest["focusWindowId"] = 103
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        ok, _ = check_mon_open_leaf_contains(forest, mon_index=0, substring="Grok")
        self.assertTrue(ok)
        ok, _ = check_mon_open_leaf_contains(
            forest, mon_index=1, substring="YouTube"
        )
        self.assertTrue(ok)
        ok, _ = check_agent_survives(forest, "103")
        self.assertTrue(ok)
        results = evaluate_checks(
            forest,
            ["ok", "mon0-open-leaf-grok", "agent-survives"],
            capability=cap,
            layout_ok=True,
        )
        self.assertTrue(all(r["ok"] for r in results))


class TestSetupSelectors(unittest.TestCase):
    """AT2: mon-specific chrome close + ensure helpers (pure)."""

    def test_select_chrome_all_and_by_mon(self):
        forest = _load("tree-perfect.json")
        all_ids = set(select_chrome_tile_ids(forest))
        mon0 = set(select_chrome_tile_ids(forest, mon_index=0))
        mon1 = set(select_chrome_tile_ids(forest, mon_index=1))
        # Fixture: mon0 chrome 101,102; mon1 chrome 202,203,204
        self.assertEqual(mon0, {"101", "102"})
        self.assertEqual(mon1, {"202", "203", "204"})
        self.assertEqual(all_ids, mon0 | mon1)
        self.assertTrue(mon0.isdisjoint(mon1))
        # Ghostty not included
        self.assertNotIn("103", all_ids)
        self.assertNotIn("201", all_ids)

    def test_select_chrome_skips_float(self):
        forest = _load("tree-perfect.json")
        for w in _walk_wins(forest):
            if str(w.get("windowId")) == "101":
                w["mode"] = "FLOAT"
        mon0 = select_chrome_tile_ids(forest, mon_index=0)
        self.assertEqual(set(mon0), {"102"})

    def test_forest_has_nautilus(self):
        forest = _load("tree-perfect.json")
        self.assertFalse(forest_has_nautilus(forest))
        mon0 = forest["monitors"][0]
        mon0.setdefault("children", []).append(
            {
                "nodeType": "WINDOW",
                "layout": None,
                "children": [],
                "wmClass": "org.gnome.Nautilus",
                "title": "Home",
                "windowId": 555,
                "mode": "TILE",
                "monitor": 0,
            }
        )
        self.assertTrue(forest_has_nautilus(forest))

    def test_dev_shape_and_some_tiles(self):
        forest = _load("tree-perfect.json")
        ok, detail = forest_looks_like_dev_shape(forest)
        self.assertTrue(ok, detail)
        self.assertTrue(forest_has_some_tiles(forest))
        # Empty mon1 → not shaped
        empty = json.loads(json.dumps(forest))
        empty["monitors"][1]["children"] = []
        ok2, _ = forest_looks_like_dev_shape(empty)
        self.assertFalse(ok2)
        # No tiles at all
        bare = {"monitors": [{"children": []}, {"children": []}], "focusWindowId": None}
        self.assertFalse(forest_has_some_tiles(bare))


class TestFocusCloseChecks(unittest.TestCase):
    """FC3 pure checks for close-focus / unfocus live cases."""

    def test_focus_is_tile_and_no_tile_focus(self):
        forest = _load("tree-perfect.json")
        forest["focusWindowId"] = 103
        ok, _ = check_focus_is_tile(forest)
        self.assertTrue(ok)
        forest["focusWindowId"] = None
        ok2, _ = check_no_tile_focus(forest)
        self.assertTrue(ok2)
        forest["focusWindowId"] = 103
        ok3, _ = check_no_tile_focus(forest)
        self.assertFalse(ok3)

    def test_closed_gone_and_lft(self):
        forest = _load("tree-perfect.json")
        ok, _ = check_closed_gone(forest, "999")
        self.assertTrue(ok)
        ok2, _ = check_closed_gone(forest, "103")
        self.assertFalse(ok2)
        forest["lastTileFocusWindowId"] = 103
        ok3, _ = check_lft_retained(forest, "103")
        self.assertTrue(ok3)

    def test_work_hint_close_and_unfocus(self):
        self.assertIn("close-focus", behaviors_from_work_hint("close"))
        self.assertIn("unfocus", behaviors_from_work_hint("unfocus"))
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        close_sel = recommend_for_work("close", cap)
        self.assertTrue(any(c.id == "L1.close-focus-lft" for c in close_sel.cases))
        unf_sel = recommend_for_work("unfocus", cap)
        self.assertTrue(any(c.id == "L1.unfocus" for c in unf_sel.cases))
        # tight: close does not pull open-leaf matrix
        self.assertFalse(any(c.id == "L1.ghosttys-only" for c in close_sel.cases))

    def test_catalog_fc3_cases(self):
        ids = {c.id for c in LIVE_CASES}
        self.assertIn("L1.close-focus-lft", ids)
        self.assertIn("L1.unfocus", ids)
        close_c = next(c for c in LIVE_CASES if c.id == "L1.close-focus-lft")
        self.assertFalse(close_c.run_layout)
        self.assertIn("close-focus", close_c.actions)


if __name__ == "__main__":
    unittest.main()
