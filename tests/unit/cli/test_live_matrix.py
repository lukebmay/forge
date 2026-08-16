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
    check_dual_ghostty_mons,
    check_focus_is_tile,
    check_lft_retained,
    check_mon_open_leaf_contains,
    check_nautilus_tabbed_with_mon0_ghostty,
    check_no_tile_focus,
    classify_agent_terminal,
    evaluate_checks,
    extract_layout_metrics,
    forest_has_nautilus,
    forest_has_some_tiles,
    forest_looks_like_dev_shape,
    recommend_for_work,
    select_cases,
    select_chrome_tile_ids,
    session_type_from_env,
    summarize_metrics,
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
    mon0.setdefault("children", []).append({
        "nodeType": "WINDOW",
        "layout": None,
        "children": [],
        "wmClass": "Guake",
        "title": "Guake",
        "windowId": wid,
        "mode": "FLOAT",
        "monitor": 0,
    })
    if focused:
        f["focusWindowId"] = wid
    return f


class TestSessionAndAgent(unittest.TestCase):

    def test_session_x11_wayland(self):
        self.assertEqual(session_type_from_env({"XDG_SESSION_TYPE": "x11"}),
                         "x11")
        self.assertEqual(
            session_type_from_env({"XDG_SESSION_TYPE": "wayland"}), "wayland")
        self.assertEqual(
            session_type_from_env({"WAYLAND_DISPLAY": "wayland-0"},
                                  xdg_session_type=""),
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
        cap = capability_from_forest(forest,
                                     ping={
                                         "ok": True,
                                         "versionName": "test"
                                     },
                                     env={"XDG_SESSION_TYPE": "x11"})
        self.assertEqual(cap.session, "x11")
        self.assertTrue(cap.can_hup)
        self.assertFalse(cap.can_nested)
        self.assertTrue(cap.can_retest)
        self.assertTrue(cap.can_true_cold)
        self.assertEqual(cap.agent_terminal, "guake")
        self.assertTrue(any("HUP" in n for n in cap.notes))

    def test_capability_true_cold_blocked_ghostty(self):
        forest = _load("tree-perfect.json")
        forest["focusWindowId"] = 103
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        self.assertEqual(cap.agent_terminal, "ghostty")
        self.assertFalse(cap.can_true_cold)
        self.assertTrue(cap.can_hup)
        self.assertFalse(cap.can_nested)

    def test_capability_wayland_nested_note(self):
        forest = _add_guake(_load("tree-perfect.json"))
        # No host Wayland socket in this env → can_nested false; still wayland session.
        cap = capability_from_forest(
            forest,
            env={
                "XDG_SESSION_TYPE": "wayland",
                "WAYLAND_DISPLAY": "wayland-missing-for-unit",
                "XDG_RUNTIME_DIR": "/tmp/forge-no-wl-runtime",
            },
        )
        self.assertEqual(cap.session, "wayland")
        self.assertFalse(cap.can_hup)
        self.assertFalse(cap.can_nested)
        self.assertFalse(cap.can_retest)
        self.assertTrue(any("nested" in n.lower() for n in cap.notes))


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
        self.assertTrue(
            any("true cold blocked" in s["reason"] for s in sel.skipped))

    def test_cold_with_guake(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = select_cases(suite="cold", capability=cap)
        self.assertTrue(sel.cases)
        self.assertTrue(all(c.layer == LAYER_L2 for c in sel.cases))

    def test_behaviors_open_leaf(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = select_cases(suite="auto",
                           capability=cap,
                           behaviors={"open-leaf"})
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

    def test_catalog_has_ghosttys_multi(self):
        c = next(x for x in LIVE_CASES if x.id == "L1.ghosttys-multi")
        self.assertEqual(c.profile, "_forge-test-ghosttys")
        self.assertIn("multi-instance", c.behaviors)
        self.assertIn("dual-ghostty-mons", c.checks)

    def test_catalog_uses_forge_test_profiles(self):
        """Live cases must not target personal `dev` layout."""
        for c in LIVE_CASES:
            if c.profile in ("dev", "default"):
                self.fail(f"{c.id} still uses personal profile {c.profile!r}")

    def test_work_hint_multi_instance(self):
        self.assertIn("multi-instance",
                      behaviors_from_work_hint("multi-instance"))
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest,
                                     env={"XDG_SESSION_TYPE": "wayland"})
        sel = recommend_for_work("multi-instance", cap)
        self.assertTrue(any(c.id == "L1.ghosttys-multi" for c in sel.cases))

    def test_catalog_has_r012_cross_mon_tab_dnd(self):
        c = next(x for x in LIVE_CASES if x.id == "L1.r012-cross-mon-tab-dnd")
        self.assertIn("R012", c.regressions)
        self.assertIn("cross-mon-dnd", c.behaviors)
        self.assertIn("nautilus-tabbed-with-mon0-ghostty", c.checks)
        self.assertIn("r012-tab-mon1-then-center-join-mon0", c.actions)
        self.assertEqual(c.profile, "_forge-test-ghosttys")

    def test_catalog_has_r015_empty_mon_dnd(self):
        c = next(x for x in LIVE_CASES if x.id == "L1.r015-empty-mon-dnd")
        self.assertIn("R015", c.regressions)
        self.assertIn("cross-mon-dnd", c.behaviors)
        self.assertIn("tile-on-mon1", c.checks)
        self.assertIn("r015-empty-mon1-dnd", c.actions)
        self.assertEqual(c.profile, "_forge-test-ghosttys")

    def test_tags_r012(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = select_cases(suite="regression", capability=cap, tags={"R012"})
        ids = {c.id for c in sel.cases}
        self.assertIn("L1.r012-cross-mon-tab-dnd", ids)

    def test_tags_r015(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = select_cases(suite="regression", capability=cap, tags={"R015"})
        ids = {c.id for c in sel.cases}
        self.assertIn("L1.r015-empty-mon-dnd", ids)

    def test_catalog_has_r016_noop_workareas(self):
        c = next(x for x in LIVE_CASES if x.id == "L1.r016-noop-workareas")
        self.assertIn("R016", c.regressions)
        self.assertIn("structure-bind", c.behaviors)
        self.assertIn("r016-noop-workareas-note", c.actions)
        self.assertEqual(c.profile, "_forge-test-dual")

    def test_tags_r016(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = select_cases(suite="regression", capability=cap, tags={"R016"})
        ids = {c.id for c in sel.cases}
        self.assertIn("L1.r016-noop-workareas", ids)

    def test_catalog_has_r017_gdisplays_scale_retile(self):
        c = next(x for x in LIVE_CASES if x.id == "L1.r017-gdisplays-scale-retile")
        self.assertIn("R017", c.regressions)
        self.assertIn("structure-bind", c.behaviors)
        self.assertIn("r017-gdisplays-scale-retile-note", c.actions)
        self.assertEqual(c.profile, "_forge-test-dual")

    def test_tags_r017(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = select_cases(suite="regression", capability=cap, tags={"R017"})
        ids = {c.id for c in sel.cases}
        self.assertIn("L1.r017-gdisplays-scale-retile", ids)

    def test_work_hint_dnd(self):
        self.assertIn("cross-mon-dnd", behaviors_from_work_hint("dnd"))
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        sel = recommend_for_work("dnd", cap)
        ids = {c.id for c in sel.cases}
        self.assertIn("L1.r012-cross-mon-tab-dnd", ids)
        self.assertIn("L1.r015-empty-mon-dnd", ids)
        self.assertIn("L1.r022-nested-empty-mon-dnd", ids)
        self.assertIn("L1.r023-bottom-nest-hsplit", ids)

    def test_catalog_has_r021_r024(self):
        by_id = {c.id: c for c in LIVE_CASES}
        self.assertIn("R021", by_id["L1.r021-empty-head-open"].regressions)
        self.assertIn("R022", by_id["L1.r022-nested-empty-mon-dnd"].regressions)
        self.assertIn("R023", by_id["L1.r023-bottom-nest-hsplit"].regressions)
        self.assertIn("R024", by_id["L1.r024-first-layout-tiles"].regressions)
        self.assertIn("R026", by_id["L1.r026-tab-click-adopts-pin"].regressions)
        self.assertIn("R027", by_id["L1.r027-chrome-until-ready"].regressions)
        self.assertIn("R032", by_id["L1.r032-tab-click-responsive"].regressions)
        self.assertIn("R029", by_id["L1.r029-reuse-no-double"].regressions)
        self.assertIn("R030", by_id["L1.r029-reuse-no-double"].regressions)
        self.assertIn("tile-on-mon1", by_id["L1.r022-nested-empty-mon-dnd"].checks)

    def test_catalog_has_r020_r031(self):
        by_id = {c.id: c for c in LIVE_CASES}
        self.assertIn("R020", by_id["L1.r020-vlc-end-of-video"].regressions)
        self.assertIn("r020-vlc-end-of-video-note", by_id["L1.r020-vlc-end-of-video"].actions)
        self.assertIn("R031", by_id["L1.r031-float-border-follows"].regressions)
        self.assertIn("r031-float-border-follows-note", by_id["L1.r031-float-border-follows"].actions)
        self.assertIn("vlc-end-of-video.webm", by_id["L1.r020-vlc-end-of-video"].notes)
        self.assertIn("Kooha", by_id["L1.r031-float-border-follows"].notes)

    def test_tags_r021_r024(self):
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        for tag, case_id in (
            ("R021", "L1.r021-empty-head-open"),
            ("R022", "L1.r022-nested-empty-mon-dnd"),
            ("R023", "L1.r023-bottom-nest-hsplit"),
            ("R024", "L1.r024-first-layout-tiles"),
            ("R026", "L1.r026-tab-click-adopts-pin"),
            ("R027", "L1.r027-chrome-until-ready"),
            ("R032", "L1.r032-tab-click-responsive"),
            ("R029", "L1.r029-reuse-no-double"),
            ("R030", "L1.r029-reuse-no-double"),
            ("R020", "L1.r020-vlc-end-of-video"),
            ("R031", "L1.r031-float-border-follows"),
        ):
            sel = select_cases(suite="regression", capability=cap, tags={tag})
            ids = {c.id for c in sel.cases}
            self.assertIn(case_id, ids)


class TestChecks(unittest.TestCase):

    def test_nautilus_tabbed_with_mon0_ghostty(self):
        forest = {
            "apiVersion": 1,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "children": [
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "children": [
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 10,
                                    "mode": "TILE",
                                    "wmClass": "com.mitchellh.ghostty",
                                    "title": "ghostty",
                                    "monitor": 0,
                                },
                                {
                                    "nodeType": "WINDOW",
                                    "windowId": 11,
                                    "mode": "TILE",
                                    "wmClass": "org.gnome.Nautilus",
                                    "title": "Home",
                                    "monitor": 0,
                                },
                            ],
                        }
                    ],
                },
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 20,
                            "mode": "TILE",
                            "wmClass": "com.mitchellh.ghostty",
                            "title": "ghostty",
                            "monitor": 1,
                        }
                    ],
                },
            ],
        }
        ok, detail = check_nautilus_tabbed_with_mon0_ghostty(forest)
        self.assertTrue(ok, detail)

        # mon-level HSPLIT siblings → fail
        forest_hs = {
            "apiVersion": 1,
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 10,
                            "mode": "TILE",
                            "wmClass": "com.mitchellh.ghostty",
                            "monitor": 0,
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 11,
                            "mode": "TILE",
                            "wmClass": "org.gnome.Nautilus",
                            "monitor": 0,
                        },
                    ],
                }
            ],
        }
        ok2, _ = check_nautilus_tabbed_with_mon0_ghostty(forest_hs)
        self.assertFalse(ok2)

    def test_open_leaf_and_agent(self):
        forest = _load("tree-perfect.json")
        # fixture mon0 tab lastTabFocus may be unset — set Grok
        mon0_tab = forest["monitors"][0]["children"][0]
        mon0_tab["lastTabFocusId"] = 102
        mon1_tab = forest["monitors"][1]["children"][1]
        mon1_tab["lastTabFocusId"] = 202
        forest["focusWindowId"] = 103
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        ok, _ = check_mon_open_leaf_contains(forest,
                                             mon_index=0,
                                             substring="Grok")
        self.assertTrue(ok)
        ok, _ = check_mon_open_leaf_contains(forest,
                                             mon_index=1,
                                             substring="YouTube")
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

    def test_dual_ghostty_mons(self):
        forest = _load("tree-perfect.json")
        ok, detail = check_dual_ghostty_mons(forest)
        self.assertTrue(ok, detail)
        # remove mon1 ghostty → fail
        mon1 = forest["monitors"][1]
        mon1["children"] = [
            c for c in mon1.get("children") or []
            if not (isinstance(c, dict)
                    and "ghostty" in str(c.get("wmClass") or "").lower())
        ]
        ok2, _ = check_dual_ghostty_mons(forest)
        self.assertFalse(ok2)


