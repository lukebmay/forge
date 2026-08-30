"""Unit tests for nest layout+occupied-dest DnD smoke (no live gnome-shell)."""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
_SCRIPT = _FORGE_CLI / "nest_layout_dnd_smoke.py"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nest_layout_dnd_smoke import (  # noqa: E402
    DEFAULT_DEST_MONITOR,
    DEFAULT_PROFILE,
    ENTRY,
    CampaignError,
    build_parser,
    campaign_plan,
    cmd_from_env,
    dest_has_tiles,
    find_bag_con_children,
    layout_failure_reason,
    parse_argv,
    refuse_personal_profile,
    required_slots_errors,
    smoke_script_argv,
    window_mon_index,
)


def _good_forest() -> dict:
    return {
        "apiVersion": 2,
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "children": [
                    {
                        "nodeType": "WINDOW",
                        "windowId": 11,
                        "wmClass": "com.mitchellh.ghostty",
                        "mode": "TILE",
                        "rect": {"x": 0},
                    },
                    {
                        "nodeType": "WINDOW",
                        "windowId": 22,
                        "wmClass": "org.gnome.Nautilus",
                        "mode": "TILE",
                        "rect": {"x": 400},
                    },
                ],
            },
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "children": [
                    {
                        "nodeType": "WINDOW",
                        "windowId": 33,
                        "wmClass": "com.mitchellh.ghostty",
                        "mode": "TILE",
                        "rect": {"x": 1920},
                    },
                ],
            },
        ],
    }


def _nested_tab_forest() -> dict:
    """Today's host failure: TABBED holds a CON child."""
    return {
        "apiVersion": 2,
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "children": [
                    {
                        "nodeType": "CON",
                        "layout": "HSPLIT",
                        "children": [
                            {
                                "nodeType": "CON",
                                "layout": "TABBED",
                                "children": [
                                    {
                                        "nodeType": "CON",
                                        "layout": "HSPLIT",
                                        "children": [
                                            {
                                                "nodeType": "WINDOW",
                                                "windowId": 1,
                                                "wmClass": "Google-chrome",
                                                "mode": "TILE",
                                            }
                                        ],
                                    },
                                    {
                                        "nodeType": "WINDOW",
                                        "windowId": 2,
                                        "wmClass": "com.mitchellh.ghostty",
                                        "mode": "TILE",
                                    },
                                ],
                            },
                            {
                                "nodeType": "WINDOW",
                                "windowId": 3,
                                "wmClass": "org.gnome.Nautilus",
                                "mode": "TILE",
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
                        "nodeType": "CON",
                        "layout": "TABBED",
                        "children": [
                            {
                                "nodeType": "CON",
                                "layout": "VSPLIT",
                                "children": [
                                    {
                                        "nodeType": "WINDOW",
                                        "windowId": 4,
                                        "wmClass": "Google-chrome",
                                        "mode": "TILE",
                                    }
                                ],
                            },
                            {
                                "nodeType": "WINDOW",
                                "windowId": 5,
                                "wmClass": "com.mitchellh.ghostty",
                                "mode": "TILE",
                            },
                        ],
                    }
                ],
            },
        ],
    }


def test_parser_defaults_and_help_documents_occupied_dest() -> None:
    ns = parse_argv([])
    assert ns.profile == DEFAULT_PROFILE
    assert ns.dest_monitor == DEFAULT_DEST_MONITOR == 1
    assert ns.tile == "leftmost"
    assert ns.dry_run is False
    text = build_parser().format_help()
    assert "--monitors=2" in text
    assert "occupied" in text.lower()
    assert "dest-monitor" in text
    assert "_forge-test-ghosttys" in text
    assert "L1.r015" in text or "empty-mon" in text
    assert ENTRY in text or "nest_layout_dnd_smoke.py" in text
    assert "--dry-run" in text
    assert "--version" in text


