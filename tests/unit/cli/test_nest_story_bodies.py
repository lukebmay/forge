"""L0: nest trunk bodies registry + CLI (no gnome-shell)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nest_oracles import OracleError, parse_get_tree  # noqa: E402
from nest_stories import BVHNV_ID, STORY_RUNNERS  # noqa: E402
from nest_story_bodies import (  # noqa: E402
    OPEN_BRANCH_IDS,
    PROFILE_INKSCAPE_WS2,
    PROFILE_INKSCAPE_WS2_BODY,
    PROFILE_ONE_WS,
    PROFILE_ONE_WS_BODY,
    REWRITE_IDS,
    TRUNK_IDS,
    _assert_inkscape_ws2_forest,
    _assert_slot_split,
    _assert_tab_peers_fill_monitor,
    _assert_visible_open_leaf_group_slot,
    _desk_report,
    _ensure_profile,
    _two_tab_join_ids,
    campaign_argv,
    parse_ids,
    refuse_personal_profile,
    CampaignError,
)


def test_all_trunks_registered() -> None:
    assert len(TRUNK_IDS) == 7
    assert TRUNK_IDS[0] == BVHNV_ID
    for sid in TRUNK_IDS:
        assert sid in STORY_RUNNERS


def test_rewrite_branches_registered() -> None:
    assert "branch.tabs.stacked-same-slot" in REWRITE_IDS
    assert "branch.layout.ws2-no-mutate-ws1" in REWRITE_IDS
    assert "leaf.mark2.move-empty-monitor" in REWRITE_IDS
    assert "leaf.mark2.move-empty-monitor-reverse" in REWRITE_IDS
    assert "leaf.mark2.join-empty-monitor" in REWRITE_IDS
    assert "leaf.layout.apply-inkscape-ws2" in REWRITE_IDS
    assert "leaf.settle.jitter-same-dest" in REWRITE_IDS
    for sid in REWRITE_IDS:
        assert sid in STORY_RUNNERS


def test_open_branches_registered() -> None:
    assert "branch.open.launch-into-2slot-other-focus" in OPEN_BRANCH_IDS
    assert "branch.open.second-on-empty" in OPEN_BRANCH_IDS
    assert "branch.close.split-unit-peer" in OPEN_BRANCH_IDS
    for sid in OPEN_BRANCH_IDS:
        assert sid in STORY_RUNNERS
    assert "branch.settle.buried-peer-background" in STORY_RUNNERS


def test_campaign_argv_and_parse_ids() -> None:
    argv = campaign_argv([BVHNV_ID, "trunk.close.three-equal-one-gone"])
    assert argv[0] == sys.executable
    assert argv[-2] == "--ids"
    assert BVHNV_ID in argv[-1]
    assert parse_ids("a, b, a") == ["a", "b"]
    assert parse_ids("") == []


def test_ensure_profile_rewrites_stale_marginal(tmp_path: Path) -> None:
    import json

    env = {"FORGE_LAYOUT_DIR": str(tmp_path)}
    stale = dict(PROFILE_ONE_WS_BODY)
    name = "_forge-test-one-ws-keep"
    dest = tmp_path / "common" / f"{name}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(stale, indent=2) + "\n", encoding="utf-8")
    keep = dict(PROFILE_ONE_WS_BODY)
    keep["marginal"] = {"residual": "park"}
    _ensure_profile(name, keep, env=env)
    got = json.loads(dest.read_text(encoding="utf-8"))
    assert got.get("marginal") == {"residual": "park"}


def test_inkscape_ws2_profile_loads_and_stays_dual_mon(tmp_path: Path) -> None:
    import json

    from layout_plan import normalize_profile, validate_reconcile_profile

    fixture = _REPO / "tests" / "unit" / "cli" / "fixtures" / "layout" / (
        "_forge-test-inkscape-ws2.json"
    )
    raw = json.loads(fixture.read_text(encoding="utf-8"))
    assert raw["tiles"] == PROFILE_INKSCAPE_WS2_BODY["tiles"]
    assert isinstance(raw["tiles"], list)
    assert len(raw["tiles"]) == 2
    env = {"FORGE_LAYOUT_DIR": str(tmp_path)}
    _ensure_profile(PROFILE_INKSCAPE_WS2, PROFILE_INKSCAPE_WS2_BODY, env=env)
    dest = tmp_path / "common" / f"{PROFILE_INKSCAPE_WS2}.json"
    got = json.loads(dest.read_text(encoding="utf-8"))
    assert got["tiles"] == PROFILE_INKSCAPE_WS2_BODY["tiles"]
    ir = validate_reconcile_profile(raw, mon_count=2)
    assert ir["version"] == 2
    assert "mon0" in ir["layout"]
    assert "mon1" in ir["layout"]
    role_ids = [str(r.get("id") or "") for r in ir["roles"]]
    assert "inkscape" in role_ids
    assert any("TextEditor" in rid or "org.gnome" in rid for rid in role_ids)
    mon1_kids = (ir["layout"].get("mon1") or {}).get("children") or []
    layouts = [
        str(c.get("layout") or "").lower()
        for c in mon1_kids
        if isinstance(c, dict)
    ]
    assert "tabbed" in layouts
    live = normalize_profile(raw, mon_count=2)
    assert "mon0" in live["layout"]
    assert "mon1" in live["layout"]


def test_refuse_personal_profile() -> None:
    assert refuse_personal_profile(PROFILE_ONE_WS) == PROFILE_ONE_WS
    with pytest.raises(CampaignError, match="personal"):
        refuse_personal_profile("dev")
    with pytest.raises(CampaignError, match="personal"):
        refuse_personal_profile("vinyl")
    with pytest.raises(CampaignError, match="personal"):
        refuse_personal_profile("t1")


def _win(wid: str, width: float, *, x: float = 0.0, height: float = 1080.0) -> dict:
    return {
        "windowId": wid,
        "nodeType": "WINDOW",
        "mode": "TILE",
        "wmClass": "com.mitchellh.ghostty",
        "rect": {"x": x, "y": 0, "width": width, "height": height},
    }


def test_two_tab_join_ids_uses_right_tab_left_edge() -> None:
    """CENTER joiner-last TAB(D,C): Join target is left-edge D, not C."""
    forest = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "rect": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                "children": [
                    {
                        "nodeType": "CON",
                        "layout": "TABBED",
                        "children": [_win("b", 960), _win("a", 960)],
                    },
                    {
                        "nodeType": "CON",
                        "layout": "TABBED",
                        "children": [_win("d", 960, x=960), _win("c", 960, x=960)],
                    },
                ],
            }
        ]
    }
    a, b, c, d = _two_tab_join_ids(forest, stage="join-enter")
    assert (a, b, c, d) == ("b", "a", "d", "c")


def test_slot_split_oracle_rejects_even_thirds() -> None:
    thirds = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "rect": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                "children": [
                    _win("a", 640),
                    _win("b", 640, x=640),
                    _win("c", 640, x=1280),
                ],
            }
        ]
    }
    forest = parse_get_tree(thirds)
    with pytest.raises(OracleError, match="even-thirds"):
        _assert_slot_split(
            forest, a_id="a", b_id="b", c_id="c", c_class="ghostty", stage="t"
        )
    assert "shape=H(WINDOW,WINDOW,WINDOW)" in _desk_report(forest)


def test_slot_split_oracle_accepts_v_column() -> None:
    forest = parse_get_tree(
        {
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "rect": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                    "children": [
                        {
                            "nodeType": "CON",
                            "layout": "VSPLIT",
                            "percent": 0.5,
                            "children": [
                                _win("a", 960, height=540),
                                _win("c", 960, height=540),
                            ],
                        },
                        _win("b", 960, x=960),
                    ],
                }
            ]
        }
    )
    _assert_slot_split(
        forest, a_id="a", b_id="b", c_id="c", c_class="ghostty", stage="t"
    )


def test_slot_split_oracle_accepts_other_focus_column() -> None:
    forest = parse_get_tree(
        {
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "rect": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                    "children": [
                        _win("a", 960),
                        {
                            "nodeType": "CON",
                            "layout": "VSPLIT",
                            "percent": 0.5,
                            "children": [
                                _win("b", 960, x=960, height=540),
                                _win("c", 960, x=960, height=540),
                            ],
                        },
                    ],
                }
            ]
        }
    )
    _assert_slot_split(
        forest,
        a_id="a",
        b_id="b",
        c_id="c",
        c_class="ghostty",
        stage="t",
        shape="H(A,V(B,C))",
        keep_id="a",
    )


def _tab_forest(*, a_w: float = 1920.0, b_w: float = 10.0, focus: str = "a") -> dict:
    return parse_get_tree(
        {
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "rect": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                    "children": [
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "lastTabFocusId": focus,
                            "rect": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                            "children": [
                                _win("a", a_w),
                                _win("b", b_w),
                            ],
                        }
                    ],
                }
            ]
        }
    )


def test_visible_open_leaf_ignores_buried_peer_rect() -> None:
    got = _assert_visible_open_leaf_group_slot(
        _tab_forest(a_w=1920, b_w=10), stage="t", want_id="a"
    )
    assert got["openLeaf"] == "a"
    assert got["buried"] == "b"


def test_visible_open_leaf_rejects_third_width() -> None:
    with pytest.raises(OracleError, match="group slot"):
        _assert_visible_open_leaf_group_slot(
            _tab_forest(a_w=640, b_w=640), stage="t", want_id="a"
        )


def test_visible_open_leaf_rejects_buried_shown() -> None:
    with pytest.raises(OracleError, match="B shown instead of A"):
        _assert_visible_open_leaf_group_slot(
            _tab_forest(focus="b"), stage="t", want_id="a"
        )


def _tab_peers(*, width: float) -> dict:
    return parse_get_tree(
        {
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "rect": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                    "children": [
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "lastTabFocusId": "a",
                            "rect": {"x": 0, "y": 0, "width": width, "height": 1080},
                            "children": [
                                _win("a", width),
                                _win("b", width),
                            ],
                        }
                    ],
                }
            ]
        }
    )


def test_tab_peers_fill_monitor_accepts_full() -> None:
    _assert_tab_peers_fill_monitor(
        _tab_peers(width=1870.0), a_id="a", b_id="b", stage="t"
    )


def test_tab_peers_fill_monitor_rejects_half() -> None:
    with pytest.raises(OracleError, match="width_ratio"):
        _assert_tab_peers_fill_monitor(
            _tab_peers(width=960.0), a_id="a", b_id="b", stage="t"
        )


def test_visible_open_leaf_accepts_unary_h_tab_wrap() -> None:
    forest = parse_get_tree(
        {
            "monitors": [
                {
                    "nodeType": "CON",
                    "layout": "HSPLIT",
                    "rect": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                    "children": [
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "lastTabFocusId": "a",
                            "rect": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                            "children": [
                                _win("a", 1920),
                                _win("b", 10),
                            ],
                        }
                    ],
                }
            ]
        }
    )
    got = _assert_visible_open_leaf_group_slot(forest, stage="t", want_id="a")
    assert got["openLeaf"] == "a"
    assert got["buried"] == "b"


def test_inkscape_ws2_oracle_accepts_vinyl_shape() -> None:
    forest = parse_get_tree(
        {
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "rect": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                    "children": [
                        {
                            **_win("ink", 1920),
                            "wmClass": "org.inkscape.Inkscape",
                        }
                    ],
                },
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "rect": {"x": 1920, "y": 0, "width": 1920, "height": 1080},
                    "children": [
                        {
                            **_win("g1", 960, x=1920),
                            "wmClass": "com.mitchellh.ghostty",
                        },
                        {
                            "nodeType": "CON",
                            "layout": "TABBED",
                            "lastTabFocusId": "te",
                            "rect": {
                                "x": 2880,
                                "y": 0,
                                "width": 960,
                                "height": 1080,
                            },
                            "children": [
                                {
                                    **_win("te", 960, x=2880),
                                    "wmClass": "org.gnome.TextEditor",
                                },
                                {
                                    **_win("g2", 960, x=2880),
                                    "wmClass": "com.mitchellh.ghostty",
                                },
                            ],
                        },
                    ],
                },
            ]
        }
    )
    _assert_inkscape_ws2_forest(forest, stage="t")


def _inkscape_ws2_mon1() -> dict:
    return {
        "nodeType": "MONITOR",
        "layout": "HSPLIT",
        "rect": {"x": 1920, "y": 0, "width": 1920, "height": 1080},
        "children": [
            {
                **_win("g1", 960, x=1920),
                "wmClass": "com.mitchellh.ghostty",
            },
            {
                "nodeType": "CON",
                "layout": "TABBED",
                "lastTabFocusId": "te",
                "rect": {
                    "x": 2880,
                    "y": 0,
                    "width": 960,
                    "height": 1080,
                },
                "children": [
                    {
                        **_win("te", 960, x=2880),
                        "wmClass": "org.gnome.TextEditor",
                    },
                    {
                        **_win("g2", 960, x=2880),
                        "wmClass": "com.mitchellh.ghostty",
                    },
                ],
            },
        ],
    }


def test_inkscape_ws2_oracle_accepts_heal_float() -> None:
    forest = parse_get_tree(
        {
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "rect": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                    "children": [],
                },
                _inkscape_ws2_mon1(),
            ],
            "orphanWindows": [
                {
                    **_win("ink", 700, height=651.0),
                    "mode": "FLOAT",
                    "wmClass": "org.inkscape.Inkscape",
                }
            ],
        }
    )
    _assert_inkscape_ws2_forest(forest, stage="t")


def test_inkscape_ws2_oracle_rejects_stuck_undersize_tile() -> None:
    forest = parse_get_tree(
        {
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "rect": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                    "children": [
                        {
                            **_win("ink", 700, height=651.0),
                            "wmClass": "org.inkscape.Inkscape",
                        }
                    ],
                },
                _inkscape_ws2_mon1(),
            ]
        }
    )
    with pytest.raises(OracleError, match="stuck undersize"):
        _assert_inkscape_ws2_forest(forest, stage="t")


def test_inkscape_ws2_oracle_names_did_not_map() -> None:
    forest = parse_get_tree(
        {
            "monitors": [
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "rect": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                    "children": [_win("g", 1920)],
                },
                {
                    "nodeType": "MONITOR",
                    "layout": "HSPLIT",
                    "rect": {"x": 1920, "y": 0, "width": 1920, "height": 1080},
                    "children": [],
                },
            ]
        }
    )
    with pytest.raises(OracleError, match="Inkscape did not map"):
        _assert_inkscape_ws2_forest(forest, stage="t")


def test_module_help_and_version() -> None:
    script = _FORGE_CLI / "nest_story_bodies.py"
    help_p = subprocess.run(
        [sys.executable, str(script), "--help"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert help_p.returncode == 0
    assert "--ids" in help_p.stdout
    ver = subprocess.run(
        [sys.executable, str(script), "--version"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert ver.returncode == 0