class TestLayoutMetrics(unittest.TestCase):

    def test_extract_from_human_and_apply_json(self):
        sample = """
forge layout: host=black profile=dev
  reused  2   opened  4   moved  1
  thrashRisk  3
  thrashState  ok score=0
forge layout: residual targets not hard-ready (moving anyway)
{
  "ok": true,
  "apply": {
    "finalFocusSoftTimeoutMs": 2000,
    "finalFocusSoft": {
      "ok": true,
      "softSettled": true,
      "clean": true,
      "corrections": 1,
      "residuals": [{"latencyMs": 120}],
      "elapsed_ms": 2150,
      "softTimeoutMs": 2000
    },
    "followUpSettle": {"ok": true}
  }
}
"""
        m = extract_layout_metrics(sample, wall_ms=9000)
        self.assertEqual(m["wallMs"], 9000)
        self.assertEqual(m["counts"]["reused"], 2)
        self.assertEqual(m["counts"]["opened"], 4)
        self.assertEqual(m["counts"]["moved"], 1)
        self.assertEqual(m["thrashRisk"], 3)
        self.assertEqual(m["softTimeoutMs"], 2000)
        self.assertTrue(m["softSettled"])
        self.assertEqual(m["softCorrections"], 1)
        self.assertEqual(m["expectationMisses"], 1)
        self.assertEqual(m["hardReadyTimedOutMovingAnyway"], 1)
        self.assertEqual(m["delayTimeoutsLikelyOk"], 1)

    def test_summarize_metrics(self):
        cases = [
            {
                "ok": True,
                "metrics": {
                    "wallMs": 1000,
                    "softTimeoutMs": 2000,
                    "softCorrections": 1,
                    "expectationMisses": 2,
                    "hardReadyWarnings": 0,
                    "delayTimeoutsLikelyOk": 1,
                    "hardReadyTimedOutMovingAnyway": 0,
                },
            },
            {
                "ok": True,
                "metrics": {
                    "wallMs": 3000,
                    "softTimeoutMs": 4000,
                    "softCorrections": 0,
                    "expectationMisses": 0,
                    "hardReadyWarnings": 1,
                    "delayTimeoutsLikelyOk": 1,
                    "hardReadyTimedOutMovingAnyway": 1,
                },
            },
        ]
        s = summarize_metrics(cases)
        self.assertEqual(s["wallMsTotal"], 4000)
        self.assertEqual(s["wallMsMax"], 3000)
        self.assertEqual(s["softCorrectionsTotal"], 1)
        self.assertEqual(s["expectationMissesTotal"], 2)
        self.assertEqual(s["hardReadyWarningsTotal"], 1)
        self.assertEqual(s["hardReadyTimedOutMovingAnywayTotal"], 1)
        self.assertEqual(s["delayTimeoutsLikelyOkTotal"], 2)


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
        mon0.setdefault("children", []).append({
            "nodeType": "WINDOW",
            "layout": None,
            "children": [],
            "wmClass": "org.gnome.Nautilus",
            "title": "Home",
            "windowId": 555,
            "mode": "TILE",
            "monitor": 0,
        })
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
        bare = {
            "monitors": [{
                "children": []
            }, {
                "children": []
            }],
            "focusWindowId": None
        }
        self.assertFalse(forest_has_some_tiles(bare))


class TestFocusCloseChecks(unittest.TestCase):
    """FC1/FC3 pure checks for close-focus (unfocus product abandoned)."""

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

    def test_work_hint_close(self):
        self.assertIn("close-focus", behaviors_from_work_hint("close"))
        forest = _add_guake(_load("tree-perfect.json"))
        cap = capability_from_forest(forest, env={"XDG_SESSION_TYPE": "x11"})
        close_sel = recommend_for_work("close", cap)
        self.assertTrue(
            any(c.id == "L1.close-focus-lft" for c in close_sel.cases))
        # tight: close does not pull open-leaf matrix
        self.assertFalse(
            any(c.id == "L1.ghosttys-only" for c in close_sel.cases))

    def test_catalog_close_focus_case(self):
        ids = {c.id for c in LIVE_CASES}
        self.assertIn("L1.close-focus-lft", ids)
        self.assertNotIn("L1.unfocus", ids)
        close_c = next(c for c in LIVE_CASES if c.id == "L1.close-focus-lft")
        self.assertFalse(close_c.run_layout)
        self.assertIn("close-focus", close_c.actions)


if __name__ == "__main__":
    unittest.main()
