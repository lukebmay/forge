#!/usr/bin/env python3
"""Live nest E2E trunk bodies (design stories). Run under nest client_env.

Prefer: forge-test nested --trunk <id>  (starts nest, always-stop).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from layout_lib import layout_tree_root, resolve_profile  # noqa: E402
from nest_invoke import (  # noqa: E402
    InvokeError,
    _gui_env,
    build_dnd_drop_js,
    close_window_id,
    dnd_token_to_selector,
    find_bag_groups,
    forge_dbus_call,
    get_tree,
    invoke_on_bus,
    parse_invoke_result,
    require_nest_client_env,
    tiled_windows,
    window_rect_x,
)
from nest_layout_dnd_smoke import (  # noqa: E402
    CampaignError,
    is_placeholder_win,
    is_tile_win,
    tiled_on_mon,
    window_mon_index,
)
from nest_layout_ws_campaign import (  # noqa: E402
    ghostty_argv,
    open_nautilus_or_ghostty,
    run_layout,
    seed_ghostty_tiles,
    switch_workspace,
    window_ids,
)
from nest_oracles import (  # noqa: E402
    OracleError,
    assert_float_not_under_monitor,
    assert_identity,
    assert_mode,
    assert_visible_fill_half,
    assert_visible_not_third,
    assert_visible_only,
    assert_who_sits_where,
    children_of,
    float_windows,
    monitor_shape,
    monitors_of,
    normalize_shape,
    node_id,
    node_mode,
    node_type,
    node_wm_class,
    open_leaf,
    visible_panes,
    width_in_third_band,
    window_rect,
    workarea_of,
)
from nest_proof import (  # noqa: E402
    ShareError,
    assert_no_placeholders,
    assert_seed_three,
    assert_split_percents_half,
    height_ratio,
    width_ratio,
)
from nest_stories import (  # noqa: E402
    BVHNV_ID,
    STORY_BY_ID,
    STORY_RUNNERS,
    Story,
    story_runner,
)

VERSION = "1"
ENTRY = "./scripts/forge/forge-test nested --trunk <id>"
PERSONAL_PROFILES = frozenset({"dev", "t1", "vinyl"})
PROFILE_ONE_WS = "_forge-test-one-ws"
PROFILE_ONE_WS_BODY: dict[str, Any] = {
    "tiles": {"mon0": ["ghostty", "ghostty"]},
    "focus": ["ghostty", 0],
    "description": (
        "FORGE TEST one workspace: Mon0 two equal ghostty shares. "
        "Not a personal layout."
    ),
}
PROFILE_ONE_WS_MON1 = "_forge-test-one-ws-mon1"
PROFILE_ONE_WS_MON1_BODY: dict[str, Any] = {
    "tiles": {"mon1": ["ghostty", "ghostty"]},
    "focus": ["ghostty", 0],
    "description": (
        "FORGE TEST one workspace: Mon1 two equal ghostty shares, Mon0 empty. "
        "Not a personal layout."
    ),
}
PROFILE_JOIN = "_forge-test-join-enter"
PROFILE_JOIN_BODY: dict[str, Any] = {
    "tiles": {"mon0": [["ghostty", "ghostty"], ["ghostty", "ghostty"]]},
    "focus": ["ghostty-3", 0],
    "description": (
        "FORGE TEST join-enter Given: Mon0 H(TAB,TAB) four ghosttys. "
        "Not a personal layout."
    ),
}
PROFILE_THREE = "_forge-test-three-equal"
PROFILE_THREE_BODY: dict[str, Any] = {
    "tiles": {"mon0": ["ghostty", "ghostty", "ghostty"]},
    "focus": ["ghostty-3", 0],
    "description": (
        "FORGE TEST even 3-way H(A,B,C) shares (close Given). "
        "Not a personal layout."
    ),
}
PROFILE_TAB = "_forge-test-tab-open-leaf"
PROFILE_TAB_BODY: dict[str, Any] = {
    "tiles": {"mon0": [["ghostty", "ghostty"]]},
    "focus": ["ghostty", 0],
    "description": (
        "FORGE TEST TAB(A,B) open leaf A. Not a personal layout."
    ),
}
PROFILE_INKSCAPE_WS2 = "_forge-test-inkscape-ws2"
PROFILE_INKSCAPE_WS2_BODY: dict[str, Any] = {
    "tiles": [
        ["inkscape"],
        [
            "ghostty",
            {"tab": ["org.gnome.TextEditor", "ghostty"]},
        ],
    ],
    "focus": ["ghostty", 0],
    "description": (
        "FORGE TEST vinyl-shaped WS2: Mon0(Inkscape) | "
        "Mon1(H(Ghostty, TAB(TextEditor, Ghostty))). YouTube/Chrome PWA "
        "stand-in is TextEditor (nest cannot map YouTube). Not a personal "
        "layout."
    ),
}
TRUNK_IDS: tuple[str, ...] = (
    BVHNV_ID,
    "trunk.close.three-equal-one-gone",
    "trunk.tabs.open-leaf-one-slot",
    "trunk.layout.apply-one-ws",
    "trunk.mark2.join-enter",
    "trunk.float.not-under-monitor",
    "trunk.settle.visible-group-ready",
)
REWRITE_IDS: tuple[str, ...] = (
    "branch.tabs.stacked-same-slot",
    "branch.tabs.reveal-no-shrink",
    "branch.layout.ws2-no-mutate-ws1",
    "branch.layout.missing-roles-open",
    "branch.mark2.group-tab",
    "branch.mark2.move-swap",
    "branch.mark2.join-flatten",
    "leaf.mark2.move-empty-monitor",
    "leaf.mark2.move-empty-monitor-reverse",
    "leaf.mark2.join-empty-monitor",
    "leaf.mark2.pointer-center-group",
    "leaf.layout.apply-tab-open-leaf",
    "leaf.layout.apply-inkscape-ws2",
    "leaf.settle.jitter-same-dest",
    "leaf.settle.visible-first-open",
    "branch.layout.extras-policy",
)
OPEN_BRANCH_IDS: tuple[str, ...] = (
    "branch.open.launch-into-2slot-other-focus",
    "branch.open.second-on-empty",
    "branch.close.split-unit-peer",
    "branch.open.empty-head-dock",
    "leaf.open.pointer-on-tiled-stays-lft",
    "branch.open.launch-into-tab",
    "leaf.open.launch-next-to-tab-con",
)
RECT_EPS = 8.0
FULL_LO = 0.85


def smoke_script_path() -> Path:
    return Path(__file__).resolve()


def campaign_argv(ids: Sequence[str]) -> list[str]:
    return [
        sys.executable,
        str(smoke_script_path()),
        "--ids",
        ",".join(str(i) for i in ids),
    ]


def refuse_personal_profile(name: str) -> str:
    n = (name or "").strip()
    if not n:
        raise CampaignError("layout profile required")
    if n in PERSONAL_PROFILES or not n.startswith("_forge-test-"):
        raise CampaignError(
            f"refusing personal profile {n!r}; use {PROFILE_ONE_WS}"
        )
    return n


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="nest_story_bodies.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=(
            "Design-sourced nest trunk bodies. Requires nest client_env. "
            "Prefer forge-test nested --trunk (always-stop)."
        ),
        epilog=(
            f"Entry (always stops):\n  {ENTRY}\n"
            "Dependencies: python3, forge, gdbus, ghostty.\n"
            "Exit: 0 ok; 1 story fail; 2 not in nest env; 127 missing binary."
        ),
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    p.add_argument(
        "--ids",
        default="",
        help="Comma-separated story ids (live nest path)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print registered trunk ids; no Shell",
    )
    p.add_argument("--json", dest="json_out", action="store_true")
    return p


def parse_argv(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    return build_parser().parse_args(list(argv) if argv is not None else None)


def parse_ids(raw: str) -> list[str]:
    out: list[str] = []
    for part in str(raw or "").split(","):
        tok = part.strip()
        if tok and tok not in out:
            out.append(tok)
    return out


def _gui() -> dict[str, str]:
    env = _gui_env(os.environ)
    env["FORGE_JOB"] = "0"
    env.pop("FORGE_JOB_WORKER", None)
    return env


def _bus() -> str:
    require_nest_client_env(os.environ, what="story")
    bus = str(os.environ.get("DBUS_SESSION_BUS_ADDRESS") or "").strip()
    if not bus:
        raise CampaignError("missing DBUS_SESSION_BUS_ADDRESS", exit_code=2)
    return bus


def _tiles(forest: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [
        w
        for w in tiled_windows(forest)
        if is_tile_win(w) and not is_placeholder_win(w)
    ]


def _ordered_tiles(forest: Mapping[str, Any]) -> list[dict[str, Any]]:
    return sorted(
        _tiles(forest),
        key=lambda w: (window_rect_x(w), node_id(w)),
    )


def _win_ids(wins: Sequence[Mapping[str, Any]]) -> list[str]:
    return [node_id(w) for w in wins if node_id(w)]


def _same_rect(a: Mapping[str, Any], b: Mapping[str, Any], *, eps: float = RECT_EPS) -> bool:
    ra, rb = window_rect(a), window_rect(b)
    return all(abs(ra[k] - rb[k]) <= eps for k in ra)


def _desk_report(forest: Mapping[str, Any], *, monitor: int = 0) -> str:
    work = workarea_of(forest, monitor)
    panes = visible_panes(forest, monitor=monitor)
    bits = [f"shape={monitor_shape(forest, monitor)}"]
    for p in panes:
        wr = width_ratio(p, work)
        hr = height_ratio(p, work)
        r = window_rect(p)
        bits.append(
            f"id={node_id(p)} class={node_wm_class(p)} "
            f"mode={node_mode(p) or 'TILE'} "
            f"w={r['width']:.0f}({wr:.3f}) h={r['height']:.0f}({hr:.3f})"
        )
    floats = float_windows(forest)
    if floats:
        bits.append(
            "floats=" + ",".join(node_id(f) or node_wm_class(f) for f in floats)
        )
    return " ".join(bits)


def _wait_tiles(bus: str, want: int, *, timeout_s: float = 16.0) -> list[dict[str, Any]]:
    deadline = time.monotonic() + timeout_s
    last: list[dict[str, Any]] = []
    while time.monotonic() < deadline:
        last = _ordered_tiles(get_tree(bus))
        if len(last) == want:
            return last
        time.sleep(0.25)
    raise CampaignError(
        f"wait TILE count={want} have={len(last)} ids={_win_ids(last)}"
    )


def _clear_tiles(bus: str) -> None:
    for w in list(_tiles(get_tree(bus))):
        wid = node_id(w)
        if wid:
            close_window_id(bus, wid)
            time.sleep(0.15)
    deadline = time.monotonic() + 8.0
    while time.monotonic() < deadline:
        if not _tiles(get_tree(bus)):
            return
        time.sleep(0.2)
    leftover = _win_ids(_tiles(get_tree(bus)))
    if leftover:
        raise CampaignError(f"clear TILE leftover ids={leftover}")


def _focus_id(bus: str, window_id: str) -> None:
    wid = str(window_id)
    try:
        forge_dbus_call(bus, "Focus", [f"id:{wid}"])
    except InvokeError:
        invoke_on_bus(bus, "focus.child", spec={"id": wid, "activate": True})


def _center_join(bus: str, src_id: str, dest_id: str) -> str:
    from nested_wayland import shell_eval

    forest = get_tree(bus)
    spec = {
        "tile": dnd_token_to_selector(f"id:{src_id}", forest),
        "onto": dnd_token_to_selector(f"id:{dest_id}", forest),
        "zone": "CENTER",
        "quiet": True,
        "simulateEnteredMonitor": False,
    }
    ok, raw = shell_eval(bus, build_dnd_drop_js(spec), timeout=12.0)
    drop = parse_invoke_result(raw) if ok else {}
    if ok and drop.get("ok"):
        return "dnd-center"
    invoke_on_bus(
        bus,
        "toggleTabStack",
        spec={"id": dest_id, "activate": True},
        timeout=8.0,
    )
    return "toggleTabStack"


def _wait_shape(
    bus: str,
    expected: str,
    *,
    stage: str,
    timeout_s: float = 10.0,
    monitor: int = 0,
    workspace: Optional[int] = None,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_s
    last: dict[str, Any] = {}
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus, workspace=workspace)
        try:
            assert_who_sits_where(last, expected, monitor=monitor, stage=stage)
            return last
        except OracleError as e:
            last_err = e
            time.sleep(0.25)
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {_desk_report(last, monitor=monitor)}")
    raise CampaignError(f"{stage}: no GetTree")


def _assert_tab_peers_fill_monitor(
    forest: Mapping[str, Any],
    *,
    a_id: str,
    b_id: str,
    stage: str,
) -> dict[str, Any]:
    """TAB(A,B) one slot, Meta/rect ~full monitor. Expect unchanged (FULL_LO)."""
    got = monitor_shape(forest, 0)
    if got.startswith("V(") or got.startswith("H("):
        raise OracleError(
            f"{stage}: want TAB not {got}; {_desk_report(forest)}"
        )
    assert_who_sits_where(forest, "TAB(A,B)", monitor=0, stage=stage)
    bag = _first_bag(forest)
    kids = _bag_window_kids(bag)
    kid_ids = set(_win_ids(kids))
    if kid_ids != {a_id, b_id}:
        raise OracleError(
            f"{stage}: TAB kids {sorted(kid_ids)} != A,B; {_desk_report(forest)}"
        )
    if len(kids) >= 2 and not _same_rect(kids[0], kids[1]):
        raise OracleError(
            f"{stage}: TAB peers not one slot "
            f"{window_rect(kids[0])} vs {window_rect(kids[1])}"
        )
    work = workarea_of(forest, 0)
    wr = width_ratio(kids[0], work)
    if wr + 1e-9 < FULL_LO:
        raise OracleError(
            f"{stage}: TAB slot not ~full monitor width_ratio={wr:.3f}"
        )
    for w in kids:
        assert_mode(w, "TILE", stage=stage)
    return dict(forest)


def _wait_tab_peers_fill_monitor(
    bus: str,
    *,
    a_id: str,
    b_id: str,
    stage: str,
    timeout_s: float = 12.0,
) -> dict[str, Any]:
    """Poll until TAB topology *and* Meta frame fill. presentWmSlots dest is
    full immediately; GetTree WINDOW rect is Meta and lags a beat (D105)."""
    deadline = time.monotonic() + timeout_s
    last: dict[str, Any] = {}
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            return _assert_tab_peers_fill_monitor(
                last, a_id=a_id, b_id=b_id, stage=stage
            )
        except OracleError as e:
            last_err = e
            time.sleep(0.25)
    extra = _desk_report(last) if last else "empty"
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {extra}")
    raise CampaignError(f"{stage}: no GetTree")


def _try_layout(
    name: str,
    body: Mapping[str, Any],
    *,
    workspace_1based: int = 1,
    extra_argv: Optional[Sequence[str]] = None,
) -> Optional[str]:
    """Apply layout. Non-timeout CLI errors are not the story oracle (GetTree)."""
    gui = _gui()
    _ensure_profile(name, body, env=gui)
    try:
        run_layout(
            name,
            gui,
            timeout_s=180.0,
            workspace_1based=int(workspace_1based),
            extra_argv=extra_argv,
        )
        return None
    except CampaignError as e:
        if "timed out" in str(e):
            raise
        return str(e)


def _wait_half_pair(
    bus: str,
    *,
    stage: str,
    timeout_s: float = 12.0,
    workspace: Optional[int] = None,
    monitor: int = 0,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_s
    last: dict[str, Any] = {}
    last_err: Optional[BaseException] = None
    mon = int(monitor)
    while time.monotonic() < deadline:
        last = get_tree(bus, workspace=workspace)
        panes = sorted(
            tiled_on_mon(last, mon),
            key=lambda w: (window_rect_x(w), node_id(w) or ""),
        )
        if len(panes) == 2:
            try:
                assert_who_sits_where(last, "H(A,B)", monitor=mon, stage=stage)
                assert_visible_fill_half(
                    panes, workarea_of(last, mon), stage=stage
                )
                return last
            except (OracleError, ShareError) as e:
                last_err = e
        time.sleep(0.25)
    extra = _desk_report(last, monitor=mon) if last else "empty"
    if last_err is not None:
        raise OracleError(f"{stage}: {last_err}; actual {extra}")
    raise CampaignError(f"{stage}: pair did not settle ~1/2 ({extra})")


def _seed_n(bus: str, n: int) -> list[dict[str, Any]]:
    gui = _gui()
    if not ghostty_argv():
        raise CampaignError("missing ghostty on PATH", exit_code=127)
    seed_ghostty_tiles(bus, gui, n)
    return _wait_tiles(bus, n)


def _seed_two_slot(bus: str) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    _seed_n(bus, 2)
    forest = _wait_half_pair(bus, stage="seed-2slot")
    a, b = _ordered_tiles(forest)
    for w in (a, b):
        assert_mode(w, "TILE", stage="seed-2slot")
    return forest, a, b


def _launch_third(bus: str, *, focus_id: str) -> dict[str, Any]:
    before = window_ids(get_tree(bus))
    if focus_id:
        _focus_id(bus, focus_id)
        time.sleep(0.2)
    opened = open_nautilus_or_ghostty(bus, _gui(), before)
    cid = str(opened.get("windowId") or "")
    if not cid:
        raise CampaignError("launch third: missing windowId")
    deadline = time.monotonic() + 14.0
    last: Optional[dict[str, Any]] = None
    while time.monotonic() < deadline:
        forest = get_tree(bus)
        for w in _tiles(forest) + float_windows(forest):
            if node_id(w) == cid:
                last = w
                if node_mode(w) in ("", "TILE", "FLOAT"):
                    if is_tile_win(w) or node_mode(w) == "FLOAT":
                        return {"window": w, "meta": opened, "forest": forest}
        time.sleep(0.25)
    raise CampaignError(
        f"launch third id={cid} did not appear ({opened}); "
        f"last={node_id(last) if last else None}"
    )


def _ensure_profile(name: str, body: Mapping[str, Any], *, env: Optional[Mapping[str, str]] = None) -> str:
    n = refuse_personal_profile(name)
    e = env if env is not None else os.environ
    resolved = resolve_profile(n, env=e)
    if resolved.get("found") and resolved.get("path"):
        dest = Path(str(resolved["path"]))
        try:
            cur = json.loads(dest.read_text(encoding="utf-8"))
        except (OSError, TypeError, json.JSONDecodeError):
            cur = {}
        desc = str(cur.get("description") or "")
        if "FORGE TEST" in desc and (
            cur.get("tiles") != body.get("tiles")
            or cur.get("marginal") != body.get("marginal")
            or cur.get("focus") != body.get("focus")
        ):
            dest.write_text(json.dumps(dict(body), indent=2) + "\n", encoding="utf-8")
        return n
    root = layout_tree_root(e)
    dest = root / "common" / f"{n}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(dict(body), indent=2) + "\n", encoding="utf-8")
    return n


def ensure_one_ws_profile(*, env: Optional[Mapping[str, str]] = None) -> str:
    return _ensure_profile(PROFILE_ONE_WS, PROFILE_ONE_WS_BODY, env=env)


def _apply_profile(
    bus: str,
    name: str,
    body: Mapping[str, Any],
    *,
    stage: str,
    workspace_1based: int = 1,
    monitor: int = 0,
) -> dict[str, Any]:
    gui = _gui()
    _ensure_profile(name, body, env=gui)
    try:
        run_layout(
            name, gui, timeout_s=180.0, workspace_1based=int(workspace_1based)
        )
    except CampaignError as e:
        if "timed out" in str(e):
            raise
        # Story oracle is GetTree; forest-match / hard-failed logs are not.
    ws = int(workspace_1based) - 1
    return _wait_half_pair(
        bus, stage=stage, timeout_s=20.0, workspace=ws, monitor=int(monitor)
    )


def _apply_one_ws(bus: str) -> dict[str, Any]:
    return _apply_profile(
        bus, PROFILE_ONE_WS, PROFILE_ONE_WS_BODY, stage="layout-one-ws"
    )


def _apply_one_ws_mon1(bus: str) -> dict[str, Any]:
    return _apply_profile(
        bus,
        PROFILE_ONE_WS_MON1,
        PROFILE_ONE_WS_MON1_BODY,
        stage="layout-one-ws-mon1",
        monitor=1,
    )


def _bag_window_kids(bag: Mapping[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for c in children_of(bag):
        if node_type(c) == "WINDOW":
            out.append(c)
    return out


def _require_gdbus() -> None:
    import shutil

    if shutil.which("gdbus"):
        return
    raise CampaignError(
        "missing gdbus on PATH (install: sudo apt install libglib2.0-bin)",
        exit_code=127,
    )


def _ready(bus: str) -> None:
    from nested_wayland import wait_forge_ready

    _require_gdbus()
    if not wait_forge_ready(bus, timeout_s=20.0):
        raise CampaignError("Forge DBus not ready")
    deadline = time.monotonic() + 8.0
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        try:
            get_tree(bus, timeout=4.0)
            return
        except InvokeError as e:
            last_err = e
            time.sleep(0.25)
    raise CampaignError(f"Forge GetTree not ready ({last_err})")


def _run_body(story: Story, body) -> int:
    try:
        bus = _bus()
        _ready(bus)
        _clear_tiles(bus)
        body(bus, story)
        print(f"{story.id} ok", file=sys.stderr)
        return 0
    except (OracleError, ShareError) as e:
        print(f"{story.id}: {e}", file=sys.stderr)
        return 1
    except CampaignError as e:
        print(f"{story.id}: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    except InvokeError as e:
        print(f"{story.id}: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)


def _assert_slot_split(
    forest: Mapping[str, Any],
    *,
    a_id: str,
    b_id: str,
    c_id: str,
    c_class: str,
    stage: str,
    shape: str = "H(V(A,C),B)",
    keep_id: Optional[str] = None,
) -> None:
    """Expect slot-split of the focused unit; sibling keeps ~1/2."""
    report = _desk_report(forest)
    got = monitor_shape(forest, 0)
    work = workarea_of(forest, 0)
    by_id = {node_id(w): w for w in _tiles(forest)}
    if c_id not in by_id:
        raise OracleError(f"{stage}: launched C id={c_id} not TILE; {report}")
    c = by_id[c_id]
    assert_mode(c, "TILE", stage=stage)
    assert_identity(c, stage=stage, window_id=c_id, wm_class=c_class or None)
    if got == "H(WINDOW,WINDOW,WINDOW)":
        raise OracleError(
            f"{stage}: even-thirds H(A,B,C) (want {shape}); {report}"
        )
    try:
        assert_who_sits_where(forest, shape, monitor=0, stage=stage)
    except OracleError as e:
        raise OracleError(f"{e}; {report}") from e
    keep_id = keep_id or b_id
    keep = by_id.get(keep_id)
    keep_label = "A" if keep_id == a_id else "B" if keep_id == b_id else "C"
    if keep is None:
        raise OracleError(f"{stage}: {keep_label} id={keep_id} missing; {report}")
    if width_in_third_band(keep, work):
        raise OracleError(
            f"{stage}: {keep_label} width ~1/3 of monitor; {report}"
        )
    assert_visible_not_third(keep, work, stage=stage)
    wr_keep = width_ratio(keep, work)
    labels = {a_id: "A", b_id: "B", c_id: "C"}
    for peer_id in (a_id, b_id, c_id):
        if peer_id == keep_id:
            continue
        peer = by_id.get(peer_id)
        label = labels.get(peer_id, peer_id)
        if peer is None:
            raise OracleError(f"{stage}: {label} id={peer_id} missing; {report}")
        wr = width_ratio(peer, work)
        if width_in_third_band(peer, work):
            raise OracleError(
                f"{stage}: {label} column ~1/3 of monitor; {report}"
            )
        if abs(wr - wr_keep) > 0.12:
            raise OracleError(
                f"{stage}: {label} width {wr:.3f} != {keep_label} {wr_keep:.3f}; {report}"
            )
        assert_mode(peer, "TILE", stage=stage)


def _body_launch_into_2slot(bus: str, story: Story) -> None:
    _forest, a, b = _seed_two_slot(bus)
    a_id, b_id = node_id(a), node_id(b)
    launched = _launch_third(bus, focus_id=a_id)
    _wait_slot_split(
        bus,
        story,
        a_id=a_id,
        b_id=b_id,
        launched=launched,
        shape="H(V(A,C),B)",
        keep_id=b_id,
    )


def _wait_slot_split(
    bus: str,
    story: Story,
    *,
    a_id: str,
    b_id: str,
    launched: Mapping[str, Any],
    shape: str,
    keep_id: str,
) -> None:
    c = launched["window"]
    c_id = node_id(c)
    c_class = node_wm_class(c)
    deadline = time.monotonic() + 10.0
    last = launched["forest"]
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            _assert_slot_split(
                last,
                a_id=a_id,
                b_id=b_id,
                c_id=c_id,
                c_class=c_class,
                stage=story.id,
                shape=shape,
                keep_id=keep_id,
            )
            return
        except OracleError as e:
            last_err = e
            time.sleep(0.3)
    print(f"{story.id} actual: {_desk_report(last)}", file=sys.stderr)
    if last_err is not None:
        raise last_err
    raise OracleError(f"{story.id}: slot-split did not settle")


def _body_launch_into_2slot_other_focus(bus: str, story: Story) -> None:
    _forest, a, b = _seed_two_slot(bus)
    a_id, b_id = node_id(a), node_id(b)
    launched = _launch_third(bus, focus_id=b_id)
    _wait_slot_split(
        bus,
        story,
        a_id=a_id,
        b_id=b_id,
        launched=launched,
        shape="H(A,V(B,C))",
        keep_id=a_id,
    )


def _body_second_on_empty(bus: str, story: Story) -> None:
    launched_a = _launch_third(bus, focus_id="")
    a = launched_a["window"]
    a_id = node_id(a)
    deadline = time.monotonic() + 10.0
    last = launched_a["forest"]
    while time.monotonic() < deadline:
        last = get_tree(bus)
        tiles = _tiles(last)
        if len(tiles) == 1 and node_id(tiles[0]) == a_id and is_tile_win(tiles[0]):
            break
        time.sleep(0.25)
    launched_b = _launch_third(bus, focus_id=a_id)
    b_id = node_id(launched_b["window"])
    last_err: Optional[BaseException] = None
    deadline = time.monotonic() + 10.0
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            assert_who_sits_where(last, "H(A,B)", monitor=0, stage=story.id)
            panes = _ordered_tiles(last)
            ids = _win_ids(panes)
            if set(ids) != {a_id, b_id}:
                raise OracleError(
                    f"{story.id}: ids {ids} != A,B; {_desk_report(last)}"
                )
            assert_visible_fill_half(panes, workarea_of(last, 0), stage=story.id)
            for w in panes:
                assert_mode(w, "TILE", stage=story.id)
            return
        except OracleError as e:
            last_err = e
            time.sleep(0.3)
    print(f"{story.id} actual: {_desk_report(last)}", file=sys.stderr)
    if last_err is not None:
        raise last_err
    raise OracleError(f"{story.id}: second-on-empty did not settle")


def _body_empty_head_dock(bus: str, story: Story) -> None:
    _require_monitors(bus, 2, stage=story.id)
    _forest, a, b = _seed_two_slot(bus)
    a_id, b_id = node_id(a), node_id(b)
    if tiled_on_mon(get_tree(bus), 1):
        raise OracleError(
            f"{story.id}: Mon1 not empty Given; {_desk_report(get_tree(bus), monitor=1)}"
        )
    _focus_id(bus, a_id)
    _warp_pointer_monitor(bus, 1, stage=story.id)
    time.sleep(0.4)
    launched = _launch_third(bus, focus_id="")
    c_id = node_id(launched["window"])
    deadline = time.monotonic() + 12.0
    last = launched["forest"]
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            m0 = tiled_on_mon(last, 0)
            m1 = tiled_on_mon(last, 1)
            if set(_win_ids(m0)) != {a_id, b_id}:
                raise OracleError(
                    f"{story.id}: Mon0 mutated {_win_ids(m0)}; {_desk_report(last, monitor=0)}"
                )
            if _win_ids(m1) != [c_id]:
                raise OracleError(
                    f"{story.id}: Mon1 ids {_win_ids(m1)} != [C {c_id}]; "
                    f"{_desk_report(last, monitor=1)}"
                )
            c = next(w for w in m1 if node_id(w) == c_id)
            assert_mode(c, "TILE", stage=story.id)
            if window_mon_index(last, c_id) != 1:
                raise OracleError(f"{story.id}: C not on Mon1")
            return
        except (OracleError, StopIteration) as e:
            last_err = e
            time.sleep(0.3)
    extra = (
        f"mon0={_desk_report(last, monitor=0)} "
        f"mon1={_desk_report(last, monitor=1)}"
    )
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {extra}")
    raise CampaignError(f"{story.id}: empty-head dock did not settle ({extra})")


def _body_pointer_on_tiled_stays_lft(bus: str, story: Story) -> None:
    _require_monitors(bus, 2, stage=story.id)
    _forest, a, b = _seed_two_slot(bus)
    a_id, b_id = node_id(a), node_id(b)
    _warp_pointer_monitor(bus, 0, stage=story.id)
    launched = _launch_third(bus, focus_id=a_id)
    _wait_slot_split(
        bus,
        story,
        a_id=a_id,
        b_id=b_id,
        launched=launched,
        shape="H(V(A,C),B)",
        keep_id=b_id,
    )
    last = get_tree(bus)
    if tiled_on_mon(last, 1):
        raise OracleError(
            f"{story.id}: Mon1 not empty; {_desk_report(last, monitor=1)}"
        )


def _body_launch_into_tab(bus: str, story: Story) -> None:
    _forest, a, b = _seed_two_slot(bus)
    a_id, b_id = node_id(a), node_id(b)
    _center_join(bus, a_id, b_id)
    forest = _wait_shape(bus, "TAB(A,B)", stage=f"{story.id}/given", timeout_s=12.0)
    bag = _first_bag(forest)
    leaf = open_leaf(bag) or (_bag_window_kids(bag) or [None])[0]
    if leaf is None or node_id(leaf) != a_id:
        forest = _reveal_in_bag(bus, a_id, stage=f"{story.id}/open-A")
    launched = _launch_third(bus, focus_id=a_id)
    c_id = node_id(launched["window"])
    deadline = time.monotonic() + 12.0
    last = launched["forest"]
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            got = monitor_shape(last, 0)
            if got.startswith("H(") or got.startswith("V("):
                raise OracleError(
                    f"{story.id}: split of bag {got} (want TAB insert); "
                    f"{_desk_report(last)}"
                )
            assert_who_sits_where(last, "TAB(A,B,C)", monitor=0, stage=story.id)
            bag = _first_bag(last)
            kids = _bag_window_kids(bag)
            kid_ids = set(_win_ids(kids))
            if kid_ids != {a_id, b_id, c_id}:
                raise OracleError(
                    f"{story.id}: TAB kids {sorted(kid_ids)} != A,B,C; "
                    f"{_desk_report(last)}"
                )
            if len(kids) >= 2:
                for k in kids[1:]:
                    if not _same_rect(kids[0], k):
                        raise OracleError(
                            f"{story.id}: TAB peers not one slot "
                            f"{window_rect(kids[0])} vs {window_rect(k)}"
                        )
            work = workarea_of(last, 0)
            wr = width_ratio(kids[0], work)
            if wr + 1e-9 < FULL_LO:
                raise OracleError(
                    f"{story.id}: TAB slot not ~full monitor width_ratio={wr:.3f}"
                )
            leaf = open_leaf(bag) or kids[0]
            if node_id(leaf) not in (a_id, c_id):
                raise OracleError(
                    f"{story.id}: open leaf {node_id(leaf)} not A or C; "
                    f"{_desk_report(last)}"
                )
            for w in kids:
                assert_mode(w, "TILE", stage=story.id)
            return
        except OracleError as e:
            last_err = e
            time.sleep(0.3)
    extra = _desk_report(last) if last else "empty"
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {extra}")
    raise CampaignError(f"{story.id}: launch-into-tab did not settle ({extra})")


def _body_launch_next_to_tab_con(bus: str, story: Story) -> None:
    a_id, b_id, c_id, _forest = _given_tab_plus_sibling(bus, story)
    _focus_id(bus, a_id)
    invoke_on_bus(bus, "focus.parent", spec={"id": a_id, "activate": True})
    time.sleep(0.2)
    launched = _launch_third(bus, focus_id="")
    d_id = node_id(launched["window"])
    deadline = time.monotonic() + 12.0
    last = launched["forest"]
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            assert_who_sits_where(
                last, "H(V(TAB(A,B),D),C)", monitor=0, stage=story.id
            )
            bag = _first_bag(last)
            kids = _bag_window_kids(bag)
            kid_ids = set(_win_ids(kids))
            if {a_id, b_id} - kid_ids:
                raise OracleError(
                    f"{story.id}: TAB missing A/B have={sorted(kid_ids)}; "
                    f"{_desk_report(last)}"
                )
            if d_id in kid_ids:
                raise OracleError(
                    f"{story.id}: D entered TAB (want wrap of TAB CON); "
                    f"{_desk_report(last)}"
                )
            if len(kids) >= 2 and not _same_rect(kids[0], kids[1]):
                raise OracleError(
                    f"{story.id}: TAB peers not one slot "
                    f"{window_rect(kids[0])} vs {window_rect(kids[1])}"
                )
            c_now = next(w for w in _tiles(last) if node_id(w) == c_id)
            assert_mode(c_now, "TILE", stage=story.id)
            assert_visible_not_third(c_now, workarea_of(last, 0), stage=story.id)
            d_now = next(w for w in _tiles(last) if node_id(w) == d_id)
            assert_mode(d_now, "TILE", stage=story.id)
            return
        except (OracleError, StopIteration) as e:
            last_err = e
            time.sleep(0.3)
    extra = _desk_report(last) if last else "empty"
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {extra}")
    raise CampaignError(
        f"{story.id}: launch-next-to-tab-con did not settle ({extra})"
    )


def _body_close_three(bus: str, story: Story) -> None:
    gui = _gui()
    _ensure_profile(PROFILE_THREE, PROFILE_THREE_BODY, env=gui)
    run_layout(PROFILE_THREE, gui, timeout_s=180.0, workspace_1based=1)
    before = _wait_tiles(bus, 3, timeout_s=20.0)
    forest = _wait_shape(bus, "H(A,B,C)", stage=f"{story.id}/given", timeout_s=12.0)
    mon = workarea_of(forest, 0)
    assert_seed_three(before, mon, stage="seed-3")
    victim = _ordered_tiles(forest)[-1]
    victim_id = node_id(victim)
    close_window_id(bus, victim_id)
    _wait_tiles(bus, 2, timeout_s=16.0)
    deadline = time.monotonic() + 10.0
    last_err: Optional[BaseException] = None
    last = forest
    while time.monotonic() < deadline:
        last = get_tree(bus)
        after = _ordered_tiles(last)
        try:
            assert_who_sits_where(last, "H(A,B)", monitor=0, stage=story.id)
            assert_visible_fill_half(
                after, workarea_of(last, 0), stage=story.id, closed_id=victim_id
            )
            assert_split_percents_half(last, stage=story.id)
            for w in after:
                assert_mode(w, "TILE", stage=story.id)
            return
        except (OracleError, ShareError) as e:
            last_err = e
            time.sleep(0.25)
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {_desk_report(last)}")
    raise CampaignError(f"{story.id}: remaining pair did not fill ~1/2")


def _body_close_split_unit_peer(bus: str, story: Story) -> None:
    _forest, a, b = _seed_two_slot(bus)
    a_id, b_id = node_id(a), node_id(b)
    launched = _launch_third(bus, focus_id=a_id)
    _wait_slot_split(
        bus,
        story,
        a_id=a_id,
        b_id=b_id,
        launched=launched,
        shape="H(V(A,C),B)",
        keep_id=b_id,
    )
    c_id = node_id(launched["window"])
    close_window_id(bus, c_id)
    _wait_tiles(bus, 2, timeout_s=16.0)
    deadline = time.monotonic() + 10.0
    last = get_tree(bus)
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            assert_who_sits_where(last, "H(A,B)", monitor=0, stage=story.id)
            after = _ordered_tiles(last)
            ids = set(_win_ids(after))
            if ids != {a_id, b_id}:
                raise OracleError(
                    f"{story.id}: remaining {sorted(ids)} != A,B; {_desk_report(last)}"
                )
            got = monitor_shape(last, 0)
            if "V(" in got:
                raise OracleError(
                    f"{story.id}: unary V leftover {got}; {_desk_report(last)}"
                )
            assert_visible_fill_half(
                after, workarea_of(last, 0), stage=story.id, closed_id=c_id
            )
            for w in after:
                assert_mode(w, "TILE", stage=story.id)
            return
        except (OracleError, ShareError) as e:
            last_err = e
            time.sleep(0.25)
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {_desk_report(last)}")
    raise CampaignError(f"{story.id}: close split-peer did not collapse to H(A,B)")


def _body_tabs_open_leaf(bus: str, story: Story) -> None:
    a_id, b_id, c_id, forest = _given_tab_plus_sibling(bus, story)
    bags = find_bag_groups(forest)
    if not bags:
        raise OracleError(f"{story.id}: no TAB/STACK; {_desk_report(forest)}")
    bag = bags[0]
    kids = _bag_window_kids(bag)
    kid_ids = set(_win_ids(kids))
    if {a_id, b_id} - kid_ids:
        raise OracleError(
            f"{story.id}: TAB missing A/B have={sorted(kid_ids)}; {_desk_report(forest)}"
        )
    if c_id in kid_ids:
        raise OracleError(f"{story.id}: C buried in TAB; {_desk_report(forest)}")
    leaf = open_leaf(bag) or kids[0]
    if node_id(leaf) not in (a_id, b_id):
        raise OracleError(f"{story.id}: open leaf not A/B; {_desk_report(forest)}")
    buried = next(k for k in kids if node_id(k) != node_id(leaf))
    if not _same_rect(leaf, buried):
        raise OracleError(
            f"{story.id}: TAB peers not one slot rect "
            f"leaf={window_rect(leaf)} buried={window_rect(buried)}"
        )
    assert_mode(buried, "TILE", stage=story.id)
    panes = visible_panes(forest, monitor=0)
    pane_ids = _win_ids(panes)
    if node_id(buried) in pane_ids:
        raise OracleError(
            f"{story.id}: buried TILE is a second pane ids={pane_ids}"
        )
    if c_id not in pane_ids:
        raise OracleError(f"{story.id}: C not visible; panes={pane_ids}")
    c_now = next(w for w in _tiles(forest) if node_id(w) == c_id)
    assert_visible_not_third(c_now, workarea_of(forest, 0), stage=story.id)
    assert_mode(c_now, "TILE", stage=story.id)


def _body_layout_one_ws(bus: str, story: Story) -> None:
    forest = _apply_one_ws(bus)
    assert_who_sits_where(forest, "H(A,B)", monitor=0, stage=story.id)
    panes = _ordered_tiles(forest)
    if len(panes) != 2:
        raise OracleError(
            f"{story.id}: want 2 TILE roles have={_win_ids(panes)}; {_desk_report(forest)}"
        )
    for w in panes:
        assert_mode(w, "TILE", stage=story.id)
        assert_identity(w, stage=story.id, wm_class="ghostty")
    assert_visible_fill_half(panes, workarea_of(forest, 0), stage=story.id)


def _body_layout_apply_tab_open_leaf(bus: str, story: Story) -> None:
    gui = _gui()
    _ensure_profile(PROFILE_TAB, PROFILE_TAB_BODY, env=gui)
    try:
        run_layout(PROFILE_TAB, gui, timeout_s=180.0, workspace_1based=1)
    except CampaignError as e:
        if "timed out" in str(e):
            raise
    forest = _wait_shape(bus, "TAB(A,B)", stage=story.id, timeout_s=20.0)
    bag = _first_bag(forest)
    kids = _bag_window_kids(bag)
    if len(kids) < 2:
        raise OracleError(
            f"{story.id}: TAB kids short have={_win_ids(kids)}; {_desk_report(forest)}"
        )
    if not _same_rect(kids[0], kids[1]):
        raise OracleError(
            f"{story.id}: TAB peers not one slot "
            f"{window_rect(kids[0])} vs {window_rect(kids[1])}"
        )
    leaf = open_leaf(bag) or kids[0]
    panes = visible_panes(forest, monitor=0)
    pane_ids = _win_ids(panes)
    if node_id(leaf) not in pane_ids:
        raise OracleError(
            f"{story.id}: open leaf {node_id(leaf)} not visible; panes={pane_ids}"
        )
    buried = next(k for k in kids if node_id(k) != node_id(leaf))
    if node_id(buried) in pane_ids:
        raise OracleError(
            f"{story.id}: buried TILE is a second pane ids={pane_ids}"
        )
    for w in kids:
        assert_mode(w, "TILE", stage=story.id)


def _two_tab_join_ids(forest: Mapping[str, Any], *, stage: str) -> tuple[str, str, str, str]:
    """A,B left TAB kids; C,D right TAB kids in child order (C = left edge)."""
    bags = find_bag_groups(forest)
    if len(bags) != 2:
        raise OracleError(
            f"{stage}: want 2 TAB have={len(bags)}; {_desk_report(forest)}"
        )

    def _bag_x(bag: Mapping[str, Any]) -> float:
        kids = _bag_window_kids(bag)
        if kids:
            return window_rect_x(kids[0])
        return window_rect_x(bag)

    left, right = sorted(bags, key=_bag_x)
    lk = _bag_window_kids(left)
    rk = _bag_window_kids(right)
    if len(lk) < 2 or len(rk) < 2:
        raise OracleError(f"{stage}: TAB kids short; {_desk_report(forest)}")
    return node_id(lk[0]), node_id(lk[1]), node_id(rk[0]), node_id(rk[1])


def _given_two_tabs(bus: str, story: Story) -> tuple[str, str, str, str]:
    _seed_n(bus, 4)
    ordered = _ordered_tiles(get_tree(bus))
    if len(ordered) != 4:
        raise CampaignError(f"{story.id}: seed 4 have={_win_ids(ordered)}")
    a_id, b_id, c_id, d_id = _win_ids(ordered)
    time.sleep(0.8)
    # CENTER appends the grab. Onto stays first so TAB(A,B) / TAB(C,D).
    _center_join(bus, b_id, a_id)
    time.sleep(0.6)
    _center_join(bus, d_id, c_id)
    try:
        forest = _wait_shape(
            bus, "H(TAB(A,B),TAB(C,D))", stage=f"{story.id}/given", timeout_s=8.0
        )
        return _two_tab_join_ids(forest, stage=f"{story.id}/given")
    except OracleError:
        pass
    _clear_tiles(bus)
    gui = _gui()
    _ensure_profile(PROFILE_JOIN, PROFILE_JOIN_BODY, env=gui)
    run_layout(PROFILE_JOIN, gui, timeout_s=180.0, workspace_1based=1)
    forest = _wait_shape(
        bus, "H(TAB(A,B),TAB(C,D))", stage=f"{story.id}/layout-given", timeout_s=20.0
    )
    return _two_tab_join_ids(forest, stage=f"{story.id}/layout-given")


def _body_mark2_join_enter(bus: str, story: Story) -> None:
    a_id, b_id, c_id, d_id = _given_two_tabs(bus, story)
    _focus_id(bus, c_id)
    invoke_on_bus(bus, "join.left", spec={"id": c_id, "activate": True})
    forest = _wait_shape(bus, "H(TAB(A,B,C),D)", stage=story.id, timeout_s=12.0)
    bags = find_bag_groups(forest)
    if len(bags) != 1:
        raise OracleError(
            f"{story.id}: want one TAB after join have={len(bags)}; {_desk_report(forest)}"
        )
    kid_ids = set(_win_ids(_bag_window_kids(bags[0])))
    if kid_ids != {a_id, b_id, c_id}:
        raise OracleError(
            f"{story.id}: TAB kids {sorted(kid_ids)} != A,B,C; {_desk_report(forest)}"
        )
    if d_id in kid_ids:
        raise OracleError(f"{story.id}: D entered TAB; {_desk_report(forest)}")
    d_now = next((w for w in _tiles(forest) if node_id(w) == d_id), None)
    if d_now is None:
        raise OracleError(f"{story.id}: D missing; {_desk_report(forest)}")
    assert_mode(d_now, "TILE", stage=story.id)


def _body_mark2_join_flatten(bus: str, story: Story) -> None:
    _forest, a, b = _seed_two_slot(bus)
    a_id, b_id = node_id(a), node_id(b)
    launched_c = _launch_third(bus, focus_id=a_id)
    c_id = node_id(launched_c["window"])
    _wait_slot_split(
        bus,
        story,
        a_id=a_id,
        b_id=b_id,
        launched=launched_c,
        shape="H(V(A,C),B)",
        keep_id=b_id,
    )
    launched_d = _launch_third(bus, focus_id=b_id)
    d_id = node_id(launched_d["window"])
    _wait_shape(
        bus,
        "H(V(A,C),V(B,D))",
        stage=f"{story.id}/given",
        timeout_s=12.0,
    )
    _focus_id(bus, b_id)
    invoke_on_bus(bus, "join.left", spec={"id": b_id, "activate": True})
    deadline = time.monotonic() + 12.0
    last = get_tree(bus)
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            got = monitor_shape(last, 0)
            if "TAB" in got:
                raise OracleError(
                    f"{story.id}: TAB wrap {got}; {_desk_report(last)}"
                )
            assert_who_sits_where(last, "H(A,B,C,D)", monitor=0, stage=story.id)
            if "V(" in got:
                raise OracleError(
                    f"{story.id}: V left intact {got}; {_desk_report(last)}"
                )
            ids = set(_win_ids(_ordered_tiles(last)))
            if ids != {a_id, b_id, c_id, d_id}:
                raise OracleError(
                    f"{story.id}: ids {sorted(ids)} != A,B,C,D; {_desk_report(last)}"
                )
            for w in _ordered_tiles(last):
                assert_mode(w, "TILE", stage=story.id)
            return
        except OracleError as e:
            last_err = e
            time.sleep(0.3)
    extra = _desk_report(last) if last else "empty"
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {extra}")
    raise CampaignError(f"{story.id}: join-flatten did not settle ({extra})")


def _body_float_not_under_monitor(bus: str, story: Story) -> None:
    _forest, a, b = _seed_two_slot(bus)
    a_id, b_id = node_id(a), node_id(b)
    launched = _launch_third(bus, focus_id=a_id)
    c = launched["window"]
    c_id = node_id(c)
    if node_mode(c) != "FLOAT":
        _focus_id(bus, c_id)
        invoke_on_bus(bus, "FloatToggle", spec={"id": c_id, "activate": True})
    deadline = time.monotonic() + 10.0
    last = get_tree(bus)
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            hits = assert_float_not_under_monitor(
                last, stage=story.id, window_id=c_id
            )
            if not hits:
                raise OracleError(f"{story.id}: FLOATS empty after FloatToggle")
            tile_ids = set(_win_ids(_tiles(last)))
            if c_id in tile_ids:
                raise OracleError(f"{story.id}: C still TILE; {_desk_report(last)}")
            for wid in (a_id, b_id):
                if wid not in tile_ids:
                    raise OracleError(
                        f"{story.id}: TILE sibling {wid} gone; {_desk_report(last)}"
                    )
                w = next(t for t in _tiles(last) if node_id(t) == wid)
                assert_mode(w, "TILE", stage=story.id)
            got = monitor_shape(last, 0)
            if got not in ("H(WINDOW,WINDOW)", "WINDOW"):
                raise OracleError(
                    f"{story.id}: TILES shape {got} after float; {_desk_report(last)}"
                )
            return
        except OracleError as e:
            last_err = e
            time.sleep(0.25)
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {_desk_report(last)}")
    raise CampaignError(f"{story.id}: C did not land in FLOATS")


def _body_float_retile_into_tiles(bus: str, story: Story) -> None:
    from nested_wayland import shell_eval

    _forest, a, b = _seed_two_slot(bus)
    a_id, b_id = node_id(a), node_id(b)
    launched = _launch_third(bus, focus_id=a_id)
    c = launched["window"]
    c_id = node_id(c)
    if node_mode(c) != "FLOAT":
        _focus_id(bus, c_id)
        invoke_on_bus(bus, "FloatToggle", spec={"id": c_id, "activate": True})
    deadline = time.monotonic() + 10.0
    last = get_tree(bus)
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            hits = assert_float_not_under_monitor(
                last, stage=f"{story.id}/given", window_id=c_id
            )
            if not hits:
                raise OracleError(f"{story.id}: FLOATS empty after FloatToggle")
            break
        except OracleError as e:
            last_err = e
            time.sleep(0.25)
    else:
        extra = _desk_report(last) if last else "empty"
        if last_err is not None:
            raise OracleError(f"{last_err}; actual {extra}")
        raise CampaignError(f"{story.id}: C did not FLOAT ({extra})")
    forest = get_tree(bus)
    spec = {
        "tile": dnd_token_to_selector(f"id:{c_id}", forest),
        "onto": dnd_token_to_selector(f"id:{a_id}", forest),
        "zone": "RIGHT",
        "quiet": True,
        "simulateEnteredMonitor": False,
    }
    ok, raw = shell_eval(bus, build_dnd_drop_js(spec), timeout=12.0)
    drop = parse_invoke_result(raw) if ok else {}
    if not (ok and drop.get("ok")):
        _focus_id(bus, c_id)
        invoke_on_bus(bus, "FloatToggle", spec={"id": c_id, "activate": True})
    settle_deadline = time.monotonic() + 12.0
    last_err = None
    last = get_tree(bus)
    while time.monotonic() < settle_deadline:
        last = get_tree(bus)
        try:
            if any(node_id(f) == c_id for f in float_windows(last)):
                raise OracleError(
                    f"{story.id}: C still FLOAT; {_desk_report(last)}"
                )
            by_id = {node_id(w): w for w in _tiles(last)}
            if c_id not in by_id:
                raise OracleError(f"{story.id}: C not TILE; {_desk_report(last)}")
            assert_mode(by_id[c_id], "TILE", stage=story.id)
            keep = by_id.get(b_id)
            if keep is None:
                raise OracleError(f"{story.id}: B missing; {_desk_report(last)}")
            assert_visible_not_third(keep, workarea_of(last, 0), stage=story.id)
            got = monitor_shape(last, 0)
            if got == "H(WINDOW,WINDOW,WINDOW)":
                raise OracleError(
                    f"{story.id}: even-thirds; {_desk_report(last)}"
                )
            return
        except OracleError as e:
            last_err = e
            time.sleep(0.3)
    extra = _desk_report(last) if last else "empty"
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {extra}")
    raise CampaignError(f"{story.id}: float retile did not settle ({extra})")


def _body_settle_visible(bus: str, story: Story) -> None:
    forest = _apply_one_ws(bus)
    assert_visible_only(
        forest,
        monitor=0,
        stage=story.id,
        expect_count=2,
        expect_shape="H(A,B)",
        expect_half=True,
    )
    panes = visible_panes(forest, monitor=0)
    for w in panes:
        assert_mode(w, "TILE", stage=story.id)
        assert_identity(w, stage=story.id, wm_class="ghostty")


def _is_unary_tab_monitor_shape(shape: str) -> bool:
    """TAB(A,B) filling the head, including a leftover unary H/V wrap."""
    s = normalize_shape(shape)
    return s in (
        "TAB(WINDOW,WINDOW)",
        "H(TAB(WINDOW,WINDOW))",
        "V(TAB(WINDOW,WINDOW))",
    )


def _assert_visible_open_leaf_group_slot(
    forest: Mapping[str, Any],
    *,
    stage: str,
    want_id: Optional[str] = None,
) -> dict[str, Any]:
    """D105: visible TAB open leaf fills the group slot.

    Buried peer Meta/rect is not a pass gate. Fails if the open leaf is
    the wrong size or a buried peer is shown as a second pane.
    Unary H/V around a lone TAB is leftover wrap, not a visible fail.
    """
    got = monitor_shape(forest, 0)
    if not _is_unary_tab_monitor_shape(got):
        raise OracleError(
            f"{stage}: shape {got} is not TAB(A,B) (unary wrap ok); "
            f"{_desk_report(forest)}"
        )
    assert_visible_only(
        forest,
        monitor=0,
        stage=stage,
        expect_count=1,
    )
    bag = _first_bag(forest)
    kids = _bag_window_kids(bag)
    if len(kids) < 2:
        raise OracleError(
            f"{stage}: TAB kids short have={_win_ids(kids)}; {_desk_report(forest)}"
        )
    leaf = open_leaf(bag) or kids[0]
    a_id = node_id(leaf)
    if want_id is not None and a_id != str(want_id):
        raise OracleError(
            f"{stage}: open leaf {a_id} != {want_id} (B shown instead of A); "
            f"{_desk_report(forest)}"
        )
    buried = next((k for k in kids if node_id(k) != a_id), None)
    if buried is None:
        raise OracleError(f"{stage}: no buried peer; {_desk_report(forest)}")
    panes = visible_panes(forest, monitor=0)
    pane_ids = _win_ids(panes)
    if a_id not in pane_ids:
        raise OracleError(
            f"{stage}: open leaf {a_id} not visible; panes={pane_ids}"
        )
    if node_id(buried) in pane_ids:
        raise OracleError(
            f"{stage}: buried TILE is shown instead of A; panes={pane_ids}"
        )
    assert_mode(leaf, "TILE", stage=stage)
    work = workarea_of(forest, 0)
    wr = width_ratio(leaf, work)
    hr = height_ratio(leaf, work)
    if wr + 1e-9 < FULL_LO or hr + 1e-9 < FULL_LO:
        raise OracleError(
            f"{stage}: A not group slot width_ratio={wr:.3f} "
            f"height_ratio={hr:.3f}; {_desk_report(forest)}"
        )
    # D105: do not inspect buried B Meta/rect quiet.
    return {
        "openLeaf": a_id,
        "buried": node_id(buried),
        "widthRatio": wr,
        "heightRatio": hr,
    }


def _body_settle_visible_first_open(bus: str, story: Story) -> None:
    gui = _gui()
    _ensure_profile(PROFILE_TAB, PROFILE_TAB_BODY, env=gui)
    try:
        run_layout(PROFILE_TAB, gui, timeout_s=180.0, workspace_1based=1)
    except CampaignError as e:
        if "timed out" in str(e):
            raise
    deadline = time.monotonic() + 20.0
    last: dict[str, Any] = {}
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            bag = _first_bag(last)
            kids = _bag_window_kids(bag)
            if not kids:
                raise OracleError(
                    f"{story.id}: no TAB window yet; {_desk_report(last)}"
                )
            want = node_id(kids[0])
            leaf = open_leaf(bag) or kids[0]
            if node_id(leaf) != want:
                raise OracleError(
                    f"{story.id}: strip {node_id(leaf)} != active {want}; "
                    f"{_desk_report(last)}"
                )
            return
        except OracleError as e:
            last_err = e
            time.sleep(0.25)
    extra = _desk_report(last) if last else "empty"
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {extra}")
    raise CampaignError(f"{story.id}: open leaf not active ({extra})")


def _body_settle_buried_peer_background(bus: str, story: Story) -> None:
    gui = _gui()
    _ensure_profile(PROFILE_TAB, PROFILE_TAB_BODY, env=gui)
    try:
        run_layout(PROFILE_TAB, gui, timeout_s=180.0, workspace_1based=1)
    except CampaignError as e:
        if "timed out" in str(e):
            raise
    deadline = time.monotonic() + 20.0
    last: dict[str, Any] = {}
    last_err: Optional[BaseException] = None
    a_id: Optional[str] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            bag = _first_bag(last)
            kids = _bag_window_kids(bag)
            if len(kids) < 2:
                raise OracleError(
                    f"{story.id}: TAB kids short have={_win_ids(kids)}; "
                    f"{_desk_report(last)}"
                )
            leaf = open_leaf(bag) or kids[0]
            if a_id is None:
                a_id = node_id(leaf)
            _assert_visible_open_leaf_group_slot(
                last, stage=story.id, want_id=a_id
            )
            return
        except OracleError as e:
            last_err = e
            time.sleep(0.25)
    extra = _desk_report(last) if last else "empty"
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {extra}")
    raise CampaignError(f"{story.id}: visible A did not settle ({extra})")


def _ws_snap(forest: Mapping[str, Any], *, monitor: int = 0) -> dict[str, Any]:
    tiles = _ordered_tiles(forest)
    return {
        "ids": _win_ids(tiles),
        "shape": monitor_shape(forest, monitor),
        "rects": {node_id(w): dict(window_rect(w)) for w in tiles},
        "modes": {node_id(w): node_mode(w) for w in tiles},
    }


def _assert_snap_same(
    before: Mapping[str, Any],
    after: Mapping[str, Any],
    *,
    stage: str,
    eps: float = RECT_EPS,
) -> None:
    if before["ids"] != after["ids"]:
        raise OracleError(
            f"{stage}: ids {after['ids']} != {before['ids']}"
        )
    if before["shape"] != after["shape"]:
        raise OracleError(
            f"{stage}: shape {after['shape']} != {before['shape']}"
        )
    for wid, r0 in before["rects"].items():
        r1 = after["rects"].get(wid)
        if r1 is None:
            raise OracleError(f"{stage}: id {wid} missing after")
        if any(abs(float(r0[k]) - float(r1[k])) > eps for k in r0):
            raise OracleError(f"{stage}: rect changed id={wid} {r0} -> {r1}")
        if before["modes"].get(wid) != after["modes"].get(wid):
            raise OracleError(
                f"{stage}: mode {after['modes'].get(wid)} != "
                f"{before['modes'].get(wid)} id={wid}"
            )


def _require_monitors(bus: str, want: int, *, stage: str) -> None:
    n = len(monitors_of(get_tree(bus)))
    if n < int(want):
        raise CampaignError(f"{stage}: need {want} monitors (have {n})")


def _warp_pointer_monitor(bus: str, mon: int, *, stage: str) -> None:
    from nested_wayland import shell_eval

    forest = get_tree(bus)
    wa = workarea_of(forest, mon)
    x = int(float(wa.get("x") or 0) + float(wa.get("width") or 0) / 2)
    y = int(float(wa.get("y") or 0) + float(wa.get("height") or 0) / 2)
    js = (
        "(function(){ try { "
        "const Clutter = imports.gi.Clutter; "
        "const seat = Clutter.get_default_backend().get_default_seat(); "
        "if (!seat || typeof seat.warp_pointer !== 'function') "
        "return 'ERROR:no-warp'; "
        f"seat.warp_pointer({x}, {y}); "
        "const p = typeof global.get_pointer === 'function' "
        "? global.get_pointer() : null; "
        "return JSON.stringify({ok:true,x:p&&p[0],y:p&&p[1]}); "
        "} catch (e) { return 'ERROR:' + String(e); } })()"
    )
    ok, raw = shell_eval(bus, js, timeout=5.0)
    if not ok or "ERROR" in str(raw):
        raise CampaignError(f"{stage}: warp pointer mon{mon} failed ({raw})")


def _first_bag(forest: Mapping[str, Any]) -> dict[str, Any]:
    bags = find_bag_groups(forest)
    if not bags:
        raise OracleError(f"no TAB/STACK; {_desk_report(forest)}")
    return bags[0]


def _reveal_in_bag(
    bus: str,
    want_id: str,
    *,
    stage: str,
    timeout_s: float = 10.0,
) -> dict[str, Any]:
    _focus_id(bus, want_id)
    deadline = time.monotonic() + timeout_s
    last: dict[str, Any] = {}
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            bag = _first_bag(last)
            leaf = open_leaf(bag) or (_bag_window_kids(bag) or [None])[0]
            if leaf is None or node_id(leaf) != want_id:
                raise OracleError(
                    f"{stage}: open leaf {node_id(leaf) if leaf else None} "
                    f"!= {want_id}"
                )
            return last
        except OracleError as e:
            last_err = e
            time.sleep(0.25)
    extra = _desk_report(last) if last else "empty"
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {extra}")
    raise CampaignError(f"{stage}: reveal did not settle ({extra})")


def _given_tab_plus_sibling(
    bus: str, story: Story
) -> tuple[str, str, str, dict[str, Any]]:
    _forest, a, c = _seed_two_slot(bus)
    a_id, c_id = node_id(a), node_id(c)
    launched = _launch_third(bus, focus_id=a_id)
    b_id = node_id(launched["window"])
    time.sleep(0.6)
    _center_join(bus, a_id, b_id)
    forest = _wait_shape(bus, "H(TAB(A,B),C)", stage=f"{story.id}/given", timeout_s=12.0)
    try:
        invoke_on_bus(bus, "size.shareAll", spec={"id": c_id, "activate": True})
    except InvokeError:
        invoke_on_bus(bus, "WindowResetSizes", spec={"id": c_id, "activate": True})
    deadline = time.monotonic() + 8.0
    last = forest
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            assert_who_sits_where(
                last, "H(TAB(A,B),C)", monitor=0, stage=f"{story.id}/given"
            )
            c_now = next(w for w in _tiles(last) if node_id(w) == c_id)
            work = workarea_of(last, 0)
            assert_visible_not_third(c_now, work, stage=story.id)
            # Join dest is full TAB height immediately; GetTree Meta of the
            # open leaf lags a beat after V-split join (same as group-tab
            # FULL_LO wait). Record R only after the visible pane fills.
            bag = _first_bag(last)
            kids = _bag_window_kids(bag)
            leaf = open_leaf(bag) or (kids[0] if kids else None)
            if leaf is None:
                raise OracleError(f"{story.id}/given: empty TAB; {_desk_report(last)}")
            hr = height_ratio(leaf, work)
            if hr + 1e-9 < FULL_LO:
                raise OracleError(
                    f"{story.id}/given: TAB leaf height_ratio={hr:.3f} "
                    f"rect={window_rect(leaf)}"
                )
            if len(kids) < 2:
                raise OracleError(
                    f"{story.id}/given: TAB kids short have={_win_ids(kids)}; "
                    f"{_desk_report(last)}"
                )
            buried = next(k for k in kids if node_id(k) != node_id(leaf))
            if not _same_rect(leaf, buried):
                raise OracleError(
                    f"{story.id}/given: TAB peers not one slot rect "
                    f"leaf={window_rect(leaf)} buried={window_rect(buried)}"
                )
            return a_id, b_id, c_id, last
        except (OracleError, ShareError, StopIteration) as e:
            last_err = e
            time.sleep(0.25)
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {_desk_report(last)}")
    raise CampaignError(f"{story.id}: TAB+C did not settle")


def _move_to_empty_monitor(
    bus: str, src_id: str, dest_mon: int, *, stage: str
) -> dict[str, Any]:
    from nested_wayland import shell_eval

    last_err: Any = None
    for sim in (False, True):
        forest = get_tree(bus)
        spec = {
            "tile": dnd_token_to_selector(f"id:{src_id}", forest),
            "onto": "",
            "zone": "CENTER",
            "quiet": True,
            "simulateEnteredMonitor": sim,
            "destMonitor": int(dest_mon),
        }
        ok, raw = shell_eval(bus, build_dnd_drop_js(spec), timeout=12.0)
        drop = parse_invoke_result(raw) if ok else {}
        if ok and drop.get("ok"):
            return drop
        last_err = drop.get("error") or raw
    raise CampaignError(f"{stage}: empty-mon move failed: {last_err}")


def _body_tabs_stacked(bus: str, story: Story) -> None:
    _forest, a, b = _seed_two_slot(bus)
    a_id, b_id = node_id(a), node_id(b)
    _focus_id(bus, a_id)
    invoke_on_bus(bus, "toggleTabStack", spec={"id": a_id, "activate": True})
    time.sleep(0.6)
    invoke_on_bus(bus, "toggleTabStack", spec={"id": a_id, "activate": True})
    forest = _wait_shape(bus, "STACK(A,B)", stage=story.id, timeout_s=12.0)
    bag = _first_bag(forest)
    kids = _bag_window_kids(bag)
    kid_ids = set(_win_ids(kids))
    if {a_id, b_id} - kid_ids:
        raise OracleError(
            f"{story.id}: STACK missing A/B have={sorted(kid_ids)}; "
            f"{_desk_report(forest)}"
        )
    leaf = open_leaf(bag) or kids[0]
    if node_id(leaf) != a_id:
        forest = _reveal_in_bag(bus, a_id, stage=f"{story.id}/open-A")
        bag = _first_bag(forest)
        kids = _bag_window_kids(bag)
        leaf = open_leaf(bag) or kids[0]
    # TAB→STACK adds a second title bar (D109). GetTree may still hold the
    # 1-bar TAB height until Meta catch-up; record r0 only after peers share
    # a stable STACK dest (reveal must not be the first shrink — D069).
    deadline = time.monotonic() + 8.0
    last_h: Optional[float] = None
    stable = 0
    last = forest
    while time.monotonic() < deadline:
        last = get_tree(bus)
        bag = _first_bag(last)
        kids = _bag_window_kids(bag)
        leaf = open_leaf(bag) or (kids[0] if kids else None)
        if leaf is None or len(kids) < 2:
            time.sleep(0.15)
            continue
        buried = next(k for k in kids if node_id(k) != node_id(leaf))
        if not _same_rect(leaf, buried):
            time.sleep(0.15)
            continue
        h = float(window_rect(leaf)["height"])
        if last_h is not None and abs(h - last_h) <= RECT_EPS:
            stable += 1
            if stable >= 2:
                forest = last
                break
        else:
            stable = 0
        last_h = h
        time.sleep(0.15)
    else:
        raise OracleError(
            f"{story.id}: STACK dest did not settle before reveal; "
            f"{_desk_report(last)}"
        )
    bag = _first_bag(forest)
    kids = _bag_window_kids(bag)
    leaf = open_leaf(bag) or kids[0]
    r0 = dict(window_rect(leaf))
    buried = next(k for k in kids if node_id(k) != a_id)
    if not _same_rect(leaf, buried):
        raise OracleError(
            f"{story.id}: STACK peers not one slot before reveal "
            f"leaf={window_rect(leaf)} buried={window_rect(buried)}"
        )
    forest = _reveal_in_bag(bus, b_id, stage=story.id)
    assert_who_sits_where(forest, "STACK(A,B)", monitor=0, stage=story.id)
    got = monitor_shape(forest, 0)
    if got.startswith("V("):
        raise OracleError(f"{story.id}: V split of A and B; {_desk_report(forest)}")
    bag = _first_bag(forest)
    kids = _bag_window_kids(bag)
    leaf = open_leaf(bag) or kids[0]
    if node_id(leaf) != b_id:
        raise OracleError(
            f"{story.id}: open leaf {node_id(leaf)} != B {b_id}; "
            f"{_desk_report(forest)}"
        )
    r1 = window_rect(leaf)
    if any(abs(float(r0[k]) - float(r1[k])) > RECT_EPS for k in r0):
        raise OracleError(
            f"{story.id}: STACK slot shrunk {r0} -> {r1}"
        )
    other = next(k for k in kids if node_id(k) != b_id)
    if not _same_rect(leaf, other):
        raise OracleError(
            f"{story.id}: STACK peers not one slot after reveal "
            f"leaf={r1} other={window_rect(other)}"
        )
    for w in kids:
        assert_mode(w, "TILE", stage=story.id)


def _body_tabs_reveal_no_shrink(bus: str, story: Story) -> None:
    a_id, b_id, c_id, forest = _given_tab_plus_sibling(bus, story)
    bag = _first_bag(forest)
    kids = _bag_window_kids(bag)
    leaf = open_leaf(bag) or kids[0]
    if node_id(leaf) != a_id:
        forest = _reveal_in_bag(bus, a_id, stage=f"{story.id}/open-A")
        bag = _first_bag(forest)
        kids = _bag_window_kids(bag)
        leaf = open_leaf(bag) or kids[0]
    r_tab = dict(window_rect(leaf))
    c_now = next(w for w in _tiles(forest) if node_id(w) == c_id)
    r_c = dict(window_rect(c_now))
    forest = _reveal_in_bag(bus, b_id, stage=story.id)
    assert_who_sits_where(forest, "H(TAB(A,B),C)", monitor=0, stage=story.id)
    bag = _first_bag(forest)
    kids = _bag_window_kids(bag)
    leaf = open_leaf(bag) or kids[0]
    if node_id(leaf) != b_id:
        raise OracleError(
            f"{story.id}: open leaf {node_id(leaf)} != B {b_id}; "
            f"{_desk_report(forest)}"
        )
    r1 = window_rect(leaf)
    if any(abs(float(r_tab[k]) - float(r1[k])) > RECT_EPS for k in r_tab):
        raise OracleError(f"{story.id}: TAB pane shrunk {r_tab} -> {r1}")
    buried = next(k for k in kids if node_id(k) != b_id)
    assert_mode(buried, "TILE", stage=story.id)
    if node_id(buried) != a_id:
        raise OracleError(
            f"{story.id}: buried {node_id(buried)} != A {a_id}"
        )
    if not _same_rect(leaf, buried):
        raise OracleError(
            f"{story.id}: TAB peers not one slot after reveal "
            f"leaf={r1} buried={window_rect(buried)}"
        )
    c_after = next(w for w in _tiles(forest) if node_id(w) == c_id)
    r_c2 = window_rect(c_after)
    if any(abs(float(r_c[k]) - float(r_c2[k])) > RECT_EPS for k in r_c):
        raise OracleError(f"{story.id}: C rect changed {r_c} -> {r_c2}")
    assert_mode(c_after, "TILE", stage=story.id)


def _body_layout_missing_roles(bus: str, story: Story) -> None:
    _seed_n(bus, 1)
    a = _ordered_tiles(get_tree(bus))[0]
    a_id = node_id(a)
    if not a_id:
        raise CampaignError(f"{story.id}: seed A missing windowId")
    forest = _apply_one_ws(bus)
    assert_who_sits_where(forest, "H(A,B)", monitor=0, stage=story.id)
    panes = _ordered_tiles(forest)
    ids = _win_ids(panes)
    if a_id not in ids:
        raise OracleError(
            f"{story.id}: A id={a_id} gone after apply; have={ids}; "
            f"{_desk_report(forest)}"
        )
    if len(ids) != 2:
        raise OracleError(
            f"{story.id}: want 2 TILE roles have={ids}; {_desk_report(forest)}"
        )
    b_id = next(i for i in ids if i != a_id)
    b = next(w for w in panes if node_id(w) == b_id)
    assert_mode(b, "TILE", stage=story.id)
    assert_identity(b, stage=story.id, window_id=b_id)
    if any(node_id(f) == b_id for f in float_windows(forest)):
        raise OracleError(f"{story.id}: B FLOAT leftover; {_desk_report(forest)}")
    a_now = next(w for w in panes if node_id(w) == a_id)
    assert_mode(a_now, "TILE", stage=story.id)
    assert_identity(a_now, stage=story.id, window_id=a_id)
    assert_visible_fill_half(panes, workarea_of(forest, 0), stage=story.id)


def _wait_two_half_tiles(
    bus: str,
    *,
    stage: str,
    timeout_s: float = 20.0,
) -> dict[str, Any]:
    """Visible 2-pane ~1/2. Unary H/V wrap is not a visible fail (D105)."""
    deadline = time.monotonic() + timeout_s
    last: dict[str, Any] = {}
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        panes = _ordered_tiles(last)
        if len(panes) == 2:
            try:
                assert_visible_fill_half(
                    panes, workarea_of(last, 0), stage=stage
                )
                return last
            except (OracleError, ShareError) as e:
                last_err = e
        time.sleep(0.25)
    extra = _desk_report(last) if last else "empty"
    if last_err is not None:
        raise OracleError(f"{stage}: {last_err}; actual {extra}")
    raise CampaignError(f"{stage}: pair did not settle ~1/2 ({extra})")


def _body_layout_extras_policy(bus: str, story: Story) -> None:
    # stories.md Given: Mon0(H(A,B)) plus extra TILE D — not even 3-way apply.
    pair_err = _try_layout(PROFILE_ONE_WS, PROFILE_ONE_WS_BODY)
    try:
        pair = _wait_two_half_tiles(bus, stage=f"{story.id}/given-pair")
    except OracleError as e:
        extra = f"; layout_cli={pair_err[:400]}" if pair_err else ""
        raise OracleError(f"{e}{extra}") from e
    panes = _ordered_tiles(pair)
    if len(panes) != 2:
        raise CampaignError(
            f"{story.id}: Given want H(A,B) have={_win_ids(panes)}"
        )
    launched = _launch_third(bus, focus_id=node_id(panes[0]))
    d_win = launched.get("window") or {}
    d_id = node_id(d_win)
    orig = _win_ids(_tiles(get_tree(bus)))
    if d_id and d_id not in orig:
        orig.append(d_id)
    if len(orig) != 3:
        raise CampaignError(
            f"{story.id}: Given want H(A,B)+D have={orig}; "
            f"{_desk_report(get_tree(bus))}"
        )
    orig_set = set(orig)
    keep_body = dict(PROFILE_ONE_WS_BODY)
    keep_body["marginal"] = {"residual": "park"}
    keep_body["description"] = (
        "FORGE TEST keep extras: Mon0 two ghostty shares, park residual. "
        "Not a personal layout."
    )
    keep_name = "_forge-test-one-ws-keep"
    keep_err = _try_layout(keep_name, keep_body)
    deadline = time.monotonic() + 12.0
    keep: dict[str, Any] = {}
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        keep = get_tree(bus)
        keep_ids = set(_win_ids(_tiles(keep)))
        try:
            missing = orig_set - keep_ids
            if missing:
                raise OracleError(
                    f"{story.id}: keep extras lost {sorted(missing)}; "
                    f"{_desk_report(keep)}"
                )
            last_err = None
            break
        except OracleError as e:
            last_err = e
            time.sleep(0.25)
    else:
        extra = f"; layout_cli={keep_err[:400]}" if keep_err else ""
        raise OracleError(f"{last_err}{extra}")
    for w in _tiles(keep):
        if node_id(w) in orig_set:
            assert_mode(w, "TILE", stage=story.id)
    # Same desk then close extras. Three identical ghosttys: extra is
    # whoever is not a claimed 2-role (not x-order third).
    close_err = _try_layout(
        PROFILE_ONE_WS,
        PROFILE_ONE_WS_BODY,
        extra_argv=("--clean", "--force"),
    )
    deadline = time.monotonic() + 12.0
    closed: dict[str, Any] = {}
    last_err = None
    while time.monotonic() < deadline:
        closed = get_tree(bus)
        closed_ids = set(_win_ids(_tiles(closed)))
        try:
            gone = orig_set - closed_ids
            kept = orig_set & closed_ids
            if len(gone) != 1:
                raise OracleError(
                    f"{story.id}: close extras want 1 extra gone have gone="
                    f"{sorted(gone)} kept={sorted(kept)}; {_desk_report(closed)}"
                )
            if len(kept) != 2:
                raise OracleError(
                    f"{story.id}: close extras lost desired have="
                    f"{sorted(kept)}; {_desk_report(closed)}"
                )
            assert_who_sits_where(closed, "H(A,B)", monitor=0, stage=story.id)
            last_err = None
            break
        except OracleError as e:
            last_err = e
            time.sleep(0.25)
    else:
        extra = f"; layout_cli={close_err[:400]}" if close_err else ""
        raise OracleError(f"{last_err}{extra}")


def _body_layout_ws2_no_mutate(bus: str, story: Story) -> None:
    _apply_one_ws(bus)
    ws1 = get_tree(bus, workspace=0)
    snap = _ws_snap(ws1)
    if len(snap["ids"]) != 2:
        raise OracleError(
            f"{story.id}: WS1 Given want 2 TILE have={snap['ids']}; "
            f"{_desk_report(ws1)}"
        )
    switch_workspace(bus, 1)
    gui = _gui()
    _ensure_profile(PROFILE_ONE_WS, PROFILE_ONE_WS_BODY, env=gui)
    try:
        run_layout(PROFILE_ONE_WS, gui, timeout_s=180.0, workspace_1based=2)
    except CampaignError as e:
        if "timed out" in str(e):
            raise
    ws2 = _wait_half_pair(bus, stage=f"{story.id}/ws2", timeout_s=20.0, workspace=1)
    assert_who_sits_where(ws2, "H(A,B)", monitor=0, stage=f"{story.id}/ws2")
    ws2_ids = set(_win_ids(_ordered_tiles(ws2)))
    ws1_now = get_tree(bus, workspace=0)
    _assert_snap_same(snap, _ws_snap(ws1_now), stage=f"{story.id}/ws1")
    if ws2_ids & set(snap["ids"]):
        raise OracleError(
            f"{story.id}: WS2 reused WS1 ids {sorted(ws2_ids & set(snap['ids']))}"
        )
    if not ws2_ids:
        raise OracleError(f"{story.id}: WS2 empty after apply; {_desk_report(ws2)}")


def _class_has(win: Mapping[str, Any], needle: str) -> bool:
    return needle.lower() in node_wm_class(win).lower()


def _real_tiles_on_mon(forest: Mapping[str, Any], mon: int) -> list[dict[str, Any]]:
    return [w for w in tiled_on_mon(forest, mon) if not is_placeholder_win(w)]


def _assert_inkscape_ws2_forest(forest: Mapping[str, Any], *, stage: str) -> None:
    assert_no_placeholders(forest, stage=stage)
    m0 = _real_tiles_on_mon(forest, 0)
    ink = [w for w in m0 if _class_has(w, "inkscape")]
    floated = [f for f in float_windows(forest) if _class_has(f, "inkscape")]
    if not ink and not floated:
        raise OracleError(f"{stage}: Inkscape did not map")
    assert_who_sits_where(
        forest, "H(A,TAB(B,C))", monitor=1, stage=f"{stage}/mon1"
    )
    for w in _real_tiles_on_mon(forest, 1):
        assert_mode(w, "TILE", stage=stage)
    if floated:
        if ink:
            raise OracleError(f"{stage}: Inkscape FLOAT and TILE")
        assert_float_not_under_monitor(
            forest, stage=stage, wm_class="inkscape"
        )
        return
    if not ink:
        raise OracleError(f"{stage}: Inkscape did not map")
    ink_w = ink[0]
    assert_mode(ink_w, "TILE", stage=stage)
    bags = find_bag_groups(forest)
    in_tab = any(
        node_id(ink_w) in _win_ids(_bag_window_kids(b)) for b in bags
    )
    if in_tab:
        return
    got0 = monitor_shape(forest, 0)
    if got0 not in ("WINDOW", "H(WINDOW)", "V(WINDOW)"):
        raise OracleError(
            f"{stage}/mon0: shape {got0} != WINDOW; {_desk_report(forest, monitor=0)}"
        )
    panes0 = visible_panes(forest, monitor=0)
    if len(panes0) != 1 or node_id(panes0[0]) != node_id(ink_w):
        raise OracleError(
            f"{stage}/mon0: Inkscape not sole in-slot pane; "
            f"{_desk_report(forest, monitor=0)}"
        )
    work0 = workarea_of(forest, 0)
    wr = width_ratio(ink_w, work0)
    hr = height_ratio(ink_w, work0)
    if wr + 1e-9 < FULL_LO or hr + 1e-9 < FULL_LO:
        raise OracleError(
            f"{stage}/mon0: Inkscape stuck undersize TILE width_ratio={wr:.3f} "
            f"height_ratio={hr:.3f}; {_desk_report(forest, monitor=0)}"
        )


def _body_settle_jitter_same_dest(bus: str, story: Story) -> None:
    forest = _apply_one_ws(bus)
    assert_who_sits_where(forest, "H(A,B)", monitor=0, stage=story.id)
    tiles = _ordered_tiles(forest)
    if len(tiles) != 2:
        raise OracleError(
            f"{story.id}: want 2 TILE have={_win_ids(tiles)}; {_desk_report(forest)}"
        )
    for w in tiles:
        assert_mode(w, "TILE", stage=story.id)
    if find_bag_groups(forest):
        raise OracleError(
            f"{story.id}: jitter invented TAB/STACK; {_desk_report(forest)}"
        )
    if float_windows(forest):
        raise OracleError(
            f"{story.id}: jitter FLOATed; {_desk_report(forest)}"
        )


def _body_layout_apply_inkscape_ws2(bus: str, story: Story) -> None:
    _require_monitors(bus, 2, stage=story.id)
    _apply_one_ws(bus)
    ws1 = get_tree(bus, workspace=0)
    snap = _ws_snap(ws1)
    if len(snap["ids"]) != 2:
        raise OracleError(
            f"{story.id}: WS1 Given want 2 TILE have={snap['ids']}; "
            f"{_desk_report(ws1)}"
        )
    switch_workspace(bus, 1)
    apply_err = _try_layout(
        PROFILE_INKSCAPE_WS2,
        PROFILE_INKSCAPE_WS2_BODY,
        workspace_1based=2,
    )
    deadline = time.monotonic() + 30.0
    last: dict[str, Any] = {}
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus, workspace=1)
        try:
            _assert_inkscape_ws2_forest(last, stage=story.id)
            last_err = None
            break
        except (OracleError, ShareError) as e:
            last_err = e
            time.sleep(0.25)
    else:
        extra0 = _desk_report(last, monitor=0) if last else "empty"
        extra1 = _desk_report(last, monitor=1) if last else "empty"
        cli = f"; layout_cli={apply_err[:400]}" if apply_err else ""
        if last_err is not None:
            raise OracleError(
                f"{last_err}; mon0={extra0} mon1={extra1}{cli}"
            )
        raise CampaignError(
            f"{story.id}: WS2 vinyl-shape did not settle "
            f"(mon0={extra0} mon1={extra1}{cli})"
        )
    ws2_ids = set(_win_ids(_tiles(last)))
    if ws2_ids & set(snap["ids"]):
        raise OracleError(
            f"{story.id}: WS2 reused WS1 ids {sorted(ws2_ids & set(snap['ids']))}"
        )
    ws1_now = get_tree(bus, workspace=0)
    _assert_snap_same(snap, _ws_snap(ws1_now), stage=f"{story.id}/ws1")


def _body_mark2_group_tab(bus: str, story: Story) -> None:
    _forest, a, b = _seed_two_slot(bus)
    a_id, b_id = node_id(a), node_id(b)
    _center_join(bus, a_id, b_id)
    _wait_tab_peers_fill_monitor(
        bus, a_id=a_id, b_id=b_id, stage=story.id, timeout_s=12.0
    )


def _body_mark2_move_swap(bus: str, story: Story) -> None:
    gui = _gui()
    _ensure_profile(PROFILE_THREE, PROFILE_THREE_BODY, env=gui)
    run_layout(PROFILE_THREE, gui, timeout_s=180.0, workspace_1based=1)
    forest = _wait_shape(bus, "H(A,B,C)", stage=f"{story.id}/given", timeout_s=16.0)
    ordered = _ordered_tiles(forest)
    if len(ordered) != 3:
        raise CampaignError(
            f"{story.id}: Given want 3 TILE have={_win_ids(ordered)}"
        )
    a_id, b_id, c_id = _win_ids(ordered)
    _focus_id(bus, a_id)
    invoke_on_bus(bus, "move.right", spec={"id": a_id, "activate": True})
    deadline = time.monotonic() + 10.0
    last = forest
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            assert_who_sits_where(last, "H(A,B,C)", monitor=0, stage=story.id)
            got = _win_ids(_ordered_tiles(last))
            if got != [b_id, a_id, c_id]:
                raise OracleError(
                    f"{story.id}: order {got} != [B,A,C] "
                    f"({b_id},{a_id},{c_id}); {_desk_report(last)}"
                )
            for w in _ordered_tiles(last):
                assert_mode(w, "TILE", stage=story.id)
            bags = find_bag_groups(last)
            if bags:
                raise OracleError(
                    f"{story.id}: Move invented a tab/stack; {_desk_report(last)}"
                )
            return
        except OracleError as e:
            last_err = e
            time.sleep(0.25)
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {_desk_report(last)}")
    raise CampaignError(f"{story.id}: swap did not settle")


def _wait_empty_mon_transfer(
    bus: str,
    story: Story,
    *,
    stay_id: str,
    moved_id: str,
    dest_mon: int,
    forest: Mapping[str, Any],
) -> None:
    src_mon = 1 - int(dest_mon)
    deadline = time.monotonic() + 12.0
    last = forest
    last_err: Optional[BaseException] = None
    while time.monotonic() < deadline:
        last = get_tree(bus)
        try:
            assert_who_sits_where(last, "WINDOW", monitor=src_mon, stage=story.id)
            assert_who_sits_where(last, "WINDOW", monitor=dest_mon, stage=story.id)
            src = tiled_on_mon(last, src_mon)
            dest = tiled_on_mon(last, dest_mon)
            if _win_ids(src) != [stay_id]:
                raise OracleError(
                    f"{story.id}: Mon{src_mon} ids {_win_ids(src)} != [{stay_id}]"
                )
            if _win_ids(dest) != [moved_id]:
                raise OracleError(
                    f"{story.id}: Mon{dest_mon} ids {_win_ids(dest)} != [{moved_id}]"
                )
            for w in src + dest:
                assert_mode(w, "TILE", stage=story.id)
            if any(node_id(f) == moved_id for f in float_windows(last)):
                raise OracleError(
                    f"{story.id}: moved FLOAT; {_desk_report(last, monitor=dest_mon)}"
                )
            if window_mon_index(last, moved_id) != dest_mon:
                raise OracleError(f"{story.id}: moved not on Mon{dest_mon}")
            return
        except OracleError as e:
            last_err = e
            time.sleep(0.25)
    extra = (
        f"mon0={_desk_report(last, monitor=0)} "
        f"mon1={_desk_report(last, monitor=1)}"
    )
    if last_err is not None:
        raise OracleError(f"{last_err}; actual {extra}")
    raise CampaignError(f"{story.id}: empty-mon transfer did not settle ({extra})")


def _body_move_empty_monitor(bus: str, story: Story) -> None:
    _require_monitors(bus, 2, stage=story.id)
    forest = _apply_one_ws(bus)
    assert_who_sits_where(forest, "H(A,B)", monitor=0, stage=f"{story.id}/given")
    if tiled_on_mon(forest, 1):
        raise OracleError(
            f"{story.id}: Mon1 not empty Given; {_desk_report(forest, monitor=1)}"
        )
    a, b = _ordered_tiles(forest)
    a_id, b_id = node_id(a), node_id(b)
    _focus_id(bus, a_id)
    _move_to_empty_monitor(bus, a_id, 1, stage=story.id)
    _wait_empty_mon_transfer(
        bus, story, stay_id=b_id, moved_id=a_id, dest_mon=1, forest=forest
    )


def _body_move_empty_monitor_reverse(bus: str, story: Story) -> None:
    _require_monitors(bus, 2, stage=story.id)
    forest = _apply_one_ws_mon1(bus)
    assert_who_sits_where(forest, "H(A,B)", monitor=1, stage=f"{story.id}/given")
    if tiled_on_mon(forest, 0):
        raise OracleError(
            f"{story.id}: Mon0 not empty Given; {_desk_report(forest, monitor=0)}"
        )
    a, b = sorted(
        tiled_on_mon(forest, 1),
        key=lambda w: (window_rect_x(w), node_id(w) or ""),
    )
    a_id, b_id = node_id(a), node_id(b)
    _focus_id(bus, a_id)
    _move_to_empty_monitor(bus, a_id, 0, stage=story.id)
    _wait_empty_mon_transfer(
        bus, story, stay_id=b_id, moved_id=a_id, dest_mon=0, forest=forest
    )


def _body_join_empty_monitor(bus: str, story: Story) -> None:
    _require_monitors(bus, 2, stage=story.id)
    forest = _apply_one_ws(bus)
    assert_who_sits_where(forest, "H(A,B)", monitor=0, stage=f"{story.id}/given-right")
    if tiled_on_mon(forest, 1):
        raise OracleError(
            f"{story.id}: Mon1 not empty Given; {_desk_report(forest, monitor=1)}"
        )
    a, b = _ordered_tiles(forest)
    a_id, b_id = node_id(a), node_id(b)
    _focus_id(bus, b_id)
    invoke_on_bus(bus, "join.right", spec={"id": b_id, "activate": True})
    _wait_empty_mon_transfer(
        bus, story, stay_id=a_id, moved_id=b_id, dest_mon=1, forest=forest
    )

    _clear_tiles(bus)
    forest = _apply_one_ws_mon1(bus)
    assert_who_sits_where(forest, "H(A,B)", monitor=1, stage=f"{story.id}/given-left")
    if tiled_on_mon(forest, 0):
        raise OracleError(
            f"{story.id}: Mon0 not empty Given; {_desk_report(forest, monitor=0)}"
        )
    a, b = sorted(
        tiled_on_mon(forest, 1),
        key=lambda w: (window_rect_x(w), node_id(w) or ""),
    )
    a_id, b_id = node_id(a), node_id(b)
    _focus_id(bus, a_id)
    invoke_on_bus(bus, "join.left", spec={"id": a_id, "activate": True})
    _wait_empty_mon_transfer(
        bus, story, stay_id=b_id, moved_id=a_id, dest_mon=0, forest=forest
    )


@story_runner(BVHNV_ID)
def run_launch_into_2slot(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_launch_into_2slot)


@story_runner("branch.open.launch-into-2slot-other-focus")
def run_launch_into_2slot_other_focus(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_launch_into_2slot_other_focus)


@story_runner("branch.open.second-on-empty")
def run_second_on_empty(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_second_on_empty)


@story_runner("branch.close.split-unit-peer")
def run_close_split_unit_peer(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_close_split_unit_peer)


@story_runner("branch.open.empty-head-dock")
def run_empty_head_dock(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_empty_head_dock)


@story_runner("leaf.open.pointer-on-tiled-stays-lft")
def run_pointer_on_tiled_stays_lft(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_pointer_on_tiled_stays_lft)


@story_runner("branch.open.launch-into-tab")
def run_launch_into_tab(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_launch_into_tab)


@story_runner("leaf.open.launch-next-to-tab-con")
def run_launch_next_to_tab_con(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_launch_next_to_tab_con)


@story_runner("trunk.close.three-equal-one-gone")
def run_close_three(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_close_three)


@story_runner("trunk.tabs.open-leaf-one-slot")
def run_tabs_open_leaf(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_tabs_open_leaf)


@story_runner("trunk.layout.apply-one-ws")
def run_layout_one_ws(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_layout_one_ws)


@story_runner("trunk.mark2.join-enter")
def run_mark2_join_enter(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_mark2_join_enter)


@story_runner("trunk.float.not-under-monitor")
def run_float_not_under_monitor(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_float_not_under_monitor)


@story_runner("branch.float.retile-into-tiles")
def run_float_retile_into_tiles(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_float_retile_into_tiles)


@story_runner("trunk.settle.visible-group-ready")
def run_settle_visible(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_settle_visible)


@story_runner("branch.settle.buried-peer-background")
def run_settle_buried_peer_background(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_settle_buried_peer_background)


@story_runner("branch.tabs.stacked-same-slot")
def run_tabs_stacked(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_tabs_stacked)


@story_runner("branch.tabs.reveal-no-shrink")
def run_tabs_reveal_no_shrink(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_tabs_reveal_no_shrink)


@story_runner("branch.layout.ws2-no-mutate-ws1")
def run_layout_ws2_no_mutate(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_layout_ws2_no_mutate)


@story_runner("branch.layout.missing-roles-open")
def run_layout_missing_roles(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_layout_missing_roles)


@story_runner("branch.layout.extras-policy")
def run_layout_extras_policy(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_layout_extras_policy)


@story_runner("branch.mark2.group-tab")
def run_mark2_group_tab(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_mark2_group_tab)


@story_runner("branch.mark2.join-flatten")
def run_mark2_join_flatten(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_mark2_join_flatten)


@story_runner("branch.mark2.move-swap")
def run_mark2_move_swap(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_mark2_move_swap)


@story_runner("leaf.mark2.move-empty-monitor")
def run_move_empty_monitor(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_move_empty_monitor)


@story_runner("leaf.mark2.move-empty-monitor-reverse")
def run_move_empty_monitor_reverse(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_move_empty_monitor_reverse)


@story_runner("leaf.mark2.join-empty-monitor")
def run_join_empty_monitor(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_join_empty_monitor)


@story_runner("leaf.mark2.pointer-center-group")
def run_pointer_center_group(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_mark2_group_tab)


@story_runner("leaf.layout.apply-tab-open-leaf")
def run_layout_apply_tab_open_leaf(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_layout_apply_tab_open_leaf)


@story_runner("leaf.layout.apply-inkscape-ws2")
def run_layout_apply_inkscape_ws2(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_layout_apply_inkscape_ws2)


@story_runner("leaf.settle.jitter-same-dest")
def run_settle_jitter_same_dest(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_settle_jitter_same_dest)


@story_runner("leaf.settle.visible-first-open")
def run_settle_visible_first_open(story: Story, args: Any, nest_name: str) -> int:
    return _run_body(story, _body_settle_visible_first_open)


def run_ids(ids: Sequence[str]) -> int:
    rc_out = 0
    for sid in ids:
        story = STORY_BY_ID.get(sid)
        fn = STORY_RUNNERS.get(sid)
        if story is None or fn is None:
            print(f"forge-test nested: unimplemented {sid}", file=sys.stderr)
            return 1
        print(f"story {sid}", file=sys.stderr)
        case_rc = int(fn(story, argparse.Namespace(), "forge"))
        print(f"story {sid} rc={case_rc}", file=sys.stderr)
        if case_rc != 0:
            return case_rc
        rc_out = case_rc
    return rc_out


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_argv(argv)
    ids = parse_ids(args.ids) or list(TRUNK_IDS)
    if args.dry_run:
        payload = {
            "ok": True,
            "dryRun": True,
            "ids": ids,
            "registered": [
                i for i in (*TRUNK_IDS, *REWRITE_IDS) if i in STORY_RUNNERS
            ],
        }
        if args.json_out:
            print(json.dumps(payload, indent=2))
        else:
            print("nest story bodies (dry-run)")
            for sid in payload["registered"]:
                print(f"  {sid}  status=ready")
        return 0
    return run_ids(ids)


if __name__ == "__main__":
    raise SystemExit(main())
