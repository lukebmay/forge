"""Unit tests for nest WS/layout campaign (no live gnome-shell)."""

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
_SCRIPT = _FORGE_CLI / "nest_layout_ws_campaign.py"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nest_layout_ws_campaign import (  # noqa: E402
    DEFAULT_PROFILE_A,
    DEFAULT_PROFILE_B,
    PROFILE_B_BODY,
    ENTRY,
    CampaignError,
    assert_dual_ghostty,
    assert_layout_b,
    build_parser,
    campaign_plan,
    cmd_from_env,
    ensure_test_profiles,
    ghostty_argv,
    parse_argv,
    refuse_personal_profile,
    seed_ghostty_tiles,
    smoke_script_argv,
    window_ids,
)
from nest_invoke import (  # noqa: E402
    build_activate_workspace_js,
    get_tree_options_json,
)


def _dual_ghostty_forest() -> dict:
    return {
        "apiVersion": 2,
        "activeWorkspace": 0,
        "nWorkspaces": 2,
        "focusWindowId": "11",
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
                    }
                ],
            },
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "children": [
                    {
                        "nodeType": "WINDOW",
                        "windowId": 22,
                        "wmClass": "com.mitchellh.ghostty",
                        "mode": "TILE",
                    }
                ],
            },
        ],
    }


def _layout_b_forest() -> dict:
    return {
        "apiVersion": 2,
        "activeWorkspace": 1,
        "nWorkspaces": 2,
        "focusWindowId": "33",
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "children": [
                    {
                        "nodeType": "WINDOW",
                        "windowId": 31,
                        "wmClass": "com.mitchellh.ghostty",
                        "mode": "TILE",
                    },
                    {
                        "nodeType": "WINDOW",
                        "windowId": 32,
                        "wmClass": "com.mitchellh.ghostty",
                        "mode": "TILE",
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
                    }
                ],
            },
        ],
    }


def test_parser_defaults_and_help() -> None:
    ns = parse_argv([])
    assert ns.profile_a == DEFAULT_PROFILE_A
    assert ns.profile_b == DEFAULT_PROFILE_B
    assert ns.dry_run is False
    text = build_parser().format_help()
    assert "--monitors=2" in text
    assert "_forge-test-ghosttys" in text
    assert "_forge-test-ws-b" in text
    assert "dev/t1" in text or "personal" in text
    assert "CTS" in text or "plog-query" in text
    assert ENTRY in text or "nest_layout_ws_campaign.py" in text
    assert "--dry-run" in text
    assert "--version" in text
    assert "Nautilus" in text or "nautilus" in text


