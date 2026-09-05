"""Unit tests for nest close-reflow smoke helpers (no live gnome-shell)."""

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
_SCRIPT = _FORGE_CLI / "nest_close_reflow_smoke.py"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nest_close_reflow_smoke import (  # noqa: E402
    CAMPAIGN_STEPS,
    ENTRY,
    SEED_N,
    build_parser,
    campaign_plan,
    cmd_from_env,
    parse_argv,
    smoke_script_argv,
)
from nest_proof import (  # noqa: E402
    ShareError,
    assert_no_placeholders,
    assert_seed_three,
    assert_sibling_percents_half,
    assert_siblings_fill_half,
    assert_split_percents_half,
    placeholder_nodes,
)


def _win(
    wid: object,
    width: float,
    *,
    x: float = 0.0,
    height: float = 1080.0,
    percent: float | None = None,
    title: str = "",
    wm_class: str = "com.mitchellh.ghostty",
    placeholder: bool = False,
) -> dict:
    out = {
        "windowId": wid,
        "nodeType": "WINDOW",
        "mode": "TILE",
        "wmClass": wm_class,
        "title": title,
        "rect": {"x": x, "y": 0, "width": width, "height": height},
    }
    if percent is not None:
        out["percent"] = percent
    if placeholder:
        out["placeholder"] = True
    return out


MON = {"x": 0.0, "y": 0.0, "width": 1920.0, "height": 1080.0}


def test_parser_defaults_and_help() -> None:
    ns = parse_argv([])
    assert ns.dry_run is False
    assert ns.skip_tab_share is False
    text = build_parser().format_help()
    assert "--dry-run" in text
    assert "--version" in text
    assert "--skip-tab-share" in text
    assert ENTRY in text or "smoke-close-reflow" in text
    assert "1/2" in text or "1/3" in text


def test_help_subprocess() -> None:
    proc = subprocess.run(
        [sys.executable, str(_SCRIPT), "--help"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0
    assert "smoke-close-reflow" in proc.stdout or "nest_close_reflow_smoke.py" in proc.stdout
    assert "--dry-run" in proc.stdout


def test_version_subprocess() -> None:
    proc = subprocess.run(
        [sys.executable, str(_SCRIPT), "--version"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0
    assert "nest_close_reflow_smoke.py" in proc.stdout


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
    assert "3" in out
    assert "close" in out.lower()
    assert "1/2" in out or "1/3" in out


def test_dry_run_json_structure() -> None:
    ns = parse_argv(["--dry-run", "--json"])
    plan = campaign_plan(ns)
    assert plan["ok"] is True
    assert plan["dryRun"] is True
    assert plan["seed"] == SEED_N == 3
    assert plan["monitors"] == 1
    assert plan["entry"] == ENTRY
    assert any("close" in s.lower() for s in plan["steps"])
    assert any("TABBED" in s or "tab" in s.lower() for s in plan["steps"])
    assert len(CAMPAIGN_STEPS) >= 5


def test_dry_run_json_cmd(capsys) -> None:
    rc = cmd_from_env(["--dry-run", "--json"])
    assert rc == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["entry"] == ENTRY
    assert payload["seed"] == 3


def test_skip_tab_share_plan() -> None:
    ns = parse_argv(["--skip-tab-share", "--dry-run"])
    plan = campaign_plan(ns)
    assert plan["skipTabShare"] is True
    joined = " ".join(plan["steps"])
    assert "CENTER" not in joined
    assert "CTS tab" not in joined


def test_smoke_script_argv() -> None:
    argv = smoke_script_argv()
    assert argv[0] == sys.executable
    assert Path(argv[1]).name == "nest_close_reflow_smoke.py"
    assert Path(argv[1]).is_file()


def test_entry_mentions_forge_test() -> None:
    assert "forge-test nested smoke-close-reflow" in ENTRY
    assert SEED_N == 3


def test_seed_three_ok() -> None:
    wins = [
        _win(1, 640, percent=1 / 3),
        _win(2, 640, x=640, percent=1 / 3),
        _win(3, 640, x=1280, percent=1 / 3),
    ]
    out = assert_seed_three(wins, MON, stage="seed-3")
    assert out["thirds"] is True
    assert len(out["ids"]) == 3


def test_seed_three_rejects_count() -> None:
    with pytest.raises(ShareError, match="want 3"):
        assert_seed_three([_win(1, 960), _win(2, 960, x=960)], MON, stage="seed-3")


def test_percent_half_and_stuck_third() -> None:
    ok = [_win(1, 960, percent=0.5), _win(2, 960, x=960, percent=0.5)]
    out = assert_sibling_percents_half(ok, stage="t")
    assert out["skipped"] is False
    stuck = [_win(1, 960, percent=0.33), _win(2, 960, x=960, percent=0.33)]
    with pytest.raises(ShareError, match="1/3 percent"):
        assert_sibling_percents_half(stuck, stage="close-reflow")


def test_percent_skipped_when_unset() -> None:
    wins = [_win(1, 960), _win(2, 960, x=960)]
    out = assert_sibling_percents_half(wins, stage="t")
    assert out["skipped"] is True


def test_fill_half_rect_ok_when_inner_percent_is_one() -> None:
    wins = [_win(1, 960, percent=0.5), _win(2, 960, x=960, percent=1.0)]
    out = assert_siblings_fill_half(wins, MON, stage="close-reflow", closed_id="9")
    assert out["axis"] == "hsplit"


def test_split_percents_half_on_monitor_kids() -> None:
    forest = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "children": [
                    _win(1, 960, percent=0.5),
                    _win(2, 960, x=960, percent=0.5),
                ],
            }
        ]
    }
    out = assert_split_percents_half(forest, stage="close-reflow")
    assert out["percents"] == [0.5, 0.5]


def test_placeholders_forge_ph() -> None:
    forest = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "children": [
                    _win(1, 960, percent=0.5),
                    _win("forge-ph-ghostty", 960, x=960, title="forge-ph:0:ghostty"),
                ],
            }
        ]
    }
    hits = placeholder_nodes(forest)
    assert hits
    with pytest.raises(ShareError, match="forge-ph"):
        assert_no_placeholders(forest, stage="after-close")
    clean = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "children": [
                    _win(1, 960, percent=0.5),
                    _win(2, 960, x=960, percent=0.5),
                ],
            }
        ]
    }
    assert_no_placeholders(clean, stage="after-close")


def test_hoist_smoke_close_reflow() -> None:
    from test_cli import _NESTED_ACTIONS
    from test_cli import hoist_nested_action_flags as hoist

    assert "smoke-close-reflow" in _NESTED_ACTIONS
    argv = ["nested", "smoke-close-reflow", "--monitors=1"]
    assert hoist(argv) == ["nested", "--monitors=1", "smoke-close-reflow"]


def test_forge_test_help_mentions_close_reflow() -> None:
    import cli_ansi
    import test_cli

    cli_ansi.set_color_mode("never")
    buf = io.StringIO()
    test_cli.print_forge_test_help(stream=buf)
    text = buf.getvalue()
    assert "smoke-close-reflow" in text


def test_parser_accepts_smoke_close_reflow() -> None:
    import test_cli

    parser = test_cli.build_parser()
    args = parser.parse_args(["nested", "smoke-close-reflow"])
    assert args.nested_action == "smoke-close-reflow"
    args = parser.parse_args(["nested", "--monitors", "1", "smoke-close-reflow"])
    assert args.nested_action == "smoke-close-reflow"
    assert args.monitors == 1
