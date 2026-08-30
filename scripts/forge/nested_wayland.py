#!/usr/bin/env python3
"""Nested GNOME Shell (Wayland) sessions for repeated local retests.

Standalone of shellrc. Manages a private session bus + nested ``gnome-shell``
so extension reloads do not require logging out of the host Wayland session.

State (per session name)::

    $XDG_STATE_HOME/forge/nested/<name>/   (override: FORGE_NESTED_ROOT)
      bus              unix socket for private D-Bus
      dbus.pid         session bus PID
      shell.pid        nested gnome-shell PID
      config.json      display, size, host wayland, paths
      shell.log        gnome-shell stderr/stdout
      dbus.log         dbus-daemon log
      env.sh           sourceable client env
      status.json      last known status snapshot

Client env (apps / ``forge`` against the nest)::

    DBUS_SESSION_BUS_ADDRESS=unix:path=…/bus
    WAYLAND_DISPLAY=<nest display e.g. wayland-forge>
    GDK_BACKEND=wayland
    XDG_SESSION_TYPE=wayland
    FORGE_HOST=<hostname>-sub-<nestname>   # logical host (CLI + Shell)
    FORGE_CONFIG_HOME=<state>/forge-config # forge config root (CLI + nest Shell)

Nested shell itself is started with the *host* WAYLAND_DISPLAY so it embeds
as a window on the host compositor. Same FORGE_* isolation is exported on
the shell process so the extension honors nest paths (N2).
"""

from __future__ import annotations

import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence

FORGE_UUID = "forge@jmmaranan.com"
DEFAULT_NAME = "forge"
DEFAULT_DISPLAY = "wayland-forge"
DEFAULT_SIZE = "1920x1080"  # Full HD per dummy mon; fixed, not host-matched
DEFAULT_SCALE = "1"  # no scaling
DEFAULT_MONITORS = 1
MAX_DUMMY_MONITORS = 4  # Mutter clamps higher counts
SHELL_READY_TIMEOUT_S = 30.0
SOCKET_READY_TIMEOUT_S = 20.0
STOP_GRACE_S = 3.0

_REQUIRED_BINS = ("dbus-daemon", "gnome-shell", "gdbus")


class NestedError(RuntimeError):
    """User-facing nested session error (exit 1)."""

    exit_code: int = 1


class NestedUnsupported(NestedError):
    """Host session cannot run nested Wayland (exit 2 — graceful refuse)."""

    exit_code: int = 2


@dataclass
class NestedConfig:
    name: str
    display: str
    size: str
    scale: str
    host_wayland: str
    unsafe_mode: bool
    state_dir: str
    bus_address: str
    created_at: float
    # Virtual dummy monitors inside the nest (MUTTER_DEBUG_NUM_DUMMY_MONITORS).
    # 1 = single virtual mon (default). 2+ = side-by-side dummy outputs for
    # dual-mon layout tests without host dual-mon geometry.
    num_monitors: int = DEFAULT_MONITORS


