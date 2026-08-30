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
import subprocess
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
    if not str(env.get("FORGE_CONFIG_HOME") or "").strip():
        raise CampaignError("missing FORGE_CONFIG_HOME (not in nest)", exit_code=2)
    wd = str(env.get("WAYLAND_DISPLAY") or "")
    if wd and "forge" not in wd:
        raise CampaignError(f"WAYLAND_DISPLAY={wd!r} is host", exit_code=2)
    rt = str(env.get("XDG_RUNTIME_DIR") or "")
    if "nested" not in rt and "forge" not in rt:
        raise CampaignError(
            f"XDG_RUNTIME_DIR={rt!r} is not nest-isolated — "
            "restart nest to pick up client_env isolation",
            exit_code=2,
        )


def _bus(env: Mapping[str, str]) -> str:
    return str(env.get("DBUS_SESSION_BUS_ADDRESS") or "")


def _meta_windows(bus: str) -> list[dict[str, Any]]:
    from nest_invoke import unpack_eval_payload
    from nested_wayland import shell_eval

    # Prefer list_all_windows — Nautilus can exist before a window actor appears.
    js = (
        "(function(){"
        "const ms = global.display.list_all_windows();"
        "return JSON.stringify(ms.map(w => ({"
        "id: String(w.get_id()),"
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
        before_ids.add(str(found.get("id")))
        results.append(
            {
                "label": label,
                "ok": True,
                "windowId": found.get("id"),
                "wm": found.get("wm"),
                "title": found.get("title"),
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
                print(f"  OK  {r.get('label')}: wm={r.get('wm')} id={r.get('windowId')}")
            else:
                print(f"  FAIL {r.get('label')}: {r.get('reason')}")
        print(f"  closed={payload.get('closed')} ok={payload.get('ok')}")
    return 0 if payload.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
