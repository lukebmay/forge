"""Unit tests for nest WS2 occupied 2-slot smoke (no live gnome-shell)."""

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
_SCRIPT = _FORGE_CLI / "nest_layout_occupied_smoke.py"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nest_layout_occupied_smoke import (  # noqa: E402
    DEFAULT_DEST_MONITOR,
    DEFAULT_PROFILE,
    DEFAULT_WORKSPACE,
    ENTRY,
    CampaignError,
    assert_occupied_shape,
    build_parser,
    campaign_plan,
    cmd_from_env,
    ensure_occupied_profile,
    hv_window_children,
    is_nautilus_win,
    layout_failure_reason,
    parse_argv,
    profile_body,
    refuse_personal_profile,
    smoke_script_argv,
)


def _good_forest() -> dict:
    return {
        "apiVersion": 2,
        "activeWorkspace": 1,
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
                    },
                    {
                        "nodeType": "WINDOW",
                        "windowId": 33,
                        "wmClass": "org.gnome.Nautilus",
                        "mode": "TILE",
                    },
                ],
            },
        ],
    }


def _ph_leftover_forest() -> dict:
    forest = _good_forest()
    forest["monitors"][1]["children"][0] = {
        "nodeType": "WINDOW",
        "windowId": "forge-ph-ghostty",
        "wmClass": "forge-placeholder",
        "placeholder": True,
        "layoutRole": "ghostty",
        "mode": "TILE",
    }
    return forest


def test_parser_defaults_and_help() -> None:
    ns = parse_argv([])
    assert ns.profile == DEFAULT_PROFILE
    assert ns.dest_monitor == DEFAULT_DEST_MONITOR == 1
    assert ns.workspace == DEFAULT_WORKSPACE == 1
    assert ns.dry_run is False
    text = build_parser().format_help()
    assert "--monitors=2" in text
    assert "_forge-test-occupied-2slot" in text
    assert "open-miss" in text
    assert "WS2" in text or "workspace" in text
    assert "dev/t1" in text or "personal" in text or "vinyl" in text
    assert ENTRY in text or "nest_layout_occupied_smoke.py" in text
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
    assert "--monitors=2" in proc.stdout
    assert "_forge-test-occupied-2slot" in proc.stdout
    assert "smoke-layout-occupied" in proc.stdout or "nest_layout_occupied" in proc.stdout