def runtime_dir(env: Optional[Mapping[str, str]] = None) -> Path:
    e = env if env is not None else os.environ
    return Path(str(e.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}"))


def state_root() -> Path:
    override = os.environ.get("FORGE_NESTED_ROOT", "").strip()
    if override:
        return Path(override).expanduser()
    xdg = os.environ.get("XDG_STATE_HOME", "").strip()
    base = Path(xdg).expanduser() if xdg else Path.home() / ".local" / "state"
    return base / "forge" / "nested"


def session_dir(name: str = DEFAULT_NAME) -> Path:
    safe = _safe_name(name)
    return state_root() / safe


def _safe_name(name: str) -> str:
    n = (name or DEFAULT_NAME).strip()
    if not n or "/" in n or n in (".", ".."):
        raise NestedError(f"invalid session name: {name!r}")
    if not all(c.isalnum() or c in "-_." for c in n):
        raise NestedError(f"invalid session name (use alnum/_/-/.): {name!r}")
    return n


def parse_size(spec: str) -> str:
    """Parse a single virtual mode WWxHH (optional @RR)."""
    s = (spec or "").strip().lower().replace(" ", "")
    if not s:
        raise NestedError("size required (WWxHH)")
    # Strip optional refresh: 1280x720@60.0 → 1280x720 for validation
    base = s.split("@", 1)[0]
    if "x" not in base:
        raise NestedError(f"size must look like WxH (got {spec!r})")
    w, _, h = base.partition("x")
    if not w.isdigit() or not h.isdigit():
        raise NestedError(f"size must look like WxH (got {spec!r})")
    if int(w) < 320 or int(h) < 240:
        raise NestedError(f"size too small: {spec!r}")
    # Preserve refresh suffix if present and well-formed
    if "@" in s:
        return f"{int(w)}x{int(h)}@{s.split('@', 1)[1]}"
    return f"{int(w)}x{int(h)}"


def host_primary_logical_size(
    env: Optional[Mapping[str, str]] = None, ) -> Optional[str]:
    """
    Logical size of the host primary monitor as WWxHH.

    Prefer Forge GetTree stableKey geom when extension is up. Nest defaults
    use DEFAULT_SIZE (Full HD) + DEFAULT_SCALE (1); this probe is opt-in only
    (e.g. ``--size`` after probing host), not the start/run default.
    """
    e = dict(env) if env is not None else dict(os.environ)
    # Avoid nest client env when probing host.
    if _looks_like_nest_display(str(e.get("WAYLAND_DISPLAY") or "")):
        e.pop("WAYLAND_DISPLAY", None)
        # Prefer host wayland from socket list
        try:
            e["WAYLAND_DISPLAY"] = host_wayland_display(e)
        except NestedError:
            pass
    # 1) forge tree
    try:
        forge_bin = shutil.which("forge") or "forge"
        proc = subprocess.run(
            [forge_bin, "tree", "--compact"],
            check=False,
            capture_output=True,
            text=True,
            timeout=8,
            env={
                **os.environ,
                **e
            },
        )
        if proc.returncode == 0 and (proc.stdout or "").strip():
            data = json.loads(proc.stdout)
            for m in data.get("monitors") or []:
                if not isinstance(m, dict):
                    continue
                sk = str(m.get("stableKey") or "")
                # geom:0,0,2560,1440#primary
                if "geom:" not in sk:
                    continue
                geom = sk.split("geom:", 1)[1].split("#", 1)[0]
                parts = geom.split(",")
                if len(parts) >= 4 and parts[2].isdigit() and parts[3].isdigit(
                ):
                    w, h = int(parts[2]), int(parts[3])
                    if w >= 320 and h >= 240:
                        if "#primary" in sk or m.get("rect"):
                            return f"{w}x{h}"
            # fallback first mon with geom
            for m in data.get("monitors") or []:
                sk = str((m or {}).get("stableKey") or "")
                if "geom:" not in sk:
                    continue
                geom = sk.split("geom:", 1)[1].split("#", 1)[0]
                parts = geom.split(",")
                if len(parts) >= 4 and parts[2].isdigit() and parts[3].isdigit(
                ):
                    w, h = int(parts[2]), int(parts[3])
                    if w >= 320 and h >= 240:
                        return f"{w}x{h}"
    except (OSError, json.JSONDecodeError, subprocess.TimeoutExpired,
            ValueError):
        pass
    return None


def parse_num_monitors(raw: Any) -> int:
    """Dummy monitor count for nest (1–MAX_DUMMY_MONITORS)."""
    try:
        n = int(raw)
    except (TypeError, ValueError) as e:
        raise NestedError(f"monitors must be an integer (got {raw!r})") from e
    if n < 1:
        raise NestedError(f"monitors must be ≥1 (got {n})")
    if n > MAX_DUMMY_MONITORS:
        raise NestedError(
            f"monitors clamped max is {MAX_DUMMY_MONITORS} (got {n})")
    return n


def dummy_mode_specs(size: str, num_monitors: int) -> str:
    """
    MUTTER_DEBUG_DUMMY_MODE_SPECS value.

    Mutter wants a *colon*-separated list of modes (not commas). Multiple
    modes are available modes per output, not one mode per monitor.
    NUM_DUMMY_MONITORS creates the outputs; each gets the same mode list.
    """
    # One preferred mode is enough; all dummy outputs share it.
    return parse_size(size)


def dummy_monitor_scales(scale: str, num_monitors: int) -> str:
    """Comma-separated scales, one entry per dummy monitor."""
    s = (scale or DEFAULT_SCALE).strip() or DEFAULT_SCALE
    # Allow already-expanded "1,1"
    if "," in s:
        parts = [p.strip() for p in s.split(",") if p.strip()]
        if len(parts) == num_monitors:
            return ",".join(parts)
        # Pad / trim
        while len(parts) < num_monitors:
            parts.append(parts[-1] if parts else DEFAULT_SCALE)
        return ",".join(parts[:num_monitors])
    return ",".join([s] * max(1, num_monitors))


def check_deps() -> list[str]:
    missing = [b for b in _REQUIRED_BINS if not shutil.which(b)]
    return missing


def host_session_type(env: Optional[Mapping[str, str]] = None) -> str:
    """Login session type: x11 | wayland | unknown (not the nest itself)."""
    e = env if env is not None else os.environ
    st = str(e.get("XDG_SESSION_TYPE") or "").strip().lower()
    if st in ("x11", "wayland"):
        return st
    wl = str(e.get("WAYLAND_DISPLAY") or "").strip()
    if wl and not _looks_like_nest_display(wl):
        return "wayland"
    if e.get("DISPLAY"):
        return "x11"
    return "unknown"


def allow_x11_host(env: Optional[Mapping[str, str]] = None) -> bool:
    e = env if env is not None else os.environ
    v = str(e.get("FORGE_NESTED_ALLOW_X11") or "").strip().lower()
    return v in ("1", "true", "yes", "on")


def x11_refuse_message(session: str = "x11") -> str:
    """Clear agent/human guidance when nested is refused on non-Wayland host."""
    return (
        f"host session is {session} — nested Wayland needs a Wayland login "
        f"(parent compositor socket).\n"
        f"  X11 reload:  killall -HUP gnome-shell   # or Alt+F2 → r\n"
        f"  Wayland:     log into GNOME on Wayland, then:  forge-test nested start\n"
        f"  Dual-mon CT: still runs on the host desk after extension is loaded;\n"
        f"               use nest to reload JS without logout, not as dual-mon desk.\n"
        f"  Experimental nest under X11 parent: FORGE_NESTED_ALLOW_X11=1 "
        f"(usually still needs a Wayland socket — prefer a Wayland session).")


def require_wayland_host(
    *,
    allow_x11: bool = False,
    env: Optional[Mapping[str, str]] = None,
) -> str:
    """Ensure host can embed a nested Wayland shell. Returns session type.

    Raises NestedUnsupported (exit 2) on X11/unknown unless allow_x11 / env override.
    """
    e = env if env is not None else os.environ
    session = host_session_type(e)
    force = allow_x11 or allow_x11_host(e)
    if session == "wayland":
        return session
    if force:
        return session
    raise NestedUnsupported(x11_refuse_message(session))


def nested_tools_available() -> bool:
    return not check_deps()


def can_nested_on_host(env: Optional[Mapping[str, str]] = None) -> bool:
    """True when agent docs should recommend ``forge-test nested`` for retest."""
    e = env if env is not None else os.environ
    if host_session_type(e) != "wayland":
        return False
    if not nested_tools_available():
        return False
    try:
        host_wayland_display(e)
    except NestedError:
        return False
    return True


def _looks_like_nest_display(name: str) -> bool:
    n = name.strip()
    if not n:
        return True
    if n.startswith("wayland-forge"):
        return True
    if "nest" in n or "smoke" in n:
        return True
    return False


def host_wayland_display(env: Optional[Mapping[str, str]] = None) -> str:
    """Parent compositor display for embedding the nested shell window.

    Ignores nest displays and ``WAYLAND_DISPLAY`` when it already points at a
    nest (common after ``eval $(forge-test nested env --export)``).
    Override: ``HOST_WAYLAND_DISPLAY`` or ``FORGE_NESTED_HOST_WAYLAND``.
    """
    e = env if env is not None else os.environ
    for key in ("FORGE_NESTED_HOST_WAYLAND", "HOST_WAYLAND_DISPLAY"):
        explicit = str(e.get(key) or "").strip()
        if explicit:
            return explicit

    rt = runtime_dir(e)
    wl = str(e.get("WAYLAND_DISPLAY") or "").strip()
    if wl and not _looks_like_nest_display(wl) and (rt / wl).is_socket():
        return wl

    # Prefer the usual login socket, then any non-nest socket.
    candidates: list[str] = []
    for p in sorted(rt.glob("wayland-*")):
        if not p.is_socket():
            continue
        name = p.name
        if name.endswith(".lock"):
            continue
        if _looks_like_nest_display(name):
            continue
        candidates.append(name)
    if "wayland-0" in candidates:
        return "wayland-0"
    if candidates:
        return candidates[0]
    raise NestedError(
        "no host WAYLAND_DISPLAY; start from a Wayland session "
        "or set HOST_WAYLAND_DISPLAY / FORGE_NESTED_HOST_WAYLAND")


def bus_address_for(dir_path: Path) -> str:
    return f"unix:path={dir_path / 'bus'}"


def parent_short_hostname(
    env: Optional[Mapping[str, str]] = None,
    *,
    hostname: Optional[str] = None,
) -> str:
    """Machine short name for nest host ids (never FORGE_HOST — that is logical)."""
    if hostname is not None and str(hostname).strip():
        return str(hostname).split(".", 1)[0].strip().lower() or "unknown"
    e = env if env is not None else os.environ
    # HOSTNAME / HOST can be set by shells; prefer live gethostname.
    try:
        name = socket.gethostname()
    except OSError:
        name = str(e.get("HOSTNAME") or e.get("HOST") or "unknown")
    return str(name).split(".", 1)[0].strip().lower() or "unknown"


def nest_forge_host(
    name: str,
    *,
    parent_host: Optional[str] = None,
    env: Optional[Mapping[str, str]] = None,
) -> str:
    """Logical host id for nest CLI: ``<short-hostname>-sub-<nestname>``."""
    nest = _safe_name(name)
    parent = (parent_host if parent_host is not None else
              parent_short_hostname(env)).strip().lower() or "unknown"
    return f"{parent}-sub-{nest}"


def nest_forge_config_home(cfg: NestedConfig) -> Path:
    """CLI forge config root under nest state (``~/.config/forge`` analogue)."""
    return Path(cfg.state_dir) / "forge-config"


def ensure_nest_cli_dirs(cfg: NestedConfig) -> Path:
    """Create nest-scoped forge config root (CLI + Shell extension)."""
    root = nest_forge_config_home(cfg)
    (root / "config").mkdir(parents=True, exist_ok=True)
    return root


def client_env(cfg: NestedConfig) -> dict[str, str]:
    """Environment for clients of the nested compositor (apps, forge CLI).

    Isolation (N1/N2):
      FORGE_HOST=<hostname>-sub-<nestname>
      FORGE_CONFIG_HOME=<state_dir>/forge-config  # settle-heuristics, windows.json

    Layout *profiles* stay shared via ``layout/`` / ``FORGE_LAYOUT_DIR``
    (not redirected). Nest Shell gets the same FORGE_* via shell_start_env.
    """
    ensure_nest_cli_dirs(cfg)
    return {
        "DBUS_SESSION_BUS_ADDRESS": cfg.bus_address,
        "WAYLAND_DISPLAY": cfg.display,
        "GDK_BACKEND": "wayland",
        "XDG_SESSION_TYPE": "wayland",
        # GTK4 GL on nested Mutter often never maps (ghostty hangs after
        # xdg_wm_base bind). Cairo + software GL keep nest open/map reliable.
        "GSK_RENDERER": "cairo",
        "LIBGL_ALWAYS_SOFTWARE": "1",
        "FORGE_HOST": nest_forge_host(cfg.name),
        "FORGE_CONFIG_HOME": str(nest_forge_config_home(cfg)),
    }


def resolve_host_xauthority(env: Optional[Mapping[str, str]] = None) -> Optional[str]:
    """Host Xwayland auth cookie for nested gnome-shell embedding.

    Mutter rotates ``.mutter-Xwaylandauth.*`` under ``$XDG_RUNTIME_DIR``. Agent
    shells (e.g. Guake) often keep a stale ``XAUTHORITY`` path after the cookie
    file is gone → nest fails with ``Unable to open display ':1'``. Prefer a
    live cookie path when the current one is missing.
    """
    e = dict(env) if env is not None else dict(os.environ)
    cur = str(e.get("XAUTHORITY") or "").strip()
    if cur and Path(cur).is_file():
        return cur
    rt = runtime_dir()
    try:
        cands = sorted(
            rt.glob(".mutter-Xwaylandauth.*"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
    except OSError:
        cands = []
    for p in cands:
        if p.is_file():
            return str(p)
    home_xa = Path.home() / ".Xauthority"
    if home_xa.is_file():
        return str(home_xa)
    return cur or None


def shell_start_env(cfg: NestedConfig) -> dict[str, str]:
    """Environment for the nested gnome-shell process itself."""
    env = os.environ.copy()
    env["DBUS_SESSION_BUS_ADDRESS"] = cfg.bus_address
    # Parent compositor: nested shell is a Wayland *client* of the host.
    env["WAYLAND_DISPLAY"] = cfg.host_wayland
    env["GDK_BACKEND"] = "wayland"
    env["XDG_SESSION_TYPE"] = "wayland"
    # Inherit to GJS DesktopAppInfo / Subprocess launches: nest GL path
    # often leaves ghostty alive with zero Meta windows (open-miss).
    env["GSK_RENDERER"] = "cairo"
    env["LIBGL_ALWAYS_SOFTWARE"] = "1"
    # Stale Guake/agent XAUTHORITY breaks nest ("Unable to open display").
    xa = resolve_host_xauthority(env)
    if xa:
        env["XAUTHORITY"] = xa
    else:
        env.pop("XAUTHORITY", None)
    # N2: forge-specific root only (not full XDG_CONFIG_HOME rewrite).
    ensure_nest_cli_dirs(cfg)
    env["FORGE_HOST"] = nest_forge_host(cfg.name)
    env["FORGE_CONFIG_HOME"] = str(nest_forge_config_home(cfg))
    nmon = int(
        getattr(cfg, "num_monitors", DEFAULT_MONITORS) or DEFAULT_MONITORS)
    if nmon < 1:
        nmon = 1
    if nmon > MAX_DUMMY_MONITORS:
        nmon = MAX_DUMMY_MONITORS
    # Colon-separated modes (per-output mode list). Commas are invalid and
    # crash nest with "No valid mode specs".
    env["MUTTER_DEBUG_DUMMY_MODE_SPECS"] = dummy_mode_specs(cfg.size, nmon)
    env["MUTTER_DEBUG_NUM_DUMMY_MONITORS"] = str(nmon)
    env["MUTTER_DEBUG_DUMMY_MONITOR_SCALES"] = dummy_monitor_scales(
        cfg.scale, nmon)
    # Nested retest should be responsive, not demo-slow.
    env.pop("GNOME_SHELL_SLOWDOWN_FACTOR", None)
    return env


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _read_pid(path: Path) -> Optional[int]:
    try:
        text = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def _write_pid(path: Path, pid: int) -> None:
    path.write_text(f"{pid}\n", encoding="utf-8")


def load_config(name: str = DEFAULT_NAME) -> Optional[NestedConfig]:
    path = session_dir(name) / "config.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    try:
        nmon = data.get("num_monitors", DEFAULT_MONITORS)
        try:
            nmon_i = int(nmon)
        except (TypeError, ValueError):
            nmon_i = DEFAULT_MONITORS
        if nmon_i < 1:
            nmon_i = DEFAULT_MONITORS
        if nmon_i > MAX_DUMMY_MONITORS:
            nmon_i = MAX_DUMMY_MONITORS
        return NestedConfig(
            name=str(data["name"]),
            display=str(data["display"]),
            size=str(data["size"]),
            scale=str(data.get("scale", DEFAULT_SCALE)),
            host_wayland=str(data["host_wayland"]),
            unsafe_mode=bool(data.get("unsafe_mode", True)),
            state_dir=str(data["state_dir"]),
            bus_address=str(data["bus_address"]),
            created_at=float(data.get("created_at", 0)),
            num_monitors=nmon_i,
        )
    except (KeyError, TypeError, ValueError):
        return None


def save_config(cfg: NestedConfig) -> None:
    d = Path(cfg.state_dir)
    d.mkdir(parents=True, exist_ok=True)
    (d / "config.json").write_text(
        json.dumps(asdict(cfg), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    env = client_env(cfg)
    lines = [f"export {k}={_shell_quote(v)}" for k, v in env.items()]
    (d / "env.sh").write_text("\n".join(lines) + "\n", encoding="utf-8")


def _shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def nest_socket_path(display: str) -> Path:
    return runtime_dir() / display


def is_running(name: str = DEFAULT_NAME) -> bool:
    """True only when nest shell + dbus pids are alive and the nest socket exists.

    Dead pid files or leftover sockets alone do **not** count as running
    (callers should :func:`reap_stale` / :func:`stop` to clean residue).
    """
    cfg = load_config(name)
    if not cfg:
        return False
    d = Path(cfg.state_dir)
    shell_pid = _read_pid(d / "shell.pid")
    dbus_pid = _read_pid(d / "dbus.pid")
    if shell_pid is None or not _pid_alive(shell_pid):
        return False
    if dbus_pid is None or not _pid_alive(dbus_pid):
        return False
    return nest_socket_path(cfg.display).is_socket()


def should_stop_on_exit(
    *,
    always_stop: bool,
    started_nest: bool,
    keep: bool = False,
) -> bool:
    """Whether this invocation owns nest teardown on exit.

    * ``always_stop`` — campaign ``run`` entry: stop unless *keep*.
    * ``started_nest`` — this invocation started the nest (``exec`` auto-start).
    * ``keep`` — debug opt-out: leave nest up.
    """
    if keep:
        return False
    if always_stop:
        return True
    return bool(started_nest)


def has_stale_residue(name: str = DEFAULT_NAME) -> bool:
    """True when pid files / bus / nest sockets remain but nest is not running."""
    name = _safe_name(name)
    if is_running(name):
        return False
    d = session_dir(name)
    cfg = load_config(name)
    display = cfg.display if cfg else DEFAULT_DISPLAY
    if d.is_dir():
        for pid_file in (d / "shell.pid", d / "dbus.pid"):
            if pid_file.is_file():
                return True
        if (d / "bus").exists():
            return True
    sock = nest_socket_path(display)
    if sock.exists() or Path(str(sock) + ".lock").exists():
        return True
    return False


def reap_stale(name: str = DEFAULT_NAME) -> bool:
    """Clean dead pid files / leftover sockets / bus when nest is not running.

    No-op when :func:`is_running` is True. Returns True if residue was present
    and cleanup was attempted (via :func:`stop`).
    """
    name = _safe_name(name)
    if is_running(name):
        return False
    if not has_stale_residue(name):
        return False
    stop(name=name, force=True)
    return True


def _gdbus(
    bus_address: str,
    args: Sequence[str],
    *,
    timeout: float = 5.0,
) -> subprocess.CompletedProcess[str]:
    cmd = ["gdbus", *args]
    # Prefer --address when talking to nest; --session uses env.
    env = os.environ.copy()
    env["DBUS_SESSION_BUS_ADDRESS"] = bus_address
    return subprocess.run(
        cmd,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
    )


def name_has_owner(bus_address: str,
                   name: str,
                   *,
                   timeout: float = 5.0) -> bool:
    proc = _gdbus(
        bus_address,
        [
            "call",
            "--session",
            "--dest",
            "org.freedesktop.DBus",
            "--object-path",
            "/org/freedesktop/DBus",
            "--method",
            "org.freedesktop.DBus.NameHasOwner",
            name,
        ],
        timeout=timeout,
    )
    if proc.returncode != 0:
        return False
    out = (proc.stdout or "").strip().lower()
    return "true" in out


def shell_eval(bus_address: str,
               js: str,
               *,
               timeout: float = 5.0) -> tuple[bool, str]:
    """Return (ok, payload). ok is Shell.Eval success flag."""
    proc = _gdbus(
        bus_address,
        [
            "call",
            "--session",
            "--dest",
            "org.gnome.Shell",
            "--object-path",
            "/org/gnome/Shell",
            "--method",
            "org.gnome.Shell.Eval",
            js,
        ],
        timeout=timeout,
    )
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        return False, err or f"gdbus exit {proc.returncode}"
    out = (proc.stdout or "").strip()
    # Typical: (true, '2') or (false, '')
    if out.startswith("(") and out.endswith(")"):
        inner = out[1:-1].strip()
        if inner.startswith("true"):
            return True, out
        if inner.startswith("false"):
            return False, out
    return True, out


def wait_socket(display: str,
                timeout_s: float = SOCKET_READY_TIMEOUT_S) -> bool:
    path = nest_socket_path(display)
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if path.is_socket():
            return True
        time.sleep(0.15)
    return path.is_socket()


def wait_shell_ready(
    bus_address: str,
    timeout_s: float = SHELL_READY_TIMEOUT_S,
) -> bool:
    """Name ownership + Eval path (Shell object fully exported)."""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if name_has_owner(bus_address, "org.gnome.Shell"):
            ok, _ = shell_eval(bus_address, "1+1")
            if ok:
                return True
        time.sleep(0.2)
    return False


def wait_forge_ready(
    bus_address: str,
    timeout_s: float = 20.0,
) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if name_has_owner(bus_address, "org.gnome.Shell.Extensions.Forge"):
            return True
        time.sleep(0.25)
    return False


def wait_nest_client_ready(
    bus_address: str,
    *,
    timeout_s: float = 12.0,
    min_monitors: int = 1,
) -> bool:
    """Wait until nested Meta has real workareas (clients can map).

    Cold campaigns that open apps immediately after enable often open-miss:
    ghostty/GTK connect but never create a Meta window until the dummy
    output workareas exist. Poll work area width via Shell.Eval.
    """
    # Avoid import/ top-level issues in module Eval (GNOME 45+).
    js = (
        "(function(){ try { "
        "const n = global.display.get_n_monitors(); "
        "if (n < 1) return '0'; "
        "const ws = global.workspace_manager.get_active_workspace(); "
        "const r = ws.get_work_area_for_monitor(0); "
        "if (!r || r.width < 64 || r.height < 64) return '0'; "
        "return String(n); "
        "} catch (e) { return '0'; } })()"
    )
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        ok, payload = shell_eval(bus_address, js, timeout=3.0)
        if ok and payload:
            # payload like (true, '2') or (true, "2")
            text = str(payload)
            digits = "".join(ch for ch in text if ch.isdigit())
            try:
                n = int(digits) if digits else 0
            except ValueError:
                n = 0
            if n >= int(min_monitors):
                # Dummy outputs report workareas well before GTK/OpenGL clients
                # (esp. ghostty) can map on nested Mutter. Live repro: workarea
                # at ~0s still open-miss; ~4s settle → map ok.
                time.sleep(4.0)
                return True
        time.sleep(0.25)
    return False


def _start_dbus(cfg: NestedConfig) -> int:
    d = Path(cfg.state_dir)
    bus_path = d / "bus"
    if bus_path.exists():
        try:
            bus_path.unlink()
        except OSError:
            pass
    log = open(d / "dbus.log", "w", encoding="utf-8")  # noqa: SIM115
    proc = subprocess.Popen(
        [
            "dbus-daemon",
            "--session",
            f"--address={cfg.bus_address}",
            "--nofork",
            "--nopidfile",
            "--syslog-only",
        ],
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    _write_pid(d / "dbus.pid", proc.pid)
    # Brief settle for socket
    for _ in range(30):
        if bus_path.exists() or _pid_alive(proc.pid):
            # unix:path may not create a filesystem node until first connect on
            # some setups; pid alive is enough to proceed.
            time.sleep(0.1)
            if _pid_alive(proc.pid):
                return proc.pid
        time.sleep(0.05)
    if not _pid_alive(proc.pid):
        log.close()
        raise NestedError(f"dbus-daemon failed; see {d / 'dbus.log'}")
    return proc.pid


def _start_shell(cfg: NestedConfig) -> int:
    d = Path(cfg.state_dir)
    # Drop stale nest socket if previous crash left it
    sock = nest_socket_path(cfg.display)
    for stale in (sock, Path(str(sock) + ".lock")):
        if stale.exists() and not any(
                _pid_alive(p)
                for p in [_read_pid(d / "shell.pid")] if p is not None):
            try:
                stale.unlink()
            except OSError:
                pass

    log = open(d / "shell.log", "w", encoding="utf-8")  # noqa: SIM115
    cmd = [
        "gnome-shell",
        "--nested",
        "--wayland",
        f"--wayland-display={cfg.display}",
    ]
    if cfg.unsafe_mode:
        cmd.append("--unsafe-mode")
    env = shell_start_env(cfg)
    proc = subprocess.Popen(
        cmd,
        stdout=log,
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True,
    )
    _write_pid(d / "shell.pid", proc.pid)
    return proc.pid


def start(
    *,
    name: str = DEFAULT_NAME,
    display: Optional[str] = None,
    size: str = DEFAULT_SIZE,
    scale: str = DEFAULT_SCALE,
    num_monitors: int = DEFAULT_MONITORS,
    unsafe_mode: bool = True,
    host_wayland: Optional[str] = None,
    replace: bool = False,
    allow_x11: bool = False,
) -> NestedConfig:
    missing = check_deps()
    if missing:
        raise NestedError("missing required tools: " + ", ".join(missing) +
                          " (install gnome-shell / dbus)")

    require_wayland_host(allow_x11=allow_x11)

    name = _safe_name(name)
    if is_running(name):
        if not replace:
            cfg = load_config(name)
            if cfg:
                return cfg
            raise NestedError(f"nested session {name!r} already running")
        stop(name=name, force=True)
    else:
        # Dead pids / leftover sockets would confuse a new start.
        reap_stale(name)

    size = parse_size(size)
    nmon = parse_num_monitors(num_monitors)
    try:
        host_wl = (host_wayland or host_wayland_display()).strip()
    except NestedError as e:
        # No parent Wayland socket — refuse with the same graceful message.
        session = host_session_type()
        if session != "wayland" and not (allow_x11 or allow_x11_host()):
            raise NestedUnsupported(x11_refuse_message(session)) from e
        raise NestedError(
            f"{e}; nested Wayland embeds as a client of the host compositor"
        ) from e
    if not host_wl:
        raise NestedError("empty host WAYLAND_DISPLAY")
    host_sock = runtime_dir() / host_wl
    if not host_sock.is_socket():
        raise NestedError(f"host Wayland socket not found: {host_sock} "
                          f"(are you in a Wayland session?)")

    disp = (display or DEFAULT_DISPLAY).strip()
    if not disp.startswith("wayland-"):
        # Allow short names → wayland-<name>
        disp = f"wayland-{disp}" if not disp.startswith("wayland") else disp

    d = session_dir(name)
    d.mkdir(parents=True, exist_ok=True)
    cfg = NestedConfig(
        name=name,
        display=disp,
        size=size,
        scale=str(scale),
        host_wayland=host_wl,
        unsafe_mode=bool(unsafe_mode),
        state_dir=str(d),
        bus_address=bus_address_for(d),
        created_at=time.time(),
        num_monitors=nmon,
    )
    save_config(cfg)

    try:
        _start_dbus(cfg)
        _start_shell(cfg)
    except Exception:
        stop(name=name, force=True)
        raise

    if not wait_socket(cfg.display):
        stop(name=name, force=True)
        raise NestedError(
            f"nested Wayland socket not ready: {nest_socket_path(cfg.display)}; "
            f"see {d / 'shell.log'}")
    if not wait_shell_ready(cfg.bus_address):
        stop(name=name, force=True)
        raise NestedError(
            f"nested gnome-shell not ready on bus; see {d / 'shell.log'}")

    _write_status(cfg, phase="running")
    return cfg


def _kill_pid(pid: Optional[int], *, force: bool) -> None:
    if pid is None or not _pid_alive(pid):
        return
    try:
        os.kill(pid, signal.SIGKILL if force else signal.SIGTERM)
    except ProcessLookupError:
        return


def _pids_with_cmdline_needle(needle: str) -> list[int]:
    """Best-effort: PIDs whose /proc cmdline contains needle (orphan cleanup)."""
    if not needle or len(needle) < 8:
        return []
    found: list[int] = []
    try:
        proc_root = Path("/proc")
        for entry in proc_root.iterdir():
            if not entry.name.isdigit():
                continue
            try:
                raw = (entry / "cmdline").read_bytes()
            except OSError:
                continue
            cmd = raw.replace(b"\0", b" ").decode("utf-8", "replace")
            if needle in cmd:
                found.append(int(entry.name))
    except OSError:
        return found
    return found


def _kill_graceful(pid: Optional[int], *, grace_s: float) -> None:
    if pid is None or not _pid_alive(pid):
        return
    _kill_pid(pid, force=False)
    deadline = time.monotonic() + grace_s
    while _pid_alive(pid) and time.monotonic() < deadline:
        time.sleep(0.1)
    if _pid_alive(pid):
        _kill_pid(pid, force=True)


def stop(*, name: str = DEFAULT_NAME, force: bool = False) -> bool:
    """Stop nested session. Returns True if something was running or cleaned."""
    name = _safe_name(name)
    d = session_dir(name)
    cfg = load_config(name)
    display = cfg.display if cfg else DEFAULT_DISPLAY
    shell_pid = _read_pid(d / "shell.pid") if d.is_dir() else None
    dbus_pid = _read_pid(d / "dbus.pid") if d.is_dir() else None
    bus_path = d / "bus"
    # Orphans when pid files stale but nest bus/socket still held.
    orphan_pids = _pids_with_cmdline_needle(str(bus_path))
    if display:
        orphan_pids.extend(
            p
            for p in _pids_with_cmdline_needle(str(nest_socket_path(display)))
            if p not in orphan_pids)
    was = bool((shell_pid and _pid_alive(shell_pid))
               or (dbus_pid and _pid_alive(dbus_pid))
               or any(_pid_alive(p) for p in orphan_pids))

    _kill_graceful(shell_pid, grace_s=STOP_GRACE_S)
    _kill_graceful(dbus_pid, grace_s=1.5)
    for opid in orphan_pids:
        if opid in (shell_pid, dbus_pid, os.getpid()):
            continue
        _kill_graceful(opid, grace_s=1.0)

    sock = nest_socket_path(display)
    for stale in (sock, Path(str(sock) + ".lock")):
        try:
            if stale.exists():
                stale.unlink()
        except OSError:
            pass

    try:
        if bus_path.exists():
            bus_path.unlink()
    except OSError:
        pass

    for pid_file in (d / "shell.pid", d / "dbus.pid"):
        try:
            if pid_file.is_file():
                pid_file.unlink()
        except OSError:
            pass

    if cfg:
        _write_status(cfg, phase="stopped")
    elif force and d.is_dir():
        pass
    return was


def restart(
    *,
    name: str = DEFAULT_NAME,
    **start_kwargs: Any,
) -> NestedConfig:
    cfg = load_config(name)
    stop(name=name, force=True)
    kwargs: dict[str, Any] = {
        "name":
        name,
        "replace":
        True,
        "size":
        start_kwargs.get("size") or (cfg.size if cfg else DEFAULT_SIZE),
        "scale":
        start_kwargs.get("scale") or (cfg.scale if cfg else DEFAULT_SCALE),
        "num_monitors":
        (start_kwargs["num_monitors"] if "num_monitors" in start_kwargs else
         (getattr(cfg, "num_monitors", DEFAULT_MONITORS)
          if cfg else DEFAULT_MONITORS)),
        "unsafe_mode":
        (start_kwargs["unsafe_mode"] if "unsafe_mode" in start_kwargs else
         (cfg.unsafe_mode if cfg else True)),
        "allow_x11":
        bool(start_kwargs.get("allow_x11", False)),
    }
    display = start_kwargs.get("display") or (cfg.display if cfg else None)
    if display:
        kwargs["display"] = display
    host_wl = start_kwargs.get("host_wayland") or (cfg.host_wayland
                                                   if cfg else None)
    if host_wl:
        kwargs["host_wayland"] = host_wl
    return start(**kwargs)


def status_dict(name: str = DEFAULT_NAME) -> dict[str, Any]:
    name = _safe_name(name)
    # Heal lying pid files / leftover bus socket so status is trustworthy.
    reaped = reap_stale(name)
    cfg = load_config(name)
    d = session_dir(name)
    shell_pid = _read_pid(d / "shell.pid") if d.is_dir() else None
    dbus_pid = _read_pid(d / "dbus.pid") if d.is_dir() else None
    running = is_running(name)
    shell_ready = False
    forge_ready = False
    if running and cfg:
        shell_ready = name_has_owner(cfg.bus_address, "org.gnome.Shell")
        forge_ready = name_has_owner(cfg.bus_address,
                                     "org.gnome.Shell.Extensions.Forge")
    out: dict[str, Any] = {
        "name": name,
        "running": running,
        "shell_ready": shell_ready,
        "forge_ready": forge_ready,
        "shell_pid":
        shell_pid if shell_pid and _pid_alive(shell_pid) else None,
        "dbus_pid": dbus_pid if dbus_pid and _pid_alive(dbus_pid) else None,
        "state_dir": str(d),
        "reaped_stale": reaped,
    }
    if cfg:
        out.update({
            "display":
            cfg.display,
            "host_wayland":
            cfg.host_wayland,
            "size":
            cfg.size,
            "scale":
            cfg.scale,
            "num_monitors":
            getattr(cfg, "num_monitors", DEFAULT_MONITORS),
            "bus_address":
            cfg.bus_address,
            "socket":
            str(nest_socket_path(cfg.display)),
            "socket_exists":
            nest_socket_path(cfg.display).is_socket(),
            "env_sh":
            str(d / "env.sh"),
            "shell_log":
            str(d / "shell.log"),
        })
    return out


def _write_status(cfg: NestedConfig, *, phase: str) -> None:
    d = Path(cfg.state_dir)
    payload = {
        "phase": phase,
        "updated_at": time.time(),
        "name": cfg.name,
        "display": cfg.display,
        "bus_address": cfg.bus_address,
    }
    try:
        (d / "status.json").write_text(json.dumps(payload, indent=2) + "\n",
                                       encoding="utf-8")
    except OSError:
        pass


def enable_forge_extension(
    bus_address: str,
    *,
    uuid: str = FORGE_UUID,
) -> dict[str, Any]:
    """Enable Forge on the nested bus (gsettings + gnome-extensions)."""
    env = os.environ.copy()
    env["DBUS_SESSION_BUS_ADDRESS"] = bus_address
    notes: list[str] = []

    # gsettings: set enabled-extensions to include uuid
    try:
        get = subprocess.run(
            ["gsettings", "get", "org.gnome.shell", "enabled-extensions"],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
            env=env,
        )
        raw = (get.stdout or "").strip()
        # Parse GVariant list of strings roughly
        enabled: list[str] = []
        if raw.startswith("[") and raw.endswith("]"):
            inner = raw[1:-1].strip()
            if inner:
                for part in inner.split(","):
                    part = part.strip().strip("'\"")
                    if part:
                        enabled.append(part)
        if uuid not in enabled:
            enabled.append(uuid)
        gvariant = "[" + ", ".join(f"'{u}'" for u in enabled) + "]"
        setp = subprocess.run(
            [
                "gsettings",
                "set",
                "org.gnome.shell",
                "enabled-extensions",
                gvariant,
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
            env=env,
        )
        if setp.returncode != 0:
            notes.append(
                f"gsettings set failed: {(setp.stderr or setp.stdout or '').strip()}"
            )
        else:
            notes.append("gsettings enabled-extensions updated")
    except FileNotFoundError:
        notes.append("gsettings missing")
    except subprocess.TimeoutExpired:
        notes.append("gsettings timeout")

    if shutil.which("gnome-extensions"):
        try:
            en = subprocess.run(
                ["gnome-extensions", "enable", uuid],
                check=False,
                capture_output=True,
                text=True,
                timeout=8,
                env=env,
            )
            if en.returncode != 0:
                notes.append("gnome-extensions enable: " +
                             ((en.stderr or en.stdout or "").strip()
                              or str(en.returncode)))
            else:
                notes.append("gnome-extensions enable ok")
        except subprocess.TimeoutExpired:
            notes.append(
                "gnome-extensions enable timed out (often ok on nest)")
        except OSError as e:
            notes.append(f"gnome-extensions enable error: {e}")
    else:
        notes.append("gnome-extensions CLI missing")

    # Nested shell: enable via extensionManager (needs --unsafe-mode Eval).
    ok, payload = shell_eval(
        bus_address,
        ("(function(){ try { "
         f'const ext = Main.extensionManager.lookup("{uuid}"); '
         'if (!ext) return "missing"; '
         "if (ext.state === 1) return \"already\"; "
         f'Main.extensionManager.enableExtension("{uuid}"); '
         'return "enabled"; '
         "} catch (e) { return String(e); } })()"),
        timeout=8.0,
    )
    notes.append(f"shell_eval={payload if ok else 'fail:' + payload}")

    forge_up = wait_forge_ready(bus_address, timeout_s=12.0)
    return {
        "uuid": uuid,
        "forge_ready": forge_up,
        "notes": notes,
    }


def merge_client_env(
    cfg: NestedConfig,
    base: Optional[Mapping[str, str]] = None,
) -> dict[str, str]:
    env = dict(base or os.environ)
    env.update(client_env(cfg))
    return env


def exec_in(
    cfg: NestedConfig,
    argv: Sequence[str],
    *,
    check: bool = False,
) -> int:
    if not argv:
        raise NestedError("exec requires a command")
    env = merge_client_env(cfg)
    proc = subprocess.run(list(argv), check=False, env=env)
    if check and proc.returncode != 0:
        raise NestedError(f"command failed ({proc.returncode}): {argv[0]}")
    return int(proc.returncode)


def run_campaign(
    argv: Sequence[str],
    *,
    name: str = DEFAULT_NAME,
    keep: bool = False,
    display: Optional[str] = None,
    size: Optional[str] = None,
    scale: str = DEFAULT_SCALE,
    num_monitors: int = DEFAULT_MONITORS,
    unsafe_mode: bool = True,
    allow_x11: bool = False,
    enable_forge: bool = True,
) -> int:
    """FIRM campaign entry: ensure nest up → run *argv* → always stop.

    Stops the nest on any exit path (success or error) unless *keep* is True,
    even if the nest was already running when this invocation began.
    """
    if not argv:
        raise NestedError("run requires a command")
    name = _safe_name(name)
    do_stop = should_stop_on_exit(
        always_stop=True,
        started_nest=False,
        keep=keep,
    )
    try:
        if not is_running(name):
            # replace=True clears stale sockets/pids left by a prior stop race.
            cfg = start(
                name=name,
                display=display,
                size=size or DEFAULT_SIZE,
                scale=scale or DEFAULT_SCALE,
                num_monitors=num_monitors,
                unsafe_mode=unsafe_mode,
                allow_x11=allow_x11,
                replace=True,
            )
            if enable_forge:
                enable_forge_extension(cfg.bus_address)
            # Cold open (ghostty) needs workareas before map-wait.
            wait_nest_client_ready(
                cfg.bus_address,
                min_monitors=int(num_monitors or DEFAULT_MONITORS),
            )
        cfg = load_config(name)
        if not cfg or not is_running(name):
            raise NestedError(
                f"nested session {name!r} not running after ensure-start")
        return exec_in(cfg, argv)
    finally:
        if do_stop:
            try:
                stop(name=name, force=True)
            except Exception:
                # Never mask the campaign return / primary error with stop noise.
                pass


def format_env_export(cfg: NestedConfig) -> str:
    parts = [
        f"export {k}={_shell_quote(v)}" for k, v in client_env(cfg).items()
    ]
    return "\n".join(parts) + "\n"


def format_status_text(st: Mapping[str, Any]) -> str:
    lines = [
        f"name:         {st.get('name')}",
        f"running:      {st.get('running')}",
        f"shell_ready:  {st.get('shell_ready')}",
        f"forge_ready:  {st.get('forge_ready')}",
        f"display:      {st.get('display', '—')}",
        f"host:         {st.get('host_wayland', '—')}",
        f"size:         {st.get('size', '—')}",
        f"monitors:     {st.get('num_monitors', '—')}",
        f"shell_pid:    {st.get('shell_pid')}",
        f"dbus_pid:     {st.get('dbus_pid')}",
        f"bus:          {st.get('bus_address', '—')}",
        f"socket:       {st.get('socket', '—')}",
        f"state_dir:    {st.get('state_dir')}",
        f"env:          {st.get('env_sh', '—')}",
        f"log:          {st.get('shell_log', '—')}",
    ]
    return "\n".join(lines) + "\n"


# --- CLI helpers used by forge binary ---------------------------------------


def cmd_nested(_backend: Any, args: Any) -> int:
    """Entry from ``forge-test nested …`` (short name for nested Wayland GNOME Shell)."""
    action = getattr(args, "nested_action", None) or "status"
    name = getattr(args, "nested_name", None) or DEFAULT_NAME
    try:
        if action == "start":
            return _cli_start(args, name)
        if action == "stop":
            was = stop(name=name, force=bool(getattr(args, "force", False)))
            print(
                f"forge-test nested: {'stopped' if was else 'not running'} ({name})"
            )
            return 0
        if action == "restart":
            return _cli_restart(args, name)
        if action == "status":
            st = status_dict(name)
            if getattr(args, "json", False):
                print(json.dumps(st, indent=2))
            else:
                sys.stdout.write(format_status_text(st))
            return 0 if st.get("running") else 1
        if action == "env":
            return _cli_env(args, name)
        if action == "exec":
            return _cli_exec(args, name)
        if action == "run":
            return _cli_run(args, name)
        if action == "invoke":
            from nest_invoke import cmd_invoke

            return cmd_invoke(args, name)
        if action == "dnd-drop":
            from nest_invoke import cmd_dnd_drop

            return cmd_dnd_drop(args, name)
        if action == "smoke-mark2":
            from nest_invoke import smoke_script_argv

            args.nested_cmd = smoke_script_argv()
            return _cli_run(args, name)
        if action == "smoke-layout-dnd":
            from nest_layout_dnd_smoke import smoke_script_argv as layout_dnd_argv

            if getattr(args, "monitors", None) is None:
                args.monitors = 2
            args.nested_cmd = layout_dnd_argv()
            return _cli_run(args, name)
        if action == "smoke-layout-ws":
            from nest_layout_ws_campaign import smoke_script_argv as layout_ws_argv

            if getattr(args, "monitors", None) is None:
                args.monitors = 2
            args.nested_cmd = layout_ws_argv()
            return _cli_run(args, name)
        if action == "smoke-layout-occupied":
            from nest_layout_occupied_smoke import (
                smoke_script_argv as layout_occupied_argv,
            )

            if getattr(args, "monitors", None) is None:
                args.monitors = 2
            args.nested_cmd = layout_occupied_argv()
            return _cli_run(args, name)
        if action == "smoke-layout-tabbed-edge":
            from nest_layout_tabbed_edge_smoke import (
                smoke_script_argv as layout_tabbed_edge_argv,
            )

            if getattr(args, "monitors", None) is None:
                args.monitors = 2
            args.nested_cmd = layout_tabbed_edge_argv()
            return _cli_run(args, name)
        if action == "enable-forge":
            return _cli_enable_forge(name)
        if action == "logs":
            return _cli_logs(args, name)
        if action == "wait":
            return _cli_wait(args, name)
        if action == "doctor":
            return _cli_doctor(args)
        print(f"forge-test nested: unknown action {action!r}", file=sys.stderr)
        return 2
    except NestedUnsupported as e:
        print(f"forge-test nested: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 2) or 2)
    except NestedError as e:
        print(f"forge-test nested: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)


def _cli_start(args: Any, name: str) -> int:
    nmon = getattr(args, "monitors", None)
    if nmon is None:
        nmon = DEFAULT_MONITORS
    # Default Full HD @ scale 1 per dummy mon (not host-matched). Dual-mon
    # nest is ~2×1920 wide; drag the nest window on the host desk.
    size = getattr(args, "size", None) or DEFAULT_SIZE
    cfg = start(
        name=name,
        display=getattr(args, "display", None),
        size=size,
        scale=str(getattr(args, "scale", None) or DEFAULT_SCALE),
        num_monitors=int(nmon),
        unsafe_mode=not bool(getattr(args, "safe_mode", False)),
        replace=bool(getattr(args, "replace", False)),
        allow_x11=bool(getattr(args, "allow_x11", False)),
    )
    print(f"forge-test nested: started {cfg.name}")
    print(f"  display:  {cfg.display} (host {cfg.host_wayland})")
    print(f"  size:     {cfg.size}")
    print(f"  monitors: {cfg.num_monitors}")
    print(f"  bus:      {cfg.bus_address}")
    print(f"  state:    {cfg.state_dir}")
    print(f"  env:      source {cfg.state_dir}/env.sh")
    print(
        "  clients:  forge-test nested exec -- <cmd>   # or eval $(forge-test nested env --export)"
    )

    if not bool(getattr(args, "no_enable", False)):
        result = enable_forge_extension(cfg.bus_address)
        print(
            f"  forge:    ready={result['forge_ready']} notes={result['notes']}"
        )
        if not result["forge_ready"]:
            print(
                "  hint:     install extension on host (./install), then: "
                "forge-test nested enable-forge  OR  forge-test nested restart",
                file=sys.stderr,
            )
            # Not a hard failure — nest is usable for plain shell tests.
    return 0


def _cli_restart(args: Any, name: str) -> int:
    prev = load_config(name)
    kwargs: dict[str, Any] = {
        "name": name,
        "allow_x11": bool(getattr(args, "allow_x11", False)),
    }
    if getattr(args, "size", None):
        kwargs["size"] = args.size
    if getattr(args, "scale", None):
        kwargs["scale"] = args.scale
    if getattr(args, "monitors", None) is not None:
        kwargs["num_monitors"] = int(args.monitors)
    elif prev is not None and getattr(prev, "num_monitors", None):
        kwargs["num_monitors"] = prev.num_monitors
    if bool(getattr(args, "safe_mode", False)):
        kwargs["unsafe_mode"] = False
    elif prev is not None:
        kwargs["unsafe_mode"] = prev.unsafe_mode
    cfg = restart(**kwargs)
    if not bool(getattr(args, "no_enable", False)):
        result = enable_forge_extension(cfg.bus_address)
        print(
            f"forge-test nested: restarted {cfg.name} forge_ready={result['forge_ready']}"
        )
    else:
        print(f"forge-test nested: restarted {cfg.name}")
    print(f"  display:  {cfg.display}")
    print(f"  monitors: {cfg.num_monitors}")
    print(f"  env:      source {cfg.state_dir}/env.sh")
    return 0


def _cli_env(args: Any, name: str) -> int:
    cfg = load_config(name)
    if not cfg or not is_running(name):
        print(f"forge-test nested: session {name!r} not running", file=sys.stderr)
        return 1
    if getattr(args, "json", False):
        print(json.dumps(client_env(cfg), indent=2))
        return 0
    if getattr(args, "export_env", False) or getattr(args, "export", False):
        sys.stdout.write(format_env_export(cfg))
        return 0
    # default: print env.sh path + contents hint
    print(f"# source {cfg.state_dir}/env.sh")
    sys.stdout.write(format_env_export(cfg))
    return 0


def _cli_exec(args: Any, name: str) -> int:
    """Run *cmd* in nest client env. Nest must already be running.

    Does not start or stop the nest (interactive use). Prefer
    ``forge-test nested run`` for campaign entry that always cleans up.
    """
    # Heal lying pids so we do not exec against a dead session.
    reap_stale(name)
    cfg = load_config(name)
    if not cfg or not is_running(name):
        print(f"forge-test nested: session {name!r} not running", file=sys.stderr)
        return 1
    argv = list(getattr(args, "nested_cmd", None) or [])
    if argv and argv[0] == "--":
        argv = argv[1:]
    if not argv:
        print("forge-test nested exec: need a command after --", file=sys.stderr)
        return 2
    return exec_in(cfg, argv)


def _cli_run(args: Any, name: str) -> int:
    """Campaign entry: start if needed → exec → always stop (unless --keep)."""
    argv = list(getattr(args, "nested_cmd", None) or [])
    if argv and argv[0] == "--":
        argv = argv[1:]
    if not argv:
        print("forge-test nested run: need a command after --", file=sys.stderr)
        return 2
    nmon = getattr(args, "monitors", None)
    if nmon is None:
        nmon = DEFAULT_MONITORS
    size = getattr(args, "size", None)
    keep = bool(getattr(args, "keep", False))
    rc = run_campaign(
        argv,
        name=name,
        keep=keep,
        display=getattr(args, "display", None),
        size=size,
        scale=str(getattr(args, "scale", None) or DEFAULT_SCALE),
        num_monitors=int(nmon),
        unsafe_mode=not bool(getattr(args, "safe_mode", False)),
        allow_x11=bool(getattr(args, "allow_x11", False)),
        enable_forge=not bool(getattr(args, "no_enable", False)),
    )
    if keep:
        print(f"forge-test nested run: kept session {name!r} (--keep)",
              file=sys.stderr)
    return rc


def _cli_enable_forge(name: str) -> int:
    cfg = load_config(name)
    if not cfg or not is_running(name):
        print(f"forge-test nested: session {name!r} not running", file=sys.stderr)
        return 1
    result = enable_forge_extension(cfg.bus_address)
    print(json.dumps(result, indent=2))
    return 0 if result.get("forge_ready") else 1


def _cli_logs(args: Any, name: str) -> int:
    d = session_dir(name)
    log = d / "shell.log"
    if not log.is_file():
        print(f"forge-test nested: no log at {log}", file=sys.stderr)
        return 1
    follow = bool(getattr(args, "follow", False))
    if follow:
        proc = subprocess.run(
            ["tail", "-n", "50", "-F", str(log)], check=False)
        return int(proc.returncode)
    sys.stdout.write(log.read_text(encoding="utf-8", errors="replace"))
    return 0


def _cli_wait(args: Any, name: str) -> int:
    cfg = load_config(name)
    if not cfg:
        print(f"forge-test nested: no session {name!r}", file=sys.stderr)
        return 1
    want_forge = bool(getattr(args, "wait_forge", False))
    timeout = float(getattr(args, "timeout", None) or SHELL_READY_TIMEOUT_S)
    if not wait_shell_ready(cfg.bus_address, timeout_s=timeout):
        print("forge-test nested: shell not ready", file=sys.stderr)
        return 1
    if want_forge and not wait_forge_ready(cfg.bus_address, timeout_s=timeout):
        print("forge-test nested: forge DBus not ready", file=sys.stderr)
        return 1
    print("ready")
    return 0


def _cli_doctor(args: Any) -> int:
    """Report whether this host can run nested Wayland (no side effects)."""
    session = host_session_type()
    missing = check_deps()
    can = can_nested_on_host()
    host_wl = None
    host_err = None
    try:
        host_wl = host_wayland_display()
    except NestedError as e:
        host_err = str(e)
    payload = {
        "hostSession":
        session,
        "canNested":
        can,
        "toolsMissing":
        missing,
        "hostWayland":
        host_wl,
        "hostWaylandError":
        host_err,
        "allowX11Env":
        allow_x11_host(),
        "command":
        "forge-test nested",
        "note": ("Short name for nested Wayland GNOME Shell retests "
                 "(not nested X11). On X11 use HUP instead."),
    }
    if getattr(args, "json", False):
        print(json.dumps(payload, indent=2))
    else:
        print(f"host_session:   {session}")
        print(f"can_nested:     {can}")
        print(f"tools_missing:  {', '.join(missing) if missing else '—'}")
        print(f"host_wayland:   {host_wl or '—'}")
        if host_err:
            print(f"host_wl_error:  {host_err}")
        print("command:        forge-test nested   # nested Wayland GNOME Shell")
        if not can:
            print("guidance:")
            for line in x11_refuse_message(session).splitlines():
                print(f"  {line}")
    return 0 if can else 2
