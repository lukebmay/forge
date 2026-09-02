#!/usr/bin/env python3
"""Nest smoke: launch usual desk apps and assert they map as Meta windows in-nest.

Proves client isolation (private XDG_RUNTIME_DIR + nest D-Bus + Chrome profile)
so campaigns are not limited to ghostty. Use via:

  ./scripts/forge/forge-test nested smoke-nest-apps
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from nest_invoke import (  # noqa: E402
    InvokeError,
    _gui_env,
    _launch_one,
    close_window_id,
    get_tree,
    require_nest_client_env,
    tiled_windows,
)
from nest_layout_dnd_smoke import (  # noqa: E402
    CampaignError,
    is_placeholder_win,
    is_tile_win,
)
from nested_wayland import (  # noqa: E402
    nest_launch_argv_for_state,
    nest_state_dir_from_env,
)

VERSION = "1"
ENTRY = "./scripts/forge/forge-test nested smoke-nest-apps"

# (label, argv factory, wm_class substrings to accept)
APP_SPECS: tuple[tuple[str, tuple[str, ...], tuple[str, ...]], ...] = (
    # Nautilus first: Tracker/GVFS cold-start can take ~20s; avoid competing
    # with Chrome/Ghostty for the first nest map.
    ("nautilus", ("nautilus", "--new-window"), ("nautilus", "org.gnome.nautilus")),
    ("ghostty", ("ghostty",), ("ghostty", "com.mitchellh.ghostty")),
    (
        "text-editor",
        ("gnome-text-editor", "--new-window"),
        ("texteditor", "org.gnome.texteditor"),
    ),
    (
        "chrome",
        ("google-chrome-stable", "about:blank"),
        ("google-chrome", "chromium"),
    ),
)


def smoke_script_path() -> Path:
    return Path(__file__).resolve()


def smoke_script_argv() -> list[str]:
    return [sys.executable, str(smoke_script_path())]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="nest_apps_smoke.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=(
            "Launch ghostty / nautilus / text-editor / chrome into the nest and "
            "assert each appears as a Meta window on the nest Shell."
        ),
        epilog=f"Entry:\n  {ENTRY}\n",
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--json", dest="json_out", action="store_true")
    p.add_argument("--keep-windows", action="store_true")
    return p


def _require_nest(env: Mapping[str, str]) -> None:
    try:
        require_nest_client_env(env, what="nest-apps")
    except InvokeError as e:
        raise CampaignError(str(e), exit_code=int(getattr(e, "exit_code", 2) or 2)) from e


def _bus(env: Mapping[str, str]) -> str:
    return str(env.get("DBUS_SESSION_BUS_ADDRESS") or "")


def parse_proc_environ(raw: bytes) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in raw.split(b"\0"):
        if not part or b"=" not in part:
            continue
        k, _, v = part.partition(b"=")
        out[k.decode("utf-8", "replace")] = v.decode("utf-8", "replace")
    return out


def pid_from_window(win: Mapping[str, Any]) -> Optional[int]:
    raw = win.get("pid")
    try:
        pid = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return pid if pid > 0 else None


def host_spill_pids(needles: Sequence[str]) -> list[int]:
    """PIDs whose cmdline matches *needles* and WAYLAND_DISPLAY is the host."""
    out: list[int] = []
    encoded = [n.lower().encode("utf-8") for n in needles if n]
    if not encoded:
        return out
    try:
        names = os.listdir("/proc")
    except OSError:
        return out
    me = os.getpid()
    for name in names:
        if not name.isdigit():
            continue
        pid = int(name)
        if pid == me:
            continue
        try:
            cmd = Path(f"/proc/{pid}/cmdline").read_bytes()
        except OSError:
            continue
        low = cmd.lower()
        if not any(n in low for n in encoded):
            continue
        try:
            env_map = read_proc_environ(pid)
        except CampaignError:
            continue
        wd = str(env_map.get("WAYLAND_DISPLAY") or "").strip()
        if wd and "forge" not in wd:
            out.append(pid)
    return out


def assert_nest_client_environ(
    env_map: Mapping[str, str], *, what: str = "client"
) -> None:
    wd = str(env_map.get("WAYLAND_DISPLAY") or "").strip()
    rt = str(env_map.get("XDG_RUNTIME_DIR") or "")
    # Chrome zygote often strips WAYLAND_DISPLAY and XDG_RUNTIME_DIR from
    # /proc/pid/environ. Nest Meta already proved the window is in-nest.
    if not wd and not rt:
        return
    if wd and "forge" not in wd:
        raise CampaignError(
            f"{what}: mapped app WAYLAND_DISPLAY={wd!r} is host "
            "(need nest display with 'forge')",
            exit_code=1,
        )
    if rt and "nested" not in rt:
        raise CampaignError(
            f"{what}: mapped app XDG_RUNTIME_DIR={rt!r} is not nest-scoped",
            exit_code=1,
        )


def read_proc_environ(pid: int) -> dict[str, str]:
    path = Path(f"/proc/{int(pid)}/environ")
    try:
        raw = path.read_bytes()
    except OSError as e:
        raise CampaignError(f"cannot read {path}: {e}") from e
    return parse_proc_environ(raw)


def pgrep_by_class(needles: Sequence[str]) -> Optional[int]:
    me = os.getpid()
    encoded = [n.lower().encode("utf-8") for n in needles if n]
    if not encoded:
        return None
    try:
        names = os.listdir("/proc")
    except OSError:
        return None
    for name in names:
        if not name.isdigit():
            continue
        pid = int(name)
        if pid == me:
            continue
        try:
            cmd = Path(f"/proc/{pid}/cmdline").read_bytes()
        except OSError:
            continue
        low = cmd.lower()
        if any(n in low for n in encoded):
            return pid
    return None


def _eval_meta_pid(bus: str, meta_id: str) -> Optional[int]:
    from nest_invoke import unpack_eval_payload
    from nested_wayland import shell_eval

    js = (
        "(function(){"
        f"const want=String({json.dumps(str(meta_id))});"
        "const ms=global.display.list_all_windows();"
        "for (const w of ms) {"
        "  if (String(w.get_id())===want) {"
        "    return String(w.get_pid ? w.get_pid() : 0);"
        "  }"
        "}"
        "return '0';"
        "})()"
    )
    ok, payload = shell_eval(bus, js, timeout=8.0)
    if not ok:
        return None
    try:
        text = unpack_eval_payload(payload)
        pid = int(str(text).strip().strip('"'))
        return pid if pid > 0 else None
    except (TypeError, ValueError):
        return None


def resolve_mapped_client_pid(
    bus: str,
    win: Mapping[str, Any],
    needles: Sequence[str],
) -> int:
    pid = pid_from_window(win)
    if pid:
        return pid
    meta_id = str(win.get("id") or win.get("windowId") or "")
    if meta_id:
        got = _eval_meta_pid(bus, meta_id)
        if got:
            return got
        try:
            for w in tiled_windows(get_tree(bus)):
                wid = str(w.get("windowId") or w.get("id") or "")
                if wid == meta_id:
                    pid = pid_from_window(w)
                    if pid:
                        return pid
        except InvokeError:
            pass
    pid = pgrep_by_class(needles)
    if pid:
        return pid
    raise CampaignError(
        f"no pid for mapped client class={list(needles)!r}",
        exit_code=1,
    )


def _meta_windows(bus: str) -> list[dict[str, Any]]:
    from nest_invoke import unpack_eval_payload
    from nested_wayland import shell_eval

    # Prefer list_all_windows — Nautilus can exist before a window actor appears.
    js = (
        "(function(){"
        "const ms = global.display.list_all_windows();"
        "return JSON.stringify(ms.map(w => ({"
        "id: String(w.get_id()),"
        "pid: (w.get_pid ? w.get_pid() : 0),"
        "wm: String((w.get_wm_class && w.get_wm_class()) || ''),"
        "title: String((w.get_title && w.get_title()) || '')"
        "})));"
        "})()"
    )
    ok, payload = shell_eval(bus, js, timeout=12.0)
    if not ok:
        raise CampaignError(f"Shell.Eval failed: {payload}")
    try:
        text = unpack_eval_payload(payload)
        data = json.loads(text)
        if isinstance(data, str):
            data = json.loads(data)
        if isinstance(data, list):
            return [w for w in data if isinstance(w, dict)]
    except Exception as e:
        raise CampaignError(f"parse windows failed: {e} payload={payload!r}") from e
    return []


def _resolve_argv(label: str, template: Sequence[str], env: Mapping[str, str]) -> Optional[list[str]]:
    exe = shutil.which(template[0], path=env.get("PATH"))
    if not exe:
        # chrome alias
        if label == "chrome":
            for cand in ("google-chrome-stable", "google-chrome", "chromium"):
                exe = shutil.which(cand, path=env.get("PATH"))
                if exe:
                    break
        if not exe:
            return None
    argv = [exe, *[str(a) for a in template[1:]]]
    state = nest_state_dir_from_env(env)
    if state is not None:
        argv = nest_launch_argv_for_state(state, argv)
    return argv


def _match_wm(wm: str, needles: Sequence[str]) -> bool:
    low = (wm or "").lower()
    return any(n.lower() in low for n in needles)


def _close_all(bus: str, env: Mapping[str, str]) -> int:
    n = 0
    for _ in range(16):
        wins = _meta_windows(bus)
        if not wins:
            break
        for w in wins:
            wid = str(w.get("id") or "")
            if not wid:
                continue
            try:
                close_window_id(bus, wid)
                n += 1
            except Exception:
                pass
        time.sleep(0.2)
    # Chrome often leaves a process holding the nest profile after Meta close.
    state = nest_state_dir_from_env(env)
    needle = b"chrome-profile"
    nest_marker = b"nested"
    if state is not None:
        import signal

        for name in list(os.listdir("/proc")):
            if not name.isdigit():
                continue
            try:
                cmd = open(f"/proc/{name}/cmdline", "rb").read()
            except OSError:
                continue
            if needle in cmd and nest_marker in cmd:
                try:
                    os.kill(int(name), signal.SIGTERM)
                    n += 1
                except ProcessLookupError:
                    pass
    return n


def run(env: Mapping[str, str], *, keep_windows: bool) -> dict[str, Any]:
    _require_nest(env)
    bus = _bus(env)
    if not bus:
        raise CampaignError("missing DBUS_SESSION_BUS_ADDRESS", exit_code=2)
    gui = _gui_env(env)
    results: list[dict[str, Any]] = []
    before_ids = {str(w.get("id")) for w in _meta_windows(bus)}

    # Nautilus often waits on Tracker (~15–25s) before first map on nest.
    wait_s = {"nautilus": 45.0, "chrome": 25.0}
    for label, template, needles in APP_SPECS:
        argv = _resolve_argv(label, template, env)
        if not argv:
            results.append({"label": label, "ok": False, "reason": "missing-binary"})
            continue
        before_spill = set(host_spill_pids(needles))
        try:
            _launch_one(gui, argv, bus)
        except Exception as e:  # noqa: BLE001
            results.append({"label": label, "ok": False, "reason": f"launch:{e}"})
            continue
        deadline = time.monotonic() + float(wait_s.get(label, 15.0))
        found = None
        while time.monotonic() < deadline:
            for w in _meta_windows(bus):
                wid = str(w.get("id") or "")
                if wid in before_ids:
                    continue
                if _match_wm(str(w.get("wm") or ""), needles):
                    found = w
                    break
            if found is not None:
                break
            time.sleep(0.5)
        if found is None:
            results.append(
                {
                    "label": label,
                    "ok": False,
                    "reason": "no-meta-window",
                    "argv": argv,
                }
            )
            continue
        pid: Optional[int] = None
        try:
            pid = resolve_mapped_client_pid(bus, found, needles)
            env_map = read_proc_environ(pid)
            assert_nest_client_environ(env_map, what=str(label))
            spill = set(host_spill_pids(needles)) - before_spill
            if spill:
                raise CampaignError(
                    f"{label}: host spill pids={sorted(spill)} "
                    "(new process on host WAYLAND_DISPLAY)",
                    exit_code=1,
                )
        except CampaignError as e:
            results.append(
                {
                    "label": label,
                    "ok": False,
                    "reason": str(e),
                    "windowId": found.get("id"),
                    "pid": pid,
                    "argv": argv,
                }
            )
            continue
        before_ids.add(str(found.get("id")))
        results.append(
            {
                "label": label,
                "ok": True,
                "windowId": found.get("id"),
                "wm": found.get("wm"),
                "title": found.get("title"),
                "pid": pid,
                "wayland": env_map.get("WAYLAND_DISPLAY"),
            }
        )

    closed = 0 if keep_windows else _close_all(bus, env)
    ok = all(r.get("ok") for r in results if r.get("reason") != "missing-binary")
    # Require at least ghostty + one non-ghostty success when binaries exist
    launched_ok = [r for r in results if r.get("ok")]
    non_ghost = [r for r in launched_ok if r.get("label") != "ghostty"]
    if not any(r.get("label") == "ghostty" and r.get("ok") for r in results):
        ok = False
    if not non_ghost:
        ok = False
    return {
        "ok": ok,
        "results": results,
        "closed": closed,
        "xdgRuntimeDir": env.get("XDG_RUNTIME_DIR"),
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if args.dry_run:
        print(json.dumps({"apps": [a[0] for a in APP_SPECS], "entry": ENTRY}, indent=2))
        return 0
    env = os.environ
    try:
        payload = run(env, keep_windows=bool(args.keep_windows))
    except CampaignError as e:
        print(f"FAIL: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    if args.json_out:
        print(json.dumps(payload, indent=2))
    else:
        print("nest-apps smoke")
        print(f"  XDG_RUNTIME_DIR={payload.get('xdgRuntimeDir')}")
        for r in payload.get("results") or []:
            if r.get("ok"):
                print(
                    f"  OK  {r.get('label')}: wm={r.get('wm')} "
                    f"id={r.get('windowId')} pid={r.get('pid')} "
                    f"wayland={r.get('wayland')}"
                )
            else:
                print(f"  FAIL {r.get('label')}: {r.get('reason')}")
        print(f"  closed={payload.get('closed')} ok={payload.get('ok')}")
    return 0 if payload.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