def test_help_subprocess() -> None:
    proc = subprocess.run(
        [sys.executable, str(_SCRIPT), "--help"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0
    assert "--monitors=2" in proc.stdout
    assert "_forge-test-ghosttys" in proc.stdout
    assert "smoke-layout-ws" in proc.stdout or "nest_layout_ws_campaign.py" in proc.stdout


def test_version_subprocess() -> None:
    proc = subprocess.run(
        [sys.executable, str(_SCRIPT), "--version"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0
    assert "nest_layout_ws_campaign.py" in proc.stdout


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
    assert "_forge-test-ws-b" in out
    assert "WS1" in out or "layout A" in out
    assert "plog-query" in out


def test_dry_run_json_structure() -> None:
    ns = parse_argv(["--dry-run", "--json"])
    plan = campaign_plan(ns)
    assert plan["ok"] is True
    assert plan["dryRun"] is True
    assert plan["profileA"] == DEFAULT_PROFILE_A
    assert plan["profileB"] == DEFAULT_PROFILE_B
    assert plan["monitors"] == 2
    assert "nest_layout_ws_campaign.py" in plan["entry"]
    assert len(plan["steps"]) == 8
    joined = " ".join(plan["steps"])
    assert "WS1" in joined
    assert "WS2" in joined
    assert "Nautilus" in joined or "nautilus" in joined.lower()
    assert "TAB" in joined
    assert "Close" in joined or "close" in joined.lower()


def test_missing_nest_env_exits_2(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DBUS_SESSION_BUS_ADDRESS", raising=False)
    monkeypatch.delenv("WAYLAND_DISPLAY", raising=False)
    ns = parse_argv([])
    rc = cmd_from_env(ns)
    assert rc == 2


def test_refuse_personal_dev() -> None:
    with pytest.raises(CampaignError, match="_forge-test"):
        refuse_personal_profile("dev")
    with pytest.raises(CampaignError, match="_forge-test"):
        refuse_personal_profile("t1")
    assert refuse_personal_profile(DEFAULT_PROFILE_A) == DEFAULT_PROFILE_A
    assert refuse_personal_profile(DEFAULT_PROFILE_B) == DEFAULT_PROFILE_B


def test_dual_ghostty_oracles() -> None:
    forest = _dual_ghostty_forest()
    assert_dual_ghostty(forest, stage="unit")
    assert window_ids(forest) == ["11", "22"]


def test_layout_b_oracles() -> None:
    forest = _layout_b_forest()
    assert_layout_b(forest, stage="unit")
    assert_layout_b(_dual_ghostty_forest(), stage="unit")
    empty = _dual_ghostty_forest()
    empty["monitors"][1]["children"] = []
    with pytest.raises(CampaignError, match="mon1 missing ghostty"):
        assert_layout_b(empty, stage="unit")


def test_ensure_test_profiles_creates_missing(tmp_path: Path) -> None:
    env = {
        **os.environ,
        "FORGE_LAYOUT_DIR": str(tmp_path),
        "FORGE_HOST": "unit-sub-forge",
    }
    env.pop("FORGE_LAYOUT_PATH", None)
    result = ensure_test_profiles(env=env)
    assert result["created"]
    a = tmp_path / "common" / f"{DEFAULT_PROFILE_A}.json"
    b = tmp_path / "common" / f"{DEFAULT_PROFILE_B}.json"
    assert a.is_file()
    assert b.is_file()
    body_a = json.loads(a.read_text(encoding="utf-8"))
    body_b = json.loads(b.read_text(encoding="utf-8"))
    assert body_a["tiles"] == [["ghostty"], ["ghostty"]]
    assert body_b["tiles"] == [["ghostty"], ["ghostty"]]
    again = ensure_test_profiles(env=env)
    assert again["created"] == []
    assert DEFAULT_PROFILE_A in again["existing"]
    assert DEFAULT_PROFILE_B in again["existing"]


def test_ensure_refreshes_forge_test_tiles(tmp_path: Path) -> None:
    env = {
        **os.environ,
        "FORGE_LAYOUT_DIR": str(tmp_path),
        "FORGE_HOST": "unit-sub-forge",
    }
    env.pop("FORGE_LAYOUT_PATH", None)
    dest = tmp_path / "common" / f"{DEFAULT_PROFILE_B}.json"
    dest.parent.mkdir(parents=True)
    dest.write_text(
        json.dumps(
            {
                "tiles": [["ghostty", "ghostty"], ["ghostty"]],
                "description": "FORGE TEST nest WS campaign layout B stale",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    result = ensure_test_profiles(env=env)
    assert any(str(dest) in p for p in result.get("refreshed") or [])
    body = json.loads(dest.read_text(encoding="utf-8"))
    assert body["tiles"] == [["ghostty"], ["ghostty"]]


def test_ensure_does_not_overwrite(tmp_path: Path) -> None:
    env = {
        **os.environ,
        "FORGE_LAYOUT_DIR": str(tmp_path),
        "FORGE_HOST": "unit-sub-forge",
    }
    env.pop("FORGE_LAYOUT_PATH", None)
    dest = tmp_path / "common" / f"{DEFAULT_PROFILE_A}.json"
    dest.parent.mkdir(parents=True)
    dest.write_text('{"tiles":[["keep"]],"description":"KEEP"}\n', encoding="utf-8")
    ensure_test_profiles(env=env)
    body = json.loads(dest.read_text(encoding="utf-8"))
    assert body["tiles"] == [["keep"]]
    assert body["description"] == "KEEP"


def test_smoke_script_argv_points_at_this_file() -> None:
    argv = smoke_script_argv()
    assert argv[0] == sys.executable
    assert Path(argv[1]).name == "nest_layout_ws_campaign.py"
    assert Path(argv[1]).is_file()


def test_hoist_smoke_layout_ws_monitors() -> None:
    from test_cli import _NESTED_ACTIONS
    from test_cli import hoist_nested_action_flags as hoist

    assert "smoke-layout-ws" in _NESTED_ACTIONS
    argv = ["nested", "smoke-layout-ws", "--monitors=2"]
    assert hoist(argv) == ["nested", "--monitors=2", "smoke-layout-ws"]


def test_forge_test_help_mentions_layout_ws() -> None:
    import cli_ansi
    import test_cli

    cli_ansi.set_color_mode("never")
    buf = io.StringIO()
    test_cli.print_forge_test_help(stream=buf)
    text = buf.getvalue()
    assert "smoke-layout-ws" in text
    assert "nest_layout_ws_campaign" in text


def test_activate_workspace_js_creates_and_activates() -> None:
    js = build_activate_workspace_js(1)
    assert "append_new_workspace" in js
    assert "activate" in js
    assert "1" in js
    assert "import " not in js


def test_get_tree_options_json_workspace_filter() -> None:
    assert get_tree_options_json() == "{}"
    assert get_tree_options_json(workspace=None) == "{}"
    assert json.loads(get_tree_options_json(workspace=1)) == {"workspace": 1}
    assert json.loads(get_tree_options_json(workspace=0)) == {"workspace": 0}


def test_profile_b_is_dual_mon_one_each() -> None:
    assert PROFILE_B_BODY["tiles"] == [["ghostty"], ["ghostty"]]
    assert PROFILE_B_BODY["focus"] == ["ghostty", 1]


def test_ghostty_argv_forces_multi_instance() -> None:
    argv = ghostty_argv()
    if argv is None:
        pytest.skip("ghostty not on PATH")
    assert "--gtk-single-instance=false" in argv


def test_seed_ghostty_tiles_accepts_workspace_kw() -> None:
    import inspect

    sig = inspect.signature(seed_ghostty_tiles)
    assert "workspace" in sig.parameters
