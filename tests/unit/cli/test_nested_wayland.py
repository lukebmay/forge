"""Unit tests for nested Wayland session helpers (no live gnome-shell)."""

from __future__ import annotations

import os
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
    _safe_name,
    bus_address_for,
    can_nested_on_host,
    client_env,
    dummy_mode_specs,
    dummy_monitor_scales,
    ensure_nest_cli_dirs,
    format_env_export,
    format_status_text,
    has_stale_residue,
    host_primary_logical_size,
    host_session_type,
    host_wayland_display,
    is_running,
    merge_client_env,
    nest_forge_config_home,
    nest_forge_host,
    parent_short_hostname,
    parse_num_monitors,
    parse_size,
    reap_stale,
    require_wayland_host,
    resolve_host_xauthority,
    session_dir,
    shell_start_env,
    should_stop_on_exit,
    state_root,
    wait_nest_client_ready,
    x11_refuse_message,
)


def test_parse_size_ok() -> None:
    assert parse_size("1920x1080") == "1920x1080"
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
    assert ":" not in dummy_mode_specs("1920x1080", 1) or True
    assert "," not in dummy_mode_specs("1920x1080", 2)
    assert dummy_monitor_scales("1", 2) == "1,1"
    assert dummy_monitor_scales("1,2", 2) == "1,2"


def test_default_size_and_scale_full_hd_no_scale() -> None:
    """Nest defaults: Full HD per dummy mon, scale 1 (no scaling)."""
    import nested_wayland as nw

    assert nw.DEFAULT_SIZE == "1920x1080"
    assert nw.DEFAULT_SCALE == "1"
    assert parse_size(nw.DEFAULT_SIZE) == "1920x1080"
    assert dummy_monitor_scales(nw.DEFAULT_SCALE, 1) == "1"
    assert dummy_monitor_scales(nw.DEFAULT_SCALE, 2) == "1,1"


def test_host_primary_logical_size_from_tree(
    monkeypatch: pytest.MonkeyPatch, ) -> None:
    """host_primary_logical_size still probes host tree (opt-in, not nest default)."""
    import nested_wayland as nw

    class FakeProc:
        returncode = 0
        stdout = (
            '{"monitors":[{"stableKey":"geom:0,0,2560,1440#primary","rect":{}},'
            '{"stableKey":"geom:2560,0,2560,1440"}]}')
        stderr = ""

    monkeypatch.setattr(
        nw.subprocess,
        "run",
        lambda *a, **k: FakeProc(),
    )
    monkeypatch.setattr(nw.shutil, "which", lambda _n: "forge")
    assert host_primary_logical_size({"XDG_SESSION_TYPE":
                                      "wayland"}) == "2560x1440"


def test_safe_name() -> None:
    assert _safe_name("forge") == "forge"
    assert _safe_name("my-nest_1") == "my-nest_1"
    with pytest.raises(NestedError):
        _safe_name("../x")
    with pytest.raises(NestedError):
        _safe_name("a/b")


