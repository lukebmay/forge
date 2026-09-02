"""Unit tests for nest TABBED edge DnD smoke oracles (no live gnome-shell)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nest_layout_tabbed_edge_smoke import (  # noqa: E402
    CampaignError,
    assert_edge_after_drop,
    campaign_plan,
    parse_argv,
    parse_zones,
)


def _ok_forest(zone_parent_layout: str = "HSPLIT") -> dict:
    return {
        "apiVersion": 2,
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "children": [
                    {
                        "nodeType": "CON",
                        "layout": zone_parent_layout,
                        "children": [
                            {
                                "nodeType": "CON",
                                "layout": "TABBED",
                                "children": [
                                    {
                                        "nodeType": "WINDOW",
                                        "windowId": "1",
                                        "mode": "TILE",
                                        "wmClass": "com.mitchellh.ghostty",
                                    },
                                    {
                                        "nodeType": "WINDOW",
                                        "windowId": "2",
                                        "mode": "TILE",
                                        "wmClass": "com.mitchellh.ghostty",
                                    },
                                ],
                            },
                            {
                                "nodeType": "WINDOW",
                                "windowId": "3",
                                "mode": "TILE",
                                "wmClass": "com.mitchellh.ghostty",
                            },
                        ],
                    }
                ],
            }
        ],
    }


def test_parse_zones_default_and_reject():
    assert parse_zones("LEFT,RIGHT") == ["LEFT", "RIGHT"]
    with pytest.raises(CampaignError):
        parse_zones("CENTER")


def test_assert_edge_ok_right():
    out = assert_edge_after_drop(
        _ok_forest("HSPLIT"), zone="RIGHT", bag_ids=["1", "2"], dragged_id="3"
    )
    assert out["parentLayout"] == "HSPLIT"
    assert out["bagKids"] == ["1", "2"]


def test_assert_edge_ok_top():
    out = assert_edge_after_drop(
        _ok_forest("VSPLIT"), zone="TOP", bag_ids=["1", "2"], dragged_id="3"
    )
    assert out["parentLayout"] == "VSPLIT"


def test_assert_edge_rejects_con_in_bag():
    forest = _ok_forest("HSPLIT")
    bag = forest["monitors"][0]["children"][0]["children"][0]
    bag["children"][0] = {
        "nodeType": "CON",
        "layout": "HSPLIT",
        "children": [bag["children"][0]],
    }
    with pytest.raises(CampaignError, match="nested TABBED"):
        assert_edge_after_drop(
            forest, zone="RIGHT", bag_ids=["1", "2"], dragged_id="3"
        )


def test_assert_edge_rejects_dragged_still_in_bag():
    forest = _ok_forest("HSPLIT")
    # Move dragged into the bag.
    wrap = forest["monitors"][0]["children"][0]
    dragged = wrap["children"].pop(1)
    wrap["children"][0]["children"].append(dragged)
    with pytest.raises(CampaignError, match="still inside"):
        assert_edge_after_drop(
            forest, zone="RIGHT", bag_ids=["1", "2"], dragged_id="3"
        )


def test_assert_edge_rejects_monitor_hsplit_false_green():
    """Fail-closed slotSplit leaves MONITOR HSPLIT — must not pass L/R."""
    forest = {
        "apiVersion": 2,
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
                                "windowId": "1",
                                "mode": "TILE",
                                "wmClass": "com.mitchellh.ghostty",
                            },
                            {
                                "nodeType": "WINDOW",
                                "windowId": "2",
                                "mode": "TILE",
                                "wmClass": "com.mitchellh.ghostty",
                            },
                        ],
                    },
                    {
                        "nodeType": "WINDOW",
                        "windowId": "3",
                        "mode": "TILE",
                        "wmClass": "com.mitchellh.ghostty",
                    },
                ],
            }
        ],
    }
    with pytest.raises(CampaignError, match="MONITOR"):
        assert_edge_after_drop(
            forest, zone="RIGHT", bag_ids=["1", "2"], dragged_id="3"
        )


def test_dry_run_plan():
    args = parse_argv(["--dry-run", "--zones", "TOP,BOTTOM"])
    plan = campaign_plan(args)
    assert plan["zones"] == ["TOP", "BOTTOM"]
    assert plan["ok"] is True
