#!/usr/bin/env python3
"""Nest campaign: TABBED bag × edge DnD (LEFT/RIGHT/TOP/BOTTOM). H5 reload gate."""

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
    build_dnd_drop_js,
    close_window_id,
    dnd_token_to_selector,
    get_tree,
    parse_invoke_result,
    require_nest_client_env,
    tiled_windows,
    wait_window_count,
)
from nest_layout_dnd_smoke import (  # noqa: E402
    CampaignError,
    find_bag_con_children,
    ghostty_argv,
    is_ghostty_win,
    is_tile_win,
)
from nest_layout_ws_campaign import find_tabbed_groups  # noqa: E402

VERSION = "1"
EDGE_ZONES = ("LEFT", "RIGHT", "TOP", "BOTTOM")
ENTRY = (
    "./scripts/forge/forge-test nested run --monitors=2 -- "
    "python3 ./scripts/forge/nest_layout_tabbed_edge_smoke.py"
)


def smoke_script_path() -> Path:
    return Path(__file__).resolve()


def smoke_script_argv() -> list[str]:
    return [sys.executable, str(smoke_script_path())]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="nest_layout_tabbed_edge_smoke.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=(
            "Nested Wayland: seed 3 ghosttys, CENTER-join a TABBED pair, then "
            "edge-drop the third onto a tab for LEFT/RIGHT/TOP/BOTTOM. Assert "
            "the bag stays WINDOW-only and the dragged tile becomes a split "
            "sibling of the bag (H5 slotSplit)."
        ),
        epilog=(
            f"Entry (always stops):\n  {ENTRY}\n"
            "Alias:\n  ./scripts/forge/forge-test nested smoke-layout-tabbed-edge\n"
        ),
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    p.add_argument("--dry-run", action="store_true", help="Print plan only")
    p.add_argument("--json", dest="json_out", action="store_true", help="Print JSON")
    p.add_argument(
        "--zones",
        default=",".join(EDGE_ZONES),
        help=f"Comma zones to run (default {','.join(EDGE_ZONES)})",
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


def parse_zones(raw: str) -> list[str]:
    out: list[str] = []
    for part in str(raw or "").split(","):
        z = part.strip().upper()
        if not z:
            continue
        if z not in EDGE_ZONES:
            raise CampaignError(f"unknown zone {part!r}; want {EDGE_ZONES}")
        if z not in out:
            out.append(z)
    if not out:
        raise CampaignError("need at least one edge zone")
    return out


def campaign_plan(args: argparse.Namespace) -> dict[str, Any]:
    zones = parse_zones(str(args.zones))
    return {
        "ok": True,
        "dryRun": True,
        "zones": zones,
        "monitors": 2,
        "entry": ENTRY,
        "steps": [
            "for each zone: seed 3 ghostty TILES",
            "CENTER dnd-drop join a TABBED pair",
            "edge dnd-drop third onto a tab WINDOW",
            "assert bag WINDOW-only; dragged is H/V sibling of bag",
        ],
    }


def print_plan(args: argparse.Namespace) -> None:
    plan = campaign_plan(args)
    if getattr(args, "json_out", False):
        print(json.dumps(plan, indent=2))
        return
    print("nest tabbed-edge smoke (dry-run)")
    print(f"  zones:    {', '.join(plan['zones'])}")
    print(f"  monitors: {plan['monitors']}")
    print("  steps:")
    for i, step in enumerate(plan["steps"], start=1):
        print(f"    {i}. {step}")
    print(f"  entry: {plan['entry']}")


def _layout_env(base: Optional[Mapping[str, str]] = None) -> dict[str, str]:
    env = _gui_env(base)
    env["FORGE_JOB"] = "0"
    env.pop("FORGE_JOB_WORKER", None)
    return env


def _require_gdbus() -> None:
    if shutil.which("gdbus"):
        return
    raise CampaignError(
        "missing gdbus on PATH (install: sudo apt install libglib2.0-bin)",
        exit_code=127,
    )


def _win_id(win: Mapping[str, Any]) -> str:
    return str(win.get("windowId") or "")


def seed_three_ghosttys(bus_address: str, env: Mapping[str, str]) -> list[str]:
    """Exactly 3 ghostty TILEs. Close extras."""
    gui = _layout_env(env)
    gt = ghostty_argv()
    if not gt:
        raise CampaignError("missing ghostty on PATH", exit_code=127)
    while True:
        wins = [w for w in tiled_windows(get_tree(bus_address)) if is_ghostty_win(w)]
        if len(wins) >= 3:
            break
        _launch_one(gui, gt, bus_address)
        wait_window_count(bus_address, len(wins) + 1, timeout_s=20.0)
        time.sleep(0.2)
    wins = sorted(
        [w for w in tiled_windows(get_tree(bus_address)) if is_ghostty_win(w)],
        key=lambda w: _win_id(w),
    )
    while len(wins) > 3:
        drop = wins.pop()
        close_window_id(bus_address, _win_id(drop))
        time.sleep(0.25)
        wins = sorted(
            [w for w in tiled_windows(get_tree(bus_address)) if is_ghostty_win(w)],
            key=lambda w: _win_id(w),
        )
    if len(wins) < 3:
        raise CampaignError(f"seed need 3 ghostty TILES (have {len(wins)})")
    return [_win_id(w) for w in wins]


def close_all_tiles(bus_address: str) -> None:
    for w in list(tiled_windows(get_tree(bus_address))):
        wid = _win_id(w)
        if wid:
            close_window_id(bus_address, wid)
            time.sleep(0.2)


def dnd_onto(
    bus_address: str,
    *,
    tile_id: str,
    onto_id: str,
    zone: str,
    timeout: float,
) -> dict[str, Any]:
    from nested_wayland import shell_eval

    forest = get_tree(bus_address)
    spec = {
        "tile": dnd_token_to_selector(f"id:{tile_id}", forest),
        "onto": dnd_token_to_selector(f"id:{onto_id}", forest),
        "zone": zone,
        "quiet": True,
        "simulateEnteredMonitor": False,
    }
    ok, payload = shell_eval(
        bus_address, build_dnd_drop_js(spec), timeout=float(timeout)
    )
    if not ok:
        raise CampaignError(f"Shell.Eval dnd-drop {zone} failed: {payload}")
    result = parse_invoke_result(payload)
    if not result.get("ok"):
        err = result.get("error") or str(result)
        raise CampaignError(f"dnd-drop {zone} not ok: {err}")
    return result


def _bag_window_ids(bag: Mapping[str, Any]) -> list[str]:
    kids = bag.get("children") or bag.get("childNodes") or []
    out: list[str] = []
    if not isinstance(kids, list):
        return out
    for child in kids:
        if not isinstance(child, dict):
            continue
        nt = str(child.get("nodeType") or child.get("type") or "").upper()
        if nt == "WINDOW" and is_tile_win(child):
            wid = _win_id(child)
            if wid:
                out.append(wid)
    return out


def find_bag_holding(forest: Mapping[str, Any], window_ids: Sequence[str]) -> dict[str, Any]:
    want = {str(i) for i in window_ids}
    for bag in find_tabbed_groups(forest):
        have = set(_bag_window_ids(bag))
        if want <= have:
            return bag
    raise CampaignError(f"no TABBED/STACKED bag holding {sorted(want)}")


def parent_of_window(forest: Mapping[str, Any], window_id: str) -> Optional[dict[str, Any]]:
    want = str(window_id)

    def walk(node: Any) -> Optional[dict[str, Any]]:
        if not isinstance(node, dict):
            return None
        kids = node.get("children") or node.get("childNodes") or []
        if not isinstance(kids, list):
            return None
        for child in kids:
            if not isinstance(child, dict):
                continue
            nt = str(child.get("nodeType") or child.get("type") or "").upper()
            if nt == "WINDOW" and _win_id(child) == want:
                return node
            hit = walk(child)
            if hit is not None:
                return hit
        return None

    for mon in forest.get("monitors") or []:
        hit = walk(mon)
        if hit is not None:
            return hit
    return None


def assert_edge_after_drop(
    forest: Mapping[str, Any],
    *,
    zone: str,
    bag_ids: Sequence[str],
    dragged_id: str,
) -> dict[str, Any]:
    bad = find_bag_con_children(forest)
    if bad:
        raise CampaignError(
            f"{zone}: nested TABBED/STACKED CON child: {'; '.join(bad[:8])}"
        )
    bag = find_bag_holding(forest, bag_ids)
    bag_kids = _bag_window_ids(bag)
    if dragged_id in bag_kids:
        raise CampaignError(
            f"{zone}: dragged {dragged_id} still inside TABBED bag ({bag_kids})"
        )
    for bid in bag_ids:
        if bid not in bag_kids:
            raise CampaignError(
                f"{zone}: bag lost tab {bid}; bag now {bag_kids}"
            )
    if any(
        str(c.get("nodeType") or "").upper() == "CON"
        for c in (bag.get("children") or [])
        if isinstance(c, dict)
    ):
        raise CampaignError(f"{zone}: bag has CON child after edge drop")

    drag_parent = parent_of_window(forest, dragged_id)
    if drag_parent is None:
        raise CampaignError(f"{zone}: dragged {dragged_id} missing from tree")
    kids = drag_parent.get("children") or drag_parent.get("childNodes") or []
    lay = str(drag_parent.get("layout") or "").upper()
    want_lay = "HSPLIT" if zone in ("LEFT", "RIGHT") else "VSPLIT"
    if lay != want_lay:
        raise CampaignError(
            f"{zone}: expected parent layout {want_lay}, got {lay or '-'}"
        )
    # False-green guard: pre-drop MONITOR HSPLIT also looks like L/R success
    # when slotSplit fail-closed. Require a fresh split CON that holds both
    # the TABBED bag and the dragged leaf (not the bare MONITOR).
    parent_nt = str(drag_parent.get("nodeType") or drag_parent.get("type") or "").upper()
    if parent_nt == "MONITOR":
        raise CampaignError(
            f"{zone}: dragged still under MONITOR {lay} "
            "(edge slotSplit likely fail-closed; want split CON)"
        )
    bag_as_child = False
    dragged_as_child = False
    for child in kids if isinstance(kids, list) else []:
        if not isinstance(child, dict):
            continue
        nt = str(child.get("nodeType") or child.get("type") or "").upper()
        clay = str(child.get("layout") or "").upper()
        if nt == "CON" and clay in ("TABBED", "STACKED"):
            if set(bag_ids) <= set(_bag_window_ids(child)):
                bag_as_child = True
        if nt == "WINDOW" and _win_id(child) == dragged_id:
            dragged_as_child = True
    if not (bag_as_child and dragged_as_child):
        raise CampaignError(
            f"{zone}: dragged parent {lay} must hold bag + dragged "
            f"(bagInParent={bag_as_child} draggedInParent={dragged_as_child})"
        )
    return {
        "zone": zone,
        "parentLayout": lay,
        "bagKids": bag_kids,
        "draggedId": dragged_id,
    }


def run_one_zone(
    bus_address: str,
    zone: str,
    *,
    env: Mapping[str, str],
    dnd_timeout: float,
) -> dict[str, Any]:
    close_all_tiles(bus_address)
    time.sleep(0.3)
    ids = seed_three_ghosttys(bus_address, env)
    a, b, c = ids[0], ids[1], ids[2]
    # CENTER join a+b into a TABBED bag; c stays the edge-drop source.
    dnd_onto(
        bus_address, tile_id=a, onto_id=b, zone="CENTER", timeout=dnd_timeout
    )
    time.sleep(0.6)
    forest = get_tree(bus_address)
    bad = find_bag_con_children(forest)
    if bad:
        raise CampaignError(
            f"{zone}/pre: nested bag CON after CENTER: {'; '.join(bad[:6])}"
        )
    bag = find_bag_holding(forest, [a, b])
    bag_ids = _bag_window_ids(bag)
    if c in bag_ids:
        raise CampaignError(f"{zone}/pre: third tile already in bag")
    onto = a if a in bag_ids else b
    drop = dnd_onto(
        bus_address, tile_id=c, onto_id=onto, zone=zone, timeout=dnd_timeout
    )
    time.sleep(0.8)
    after = get_tree(bus_address)
    oracle = assert_edge_after_drop(
        after, zone=zone, bag_ids=[a, b], dragged_id=c
    )
    oracle["drop"] = drop
    oracle["bagIds"] = [a, b]
    return oracle


def run_campaign_on_bus(
    bus_address: str,
    args: argparse.Namespace,
    *,
    env: Optional[Mapping[str, str]] = None,
) -> dict[str, Any]:
    from nested_wayland import wait_forge_ready

    zones = parse_zones(str(args.zones))
    _require_gdbus()
    if not wait_forge_ready(bus_address, timeout_s=12.0):
        raise CampaignError("Forge DBus not ready")
    gui = _layout_env(env)
    results: list[dict[str, Any]] = []
    try:
        for zone in zones:
            print(f"nest tabbed-edge: zone={zone}", file=sys.stderr)
            results.append(
                run_one_zone(
                    bus_address,
                    zone,
                    env=gui,
                    dnd_timeout=float(args.dnd_timeout),
                )
            )
    except InvokeError as e:
        raise CampaignError(f"invoke: {e}") from e
    return {"ok": True, "zones": zones, "results": results}


def cmd_from_env(args: Optional[argparse.Namespace] = None) -> int:
    parsed = args if args is not None else parse_argv(sys.argv[1:])
    if parsed.dry_run:
        print_plan(parsed)
        return 0
    bus = str(os.environ.get("DBUS_SESSION_BUS_ADDRESS") or "").strip()
    display = str(os.environ.get("WAYLAND_DISPLAY") or "").strip()
    if not bus or not display:
        print(
            "nest tabbed-edge: run inside nest env:\n"
            f"  {ENTRY}\n"
            "  ./scripts/forge/forge-test nested smoke-layout-tabbed-edge",
            file=sys.stderr,
        )
        return 2
    try:
        require_nest_client_env(os.environ, what="tabbed-edge")
        out = run_campaign_on_bus(bus, parsed, env=os.environ)
    except CampaignError as e:
        print(f"nest tabbed-edge: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    except InvokeError as e:
        print(f"nest tabbed-edge: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    if getattr(parsed, "json_out", False):
        print(json.dumps(out, indent=2))
    else:
        print(
            "nest tabbed-edge: ok zones="
            + ",".join(r["zone"] for r in out.get("results") or [])
        )
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    return cmd_from_env(parse_argv(argv))


if __name__ == "__main__":
    raise SystemExit(main())