def test_help_subprocess() -> None:
    proc = subprocess.run(
        [sys.executable, str(_SCRIPT), "--help"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0
    text = proc.stdout
    assert "--monitors=2" in text
    assert "occupied" in text.lower()
    assert "dest-monitor" in text
    assert "_forge-test-ghosttys" in text


def test_version_subprocess() -> None:
    proc = subprocess.run(
        [sys.executable, str(_SCRIPT), "--version"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0
    assert "nest_layout_dnd_smoke.py" in proc.stdout


def test_dry_run_no_nest_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DBUS_SESSION_BUS_ADDRESS", raising=False)
    monkeypatch.delenv("WAYLAND_DISPLAY", raising=False)
    env = os.environ.copy()
    env.pop("DBUS_SESSION_BUS_ADDRESS", None)
    env.pop("WAYLAND_DISPLAY", None)
    proc = subprocess.run(
        [sys.executable, str(_SCRIPT), "--dry-run"],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert proc.returncode == 0
    out = proc.stdout
    assert "dry-run" in out
    assert "_forge-test-ghosttys" in out
    assert "occupied dest" in out.lower() or "occupied dest" in out
    assert "--monitors=2" in out or "monitors=2" in out
    assert "dest-monitor" in out


def test_dry_run_json_structure() -> None:
    ns = parse_argv(["--dry-run", "--json"])
    plan = campaign_plan(ns)
    assert plan["ok"] is True
    assert plan["dryRun"] is True
    assert plan["profile"] == DEFAULT_PROFILE
    assert plan["destMonitor"] == 1
    assert plan["occupiedDest"] is True
    assert plan["monitors"] == 2
    assert "nest_layout_dnd_smoke.py" in plan["entry"]
    joined = " ".join(plan["steps"])
    assert "seed" in joined
    assert "ghostty" in joined
    assert "TABBED" in joined
    assert "dest-monitor" in joined
    assert "occupied" in joined


def test_missing_nest_env_exits_2(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DBUS_SESSION_BUS_ADDRESS", raising=False)
    monkeypatch.delenv("WAYLAND_DISPLAY", raising=False)
    ns = parse_argv([])
    rc = cmd_from_env(ns)
    assert rc == 2


def test_refuse_personal_dev() -> None:
    with pytest.raises(CampaignError, match="_forge-test-ghosttys"):
        refuse_personal_profile("dev")
    with pytest.raises(CampaignError, match="_forge-test-ghosttys"):
        refuse_personal_profile("t1")
    assert refuse_personal_profile(DEFAULT_PROFILE) == DEFAULT_PROFILE


def test_good_forest_oracles() -> None:
    forest = _good_forest()
    assert find_bag_con_children(forest) == []
    assert required_slots_errors(forest) == []
    assert dest_has_tiles(forest, 1) is True
    assert dest_has_tiles(forest, 0) is True
    assert window_mon_index(forest, "11") == 0
    assert window_mon_index(forest, "33") == 1


def test_nested_tab_con_child_is_violation() -> None:
    bad = find_bag_con_children(_nested_tab_forest())
    assert bad
    assert any("TABBED" in row and "CON" in row for row in bad)


def test_tabbed_window_children_ok() -> None:
    forest = {
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
                                "windowId": 1,
                                "wmClass": "com.mitchellh.ghostty",
                                "mode": "TILE",
                            },
                            {
                                "nodeType": "WINDOW",
                                "windowId": 2,
                                "wmClass": "org.gnome.Nautilus",
                                "mode": "TILE",
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
                        "windowId": 3,
                        "wmClass": "com.mitchellh.ghostty",
                        "mode": "TILE",
                    }
                ],
            },
        ]
    }
    assert find_bag_con_children(forest) == []
    assert required_slots_errors(forest) == []


def test_stacked_con_child_is_violation() -> None:
    forest = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "children": [
                    {
                        "nodeType": "CON",
                        "layout": "STACKED",
                        "children": [
                            {
                                "nodeType": "CON",
                                "layout": "HSPLIT",
                                "children": [],
                            }
                        ],
                    }
                ],
            }
        ]
    }
    bad = find_bag_con_children(forest)
    assert any("STACKED" in row and "CON" in row for row in bad)


def test_required_slots_need_two_mons() -> None:
    forest = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "children": [
                    {
                        "nodeType": "WINDOW",
                        "windowId": 1,
                        "wmClass": "com.mitchellh.ghostty",
                        "mode": "TILE",
                    }
                ],
            }
        ]
    }
    errs = required_slots_errors(forest)
    assert any("2 monitors" in e or "monitors=2" in e for e in errs)


def test_required_slots_missing_mon1_ghostty() -> None:
    forest = _good_forest()
    forest["monitors"][1]["children"] = []
    errs = required_slots_errors(forest)
    assert any("mon1 missing ghostty" in e for e in errs)


def test_empty_dest_not_occupied() -> None:
    forest = _good_forest()
    forest["monitors"][1]["children"] = []
    assert dest_has_tiles(forest, 1) is False


def test_layout_failure_reason_tokens() -> None:
    assert layout_failure_reason(0, "forge layout: ok") is None
    reason = layout_failure_reason(1, "layout-apply-run forest-match failed slots=mon0,mon1")
    assert reason is not None
    assert "forest-match" in reason
    assert "not in-slot" in (layout_failure_reason(1, "required TILE slot(s) not in-slot: mon0") or "")
    assert layout_failure_reason(1, "something else") == "forge layout exit 1"


def test_smoke_script_argv_points_at_this_file() -> None:
    argv = smoke_script_argv()
    assert argv[0] == sys.executable
    assert Path(argv[1]).name == "nest_layout_dnd_smoke.py"
    assert Path(argv[1]).is_file()


def test_hoist_smoke_layout_dnd_monitors() -> None:
    from test_cli import _NESTED_ACTIONS
    from test_cli import hoist_nested_action_flags as hoist

    assert "smoke-layout-dnd" in _NESTED_ACTIONS
    argv = ["nested", "smoke-layout-dnd", "--monitors=2"]
    assert hoist(argv) == ["nested", "--monitors=2", "smoke-layout-dnd"]


def test_forge_test_help_mentions_layout_dnd() -> None:
    import cli_ansi
    import test_cli

    cli_ansi.set_color_mode("never")
    buf = io.StringIO()
    test_cli.print_forge_test_help(stream=buf)
    text = buf.getvalue()
    assert "smoke-layout-dnd" in text
    assert "nest_layout_dnd_smoke" in text
    assert "occupied dest-monitor" in text or "occupied dest" in text
