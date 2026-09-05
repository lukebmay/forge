"""L0: black-box nest oracles (synthetic GetTree; no gnome-shell)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nest_oracles import (  # noqa: E402
    OracleError,
    assert_float_not_under_monitor,
    assert_identity,
    assert_mode,
    assert_parent_children,
    assert_visible_fill_half,
    assert_visible_not_third,
    assert_visible_only,
    assert_who_sits_where,
    monitor_shape,
    normalize_shape,
    parse_get_tree,
    visible_panes,
    width_in_half_band,
    width_in_third_band,
)
from nest_proof import HALF_HI, HALF_LO, THIRD_HI, THIRD_LO  # noqa: E402


def _win(
    wid: object,
    width: float,
    *,
    x: float = 0.0,
    height: float = 1080.0,
    percent: float | None = None,
    mode: str = "TILE",
    wm_class: str = "com.mitchellh.ghostty",
    pid: int | None = 100,
    layout: str | None = None,
) -> dict:
    out = {
        "windowId": wid,
        "nodeType": "WINDOW",
        "mode": mode,
        "wmClass": wm_class,
        "pid": pid,
        "rect": {"x": x, "y": 0, "width": width, "height": height},
    }
    if percent is not None:
        out["percent"] = percent
    if layout is not None:
        out["layout"] = layout
    return out


MON = {"x": 0.0, "y": 0.0, "width": 1920.0, "height": 1080.0}


def _half_forest() -> dict:
    return {
        "apiVersion": 2,
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "rect": dict(MON),
                "children": [
                    _win("a", 960, percent=0.5, wm_class="com.mitchellh.ghostty", pid=11),
                    _win(
                        "b",
                        960,
                        x=960,
                        percent=0.5,
                        wm_class="org.gnome.Nautilus",
                        pid=22,
                    ),
                ],
            }
        ],
    }


def test_parse_get_tree_json_and_object() -> None:
    forest = _half_forest()
    assert parse_get_tree(forest)["monitors"]
    assert parse_get_tree(json.dumps(forest))["monitors"]
    wrapped = json.dumps({"tree": forest})
    assert parse_get_tree(wrapped)["monitors"]
    with pytest.raises(OracleError, match="empty"):
        parse_get_tree("  ")
    with pytest.raises(OracleError, match="Tree not available"):
        parse_get_tree({"error": "Tree not available"})


def test_fill_half_vs_third_band() -> None:
    half = [_win("a", 960), _win("b", 960, x=960)]
    out = assert_visible_fill_half(half, MON, stage="t")
    assert out["axis"] == "hsplit"
    assert width_in_half_band(half[0], MON)
    assert not width_in_third_band(half[0], MON)
    third = [_win("a", 640), _win("b", 1280, x=640)]
    assert width_in_third_band(third[0], MON)
    assert THIRD_LO <= 640 / 1920 <= THIRD_HI
    assert HALF_LO <= 0.5 <= HALF_HI
    with pytest.raises(OracleError, match="1/3"):
        assert_visible_fill_half(third, MON, stage="launch-into-2slot")
    with pytest.raises(OracleError, match="1/3"):
        assert_visible_not_third(_win("a", 640), MON, stage="t")
    assert assert_visible_not_third(_win("a", 960), MON, stage="t") == pytest.approx(
        0.5, abs=0.01
    )


def test_visible_only_does_not_fail_missing_other_mon() -> None:
    forest = _half_forest()
    out = assert_visible_only(
        forest,
        monitor=0,
        stage="visible",
        expect_count=2,
        expect_shape="H(WINDOW,WINDOW)",
        expect_half=True,
    )
    assert out["visibleCount"] == 2
    assert out["visibleIds"] == ["a", "b"]
    mapping = {
        "apiVersion": 2,
        "monitors": [
            forest["monitors"][0],
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "rect": {"x": 1920, "y": 0, "width": 1920, "height": 1080},
                "children": [],
            },
        ],
    }
    still = assert_visible_only(
        mapping,
        monitor=0,
        stage="d105",
        expect_count=2,
        expect_half=True,
    )
    assert still["visibleIds"] == ["a", "b"]
    with pytest.raises(OracleError, match="monitor 1 missing"):
        assert_visible_only(forest, monitor=1, stage="other")


def test_visible_only_fails_wrong_visible_even_if_other_mon_ok() -> None:
    forest = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "rect": dict(MON),
                "children": [
                    _win("a", 640, percent=0.33),
                    _win("b", 1280, x=640, percent=0.67),
                ],
            },
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "rect": {"x": 1920, "y": 0, "width": 1920, "height": 1080},
                "children": [
                    _win("c", 960, x=1920, percent=0.5),
                    _win("d", 960, x=2880, percent=0.5),
                ],
            },
        ]
    }
    with pytest.raises(OracleError, match="1/3"):
        assert_visible_only(forest, monitor=0, stage="bvh", expect_half=True)


def test_who_sits_where_and_slot_split_shape() -> None:
    forest = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "rect": dict(MON),
                "children": [
                    {
                        "nodeType": "CON",
                        "layout": "VSPLIT",
                        "percent": 0.5,
                        "rect": {"x": 0, "y": 0, "width": 960, "height": 1080},
                        "children": [
                            _win("a", 960, height=540, percent=0.5),
                            _win("c", 960, height=540, percent=0.5),
                        ],
                    },
                    _win("b", 960, x=960, percent=0.5),
                ],
            }
        ]
    }
    assert normalize_shape("Mon0(H(V(A,C), B))") == "H(V(WINDOW,WINDOW),WINDOW)"
    assert monitor_shape(forest, 0) == "H(V(WINDOW,WINDOW),WINDOW)"
    assert_who_sits_where(
        forest, "H(V(A,C),B)", monitor=0, stage="launch-into-2slot"
    )
    with pytest.raises(OracleError, match="shape"):
        assert_who_sits_where(forest, "H(A,B,C)", monitor=0, stage="t")


def test_mode_identity_parent_children() -> None:
    forest = _half_forest()
    a, b = visible_panes(forest, monitor=0)
    assert_mode(a, "TILE", stage="t")
    assert_identity(
        a, stage="t", wm_class="ghostty", pid=11, window_id="a"
    )
    assert_identity(b, stage="t", wm_class="Nautilus")
    with pytest.raises(OracleError, match="wmClass"):
        assert_identity(a, stage="t", wm_class="Nautilus")
    kids = assert_parent_children(
        forest["monitors"][0],
        stage="t",
        layout="HSPLIT",
        child_count=2,
        child_types=("WINDOW", "WINDOW"),
    )
    assert len(kids) == 2


def test_tab_open_leaf_is_the_visible_pane() -> None:
    forest = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "rect": dict(MON),
                "children": [
                    {
                        "nodeType": "CON",
                        "layout": "TABBED",
                        "lastTabFocusId": "a",
                        "rect": dict(MON),
                        "children": [
                            _win("a", 1920),
                            _win("b", 1920),
                        ],
                    }
                ],
            }
        ]
    }
    panes = visible_panes(forest, monitor=0)
    assert [p["windowId"] for p in panes] == ["a"]
    assert_who_sits_where(forest, "TAB(WINDOW,WINDOW)", monitor=0, stage="t")


def test_float_not_under_monitor() -> None:
    forest = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "rect": dict(MON),
                "children": [_win("a", 1920)],
            }
        ],
        "orphanWindows": [
            _win("f", 400, mode="FLOAT", wm_class="Guake", pid=9),
        ],
    }
    hits = assert_float_not_under_monitor(
        forest, stage="t", window_id="f", wm_class="Guake"
    )
    assert hits and hits[0]["windowId"] == "f"
    bad = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "children": [_win("f", 400, mode="FLOAT", wm_class="Guake")],
            }
        ],
        "orphanWindows": [],
    }
    with pytest.raises(OracleError, match="FLOAT under MONITOR"):
        assert_float_not_under_monitor(bad, stage="t")
