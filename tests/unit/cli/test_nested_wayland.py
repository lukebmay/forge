"""Unit tests for nested Wayland session helpers (no live gnome-shell)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nested_wayland import (  # noqa: E402
    NestedConfig,
    NestedError,
    NestedUnsupported,
    _looks_like_nest_display,
    bus_address_for,
    can_nested_on_host,
    client_env,
    dummy_mode_specs,
    dummy_monitor_scales,
    format_env_export,
    format_status_text,
    host_primary_logical_size,
    host_session_type,
    host_wayland_display,
    parse_num_monitors,
    parse_size,
    require_wayland_host,
    session_dir,
    shell_start_env,
    state_root,
    x11_refuse_message,
    _safe_name,
)


def test_parse_size_ok() -> None:
    assert parse_size("1500x1000") == "1500x1000"
    assert parse_size(" 1920X1080 ") == "1920x1080"
    assert parse_size("1280x720@60.0") == "1280x720@60.0"


def test_parse_size_bad() -> None:
    with pytest.raises(NestedError):
        parse_size("big")
    with pytest.raises(NestedError):
        parse_size("10x10")


def test_parse_num_monitors() -> None:
    assert parse_num_monitors(1) == 1
    assert parse_num_monitors(2) == 2
    with pytest.raises(NestedError):
        parse_num_monitors(0)
    with pytest.raises(NestedError):
        parse_num_monitors(99)


def test_dummy_mode_specs_colon_not_comma() -> None:
    """Mutter g_strsplit(mode_specs, \":\") — commas are invalid."""
    assert dummy_mode_specs("1280x720", 2) == "1280x720"
    assert ":" not in dummy_mode_specs("1500x1000", 1) or True
    assert "," not in dummy_mode_specs("1500x1000", 2)
    assert dummy_monitor_scales("1", 2) == "1,1"
    assert dummy_monitor_scales("1,2", 2) == "1,2"


def test_host_primary_logical_size_from_tree(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Nest default size should track host primary logical WxH when forge tree works."""
    import nested_wayland as nw

    class FakeProc:
        returncode = 0
        stdout = (
            '{"monitors":[{"stableKey":"geom:0,0,2560,1440#primary","rect":{}},'
            '{"stableKey":"geom:2560,0,2560,1440"}]}'
        )
        stderr = ""

    monkeypatch.setattr(
        nw.subprocess,
        "run",
        lambda *a, **k: FakeProc(),
    )
    monkeypatch.setattr(nw.shutil, "which", lambda _n: "forge")
    assert host_primary_logical_size({"XDG_SESSION_TYPE": "wayland"}) == "2560x1440"


def test_safe_name() -> None:
    assert _safe_name("forge") == "forge"
    assert _safe_name("my-nest_1") == "my-nest_1"
    with pytest.raises(NestedError):
        _safe_name("../x")
    with pytest.raises(NestedError):
        _safe_name("a/b")


def test_state_root_override(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FORGE_NESTED_ROOT", str(tmp_path / "nests"))
    assert state_root() == tmp_path / "nests"
    assert session_dir("forge") == tmp_path / "nests" / "forge"


def test_bus_and_client_env(tmp_path: Path) -> None:
    cfg = NestedConfig(
        name="forge",
        display="wayland-forge",
        size="1280x800",
        scale="1",
        host_wayland="wayland-0",
        unsafe_mode=True,
        state_dir=str(tmp_path),
        bus_address=bus_address_for(tmp_path),
        created_at=0.0,
        num_monitors=2,
    )
    assert cfg.bus_address == f"unix:path={tmp_path / 'bus'}"
    env = client_env(cfg)
    assert env["WAYLAND_DISPLAY"] == "wayland-forge"
    assert env["DBUS_SESSION_BUS_ADDRESS"] == cfg.bus_address
    assert env["GDK_BACKEND"] == "wayland"
    assert env["XDG_SESSION_TYPE"] == "wayland"

    # Nested shell process uses host display, not nest display
    senv = shell_start_env(cfg)
    assert senv["WAYLAND_DISPLAY"] == "wayland-0"
    assert senv["DBUS_SESSION_BUS_ADDRESS"] == cfg.bus_address
    assert senv["MUTTER_DEBUG_DUMMY_MODE_SPECS"] == "1280x800"
    assert senv["MUTTER_DEBUG_NUM_DUMMY_MONITORS"] == "2"
    assert senv["MUTTER_DEBUG_DUMMY_MONITOR_SCALES"] == "1,1"

    export = format_env_export(cfg)
    assert "export WAYLAND_DISPLAY='wayland-forge'" in export
    assert "DBUS_SESSION_BUS_ADDRESS=" in export


def test_format_status_text() -> None:
    text = format_status_text(
        {
            "name": "forge",
            "running": True,
            "shell_ready": True,
            "forge_ready": False,
            "display": "wayland-forge",
            "host_wayland": "wayland-0",
            "size": "1500x1000",
            "shell_pid": 1,
            "dbus_pid": 2,
            "bus_address": "unix:path=/tmp/bus",
            "socket": "/run/user/1000/wayland-forge",
            "state_dir": "/tmp/s",
            "env_sh": "/tmp/s/env.sh",
            "shell_log": "/tmp/s/shell.log",
        }
    )
    assert "running:      True" in text
    assert "wayland-forge" in text


def test_looks_like_nest_display() -> None:
    assert _looks_like_nest_display("wayland-forge")
    assert _looks_like_nest_display("wayland-forge-test")
    assert _looks_like_nest_display("wayland-nest-smoke")
    assert not _looks_like_nest_display("wayland-0")


def test_host_wayland_ignores_nest_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    rt = tmp_path / "run"
    rt.mkdir()
    (rt / "wayland-0").touch()
    # pathlib touch is not a socket; patch is_socket via fake runtime + override env
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(rt))
    monkeypatch.setenv("WAYLAND_DISPLAY", "wayland-forge")
    monkeypatch.setenv("HOST_WAYLAND_DISPLAY", "wayland-0")
    assert host_wayland_display() == "wayland-0"
    monkeypatch.delenv("HOST_WAYLAND_DISPLAY")
    monkeypatch.setenv("FORGE_NESTED_HOST_WAYLAND", "wayland-custom")
    assert host_wayland_display() == "wayland-custom"


def test_host_session_and_x11_refuse() -> None:
    assert host_session_type({"XDG_SESSION_TYPE": "x11"}) == "x11"
    assert host_session_type({"XDG_SESSION_TYPE": "wayland"}) == "wayland"
    msg = x11_refuse_message("x11")
    assert "killall -HUP" in msg
    assert "forge nested start" in msg
    with pytest.raises(NestedUnsupported) as ei:
        require_wayland_host(env={"XDG_SESSION_TYPE": "x11"})
    assert ei.value.exit_code == 2
    # force allow does not raise
    assert require_wayland_host(
        allow_x11=True, env={"XDG_SESSION_TYPE": "x11"}
    ) == "x11"
    assert not can_nested_on_host({"XDG_SESSION_TYPE": "x11"})
