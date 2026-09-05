#!/usr/bin/env python3
"""Nest smoke: close 1 of 3 TILEs → siblings fill ~1/2; tab group ~1/2.

Operator daily check (HANDOFF / tab-share-close-reflow). Use via:

  ./install --dev && ./scripts/forge/forge-test nested smoke-close-reflow
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

from nest_invoke import (  # noqa: E402
    InvokeError,
    _gui_env,
    build_dnd_drop_js,
    close_window_id,
    dnd_token_to_selector,
    find_bag_groups,
    get_tree,
    invoke_on_bus,
    parse_invoke_result,
    require_nest_client_env,
    tiled_windows,
    window_rect_x,
)
from nest_layout_dnd_smoke import (  # noqa: E402
    CampaignError,
    assert_forest_oracles,
    is_placeholder_win,
    is_tile_win,
)
from nest_layout_ws_campaign import (  # noqa: E402
    ghostty_argv,
    seed_ghostty_tiles,
)
from nest_log_query import (  # noqa: E402
    LogQueryError,
    query_records,
    record_blob,
    records_since,
    snapshot_keys,
)
from nest_proof import (  # noqa: E402
    THIRD_HI,
    THIRD_LO,
    ShareError,
    assert_no_placeholders,
    assert_revealed_matches_bag,
    assert_seed_three,
    assert_siblings_fill_half,
    assert_slot_not_third,
    assert_split_percents_half,
    in_band,
    monitor_rect,
    width_ratio,
    window_rect,
)

VERSION = "1"
ENTRY = "./scripts/forge/forge-test nested smoke-close-reflow"
SEED_N = 3
CLOSE_HUNT_GREP = r"forgetHostWindow|repairSharesAfterChildChange|window-destroy"
CAMPAIGN_STEPS = (
    "Seed 3 ghostty TILEs on one MONITOR HSPLIT",
    "CTS0: three kids (percent sum ~1; widths ~1/3 recorded)",
    "Close one TILE (sessionApi _closeOp)",
    "CTS close: id gone; percent≈0.5; rect.width ≈ half (fail stuck ~1/3); "
    "hunt forgetHost/repairShares; no forge-ph",
    "CENTER-join the two survivors → TABBED (dnd-drop, else toggleTabStack)",
    "CTS tab: dbus-focus sibling; Meta/rect not ~1/3 (pair slot ≥ ~1/2)",
)


def smoke_script_path() -> Path:
    return Path(__file__).resolve()


def smoke_script_argv() -> list[str]:
    return [sys.executable, str(smoke_script_path())]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="nest_close_reflow_smoke.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=(
            "Seed 3 ghostty TILEs, close one, assert remaining pair fills "
            "~1/2 (not stuck ~1/3). Stage 2: CENTER-join the two survivors "
            "→ TABBED; assert tab Meta/rect is not stuck ~1/3."
        ),
        epilog=(
            f"Entry (always stops):\n  {ENTRY}\n"
            "Requires nest client env (private XDG_RUNTIME_DIR). Default 1 mon.\n"
            "Stage 2 joins the two half-width survivors (inventory). "
            "A leftover 1/3 percent paints the revealed tab at ~1/3.\n"
            "Exit: 0 ok; 1 CTS fail; 2 not in nest env; 127 missing binary."
        ),
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    p.add_argument("--dry-run", action="store_true", help="Print plan; no Shell")
    p.add_argument("--json", dest="json_out", action="store_true")
    p.add_argument(
        "--skip-tab-share",
        action="store_true",
        help="Only run close-reflow (stage 1)",
    )
    return p


def parse_argv(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    return build_parser().parse_args(list(argv) if argv is not None else None)


def campaign_plan(args: argparse.Namespace) -> dict[str, Any]:
    steps = list(CAMPAIGN_STEPS)
    if getattr(args, "skip_tab_share", False):
        steps = [s for s in steps if "CENTER" not in s and "CTS tab" not in s]
    return {
        "ok": True,
        "dryRun": True,
        "seed": SEED_N,
        "monitors": 1,
        "entry": ENTRY,
        "skipTabShare": bool(getattr(args, "skip_tab_share", False)),
        "logQuery": "plog-query forgetHostWindow|repairSharesAfterChildChange|window-destroy",
        "steps": steps,
    }


def _tiles(bus_address: str) -> list[dict[str, Any]]:
    return [
        w
        for w in tiled_windows(get_tree(bus_address))
        if is_tile_win(w) and not is_placeholder_win(w)
    ]


def _ids(wins: Mapping[str, Any] | list[dict[str, Any]]) -> list[str]:
    if isinstance(wins, dict):
        seq = _tiles_from_forest(wins)
    else:
        seq = list(wins)
    out: list[str] = []
    for w in seq:
        wid = w.get("windowId")
        if wid is not None and str(wid):
            out.append(str(wid))
    return out


def _tiles_from_forest(forest: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [
        w
        for w in tiled_windows(forest)
        if is_tile_win(w) and not is_placeholder_win(w)
    ]


def _mon_or_default(forest: Mapping[str, Any], fallback: Mapping[str, float]) -> dict[str, float]:
    mon = monitor_rect(forest, 0)
    if mon["width"] <= 0:
        return {
            "x": float(fallback.get("x") or 0),
            "y": float(fallback.get("y") or 0),
            "width": float(fallback.get("width") or 1920),
            "height": float(fallback.get("height") or 1080),
        }
    return mon


def _wait_count(bus_address: str, want: int, *, timeout_s: float = 12.0) -> list[dict[str, Any]]:
    deadline = time.monotonic() + timeout_s
    last: list[dict[str, Any]] = []
    while time.monotonic() < deadline:
        last = _tiles(bus_address)
        if len(last) == want:
            return last
        time.sleep(0.25)
    raise CampaignError(
        f"wait TILE count={want} have={len(last)} ids={_ids(last)}"
    )


def _bag_window_kids(bag: Mapping[str, Any]) -> list[dict[str, Any]]:
    kids = bag.get("children") or bag.get("childNodes") or []
    out: list[dict[str, Any]] = []
    if not isinstance(kids, list):
        return out
    for c in kids:
        if not isinstance(c, dict):
            continue
        if str(c.get("nodeType") or c.get("type") or "").upper() == "WINDOW":
            out.append(c)
    return out


def _revealed_kid(bag: Mapping[str, Any], kids: Sequence[Mapping[str, Any]]) -> Mapping[str, Any]:
    if not kids:
        raise CampaignError("tab-share: bag has no WINDOW kids")
    ltf = bag.get("lastTabFocusId")
    if ltf:
        hit = next((c for c in kids if str(c.get("windowId") or "") == str(ltf)), None)
        if hit is not None:
            return hit
    return kids[0]


def hunt_close_tokens(
    *,
    env: Mapping[str, str],
    before_keys: Optional[Sequence[str]] = None,
) -> dict[str, Any]:
    """Best-effort plog-query; missing tape is not a CTS fail."""
    try:
        recs = query_records(grep=CLOSE_HUNT_GREP, last=80, env=env)
    except LogQueryError as e:
        return {"ok": True, "skipped": True, "reason": str(e), "hits": []}
    if before_keys:
        recs = records_since(before_keys, recs)
    blobs = [record_blob(r) for r in recs]
    return {
        "ok": True,
        "skipped": False,
        "n": len(recs),
        "hits": [b[:200] for b in blobs[:12]],
        "forgetHost": any("forgetHost" in b for b in blobs),
        "repairShares": any("repairShares" in b for b in blobs),
        "windowDestroy": any("window-destroy" in b for b in blobs),
    }


def _wait_fill_half(
    bus_address: str,
    *,
    closed_id: str,
    mon: Mapping[str, float],
    timeout_s: float = 10.0,
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    deadline = time.monotonic() + timeout_s
    last_err: Optional[BaseException] = None
    forest: dict[str, Any] = {}
    after: list[dict[str, Any]] = []
    while time.monotonic() < deadline:
        forest = get_tree(bus_address)
        after = _tiles_from_forest(forest)
        try:
            fill = assert_siblings_fill_half(
                after,
                _mon_or_default(forest, mon),
                stage="close-reflow",
                closed_id=closed_id,
            )
            fill["percents"] = assert_split_percents_half(
                forest, stage="close-reflow"
            )
            return fill, forest, after
        except ShareError as e:
            last_err = e
            time.sleep(0.25)
    if last_err is not None:
        raise last_err
    raise CampaignError("close-reflow: pair did not settle to ~1/2")


def _center_join_survivors(
    bus: str,
    forest: Mapping[str, Any],
    src_id: str,
    dest_id: str,
) -> str:
    """CENTER dnd, then toggleTabStack if commit refuses."""
    from nested_wayland import shell_eval

    spec = {
        "tile": dnd_token_to_selector(f"id:{src_id}", forest),
        "onto": dnd_token_to_selector(f"id:{dest_id}", forest),
        "zone": "CENTER",
        "quiet": True,
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


def _tab_oracle(
    stage: str,
    bag: Mapping[str, Any],
    kid: Mapping[str, Any],
    mon: Mapping[str, float],
) -> dict[str, float]:
    # Forest GetTree leaves CON.rect null; kid Meta/rect is the user invert.
    ratios = assert_revealed_matches_bag(kid, bag, mon, stage=stage)
    wr = assert_slot_not_third(kid, mon, stage=stage)
    ratios["slot"] = wr
    bag_wr = width_ratio(bag, mon)
    if bag_wr > 0 and in_band(bag_wr, THIRD_LO, THIRD_HI):
        raise ShareError(
            f"{stage}: tab bag stuck ~1/3 width_ratio={bag_wr:.3f}"
        )
    return ratios


def run_campaign(args: argparse.Namespace) -> dict[str, Any]:
    env = os.environ
    try:
        require_nest_client_env(env, what="close-reflow")
    except InvokeError as e:
        raise CampaignError(str(e), exit_code=int(getattr(e, "exit_code", 2) or 2)) from e
    bus = str(env.get("DBUS_SESSION_BUS_ADDRESS") or "").strip()
    if not bus:
        raise CampaignError("missing DBUS_SESSION_BUS_ADDRESS", exit_code=2)
    gui = _gui_env(env)
    gt = ghostty_argv()
    if not gt:
        raise CampaignError("missing ghostty on PATH", exit_code=127)

    seed_ghostty_tiles(bus, gui, SEED_N)
    before = _wait_count(bus, SEED_N)
    forest = get_tree(bus)
    assert_forest_oracles(forest, stage="seed-3")
    assert_no_placeholders(forest, stage="seed-3")
    mon = _mon_or_default(forest, {"width": 1920.0, "height": 1080.0})
    cts0 = assert_seed_three(before, mon, stage="seed-3")

    ordered = sorted(
        before, key=lambda w: (window_rect_x(w), str(w.get("windowId") or ""))
    )
    victim = ordered[-1]
    victim_id = str(victim.get("windowId") or "")
    before_keys = snapshot_keys(env=env)
    close_window_id(bus, victim_id)
    _wait_count(bus, 2, timeout_s=16.0)
    fill, forest, _after = _wait_fill_half(bus, closed_id=victim_id, mon=mon)
    assert_forest_oracles(forest, stage="after-close")
    assert_no_placeholders(forest, stage="after-close")
    hunt = hunt_close_tokens(env=env, before_keys=before_keys)

    payload: dict[str, Any] = {
        "ok": True,
        "closed": victim_id,
        "cts0": cts0,
        "fill": fill,
        "hunt": hunt,
        "tabShare": None,
    }
    if args.skip_tab_share:
        return payload

    now = _tiles_from_forest(forest)
    if len(now) != 2:
        raise CampaignError(f"tab-share: want 2 survivor TILEs (have {len(now)})")
    ordered = sorted(
        now, key=lambda w: (window_rect_x(w), str(w.get("windowId") or ""))
    )
    src_id = str(ordered[-1].get("windowId") or "")
    dest_id = str(ordered[0].get("windowId") or "")
    how = _center_join_survivors(bus, forest, src_id, dest_id)
    time.sleep(0.8)
    forest = get_tree(bus)
    assert_forest_oracles(forest, stage="tab-share")
    assert_no_placeholders(forest, stage="tab-share")
    bags = find_bag_groups(forest)
    if not bags:
        raise CampaignError(
            f"tab-share: {how} did not create TABBED/STACKED"
        )
    bag = bags[0]
    kids = _bag_window_kids(bag)
    if len(kids) < 2:
        raise CampaignError(f"tab-share: bag has {len(kids)} WINDOW kids")
    revealed = _revealed_kid(bag, kids)
    mon2 = _mon_or_default(forest, mon)
    wr = _tab_oracle("tab-share", bag, revealed, mon2)

    other = next(
        (
            c
            for c in kids
            if str(c.get("windowId") or "") != str(revealed.get("windowId") or "")
        ),
        None,
    )
    if other is not None:
        oid = str(other.get("windowId") or "")
        try:
            invoke_on_bus(
                bus,
                "focus.child",
                spec={"id": oid, "activate": True},
                timeout=8.0,
            )
        except InvokeError:
            invoke_on_bus(
                bus,
                "focus.right",
                spec={"id": oid, "activate": True},
                timeout=8.0,
            )
        time.sleep(0.6)
        forest = get_tree(bus)
        assert_forest_oracles(forest, stage="tab-click")
        assert_no_placeholders(forest, stage="tab-click")
        bags = find_bag_groups(forest)
        if bags:
            bag = bags[0]
            kids = _bag_window_kids(bag)
            revealed = _revealed_kid(bag, kids) if kids else revealed
            mon2 = _mon_or_default(forest, mon)
            wr = _tab_oracle("tab-click", bag, revealed, mon2)
    payload["tabShare"] = {
        "how": how,
        "bagKids": len(kids),
        "revealedId": str(revealed.get("windowId") or ""),
        "widthRatio": wr,
        "rect": window_rect(revealed),
    }
    return payload


def cmd_from_env(argv: Optional[list[str]] = None) -> int:
    args = parse_argv(argv)
    if args.dry_run:
        plan = campaign_plan(args)
        if args.json_out:
            print(json.dumps(plan, indent=2))
        else:
            print("nest close-reflow campaign (dry-run)")
            print(f"  seed:     {plan['seed']} ghostty TILEs")
            print(f"  monitors: {plan['monitors']}")
            print(f"  log:      {plan['logQuery']}")
            print("  steps:")
            for i, step in enumerate(plan["steps"], start=1):
                print(f"    {i}. {step}")
            print(f"  entry: {plan['entry']}")
        return 0
    try:
        payload = run_campaign(args)
    except ShareError as e:
        print(f"forge-test nest close-reflow: {e}", file=sys.stderr)
        return 1
    except CampaignError as e:
        print(f"forge-test nest close-reflow: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    except InvokeError as e:
        print(f"forge-test nest close-reflow: {e}", file=sys.stderr)
        return 1
    if args.json_out:
        print(json.dumps(payload, indent=2, default=str))
    else:
        fill = payload.get("fill") or {}
        print(
            f"close-reflow ok closed={payload.get('closed')} "
            f"axis={fill.get('axis')} tab={payload.get('tabShare') is not None}"
        )
    return 0


def main() -> int:
    return int(cmd_from_env())


if __name__ == "__main__":
    sys.exit(main())