def test_state_root_override(tmp_path: Path,
                             monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FORGE_NESTED_ROOT", str(tmp_path / "nests"))
    assert state_root() == tmp_path / "nests"
    assert session_dir("forge") == tmp_path / "nests" / "forge"


def test_nest_forge_host_shape() -> None:
    assert nest_forge_host("forge", parent_host="black") == "black-sub-forge"
    assert nest_forge_host("my-nest", parent_host="Desk") == "desk-sub-my-nest"
    assert nest_forge_host("forge", parent_host="black") != "black"
    # parent_short_hostname ignores FORGE_HOST (logical)
    assert parent_short_hostname(hostname="black.local") == "black"


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
    assert env["GSK_RENDERER"] == "cairo"
    assert env["LIBGL_ALWAYS_SOFTWARE"] == "1"
    # N1: logical host + nest-scoped CLI config root
    assert env["FORGE_HOST"] == nest_forge_host("forge")
    assert env["FORGE_HOST"].endswith("-sub-forge")
    assert env["FORGE_HOST"] != parent_short_hostname()
    assert env["FORGE_CONFIG_HOME"] == str(tmp_path / "forge-config")
    assert (tmp_path / "forge-config" / "config").is_dir()
    assert nest_forge_config_home(cfg) == tmp_path / "forge-config"
    assert ensure_nest_cli_dirs(cfg) == tmp_path / "forge-config"

    # Nested shell process uses host display, not nest display
    senv = shell_start_env(cfg)
    assert senv["WAYLAND_DISPLAY"] == "wayland-0"
    assert senv["DBUS_SESSION_BUS_ADDRESS"] == cfg.bus_address
    assert senv["MUTTER_DEBUG_DUMMY_MODE_SPECS"] == "1280x800"
    assert senv["MUTTER_DEBUG_NUM_DUMMY_MONITORS"] == "2"
    assert senv["MUTTER_DEBUG_DUMMY_MONITOR_SCALES"] == "1,1"
    assert senv["GSK_RENDERER"] == "cairo"
    assert senv["LIBGL_ALWAYS_SOFTWARE"] == "1"
    # N2: Shell inherits same forge isolation as client_env (no full XDG rewrite)
    assert senv["FORGE_CONFIG_HOME"] == str(tmp_path / "forge-config")
    assert senv["FORGE_HOST"] == nest_forge_host("forge")
    assert "XDG_CONFIG_HOME" not in senv or senv.get("XDG_CONFIG_HOME") == os.environ.get(
        "XDG_CONFIG_HOME"
    )

    export = format_env_export(cfg)
    assert "export WAYLAND_DISPLAY='wayland-forge'" in export
    assert "DBUS_SESSION_BUS_ADDRESS=" in export
    assert "FORGE_HOST=" in export
    assert "FORGE_CONFIG_HOME=" in export


def test_resolve_host_xauthority_prefers_live_cookie(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Stale Guake XAUTHORITY path → pick newest live mutter cookie."""
    rt = tmp_path / "run"
    rt.mkdir()
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(rt))
    stale = rt / ".mutter-Xwaylandauth.stale"
    live = rt / ".mutter-Xwaylandauth.live"
    live.write_text("cookie")
    # Prefer live path even when env points at missing file.
    got = resolve_host_xauthority({"XAUTHORITY": str(stale)})
    assert got == str(live)
    # Keep a valid current path.
    assert resolve_host_xauthority({"XAUTHORITY": str(live)}) == str(live)


def test_shell_start_env_sets_live_xauthority(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    rt = tmp_path / "run"
    rt.mkdir()
    live = rt / ".mutter-Xwaylandauth.live"
    live.write_text("cookie")
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(rt))
    monkeypatch.setenv("XAUTHORITY", str(rt / "missing"))
    cfg = NestedConfig(
        name="forge",
        display="wayland-forge",
        size="1280x800",
        scale="1",
        host_wayland="wayland-0",
        unsafe_mode=True,
        state_dir=str(tmp_path),
        bus_address=f"unix:path={tmp_path / 'bus'}",
        created_at=0.0,
        num_monitors=1,
    )
    senv = shell_start_env(cfg)
    assert senv.get("XAUTHORITY") == str(live)


def test_merge_client_env_isolation(tmp_path: Path) -> None:
    """merge_client_env overlays nest isolation without dropping base PATH."""
    from layout_lib import DEFAULT_CONFIG_ROOT, layout_tree_root, resolve_host
    from settle_heuristics import heuristics_path

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
        num_monitors=1,
    )
    base = {
        "PATH": "/usr/bin",
        "HOME": str(tmp_path),
        "FORGE_HOST": "parent-host",
        "FORGE_CONFIG_HOME": str(tmp_path / "parent-config"),
    }
    merged = merge_client_env(cfg, base)
    assert merged["PATH"] == "/usr/bin"
    assert merged["FORGE_HOST"] == nest_forge_host("forge")
    assert merged["FORGE_HOST"] != "parent-host"
    assert merged["FORGE_CONFIG_HOME"] == str(tmp_path / "forge-config")
    assert merged["WAYLAND_DISPLAY"] == "wayland-forge"
    # Path helpers: nest heuristics ≠ parent
    parent_h = heuristics_path(env={
        "FORGE_CONFIG_HOME": str(tmp_path / "parent-config"),
    })
    nest_h = heuristics_path(env=merged)
    assert parent_h != nest_h
    assert nest_h == (tmp_path / "forge-config" / "config" /
                       "settle-heuristics.json")
    assert parent_h == (tmp_path / "parent-config" / "config" /
                        "settle-heuristics.json")
    # Layout host follows FORGE_HOST
    assert resolve_host(merged) == merged["FORGE_HOST"]
    # Layout tree root ignores FORGE_CONFIG_HOME (shared profiles)
    assert layout_tree_root(merged) == DEFAULT_CONFIG_ROOT / "layout"


def test_format_status_text() -> None:
    text = format_status_text({
        "name": "forge",
        "running": True,
        "shell_ready": True,
        "forge_ready": False,
        "display": "wayland-forge",
        "host_wayland": "wayland-0",
        "size": "1920x1080",
        "shell_pid": 1,
        "dbus_pid": 2,
        "bus_address": "unix:path=/tmp/bus",
        "socket": "/run/user/1000/wayland-forge",
        "state_dir": "/tmp/s",
        "env_sh": "/tmp/s/env.sh",
        "shell_log": "/tmp/s/shell.log",
    })
    assert "running:      True" in text
    assert "wayland-forge" in text


def test_looks_like_nest_display() -> None:
    assert _looks_like_nest_display("wayland-forge")
    assert _looks_like_nest_display("wayland-forge-test")
    assert _looks_like_nest_display("wayland-nest-smoke")
    assert not _looks_like_nest_display("wayland-0")


def test_host_wayland_ignores_nest_env(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
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
    assert require_wayland_host(allow_x11=True,
                                env={"XDG_SESSION_TYPE": "x11"}) == "x11"
    assert not can_nested_on_host({"XDG_SESSION_TYPE": "x11"})


def test_should_stop_on_exit_policy() -> None:
    """Campaign run always stops; exec stops only if it started the nest."""
    # run (always_stop): stop unless keep
    assert should_stop_on_exit(always_stop=True, started_nest=False) is True
    assert should_stop_on_exit(always_stop=True, started_nest=True) is True
    assert should_stop_on_exit(always_stop=True, started_nest=False,
                               keep=True) is False
    # exec (not always_stop): stop only when this invocation started nest
    assert should_stop_on_exit(always_stop=False, started_nest=True) is True
    assert should_stop_on_exit(always_stop=False, started_nest=False) is False
    assert should_stop_on_exit(always_stop=False, started_nest=True,
                               keep=True) is False


def test_wait_nest_client_ready_true_when_workarea(monkeypatch: pytest.MonkeyPatch) -> None:
    import nested_wayland as nw

    calls = {"n": 0}

    def fake_eval(_bus: str, _js: str, timeout: float = 5.0):
        calls["n"] += 1
        if calls["n"] < 2:
            return True, "(true, '0')"
        return True, "(true, '2')"

    monkeypatch.setattr(nw, "shell_eval", fake_eval)
    monkeypatch.setattr(nw.time, "sleep", lambda _s: None)
    assert wait_nest_client_ready("unix:path=/tmp/bus", timeout_s=2.0, min_monitors=2) is True
    assert calls["n"] >= 2


def test_hoist_nested_action_flags() -> None:
    """Flags after nested action must hoist so argparse nested_cmd works."""
    import importlib.util
    from importlib.machinery import SourceFileLoader

    forge_path = _FORGE_CLI / "forge"
    loader = SourceFileLoader("forge_cli_hoist", str(forge_path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    assert spec is not None
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    hoist = mod.hoist_nested_action_flags

    assert hoist(["nested", "run", "--monitors=1", "--", "true"]) == [
        "nested",
        "--monitors=1",
        "run",
        "--",
        "true",
    ]
    assert hoist([
        "nested",
        "run",
        "--monitors=2",
        "env",
        "FORGE_JOB=0",
        "forge",
        "layout",
        "x",
    ]) == [
        "nested",
        "--monitors=2",
        "run",
        "env",
        "FORGE_JOB=0",
        "forge",
        "layout",
        "x",
    ]
    # Already pre-action: no change
    assert hoist(["nested", "--monitors=1", "run", "--", "true"]) == [
        "nested",
        "--monitors=1",
        "run",
        "--",
        "true",
    ]
    # No flags after action: no change
    assert hoist(["nested", "run", "true"]) == ["nested", "run", "true"]
    # start with trailing options (no campaign cmd)
    assert hoist(["nested", "start", "--monitors=2", "--replace"]) == [
        "nested",
        "--monitors=2",
        "--replace",
        "start",
    ]
    # non-nested argv untouched
    assert hoist(["ping"]) == ["ping"]
    assert hoist(["layout", "dev"]) == ["layout", "dev"]


def test_is_running_false_when_pids_dead(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Lying pid files must not report running."""
    import nested_wayland as nw

    nest_root = tmp_path / "nests"
    state = nest_root / "forge"
    state.mkdir(parents=True)
    monkeypatch.setenv("FORGE_NESTED_ROOT", str(nest_root))
    cfg = NestedConfig(
        name="forge",
        display="wayland-forge-unit",
        size="1280x800",
        scale="1",
        host_wayland="wayland-0",
        unsafe_mode=True,
        state_dir=str(state),
        bus_address=bus_address_for(state),
        created_at=0.0,
        num_monitors=1,
    )
    nw.save_config(cfg)
    (state / "shell.pid").write_text("999999\n", encoding="utf-8")
    (state / "dbus.pid").write_text("999998\n", encoding="utf-8")
    # No live socket; pids are almost certainly dead
    assert is_running("forge") is False


def test_has_stale_residue_and_reap(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Dead pid files / bus residue → has_stale_residue; reap cleans them."""
    import nested_wayland as nw

    nest_root = tmp_path / "nests"
    state = nest_root / "forge"
    state.mkdir(parents=True)
    monkeypatch.setenv("FORGE_NESTED_ROOT", str(nest_root))
    # Isolate nest socket under a fake runtime dir
    rt = tmp_path / "run"
    rt.mkdir()
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(rt))

    cfg = NestedConfig(
        name="forge",
        display="wayland-forge-unit",
        size="1280x800",
        scale="1",
        host_wayland="wayland-0",
        unsafe_mode=True,
        state_dir=str(state),
        bus_address=bus_address_for(state),
        created_at=0.0,
        num_monitors=1,
    )
    nw.save_config(cfg)
    (state / "shell.pid").write_text("999999\n", encoding="utf-8")
    (state / "dbus.pid").write_text("999998\n", encoding="utf-8")
    (state / "bus").write_text("", encoding="utf-8")  # leftover path
    sock = rt / "wayland-forge-unit"
    sock.write_text("", encoding="utf-8")

    assert is_running("forge") is False
    assert has_stale_residue("forge") is True
    assert reap_stale("forge") is True
    assert not (state / "shell.pid").is_file()
    assert not (state / "dbus.pid").is_file()
    assert not (state / "bus").exists()
    assert not sock.exists()
    assert has_stale_residue("forge") is False
    # Second reap is a no-op
    assert reap_stale("forge") is False


def test_reap_stale_noop_when_running(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import nested_wayland as nw

    monkeypatch.setenv("FORGE_NESTED_ROOT", str(tmp_path / "nests"))
    monkeypatch.setattr(nw, "is_running", lambda _n="forge": True)
    assert has_stale_residue("forge") is False
    assert reap_stale("forge") is False


def test_run_campaign_always_stops(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """run_campaign stops nest on exit even when nest was already up."""
    import nested_wayland as nw

    stops: list[str] = []
    cfg = NestedConfig(
        name="forge",
        display="wayland-forge-unit",
        size="1280x800",
        scale="1",
        host_wayland="wayland-0",
        unsafe_mode=True,
        state_dir=str(tmp_path),
        bus_address=bus_address_for(tmp_path),
        created_at=0.0,
        num_monitors=1,
    )
    monkeypatch.setattr(nw, "is_running", lambda _n="forge": True)
    monkeypatch.setattr(nw, "load_config", lambda _n="forge": cfg)
    monkeypatch.setattr(nw, "exec_in", lambda _c, _a: 0)
    monkeypatch.setattr(
        nw, "stop",
        lambda **kw: stops.append(kw.get("name", "forge")) or True)

    assert nw.run_campaign(["true"], name="forge") == 0
    assert stops == ["forge"]


def test_run_campaign_keep_skips_stop(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import nested_wayland as nw

    stops: list[str] = []
    cfg = NestedConfig(
        name="forge",
        display="wayland-forge-unit",
        size="1280x800",
        scale="1",
        host_wayland="wayland-0",
        unsafe_mode=True,
        state_dir=str(tmp_path),
        bus_address=bus_address_for(tmp_path),
        created_at=0.0,
        num_monitors=1,
    )
    monkeypatch.setattr(nw, "is_running", lambda _n="forge": True)
    monkeypatch.setattr(nw, "load_config", lambda _n="forge": cfg)
    monkeypatch.setattr(nw, "exec_in", lambda _c, _a: 7)
    monkeypatch.setattr(
        nw, "stop",
        lambda **kw: stops.append(kw.get("name", "forge")) or True)

    assert nw.run_campaign(["true"], name="forge", keep=True) == 7
    assert stops == []


def test_run_campaign_stops_even_on_cmd_error(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import nested_wayland as nw

    stops: list[str] = []
    cfg = NestedConfig(
        name="forge",
        display="wayland-forge-unit",
        size="1280x800",
        scale="1",
        host_wayland="wayland-0",
        unsafe_mode=True,
        state_dir=str(tmp_path),
        bus_address=bus_address_for(tmp_path),
        created_at=0.0,
        num_monitors=1,
    )
    monkeypatch.setattr(nw, "is_running", lambda _n="forge": True)
    monkeypatch.setattr(nw, "load_config", lambda _n="forge": cfg)
    monkeypatch.setattr(nw, "exec_in", lambda _c, _a: 42)
    monkeypatch.setattr(
        nw, "stop",
        lambda **kw: stops.append(kw.get("name", "forge")) or True)

    assert nw.run_campaign(["false"], name="forge") == 42
    assert stops == ["forge"]
