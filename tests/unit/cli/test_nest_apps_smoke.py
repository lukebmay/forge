"""Unit tests for nest-apps smoke isolation helpers (no live gnome-shell)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nest_apps_smoke import (  # noqa: E402
    assert_nest_client_environ,
    parse_proc_environ,
    pid_from_window,
)
from nest_invoke import require_nest_client_env  # noqa: E402
from nest_layout_dnd_smoke import CampaignError  # noqa: E402


def test_parse_proc_environ_nest_keys() -> None:
    raw = (
        b"WAYLAND_DISPLAY=wayland-forge\0"
        b"XDG_RUNTIME_DIR=/home/u/.local/state/forge/nested/forge/runtime\0"
        b"DISPLAY=\0"
        b"PATH=/usr/bin\0"
    )
    env = parse_proc_environ(raw)
    assert env["WAYLAND_DISPLAY"] == "wayland-forge"
    assert "nested" in env["XDG_RUNTIME_DIR"]
    assert env["DISPLAY"] == ""


def test_assert_nest_client_environ_refuses_host() -> None:
    with pytest.raises(CampaignError, match="host"):
        assert_nest_client_environ(
            {"WAYLAND_DISPLAY": "wayland-0", "XDG_RUNTIME_DIR": "/run/user/1000"},
            what="ghostty",
        )
    with pytest.raises(CampaignError, match="nest-scoped"):
        assert_nest_client_environ(
            {
                "WAYLAND_DISPLAY": "wayland-forge",
                "XDG_RUNTIME_DIR": "/run/user/1000",
            },
            what="nautilus",
        )
    assert_nest_client_environ(
        {
            "WAYLAND_DISPLAY": "wayland-forge",
            "XDG_RUNTIME_DIR": "/tmp/nested/forge/runtime",
        },
        what="ok",
    )
    assert_nest_client_environ(
        {
            "WAYLAND_DISPLAY": "",
            "XDG_RUNTIME_DIR": "/tmp/nested/forge/runtime",
        },
        what="chrome-zygote",
    )
    assert_nest_client_environ(
        {"WAYLAND_DISPLAY": "", "XDG_RUNTIME_DIR": ""},
        what="chrome-sandbox",
    )


def test_pid_from_window() -> None:
    assert pid_from_window({"pid": 4242}) == 4242
    assert pid_from_window({"pid": "99"}) == 99
    assert pid_from_window({"pid": 0}) is None
    assert pid_from_window({}) is None


def test_require_nest_used_by_apps_smoke() -> None:
    from nest_apps_smoke import _require_nest

    with pytest.raises(CampaignError, match="FORGE_CONFIG_HOME"):
        _require_nest({"WAYLAND_DISPLAY": "wayland-0"})
    _require_nest(
        {
            "FORGE_CONFIG_HOME": "/tmp/nested/forge/forge-config",
            "WAYLAND_DISPLAY": "wayland-forge",
            "XDG_RUNTIME_DIR": "/tmp/nested/forge/runtime",
        }
    )
    require_nest_client_env(
        {
            "FORGE_CONFIG_HOME": "/tmp/nested/forge/forge-config",
            "WAYLAND_DISPLAY": "wayland-forge",
            "XDG_RUNTIME_DIR": "/tmp/nested/forge/runtime",
        },
        what="t",
    )
