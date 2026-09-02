#!/usr/bin/env python3
"""Nest multi-step WS/layout campaign approximating the human desk sequence.

CTS after each step = forge tree + settle oracles + plog-query log tokens.
Use via nested run --monitors=2. Never personal dev/t1.
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

from layout_lib import (  # noqa: E402
    layout_tree_root,
    resolve_profile,
)
from nest_invoke import (  # noqa: E402
    InvokeError,
    _gui_env,
    _launch_one,
    require_nest_client_env,
    activate_workspace,
    close_window_id,
    get_tree,
    invoke_on_bus,
    wait_window_count,
    window_rect_x,
)
from nest_layout_dnd_smoke import (  # noqa: E402
    CampaignError,
    assert_forest_oracles,
    dest_has_tiles,
    dnd_drop_dest_monitor,
    find_bag_con_children,
    is_ghostty_win,
    is_nautilus_win,
    is_placeholder_win,
    is_tile_win,
    layout_failure_reason,
    refuse_personal_profile as _refuse_personal,
    tiled_on_mon,
    window_mon_index,
    windows_with_mon,
)
from nest_log_query import (  # noqa: E402
    LogQueryError,
    assert_cts_logs,
    snapshot_keys,
)

VERSION = "2"
DEFAULT_PROFILE_A = "_forge-test-ghosttys"
DEFAULT_PROFILE_B = "_forge-test-ws-b"
PERSONAL_PROFILES = frozenset({"dev", "t1"})
ENTRY = (
    "./scripts/forge/forge-test nested run --monitors=2 -- "
    "python3 ./scripts/forge/nest_layout_ws_campaign.py"
)

PROFILE_A_BODY: dict[str, Any] = {
    "tiles": [["ghostty"], ["ghostty"]],
    "focus": ["ghostty", 0],
    "description": (
        "FORGE TEST nest WS campaign layout A: dual-mon one ghostty each. "
        "Not a personal layout."
    ),
}
PROFILE_B_BODY: dict[str, Any] = {
    "tiles": [["ghostty"], ["ghostty"]],
    "focus": ["ghostty", 1],
    "description": (
        "FORGE TEST nest WS campaign layout B: dual-mon one ghostty each "
        "(focus mon1). WS switch vs layout A; not a personal layout."
    ),
}

CAMPAIGN_STEPS = (
    "WS1 layout A (ghosttys dual-mon) → CTS",
    "Switch WS2 layout B → CTS",
    "Back WS1 → CTS (windows + focus still correct)",
    "Open Nautilus (or extra ghostty if nest GApplication stub) → CTS",
    "Move that window under mon1 left ghostty → CTS",
    "Move into right TAB group → CTS",
    "Close several windows → CTS",
    "Re-run layout A → CTS",
)


def smoke_script_path() -> Path:
    return Path(__file__).resolve()


def smoke_script_argv() -> list[str]:
    return [sys.executable, str(smoke_script_path())]


def refuse_personal_profile(name: str) -> str:
    n = (name or "").strip()
    if not n:
        raise CampaignError("layout profile required")
    if n in PERSONAL_PROFILES:
        raise CampaignError(
            f"refusing personal profile {n!r}; use {DEFAULT_PROFILE_A} / "
            f"{DEFAULT_PROFILE_B}"
        )
    return _refuse_personal(n)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="nest_layout_ws_campaign.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=(
            "Nested Wayland multi-step campaign: WS1 layout A (ghosttys "
            "dual-mon) → WS2 layout B → back WS1 → open Nautilus-or-ghostty "
            "→ move under mon1 left → join right TAB → close several → "
            "re-run layout A. CTS (tree + settlements + plog-query tokens) "
            "after each step. Never personal dev/t1."
        ),
        epilog=(
            "Requires nest --monitors=2. Layout profiles stay shared. "
            "Nest Nautilus is often a GApplication stub (no TILE); the "
            "campaign then uses a second ghostty and records nautilusStub.\n"
            "\n"
            f"Entry (always stops):\n  {ENTRY}\n"
            "Alias (defaults --monitors=2):\n"
            "  ./scripts/forge/forge-test nested smoke-layout-ws\n"
            "\n"
            "Dependencies: python3, forge, gdbus, ghostty, vendored plog-query.\n"
            "Exit: 0 ok; 1 CTS / layout / tree fail; 2 not in nest env; "
            "127 missing binary."
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
        "--profile-a",
        default=DEFAULT_PROFILE_A,
        help=f"WS1 / re-run profile (default {DEFAULT_PROFILE_A})",
    )
    p.add_argument(
        "--profile-b",
        default=DEFAULT_PROFILE_B,
        help=f"WS2 profile (default {DEFAULT_PROFILE_B})",
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
        "profileA": str(args.profile_a),
        "profileB": str(args.profile_b),
        "monitors": 2,
        "entry": ENTRY,
        "nautilus": "try TILE; stub → extra ghostty if nest GApplication miss",
        "logQuery": "plog-query on FORGE_CONFIG_HOME sibling forge.jsonl",
        "steps": list(CAMPAIGN_STEPS),
    }


def print_plan(args: argparse.Namespace) -> None:
    plan = campaign_plan(args)
    if getattr(args, "json_out", False):
        print(json.dumps(plan, indent=2))
        return
    print("nest layout WS campaign (dry-run)")
    print(f"  profile-a: {plan['profileA']} (WS1)")
    print(f"  profile-b: {plan['profileB']} (WS2)")
    print(f"  monitors:  {plan['monitors']} (need nest --monitors=2)")
    print(f"  nautilus:  {plan['nautilus']}")
    print(f"  log:       {plan['logQuery']}")
    print("  steps:")
    for i, step in enumerate(plan["steps"], start=1):
        print(f"    {i}. {step}")
    print(f"  entry: {plan['entry']}")


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


def ghostty_argv() -> Optional[list[str]]:
    exe = shutil.which("ghostty")
    if not exe:
        return None
    return [exe, "--gtk-single-instance=false"]


def nautilus_argv() -> Optional[list[str]]:
    exe = shutil.which("nautilus")
    if not exe:
        return None
    return [exe, "--new-window"]


def ensure_test_profiles(
    *,
    env: Optional[Mapping[str, str]] = None,
    profile_a: str = DEFAULT_PROFILE_A,
    profile_b: str = DEFAULT_PROFILE_B,
) -> dict[str, Any]:
    """Write missing nest-safe _forge-test-* JSON into the shared layout tree."""
    e = env if env is not None else os.environ
    wanted = (
        (profile_a, PROFILE_A_BODY),
        (profile_b, PROFILE_B_BODY),
    )
    created: list[str] = []
    existing: list[str] = []
    refreshed: list[str] = []
    for name, body in wanted:
        refuse_personal_profile(name)
        resolved = resolve_profile(name, env=e)
        if resolved.get("found") and resolved.get("path"):
            existing.append(name)
            dest = Path(str(resolved["path"]))
            try:
                cur = json.loads(dest.read_text(encoding="utf-8"))
            except (OSError, TypeError, json.JSONDecodeError):
                continue
            desc = str(cur.get("description") or "")
            if "FORGE TEST" in desc and cur.get("tiles") != body.get("tiles"):
                dest.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
                refreshed.append(str(dest))
            continue
        root = layout_tree_root(e)
        dest = root / "common" / f"{name}.json"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
        created.append(str(dest))
    return {"created": created, "existing": existing, "refreshed": refreshed}


def run_layout(
    profile: str,
    env: Mapping[str, str],
    *,
    timeout_s: float,
    workspace_1based: Optional[int] = None,
) -> str:
    token = (
        f"{int(workspace_1based)}:{profile}"
        if workspace_1based is not None
        else profile
    )
    argv = [*_forge_argv(env), "layout", token]
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
            f"forge layout {token} timed out after {timeout_s}s"
        ) from e
    text = f"{proc.stdout or ''}\n{proc.stderr or ''}"
    reason = layout_failure_reason(int(proc.returncode), text)
    if reason:
        tail = text.strip()[-2000:]
        raise CampaignError(f"{reason}\n{tail}" if tail else reason)
    return text


def seed_ghostty_tiles(
    bus_address: str,
    env: Mapping[str, str],
    want: int,
    *,
    workspace: Optional[int] = None,
) -> int:
    gui = _layout_env(env)
    gt = ghostty_argv()
    if not gt:
        raise CampaignError("missing ghostty on PATH", exit_code=127)
    n = len(_tiled_now(bus_address, workspace=workspace))
    while n < want:
        _launch_one(gui, gt, bus_address, workspace=workspace)
        wait_window_count(
            bus_address, n + 1, timeout_s=20.0, workspace=workspace
        )
        n = len(_tiled_now(bus_address, workspace=workspace))
    extra = sorted(
        _tiled_now(bus_address, workspace=workspace),
        key=lambda w: str(w.get("windowId") or ""),
    )
    while len(extra) > want:
        drop = extra.pop()
        close_window_id(bus_address, str(drop.get("windowId")))
        time.sleep(0.3)
        extra = _tiled_now(bus_address, workspace=workspace)
    n = len(_tiled_now(bus_address, workspace=workspace))
    if n < want:
        where = f" on ws={workspace}" if workspace is not None else ""
        raise CampaignError(f"seed need {want} ghostty TILES{where} (have {n})")
    return n


def _tiled_now(
    bus_address: str, *, workspace: Optional[int] = None
) -> list[dict[str, Any]]:
    from nest_invoke import tiled_windows

    return [
        w
        for w in tiled_windows(get_tree(bus_address, workspace=workspace))
        if is_tile_win(w) and not is_placeholder_win(w)
    ]


def window_ids(forest: Mapping[str, Any]) -> list[str]:
    out: list[str] = []
    for _i, w in windows_with_mon(forest):
        if not is_tile_win(w) or is_placeholder_win(w):
            continue
        wid = w.get("windowId")
        if wid is not None and str(wid):
            out.append(str(wid))
    return out


def ghostty_counts(forest: Mapping[str, Any]) -> tuple[int, int]:
    m0 = [w for w in tiled_on_mon(forest, 0) if is_ghostty_win(w)]
    m1 = [w for w in tiled_on_mon(forest, 1) if is_ghostty_win(w)]
    return len(m0), len(m1)


def assert_dual_ghostty(forest: Mapping[str, Any], *, stage: str) -> None:
    assert_forest_oracles(forest, stage=stage)
    n0, n1 = ghostty_counts(forest)
    if n0 < 1:
        raise CampaignError(f"{stage}: mon0 missing ghostty")
    if n1 < 1:
        raise CampaignError(f"{stage}: mon1 missing ghostty")


def assert_layout_b(forest: Mapping[str, Any], *, stage: str) -> None:
    assert_dual_ghostty(forest, stage=stage)


def find_tabbed_groups(forest: Mapping[str, Any]) -> list[dict[str, Any]]:
    """TABBED or STACKED bag CONs (Mark 2 tab/stack group)."""
    bags: list[dict[str, Any]] = []
    bag_layouts = frozenset({"TABBED", "STACKED"})

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        lay = str(node.get("layout") or "").upper()
        nt = str(node.get("nodeType") or node.get("type") or "").upper()
        if lay in bag_layouts and nt in ("CON", "MONITOR"):
            bags.append(node)
        kids = node.get("children") or node.get("childNodes") or []
        if isinstance(kids, list):
            for c in kids:
                walk(c)

    roots = forest.get("monitors") or []
    if isinstance(roots, list):
        for mon in roots:
            walk(mon)
    for key in ("workspaces", "children", "childNodes", "root", "tiles"):
        node = forest.get(key)
        if isinstance(node, list):
            for r in node:
                walk(r)
        elif isinstance(node, dict):
            walk(node)
    return bags


def switch_workspace(bus_address: str, index: int) -> dict[str, Any]:
    result = activate_workspace(bus_address, int(index))
    deadline = time.monotonic() + 8.0
    last_active: Any = None
    last_nmon = 0
    active_ok = False
    mon_grace: Optional[float] = None
    while time.monotonic() < deadline:
        forest = get_tree(bus_address, workspace=int(index))
        last_active = forest.get("activeWorkspace")
        mons = forest.get("monitors") or []
        last_nmon = len(mons) if isinstance(mons, list) else 0
        try:
            if int(last_active) == int(index):
                active_ok = True
                if last_nmon >= 2:
                    return result
                if mon_grace is None:
                    mon_grace = time.monotonic() + 1.5
        except (TypeError, ValueError):
            pass
        if mon_grace is not None and time.monotonic() >= mon_grace:
            return result
        time.sleep(0.2)
        activate_workspace(bus_address, int(index))
    if active_ok:
        return result
    raise CampaignError(
        f"workspace {index} did not become active (GetTree activeWorkspace="
        f"{last_active!r} nMon={last_nmon})"
    )


def _cts(
    bus_address: str,
    *,
    stage: str,
    before_keys: Sequence[str],
    env: Mapping[str, str],
    tree_check,
    workspace: Optional[int] = None,
) -> tuple[dict[str, Any], list[str]]:
    time.sleep(0.4)
    forest = get_tree(bus_address, workspace=workspace)
    bags = find_bag_con_children(forest)
    if bags:
        detail = "; ".join(bags[:8])
        raise CampaignError(f"{stage}: nested TABBED/STACKED CON child: {detail}")
    tree_check(forest)
    try:
        logs = assert_cts_logs(before_keys, stage=stage, env=env)
    except LogQueryError as e:
        raise CampaignError(str(e), exit_code=int(getattr(e, "exit_code", 1) or 1)) from e
    after_keys = snapshot_keys(env=env)
    return {
        "stage": stage,
        "treeOk": True,
        "logs": logs,
        "windowIds": window_ids(forest),
        "focusWindowId": forest.get("focusWindowId"),
        "activeWorkspace": forest.get("activeWorkspace"),
        "ghosttyCounts": list(ghostty_counts(forest)),
    }, after_keys


def _find_new_tile(
    before_ids: Sequence[str],
    forest: Mapping[str, Any],
) -> Optional[dict[str, Any]]:
    known = set(str(i) for i in before_ids)
    for _i, w in windows_with_mon(forest):
        if not is_tile_win(w) or is_placeholder_win(w):
            continue
        wid = str(w.get("windowId") or "")
        if wid and wid not in known:
            return w
    return None


def open_nautilus_or_ghostty(
    bus_address: str,
    env: Mapping[str, str],
    before_ids: Sequence[str],
    *,
    workspace: Optional[int] = None,
) -> dict[str, Any]:
    gui = _layout_env(env)
    naut = nautilus_argv()
    stub = False
    reason = ""
    before_n = len(_tiled_now(bus_address, workspace=workspace))
    if naut:
        _launch_one(gui, naut, bus_address, workspace=workspace)
        deadline = time.monotonic() + 12.0
        found: Optional[dict[str, Any]] = None
        while time.monotonic() < deadline:
            forest = get_tree(bus_address, workspace=workspace)
            cand = _find_new_tile(before_ids, forest)
            if cand is not None and is_nautilus_win(cand) and is_tile_win(cand):
                found = cand
                break
            time.sleep(0.4)
        if found is not None:
            return {
                "kind": "nautilus",
                "nautilusStub": False,
                "windowId": str(found.get("windowId") or ""),
            }
        stub = True
        reason = "nest nautilus did not map a TILE (GApplication stub)"
    else:
        stub = True
        reason = "nautilus not on PATH"

    gt = ghostty_argv()
    if not gt:
        raise CampaignError(
            f"{reason}; also missing ghostty for stub TILE",
            exit_code=127,
        )
    _launch_one(gui, gt, bus_address, workspace=workspace)
    wait_window_count(
        bus_address, before_n + 1, timeout_s=20.0, workspace=workspace
    )
    forest = get_tree(bus_address, workspace=workspace)
    extra = _find_new_tile(before_ids, forest)
    if extra is None:
        raise CampaignError(f"{reason}; extra ghostty TILE did not appear")
    return {
        "kind": "ghostty",
        "nautilusStub": True,
        "stubReason": reason,
        "windowId": str(extra.get("windowId") or ""),
    }


def run_campaign_on_bus(
    bus_address: str,
    args: argparse.Namespace,
    *,
    env: Optional[Mapping[str, str]] = None,
) -> dict[str, Any]:
    from nested_wayland import wait_forge_ready

    profile_a = refuse_personal_profile(str(args.profile_a))
    profile_b = refuse_personal_profile(str(args.profile_b))
    _require_gdbus()
    if not wait_forge_ready(bus_address, timeout_s=20.0):
        extra = ""
        try:
            gs = subprocess.run(
                [
                    "gsettings",
                    "get",
                    "org.gnome.shell",
                    "disable-user-extensions",
                ],
                capture_output=True,
                text=True,
                timeout=3,
                check=False,
            )
            if "true" in (gs.stdout or "").lower():
                extra = (
                    " (org.gnome.shell disable-user-extensions=true; "
                    "nest shares dconf — Forge stays INITIALIZED)"
                )
        except (OSError, subprocess.TimeoutExpired):
            pass
        raise CampaignError("Forge DBus not ready" + extra)
    gui = _layout_env(env)
    profiles = ensure_test_profiles(
        env=gui, profile_a=profile_a, profile_b=profile_b
    )
    log_keys = snapshot_keys(env=gui)
    steps: list[dict[str, Any]] = []

    switch_workspace(bus_address, 0)
    seed_ghostty_tiles(bus_address, gui, 2, workspace=0)
    time.sleep(0.4)
    layout_a1 = run_layout(profile_a, gui, timeout_s=float(args.timeout), workspace_1based=1)
    cts1, log_keys = _cts(
        bus_address,
        stage="1-ws1-layout-a",
        before_keys=log_keys,
        env=gui,
        workspace=0,
        tree_check=lambda f: assert_dual_ghostty(f, stage="1-ws1-layout-a"),
    )
    ws1_ids = list(cts1["windowIds"])
    ws1_focus = cts1.get("focusWindowId")
    cts1["layoutTail"] = (layout_a1 or "")[-400:]
    steps.append(cts1)

    switch_workspace(bus_address, 1)
    seed_ghostty_tiles(bus_address, gui, 2, workspace=1)
    time.sleep(0.4)
    layout_b = run_layout(profile_b, gui, timeout_s=float(args.timeout), workspace_1based=2)
    cts2, log_keys = _cts(
        bus_address,
        stage="2-ws2-layout-b",
        before_keys=log_keys,
        env=gui,
        workspace=1,
        tree_check=lambda f: assert_layout_b(f, stage="2-ws2-layout-b"),
    )
    cts2["layoutTail"] = (layout_b or "")[-400:]
    steps.append(cts2)

    switch_workspace(bus_address, 0)

    def _back_ws1(forest: Mapping[str, Any]) -> None:
        assert_dual_ghostty(forest, stage="3-back-ws1")
        now = set(window_ids(forest))
        missing = [i for i in ws1_ids if i not in now]
        if missing:
            raise CampaignError(
                f"3-back-ws1: WS1 window ids missing after roundtrip: {missing}"
            )
        focus = forest.get("focusWindowId")
        if focus is not None and str(focus) and str(focus) not in now:
            raise CampaignError(
                f"3-back-ws1: focusWindowId {focus!r} not in WS1 tree"
            )
        if ws1_focus is not None and str(ws1_focus) and str(ws1_focus) not in now:
            raise CampaignError(
                f"3-back-ws1: pre-switch focus {ws1_focus!r} left the tree"
            )

    cts3, log_keys = _cts(
        bus_address,
        stage="3-back-ws1",
        before_keys=log_keys,
        env=gui,
        workspace=0,
        tree_check=_back_ws1,
    )
    steps.append(cts3)

    opened = open_nautilus_or_ghostty(bus_address, gui, ws1_ids, workspace=0)
    extra_id = str(opened.get("windowId") or "")
    if not extra_id:
        raise CampaignError("4-open-extra: no new TILE id")

    def _open_ok(forest: Mapping[str, Any]) -> None:
        assert_forest_oracles(forest, stage="4-open-extra")
        if extra_id not in window_ids(forest):
            raise CampaignError(f"4-open-extra: new TILE {extra_id} missing")
        if window_mon_index(forest, extra_id) is None:
            raise CampaignError(f"4-open-extra: {extra_id} not on a monitor")

    cts4, log_keys = _cts(
        bus_address,
        stage="4-open-extra",
        before_keys=log_keys,
        env=gui,
        workspace=0,
        tree_check=_open_ok,
    )
    cts4["opened"] = opened
    steps.append(cts4)

    forest = get_tree(bus_address, workspace=0)
    extra_mon = window_mon_index(forest, extra_id)
    if extra_mon != 1:
        dnd_drop_dest_monitor(
            bus_address,
            tile=f"id:{extra_id}",
            dest_monitor=1,
            timeout=float(args.dnd_timeout),
        )
        time.sleep(0.8)

    def _on_mon1(forest: Mapping[str, Any]) -> None:
        assert_forest_oracles(forest, stage="5-move-mon1")
        landed = window_mon_index(forest, extra_id)
        if landed != 1:
            raise CampaignError(
                f"5-move-mon1: extra {extra_id} destMon=1 afterMon={landed}"
            )
        if not dest_has_tiles(forest, 1):
            raise CampaignError("5-move-mon1: mon1 empty after move")

    cts5, log_keys = _cts(
        bus_address,
        stage="5-move-mon1",
        before_keys=log_keys,
        env=gui,
        workspace=0,
        tree_check=_on_mon1,
    )
    steps.append(cts5)

    # Join is SPLIT by default; toggleTabStack turns the pair into a bag.
    forest = get_tree(bus_address, workspace=0)
    m1 = tiled_on_mon(forest, 1)
    if not m1:
        raise CampaignError("6-join-tab: mon1 has no TILE to join")
    # CENTER drop onto mon1 sibling (tab/join surface). Avoid join.right at
    # the monitor edge — Mark 2 can wrap and empty mon1 in nest.
    if len(m1) < 2:
        raise CampaignError(
            f"6-join-tab: mon1 needs ≥2 TILEs before group (have {len(m1)})"
        )
    ordered = sorted(
        m1, key=lambda w: (window_rect_x(w), str(w.get("windowId") or ""))
    )
    src = next(
        (w for w in ordered if str(w.get("windowId") or "") == extra_id),
        ordered[-1],
    )
    dest = next(
        (
            w
            for w in ordered
            if str(w.get("windowId") or "") != str(src.get("windowId") or "")
        ),
        ordered[0],
    )
    src_id = str(src.get("windowId") or "")
    dest_id = str(dest.get("windowId") or "")
    from nest_invoke import build_dnd_drop_js, parse_invoke_result  # local
    from nested_wayland import shell_eval

    forest = get_tree(bus_address, workspace=0)
    from nest_layout_dnd_smoke import dnd_token_to_selector

    spec = {
        "tile": dnd_token_to_selector(f"id:{src_id}", forest),
        "onto": dnd_token_to_selector(f"id:{dest_id}", forest),
        "zone": "CENTER",
        "quiet": True,
    }
    ok, payload = shell_eval(
        bus_address, build_dnd_drop_js(spec), timeout=float(args.dnd_timeout)
    )
    if not ok:
        raise CampaignError(f"6-join-tab: dnd CENTER failed: {payload}")
    drop = parse_invoke_result(payload)
    if not drop.get("ok"):
        raise CampaignError(
            f"6-join-tab: dnd CENTER not ok: {drop.get('error') or drop}"
        )
    time.sleep(0.8)

    def _in_tab(forest: Mapping[str, Any]) -> None:
        assert_forest_oracles(forest, stage="6-join-tab")
        bags = find_tabbed_groups(forest)
        if bags and window_mon_index(forest, extra_id) == 1:
            return
        m1_now = tiled_on_mon(forest, 1)
        raise CampaignError(
            "6-join-tab: CENTER drop did not create TABBED/STACKED "
            f"(extra={extra_id} bags={len(bags)} mon1={len(m1_now)})"
        )

    cts6, log_keys = _cts(
        bus_address,
        stage="6-join-tab",
        before_keys=log_keys,
        env=gui,
        workspace=0,
        tree_check=_in_tab,
    )
    steps.append(cts6)

    forest = get_tree(bus_address, workspace=0)
    close_ids = [extra_id]
    others = [i for i in window_ids(forest) if i not in close_ids]
    # Close extra + one more if we still have ≥3 TILEs after.
    if len(others) >= 3:
        close_ids.append(others[-1])
    for wid in close_ids:
        close_window_id(bus_address, wid)
        time.sleep(0.25)
    time.sleep(0.4)
    closed_set = set(close_ids)

    def _after_close(forest: Mapping[str, Any]) -> None:
        assert_forest_oracles(forest, stage="7-close")
        now = set(window_ids(forest))
        still = [i for i in closed_set if i in now]
        if still:
            raise CampaignError(f"7-close: still present after delete: {still}")
        if not now:
            raise CampaignError("7-close: all TILEs gone")

    cts7, log_keys = _cts(
        bus_address,
        stage="7-close",
        before_keys=log_keys,
        env=gui,
        workspace=0,
        tree_check=_after_close,
    )
    cts7["closed"] = close_ids
    steps.append(cts7)

    seed_ghostty_tiles(bus_address, gui, 2, workspace=0)
    time.sleep(0.3)
    layout_a2 = run_layout(profile_a, gui, timeout_s=float(args.timeout), workspace_1based=1)
    cts8, _log_keys = _cts(
        bus_address,
        stage="8-rerun-layout-a",
        before_keys=log_keys,
        env=gui,
        workspace=0,
        tree_check=lambda f: assert_dual_ghostty(f, stage="8-rerun-layout-a"),
    )
    cts8["layoutTail"] = (layout_a2 or "")[-400:]
    steps.append(cts8)

    return {
        "ok": True,
        "profileA": profile_a,
        "profileB": profile_b,
        "profiles": profiles,
        "nautilusStub": bool(opened.get("nautilusStub")),
        "opened": opened,
        "ws1WindowIds": ws1_ids,
        "steps": steps,
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
            "nest layout WS campaign: run inside nest env:\n"
            f"  {ENTRY}\n"
            "  ./scripts/forge/forge-test nested smoke-layout-ws",
            file=sys.stderr,
        )
        return 2
    try:
        require_nest_client_env(os.environ, what="layout WS campaign")
        payload = run_campaign_on_bus(bus, parsed, env=os.environ)
    except CampaignError as e:
        print(f"nest layout WS campaign: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    except InvokeError as e:
        print(f"nest layout WS campaign: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    except LogQueryError as e:
        print(f"nest layout WS campaign: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    if parsed.json_out:
        print(json.dumps(payload, indent=2, default=str))
    else:
        stub = "stub" if payload.get("nautilusStub") else "nautilus-tile"
        n = len(payload.get("steps") or [])
        print(
            "nest layout WS campaign: ok "
            f"a={payload.get('profileA')} b={payload.get('profileB')} "
            f"steps={n} extra={stub}"
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