def test_version_subprocess() -> None:
    proc = subprocess.run(
        [sys.executable, str(_SCRIPT), "--version"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0
    assert "nest_layout_occupied_smoke.py" in proc.stdout


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
    assert "_forge-test-occupied-2slot" in out
    assert "WS2" in out or "workspace" in out
    assert "open-miss" in out or "PlaceNext" in out or "second" in out.lower()


def test_dry_run_json_structure() -> None:
    ns = parse_argv(["--dry-run", "--json"])
    plan = campaign_plan(ns)
    assert plan["ok"] is True
    assert plan["dryRun"] is True
    assert plan["profile"] == DEFAULT_PROFILE
    assert plan["destMonitor"] == 1
    assert plan["workspace"] == 1
    assert plan["monitors"] == 2
    assert "nest_layout_occupied_smoke.py" in plan["entry"]
    joined = " ".join(plan["steps"])
    assert "WS2" in joined or "workspace" in joined.lower()
    assert "second" in joined.lower()
    assert "open-miss" in joined


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
    with pytest.raises(CampaignError, match="_forge-test"):
        refuse_personal_profile("vinyl")
    assert refuse_personal_profile(DEFAULT_PROFILE) == DEFAULT_PROFILE


def test_good_forest_oracles() -> None:
    forest = _good_forest()
    assert_occupied_shape(forest, second_match=is_nautilus_win, stage="unit")
    wins = hv_window_children(forest["monitors"][1])
    assert len(wins) == 2
    assert is_nautilus_win(wins[1])


def test_placeholder_leftover_fails() -> None:
    with pytest.raises(CampaignError, match="leftover PH"):
        assert_occupied_shape(
            _ph_leftover_forest(), second_match=is_nautilus_win, stage="unit"
        )


def test_tabbed_mon1_fails() -> None:
    forest = _good_forest()
    forest["monitors"][1]["children"] = [
        {
            "nodeType": "CON",
            "layout": "TABBED",
            "children": forest["monitors"][1]["children"],
        }
    ]
    with pytest.raises(CampaignError, match="TABBED"):
        assert_occupied_shape(forest, second_match=is_nautilus_win, stage="unit")


def test_layout_failure_reason_open_miss() -> None:
    assert layout_failure_reason(0, "forge layout: ok") is None
    reason = layout_failure_reason(1, "metric apply ok=false phase=open reason=open-miss")
    assert reason is not None
    assert "open-miss" in reason
    dest = layout_failure_reason(
        1, "open PlaceNext dest failed role=ghostty: apply PlaceNext dest must be slot/PH"
    )
    assert dest is not None
    assert "PlaceNext dest failed" in dest or "slot/PH" in dest
    assert layout_failure_reason(1, "required TILE slot(s) not in-slot: mon1") is None


def test_second_role_prefers_eog_skips_calculator() -> None:
    from nest_layout_occupied_smoke import second_role_candidates

    tokens = [c["token"] for c in second_role_candidates()]
    assert tokens[0] == "eog"
    assert "org.gnome.Calculator" not in tokens
    assert "org.gnome.TextEditor" in tokens


def test_profile_body_two_class_hsplit() -> None:
    body = profile_body("nautilus")
    assert body["tiles"] == [["ghostty"], ["eog", "nautilus"]]
    assert "FORGE TEST" in body["description"]
    eog = profile_body("eog")
    assert eog["tiles"] == [["ghostty"], ["org.gnome.TextEditor", "eog"]]


def test_ensure_occupied_profile_creates_missing(tmp_path: Path) -> None:
    env = {
        **os.environ,
        "FORGE_LAYOUT_DIR": str(tmp_path),
        "FORGE_HOST": "unit-sub-forge",
    }
    env.pop("FORGE_LAYOUT_PATH", None)
    result = ensure_occupied_profile(env=env, second_role="nautilus")
    assert result["created"] is True
    dest = tmp_path / "common" / f"{DEFAULT_PROFILE}.json"
    assert dest.is_file()
    body = json.loads(dest.read_text(encoding="utf-8"))
    assert body["tiles"] == [["ghostty"], ["eog", "nautilus"]]
    again = ensure_occupied_profile(env=env, second_role="nautilus")
    assert again["created"] is False


def test_ensure_refreshes_second_role(tmp_path: Path) -> None:
    env = {
        **os.environ,
        "FORGE_LAYOUT_DIR": str(tmp_path),
        "FORGE_HOST": "unit-sub-forge",
    }
    env.pop("FORGE_LAYOUT_PATH", None)
    dest = tmp_path / "common" / f"{DEFAULT_PROFILE}.json"
    dest.parent.mkdir(parents=True)
    dest.write_text(
        json.dumps(
            {
                "tiles": [["ghostty"], ["eog", "nautilus"]],
                "description": "FORGE TEST occupied 2-slot stale",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    result = ensure_occupied_profile(env=env, second_role="org.gnome.Calculator")
    assert result["refreshed"] is True
    body = json.loads(dest.read_text(encoding="utf-8"))
    assert body["tiles"] == [["ghostty"], ["eog", "org.gnome.Calculator"]]


def test_smoke_script_argv_points_at_this_file() -> None:
    argv = smoke_script_argv()
    assert argv[0] == sys.executable
    assert Path(argv[1]).name == "nest_layout_occupied_smoke.py"
    assert Path(argv[1]).is_file()


def test_hoist_smoke_layout_occupied_monitors() -> None:
    from test_cli import _NESTED_ACTIONS
    from test_cli import hoist_nested_action_flags as hoist

    assert "smoke-layout-occupied" in _NESTED_ACTIONS
    argv = ["nested", "smoke-layout-occupied", "--monitors=2"]
    assert hoist(argv) == ["nested", "--monitors=2", "smoke-layout-occupied"]


def test_forge_test_help_mentions_layout_occupied() -> None:
    import cli_ansi
    import test_cli

    cli_ansi.set_color_mode("never")
    buf = io.StringIO()
    test_cli.print_forge_test_help(stream=buf)
    text = buf.getvalue()
    assert "smoke-layout-occupied" in text
    assert "nest_layout_occupied" in text
