#!/usr/bin/env python3
"""Nest campaign: exercise move/resize across usual apps; summarize geom-epsilon.

D095 S1 measurement. Use via:
  ./install --dev && ./scripts/forge/forge-test nested smoke-geom-epsilon

Queries **nest** forge.jsonl only (FORGE_CONFIG_HOME sibling) — never host tape.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import time
from collections import Counter, defaultdict
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
    invoke_on_bus,
    tiled_windows,
    wait_window_count,
)
from nest_layout_dnd_smoke import (  # noqa: E402
    CampaignError,
    is_placeholder_win,
    is_tile_win,
    layout_failure_reason,
)
from nest_layout_ws_campaign import (  # noqa: E402
    ensure_test_profiles,
    ghostty_argv,
    run_layout,
    seed_ghostty_tiles,
)
from nest_log_query import (  # noqa: E402
    LogQueryError,
    nest_forge_log_paths,
    query_records,
    record_key,
    records_since,
    snapshot_keys,
    _payload,
)

VERSION = "1"
DEFAULT_PROFILE = "_forge-test-ghosttys"
ENTRY = (
    "./install --dev && ./scripts/forge/forge-test nested smoke-geom-epsilon"
)
# Multi-app churn uses nest client isolation (private XDG_RUNTIME_DIR).
# Prefer smoke-nest-apps for map proofs; this campaign stays ghostty-heavy
# for ε samples (fast, reliable) and may add apps later.
APP_LAUNCHERS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("ghostty", ("ghostty",)),
)


def smoke_script_path() -> Path:
    return Path(__file__).resolve()


def smoke_script_argv() -> list[str]:
    return [sys.executable, str(smoke_script_path())]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="nest_geom_epsilon_campaign.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=(
            "Nested Wayland geom-epsilon measurement: launch usual apps, "
            "layout/join/move/reset repeatedly, query nest geom-epsilon logs, "
            "recommend baseline ε = ceil(worst_settle_dMax * factor)."
        ),
        epilog=(
            f"Entry:\n  {ENTRY}\n"
            "Alias:\n  ./scripts/forge/forge-test nested smoke-geom-epsilon\n"
            "Exit: 0 ok (even if sparse samples); 1 campaign fail; "
            "2 not in nest; 127 missing tool."
        ),
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--json", dest="json_out", action="store_true")
    p.add_argument("--profile", default=DEFAULT_PROFILE)
    p.add_argument(
        "--factor",
        type=float,
        default=1.2,
        help="baseline = ceil(worst_dMax * factor) (default 1.2)",
    )
    p.add_argument("--rounds", type=int, default=3, help="layout/move rounds")
    p.add_argument("--settle-wait", type=float, default=0.45)
    return p


def _require_nest_env(env: Mapping[str, str]) -> None:
    if not str(env.get("FORGE_CONFIG_HOME") or "").strip():
        raise CampaignError(
            "not in nest env (missing FORGE_CONFIG_HOME). "
            "Use: forge-test nested smoke-geom-epsilon",
            exit_code=2,
        )
    bus = str(env.get("DBUS_SESSION_BUS_ADDRESS") or "").strip()
    if not bus:
        raise CampaignError("missing DBUS_SESSION_BUS_ADDRESS", exit_code=2)


def _forge_argv(env: Mapping[str, str]) -> list[str]:
    forge = shutil.which("forge", path=env.get("PATH"))
    if forge:
        return [forge]
    repo = _SCRIPT_DIR.parents[1]
    mjs = repo / "cli" / "forge.mjs"
    if mjs.is_file():
        return [sys.executable, str(mjs)]
    raise CampaignError("forge not on PATH", exit_code=127)


def _bus(env: Mapping[str, str]) -> str:
    return str(env.get("DBUS_SESSION_BUS_ADDRESS") or "")


def _which_first(names: Sequence[str]) -> Optional[str]:
    for n in names:
        p = shutil.which(n)
        if p:
            return p
    return None


def _launch_named(
    label: str,
    exes: Sequence[str],
    env: Mapping[str, str],
    bus: str,
    *,
    before_n: int,
) -> dict[str, Any]:
    exe = _which_first(exes)
    if not exe:
        return {"label": label, "ok": False, "reason": "missing-binary"}
    argv = [exe]
    if label == "ghostty":
        argv = ghostty_argv() or argv
    elif label == "nautilus":
        argv = [exe, "--new-window"]
    elif label == "chrome":
        argv = [exe, "--new-window"]
    gui = _gui_env(env)
    try:
        _launch_one(gui, argv, bus)
        wait_window_count(bus, before_n + 1, timeout_s=25.0)
        return {"label": label, "ok": True, "exe": exe}
    except Exception as e:  # noqa: BLE001 — campaign soft-skip
        return {"label": label, "ok": False, "reason": str(e)[:200], "exe": exe}


def _tile_count(bus: str) -> int:
    wins = [
        w
        for w in tiled_windows(get_tree(bus))
        if is_tile_win(w) and not is_placeholder_win(w)
    ]
    return len(wins)


def _invoke(bus: str, action: str, **extra: Any) -> dict[str, Any]:
    try:
        return invoke_on_bus(bus, action, spec=extra or None)
    except InvokeError as e:
        return {"ok": False, "error": str(e)}


def _run_steps(env: Mapping[str, str], steps: list[dict[str, Any]]) -> str:
    argv = [*_forge_argv(env), "run-steps", json.dumps(steps)]
    proc = subprocess.run(
        argv,
        env=dict(env),
        capture_output=True,
        text=True,
        timeout=60,
    )
    text = f"{proc.stdout or ''}\n{proc.stderr or ''}"
    if proc.returncode != 0:
        raise CampaignError(
            f"run-steps failed rc={proc.returncode}\n{text.strip()[-1500:]}"
        )
    return text


def _close_all_nest_tiles(bus: str) -> int:
    """Close every TILE in the nest tree (campaign cleanup)."""
    closed = 0
    for _ in range(12):
        wins = [
            w
            for w in tiled_windows(get_tree(bus))
            if is_tile_win(w)
            and not is_placeholder_win(w)
            and w.get("windowId") is not None
        ]
        if not wins:
            break
        for w in wins:
            try:
                close_window_id(bus, str(w.get("windowId")))
                closed += 1
            except Exception:  # noqa: BLE001
                pass
        time.sleep(0.25)
    return closed


def exercise_desk(
    env: Mapping[str, str],
    *,
    profile: str,
    rounds: int,
    settle_wait: float,
) -> dict[str, Any]:
    bus = _bus(env)
    # Refuse host desk — campaign must run under nest env only.
    if not str(env.get("FORGE_CONFIG_HOME") or "").strip():
        raise CampaignError("missing FORGE_CONFIG_HOME (not in nest)", exit_code=2)
    wd = str(env.get("WAYLAND_DISPLAY") or "")
    if wd and "forge" not in wd:
        raise CampaignError(
            f"refusing launch: WAYLAND_DISPLAY={wd!r} is host, not nest",
            exit_code=2,
        )

    ensure_test_profiles(env=env, profile_a=profile)
    launches: list[dict[str, Any]] = []
    actions: list[str] = []

    # 3 ghosttys → layout/move/size churn (nest-safe only).
    try:
        seed_ghostty_tiles(bus, env, 3)
        actions.append("seed-ghostty-3")
        launches.append({"label": "ghostty", "ok": True, "n": 3})
    except CampaignError as e:
        actions.append(f"seed-ghostty-fail:{e}")
        launches.append({"label": "ghostty", "ok": False, "reason": str(e)})

    for i in range(max(1, rounds)):
        try:
            run_layout(profile, env, timeout_s=120.0)
            actions.append(f"layout:{profile}:{i}")
        except CampaignError as e:
            actions.append(f"layout-fail:{i}:{e}")
        time.sleep(settle_wait)

        for act in ("toggleSplit", "join.right", "move.left", "move.right", "join.down"):
            r = _invoke(bus, act)
            actions.append(f"invoke:{act}:{i}:{'ok' if r.get('ok', True) else 'fail'}")
            time.sleep(settle_wait)

        for size_act in (
            "size.share",
            "size.shareSiblings",
            "size.shareSelfSiblingsParent",
        ):
            r = _invoke(bus, size_act)
            actions.append(
                f"invoke:{size_act}:{i}:{'ok' if r.get('ok', True) else 'fail'}"
            )
            time.sleep(settle_wait * 0.5)

        try:
            ids = [
                str(w.get("windowId"))
                for w in tiled_windows(get_tree(bus))
                if is_tile_win(w)
                and not is_placeholder_win(w)
                and w.get("windowId") is not None
            ][:2]
            if len(ids) == 2:
                _run_steps(
                    env,
                    [{"op": "size", "windowIds": ids, "shares": [0.35, 0.65]}],
                )
                actions.append(f"size-unequal:{i}")
                time.sleep(settle_wait)
                _run_steps(
                    env,
                    [{"op": "size", "windowIds": ids, "shares": [0.5, 0.5]}],
                )
                actions.append(f"size-equal:{i}")
        except CampaignError as e:
            actions.append(f"size-steps-fail:{i}:{e}")
        time.sleep(settle_wait)

        try:
            run_layout(profile, env, timeout_s=120.0)
            actions.append(f"layout-re:{profile}:{i}")
        except CampaignError as e:
            actions.append(f"layout-re-fail:{i}:{e}")
        time.sleep(settle_wait + 0.3)

    closed = _close_all_nest_tiles(bus)
    actions.append(f"cleanup-close-tiles:{closed}")

    return {
        "launches": launches,
        "actions": actions,
        "tilesEnd": _tile_count(bus),
        "closedTiles": closed,
    }


def _dmax_from_rec(rec: Mapping[str, Any]) -> Optional[float]:
    bag = _payload(rec)
    raw = bag.get("dMax")
    if raw is None:
        text = str(rec.get("text") or "")
        # title: geom-epsilon phase=… tag=… dMax=N
        if "dMax=" in text:
            try:
                raw = text.split("dMax=", 1)[1].split()[0]
            except IndexError:
                raw = None
    try:
        n = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(n) or n < 0:
        return None
    return n


# Residuals larger than this are layout/async misses, not ε-jitter.
OUTLIER_DMAX_PX = 64
# Floor until a host Chrome/YouTube campaign revises (historical 1–4px margin).
EPSILON_FLOOR_PX = 4


def summarize_epsilon(
    recs: Sequence[Mapping[str, Any]],
    *,
    factor: float,
    outlier_px: float = OUTLIER_DMAX_PX,
    floor_px: int = EPSILON_FLOOR_PX,
) -> dict[str, Any]:
    settle_all: list[dict[str, Any]] = []
    by_tag: Counter[str] = Counter()
    by_class: dict[str, list[float]] = defaultdict(list)
    all_dmax: list[float] = []

    for r in recs:
        text = str(r.get("text") or "")
        bag = _payload(r)
        if "geom-epsilon" not in text and "geom-epsilon" not in json.dumps(
            bag, default=str
        ):
            continue
        phase = str(bag.get("phase") or "")
        tag = str(bag.get("tag") or "-")
        wm = str(bag.get("wmClass") or "-")
        dmax = _dmax_from_rec(r)
        if dmax is None:
            continue
        all_dmax.append(dmax)
        by_tag[tag] += 1
        # Baseline uses **settled** observes only (immediate is async noise).
        if phase != "post-write-settle":
            continue
        if tag == "min-known":
            continue
        row = {
            "dMax": dmax,
            "tag": tag,
            "wmClass": wm,
            "phase": phase,
            "outlier": dmax > float(outlier_px),
        }
        settle_all.append(row)
        if not row["outlier"]:
            by_class[wm].append(dmax)

    in_band = [s for s in settle_all if not s["outlier"]]
    outliers = [s for s in settle_all if s["outlier"]]
    worst = max((s["dMax"] for s in in_band), default=None)
    recommended = None
    if worst is not None:
        recommended = max(int(floor_px), int(math.ceil(float(worst) * float(factor))))
    elif in_band or settle_all:
        # Perfect settle (all zeros) → keep floor.
        recommended = int(floor_px)

    class_worst = {k: max(vs) for k, vs in sorted(by_class.items()) if vs}
    return {
        "sampleCount": len(all_dmax),
        "settleCount": len(settle_all),
        "inBandCount": len(in_band),
        "outlierCount": len(outliers),
        "outlierPx": outlier_px,
        "floorPx": floor_px,
        "byTag": dict(by_tag),
        "worstSettleDMaxInBand": worst,
        "factor": factor,
        "recommendedEpsilonPx": recommended,
        "classWorstDMax": class_worst,
        "topSettle": sorted(settle_all, key=lambda s: -float(s["dMax"]))[:15],
        "formula": (
            f"max({floor_px}, ceil(worst_settle_in_band_dMax * {factor})); "
            f"settle only; exclude min-known; outlier if dMax>{outlier_px}"
        ),
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    env = os.environ
    if args.dry_run:
        plan = {
            "apps": [a[0] for a in APP_LAUNCHERS],
            "profile": args.profile,
            "rounds": args.rounds,
            "factor": args.factor,
            "entry": ENTRY,
        }
        print(json.dumps(plan, indent=2) if args.json_out else plan)
        return 0

    try:
        _require_nest_env(env)
    except CampaignError as e:
        print(f"FAIL: {e}", file=sys.stderr)
        return int(e.exit_code)

    log_path, jsonl_path = nest_forge_log_paths(env=env)
    before = snapshot_keys(
        query_records(env=env, grep="geom-epsilon", last=0)
    )

    try:
        desk = exercise_desk(
            env,
            profile=args.profile,
            rounds=int(args.rounds),
            settle_wait=float(args.settle_wait),
        )
    except CampaignError as e:
        print(f"FAIL: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)

    # Allow delayed settle samples to land.
    time.sleep(max(0.8, float(args.settle_wait) * 2))

    try:
        after = query_records(env=env, grep="geom-epsilon", last=0)
    except LogQueryError as e:
        print(f"FAIL: log query: {e}", file=sys.stderr)
        return int(e.exit_code)

    new_recs = records_since(before, after)
    summary = summarize_epsilon(new_recs, factor=float(args.factor))
    out = {
        "ok": True,
        "log": str(log_path) if log_path else None,
        "jsonl": str(jsonl_path) if jsonl_path else None,
        "desk": desk,
        "epsilon": summary,
    }

    if args.json_out:
        print(json.dumps(out, indent=2, default=str))
    else:
        print("geom-epsilon nest campaign")
        print(f"  nest log:  {log_path}")
        print(f"  nest jsonl:{jsonl_path}")
        print(f"  tiles end: {desk.get('tilesEnd')}")
        print(f"  launches:  {desk.get('launches')}")
        print(
            f"  samples:   {summary.get('sampleCount')} "
            f"(settle={summary.get('settleCount')} "
            f"inBand={summary.get('inBandCount')} "
            f"outliers={summary.get('outlierCount')})"
        )
        print(f"  byTag:     {summary.get('byTag')}")
        print(f"  worst in-band dMax: {summary.get('worstSettleDMaxInBand')}")
        print(f"  class max: {summary.get('classWorstDMax')}")
        print(f"  formula:   {summary.get('formula')}")
        print(
            f"  recommend: ε={summary.get('recommendedEpsilonPx')} px "
            f"(factor={summary.get('factor')} floor={summary.get('floorPx')})"
        )
        if summary.get("topSettle"):
            print("  top settle misses:")
            for row in summary["topSettle"][:8]:
                print(
                    f"    dMax={row['dMax']} tag={row['tag']} "
                    f"class={row['wmClass']} phase={row['phase']}"
                )
        if summary.get("recommendedEpsilonPx") is None:
            print(
                "  WARN: no geom-epsilon samples — tip may lack S1 logging "
                "or nest TRACE not loaded; check install --dev + restart",
                file=sys.stderr,
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
