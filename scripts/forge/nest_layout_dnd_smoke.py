#!/usr/bin/env python3
"""Nest campaign: dual-mon layout + occupied dest-monitor DnD. Use via nested run."""

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
    build_dnd_drop_js,
    dnd_token_to_selector,
    get_tree,
    iter_nodes,
    parse_invoke_result,
    wait_window_count,
)

VERSION = "1"
DEFAULT_PROFILE = "_forge-test-ghosttys"
DEFAULT_DEST_MONITOR = 1
DEFAULT_TILE = "leftmost"
BAG_LAYOUTS = frozenset({"TABBED", "STACKED"})
PERSONAL_PROFILES = frozenset({"dev", "t1"})
ENTRY = (
    "./scripts/forge/forge-test nested run --monitors=2 -- "
    "python3 ./scripts/forge/nest_layout_dnd_smoke.py"
)
_FOREST_MATCH_TOKENS = (
    "forest-match failed",
    "required TILE slot(s) not in-slot",
    "hard-failed",
)


class CampaignError(RuntimeError):
    """User-facing campaign failure."""

    def __init__(self, message: str, *, exit_code: int = 1) -> None:
        super().__init__(message)
        self.exit_code = exit_code


def smoke_script_path() -> Path:
    return Path(__file__).resolve()


def smoke_script_argv() -> list[str]:
    return [sys.executable, str(smoke_script_path())]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="nest_layout_dnd_smoke.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=(
            "Nested Wayland campaign: apply _forge-test-ghosttys, assert "
            "forge tree (no TABBED/STACKED CON child; mon0 ghostty, mon1 "
            "ghostty), then synthetic dnd-drop TILE --dest-monitor 1 "
            "while dest already has a tile (occupied dest — not L1.r015 empty-mon). "
            "Nautilus is a nest GApplication stub (no TILE); use --profile "
            "_forge-test-nest-dual only when a real nest Nautilus maps."
        ),
        epilog=(
            "Requires nest --monitors=2. Layout profiles stay shared; never "
            "personal dev/t1. Never close a host agent Ghostty (this script "
            "runs inside nest only).\n"
            "\n"
            f"Entry (always stops):\n  {ENTRY}\n"
            "Alias (defaults --monitors=2):\n"
            "  ./scripts/forge/forge-test nested smoke-layout-dnd\n"
            "\n"
            "Dependencies: python3, forge, gdbus.\n"
            "Exit: 0 ok; 1 nested tabs / forest-match / drop fail; "
            "2 not in nest env; 127 missing binary."
        ),
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print campaign plan; do not talk to Shell",
    )
    p.add_argument("--json", dest="json_out", action="store_true", help="Print JSON")
    p.add_argument(
        "--profile",
        default=DEFAULT_PROFILE,
        help=f"Test layout profile (default {DEFAULT_PROFILE})",
    )
    p.add_argument(
        "--dest-monitor",
        dest="dest_monitor",
        type=int,
        default=DEFAULT_DEST_MONITOR,
        help="Occupied dest monitor for dnd-drop (default 1)",
    )
    p.add_argument(
        "--tile",
        default=DEFAULT_TILE,
        help="Dragged TILE selector/hint (default leftmost)",
    )
    p.add_argument(
        "--timeout",
        type=float,
        default=180.0,
        help="forge layout timeout seconds (default 180)",
    )
    p.add_argument(
        "--dnd-timeout",
        type=float,
        default=8.0,
        help="Shell.Eval dnd-drop timeout seconds (default 8)",
    )
    return p


def parse_argv(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    return build_parser().parse_args(list(argv) if argv is not None else None)


def campaign_plan(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "ok": True,
        "dryRun": True,
        "profile": str(args.profile),
        "destMonitor": int(args.dest_monitor),
        "tile": str(args.tile),
        "occupiedDest": True,
        "monitors": 2,
        "entry": ENTRY,
        "steps": [
            "seed 2 ghostty TILES in nest (close extras)",
            f"forge layout {args.profile} (FORGE_JOB=0)",
            "assert forge tree JSON: no TABBED/STACKED CON child; "
            "mon0 ghostty; mon1 ghostty",
            f"dnd-drop {args.tile} --dest-monitor {args.dest_monitor} "
            "while dest has a tile (occupied dest)",
            "exit non-zero if nested tabs or forest-match fail",
        ],
    }


def print_plan(args: argparse.Namespace) -> None:
    plan = campaign_plan(args)
    if getattr(args, "json_out", False):
        print(json.dumps(plan, indent=2))
        return
    print("nest layout+dnd smoke (dry-run)")
    print(f"  profile:      {plan['profile']}")
    print(f"  monitors:     {plan['monitors']} (need nest --monitors=2)")
    print(
        f"  dest-monitor: {plan['destMonitor']} "
        "(occupied dest — not L1.r015 empty-mon)"
    )
    print(f"  tile:         {plan['tile']}")
    print("  steps:")
    for i, step in enumerate(plan["steps"], start=1):
        print(f"    {i}. {step}")
    print(f"  entry: {plan['entry']}")


def _wm_class(win: Mapping[str, Any]) -> str:
    return str(win.get("wmClass") or win.get("wm_class") or "").strip()


def is_ghostty_win(win: Mapping[str, Any]) -> bool:
    return "ghostty" in _wm_class(win).lower()


def is_nautilus_win(win: Mapping[str, Any]) -> bool:
    c = _wm_class(win).lower()
    return "nautilus" in c or c in ("org.gnome.nautilus",)


def is_placeholder_win(win: Mapping[str, Any]) -> bool:
    if win.get("placeholder") is True:
        return True
    return _wm_class(win).lower() == "forge-placeholder"


def is_tile_win(win: Mapping[str, Any]) -> bool:
    mode = str(win.get("mode") or "").upper()
    return mode in ("", "TILE")


def windows_with_mon(forest: Mapping[str, Any]) -> list[tuple[int, dict[str, Any]]]:
    out: list[tuple[int, dict[str, Any]]] = []
    roots = forest.get("monitors") or []
    if not isinstance(roots, list):
        return out
    for i, mon in enumerate(roots):
        if not isinstance(mon, dict):
            continue
        for n in iter_nodes(mon):
            nt = str(n.get("nodeType") or n.get("type") or "")
            if nt == "WINDOW":
                out.append((i, n))
    return out


def tiled_on_mon(forest: Mapping[str, Any], mon_i: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, w in windows_with_mon(forest):
        if i != mon_i:
            continue
        if not is_tile_win(w) or is_placeholder_win(w):
            continue
        out.append(w)
    return out


def dest_has_tiles(forest: Mapping[str, Any], dest_mon: int) -> bool:
    return len(tiled_on_mon(forest, dest_mon)) > 0


def window_mon_index(forest: Mapping[str, Any], window_id: str) -> Optional[int]:
    want = str(window_id)
    for i, w in windows_with_mon(forest):
        if str(w.get("windowId") or "") == want:
            return i
    return None


def find_bag_con_children(forest: Mapping[str, Any]) -> list[str]:
    """TABBED/STACKED nodes whose child is CON (nested tab chrome)."""
    bad: list[str] = []

    def walk(node: Any, path: str) -> None:
        if not isinstance(node, dict):
            return
        nt = str(node.get("nodeType") or node.get("type") or "").upper()
        lay = str(node.get("layout") or "").upper()
        here = f"{path}/{nt}:{lay or '-'}"
        kids = node.get("children") or node.get("childNodes") or []
        if not isinstance(kids, list):
            kids = []
        if lay in BAG_LAYOUTS:
            for i, child in enumerate(kids):
                if not isinstance(child, dict):
                    continue
                cnt = str(child.get("nodeType") or child.get("type") or "").upper()
                if cnt == "CON":
                    clay = str(child.get("layout") or "").upper()
                    bad.append(f"{here} child[{i}] CON {clay or '-'}")
        for i, child in enumerate(kids):
            walk(child, f"{here}[{i}]")

    roots = forest.get("monitors") or []
    if not isinstance(roots, list):
        return ["forge tree JSON: missing monitors[]"]
    for i, mon in enumerate(roots):
        walk(mon, f"mon{i}")
    return bad


def required_slots_errors(forest: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []
    roots = forest.get("monitors") or []
    nmon = len(roots) if isinstance(roots, list) else 0
    if nmon < 2:
        errors.append(
            f"need 2 monitors, have {nmon} (use nested run --monitors=2)"
        )
        return errors
    m0 = tiled_on_mon(forest, 0)
    m1 = tiled_on_mon(forest, 1)
    if not any(is_ghostty_win(w) for w in m0):
        errors.append("mon0 missing ghostty")
    if not any(is_ghostty_win(w) for w in m1):
        errors.append("mon1 missing ghostty")
    return errors


def layout_failure_reason(rc: int, text: str) -> Optional[str]:
    blob = text or ""
    for tok in _FOREST_MATCH_TOKENS:
        if tok in blob:
            return f"forest-match fail ({tok})"
    if rc != 0:
        return f"forge layout exit {rc}"
    return None


def assert_forest_oracles(forest: Mapping[str, Any], *, stage: str) -> None:
    bags = find_bag_con_children(forest)
    if bags:
        detail = "; ".join(bags[:8])
        raise CampaignError(f"{stage}: nested TABBED/STACKED CON child: {detail}")
    slots = required_slots_errors(forest)
    if stage == "after-layout" and slots:
        raise CampaignError(f"{stage}: {'; '.join(slots)}")


def _layout_env(base: Optional[Mapping[str, str]] = None) -> dict[str, str]:
    env = _gui_env(base)
    env["FORGE_JOB"] = "0"
    env.pop("FORGE_JOB_WORKER", None)
    return env


def _forge_argv(env: Mapping[str, str]) -> list[str]:
    forge = shutil.which("forge", path=env.get("PATH"))
    if forge:
        return [forge]
    local = _SCRIPT_DIR / "forge"
    if local.is_file():
        return [sys.executable, str(local)]
    raise CampaignError(
        "missing forge on PATH (install: ./install)",
        exit_code=127,
    )


def _require_gdbus() -> None:
    if shutil.which("gdbus"):
        return
    raise CampaignError(
        "missing gdbus on PATH (install: sudo apt install libglib2.0-bin)",
        exit_code=127,
    )


def refuse_personal_profile(name: str) -> str:
    n = (name or "").strip()
    if not n:
        raise CampaignError("layout profile required")
    if n in PERSONAL_PROFILES:
        raise CampaignError(
            f"refusing personal profile {n!r}; use {DEFAULT_PROFILE}"
        )
    return n


def ghostty_argv() -> Optional[list[str]]:
    exe = shutil.which("ghostty")
    if not exe:
        return None
    return [exe]


def seed_nest_dual_clients(bus_address: str, env: Mapping[str, str]) -> int:
    """Open two Ghostty TILEs. Nest Nautilus is a GApplication stub (no TILE)."""
    from nest_invoke import close_window_id, tiled_windows

    gui = _layout_env(env)
    gt = ghostty_argv()
    if not gt:
        raise CampaignError("missing ghostty on PATH", exit_code=127)
    _launch_one(gui, gt, bus_address)
    wait_window_count(bus_address, 1, timeout_s=20.0)
    if len(tiled_windows(get_tree(bus_address))) < 2:
        _launch_one(gui, gt, bus_address)
        wait_window_count(bus_address, 2, timeout_s=20.0)
    wins = tiled_windows(get_tree(bus_address))
    extra = sorted(wins, key=lambda w: str(w.get("windowId") or ""))
    while len(extra) > 2:
        drop = extra.pop()
        close_window_id(bus_address, str(drop.get("windowId")))
        time.sleep(0.3)
        extra = tiled_windows(get_tree(bus_address))
    n = len(tiled_windows(get_tree(bus_address)))
    if n < 2:
        raise CampaignError(f"seed need 2 ghostty TILES (have {n})")
    return n


def run_layout(
    profile: str,
    env: Mapping[str, str],
    *,
    timeout_s: float,
) -> str:
    argv = [*_forge_argv(env), "layout", profile]
    try:
        proc = subprocess.run(
            argv,
            env=dict(env),
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
    except subprocess.TimeoutExpired as e:
        raise CampaignError(
            f"forge layout {profile} timed out after {timeout_s}s"
        ) from e
    text = f"{proc.stdout or ''}\n{proc.stderr or ''}"
    reason = layout_failure_reason(int(proc.returncode), text)
    if reason:
        tail = text.strip()[-2000:]
        raise CampaignError(f"{reason}\n{tail}" if tail else reason)
    return text


def dnd_drop_dest_monitor(
    bus_address: str,
    *,
    tile: str,
    dest_monitor: int,
    timeout: float,
) -> dict[str, Any]:
    from nested_wayland import shell_eval

    forest = get_tree(bus_address)
    tile_sel = dnd_token_to_selector(tile, forest)
    spec: dict[str, Any] = {
        "tile": tile_sel,
        "onto": "",
        "zone": "CENTER",
        "quiet": True,
        "simulateEnteredMonitor": True,
        "destMonitor": int(dest_monitor),
    }
    js = build_dnd_drop_js(spec)
    ok, payload = shell_eval(bus_address, js, timeout=timeout)
    if not ok:
        raise CampaignError(f"Shell.Eval dnd-drop failed: {payload}")
    result = parse_invoke_result(payload)
    if not result.get("ok"):
        err = result.get("error") or str(result)
        raise CampaignError(
            f"occupied dest-monitor {dest_monitor} drop failed: {err}"
        )
    result["tileSelector"] = tile_sel
    return result


def run_campaign_on_bus(
    bus_address: str,
    args: argparse.Namespace,
    *,
    env: Optional[Mapping[str, str]] = None,
) -> dict[str, Any]:
    from nested_wayland import wait_forge_ready

    profile = refuse_personal_profile(str(args.profile))
    dest = int(args.dest_monitor)
    if dest < 0:
        raise CampaignError(f"dest-monitor must be >= 0 (got {dest})")
    _require_gdbus()
    if not wait_forge_ready(bus_address, timeout_s=12.0):
        raise CampaignError("Forge DBus not ready")
    gui = _layout_env(env)
    try:
        seed_nest_dual_clients(bus_address, gui)
    except InvokeError as e:
        raise CampaignError(f"seed nest clients: {e}") from e
    time.sleep(0.4)
    layout_out = run_layout(profile, gui, timeout_s=float(args.timeout))
    time.sleep(0.5)
    forest = get_tree(bus_address)
    assert_forest_oracles(forest, stage="after-layout")
    if not dest_has_tiles(forest, dest):
        raise CampaignError(
            f"dest-monitor {dest} has no TILE (occupied dest required; "
            "not L1.r015 empty-mon)"
        )
    tile_sel = dnd_token_to_selector(str(args.tile), forest)
    if not tile_sel.startswith("id:"):
        raise CampaignError(f"could not resolve tile {args.tile!r}")
    wid = tile_sel[3:]
    src_mon = window_mon_index(forest, wid)
    if src_mon is None:
        raise CampaignError(f"tile {tile_sel} not in forge tree")
    if src_mon == dest:
        raise CampaignError(
            f"tile {args.tile} already on dest-monitor {dest}; "
            "need a source TILE for occupied dest drop"
        )
    drop = dnd_drop_dest_monitor(
        bus_address,
        tile=str(args.tile),
        dest_monitor=dest,
        timeout=float(args.dnd_timeout),
    )
    time.sleep(1.0)
    after = get_tree(bus_address)
    bags = find_bag_con_children(after)
    if bags:
        detail = "; ".join(bags[:8])
        raise CampaignError(f"after-dnd: nested TABBED/STACKED CON child: {detail}")
    landed = window_mon_index(after, wid)
    if landed != dest:
        raise CampaignError(
            f"occupied dest-monitor drop did not rehome {tile_sel} "
            f"srcMon={src_mon} destMon={dest} afterMon={landed} drop={drop}"
        )
    if not dest_has_tiles(after, dest):
        raise CampaignError(f"dest-monitor {dest} empty after drop")
    return {
        "ok": True,
        "profile": profile,
        "destMonitor": dest,
        "tile": str(args.tile),
        "tileSelector": tile_sel,
        "srcMonitor": src_mon,
        "afterMonitor": landed,
        "occupiedDest": True,
        "drop": drop,
        "layoutTail": (layout_out or "")[-800:],
    }


def cmd_from_env(args: Optional[argparse.Namespace] = None) -> int:
    parsed = args if args is not None else parse_argv(sys.argv[1:])
    if parsed.dry_run:
        print_plan(parsed)
        return 0
    bus = str(os.environ.get("DBUS_SESSION_BUS_ADDRESS") or "").strip()
    display = str(os.environ.get("WAYLAND_DISPLAY") or "").strip()
    if not bus or not display:
        print(
            "nest layout+dnd: run inside nest env:\n"
            f"  {ENTRY}\n"
            "  ./scripts/forge/forge-test nested smoke-layout-dnd",
            file=sys.stderr,
        )
        return 2
    try:
        payload = run_campaign_on_bus(bus, parsed, env=os.environ)
    except CampaignError as e:
        print(f"nest layout+dnd: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    except InvokeError as e:
        print(f"nest layout+dnd: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    if parsed.json_out:
        print(json.dumps(payload, indent=2, default=str))
    else:
        print(
            "nest layout+dnd: ok "
            f"profile={payload.get('profile')} "
            f"tile={payload.get('tileSelector')} "
            f"dest-monitor={payload.get('destMonitor')} occupied"
        )
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    try:
        parsed = parse_argv(list(argv) if argv is not None else sys.argv[1:])
    except SystemExit as e:
        code = e.code
        return 0 if code in (0, None) else (code if isinstance(code, int) else 1)
    return cmd_from_env(parsed)


if __name__ == "__main__":
    sys.exit(main())
